/* ============================================================
   ShopSathi — pages/billing.js
   GST billing page. Build a bill by typing or by SPEAKING
   ("2 milk, 1 bread"), apply a discount, see CGST/SGST, then
   save + print a proper invoice. A bill is a completed order
   (orders + order_items) with invoice_no — stock is adjusted
   automatically by the existing order trigger.
   ============================================================ */
import { db, getShop } from "../supabaseClient.js";
import { icon } from "../utils/constants.js";
import { money, esc, fullDate, relativeTime } from "../utils/formatters.js";
import { openModal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { loadingState, errorState, emptyState } from "../utils/ui.js";

const GST_RATES = [0, 5, 12, 18, 28];
const FILLERS = ["litre", "liter", "ltr", "l", "kg", "gm", "gram", "g", "packet", "pack", "bottle", "box", "piece", "pcs", "no", "number", "ml", "ke", "ka", "ki"];

let products = [];
let recentBills = [];
let lastBill = null;

/* ============================================================
   Voice (Web Speech API — Chrome / Edge)
   ============================================================ */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

function speechLang() {
  const l = (getShop()?.language || "en") + "";
  if (l.includes("हि") || /^hi\b|hind/i.test(l)) return "hi-IN";
  if (l.includes("ta") || l.includes("தம")) return "ta-IN";
  if (l.includes("es")) return "es-ES";
  if (l.includes("ar") || l.includes("عر")) return "ar-SA";
  if (l.includes("tl") || l.includes("tag")) return "tl-PH";
  return "en-IN";
}

function startMic({ onFinal, digits = false }) {
  const hint = document.getElementById("voiceHint");
  const btn = document.querySelector(".mic-live") || document.querySelector(".mic-btn");
  if (!SR) {
    toast({ title: "Voice typing unavailable", body: "Use Chrome or Edge for voice billing.", tone: "rose", iconName: "alert" });
    return;
  }
  if (btn?.classList.contains("mic-live")) return;
  const rec = new SR();
  rec.lang = speechLang();
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  if (btn) btn.classList.add("mic-live");
  if (hint) hint.textContent = "Listening… speak now";
  rec.onresult = (e) => {
    const text = (e.results[0][0].transcript || "").trim();
    onFinal(digits ? text.replace(/\D/g, "") : text);
  };
  rec.onerror = () => {};
  rec.onend = () => {
    if (btn) btn.classList.remove("mic-live");
    if (hint) hint.textContent = "";
  };
  rec.start();
}

/* ---------- Parsing "2 milk, 1 bread" → [{qty, name}] ---------- */
const WORD_NUMS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  ek: 1, do: 2, doo: 2, teen: 3, char: 4, paanch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
  gyara: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16, satrah: 17,
  atharah: 18, unnis: 19, bees: 20,
};
const HINDI_DIGITS = { "०": 0, "१": 1, "२": 2, "३": 3, "४": 4, "५": 5, "६": 6, "७": 7, "८": 8, "९": 9 };

function toNum(tok) {
  let s = "";
  for (const ch of tok) s += HINDI_DIGITS[ch] ?? ch;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isNaN(n)) return n;
  return WORD_NUMS[s.toLowerCase().replace(/\.$/, "")] ?? null;
}

function parseItems(text) {
  const parts = text.split(/[,،]|\band\b|\baur\b|\bplus\b|\+|\.\s+/i).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const toks = part.split(/\s+/).filter(Boolean);
    if (!toks.length) continue;
    let qty = null, nameToks = toks;
    const first = toNum(toks[0]);
    if (first !== null) { qty = first; nameToks = toks.slice(1); }
    else if (toks.length > 1) {
      const last = toNum(toks[toks.length - 1]);
      if (last !== null) { qty = last; nameToks = toks.slice(0, -1); }
    }
    const name = nameToks.join(" ");
    if (name) out.push({ qty: Math.max(1, Math.round(qty ?? 1)), name });
  }
  return out;
}

function matchProduct(q) {
  const clean = (s) => s.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]+/g, " ")
    .split(" ").filter((t) => t && !FILLERS.includes(t)).join(" ");
  const qn = clean(q);
  let best = null, bestScore = 0;
  for (const p of products) {
    const pn = clean(p.name);
    if (!pn) continue;
    let score = 0;
    if (qn === pn) score = 1000;
    else if (pn.includes(qn)) score = 500 - (pn.length - qn.length);
    else if (qn.includes(pn)) score = 300 - (qn.length - pn.length);
    else {
      const qt = qn.split(" "), pt = pn.split(" ");
      score = qt.filter((t) => pt.includes(t)).length * 50;
    }
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore > 0 ? best : null;
}

function onSpokenItems(text) {
  const parsed = parseItems(text);
  if (!parsed.length) {
    toast({ title: "Didn't catch that", body: "Heard: " + text, tone: "rose", iconName: "alert" });
    return;
  }
  const missing = [];
  let added = 0;
  for (const it of parsed) {
    const p = matchProduct(it.name);
    if (p) { addLine(p, it.qty); added++; }
    else missing.push(it.name);
  }
  toast({
    title: added ? added + " item" + (added > 1 ? "s" : "") + " added" : "Nothing matched",
    body: missing.length ? "Not found: " + missing.join(", ") : "Heard: " + text,
    tone: added ? "green" : "rose",
    iconName: added ? "checkCircle" : "alert",
  });
}

/* ============================================================
   Page shell
   ============================================================ */
export function init(root) {
  root.innerHTML = `
    <div class="page-head">
      <div><h2>Billing</h2><div class="desc">GST invoices in seconds — type or just speak</div></div>
      <div class="spacer"></div>
      <button class="btn btn-ghost" id="billClearBtn">${icon("refreshCw")} New bill</button>
    </div>
    <div class="bill-grid">
      <div class="card panel">
        <div class="panel-head"><h3>${icon("mic")} Voice billing <span class="faint small" id="voiceHint"></span></h3></div>
        <div class="panel-body stack">
          <div class="voice-strip">
            <button class="btn mic-btn" id="micItems">${icon("mic")} Speak items — "2 milk, 1 bread"</button>
            <span class="faint small">Say a number then the product name. Hindi and English both work.</span>
          </div>
          <div class="row" style="flex-wrap:wrap">
            <div class="field grow"><label>Customer name *</label>
              <div class="mic-field"><input class="input" id="b-cust" placeholder="e.g. Neha Verma"><button class="btn-icon mic-mini" data-mic="name" title="Speak the name">${icon("mic")}</button></div>
            </div>
            <div class="field grow"><label>Phone</label>
              <div class="mic-field"><input class="input" id="b-phone" type="tel" placeholder="+91 ..."><button class="btn-icon mic-mini" data-mic="phone" title="Speak the number">${icon("mic")}</button></div>
            </div>
          </div>
          <div class="row" style="flex-wrap:wrap">
            <div class="field grow"><label>Customer GSTIN <span class="faint small">(optional)</span></label><input class="input" id="b-gstin" placeholder="e.g. 29ABCDE1234F1Z5"></div>
            <div class="field grow"><label>Notes</label><input class="input" id="b-notes" placeholder="e.g. Paid by UPI"></div>
          </div>
          <div class="divider"></div>
          <div class="bill-lines-wrap">
            <div class="bill-col-head">
              <span class="bh-prod">Item</span><span class="bh-qty">Qty</span><span class="bh-price">Rate</span><span class="bh-gst">GST</span><span class="bh-total">Amount</span><span class="bh-rm"></span>
            </div>
            <div id="bLines" class="stack"></div>
          </div>
          <button class="btn btn-ghost" id="bAddLine" style="align-self:flex-start">${icon("plus")} Add product</button>
          <div class="divider"></div>
          <div class="discount-row">
            <span class="muted small">Discount</span>
            <select class="select" id="bDiscMode" style="width:92px">
              <option value="none">None</option><option value="pct">% off</option><option value="amt">Rs off</option>
            </select>
            <input class="input" id="bDiscVal" type="number" min="0" step="0.01" value="0" style="width:110px" disabled>
          </div>
          <div id="billSummary"></div>
          <button class="btn btn-gold" id="bSave" style="align-self:flex-end">${icon("checkCircle")} Save & print bill</button>
        </div>
      </div>
      <div class="card panel">
        <div class="panel-head"><h3>${icon("clock")} Recent bills</h3></div>
        <div class="panel-body" id="billRecent">${loadingState()}</div>
      </div>
    </div>`;
}

export function bind(root) {
  document.getElementById("micItems").addEventListener("click", () => startMic({ onFinal: onSpokenItems }));
  root.querySelectorAll("[data-mic]").forEach((b) => b.addEventListener("click", () => {
    const target = b.dataset.mic;
    startMic({
      digits: target === "phone",
      onFinal: (text) => {
        const input = document.getElementById(target === "name" ? "b-cust" : "b-phone");
        if (input) input.value = text;
      },
    });
  }));

  const lines = document.getElementById("bLines");
  document.getElementById("bAddLine").addEventListener("click", () => addLine(null, 1));

  lines.addEventListener("input", recalc);
  lines.addEventListener("change", (e) => {
    if (e.target.classList.contains("b-prod")) {
      const p = products.find((x) => x.id === e.target.value);
      const line = e.target.closest(".b-line");
      if (p && line) {
        line.querySelector(".b-price").value = effectivePrice(p);
        line.querySelector(".b-gst").value = Number(p.gst_rate) || 0;
      }
      recalc();
    }
  });

  const discMode = document.getElementById("bDiscMode");
  const discVal = document.getElementById("bDiscVal");
  discMode.addEventListener("change", () => {
    discVal.disabled = discMode.value === "none";
    recalc();
  });
  discVal.addEventListener("input", recalc);

  document.getElementById("bSave").addEventListener("click", saveBill);
  document.getElementById("billClearBtn").addEventListener("click", resetBill);
}

export async function render(root) {
  try {
    products = await db.products({ active: true });
  } catch (e) {
    root.querySelector("#billRecent").innerHTML = errorState("Couldn't load products: " + (e.message || e), true);
    root.querySelector("#errRetry")?.addEventListener("click", () => render(root));
    return;
  }
  if (!products.length) {
    root.querySelector("#bLines").innerHTML =
      '<p class="muted small">No active products yet — add them on the Products page, then billing (and voice) will find them.</p>';
  }
  await renderRecent();
  resetBill();
  recalc();
}

/* ============================================================
   Line items
   ============================================================ */
function effectivePrice(p) {
  return Math.round(Number(p.price) * (1 - (Number(p.discount) || 0) / 100) * 100) / 100;
}

function productOptions(selectedId) {
  return products.map((p) => {
    const eff = effectivePrice(p);
    const gst = Number(p.gst_rate) || 0;
    return '<option value="' + p.id + '"' + (p.id === selectedId ? " selected" : "") + ">" + esc(p.name) + " (" + money(eff) + (gst ? " · " + gst + "% GST" : "") + " · " + p.stock + " left)</option>";
  }).join("");
}

function addLine(product, qty = 1) {
  const lines = document.getElementById("bLines");
  const div = document.createElement("div");
  div.className = "b-line";
  const eff = product ? effectivePrice(product) : 0;
  const gst = product ? Number(product.gst_rate) || 0 : 0;
  div.innerHTML = `
    <select class="select b-prod">${productOptions(product ? product.id : null)}</select>
    <input class="input b-qty" type="number" min="1" step="1" value="${qty}" aria-label="Quantity">
    <input class="input b-price" type="number" min="0" step="0.01" value="${eff}" aria-label="Rate">
    <select class="select b-gst" aria-label="GST rate">${GST_RATES.map((r) => '<option value="' + r + '"' + (r === gst ? " selected" : "") + ">" + r + "%</option>").join("")}</select>
    <span class="b-line-total">${money(0)}</span>
    <button class="btn-icon" data-rm title="Remove" aria-label="Remove line">${icon("x")}</button>`;
  div.querySelector("[data-rm]").addEventListener("click", () => { div.remove(); recalc(); });
  lines.appendChild(div);
  recalc();
}

function resetBill() {
  ["b-cust", "b-phone", "b-gstin", "b-notes"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("bDiscMode").value = "none";
  document.getElementById("bDiscVal").value = 0;
  document.getElementById("bDiscVal").disabled = true;
  document.getElementById("bLines").innerHTML = "";
  if (products.length) addLine(products[0], 1);
  recalc();
}

/* ============================================================
   GST math — subtotal → discount → taxable → CGST/SGST → total
   ============================================================ */
function recalc() {
  const lines = [...document.querySelectorAll(".b-line")];
  let subtotal = 0;
  const byRate = {};
  const items = [];
  for (const l of lines) {
    const pid = l.querySelector(".b-prod")?.value;
    const qty = Math.max(0, Number(l.querySelector(".b-qty").value) || 0);
    const price = Math.max(0, Number(l.querySelector(".b-price").value) || 0);
    const gst = Number(l.querySelector(".b-gst").value) || 0;
    const taxable = qty * price;
    subtotal += taxable;
    byRate[gst] = (byRate[gst] || 0) + taxable;
    const prod = products.find((p) => p.id === pid);
    items.push({ product_id: pid || null, name: prod ? prod.name : "—", price, quantity: qty, gst_rate: gst });
    l.querySelector(".b-line-total").textContent = money(taxable);
  }

  const mode = document.getElementById("bDiscMode").value;
  const val = Number(document.getElementById("bDiscVal").value) || 0;
  let discAmt = 0;
  if (mode === "pct") discAmt = subtotal * Math.min(100, Math.max(0, val)) / 100;
  else if (mode === "amt") discAmt = Math.min(subtotal, Math.max(0, val));

  const taxable = Math.max(0, subtotal - discAmt);
  let cgst = 0, sgst = 0;
  if (subtotal > 0) {
    for (const [rate, amt] of Object.entries(byRate)) {
      const share = amt * (taxable / subtotal); /* discount spreads across GST slabs */
      cgst += share * Number(rate) / 200;
      sgst += share * Number(rate) / 200;
    }
  }
  const tax = cgst + sgst;
  const totalExact = taxable + tax;
  const total = Math.round(totalExact);
  const roundOff = +(total - totalExact).toFixed(2);

  lastBill = {
    items, subtotal: +subtotal.toFixed(2), discount_amount: +discAmt.toFixed(2),
    tax_amount: +tax.toFixed(2), total,
  };

  const signAmt = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + "₹" + Math.abs(n).toFixed(2);
  document.getElementById("billSummary").innerHTML = `
    <div class="sum-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
    ${discAmt ? `<div class="sum-row"><span>Discount</span><span>−${money(discAmt)}</span></div>` : ""}
    <div class="sum-row"><span>Taxable value</span><span>${money(taxable)}</span></div>
    <div class="sum-row"><span>CGST</span><span>${money(cgst)}</span></div>
    <div class="sum-row"><span>SGST</span><span>${money(sgst)}</span></div>
    ${Math.abs(roundOff) > 0.004 ? `<div class="sum-row"><span>Round off</span><span>${signAmt(roundOff)}</span></div>` : ""}
    <div class="sum-row grand"><span>Grand Total</span><span>${money(total)}</span></div>`;
}

/* ============================================================
   Save + invoice
   ============================================================ */
async function saveBill() {
  const name = document.getElementById("b-cust").value.trim();
  if (!name) { toast({ title: "Enter customer name", tone: "rose", iconName: "alert" }); return; }
  if (!lastBill || !lastBill.items.some((i) => i.product_id && i.quantity > 0)) {
    toast({ title: "Add at least one item", tone: "rose", iconName: "alert" });
    return;
  }
  const btn = document.getElementById("bSave");
  btn.disabled = true;
  try {
    const order = await db.createBill({
      customer_name: name,
      customer_phone: document.getElementById("b-phone").value.trim() || null,
      customer_gstin: document.getElementById("b-gstin").value.trim() || null,
      items: lastBill.items.filter((i) => i.product_id && i.quantity > 0),
      subtotal: lastBill.subtotal,
      discount_amount: lastBill.discount_amount,
      tax_amount: lastBill.tax_amount,
      total: lastBill.total,
      notes: document.getElementById("b-notes").value.trim() || null,
    });
    toast({ title: order.invoice_no + " saved", body: money(order.total) + " billed to " + name + ".", tone: "green", iconName: "checkCircle" });
    openInvoice(order);
    await renderRecent();
  } catch (e) {
    toast({ title: "Could not save bill", body: e.message, tone: "rose", iconName: "alert" });
  } finally {
    btn.disabled = false;
  }
}

function openInvoice(order) {
  const shop = getShop();
  const items = order.order_items || order.items || [];
  const rows = items.map((it, i) => `
    <tr><td>${i + 1}</td><td>${esc(it.name)}</td><td class="r">${it.quantity}</td>
    <td class="r">${money(it.price)}</td><td class="r">${Number(it.gst_rate) || 0}%</td>
    <td class="r">${money(it.price * it.quantity)}</td></tr>`).join("");
  const subtotal = Number(order.subtotal) ?? items.reduce((s, it) => s + it.price * it.quantity, 0);
  const disc = Number(order.discount_amount) || 0;
  const tax = Number(order.tax_amount) || 0;
  const roundOff = Number(order.total) - (subtotal - disc + tax);

  openModal({
    title: "Invoice " + esc(order.invoice_no),
    width: "600px",
    body: `
      <div class="bill-print">
        <div class="bp-head">
          <div>
            <div class="bp-shop">${esc(shop.name)}</div>
            ${shop.address ? `<div class="bp-meta">${esc(shop.address)}</div>` : ""}
            ${shop.phone ? `<div class="bp-meta">${esc(shop.phone)}</div>` : ""}
            ${shop.gstin ? `<div class="bp-meta">GSTIN: ${esc(shop.gstin)}</div>` : `<div class="bp-meta">GSTIN: —</div>`}
          </div>
          <div class="bp-right">
            <div class="bp-invno">${esc(order.invoice_no)}</div>
            <div class="bp-meta">${fullDate(order.created_at)}</div>
          </div>
        </div>
        <div class="bp-billto">
          <div class="bp-label">BILLED TO</div>
          <div class="bp-cust">${esc(order.customer_name)}</div>
          ${order.customer_phone ? `<div class="bp-meta">${esc(order.customer_phone)}</div>` : ""}
          ${order.customer_gstin ? `<div class="bp-meta">GSTIN: ${esc(order.customer_gstin)}</div>` : ""}
        </div>
        <table class="bp-table">
          <thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">GST</th><th class="r">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="bp-totals">
          <div class="bp-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
          ${disc ? `<div class="bp-row"><span>Discount</span><span>−${money(disc)}</span></div>` : ""}
          <div class="bp-row"><span>Taxable value</span><span>${money(subtotal - disc)}</span></div>
          <div class="bp-row"><span>CGST</span><span>${money(tax / 2)}</span></div>
          <div class="bp-row"><span>SGST</span><span>${money(tax / 2)}</span></div>
          ${Math.abs(roundOff) > 0.004 ? `<div class="bp-row"><span>Round off</span><span>${roundOff > 0 ? "+" : "−"}₹${Math.abs(roundOff).toFixed(2)}</span></div>` : ""}
          <div class="bp-row bp-grand"><span>Grand Total</span><span>${money(order.total)}</span></div>
        </div>
        <div class="bp-foot">Thank you for shopping with us!${shop.tagline ? " · " + esc(shop.tagline) : ""}</div>
      </div>`,
    foot: '<button class="btn btn-ghost" id="bp-print">Print</button>' +
           '<button class="btn btn-ghost" data-cancel>Close</button>' +
           '<button class="btn btn-gold" id="bp-new">' + icon("plus") + ' New bill</button>',
    onMount: (s) => {
      s.querySelector("[data-cancel]").addEventListener("click", () => s.remove());
      s.querySelector("#bp-print").addEventListener("click", () => window.print());
      s.querySelector("#bp-new").addEventListener("click", () => { s.remove(); resetBill(); });
    },
  });
}

async function renderRecent() {
  const box = document.getElementById("billRecent");
  try {
    recentBills = await db.bills(15);
  } catch (e) {
    console.error(e);
    recentBills = [];
  }
  if (!recentBills.length) {
    box.innerHTML = emptyState("bag", "No bills yet", "Saved GST invoices appear here, ready to reprint.");
    return;
  }
  box.innerHTML = recentBills.map((b) => `
    <div class="bill-row">
      <div>
        <div class="r-title">${esc(b.invoice_no)} · ${esc(b.customer_name)}</div>
        <div class="r-sub">${relativeTime(b.created_at)}${b.customer_phone ? " · " + esc(b.customer_phone) : ""}</div>
      </div>
      <div class="row">
        <span class="r-total">${money(b.total)}</span>
        <button class="btn-soft btn" data-reprint="${b.id}" style="padding:.35rem .7rem;font-size:.76rem">Print</button>
      </div>
    </div>`).join("");
  box.querySelectorAll("[data-reprint]").forEach((b) =>
    b.addEventListener("click", () => openInvoice(recentBills.find((x) => x.id === b.dataset.reprint))));
}
