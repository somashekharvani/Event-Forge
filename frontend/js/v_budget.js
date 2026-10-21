"use strict";
VIEWS.budget = {
  render(p) {
    const b = p.budget, r = b.risk, ex = p.expenses, W = p.spec;
    const sens = r.sensitivity.slice(0, 6), mx = Math.max(...sens.map(s => s.variance_share), .01);
    const lab = k => (b.categories.find(c => c.key === k) || {}).label || k;
    return `
    <div class="sect"><h1>Budget</h1><p class="muted">${esc(b.disclaimer)}</p></div>
    <div class="grid g-side">
      <div class="col">
        <div class="card"><h3>Allocation and why</h3><div class="tbl-wrap"><table>
          <thead><tr><th>Category</th><th class="right">Share</th><th class="right">Allocated</th><th class="right">Expected cost</th><th>Status</th></tr></thead><tbody>
          ${b.categories.map(c => `<tr title="${esc(c.why)}"><td><b>${esc(c.label)}</b><div class="tiny muted">${esc(c.why)}</div></td><td class="right">${Math.round(c.weight * 100)}%</td><td class="right">${inr(c.allocated)}</td>
            <td class="right">${inr(Math.round(c.estimate.exp / 100) * 100)}<div class="tiny muted">${short(c.estimate.low)}–${short(c.estimate.high)}</div></td><td><span class="chip ${c.status === "ok" ? "ok" : c.status === "over" ? "bad" : "warn"}">${c.status}</span></td></tr>`).join("")}
          <tr><td><b>Contingency</b><div class="tiny muted">${b.contingency_pct}% — ${esc(b.contingency_why)}</div></td><td class="right">${b.contingency_pct}%</td><td class="right">${inr(b.contingency)}</td><td></td><td></td></tr>
          <tr><td><b>Total</b></td><td></td><td class="right"><b>${inr(b.total)}</b></td><td class="right"><b>${inr(Math.round(b.estimate_total.exp / 100) * 100)}</b></td><td></td></tr></tbody></table></div>
          <div class="small muted mt">All amounts add up exactly (checked in whole paise). Per head: ${inr(b.per_head_total)}.</div></div>
        <div class="card"><h3>How likely is an overrun?</h3>
          ${histogram(r, b.total)}
          <div class="row mt"><span class="chip ${r.p_exceed_budget > .3 ? "bad" : r.p_exceed_budget > .15 ? "warn" : "ok"}">${pct(r.p_exceed_budget)} chance of exceeding ${short(b.total)}</span>
            <span class="small muted">without contingency: ${pct(r.p_exceed_without_contingency)}</span></div>
          <div class="small mt">Typical (P50) ${short(r.percentiles[50])} · bad case (P90) ${short(r.percentiles[90])}. For ${r.confidence_target_pct}% confidence keep a reserve of ${short(r.reserve_for_target)}.</div>
          <div class="small muted">${esc(r.label)} (${r.n.toLocaleString()} runs, seed ${r.seed}).</div>
          <h3 class="mt">What drives the uncertainty</h3>${sens.map(s => barRow(lab(s.key), s.variance_share, mx, "#3a4db8", Math.round(s.variance_share * 100) + "% of variance")).join("")}</div>
        <div class="card"><h3>Expense tracker</h3>
          <div class="row"><select id="x-cat">${b.categories.map(c => `<option value="${c.key}">${esc(c.label)}</option>`).join("")}</select>
            <select id="x-kind"><option value="paid">Paid</option><option value="committed">Committed (quoted/booked)</option></select>
            <input id="x-amt" type="number" min="1" placeholder="Amount ₹" style="width:120px"><input id="x-note" placeholder="Note" class="grow"><button class="btn sm" id="x-add">Add</button></div>
          <div class="tbl-wrap mt"><table><thead><tr><th>Category</th><th class="right">Planned</th><th class="right">Paid</th><th class="right">Committed</th><th class="right">Forecast</th><th></th></tr></thead><tbody>
          ${ex.rows.map(x => `<tr><td>${esc(x.label)}</td><td class="right">${short(x.planned)}</td><td class="right">${short(x.paid)}</td><td class="right">${short(x.committed)}</td><td class="right">${short(x.forecast)}</td><td><span class="chip ${x.status === "ok" ? "ok" : x.status === "over" ? "bad" : "warn"}">${x.status}</span></td></tr>`).join("")}</tbody></table></div>
          <div class="small mt">Paid ${short(ex.paid)} · committed ${short(ex.committed)} · forecast ${short(ex.forecast)} · remaining ${short(ex.remaining)}</div>
          ${ex.warnings.map(w => `<div class="callout warn small mt">${esc(typeof w === "string" ? w : w.text || JSON.stringify(w))}</div>`).join("")}
          ${(S.plan_expenses || []).length ? "" : ""}</div>
      </div>
      <div class="col">
        <div class="card"><h3>What-if simulator</h3><div class="small muted">Nothing changes until you review and apply.</div>
          <label class="f mt">Guests <b id="w-gv">${W.guests}</b><input type="range" id="w-g" min="10" max="${Math.max(800, W.guests * 2)}" step="5" value="${W.guests}"></label>
          <label class="f">Budget (₹)<input id="w-b" type="number" step="10000" value="${b.total / 100}"></label>
          <label class="f">Days<input id="w-d" type="number" min="1" max="7" value="${W.days}"></label>
          <label class="f">Food<select id="w-diet">${["veg", "mostly_veg", "mixed", "nonveg", "jain"].map(v => `<option ${W.diet === v ? "selected" : ""} value="${v}">${cap(v)}</option>`).join("")}</select></label>
          <div id="w-out" class="mt small muted">Move a control to see the effect.</div></div>
        <div class="card"><h3>Optimizer &amp; Pareto Strategies</h3><div class="small muted">Finds the optimal mathematical trade-offs between budget savings and event compromises.</div>
          <div class="col mt" style="gap:10px">
            ${(b.pareto_strategies || []).map(ps => `
              <div class="finding" style="border:1px solid #e2e8f0;border-radius:6px;padding:10px;background:#fff">
                <div class="row"><b class="grow">${ps.icon} ${esc(ps.name)}</b><span class="chip ok">Saves ${esc(ps.saving_fmt)}</span></div>
                <div class="tiny mt" style="color:#0f7b6c"><b>✓ Keeps:</b> ${esc(ps.keeps)}</div>
                <div class="tiny mt" style="color:#b3225e"><b>✗ Compromise:</b> ${esc(ps.gives_up)}</div>
                <button class="btn ghost sm mt" data-pareto='${JSON.stringify(ps.changes)}'>Preview this strategy</button>
              </div>
            `).join("")}
          </div>
          <div class="mt"><button class="btn ghost sm" id="o-run">Run greedy lever solver</button><div id="o-out" class="mt small"></div></div></div>

        <div class="card">
          <div class="row"><h3 class="grow" style="margin:0">GST &amp; Surcharge Audit</h3><span class="chip warn">Tax Risk</span></div>
          <p class="tiny muted" style="margin:4px 0 8px">${esc(b.tax_audit ? b.tax_audit.disclaimer : "Typical rates — verify with your CA")}</p>
          ${b.tax_audit ? `
            <div class="callout warn small">
              <div>Estimated GST: <b>${esc(b.tax_audit.total_tax_fmt)}</b> · Surcharges: <b>${esc(b.tax_audit.surcharges_fmt)}</b></div>
              <div class="mt">Forecast Out-of-Pocket: <b>${esc(b.tax_audit.true_cost_fmt)}</b> (+${b.tax_audit.tax_inflation_pct}% over base quotes).</div>
              <div class="tiny muted mt">${esc(b.tax_audit.surcharges_detail)}</div>
            </div>
            <details class="mt small"><summary>Category GST Breakdown</summary>
              <div class="tbl-wrap mt"><table><thead><tr><th>Category</th><th class="right">Rate</th><th class="right">Est. Tax</th></tr></thead><tbody>
              ${b.tax_audit.rows.map(tr => `<tr><td>${esc(tr.label)}<div class="tiny muted">${esc(tr.rule)}</div></td><td class="right">${tr.rate_pct}%</td><td class="right">${esc(tr.tax_fmt)}</td></tr>`).join("")}
              </tbody></table></div>
            </details>
          ` : ''}
        </div>

        <div class="card"><h3>Priorities</h3><div class="small muted">Weights are rule-based and editable. Current priorities: ${W.priorities.length ? W.priorities.join(", ") : "none set"}.</div>
          <div class="row mt">${["food", "decor", "photography", "music", "venue"].map(v => `<label class="row tight"><input type="checkbox" data-pri="${v}" ${W.priorities.includes(v) ? "checked" : ""}> ${v}</label>`).join("")}</div>
          <button class="btn ghost sm mt" id="pri-go">Review change</button></div>
      </div>
    </div>`;
  },
  bind(root, p) {
    const out = $("#w-out", root);
    const cur = () => ({ guests: +$("#w-g", root).value, budget_rupees: +$("#w-b", root).value, days: +$("#w-d", root).value, diet: $("#w-diet", root).value });
    const diff = () => { const c = cur(), ch = {}; if (c.guests !== p.spec.guests) ch.guests = c.guests; if (c.budget_rupees * 100 !== p.budget.total) ch.budget_rupees = c.budget_rupees; if (c.days !== p.spec.days) ch.days = c.days; if (c.diet !== p.spec.diet) ch.diet = c.diet; return ch; };
    const run = debounce(async () => {
      const ch = diff(); if (!Object.keys(ch).length) { out.innerHTML = "Move a control to see the effect."; return; }
      try {
        const w = await api(`/projects/${S.pid}/whatif`, { body: { changes: ch } });
        out.innerHTML = `<div>Expected cost ${short(w.before.estimate)} → <b class="${w.estimate_delta > 0 ? "delta-up" : "delta-down"}">${short(w.after.estimate)}</b> (${w.estimate_delta >= 0 ? "+" : ""}${short(w.estimate_delta)})</div>
          <div>Overrun chance ${pct(w.before.p_exceed)} → <b>${pct(w.after.p_exceed)}</b> · ${w.after.feasibility.replace("_", " ")}</div>
          ${w.shortfall_vs_budget > 0 ? `<div style="color:var(--magenta)">Short by ${short(w.shortfall_vs_budget)} against the budget</div>` : ""}
          <div class="tiny muted mt">${w.categories.filter(c => c.est_delta).slice(0, 4).map(c => `${esc(c.label)} ${c.est_delta > 0 ? "+" : ""}${short(c.est_delta)}`).join(" · ")}</div>
          <button class="btn gold sm mt" id="w-apply">Review &amp; apply</button>`;
        $("#w-apply", root).onclick = () => propose(ch);
      } catch (e) { out.textContent = e.message; }
    }, 250);
    ["w-g", "w-b", "w-d", "w-diet"].forEach(id => $("#" + id, root).oninput = () => { $("#w-gv", root).textContent = $("#w-g", root).value; run(); });
    $("#o-run", root).onclick = () => guard(async () => {
      const o = await api(`/projects/${S.pid}/optimize`, { body: {} }), el = $("#o-out", root);
      if (o.needed === false) { el.innerHTML = `<div class="callout ok">${esc(o.message)}</div>`; return; }
      el.innerHTML = `<div>${esc(o.message || "")}</div>${o.steps.map(s => `<div class="finding"><b>${esc(s.label || s.lever)}</b> <span class="delta-down">saves ${short(s.saving)}</span><div class="tiny muted">${esc(s.detail || s.note || "")}</div></div>`).join("")}
        <div class="small">Cost ${short(o.before)} → ${short(o.after)} (target ${short(o.target)})</div>`;
    });
    $("#pri-go", root).onclick = () => propose({ priorities: $$("[data-pri]", root).filter(c => c.checked).map(c => c.dataset.pri) });
    $$("[data-pareto]", root).forEach(btn => {
      btn.onclick = () => {
        try {
          const ch = JSON.parse(btn.dataset.pareto);
          propose(ch);
        } catch (e) { toast(e.message, "bad"); }
      };
    });
    $("#x-add", root).onclick = () => guard(async () => {
      const amt = +$("#x-amt", root).value; if (!(amt > 0)) return toast("Enter an amount", "bad");
      setPlan(await api(`/projects/${S.pid}/expenses`, { body: { category: $("#x-cat", root).value, kind: $("#x-kind", root).value, amount_rupees: amt, note: $("#x-note", root).value } }));
    });
  },
};
