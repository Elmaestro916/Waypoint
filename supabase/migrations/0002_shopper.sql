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
