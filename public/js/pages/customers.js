/* ============================================================
   ShopSathi — pages/customers.js
   Customer list, search, profile (orders + bookings + chats),
   create / update / delete. Real DB rows.
   ============================================================ */
import { db } from "../supabaseClient.js";
import { icon } from "../utils/constants.js";
import { money, fullDate, relativeTime, maskPhone, esc, statusBadge } from "../utils/formatters.js";
import { isPhone, isEmail } from "../utils/validators.js";
import { openModal, closeModal, confirmDialog } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { loadingState, errorState, emptyState } from "../utils/ui.js";

let all = [];
let q = "";

export function init(root) {
  root.innerHTML = `
    <div class="page-head">
      <div><h2>Customers</h2><div class="desc">People who shop with you</div></div>
      <div class="spacer"></div>
      <div class="search-box" style="width:240px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="custSearch" placeholder="Search name, phone, email…" aria-label="Search customers">
      </div>
      <button class="btn btn-gold" id="addCustBtn">${icon("userPlus")} Add customer</button>
    </div>
    <div id="custBody">${loadingState()}</div>`;
}

export async function render(root) {
  const body = root.querySelector("#custBody");
  body.innerHTML = loadingState("Loading customers…");
  try {
    all = await db.customers({ search: q || undefined });
    root.querySelector("#custSearch").value = q;
    if (!all.length) {
      body.innerHTML = emptyState("users", q ? "No customers match" : "No customers yet", "Customers are added automatically when they message on WhatsApp, or add them manually.");
      return;
    }
    body.innerHTML = `
      <div class="table-wrap card">
        <table class="data-table">
          <thead><tr>
            <th>Customer</th><th>Contact</th><th>Orders</th><th>Last activity</th><th></th>
          </tr></thead>
          <tbody>
            ${all.map((c) => `
              <tr data-id="${c.id}">
                <td><div class="row"><span class="ava sm g${(c.phone || c.name || "0").length % 6}">${esc((c.name || "?")[0])}</span>
                  <div><div style="font-weight:600">${esc(c.name)}</div>${c.notes ? `<div class="faint small">${esc(c.notes.slice(0, 40))}</div>` : ""}</div></div></td>
                <td class="muted small">${c.phone ? esc(maskPhone(c.phone)) : ""}${c.email ? `<div>${esc(c.email)}</div>` : ""}</td>
                <td><span class="badge">${c.orders_count ?? "—"}</span></td>
                <td class="faint small">${relativeTime(c.updated_at || c.created_at)}</td>
                <td><div class="row" style="justify-content:flex-end">
                  <button class="btn-icon" data-view title="View profile">${icon("eye")}</button>
                  <button class="btn-icon" data-edit title="Edit">${icon("edit")}</button>
                  <button class="btn-icon danger" data-del title="Delete">${icon("trash")}</button>
                </div></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;

    body.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => viewProfile(all.find((x) => x.id === b.closest("tr").dataset.id))));
    body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openCustomerModal(all.find((x) => x.id === b.closest("tr").dataset.id), root)));
    body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => delCustomer(b.closest("tr").dataset.id)));
  } catch (e) {
    console.error(e);
    body.innerHTML = errorState("Couldn't load customers: " + (e.message || e), true);
    body.querySelector("#errRetry")?.addEventListener("click", () => render(root));
  }
}

export function bind(root) {
  root.querySelector("#addCustBtn")?.addEventListener("click", () => openCustomerModal(null, root));
  root.querySelector("#custSearch")?.addEventListener("input", (e) => { q = e.target.value.trim(); render(root); });
}

function openCustomerModal(c, root) {
  const isEdit = !!c;
  openModal({
    title: isEdit ? `Edit ${c.name}` : "Add a customer",
    body: `
      <div class="field"><label>Name *</label><input class="input" id="c-name" value="${isEdit ? esc(c.name) : ""}"></div>
      <div class="row">
        <div class="field grow"><label>Phone</label><input class="input" id="c-phone" type="tel" value="${isEdit ? esc(c.phone || "") : ""}" placeholder="+91 …"></div>
        <div class="field grow"><label>Email</label><input class="input" id="c-email" type="email" value="${isEdit ? esc(c.email || "") : ""}"></div>
      </div>
      <div class="field"><label>Address</label><input class="input" id="c-addr" value="${isEdit ? esc(c.address || "") : ""}"></div>
      <div class="field"><label>Notes</label><textarea class="textarea" id="c-notes" placeholder="Preferences, allergies, anything useful…">${isEdit ? esc(c.notes || "") : ""}</textarea></div>`,
    foot: `<button class="btn btn-ghost" data-cancel>Cancel</button>
           <button class="btn btn-gold" id="saveCust">${isEdit ? "Save changes" : "Add customer"}</button>`,
    onMount: (scrim) => {
      scrim.querySelector("[data-cancel]").addEventListener("click", () => scrim.remove());
      scrim.querySelector("#saveCust").addEventListener("click", async () => {
        const name = scrim.querySelector("#c-name").value.trim();
        const phone = scrim.querySelector("#c-phone").value.trim();
        const email = scrim.querySelector("#c-email").value.trim();
        if (!name) { toast({ title: "Name is required", tone: "rose", iconName: "alert" }); return; }
        if (phone && !isPhone(phone)) { toast({ title: "Enter a valid phone", tone: "rose", iconName: "alert" }); return; }
        if (email && !isEmail(email)) { toast({ title: "Enter a valid email", tone: "rose", iconName: "alert" }); return; }
        const data = { name, phone: phone || null, email: email || null, address: scrim.querySelector("#c-addr").value.trim() || null, notes: scrim.querySelector("#c-notes").value.trim() || null };
        try {
          if (isEdit) await db.updateCustomer(c.id, data);
          else await db.createCustomer(data);
          toast({ title: isEdit ? "Customer updated" : `${name} added`, tone: "green", iconName: "checkCircle" });
          scrim.remove();
          render(root || document.getElementById("page-customers"));
        } catch (e) {
          toast({ title: "Could not save", body: e.message, tone: "rose", iconName: "alert" });
        }
      });
    },
  });
}

async function viewProfile(c) {
  const scrim = openModal({
    title: c.name,
    width: "680px",
    body: `<div id="profBody">${loadingState("Loading history…")}</div>`,
  });
  const body = scrim.querySelector("#profBody");
  try {
    const { customer, orders: os, bookings: bs, conversations: cs } = await db.customerProfile(c.id);
    body.innerHTML = `
      <div class="row" style="margin-bottom:1rem">
        <span class="ava lg g${(customer.phone || "0").length % 6}">${esc(customer.name[0])}</span>
        <div>
          <div class="muted small">${customer.phone ? esc(maskPhone(customer.phone)) : "no phone"}${customer.email ? ` · ${esc(customer.email)}` : ""}</div>
          <div class="muted small">${customer.address ? esc(customer.address) : ""} · customer since ${fullDate(customer.created_at)}</div>
        </div>
      </div>
      ${customer.notes ? `<p class="muted small" style="margin-bottom:1rem">📝 ${esc(customer.notes)}</p>` : ""}
      <div class="prof-cols">
        <div>
          <div class="panel-head"><h3 style="font-size:1rem">Orders (${os.length})</h3></div>
          ${os.slice(0, 5).map((o) => `
            <div class="row-item"><span class="r-main"><div class="r-title">${esc(o.customer_name)}</div><div class="r-sub">${relativeTime(o.created_at)} · ${money(o.total)}</div></spa
n></span>
            <span class="r-right">${statusBadge(o.status)}</span></div>`).join("") || `<div class="faint small" style="padding:.8rem">No orders yet.</div>`}
        </div>
        <div>
          <div class="panel-head"><h3 style="font-size:1rem">Bookings (${bs.length})</h3></div>
          ${bs.slice(0, 5).map((b) => `
            <div class="row-item"><span class="r-main"><div class="r-title">${esc(b.service)}</div><div class="r-sub">${fullDate(b.start_time)}</div></span>
            <span class="r-right">${statusBadge(b.status)}</span></div>`).join("") || `<div class="faint small" style="padding:.8rem">No bookings yet.</div>`}
        </div>
        <div>
          <div class="panel-head"><h3 style="font-size:1rem">Conversations (${cs.length})</h3></div>
          ${cs.slice(0, 5).map((x) => `
            <div class="row-item"><span class="r-main"><div class="r-title">${esc(x.last_message || "—")}</div><div class="r-sub">${relativeTime(x.last_message_at)}</div></span>
            <span class="r-right">${x.status === "escalated" ? `<span class="badge rose">escalated</span>` : ""}</span></div>`).join("") || `<div class="faint small" style="padding:.8rem">No conversations yet.</div>`}
        </div>
      </div>`;
  } catch (e) {
    body.innerHTML = errorState("Could not load profile: " + (e.message || e), true);
    body.querySelector("#errRetry")?.addEventListener("click", () => viewProfile(c));
  }
}

async function delCustomer(id) {
  const c = all.find((x) => x.id === id);
  const yes = await confirmDialog({ title: `Delete ${c.name}?`, body: "Their orders and bookings are kept, but the customer profile is removed.", confirmLabel: "Delete customer" });
  if (!yes) return;
  try {
    await db.deleteCustomer(id);
    toast({ title: `${c.name} deleted`, tone: "rose", iconName: "trash" });
    render(document.getElementById("page-customers"));
  } catch (e) {
    toast({ title: "Could not delete", body: e.message, tone: "rose", iconName: "alert" });
  }
}
