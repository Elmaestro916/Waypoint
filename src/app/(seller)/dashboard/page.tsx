import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { countOf, unwrap } from "@/lib/db";
import type { DailyMetric } from "@/lib/types";
import { money, pct } from "@/lib/util";
import ActionButton from "@/components/ActionButton";
import BarChart from "@/components/BarChart";

export const dynamic = "force-dynamic";

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className={`text-2xl font-semibold ${tone === "good" ? "text-mint" : tone === "bad" ? "text-red-400" : "text-white"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default async function Overview() {
  const u = await requireUser();
  // User-scoped client: Postgres row level security guarantees these reads only return this user's rows.
  const sb = supabaseServer();
  const head = { count: "exact", head: true } as const;
  const [metricRes, liveRes, pendingRes, oppRes] = await Promise.all([
    sb.from("DailyMetric").select("*").order("date", { ascending: false }).limit(30),
    sb.from("Product").select("id", head).eq("status", "live"),
    sb.from("Product").select("id", head).eq("status", "pending_approval"),
    sb.from("Opportunity").select("id", head).eq("status", "new"),
  ]);
  const metrics = unwrap<DailyMetric[]>(metricRes).reverse(); // newest 30 days, oldest first for the chart
  const live = countOf(liveRes);
  const pending = countOf(pendingRes);
  const opps = countOf(oppRes);
  const settings = u.settings;
  const sum = (k: "revenue" | "adSpend" | "profit" | "units") => metrics.reduce((s, m) => s + m[k], 0);
  const revenue = sum("revenue");
  const profit = sum("profit");
  const adSpend = sum("adSpend");
  const roas = adSpend > 0 ? revenue / adSpend : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Overview</h1>
          <p className="text-sm text-slate-400">
            Autopilot is <b className={settings?.enabled ? "text-mint" : "text-slate-300"}>{settings?.enabled ? "ON" : "OFF"}</b>
            {settings?.approvalMode ? " (approval required before launches)" : " (auto-launch within your caps)"}.
            {settings?.lastRunAt ? ` Last cycle: ${new Date(settings.lastRunAt).toLocaleString()}` : " No cycles run yet."}
          </p>
        </div>
        <div className="flex gap-2">
          <ActionButton url="/api/discover">Find opportunities</ActionButton>
          <ActionButton url="/api/run" variant="primary">Run a cycle now</ActionButton>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Revenue (30d)" value={money(revenue)} sub={`${sum("units")} units`} />
        <Kpi label="Net profit (30d)" value={money(profit)} tone={profit >= 0 ? "good" : "bad"} sub={revenue ? `${pct(profit / revenue)} margin after fees, COGS, ads` : undefined} />
        <Kpi label="Ad spend (30d)" value={money(adSpend)} sub={settings ? `Budget ${money(settings.monthlyAdBudget)}/mo` : undefined} />
        <Kpi label="ROAS" value={roas ? roas.toFixed(2) + "x" : "n/a"} sub={`${live} live, ${pending} awaiting approval, ${opps} new ideas`} />
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold text-white">Daily net profit</h2>
        <BarChart data={metrics.map((m) => ({ label: m.date, value: m.profit }))} />
      </div>
    </div>
  );
}
