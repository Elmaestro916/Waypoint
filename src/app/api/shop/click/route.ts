import { NextResponse } from "next/server";
import { admin, check } from "@/lib/db";
import { rateLimit, sessionHash, verifyClick } from "@/lib/shop/security";
import { retailerRates } from "@/lib/shop/sources/linkout";
import { getRates, toUsd } from "@/lib/shop/fx";
import { signedInUserId } from "@/lib/shop/server";

// Called with navigator.sendBeacon when a shopper opens a store link. The link itself is a plain <a href> to the
// store, so this is bookkeeping only and never sits between the shopper and the store.
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`click:${ip}`, 60, 60_000)) return new NextResponse(null, { status: 429 });
  let token = "";
  try {
    token = ((await req.json()) as { t?: string }).t ?? "";
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const c = verifyClick(token);
  if (!c) return new NextResponse(null, { status: 400 });
  try {
    const [rates, comm, user] = await Promise.all([getRates(), retailerRates(), signedInUserId()]);
    const est = c.a > 0 ? toUsd(c.a, c.c, rates) * (comm[c.r] ?? 0) : 0;
    check(
      await admin().from("ClickEvent").insert({
        source: c.s,
        retailerSlug: c.r,
        offerKey: c.k,
        productId: c.p,
        query: c.q.slice(0, 200),
        country: c.co,
        position: c.n,
        price: c.a || null,
        currency: c.a ? c.c : null,
        estCommission: Number(est.toFixed(4)),
        sessionHash: sessionHash(ip, req.headers.get("user-agent") ?? ""),
        userId: user,
      })
    );
  } catch {
    // never surface analytics failures to shoppers
  }
  return new NextResponse(null, { status: 204 });
}
