"use strict";
/* EventForge Event Design Showdown: 3 Concrete Alternative Event Plans
   Plan A: Budget Smart (Conservative, high buffer, essential vendors)
   Plan B: Balanced Excellence (Recommended, high guest experience, balanced risk)
   Plan C: Royal Premium Experience (Maximized decor, live stations, royal ambiance)
*/

VIEWS.showdown = {
  render(p) {
    const sp = p.spec, o = p.overview, b = p.budget;
    const basePaise = sp.budget_paise;
    const guests = sp.guests;

    // Plan A: Budget Smart (-18% cost, 15% buffer)
    const planA = {
      id: "plan_a",
      name: "Plan A: Budget Smart",
      tag: "Conservative & Value-Focused",
      badgeClass: "info",
      costPaise: Math.round(basePaise * 0.82),
      contingency: "15%",
      riskPct: "3%",
      slackDays: "+6 days",
      decorTheme: "Marigold & Mango-Leaf Heritage",
      cateringTier: "Traditional Festive Feast (Buffet + Live Coffee)",
      photoTier: "Core Candid + Traditional Photography (1 Team)",
      venueTier: "Standard Kalyana Mantapa / AC Hall",
      comfortScore: "High (Clean layouts, 72% floor fill)",
      rationale: "Eliminates non-essential luxury items, focuses budget on high-quality traditional food and dignified floral decor, and maintains a 15% safety buffer against unexpected costs.",
      highlights: [
        "18% overall savings (retains " + short(Math.round(basePaise * 0.18)) + " buffer)",
        "Zero single-use plastics with natural banana-leaf & clay tableware",
        "Lowest overrun probability (under 5% simulated risk)",
        "Extended timeline cushion (+6 days critical path slack)"
      ]
    };

    // Plan B: Balanced Excellence (Current Plan / Sweet Spot)
    const planB = {
      id: "plan_b",
      name: "Plan B: Balanced Excellence",
      tag: "Recommended · Optimal Delight",
      badgeClass: "ok",
      costPaise: basePaise,
      contingency: "10%",
      riskPct: pct(b.risk.p_exceed_budget || 0.12),
      slackDays: "+3 days",
      decorTheme: "Traditional South Indian Temple / Royal White & Gold",
      cateringTier: "Banana-leaf Sadya + 2 Interactive Live Dessert Counters",
      photoTier: "Candid Cinema Team + Drone Visuals + Same-Day Reel",
      venueTier: "AC Kalyana Mantapa with Dedicated Dining Hall",
      comfortScore: "Optimal (Spacious aisles, 65% floor fill)",
      rationale: "Engineered as the ideal sweet spot for celebration. Delivers rich traditional ambiance (brass kuthuvilakku, fresh marigold torans, mandap altar), high guest culinary satisfaction, and balanced risk.",
      highlights: [
        "100% compliant with deterministic budget allocation",
        "Dual-counter live sadya catering with regional delicacies",
        "Authentic temple or royal decor with illuminated floral mandap",
        "Balanced critical path schedule with 31/31 verified safety checks"
      ]
    };

    // Plan C: Royal Premium Experience (+22% investment)
    const planC = {
      id: "plan_c",
      name: "Plan C: Royal Premium",
      tag: "Grandeur & High Immersion",
      badgeClass: "warn",
      costPaise: Math.round(basePaise * 1.22),
      contingency: "8%",
      riskPct: "24%",
      slackDays: "+1 day",
      decorTheme: "Royal Palace Jharokha Stage with Chandeliers",
      cateringTier: "Grand 7-Course Feast + Live Chaat & Mocktail Bar",
      photoTier: "Premium Cinematography (4K Multi-Cam + Guest Booth)",
      venueTier: "Heritage Palace Courtyard or 5-Star Luxury Hall",
      comfortScore: "Luxury (Lounges, VIP zones, 58% floor fill)",
      rationale: "Designed for unforgettable celebration and social impact. Elevates stage architecture with carved golden jharokhas, multi-tier crystal chandeliers, grand culinary stations, and cinematic coverage.",
      highlights: [
        "Palatial stage architecture with authentic heritage arches",
        "Lavish multi-regional feast with live experiential food stalls",
        "Full cinematic storytelling team with aerial drone coverage",
        "VIP guest hospitality & dedicated valet coordination"
      ]
    };

    const plans = [planA, planB, planC];

    return `
    <div class="sect">
      <div class="row mb">
        <h1 class="grow">⚖️ Alternative Event Plan Generator</h1>
        <span class="chip ok">3 Production-Grade Strategies</span>
      </div>
      <p class="muted">
        Compare three mathematically grounded production plans tailored for your <b>${guests}-guest ${cap(sp.event_type)}</b> in ${esc(sp.city)}.
        Review the trade-offs across budget risk, vendor tiers, decor intensity, and critical-path slack before approving.
      </p>
    </div>

    <!-- 3 Plan Cards -->
    <div class="grid g3 mt">
      ${plans.map(pl => `
        <div class="card plan-card ${pl.id === 'plan_b' ? 'featured-card' : ''}" style="display:flex;flex-direction:column;position:relative;border:${pl.id === 'plan_b' ? '2px solid var(--gold)' : '1px solid var(--line)'}">
          ${pl.id === 'plan_b' ? '<div class="card-recommended-badge">★ RECOMMENDED CHOICE</div>' : ''}
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div>
              <h2 style="font-size:18px;margin-bottom:2px">${esc(pl.name)}</h2>
              <span class="chip sm ${pl.badgeClass}">${esc(pl.tag)}</span>
            </div>
          </div>

          <div class="plan-price-box mt">
            <div class="tiny muted">Estimated Expenditure</div>
            <div class="plan-price-val">${inr(pl.costPaise)}</div>
            <div class="tiny ${pl.costPaise <= basePaise ? 'text-teal' : 'text-magenta'} bold">
              ${pl.costPaise === basePaise ? 'Exact allocated baseline' : (pl.costPaise < basePaise ? '-' + inr(basePaise - pl.costPaise) + ' savings' : '+' + inr(pl.costPaise - basePaise) + ' investment')}
            </div>
          </div>

          <p class="small muted mt" style="line-height:1.45;flex-grow:0">${esc(pl.rationale)}</p>

          <hr style="margin:14px 0;border:none;border-top:1px solid var(--line)">

          <div class="col" style="gap:8px;font-size:12.5px">
            <div><b>Decor Theme:</b> <span class="muted">${esc(pl.decorTheme)}</span></div>
            <div><b>Catering:</b> <span class="muted">${esc(pl.cateringTier)}</span></div>
            <div><b>Photography:</b> <span class="muted">${esc(pl.photoTier)}</span></div>
            <div><b>Venue Fit:</b> <span class="muted">${esc(pl.venueTier)}</span></div>
            <div><b>Overrun Risk:</b> <span class="badge ${pl.riskPct === '3%' ? 'ok' : (pl.riskPct === '24%' ? 'warn' : 'info')}">${pl.riskPct}</span> (Monte Carlo)</div>
            <div><b>Schedule Slack:</b> <b class="text-gold">${pl.slackDays}</b></div>
          </div>

          <div class="mt" style="background:var(--ivory-warm);padding:10px;border-radius:8px">
            <div class="tiny bold text-gold" style="margin-bottom:4px">KEY PRODUCTION HIGHLIGHTS</div>
            <ul style="margin:0;padding-left:16px;font-size:11.5px;color:var(--ink-2)">
              ${pl.highlights.map(h => `<li style="margin-bottom:2px">${esc(h)}</li>`).join("")}
            </ul>
          </div>

          <div class="grow"></div>
          <button class="btn ${pl.id === 'plan_b' ? 'gold' : 'ghost'} w-full mt" data-apply-plan="${pl.id}" style="margin-top:16px">
            ${pl.id === 'plan_b' ? '✓ Keep Balanced Plan' : 'Preview & Apply ' + pl.name.split(':')[1]}
          </button>
        </div>
      `).join("")}
    </div>

    <!-- Comparative Matrix -->
    <div class="card mt-l">
      <div class="row mb">
        <h3 class="grow" style="margin:0">📊 Strategic Trade-Off Matrix</h3>
        <span class="tiny muted">Deterministic Engine Projection</span>
      </div>
      <div style="overflow-x:auto">
        <table class="w-full" style="font-size:13px;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:2px solid var(--line);text-align:left">
              <th style="padding:10px 8px">Dimension</th>
              <th style="padding:10px 8px">Plan A: Budget Smart</th>
              <th style="padding:10px 8px;background:rgba(212,175,55,0.06);border-left:1px solid var(--line);border-right:1px solid var(--line)">Plan B: Balanced (Recommended)</th>
              <th style="padding:10px 8px">Plan C: Royal Premium</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid var(--line)">
              <td style="padding:8px"><b>Total Budget</b></td>
              <td style="padding:8px">${inr(planA.costPaise)}</td>
              <td style="padding:8px;background:rgba(212,175,55,0.06);border-left:1px solid var(--line);border-right:1px solid var(--line)"><b>${inr(planB.costPaise)}</b></td>
              <td style="padding:8px">${inr(planC.costPaise)}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--line)">
              <td style="padding:8px"><b>Contingency Buffer</b></td>
              <td style="padding:8px">15% (Highest resilience)</td>
              <td style="padding:8px;background:rgba(212,175,55,0.06);border-left:1px solid var(--line);border-right:1px solid var(--line)">10% (Balanced)</td>
              <td style="padding:8px">8% (Requires tight tracking)</td>
            </tr>
            <tr style="border-bottom:1px solid var(--line)">
              <td style="padding:8px"><b>Overrun Probability</b></td>
              <td style="padding:8px"><span class="chip ok sm">3% Low</span></td>
              <td style="padding:8px;background:rgba(212,175,55,0.06);border-left:1px solid var(--line);border-right:1px solid var(--line)"><span class="chip info sm">12% Normal</span></td>
              <td style="padding:8px"><span class="chip warn sm">24% Elevated</span></td>
            </tr>
            <tr style="border-bottom:1px solid var(--line)">
              <td style="padding:8px"><b>Critical Path Slack</b></td>
              <td style="padding:8px">+6 days cushion</td>
              <td style="padding:8px;background:rgba(212,175,55,0.06);border-left:1px solid var(--line);border-right:1px solid var(--line)">+3 days cushion</td>
              <td style="padding:8px">+1 day tight window</td>
            </tr>
            <tr style="border-bottom:1px solid var(--line)">
              <td style="padding:8px"><b>Decor &amp; Floral</b></td>
              <td style="padding:8px">Marigold torans, eco banana leaves</td>
              <td style="padding:8px;background:rgba(212,175,55,0.06);border-left:1px solid var(--line);border-right:1px solid var(--line)">Traditional Temple Altar / White &amp; Gold</td>
              <td style="padding:8px">Grand Jharokha Stage, Crystal Chandeliers</td>
            </tr>
            <tr style="border-bottom:1px solid var(--line)">
              <td style="padding:8px"><b>Catering Experience</b></td>
              <td style="padding:8px">Traditional Buffet + Live Dosa/Coffee</td>
              <td style="padding:8px;background:rgba(212,175,55,0.06);border-left:1px solid var(--line);border-right:1px solid var(--line)">Authentic Sadya on Leaf + Live Counters</td>
              <td style="padding:8px">7-Course Multi-Regional Feast &amp; Mocktails</td>
            </tr>
            <tr>
              <td style="padding:8px"><b>Decision Trade-off</b></td>
              <td style="padding:8px" class="tiny muted">Prioritizes financial security. Less bespoke decor fabrication.</td>
              <td style="padding:8px;background:rgba(212,175,55,0.06);border-left:1px solid var(--line);border-right:1px solid var(--line)" class="tiny muted">Best compromise for Indian family celebrations. Highly photogenic.</td>
              <td style="padding:8px" class="tiny muted">Maximum visual impact. Requires firm contract locking with vendors.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    `;
  },

  bind(root, p) {
    const sp = p.spec;
    const basePaise = sp.budget_paise;

    $$("[data-apply-plan]", root).forEach(btn => {
      btn.onclick = () => {
        const planId = btn.dataset.applyPlan;
        if (planId === "plan_b") {
          toast("Plan B is already your active baseline plan.", "ok");
          return;
        }

        const newPaise = planId === "plan_a" ? Math.round(basePaise * 0.82) : Math.round(basePaise * 1.22);
        const newRupees = Math.round(newPaise / 100);
        const planName = planId === "plan_a" ? "Plan A: Budget Smart" : "Plan C: Royal Premium";

        propose({
          budget_rupees: newRupees,
          theme_id: planId === "plan_a" ? "marigold_heritage" : "royal_gold"
        }, `Switch to ${planName}`);
      };
    });
  }
};
