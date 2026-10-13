import { getCountry } from "../countries";
import type { Offer, SearchCtx, SearchSource } from "../types";

/**
 * Shopify Global Catalog (MCP, JSON-RPC `tools/call` -> `search_catalog`), which searches products across
 * millions of Shopify stores. Per Shopify's terms for the catalog: results are NOT cached or stored by this
 * adapter, and the product/checkout URLs are returned untouched. Prices arrive in minor units (8999 = 89.99).
 * Env: SHOPIFY_AGENT_PROFILE_URL (your hosted UCP agent profile declaring dev.ucp.shopping.catalog.search and
 * dev.shopify.catalog.global), SHOPIFY_CATALOG_TOKEN (optional bearer), SHOPIFY_CATALOG_URL (override for tests).
 * Shopify's docs do not describe token issuance on the page this was built from, so confirm access in Shopify's
 * agent onboarding before enabling it.
 */
const endpoint = () => process.env.SHOPIFY_CATALOG_URL ?? "https://catalog.shopify.com/api/ucp/mcp";

interface Money { amount: number; currency: string }
interface SProduct {
  id: string; title: string; url?: string; media?: { url: string }[];
  price_range?: { min: Money; max: Money };
  variants?: { id: string; price?: Money; checkout_url?: string; availability?: { available?: boolean }; seller?: { name?: string; id?: string } }[];
}

export const shopifySource: SearchSource = {
  id: "shopify",
  enabled: () => Boolean(process.env.SHOPIFY_AGENT_PROFILE_URL),
  async search(ctx: SearchCtx): Promise<Offer[]> {
    const c = getCountry(ctx.country);
    const filters: Record<string, unknown> = { available: true, ships_to: [c.code] };
    const price: Record<string, number> = {};
    // Minor units in the shopper's currency (the catalog converts to the buyer's context currency).
    if (ctx.min != null) price.min = Math.round(ctx.min * 100);
    if (ctx.max != null) price.max = Math.round(ctx.max * 100);
    if (Object.keys(price).length) filters.price = price;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.SHOPIFY_CATALOG_TOKEN) headers.Authorization = `Bearer ${process.env.SHOPIFY_CATALOG_TOKEN}`;
    const res = await fetch(endpoint(), {
      method: "POST",
      headers,
      signal: ctx.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "search_catalog",
          arguments: {
            meta: { "ucp-agent": { profile: process.env.SHOPIFY_AGENT_PROFILE_URL } },
            catalog: {
              query: ctx.q,
              filters,
              context: { address_country: c.code },
              pagination: { limit: Math.min(ctx.limit, 10) }, // Shopify's MCP caps page size around 10
            },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`Shopify catalog ${res.status}`);
    const j = (await res.json()) as { result?: { structuredContent?: { products?: SProduct[] } }; error?: { message: string } };
    if (j.error) throw new Error(`Shopify catalog: ${j.error.message}`);
    const now = new Date().toISOString();
    const offers: Offer[] = [];
    for (const p of j.result?.structuredContent?.products ?? []) {
      const v = p.variants?.find((x) => x.availability?.available !== false && x.price) ?? p.variants?.[0];
      const money = v?.price ?? p.price_range?.min;
      const dest = p.url ?? v?.checkout_url;
      if (!money || !dest) continue;
      // Compare in the shopper's display currency when conversion is possible, otherwise keep store currency.
      const major = money.amount / 100;
      offers.push({
        key: `shopify:${p.id}`,
        source: "shopify",
        retailerSlug: "shopify",
        retailerName: v?.seller?.name ?? "Shopify store",
        productId: null,
        groupKey: p.id,
        title: p.title,
        brand: null,
        imageUrl: p.media?.[0]?.url ?? null,
        price: major,
        currency: money.currency,
        condition: "unknown",
        inStock: v?.availability?.available ?? null,
        url: dest,
        rating: null,
        reviewCount: null,
        shipsTo: [c.code],
        fetchedAt: now,
        gtin: null,
        demo: false,
        affiliate: false, // earning commission on Shopify results requires Shopify's invite-only placement program
      });
    }
    return offers;
  },
};
