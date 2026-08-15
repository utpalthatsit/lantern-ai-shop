/* ============================================================
   ShopSathi — pages/bookings.js
   Create / confirm / cancel / reschedule bookings with a
   conflict check (no double-booked slots). Real DB rows.
   ============================================================ */
import { db } from "../supabaseClient.js";
import { icon } from "../utils/constants.js";
import { timeLabel, shortDate, dayLabel, isToday, esc, fullDate, dateTimeLabel } from "../utils/formatters.js";
import { openModal, closeModal, confirmDialog } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { loadingState, errorState, emptyState } from "../utils/ui.js";

const SERVICES = ["Haircut", "Haircut & Beard Trim", "Full Colour", "Beard Sculpt", "Kids Cut", "Fade + Line-Up", "Consultation", "Other"];
const STAFF = ["Aarav", "Meera", "No staff"];
let all = [];
let dayOffset = 0;

export function init(root) {
  root.innerHTML = `
    <div class="page-head">
      <div><h2>Bookings</h2><div class="desc">Appointments, reminders & no-show recovery</div></div>
      <div class="spacer"></div>
      <span class="badge teal"><span class="badge-dot"></span>Reminders auto-sent</span>
      <button class="btn btn-gold" id="newBookingBtn">${icon("plus")} New booking</button>
    </div>
    <div class="day-strip" id="dayStrip"></div>
    <div id="bkBody">${loadingState()}</div>`;
}

export async function render(root) {
  const body = root.querySelector("#bkBody");
  if (!body) { init(root); return; }
  body.innerHTML = loadingState("Loading bookings…");
  try {
    all = await db.bookings();
    renderDayStrip(root);
    const selectedDay = dayAt(dayOffset);
    const dayBookings = all
      .filter((b) => sameDay(new Date(b.start_time), selectedDay))
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    if (!dayBookings.length) {
      body.innerHTML = emptyState("calendar", "No bookings on this day", shortDate(selectedDay.toISOString()) + " is free. A calm day.");
      return;
    }
    const now = new Date();
    body.innerHTML = dayBookings.map((b) => {
      const past = new Date(b.end_time) < now && b.status === "confirmed";
      return `
      <div class="card bk-card ${b.status} ${past ? "past" : ""}" data-id="${b.id}">
        <div class="bk-time">
          <span class="t">${timeLabel(b.start_time)}</span>
          <span class="d">${timeLabel(b.end_time)}</span>
        </div>
        <div class="bk-line"></div>
        <div class="bk-main">
          <div class="bk-service">${esc(b.service)}</div>
          <div class="bk-cust">
            <span>${esc(b.customer_name || b.customer_phone || "Walk-in")}</span>
            ${b.staff ? `<span class="badge">${icon("users")} ${esc(b.staff)}</span>` : ""}
            <span class="badge ${statusCls(b.status)}">${statusLabel(b.status)}</span>
          </div>
          ${b.notes ? `<div class="bk-notes">“${esc(b.notes)}”</div>` : ""}
          ${b.customer_phone ? `<div class="faint small" style="margin-top:.2rem">${esc(b.customer_phone)}</div>` : ""}
        </div>
        <div class="bk-actions">
          ${b.status === "pending" ? `<button class="btn-soft btn" data-act="confirm" style="padding:.45rem .9rem;font-size:.8rem">${icon("check")} Confirm</button>` : ""}
          ${["pending", "confirmed"].includes(b.status) ? `
            <button class="btn-soft btn" data-act="reschedule" style="padding:.45rem .9rem;font-size:.8rem">${icon("refresh")} Move</button>
            <button class="btn-icon" data-act="cancel" title="Cancel">${icon("x")}</button>` : ""}
          ${b.status === "confirmed" ? `<button class="btn-soft btn" data-act="complete" style="padding:.45rem .9rem;font-size:.8rem">${icon("checkCircle")} Done</button>` : ""}
          ${b.status === "no_show" ? `<button class="btn-soft btn" data-act="confirm" style="padding:.45rem .9rem;font-size:.8rem">${icon("refresh")} Rebook</button>` : ""}
        </div>
      </div>`;
    }).join("");
  } catch (e) {
    console.error(e);
    body.innerHTML = errorState("Couldn't load bookings: " + (e.message || e), true);
    body.querySelector("#errRetry")?.addEventListener("click", () => render(root));
  }
  bindActions(body, root);
}

function statusCls(s) {
  return { confirmed: "teal", pending: "gold", completed: "green", cancelled: "faint", no_show: "danger" }[s] || "";
}
function statusLabel(s) {
  return { confirmed: "Confirmed", pending: "Pending", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" }[s] || s;
}

function dayAt(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function renderDayStrip(root) {
  const strip = root.querySelector("#dayStrip");
  if (!strip) return;
  const chips = [];
  for (let i = -1; i <= 6; i++) {
    const d = dayAt(i);
    const count = all.filter((b) => sameDay(new Date(b.start_time), d) && !["cancelled", "no_show"].includes(b.status)).length;
    chips.push(`<div class="day-chip ${i === dayOffset ? "active" : ""} ${isToday(d) ? "today" : ""}" data-offset="${i}">
      <span class="dow">${dayLabel(d)}</span><span class="dnum">${d.getDate()}</span><span class="dcnt">${count} slot${count === 1 ? "" : "s"}</span>
    </div>`);
  }
  strip.innerHTML = chips.join("");
  strip.querySelectorAll(".day-chip").forEach((el) => el.addEventListener("click", () => {
    dayOffset = Number(el.dataset.offset);
    renderDayStrip(root);
    render(root);
  }));
}

function bindActions(body, root) {
  body.querySelectorAll("[data-act]").forEach((btn) => btn.addEventListener("click", async () => {
    const id = btn.closest(".bk-card").dataset.id;
    const act = btn.dataset.act;
    const b = all.find((x) => x.id === id);
    if (act === "confirm") {
      await db.setBookingStatus(id, "confirmed");
      toast({ title: "Booking confirmed", body: "Reminder flow armed.", tone: "green", iconName: "checkCircle" });
    } else if (act === "complete") {
      await db.setBookingStatus(id, "completed");
      toast({ title: "Marked completed", body: "Nice work.", tone: "green", iconName: "checkCircle" });
    } else if (act === "cancel") {
      const yes = await confirmDialog({ title: "Cancel this booking?", body: `${b.service} on ${fullDate(b.start_time)} will be cancelled.`, confirmLabel: "Cancel booking" });
      if (!yes) return;
      await db.setBookingStatus(id, "cancelled");
      toast({ title: "Booking cancelled", body: "The customer gets an automatic message.", tone: "rose", iconName: "bell" });
    } else if (act === "reschedule") {
      openRescheduleModal(b, root);
      return;
    }
    render(root);
  }));
}

export function bind(root) {
  root.querySelector("#newBookingBtn")?.addEventListener("click", () => openBookingModal(root));
}

function openBookingModal(root) {
  openModal({
    title: "New booking",
    body: `
      <div class="row">
        <div class="field grow"><label>Customer name</label><input class="input" id="b-name" placeholder="e.g. Neha Verma"></div>
        <div class="field grow"><label>Phone</label><input class="input" id="b-phone" type="tel" placeholder="+91 …"></div>
      </div>
      <div class="row">
        <div class="field grow"><label>Service</label>
          <select class="select" id="b-service">${SERVICES.map((s) => `<option>${s}</option>`).join("")}</select></div>
        <div class="field" style="width:130px"><label>Staff</label>
          <select class="select" id="b-staff">${STAFF.map((s) => `<option>${s}</option>`).join("")}</select></div>
      </div>
      <div class="row">
        <div class="field grow"><label>Date</label><input class="input" id="b-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field" style="width:130px"><label>Time</label><input class="input" id="b-time" type="time" value="11:00"></div>
        <div class="field" style="width:100px"><label>Duration</label>
          <select class="select" id="b-dur"><option value="30">30m</option><option value="45">45m</option><option value="60">60m</option><option value="90">90m</option></select></div>
      </div>
      <div class="field"><label>Notes (optional)</label><input class="input" id="b-note" placeholder="Anything the team should know"></div>`,
    foot: `<button class="btn btn-ghost" data-cancel>Cancel</button>
           <button class="btn btn-gold" id="saveBooking">${icon("check")} Confirm booking</button>`,
    onMount: (scrim) => {
      scrim.querySelector("[data-cancel]").addEventListener("click", () => scrim.remove());
      scrim.querySelector("#saveBooking").addEventListener("click", async () => {
        const name = scrim.querySelector("#b-name").value.trim();
        if (!name) { toast({ title: "Customer name required", tone: "rose", iconName: "alert" }); return; }
        const start = new Date(`${scrim.querySelector("#b-date").value}T${scrim.querySelector("#b-time").value}:00`);
        const dur = Number(scrim.querySelector("#b-dur").value) * 60000;
        const end = new Date(start.getTime() + dur);
        if (isNaN(start.getTime())) { toast({ title: "Pick a valid date & time", tone: "rose", iconName: "alert" }); return; }
        if (start.getTime() < Date.now() - 60000) { toast({ title: "That time is in the past", tone: "rose", iconName: "alert" }); return; }
        const staff = scrim.querySelector("#b-staff").value === "No staff" ? null : scrim.querySelector("#b-staff").value;
        const conflicts = await db.bookingConflict(start, end, staff);
        if (conflicts.length) {
          const c = conflicts[0];
          toast({ title: "Slot already booked", body: `${c.service} at ${timeLabel(c.start_time)} — pick another time.`, tone: "rose", iconName: "alert" });
          return;
        }
        try {
          await db.createBooking({
            customer_name: name,
            customer_phone: scrim.querySelector("#b-phone").value.trim() || null,
            service: scrim.querySelector("#b-service").value,
            staff, notes: scrim.querySelector("#b-note").value.trim() || null,
            start_time: start.toISOString(), end_time: end.toISOString(),
          });
          toast({ title: `${name} booked`, body: "A WhatsApp confirmation goes out automatically.", tone: "green", iconName: "checkCircle" });
          scrim.remove();
          render(root);
        } catch (e) {
          toast({ title: "Could not book", body: e.message, tone: "rose", iconName: "alert" });
        }
      });
    },
  });
}

function openRescheduleModal(b, root) {
  const start = new Date(b.start_time);
  openModal({
    title: `Move ${b.service}`,
    body: `
      <p class="muted small">Currently ${dateTimeLabel(b.start_time)}</p>
      <div class="row" style="margin-top:.9rem">
        <div class="field grow"><label>New date</label><input class="input" id="r-date" type="date" value="${start.toISOString().slice(0, 10)}"></div>
        <div class="field" style="width:130px"><label>New time</label><input class="input" id="r-time" type="time" value="${start.toTimeString().slice(0, 5)}"></div>
      </div>`,
    foot: `<button class="btn btn-ghost" data-cancel>Cancel</button>
           <button class="btn btn-gold" id="r-save">Move booking</button>`,
    onMount: (scrim) => {
      scrim.querySelector("[data-cancel]").addEventListener("click", () => scrim.remove());
      scrim.querySelector("#r-save").addEventListener("click", async () => {
        const newStart = new Date(`${scrim.querySelector("#r-date").value}T${scrim.querySelector("#r-time").value}:00`);
        const dur = new Date(b.end_time).getTime() - new Date(b.start_time).getTime();
        const newEnd = new Date(newStart.getTime() + dur);
        if (isNaN(newStart.getTime())) { toast({ title: "Pick a valid date & time", tone: "rose", iconName: "alert" }); return; }
        const conflicts = await db.bookingConflict(newStart, newEnd, b.staff, b.id);
        if (conflicts.length) {
          toast({ title: "Slot already booked", body: "Pick another time.", tone: "rose", iconName: "alert" });
          return;
        }
        try {
          await db.
rescheduleBooking(b.id, newStart.toISOString(), newEnd.toISOString());
          toast({ title: "Booking moved", body: dateTimeLabel(newStart.toISOString()), tone: "green", iconName: "checkCircle" });
          scrim.remove();
          render(root);
        } catch (e) {
          toast({ title: "Could not move", body: e.message, tone: "rose", iconName: "alert" });
        }
      });
    },
  });
}
