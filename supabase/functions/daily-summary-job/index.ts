// ============================================================
// daily-summary-job — scheduled (cron, e.g. 08:00 daily).
// Computes yesterday's REAL numbers per shop, writes a plain-
// language briefing into `insights` and notifies the owner.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function dayBounds(offsetDays: number) {
  const start = new Date();
  start.setDate(start.getDate() + offsetDays);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function summarize(shop: any, stats: any): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  const cur = shop.currency === "INR" ? "₹" : `${shop.currency} `;
  const factual =
    `Yesterday ${shop.name} had ${stats.orders} orders (${cur}${stats.revenue.toLocaleString("en-IN")}), ` +
    `${stats.bookings} bookings, ${stats.conversations} conversations and ${stats.low_stock.length} low-stock product${stats.low_stock.length === 1 ? "" : "s"}.` +
    (stats.low_stock.length ? ` Restock: ${stats.low_stock.join(", ")}.` : "");
  if (!key) return factual;
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `Write a 2–3 sentence owner briefing for ${shop.name} using ONLY these real numbers: ${JSON.stringify(stats)}. Warm, specific, one actionable suggestion. No jargon. If every number is zero, say so plainly — never invent activity.`,
        }],
      }),
    });
    if (!res.ok) return factual;
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || factual;
  } catch {
    return factual;
  }
}

Deno.serve(async () => {
  const { start, end } = dayBounds(-1);
  const period = start.slice(0, 10);

  const { data: shops } = await supabase.from("shops").select("id, name, currency, owner_id");
  for (const shop of shops || []) {
    try {
      const [orders, bookings, conversations, lowStock] = await Promise.all([
        supabase.from("orders").select("total, status").eq("shop_id", shop.id).gte("created_at", start).lte("created_at", end),
        supabase.from("bookings").select("status").eq("shop_id", shop.id).gte("start_time", start).lte("start_time", end),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("shop_id", shop.id).gte("last_message_at", start).lte("last_message_at", end),
        supabase.from("products").select("name").eq("shop_id", shop.id).lte("stock", "low_stock_threshold"),
      ]);

      const done = (orders.data || []).filter((o: any) => o.status === "completed");
      const stats = {
        orders: (orders.data || []).length,
        revenue: done.reduce((s: number, o: any) => s + Number(o.total || 0), 0),
        bookings: (bookings.data || []).length,
        conversations: conversations.count || 0,
        low_stock: (lowStock.data || []).map((p: any) => p.name),
      };

      const summary_text = await summarize(shop, stats);
      await supabase.from("insights").upsert({
        shop_id: shop.id, period, summary_text,
        metrics: { orders: stats.orders, revenue: stats.revenue, bookings: stats.bookings, conversations: stats.conversations, low_stock: stats.low_stock },
      }, { onConflict: "shop_id,period" });

      await supabase.from("notifications").insert({
        shop_id: shop.id, type: "system", title: `Your ${period} briefing is ready`,
        body: summary_text.slice(0, 280), data: { period },
      });
      console.log(`[daily-summary] ${shop.name}: ${summary_text.slice(0, 80)}`);
    } catch (e: any) {
      console.error(`[daily-summary] failed for ${shop.id}`, e?.message || e);
    }
  }
  return new Response("Summaries generated", { status: 200 });
});
