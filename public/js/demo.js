/* ============================================================
   Lantern — demo.js
   In-memory demo backend: shop, conversations, messages,
   inventory, bookings, insights, marketing drafts.
   Used when Supabase is not configured (demo mode).
   ============================================================ */

const now = Date.now();
const t = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();

const state = {
  shop: {
    id: "shop-demo",
    name: "Ember Café",
    tagline: "Coffee, light & small-batch pastries",
    phone: "+91 98765 43210",
    owner: "Priya",
    language: "English + हिन्दी",
    hours: "Mon–Sat 8:00–21:00 · Sun 9:00–17:00",
  },

  conversations: [
    { id: "c1", customer: "Ritu Sharma", phone: "+919876123410", status: "open", lang: "hi",
      last_message_at: t(2), unread: 1, seedG: 0 },
    { id: "c2", customer: "Ananya Iyer", phone: "+919812345670", status: "open", lang: "en",
      last_message_at: t(24), unread: 0, seedG: 1 },
    { id: "c3", customer: "Marcus Lee", phone: "+14405551234", status: "escalated", lang: "en",
      last_message_at: t(75), unread: 1, seedG: 2 },
    { id: "c4", customer: "Fatima Khan", phone: "+919871234560", status: "open", lang: "hi",
      last_message_at: t(190), unread: 0, seedG: 3 },
  ],

  messages: {
    c1: [
      { id: "m1", sender: "customer", content: "hi! are you open now? need 2 cold brews for pickup ☕", created_at: t(2) },
    ],
    c2: [
      { id: "m1", sender: "customer", content: "Hi! Do you have vegan options for breakfast?", created_at: t(60) },
      { id: "m2", sender: "ai", content: "Good morning Ananya! Yes — our avo toast (₹220) and the overnight oats (₹180) are both vegan. The banana bread is also plant-based today. Want me to keep one aside? 🥑", created_at: t(59) },
      { id: "m3", sender: "customer", content: "yes please, 2 avo toasts, pickup at 9:30", created_at: t(30) },
      { id: "m4", sender: "ai", content: "Done! 2× Avo Toast @ ₹220 = ₹440. Ready for pickup at 9:30 AM. Paid on arrival or UPI — whichever you prefer. See you soon! ✨", created_at: t(29) },
    ],
    c3: [
      { id: "m1", sender: "customer", content: "I booked a haircut for today 5pm but I'm running late, can I move it to 6?", created_at: t(90) },
      { id: "m2", sender: "ai", content: "Of course Marcus! Let me check what's free at 6 PM…", created_at: t(89) },
      { id: "m3", sender: "customer", content: "also is there any discount for students this week?", created_at: t(88) },
      { id: "m4", sender: "ai", content: "Good question — I don't want to promise something wrong, so I've passed your question to the owner. They'll reply here shortly. Your 6 PM slot is confirmed in the meantime. 😊", created_at: t(87), escalate: true },
    ],
    c4: [
      { id: "m1", sender: "customer", content: "हमारी birthday party ke liye cake order karna hai, kal 6 baje chahiye", created_at: t(200) },
      { id: "m2", sender: "ai", content: "बधाई हो! 🎉 हमारे पास chocolate fudge aur red velvet available hai — ₹650 / 500g. Kal 6 baje ke liye kaunsa chahiye?", created_at: t(199) },
      { id: "m3", sender: "customer", content: "chocolate fudge please, 1 kg", created_at: t(192) },
      { id: "m4", sender: "ai", content: "Done! 1kg Chocolate Fudge cake @ ₹1,200, ready tomorrow 6 PM. A 20% advance via UPI holds it — want the payment link? 🎂", created_at: t(191) },
    ],
  },

  inventory: [
    { id: "i1", name: "Iced Coffee", sku: "DRK-001", quantity: 26, price: 160, low_stock_threshold: 8, emoji: "🧋" },
    { id: "i2", name: "Cold Brew", sku: "DRK-002", quantity: 7, price: 190, low_stock_threshold: 10, emoji: "🥤" },
    { id: "i3", name: "Avo Toast", sku: "FOD-014", quantity: 12, price: 220, low_stock_threshold: 6, emoji: "🥑" },
    { id: "i4", name: "Croissant", sku: "BAK-003", quantity: 0, price: 120, low_stock_threshold: 8, emoji: "🥐" },
    { id: "i5", name: "Chocolate Fudge Cake", sku: "BAK-007", quantity: 4, price: 650, low_stock_threshold: 3, emoji: "🍰" },
    { id: "i6", name: "Overnight Oats", sku: "FOD-009", quantity: 9, price: 180, low_stock_threshold: 5, emoji: "🥣" },
    { id: "i7", name: "Banana Bread", sku: "BAK-004", quantity: 6, price: 150, low_stock_threshold: 4, emoji: "🍌" },
    { id: "i8", name: "Masala Chai", sku: "DRK-006", quantity: 40, price: 90, low_stock_threshold: 12, emoji: "🫖" },
  ],

  bookings: [
    { id: "b1", service: "Haircut & Beard Trim", customer: "Marcus Lee", phone: "+14405551234", staff: "Aarav",
      start: t(-90 + 300), end: t(-60 + 300), status: "confirmed", note: "Moved from 5 PM at customer's request" },
    { id: "b2", service: "Full Colour", customer: "Ritu Sharma", phone: "+919876123410", staff: "Meera",
      start: t(-30 + 300), end: t(60 + 300), status: "confirmed", note: "" },
    { id: "b3", service: "Kids Cut", customer: "Kabir Nair", phone: "+919812345678", staff: "Aarav",
      start: t(240), end: t(270), status: "confirmed", note: "Prefers scissors, no clippers" },
    { id: "b4", service: "Beard Sculpt", customer: "Dev Patel", phone: "+919871111222", staff: "Aarav",
      start: t(180), end: t(200), status: "confirmed", note: "" },
    { id: "b5", service: "Haircut", customer: "Yuki Tanaka", phone: "+918765432109", staff: "Meera",
      start: t(-420), end: t(-390), status: "completed", note: "" },
    { id: "b6", service: "Fade + Line-Up", customer: "Ali Hassan", phone: "+919800112233", staff: "Aarav",
      start: t(-300), end: t(-270), status: "no_show", note: "No reminder response — flagged for rebooking" },
  ],

  insights: {
    summary: "A strong day, Priya. Iced coffee outsold everything 3-to-1, and 2pm–4pm was your golden window. Masala chai is quietly climbing. One thing to watch: croissants ran out by 11am — restock before Friday's crowd.",
    metrics: { revenue: 18420, orders: 96, topItem: "Iced Coffee", peakHour: "2–4 PM" },
    week: [
      { day: "Mon", value: 11200 }, { day: "Tue", value: 9800 }, { day: "Wed", value: 12400 },
      { day: "Thu", value: 13100 }, { day: "Fri", value: 15600 }, { day: "Sat", value: 21400 },
      { day: "Sun", value: 14800 },
    ],
    bestSellers: [
      { name: "Iced Coffee", count: 41 }, { name: "Masala Chai", count: 28 },
      { name: "Avo Toast", count: 17 }, { name: "Cold Brew", count: 10 },
    ],
    prevWeekRevenue: 14200,
    prevWeekOrders: 81,
  },

  drafts: [
    { id: "d1", channel: "wa", title: "WhatsApp broadcast — Friday restock",
      content: "Guess what's back? 🥐 Fresh croissants land Friday 8am — first 20 get a free cold brew with any pastry. See you behind the counter!",
      why: "Croissants ran out on Thursday. Broadcast to 214 regulars before Friday rush.",
      status: "draft" },
    { id: "d2", channel: "ig", title: "Instagram story — cold brew season",
      content: "Cold brew is officially back 🌞 Brewed 18 hours, served over ice. Tag a friend who needs a caffeine hug this week.",
      why: "Cold brew stock is low — push it while it's fresh, pair with weekend footfall.",
      status: "draft" },
    { id: "d3", channel: "sms", title: "SMS — Tuesday slow-day promo",
      content: "Ember Café: Tuesdays are 20% off all breakfast bowls till 11am. Reply YES to book a table. See you tomorrow!",
      why: "Tuesdays are your slowest day — a 15% dip vs Wednesday. Nudge the 9am crowd.",
      status: "draft" },
  ],
};

const listeners = { conversations: [] };
const uid = () => Math.random().toString(36).slice(2, 10);

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export const demo = {
  isDemo: true,
  shop() { return { ...state.shop }; },

  async conversations() {
    await delay(250);
    return [...state.conversations].sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
  },

  async messages(convId) {
    await delay(200);
    return (state.messages[convId] || []).map((m) => ({ ...m }));
  },


  async sendMessage(convId, content, sender = "owner") {
    await delay(150);
    const conv = state.conversations.find((c) => c.id === convId);
    if (!conv) throw new Error("Conversation not found");
    const msg = { id: uid(), sender, content, created_at: new Date().toISOString() };
    state.messages[convId] = state.messages[convId] || [];
    state.messages[convId].push(msg);
    conv.last_message_at = msg.created_at;
    conv.unread = 0;
    emit();
    return msg;
  },

  /* Simulated customer behaviour: an AI reply arrives a moment later */
  async autoReply(convId) {
    const conv = state.conversations.find((c) => c.id === convId);
    if (!conv) return;
    const replies = {
      c1: "Perfect, 2 cold brews held for you at the counter. Pickup in 15 min — see you soon! 🧊",
      c2: "Ananya, your order is confirmed — 2× Avo Toast ready at 9:30. See you then! ☕",
      c4: "अरे वाह, सब set! 1kg chocolate fudge cake kal 6 baje ready. Payment link bhej doon? 🎂",
    };
    await delay(900);
    const msg = { id: uid(), sender: "ai", content: replies[convId] || "Got it — I've noted that down for you. Anything else I can help with?",
      created_at: new Date().toISOString() };
    state.messages[convId].push(msg);
    conv.last_message_at = msg.created_at;
    emit();
  },

  async simulateIncoming() {
    await delay(6000);
    const id = "c5";
    if (state.conversations.some((c) => c.id === id)) return;
    const conv = { id, customer: "Neha Verma", phone: "+919823456789", status: "open", lang: "hi",
      last_message_at: new Date().toISOString(), unread: 1, seedG: 4 };
    state.conversations.unshift(conv);
    state.messages[id] = [
      { id: uid(), sender: "customer", content: "are you open tomorrow? chai + 2 samosa kitne ka hoga? 😊",
        created_at: new Date().toISOString() },
    ];
    emit();
    return conv;
  },

  async inventory() { await delay(220); return state.inventory.map((i) => ({ ...i })); },
  async createItem(data) {
    await delay(250);
    const item = { id: uid(), ...data, emoji: data.emoji || "📦" };
    state.inventory.unshift(item);
    return { ...item };
  },
  async updateItem(id, patch) {
    await delay(200);
    const item = state.inventory.find((i) => i.id === id);
    Object.assign(item, patch);
    return { ...item };
  },
  async adjustQty(id, delta) {
    await delay(150);
    const item = state.inventory.find((i) => i.id === id);
    item.quantity = Math.max(0, item.quantity + delta);
    return { ...item };
  },

  async bookings() { await delay(250); return state.bookings.map((b) => ({ ...b })); },
  async createBooking(data) {
    await delay(250);
    const b = { id: uid(), ...data, status: "confirmed" };
    state.bookings.unshift(b);
    return { ...b };
  },
  async setBookingStatus(id, status) {
    await delay(150);
    const b = state.bookings.find((x) => x.id === id);
    if (b) b.status = status;
    return b ? { ...b } : null;
  },

  async insights() { await delay(300); return JSON.parse(JSON.stringify(state.insights)); },

  async drafts() { await delay(250); return state.drafts.map((d) => ({ ...d })); },
  async setDraftStatus(id, status) {
    await delay(200);
    const d = state.drafts.find((x) => x.id === id);
    if (d) d.status = status;
    return d ? { ...d } : null;
  },
  async generateDraft() {
    await delay(1600);
    const d = {
      id: uid(), channel: "ig", title: "Instagram — weekend special",
      content: "Weekend ritual unlocked ☕✨ Saturday 8–11am: any pastry + coffee for ₹199. Bring someone you actually like.",
      why: "Saturday morning is your biggest footfall window — bundle to lift average order value.",
      status: "draft",
    };
    state.drafts.unshift(d);
    return { ...d };
  },

  subscribeConversations(cb) {
    listeners.conversations.push(cb);
    return () => {
      const i = listeners.conversations.indexOf(cb);
      if (i >= 0) listeners.conversations.splice(i, 1);
    };
  },
};

function emit() {
  listeners.conversations.forEach((cb) => cb());
}
