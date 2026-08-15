-- ============================================================
-- 0002_rls_policies.sql — Row Level Security
-- Every table is scoped by shop_id; owners only see their own.
-- NOTE: insights + marketing_drafts get their RLS enabled in
-- 0003 (they are created there) so migrations run in order.
-- All policies are drop-if-exists guarded: safe to re-run.
-- ============================================================

alter table public.shops enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.inventory_items enable row level security;
alter table public.bookings enable row level security;

-- Helper: the shop id(s) the current user owns (superseded by 0004/0005)
create or replace function public.my_shop_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.shops where owner_id = auth.uid();
$$;

-- shops: owner can read/write their own
drop policy if exists "shops_select_own" on public.shops;
create policy "shops_select_own" on public.shops
  for select using (owner_id = auth.uid());
drop policy if exists "shops_insert_own" on public.shops;
create policy "shops_insert_own" on public.shops
  for insert with check (owner_id = auth.uid());
drop policy if exists "shops_update_own" on public.shops;
create policy "shops_update_own" on public.shops
  for update using (owner_id = auth.uid());

-- conversations
drop policy if exists "conv_select_own_shop" on public.conversations;
create policy "conv_select_own_shop" on public.conversations
  for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "conv_insert_own_shop" on public.conversations;
create policy "conv_insert_own_shop" on public.conversations
  for insert with check (shop_id in (select public.my_shop_ids()));
drop policy if exists "conv_update_own_shop" on public.conversations;
create policy "conv_update_own_shop" on public.conversations
  for update using (shop_id in (select public.my_shop_ids()));

-- messages (via conversation -> shop)
drop policy if exists "msg_select_own_shop" on public.messages;
create policy "msg_select_own_shop" on public.messages
  for select using (
    exists (select 1 from public.conversations c
            where c.id = conversation_id and c.shop_id in (select public.my_shop_ids())));
drop policy if exists "msg_insert_own_shop" on public.messages;
create policy "msg_insert_own_shop" on public.messages
  for insert with check (
    exists (select 1 from public.conversations c
            where c.id = conversation_id and c.shop_id in (select public.my_shop_ids())));

-- inventory
drop policy if exists "inv_select_own_shop" on public.inventory_items;
create policy "inv_select_own_shop" on public.inventory_items
  for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "inv_insert_own_shop" on public.inventory_items;
create policy "inv_insert_own_shop" on public.inventory_items
  for insert with check (shop_id in (select public.my_shop_ids()));
drop policy if exists "inv_update_own_shop" on public.inventory_items;
create policy "inv_update_own_shop" on public.inventory_items
  for update using (shop_id in (select public.my_shop_ids()));
drop policy if exists "inv_delete_own_shop" on public.inventory_items;
create policy "inv_delete_own_shop" on public.inventory_items
  for delete using (shop_id in (select public.my_shop_ids()));

-- bookings
drop policy if exists "bk_select_own_shop" on public.bookings;
create policy "bk_select_own_shop" on public.bookings
  for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "bk_insert_own_shop" on public.bookings;
create policy "bk_insert_own_shop" on public.bookings
  for insert with check (shop_id in (select public.my_shop_ids()));
drop policy if exists "bk_update_own_shop" on public.bookings;
create policy "bk_update_own_shop" on public.bookings
  for update using (shop_id in (select public.my_shop_ids()));
