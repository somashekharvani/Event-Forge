"use strict";
VIEWS.ideas = {
  render(p) {
    const d = p.ideas, m = p.memory, cur = p.vision.layout.theme && p.vision.layout.theme.id;
    const menu = d.menu.menu;
    return `
    <div class="sect"><h1>Ideas</h1><p class="muted">Themes are scored against your event type, tradition, budget and what you've liked. The score explains itself.</p></div>
    <div class="grid g-side"><div class="col">
      <div class="card"><h3>Theme suggestions</h3>
        ${d.themes.map(t => `<div class="finding" ${cur === t.id ? 'style="border-color:var(--teal)"' : ""}>
          <div class="row"><span>${t.palette.map(c => `<i class="swatch" style="background:${c};width:18px;height:18px;border-radius:4px"></i>`).join("")}</span><b class="grow">${esc(t.name)}</b>${cur === t.id ? '<span class="chip ok">in use</span>' : ""}<b>${t.score}</b></div>
          <div class="tiny muted">${t.why.map(esc).join(" · ")}</div>
          <ul class="small" style="margin:6px 0 6px 18px;padding:0">${t.decor.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
          <div class="row"><button class="btn gold sm" data-theme="${t.id}">Use this theme</button>
            <button class="btn ghost sm" data-like="${t.id}">${m.liked_themes.includes(t.id) ? "♥ Liked" : "♡ Like"}</button><button class="btn ghost sm" data-dislike="${t.id}">${m.disliked_themes.includes(t.id) ? "Disliked" : "Not for me"}</button></div></div>`).join("")}</div>
      <div class="card"><h3>Menu — ${esc(cap(d.menu.culture))}, ${esc(cap(d.menu.diet))}</h3><div class="small muted">${esc(d.menu.note)}</div>
        <div class="grid g2 mt">${Object.entries(menu).map(([k, v]) => `<div><b class="small">${esc(cap(k))}</b><ul class="small" style="margin:4px 0 8px 18px;padding:0">${v.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}</div></div>
      <div class="card"><h3>Programme</h3><div class="tbl-wrap"><table><thead><tr><th>Day</th><th>Time</th><th>Programme</th><th>Zone</th><th class="right">Guests</th></tr></thead><tbody>
        ${d.programs.map(x => `<tr><td>${x.day}</td><td class="nowrap">${x.start}–${x.end}</td><td>${esc(x.name)}${x.loud ? ' <span class="chip warn">loud</span>' : ""}</td><td>${esc(x.zone_label)}</td><td class="right">${Math.round(x.attendee_fraction * p.spec.guests)}</td></tr>`).join("")}</tbody></table></div></div>
    </div><div class="col">
      <div class="card"><h3>Tell me what you like</h3><div class="small muted">Preferences are remembered and applied to every suggestion. Say it naturally.</div>
        <div class="row mt"><input id="pf" class="grow" placeholder="e.g. no loud music near elders, prefer pastel colours"><button class="btn sm" id="pf-add">Save</button></div>
        ${m.prefs.map(x => `<div class="finding"><div class="row"><span class="grow small">“${esc(x.text)}”</span><button class="btn ghost sm" data-rm="${x.id}">Remove</button></div>${x.spec_changes && Object.keys(x.spec_changes).length ? `<div class="tiny muted">Applied: ${esc(JSON.stringify(x.spec_changes))}</div>` : ""}</div>`).join("") || '<div class="empty small">Nothing saved yet.</div>'}
        ${m.prefs.length ? '<button class="btn ghost sm mt" id="pf-clear">Forget everything</button>' : ""}</div>
      <div class="card"><h3>Entertainment ideas</h3><ul class="small" style="margin:0 0 0 18px;padding:0">${d.entertainment.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="card"><h3>Return gifts</h3><ul class="small" style="margin:0 0 0 18px;padding:0">${d.return_gifts.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="card"><h3>Invitation text</h3><textarea rows="7" id="inv">${esc(d.invitation)}</textarea><button class="btn ghost sm mt" id="inv-copy">Copy</button></div>
    </div></div>`;
  },
  bind(root) {
    $$("[data-theme]", root).forEach(b => b.onclick = () => propose({ theme: b.dataset.theme }));
    $$("[data-like]", root).forEach(b => b.onclick = () => guard(async () => setPlan(await api(`/projects/${S.pid}/commit`, { body: { changes: { like_theme: b.dataset.like }, label: "Liked a theme" } }))));
    $$("[data-dislike]", root).forEach(b => b.onclick = () => guard(async () => setPlan(await api(`/projects/${S.pid}/commit`, { body: { changes: { dislike_theme: b.dataset.dislike }, label: "Disliked a theme" } }))));
    $("#pf-add", root).onclick = () => { const t = $("#pf", root).value.trim(); if (t) propose({ pref: t }); };
    $$("[data-rm]", root).forEach(b => b.onclick = () => guard(async () => setPlan(await api(`/projects/${S.pid}/commit`, { body: { changes: { remove_pref: b.dataset.rm }, label: "Removed preference" } }))));
    const c = $("#pf-clear", root); if (c) c.onclick = () => guard(async () => setPlan(await api(`/projects/${S.pid}/commit`, { body: { changes: { clear_prefs: true }, label: "Cleared preferences" } })));
    $("#inv-copy", root).onclick = () => { navigator.clipboard?.writeText($("#inv", root).value); toast("Copied", "ok"); };
  },
};
