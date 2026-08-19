// ============================================================
// send-payment-reminders — scheduled (daily cron).
// Sends WhatsApp reminders for overdue and upcoming payments.
// Uses each SHOP's own WhatsApp credentials.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const WA_GRAPH = "https://graph.facebook.com/v21.0";

async function sendWhatsApp(
  to: string,
  text: string,
  settings: any,
): Promise<boolean> {
  const token = settings?.wa_token || Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneNumberId = settings?.wa_phone_number_id ||
    Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
  if (!token || !phoneNumberId) return false;
  try {
    const res = await fetch(`${WA_GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text.slice(0, 4000) },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  // 1. Overdue payment reminders (due_date < today, status = pending)
  const { data: overdue } = await supabase
    .from("payment_reminders")
    .select(
      "id, shop_id, customer_name, customer_phone, amount, type, due_date, message",
    )
    .eq("status", "pending")
    .lt("due_date", todayStr);

  for (const r of overdue || []) {
    try {
      const { data: settings } = await supabase
        .from("settings")
        .select("wa_token, wa_phone_number_id, payment_reminders_enabled")
        .eq("shop_id", r.shop_id)
        .maybeSingle();

      if (settings?.payment_reminders_enabled === false) continue;
      if (!r.customer_phone) continue;

      const daysOverdue = Math.floor(
        (today.getTime() - new Date(r.due_date).getTime()) / 86400000,
      );
      const cur = r.type === "outgoing" ? "₹" : "₹"; // could customize per shop

      const text = r.message ||
        `Payment reminder: ${cur}${r.amount.toLocaleString("en-IN")} from ${r.customer_name} is ${daysOverdue} day${daysOverdue > 1 ? "s" : ""} overdue. Please follow up.`;

      const ok = await sendWhatsApp(r.customer_phone, text, settings);
      if (ok) {
        await supabase
          .from("payment_reminders")
          .update({ status: "sent", reminder_date: todayStr })
          .eq("id", r.id);
        await supabase.from("notifications").insert({
          shop_id: r.shop_id,
          type: "payment_reminder",
          title: `Payment reminder sent to ${r.customer_name}`,
          body: `${cur}${r.amount.toLocaleString("en-IN")} — overdue ${daysOverdue} day${daysOverdue > 1 ? "s" : ""}`,
          data: { reminder_id: r.id, overdue: true },
        });
      }
      console.log(
        `[payment-reminder] ${r.customer_phone} <- ${r.customer_name} overdue=${daysOverdue}d ok=${ok}`,
      );
    } catch (e: any) {
      console.error(
        `[payment-reminder] failed for ${r.id}`,
        e?.message || e,
      );
    }
  }

  // 2. Upcoming payment reminders (due within 2 days, not yet sent)
  const in2Days = new Date(today);
  in2Days.setDate(in2Days.getDate() + 2);
  const in2DaysStr = in2Days.toISOString().slice(0, 10);

  const { data: upcoming } = await supabase
    .from("payment_reminders")
    .select(
      "id, shop_id, customer_name, customer_phone, amount, type, due_date, message",
    )
    .eq("status", "pending")
    .gte("due_date", todayStr)
    .lte("due_date", in2DaysStr);

  for (const r of upcoming || []) {
    // Only send if we haven't sent a reminder today
    if (r.reminder_date === todayStr) continue;

    try {
      const { data: settings } = await supabase
        .from("settings")
        .select("wa_token, wa_phone_number_id, payment_reminders_enabled")
        .eq("shop_id", r.shop_id)
        .maybeSingle();

      if (settings?.payment_reminders_enabled === false) continue;
      if (!r.customer_phone) continue;

      const dueDate = new Date(r.due_date).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });

      const text = r.message ||
        `Friendly reminder: ₹${r.amount.toLocaleString("en-IN")} payment to ${r.customer_name} is due on ${dueDate}. Please ensure timely payment.`;

      const ok = await sendWhatsApp(r.customer_phone, text, settings);
      if (ok) {
        await supabase
          .from("payment_reminders")
          .update({ reminder_date: todayStr })
          .eq("id", r.id);
      }
      console.log(
        `[payment-reminder] upcoming ${r.customer_phone} <- ${r.customer_name} due=${r.due_date} ok=${ok}`,
      );
    } catch (e: any) {
      console.error(
        `[payment-reminder] failed for ${r.id}`,
        e?.message || e,
      );
    }
  }

  return new Response("Payment reminders processed", { status: 200 });
});
