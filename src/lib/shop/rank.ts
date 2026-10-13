import { convert } from "./fx";
import { tokenize } from "./query";
import type { Offer, ProductGroup, Rates, SortMode } from "./types";

const groupKeyOf = (o: Offer) => (o.gtin ? `gtin:${o.gtin}` : o.productId ? `p:${o.productId}` : o.groupKey ? `g:${o.groupKey}` : o.key);

/** Fraction of query words found in the title (prefix match), 0..1. */
export function titleCoverage(title: string, tokens: string[]): number {
  if (!tokens.length) return 0;
  const t = tokenize(title);
  return tokens.filter((q) => t.some((w) => w.startsWith(q))).length / tokens.length;
}

/**
 * Clusters offers for the same product (same GTIN, catalog product or Shopify UPID) so shoppers see one card
 * with every store's price. Listings with no shared identifier stay separate on purpose: wrongly merging two
 * different products is worse than showing two cards.
 */
export function groupOffers(offers: Offer[], tokens: string[], displayCurrency: string, rates: Rates): ProductGroup[] {
  const buckets = new Map<string, Offer[]>();
  for (const o of offers) {
    const k = groupKeyOf(o);
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(o);
  }
  const groups: ProductGroup[] = [];
  for (const [id, list] of buckets) {
    const priced = list
      .map((o) => ({ o, d: convert(o.price, o.currency, displayCurrency, rates) }))
      .filter((x) => Number.isFinite(x.d));
    if (!priced.length) continue;
    priced.sort((a, b) => Number(b.o.inStock !== false) - Number(a.o.inStock !== false) || a.d - b.d);
    const offersSorted = priced.map((x) => x.o);
    const best = priced[0];
    const rated = list.filter((o) => o.rating != null);
    const rating = rated.length ? rated.reduce((s, o) => s + (o.rating ?? 0), 0) / rated.length : 0;
    const head = list[0];
    const coverage = titleCoverage(head.title, tokens);
    const score =
      coverage * 10 +
      (best.o.inStock !== false ? 1 : 0) +
      Math.min(list.length, 5) * 0.4 + // more stores carrying it = more useful to compare
      rating * 0.3 +
      (head.brand && tokens.some((t) => tokenize(head.brand!).includes(t)) ? 1 : 0) -
      (best.o.condition === "used" ? 0.6 : 0); // used items rank below new ones unless the shopper asked for used
    groups.push({
      id,
      title: head.title,
      brand: head.brand,
      imageUrl: list.find((o) => o.imageUrl)?.imageUrl ?? null,
      offers: offersSorted,
      best: best.o,
      bestPrice: best.d,
      score,
      productId: list.find((o) => o.productId)?.productId ?? null,
    });
  }
  return groups;
}

export function sortGroups(groups: ProductGroup[], sort: SortMode): ProductGroup[] {
  const g = [...groups];
  switch (sort) {
    case "price_asc":
      return g.sort((a, b) => a.bestPrice - b.bestPrice);
    case "price_desc":
      return g.sort((a, b) => b.bestPrice - a.bestPrice);
    case "rating":
      return g.sort((a, b) => (b.best.rating ?? 0) - (a.best.rating ?? 0) || b.score - a.score);
    default:
      return g.sort((a, b) => b.score - a.score || a.bestPrice - b.bestPrice);
  }
}

/** Drops results that barely match: with several query words, require at least half of them in the title. */
export function relevant(groups: ProductGroup[], tokens: string[]): ProductGroup[] {
  if (tokens.length < 2) return groups;
  return groups.filter((g) => titleCoverage(g.title, tokens) >= 0.5);
}
