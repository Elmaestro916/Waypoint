import "dotenv/config";
import { readFileSync } from "node:fs";
import { csvToFeedRow, parseCsv, upsertFeedRows } from "../src/lib/shop/ingest";

// Usage: npm run import-feed -- path/to/feed.csv
// Columns: retailer,externalId,gtin,brand,title,category,imageUrl,description,price,currency,condition,inStock,url,shipsTo,rating,reviewCount
// `retailer` must be the slug of a row in the Retailer table; `url` should already be your affiliate-tracked link.
const file = process.argv[2];
if (!file) { console.error("Usage: npm run import-feed -- feed.csv"); process.exit(1); }
const rows = parseCsv(readFileSync(file, "utf8")).map(csvToFeedRow);
upsertFeedRows(rows).then((r) => {
  console.log(`Imported ${r.offers} offers across ${r.products} products.`);
  for (const s of r.skipped.slice(0, 20)) console.log(`  skipped row ${s.row}: ${s.why}`);
  if (r.skipped.length > 20) console.log(`  ...and ${r.skipped.length - 20} more skipped`);
}).catch((e) => { console.error(e.message); process.exit(1); });
