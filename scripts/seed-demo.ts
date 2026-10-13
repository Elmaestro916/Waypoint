import "dotenv/config";
import { admin, check } from "../src/lib/db";
import { upsertFeedRows, type FeedRow } from "../src/lib/shop/ingest";

// Fictional brands, fictional stores, links that go nowhere real. The site shows a "sample data" banner while these exist.
// Remove with: delete from "Retailer" where demo;   (offers cascade; orphaned products can be deleted afterwards)
const STORES = [
  { slug: "demo-mart", name: "Demo Mart", countries: ["US", "GB", "CA", "NG", "GH", "KE"] },
  { slug: "demo-outlet", name: "Demo Outlet", countries: ["US", "NG", "GB", "ZA"] },
  { slug: "demo-lagos", name: "Demo Lagos Store", countries: ["NG", "GH"] },
];
const P = (brand: string, title: string, category: string, base: number, tags: string[]) => ({ brand, title, category, base, tags });
const PRODUCTS = [
  P("Northvale", "Northvale Trail Running Shoes", "Shoes", 78, ["running", "shoes"]),
  P("Northvale", "Northvale Waterproof Hiking Jacket", "Jackets", 120, ["jacket"]),
  P("Kestrel", "Kestrel Cast Iron Skillet 12 inch", "Kitchen", 34, ["kitchen"]),
  P("Kestrel", "Kestrel Burr Coffee Grinder", "Kitchen", 59, ["coffee"]),
  P("Lumio", "Lumio Smart LED Desk Lamp", "Lighting", 42, ["lamp"]),
  P("Lumio", "Lumio Standing Desk 140cm", "Furniture", 289, ["desk"]),
  P("Aurelia", "Aurelia Ankara Print Fabric 6 yards", "Fabric", 24, ["ankara", "fabric"]),
  P("Aurelia", "Aurelia Wireless Earbuds", "Audio", 49, ["earbuds"]),
  P("Brightwave", "Brightwave 13 inch Laptop 16GB 512GB", "Laptops", 640, ["laptop"]),
  P("Brightwave", "Brightwave Smartphone 128GB", "Phones", 310, ["phone"]),
  P("Brightwave", "Brightwave Smartphone 128GB (refurbished)", "Phones", 210, ["phone"]),
  P("Tidewell", "Tidewell Insulated Water Bottle 1L", "Outdoors", 21, ["bottle"]),
];
const RATE: Record<string, number> = { USD: 1, GBP: 0.78, CAD: 1.37, NGN: 1550, GHS: 15, KES: 129, ZAR: 18.2 };
const CUR: Record<string, string> = { "demo-mart": "USD", "demo-outlet": "GBP", "demo-lagos": "NGN" };

async function main() {
  const db = admin();
  for (const s of STORES) {
    check(await db.from("Retailer").upsert({ slug: s.slug, name: s.name, domain: "example.com", kind: "feed", countries: s.countries, network: "direct", commissionRate: 0, demo: true, active: true }, { onConflict: "slug" }));
  }
  const rows: FeedRow[] = [];
  PRODUCTS.forEach((p, i) => {
    STORES.forEach((s, j) => {
      if ((i + j) % 4 === 3) return; // not every store carries everything
      const cur = CUR[s.slug];
      const price = Math.round(p.base * (0.92 + ((i * 7 + j * 13) % 17) / 100) * RATE[cur] * (cur === "NGN" ? 1 : 1) * 100) / 100;
      rows.push({
        retailer: s.slug, externalId: `${s.slug}-${i}`, brand: p.brand, title: p.title, category: p.category,
        price: cur === "NGN" ? Math.round(price / 100) * 100 : price, currency: cur, condition: p.title.includes("refurbished") ? "refurbished" : "new",
        inStock: (i + j) % 5 !== 0, url: `https://example.com/demo/${s.slug}/${i}`, shipsTo: s.countries, rating: 3.8 + ((i + j) % 12) / 10, reviewCount: 20 + i * 13,
      });
    });
  });
  const r = await upsertFeedRows(rows);
  console.log(`Demo data ready: ${r.products} products, ${r.offers} offers. Real stores replace it as you import feeds.`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
