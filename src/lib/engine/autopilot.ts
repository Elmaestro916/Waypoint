import { admin, check, countOf, unwrap, unwrapMaybe } from "../db";
import { providerFor } from "../amazon/provider";
import { estimateFees, marginPct, unitProfit } from "../amazon/fees";
import { analyzeOpportunities, seedKeywords, writeListing } from "../ai/claude";
import { guessCogs, competitionIndex, scoreItem } from "./scoring";
import { simulate } from "./montecarlo";
import { optimizeBids } from "./bandit";
import { marginFloor, reprice } from "./repricer";
import { isBlocked, log, monthAdSpend } from "./guardrails";
import { clamp, round2, safeJson, today } from "../util";
import type { AutopilotSettings, Campaign, Keyword, Opportunity, Product, Store } from "../types";

type FulfillmentT = "FBA" | "FBM";
type CampaignWithKeywords = Campaign & { keywords: Keyword[] };
type ProductWithCampaigns = Product & { campaigns: CampaignWithKeywords[] };

/**
 * The engine runs server-side with the service-role client (no user session exists in cron/worker),
 * so EVERY query below filters by userId. That filter is the tenant boundary here.
 */
async function ctx(userId: string) {
  const a = admin();
  const store = unwrapMaybe<Store>(await a.from("Store").select("*").eq("userId", userId).maybeSingle());
  const settings = unwrapMaybe<AutopilotSettings>(await a.from("AutopilotSettings").select("*").eq("userId", userId).maybeSingle());
  if (!settings) throw new Error("Autopilot settings missing");
  return { a, settings, provider: providerFor(store) };
}

// ------------------------------------------------------------------ 1. DISCOVER
export async function discover(userId: string) {
  const { a, settings, provider } = await ctx(userId);
  const niches = settings.niches.split(",").map((s) => s.trim()).filter(Boolean);
  let added = 0;

  for (const niche of niches) {
    const items = (await provider.searchCatalog(niche)).filter((i) => !isBlocked(`${i.title} ${i.category}`));
    const insights = await analyzeOpportunities(items);
    const byAsin = new Map(insights.map((x) => [x.asin, x]));

    for (const it of items) {
      const cogs = guessCogs(it.price);
      const score = scoreItem(it, cogs);
      const comp = competitionIndex(it);
      const margin = marginPct(it.price, cogs);
      const sim = simulate({
        price: it.price,
        cogs,
        monthlyUnits: it.estMonthlyUnits,
        competition: comp,
        targetAcos: settings.targetAcos,
        monthlyAdBudget: settings.monthlyAdBudget,
        launchCapital: cogs * 200,
        seed: 7,
      });
      const ai = byAsin.get(it.asin);
      const reasons: string[] = [];
      if (margin * 100 < settings.minMarginPct) reasons.push(`margin ${(margin * 100).toFixed(0)}% below your ${settings.minMarginPct}% floor`);
      if (sim.probLoss > settings.maxProbLoss) reasons.push(`simulated P(loss) ${(sim.probLoss * 100).toFixed(0)}% above your ${(settings.maxProbLoss * 100).toFixed(0)}% limit`);
      if (score < settings.minScore) reasons.push(`score ${score} below ${settings.minScore}`);
      if (ai?.verdict === "skip") reasons.push("AI flagged high risk");

      const data = {
        title: it.title,
        category: it.category,
        price: it.price,
        estCogs: cogs,
        estMonthlyUnits: it.estMonthlyUnits,
        competition: comp,
        score,
        angle: ai?.angle ?? "",
        rationale: ai?.rationale ?? "",
        risks: [ai?.risks, ...reasons].filter(Boolean).join(" | "),
        simJson: JSON.stringify(sim),
      };
      const existing = unwrapMaybe<Pick<Opportunity, "id">>(
        await a.from("Opportunity").select("id").eq("userId", userId).eq("asin", it.asin).maybeSingle(),
      );
      if (existing) {
        // refresh the numbers but keep the user's/engine's status decision
        check(await a.from("Opportunity").update(data).eq("id", existing.id).eq("userId", userId));
      } else {
        check(await a.from("Opportunity").insert({ ...data, userId, asin: it.asin, status: reasons.length ? "rejected" : "new" }));
        added++;
      }
    }
  }
  await log(userId, "discover", `Scanned ${niches.length} niches, found ${added} new opportunities`);
  return added;
}

// ------------------------------------------------------------------ 2. PREPARE / LAUNCH
export async function prepareProduct(userId: string, opportunityId: string): Promise<Product> {
  const { a, settings } = await ctx(userId);
  const opp = unwrap<Opportunity>(await a.from("Opportunity").select("*").eq("id", opportunityId).eq("userId", userId).single());
  const blocked = isBlocked(`${opp.title} ${opp.category}`);
  if (blocked) throw new Error(`Blocked category keyword: "${blocked}"`);

  const copy = await writeListing({ productName: opp.title, category: opp.category, angle: opp.angle, price: opp.price });
  const f: FulfillmentT = "FBA";
  const floor = Math.max(marginFloor(opp.estCogs, settings.minMarginPct, f), round2(opp.price * 0.8));
  const product = unwrap<Product>(
    await a
      .from("Product")
      .insert({
        userId,
        opportunityId: opp.id,
        sku: `AP-${opp.asin}-${Date.now().toString(36)}`.toUpperCase(),
        title: copy.title,
        bullets: JSON.stringify(copy.bullets),
        description: copy.description,
        keywords: JSON.stringify(copy.keywords),
        price: opp.price,
        minPrice: floor,
        maxPrice: round2(opp.price * 1.3),
        cogs: opp.estCogs,
        stock: 200,
        fulfillment: f,
        status: "pending_approval",
      })
      .select()
      .single(),
  );
  check(await a.from("Opportunity").update({ status: "queued" }).eq("id", opp.id).eq("userId", userId));
  await log(userId, "launch", `Prepared listing for "${opp.title}" (awaiting ${settings.approvalMode ? "your approval" : "auto-launch"})`);
  return product;
}

export async function launchProduct(userId: string, productId: string): Promise<Product> {
  const { a, settings, provider } = await ctx(userId);
  const p = unwrap<Product & { opportunity: { category: string } | null }>(
    await a.from("Product").select("*, opportunity:Opportunity(category)").eq("id", productId).eq("userId", userId).single(),
  );
  if (p.status === "live") return p;

  // hard caps: the engine can never exceed what the user authorised
  const live = unwrap<Product[]>(await a.from("Product").select("*").eq("userId", userId).eq("status", "live"));
  if (live.length >= settings.maxActiveProducts) throw new Error(`Max active products (${settings.maxActiveProducts}) reached`);
  const committed = live.reduce((s, x) => s + x.cogs * x.stock, 0);
  const need = p.cogs * p.stock;
  if (committed + need > settings.maxLaunchBudget) {
    throw new Error(`Launch would commit $${round2(committed + need)} of inventory, above your $${settings.maxLaunchBudget} cap`);
  }

  const { asin } = await provider.putListing({
    sku: p.sku,
    title: p.title,
    bullets: safeJson<string[]>(p.bullets, []),
    description: p.description,
    keywords: safeJson<string[]>(p.keywords, []),
    price: p.price,
    quantity: p.stock,
    category: p.opportunity?.category ?? "general",
  });

  const kwTexts = await seedKeywords({ title: p.title, keywords: safeJson<string[]>(p.keywords, []) });
  const dailyBudget = round2(clamp(settings.monthlyAdBudget / 30 / Math.max(live.length + 1, 1), 2, 100));
  const startBid = round2(clamp(p.price * 0.03, 0.3, 1.2));
  const camp = await provider.createCampaign({
    name: `AP | ${p.sku}`,
    sku: p.sku,
    dailyBudget,
    keywords: kwTexts.map((t) => ({ text: t, matchType: "EXACT" as const, bid: startBid })),
  });

  const campaign = unwrap<Pick<Campaign, "id">>(
    await a
      .from("Campaign")
      .insert({
        userId,
        productId: p.id,
        externalId: camp.campaignId,
        name: `AP | ${p.sku}`,
        dailyBudget,
        lastSyncAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(), // first sync back-fills a day of data
      })
      .select("id")
      .single(),
  );
  check(await a.from("Keyword").insert(kwTexts.map((text) => ({ campaignId: campaign.id, text, matchType: "EXACT", bid: startBid }))));

  const updated = unwrap<Product>(
    await a.from("Product").update({ status: "live", asin: asin ?? p.asin }).eq("id", p.id).eq("userId", userId).select().single(),
  );
  if (p.opportunityId) check(await a.from("Opportunity").update({ status: "launched" }).eq("id", p.opportunityId).eq("userId", userId));
  await log(userId, "launch", `Launched "${p.title}" at $${p.price} with ${kwTexts.length} keywords, $${dailyBudget}/day`);
  return updated;
}

// ------------------------------------------------------------------ 3. OPTIMIZE LOOP
export async function optimizeUser(userId: string) {
  const { a, settings, provider } = await ctx(userId);
  const now = new Date();
  const products = unwrap<ProductWithCampaigns[]>(
    await a.from("Product").select("*, campaigns:Campaign(*, keywords:Keyword(*))").eq("userId", userId).eq("status", "live"),
  );
  const overBudget = (await monthAdSpend(userId)) >= settings.monthlyAdBudget;

  for (const p of products) {
    for (const c of p.campaigns) {
      if (c.status !== "active") continue; // paused campaigns neither spend nor get re-bid
      const from = new Date(c.lastSyncAt);
      const hours = (now.getTime() - from.getTime()) / 3.6e6;
      if (hours < 1 || !c.externalId) continue;

      let rows = await provider.getKeywordReport(c.externalId, from, now, {
        price: p.price,
        keywords: c.keywords.map((k) => ({ text: k.text, matchType: k.matchType, bid: k.bid })),
      });
      // Amazon enforces daily budgets itself; the simulator does not, so cap it here.
      if (provider.name === "mock") {
        const cap = (c.dailyBudget * Math.min(hours, 72)) / 24;
        const total = rows.reduce((s, r) => s + r.spend, 0);
        if (total > cap && total > 0) {
          const f = cap / total;
          rows = rows.map((r) => ({
            ...r,
            spend: round2(r.spend * f),
            sales: round2(r.sales * f),
            clicks: Math.floor(r.clicks * f),
            orders: Math.round(r.orders * f),
            impressions: Math.floor(r.impressions * f),
          }));
        }
      }

      // Counters are bumped inside Postgres (see add_* functions) so overlapping runs cannot lose updates.
      for (const r of rows) {
        const k = c.keywords.find((x) => x.text === r.text && x.matchType === r.matchType);
        if (!k) continue;
        check(
          await a.rpc("add_keyword_stats", {
            p_id: k.id,
            p_impressions: r.impressions,
            p_clicks: r.clicks,
            p_orders: r.orders,
            p_spend: r.spend,
            p_sales: r.sales,
          }),
        );
      }
      const tot = rows.reduce(
        (t, r) => ({ spend: t.spend + r.spend, sales: t.sales + r.sales, clicks: t.clicks + r.clicks, orders: t.orders + r.orders, imps: t.imps + r.impressions }),
        { spend: 0, sales: 0, clicks: 0, orders: 0, imps: 0 },
      );
      check(
        await a.rpc("add_campaign_stats", {
          p_id: c.id,
          p_impressions: tot.imps,
          p_clicks: tot.clicks,
          p_orders: tot.orders,
          p_spend: tot.spend,
          p_sales: tot.sales,
          p_synced: now.toISOString(),
        }),
      );

      // total sales (organic + ad) and profit accounting
      const sales = (await provider.getSales([p.sku], from, now, { [p.sku]: p.price }))[0] ?? { units: 0, revenue: 0 };
      const units = Math.max(sales.units, tot.orders);
      const revenue = Math.max(sales.revenue, tot.sales);
      const fees = units * estimateFees(p.price, p.fulfillment).total;
      const cogs = units * p.cogs;
      const profit = revenue - tot.spend - fees - cogs;
      check(
        await a.rpc("add_daily_metric", {
          p_user: userId,
          p_date: today(),
          p_revenue: revenue,
          p_ad_spend: tot.spend,
          p_cogs: cogs,
          p_fees: fees,
          p_units: Math.round(units),
          p_profit: profit,
        }),
      );
      check(await a.rpc("take_stock", { p_id: p.id, p_units: Math.round(units) }));

      // bandit bid optimisation on fresh cumulative stats
      const fresh = unwrap<Keyword[]>(await a.from("Keyword").select("*").eq("campaignId", c.id));
      const decisions = optimizeBids(
        fresh.map((k) => ({ text: k.text, matchType: k.matchType, bid: k.bid, state: k.state, clicks: k.clicks, orders: k.orders, spend: k.spend, sales: k.sales })),
        { price: p.price, unitProfit: unitProfit(p.price, p.cogs, p.fulfillment), targetAcos: settings.targetAcos },
      );
      let changed = 0;
      for (const d of decisions) {
        const k = fresh.find((x) => x.text === d.text && x.matchType === d.matchType);
        if (!k || k.state === "PAUSED") continue;
        if (Math.abs(k.bid - d.bid) > 0.005 || k.state !== d.state) {
          changed++;
          check(await a.from("Keyword").update({ bid: d.bid, state: d.state }).eq("id", k.id));
          if (d.state === "PAUSED") await log(userId, "bid", `Paused "${d.text}" on ${p.title}: ${d.reason}`);
        }
      }
      if (changed) {
        const latest = unwrap<Keyword[]>(await a.from("Keyword").select("*").eq("campaignId", c.id));
        await provider.updateBids(c.externalId, latest.map((k) => ({ text: k.text, matchType: k.matchType, bid: k.bid, state: k.state })));
        await log(userId, "bid", `Re-bid ${changed} keywords on ${p.title}`);
      }

      if (overBudget) {
        check(await a.from("Campaign").update({ status: "paused" }).eq("id", c.id).eq("userId", userId));
        await log(userId, "guardrail", `Monthly ad budget $${settings.monthlyAdBudget} reached: paused campaign for ${p.title}`);
      }
    }

    // repricing
    const fresh = unwrap<Product>(await a.from("Product").select("*").eq("id", p.id).eq("userId", userId).single());
    const bb = await provider.getBuyBoxPrice(fresh.sku, fresh.asin);
    const res = reprice({
      price: fresh.price,
      cogs: fresh.cogs,
      minPrice: fresh.minPrice,
      maxPrice: fresh.maxPrice,
      stock: fresh.stock,
      buyBox: bb,
      minMarginPct: settings.minMarginPct,
      fulfillment: fresh.fulfillment,
    });
    if (res) {
      await provider.setPrice(fresh.sku, res.price);
      check(await a.from("Product").update({ price: res.price }).eq("id", fresh.id).eq("userId", userId));
      await log(userId, "reprice", `${fresh.title}: $${fresh.price} -> $${res.price} (${res.reason})`);
    }

    // auto-pause products that bleed money after enough data (re-read: the sums above just changed)
    const camps = unwrap<Pick<Campaign, "spend" | "sales">[]>(await a.from("Campaign").select("spend,sales").eq("productId", p.id).eq("userId", userId));
    const spent = camps.reduce((s, c) => s + c.spend, 0);
    const sold = camps.reduce((s, c) => s + c.sales, 0);
    if (spent > 60 && sold > 0 && spent / sold > 0.8) {
      check(await a.from("Product").update({ status: "paused" }).eq("id", p.id).eq("userId", userId));
      check(await a.from("Campaign").update({ status: "paused" }).eq("productId", p.id).eq("userId", userId));
      await log(userId, "guardrail", `Paused ${p.title}: ACoS ${Math.round((spent / sold) * 100)}% after $${round2(spent)} spend`);
    }
  }
}

// ------------------------------------------------------------------ 4. FULL CYCLE
export async function runCycle(userId: string) {
  const { a, settings } = await ctx(userId);
  try {
    await optimizeUser(userId);

    if (settings.enabled) {
      const live = countOf(await a.from("Product").select("id", { count: "exact", head: true }).eq("userId", userId).eq("status", "live"));
      const pending = countOf(await a.from("Product").select("id", { count: "exact", head: true }).eq("userId", userId).eq("status", "pending_approval"));
      if (live + pending < settings.maxActiveProducts) {
        const topNew = async () =>
          unwrap<Opportunity[]>(await a.from("Opportunity").select("*").eq("userId", userId).eq("status", "new").order("score", { ascending: false }).limit(3));
        let open = await topNew();
        if (open.length === 0) {
          await discover(userId);
          open = await topNew();
        }
        const slots = settings.maxActiveProducts - live - pending;
        for (const o of open.slice(0, slots)) {
          const prod = await prepareProduct(userId, o.id);
          if (!settings.approvalMode) {
            try {
              await launchProduct(userId, prod.id);
            } catch (e) {
              await log(userId, "guardrail", `Auto-launch blocked: ${(e as Error).message}`);
            }
          }
        }
      }
    }
    check(await a.from("AutopilotSettings").update({ lastRunAt: new Date().toISOString() }).eq("userId", userId));
  } catch (e) {
    await log(userId, "error", (e as Error).message);
    throw e;
  }
}
