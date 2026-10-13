import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { HttpError } from "@/lib/auth";
import { handle } from "@/lib/api";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export const POST = handle(async (req: Request) => {
  const b = schema.parse(await req.json());
  const { error } = await supabaseServer().auth.signInWithPassword({ email: b.email.toLowerCase(), password: b.password });
  if (error) {
    // don't reveal whether the email exists, but do tell unconfirmed users what to do
    if (error.code === "email_not_confirmed" || /confirm/i.test(error.message)) {
      return NextResponse.json({ error: "Please confirm your email first (check your inbox)", code: "email_not_confirmed" }, { status: 401 });
    }
    throw new HttpError(401, "Invalid email or password");
  }
  return { ok: true };
});
