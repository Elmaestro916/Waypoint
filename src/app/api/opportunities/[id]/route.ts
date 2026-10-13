import { z } from "zod";
import { admin, check, unwrapMaybe } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { handle } from "@/lib/api";
import { launchProduct, prepareProduct } from "@/lib/engine/autopilot";
import type { Opportunity } from "@/lib/types";

const schema = z.object({ action: z.enum(["queue", "launch", "reject"]) });

export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const u = await requireUser();
  const { action } = schema.parse(await req.json());
  const a = admin();
  const opp = unwrapMaybe<Opportunity>(await a.from("Opportunity").select("*").eq("id", params.id).eq("userId", u.id).maybeSingle());
  if (!opp) throw new HttpError(404, "Not found");

  if (action === "reject") {
    check(await a.from("Opportunity").update({ status: "rejected" }).eq("id", opp.id).eq("userId", u.id));
    return { ok: true };
  }
  const product = await prepareProduct(u.id, opp.id);
  if (action === "launch") {
    try {
      await launchProduct(u.id, product.id);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  }
  return { ok: true, productId: product.id };
});
