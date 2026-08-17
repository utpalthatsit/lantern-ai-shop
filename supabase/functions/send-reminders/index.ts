// ============================================================
// send-reminders — scheduled (hourly cron).
// Sends WhatsApp reminders for confirmed bookings starting in
// ~24h, nudges no-shows to rebook, and logs a notification.
// Uses each SHOP's own WhatsApp credentials (settings wa_token /
// wa_phone_number_id, with platform env fallback).
// Never claims a reminder was sent if the API rejects it.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const WA_GRAPH = "https://graph.facebook.com/v21.0";

async function sendWhatsApp(to: string, text: string, settings: any): Promise<boolean> {
  const token = settings?.wa_token || Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneNumberId = settings?.wa_phone_number_id || Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
  if (!token || !phoneNumberId) return false;
  try {
    const res = await fetch(`${WA_GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4000) } }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async () => {
  const in24h = new Date(Date.now() + 24 * 3600000).toISOString();

  const { data: bookings } = await supabase.from("bookings")
    .select("id, shop_id, customer_phone, service, staff, start_time, shops(name, whatsapp_number)")
    .eq("status", "confirmed")
    .gte("start_time", in24h)
    .lte("start_time", new Date(Date.now() + 26 * 3600000).toISOString());

  for (const b of bookings || []) {
    try {
      const { data: settings } = await supabase.from("settings")
        .select("booking_reminders, wa_token, wa_phone_number_id").eq("shop_id", b.shop_id).maybeSingle();
      if (settings?.booking_reminders === false) continue;

      const when = new Date(b.start_time).toLocaleString("en-IN", {
        weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
      });
      const ok = await sendWhatsApp(b.customer_phone,
        `Reminder from ${b.shops.name}: ${b.service}${b.staff ? ` with ${b.staff}` : ""} on ${when}. Reply "RESCHEDULE" to move it or "CANCEL" to cancel.`,
        settings);
      if (ok) {
        await supabase.from("notifications").insert({
          shop_id: b.shop_id, type: "booking_reminder",
          title: `Reminder sent for ${b.service}`,
          body: `${when} — ${b.customer_phone}`,
          data: { booking_id: b.id, delivered: true },
        });
      }
      console.log(`[reminder] ${b.customer_phone} <- ${b.service} ${when} ok=${ok}`);
    } catch (e: any) {
      console.error(`[reminder] failed for ${b.id}`, e?.message || e);
    }
  }

  // No-shows get a gentle rebooking nudge (24h window).
  const since = new Date(Date.now() - 24 * 3600000).toISOString();
  const { data: noshows } = await supabase.from("bookings")
    .select("id, shop_id, customer_phone, service, shops(name)")
    .eq("status", "no_show").gte("start_time", since);

  for (const b of noshows || []) {
    const { data: settings } = await supabase.from("settings")
      .select("wa_token, wa_phone_number_id").eq("shop_id", b.shop_id).maybeSingle();
    const ok = await sendWhatsApp(b.customer_phone,
      `We missed you at ${b.shops.name} — no worries! Want to grab a new slot this week? Just reply with a time that suits you. 🙂`,
      settings);
    console.log(`[rebook-nudge] ${b.customer_phone} ok=${ok}`);
  }

  return new Response("Reminders processed", { status: 200 });
});
