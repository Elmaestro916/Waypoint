import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { runCycle } from "@/lib/engine/autopilot";

export const maxDuration = 60;

/** Manually trigger one autopilot cycle for the signed-in user. */
export const POST = handle(async () => {
  const u = await requireUser();
  await runCycle(u.id);
  return { ok: true };
});
