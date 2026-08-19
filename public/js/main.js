/* ============================================================
   VyaparSathi — main.js (entry point)
   index.html → cinematic landing
   app.html   → auth gate → onboarding → router over 11 tabs
   ============================================================ */
import { supabase, isConfigured, db, setShop, getShop } from "./supabaseClient.js";
import { initAuth, signOut } from "./auth.js";
import { toast } from "./components/toast.js";
import { icon } from "./utils/constants.js";

import * as dashboard from "./pages/dashboard.js";
import * as products from "./pages/products.js";
import * as inventory from "./pages/inventory.js";
import * as customers from "./pages/customers.js";
import * as orders from "./pages/orders.js";
import * as billing from "./pages/billing.js";
import * as bookings from "./pages/bookings.js";
import * as conversations from "./pages/conversations.js";
import * as aiAssistant from "./pages/aiAssistant.js";
import * as notifications from "./pages/notifications.js";
import * as marketing from "./pages/marketing.js";
import * as cashflow from "./pages/cashflow.js";
import * as settings from "./pages/settings.js";

const isApp = document.body.id === "appPage";

/* ============================================================
   LANDING PAGE (marketing animation only — no fake data)
   ============================================================ */
function initLanding() {
  setTimeout(() => {
    document.body.classList.add("curtain-open");
    setTimeout(() => document.getElementById("letterbox")?.remove(), 2000);
  }, 900);

  const nav = document.getElementById("siteNav");
  const onScroll = () => nav?.classList.toggle("scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

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
  const t = () => new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
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

async function demoPlay(thread, list) {
  const item = (name, prev, time, g, active) => `
    <div class="conv-item ${active ? "active" : ""}">
      <span class="ava sm g${g}">${name[0]}</span>
      <div class="txt">
        <div class="nm">${name}<time>${time}</time></div>
        <div class="prev">${prev}</div>
      </div>
    </div>`;
  list.innerHTML =
    item("Ritu Sharma", "refund chahiye kal ka order cancel", "1:44 PM", 0, true) +
    item("Ananya Iyer", "yes please, 2 avo toasts", "11:06 AM", 1) +
    item("Marcus Lee", "is there any discount for students?", "9:47 AM", 2);
  await new Promise((r) => setTimeout(r, 500));
  const steps = [
    { cls: "in", txt: "bhaiya 2 cold brew chahiye pickup ke liye, abhi aa raha hu ☕", tm: "1:42 PM" },
    { cls: "ai", txt: "Done Ritu! 2× Cold Brew @ ₹190 = ₹380. Ready for pickup in 15 min. 🙂", tm: "1:42 PM" },
    { cls: "chip", txt: `${icon("box")} Inventory updated · −2 Cold Brew` },
    { cls: "in", txt: "actually ek refund chahiye, kal ka order cancel karna tha", tm: "1:44 PM" },
    { cls: "ai", txt: "Refund requests go straight to the owner — I've flagged this with the full thread. 🙏", tm: "1:44 PM" },
    { cls: "chip", txt: `${icon("chatEscalate")} Escalated to owner · notified` },
  ];
  for (const s of steps) {
    if (s.cls === "chip") thread.insertAdjacentHTML("beforeend", `<div class="action-chip" style="align-self:center;margin:.2rem 0">${s.txt}</div>`);
    else thread.insertAdjacentHTML("beforeend", `<div class="bubble ${s.cls}" style="${s.cls === "ai" ? "max-width:78%;align-self:flex-end" : ""}">${s.txt}<span class="tm">${s.tm}</span></div>`);
    thread.scrollTop = thread.scrollHeight;
    await new Promise((r) => setTimeout(r, 1100));
  }
}

/* ============================================================
   APP CONSOLE
   ============================================================ */
const TABS = {
  dashboard:   { title: "Dashboard",      sub: "Your shop at a glance",                    init: dashboard.init,   render: dashboard.render },
  products:    { title: "Products",       sub: "What you sell — catalog & prices",          init: products.init,    bind: products.bind,    render: products.render },
  inventory:   { title: "Inventory",      sub: "Stock levels, history & low-stock alerts",  init: inventory.init,   bind: inventory.bind,   render: inventory.render },
  customers:   { title: "Customers",      sub: "Who shops with you",                        init: customers.init,   bind: customers.bind,   render: customers.render },
  orders:      { title: "Orders",         sub: "Everything your customers ordered",         init: orders.init,      bind: orders.bind,      render: orders.render },
  billing:     { title: "Billing",        sub: "GST invoices — type or just speak",             init: billing.init,     bind: billing.bind,     render: billing.render },
  bookings:    { title: "Bookings",       sub: "Appointments & reminders",                  init: bookings.init,    bind: bookings.bind,    render: bookings.render },
  conversations: { title: "Conversations", sub: "Live WhatsApp & web chat",                init: conversations.init, bind: conversations.bind, render: conversations.render },
  ai:          { title: "AI Assistant",   sub: "Ask VyaparSathi anything about your shop",    init: aiAssistant.init, bind: aiAssistant.bind, render: aiAssistant.render },
  notifications: { title: "Notifications", sub: "What needs your attention",               init: notifications.init, bind: notifications.bind, render: notifications.render },
  marketing:   { title: "Marketing",      sub: "AI-drafted posts — you approve first",      init: marketing.init,   bind: marketing.bind,   render: marketing.render },
  cashflow:    { title: "Cash Flow",      sub: "Forecast finances & track payments",      init: cashflow.init,    bind: cashflow.bind,    render: cashflow.render },
  settings:    { title: "Settings",       sub: "Your shop profile & preferences",           init: settings.init,    bind: settings.bind,    render: settings.render },
};

let rendered = new Set();
let activeTab = "dashboard";

async function loadWorkspace() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const ownerEl = document.getElementById("ownerAva");
  const nameEl = document.getElementById("ownerName");
  const fullName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Owner";
  if (ownerEl) ownerEl.textContent = (fullName[0] || "?").toUpperCase();
  if (nameEl) nameEl.textContent = fullName.split(" ")[0];

  /* Find the user's shop(s) — owned or member. */
  const [owned, memberships] = await Promise.all([
    supabase.from("shops").select("*").eq("owner_id", user.id),
    supabase.from("shop_members").select("shop_id, shops(*)").eq("user_id", user.id),
  ]);
  const ownedShops = owned.data || [];
  const memberShops = (memberships.data || []).map((m) => m.shops).filter(Boolean);
  const shops = [...ownedShops, ...memberShops];

  if (!shops.length) {
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("onboardScreen").style.display = "grid";
    document.getElementById("onboardScreen").querySelector("#o-name").focus();
    return;
  }
  enterConsole(shops[0]);
}

async function enterConsole(shop) {
  setShop(shop);
  db.setShop(shop);
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("onboardScreen").style.display = "none";
  const shell = document.getElementById("appShell");
  shell.style.display = "flex";

  document.getElementById("shopName").textContent = shop.name;
  document.getElementById("shopAva").textContent = (shop.name[0] || "?").toUpperCase();
  document.getElementById("shopLang").textContent = shop.language || "en";

  /* Sign out */
  document.getElementById("signOut").addEventListener("click", async () => {
    await signOut();
    location.hash = "";
    location.reload();
  });

  /* Router */
  const go = (tab) => {
    if (!TABS[tab]) tab = "dashboard";
    activeTab = tab;
    document.querySelectorAll("#appNav a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
    Object.keys(TABS).forEach((t) => {
      document.getElementById(`page-${t}`).style.display = t === tab ? "" : "none";
    });
    const cfg = TABS[tab];
    document.getElementById("pageTitle").textContent = cfg.title;
    document.getElementById("pageSub").textContent = cfg.sub;
    if (!rendered.has(tab)) {
      cfg.init(document.getElementById(`page-${tab}`));
      cfg.bind?.(document.getElementById(`page-${tab}`));
      rendered.add(tab);
    }
    cfg.render(document.getElementById(`page-${tab}`));
    closeNav();
    window.scrollTo(0, 0);
  };

  document.querySelectorAll("#appNav a").forEach((a) => {
    a.addEventListener("click", (e) => { e.preventDefault(); location.hash = a.dataset.tab; });
  });
  window.addEventListener("hashchange", () => go((location.hash || "#dashboard").slice(1)));
  go((location.hash || "#dashboard").slice(1));

  /* Top bar */
  document.getElementById("hamburger").addEventListener("click", toggleNav);
  document.getElementById("navScrim").addEventListener("click", closeNav);
  document.getElementById("bellBtn").addEventListener("click", () => { location.hash = "notifications"; });

  refreshBadges();
  wireRealtime();
}

function toggleNav() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("navScrim").classList.toggle("show");
}
function closeNav() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("navScrim").classList.remove("show");
}

/* ============================================================
   Badges + realtime
   ============================================================ */
async function refreshBadges() {
  const shop = getShop();
  if (!shop) return;
  try {
    const [productsList, ordersList, bookingsList, convs, notifs] = await Promise.all([
      db.products({ lowStock: true }),
      db.orders(),
      db.bookings(),
      db.conversations(),
      db.notifications(100),
    ]);
    const low = (productsList || []).length;
    const pendingOrders = (ordersList || []).filter((o) => o.status === "pending" || o.status === "confirmed").length;
    const pendingBookings = (bookingsList || []).filter((b) => b.status === "pending").length;
    const unread = (convs || []).reduce((n, c) => n + (c.owner_unread || 0), 0);
    const unreadNotifs = (notifs || []).filter((n) => !n.read).length;

    const setBadge = (id, n) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = n;
      el.style.display = n ? "" : "none";
    };
    setBadge("navLowStock", low);
    setBadge("navOrders", pendingOrders);
    setBadge("navBookings", pendingBookings);
    setBadge("navUnread", unread);
    setBadge("navNotifs", unreadNotifs);
    const dot = document.getElementById("bellDot");
    if (dot) dot.style.display = unreadNotifs ? "" : "none";
  } catch (e) {
    console.warn("badge refresh failed", e);
  }
}

let realtimeChannel = null;
function wireRealtime() {
  const shop = getShop();
  if (!shop || !supabase) return;
  if (realtimeChannel) return;

  realtimeChannel = supabase
    .channel(`workspace-${shop.id}`)
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "notifications", filter: `shop_id=eq.${shop.id}`,
    }, (payload) => {
      const n = payload.new;
      toast({ title: n.title, body: n.body || "", iconName: n.type === "low_stock" ? "alert" : n.type === "ai_escalation" ? "chatEscalate" : "bell", tone: n.type === "ai_escalation" ? "rose" : "gold" });
      refreshBadges();
    })
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "conversations", filter: `shop_id=eq.${shop.id}`,
    }, (payload) => {
      const c = payload.new;
      toast({ title: `New conversation from ${c.customer_name || c.customer_phone}`, body: c.last_message || "Customer messaged you", iconName: "chat" });
      refreshBadges();
    })
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "conversations", filter: `shop_id=eq.${shop.id}`,
    }, () => {
      refreshBadges();
    })
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "products", filter: `shop_id=eq.${shop.id}`,
    }, () => {
      refreshBadges();
    })
    .subscribe();
}

/* ============================================================
   Onboarding — create the shop (client-side with RLS)
   ============================================================ */
function initOnboarding() {
  const save = document.getElementById("o-save");
  if (!save) return;
  save.addEventListener("click", async () => {
    const name = document.getElementById("o-name").value.trim();
    const category = document.getElementById("o-cat").value;
    const currency = document.getElementById("o-currency").value;
    const phone = document.getElementById("o-phone").value.trim();
    const wa = document.getElementById("o-wa").value.trim();
    const language = document.getElementById("o-lang").value;
    const hours = document.getElementById("o-hours").value.trim();
    const address = document.getElementById("o-address").value.trim();
    const err = document.getElementById("onboardScreen").querySelector(".a-error");
    const clearErr = () => { if (err) err.style.display = "none"; };

    if (!name) { if (err) { err.textContent = "Shop name is required."; err.style.display = "block"; } return; }
    save.disabled = true;
    save.innerHTML = `<span class="spinner" aria-hidden="true"></span> Creating…`;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: shop, error: shopErr } = await supabase.from("shops").insert({
        owner_id: user.id, name, category, phone: phone || null,
        whatsapp_number: wa || null, language,
        currency, address: address || null,
        hours: hours ? { note: hours } : {},
      }).select().single();
      if (shopErr) throw new Error(shopErr.message);

      await supabase.from("settings").insert({
        shop_id: shop.id, currency, language, low_stock_threshold: 5,
      });
      await supabase.from("shop_members").insert({ shop_id: shop.id, user_id: user.id, role: "owner" });

      toast({ title: `${name} is live`, body: "Welcome to VyaparSathi — add your products next.", tone: "green", iconName: "checkCircle" });
      clearErr();
      enterConsole(shop);
    } catch (e) {
      if (err) { err.textContent = e.message || "Could not create the shop."; err.style.display = "block"; }
      save.disabled = false;
      save.innerHTML = save.dataset.restore || "Create my shop";
    }
  });
  document.getElementById("o-signout").addEventListener("click", async () => {
    await signOut();
    location.reload();
  });
}

/* ============================================================
   BOOT
   ============================================================ */
if (isApp) {
  if (!isConfigured) {
    document.getElementById("configScreen").style.display = "grid";
  } else {
    initAuth({ onAuthed: loadWorkspace });
    initOnboarding();
  }
} else {
  initLanding();
}
