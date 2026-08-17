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
            <p class="faint small">WhatsApp status: <b>${settings?.whatsapp_enabled ? "enabled" : "disabled"}</b>. Enable it once your WhatsApp Business Cloud API number is connected — see the README.</p>
          </div>
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
