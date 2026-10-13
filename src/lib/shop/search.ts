import { admin, check, unwrap } from "@/lib/db";
import { getCountry } from "./countries";
import { convert, getRates } from "./fx";
import { parseQuery, tokenize } from "./query";
import { groupOffers, relevant, sortGroups } from "./rank";
import { TtlCache, safeUrl, sessionHash, withTimeout } from "./security";
import { amazonSource } from "./sources/amazon";
import { catalogSource } from "./sources/catalog";
import { ebaySource } from "./sources/ebay";
import { linkOutsFor } from "./sources/linkout";
import { shopifySource } from "./sources/shopify";
import type { Offer, SearchCtx, SearchParams, SearchResult, SearchSource, SourceStatus } from "./types";

export const PAGE_SIZE = 24;
const CATALOG_TIMEOUT_MS = 4000;
const LIVE_TIMEOUT_MS = 2500; // slow live stores never hold up the fast results
const resultCache = new TtlCache<SearchResult>(400);
const RESULT_TTL_MS = 60_000;
const SOURCES: SearchSource[] = [catalogSource, ebaySource, shopifySource, amazonSource];

export async function runSearch(
  p: SearchParams,
  opts: { sources?: SearchSource[]; log?: boolean; session?: { ip: string; ua: string }; knownBrands?: string[] } = {}
): Promise<SearchResult> {
  const t0 = Date.now();
  const country = getCountry(p.country);
  // Identical searches within a minute share one result (prices don't change faster than that).
  const cacheKey = opts.sources ? null : JSON.stringify([p.q.trim().toLowerCase(), country.code, p.min, p.max, p.condition, p.brandSlug, p.categorySlug, p.sort, p.page]);
  const cached = cacheKey ? resultCache.get(cacheKey) : undefined;
  if (cached) {
    if (opts.log !== false) void logSearch(p.q.trim().toLowerCase(), country.code, cached.total + cached.amazon.length, 0, cached.status, opts.session);
    return { ...cached, latencyMs: Date.now() - t0 };
  }
  const rates = await getRates();
  const parsed = await parseQuery(p.q, opts.knownBrands ?? []);
  const tokens = tokenize(parsed.keywords || p.q);
  // Link-out buttons load in parallel with the store searches and are skipped if the database is slow.
  const linkOutsPromise = tokens.length ? withTimeout(linkOutsFor(parsed.keywords || p.q, country.code), 1000, []) : Promise.resolve([]);

  // A budget typed in a currency symbol is converted into the display currency; bare numbers are in the display currency.
  const toDisplay = (v?: number) =>
    v == null ? undefined : parsed.budgetCurrency ? convert(v, parsed.budgetCurrency, country.currency, rates) : v;
  const min = p.min ?? toDisplay(parsed.minPrice);
  const max = p.max ?? toDisplay(parsed.maxPrice);
  const condition = p.condition ?? parsed.condition;

  const base: Omit<SearchCtx, "signal"> = {
    q: parsed.keywords || p.q,
    tokens,
    country: country.code,
    displayCurrency: country.currency,
    rates,
    min: Number.isFinite(min) ? min : undefined,
    max: Number.isFinite(max) ? max : undefined,
    condition,
    brandSlug: p.brandSlug,
    categorySlug: p.categorySlug,
    limit: 40,
    sessionRef: opts.session ? sessionHash(opts.session.ip, opts.session.ua).slice(0, 12) : undefined,
  };

  const status: Record<string, SourceStatus> = {};
  const wanted = (opts.sources ?? SOURCES).filter((s) => !p.retailers?.length || p.retailers.includes(s.id) || s.id === "catalog");
  const results = await Promise.all(
    wanted.map(async (s): Promise<Offer[]> => {
      const start = Date.now();
      if (!s.enabled()) {
        status[s.id] = { status: "disabled", ms: 0, count: 0 };
        return [];
      }
      const skip = s.skipReason?.({ ...base, signal: AbortSignal.timeout(1) });
      if (skip) {
        status[s.id] = { status: "skipped", ms: 0, count: 0, note: skip };
        return [];
      }
      try {
        const offers = await s.search({ ...base, signal: AbortSignal.timeout(s.id === "catalog" ? CATALOG_TIMEOUT_MS : LIVE_TIMEOUT_MS) });
        status[s.id] = { status: "ok", ms: Date.now() - start, count: offers.length };
        return offers;
      } catch (e) {
        status[s.id] = { status: "error", ms: Date.now() - start, count: 0, note: (e as Error).message.slice(0, 160) };
        return [];
      }
    })
  );

  // Every outbound link and image from any source must be a plain http(s) URL.
  const all = results
    .flat()
    .map((o) => ({ ...o, url: safeUrl(o.url) ?? "", imageUrl: safeUrl(o.imageUrl) }))
    .filter((o) => o.price > 0 && o.url !== "");
  const amazon = all
    .filter((o) => o.source === "amazon")
    .map((o) => ({ o, d: convert(o.price, o.currency, country.currency, rates) }))
    .filter((x) => Number.isFinite(x.d))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.o)
    .slice(0, 6);

  const groups = sortGroups(
    relevant(groupOffers(all.filter((o) => o.source !== "amazon"), tokens, country.currency, rates), tokens),
    p.sort ?? "relevance"
  );
  const page = Math.max(1, p.page ?? 1);
  const linkOuts = await linkOutsPromise;

  const result: SearchResult = {
    parsed,
    groups: groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    amazon,
    linkOuts,
    status,
    rates,
    displayCurrency: country.currency,
    country: country.code,
    total: groups.length,
    page,
    pageSize: PAGE_SIZE,
    latencyMs: Date.now() - t0,
    hasDemo: all.some((o) => o.demo),
  };

  const anyError = Object.values(status).some((x) => x.status === "error");
  if (cacheKey && !anyError) resultCache.set(cacheKey, result, RESULT_TTL_MS); // never cache a degraded result
  if (opts.log !== false && tokens.length) void logSearch(base.q, country.code, groups.length + amazon.length, result.latencyMs, status, opts.session);
  return result;
}

async function logSearch(q: string, country: string, n: number, ms: number, status: Record<string, SourceStatus>, s?: { ip: string; ua: string }) {
  try {
    check(
      await admin().from("SearchEvent").insert({
        query: q.slice(0, 200),
        country,
        resultCount: n,
        latencyMs: ms,
        sources: status,
        sessionHash: s ? sessionHash(s.ip, s.ua) : null,
      })
    );
  } catch {
    // analytics must never break a search
  }
}

const brandCache = new TtlCache<string[]>(1);

/** Brand names for query parsing: cached for 10 minutes and abandoned after 700ms so it never slows a search. */
export async function knownBrandNames(): Promise<string[]> {
  const hit = brandCache.get("b");
  if (hit) return hit;
  const names = await withTimeout(
    (async () => {
      const rows = unwrap<{ brand: string }[]>(await admin().from("CatalogProduct").select("brand").neq("brand", "").limit(500));
      return [...new Set(rows.map((r) => r.brand))];
    })(),
    700,
    null as string[] | null
  );
  if (names) brandCache.set("b", names, 10 * 60_000);
  return names ?? [];
}
