"use strict";
/* EventForge Event Intake & Creator Experience */

const INTAKE_SAMPLES = [
  ["Mysuru Wedding", "My sister's wedding in Mysore, March, ~300 guests, ₹15L, two-day, mostly vegetarian."],
  ["Son's 5th Birthday", "Son's 5th birthday party in Pune on 14 Feb, 40 guests, budget 1.5 lakh, pure veg, outdoor lawn, no loud music"],
  ["Society Festival", "Ganesh festival for our apartment society in Hyderabad, September, 800 residents, 4.5 lakh, priorities: food and music"],
  ["Corporate Summit", "Annual company awards gala in Bengaluru, December, 250 attendees, ₹8 lakh budget, indoor banquet, mixed dining, audiovisual stage"],
  ["Messy Milestone Request", "need to organise a party for my dad's 60th, around 120 people, maybe 4 lakh?"]
];

const IN = {
  text: "",
  parsed: null,
  form: null,
  projects: []
};

function formFromParsed(p) {
  const f = p.fields;
  return {
    event_type: f.event_type || "wedding",
    guests: f.guests || "",
    budget_rupees: f.budget_paise ? f.budget_paise / 100 : "",
    date: f.date || "",
    date_assumed: !!f.date_assumed,
    city: f.city || "",
    days: f.days || 1,
    diet: f.diet || "mixed",
    culture: f.culture || "generic",
    outdoor: f.outdoor === true ? "yes" : f.outdoor === false ? "no" : "",
    priorities: f.priorities || ["food", "decor"],
    avoid: f.avoid || [],
    celebrant_age: f.celebrant_age || "",
    title: ""
  };
}

VIEWS.intake = {
  render() {
    const q = IN.parsed;
    if (!IN.form) {
      IN.form = {
        event_type: "wedding",
        guests: 300,
        budget_rupees: 1500000,
        date: "2027-03-15",
        date_assumed: false,
        city: "Mysuru",
        days: 2,
        diet: "mostly_veg",
        culture: "kannada",
        outdoor: "",
        priorities: ["food", "decor"],
        avoid: [],
        celebrant_age: "",
        title: ""
      };
    }
    const f = IN.form;

    return `
    <div class="sect">
      <div class="row" style="margin-bottom:8px">
        <h1 class="grow">✨ Create a New Celebration Plan</h1>
        <button class="btn ghost sm" id="btn-back-home">← Back to Homepage</button>
      </div>
      <p class="muted">
        Describe your celebration in your own words, or customize the structured parameters below. EventForge extracts constraints, verifies safety bounds, and computes exact allocations with zero fake data.
      </p>
    </div>

    <div class="grid g-side mt">
      <div class="col">
        <!-- Natural Language Intake Box -->
        <div class="card" style="border:1px solid #d4af37;background:linear-gradient(180deg,#fffdf9,#ffffff)">
          <div class="row">
            <h3 class="grow" style="color:#0f172a;margin:0">🧠 Natural Language Intake</h3>
            <span class="chip ok">Neuro-Symbolic Parser</span>
          </div>
          <p class="small muted" style="margin:4px 0 10px">
            Type anything in freeform English. The parser extracts dates, guest counts, budget limits, city, and cultural preferences:
          </p>
          <label class="f">
            <textarea id="intake-text" rows="3" placeholder="e.g. My sister's wedding in Mysore, March, about 300 guests, ₹15 lakh, two days, mostly vegetarian">${esc(IN.text)}</textarea>
          </label>
          <div class="row mt">
            <button class="btn gold sm" id="intake-parse-btn">Parse &amp; Extract Fields</button>
            <span class="tiny muted">Deterministic offline parser with evidence extraction.</span>
          </div>

          <div class="mt small">
            <b class="muted">Or click a sample scenario:</b>
            <div class="row mt" style="gap:6px">
              ${INTAKE_SAMPLES.map((s, i) => `
                <button class="sample-chip" data-sample-intake="${i}">
                  <b>${esc(s[0])}</b>
                </button>
              `).join("")}
            </div>
          </div>
        </div>

        <!-- Structured Form Section -->
        <div class="card mt">
          <div class="row">
            <h3 class="grow" style="margin:0">📋 Event Specifications</h3>
            <span class="chip info">Validated Model</span>
          </div>
          <p class="small muted" style="margin:4px 0 14px">
            Fine-tune the parameters before generating the plan. Every input directly shapes the budget, vendor recommendations, and venue layout:
          </p>

          ${q && q.assumptions && q.assumptions.length ? `
            <div class="callout warn small mb">
              <b>Extracted Assumptions:</b><br>
              ${q.assumptions.map(esc).join("<br>")}
            </div>
          ` : ""}

          <div class="grid g2">
            <label class="f">Event Type
              <select id="f-event_type">
                ${[["wedding", "Wedding Ceremony & Reception"], ["birthday", "Birthday Milestone Party"], ["community", "Community Festival / Utsav"], ["corporate", "Corporate Summit & Gala"]].map(([v, l]) => `
                  <option value="${v}" ${f.event_type === v ? "selected" : ""}>${l}</option>
                `).join("")}
              </select>
            </label>

            <label class="f">City / Destination
              <input id="f-city" list="cities-list" value="${esc(f.city)}" placeholder="e.g. Mysuru, Bengaluru, Mumbai">
            </label>

            <label class="f">Guest Count
              <input id="f-guests" type="number" min="10" max="5000" value="${esc(f.guests)}" placeholder="e.g. 300">
            </label>

            <label class="f">Total Budget (₹)
              <input id="f-budget" type="number" min="10000" step="10000" value="${esc(f.budget_rupees)}" placeholder="e.g. 1500000">
            </label>

            <label class="f">Target Event Date ${f.date_assumed ? '<span class="text-amber">(assumed)</span>' : ""}
              <input id="f-date" type="date" value="${esc(f.date)}">
            </label>

            <label class="f">Duration (Days)
              <input id="f-days" type="number" min="1" max="7" value="${esc(f.days)}">
            </label>

            <label class="f">Food &amp; Catering Style
              <select id="f-diet">
                ${[["veg", "Pure Vegetarian"], ["mostly_veg", "Mostly Vegetarian (Veg + Sweets)"], ["mixed", "Mixed (Veg & Non-Veg Counters)"], ["nonveg", "Non-Vegetarian Focused"], ["jain", "Jain (No Root Veg)"]].map(([v, l]) => `
                  <option value="${v}" ${f.diet === v ? "selected" : ""}>${l}</option>
                `).join("")}
              </select>
            </label>

            <label class="f">Cultural Tradition
              <select id="f-culture">
                ${["generic", "kannada", "telugu", "tamil", "malayali", "north_indian", "muslim", "christian"].map(v => `
                  <option value="${v}" ${f.culture === v ? "selected" : ""}>${cap(v)}</option>
                `).join("")}
              </select>
            </label>

            <label class="f">Venue Preference
              <select id="f-outdoor">
                <option value="">No preference / Auto select</option>
                <option value="no" ${f.outdoor === "no" ? "selected" : ""}>Indoor AC Banquet / Mantapa</option>
                <option value="yes" ${f.outdoor === "yes" ? "selected" : ""}>Outdoor Lawn / Courtyard</option>
              </select>
            </label>

            <label class="f">Celebrant Age (Birthdays)
              <input id="f-age" type="number" min="1" max="120" value="${esc(f.celebrant_age)}" placeholder="e.g. 5 or 50">
            </label>
          </div>

          <div class="mt small">
            <b>Budget &amp; Planning Priorities:</b> <span class="muted">(Checked areas receive higher weighting)</span>
            <div class="row mt" style="gap:12px">
              ${["food", "decor", "photography", "music", "venue"].map(v => `
                <label class="row tight" style="font-weight:600">
                  <input type="checkbox" data-pri-intake="${v}" ${f.priorities && f.priorities.includes(v) ? "checked" : ""}> ${cap(v)}
                </label>
              `).join("")}
            </div>
          </div>

          <div class="mt small">
            <b>Constraints to Avoid:</b>
            <div class="row mt" style="gap:12px">
              ${["loud music", "alcohol", "firecrackers"].map(v => `
                <label class="row tight" style="font-weight:600">
                  <input type="checkbox" data-avoid-intake="${v}" ${f.avoid && f.avoid.includes(v) ? "checked" : ""}> ${cap(v)}
                </label>
              `).join("")}
            </div>
          </div>

          <div class="row mt" style="gap:14px;padding-top:10px;border-top:1px solid #e2e8f0">
            <button class="btn gold lg pulse-btn" id="intake-build-btn">
              <span>🚀 Generate &amp; Verify Plan</span>
              <span class="btn-arrow">→</span>
            </button>
            <span id="intake-err" class="small" style="color:var(--magenta);font-weight:600"></span>
          </div>

          <datalist id="cities-list">
            ${["Bengaluru", "Mysuru", "Mumbai", "Pune", "Delhi", "Hyderabad", "Chennai", "Kochi", "Kolkata", "Jaipur", "Ahmedabad", "Lucknow", "Coimbatore", "Nagpur", "Indore", "Udaipur", "Mangaluru"].map(c => `
              <option value="${c}"></option>
            `).join("")}
          </datalist>
        </div>
      </div>

      <!-- Right Column: Verification Proof & Saved Plans -->
      <div class="col">
        <div class="card" style="background:#f8fafc">
          <div class="row">
            <h3 class="grow" style="margin:0">🔒 Deterministic Engine Guarantees</h3>
            <span class="chip ok">Safe by Design</span>
          </div>
          <div class="col mt" style="gap:10px">
            <div class="finding" style="background:#fff;margin:0">
              <b>1. Exact Whole-Paise Arithmetic</b>
              <div class="tiny muted">No floating-point approximations. Every budget category and tax line item sums to the exact total.</div>
            </div>
            <div class="finding" style="background:#fff;margin:0">
              <b>2. Graph-Theoretic Timeline</b>
              <div class="tiny muted">Calculates critical path and minimum slack days. Tasks cannot be scheduled before dependencies finish.</div>
            </div>
            <div class="finding" style="background:#fff;margin:0">
              <b>3. Spatial Egress &amp; Capacity Check</b>
              <div class="tiny muted">Checks 1.8m exit clearances and 0.8m²/person seating density so physical venues are never overloaded.</div>
            </div>
            <div class="finding" style="background:#fff;margin:0">
              <b>4. 3D Digital Twin</b>
              <div class="tiny muted">Decorated wedding stages, floral mandaps, and guest tables that stay 100% synchronized with the 2D floor plan.</div>
            </div>
          </div>
        </div>

        ${IN.projects && IN.projects.length ? `
          <div class="card mt">
            <h3>📂 Open a Saved Plan</h3>
            <p class="small muted">Resume editing previously generated celebration plans:</p>
            <div class="col mt" style="gap:6px">
              ${IN.projects.map(p => `
                <button class="sample-chip row" data-open-proj="${p.id}" style="justify-content:space-between">
                  <b>${esc(p.name)}</b>
                  <span class="small muted">${esc(p.created.slice(0, 10))}</span>
                </button>
              `).join("")}
            </div>
          </div>
        ` : ""}
      </div>
    </div>`;
  },

  bind(root) {
    const ta = $("#intake-text", root);
    if (ta) ta.oninput = () => IN.text = ta.value;

    const parse = async (txt) => {
      guard(async () => {
        IN.text = txt;
        IN.parsed = await api("/intake", { body: { text: txt } });
        IN.form = formFromParsed(IN.parsed);
        render();
        toast("Request parsed into structured fields", "ok");
      });
    };

    const bindBtn = (id, fn) => { const el = $(id, root); if (el) el.onclick = fn; };

    bindBtn("#btn-back-home", () => {
      S.tab = "landing";
      render();
    });

    bindBtn("#intake-parse-btn", () => {
      if (ta && ta.value.trim()) parse(ta.value);
      else toast("Please describe your event in the text box first", "bad");
    });

    $$("[data-sample-intake]", root).forEach(b => {
      b.onclick = () => {
        const sample = INTAKE_SAMPLES[+b.dataset.sampleIntake];
        parse(sample[1]);
      };
    });

    $$("[data-open-proj]", root).forEach(b => {
      b.onclick = () => {
        guard(async () => {
          setPlan(await api("/projects/" + b.dataset.openProj));
          S.tab = "overview";
          render();
          toast("Project loaded", "ok");
        });
      };
    });

    const f = IN.form;
    const bindField = (id, k, fn = v => v) => {
      const el = $("#" + id, root);
      if (el) el.oninput = el.onchange = () => {
        f[k] = fn(el.value);
        if (k === "date") f.date_assumed = false;
      };
    };

    bindField("f-event_type", "event_type");
    bindField("f-city", "city");
    bindField("f-guests", "guests", v => v === "" ? "" : +v);
    bindField("f-budget", "budget_rupees", v => v === "" ? "" : +v);
    bindField("f-date", "date");
    bindField("f-days", "days", v => +v || 1);
    bindField("f-diet", "diet");
    bindField("f-culture", "culture");
    bindField("f-outdoor", "outdoor");
    bindField("f-age", "celebrant_age", v => v === "" ? "" : +v);

    $$("[data-pri-intake]", root).forEach(c => {
      c.onchange = () => {
        f.priorities = (f.priorities || []).filter(x => x !== c.dataset.priIntake);
        if (c.checked) f.priorities.push(c.dataset.priIntake);
      };
    });

    $$("[data-avoid-intake]", root).forEach(c => {
      c.onchange = () => {
        f.avoid = (f.avoid || []).filter(x => x !== c.dataset.avoidIntake);
        if (c.checked) f.avoid.push(c.dataset.avoidIntake);
      };
    });

    bindBtn("#intake-build-btn", () => {
      const miss = [];
      if (!f.city) miss.push("City");
      if (!f.guests) miss.push("Guest count");
      if (!f.budget_rupees) miss.push("Budget");
      if (!f.date) miss.push("Date");

      if (miss.length) {
        $("#intake-err", root).textContent = "Please fill in: " + miss.join(", ");
        return;
      }

      const fields = {
        event_type: f.event_type,
        city: f.city,
        guests: +f.guests,
        budget_paise: Math.round(f.budget_rupees * 100),
        date: f.date,
        date_assumed: f.date_assumed,
        days: +f.days || 1,
        diet: f.diet,
        culture: f.culture,
        priorities: f.priorities || [],
        avoid: f.avoid || []
      };

      if (f.outdoor) fields.outdoor = f.outdoor === "yes";
      if (f.celebrant_age) fields.celebrant_age = +f.celebrant_age;

      guard(async () => {
        toast("Computing deterministic budget, schedule, and venue digital twin…");
        const typeLabels = { wedding: "Wedding", birthday: "Birthday", community: "Community Festival", corporate: "Corporate Gala" };
        const name = (typeLabels[f.event_type] || "Celebration") + " · " + f.city;
        const pkg = await api("/projects", { body: { fields, name } });
        IN.parsed = null;
        setPlan(pkg);
        S.tab = "overview";
        render();
        toast("Plan built successfully! Welcome to your dashboard", "ok");
      }, "Couldn't build the plan");
    });

    // Refresh projects list in background
    api("/projects").then(r => {
      if (r && r.projects && JSON.stringify(r.projects) !== JSON.stringify(IN.projects)) {
        IN.projects = r.projects;
        if (S.tab === "intake") render();
      }
    }).catch(() => {});
  }
};
VIEWS.home = VIEWS.intake;

