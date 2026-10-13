import type { Rates } from "./types";

/**
 * Display-only currency conversion. Live rates come from open.er-api.com (free, no key, includes NGN),
 * cached for 12h. If that fails the built-in approximate table is used and the UI says so.
 * Prices are never CHARGED by this site (shoppers pay the store), so this is for comparison only.
 */
const FALLBACK: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.78, CAD: 1.37, AUD: 1.52, INR: 83.5, NGN: 1550, GHS: 15, KES: 129,
  ZAR: 18.2, EGP: 49, AED: 3.67, MXN: 18, BRL: 5.4,
};

let cache: { at: number; rates: Rates } | null = null;
const TTL = 12 * 3600 * 1000;

export function fallbackRates(): Rates {
  return { base: "USD", rates: { ...FALLBACK }, asOf: "built-in approximate rates", live: false };
}

export async function getRates(fetchImpl: typeof fetch = fetch): Promise<Rates> {
  if (cache && Date.now() - cache.at < TTL) return cache.rates;
  try {
    const res = await fetchImpl(process.env.FX_URL ?? "https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const j = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
      if (j.result === "success" && j.rates && j.rates.USD === 1) {
        const rates: Rates = { base: "USD", rates: j.rates, asOf: j.time_last_update_utc ?? new Date().toISOString(), live: true };
        cache = { at: Date.now(), rates };
        return rates;
      }
    }
  } catch {
    // fall through to the approximate table
  }
  const rates = fallbackRates();
  cache = { at: Date.now() - TTL + 5 * 60 * 1000, rates }; // retry the live source in 5 minutes
  return rates;
}

export function convert(amount: number, from: string, to: string, r: Rates): number {
  if (from === to) return amount;
  const f = r.rates[from];
  const t = r.rates[to];
  if (!f || !t) return NaN; // unknown currency: callers must treat NaN as "can't compare"
  return (amount / f) * t;
}

export function toUsd(amount: number, from: string, r: Rates): number {
  const v = convert(amount, from, "USD", r);
  return Number.isFinite(v) ? v : 0;
}

export function formatMoney(amount: number, currency: string, locale = "en-US"): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: amount >= 1000 ? 0 : 2,
      minimumFractionDigits: amount >= 1000 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function __resetFxCache() {
  cache = null;
}
