"use strict";
const EV = { res: null, challenge: null };
VIEWS.verify = {
  render(p) {
    const c = p.critic, v = p.vision.validation;
    const row = h => `<div class="check"><span class="dot ${h.status === "pass" ? "pass" : h.status === "fail" ? "fail" : "warn"}"></span><div><b>${esc(h.title)}</b><div class="tiny muted">${esc(h.evidence)}</div>${h.fix && h.status !== "pass" ? `<div class="tiny">Fix: ${esc(h.fix)}</div>` : ""}</div></div>`;
    const ev = EV.res, ch = EV.challenge;
    const crises = c.crisis_sim || [];

    return `
    <div class="sect"><h1>Verify &amp; Stress Testing</h1><p class="muted">${esc(c.note)}</p></div>

    <div class="card" style="border:1px solid #c9a227;background:linear-gradient(135deg,#fffdf7,#fbf6ea);margin-bottom:16px">
      <div class="row"><h3 class="grow" style="margin:0">⚖️ Hackathon Judge Challenge (Adversarial Stress Test)</h3>
        <span class="chip ok">Live Verification</span></div>
      <p class="small muted" style="margin:6px 0 12px">Click any adversarial scenario below to see how EventForge's deterministic verifier catches impossible plans that standard LLMs hallucinate past:</p>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn sm" data-jc="budget_blackhole">💥 1. The Budget Black Hole</button>
        <button class="btn sm" data-jc="fire_hazard">🔥 2. The Fire Code Hazard</button>
        <button class="btn sm" data-jc="impossible_timeline">⏱️ 3. The Impossible Timeline</button>
        ${ch ? '<button class="btn ghost sm" id="jc-clear">Clear Result</button>' : ''}
      </div>
      <div id="jc-box" class="mt" ${ch ? '' : 'style="display:none"'}>
        ${ch ? this.challengeHtml(ch) : ''}
      </div>
    </div>

    <div class="grid g-side"><div class="col">
      <div class="card"><h3>Hard checks — ${c.hard_passed}/${c.hard_total} pass</h3>${c.hard.map(row).join("")}</div>
      <div class="card"><h3>Layout checks — ${v.summary.pass}/${v.summary.total} pass</h3>${v.checks.map(x => `<div class="check"><span class="dot ${x.status}"></span><div><b>${esc(x.title)}</b><div class="tiny muted">${esc(x.detail)}</div>${x.fix && x.status !== "pass" ? `<div class="tiny">Fix: ${esc(x.fix)}</div>` : ""}</div></div>`).join("")}</div>
    </div><div class="col">
      <div class="card">
        <h3>🚨 Emergency Plan B Simulator</h3>
        <p class="small muted">Simulated resilience against 3 live real-world operational crises:</p>
        <div class="col" style="gap:10px">
          ${crises.map(cs => `
            <div class="finding" style="border-left:3px solid ${cs.status === 'managed' ? '#0f7b6c' : cs.status === 'warning' ? '#d97706' : '#b3225e'}">
              <div class="row"><b class="grow">${esc(cs.title)}</b><span class="chip ${cs.status === 'managed' ? 'ok' : cs.status === 'warning' ? 'warn' : 'bad'}">${cs.status}</span></div>
              <div class="tiny muted mt"><b>Scenario:</b> ${esc(cs.scenario)}</div>
              <div class="tiny mt"><b>Impact:</b> ${esc(cs.impact)}</div>
              <div class="small mt" style="color:#0f7b6c;background:#edf7f5;padding:6px;border-radius:4px"><b>Mitigation:</b> ${esc(cs.mitigation)}</div>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="card"><h3>Risk notes <span class="small muted">(heuristics, not certainties)</span></h3>${c.risks.map(r => `<div class="finding"><span class="sev ${r.severity}"></span><b>${esc(r.title)}</b> <span class="chip">${r.severity}</span><div class="tiny muted">${esc(r.evidence)}</div>${r.fix ? `<div class="tiny">Suggestion: ${esc(r.fix)}</div>` : ""}</div>`).join("") || '<div class="empty">No risks flagged.</div>'}</div>
      <div class="card"><h3>Evaluation Suite</h3><div class="small muted">Runs the built-in test harness: invariants, behaviours, and 10 deliberately seeded faults the verifier must catch.</div>
        <button class="btn gold mt" id="ev-run">Run evaluation suite</button><div id="ev-out" class="mt small">${ev ? this.evHtml(ev) : ""}</div></div>
    </div></div>`;
  },
  challengeHtml(ch) {
    return `
    <div class="callout bad" style="background:#fff7f7;border:1px solid #b3225e;border-radius:8px;padding:12px">
      <div class="row"><b style="font-size:14px;color:#b3225e">${esc(ch.title)}</b><span class="chip bad">Intercepted by Verifier</span></div>
      <div class="small mt"><b>Attempted Input:</b> ${esc(ch.input)}</div>
      <div class="small mt" style="color:#b3225e"><b>Rule Triggered:</b> ${esc(ch.interception)}</div>
      <div class="small mt"><b>Mathematical / Physical Proof:</b> ${esc(ch.mathematical_proof)}</div>
      <div class="small mt" style="background:#fff;padding:8px;border-radius:4px;border:1px solid #e2e8f0"><b>System Action:</b> ${esc(ch.system_action)}</div>
    </div>`;
  },
  evHtml(r) {
    const groups = {}; r.results.forEach(c => (groups[c.group] = groups[c.group] || []).push(c));
    return `<div class="callout ${r.passed === r.total ? "ok" : "bad"}"><b>${r.passed}/${r.total}</b> cases pass · seeded faults caught: <b>${r.seeded_detected}/${r.seeded_total}</b></div>` +
      Object.entries(groups).map(([g, cs]) => `<b class="small">${esc(g)}</b>${cs.map(c => `<div class="check"><span class="dot ${c.passed ? "pass" : "fail"}"></span><div class="small">${esc(c.name)}<div class="tiny muted">${esc(c.detail || "")}</div></div></div>`).join("")}`).join("");
  },
  bind(root) {
    $("#ev-run", root).onclick = () => guard(async () => { $("#ev-out", root).innerHTML = '<span class="spinner"></span> Running…'; EV.res = await api("/evals"); $("#ev-out", root).innerHTML = this.evHtml(EV.res); });
    $$("[data-jc]", root).forEach(btn => {
      btn.onclick = () => guard(async () => {
        const id = btn.dataset.jc;
        EV.challenge = await api(`/judge-challenge/${id}`);
        const box = $("#jc-box", root);
        if (box) { box.style.display = ""; box.innerHTML = this.challengeHtml(EV.challenge); }
      });
    });
    const clr = $("#jc-clear", root);
    if (clr) clr.onclick = () => { EV.challenge = null; const box = $("#jc-box", root); if (box) { box.style.display = "none"; box.innerHTML = ""; } };
  },
};

VIEWS.history = {
  render(p) {
    return `
    <div class="sect"><h1>Versions &amp; export</h1><p class="muted">Every applied change is a version. Restore any of them; nothing is lost.</p></div>
    <div class="grid g-side"><div class="col"><div class="card"><h3>History</h3><div id="vh" class="small muted">Loading…</div></div>
      <div class="card" id="vc" hidden></div></div>
    <div class="col"><div class="card"><h3>Export</h3><div class="col" style="gap:8px">
      <a class="btn ghost" href="/api/projects/${S.pid}/export/pdf">PDF plan report</a><a class="btn ghost" href="/api/projects/${S.pid}/export/ics">Calendar file (.ics)</a>
      <a class="btn ghost" href="/api/projects/${S.pid}/export/gif">Walkthrough animation (.gif)</a><a class="btn ghost" href="/api/projects/${S.pid}/export/digest">Weekly digest (.txt)</a><a class="btn ghost" href="/api/projects/${S.pid}/export/json">Full data (.json)</a></div></div></div></div>`;
  },
  bind(root) {
    api(`/projects/${S.pid}/versions`).then(r => {
      const el = $("#vh", root); if (!el) return; el.className = "";
      el.innerHTML = r.versions.slice().reverse().map(v => `<div class="finding"><div class="row"><b class="grow">#${v.id} ${esc(v.label)}</b>${v.current ? '<span class="chip ok">current</span>' : `<button class="btn ghost sm" data-rs="${v.id}">Restore</button>`}${v.parent ? `<button class="btn ghost sm" data-cmp="${v.parent},${v.id}">What changed</button>` : ""}</div>
        <div class="tiny muted">${esc(v.headline || "")} · ${esc((v.created || "").slice(0, 16).replace("T", " "))}</div></div>`).join("");
      $$("[data-rs]", el).forEach(b => b.onclick = () => guard(async () => { setPlan(await api(`/projects/${S.pid}/restore`, { body: { version_id: +b.dataset.rs } })); toast("Restored", "ok"); }));
      $$("[data-cmp]", el).forEach(b => b.onclick = () => guard(async () => {
        const [a, c] = b.dataset.cmp.split(","), d = await api(`/projects/${S.pid}/compare?a=${a}&b=${c}`), box = $("#vc", root);
        box.hidden = false; box.innerHTML = `<h3>#${a} → #${c}</h3><p>${esc(d.headline)}</p><div class="small">Cost ${short(d.budget.estimate_before)} → ${short(d.budget.estimate_after)} · tasks moved ${d.timeline.moved_count} · checks ${esc(d.critic.before)} → ${esc(d.critic.after)}</div>`;
      }));
    });
  },
};
