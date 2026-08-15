# ShopSathi — The AI business assistant for local shops

ShopSathi is a real, production-ready SaaS platform where a shop owner runs their
entire business — catalog, stock, customers, orders, bookings, WhatsApp conversations,
AI assistant and marketing — and customers talk to the shop over WhatsApp and the web.

No demo data, no fake auth, no mock APIs. Everything is real Supabase (PostgreSQL +
RLS + Edge Functions), real Anthropic Claude, and the real WhatsApp Business Cloud API.

**Stack:** Vanilla JS (ES modules) · Supabase (auth, Postgres, RLS, realtime, edge functions) · Anthropic Claude · Vercel · WhatsApp Business Cloud API

---

## Quick start (local)

```bash
# 1. Start Supabase locally
supabase start

# 2. Run the migrations (0001 → 0005)
supabase db reset          # applies all migrations

# 3. Set edge-function secrets
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... ANTHROPIC_MODEL=claude-sonnet-4-5

# 4. Serve the frontend
node serve.js              # http://127.0.0.1:4173

# 5. Open http://127.0.0.1:4173 → "Open console" → sign up
```

Local dev uses the Supabase local Auth UI (test OTP `123456`, email confirmations
disabled — see `supabase/config.toml`). The console needs real credentials: paste
`SUPABASE_URL` and `SUPABASE_ANON_KEY` into the script tag at the bottom of
`public/app.html` (or run `node scripts/inject-env.mjs` with the env vars set).

---

## Project structure

```
public/
  index.html              Cinematic marketing landing page
  app.html                Owner console shell (auth gate → onboarding → 11 tabs)
  css/                    Design system (base/layout/components + per-page)
  js/
    main.js               Boot, router, onboarding, realtime, badges
    supabaseClient.js     supabase-js client + typed db helpers (all scoped by shop_id)
    auth.js               Signup / login / OTP / forgot / reset / recovery
    pages/                dashboard, products, inventory, customers, orders,
                          bookings, conversations, aiAssistant, notifications,
                          settings, marketing
    utils/                constants (icons), formatters, validators, ui states
    components/           toast, modal (+confirm), chatBubble
supabase/
  migrations/0001..0005   Schema, RLS, helpers (reproducible)
  functions/              Edge functions (see below)
  config.toml             Local Supabase config
scripts/inject-env.mjs    Vercel build step — injects Supabase URL/anon key into app.html
vercel.json               Static deploy config
```

---

## Database

Migrations in `supabase/migrations/` build the whole schema reproducibly:

- **0001–0003** — original schema (kept for continuity)
- **0004** — ShopSathi core: `shops`, `shop_members`, `customers`, `products`,
  `orders`, `order_items`, `bookings`, `conversations`, `messages`,
  `notifications`, `settings`, `inventory_history`, `ai_logs`, `marketing_drafts` —
  every row is scoped by `shop_id`; triggers keep stock + inventory history in sync,
  auto-create notifications (low stock, new order/booking, escalation), bump
  `last_message_at` on conversations, and prevent double-booking conflicts.
- **0005** — team helpers (RPCs the browser can call: list/remove members by email).

### RLS model

Every table has strict policies. A user can only touch rows whose `shop_id` belongs
to a shop they own or are a member of (`shops`/`shop_members` policies chain
through `auth.uid()`). The service-role key is **never** used in the browser — the
anon key is used everywhere, and RLS is the only guard. Edge functions run with the
service role **server-side only**.

## Edge functions

| Function | Purpose | Auth |
|---|---|---|
| `ai-chat-handler` | The AI with **controlled tools** (search_products, get_product, check_inventory, create_booking, get_booking, create_order, get_customer, update_customer, escalate_to_owner). The LLM can never run SQL — every action is validated server-side against the caller's shop. Persists messages, logs to `ai_logs`. Runs on Gemini (free) or Claude via `_shared/ai.ts`. | JWT (from the console) **or** internal webhook call |
| `whatsapp-webhook` | Meta webhook: GET verification + POST with HMAC signature check (`WHATSAPP_APP_SECRET`). Finds the shop by `whatsapp_number`, upserts customer, stores message, calls the AI, replies via WhatsApp Cloud API. | Public (`verify_jwt = false`) — self-authenticates via signature |
| `send-message` | Owner replies from the Conversations tab (WhatsApp or web-channel). | JWT |
| `business-summary` | Generates the owner's AI business summary from **real** DB stats (orders, bookings, low stock…). Also used by the daily job. | JWT (or cron with anon token) |
| `daily-summary-job` | Cron entry point that calls `business-summary` for every shop and writes a notification. | Cron (service role via pg_cron) |
| `send-reminders` | Cron entry point that sends booking reminders (configured in `settings`) via WhatsApp. | Cron |
| `generate-post` | Drafts a marketing post from real product/shop data — owner must approve before anything happens. | JWT |

---

## Environment variables

| Variable | Where | Required for |
|---|---|---|
| `SUPABASE_URL` | Vercel env + `public/app.html` | Everything (app won't boot without it) |
| `SUPABASE_ANON_KEY` | Vercel env + `public/app.html` | Everything (public by design; RLS guards data) |
| `GEMINI_API_KEY` | `supabase secrets set` | AI assistant, WhatsApp AI, summaries, marketing drafts — **FREE tier**, get it at https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | `supabase secrets set` | AI model (default `gemini-2.0-flash`, free-tier eligible) |
| `ANTHROPIC_API_KEY` | `supabase secrets set` | Alternative paid AI provider (only if you prefer Claude) |
| `ANTHROPIC_MODEL` | `supabase secrets set` | AI (default `claude-sonnet-4-5`) |

Set **either** `GEMINI_API_KEY` (free, recommended) **or** `ANTHROPIC_API_KEY`. The shared
helper in `supabase/functions/_shared/ai.ts` picks Gemini first, then Claude.
| `WHATSAPP_TOKEN` | `supabase secrets set` | Sending WhatsApp replies/messages |
| `WHATSAPP_PHONE_NUMBER_ID` | `supabase secrets set` | Sending WhatsApp replies/messages |
| `WHATSAPP_APP_SECRET` | `supabase secrets set` | Webhook signature verification |
| `WHATSAPP_VERIFY_TOKEN` | `supabase secrets set` + Meta dashboard | Webhook handshake |

`.env.example` documents all of these. **Never commit real values** — the anon key
goes in the client only because RLS makes it safe.

## WhatsApp setup (REQUIRES EXTERNAL CREDENTIAL)

1. Create an app at https://developers.facebook.com → WhatsApp → get a test
   number + permanent token + phone number ID.
2. `supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_APP_SECRET=... WHATSAPP_VERIFY_TOKEN=<your-random-string>`
3. In the Meta dashboard → Webhook → subscribe to `messages`.
   Callback URL: `https://<project-ref>.functions.supabase.co/whatsapp-webhook`
   Verify token: the same random string.
4. In `settings.whatsapp_number` of the shop row, store the shop's WhatsApp number
   (E.164, e.g. `+919876543210`) — the webhook routes messages to the right shop.
5. Test: message your number → ShopSathi replies using real product data.

Until credentials exist, the Conversations tab works with **web-channel** messages
and the web chat UI; nothing fakes a WhatsApp delivery.

## Scheduled jobs

Enable `pg_cron` in the Supabase dashboard, then create schedules:

```sql
-- Daily 8:30 AM business summary → notification
select cron.schedule('shopsathi-daily-summary', '30 8 * * *',
  $$select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/business-summary',
    headers := jsonb_build_object('Authorization', 'Bearer <anon-key>'))$$);

-- Booking reminders every 15 min (function checks each shop's reminder settings)
select cron.schedule('shopsathi-reminders', '*/15 * * * *',
  $$select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/send-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer <anon-key>'))$$);
```

## Deploy to Vercel

1. Push the repo to GitHub → import into Vercel (framework: Other; the `vercel.json`
   build command injects env into `app.html`).
2. Set env vars in Vercel: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
3. Deploy. `vercel.json` rewrites `/app` → `app.html` and falls back to the landing
   page for unknown paths; the console itself uses hash routing so no server
   rewrites are needed for tabs.
4. In Supabase dashboard: set Auth `site_url` to your Vercel domain and add it to
   `additional_redirect_urls` (so password-reset links land correctly). Enable
   email confirmations to block signup spam.

---

## Testing checklist

Run `supabase db reset` on a fresh database, then through the UI:

- [ ] Sign up, sign in, sign out, forgot-password → reset link → new password
- [ ] Phone OTP sign-in (local test code `123456`)
- [ ] Onboarding creates a shop, then the dashboard loads real (empty) state
- [ ] Products: create / edit / delete / search / filter / sort / inactive toggle
- [ ] Inventory: adjust stock, see history entries and low-stock notifications
- [ ] Customers: create / edit / profile with orders + bookings + conversations
- [ ] Orders: create with line items, walk the status lifecycle, stock updates
- [ ] Bookings: create / confirm / cancel / reschedule; double-booking is rejected
- [ ] Conversations: web-channel message in, owner reply, escalation badge
- [ ] AI Assistant: "is the blue shirt available?" → checks real inventory
- [ ] Notifications: mark read, unread badge clears, bell routes to the page
- [ ] Settings: shop profile updates, low-stock threshold, WhatsApp number
- [ ] Marketing: generate draft → approve (no fake sends)
- [ ] Second account cannot read the first shop's rows (RLS)
- [ ] Mobile width: no horizontal scroll, drawer nav, usable touch targets
- [ ] `node scripts/inject-env.mjs` runs cleanly; console has no errors

## Known limitations

- **REQUIRES EXTERNAL CREDENTIAL:** WhatsApp delivery needs Meta credentials, and
  AI replies/summaries/drafts need a free `GEMINI_API_KEY` (or paid Anthropic key).
  Until then everything else works; AI and WhatsApp fail loudly (never silently faked).
- Local Supabase is for development only — deploy the migrations to your cloud
  project (`supabase link` + `supabase db push`).
- Email delivery (confirmations, password reset) uses Supabase's built-in SMTP;
  for production volume configure your own SMTP sender in the dashboard.
- The landing-page demo window is marketing animation, not app data.
