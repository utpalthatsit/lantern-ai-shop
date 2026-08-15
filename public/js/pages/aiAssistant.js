/* ============================================================
   ShopSathi — pages/aiAssistant.js
   Owner-facing AI: ask questions about YOUR shop (products,
   stock, customers, bookings, orders) — answered via the
   ai-chat-handler edge function using controlled tools, or
   generate an on-demand business summary from live numbers.
   ============================================================ */
import { db } from "../supabaseClient.js";
import { icon } from "../utils/constants.js";
import { esc } from "../utils/formatters.js";
import { renderMessage, renderTyping } from "../components/chatBubble.js";
import { toast } from "../components/toast.js";

let history = [];
let busy = false;

export function init(root) {
  root.innerHTML = `
    <div class="ai-layout">
      <div class="card ai-panel" style="flex:1">
        <div class="ai-head">
          <span class="ava sm" style="background:var(--gold-grad);color:#1a1004">${icon("sparkle")}</span>
          <div>
            <div style="font-weight:650">ShopSathi AI</div>
            <div class="faint small">Answers from your real data — prices, stock, bookings, orders, customers</div>
          </div>
        </div>
        <div class="ai-scroll" id="aiThread">
          <div class="day-sep">Assistant</div>
          <div class="msg in ai">
            <div class="msg-body"><div class="msg-bubble ai" style="white-space:pre-wrap">Hi! I'm your shop assistant. Ask me anything about your business, e.g. “Which products are low on stock?” or “What's on the books tomorrow?”</div></div>
          </div>
        </div>
        <div class="ai-input">
          <textarea class="ta" id="aiInput" rows="1" placeholder="Ask about your shop…" aria-label="Ask ShopSathi"></textarea>
          <button class="send-btn" id="aiSend" aria-label="Send">${icon("send")}</button>
        </div>
      </div>
      <div class="card ai-side">
        <div class="panel-head"><h3>${icon("brain")} Business summary</h3></div>
        <div class="panel-body" style="flex:1;display:flex;flex-direction:column">
          <p class="muted small" style="margin-bottom:.8rem">Generate a plain-language briefing from today's real numbers — orders, revenue, bookings, low stock, notifications.</p>
          <button class="btn btn-gold" id="genSummaryBtn">${icon("sparkle")} Generate summary</button>
          <div id="summaryBox" style="margin-top:1rem"></div>
        </div>
      </div>
    </div>`;
}

export async function render(root) {
  const input = root.querySelector("#aiInput");
  const sendBtn = root.querySelector("#aiSend");
  const thread = root.querySelector("#aiThread");
  const summaryBtn = root.querySelector("#genSummaryBtn");

  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } });
  sendBtn.addEventListener("click", ask);
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; });

  summaryBtn.addEventListener("click", async () => {
    summaryBtn.disabled = true;
    const box = root.querySelector("#summaryBox");
    box.innerHTML = `<div class="skeleton-block"></div><div class="skeleton-block" style="width:70%"></div>`;
    try {
      const res = await db.businessSummary();
      box.innerHTML = `
        <div class="ai-summary">${esc(res.summary)}</div>
        <div class="faint small" style="margin-top:.6rem">${res.stats.orders_today} orders today · ${res.stats.bookings_today} bookings · ${res.stats.total_customers} customers · ${res.stats.low_stock.length} low stock</div>`;
      toast({ title: "Summary ready", body: "Built from live numbers.", tone: "green", iconName: "brain" });
    } catch (e) {
      box.innerHTML = `<p class="muted small" style="color:var(--rose)">Could not generate: ${esc(e.message || e)}</p>`;
    } finally {
      summaryBtn.disabled = false;
    }
  });

  async function ask() {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    input.value = "";
    thread.insertAdjacentHTML("beforeend", renderMessage({ id: "u" + Date.now(), sender: "owner", content: text, created_at: new Date().toISOString() }, ""));
    thread.insertAdjacentHTML("beforeend", renderTyping());
    thread.scrollTop = thread.scrollHeight;
    history.push({ role: "user", content: text });
    try {
      const res = await db.aiChat(text);
      thread.querySelector(".typing-msg")?.remove();
      const reply = res.reply || "I couldn't answer that confidently — the owner has been notified.";
      thread.insertAdjacentHTML("beforeend", renderMessage({ id: "a" + Date.now(), sender: "ai", content: reply, created_at: new Date().toISOString() }, ""));
      if (res.escalated) {
        toast({ title: "Marked for human help", body: "This one is flagged for you to handle personally.", tone: "rose", iconName: "chatEscalate" });
      }
    } catch (e) {
      thread.querySelector(".typing-msg")?.remove();
      thread.insertAdjacentHTML("beforeend", renderMessage({ id: "e" + Date.now(), sender: "system", content: "Could not reach the AI: " + (e.message || e), created_at: new Date().toISOString() }, ""));
    }
    busy = false;
    thread.scrollTop = thread.scrollHeight;
  }
}

export function bind(root) {
  /* events bound in render */
}
