// ============================================================
// generate-post — drafts marketing content from inventory and
// insight signals (slow days, low stock, best sellers).
// Owner reviews + approves before anything is sent (v1 rule).
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const { shop_id, channel = "wa", signal } = await req.json();
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return Response.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const { data: shop } = await supabase.from("shops").select("*").eq("id", shop_id).single();
  const { data: inventory } = await supabase.from("inventory_items").select("*").eq("shop_id", shop_id);
  const lowStock = (inventory || []).filter((i) => i.quantity <= i.low_stock_threshold).map((i) => i.name);
  const best = (inventory || []).slice().sort((a, b) => b.quantity - a.quantity).slice(0, 2).map((i) => i.name);

  const signalText = signal || (lowStock.length
    ? `low stock on: ${lowStock.join(", ")}`
    : `best sellers: ${best.join(", ")}`);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `You are Lantern's marketing copywriter for "${shop.name}" (a ${shop.category || "local shop"}). Write ONE ready-to-send ${channel === "ig" ? "Instagram caption" : channel === "sms" ? "SMS text" : "WhatsApp broadcast"} (under 90 words) for this signal: ${signalText}. Warm, local, no hype. No hashtags in SMS.`,
      }],
    }),
  });
  const data = await res.json();
  const content = data.content?.[0]?.text?.trim() || "";

  await supabase.from("marketing_drafts").insert({ shop_id, channel, content, status: "draft" });
  return Response.json({ draft_id: (await supabase.from("marketing_drafts").select("id").eq("shop_id", shop_id).order("created_at", { ascending: false }).limit(1)).data?.[0]?.id, content });
});
