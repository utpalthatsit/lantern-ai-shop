// ============================================================
// business-summary — on-demand owner briefing.
// Computes REAL statistics for the shop from the database and
// (when an AI key exists — Gemini or Anthropic) turns them into
// plain language. Never fabricates numbers: the stats are the
// source of truth.
// ============================================================
import { handleOptions, json } from "../_shared/cors.ts";
import { authedUserId, canAccessShop, isUuid, adminClient } from "../_shared/shopAuth.ts";
import { pickAIProvider, completeText } from "../_shared/ai.ts";

function startOfDay(d = new Date()): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}
function startOfYesterday(): string {
  const x = new Date();
  x.setDate(x.getDate() - 1);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

async function gatherStats(supabase: any, shopId: string) {
  const today = startOfDay();
  const yesterday = startOfYesterday();

  const [customers, products, todayOrders, allOrders, todayBookings, allBookings, convs, lowStock, unreadNotifs, todayAi, topItems] = await Promise.all([
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
    supabase.from("orders").select("total, status").eq("shop_id", shopId).gte("created_at", today),
    supabase.from("orders").select("total, status").eq("shop_id", shopId),
    supabase.from("bookings").select("status").eq("shop_id", shopId).gte("start_time", today),
    supabase.from("bookings").select("status").eq("shop_id", shopId).gte("start_time", yesterday),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
    supabase.from("products").select("id, name, stock, low_stock_threshold").eq("shop_id", shopId).lte("stock", "low_stock_threshold"),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("read", false),
    supabase.from("ai_logs").select("id", { count: "exact", head: true }).eq("shop_id", shopId).gte("created_at", today),
    supabase.from("order_items").select("name, quantity, orders!inner(shop_id, status)")
      .eq("orders.shop_id", shopId).in("orders.status", ["pending", "confirmed", "processing", "completed"]),
  ]);

  const done = (allOrders.data || []).filter((o: any) => o.status === "completed");
  const todayDone = (todayOrders.data || []).filter((o: any) => o.status === "completed");
  const revenueToday = todayDone.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const revenueAllTime = done.reduce((s: number, o: any) => s + Number(o.total || 0), 0);

  const top = new Map<string, number>();
  for (const it of (topItems.data || [])) top.set(it.name, (top.get(it.name) || 0) + Number(it.quantity || 0));
  const bestSellers = [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const pendingBookings = (allBookings.data || []).filter((b: any) => b.status === "pending").length;
  const todayBookingCount = (todayBookings.data || []).length;

  return {
    total_customers: customers.count || 0,
    total_products: products.count || 0,
    total_conversations: convs.count || 0,
    orders_today: (todayOrders.data || []).length,
    revenue_today: Math.round(revenueToday * 100) / 100,
    revenue_all_time: Math.round(revenueAllTime * 100) / 100,
    total_orders: (allOrders.data || []).length,
    bookings_today: todayBookingCount,
    pending_bookings: pendingBookings,
    low_stock: lowStock.data || [],
    unread_notifications: unreadNotifs.count || 0,
    ai_actions_today: todayAi.count || 0,
    best_sellers: bestSellers.map(([name, count]) => ({ name, count })),
  };
}

function factualSummary(stats: any, shop: any): string {
  const cur = shop.currency === "INR" ? "₹" : `${shop.currency} `;
  const low = stats.low_stock.map((p: any) => p.name).join(", ");
  const parts: string[] = [];
  parts.push(`Today ${stats.shop_name} has ${stats.orders_today} order${stats.orders_today === 1 ? "" : "s"} (${cur}${stats.revenue_today.toLocaleString("en-IN")}), ${stats.bookings_today} booking${stats.bookings_today === 1 ? "" : "s"} and ${stats.ai_actions_today} AI conversation${stats.ai_actions_today === 1 ? "" : "s"}.`);
  if (stats.pending_bookings > 0) parts.push(`${stats.pending_bookings} booking${stats.pending_bookings === 1 ? "" : "s"} still need${stats.pending_bookings === 1 ? "s" : ""} your confirmation.`);
  if (low) parts.push(`Low on stock: ${low}.`);
  if (stats.unread_notifications > 0) parts.push(`You have ${stats.unread_notifications} unread notification${stats.unread_notifications === 1 ? "" : "s"}.`);
  if (stats.best_sellers.length) parts.push(`Best sellers: ${stats.best_sellers.map((b: any) => `${b.name} (${b.count})`).join(", ")}.`);
  return parts.join(" ");
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
    if (!isUuid(shopId)) return json({ error: "Valid shop_id required" }, 400);
    if (!(await canAccessShop(shopId, userId))) return json({ error: "Forbidden" }, 403);

    const supabase = adminClient();
    const { data: shop } = await supabase.from("shops").select("*").eq("id", shopId).single();
    if (!shop) return json({ error: "Shop not found" }, 404);

    const stats = await gatherStats(supabase, shopId);
    stats.shop_name = shop.name;

    let summary = factualSummary(stats, shop);
    try {
      summary = await completeText(
        "You are ShopSathi's owner briefing assistant. Write warm, specific, truthful sentences using only the numbers given. Never invent anything.",
        `Owner briefing for ${shop.name}. Use ONLY these real numbers (do not invent any): ${JSON.stringify(stats)}. Write 2–4 warm, specific sentences for the owner: mention what deserves attention (low stock, pending bookings, unread notifications) and one concrete suggestion. Plain language, no jargon, under 90 words.`,
        400,
      );
    } catch (e: any) {
      console.error("[business-summary] AI failed, falling back to factual", e?.message || e);
    }

    return json({ summary, stats, claude: !!pickAIProvider() });
  } catch (e: any) {
    console.error("[business-summary]", e?.message || e);
    return json({ error: "Internal error" }, 500);
  }
});
