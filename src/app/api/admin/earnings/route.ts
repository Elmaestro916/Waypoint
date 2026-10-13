import { handle } from "@/lib/api";
import { admin, check } from "@/lib/db";
import { HttpError, requireAdmin } from "@/lib/auth";
import { parseCsv } from "@/lib/shop/ingest";

// Paste the report you download from each affiliate network. Columns: retailer,periodStart,periodEnd,clicks,orders,sales,commission,currency
export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const text = await req.text();
  if (text.length > 1_000_000) throw new HttpError(413, "File too large");
  const rows = parseCsv(text).map((r) => ({
    retailerSlug: r.retailer, periodStart: r.periodStart, periodEnd: r.periodEnd, clicks: Number(r.clicks || 0), orders: Number(r.orders || 0),
    sales: Number(r.sales || 0), commission: Number(r.commission || 0), currency: (r.currency || "USD").toUpperCase(),
  }));
  const bad = rows.findIndex((r) => !r.retailerSlug || !/^\d{4}-\d{2}-\d{2}$/.test(r.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(r.periodEnd) || [r.clicks, r.orders, r.sales, r.commission].some((n) => !Number.isFinite(n)) || !/^[A-Z]{3}$/.test(r.currency));
  if (bad >= 0) throw new HttpError(400, `Row ${bad + 2} is invalid: check dates (YYYY-MM-DD), numbers and the 3-letter currency`);
  if (!rows.length) throw new HttpError(400, "No rows found");
  check(await admin().from("Earning").insert(rows));
  return { imported: rows.length };
});
