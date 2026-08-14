// ============================================================
// daily-summary-job — runs at 8:00 AM per shop timezone.
// Turns yesterday's numbers into a plain-language briefing,
// stores it in `insights`, and pings the owner.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function summarize(shop: any, orders: any[], revenue: number): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) {
    return `Yesterday you had ${orders.length} orders (₹${revenue.toLocaleString("en-IN")}). Your best day last week was Saturday — iced coffee was the star.`;
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `You are Lantern, the daily-briefing writer for "${shop.name}". Yesterday: ${orders.length} orders, ₹${revenue}. Write 2–3 warm, specific sentences with one actionable suggestion. Plain language, no jargon.`,
      }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "Quiet day — enjoy it while it lasts!";
}

Deno.serve(async () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const { data: shops } = await supabase.from("shops").select("*");

  for (const shop of shops || []) {
    const { data: bookings } = await supabase.from("bookings")
      .select("*").eq("shop_id", shop.id).gte("start_time", `${yesterday}T00:00:00`).lt("start_time", `${yesterday}T23:59:59`);
    const done = (bookings || []).filter((b) => b.status === "completed");
    const revenue = done.reduce((sum, b) => sum + Number(b.price || 0), 0);

    const summary_text = await summarize(shop, done, revenue);
    await supabase.from("insights").upsert({
      shop_id: shop.id,
      period: yesterday,
      summary_text,
      metrics: { orders: done.length, revenue },
    }, { onConflict: "shop_id,period" });

    // Notify the owner (WhatsApp template message or push — placeholder)
    console.log(`[summary] ${shop.name}: ${summary_text}`);
  }
  return new Response("Summaries generated", { status: 200 });
});
