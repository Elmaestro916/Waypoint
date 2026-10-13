import { NextRequest, NextResponse } from "next/server";
import { admin, unwrap } from "@/lib/db";
import { rateLimit } from "@/lib/shop/security";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`suggest:${ip}`, 120, 60_000)) return NextResponse.json({ items: [] }, { status: 429 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ items: [] });
  try {
    const items = unwrap<{ kind: string; label: string; slug: string }[]>(await admin().rpc("suggest_catalog", { p_q: q, p_limit: 8 }));
    return NextResponse.json({ items }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
