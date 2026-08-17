// ============================================================
// whatsapp-status — WhatsApp delivery health check for the owner
// console. Reports per-shop credentials (settings wa_*) with
// platform-level env fallback, so Settings can show exactly
// what is missing. Owner-authenticated (user JWT).
// ============================================================
import { handleOptions, json } from "../_shared/cors.ts";
import { authedUserId, canAccessShop, isUuid, adminClient } from "../_shared/shopAuth.ts";

Deno.serve(async (req) => {
  const opts = handleOptions(req);
  if (opts) return opts;

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const userId = await authedUserId(req);
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const shopId = String(body?.shop_id || "");
    if (!isUuid(shopId)) return json({ error: "Valid shop_id is required" }, 400);
    if (!(await canAccessShop(shopId, userId))) return json({ error: "Forbidden" }, 403);

    const supabase = adminClient();
    const { data: shop } = await supabase.from("shops")
      .select("whatsapp_number").eq("id", shopId).maybeSingle();
    const { data: settings } = await supabase.from("settings")
      .select("whatsapp_enabled, wa_token, wa_phone_number_id, wa_app_secret, wa_verify_token")
      .eq("shop_id", shopId).maybeSingle();

    const shopCreds = !!(settings?.wa_token && settings?.wa_phone_number_id);
    const serverCreds = !!Deno.env.get("WHATSAPP_TOKEN") && !!Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const shopWebhook = !!(settings?.wa_app_secret && settings?.wa_verify_token);
    const serverWebhook = !!Deno.env.get("WHATSAPP_APP_SECRET") && !!Deno.env.get("WHATSAPP_VERIFY_TOKEN");

    return json({
      whatsapp_number: shop?.whatsapp_number || null,
      enabled: !!settings?.whatsapp_enabled,
      credentials_configured: shopCreds || serverCreds,
      webhook_configured: shopWebhook || serverWebhook,
      shop_credentials: shopCreds,
      server_credentials: serverCreds,
    });
  } catch (e: any) {
    console.error("[whatsapp-status]", e?.message || e);
    return json({ error: "Internal error" }, 500);
  }
});
