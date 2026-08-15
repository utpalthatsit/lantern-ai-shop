/* ============================================================
   ShopSathi — auth.js
   Real Supabase auth: email/password sign in, sign up, phone OTP,
   forgot password, password recovery, session persistence.
   ============================================================ */
import { supabase, isConfigured } from "./supabaseClient.js";
import { toast } from "./components/toast.js";
import { esc } from "./utils/formatters.js";

const BRAND = `
  <div class="a-brand">
    <span class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8L20 10.7l-6.1 1.9L12 18.4l-1.9-5.8L4 10.7l6.1-1.9z"/><path d="M19 15.5v4M17 17.5h4"/></svg></span>
    Shop<em>Sathi</em>
  </div>`;

export function getSession() {
  return supabase?.auth.getSession() || Promise.resolve({ data: { session: null } });
}

export async function signOut() {
  await supabase?.auth.signOut();
}

let onAuthedCb = null;
let recoveryMode = false;

export function initAuth({ onAuthed }) {
  onAuthedCb = onAuthed;
  const root = document.getElementById("authScreen");
  if (!root || !isConfigured) return;

  /* Recovery links land on app.html with a code in the URL.
     supabase-js with detectSessionInUrl resolves it into a session
     and fires PASSWORD_RECOVERY — we then show the new-password step. */
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN") {
      if (recoveryMode) { renderStep(root, "reset"); return; }
      hideAuthScreen();
      onAuthedCb?.();
    } else if (event === "SIGNED_OUT") {
      showAuthScreen();
      renderStep(root, "signin");
    } else if (event === "PASSWORD_RECOVERY") {
      recoveryMode = true;
      showAuthScreen();
      renderStep(root, "reset");
    } else if (event === "TOKEN_REFRESHED") {
      /* session still alive — nothing to do */
    }
  });

  supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      hideAuthScreen();
      onAuthedCb?.();
    } else {
      showAuthScreen();
      const q = new URLSearchParams(location.hash.replace("#", "?"));
      renderStep(root, "signin");
    }
  });
}

function showAuthScreen() { document.getElementById("authScreen").style.display = "grid"; }
function hideAuthScreen() { document.getElementById("authScreen").style.display = "none"; }

function formError(el, msg) {
  const box = el.querySelector(".a-error");
  if (box) { box.textContent = msg; box.style.display = "block"; }
}

function setBusy(btn, busy, label) {
  if (!btn) return;
  btn.disabled = busy;
  btn.innerHTML = busy
    ? `<span class="spinner" aria-hidden="true"></span> ${label || "Please wait…"}`
    : btn.dataset.restore || btn.innerHTML;
}

function renderStep(root, step) {
  root.innerHTML = `<div class="card auth-card hairline">${BRAND}<div id="authBody"></div></div>`;
  const body = root.querySelector("#authBody");

  if (step === "loading") {
    body.innerHTML = `<div class="a-title">Checking your session…</div><div class="skeleton-block" style="height:120px;margin-top:1rem"></div>`;
    return;
  }

  if (step === "signin") {
    body.innerHTML = `
      <div class="a-title">Welcome back</div>
      <p class="a-sub">Sign in to your ShopSathi console</p>
      <div class="a-error" style="display:none"></div>
      <div class="field" style="margin-bottom:.9rem"><label for="a-email">Email</label>
        <input class="input" id="a-email" type="email" autocomplete="email" placeholder="you@shop.com"></div>
      <div class="field" style="margin-bottom:1.1rem"><label for="a-pass">Password</label>
        <input class="input" id="a-pass" type="password" autocomplete="current-password" placeholder="••••••••"></div>
      <button class="btn btn-gold" id="a-signin" style="width:100%" data-restore="Sign in">Sign in</button>
      <button class="btn btn-ghost" id="a-otp" style="width:100%;margin-top:.6rem" data-restore="Sign in with phone code">Sign in with phone code</button>
      <div class="a-links"><a href="#" id="a-forgot">Forgot password?</a><a href="#" id="a-to-signup">Create a shop</a></div>`;
    const email = body.querySelector("#a-email"), pass = body.querySelector("#a-pass");
    const doSignin = async () => {
      if (!email.value.trim() || !pass.value) { formError(body, "Enter your email and password."); return; }
      setBusy(body.querySelector("#a-signin"), true, "Signing in…");
      const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
      setBusy(body.querySelector("#a-signin"), false);
      if (error) formError(body, error.message);
      /* success is handled by onAuthStateChange */
    };
    body.querySelector("#a-signin").addEventListener("click", doSignin);
    body.querySelector("#a-otp").addEventListener("click", () => renderStep(root, "otp"));
    body.querySelector("#a-forgot").addEventListener("click", (e) => { e.preventDefault(); renderStep(root, "forgot"); });
    body.querySelector("#a-to-signup").addEventListener("click", (e) => { e.preventDefault(); renderStep(root, "signup"); });
    [email, pass].forEach((el) => el.addEventListener("keydown", (e) => { if (e.key === "Enter") doSignin(); }));
    email.focus();
  }

  if (step === "signup") {
    body.innerHTML = `
      <div class="a-title">Start your shop</div>
      <p class="a-sub">Create your ShopSathi account — it takes a minute</p>
      <div class="a-error" style="display:none"></div>
      <div class="field" style="margin-bottom:.9rem"><label for="a-name">Your name</label>
        <input class="input" id="a-name" autocomplete="name" placeholder="Priya Sharma"></div>
      <div class="field" style="margin-bottom:.9rem"><label for="a-shop">Shop name</label>
        <input class="input" id="a-shop" placeholder="Ember Café"></div>
      <div class="field" style="margin-bottom:.9rem"><label for="a-email">Email</label>
        <input class="input" id="a-email" type="email" autocomplete="email" placeholder="you@shop.com"></div>
      <div class="field" style="margin-bottom:1.1rem"><label for="a-pass">Password <span class="faint small">(min 8 chars)</span></label>
        <input class="input" id="a-pass" type="password" autocomplete="new-password" placeholder="••••••••"></div>
      <button class="btn btn-gold" id="a-signup" style="width:100%" data-restore="Create my shop">Create my shop</button>
      <div class="a-links"><a href="#" id="a-back-signin">Already have an account? Sign in</a></div>`;
    const doSignup = async () => {
      const name = body.querySelector("#a-name").value.trim();
      const shop = body.querySelector("#a-shop").value.trim();
      const email = body.querySelector("#a-email").value.trim();
      const pass = body.querySelector("#a-pass").value;
      if (!name || !shop || !email) { formError(body, "Name, shop name and email are required."); return; }
      if (pass.length < 8) { formError(body, "Password must be at least 8 characters."); return; }
      setBusy(body.querySelector("#a-signup"), true, "Creating account…");
      const { data, error } = await supabase.auth.signUp({
        email, password: pass,
        options: { data: { full_name: name, shop_name: shop } },
      });
      setBusy(body.querySelector("#a-signup"), false);
      if (error) { formError(body, error.message); return; }
      /* If email confirmation is on, wait for the user to click the link. */
      if (!data.session) {
        body.innerHTML = `
          <div class="a-title">Check your inbox</div>
          <p class="a-sub">We sent a confirmation link to ${esc(email)}. Click it, then come back and sign in.</p>
          <button class="btn btn-ghost" id="a-again" style="width:100%" data-restore="Go to sign in">Go to sign in</button>`;
        body.querySelector("#a-again").addEventListener("click", () => renderStep(root, "signin"));
        return;
      }
      /* Session is live → onboarding happens in main.js (shop creation). */
    };
    body.querySelector("#a-signup").addEventListener("click", doSignup);
    body.querySelector("#a-back-signin").addEventListener("click", (e) => { e.preventDefault(); renderStep(root, "signin"); });
  }

  if (step === "forgot") {
    body.innerHTML = `
      <div class="a-title">Reset your password</div>
      <p class="a-sub">We'll email you a secure reset link</p>
      <div class="a-error" style="display:none"></div>
      <div class="field" style="margin-bottom:1.1rem"><label for="a-email">Email</label>
        <input class="input" id="a-email" type="email" placeholder="you@shop.com"></div>
      <button class="btn btn-gold" id="a-send" style="width:100%" data-restore="Send reset link">Send reset link</button>
      <button class="btn btn-ghost" id="a-back" style="width:100%;margin-top:.6rem">Back to sign in</button>`;
    const doSend = async () => {
      const email = body.querySelector("#a-email").value.trim();
      if (!email) { formError(body, "Enter your email."); return; }
      setBusy(body.querySelector("#a-send"), true, "Sending…");
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/app.html`,
      });
      setBusy(body.querySelector("#a-send"), false);
      if (error) { formError(body, error.message); return; }
      body.innerHTML = `
        <div class="a-title">Check your inbox</div>
        <p class="a-sub">If ${esc(email)} has an account, a reset link is on its way. The link works for 1 hour.</p>
        <button class="btn btn-ghost" id="a-again" style="width:100%">Back to sign in</button>`;
      body.querySelector("#a-again").addEventListener("click", () => renderStep(root, "signin"));
    };
    body.querySelector("#a-send").addEventListener("click", doSend);
    body.querySelector("#a-back").addEventListener("click", () => renderStep(root, "signin"));
  }

  if (step === "otp") {
    body.innerHTML = `
      <div class="a-title">Sign in with phone</div>
      <p class="a-sub">We'll text you a one-time code</p>
      <div class="a-error" style="display:none"></div>
      <div class="field" style="margin-bottom:1.1rem"><label for="a-phone">Phone (with country code)</label>
        <input class="input" id="a-phone" type="tel" placeholder="+91 98765 43210"></div>
      <button class="btn btn-gold" id="a-send-otp" style="width:100%" data-restore="Send code">Send code</button>
      <button class="btn btn-ghost" id="a-back" style="width:100%;margin-top:.6rem">Back</button>`;
    const doSend = async () => {
      const phone = body.querySelector("#a-phone").value.trim();
      if (!/^\+?[0-9\s-]{8,15}$/.test(phone)) { formError(body, "Enter a valid phone number with country code."); return; }
      setBusy(body.querySelector("#a-send-otp"), true, "Sending code…");
      const { error } = await supabase.auth.signInWithOtp({ phone });
      setBusy(body.querySelector("#a-send-otp"), false);
      if (error) { formError(body, error.message); return; }
      body.innerHTML = `
        <div class="a-title">Enter the code</div>
        <p class="a-sub">Code sent to ${esc(phone)}</p>
        <div class="a-error" style="display:none"></div>
        <div class="field" style="margin-bottom:1.1rem"><label for="a-code">6-digit code</label>
          <input class="input" id="a-code" type="text" inputmode="numeric" maxlength="6" placeholder="123456"></div>
        <button class="btn btn-gold" id="a-verify" style="width:100%" data-restore="Verify &amp; continue">Verify &amp; continue</button>
        <button class="btn btn-ghost" id="a-back" style="width:100%;margin-top:.6rem">Back</button>`;
      const doVerify = async () => {
        const code = body.querySelector("#a-code").value.replace(/\D/g, "");
        if (code.length !== 6) { formError(body, "Enter the 6-digit code."); return; }
        setBusy(body.querySelector("#a-verify"), true, "Verifying…");
        const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
        setBusy(body.querySelector("#a-verify"), false);
        if (error) formError(body, error.message);
      };
      body.querySelector("#a-verify").addEventListener("click", doVerify);
      body.querySelector("#a-back").addEventListener("click", () => renderStep(root, "signin"));
    };
    body.querySelector("#a-send-otp").addEventListener("click", doSend);
    body.querySelector("#a-back").addEventListener("click", () => renderStep(root, "signin"));
  }

  if (step === "reset") {
    body.innerHTML = `
      <div class="a-title">Choose a new password</div>
      <p class="a-sub">Pick something you'll remember</p>
      <div class="a-error" style="display:none"></div>
      <div class="field" style="margin-bottom:1.1rem"><label for="a-pass">New password <span class="faint small">(min 8 chars)</span></label>
        <input class="input" id="a-pass" type="password" autocomplete="new-password" placeholder="••••••••"></div>
      <button class="btn btn-gold" id="a-update" style="width:100%" data-restore="Save new password">Save new password</button>`;
    const doUpdate = async () => {
      const pass = body.querySelector("#a-pass").value;
      if (pass.length < 8) { formError(body, "Password must be at least 8 characters."); return; }
      setBusy(body.querySelector("#a-update"), true, "Saving…");
      const { error } = await supabase.auth.updateUser({ password: pass });
      setBusy(body.querySelector("#a-update"), false);
      if (error) { formError(body, error.message); return; }
      recoveryMode = false;
      toast({ title: "Password updated", body: "You're signed in — welcome back.", tone: "green", iconName: "checkCircle" });
      hideAuthScreen();
      onAuthedCb?.();
    };
    body.querySelector("#a-update").addEventListener("click", doUpdate);
  }
}
