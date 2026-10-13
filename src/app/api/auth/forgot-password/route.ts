import { z } from "zod";
import { authCallbackUrl, supabaseServer } from "@/lib/supabase/server";
import { handle } from "@/lib/api";

const schema = z.object({ email: z.string().email().max(200) });

/** Emails a password reset link. The link signs the user in via /auth/confirm, then opens /reset-password. */
export const POST = handle(async (req: Request) => {
  const b = schema.parse(await req.json());
  const { error } = await supabaseServer().auth.resetPasswordForEmail(b.email.toLowerCase(), {
    redirectTo: authCallbackUrl(req, "/reset-password"),
  });
  // Same answer whether or not the account exists, so this can't be used to probe for emails.
  if (error) console.error("resetPasswordForEmail:", error.message);
  return { ok: true };
});
