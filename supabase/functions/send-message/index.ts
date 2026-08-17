// ============================================================
// send-message — the owner replies to a customer.
// Called from the owner console with the user's JWT.
// Stores the message in the DB, then delivers it over WhatsApp
// using the SHOP's own credentials (wa_token / wa_phone_number_id
// from settings, with platform-level env fallback). Reports
// delivery honestly.
// ============================================================
import { handleOptions, json } from "../_shared/cors.ts";
import { authedUserId, canAccessShop, isUuid, adminClient } from "../_shared/shopAuth.ts";

const WA_GRAPH = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  const opts = handleOptions(req);
  if (opts) return opts;

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const userId = await authedUserId(req);
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const conversationId = String(body?.conversation_id || "");
    const content = String(body?.content || "").trim().slice(0, 4000);
    if (!isUuid(conversationId)) return json({ error: "Valid conversation_id required" }, 400);
    if (!content) return json({ error: "Message cannot be empty" }, 400);

    const supabase = adminClient();
    const { data: conv } = await supabase.from("conversations")
      .select("id, shop_id, customer_phone").eq("id", conversationId).maybeSingle();
    if (!conv) return json({ error: "Conversation not found" }, 404);
    if (!(await canAccessShop(conv.shop_id, userId))) return json({ error: "Forbidden" }, 403);

    // Persist first — the message exists even if delivery fails.
    const { error: insertErr } = await supabase.from("messages").insert({
      conversation_id: conv.id, sender: "owner", content,
    });
    if (insertErr) return json({ error: "Could not save the message" }, 500);

    const { data: settings } = await supabase.from("settings")
      .select("whatsapp_enabled, wa_token, wa_phone_number_id").eq("shop_id", conv.shop_id).maybeSingle();
    const { data: shop } = await supabase.from("shops").select("whatsapp_number").eq("id", conv.shop_id).single();

    // Per-shop credentials with platform-level fallback.
    const token = settings?.wa_token || Deno.env.get("WHATSAPP_TOKEN") || "";
    const phoneNumberId = settings?.wa_phone_number_id || Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";

    let delivered = false;
    let deliveryError: string | null = null;
    if (settings?.whatsapp_enabled && token && phoneNumberId && conv.customer_phone) {
      const res = await fetch(`${WA_GRAPH}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: conv.customer_phone,
          type: "text",
          text: { body: content.slice(0, 4000) },
        }),
      });
      if (res.ok) delivered = true;
      else deliveryError = `WhatsApp returned ${res.status}`;
    } else if (!settings?.whatsapp_enabled) {
      deliveryError = "WhatsApp delivery is disabled for this shop.";
    } else if (!token || !phoneNumberId) {
      deliveryError = "WhatsApp is not configured — add your credentials in Settings → WhatsApp delivery.";
    } else if (!conv.customer_phone) {
      deliveryError = "This customer has no phone number — reply appears in their web chat.";
    }

    return json({ ok: true, delivered, delivery_error: deliveryError, shop_whatsapp_number: shop?.whatsapp_number || null });
  } catch (e: any) {
    console.error("[send-message]", e?.message || e);
    return json({ error: "Internal error" }, 500);
  }
});
