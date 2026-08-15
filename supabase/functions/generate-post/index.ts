// ============================================================
// generate-post — drafts marketing content from real inventory
// and shop context. Owner reviews + approves before anything is
// sent (never auto-sent). Requires the owner's JWT.
// ============================================================
import { handleOptions, json } from "../_shared/cors.ts";
import { authedUserId, canAccessShop, isUuid, adminClient } from "../_shared/shopAuth.ts";
import { completeText } from "../_shared/ai.ts";

Deno.serve(async (req) => {
  const opts = handleOptions(req);
  if (opts) return opts;

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const userId = await authedUserId(req);
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const shopId = String(body?.shop_id || "");
    const channel = ["wa", "ig", "sms"].includes(body?.channel) ? body.channel : "wa";
    if (!isUuid(shopId)) return json({ error: "Valid shop_id required" }, 400);
    if (!(await canAccessShop(shopId, userId))) return json({ error: "Forbidden" }, 403);

    const supabase = adminClient();
    const { data: shop } = await supabase.from("shops").select("*").eq("id", shopId).single();
    if (!shop) return json({ error: "Shop not found" }, 404);
    const { data: inventory } = await supabase.from("products")
      .select("name, stock, low_stock_threshold, price").eq("shop_id", shopId).eq("active", true);

    const lowStock = (inventory || []).filter((i: any) => i.stock <= i.low_stock_threshold).map((i: any) => i.name);
    const best = (inventory || []).slice().sort((a: any, b: any) => b.stock - a.stock).slice(0, 3).map((i: any) => i.name);
    const signal = body?.signal || (lowStock.length
      ? `low stock on: ${lowStock.join(", ")}`
      : best.length ? `best sellers: ${best.join(", ")}` : "a friendly hello");

    let content = "";
    try {
      content = await completeText(
        "You are ShopSathi's marketing copywriter. Warm, local, honest tone. Never invent discounts, prices or claims.",
        `Write ONE ready-to-send ${channel === "ig" ? "Instagram caption" : channel === "sms" ? "SMS text" : "WhatsApp broadcast"} (under 90 words) for "${shop.name}" (a ${shop.category || "local shop"}), for this signal: ${signal}. No hashtags in SMS.`,
        300,
      );
    } catch (e: any) {
      console.error("[generate-post] AI failed", e?.message || e);
      return json({ error: "AI is not configured — set GEMINI_API_KEY or ANTHROPIC_API_KEY on the server" }, 503);
    }
    if (!content) return json({ error: "AI returned an empty draft" }, 502);

    const { data: draft, error } = await supabase.from("marketing_drafts").insert({
      shop_id: shopId, channel, content, status: "draft",
    }).select().single();
    if (error) return json({ error: "Could not save the draft" }, 500);

    return json({ draft_id: draft.id, content, channel, signal });
  } catch (e: any) {
    console.error("[generate-post]", e?.message || e);
    return json({ error: "Internal error" }, 500);
  }
});
