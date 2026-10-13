import { signClick } from "./security";
import type { LinkOut, Offer, ProductGroup, SearchResult } from "./types";

export type OfferView = Offer & { token: string; pos: number };
export type GroupView = Omit<ProductGroup, "offers" | "best"> & { offers: OfferView[]; best: OfferView };
export type LinkOutView = LinkOut & { token: string };
export type ResultView = Omit<SearchResult, "groups" | "amazon" | "linkOuts"> & {
  groups: GroupView[];
  amazon: OfferView[];
  linkOuts: LinkOutView[];
  q: string;
};

/** Adds a signed click token to every outbound link so click reports can only refer to links we really showed. */
export function toView(r: SearchResult, q: string): ResultView {
  const tok = (o: Offer, pos: number): OfferView => ({
    ...o,
    pos,
    token: signClick({ k: o.key, r: o.retailerSlug, s: o.source, p: o.productId, n: pos, a: o.price, c: o.currency, q, co: r.country }),
  });
  const base = (r.page - 1) * r.pageSize;
  return {
    ...r,
    q,
    groups: r.groups.map((g, i) => ({ ...g, offers: g.offers.map((o) => tok(o, base + i + 1)), best: tok(g.best, base + i + 1) })),
    amazon: r.amazon.map((o, i) => tok(o, i + 1)),
    linkOuts: r.linkOuts.map((l, i) => ({
      ...l,
      token: signClick({ k: `link:${l.slug}`, r: l.slug, s: "link", p: null, n: i + 1, a: 0, c: "USD", q, co: r.country }),
    })),
  };
}
