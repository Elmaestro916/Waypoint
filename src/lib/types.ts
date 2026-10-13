/** Row shapes of the tables in supabase/migrations/0001_init.sql. Timestamps arrive as ISO strings. */

export interface Store {
  id: string;
  userId: string;
  mode: "mock" | "live";
  marketplaceId: string;
  sellerId: string | null;
  spRefreshToken: string | null; // encrypted
  adsProfileId: string | null;
  adsRefreshToken: string | null; // encrypted
}

export interface AutopilotSettings {
  id: string;
  userId: string;
  enabled: boolean;
  approvalMode: boolean;
  niches: string;
  monthlyAdBudget: number;
  maxLaunchBudget: number;
  maxActiveProducts: number;
  minMarginPct: number;
  targetAcos: number;
  maxProbLoss: number;
  minScore: number;
  lastRunAt: string | null;
}

export interface Opportunity {
  id: string;
  userId: string;
  asin: string;
  title: string;
  category: string;
  price: number;
  estCogs: number;
  estMonthlyUnits: number;
  competition: number;
  score: number;
  angle: string;
  rationale: string;
  risks: string;
  simJson: string;
  status: "new" | "queued" | "launched" | "rejected";
  createdAt: string;
}

export interface Product {
  id: string;
  userId: string;
  opportunityId: string | null;
  sku: string;
  asin: string | null;
  title: string;
  bullets: string;
  description: string;
  keywords: string;
  price: number;
  minPrice: number;
  maxPrice: number;
  cogs: number;
  stock: number;
  fulfillment: "FBA" | "FBM";
  status: "pending_approval" | "live" | "paused" | "rejected";
  createdAt: string;
}

export interface Campaign {
  id: string;
  userId: string;
  productId: string;
  externalId: string | null;
  name: string;
  dailyBudget: number;
  status: "active" | "paused";
  spend: number;
  sales: number;
  clicks: number;
  impressions: number;
  orders: number;
  lastSyncAt: string;
  createdAt: string;
}

export interface Keyword {
  id: string;
  campaignId: string;
  text: string;
  matchType: string;
  bid: number;
  state: "ENABLED" | "PAUSED";
  impressions: number;
  clicks: number;
  orders: number;
  spend: number;
  sales: number;
}

export interface DailyMetric {
  id: string;
  userId: string;
  date: string;
  revenue: number;
  adSpend: number;
  cogs: number;
  fees: number;
  units: number;
  profit: number;
}

export interface ActivityLog {
  id: string;
  userId: string;
  kind: string;
  message: string;
  detail: string | null;
  createdAt: string;
}

/** The signed-in user as the app sees it (identity from Supabase Auth, rows from our tables). */
export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  store: Store;
  settings: AutopilotSettings;
}
