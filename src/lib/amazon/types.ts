export interface CatalogItem {
  asin: string;
  title: string;
  category: string;
  price: number;
  salesRank: number;
  reviewCount: number;
  rating: number;
  sellerCount: number;
  estMonthlyUnits: number;
}

export interface ListingInput {
  sku: string;
  title: string;
  bullets: string[];
  description: string;
  keywords: string[];
  price: number;
  quantity: number;
  category: string;
}

export interface KeywordInput {
  text: string;
  matchType: "EXACT" | "PHRASE" | "BROAD";
  bid: number;
}

export interface KeywordReport {
  text: string;
  matchType: string;
  impressions: number;
  clicks: number;
  orders: number;
  spend: number;
  sales: number;
}

export interface SalesRow {
  sku: string;
  units: number;
  revenue: number;
}

/** Everything the engine needs from a marketplace. Mock and live implementations are interchangeable. */
export interface AmazonProvider {
  readonly name: "mock" | "live";
  searchCatalog(keywords: string): Promise<CatalogItem[]>;
  putListing(l: ListingInput): Promise<{ asin?: string }>;
  setPrice(sku: string, price: number): Promise<void>;
  getBuyBoxPrice(sku: string, asin?: string | null): Promise<number | null>;
  createCampaign(i: { name: string; sku: string; dailyBudget: number; keywords: KeywordInput[] }): Promise<{ campaignId: string }>;
  updateBids(campaignId: string, kws: { text: string; matchType: string; bid: number; state: "ENABLED" | "PAUSED" }[]): Promise<void>;
  /** `hint` carries local state the mock marketplace needs; live providers ignore it. */
  getKeywordReport(
    campaignId: string,
    from: Date,
    to: Date,
    hint?: { price: number; keywords: { text: string; matchType: string; bid: number }[] },
  ): Promise<KeywordReport[]>;
  getSales(skus: string[], from: Date, to: Date, prices?: Record<string, number>): Promise<SalesRow[]>;
}
