import { estimateFees } from "../amazon/fees";
import { clamp, normal, quantile, rng, round2 } from "../util";

export interface SimInput {
  price: number;
  cogs: number;
  monthlyUnits: number; // category-level demand signal for the ASIN being displaced
  competition: number; // 0-1
  targetAcos: number;
  monthlyAdBudget: number;
  launchCapital: number; // inventory + listing set-up cash committed up-front
  seed?: number;
}

export interface SimResult {
  p10: number;
  p50: number;
  p90: number;
  probLoss: number;
  expectedUnits90d: number;
  expectedAcos: number;
  breakEvenDays: number | null;
}

/**
 * "Profit digital twin": 4000 Monte-Carlo runs of the first 90 days. Uncertainty comes from market
 * share capture (launch ramp), demand volatility, ACoS drift, and returns. It is a risk lens, not a
 * forecast - inputs (especially COGS and share) are assumptions.
 */
export function simulate(i: SimInput, runs = 4000): SimResult {
  const r = rng(i.seed ?? 1337);
  const fees = estimateFees(i.price).total;
  const unitMargin = i.price - i.cogs - fees;
  const profits: number[] = [];
  let unitsSum = 0;
  let acosSum = 0;
  let breakEven: number[] = [];

  for (let n = 0; n < runs; n++) {
    const demand = Math.exp(normal(r) * (0.35 + 0.35 * i.competition)); // lognormal volatility
    const share = clamp(0.02 + r() * 0.1 * (1 - 0.7 * i.competition), 0.005, 0.2); // share of category demand captured
    const ramp = [0.25, 0.6, 1.0].map((x) => x * (0.8 + r() * 0.4)); // 3 monthly ramp factors
    const acos = clamp(i.targetAcos + 0.1 * i.competition + normal(r) * 0.07, 0.08, 0.95);
    const returnRate = clamp(0.04 + normal(r) * 0.02, 0, 0.2);

    let units = 0;
    for (const f of ramp) units += i.monthlyUnits * share * demand * f;
    units = Math.max(0, units);
    const revenue = units * i.price;
    const adSales = revenue * 0.6;
    const adSpend = Math.min(adSales * acos, i.monthlyAdBudget * 3);
    const returnsCost = units * returnRate * (i.cogs * 0.3 + 2);
    const profit = units * unitMargin - adSpend - returnsCost - i.launchCapital * 0.0; // capital recovered via inventory value
    profits.push(profit - i.launchCapital * 0.15); // 15% haircut for unsold-inventory / storage / liquidation risk
    unitsSum += units;
    acosSum += acos;
    if (profit > 0 && units > 0) breakEven.push((i.launchCapital * 0.15) / Math.max(profit / 90, 0.01));
  }
  profits.sort((a, b) => a - b);
  breakEven.sort((a, b) => a - b);
  return {
    p10: round2(quantile(profits, 0.1)),
    p50: round2(quantile(profits, 0.5)),
    p90: round2(quantile(profits, 0.9)),
    probLoss: round2(profits.filter((p) => p < 0).length / runs),
    expectedUnits90d: Math.round(unitsSum / runs),
    expectedAcos: round2(acosSum / runs),
    breakEvenDays: breakEven.length ? Math.round(quantile(breakEven, 0.5)) : null,
  };
}
