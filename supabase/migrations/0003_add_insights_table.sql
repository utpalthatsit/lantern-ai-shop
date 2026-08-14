-- ============================================================
-- 0003_add_insights_table.sql — insights + marketing drafts
-- ============================================================

create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  period date not null,
  summary_text text not null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (shop_id, period)
);

create table if not exists public.marketing_drafts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  content text not null,
  channel text not null default 'wa',
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'sent')),
  created_at timestamptz not null default now()
);

-- Insights (owner-only)
create policy "ins_select_own_shop" on public.insights
  for select using (shop_id in (select public.my_shop_ids()));
create policy "ins_insert_own_shop" on public.insights
  for insert with check (shop_id in (select public.my_shop_ids()));

-- Marketing drafts
create policy "mkt_select_own_shop" on public.marketing_drafts
  for select using (shop_id in (select public.my_shop_ids()));
create policy "mkt_insert_own_shop" on public.marketing_drafts
  for insert with check (shop_id in (select public.my_shop_ids()));
create policy "mkt_update_own_shop" on public.marketing_drafts
  for update using (shop_id in (select public.my_shop_ids()));

-- Realtime: push conversation/message changes to the owner console
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.bookings;
