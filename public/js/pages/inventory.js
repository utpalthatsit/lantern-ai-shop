/* ============================================================
   Lantern — pages/inventory.js
   ============================================================ */
import { db } from "../supabaseClient.js";
import { icon } from "../utils/constants.js";
import { inr, esc } from "../utils/formatters.js";
import { openModal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { isPrice, isQty } from "../utils/validators.js";

const EMOJIS = ["🧋", "🥤", "🥐", "🥑", "🍰", "🥣", "🍌", "🫖", "☕", "🍪", "🧁", "🥪", "🍩", "🧃", "📦"];
let items = [];

export async function renderInventory() {
  items = await db.inventory();
  const grid = document.getElementById("invGrid");
  if (!grid) return;
  grid.innerHTML = items.map((it) => {
    const status = it.quantity === 0 ? "out" : it.quantity <= it.low_stock_threshold ? "low" : "ok";
    const pct = Math.max(4, Math.min(100, Math.round((it.quantity / (it.low_stock_threshold * 4)) * 100)));
    return `
      <article class="card item-card ${status === "low" ? "low" : ""} ${status === "out" ? "out" : ""}" data-id="${it.id}">
        <div class="i-top">
          <div class="i-emoji">${esc(it.emoji)}</div>
          <span class="badge ${status === "ok" ? "green" : status === "low" ? "gold" : "danger"}">
            <span class="badge-dot"></span>${status === "ok" ? "In stock" : status === "low" ? "Low stock" : "Out"}
          </span>
        </div>
        <div>
          <div class="i-name">${esc(it.name)}</div>
          <div class="i-sku">${esc(it.sku)}</div>
        </div>
        <div class="i-price">${inr(it.price)}</div>
        <div class="stock-bar"><i style="width:${pct}%"></i></div>
        <div class="i-foot">
          <div class="qty-controls">
            <button data-q="-1" aria-label="decrease">${icon("minus")}</button>
            <span class="q">${it.quantity}</span>
            <button data-q="1" aria-label="increase">${icon("plus")}</button>
          </div>
          <button class="btn-icon" data-edit aria-label="Edit">${icon("edit")}</button>
        </div>
      </article>`;
  }).join("") || `<div class="empty">${icon("box")}<p>Nothing on the shelf yet. Add your first item.</p></div>`;

  grid.querySelectorAll("[data-q]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = btn.closest(".item-card");
      const it = await db.adjustQty(card.dataset.id, Number(btn.dataset.q));
      if (it.quantity <= it.low_stock_threshold && it.quantity > 0) {
        toast({ title: `${it.name} is low`, body: `${it.quantity} left — restock soon.`, tone: "gold", iconName: "alert" });
      }
      renderInventory();
      updateLowStockBadge();
    });
  });

  grid.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const it = items.find((x) => x.id === btn.closest(".item-card").dataset.id);
      openItemModal(it);
    });
  });
  updateLowStockBadge();
}

export function bindInventoryEvents() {
  document.getElementById("addItemBtn")?.addEventListener("click", () => openItemModal(null));
  document.getElementById("invSearch")?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(".item-card").forEach((card) => {
      card.style.display = card.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  });
}

function openItemModal(item) {
  const isEdit = !!item;
  openModal({
    title: isEdit ? "Edit item" : "Add an item",
    body: `
      <div class="field"><label>Emoji</label>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap" id="emojiPick">
          ${EMOJIS.map((e, i) => `<button type="button" class="chip ${!isEdit && i === 0 ? "active" : ""}" data-e="${e}">${e}</button>`).join("")}
        </div></div>
      <div class="field"><label>Item name</label><input class="input" id="f-name" value="${isEdit ? esc(item.name) : ""}" placeholder="e.g. Cold Brew"></div>
      <div class="row">
        <div class="field grow"><label>SKU</label><input class="input" id="f-sku" value="${isEdit ? esc(item.sku) : ""}" placeholder="DRK-002"></div>
        <div class="field" style="width:130px"><label>Price (₹)</label><input class="input" id="f-price" type="number" value="${isEdit ? item.price : ""}" placeholder="190"></div>
      </div>
      <div class="row">
        <div class="field" style="width:140px"><label>Quantity</label><input class="input" id="f-qty" type="number" value="${isEdit ? item.quantity : ""}" placeholder="10"></div>
        <div class="field grow"><label>Low-stock alert at</label><input class="input" id="f-thresh" type="number" value="${isEdit ? item.low_stock_threshold : 5}" placeholder="5"></div>
      </div>`,
    foot: `<button class="btn btn-ghost" data-cancel>Cancel</button>
           <button class="btn btn-gold" id="saveItem">${isEdit ? "Save changes" : "Add item"}</button>`,
    onMount: (scrim) => {
      let emoji = isEdit ? item.emoji : EMOJIS[0];
      scrim.querySelectorAll("[data-e]").forEach((b) => b.addEventListener("click", () => {
        emoji = b.dataset.e;
        scrim.querySelectorAll("[data-e]").forEach((x) => x.classList.toggle("active", x === b));
      }));
      scrim.querySelector("[data-cancel]").addEventListener("click", () => scrim.remove());
      scrim.querySelector("#saveItem").addEventListener("click", async () => {
        const name = scrim.querySelector("#f-name").value.trim();
        const sku = scrim.querySelector("#f-sku").value.trim();
        const price = scrim.querySelector("#f-price").value;
        const qty = scrim.querySelector("#f-qty").value;
        const thresh = scrim.querySelector("#f-thresh").value;
        if (!name || !isPrice(price) || !isQty(qty) || !isQty(thresh)) {
          toast({ title: "Check the form", body: "Name, price and quantities are required.", tone: "rose", iconName: "alert" });
          return;
        }
        const data = { name, sku: sku || `SKU-${Date.now() % 10000}`, price: Number(price), quantity: Number(qty), low_stock_threshold: Number(thresh), emoji };
        if (isEdit) await db.updateItem(item.id, data);
        else await db.createItem(data);
        toast({ title: isEdit ? "Item updated" : `${name} added`, body: "Inventory is in sync.", tone: "green", iconName: "checkCircle" });
        scrim.remove();
        renderInventory();
      });
    },
  });
}

export function updateLowStockBadge() {
  db.inventory().then((list) => {
    const n = list.filter((i) => i.quantity <= i.low_stock_threshold).length;
    const badge = document.getElementById("navLowStock");
    if (badge) { badge.textContent = n; badge.style.display = n ? "" : "none"; }
  });
}
