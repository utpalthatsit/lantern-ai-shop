/* ============================================================
   Lantern — utils/formatters.js
   ============================================================ */

export function inr(n) {
  if (n == null) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function timeLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function shortDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function dayLabel(d) {
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return days[d.getDay()];
}

export function isToday(d) {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return m + "m";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h";
  return Math.round(h / 24) + "d";
}

export function maskPhone(p) {
  if (!p) return "";
  return p.replace(/^(\+\d{2})(\d+)$/, (_, cc, rest) =>
    cc + rest.slice(0, 2) + "•".repeat(Math.max(2, rest.length - 4)) + rest.slice(-2));
}

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Very small "AI summary" style stat helper */
export function pctChange(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}
