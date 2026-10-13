/**
 * Amazon Ads API client - Sponsored Products (live mode).
 *
 * Auth: LWA refresh token (from the Ads API OAuth flow) + `Amazon-Advertising-API-ClientId` +
 * `Amazon-Advertising-API-Scope: <profileId>` headers.
 *
 * NOT exercised against a live account in this scaffold - the Ads API changes versions often.
 * Verify endpoints/media types in https://advertising.amazon.com/API/docs before going live, and
 * start with tiny budgets. Reporting is asynchronous (create report -> poll -> download).
 */
import { lwaToken } from "./spapi";
import type { KeywordInput, KeywordReport } from "./types";

export interface AdsCreds {
  refreshToken: string;
  profileId: string;
}

export class AdsApi {
  constructor(private c: AdsCreds) {}

  private async call<T>(method: string, path: string, body?: unknown, media?: string): Promise<T> {
    const id = process.env.ADS_LWA_CLIENT_ID;
    const secret = process.env.ADS_LWA_CLIENT_SECRET;
    if (!id || !secret) throw new Error("ADS_LWA_CLIENT_ID / ADS_LWA_CLIENT_SECRET not configured");
    const token = await lwaToken(id, secret, this.c.refreshToken);
    const base = process.env.ADS_ENDPOINT ?? "https://advertising-api.amazon.com";
    const res = await fetch(base + path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "Amazon-Advertising-API-ClientId": id,
        "Amazon-Advertising-API-Scope": this.c.profileId,
        "content-type": media ?? "application/json",
        accept: media ?? "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Ads API ${method} ${path} -> ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  /** Creates campaign -> ad group -> product ad (by SKU) -> keywords. */
  async createCampaign(i: { name: string; sku: string; dailyBudget: number; keywords: KeywordInput[] }): Promise<{ campaignId: string }> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const camp = await this.call<{ campaigns: { success: { campaignId: string }[] } }>(
      "POST",
      "/sp/campaigns",
      {
        campaigns: [
          {
            name: i.name,
            state: "ENABLED",
            targetingType: "MANUAL",
            startDate: today,
            budget: { budgetType: "DAILY", budget: i.dailyBudget },
            dynamicBidding: { strategy: "LEGACY_FOR_SALES" }, // down-only
          },
        ],
      },
      "application/vnd.spCampaign.v3+json",
    );
    const campaignId = camp.campaigns.success[0].campaignId;

    const ag = await this.call<{ adGroups: { success: { adGroupId: string }[] } }>(
      "POST",
      "/sp/adGroups",
      { adGroups: [{ campaignId, name: "main", state: "ENABLED", defaultBid: 0.5 }] },
      "application/vnd.spAdGroup.v3+json",
    );
    const adGroupId = ag.adGroups.success[0].adGroupId;

    await this.call(
      "POST",
      "/sp/productAds",
      { productAds: [{ campaignId, adGroupId, sku: i.sku, state: "ENABLED" }] },
      "application/vnd.spProductAd.v3+json",
    );
    await this.call(
      "POST",
      "/sp/keywords",
      {
        keywords: i.keywords.map((k) => ({
          campaignId,
          adGroupId,
          keywordText: k.text,
          matchType: k.matchType,
          state: "ENABLED",
          bid: k.bid,
        })),
      },
      "application/vnd.spKeyword.v3+json",
    );
    return { campaignId };
  }

  /** NOTE: needs keyword IDs (list keywords by campaign first). Simplified placeholder. */
  async updateBids(campaignId: string, kws: { text: string; matchType: string; bid: number; state: "ENABLED" | "PAUSED" }[]): Promise<void> {
    type List = { keywords: { keywordId: string; keywordText: string; matchType: string }[] };
    const list = await this.call<List>(
      "POST",
      "/sp/keywords/list",
      { campaignIdFilter: { include: [campaignId] } },
      "application/vnd.spKeyword.v3+json",
    );
    const byKey = new Map(list.keywords.map((k) => [`${k.keywordText}|${k.matchType}`, k.keywordId]));
    const updates = kws
      .map((k) => ({ keywordId: byKey.get(`${k.text}|${k.matchType}`), bid: k.bid, state: k.state }))
      .filter((u) => u.keywordId);
    if (updates.length) {
      await this.call("PUT", "/sp/keywords", { keywords: updates }, "application/vnd.spKeyword.v3+json");
    }
  }

  /** Async report flow (v3 reporting). Left as a documented stub: implement create/poll/download. */
  async getKeywordReport(_campaignId: string, _from: Date, _to: Date): Promise<KeywordReport[]> {
    throw new Error(
      "Live Ads reporting not implemented in this scaffold: POST /reporting/reports (spTargeting, daily), poll status, download gzip JSON, map rows to KeywordReport.",
    );
  }
}
