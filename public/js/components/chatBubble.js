/* ============================================================
   ShopSathi — components/chatBubble.js
   All customer content is HTML-escaped before rendering.
   ============================================================ */
import { icon, avatarFor } from "../utils/constants.js";
import { esc } from "../utils/formatters.js";

export function renderMessage(msg, customerName) {
  const av = avatarFor(customerName || "Customer", msg.seedG);
  const isIn = msg.sender === "customer";
  const time = new Date(msg.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const safeContent = esc(msg.content);
  return `
    <div class="msg ${isIn ? "in" : "out"}${msg.sender === "ai" ? " ai" : ""}">
      ${isIn ? `<span class="ava sm ${av.cls}">${av.initial}</span>` : ""}
      <div class="msg-body">
        <div class="msg-bubble" style="white-space:pre-wrap">${safeContent}</div>
        ${msg.escalate ? `<div class="msg-actions"><span class="escalate-tag">${icon("chatEscalate")} Escalated to you</span></div>` : ""}
        <div class="msg-meta">${time}${msg.sender === "owner" ? " · you" : msg.sender === "system" ? " · system" : ""}</div>
      </div>
    </div>`;
}

export function renderTyping() {
  return `<div class="typing-msg"><span class="typing-dots"><i></i><i></i><i></i></span><span>ShopSathi is thinking…</span></div>`;
}

export function renderQuickReplies(chips) {
  if (!chips || !chips.length) return "";
  return `<div class="quick-replies">${chips.map((c) => `<button class="chip" data-quick="${esc(c)}">${esc(c)}</button>`).join("")}</div>`;
}
