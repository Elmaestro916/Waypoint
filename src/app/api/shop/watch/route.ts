import { NextResponse } from "next/server";
import { z } from "zod";
import { admin, check, unwrapMaybe } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { isSupportedCountry } from "@/lib/shop/countries";

const Body = z.object({
  productId: z.string().uuid(),
  targetPrice: z.number().positive().max(1e9),
  currency: z.string().length(3),
  country: z.string().refine(isSupportedCountry),
});

function fail(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const b = Body.parse(await req.json());
    const exists = unwrapMaybe<{ id: string }>(await admin().from("CatalogProduct").select("id").eq("id", b.productId).maybeSingle());
    if (!exists) return NextResponse.json({ error: "Unknown product" }, { status: 404 });
    check(
      await admin().from("WatchItem").insert({
        userId: user.id, productId: b.productId, targetPrice: b.targetPrice, currency: b.currency.toUpperCase(), country: b.country.toUpperCase(),
      })
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Check the target price" }, { status: 400 });
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id") ?? "";
    check(await admin().from("WatchItem").delete().eq("id", id).eq("userId", user.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
