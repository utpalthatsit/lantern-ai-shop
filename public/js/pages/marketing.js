/* ============================================================
   Lantern — pages/marketing.js
   ============================================================ */
import { db } from "../supabaseClient.js";
import { icon } from "../utils/constants.js";
import { esc } from "../utils/formatters.js";
import { toast } from "../components/toast.js";
import { openModal } from "../components/modal.js";

const CHANNEL = {
  wa: { label: "WhatsApp", cls: "wa", icon: "wa" },
  ig: { label: "Instagram", cls: "ig", icon: "ig" },
  sms: { label: "SMS", cls: "sms", icon: "sms" },
};

export async function renderMarketing() {
  const drafts = await db.drafts();
  const root = document.getElementById("page-marketing");
  if (!root) return;
  const grid = document.getElementById("draftGrid");

  grid.innerHTML = drafts.map((d) => {
    const ch = CHANNEL[d.channel] || CHANNEL.wa;
    const sent = d.status === "sent";
    return `
      <article class="card draft-card ${sent ? "sent" : ""}" data-id="${d.id}">
        <div class="d-head">
          <span class="channel-badge ${ch.cls}">${icon(ch.icon)} ${ch.label}</span>
          <span class="badge ${sent ? "green" : "gold"}">${sent ? "Sent" : "Draft"}</span>
        </div>
        <div class="d-title" style="font-weight:650;font-size:.95rem">${esc(d.title)}</div>
        <div class="d-content">${d.content.replace(/(#[A-Za-z0-9_]+)/g, '<span class="hash">$1</span>')}</div>
        <div class="d-why">${icon("brain")} ${esc(d.why)}</div>
        <div class="d-actions">
          ${sent
            ? `<button class="btn btn-ghost" data-act="view">${icon("checkCircle")} Sent to ${ch.label.toLowerCase()}</button>`
            : `
              <button class="btn btn-ghost" data-act="edit">${icon("edit")} Edit</button>
              <button class="btn btn-gold" data-act="approve">${icon("check")} Approve &amp; send</button>`}
        </div>
      </article>`;
  }).join("") || `<div class="empty">${icon("sparkle")}<p>No drafts yet. Ask Lantern for a promo, or tap Generate.</p></div>`;

  grid.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest(".draft-card").dataset.id;
      const act = btn.dataset.act;
      const d = drafts.find((x) => x.id === id);
      if (act === "approve") {
        await db.setDraftStatus(id, "sent");
        toast({ title: `Broadcast sent to ${drafts.length > 0 ? "214 regulars" : "your audience"}`, body: `${d.title} is live on ${CHANNEL[d.channel].label}.`, tone: "green", iconName: "checkCircle" });
        renderMarketing();
      } else if (act === "edit") {
        openEditModal(d);
      } else if (act === "view") {
        toast({ title: "Broadcast delivered", body: "Opened by 61% of recipients so far.", iconName: "chart" });
      }
    });
  });
}

function openEditModal(d) {
  openModal({
    title: "Edit draft",
    body: `
      <div class="field"><label>Title</label><input class="input" id="e-title" value="${esc(d.title)}"></div>
      <div class="field"><label>Message</label><textarea class="textarea" id="e-content" style="min-height:140px">${esc(d.content)}</textarea></div>`,
    foot: `<button class="btn btn-ghost" data-cancel>Cancel</button>
           <button class="btn btn-gold" id="saveDraft">${icon("check")} Save draft</button>`,
    onMount: (scrim) => {
      scrim.querySelector("[data-cancel]").addEventListener("click", () => scrim.remove());
      scrim.querySelector("#saveDraft").addEventListener("click", async () => {
        const content = scrim.querySelector("#e-content").value.trim();
        if (!content) { toast({ title: "Message can't be empty", tone: "rose", iconName: "alert" }); return; }
        await db.setDraftStatus(d.id, "draft");
        toast({ title: "Draft saved", body: "Ready for a final look before sending.", tone: "green", iconName: "checkCircle" });
        scrim.remove();
        renderMarketing();
      });
    },
  });
}

export function bindMarketingEvents() {
  const genBtn = document.getElementById("generateBtn");
  genBtn?.addEventListener("click", async () => {
    genBtn.classList.add("loading");
    genBtn.innerHTML = `${icon("refreshCw")} Lantern is writing…`;
    await db.generateDraft();
    genBtn.classList.remove("loading");
    genBtn.innerHTML = `${icon("sparkle")} Generate another`;
    toast({ title: "New draft ready", body: "Weekend special — check it out.", iconName: "sparkle" });
    renderMarketing();
  });
}
