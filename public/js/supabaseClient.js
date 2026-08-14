/* ============================================================
   Lantern — supabaseClient.js
   Data layer. If window.SUPABASE_CONFIG.url is set, talks to
   Supabase REST (RLS-scoped). Otherwise runs in demo mode with
   an in-memory store (js/demo.js) so the whole UI is usable
   without a backend.
   ============================================================ */
import { demo } from "./demo.js";

const cfg = (window.SUPABASE_CONFIG || {});
export const isDemo = !cfg.url;

/* ---------- Supabase REST helpers ---------- */
let authToken = null;
export function setAuthToken(t) { authToken = t; }

async function supa(method, path, body) {
  const res = await fetch(`${cfg.url.replace(/\/$/, "")}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${authToken || cfg.anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${path} → ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* ---------- Public db facade ---------- */
export const db = {
  isDemo,
  shop() {
    return isDemo ? demo.shop() : null;
  },

  async conversations() { return isDemo ? demo.conversations() : supa("GET", "conversations?select=*&order=last_message_at.desc"); },
  async messages(convId) { return isDemo ? demo.messages(convId) : supa("GET", `messages?select=*&conversation_id=eq.${convId}&order=created_at.asc`); },
  async sendMessage(convId, content, sender = "owner") {
    if (isDemo) return demo.sendMessage(convId, content, sender);
    return supa("POST", "messages", { conversation_id: convId, sender, content });
  },
  async autoReply(convId) { if (isDemo) return demo.autoReply(convId); },
  async simulateIncoming() { if (isDemo) return demo.simulateIncoming(); },

  async inventory() { return isDemo ? demo.inventory() : supa("GET", "inventory_items?select=*&order=name.asc"); },
  async createItem(data) { return isDemo ? demo.createItem(data) : supa("POST", "inventory_items", data); },
  async updateItem(id, patch) { return isDemo ? demo.updateItem(id, patch) : supa("PATCH", `inventory_items?id=eq.${id}`, patch); },
  async adjustQty(id, delta) { return isDemo ? demo.adjustQty(id, delta) : null; },

  async bookings() { return isDemo ? demo.bookings() : supa("GET", "bookings?select=*&order=start_time.asc"); },
  async createBooking(data) { return isDemo ? demo.createBooking(data) : supa("POST", "bookings", data); },
  async setBookingStatus(id, status) {
    return isDemo ? demo.setBookingStatus(id, status) : supa("PATCH", `bookings?id=eq.${id}`, { status });
  },

  async insights() { return isDemo ? demo.insights() : (await supa("GET", "insights?select=*&order=period.desc&limit=1"))[0] || null; },
  async drafts() { return isDemo ? demo.drafts() : supa("GET", "marketing_drafts?select=*&order=created_at.desc"); },
  async setDraftStatus(id, status) {
    return isDemo ? demo.setDraftStatus(id, status) : supa("PATCH", `marketing_drafts?id=eq.${id}`, { status });
  },
  async generateDraft() { return isDemo ? demo.generateDraft() : null; },

  subscribeConversations(cb) {
    if (isDemo) return demo.subscribeConversations(cb);
    return () => {}; /* realtime would attach here via supabase-js channel */
  },
};

export async function signInWithOtp(phone) {
  if (isDemo) return { demo: true };
  /* Production: POST /auth/v1/otp with phone — supabase-js handles this;
     kept as a stub so demo flows first. */
  return supa("POST", "..", null).catch(() => ({ stub: true }));
}
