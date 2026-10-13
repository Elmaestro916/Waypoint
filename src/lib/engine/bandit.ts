import { beta, clamp, rng, round2 } from "../util";

export interface KwStat {
  text: string;
  matchType: string;
  bid: number;
  state: string;
  clicks: number;
  orders: number;
  spend: number;
  sales: number;
}

export interface BidDecision {
  text: string;
  matchType: string;
  bid: number;
  state: "ENABLED" | "PAUSED";
  reason: string;
}

/**
 * Thompson-sampling bid optimizer.
 *
 * Each keyword's conversion rate has a Beta(orders + a0, clicks - orders + b0) posterior. Every cycle
 * we DRAW a CVR from it (so uncertain keywords sometimes get probed with higher bids = exploration,
 * proven keywords converge = exploitation), then bid what the draw says a click is worth under the
 * seller's ACoS target and profit share. Dead keywords are paused after enough clicks with no orders.
 */
export function optimizeBids(
  kws: KwStat[],
  p: { price: number; unitProfit: number; targetAcos: number; seed?: number },
): BidDecision[] {
  const r = rng(p.seed ?? Date.now() % 2147483647);
  const maxBid = clamp(p.price * 0.12, 0.5, 3.0);
  const a0 = 1.6; // weak prior centred on ~8% CVR
  const b0 = 18;

  return kws.map((k) => {
    const posterior = beta(k.orders + a0, Math.max(k.clicks - k.orders, 0) + b0, r);
    const acos = k.sales > 0 ? k.spend / k.sales : null;

    if (k.clicks >= 30 && k.orders === 0) {
      return { text: k.text, matchType: k.matchType, bid: k.bid, state: "PAUSED", reason: `${k.clicks} clicks, 0 orders: paused` };
    }
    if (k.clicks >= 50 && acos !== null && acos > p.targetAcos * 2.2) {
      return { text: k.text, matchType: k.matchType, bid: k.bid, state: "PAUSED", reason: `ACoS ${(acos * 100).toFixed(0)}% far above target: paused` };
    }

    // Value of a click = CVR * min(price * targetAcos, 65% of unit profit). Keeping 35% of profit as margin of safety.
    const valuePerOrder = Math.min(p.price * p.targetAcos, p.unitProfit * 0.65);
    const raw = posterior * valuePerOrder;
    // Smooth: move at most 25% per cycle so one lucky draw cannot blow the budget.
    const bounded = clamp(raw, 0.2, maxBid);
    const next = round2(clamp(bounded, k.bid * 0.75, k.bid * 1.25));
    const reason =
      k.clicks < 10
        ? `exploring (cvr draw ${(posterior * 100).toFixed(1)}%)`
        : `cvr draw ${(posterior * 100).toFixed(1)}% -> bid ${next.toFixed(2)}`;
    return { text: k.text, matchType: k.matchType, bid: next, state: "ENABLED", reason };
  });
}
