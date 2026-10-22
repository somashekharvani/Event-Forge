/* EventForge core: state, API, formatting, shell, impact sheet, assistant. No frameworks, no CDN. */
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* money: API sends integer paise */
function inr(p, paise = false) {
  p = Math.round(p || 0);
  const neg = p < 0; p = Math.abs(p);
  const r = Math.floor(p / 100), ps = p % 100;
  let s = String(r);
  if (s.length > 3) { let h = s.slice(0, -3), t = s.slice(-3), parts = []; while (h.length > 2) { parts.unshift(h.slice(-2)); h = h.slice(0, -2); } if (h) parts.unshift(h); s = parts.join(",") + "," + t; }
  return (neg ? "-" : "") + "₹" + s + ((paise || ps) && ps ? "." + String(ps).padStart(2, "0") : "");
}
function short(p) {
  const r = Math.abs(p) / 100, sg = p < 0 ? "-" : "";
  if (r >= 1e7) return sg + "₹" + (r / 1e7).toFixed(2) + "Cr";
  if (r >= 1e5) return sg + "₹" + (r / 1e5).toFixed(2) + "L";
  if (r >= 1e3) return sg + "₹" + (r / 1e3).toFixed(1) + "k";
  return sg + "₹" + Math.round(r);
}
const pct = x => Math.round(x * 100) + "%";
const fdate = (iso, o = { day: "numeric", month: "short", year: "numeric" }) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", o);
const cap = s => (s || "").replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* state */
const S = {
  pid: null,
  plan: null,
  version: null,
  tab: "landing",
  sub: {},
  busy: 0,
  vision: { selected: null, edits: null, photoData: null }
};

const VIEWS = {};      // name -> {render(plan)->html, bind(root,plan)}

const TABS = [
  ["overview", "Overview", "📊"],
  ["intake", "New / Edit Plan", "📝"],
  ["budget", "Budget & Risk", "💰"],
  ["timeline", "Timeline & Tasks", "⏱️"],
  ["vendors", "Vendors", "🤝"],
  ["ideas", "Ideas & Themes", "🎨"],
  ["vision", "Vision Studio", "🏛️"],
  ["verify", "Verify & Stress Test", "🛡️"],
  ["community", "Community Toolkit", "👥"],
  ["history", "Versions & Export", "📜"],
];

async function api(path, opts = {}) {
  const o = { method: opts.method || (opts.body ? "POST" : "GET"), headers: {} };
  if (opts.body) { o.headers["content-type"] = "application/json"; o.body = JSON.stringify(opts.body); }
  const r = await fetch("/api" + path, o);
  let data = null;
  try { data = await r.json(); } catch { }
  if (!r.ok) { const e = new Error((data && data.error) || r.statusText); e.status = r.status; throw e; }
  return data;
}

function toast(msg, kind = "") {
  const t = document.createElement("div"); t.className = "toast " + kind; t.textContent = msg; $("#toasts").append(t);
  setTimeout(() => t.remove(), kind === "bad" ? 6000 : 3200);
}

async function guard(fn, label) {
  try { S.busy++; return await fn(); } catch (e) { toast((label ? label + ": " : "") + e.message, "bad"); console.error(e); } finally { S.busy--; }
}

/* ----- rendering ----- */
function setPlan(pkg) {
  S.pid = pkg.project_id; S.plan = pkg.plan; S.version = pkg.version; S.vision.edits = null;
  try { localStorage.setItem("ef_pid", S.pid); } catch { }
  render();
}

function go(tab, sub) {
  S.tab = tab;
  if (sub) S.sub[tab] = sub;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  try { location.hash = tab === "landing" ? "" : tab; } catch { }
}

function renderNav() {
  const nav = $("#nav");
  if (!nav) return;
  
  let html = `<button class="nav-home-btn" data-go="landing">← Public Website</button><hr>`;
  
  if (!S.plan) {
    html += `<button data-go="intake" aria-current="page">📝 Create a Plan</button>`;
    nav.innerHTML = html;
    return;
  }
  
  const c = S.plan.critic, bad = c ? c.hard_failed.length : 0;
  html += TABS.map(([k, l, icon]) => `
    <button data-go="${k}" ${S.tab === k ? 'aria-current="page"' : ""}>
      <span>${icon}</span>
      <span>${l}</span>
      ${k === "verify" ? (bad ? `<span class="badge">${bad}</span>` : `<span class="badge ok">✓</span>`) : ""}
    </button>
  `).join("") + `
    <hr>
    <button data-go="intake" class="nav-new-btn">✨ Plan New Event</button>
  `;
  nav.innerHTML = html;
}

function renderTop() {
  const t = $("#topbar");
  if (!t) return;
  if (S.tab === "landing" || !S.plan) {
    t.hidden = true;
    const fab = $("#fab");
    if (fab) fab.hidden = true;
    return;
  }
  
  t.hidden = false;
  const fab = $("#fab");
  if (fab) fab.hidden = false;
  
  const p = S.plan, o = p.overview, sp = p.spec;
  const feas = { feasible: ["ok", "Within budget"], at_risk: ["warn", "Tight on budget"], infeasible: ["bad", "Over budget"] }[o.feasibility] || ["info", o.feasibility];
  
  t.innerHTML = `
    <button class="btn ghost sm" id="btn-top-home" title="Return to Public Homepage">← Home</button>
    <div>
      <div class="title">${esc(p.name)}</div>
      <div class="small muted">${cap(sp.event_type)} · ${esc(sp.city)} · ${fdate(sp.date)}${sp.date_assumed ? " (assumed)" : ""}</div>
    </div>
    <div class="stat"><b>${o.days_to_event}</b><span>days to go</span></div>
    <div class="stat"><b>${short(sp.budget_paise)}</b><span>budget · <span class="chip ${feas[0]}">${feas[1]}</span></span></div>
    <div class="stat"><b>${o.checks_passed}/${o.checks_total}</b><span>checks pass</span></div>
    <div class="grow"></div>
    <label class="f" style="min-width:210px">
      <span>Guests: <b id="gv">${sp.guests}</b> <span id="gd" class="small"></span></span>
      <input type="range" id="gslider" min="10" max="${Math.max(800, sp.guests * 2)}" step="5" value="${sp.guests}" aria-label="What-if guest count">
    </label>
    <button class="btn ghost sm" id="undo" title="Undo last applied change">Undo</button>
    <button class="btn ghost sm" id="redo" title="Redo last change">Redo</button>`;

  const homeBtn = $("#btn-top-home", t);
  if (homeBtn) homeBtn.onclick = () => go("landing");

  const sl = $("#gslider"), gv = $("#gv"), gd = $("#gd");
  const live = debounce(async () => {
    const g = +sl.value; if (g === sp.guests) { gd.innerHTML = ""; return; }
    try {
      const w = await api(`/projects/${S.pid}/whatif`, { body: { changes: { guests: g } } });
      const d = w.estimate_delta;
      gd.innerHTML = `<span class="${d > 0 ? "delta-up" : "delta-down"}">${d >= 0 ? "+" : ""}${short(d)}</span> · ${w.after.feasibility.replace("_", " ")} · <a href="#" id="gapply">apply</a>`;
      const ga = $("#gapply");
      if (ga) ga.onclick = e => { e.preventDefault(); propose({ guests: g }); };
    } catch (e) { gd.textContent = e.message; }
  }, 220);
  
  if (sl) sl.oninput = () => { gv.textContent = sl.value; live(); };
  const u = $("#undo"), r = $("#redo");
  if (u) u.onclick = () => guard(async () => { setPlan(await api(`/projects/${S.pid}/undo`, { body: {} })); toast("Undone", "ok"); });
  if (r) r.onclick = () => guard(async () => { setPlan(await api(`/projects/${S.pid}/redo`, { body: {} })); toast("Redone", "ok"); });
}

function render() {
  if (typeof Walk !== "undefined") Walk.stop();
  const app = $("#app");
  const rail = $("#rail");
  const topbar = $("#topbar");
  const fab = $("#fab");
  const v = $("#view");

  if (S.tab === "landing") {
    if (app) app.classList.add("landing-layout");
    if (rail) rail.hidden = true;
    if (topbar) topbar.hidden = true;
    if (fab) fab.hidden = true;
    
    const view = VIEWS.landing || VIEWS.home;
    v.innerHTML = view.render();
    view.bind && view.bind(v);
    return;
  }

  // Dashboard workspace mode
  if (app) app.classList.remove("landing-layout");
  if (rail) rail.hidden = false;
  renderNav();
  renderTop();

  const activeTabName = S.tab;
  let view = VIEWS[activeTabName];
  if (!view) {
    view = S.plan ? VIEWS.overview : (VIEWS.intake || VIEWS.home);
  }
  
  v.innerHTML = view.render(S.plan);
  view.bind && view.bind(v, S.plan);
  
  const chip = $("#llmchip");
  if (chip) chip.textContent = S.plan ? (S.plan.meta.llm.startsWith("enabled") ? "LLM on" : "deterministic mode") : "";
}

document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]");
  if (g) {
    e.preventDefault();
    go(g.dataset.go, g.dataset.sub);
  }
});

/* ----- change proposals: show impact before anything is applied ----- */
async function propose(changes, label) {
  return guard(async () => {
    const p = await api(`/projects/${S.pid}/propose`, { body: { changes, label } });
    showProposal(p);
    return p;
  }, "Couldn't evaluate that change");
}

function miniPlan(layout, venue, w = 380) {
  const sc = w / venue.width, h = venue.depth * sc;
  const col = typeof TYPE_COLORS !== "undefined" ? TYPE_COLORS : {};
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Floor plan preview" style="background:#fbf8f1;border:1px solid var(--line);border-radius:8px">`;
  venue.obstacles.forEach(o => s += `<rect x="${o.x * sc}" y="${o.y * sc}" width="${o.w * sc}" height="${o.h * sc}" fill="#9aa88a"/>`);
  layout.elements.forEach(e => {
    if (layout.params.shared && e.type === "seating") return;
    s += `<rect x="${e.x * sc}" y="${e.y * sc}" width="${e.w * sc}" height="${e.h * sc}" fill="${col[e.type] || "#999"}" fill-opacity=".35" stroke="${col[e.type] || "#999"}"/>`;
    if (e.w * sc > 46) s += `<text x="${e.x * sc + 3}" y="${e.y * sc + 11}" font-size="9" fill="#222">${esc(layout.params.shared && e.type === "dining" ? "Shared floor" : e.label)}</text>`;
  });
  venue.doors.forEach(d => { const [x, y] = doorPoint(venue, d); s += `<circle cx="${x * sc}" cy="${y * sc}" r="4" fill="${d.kind === "entrance" ? "#0f7b6c" : "#b3225e"}"/>`; });
  return s + "</svg>";
}

function doorPoint(v, d) { return { S: [d.pos, v.depth], N: [d.pos, 0], E: [v.width, d.pos], W: [0, d.pos] }[d.wall]; }

function showProposal(p) {
  const i = p.impact, b = i.budget, t = i.timeline, v = i.vision, c = i.critic;
  const dcl = b.delta > 0 ? "delta-up" : b.delta < 0 ? "delta-down" : "";
  const fl = x => ({ feasible: "within budget", at_risk: "tight", infeasible: "over budget" }[x] || x);
  const body = `
    <h2>Review before applying</h2>
    <p style="font-size:17px;margin:6px 0 4px">${esc(i.headline)}</p>
    ${p.notes.length ? `<div class="small muted mb">${p.notes.map(n => (n.ok ? "✓ " : "✗ ") + esc(n.text)).join("<br>")}</div>` : ""}
    <div class="grid g3 mt">
      <div class="card"><h3>Budget</h3>
        <div>Expected cost <b>${short(b.estimate_before)}</b> → <b class="${dcl}">${short(b.estimate_after)}</b></div>
        ${b.budget_before !== b.budget_after ? `<div>Total budget ${short(b.budget_before)} → ${short(b.budget_after)}</div>` : ""}
        <div class="small">${fl(b.feasibility_before)} → <b>${fl(b.feasibility_after)}</b></div>
        <div class="small">Chance of overrun ${pct(b.p_exceed_before)} → <b>${pct(b.p_exceed_after)}</b> <span class="muted">(simulated)</span></div>
        ${b.category_changes.map(c => `<div class="tiny muted">${esc(c.label)} ${c.delta > 0 ? "+" : ""}${short(c.delta)}</div>`).join("")}</div>
      <div class="card"><h3>Timeline</h3>
        <div><b>${t.moved_count}</b> task(s) move</div>
        <div class="small">Status ${esc(t.status_before)} → <b>${esc(t.status_after)}</b></div>
        ${t.newly_at_risk.length ? `<div class="small" style="color:var(--magenta)">Newly at risk: ${t.newly_at_risk.map(x => esc(x.name)).join("; ")}</div>` : ""}
        ${t.moved.slice(0, 5).map(m => `<div class="tiny muted">${esc(m.name)} ${m.start_shift_days > 0 ? "+" : ""}${m.start_shift_days}d</div>`).join("")}</div>
      <div class="card"><h3>Verification</h3>
        <div>Hard checks <b>${esc(c.before)}</b> → <b>${esc(c.after)}</b></div>
        ${v.new_failures.map(f => `<div class="small" style="color:var(--magenta)">✗ ${esc(f.title)}<br><span class="muted">${esc(f.detail)}</span></div>`).join("")}
        ${v.fixed.map(f => `<div class="small" style="color:var(--teal)">✓ now passes: ${esc(f)}</div>`).join("")}
        ${c.new.slice(0, 3).map(f => `<div class="tiny muted">New: ${esc(f.title)}</div>`).join("")}
        ${i.vendors.length ? `<div class="small mt">Vendors: ${i.vendors.map(x => `${esc(x.category)} ${x.problem ? "— " + esc(x.problem) : "top pick changes"}`).join("; ")}</div>` : ""}</div>
    </div>
    ${(v.layout_changes.length || v.theme_changed) && p.previews ? `<h3 class="mt">Layout: before → after</h3>
      <div class="grid g2"><div><div class="small muted">Before</div>${miniPlan(p.previews.before.layout, p.previews.before.venue)}</div>
      <div><div class="small muted">After${v.theme_changed ? " — " + esc(p.previews.after.layout.theme.name) : ""}</div>${miniPlan(p.previews.after.layout, p.previews.after.venue)}</div></div>` : ""}
    <div class="small muted mt">Modules recomputed: ${i.modules_recomputed.map(cap).join(", ") || "none"} · everything else was reused from cache.</div>
    <div class="row mt"><button class="btn gold" id="p-apply">Apply change</button><button class="btn ghost" id="p-cancel">Keep current plan</button></div>`;
  openModal(body);
  $("#p-cancel").onclick = () => { api(`/proposals/${p.proposal_id}/reject`, { body: {} }).catch(() => { }); closeModal(); };
  $("#p-apply").onclick = () => guard(async () => { const g = await api(`/proposals/${p.proposal_id}/apply`, { body: {} }); closeModal(); setPlan(g); toast("Applied · undo is one click away", "ok"); });
}

function openModal(html) { $("#modal").innerHTML = html; $("#overlay").classList.add("on"); $("#modal").focus?.(); }
function closeModal() { $("#overlay").classList.remove("on"); }
$("#overlay").addEventListener("click", e => { if (e.target.id === "overlay") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); $("#chat").classList.remove("on"); } });

/* ----- assistant ----- */
const SUGG = ["What are the risks?", "Make it 400 guests", "Move dining away from the entrance", "Change decoration to white and gold", "How can I save money?", "What's next?"];
function chatInit() {
  const box = $("#msgs");
  if (!box) return;
  const add = (cls, txt) => { const d = document.createElement("div"); d.className = "msg " + cls; d.textContent = txt; box.append(d); box.scrollTop = box.scrollHeight; return d; };
  $("#chat-sugg").innerHTML = SUGG.slice(0, 4).map(s => `<button class="btn ghost sm" type="button" data-q="${esc(s)}">${esc(s)}</button>`).join("");
  const send = async text => {
    if (!text.trim() || !S.pid) return;
    add("me", text); const w = add("ai", "…");
    try {
      const r = await api(`/projects/${S.pid}/chat`, { body: { message: text } });
      w.textContent = r.reply;
      if (r.proposal) { $("#chat").classList.remove("on"); showProposal(r.proposal); }
    } catch (e) { w.textContent = "Couldn't do that: " + e.message; }
  };
  $("#chat-form").onsubmit = e => { e.preventDefault(); const i = $("#chat-in"); const t = i.value; i.value = ""; send(t); };
  $("#chat-sugg").onclick = e => { const b = e.target.closest("[data-q]"); if (b) send(b.dataset.q); };
  $("#fab").onclick = () => { $("#chat").hidden = false; $("#chat").classList.add("on"); if (!box.children.length) add("ai", "Tell me what to change or ask about the plan. Changes are shown with their impact first — nothing is applied until you approve."); $("#chat-in").focus(); };
  $("#chat-x").onclick = () => $("#chat").classList.remove("on");
}
