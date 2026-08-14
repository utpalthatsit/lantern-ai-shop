// ============================================================
// send-reminders — hourly cron. Finds confirmed bookings
// starting in ~24h, sends a WhatsApp reminder, and nudges
// no-shows to rebook.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function sendWhatsApp(to: string, text: string) {
  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) return;
  await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
}

Deno.serve(async () => {
  const in24h = new Date(Date.now() + 86400000).toISOString();
  const { data: bookings } = await supabase.from("bookings")
    .select("*, shops(name, whatsapp_number)")
    .eq("status", "confirmed")
    .gte("start_time", in24h);

  for (const b of bookings || []) {
    const when = new Date(b.start_time).toLocaleString("en-IN", {
      weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
    });
    await sendWhatsApp(b.customer_phone, `Reminder from ${b.shops.name}: ${b.service} with ${b.staff} on ${when}. Reply "RESCHEDULE" to move it, "CANCEL" to cancel.`);
    console.log(`[reminder] ${b.customer_phone} ← ${b.service} ${when}`);
  }

  // No-shows get a gentle rebooking nudge
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const { data: noshows } = await supabase.from("bookings")
    .select("*, shops(name)").eq("status", "no_show").gte("start_time", yesterday);
  for (const b of noshows || []) {
    await sendWhatsApp(b.customer_phone, `We missed you at ${b.shops.name} — no worries! Want to grab a new slot this week? Just reply with a time that suits you. 🙂`);
  }

  return new Response("Reminders sent", { status: 200 });
});
