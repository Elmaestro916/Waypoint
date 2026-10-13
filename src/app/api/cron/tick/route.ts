import { timingSafeEqual } from "node:crypto";
import { admin, unwrap } from "@/lib/db";
import { handle } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { runCycle } from "@/lib/engine/autopilot";

export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || secret.length < 12) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Call from a scheduler (Vercel Cron, GitHub Actions, cron-job.org) with `Authorization: Bearer $CRON_SECRET`. */
export const POST = handle(async (req: Request) => {
  if (!authorized(req)) throw new HttpError(401, "Unauthorized");
  const users = unwrap<{ userId: string }[]>(await admin().from("AutopilotSettings").select("userId"));
  let ok = 0;
  let failed = 0;
  for (const { userId } of users) {
    try {
      await runCycle(userId);
      ok++;
    } catch {
      failed++;
    }
  }
  return { ok, failed };
});

// Vercel Cron calls with GET and sends the Authorization header itself when CRON_SECRET is set.
export const GET = POST;
