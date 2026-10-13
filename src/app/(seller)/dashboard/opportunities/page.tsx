import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { unwrap } from "@/lib/db";
import type { Opportunity } from "@/lib/types";
import { money, pct, safeJson } from "@/lib/util";
import ActionButton from "@/components/ActionButton";
import type { SimResult } from "@/lib/engine/montecarlo";

export const dynamic = "force-dynamic";

export default async function Opportunities() {
  await requireUser();
  const opps = unwrap<Opportunity[]>(
    await supabaseServer().from("Opportunity").select("*").order("status", { ascending: true }).order("score", { ascending: false }),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Opportunities</h1>
          <p className="text-sm text-slate-400">Ranked by score. The simulation is a risk lens built on assumed supplier cost, not a forecast.</p>
        </div>
        <ActionButton url="/api/discover" variant="primary">Scan my niches</ActionButton>
      </div>

      {opps.length === 0 && <div className="card text-sm text-slate-400">Nothing yet. Click &ldquo;Scan my niches&rdquo;.</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {opps.map((o) => {
          const sim = safeJson<Partial<SimResult>>(o.simJson, {});
          const open = o.status === "new";
          return (
            <div key={o.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white">{o.title}</h3>
                  <p className="text-xs text-slate-500">{o.category} &middot; {o.asin} &middot; {money(o.price)}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-accent">{o.score.toFixed(0)}</p>
                  <span className={`badge ${o.status === "rejected" ? "bg-red-500/15 text-red-300" : o.status === "launched" ? "bg-emerald-500/15 text-emerald-300" : "bg-ink-700 text-slate-300"}`}>{o.status}</span>
                </div>
              </div>

              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-slate-500">Est. units/mo</dt><dd className="text-slate-200">{o.estMonthlyUnits}</dd></div>
                <div><dt className="text-slate-500">Assumed COGS</dt><dd className="text-slate-200">{money(o.estCogs)}</dd></div>
                <div><dt className="text-slate-500">Competition</dt><dd className="text-slate-200">{pct(o.competition, 0)}</dd></div>
                <div><dt className="text-slate-500">90d profit P10</dt><dd className="text-red-300">{sim.p10 !== undefined ? money(sim.p10) : "-"}</dd></div>
                <div><dt className="text-slate-500">90d profit P50</dt><dd className="text-slate-200">{sim.p50 !== undefined ? money(sim.p50) : "-"}</dd></div>
                <div><dt className="text-slate-500">90d profit P90</dt><dd className="text-mint">{sim.p90 !== undefined ? money(sim.p90) : "-"}</dd></div>
                <div className="col-span-3"><dt className="text-slate-500">Probability of loss</dt><dd className="text-slate-200">{sim.probLoss !== undefined ? pct(sim.probLoss, 0) : "-"}</dd></div>
              </dl>

              {o.angle && <p className="text-sm text-slate-300"><b className="text-slate-100">Angle:</b> {o.angle}</p>}
              {o.rationale && <p className="text-sm text-slate-400">{o.rationale}</p>}
              {o.risks && <p className="text-xs text-amber-300/90">Risks: {o.risks}</p>}

              {open && (
                <div className="flex gap-2 pt-1">
                  <ActionButton url={`/api/opportunities/${o.id}`} body={{ action: "queue" }} variant="primary">Prepare listing</ActionButton>
                  <ActionButton url={`/api/opportunities/${o.id}`} body={{ action: "reject" }}>Dismiss</ActionButton>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
