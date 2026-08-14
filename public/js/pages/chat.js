/* ============================================================
   Lantern — pages/chat.js
   ============================================================ */
import { db } from "../supabaseClient.js";
import { icon, avatarFor } from "../utils/constants.js";
import { relativeTime, maskPhone, esc } from "../utils/formatters.js";
import { renderMessage, renderTyping, renderQuickReplies } from "../components/chatBubble.js";
import { toast } from "../components/toast.js";

let activeId = null;
let unsub = null;
let renderTimer = null;

export function initChat(root) {
  root.innerHTML = `
    <div class="chat-layout">
      <div class="card conv-pane">
        <div class="pane-head">
          <h3 style="font-family:var(--font-display);font-size:1.1rem;font-weight:600">Conversations</h3>
          <div class="sub">Live from WhatsApp · Instagram · SMS</div>
        </div>
        <div class="conv-scroll" id="convList"></div>
      </div>
      <div class="card thread-pane" id="threadPane">
        <div class="thread-head" id="threadHead"></div>
        <div class="thread-scroll" id="threadScroll"></div>
        <div id="quickReplies"></div>
        <div class="thread-input">
          <button class="mic-btn" id="micBtn" title="Voice note (demo)">${icon("mic")}</button>
          <textarea class="ta" id="chatInput" rows="1" placeholder="Reply as you (owner)…"></textarea>
          <button class="send-btn" id="sendBtn" aria-label="Send">${icon("send")}</button>
        </div>
      </div>
    </div>`;
}

export async function renderChat() {
  const list = document.getElementById("convList");
  const convs = await db.conversations();
  if (!list) return;
  list.innerHTML = convs.map((c) => {
    const av = avatarFor(c.customer, c.seedG);
    const lastMsg = c.preview || c.last_message_at;
    return `
      <div class="conv-item ${c.id === activeId ? "active" : ""}" data-conv="${c.id}">
        <span class="ava sm ${av.cls}">${av.initial}</span>
        <div class="c-txt">
          <div class="c-nm"><b>${esc(c.customer)}</b><time>${relativeTime(c.last_message_at)}</time></div>
          <div class="c-prev"><span>${esc(lastMsg)}</span>${c.unread ? `<span class="unread-dot"></span>` : ""}</div>
        </div>
      </div>`;
  }).join("") || `<div class="empty">${icon("inbox")}<p>No conversations yet. They'll appear here in real time.</p></div>`;

  list.querySelectorAll(".conv-item").forEach((el) => {
    el.addEventListener("click", () => { activeId = el.dataset.conv; openThread(activeId); });
  });

  if (!activeId && convs.length) { activeId = convs[0].id; openThread(activeId); }
  else if (activeId) openThread(activeId);
}

async function openThread(id) {
  activeId = id;
  const msgs = await db.messages(id);
  const conv = (await db.conversations()).find((c) => c.id === id);
  if (!conv) return;
  document.querySelectorAll(".conv-item").forEach((el) => el.classList.toggle("active", el.dataset.conv === id));

  const av = avatarFor(conv.customer, conv.seedG);
  const head = document.getElementById("threadHead");
  head.innerHTML = `
    <span class="ava ${av.cls}">${av.initial}</span>
    <div class="t-info">
      <div class="t-name">${esc(conv.customer)}</div>
      <div class="t-meta">${maskPhone(conv.phone)} · ${conv.lang === "hi" ? "हिन्दी" : "English"}${conv.status === "escalated" ? ` · <span class="escalate-tag" style="margin-left:2px">${icon("chatEscalate")} needs you</span>` : ""}</div>
    </div>
    <span class="badge teal"><span class="badge-dot"></span>${conv.status === "escalated" ? "Escalated" : "AI handled"}</span>`;

  const scroll = document.getElementById("threadScroll");
  scroll.innerHTML = `<div class="day-sep">Today</div>` +
    msgs.map((m) => renderMessage(m, conv.customer)).join("") +
    renderQuickReplies(conv.status === "escalated" ? ["No problem — I'll handle it", "Calling them now"] : ["Thanks!", "More info please"]);
  scroll.scrollTop = scroll.scrollHeight;

  bindQuickReplies(conv);
}

function bindQuickReplies(conv) {
  document.querySelectorAll("[data-quick]").forEach((btn) => {
    btn.addEventListener("click", () => sendMessage(btn.dataset.quick, conv.id));
  });
}

async function sendMessage(content, convId = activeId) {
  if (!content.trim() || !convId) return;
  const input = document.getElementById("chatInput");
  const scroll = document.getElementById("threadScroll");
  await db.sendMessage(convId, content.trim(), "owner");
  input.value = "";
  input.style.height = "auto";
  scroll.insertAdjacentHTML("beforeend", renderMessage({
    id: "tmp", sender: "owner", content: esc(content.trim()), created_at: new Date().toISOString(),
  }, ""));
  scroll.scrollTop = scroll.scrollHeight;
  renderChat();
  db.autoReply(convId);
}

export function bindChatEvents() {
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const micBtn = document.getElementById("micBtn");
  if (!input) return;

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input.value); }
  });
  sendBtn.addEventListener("click", () => sendMessage(input.value));
  micBtn.addEventListener("click", () => {
    micBtn.classList.toggle("listening");
    toast({ title: "Voice note (demo)", body: "In production, Lantern transcribes your voice and acts on it.", iconName: "mic" });
    setTimeout(() => micBtn.classList.remove("listening"), 1600);
  });

  /* Live conversation updates (realtime push in prod, simulated here) */
  unsub = db.subscribeConversations(() => {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => renderChat(), 150);
    updateNavUnread();
  });

  /* Simulated incoming customer a few seconds in */
  db.simulateIncoming().then((conv) => {
    if (conv) {
      setTimeout(() => {
        toast({
          title: `New message from ${conv.customer}`,
          body: "“are you open tomorrow? chai + 2 samosa kitne ka hoga? 😊”",
          iconName: "chat",
        });
        updateNavUnread();
      }, 300);
    }
  });
}

export function updateNavUnread() {
  db.conversations().then((convs) => {
    const n = convs.filter((c) => c.unread).length;
    const badge = document.getElementById("navUnread");
    if (badge) { badge.textContent = n; badge.style.display = n ? "" : "none"; }
  });
}
