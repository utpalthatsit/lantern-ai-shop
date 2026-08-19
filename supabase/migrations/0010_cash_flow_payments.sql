-- ============================================================
-- 0010_cash_flow_payments.sql — Cash flow & payment reminders
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- 1. Add payment columns to orders (one at a time for safety)
DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN payment_status text DEFAULT 'unpaid';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN due_date date;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN amount_paid numeric(10,2) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN payment_method text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN payment_notes text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. Payment reminders table
DO $$ BEGIN
  CREATE TABLE public.payment_reminders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name text NOT NULL,
    customer_phone text,
    amount numeric(10,2) NOT NULL,
    type text DEFAULT 'outgoing',
    status text DEFAULT 'pending',
    due_date date NOT NULL,
    reminder_date date,
    message text,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- 3. Cash flow entries table
DO $$ BEGIN
  CREATE TABLE public.cash_flow_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    description text NOT NULL,
    amount numeric(10,2) NOT NULL,
    type text NOT NULL,
    category text DEFAULT 'other',
    frequency text DEFAULT 'once',
    next_date date NOT NULL,
    active boolean DEFAULT true,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- 4. Indexes
DO $$ BEGIN
  CREATE INDEX payment_reminders_shop_idx ON public.payment_reminders (shop_id, due_date);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX cash_flow_shop_idx ON public.cash_flow_entries (shop_id, next_date, active);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. RLS for payment_reminders
DO $$ BEGIN
  ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "shop_sathi_payment_reminders" ON public.payment_reminders;
  CREATE POLICY "shop_sathi_payment_reminders" ON public.payment_reminders
    FOR SELECT USING (shop_id IN (SELECT public.my_shop_ids()));
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "shop_sathi_payment_reminders_insert" ON public.payment_reminders;
  CREATE POLICY "shop_sathi_payment_reminders_insert" ON public.payment_reminders
    FOR INSERT WITH CHECK (shop_id IN (SELECT public.my_shop_ids()));
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "shop_sathi_payment_reminders_update" ON public.payment_reminders;
  CREATE POLICY "shop_sathi_payment_reminders_update" ON public.payment_reminders
    FOR UPDATE USING (shop_id IN (SELECT public.my_shop_ids()));
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "shop_sathi_payment_reminders_delete" ON public.payment_reminders;
  CREATE POLICY "shop_sathi_payment_reminders_delete" ON public.payment_reminders
    FOR DELETE USING (shop_id IN (SELECT public.my_shop_ids()));
EXCEPTION WHEN others THEN NULL;
END $$;

-- 6. RLS for cash_flow_entries
DO $$ BEGIN
  ALTER TABLE public.cash_flow_entries ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "shop_sathi_cash_flow" ON public.cash_flow_entries;
  CREATE POLICY "shop_sathi_cash_flow" ON public.cash_flow_entries
    FOR SELECT USING (shop_id IN (SELECT public.my_shop_ids()));
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "shop_sathi_cash_flow_insert" ON public.cash_flow_entries;
  CREATE POLICY "shop_sathi_cash_flow_insert" ON public.cash_flow_entries
    FOR INSERT WITH CHECK (shop_id IN (SELECT public.my_shop_ids()));
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "shop_sathi_cash_flow_update" ON public.cash_flow_entries;
  CREATE POLICY "shop_sathi_cash_flow_update" ON public.cash_flow_entries
    FOR UPDATE USING (shop_id IN (SELECT public.my_shop_ids()));
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "shop_sathi_cash_flow_delete" ON public.cash_flow_entries;
  CREATE POLICY "shop_sathi_cash_flow_delete" ON public.cash_flow_entries
    FOR DELETE USING (shop_id IN (SELECT public.my_shop_ids()));
EXCEPTION WHEN others THEN NULL;
END $$;

-- 7. Settings column
DO $$ BEGIN
  ALTER TABLE public.settings ADD COLUMN payment_reminders_enabled boolean DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 8. Triggers
DO $$ BEGIN
  DROP TRIGGER IF EXISTS payment_reminders_set_updated_at ON public.payment_reminders;
  CREATE TRIGGER payment_reminders_set_updated_at BEFORE UPDATE ON public.payment_reminders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS cash_flow_entries_set_updated_at ON public.cash_flow_entries;
  CREATE TRIGGER cash_flow_entries_set_updated_at BEFORE UPDATE ON public.cash_flow_entries
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Done!
