# Lantern ✨ — The AI business assistant for local shops

Lantern answers customers, books appointments, tracks stock, writes marketing, and
briefs the owner every morning — over WhatsApp, in any language, at any hour.
Built for the people behind the counter: cafés, barbershops, boutiques, repair shops.

**Stack:** vanilla HTML/CSS/JS (no bundler) · Supabase (Postgres + Auth + RLS +
Edge Functions) · Anthropic Claude · WhatsApp Business Cloud API.

---

## ✨ What's in the repo

```
public/                    # Static frontend — deploy as-is (Netlify/Vercel/Pages)
  index.html               # Cinematic landing page (letterbox intro, aurora, chat demo)
  app.html                 # Owner console (auth gate → sidebar → 5 tabs)
  css/  base · layout · components · pages/*
  js/   main (router) · supabaseClient (db facade) · demo (sample backend)
        pages/{chat,inventory,bookings,insights,marketing}.js
        components/{toast,modal,chatBubble}.js
supabase/
  migrations/              # 0001 schema · 0002 RLS · 0003 insights + realtime
  functions/               # whatsapp-webhook · ai-chat-handler · daily-summary-job
                           # send-reminders · generate-post
.env.example               # Frontend keys + Edge Function secrets
```

## 🚀 Run it

**Demo mode (no backend needed):** serve `public/` statically, sign in with any
phone number and OTP `123456`.

```bash
node serve.js            # tiny static server, no deps
# or: cd public && python3 -m http.server 4173
# open http://localhost:4173
```

The console ships with a full in-memory sample shop (Ember Café): live-looking
WhatsApp conversations (including Hinglish + escalated threads), inventory with
low-stock alerts, a bookings timeline, an AI daily briefing with charts, and
marketing drafts you can approve. A simulated customer message arrives ~6s after
login to show the realtime flow.

**Production:** set `SUPABASE_URL` + `SUPABASE_ANON_KEY` in
`app.html`'s `window.SUPABASE_CONFIG`, apply the migrations, and the same UI
reads/writes through PostgREST with RLS scoping everything to the owner's shop.

```bash
supabase start                 # local stack (test OTP: 123456)
supabase db reset
supabase functions deploy whatsapp-webhook ai-chat-handler daily-summary-job send-reminders generate-post
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... WHATSAPP_TOKEN=... WHATSAPP_VERIFY_TOKEN=...
```

## 🔐 Security model

- Secrets (Anthropic, WhatsApp) live only in Edge Function secrets.
- The browser only ever holds the public `anon` key; RLS policies match
  `auth.uid()` → `shops.owner_id` → `shop_id` on every table.
- WhatsApp webhooks verify the HMAC signature before touching anything.
- Marketing and broadcasts are **never** auto-sent — the owner approves first.

## 🎬 Design notes

- **Cinematic grade:** deep blacks, warm amber→rose gradients, film grain overlay,
  vignette, aurora blobs, letterbox curtain intro, Fraunces display type.
- **Graceful degradation:** if Supabase isn't configured, the UI runs on demo data
  so the product can be experienced end-to-end with zero setup.

## Roadmap (from the PRD)

1. ✅ Schema + RLS + owner console shell
2. ✅ Inventory CRUD (validates the wiring end-to-end)
3. 🚧 WhatsApp webhook → Q&A → order/booking actions
4. 🚧 Bookings + reminder cron
5. 🚧 Daily summaries, marketing approvals, escalations polish
