import { getCountry } from "../countries";
import { convert } from "../fx";
import { TtlCache } from "../security";
import type { Condition, Offer, SearchCtx, SearchSource } from "../types";

/**
 * eBay Browse API (item_summary/search). Auth is the application OAuth token (client credentials).
 * When EBAY_CAMPAIGN_ID is set, the affiliate header makes eBay return `itemAffiliateWebUrl`, which we use as-is.
 * Env: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_CAMPAIGN_ID (optional), EBAY_API_BASE (override, used by tests).
 */
const base = () => process.env.EBAY_API_BASE ?? "https://api.ebay.com";
let token: { v: string; exp: number } | null = null;
const cache = new TtlCache<Offer[]>(300);

async function getToken(signal: AbortSignal): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.v;
  const basic = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${base()}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
    signal,
  });
  if (!res.ok) throw new Error(`eBay token ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { v: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.v;
}

interface EbayItem {
  itemId: string; title: string; price?: { value: string; currency: string }; image?: { imageUrl: string };
  itemWebUrl?: string; itemAffiliateWebUrl?: string; condition?: string; gtin?: string; epid?: string;
  seller?: { feedbackPercentage?: string; feedbackScore?: number };
}

const cond = (c?: string): Condition => {
  const s = (c ?? "").toLowerCase();
  if (s.includes("refurb")) return "refurbished";
  if (s.includes("used") || s.includes("pre-owned") || s.includes("parts")) return "used";
  if (s.includes("new")) return "new";
  return "unknown";
};

export const ebaySource: SearchSource = {
  id: "ebay",
  enabled: () => Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET),
  async search(ctx: SearchCtx): Promise<Offer[]> {
    const c = getCountry(ctx.country);
    const cacheKey = JSON.stringify([ctx.q, ctx.country, ctx.min, ctx.max, ctx.condition, ctx.displayCurrency]);
    const hit = cache.get(cacheKey);
    if (hit) return hit;

    const filters = [`deliveryCountry:${c.code}`, "buyingOptions:{FIXED_PRICE}"];
    const lo = ctx.min != null ? convert(ctx.min, ctx.displayCurrency, c.ebayCurrency, ctx.rates) : NaN;
    const hi = ctx.max != null ? convert(ctx.max, ctx.displayCurrency, c.ebayCurrency, ctx.rates) : NaN;
    if (Number.isFinite(lo) || Number.isFinite(hi)) {
      filters.push(`price:[${Number.isFinite(lo) ? lo.toFixed(2) : ""}..${Number.isFinite(hi) ? hi.toFixed(2) : ""}]`, `priceCurrency:${c.ebayCurrency}`);
    }
    if (ctx.condition === "new") filters.push("conditions:{NEW}");
    if (ctx.condition === "used") filters.push("conditions:{USED}");

    const url = `${base()}/buy/browse/v1/item_summary/search?` + new URLSearchParams({ q: ctx.q, limit: String(Math.min(ctx.limit, 50)), filter: filters.join(",") });
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await getToken(ctx.signal)}`,
      "X-EBAY-C-MARKETPLACE-ID": c.ebayMarketplace,
    };
    if (process.env.EBAY_CAMPAIGN_ID) {
      headers["X-EBAY-C-ENDUSERCTX"] = `affiliateCampaignId=${process.env.EBAY_CAMPAIGN_ID},affiliateReferenceId=${ctx.sessionRef ?? "web"}`;
    }
    const res = await fetch(url, { headers, signal: ctx.signal });
    if (res.status === 401) token = null;
    if (!res.ok) throw new Error(`eBay search ${res.status}`);
    const j = (await res.json()) as { itemSummaries?: EbayItem[] };
    const now = new Date().toISOString();
    const offers: Offer[] = [];
    for (const it of j.itemSummaries ?? []) {
      const price = Number(it.price?.value);
      const dest = it.itemAffiliateWebUrl ?? it.itemWebUrl;
      if (!Number.isFinite(price) || !dest || !it.price) continue;
      offers.push({
        key: `ebay:${it.itemId}`,
        source: "ebay",
        retailerSlug: "ebay",
        retailerName: "eBay",
        productId: null,
        title: it.title,
        brand: null,
        imageUrl: it.image?.imageUrl ?? null,
        price,
        currency: it.price.currency,
        condition: cond(it.condition),
        inStock: true,
        url: dest,
        rating: null,
        reviewCount: null,
        shipsTo: [c.code],
        fetchedAt: now,
        gtin: it.gtin ?? null,
        demo: false,
        affiliate: Boolean(it.itemAffiliateWebUrl),
      });
    }
    cache.set(cacheKey, offers, 5 * 60_000);
    return offers;
  },
};

export function __resetEbay() {
  token = null;
}
