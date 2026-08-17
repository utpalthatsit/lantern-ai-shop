-- ============================================================
-- 0009_wa_per_shop.sql — per-shop WhatsApp credentials
-- Every shop connects its OWN WhatsApp Business Cloud API
-- number by saving these values in its Settings. Falls back
-- to server-level secrets (WHATSAPP_TOKEN etc.) when a shop
-- has not saved its own.
-- ============================================================
alter table public.settings
  add column if not exists wa_token text,
  add column if not exists wa_phone_number_id text,
  add column if not exists wa_app_secret text,
  add column if not exists wa_verify_token text;
