/* ============================================================
   Lantern — components/chatBubble.js
   ============================================================ */
import { icon } from "../utils/constants.js";
import { avatarFor } from "../utils/constants.js";

/* msg: { id, sender: 'customer'|'ai'|'owner', content, created_at, escalate? } */
export function renderMessage(msg, customerName) {
  const av = avatarFor(customerName || "Customer", msg.seedG);
  const isIn = msg.sender === "customer";
  const ai = msg.sender === "ai";
  const time = new Date(msg.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const bubbleExtra = ai ? " ai" : "";
  return `
    <div class="msg ${isIn ? "in" : "out"}${ai ? " ai" : ""}">
      ${isIn ? `<span class="ava sm ${av.cls}">${av.initial}</span>` : ""}
      <div class="msg-body">
        <div class="msg-bubble${bubbleExtra}">${msg.content}</div>
        ${msg.escalate ? `<div class="msg-actions"><span class="escalate-tag">${icon("chatEscalate")} Escalated to you</span></div>` : ""}
        <div class="msg-meta">${time}${msg.sender === "owner" ? " · you" : ""}</div>
      </div>
    </div>`;
}

export function renderTyping() {
  return `<div class="typing-msg"><span class="typing-dots"><i></i><i></i><i></i></span><span>Lantern is thinking…</span></div>`;
}

export function renderQuickReplies(chips) {
  if (!chips || !chips.length) return "";
  return `<div class="quick-replies">${chips.map(c => `<button class="chip" data-quick="${c}">${c}</button>`).join("")}</div>`;
}
