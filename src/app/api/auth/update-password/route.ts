import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { HttpError } from "@/lib/auth";
import { handle } from "@/lib/api";

const schema = z.object({ password: z.string().min(8, "Password must be at least 8 characters").max(200) });

/** Sets a new password for the signed-in user (reached from a password reset link). */
export const POST = handle(async (req: Request) => {
  const b = schema.parse(await req.json());
  const supabase = supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new HttpError(401, "Your reset link has expired. Request a new one.");
  const { error } = await supabase.auth.updateUser({ password: b.password });
  if (error) throw new HttpError(400, error.message);
  return { ok: true };
});
