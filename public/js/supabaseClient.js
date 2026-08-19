/* ============================================================
   VyaparSathi — supabaseClient.js (real data layer)
   supabase-js v2 handles auth sessions, realtime and REST.
   Every query is scoped by shop_id; RLS enforces ownership.
   There is no demo mode: if Supabase isn't configured the app
   shows a setup screen instead of pretending to work.
   ============================================================ */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cfg = window.SUPABASE_CONFIG || {};
export const isConfigured = Boolean(cfg.url && cfg.anonKey);

export const supabase = isConfigured
  ? createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "vyaparsathi.auth",
      },
    })
  : null;

let currentShop = null;
export function setShop(shop) { currentShop = shop; }
export function getShop() { return currentShop; }

function shopId() {
  if (!currentShop) throw new Error("No active shop — please reload.");
  return currentShop.id;
}

export async function fn(name, body) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const msg = error.context?.message || error.message || `Edge function ${name} failed`;
    throw new Error(msg);
  }
  return data;
}

export const db = {
  setShop,
  getShop,

  /* ---------- Products ---------- */
  async products(opts = {}) {
    let q = supabase.from("products").select("*").eq("shop_id", shopId()).order("name", { ascending: true });
    if (opts.search) q = q.ilike("name", `%${opts.search}%`);
    if (opts.category) q = q.eq("category", opts.category);
    if (opts.active === true) q = q.eq("active", true);
    if (opts.active === false) q = q.eq("active", false);
    const { data, error } = await q;
    if (error) throw error;
    let list = data || [];
    // PostgREST can't compare two columns in a filter — do it client-side.
    if (opts.lowStock) list = list.filter((p) => p.stock <= p.low_stock_threshold);
    return list;
  },

  async createProduct(data) {
    const { data: row, error } = await supabase.from("products")
      .insert({ shop_id: shopId(), ...data }).select().single();
    if (error) throw error;
    return row;
  },

  async updateProduct(id, patch) {
    const { data, error } = await supabase.from("products").update(patch)
      .eq("id", id).eq("shop_id", shopId()).select().single();
    if (error) throw error;
    return data;
  },

  async deleteProduct(id) {
    const { error } = await supabase.from("products").delete()
      .eq("id", id).eq("shop_id", shopId());
    if (error) throw error;
  },

  /* Stock change → product update + inventory_history row (one reason, no negatives) */
  async adjustStock(productId, delta, reason = "manual", note = "") {
    const d = Number(delta);
    if (!Number.isInteger(d) || d === 0) throw new Error("Stock change must be a non-zero integer");
    const { data: product } = await supabase.from("products")
      .select("id, name, stock").eq("id", productId).eq("shop_id", shopId()).single();
    if (!product) throw new Error("Product not found");
    const next = product.stock + d;
    if (next < 0) throw new Error(`Cannot go below 0 — only ${product.stock} in stock`);
    const { error: upErr } = await supabase.from("products")
      .update({ stock: next }).eq("id", productId).eq("shop_id", shopId());
    if (upErr) throw upErr;
    const { error: histErr } = await supabase.from("inventory_history").insert({
      shop_id: shopId(), product_id: productId, change: d, reason: reason || "manual", note: note || null,
    });
    if (histErr) throw histErr;
    return { ...product, stock: next };
  },

  async inventoryHistory(productId) {
    let q = supabase.from("inventory_history").select("*, products(name)")
      .eq("shop_id", shopId()).order("created_at", { ascending: false }).limit(100);
    if (productId) q = q.eq("product_id", productId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  /* ---------- Customers ---------- */
  async customers(opts = {}) {
    let q = supabase.from("customers").select("*").eq("shop_id", shopId())
      .order("created_at", { ascending: false });
    if (opts.search) {
      q = q.or(`name.ilike.%${opts.search}%,phone.ilike.%${opts.search}%,email.ilike.%${opts.search}%`);
    }
    const { data, error } = await q.limit(300);
    if (error) throw error;
    return data || [];
  },

  async createCustomer(data) {
    const { data: row, error } = await supabase.from("customers")
      .insert({ shop_id: shopId(), ...data }).select().single();
    if (error) throw error;
    return row;
  },

  async updateCustomer(id, patch) {
    const { data, error } = await supabase.from("customers").update(patch)
      .eq("id", id).eq("shop_id", shopId()).select().single();
    if (error) throw error;
    return data;
  },

  async deleteCustomer(id) {
    const { error } = await supabase.from("customers").delete()
      .eq("id", id).eq("shop_id", shopId());
    if (error) throw error;
  },

  async customerProfile(id) {
    const { data: customer, error } = await supabase.from("customers")
      .select("*").eq("id", id).eq("shop_id", shopId()).single();
    if (error) throw error;
    const [orders, bookings, conversations] = await Promise.all([
      supabase.from("orders").select("*").eq("shop_id", shopId()).eq("customer_id", id)
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("bookings").select("*").eq("shop_id", shopId()).eq("customer_id", id)
        .order("start_time", { ascending: false }).limit(50),
      supabase.from("conversations").select("*").eq("shop_id", shopId()).eq("customer_id", id)
        .order("last_message_at", { ascending: false }).limit(50),
    ]);
    return {
      customer,
      orders: orders.data || [],
      bookings: bookings.data || [],
      conversations: conversations.data || [],
    };
  },

  /* ---------- Orders ---------- */
  async orders(opts = {}) {
    let q = supabase.from("orders").select("*, order_items(*)").eq("shop_id", shopId())
      .order("created_at", { ascending: false });
    if (opts.status) q = q.eq("status", opts.status);
    if (opts.search) q = q.or(`customer_name.ilike.%${opts.search}%,customer_phone.ilike.%${opts.search}%`);
    const { data, error } = await q.limit(200);
    if (error) throw error;
    return data || [];
  },

  /** Lookup past orders + bills by phone number (flexible: matches last 10 digits). */
  async ordersByPhone(phone) {
    if (!phone || phone.length < 5) return { orders: [], customer: null };
    const digits = phone.replace(/[^\d]/g, "");
    const last10 = digits.slice(-10);
    if (last10.length < 5) return { orders: [], customer: null };
    const { data: orders, error: oErr } = await supabase.from("orders")
      .select("*, order_items(*)").eq("shop_id", shopId())
      .ilike("customer_phone", `%${last10}%`)
      .order("created_at", { ascending: false }).limit(20);
    if (oErr) throw oErr;
    const { data: cust } = await supabase.from("customers")
      .select("*").eq("shop_id", shopId())
      .ilike("phone", `%${last10}%`).maybeSingle();
    return { orders: orders || [], customer: cust || null };
  },

  async createOrder({ customer_name, customer_phone, items, notes }) {
    if (!customer_name) throw new Error("Customer name is required");
    if (!Array.isArray(items) || !items.length) throw new Error("Add at least one product");
    // Resolve products server-side too, but validate quantities here.
    const rows = [];
    for (const it of items) {
      const qty = Number(it.quantity);
      if (!Number.isInteger(qty) || qty < 1) throw new Error("Quantities must be positive whole numbers");
      const { data: p, error } = await supabase.from("products")
        .select("id, name, price, discount, stock, active").eq("id", it.product_id).eq("shop_id", shopId()).maybeSingle();
      if (error || !p || !p.active) throw new Error(`"${it.name || "Product"}" is not available`);
      if (p.stock < qty) throw new Error(`Only ${p.stock} of "${p.name}" in stock`);
      const unit = Number(p.price) * (1 - (Number(p.discount) || 0) / 100);
      rows.push({ product_id: p.id, name: p.name, price: Math.round(unit * 100) / 100, quantity: qty });
    }
    const total = Math.round(rows.reduce((s, r) => s + r.price * r.quantity, 0) * 100) / 100;
    const { data: order, error } = await supabase.from("orders").insert({
      shop_id: shopId(), customer_name, customer_phone: customer_phone || null,
      status: "pending", total, notes: notes || null,
    }).select().single();
    if (error) throw error;
    const { error: itemsErr } = await supabase.from("order_items").insert(
      rows.map((r) => ({ order_id: order.id, product_id: r.product_id, name: r.name, price: r.price, quantity: r.quantity })),
    );
    if (itemsErr) throw itemsErr;
    return order;
  },

  async setOrderStatus(id, status) {
    const { data, error } = await supabase.from("orders").update({ status })
      .eq("id", id).eq("shop_id", shopId()).select().single();
    if (error) throw error;
    return data;
  },

  /* ---------- Billing (GST invoices) ---------- */
  async bills(limit = 20) {
    let q = supabase.from("orders").select("*, order_items(*)").eq("shop_id", shopId())
      .not("invoice_no", "is", null).order("created_at", { ascending: false });
    const { data, error } = await q.limit(limit);
    if (error) throw error;
    return data || [];
  },

  /* A bill is a completed order with full GST math already applied.
     Stock is decremented by the existing order_items trigger. */
  async createBill({ customer_name, customer_phone, customer_gstin, items, subtotal, discount_amount, tax_amount, total, notes }) {
    if (!customer_name) throw new Error("Customer name is required");
    if (!Array.isArray(items) || !items.length) throw new Error("Add at least one product");
    for (const it of items) {
      if (!it.product_id) throw new Error('"' + it.name + '" is not in your catalog — add it on the Products page first');
      const qty = Number(it.quantity);
      if (!Number.isInteger(qty) || qty < 1) throw new Error("Quantities must be positive whole numbers");
      if (!(Number(it.price) >= 0)) throw new Error('"' + it.name + '" needs a valid rate');
    }

    const year = new Date().getFullYear();
    const { count } = await supabase.from("orders").select("*", { count: "exact", head: true })
      .eq("shop_id", shopId()).not("invoice_no", "is", null);
    const invoice_no = 'INV-' + year + '-' + String((count || 0) + 1).padStart(4, "0");

    const { data: order, error } = await supabase.from("orders").insert({
      shop_id: shopId(),
      customer_name, customer_phone: customer_phone || null, customer_gstin: customer_gstin || null,
      status: "completed", total,
      subtotal, discount_amount, tax_amount, invoice_no,
      notes: notes || null,
    }).select().single();
    if (error) throw error;

    const { error: itemsErr } = await supabase.from("order_items").insert(
      items.map((r) => ({
        order_id: order.id, product_id: r.product_id, name: r.name,
        price: Math.round(Number(r.price) * 100) / 100,
        quantity: Number(r.quantity), gst_rate: Number(r.gst_rate) || 0,
      })),
    );
    if (itemsErr) throw itemsErr;

    /* Keep customers in sync — a bill often creates/updates one. */
    if (customer_phone) {
      const { data: existing } = await supabase.from("customers")
        .select("id").eq("shop_id", shopId()).eq("phone", customer_phone).maybeSingle();
      if (existing) {
        await supabase.from("customers").update({ name: customer_name, gstin: customer_gstin || null })
          .eq("id", existing.id);
      } else {
        await supabase.from("customers").insert({
          shop_id: shopId(), name: customer_name, phone: customer_phone, gstin: customer_gstin || null,
        });
      }
    }
    return { ...order, items: items.map((r) => ({ ...r, order_id: order.id })) };
  },

  /* ---------- Ratings ---------- */
  async ratings(limit = 12) {
    const { data, error } = await supabase.from("ratings")
      .select("*").eq("shop_id", shopId()).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },

  /* ---------- Bookings ---------- */
  async bookings(opts = {}) {
    let q = supabase.from("bookings").select("*").eq("shop_id", shopId())
      .order("start_time", { ascending: true });
    if (opts.status) q = q.eq("status", opts.status);
    if (opts.from) q = q.gte("start_time", opts.from);
    const { data, error } = await q.limit(300);
    if (error) throw error;
    return data || [];
  },

  /* Conflict check: overlapping pending/confirmed booking (same staff if given) */
  async bookingConflict(start, end, staff, excludeId) {
    let q = supabase.from("bookings")
      .select("id, service, start_time, end_time, staff, status")
      .eq("shop_id", shopId()).in("status", ["pending", "confirmed"])
      .lt("start_time", end.toISOString()).gt("end_time", start.toISOString());
    if (staff) q = q.eq("staff", staff);
    if (excludeId) q = q.neq("id", excludeId);
    const { data, error } = await q.limit(5);
    if (error) throw error;
    return data || [];
  },

  async createBooking(data) {
    const { data: row, error } = await supabase.from("bookings")
      .insert({ shop_id: shopId(), status: "confirmed", ...data }).select().single();
    if (error) throw error;
    return row;
  },

  async setBookingStatus(id, status) {
    const { data, error } = await supabase.from("bookings").update({ status })
      .eq("id", id).eq("shop_id", shopId()).select().single();
    if (error) throw error;
    return data;
  },

  async rescheduleBooking(id, start, end) {
    const { data, error } = await supabase.from("bookings").update({ start_time: start, end_time: end })
      .eq("id", id).eq("shop_id", shopId()).select().single();
    if (error) throw error;
    return data;
  },

  /* ---------- Conversations ---------- */
  async conversations() {
    const { data, error } = await supabase.from("conversations").select("*")
      .eq("shop_id", shopId()).order("last_message_at", { ascending: false }).limit(200);
    if (error) throw error;
    return data || [];
  },

  async messages(convId) {
    const { data, error } = await supabase.from("messages")
      .select("*").eq("conversation_id", convId).order("created_at", { ascending: true }).limit(300);
    if (error) throw error;
    return data || [];
  },

  async markConversationRead(convId) {
    const { error } = await supabase.from("conversations").update({ owner_unread: 0 })
      .eq("id", convId).eq("shop_id", shopId());
    if (error) throw error;
  },

  async setConversationStatus(convId, status) {
    const { data, error } = await supabase.from("conversations").update({ status })
      .eq("id", convId).eq("shop_id", shopId()).select().single();
    if (error) throw error;
    return data;
  },

  /* Owner reply → edge function (stores + sends via WhatsApp when enabled) */
  async sendOwnerMessage(convId, content) {
    return fn("send-message", { conversation_id: convId, content });
  },

  /* ---------- Notifications ---------- */
  async notifications(limit = 50) {
    const { data, error } = await supabase.from("notifications").select("*")
      .eq("shop_id", shopId()).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },

  async markNotificationRead(id, read = true) {
    const { error } = await supabase.from("notifications").update({ read })
      .eq("id", id).eq("shop_id", shopId());
    if (error) throw error;
  },

  async markAllNotificationsRead() {
    const { error } = await supabase.from("notifications").update({ read: true })
      .eq("shop_id", shopId()).eq("read", false);
    if (error) throw error;
  },

  /* ---------- Settings ---------- */
  async settings() {
    const { data, error } = await supabase.from("settings")
      .select("*").eq("shop_id", shopId()).maybeSingle();
    if (error) throw error;
    return data;
  },

  async saveSettings(patch) {
    const { data, error } = await supabase.from("settings").update(patch)
      .eq("shop_id", shopId()).select().single();
    if (error) throw error;
    return data;
  },

  async saveShop(patch) {
    const { data, error } = await supabase.from("shops").update(patch)
      .eq("id", shopId()).select().single();
    if (error) throw error;
    return data;
  },

  /* ---------- AI + insights ---------- */
  async aiLogs(limit = 50) {
    const { data, error } = await supabase.from("ai_logs").select("*")
      .eq("shop_id", shopId()).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },

  async insights(limit = 1) {
    const { data, error } = await supabase.from("insights").select("*")
      .eq("shop_id", shopId()).order("period", { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },

  async aiChat(message) {
    return fn("ai-chat-handler", {
      shop_id: shopId(), message, sender: "owner", persist: false,
    });
  },

  async businessSummary() {
    return fn("business-summary", { shop_id: shopId() });
  },

  /* ---------- Marketing ---------- */
  async drafts() {
    const { data, error } = await supabase.from("marketing_drafts").select("*")
      .eq("shop_id", shopId()).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return data || [];
  },

  async setDraftStatus(id, status) {
    const { data, error } = await supabase.from("marketing_drafts").update({ status })
      .eq("id", id).eq("shop_id", shopId()).select().single();
    if (error) throw error;
    return data;
  },

  async updateDraft(id, patch) {
    const { data, error } = await supabase.from("marketing_drafts").update(patch)
      .eq("id", id).eq("shop_id", shopId()).select().single();
    if (error) throw error;
    return data;
  },

  async generateDraft(channel = "wa") {
    return fn("generate-post", { shop_id: shopId(), channel });
  },

  /* ---------- Cash Flow & Payment Reminders ---------- */
  async cashFlowForecast(days = 30) {
    return fn("cash-flow-forecast", { shop_id: shopId(), days });
  },

  async paymentReminders(opts = {}) {
    let q = supabase.from("payment_reminders").select("*")
      .eq("shop_id", shopId()).order("due_date", { ascending: true });
    if (opts.status) q = q.eq("status", opts.status);
    if (opts.type) q = q.eq("type", opts.type);
    const { data, error } = await q.limit(100);
    if (error) throw error;
    return data || [];
  },

  async createPaymentReminder(data) {
    const { data: row, error } = await supabase.from("payment_reminders")
      .insert({ shop_id: shopId(), ...data }).select().single();
    if (error) throw error;
    return row;
  },

  async updatePaymentReminder(id, patch) {
    const { data, error } = await supabase.from("payment_reminders").update(patch)
      .eq("id", id).eq("shop_id", shopId()).select().single();
    if (error) throw error;
    return data;
  },

  async deletePaymentReminder(id) {
    const { error } = await supabase.from("payment_reminders").delete()
      .eq("id", id).eq("shop_id", shopId());
    if (error) throw error;
  },

  async updateOrderPayment(orderId, paymentStatus, amountPaid, paymentMethod) {
    const patch = { payment_status: paymentStatus };
    if (amountPaid !== undefined) patch.amount_paid = amountPaid;
    if (paymentMethod) patch.payment_method = paymentMethod;
    const { data, error } = await supabase.from("orders").update(patch)
      .eq("id", orderId).eq("shop_id", shopId()).select().single();
    if (error) throw error;
    return data;
  },

  async cashFlowEntries(opts = {}) {
    let q = supabase.from("cash_flow_entries").select("*")
      .eq("shop_id", shopId()).order("next_date", { ascending: true });
    if (opts.active !== undefined) q = q.eq("active", opts.active);
    if (opts.type) q = q.eq("type", opts.type);
    const { data, error } = await q.limit(100);
    if (error) throw error;
    return data || [];
  },

  async createCashFlowEntry(data) {
    const { data: row, error } = await supabase.from("cash_flow_entries")
      .insert({ shop_id: shopId(), ...data }).select().single();
    if (error) throw error;
    return row;
  },

  async updateCashFlowEntry(id, patch) {
    const { data, error } = await supabase.from("cash_flow_entries").update(patch)
      .eq("id", id).eq("shop_id", shopId()).select().single();
    if (error) throw error;
    return data;
  },

  async deleteCashFlowEntry(id) {
    const { error } = await supabase.from("cash_flow_entries").delete()
      .eq("id", id).eq("shop_id", shopId());
    if (error) throw error;
  },
};
