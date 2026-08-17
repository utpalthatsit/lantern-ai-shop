// ============================================================
// web-chat — the public storefront + customer chat.
// No owner JWT required (customers aren't signed in). The shop
// is identified by shop_id; messages flow through the SAME
// trusted ai-chat-handler path as the WhatsApp webhook, so the
// AI uses real shop data and tools. Rate-limited per phone/IP.
// ============================================================
import { handleOptions, json } from "../_shared/cors.ts";
import { isUuid, adminClient } from "../_shared/shopAuth.ts";

// Light in-memory rate limit (per instance): 25 msgs / 60s per phone.
const rateBuckets = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (rateBuckets.get(key) || []).filter((t) => now - t < 60000);
  if (arr.length >= 25) { rateBuckets.set(key, arr); return true; }
  arr.push(now);
  rateBuckets.set(key, arr);
  return false;
}

Deno.serve(async (req) => {
  const opts = handleOptions(req);
  if (opts) return opts;

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => null);
    const shopId = String(body?.shop_id || "");
    if (!isUuid(shopId)) return json({ error: "Valid shop_id is required" }, 400);

    const supabase = adminClient();
    const { data: shop } = await supabase.from("shops").select("*").eq("id", shopId).maybeSingle();
    if (!shop) return json({ error: "Shop not found" }, 404);

    const message = String(body?.message || "").trim().slice(0, 4000);
    const action = String(body?.action || "");

    // ---- Storefront request: shop info + active products (no message, no action) ----
    if (!message && !action) {
      const { data: products } = await supabase.from("products")
        .select("id, name, description, category, price, discount, stock, image_url")
        .eq("shop_id", shopId).eq("active", true).order("name", { ascending: true });
      return json({
        shop: {
          id: shop.id, name: shop.name, category: shop.category,
          address: shop.address, phone: shop.phone, tagline: shop.tagline || "",
          whatsapp_number: shop.whatsapp_number || "",
          hours: (shop.hours && shop.hours.note) || "",
        },
        products: products || [],
      });
    }

    // ---- Storefront actions: lookup / reviews / rate / sync (no AI round) ----
    if (action === "lookup") {
      const phone = String(body?.phone || "").trim();
      if (!/^\+?[0-9]{6,15}$/.test(phone.replace(/[\s-]/g, ""))) {
        return json({ error: "Enter a valid phone number" }, 400);
      }
      const { data: customer } = await supabase.from("customers")
        .select("id, name, phone").eq("shop_id", shop.id).eq("phone", phone).maybeSingle();
      const { data: orders } = await supabase.from("orders")
        .select("id, customer_name, status, total, created_at")
        .eq("shop_id", shop.id).eq("customer_phone", phone)
        .order("created_at", { ascending: false }).limit(20);
      const { data: ratings } = await supabase.from("ratings")
        .select("id, order_id, rating, comment, created_at")
        .eq("shop_id", shop.id).eq("customer_phone", phone)
        .order("created_at", { ascending: false }).limit(10);
      return json({ customer, orders: orders || [], ratings: ratings || [] });
    }

    if (action === "reviews") {
      const { data: list } = await supabase.from("ratings")
        .select("customer_name, rating, comment, created_at")
        .eq("shop_id", shop.id).order("created_at", { ascending: false }).limit(8);
      const all = list || [];
      const average = all.length
        ? Math.round((all.reduce((s, r) => s + r.rating, 0) / all.length) * 10) / 10
        : 0;
      return json({ average, count: all.length, reviews: all });
    }

    if (action === "rate") {
      const phone = String(body?.phone || "").trim();
      const orderId = String(body?.order_id || "");
      const rating = Number(body?.rating);
      const comment = String(body?.comment || "").trim().slice(0, 500);
      const name = String(body?.customer_name || "").trim();
      if (!phone) return json({ error: "Phone is required to rate" }, 400);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return json({ error: "Rating must be between 1 and 5 stars" }, 400);
      }
      if (!isUuid(orderId)) return json({ error: "Invalid order" }, 400);
      const { data: order } = await supabase.from("orders")
        .select("id, customer_name").eq("id", orderId).eq("shop_id", shop.id)
        .eq("customer_phone", phone).maybeSingle();
      if (!order) return json({ error: "Order not found for this phone" }, 404);
      const { error } = await supabase.from("ratings").upsert({
        shop_id: shop.id, order_id: order.id, customer_phone: phone,
        customer_name: name || order.customer_name || null,
        rating, comment: comment || null,
      }, { onConflict: "order_id, customer_phone" });
      if (error) {
        console.error("[web-chat] rate upsert", error.message);
        return json({ error: "Could not save rating" }, 500);
      }
      return json({ ok: true, rated: rating });
    }

    if (action === "sync") {
      const phone = String(body?.phone || "").trim();
      const conversationId = String(body?.conversation_id || "");
      let convId = isUuid(conversationId) ? conversationId : null;
      if (!convId && phone) {
        const { data: conv } = await supabase.from("conversations")
          .select("id").eq("shop_id", shop.id).eq("customer_phone", phone).maybeSingle();
        convId = conv?.id || null;
      }
      if (!convId) return json({ conversation_id: null, status: null, messages: [] });
      const { data: conv } = await supabase.from("conversations")
        .select("status").eq("id", convId).eq("shop_id", shop.id).maybeSingle();
      if (!conv) return json({ conversation_id: null, status: null, messages: [] });
      let q = supabase.from("messages").select("id, sender, content, created_at")
        .eq("conversation_id", convId).order("created_at", { ascending: true });
      const after = String(body?.after || "");
      if (after) q = q.gt("created_at", after);
      const { data: msgs } = await q;
      return json({ conversation_id: convId, status: conv.status, messages: msgs || [] });
    }

    // ---- Chat request ----
    const phone = String(body?.phone || "").trim();
    const name = String(body?.customer_name || "").trim();
    const clientKey = phone || (req.headers.get("x-forwarded-for") || "anon");
    if (rateLimited(clientKey)) {
      return json({ reply: "You're messaging too quickly — please give me a moment and try again. 🙂" });
    }

    const customerKey = phone || `web-${Math.random().toString(36).slice(2, 10)}`;
    const displayName = name || phone || customerKey;

    // Find or create the customer (by phone when available).
    let { data: customer } = await supabase.from("customers")
      .select("id").eq("shop_id", shop.id).eq("phone", customerKey).maybeSingle();
    if (!customer) {
      ({ data: customer } = await supabase.from("customers")
        .insert({ shop_id: shop.id, name: displayName, phone: phone || null })
        .select("id").single());
    }

    // Find or create the conversation for this customer.
    let { data: conv } = await supabase.from("conversations")
      .select("id").eq("shop_id", shop.id).eq("customer_phone", customerKey).maybeSingle();
    if (!conv) {
      ({ data: conv } = await supabase.from("conversations")
        .insert({
          shop_id: shop.id, customer_id: customer?.id || null,
          customer_name: displayName, customer_phone: customerKey, status: "open",
        })
        .select("id").single());
    }

    // Ask the AI (service-role → trusted). The handler persists the exchange.
    const ai = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-chat-handler`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shop_id: shop.id,
        conversation_id: conv?.id || null,
        message,
        sender: "customer",
        persist: true,
      }),
    });
    const aiBody = await ai.json().catch(() => ({}));
    if (!ai.ok) console.error("[web-chat] ai-chat-handler", ai.status, JSON.stringify(aiBody).slice(0, 200));

    return json({
      reply: aiBody.reply || "",
      escalated: !!aiBody.escalated,
      conversation_id: conv?.id || null,
      customer_phone: customerKey,
    });
  } catch (e: any) {
    console.error("[web-chat]", e?.message || e);
    return json({ error: "Internal error" }, 500);
  }
});
