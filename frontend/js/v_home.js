"use strict";
/* Smart intake: free text -> extracted spec (with evidence) -> adaptive questions -> editable spec -> build plan */
const SAMPLES = [
  ["Mysuru wedding", "My sister's wedding in Mysore, March, ~300 guests, ₹15L, two-day, mostly vegetarian."],
  ["Kid's birthday", "Son's 5th birthday party in Pune on 14 Feb, 40 guests, budget 1.5 lakh, pure veg, outdoor lawn, no loud music"],
  ["Community festival", "Ganesh festival for our apartment society in Hyderabad, September, 800 residents, 4.5 lakh, priorities: food and music"],
  ["Messy request", "need to organise a party for my dad's 60th, around 120 people, maybe 4 lakh?"],
];
const IN = { text: "", parsed: null, form: null, projects: [] };

function formFromParsed(p) {
  const f = p.fields;
  return {
    event_type: f.event_type || "wedding", guests: f.guests || "", budget_rupees: f.budget_paise ? f.budget_paise / 100 : "", date: f.date || "", date_assumed: !!f.date_assumed,
    city: f.city || "", days: f.days || 1, diet: f.diet || "mixed", culture: f.culture || "generic", outdoor: f.outdoor === true ? "yes" : f.outdoor === false ? "no" : "",
    priorities: f.priorities || [], avoid: f.avoid || [], celebrant_age: f.celebrant_age || "", title: "",
  };
}
VIEWS.home = {
  render() {
    const q = IN.parsed;
    return `
    <div class="hero">
      <div>
        <h1>Plan it. Check it. See it before you pay for it.</h1>
        <p class="lede">Tell EventForge about a wedding, birthday or community event in your own words. It builds the budget, timeline, vendor checklists and a walk-through of your venue, and re-checks everything the moment you change your mind.</p>
        <label class="f"><span>Describe your event</span>
          <textarea id="in-text" rows="4" placeholder="e.g. My sister's wedding in Mysore, March, about 300 guests, ₹15 lakh, two days, mostly vegetarian">${esc(IN.text)}</textarea></label>
        <div class="row mt"><button class="btn gold" id="in-go">Understand my request</button><span class="small muted">Nothing leaves this machine unless you add an LLM key.</span></div>
        <div class="mt small muted">Or try a sample:</div>
        ${SAMPLES.map((s, i) => `<button class="sample-chip" data-sample="${i}"><b>${esc(s[0])}</b> — ${esc(s[1])}</button>`).join("")}
      </div>
      <div>
        ${q ? this.formHtml(q) : `<div class="card"><h3>How it stays trustworthy</h3>
          <div class="principle">
            <div><b>Code does the sums.</b>Money is handled in whole paise and every budget is checked to add up exactly.</div>
            <div><b>Every number says why.</b>Allocations, schedules and vendor scores show their reasoning.</div>
            <div><b>Changes are previewed.</b>You see what moves, what it costs and what breaks before anything is applied, and you can undo it.</div>
            <div><b>Honest about data.</b>Vendor names, prices and ratings are sample data, and cost ranges are labelled as assumptions.</div>
          </div></div>
          ${IN.projects.length ? `<div class="card mt"><h3>Open a saved plan</h3>${IN.projects.map(p => `<button class="sample-chip" data-open="${p.id}"><b>${esc(p.name)}</b> <span class="muted small">${esc(p.created.slice(0, 10))}</span></button>`).join("")}</div>` : ""}`}
      </div>
    </div>`;
  },
  formHtml(p) {
    const f = IN.form, miss = new Set(p.missing);
    const need = k => miss.has(k) && (f[k] === "" || f[k] === undefined) ? ' style="border-color:var(--marigold);background:var(--marigold-bg)"' : "";
    return `<div class="card"><h3>Here's what I understood</h3>
      ${p.assumptions.length ? `<div class="callout warn small mb">${p.assumptions.map(esc).join("<br>")}</div>` : ""}
      <div class="grid g2">
        <label class="f">Event type<select id="f-event_type">${["wedding", "birthday", "community"].map(v => `<option ${f.event_type === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="f">City<input id="f-city" list="cities" value="${esc(f.city)}"${need("city")}></label>
        <label class="f">Guests<input id="f-guests" type="number" min="1" max="5000" value="${esc(f.guests)}"${need("guests")}></label>
        <label class="f">Budget (₹)<input id="f-budget" type="number" min="1000" step="1000" value="${esc(f.budget_rupees)}"${need("budget_paise")}></label>
        <label class="f">Date${f.date_assumed ? " (assumed — please confirm)" : ""}<input id="f-date" type="date" value="${esc(f.date)}"${need("date")}></label>
        <label class="f">Days of functions<input id="f-days" type="number" min="1" max="7" value="${esc(f.days)}"></label>
        <label class="f">Food<select id="f-diet">${[["veg", "Vegetarian"], ["mostly_veg", "Mostly vegetarian"], ["mixed", "Mixed"], ["nonveg", "Non-vegetarian"], ["jain", "Jain"]].map(([v, l]) => `<option value="${v}" ${f.diet === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="f">Tradition<select id="f-culture">${["generic", "kannada", "telugu", "tamil", "malayali", "north_indian", "muslim", "christian"].map(v => `<option value="${v}" ${f.culture === v ? "selected" : ""}>${cap(v)}</option>`).join("")}</select></label>
        <label class="f">Venue type<select id="f-outdoor"><option value="">No preference</option><option value="no" ${f.outdoor === "no" ? "selected" : ""}>Indoor hall</option><option value="yes" ${f.outdoor === "yes" ? "selected" : ""}>Outdoor / lawn</option></select></label>
        <label class="f">Celebrant's age (birthdays)<input id="f-age" type="number" min="1" max="120" value="${esc(f.celebrant_age)}"></label>
      </div>
      <div class="mt small"><b>What matters most?</b> <span class="muted">(first ticked = top priority)</span><div class="row mt">
        ${["food", "decor", "photography", "music", "venue"].map(v => `<label class="row tight"><input type="checkbox" data-pri="${v}" ${f.priorities.includes(v) ? "checked" : ""}> ${v}</label>`).join("")}</div></div>
      <div class="mt small"><b>Avoid</b><div class="row mt">
        ${["loud music", "alcohol", "firecrackers"].map(v => `<label class="row tight"><input type="checkbox" data-avoid="${v}" ${f.avoid.includes(v) ? "checked" : ""}> ${v}</label>`).join("")}</div></div>
      ${p.questions.filter(q => !q.required || miss.has(q.field)).slice(0, 4).length ? `<div class="mt small"><b>Still open</b><ul style="margin:6px 0 0 18px;padding:0">${p.questions.slice(0, 4).map(q => `<li>${esc(q.question)}</li>`).join("")}</ul></div>` : ""}
      <div class="row mt"><button class="btn gold" id="in-build">Build my plan</button><span id="in-err" class="small" style="color:var(--magenta)"></span></div>
      <datalist id="cities">${["Bengaluru", "Mysuru", "Mumbai", "Pune", "Delhi", "Hyderabad", "Chennai", "Kochi", "Kolkata", "Jaipur", "Ahmedabad", "Lucknow", "Coimbatore", "Nagpur", "Indore", "Udaipur", "Mangaluru"].map(c => `<option>${c}</option>`).join("")}</datalist>
    </div>`;
  },
  bind(root) {
    const ta = $("#in-text", root);
    ta.oninput = () => IN.text = ta.value;
    const parse = async txt => guard(async () => { IN.text = txt; IN.parsed = await api("/intake", { body: { text: txt } }); IN.form = formFromParsed(IN.parsed); render(); });
    $("#in-go", root).onclick = () => ta.value.trim() ? parse(ta.value) : toast("Describe your event first", "bad");
    $$("[data-sample]", root).forEach(b => b.onclick = () => parse(SAMPLES[+b.dataset.sample][1]));
    $$("[data-open]", root).forEach(b => b.onclick = () => guard(async () => setPlan(await api("/projects/" + b.dataset.open))));
    if (!IN.parsed) { api("/projects").then(r => { if (JSON.stringify(r.projects) !== JSON.stringify(IN.projects)) { IN.projects = r.projects; if (S.tab === "home" && !IN.parsed) render(); } }).catch(() => { }); return; }
    const f = IN.form, bind = (id, k, fn = v => v) => { const el = $("#" + id, root); if (el) el.oninput = el.onchange = () => { f[k] = fn(el.value); if (k === "date") f.date_assumed = false; }; };
    bind("f-event_type", "event_type"); bind("f-city", "city"); bind("f-guests", "guests", v => v === "" ? "" : +v); bind("f-budget", "budget_rupees", v => v === "" ? "" : +v);
    bind("f-date", "date"); bind("f-days", "days", v => +v || 1); bind("f-diet", "diet"); bind("f-culture", "culture"); bind("f-outdoor", "outdoor"); bind("f-age", "celebrant_age", v => v === "" ? "" : +v);
    $$("[data-pri]", root).forEach(c => c.onchange = () => { f.priorities = f.priorities.filter(x => x !== c.dataset.pri); if (c.checked) f.priorities.push(c.dataset.pri); });
    $$("[data-avoid]", root).forEach(c => c.onchange = () => { f.avoid = f.avoid.filter(x => x !== c.dataset.avoid); if (c.checked) f.avoid.push(c.dataset.avoid); });
    $("#in-build", root).onclick = () => {
      const miss = [];
      if (!f.city) miss.push("city"); if (!f.guests) miss.push("guests"); if (!f.budget_rupees) miss.push("budget"); if (!f.date) miss.push("date");
      if (miss.length) { $("#in-err", root).textContent = "Please fill in: " + miss.join(", "); return; }
      const fields = { event_type: f.event_type, city: f.city, guests: +f.guests, budget_paise: Math.round(f.budget_rupees * 100), date: f.date, date_assumed: f.date_assumed,
        days: +f.days || 1, diet: f.diet, culture: f.culture, priorities: f.priorities, avoid: f.avoid };
      if (f.outdoor) fields.outdoor = f.outdoor === "yes";
      if (f.celebrant_age) fields.celebrant_age = +f.celebrant_age;
      guard(async () => {
        const name = { wedding: "Wedding", birthday: "Birthday", community: "Community event" }[f.event_type] + " · " + f.city;
        const pkg = await api("/projects", { body: { fields, name } });
        IN.parsed = null; S.tab = "overview"; setPlan(pkg); toast("Plan built — everything below was computed from your inputs", "ok");
      }, "Couldn't build the plan");
    };
  },
};
