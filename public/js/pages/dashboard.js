/* ============================================================
   ShopSathi — pages/dashboard.js
   Real stats from the database + AI owner briefing.
   ============================================================ */
import { db, getShop } from "../supabaseClient.js";
import { icon } from "../utils/constants.js";
import { money, relativeTime, statusBadge, esc } from "../utils/formatters.js";
import { loadingState, errorState, emptyState } from "../utils/ui.js";
import { toast } from "../components/toast.js";

export function init(root) {
  root.innerHTML = `<div id="dashBody">${loadingState("Gathering your shop's numbers…")}</div>`;
}

export async function render(root) {
  const body = root.querySelector("#dashBody");
  if (!body) { init(root); body = root.querySelector("#dashBody"); }
  body.innerHTML = loadingState("Crunching today's numbers…");

  try {
    const shop = getShop();
    const [productsList, customersList, ordersList, bookingsList, convs, notifs, logs, ratings] = await Promise.all([
      db.products(), db.customers(), db.orders(), db.bookings(), db.conversations(), db.notifications(8),
      db.aiLogs(200).catch(() => []),
      db.ratings(12).catch(() => []),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const ordersToday = (ordersList || []).filter((o) => (o.created_at || "").slice(0, 10) === today);
    const completedToday = ordersToday.filter((o) => o.status === "completed");
    const revenueToday = completedToday.reduce((s, o) => s + Number(o.total || 0), 0);
    const lowStock = (productsList || []).filter((p) => p.stock <= p.low_stock_threshold);
    const pendingBookings = (bookingsList || []).filter((b) => b.status === "pending");
    const unreadNotifs = (notifs || []).filter((n) => !n.read);
    const aiToday = (logs || []).filter((l) => (l.created_at || "").slice(0, 10) === today).length;
    const ratingAvg = (ratings || []).length
      ? Math.round(((ratings || []).reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10 : 0;

    const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

    const stat = (label, value, ico, sub = "") => `
      <div class="card stat-card">
        <span class="s-label">${label}</span>
        <span class="s-value">${value}</span>
        ${sub ? `<span class="s-delta up" style="color:var(--text-dim);font-weight:500">${sub}</span>` : ""}
        <span class="s-ico">${icon(ico)}</span>
      </div>`;

    body.innerHTML = `
      <div class="page-head">
        <div><h2>Dashboard</h2><div class="desc">${shop ? esc(shop.name) : ""} · ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</div></div>
        <div class="spacer"></div>
        <button class="btn btn-ghost" id="dashRefresh">${icon("refresh")} Refresh</button>
      </div>

      <div class="stat-grid" style="margin-bottom:1.2rem">
        ${stat("Customers", (customersList || []).length, "users", "total in your book")}
        ${stat("Products", (productsList || []).length, "tag", `${lowStock.length} low on stock`)}
        ${stat("Orders today", ordersToday.length, "bag", `${money(revenueToday, shop?.currency)} completed`)}
        ${stat("Pending bookings", pendingBookings.length, "calendar", `${aiToday} AI actions today`)}
      </div>

      <div class="dash-grid">
        <div class="card panel">
          <div class="panel-head"><h3>Recent conversations</h3><div class="spacer"></div><a href="#conversations" data-go="conversations" class="small" style="color:var(--amber)">Open →</a></div>
          <div class="panel-body" style="padding:0">
            ${(convs || []).slice(0, 6).map((c) => `
              <div class="row-item" data-go="conversations" style="cursor:pointer">
                <span class="ava sm g${(c.customer_phone || "0").length % 6}">${esc((c.customer_name || c.customer_phone || "?")[0])}</span>
                <div class="r-main">
                  <div class="r-title">${esc(c.customer_name || c.customer_phone)}</div>
                  <div class="r-sub">${esc(c.last_message || "—")}</div>
                </div>
                <span class="r-right"><time class="faint small">${relativeTime(c.last_message_at)}</time>${c.owner_unread ? `<span class="unread-dot"></span>` : ""}</span>
              </div>`).join("") || emptyState("chat", "No conversations yet", "Customer messages land here in real time.")}
          </div>
        </div>

        <div class="card panel">
          <div class="panel-head"><h3>Recent orders</h3><div class="spacer"></div><a href="#orders" data-go="orders" class="small" style="color:var(--amber)">Open →</a></div>
          <div class="panel-body" style="padding:0">
            ${(ordersList || []).slice(0, 6).map((o) => `
              <div class="row-item" data-go="orders" style="cursor:pointer">
                <span class="r-main">
                  <div class="r-title">${esc(o.customer_name)}</div>
                  <div class="r-sub">${relativeTime(o.created_at)} · ${money(o.total, shop?.currency)}</div>
                </span>
                <span class="r-right">${statusBadge(o.status)}</span>
              </div>`).join("") || emptyState("bag", "No orders yet", "Orders appear here once customers place them.")}
          </div>
        </div>

        <div class="card panel">
          <div class="panel-head"><h3>Customer ratings</h3><div class="spacer"></div>${ratings.length ? `<span class="small" style="color:var(--amber)">★ ${ratingAvg.toFixed(1)} · ${ratings.length}</span>` : ""}</div>
          <div class="panel-body" style="padding:0">
            ${(ratings || []).slice(0, 6).map((r) => `
              <div class="row-item">
                <span class="r-main">
                  <div class="r-title">${esc(r.customer_name || "Customer")} <span style="color:#e8a33d">${stars(r.rating)}</span></div>
                  <div class="r-sub">${esc(r.comment || "—")} · ${relativeTime(r.created_at)}</div>
                </span>
              </div>`).join("") || emptyState("sparkle", "No ratings yet", "Customer ratings from the storefront appear here.")}
          </div>
        </div>

        <div class="card panel">
          <div class="panel-head"><h3>Low stock</h3><div class="spacer"></div><a href="#inventory" data-go="inventory" class="small" style="color:var(--amber)">Open →</a></div>
          <div class="panel-body" style="padding:0">
            ${lowStock.slice(0, 6).map((p) => `
              <div class="row-item" data-go="inventory" style="cursor:pointer">
                <span class="r-main">
                  <div class="r-title">${esc(p.name)}</div>
                  <div class="r-sub">threshold ${p.low_stock_threshold}</div>
                </span>
                <span class="r-right"><span class="badge ${p.stock === 0 ? "danger" : "gold"}">${p.stock} left</span></span>
              </div>`).join("") || emptyState("package", "All stocked up", "Products that dip below their threshold appear here.")}
          </div>
        </div>

        <div class="card panel">
          <div class="panel-head"><h3>Notifications</h3><div class="spacer"></div><a href="#notifications" data-go="notifications" class="small" style="color:var(--amber)">Open →</a></div>
          <div class="panel-body" style="padding:0">
            ${(notifs || []).map((n) => `
              <div class="row-item" style="${n.read ? "opacity:.55" : ""}">
                <span class="r-main">
                  <div class="r-title">${esc(n.title)}</div>
                  <div class="r-sub">${relativeTime(n.created_at)}${n.body ? ` · ${esc(n.body.slice(0, 60))}` : ""}</div>
                </span>
                ${n.read ? "" : `<span class="unread-dot"></span>`}
              </div>`).join("") || emptyState("bell", "No notifications", "Alerts for orders, bookings and stock appear here.")}
          </div>
        </div>
      </div>`;

    body.querySelectorAll("[data-go]").forEach((el) => {
      el.addEventListener("click", () => { location.hash = el.dataset.go; });
    });
    body.querySelector("#dashRefresh").addEventListener("click", () => render(root));

    // AI briefing loads async — never blocks the dashboard stats.
    db.businessSummary().then((summary) => {
      if (!summary || !summary.summary || body.querySelector(".summary-card")) return;
      const wrap = document.createElement("div");
      wrap.innerHTML = `<div class="card summary-card hairline" style="margin-bottom:1.2rem">
        <div class="sc-orb"></div>
        <div class="sc-head">${icon("brain")} Today's briefing ${summary.claude ? "" : `<span class="badge" style="margin-left:.4rem">live numbers</span>`}</div>
        <blockquote class="display" style="font-size:1.1rem;line-height:1.5">${esc(summary.summary)}</blockquote>
      </div>`;
      const head = body.querySelector(".page-head");
      if (head) head.after(wrap.firstChild);
    }).catch(() => {});
  } catch (e) {
    console.error(e);
    body.innerHTML = errorState("Couldn't load the dashboard: " + (e.message || e), true);
    body.querySelector("#errRetry")?.addEventListener("click", () => render(root));
  }
}
