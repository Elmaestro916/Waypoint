import { admin, check, unwrap } from "@/lib/db";
import { convert, formatMoney, getRates } from "./fx";

interface Watch {
  id: string; userId: string; productId: string; targetPrice: number | string; currency: string; country: string; lastNotifiedAt: string | null;
  CatalogProduct: { title: string } | null;
}
interface OfferRow { price: number | string; currency: string; url: string; inStock: boolean; shipsTo: string[]; Retailer: { name: string; countries: string[] } | null }

const COOLDOWN_MS = 3 * 24 * 3600 * 1000;

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM; // e.g. "Waypoint <alerts@yourdomain.com>", a domain verified in Resend
  if (!key || !from) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
  return res.ok;
}

/** Checks every active price watch against current offers (in stock and shipping to the watcher's country). */
export async function runPriceAlerts(): Promise<{ checked: number; due: number; emailed: number; noEmailConfig: boolean; snapshotted: number }> {
  const db = admin();
  // Record today's cheapest prices for the price-history charts (idempotent within a day).
  const snapshotted = Number(unwrap<number>(await db.rpc("snapshot_prices")) ?? 0);
  const rates = await getRates();
  const watches = unwrap<Watch[]>(await db.from("WatchItem").select("id,userId,productId,targetPrice,currency,country,lastNotifiedAt,CatalogProduct(title)").eq("active", true));
  let due = 0, emailed = 0;
  for (const w of watches) {
    if (w.lastNotifiedAt && Date.now() - Date.parse(w.lastNotifiedAt) < COOLDOWN_MS) continue;
    const offers = unwrap<OfferRow[]>(await db.from("Offer").select("price,currency,url,inStock,shipsTo,Retailer(name,countries)").eq("productId", w.productId).eq("inStock", true));
    const reachable = offers.filter((o) => {
      const ships = o.shipsTo.length ? o.shipsTo : o.Retailer?.countries ?? [];
      return !ships.length || ships.includes(w.country);
    });
    const priced = reachable.map((o) => ({ o, d: convert(Number(o.price), o.currency.trim(), w.currency, rates) })).filter((x) => Number.isFinite(x.d)).sort((a, b) => a.d - b.d);
    const best = priced[0];
    if (!best || best.d > Number(w.targetPrice)) continue;
    due++;
    const { data } = await db.auth.admin.getUserById(w.userId);
    const email = data.user?.email;
    if (!email) continue;
    const title = w.CatalogProduct?.title ?? "A product you're watching";
    const ok = await sendEmail(
      email,
      `Price drop: ${title}`,
      `${title} is now ${formatMoney(best.d, w.currency)} at ${best.o.Retailer?.name ?? "a store"} (your target was ${formatMoney(Number(w.targetPrice), w.currency)}).\n\nSee it on Waypoint: ${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/search?q=${encodeURIComponent(title)}\n\nPrices can change before you check out. To stop these emails, remove the alert on the Price alerts page.`
    );
    if (ok) {
      emailed++;
      check(await db.from("WatchItem").update({ lastNotifiedAt: new Date().toISOString() }).eq("id", w.id));
    }
  }
  return { checked: watches.length, due, emailed, noEmailConfig: !process.env.RESEND_API_KEY || !process.env.ALERT_FROM, snapshotted };
}
