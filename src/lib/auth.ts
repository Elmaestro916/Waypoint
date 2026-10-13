import { cache } from "react";
import { admin, check, unwrapMaybe } from "./db";
import { supabaseServer } from "./supabase/server";
import type { AppUser, AutopilotSettings, Store } from "./types";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * The signed-in user, or null. Identity comes from Supabase Auth: getUser() re-validates the access
 * token with the Auth server on every call (unlike getSession(), which only trusts the cookie).
 */
export const getUser = cache(async (): Promise<AppUser | null> => {
  const { data } = await supabaseServer().auth.getUser();
  const u = data.user;
  if (!u) return null;

  const a = admin();
  let [store, settings] = await Promise.all([
    a.from("Store").select("*").eq("userId", u.id).maybeSingle().then((r) => unwrapMaybe<Store>(r)),
    a.from("AutopilotSettings").select("*").eq("userId", u.id).maybeSingle().then((r) => unwrapMaybe<AutopilotSettings>(r)),
  ]);

  // The signup trigger creates these rows; self-heal for accounts that predate it.
  if (!store) {
    check(await a.from("Store").upsert({ userId: u.id }, { onConflict: "userId", ignoreDuplicates: true }));
    store = unwrapMaybe<Store>(await a.from("Store").select("*").eq("userId", u.id).maybeSingle());
  }
  if (!settings) {
    check(await a.from("AutopilotSettings").upsert({ userId: u.id }, { onConflict: "userId", ignoreDuplicates: true }));
    settings = unwrapMaybe<AutopilotSettings>(await a.from("AutopilotSettings").select("*").eq("userId", u.id).maybeSingle());
  }
  if (!store || !settings) throw new Error("Could not load account rows");

  const meta = u.user_metadata as { name?: string } | null;
  return { id: u.id, email: u.email ?? "", name: meta?.name ?? null, store, settings };
});

export async function requireUser(): Promise<AppUser> {
  const u = await getUser();
  if (!u) throw new HttpError(401, "Not signed in");
  return u;
}

/** Admins are the emails listed in ADMIN_EMAILS (comma-separated). */
export function isAdminEmail(email: string | null | undefined): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return Boolean(email) && list.includes(email!.toLowerCase());
}

export async function requireAdmin(): Promise<AppUser> {
  const u = await requireUser();
  if (!isAdminEmail(u.email)) throw new HttpError(403, "Admins only");
  return u;
}
