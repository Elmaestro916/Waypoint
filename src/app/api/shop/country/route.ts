import { NextResponse } from "next/server";
import { COUNTRY_COOKIE, isSupportedCountry } from "@/lib/shop/countries";

export async function POST(req: Request) {
  const { country } = (await req.json().catch(() => ({}))) as { country?: string };
  if (!isSupportedCountry(country)) return NextResponse.json({ error: "Unsupported country" }, { status: 400 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COUNTRY_COOKIE, country!.toUpperCase(), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
