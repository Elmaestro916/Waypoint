import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { unwrap } from "@/lib/db";
import type { ActivityLog } from "@/lib/types";

export const dynamic = "force-dynamic";

const tone: Record<string, string> = {
  error: "text-red-300",
  guardrail: "text-amber-300",
  launch: "text-emerald-300",
  reprice: "text-sky-300",
  bid: "text-violet-300",
  discover: "text-accent",
  system: "text-slate-300",
};

export default async function Activity() {
  await requireUser();
  const logs = unwrap<ActivityLog[]>(
    await supabaseServer().from("ActivityLog").select("*").order("createdAt", { ascending: false }).limit(200),
  );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Activity log</h1>
        <p className="text-sm text-slate-400">Every action the autopilot takes is recorded here.</p>
      </div>
      <div className="card divide-y divide-ink-700 p-0">
        {logs.length === 0 && <p className="p-5 text-sm text-slate-400">Nothing yet.</p>}
        {logs.map((l) => (
          <div key={l.id} className="flex gap-3 px-5 py-2.5 text-sm">
            <span className="w-36 shrink-0 text-xs text-slate-500">{new Date(l.createdAt).toLocaleString()}</span>
            <span className={`w-20 shrink-0 text-xs font-medium uppercase ${tone[l.kind] ?? ""}`}>{l.kind}</span>
            <span className="text-slate-200">{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
