/* ============================================================
   ShopSathi — pages/notifications.js
   In-app notifications: low stock, new orders, new bookings,
   booking reminders, customer messages, AI escalations.
   Owner marks them read.
   ============================================================ */
import { db } from "../supabaseClient.js";
import { icon } from "../utils/constants.js";
import { relativeTime, esc } from "../utils/formatters.js";
import { toast } from "../components/toast.js";
import { loadingState, errorState, emptyState } from "../utils/ui.js";

const TYPE_META = {
  low_stock: { icon: "alert", cls: "gold" },
  new_order: { icon: "bag", cls: "teal" },
  order_status: { icon: "refresh", cls: "violet" },
  new_booking: { icon: "calendar", cls: "teal" },
  booking_reminder: { icon: "bell", cls: "gold" },
  customer_message: { icon: "chat", cls: "teal" },
  ai_escalation: { icon: "chatEscalate", cls: "rose" },
  system: { icon: "info", cls: "" },
};

export function init(root) {
  root.innerHTML = `
    <div class="page-head">
      <div><h2>Notifications</h2><div class="desc">What needs your attention</div></div>
      <div class="spacer"></div>
      <button class="btn btn-ghost" id="markAllBtn">${icon("check")} Mark all read</button>
    </div>
    <div id="notifBody">${loadingState()}</div>`;
}

export async function render(root) {
  const body = root.querySelector("#notifBody");
  body.innerHTML = loadingState("Loading notifications…");
  try {
    const notifs = await db.notifications(100);
    root.querySelector("#markAllBtn").style.display = notifs.some((n) => !n.read) ? "" : "none";
    if (!notifs.length) {
      body.innerHTML = emptyState("bell", "No notifications", "Alerts appear here for orders, bookings, low stock and escalations.");
      return;
    }
    body.innerHTML = notifs.map((n) => {
      const m = TYPE_META[n.type] || TYPE_META.system;
      return `
      <div class="card notif-card ${n.read ? "read" : ""}" data-id="${n.id}">
        <span class="n-icon ${m.cls}">${icon(m.icon)}</span>
        <div class="n-main">
          <div class="n-title">${esc(n.title)}</div>
          ${n.body ? `<div class="n-body">${esc(n.body)}</div>` : ""}
          <div class="faint small" style="margin-top:.2rem">${relativeTime(n.created_at)}</div>
        </div>
        ${n.read ? "" : `<button class="btn btn-ghost" data-read style="padding:.4rem .8rem;font-size:.78rem">Mark read</button>`}
      </div>`;
    }).join("");

    body.querySelectorAll("[data-read]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.closest(".notif-card").dataset.id;
      await db.markNotificationRead(id, true);
      toast({ title: "Marked as read", iconName: "check", tone: "green" });
      render(root);
    }));
    root.querySelector("#markAllBtn").addEventListener("click", async () => {
      await db.markAllNotificationsRead();
      toast({ title: "All caught up", iconName: "checkCircle", tone: "green" });
      render(root);
    });
  } catch (e) {
    console.error(e);
    body.innerHTML = errorState("Couldn't load notifications: " + (e.message || e), true);
    body.querySelector("#errRetry")?.addEventListener("click", () => render(root));
  }
}

export function bind(root) { /* events bound in render */ }
