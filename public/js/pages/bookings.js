/* ============================================================
   Lantern — pages/bookings.js
   ============================================================ */
import { db } from "../supabaseClient.js";
import { icon } from "../utils/constants.js";
import { timeLabel, shortDate, dayLabel, isToday, esc } from "../utils/formatters.js";
import { openModal } from "../components/modal.js";
import { toast } from "../components/toast.js";

const STATUS_META = {
  confirmed: { label: "Confirmed", cls: "teal" },
  completed: { label: "Completed", cls: "green" },
  cancelled: { label: "Cancelled", cls: "faint" },
  no_show: { label: "No-show", cls: "danger" },
};

let bookings = [];
let selectedDay = new Date();
let dayOffset = 0;

export async function renderBookings() {
  bookings = await db.bookings();
  renderDayStrip();
  renderTimeline();
}

function dayChips() {
  const chips = [];
  for (let i = -1; i <= 5; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    chips.push({ d, i });
  }
  return chips;
}

function renderDayStrip() {
  const strip = document.getElementById("dayStrip");
  if (!strip) return;
  strip.innerHTML = dayChips().map(({ d, i }) => {
    const count = bookings.filter((b) => sameDay(new Date(b.start), d) && b.status !== "cancelled").length;
    return `
      <div class="day-chip ${i === dayOffset ? "active" : ""} ${isToday(d) ? "today" : ""}" data-offset="${i}">
        <span class="dow">${dayLabel(d)}</span>
        <span class="dnum">${d.getDate()}</span>
        <span class="dcnt">${count} slot${count === 1 ? "" : "s"}</span>
      </div>`;
  }).join("");
  strip.querySelectorAll(".day-chip").forEach((el) => {
    el.addEventListener("click", () => {
      dayOffset = Number(el.dataset.offset);
      selectedDay = dayChips().find((c) => c.i === dayOffset).d;
      renderDayStrip();
      renderTimeline();
    });
  });
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function renderTimeline() {
  const tl = document.getElementById("bkTimeline");
  if (!tl) return;
  const dayBookings = bookings
    .filter((b) => sameDay(new Date(b.start), selectedDay))
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  if (!dayBookings.length) {
    tl.innerHTML = `<div class="empty">${icon("calendar")}<p>No bookings on ${shortDate(selectedDay.toISOString())}. A calm day.</p></div>`;
    return;
  }
  const now = new Date();
  tl.innerHTML = dayBookings.map((b) => {
    const meta = STATUS_META[b.status] || STATUS_META.confirmed;
    const past = new Date(b.end) < now && b.status === "confirmed";
    return `
      <div class="card bk-card ${b.status} ${past ? "past" : ""}" data-id="${b.id}">
        <div class="bk-time">
          <span class="t">${timeLabel(b.start)}</span>
          <span class="d">${timeLabel(b.end)}</span>
        </div>
        <div class="bk-line"></div>
        <div class="bk-main">
          <div class="bk-service">${esc(b.service)}</div>
          <div class="bk-cust">
            <span>${esc(b.customer)}</span>
            <span class="badge">${icon("users")} ${esc(b.staff)}</span>
            <span class="badge ${meta.cls}">${meta.label}</span>
          </div>
          ${b.note ? `<div class="bk-notes">“${esc(b.note)}”</div>` : ""}
        </div>
        <div class="bk-actions">
          ${b.status === "confirmed" ? `
            <button class="btn-soft btn" data-act="completed" style="padding:.45rem .9rem;font-size:.8rem">${icon("check")} Done</button>
            <button class="btn-icon" data-act="cancel" title="Mark cancelled">${icon("x")}</button>` : ""}
          ${b.status === "no_show" ? `<button class="btn-soft btn" data-act="rebook" style="padding:.45rem .9rem;font-size:.8rem">${icon("refresh")} Offer rebook</button>` : ""}
        </div>
      </div>`;
  }).join("");

  tl.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest(".bk-card").dataset.id;
      const act = btn.dataset.act;
      if (act === "completed") {
        await db.setBookingStatus(id, "completed");
        toast({ title: "Marked completed", body: "Reminder flow stopped. Nice work.", tone: "green", iconName: "checkCircle" });
      } else if (act === "cancel") {
        await db.setBookingStatus(id, "cancelled");
        toast({ title: "Booking cancelled", body: "The customer gets an automatic message.", tone: "rose", iconName: "bell" });
      } else if (act === "rebook") {
        await db.setBookingStatus(id, "confirmed");
        toast({ title: "Rebook offer sent", body: "Ali gets a WhatsApp nudge to pick a new slot.", iconName: "chat" });
      }
      renderBookings();
    });
  });
}

export function bindBookingsEvents() {
  document.getElementById("newBookingBtn")?.addEventListener("click", openBookingModal);
}

function openBookingModal() {
  const services = ["Haircut", "Haircut & Beard Trim", "Full Colour", "Beard Sculpt", "Kids Cut", "Fade + Line-Up"];
  const staff = ["Aarav", "Meera"];
  openModal({
    title: "New booking",
    body: `
      <div class="field"><label>Customer name</label><input class="input" id="b-name" placeholder="e.g. Neha Verma"></div>
      <div class="row">
        <div class="field grow"><label>Service</label>
          <select class="select" id="b-service">${services.map((s) => `<option>${s}</option>`).join("")}</select></div>
        <div class="field" style="width:120px"><label>Staff</label>
          <select class="select" id="b-staff">${staff.map((s) => `<option>${s}</option>`).join("")}</select></div>
      </div>
      <div class="row">
        <div class="field grow"><label>Date</label><input class="input" id="b-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field" style="width:130px"><label>Time</label><input class="input" id="b-time" type="time" value="11:00"></div>
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
        const end = new Date(start.getTime() + 30 * 60000);
        await db.createBooking({
          service: scrim.querySelector("#b-service").value,
          staff: scrim.querySelector("#b-staff").value,
          customer: name,
          phone: "",
          start: start.toISOString(),
          end: end.toISOString(),
          note: scrim.querySelector("#b-note").value.trim(),
        });
        toast({ title: `${name} booked`, body: "A WhatsApp confirmation goes out automatically.", tone: "green", iconName: "checkCircle" });
        scrim.remove();
        renderBookings();
      });
    },
  });
}
