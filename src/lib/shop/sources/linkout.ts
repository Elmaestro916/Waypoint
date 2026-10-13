import { admin, unwrap } from "@/lib/db";
import { TtlCache, safeUrl } from "../security";
import type { LinkOut } from "../types";

interface R {
  slug: string; name: string; domain: string; countries: string[]; searchUrl: string | null; affiliateParams: string; commissionRate: number | string;
}

const cache = new TtlCache<R[]>(1);

/**
 * "Link" retailers (Jumia, Jiji, Konga, AliExpress...) have no public product API we can query, so shoppers get a
 * one-tap handoff to that store's own search page for their query. Nothing about their products is shown or stored.
 * The search URL template and affiliate params are data in the Retailer table; they ship UNVERIFIED and must be
 * checked by an admin before launch (a wrong template just opens that store's home or a 404).
 */
export function buildLinkOutUrl(template: string, q: string, affiliateParams = ""): string | null {
  if (!template.includes("{q}")) return null;
  const url = safeUrl(template.replace("{q}", encodeURIComponent(q)));
  if (!url) return null;
  if (!affiliateParams) return url;
  const u = new URL(url);
  for (const [k, v] of new URLSearchParams(affiliateParams)) u.searchParams.set(k, v);
  return u.toString();
}

export async function linkOutsFor(q: string, country: string): Promise<LinkOut[]> {
  let rows = cache.get("all");
  if (!rows) {
    rows = unwrap<R[]>(
      await admin().from("Retailer").select("slug,name,domain,countries,searchUrl,affiliateParams,commissionRate").eq("kind", "link").eq("active", true)
    );
    cache.set("all", rows, 5 * 60_000);
  }
  const out: LinkOut[] = [];
  for (const r of rows) {
    if (!r.searchUrl) continue;
    if (r.countries.length && !r.countries.includes(country)) continue;
    const url = buildLinkOutUrl(r.searchUrl, q, r.affiliateParams);
    if (url) out.push({ slug: r.slug, name: r.name, domain: r.domain, url, affiliate: Boolean(r.affiliateParams) });
  }
  return out;
}

export async function retailerRates(): Promise<Record<string, number>> {
  const rows = unwrap<{ slug: string; commissionRate: number | string }[]>(await admin().from("Retailer").select("slug,commissionRate"));
  return Object.fromEntries(rows.map((r) => [r.slug, Number(r.commissionRate)]));
}
