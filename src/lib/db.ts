import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. It BYPASSES row level security, so it must only run on the server (API routes,
 * the worker, cron) and every query made with it must filter by the acting user's id.
 * Never import this from a client component, and never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
let cached: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

type Res = { data: unknown; error: { message: string } | null };

/** Returns the data or throws the Supabase error (supabase-js returns errors instead of throwing). */
export function unwrap<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Same, but for queries where "no row" is acceptable. */
export function unwrapMaybe<T>(res: Res): T | null {
  if (res.error) throw new Error(res.error.message);
  return (res.data as T | null) ?? null;
}

/** For writes where only success matters. */
export function check(res: { error: { message: string } | null }): void {
  if (res.error) throw new Error(res.error.message);
}

/** For `select(..., { count: "exact", head: true })` queries. */
export function countOf(res: { count: number | null; error: { message: string } | null }): number {
  if (res.error) throw new Error(res.error.message);
  return res.count ?? 0;
}
