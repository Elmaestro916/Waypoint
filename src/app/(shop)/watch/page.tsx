import type { Metadata } from "next";
import Link from "next/link";
import { admin, unwrap } from "@/lib/db";
import { signedInUserId } from "@/lib/shop/server";
import { formatMoney } from "@/lib/shop/fx";
import RemoveWatch from "@/components/shop/RemoveWatch";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Price alerts", robots: { index: false } };

export default async function Page() {
  const uid = await signedInUserId();
  if (!uid) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16">
        <h1 className="font-sign text-5xl font-bold">Price alerts</h1>
        <p className="mt-4 text-lg text-road-mute">Sign in to get an email when a product drops to the price you set.</p>
        <Link href="/login" className="mt-6 inline-block rounded-lg bg-road-yellow px-5 py-3 font-sign text-xl font-bold">Sign in</Link>
      </div>
    );
  }
  const rows = unwrap<{ id: string; targetPrice: number; currency: string; lastNotifiedAt: string | null; CatalogProduct: { title: string; brand: string } | null }[]>(
    await admin().from("WatchItem").select("id,targetPrice,currency,lastNotifiedAt,CatalogProduct(title,brand)").eq("userId", uid).eq("active", true).order("createdAt", { ascending: false })
  );
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="font-sign text-5xl font-bold">Price alerts</h1>
      {rows.length === 0 ? (
        <p className="mt-4 text-lg text-road-mute">You&rsquo;re not watching anything. Search for a product and choose &ldquo;Watch this price&rdquo; on a result.</p>
      ) : (
        <ul className="mt-6 divide-y divide-road-line border-y border-road-line">
          {rows.map((w) => (
            <li key={w.id} className="flex items-center gap-4 py-4">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{w.CatalogProduct?.title ?? "Product"}</span>
                <span className="text-sm text-road-mute">Alert at {formatMoney(Number(w.targetPrice), w.currency)} or less{w.lastNotifiedAt ? ", last sent " + new Date(w.lastNotifiedAt).toLocaleDateString() : ""}</span>
              </span>
              <RemoveWatch id={w.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
