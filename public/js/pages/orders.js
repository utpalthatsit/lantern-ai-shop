/* ============================================================
   ShopSathi — pages/orders.js
   Order lifecycle: pending → confirmed → processing →
   completed | cancelled. Create orders from real products,
   view details, update status. Real DB rows.
   ============================================================ */
import { db } from "../supabaseClient.js";
import { icon } from "../utils/constants.js";
import { money, relativeTime, esc, statusBadge } from "../utils/formatters.js";
import { openModal, closeModal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { loadingState, errorState, emptyState } from "../utils/ui.js";

const FLOW = ["pending", "confirmed", "processing", "completed"];
let all = [];
let status = "all";

export function init(root) {
  root.innerHTML = `
    <div class="page-head">
      <div><h2>Orders</h2><div class="desc">From request to completed</div></div>
      <div class="spacer"></div>
      <div class="seg">
        <button data-status="all" class="active">All</button>
        <button data-status="pending">Pending</button>
        <button data-status="confirmed">Confirmed</button>
        <button data-status="processing">Processing</button>
        <button data-status="completed">Completed</button>
        <button data-status="cancelled">Cancelled</button>
      </div>
      <button class="btn btn-gold" id="newOrderBtn">${icon("plus")} New order</button>
    </div>
    <div id="orderBody">${loadingState()}</div>`;
}

export async function render(root) {
  const body = root.querySelector("#orderBody");
  body.innerHTML = loadingState("Loading orders…");
  try {
    all = await db.orders({ status: status === "all" ? undefined : status });
    root.querySelectorAll(".seg [data-status]").forEach((b) => b.classList.toggle("active", b.dataset.status === status));

    if (!all.length) {
      body.innerHTML = emptyState("bag", status === "all" ? "No orders yet" : `No ${status} orders`, "Orders land here when customers place them or you create one.");
      return;
    }
    body.innerHTML = all.map((o) => `
      <article class="card order-card" data-id="${o.id}">
        <div class="o-top">
          <div>
            <div class="o-cust">${esc(o.customer_name)}</div>
            <div class="o-meta">${relativeTime(o.created_at)}${o.customer_phone ? ` · ${esc(o.customer_phone)}` : ""}</div>
          </div>
          <div class="row">${statusBadge(o.status)}<button class="btn-icon" data-view title="Details">${icon("eye")}</button></div>
        </div>
        <div class="o-items">
          ${(o.order_items || []).map((it) => `<span class="chip">${esc(it.name)} ×${it.quantity}</span>`).join("") || `<span class="faint small">No items</span>`}
        </div>
        <div class="o-foot">
          <span class="o-total">${money(o.total)}</span>
          <div class="row">
            ${o.status === "pending" ? `<button class="btn-soft btn" data-act="confirmed" style="padding:.45rem .9rem;font-size:.8rem">${icon("check")} Confirm</button>` : ""}
            ${o.status === "confirmed" ? `<button class="btn-soft btn" data-act="processing" style="padding:.45rem .9rem;font-size:.8rem">${icon("zap")} Start processing</button>` : ""}
            ${o.status === "processing" ? `<button class="btn-soft btn" data-act="completed" style="padding:.45rem .9rem;font-size:.8rem">${icon("checkCircle")} Complete</button>` : ""}
            ${["pending", "confirmed", "processing"].includes(o.status) ? `<button class="btn-icon danger" data-act="cancelled" title="Cancel order">${icon("x")}</button>` : ""}
          </div>
        </div>
      </article>`).join("");
  } catch (e) {
    console.error(e);
    body.innerHTML = errorState("Couldn't load orders: " + (e.message || e), true);
    body.querySelector("#errRetry")?.addEventListener("click", () => render(root));
  }
  bindActions(body);
}

function bindActions(body) {
  body.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => viewOrder(all.find((x) => x.id === b.closest(".order-card").dataset.id))));
  body.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
    const id = b.closest(".order-card").dataset.id;
    const next = b.dataset.act;
    if (next === "cancelled") {
      const { confirmDialog } = await import("../components/modal.js");
      const yes = await confirmDialog({ title: "Cancel this order?", body: "The order will be marked cancelled and its status locked.", confirmLabel: "Cancel order" });
      if (!yes) return;
    }
    try {
      await db.setOrderStatus(id, next);
      toast({ title: `Order → ${next}`, body: "Status updated.", tone: "green", iconName: "checkCircle" });
      render(document.getElementById("page-orders"));
    } catch (e) {
      toast({ title: "Could not update", body: e.message, tone: "rose", iconName: "alert" });
    }
  }));
}

export function bind(root) {
  root.querySelector("#newOrderBtn")?.addEventListener("click", () => openNewOrderModal(root));
  root.querySelectorAll(".seg [data-status]").forEach((b) => b.addEventListener("click", () => { status = b.dataset.status; render(root); }));
}

function viewOrder(o) {
  openModal({
    title: `Order for ${esc(o.customer_name)}`,
    width: "560px",
    body: `
      <div class="row" style="justify-content:space-between">
        <span>${statusBadge(o.status)}</span>
        <span class="faint small">${relativeTime(o.created_at)}</span>
      </div>
      <div class="divider"></div>
      <div class="stack">
        ${(o.order_items || []).map((it) => `
          <div class="row" style="justify-content:space-between">
            <span>${esc(it.name)} <span class="faint">×${it.quantity}</span></span>
            <span>${money(it.price * it.quantity)}</span>
          </div>`).join("")}
        <div class="row" style="justify-content:space-between;font-weight:650;border-top:1px solid var(--border);padding-top:.6rem">
          <span>Total</span><span>${money(o.total)}</span>
        </div>
      </div>
      ${o.notes ? `<p class="muted small" style="margin-top:.8rem">📝 ${esc(o.notes)}</p>` : ""}
      ${o.customer_phone ? `<p class="faint small" style="margin-top:.6rem">Customer phone: ${esc(o.customer_phone)}</p>` : ""}`,
  });
}

function openNewOrderModal(root) {
  const scrim = openModal({
    title: "New order",
    width: "640px",
    body: `
      <div class="row">
        <div class="field grow"><label>Customer name *</label><input class="input" id="o-name" placeholder="e.g. Neha Verma"></div>
        <div class="field grow"><label>Customer phone</label><input class="input" id="o-phone" type="tel" placeholder="+91 …"></div>
      </div>
      <div class="field"><label>Items</label><div id="o-lines"></div></div>
      <button class="btn btn-ghost" id="o-add-line" style="margin-top:.4rem">${icon("plus")} Add product</button>
      <div class="field" style="margin-top:.9rem"><label>Notes</label><input class="input" id="o-notes" placeholder="Anything the team should know"></div>`,
    foot: `<button class="btn btn-ghost" data-cancel>Cancel</button>
           <button class="btn btn-gold" id="o-save">${icon("check")} Create order</button>`,
    onMount: async (s) => {
      s.querySelector("[data-cancel]").addEventListener("click", () => s.remove());
      const products = await db.products({ active: true });
      const lines = s.querySelector("#o-lines");
      const addLine = (p, qty) => {
        const div = document.createElement("div");
        div.className = "row order-line";
        div.innerHTML = `
          <select class="select grow">${products.map((p2) => `<option value="${p2.id}" ${p2.id === p ? "selected" : ""}>${esc(p2.name)} (${money(p2.price)}${Number(p2.discount) ? ` -${p2.discount}%` : ""} · ${p2.stock} left)</option>`).join("")}</select>
          <input class="input" type="number" min="1" step="1" value="${qty || 1}" style="width:76px" aria-label="Quantity">
          <button class="btn-icon" data-rm aria-label="Remove">${icon("x")}</button>`;
        div.querySelector("[data-rm]").addEventListener("click", () => div.remove());
        lines.appendChild(div);
      };
      if (!products.length) {
        lines.innerHTML = `<p class="muted small">No active products yet — add some on the Products page first.</p>`;
        s.querySelector("#o-add-line").style.display = "none";
      } else {
        addLine(products[0].id, 1);
      }
      s.querySelector("#o-add-line")?.addEventListener("click", () => addLine(null, 1));
      s.querySelector("#o-save").addEventListener("click", async () => {
        const name = s.querySelector("#o-name").value.trim();
        const items = [...lines.querySelectorAll(".order-line")].map((l) => ({
          product_id: l.querySelector("select").value,
          quantity: Number(l.querySelector('input[type="number"]').value) || 1,
        })).filter((i) => i.product_id);
        try {
          await db.createOrder({ customer_name: name, customer_phone: s.querySelector("#o-phone").value.trim(), items, notes: s.querySelector("#o-notes").value.trim() });
          toast({ title: `Order created for ${name}`, body: "Status: pending", tone: "green", iconName: "checkCircle" });
          s.remove();
          render(root);
        } catch (e) {
          toast({ title: "Could not create order", body: e.message, tone: "rose", iconName: "alert" });
        }
      });
    },
  });
}
