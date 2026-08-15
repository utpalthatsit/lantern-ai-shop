/* ============================================================
   ShopSathi — utils/validators.js
   ============================================================ */

export function isPhone(v) {
  return /^\+?[0-9\s-]{7,15}$/.test(String(v).trim());
}

export function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
}

export function isPrice(v) {
  return v !== "" && !isNaN(Number(v)) && Number(v) >= 0;
}

export function isQty(v) {
  return Number.isInteger(Number(v)) && Number(v) >= 0;
}
