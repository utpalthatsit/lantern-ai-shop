-- ============================================================
-- 0010_cash_flow_payments.sql — Cash flow forecasting & payment reminders
-- Run this in Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- 1. Add payment tracking to orders
DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS due_date date;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_paid numeric(10,2) NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_notes text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. Payment reminders table
CREATE TABLE IF NOT EXISTS public.payment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  type text NOT NULL DEFAULT 'outgoing',
  status text NOT NULL DEFAULT 'pending',
  due_date date NOT NULL,
  reminder_date date,
  message text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Cash flow entries table
CREATE TABLE IF NOT EXISTS public.cash_flow_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(10,2) NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  category text NOT NULL DEFAULT 'other',
  frequency text NOT NULL DEFAULT 'once',
  next_date date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS payment_reminders_shop_idx ON public.payment_reminders (shop_id, due_date);
CREATE INDEX IF NOT EXISTS cash_flow_shop_idx ON public.cash_flow_entries (shop_id, next_date, active);

-- 5. RLS for payment_reminders
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_sathi_payment_reminders" ON public.payment_reminders;
CREATE POLICY "shop_sathi_payment_reminders" ON public.payment_reminders
  FOR SELECT USING (shop_id IN (SELECT public.my_shop_ids()));
DROP POLICY IF EXISTS "shop_sathi_payment_reminders_insert" ON public.payment_reminders;
CREATE POLICY "shop_sathi_payment_reminders_insert" ON public.payment_reminders
  FOR INSERT WITH CHECK (shop_id IN (SELECT public.my_shop_ids()));
DROP POLICY IF EXISTS "shop_sathi_payment_reminders_update" ON public.payment_reminders;
CREATE POLICY "shop_sathi_payment_reminders_update" ON public.payment_reminders
  FOR UPDATE USING (shop_id IN (SELECT public.my_shop_ids()));
DROP POLICY IF EXISTS "shop_sathi_payment_reminders_delete" ON public.payment_reminders;
CREATE POLICY "shop_sathi_payment_reminders_delete" ON public.payment_reminders
  FOR DELETE USING (shop_id IN (SELECT public.my_shop_ids()));

-- 6. RLS for cash_flow_entries
ALTER TABLE public.cash_flow_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_sathi_cash_flow" ON public.cash_flow_entries;
CREATE POLICY "shop_sathi_cash_flow" ON public.cash_flow_entries
  FOR SELECT USING (shop_id IN (SELECT public.my_shop_ids()));
DROP POLICY IF EXISTS "shop_sathi_cash_flow_insert" ON public.cash_flow_entries;
CREATE POLICY "shop_sathi_cash_flow_insert" ON public.cash_flow_entries
  FOR INSERT WITH CHECK (shop_id IN (SELECT public.my_shop_ids()));
DROP POLICY IF EXISTS "shop_sathi_cash_flow_update" ON public.cash_flow_entries;
CREATE POLICY "shop_sathi_cash_flow_update" ON public.cash_flow_entries
  FOR UPDATE USING (shop_id IN (SELECT public.my_shop_ids()));
DROP POLICY IF EXISTS "shop_sathi_cash_flow_delete" ON public.cash_flow_entries;
CREATE POLICY "shop_sathi_cash_flow_delete" ON public.cash_flow_entries
  FOR DELETE USING (shop_id IN (SELECT public.my_shop_ids()));

-- 7. Settings: payment_reminders_enabled
DO $$ BEGIN
  ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS payment_reminders_enabled boolean NOT NULL DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 8. Triggers
DROP TRIGGER IF EXISTS payment_reminders_set_updated_at ON public.payment_reminders;
CREATE TRIGGER payment_reminders_set_updated_at BEFORE UPDATE ON public.payment_reminders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS cash_flow_entries_set_updated_at ON public.cash_flow_entries;
CREATE TRIGGER cash_flow_entries_set_updated_at BEFORE UPDATE ON public.cash_flow_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Done!
