# Amazon Autopilot

Full-stack Next.js 14 app: users register, pick niches, and an AI engine finds products, simulates the
risk, writes listings, runs Sponsored Products ads, reprices, and reports profit, all inside budgets
the user sets.

> **Honest expectations.** No software can guarantee income on Amazon. Margins, competition, ad costs
> and account health decide results, and many sellers lose money. This app is built to *limit downside*
> (simulation, caps, approval mode, audit log), not to promise profit. Assumed supplier costs (COGS)
> are estimates until you replace them with real quotes.

## Quick start (VS Code)

The app uses **Supabase** (Postgres + Auth) and talks to it with `supabase-js`. No Prisma.

1. Create a project at https://supabase.com (free tier is fine).
2. **Create the tables:** Supabase dashboard -> SQL Editor -> paste the whole of
   `supabase/migrations/0001_init.sql` -> Run. (Or with the Supabase CLI: `supabase link` then `supabase db push`.)
3. **Auth settings:** Authentication -> Providers -> Email. For quick local testing turn **"Confirm email" off**;
   otherwise new users must click the emailed link before they can sign in (the app handles both).
4. Copy the keys: Project Settings -> API -> `Project URL`, `anon public` key, and `service_role` key.
5. Configure and run:

```bash
cp .env.example .env     # fill in the 3 Supabase values, then ENCRYPTION_KEY and CRON_SECRET (openssl rand -hex 32)
npm install
npm run seed             # optional: demo@example.com / demo12345 (simulation mode)
npm run dev              # http://localhost:3000
```

Sanity-check the engine maths any time (no database needed): `npm run selftest`.

Out of the box it runs in **simulation mode** (a deterministic mock marketplace), so you can try the
whole flow with zero Amazon credentials: Scan niches -> Prepare listing -> Approve & launch -> Run a cycle.

### How data access and security work

- **Auth** is Supabase Auth (email + password). The session lives in a cookie that `middleware.ts` refreshes;
  `/dashboard/*` redirects to `/login` when signed out. A database trigger creates each new user's `Store` and
  `AutopilotSettings` rows.
- **Dashboard pages read with the signed-in user's session**, so Postgres **row level security** guarantees a user
  can only ever see their own rows. Browser-side roles are read-only.
- **All writes and the autopilot engine use the service-role key on the server only.** That key bypasses RLS, so every
  engine query filters by `userId`. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser or commit it.
- **Amazon refresh tokens** are AES-256-GCM encrypted by the app before storage, and the `spRefreshToken` /
  `adsRefreshToken` columns are not readable by browser-side roles at all.
- Counters (ad stats, daily profit, stock) are updated by Postgres functions so overlapping cron/manual runs can't lose updates.
- Column names are camelCase (quoted in SQL) so rows map 1:1 onto `src/lib/types.ts`.

## Waypoint: the shopper site (affiliate shortcut)

The public site at `/` lets anyone search once and see where a product is sold, in stores that ship to their country, with prices converted to their currency. You earn affiliate commission when they click through and buy. The seller autopilot now lives at `/sell`.

**Three kinds of store** (the `kind` column of the `Retailer` table):
- `feed`: products imported from affiliate networks (Awin, CJ, Impact, Rakuten, or a store's CSV). Searched in Postgres with typo tolerance. Import with `npm run import-feed -- feed.csv` (columns are documented in `scripts/import-feed.ts`; `url` should already be your affiliate link).
- `api`: live lookups. eBay, Amazon (Creators API) and Shopify Global Catalog switch on when their keys are in `.env`. Amazon results are shown in their own section and never stored; Shopify results are never cached.
- `link`: stores with no product API (Jumia, Jiji, Konga, AliExpress). Shoppers get a button that opens that store's own search for their query. Add a row with `searchUrl` containing `{q}` and put your affiliate parameters in `affiliateParams`.

**Setup**
1. Run `supabase/migrations/0002_shopper.sql`, then `0003_product_pages.sql`, in the Supabase SQL editor (after 0001).
2. `npm run seed-demo` adds clearly labelled fictional products so you can see the site working. The site shows a "sample data" banner until you remove them (`delete from "Retailer" where demo;`).
3. Set `ADMIN_EMAILS`, then open `/admin` for clicks by store, searches with no results, source health, and a place to paste each network's earnings report.
4. Schedule `POST /api/cron/alerts` hourly with `Authorization: Bearer $CRON_SECRET`. It sends price-alert emails (needs `RESEND_API_KEY` and `ALERT_FROM`) and records the daily prices behind each product page's price-history chart, so charts stay empty until it has run on two different days.
5. Every imported product gets a page at `/p/<slug>` with prices by store, price history, and structured data for Google. Products carried only by sample stores are marked noindex and left out of the sitemap.

**Check these before launch (they could not be verified from the build environment)**
- The link-out search URLs seeded for Jumia, Jiji, Konga and AliExpress are best-effort patterns: open each one and correct it in the `Retailer` table.
- Jumia and Jiji may not allow comparison sites or have affiliate programs open to you; ask them. Until you have an approved relationship, keep `commissionRate` at 0 so the admin page doesn't show estimates you can't collect.
- Read the Amazon Associates Operating Agreement and the Creators API terms: the 1-hour price cache and the separate Amazon section follow them as understood, and you must confirm the current rules and the minimum-sales requirement for API access.
- Shopify's Global Catalog needs an agent profile and access arranged with Shopify; the adapter follows their published request format but has only been tested against a mock server. Earning commission on Shopify results needs Shopify's own program.
- Run `npm run shop:test` (logic and mock-server checks for every connector).

## What it does

| Module | File | Notes |
| --- | --- | --- |
| Opportunity radar | `src/lib/engine/scoring.ts`, `ai/claude.ts` | Demand, margin, competition score + AI angle/risk notes. Blocks restricted categories (`blocklist.ts`). |
| Profit digital twin | `src/lib/engine/montecarlo.ts` | 4,000-run 90-day simulation -> P10/P50/P90 profit and P(loss). Opportunities above your risk limit are auto-rejected. |
| Listing writer | `src/lib/ai/claude.ts` | Claude writes policy-aware copy; deterministic template fallback with no API key. |
| Self-tuning ads | `src/lib/engine/bandit.ts` | Thompson-sampling bids per keyword; pauses non-converters; max 25% bid move per cycle. |
| Repricer | `src/lib/engine/repricer.ts` | Tracks Buy Box, never under margin floor, max 5% move per cycle. |
| Autopilot loop | `src/lib/engine/autopilot.ts` | discover -> prepare -> launch -> sync -> bid -> reprice -> auto-pause losers. |
| Guardrails | `settings` page | Approval mode, monthly ad budget, inventory capital cap, max live products, min margin, target ACoS, max P(loss). |

## Running the loop automatically

- Self-hosted: `npm run worker` (every 30 min, `WORKER_INTERVAL_MIN` to change).
- Serverless: schedule `POST /api/cron/tick` with header `Authorization: Bearer $CRON_SECRET`.

## Going live with real Amazon accounts

1. Register as a developer in Seller Central and create an SP-API app; create an Amazon Ads API app.
2. Set `AMAZON_MODE=live` plus the LWA client IDs/secrets in `.env`.
3. In the dashboard, Autopilot & store -> enable live mode and paste Seller ID + refresh tokens
   (encrypted at rest with AES-256-GCM). Replace this with a proper OAuth authorization flow before
   serving other people.
4. **Test in the SP-API sandbox first, and start with tiny budgets.**

Known gaps in the live clients (`src/lib/amazon/spapi.ts`, `ads.ts`) - they follow the public docs but
were **not** run against a real account:
- `putListing` sends a generic payload; each category needs its own `productType` + attribute schema.
- Live Ads **reporting** is a documented stub (async create/poll/download flow still to implement), so
  bid optimization has no live data until that is done.
- Fee estimates are approximations; use the Product Fees API for real numbers.
- Sourcing is not automated: the app does not buy inventory or ship it to FBA. You still need a supplier,
  a prep/shipping plan, and compliance checks (IP, labelling, safety).
- When the monthly ad budget guard pauses campaigns, they are not auto-resumed next month.

## Production notes

- Put schema changes in new files under `supabase/migrations/` (never edit `0001_init.sql` after it has run).
- Put the cron endpoint and the app behind HTTPS; use a separate Supabase project and a separate `ENCRYPTION_KEY` per environment (losing the key makes stored Amazon tokens unreadable).
- Configure Supabase Auth rate limits, a custom SMTP sender, and password rules; add billing and per-tenant job queues before real users.
- Amazon's Solution Provider and Acceptable Use policies apply to any app that touches seller data.

## Layout

```
supabase/migrations/        SQL schema, RLS policies, signup trigger, atomic counter functions
src/lib/amazon/             provider interface, mock marketplace, SP-API + Ads API clients, fee model
src/lib/db.ts, supabase/       service-role + user-scoped Supabase clients; src/lib/types.ts row types
src/lib/engine/             scoring, Monte-Carlo, bandit, repricer, guardrails, autopilot loop
src/lib/ai/claude.ts        Claude calls with offline fallbacks
src/app/api/                auth, settings, discover, opportunities, products, run, cron, store
src/app/dashboard/          overview, opportunities, products, campaigns, activity, settings
scripts/                    worker.ts (scheduler), seed.ts (demo user), selftest.ts (engine checks)
```
