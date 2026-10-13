import { supabaseServer } from "@/lib/supabase/server";
import { handle } from "@/lib/api";

export const POST = handle(async () => {
  await supabaseServer().auth.signOut();
  return { ok: true };
});
