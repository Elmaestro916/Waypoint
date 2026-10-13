import { admin, unwrap } from "@/lib/db";
import { buildTsQuery } from "../query";
import { convert } from "../fx";
import { safeUrl } from "../security";
import type { Condition, Offer, SearchCtx, SearchSource } from "../types";

interface Row {
  offerId: string; productId: string; title: string; brand: string; brandSlug: string; imageUrl: string | null;
  gtin: string | null; retailerSlug: string; retailerName: string; retailerDemo: boolean; price: number | string;
  currency: string; condition: string; inStock: boolean; url: string; shipsTo: string[]; rating: number | string | null;
  reviewCount: number | null; fetchedAt: string;
}

/** Imported affiliate feeds, searched in Postgres (full-text + typo tolerance) and filtered by shipping country. */
export const catalogSource: SearchSource = {
  id: "catalog",
  enabled: () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  async search(ctx: SearchCtx): Promise<Offer[]> {
    // The SQL filters price in the offer's own currency, so price filters are applied after conversion below.
    const rows = unwrap<Row[]>(
      await admin().rpc("search_catalog", {
        p_tsq: buildTsQuery(ctx.tokens, "and"),
        p_raw: ctx.q,
        p_country: ctx.country,
        p_min: null,
        p_max: null,
        p_brand_slug: ctx.brandSlug ?? null,
        p_category_slug: ctx.categorySlug ?? null,
        p_limit: 200,
      })
    );
    const out: Offer[] = [];
    for (const r of rows) {
      const price = Number(r.price);
      const inDisplay = convert(price, r.currency.trim(), ctx.displayCurrency, ctx.rates);
      if (ctx.min != null && Number.isFinite(inDisplay) && inDisplay < ctx.min) continue;
      if (ctx.max != null && Number.isFinite(inDisplay) && inDisplay > ctx.max) continue;
      if (ctx.condition === "new" && r.condition === "used") continue;
      if (ctx.condition === "used" && r.condition === "new") continue;
      out.push({
        key: `catalog:${r.offerId}`,
        source: "catalog",
        retailerSlug: r.retailerSlug,
        retailerName: r.retailerName,
        productId: r.productId,
        title: r.title,
        brand: r.brand || null,
        imageUrl: safeUrl(r.imageUrl),
        price,
        currency: r.currency.trim(),
        condition: r.condition as Condition,
        inStock: r.inStock,
        url: r.url,
        rating: r.rating == null ? null : Number(r.rating),
        reviewCount: r.reviewCount,
        shipsTo: r.shipsTo?.length ? r.shipsTo : null,
        fetchedAt: r.fetchedAt,
        gtin: r.gtin,
        demo: r.retailerDemo,
        affiliate: !r.retailerDemo,
      });
    }
    return out;
  },
};
