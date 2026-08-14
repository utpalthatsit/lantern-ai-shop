/* ============================================================
   Lantern — components/modal.js
   ============================================================ */
import { icon } from "../utils/constants.js";

let openScrim = null;

export function openModal({ title, body = "", foot = "", onMount = null }) {
  closeModal();
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim";
  scrim.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
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
