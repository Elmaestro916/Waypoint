import { getCountry } from "../countries";
import { convert } from "../fx";
import { TtlCache } from "../security";
import type { Offer, SearchCtx, SearchSource } from "../types";

/**
 * Amazon Creators API (SearchItems), which replaced PA-API. Endpoint shape, auth and field paths follow
 * Amazon's published docs (checked October 2026): LwA client-credentials token, POST {base}/catalog/v1/searchItems,
 * price at offersV2.listings[0].price.money. Env: AMAZON_CREATORS_CLIENT_ID, AMAZON_CREATORS_CLIENT_SECRET,
 * AMAZON_PARTNER_TAG, AMAZON_CREATORS_BASE (override for tests), AMAZON_TOKEN_URL (override for tests).
 *
 * Amazon rules this adapter respects: results live in their own lane in the UI (never merged into comparison
 * groups with other stores), nothing is written to our database, results are cached in memory for at most 1 hour
 * (Amazon limits how long price data can be reused; confirm the current limit in your Associates agreement),
 * and the URL Amazon returns is used untouched. Creators API access needs an Associates account with qualifying sales.
 */
const base = () => process.env.AMAZON_CREATORS_BASE ?? "https://creatorsapi.amazon";
const MAX_CACHE_MS = 60 * 60_000;
const cache = new TtlCache<Offer[]>(300);
const tokens = new Map<string, { v: string; exp: number }>();

function tokenUrl(domain: string): string {
  if (process.env.AMAZON_TOKEN_URL) return process.env.AMAZON_TOKEN_URL;
  if (/\.(com|ca|com\.mx|com\.br)$/.test(domain)) return "https://api.amazon.com/auth/o2/token";
  if (/\.(co\.jp|com\.au|sg)$/.test(domain)) return "https://api.amazon.co.jp/auth/o2/token";
  return "https://api.amazon.co.uk/auth/o2/token"; // EU/IN/AE/EG/ZA region credentials
}

async function getToken(domain: string, signal: AbortSignal): Promise<string> {
  const url = tokenUrl(domain);
  const t = tokens.get(url);
  if (t && t.exp > Date.now() + 60_000) return t.v;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.AMAZON_CREATORS_CLIENT_ID,
      client_secret: process.env.AMAZON_CREATORS_CLIENT_SECRET,
      scope: "creatorsapi::default",
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Amazon token ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  tokens.set(url, { v: j.access_token, exp: Date.now() + j.expires_in * 1000 });
  return j.access_token;
}

interface AmzItem {
  asin: string; detailPageURL?: string;
  itemInfo?: { title?: { displayValue?: string }; byLineInfo?: { brand?: { displayValue?: string } } };
  images?: { primary?: { medium?: { url?: string } } };
  offersV2?: { listings?: { price?: { money?: { amount: number; currency: string } } }[] };
}

export const amazonSource: SearchSource = {
  id: "amazon",
  enabled: () => Boolean(process.env.AMAZON_CREATORS_CLIENT_ID && process.env.AMAZON_CREATORS_CLIENT_SECRET && process.env.AMAZON_PARTNER_TAG),
  skipReason(ctx) {
    return getCountry(ctx.country).amazonDomain ? null : `Amazon has no store for ${getCountry(ctx.country).name}`;
  },
  async search(ctx: SearchCtx): Promise<Offer[]> {
    const c = getCountry(ctx.country);
    if (!c.amazonDomain) return [];
    const key = JSON.stringify([ctx.q, c.code, ctx.min, ctx.max, ctx.condition]);
    const hit = cache.get(key);
    if (hit) return hit;

    const body: Record<string, unknown> = {
      partnerTag: process.env.AMAZON_PARTNER_TAG,
      keywords: ctx.q,
      marketplace: c.amazonDomain,
      itemCount: Math.min(ctx.limit, 10),
      resources: ["itemInfo.title", "itemInfo.byLineInfo", "images.primary.medium", "offersV2.listings.price"],
    };
    // The API takes prices in the marketplace's own currency (confirm minor/major units for your marketplace before relying on filters).
    if (ctx.min != null) body.minPrice = Math.round(convert(ctx.min, ctx.displayCurrency, c.currency, ctx.rates) * 100);
    if (ctx.max != null) body.maxPrice = Math.round(convert(ctx.max, ctx.displayCurrency, c.currency, ctx.rates) * 100);

    const res = await fetch(`${base()}/catalog/v1/searchItems`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await getToken(c.amazonDomain, ctx.signal)}`,
        "Content-Type": "application/json",
        "x-marketplace": c.amazonDomain,
      },
      body: JSON.stringify(body),
      signal: ctx.signal,
    });
    if (res.status === 429) throw new Error("Amazon rate limit reached");
    if (!res.ok) throw new Error(`Amazon search ${res.status}`);
    const j = (await res.json()) as { searchResult?: { items?: AmzItem[] } };
    const now = new Date().toISOString();
    const offers: Offer[] = [];
    for (const it of j.searchResult?.items ?? []) {
      const money = it.offersV2?.listings?.[0]?.price?.money;
      if (!money || !it.detailPageURL || !it.itemInfo?.title?.displayValue) continue;
      offers.push({
        key: `amazon:${it.asin}`,
        source: "amazon",
        retailerSlug: "amazon",
        retailerName: c.amazonDomain.replace("www.", ""),
        productId: null,
        title: it.itemInfo.title.displayValue,
        brand: it.itemInfo.byLineInfo?.brand?.displayValue ?? null,
        imageUrl: it.images?.primary?.medium?.url ?? null,
        price: money.amount,
        currency: money.currency,
        condition: "new",
        inStock: null,
        url: it.detailPageURL,
        rating: null,
        reviewCount: null,
        shipsTo: [c.code],
        fetchedAt: now,
        gtin: null,
        demo: false,
        affiliate: true,
      });
    }
    cache.set(key, offers, MAX_CACHE_MS);
    return offers;
  },
};
