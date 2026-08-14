/* ============================================================
   Lantern — components/toast.js
   ============================================================ */
import { icon } from "../utils/constants.js";

export function toast({ title, body = "", tone = "gold", iconName = "sparkle", ms = 4200 }) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div class="t-icon" style="background:var(--${tone === "gold" ? "amber" : tone === "green" ? "green" : tone === "rose" ? "rose" : "teal"}-gradient, none)">${icon(iconName)}</div>
    <div>
      <div class="t-title">${title}</div>
      ${body ? `<div class="t-body">${body}</div>` : ""}
    </div>`;
  stack.appendChild(el);
  const kill = () => { el.classList.add("leaving"); setTimeout(() => el.remove(), 380); };
  el.addEventListener("click", kill);
  setTimeout(kill, ms);
}
