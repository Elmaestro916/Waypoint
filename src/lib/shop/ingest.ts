import { admin, check, unwrap } from "@/lib/db";

export interface FeedRow {
  retailer: string; externalId: string; gtin?: string; brand?: string; title: string; category?: string; imageUrl?: string;
  description?: string; price: number; currency: string; condition?: "new" | "used" | "refurbished" | "unknown";
  inStock?: boolean; url: string; shipsTo?: string[]; rating?: number; reviewCount?: number;
}

export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/\p{M}+/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const normTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Same product across stores: GTIN when the feed has one, otherwise brand + normalised title. */
export function dedupeKey(r: Pick<FeedRow, "gtin" | "brand" | "title">): string {
  const g = (r.gtin ?? "").replace(/\D/g, "");
  return g.length >= 8 ? `gtin:${g}` : `t:${slugify(r.brand ?? "")}|${normTitle(r.title)}`;
}

/** Validates one feed row; returns an error string or null. */
export function rowProblem(r: FeedRow): string | null {
  if (!r.retailer || !r.externalId || !r.title) return "missing retailer, externalId or title";
  if (!Number.isFinite(r.price) || r.price < 0) return "bad price";
  if (!/^[A-Z]{3}$/.test(r.currency)) return "currency must be a 3-letter code like USD";
  if (!/^https?:\/\//i.test(r.url)) return "url must start with http(s)://";
  return null;
}

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { cur.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; cur.push(f); f = ""; if (cur.some((x) => x !== "")) rows.push(cur); cur = []; }
    else f += c;
  }
  if (f !== "" || cur.length) { cur.push(f); if (cur.some((x) => x !== "")) rows.push(cur); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

export function csvToFeedRow(r: Record<string, string>): FeedRow {
  const n = (v?: string) => (v ? Number(v) : undefined);
  return {
    retailer: r.retailer, externalId: r.externalId, gtin: r.gtin || undefined, brand: r.brand || undefined, title: r.title,
    category: r.category || undefined, imageUrl: r.imageUrl || undefined, description: r.description || undefined,
    price: Number(r.price), currency: (r.currency || "").toUpperCase(), condition: (r.condition as FeedRow["condition"]) || "new",
    inStock: r.inStock ? !/^(0|false|no|out)/i.test(r.inStock) : true, url: r.url,
    shipsTo: r.shipsTo ? r.shipsTo.split(/[|;]/).map((s) => s.trim().toUpperCase()).filter(Boolean) : undefined,
    rating: n(r.rating), reviewCount: n(r.reviewCount),
  };
}

export async function upsertFeedRows(rows: FeedRow[]): Promise<{ products: number; offers: number; skipped: { row: number; why: string }[] }> {
  const skipped: { row: number; why: string }[] = [];
  const good: FeedRow[] = [];
  rows.forEach((r, i) => { const p = rowProblem(r); if (p) skipped.push({ row: i + 2, why: p }); else good.push(r); });
  const db = admin();

  const slugs = [...new Set(good.map((r) => r.retailer))];
  const known = new Set(unwrap<{ slug: string }[]>(await db.from("Retailer").select("slug").in("slug", slugs)).map((r) => r.slug));
  const usable = good.filter((r) => known.has(r.retailer) || (skipped.push({ row: rows.indexOf(r) + 2, why: `unknown retailer "${r.retailer}" (add it to the Retailer table first)` }), false));

  const products = new Map<string, Record<string, unknown>>();
  for (const r of usable) {
    const k = dedupeKey(r);
    if (!products.has(k)) {
      products.set(k, {
        dedupeKey: k, gtin: (r.gtin ?? "").replace(/\D/g, "") || null, brand: r.brand ?? "", brandSlug: slugify(r.brand ?? ""),
        title: r.title, category: r.category ?? "", categorySlug: slugify(r.category ?? ""), imageUrl: r.imageUrl ?? null,
        description: r.description ?? "", updatedAt: new Date().toISOString(),
      });
    }
  }
  const ids = new Map<string, string>();
  const list = [...products.values()];
  for (let i = 0; i < list.length; i += 500) {
    const saved = unwrap<{ id: string; dedupeKey: string }[]>(await db.from("CatalogProduct").upsert(list.slice(i, i + 500), { onConflict: "dedupeKey" }).select("id,dedupeKey"));
    for (const s of saved) ids.set(s.dedupeKey, s.id);
  }
  const offers = usable.map((r) => ({
    productId: ids.get(dedupeKey(r)), retailerSlug: r.retailer, externalId: r.externalId, price: r.price, currency: r.currency,
    condition: r.condition ?? "new", inStock: r.inStock ?? true, url: r.url, shipsTo: r.shipsTo ?? [],
    rating: r.rating ?? null, reviewCount: r.reviewCount ?? null, fetchedAt: new Date().toISOString(),
  }));
  for (let i = 0; i < offers.length; i += 500) {
    check(await db.from("Offer").upsert(offers.slice(i, i + 500), { onConflict: "retailerSlug,externalId" }));
  }
  return { products: ids.size, offers: offers.length, skipped };
}
