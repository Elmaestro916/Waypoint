import { round2 } from "../util";

/**
 * Rough US fee model used for planning and simulation. Real fees depend on size tier, weight and
 * category; in live mode replace with the Product Fees API (getMyFeesEstimate). Treat as an ESTIMATE.
 */
export function estimateFees(price: number, fulfillment: "FBA" | "FBM" = "FBA") {
  const referral = Math.max(0.3, price * 0.15);
  const fba = fulfillment === "FBA" ? (price < 15 ? 3.2 : price < 30 ? 4.1 : price < 60 ? 5.3 : 7.5) : 0;
  const storage = fulfillment === "FBA" ? 0.25 : 0;
  return { referral: round2(referral), fulfillment: round2(fba), storage, total: round2(referral + fba + storage) };
}

export function unitProfit(price: number, cogs: number, fulfillment: "FBA" | "FBM" = "FBA") {
  return round2(price - cogs - estimateFees(price, fulfillment).total);
}

export function marginPct(price: number, cogs: number, fulfillment: "FBA" | "FBM" = "FBA") {
  return price > 0 ? unitProfit(price, cogs, fulfillment) / price : 0;
}
