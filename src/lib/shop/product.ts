import { admin, unwrap, unwrapMaybe } from "@/lib/db";
import { convert, getRates } from "./fx";
import { safeUrl } from "./security";
import { getCountry } from "./countries";
import { groupOffers } from "./rank";
import { tokenize } from "./query";
import type { Condition, Offer, ProductGroup, Rates } from "./types";

export interface Product {
  id: string; slug: string; title: string; brand: string; brandSlug: string; category: string; categorySlug: string;
  imageUrl: string | null; description: string; gtin: string | null;
}
interface OfferRow {
  id: string; retailerSlug: string; price: number | string; currency: string; condition: string; inStock: boolean; url: string;
  shipsTo: string[]; rating: number | string | null; reviewCount: number | null; fetchedAt: string;
  Retailer: { name: string; demo: boolean; countries: string[] } | null;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = "id,slug,title,brand,brandSlug,category,categorySlug,imageUrl,description,gtin";

export async function findProduct(key: string): Promise<Product | null> {
  const col = UUID.test(key) ? "id" : "slug";
  return unwrapMaybe<Product>(await admin().from("CatalogProduct").select(COLS).eq(col, key).maybeSingle());
}

export async function productOffers(productId: string, country: string, displayCurrency: string, rates: Rates): Promise<{ group: ProductGroup | null; demo: boolean; hiddenForCountry: number }> {
  const rows = unwrap<OfferRow[]>(
    await admin().from("Offer").select("id,retailerSlug,price,currency,condition,inStock,url,shipsTo,rating,reviewCount,fetchedAt,Retailer(name,demo,countries)").eq("productId", productId)
  );
  const reachable = rows.filter((o) => {
    const ships = o.shipsTo.length ? o.shipsTo : o.Retailer?.countries ?? [];
    return !ships.length || ships.includes(country);
  });
  const offers: Offer[] = reachable.flatMap((o) => {
    const url = safeUrl(o.url);
    return url ? [{
      key: `catalog:${o.id}`, source: "catalog" as const, retailerSlug: o.retailerSlug, retailerName: o.Retailer?.name ?? o.retailerSlug, productId,
      title: "", brand: null, imageUrl: null, price: Number(o.price), currency: o.currency.trim(), condition: o.condition as Condition, inStock: o.inStock,
      url, rating: o.rating == null ? null : Number(o.rating), reviewCount: o.reviewCount, shipsTo: o.shipsTo.length ? o.shipsTo : null,
      fetchedAt: o.fetchedAt, gtin: null, demo: Boolean(o.Retailer?.demo), affiliate: !o.Retailer?.demo,
    }] : [];
  });
  const groups = groupOffers(offers.map((o) => ({ ...o, productId })), [], displayCurrency, rates);
  return { group: groups[0] ?? null, demo: reachable.some((o) => o.Retailer?.demo), hiddenForCountry: rows.length - reachable.length };
}

export interface HistoryPoint { day: string; price: number }

/** Cheapest daily price in the display currency (snapshots in other currencies are converted, lowest wins). */
export async function priceHistory(productId: string, displayCurrency: string, rates: Rates, days = 120): Promise<HistoryPoint[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = unwrap<{ day: string; currency: string; minPrice: number | string }[]>(
    await admin().from("PriceSnapshot").select("day,currency,minPrice").eq("productId", productId).gte("day", since).order("day")
  );
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const v = convert(Number(r.minPrice), r.currency.trim(), displayCurrency, rates);
    if (!Number.isFinite(v)) continue;
    byDay.set(r.day, Math.min(byDay.get(r.day) ?? Infinity, v));
  }
  return [...byDay].map(([day, price]) => ({ day, price }));
}

export async function relatedProducts(p: Product, limit = 6): Promise<{ slug: string; title: string; brand: string }[]> {
  if (!p.categorySlug) return [];
  return unwrap<{ slug: string; title: string; brand: string }[]>(
    await admin().from("CatalogProduct").select("slug,title,brand").eq("categorySlug", p.categorySlug).neq("id", p.id).limit(limit)
  );
}

export { getCountry, getRates, tokenize };
