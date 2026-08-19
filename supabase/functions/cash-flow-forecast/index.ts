// ============================================================
// cash-flow-forecast — real-time cash flow projection.
// ============================================================
import { handleOptions, json } from "../_shared/cors.ts";
import { authedUserId, canAccessShop, isUuid, adminClient } from "../_shared/shopAuth.ts";
import { pickAIProvider, completeText } from "../_shared/ai.ts";

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function advanceDate(date: Date, freq: string): Date {
  const d = new Date(date);
  if (freq === "weekly") d.setDate(d.getDate() + 7);
  else if (freq === "monthly") d.setMonth(d.getMonth() + 1);
  else if (freq === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 10);
  return d;
}

async function gatherCashFlowData(supabase: any, shopId: string, days: number) {
  const now = startOfDay();
  const horizon = addDays(now, days);

  const [completedOrders, pendingOrders, cashEntries, paymentReminders, settings] = await Promise.all([
    supabase.from("orders")
      .select("id, total, status, payment_status, amount_paid, due_date, created_at")
      .eq("shop_id", shopId).eq("status", "completed")
      .gte("created_at", now.toISOString()).lte("created_at", horizon.toISOString()),
    supabase.from("orders")
      .select("id, total, status, payment_status, amount_paid, due_date, customer_name, created_at")
      .eq("shop_id", shopId).in("status", ["pending", "confirmed", "processing"])
      .lte("created_at", horizon.toISOString()),
    supabase.from("cash_flow_entries")
      .select("*").eq("shop_id", shopId).eq("active", true)
      .lte("next_date", fmtDate(horizon)),
    supabase.from("payment_reminders")
      .select("id, customer_name, amount, type, status, due_date, created_at")
      .eq("shop_id", shopId).eq("status", "pending")
      .lte("due_date", fmtDate(horizon)),
    supabase.from("settings")
      .select("payment_reminders_enabled")
      .eq("shop_id", shopId).maybeSingle(),
  ]);

  const dailyMap = new Map<string, { income: number; expense: number }>();
  for (let i = 0; i <= days; i++) {
    const d = addDays(now, i);
    dailyMap.set(fmtDate(d), { income: 0, expense: 0 });
  }

  for (const o of completedOrders.data || []) {
    const day = (o.created_at || "").slice(0, 10);
    if (dailyMap.has(day)) {
      dailyMap.get(day)!.income += Number(o.total || 0);
    }
  }

  for (const e of cashEntries.data || []) {
    let d = new Date(e.next_date);
    while (d <= horizon) {
      const dayStr = fmtDate(d);
      if (dailyMap.has(dayStr)) {
        const entry = dailyMap.get(dayStr)!;
        if (e.type === "income") entry.income += Number(e.amount || 0);
        else entry.expense += Number(e.amount || 0);
      }
      if (e.frequency === "once") break;
      d = advanceDate(d, e.frequency);
    }
  }

  const receivables = (pendingOrders.data || [])
    .filter((o: any) => o.payment_status !== "paid")
    .map((o: any) => ({
      id: o.id,
      customer: o.customer_name,
      amount: Number(o.total || 0) - Number(o.amount_paid || 0),
      due: o.due_date || fmtDate(horizon),
      status: o.status,
    }));

  const payables = (paymentReminders.data || []).map((r: any) => ({
    id: r.id,
    to: r.customer_name,
    amount: Number(r.amount || 0),
    due: r.due_date,
    type: r.type,
  }));

  let totalIncome = 0;
  let totalExpense = 0;
  let runningBalance = 0;
  const dailyData: any[] = [];

  for (const [date, data] of dailyMap) {
    totalIncome += data.income;
    totalExpense += data.expense;
    runningBalance += data.income - data.expense;
    dailyData.push({
      date,
      income: Math.round(data.income * 100) / 100,
      expense: Math.round(data.expense * 100) / 100,
      balance: Math.round(runningBalance * 100) / 100,
    });
  }

  const totalReceivables = receivables.reduce((s: number, r: any) => s + r.amount, 0);
  const totalPayables = payables.reduce((s: number, p: any) => s + p.amount, 0);
  const today = fmtDate(now);
  const overdue = (paymentReminders.data || []).filter((r: any) => r.due_date < today && r.status === "pending");

  return {
    days,
    today: fmtDate(now),
    daily: dailyData,
    summary: {
      total_income: Math.round(totalIncome * 100) / 100,
      total_expense: Math.round(totalExpense * 100) / 100,
      net_flow: Math.round((totalIncome - totalExpense) * 100) / 100,
      total_receivables: Math.round(totalReceivables * 100) / 100,
      total_payables: Math.round(totalPayables * 100) / 100,
    },
    receivables,
    payables,
    overdue_count: overdue.length,
    payment_reminders_enabled: settings?.payment_reminders_enabled !== false,
  };
}

function factualCashFlow(data: any, shop: any): string {
  const cur = shop.currency === "INR" ? "₹" : shop.currency + " ";
  const s = data.summary;
  const parts: string[] = [];
  parts.push("Over the next " + data.days + " days: expected income " + cur + s.total_income.toLocaleString("en-IN") + ", expected expenses " + cur + s.total_expense.toLocaleString("en-IN") + ", net cash flow " + cur + s.net_flow.toLocaleString("en-IN") + ".");
  if (s.total_receivables > 0) parts.push("You are owed " + cur + s.total_receivables.toLocaleString("en-IN") + " from " + data.receivables.length + " pending order(s).");
  if (s.total_payables > 0) parts.push("You have " + cur + s.total_payables.toLocaleString("en-IN") + " in upcoming payments to make.");
  if (data.overdue_count > 0) parts.push(data.overdue_count + " payment reminder(s) are overdue.");
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
    const days = Math.min(90, Math.max(1, Number(body?.days) || 30));
    if (!isUuid(shopId)) return json({ error: "Valid shop_id required" }, 400);
    if (!(await canAccessShop(shopId, userId))) return json({ error: "Forbidden" }, 403);

    const supabase = adminClient();
    const { data: shop } = await supabase.from("shops").select("*").eq("id", shopId).single();
    if (!shop) return json({ error: "Shop not found" }, 404);

    const data = await gatherCashFlowData(supabase, shopId, days);
    let narrative = factualCashFlow(data, shop);

    try {
      const prompt = "Cash flow forecast for " + shop.name + " (" + (shop.currency || "INR") + "). Data: " + JSON.stringify(data) + ". Write 2-4 warm, actionable sentences for the shop owner. Mention key numbers, any risks, and one concrete suggestion. Plain language, under 120 words.";
      narrative = await completeText(
        "You are VyaparSathi's cash flow advisor. Write warm, specific, actionable sentences using ONLY the numbers given. Never invent anything.",
        prompt,
        500,
      );
    } catch (e: any) {
      console.error("[cash-flow-forecast] AI failed", e?.message || e);
    }

    return json({ ...data, narrative, ai: !!pickAIProvider() });
  } catch (e: any) {
    console.error("[cash-flow-forecast]", e?.message || e);
    return json({ error: "Internal error" }, 500);
  }
});
