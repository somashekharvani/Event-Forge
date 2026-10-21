const OV = { warRoom: false };
VIEWS.overview = {
  render(p) {
    const o = p.overview, b = p.budget, c = p.critic, t = p.timeline, sp = p.spec;
    const progs = p.programs || [];

    if (OV.warRoom) {
      const nextProg = progs[0] || { name: "Main Ceremony", start: "10:00", zone_label: "Main Stage" };
      const waMsg = (role, action) => encodeURIComponent(`Hi ${role}, quick update from ${p.name} coordinator: ${action}. Please confirm.`);
      return `
      <div class="sect">
        <div class="row">
          <h1 class="grow">⚡ Event Day War Room</h1>
          <button class="btn sm ghost" id="ov-war-toggle">📋 Return to Planning Dashboard</button>
        </div>
        <p class="muted">Live operational dispatcher for day-of-event coordinators, vendor leads, and family.</p>
      </div>

      <div class="card" style="background:linear-gradient(135deg,#1b2238,#2c3560);color:#fff;margin-bottom:16px;border-radius:10px;padding:18px">
        <div class="row"><span class="chip ok">Live Protocol Active</span><span class="small" style="color:#cbd5e1">Horizon: Today</span></div>
        <h2 style="color:#ffd54f;margin:8px 0 4px">Next Milestone: ${esc(nextProg.start)} — ${esc(nextProg.name)}</h2>
        <div class="small" style="color:#e2e8f0">Location: <b>${esc(nextProg.zone_label)}</b> · Attendance estimate: ${Math.round((nextProg.attendee_fraction || 1) * sp.guests)} guests</div>
      </div>

      <div class="grid g2">
        <div class="card">
          <h3>📲 1-Tap WhatsApp Vendor Dispatch</h3>
          <p class="small muted">Send pre-filled operational status alerts directly to vendors without an API key:</p>
          <div class="col mt" style="gap:8px">
            <a class="btn ghost sm row" target="_blank" href="https://wa.me/?text=${waMsg('Caterer', 'Buffet counters open in 30 minutes. Please begin hot warmers and replenishment prep')}">
              <span>🍲 <b>Alert Caterer:</b> "Buffet warmers on (30m countdown)"</span>
            </a>
            <a class="btn ghost sm row" target="_blank" href="https://wa.me/?text=${waMsg('Photographer', 'Main stage ceremony starts in 15 minutes. Please be in position')}">
              <span>📸 <b>Alert Photographer:</b> "Main stage ceremony in 15m"</span>
            </a>
            <a class="btn ghost sm row" target="_blank" href="https://wa.me/?text=${waMsg('Sound & Light Lead', 'Please check stage wireless mic levels and lighting wash')}">
              <span>🎤 <b>Alert Sound Lead:</b> "Mic check & lighting wash ready"</span>
            </a>
            <a class="btn ghost sm row" target="_blank" href="https://wa.me/?text=${waMsg('Family Coordinators', 'Guests are arriving at the south entrance. Please have welcome kits ready')}">
              <span>👥 <b>Alert Family Leads:</b> "Guest arrival flow at South Gate"</span>
            </a>
          </div>
        </div>

        <div class="card">
          <h3>⏱️ Hourly Run-of-Show Checklist</h3>
          <div class="col mt" style="gap:6px">
            ${progs.map((pr, idx) => `
              <label class="finding row tight" style="background:#fff;margin:0;padding:8px;border-radius:6px;cursor:pointer">
                <input type="checkbox" style="margin-right:8px" ${idx === 0 ? 'checked' : ''}>
                <div class="grow">
                  <b>${esc(pr.start)} – ${esc(pr.end)}: ${esc(pr.name)}</b>
                  <div class="tiny muted">Zone: ${esc(pr.zone_label)} · ${pr.loud ? 'High Sound Volume' : 'Acoustics Standard'}</div>
                </div>
              </label>
            `).join("")}
          </div>
        </div>
      </div>`;
    }

    const cats = b.categories.map(r => ({ label: r.label, value: r.allocated }));
    const feasMsg = { feasible: ["ok", "Expected cost fits inside the budget."], at_risk: ["warn", "Expected cost eats into your contingency."], infeasible: ["bad", "Even the optimistic cost is over budget."] }[b.feasibility];
    const issues = [...c.hard_failed, ...c.hard_warn].slice(0, 4), risks = c.risks.filter(r => r.severity !== "info").slice(0, 4);
    return `
    <div class="sect">
      <div class="row">
        <h1 class="grow">${esc(p.name)}</h1>
        <button class="btn sm gold" id="ov-war-toggle">⚡ Switch to Event Day War Room</button>
      </div>
      <p class="muted">${sp.guests} guests · ${sp.days} day(s) · ${cap(sp.diet)} menu · ${esc(o.venue)} for the layout${sp.date_assumed ? " · <b style='color:var(--amber)'>date is assumed — confirm it</b>" : ""}</p></div>
    <div class="grid g4">
      <div class="card kpi"><b>${short(b.estimate_total.exp)}</b><span>Expected cost (assumption-based) of ${short(b.total)} budget</span></div>
      <div class="card kpi"><b>${pct(b.risk.p_exceed_budget)}</b><span>Simulated chance of going over budget</span></div>
      <div class="card kpi"><b>${esc(cap(t.status || ""))}</b><span>Timeline · ${t.min_slack ?? "–"} days of slack on the critical path</span></div>
      <div class="card kpi"><b>${c.hard_passed}/${c.hard_total}</b><span>Verification checks passed · ${o.layout_ok ? "layout is valid" : "layout needs fixes"}</span></div>
    </div>
    <div class="callout ${feasMsg[0]} mt">${feasMsg[1]} Contingency reserve ${short(b.contingency)} (${b.contingency_pct}%: ${esc(b.contingency_why)}).</div>
    <div class="grid g-side mt">
      <div class="col">
        <div class="card"><h3>Needs attention</h3>
          ${issues.length || risks.length ? [...issues.map(h => `<div class="finding"><span class="sev ${h.severity}"></span><b>${esc(h.title)}</b><div class="small muted">${esc(h.evidence)}</div>${h.fix ? `<div class="small">Fix: ${esc(h.fix)}</div>` : ""}</div>`),
            ...risks.map(r => `<div class="finding"><span class="sev ${r.severity}"></span><b>${esc(r.title)}</b> <span class="chip">${r.severity}</span><div class="small muted">${esc(r.evidence)}</div></div>`)].join("") : `<div class="empty">Nothing is flagged. Open <a href="#" data-go="verify">Verify</a> to see every check.</div>`}
          <div class="mt"><a href="#" data-go="verify">See all ${c.hard_total} checks and ${c.risks.length} risk notes</a></div></div>
        <div class="card"><h3>Next tasks <span class="muted small">(${o.tasks_done}/${o.tasks_total} done)</span></h3>
          ${o.upcoming.length ? `<table><tbody>${o.upcoming.map(x => `<tr><td>${esc(x.name)}${x.critical ? ' <span class="chip warn">critical</span>' : ""}</td><td class="nowrap small muted">${fdate(x.start, { day: "numeric", month: "short" })} → ${fdate(x.end, { day: "numeric", month: "short" })}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">All tasks are done.</div>`}
          <div class="mt"><a href="#" data-go="timeline">Open the timeline</a></div></div>
      </div>
      <div class="col">
        <div class="card"><h3>Where the money goes</h3><div class="row" style="flex-wrap:nowrap;align-items:center">
          <div style="flex:none">${donut(cats, 170, short(b.total), "total budget")}</div>
          <div class="grow small">${b.categories.map((r, i) => `<div class="row tight" style="margin:2px 0"><i class="swatch" style="width:10px;height:10px;background:${CAT_COLORS[i % 10]}"></i><span class="grow">${esc(r.label)}</span><b>${short(r.allocated)}</b></div>`).join("")}
            <div class="row tight"><i class="swatch" style="width:10px;height:10px;background:#fff"></i><span class="grow">Contingency</span><b>${short(b.contingency)}</b></div></div></div>
          <div class="small muted mt">Allocation is rule-based and summed in whole paise. <a href="#" data-go="budget">See why each share</a>.</div></div>
        <div class="card"><h3>Best-fitting venues for ${sp.guests} guests</h3>
          ${p.venue_fit.slice(0, 4).map(v => `<div class="row" style="margin:4px 0"><span class="chip ${v.fits ? "ok" : "bad"}">${v.fits ? "fits" : v.fails + " fail"}</span><b class="grow">${esc(v.name)}</b><span class="small muted">${v.fill_pct}% full</span></div>`).join("")}
          <div class="mt"><a href="#" data-go="vision">Open the Vision studio</a></div></div>
        <div class="card"><h3>Take it with you</h3><div class="row">
          <a class="btn ghost sm" href="/api/projects/${S.pid}/export/pdf">PDF plan</a><a class="btn ghost sm" href="/api/projects/${S.pid}/export/ics">Calendar (.ics)</a>
          <a class="btn ghost sm" href="/api/projects/${S.pid}/export/gif">Walkthrough GIF</a><a class="btn ghost sm" href="/api/projects/${S.pid}/export/digest">Weekly digest</a></div></div>
      </div>
    </div>`;
  },
  bind(root) {
    const btn = $("#ov-war-toggle", root);
    if (btn) {
      btn.onclick = () => {
        OV.warRoom = !OV.warRoom;
        if (typeof render === "function") render();
      };
    }
  },
};
