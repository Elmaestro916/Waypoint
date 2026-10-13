import { z } from "zod";
import { authCallbackUrl, supabaseServer } from "@/lib/supabase/server";
import { handle } from "@/lib/api";

const schema = z.object({ email: z.string().email().max(200) });

/** Re-sends the signup confirmation email. */
export const POST = handle(async (req: Request) => {
  const b = schema.parse(await req.json());
  const { error } = await supabaseServer().auth.resend({
    type: "signup",
    email: b.email.toLowerCase(),
    options: { emailRedirectTo: authCallbackUrl(req, "/dashboard") },
  });
  // Don't reveal whether the email is registered or already confirmed.
  if (error) console.error("resend:", error.message);
  return { ok: true };
});
