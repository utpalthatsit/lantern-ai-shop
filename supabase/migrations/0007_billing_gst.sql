-- ============================================================
-- 0007_billing_gst.sql
-- Billing: GST-ready invoices for the Billing page.
--   • products.gst_rate     — per-product GST % (0/5/12/18/28)
--   • shops.gstin           — seller GSTIN (printed on invoices)
--   • customers.gstin       — buyer GSTIN
--   • orders                — invoice fields (invoice_no, subtotal,
--                             discount_amount, tax_amount, gstin,
--                             customer_gstin) so a bill is a completed
--                             order with full GST math
--   • order_items.gst_rate  — GST applied on each line
-- All adds are guarded so the migration is safe to re-run.
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
