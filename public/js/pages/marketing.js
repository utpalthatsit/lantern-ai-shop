/* ============================================================
   ShopSathi — pages/marketing.js
   AI-drafted posts from real inventory signals. The owner
   reviews and approves; nothing is ever auto-sent. WhatsApp
   broadcast delivery needs Meta template approval — until then
   approval marks the draft "sent for broadcast" without faking
   delivery numbers.
   ============================================================ */
import { db } from "../supabaseClient.js";
import { icon } from "../utils/constants.js";
import { esc, relativeTime } from "../utils/formatters.js";
import { openModal, closeModal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { loadingState, errorState, emptyState } from "../utils/ui.js";

const CHANNEL = {
  wa: { label: "WhatsApp", cls: "wa", icon: "wa" },
  ig: { label: "Instagram", cls: "ig", icon: "ig" },
  sms: { label: "SMS", cls: "sms", icon: "sms" },
};

export function init(root) {
  root.innerHTML = `
    <div class="page-head">
      <div><h2>Marketing</h2><div class="desc">AI-drafted posts — you approve before anything goes out</div></div>
      <div class="spacer"></div>
      <div class="row">
        <select class="select" id="genChannel" style="width:160px" aria-label="Channel">
          <option value="wa">WhatsApp</option>
          <option value="ig">Instagram</option>
          <option value="sms">SMS</option>
        </select>
        <button class="btn btn-gold" id="generateBtn">${icon("sparkle")} Generate draft</button>
      </div>
    </div>
    <div id="draftGrid" class="draft-grid"></div>`;
}

export async function render(root) {
  const grid = root.querySelector("#draftGrid");
  grid.innerHTML = loadingState("Loading drafts…");
  try {
    const drafts = await db.drafts();
    if (!drafts.length) {
      grid.innerHTML = emptyState("sparkle", "No drafts yet", "Tap Generate to have the AI write one from your real inventory signals.");
      return;
    }
    grid.innerHTML = drafts.map((d) => {
      const ch = CHANNEL[d.channel] || CHANNEL.wa;
      const state = d.status === "sent" ? "green" : d.status === "approved" ? "teal" : "gold";
      return `
      <article class="card draft-card" data-id="${d.id}">
        <div class="d-head">
          <span class="channel-badge ${ch.cls}">${icon(ch.icon)} ${ch.label}</span>
          <span class="badge ${state}">${d.status}</span>
        </div>
        <div class="d-content">${d.content.replace(/(#[A-Za-z0-9_]+)/g, '<span class="hash">$1</span>')}</div>
        <div class="faint small">drafted ${relativeTime(d.created_at)}</div>
        <div class="d-actions">
          ${d.status === "draft" ? `
            <button class="btn btn-ghost" data-act="edit">${icon("edit")} Edit</button>
            <button class="btn btn-gold" data-act="approve">${icon("check")} Approve</button>` : ""}
          ${d.status === "approved" ? `
            <button class="btn btn-ghost" data-act="sent">${icon("checkCircle")} Mark as sent</button>
            <button class="btn btn-ghost" data-act="edit">${icon("edit")} Edit</button>` : ""}
          ${d.status === "sent" ? `<span class="badge green">${icon("checkCircle")} Broadcasted (manually)</span>` : ""}
        </div>
      </article>`;
    }).join("");

    grid.querySelectorAll("[data-act]").forEach((btn) => btn.addEventListener("click", async () => {
      const id = btn.closest(".draft-card").dataset.id;
      const act = btn.dataset.act;
      const d = drafts.find((x) => x.id === id);
      if (act === "approve") {
        await db.setDraftStatus(id, "approved");
        toast({ title: "Approved", body: "Ready for broadcast. Sending over WhatsApp needs Meta template approval — see README.", tone: "green", iconName: "checkCircle" });
      } else if (act === "sent") {
        await db.setDraftStatus(id, "sent");
        toast({ title: "Marked as sent", body: "You confirmed this went out. Delivery data comes from your WhatsApp dashboard.", tone: "green", iconName: "checkCircle" });
      } else if (act === "edit") {
        openEditModal(d, root);
      }
      render(root);
    }));
  } catch (e) {
    console.error(e);
    grid.innerHTML = errorState("Couldn't load drafts: " + (e.message || e), true);
    grid.querySelector("#errRetry")?.addEventListener("click", () => render(root));
  }
}

export function bind(root) {
  root.querySelector("#generateBtn")?.addEventListener("click", async () => {
    const btn = root.querySelector("#generateBtn");
    const channel = root.querySelector("#genChannel").value;
    btn.disabled = true;
    btn.innerHTML = `${icon("refreshCw")} The AI is writing…`;
    try {
      await db.generateDraft(channel);
      toast({ title: "Draft ready", body: "Check it out and approve when you're happy.", tone: "green", iconName: "sparkle" });
      render(root);
    } catch (e) {
      toast({ title: "Could not generate", body: e.message, tone: "rose", iconName: "alert" });
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${icon("sparkle")} Generate draft`;
    }
  });
}

function openEditModal(d, root) {
  openModal({
    title: "Edit draft",
    body: `
      <div class="field"><label>Message</label><textarea class="textarea" id="e-content" style="min-height:160px">${esc(d.content)}</textarea></div>`,
    foot: `<button class="btn btn-ghost" data-cancel>Cancel</button>
           <button class="btn btn-gold" id="saveDraft">${icon("check")} Save draft</button>`,
    onMount: (scrim) => {
      scrim.querySelector("[data-cancel]").addEventListener("click", () => scrim.remove());
      scrim.querySelector("#saveDraft").addEventListener("click", async () => {
        const content = scrim.querySelector("#e-content").value.trim();
        if (!content) { toast({ title: "Message can't be empty", tone: "rose", iconName: "alert" }); return; }
        try {
          await db.updateDraft(d.id, { content, status: "draft" });
          toast({ title: "Draft saved", body: "Ready for a final look.", tone: "green", iconName: "checkCircle" });
          scrim.remove();
          render(root);
        } catch (e) {
          toast({ title: "Could not save", body: e.message, tone: "rose", iconName: "alert" });
        }
      });
    },
  });
}
