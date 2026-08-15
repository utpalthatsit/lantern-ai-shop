// ============================================================
// ai-chat-handler — ShopSathi's controlled AI brain.
// The AI can only act through a fixed set of server-side tools
// (search_products, check_inventory, create_booking, create_order,
// get_customer, ...). It can never run raw SQL. Every tool call is
// validated and executed with the service-role client, scoped to
// the requesting shop. Nothing about another shop is ever loaded.
// Provider: Google Gemini (free tier) or Anthropic Claude — see
// ../_shared/ai.ts; set GEMINI_API_KEY or ANTHROPIC_API_KEY.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleOptions, json, corsHeaders } from "../_shared/cors.ts";
import { authedUserId, canAccessShop, isUuid, adminClient } from "../_shared/shopAuth.ts";
import { pickAIProvider, requestModel, pushAssistantTurn, pushToolResults, modelName } from "../_shared/ai.ts";

const MAX_TOOL_ROUNDS = 5;

// ------------------------------------------------------------
// Tool metadata (what Claude is allowed to do)
// ------------------------------------------------------------
const TOOLS: { name: string; description: string; input_schema: Record<string, unknown> }[] = [
  {
    name: "search_products",
    description: "Search the shop's products by name keyword or category. Returns id, name, category, price, discount, stock and whether it is active.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional keyword to match against product names" },
        category: { type: "string", description: "Optional category to filter by" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_product",
    description: "Get full details of one product by id or exact name.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "string" },
        name: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "check_inventory",
    description: "Check the current stock level of a product by id or name. Returns stock, threshold and availability (in_stock / low / out).",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "string" },
        name: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_business_info",
    description: "Get the shop's public information: name, tagline, category, address, phone, opening hours, currency and language.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_customer",
    description: "Look up a customer by phone number. Returns their profile plus their past orders and bookings.",
    input_schema: {
      type: "object",
      properties: { phone: { type: "string" } },
      required: ["phone"],
      additionalProperties: false,
    },
  },
  {
    name: "update_customer",
    description: "Update a customer's name, email, address or notes, looked up by phone number.",
    input_schema: {
      type: "object",
      properties: {
        phone: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        address: { type: "string" },
        notes: { type: "string" },
      },
      required: ["phone"],
      additionalProperties: false,
    },
  },
  {
    name: "create_booking",
    description: "Create a booking/appointment. Provide customer phone, service, and start_time (ISO 8601). end_time and staff are optional. Refuses double-bookings.",
    input_schema: {
      type: "object",
      properties: {
        customer_name: { type: "string" },
        customer_phone: { type: "string" },
        service: { type: "string" },
        start_time: { type: "string", description: "ISO 8601 timestamp, e.g. 2026-08-16T17:00:00+05:30" },
        end_time: { type: "string" },
        staff: { type: "string" },
        notes: { type: "string" },
      },
      required: ["customer_phone", "service", "start_time"],
      additionalProperties: false,
    },
  },
  {
    name: "reschedule_booking",
    description: "Move an existing booking to a new start_time (ISO 8601). Checks for conflicts first.",
    input_schema: {
      type: "object",
      properties: {
        booking_id: { type: "string" },
        start_time: { type: "string" },
      },
      required: ["booking_id", "start_time"],
      additionalProperties: false,
    },
  },
  {
    name: "cancel_booking",
    description: "Cancel an existing booking by id.",
    input_schema: {
      type: "object",
      properties: { booking_id: { type: "string" } },
      required: ["booking_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_booking",
    description: "Get bookings for the requesting customer by phone, or a single booking by id.",
    input_schema: {
      type: "object",
      properties: {
        booking_id: { type: "string" },
        customer_phone: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "create_order",
    description: "Create an order with one or more items. Each item needs a product name and quantity. Validates availability and computes the total.",
    input_schema: {
      type: "object",
      properties: {
        customer_name: { type: "string" },
        customer_phone: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Exact product name" },
              quantity: { type: "integer", minimum: 1 },
            },
            required: ["name", "quantity"],
          },
        },
        notes: { type: "string" },
      },
      required: ["customer_name", "items"],
      additionalProperties: false,
    },
  },
  {
    name: "get_orders",
    description: "Get orders for the requesting customer by phone. Never look up another customer's orders.",
    input_schema: {
      type: "object",
      properties: { customer_phone: { type: "string" } },
      required: ["customer_phone"],
      additionalProperties: false,
    },
  },
  {
    name: "escalate_to_owner",
    description: "Call this when the request needs human judgement: refunds, complaints, unusual discounts, anything you are not sure about. Do not guess.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

// ------------------------------------------------------------
// Tool execution context
// ------------------------------------------------------------
interface Ctx {
  shopId: string;
  supabase: ReturnType<typeof adminClient>;
  currency: string;
}

const ok = (data: unknown) => JSON.stringify({ ok: true, data });
const fail = (error: string) => JSON.stringify({ ok: false, error });

function money(n: number | string, currency: string): string {
  const num = Number(n) || 0;
  return currency === "INR" ? "₹" + num.toLocaleString("en-IN") : `${currency} ${num}`;
}

async function findCustomer(supabase: ReturnType<typeof adminClient>, shopId: string, phone: string) {
  const { data } = await supabase.from("customers").select("*").eq("shop_id", shopId).eq("phone", phone).maybeSingle();
  return data || null;
}

async function ensureCustomer(
  supabase: ReturnType<typeof adminClient>, shopId: string, phone: string, name?: string,
) {
  const existing = await findCustomer(supabase, shopId, phone);
  if (existing) {
    if (name && name.trim() && existing.name !== name.trim()) {
      await supabase.from("customers").update({ name: name.trim() }).eq("id", existing.id);
      return { ...existing, name: name.trim() };
    }
    return existing;
  }
  const { data, error } = await supabase.from("customers").insert({
    shop_id: shopId, name: name?.trim() || phone || "Customer", phone: phone || null,
  }).select().single();
  if (error) return null;
  return data;
}

// ------------------------------------------------------------
// Tool implementations — all scoped to shopId, validated input
// ------------------------------------------------------------
const TOOL_IMPLS: Record<string, (ctx: Ctx, args: any) => Promise<string>> = {
  async search_products(ctx, args) {
    let q = ctx.supabase.from("products").select("id, name, category, price, discount, stock, active")
      .eq("shop_id", ctx.shopId).eq("active", true);
    if (args?.category) q = q.eq("category", args.category);
    if (args?.query) q = q.ilike("name", `%${String(args.query).slice(0, 80)}%`);
    const { data, error } = await q.order("name", { ascending: true }).limit(50);
    if (error) return fail("Database error while searching products.");
    return ok(data);
  },

  async get_product(ctx, args) {
    const id = args?.product_id, name = args?.name;
    if (!id && !name) return fail("Provide product_id or name.");
    let q = ctx.supabase.from("products").select("*").eq("shop_id", ctx.shopId);
    if (id) q = q.eq("id", id); else q = q.ilike("name", String(name).trim());
    const { data, error } = await q.limit(1).maybeSingle();
    if (error || !data) return fail("Product not found.");
    return ok({ id: data.id, name: data.name, category: data.category, price: data.price, discount: data.discount, stock: data.stock, description: data.description, active: data.active });
  },

  async check_inventory(ctx, args) {
    const id = args?.product_id, name = args?.name;
    if (!id && !name) return fail("Provide product_id or name.");
    let q = ctx.supabase.from("products").select("id, name, stock, low_stock_threshold").eq("shop_id", ctx.shopId);
    if (id) q = q.eq("id", id); else q = q.ilike("name", String(name).trim());
    const { data, error } = await q.limit(1).maybeSingle();
    if (error || !data) return fail("Product not found.");
    const availability = data.stock <= 0 ? "out" : data.stock <= data.low_stock_threshold ? "low" : "in_stock";
    return ok({ id: data.id, name: data.name, stock: data.stock, threshold: data.low_stock_threshold, availability });
  },

  async get_business_info(ctx) {
    const { data: shop } = await ctx.supabase.from("shops").select("*").eq("id", ctx.shopId).single();
    if (!shop) return fail("Shop not found.");
    return ok({
      name: shop.name, tagline: shop.tagline, category: shop.category, address: shop.address,
      phone: shop.phone, hours: shop.hours || {}, currency: shop.currency || "INR", language: shop.language || "en",
    });
  },

  async get_customer(ctx, args) {
    const phone = String(args?.phone || "").trim();
    if (!/^\+?[0-9]{6,15}$/.test(phone.replace(/[\s-]/g, ""))) return fail("Invalid phone number.");
    const customer = await findCustomer(ctx.supabase, ctx.shopId, phone);
    if (!customer) return ok({ customer: null, note: "No customer with this phone yet." });
    const [orders, bookings] = await Promise.all([
      ctx.supabase.from("orders").select("id, customer_name, status, total, created_at").eq("shop_id", ctx.shopId).eq("customer_phone", phone).order("created_at", { ascending: false }).limit(20),
      ctx.supabase.from("bookings").select("id, service, staff, start_time, end_time, status").eq("shop_id", ctx.shopId).eq("customer_phone", phone).order("start_time", { ascending: false }).limit(20),
    ]);
    return ok({ customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email }, orders: orders.data || [], bookings: bookings.data || [] });
  },

  async update_customer(ctx, args) {
    const phone = String(args?.phone || "").trim();
    if (!phone) return fail("Phone is required.");
    const customer = await findCustomer(ctx.supabase, ctx.shopId, phone);
    if (!customer) return fail("Customer not found.");
    const patch: Record<string, string> = {};
    if (args?.name !== undefined) patch.name = String(args.name).trim();
    if (args?.email !== undefined) patch.email = String(args.email).trim() || null;
    if (args?.address !== undefined) patch.address = String(args.address).trim() || null;
    if (args?.notes !== undefined) patch.notes = String(args.notes).trim() || null;
    if (!patch.name) return fail("Name cannot be empty.");
    const { error } = await ctx.supabase.from("customers").update(patch).eq("id", customer.id);
    if (error) return fail("Could not update the customer.");
    return ok({ id: customer.id, ...patch });
  },

  async create_booking(ctx, args) {
    const phone = String(args?.customer_phone || "").trim();
    const service = String(args?.service || "").trim();
    const startRaw = String(args?.start_time || "");
    if (!/^\+?[0-9]{6,15}$/.test(phone.replace(/[\s-]/g, ""))) return fail("A valid customer phone is required.");
    if (!service) return fail("Service is required.");
    const start = new Date(startRaw);
    if (isNaN(start.getTime())) return fail("start_time must be a valid ISO 8601 timestamp.");
    if (start.getTime() < Date.now() - 5 * 60000) return fail("Booking time is in the past.");
    const end = args?.end_time ? new Date(String(args.end_time)) : new Date(start.getTime() + 30 * 60000);
    if (isNaN(end.getTime()) || end.getTime() <= start.getTime()) return fail("end_time must be after start_time.");
    const staff = String(args?.staff || "").trim() || null;

    // Conflict check: same staff overlapping, or any overlap when no staff given.
    let conflictQ = ctx.supabase.from("bookings")
      .select("id, service, start_time, end_time, staff")
      .eq("shop_id", ctx.shopId).in("status", ["pending", "confirmed"])
      .lt("start_time", end.toISOString()).gt("end_time", start.toISOString());
    if (staff) conflictQ = conflictQ.eq("staff", staff);
    const { data: conflicts } = await conflictQ.limit(5);
    if (conflicts && conflicts.length > 0) {
      const c = conflicts[0];
      return fail(`That slot is already booked (${c.service} ${c.start_time}). Suggest the customer an alternative time.`);
    }

    const customer = await ensureCustomer(ctx.supabase, ctx.shopId, phone, args?.customer_name);
    const { data, error } = await ctx.supabase.from("bookings").insert({
      shop_id: ctx.shopId,
      customer_id: customer?.id || null,
      customer_name: args?.customer_name?.trim() || customer?.name || phone,
      customer_phone: phone,
      service, staff, notes: String(args?.notes || "").trim() || null,
      start_time: start.toISOString(), end_time: end.toISOString(), status: "confirmed",
    }).select().single();
    if (error) return fail("Could not save the booking: " + error.message);
    return ok({ id: data.id, service, customer_name: data.customer_name, customer_phone: phone, start_time: data.start_time, end_time: data.end_time, staff, status: data.status });
  },

  async reschedule_booking(ctx, args) {
    const id = String(args?.booking_id || "");
    const startRaw = String(args?.start_time || "");
    if (!isUuid(id)) return fail("Valid booking_id required.");
    const start = new Date(startRaw);
    if (isNaN(start.getTime())) return fail("start_time must be a valid ISO 8601 timestamp.");
    const { data: booking } = await ctx.supabase.from("bookings").select("*").eq("id", id).eq("shop_id", ctx.shopId).single();
    if (!booking) return fail("Booking not found.");
    if (!["pending", "confirmed"].includes(booking.status)) return fail("Only pending or confirmed bookings can be rescheduled.");
    const end = new Date(start.getTime() + (new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime()));
    let q = ctx.supabase.from("bookings").select("id").eq("shop_id", ctx.shopId).in("status", ["pending", "confirmed"])
      .lt("start_time", end.toISOString()).gt("end_time", start.toISOString()).neq("id", id);
    if (booking.staff) q = q.eq("staff", booking.staff);
    const { data: conflicts } = await q.limit(1);
    if (conflicts && conflicts.length > 0) return fail("That new time clashes with an existing booking. Offer alternatives.");
    const { data, error } = await ctx.supabase.from("bookings").update({ start_time: start.toISOString(), end_time: end.toISOString() }).eq("id", id).select().single();
    if (error) return fail("Could not reschedule: " + error.message);
    return ok({ id: data.id, service: data.service, start_time: data.start_time, end_time: data.end_time });
  },

  async cancel_booking(ctx, args) {
    const id = String(args?.booking_id || "");
    if (!isUuid(id)) return fail("Valid booking_id required.");
    const { data, error } = await ctx.supabase.from("bookings").update({ status: "cancelled" }).eq("id", id).eq("shop_id", ctx.shopId).select().single();
    if (error || !data) return fail("Booking not found.");
    return ok({ id: data.id, service: data.service, status: "cancelled" });
  },

  async get_booking(ctx, args) {
    if (args?.booking_id) {
      if (!isUuid(String(args.booking_id))) return fail("Valid booking_id required.");
      const { data } = await ctx.supabase.from("bookings").select("*").eq("id", args.booking_id).eq("shop_id", ctx.shopId).maybeSingle();
      return data ? ok(data) : fail("Booking not found.");
    }
    const phone = String(args?.customer_phone || "").trim();
    if (!phone) return fail("Provide booking_id or customer_phone.");
    const { data } = await ctx.supabase.from("bookings").select("id, service, staff, start_time, end_time, status, notes")
      .eq("shop_id", ctx.shopId).eq("customer_phone", phone).order("start_time", { ascending: false }).limit(10);
    return ok(data || []);
  },

  async create_order(ctx, args) {
    const name = String(args?.customer_name || "").trim();
    const phone = String(args?.customer_phone || "").trim();
    const items = Array.isArray(args?.items) ? args.items : [];
    if (!name) return fail("Customer name is required.");
    if (!items.length) return fail("Order needs at least one item.");
    if (items.length > 25) return fail("Too many items (max 25).");

    const resolved: { product_id: string | null; name: string; price: number; quantity: number }[] = [];
    for (const it of items) {
      const pname = String(it?.name || "").trim();
      const qty = Number(it?.quantity);
      if (!pname || !Number.isInteger(qty) || qty < 1 || qty > 999) return fail(`Invalid item: ${pname || "?"} (quantity must be a positive whole number).`);
      const { data: product } = await ctx.supabase.from("products")
        .select("id, name, price, discount, stock, active").eq("shop_id", ctx.shopId).ilike("name", pname).limit(1).maybeSingle();
      if (!product || !product.active) return fail(`Product "${pname}" is not available.`);
      if (product.stock < qty) return fail(`Only ${product.stock} of "${product.name}" left — ask the customer to reduce the quantity or pick another item.`);
      const unit = Number(product.price) * (1 - (Number(product.discount) || 0) / 100);
      resolved.push({ product_id: product.id, name: product.name, price: Math.round(unit * 100) / 100, quantity: qty });
    }

    const customer = phone ? await ensureCustomer(ctx.supabase, ctx.shopId, phone, name) : null;
    const total = Math.round(resolved.reduce((s, r) => s + r.price * r.quantity, 0) * 100) / 100;
    const { data: order, error } = await ctx.supabase.from("orders").insert({
      shop_id: ctx.shopId, customer_id: customer?.id || null,
      customer_name: name, customer_phone: phone || null,
      status: "pending", total, notes: String(args?.notes || "").trim() || null,
    }).select().single();
    if (error) return fail("Could not save the order: " + error.message);
    const { error: itemsErr } = await ctx.supabase.from("order_items").insert(
      resolved.map((r) => ({ order_id: order.id, product_id: r.product_id, name: r.name, price: r.price, quantity: r.quantity })),
    );
    if (itemsErr) return fail("Could not save order items: " + itemsErr.message);
    return ok({ id: order.id, customer_name: name, status: "pending", total: money(total, ctx.currency), items: resolved.map((r) => ({ name: r.name, quantity: r.quantity, line_total: money(r.price * r.quantity, ctx.currency) })) });
  },

  async get_orders(ctx, args) {
    const phone = String(args?.customer_phone || "").trim();
    if (!phone) return fail("customer_phone is required — only the requesting customer's orders can be viewed.");
    const { data } = await ctx.supabase.from("orders")
      .select("id, customer_name, status, total, notes, created_at, order_items(name, price, quantity)")
   
      .eq("shop_id", ctx.shopId).eq("customer_phone", phone).order("created_at", { ascending: false }).limit(10);
    return ok(data || []);
  },

  async escalate_to_owner(ctx, args) {
    return ok({ escalated: true, reason: String(args?.reason || "").slice(0, 300) });
  },
};

// ------------------------------------------------------------
// Claude tool loop
// ------------------------------------------------------------
interface Turn {
  role: "user" | "assistant";
  content: any;
}

async function runClaude(
  system: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<{ reply: string; escalated: boolean; toolsUsed: string[] }> {
  const provider = pickAIProvider();
  if (!provider) {
    return { reply: "", escalated: true, toolsUsed: [] };
  }

  const messages: any[] = history.map((h) => ({ role: h.role, content: h.content }));
  const toolsUsed: string[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const reply = await requestModel(provider, system, messages, TOOLS, 1024);
    if (!reply.toolCalls.length) {
      return { reply: (reply.text || "").trim(), escalated: false, toolsUsed };
    }

    // Execute every requested tool (validated server-side), then loop back.
    pushAssistantTurn(messages, provider, reply);
    const toolResults: { toolCallId: string; content: string }[] = [];
    for (const tc of reply.toolCalls) {
      toolsUsed.push(tc.name);
      const impl = TOOL_IMPLS[tc.name];
      let result: string;
      if (!impl) {
        result = JSON.stringify({ ok: false, error: `Unknown tool ${tc.name}` });
      } else {
        try {
          result = await impl(CURRENT_CTX, JSON.parse(tc.args || "{}"));
        } catch (e: any) {
          result = JSON.stringify({ ok: false, error: `Tool crashed: ${e?.message || e}` });
        }
      }
      toolResults.push({ toolCallId: tc.id, content: result });
    }
    pushToolResults(messages, provider, toolResults);
  }

  return { reply: "I could not finish working that out — let me hand this to the owner.", escalated: true, toolsUsed };
}

// Set per-request so tool implementations can reach the active context.
let CURRENT_CTX: Ctx = { shopId: "", supabase: null as any, currency: "INR" };

function buildSystemPrompt(shop: any, settings: any): string {
  const hours = shop.hours && typeof shop.hours === "object"
    ? JSON.stringify(shop.hours)
    : "not set";
  const lang = settings?.language || shop.language || "en";
  return `You are ShopSathi, the AI assistant working for ${shop.name}${shop.category ? ` (a ${shop.category})` : ""}.

Today is ${new Date().toISOString().slice(0, 10)}.

Public business info:
- Hours: ${hours}
- Address: ${shop.address || "not set"}
- Phone: ${shop.phone || "not set"}
- Currency: ${shop.currency || "INR"}
- Language: ${lang}

Rules:
1. Reply warmly and briefly, in the customer's language. Hinglish is fine.
2. ONLY use your tools to learn real facts. Never invent prices, stock, hours, bookings or orders. If a tool says something, trust it; otherwise say you will check.
3. Never reveal another customer's private data. You may only look up the requesting customer's orders/bookings using their phone number.
4. If a request needs human judgement (refunds, complaints, unusual discounts, anything risky or unknown), call escalate_to_owner instead of guessing.
5. To book: use create_booking. Ask for anything missing (phone, service, time) before creating. Confirm with details after.
6. To order: use create_order with exact product names and quantities. Check availability first.
7. Do not promise WhatsApp payment links, discounts, or anything outside your tools.
8. After creating an order or booking, confirm it in your reply with what, when, and how much (use the currency symbol).`;
}

interface Outcome {
  reply: string;
  escalated: boolean;
  toolsUsed: string[];
}

async function handleMessage(
  ctx: Ctx,
  opts: {
    message: string;
    history: { role: "user" | "assistant"; content: string }[];
    shop: any;
    settings: any;
  },
): Promise<Outcome> {
  const out = await runClaude(buildSystemPrompt(opts.shop, opts.settings), opts.history);
  if (!out.reply && out.escalated) {
    return { reply: "", escalated: true, toolsUsed: out.toolsUsed };
  }
  return out;
}

// ------------------------------------------------------------
// Persistence + escalation + logging
// ------------------------------------------------------------
async function persistExchange(
  supabase: ReturnType<typeof adminClient>,
  shopId: string,
  conversationId: string | null,
  sender: string,
  message: string,
  reply: string,
  escalated: boolean,
  reason: string,
) {
  if (conversationId && message.trim()) {
    await supabase.from("messages").insert({
      conversation_id: conversationId, sender, content: message.trim().slice(0, 4000),
    });
  }
  if (conversationId && reply.trim()) {
    await supabase.from("messages").insert({
      conversation_id: conversationId, sender: "ai", content: reply.trim().slice(0, 4000),
    });
  }
  if (escalated) {
    const conv = conversationId
      ? await supabase.from("conversations").update({ status: "escalated" }).eq("id", conversationId).select("customer_phone").single()
      : { data: null };
    await supabase.from("notifications").insert({
      shop_id: shopId,
      type: "ai_escalation",
      title: "Needs your attention",
      body: reason || (conversationId ? "A customer request needs a human reply." : "The AI asked for the owner's help."),
      data: { conversation_id: conversationId, reason: reason || "", customer_phone: conv?.data?.customer_phone || null },
    });
  }
}

Deno.serve(async (req) => {
  const opts = handleOptions(req);
  if (opts) return opts;

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const userId = await authedUserId(req);
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const shopId = String(body?.shop_id || "");
    if (!isUuid(shopId)) return json({ error: "Valid shop_id is required" }, 400);

    if (!(await canAccessShop(shopId, userId))) {
      return json({ error: "Forbidden" }, 403);
    }

    const message = String(body?.message || "").trim().slice(0, 4000);
    if (!message) return json({ error: "message is required" }, 400);

    const supabase = adminClient();
    const { data: shop } = await supabase.from("shops").select("*").eq("id", shopId).single();
    if (!shop) return json({ error: "Shop not found" }, 404);
    const { data: settings } = await supabase.from("settings").select("*").eq("shop_id", shopId).maybeSingle();

    CURRENT_CTX = { shopId, supabase, currency: shop.currency || settings?.currency || "INR" };

    const conversationId = body?.conversation_id && isUuid(String(body.conversation_id))
      ? String(body.conversation_id) : null;
    const sender = body?.sender === "owner" ? "owner" : "customer";
    const persist = body?.persist !== false;

    let history: { role: "user" | "assistant"; content: string }[] = [];
    let convPhone: string | null = null;
    if (conversationId) {
      const { data: conv } = await supabase.from("conversations")
        .select("*").eq("id", conversationId).eq("shop_id", shopId).maybeSingle();
      if (!conv) return json({ error: "Conversation not found" }, 404);
      convPhone = conv.customer_phone || null;
      const { data: msgs } = await supabase.from("messages")
        .select("sender, content").eq("conversation_id", conversationId)
        .order("created_at", { ascending: true }).limit(30);
      history = (msgs || [])
        .filter((m: any) => ["customer", "ai", "owner"].includes(m.sender))
        .map((m: any) => ({
          role: m.sender === "customer" ? "user" : "assistant",
          content: `${m.sender === "owner" ? "[owner] " : ""}${String(m.content).slice(0, 1000)}`,
        }));
    }
    history.push({ role: "user", content: message });

    // AI auto-reply is disabled for the shop — hand straight to the owner.
    if (settings?.ai_autoreply_enabled === false) {
      if (persist) {
        await persistExchange(supabase, shopId, conversationId, sender, message, "", true,
          "AI auto-reply is turned off for this shop.");
      }
      return json({ reply: "", action: "escalated", conversation_id: conversationId, escalated: true });
    }

    let outcome: Outcome;
    let aiError: string | null = null;
    try {
      outcome = await handleMessage(CURRENT_CTX, { message, history, shop, settings });
    } catch (e: any) {
      outcome = { reply: "", escalated: true, toolsUsed: [] };
      aiError = String(e?.message || e);
      console.error("[ai-chat-handler]", aiError);
    }

    if (!outcome.reply && outcome.escalated) {
      outcome.reply = aiError
        ? `AI is temporarily unavailable (${String(aiError).slice(0, 120)}) — the owner has been notified.`
        : "I couldn't answer that confidently, so the owner has been notified and will reply here shortly. 🙏";
    }

    if (persist) {
      await persistExchange(supabase, shopId, conversationId, sender, message, outcome.reply, outcome.escalated, "");
    }

    await supabase.from("ai_logs").insert({
      shop_id: shopId,
      conversation_id: conversationId,
      model: modelName(),
      action: outcome.escalated ? "escalate" : (outcome.toolsUsed[0] || "none"),
      input_tokens: 0,
      output_tokens: 0,
    });

    return json({
      reply: outcome.reply,
      action: outcome.escalated ? "escalated" : "none",
      escalated: outcome.escalated,
      tools_used: outcome.toolsUsed,
      conversation_id: conversationId,
      customer_phone: convPhone,
    });
  } catch (e: any) {
    console.error("[ai-chat-handler]", e?.message || e);
    return json({ error: "Internal error", reply: "" }, 500);
  }
});
