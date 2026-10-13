import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNext, supabaseServer } from "@/lib/supabase/server";

/**
 * Landing page for links in Supabase auth emails (signup confirmation, password reset, email change).
 * Handles both link styles:
 *  - `?token_hash=...&type=...` from custom email templates (works even if opened on another device)
 *  - `?code=...` from the default templates (PKCE: must be opened in the browser that requested the email)
 * On success the session cookie is set and the user is sent to `next`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), type === "recovery" ? "/reset-password" : "/dashboard");

  const supabase = supabaseServer();
  let error: { message: string } | null = null;
  if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else {
    // Supabase reports expired/used links as ?error_description=... on the redirect.
    error = { message: url.searchParams.get("error_description") || "Invalid link" };
  }

  if (error) {
    const to = new URL("/login", url.origin);
    to.searchParams.set("error", "That link is invalid or has expired. Request a new one.");
    return NextResponse.redirect(to);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
