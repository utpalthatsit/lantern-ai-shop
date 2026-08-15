/* ============================================================
   ShopSathi — pages/inventory.js
   Stock levels, +/- adjustments with reason + history log,
   low-stock alerts. Negative stock is impossible (db + client).
   ============================================================ */
import { db } from "../supabaseClient.js";
import { icon } from "../utils/constants.js";
import { money, relativeTime, esc } from "../utils/formatters.js";
import { openModal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { loadingState, errorState, emptyState } from "../utils/ui.js";

let all = [];
let view = "all"; // all | low | out

export function init(root) {
  root.innerHTML = `
    <div class="page-head">
      <div><h2>Inventory</h2><div class="desc">Stock, adjustments & history</div></div>
      <div class="spacer"></div>
      <div class="seg">
        <button data-view="all" class="active">All</button>
        <button data-view="low">Low stock</button>
        <button data-view="out">Out</button>
      </div>
    </div>
    <div id="invBody">${loadingState()}</div>`;
}

export async function render(root) {
  const body = root.querySelector("#invBody");
  body.innerHTML = loadingState("Reading stock levels…");
  try {
    const [products, history] = await Promise.all([db.products(), db.inventoryHistory()]);
    all = products;
    root.querySelectorAll(".seg [data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view));

    const list = all.filter((p) => view === "low" ? (p.stock > 0 && p.stock <= p.low_stock_threshold) : view === "out" ? p.stock === 0 : true);

    body.innerHTML = `
      <div class="inv-cols">
        <div class="inv-left">
          ${list.length ? list.map((p) => {
            const status = p.stock === 0 ? "out" : p.stock <= p.low_stock_threshold ? "low" : "ok";
            const pct = Math.min(100, Math.round((p.stock / Math.max(1, p.low_stock_threshold * 4)) * 100));
            return `
            <div class="card item-card ${status === "low" ? "low" : ""} ${status === "out" ? "out" : ""}" data-id="${p.id}">
              <div class="i-top">
                <div class="prod-emoji">${icon("package")}</div>
                <span class="badge ${status === "ok" ? "green" : status === "low" ? "gold" : "danger"}"><span class="badge-dot"></span>${status === "ok" ? "In stock" : status === "low" ? "Low stock" : "Out of stock"}</span>
              </div>
              <div>
                <div class="i-name">${esc(p.name)}</div>
                <div class="i-sku">${esc(p.sku || "—")} · ${money(p.price)}</div>
              </div>
              <div class="stock-bar"><i style="width:${Math.max(4, pct)}%"></i></div>
              <div class="i-foot">
                <div class="qty-controls">
                  <button data-q="-1" aria-label="decrease">${icon("minus")}</button>
                  <span class="q">${p.stock}</span>
                  <button data-q="1" aria-label="increase">${icon("plus")}</button>
                </div>
                <button class="btn btn-ghost" data-adjust style="padding:.45rem .9rem;font-size:.8rem">${icon("edit")} Adjust</button>
              </div>
            </div>`;
          }).join("") : emptyState("package", view === "all" ? "No products yet" : "Nothing matches", "Add products in Products, then manage stock here.")}
        </div>
        <div class="card panel inv-history">
          <div class="panel-head"><h3>Stock history</h3><div class="spacer"></div><span class="badge">last ${Math.min(50, history.length)}</span></div>
          <div class="panel-body" style="padding:0">
            ${history.slice(0, 50).map((h) => `
              <div class="row-item">
                <span class="r-main">
                  <div class="r-title">${esc(h.products?.name || "Product")}</div>
                  <div class="r-sub">${relativeTime(h.created_at)} · ${esc(h.reason || "manual")}${h.note ? ` · ${esc(h.note)}` : ""}</div>
                </span>
                <span class="badge ${h.change > 0 ? "green" : "rose"}">${h.change > 0 ? "+" : ""}${h.change}</span>
              </div>`).join("") || emptyState("refresh", "No stock changes yet")}
          </div>
        </div>
      </div>`;

    body.querySelectorAll("[data-q]").forEach((btn) => btn.addEventListener("click", () => adjust(btn.closest(".item-card").dataset.id, Number(btn.dataset.q), "counter", root)));
    body.querySelectorAll("[data-adjust]").forEach((btn) => btn.addEventListener("click", () => openAdjustModal(all.find((x) => x.id === btn.closest(".item-card").dataset.id), root)));
  } catch (e) {
    console.error(e);
    body.innerHTML = errorState("Couldn't load inventory: " + (e.message || e), true);
    body.querySelector("#errRetry")?.addEventListener("click", () => render(root));
  }
}

export function bind(root) {
  root.querySelectorAll(".seg [data-view]").forEach((b) => b.addEventListener("click", () => { view = b.dataset.view; render(root); }));
}

async function adjust(id, delta, reason, root) {
  const p = all.find((x) => x.id === id);
  try {
    await db.adjustStock(id, delta, reason);
    toast({ title: delta > 0 ? `+${delta} ${p.name}` : `${delta} ${p.name}`, body: "Stock updated.", tone: "green", iconName: "checkCircle" });
    render(root);
  } catch (e) {
    toast({ title: "Can't adjust", body: e.message, tone: "rose", iconName: "alert" });
  }
}

function openAdjustModal(p, root) {
  openModal({
    title: `Adjust stock — ${p.name}`,
    body: `
      <p class="muted small">Current: <b>${p.stock}</b> · Low-stock alert at ${p.low_stock_threshold}</p>
      <div class="row" style="margin-top:.9rem">
        <div class="field" style="width:140px"><label>Change</label><input class="input" id="a-qty" type="number" step="1" placeholder="e.g. 10 or -2"></div>
        <div class="field grow"><label>Reason</label>
          <select class="select" id="a-reason">
            <option value="restock">Restock / purchase</option>
            <option value="sale">Sold / used</option>
            <option value="damage">Damaged / expired</option>
            <option value="return">Returned</option>
            <option value="manual">Manual count</option>
          </select></div>
      </div>
      <div class="field" style="margin-top:.9rem"><label>Note (optional)</label><input class="input" id="a-note" placeholder="e.g. supplier delivery #42"></div>`,
    foot: `<button class="btn btn-ghost" data-cancel>Cancel</button>
           <button class="btn btn-gold" id="a-save">Apply change</button>`,
    onMount: (scrim) => {
      scrim.querySelector("[data-cancel]").addEventListener("click", () => scrim.remove());
      scrim.querySelector("#a-save").addEventListener("click", async () => {
        const qty = Number(scrim.querySelector("#a-qty").value);
        if (!Number.isInteger(qty) || qty === 0) { toast({ title: "Enter a non-zero whole number", tone: "rose", iconName: "alert" }); return; }
        try {
          await db.adjustStock(p.id, qty, scrim.querySelector("#a-reason").value, scrim.querySelector("#a-note").value.trim());
          toast({ title: "Stock updated", body: `${p.name} is now ${p.stock + qty}`, tone: "green", iconName: "checkCircle" });
          scrim.remove();
          render(root);
        } catch (e) {
          toast({ title: "Can't adjust", body: e.message, tone: "rose", iconName: "alert" });
        }
      });
    },
  });
}
