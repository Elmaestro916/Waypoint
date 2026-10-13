-- All migrations (0001 -> 0003) combined into one file, for a FRESH Supabase project.
-- Paste the whole file into Supabase -> SQL Editor -> Run. It runs in one transaction, so it either
-- applies completely or not at all. Do not run it on a database that already has these migrations.
-- Generated from supabase/migrations/*.sql; those files remain the source of truth.

begin;

-- =====================================================================
-- 0001_init.sql
-- =====================================================================

-- Amazon Autopilot: initial schema for Supabase (Postgres).
-- Column names are camelCase (quoted) so rows map 1:1 onto the TypeScript types in src/lib/types.ts.
-- Users live in Supabase Auth (auth.users); every table hangs off "userId" -> auth.users(id).
--
-- Writes happen server-side with the service-role key (API routes, worker, cron), which bypasses RLS.
-- RLS lets a signed-in user READ only their own rows; browser-side roles cannot write at all.

-- ---------------------------------------------------------------- tables
create table public."Store" (
  "id"              uuid primary key default gen_random_uuid(),
  "userId"          uuid not null unique references auth.users(id) on delete cascade,
  "mode"            text not null default 'mock' check ("mode" in ('mock','live')),
  "marketplaceId"   text not null default 'ATVPDKIKX0DER',
  "sellerId"        text,
  "spRefreshToken"  text,   -- AES-256-GCM encrypted by the app, never plaintext
  "adsProfileId"    text,
  "adsRefreshToken" text    -- encrypted by the app
);

create table public."AutopilotSettings" (
  "id"                uuid primary key default gen_random_uuid(),
  "userId"            uuid not null unique references auth.users(id) on delete cascade,
  "enabled"           boolean not null default false,
  "approvalMode"      boolean not null default true,
  "niches"            text not null default 'kitchen,pet supplies,home organization,fitness accessories',
  "monthlyAdBudget"   double precision not null default 300,
  "maxLaunchBudget"   double precision not null default 1500,
  "maxActiveProducts" integer not null default 5,
  "minMarginPct"      double precision not null default 20,
  "targetAcos"        double precision not null default 0.28,
  "maxProbLoss"       double precision not null default 0.35,
  "minScore"          double precision not null default 55,
  "lastRunAt"         timestamptz
);

create table public."Opportunity" (
  "id"              uuid primary key default gen_random_uuid(),
  "userId"          uuid not null references auth.users(id) on delete cascade,
  "asin"            text not null,
  "title"           text not null,
  "category"        text not null,
  "price"           double precision not null,
  "estCogs"         double precision not null,
  "estMonthlyUnits" integer not null,
  "competition"     double precision not null,
  "score"           double precision not null,
  "angle"           text not null default '',
  "rationale"       text not null default '',
  "risks"           text not null default '',
  "simJson"         text not null default '{}',
  "status"          text not null default 'new' check ("status" in ('new','queued','launched','rejected')),
  "createdAt"       timestamptz not null default now(),
  unique ("userId", "asin")
);

create table public."Product" (
  "id"            uuid primary key default gen_random_uuid(),
  "userId"        uuid not null references auth.users(id) on delete cascade,
  "opportunityId" uuid references public."Opportunity"("id") on delete set null,
  "sku"           text not null unique,
  "asin"          text,
  "title"         text not null,
  "bullets"       text not null default '[]',
  "description"   text not null default '',
  "keywords"      text not null default '[]',
  "price"         double precision not null,
  "minPrice"      double precision not null,
  "maxPrice"      double precision not null,
  "cogs"          double precision not null,
  "stock"         integer not null default 0,
  "fulfillment"   text not null default 'FBA' check ("fulfillment" in ('FBA','FBM')),
  "status"        text not null default 'pending_approval'
                  check ("status" in ('pending_approval','live','paused','rejected')),
  "createdAt"     timestamptz not null default now()
);

create table public."Campaign" (
  "id"          uuid primary key default gen_random_uuid(),
  "userId"      uuid not null references auth.users(id) on delete cascade,
  "productId"   uuid not null references public."Product"("id") on delete cascade,
  "externalId"  text,
  "name"        text not null,
  "dailyBudget" double precision not null,
  "status"      text not null default 'active' check ("status" in ('active','paused')),
  "spend"       double precision not null default 0,
  "sales"       double precision not null default 0,
  "clicks"      integer not null default 0,
  "impressions" integer not null default 0,
  "orders"      integer not null default 0,
  "lastSyncAt"  timestamptz not null default now(),
  "createdAt"   timestamptz not null default now()
);

create table public."Keyword" (
  "id"          uuid primary key default gen_random_uuid(),
  "campaignId"  uuid not null references public."Campaign"("id") on delete cascade,
  "text"        text not null,
  "matchType"   text not null default 'EXACT',
  "bid"         double precision not null,
  "state"       text not null default 'ENABLED' check ("state" in ('ENABLED','PAUSED')),
  "impressions" integer not null default 0,
  "clicks"      integer not null default 0,
  "orders"      integer not null default 0,
  "spend"       double precision not null default 0,
  "sales"       double precision not null default 0,
  unique ("campaignId", "text", "matchType")
);

create table public."DailyMetric" (
  "id"      uuid primary key default gen_random_uuid(),
  "userId"  uuid not null references auth.users(id) on delete cascade,
  "date"    text not null,  -- YYYY-MM-DD
  "revenue" double precision not null default 0,
  "adSpend" double precision not null default 0,
  "cogs"    double precision not null default 0,
  "fees"    double precision not null default 0,
  "units"   integer not null default 0,
  "profit"  double precision not null default 0,
  unique ("userId", "date")
);

create table public."ActivityLog" (
  "id"        uuid primary key default gen_random_uuid(),
  "userId"    uuid not null references auth.users(id) on delete cascade,
  "kind"      text not null,
  "message"   text not null,
  "detail"    text,
  "createdAt" timestamptz not null default now()
);

create index on public."ActivityLog" ("userId", "createdAt" desc);
create index on public."Opportunity" ("userId", "status", "score" desc);
create index on public."Product" ("userId", "status");
create index on public."Campaign" ("userId");
create index on public."Campaign" ("productId");
create index on public."Keyword" ("campaignId");
create index on public."DailyMetric" ("userId", "date");

-- ---------------------------------------------------------------- new-user bootstrap
-- Every Supabase Auth signup automatically gets a store row (simulation mode) and default settings.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public."Store" ("userId") values (new.id) on conflict do nothing;
  insert into public."AutopilotSettings" ("userId") values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- atomic counters
-- supabase-js has no `increment`, and read-modify-write would race when a cron tick overlaps a manual
-- run, so counters are bumped inside Postgres. Called by the service role only (see grants below).
create or replace function public.add_keyword_stats(
  p_id uuid, p_impressions integer, p_clicks integer, p_orders integer, p_spend double precision, p_sales double precision
) returns void language sql as $$
  update public."Keyword" set
    "impressions" = "impressions" + p_impressions,
    "clicks" = "clicks" + p_clicks,
    "orders" = "orders" + p_orders,
    "spend" = "spend" + p_spend,
    "sales" = "sales" + p_sales
  where "id" = p_id;
$$;

create or replace function public.add_campaign_stats(
  p_id uuid, p_impressions integer, p_clicks integer, p_orders integer, p_spend double precision, p_sales double precision, p_synced timestamptz
) returns void language sql as $$
  update public."Campaign" set
    "impressions" = "impressions" + p_impressions,
    "clicks" = "clicks" + p_clicks,
    "orders" = "orders" + p_orders,
    "spend" = "spend" + p_spend,
    "sales" = "sales" + p_sales,
    "lastSyncAt" = p_synced
  where "id" = p_id;
$$;

create or replace function public.add_daily_metric(
  p_user uuid, p_date text, p_revenue double precision, p_ad_spend double precision, p_cogs double precision,
  p_fees double precision, p_units integer, p_profit double precision
) returns void language sql as $$
  insert into public."DailyMetric" ("userId","date","revenue","adSpend","cogs","fees","units","profit")
  values (p_user, p_date, p_revenue, p_ad_spend, p_cogs, p_fees, p_units, p_profit)
  on conflict ("userId","date") do update set
    "revenue" = public."DailyMetric"."revenue" + excluded."revenue",
    "adSpend" = public."DailyMetric"."adSpend" + excluded."adSpend",
    "cogs"    = public."DailyMetric"."cogs"    + excluded."cogs",
    "fees"    = public."DailyMetric"."fees"    + excluded."fees",
    "units"   = public."DailyMetric"."units"   + excluded."units",
    "profit"  = public."DailyMetric"."profit"  + excluded."profit";
$$;

create or replace function public.take_stock(p_id uuid, p_units integer) returns void language sql as $$
  update public."Product" set "stock" = greatest(0, "stock" - p_units) where "id" = p_id;
$$;

revoke all on function public.add_keyword_stats(uuid,integer,integer,integer,double precision,double precision) from public, anon, authenticated;
revoke all on function public.add_campaign_stats(uuid,integer,integer,integer,double precision,double precision,timestamptz) from public, anon, authenticated;
revoke all on function public.add_daily_metric(uuid,text,double precision,double precision,double precision,double precision,integer,double precision) from public, anon, authenticated;
revoke all on function public.take_stock(uuid,integer) from public, anon, authenticated;
grant execute on function public.add_keyword_stats(uuid,integer,integer,integer,double precision,double precision) to service_role;
grant execute on function public.add_campaign_stats(uuid,integer,integer,integer,double precision,double precision,timestamptz) to service_role;
grant execute on function public.add_daily_metric(uuid,text,double precision,double precision,double precision,double precision,integer,double precision) to service_role;
grant execute on function public.take_stock(uuid,integer) to service_role;

-- ---------------------------------------------------------------- row level security
alter table public."Store"             enable row level security;
alter table public."AutopilotSettings" enable row level security;
alter table public."Opportunity"       enable row level security;
alter table public."Product"           enable row level security;
alter table public."Campaign"          enable row level security;
alter table public."Keyword"           enable row level security;
alter table public."DailyMetric"       enable row level security;
alter table public."ActivityLog"       enable row level security;

create policy "own rows" on public."Store"             for select to authenticated using ("userId" = auth.uid());
create policy "own rows" on public."AutopilotSettings" for select to authenticated using ("userId" = auth.uid());
create policy "own rows" on public."Opportunity"       for select to authenticated using ("userId" = auth.uid());
create policy "own rows" on public."Product"           for select to authenticated using ("userId" = auth.uid());
create policy "own rows" on public."Campaign"          for select to authenticated using ("userId" = auth.uid());
create policy "own rows" on public."DailyMetric"       for select to authenticated using ("userId" = auth.uid());
create policy "own rows" on public."ActivityLog"       for select to authenticated using ("userId" = auth.uid());
create policy "own rows" on public."Keyword"           for select to authenticated using (
  exists (select 1 from public."Campaign" c where c."id" = "campaignId" and c."userId" = auth.uid())
);

-- Browser-side clients are read-only: all writes go through the server with the service role.
revoke insert, update, delete on all tables in schema public from anon, authenticated;

-- Encrypted Amazon tokens must never reach the browser, even for the row's owner. A column-level REVOKE
-- is a no-op while a table-level SELECT grant exists, so drop the table grant and re-grant safe columns.
-- (Consequence: never `select *` on "Store" with a user-scoped client; use the service role.)
revoke select on public."Store" from anon, authenticated;
grant select ("id", "userId", "mode", "marketplaceId", "sellerId", "adsProfileId") on public."Store" to authenticated;


-- =====================================================================
-- 0002_shopper.sql
-- =====================================================================

-- Shopper site: catalog, offers, search, click/search analytics, price watches, earnings.
-- Public catalog data is readable by everyone (anon + signed-in); everything else is service-role only,
-- except a signed-in user's own price watches.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
-- Supabase grants this by default; stated here so the search functions work for anon/authenticated everywhere.
grant usage on schema extensions to anon, authenticated, service_role;

-- ---------------------------------------------------------------- tables
-- How each store gets onto the site:
--   feed : affiliate product feed imported into CatalogProduct/Offer (Awin, CJ, Impact, Rakuten, ...)
--   api  : searched live through the store's official API (amazon, ebay, shopify) and NOT stored
--   link : no data access; shown as a "search on <store>" link to the store's own search page
create table public."Retailer" (
  "slug"           text primary key,
  "name"           text not null,
  "domain"         text not null,
  "kind"           text not null default 'feed' check ("kind" in ('feed','api','link')),
  "countries"      text[] not null default '{}',   -- ISO country codes the retailer sells to ({} on api rows = decided by the API)
  "network"        text,                            -- awin | cj | impact | rakuten | ebay | amazon | shopify | direct
  "commissionRate" numeric(6,4) not null default 0, -- ESTIMATE for projections only; 0 = no affiliate relationship yet
  "searchUrl"      text,                            -- link kind: template with {q}, e.g. https://example.com/search?q={q}
  "affiliateParams" text not null default '',       -- link kind: extra query string for tracked links, e.g. aff_id=123
  "demo"           boolean not null default false,  -- true = sample data, shown with a visible banner
  "active"         boolean not null default true,
  check ("kind" <> 'link' or coalesce("searchUrl", '') like '%{q}%')  -- coalesce: a bare NULL would pass a CHECK
);

create table public."CatalogProduct" (
  "id"          uuid primary key default gen_random_uuid(),
  "dedupeKey"   text not null unique,               -- gtin, or brandSlug|normalised title
  "gtin"        text,
  "brand"       text not null default '',
  "brandSlug"   text not null default '',
  "title"       text not null,
  "category"    text not null default '',
  "categorySlug" text not null default '',
  "imageUrl"    text,
  "description" text not null default '',
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now(),
  "search"      tsvector generated always as (
    to_tsvector('simple', coalesce("brand", '') || ' ' || coalesce("title", '') || ' ' || coalesce("category", ''))
  ) stored
);
create index on public."CatalogProduct" using gin ("search");
create index on public."CatalogProduct" using gin ("title" extensions.gin_trgm_ops);
create index on public."CatalogProduct" using gin ("brand" extensions.gin_trgm_ops);
create index on public."CatalogProduct" ("brandSlug");
create index on public."CatalogProduct" ("categorySlug");
create index on public."CatalogProduct" ("gtin") where "gtin" is not null;

create table public."Offer" (
  "id"          uuid primary key default gen_random_uuid(),
  "productId"   uuid not null references public."CatalogProduct"("id") on delete cascade,
  "retailerSlug" text not null references public."Retailer"("slug") on delete cascade,
  "externalId"  text not null,
  "price"       numeric(12,2) not null check ("price" >= 0),
  "currency"    char(3) not null,
  "condition"   text not null default 'new' check ("condition" in ('new','used','refurbished','unknown')),
  "inStock"     boolean not null default true,
  "url"         text not null check ("url" ~* '^https?://'),   -- affiliate-tracked destination
  "shipsTo"     text[] not null default '{}',
  "rating"      numeric(3,2),
  "reviewCount" integer,
  "fetchedAt"   timestamptz not null default now(),
  unique ("retailerSlug", "externalId")
);
create index on public."Offer" ("productId");
create index on public."Offer" ("retailerSlug");

create table public."SearchEvent" (
  "id"          uuid primary key default gen_random_uuid(),
  "createdAt"   timestamptz not null default now(),
  "query"       text not null,
  "parsed"      jsonb,
  "country"     text,
  "resultCount" integer not null default 0,
  "latencyMs"   integer,
  "sources"     jsonb,                              -- per-source status: ok / error / skipped + timing
  "sessionHash" text
);
create index on public."SearchEvent" ("createdAt" desc);

create table public."ClickEvent" (
  "id"            uuid primary key default gen_random_uuid(),
  "createdAt"     timestamptz not null default now(),
  "source"        text not null,                    -- catalog | ebay | amazon | shopify | link
  "retailerSlug"  text not null,
  "offerKey"      text not null,
  "productId"     uuid,
  "query"         text,
  "country"       text,
  "position"      integer,
  "price"         numeric(12,2),
  "currency"      char(3),
  "estCommission" numeric(12,4) not null default 0, -- USD estimate = price in USD * retailer commissionRate
  "sessionHash"   text,
  "userId"        uuid
);
create index on public."ClickEvent" ("createdAt" desc);
create index on public."ClickEvent" ("retailerSlug", "createdAt" desc);

create table public."WatchItem" (
  "id"             uuid primary key default gen_random_uuid(),
  "userId"         uuid not null references auth.users(id) on delete cascade,
  "productId"      uuid not null references public."CatalogProduct"("id") on delete cascade,
  "targetPrice"    numeric(12,2) not null check ("targetPrice" > 0), -- alert fires when the best offer is at or below this
  "currency"       char(3) not null default 'USD',
  "country"        text not null default 'US',
  "active"         boolean not null default true,
  "lastNotifiedAt" timestamptz,
  "createdAt"      timestamptz not null default now(),
  unique ("userId", "productId")
);
create index on public."WatchItem" ("active");

create table public."Earning" (
  "id"           uuid primary key default gen_random_uuid(),
  "retailerSlug" text not null,
  "periodStart"  date not null,
  "periodEnd"    date not null,
  "clicks"       integer not null default 0,
  "orders"       integer not null default 0,
  "sales"        numeric(14,2) not null default 0,
  "commission"   numeric(14,2) not null default 0,
  "currency"     char(3) not null default 'USD',
  "importedAt"   timestamptz not null default now()
);

create table public."SourceCache" (
  "key"       text primary key,
  "payload"   jsonb not null,
  "expiresAt" timestamptz not null
);
create index on public."SourceCache" ("expiresAt");

-- Starter retailers. commissionRate is 0 until you have an approved affiliate relationship; set it then.
-- Link-out search URLs are best-effort patterns that could not be verified from the build environment:
-- open each once in a browser and correct "searchUrl" here if a store changed its URL format.
insert into public."Retailer" ("slug","name","domain","kind","countries","network","commissionRate","searchUrl") values
  ('amazon','Amazon','amazon.com','api','{US,CA,GB,DE,FR,IT,ES,AU,IN,MX,BR}','amazon',0,null),
  ('ebay','eBay','ebay.com','api','{US,CA,GB,DE,FR,IT,ES,AU,IN,NG,MX,BR}','ebay',0,null),
  ('shopify','Shopify stores','shopify.com','api','{}','shopify',0,null),
  ('jumia-ng','Jumia Nigeria','jumia.com.ng','link','{NG}','direct',0,'https://www.jumia.com.ng/catalog/?q={q}'),
  ('jumia-ke','Jumia Kenya','jumia.co.ke','link','{KE}','direct',0,'https://www.jumia.co.ke/catalog/?q={q}'),
  ('jumia-gh','Jumia Ghana','jumia.com.gh','link','{GH}','direct',0,'https://www.jumia.com.gh/catalog/?q={q}'),
  ('jumia-eg','Jumia Egypt','jumia.com.eg','link','{EG}','direct',0,'https://www.jumia.com.eg/catalog/?q={q}'),
  ('jiji-ng','Jiji Nigeria','jiji.ng','link','{NG}','direct',0,'https://jiji.ng/search?query={q}'),
  ('jiji-gh','Jiji Ghana','jiji.com.gh','link','{GH}','direct',0,'https://jiji.com.gh/search?query={q}'),
  ('jiji-ke','Jiji Kenya','jiji.co.ke','link','{KE}','direct',0,'https://jiji.co.ke/search?query={q}'),
  ('konga','Konga','konga.com','link','{NG}','direct',0,'https://www.konga.com/search?search={q}'),
  ('aliexpress','AliExpress','aliexpress.com','link','{US,CA,GB,DE,FR,ES,IT,AU,NG,IN,MX,BR,KE,GH,EG}','direct',0,'https://www.aliexpress.com/wholesale?SearchText={q}')
on conflict do nothing;

-- ---------------------------------------------------------------- search
-- p_tsq is a to_tsquery string built (and sanitised) by the app, e.g. 'running:* & shoes:*' or 'a | b'.
-- p_raw is the user's raw text for typo-tolerant trigram matching.
create or replace function public.search_catalog(
  p_tsq text, p_raw text, p_country text default null, p_min numeric default null, p_max numeric default null,
  p_brand_slug text default null, p_category_slug text default null, p_limit integer default 60
) returns table (
  "offerId" uuid, "productId" uuid, "title" text, "brand" text, "brandSlug" text, "category" text, "categorySlug" text,
  "imageUrl" text, "gtin" text, "retailerSlug" text, "retailerName" text, "retailerDemo" boolean,
  "price" numeric, "currency" char, "condition" text, "inStock" boolean, "url" text, "shipsTo" text[],
  "rating" numeric, "reviewCount" integer, "fetchedAt" timestamptz, "relevance" real
)
language sql stable security invoker set search_path = public, extensions as $$
  with q as (select case when coalesce(p_tsq, '') = '' then null else to_tsquery('simple', p_tsq) end as tsq),
  hits as (
    select p."id", p."title", p."brand", p."brandSlug", p."category", p."categorySlug", p."imageUrl", p."gtin",
           (case when q.tsq is not null then ts_rank_cd(p."search", q.tsq) else 0 end
            + case when coalesce(p_raw, '') <> '' then greatest(similarity(p."title", p_raw), similarity(p."brand", p_raw)) else 0 end)::real as relevance
    from public."CatalogProduct" p, q
    where (p_brand_slug is null or p."brandSlug" = p_brand_slug)
      and (p_category_slug is null or p."categorySlug" = p_category_slug)
      and (
        (q.tsq is null and coalesce(p_raw, '') = '')
        or (q.tsq is not null and p."search" @@ q.tsq)
        or (coalesce(p_raw, '') <> '' and (p."title" % p_raw or p."brand" % p_raw))
      )
    order by relevance desc
    limit greatest(least(p_limit, 200), 1)
  )
  select o."id", h."id", h."title", h."brand", h."brandSlug", h."category", h."categorySlug", h."imageUrl", h."gtin",
         r."slug", r."name", r."demo", o."price", o."currency", o."condition", o."inStock", o."url", o."shipsTo",
         o."rating", o."reviewCount", o."fetchedAt", h.relevance
  from hits h
  join public."Offer" o on o."productId" = h."id"
  join public."Retailer" r on r."slug" = o."retailerSlug" and r."active"
  where (p_country is null or p_country = any (o."shipsTo") or p_country = any (r."countries"))
    and (p_min is null or o."price" >= p_min)
    and (p_max is null or o."price" <= p_max)
  order by h.relevance desc, o."price" asc;
$$;

-- Typeahead: brands and products starting with / similar to the text.
create or replace function public.suggest_catalog(p_q text, p_limit integer default 8)
returns table ("kind" text, "label" text, "slug" text)
language sql stable security invoker set search_path = public, extensions as $$
  (select 'brand'::text, b."brand", b."brandSlug"
     from (select distinct "brand", "brandSlug" from public."CatalogProduct" where "brand" <> '') b
    where b."brand" ilike p_q || '%' or b."brand" % p_q
    order by similarity(b."brand", p_q) desc, b."brand" limit 4)
  union all
  (select 'product'::text, p."title", p."id"::text
     from public."CatalogProduct" p
    where p."title" ilike p_q || '%' or p."title" ilike '% ' || p_q || '%' or p."title" % p_q
    order by similarity(p."title", p_q) desc limit greatest(p_limit - 4, 1));
$$;

-- ---------------------------------------------------------------- admin analytics (service role only)
create or replace function public.admin_click_stats(p_days integer default 30)
returns table ("day" date, "retailerSlug" text, "clicks" bigint, "estCommission" numeric)
language sql stable as $$
  select ("createdAt" at time zone 'UTC')::date, "retailerSlug", count(*), coalesce(sum("estCommission"), 0)
  from public."ClickEvent" where "createdAt" >= now() - make_interval(days => p_days)
  group by 1, 2 order by 1;
$$;

create or replace function public.admin_top_queries(p_days integer default 30, p_zero_only boolean default false, p_limit integer default 20)
returns table ("query" text, "searches" bigint, "avgResults" numeric)
language sql stable as $$
  select lower("query"), count(*), round(avg("resultCount"), 1)
  from public."SearchEvent" where "createdAt" >= now() - make_interval(days => p_days)
  group by 1
  having (not p_zero_only) or max("resultCount") = 0
  order by 2 desc limit p_limit;
$$;

create or replace function public.admin_source_health(p_hours integer default 24)
returns table ("source" text, "status" text, "n" bigint)
language sql stable as $$
  select s.key, coalesce(s.value ->> 'status', 'unknown'), count(*)
  from public."SearchEvent" e, jsonb_each(coalesce(e."sources", '{}'::jsonb)) s
  where e."createdAt" >= now() - make_interval(hours => p_hours)
  group by 1, 2 order by 1, 2;
$$;

-- ---------------------------------------------------------------- privileges + RLS
alter table public."Retailer"       enable row level security;
alter table public."CatalogProduct" enable row level security;
alter table public."Offer"          enable row level security;
alter table public."SearchEvent"    enable row level security;
alter table public."ClickEvent"     enable row level security;
alter table public."WatchItem"      enable row level security;
alter table public."Earning"        enable row level security;
alter table public."SourceCache"    enable row level security;

create policy "public read" on public."Retailer"       for select to anon, authenticated using ("active");
create policy "public read" on public."CatalogProduct" for select to anon, authenticated using (true);
create policy "public read" on public."Offer"          for select to anon, authenticated using (true);
create policy "own watches" on public."WatchItem"      for select to authenticated using ("userId" = auth.uid());

-- Browser roles are read-only; analytics, earnings and caches are not readable by them at all.
revoke insert, update, delete on public."Retailer", public."CatalogProduct", public."Offer", public."WatchItem" from anon, authenticated;
revoke all on public."SearchEvent", public."ClickEvent", public."Earning", public."SourceCache" from anon, authenticated;
revoke all on public."WatchItem" from anon;

-- Hide commission rates and affiliate parameters from the public API key.
revoke select on public."Retailer" from anon, authenticated;
grant select ("slug","name","domain","kind","countries","demo","active") on public."Retailer" to anon, authenticated;

revoke all on function public.admin_click_stats(integer), public.admin_top_queries(integer, boolean, integer), public.admin_source_health(integer) from public, anon, authenticated;
grant execute on function public.admin_click_stats(integer), public.admin_top_queries(integer, boolean, integer), public.admin_source_health(integer) to service_role;
grant execute on function public.search_catalog(text, text, text, numeric, numeric, text, text, integer) to anon, authenticated, service_role;
grant execute on function public.suggest_catalog(text, integer) to anon, authenticated, service_role;


-- =====================================================================
-- 0003_product_pages.sql
-- =====================================================================

-- Product pages (SEO) and price history. Run after 0002.

-- Readable, unique URL slug per product: "northvale-trail-running-shoes-1a2b3c4d".
alter table public."CatalogProduct" add column "slug" text;

create or replace function public.set_product_slug() returns trigger
language plpgsql as $$
begin
  new."slug" := trim(both '-' from left(lower(regexp_replace(new."title", '[^a-zA-Z0-9]+', '-', 'g')), 70)) || '-' || left(new."id"::text, 8);
  return new;
end $$;

create trigger catalogproduct_slug before insert on public."CatalogProduct"
  for each row execute function public.set_product_slug();

update public."CatalogProduct"
   set "slug" = trim(both '-' from left(lower(regexp_replace("title", '[^a-zA-Z0-9]+', '-', 'g')), 70)) || '-' || left("id"::text, 8)
 where "slug" is null;

alter table public."CatalogProduct" alter column "slug" set not null;
create unique index on public."CatalogProduct" ("slug");

-- One row per product, currency and day: the cheapest in-stock price seen that day.
create table public."PriceSnapshot" (
  "productId" uuid not null references public."CatalogProduct"("id") on delete cascade,
  "day"       date not null,
  "currency"  char(3) not null,
  "minPrice"  numeric(12,2) not null,
  primary key ("productId", "day", "currency")
);

create or replace function public.snapshot_prices() returns integer
language sql security invoker as $$
  with up as (
    insert into public."PriceSnapshot" ("productId", "day", "currency", "minPrice")
    select o."productId", current_date, o."currency", min(o."price")
      from public."Offer" o join public."Retailer" r on r."slug" = o."retailerSlug" and r."active"
     where o."inStock" and not r."demo"
     group by o."productId", o."currency"
    on conflict ("productId", "day", "currency") do update set "minPrice" = least(public."PriceSnapshot"."minPrice", excluded."minPrice")
    returning 1)
  select count(*)::int from up;
$$;

alter table public."PriceSnapshot" enable row level security;
create policy "public read" on public."PriceSnapshot" for select to anon, authenticated using (true);
revoke insert, update, delete on public."PriceSnapshot" from anon, authenticated;
revoke all on function public.snapshot_prices() from public, anon, authenticated;
grant execute on function public.snapshot_prices() to service_role;

commit;
