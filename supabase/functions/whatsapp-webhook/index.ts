// ============================================================
// whatsapp-webhook — ShopSathi's WhatsApp Business Cloud API entry.
// 1. GET  → webhook verification handshake
// 2. POST → HMAC signature check → find shop by WhatsApp number
//    → find/create customer + conversation → delegate to
//    ai-chat-handler (which persists messages + applies tools)
//    → send the reply back through the WhatsApp API.
// Delivery is only reported when the WhatsApp API accepts it.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const WA_GRAPH = "https://graph.facebook.com/v21.0";

async function verifySignature(secret: string, body: string, signature: string): Promise<boolean> {
  try {
    const key = new TextEncoder().encode(secret);
    const msg = new TextEncoder().encode(body);
    const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", k, msg);
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex === (signature || "").replace("sha256=", "");
  } catch {
    return false;
  }
}

async function sendWhatsApp(phoneNumberId: string, to: string, text: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  const token = Deno.env.get("WHATSAPP_TOKEN");
  if (!token || !phoneNumberId) return { ok: false, error: "WHATSAPP_TOKEN not configured" };
  const res = await fetch(`${WA_GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text.slice(0, 4000) },
    }),
  });
  if (!res.ok) return { ok: false, status: res.status, error: (await res.text()).slice(0, 300) };
  return { ok: true, status: res.status };
}

// Light in-memory rate limit (per instance): 25 msgs / 60s per phone.
const rateBuckets = new Map<string, number[]>();
function rateLimited(phone: string): boolean {
  const now = Date.now();
  const arr = (rateBuckets.get(phone) || []).filter((t) => now - t < 60000);
  if (arr.length >= 25) { rateBuckets.set(phone, arr); return true; }
  arr.push(now);
  rateBuckets.set(phone, arr);
  return false;
}

async function handleIncoming(supabase: any, entry: any) {
  const value = entry?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  const metadata = value?.metadata || {};
  const phoneNumberId = metadata.phone_number_id;
  const shopNumber = metadata.display_phone_number;
  const from = msg?.from;

  if (!msg) return; // status update etc. — nothing to do
  if (!from || !shopNumber) return;

  // Find the shop by its WhatsApp number.
  const { data: shop } = await supabase.from("shops")
    .select("*").eq("whatsapp_number", shopNumber).maybeSingle();
  if (!shop) {
    console.error("[webhook] no shop for", shopNumber);
    return;
  }

  if (rateLimited(from)) {
    await sendWhatsApp(phoneNumberId, from, "You're messaging too quickly — please give me a moment and try again. 🙂");
    return;
  }

  // Find or create the customer (by phone) and conversation.
  let { data: customer } = await supabase.from("customers")
    .select("*").eq("shop_id", shop.id).eq("phone", from).maybeSingle();
  if (!customer) {
    ({ data: customer } = await supabase.from("customers")
      .insert({ shop_id: shop.id, name: from, phone: from }).select().single());
  }
  let { data: conv } = await supabase.from("conversations")
    .select("*").eq("shop_id", shop.id).eq("customer_phone", from).maybeSingle();
  if (!conv) {
    ({ data: conv } = await supabase.from("conversations")
      .insert({
        shop_id: shop.id, customer_id: customer?.id || null,
        customer_name: customer?.name || from, customer_phone: from, status: "open",
      }).select().single());
  }

  // Non-text messages get a polite nudge.
  let text = msg?.text?.body;
  if (!text && msg?.type && msg.type !== "text") {
    text = "(customer sent a " + msg.type + " message)";
  }
  if (!text) return;

  // Ask the AI (service-role → trusted). The handler persists messages + applies tools.
  const ai = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-chat-handler`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      shop_id: shop.id,
      conversation_id: conv.id,
      message: text,
      sender: "customer",
      persist: true,
    }),
  });
  const aiBody = await ai.json().catch(() => ({}));

  let reply = aiBody.reply || "";
  let delivered = false;
  if (reply) {
    const res = await sendWhatsApp(phoneNumberId, from, reply);
    delivered = res.ok;
    if (!res.ok) {
      console.error("[webhook] WhatsApp send failed", res.status, res.error);
      // Store a system note so the owner can see delivery failed — never fake it.
      await supabase.from("messages").insert({
        conversation_id: conv.id, sender: "system",
        content: `⚠️ WhatsApp reply could not be delivered (${res.status || res.error}). Please reply to this customer manually.`,
      });
    }
  }
  console.log(`[webhook] ${shop.name} <- ${from}: delivered=${delivered} escalated=${!!aiBody.escalated}`);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Verification handshake.
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === Deno.env.get("WHATSAPP_VERIFY_TOKEN")) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    const raw = await req.text();
    const ok = await verifySignature(Deno.env.get("WHATSAPP_APP_SECRET") || "", raw, req.headers.get("x-hub-signature-256") || "");
    if (!ok) return new Response("Bad signature", { status: 401 });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = JSON.parse(raw);

    for (const entry of body.entry || []) {
      try {
        await handleIncoming(supabase, entry);
      } catch (e: any) {
        console.error("[webhook] handler error", e?.message || e);
      }
    }
    // WhatsApp expects a fast 200 — always ack after processing.
    return new Response("OK", { status: 200 });
  }

  return new Response("Method not allowed", { status: 405 });
});
