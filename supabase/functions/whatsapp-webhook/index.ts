// ============================================================
// whatsapp-webhook — entry point for WhatsApp Cloud API.
// 1. Verify webhook (GET) & signature (POST)
// 2. Find the shop by the recipient phone number
// 3. Pull context + history, call ai-chat-handler
// 4. Persist messages, apply action, send the reply
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const WA_GRAPH = "https://graph.facebook.com/v21.0";

function verify(secret: string, body: string, signature: string): boolean {
  try {
    const crypto = (globalThis as any).crypto;
    const key = new TextEncoder().encode(secret);
    const msg = new TextEncoder().encode(body);
    return crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
      .then((k) => crypto.subtle.sign("HMAC", k, msg))
      .then((sig) => {
        const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
        return hex === signature.replace("sha256=", "");
      });
  } catch {
    return false;
  }
}

async function sendWhatsApp(phoneNumberId: string, to: string, text: string) {
  const token = Deno.env.get("WHATSAPP_TOKEN");
  await fetch(`${WA_GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // --- Verification handshake ---
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === Deno.env.get("WHATSAPP_VERIFY_TOKEN")) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // --- Inbound message ---
  if (req.method === "POST") {
    const raw = await req.text();
    const ok = await verify(Deno.env.get("WHATSAPP_APP_SECRET") || "", raw, req.headers.get("x-hub-signature-256") || "");
    if (!ok) return new Response("Bad signature", { status: 401 });

    const body = JSON.parse(raw);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const msg = change.value?.messages?.[0];
        if (!msg || msg.type !== "text") continue;
        const from = msg.from;
        const phoneNumberId = change.value.metadata.phone_number_id;

        // 1. Find shop by WhatsApp number
        const { data: shop } = await supabase.from("shops")
          .select("*").eq("whatsapp_number", change.value.metadata.display_phone_number).single();

        // 2. Find or create conversation
        let { data: conv } = await supabase.from("conversations")
          .select("*").eq("shop_id", shop.id).eq("customer_phone", from).single();
        if (!conv) {
          ({ data: conv } = await supabase.from("conversations")
            .insert({ shop_id: shop.id, customer_phone: from, status: "open" }).select().single());
        }

        // 3. Store customer message
        await supabase.from("messages").insert({ conversation_id: conv.id, sender: "customer", content: msg.text.body });
        await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);

        // 4. Context + history
        const { data: inventory } = await supabase.from("inventory_items").select("*").eq("shop_id", shop.id);
        const { data: history } = await supabase.from("messages")
          .select("sender,content").eq("conversation_id", conv.id).order("created_at", { ascending: true }).limit(20);

        // 5. Ask the AI
        const ai = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-chat-handler`, {
          method: "POST",
          headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`, "Content-Type": "application/json" },
          body: JSON.stringify({ shop, inventory, history, message: msg.text.body }),
        }).then((r) => r.json());

        // 6. Apply action
        if (ai.action === "escalate") {
          await supabase.from("conversations").update({ status: "escalated" }).eq("id", conv.id);
        }
        // create_order / create_booking would insert rows here using the parsed intent

        // 7. Reply + persist
        await sendWhatsApp(phoneNumberId, from, ai.reply);
        await supabase.from("messages").insert({ conversation_id: conv.id, sender: "ai", content: ai.reply });
      }
    }
    return new Response("OK", { status: 200 });
  }
  return new Response("Method not allowed", { status: 405 });
});
