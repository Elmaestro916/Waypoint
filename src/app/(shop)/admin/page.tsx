import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EarningsImport from "@/components/shop/EarningsImport";
import { admin, unwrap } from "@/lib/db";
import { getUser, isAdminEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false } };

const usd = (n: number) => `$${n.toFixed(2)}`;

export default async function Page() {
  const u = await getUser().catch(() => null);
  if (!u || !isAdminEmail(u.email)) notFound();
  const db = admin();
  const [clicks, top, zero, health, earn] = await Promise.all([
    db.rpc("admin_click_stats", { p_days: 30 }).then((r) => unwrap<{ day: string; retailerSlug: string; clicks: number; estCommission: number }[]>(r)),
    db.rpc("admin_top_queries", { p_days: 30, p_zero_only: false, p_limit: 15 }).then((r) => unwrap<{ query: string; searches: number; avgResults: number }[]>(r)),
    db.rpc("admin_top_queries", { p_days: 30, p_zero_only: true, p_limit: 15 }).then((r) => unwrap<{ query: string; searches: number }[]>(r)),
    db.rpc("admin_source_health", { p_hours: 24 }).then((r) => unwrap<{ source: string; status: string; n: number }[]>(r)),
    db.from("Earning").select("retailerSlug,periodStart,periodEnd,clicks,orders,commission,currency").order("periodEnd", { ascending: false }).limit(20).then((r) => unwrap<{ retailerSlug: string; periodStart: string; periodEnd: string; clicks: number; orders: number; commission: number; currency: string }[]>(r)),
  ]);
  const byRetailer = new Map<string, { clicks: number; est: number }>();
  for (const c of clicks) {
    const a = byRetailer.get(c.retailerSlug) ?? { clicks: 0, est: 0 };
    a.clicks += Number(c.clicks); a.est += Number(c.estCommission);
    byRetailer.set(c.retailerSlug, a);
  }
  const totalClicks = [...byRetailer.values()].reduce((s, x) => s + x.clicks, 0);
  const totalEst = [...byRetailer.values()].reduce((s, x) => s + x.est, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-5 py-10">
      <div>
        <h1 className="font-sign text-5xl font-bold">Earnings and search health</h1>
        <p className="mt-2 text-road-mute">Last 30 days: {totalClicks} outbound clicks, about {usd(totalEst)} estimated commission. Estimates use each store&rsquo;s commissionRate, which is 0 until you set it from a real affiliate agreement. Reported earnings below are what the networks actually paid.</p>
      </div>

      <section>
        <h2 className="font-sign text-3xl font-semibold">Clicks by store</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead><tr className="border-b border-road-line text-road-mute"><th className="py-2">Store</th><th>Clicks</th><th>Estimated commission</th></tr></thead>
          <tbody>{[...byRetailer].sort((a, b) => b[1].clicks - a[1].clicks).map(([k, v]) => <tr key={k} className="border-b border-road-line/60"><td className="py-2 font-medium">{k}</td><td>{v.clicks}</td><td>{usd(v.est)}</td></tr>)}</tbody>
        </table>
        {byRetailer.size === 0 && <p className="mt-3 text-road-mute">No clicks yet.</p>}
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="font-sign text-3xl font-semibold">Top searches</h2>
          <ul className="mt-3 divide-y divide-road-line/60 text-sm">{top.map((t) => <li key={t.query} className="flex justify-between py-2"><span>{t.query}</span><span className="text-road-mute">{t.searches} searches, avg {t.avgResults} results</span></li>)}</ul>
        </div>
        <div>
          <h2 className="font-sign text-3xl font-semibold">Searches with no results</h2>
          <p className="text-sm text-road-mute">What shoppers want that you don&rsquo;t carry yet. Add a feed for these.</p>
          <ul className="mt-3 divide-y divide-road-line/60 text-sm">{zero.map((t) => <li key={t.query} className="flex justify-between py-2"><span>{t.query}</span><span className="text-road-mute">{t.searches}</span></li>)}</ul>
        </div>
      </section>

      <section>
        <h2 className="font-sign text-3xl font-semibold">Source health, last 24 hours</h2>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">{health.map((h) => <li key={h.source + h.status} className={`rounded-md border px-3 py-1.5 ${h.status === "error" ? "border-red-500 text-red-700" : "border-road-line"}`}>{h.source}: {h.status} ({h.n})</li>)}</ul>
        {health.length === 0 && <p className="mt-3 text-road-mute">No searches yet.</p>}
      </section>

      <section>
        <h2 className="font-sign text-3xl font-semibold">Reported earnings</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead><tr className="border-b border-road-line text-road-mute"><th className="py-2">Store</th><th>Period</th><th>Clicks</th><th>Orders</th><th>Commission</th></tr></thead>
          <tbody>{earn.map((e, i) => <tr key={i} className="border-b border-road-line/60"><td className="py-2 font-medium">{e.retailerSlug}</td><td>{e.periodStart} to {e.periodEnd}</td><td>{e.clicks}</td><td>{e.orders}</td><td>{e.commission} {e.currency}</td></tr>)}</tbody>
        </table>
        <div className="mt-4 max-w-2xl"><EarningsImport /></div>
      </section>
    </div>
  );
}
