/* ============================================================
   ShopSathi — pages/products.js
   Full product CRUD: search, category filter, sort, pagination,
   image URL, discount, active toggle. Real DB rows.
   ============================================================ */
import { db } from "../supabaseClient.js";
import { icon } from "../utils/constants.js";
import { money, esc } from "../utils/formatters.js";
import { isPrice, isQty } from "../utils/validators.js";
import { openModal, closeModal, confirmDialog } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { loadingState, errorState, emptyState } from "../utils/ui.js";

const PAGE_SIZE = 12;
let all = [];
let q = "", cat = "all", sort = "name", dir = 1, page = 1;

export function init(root) {
  root.innerHTML = `
    <div class="page-head">
      <div><h2>Products</h2><div class="desc">Your catalog — prices, discounts & availability</div></div>
      <div class="spacer"></div>
      <div class="search-box" style="width:220px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="prodSearch" placeholder="Search products…" aria-label="Search products">
      </div>
      <select class="select" id="prodCat" style="width:170px" aria-label="Filter by category"></select>
      <select class="select" id="prodSort" style="width:170px" aria-label="Sort">
        <option value="name">Name A–Z</option>
        <option value="name-d">Name Z–A</option>
        <option value="price">Price ↑</option>
        <option value="price-d">Price ↓</option>
        <option value="stock">Stock ↑</option>
        <option value="stock-d">Stock ↓</option>
      </select>
      <button class="btn btn-gold" id="addProductBtn">${icon("plus")} Add product</button>
    </div>
    <div id="prodBody">${loadingState()}</div>`;
}

export async function render(root) {
  const body = root.querySelector("#prodBody");
  body.innerHTML = loadingState("Loading products…");
  try {
    all = await db.products();
    const cats = [...new Set(all.map((p) => p.category).filter(Boolean))].sort();
    const catSel = root.querySelector("#prodCat");
    catSel.innerHTML = `<option value="all">All categories</option>` + cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    catSel.value = cat;
    root.querySelector("#prodSearch").value = q;
    root.querySelector("#prodSort").value = sort;

    let list = all.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (q && !(p.name + " " + (p.sku || "") + " " + (p.description || "")).toLowerCase().includes(q)) return false;
      return true;
    });
    list.sort((a, b) => {
      const key = sort.replace("-d", "");
      const d = dir * (sort.endsWith("-d") ? -1 : 1);
      const av = a[key], bv = b[key];
      if (typeof av === "string") return av.localeCompare(bv) * d;
      return (Number(av) - Number(bv)) * d;
    });

    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    page = Math.min(page, pages);
    const rows = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    if (!rows.length) {
      body.innerHTML = emptyState("tag", q || cat !== "all" ? "No products match" : "No products yet", "Add your first product to get started.");
    } else {
      body.innerHTML = `
        <div class="prod-grid">
          ${rows.map((p) => {
            const status = p.stock === 0 ? "out" : p.stock <= p.low_stock_threshold ? "low" : "ok";
            const eff = Number(p.price) * (1 - (Number(p.discount) || 0) / 100);
            return `
            <article class="card item-card prod-card ${status === "low" ? "low" : ""} ${status === "out" ? "out" : ""} ${p.active ? "" : "inactive"}" data-id="${p.id}">
              <div class="i-top">
                ${p.image_url
                  ? `<img class="prod-img" src="${esc(p.image_url)}" alt="" loading="lazy" onerror="this.style.display='none'">`
                  : `<div class="prod-emoji">${icon("package")}</div>`}
                <span class="badge ${p.active ? (status === "ok" ? "green" : status === "low" ? "gold" : "danger") : "faint"}">
                  <span class="badge-dot"></span>${p.active ? (status === "ok" ? "In stock" : status === "low" ? "Low" : "Out") : "Hidden"}
                </span>
              </div>
              <div>
                <div class="i-name">${esc(p.name)}</div>
                <div class="i-sku">${esc(p.sku || "—")}${p.category ? ` · ${esc(p.category)}` : ""}</div>
              </div>
              <div class="i-price">
                ${Number(p.discount) > 0
                  ? `<span class="strike">${money(p.price)}</span> <b>${money(eff)}</b> <span class="off">-${p.discount}%</span>`
                  : money(p.price)}
              </div>
              <div class="i-foot">
                <span class="badge">${icon("package")} ${p.stock} in stock</span>
                <div class="row">
                  <button class="btn-icon" data-toggle title="${p.active ? "Hide" : "Show"}">${p.active ? icon("eye") : icon("eyeOff")}</button>
                  <button class="btn-icon" data-edit aria-label="Edit">${icon("edit")}</button>
                  <button class="btn-icon danger" data-del aria-label="Delete">${icon("trash")}</button>
                </div>
              </div>
            </article>`;
          }).join("")}
        </div>
        ${pages > 1 ? `
        <div class="pager">
          <button class="btn btn-ghost" id="pgPrev" ${page === 1 ? "disabled" : ""}>${icon("arrowUp")} Prev</button>
          <span class="faint small">Page ${page} of ${pages}</span>
          <button class="btn btn-ghost" id="pgNext" ${page === pages ? "disabled" : ""}>Next ${icon("arrowUp")}</button>
        </div>` : ""}`;
    }

    body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openProductModal(all.find((x) => x.id === b.closest(".prod-card").dataset.id), root)));
    body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => delProduct(b.closest(".prod-card").dataset.id)));
    body.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", async () => {
      const p = all.find((x) => x.id === b.closest(".prod-card").dataset.id);
      await db.updateProduct(p.id, { active: !p.active });
      toast({ title: p.active ? `${p.name} hidden` : `${p.name} is now visible`, iconName: "checkCircle", tone: "green" });
      render(root);
    }));
    body.querySelector("#pgPrev")?.addEventListener("click", () => { page--; render(root); });
    body.querySelector("#pgNext")?.addEventListener("click", () => { page++; render(root); });
  } catch (e) {
    console.error(e);
    body.innerHTML = errorState("Couldn't load products: " + (e.message || e), true);
    body.querySelector("#errRetry")?.addEventListener("click", () => render(root));
  }
}

export function bind(root) {
  root.querySelector("#addProductBtn")?.addEventListener("click", () => openProductModal(null, root));
  root.querySelector("#prodSearch")?.addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); page = 1; render(root); });
  root.querySelector("#prodCat")?.addEventListener("change", (e) => { cat = e.target.value; page = 1; render(root); });
  root.querySelector("#prodSort")?.addEventListener("change", (e) => {
    sort = e.target.value; // keep the "-d" suffix — render() derives the direction from it
    page = 1;
    render(root);
  });
}

const CATEGORIES = ["", "Beverages", "Food", "Bakery", "Clothing", "Grooming", "Electronics", "Accessories", "Other"];

function openProductModal(product, root) {
  const isEdit = !!product;
  openModal({
    title: isEdit ? "Edit product" : "Add a product",
    width: "640px",
    body: `
      <div class="field"><label>Product name *</label><input class="input" id="p-name" value="${isEdit ? esc(product.name) : ""}" placeholder="e.g. Co
ld Brew"></div>
      <div class="field"><label>Description</label><textarea class="textarea" id="p-desc" placeholder="What is it?">${isEdit ? esc(product.description || "") : ""}</textarea></div>
      <div class="row">
        <div class="field grow"><label>Category</label>
          <select class="select" id="p-cat">${CATEGORIES.map((c) => `<option ${isEdit && product.category === c ? "selected" : ""}>${c || "Uncategorized"}</option>`).join("")}</select></div>
        <div class="field" style="width:150px"><label>SKU</label><input class="input" id="p-sku" value="${isEdit ? esc(product.sku || "") : ""}" placeholder="DRK-002"></div>
      </div>
      <div class="row">
        <div class="field" style="width:150px"><label>Price * (₹)</label><input class="input" id="p-price" type="number" step="0.01" min="0" value="${isEdit ? product.price : ""}" placeholder="190"></div>
        <div class="field" style="width:130px"><label>Discount %</label><input class="input" id="p-disc" type="number" step="1" min="0" max="100" value="${isEdit ? product.discount || 0 : 0}"></div>
        <div class="field" style="width:110px"><label>GST %</label>
          <select class="select" id="p-gst">${[0, 5, 12, 18, 28].map((r) => `<option value="${r}" ${isEdit && Number(product.gst_rate) === r ? "selected" : ""}>${r}%</option>`).join("")}</select></div>
        <div class="field grow"><label>Stock *</label><input class="input" id="p-stock" type="number" min="0" step="1" value="${isEdit ? product.stock : ""}" placeholder="10"></div>
      </div>
      <div class="row">
        <div class="field grow"><label>Low-stock alert at</label><input class="input" id="p-thresh" type="number" min="0" step="1" value="${isEdit ? product.low_stock_threshold : 5}"></div>
        <div class="field grow"><label>Image URL (optional)</label><input class="input" id="p-img" type="url" value="${isEdit ? esc(product.image_url || "") : ""}" placeholder="https://…"></div>
      </div>
      <label class="check-row"><input type="checkbox" id="p-active" ${!isEdit || product.active ? "checked" : ""}> Active — visible to customers</label>`,
    foot: `<button class="btn btn-ghost" data-cancel>Cancel</button>
           <button class="btn btn-gold" id="saveProduct">${isEdit ? "Save changes" : "Add product"}</button>`,
    onMount: (scrim) => {
      scrim.querySelector("[data-cancel]").addEventListener("click", () => scrim.remove());
      scrim.querySelector("#saveProduct").addEventListener("click", async () => {
        const name = scrim.querySelector("#p-name").value.trim();
        const price = scrim.querySelector("#p-price").value;
        const stock = scrim.querySelector("#p-stock").value;
        const thresh = scrim.querySelector("#p-thresh").value;
        const disc = scrim.querySelector("#p-disc").value || 0;
        if (!name) { toast({ title: "Name is required", tone: "rose", iconName: "alert" }); return; }
        if (!isPrice(price)) { toast({ title: "Enter a valid price", tone: "rose", iconName: "alert" }); return; }
        if (!isQty(stock) || !isQty(thresh)) { toast({ title: "Stock must be a whole number ≥ 0", tone: "rose", iconName: "alert" }); return; }
        if (Number(disc) < 0 || Number(disc) > 100) { toast({ title: "Discount must be 0–100%", tone: "rose", iconName: "alert" }); return; }
        const data = {
          name,
          description: scrim.querySelector("#p-desc").value.trim() || null,
          category: scrim.querySelector("#p-cat").value === "Uncategorized" ? null : scrim.querySelector("#p-cat").value,
          sku: scrim.querySelector("#p-sku").value.trim() || null,
          price: Number(price),
          discount: Number(disc),
          gst_rate: Number(scrim.querySelector("#p-gst").value || 0),
          stock: Number(stock),
          low_stock_threshold: Number(thresh),
          image_url: scrim.querySelector("#p-img").value.trim() || null,
          active: scrim.querySelector("#p-active").checked,
        };
        const btn = scrim.querySelector("#saveProduct");
        btn.disabled = true;
        try {
          if (isEdit) await db.updateProduct(product.id, data);
          else await db.createProduct(data);
          toast({ title: isEdit ? "Product updated" : `${name} added`, body: "Saved to your catalog.", tone: "green", iconName: "checkCircle" });
          scrim.remove();
          render(root || document.getElementById("page-products"));
        } catch (e) {
          toast({ title: "Could not save", body: e.message, tone: "rose", iconName: "alert" });
          btn.disabled = false;
        }
      });
    },
  });
}

async function delProduct(id) {
  const p = all.find((x) => x.id === id);
  const yes = await confirmDialog({
    title: `Delete ${p.name}?`,
    body: `This removes the product and its stock history permanently. Orders that already contain it keep a snapshot.`,
    confirmLabel: "Delete product",
  });
  if (!yes) return;
  try {
    await db.deleteProduct(id);
    toast({ title: `${p.name} deleted`, tone: "rose", iconName: "trash" });
    render(document.getElementById("page-products"));
  } catch (e) {
    toast({ title: "Could not delete", body: e.message, tone: "rose", iconName: "alert" });
  }
}
