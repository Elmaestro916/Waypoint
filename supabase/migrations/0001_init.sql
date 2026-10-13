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
