-- ============================================================
-- 0008_ratings.sql
-- Customer ratings + storefront order lookup support.
--   • ratings — 1–5 star reviews tied to an order + phone.
--     Written only by edge functions (service role). Owners
--     read via RLS; the storefront reads via web-chat actions.
--   • RLS: owners/members may select their shop's ratings.
-- ============================================================

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  customer_phone text,
  customer_name text,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (order_id, customer_phone)
);

alter table public.ratings enable row level security;

create index if not exists ratings_shop_created_idx on public.ratings (shop_id, created_at desc);

-- Owners and team members can read their shop's ratings.
create policy "owners read ratings" on public.ratings
  for select using (
    shop_id in (select public.my_shop_ids())
  );
