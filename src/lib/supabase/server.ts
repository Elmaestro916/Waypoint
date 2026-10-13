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
