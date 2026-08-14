// ============================================================
// ai-chat-handler — the brain.
// Builds a Claude prompt from shop context + history, returns
// { reply, action } where action ∈ none | create_order |
// create_booking | escalate.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

interface Ctx {
  shop: any;
  inventory: any[];
  history: { sender: string; content: string }[];
  message: string;
}

function buildPrompt(ctx: Ctx): string {
  const shop = ctx.shop;
  const items = ctx.inventory
    .map((i) => `${i.name} — ${i.quantity} in stock, ${i.price} ${shop.currency || "INR"}`)
    .join("\n");
  const history = ctx.history.slice(-12).map((m) => `${m.sender}: ${m.content}`).join("\n");

  return `You are Lantern, the AI business assistant for "${shop.name}".
Hours: ${JSON.stringify(shop.hours)}. Languages: ${shop.language || "auto-detect the customer's language and reply in it"}.

Current inventory:
${items || "(none registered yet — tell the customer you'll check with the owner)"}

Rules:
- Reply warmly, briefly, in the customer's language. Never invent prices or stock — if unsure, escalate.
- If the customer clearly wants to order/book and details are complete, set action to create_order/create_booking.
- If the request needs judgement (refunds, complaints, unusual discounts), set action to "escalate" and keep the reply polite.
- Otherwise action is "none".

Conversation so far:
${history}

Customer's latest message: ${ctx.message}

Respond ONLY as JSON: {"reply": "...", "action": "none|create_order|create_booking|escalate"}`;
}

async function callClaude(prompt: string): Promise<{ reply: string; action: string }> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { reply: "Lantern is warming up — the owner will be with you shortly.", action: "escalate" };

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = data.content?.[0]?.text || "{}";
  try {
    const parsed = JSON.parse(text.replace(/^```json\s*|```$/g, ""));
    return { reply: String(parsed.reply || ""), action: ["create_order", "create_booking", "escalate"].includes(parsed.action) ? parsed.action : "none" };
  } catch {
    return { reply: text.trim().slice(0, 500), action: "none" };
  }
}

export async function handleMessage(ctx: Ctx) {
  const result = await callClaude(buildPrompt(ctx));
  return {
    ...result,
    // Escalate by default when the model is unsure and no key is configured
    action: result.reply ? result.action : "escalate",
  };
}

// Entry for direct invocation (e.g. tests / manual trigger)
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  try {
    const ctx: Ctx = await req.json();
    return Response.json(await handleMessage(ctx));
  } catch (e) {
    return Response.json({ reply: "Something went wrong — the owner has been notified.", action: "escalate" }, { status: 500 });
  }
});
