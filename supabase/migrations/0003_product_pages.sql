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
