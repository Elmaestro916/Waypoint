import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Filters from "@/components/shop/Filters";
import { OfferLine } from "@/components/shop/ResultRow";
import ResultRow from "@/components/shop/ResultRow";
import OutLink from "@/components/shop/OutLink";
import SearchBox from "@/components/shop/SearchBox";
import { getCountry } from "@/lib/shop/countries";
import { formatMoney } from "@/lib/shop/fx";
import { knownBrandNames, runSearch } from "@/lib/shop/search";
import { shopCountry, signedInUserId } from "@/lib/shop/server";
import { toView } from "@/lib/shop/view";
import { rateLimit } from "@/lib/shop/security";
import { headers } from "next/headers";
import type { SortMode } from "@/lib/shop/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Results", robots: { index: false, follow: true } };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (v?: string) => (v && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : undefined);
const SORTS = ["relevance", "price_asc", "price_desc", "rating"];

export default function SearchPage({ searchParams }: { searchParams: SP }) {
  const q = (one(searchParams.q) ?? "").trim().slice(0, 200);
  if (!q) redirect("/");
  // The search box paints immediately; results stream in behind it.
  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
      <div className="max-w-3xl"><SearchBox initial={q} /></div>
      <Suspense key={JSON.stringify(searchParams)} fallback={<ResultsSkeleton />}>
        <Results q={q} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Searching stores" className="mt-8 animate-pulse space-y-6">
      <div className="h-4 w-72 rounded bg-road-wash" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid grid-cols-[88px_1fr] gap-4 border-b border-road-line pb-5 sm:grid-cols-[120px_1fr]">
          <div className="h-[88px] rounded-lg bg-road-wash sm:h-[120px]" />
          <div className="space-y-3"><div className="h-5 w-2/3 rounded bg-road-wash" /><div className="h-4 w-1/3 rounded bg-road-wash" /><div className="h-10 w-full rounded bg-road-wash" /></div>
        </div>
      ))}
    </div>
  );
}

async function Results({ q, searchParams }: { q: string; searchParams: SP }) {
  const country = shopCountry();
  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`page:${ip}`, 60, 60_000)) {
    return <div className="mx-auto max-w-xl px-5 py-16"><h1 className="font-sign text-4xl font-bold">Too many searches</h1><p className="mt-3 text-road-mute">Wait a minute, then search again.</p></div>;
  }
  const sortRaw = one(searchParams.sort) ?? "";
  const cond = one(searchParams.condition);
  const res = await runSearch(
    {
      q, country: country.code,
      min: num(one(searchParams.min)), max: num(one(searchParams.max)),
      condition: cond === "new" || cond === "used" ? cond : undefined,
      brandSlug: one(searchParams.brand), categorySlug: one(searchParams.category),
      sort: (SORTS.includes(sortRaw) ? sortRaw : "relevance") as SortMode,
      page: Math.min(Math.max(1, Number(one(searchParams.page)) || 1), 20),
    },
    { session: { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown", ua: h.get("user-agent") ?? "" }, knownBrands: await knownBrandNames() }
  );
  const v = toView(res, q);
  const uid = await signedInUserId();
  const cur = v.displayCurrency;
  const loc = getCountry(v.country).locale;
  const LABEL: Record<string, string> = { catalog: "Store feeds", ebay: "eBay", amazon: "Amazon", shopify: "Shopify stores" };
  const failed = Object.entries(v.status).filter(([, s]) => s.status === "error").map(([k]) => LABEL[k] ?? k);
  const understood = [
    v.parsed.brand ? `brand ${v.parsed.brand}` : "",
    v.parsed.maxPrice ? `up to ${formatMoney(v.parsed.maxPrice, v.parsed.budgetCurrency ?? cur, loc)}` : "",
    v.parsed.minPrice ? `from ${formatMoney(v.parsed.minPrice, v.parsed.budgetCurrency ?? cur, loc)}` : "",
    v.parsed.condition ? `${v.parsed.condition} only` : "",
  ].filter(Boolean);
  const pages = Math.ceil(v.total / v.pageSize);
  const pageHref = (p: number) => {
    const n = new URLSearchParams(Object.entries(searchParams).flatMap(([k, val]) => (typeof val === "string" ? [[k, val]] : [])));
    n.set("page", String(p));
    return `/search?${n.toString()}`;
  };
  const nothing = v.groups.length === 0 && v.amazon.length === 0;

  return (
    <>
      {v.hasDemo && (
        <p role="note" className="mt-4 rounded-md border-2 border-road-ink bg-road-yellow px-3 py-2 text-sm font-medium">
          Sample data: some results below are made-up products for demonstration. Their links don&rsquo;t lead to a real store.
        </p>
      )}

      <p className="mt-5 text-sm text-road-mute" aria-live="polite">
        {v.total + v.amazon.length} {v.total + v.amazon.length === 1 ? "result" : "results"} for <strong className="text-road-ink">{v.parsed.keywords || q}</strong>
        {understood.length > 0 && <> ({understood.join(", ")})</>}, shipping to {country.name}, prices in {cur}.
        {!v.rates.live && <> Currency conversion uses approximate rates.</>}
      </p>
      {failed.length > 0 && (
        <p role="status" className="mt-2 text-sm text-amber-800">
          {failed.join(", ")} didn&rsquo;t answer in time, so results from {failed.length > 1 ? "them are" : "it is"} missing. Search again in a moment.
        </p>
      )}

      <div className="mt-4"><Suspense><Filters currency={cur} /></Suspense></div>

      <div className="mt-2">
        {v.groups.map((g) => (
          <ResultRow key={g.id} g={g} currency={cur} country={v.country} rates={v.rates} locale={loc} signedIn={Boolean(uid)} />
        ))}
      </div>

      {v.amazon.length > 0 && (
        <section aria-labelledby="amz" className="mt-8 rounded-xl border border-road-line bg-white p-5">
          <h2 id="amz" className="font-sign text-2xl font-semibold">On Amazon</h2>
          <p className="text-sm text-road-mute">Shown separately because Amazon sets its own rules for how its prices are displayed.</p>
          <ul className="mt-3 divide-y divide-road-line/70">
            {v.amazon.map((o) => (
              <li key={o.key}>
                <p className="pt-3 font-medium">{o.title}</p>
                <ul><OfferLine o={o} currency={cur} rates={v.rates} locale={loc} /></ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {nothing && (
        <div className="mt-10 max-w-xl">
          <h2 className="font-sign text-3xl font-semibold">Nothing matched &ldquo;{q}&rdquo; for {country.name}</h2>
          <p className="mt-2 text-road-mute">Try fewer words (&ldquo;nike pegasus&rdquo; instead of the full model name), remove the price limit, or check another country in the top corner.</p>
        </div>
      )}

      {v.linkOuts.length > 0 && (
        <section aria-labelledby="also" className="mt-10">
          <h2 id="also" className="font-sign text-2xl font-semibold">Also look in these stores</h2>
          <p className="text-sm text-road-mute">We can&rsquo;t read their prices, so these open each store&rsquo;s own results for &ldquo;{v.parsed.keywords || q}&rdquo;.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {v.linkOuts.map((l) => (
              <li key={l.slug}>
                <OutLink href={l.url} token={l.token} affiliate={l.affiliate} className="inline-flex items-center gap-2 rounded-md border-2 border-road-ink bg-white px-3 py-2 font-medium hover:bg-road-ink hover:text-white">
                  {l.name}{l.affiliate && <span aria-label="Affiliate link" className="h-2 w-2 rounded-full bg-road-yellow ring-1 ring-road-ink" />}
                </OutLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-10 flex items-center gap-4 font-medium">
          {v.page > 1 && <Link href={pageHref(v.page - 1)} className="underline">Previous</Link>}
          <span className="text-road-mute">Page {v.page} of {pages}</span>
          {v.page < pages && <Link href={pageHref(v.page + 1)} className="underline">Next</Link>}
        </nav>
      )}
    </>
  );
}
