/* ============================================================
   ShopSathi — components/modal.js
   ============================================================ */
import { icon } from "../utils/constants.js";

let openScrim = null;

export function openModal({ title, body = "", foot = "", onMount = null, width }) {
  closeModal();
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim";
  scrim.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" ${width ? `style="width:min(${width},100%)"` : ""}>
      <div class="m-head">
        <div class="m-title">${title}</div>
        <button class="btn-icon" data-close aria-label="Close">${icon("x")}</button>
      </div>
      <div class="m-body">${body}</div>
      ${foot ? `<div class="m-foot">${foot}</div>` : ""}
    </div>`;
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) closeModal(); });
  scrim.querySelector("[data-close]").addEventListener("click", closeModal);
  document.body.appendChild(scrim);
  openScrim = scrim;
  if (onMount) onMount(scrim);
  return scrim;
}

export function closeModal() {
  if (openScrim) {
    openScrim.remove();
    openScrim = null;
  }
}

/* Confirmation dialog → Promise<boolean> */
export function confirmDialog({ title = "Are you sure?", body = "", confirmLabel = "Confirm", tone = "danger" }) {
  return new Promise((resolve) => {
    const scrim = openModal({
      title,
      body: body ? `<p class="muted" style="line-height:1.6">${body}</p>` : "",
      foot: `
        <button class="btn btn-ghost" data-no>Cancel</button>
        <button class="btn ${tone === "danger" ? "btn-danger-soft" : "btn-gold"}" data-yes>${confirmLabel}</button>`,
      onMount: (s) => {
        s.querySelector("[data-no]").addEventListener("click", () => { closeModal(); resolve(false); });
        s.querySelector("[data-yes]").addEventListener("click", async () => {
          const btn = s.querySelector("[data-yes]");
          btn.disabled = true;
          resolve(true);
        });
      },
    });
    /* keep the scrim open until the caller closes it */
    scrim.dataset.keepOpen = "1";
  });
}
