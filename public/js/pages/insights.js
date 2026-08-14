/* ============================================================
   Lantern — pages/insights.js
   ============================================================ */
import { db } from "../supabaseClient.js";
import { icon } from "../utils/constants.js";
import { inr, pctChange } from "../utils/formatters.js";
import { toast } from "../components/toast.js";

export async function renderInsights() {
  const data = await db.insights();
  if (!data) return;
  const root = document.getElementById("page-insights");
  if (!root) return;

  const revDelta = pctChange(data.metrics.revenue, data.prevWeekRevenue);
  const ordDelta = pctChange(data.metrics.orders, data.prevWeekOrders);
  const maxRev = Math.max(...data.week.map((d) => d.value));

  root.innerHTML = `
    <div class="page-head">
      <div><h2>Insights</h2><div class="desc">What Lantern noticed while you were busy</div></div>
      <div class="spacer"></div>
      <span class="badge gold"><span class="badge-dot"></span>Today · ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long" })}</span>
    </div>

    <div class="card summary-card hairline" style="margin-bottom:1.2rem">
      <div class="sc-orb"></div>
      <div class="sc-head">${icon("brain")} Lantern's daily briefing</div>
      <blockquote class="display">${data.summary}</blockquote>
      <div class="sc-tags">
        <span class="badge gold">${icon("trend")} Revenue ${inr(data.metrics.revenue)}</span>
        <span class="badge teal">${icon("chat")} ${data.metrics.orders} orders</span>
        <span class="badge violet">${icon("zap")} Top item: ${data.metrics.topItem}</span>
        <span class="badge">${icon("clock")} Peak: ${data.metrics.peakHour}</span>
      </div>
    </div>

    <div class="stat-grid" style="margin-bottom:1.2rem">
      <div class="card stat-card">
        <span class="s-label">Revenue</span>
        <span class="s-value">${inr(data.metrics.revenue)}</span>
        <span class="s-delta ${revDelta >= 0 ? "up" : "down"}">${icon(revDelta >= 0 ? "arrowUp" : "arrowDown")} ${Math.abs(revDelta)}% vs last week</span>
        <span class="s-ico">${icon("trend")}</span>
      </div>
      <div class="card stat-card">
        <span class="s-label">Orders</span>
        <span class="s-value">${data.metrics.orders}</span>
        <span class="s-delta ${ordDelta >= 0 ? "up" : "down"}">${icon(ordDelta >= 0 ? "arrowUp" : "arrowDown")} ${Math.abs(ordDelta)}% vs last week</span>
        <span class="s-ico">${icon("chat")}</span>
      </div>
      <div class="card stat-card">
        <span class="s-label">Top seller</span>
        <span class="s-value" style="font-size:1.35rem">${data.metrics.topItem}</span>
        <span class="s-delta up">${icon("zap")} 3× the runner-up</span>
        <span class="s-ico">${icon("sparkle")}</span>
      </div>
      <div class="card stat-card">
        <span class="s-label">Peak hour</span>
        <span class="s-value" style="font-size:1.35rem">${data.metrics.peakHour}</span>
        <span class="s-delta up">${icon("clock")} best staffed window</span>
        <span class="s-ico">${icon("clock")}</span>
      </div>
    </div>

    <div class="row" style="align-items:stretch;gap:1.2rem;flex-wrap:wrap">
      <div class="card grow" style="min-width:320px">
        <div class="panel-head"><h3>This week</h3><div class="spacer"></div><span class="badge">7 days</span></div>
        <div class="chart-wrap">
          <div class="bar-chart" id="weekChart">
            ${data.week.map((d) => `
              <div class="bar-col">
                <span class="val ${d.value === maxRev ? "hl" : ""}">${Math.round(d.value / 1000)}k</span>
                <div class="bar ${d.value === maxRev ? "hl" : ""}" style="height:${Math.round((d.value / maxRev) * 100)}%"></div>
                <span class="lbl">${d.day}</span>
              </div>`).join("")}
          </div>
          <div class="chart-legend">
            <span><i style="background:linear-gradient(180deg,#f7c96b,#ff8a3d)"></i>Revenue (₹)</span>
            <span>Saturday is your peak — consider a weekend-only special</span>
          </div>
        </div>
      </div>

      <div class="card" style="min-width:300px;flex:1">
        <div class="panel-head"><h3>Best sellers</h3><div class="spacer"></div><span class="badge gold">this week</span></div>
        <div class="best-list">
          ${data.bestSellers.map((b, i) => {
            const pct = Math.round((b.count / data.bestSellers[0].count) * 100);
            return `
              <div class="best-row">
                <span class="rank ${i === 0 ? "top" : ""}">${i + 1}</span>
                <span class="b-name">${b.name}</span>
                <span class="b-count">${b.count} sold</span>
                <span class="b-bar"><i style="width:${pct}%"></i></span>
              </div>`;
          }).join("")}
        </div>
      </div>
    </div>

    <div class="card suggest-card" style="margin-top:1.2rem">
      <div class="s-ico">${icon("sparkle")}</div>
      <div class="s-text">
        <b>Tuesday is your slowest day.</b>
        <span>Lantern can draft a “breakfast bowl + coffee” promo and broadcast it to 214 regulars on Monday night.</span>
      </div>
      <a class="btn btn-gold" href="#marketing" data-goto="marketing">${icon("sparkle")} Draft it</a>
    </div>`;

  root.querySelector("[data-goto]")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.hash = "marketing";
  });

  /* animate bars on reveal */
  requestAnimationFrame(() => {
    root.querySelectorAll(".bar").forEach((el) => {
      const h = el.style.height;
      el.style.height = "0%";
      requestAnimationFrame(() => { el.style.height = h; });
    });
  });
}

export function bindInsightsEvents() {
  /* nothing persistent — action is the "Draft it" CTA */
  document.querySelectorAll("[data-refresh-insight]").forEach((b) => {
    b.addEventListener("click", async () => {
      toast({ title: "Refreshing briefing", body: "Lantern is crunching today's numbers…", iconName: "refreshCw" });
      renderInsights();
    });
  });
}
