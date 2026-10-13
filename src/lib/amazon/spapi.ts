/**
 * Selling Partner API client (live mode).
 *
 * Auth: Login With Amazon (LWA) refresh-token -> access token, sent as `x-amz-access-token`.
 * (AWS SigV4 signing is no longer required for SP-API.)
 *
 * IMPORTANT: written against the public SP-API docs but NOT exercised against a live account in this
 * scaffold. Test every call in the SP-API sandbox first. Listings need the correct `productType` and
 * attribute schema for each category (see Product Type Definitions API) - `putListing` sends a
 * generic payload you will need to adapt per category.
 */
import type { CatalogItem, ListingInput, SalesRow } from "./types";

const LWA_URL = "https://api.amazon.com/auth/o2/token";

export interface SpCreds {
  refreshToken: string;
  sellerId: string;
  marketplaceId: string;
}

const tokenCache = new Map<string, { token: string; exp: number }>();

export async function lwaToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const hit = tokenCache.get(refreshToken);
  if (hit && hit.exp > Date.now() + 30_000) return hit.token;
  const res = await fetch(LWA_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`LWA token error ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(refreshToken, { token: j.access_token, exp: Date.now() + j.expires_in * 1000 });
  return j.access_token;
}

export class SpApi {
  constructor(private c: SpCreds) {}

  private async call<T>(method: string, path: string, query?: Record<string, string>, body?: unknown): Promise<T> {
    const id = process.env.SPAPI_LWA_CLIENT_ID;
    const secret = process.env.SPAPI_LWA_CLIENT_SECRET;
    if (!id || !secret) throw new Error("SPAPI_LWA_CLIENT_ID / SPAPI_LWA_CLIENT_SECRET not configured");
    const base = process.env.SPAPI_ENDPOINT ?? "https://sellingpartnerapi-na.amazon.com";
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await lwaToken(id, secret, this.c.refreshToken);
      const res = await fetch(url, {
        method,
        headers: { "x-amz-access-token": token, "content-type": "application/json", "user-agent": "AmazonAutopilot/0.1 (Language=TypeScript)" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 800 * 2 ** attempt)); // exponential backoff on throttling
        continue;
      }
      if (!res.ok) throw new Error(`SP-API ${method} ${path} -> ${res.status}: ${await res.text()}`);
      return (await res.json()) as T;
    }
    throw new Error(`SP-API ${method} ${path} failed after retries`);
  }

  /** Catalog Items API 2022-04-01 */
  async searchCatalog(keywords: string): Promise<CatalogItem[]> {
    type Resp = {
      items?: {
        asin: string;
        summaries?: { itemName?: string; browseClassification?: { displayName?: string } }[];
        salesRanks?: { ranks?: { rank: number }[] }[];
      }[];
    };
    const r = await this.call<Resp>("GET", "/catalog/2022-04-01/items", {
      keywords,
      marketplaceIds: this.c.marketplaceId,
      includedData: "summaries,salesRanks",
      pageSize: "20",
    });
    return (r.items ?? []).map((it) => {
      const rank = it.salesRanks?.[0]?.ranks?.[0]?.rank ?? 50000;
      return {
        asin: it.asin,
        title: it.summaries?.[0]?.itemName ?? it.asin,
        category: it.summaries?.[0]?.browseClassification?.displayName ?? keywords,
        // Catalog API has no price/reviews/seller counts: enrich via Product Pricing + a data provider.
        price: 0,
        salesRank: rank,
        reviewCount: 0,
        rating: 0,
        sellerCount: 0,
        estMonthlyUnits: Math.floor(Math.min(2500, Math.max(40, 400000 / Math.sqrt(rank)))),
      };
    });
  }

  /** Listings Items API 2021-08-01 (PUT creates/replaces a listing for a SKU). */
  async putListing(l: ListingInput): Promise<{ asin?: string }> {
    const mp = this.c.marketplaceId;
    const lang = [{ language_tag: "en_US", marketplace_id: mp }];
    await this.call(
      "PUT",
      `/listings/2021-08-01/items/${encodeURIComponent(this.c.sellerId)}/${encodeURIComponent(l.sku)}`,
      { marketplaceIds: mp, issueLocale: "en_US" },
      {
        productType: "PRODUCT", // TODO: resolve the real productType for the category
        requirements: "LISTING",
        attributes: {
          item_name: [{ value: l.title, ...lang[0] }],
          bullet_point: l.bullets.map((b) => ({ value: b, ...lang[0] })),
          product_description: [{ value: l.description, ...lang[0] }],
          generic_keyword: [{ value: l.keywords.join(" ").slice(0, 249), ...lang[0] }],
          purchasable_offer: [
            {
              marketplace_id: mp,
              currency: "USD",
              our_price: [{ schedule: [{ value_with_tax: l.price }] }],
            },
          ],
          fulfillment_availability: [{ fulfillment_channel_code: "DEFAULT", quantity: l.quantity }],
        },
      },
    );
    return {};
  }

  /** Price update via Listings Items PATCH. */
  async setPrice(sku: string, price: number): Promise<void> {
    const mp = this.c.marketplaceId;
    await this.call(
      "PATCH",
      `/listings/2021-08-01/items/${encodeURIComponent(this.c.sellerId)}/${encodeURIComponent(sku)}`,
      { marketplaceIds: mp },
      {
        productType: "PRODUCT",
        patches: [
          {
            op: "replace",
            path: "/attributes/purchasable_offer",
            value: [{ marketplace_id: mp, currency: "USD", our_price: [{ schedule: [{ value_with_tax: price }] }] }],
          },
        ],
      },
    );
  }

  /** Product Pricing API v0: competitive pricing / buy box. */
  async getBuyBoxPrice(asin: string): Promise<number | null> {
    type Resp = { payload?: { Product?: { CompetitivePricing?: { CompetitivePrices?: { Price?: { LandedPrice?: { Amount?: number } } }[] } }[] }[] };
    const r = await this.call<Resp>("GET", "/products/pricing/v0/competitivePrice", {
      MarketplaceId: this.c.marketplaceId,
      Asins: asin,
      ItemType: "Asin",
    });
    const amt = r.payload?.[0]?.Product?.[0]?.CompetitivePricing?.CompetitivePrices?.[0]?.Price?.LandedPrice?.Amount;
    return typeof amt === "number" ? amt : null;
  }

  /** Orders API v0, aggregated per SKU would need getOrderItems per order (rate-limited). Simplified. */
  async getSales(skus: string[], from: Date, to: Date): Promise<SalesRow[]> {
    type Orders = { payload?: { Orders?: { AmazonOrderId: string }[] } };
    type Items = { payload?: { OrderItems?: { SellerSKU: string; QuantityOrdered: number; ItemPrice?: { Amount: string } }[] } };
    const orders = await this.call<Orders>("GET", "/orders/v0/orders", {
      MarketplaceIds: this.c.marketplaceId,
      CreatedAfter: from.toISOString(),
      CreatedBefore: to.toISOString(),
    });
    const agg = new Map<string, SalesRow>(skus.map((s) => [s, { sku: s, units: 0, revenue: 0 }]));
    for (const o of orders.payload?.Orders ?? []) {
      const items = await this.call<Items>("GET", `/orders/v0/orders/${o.AmazonOrderId}/orderItems`);
      for (const it of items.payload?.OrderItems ?? []) {
        const row = agg.get(it.SellerSKU);
        if (!row) continue;
        row.units += it.QuantityOrdered;
        row.revenue += Number(it.ItemPrice?.Amount ?? 0);
      }
    }
    return [...agg.values()];
  }
}
