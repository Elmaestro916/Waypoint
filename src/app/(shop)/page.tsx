import Hero from "@/components/shop/Hero";
import { admin } from "@/lib/db";
import { shopCountry } from "@/lib/shop/server";
import { TtlCache, withTimeout } from "@/lib/shop/security";

export const dynamic = "force-dynamic";

const EXAMPLES = ["running shoes under $80", "used iPhone", "ankara fabric", "standing desk", "coffee grinder"];

type Store = { slug: string; name: string; kind: string; demo: boolean; countries: string[] };
const storeCache = new TtlCache<Store[]>(1);

async function load(): Promise<Store[]> {
  const { data } = await admin().from("Retailer").select("slug,name,kind,countries,demo").eq("active", true).order("name");
  return (data ?? []) as Store[];
}

// Cached for 5 minutes and abandoned after 800ms, so a slow database never delays the home page.
async function stores(country: string): Promise<Store[]> {
  const all = storeCache.get("all") ?? (await withTimeout<Store[] | null>(load(), 800, null));
  if (all) storeCache.set("all", all, 5 * 60_000);
  return (all ?? []).filter((r) => !r.countries.length || r.countries.includes(country));
}

export default async function Home() {
  const c = shopCountry();
  const list = await stores(c.code);
  return (
    <>
      <Hero examples={EXAMPLES} />
      <section className="mx-auto max-w-5xl px-5 py-10">
        <h2 className="font-sign text-3xl font-semibold">Searching stores that ship to {c.name}</h2>
        <p className="mt-2 max-w-2xl text-road-mute">
          Prices are shown in {c.currency}. Change the country in the top corner and every store, price and shipping check changes with it.
        </p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {["Amazon", "eBay", "Shopify stores", ...list.map((s) => s.name)].filter((v, i, a) => a.indexOf(v) === i).map((n) => (
            <li key={n} className="rounded-md border border-road-line bg-white px-3 py-1.5 text-sm font-medium">{n}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-road-mute">Stores without a public product feed (some marketplaces) open to their own search results for your query.</p>
      </section>
    </>
  );
}
