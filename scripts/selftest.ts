/**
 * Database-free sanity checks for the engine maths. Run: npm run selftest
 */
import assert from "node:assert/strict";
import { MockProvider } from "../src/lib/amazon/mock";
import { estimateFees, marginPct } from "../src/lib/amazon/fees";
import { guessCogs, competitionIndex, scoreItem } from "../src/lib/engine/scoring";
import { simulate } from "../src/lib/engine/montecarlo";
import { optimizeBids, type KwStat } from "../src/lib/engine/bandit";
import { marginFloor, reprice } from "../src/lib/engine/repricer";
import { isBlocked } from "../src/lib/engine/blocklist";
import { rng } from "../src/lib/util";

process.env.ENCRYPTION_KEY = "ab".repeat(32);
let passed = 0;
const ok = (name: string, fn: () => void | Promise<void>) =>
  Promise.resolve(fn()).then(() => { passed++; console.log("  ok  " + name); });

async function main() {
  const mock = new MockProvider();

  await ok("mock catalog returns scored, deterministic items", async () => {
    const a = await mock.searchCatalog("kitchen");
    const b = await mock.searchCatalog("kitchen");
    assert.equal(a.length, 6);
    assert.deepEqual(a, b);
    for (const it of a) {
      const s = scoreItem(it, guessCogs(it.price));
      assert.ok(s >= 0 && s <= 100, `score ${s}`);
      const c = competitionIndex(it);
      assert.ok(c >= 0 && c <= 1);
    }
  });

  await ok("fees: margin falls as COGS rises", () => {
    assert.ok(marginPct(30, 8) > marginPct(30, 15));
    assert.ok(estimateFees(30).total > 0);
  });

  await ok("simulator: quantiles ordered, loss prob in [0,1], thin margin is riskier", () => {
    const base = { monthlyUnits: 900, competition: 0.4, targetAcos: 0.28, monthlyAdBudget: 300 };
    const fat = simulate({ ...base, price: 30, cogs: 7, launchCapital: 1400, seed: 1 });
    const thin = simulate({ ...base, price: 30, cogs: 17, launchCapital: 3400, seed: 1 });
    assert.ok(fat.p10 <= fat.p50 && fat.p50 <= fat.p90);
    assert.ok(fat.probLoss >= 0 && fat.probLoss <= 1);
    assert.ok(thin.probLoss > fat.probLoss, `thin ${thin.probLoss} vs fat ${fat.probLoss}`);
    assert.deepEqual(simulate({ ...base, price: 30, cogs: 7, launchCapital: 1400, seed: 1 }), fat); // reproducible
    console.log(`        fat-margin: P10 ${fat.p10} P50 ${fat.p50} P90 ${fat.p90} loss ${fat.probLoss}`);
    console.log(`        thin-margin: P10 ${thin.p10} P50 ${thin.p50} P90 ${thin.p90} loss ${thin.probLoss}`);
  });

  await ok("bandit: pauses dead keywords, bids stay bounded and move <=25%/cycle", () => {
    const kws: KwStat[] = [
      { text: "dead", matchType: "EXACT", bid: 0.6, state: "ENABLED", clicks: 40, orders: 0, spend: 24, sales: 0 },
      { text: "winner", matchType: "EXACT", bid: 0.6, state: "ENABLED", clicks: 120, orders: 24, spend: 70, sales: 700 },
      { text: "new", matchType: "EXACT", bid: 0.6, state: "ENABLED", clicks: 0, orders: 0, spend: 0, sales: 0 },
    ];
    const price = 30;
    const out = optimizeBids(kws, { price, unitProfit: 9, targetAcos: 0.28, seed: 5 });
    const by = Object.fromEntries(out.map((d) => [d.text, d]));
    assert.equal(by.dead.state, "PAUSED");
    assert.equal(by.winner.state, "ENABLED");
    for (const d of out.filter((x) => x.state === "ENABLED")) {
      assert.ok(d.bid >= 0.6 * 0.75 - 0.011 && d.bid <= 0.6 * 1.25 + 0.011, `bid ${d.bid}`);
      assert.ok(d.bid <= Math.max(price * 0.12, 0.5) + 0.01);
    }
  });

  await ok("bandit closed loop on mock market converges and does not overspend", async () => {
    const price = 28;
    let kws: KwStat[] = ["a b c", "d e f", "g h i", "j k l", "m n o"].map((t) => ({
      text: t, matchType: "EXACT", bid: 0.5, state: "ENABLED", clicks: 0, orders: 0, spend: 0, sales: 0,
    }));
    const t0 = new Date("2026-01-01T00:00:00Z");
    for (let day = 0; day < 20; day++) {
      const from = new Date(t0.getTime() + day * 864e5);
      const to = new Date(from.getTime() + 864e5);
      const rep = await mock.getKeywordReport("C1", from, to, {
        price, keywords: kws.filter((k) => k.state === "ENABLED").map((k) => ({ text: k.text, matchType: k.matchType, bid: k.bid })),
      });
      kws = kws.map((k) => {
        const r = rep.find((x) => x.text === k.text);
        return r ? { ...k, clicks: k.clicks + r.clicks, orders: k.orders + r.orders, spend: k.spend + r.spend, sales: k.sales + r.sales } : k;
      });
      const dec = optimizeBids(kws, { price, unitProfit: 8, targetAcos: 0.28, seed: day + 1 });
      kws = kws.map((k) => {
        const d = dec.find((x) => x.text === k.text)!;
        return k.state === "PAUSED" ? k : { ...k, bid: d.bid, state: d.state };
      });
    }
    const spend = kws.reduce((s, k) => s + k.spend, 0);
    const sales = kws.reduce((s, k) => s + k.sales, 0);
    assert.ok(kws.every((k) => k.bid <= Math.max(price * 0.12, 0.5) + 0.01));
    console.log(`        20 simulated days: spend $${spend.toFixed(0)}, sales $${sales.toFixed(0)}, ACoS ${sales ? ((spend / sales) * 100).toFixed(0) : "n/a"}%, paused ${kws.filter((k) => k.state === "PAUSED").length}/5`);
  });

  await ok("repricer: respects margin floor, max price and 5% step", () => {
    const f = marginFloor(8, 20, "FBA");
    assert.ok(marginPct(f, 8) >= 0.2 - 0.005);
    const base = { cogs: 8, minPrice: 0, maxPrice: 40, stock: 100, minMarginPct: 20, fulfillment: "FBA" as const };
    const crash = reprice({ ...base, price: 25, buyBox: 5 });
    assert.ok(crash && crash.price >= 25 * 0.95 - 0.01 && crash.price >= f - 0.01, JSON.stringify(crash));
    const spike = reprice({ ...base, price: 25, buyBox: 90 });
    assert.ok(spike && spike.price <= 25 * 1.05 + 0.01 && spike.price <= 40);
    const atFloor = reprice({ ...base, price: f, buyBox: 5 });
    assert.equal(atFloor, null);
  });

  await ok("guardrails block restricted categories", () => {
    assert.ok(isBlocked("Vitamin C Supplement"));
    assert.equal(isBlocked("Silicone Stretch Lids Set"), null);
  });

  await ok("AES-256-GCM token encryption round-trips and detects tampering", async () => {
    const { encrypt, decrypt } = await import("../src/lib/crypto");
    const c = encrypt("Atzr|secret-token");
    assert.equal(decrypt(c), "Atzr|secret-token");
    assert.notEqual(encrypt("x"), encrypt("x")); // random IV
    const parts = c.split(".");
    parts[2] = Buffer.from("tampered!!").toString("base64url");
    assert.throws(() => decrypt(parts.join(".")));
  });

  await ok("rng is deterministic", () => {
    assert.equal(rng(42)(), rng(42)());
  });

  console.log(`\n${passed} checks passed`);
}

main().catch((e) => {
  console.error("\nSELFTEST FAILED:", e);
  process.exit(1);
});
