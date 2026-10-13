import { admin, check, unwrap } from "../db";
import type { DailyMetric } from "../types";

export { isBlocked } from "./blocklist";

export async function monthAdSpend(userId: string): Promise<number> {
  const since = new Date();
  since.setUTCDate(1);
  const from = since.toISOString().slice(0, 10);
  const rows = unwrap<Pick<DailyMetric, "adSpend">[]>(
    await admin().from("DailyMetric").select("adSpend").eq("userId", userId).gte("date", from),
  );
  return rows.reduce((s, r) => s + r.adSpend, 0);
}

export async function log(userId: string, kind: string, message: string, detail?: unknown) {
  check(
    await admin()
      .from("ActivityLog")
      .insert({ userId, kind, message, detail: detail === undefined ? null : JSON.stringify(detail) }),
  );
}
