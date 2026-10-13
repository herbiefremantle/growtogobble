// Grow to Gobble - the whole app screen. Plain JavaScript, no build step.
// Pages are chosen by the address hash (#/, #/garden, ...); pop-up "sheets" show plant, crop and bed details.
"use strict";

const S = { me: null, cat: null, g: null, installPrompt: null };
const $ = (sel, el = document) => el.querySelector(sel);
const view = $("#view");

// ---- helpers ---------------------------------------------------------------------------------------

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function d(iso) { const [y, m, dd] = iso.split("-").map(Number); return new Date(y, m - 1, dd); }
function today() { return S.g ? d(S.g.today) : new Date(new Date().toDateString()); }
function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
function fmt(iso, withDay) {
  const x = d(iso);
  const s = x.getDate() + " " + MONTHS[x.getMonth()];
  const y = x.getFullYear() !== today().getFullYear() ? " " + x.getFullYear() : "";
  return (withDay ? DAYS[x.getDay()] + " " : "") + s + y;
}
function plant(id) { return S.cat.plants.find((p) => p.id === id); }
function crop(id) { return S.g.crops.find((c) => c.id === id); }
function space(id) { return S.g.spaces.find((s) => s.id === id); }
// Fruit & veg is the main thing; companion plants and flowers are kept in their own lists
const GROUPS = { groups: { emoji: "🤝", name: "Groups" }, veg: { emoji: "🥕", name: "Fruit & veg" }, herb: { emoji: "🌿", name: "Herbs" }, companion: { emoji: "🐞", name: "Companions" }, flower: { emoji: "🌸", name: "Flowers" } };
const isFlower = (p) => p.group !== "veg" && !p.eat;  // grown to look at, not eat
const companionsFor = (p) => p.good_with.filter((x) => plant(x.plant_id).helps && plant(x.plant_id).group !== "veg");
const money = (n) => "£" + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "");
const pence = (n) => (n < 1 ? `${Math.max(1, Math.round(n * 100))}p` : money(n));
const METHOD_SHORT = { sow_out: "🌱 Seeds sown straight in", sow_in: "🏠 Seeds indoors, then planted out", plants: "🪴 Bought as plants" };
// sets, cloves, bulbs and seed potatoes are planted straight in, not sown
const methodLabel = (p, m) => (m === "sow_out" && p.buy_word ? `🌱 ${p.buy_word.charAt(0).toUpperCase() + p.buy_word.slice(1)} planted straight in`
  : m === "plants" && ["bulbs", "corms", "tubers", "crowns", "canes", "slips"].includes(p.buy_word) ? `🪴 ${p.buy_word.charAt(0).toUpperCase() + p.buy_word.slice(1)} planted` : METHOD_SHORT[m]);
const helpsWhat = (p) => p.good_with.filter((x) => plant(x.plant_id).group === "veg");
// Photos or emoji: real photos (from Wikimedia Commons) are an option - remembered on this device
let showPhotos = false;
try { showPhotos = localStorage.getItem("gtg-photos") === "1"; } catch (e) { /* private mode */ }
const pic = (p) => (showPhotos && p.photo ? `<img class="pic" src="${esc(p.photo.src)}" alt="${esc(p.name)}" loading="lazy" data-fallback="${esc(p.emoji)}">` : p.emoji);
const blobCls = (p) => (showPhotos && p.photo ? "has-pic" : "");
const photoToggle = () => `<button class="btn small ${showPhotos ? "primary" : ""}" data-photos aria-pressed="${showPhotos}">${showPhotos ? "🖼️ Photos" : "😀 Icons"}</button>`;
// Plain headings and buttons: strip a decorative emoji from the start of the text (only when words follow it)
const LEAD_EMOJI = /^\s*(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2})(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s*(?=[\p{L}£0-9])/u;
function plainText(root) {
  root.querySelectorAll("h1, h2, h3, h4, .btn, summary b, .seg button, .filter button, .section-title a").forEach((el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode()) && !n.nodeValue.trim()) { /* the first bit of real text */ }
    if (n && LEAD_EMOJI.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(LEAD_EMOJI, "");
  });
}
for (const id of ["view", "sheet-card"]) new MutationObserver(() => plainText(document.getElementById(id))).observe(document.getElementById(id), { childList: true, subtree: true });
// a photo that won't load goes back to its emoji
document.addEventListener("error", (e) => { const t = e.target; if (t.tagName === "IMG" && t.dataset && t.dataset.fallback) t.replaceWith(t.dataset.fallback); }, true);
const SUN_EMOJI = { sun: "☀️", part: "⛅", shade: "🌥️" };
// save one thing about a bed, keeping the rest as it is
const patchSpace = (sp, extra, message) => change("PATCH", `/api/spaces/${sp.id}`, { name: sp.name, kind: sp.kind, soil: sp.soil,
  width_m: sp.width_m, length_m: sp.length_m, ...extra }, message);
// a companion straight into a bed, a few plants - change the number on its own page
const addCompanion = (plantId, spaceId) => change("POST", "/api/crops", { plant_id: plantId, space_id: spaceId, quantity: 3 },
  `${plant(plantId).emoji} 3 ${plant(plantId).name.toLowerCase()} added to ${space(spaceId).name}`);
// Artwork, drawn inline so it themes and scales: a little garden scene, the logo, and Pip the seed.
const SCENE = `<svg class="scene" viewBox="0 0 400 150" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <circle cx="330" cy="46" r="24" fill="#f5c05a"/><circle cx="330" cy="46" r="34" fill="#f5c05a" opacity=".25"/>
  <path d="M0 96 C60 70 120 74 190 92 S320 72 400 88 V150 H0Z" fill="#b9d8a4"/>
  <path d="M0 112 C80 92 150 100 230 112 S350 98 400 106 V150 H0Z" fill="#7fb06b"/>
  <path d="M0 126 H400 V150 H0Z" fill="#8a5d3b"/>
  <path d="M0 126 H400" stroke="#6e4a2e" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round"/>
  <g stroke="#2e7a4d" stroke-width="3" stroke-linecap="round" fill="#3f8f4f">
    <path d="M40 126 V112" fill="none"/><path d="M40 114 c-8-6-14-4-16 0 c6 4 12 4 16 0z"/><path d="M40 112 c6-8 14-8 17-4 c-5 5-12 6-17 4z"/>
    <path d="M110 126 V108" fill="none"/><path d="M110 110 c-9-7-16-5-18 0 c7 5 13 5 18 0z"/><path d="M110 108 c7-9 16-9 19-4 c-6 6-13 7-19 4z"/>
    <path d="M250 126 V110" fill="none"/><path d="M250 112 c-8-6-14-4-16 0 c6 4 12 4 16 0z"/><path d="M250 110 c6-8 14-8 17-4 c-5 5-12 6-17 4z"/>
  </g>
  <g><path d="M178 126 l6-26 l6 26z" fill="#e8742f"/><path d="M184 100 c-4-10-10-12-14-10 M184 100 c0-12 2-16 6-18 M184 100 c4-9 10-11 14-9" stroke="#3f8f4f" stroke-width="3" fill="none" stroke-linecap="round"/></g>
  <g><circle cx="318" cy="112" r="10" fill="#d9442f"/><circle cx="336" cy="116" r="8" fill="#e05a3a"/><path d="M318 102 v-8 M336 108 v-6" stroke="#2e7a4d" stroke-width="3" stroke-linecap="round"/><path d="M318 104 c-6 0-10-4-10-8 c6 0 10 4 10 8z M336 110 c5 0 8-3 8-6 c-5 0-8 3-8 6z" fill="#3f8f4f"/></g>
</svg>`;
const LOGO = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#1e9e5a"/>
  <path d="M20 31 V18" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M20 20 c-2-6-7-8-11-7 c1 5 6 8 11 7z" fill="#dff3e7"/><path d="M20 18 c1-7 6-10 11-9 c-1 6-6 9-11 9z" fill="#fff"/></svg>`;
// Pip: a friendly seed who gives the tips
const PIP = `<svg class="pip-face" viewBox="0 0 46 46" aria-hidden="true">
  <path d="M23 6 c10 0 16 10 16 21 c0 9-7 14-16 14 s-16-5-16-14 C7 16 13 6 23 6z" fill="#b98352"/>
  <path d="M23 6 c-2-4 0-6 3-6 c0 3-1 5-3 6z" fill="#3f8f4f"/>
  <circle cx="17" cy="24" r="2.6" fill="#1f2a1c"/><circle cx="29" cy="24" r="2.6" fill="#1f2a1c"/>
  <circle cx="17.8" cy="23.2" r=".9" fill="#fff"/><circle cx="29.8" cy="23.2" r=".9" fill="#fff"/>
  <path d="M18 30 q5 4 10 0" stroke="#1f2a1c" stroke-width="2" fill="none" stroke-linecap="round"/>
  <circle cx="13" cy="29" r="2.5" fill="#e8742f" opacity=".45"/><circle cx="33" cy="29" r="2.5" fill="#e8742f" opacity=".45"/></svg>`;

const SPACE_KINDS = { bed: { emoji: "🟫", label: "No-dig bed" }, pot: { emoji: "🪴", label: "Pots & containers" }, allotment: { emoji: "🏡", label: "Allotment plot" } };
const STAGES = ["🌰", "🌱", "🌿", "🧺", "😋"];
const stagesFor = (p) => (isFlower(p) ? ["🌰", "🌱", "🌿", "🌸"] : STAGES);  // flowers flower - nothing to eat
const KIND_WORD = { sow_in: "Sow indoors", sow_out: "Sow outside", plant_out: "Plant out", harvest: "Pick" };

// ---- staying up to date: the app reloads itself after a new version goes live -------------------------
// Every reply says which version is running. If it's newer than this page, reload at a calm moment -
// the next page change, or when a pop-up closes - never while you're typing.
const APP_VERSION = (document.querySelector('meta[name="app-version"]') || {}).content || "";
let updateReady = false;
function noteVersion(v) { if (v && APP_VERSION && v !== APP_VERSION) updateReady = true; }
function updateIfReady() {
  if (!updateReady || !$("#sheet").hidden) return false;
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
  location.reload();
  return true;
}
async function checkForUpdate() {
  try { const r = await fetch("/api/version", { cache: "no-store" }); noteVersion((await r.json()).version); } catch (e) { return; }
  updateIfReady();
}
// coming back to the app (e.g. reopening it on a phone) is the usual moment a new version is waiting
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForUpdate(); });
setInterval(checkForUpdate, 30 * 60 * 1000);

async function api(method, path, body) {
  const res = await fetch(path, {
    method, credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  noteVersion(res.headers.get("X-App-Version"));
  if (res.status === 401 && !path.startsWith("/api/login") && !path.startsWith("/api/register")) {
    S.me = null; S.g = null;
    const route = location.hash.replace(/^#\/?/, "").split("?")[0];
    if (!PUBLIC[route]) go("#/welcome");  // keep sign-up links (and their invite code) where they are
    throw new Error("Please log in");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Something went wrong. Try again?");
  return data;
}

// Every change returns the whole garden; store it, celebrate new badges, redraw.
async function change(method, path, body, message) {
  // remember where you were, so ticking a box doesn't jump you back to the top
  const y = window.scrollY, card = $("#sheet-card"), sheetOpen = !$("#sheet").hidden, sheetY = card.scrollTop;
  const openHow = [...document.querySelectorAll("details[open]")].map((el) => el.dataset.key).filter(Boolean);
  try {
    S.g = await api(method, path, body);
    render();
    openHow.forEach((k) => { const el = document.querySelector(`details[data-key="${k}"]`); if (el) el.open = true; });
    window.scrollTo(0, y);
    if (sheetOpen && !$("#sheet").hidden) card.scrollTop = sheetY;
    if (message) toast(message);
    if (S.g.new_badges && S.g.new_badges.length) celebrate(S.g.new_badges);
    return true;
  } catch (e) { toast(e.message); return false; }
}

let toastTimer;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

function confetti() {
  const bits = ["🥕", "🍓", "🌱", "🍅", "🌽", "🥬", "⭐"];
  for (let i = 0; i < 24; i++) {
    const s = document.createElement("div");
    s.className = "confetti"; s.textContent = bits[i % bits.length];
    s.style.left = Math.random() * 100 + "vw"; s.style.animationDelay = Math.random() * 0.6 + "s";
    document.body.appendChild(s); setTimeout(() => s.remove(), 2600);
  }
}

function celebrate(badges) {
  confetti();
  openSheet(`<div class="celebrate">
    ${badges.map((b) => `<span class="e">${b.emoji}</span><h2>New badge: ${esc(b.name)}!</h2><p class="muted">${esc(b.text)}</p>`).join("")}
    <button class="btn primary wide" data-close>Yay! 🎉</button></div>`);
}

// ---- sheets (pop-ups) -------------------------------------------------------------------------------

function openSheet(html) {
  $("#sheet-card").oninput = $("#sheet-card").onchange = $("#sheet-card").onclick = null;  // nothing left over from the last pop-up
  $("#sheet-card").innerHTML = `<button class="sheet-close" data-close aria-label="Close">✕</button>` + html;
  $("#sheet").hidden = false; $("#sheet-card").scrollTop = 0;
  document.body.style.overflow = "hidden";
}
function closeSheet() { $("#sheet").hidden = true; document.body.style.overflow = ""; S.sheet = null; updateIfReady(); }
$("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet" || e.target.closest("[data-close]")) closeSheet(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

// ---- routing ---------------------------------------------------------------------------------------

function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
window.addEventListener("hashchange", () => { if (!updateIfReady()) render(); });

const PAGES = { "": home, garden: gardenPage, calendar: calendarPage, plants: plantsPage, me: mePage, shop: shopPage, start: onboarding, admin: adminPage };
const PUBLIC = { welcome, login: loginPage, join: joinPage, reset: resetPage };

// The invite code from a friend's link, kept on this phone until they sign up
function inviteCode(fromLink) {
  try {
    if (fromLink) localStorage.setItem("gtg-invite", fromLink);
    return fromLink || localStorage.getItem("gtg-invite");
  } catch (e) { return fromLink || null; }
}
function forgetInvite() { try { localStorage.removeItem("gtg-invite"); } catch (e) { /* private mode */ } }
function showInviter(el) {
  const code = inviteCode();
  if (code && el) api("GET", "/api/invites/" + encodeURIComponent(code)).then((r) => { el.textContent = `💌 ${r.name} invited you!`; el.hidden = false; }, () => {});
}

function render() {
  const [route, query] = location.hash.replace(/^#\/?/, "").split("?");
  const linkInvite = new URLSearchParams(query || "").get("invite");
  if (linkInvite) inviteCode(linkInvite);
  if (route === "plants" && query === "now") { plantFilter = "now"; history.replaceState(null, "", "#/plants"); }
  const loggedIn = !!(S.me && S.g);
  $("#topbar").hidden = $("#tabs").hidden = !loggedIn || route === "start";
  document.body.style.paddingBottom = loggedIn && route !== "start" ? "" : "20px";
  view.onclick = null;
  if (!loggedIn) { (PUBLIC[route] || welcome)(); return; }
  if (route === "reset") { $("#topbar").hidden = $("#tabs").hidden = true; resetPage(); return; }
  if (PUBLIC[route]) { go("#/"); return; }
  $("#top-me").textContent = (S.me.name || "Me").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const tab = route === "shop" ? "" : route;
  document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("on", (a.dataset.tab === "home" ? "" : a.dataset.tab) === tab));
  (PAGES[route] || home)();
  // keep any open crop/bed sheet up to date after a change
  if (S.sheet) S.sheet();
}

// ---- logged out ------------------------------------------------------------------------------------

function welcome() {
  view.innerHTML = `
  <section class="hero">
    <div class="hero-scene">${SCENE}</div>
    <h1>Grow to Gobble</h1>
    <p>Grow the food <b>you</b> love to eat. We tell you what to do and when, step by step, from the first seed to your plate.</p>
    <div class="journey">
      <div class="on"><b>📦</b>Make a bed</div><div class="on"><b>🌱</b>Sow</div><div class="on"><b>🌿</b>Grow</div><div class="on"><b>🧺</b>Pick</div><div class="on"><b>😋</b>Eat</div>
    </div>
    <p id="invited" hidden style="font-weight:800;color:var(--forest);margin:0 0 12px"></p>
    <div class="stack" style="max-width:360px;margin:0 auto">
      <a class="btn primary wide" href="#/join">Start growing - it's free</a>
      <a class="btn wide" href="#/login">I already have an account</a>
      <button class="btn ghost wide" id="share-app">📤 Share Grow to Gobble</button>
      <div id="share-out"></div>
    </div>
  </section>
  <div class="card tint-sun" style="margin-top:24px">
    <h3>🧒 Simple enough for a 10-year-old</h3>
    <p class="muted" style="margin:0">Every job is a short list of steps with pictures. Tick them off, earn badges and eat what you grow.</p>
  </div>
  <div class="card tint-leaf"><h3>📦 No digging needed</h3><p class="muted" style="margin:0">Build a no-dig bed with cardboard and compost, or grow in pots on a patio.</p></div>
  <div class="card tint-sky"><h3>🔔 We'll remind you</h3><p class="muted" style="margin:0">Your phone gets a nudge when it's time to sow, plant, water, pick and protect from frost, with dates for where you live.</p></div>`;
  $("#share-app").onclick = () => shareApp($("#share-out"));
  showInviter($("#invited"));
}

// Share the app itself (not a personal invite) - the phone's share menu, or copy / WhatsApp / email / text
async function shareApp(outEl) {
  const url = location.origin + "/";
  const text = "Grow to Gobble - grow the food you love to eat, step by step. Simple enough for kids 🌱";
  if (navigator.share) {
    try { await navigator.share({ title: "Grow to Gobble", text, url }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const msg = encodeURIComponent(text + " " + url);
  outEl.innerHTML = `<div class="checkbox" style="text-align:left"><input type="text" readonly value="${esc(url)}" onclick="this.select()">
    <div class="row"><button class="btn small" data-copy="${esc(url)}">📋 Copy</button>
    <a class="btn small" href="https://wa.me/?text=${msg}" target="_blank" rel="noopener">💬 WhatsApp</a>
    <a class="btn small" href="mailto:?subject=${encodeURIComponent("Grow to Gobble")}&body=${msg}">✉️ Email</a>
    <a class="btn small" href="sms:?&body=${msg}">📱 Text</a></div></div>`;
  outEl.onclick = (e) => { const c = e.target.closest("[data-copy]"); if (c) navigator.clipboard.writeText(c.dataset.copy).then(() => toast("Link copied 📋"), () => toast("Select the link and copy it")); };
}

function loginPage() {
  view.innerHTML = `<div class="auth-card"><div class="hero" style="padding-bottom:0"><div class="big">🧑‍🌾</div><h1>Welcome back</h1></div>
  <form class="card" id="f">
    <label class="field" for="email">Email</label><input id="email" type="email" autocomplete="email" required>
    <label class="field" for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required>
    <div id="err"></div>
    <button class="btn primary wide" style="margin-top:16px">Log in</button>
  </form><p class="small muted" style="text-align:center"><a href="#/join">New here? Make an account</a></p>
  <p class="small muted" style="text-align:center">Forgotten your password? Ask whoever runs Grow to Gobble for a reset link.</p></div>`;
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    try { S.me = await api("POST", "/api/login", { email: $("#email").value, password: $("#pw").value }); await boot(); }
    catch (err) { $("#err").innerHTML = `<div class="error">${esc(err.message)}</div>`; }
  };
}

function joinPage() {
  const invite = inviteCode();
  view.innerHTML = `<div class="auth-card"><div class="hero" style="padding-bottom:0"><div class="big">🌱</div><h1>Let's get growing</h1><p id="invited" style="margin:0;font-weight:800;color:var(--forest)"></p></div>
  <form class="card" id="f">
    <label class="field" for="name">Your first name</label><input id="name" type="text" autocomplete="given-name" maxlength="40" required>
    <label class="field" for="email">Email</label><input id="email" type="email" autocomplete="email" required>
    <label class="field" for="pw">Password <span class="muted small">(8 or more letters)</span></label><input id="pw" type="password" autocomplete="new-password" minlength="8" required>
    <label class="field" for="pc">Postcode <span class="muted small">(so dates fit your weather)</span></label><input id="pc" type="text" autocomplete="postal-code" placeholder="e.g. LS6 or LS6 2AB">
    <p class="small muted" style="margin-top:4px">We only keep the first part (like LS6), never your full address.</p>
    <label class="check"><input type="checkbox" id="age"> <span>I'm 13 or older, <b>or</b> a grown-up is setting this up with me.</span></label>
    <div id="err"></div>
    <button class="btn primary wide" style="margin-top:16px">Create my garden</button>
  </form><p class="small muted" style="text-align:center"><a href="#/login">Already have an account? Log in</a></p></div>`;
  showInviter($("#invited"));
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    try {
      S.me = await api("POST", "/api/register", { name: $("#name").value, email: $("#email").value, password: $("#pw").value, postcode: $("#pc").value, age_ok: $("#age").checked, invite });
      forgetInvite();
      await boot("#/start");
    } catch (err) { $("#err").innerHTML = `<div class="error">${esc(err.message)}</div>`; }
  };
}

// ---- onboarding ------------------------------------------------------------------------------------

const onb = { step: 1, counts: { bed: 1, pot: 0, allotment: 0 }, built: null, picked: new Set(), filter: "all" };

function onboarding() {
  if (onb.step === 1) {
    view.innerHTML = `<div class="hero" style="padding-top:10px"><div class="big">🏡</div><h1>Hi ${esc(S.me.name)}! Where will you grow?</h1>
      <p>Pick as many as you like. You can add more later.</p></div>
      ${Object.entries(SPACE_KINDS).map(([k, v]) => `
        <div class="card choice">
          <span class="e">${v.emoji}</span>
          <div><b>${v.label}</b><div class="small muted">${
            { bed: "Made with cardboard and compost", pot: "Pots, tubs, grow bags, window boxes", allotment: "A whole plot to fill" }[k]}</div></div>
          <div class="counter"><button class="btn small" data-dec="${k}" aria-label="Fewer">−</button><b>${onb.counts[k]}</b><button class="btn small" data-inc="${k}" aria-label="More">+</button></div>
        </div>`).join("")}
      ${onb.counts.bed + onb.counts.allotment ? `<div class="card"><b>Are your beds already built?</b>
        <div class="chips" style="margin-top:8px"><button class="btn small ${onb.built === true ? "primary" : ""}" data-built="1">✅ Yes, ready to plant</button>
        <button class="btn small ${onb.built === false ? "primary" : ""}" data-built="0">🛠️ Not yet - show me how</button></div></div>` : ""}
      <button class="btn primary wide" id="next" ${Object.values(onb.counts).some((n) => n) ? "" : "disabled"}>Next: choose your food 👉</button>`;
    view.onclick = (e) => {
      const inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]");
      if (inc) { onb.counts[inc.dataset.inc] = Math.min(9, onb.counts[inc.dataset.inc] + 1); onboarding(); }
      if (dec) { onb.counts[dec.dataset.dec] = Math.max(0, onb.counts[dec.dataset.dec] - 1); onboarding(); }
      const bt = e.target.closest("[data-built]");
      if (bt) { onb.built = bt.dataset.built === "1"; onboarding(); }
    };
    $("#next").onclick = async () => {
      for (const [kind, n] of Object.entries(onb.counts)) {
        const base = { bed: "Bed", pot: "Pot", allotment: "Allotment" }[kind];
        for (let i = 1; i <= n; i++) S.g = await api("POST", "/api/spaces", { name: n > 1 ? `${base} ${i}` : (kind === "pot" ? "My pots" : "My " + base.toLowerCase()), kind,
          built: kind === "pot" ? null : onb.built });
      }
      onb.step = 2; view.onclick = null; onboarding();
    };
    return;
  }
  if (onb.step === 2) {
    const onlyPots = S.g.spaces.every((s) => s.kind === "pot");
    const list = filteredPlants(onb.filter, ["veg", "herb"]).filter((p) => !onlyPots || p.where.includes("pot"));
    view.innerHTML = `<div class="hero" style="padding-top:10px"><div class="big">😋</div><h1>What do you love to eat?</h1>
      <p>Only grow what you'll eat, so nothing goes to waste. Tap your favourites. Green ones are the easiest to start with.</p></div>
      ${filterBar(onb.filter)}
      <div class="grid">${list.map((p) => tile(p, onb.picked.has(p.id))).join("")}</div>
      <div style="position:sticky;bottom:12px;margin-top:16px"><button class="btn primary wide" id="add" ${onb.picked.size ? "" : "disabled"}>
        ${onb.picked.size ? `Add ${onb.picked.size} to my garden 🌱` : "Tap the food you like"}</button></div>`;
    view.onclick = (e) => {
      const f = e.target.closest("[data-filter]");
      if (f) { onb.filter = f.dataset.filter; onboarding(); return; }
      const t = e.target.closest("[data-plant]");
      if (t) { const id = t.dataset.plant; onb.picked.has(id) ? onb.picked.delete(id) : onb.picked.add(id); onboarding(); }
    };
    $("#add").onclick = async () => {
      view.onclick = null;
      S.g = await api("POST", "/api/crops/bulk", { crops: [...onb.picked] });
      onb.step = 3; onboarding();
    };
    return;
  }
  confetti();
  const first = S.g.crops.flatMap((c) => c.jobs).filter((j) => j.kind !== "buy" && j.status !== "done").sort((a, b) => a.start.localeCompare(b.start))[0];
  view.innerHTML = `<div class="hero"><div class="big">🎉</div><h1>Your garden plan is ready!</h1>
    <p>We've worked out when to do everything for ${esc(S.me.region.name)}.</p></div>
    ${first ? `<div class="card tint-leaf"><div class="small muted"><b>Your first job</b></div><div class="job"><div class="job-emoji">${plant(first.plant_id).emoji}</div>
      <div class="job-body"><div class="job-title">${esc(first.title)}</div><div class="job-when">${whenText(first)}</div></div></div></div>` : ""}
    <div class="card tint-sun"><b>📍 Next: choose where they grow</b><p class="small muted" style="margin:4px 0 0">They aren't in any beds yet. Put each one where you want it, or tap "Suggest a layout" and we'll share them out for you to check first.</p></div>
    <div class="card"><b>🛒 Then: get your seeds</b><p class="small muted" style="margin:4px 0 0">Your shopping list has a one-tap link for each one.</p></div>
    <button class="btn primary wide" id="done">Let's go! 👉</button>`;
  $("#done").onclick = () => { onb.step = 1; go("#/"); };
}

function filteredPlants(filter, group = "veg") {
  const now = today(), groups = [].concat(group);
  return S.cat.plants.filter((p) => groups.includes(p.group)).filter((p) => {
    if (["sun", "part", "shade"].includes(filter)) return p.sun.includes(filter);
    if (filter === "1" || filter === "2" || filter === "3") return p.level === Number(filter);
    if (filter === "pot") return p.where.includes("pot");
    if (filter === "now") return Object.values(p.next).some((w) => w && daysBetween(now, d(w[0])) <= 30);
    return true;
  }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

function filterBar(current, group = "veg") {
  const opts = group === "flower" ? [["all", "All"], ["sun", "☀️ Sunny spot"], ["part", "⛅ Half shade"], ["shade", "🌥️ Shady spot"], ["pot", "🪴 Good in pots"]] : [["all", "All"], ["1", "🟢 Easy peasy"], ["2", "🟠 A bit more care"], ["3", "🔴 More care"], ["pot", "🪴 Good in pots"], ["now", "📅 Can start soon"]];
  return `<div class="filter">${opts.map(([k, l]) => `<button data-filter="${k}" class="${current === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
}

function tile(p, picked, have, helpsLine) {
  const lv = S.cat.levels[p.level];
  const extra = p.group === "companion" || helpsLine ? `<span class="when">Helps ${helpsWhat(p).slice(0, 5).map((x) => plant(x.plant_id).emoji).join("")}</span>`
    : p.group === "flower" ? `<span class="when">${p.sun.map((x) => SUN_EMOJI[x]).join("")} · ${p.height_cm >= 100 ? p.height_cm / 100 + "m" : p.height_cm + "cm"} tall</span>` : "";
  return `<button class="tile ${picked ? "picked" : ""}" data-plant="${p.id}">${have ? `<span class="have" title="In your garden">🌱</span>` : ""}
    <span class="blob l${p.level} ${blobCls(p)}">${pic(p)}</span><span class="n">${esc(p.name)}</span>${extra}<span class="chip l${p.level}">${lv.emoji} ${esc(lv.name)}</span></button>`;
}

// ---- jobs ------------------------------------------------------------------------------------------

function whenText(job) {
  const t = today();
  if (job.status === "done") return "Done ✅";
  if (job.status === "waiting") return job.kind === "harvest" || job.kind === "care" ? "Once it's growing" : "Once you've sown them";
  if (job.status === "missed") return "Missed - ended " + fmt(job.end);
  if (job.status === "now") {
    const left = daysBetween(t, d(job.end));
    if (["harvest", "care", "eat", "store"].includes(job.kind)) return "Now until " + fmt(job.end);
    return left <= 0 ? "Last day today!" : left <= 7 ? `Hurry - ${left} day${left === 1 ? "" : "s"} left` : "Do it by " + fmt(job.end);
  }
  const until = daysBetween(t, d(job.start));
  if (until <= 1) return "Starts tomorrow";
  if (until <= 14) return `Starts in ${until} days (${fmt(job.start, true)})`;
  return "From " + fmt(job.start);
}

function jobCard(job, opts = {}) {
  const p = plant(job.plant_id);
  const c = crop(job.crop_id);
  const hot = job.status === "now" && daysBetween(today(), d(job.end)) <= 7 && !["harvest", "care", "eat", "store"].includes(job.kind);
  const done = job.status === "done";
  const canTick = job.status !== "waiting" && job.action !== "batch";
  const tickLabel = { sow: "I've sown them", plant: "I've planted them", harvest: "I've picked some!" }[job.action] || "Done";
  let extra = "";
  if (job.kind === "buy" && !done) {
    const links = (p.links[c.method] || []).map((l) => `<a class="btn small" href="${esc(l.url)}" target="_blank" rel="sponsored noopener">🛒 ${esc(l.shop)}</a>`).join("");
    extra = `<div class="shop-links" style="margin-top:8px">${links}</div>`;
  }
  if (job.action === "batch" && job.status === "now") extra = `<button class="btn small" style="margin-top:8px" data-batch="${esc(job.key)}">🔁 Sow another batch</button>`;
  if (job.status === "missed" && ["sow", "plant"].includes(job.action)) {
    extra = `<div class="row" style="margin-top:8px"><button class="btn small" data-replan="${job.crop_id}">📅 Plan it for next time</button>
      <button class="btn small ghost" data-tick="${esc(job.key)}">I did it anyway</button></div>`;
  }
  const row = rowLabel(c);
  const where = (opts.showSpace && c.space_name ? ` · ${esc(c.space_name)}` : "") + (row ? ` · ${row}` : "");
  return `<div class="job">
    <div class="job-emoji k-${job.kind}">${p.emoji}<small>${job.emoji}</small></div>
    <div class="job-body">
      <div class="job-title">${esc(job.title)}</div>
      ${opts.noDrop ? "" : `<button class="job-x" data-dropcrop="${c.id}" aria-label="Remove ${esc(p.name.toLowerCase())} from my plan" title="Not growing this? Remove it">✕</button>`}
      <div class="job-when ${hot ? "hot" : ""}">${job.emoji} ${whenText(job)}${where}</div>
      ${job.steps.length ? `<details class="how" data-key="${esc(job.key)}" ${opts.open ? "open" : ""}><summary>Show me how</summary><ol class="steps">${job.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></details>` : ""}
      ${extra}
    </div>
    ${canTick && job.status !== "missed" ? `<button class="tick ${done ? "done" : ""}" data-tick="${esc(job.key)}" ${done ? 'data-undo="1"' : ""} aria-label="${done ? "Undo" : tickLabel}" title="${done ? "Undo" : tickLabel}">${done ? "✓" : ""}</button>` : ""}
  </div>`;
}

const CHEERS = { sow: "Brilliant! Seeds sown 🌱", plant: "Nice planting! 🌿", harvest: "You picked your own food! 🧺", eat: "Gobbled! 😋" };

// one click handler for every job button, wherever it appears
document.addEventListener("click", async (e) => {
  // just trying things out? take a plant (and all its jobs) off the plan in one go
  const drop = e.target.closest("[data-dropcrop]");
  if (drop) {
    e.stopPropagation();
    const c = crop(Number(drop.dataset.dropcrop)), p = plant(c.plant_id), row = rowLabel(c), m = mixOf(c);
    if (m) {
      if (!confirm(`Remove the whole ${m.name.split(":")[0].toLowerCase()} planting${c.space_name ? " in " + c.space_name : ""} (${groupOf(c).length} plants)? Their jobs go too.`)) return;
      await change("DELETE", `/api/crops/${c.id}?whole_group=true`, null, `${m.name.split(":")[0]} removed from your plan`);
      return;
    }
    if (!confirm(`Remove ${p.name.toLowerCase()}${row ? " (" + row + ")" : ""}${c.space_name ? " in " + c.space_name : ""} from your plan? Its jobs go too.`)) return;
    await change("DELETE", `/api/crops/${c.id}`, null, `${p.name} removed from your plan`);
    return;
  }
  const out = e.target.closest("[data-unplace]");
  if (out) {
    e.stopPropagation();
    const c = crop(Number(out.dataset.unplace));
    await change("PATCH", `/api/crops/${c.id}`, { plant_id: c.plant_id, clear_space: true }, `${plant(c.plant_id).name} taken out - it's under Not placed yet 📍`);
    return;
  }
  const empty = e.target.closest("[data-empty]");
  if (empty) {
    const sp = space(Number(empty.dataset.empty));
    const ids = activeCrops().filter((c) => c.space_id === sp.id).map((c) => c.id);
    if (!confirm(`Take all ${ids.length} plants out of ${sp.name}? They stay in your plan under "Not placed yet".`)) return;
    await change("POST", "/api/layout", { moves: ids.map((id) => ({ crop_id: id, space_id: null })) }, `${sp.name} emptied 📤`);
    return;
  }
  const tick = e.target.closest("[data-tick]");
  if (tick) {
    const key = tick.dataset.tick, undo = !!tick.dataset.undo;
    const action = key.split(":")[1];
    await change("POST", "/api/done", { key, undo }, undo ? "Undone" : (CHEERS[action] || "Done! ✅"));
    return;
  }
  const batch = e.target.closest("[data-batch]");
  if (batch) { await change("POST", "/api/done", { key: batch.dataset.batch }, "Added another batch 🔁"); return; }
  const replan = e.target.closest("[data-replan]");
  if (replan) { await change("POST", `/api/crops/${replan.dataset.replan}/replan`, null, "Moved to the next chance 📅"); return; }
  const ac = e.target.closest("[data-addcomp]");
  if (ac) {
    if (await addCompanion(ac.dataset.addcomp, Number(ac.dataset.space))) ac.outerHTML = `<span class="chip grey">✅ Added</span>`;
    return;
  }
  const bp = e.target.closest("[data-bedplan]");
  if (bp) { openBedPlan(Number(bp.dataset.bedplan)); return; }
  const mx = e.target.closest("[data-open-mix]");
  if (mx) { openMix(mx.dataset.openMix, mx.dataset.space ? Number(mx.dataset.space) : null); return; }
  const sz = e.target.closest("[data-setpot]");
  if (sz) { const sp = space(Number(sz.dataset.space)); await patchSpace(sp, { pot_size: sz.dataset.setpot, pot_count: sp.pot_count || 1 }, `🪴 ${potName(potSize(sz.dataset.setpot))} - here's what fits`); return; }
  // resizing a planting grown together: every plant in it scales up or down together
  const rz = e.target.closest("[data-resizemix]");
  if (rz) {
    const g = activeCrops().filter((c) => c.mixgrp === Number(rz.dataset.resizemix));
    const factor = Number(rz.dataset.area) / groupFoot(g);
    const sized = g.map((c) => ({ c, qty: Math.max(1, Math.round(c.qty * factor)) }));
    for (const x of sized.slice(0, -1)) await api("PATCH", `/api/crops/${x.c.id}`, { plant_id: x.c.plant_id, quantity: x.qty });
    const last = sized[sized.length - 1];
    await change("PATCH", `/api/crops/${last.c.id}`, { plant_id: last.c.plant_id, quantity: last.qty }, `Resized: ${sized.map((x) => `${x.qty} ${plant(x.c.plant_id).name.toLowerCase()}`).join(", ")}`);
    return;
  }
  const fp = e.target.closest("[data-flowers]");
  if (fp) { openFlowerPlan(Number(fp.dataset.flowers)); return; }
  const pl = e.target.closest("[data-open-plant]");
  if (pl) { openPlant(pl.dataset.openPlant, pl.dataset.space ? Number(pl.dataset.space) : null, pl.dataset.method, pl.dataset.after); return; }
  const cr = e.target.closest("[data-open-crop]");
  if (cr) { openCrop(Number(cr.dataset.openCrop)); return; }
  const sp = e.target.closest("[data-open-space]");
  if (sp) { openSpace(Number(sp.dataset.openSpace)); return; }
  const sb = e.target.closest("[data-setbuilt]");
  if (sb) {
    const target = space(Number(sb.dataset.setbuilt));
    await change("PATCH", `/api/spaces/${target.id}`, { name: target.name, kind: target.kind, soil: target.soil, width_m: target.width_m,
      length_m: target.length_m, built: sb.dataset.v === "1" }, sb.dataset.v === "1" ? "Great - no building instructions needed ✅" : "Let's build it! 📦");
    if (sb.dataset.v === "0") openSpace(target.id);
    return;
  }
  const lay = e.target.closest("[data-layout]");
  if (lay) openLayout(lay.dataset.layout === "unplaced");
});

function activeCrops() { return S.g.crops.filter((c) => !c.finished_on); }
function allJobs() { return activeCrops().flatMap((c) => c.jobs); }

// ---- today -----------------------------------------------------------------------------------------

// Today: kept deliberately short - your next few jobs, and at most ONE reminder card.
let homeAll = false, homeAhead = false;  // which fold-outs on Today are open
function home() {
  const jobs = allJobs();
  const t = today();
  const recentMiss = (j) => j.status === "missed" && ["sow", "plant"].includes(j.action) && daysBetween(d(j.end), t) <= 21;
  const buyNow = S.g.shopping.filter((s) => s.job.status === "now" || s.job.status === "soon" || s.job.status === "missed");
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (!S.g.spaces.length) { go("#/start"); return; }

  const unbuilt = S.g.spaces.filter((s) => s.kind !== "pot" && s.built === 0 && s.nodig_done.length < S.cat.nodig_steps.length);
  const unknown = S.g.spaces.filter((s) => s.kind !== "pot" && s.built === null);
  const unplaced = activeCrops().filter((c) => !c.space_id);

  // only the single most useful nudge, in this order
  let nudge = "";
  if (!activeCrops().length) nudge = `<div class="card tint-leaf"><b>🌱 Your garden is empty</b><p class="small muted">Pick some food you love to eat and we'll plan it for you.</p><a class="btn primary" href="#/plants">Choose plants</a></div>`;
  else if (unknown.length) nudge = `<div class="card tint-soil"><b>🟫 Is ${esc(unknown[0].name)} already built?</b>
      <div class="row" style="margin-top:8px"><button class="btn small primary" data-setbuilt="${unknown[0].id}" data-v="1">✅ Yes, it's ready</button><button class="btn small" data-setbuilt="${unknown[0].id}" data-v="0">🛠️ Not yet - show me how</button></div></div>`;
  else if (unbuilt.length) nudge = `<div class="card tint-soil row" style="justify-content:space-between" data-open-space="${unbuilt[0].id}">
      <div><b>📦 Build ${esc(unbuilt[0].name)}</b><div class="small muted">${unbuilt[0].nodig_done.length} of ${S.cat.nodig_steps.length} steps done</div></div><span class="btn small">Let's build 👉</span></div>`;
  else nudge = pushBanner();

  // this week: anything you can do in the next 7 days; then what's coming in the 30 days after that
  const open = (j) => j.kind !== "buy" && j.status !== "done" && j.status !== "waiting";
  const week = jobs.filter((j) => open(j) && (recentMiss(j) || (j.status !== "missed" && daysBetween(t, d(j.start)) <= 7)))
    .sort((a, b) => a.end.localeCompare(b.end));
  const month = jobs.filter((j) => open(j) && j.status !== "missed" && daysBetween(t, d(j.start)) > 7 && daysBetween(t, d(j.start)) <= 30)
    .sort((a, b) => a.start.localeCompare(b.start));
  // ...and everything after that, in date order, for planning ahead
  const ahead = jobs.filter((j) => open(j) && j.status !== "missed" && daysBetween(t, d(j.start)) > 30).sort((a, b) => a.start.localeCompare(b.start));
  const byMonth = [];
  ahead.forEach((j) => {
    const k = j.start.slice(0, 7), last = byMonth[byMonth.length - 1];
    if (last && last.k === k) last.jobs.push(j); else byMonth.push({ k, jobs: [j] });
  });
  // the numbers: how far through the season, what needs doing now, and what's still to buy
  const all = jobs.filter((j) => j.kind !== "buy"), doneN = all.filter((j) => j.status === "done").length;
  const pct = all.length ? Math.round((100 * doneN) / all.length) : 0, toBuy = S.g.spaces.reduce((n, sp) => n + sp.cost.to_buy, 0);
  const C = 2 * Math.PI * 14;
  view.innerHTML = `
    <div class="today-head"><small>${fmt(S.g.today, true)} · ${esc(S.me.region.short)}</small><h1>${hello}, ${esc(S.me.name)}</h1></div>
    <div class="stats">
      <div class="stat"><svg class="ring" viewBox="0 0 34 34" aria-hidden="true"><circle class="bg" cx="17" cy="17" r="14" fill="none" stroke-width="4"/>
        <circle class="fg" cx="17" cy="17" r="14" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}" transform="rotate(-90 17 17)"/></svg>
        <b>${pct}%</b><span>of the season's jobs done</span></div>
      <div class="stat ${week.length ? "warn" : ""}"><b>${week.length}</b><span>job${week.length === 1 ? "" : "s"} this week</span></div>
      <a class="stat" href="#/shop"><b>${money(toBuy)}</b><span>seeds & plants still to buy</span></a>
    </div>
    ${nudge}
    <div class="section-title"><h2>This week</h2><span class="small muted">next 7 days</span></div>
    <div class="card">${week.length ? week.map((j) => jobCard(j, { showSpace: true })).join("") :
      `<div class="empty"><b>Nothing to do this week.</b><br>Enjoy the garden.</div>`}</div>
    ${month.length ? `<details class="card later" ${homeAll ? "open" : ""} id="later"><summary><b>Next 30 days</b> <span class="small muted">${month.length} job${month.length === 1 ? "" : "s"}</span></summary>
      ${month.map((j) => jobCard(j, { showSpace: true })).join("")}</details>` : ""}
    ${ahead.length ? `<details class="card later" ${homeAhead ? "open" : ""} id="ahead"><summary><b>Further ahead</b> <span class="small muted">${ahead.length} job${ahead.length === 1 ? "" : "s"} · by month</span></summary>
      ${byMonth.map((g) => { const [y, mo] = g.k.split("-").map(Number);
        return `<h4 class="month-head">${MONTHS_LONG[mo - 1]}${y !== t.getFullYear() ? " " + y : ""} <span class="small muted">${g.jobs.length}</span></h4>${g.jobs.map((j) => jobCard(j, { showSpace: true })).join("")}`; }).join("")}</details>` : ""}
    ${buyNow.length ? `<a href="#/shop" class="link-row">🛒 <b>${buyNow.length} thing${buyNow.length === 1 ? "" : "s"} to buy soon</b> <span>${buyNow.slice(0, 5).map((x) => plant(x.plant_id).emoji).join(" ")} 👉</span></a>` : ""}`;
  const later = $("#later");
  if (later) later.ontoggle = () => { homeAll = later.open; };  // stays open after ticking something
  const aheadEl = $("#ahead");
  if (aheadEl) aheadEl.ontoggle = () => { homeAhead = aheadEl.open; };
  wirePush();
}

// Things they haven't picked yet that can be started now (or within 2 weeks), easiest first.
function plantNow() {
  const have = new Set(activeCrops().map((c) => c.plant_id));
  const fits = new Set(S.g.spaces.map((s) => (s.kind === "pot" ? "pot" : "bed")));
  const t = today();
  const out = [];
  for (const p of S.cat.plants) {
    if (!["veg", "herb"].includes(p.group) || have.has(p.id) || !p.where.some((w) => fits.has(w))) continue;
    let best = null;
    for (const m of p.methods) {
      const w = p.next[m];
      if (!w || daysBetween(t, d(w[0])) > 14 || d(w[1]) < t) continue;
      if (!best || d(w[0]) < d(best.w[0])) best = { m, w };
    }
    if (best) out.push({ p, ...best });
  }
  return out.sort((a, b) => a.p.level - b.p.level || a.w[1].localeCompare(b.w[1]));
}

function plantNowStrip() {
  const list = plantNow();
  if (!list.length) return "";
  const t = today();
  return `<div class="section-title"><h2>Plant now</h2><a href="#/plants?now">See all</a></div>
    <div class="strip">${list.map(({ p, m, w }) => {
      const open = d(w[0]) <= t;
      return `<button class="tile" data-open-plant="${p.id}" data-method="${m}"><span class="blob l${p.level} ${blobCls(p)}">${pic(p)}</span>
        <span class="n">${esc(p.name)}</span><span class="when">${S.cat.methods[m].emoji} ${open ? "Until " + fmt(w[1]) : "From " + fmt(w[0])}</span></button>`;
    }).join("")}</div>`;
}

function journeyCard() {
  const crops = activeCrops();
  if (!crops.length) return "";
  const best = Math.max(...crops.map((c) => c.stage));
  const labels = ["Plan", "Sow", "Grow", "Pick", "Eat"];
  return `<div class="card"><div class="small muted"><b>Your grow-to-gobble journey</b></div>
    <div class="journey" style="margin:8px 0 0">${STAGES.map((e, i) => `<div class="${i <= best ? "on" : "off"}"><b>${e}</b>${labels[i]}</div>`).join("")}</div></div>`;
}

function suggestionCard(sp) {
  const s = sp;
  const free = s.suggestion.empty_now ? "Nothing growing in " + esc(sp.name) + " yet"
    : daysBetween(today(), d(s.suggestion.free_from)) <= 0 ? esc(sp.name) + " is nearly free" : esc(sp.name) + " is free from " + fmt(s.suggestion.free_from);
  return `<div class="card tint-leaf"><b>${SPACE_KINDS[sp.kind].emoji} ${free}</b>
    <div class="small muted">Don't leave it bare - you could grow:</div>
    <div class="suggest">${s.suggestion.plants.map((x) => suggestChip(x, `data-open-plant="${x.plant_id}" data-space="${sp.id}"`)).join("")}</div>${dupNotes(s.suggestion.plants)}</div>`;
}

// ---- notifications ---------------------------------------------------------------------------------

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function pushBanner() {
  if (S.g.has_push) return "";
  let dismissed = false;
  try { dismissed = localStorage.getItem("sts-push-later") === S.g.today; } catch (e) { /* private mode */ }
  if (dismissed) return "";
  if (isIOS && !standalone) {
    return `<div class="card tint-sky"><b>🔔 Want reminders on your iPhone?</b>
      <p class="small" style="margin:6px 0 0">First add this app to your Home Screen: tap <b>Share</b> <span aria-hidden="true">⬆️</span> then <b>Add to Home Screen</b>. Open it from there and turn on reminders.</p></div>`;
  }
  if (!pushSupported) return "";
  return `<div class="card tint-sky"><b>🔔 Get a nudge when it's time</b>
    <p class="small muted" style="margin:4px 0 10px">We'll tell you when to sow, plant, water and pick, and warn you about frost.</p>
    <div class="row"><button class="btn primary small" data-push-on>Turn on reminders</button><button class="btn ghost small" data-push-later>Not now</button></div></div>`;
}

function wirePush() {
  document.querySelectorAll("[data-push-on]").forEach((b) => (b.onclick = enablePush));
  document.querySelectorAll("[data-push-later]").forEach((b) => (b.onclick = () => {
    try { localStorage.setItem("sts-push-later", S.g.today); } catch (e) { /* ignore */ }
    render();
  }));
}

function b64ToBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function enablePush() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { toast("Reminders are blocked. You can allow them in your phone's settings."); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(S.me.push_key) });
    await change("POST", "/api/push/subscribe", sub.toJSON(), "Reminders are on 🔔");
  } catch (e) { toast("Couldn't turn on reminders: " + e.message); }
}

async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await api("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint }); await sub.unsubscribe(); }
    S.g = await api("GET", "/api/garden"); render(); toast("Reminders off on this device");
  } catch (e) { toast(e.message); }
}

// ---- garden ----------------------------------------------------------------------------------------

function nextJob(c) {
  const open = c.jobs.filter((j) => !["done", "missed"].includes(j.status) && j.kind !== "buy");
  return open.find((j) => j.status === "now") || open[0];
}

// Several rows of the same crop in one bed (sown a few weeks apart): "Row 1", "Row 2"... in sowing order
function rowLabel(c) {
  const same = S.g.crops.filter((x) => x.plant_id === c.plant_id && x.space_id === c.space_id && !x.finished_on)
    .sort((a, b) => (a.sown_on || a.planted_on || a.anchor).localeCompare(b.sown_on || b.planted_on || b.anchor) || a.id - b.id);
  return same.length > 1 && !c.finished_on ? "Row " + (same.findIndex((x) => x.id === c.id) + 1) : "";
}

function cropRow(c, opts = {}) {
  const p = plant(c.plant_id), j = nextJob(c), row = rowLabel(c);
  const when = c.sown_on ? "sown " + fmt(c.sown_on) : c.planted_on ? "planted " + fmt(c.planted_on) : "";
  return `<div class="crop-row" data-open-crop="${c.id}">
    <span class="e ${blobCls(p)}">${pic(p)}</span>
    <div class="n">${esc(p.name)}${c.variety ? ` <span class="vname">'${esc(c.variety)}'</span>` : ""}${row ? ` <span class="chip grey">${row}${when ? " · " + when : ""}</span>` : ""}<div class="small muted" style="font-weight:600">${j ? esc(j.title) + " · " + whenText(j) : c.finished_on ? "Finished" : "All done 🎉"}</div></div>
    <div class="stage" aria-label="Stage ${c.stage + 1} of ${stagesFor(plant(c.plant_id)).length}">${stagesFor(plant(c.plant_id)).map((e, i) => `<span class="${i <= c.stage ? "on" : ""}">${e}</span>`).join("")}</div>
    ${opts.unplace && c.space_id ? `<button class="unplace" data-unplace="${c.id}" aria-label="Take ${esc(p.name)} out of this bed" title="Take out of this bed">✕</button>` : ""}
  </div>`;
}
const inBedRow = (c) => cropRow(c, { unplace: true });

// ---- the Garden tab: a bird's-eye plot (default) or a plain list -----------------------------------------

let gardenView = "plot", plotMonth = 0, plotEdit = false, placing = null, plotZoom = 1, selected = null;
const FAMILY_COLOUR = { cabbage: "#7fb06b", onion: "#d8c48a", bean: "#a6d98f", potato: "#e0ad74", squash: "#f2c45a", carrot: "#f2a564",
  beet: "#c07a9c", leaf: "#93d07f", corn: "#f5d76e", fruit: "#e88a8a", herb: "#7cc4a0", flower: "#f4a3b8", sweetpotato: "#dc9466" };
// Things on the plan that aren't growing spaces: default size in metres, round or not, colour
const FEATURES = {
  tree: { emoji: "🌳", name: "Tree", w: 3, h: 3, round: true, fill: "#5f9f52" },
  bush: { emoji: "🌿", name: "Bush", w: 1.2, h: 1.2, round: true, fill: "#7cb862" },
  hedge: { emoji: "🌲", name: "Hedge", w: 4, h: 0.8, fill: "#4f8a45" },
  shed: { emoji: "🛖", name: "Shed", w: 2, h: 2.5, fill: "#a07a55" },
  greenhouse: { emoji: "🪟", name: "Greenhouse", w: 1.8, h: 2.4, fill: "#d5ecf2" },
  compost: { emoji: "♻️", name: "Compost bin", w: 1, h: 1, fill: "#6e4a2e" },
  water: { emoji: "💧", name: "Water butt", w: 0.7, h: 0.7, round: true, fill: "#5b9bc4" },
  path: { emoji: "🚶", name: "Path", w: 1, h: 4, fill: "#ddd2b8" },
  patio: { emoji: "🪑", name: "Patio", w: 3, h: 3, fill: "#cbc3b2" },
  pond: { emoji: "🦆", name: "Pond", w: 1.6, h: 1.6, round: true, fill: "#72b6da" },
  house: { emoji: "🏠", name: "House", w: 6, h: 3, fill: "#bfae95" },
};
// Trees and bushes can be a fruit (app/plants.py FRUIT): what it is, when to pick, what it needs
const fruitOf = (f) => (f && f.variety && S.cat.fruit ? S.cat.fruit.find((x) => x.id === f.variety) : null);
const pickMonths = (fr) => (fr.pick.length ? (fr.pick.length === 1 ? MONTHS[fr.pick[0] - 1] : `${MONTHS[fr.pick[0] - 1]}-${MONTHS[fr.pick[fr.pick.length - 1] - 1]}`) : "");
function fruitInfo(fr) {
  if (fr.plain) return `<ul class="steps">${fr.care.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
  const now = fr.pick.includes(new Date().getMonth() + 1);
  return `${now ? `<p class="fruit-now">🧺 It's picking time now!</p>` : ""}
    ${fr.examples ? `<p class="small muted" style="margin:0 0 8px">Kinds: ${esc(fr.examples)}</p>` : ""}
    <p style="margin:0 0 8px"><b>🧺 When to pick:</b> ${esc(fr.pick_text)}</p>
    <p style="margin:0 0 8px"><b>👀 Is it ripe?</b> ${esc(fr.ripe)}</p>
    <p style="margin:0 0 8px"><b>🫙 Keeping it:</b> ${esc(fr.keep)}</p>
    <b>✂️ Looking after it</b><ul class="steps">${fr.care.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    ${fr.pests ? `<p style="margin:8px 0 0"><b>🐛 Watch out:</b> ${esc(fr.pests)}</p>` : ""}`;
}
function fruitSheet(f) {
  const fr = fruitOf(f);
  if (!fr) return;
  openSheet(`${showPhotos && fr.photo ? `<figure class="hero-pic"><img src="${esc(fr.photo.src)}" alt="${esc(fr.name)}" data-fallback="">
      <figcaption><a href="${esc(fr.photo.page)}" target="_blank" rel="noopener">📷 ${esc(fr.photo.credit || "Wikimedia Commons")}</a></figcaption></figure>` : ""}<h2>${fr.emoji} ${esc(f.name)}</h2>${f.name !== fr.name ? `<p class="small muted" style="margin-top:-6px">${esc(fr.name)}</p>` : ""}
    ${fr.kinds.length ? `<div class="row" style="margin-bottom:10px"><span>🏷️ ${f.cultivar ? `<b>${esc(f.cultivar)}</b>` : `<span class="muted">Which variety? Not chosen</span>`}</span>
      <button class="btn small" id="kpick">${f.cultivar ? "Change" : "Choose"}</button></div>` : ""}${fruitInfo(fr, f)}`);
  const k = $("#kpick"); if (k) k.onclick = () => kindPicker(f);
}
// "Which apple is it?" - remembered on the tree. Buying one? Tap a taste and it suggests the best ones.
function kindPicker(f) {
  const fr = fruitOf(f);
  if (!fr || !fr.kinds.length) return;
  const tags = [...new Set(fr.kinds.flatMap((k) => k.tags))];
  let tag = null;
  const save = async (name) => {
    const auto = f.name === fr.name || f.name.startsWith(fr.name + " '");  // still the name we gave it, not one they typed
    if (await change("PATCH", `/api/features/${f.id}`, { cultivar: name, ...(auto ? { name: name ? `${fr.name} '${name}'`.slice(0, 40) : fr.name } : {}) },
      name ? `🏷️ Saved - it's ${name}` : "Variety cleared")) closeSheet();
  };
  const draw = () => {
    openSheet(`<h2>🏷️ Which ${esc(fr.name.toLowerCase())} is it?</h2>
      <p class="small muted" style="margin-top:-6px">Pick yours so we remember it. Still to buy one? Tap what you'd like and we'll show the best ones.</p>
      ${tags.length > 2 ? `<div class="chips">${tags.map((t) => `<button class="btn small ${t === tag ? "primary" : "ghost"}" data-ktag="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
      <div class="varieties" style="margin-top:10px">${fr.kinds.filter((k) => !tag || k.tags.includes(tag)).map((k) => `<button class="variety ${f.cultivar === k.name ? "on" : ""}" data-kind="${esc(k.name)}">
        <b>${esc(k.name)}</b>${k.tags.map((t) => `<span class="vt">${esc(t)}</span>`).join("")}<small>${esc(k.why)}</small></button>`).join("")}</div>
      <label class="field" for="kother">Something else?</label>
      <div class="row" style="flex-wrap:nowrap"><input id="kother" type="text" maxlength="40" placeholder="Type the name on its label" value="${f.cultivar && !fr.kinds.some((k) => k.name === f.cultivar) ? esc(f.cultivar) : ""}">
        <button class="btn small primary" id="ksave">Save</button></div>
      ${f.cultivar ? `<button class="btn small ghost" id="kclear" style="margin-top:10px">I don't know which it is</button>` : ""}`);
    const card = $("#sheet-card");
    card.querySelectorAll("[data-ktag]").forEach((b) => (b.onclick = () => { tag = tag === b.dataset.ktag ? null : b.dataset.ktag; draw(); }));
    card.querySelectorAll("[data-kind]").forEach((b) => (b.onclick = () => save(b.dataset.kind)));
    $("#ksave").onclick = () => { const v = $("#kother").value.trim(); if (v) save(v); };
    const cl = $("#kclear"); if (cl) cl.onclick = () => save("");
  };
  draw();
}
// "What kind of tree is it?" - calls back with the chosen fruit (or a plain one)
function fruitPicker(kind, onPick) {
  const list = (S.cat.fruit || []).filter((x) => x.kind === kind);
  openSheet(`<h2>${kind === "tree" ? "🌳 What kind of tree?" : "🌿 What kind of bush?"}</h2>
    <p class="small muted" style="margin-top:-6px">Pick a fruit and we'll tell you when to pick it and how to look after it.</p>
    <div class="fruit-list">${list.map((x) => `<button class="fruit-opt" data-fruit="${x.id}"><span class="fe ${showPhotos && x.photo ? "has-pic" : ""}">${showPhotos && x.photo ? `<img class="pic" src="${esc(x.photo.src)}" alt="" loading="lazy" data-fallback="${esc(x.emoji)}">` : x.emoji}</span>
      <span><b>${esc(x.name)}</b><span class="small muted">${x.plain ? "Just there - no fruit to pick" : `${esc(x.examples)} · pick ${pickMonths(x)}`}</span></span></button>`).join("")}</div>`);
  $("#sheet-card").querySelectorAll("[data-fruit]").forEach((b) => (b.onclick = () => { closeSheet(); onPick(list.find((x) => x.id === b.dataset.fruit)); }));
}

function gardenTabs() {
  return `<div class="seg" role="tablist"><button data-gview="plot" class="${gardenView === "plot" ? "on" : ""}">🗺️ My plan</button>
    <button data-gview="list" class="${gardenView === "list" ? "on" : ""}">📋 List</button></div>`;
}

function gardenPage() {
  view.onclick = (e) => { const b = e.target.closest("[data-gview]"); if (b) { gardenView = b.dataset.gview; placing = null; plotEdit = false; gardenPage(); } };
  if (gardenView === "plot") plotPage(); else gardenList();
}

function spaceSize(s) {
  if (s.kind === "pot") return { w: 1.1, h: 1.1 };
  const def = s.kind === "allotment" ? { w: 5, h: 25 } : { w: 1.2, h: 2.4 };
  return { w: s.width_m || def.w, h: s.length_m || def.h };
}

// Pots: common sizes, and what fits in them
const potSize = (key) => S.cat.pot_sizes.find((x) => x.key === key);
const potName = (z) => (/cm/.test(z.name) ? z.name : `${z.name} (${z.label})`);
function potIcon(z, max = 34) {  // a little drawing of the pot, to scale
  if (!z.draw) return `<svg width="${max}" height="${max * 0.6}" viewBox="0 0 60 36"><rect x="2" y="${z.key === "growbag" ? 14 : 8}" width="56" height="${z.key === "growbag" ? 18 : 24}" rx="${z.key === "growbag" ? 9 : 3}" class="potdraw"/></svg>`;
  const r = (z.draw / 60) * (max / 2);
  return `<svg width="${max}" height="${max}" viewBox="0 0 ${max} ${max}"><path d="M ${max / 2 - r} ${max - r * 1.5} L ${max / 2 + r} ${max - r * 1.5} L ${max / 2 + r * 0.75} ${max - 1} L ${max / 2 - r * 0.75} ${max - 1} Z" class="potdraw"/></svg>`;
}
// what fits in one of these pots - fruit & veg and herbs first, easiest and soonest first
function potFits(key, groups = ["veg", "herb", "companion", "flower"]) {
  const t = today();
  const soon = (p) => Object.values(p.next).some((w) => w && daysBetween(t, d(w[0])) <= 60);
  return S.cat.plants.filter((p) => groups.includes(p.group) && p.pot_fits && p.pot_fits[key] > 0)
    .sort((a, b) => soon(b) - soon(a) || a.level - b.level || a.name.localeCompare(b.name));
}
const fitChip = (p, key, spaceId) => `<button class="btn small ghost" data-open-plant="${p.id}" ${spaceId ? `data-space="${spaceId}"` : ""}>${p.emoji} ${esc(p.name)} <span class="muted">×${p.pot_fits[key]}</span></button>`;

// Bed shapes: a rectangle unless it's been made round, a triangle, a corner bed, or any shape you like.
// Freeform corners are stored in the bed's own box and stretch with it.
const SHAPES = [["rect", "▭", "Rectangle"], ["circle", "◯", "Round"], ["triangle", "△", "Triangle"], ["corner", "◺", "Corner"], ["free", "✏️", "Any shape"]];
const FREE_START = [[0.3, 0], [1, 0.1], [0.9, 0.75], [0.45, 1], [0, 0.6]];
const shapeType = (s) => (s.kind === "pot" ? "pot" : (s.shape && s.shape.type) || "rect");  // pots are drawn round
function outlinePts(s, w, h) {
  const t = shapeType(s);
  if (t === "circle" || t === "pot") return Array.from({ length: 32 }, (_, i) => { const a = (i / 32) * 2 * Math.PI - Math.PI / 2; return [w / 2 + (Math.cos(a) * w) / 2, h / 2 + (Math.sin(a) * h) / 2]; });
  if (t === "triangle") return [[w / 2, 0], [w, h], [0, h]];
  if (t === "corner") return [[0, 0], [w, 0], [0, h]];
  if (t === "free") {
    const P = s.shape.pts, sx = Math.max(...P.map((q) => q[0])) || 1, sy = Math.max(...P.map((q) => q[1])) || 1;
    return P.map(([x, y]) => [(x * w) / sx, (y * h) / sy]);
  }
  return [[0, 0], [w, 0], [w, h], [0, h]];
}
function shapeSvg(s, x, y, w, h, attrs) {
  const t = shapeType(s);
  if (t === "rect") return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(0.08, w / 10)}" ${attrs}/>`;
  if (t === "circle" || t === "pot") return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${attrs}/>`;
  return `<polygon points="${outlinePts(s, w, h).map(([px, py]) => `${x + px},${y + py}`).join(" ")}" ${attrs}/>`;
}
const polyArea = (P) => Math.abs(P.reduce((a, [x1, y1], k) => { const [x2, y2] = P[(k + 1) % P.length]; return a + x1 * y2 - x2 * y1; }, 0)) / 2;

// Beds without a saved spot sit side by side, left to right in the order they were added (pots at the end),
// to the right of anything already placed
function plotPositions() {
  const pos = {}, GAP = 0.6;
  const placed = S.g.spaces.filter((s) => s.pos_x != null);
  placed.forEach((s) => (pos[s.id] = { x: s.pos_x, y: s.pos_y }));
  let x = placed.length ? Math.max(...placed.map((s) => s.pos_x + spaceSize(s).w)) + GAP : 0.5;
  const auto = S.g.spaces.filter((s) => s.pos_x == null).sort((a, b) => (a.kind === "pot") - (b.kind === "pot") || a.id - b.id);
  auto.forEach((s) => { pos[s.id] = { x, y: 0.6 }; x += spaceSize(s).w + GAP; });
  return pos;
}

// Everything on the plan as boxes in metres: {type, id, x, y, w, h, ...}
function planItems() {
  const pos = plotPositions();
  return [
    ...S.g.spaces.map((s) => ({ type: "space", id: s.id, ...pos[s.id], ...spaceSize(s), a: s.angle || 0, grp: s.grp, s })),
    ...S.g.garden.features.map((f) => ({ type: "feature", id: f.id, x: f.x, y: f.y, w: f.w, h: f.h, a: f.angle || 0, grp: f.grp, f })),
  ];
}

// ---- geometry for turned (rotated) boxes: angles are degrees clockwise round the box's middle ----
const rad = (a) => (a * Math.PI) / 180;
function corners(i) {
  const cx = i.x + i.w / 2, cy = i.y + i.h / 2, c = Math.cos(rad(i.a || 0)), sn = Math.sin(rad(i.a || 0));
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const dx = (sx * i.w) / 2, dy = (sy * i.h) / 2;
    return [cx + dx * c - dy * sn, cy + dx * sn + dy * c];
  });
}
function box(i) { const cs = corners(i), xs = cs.map((p) => p[0]), ys = cs.map((p) => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; }
// do two turned boxes overlap? (separating-axis test; just touching doesn't count)
function overlaps(A, B, tol = 0.03) {
  const shrink = (i) => ({ ...i, x: i.x + tol, y: i.y + tol, w: Math.max(0.01, i.w - 2 * tol), h: Math.max(0.01, i.h - 2 * tol) });
  const pa = corners(shrink(A)), pb = corners(shrink(B));
  for (const poly of [pa, pb]) for (let k = 0; k < 4; k++) {
    const [x1, y1] = poly[k], [x2, y2] = poly[(k + 1) % 4], nx = y2 - y1, ny = x1 - x2;
    const a = pa.map(([x, y]) => x * nx + y * ny), b = pb.map(([x, y]) => x * nx + y * ny);
    if (Math.max(...a) <= Math.min(...b) || Math.max(...b) <= Math.min(...a)) return false;
  }
  return true;
}
// where B's middle is, in A's own turned frame
function localOf(A, px, py) {
  const t = rad(A.a || 0), cx = A.x + A.w / 2, cy = A.y + A.h / 2, dx = px - cx, dy = py - cy;
  return { lx: dx * Math.cos(t) + dy * Math.sin(t), ly: -dx * Math.sin(t) + dy * Math.cos(t) };
}
let boundaryEdit = false, bSel = null;
let multi = false, picked = new Set();  // "Select several": picked things, as "space:3" / "feature:7"
const itemKey = (i) => `${i.type}:${i.id}`;
// is this thing part of what's selected? (one thing, a whole saved group, or the several picked)
const inSelection = (i) => (selected && selected.type === i.type && selected.id === i.id)
  || (selected && selected.type === "group" && i.grp === selected.grp) || picked.has(itemKey(i));
// The satellite view under the plan. Where the plan sits on the map is remembered ON THIS DEVICE ONLY
// (localStorage) - it's never sent to the server. {lat0, lng0, ox, oy}: the first tap of the trace, and how far
// the plan's own corner is from it in metres.
const satKey = () => "gtg-sat-" + (S.me && S.me.id);
function satAnchor() { try { return JSON.parse(localStorage.getItem(satKey()) || "null"); } catch (e) { return null; } }
function setSatAnchor(a) { try { if (a) localStorage.setItem(satKey(), JSON.stringify(a)); else localStorage.removeItem(satKey()); } catch (e) { /* private mode */ } }
let showSat = false;
try { showSat = localStorage.getItem("gtg-satview") === "1"; } catch (e) { /* private mode */ }

// Live satellite tiles laid under the plan, lined up with the traced outline (the tiles are shown, not stored)
function satTiles(b, ppm) {
  const A = satAnchor();
  if (!showSat || !A) return "";
  const k = Math.cos((A.lat0 * Math.PI) / 180);
  const toPlan = (lat, lng) => [(lng - A.lng0) * 111320 * k - A.ox, (A.lat0 - lat) * 110574 - A.oy];
  const toLatLng = (X, Y) => [A.lat0 - (Y + A.oy) / 110574, A.lng0 + (X + A.ox) / (111320 * k)];
  const tx = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
  const ty = (lat, z) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };
  const lng = (x, z) => (x / 2 ** z) * 360 - 180;
  const lat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
  const [north, west] = toLatLng(b.x0, b.y0), [south, east] = toLatLng(b.x0 + b.W, b.y0 + b.H);
  let z = Math.max(12, Math.min(19, Math.ceil(Math.log2(156543.03 * k * ppm))));
  while (z > 12 && (tx(east, z) - tx(west, z) + 1) * (ty(south, z) - ty(north, z) + 1) > 48) z--;  // not too many tiles
  const imgs = [];
  for (let x = tx(west, z); x <= tx(east, z); x++) for (let y = ty(north, z); y <= ty(south, z); y++) {
    const [X0, Y0] = toPlan(lat(y, z), lng(x, z)), [X1, Y1] = toPlan(lat(y + 1, z), lng(x + 1, z));
    imgs.push(`<image href="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}" x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" preserveAspectRatio="none"/>`);
  }
  return `<g class="sat">${imgs.join("")}</g>`;
}

  // editing the garden's outline: which corner or side is picked
let snapOn = true, showPaths = true, showSizes = false, plotScroll = { l: 0, t: 0 }, lastPlan = null;
try {
  snapOn = localStorage.getItem("gtg-snap") !== "0";
  showPaths = localStorage.getItem("gtg-paths") !== "0";
  showSizes = localStorage.getItem("gtg-sizes") === "1";
} catch (e) { /* private mode */ }
const remember = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch (e) { /* private mode */ } };
const m = (v) => (v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/\.?0+$/, "") + " m";

// Dropped near another bed? Slide it up alongside, KEEPING ITS OWN ANGLE: its nearest corner ends up a path's
// width from the other bed's side (so beds at different angles leave a wedge-shaped path), and its end lines up
// with the other bed's end if it's close. Beds within 5 degrees of each other straighten up to match exactly.
function snapNextTo(M, items) {
  if (!snapOn || M.type !== "space" || M.s.kind === "pot") return null;
  const gap = S.g.garden.path_w, mx = M.x + M.w / 2, my = M.y + M.h / 2;
  let best = null;
  for (const N of items) {
    if (N.type !== "space" || N.id === M.id || N.s.kind === "pot") continue;
    const { lx, ly } = localOf(N, mx, my);
    if (Math.abs(lx) > N.w / 2 + gap + Math.max(M.w, M.h) / 2 + 1 || Math.abs(ly) > N.h / 2 + Math.max(M.w, M.h) / 2 + 0.5) continue;
    const dist = Math.hypot(lx, ly);
    if (best && dist >= best.dist) continue;
    const diff = ((((M.a || 0) - (N.a || 0)) % 360) + 540) % 360 - 180;
    const a = Math.abs(diff) < 5 ? N.a || 0 : M.a || 0;
    const T = { ...M, a };
    const pts = corners(T).map(([x, y]) => localOf(N, x, y)), side = lx >= 0 ? 1 : -1;
    const nearX = side > 0 ? Math.min(...pts.map((p) => p.lx)) : Math.max(...pts.map((p) => p.lx));
    const shiftX = side * (N.w / 2 + gap) - nearX;
    const topY = Math.min(...pts.map((p) => p.ly)), level = -N.h / 2 - topY;
    const shiftY = Math.abs(level) < 0.6 ? level : 0;
    const t = rad(N.a || 0);
    const wx = shiftX * Math.cos(t) - shiftY * Math.sin(t), wy = shiftX * Math.sin(t) + shiftY * Math.cos(t);
    best = { dist, x: Math.round((M.x + wx) * 100) / 100, y: Math.round((M.y + wy) * 100) / 100, a, to: N };
  }
  return best;
}

// A copy of a bed right next door: same size and angle, a path's width away. The arrow pressed means that way
// ON SCREEN, so we use whichever of the bed's own four sides points most that way.
function copySpot(it, dir) {
  const gap = S.g.garden.path_w, t = rad(it.a || 0), c = Math.cos(t), sn = Math.sin(t);
  const want = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
  const best = [[1, 0, it.w], [-1, 0, it.w], [0, 1, it.h], [0, -1, it.h]]
    .map(([lx, ly, size]) => ({ lx, ly, size, dot: (lx * c - ly * sn) * want[0] + (lx * sn + ly * c) * want[1] }))
    .sort((p, q) => q.dot - p.dot)[0];
  const ox = best.lx * (best.size + gap), oy = best.ly * (best.size + gap);
  const cx = it.x + it.w / 2 + ox * c - oy * sn, cy = it.y + it.h / 2 + ox * sn + oy * c;
  return { x: Math.round((cx - it.w / 2) * 100) / 100, y: Math.round((cy - it.h / 2) * 100) / 100 };
}

// Paths: between two beds whose sides face each other a little apart - a strip if they're parallel,
// a wedge (wider at one end) if they're at different angles
function pathsBetween(items) {
  const beds = items.filter((i) => i.type === "space" && i.s.kind !== "pot"), out = [];
  const mid = (e) => [(e[0][0] + e[1][0]) / 2, (e[0][1] + e[1][1]) / 2];
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const edgesOf = (i) => { const c = corners(i); return [[c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]]; };
  for (const A of beds) for (const B of beds) {
    if (A.id >= B.id) continue;
    const ca = [A.x + A.w / 2, A.y + A.h / 2], cb = [B.x + B.w / 2, B.y + B.h / 2];
    const ea = edgesOf(A).sort((p, q) => d(mid(p), cb) - d(mid(q), cb))[0];
    const eb = edgesOf(B).sort((p, q) => d(mid(p), ca) - d(mid(q), ca))[0];
    // the two sides must face each other...
    const ma = mid(ea), mb = mid(eb);
    if ((mb[0] - ma[0]) * (ma[0] - ca[0]) + (mb[1] - ma[1]) * (ma[1] - ca[1]) <= 0) continue;
    if ((ma[0] - mb[0]) * (mb[0] - cb[0]) + (ma[1] - mb[1]) * (mb[1] - cb[1]) <= 0) continue;
    // ...at a similar angle (up to 45 degrees apart)...
    const angA = Math.atan2(ea[1][1] - ea[0][1], ea[1][0] - ea[0][0]), angB = Math.atan2(eb[1][1] - eb[0][1], eb[1][0] - eb[0][0]);
    const turn = Math.abs(((((angA - angB) * 180) / Math.PI) % 180 + 180) % 180);
    if (Math.min(turn, 180 - turn) > 45) continue;
    // ...and close: pair each corner with the nearest corner opposite
    const [a1, a2] = ea, b1 = d(a1, eb[0]) <= d(a1, eb[1]) ? eb[0] : eb[1], b2 = b1 === eb[0] ? eb[1] : eb[0];
    const g1 = d(a1, b1), g2 = d(a2, b2);
    if (Math.min(g1, g2) < 0.12 || Math.max(g1, g2) > 1.6) continue;  // wider than that is just open ground, not a path
    const pts = [a1, a2, b2, b1].map((p) => p.join(",")).join(" ");
    const wide = Math.round(Math.max(g1, g2) * 100), narrow = Math.round(Math.min(g1, g2) * 100);
    out.push(`<polygon points="${pts}" class="pathstrip"><title>Path, ${wide - narrow > 5 ? `${narrow}-${wide}cm wide` : `${narrow}cm wide`}</title></polygon>`);
  }
  return out.join("");
}

// Width along the bottom edge, length up the right-hand side
function sizeMarks(i, ppm) {
  if (!showSizes) return "";
  const fs = 10 / ppm, gap = 4 / ppm;
  return `<g class="dims"><text x="${i.x + i.w / 2}" y="${i.y + i.h + fs + gap}" font-size="${fs}" text-anchor="middle">${m(i.w)}</text>
    <text x="${i.x + i.w + gap}" y="${i.y + i.h / 2}" font-size="${fs}" text-anchor="middle" transform="rotate(90 ${i.x + i.w + gap} ${i.y + i.h / 2})">${m(i.h)}</text></g>`;
}
// Each edge of the garden's boundary, measured
function outlinePoints() {
  const g = S.g.garden;
  return g.shape ? g.shape.map((p) => [...p]) : g.w ? [[0, 0], [g.w, 0], [g.w, g.h], [0, g.h]] : null;
}
function edgeMarks(ppm) {
  const g = S.g.garden;
  if ((!showSizes && !boundaryEdit) || !g.w) return "";
  const pts = g.shape || [[0, 0], [g.w, 0], [g.w, g.h], [0, g.h]];
  const fs = 11 / ppm, cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return `<g class="dims edge">${pts.map(([x1, y1], k) => {
    const [x2, y2] = pts[(k + 1) % pts.length], len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 0.5) return "";
    let mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const nx = -(y2 - y1) / len, ny = (x2 - x1) / len, out = (mx - cx) * nx + (my - cy) * ny > 0 ? 1 : -1;  // push the label outside
    mx += nx * out * fs * 1.1; my += ny * out * fs * 1.1;
    let ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    return `<text x="${mx}" y="${my + fs * 0.35}" font-size="${fs}" text-anchor="middle" transform="rotate(${ang} ${mx} ${my})">${m(len)}</text>`;
  }).join("")}</g>`;
}

function planBounds(items) {
  const g = S.g.garden;
  if (g.w && g.h) {
    const m = boundaryEdit ? 3 : 0;  // room to drag corners outwards
    return { x0: -0.6 - m, y0: -0.8 - m, W: g.w + 1.2 + 2 * m, H: g.h + 1.4 + 2 * m, fenced: true };
  }
  const maxX = Math.max(6, ...items.map((i) => box(i).x1)) + (plotEdit ? 3 : 0.6);
  const maxY = Math.max(4, ...items.map((i) => box(i).y1)) + (plotEdit ? 3 : 0.8);
  return { x0: 0, y0: 0, W: maxX, H: maxY, fenced: false };
}

function plotDate() {
  const t = today();
  return plotMonth === 0 ? t : new Date(t.getFullYear(), t.getMonth() + plotMonth, 15);
}
const inGround = (c, T) => c.starts && c.finishes && d(c.starts) <= T && T < d(c.finishes);

// pixels per metre: "fit" shows the whole plan; zoom multiplies that
function planScale(b) {
  const cs = getComputedStyle(view), inner = view.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availW = Math.max(240, inner - 4), availH = Math.max(260, window.innerHeight * 0.62);
  return Math.max(4, Math.min(availW / b.W, availH / b.H)) * plotZoom;
}

// A label that fits its box: shrinks to fit the width, and is shortened with "…" if it still won't fit
function fitLabel(text, widthM, ppm, maxPx = 13, minPx = 9) {
  const px = Math.min(maxPx, (widthM * ppm) / (Math.max(text.length, 1) * 0.56));
  if (px >= minPx) return { text, size: px / ppm };
  const chars = Math.max(1, Math.floor((widthM * ppm) / (minPx * 0.56)) - 1);
  return { text: text.length > chars ? text.slice(0, chars) + "…" : text, size: minPx / ppm };
}

function plotSvg() {
  const T = plotDate(), crops = activeCrops(), items = planItems(), b = planBounds(items), ppm = planScale(b);
  const px = (n) => n / ppm;  // a size in screen pixels, in metres
  const isSel = inSelection;

  const features = items.filter((i) => i.type === "feature").map((i) => {
    const k = FEATURES[i.f.kind] || FEATURES.bush, lab = fitLabel(i.f.name, i.w + 0.2, ppm, 12, 8), fr = fruitOf(i.f);
    const shape = k.round ? `<ellipse cx="${i.x + i.w / 2}" cy="${i.y + i.h / 2}" rx="${i.w / 2}" ry="${i.h / 2}" fill="${k.fill}" class="feat ${i.f.kind}"/>`
      : `<rect x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" rx="${Math.min(0.15, i.w / 6)}" fill="${k.fill}" class="feat ${i.f.kind}"/>`;
    const es = Math.min(Math.min(i.w, i.h) * 0.55, px(30));
    const bb = box(i);
    return `<g class="item feature ${isSel(i) ? "sel" : ""}" data-item="feature" data-id="${i.id}" data-x="${i.x}" data-y="${i.y}" data-w="${i.w}" data-h="${i.h}" data-a="${i.a}">
      <title>${esc(i.f.name)}</title><g class="turn" transform="rotate(${i.a} ${i.x + i.w / 2} ${i.y + i.h / 2})">${shape}${k.round ? "" : sizeMarks(i, ppm)}</g>
      <text x="${i.x + i.w / 2}" y="${i.y + i.h / 2 + es * 0.35}" font-size="${es}" text-anchor="middle">${fr && !fr.plain ? fr.emoji : k.emoji}</text>
      <text x="${i.x + i.w / 2}" y="${bb.y1 + lab.size * 1.1}" font-size="${lab.size}" text-anchor="middle" class="label">${esc(lab.text)}</text></g>`;
  }).join("");

  const beds = items.filter((i) => i.type === "space").map((i) => {
    const s = i.s, { x, y, w, h } = i;
    const here = crops.filter((c) => c.space_id === s.id);
    const growing = here.filter((c) => inGround(c, T)), later = here.length - growing.length;
    // sown together = one strip, as big as its biggest plant's room, with all of them in it
    const now = [];
    growing.sort((a, b) => (a.mixgrp || a.id) - (b.mixgrp || b.id) || a.id - b.id);  // a group's plants side by side
    growing.forEach((c) => {
      const u = sharesPatch(c) && now.find((x) => x.mixgrp === c.mixgrp);
      if (!u) now.push({ ...c, emojis: [plant(c.plant_id).emoji] });
      else { u.area = Math.max(u.area, c.area); u.qty += c.qty; u.emojis.push(plant(c.plant_id).emoji); }
    });
    const target = placing && plant(crop(placing).plant_id).where.includes(s.kind === "pot" ? "pot" : "bed");
    let inner = "";
    if (s.kind === "pot") {
      const show = now.slice(0, 4);
      inner = `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2}" class="pot"/>` + (show.length ? show.map((c, n) => {
        const cx = x + (show.length === 1 ? w / 2 : w * (0.3 + 0.4 * (n % 2))), cy = y + (show.length <= 2 ? h / 2 : h * (0.3 + 0.4 * Math.floor(n / 2)));
        const r = show.length === 1 ? 0.32 : 0.2;
        return `<g class="crop" data-open-crop="${c.id}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${FAMILY_COLOUR[plant(c.plant_id).family] || "#9fd88f"}"/>
          <text x="${cx}" y="${cy + r * 0.35}" font-size="${r}" text-anchor="middle">${plant(c.plant_id).emoji}</text></g>`;
      }).join("") : `<text x="${x + w / 2}" y="${y + h / 2 + 0.1}" font-size="0.3" text-anchor="middle" opacity=".35">🪴</text>`);
    } else {
      // crop rows run across the bed's short side, stacked along its long side
      const across = w <= h, long = across ? h : w, short = across ? w : h;
      const need = now.reduce((n, c) => n + c.area / short, 0), scale = need > long ? long / need : 1;
      let at = 0;
      const spans = {};  // where each group's strips start and end
      const clipped = shapeType(s) !== "rect";
      inner = shapeSvg(s, x, y, w, h, `class="bed ${s.built === 0 ? "unbuilt" : ""} ${need > long ? "over" : ""}"`)
        + (clipped ? `<clipPath id="bc${s.id}">${shapeSvg(s, x, y, w, h, "")}</clipPath><g clip-path="url(#bc${s.id})">` : "") + now.map((c) => {
        const p = plant(c.plant_id), depth = Math.max(0.14, (c.area / short) * scale), start = at;
        at += depth;
        if (c.mixgrp) { const g = (spans[c.mixgrp] = spans[c.mixgrp] || { from: start, mix: mixOf(c) }); g.to = at; }
        const rx = across ? x + 0.04 : x + start + 0.02, ry = across ? y + start + 0.02 : y + 0.04;
        const rw = across ? w - 0.08 : depth - 0.04, rh = across ? depth - 0.04 : h - 0.08;
        const n = Math.max(1, Math.min(Math.floor(short / 0.3), c.qty, 8)), fs = Math.min(0.26, depth * 0.75, px(26));
        const emojis = Array.from({ length: n }, (_, k) => across
          ? `<text x="${x + (w / n) * (k + 0.5)}" y="${ry + rh / 2 + fs * 0.35}" font-size="${fs}" text-anchor="middle">${c.emojis[k % c.emojis.length]}</text>`
          : `<text x="${rx + rw / 2}" y="${y + (h / n) * (k + 0.5) + fs * 0.35}" font-size="${fs}" text-anchor="middle">${c.emojis[k % c.emojis.length]}</text>`).join("");
        return `<g class="crop" data-open-crop="${c.id}"><rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="0.06" fill="${FAMILY_COLOUR[p.family] || "#9fd88f"}"/>${emojis}</g>`;
      }).join("") + Object.values(spans).map((g) => {
        // a dashed outline round the group, with its name on a little tag
        const gx = across ? x + 0.01 : x + g.from, gy = across ? y + g.from : y + 0.01, gw = across ? w - 0.02 : g.to - g.from, gh = across ? g.to - g.from : h - 0.02;
        const fs = Math.min(0.18, px(11)), name = g.mix ? g.mix.name.split(":")[0] : "Grown together";
        // the tag sits on whichever edge of the group is at the top of the screen, and reads the right way up
        const ty = Math.cos(rad(i.a || 0)) < 0 ? gy + gh - fs * 0.4 : gy + fs * 1.05;
        return `<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="0.08" class="grp-outline" style="stroke-width:${px(2)}"/>
          <text x="${gx + gw / 2}" y="${ty}" font-size="${fs}" text-anchor="middle" class="grp-tag" transform="rotate(${-i.a} ${gx + gw / 2} ${ty - fs * 0.35})">${g.mix ? g.mix.emoji + " " : ""}${esc(name)}</text>`;
      }).join("") + (clipped ? "</g>" : "") + (need < long * 0.9 && !plotEdit ? `<text x="${across ? x + w / 2 : x + at + (w - at) / 2}" y="${across ? y + at + (h - at) / 2 + 0.1 : y + h / 2 + 0.1}" font-size="${Math.min(0.3, px(22))}" text-anchor="middle" class="plus">＋</text>` : "");
    }
    const lab = fitLabel(s.name + (later ? `  +${later}` : ""), w + 0.1, ppm), bb = box(i);
    return `<g class="item space ${isSel(i) ? "sel" : ""} ${placing ? (target ? "target" : "nope") : ""}" data-item="space" data-id="${s.id}" data-space-id="${s.id}" data-x="${x}" data-y="${y}" data-w="${w}" data-h="${h}" data-a="${i.a}">
      <title>${esc(s.name)}</title><g class="turn" transform="rotate(${i.a} ${x + w / 2} ${y + h / 2})"><rect x="${x - 0.1}" y="${y - 0.1}" width="${w + 0.2}" height="${h + 0.2}" rx="0.12" class="hit"/>
      ${inner}${s.kind === "pot" || shapeType(s) === "free" ? "" : sizeMarks(i, ppm)}${bedHandles(i, ppm)}</g><text x="${i.a ? (bb.x0 + bb.x1) / 2 : x}" y="${bb.y0 - lab.size * 0.45}" font-size="${lab.size}" ${i.a ? 'text-anchor="middle"' : ""} class="label">${esc(lab.text)}</text></g>`;
  }).join("");

  // grid squares that stay readable whatever the zoom: 50cm up close, 1m, 5m or 10m across a field
  lastPlan = { ppm, b };
  const step = ppm >= 40 && plotEdit ? 0.5 : ppm >= 9 ? 1 : ppm >= 2 ? 5 : 10;
  const bar = Math.max(1, step);
  const shape = S.g.garden.shape && S.g.garden.shape.map((p) => p.join(",")).join(" ");
  const fence = b.fenced ? (shape ? `<polygon points="${shape}" class="fence"/>` : `<rect x="0" y="0" width="${S.g.garden.w}" height="${S.g.garden.h}" class="fence"/>`) + `
    <text x="${S.g.garden.w}" y="${-px(6)}" font-size="${px(11)}" text-anchor="end" class="label dim">${S.g.garden.w} × ${S.g.garden.h} m</text>` : "";
  return `<svg class="plot ${showSat && satAnchor() ? "withsat" : ""}" viewBox="${b.x0} ${b.y0} ${b.W} ${b.H}" width="${Math.round(b.W * ppm)}" height="${Math.round(b.H * ppm)}" role="img" aria-label="Plan of your garden">
    <defs><pattern id="grid" x="0" y="0" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 L 0 0 0 ${step}" class="gridline" style="stroke-width:${px(1)}"/></pattern></defs>
    <rect x="${b.x0}" y="${b.y0}" width="${b.W}" height="${b.H}" class="${b.fenced ? "outside" : "grass"}"/>
    ${satTiles(b, ppm)}
    ${b.fenced ? (shape ? `<polygon points="${shape}" class="grass ${showSat && satAnchor() ? "seethru" : ""}"/>` : `<rect x="0" y="0" width="${S.g.garden.w}" height="${S.g.garden.h}" class="grass ${showSat && satAnchor() ? "seethru" : ""}"/>`) : ""}
    <rect x="${b.x0}" y="${b.y0}" width="${b.W}" height="${b.H}" fill="url(#grid)"/>
    ${fence}${showPaths ? pathsBetween(items) : ""}${features}${beds}${edgeMarks(ppm)}${boundaryEdit ? boundaryHandles(ppm) : ""}
    <g class="scalebar" style="stroke-width:${px(2)}"><path d="M ${b.x0 + px(12)} ${b.y0 + b.H - px(12)} h ${bar}"/><text x="${b.x0 + px(12) + bar / 2}" y="${b.y0 + b.H - px(17)}" font-size="${px(11)}" text-anchor="middle">${bar} m</text></g></svg>`;
}

// A freeform bed, selected while editing: red dots on its corners to drag, ＋ halfway along each side to add one
let bedVtx = null;  // {id, k}: a corner tapped, ready to remove
function bedHandles(i, ppm) {
  if (!plotEdit || boundaryEdit || !selected || selected.type !== "space" || selected.id !== i.id || shapeType(i.s) !== "free") return "";
  const P = outlinePts(i.s, i.w, i.h).map(([px, py]) => [i.x + px, i.y + py]), n = P.length, r = (k) => k / ppm;
  const mids = P.map(([x1, y1], k) => { const [x2, y2] = P[(k + 1) % n], mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    return `<g class="bmid" data-bmid="${k}"><circle cx="${mx}" cy="${my}" r="${r(10)}"/><text x="${mx}" y="${my + r(5)}" font-size="${r(15)}" text-anchor="middle">+</text></g>`; }).join("");
  const dots = P.map(([x, y], k) => `<circle cx="${x}" cy="${y}" r="${r(11)}" class="bvtx ${bedVtx && bedVtx.id === i.id && bedVtx.k === k ? "on" : ""}" data-bvtx="${k}"/>`).join("");
  return `<g class="bedit">${mids}${dots}</g>`;
}

function plotPage() {
  const unplaced = activeCrops().filter((c) => !c.space_id);
  const T = plotDate();
  const label = plotMonth === 0 ? "Today" : `${MONTHS_LONG[T.getMonth()]}${T.getFullYear() !== today().getFullYear() ? " " + T.getFullYear() : ""}`;
  view.innerHTML = `<h1>🪴 My garden</h1>${gardenTabs()}
    ${placing ? `<div class="card tint-sun row placing" style="justify-content:space-between"><b>👆 Tap a bed to put ${plant(crop(placing).plant_id).emoji} ${esc(plant(crop(placing).plant_id).name)} in it</b><button class="btn small ghost" id="cancel-place">Cancel</button></div>` : ""}
    ${plotEdit && !boundaryEdit ? `<div class="card tint-sky small" style="margin-bottom:10px"><b>✏️ Editing:</b> drag anything to move it - zoom in for a finer grid (down to 50cm squares). Tap something to change, turn or remove it. To move several beds together, tap <b>🔗 Group beds</b>.</div>` : ""}
    <div class="plan-bar"><button class="btn small ${plotEdit ? "primary" : ""}" id="edit">${plotEdit ? "✅ Done editing" : "✏️ Edit plan"}</button>
      ${plotEdit && !boundaryEdit ? `<button class="btn small groupbtn ${multi ? "on" : ""}" id="t-multi" aria-pressed="${multi}">${multi ? "☑️ Picking… tap to stop" : "🔗 Group beds"}</button>` : ""}
      <span class="toggles">${satAnchor() ? `<button class="btn small ${showSat ? "primary" : ""}" id="t-sat" aria-pressed="${showSat}" title="Satellite view">🛰️</button>` : ""}<button class="btn small ${showSizes ? "primary" : ""}" id="t-sizes" aria-pressed="${showSizes}">📏</button><button class="btn small ${showPaths ? "primary" : ""}" id="t-paths" aria-pressed="${showPaths}" title="Paths between beds">🚶</button></span>
      <span class="zoom"><button class="btn small" data-zoom="-1" aria-label="Zoom out">➖</button><button class="btn small ghost" data-zoom="0" aria-label="Fit the whole garden">${Math.round(plotZoom * 100)}%</button><button class="btn small" data-zoom="1" aria-label="Zoom in">➕</button></span></div>
    ${boundaryEdit ? `<div class="card tint-sun small row" style="justify-content:space-between;margin-bottom:10px"><span><b>📐 Editing the boundary:</b> drag a corner · tap ＋ to add a corner · tap a corner to remove it · tap a side to type its real length</span><button class="btn small primary" id="b-done">✅ Done</button></div>` : ""}
    ${showSat && satAnchor() ? `<p class="small muted" style="margin:0 0 4px;text-align:right">🛰️ Imagery © Esri · Powered by Esri · location kept on this device only</p>` : ""}
    <div class="plot-wrap ${plotEdit ? "moving" : ""}"><div class="plot-inner">${plotSvg()}${plotEdit ? (boundaryEdit ? boundaryToolbar() : selToolbar()) : ""}</div></div>
    ${plotEdit ? editPanel() : `
    <div class="month-row"><b>📅 ${esc(label)}</b><input type="range" id="month" min="0" max="11" value="${plotMonth}" aria-label="Show the garden in a later month">
      ${plotMonth ? `<button class="btn small ghost" id="now">Today</button>` : ""}</div>

    ${unplaced.length ? `<div class="card"><b>📍 Not in a bed yet</b> <span class="small muted">- tap one, then tap a bed</span>
      <div class="suggest">${unplaced.map((c) => `<button data-place="${c.id}" class="${placing === c.id ? "on" : ""}">${plant(c.plant_id).emoji} ${esc(plant(c.plant_id).name)}${rowLabel(c) ? " · " + rowLabel(c) : ""}</button>`).join("")}</div></div>` : ""}
    ${activeCrops().length ? `<div class="row"><button class="btn small" data-layout="all">🧩 Suggest a layout</button></div>` : ""}`}`;
  wirePlot();
}

// Handles on the outline: a dot on each corner (drag it), a ＋ halfway along each side (add a corner),
// and the sides themselves (tap to type the real length)
function boundaryHandles(ppm) {
  const P = outlinePoints();
  if (!P) return "";
  const px = (n) => n / ppm, n = P.length;
  const edges = P.map(([x1, y1], k) => { const [x2, y2] = P[(k + 1) % n];
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="bedge ${bSel && bSel.type === "e" && bSel.k === k ? "on" : ""}" data-edge="${k}" style="stroke-width:${px(18)}"/>`; }).join("");
  const mids = P.map(([x1, y1], k) => { const [x2, y2] = P[(k + 1) % n], mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    return `<g class="bmid" data-mid="${k}"><circle cx="${mx}" cy="${my}" r="${px(10)}"/><text x="${mx}" y="${my + px(5)}" font-size="${px(15)}" text-anchor="middle">+</text></g>`; }).join("");
  const dots = P.map(([x, y], k) => `<circle cx="${x}" cy="${y}" r="${px(11)}" class="bvtx ${bSel && bSel.type === "v" && bSel.k === k ? "on" : ""}" data-vtx="${k}"/>`).join("");
  return `<g class="bedit">${edges}${mids}${dots}</g>`;
}
function boundaryToolbar() {
  const P = outlinePoints();
  if (!bSel || !P || !lastPlan) return "";
  const { ppm, b } = lastPlan, n = P.length;
  let at, html;
  if (bSel.type === "v") {
    at = P[bSel.k];
    html = n > 3 ? `<b>Corner ${bSel.k + 1}</b><button class="btn small danger" id="b-remove">🗑️ Remove corner</button>` : `<span class="small">An outline needs at least 3 corners.</span>`;
  } else {
    const [x1, y1] = P[bSel.k], [x2, y2] = P[(bSel.k + 1) % n], len = Math.hypot(x2 - x1, y2 - y1);
    at = [(x1 + x2) / 2, (y1 + y2) / 2];
    html = `<span class="small">This side is <b>${m(len)}</b>. Really:</span><input id="b-len" type="number" step="0.1" min="0.5" inputmode="decimal" value="${len.toFixed(2)}" aria-label="Real length in metres"><span class="small">m</span><button class="btn small primary" id="b-set">Set</button>`;
  }
  const W = b.W * ppm, tw = 280, left = Math.max(4, Math.min(W - tw - 4, (at[0] - b.x0) * ppm - tw / 2)), y = (at[1] - b.y0) * ppm;
  return `<div class="seltools btools" style="left:${left}px;top:${y > 70 ? y - 62 : y + 18}px;width:${tw}px">${html}<button class="btn small ghost" id="b-close" aria-label="Close">✕</button></div>`;
}
const saveOutline = async (P, message) => {
  const pts = P.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
  const mx = Math.min(...pts.map((p) => p[0])), my = Math.min(...pts.map((p) => p[1]));
  const ok = await change("POST", "/api/garden/shape", { points: pts, keep_beds: true }, message);
  const A = satAnchor();
  if (ok && A && (mx || my)) { setSatAnchor({ ...A, ox: A.ox + mx, oy: A.oy + my }); render(); }  // the plan's corner moved by (mx, my)
  return ok;
};

// Several picked, or a group: a small bar at the top of what you're looking at
function groupToolbar() {
  const n = multi ? picked.size : selected && selected.type === "group" ? planItems().filter((i) => i.grp === selected.grp).length : 0;
  if (!multi && !(selected && selected.type === "group")) return "";
  const at = `left:${plotScroll.l + 8}px;top:${plotScroll.t + 8}px;width:auto`;
  if (multi) return `<div class="seltools grouptools" style="${at}"><b>☑️ ${n} picked</b>
    ${n >= 2 ? `<button class="btn small primary" id="g-make">🔗 Group them</button>` : `<span class="small">Tap things to pick them</span>`}
    ${n ? `<button class="btn small ghost" id="g-clear">Clear</button>` : ""}</div>`;
  return `<div class="seltools grouptools" style="${at}"><b>🔗 Group of ${n}</b> <span class="small">drag to move them all</span>
    <button class="btn small" id="g-un">Ungroup</button><button class="btn small ghost" id="g-close" aria-label="Close">✕</button>
    <div class="copyrow"><span>Turn them all:</span><button class="btn small" data-grot="-15" aria-label="Turn the group 15 degrees left">↺15°</button>
      <button class="btn small" data-grot="-5" aria-label="Turn the group 5 degrees left">↺5°</button><button class="btn small" data-grot="5" aria-label="Turn the group 5 degrees right">↻5°</button>
      <button class="btn small" data-grot="15" aria-label="Turn the group 15 degrees right">↻15°</button><button class="btn small" data-grot="90" aria-label="Turn the group 90 degrees">↻90°</button></div></div>`;
}

// Turn buttons right next to whatever's selected, so you don't have to scroll down to them
function selToolbar() {
  if (multi || (selected && selected.type === "group")) return groupToolbar();
  if (!selected || !lastPlan) return "";
  const it = planItems().find((i) => i.type === selected.type && i.id === selected.id);
  if (!it || (it.type === "space" && it.s.kind === "pot")) return "";
  const { ppm, b } = lastPlan, bb = box(it), W = b.W * ppm;
  // keep it on screen: within the plan, and within the part you're scrolled to
  const cs = getComputedStyle(view), visW = view.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const tw = Math.min(330, visW - 8), lo = Math.max(4, plotScroll.l + 4), hi = Math.min(W - tw - 4, plotScroll.l + visW - tw - 4);
  const left = Math.max(lo, Math.min(hi, ((bb.x0 + bb.x1) / 2 - b.x0) * ppm - tw / 2));
  const tb = it.type === "feature" && ["tree", "bush"].includes(it.f.kind), fr = tb && fruitOf(it.f);
  const free = it.type === "space" && shapeType(it.s) === "free";
  const th = it.type === "space" ? (free ? 230 : 185) : tb ? 140 : 100, above = (bb.y0 - b.y0) * ppm - th, top = above > 4 ? above : (bb.y1 - b.y0) * ppm + 10;
  return `<div class="seltools" data-above="${(bb.y0 - b.y0) * ppm}" data-below="${(bb.y1 - b.y0) * ppm}" style="left:${left}px;top:${top}px;width:${tw}px">
    <button class="btn small" data-rot="-15" aria-label="Turn 15 degrees left">↺15°</button>
    <input type="range" id="ang" min="-180" max="180" step="1" value="${Math.round(it.a)}" aria-label="Angle">
    <button class="btn small" data-rot="15" aria-label="Turn 15 degrees right">↻15°</button>
    <b id="angv">${Math.round(it.a)}°</b>
    <button class="btn small" data-rot="90" aria-label="Turn 90 degrees">↻90°</button>${it.a ? `<button class="btn small ghost" data-rot="0" aria-label="Straighten">⟲0</button>` : ""}
    <button class="btn small ghost" id="seldetails" aria-label="More options">⋯</button><button class="btn small danger" id="seldel" aria-label="Delete">🗑️</button><button class="btn small ghost" id="selclose" aria-label="Close - or tap an empty spot">✕</button>
    <div class="sizerow"><span>📏</span><input id="sz-w" type="number" step="0.1" min="0.2" max="100" inputmode="decimal" value="${it.w}" aria-label="Width in metres">
      <span>×</span><input id="sz-h" type="number" step="0.1" min="0.2" max="100" inputmode="decimal" value="${it.h}" aria-label="Length in metres"><span>m</span><span class="small muted" id="sz-state"></span></div>
    ${it.type === "space" ? `<div class="copyrow"><span>⧉ Copy to:</span><button class="btn small" data-copy-bed="left" aria-label="Copy to the left">◀</button><button class="btn small" data-copy-bed="right" aria-label="Copy to the right">▶</button>
      <button class="btn small" data-copy-bed="up" aria-label="Copy above">▲</button><button class="btn small" data-copy-bed="down" aria-label="Copy below">▼</button></div>
    <div class="copyrow"><span>Shape:</span>${SHAPES.map(([k, e, l]) => `<button class="btn small ${shapeType(it.s) === k ? "primary" : ""}" data-bshape="${k}" aria-label="${l}" title="${l}">${e}</button>`).join("")}</div>
    ${free ? `<p class="small muted" style="margin:2px 0 0;width:100%">Drag the red dots to reshape it · tap ＋ to add a corner · tap a dot to remove it
      ${bedVtx && bedVtx.id === it.id ? `<button class="btn small danger" id="bv-del">🗑️ Remove corner ${bedVtx.k + 1}</button>` : ""}</p>` : ""}` : ""}
    ${tb ? `<div class="copyrow">${fr && !fr.plain ? `<span>${fr.emoji} ${it.f.cultivar ? `'${esc(it.f.cultivar)}'` : esc(fr.name)} · pick ${pickMonths(fr)}</span>${fr.kinds.length ? `<button class="btn small" data-kindpick aria-label="Which variety">🏷️</button>` : ""}<button class="btn small" data-fruitinfo>ℹ️ Info</button>`
      : `<span>${fr ? esc(fr.name) : "What kind is it?"}</span>`}<button class="btn small" data-fruitpick>${fr ? "Change" : "🍎 Choose"}</button></div>` : ""}</div>`;
}

// The edit tools: add things, set the garden's size, and change whatever is selected
function editPanel() {
  const g = S.g.garden;
  let sel = "";
  if (selected && selected.type !== "group") {  // a whole group is handled by its own bar on the plan
    const items = planItems(), it = items.find((i) => i.type === selected.type && i.id === selected.id);
    if (!it) selected = null;
    else if (it.type === "space") {
      const shade = items.filter((t) => t.type === "feature" && ["tree", "hedge", "shed", "house"].includes(t.f.kind)).find((t) => {
        const cx = t.x + t.w / 2, cy = t.y + t.h / 2, reach = Math.max(t.w, t.h) / 2 + 1.5;
        const nx = Math.max(it.x, Math.min(cx, it.x + it.w)), ny = Math.max(it.y, Math.min(cy, it.y + it.h));
        return Math.hypot(cx - nx, cy - ny) < reach;
      });
      sel = `<div class="card sel-card"><b>${SPACE_KINDS[it.s.kind].emoji} ${esc(it.s.name)}</b> <span class="small muted">${it.s.kind === "pot" ? "pots" : `${it.w} × ${it.h} m`}</span>
        ${shade ? `<p class="small" style="margin:6px 0 0">🌥️ It's close to the ${esc(shade.f.name.toLowerCase())} - it may get shade. Most veg want 6+ hours of sun a day.</p>` : ""}
        
        <div class="row" style="margin-top:8px"><button class="btn small" data-open-space="${it.id}">✏️ Name, size & soil</button><button class="btn small ghost" id="desel">Done</button></div></div>`;
    } else {
      const k = FEATURES[it.f.kind] || FEATURES.bush;
      const fr = fruitOf(it.f), tb = ["tree", "bush"].includes(it.f.kind);
      sel = `<div class="card sel-card"><b>${fr && !fr.plain ? fr.emoji : k.emoji} ${esc(it.f.name)}</b>
        ${tb ? `<div class="row" style="margin-top:6px"><span class="small muted">${fr ? esc(fr.name) : `Which ${it.f.kind} is it? Choose one to get picking times and care tips.`}</span>
          <button class="btn small" data-fruitpick>${fr ? "🔄 Change kind" : "🍎 Choose kind"}</button></div>` : ""}
        ${fr && fr.kinds.length ? `<div class="row" style="margin-top:6px"><span class="small">🏷️ ${it.f.cultivar ? `<b>${esc(it.f.cultivar)}</b>` : `<span class="muted">Which variety? Not chosen</span>`}</span>
          <button class="btn small" data-kindpick>${it.f.cultivar ? "Change" : "🏷️ Choose"}</button></div>` : ""}
        ${fr ? `<details class="fruit-card" ${fr.plain ? "" : "open"}><summary><b>${fr.plain ? "Tips" : "🧺 Picking & care"}</b></summary>${fruitInfo(fr)}</details>` : ""}
        <div class="row" style="margin-top:8px;flex-wrap:nowrap"><input id="fname" type="text" maxlength="40" value="${esc(it.f.name)}" aria-label="Name"></div>

        <div class="row" style="margin-top:8px"><button class="btn small primary" id="fsave">Save name</button>
          <button class="btn small danger" id="fdel">🗑️ Remove</button><button class="btn small ghost" id="desel">Done</button></div></div>`;
    }
  }
  return `
    <div class="card"><b>➕ Add to your plan</b>
      <div class="adds"><button class="btn small" id="add-space">🟫 Bed or pots</button>
        ${Object.entries(FEATURES).map(([k, f]) => `<button class="btn small" data-addfeat="${k}">${f.emoji} ${f.name}</button>`).join("")}</div></div>
    ${sel}
    <div class="card"><b>🧲 Lining beds up</b>
      <label class="check" style="margin-top:6px"><input type="checkbox" id="snap" ${snapOn ? "checked" : ""}> <span>Snap a bed alongside the one you drop it next to - same angle, ends level</span></label>
      <label class="field" for="pathw" style="margin-top:8px">Path between beds</label>
      <select id="pathw">${[[0, "No path - right up against each other"], [0.3, "30cm"], [0.4, "40cm"], [0.5, "50cm"], [0.6, "60cm"], [0.75, "75cm"], [1, "1m"]]
        .map(([v, l]) => `<option value="${v}" ${Math.abs(v - g.path_w) < 0.001 ? "selected" : ""}>${l}</option>`).join("")}</select>
      <p class="small muted" style="margin:6px 0 0">Paths are drawn for you between beds that sit side by side.</p></div>
    <div class="card"><b>📐 Your whole garden or field</b>
      <p class="small muted" style="margin:4px 0 8px">Trace it on a satellite map, or type its size. The plan then shows its edge, so you can place everything where it really is.</p>
      <div class="row"><button class="btn small primary" id="trace">🗺️ ${g.shape ? "Trace it again" : "Trace it on a satellite map"}</button>
      ${g.w ? `<button class="btn small" id="b-start">📐 Edit boundary corners</button>` : ""}</div>
      ${g.shape ? `<p class="small" style="margin:8px 0 0">✅ Outline from the map: about ${g.w} × ${g.h} m. <button class="btn small ghost" id="gclear2">Remove outline</button></p>` : ""}
      <p class="small muted" style="margin:12px 0 6px">Or type its size:</p>
      <div class="size-row"><label class="big-num"><span>Width</span><input id="gw" type="number" step="0.5" min="1" inputmode="decimal" value="${g.w || ""}" placeholder="e.g. 12"><em>m</em></label>
        <span class="times">×</span><label class="big-num"><span>Length</span><input id="gh" type="number" step="0.5" min="1" inputmode="decimal" value="${g.h || ""}" placeholder="e.g. 8"><em>m</em></label></div>
      <div class="row" style="margin-top:10px"><span class="small muted" id="g-state">Changes as you type - saved automatically</span>${g.w ? `<button class="btn small ghost" id="gclear">No fixed size</button>` : ""}</div></div>`;
}

function wirePlot() {
  const svg = view.querySelector("svg.plot");
  // now the toolbar's drawn we know how tall it really is: sit it just above the thing, or below if there's no room
  const tools = view.querySelector(".seltools[data-above]");
  if (tools) { const above = Number(tools.dataset.above) - tools.offsetHeight - 8; tools.style.top = (above > 4 ? above : Number(tools.dataset.below) + 10) + "px"; }
  const redraw = () => { const y = window.scrollY; plotPage(); window.scrollTo(0, y); };
  // stay looking at the same part of the garden: remember the scroll, and put it back after every redraw
  const wrap = view.querySelector(".plot-wrap");
  if (wrap) {
    wrap.scrollLeft = plotScroll.l; wrap.scrollTop = plotScroll.t;
    wrap.onscroll = () => { plotScroll = { l: wrap.scrollLeft, t: wrap.scrollTop }; };
  }
  $("#edit").onclick = () => { plotEdit = !plotEdit; placing = null; selected = null; boundaryEdit = false; bSel = null; multi = false; picked.clear(); plotPage(); };
  const tm = $("#t-multi");
  if (tm) tm.onclick = () => { multi = !multi; picked.clear(); selected = null; redraw(); if (multi) toast("☑️ Now tap each bed you want in the group, then tap 🔗 Group them"); };
  const ts = $("#t-sat");
  if (ts) ts.onclick = () => { showSat = !showSat; remember("gtg-satview", showSat); redraw(); toast(showSat ? "🛰️ Satellite view on" : "Satellite view off"); };
  $("#t-sizes").onclick = () => { showSizes = !showSizes; remember("gtg-sizes", showSizes); redraw(); toast(showSizes ? "📏 Measurements on" : "Measurements off"); };
  $("#t-paths").onclick = () => { showPaths = !showPaths; remember("gtg-paths", showPaths); redraw(); toast(showPaths ? "🚶 Paths shown" : "Paths hidden"); };
  const more = $("#seldetails"); if (more) more.onclick = () => { const c = view.querySelector(".sel-card"); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); };
  view.querySelectorAll("[data-zoom]").forEach((b) => (b.onclick = () => {
    const z = Number(b.dataset.zoom), levels = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6];
    // zoom round the middle of what you're looking at, not the corner
    const before = lastPlan, cxm = wrap && before ? (wrap.scrollLeft + wrap.clientWidth / 2) / before.ppm : 0, cym = wrap && before ? (wrap.scrollTop + wrap.clientHeight / 2) / before.ppm : 0;
    plotZoom = z === 0 ? 1 : levels[Math.max(0, Math.min(levels.length - 1, levels.indexOf(plotZoom) + z))];
    if (wrap && before) {
      plotPage();  // draw once at the new zoom to learn its scale, then scroll so the same spot is in the middle
      const w2 = view.querySelector(".plot-wrap");
      plotScroll = z === 0 ? { l: 0, t: 0 } : { l: Math.max(0, cxm * lastPlan.ppm - w2.clientWidth / 2), t: Math.max(0, cym * lastPlan.ppm - w2.clientHeight / 2) };
    }
    redraw();
  }));
  const month = $("#month");
  if (month) month.oninput = (e) => { plotMonth = Number(e.target.value); redraw(); };
  const nowBtn = $("#now"); if (nowBtn) nowBtn.onclick = () => { plotMonth = 0; redraw(); };
  const cp = $("#cancel-place"); if (cp) cp.onclick = () => { placing = null; plotPage(); };

  if (plotEdit) wireEdit(svg, redraw);
  view.onclick = async (e) => {
    const gv = e.target.closest("[data-gview]");
    if (gv) { gardenView = gv.dataset.gview; placing = null; plotEdit = false; gardenPage(); return; }
    if (plotEdit) return;
    const pl = e.target.closest("[data-place]");
    if (pl) { placing = placing === Number(pl.dataset.place) ? null : Number(pl.dataset.place); plotPage(); return; }
    const feat = e.target.closest('[data-item="feature"]');
    if (feat) { const f = S.g.garden.features.find((x) => x.id === Number(feat.dataset.id)); if (fruitOf(f)) { fruitSheet(f); return; } toast(`${(FEATURES[f.kind] || {}).emoji || ""} ${f.name} - tap ✏️ Edit plan to change it`); return; }
    const sp = e.target.closest("[data-space-id]");
    if (placing && sp) {
      e.stopPropagation();
      const c = crop(placing), target = space(Number(sp.dataset.spaceId)), p = plant(c.plant_id);
      if (!p.where.includes(target.kind === "pot" ? "pot" : "bed")) { toast(`${p.name} can't go in ${target.kind === "pot" ? "pots" : "a bed"}`); return; }
      placing = null;
      await change("PATCH", `/api/crops/${c.id}`, { plant_id: c.plant_id, space_id: target.id }, `${p.emoji} ${p.name} is in ${target.name} now`);
      return;
    }
    if (sp && !e.target.closest("[data-open-crop]")) { e.stopPropagation(); openSpace(Number(sp.dataset.spaceId)); }
  };
}

// Edit mode: drag anything; tap to select; add, change, turn and remove things
function wireBoundary(svg, redraw) {
  const done = $("#b-done"); if (done) done.onclick = () => { boundaryEdit = false; bSel = null; redraw(); };
  const close = $("#b-close"); if (close) close.onclick = () => { bSel = null; redraw(); };
  const P = outlinePoints();
  if (!svg || !P) return;
  const pt = (ev) => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  const rem = $("#b-remove");
  if (rem) rem.onclick = () => { const k = bSel.k; bSel = null; P.splice(k, 1); saveOutline(P, "Corner removed"); };
  const set = $("#b-set");
  if (set) set.onclick = () => {
    const k = bSel.k, n = P.length, [x1, y1] = P[k], [x2, y2] = P[(k + 1) % n], len = Math.hypot(x2 - x1, y2 - y1), want = Number($("#b-len").value);
    if (!want || want < 0.5) { toast("Type the length in metres"); return; }
    P[(k + 1) % n] = [x1 + ((x2 - x1) / len) * want, y1 + ((y2 - y1) / len) * want];  // move the far corner along the side
    saveOutline(P, `Side set to ${m(want)} 📐`);
  };
  svg.querySelectorAll("[data-mid]").forEach((g) => (g.onpointerup = (ev) => {
    ev.stopPropagation();
    const k = Number(g.dataset.mid), [x1, y1] = P[k], [x2, y2] = P[(k + 1) % P.length];
    P.splice(k + 1, 0, [(x1 + x2) / 2, (y1 + y2) / 2]);
    bSel = { type: "v", k: k + 1 };
    saveOutline(P, "Corner added - drag it into place");
  }));
  svg.querySelectorAll("[data-edge]").forEach((l) => (l.onpointerup = () => { bSel = { type: "e", k: Number(l.dataset.edge) }; redraw(); }));
  svg.querySelectorAll("[data-vtx]").forEach((c) => {
    c.onpointerdown = (ev) => {
      ev.preventDefault(); ev.stopPropagation(); c.setPointerCapture(ev.pointerId);
      const k = Number(c.dataset.vtx), start = pt(ev), [x0, y0] = P[k];
      let moved = false;
      const shapes = svg.querySelectorAll("polygon.fence, polygon.grass");
      c.onpointermove = (mv) => {
        const p = pt(mv), nx = x0 + p.x - start.x, ny = y0 + p.y - start.y;
        if (Math.abs(p.x - start.x) + Math.abs(p.y - start.y) > 0.05) moved = true;
        c.setAttribute("cx", nx); c.setAttribute("cy", ny);
        const live = P.map((q, i) => (i === k ? [nx, ny] : q));
        shapes.forEach((s2) => s2.setAttribute("points", live.map((q) => q.join(",")).join(" ")));
      };
      c.onpointerup = (up) => {
        c.onpointermove = c.onpointerup = null;
        if (!moved) { bSel = { type: "v", k }; redraw(); return; }
        const p = pt(up);
        P[k] = [Math.round((x0 + p.x - start.x) * 20) / 20, Math.round((y0 + p.y - start.y) * 20) / 20];
        bSel = null; saveOutline(P);
      };
    };
  });
}

// Dragging things on the plan (and tapping to pick them). Kept separate so the picture alone can be
// redrawn - e.g. while a size is being typed - without losing the box you're typing in.
let planWire = null;
function wireItemDrag(svg) {
  if (!svg || !planWire) return;
  const { redraw, saveMany } = planWire;
    svg.addEventListener("click", (e) => e.stopPropagation(), true);  // in edit mode, taps select rather than open
    // tapping an empty bit of the plan lets go of whatever's selected (and its box goes away)
    let bgDown = null;
    svg.onpointerdown = (ev) => { bgDown = ev.target.closest("[data-item]") ? null : { x: ev.clientX, y: ev.clientY }; };
    svg.onpointerup = (ev) => {
      if (!bgDown || ev.target.closest("[data-item]")) return;
      const tap = Math.abs(ev.clientX - bgDown.x) + Math.abs(ev.clientY - bgDown.y) < 10;
      bgDown = null;
      if (tap && !multi && selected) { selected = null; redraw(); }
    };
    const pt = (ev) => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
    svg.querySelectorAll("[data-item]").forEach((g) => {
      g.onpointerdown = (ev) => {
        ev.preventDefault(); g.setPointerCapture(ev.pointerId);
        const type = g.dataset.item, id = Number(g.dataset.id), start = pt(ev);
        const items = planItems(), me = items.find((i) => i.type === type && i.id === id);
        // what moves: the several picked, or this thing's whole group, or just this thing
        const singleInGroup = selected && selected.type === type && selected.id === id;
        let movers = [me];
        if (multi && picked.has(itemKey(me))) movers = items.filter((i) => picked.has(itemKey(i)));
        else if (!multi && me.grp && !singleInGroup) movers = items.filter((i) => i.grp === me.grp);
        const els = movers.map((i) => svg.querySelector(`[data-item="${i.type}"][data-id="${i.id}"]`));
        let dx = 0, dy = 0;
        g.onpointermove = (mv) => { const p = pt(mv); dx = p.x - start.x; dy = p.y - start.y; els.forEach((el) => el && el.setAttribute("transform", `translate(${dx} ${dy})`)); };
        g.onpointerup = async () => {
          g.onpointermove = g.onpointerup = null;
          if (Math.abs(dx) + Math.abs(dy) < 0.08) {  // a tap, not a drag
            els.forEach((el) => el && el.removeAttribute("transform"));
            if (multi) { const k = itemKey(me); picked.has(k) ? picked.delete(k) : picked.add(k); }
            else if (me.grp && !(selected && selected.type === "group" && selected.grp === me.grp)) selected = { type: "group", grp: me.grp };
            else selected = { type, id };  // a second tap on a grouped thing picks just that one
            redraw(); return;
          }
          const step = (v) => Math.round(v * 10) / 10;
          let sx = step(dx), sy = step(dy), message;
          let moved = movers.map((i) => ({ ...i, x: i.x + sx, y: i.y + sy }));
          // keep everything on the plan
          const minX = Math.min(...moved.map((i) => box(i).x0)), minY = Math.min(...moved.map((i) => box(i).y0));
          if (minX < 0 || minY < 0) moved = moved.map((i) => ({ ...i, x: i.x - Math.min(0, minX), y: i.y - Math.min(0, minY) }));
          const gw = S.g.garden.w, gh = S.g.garden.h;
          if (movers.length === 1 && gw && gh) moved[0] = { ...moved[0], x: Math.min(moved[0].x, Math.max(0, gw - moved[0].w)), y: Math.min(moved[0].y, Math.max(0, gh - moved[0].h)) };
          if (movers.length === 1 && type === "space") {
            const lined = snapNextTo(moved[0], items);
            if (lined) {
              moved[0] = { ...moved[0], x: lined.x, y: lined.y, a: lined.a };
              message = `🧲 Lined up next to ${lined.to.s.name}${S.g.garden.path_w ? ` with a ${Math.round(S.g.garden.path_w * 100)}cm path` : ""}`;
            }
          }
          const moving = new Set(movers.map(itemKey));
          const hit = moved.filter((i) => i.type === "space").map((i) => items.find((o) => o.type === "space" && !moving.has(itemKey(o)) && overlaps(i, o))).find(Boolean);
          if (hit) { els.forEach((el) => el && el.removeAttribute("transform")); toast(`That's on top of ${hit.s.name} - drag to a clear spot`); return; }
          if (!multi && movers.length === 1) selected = { type, id };
          await saveMany(moved, message);
        };
      };
    });
    wireBedCorners(svg);
  }

// Dragging a freeform bed's corners (in the bed's own turned frame), and adding new ones
function wireBedCorners(svg) {
  const it = selected && selected.type === "space" && planItems().find((i) => i.type === "space" && i.id === selected.id);
  if (!it || shapeType(it.s) !== "free") return;
  const P = outlinePts(it.s, it.w, it.h);
  const g = svg.querySelector(`[data-item="space"][data-id="${it.id}"]`);
  const pt = (ev) => { const q = svg.createSVGPoint(); q.x = ev.clientX; q.y = ev.clientY; return q.matrixTransform(svg.getScreenCTM().inverse()); };
  const local = (ev) => { const q = pt(ev), { lx, ly } = localOf(it, q.x, q.y); return [lx + it.w / 2, ly + it.h / 2]; };
  const show = (Q) => { const txt = Q.map(([x, y]) => `${it.x + x},${it.y + y}`).join(" "); g.querySelectorAll("polygon").forEach((pg) => pg.setAttribute("points", txt)); };
  g.querySelectorAll("[data-bvtx]").forEach((c) => {
    c.onpointerdown = (ev) => {
      ev.preventDefault(); ev.stopPropagation(); c.setPointerCapture(ev.pointerId);
      const k = Number(c.dataset.bvtx), start = local(ev), [x0, y0] = P[k];
      let moved = false;
      c.onpointermove = (mv) => {
        const q = local(mv), nx = x0 + q[0] - start[0], ny = y0 + q[1] - start[1];
        if (Math.abs(q[0] - start[0]) + Math.abs(q[1] - start[1]) > 0.05) moved = true;
        c.setAttribute("cx", it.x + nx); c.setAttribute("cy", it.y + ny);
        show(P.map((q2, n) => (n === k ? [nx, ny] : q2)));
      };
      c.onpointerup = (up) => {
        c.onpointermove = c.onpointerup = null;
        if (!moved) { bedVtx = bedVtx && bedVtx.id === it.id && bedVtx.k === k ? null : { id: it.id, k }; planWire.redraw(); return; }
        const q = local(up);
        P[k] = [x0 + q[0] - start[0], y0 + q[1] - start[1]]; bedVtx = null;
        saveBedShape(it, P);
      };
    };
  });
  g.querySelectorAll("[data-bmid]").forEach((m) => {
    m.onpointerdown = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    m.onpointerup = (ev) => {
      ev.stopPropagation();
      if (P.length >= 40) { toast("That's plenty of corners!"); return; }
      const k = Number(m.dataset.bmid), [x1, y1] = P[k], [x2, y2] = P[(k + 1) % P.length];
      P.splice(k + 1, 0, [(x1 + x2) / 2, (y1 + y2) / 2]); bedVtx = null;
      saveBedShape(it, P, "Corner added - drag it into place");
    };
  });
}

// Save a freeform bed's corners: its box grows or shrinks to fit them, so work out where the box now sits
async function saveBedShape(it, P, message) {
  const r2 = (v) => Math.round(v * 100) / 100;
  const xs = P.map((q) => q[0]), ys = P.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = Math.max(0.2, x1 - x0), h = Math.max(0.2, y1 - y0);
  const dx = (x0 + x1) / 2 - it.w / 2, dy = (y0 + y1) / 2 - it.h / 2, t = rad(it.a || 0);  // the middle moves in the bed's own turned frame
  const cx = it.x + it.w / 2 + dx * Math.cos(t) - dy * Math.sin(t), cy = it.y + it.h / 2 + dx * Math.sin(t) + dy * Math.cos(t);
  const pos = plotPositions();  // pin the others first, so the auto-arranged ones don't shuffle round
  await api("POST", "/api/spaces/positions", { positions: Object.entries(pos).map(([id, q]) => ({ id: Number(id), x: q.x, y: q.y })) });
  return patchSpace(it.s, { width_m: r2(w), length_m: r2(h), shape: { type: "free", pts: P.map(([x, y]) => [r2(x - x0), r2(y - y0)]) },
    pos_x: Math.max(0, r2(cx - w / 2)), pos_y: Math.max(0, r2(cy - h / 2)) }, message);
}

// Width/length boxes: the plan changes as you type, and saves itself a moment after you stop
function wireSize(wEl, hEl, it) {
  if (!wEl || !hEl || !it) return;
  let timer;
  const state = (t) => { const el = $("#sz-state"); if (el) el.textContent = t; };
  const values = () => [Number(wEl.value), Number(hEl.value)];
  const ok = ([w, h]) => w >= 0.2 && h >= 0.2 && w <= 100 && h <= 100;
  const save = async () => {
    const [w, h] = values();
    if (!ok([w, h])) return;
    state("saving…");
    try {
      if (it.type === "space") {
        const sp = space(it.id);
        S.g = await api("PATCH", `/api/spaces/${it.id}`, { name: sp.name, kind: sp.kind, soil: sp.soil, width_m: w, length_m: h });
      } else S.g = await api("PATCH", `/api/features/${it.id}`, { w, h });
      redrawPlanPicture();
      const me = planItems().find((i) => i.type === it.type && i.id === it.id);
      const hit = me && it.type === "space" && planItems().find((o) => o.type === "space" && o.id !== it.id && overlaps(me, o));
      state(hit ? `✓ saved - now overlaps ${hit.s.name}` : "✓ saved");
    } catch (e) { state(""); toast(e.message); }
  };
  const live = () => {
    const [w, h] = values();
    if (!ok([w, h])) return;
    if (it.type === "space") { const sp = space(it.id); sp.width_m = w; sp.length_m = h; }
    else { const f = S.g.garden.features.find((x) => x.id === it.id); f.w = w; f.h = h; }
    redrawPlanPicture();
    state("");
    clearTimeout(timer); timer = setTimeout(save, 700);
  };
  wEl.oninput = hEl.oninput = live;
  wEl.onchange = hEl.onchange = () => { clearTimeout(timer); save(); };
}

// Redraw just the plan picture (not the boxes round it) and keep it draggable
function redrawPlanPicture() {
  const old = view.querySelector("svg.plot");
  if (!old) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = plotSvg();
  const fresh = tmp.firstElementChild;
  old.replaceWith(fresh);
  if (plotEdit && !boundaryEdit) wireItemDrag(fresh);
}

function wireEdit(svg, redraw) {
  const bs = $("#b-start");
  if (bs) bs.onclick = () => { boundaryEdit = true; selected = null; bSel = null; window.scrollTo(0, 0); redraw(); };
  if (boundaryEdit) {
    if (svg) svg.addEventListener("click", (e) => e.stopPropagation(), true);  // editing the outline: don't open beds or crops
    wireBoundary(svg, redraw); return;
  }
  // save where things are: pin every bed where it is now, so only what you dragged (or turned) moves
  const saveMany = async (movedList, message) => {
    const pos = plotPositions();
    const list = Object.entries(pos).map(([id, p]) => ({ id: Number(id), x: p.x, y: p.y }));
    movedList.forEach((mv) => {
      if (mv.type === "space") Object.assign(list.find((e) => e.id === mv.id), { x: mv.x, y: mv.y, angle: mv.a });
      else list.push({ feature: mv.id, x: mv.x, y: mv.y, angle: mv.a });
    });
    await change("POST", "/api/spaces/positions", { positions: list }, message);
  };
  const save = (mv, message) => saveMany([mv], message);
  // turning the selected thing
  const it = selected && planItems().find((i) => i.type === selected.type && i.id === selected.id);
  const setAngle = (a) => {
    const norm = Math.round(((((a + 180) % 360) + 360) % 360) - 180);
    const items = planItems(), me = { ...it, a: norm };
    if (it.type === "space" && items.some((o) => o.type === "space" && o.id !== it.id && overlaps(me, o))) { toast("Turning it would hit another bed - move it first"); redraw(); return; }
    save({ type: it.type, id: it.id, x: it.x, y: it.y, a: norm });
  };
  if (it) {
    view.querySelectorAll("[data-rot]").forEach((b) => (b.onclick = () => {
      const r = b.dataset.rot;
      setAngle(r === "0" ? 0 : r === "90" ? it.a + 90 : it.a + Number(r));
    }));
    wireSize($("#sz-w"), $("#sz-h"), it);
    const del = $("#seldel");
    if (del) del.onclick = async () => {
      if (it.type === "space") {
        const n = activeCrops().filter((c) => c.space_id === it.id).length;
        if (!confirm(`Delete ${it.s.name}?${n ? ` The ${n} plant${n === 1 ? "" : "s"} in it go back to "Not placed yet".` : ""}`)) return;
        selected = null; await change("DELETE", `/api/spaces/${it.id}`, null, `🗑️ ${it.s.name} deleted`);
      } else {
        if (!confirm(`Remove the ${it.f.name.toLowerCase()} from your plan?`)) return;
        selected = null; await change("DELETE", `/api/features/${it.id}`, null, "Removed");
      }
    };
    view.querySelectorAll("[data-bshape]").forEach((b) => (b.onclick = () => {
      const k = b.dataset.bshape, cur = shapeType(it.s), r2 = (v) => Math.round(v * 100) / 100;
      if (k === cur) return;
      // to "any shape": start from the shape it is now (a round bed becomes 8 corners), then drag the dots
      const shape = k === "free" ? { type: "free", pts: outlinePts(it.s, it.w, it.h).filter((_, n) => cur !== "circle" || n % 4 === 0).map(([x, y]) => [r2(x), r2(y)]) } : { type: k };
      bedVtx = null;
      patchSpace(it.s, { width_m: it.w, length_m: it.h, shape }, k === "free" ? "✏️ Now drag the red dots to make any shape" : `${b.title} bed`);
    }));
    const bvDel = $("#bv-del");
    if (bvDel) bvDel.onclick = () => {
      const P = outlinePts(it.s, it.w, it.h);
      if (P.length <= 3) { toast("A bed needs at least 3 corners"); return; }
      P.splice(bedVtx.k, 1); bedVtx = null; saveBedShape(it, P, "Corner removed");
    };
    view.querySelectorAll("[data-copy-bed]").forEach((b) => (b.onclick = async () => {
      const spot = copySpot(it, b.dataset.copyBed), items = planItems(), twin = { ...it, ...spot, id: -1 };
      const hit = items.find((o) => o.type === "space" && overlaps(twin, o));
      if (hit) { toast(`There's no room - it would land on ${hit.s.name}`); return; }
      const gw = S.g.garden.w, gh = S.g.garden.h, bb = box(twin);
      if (bb.x0 < -0.05 || bb.y0 < -0.05 || (gw && gh && (bb.x1 > gw + 0.05 || bb.y1 > gh + 0.05))) { toast("That would go off the edge of your garden"); return; }
      const nums = S.g.spaces.map((sp) => (/^Bed (\d+)$/.exec(sp.name) || [])[1]).filter(Boolean).map(Number);
      const name = it.s.kind === "allotment" ? `${it.s.name} copy` : `Bed ${Math.max(S.g.spaces.filter((sp) => sp.kind !== "pot").length, ...nums) + 1}`;
      // pin the others first, so the auto-arranged ones don't shuffle round the new bed
      const pos = plotPositions();
      await api("POST", "/api/spaces/positions", { positions: Object.entries(pos).map(([id, p]) => ({ id: Number(id), x: p.x, y: p.y })) });
      if (await change("POST", "/api/spaces", { name, kind: it.s.kind, width_m: it.w, length_m: it.h, soil: it.s.soil, built: it.s.built == null ? null : !!it.s.built,
        pos_x: spot.x, pos_y: spot.y, angle: it.a }, `⧉ ${name} added next door${S.g.garden.path_w ? ` with a ${Math.round(S.g.garden.path_w * 100)}cm path` : ""}`)) {
        const made = S.g.spaces.find((sp) => sp.name === name);
        if (made) { selected = { type: "space", id: made.id }; plotPage(); }
      }
    }));
    const ang = $("#ang");
    if (ang) {
      const g = svg && svg.querySelector(`[data-item="${it.type}"][data-id="${it.id}"] .turn`);
      ang.oninput = () => { $("#angv").textContent = ang.value + "°"; if (g) g.setAttribute("transform", `rotate(${ang.value} ${it.x + it.w / 2} ${it.y + it.h / 2})`); };
      ang.onchange = () => setAngle(Number(ang.value));
    }
  }
  $("#snap").onchange = (e) => { snapOn = e.target.checked; try { localStorage.setItem("gtg-snap", snapOn ? "1" : "0"); } catch (err) { /* ignore */ } };
  $("#pathw").onchange = (e) => change("POST", "/api/garden/paths", { w: Number(e.target.value) }, "Path width saved");
  planWire = { redraw, saveMany };
  wireItemDrag(svg);
  const desel = $("#desel"); if (desel) desel.onclick = () => { selected = null; redraw(); };
  const grpMake = $("#g-make");
  if (grpMake) grpMake.onclick = async () => {
    const list = [...picked].map((k) => k.split(":"));
    const ok = await change("POST", "/api/plan/group", { spaces: list.filter(([t]) => t === "space").map(([, id]) => Number(id)),
      features: list.filter(([t]) => t === "feature").map(([, id]) => Number(id)) }, `🔗 Grouped ${list.length} - they'll move together now`);
    if (ok) { const first = list[0], it0 = planItems().find((i) => i.type === first[0] && i.id === Number(first[1])); multi = false; picked.clear(); selected = { type: "group", grp: it0.grp }; plotPage(); }
  };
  const grpClear = $("#g-clear"); if (grpClear) grpClear.onclick = () => { picked.clear(); redraw(); };
  const grpUn = $("#g-un"); if (grpUn) grpUn.onclick = async () => { const g = selected.grp; selected = null; await change("POST", "/api/plan/ungroup", { grp: g }, "Ungrouped"); };
  const grpClose = $("#g-close"); if (grpClose) grpClose.onclick = () => { selected = null; redraw(); };
  const selClose = $("#selclose"); if (selClose) selClose.onclick = () => { selected = null; redraw(); };
  // turn a whole group round its middle: every bed swings round together and turns by the same amount
  view.querySelectorAll("[data-grot]").forEach((b) => (b.onclick = () => {
    const d = Number(b.dataset.grot), items = planItems(), group = items.filter((i) => i.grp === selected.grp);
    const bbs = group.map(box), gx = (Math.min(...bbs.map((q) => q.x0)) + Math.max(...bbs.map((q) => q.x1))) / 2, gy = (Math.min(...bbs.map((q) => q.y0)) + Math.max(...bbs.map((q) => q.y1))) / 2;
    const c = Math.cos(rad(d)), sn = Math.sin(rad(d)), r2 = (v) => Math.round(v * 100) / 100;
    let moved = group.map((i) => {
      const dx = i.x + i.w / 2 - gx, dy = i.y + i.h / 2 - gy, cx = gx + dx * c - dy * sn, cy = gy + dx * sn + dy * c;
      return { ...i, x: cx - i.w / 2, y: cy - i.h / 2, a: Math.round(((((i.a + d + 180) % 360) + 360) % 360) - 180) };
    });
    const minX = Math.min(...moved.map((i) => box(i).x0)), minY = Math.min(...moved.map((i) => box(i).y0));  // keep it on the plan
    moved = moved.map((i) => ({ ...i, x: r2(i.x - Math.min(0, minX)), y: r2(i.y - Math.min(0, minY)) }));
    const inGroup = new Set(group.map(itemKey));
    const hit = moved.filter((i) => i.type === "space").map((i) => items.find((o) => o.type === "space" && !inGroup.has(itemKey(o)) && overlaps(i, o))).find(Boolean);
    if (hit) { toast(`Turning them would hit ${hit.s.name} - move the group first`); return; }
    saveMany(moved);
  }));
  const fsel = selected && selected.type === "feature" && S.g.garden.features.find((x) => x.id === selected.id);
  if (fsel) {
    view.querySelectorAll("[data-fruitinfo]").forEach((b) => (b.onclick = () => fruitSheet(fsel)));
    view.querySelectorAll("[data-kindpick]").forEach((b) => (b.onclick = () => kindPicker(fsel)));
    view.querySelectorAll("[data-fruitpick]").forEach((b) => (b.onclick = () => fruitPicker(fsel.kind, (fr) => {
      // rename it too, unless they've given it their own name
      const old = fruitOf(fsel), own = fsel.name !== FEATURES[fsel.kind].name && !(old && fsel.name === old.name);
      change("PATCH", `/api/features/${fsel.id}`, { variety: fr.id, ...(own ? {} : { name: fr.name }) }, `${fr.emoji} Now a ${fr.name.toLowerCase()}`);
    })));
  }

  const f = selected && selected.type === "feature" && S.g.garden.features.find((x) => x.id === selected.id);
  if (f) {
    $("#fsave").onclick = () => change("PATCH", `/api/features/${f.id}`, { name: $("#fname").value }, "Saved ✅");

    $("#fdel").onclick = async () => { if (confirm(`Remove the ${f.name.toLowerCase()} from your plan?`)) { selected = null; await change("DELETE", `/api/features/${f.id}`, null, "Removed"); } };
  }
  $("#add-space").onclick = addSpaceSheet;
  const addFeature = async (kind, fr) => {
    const k = { ...FEATURES[kind], ...(fr ? { name: fr.name, w: fr.w, h: fr.h, emoji: fr.plain ? FEATURES[kind].emoji : fr.emoji } : {}) }, items = planItems();
    // drop it in a clear spot: below everything else, inside the garden if it has a size
    const y = Math.max(0.5, ...items.map((i) => i.y + i.h + 0.8)), gh = S.g.garden.h;
    const at = { x: 0.5, y: gh ? Math.min(y, Math.max(0, gh - k.h)) : y };
    if (await change("POST", "/api/features", { kind, name: k.name, x: at.x, y: at.y, w: k.w, h: k.h, variety: fr ? fr.id : null }, `${k.emoji} ${k.name} added - drag it into place`)) {
      const last = S.g.garden.features[S.g.garden.features.length - 1];
      selected = { type: "feature", id: last.id }; redraw();
      if (fr && fr.kinds && fr.kinds.length) kindPicker(last);  // and straight on to which apple / plum it is
    }
  };
  view.querySelectorAll("[data-addfeat]").forEach((b) => (b.onclick = () => {
    const kind = b.dataset.addfeat;
    if (["tree", "bush"].includes(kind)) fruitPicker(kind, (fr) => addFeature(kind, fr)); else addFeature(kind);
  }));
  {
    let gTimer;
    const gwEl = $("#gw"), ghEl = $("#gh");
    const gLive = () => {
      const w = Number(gwEl.value), h = Number(ghEl.value);
      if (!(w >= 1 && h >= 1)) return;
      S.g.garden.w = w; S.g.garden.h = h; S.g.garden.shape = null;  // typing a size replaces a traced outline
      redrawPlanPicture();
      $("#g-state").textContent = "";
      clearTimeout(gTimer);
      gTimer = setTimeout(async () => {
        try { S.g = await api("POST", "/api/garden/size", { w, h }); redrawPlanPicture(); $("#g-state").textContent = `✓ saved: ${w} × ${h} m`; }
        catch (e) { toast(e.message); }
      }, 800);
    };
    gwEl.oninput = ghEl.oninput = gLive;
  }
  const gc = $("#gclear"); if (gc) gc.onclick = () => change("POST", "/api/garden/size", {}, "The plan now fits to what's in it");
  const gc2 = $("#gclear2"); if (gc2) gc2.onclick = () => change("POST", "/api/garden/size", {}, "Outline removed");
  $("#trace").onclick = openMapTrace;
}

// ---- trace the garden on a satellite map. Only the SHAPE is saved (metres) - never where it is ---------------

function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.onload = resolve; js.onerror = () => reject(new Error("Couldn't load the map - check your internet connection"));
    document.head.appendChild(js);
  });
}

// map taps (lat/lng) -> metres east (x) and south (y) of the first tap; good to centimetres over a garden or field
function toMetres(latlngs) {
  const lat0 = latlngs[0].lat, lng0 = latlngs[0].lng, k = Math.cos((lat0 * Math.PI) / 180);
  return latlngs.map((p) => [(p.lng - lng0) * 111320 * k, (lat0 - p.lat) * 110574]);
}
function shapeStats(pts) {
  if (pts.length < 3) return null;
  let a = 0;
  pts.forEach(([x1, y1], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; });
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { area: Math.abs(a) / 2, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

async function openMapTrace() {
  S.sheet = null;
  openSheet(`<h2>🗺️ Trace your garden</h2>
    <p class="small" style="margin:0 0 8px">Find your garden or field, zoom in, then <b>tap each corner</b> round its edge. 🔒 Grow to Gobble only keeps the shape and size - <b>never where it is</b>. This phone remembers the spot so it can show the satellite picture under your plan.</p>
    <form id="m-find" class="row" style="flex-wrap:nowrap;margin-bottom:8px"><input id="m-pc" type="text" autocomplete="postal-code" placeholder="Full postcode, e.g. LS6 2AB" aria-label="Postcode to find on the map">
      <button class="btn small primary" type="submit">🔍 Find</button></form>
    <div id="map" class="map"><p class="muted" style="padding:20px">Loading the map…</p></div>
    <p id="mapstats" class="small" style="margin:8px 0"><b>Tap the first corner.</b></p>
    <div class="row"><button class="btn small" id="m-loc">📍 Go to where I am</button><button class="btn small" id="m-undo">↶ Undo</button><button class="btn small ghost" id="m-clear">Start again</button></div>
    <button class="btn primary wide" id="m-save" style="margin-top:12px" disabled>Use this outline</button>`);
  try { await loadLeaflet(); } catch (e) { $("#map").innerHTML = `<div class="error">${esc(e.message)}</div>`; return; }
  $("#map").innerHTML = "";
  const map = L.map("map", { zoomControl: true, attributionControl: true }).setView(S.me.map_start, 17);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 20, maxNativeZoom: 19, attribution: "Powered by Esri · Imagery © Esri and its data providers",
  }).addTo(map);
  setTimeout(() => map.invalidateSize(), 250);
  const taps = [];
  const shape = L.polygon([], { color: "#f2b01e", weight: 3, fillColor: "#9fd88f", fillOpacity: 0.25 }).addTo(map);
  const dots = L.layerGroup().addTo(map);
  const stats = () => {
    const st = taps.length >= 3 && shapeStats(toMetres(taps));
    $("#mapstats").innerHTML = st ? `📐 About <b>${st.w.toFixed(1)} × ${st.h.toFixed(1)} m</b> across, <b>${Math.round(st.area)} m²</b> inside. Drag a corner to fix it, tap ＋ to add one, tap a corner to remove it.`
      : `<b>${taps.length ? `${taps.length} corner${taps.length === 1 ? "" : "s"} - keep going` : "Tap the first corner."}</b>`;
    $("#m-save").disabled = taps.length < 3;
  };
  // corners you can drag, ＋ halfway along each side to add a corner, tap a corner to remove it
  const draw = () => {
    shape.setLatLngs(taps); dots.clearLayers();
    taps.forEach((p, i) => {
      const mk = L.marker(p, { draggable: true, icon: L.divIcon({ className: "vtx-icon", iconSize: [18, 18] }), title: "Drag to move, tap to remove" }).addTo(dots);
      mk.on("drag", (e) => { taps[i] = e.target.getLatLng(); shape.setLatLngs(taps); stats(); });
      mk.on("dragend", draw);
      mk.on("click", () => { taps.splice(i, 1); draw(); });
    });
    if (taps.length >= 2) taps.forEach((p, i) => {
      if (i === taps.length - 1 && taps.length < 3) return;
      const q = taps[(i + 1) % taps.length], at = L.latLng((p.lat + q.lat) / 2, (p.lng + q.lng) / 2);
      L.marker(at, { icon: L.divIcon({ className: "mid-icon", html: "+", iconSize: [18, 18] }), title: "Add a corner here" }).addTo(dots)
        .on("click", () => { taps.splice(i + 1, 0, at); draw(); });
    });
    stats();
  };
  map.on("click", (e) => { taps.push(e.latlng); draw(); });
  $("#m-undo").onclick = () => { taps.pop(); draw(); };
  $("#m-clear").onclick = () => { taps.length = 0; draw(); };
  // jump to a postcode: looked up on the phone (postcodes.io), never sent to the app or saved
  $("#m-find").onsubmit = async (e) => {
    e.preventDefault();
    const pc = $("#m-pc").value.trim().toUpperCase().replace(/\s+/g, " ");
    if (!/^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/.test(pc)) { toast("Type a full postcode, like LS6 2AB"); return; }
    try {
      const r = await fetch("https://api.postcodes.io/postcodes/" + encodeURIComponent(pc));
      const data = await r.json();
      if (!r.ok || !data.result) { toast("Couldn't find that postcode - check it and try again"); return; }
      map.setView([data.result.latitude, data.result.longitude], 18);
      $("#m-pc").blur();
      toast("📍 Found it - your garden should be close by. Zoom out a little if you can't see it.");
    } catch (err) { toast("Couldn't look that up - check your internet connection"); }
  };
  $("#m-loc").onclick = () => {
    if (!navigator.geolocation) { toast("This phone can't share its location"); return; }
    navigator.geolocation.getCurrentPosition((p) => map.setView([p.coords.latitude, p.coords.longitude], 19),
      () => toast("Couldn't get your location - zoom in by hand instead"), { enableHighAccuracy: true, timeout: 10000 });
  };
  $("#m-save").onclick = async () => {
    const pts = toMetres(taps).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
    const anchor = { lat0: taps[0].lat, lng0: taps[0].lng, ox: Math.min(...pts.map((p) => p[0])), oy: Math.min(...pts.map((p) => p[1])) };
    if (await change("POST", "/api/garden/shape", { points: pts }, "Outline saved 📐 - tap 🛰️ to see the satellite picture under your plan")) {
      setSatAnchor(anchor);  // only on this device - the server only ever gets the shape
      showSat = true; remember("gtg-satview", true);
      map.remove(); closeSheet(); render();
    }
  };
}

function gardenList() {
  const unplaced = activeCrops().filter((c) => !c.space_id);
  const finished = S.g.crops.filter((c) => c.finished_on);
  const spend = S.g.spaces.reduce((n, sp) => n + sp.cost.total, 0), still = S.g.spaces.reduce((n, sp) => n + sp.cost.to_buy, 0);
  view.innerHTML = `<h1>🪴 My garden</h1>${gardenTabs()}
    ${spend ? `<div class="card tint-sun small"><b>💷 About ${money(spend)} to plant all your beds</b>${still < spend ? ` · ${money(still)} still to buy` : ""} - a rough guide to seeds and plants.</div>` : ""}
    ${S.g.spaces.map((s) => {
      const crops = activeCrops().filter((c) => c.space_id === s.id);
      const k = SPACE_KINDS[s.kind];
      const built = s.nodig_done.length, total = S.cat.nodig_steps.length;
      return `<div class="card">
        <div class="space-head"><span class="e">${k.emoji}</span><h3>${esc(s.name)}</h3><button class="btn small ghost" data-open-space="${s.id}">${s.kind === "pot" || s.built === 1 ? "Open" : s.built === 0 && built < total ? "Build it" : "Open"}</button></div>
        ${s.kind !== "pot" && s.built === 0 && built < total ? `<div class="progress" title="No-dig bed ${built} of ${total}"><i style="width:${(100 * built) / total}%"></i></div>` : ""}
        ${usageBar(s)}
        ${s.cost.total ? `<button class="btn small ghost costline" data-bedplan="${s.id}">💷 About ${money(s.cost.total)} to plant${s.cost.to_buy < s.cost.total ? ` · ${money(s.cost.to_buy)} still to buy` : ""} · 📐 plan</button>` : ""}
        ${s.clashes.map((x) => `<div class="checkbox warn small" style="margin-top:8px">🙅 ${plant(x.a).emoji} ${esc(plant(x.a).name)} and ${plant(x.b).emoji} ${esc(plant(x.b).name)} don't like sharing: ${esc(x.why)}.</div>`).join("")}
        ${crops.map(inBedRow).join("") || `<p class="small muted" style="margin:8px 0 0">Nothing growing here yet.</p>`}
        ${s.suggestion && s.suggestion.plants.length ? `<div class="suggest">${s.suggestion.plants.map((x) => suggestChip(x, `data-open-plant="${x.plant_id}" data-space="${s.id}"`, "+ ")).join("")}</div>` : ""}
      </div>`;
    }).join("")}
    ${unplaced.length ? `<div class="card"><h3>📍 Not placed yet</h3>${unplaced.map(cropRow).join("")}</div>` : ""}
    <div class="row"><button class="btn" id="add-space">➕ Add a bed or pot</button><a class="btn" href="#/plants">🥕 Add plants</a>
      ${activeCrops().length && S.g.spaces.length > 1 ? `<button class="btn" data-layout="all">🧩 Suggest a layout</button>` : ""}</div>
    ${finished.length ? `<details class="card" style="margin-top:14px"><summary><b>Finished (${finished.length})</b></summary>${finished.map(cropRow).join("")}</details>` : ""}`;
  $("#add-space").onclick = addSpaceSheet;
}

// How full a bed gets at its busiest moment
function usageBar(s) {
  const u = s.usage;
  if (!u || !u.area) return "";
  if (u.unit === "pots") {
    const used = Math.round(u.peak * 10) / 10, pctp = Math.round((100 * u.peak) / u.area);
    return `<div class="use ${pctp > 100 ? "over" : pctp > 85 ? "tight" : ""}"><div class="row" style="justify-content:space-between;gap:4px"><span class="small"><b>${pctp > 100 ? "⚠️ Too full" : pctp > 85 ? "Nearly full" : pctp ? "Room to spare" : "Empty"}</b>${u.on && pctp ? ` at the busiest (${fmt(u.on)})` : ""}</span>
      <span class="small muted">${used} of ${u.area} pot${u.area > 1 ? "s" : ""} used</span></div><div class="progress"><i style="width:${Math.min(100, pctp)}%"></i></div></div>`;
  }
  const pct = Math.round((100 * u.peak) / u.area);
  const size = s.width_m && s.length_m ? `${u.area} m² (${s.width_m} × ${s.length_m} m)` : `${u.area} m² (standard bed)`;
  const cls = pct > 100 ? "over" : pct > 85 ? "tight" : "";
  return `<div class="use ${cls}"><div class="row" style="justify-content:space-between;gap:4px"><span class="small"><b>${pct > 100 ? "⚠️ Too full" : pct > 85 ? "Nearly full" : pct ? "Room to spare" : "Empty"}</b>${u.on && pct ? ` at its busiest (${fmt(u.on)})` : ""}</span>
    <span class="small muted">${u.peak} m² used of ${size}</span></div>
    <div class="progress"><i style="width:${Math.min(100, pct)}%"></i></div></div>`;
}

// The details of a bed or pot: name, kind, size and soil - shared by "add" and the bed's own page
function spaceForm(s) {
  const kind = s ? s.kind : "bed", soil = (s && s.soil) || (kind === "pot" ? "compost" : "unknown");
  const shp = s && s.kind !== "pot" ? shapeType(s) : "rect", sunv = s && s.sun;
  return `<label class="field" for="sn">Name</label><input id="sn" type="text" maxlength="40" value="${esc(s ? s.name : "")}" placeholder="e.g. Back bed, Patio pots">
    <label class="field">What kind?</label>
    <div class="kinds">${Object.entries(SPACE_KINDS).map(([k, v]) => `<label class="kind ${kind === k ? "on" : ""}"><input type="radio" name="kind" value="${k}" ${kind === k ? "checked" : ""}><span class="e">${v.emoji}</span><b>${v.label}</b></label>`).join("")}</div>
    <div id="size"><label class="field">What shape?</label>
      <div class="kinds shapes">${SHAPES.map(([k, e, l]) => `<label class="kind ${shp === k ? "on" : ""}"><input type="radio" name="shape" value="${k}" ${shp === k ? "checked" : ""}><span class="e">${e}</span><b>${l}</b></label>`).join("")}</div>
      <p class="small muted" style="margin:6px 0 0" id="shapehint"></p>
      <label class="field">How big is it? <span class="muted small">(so we can check what fits)</span></label>
      <div class="size-row">
        <label class="big-num"><span>Width</span><input id="sw" type="number" step="0.1" min="0.1" inputmode="decimal" placeholder="1.2" value="${s && s.width_m ? s.width_m : ""}"><em>m</em></label>
        <span class="times">×</span>
        <label class="big-num"><span>Length</span><input id="sl" type="number" step="0.1" min="0.1" inputmode="decimal" placeholder="2.4" value="${s && s.length_m ? s.length_m : ""}"><em>m</em></label>
      </div>
      <p class="area" id="area"></p>
      <p class="small muted" style="margin:4px 0 0">Measure with a tape measure in metres (100cm = 1m). A standard raised bed is 1.2 × 2.4 m. A half allotment plot is about 5 × 25 m. For any other shape, measure the widest bits.</p></div>
    <label class="field">How sunny is it?</label>
    <div class="kinds">${Object.entries(S.cat.sun_spots).map(([k, v]) => `<label class="kind ${sunv === k ? "on" : ""}"><input type="radio" name="sun" value="${k}" ${sunv === k ? "checked" : ""}><span class="e">${v.emoji}</span><b>${esc(v.name)}</b></label>`).join("")}</div>
    <p class="small muted" style="margin:6px 0 0">Most veg want sun for 6 hours a day. Shady spots are great for flowers - see 🌸 Flower ideas in the bed.</p>
    <div id="potq"><label class="field">How big are your pots? <span class="muted small">(so we can say what fits)</span></label>
      <div class="potsizes">${S.cat.pot_sizes.map((z) => `<label class="kind potsize ${s && s.pot_size === z.key ? "on" : ""}"><input type="radio" name="potsize" value="${z.key}" ${s && s.pot_size === z.key ? "checked" : ""}>
        <span class="e">${potIcon(z)}</span><b>${esc(z.name)}</b><span class="small muted">${esc(z.label)} · ${z.litres}L</span></label>`).join("")}</div>
      <label class="field" for="pc">How many of them?</label>
      <div class="counter qty"><button type="button" class="btn small" data-pc="-1" aria-label="Fewer">−</button><input id="pc" type="number" inputmode="numeric" min="1" max="200" value="${(s && s.pot_count) || 1}"><button type="button" class="btn small" data-pc="1" aria-label="More">+</button></div>
      <p class="small muted" style="margin:6px 0 0">Measure across the top inside the rim. Pots of different sizes? Add each size as its own space, e.g. "Big tubs" and "Herb pots".</p>
      <div id="potfits"></div></div>
    <div id="builtq"><label class="field">Is it already built?</label>
    <div class="kinds two">${[[1, "✅", "Yes, it's ready"], [0, "🛠️", "Not yet - show me how"]].map(([v, e, t]) => `<label class="kind ${s && s.built === v ? "on" : ""}"><input type="radio" name="built" value="${v}" ${s && s.built === v ? "checked" : ""}><span class="e">${e}</span><b>${t}</b></label>`).join("")}</div></div>
    <label class="field">What's the soil like?</label>
    <div class="soils">${Object.entries(S.cat.soil_types).map(([k, v]) => `<label class="soilopt ${soil === k ? "on" : ""}"><input type="radio" name="soil" value="${k}" ${soil === k ? "checked" : ""}><span>${v.emoji}</span> ${esc(v.name)}</label>`).join("")}</div>
    <div class="checkbox" id="soiltip"></div>`;
}

function wireSpaceForm(s, afterSave) {
  const card = $("#sheet-card");
  const val = (n) => { const el = card.querySelector(`input[name=${n}]:checked`); return el && el.value; };
  const shapeBody = () => {
    const t = val("shape") || "rect";
    if (t !== "free") return { type: t };
    return s && shapeType(s) === "free" ? s.shape : { type: "free", pts: FREE_START };
  };
  const refresh = () => {
    if (!$("#size")) return;  // the pop-up now shows something else
    card.querySelectorAll(".kind").forEach((el) => { const i = el.querySelector("input"); if (i) el.classList.toggle("on", i.checked); });
    card.querySelectorAll(".soilopt").forEach((el) => el.classList.toggle("on", el.querySelector("input").checked));
    $("#size").hidden = $("#builtq").hidden = val("kind") === "pot";
    $("#potq").hidden = val("kind") !== "pot";
    const pk = val("potsize");
    $("#potfits").innerHTML = pk ? `<label class="field">🌱 Good in a ${esc(potName(potSize(pk)).toLowerCase())}:</label><div class="chips">${potFits(pk, ["veg", "herb"]).slice(0, 10).map((x) => `<span class="chip grey">${x.emoji} ${esc(x.name)} ×${x.pot_fits[pk]}</span>`).join("")}</div>` : "";
    card.querySelectorAll("#builtq .kind").forEach((el) => el.classList.toggle("on", el.querySelector("input").checked));
    const w = Number($("#sw").value), l = Number($("#sl").value), shape = shapeBody();
    const area = !(w && l) ? 0 : shape.type === "circle" ? (Math.PI * w * l) / 4 : polyArea(outlinePts({ kind: "bed", shape }, w, l));
    $("#area").innerHTML = area ? `= <b>${area.toFixed(2).replace(/\.?0+$/, "")} m²</b> of growing space` : "";
    $("#shapehint").textContent = { rect: "", circle: "Round or oval - measure across both ways.", triangle: "A triangle with its point at the back.",
      corner: "A triangle that fits into a corner, like the corner of a fence.",
      free: s && shapeType(s) === "free" ? "Change its shape on the plan: ✏️ Edit plan, tap the bed, then drag the red dots."
        : "After saving, go to ✏️ Edit plan, tap the bed and drag the red dots to make any shape." }[shape ? shape.type : "rect"];
    const t = S.cat.soil_types[val("soil") || "unknown"];
    $("#soiltip").innerHTML = `<div><b>${t.emoji} How to tell:</b> ${esc(t.test)}</div><div><b>🌱 What to do:</b> ${esc(t.tips)}</div>`;
  };
  // something's changed: light up the save buttons so it isn't forgotten
  const dirty = () => {
    card.querySelectorAll("#save, #save-top").forEach((b) => b.classList.add("dirty"));
    const st = $("#savestate"); if (st) st.textContent = "Unsaved changes";
  };
  card.oninput = card.onchange = () => { refresh(); dirty(); };  // replaced (not added to) each time a bed form opens
  card.onclick = (e) => { const b = e.target.closest("[data-pc]"); if (b) { const el = $("#pc"); el.value = Math.max(1, Math.min(200, (Number(el.value) || 1) + Number(b.dataset.pc))); dirty(); } };
  refresh();
  const save = async () => {
    const b = val("built");
    const body = { name: $("#sn").value || "My bed", kind: val("kind"), soil: val("soil"), built: b == null ? null : b === "1",
                   width_m: Number($("#sw").value) || null, length_m: Number($("#sl").value) || null,
                   shape: shapeBody(), sun: val("sun") || null,
                   ...(val("kind") === "pot" ? { pot_size: val("potsize") || "", pot_count: Number($("#pc").value) || 1 } : {}) };
    if (await change(s ? "PATCH" : "POST", s ? `/api/spaces/${s.id}` : "/api/spaces", body, s ? "Saved ✅" : "Added ✅") && afterSave) afterSave();
  };
  card.querySelectorAll("#save, #save-top").forEach((btn) => (btn.onclick = save));
}

function addSpaceSheet() {
  S.sheet = null;
  openSheet(`<h2>Add a growing space</h2>
    <div class="savebar"><span class="small muted" id="savestate">Fill in what you know - you can change it later</span><button class="btn primary small" id="save-top">Add it</button></div>
    ${spaceForm(null)}
    <button class="btn primary wide" id="save" style="margin-top:16px">Add it</button>`);
  wireSpaceForm(null, closeSheet);
}

function openSpace(id) {
  S.sheet = () => { if (space(id)) drawSpace(id); else closeSheet(); };
  drawSpace(id);
}

function drawSpace(id) {
  const s = space(id);
  const pot = s.kind === "pot";
  const steps = pot ? S.cat.pot_steps : S.cat.nodig_steps;
  const done = new Set(s.nodig_done);
  const here = activeCrops().filter((c) => c.space_id === s.id);
  const plantings = [...new Set(here.filter((c) => c.mixgrp).map((c) => c.mixgrp))].map((g) => here.filter((c) => c.mixgrp === g));
  const inGroup = (g) => here.filter((c) => !c.mixgrp && plant(c.plant_id).group === g);
  const veg = inGroup("veg"), herbs = inGroup("herb"), comps = inGroup("companion"), flowers = inGroup("flower");
  // companions that would help the veg in this bed, and aren't here yet
  const helpers = {};
  veg.forEach((c) => companionsFor(plant(c.plant_id)).forEach((x) => {
    if (here.some((k) => k.plant_id === x.plant_id)) return;
    const list = (helpers[x.plant_id] = helpers[x.plant_id] || []);
    if (!list.includes(plant(c.plant_id))) list.push(plant(c.plant_id));
  }));
  const helpList = Object.entries(helpers).sort((a, b) => b[1].length - a[1].length).slice(0, 5);
  const allRound = helpList.length || pot ? [] : S.cat.all_rounders.filter((id2) => !here.some((k) => k.plant_id === id2));
  const stepList = (ticks) => `<div class="card">${steps.map((st, i) => `<div class="nodig-step"><span class="e">${st.emoji}</span><div style="flex:1"><b>${i + 1}. ${esc(st.title)}</b><div class="small">${esc(st.text)}</div></div>
      ${ticks ? `<button class="tick ${done.has(i) ? "done" : ""}" data-tick="s${s.id}:nodig${i}" ${done.has(i) ? 'data-undo="1"' : ""} aria-label="Done">${done.has(i) ? "✓" : ""}</button>` : ""}</div>`).join("")}</div>`;
  const tips = `<details class="card" data-key="tips-${s.id}"><summary><b>🌱 Planting into a no-dig bed - tips</b></summary><ol class="steps">${S.cat.nodig_planting.map((t) => `<li>${esc(t)}</li>`).join("")}</ol></details>`;
  let build = "";
  if (pot) build = `<details class="card" data-key="pots-${s.id}"><summary><b>🪴 Setting up pots - how to</b></summary>${stepList(false)}</details>`;
  else if (s.built === 1) build = `${tips}<details class="card" data-key="build-${s.id}"><summary><b>🛠️ How to build a no-dig bed</b> <span class="small muted">(if you make another one)</span></summary>${stepList(false)}</details>`;
  else if (s.built === 0) build = `<h2 style="margin-top:20px">📦 Build your no-dig bed</h2>
    <div class="progress"><i style="width:${(100 * done.size) / steps.length}%"></i></div><p class="small muted">${done.size} of ${steps.length} steps done. Tick each one as you go!</p>
    ${stepList(true)}<p class="small muted">🕰️ Best time to build: autumn or winter, so it's ready for spring. But you can build one any time and plant straight into the compost.</p>${tips}`;
  else build = `<div class="card tint-soil"><b>Is ${esc(s.name)} already built?</b>
      <div class="row" style="margin-top:8px"><button class="btn small primary" data-setbuilt="${s.id}" data-v="1">✅ Yes, it's ready</button><button class="btn small" data-setbuilt="${s.id}" data-v="0">🛠️ Not yet - show me how</button></div></div>`;
  openSheet(`<div class="plant-head"><span class="e">${SPACE_KINDS[s.kind].emoji}</span><div><h2 style="margin:0">${esc(s.name)}</h2>
      <div class="muted">${pot ? "Growing in pots" : s.built === 1 ? "Built and ready to plant ✅" : s.built === 0 ? "Let's build it" : "Your bed"}</div></div></div>
    <div class="seg sticky-tabs" role="tablist"><button role="tab" data-pane="plants" class="on">Plants</button><button role="tab" data-pane="ideas">Ideas</button><button role="tab" data-pane="about">Details</button></div>
    <div data-panel="plants">
    ${here.length ? `<button class="card row costcard" data-bedplan="${s.id}" style="justify-content:space-between;width:100%">
      <span><b>About ${money(s.cost.total)} to plant</b><span class="small muted" style="display:block">${s.cost.to_buy < s.cost.total ? `${money(s.cost.to_buy)} still to buy · ` : ""}where each plant goes</span></span><span class="small" style="color:var(--forest-2);font-weight:700">Plan ›</span></button>` : ""}
    <div class="card"><h3>Growing here</h3>${here.length ? usageBar(s) : ""}
      ${plantings.map((g) => { const m = mixOf(g[0]), area = s.usage && s.usage.unit !== "pots" ? s.usage.area : 0;
        const foot = groupFoot(g);
        return `<div class="mixbox"><div class="mixhead"><b>${m ? m.emoji + " " + esc(m.name) : "Sown together"}</b><span class="small muted">one planting</span></div>
        ${foot && area ? `<div class="small" style="margin-bottom:4px">Takes about <b>${m2(foot)}</b> - <b>${Math.round((100 * foot) / area)}%</b> of this bed</div>
          <div class="fillrow" style="margin-bottom:6px"><span class="small muted">Resize to:</span>${FILLS.map(([f, l]) => `<button class="btn small" data-resizemix="${g[0].mixgrp}" data-area="${f * area}">${l}</button>`).join("")}</div>` : ""}
        ${g.map(inBedRow).join("")}</div>`; }).join("")}
      ${veg.map(inBedRow).join("") || (here.length ? "" : `<p class="small muted" style="margin:0 0 10px">Nothing growing here yet.</p>`)}
      ${herbs.length ? `<h3 style="margin-top:14px">🌿 Herbs</h3>${herbs.map(inBedRow).join("")}` : ""}
      ${comps.length ? `<h3 style="margin-top:14px">🐞 Companion plants</h3>${comps.map(inBedRow).join("")}` : ""}
      ${flowers.length ? `<h3 style="margin-top:14px">🌸 Flowers</h3>${flowers.map(inBedRow).join("")}` : ""}
      ${bedsNextTo(s.id).length ? `<p class="small muted" style="margin:10px 0 0">Nearby: ${bedsNextTo(s.id).map((n) => { const cs = activeCrops().filter((c) => c.space_id === n.id); return `${esc(n.name)} (${gapText(n.gap)})${cs.length ? " " + emojiList(cs) : " - empty"}`; }).join(" · ")}</p>` : ""}
      <div class="row" style="margin-top:10px"><a class="btn small" href="#/plants" data-close>Add plants</a>
      ${here.length ? `<button class="btn small ghost" data-empty="${s.id}">Take everything out</button>` : ""}</div></div>
    ${bedScene(s)}
    ${!here.length && !pot ? `<div class="card"><h3>Grow together</h3><p class="small muted" style="margin:0 0 8px">Fill the bed with plants that share the space - added as one planting.</p>
      <div class="nbs">${S.cat.mixes.map((m) => mixButton(m.id, s.id)).join("")}</div></div>` : ""}
    ${pot ? "" : build}
    </div>
    <div data-panel="ideas" hidden>
    ${pot ? potCard(s) : ""}
    ${helpList.length ? `<div class="card"><h3>Keep pests off</h3><p class="small" style="margin:0 0 8px">Flowers to grow among what's in this bed:</p>
      <div class="nbs">${helpList.map(([id2, veg2]) => { const q = plant(id2); return `<div class="nb comp"><span class="e">${q.emoji}</span><span style="flex:1"><b>${esc(q.name)}</b>
        <small>Helps your ${veg2.map((v) => esc(v.name.toLowerCase())).join(", ")}</small></span>
        <button class="btn small" data-addcomp="${id2}" data-space="${s.id}">Add</button></div>`; }).join("")}</div></div>` : ""}
    ${allRound.length ? `<div class="card"><h3>Keep pests off</h3><p class="small" style="margin:0 0 8px">Good all-rounders to dot round any ${s.kind === "allotment" ? "allotment" : "bed"} - they bring in bees and the bugs that eat greenfly, or lure pests away:</p>
      <div class="nbs">${allRound.map((id2) => { const q = plant(id2); return `<div class="nb comp"><span class="e">${q.emoji}</span><span style="flex:1"><b>${esc(q.name)}</b>
        <small>${esc(q.blurb)}</small></span><button class="btn small" data-addcomp="${id2}" data-space="${s.id}">➕ Add</button></div>`; }).join("")}</div></div>` : ""}
    ${here.length && !pot ? `<div class="card"><h3>Grow together</h3><div class="nbs">${S.cat.mixes.slice(0, 3).map((m) => mixButton(m.id, s.id)).join("")}</div></div>` : ""}
    <button class="card row costcard" data-flowers="${s.id}" style="justify-content:space-between;width:100%"><span><b>Flower ideas</b><span class="small muted" style="display:block">Flowers that go together, laid out for this ${pot ? "pot" : "bed"}</span></span><span class="small" style="color:var(--forest-2);font-weight:700">Show ›</span></button>
    </div>
    <div data-panel="about" hidden>
    <div class="savebar"><span class="small muted" id="savestate">Change anything, then save</span><button class="btn primary small" id="save-top">Save</button></div>
    <div class="card">${spaceForm(s)}
      <div class="row" style="margin-top:14px"><button class="btn primary" id="save">Save</button><button class="btn danger small" id="del">Delete</button></div></div>
    ${pot ? build : ""}
    </div>`);
  wirePanes("space-" + s.id);
  wireSpaceForm(s);
  $("#del").onclick = async () => {
    if (!confirm(`Delete ${s.name}? Plants in it stay in your plan, just not placed.`)) return;
    if (await change("DELETE", `/api/spaces/${s.id}`, null, "Deleted")) closeSheet();
  };
}

// ---- suggested layout: shown for checking, saved only when agreed --------------------------------------

async function openLayout(onlyUnplaced) {
  S.sheet = null;
  openSheet(`<h2>🧩 Suggested layout</h2><p class="muted">Working it out…</p>`);
  let moves;
  try { moves = (await api("GET", "/api/layout" + (onlyUnplaced ? "?only_unplaced=true" : ""))).moves; }
  catch (e) { openSheet(`<h2>🧩 Suggested layout</h2><div class="error">${esc(e.message)}</div>`); return; }
  const plan = Object.fromEntries(moves.map((m) => [m.crop_id, m.space_id]));
  const notes = Object.fromEntries(moves.map((m) => [m.crop_id, m.note]));
  const draw = () => {
    const groups = S.g.spaces.map((sp) => ({ sp, ids: moves.map((m) => m.crop_id).filter((id) => plan[id] === sp.id) }));
    const later = moves.map((m) => m.crop_id).filter((id) => !plan[id]);
    const row = (id) => {
      const c = crop(id), p = plant(c.plant_id);
      const opts = S.g.spaces.filter((sp) => p.where.includes(sp.kind === "pot" ? "pot" : "bed"));
      const moved = c.space_id !== plan[id];
      return `<div class="lay-row"><span class="e">${p.emoji}</span><div style="flex:1;min-width:0"><b>${esc(p.name)}</b>${rowLabel(c) ? ` <span class="chip grey">${rowLabel(c)}</span>` : ""}
        <div class="small muted">${notes[id] ? esc(notes[id]) : ""}${moved && c.space_id ? `${notes[id] ? " · " : ""}moving from ${esc(space(c.space_id).name)}` : ""}</div></div>
        <select data-plan="${id}" aria-label="Where ${esc(p.name)} goes"><option value="">📍 Decide later</option>${opts.map((sp) => `<option value="${sp.id}" ${plan[id] === sp.id ? "selected" : ""}>${SPACE_KINDS[sp.kind].emoji} ${esc(sp.name)}</option>`).join("")}</select></div>`;
    };
    openSheet(`<h2>🧩 Suggested layout</h2>
      <p class="small muted">We've shared ${onlyUnplaced ? "your unplaced plants" : "everything that isn't in the ground yet"} between your beds and pots - keeping bad neighbours apart, families together, and not overfilling any bed. <b>Nothing changes until you tap "Use this layout".</b> Change any of them first if you like.</p>
      ${groups.filter((g) => g.ids.length).map((g) => `<div class="card"><h3>${SPACE_KINDS[g.sp.kind].emoji} ${esc(g.sp.name)}</h3>${g.ids.map(row).join("")}</div>`).join("")}
      ${later.length ? `<div class="card"><h3>📍 Decide later</h3>${later.map(row).join("")}</div>` : ""}
      ${moves.length ? `<div class="row" style="position:sticky;bottom:0;background:var(--bg);padding:10px 0"><button class="btn primary" id="lay-ok">✅ Use this layout</button><button class="btn ghost" data-close>Not now</button></div>`
        : `<p>Everything is already planted, so there's nothing to move.</p>`}`);
    $("#sheet-card").onchange = (e) => { const sel = e.target.closest("[data-plan]"); if (sel) { plan[sel.dataset.plan] = sel.value ? Number(sel.value) : null; const y = $("#sheet-card").scrollTop; draw(); $("#sheet-card").scrollTop = y; } };
    const ok = $("#lay-ok");
    if (ok) ok.onclick = async () => {
      if (await change("POST", "/api/layout", { moves: Object.entries(plan).map(([crop_id, space_id]) => ({ crop_id: Number(crop_id), space_id })) }, "Layout saved 🧩")) closeSheet();
    };
  };
  draw();
}

// ---- crop detail -----------------------------------------------------------------------------------

function openCrop(id) {
  S.sheet = () => { if (crop(id)) drawCrop(id); else closeSheet(); };
  drawCrop(id);
}

function drawCrop(id) {
  const c = crop(id), p = plant(c.plant_id);
  const started = c.sown_on || c.planted_on;
  const fits = S.g.spaces.filter((s) => p.where.includes(s.kind === "pot" ? "pot" : "bed"));
  const todo = c.jobs.filter((j) => j.status !== "done");
  const doneJobs = c.jobs.filter((j) => j.status === "done" && j.kind !== "buy");
  const near = new Set(activeCrops().filter((x) => x.space_id && x.space_id === c.space_id && x.id !== c.id).map((x) => x.plant_id));
  const row = rowLabel(c);
  openSheet(`<div class="plant-head"><span class="blob l${p.level} ${blobCls(p)}">${pic(p)}</span><div><h2 style="margin:0">${esc(p.name)}${c.variety ? ` <span class="vname">'${esc(c.variety)}'</span>` : ""}${row ? ` <span class="chip grey" style="vertical-align:middle">${row}</span>` : ""}</h2>
      <div class="stage" style="font-size:20px;margin-top:4px">${stagesFor(plant(c.plant_id)).map((e, i) => `<span class="${i <= c.stage ? "on" : ""}">${e}</span>`).join("")}</div></div></div>
    ${c.mixgrp ? `<div class="mixbox mixnote"><div class="mixhead"><b>${mixOf(c) ? mixOf(c).emoji + " " + esc(mixOf(c).name) : "Sown together"}</b><button class="btn small ghost" id="ungroup">Split them up</button></div>
      <p class="small" style="margin:4px 0 0">Planted together with ${groupOf(c).filter((x) => x.id !== c.id).map((x) => esc(plant(x.plant_id).name.toLowerCase())).join(" and ")}. Moving or removing it moves or removes the whole planting.</p></div>` : ""}
    <div class="seg sticky-tabs" role="tablist">
      <button role="tab" data-pane="jobs" class="on">📋 Jobs</button><button role="tab" data-pane="details">⚙️ Details</button><button role="tab" data-pane="next">🔁 What next</button></div>
    <div data-panel="jobs">
      <div class="card">${todo.map((j) => jobCard(j, { noDrop: true })).join("") || `<div class="empty"><div class="big">🎉</div>Nothing left to do for this one!</div>`}</div>
      ${doneJobs.length ? `<details class="card" data-key="done-${c.id}"><summary><b>✅ Done (${doneJobs.length})</b> <span class="small muted">tap to see or undo</span></summary>${doneJobs.map((j) => jobCard(j, { noDrop: true })).join("")}</details>` : ""}
      <button class="btn wide" data-open-plant="${p.id}">📖 All about ${esc(p.name.toLowerCase())}</button>
    </div>
    <div data-panel="details" hidden>
      <label class="field" for="cv">Variety <span class="muted small">(the name on the packet)</span></label>
      <input id="cv" type="text" maxlength="40" list="cvl" value="${esc(c.variety || "")}" placeholder="e.g. ${esc(p.varieties[0] ? p.varieties[0].name : "the name on the packet")}">
      <datalist id="cvl">${p.varieties.map((v) => `<option value="${esc(v.name)}">`).join("")}</datalist>
      <label class="field" for="cs">Where it grows</label>
      <select id="cs" aria-label="Where it grows"><option value="" ${c.space_id ? "" : "selected"}>📍 Not in a bed (decide later)</option>${fits.map((s) => `<option value="${s.id}" ${s.id === c.space_id ? "selected" : ""}>${SPACE_KINDS[s.kind].emoji} ${esc(s.name)}</option>`).join("")}</select>
      ${!started && p.methods.length > 1 ? `<label class="field">How to start it</label><div class="chips" style="margin-bottom:12px">${p.methods.map((m) => `<button class="btn small ${m === c.method ? "primary" : ""}" data-crop-method="${m}">${S.cat.methods[m].emoji} ${esc(S.cat.methods[m].label)}</button>`).join("")}</div>` : ""}
      <div class="card tint-sky" style="margin-top:12px"><div class="row" style="justify-content:space-between">
        <div><b>How many ${esc(p.unit)}?</b><div class="small">🧺 ${esc(c.harvest || "")}</div><div class="small">🛒 ${esc(c.buy.text)}${c.buy.note ? ` <span class="muted">(${esc(c.buy.note)})</span>` : ""}</div>
        <div class="small">💷 About ${money(c.cost.total)} (${esc(c.cost.how)}) · <b>${pence(c.cost.per_plant)} a plant</b></div>${c.space_id && S.g.spaces.find((s) => s.id === c.space_id).kind !== "pot" ? `<div class="small muted">📏 Uses about ${c.area} m²</div>` : ""}</div>
        <div class="counter qty"><button class="btn small" data-cq="-1" aria-label="Fewer">−</button><input id="cq" type="number" inputmode="numeric" min="1" value="${c.qty}"><button class="btn small" data-cq="1" aria-label="More">+</button></div></div></div>
      ${datesCard(c)}
      <div class="row" style="margin-top:10px">
        ${c.finished_on ? "" : `<button class="btn" id="finish">🧹 All finished, clear it</button>`}
        <button class="btn danger" id="remove">🗑️ Remove</button></div>
    </div>
    <div data-panel="next" hidden>
      ${thenCard(c.then && dict(c.then, { family: p.family_name }), "When they're picked, grow next", c.space_id)}
      ${secondCard(c, p)}
      ${p.succession && c.method !== "plants" ? `<div class="card"><b>🔁 Steady supply</b><p class="small" style="margin:4px 0 0">Sow a little every ${p.succession} weeks instead of all at once - you'll get a few each week rather than loads at the same time. We'll remind you when it's time for the next batch.</p></div>` : ""}
      ${neighboursCard(p, near)}
    </div>`);
  wirePanes("crop-" + c.id);
  $("#cv").onchange = (e) => change("PATCH", `/api/crops/${c.id}`, { plant_id: c.plant_id, variety: e.target.value.trim() },
    e.target.value.trim() ? "Variety saved 🏷️" : "Variety cleared");
  $("#cs").onchange = (e) => change("PATCH", `/api/crops/${c.id}`, e.target.value
    ? { plant_id: c.plant_id, space_id: Number(e.target.value) } : { plant_id: c.plant_id, clear_space: true },
    e.target.value ? "Moved" : "Taken out of the bed - it's under Not placed yet 📍");
  document.querySelectorAll("[data-date]").forEach((inp) => (inp.onchange = () => change("PATCH", `/api/crops/${c.id}`,
    { plant_id: c.plant_id, [inp.dataset.date]: inp.value || "" }, inp.value ? "Date saved - plan updated 📅" : "Date cleared")));
  document.querySelectorAll("[data-second]").forEach((b) => (b.onclick = () => change("POST", "/api/crops", {
    plant_id: c.plant_id, method: c.method, quantity: c.qty, space_id: Number(b.dataset.space), after: c.second.window[0],
  }, `Second batch of ${p.name.toLowerCase()} planned 🌗`)));
  document.querySelectorAll("[data-crop-method]").forEach((b) => (b.onclick = () => change("PATCH", `/api/crops/${c.id}`, { plant_id: c.plant_id, method: b.dataset.cropMethod }, "Plan updated 📅")));
  let qTimer;
  const saveQty = (n) => { clearTimeout(qTimer); qTimer = setTimeout(() => change("PATCH", `/api/crops/${c.id}`, { plant_id: c.plant_id, quantity: n }), 500); };
  $("#cq").onchange = (e) => saveQty(Math.max(1, Number(e.target.value) || 1));
  document.querySelectorAll("[data-cq]").forEach((b) => (b.onclick = () => {
    const now = Number($("#cq").value) || 1, step = now >= 50 ? 10 : now >= 20 ? 5 : 1;
    $("#cq").value = Math.max(1, now + Number(b.dataset.cq) * step); saveQty(Number($("#cq").value));
  }));
  const fin = $("#finish");
  if (fin) fin.onclick = () => change("POST", `/api/crops/${c.id}/finish`, null, "Cleared - the space is free for something new 🌱");
  $("#remove").onclick = async () => {
    const m = mixOf(c);
    if (!confirm(m ? `Remove the whole ${m.name.split(":")[0].toLowerCase()} planting (${groupOf(c).length} plants)?` : `Remove ${p.name} from your garden?`)) return;
    if (await change("DELETE", `/api/crops/${c.id}${m ? "?whole_group=true" : ""}`, null, "Removed")) closeSheet();
  };
  const ug = $("#ungroup");
  if (ug) ug.onclick = () => change("PATCH", `/api/crops/${c.id}`, { plant_id: c.plant_id, ungroup: true }, "Split up - they're separate crops now");
}

// ---- plants ----------------------------------------------------------------------------------------

let plantFilter = "all", plantSearch = "", plantGroup = "veg";
function plantsPage() {
  const have = new Set(activeCrops().map((c) => c.plant_id));
  const q = plantSearch.toLowerCase();
  const list = filteredPlants(plantFilter, plantGroup).filter((p) => !q || p.name.toLowerCase().includes(q));
  const head = plantGroup === "companion" ? `<p class="muted small" style="margin:0 0 10px">Flowers to grow among your veg - they bring in bees and bug-eaters, or lure pests away.</p>` : "";
  const mine = activeCrops().length;
  const tabs = `<div class="seg scroll-seg" role="tablist" style="margin-bottom:12px">${Object.entries(GROUPS).map(([k, g]) => `<button data-pgroup="${k}" class="${plantGroup === k ? "on" : ""}">${g.name}</button>`).join("")}</div>`;
  const yours = mine ? `<button class="link-row" data-myplants style="width:100%;margin-bottom:12px"><b>Your plants</b> <span>${mine} · edit ›</span></button>` : "";
  if (plantGroup === "groups") {
    view.innerHTML = `${yours}${tabs}
      <h2>Veg grown together</h2><p class="small muted" style="margin:-4px 0 10px">Plants that share a bed - added as one planting, so they always stay together.</p>
      <div class="nbs">${S.cat.mixes.map((m) => mixButton(m.id)).join("")}</div>
      <h2 style="margin-top:22px">Flowers that go together</h2><p class="small muted" style="margin:-4px 0 10px">A ready-made flower bed - laid out for your bed's shape, and kept as one group.</p>
      <div class="nbs">${S.cat.combos.map((c) => `<button class="nb" data-open-combo="${c.id}"><span class="e">${c.emoji}</span><span><b>${esc(c.name)}</b>
        <small>${c.plants.map((id2) => plant(id2).emoji).join(" ")} · ${c.sun.map((x) => S.cat.sun_spots[x].name.toLowerCase()).join(" or ")}</small></span></button>`).join("")}</div>`;
  } else view.innerHTML = `${yours}${tabs}
    ${head}
    ${plantGroup === "veg" && plantFilter === "all" && !plantSearch ? plantNowStrip() : ""}
    <input type="text" id="q" placeholder="🔍 Search, e.g. ${plantGroup === "veg" ? "tomatoes" : plantGroup === "flower" ? "sunflowers" : plantGroup === "herb" ? "parsley" : "marigolds"}" value="${esc(plantSearch)}" style="margin-bottom:10px">
    ${plantGroup === "companion" ? "" : filterBar(plantFilter, plantGroup)}
    <div class="grid">${list.map((p) => tile(p, false, have.has(p.id))).join("") || `<p class="muted">Nothing matches.</p>`}</div>
    ${plantGroup === "companion" ? `<h2 style="margin-top:20px">🌻 Flowers & herbs that help too</h2>

      <div class="grid">${S.cat.plants.filter((p) => p.helps && p.group !== "companion" && (!q || p.name.toLowerCase().includes(q))).map((p) => tile(p, false, have.has(p.id), true)).join("")}</div>` : ""}`;
  if ($("#q")) $("#q").oninput = (e) => { plantSearch = e.target.value; const pos = e.target.selectionStart; plantsPage(); const q2 = $("#q"); q2.focus(); q2.setSelectionRange(pos, pos); };
  view.onclick = (e) => {
    const f = e.target.closest("[data-filter]");
    if (f) { plantFilter = f.dataset.filter; plantsPage(); return; }
    if (e.target.closest("[data-myplants]")) { openMyPlants(); return; }
    const oc = e.target.closest("[data-open-combo]");
    if (oc) { openCombo(oc.dataset.openCombo); return; }
    if (e.target.closest("[data-mixes]")) { openSheet(`<h2>Sow together to save space</h2><p class="muted small">One is picked before the next needs the room.</p><div class="nbs">${S.cat.mixes.map((m) => mixButton(m.id)).join("")}</div>`); return; }
    if (e.target.closest("[data-photos]")) { showPhotos = !showPhotos; remember("gtg-photos", showPhotos); plantsPage(); toast(showPhotos ? "🖼️ Showing photos" : "😀 Showing icons"); return; }
    const g = e.target.closest("[data-pgroup]");
    if (g) { plantGroup = g.dataset.pgroup; plantFilter = "all"; plantSearch = ""; plantsPage(); return; }
    const t = e.target.closest(".tile[data-plant]");
    if (t) openPlant(t.dataset.plant);
  };
}

function monthChart(p) {
  const rows = [["sow_in", "🏠 Indoors"], ["sow_out", "🌱 Sow"], ["plant_out", "🌿 Plant"], ["harvest", isFlower(p) ? "🌸 Flowers" : "🧺 Pick"]].filter(([k]) => p.months[k].length);
  const nowM = today().getMonth() + 1;
  return `<div class="months"><span></span>${MONTHS.map((m, i) => `<span class="m ${i + 1 === nowM ? "now" : ""}">${m[0]}</span>`).join("")}
    ${rows.map(([k, l]) => `<span class="lab">${l}</span>${MONTHS.map((_, i) => `<span class="cell ${p.months[k].includes(i + 1) ? k : ""}"></span>`).join("")}`).join("")}</div>`;
}

// "Good neighbours" / "Keep apart" for a plant. `near` highlights ones already in the same bed.
function neighboursCard(p, near = new Set()) {
  const chip = (x, bad) => { const q = plant(x.plant_id); return `<button class="nb ${bad ? "bad" : ""} ${near.has(x.plant_id) ? "near" : ""}" data-open-plant="${q.id}">
    <span class="e">${q.emoji}</span><span><b>${esc(q.name)}</b>${near.has(x.plant_id) ? ` <em>in this bed</em>` : ""}<small>${esc(x.why)}</small></span></button>`; };
  if (!p.good_with.length && !p.bad_with.length) return "";
  return `<div class="card"><h3>🤝 Good neighbours</h3>
    ${p.good_with.length ? `<div class="nbs">${p.good_with.map((x) => chip(x)).join("")}</div>` : `<p class="small muted">Happy next to most things.</p>`}
    ${p.bad_with.length ? `<h3 style="margin-top:14px">🙅 Keep apart</h3><div class="nbs">${p.bad_with.map((x) => chip(x, true)).join("")}</div>` : ""}</div>`;
}

// "When it's picked, grow this next in the same bed"
// "You've already got beetroot planned in Bed 2 from 12 Jul"
function alreadyText(pl, list) {
  return list.map((a) => `⚠️ You've already planned ${esc(pl.name.toLowerCase())} in <b>${esc(a.space_name || "your garden")}</b> from ${fmt(a.starts)}.`).join("<br>");
}
function suggestChip(x, attrs, prefix = "") {
  const q = plant(x.plant_id), dup = x.already && x.already.length;
  return `<button ${attrs} class="${dup ? "full" : ""}" ${dup ? `title="Already planned in ${esc(x.already[0].space_name || "another bed")}"` : ""}>${prefix}${q.emoji} ${esc(q.name)}${x.liked && !dup ? " ❤️" : ""}${dup ? " ⚠️" : ""}</button>`;
}
function dupNotes(list) {
  const dups = list.filter((x) => x.already && x.already.length);
  return dups.length ? `<p class="small" style="margin:8px 0 0">${dups.map((x) => alreadyText(plant(x.plant_id), x.already)).join("<br>")} Pick something else so you don't grow double.</p>` : "";
}

function thenCard(then, title, spaceId) {
  if (!then || !then.plants.length) return "";
  return `<div class="card tint-leaf"><h3>🔁 ${title}</h3>
    <p class="small muted" style="margin:0 0 4px">The bed should be free around <b>${fmt(then.free_from)}</b>. Don't leave it empty!
      ${then.plants.some((x) => x.method === "sow_in") ? "🏠 = give it a head start indoors, so it's ready to plant the day the bed is free." : ""}</p>
    <div class="suggest">${then.plants.map((x) => suggestChip(x, `data-open-plant="${x.plant_id}" data-method="${x.method}" data-after="${then.free_from}" ${spaceId ? `data-space="${spaceId}"` : ""}`, x.method === "sow_in" ? "🏠 " : "")).join("")}</div>
    ${dupNotes(then.plants)}
    <p class="small muted" style="margin:8px 0 0">We skip ${then.family ? "the " + esc(then.family) : "its close relatives"} - they share the same pests and diseases.</p></div>`;
}

// When things really happened - harvest dates are worked out from these, not the season's averages
function datesCard(c) {
  const rows = [];
  if (c.method !== "plants") rows.push(["sown_on", c.method === "sow_in" ? "🏠 Sown indoors" : "🌱 Sown"]);
  if (c.method !== "sow_out") rows.push(["planted_on", "🌿 Planted out"]);
  rows.push(["harvested_on", "🧺 First picked"]);
  const shown = rows.filter(([f]) => c[f] || (f === "sown_on") || (f === "planted_on" && c.sown_on) || (f === "harvested_on" && (c.sown_on || c.planted_on)));
  return `<div class="card"><h3>📅 Dates</h3>
    <p class="small muted" style="margin:0 0 8px">We note the date when you tick a job. Did it on a different day? Change it here - picking dates move to match.</p>
    ${shown.map(([f, label]) => `<label class="daterow"><span>${label}</span><input type="date" data-date="${f}" value="${c[f] || ""}" max="${S.g.today}"></label>`).join("")}</div>`;
}

// Autumn/spring crops: do you need both? And where the second batch could go.
function secondCard(c, p) {
  const s2 = c.second;
  if (!s2) return "";
  const when = `${fmt(s2.window[0])} to ${fmt(s2.window[1])}`;
  return `<div class="card ${s2.recommend ? "tint-leaf" : ""}"><h3>${s2.recommend ? "🌗" : "🤔"} ${esc(s2.title)}</h3>
    <p class="small" style="margin:0 0 8px">${esc(s2.why)}</p>
    ${s2.already ? `<p class="small" style="margin:0"><b>✅ You've already planned a second batch.</b></p>` : `
    <p class="small muted" style="margin:0 0 6px">Next chance: <b>${when}</b>${s2.spaces.length ? ". Where would it go?" : ""}</p>
    <div class="suggest">${s2.spaces.map((sp) => `<button data-second="${c.id}" data-space="${sp.id}" ${sp.fits ? "" : 'class="full"'}>${SPACE_KINDS[sp.kind].emoji} ${esc(sp.name)} ${sp.fits ? "✅ has room" : "⚠️ full then"}</button>`).join("")}</div>`}</div>`;
}

// Who wants to eat it, how to stop them, and when it's safe to uncover
function pestsCard(p) {
  const x = p.pests;
  if (!x.who.length) return `<div class="card"><h3>🛡️ Pests</h3><p class="small" style="margin:0">Hardly anything bothers ${esc(p.name.toLowerCase())}. Easy!</p></div>`;
  const cover = x.cover === "all" ? "🛡️ Keep it covered the whole time"
    : x.cover ? `🛡️ Cover it for the first ${x.cover} weeks` : "";
  return `<div class="card"><h3>🛡️ Who wants to eat it?</h3>
    <div class="nbs">${x.who.map((w) => `<div class="nb bad"><span class="e">${w.emoji}</span><span><b>${esc(w.name)}</b><small>${esc(w.what)}</small></span></div>`).join("")}</div>
    ${x.protect.length ? `<h3 style="margin-top:14px">How to stop them</h3><ol class="steps">${x.protect.map((st) => `<li>${esc(st)}</li>`).join("")}</ol>` : ""}
    ${cover ? `<div class="checkbox"><b>${cover}</b>${x.uncover ? `<div>🙌 <b>When to uncover:</b> ${esc(x.uncover)}</div>` : ""}</div>` : ""}</div>`;
}

// What soil it likes, and gentle, garden-safe things to add for a bigger crop
function soilCard(p) {
  const x = p.soil;
  return `<div class="card tint-soil"><h3>🟫 Soil & feeding</h3>
    <p style="margin:0 0 6px"><b>Likes:</b> ${esc(x.likes)}</p>
    <p class="small" style="margin:0 0 10px">${esc(x.how)}</p>
    <div class="nbs">${x.add.map((a) => `<div class="nb"><span class="e">${a.emoji}</span><span><b>${esc(a.name)}</b><small>${esc(a.what)}</small></span></div>`).join("")}</div>
    <div class="checkbox"><div>🏆 <b>For a bigger crop:</b> ${esc(x.bigger)}</div></div></div>`;
}

function storeCard(p) {
  const st = p.store;
  return `<div class="card tint-plum"><h3>🫙 Keeping it</h3>
    <p style="margin:0 0 6px"><b>Keeps for:</b> ${esc(st.keeps)}</p>
    <ul style="margin:0 0 8px;padding-left:20px">${st.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
    <p style="margin:0"><b>❄️ Freezing:</b> ${esc(st.freeze)}</p></div>`;
}

// Saving seeds (or bulbs, cuttings, runners...) for next year
function saveCard(p) {
  const x = p.save, badge = { easy: "🟢 Easy", tricky: "🟠 A bit tricky", no: "Not really" }[x.ease];
  const title = x.how === "seeds" || !x.how ? "🌰 Save seeds for next year" : `🌰 Free plants for next year - from ${x.how}`;
  return `<div class="card tint-soil"><h3>${title} <span class="chip grey" style="vertical-align:middle">${badge}</span></h3>
    ${x.when ? `<p style="margin:0 0 6px"><b>When:</b> ${esc(x.when)}</p>` : ""}
    <ol class="steps">${x.steps.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
    ${x.how === "seeds" ? `<details><summary class="small"><b>Keeping seeds safe until next year</b></summary><ul class="small" style="margin:6px 0 0;padding-left:18px">${S.cat.seed_store.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></details>` : ""}</div>`;
}

function roomCard(p) {
  return `<div class="card tint-sky"><h3>📏 How much room?</h3>
    <p style="margin:0 0 4px">Each one needs <b>${p.sp_cm}cm</b> to its neighbour, with <b>${p.row_cm}cm</b> between rows. That's about <b>${Math.max(1, Math.floor(1 / p.area_each))} per square metre</b>.</p>
    ${p.where.includes("pot") ? `<p class="small" style="margin:0">🪴 ${esc(p.pot_advice)}.</p>
      <div class="chips" style="margin-top:6px">${S.cat.pot_sizes.filter((z) => p.pot_fits[z.key]).slice(0, 6).map((z) => `<span class="chip grey">${esc(z.name)}: ${p.pot_fits[z.key]}</span>`).join("")}</div>` : ""}
    ${p.yield_each ? `<p class="small" style="margin:6px 0 0">🧺 Each of your ${esc(p.unit)} gives ${p.yield_each[0] === p.yield_each[1] ? p.yield_each[0] : p.yield_each[0] + "-" + p.yield_each[1]} ${esc(p.yield_each[2])}.</p>`
      : p.yield_text ? `<p class="small" style="margin:6px 0 0">🧺 You'll get ${esc(p.yield_text)}.</p>` : ""}
    ${p.pack_hint ? `<p class="small muted" style="margin:6px 0 0">💡 ${esc(p.pack_hint)}</p>` : ""}</div>`;
}

function openPlant(id, spaceId, startMethod, after) {
  const p = plant(id);
  S.sheet = null;
  const lv = S.cat.levels[p.level];
  const fits = S.g.spaces.filter((s) => p.where.includes(s.kind === "pot" ? "pot" : "bed"));
  const already = activeCrops().filter((c) => c.plant_id === id);
  let method = p.methods.includes(startMethod) ? startMethod : p.methods[0];
  let qty = p.default_qty, batches = 1, every = p.succession || 2, variety = "", vtag = null;
  const vtags = [...new Set(p.varieties.flatMap((v) => v.tags))];
  const varietyHtml = () => !p.varieties.length ? "" : `<details class="vfold" ${variety ? "open" : ""}><summary>Variety <span class="muted small">${variety ? esc(variety) : "optional - see the best ones"}</span></summary>
    ${vtags.length > 3 ? `<div class="chips">${vtags.map((t) => `<button class="btn small ${vtag === t ? "primary" : "ghost"}" data-vtag="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
    <div class="varieties">${p.varieties.filter((v) => !vtag || v.tags.includes(vtag)).map((v) => `<button class="variety ${variety === v.name ? "on" : ""}" data-variety="${esc(v.name)}">
      <b>${esc(v.name)}</b>${v.tags.map((t) => `<span class="vt">${esc(t)}</span>`).join("")}<small>${esc(v.why)}</small></button>`).join("")}</div>
    <input id="vother" type="text" maxlength="40" placeholder="Got a different one? Type its name" value="${p.varieties.some((v) => v.name === variety) ? "" : esc(variety)}" style="margin-top:8px"></details>`;
  const buyHtml = () => {
    const v = p.varieties.find((x) => x.name === variety);
    return `<h3>🛒 Buy ${v ? `'${esc(v.name)}' ` : ""}${p.buy_word ? esc(p.buy_word) : "seeds"}</h3><div class="shop-links">${(v ? v.links : p.links[p.methods[0]]).map((l) => `<a class="btn small" href="${esc(l.url)}" target="_blank" rel="sponsored noopener">${esc(l.shop)} ↗</a>`).join("")}</div>
      ${S.cat.affiliate ? `<p class="small muted" style="margin:8px 0 0">We may earn a small commission if you buy through these links. It helps keep the app free.</p>` : ""}`;
  };
  const rowsHtml = () => p.succession && method !== "plants" ? `<label class="field">How many rows? <span class="muted small">(sowing a row every few weeks gives a steady supply)</span></label>
      <div class="chips">${[1, 2, 3, 4].map((n) => `<button class="btn small ${n === batches ? "primary" : ""}" data-rows="${n}">${n === 1 ? "Just 1" : n + " rows"}</button>`).join("")}</div>
      ${batches > 1 ? `<label class="field">How far apart?</label>
      <div class="chips">${[2, 3, 4].map((n) => `<button class="btn small ${n === every ? "primary" : ""}" data-every="${n}">Every ${n} weeks${n === p.succession ? " ⭐" : ""}</button>`).join("")}</div>
      <p class="small muted" style="margin:6px 0 0">Each row gets its own sowing and picking dates, so you can tell them apart. "How many" is per row. ⭐ = what we'd suggest.</p>` : ""}` : "";
  const methodOpts = () => p.methods.map((m) => {
    const w = p.next[m];
    const when = after ? "" : w ? (daysBetween(today(), d(w[0])) <= 0 ? "You can do this now, until " + fmt(w[1]) : "Next chance: " + fmt(w[0]) + " to " + fmt(w[1])) : "";
    return `<label class="method ${m === method ? "on" : ""}"><input type="radio" name="m" value="${m}" ${m === method ? "checked" : ""}>
      <span style="font-size:24px">${S.cat.methods[m].emoji}</span><div><b>${esc(S.cat.methods[m].label)}</b>
      ${when ? `<div class="small muted">${when}</div>` : ""}</div></label>`;
  }).join("");
  const steps = p.steps_sow || p.steps_plant || null;
  openSheet(`${showPhotos && p.photo ? `<figure class="hero-pic"><img src="${esc(p.photo.src)}" alt="${esc(p.name)}" data-fallback="">
      <figcaption><a href="${esc(p.photo.page)}" target="_blank" rel="noopener">📷 ${esc(p.photo.credit || "Wikimedia Commons")}</a></figcaption></figure>` : ""}
    <div class="plant-head"><span class="blob l${p.level}">${p.emoji}</span><div><h2 style="margin:0">${esc(p.name)}</h2>
      <div class="chips" style="margin-top:6px"><span class="chip l${p.level}">${lv.emoji} ${esc(lv.name)}</span>
      ${p.where.includes("pot") ? `<span class="chip sky">🪴 Pots OK</span>` : `<span class="chip grey">🟫 Beds only</span>`}
      ${p.tender ? `<span class="chip grey">❄️ Hates frost</span>` : ""}${p.perennial ? `<span class="chip grey">♻️ Comes back every year</span>` : ""}
      ${p.sun ? `<span class="chip grey">${p.sun.map((x) => SUN_EMOJI[x]).join("")} ${p.sun.includes("sun") ? (p.sun.length > 1 ? "Sun or part shade" : "Needs sun") : "Happy in shade"}</span><span class="chip grey">📏 ${p.height_cm}cm tall</span>` : ""}
      ${p.group !== "veg" ? `<span class="chip sky">${GROUPS[p.group].emoji} ${p.group === "flower" ? "Flower" : "Companion plant"}</span>` : ""}</div></div></div>
    <p><b>${esc(p.blurb)}</b></p>
    <div class="seg sticky-tabs" role="tablist">
      <button role="tab" data-pane="grow" class="on">🌱 Grow it</button><button role="tab" data-pane="how">📖 How to</button>
      ${p.group === "veg" && companionsFor(p).length ? `<button role="tab" data-pane="comp">🐞 Companions</button>` : ""}
      ${p.group === "companion" ? `<button role="tab" data-pane="helps">🥕 Helps</button>` : ""}
      <button role="tab" data-pane="pick">${isFlower(p) ? "🌸 Flowers" : "🧺 Pick & keep"}</button></div>
    <div data-panel="grow">
    ${after ? `<div class="card tint-sun"><b>🔁 Following on from another crop</b><p class="small" style="margin:4px 0 0">${method === "sow_in"
      ? `Give it a head start: sow it indoors (windowsill or greenhouse) a few weeks early, so it's ready to plant out the day the bed is free - <b>${fmt(after)}</b>. No gap, no empty bed!`
      : `We'll plan this to go in once the bed is free, from <b>${fmt(after)}</b>.`}</p></div>` : ""}
    <div class="card"><h3>📅 When</h3>${monthChart(p)}
      <div class="legend">${p.months.sow_in.length ? `<span><i style="background:var(--sky)"></i>Sow indoors</span>` : ""}${p.months.sow_out.length ? `<span><i style="background:var(--leaf)"></i>Sow / plant outside</span>` : ""}${p.months.plant_out.length ? `<span><i style="background:var(--soil)"></i>Plant out</span>` : ""}<span><i style="background:var(--marigold)"></i>${isFlower(p) ? "Flowers" : "Pick"}</span></div>
      <p class="small muted" style="margin:8px 0 0">Dates for ${esc(S.me.region.name)}. Ready about ${p.weeks} weeks after ${p.methods.includes("plants") && p.methods.length === 1 ? "planting" : "sowing"}.</p></div>
    <div class="card" id="addcard"><h3>🌱 Add to my garden</h3>
      ${already.length ? `<p class="small muted">You're already growing ${already.length === 1 ? "this" : already.length + " lots of these"}. Add another?</p>` : ""}
      <div id="methods">${methodOpts()}</div>
      <div id="vars">${varietyHtml()}</div>
      <label class="field" for="qty">How many ${esc(p.unit)}?</label>
      <div class="counter qty"><button class="btn small" data-q="-1" aria-label="Fewer">−</button><input id="qty" type="number" inputmode="numeric" min="1" max="5000" value="${qty}"><button class="btn small" data-q="1" aria-label="More">+</button></div>
      <div id="rows">${rowsHtml()}</div>
      ${fits.length ? `<label class="field" for="sp">Where?</label><select id="sp"><option value="">📍 Decide later</option>${fits.map((s) => `<option value="${s.id}" ${s.id === spaceId ? "selected" : ""}>${SPACE_KINDS[s.kind].emoji} ${esc(s.name)}</option>`).join("")}</select><div id="where-advice"></div><div id="fill"></div>`
        : `<p class="small muted">${p.where.includes("pot") ? "" : "This one needs a bed - it's too big for pots. "}Add a ${p.where.includes("pot") ? "bed or pot" : "bed"} in My garden to place it.</p>`}
      <div id="check" class="check-box" aria-live="polite"></div>
      <button class="btn primary wide" style="margin-top:14px" id="add">Add ${esc(p.name.toLowerCase())} 🌱</button></div>
    <div class="card" id="buy">${buyHtml()}</div>
    </div>
    <div data-panel="how" hidden>
    ${roomCard(p)}
    ${p.mixes.length ? `<div class="card"><h3>Sow it together - save space</h3><div class="nbs">${p.mixes.map(mixButton).join("")}</div></div>` : ""}
    ${p.tips.length ? `<div class="card tint-sun pip">${PIP}<div><h3 style="margin-bottom:4px">Pip's top tips</h3><ul>${p.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div></div>` : ""}
    ${p.prep.map((x) => `<div class="card tint-soil"><h3>🪜 Before you plant: ${esc(x.title.charAt(0).toLowerCase() + x.title.slice(1))}</h3><ol class="steps">${x.steps.map((st) => `<li>${esc(st)}</li>`).join("")}</ol></div>`).join("")}
    ${p.seedling ? `<div class="card tint-sky"><h3>🌱 Is it a seedling or a weed?</h3><p style="margin:0 0 8px"><b>${p.emoji} ${esc(p.name)}:</b> ${esc(p.seedling)}</p>
      <ul class="small" style="margin:0;padding-left:18px">${S.cat.weed_tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}
    ${steps ? `<div class="card"><h3>👣 How to plant</h3><ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>` : ""}
    ${soilCard(p)}
    ${neighboursCard(p)}
    ${pestsCard(p)}
    </div>
    ${p.group === "veg" ? `<div data-panel="comp" hidden>${companionPanel(p, spaceId)}</div>` : ""}
    ${p.group === "companion" ? `<div data-panel="helps" hidden><div class="card tint-leaf"><h3>🥕 Grow it next to</h3>
      <div class="nbs">${helpsWhat(p).map((x) => { const q = plant(x.plant_id); return `<button class="nb" data-open-plant="${q.id}"><span class="e">${q.emoji}</span><span><b>${esc(q.name)}</b><small>${esc(x.why)}</small></span></button>`; }).join("")}</div></div></div>` : ""}
    <div data-panel="pick" hidden>
    <div class="card tint-leaf"><h3>${isFlower(p) ? "🌸 Flowers" : "🧺 Picking"}</h3><p style="margin:0">${esc(p.harvest_tip)}</p></div>
    ${p.eat ? `<div class="card tint-tomato"><h3>😋 Eat it!</h3><p style="margin:0">${esc(p.eat)}</p></div>` : ""}
    ${p.store ? storeCard(p) : ""}
    ${saveCard(p)}
    ${p.overwinter ? `<div class="card tint-sky"><h3>❄️ Keep it over winter - no need to start again from seed</h3>
      <p style="margin:0 0 6px"><b>How long:</b> ${esc(p.overwinter.years)}</p><ol class="steps">${p.overwinter.steps.map((t) => `<li>${esc(t)}</li>`).join("")}</ol></div>` : ""}
    ${after || !p.then ? "" : thenCard(dict(p.then, { family: p.family_name }), "After picking, grow next", spaceId)}
    </div>`);
  wirePanes();

  let timer, asked = 0;
  const runCheck = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const sp = $("#sp"), n = ++asked;
      const params = new URLSearchParams({ plant_id: p.id, method, quantity: qty });
      if (sp && sp.value) params.set("space_id", sp.value);
      if (after) params.set("after", after);
      try {
        const r = await api("GET", "/api/check?" + params);
        if (n === asked && $("#check")) $("#check").innerHTML = checkHtml(p, r);
      } catch (e) { /* the check is a nicety; adding still works */ }
    }, 250);
  };
  const vars = $("#vars");
  vars.onclick = (e) => {
    const t = e.target.closest("[data-vtag]"), v = e.target.closest("[data-variety]");
    if (t) vtag = vtag === t.dataset.vtag ? null : t.dataset.vtag;
    if (v) variety = variety === v.dataset.variety ? "" : v.dataset.variety;
    if (t || v) { vars.innerHTML = varietyHtml(); $("#buy").innerHTML = buyHtml(); }
  };
  vars.oninput = (e) => { if (e.target.id === "vother") { variety = e.target.value.trim(); $("#buy").innerHTML = buyHtml();
    vars.querySelectorAll(".variety.on").forEach((b) => b.classList.remove("on")); } };
  $("#methods").onchange = (e) => { method = e.target.value; $("#methods").innerHTML = methodOpts(); $("#rows").innerHTML = rowsHtml(); runCheck(); };
  $("#rows").onclick = (e) => {
    const b = e.target.closest("[data-rows]"), ev = e.target.closest("[data-every]");
    if (b) batches = Number(b.dataset.rows);
    if (ev) every = Number(ev.dataset.every);
    if (b || ev) $("#rows").innerHTML = rowsHtml();
  };
  $("#qty").oninput = (e) => { qty = Math.max(1, Math.min(5000, Number(e.target.value) || 1)); runCheck(); };
  document.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => {
    const step = qty >= 50 ? 10 : qty >= 20 ? 5 : 1;
    qty = Math.max(1, qty + Number(b.dataset.q) * step); $("#qty").value = qty; runCheck();
  }));
  // "Fill the bed": pick a share of the chosen bed and we work out how many
  const drawFill = () => {
    const sp = $("#sp"), bed = sp && sp.value ? space(Number(sp.value)) : null;
    const area = bed && bed.usage && bed.usage.area;
    if (bed && bed.usage && bed.usage.unit === "pots") {
      const per = (p.pot_fits || {})[bed.pot_size] || 0, n = bed.pot_count || 1;
      $("#fill").innerHTML = per ? `<div class="fillrow"><span class="small muted">${per} fit in each pot:</span><button class="btn small" data-fillpots="1">1 pot</button>${n > 1 ? `<button class="btn small" data-fillpots="${n}">All ${n} pots</button>` : ""}</div>`
        : `<p class="small" style="margin:6px 0 0">⚠️ Too big for these pots - ${esc(p.pot_advice.toLowerCase())}.</p>`;
      $("#fill").onclick = (e) => { const b = e.target.closest("[data-fillpots]"); if (!b) return; qty = per * Number(b.dataset.fillpots); $("#qty").value = qty; runCheck(); toast(`${b.textContent} = ${qty} ${p.unit}`); };
      return;
    }
    $("#fill").innerHTML = area ? `<div class="fillrow"><span class="small muted">Fill ${esc(bed.name)}:</span>${[[0.25, "¼"], [0.5, "½"], [0.75, "¾"], [1, "Whole bed"]]
      .map(([f, l]) => `<button class="btn small" data-fill="${f}">${l}</button>`).join("")}</div>` : "";
    $("#fill").onclick = (e) => {
      const b = e.target.closest("[data-fill]");
      if (!b) return;
      qty = Math.max(1, Math.floor((area * Number(b.dataset.fill)) / p.area_each));
      $("#qty").value = qty; runCheck();
      toast(`${b.textContent === "Whole bed" ? "The whole bed" : b.textContent + " of the bed"} = ${qty} ${p.unit}`);
    };
  };
  const drawWhere = () => {
    const sp = $("#sp"), el = $("#where-advice");
    if (!sp || !el) return;
    const bed = sp.value ? space(Number(sp.value)) : null;
    const best = S.g.spaces.map((x) => bedAdvice([p.id], x)).filter((a) => !a.wrongKind).sort((x, y) => y.score - x.score)[0];
    el.innerHTML = bed ? `<div class="adv-box">${adviceLines(bedAdvice([p.id], bed))}
      ${best && best.sp.id !== bed.id && best.score > bedAdvice([p.id], bed).score ? `<button type="button" class="btn small" data-usebed="${best.sp.id}" style="margin-top:6px">Better: ${esc(best.sp.name)}</button>` : ""}</div>`
      : best && best.score >= 0 ? `<button type="button" class="btn small ghost" data-usebed="${best.sp.id}" style="margin-top:6px">Suggested: ${esc(best.sp.name)}</button>` : "";
    el.onclick = (e) => { const u = e.target.closest("[data-usebed]"); if (u) { sp.value = u.dataset.usebed; drawWhere(); drawFill(); runCheck(); } };
  };
  if ($("#sp")) $("#sp").onchange = () => { drawWhere(); drawFill(); runCheck(); };
  drawWhere();
  drawFill();
  runCheck();
  $("#add").onclick = async () => {
    const sp = $("#sp");
    const many = batches > 1 && p.succession && method !== "plants";
    if (await change("POST", "/api/crops", { plant_id: p.id, method, quantity: qty, after: after || null, space_id: sp && sp.value ? Number(sp.value) : null, variety: variety || null,
      batches: many ? batches : 1, every_weeks: every }, many ? `${batches} rows of ${p.name.toLowerCase()} planned 🌱` : `${p.name} added to your plan! 🌱`)) closeSheet();
  };
}

// ---- what it'll look like: a side view of a bed, drawn to scale, through the year --------------------------
// Each plant gets a shape (stalk, spike, daisy, mound, climber...) and its flower or fruit colour.
const LOOK = {
  sweetcorn: ["stalk", "#e9c64a"], sunflower: ["stalk", "#f4c430"], lily: ["stalk", "#f6efe2"], broad_beans: ["stalk", "#f3f3f3"],
  sprouts: ["stalk", null], tomatoes_big: ["stalk", "#d63b2f"],
  hollyhock: ["spike", "#e889b5"], delphinium: ["spike", "#3d6fd6"], lupin: ["spike", "#8a5bd6"], gladiolus: ["spike", "#e8564a"],
  snapdragon: ["spike", "#f08cb0"], salvia: ["spike", "#6a3fb5"], lavender: ["spike", "#9a7fd1"], astilbe: ["spike", "#f2a0c0"],
  phacelia: ["spike", "#8f7fe0"], hyacinth: ["spike", "#6f7fe8"],
  cosmos: ["daisy", "#e98ac0"], echinacea: ["daisy", "#d96aa0"], rudbeckia: ["daisy", "#f2b21b"], zinnia: ["daisy", "#f0643c"],
  poppy: ["daisy", "#e2362f"], cornflower: ["daisy", "#3f6fe0"], nigella: ["daisy", "#7fa8e8"], verbena: ["daisy", "#9b59d0"],
  aquilegia: ["daisy", "#a066d0"], anemone: ["daisy", "#f4d6e6"],
  calendula: ["mound", "#f39a1e"], french_marigold: ["mound", "#f08a12"], nasturtium: ["mound", "#f26a1b"], borage: ["mound", "#4c7fe0"],
  poached_egg: ["mound", "#f7e15a"], alyssum: ["mound", "#ffffff"], geranium: ["mound", "#7c6fe0"], viola: ["mound", "#f2c94c"],
  petunia: ["mound", "#b04fd0"], bedding_geranium: ["mound", "#e53935"], lobelia: ["mound", "#3f5fe0"], begonia: ["mound", "#ef5350"],
  busy_lizzie: ["mound", "#f06292"], primrose: ["mound", "#f5e17a"], forget_me_not: ["mound", "#8ab4f8"], heuchera: ["mound", "#b04a6a"],
  hosta: ["mound", "#c8b6e2"], hellebore: ["mound", "#f0e2ee"], sweet_william: ["mound", "#d0315f"], thyme: ["mound", "#c9a0e0"],
  sage: ["mound", "#9b7fd0"], oregano: ["mound", "#d0a0d8"], basil: ["mound", null], parsley: ["mound", null], mint: ["mound", null],
  fern: ["fern", null],
  snowdrop: ["bulb", "#ffffff"], crocus: ["bulb", "#9b6fe0"], daffodil: ["bulb", "#f7d33b"], tulip: ["bulb", "#e53935"], bluebell: ["bulb", "#5a6fe0"],
  allium: ["ball", "#9a5fd0"],
  peony: ["shrub", "#f2a0c0"], rose: ["shrub", "#d62f4f"], hydrangea: ["shrub", "#7fa6e8"], buddleja: ["shrub", "#9b59d0"],
  fuchsia: ["shrub", "#d6337f"], dahlia: ["shrub", "#e8483a"], rosemary: ["shrub", "#8fa0e0"], raspberries: ["shrub", "#d62f4f"],
  blueberries: ["shrub", "#3b4fa0"],
  clematis: ["climber", "#8a5fd0"], honeysuckle: ["climber", "#f5d27a"], sweet_pea: ["climber", "#e98ac0"], french_beans: ["climber", "#7fb04a"],
  runner_beans: ["climber", "#e2362f"], peas: ["climber", "#9fd06a"], cucumber: ["climber", "#4f9a3a"],
  squash: ["sprawl", "#f29a1e"], pumpkin: ["sprawl", "#f07a12"], courgette: ["sprawl", "#3f7a2a"], summer_squash: ["sprawl", "#f2c21b"],
  melon: ["sprawl", "#e8c26a"], strawberries: ["sprawl", "#e2362f"], sweet_potatoes: ["sprawl", null],
  tomatoes: ["bush", "#e2362f"], chillies: ["bush", "#d62f2f"], peppers: ["bush", "#e53935"], aubergine: ["bush", "#5b2b6e"], potatoes: ["bush", "#f0f0f8"],
  onions: ["strap", null], garlic: ["strap", null], leeks: ["strap", null], spring_onions: ["strap", null], chives: ["strap", "#c58ad8"],
  carrots: ["feather", null], parsnips: ["feather", null], dill: ["feather", "#e8d44a"], coriander: ["feather", "#ffffff"],
  beetroot: ["leafy", "#9b2d4f"], chard: ["leafy", "#e2362f"], radish: ["leafy", null], salad: ["leafy", null], kale: ["leafy", null],
  broccoli: ["leafy", null], cauliflower: ["leafy", null], rhubarb: ["leafy", "#c8304a"],
};
// Is it in the ground in month m (1-12), and is it at its best (flowering or ready to pick)?
function lifeState(p, m) {
  if (p.months.harvest.includes(m)) return "show";
  if (p.perennial) return "growing";
  const starts = [...p.months.sow_out, ...p.months.plant_out];
  if (!starts.length || !p.months.harvest.length) return "none";
  const first = starts.sort((a, b) => a - b)[0], last = p.months.harvest[p.months.harvest.length - 1];
  for (let k = first, n = 0; n < 12; n++, k = (k % 12) + 1) { if (k === m) return "growing"; if (k === last) break; }
  return "none";
}
// one plant, standing on y, h pixels tall and about w wide
function plantShape(p, x, y, h, w, state) {
  const [kind, col] = LOOK[p.id] || ["mound", null], show = state === "show" && col, leaf = "#4f8f3a", leaf2 = "#6aa84f";
  const dots = (n, cx, cy, rx, ry, r, c) => Array.from({ length: n }, (_, k) => { const a = k * 2.399, d = Math.sqrt((k + 0.5) / n);
    return `<circle cx="${cx + Math.cos(a) * rx * d}" cy="${cy + Math.sin(a) * ry * d}" r="${r}" fill="${c}"/>`; }).join("");
  switch (kind) {
    case "stalk": return `<path d="M${x} ${y} V${y - h}" stroke="${leaf}" stroke-width="2.4"/>${[0.3, 0.5, 0.7].map((f, k) =>
        `<path d="M${x} ${y - h * f} q${k % 2 ? -w / 2 : w / 2} ${-h * 0.08} ${k % 2 ? -w * 0.7 : w * 0.7} ${h * 0.05}" stroke="${leaf2}" stroke-width="2.2" fill="none"/>`).join("")}
      ${show ? (p.id === "sweetcorn" ? `<ellipse cx="${x + 3}" cy="${y - h * 0.55}" rx="3" ry="${h * 0.08}" fill="${col}"/><path d="M${x} ${y - h} l-4 -8 M${x} ${y - h} l4 -8" stroke="#c9a94a" stroke-width="1.5"/>`
        : `<circle cx="${x}" cy="${y - h}" r="${Math.max(4, w * 0.35)}" fill="${col}"/><circle cx="${x}" cy="${y - h}" r="${Math.max(2, w * 0.13)}" fill="#6b4a1e"/>`) : ""}`;
    case "spike": return [-0.25, 0, 0.25].map((o, k) => { const xx = x + o * w, hh = h * (k === 1 ? 1 : 0.85);
      return `<path d="M${xx} ${y} V${y - hh}" stroke="${leaf}" stroke-width="1.6"/><ellipse cx="${xx}" cy="${y - hh * 0.8}" rx="${Math.max(2, w * 0.09)}" ry="${hh * 0.22}" fill="${show ? col : leaf2}"/>`; }).join("")
      + `<ellipse cx="${x}" cy="${y - h * 0.08}" rx="${w * 0.45}" ry="${h * 0.1}" fill="${leaf}"/>`;
    case "daisy": return [-0.3, -0.1, 0.12, 0.32].map((o, k) => { const xx = x + o * w, hh = h * [0.8, 1, 0.9, 0.75][k];
      return `<path d="M${x} ${y} Q${xx} ${y - hh * 0.5} ${xx} ${y - hh}" stroke="${leaf}" stroke-width="1.3" fill="none"/>${show ? `<circle cx="${xx}" cy="${y - hh}" r="${Math.max(3, w * 0.12)}" fill="${col}"/><circle cx="${xx}" cy="${y - hh}" r="${Math.max(1.2, w * 0.045)}" fill="#7a4a1a"/>` : `<circle cx="${xx}" cy="${y - hh}" r="1.8" fill="${leaf2}"/>`}`; }).join("")
      + `<ellipse cx="${x}" cy="${y - h * 0.06}" rx="${w * 0.35}" ry="${h * 0.08}" fill="${leaf}"/>`;
    case "shrub": return `<circle cx="${x - w * 0.22}" cy="${y - h * 0.4}" r="${h * 0.4}" fill="${leaf}"/><circle cx="${x + w * 0.22}" cy="${y - h * 0.42}" r="${h * 0.38}" fill="${leaf}"/>
      <circle cx="${x}" cy="${y - h * 0.6}" r="${h * 0.4}" fill="${leaf2}"/>${show ? dots(12, x, y - h * 0.55, w * 0.45, h * 0.35, Math.max(2, h * 0.07), col) : ""}`;
    case "climber": return `<path d="M${x - w * 0.4} ${y} L${x} ${y - h} L${x + w * 0.4} ${y}" stroke="#b08a5a" stroke-width="1.6" fill="none"/>
      ${[0.2, 0.4, 0.6, 0.8].map((f) => `<ellipse cx="${x - w * 0.4 * (1 - f)}" cy="${y - h * f}" rx="${w * 0.18}" ry="${h * 0.07}" fill="${leaf}"/><ellipse cx="${x + w * 0.4 * (1 - f)}" cy="${y - h * f + 3}" rx="${w * 0.18}" ry="${h * 0.07}" fill="${leaf2}"/>`).join("")}
      ${show ? dots(8, x, y - h * 0.55, w * 0.3, h * 0.35, Math.max(1.8, w * 0.06), col) : ""}`;
    case "sprawl": return `${[-0.35, 0, 0.35].map((o, k) => `<ellipse cx="${x + o * w}" cy="${y - h * 0.45}" rx="${w * 0.28}" ry="${h * 0.5}" fill="${k === 1 ? leaf2 : leaf}"/>`).join("")}
      ${show ? `<ellipse cx="${x + w * 0.15}" cy="${y - h * 0.15}" rx="${w * 0.14}" ry="${Math.max(3, h * 0.2)}" fill="${col}"/>` : ""}`;
    case "bush": return `<path d="M${x} ${y} V${y - h}" stroke="#a88a5a" stroke-width="1.4"/><ellipse cx="${x}" cy="${y - h * 0.55}" rx="${w * 0.45}" ry="${h * 0.45}" fill="${leaf}"/>
      ${show ? dots(6, x, y - h * 0.5, w * 0.35, h * 0.3, Math.max(2.2, w * 0.08), col) : ""}`;
    case "strap": return [-0.3, -0.1, 0.1, 0.3].map((o) => `<path d="M${x} ${y} Q${x + o * w} ${y - h * 0.6} ${x + o * w * 1.6} ${y - h}" stroke="${leaf2}" stroke-width="2" fill="none"/>`).join("")
      + (show ? `<circle cx="${x}" cy="${y - h}" r="${Math.max(3, w * 0.15)}" fill="${col}"/>` : "");
    case "feather": return Array.from({ length: 7 }, (_, k) => { const o = (k - 3) / 3;
      return `<path d="M${x} ${y} L${x + o * w * 0.45} ${y - h * (0.7 + 0.3 * (1 - Math.abs(o)))}" stroke="${leaf2}" stroke-width="1.2"/>`; }).join("")
      + (show ? `<ellipse cx="${x}" cy="${y - h}" rx="${w * 0.3}" ry="3" fill="${col}"/>` : "");
    case "leafy": return [-0.3, 0, 0.3].map((o, k) => `<path d="M${x} ${y} L${x + o * w * 0.6} ${y - h * 0.5}" stroke="${col || leaf}" stroke-width="1.6"/>
      <ellipse cx="${x + o * w * 0.6}" cy="${y - h * (k === 1 ? 0.7 : 0.6)}" rx="${w * 0.2}" ry="${h * 0.3}" fill="${k === 1 ? leaf2 : leaf}"/>`).join("");
    case "bulb": return [-0.2, 0, 0.2].map((o) => `<path d="M${x} ${y} L${x + o * w} ${y - h * 0.6}" stroke="${leaf2}" stroke-width="2.4"/>`).join("")
      + `<path d="M${x} ${y} V${y - h}" stroke="${leaf}" stroke-width="1.4"/>${show ? `<path d="M${x - 4} ${y - h - 2} q4 10 8 0 q-4 -6 -8 0z" fill="${col}"/>` : ""}`;
    case "ball": return [-0.2, 0.2].map((o) => `<path d="M${x} ${y} L${x + o * w} ${y - h * 0.3}" stroke="${leaf2}" stroke-width="2.4"/>`).join("")
      + `<path d="M${x} ${y} V${y - h}" stroke="${leaf}" stroke-width="1.4"/>${show ? `<circle cx="${x}" cy="${y - h}" r="${Math.max(5, w * 0.3)}" fill="${col}"/>` : ""}`;
    case "fern": return [-0.4, -0.15, 0.15, 0.4].map((o) => `<path d="M${x} ${y} Q${x + o * w * 0.6} ${y - h} ${x + o * w * 1.3} ${y - h * 0.55}" stroke="${leaf}" stroke-width="2.6" fill="none" stroke-dasharray="3 1.5"/>`).join("");
    default: { const bh = h * 0.9; return `<ellipse cx="${x}" cy="${y - bh * 0.5}" rx="${w * 0.48}" ry="${bh * 0.5}" fill="${leaf}"/>${show ? dots(9, x, y - bh * 0.55, w * 0.38, bh * 0.35, Math.max(2, w * 0.07), col) : ""}`; }
  }
}
// rows: [{ items: [{ p, count }] }] from the back to the front
const SCENES = {};
function sceneSvg(rows, m) {
  const W = 360, H = 200, ground = 178, all = rows.flatMap((r) => r.items.map((it) => it.p));
  const maxH = Math.max(120, ...all.map((p) => p.height_cm)), scale = 128 / maxH;
  const n = rows.length, out = [];
  rows.forEach((row, k) => {
    const depth = n - 1 - k, y = ground - depth * 12, shrink = 1 - depth * 0.06;
    // as many across as fit for the size of plant; each row sits staggered from the one behind, so nothing hides
    const pool = row.items.flatMap((it) => Array(Math.max(1, Math.min(it.count, 12))).fill(it.p));
    const wide = Math.max(...row.items.map((it) => Math.min(44, Math.max(14, (it.p.sp_cm || 30) * 0.5 * shrink))));
    const slots = Math.max(3, Math.min(14, Math.floor((W - 40) / (wide * 0.95)))), list = Array.from({ length: slots }, (_, i) => pool[Math.floor((i / slots) * pool.length)]);
    list.forEach((p, i) => {
      const state = lifeState(p, m);
      if (state === "none") return;
      const h = Math.max(16, p.height_cm * scale * shrink * (state === "show" ? 1 : 0.7)), w = Math.min(44, Math.max(14, (p.sp_cm || 30) * 0.5 * shrink));
      const step = (W - 40) / slots, x = 26 + (i + 0.5) * step + (depth % 2 ? step / 2 : 0) * (k ? 1 : -0.5) + ((i * 37) % 5) - 2;
      out.push(`<g opacity="${1 - depth * 0.12}">${plantShape(p, x, y, h, w, state)}</g>`);
    });
  });
  const ruler = [100, 200].filter((c) => c * scale < 150).map((c) => `<line x1="8" x2="14" y1="${ground - c * scale}" y2="${ground - c * scale}" class="sv-rule"/><text x="16" y="${ground - c * scale + 3}" class="sv-rule-t">${c / 100}m</text>`).join("");
  return `<svg class="sideview" viewBox="0 0 ${W} ${H}" role="img" aria-label="What it looks like in ${MONTHS_LONG[m - 1]}">
    <rect x="0" y="0" width="${W}" height="${H}" class="sv-sky"/><rect x="0" y="${ground - (n - 1) * 12 - 4}" width="${W}" height="${H}" class="sv-soil"/>
    <line x1="11" x2="11" y1="${ground}" y2="${ground - Math.min(150, 200 * scale)}" class="sv-rule"/>${ruler}${out.join("")}</svg>`;
}
// the best month to show first: when most of it is at its best
function bestMonth(rows) {
  const ps = rows.flatMap((r) => r.items.map((it) => it.p));
  let best = 7, top = -1;
  for (let m = 1; m <= 12; m++) { const v = ps.filter((p) => lifeState(p, m) === "show").length * 2 + ps.filter((p) => lifeState(p, m) === "growing").length; if (v > top) { top = v; best = m; } }
  return best;
}
function sceneBox(key, rows, m = bestMonth(rows)) {
  SCENES[key] = rows;
  return `<div class="scene-box"><div data-scene-pic="${key}">${sceneSvg(rows, m)}</div>
    <div class="scene-ctl"><input type="range" min="1" max="12" value="${m}" data-scene="${key}" aria-label="Month"><span class="small" data-scene-label="${key}">${MONTHS_LONG[m - 1]}</span></div></div>`;
}
document.addEventListener("input", (e) => {
  const r = e.target.closest("[data-scene]");
  if (!r) return;
  const k = r.dataset.scene, m = Number(r.value);
  document.querySelectorAll(`[data-scene-pic="${k}"]`).forEach((el) => (el.innerHTML = sceneSvg(SCENES[k], m)));
  document.querySelectorAll(`[data-scene-label="${k}"]`).forEach((el) => (el.textContent = MONTHS_LONG[m - 1]));
});
// rows from plants by height: tall at the back, medium, short at the front
function rowsByHeight(items) {
  const tier = (p) => (p.height_cm >= 80 ? 0 : p.height_cm >= 35 ? 1 : 2);
  return [0, 1, 2].map((t) => ({ items: items.filter((it) => tier(it.p) === t) })).filter((r) => r.items.length);
}

// ---- a bed's planting plan: where each thing goes, how it's started, and roughly what it costs ----------------
// Tallest at the back (the north side, so they don't shade the rest) - or in the middle of a round bed you walk
// round. Companion plants are dotted round the edges. Each strip's size is the room its plants need.
function bedLayout(s) {
  const here = activeCrops().filter((c) => c.space_id === s.id), sz = spaceSize(s), t = shapeType(s);
  const island = ["circle", "free", "pot"].includes(t);
  const used = (c) => c.area || plant(c.plant_id).area_each * c.qty;
  const edge = here.filter((c) => plant(c.plant_id).group === "companion");
  const byPlant = {};
  here.filter((c) => !edge.includes(c)).forEach((c) => { const k = sharesPatch(c) ? "g" + c.mixgrp : c.plant_id; (byPlant[k] = byPlant[k] || []).push(c); });
  const groups = Object.values(byPlant).map((cs) => {
    const tallest = cs.map((c) => plant(c.plant_id)).sort((a, b) => b.height_cm - a.height_cm)[0];
    const shared = sharesPatch(cs[0]);
    return { crops: cs, p: tallest, mix: shared ? mixOf(cs[0]) : null, plants: [...new Set(cs.map((c) => c.plant_id))],
      emojis: cs.map((c) => plant(c.plant_id).emoji), need: shared ? Math.max(...cs.map(used)) : cs.reduce((m, c) => m + used(c), 0) };
  });
  const area = (s.usage && s.usage.area) || sz.w * sz.h, need = groups.reduce((n, g) => n + g.need, 0);
  const squeeze = need > area ? area / need : 1;
  // tall (80cm+), medium and short: one band each, with the plants of that height side by side in it
  const tierOf = (p) => (p.height_cm >= 80 ? 0 : p.height_cm >= 35 ? 1 : 2);
  let at = 0, n = 0;
  const tiers = [0, 1, 2].map((k) => groups.filter((g) => tierOf(g.p) === k).sort((x, y) => y.p.height_cm - x.p.height_cm)).filter((g) => g.length).map((gs) => {
    const tierNeed = gs.reduce((m, g) => m + g.need, 0), tier = { from: at, to: Math.min(1, at + (tierNeed * squeeze) / area), parts: [] };
    let x = 0;
    gs.forEach((g) => { const share = g.need / tierNeed; tier.parts.push({ ...g, x0: x, x1: x + share, n: ++n }); x += share; });
    at = tier.to; return tier;
  });
  return { s, w: sz.w, h: sz.h, t, island, tiers, edge, spare: Math.max(0, 1 - at), over: need > area * 1.02 };
}
function zoneWords(L, tier, part) {
  const k = L.tiers.indexOf(tier), first = k === 0, last = k === L.tiers.length - 1, only = first && last;
  const where = only ? (L.island ? "All over the bed" : "Across the whole bed")
    : L.island ? (first ? "In the middle" : last ? "Round the outside" : "In a ring round the middle")
    : L.t === "corner" ? (first ? "Tucked into the corner" : last ? "Along the open edge" : "Fanning out from the corner")
    : first ? (L.t === "triangle" ? "At the pointy end (north)" : "At the back (north side)") : last ? "At the front" : "In the middle strip";
  const np = tier.parts.length, i = tier.parts.indexOf(part);
  const side = np === 1 ? "" : L.island ? ` - a section ${i + 1} of ${np} going round` : np <= 3 ? `, ${(np === 2 ? ["left", "right"] : ["left", "middle", "right"])[i]} side` : `, section ${i + 1} of ${np} counting from the left`;
  if (L.island) return `${where}${side}, ${part.p.sp_cm}cm apart`;
  const depth = (tier.to - tier.from) * L.h, rows = Math.max(1, Math.floor((depth * 100) / part.p.row_cm));
  return `${where}${side}: ${rows} row${rows > 1 ? "s" : ""} in a strip about ${Math.round(depth * 100)}cm deep, ${part.p.sp_cm}cm between plants`;
}
function bedPlanSvg(L) {
  const { s, w, h } = L, fs = Math.min(w, h) * 0.11, pad = Math.max(w, h) * 0.05, clip = `bp${s.id}`;
  const tone = (k) => ["#7da35a", "#a5c47c", "#8db46a", "#bcd593", "#6f9550", "#98bb71"][k % 6];
  let bands = "", marks = "", nums = "";
  const mark = (x, y, e, size = fs) => { marks += `<text x="${x}" y="${y + size * 0.35}" font-size="${size}" text-anchor="middle">${e}</text>`; };
  const num = (x, y, n) => { nums += `<g class="bp-n"><circle cx="${x}" cy="${y}" r="${fs * 0.42}"/><text x="${x}" y="${y + fs * 0.17}" font-size="${fs * 0.5}" text-anchor="middle">${n}</text></g>`; };
  const P = outlinePts(s, w, h), cx = P.reduce((a, q) => a + q[0], 0) / P.length, cy = P.reduce((a, q) => a + q[1], 0) / P.length;
  const count = (part) => part.crops.reduce((m, c) => m + c.qty, 0);
  const at = (f, r) => { const q = P[Math.min(P.length - 1, Math.floor(f * P.length))]; return [cx + (q[0] - cx) * r, cy + (q[1] - cy) * r]; };  // round the shape
  L.tiers.forEach((tier) => tier.parts.forEach((part) => {
    const a = tier.from, b = tier.to, mid = (a + b) / 2, k = part.n - 1;
    if (L.island) {
      const r0 = Math.sqrt(a), r1 = Math.sqrt(b), steps = Math.max(2, Math.ceil((part.x1 - part.x0) * 32));
      const outer = Array.from({ length: steps + 1 }, (_, i) => at(part.x0 + ((part.x1 - part.x0) * i) / steps, r1));
      const inner = Array.from({ length: steps + 1 }, (_, i) => at(part.x1 - ((part.x1 - part.x0) * i) / steps, r0));
      bands += `<polygon points="${[...outer, ...inner].map((q) => q.join(",")).join(" ")}" fill="${tone(k)}"/>`;
      const r = a === 0 && tier.parts.length === 1 ? 0 : (r0 + r1) / 2, m = r === 0 ? 1 : Math.max(1, Math.min(count(part), Math.round((part.x1 - part.x0) * 12)));
      for (let i = 0; i < m; i++) { const q = at(part.x0 + ((part.x1 - part.x0) * (i + 0.5)) / m, r || 0.001); mark(q[0], q[1], part.emojis[i % part.emojis.length]); }
      const q = at((part.x0 + part.x1) / 2, r ? r : 0.001); num(q[0] - (r ? 0 : fs), q[1] - fs * 0.9, part.n);
      return;
    }
    if (L.t === "corner") {
      const pt2 = (c, f) => [c * w * (1 - f), c * h * f];
      bands += `<polygon points="${[pt2(b, part.x0), pt2(b, part.x1), pt2(a, part.x1), pt2(a, part.x0)].map((q) => q.join(",")).join(" ")}" fill="${tone(k)}"/>`;
      const m = Math.max(1, Math.min(count(part), Math.round(((part.x1 - part.x0) * mid * Math.hypot(w, h)) / (fs * 1.3))));
      for (let i = 0; i < m; i++) { const q = pt2(mid, part.x0 + ((part.x1 - part.x0) * (i + 0.5)) / m); mark(q[0], q[1], part.emojis[i % part.emojis.length]); }
      const q = pt2(mid, (part.x0 + part.x1) / 2); num(q[0] - fs * 0.6, q[1] - fs * 0.6, part.n);
      return;
    }
    bands += `<rect x="${part.x0 * w}" y="${a * h}" width="${(part.x1 - part.x0) * w}" height="${(b - a) * h}" fill="${tone(k)}"/>`;
    // one line of plants for each row that fits in the strip
    const rowsN = Math.max(1, Math.min(Math.floor(((b - a) * h * 100) / part.p.row_cm), Math.floor(((b - a) * h) / (fs * 1.25))));
    for (let r = 0; r < rowsN; r++) {
      const yy = (a + ((b - a) * (r + 0.5)) / rowsN) * h, half = L.t === "triangle" ? (yy / h) * (w / 2) : w / 2;
      const x0 = Math.max(part.x0 * w, w / 2 - half), x1 = Math.min(part.x1 * w, w / 2 + half), span = Math.max(0, x1 - x0);
      const m = Math.max(1, Math.min(Math.ceil(count(part) / rowsN), Math.round(span / (fs * 1.3))));
      for (let i = 0; i < m; i++) mark(x0 + (span * (i + 0.5)) / m, yy, part.emojis[(i + r) % part.emojis.length]);
    }
    const yy = mid * h, half = L.t === "triangle" ? (yy / h) * (w / 2) : w / 2;
    num(Math.min(part.x1 * w, w / 2 + half) - fs * 0.45, L.t === "triangle" ? yy : a * h + fs * 0.45, part.n);
  }));
  // companions dotted round the edge
  const dots = L.edge.flatMap((c) => Array(Math.min(c.qty, 6)).fill(plant(c.plant_id).emoji));
  dots.forEach((e, i) => { const q = at((i + 0.5) / dots.length, 0.9); mark(q[0], q[1], e, fs * 0.8); });
  const labels = L.island ? "" : `<text x="${L.t === "corner" ? 0 : w / 2}" y="${-fs * 0.35}" font-size="${fs * 0.5}" text-anchor="${L.t === "corner" ? "start" : "middle"}" class="fd-lab">${L.t === "corner" ? "↖ the corner" : "back - north side ↑"}</text>
    <text x="${w / 2}" y="${h + fs * 0.8}" font-size="${fs * 0.5}" text-anchor="middle" class="fd-lab">front</text>`;
  return `<svg class="fdiagram" viewBox="${-pad} ${-pad - fs * 0.8} ${w + 2 * pad} ${h + 2 * pad + fs * 1.6}" role="img" aria-label="Where to plant each thing in ${esc(s.name)}">
    <defs><clipPath id="${clip}">${shapeSvg(s, 0, 0, w, h, "")}</clipPath></defs>${shapeSvg(s, 0, 0, w, h, 'class="fd-bed"')}
    <g clip-path="url(#${clip})">${bands}${marks}</g>${nums}${labels}</svg>`;
}
// "What it'll look like" for a bed: what's planned in it, from the front, to scale, through the year
function bedScene(s) {
  const L = bedLayout(s);
  if (!L.tiers.length || s.kind === "pot") return "";
  const rows = [...L.tiers.map((t) => ({ items: t.parts.flatMap((pt) => pt.plants.map((pid) => ({ p: plant(pid), count: pt.crops.filter((c) => c.plant_id === pid).reduce((n, c) => n + c.qty, 0) }))) })),
    ...(L.edge.length ? [{ items: L.edge.map((c) => ({ p: plant(c.plant_id), count: c.qty })) }] : [])];
  return `<div class="card"><h3>What it'll look like</h3><p class="small muted" style="margin:-4px 0 8px">From the front, to scale. Slide through the year.</p>${sceneBox("bed" + s.id, rows)}</div>`;
}

function openBedPlan(id) {
  S.sheet = () => { if (space(id)) drawBedPlan(id); else closeSheet(); };
  drawBedPlan(id);
}
function drawBedPlan(id) {
  const s = space(id), L = bedLayout(s), cost = s.cost;
  const parts = L.tiers.flatMap((tier) => tier.parts.map((part) => ({ tier, part })));
  const zoneOf = (pid) => parts.find((x) => x.part.plants.includes(pid));
  const order = (it) => (zoneOf(it.plant_id) ? zoneOf(it.plant_id).part.n : 99);
  const row = (it) => {
    const p = plant(it.plant_id), z = zoneOf(it.plant_id), crops = activeCrops().filter((c) => c.space_id === id && c.plant_id === it.plant_id && c.method === it.method);
    const started = crops.some((c) => c.sown_on || c.planted_on), vs = [...new Set(crops.map((c) => c.variety).filter(Boolean))];
    return `<div class="bp-row"><span class="bp-num">${z ? z.part.n : "•"}</span><span class="e">${p.emoji}</span><div style="flex:1;min-width:0">
      <b>${it.qty} × ${esc(p.name)}${vs.length ? ` <span class="vname">'${vs.map(esc).join("', '")}'</span>` : ""}</b>
      <div class="small">${z && z.part.mix ? `${z.part.mix.emoji} Part of ${esc(z.part.mix.name.toLowerCase())}, sown together - ` : ""}${z ? esc(zoneWords(L, z.tier, z.part)) : p.group === "companion" ? "Dotted round the edges and ends, between your veg" : ""}</div>
      ${started ? `<div class="small muted">${methodLabel(p, it.method)} - already started</div>`
        : `<div class="chips" style="margin-top:4px">${Object.keys(it.options).map((m) => `<button class="btn small ${m === it.method ? "primary" : "ghost"}" data-bpm="${it.plant_id}|${it.method}|${m}">${methodLabel(p, m)} · ${money(it.options[m])}</button>`).join("")}</div>`}
      <div class="small muted">🛒 ${esc(it.how)} = ${money(it.total)} · <b>${pence(it.per_plant)} a plant</b>${it.note ? ` (${esc(it.note)})` : ""}${it.bought ? " · ✅ bought" : ""}</div></div><b class="bp-cost">${money(it.total)}</b></div>`;
  };
  openSheet(`<h2>📐 ${esc(s.name)}: where to plant</h2>
    ${L.tiers.length || L.edge.length ? bedPlanSvg(L) : ""}
    ${bedScene(s)}
    ${L.over ? `<div class="checkbox warn small">⚠️ There's more planned than fits - it's squeezed up here. Take something out, plant fewer, or use a bigger bed.</div>` : ""}
    ${L.spare > 0.1 && !L.over ? `<p class="small muted">🟫 About ${Math.round(L.spare * 100)}% of the bed is still free${L.island ? " round the outside" : " at the front"} - room for more.</p>` : ""}
    <div class="card"><h3>🌱 What goes where</h3>${[...cost.items].sort((x, y) => order(x) - order(y)).map(row).join("") || `<p class="small muted">Nothing in this bed yet.</p>`}
      <div class="bp-total"><span><b>💷 About ${money(cost.total)}</b> to plant this bed${cost.to_buy < cost.total ? ` · <b>${money(cost.to_buy)}</b> still to buy` : ""}</span></div>
      <details class="small" style="margin-top:8px"><summary><b>How are prices worked out?</b></summary>
        <p style="margin:6px 0 0">We work out what you'd need to buy for that many plants - packets of seeds (with a few spare, as not every seed comes up), bags of sets or bulbs, or single plants - then multiply by a typical UK garden-shop price: about £2.50-£3.50 a seed packet, £4.50 a bulb of seed garlic, £2.50 for 250g of onion sets, £5.50 for 2kg of seed potatoes, £1.50-£3 for a baby veg plant, £5 for a bag of 10 flower bulbs, £7 for a perennial and £10-£15 for a shrub. Real prices vary by shop, variety and time of year.</p></details>
      <p class="small muted" style="margin:6px 0 0">Tap how you'll start each one to compare costs: seeds are cheapest, baby plants are quicker and easier. Prices are a rough guide (UK garden centres and online) - one packet of seeds often does more than one bed, and saved or swapped seeds are free!</p></div>
    <div class="row"><button class="btn small" data-flowers="${s.id}">🌸 Flower ideas</button><a class="btn small" href="#/plants" data-close>➕ Add plants</a></div>`);
  $("#sheet-card").querySelectorAll("[data-bpm]").forEach((b) => (b.onclick = async () => {
    const [pid, from, to] = b.dataset.bpm.split("|");
    if (from === to) return;
    const crops = activeCrops().filter((c) => c.space_id === id && c.plant_id === pid && c.method === from && !c.sown_on && !c.planted_on);
    for (const c of crops.slice(0, -1)) await api("PATCH", `/api/crops/${c.id}`, { plant_id: pid, method: to });
    if (crops.length) await change("PATCH", `/api/crops/${crops[crops.length - 1].id}`, { plant_id: pid, method: to }, `${plant(pid).emoji} ${methodLabel(plant(pid), to)} - dates updated 📅`);
  }));
}

// Your plants, all in one list - take out anything you've gone off (or picked at the start and changed your mind)
function openMyPlants() {
  S.sheet = () => drawMyPlants();
  drawMyPlants();
}
function drawMyPlants() {
  const crops = activeCrops();
  if (!crops.length) { openSheet(`<h2>Your plants</h2><p class="muted">Nothing planned yet.</p>`); return; }
  const where = [...S.g.spaces.map((sp) => ({ name: sp.name, crops: crops.filter((c) => c.space_id === sp.id) })), { name: "Not in a bed yet", crops: crops.filter((c) => !c.space_id), loose: true }]
    .filter((w) => w.crops.length);
  const line = (c) => { const p = plant(c.plant_id), row = rowLabel(c);
    return `<div class="myrow"><span class="e">${p.emoji}</span><span class="n">${esc(p.name)}${c.variety ? ` <span class="vname">'${esc(c.variety)}'</span>` : ""}${row ? ` <span class="chip grey">${row}</span>` : ""}</span>
      <button class="btn small ghost" data-open-crop="${c.id}">Open</button><button class="job-x static" data-dropcrop="${c.id}" aria-label="Remove ${esc(p.name.toLowerCase())}">✕</button></div>`; };
  const block = (cs) => { const out = [], seen = new Set();
    cs.forEach((c) => {
      if (c.mixgrp && seen.has(c.mixgrp)) return;
      if (c.mixgrp) { seen.add(c.mixgrp); const m = mixOf(c), g = cs.filter((x) => x.mixgrp === c.mixgrp);
        const beds = S.g.spaces.filter((sp) => g.some((x) => plant(x.plant_id).where.includes(sp.kind === "pot" ? "pot" : "bed")));
        out.push(`<div class="mixbox"><div class="mixhead"><b>${m ? m.emoji + " " + esc(m.name) : "Grown together"}</b><span class="small muted">one planting</span></div>
          ${!c.space_id && beds.length ? `<div class="row" style="margin-bottom:6px;flex-wrap:nowrap"><select data-groupbed="${c.id}" aria-label="Put this planting in a bed"><option value="">Put it in a bed…</option>${beds.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select></div>` : ""}
          ${g.map(line).join("")}</div>`); }
      else out.push(line(c));
    });
    return out.join(""); };
  openSheet(`<h2>Your plants</h2><p class="small muted" style="margin-top:-6px">Changed your mind? Tap ✕ to take a plant off your plan - its jobs go too. Plants grown together are removed as one.</p>
    ${where.map((w) => `<div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(w.name)}</h3>
      ${w.loose && w.crops.length > 1 ? `<button class="btn small danger" id="drop-loose">Remove all ${w.crops.length}</button>` : ""}</div>${block(w.crops)}</div>`).join("")}`);
  $("#sheet-card").onchange = (e) => {  // putting a whole planting in a bed: moving one moves them all
    const sel = e.target.closest("[data-groupbed]");
    if (sel && sel.value) { const c = crop(Number(sel.dataset.groupbed)); change("PATCH", `/api/crops/${c.id}`, { plant_id: c.plant_id, space_id: Number(sel.value) }, `Planted together in ${space(Number(sel.value)).name}`); }
  };
  const dl = $("#drop-loose");
  if (dl) dl.onclick = async () => {
    const loose = crops.filter((c) => !c.space_id);
    if (!confirm(`Remove all ${loose.length} plants that aren't in a bed? Their jobs go too.`)) return;
    for (const c of loose.slice(0, -1)) await api("DELETE", `/api/crops/${c.id}`);
    await change("DELETE", `/api/crops/${loose[loose.length - 1].id}`, null, `${loose.length} plants removed`);
  };
}

// A group of flowers that go together, from the Plants page: pick a bed and it's laid out for that bed
function openCombo(id) {
  const c = S.cat.combos.find((x) => x.id === id), beds = S.g.spaces;
  S.sheet = null;
  openSheet(`<h2>${c.emoji} ${esc(c.name)}</h2><p>${esc(c.why)}</p>
    <div class="nbs">${c.plants.map((id2) => { const q = plant(id2); return `<button class="nb" data-open-plant="${q.id}"><span class="e">${q.emoji}</span><span><b>${esc(q.name)}</b>
      <small>${q.height_cm >= 100 ? q.height_cm / 100 + "m" : q.height_cm + "cm"} tall · flowers ${MONTHS[q.months.harvest[0] - 1] || ""}-${MONTHS[q.months.harvest[q.months.harvest.length - 1] - 1] || ""}</small></span></button>`; }).join("")}</div>
    ${beds.length ? `<div class="card" style="margin-top:14px"><label class="field" for="combobed" style="margin-top:0">Which bed or pots?</label>
      <select id="combobed">${beds.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select>
      <p class="small muted" style="margin:8px 0 0">We'll work out how many of each fit and where they go - tall at the back - then you add them as one group.</p>
      <button class="btn primary wide" id="combogo" style="margin-top:12px">Lay it out in this bed</button></div>` : `<p class="small muted">Add a bed in My garden first.</p>`}`);
  const go2 = $("#combogo");
  if (go2) go2.onclick = () => openFlowerPlan(Number($("#combobed").value), null, id);
}

// ---- choosing a bed: what's in it, what's in the beds next to it, and which suits best -----------------
// Beds close enough to matter: within a path's width or so of this one, edge to edge, going by where they sit
// on the plan - whatever's in between (pests and roots don't care)
function bedsNextTo(spaceId) {
  const items = planItems().filter((i) => i.type === "space"), me = items.find((i) => i.id === spaceId);
  if (!me) return [];
  const a = box(me), reach = Math.max(1.2, (S.g.garden.path_w || 0.5) + 0.7);
  return items.filter((i) => i.id !== spaceId).map((i) => {
    const b = box(i), dx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1), dy = Math.max(0, b.y0 - a.y1, a.y0 - b.y1);
    return { i, gap: Math.hypot(dx, dy) };
  }).filter((n) => n.gap <= reach).sort((x, y) => x.gap - y.gap).map((n) => ({ ...n.i.s, gap: n.gap }));  // distance is what counts, not what's in between
}
const gapText = (g) => (g < 0.05 ? "touching" : g < 1 ? `${Math.round(g * 100)}cm away` : `${Math.round(g * 10) / 10}m away`);
// roughly when a new plant would be in the ground, and when an existing one is
function plannedSpan(p) {
  const w = p.next[p.methods[0]];
  if (!w) return null;
  const s0 = d(w[0]), s1 = new Date(s0);
  s1.setDate(s1.getDate() + (p.weeks + 10) * 7);
  return [s0, s1];
}
const cropSpan = (c) => (c.starts && c.finishes ? [d(c.starts), d(c.finishes)] : null);
const together = (a, b) => !a || !b || (a[0] < b[1] && b[0] < a[1]);  // not sure? assume they'd overlap
// How well a bed suits these plants: bad neighbours in it or next door (while both are growing), good ones,
// and whether there's room. Notes are written for people; score is for sorting.
function bedAdvice(plantIds, sp) {
  const ps = plantIds.map(plant), crops = activeCrops();
  const inBed = crops.filter((c) => c.space_id === sp.id && !plantIds.includes(c.plant_id));
  const next = bedsNextTo(sp.id).map((n) => ({ sp: n, gap: n.gap, crops: crops.filter((c) => c.space_id === n.id) })).filter((n) => n.crops.length);
  let score = 0;
  const bad = [], good = [], fine = [];
  const look = (c, where, weight) => ps.forEach((p) => {
    const q = plant(c.plant_id), b = p.bad_with.find((x) => x.plant_id === q.id), g = p.good_with.find((x) => x.plant_id === q.id);
    if (!b && !g) return;
    if (!together(plannedSpan(p), cropSpan(c))) { if (b) fine.push(`${q.emoji} ${q.name.toLowerCase()} ${where} will be out by ${fmt(c.finishes)} - fine`); return; }
    if (b) { score -= weight * 3; bad.push(`${q.emoji} ${q.name} ${where}: ${b.why}`); }
    else { score += weight; good.push(`${q.emoji} ${q.name} ${where}: ${g.why}`); }
  });
  inBed.forEach((c) => look(c, "in this bed", 3));
  next.forEach((n) => n.crops.forEach((c) => look(c, `nearby in ${n.sp.name} (${gapText(n.gap)})`, 1)));
  const misfits = ps.filter((p) => !p.where.includes(sp.kind === "pot" ? "pot" : "bed"));
  const wrongKind = misfits.length === ps.length;
  if (misfits.length && !wrongKind) { score -= 1; fine.push(`${misfits.map((p) => p.name).join(" and ")} would rather be in ${sp.kind === "pot" ? "a bed" : "a pot"}`); }
  const u = sp.usage, full = u && u.area ? u.peak / u.area : 0;
  if (wrongKind) score -= 50;
  if (full > 0.9) score -= 4; else if (!inBed.length) score += 2;
  return { sp, score, inBed, next, bad: [...new Set(bad)], good: [...new Set(good)], fine: [...new Set(fine)], wrongKind, full };
}
const emojiList = (cs) => [...new Set(cs.map((c) => plant(c.plant_id).emoji))].join("");
function adviceLines(a) {
  return `${a.inBed.length ? `<div class="small">In it: ${emojiList(a.inBed)}</div>` : `<div class="small muted">Empty</div>`}
    ${a.next.map((n) => `<div class="small muted">Nearby, ${esc(n.sp.name)} (${gapText(n.gap)}): ${emojiList(n.crops)}</div>`).join("")}
    ${a.wrongKind ? `<div class="small adv-bad">Not the right kind of space for these</div>` : ""}
    ${a.full > 0.9 ? `<div class="small adv-bad">Nearly full</div>` : ""}
    ${a.bad.map((t) => `<div class="small adv-bad">⚠️ ${esc(t)}</div>`).join("")}
    ${a.good.map((t) => `<div class="small adv-good">✓ ${esc(t)}</div>`).join("")}
    ${a.fine.map((t) => `<div class="small muted">${esc(t)}</div>`).join("")}`;
}
// A list of beds to choose from, the best suited first - tap one to choose it
function bedPicker(plantIds, chosen, inputId) {
  const list = S.g.spaces.map((sp) => bedAdvice(plantIds, sp)).filter((a) => !a.wrongKind).sort((x, y) => y.score - x.score);
  if (!list.length) return `<input type="hidden" id="${inputId}" value="">`;
  const pick = chosen && list.some((a) => a.sp.id === chosen) ? chosen : null;
  return `<input type="hidden" id="${inputId}" value="${pick || ""}">
    <div class="bedpick" data-for="${inputId}">${list.map((a, i) => `<button type="button" class="bedopt ${a.sp.id === pick ? "on" : ""}" data-pickbed="${a.sp.id}">
      <div class="row" style="justify-content:space-between;gap:6px"><b>${esc(a.sp.name)}</b>${i === 0 && a.score >= 0 ? `<span class="chip">Best choice</span>` : a.bad.length ? `<span class="chip l3">Bad neighbours</span>` : ""}</div>
      ${adviceLines(a)}</button>`).join("")}
      <button type="button" class="bedopt ${pick ? "" : "on"}" data-pickbed=""><b>Decide later</b><div class="small muted">Keep it in your plan without a bed for now</div></button>
      <button type="button" class="btn small ghost changebed" data-changebed>Change bed</button></div>`;
}
// tapping a bed in a picker: the list folds down to that bed (so what comes next is right there), "Change bed" opens it again
document.addEventListener("click", (e) => {
  const ch = e.target.closest("[data-changebed]");
  if (ch) { ch.closest(".bedpick").classList.remove("picked"); return; }
  const b = e.target.closest("[data-pickbed]");
  if (!b) return;
  const wrap = b.closest(".bedpick");
  wrap.querySelectorAll(".bedopt").forEach((x) => x.classList.toggle("on", x === b));
  $("#" + wrap.dataset.for).value = b.dataset.pickbed;
  wrap.classList.add("picked");
  setTimeout(() => wrap.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
});

// Veg grown together share one patch: as big as the roomiest plant's share (m2)
const patchOf = (items) => Math.max(...items.map((x) => plant(x.plant_id).area_each * x.qty));
const groupFoot = (cs) => { const items = cs.map((c) => ({ plant_id: c.plant_id, qty: c.qty }));
  return sharesPatch(cs[0]) ? patchOf(items) : items.reduce((n, x) => n + plant(x.plant_id).area_each * x.qty, 0); };
const m2 = (n) => `${Math.round(n * 100) / 100} m²`;
const FILLS = [[0.25, "¼"], [0.5, "½"], [0.75, "¾"], [1, "Whole bed"]];
const scaleItems = (items, factor) => items.map((x) => ({ ...x, qty: Math.max(1, Math.round(x.qty * factor)) }));

// Plantings sown together stay one planting: the crops in it, and its name
const isFlowerMix = (c) => !!(c && c.mix && c.mix.startsWith("flower:"));
const mixOf = (c) => (!c || !c.mix ? null : isFlowerMix(c) ? S.cat.combos.find((x) => "flower:" + x.id === c.mix) || null : S.cat.mixes.find((m) => m.id === c.mix) || null);
// veg sown together share one patch; flowers in a group grow side by side, each in their own spot
const sharesPatch = (c) => !!(c && c.mixgrp && !isFlowerMix(c));
const groupOf = (c) => (c && c.mixgrp ? activeCrops().filter((x) => x.mixgrp === c.mixgrp) : [c]);

// Sowing together: crops sharing a row, each picked before the next needs the room
const mixOrder = (m) => [...m.plants].sort((a, b) => a.ready - b.ready);
function mixButton(id, spaceId) {
  const m = S.cat.mixes.find((x) => x.id === id);
  return `<button class="nb" data-open-mix="${m.id}" ${spaceId ? `data-space="${spaceId}"` : ""}><span class="e">${m.emoji}</span><span><b>${esc(m.name)}</b>
    <small>${mixOrder(m).map((x) => plant(x.plant_id).emoji).join(" → ")} · one planting</small></span></button>`;
}
function mixStrip() {
  return `<div class="section-title"><h2>🤝 Sow together - save space</h2></div>
    <div class="strip">${S.cat.mixes.map((m) => `<button class="tile" data-open-mix="${m.id}"><span class="blob">${m.emoji}</span><span class="n">${esc(m.name)}</span>
      <span class="when">${mixOrder(m).map((x) => plant(x.plant_id).emoji).join(" → ")}</span></button>`).join("")}</div>`;
}
function openMix(id, spaceId) {
  const m = S.cat.mixes.find((x) => x.id === id), order = mixOrder(m), beds = S.g.spaces.filter((sp) => sp.kind !== "pot");
  S.sheet = null;
  openSheet(`<h2>${m.emoji} ${esc(m.name)}</h2><p>${esc(m.why)}</p>
    <div class="card" id="mixcard"><h3>🌱 Add it to my garden</h3>
      ${beds.length ? `<label class="field">Which bed?</label><p class="small muted" style="margin:-2px 0 8px">Best suited first - we check what's in each bed and in beds within about a metre of it.</p>${bedPicker(m.plants.map((x) => x.plant_id), spaceId, "mixbed")}` : ""}
      <div id="mixfill"></div>
      <p class="small muted" style="margin:8px 0 0" id="mixqty"></p>
      <button class="btn primary wide" id="mixgo" style="margin-top:12px">Add the mix 🤝</button></div>
    <div class="card"><h3>What it'll look like</h3>${sceneBox("mix" + m.id, rowsByHeight(m.plants.map((x) => ({ p: plant(x.plant_id), count: x.qty }))))}</div>
    <div class="card"><h3>⏱️ What happens when</h3>${order.map((x, i) => { const q = plant(x.plant_id);
      return `<div class="mix-step"><span class="e">${q.emoji}</span><div><b>${i + 1}. ${esc(q.name)}</b><div class="small">Comes up in ${esc(x.up)} · ready from about ${x.ready} weeks</div></div></div>`; }).join("")}</div>
    <div class="card"><h3>👣 How to do it</h3><ol class="steps">${m.steps.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
      ${m.tip ? `<div class="checkbox"><b>💡 ${esc(m.tip)}</b></div>` : ""}</div>
    <div class="card tint-sky"><h3>🌱 Is it a seedling or a weed?</h3>
      ${order.map((x) => { const q = plant(x.plant_id); return q.seedling ? `<p style="margin:0 0 8px"><b>${q.emoji} ${esc(q.name)}:</b> ${esc(q.seedling)}</p>` : ""; }).join("")}
      <ul class="small" style="margin:0;padding-left:18px">${S.cat.weed_tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>
`);
  // how much of the chosen bed it takes - and ¼ / ½ / whole bed, scaling every plant in it together
  let items = m.plants.map((x) => ({ plant_id: x.plant_id, qty: x.qty }));
  const drawFill = () => {
    const bed = $("#mixbed") && $("#mixbed").value ? space(Number($("#mixbed").value)) : null, foot = patchOf(items);
    const area = bed && bed.usage && bed.usage.unit !== "pots" ? bed.usage.area : 0, used = area ? bed.usage.peak : 0;
    $("#mixfill").innerHTML = !area ? `<p class="small" style="margin:10px 0 0">Takes about <b>${m2(foot)}</b>. Choose a bed to see how much of it that fills.</p>`
      : `<div class="adv-box" style="margin-top:10px"><div class="small">${esc(bed.name)} is <b>${m2(area)}</b>${bed.width_m && bed.length_m ? ` (${bed.width_m} × ${bed.length_m} m)` : ""}${used ? `, with ${m2(used)} already planned at its busiest` : ""}.</div>
        <div class="small">This planting takes about <b>${m2(foot)}</b> - <b>${Math.round((100 * foot) / area)}%</b> of the bed.</div>
        <div class="fillrow" style="margin-top:6px"><span class="small muted">Make it fill:</span>${FILLS.map(([f, l]) => `<button type="button" class="btn small" data-mixfill="${f * area}">${l}</button>`).join("")}
        ${used && area - used > 0.1 ? `<button type="button" class="btn small" data-mixfill="${area - used}">The free space</button>` : ""}</div></div>`;
    $("#mixqty").innerHTML = `Adds ${items.map((x) => `${x.qty} ${esc(plant(x.plant_id).name.toLowerCase())}`).join(", ")} as <b>one planting</b> - they share the space and stay together in the bed. Each still gets its own dates and jobs.`;
  };
  $("#mixcard").onclick = (e) => {
    if (e.target.closest("[data-pickbed]")) setTimeout(drawFill);  // the picker sets the bed first
    const f = e.target.closest("[data-mixfill]");
    if (f) { items = scaleItems(m.plants.map((x) => ({ plant_id: x.plant_id, qty: x.qty })), Number(f.dataset.mixfill) / patchOf(m.plants)); drawFill(); }
  };
  drawFill();
  $("#mixgo").onclick = async () => {
    const sel = $("#mixbed");
    const where = sel && sel.value ? Number(sel.value) : null;
    if (await change("POST", "/api/crops/bulk", { crops: items.map((x) => ({ plant_id: x.plant_id, quantity: x.qty })), space_id: where, mix: m.id },
      `${m.emoji} ${m.name} planted together - each has its own jobs 📅`)) { if (where) openSpace(where); else closeSheet(); }
  };
}

// "Grow these next to it": companion plants for a veg, with one-tap adding to the beds it's in
function companionPanel(p, spaceId) {
  const list = companionsFor(p), name = p.name.toLowerCase();
  const ids = new Set(activeCrops().filter((c) => c.plant_id === p.id && c.space_id).map((c) => c.space_id));
  if (spaceId) ids.add(spaceId);
  const beds = [...ids].map(space).filter(Boolean);
  const has = (b, q) => activeCrops().some((c) => c.space_id === b.id && c.plant_id === q.id);
  return `<div class="card tint-leaf"><h3>🐞 Companion plants</h3>
    <p class="small" style="margin:0 0 10px">Grow these in the same bed to help keep pests off your ${esc(name)}. They're listed separately in the bed, so your veg list stays tidy.</p>
    <div class="nbs">${list.map((x) => { const q = plant(x.plant_id); return `<div class="nb comp"><span class="e">${q.emoji}</span><span style="flex:1"><b>${esc(q.name)}</b><small>${esc(x.why)}</small>
      <span class="row" style="margin-top:6px;gap:6px">${beds.map((b) => has(b, q) ? `<span class="chip grey">✅ In ${esc(b.name)}</span>`
        : `<button class="btn small" data-addcomp="${q.id}" data-space="${b.id}">➕ Add to ${esc(b.name)}</button>`).join("")}
      <button class="btn small ghost" data-open-plant="${q.id}">More</button></span></span></div>`; }).join("")}</div>
    ${beds.length ? "" : `<p class="small muted" style="margin:10px 0 0">Once your ${esc(name)} are in a bed, you can add these next to them in one tap.</p>`}</div>`;
}

// The flower garden: flowers that go together, laid out to suit the bed's shape and sun
async function openFlowerPlan(id, sun, focus, fill = 1) {
  const s = space(id);
  sun = sun || s.sun || "sun";
  let plan;
  try { plan = await api("GET", `/api/spaces/${id}/flowers?sun=${sun}&fill=${fill}`); } catch (e) { toast(e.message); return; }
  const area = s.usage && s.usage.unit !== "pots" ? s.usage.area : 0, used = area ? s.usage.peak : 0, free = area ? Math.max(0, area - used) / area : 0;
  S.sheet = null;
  openSheet(`<h2>🌸 Flower ideas for ${esc(s.name)}</h2>
    <label class="field">How sunny is it?</label>
    <div class="chips">${Object.entries(S.cat.sun_spots).map(([k, v]) => `<button class="btn small ${k === sun ? "primary" : ""}" data-fsun="${k}">${v.emoji} ${esc(v.name)}</button>`).join("")}</div>
    <p class="small muted" style="margin:6px 0 10px">${esc(S.cat.sun_spots[sun].text)}</p>
    ${area ? `<div class="adv-box" style="margin-bottom:12px"><div class="small">${esc(s.name)} is <b>${m2(area)}</b>${s.width_m && s.length_m ? ` (${s.width_m} × ${s.length_m} m)` : ""}${used ? `, with ${m2(used)} already planned` : ""}. These ideas fill <b>${Math.round(fill * 100)}%</b> of it - about ${m2(area * fill)}.</div>
      <div class="fillrow" style="margin-top:6px"><span class="small muted">Fill:</span>${FILLS.map(([f, l]) => `<button type="button" class="btn small ${Math.abs(f - fill) < 0.01 ? "primary" : ""}" data-ffill="${f}">${l}</button>`).join("")}
      ${used && free > 0.05 ? `<button type="button" class="btn small ${Math.abs(free - fill) < 0.01 ? "primary" : ""}" data-ffill="${free.toFixed(3)}">The free space</button>` : ""}</div></div>` : ""}
    <div class="card tint-sky small" style="margin-bottom:12px">📐 ${esc(plan.tip)}</div>
    ${plan.combos.map((c) => `<div class="card combo"><h3>${c.emoji} ${esc(c.name)}</h3><p class="small" style="margin:0 0 8px">${esc(c.why)}</p>
      ${flowerDiagram(s, plan, c)}
      ${sceneBox("fl" + c.id, c.zones.map((z) => ({ items: z.plants.map((x) => ({ p: plant(x.plant_id), count: x.qty })) })))}
      ${c.zones.map((z) => `<div class="zone"><b class="small">${esc(z.label)}</b><div class="chips">${z.plants.map((x) => { const q = plant(x.plant_id);
        return `<button class="btn small ghost" data-open-plant="${q.id}" data-space="${s.id}" title="${esc(x.cost.text)}">${q.emoji} ${x.qty} × ${esc(q.name)}${x.sunny_end ? " ☀️" : ""} <span class="muted">· ${{ sow_out: "seeds", sow_in: "seeds indoors", plants: q.buy_word === "bulbs" ? "bulbs" : "plants" }[x.method]} ${money(x.cost.total)}</span></button>`; }).join("")}</div></div>`).join("")}
      <div class="row" style="margin-top:10px;justify-content:space-between"><b>💷 About ${money(c.cost)} for the lot</b><button class="btn primary small" data-addcombo="${c.id}">➕ Add these to ${esc(s.name)}</button></div></div>`).join("")
      || `<p class="muted">No ideas for this spot yet.</p>`}
    <p class="small muted">Numbers are worked out to fill the ${s.kind === "pot" ? "pot" : "bed"}${s.width_m || s.kind === "pot" ? "" : " (a standard 1.2 × 2.4 m bed - add its size for a better guess)"}. ☀️ = put it at the sunniest end.</p>`);
  const card = $("#sheet-card");
  card.querySelectorAll("[data-fsun]").forEach((b) => (b.onclick = async () => {
    if (b.dataset.fsun !== s.sun) await patchSpace(s, { sun: b.dataset.fsun });
    openFlowerPlan(id, b.dataset.fsun, focus, fill);
  }));
  if (focus) { const f = card.querySelector(`[data-addcombo="${focus}"]`); if (f) f.closest(".combo").scrollIntoView({ block: "start" }); }
  card.querySelectorAll("[data-ffill]").forEach((b) => (b.onclick = () => openFlowerPlan(id, sun, focus, Number(b.dataset.ffill))));
  card.querySelectorAll("[data-addcombo]").forEach((b) => (b.onclick = async () => {
    const c = plan.combos.find((x) => x.id === b.dataset.addcombo);
    const crops = c.zones.flatMap((z) => z.plants.map((x) => ({ plant_id: x.plant_id, quantity: x.qty })));
    if (await change("POST", "/api/crops/bulk", { crops, space_id: id, mix: "flower:" + c.id }, `${c.emoji} ${c.name} added to ${s.name} as one group 📅`)) openSpace(id);
  }));
}

// "What fits in your pots" - or, until we know the size, a quick way to tell us
function potCard(s) {
  if (!s.pot_size) return `<div class="card tint-sky"><h3>🪴 How big are your pots?</h3><p class="small" style="margin:0 0 8px">Tap the nearest size and we'll show what you can grow in them.</p>
    <div class="potsizes">${S.cat.pot_sizes.map((z) => `<button class="kind potsize" data-setpot="${z.key}" data-space="${s.id}"><span class="e">${potIcon(z)}</span><b>${esc(z.name)}</b><span class="small muted">${esc(z.label)} · ${z.litres}L</span></button>`).join("")}</div></div>`;
  const z = potSize(s.pot_size), n = s.pot_count || 1;
  const group = (g, title) => { const list = potFits(z.key, [g]); return list.length ? `<h4 class="small" style="margin:10px 0 4px">${title}</h4><div class="chips">${list.slice(0, 12).map((x) => fitChip(x, z.key, s.id)).join("")}</div>` : ""; };
  return `<div class="card tint-sky"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${potIcon(z, 28)} ${n} × ${esc(potName(z).toLowerCase())}</h3>
      <span class="small muted">${z.litres} litres each</span></div>
    <p class="small" style="margin:6px 0 0">What grows well in one - the number is how many fit in each pot. Tap one to add it. Ones you can start soon come first.</p>
    ${group("veg", "🥕 Fruit & veg")}${group("herb", "🌿 Herbs")}${group("flower", "🌸 Flowers")}${group("companion", "🐞 Companions")}</div>`;
}

// A little picture of the bed with the flowers laid out: bands from back to front, or rings round the middle
function flowerDiagram(s, plan, combo) {
  const sz = spaceSize(s), w = sz.w, h = sz.h, pad = Math.max(w, h) * 0.04, fs = Math.min(w, h) * 0.13;
  const clip = `fd${s.id}${combo.id}`, zs = combo.zones, n = zs.length, tones = ["fd-z0", "fd-z1", "fd-z2"];
  const round = ["pot", "circle", "free"].includes(plan.shape);
  const emojis = (z) => z.plants.map((x) => plant(x.plant_id).emoji);
  let bands = "", marks = "";
  const mark = (x, y, e) => { marks += `<text x="${x}" y="${y + fs * 0.35}" font-size="${fs}" text-anchor="middle">${e}</text>`; };
  if (round) {
    // rings: the outside zone is the whole shape, the inner ones smaller copies of it round the middle
    const P = outlinePts(s, w, h), cx = P.reduce((a, q) => a + q[0], 0) / P.length, cy = P.reduce((a, q) => a + q[1], 0) / P.length;
    const scale = n === 1 ? [1] : n === 2 ? [0.55, 1] : [0.4, 0.72, 1];
    for (let k = n - 1; k >= 0; k--) bands += `<polygon points="${P.map(([x, y]) => `${cx + (x - cx) * scale[k]},${cy + (y - cy) * scale[k]}`).join(" ")}" class="${tones[k]}"/>`;
    zs.forEach((z, k) => {
      const em = emojis(z), r = n > 1 && k === 0 ? scale[0] * 0.5 : ((k ? scale[k - 1] : 0) + scale[k]) / 2, m = n > 1 && k === 0 ? em.length : Math.max(em.length * 3, 6);
      if (m === 1) { mark(cx, cy, em[0]); return; }
      for (let i = 0; i < m; i++) { const q = P[Math.floor((i / m) * P.length)]; mark(cx + (q[0] - cx) * r, cy + (q[1] - cy) * r, em[i % em.length]); }
    });
  } else {
    // bands from the back (top of the picture) to the front; a corner bed fans out from its corner
    const corner = plan.shape === "corner";
    zs.forEach((z, k) => {
      const a = k / n, b = (k + 1) / n, mid = (a + b) / 2, em = emojis(z);
      bands += corner ? `<polygon points="${a * w},0 ${b * w},0 0,${b * h} 0,${a * h}" class="${tones[k]}"/>`
        : `<rect x="0" y="${a * h}" width="${w}" height="${(b - a) * h}" class="${tones[k]}"/>`;
      const span = corner ? mid * Math.hypot(w, h) : plan.shape === "triangle" ? mid * w : w, m = Math.max(em.length, Math.round(span / (fs * 1.5)));
      for (let i = 0; i < m; i++) {
        const t = (i + 0.5) / m;
        if (corner) mark(mid * w * (1 - t), mid * h * t, em[i % em.length]);
        else if (plan.shape === "triangle") { const y = mid * h, half = (y / h) * (w / 2); mark(w / 2 - half + t * 2 * half, y, em[i % em.length]); }
        else mark(t * w, mid * h, em[i % em.length]);
      }
    });
  }
  return `<svg class="fdiagram" viewBox="${-pad} ${-pad - fs * 0.8} ${w + 2 * pad} ${h + 2 * pad + fs * 1.6}" role="img" aria-label="Where each flower goes">
    <defs><clipPath id="${clip}">${shapeSvg(s, 0, 0, w, h, "")}</clipPath></defs>${shapeSvg(s, 0, 0, w, h, 'class="fd-bed"')}
    <g clip-path="url(#${clip})">${bands}${marks}</g>
    ${round ? "" : `<text x="${plan.shape === "corner" ? 0 : w / 2}" y="${-fs * 0.3}" font-size="${fs * 0.55}" text-anchor="${plan.shape === "corner" ? "start" : "middle"}" class="fd-lab">${plan.shape === "corner" ? "↖ the corner (back)" : "back ↑"}</text>
    <text x="${w / 2}" y="${h + fs * 0.75}" font-size="${fs * 0.55}" text-anchor="middle" class="fd-lab">front - where you stand</text>`}</svg>`;
}

// Tabs inside a pop-up: show one panel at a time, so there's less to scroll through
let paneMemory = {};
function wirePanes(key) {
  const card = $("#sheet-card");
  const show = (name) => {
    card.querySelectorAll("[data-pane]").forEach((b) => b.classList.toggle("on", b.dataset.pane === name));
    card.querySelectorAll("[data-panel]").forEach((el) => (el.hidden = el.dataset.panel !== name));
    if (key) paneMemory[key] = name;
  };
  card.querySelectorAll("[data-pane]").forEach((b) => (b.onclick = () => show(b.dataset.pane)));
  if (key && paneMemory[key]) show(paneMemory[key]);
}

function dict(a, b) { return Object.assign({}, a, b); }

// The live "will it fit?" box under the Add form
function checkHtml(p, r) {
  const icon = { sow_in: "🏠", sow_out: "🌱", plant_out: "🌿", harvest: "🧺" };
  const word = { sow_in: "Sow indoors", sow_out: "Sow", plant_out: "Plant out", harvest: "Pick" };
  const plan = (r.plan || []).map((j) => `${icon[j.kind]} ${word[j.kind]} ${fmt(j.start)}`).join(" → ");
  const lines = [plan ? `<span class="plan">${plan}</span>` : "", `🧺 You'll get <b>${esc(r.harvest || "a good crop")}</b>`,
    r.buy ? `🛒 <b>${esc(r.buy.text)}</b>${r.buy.seeds ? ` - enough to sow ${r.buy.seeds}` : ""}${r.buy.note ? ` <span class="muted">(${esc(r.buy.note)})</span>` : ""}` : "",
    r.cost ? `💷 About <b>${money(r.cost.total)}</b> - ${esc(r.cost.how)}. That's about <b>${pence(r.cost.per_plant)} a plant</b>.` : ""].filter(Boolean);
  let cls = "ok";
  if (r.space && r.space.unit === "pots") {
    const u = r.space, sp = space(Number(($("#sp") || {}).value)), per = sp && p.pot_fits ? p.pot_fits[sp.pot_size] : 0;
    if (!per) { cls = "warn"; lines.push(`⚠️ Too big for these pots - ${esc(p.pot_advice.toLowerCase())}.`); }
    else {
      lines.push(`🪴 ${per} fit in each pot, so that's about <b>${Math.ceil(Math.round((r.qty || 1) / per * 10) / 10)} pot${Math.ceil((r.qty || 1) / per) > 1 ? "s" : ""}</b>.`);
      if (u.fits) lines.push(`✅ Fits! At the busiest${u.on ? " (" + fmt(u.on) + ")" : ""}, ${Math.round(u.peak * 10) / 10} of your ${u.area} pots are used.`);
      else { cls = "warn"; lines.push(`⚠️ That needs ${Math.round(u.peak * 10) / 10} pots${u.on ? " around " + fmt(u.on) : ""} - you have ${u.area}. Plant fewer, or add more pots.`); }
    }
  } else if (r.space && r.space.area) {
    const u = r.space;
    const pct = Math.min(100, Math.round((100 * u.peak) / u.area));
    lines.push(`📏 Needs about <b>${r.area} m²</b>. ${esc(u.name)} is ${u.area} m².`);
    if (u.fits) lines.push(`✅ Fits! At its busiest${u.on ? " (" + fmt(u.on) + ")" : ""}, ${esc(u.name)} will be ${pct}% full.`);
    else {
      cls = "warn";
      const spare = Math.max(0, u.area - (u.peak - r.area));
      const could = Math.floor(spare / p.area_each);
      lines.push(`⚠️ Too many for ${esc(u.name)}: it would need ${u.peak} m² ${u.on ? "around " + fmt(u.on) : ""}. ${could > 0 ? `About <b>${could}</b> will fit - or put the rest in another bed.` : "Try another bed, or plant these after something else is picked."}`);
    }
  } else if (r.space) {
    lines.push(`🪴 ${esc(p.pot_advice)}.`);
  } else {
    lines.push(`📏 Needs about <b>${r.area} m²</b>.`);
  }
  if (r.already && r.already.length) {
    cls = "warn";
    lines.push(`${alreadyText(p, r.already)} Is this meant to be an extra batch? If not, choose something else for this bed.`);
  }
  if (r.bad && r.bad.length) { cls = "warn"; lines.push(...r.bad.map((x) => `🙅 You've got ${esc(plant(x.plant_id).name.toLowerCase())} in that bed - ${esc(x.why)}.`)); }
  if (r.good && r.good.length) lines.push(...r.good.map((x) => `🤝 Good next to your ${esc(plant(x.plant_id).name.toLowerCase())}: ${esc(x.why)}.`));
  return `<div class="checkbox ${cls}">${lines.map((l) => `<div>${l}</div>`).join("")}</div>`;
}

// ---- calendar --------------------------------------------------------------------------------------

let calMonth = null, calTab = "mine", allFilter = "all";
const CAL_COLOUR = { sow_in: "var(--sky)", sow_out: "var(--leaf)", plant_out: "var(--soil)", harvest: "var(--marigold)" };
function calTabs() {
  return `<div class="seg" role="tablist">
    <button role="tab" data-caltab="mine" class="${calTab === "mine" ? "on" : ""}">🪴 My calendar</button>
    <button role="tab" data-caltab="all" class="${calTab === "all" ? "on" : ""}">📖 All plants</button></div>`;
}
function wireCalTabs(extra) {
  view.onclick = (e) => {
    const tab = e.target.closest("[data-caltab]");
    if (tab) { calTab = tab.dataset.caltab; calendarPage(); return; }
    if (extra) extra(e);
  };
}

// Every plant in the app on one year chart - just for looking. Tap one to read about it and add it to a bed.
function allPlantsCalendar() {
  const nowM = today().getMonth();
  const have = new Set(activeCrops().map((c) => c.plant_id));
  const list = filteredPlants(allFilter, ["veg", "herb"]);
  const cell = (p, m) => {
    const kinds = ["sow_in", "sow_out", "plant_out", "harvest"].filter((k) => p.months[k].includes(m + 1));
    if (!kinds.length) return `<span class="cell ${m === nowM ? "nowcol" : ""}"></span>`;
    if (kinds.length === 1) return `<span class="cell ${kinds[0]}"></span>`;
    return `<span class="cell split" style="--c1:${CAL_COLOUR[kinds[0]]};--c2:${CAL_COLOUR[kinds[kinds.length - 1]]}"></span>`;
  };
  view.innerHTML = `<h1>📅 Growing calendar</h1>${calTabs()}
    <p class="muted">When to sow, plant and pick everything in the app, for ${esc(S.me.region.short)}. Just for looking - tap a plant you like to add it to one of your beds.</p>
    ${filterBar(allFilter)}
    <div class="card planner"><div class="months">
      <span></span>${MONTHS.map((mm, i) => `<span class="m ${i === nowM ? "now" : ""}"><span class="long">${mm}</span><span class="short">${mm[0]}</span></span>`).join("")}
      ${list.map((p) => `<span class="lab" data-open-plant="${p.id}" style="cursor:pointer">${p.emoji} ${esc(p.name)}${have.has(p.id) ? " 🌱" : ""}</span>${MONTHS.map((_, m) => cell(p, m)).join("")}`).join("")}</div>
      <div class="legend"><span><i style="background:var(--sky)"></i>Sow indoors</span><span><i style="background:var(--leaf)"></i>Sow outside</span><span><i style="background:var(--soil)"></i>Plant out</span><span><i style="background:var(--marigold)"></i>Pick</span><span>🌱 = in your garden</span></div></div>`;
  wireCalTabs((e) => { const f = e.target.closest("[data-filter]"); if (f) { allFilter = f.dataset.filter; calendarPage(); } });
}

function calendarPage() {
  if (calTab === "all") { allPlantsCalendar(); return; }
  const t = today();
  const months = Array.from({ length: 12 }, (_, i) => new Date(t.getFullYear(), t.getMonth() + i, 1));
  const colour = { sow_in: "var(--sky)", sow_out: "var(--leaf)", plant_out: "var(--soil)", harvest: "var(--marigold)" };
  const crops = activeCrops();
  const rowFor = (c) => {
    const p = plant(c.plant_id);
    const cells = months.map((m) => {
      const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
      // a done job shows on the day it was actually done, not across its whole window
      const span = (j) => {
        const actual = j.status === "done" && { sow: c.sown_on, plant: c.planted_on, harvest: c.harvested_on }[j.action];
        return actual ? [d(actual), d(actual)] : [d(j.start), d(j.end)];
      };
      const kinds = c.jobs.filter((j) => { const [a, b] = span(j); return colour[j.kind] && a <= mEnd && b >= m; }).map((j) => j.kind);
      const uniq = [...new Set(kinds)];
      if (!uniq.length) return `<span class="cell"></span>`;
      if (uniq.length === 1) return `<span class="cell ${uniq[0]}"></span>`;
      return `<span class="cell split" style="--c1:${colour[uniq[0]]};--c2:${colour[uniq[uniq.length - 1]]}"></span>`;
    }).join("");
    return `<span class="lab" data-open-crop="${c.id}" style="cursor:pointer">${p.emoji} ${esc(p.name)}</span>${cells}`;
  };
  calMonth = calMonth == null ? 0 : calMonth;
  const m = months[calMonth], mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
  const monthJobs = crops.flatMap((c) => c.jobs).filter((j) => j.kind !== "eat" && j.kind !== "buy" && d(j.start) <= mEnd && d(j.end) >= m && j.status !== "missed" && j.status !== "done")
    .sort((a, b) => a.start.localeCompare(b.start));
  const calUrl = location.origin + S.me.calendar_path;
  view.innerHTML = `<h1>📅 Growing calendar</h1>${calTabs()}
    <p class="muted">When to sow, plant and pick everything you're growing, for the next 12 months.</p>
    ${crops.length ? `<div class="card planner"><div class="months">
      <span></span>${months.map((mm, i) => `<span class="m ${i === 0 ? "now" : ""}"><span class="long">${MONTHS[mm.getMonth()]}</span><span class="short">${MONTHS[mm.getMonth()][0]}</span></span>`).join("")}
      ${crops.map(rowFor).join("")}</div>
      <div class="legend"><span><i style="background:var(--sky)"></i>Sow indoors</span><span><i style="background:var(--leaf)"></i>Sow outside</span><span><i style="background:var(--soil)"></i>Plant out</span><span><i style="background:var(--marigold)"></i>Pick</span></div></div>`
      : `<div class="card empty"><div class="big">📅</div>Add some plants and your calendar fills itself in.</div>`}
    <div class="section-title"><h2>Month by month</h2></div>
    <div class="filter">${months.map((mm, i) => `<button data-cal="${i}" class="${i === calMonth ? "on" : ""}">${MONTHS[mm.getMonth()]}${mm.getFullYear() !== t.getFullYear() ? " " + String(mm.getFullYear()).slice(2) : ""}</button>`).join("")}</div>
    <div class="card">${monthJobs.length ? monthJobs.map((j) => jobCard(j, { showSpace: true })).join("") : `<div class="empty">Nothing planned for ${MONTHS_LONG[m.getMonth()]} yet.</div>`}</div>
    <div class="card tint-sky"><h3>📲 Add to your phone's calendar</h3>
      <p class="small">Your jobs appear in Google or Apple Calendar and stay up to date.</p>
      <div class="row"><a class="btn small" href="${esc(calUrl.replace(/^https?:/, "webcal:"))}">🍏 Apple Calendar</a>
      <a class="btn small" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calUrl.replace(/^https?:/, "webcal:"))}" target="_blank" rel="noopener">📆 Google Calendar</a>
      <button class="btn small ghost" id="copycal">Copy link</button></div></div>`;
  wireCalTabs((e) => { const b = e.target.closest("[data-cal]"); if (b) { calMonth = Number(b.dataset.cal); calendarPage(); } });
  $("#copycal").onclick = () => navigator.clipboard.writeText(calUrl).then(() => toast("Link copied 📋"), () => toast(calUrl));
}

// ---- shopping --------------------------------------------------------------------------------------

function shopPage() {
  // in date order: when you need to buy it (then the last day it's still worth buying), split up by month
  const items = [...S.g.shopping].sort((a, b) => a.job.start.localeCompare(b.job.start) || a.job.end.localeCompare(b.job.end));
  const t = today(), months = [];
  items.forEach((x) => {
    const k = (x.job.start < S.g.today ? S.g.today : x.job.start).slice(0, 7), last = months[months.length - 1];  // anything due already goes under now
    if (last && last.k === k) last.items.push(x); else months.push({ k, items: [x] });
  });
  view.innerHTML = `<h1>🛒 Shopping list</h1><p class="muted">Seeds and plants for what you're growing, in date order. Tap a shop to buy it, then tick it off.</p>
    ${items.length ? months.map((g) => { const [y, mo] = g.k.split("-").map(Number);
      return `<div class="section-title"><h2>${g.k === S.g.today.slice(0, 7) ? "Now" : MONTHS_LONG[mo - 1] + (y !== t.getFullYear() ? " " + y : "")}</h2><span class="small muted">${g.items.length} to buy</span></div>
        <div class="card">${g.items.map((x) => jobCard(x.job)).join("")}</div>`; }).join("")
      : `<div class="card"><div class="empty"><div class="big">✅</div>You've got everything you need!</div></div>`}
    <div class="card tint-soil"><h3>📦 For a no-dig bed you'll also need</h3>
      <ul style="margin:0;padding-left:20px"><li>Plain brown cardboard (free - ask a shop for boxes!)</li><li>Peat-free compost: about 15 bags (50 litres each) for a 1.2m × 2.4m bed</li><li>A watering can with a sprinkler head (a "rose")</li><li>Plant labels and a pencil</li></ul></div>`;
}

// ---- me & badges -----------------------------------------------------------------------------------

function mePage() {
  const got = S.g.badges.filter((b) => b.earned_on).length;
  view.innerHTML = `<h1>🏅 ${esc(S.me.name)}'s badges</h1>
    <p class="muted">${got} of ${S.g.badges.length} earned. Keep growing!</p>
    <div class="badges">${S.g.badges.map((b) => `<div class="badge ${b.earned_on ? "got" : "locked"}"><span class="e">${b.emoji}</span><b>${esc(b.name)}</b><small>${esc(b.text)}</small></div>`).join("")}</div>
    <div class="section-title"><h2>⚙️ My account</h2></div>
    <div class="card"><h3>Appearance</h3>
      <div class="seg" role="radiogroup" aria-label="Light or dark">${[["", "Match my phone"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) =>
        `<button role="radio" aria-checked="${(document.documentElement.getAttribute("data-theme") || "") === k}" class="${(document.documentElement.getAttribute("data-theme") || "") === k ? "on" : ""}" data-theme-set="${k}">${l}</button>`).join("")}</div>
      <label class="check"><input type="checkbox" id="photos-pref" ${showPhotos ? "checked" : ""}> <span>Show photos of plants instead of icons</span></label></div>
    <div class="card tint-leaf" id="invite-card"><h3>💌 Invite a friend</h3>
      <p class="small" style="margin:0 0 10px">Know someone who'd love to grow their own? Send them a link - we'll keep count of who joins from your invites.</p>
      <div id="invite-tally" class="small muted" style="margin-bottom:10px">…</div>
      <button class="btn primary" id="invite">💌 Invite someone</button><div id="invite-out"></div></div>
    ${S.me.is_admin ? `<a class="card tint-plum row" href="#/admin" style="justify-content:space-between;text-decoration:none;color:inherit"><b>🛠️ Admin: accounts & password resets</b><span class="btn small">Open 👉</span></a>` : ""}
    <div class="card">
      <label class="field" for="nm">Name</label><input id="nm" type="text" maxlength="40" value="${esc(S.me.name)}">
      <label class="field" for="em">Email <span class="muted small">(you log in with this)</span></label><input id="em" type="email" value="${esc(S.me.email)}" autocomplete="email">
      <label class="field" for="pc">Postcode</label><input id="pc" type="text" value="${esc(S.me.outcode || "")}" placeholder="e.g. LS6">
      <p class="small muted" style="margin-top:6px">📍 ${esc(S.me.region.name)} - last frost usually ${esc(S.me.region.last_frost)}.</p>
      <button class="btn primary" id="save">Save</button>
    </div>
    <div class="card"><h3>🔑 Change password</h3>
      <label class="field" for="pw0">Current password</label><input id="pw0" type="password" autocomplete="current-password">
      <label class="field" for="pw1">New password <span class="muted small">(8 or more letters)</span></label><input id="pw1" type="password" autocomplete="new-password" minlength="8">
      <button class="btn" id="pwsave" style="margin-top:12px">Change password</button>
    </div>
    <div class="card"><h3>🔔 Reminders</h3>
      ${S.g.has_push ? `<p class="small">Reminders are on. We'll only send them between 8am and 8pm.</p>
        <div class="row"><button class="btn small" id="ptest">Send a test</button><button class="btn small ghost" id="poff">Turn off on this device</button></div>`
      : pushBanner() || `<p class="small muted">This browser can't do reminders. Try the app on your phone.</p>`}
    </div>
    ${S.installPrompt ? `<div class="card tint-leaf"><h3>📲 Install the app</h3><button class="btn primary" id="install">Add to my home screen</button></div>` : ""}
    <div class="row"><button class="btn" id="logout">Log out</button></div>
    <details class="card" style="margin-top:14px"><summary><b>🔄 Start my garden again</b></summary>
      <p class="small">Clears all your beds, plants, ticked jobs and garden badges so you can set up from scratch. Your account, password, reminders and invites stay.</p>
      <label class="field" for="rspw">Type your password to confirm</label><input id="rspw" type="password" autocomplete="current-password">
      <button class="btn danger" id="resetgarden" style="margin-top:12px">🔄 Clear my garden and start again</button></details>
    <details class="card"><summary><b>🗑️ Delete my account</b></summary>
      <p class="small">This deletes your account and your whole garden plan, for ever. It can't be undone.</p>
      <label class="field" for="delpw">Type your password to confirm</label><input id="delpw" type="password" autocomplete="current-password">
      <button class="btn danger" id="delete" style="margin-top:12px">Delete everything</button></details>`;
  wirePush();
  const tally = (t) => {
    $("#invite-tally").innerHTML = t.sent ? `You've sent <b>${t.sent}</b> invite${t.sent === 1 ? "" : "s"} · <b>${t.joined}</b> joined${t.joined ? " 🎉" : ""}`
      + (t.people.length ? `<div style="margin-top:4px">${t.people.map((x) => `🌱 ${esc(x.name)} <span class="muted">(${fmt(x.joined_on)})</span>`).join("<br>")}</div>` : "")
      : "You haven't invited anyone yet.";
  };
  api("GET", "/api/invites").then(tally, () => { $("#invite-tally").textContent = ""; });
  view.querySelectorAll("[data-theme-set]").forEach((b) => (b.onclick = () => { setTheme(b.dataset.themeSet); mePage(); }));
  $("#photos-pref").onchange = (e) => { showPhotos = e.target.checked; remember("gtg-photos", showPhotos); toast(showPhotos ? "Showing photos" : "Showing icons"); };
  $("#invite").onclick = async () => {
    try {
      const t = await api("POST", "/api/invites");
      tally(t);
      const text = `${S.me.name.split(" ")[0]} has invited you to Grow to Gobble - grow the food you love to eat, step by step 🌱`;
      if (navigator.share) {
        try { await navigator.share({ title: "Grow to Gobble", text, url: t.link }); return; } catch (e) { if (e.name === "AbortError") return; }
      }
      const msg = encodeURIComponent(text + " " + t.link);
      $("#invite-out").innerHTML = `<div class="checkbox"><b>Send them this link:</b>
        <input type="text" readonly value="${esc(t.link)}" onclick="this.select()">
        <div class="row"><button class="btn small" data-copy="${esc(t.link)}">📋 Copy</button>
        <a class="btn small" href="https://wa.me/?text=${msg}" target="_blank" rel="noopener">💬 WhatsApp</a>
        <a class="btn small" href="mailto:?subject=${encodeURIComponent("Grow to Gobble")}&body=${msg}">✉️ Email</a>
        <a class="btn small" href="sms:?&body=${msg}">📱 Text</a></div></div>`;
    } catch (e) { toast(e.message); }
  };
  $("#invite-card").onclick = (e) => {
    const c = e.target.closest("[data-copy]");
    if (c) navigator.clipboard.writeText(c.dataset.copy).then(() => toast("Link copied 📋"), () => toast("Select the link and copy it"));
  };
  $("#save").onclick = async () => {
    try {
      S.me = await api("PATCH", "/api/me", { name: $("#nm").value, email: $("#em").value, postcode: $("#pc").value });
      S.cat = await api("GET", "/api/plants"); S.g = await api("GET", "/api/garden"); render(); toast("Saved ✅");
    } catch (e) { toast(e.message); }
  };
  $("#pwsave").onclick = async () => {
    try { await api("POST", "/api/me/password", { current: $("#pw0").value, new: $("#pw1").value }); $("#pw0").value = $("#pw1").value = ""; toast("Password changed 🔑"); }
    catch (e) { toast(e.message); }
  };
  const pt = $("#ptest"); if (pt) pt.onclick = () => api("POST", "/api/push/test").then(() => toast("Sent! Check your phone 📱"), (e) => toast(e.message));
  const po = $("#poff"); if (po) po.onclick = disablePush;
  const ins = $("#install"); if (ins) ins.onclick = async () => { S.installPrompt.prompt(); S.installPrompt = null; render(); };
  $("#logout").onclick = async () => { await api("POST", "/api/logout"); S.me = S.g = null; go("#/welcome"); };
  $("#resetgarden").onclick = async () => {
    if (!$("#rspw").value) { toast("Type your password first"); return; }
    if (!confirm("Clear all your beds and plants and start again? This can't be undone.")) return;
    try {
      S.g = await api("POST", "/api/me/reset-garden", { password: $("#rspw").value });
      onb.step = 1; onb.picked = new Set(); go("#/start"); toast("Fresh start! Let's set up your garden 🌱");
    } catch (e) { toast(e.message); }
  };
  $("#delete").onclick = async () => {
    if (!$("#delpw").value) { toast("Type your password first"); return; }
    if (!confirm("Really delete your account and garden plan for ever?")) return;
    try { await api("POST", "/api/me/delete", { password: $("#delpw").value }); S.me = S.g = null; go("#/welcome"); toast("Account deleted"); }
    catch (e) { toast(e.message); }
  };
}

// ---- admin (like the Training Tracker: accounts, one-time reset links, admins) ------------------------

async function adminPage() {
  if (!S.me.is_admin) { go("#/me"); return; }
  view.innerHTML = `<h1>🛠️ Admin</h1><p class="muted">Loading…</p>`;
  let data;
  try { data = await api("GET", "/api/admin"); } catch (e) { view.innerHTML = `<h1>🛠️ Admin</h1><div class="error">${esc(e.message)}</div>`; return; }
  drawAdmin(data);
}

function drawAdmin(data) {
  const ago = (iso) => { if (!iso) return "never"; const n = daysBetween(d(iso.slice(0, 10)), today()); return n <= 0 ? "today" : n === 1 ? "yesterday" : n + " days ago"; };
  view.innerHTML = `<h1>🛠️ Admin</h1>
    <div class="card ${data.on_volume ? "tint-leaf" : "tint-tomato"}"><b>${data.on_volume ? "✅ Accounts are saved safely" : "⚠️ Accounts are NOT on permanent storage"}</b>
      <p class="small" style="margin:4px 0 0">${data.on_volume ? "The database is on a Railway volume, so it survives updates and restarts."
        : "On Railway: open the service → Settings → Volumes → Add volume, mount path /data. Until then, accounts are wiped whenever the app updates. (On your own computer this is normal.)"}</p></div>
    <div class="card tint-leaf"><b>💌 Invites:</b> ${data.invites.sent} sent · ${data.invites.joined} joined${data.invites.sent ? ` (${Math.round((100 * data.invites.joined) / data.invites.sent)}%)` : ""}
      ${data.users.some((u) => u.invites_sent) ? `<div class="small" style="margin-top:6px">${data.users.filter((u) => u.invites_sent).sort((a, b) => b.invites_joined - a.invites_joined || b.invites_sent - a.invites_sent)
        .map((u) => `${esc(u.name)}: ${u.invites_sent} sent, <b>${u.invites_joined} joined</b>`).join("<br>")}</div>` : ""}</div>
    <p class="muted">${data.users.length} account${data.users.length === 1 ? "" : "s"}. There's no email sending yet, so to reset someone's password, make a link and send it to them yourself - it works once, for 48 hours.</p>
    ${data.users.map((u) => `<div class="card">
      <div class="row" style="justify-content:space-between"><div><b>${esc(u.name)}</b> ${u.is_admin ? `<span class="chip">🛠️ Admin</span>` : ""}${u.id === data.me ? ` <span class="chip grey">You</span>` : ""}
        <div class="small muted">${esc(u.email)}${u.outcode ? " · " + esc(u.outcode) : ""}</div>
        <div class="small muted">Joined ${fmt(u.created_at.slice(0, 10))} · last active ${ago(u.last_active)} · ${u.crops} crop${u.crops === 1 ? "" : "s"} · ${u.devices ? "🔔 reminders on" : "no reminders"}</div>
        <div class="small muted">💌 sent ${u.invites_sent} invite${u.invites_sent === 1 ? "" : "s"}, ${u.invites_joined} joined</div>
        <label class="small muted" style="display:flex;gap:6px;align-items:center;margin-top:4px">Invited by
          <select data-inviter="${u.id}" style="width:auto;font-size:14px;padding:6px 8px"><option value="">nobody - signed up on their own</option>
          ${data.users.filter((o) => o.id !== u.id).map((o) => `<option value="${o.id}" ${o.name === u.invited_by_name && u.invited_by_name ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select></label></div></div>
      <div class="row" style="margin-top:10px">
        <button class="btn small" data-reset="${u.id}">🔑 Password reset link</button>
        ${u.id === data.me ? "" : `<button class="btn small ghost" data-admin="${u.id}" data-to="${u.is_admin ? 0 : 1}">${u.is_admin ? "Remove admin" : "Make admin"}</button>
        <button class="btn small danger" data-del="${u.id}" data-name="${esc(u.name)}">Delete</button>`}</div>
      <div id="link-${u.id}"></div></div>`).join("")}`;
  view.onchange = async (e) => {
    const sel = e.target.closest("[data-inviter]");
    if (!sel) return;
    try { drawAdmin(await api("POST", `/api/admin/users/${sel.dataset.inviter}/invited_by`, { inviter_id: sel.value ? Number(sel.value) : null })); toast("Saved 💌"); }
    catch (err) { toast(err.message); }
  };
  view.onclick = async (e) => {
    const r = e.target.closest("[data-reset]"), m = e.target.closest("[data-admin]"), x = e.target.closest("[data-del]");
    try {
      if (r) {
        const out = await api("POST", `/api/admin/users/${r.dataset.reset}/reset`);
        $("#link-" + r.dataset.reset).innerHTML = `<div class="checkbox"><b>Send this link to them</b> (works once, for ${out.hours} hours):
          <input type="text" readonly value="${esc(out.link)}" onclick="this.select()"><button class="btn small" data-copy="${esc(out.link)}">📋 Copy</button></div>`;
      }
      if (m) drawAdmin(await api("POST", `/api/admin/users/${m.dataset.admin}/admin`, { is_admin: m.dataset.to === "1" }));
      if (x && confirm(`Delete ${x.dataset.name}'s account and garden for ever?`)) drawAdmin(await api("DELETE", `/api/admin/users/${x.dataset.del}`));
      const c = e.target.closest("[data-copy]");
      if (c) navigator.clipboard.writeText(c.dataset.copy).then(() => toast("Link copied 📋"), () => toast("Select the link and copy it"));
    } catch (err) { toast(err.message); }
  };
}

// A one-time link from an admin: set a new password and carry on
function resetPage() {
  const token = new URLSearchParams(location.hash.split("?")[1] || "").get("token") || "";
  view.innerHTML = `<div class="auth-card"><div class="hero" style="padding-bottom:0"><div class="big">🔑</div><h1>Set a new password</h1></div>
  <form class="card" id="f">
    <label class="field" for="pw1">New password <span class="muted small">(8 or more letters)</span></label><input id="pw1" type="password" autocomplete="new-password" minlength="8" required>
    <label class="field" for="pw2">Type it again</label><input id="pw2" type="password" autocomplete="new-password" minlength="8" required>
    <div id="err"></div><button class="btn primary wide" style="margin-top:16px">Save and log in</button></form></div>`;
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    if ($("#pw1").value !== $("#pw2").value) { $("#err").innerHTML = `<div class="error">Those two passwords don't match.</div>`; return; }
    try { S.me = await api("POST", "/api/reset", { token, password: $("#pw1").value }); await boot("#/"); toast("Password changed - welcome back! 🌱"); }
    catch (err) { $("#err").innerHTML = `<div class="error">${esc(err.message)}</div>`; }
  };
}

// ---- start -----------------------------------------------------------------------------------------

$("#brand").innerHTML = LOGO + `<span>Grow to <span class="g">Gobble</span></span>`;

// Light or dark: follows the phone unless you pick one (the toggle in the top bar, or Me > Appearance)
function themeNow() { const t = document.documentElement.getAttribute("data-theme"); return t || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
function setTheme(mode) {  // "light", "dark" or "" (match the phone)
  if (mode) document.documentElement.setAttribute("data-theme", mode); else document.documentElement.removeAttribute("data-theme");
  try { if (mode) localStorage.setItem("gtg-theme", mode); else localStorage.removeItem("gtg-theme"); } catch (e) { /* private mode */ }
  $("#theme-color").setAttribute("content", themeNow() === "dark" ? "#0d1511" : "#f3f5f2");
}
setTheme(document.documentElement.getAttribute("data-theme") || "");
$("#theme-btn").onclick = () => { setTheme(themeNow() === "dark" ? "light" : "dark"); if (location.hash.startsWith("#/me")) mePage(); };

window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.installPrompt = e; });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

async function boot(to) {
  try {
    if (!S.me) S.me = await api("GET", "/api/me");
    [S.cat, S.g] = await Promise.all([api("GET", "/api/plants"), api("GET", "/api/garden")]);
    if (to) go(to); else render();
  } catch (e) {
    if (!S.me) render();
  }
}
boot();
