import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env");
  return { url, anon };
}

/**
 * User-scoped client for server components and route handlers. It carries the signed-in user's session
 * cookie, so Postgres row level security applies: reads only ever return that user's own rows.
 */
export function supabaseServer() {
  const { url, anon } = supabaseEnv();
  const store = cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The middleware refreshes sessions.
        }
      },
    },
  });
}

/** Only same-site relative paths, so a crafted email link can't bounce users to another domain. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

/**
 * Where links in auth emails should land. Supabase only redirects to URLs on its allow list
 * (Authentication -> URL Configuration -> Redirect URLs), so NEXT_PUBLIC_SITE_URL should match an entry there.
 */
export function authCallbackUrl(req: Request, next: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/+$/, "");
  return `${base}/auth/confirm?next=${encodeURIComponent(safeNext(next))}`;
}
