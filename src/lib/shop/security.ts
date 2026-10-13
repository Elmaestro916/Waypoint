import { createHash, createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  const s = process.env.CLICK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("Set CLICK_SECRET (any long random string) in the environment");
    return "dev-only-click-secret";
  }
  return s;
}

const b64 = (b: Buffer) => b.toString("base64url");

export interface ClickClaims {
  k: string; // offer key
  r: string; // retailer slug
  s: string; // source
  p: string | null; // catalog product id
  n: number | null; // position in results
  a: number; // price
  c: string; // currency
  q: string; // query
  co: string; // country
  e: number; // expiry (epoch seconds)
}

/** Click tokens bind a click report to an offer we actually displayed, so the stats can't be inflated by forged requests. */
export function signClick(claims: Omit<ClickClaims, "e">, ttlSeconds = 3600): string {
  const body = b64(Buffer.from(JSON.stringify({ ...claims, e: Math.floor(Date.now() / 1000) + ttlSeconds })));
  const sig = b64(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyClick(token: string): ClickClaims | null {
  const [body, sig] = (token ?? "").split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString()) as ClickClaims;
    return c.e > Date.now() / 1000 ? c : null;
  } catch {
    return null;
  }
}

/** Daily-rotating anonymous visitor hash: lets us count unique sessions without storing IPs. */
export function sessionHash(ip: string, ua: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${secret()}|${day}|${ip}|${ua}`).digest("hex").slice(0, 24);
}

/** Tiny sliding-window rate limiter (per server instance; put a shared limiter in front for multi-instance scale). */
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return true;
}

/** TTL cache with a size cap. */
export class TtlCache<T> {
  private m = new Map<string, { exp: number; v: T }>();
  constructor(private max = 500) {}
  get(k: string): T | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.exp < Date.now()) {
      this.m.delete(k);
      return undefined;
    }
    return e.v;
  }
  set(k: string, v: T, ttlMs: number) {
    if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value as string);
    this.m.set(k, { exp: Date.now() + ttlMs, v });
  }
}

/** Only http(s) URLs ever reach an href. */
export function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:" ? p.toString() : null;
  } catch {
    return null;
  }
}

/** Resolves with the fallback if the promise is slow or fails, so an optional lookup can never hold up a page. */
export async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p.catch(() => fallback), new Promise<T>((res) => { timer = setTimeout(() => res(fallback), ms); })]);
  } finally {
    clearTimeout(timer);
  }
}
