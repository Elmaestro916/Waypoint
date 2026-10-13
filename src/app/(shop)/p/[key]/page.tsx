import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import PriceChart from "@/components/shop/PriceChart";
import ResultRow, { OfferLine } from "@/components/shop/ResultRow";
import ShareButton from "@/components/shop/ShareButton";
import WatchButton from "@/components/shop/WatchButton";
import { formatMoney, getRates } from "@/lib/shop/fx";
import { findProduct, priceHistory, productOffers, relatedProducts } from "@/lib/shop/product";
import { getCountry } from "@/lib/shop/countries";
import { shopCountry, signedInUserId } from "@/lib/shop/server";
import { signClick } from "@/lib/shop/security";
import type { OfferView } from "@/lib/shop/view";

export const dynamic = "force-dynamic";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata({ params }: { params: { key: string } }): Promise<Metadata> {
  const p = await findProduct(params.key).catch(() => null);
  if (!p) return { title: "Product not found", robots: { index: false } };
  const { demo } = await productOffers(p.id, "US", "USD", await getRates()).catch(() => ({ demo: true }));
  return {
    title: `${p.title}: compare prices`,
    description: `Compare prices for ${p.title}${p.brand ? " by " + p.brand : ""} across stores that ship to you.`,
    alternates: { canonical: `${SITE}/p/${p.slug}` },
    robots: demo ? { index: false, follow: false } : undefined, // sample products must never be indexed
  };
}

export default async function Page({ params }: { params: { key: string } }) {
  const p = await findProduct(params.key);
  if (!p) notFound();
  if (params.key !== p.slug) permanentRedirect(`/p/${p.slug}`);

  const country = shopCountry();
  const loc = getCountry(country.code).locale;
  const rates = await getRates();
  const [{ group, demo, hiddenForCountry }, history, related, uid] = await Promise.all([
    productOffers(p.id, country.code, country.currency, rates),
    priceHistory(p.id, country.currency, rates),
    relatedProducts(p),
    signedInUserId(),
  ]);

  const tok = (o: NonNullable<typeof group>["offers"][number], pos: number): OfferView => ({
    ...o, pos, token: signClick({ k: o.key, r: o.retailerSlug, s: o.source, p: p.id, n: pos, a: o.price, c: o.currency, q: `product:${p.slug}`, co: country.code }),
  });
  const offers = group?.offers.map((o, i) => tok(o, i + 1)) ?? [];

  const jsonLd = group && !demo ? {
    "@context": "https://schema.org", "@type": "Product", name: p.title, image: p.imageUrl ?? undefined, description: p.description || undefined,
    brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined, gtin: p.gtin ?? undefined,
    offers: {
      "@type": "AggregateOffer", priceCurrency: country.currency, lowPrice: group.bestPrice.toFixed(2),
      highPrice: Math.max(...offers.map((o) => o.price)).toFixed(2), offerCount: offers.length,
    },
  } : null;

  return (
    <article className="mx-auto max-w-4xl px-5 py-8">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
      <nav aria-label="Breadcrumb" className="text-sm text-road-mute">
        <Link href="/" className="hover:underline">Home</Link>
        {p.category && <> / <Link href={`/category/${p.categorySlug}`} className="hover:underline">{p.category}</Link></>}
      </nav>
      {demo && <p role="note" className="mt-4 rounded-md border-2 border-road-ink bg-road-yellow px-3 py-2 text-sm font-medium">Sample data: this is a made-up product for demonstration. Its links don&rsquo;t lead to a real store.</p>}

      <div className="mt-4 grid gap-6 sm:grid-cols-[200px_1fr]">
        <div className="flex h-[200px] w-[200px] items-center justify-center overflow-hidden rounded-xl border border-road-line bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.imageUrl ? <img src={p.imageUrl} alt={p.title} referrerPolicy="no-referrer" className="h-full w-full object-contain" /> : <span aria-hidden className="font-sign text-6xl text-road-line">{p.title.slice(0, 1)}</span>}
        </div>
        <div>
          <h1 className="font-sign text-4xl font-bold leading-tight sm:text-5xl">{p.title}</h1>
          {p.brand && <p className="mt-1 text-road-mute">by <Link href={`/brand/${p.brandSlug}`} className="underline">{p.brand}</Link></p>}
          {group ? (
            <p className="mt-4 text-lg">From <strong className="font-sign text-3xl">{formatMoney(group.bestPrice, country.currency, loc)}</strong> at {group.best.retailerName}, in {offers.length} {offers.length === 1 ? "store" : "stores"} shipping to {country.name}.</p>
          ) : (
            <p className="mt-4 text-lg">No store we know of ships this to {country.name} right now{hiddenForCountry ? ` (${hiddenForCountry} ${hiddenForCountry === 1 ? "store ships" : "stores ship"} elsewhere)` : ""}. Change the country in the top corner to see other options.</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-4"><ShareButton title={p.title} path={`/p/${p.slug}`} /><WatchButton productId={p.id} currency={country.currency} country={country.code} suggested={group?.bestPrice ?? 10} signedIn={Boolean(uid)} /></div>
        </div>
      </div>

      {group && (
        <section aria-labelledby="stores" className="mt-8">
          <h2 id="stores" className="font-sign text-3xl font-semibold">Where to buy</h2>
          <ul className="mt-2 divide-y divide-road-line border-y border-road-line">
            {offers.map((o, i) => <OfferLine key={o.key} o={o} currency={country.currency} rates={rates} locale={loc} best={i === 0 && offers.length > 1} />)}
          </ul>
        </section>
      )}

      <section aria-labelledby="hist" className="mt-8">
        <h2 id="hist" className="font-sign text-3xl font-semibold">Price history</h2>
        <div className="mt-2"><PriceChart points={history} currency={country.currency} locale={loc} /></div>
      </section>

      {p.description && (
        <section className="mt-8 max-w-2xl"><h2 className="font-sign text-3xl font-semibold">About this product</h2><p className="mt-2 text-lg leading-relaxed">{p.description}</p></section>
      )}

      {related.length > 0 && (
        <section aria-labelledby="rel" className="mt-10">
          <h2 id="rel" className="font-sign text-3xl font-semibold">More in {p.category}</h2>
          <ul className="mt-2 divide-y divide-road-line border-y border-road-line">
            {related.map((r) => <li key={r.slug}><Link href={`/p/${r.slug}`} className="flex justify-between gap-3 py-3 hover:underline"><span className="font-medium">{r.title}</span><span className="text-road-mute">{r.brand}</span></Link></li>)}
          </ul>
        </section>
      )}
    </article>
  );
}
