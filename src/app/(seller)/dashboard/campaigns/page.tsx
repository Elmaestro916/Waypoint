import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { unwrap } from "@/lib/db";
import type { Campaign, Keyword, Product } from "@/lib/types";
import { money, pct } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function Campaigns() {
  await requireUser();
  const camps = unwrap<(Campaign & { product: Product; keywords: Keyword[] })[]>(
    await supabaseServer()
      .from("Campaign")
      .select("*, product:Product(*), keywords:Keyword(*)")
      .order("createdAt", { ascending: false })
      .order("spend", { ascending: false, referencedTable: "Keyword" }),
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-white">Ad campaigns</h1>
      {camps.length === 0 && <div className="card text-sm text-slate-400">No campaigns yet. They are created when a product launches.</div>}
      {camps.map((c) => (
        <div key={c.id} className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-white">{c.product.title}</h3>
              <p className="text-xs text-slate-500">{c.name} &middot; {money(c.dailyBudget)}/day &middot; {c.status}</p>
            </div>
            <p className="text-sm text-slate-300">
              Spend {money(c.spend)} &middot; Sales {money(c.sales)} &middot; ACoS {c.sales > 0 ? pct(c.spend / c.sales, 0) : "n/a"} &middot; {c.orders} orders
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr><th className="th">Keyword</th><th className="th">Bid</th><th className="th">Clicks</th><th className="th">Orders</th><th className="th">Spend</th><th className="th">ACoS</th><th className="th">State</th></tr>
              </thead>
              <tbody>
                {c.keywords.map((k) => (
                  <tr key={k.id} className="border-t border-ink-700">
                    <td className="td">{k.text} <span className="text-xs text-slate-500">{k.matchType}</span></td>
                    <td className="td">{money(k.bid)}</td>
                    <td className="td">{k.clicks}</td>
                    <td className="td">{k.orders}</td>
                    <td className="td">{money(k.spend)}</td>
                    <td className="td">{k.sales > 0 ? pct(k.spend / k.sales, 0) : "-"}</td>
                    <td className="td">{k.state === "PAUSED" ? <span className="text-amber-300">paused</span> : "active"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
