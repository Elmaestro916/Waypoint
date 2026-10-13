export type Source = "catalog" | "ebay" | "amazon" | "shopify";
export type Condition = "new" | "used" | "refurbished" | "unknown";
export type SortMode = "relevance" | "price_asc" | "price_desc" | "rating";

/** One purchasable listing at one store, from any source. */
export interface Offer {
  key: string; // stable: `${source}:${externalId}`
  source: Source;
  retailerSlug: string;
  retailerName: string;
  productId: string | null; // set for catalog (feed) products
  groupKey?: string; // sources that already cluster products (Shopify UPID)
  title: string;
  brand: string | null;
  imageUrl: string | null;
  price: number; // in `currency`, major units
  currency: string;
  condition: Condition;
  inStock: boolean | null;
  url: string; // destination EXACTLY as the source/network provided it
  rating: number | null;
  reviewCount: number | null;
  shipsTo: string[] | null;
  fetchedAt: string; // ISO time the price was read
  gtin: string | null;
  demo: boolean; // sample data: always shown with a visible banner
  affiliate: boolean; // is this link expected to earn a commission?
}

export interface ProductGroup {
  id: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  offers: Offer[]; // sorted: in stock first, then cheapest (in display currency)
  best: Offer;
  bestPrice: number; // display currency
  score: number;
  productId: string | null;
}

export interface SearchParams {
  q: string;
  country: string;
  min?: number; // display currency
  max?: number;
  condition?: "new" | "used";
  brandSlug?: string;
  categorySlug?: string;
  retailers?: string[];
  sort?: SortMode;
  page?: number;
}

export interface ParsedQuery {
  keywords: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  budgetCurrency?: string;
  condition?: "new" | "used";
}

export interface SourceStatus {
  status: "ok" | "error" | "skipped" | "disabled";
  ms: number;
  count: number;
  note?: string;
}

export interface Rates {
  base: "USD";
  rates: Record<string, number>;
  asOf: string;
  live: boolean;
}

export interface SearchCtx {
  q: string; // keywords after parsing
  tokens: string[];
  country: string;
  displayCurrency: string;
  rates: Rates;
  min?: number; // display currency
  max?: number;
  condition?: "new" | "used";
  brandSlug?: string;
  categorySlug?: string;
  limit: number;
  signal: AbortSignal;
  sessionRef?: string;
}

export interface SearchSource {
  id: Source;
  enabled(): boolean;
  /** Return a reason string if this source can't serve the request (e.g. no marketplace for that country). */
  skipReason?(ctx: SearchCtx): string | null;
  search(ctx: SearchCtx): Promise<Offer[]>;
}

export interface LinkOut {
  slug: string;
  name: string;
  domain: string;
  url: string;
  affiliate: boolean;
}

export interface SearchResult {
  parsed: ParsedQuery;
  groups: ProductGroup[]; // everything except Amazon
  amazon: Offer[]; // Amazon's lane: never merged with other stores (Amazon content rules)
  linkOuts: LinkOut[];
  status: Record<string, SourceStatus>;
  rates: Rates;
  displayCurrency: string;
  country: string;
  total: number;
  page: number;
  pageSize: number;
  latencyMs: number;
  hasDemo: boolean;
}
