/* ============================================================
   Lantern — auth.js
   Auth gate for app.html (phone → OTP → console).
   Demo mode: any number + code 123456.
   ============================================================ */
import { toast } from "./components/toast.js";

const SESSION_KEY = "lantern.session";

export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}

export function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
export function clearSession() { localStorage.removeItem(SESSION_KEY); }

export function initAuth({ onSuccess }) {
  const phoneStep = document.getElementById("authStepPhone");
  const otpStep = document.getElementById("authStepOtp");
  const phoneInput = document.getElementById("authPhone");
  const sendBtn = document.getElementById("authSendOtp");
  const verifyBtn = document.getElementById("authVerify");
  const backBtn = document.getElementById("authBack");
  const otpRow = document.getElementById("otpRow");
  const otpSentTo = document.getElementById("otpSentTo");

  if (!phoneStep) return; /* not on app page */

  sendBtn.addEventListener("click", () => {
    const phone = phoneInput.value.trim();
    if (phone.length < 7) {
      toast({ title: "Enter a valid number", body: "Demo accepts any 10+ digit number.", tone: "rose", iconName: "alert" });
      return;
    }
    phoneStep.style.display = "none";
    otpStep.style.display = "block";
    otpSentTo.textContent = `Code sent to ${phone} · demo code is 123456`;
    setTimeout(() => otpRow.querySelector("input")?.focus(), 80);
  });

  /* Auto-advance between OTP boxes */
  otpRow.querySelectorAll("input").forEach((inp, i, arr) => {
    inp.addEventListener("input", () => {
      inp.value = inp.value.replace(/\D/g, "");
      if (inp.value && i < arr.length - 1) arr[i + 1].focus();
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !inp.value && i > 0) arr[i - 1].focus();
    });
    inp.addEventListener("paste", (e) => {
      const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
      if (!digits) return;
      e.preventDefault();
      arr.forEach((el, j) => { el.value = digits[j] || ""; });
      arr[Math.min(digits.length, 5)].focus();
    });
  });

  const collectOtp = () => [...otpRow.querySelectorAll("input")].map((i) => i.value).join("");

  verifyBtn.addEventListener("click", () => {
    const otp = collectOtp();
    if (otp !== "123456") {
      toast({ title: "Wrong code", body: "In demo mode the code is 123456.", tone: "rose", iconName: "alert" });
      return;
    }
    saveSession({ phone: phoneInput.value.trim() || "+91 98765 43210", name: "Priya", demo: true });
    toast({ title: "Welcome back, Priya", body: "Opening Ember Café…", tone: "green", iconName: "checkCircle" });
    setTimeout(onSuccess, 450);
  });

  backBtn.addEventListener("click", () => {
    otpStep.style.display = "none";
    phoneStep.style.display = "block";
    otpRow.querySelectorAll("input").forEach((i) => (i.value = ""));
  });

  phoneInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendBtn.click(); });
  otpRow.addEventListener("keydown", (e) => { if (e.key === "Enter") verifyBtn.click(); });
}
