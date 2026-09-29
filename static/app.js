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
const LOGO = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="20" fill="#1f5c3b"/>
  <ellipse cx="20" cy="29" rx="11" ry="4" fill="#eca42b"/><path d="M20 28 V17" stroke="#e3eed8" stroke-width="3" stroke-linecap="round"/>
  <path d="M20 19 c-2-6-7-8-11-7 c1 5 6 8 11 7z" fill="#9fd88f"/><path d="M20 17 c1-7 6-10 11-9 c-1 6-6 9-11 9z" fill="#cfeec0"/></svg>`;
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
const KIND_WORD = { sow_in: "Sow indoors", sow_out: "Sow outside", plant_out: "Plant out", harvest: "Pick" };

async function api(method, path, body) {
  const res = await fetch(path, {
    method, credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !path.startsWith("/api/login") && !path.startsWith("/api/register")) {
    S.me = null; S.g = null; go("#/welcome"); throw new Error("Please log in");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Something went wrong. Try again?");
  return data;
}

// Every change returns the whole garden; store it, celebrate new badges, redraw.
async function change(method, path, body, message) {
  try {
    S.g = await api(method, path, body);
    render();
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
  $("#sheet-card").innerHTML = `<button class="sheet-close" data-close aria-label="Close">✕</button>` + html;
  $("#sheet").hidden = false; $("#sheet-card").scrollTop = 0;
  document.body.style.overflow = "hidden";
}
function closeSheet() { $("#sheet").hidden = true; document.body.style.overflow = ""; S.sheet = null; }
$("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet" || e.target.closest("[data-close]")) closeSheet(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

// ---- routing ---------------------------------------------------------------------------------------

function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
window.addEventListener("hashchange", render);

const PAGES = { "": home, garden: gardenPage, calendar: calendarPage, plants: plantsPage, me: mePage, shop: shopPage, start: onboarding, admin: adminPage };
const PUBLIC = { welcome, login: loginPage, join: joinPage, reset: resetPage };

function render() {
  const [route, query] = location.hash.replace(/^#\/?/, "").split("?");
  if (route === "plants" && query === "now") { plantFilter = "now"; history.replaceState(null, "", "#/plants"); }
  const loggedIn = !!(S.me && S.g);
  $("#topbar").hidden = $("#tabs").hidden = !loggedIn || route === "start";
  document.body.style.paddingBottom = loggedIn && route !== "start" ? "" : "20px";
  view.onclick = null;
  if (!loggedIn) { (PUBLIC[route] || welcome)(); return; }
  if (route === "reset") { $("#topbar").hidden = $("#tabs").hidden = true; resetPage(); return; }
  if (PUBLIC[route]) { go("#/"); return; }
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
    <div class="stack" style="max-width:360px;margin:0 auto">
      <a class="btn primary wide" href="#/join">Start growing - it's free</a>
      <a class="btn wide" href="#/login">I already have an account</a>
    </div>
  </section>
  <div class="card tint-sun" style="margin-top:24px">
    <h3>🧒 Simple enough for a 10-year-old</h3>
    <p class="muted" style="margin:0">Every job is a short list of steps with pictures. Tick them off, earn badges and eat what you grow.</p>
  </div>
  <div class="card tint-leaf"><h3>📦 No digging needed</h3><p class="muted" style="margin:0">Build a no-dig bed with cardboard and compost, or grow in pots on a patio.</p></div>
  <div class="card tint-sky"><h3>🔔 We'll remind you</h3><p class="muted" style="margin:0">Your phone gets a nudge when it's time to sow, plant, water, pick and protect from frost, with dates for where you live.</p></div>`;
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
  view.innerHTML = `<div class="auth-card"><div class="hero" style="padding-bottom:0"><div class="big">🌱</div><h1>Let's get growing</h1></div>
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
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    try {
      S.me = await api("POST", "/api/register", { name: $("#name").value, email: $("#email").value, password: $("#pw").value, postcode: $("#pc").value, age_ok: $("#age").checked });
      await boot("#/start");
    } catch (err) { $("#err").innerHTML = `<div class="error">${esc(err.message)}</div>`; }
  };
}

// ---- onboarding ------------------------------------------------------------------------------------

const onb = { step: 1, counts: { bed: 1, pot: 0, allotment: 0 }, picked: new Set(), filter: "all" };

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
      <button class="btn primary wide" id="next" ${Object.values(onb.counts).some((n) => n) ? "" : "disabled"}>Next: choose your food 👉</button>`;
    view.onclick = (e) => {
      const inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]");
      if (inc) { onb.counts[inc.dataset.inc] = Math.min(9, onb.counts[inc.dataset.inc] + 1); onboarding(); }
      if (dec) { onb.counts[dec.dataset.dec] = Math.max(0, onb.counts[dec.dataset.dec] - 1); onboarding(); }
    };
    $("#next").onclick = async () => {
      for (const [kind, n] of Object.entries(onb.counts)) {
        const base = { bed: "Bed", pot: "Pot", allotment: "Allotment" }[kind];
        for (let i = 1; i <= n; i++) S.g = await api("POST", "/api/spaces", { name: n > 1 ? `${base} ${i}` : (kind === "pot" ? "My pots" : "My " + base.toLowerCase()), kind });
      }
      onb.step = 2; view.onclick = null; onboarding();
    };
    return;
  }
  if (onb.step === 2) {
    const onlyPots = S.g.spaces.every((s) => s.kind === "pot");
    const list = filteredPlants(onb.filter).filter((p) => !onlyPots || p.where.includes("pot"));
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
    <div class="card tint-sun"><b>🛒 Next: get your seeds</b><p class="small muted" style="margin:4px 0 0">Your shopping list has a one-tap link for each one.</p></div>
    <button class="btn primary wide" id="done">Let's go! 👉</button>`;
  $("#done").onclick = () => { onb.step = 1; go("#/"); };
}

function filteredPlants(filter) {
  const now = today();
  return S.cat.plants.filter((p) => {
    if (filter === "1" || filter === "2" || filter === "3") return p.level === Number(filter);
    if (filter === "pot") return p.where.includes("pot");
    if (filter === "now") return Object.values(p.next).some((w) => w && daysBetween(now, d(w[0])) <= 30);
    return true;
  }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

function filterBar(current) {
  const opts = [["all", "All"], ["1", "🟢 Easy peasy"], ["2", "🟠 A bit more care"], ["3", "🔴 More care"], ["pot", "🪴 Good in pots"], ["now", "📅 Can start soon"]];
  return `<div class="filter">${opts.map(([k, l]) => `<button data-filter="${k}" class="${current === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
}

function tile(p, picked, have) {
  const lv = S.cat.levels[p.level];
  return `<button class="tile ${picked ? "picked" : ""}" data-plant="${p.id}">${have ? `<span class="have" title="In your garden">🌱</span>` : ""}
    <span class="blob l${p.level}">${p.emoji}</span><span class="n">${esc(p.name)}</span><span class="chip l${p.level}">${lv.emoji} ${esc(lv.name)}</span></button>`;
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
      <div class="job-when ${hot ? "hot" : ""}">${job.emoji} ${whenText(job)}${where}</div>
      ${job.steps.length ? `<details class="how" ${opts.open ? "open" : ""}><summary>Show me how</summary><ol class="steps">${job.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></details>` : ""}
      ${extra}
    </div>
    ${canTick && job.status !== "missed" ? `<button class="tick ${done ? "done" : ""}" data-tick="${esc(job.key)}" ${done ? 'data-undo="1"' : ""} aria-label="${done ? "Undo" : tickLabel}" title="${done ? "Undo" : tickLabel}">${done ? "✓" : ""}</button>` : ""}
  </div>`;
}

const CHEERS = { sow: "Brilliant! Seeds sown 🌱", plant: "Nice planting! 🌿", harvest: "You picked your own food! 🧺", eat: "Gobbled! 😋" };

// one click handler for every job button, wherever it appears
document.addEventListener("click", async (e) => {
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
  const pl = e.target.closest("[data-open-plant]");
  if (pl) { openPlant(pl.dataset.openPlant, pl.dataset.space ? Number(pl.dataset.space) : null, pl.dataset.method, pl.dataset.after); return; }
  const cr = e.target.closest("[data-open-crop]");
  if (cr) { openCrop(Number(cr.dataset.openCrop)); return; }
  const sp = e.target.closest("[data-open-space]");
  if (sp) { openSpace(Number(sp.dataset.openSpace)); }
});

function activeCrops() { return S.g.crops.filter((c) => !c.finished_on); }
function allJobs() { return activeCrops().flatMap((c) => c.jobs); }

// ---- today -----------------------------------------------------------------------------------------

function home() {
  const jobs = allJobs();
  const t = today();
  const recentMiss = (j) => j.status === "missed" && ["sow", "plant"].includes(j.action) && daysBetween(d(j.end), t) <= 21;
  const now = jobs.filter((j) => j.kind !== "buy" && (j.status === "now" || recentMiss(j))).sort((a, b) => a.end.localeCompare(b.end));
  const soon = jobs.filter((j) => j.kind !== "buy" && j.status === "soon").sort((a, b) => a.start.localeCompare(b.start));
  const buyNow = S.g.shopping.filter((s) => s.job.status === "now" || s.job.status === "soon" || s.job.status === "missed");
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const month = MONTHS_LONG[t.getMonth()];

  if (!S.g.spaces.length) { go("#/start"); return; }

  const suggestions = S.g.spaces.filter((s) => s.suggestion && s.suggestion.plants.length);
  const unbuilt = S.g.spaces.filter((s) => s.kind !== "pot" && s.nodig_done.length < S.cat.nodig_steps.length);

  view.innerHTML = `
    <div class="card hello"><div class="hello-text"><h1>${hello}, ${esc(S.me.name)}! 👋</h1>
      <p>${fmt(S.g.today, true)} · ${esc(month)} in ${esc(S.me.region.short)}</p></div>${SCENE}</div>
    ${pushBanner()}
    ${journeyCard()}
    <div class="section-title"><h2>🧤 Jobs to do now</h2><span class="muted small">${now.length || ""}</span></div>
    <div class="card">${now.length ? now.map((j) => jobCard(j, { showSpace: true })).join("") :
      `<div class="empty"><div class="big">😌</div><b>Nothing to do right now.</b><br>Have a look at what's coming up, or add something new to grow.</div>`}</div>
    ${unbuilt.length ? `<div class="card tint-soil row" style="justify-content:space-between" data-open-space="${unbuilt[0].id}">
      <div><b>📦 Build ${esc(unbuilt[0].name)}</b><div class="small muted">No-dig bed: ${unbuilt[0].nodig_done.length} of ${S.cat.nodig_steps.length} steps done</div></div>
      <span class="btn small">Let's build 👉</span></div>` : ""}
    ${buyNow.length ? `<a href="#/shop" class="card tint-sun row" style="justify-content:space-between;text-decoration:none;color:inherit">
      <div><b>🛒 ${buyNow.length} thing${buyNow.length === 1 ? "" : "s"} to buy soon</b><div class="small muted">${buyNow.slice(0, 4).map((s) => plant(s.plant_id).emoji).join(" ")} Tap to see your shopping list</div></div><span class="btn small sun">Shop 👉</span></a>` : ""}
    ${suggestions.map(suggestionCard).join("")}
    ${plantNowStrip()}
    ${soon.length ? `<div class="section-title"><h2>🔜 Coming up</h2></div><div class="card">${soon.slice(0, 6).map((j) => jobCard(j, { showSpace: true })).join("")}</div>` : ""}
    ${!activeCrops().length ? `<div class="card tint-leaf"><b>🌱 Your garden is empty</b><p class="small muted">Pick some food you love to eat and we'll plan it for you.</p><a class="btn primary" href="#/plants">Choose plants</a></div>` : ""}`;
  wirePush();
}

// Things they haven't picked yet that can be started now (or within 2 weeks), easiest first.
function plantNow() {
  const have = new Set(activeCrops().map((c) => c.plant_id));
  const fits = new Set(S.g.spaces.map((s) => (s.kind === "pot" ? "pot" : "bed")));
  const t = today();
  const out = [];
  for (const p of S.cat.plants) {
    if (have.has(p.id) || !p.where.some((w) => fits.has(w))) continue;
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
  return `<div class="section-title"><h2>🌱 You could also plant now</h2><a href="#/plants?now">See all</a></div>
    <div class="strip">${list.map(({ p, m, w }) => {
      const open = d(w[0]) <= t;
      return `<button class="tile" data-open-plant="${p.id}" data-method="${m}"><span class="blob l${p.level}">${p.emoji}</span>
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

function cropRow(c) {
  const p = plant(c.plant_id), j = nextJob(c), row = rowLabel(c);
  const when = c.sown_on ? "sown " + fmt(c.sown_on) : c.planted_on ? "planted " + fmt(c.planted_on) : "";
  return `<div class="crop-row" data-open-crop="${c.id}">
    <span class="e">${p.emoji}</span>
    <div class="n">${esc(p.name)}${row ? ` <span class="chip grey">${row}${when ? " · " + when : ""}</span>` : ""}<div class="small muted" style="font-weight:600">${j ? esc(j.title) + " · " + whenText(j) : c.finished_on ? "Finished" : "All done 🎉"}</div></div>
    <div class="stage" aria-label="Stage ${c.stage + 1} of 5">${STAGES.map((e, i) => `<span class="${i <= c.stage ? "on" : ""}">${e}</span>`).join("")}</div>
  </div>`;
}

function gardenPage() {
  const unplaced = activeCrops().filter((c) => !c.space_id);
  const finished = S.g.crops.filter((c) => c.finished_on);
  view.innerHTML = `<h1>🪴 My garden</h1>
    ${S.g.spaces.map((s) => {
      const crops = activeCrops().filter((c) => c.space_id === s.id);
      const k = SPACE_KINDS[s.kind];
      const built = s.nodig_done.length, total = S.cat.nodig_steps.length;
      return `<div class="card">
        <div class="space-head"><span class="e">${k.emoji}</span><h3>${esc(s.name)}</h3><button class="btn small ghost" data-open-space="${s.id}">${s.kind === "pot" ? "Details" : built < total ? "Details & build" : "Details ✅"}</button></div>
        ${s.kind !== "pot" && built < total ? `<div class="progress" title="No-dig bed ${built} of ${total}"><i style="width:${(100 * built) / total}%"></i></div>` : ""}
        ${usageBar(s)}
        ${s.clashes.map((x) => `<div class="checkbox warn small" style="margin-top:8px">🙅 ${plant(x.a).emoji} ${esc(plant(x.a).name)} and ${plant(x.b).emoji} ${esc(plant(x.b).name)} don't like sharing: ${esc(x.why)}.</div>`).join("")}
        ${crops.map(cropRow).join("") || `<p class="small muted" style="margin:8px 0 0">Nothing growing here yet.</p>`}
        ${s.suggestion && s.suggestion.plants.length ? `<div class="suggest">${s.suggestion.plants.map((x) => suggestChip(x, `data-open-plant="${x.plant_id}" data-space="${s.id}"`, "+ ")).join("")}</div>` : ""}
      </div>`;
    }).join("")}
    ${unplaced.length ? `<div class="card"><h3>📍 Not placed yet</h3>${unplaced.map(cropRow).join("")}</div>` : ""}
    <div class="row"><button class="btn" id="add-space">➕ Add a bed or pot</button><a class="btn" href="#/plants">🥕 Add plants</a></div>
    ${finished.length ? `<details class="card" style="margin-top:14px"><summary><b>Finished (${finished.length})</b></summary>${finished.map(cropRow).join("")}</details>` : ""}`;
  $("#add-space").onclick = addSpaceSheet;
}

// How full a bed gets at its busiest moment
function usageBar(s) {
  const u = s.usage;
  if (!u || !u.area) return "";
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
  return `<label class="field" for="sn">Name</label><input id="sn" type="text" maxlength="40" value="${esc(s ? s.name : "")}" placeholder="e.g. Back bed, Patio pots">
    <label class="field">What kind?</label>
    <div class="kinds">${Object.entries(SPACE_KINDS).map(([k, v]) => `<label class="kind ${kind === k ? "on" : ""}"><input type="radio" name="kind" value="${k}" ${kind === k ? "checked" : ""}><span class="e">${v.emoji}</span><b>${v.label}</b></label>`).join("")}</div>
    <div id="size"><label class="field">How big is it? <span class="muted small">(so we can check what fits)</span></label>
      <div class="size-row">
        <label class="big-num"><span>Width</span><input id="sw" type="number" step="0.1" min="0.1" inputmode="decimal" placeholder="1.2" value="${s && s.width_m ? s.width_m : ""}"><em>m</em></label>
        <span class="times">×</span>
        <label class="big-num"><span>Length</span><input id="sl" type="number" step="0.1" min="0.1" inputmode="decimal" placeholder="2.4" value="${s && s.length_m ? s.length_m : ""}"><em>m</em></label>
      </div>
      <p class="area" id="area"></p>
      <p class="small muted" style="margin:4px 0 0">Measure with a tape measure in metres (100cm = 1m). A standard raised bed is 1.2 × 2.4 m. A half allotment plot is about 5 × 25 m.</p></div>
    <label class="field">What's the soil like?</label>
    <div class="soils">${Object.entries(S.cat.soil_types).map(([k, v]) => `<label class="soilopt ${soil === k ? "on" : ""}"><input type="radio" name="soil" value="${k}" ${soil === k ? "checked" : ""}><span>${v.emoji}</span> ${esc(v.name)}</label>`).join("")}</div>
    <div class="checkbox" id="soiltip"></div>`;
}

function wireSpaceForm(s, afterSave) {
  const card = $("#sheet-card");
  const val = (n) => { const el = card.querySelector(`input[name=${n}]:checked`); return el && el.value; };
  const refresh = () => {
    card.querySelectorAll(".kind").forEach((el) => el.classList.toggle("on", el.querySelector("input").checked));
    card.querySelectorAll(".soilopt").forEach((el) => el.classList.toggle("on", el.querySelector("input").checked));
    $("#size").hidden = val("kind") === "pot";
    const w = Number($("#sw").value), l = Number($("#sl").value);
    $("#area").innerHTML = w && l ? `= <b>${(w * l).toFixed(2).replace(/\.?0+$/, "")} m²</b> of growing space` : "";
    const t = S.cat.soil_types[val("soil") || "unknown"];
    $("#soiltip").innerHTML = `<div><b>${t.emoji} How to tell:</b> ${esc(t.test)}</div><div><b>🌱 What to do:</b> ${esc(t.tips)}</div>`;
  };
  card.addEventListener("input", refresh);
  card.addEventListener("change", refresh);
  refresh();
  $("#save").onclick = async () => {
    const body = { name: $("#sn").value || "My bed", kind: val("kind"), soil: val("soil"),
                   width_m: Number($("#sw").value) || null, length_m: Number($("#sl").value) || null };
    if (await change(s ? "PATCH" : "POST", s ? `/api/spaces/${s.id}` : "/api/spaces", body, s ? "Saved ✅" : "Added ✅") && afterSave) afterSave();
  };
}

function addSpaceSheet() {
  S.sheet = null;
  openSheet(`<h2>Add a growing space</h2>${spaceForm(null)}
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
  openSheet(`<div class="plant-head"><span class="e">${SPACE_KINDS[s.kind].emoji}</span><div><h2 style="margin:0">${esc(s.name)}</h2>
      <div class="muted">${pot ? "Growing in pots" : "Your bed, and how to build it"}</div></div></div>
    <div class="card"><h3>✏️ About this ${pot ? "space" : "bed"}</h3>${spaceForm(s)}
      <div class="row" style="margin-top:14px"><button class="btn primary" id="save">Save</button><button class="btn danger small" id="del">🗑️ Delete</button></div></div>
    <h2 style="margin-top:20px">${pot ? "🪴 Setting up pots" : "📦 Build a no-dig bed"}</h2>
    ${pot ? "" : `<div class="progress"><i style="width:${(100 * done.size) / steps.length}%"></i></div><p class="small muted">${done.size} of ${steps.length} steps done. Tick each one as you go!</p>`}
    <div class="card">${steps.map((st, i) => `<div class="nodig-step"><span class="e">${st.emoji}</span><div style="flex:1"><b>${i + 1}. ${esc(st.title)}</b><div class="small">${esc(st.text)}</div></div>
      ${pot ? "" : `<button class="tick ${done.has(i) ? "done" : ""}" data-tick="s${s.id}:nodig${i}" ${done.has(i) ? 'data-undo="1"' : ""} aria-label="Done">${done.has(i) ? "✓" : ""}</button>`}</div>`).join("")}</div>
    ${pot ? "" : `<p class="small muted">🕰️ Best time to build: autumn or winter, so it's ready for spring. But you can build one any time and plant straight into the compost.</p>
    <div class="card tint-leaf"><h3>🌱 Planting into your no-dig bed</h3><ol class="steps">${S.cat.nodig_planting.map((t) => `<li>${esc(t)}</li>`).join("")}</ol></div>`}`);
  wireSpaceForm(s);
  $("#del").onclick = async () => {
    if (!confirm(`Delete ${s.name}? Plants in it stay in your plan, just not placed.`)) return;
    if (await change("DELETE", `/api/spaces/${s.id}`, null, "Deleted")) closeSheet();
  };
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
  const timeline = c.jobs.filter((j) => j.kind !== "buy" || j.status !== "done");
  const near = new Set(activeCrops().filter((x) => x.space_id && x.space_id === c.space_id && x.id !== c.id).map((x) => x.plant_id));
  const row = rowLabel(c);
  openSheet(`<div class="plant-head"><span class="blob l${p.level}">${p.emoji}</span><div><h2 style="margin:0">${esc(p.name)}${row ? ` <span class="chip grey" style="vertical-align:middle">${row}</span>` : ""}</h2>
      <div class="stage" style="font-size:20px;margin-top:4px">${STAGES.map((e, i) => `<span class="${i <= c.stage ? "on" : ""}">${e}</span>`).join("")}</div></div></div>
    <div class="row" style="margin-bottom:12px">
      <select id="cs" aria-label="Where it grows" style="flex:1">${fits.map((s) => `<option value="${s.id}" ${s.id === c.space_id ? "selected" : ""}>${SPACE_KINDS[s.kind].emoji} ${esc(s.name)}</option>`).join("")}
        ${c.space_id ? "" : `<option selected disabled>📍 Choose where it grows</option>`}</select>
    </div>
    ${!started && p.methods.length > 1 ? `<div class="chips" style="margin-bottom:12px">${p.methods.map((m) => `<button class="btn small ${m === c.method ? "primary" : ""}" data-crop-method="${m}">${S.cat.methods[m].emoji} ${esc(S.cat.methods[m].label)}</button>`).join("")}</div>` : ""}
    <div class="card tint-sky"><div class="row" style="justify-content:space-between">
      <div><b>How many ${esc(p.unit)}?</b><div class="small">🧺 ${esc(c.harvest || "")}</div>${c.space_id && S.g.spaces.find((s) => s.id === c.space_id).kind !== "pot" ? `<div class="small muted">📏 Uses about ${c.area} m²</div>` : ""}</div>
      <div class="counter qty"><button class="btn small" data-cq="-1" aria-label="Fewer">−</button><input id="cq" type="number" inputmode="numeric" min="1" value="${c.qty}"><button class="btn small" data-cq="1" aria-label="More">+</button></div></div></div>
    <div class="card">${timeline.map((j) => jobCard(j)).join("")}</div>
    ${datesCard(c)}
    ${secondCard(c, p)}
    ${p.succession && c.method !== "plants" ? `<div class="card"><b>🔁 Steady supply</b><p class="small" style="margin:4px 0 0">Sow a little every ${p.succession} weeks instead of all at once - you'll get a few each week rather than loads at the same time. We'll remind you when it's time for the next batch.</p></div>` : ""}
    ${thenCard(c.then && dict(c.then, { family: p.family_name }), "When they're picked, grow next", c.space_id)}
    ${neighboursCard(p, near)}
    <button class="btn wide" data-open-plant="${p.id}">📖 All about ${esc(p.name.toLowerCase())}</button>
    <div class="row" style="margin-top:10px">
      ${c.finished_on ? "" : `<button class="btn" id="finish">🧹 All finished, clear it</button>`}
      <button class="btn danger" id="remove">🗑️ Remove</button></div>`);
  $("#cs").onchange = (e) => change("PATCH", `/api/crops/${c.id}`, { plant_id: c.plant_id, space_id: Number(e.target.value) }, "Moved");
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
    if (!confirm(`Remove ${p.name} from your garden?`)) return;
    if (await change("DELETE", `/api/crops/${c.id}`, null, "Removed")) closeSheet();
  };
}

// ---- plants ----------------------------------------------------------------------------------------

let plantFilter = "all", plantSearch = "";
function plantsPage() {
  const have = new Set(activeCrops().map((c) => c.plant_id));
  const q = plantSearch.toLowerCase();
  const list = filteredPlants(plantFilter).filter((p) => !q || p.name.toLowerCase().includes(q));
  view.innerHTML = `<h1>🥕 What would you like to grow?</h1>
    <p class="muted">Pick things you love to eat. Start with green ones if you're new.</p>
    <input type="text" id="q" placeholder="🔍 Search, e.g. tomatoes" value="${esc(plantSearch)}" style="margin-bottom:10px">
    ${filterBar(plantFilter)}
    <div class="grid">${list.map((p) => tile(p, false, have.has(p.id))).join("") || `<p class="muted">Nothing matches.</p>`}</div>`;
  $("#q").oninput = (e) => { plantSearch = e.target.value; const pos = e.target.selectionStart; plantsPage(); const q2 = $("#q"); q2.focus(); q2.setSelectionRange(pos, pos); };
  view.onclick = (e) => {
    const f = e.target.closest("[data-filter]");
    if (f) { plantFilter = f.dataset.filter; plantsPage(); return; }
    const t = e.target.closest(".tile[data-plant]");
    if (t) openPlant(t.dataset.plant);
  };
}

function monthChart(p) {
  const rows = [["sow_in", "🏠 Indoors"], ["sow_out", "🌱 Sow"], ["plant_out", "🌿 Plant"], ["harvest", "🧺 Pick"]].filter(([k]) => p.months[k].length);
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

function roomCard(p) {
  return `<div class="card tint-sky"><h3>📏 How much room?</h3>
    <p style="margin:0 0 4px">Each one needs <b>${p.sp_cm}cm</b> to its neighbour, with <b>${p.row_cm}cm</b> between rows. That's about <b>${Math.max(1, Math.floor(1 / p.area_each))} per square metre</b>.</p>
    ${p.where.includes("pot") ? `<p class="small" style="margin:0">🪴 ${esc(p.pot_advice)}</p>` : ""}
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
  let qty = p.default_qty, batches = 1, every = p.succession || 2;
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
  openSheet(`<div class="plant-head"><span class="blob l${p.level}">${p.emoji}</span><div><h2 style="margin:0">${esc(p.name)}</h2>
      <div class="chips" style="margin-top:6px"><span class="chip l${p.level}">${lv.emoji} ${esc(lv.name)}</span>
      ${p.where.includes("pot") ? `<span class="chip sky">🪴 Pots OK</span>` : `<span class="chip grey">🟫 Beds only</span>`}
      ${p.tender ? `<span class="chip grey">❄️ Hates frost</span>` : ""}${p.perennial ? `<span class="chip grey">♻️ Comes back every year</span>` : ""}</div></div></div>
    <p><b>${esc(p.blurb)}</b></p>
    ${after ? `<div class="card tint-sun"><b>🔁 Following on from another crop</b><p class="small" style="margin:4px 0 0">${method === "sow_in"
      ? `Give it a head start: sow it indoors (windowsill or greenhouse) a few weeks early, so it's ready to plant out the day the bed is free - <b>${fmt(after)}</b>. No gap, no empty bed!`
      : `We'll plan this to go in once the bed is free, from <b>${fmt(after)}</b>.`}</p></div>` : ""}
    <div class="card"><h3>📅 When</h3>${monthChart(p)}
      <div class="legend">${p.months.sow_in.length ? `<span><i style="background:var(--sky)"></i>Sow indoors</span>` : ""}${p.months.sow_out.length ? `<span><i style="background:var(--leaf)"></i>Sow / plant outside</span>` : ""}${p.months.plant_out.length ? `<span><i style="background:var(--soil)"></i>Plant out</span>` : ""}<span><i style="background:var(--marigold)"></i>Pick</span></div>
      <p class="small muted" style="margin:8px 0 0">Dates for ${esc(S.me.region.name)}. Ready about ${p.weeks} weeks after ${p.methods.includes("plants") && p.methods.length === 1 ? "planting" : "sowing"}.</p></div>
    ${p.tips.length ? `<div class="card tint-sun pip">${PIP}<div><h3 style="margin-bottom:4px">Pip's top tips</h3><ul>${p.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div></div>` : ""}
    ${roomCard(p)}
    ${p.prep.map((x) => `<div class="card tint-soil"><h3>🪜 Before you plant: ${esc(x.title.charAt(0).toLowerCase() + x.title.slice(1))}</h3><ol class="steps">${x.steps.map((st) => `<li>${esc(st)}</li>`).join("")}</ol></div>`).join("")}
    ${steps ? `<div class="card"><h3>👣 How to plant</h3><ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>` : ""}
    ${soilCard(p)}
    ${neighboursCard(p)}
    ${pestsCard(p)}
    <div class="card tint-leaf"><h3>🧺 Picking</h3><p style="margin:0">${esc(p.harvest_tip)}</p></div>
    <div class="card tint-tomato"><h3>😋 Eat it!</h3><p style="margin:0">${esc(p.eat)}</p></div>
    ${storeCard(p)}
    ${after ? "" : thenCard(p.then && dict(p.then, { family: p.family_name }), "After picking, grow next", spaceId)}
    <div class="card"><h3>🛒 Buy ${p.buy_word ? esc(p.buy_word) : "seeds"}</h3><div class="shop-links">${p.links[p.methods[0]].map((l) => `<a class="btn small" href="${esc(l.url)}" target="_blank" rel="sponsored noopener">${esc(l.shop)} ↗</a>`).join("")}</div>
      ${S.cat.affiliate ? `<p class="small muted" style="margin:8px 0 0">We may earn a small commission if you buy through these links. It helps keep the app free.</p>` : ""}</div>
    <div class="card" id="addcard"><h3>🌱 Add to my garden</h3>
      ${already.length ? `<p class="small muted">You're already growing ${already.length === 1 ? "this" : already.length + " lots of these"}. Add another?</p>` : ""}
      <div id="methods">${methodOpts()}</div>
      <label class="field" for="qty">How many ${esc(p.unit)}?</label>
      <div class="counter qty"><button class="btn small" data-q="-1" aria-label="Fewer">−</button><input id="qty" type="number" inputmode="numeric" min="1" max="5000" value="${qty}"><button class="btn small" data-q="1" aria-label="More">+</button></div>
      <div id="rows">${rowsHtml()}</div>
      ${fits.length ? `<label class="field" for="sp">Where?</label><select id="sp">${fits.map((s) => `<option value="${s.id}" ${s.id === spaceId ? "selected" : ""}>${SPACE_KINDS[s.kind].emoji} ${esc(s.name)}</option>`).join("")}</select>`
        : `<p class="small muted">${p.where.includes("pot") ? "" : "This one needs a bed - it's too big for pots. "}Add a ${p.where.includes("pot") ? "bed or pot" : "bed"} in My garden to place it.</p>`}
      <div id="check" class="check-box" aria-live="polite"></div>
      <button class="btn primary wide" style="margin-top:14px" id="add">Add ${esc(p.name.toLowerCase())} 🌱</button></div>`);

  let timer, asked = 0;
  const runCheck = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const sp = $("#sp"), n = ++asked;
      const params = new URLSearchParams({ plant_id: p.id, method, quantity: qty });
      if (sp) params.set("space_id", sp.value);
      if (after) params.set("after", after);
      try {
        const r = await api("GET", "/api/check?" + params);
        if (n === asked && $("#check")) $("#check").innerHTML = checkHtml(p, r);
      } catch (e) { /* the check is a nicety; adding still works */ }
    }, 250);
  };
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
  if ($("#sp")) $("#sp").onchange = runCheck;
  runCheck();
  $("#add").onclick = async () => {
    const sp = $("#sp");
    const many = batches > 1 && p.succession && method !== "plants";
    if (await change("POST", "/api/crops", { plant_id: p.id, method, quantity: qty, after: after || null, space_id: sp ? Number(sp.value) : null,
      batches: many ? batches : 1, every_weeks: every }, many ? `${batches} rows of ${p.name.toLowerCase()} planned 🌱` : `${p.name} added to your plan! 🌱`)) closeSheet();
  };
}

function dict(a, b) { return Object.assign({}, a, b); }

// The live "will it fit?" box under the Add form
function checkHtml(p, r) {
  const icon = { sow_in: "🏠", sow_out: "🌱", plant_out: "🌿", harvest: "🧺" };
  const word = { sow_in: "Sow indoors", sow_out: "Sow", plant_out: "Plant out", harvest: "Pick" };
  const plan = (r.plan || []).map((j) => `${icon[j.kind]} ${word[j.kind]} ${fmt(j.start)}`).join(" → ");
  const lines = [plan ? `<span class="plan">${plan}</span>` : "", `🧺 You'll get <b>${esc(r.harvest || "a good crop")}</b>`].filter(Boolean);
  let cls = "ok";
  if (r.space && r.space.area) {
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
  const list = filteredPlants(allFilter);
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
  const monthJobs = crops.flatMap((c) => c.jobs).filter((j) => j.kind !== "eat" && j.kind !== "buy" && d(j.start) <= mEnd && d(j.end) >= m && (j.status !== "missed"))
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
  const items = S.g.shopping;
  view.innerHTML = `<h1>🛒 Shopping list</h1><p class="muted">Seeds and plants for what you're growing, soonest first. Tap a shop to buy it, then tick it off.</p>
    <div class="card">${items.length ? items.map((s) => jobCard(s.job)).join("") : `<div class="empty"><div class="big">✅</div>You've got everything you need!</div>`}</div>
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
    <details class="card" style="margin-top:14px"><summary><b>🗑️ Delete my account</b></summary>
      <p class="small">This deletes your account and your whole garden plan, for ever. It can't be undone.</p>
      <label class="field" for="delpw">Type your password to confirm</label><input id="delpw" type="password" autocomplete="current-password">
      <button class="btn danger" id="delete" style="margin-top:12px">Delete everything</button></details>`;
  wirePush();
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
    <p class="muted">${data.users.length} account${data.users.length === 1 ? "" : "s"}. There's no email sending yet, so to reset someone's password, make a link and send it to them yourself - it works once, for 48 hours.</p>
    ${data.users.map((u) => `<div class="card">
      <div class="row" style="justify-content:space-between"><div><b>${esc(u.name)}</b> ${u.is_admin ? `<span class="chip">🛠️ Admin</span>` : ""}${u.id === data.me ? ` <span class="chip grey">You</span>` : ""}
        <div class="small muted">${esc(u.email)}${u.outcode ? " · " + esc(u.outcode) : ""}</div>
        <div class="small muted">Joined ${fmt(u.created_at.slice(0, 10))} · last active ${ago(u.last_active)} · ${u.crops} crop${u.crops === 1 ? "" : "s"} · ${u.devices ? "🔔 reminders on" : "no reminders"}</div></div></div>
      <div class="row" style="margin-top:10px">
        <button class="btn small" data-reset="${u.id}">🔑 Password reset link</button>
        ${u.id === data.me ? "" : `<button class="btn small ghost" data-admin="${u.id}" data-to="${u.is_admin ? 0 : 1}">${u.is_admin ? "Remove admin" : "Make admin"}</button>
        <button class="btn small danger" data-del="${u.id}" data-name="${esc(u.name)}">Delete</button>`}</div>
      <div id="link-${u.id}"></div></div>`).join("")}`;
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

$("#brand").innerHTML = LOGO + "<span>Grow <em>to</em> Gobble</span>";

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
