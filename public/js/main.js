/* ============================================================
   Lantern — main.js (entry point)
   index.html → cinematic landing interactions
   app.html   → auth gate + router-lite + page modules
   ============================================================ */
import { db, isDemo } from "./supabaseClient.js";
import { getSession, clearSession, initAuth } from "./auth.js";
import { initChat, renderChat, bindChatEvents, updateNavUnread } from "./pages/chat.js";
import { renderInventory, bindInventoryEvents, updateLowStockBadge } from "./pages/inventory.js";
import { renderBookings, bindBookingsEvents } from "./pages/bookings.js";
import { renderInsights, bindInsightsEvents } from "./pages/insights.js";
import { renderMarketing, bindMarketingEvents } from "./pages/marketing.js";
import { icon } from "./utils/constants.js";
import { toast } from "./components/toast.js";

const isApp = document.body.id === "appPage";

/* ============================================================
   LANDING PAGE
   ============================================================ */
function initLanding() {
  /* Letterbox curtain — then fully remove it (fill-mode keeps the brand visible) */
  setTimeout(() => {
    document.body.classList.add("curtain-open");
    setTimeout(() => document.getElementById("letterbox")?.remove(), 2000);
  }, 900);

  /* Nav background on scroll */
  const nav = document.getElementById("siteNav");
  const onScroll = () => nav?.classList.toggle("scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* Reveal on scroll */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  /* Hero chat — plays once the curtain lifts */
  const chat = document.getElementById("heroChat");
  if (chat) playHeroChat(chat);
  playDemoWindow();
}

function bubble(el, html, cls, delay) {
  return new Promise((res) => setTimeout(() => {
    const b = document.createElement("div");
    b.className = `bubble ${cls}`;
    b.innerHTML = html;
    el.appendChild(b);
    el.scrollTop = el.scrollHeight;
    res();
  }, delay));
}

async function playHeroChat(chat) {
  await new Promise((r) => setTimeout(r, 2400));
  const t = (h, m) => new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  await bubble(chat, `Hi! Do you have iced coffee? Also, are you open on Sundays? ☀️<span class="tm">${t()}</span>`, "cust", 0);
  await bubble(chat, `We do — and yes, we're open Sundays 9–5! ☕ Our cold brew is a favourite, ₹190. Want me to hold one?<span class="tm">${t()}</span>`, "ai", 1400);
  const typing = document.createElement("div");
  typing.className = "bubble ai";
  typing.innerHTML = `<span class="typing-dots"><i></i><i></i><i></i></span>`;
  chat.appendChild(typing);
  await new Promise((r) => setTimeout(r, 1100));
  typing.remove();
  await bubble(chat, `yes please! pick up in 20 mins 🙌<span class="tm">${t()}</span>`, "cust", 0);
  await bubble(chat, `Done — 1× Cold Brew @ ₹190 held for you. Pickup by 12:20. See you soon! ✨<span class="tm">${t()}</span>`, "ai", 1200);
  const chip = document.createElement("div");
  chip.className = "action-chip";
  chip.innerHTML = `${icon("checkCircle")} Order written to inventory`;
  chat.appendChild(chip);
}

/* Demo window below the fold — replays when scrolled into view */
let demoPlayed = false;
function playDemoWindow() {
  const thread = document.getElementById("demoThread");
  const list = document.getElementById("demoConvList");
  if (!thread) return;
  const io = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !demoPlayed) {
      demoPlayed = true;
      demoPlay(thread, list);
      io.disconnect();
    }
  }, { threshold: 0.4 });
  io.observe(thread.closest(".demo-stage"));
}

const DEMO_THREAD = [
  { s: "in", t: "Ritu Sharma", txt: "bhaiya 2 cold brew chahiye pickup ke liye, abhi aa raha hu ☕", tm: "1:42 PM" },
  { s: "out", t: "Lantern", txt: "Done Ritu! 2× Cold Brew @ ₹190 = ₹380. Ready for pickup in 15 min. UPI on arrival or link — your call. 🙂", tm: "1:42 PM" },
  { s: "sys", txt: "Inventory updated · −2 Cold Brew", tm: "1:42 PM" },
  { s: "in", t: "Ritu Sharma", txt: "actually ek refund chahiye, kal ka order cancel karna tha", tm: "1:44 PM" },
  { s: "out", t: "Lantern", txt: "Refund requests go straight to the owner — I've flagged this with the full thread. Priya will reply here shortly. 🙏", tm: "1:44 PM" },
  { s: "escalate", txt: "Escalated to owner · Priya notified", tm: "1:44 PM" },
];

function demoBubble(thread, { s, txt, tm }) {
  if (s === "sys") return `<div class="action-chip" style="align-self:center;margin:.2rem 0">${icon("box")} ${txt}</div>`;
  if (s === "escalate") return `<div class="action-chip" style="align-self:center">${icon("chatEscalate")} ${txt}</div>`;
  return `<div class="bubble ${s}">${txt}<span class="tm">${tm}</span></div>`;
}

function demoConvItem(list, name, prev, time, g, active) {
  return `
    <div class="conv-item ${active ? "active" : ""}">
      <span class="ava sm g${g}">${name[0]}</span>
      <div class="txt">
        <div class="nm">${name}<time>${time}</time></div>
        <div class="prev">${prev}</div>
      </div>
    </div>`;
}

async function demoPlay(thread, list) {
  list.innerHTML =
    demoConvItem(list, "Ritu Sharma", "refund chahiye kal ka order cancel", "1:44 PM", 0, true) +
    demoConvItem(list, "Ananya Iyer", "yes please, 2 avo toasts", "11:06 AM", 1) +
    demoConvItem(list, "Marcus Lee", "is there any discount for students?", "9:47 AM", 2) +
    demoConvItem(list, "Fatima Khan", "chocolate fudge please, 1 kg", "8:12 AM", 3);
  await new Promise((r) => setTimeout(r, 500));
  for (const step of DEMO_THREAD) {
    if (step.s === "out") {
      thread.insertAdjacentHTML("beforeend", `<div class="bubble ai" style="max-width:78%;align-self:flex-end">${step.txt}<span class="tm">${step.tm}</span></div>`);
    } else {
      thread.insertAdjacentHTML("beforeend", demoBubble(thread, step));
    }
    thread.scrollTop = thread.scrollHeight;
    await new Promise((r) => setTimeout(r, 1100));
  }
}

/* ============================================================
   APP CONSOLE
   ============================================================ */
const TABS = {
  chat: {
    title: "Chat", sub: "Live conversations with your customers",
    init: () => { initChat(document.getElementById("page-chat")); bindChatEvents(); },
    render: renderChat,
  },
  inventory: {
    title: "Inventory", sub: "Stock, prices & low-stock alerts",
    init: () => {
      const root = document.getElementById("page-inventory");
      root.innerHTML = `
        <div class="page-head">
          <div><h2>Inventory</h2><div class="desc">What's on the shelf right now</div></div>
          <div class="spacer"></div>
          <div class="search-box" style="width:240px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input id="invSearch" placeholder="Search items…"></div>
          <button class="btn btn-gold" id="addItemBtn">${icon("plus")} Add item</button>
        </div>
        <div class="inv-grid" id="invGrid"></div>`;
      bindInventoryEvents();
    },
    render: renderInventory,
  },
  bookings: {
    title: "Bookings", sub: "Appointments, reminders & no-show recovery",
    init: () => {
      const root = document.getElementById("page-bookings");
      root.innerHTML = `
        <div class="page-head">
          <div><h2>Bookings</h2><div class="desc">Today's chairs and what's coming</div></div>
          <div class="spacer"></div>
          <span class="badge teal"><span class="badge-dot"></span>Reminders auto-sent</span>
          <button class="btn btn-gold" id="newBookingBtn">${icon("plus")} New booking</button>
        </div>
        <div class="day-strip" id="dayStrip"></div>
        <div class="bk-timeline" id="bkTimeline"></div>`;
      bindBookingsEvents();
    },
    render: renderBookings,
  },
  insights: {
    title: "Insights", sub: "What Lantern noticed while you were busy",
    init: bindInsightsEvents,
    render: renderInsights,
  },
  marketing: {
    title: "Marketing", sub: "AI-drafted posts — you approve before anything goes out",
    init: () => {
      const root = document.getElementById("page-marketing");
      root.innerHTML = `
        <div class="mkt-head">
          <div class="gen">${icon("sparkle")} Lantern drafts from your inventory &amp; slow days</div>
          <div class="spacer"></div>
          <button class="btn btn-soft gen-btn" id="generateBtn">${icon("sparkle")} Generate another</button>
        </div>
        <div class="draft-grid" id="draftGrid"></div>`;
      bindMarketingEvents();
    },
    render: renderMarketing,
  },
};

let rendered = new Set();

function bootApp() {
  const session = getSession();
  if (!session) {
    initAuth({ onSuccess: bootApp });
    return;
  }
  document.getElementById("authScreen").style.display = "none";
  const shell = document.getElementById("appShell");
  shell.style.display = "flex";
  if (isDemo) document.getElementById("demoBanner").style.display = "inline-flex";

  /* Shop identity */
  const shop = db.shop();
  if (shop) {
    document.getElementById("shopName").textContent = shop.name;
    document.getElementById("shopLang").textContent = shop.language;
    document.getElementById("shopAva").textContent = shop.name[0];
    document.getElementById("ownerName").textContent = shop.owner;
  }

  document.getElementById("signOut").addEventListener("click", () => {
    clearSession();
    location.reload();
  });

  /* Router */
  const go = (tab) => {
    if (!TABS[tab]) tab = "chat";
    document.querySelectorAll("#appNav a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
    Object.keys(TABS).forEach((t) => {
      document.getElementById(`page-${t}`).style.display = t === tab ? "" : "none";
    });
    const cfg = TABS[tab];
    document.getElementById("pageTitle").textContent = cfg.title;
    document.getElementById("pageSub").textContent = cfg.sub;
    if (!rendered.has(tab)) { cfg.init(); rendered.add(tab); }
    cfg.render();
  };

  document.querySelectorAll("#appNav a").forEach((a) => {
    a.addEventListener("click", (e) => { e.preventDefault(); location.hash = a.dataset.tab; });
  });
  window.addEventListener("hashchange", () => go((location.hash || "#chat").slice(1)));
  go((location.hash || "#chat").slice(1));

  updateNavUnread();
  updateLowStockBadge();
  toast({ title: "Lantern is watching the counters", body: "New customer messages appear here in real time.", iconName: "sparkle" });
}

/* ============================================================
   BOOT
   ============================================================ */
if (isApp) bootApp();
else initLanding();
