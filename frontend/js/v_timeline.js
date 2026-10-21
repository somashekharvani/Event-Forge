"use strict";
VIEWS.timeline = {
  render(p) {
    const t = p.timeline, tasks = t.tasks, total = Math.max(...tasks.map(x => x.lf_day), t.days_to_event) + 3;
    const banner = t.status === "infeasible"
      ? `<div class="callout bad"><b>This date can't be met.</b> The critical path needs ${t.critical_path_days} days but only ${t.days_to_event} remain (short by ${t.shortfall_days}). Earliest feasible date: <b>${fdate(t.earliest_feasible_date)}</b>.
         ${t.crash ? `<div class="small mt">Compressing tasks could recover ${t.crash.days_saved || ""} day(s): ${(t.crash.steps || []).map(s => esc(s.name || s)).join("; ")}.</div>` : ""}
         <div class="row mt"><button class="btn gold sm" id="t-move">Review moving the date</button></div></div>`
      : `<div class="callout ${t.status === "at_risk" ? "warn" : "ok"}">${t.status === "at_risk" ? "On track but tight." : "Feasible."} Critical path ${t.critical_path_days} days of ${t.days_to_event}; minimum slack ${t.min_slack} days. Earliest feasible date would be ${fdate(t.earliest_feasible_date)}.</div>`;
    const rowH = 26, W = 880, L = 250, X = d => L + d / total * (W - L - 10), H = tasks.length * rowH + 30;
    let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Task timeline"><rect width="${W}" height="${H}" fill="#fff"/>`;
    for (let d = 0; d <= total; d += 14) g += `<line x1="${X(d)}" y1="20" x2="${X(d)}" y2="${H}" stroke="#eef0f6"/><text x="${X(d)}" y="13" font-size="10" fill="#7a849e">${d ? "+" + d + "d" : "today"}</text>`;
    const pos = {}; tasks.forEach((x, i) => pos[x.id] = i);
    tasks.forEach((x, i) => {
      const y = 24 + i * rowH, col = x.status === "done" ? "#9aa5c0" : x.critical ? "#b3225e" : "#3a4db8";
      g += `<text x="6" y="${y + 14}" font-size="11" fill="#1b2238">${esc(x.name.length > 38 ? x.name.slice(0, 37) + "…" : x.name)}</text>
        <rect x="${X(x.start_day)}" y="${y + 3}" width="${Math.max(3, X(x.end_day) - X(x.start_day))}" height="14" rx="3" fill="${col}"/>
        ${x.lf_day > x.end_day ? `<rect x="${X(x.end_day)}" y="${y + 8}" width="${X(x.lf_day) - X(x.end_day)}" height="4" fill="#cfd5e6"/>` : ""}
        <title>${esc(x.name)} · ${x.start} → ${x.end} · slack ${x.slack}d${x.critical ? " · critical" : ""}</title>`;
      x.deps.forEach(d => { if (pos[d] != null) { const a = tasks[pos[d]], y0 = 24 + pos[d] * rowH + 10; g += `<path d="M${X(a.end_day)} ${y0} L${X(a.end_day) + 4} ${y0} L${X(a.end_day) + 4} ${y + 10} L${X(x.start_day)} ${y + 10}" fill="none" stroke="#c9cfe3" stroke-width="1"/>`; } });
    });
    g += `<line x1="${X(t.days_to_event)}" y1="18" x2="${X(t.days_to_event)}" y2="${H}" stroke="#f0a500" stroke-width="2"/><text x="${X(t.days_to_event) - 4}" y="${H - 4}" text-anchor="end" font-size="10" font-weight="700" fill="#9a6a00">Event day</text></svg>`;
    const load = t.load, lm = Math.max(...load, 1);
    return `
    <div class="sect"><h1>Timeline</h1><p class="muted">${esc(t.algorithm)}</p></div>${banner}
    <div class="grid g-side mt"><div class="col">
      <div class="card"><div class="row"><h3 class="grow">Schedule</h3><span class="small"><i class="swatch" style="background:#b3225e"></i> critical &nbsp;<i class="swatch" style="background:#3a4db8"></i> flexible &nbsp;<i class="swatch" style="background:#cfd5e6"></i> slack</span></div>
        <div class="gantt-wrap">${g}</div></div>
      <div class="card"><h3>Tasks</h3><div class="tbl-wrap"><table><thead><tr><th>Task</th><th>Dates</th><th class="right">Slack</th><th></th></tr></thead><tbody>
        ${tasks.map(x => `<tr><td><label class="row tight"><input type="checkbox" data-done="${x.id}" ${x.status === "done" ? "checked" : ""}> <span style="${x.status === "done" ? "text-decoration:line-through" : ""}">${esc(x.name)}</span></label>
          <div class="tiny muted">${esc(x.phase)}${x.note ? " · " + esc(x.note) : ""}</div></td><td class="nowrap small">${fdate(x.start, { day: "numeric", month: "short" })} → ${fdate(x.end, { day: "numeric", month: "short" })}</td>
          <td class="right"><span class="chip ${x.risk === "ok" ? (x.critical ? "warn" : "") : "bad"}">${x.critical ? "critical" : x.slack + "d"}</span></td>
          <td class="nowrap"><button class="btn ghost sm" data-delay="${x.id}" title="Add 7 days">+7d</button></td></tr>`).join("")}</tbody></table></div></div>
    </div><div class="col">
      <div class="card"><h3>Coordinators</h3><div class="small muted">How many people can work in parallel. Fewer people stretch the plan.</div>
        <div class="row mt"><input type="range" id="t-co" min="1" max="6" value="${t.coordinators}"><b id="t-cv">${t.coordinators}</b><button class="btn ghost sm" id="t-co-go">Review</button></div>
        <div class="small mt">Resource load per day (peak ${lm}):</div>
        <svg viewBox="0 0 300 40" width="100%">${load.slice(0, 150).map((v, i) => `<rect x="${i * 2}" y="${40 - v / lm * 38}" width="1.6" height="${v / lm * 38}" fill="#3a4db8"/>`).join("")}</svg>
        ${t.resource_tardiness ? `<div class="small" style="color:var(--magenta)">Capacity causes ${t.resource_tardiness} day(s) of delay.</div>` : ""}</div>
      <div class="card"><h3>Move the event date</h3><div class="row"><input type="date" id="t-date" value="${p.spec.date}"><button class="btn ghost sm" id="t-date-go">Review</button></div></div>
      <div class="card"><h3>Weekly digest</h3>${p.digest.weeks.slice(0, 3).map(w => `<div class="finding"><b>Week of ${fdate(w.from, { day: "numeric", month: "short" })}</b>
        ${w.start.length ? `<div class="small">Start: ${w.start.map(esc).join("; ")}</div>` : ""}${w.due.length ? `<div class="small">Due: ${w.due.map(esc).join("; ")}</div>` : ""}${w.at_risk.length ? `<div class="small" style="color:var(--magenta)">At risk: ${w.at_risk.map(esc).join("; ")}</div>` : ""}</div>`).join("")}
        <div class="row mt"><a class="btn ghost sm" href="/api/projects/${S.pid}/export/digest">Digest (.txt)</a><a class="btn ghost sm" href="/api/projects/${S.pid}/export/ics">Calendar (.ics)</a></div></div>
    </div></div>`;
  },
  bind(root, p) {
    const t = p.timeline;
    $$("[data-done]", root).forEach(c => c.onchange = () => propose({ task: { id: c.dataset.done, status: c.checked ? "done" : "pending" } }));
    $$("[data-delay]", root).forEach(b => b.onclick = () => { const x = t.tasks.find(y => y.id === b.dataset.delay); propose({ task: { id: x.id, delay_days: 7 } }); });
    $("#t-co", root).oninput = e => $("#t-cv", root).textContent = e.target.value;
    $("#t-co-go", root).onclick = () => propose({ coordinators: +$("#t-co", root).value });
    $("#t-date-go", root).onclick = () => propose({ date: $("#t-date", root).value });
    const mv = $("#t-move", root); if (mv) mv.onclick = () => propose({ date: t.earliest_feasible_date });
  },
};
