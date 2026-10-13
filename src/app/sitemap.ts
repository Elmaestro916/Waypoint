import type { MetadataRoute } from "next";
import { admin } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const pages: MetadataRoute.Sitemap = ["", "/how-we-earn", "/sell"].map((p) => ({ url: base + p, changeFrequency: "weekly" as const }));
  try {
    // Only products carried by at least one real (non-sample) store are listed.
    const { data } = await admin().from("Offer").select("productId, CatalogProduct!inner(slug,updatedAt), Retailer!inner(demo)").eq("Retailer.demo", false).limit(5000);
    const seen = new Set<string>();
    for (const r of (data ?? []) as unknown as { productId: string; CatalogProduct: { slug: string; updatedAt: string } }[]) {
      if (seen.has(r.productId)) continue;
      seen.add(r.productId);
      pages.push({ url: `${base}/p/${r.CatalogProduct.slug}`, lastModified: r.CatalogProduct.updatedAt, changeFrequency: "daily" });
    }
  } catch {
    // database unavailable: serve the static pages
  }
  return pages;
}
