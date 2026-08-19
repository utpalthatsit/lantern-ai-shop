-- ============================================================
-- 0010_cash_flow_payments.sql — Cash flow forecasting & payment reminders
-- Adds: payment_reminders, cash_flow_entries, order payment tracking
-- ============================================================

-- 1. Add payment tracking columns to orders
do $$ begin
  alter table public.orders
    add column if not exists payment_status text not null default 'unpaid'
      check (payment_status in ('unpaid', 'partial', 'paid')),
    add column if not exists due_date date,
    add column if not exists amount_paid numeric(10,2) not null default 0 check (amount_paid >= 0),
    add column if not exists payment_method text,
    add column if not exists payment_notes text;
exception when duplicate_column then null;
end $$;

-- 2. Payment reminders table
create table if not exists public.payment_reminders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  amount numeric(10,2) not null check (amount > 0),
  type text not null default 'outgoing'
    check (type in ('outgoing', 'incoming')),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'completed', 'cancelled')),
  due_date date not null,
  reminder_date date,
  message text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_reminders_shop_idx on public.payment_reminders (shop_id, due_date);
create index if not exists payment_reminders_status_idx on public.payment_reminders (shop_id, status);

-- 3. Cash flow entries (recurring/one-off expected income & expenses)
create table if not exists public.cash_flow_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  description text not null,
  amount numeric(10,2) not null,
  type text not null check (type in ('income', 'expense')),
  category text not null default 'other'
    check (category in ('sales', 'booking', 'other_income', 'rent', 'salary', 'supplies', 'utilities', 'tax', 'other')),
  frequency text not null default 'once'
    check (frequency in ('once', 'weekly', 'monthly', 'quarterly')),
  next_date date not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cash_flow_shop_idx on public.cash_flow_entries (shop_id, next_date, active);

-- 4. Expand notifications type check
do $$ begin
  alter table public.notifications drop constraint if exists notifications_type_check;
  alter table public.notifications
    add constraint notifications_type_check
      check (type in ('low_stock', 'new_order', 'order_status', 'new_booking',
                      'booking_reminder', 'customer_message', 'ai_escalation', 'system',
                      'payment_reminder', 'cash_flow_alert'));
exception when duplicate_object then null;
end $$;

-- 5. RLS for payment_reminders
alter table public.payment_reminders enable row level security;
drop policy if exists "shop_sathi_payment_reminders" on public.payment_reminders;
create policy "shop_sathi_payment_reminders" on public.payment_reminders
  for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_payment_reminders_insert" on public.payment_reminders;
create policy "shop_sathi_payment_reminders_insert" on public.payment_reminders
  for insert with check (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_payment_reminders_update" on public.payment_reminders;
create policy "shop_sathi_payment_reminders_update" on public.payment_reminders
  for update using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_payment_reminders_delete" on public.payment_reminders;
create policy "shop_sathi_payment_reminders_delete" on public.payment_reminders
  for delete using (shop_id in (select public.my_shop_ids()));

-- 6. RLS for cash_flow_entries
alter table public.cash_flow_entries enable row level security;
drop policy if exists "shop_sathi_cash_flow" on public.cash_flow_entries;
create policy "shop_sathi_cash_flow" on public.cash_flow_entries
  for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_cash_flow_insert" on public.cash_flow_entries;
create policy "shop_sathi_cash_flow_insert" on public.cash_flow_entries
  for insert with check (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_cash_flow_update" on public.cash_flow_entries;
create policy "shop_sathi_cash_flow_update" on public.cash_flow_entries
  for update using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_cash_flow_delete" on public.cash_flow_entries;
create policy "shop_sathi_cash_flow_delete" on public.cash_flow_entries
  for delete using (shop_id in (select public.my_shop_ids()));

-- 7. Settings: payment_reminders_enabled
do $$ begin
  alter table public.settings
    add column if not exists payment_reminders_enabled boolean not null default true;
exception when duplicate_column then null;
end $$;

-- 8. Triggers for updated_at
drop trigger if exists payment_reminders_set_updated_at on public.payment_reminders;
create trigger payment_reminders_set_updated_at before update on public.payment_reminders
  for each row execute function public.set_updated_at();

drop trigger if exists cash_flow_entries_set_updated_at on public.cash_flow_entries;
create trigger cash_flow_entries_set_updated_at before update on public.cash_flow_entries
  for each row execute function public.set_updated_at();

-- 9. Realtime
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_reminders') then
    alter publication supabase_realtime add table public.payment_reminders;
  end if;
end $$;
