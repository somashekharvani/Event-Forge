"use strict";
/* EventForge Vision studio: venue fit, photo/dimensions, editable floor plan with live validation, NL commands, walkthrough */
const VS = { sel: null, edits: null, orig: null, val: null, drag: null, photo: null, key: null };
const LAB_T = { stage: "Stage", mandap: "Mandap", seating: "Seating", dining: "Dining", buffet: "Buffet", dance_floor: "Dance floor", activity: "Activity", reg_desk: "Registration", photo_booth: "Photo booth", first_aid: "First aid", kitchen: "Kitchen", backstage: "Backstage" };

VIEWS.vision = {
  render(p) {
    const vis = p.vision, v = vis.venue, L = vis.layout, key = p.name + S.version;
    if (VS.key !== key) { VS.key = key; VS.edits = JSON.parse(JSON.stringify(L.elements)); VS.orig = JSON.parse(JSON.stringify(L.elements)); VS.val = vis.validation; VS.sel = null; }
    const val = VS.val, fails = val.checks.filter(c => c.status !== "pass");
    const moved = this.moved();
    return `
    <div class="sect"><h1>Vision studio</h1>
      <div class="callout warn small">Planning preview, not an exact representation of the venue. Dimensions come from you; a photo cannot measure a room. Venue shapes here are generic templates, not photos of real places.</div></div>
    <div class="grid g-side"><div class="col">
      <div class="card"><div class="row"><h3 class="grow">${esc(v.name)} <span class="muted small">${v.width} × ${v.depth} m · ${v.indoor ? "indoor" : "outdoor"} · theme: ${esc(L.theme.name)}</span></h3>
        <span class="chip ${val.ok ? "ok" : "bad"}" id="vs-badge">${val.summary.pass}/${val.summary.total} checks pass</span></div>
        <div id="vs-svg">${this.svg(v, L)}</div>
        <div class="legend small mt">${[...new Set(VS.edits.map(e => e.type))].map(t => `<span><i class="swatch" style="background:${TYPE_COLORS[t] || "#999"}"></i> ${LAB_T[t] || t}</span>`).join(" ")}<span><i class="swatch" style="background:#0f7b6c;border-radius:50%"></i> entrance</span><span><i class="swatch" style="background:#b3225e;border-radius:50%"></i> exit</span></div>
        <div class="row mt"><button class="btn gold sm" id="vs-save" ${moved.length ? "" : "disabled"}>Save ${moved.length} moved item(s)</button><button class="btn ghost sm" id="vs-undo" ${moved.length ? "" : "disabled"}>Discard my moves</button><button class="btn ghost sm" id="vs-reset">Reset to automatic layout</button><span class="small muted">Drag items; checks update live.</span></div></div>
      <div class="card"><h3>Tell it what to change</h3><div class="row"><input id="vs-cmd" class="grow" placeholder="e.g. move dining away from the entrance · add a photo booth · make the stage bigger · swap stage and mandap · change decoration to white and gold"><button class="btn sm" id="vs-go">Preview</button></div>
        <div class="tiny muted mt">Commands are parsed by rules (and an LLM if configured), then validated. You always see the before/after first.</div></div>
      <div class="card"><h3>Planning preview with narration</h3><div id="walk-box"></div></div>
    </div><div class="col">
      <div class="card"><h3>Layout checks</h3>
        <div id="vs-checks">${this.checks(val)}</div></div>
      <div class="card" id="vs-insp"><h3>Selected item</h3>${this.inspector()}</div>
      <div class="card"><h3>Venue</h3>
        ${p.venue_fit.map(f => `<div class="row" style="margin:4px 0"><span class="chip ${f.fits ? "ok" : "bad"}">${f.fits ? "fits" : f.fails + " fail"}</span><span class="grow ${f.id === v.id ? "" : "small"}">${f.id === v.id ? "<b>" + esc(f.name) + "</b>" : esc(f.name)}</span><span class="tiny muted">${f.width}×${f.depth} · ${f.fill_pct}%</span>${f.id === v.id ? "" : `<button class="btn ghost sm" data-venue="${f.id}">Use</button>`}</div>`).join("")}
        <h3 class="mt">Your own space</h3><div class="small muted">Enter real measurements, or upload a photo for a palette and style hint.</div>
        <div class="grid g2 mt"><label class="f">Width (m)<input id="cv-w" type="number" min="5" max="200" value="${v.width}"></label><label class="f">Depth (m)<input id="cv-d" type="number" min="5" max="200" value="${v.depth}"></label></div>
        <label class="f">Shape like<select id="cv-t">${p.venue_fit.map(f => `<option value="${f.id}" ${f.id === v.id ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select></label>
        <button class="btn ghost sm mt" id="cv-go">Use these dimensions</button>
        <label class="f mt">Venue photo<input type="file" id="ph" accept="image/*"></label><div id="ph-out" class="small mt">${VS.photo ? this.photoHtml(VS.photo) : (p.state_photo ? "" : "")}</div></div>
    </div></div>`;
  },
  moved() { if (!VS.edits) return []; return VS.edits.filter(e => { const o = VS.orig.find(x => x.id === e.id); return o && (Math.abs(o.x - e.x) > .01 || Math.abs(o.y - e.y) > .01 || Math.abs(o.w - e.w) > .01 || Math.abs(o.h - e.h) > .01); }); },
  checks(val) {
    const fs = val.checks.filter(c => c.status !== "pass"), ok = val.checks.filter(c => c.status === "pass");
    return (fs.length ? fs.map(c => `<div class="check"><span class="dot ${c.status}"></span><div><b>${esc(c.title)}</b><div class="tiny muted">${esc(c.detail)}</div>${c.fix ? `<div class="tiny">Fix: ${esc(c.fix)}</div>` : ""}</div></div>`).join("") : '<div class="callout ok small">Every layout check passes.</div>') +
      `<details class="mt"><summary class="small">${ok.length} passing</summary>${ok.map(c => `<div class="check"><span class="dot pass"></span><div class="small">${esc(c.title)}<div class="tiny muted">${esc(c.detail)}</div></div></div>`).join("")}</details>` +
      `<div class="tiny muted mt">Seating capacity ${val.metrics.zone_capacity.seating ?? "–"} · dining ${val.metrics.zone_capacity.dining ?? "–"} · floor ${val.metrics.fill_pct}% used.</div>`;
  },
  inspector() {
    const e = VS.edits && VS.edits.find(x => x.id === VS.sel);
    if (!e) return '<div class="small muted">Click an item on the plan.</div>';
    const f = (k, l) => `<label class="f">${l}<input type="number" step=".25" data-f="${k}" value="${(+e[k]).toFixed(2)}"></label>`;
    return `<h3>${esc(e.label)}</h3><div class="grid g2">${f("x", "X (m)")}${f("y", "Y (m)")}${f("w", "Width (m)")}${f("h", "Depth (m)")}</div><div class="tiny muted mt">${(e.w * e.h).toFixed(1)} m² · y=0 is the north wall; the entrance is on the south wall.</div>`;
  },
  svg(v, L) {
    const E = VS.edits, sh = L.params.shared;
    let s = `<svg id="plan" viewBox="-1 -1 ${v.width + 2} ${v.depth + 2}" width="100%" class="plan-svg" role="img" aria-label="Editable floor plan" style="touch-action:none">
      <defs><pattern id="gr" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#e6e9f2" stroke-width=".04"/></pattern></defs>
      <rect x="0" y="0" width="${v.width}" height="${v.depth}" fill="#fbf8f1"/><rect x="0" y="0" width="${v.width}" height="${v.depth}" fill="url(#gr)"/>
      <rect x="0" y="0" width="${v.width}" height="${v.depth}" fill="none" stroke="#1b2238" stroke-width=".25"/>`;
    v.obstacles.forEach(o => s += `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="#9aa88a"><title>${esc(o.type)}</title></rect>`);
    E.forEach(e => {
      if (sh && e.type === "seating") return;
      const c = TYPE_COLORS[e.type] || "#999", on = VS.sel === e.id, bad = this.badIds().has(e.id);
      s += `<g class="el" data-id="${e.id}" style="cursor:grab"><rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx=".2" fill="${c}" fill-opacity=".32" stroke="${bad ? "#b3225e" : c}" stroke-width="${on || bad ? .25 : .1}" ${bad ? 'stroke-dasharray=".4 .2"' : ""}/>
        <text x="${e.x + .3}" y="${e.y + .9}" font-size=".75" fill="#1b2238" pointer-events="none">${esc(this.fit(sh && e.type === "dining" ? "Shared floor" : e.label, e.w))}</text></g>`;
    });
    v.doors.forEach(d => { const [x, y] = doorPoint(v, d), horiz = d.wall === "N" || d.wall === "S"; s += `<rect x="${horiz ? x - d.width / 2 : x - .2}" y="${horiz ? y - .2 : y - d.width / 2}" width="${horiz ? d.width : .4}" height="${horiz ? .4 : d.width}" fill="${d.kind === "entrance" ? "#0f7b6c" : "#b3225e"}"><title>${d.kind}</title></rect>`; });
    return s + "</svg>";
  },
  fit(t, w) { const n = Math.max(3, Math.floor(w / .4)); return t.length > n ? t.slice(0, n - 1) + "…" : t; },
  badIds() { const s = new Set(); (VS.val ? VS.val.checks : []).filter(c => c.status === "fail").forEach(c => (c.ids || c.elements || []).forEach(i => s.add(i))); return s; },
  photoHtml(a) {
    const bits = [];
    if (a.palette) bits.push(`<div>${a.palette.map(c => `<i class="swatch" style="background:${esc(c)};width:20px;height:20px;border-radius:4px"></i>`).join("")}</div>`);
    if (a.suggested_template) bits.push(`<div>Looks closest to: <b>${esc(cap(a.suggested_template))}</b> <span class="muted">(${esc(a.confidence || "low confidence")})</span></div>`);
    if (a.indoor !== undefined) bits.push(`<div>Indoor guess: ${a.indoor ? "yes" : "no"} (rough)</div>`);
    return bits.join("") + `<div class="tiny muted mt">${esc(a.note || a.disclaimer || "A photo can't give dimensions — please enter them above.")}</div>`;
  },
  bind(root, p) {
    const svgBox = $("#vs-svg", root), v = p.vision.venue;
    const redrawSvg = () => { svgBox.innerHTML = this.svg(v, p.vision.layout); wire(); };
    const revalidate = debounce(async () => {
      try {
        const r = await api(`/projects/${S.pid}/vision/validate`, { body: { elements: VS.edits } });
        VS.val = r.validation; $("#vs-checks", root).innerHTML = this.checks(VS.val);
        const b = $("#vs-badge", root); b.className = "chip " + (VS.val.ok ? "ok" : "bad"); b.textContent = `${VS.val.summary.pass}/${VS.val.summary.total} checks pass`;
        redrawSvg();
      } catch (e) { toast(e.message, "bad"); }
    }, 180);
    const pt = (svg, ev) => { const m = svg.getScreenCTM().inverse(), q = svg.createSVGPoint(); q.x = ev.clientX; q.y = ev.clientY; return q.matrixTransform(m); };
    const insp = () => { $("#vs-insp", root).innerHTML = "<h3>Selected item</h3>" + this.inspector(); wireInsp(); };
    const wireInsp = () => $$("[data-f]", root).forEach(i => i.onchange = () => { const e = VS.edits.find(x => x.id === VS.sel); e[i.dataset.f] = Math.max(i.dataset.f === "x" || i.dataset.f === "y" ? 0 : .5, +i.value); redrawSvg(); revalidate(); refreshButtons(); });
    const refreshButtons = () => { const n = this.moved().length; $("#vs-save", root).disabled = !n; $("#vs-undo", root).disabled = !n; $("#vs-save", root).textContent = `Save ${n} moved item(s)`; };
    const wire = () => {
      const svg = $("#plan", root); if (!svg) return;
      $$(".el", svg).forEach(g => g.onpointerdown = ev => {
        const e = VS.edits.find(x => x.id === g.dataset.id), q = pt(svg, ev);
        VS.sel = e.id; VS.drag = { id: e.id, dx: q.x - e.x, dy: q.y - e.y }; g.setPointerCapture(ev.pointerId); g.style.cursor = "grabbing"; insp();
        g.onpointermove = m => { if (!VS.drag) return; const r = pt(svg, m); e.x = Math.max(0, Math.min(v.width - e.w, Math.round((r.x - VS.drag.dx) * 4) / 4)); e.y = Math.max(0, Math.min(v.depth - e.h, Math.round((r.y - VS.drag.dy) * 4) / 4));
          const rc = g.querySelector("rect"), tx = g.querySelector("text"); rc.setAttribute("x", e.x); rc.setAttribute("y", e.y); tx.setAttribute("x", e.x + .3); tx.setAttribute("y", e.y + .9); };
        g.onpointerup = () => { VS.drag = null; g.onpointermove = g.onpointerup = null; insp(); revalidate(); refreshButtons(); };
      });
    };
    wire(); wireInsp();
    $("#vs-save", root).onclick = () => propose({ layout_pin: this.moved().map(e => ({ id: e.id, x: e.x, y: e.y })) });
    $("#vs-undo", root).onclick = () => { VS.edits = JSON.parse(JSON.stringify(VS.orig)); VS.val = p.vision.validation; $("#vs-checks", root).innerHTML = this.checks(VS.val); redrawSvg(); insp(); refreshButtons(); };
    $("#vs-reset", root).onclick = () => propose({ layout_reset: true });
    const cmd = () => { const t = $("#vs-cmd", root).value.trim(); if (t) propose({ vision_command: t }); };
    $("#vs-go", root).onclick = cmd; $("#vs-cmd", root).onkeydown = e => { if (e.key === "Enter") cmd(); };
    $$("[data-venue]", root).forEach(b => b.onclick = () => propose({ venue_id: b.dataset.venue }));
    $("#cv-go", root).onclick = () => propose({ custom_venue: { name: "My venue", template: $("#cv-t", root).value, width: +$("#cv-w", root).value, depth: +$("#cv-d", root).value } });
    $("#ph", root).onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 8e6) return toast("Please use an image under 8 MB", "bad");
      const rd = new FileReader();
      rd.onload = () => guard(async () => { const a = await api(`/projects/${S.pid}/vision/photo`, { body: { image_base64: rd.result } }); VS.photo = a; $("#ph-out", root).innerHTML = this.photoHtml(a); }, "Couldn't read that photo");
      rd.readAsDataURL(f);
    };
    Walk.mount($("#walk-box", root), p);
  },
};
