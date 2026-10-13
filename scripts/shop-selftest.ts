import http from "http";
import assert from "assert";
import { parseQueryHeuristic, buildTsQuery, tokenize } from "../src/lib/shop/query";
import { convert, fallbackRates } from "../src/lib/shop/fx";
import { signClick, verifyClick, rateLimit, safeUrl } from "../src/lib/shop/security";
import { groupOffers, relevant } from "../src/lib/shop/rank";
import { buildLinkOutUrl } from "../src/lib/shop/sources/linkout";
import { parseCsv, csvToFeedRow, dedupeKey, rowProblem, slugify } from "../src/lib/shop/ingest";
import type { Offer, SearchCtx } from "../src/lib/shop/types";

const rates = fallbackRates();
const mk = (o: Partial<Offer>): Offer => ({
  key: "k", source: "catalog", retailerSlug: "r", retailerName: "R", productId: null, title: "t", brand: null, imageUrl: null,
  price: 10, currency: "USD", condition: "new", inStock: true, url: "https://x.test/", rating: null, reviewCount: null,
  shipsTo: null, fetchedAt: "", gtin: null, demo: false, affiliate: false, ...o,
});
const ctx = (extra: Partial<SearchCtx> = {}): SearchCtx => ({
  q: "running shoes", tokens: ["running", "shoes"], country: "US", displayCurrency: "USD", rates, limit: 10,
  signal: AbortSignal.timeout(3000), ...extra,
});

async function main() {
  // query parsing
  let p = parseQueryHeuristic("I want cheap Nike running shoes under $80", ["Nike", "Adidas"]);
  assert.equal(p.maxPrice, 80); assert.equal(p.budgetCurrency, "USD"); assert.equal(p.brand, "Nike");
  assert.equal(p.keywords, "Nike running shoes");
  p = parseQueryHeuristic("used iphone between 200 and 400");
  assert.equal(p.condition, "used"); assert.equal(p.minPrice, 200); assert.equal(p.maxPrice, 400);
  p = parseQueryHeuristic("laptop under 1.5k");
  assert.equal(p.maxPrice, 1500);
  assert.equal(buildTsQuery(tokenize("a; drop table--x'")), "drop:* & table:*");
  // injection: only letters/digits survive tokenize
  assert.ok(!/[;'-]/.test(buildTsQuery(tokenize("a; drop table--x'")).replace(/ & /g, "").replace(/:\*/g, "")));

  // fx
  assert.equal(convert(100, "USD", "USD", rates), 100);
  assert.ok(Math.abs(convert(1550, "NGN", "USD", rates) - 1) < 1e-9);
  assert.ok(Number.isNaN(convert(1, "XXX", "USD", rates)));

  // click tokens
  const base = { k: "catalog:1", r: "jumia", s: "catalog", p: null, n: 1, a: 9.5, c: "USD", q: "x", co: "NG" };
  const t = signClick(base);
  assert.equal(verifyClick(t)?.k, "catalog:1");
  assert.equal(verifyClick(t.slice(0, -2) + "xx"), null);
  assert.equal(verifyClick(signClick(base, -10)), null);
  assert.equal(verifyClick("garbage"), null);

  // rate limit + urls
  assert.ok(rateLimit("a", 2, 1000)); assert.ok(rateLimit("a", 2, 1000)); assert.ok(!rateLimit("a", 2, 1000));
  assert.equal(safeUrl("javascript:alert(1)"), null);
  const lo = new URL(buildLinkOutUrl("https://s.test/search?q={q}", "red shoes & more", "aff=7")!);
  assert.equal(lo.searchParams.get("q"), "red shoes & more"); assert.equal(lo.searchParams.get("aff"), "7");
  assert.equal(buildLinkOutUrl("https://s.test/search", "x"), null);

  // grouping: same gtin merges across stores/currencies; unrelated stays separate; amazon-like unknown currency dropped
  const g = groupOffers(
    [
      mk({ key: "a", gtin: "123", title: "Nike Pegasus running shoes", price: 80, retailerSlug: "s1" }),
      mk({ key: "b", gtin: "123", title: "Nike Pegasus running shoes", price: 62000, currency: "NGN", retailerSlug: "s2" }),
      mk({ key: "c", title: "Trail running shoes", price: 50 }),
      mk({ key: "d", title: "Running shoes mystery", price: 5, currency: "XXX" }),
    ],
    ["running", "shoes"], "USD", rates
  );
  assert.equal(g.length, 2);
  const nike = g.find((x) => x.id === "gtin:123")!;
  assert.equal(nike.offers.length, 2);
  assert.equal(nike.best.key, "b"); // 62000 NGN = $40 < $80
  assert.equal(relevant(g, ["running", "shoes", "waterproof", "zzz", "qqq"]).length, 0);

  // ingest
  const csv = 'retailer,externalId,gtin,brand,title,price,currency,url,shipsTo\r\nshopA,1,0123456789012,Acme,"Acme ""Pro"", 12 in",19.99,usd,https://a.test/1,NG|GH\nshopA,2,,Acme,Bad,x,USD,ftp://a.test,\n';
  const rowsCsv = parseCsv(csv).map(csvToFeedRow);
  assert.equal(rowsCsv.length, 2); assert.equal(rowsCsv[0].title, 'Acme "Pro", 12 in'); assert.equal(rowsCsv[0].currency, "USD");
  assert.deepEqual(rowsCsv[0].shipsTo, ["NG", "GH"]); assert.equal(rowProblem(rowsCsv[0]), null); assert.ok(rowProblem(rowsCsv[1]));
  assert.equal(dedupeKey({ gtin: "0123-4567-89012", title: "x" }), "gtin:0123456789012");
  assert.equal(dedupeKey({ brand: "Acme Co", title: "Pro  Shoe!" }), "t:acme-co|pro shoe");
  assert.equal(slugify("Café Déjà"), "cafe-deja");

  // ---- mock servers for live adapters ----
  const seen: { url: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ url: req.url ?? "", headers: req.headers, body });
      res.setHeader("content-type", "application/json");
      const u = req.url ?? "";
      if (u.startsWith("/identity/v1/oauth2/token")) return void res.end(JSON.stringify({ access_token: "ebay-tok", expires_in: 7200 }));
      if (u.startsWith("/buy/browse")) {
        return void res.end(JSON.stringify({ itemSummaries: [
          { itemId: "v1|1|0", title: "Nike shoes", price: { value: "55.00", currency: "USD" }, image: { imageUrl: "https://i.test/a.jpg" }, itemWebUrl: "https://ebay.test/plain", itemAffiliateWebUrl: "https://ebay.test/aff", condition: "New" },
          { itemId: "v1|2|0", title: "bad", price: { value: "abc", currency: "USD" }, itemWebUrl: "https://ebay.test/x" },
        ] }));
      }
      if (u === "/amz-token") return void res.end(JSON.stringify({ access_token: "amz-tok", expires_in: 3600 }));
      if (u === "/catalog/v1/searchItems") {
        return void res.end(JSON.stringify({ searchResult: { items: [
          { asin: "B0TEST", detailPageURL: "https://www.amazon.com/dp/B0TEST?tag=t-20", itemInfo: { title: { displayValue: "Amazon shoe" }, byLineInfo: { brand: { displayValue: "Acme" } } }, images: { primary: { medium: { url: "https://m.test/i.jpg" } } }, offersV2: { listings: [{ price: { money: { amount: 49.99, currency: "USD" } } }] } },
          { asin: "NOPRICE", detailPageURL: "https://www.amazon.com/dp/NOPRICE", itemInfo: { title: { displayValue: "No price" } } },
        ] } }));
      }
      if (u === "/shopify") {
        return void res.end(JSON.stringify({ result: { structuredContent: { products: [
          { id: "gid://shopify/p/abc", title: "Indie shoe", url: "https://indie.test/p/1", media: [{ url: "https://c.test/1.jpg" }], variants: [{ id: "v", price: { amount: 8999, currency: "USD" }, availability: { available: true }, seller: { name: "Indie Co" } }] },
        ] } } }));
      }
      res.statusCode = 404; res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;

  process.env.EBAY_API_BASE = origin; process.env.EBAY_CLIENT_ID = "id"; process.env.EBAY_CLIENT_SECRET = "sec"; process.env.EBAY_CAMPAIGN_ID = "999";
  const { ebaySource } = await import("../src/lib/shop/sources/ebay");
  const e = await ebaySource.search(ctx({ min: 10, max: 100, condition: "new" }));
  assert.equal(e.length, 1); assert.equal(e[0].url, "https://ebay.test/aff"); assert.equal(e[0].affiliate, true); assert.equal(e[0].price, 55);
  const call = seen.find((s) => s.url.startsWith("/buy/browse"))!;
  assert.match(decodeURIComponent(call.url), /deliveryCountry:US/);
  assert.match(decodeURIComponent(call.url), /price:\[10.00\.\.100.00\]/);
  assert.match(decodeURIComponent(call.url), /conditions:\{NEW\}/);
  assert.equal(call.headers.authorization, "Bearer ebay-tok");
  assert.match(String(call.headers["x-ebay-c-endusermctx"] ?? call.headers["x-ebay-c-enduserctx"]), /affiliateCampaignId=999/);

  process.env.AMAZON_CREATORS_BASE = origin; process.env.AMAZON_TOKEN_URL = `${origin}/amz-token`;
  process.env.AMAZON_CREATORS_CLIENT_ID = "c"; process.env.AMAZON_CREATORS_CLIENT_SECRET = "s"; process.env.AMAZON_PARTNER_TAG = "t-20";
  const { amazonSource } = await import("../src/lib/shop/sources/amazon");
  const a = await amazonSource.search(ctx());
  assert.equal(a.length, 1); assert.equal(a[0].price, 49.99); assert.equal(a[0].url, "https://www.amazon.com/dp/B0TEST?tag=t-20");
  const ac = seen.find((s) => s.url === "/catalog/v1/searchItems")!;
  assert.equal(ac.headers["x-marketplace"], "www.amazon.com"); assert.equal(JSON.parse(ac.body).partnerTag, "t-20");
  assert.ok(amazonSource.skipReason!(ctx({ country: "NG" }))); // no Amazon store in Nigeria
  const before = seen.length; await amazonSource.search(ctx()); assert.equal(seen.length, before); // cached

  process.env.SHOPIFY_CATALOG_URL = `${origin}/shopify`; process.env.SHOPIFY_AGENT_PROFILE_URL = "https://me.test/profile.json";
  const { shopifySource } = await import("../src/lib/shop/sources/shopify");
  const s = await shopifySource.search(ctx({ max: 120 }));
  assert.equal(s.length, 1); assert.equal(s[0].price, 89.99); assert.equal(s[0].retailerName, "Indie Co"); assert.equal(s[0].url, "https://indie.test/p/1");
  const sc = JSON.parse(seen.filter((x) => x.url === "/shopify")[0].body);
  assert.equal(sc.params.name, "search_catalog"); assert.equal(sc.params.arguments.catalog.filters.price.max, 12000);
  const n = seen.length; await shopifySource.search(ctx({ max: 120 })); assert.equal(seen.length, n + 1); // never cached

  server.close();
  console.log("Shop selftest passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
