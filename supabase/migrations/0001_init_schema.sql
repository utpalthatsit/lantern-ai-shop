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
