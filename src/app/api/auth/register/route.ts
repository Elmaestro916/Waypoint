import { z } from "zod";
import { authCallbackUrl, supabaseServer } from "@/lib/supabase/server";
import { HttpError } from "@/lib/auth";
import { handle } from "@/lib/api";

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  name: z.string().max(100).optional(),
});

export const POST = handle(async (req: Request) => {
  const b = schema.parse(await req.json());
  const { data, error } = await supabaseServer().auth.signUp({
    email: b.email.toLowerCase(),
    password: b.password,
    options: { data: { name: b.name ?? null }, emailRedirectTo: authCallbackUrl(req, "/dashboard") },
  });
  if (error) throw new HttpError(400, error.message);
  // With "Confirm email" enabled in Supabase (the default) there is no session until the link is clicked.
  // A database trigger creates the user's Store + AutopilotSettings rows on signup.
  return { ok: true, needsConfirmation: !data.session };
});
