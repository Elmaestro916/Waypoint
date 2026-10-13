/**
 * Long-running worker for self-hosting: runs one autopilot cycle for every user on an interval.
 *   npm run worker            (default every 30 minutes)
 *   WORKER_INTERVAL_MIN=10 npm run worker
 * On serverless hosts use a cron service to POST /api/cron/tick instead.
 */
import "dotenv/config";
import { admin, unwrap } from "../src/lib/db";
import { runCycle } from "../src/lib/engine/autopilot";

const everyMs = Number(process.env.WORKER_INTERVAL_MIN ?? 30) * 60_000;

async function tick() {
  const users = unwrap<{ userId: string }[]>(await admin().from("AutopilotSettings").select("userId"));
  console.log(`[worker] ${new Date().toISOString()} cycling ${users.length} user(s)`);
  for (const { userId } of users) {
    try {
      await runCycle(userId);
    } catch (e) {
      console.error(`[worker] ${userId}:`, (e as Error).message);
    }
  }
}

tick().then(() => setInterval(tick, everyMs));
