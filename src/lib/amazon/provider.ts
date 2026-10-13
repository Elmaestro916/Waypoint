import { MockProvider } from "./mock";
import { SpApi } from "./spapi";
import { AdsApi } from "./ads";
import { decrypt } from "../crypto";
import type { AmazonProvider } from "./types";
import type { Store } from "../types";

class LiveProvider implements AmazonProvider {
  readonly name = "live" as const;
  private sp: SpApi;
  private ads: AdsApi | null;

  constructor(store: Store) {
    if (!store.spRefreshToken || !store.sellerId) throw new Error("Amazon seller account not connected");
    this.sp = new SpApi({
      refreshToken: decrypt(store.spRefreshToken),
      sellerId: store.sellerId,
      marketplaceId: store.marketplaceId,
    });
    this.ads =
      store.adsRefreshToken && store.adsProfileId
        ? new AdsApi({ refreshToken: decrypt(store.adsRefreshToken), profileId: store.adsProfileId })
        : null;
  }

  private needAds(): AdsApi {
    if (!this.ads) throw new Error("Amazon Ads account not connected");
    return this.ads;
  }

  searchCatalog(k: string) { return this.sp.searchCatalog(k); }
  putListing(l: Parameters<AmazonProvider["putListing"]>[0]) { return this.sp.putListing(l); }
  setPrice(sku: string, p: number) { return this.sp.setPrice(sku, p); }
  async getBuyBoxPrice(_sku: string, asin?: string | null) { return asin ? this.sp.getBuyBoxPrice(asin) : null; }
  createCampaign(i: Parameters<AmazonProvider["createCampaign"]>[0]) { return this.needAds().createCampaign(i); }
  updateBids(id: string, kws: Parameters<AmazonProvider["updateBids"]>[1]) { return this.needAds().updateBids(id, kws); }
  getKeywordReport(id: string, from: Date, to: Date) { return this.needAds().getKeywordReport(id, from, to); }
  getSales(skus: string[], from: Date, to: Date) { return this.sp.getSales(skus, from, to); }
}

const mock = new MockProvider();

/** Per-user provider. Users in "live" mode get the real APIs; everyone else gets the safe simulator. */
export function providerFor(store: Store | null | undefined): AmazonProvider {
  if (store && store.mode === "live" && process.env.AMAZON_MODE === "live") return new LiveProvider(store);
  return mock;
}
