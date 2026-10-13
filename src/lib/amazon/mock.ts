import { hashStr, rng, clamp, round2 } from "../util";
import type { AmazonProvider, CatalogItem, KeywordReport, ListingInput, SalesRow } from "./types";

/**
 * A deterministic simulated marketplace so the whole product works end-to-end with zero credentials.
 * Each SKU/keyword has a hidden "true" conversion rate the optimizer has to learn from noisy data.
 */

const BANK: Record<string, string[]> = {
  kitchen: ["Silicone Stretch Lids Set", "Magnetic Spice Rack", "Collapsible Colander", "Herb Stripper Tool", "Bamboo Drawer Divider", "Oil Sprayer Bottle"],
  "pet supplies": ["Slow Feeder Dog Bowl", "Cat Window Perch", "Portable Water Bottle for Dogs", "Pet Hair Remover Roller", "Chew-Proof Cable Protector", "Lick Mat for Dogs"],
  "home organization": ["Over-Door Shoe Organizer", "Under-Bed Storage Bags", "Cable Management Box", "Stackable Closet Bins", "Fridge Organizer Bins", "Hanging Closet Shelves"],
  "fitness accessories": ["Resistance Loop Bands Set", "Doorway Pull-Up Bar", "Yoga Mat Strap", "Adjustable Jump Rope", "Gym Chalk Ball", "Wrist Wraps Pair"],
};
const FALLBACK = ["Travel Packing Cubes", "Desk Cable Clips", "Reusable Produce Bags", "Car Seat Gap Filler", "Shower Caddy Organizer", "LED Motion Night Light"];

export class MockProvider implements AmazonProvider {
  readonly name = "mock" as const;

  async searchCatalog(keywords: string): Promise<CatalogItem[]> {
    const key = keywords.trim().toLowerCase();
    const names = BANK[key] ?? FALLBACK;
    return names.map((n, i) => {
      const r = rng(hashStr(key + n));
      const price = round2(14 + r() * 36);
      const rank = Math.floor(2000 + r() * 90000);
      return {
        asin: "B0" + hashStr(key + n + i).toString(36).toUpperCase().padStart(8, "0").slice(0, 8),
        title: n,
        category: key,
        price,
        salesRank: rank,
        reviewCount: Math.floor(30 + r() * 6000),
        rating: round2(3.8 + r() * 1.0),
        sellerCount: Math.floor(2 + r() * 28),
        estMonthlyUnits: Math.floor(clamp(400000 / Math.sqrt(rank) * (0.6 + r() * 0.8), 40, 2500)),
      };
    });
  }

  async putListing(l: ListingInput) {
    return { asin: "B0" + hashStr(l.sku).toString(36).toUpperCase().padStart(8, "0").slice(0, 8) };
  }
  async setPrice() {}
  async getBuyBoxPrice(sku: string) {
    const r = rng(hashStr(sku + new Date().toISOString().slice(0, 13)));
    return round2(20 + r() * 20);
  }

  async createCampaign() {
    return { campaignId: "MOCK-C-" + Math.random().toString(36).slice(2, 10).toUpperCase() };
  }
  async updateBids() {}

  /** Simulated ad performance. True CVR is hidden per keyword; higher bids buy more impressions. */
  async getKeywordReport(
    campaignId: string,
    from: Date,
    to: Date,
    hint?: { price: number; keywords: { text: string; matchType: string; bid: number }[] },
  ): Promise<KeywordReport[]> {
    const kws = hint?.keywords ?? [];
    const price = hint?.price ?? 25;
    const hours = clamp((to.getTime() - from.getTime()) / 3.6e6, 0, 72);
    return kws.map((k) => {
      const r = rng(hashStr(campaignId + k.text + from.toISOString().slice(0, 13)));
      const trueCvr = 0.02 + (hashStr(k.text) % 1000) / 1000 * 0.2; // 2%-22%
      const ctr = 0.004 + (hashStr(k.text + "c") % 100) / 100 * 0.006;
      const imps = Math.floor(hours * (20 + k.bid * 140) * (0.7 + r() * 0.6));
      const clicks = Math.floor(imps * ctr * (0.8 + r() * 0.4));
      let orders = 0;
      for (let i = 0; i < clicks; i++) if (r() < trueCvr) orders++;
      const cpc = k.bid * (0.78 + r() * 0.2);
      return {
        text: k.text,
        matchType: k.matchType,
        impressions: imps,
        clicks,
        orders,
        spend: round2(clicks * cpc),
        sales: round2(orders * price),
      };
    });
  }

  async getSales(skus: string[], from: Date, to: Date, prices: Record<string, number> = {}): Promise<SalesRow[]> {
    const hours = clamp((to.getTime() - from.getTime()) / 3.6e6, 0, 72);
    return skus.map((sku) => {
      const r = rng(hashStr(sku + from.toISOString().slice(0, 13)));
      const base = 1.5 + (hashStr(sku) % 700) / 100; // 1.5-8.5 units/day organic+ad baseline
      const units = Math.max(0, Math.round((base * hours) / 24 * (0.7 + r() * 0.6)));
      return { sku, units, revenue: round2(units * (prices[sku] ?? 25)) };
    });
  }
}
