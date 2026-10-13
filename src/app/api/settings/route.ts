import { z } from "zod";
import { admin, unwrap } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { log } from "@/lib/engine/guardrails";
import type { AutopilotSettings } from "@/lib/types";

const schema = z.object({
  enabled: z.boolean().optional(),
  approvalMode: z.boolean().optional(),
  niches: z.string().max(500).optional(),
  monthlyAdBudget: z.number().min(0).max(100000).optional(),
  maxLaunchBudget: z.number().min(0).max(1000000).optional(),
  maxActiveProducts: z.number().int().min(1).max(50).optional(),
  minMarginPct: z.number().min(0).max(80).optional(),
  targetAcos: z.number().min(0.05).max(0.9).optional(),
  maxProbLoss: z.number().min(0.05).max(0.95).optional(),
  minScore: z.number().min(0).max(100).optional(),
});

export const PUT = handle(async (req: Request) => {
  const u = await requireUser();
  const data = schema.parse(await req.json());
  if (Object.keys(data).length === 0) return u.settings;
  const s = unwrap<AutopilotSettings>(await admin().from("AutopilotSettings").update(data).eq("userId", u.id).select().single());
  if (data.enabled !== undefined) await log(u.id, "system", `Autopilot ${data.enabled ? "ENABLED" : "disabled"}`);
  if (data.approvalMode === false) await log(u.id, "system", "Approval mode OFF: engine may launch products and spend within your caps without asking");
  return s;
});
