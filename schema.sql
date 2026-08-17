-- ============================================================
-- ShopSathi — FULL SCHEMA (all 5 migrations, applied in order)
-- Paste this ENTIRE file into Supabase SQL Editor and click Run.
-- Safe to run once; do not run twice. Success = "Success. No rows returned"
-- ============================================================

-- >>> supabase/migrations/0001_init_schema.sql <<<
-- ============================================================
-- 0001_init_schema.sql — core tables
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  whatsapp_number text,
  hours jsonb not null default '{}'::jsonb,
  language text not null default 'en',
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  customer_phone text not null,
  status text not null default 'open'
    check (status in ('open', 'escalated', 'closed')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists conversations_shop_idx on public.conversations (shop_id, last_message_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  sender text not null check (sender in ('customer', 'ai', 'owner')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_conv_idx on public.messages (conversation_id, created_at asc);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  name text not null,
  sku text,
  quantity integer not null default 0,
  price numeric(10, 2) not null default 0,
  low_stock_threshold integer not null default 5,
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  customer_phone text,
  service text not null,
  staff text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  created_at timestamptz not null default now()
);

create index if not exists bookings_shop_time_idx on public.bookings (shop_id, start_time);

-- >>> supabase/migrations/0002_rls_policies.sql <<<
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

-- >>> supabase/migrations/0003_add_insights_table.sql <<<
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

-- >>> supabase/migrations/0004_shop_sathi_core.sql <<<
-- ============================================================
-- 0004_shop_sathi_core.sql — ShopSathi full product schema
-- Evolves 0001–0003: renames inventory_items -> products,
-- adds the commerce tables (customers, orders, order_items,
-- notifications, settings, ai_logs, shop_members,
-- inventory_history), triggers, and complete RLS.
-- ============================================================

-- 1. products (was inventory_items). Renames are guarded so this
-- migration is safe to re-run after a partial apply.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'inventory_items')
     and not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'products') then
    alter table public.inventory_items rename to products;
  end if;
end $$;

alter table public.products
  add column if not exists description text,
  add column if not exists category text,
  add column if not exists discount numeric(10,2) not null default 0,
  add column if not exists image_url text,
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'quantity')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'stock') then
    alter table public.products rename column quantity to stock;
  end if;
end $$;

alter table public.products
  add constraint products_stock_nonneg check (stock >= 0),
  add constraint products_discount_range check (discount >= 0 and discount <= 100);

create index if not exists products_shop_active_idx on public.products (shop_id, active);
create index if not exists products_category_idx on public.products (shop_id, category);

-- 2. shops — extra business fields
alter table public.shops
  add column if not exists category text,
  add column if not exists address text,
  add column if not exists currency text not null default 'INR',
  add column if not exists tagline text,
  add column if not exists updated_at timestamptz not null default now();

-- 3. shop_members
create table if not exists public.shop_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  unique (shop_id, user_id)
);
create index if not exists shop_members_user_idx on public.shop_members (user_id);
create index if not exists shop_members_shop_idx on public.shop_members (shop_id);

-- 4. customers
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, phone)
);
create index if not exists customers_shop_idx on public.customers (shop_id, created_at desc);
create index if not exists customers_shop_name_idx on public.customers (shop_id, lower(name));
create index if not exists customers_shop_phone_idx on public.customers (shop_id, phone);

-- 5. orders + order_items
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'processing', 'completed', 'cancelled')),
  total numeric(10,2) not null default 0 check (total >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_shop_created_idx on public.orders (shop_id, created_at desc);
create index if not exists orders_shop_status_idx on public.orders (shop_id, status);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- 6. bookings — align with the product (pending status, notes)
alter table public.bookings
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists customer_name text,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings
  add constraint bookings_status_check
    check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  add constraint bookings_time_order check (end_time > start_time);

-- 7. conversations — preview + unread tracking
alter table public.conversations
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists customer_name text,
  add column if not exists last_message text,
  add column if not exists owner_unread integer not null default 0;

-- 8. messages — allow system sender
alter table public.messages drop constraint if exists messages_sender_check;
alter table public.messages
  add constraint messages_sender_check
    check (sender in ('customer', 'ai', 'owner', 'system'));

-- 9. notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  type text not null
    check (type in ('low_stock', 'new_order', 'order_status', 'new_booking',
                    'booking_reminder', 'customer_message', 'ai_escalation', 'system')),
  title text not null,
  body text,
  read boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists notifications_shop_created_idx on public.notifications (shop_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (shop_id) where read = false;

-- 10. settings
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null unique references public.shops(id) on delete cascade,
  currency text not null default 'INR',
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  opening_hours jsonb not null default '{}'::jsonb,
  language text not null default 'en',
  ai_autoreply_enabled boolean not null default true,
  whatsapp_enabled boolean not null default false,
  booking_reminders boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 11. ai_logs
create table if not exists public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  model text,
  action text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_logs_shop_created_idx on public.ai_logs (shop_id, created_at desc);

-- 12. inventory_history
create table if not exists public.inventory_history (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  change integer not null,
  reason text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists inventory_history_product_idx on public.inventory_history (product_id, created_at desc);
create index if not exists inventory_history_shop_idx on public.inventory_history (shop_id, created_at desc);

-- 13. triggers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

drop trigger if exists shops_set_updated_at on public.shops;
create trigger shops_set_updated_at before update on public.shops
  for each row execute function public.set_updated_at();

-- Keep conversation list in sync: bump last_message_at, store a preview,
-- and count unread owner messages whenever a message is inserted.
create or replace function public.touch_conversation()
returns trigger language plpgsql as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         last_message = left(new.content, 200),
         owner_unread = case
           when new.sender = 'customer' then owner_unread + 1
           else 0
         end
   where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists messages_touch_conv on public.messages;
create trigger messages_touch_conv after insert on public.messages
  for each row execute function public.touch_conversation();

-- Low-stock notifications (fires once per dip below threshold).
create or replace function public.notify_low_stock()
returns trigger language plpgsql as $$
begin
  if new.stock <= new.low_stock_threshold and
     (tg_op = 'INSERT' or old.stock > new.low_stock_threshold) then
    if not exists (
      select 1 from public.notifications n
       where n.shop_id = new.shop_id
         and n.type = 'low_stock'
         and n.read = false
         and n.data->>'product_id' = new.id::text
    ) then
      insert into public.notifications (shop_id, type, title, body, data)
      values (new.shop_id, 'low_stock',
              format('Low stock: %s', new.name),
              format('%s units left — below the %s threshold.', new.stock, new.low_stock_threshold),
              jsonb_build_object('product_id', new.id, 'product_name', new.name, 'stock', new.stock));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists products_low_stock on public.products;
create trigger products_low_stock after insert or update of stock, low_stock_threshold on public.products
  for each row execute function public.notify_low_stock();

-- New order + order status notifications.
create or replace function public.notify_order()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (shop_id, type, title, body, data)
    values (new.shop_id, 'new_order',
            format('New order from %s', new.customer_name),
            format('Order %s — ₹%s', left(new.id::text, 8), new.total),
            jsonb_build_object('order_id', new.id, 'total', new.total));
  elsif old.status is distinct from new.status then
    insert into public.notifications (shop_id, type, title, body, data)
    values (new.shop_id, 'order_status',
            format('Order %s → %s', left(new.id::text, 8), new.status),
            format('%s for ₹%s is now %s.', new.customer_name, new.total, new.status),
            jsonb_build_object('order_id', new.id, 'status', new.status));
  end if;
  return new;
end $$;

drop trigger if exists orders_notify on public.orders;
create trigger orders_notify after insert or update of status on public.orders
  for each row execute function public.notify_order();

-- New booking notifications.
create or replace function public.notify_booking()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (shop_id, type, title, body, data)
    values (new.shop_id, 'new_booking',
            format('New booking: %s', new.service),
            format('%s on %s', coalesce(new.customer_name, new.customer_phone, 'A customer'),
                   to_char(new.start_time at time zone 'UTC', 'Mon DD HH24:MI')),
            jsonb_build_object('booking_id', new.id, 'start_time', new.start_time));
  end if;
  return new;
end $$;

drop trigger if exists bookings_notify on public.bookings;
create trigger bookings_notify after insert on public.bookings
  for each row execute function public.notify_booking();

-- 14. RLS — complete coverage for every table
-- my_shop_ids: shops the user owns OR is a member of.
create or replace function public.my_shop_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id from public.shops s where s.owner_id = auth.uid()
  union
  select m.shop_id from public.shop_members m where m.user_id = auth.uid();
$$;

alter table public.shop_members enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.notifications enable row level security;
alter table public.settings enable row level security;
alter table public.ai_logs enable row level security;
alter table public.inventory_history enable row level security;

-- shops
drop policy if exists "shop_sathi_shops" on public.shops;
create policy "shop_sathi_shops" on public.shops for select using (owner_id = auth.uid() or id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_shops_insert" on public.shops;
create policy "shop_sathi_shops_insert" on public.shops for insert with check (owner_id = auth.uid());
drop policy if exists "shop_sathi_shops_update" on public.shops;
create policy "shop_sathi_shops_update" on public.shops for update using (owner_id = auth.uid());

-- shop_members
drop policy if exists "shop_sathi_shop_members" on public.shop_members;
create policy "shop_sathi_shop_members" on public.shop_members for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_shop_members_insert" on public.shop_members;
create policy "shop_sathi_shop_members_insert" on public.shop_members for insert with check (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_shop_members_update" on public.shop_members;
create policy "shop_sathi_shop_members_update" on public.shop_members for update using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_shop_members_delete" on public.shop_members;
create policy "shop_sathi_shop_members_delete" on public.shop_members for delete using (shop_id in (select public.my_shop_ids()));

-- customers
drop policy if exists "shop_sathi_customers" on public.customers;
create policy "shop_sathi_customers" on public.customers for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_customers_insert" on public.customers;
create policy "shop_sathi_customers_insert" on public.customers for insert with check (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_customers_update" on public.customers;
create policy "shop_sathi_customers_update" on public.customers for update using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_customers_delete" on public.customers;
create policy "shop_sathi_customers_delete" on public.customers for delete using (shop_id in (select public.my_shop_ids()));

-- products (renamed inventory_items keeps its old RLS; drop it explicitly)
drop policy if exists "inv_select_own_shop" on public.products;
drop policy if exists "inv_insert_own_shop" on public.products;
drop policy if exists "inv_update_own_shop" on public.products;
drop policy if exists "inv_delete_own_shop" on public.products;
drop policy if exists "shop_sathi_products" on public.products;
create policy "shop_sathi_products" on public.products for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_products_insert" on public.products;
create policy "shop_sathi_products_insert" on public.products for insert with check (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_products_update" on public.products;
create policy "shop_sathi_products_update" on public.products for update using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_products_delete" on public.products;
create policy "shop_sathi_products_delete" on public.products for delete using (shop_id in (select public.my_shop_ids()));

-- orders + order_items
drop policy if exists "shop_sathi_orders" on public.orders;
create policy "shop_sathi_orders" on public.orders for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_orders_insert" on public.orders;
create policy "shop_sathi_orders_insert" on public.orders for insert with check (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_orders_update" on public.orders;
create policy "shop_sathi_orders_update" on public.orders for update using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_orders_delete" on public.orders;
create policy "shop_sathi_orders_delete" on public.orders for delete using (shop_id in (select public.my_shop_ids()));

drop policy if exists "shop_sathi_order_items" on public.order_items;
create policy "shop_sathi_order_items" on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id and o.shop_id in (select public.my_shop_ids())));
drop policy if exists "shop_sathi_order_items_insert" on public.order_items;
create policy "shop_sathi_order_items_insert" on public.order_items for insert with check (
  exists (select 1 from public.orders o where o.id = order_id and o.shop_id in (select public.my_shop_ids())));
drop policy if exists "shop_sathi_order_items_update" on public.order_items;
create policy "shop_sathi_order_items_update" on public.order_items for update using (
  exists (select 1 from public.orders o where o.id = order_id and o.shop_id in (select public.my_shop_ids())));
drop policy if exists "shop_sathi_order_items_delete" on public.order_items;
create policy "shop_sathi_order_items_delete" on public.order_items for delete using (
  exists (select 1 from public.orders o where o.id = order_id and o.shop_id in (select public.my_shop_ids())));

-- bookings
drop policy if exists "bk_select_own_shop" on public.bookings;
drop policy if exists "bk_insert_own_shop" on public.bookings;
drop policy if exists "bk_update_own_shop" on public.bookings;
drop policy if exists "shop_sathi_bookings" on public.bookings;
create policy "shop_sathi_bookings" on public.bookings for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_bookings_insert" on public.bookings;
create policy "shop_sathi_bookings_insert" on public.bookings for insert with check (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_bookings_update" on public.bookings;
create policy "shop_sathi_bookings_update" on public.bookings for update using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_bookings_delete" on public.bookings;
create policy "shop_sathi_bookings_delete" on public.bookings for delete using (shop_id in (select public.my_shop_ids()));

-- conversations + messages
drop policy if exists "conv_select_own_shop" on public.conversations;
drop policy if exists "conv_insert_own_shop" on public.conversations;
drop policy if exists "conv_update_own_shop" on public.conversations;
drop policy if exists "msg_select_own_shop" on public.messages;
drop policy if exists "msg_insert_own_shop" on public.messages;
drop policy if exists "shop_sathi_conversations" on public.conversations;
create policy "shop_sathi_conversations" on public.conversations for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_conversations_insert" on public.conversations;
create policy "shop_sathi_conversations_insert" on public.conversations for insert with check (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_conversations_update" on public.conversations;
create policy "shop_sathi_conversations_update" on public.conversations for update using (shop_id in (select public.my_shop_ids()));

drop policy if exists "shop_sathi_messages" on public.messages;
create policy "shop_sathi_messages" on public.messages for select using (
  exists (select 1 from public.conversations c where c.id = conversation_id and c.shop_id in (select public.my_shop_ids())));
drop policy if exists "shop_sathi_messages_insert" on public.messages;
create policy "shop_sathi_messages_insert" on public.messages for insert with check (
  exists (select 1 from public.conversations c where c.id = conversation_id and c.shop_id in (select public.my_shop_ids())));
drop policy if exists "shop_sathi_messages_update" on public.messages;
create policy "shop_sathi_messages_update" on public.messages for update using (
  exists (select 1 from public.conversations c where c.id = conversation_id and c.shop_id in (select public.my_shop_ids())));

-- notifications (owner reads / marks read; inserts come from triggers & server)
drop policy if exists "shop_sathi_notifications" on public.notifications;
create policy "shop_sathi_notifications" on public.notifications for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_notifications_insert" on public.notifications;
create policy "shop_sathi_notifications_insert" on public.notifications for insert with check (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_notifications_update" on public.notifications;
create policy "shop_sathi_notifications_update" on public.notifications for update using (shop_id in (select public.my_shop_ids()));

-- settings
drop policy if exists "shop_sathi_settings" on public.settings;
create policy "shop_sathi_settings" on public.settings for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_settings_insert" on public.settings;
create policy "shop_sathi_settings_insert" on public.settings for insert with check (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_settings_update" on public.settings;
create policy "shop_sathi_settings_update" on public.settings for update using (shop_id in (select public.my_shop_ids()));

-- ai_logs (select-only for owners; written by edge functions via service role)
drop policy if exists "shop_sathi_ai_logs" on public.ai_logs;
create policy "shop_sathi_ai_logs" on public.ai_logs for select using (shop_id in (select public.my_shop_ids()));

-- inventory_history
drop policy if exists "shop_sathi_inventory_history" on public.inventory_history;
create policy "shop_sathi_inventory_history" on public.inventory_history for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_inventory_history_insert" on public.inventory_history;
create policy "shop_sathi_inventory_history_insert" on public.inventory_history for insert with check (shop_id in (select public.my_shop_ids()));

-- insights + marketing_drafts — make them shop-member aware too.
drop policy if exists "ins_select_own_shop" on public.insights;
drop policy if exists "ins_insert_own_shop" on public.insights;
drop policy if exists "mkt_select_own_shop" on public.marketing_drafts;
drop policy if exists "mkt_insert_own_shop" on public.marketing_drafts;
drop policy if exists "mkt_update_own_shop" on public.marketing_drafts;
drop policy if exists "shop_sathi_insights" on public.insights;
create policy "shop_sathi_insights" on public.insights for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_insights_insert" on public.insights;
create policy "shop_sathi_insights_insert" on public.insights for insert with check (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_marketing_drafts" on public.marketing_drafts;
create policy "shop_sathi_marketing_drafts" on public.marketing_drafts for select using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_marketing_drafts_insert" on public.marketing_drafts;
create policy "shop_sathi_marketing_drafts_insert" on public.marketing_drafts for insert with check (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_marketing_drafts_update" on public.marketing_drafts;
create policy "shop_sathi_marketing_drafts_update" on public.marketing_drafts for update using (shop_id in (select public.my_shop_ids()));
drop policy if exists "shop_sathi_marketing_drafts_delete" on public.marketing_drafts;
create policy "shop_sathi_marketing_drafts_delete" on public.marketing_drafts for delete using (shop_id in (select public.my_shop_ids()));

-- 15. realtime — guarded so re-running is safe (Postgres has no
-- "if not exists" for publication membership).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products') then
    alter publication supabase_realtime add table public.products;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'customers') then
    alter publication supabase_realtime add table public.customers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_history') then
    alter publication supabase_realtime add table public.inventory_history;
  end if;
end $$;

-- >>> supabase/migrations/0005_team_helpers.sql <<<
-- ============================================================
-- 0005_team_helpers.sql — safe user lookups for the invite flow.
-- The browser cannot read auth.users directly; these security
-- definer functions expose only what the invite flow needs and
-- are scoped to the caller's own shops.
-- ============================================================

-- Members of the caller's shops (owner or member), with emails.
create or replace function public.my_shop_members()
returns table (id uuid, role text, email text)
language sql stable security definer set search_path = public
as $$
  select sm.id, sm.role, u.email
  from public.shop_members sm
  join auth.users u on u.id = sm.user_id
  where sm.shop_id in (select public.my_shop_ids())
  order by sm.created_at;
$$;

grant execute on function public.my_shop_members() to authenticated;

-- Exact email lookup, used only to attach an existing account to a shop.
-- Only callers who own (or belong to) at least one shop may look up an
-- email — this stops arbitrary account enumeration by random users.
create or replace function public.find_user_by_email(target text)
returns table (id uuid, email text)
language sql stable security definer set search_path = public
as $$
  select u.id, u.email
  from auth.users u
  where lower(u.email) = lower(target)
    and exists (select 1 from public.shop_members where user_id = auth.uid())
  limit 1;
$$;

grant execute on function public.find_user_by_email(text) to authenticated;

-- ============================================================
-- my_shop_ids — redefined to include team memberships.
-- The 0002 version only covered owned shops, which locked
-- managers/staff out of every RLS policy. This supersedes it.
-- ============================================================
create or replace function public.my_shop_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select shop_id from public.shop_members where user_id = auth.uid()
  union
  select id from public.shops where owner_id = auth.uid();
$$;

-- >>> supabase/migrations/0007_billing_gst.sql <<<
-- ============================================================
-- 0007_billing_gst.sql — GST billing fields
-- ============================================================

alter table public.products
  add column if not exists gst_rate numeric(4,2) not null default 0
  check (gst_rate >= 0 and gst_rate <= 100);

alter table public.shops
  add column if not exists gstin text;

alter table public.customers
  add column if not exists gstin text;

alter table public.orders
  add column if not exists invoice_no text,
  add column if not exists subtotal numeric(10,2) not null default 0,
  add column if not exists discount_amount numeric(10,2) not null default 0,
  add column if not exists tax_amount numeric(10,2) not null default 0,
  add column if not exists gstin text,
  add column if not exists customer_gstin text;

alter table public.order_items
  add column if not exists gst_rate numeric(4,2) not null default 0;

create index if not exists orders_shop_invoice_idx on public.orders (shop_id, invoice_no);

-- >>> supabase/migrations/0008_ratings.sql <<<
-- ============================================================
-- 0008_ratings.sql — customer ratings
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

create policy "owners read ratings" on public.ratings
  for select using (
    shop_id in (select public.my_shop_ids())
  );
