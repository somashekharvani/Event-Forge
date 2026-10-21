"use strict";
VIEWS.community = {
  render(p) {
    return `
    <div class="sect"><h1>Community toolkit</h1><p class="muted">Volunteer rosters, permits, sponsorship and crowd/food estimates. Quantities are rules of thumb — confirm with your caterer, venue and local authority.</p></div>
    <div class="grid g2">
      <div class="card"><h3>Crowd, food &amp; facilities</h3>
        <div class="row"><label class="f">Expected turnout vs invited (%)<input id="e-pct" type="number" value="100" min="10" max="300"></label><label class="f">Meals<input id="e-meals" type="number" value="1" min="1" max="4"></label><button class="btn sm" id="e-go">Estimate</button></div>
        <div id="e-out" class="mt small muted">Run the estimate.</div></div>
      <div class="card"><h3>Volunteer roster</h3>
        <div class="row"><label class="f">Shift length (h)<input id="r-sl" type="number" value="3" min="1" max="8"></label><label class="f">Volunteers (blank = auto)<input id="r-n" type="number" min="1" placeholder="auto"></label><label class="f">Max hours each<input id="r-mh" type="number" value="6"></label><button class="btn sm" id="r-go">Build roster</button></div>
        <div id="r-out" class="mt small muted">Build a roster.</div></div>
      <div class="card"><h3>Permits &amp; safety</h3>
        <div class="row"><label class="row tight"><input type="checkbox" id="pm-loud" checked> Loudspeakers</label><label class="row tight"><input type="checkbox" id="pm-food" checked> Food stalls</label><button class="btn sm" id="pm-go">Show checklist</button></div>
        <div id="pm-out" class="mt small muted">Generic guidance — rules vary by city; verify with local authorities.</div></div>
      <div class="card"><h3>Sponsorship pitch</h3>
        <div class="row"><input id="s-org" placeholder="Your organisation" class="grow"><input id="s-imp" placeholder="Impact (e.g. free meals, cultural programme)" class="grow"><button class="btn sm" id="s-go">Draft</button></div>
        <div id="s-out" class="mt small muted">Tiers add up to the target in whole paise.</div></div>
    </div>`;
  },
  bind(root, p) {
    const post = (path, body) => api(`/projects/${S.pid}/community/${path}`, { body });
    $("#e-go", root).onclick = () => guard(async () => {
      const r = await post("estimate", { attendance_pct: +$("#e-pct", root).value, meals: +$("#e-meals", root).value }), f = r.food;
      $("#e-out", root).innerHTML = `<div class="grid g3"><div class="kpi"><b>${r.expected_attendance}</b><span>expected people</span></div><div class="kpi"><b>${r.peak_concurrent}</b><span>at peak</span></div><div class="kpi"><b>${f.plates}</b><span>plates</span></div></div>
        <table class="mt"><tbody>${[["Rice (cooked)", f.rice_cooked_kg + " kg"], ["Dal / sambar", f.dal_sambar_l + " L"], ["Veg curry", f.veg_curry_kg + " kg"], ["Sweets", f.sweet_pieces + " pcs"], ["Water", f.water_litres + " L"], ["Buffet lines", r.buffet_lines], ["Toilets", r.toilets], ["Handwash points", r.handwash_points], ["Dustbins", r.dustbins], ["Volunteers suggested", r.volunteers_suggested]].map(([a, b]) => `<tr><td>${a}</td><td class="right"><b>${b}</b></td></tr>`).join("")}</tbody></table>
        <div class="tiny muted mt">${r.assumptions.map(esc).join("<br>")}</div>`;
    });
    $("#r-go", root).onclick = () => guard(async () => {
      const n = $("#r-n", root).value, r = await post("roster", { shift_len: +$("#r-sl", root).value, max_hours: +$("#r-mh", root).value, volunteers: n ? +n : null });
      $("#r-out", root).innerHTML = r.shifts.map(s => `<div class="finding"><b>${esc(s.shift)}</b>${s.roles.map(x => `<div class="tiny"><b>${esc(x.role)}</b> (${x.assigned.length}/${x.needed}): ${x.assigned.map(esc).join(", ")}</div>`).join("")}</div>`).join("") +
        (r.summary || r.hours ? `<div class="tiny muted">${esc(JSON.stringify(r.summary || r.hours)).slice(0, 300)}</div>` : "");
    });
    $("#pm-go", root).onclick = () => guard(async () => {
      const r = await post("permits", { loud: $("#pm-loud", root).checked, food_stalls: $("#pm-food", root).checked });
      $("#pm-out", root).innerHTML = `<div>Size class: <b>${esc(r.size_class)}</b></div>` + r.permits.filter(x => x.applies).map(x => `<label class="row tight" style="align-items:flex-start;margin:4px 0"><input type="checkbox"> <span>${esc(x.item)} <span class="chip">${esc(x.when)}</span></span></label>`).join("") +
        (r.safety ? `<b class="mt" style="display:block">Safety</b>${r.safety.map(x => `<div class="tiny">• ${esc(x)}</div>`).join("")}` : "");
    });
    $("#s-go", root).onclick = () => guard(async () => {
      const r = await post("sponsor", { org: $("#s-org", root).value || "Our community group", impact: $("#s-imp", root).value });
      $("#s-out", root).innerHTML = `<div>Target <b>${inr(r.target)}</b></div><table><tbody>${r.tiers.map(t => `<tr><td>${esc(t.tier)} × ${t.slots}</td><td class="right">${inr(t.amount)}</td></tr>`).join("")}</tbody></table><textarea rows="9" class="mt">${esc(r.pitch)}</textarea>`;
    });
  },
};
