import { NextRequest, NextResponse } from "next/server";
import { getCountry, COUNTRY_COOKIE, countryFromHeaders, isSupportedCountry } from "@/lib/shop/countries";
import { knownBrandNames, runSearch } from "@/lib/shop/search";
import { rateLimit } from "@/lib/shop/security";
import { toView } from "@/lib/shop/view";
import type { SortMode } from "@/lib/shop/types";

const SORTS: SortMode[] = ["relevance", "price_asc", "price_desc", "rating"];
const numOrUndef = (v: string | null) => (v && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : undefined);

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`search:${ip}`, 40, 60_000)) return NextResponse.json({ error: "Too many searches, slow down a little." }, { status: 429 });
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 200);
  if (!q) return NextResponse.json({ error: "Type something to search for." }, { status: 400 });
  const cc = sp.get("country") ?? req.cookies.get(COUNTRY_COOKIE)?.value ?? countryFromHeaders(req.headers);
  const country = getCountry(isSupportedCountry(cc) ? cc : null).code;
  const sort = SORTS.includes(sp.get("sort") as SortMode) ? (sp.get("sort") as SortMode) : "relevance";
  const cond = sp.get("condition");
  const result = await runSearch(
    {
      q, country, sort,
      min: numOrUndef(sp.get("min")), max: numOrUndef(sp.get("max")),
      condition: cond === "new" || cond === "used" ? cond : undefined,
      brandSlug: sp.get("brand") ?? undefined,
      categorySlug: sp.get("category") ?? undefined,
      page: Math.min(Math.max(1, Number(sp.get("page")) || 1), 20),
    },
    { session: { ip, ua: req.headers.get("user-agent") ?? "" }, knownBrands: await knownBrandNames() }
  );
  return NextResponse.json(toView(result, q), { headers: { "Cache-Control": "no-store" } });
}
