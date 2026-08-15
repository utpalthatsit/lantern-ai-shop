-- ============================================================
-- 0003_add_insights_table.sql — insights + marketing drafts
-- RLS is enabled here (the tables are created in this file).
-- Policies are drop-if-exists guarded: safe to re-run.
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
alter table public.insights enable row level security;

create table if not exists public.marketing_drafts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  content text not null,
  channel text not null default 'wa',
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'sent')),
  created_at timestamptz not null default now()
);
alter table public.marketing_drafts enable row level security;

-- Insights (owner-only)
drop policy if exists "ins_select_own_shop" on public.insights;
create policy "ins_select_own_shop" on public.insights
  for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "ins_insert_own_shop" on public.insights;
create policy "ins_insert_own_shop" on public.insights
  for insert with check (shop_id in (select public.my_shop_ids()));

-- Marketing drafts
drop policy if exists "mkt_select_own_shop" on public.marketing_drafts;
create policy "mkt_select_own_shop" on public.marketing_drafts
  for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "mkt_insert_own_shop" on public.marketing_drafts;
create policy "mkt_insert_own_shop" on public.marketing_drafts
  for insert with check (shop_id in (select public.my_shop_ids()));
drop policy if exists "mkt_update_own_shop" on public.marketing_drafts;
create policy "mkt_update_own_shop" on public.marketing_drafts
  for update using (shop_id in (select public.my_shop_ids()));

-- Realtime: push conversation/message/booking changes to the owner console.
-- Guarded so re-running is safe (Postgres has no "if not exists" here).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations') then
    alter publication supabase_realtime add table public.conversations;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings') then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;
