import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { unwrap } from "@/lib/db";
import type { Campaign, Product } from "@/lib/types";
import { money, safeJson } from "@/lib/util";
import { unitProfit } from "@/lib/amazon/fees";
import ActionButton from "@/components/ActionButton";

export const dynamic = "force-dynamic";

const tone: Record<string, string> = {
  live: "bg-emerald-500/15 text-emerald-300",
  paused: "bg-amber-500/15 text-amber-300",
  pending_approval: "bg-sky-500/15 text-sky-300",
  rejected: "bg-red-500/15 text-red-300",
};

export default async function Products() {
  await requireUser();
  const products = unwrap<(Product & { campaigns: Campaign[] })[]>(
    await supabaseServer().from("Product").select("*, campaigns:Campaign(*)").order("createdAt", { ascending: false }),
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-white">Products</h1>
      {products.length === 0 && <div className="card text-sm text-slate-400">No products yet. Prepare one from Opportunities.</div>}
      <div className="space-y-4">
        {products.map((p) => {
          const bullets = safeJson<string[]>(p.bullets, []);
          const spend = p.campaigns.reduce((s, c) => s + c.spend, 0);
          const sales = p.campaigns.reduce((s, c) => s + c.sales, 0);
          return (
            <div key={p.id} className="card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                  <h3 className="font-semibold text-white">{p.title}</h3>
                  <p className="text-xs text-slate-500">{p.sku}{p.asin ? ` · ${p.asin}` : ""}</p>
                </div>
                <span className={`badge ${tone[p.status] ?? "bg-ink-700 text-slate-300"}`}>{p.status.replace("_", " ")}</span>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                <div><dt className="label">Price</dt><dd>{money(p.price)} <span className="text-xs text-slate-500">({money(p.minPrice)}-{money(p.maxPrice)})</span></dd></div>
                <div><dt className="label">COGS</dt><dd>{money(p.cogs)}</dd></div>
                <div><dt className="label">Profit / unit</dt><dd>{money(unitProfit(p.price, p.cogs, p.fulfillment))}</dd></div>
                <div><dt className="label">Stock</dt><dd>{p.stock}</dd></div>
                <div><dt className="label">Ad spend / sales</dt><dd>{money(spend)} / {money(sales)}</dd></div>
              </dl>
              {bullets.length > 0 && (
                <details className="text-sm text-slate-400">
                  <summary className="cursor-pointer text-slate-300">Listing copy</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
                  <p className="mt-2">{p.description}</p>
                </details>
              )}
              <div className="flex flex-wrap gap-2">
                {p.status === "pending_approval" && (
                  <>
                    <ActionButton url={`/api/products/${p.id}`} body={{ action: "approve" }} variant="primary" confirm="Approve this product? This lists it and starts ad spend within your caps.">Approve &amp; launch</ActionButton>
                    <ActionButton url={`/api/products/${p.id}`} body={{ action: "reject" }} variant="danger">Reject</ActionButton>
                  </>
                )}
                {p.status === "live" && <ActionButton url={`/api/products/${p.id}`} body={{ action: "pause" }}>Pause</ActionButton>}
                {p.status === "paused" && <ActionButton url={`/api/products/${p.id}`} body={{ action: "resume" }}>Resume</ActionButton>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
