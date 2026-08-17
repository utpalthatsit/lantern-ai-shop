/* ============================================================
   ShopSathi — pages/settings.js
   Shop profile + preferences (real rows in shops & settings).
   ============================================================ */
import { db, getShop, supabase } from "../supabaseClient.js";
import { icon } from "../utils/constants.js";
import { esc } from "../utils/formatters.js";
import { toast } from "../components/toast.js";
import { loadingState, errorState } from "../utils/ui.js";

export function init(root) {
  root.innerHTML = `<div id="setBody">${loadingState("Loading settings…")}</div>`;
}

export async function render(root) {
  const body = root.querySelector("#setBody");
  body.innerHTML = loadingState();
  try {
    const shop = getShop();
    const settings = await db.settings();
    const hoursText = (shop.hours && shop.hours.note) || "";

    body.innerHTML = `
      <div class="card panel" style="margin-bottom:1.2rem">
        <div class="panel-head"><h3>${icon("link")} Share your shop</h3></div>
        <div class="panel-body stack">
          <p class="muted small">Send this link to customers — they can browse your products and chat with your AI assistant right in the browser. No WhatsApp needed.</p>
          <div class="row" style="flex-wrap:wrap;gap:.6rem">
            <input class="input" id="shopLink" readonly value="${esc(location.origin + "/shop.html?shop=" + shop.id)}" style="flex:1;min-width:220px;background:#faf7f0">
            <button class="btn btn-ghost" id="copyLinkBtn">${icon("copy")} Copy</button>
            <button class="btn btn-gold" id="waShareBtn">${icon("messageCircle")} Share on WhatsApp</button>
          </div>
        </div>
      </div>

      <div class="set-grid">
        <div class="card panel">
          <div class="panel-head"><h3>${icon("store")} Shop profile</h3></div>
          <div class="panel-body stack">
            <div class="field"><label>Shop name</label><input class="input" id="s-name" value="${esc(shop.name)}"></div>
            <div class="row">
              <div class="field grow"><label>Category</label>
                <select class="select" id="s-cat">
                  ${["Café", "Barbershop", "Boutique", "Grocery", "Repair Shop", "Restaurant", "Other"].map((c) => `<option ${shop.category === c ? "selected" : ""}>${c}</option>`).join("")}
                </select></div>
              <div class="field" style="width:140px"><label>Currency</label>
                <select class="select" id="s-currency">${["INR", "USD", "EUR", "GBP", "AED"].map((c) => `<option ${(shop.currency || "INR") === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
            </div>
            <div class="row">
              <div class="field grow"><label>Phone</label><input class="input" id="s-phone" value="${esc(shop.phone || "")}"></div>
              <div class="field grow"><label>WhatsApp number</label><input class="input" id="s-wa" value="${esc(shop.whatsapp_number || "")}" placeholder="The number Meta sends from"></div>
            </div>
            <div class="field"><label>Tagline (shows on your storefront)</label><input class="input" id="s-tagline" value="${esc(shop.tagline || "")}" placeholder="Fresh coffee & warm smiles since 2015"></div>
            <div class="field"><label>Address</label><input class="input" id="s-addr" value="${esc(shop.address || "")}"></div>
            <div class="field"><label>GSTIN <span class="faint small">(printed on invoices)</span></label><input class="input" id="s-gstin" value="${esc(shop.gstin || "")}" placeholder="e.g. 27ABCDE1234F1Z5"></div>
            <div class="field"><label>Opening hours (plain text)</label><input class="input" id="s-hours" value="${esc(hoursText)}" placeholder="Mon–Sat 8:00–21:00, Sun 9:00–17:00"></div>
            <button class="btn btn-gold" id="saveShopBtn" style="align-self:flex-start">${icon("check")} Save shop</button>
          </div>
        </div>

        <div class="card panel">
          <div class="panel-head"><h3>${icon("sparkle")} Assistant & automation</h3></div>
          <div class="panel-body stack">
            <label class="check-row"><input type="checkbox" id="s-ai" ${settings?.ai_autoreply_enabled !== false ? "checked" : ""}> AI answers customers automatically on WhatsApp</label>
            <label class="check-row"><input type="checkbox" id="s-reminders" ${settings?.booking_reminders !== false ? "checked" : ""}> Send booking reminders 24h before</label>
            <div class="row">
              <div class="field grow"><label>Default low-stock alert at</label><input class="input" id="s-thresh" type="number" min="0" step="1" value="${settings?.low_stock_threshold ?? 5}"></div>
              <div class="field grow"><label>Language</label>
                <select class="select" id="s-lang">
                  ${[["en", "English"], ["hi", "हिन्दी"], ["en+hi", "English + हिन्दी"], ["es", "Español"], ["ar", "العربية"], ["ta", "தமிழ்"]].map(([v, l]) => `<option value="${v}" ${(settings?.language || shop.language || "en") === v ? "selected" : ""}>${l}</option>`).join("")}
                </select></div>
            </div>
            <button class="btn btn-gold" id="savePrefsBtn" style="align-self:flex-start">${icon("check")} Save preferences</button>
            <div class="divider"></div>
            <p class="faint small">WhatsApp delivery: <b id="waQuickStatus">${settings?.whatsapp_enabled ? "enabled" : "disabled"}</b>. Owner replies go to the customer's WhatsApp when this is on — see the <b>WhatsApp delivery</b> card below.</p>
          </div>
        </div>
      </div>

      <div class="card panel" style="margin-top:1.2rem">
        <div class="panel-head"><h3>${icon("messageCircle")} WhatsApp delivery</h3></div>
        <div class="panel-body stack">
          <p class="muted small">Owner replies and AI answers are sent to the customer's WhatsApp number. This needs the WhatsApp Business Cloud API from Meta — saving the shop number alone isn't enough.</p>
          <div id="waStatus" class="wa-status"><span class="faint small">Checking setup…</span></div>
          <label class="check-row"><input type="checkbox" id="s-wa-enable" disabled> Enable WhatsApp delivery (owner replies + AI answers go out on WhatsApp)</label>
          <p class="faint small" id="waHint"></p>
          <div class="divider"></div>
          <p class="muted small"><b>Connect your own WhatsApp number</b> — paste the credentials from your Meta WhatsApp app (API Setup screen). Every shop on ShopSathi uses its own number.</p>
          <div class="row">
            <div class="field grow"><label>Phone number ID</label><input class="input" id="s-wa-pnid" value="${esc(settings?.wa_phone_number_id || "")}" placeholder="e.g. 123456789012345"></div>
            <div class="field grow"><label>Verify token</label><input class="input" id="s-wa-verify" value="${esc(settings?.wa_verify_token || "")}" placeholder="your random webhook string"></div>
          </div>
          <div class="row">
            <div class="field grow"><label>Access token</label><input class="input" id="s-wa-token" type="password" value="${esc(settings?.wa_token || "")}" placeholder="Meta permanent access token"></div>
            <div class="field grow"><label>App secret</label><input class="input" id="s-wa-appsecret" type="password" value="${esc(settings?.wa_app_secret || "")}" placeholder="App settings → Basic"></div>
          </div>
          <button class="btn btn-gold" id="saveWaCredsBtn" style="align-self:flex-start">${icon("check")} Save WhatsApp credentials</button>
          <details class="wa-steps">
            <summary>${icon("helpCircle")} How to connect WhatsApp (about 5 minutes)</summary>
            <ol class="stack" style="padding-left:1.1rem;margin:.5rem 0 0">
              <li>Open <a href="https://developers.facebook.com" target="_blank" rel="noopener">developers.facebook.com</a> → <b>Create App</b> → add the <b>WhatsApp</b> product → follow the steps to get a test number, a permanent access token, the phone number ID and the app secret (App settings → Basic).</li>
              <li>Paste those values into the <b>4 fields above</b> → click <b>Save WhatsApp credentials</b>. (Every shop connects its own number — no server setup needed.)</li>
              <li>In the Meta dashboard → your app → <b>WhatsApp → Configuration → Webhook</b>, subscribe to <b>messages</b> and set:<br>Callback URL: <code>https://qraizrooahgggbtpqtlc.supabase.co/functions/v1/whatsapp-webhook</code><br>Verify token: the same <b>Verify token</b> you saved above.</li>
              <li>Make sure the WhatsApp number above matches the number Meta gives you (E.164 format, e.g. <code>+919876543210</code>).</li>
              <li>Come back here, reload, and tick <b>Enable WhatsApp delivery</b>. Then message your WhatsApp number to test.</li>
            </ol>
          </details>
        </div>
      </div>

      <div class="card panel" style="margin-top:1.2rem">
        <div class="panel-head"><h3>${icon("shieldCheck")} Team & access</h3></div>
        <div class="panel-body stack">
          <p class="muted small">Team members with access to this shop. Each member signs in with their own account.</p>
          <div id="memberList"></div>
          <div class="row">
            <input class="input" id="memberEmail" type="email" placeholder="teammate@shop.com" style="max-width:280px" aria-label="Team member email">
            <select class="select" id="memberRole" style="width:140px"><option value="manager">Manager</option><option value="staff">Staff</option></select>
            <button class="btn btn-ghost" id="addMemberBtn">${icon("userPlus")} Invite</button>
          </div>
        </div>
      </div>`;

    body.querySelector("#copyLinkBtn").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(body.querySelector("#shopLink").value);
        toast({ title: "Link copied", body: "Paste it anywhere to share your shop.", tone: "green", iconName: "checkCircle" });
      } catch {
        body.querySelector("#shopLink").select();
        document.execCommand("copy");
        toast({ title: "Link copied", body: "Paste it anywhere to share your shop.", tone: "green", iconName: "checkCircle" });
      }
    });
    body.querySelector("#waShareBtn").addEventListener("click", () => {
      const link = body.querySelector("#shopLink").value;
      window.open("https://wa.me/?text=" + encodeURIComponent("Namaste! 👋 Check out " + shop.name + " — browse products and chat with us: " + link), "_blank");
    });

    const { data: members } = await supabase.rpc("my_shop_members");
    const memberList = body.querySelector("#memberList");
    memberList.innerHTML = (members || []).map((m) => `
      <div class="row-item">
        <span class="r-main"><div class="r-title">${esc(m.email || "—")}</div><div class="r-sub">${m.role}</div></span>
      </div>`).join("") || `<p class="faint small">Just you so far.</p>`;

    body.querySelector("#saveShopBtn").addEventListener("click", async () => {
      try {
        await db.saveShop({
          name: body.querySelector("#s-name").value.trim() || shop.name,
          category: body.querySelector("#s-cat").value,
          currency: body.querySelector("#s-currency").value,
          phone: body.querySelector("#s-phone").value.trim() || null,
          whatsapp_number: body.querySelector("#s-wa").value.trim() || null,
          address: body.querySelector("#s-addr").value.trim() || null,
          gstin: body.querySelector("#s-gstin").value.trim() || null,
          tagline: body.querySelector("#s-tagline").value.trim() || null,
          hours: { note: body.querySelector("#s-hours").value.trim() },
        });
        toast({ title: "Shop saved", body: "Your profile is up to date.", tone: "green", iconName: "checkCircle" });
        document.getElementById("shopName").textContent = body.querySelector("#s-name").value.trim();
      } catch (e) {
        toast({ title: "Could not save", body: e.message, tone: "rose", iconName: "alert" });
      }
    });

    body.querySelector("#savePrefsBtn").addEventListener("click", async () => {
      try {
        await db.saveSettings({
          ai_autoreply_enabled: body.querySelector("#s-ai").checked,
          booking_reminders: body.querySelector("#s-reminders").checked,
          low_stock_threshold: Number(body.querySelector("#s-thresh").value) || 5,
          language: body.querySelector("#s-lang").value,
        });
        toast({ title: "Preferences saved", body: "The assistant follows these from now on.", tone: "green", iconName: "checkCircle" });
      } catch (e) {
        toast({ title: "Could not save", body: e.message, tone: "rose", iconName: "alert" });
      }
    });

    const waStatusEl = body.querySelector("#waStatus");
    const waRow = body.querySelector("#s-wa-enable");
    const waHint = body.querySelector("#waHint");
    const setWaStatus = (html) => { if (waStatusEl) waStatusEl.innerHTML = html; };
    const renderWaStatus = (st) => {
      const num = shop.whatsapp_number || st?.whatsapp_number || "";
      const ok = (b) => `<b style="color:${b ? "#2e8b57" : "#c0392b"}">${b ? "✓" : "✗"}</b>`;
      const rows = [
        `<div class="wa-row2"><span>1. WhatsApp number saved on the shop</span> ${ok(!!num)}${num ? ` <span class="faint small">(${esc(num)})</span>` : ""}</div>`,
        `<div class="wa-row2"><span>2. Meta credentials configured on the server</span> ${ok(!!st?.credentials_configured)}</div>`,
        `<div class="wa-row2"><span>3. Webhook connected (incoming WhatsApp messages)</span> ${ok(!!st?.webhook_configured)}</div>`,
        `<div class="wa-row2"><span>4. Delivery enabled</span> ${ok(!!st?.enabled)}</div>`,
      ].join("");
      setWaStatus(rows);
      if (waRow && waHint) {
        const creds = !!st?.credentials_configured;
        const ready = !!num && creds;
        waRow.disabled = !ready;
        waRow.checked = !!st?.enabled;
        const row = waRow.closest(".check-row");
        row.style.opacity = ready ? "1" : ".45";
        row.style.pointerEvents = ready ? "auto" : "none";
        waHint.innerHTML = !num
          ? "Step 1 pending — save your WhatsApp number in the shop profile above."
          : !creds
            ? "Step 2 pending — paste your WhatsApp credentials below and save, then reload to unlock the toggle."
            : !st?.webhook_configured
              ? "Tip: delivery (outgoing) will work, but customers can't start a WhatsApp chat until the webhook is connected (step 3)."
              : "";
      }
    };
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess?.session?.access_token || "";
        const res = await fetch(window.SUPABASE_CONFIG.url + "/functions/v1/whatsapp-status", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ shop_id: shop.id }),
        });
        const st = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(st?.error || res.status);
        renderWaStatus(st);
      } catch (e) {
        setWaStatus(`<span class="faint small">Could not check the server setup: ${esc(e.message || e)}</span>`);
      }
    })();
    body.querySelector("#saveWaCredsBtn").addEventListener("click", async () => {
      try {
        await db.saveSettings({
          wa_token: body.querySelector("#s-wa-token").value.trim() || null,
          wa_phone_number_id: body.querySelector("#s-wa-pnid").value.trim() || null,
          wa_app_secret: body.querySelector("#s-wa-appsecret").value.trim() || null,
          wa_verify_token: body.querySelector("#s-wa-verify").value.trim() || null,
        });
        toast({ title: "WhatsApp credentials saved", body: "Reloading the setup check…", tone: "green", iconName: "checkCircle" });
        render(root);
      } catch (e) {
        toast({ title: "Could not save", body: e.message, tone: "rose", iconName: "alert" });
      }
    });

    waRow?.addEventListener("change", async () => {
      const on = waRow.checked;
      try {
        await db.saveSettings({ whatsapp_enabled: on });
        const qs = document.getElementById("waQuickStatus");
        if (qs) qs.textContent = on ? "enabled" : "disabled";
        toast({
          title: on ? "WhatsApp delivery enabled" : "WhatsApp delivery disabled",
          body: on ? "Owner replies will now be sent over WhatsApp." : "Replies are stored but not sent over WhatsApp.",
          tone: on ? "green" : "gold",
          iconName: on ? "checkCircle" : "alert",
        });
      } catch (e) {
        toast({ title: "Could not update", body: e.message, tone: "rose", iconName: "alert" });
        waRow.checked = !on;
      }
    });

    body.querySelector("#addMemberBtn").addEventListener("click", async () => {
      const email = body.querySelector("#memberEmail").value.trim().toLowerCase();
      if (!email) { toast({ title: "Enter a team member email", tone: "rose", iconName: "alert" }); return; }
      try {
        const { data: user } = await supabase.rpc("find_user_by_email", { email });
        if (!user) {
          toast({ title: "No account found", body: `${email} hasn't signed up yet. Ask them to create an account first.`, tone: "rose", iconName: "alert" });
          return;
        }
        await supabase.from("shop_members").insert({ shop_id: shop.id, user_id: user.id, role: body.querySelector("#memberRole").value });
        toast({ title: `${email} added`, body: "They can now access this shop.", tone: "green", iconName: "checkCircle" });
        render(root);
      } catch (e) {
        toast({ title: "Could not add member", body: e.message, tone: "rose", iconName: "alert" });
      }
    });
  } catch (e) {
    console.error(e);
    body.innerHTML = errorState("Couldn't load settings: " + (e.message || e), true);
    body.querySelector("#errRetry")?.addEventListener("click", () => render(root));
  }
}

export function bind(root) { /* events bound in render */ }
