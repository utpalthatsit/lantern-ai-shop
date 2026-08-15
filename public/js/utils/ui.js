/* ============================================================
   ShopSathi — utils/ui.js (loading / error / empty states)
   ============================================================ */
import { icon } from "./constants.js";

export function loadingState(text = "Loading…") {
  return `
    <div class="load-wrap" role="status" aria-live="polite">
      <div class="skeleton-block"></div>
      <div class="skeleton-block" style="width:80%"></div>
      <div class="skeleton-block" style="width:60%"></div>
      <div class="faint small" style="margin-top:.8rem;text-align:center">${text}</div>
    </div>`;
}

export function errorState(msg = "Something went wrong.", retry) {
  return `
    <div class="empty">
      <div class="e-ico">${icon("alert")}</div>
      <p>${msg}</p>
      ${retry ? `<button class="btn btn-ghost" id="errRetry" style="margin-top:.8rem">${icon("refresh")} Try again</button>` : ""}
    </div>`;
}

export function emptyState(iconName, title, body = "") {
  return `
    <div class="empty">
      <div class="e-ico">${icon(iconName)}</div>
      <p><b>${title}</b></p>
      ${body ? `<div class="faint small">${body}</div>` : ""}
    </div>`;
}

/* Simple spinner button content */
export function spin(label = "Working…") {
  return `<span class="spinner" aria-hidden="true"></span> ${label}`;
}
