/* ============================================================
   ShopSathi — pages/conversations.js
   Live WhatsApp conversations. Owner replies go through the
   send-message edge function (stores + sends via WhatsApp when
   configured). Escalated threads are flagged for human replies.
   ============================================================ */
import { db, supabase, getShop } from "../supabaseClient.js";
import { icon, avatarFor } from "../utils/constants.js";
import { relativeTime, maskPhone, esc } from "../utils/formatters.js";
import { renderMessage, renderTyping } from "../components/chatBubble.js";
import { toast } from "../components/toast.js";
import { loadingState, errorState, emptyState } from "../utils/ui.js";

let activeId = null;
let list = [];
let channel = null;

export function init(root) {
  root.innerHTML = `
    <div class="chat-layout">
      <div class="card conv-pane">
        <div class="pane-head">
          <h3 style="font-family:var(--font-display);font-size:1.1rem;font-weight:600">Conversations</h3>
          <div class="sub">Live from WhatsApp</div>
        </div>
        <div class="conv-scroll" id="convList"></div>
      </div>
      <div class="card thread-pane" id="threadPane">
        <div class="thread-head" id="threadHead"></div>
        <div class="thread-scroll" id="threadScroll"></div>
        <div id="quickReplies"></div>
        <div class="thread-input">
          <textarea class="ta" id="chatInput" rows="1" placeholder="Reply as you (owner)…" aria-label="Reply"></textarea>
          <button class="send-btn" id="sendBtn" aria-label="Send">${icon("send")}</button>
        </div>
      </div>
    </div>`;
}

export async function render(root) {
  const listEl = root.querySelector("#convList");
  try {
    list = await db.conversations();
    const shop = getShop();
    if (!listEl) return;
    listEl.innerHTML = list.map((c) => {
      const av = avatarFor(c.customer_name || c.customer_phone || "?", (c.customer_phone || "0").length % 6);
      const preview = c.last_message || "No messages yet";
      return `
      <div class="conv-item ${c.id === activeId ? "active" : ""}" data-conv="${c.id}">
        <span class="ava sm ${av.cls}">${av.initial}</span>
        <div class="c-txt">
          <div class="c-nm"><b>${esc(c.customer_name || c.customer_phone || "Customer")}</b><time>${relativeTime(c.last_message_at)}</time></div>
          <div class="c-prev"><span>${esc(preview)}</span>${c.owner_unread ? `<span class="unread-dot"></span>` : ""}</div>
          ${c.status === "escalated" ? `<div class="faint small" style="color:var(--rose)">${icon("chatEscalate")} needs you</div>` : ""}
        </div>
      </div>`;
    }).join("") || emptyState("chat", "No conversations yet", "Customers messaging your WhatsApp number appear here in real time.");

    listEl.querySelectorAll(".conv-item").forEach((el) => el.addEventListener("click", () => { activeId = el.dataset.conv; openThread(root, activeId); }));

    // On mobile the list pane is hidden unless .open — show it whenever
    // no conversation is active (empty state or returning from a thread).
    const pane = root.querySelector(".conv-pane");
    if (!activeId) pane?.classList.add("open");
    else pane?.classList.remove("open");

    if (!activeId && list.length) openThread(root, list[0].id);
    else if (activeId) openThread(root, activeId);
  } catch (e) {
    console.error(e);
    if (listEl) listEl.innerHTML = errorState("Couldn't load conversations: " + (e.message || e), true);
  }
}

async function openThread(root, id) {
  activeId = id;
  const conv = list.find((c) => c.id === id);
  if (!conv) return;
  root.querySelector(".conv-pane")?.classList.remove("open");
  root.querySelectorAll(".conv-item").forEach((el) => el.classList.toggle("active", el.dataset.conv === id));
  const av = avatarFor(conv.customer_name || conv.customer_phone || "?", (conv.customer_phone || "0").length % 6);
  const head = root.querySelector("#threadHead");
  head.innerHTML = `
    <button class="btn-icon" id="backToList" aria-label="Back to conversations" title="Back" style="flex:none">${icon("arrowLeft")}</button>
    <span class="ava ${av.cls}">${av.initial}</span>
    <div class="t-info">
      <div class="t-name">${esc(conv.customer_name || conv.customer_phone || "Customer")}</div>
      <div class="t-meta">${conv.customer_phone ? esc(maskPhone(conv.customer_phone)) : ""}${conv.status === "escalated" ? ` · <span class="escalate-tag">${icon("chatEscalate")} needs you</span>` : ""}</div>
    </div>
    ${conv.status === "escalated"
      ? `<button class="btn-soft btn" id="resolveBtn" style="padding:.45rem .9rem;font-size:.8rem">${icon("check")} Mark handled</button>`
      : `<span class="badge teal"><span class="badge-dot"></span>${conv.status === "closed" ? "Closed" : "AI handled"}</span>`}`;

  const scroll = root.querySelector("#threadScroll");
  scroll.innerHTML = loadingState("Loading messages…");
  try {
    const msgs = await db.messages(id);
    scroll.innerHTML = `<div class="day-sep">Conversation</div>` + msgs.map((m) => renderMessage(m, conv.customer_name || conv.customer_phone)).join("");
    scroll.scrollTop = scroll.scrollHeight;
    await db.markConversationRead(id);
    const { refreshBadges } = await import("../main.js").catch(() => ({}));
  } catch (e) {
    scroll.innerHTML = errorState("Couldn't load messages: " + (e.message || e), true);
  }

  root.querySelector("#backToList")?.addEventListener("click", () => {
    activeId = null;
    root.querySelector(".conv-pane")?.classList.add("open");
    root.querySelector("#threadHead").innerHTML = "";
    root.querySelector("#threadScroll").innerHTML = "";
    render(root);
  });

  root.querySelector("#resolveBtn")?.addEventListener("click", async () => {
    await db.setConversationStatus(id, "closed");
    toast({ title: "Marked handled", body: "The thread is closed — the customer can still write back.", tone: "green", iconName: "checkCircle" });
    render(root);
  });

  bindInput(root, conv);
  wireMessageRealtime();
}

function bindInput(root, conv) {
  const input = root.querySelector("#chatInput");
  const sendBtn = root.querySelector("#sendBtn");
  const doSend = async () => {
    const content = input.value.trim();
    if (!content) return;
    input.value = "";
    input.style.height = "auto";
    const scroll = root.querySelector("#threadScroll");
    scroll.insertAdjacentHTML("beforeend", renderMessage({ id: "tmp", sender: "owner", content, created_at: new Date().toISOString() }, conv.customer_name || conv.customer_phone));
    scroll.scrollTop = scroll.scrollHeight;
    try {
      const res = await db.sendOwnerMessage(conv.id, content);
      if (res?.delivered) {
        toast({ title: "Message delivered", body: "Sent to the customer on WhatsApp.", tone: "green", iconName: "checkCircle" });
      } else {
        toast({ title: "Saved, not delivered", body: res?.delivery_error || "WhatsApp isn't configured — the reply is stored.", tone: "gold", iconName: "alert" });
      }
      render(root);
    } catch (e) {
      toast({ title: "Could not send", body: e.message, tone: "rose", iconName: "alert" });
    }
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); } });
  sendBtn.addEventListener("click", doSend);
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; });
}

function wireMessageRealtime() {
  const shop = getShop();
  if (!shop || !supabase || channel) return;
  channel = supabase
    .channel(`msgs-${shop.id}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
      const msg = payload.new;
      if (msg.conversation_id === activeId) {
        const scroll = document.getElementById("threadScroll");
        if (scroll) {
          scroll.insertAdjacentHTML("beforeend", renderMessage(msg, ""));
          scroll.scrollTop = scroll.scrollHeight;
        }
        await db.markConversationRead(activeId);
      }
      render(document.getElementById("page-conversations"));
    })
    .subscribe();
}

export function bind(root) {
  /* input events are bound per-thread in openThread */
}
