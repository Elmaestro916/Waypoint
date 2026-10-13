import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { discover } from "@/lib/engine/autopilot";

export const POST = handle(async () => {
  const u = await requireUser();
  const added = await discover(u.id);
  return { added };
});
