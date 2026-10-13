export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const round2 = (x: number) => Math.round(x * 100) / 100;
export const money = (x: number) =>
  (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (x: number, d = 1) => (x * 100).toFixed(d) + "%";
export const today = () => new Date().toISOString().slice(0, 10);

export function safeJson<T>(s: string | null | undefined, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Small fast deterministic PRNG so simulations and the mock marketplace are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function normal(r: () => number): number {
  const u = Math.max(r(), 1e-12);
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(shape,1) sampler (Marsaglia-Tsang) used for Beta sampling in Thompson sampling. */
export function gamma(shape: number, r: () => number): number {
  if (shape < 1) return gamma(shape + 1, r) * Math.pow(Math.max(r(), 1e-12), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      x = normal(r);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = r();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function beta(a: number, b: number, r: () => number): number {
  const x = gamma(a, r);
  const y = gamma(b, r);
  return x / (x + y);
}

export function quantile(sorted: number[], q: number): number {
  const i = clamp(Math.floor(q * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[i];
}
