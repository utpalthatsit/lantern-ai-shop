/* ============================================================
   ShopSathi — utils/constants.js (icons, colors, labels)
   ============================================================ */

const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  chat: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  box: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" ${STROKE}><path d="m12 3 1.9 5.8L20 10.7l-6.1 1.9L12 18.4l-1.9-5.8L4 10.7l6.1-1.9z"/><path d="M19 15.5v4M17 17.5h4"/></svg>`,
  send: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 5v14M5 12h14"/></svg>`,
  minus: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M5 12h14"/></svg>`,
  search: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`,
  check: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M20 6 9 17l-5-5"/></svg>`,
  checkCircle: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 5-6"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  x: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>`,
  arrowUp: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 19V5M5 12l7-7 7 7"/></svg>`,
  arrowDown: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 5v14M19 12l-7 7-7-7"/></svg>`,
  arrowLeft: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`,
  zap: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M21 12a9 9 0 1 1-2.6-6.3M21 3v6h-6"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/></svg>`,
  inbox: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5z"/></svg>`,
  store: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 9 4.5 3h15L21 9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M3 9v11a1 1 0 0 0 1 1h4v-7h8v7h4a1 1 0 0 0 1-1V9"/></svg>`,
  users: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>`,
  trend: `<svg viewBox="0 0 24 24" ${STROKE}><path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>`,
  chatEscalate: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 8v4M12 16h.01"/></svg>`,
  wa: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.15-1.8-.88-2.08-1-.28-.1-.48-.15-.68.15-.2.3-.78 1-.95 1.2-.17.2-.35.22-.65.08-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.78-1.67-2.08-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.68-1.62-.93-2.23-.24-.58-.49-.5-.67-.51h-.58c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.11.57-.08 1.76-.72 2-1.41.25-.7.25-1.29.18-1.42-.08-.12-.28-.2-.58-.35zM12.05 21.8h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.85 9.85 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.9-9.88a9.83 9.83 0 0 1 9.88 9.89c0 5.45-4.44 9.88-9.89 9.88zm8.42-18.3A11.8 11.8 0 0 0 12.05 0C5.5 0 .16 5.33.16 11.89c0 2.1.55 4.14 1.59 5.94L.06 24l6.33-1.66a11.9 11.9 0 0 0 5.66 1.44h.01c6.55 0 11.89-5.33 11.89-11.89 0-3.18-1.24-6.16-3.48-8.4z"/></svg>`,
  ig: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>`,
  sms: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  info: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
  brain: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44A2.5 2.5 0 0 1 5 17.5v-1A2.5 2.5 0 0 1 3 14a2.5 2.5 0 0 1-1-3.5A2.5 2.5 0 0 1 3.5 8a2.5 2.5 0 0 1 1.5-4A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44A2.5 2.5 0 0 0 19 17.5v-1a2.5 2.5 0 0 0 2-2.5 2.5 2.5 0 0 0 1-3.5A2.5 2.5 0 0 0 20.5 8a2.5 2.5 0 0 0-1.5-4A2.5 2.5 0 0 0 14.5 2z"/></svg>`,
  refreshCw: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16M3 21v-5h5"/></svg>`,
};

export function icon(name) {
  return ICONS[name] || ICONS.sparkle;
}

/* Deterministic avatar gradient + initial */
export function avatarFor(name, g = null) {
  const cls = g != null ? `g${g % 6}` : `g${(name.charCodeAt(0) || 0) % 6}`;
  const initial = (name.trim()[0] || "?").toUpperCase();
  return { cls, initial };
}

/* Currency + number helpers live in formatters.js */
export const SHOP_TYPES = ["Café", "Barbershop", "Boutique", "Repair Shop", "Grocery", "Salon"];
export const LANGUAGES = ["English", "हिन्दी", "Español", "العربية", "தமிழ்", "Tagalog"];

/* ---------- ShopSathi extra icons ---------- */
const EXTRA = {
  image: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`,
  mapPin: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>`,
  userPlus: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M17 11h6"/></svg>`,
  filter: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M22 3H2l8 9.5V19l4 2v-8.5z"/></svg>`,
  sort: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4"/></svg>`,
  bag: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>`,
  shieldCheck: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  package: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M16.5 9.4 7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/></svg>`,
  messagePlus: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 8v6M9 11h6"/></svg>`,
  receipt: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>`,
  tag: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 2.8 12V4a1.2 1.2 0 0 1 1.2-1.2H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1"/></svg>`,
  external: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></svg>`,
  link: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  messageCircle: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/></svg>`,
};
Object.assign(ICONS, EXTRA);

/* extra (eye) */
Object.assign(ICONS, {
  eye: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="m1 1 22 22"/></svg>`,
  calendarPlus: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v6M9 17h6"/></svg>`,
  refreshCwExtra: ``,
});
