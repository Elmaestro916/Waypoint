import { marginPct } from "../amazon/fees";
import { clamp, round2 } from "../util";

export interface RepriceInput {
  price: number;
  cogs: number;
  minPrice: number;
  maxPrice: number;
  stock: number;
  buyBox: number | null;
  minMarginPct: number; // 0-100
  fulfillment: "FBA" | "FBM";
}

/** Lowest price that still clears the user's minimum net margin after Amazon fees. */
export function marginFloor(cogs: number, minMarginPct: number, f: "FBA" | "FBM"): number {
  let p = cogs;
  for (let i = 0; i < 4000; i++) {
    if (marginPct(p, cogs, f) >= minMarginPct / 100) return round2(p);
    p += 0.05;
  }
  return round2(p);
}

/**
 * Guardrailed repricer: chase the Buy Box (-1%), never go below the margin floor or the user's min,
 * never above max, move at most 5% per cycle, and nudge up 3% when stock is nearly gone so the
 * remaining units are not sold at the lowest margin.
 */
export function reprice(i: RepriceInput): { price: number; reason: string } | null {
  const floor = Math.max(i.minPrice, marginFloor(i.cogs, i.minMarginPct, i.fulfillment));
  let target = i.buyBox ? i.buyBox * 0.99 : i.price;
  let reason = i.buyBox ? "tracking Buy Box" : "no Buy Box signal";
  if (i.stock > 0 && i.stock < 10) {
    target *= 1.03;
    reason += " + low-stock premium";
  }
  target = clamp(target, floor, i.maxPrice);
  const step = clamp(target, i.price * 0.95, i.price * 1.05);
  const next = round2(step);
  if (Math.abs(next - i.price) / i.price < 0.005) return null;
  if (next === round2(floor) && target <= floor) reason += " (held at margin floor)";
  return { price: next, reason };
}
