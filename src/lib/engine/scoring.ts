import type { CatalogItem } from "../amazon/types";
import { marginPct } from "../amazon/fees";
import { clamp, round2 } from "../util";

/** Heuristic landed-cost guess. It is an ASSUMPTION - the UI tells the user to replace it with a real supplier quote. */
export function guessCogs(price: number) {
  return round2(price * 0.27);
}

export function competitionIndex(it: CatalogItem): number {
  const sellers = clamp(it.sellerCount / 30, 0, 1);
  const reviews = clamp(it.reviewCount / 5000, 0, 1);
  return round2(0.5 * sellers + 0.5 * reviews);
}

/** 0-100 deterministic opportunity score: demand, margin, low competition, sane price band. */
export function scoreItem(it: CatalogItem, cogs: number): number {
  const demand = clamp(Math.log10(Math.max(it.estMonthlyUnits, 1)) / Math.log10(2500), 0, 1);
  const margin = clamp(marginPct(it.price, cogs) / 0.4, 0, 1);
  const comp = 1 - competitionIndex(it);
  const priceBand = it.price >= 15 && it.price <= 60 ? 1 : 0.5;
  const quality = clamp((it.rating - 3.5) / 1.5, 0, 1) * 0.5 + 0.5; // room to beat weak incumbents
  return round2(100 * (0.3 * demand + 0.3 * margin + 0.3 * comp + 0.1 * priceBand) * (0.9 + 0.1 * (1 - quality)));
}
