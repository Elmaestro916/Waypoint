import { z } from "zod";
import { admin, check, unwrapMaybe } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { handle } from "@/lib/api";
import { launchProduct } from "@/lib/engine/autopilot";
import { log } from "@/lib/engine/guardrails";
import type { Product } from "@/lib/types";

const schema = z.object({
  action: z.enum(["approve", "reject", "pause", "resume"]),
  cogs: z.number().positive().max(10000).optional(), // lets the user replace the COGS estimate with a real supplier quote
});

export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const u = await requireUser();
  const b = schema.parse(await req.json());
  const a = admin();
  const p = unwrapMaybe<Product>(await a.from("Product").select("*").eq("id", params.id).eq("userId", u.id).maybeSingle());
  if (!p) throw new HttpError(404, "Not found");

  if (b.cogs) check(await a.from("Product").update({ cogs: b.cogs }).eq("id", p.id).eq("userId", u.id));

  switch (b.action) {
    case "approve":
      try {
        await launchProduct(u.id, p.id);
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
      break;
    case "reject":
      check(await a.from("Product").update({ status: "rejected" }).eq("id", p.id).eq("userId", u.id));
      if (p.opportunityId) check(await a.from("Opportunity").update({ status: "rejected" }).eq("id", p.opportunityId).eq("userId", u.id));
      break;
    case "pause":
    case "resume": {
      const live = b.action === "resume";
      check(await a.from("Product").update({ status: live ? "live" : "paused" }).eq("id", p.id).eq("userId", u.id));
      check(await a.from("Campaign").update({ status: live ? "active" : "paused" }).eq("productId", p.id).eq("userId", u.id));
      await log(u.id, "system", `${live ? "Resumed" : "Paused"} ${p.title}`);
      break;
    }
  }
  return { ok: true };
});
