import { timingSafeEqual } from "node:crypto";
import { handle } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { runPriceAlerts } from "@/lib/shop/alerts";

export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || secret.length < 12) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Schedule hourly with `Authorization: Bearer $CRON_SECRET`. */
export const POST = handle(async (req: Request) => {
  if (!authorized(req)) throw new HttpError(401, "Unauthorized");
  return runPriceAlerts();
});

// Vercel Cron calls with GET and sends the Authorization header itself when CRON_SECRET is set.
export const GET = POST;
