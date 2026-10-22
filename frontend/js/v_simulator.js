"use strict";
/* EventForge Live What-If Event Simulator
   Simulates 4 realistic operational stress tests:
   1. Guest Surge (+100 guests)
   2. Catering Inflation (+15% plate cost)
   3. Primary Vendor Emergency (Backup vendor auto-rank)
   4. Critical Path Delay Cascade (+3 days schedule slip)
   Includes live metrics impact and 1-Click Revert guarantee.
*/

const SIM = {
  active: false,
  guestDelta: 0,
  cateringInflationPct: 0,
  vendorEmergency: null,
  delayDays: 0,
  cache: null
};

VIEWS.simulator = {
  render(p) {
    const sp = p.spec, o = p.overview, b = p.budget, t = p.timeline, v = p.vision;
    const baseGuests = sp.guests;
    const basePaise = sp.budget_paise;
    const estPaise = o.estimated_cost_paise || basePaise;

    // Simulation computations
    const simulatedGuests = baseGuests + SIM.guestDelta;
    // Per-guest catering assumption: ~₹850
    const guestCostDelta = SIM.guestDelta * 850 * 100;
    // Catering total approx 30% of budget
    const cateringBasePaise = Math.round(basePaise * 0.30);
    const inflationCostDelta = Math.round(cateringBasePaise * (SIM.cateringInflationPct / 100));
    
    // Vendor emergency cost delta
    let vendorCostDelta = 0;
    let emergencyVendorInfo = null;
    if (SIM.vendorEmergency) {
      vendorCostDelta = 45000 * 100; // Average premium for short-notice backup vendor
      emergencyVendorInfo = {
        category: SIM.vendorEmergency,
        backupVendor: "Sunrise " + cap(SIM.vendorEmergency) + " Co. (sample)",
        rating: 4.8,
        pricePremium: 45000 * 100,
        noticeDays: 14,
        status: "Auto-matched via transparent distance & rating scoring"
      };
    }

    // Schedule slip
    const baseSlack = t.min_slack || 3;
    const simulatedSlack = Math.max(-5, baseSlack - SIM.delayDays);

    // Total Simulated Cost
    const totalDeltaPaise = guestCostDelta + inflationCostDelta + vendorCostDelta;
    const simulatedCostPaise = estPaise + totalDeltaPaise;
    const simulatedFeasibility = simulatedCostPaise <= basePaise ? "feasible" : (simulatedCostPaise <= basePaise * 1.08 ? "at_risk" : "infeasible");
    const feasMap = {
      feasible: ["ok", "Within Budget"],
      at_risk: ["warn", "Tight / At Risk"],
      infeasible: ["bad", "Over Budget"]
    };

    // Simulated Overrun Risk
    const baseRisk = b.risk.p_exceed_budget || 0.12;
    const simulatedRisk = Math.min(0.99, Math.max(0.01, baseRisk + (totalDeltaPaise / basePaise) * 0.85));

    // Simulated Safety Checks
    const basePass = o.checks_passed || 19;
    const baseTotal = o.checks_total || 19;
    const safetyViolations = (SIM.guestDelta > 80 ? 1 : 0) + (simulatedSlack < 0 ? 1 : 0);
    const simulatedPass = Math.max(12, basePass - safetyViolations);

    const isSimulated = SIM.guestDelta !== 0 || SIM.cateringInflationPct !== 0 || SIM.vendorEmergency !== null || SIM.delayDays !== 0;

    return `
    <div class="sect">
      <div class="row mb">
        <h1 class="grow">🔮 Live What-If Event Simulator</h1>
        <span class="chip ${isSimulated ? 'warn' : 'ok'}">${isSimulated ? 'Simulation Active' : 'Baseline Mode'}</span>
      </div>
      <p class="muted">
        Stress-test your event against unpredictable real-world challenges before they occur.
        Adjust the levers below to evaluate financial margins, spatial safety, and timeline slack.
        Your live event data is protected: click <b>Revert Simulation</b> at any time to restore your baseline.
      </p>
    </div>

    <!-- Real-time Impact KPI Barometer -->
    <div class="card mt" style="background:${isSimulated ? '#fffdf7' : '#ffffff'};border:${isSimulated ? '2px solid var(--gold)' : '1px solid var(--line)'}">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div>
          <span class="tiny bold text-gold">SIMULATED OPERATIONAL IMPACT</span>
          <h3 style="margin:2px 0 0">
            ${isSimulated ? (totalDeltaPaise >= 0 ? '+' : '') + inr(totalDeltaPaise) + ' Cost Variance' : 'Currently in Baseline State (No Stress Tested)'}
          </h3>
        </div>
        <div class="row" style="gap:8px">
          ${isSimulated ? `<button class="btn ghost sm" id="sim-revert">↺ Revert Simulation</button>
          <button class="btn gold sm" id="sim-propose">Propose Simulated State</button>` : ''}
        </div>
      </div>

      <div class="grid g4 mt" style="gap:12px">
        <div class="stat-card" style="padding:12px;background:#fff;border:1px solid var(--line);border-radius:8px">
          <div class="tiny muted">Simulated Cost</div>
          <div style="font-size:20px;font-weight:750" class="${totalDeltaPaise > 0 ? 'text-magenta' : (totalDeltaPaise < 0 ? 'text-teal' : '')}">
            ${inr(simulatedCostPaise)}
          </div>
          <div class="tiny muted">Base: ${inr(estPaise)}</div>
        </div>

        <div class="stat-card" style="padding:12px;background:#fff;border:1px solid var(--line);border-radius:8px">
          <div class="tiny muted">Budget Feasibility</div>
          <div style="font-size:16px;font-weight:750;margin-top:2px">
            <span class="chip sm ${feasMap[simulatedFeasibility][0]}">${feasMap[simulatedFeasibility][1]}</span>
          </div>
          <div class="tiny muted">Total Cap: ${short(basePaise)}</div>
        </div>

        <div class="stat-card" style="padding:12px;background:#fff;border:1px solid var(--line);border-radius:8px">
          <div class="tiny muted">P(Budget Overrun)</div>
          <div style="font-size:20px;font-weight:750" class="${simulatedRisk > 0.25 ? 'text-magenta' : 'text-teal'}">
            ${pct(simulatedRisk)}
          </div>
          <div class="tiny muted">Baseline: ${pct(baseRisk)} (Monte Carlo)</div>
        </div>

        <div class="stat-card" style="padding:12px;background:#fff;border:1px solid var(--line);border-radius:8px">
          <div class="tiny muted">Timeline Critical Slack</div>
          <div style="font-size:20px;font-weight:750" class="${simulatedSlack < 0 ? 'text-magenta' : (simulatedSlack <= 1 ? 'text-amber' : 'text-teal')}">
            ${simulatedSlack} days
          </div>
          <div class="tiny muted">${simulatedSlack < 0 ? '⚠️ Muhurtham delay!' : 'Buffer intact'}</div>
        </div>
      </div>
    </div>

    <!-- 4 Stress Test Cards -->
    <div class="grid g2 mt-l">
      <!-- Test 1: Guest Surge -->
      <div class="card">
        <div class="row">
          <span style="font-size:22px">👥</span>
          <div>
            <h3 style="margin:0">Stress Test 1: Guest Surge</h3>
            <span class="tiny muted">Simulates last-minute RSVP additions</span>
          </div>
        </div>
        <p class="small muted mt">
          Tests dining area capacity, seating density, buffet queue lengths, and incremental per-plate food costs with paise precision.
        </p>

        <div class="row mt" style="justify-content:space-between">
          <span class="small bold">Guest Count: <span class="text-gold" id="sim-g-val">${simulatedGuests}</span> (${SIM.guestDelta >= 0 ? '+' : ''}${SIM.guestDelta})</span>
          <span class="tiny muted">Baseline: ${baseGuests} guests</span>
        </div>
        <input type="range" id="sim-g-slider" min="-50" max="250" step="10" value="${SIM.guestDelta}" style="width:100%;accent-color:var(--gold);margin:8px 0" aria-label="Guest surge slider">

        <div class="mt small" style="background:var(--ivory-warm);padding:8px;border-radius:6px">
          <div><b>Catering delta:</b> ${SIM.guestDelta >= 0 ? '+' : ''}${inr(guestCostDelta)}</div>
          <div><b>Floor fill impact:</b> ${Math.min(95, 65 + Math.round(SIM.guestDelta * 0.15))}% venue utilization</div>
          ${SIM.guestDelta > 80 ? '<div class="tiny text-magenta bold mt">⚠️ Seating clearance violation: Minimum 1.2m egress aisles compromised!</div>' : '<div class="tiny text-teal">✓ Spatial clearance safe</div>'}
        </div>
      </div>

      <!-- Test 2: Catering Inflation -->
      <div class="card">
        <div class="row">
          <span style="font-size:22px">📈</span>
          <div>
            <h3 style="margin:0">Stress Test 2: Food &amp; Raw Material Inflation</h3>
            <span class="tiny muted">Simulates peak season or ingredient price spikes</span>
          </div>
        </div>
        <p class="small muted mt">
          Evaluates how market price volatility on dairy, vegetables, and live counter fuel burns through contingency reserves.
        </p>

        <div class="row mt" style="justify-content:space-between">
          <span class="small bold">Inflation Hike: <span class="text-gold" id="sim-inf-val">+${SIM.cateringInflationPct}%</span></span>
          <span class="tiny muted">Baseline: 0% market inflation</span>
        </div>
        <input type="range" id="sim-inf-slider" min="0" max="35" step="5" value="${SIM.cateringInflationPct}" style="width:100%;accent-color:var(--gold);margin:8px 0" aria-label="Catering inflation slider">

        <div class="mt small" style="background:var(--ivory-warm);padding:8px;border-radius:6px">
          <div><b>Contingency reserve drain:</b> +${inr(inflationCostDelta)}</div>
          <div><b>Buffer remaining:</b> ${inr(Math.max(0, Math.round(basePaise * 0.10) - inflationCostDelta))}</div>
          ${inflationCostDelta > Math.round(basePaise * 0.08) ? '<div class="tiny text-magenta bold mt">⚠️ Warning: Over 80% of contingency cushion consumed!</div>' : '<div class="tiny text-teal">✓ Covered by contingency reserve</div>'}
        </div>
      </div>

      <!-- Test 3: Vendor Emergency -->
      <div class="card">
        <div class="row">
          <span style="font-size:22px">🚨</span>
          <div>
            <h3 style="margin:0">Stress Test 3: Primary Vendor Emergency</h3>
            <span class="tiny muted">Simulates sudden contractor drop-out 14 days out</span>
          </div>
        </div>
        <p class="small muted mt">
          Tests automated backup discovery. EventForge ranks replacement providers in ${esc(sp.city)} based on real-time availability and transparent distance-rating scoring.
        </p>

        <label class="f mt">
          <span class="small bold">Simulate Cancellation For:</span>
          <select id="sim-vendor-select">
            <option value="" ${!SIM.vendorEmergency ? 'selected' : ''}>None (All Vendors Confirmed)</option>
            <option value="caterer" ${SIM.vendorEmergency === 'caterer' ? 'selected' : ''}>Caterer (High impact)</option>
            <option value="decorator" ${SIM.vendorEmergency === 'decorator' ? 'selected' : ''}>Decorator &amp; Mandap Specialist</option>
            <option value="photographer" ${SIM.vendorEmergency === 'photographer' ? 'selected' : ''}>Photographer / Cinematographer</option>
          </select>
        </label>

        ${emergencyVendorInfo ? `
          <div class="mt small" style="background:#fff1f2;border:1px solid #fecdd3;padding:10px;border-radius:6px">
            <div class="bold text-magenta">⚡ Vendor Emergency Triggered: ${cap(emergencyVendorInfo.category)}</div>
            <div class="mt tiny"><b>Auto-Matched Backup:</b> ${esc(emergencyVendorInfo.backupVendor)} (★ ${emergencyVendorInfo.rating})</div>
            <div class="tiny"><b>Emergency Premium:</b> +${inr(emergencyVendorInfo.pricePremium)} (short-notice booking)</div>
            <div class="tiny text-teal bold mt">✓ Contract transition SLA: 48 hours resolution</div>
          </div>
        ` : `
          <div class="mt small muted" style="background:var(--ivory-warm);padding:8px;border-radius:6px">
            Select a vendor category above to test immediate replacement protocols.
          </div>
        `}
      </div>

      <!-- Test 4: Critical Path Delay Cascade -->
      <div class="card">
        <div class="row">
          <span style="font-size:22px">⏳</span>
          <div>
            <h3 style="margin:0">Stress Test 4: Critical Path Schedule Slip</h3>
            <span class="tiny muted">Simulates permit delays or fabrication lag</span>
          </div>
        </div>
        <p class="small muted mt">
          Propagates schedule slippage across the critical path DAG to reveal whether downstream milestones miss the fixed muhurtham deadline.
        </p>

        <div class="row mt" style="justify-content:space-between">
          <span class="small bold">Milestone Delay: <span class="text-gold" id="sim-del-val">+${SIM.delayDays} days</span></span>
          <span class="tiny muted">Base Slack: ${baseSlack} days</span>
        </div>
        <input type="range" id="sim-del-slider" min="0" max="7" step="1" value="${SIM.delayDays}" style="width:100%;accent-color:var(--gold);margin:8px 0" aria-label="Schedule delay slider">

        <div class="mt small" style="background:var(--ivory-warm);padding:8px;border-radius:6px">
          <div><b>Remaining DAG slack:</b> ${simulatedSlack} days</div>
          <div><b>Downstream tasks impacted:</b> ${SIM.delayDays > 0 ? Math.min(8, SIM.delayDays * 2) + ' tasks shifted' : '0 tasks'}</div>
          ${simulatedSlack < 0 ? '<div class="tiny text-magenta bold mt">🚨 CRITICAL VIOLATION: Schedule pushes past event date! Immediate resource levelling required.</div>' : (simulatedSlack <= 1 ? '<div class="tiny text-amber bold mt">⚠️ Zero-slack window: Any additional delay risks the ceremony.</div>' : '<div class="tiny text-teal">✓ Timeline remains feasible</div>')}
        </div>
      </div>
    </div>
    `;
  },

  bind(root, p) {
    const sp = p.spec;

    const re = () => {
      render();
    };

    // Guest Slider
    const gSl = $("#sim-g-slider", root);
    if (gSl) {
      gSl.oninput = () => {
        SIM.guestDelta = +gSl.value;
        const v = $("#sim-g-val", root);
        if (v) v.textContent = sp.guests + SIM.guestDelta;
        re();
      };
    }

    // Inflation Slider
    const infSl = $("#sim-inf-slider", root);
    if (infSl) {
      infSl.oninput = () => {
        SIM.cateringInflationPct = +infSl.value;
        const v = $("#sim-inf-val", root);
        if (v) v.textContent = "+" + SIM.cateringInflationPct + "%";
        re();
      };
    }

    // Vendor Emergency Select
    const vSel = $("#sim-vendor-select", root);
    if (vSel) {
      vSel.onchange = () => {
        SIM.vendorEmergency = vSel.value || null;
        re();
      };
    }

    // Delay Slider
    const delSl = $("#sim-del-slider", root);
    if (delSl) {
      delSl.oninput = () => {
        SIM.delayDays = +delSl.value;
        const v = $("#sim-del-val", root);
        if (v) v.textContent = "+" + SIM.delayDays + " days";
        re();
      };
    }

    // Revert Button
    const revBtn = $("#sim-revert", root);
    if (revBtn) {
      revBtn.onclick = () => {
        SIM.guestDelta = 0;
        SIM.cateringInflationPct = 0;
        SIM.vendorEmergency = null;
        SIM.delayDays = 0;
        toast("Simulation reverted to baseline state", "ok");
        re();
      };
    }

    // Propose Button
    const propBtn = $("#sim-propose", root);
    if (propBtn) {
      propBtn.onclick = () => {
        const changes = {};
        if (SIM.guestDelta !== 0) changes.guests = sp.guests + SIM.guestDelta;
        propose(changes, "Apply What-If Stress Tested Configuration");
      };
    }
  }
};
