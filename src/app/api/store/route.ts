import { z } from "zod";
import { admin, check } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { handle } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { log } from "@/lib/engine/guardrails";

const schema = z.object({
  mode: z.enum(["mock", "live"]),
  sellerId: z.string().max(40).optional(),
  marketplaceId: z.string().max(20).optional(),
  spRefreshToken: z.string().max(2000).optional(),
  adsProfileId: z.string().max(40).optional(),
  adsRefreshToken: z.string().max(2000).optional(),
});

/**
 * Connect/disconnect a real Amazon account. Refresh tokens are encrypted at rest (AES-256-GCM) before
 * they reach the database, and the browser-side Supabase roles cannot read those columns at all.
 * Production apps should replace this paste-a-token form with the proper SP-API / Ads OAuth
 * authorization-code flow (Seller Central "authorize app" URL + LWA callback).
 */
export const PUT = handle(async (req: Request) => {
  const u = await requireUser();
  const b = schema.parse(await req.json());
  if (b.mode === "live") {
    if (process.env.AMAZON_MODE !== "live") throw new HttpError(400, "Server is not in live mode (set AMAZON_MODE=live and SP-API app credentials)");
    if (!(b.spRefreshToken || u.store.spRefreshToken) || !(b.sellerId || u.store.sellerId)) {
      throw new HttpError(400, "Seller ID and SP-API refresh token are required for live mode");
    }
  }
  check(
    await admin()
      .from("Store")
      .update({
        mode: b.mode,
        ...(b.sellerId ? { sellerId: b.sellerId } : {}),
        ...(b.marketplaceId ? { marketplaceId: b.marketplaceId } : {}),
        ...(b.spRefreshToken ? { spRefreshToken: encrypt(b.spRefreshToken) } : {}),
        ...(b.adsProfileId ? { adsProfileId: b.adsProfileId } : {}),
        ...(b.adsRefreshToken ? { adsRefreshToken: encrypt(b.adsRefreshToken) } : {}),
      })
      .eq("userId", u.id),
  );
  await log(u.id, "system", `Marketplace mode set to ${b.mode.toUpperCase()}`);
  return { ok: true };
});
