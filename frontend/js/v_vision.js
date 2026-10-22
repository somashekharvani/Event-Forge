"use strict";
/* EventForge Vision studio: venue fit, photo/dimensions, editable floor plan with live validation, NL commands, walkthrough */
const VS = { sel: null, edits: null, orig: null, val: null, drag: null, photo: null, key: null, mode: "3d" };
const LAB_T = { stage: "Stage", mandap: "Mandap", seating: "Seating", dining: "Dining", buffet: "Buffet", dance_floor: "Dance floor", activity: "Activity", reg_desk: "Registration", photo_booth: "Photo booth", first_aid: "First aid", kitchen: "Kitchen", backstage: "Backstage" };

VIEWS.vision = {
  render(p) {
    const vis = p.vision, v = vis.venue, L = vis.layout, key = p.name + S.version;
    if (VS.key !== key) {
      VS.key = key;
      VS.edits = JSON.parse(JSON.stringify(L.elements));
      VS.orig = JSON.parse(JSON.stringify(L.elements));
      VS.val = vis.validation;
      VS.sel = null;
    }
    const val = VS.val, fails = val.checks.filter(c => c.status !== "pass");
    const moved = this.moved();

    return `
    <div class="sect">
      <div class="row" style="margin-bottom:6px">
        <h1 class="grow">🏛️ Cinematic Vision Studio</h1>
        <span class="chip ${val.ok ? "ok" : "bad"}" id="vs-badge">${val.summary.pass}/${val.summary.total} checks pass</span>
      </div>
      <p class="muted">
        Explore your celebration venue in photorealistic 3D, take an eye-level walkthrough down the decorated aisle, or edit furniture on the 2D architectural blueprint with real-time clearance and egress validation.
      </p>
    </div>

    <!-- Main Workspace Switcher (3D Venue vs 2D Floor Plan) -->
    <div class="tabs mt" style="margin-bottom:16px">
      <button class="${VS.mode === '3d' ? 'active' : ''}" id="tab-v-3d">✨ 3D Realistic Venue &amp; Walkthrough</button>
      <button class="${VS.mode === '2d' ? 'active' : ''}" id="tab-v-2d">📐 2D Architectural Blueprint (Drag &amp; Drop)</button>
    </div>

    <div class="grid g-side">
      <div class="col">
        <!-- 3D Realistic Venue Container -->
        <div class="card" id="box-v-3d" style="display:${VS.mode === '3d' ? 'block' : 'none'};padding:14px">
          <div class="row mb" style="justify-content:space-between">
            <h3 style="margin:0">${esc(v.name)} — Realistic 3D Preview</h3>
            <span class="tiny muted">${v.width} × ${v.depth}m · ${v.indoor ? "Indoor Banquet" : "Outdoor Lawn"} · Theme: <b style="color:${(L.theme && L.theme.palette[1]) || '#d4af37'}">${esc(L.theme ? L.theme.name : "Royal Gold")}</b></span>
          </div>
          <div id="walk-box"></div>
        </div>

        <!-- 2D Architectural Floor Plan Container -->
        <div class="card" id="box-v-2d" style="display:${VS.mode === '2d' ? 'block' : 'none'}">
          <div class="row">
            <h3 class="grow" style="margin:0">${esc(v.name)} <span class="muted small">${v.width} × ${v.depth} m</span></h3>
            <span class="small muted">Drag items to test clearance</span>
          </div>
          <div id="vs-svg" class="mt">${this.svg(v, L)}</div>
          <div class="legend small mt">
            ${[...new Set(VS.edits.map(e => e.type))].map(t => `<span><i class="swatch" style="background:${TYPE_COLORS[t] || "#999"}"></i> ${LAB_T[t] || t}</span>`).join(" ")}
            <span><i class="swatch" style="background:#0f7b6c;border-radius:50%"></i> entrance</span>
            <span><i class="swatch" style="background:#b3225e;border-radius:50%"></i> exit</span>
          </div>
          <div class="row mt" style="gap:8px">
            <button class="btn gold sm" id="vs-save" ${moved.length ? "" : "disabled"}>Save ${moved.length} moved item(s)</button>
            <button class="btn ghost sm" id="vs-undo" ${moved.length ? "" : "disabled"}>Discard my moves</button>
            <button class="btn ghost sm" id="vs-reset">Reset to automatic layout</button>
          </div>
        </div>

        <!-- Natural Language Command Box -->
        <div class="card mt">
          <div class="row">
            <h3 class="grow" style="margin:0">💬 Natural Language Venue Director</h3>
            <span class="chip ok">Instant Sandboxing</span>
          </div>
          <p class="small muted" style="margin:4px 0 10px">
            Instruct the digital twin in plain English. EventForge parses commands, verifies spatial safety, and previews before applying:
          </p>
          <div class="row">
            <input id="vs-cmd" class="grow" placeholder="e.g. move dining away from the entrance · make the stage bigger · add a photo booth · change theme to royal gold">
            <button class="btn gold sm" id="vs-go">Preview Change</button>
          </div>
          <div class="row mt" style="gap:6px">
            <span class="tiny bold muted">Try:</span>
            <button class="btn ghost sm" data-cmd-sugg="move dining away from the entrance">Move dining away</button>
            <button class="btn ghost sm" data-cmd-sugg="make the stage bigger">Enlarge stage</button>
            <button class="btn ghost sm" data-cmd-sugg="change decoration to white and gold">Royal Gold theme</button>
          </div>
        </div>
      </div>

      <!-- Right Column: Safety Checks, Selected Item & Venue Selector -->
      <div class="col">
        <div class="card">
          <div class="row"><h3 class="grow" style="margin:0">🛡️ Spatial Safety Verification</h3><span class="chip ${val.ok ? 'ok' : 'bad'}">${val.summary.pass}/${val.summary.total} Pass</span></div>
          <p class="tiny muted" style="margin:4px 0 10px">Deterministic clearance, exit path, and occupant density rules:</p>
          <div id="vs-checks">${this.checks(val)}</div>
        </div>

        <div class="card" id="vs-insp">
          <h3>Selected Item Geometry</h3>
          ${this.inspector()}
        </div>

        <div class="card">
          <h3>Venue Templates for ${p.spec.guests} Guests</h3>
          <div class="col mt" style="gap:6px">
            ${p.venue_fit.map(f => `
              <div class="row" style="margin:3px 0;padding:6px;background:${f.id === v.id ? '#fefdf8' : '#fff'};border:1px solid ${f.id === v.id ? 'var(--gold)' : '#e2e8f0'};border-radius:6px">
                <span class="chip ${f.fits ? "ok" : "bad"}">${f.fits ? "fits" : f.fails + " fail"}</span>
                <span class="grow ${f.id === v.id ? "bold text-gold" : "small"}">${esc(f.name)}</span>
                <span class="tiny muted">${f.width}×${f.depth}m · ${f.fill_pct}% full</span>
                ${f.id === v.id ? '<span class="chip sm ok">Active</span>' : `<button class="btn ghost sm" data-venue="${f.id}">Use</button>`}
              </div>
            `).join("")}
          </div>

          <h3 class="mt" style="margin-top:20px">Custom Venue Dimensions</h3>
          <p class="tiny muted">Enter exact physical measurements from your site visit:</p>
          <div class="grid g2 mt">
            <label class="f">Width (m)<input id="cv-w" type="number" min="5" max="200" value="${v.width}"></label>
            <label class="f">Depth (m)<input id="cv-d" type="number" min="5" max="200" value="${v.depth}"></label>
          </div>
          <label class="f mt">Base Door Pattern
            <select id="cv-t">
              ${p.venue_fit.map(f => `<option value="${f.id}" ${f.id === v.id ? "selected" : ""}>${esc(f.name)}</option>`).join("")}
            </select>
          </label>
          <button class="btn ghost sm mt" id="cv-go">Apply Custom Dimensions</button>
        </div>
      </div>
    </div>`;
  },

  moved() {
    if (!VS.edits) return [];
    return VS.edits.filter(e => {
      const o = VS.orig.find(x => x.id === e.id);
      return o && (Math.abs(o.x - e.x) > .01 || Math.abs(o.y - e.y) > .01 || Math.abs(o.w - e.w) > .01 || Math.abs(o.h - e.h) > .01);
    });
  },

  checks(val) {
    const fs = val.checks.filter(c => c.status !== "pass"), ok = val.checks.filter(c => c.status === "pass");
    return (fs.length ? fs.map(c => `
      <div class="check">
        <span class="dot ${c.status}"></span>
        <div>
          <b>${esc(c.title)}</b>
          <div class="tiny muted">${esc(c.detail)}</div>
          ${c.fix ? `<div class="tiny" style="color:var(--magenta)">Fix: ${esc(c.fix)}</div>` : ""}
        </div>
      </div>`).join("") : '<div class="callout ok small">Every spatial layout check passes.</div>') +
      `<details class="mt"><summary class="small">${ok.length} passing checks</summary>${ok.map(c => `<div class="check"><span class="dot pass"></span><div class="small">${esc(c.title)}<div class="tiny muted">${esc(c.detail)}</div></div></div>`).join("")}</details>` +
      `<div class="tiny muted mt" style="border-top:1px solid #e2e8f0;padding-top:6px">Seating capacity ${val.metrics.zone_capacity.seating ?? "–"} · Dining ${val.metrics.zone_capacity.dining ?? "–"} · Floor fill ${val.metrics.fill_pct}%.</div>`;
  },

  inspector() {
    const e = VS.edits && VS.edits.find(x => x.id === VS.sel);
    if (!e) return '<div class="small muted">Click any element on the floor plan to inspect its coordinates.</div>';
    const f = (k, l) => `<label class="f">${l}<input type="number" step=".25" data-f="${k}" value="${(+e[k]).toFixed(2)}"></label>`;
    return `
      <div class="row mb"><b class="grow">${esc(e.label)}</b><span class="chip">${esc(e.type)}</span></div>
      <div class="grid g2">${f("x", "X pos (m)")}${f("y", "Y pos (m)")}${f("w", "Width (m)")}${f("h", "Depth (m)")}</div>
      <div class="tiny muted mt">${(e.w * e.h).toFixed(1)} m² footprint · y=0 is north wall; main entrance on south wall.</div>`;
  },

  svg(v, L) {
    const E = VS.edits, sh = L.params.shared;
    let s = `<svg id="plan" viewBox="-1 -1 ${v.width + 2} ${v.depth + 2}" width="100%" class="plan-svg" role="img" aria-label="Editable floor plan" style="touch-action:none;background:#fbf8f1;border:1px solid var(--line);border-radius:8px">
      <defs><pattern id="gr" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#e2e8f0" stroke-width=".04"/></pattern></defs>
      <rect x="0" y="0" width="${v.width}" height="${v.depth}" fill="#fbf8f1"/><rect x="0" y="0" width="${v.width}" height="${v.depth}" fill="url(#gr)"/>
      <rect x="0" y="0" width="${v.width}" height="${v.depth}" fill="none" stroke="#1b2238" stroke-width=".25"/>`;
    v.obstacles.forEach(o => s += `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="#9aa88a"><title>${esc(o.type)}</title></rect>`);
    E.forEach(e => {
      if (sh && e.type === "seating") return;
      const c = TYPE_COLORS[e.type] || "#999", on = VS.sel === e.id, bad = this.badIds().has(e.id);
      s += `<g class="el" data-id="${e.id}" style="cursor:grab"><rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx=".2" fill="${c}" fill-opacity=".35" stroke="${bad ? "#b3225e" : c}" stroke-width="${on || bad ? .25 : .1}" ${bad ? 'stroke-dasharray=".4 .2"' : ""}/>
        <text x="${e.x + .3}" y="${e.y + .9}" font-size=".75" fill="#1b2238" pointer-events="none">${esc(this.fit(sh && e.type === "dining" ? "Shared floor" : e.label, e.w))}</text></g>`;
    });
    v.doors.forEach(d => {
      const [x, y] = doorPoint(v, d), horiz = d.wall === "N" || d.wall === "S";
      s += `<rect x="${horiz ? x - d.width / 2 : x - .2}" y="${horiz ? y - .2 : y - d.width / 2}" width="${horiz ? d.width : .4}" height="${horiz ? .4 : d.width}" fill="${d.kind === "entrance" ? "#0f7b6c" : "#b3225e"}"><title>${d.kind}</title></rect>`;
    });
    return s + "</svg>";
  },

  fit(t, w) { const n = Math.max(3, Math.floor(w / .4)); return t.length > n ? t.slice(0, n - 1) + "…" : t; },
  badIds() { const s = new Set(); (VS.val ? VS.val.checks : []).filter(c => c.status === "fail").forEach(c => (c.ids || c.elements || []).forEach(i => s.add(i))); return s; },

  bind(root, p) {
    const v = p.vision.venue;

    // View Mode Toggle (3D vs 2D)
    const btn3d = $("#tab-v-3d", root);
    const btn2d = $("#tab-v-2d", root);
    const box3d = $("#box-v-3d", root);
    const box2d = $("#box-v-2d", root);

    if (btn3d && btn2d) {
      btn3d.onclick = () => {
        VS.mode = "3d";
        btn3d.classList.add("active");
        btn2d.classList.remove("active");
        if (box3d) box3d.style.display = "block";
        if (box2d) box2d.style.display = "none";
      };
      btn2d.onclick = () => {
        VS.mode = "2d";
        btn2d.classList.add("active");
        btn3d.classList.remove("active");
        if (box3d) box3d.style.display = "none";
        if (box2d) box2d.style.display = "block";
      };
    }

    const svgBox = $("#vs-svg", root);
    const redrawSvg = () => { if (svgBox) svgBox.innerHTML = this.svg(v, p.vision.layout); wire(); };
    const revalidate = debounce(async () => {
      try {
        const r = await api(`/projects/${S.pid}/vision/validate`, { body: { elements: VS.edits } });
        VS.val = r.validation;
        $("#vs-checks", root).innerHTML = this.checks(VS.val);
        const b = $("#vs-badge", root);
        if (b) {
          b.className = "chip " + (VS.val.ok ? "ok" : "bad");
          b.textContent = `${VS.val.summary.pass}/${VS.val.summary.total} checks pass`;
        }
        redrawSvg();
      } catch (e) { toast(e.message, "bad"); }
    }, 180);

    const pt = (svg, ev) => { const m = svg.getScreenCTM().inverse(), q = svg.createSVGPoint(); q.x = ev.clientX; q.y = ev.clientY; return q.matrixTransform(m); };
    const insp = () => { $("#vs-insp", root).innerHTML = "<h3>Selected Item Geometry</h3>" + this.inspector(); wireInsp(); };
    const wireInsp = () => $$("[data-f]", root).forEach(i => i.onchange = () => {
      const e = VS.edits.find(x => x.id === VS.sel);
      if (e) {
        e[i.dataset.f] = Math.max(i.dataset.f === "x" || i.dataset.f === "y" ? 0 : .5, +i.value);
        redrawSvg();
        revalidate();
        refreshButtons();
      }
    });

    const refreshButtons = () => {
      const n = this.moved().length;
      const sv = $("#vs-save", root);
      const un = $("#vs-undo", root);
      if (sv) { sv.disabled = !n; sv.textContent = `Save ${n} moved item(s)`; }
      if (un) un.disabled = !n;
    };

    const wire = () => {
      const svg = $("#plan", root);
      if (!svg) return;
      $$(".el", svg).forEach(g => g.onpointerdown = ev => {
        const e = VS.edits.find(x => x.id === g.dataset.id), q = pt(svg, ev);
        VS.sel = e.id;
        VS.drag = { id: e.id, dx: q.x - e.x, dy: q.y - e.y };
        g.setPointerCapture(ev.pointerId);
        g.style.cursor = "grabbing";
        insp();

        g.onpointermove = m => {
          if (!VS.drag) return;
          const r = pt(svg, m);
          e.x = Math.max(0, Math.min(v.width - e.w, Math.round((r.x - VS.drag.dx) * 4) / 4));
          e.y = Math.max(0, Math.min(v.depth - e.h, Math.round((r.y - VS.drag.dy) * 4) / 4));
          const rc = g.querySelector("rect"), tx = g.querySelector("text");
          if (rc) { rc.setAttribute("x", e.x); rc.setAttribute("y", e.y); }
          if (tx) { tx.setAttribute("x", e.x + .3); tx.setAttribute("y", e.y + .9); }
        };

        g.onpointerup = () => {
          VS.drag = null;
          g.onpointermove = g.onpointerup = null;
          insp();
          revalidate();
          refreshButtons();
        };
      });
    };

    wire();
    wireInsp();

    const svBtn = $("#vs-save", root);
    if (svBtn) svBtn.onclick = () => propose({ layout_pin: this.moved().map(e => ({ id: e.id, x: e.x, y: e.y })) });

    const unBtn = $("#vs-undo", root);
    if (unBtn) unBtn.onclick = () => {
      VS.edits = JSON.parse(JSON.stringify(VS.orig));
      VS.val = p.vision.validation;
      $("#vs-checks", root).innerHTML = this.checks(VS.val);
      redrawSvg();
      insp();
      refreshButtons();
    };

    const resBtn = $("#vs-reset", root);
    if (resBtn) resBtn.onclick = () => propose({ layout_reset: true });

    const cmd = () => {
      const t = $("#vs-cmd", root).value.trim();
      if (t) propose({ vision_command: t });
    };
    const goBtn = $("#vs-go", root);
    if (goBtn) goBtn.onclick = cmd;
    const cmdIn = $("#vs-cmd", root);
    if (cmdIn) cmdIn.onkeydown = e => { if (e.key === "Enter") cmd(); };

    $$("[data-cmd-sugg]", root).forEach(b => {
      b.onclick = () => propose({ vision_command: b.dataset.cmdSugg });
    });

    $$("[data-venue]", root).forEach(b => b.onclick = () => propose({ venue_id: b.dataset.venue }));

    const cvGo = $("#cv-go", root);
    if (cvGo) cvGo.onclick = () => propose({
      custom_venue: {
        name: "Custom Venue",
        template: $("#cv-t", root).value,
        width: +$("#cv-w", root).value,
        depth: +$("#cv-d", root).value
      }
    });

    // Mount 3D Walkthrough & Realistic Renderer
    const walkBox = $("#walk-box", root);
    if (walkBox) {
      Walk.mount(walkBox, p, "3d");
    }
  }
};
