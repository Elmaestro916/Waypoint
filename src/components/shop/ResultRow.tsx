import { formatMoney, convert } from "@/lib/shop/fx";
import { timeAgo } from "@/lib/shop/format";
import type { GroupView, OfferView } from "@/lib/shop/view";
import type { Rates } from "@/lib/shop/types";
import Link from "next/link";
import OutLink from "./OutLink";
import WatchButton from "./WatchButton";

const SOURCE_NOTE: Record<string, string> = { ebay: "Marketplace listing", shopify: "Independent store", catalog: "" };

function Dot({ on }: { on: boolean }) {
  return on ? <span title="Affiliate link: the store may pay us if you buy" aria-label="Affiliate link" className="inline-block h-2 w-2 rounded-full bg-road-yellow ring-1 ring-road-ink" /> : null;
}

export function OfferLine({ o, currency, rates, locale, best }: { o: OfferView; currency: string; rates: Rates; locale: string; best?: boolean }) {
  const shown = convert(o.price, o.currency, currency, rates);
  const native = o.currency !== currency;
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium"><span className="truncate">{o.retailerName}</span><Dot on={o.affiliate} /></span>
        <span className="block truncate text-xs text-road-mute">
          {[SOURCE_NOTE[o.source], o.condition !== "new" && o.condition !== "unknown" ? o.condition : "", o.inStock === false ? "Out of stock" : "", `read ${timeAgo(o.fetchedAt)}`].filter(Boolean).join(", ")}
        </span>
      </span>
      <span className="text-right">
        <span className={`block font-sign text-xl font-semibold ${best ? "rounded bg-road-yellow px-1.5" : ""}`}>{formatMoney(shown, currency, locale)}</span>
        {native && <span className="block text-xs text-road-mute">{formatMoney(o.price, o.currency, locale)} at the store</span>}
      </span>
      <OutLink href={o.url} token={o.token} affiliate={o.affiliate} label={`Open ${o.retailerName}`} className="shrink-0 rounded-md border-2 border-road-ink px-3 py-1.5 text-sm font-semibold hover:bg-road-ink hover:text-white">
        Go to store
      </OutLink>
    </li>
  );
}

export default function ResultRow({ g, currency, country, rates, locale, signedIn }: {
  g: GroupView; currency: string; country: string; rates: Rates; locale: string; signedIn: boolean;
}) {
  const rest = g.offers.slice(1);
  return (
    <article className="grid grid-cols-[88px_1fr] gap-x-4 border-b border-road-line py-5 sm:grid-cols-[120px_1fr]">
      <div className="row-span-2 flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-lg border border-road-line bg-white sm:h-[120px] sm:w-[120px]">
        {g.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={g.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain" />
        ) : (
          <span aria-hidden className="font-sign text-3xl text-road-line">{g.title.slice(0, 1)}</span>
        )}
      </div>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold leading-snug sm:text-xl">{g.productId ? <Link href={`/p/${g.productId}`} className="hover:underline">{g.title}</Link> : g.title}</h2>
        <p className="text-sm text-road-mute">
          {[g.brand, g.offers.length > 1 ? `${g.offers.length} stores` : "1 store", g.best.rating ? `${g.best.rating.toFixed(1)} rating` : ""].filter(Boolean).join(", ")}
        </p>
      </div>
      <div className="col-start-2 mt-2 min-w-0">
        <ul className="divide-y divide-road-line/70">
          <OfferLine o={g.best} currency={currency} rates={rates} locale={locale} best={g.offers.length > 1} />
        </ul>
        {rest.length > 0 && (
          <details className="group mt-1">
            <summary className="cursor-pointer py-1 text-sm font-medium text-road-blue">
              <span className="group-open:hidden">Compare {rest.length} more {rest.length === 1 ? "store" : "stores"}</span>
              <span className="hidden group-open:inline">Hide other stores</span>
            </summary>
            <ul className="divide-y divide-road-line/70">
              {rest.map((o) => <OfferLine key={o.key} o={o} currency={currency} rates={rates} locale={locale} />)}
            </ul>
          </details>
        )}
        {g.productId && (
          <div className="mt-2"><WatchButton productId={g.productId} currency={currency} country={country} suggested={g.bestPrice} signedIn={signedIn} /></div>
        )}
      </div>
    </article>
  );
}
