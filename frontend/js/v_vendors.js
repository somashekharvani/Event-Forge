"use strict";
const VD = { cat: null, weights: null, ranked: null, quotePrev: null };
const WLAB = { budget: "Fits budget", rating: "Rating", distance: "Distance", availability: "Available on date", fit: "Fit for event" };
VIEWS.vendors = {
  render(p) {
    const cats = Object.keys(p.vendors); if (!VD.cat || !p.vendors[VD.cat]) VD.cat = cats[0];
    const v = p.vendors[VD.cat], w = VD.weights || v.weights, list = VD.ranked || v.ranked, sel = p.selection[VD.cat];
    const items = p.checklist_done || [];
    return `
    <div class="sect"><h1>Vendors</h1><div class="callout warn small">${esc(v.disclaimer)}</div></div>
    <div class="tabs mt">${cats.map(c => `<button data-cat="${c}" ${c === VD.cat ? 'aria-current="true"' : ""}>${esc(p.vendors[c].label)}</button>`).join("")}</div>
    <div class="grid g-side mt"><div class="col">
      <div class="card"><h3>Ranking <span class="small muted">· budget for this category ${short(v.allocation)}</span></h3>
        <div class="row mb">${Object.keys(WLAB).map(k => `<label class="f" style="min-width:120px"><span class="tiny">${WLAB[k]} <b>${Math.round(w[k] * 100)}%</b></span><input type="range" data-w="${k}" min="0" max="100" value="${Math.round(w[k] * 100)}"></label>`).join("")}</div>
        ${list.map((r, i) => `<div class="finding" ${sel && sel.vendor.id === r.vendor.id ? 'style="border-color:var(--teal)"' : ""}>
          <div class="row"><b>${i + 1}. ${esc(r.vendor.name)}</b><span class="chip">SAMPLE</span>${sel && sel.vendor.id === r.vendor.id ? '<span class="chip ok">selected</span>' : ""}${r.available ? "" : '<span class="chip bad">busy on date</span>'}${r.over_allocation ? '<span class="chip warn">over category budget</span>' : ""}<span class="grow"></span><b>${r.score}</b><span class="tiny muted">/100</span></div>
          <div class="small">★ ${r.vendor.rating} · ${r.vendor.distance_km} km · ${short(r.price_estimate.low)}–${short(r.price_estimate.high)} (mid ${short(r.price_estimate.mid)}) · ${r.vendor.tags.map(esc).join(", ")}</div>
          <div class="tiny muted">Score = ${Object.keys(WLAB).map(k => `${WLAB[k]} ${r.contributions[k]}`).join(" + ")}</div>
          <div class="row mt"><button class="btn ${sel && sel.vendor.id === r.vendor.id ? "ghost" : "gold"} sm" data-sel="${r.vendor.id}">${sel && sel.vendor.id === r.vendor.id ? "Unselect" : "Select"}</button>
            <button class="btn ghost sm" data-out="${r.vendor.id}">Draft message</button>${sel && sel.vendor.id === r.vendor.id ? `<button class="btn ghost sm" data-cancel="1" title="Mark this vendor as cancelled and see the impact">Vendor cancelled</button>` : ""}</div></div>`).join("")}
        <div class="tiny muted mt">Weights are yours to change; the ranking is a transparent weighted sum, not a black box.</div></div>
    </div><div class="col">
      <div class="card"><h3>${esc(v.label)} checklist</h3><div id="ck" class="small muted">Loading…</div></div>
      <div class="card"><h3>Compare quotes</h3><div class="small muted">Paste a vendor's message. Fields are extracted with the matching text shown as evidence; anything missing is flagged, never guessed.</div>
        <input id="q-l" placeholder="Label (e.g. Elite Foods)" class="mt"><textarea id="q-t" rows="4" placeholder="Paste quote text…"></textarea>
        <div class="row mt"><button class="btn ghost sm" id="q-add">Extract &amp; save</button></div>
        <div id="q-out" class="mt small">${this.quotes(p)}</div></div>
    </div></div>`;
  },
  quotes(p) {
    if (!p.quotes.length) return '<span class="muted">No quotes yet.</span>';
    return p.quotes.map(q => `<div class="finding"><b>${esc(q.label)}</b> <span class="chip">${Math.round(q.completeness * 100)}% complete</span> <button class="btn ghost sm" data-qdel="${q.id}">Remove</button>
      <div class="tiny">${Object.entries(q.fields).filter(([k, x]) => x && x.value !== undefined).map(([k, x]) => `${esc(cap(k))}: <b>${typeof x.value === "number" && /total|per_head|amount/.test(k) ? inr(x.value) : esc(x.value)}</b> <span class="muted">(“${esc(x.evidence)}”)</span>`).join("<br>")}</div>
      ${q.missing.length ? `<div class="tiny" style="color:var(--amber)">Missing: ${q.missing.map(esc).join(", ")}</div>` : ""}${q.gst_note ? `<div class="tiny muted">${esc(q.gst_note)}</div>` : ""}</div>`).join("") +
      (p.quotes.length > 1 ? '<button class="btn gold sm" id="q-cmp">Compare</button><div id="q-cmp-out" class="mt"></div>' : "");
  },
  bind(root, p) {
    const re = () => { render(); };
    $$("[data-cat]", root).forEach(b => b.onclick = () => { VD.cat = b.dataset.cat; VD.weights = VD.ranked = null; re(); });
    $$("[data-w]", root).forEach(s => s.onchange = async () => {
      const w = {}; $$("[data-w]", root).forEach(x => w[x.dataset.w] = +x.value / 100);
      const sum = Object.values(w).reduce((a, b) => a + b, 0) || 1; Object.keys(w).forEach(k => w[k] /= sum);
      VD.weights = w; VD.ranked = (await api(`/projects/${S.pid}/vendors/rank`, { body: { category: VD.cat, weights: w } })).ranked; re();
    });
    $$("[data-sel]", root).forEach(b => b.onclick = () => { const cur = p.selection[VD.cat]; propose(cur && cur.vendor.id === b.dataset.sel ? { unselect_vendor: VD.cat } : { select_vendor: { category: VD.cat, vendor_id: b.dataset.sel } }); });
    $$("[data-cancel]", root).forEach(b => b.onclick = () => propose({ vendor_cancel: VD.cat }));
    $$("[data-out]", root).forEach(b => b.onclick = () => this.outreach(b.dataset.out));
    api(`/projects/${S.pid}/checklist/${VD.cat}`).then(c => {
      const el = $("#ck", root); if (!el) return; const done = new Set(p.checklist_done);
      const sec = (title, arr, kind) => `<div class="mt"><b>${title}</b>${arr.map((q, i) => { const id = `${VD.cat}:${kind}:${i}`; return `<label class="row tight small" style="align-items:flex-start;margin:3px 0"><input type="checkbox" data-tick="${esc(id)}" ${done.has(id) ? "checked" : ""}> <span>${esc(q)}</span></label>`; }).join("")}</div>`;
      el.className = ""; el.innerHTML = sec("Questions to ask", c.questions, "q") + sec("Documents to collect", c.documents || [], "d") + (c.red_flags ? sec("Red flags", c.red_flags, "r") : "");
      $$("[data-tick]", el).forEach(x => x.onchange = () => api(`/projects/${S.pid}/checklist`, { body: { item_id: x.dataset.tick, done: x.checked } }).then(r => { S.plan = r.plan; renderNav(); }));
    }).catch(() => { });
    $("#q-add", root).onclick = () => guard(async () => { const t = $("#q-t", root).value.trim(); if (!t) return toast("Paste the quote text first", "bad"); setPlan(await api(`/projects/${S.pid}/quotes`, { body: { text: t, label: $("#q-l", root).value || "Quote " + (p.quotes.length + 1), category: VD.cat } })); });
    $$("[data-qdel]", root).forEach(b => b.onclick = () => guard(async () => setPlan(await api(`/projects/${S.pid}/quotes/${b.dataset.qdel}`, { method: "DELETE" }))));
    const c = $("#q-cmp", root);
    if (c) c.onclick = () => guard(async () => {
      const r = await api(`/projects/${S.pid}/quotes/compare`);
      $("#q-cmp-out", root).innerHTML = `<table><thead><tr><th>Quote</th><th class="right">Total incl. GST</th><th>Complete</th><th class="right">Value</th></tr></thead><tbody>${r.rows.map(x => `<tr><td>${esc(x.label)}${x.label === r.best_value ? ' <span class="chip ok">best value</span>' : ""}</td><td class="right">${x.total_normalised ? inr(x.total_normalised) : "—"}${x.exact ? "" : '<div class="tiny muted">estimate</div>'}</td><td>${Math.round(x.completeness * 100)}%</td><td class="right">${x.value_score ?? "—"}</td></tr>`).join("")}</tbody></table><div class="tiny muted mt">${esc(r.note)}</div>`;
    });
  },
  outreach(vid) {
    const draw = async (ch, lang) => {
      const o = await api(`/projects/${S.pid}/outreach`, { body: { vendor_id: vid, channel: ch, lang } });
      openModal(`<h2>Draft message</h2><div class="row mb"><select id="o-ch"><option value="whatsapp" ${ch === "whatsapp" ? "selected" : ""}>WhatsApp</option><option value="email" ${ch === "email" ? "selected" : ""}>Email</option></select>
        <select id="o-lang"><option value="en" ${lang === "en" ? "selected" : ""}>English</option><option value="hi" ${lang === "hi" ? "selected" : ""}>हिन्दी</option></select></div>
        ${o.subject ? `<div class="small"><b>Subject:</b> ${esc(o.subject)}</div>` : ""}<textarea id="o-body" rows="14">${esc(o.body)}</textarea>
        <div class="row mt"><button class="btn gold" id="o-copy">Copy</button><button class="btn ghost" onclick="closeModal()">Close</button></div><div class="tiny muted mt">Drafts only — nothing is sent from here.</div>`);
      $("#o-ch").onchange = $("#o-lang").onchange = () => guard(() => draw($("#o-ch").value, $("#o-lang").value));
      $("#o-copy").onclick = () => { navigator.clipboard?.writeText($("#o-body").value); toast("Copied", "ok"); };
    };
    guard(() => draw("whatsapp", "en"));
  },
};
