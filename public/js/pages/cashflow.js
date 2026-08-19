/* ============================================================
   VyaparSathi — pages/cashflow.js
   Cash flow forecasting & payment reminders dashboard.
   Shows: 7/14/30 day forecast, outstanding payments,
   payment reminder management, cash flow entries.
   ============================================================ */
import { db, getShop } from "../supabaseClient.js";
import { icon } from "../utils/constants.js";
import { money, esc, relativeTime, fullDate } from "../utils/formatters.js";
import { openModal, confirmDialog } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { loadingState, errorState, emptyState } from "../utils/ui.js";

let forecast = null;
let reminders = [];
let entries = [];
let activeTab = "forecast";

export function init(root) {
  root.innerHTML = `
    <div class="page-head">
      <div><h2>Cash Flow</h2><div class="desc">Forecast your finances & track payments</div></div>
      <div class="spacer"></div>
      <div class="seg">
        <button data-tab="forecast" class="active">Forecast</button>
        <button data-tab="reminders">Payment Reminders</button>
        <button data-tab="entries">Recurring Entries</button>
      </div>
    </div>
    <div id="cfBody">${loadingState("Loading cash flow data…")}</div>`;
}

export async function render(root) {
  const body = root.querySelector("#cfBody");
  body.innerHTML = loadingState("Crunching numbers…");

  root.querySelectorAll(".seg [data-tab]").forEach((b) => {
    b.addEventListener("click", () => {
      activeTab = b.dataset.tab;
      root.querySelectorAll(".seg [data-tab]").forEach((x) => x.classList.toggle("active", x.dataset.tab === activeTab));
      renderTab(body);
    });
  });

  try {
    const shop = getShop();
    [forecast, reminders, entries] = await Promise.all([
      db.cashFlowForecast(30).catch(() => null),
      db.paymentReminders().catch(() => []),
      db.cashFlowEntries().catch(() => []),
    ]);
    renderTab(body);
  } catch (e) {
    console.error(e);
    body.innerHTML = errorState("Couldn't load cash flow: " + (e.message || e), true);
    body.querySelector("#errRetry")?.addEventListener("click", () => render(root));
  }
}

function renderTab(body) {
  if (activeTab === "forecast") renderForecast(body);
  else if (activeTab === "reminders") renderReminders(body);
  else renderEntries(body);
}

/* ============================================================
   FORECAST TAB
   ============================================================ */
function renderForecast(body) {
  if (!forecast) {
    body.innerHTML = `
      <div class="card panel" style="margin-bottom:1.2rem">
        <div class="panel-head"><h3>${icon("chart")} Cash Flow Forecast</h3></div>
        <div class="panel-body stack">
          <p class="muted small">Generate a forecast from your real billing data, payment reminders, and recurring entries.</p>
          <button class="btn btn-gold" id="genForecastBtn">${icon("sparkle")} Generate forecast</button>
        </div>
      </div>`;
    body.querySelector("#genForecastBtn")?.addEventListener("click", async () => {
      body.innerHTML = loadingState("Generating forecast…");
      try {
        forecast = await db.cashFlowForecast(30);
        renderForecast(body);
      } catch (e) {
        body.innerHTML = errorState("Could not generate forecast: " + (e.message || e), true);
        body.querySelector("#errRetry")?.addEventListener("click", () => renderForecast(body));
      }
    });
    return;
  }

  const shop = getShop();
  const s = forecast.summary || {};
  const cur = shop?.currency === "INR" ? "₹" : `${shop?.currency || ""} `;

  body.innerHTML = `
    <div class="card panel" style="margin-bottom:1.2rem">
      <div class="panel-head">
        <h3>${icon("sparkle")} AI Summary</h3>
        <span class="badge ${forecast.ai ? "teal" : ""}">${forecast.ai ? "AI-powered" : "Live numbers"}</span>
      </div>
      <div class="panel-body">
        <blockquote class="display" style="font-size:1rem;line-height:1.6">${esc(forecast.narrative || "No summary available.")}</blockquote>
        <div class="faint small" style="margin-top:.5rem">Next ${forecast.days || 30} days · Generated ${new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</div>
      </div>
    </div>

    <div class="stat-grid" style="margin-bottom:1.2rem">
      <div class="card stat-card">
        <span class="s-label">Expected Income</span>
        <span class="s-value" style="color:#2e8b57">${money(s.total_income, shop?.currency)}</span>
        <span class="s-ico" style="color:#2e8b57">${icon("arrowUp")}</span>
      </div>
      <div class="card stat-card">
        <span class="s-label">Expected Expenses</span>
        <span class="s-value" style="color:var(--rose)">${money(s.total_expense, shop?.currency)}</span>
        <span class="s-ico" style="color:var(--rose)">${icon("arrowDown")}</span>
      </div>
      <div class="card stat-card">
        <span class="s-label">Net Cash Flow</span>
        <span class="s-value" style="color:${s.net_flow >= 0 ? "#2e8b57" : "var(--rose)"}">${money(s.net_flow, shop?.currency)}</span>
        <span class="s-ico">${s.net_flow >= 0 ? icon("trend") : icon("alert")}</span>
      </div>
      <div class="card stat-card">
        <span class="s-label">Receivables</span>
        <span class="s-value" style="color:var(--amber)">${money(s.total_receivables, shop?.currency)}</span>
        <span class="s-ico" style="color:var(--amber)">${icon("bag")}</span>
      </div>
    </div>

    <div class="dash-grid">
      ${forecast.receivables?.length ? `
      <div class="card panel">
        <div class="panel-head"><h3>${icon("bag")} Outstanding Receivables</h3><span class="badge gold">${forecast.receivables.length}</span></div>
        <div class="panel-body" style="padding:0">
          ${forecast.receivables.map((r) => `
            <div class="row-item">
              <span class="r-main">
                <div class="r-title">${esc(r.customer)}</div>
                <div class="r-sub">Due ${r.due ? fullDate(r.due) : "—"}</div>
              </span>
              <span class="r-right"><span class="badge gold">${money(r.amount, shop?.currency)}</span></span>
            </div>`).join("")}
        </div>
      </div>` : ""}

      ${forecast.payables?.length ? `
      <div class="card panel">
        <div class="panel-head"><h3>${icon("clock")} Upcoming Payments</h3><span class="badge rose">${forecast.payables.length}</span></div>
        <div class="panel-body" style="padding:0">
          ${forecast.payables.map((p) => `
            <div class="row-item">
              <span class="r-main">
                <div class="r-title">${esc(p.to)}</div>
                <div class="r-sub">Due ${p.due ? fullDate(p.due) : "—"} · ${p.type === "outgoing" ? "You owe" : "They owe you"}</div>
              </span>
              <span class="r-right"><span class="badge ${p.type === "outgoing" ? "rose" : "teal"}">${money(p.amount, shop?.currency)}</span></span>
            </div>`).join("")}
        </div>
      </div>` : ""}

      <div class="card panel">
        <div class="panel-head"><h3>${icon("chart")} Daily Breakdown</h3></div>
        <div class="panel-body" style="padding:0">
          ${(forecast.daily || []).slice(0, 14).map((d) => `
            <div class="row-item">
              <span class="r-main">
                <div class="r-title">${new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</div>
                <div class="r-sub">
                  <span style="color:#2e8b57">+${money(d.income, shop?.currency)}</span>
                  ${d.expense > 0 ? ` <span style="color:var(--rose)">−${money(d.expense, shop?.currency)}</span>` : ""}
                </div>
              </span>
              <span class="r-right"><span class="badge ${d.balance >= 0 ? "green" : "danger"}">${money(d.balance, shop?.currency)}</span></span>
            </div>`).join("") || emptyState("chart", "No data yet", "Complete orders and ad
