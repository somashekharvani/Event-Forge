"use strict";
/* EventForge Smart Vendor Marketplace across 11 Service Categories
   1. Venue / Hall  2. Caterer  3. Photographer & Video  4. Decorator & Florals
   5. Music & Entertainment  6. Bridal Styling & Mehendi  7. Priest / Pandit  8. Transport & Stay
   9. Sound & Stage  10. Security & Valet  11. Invitations & Stationery
   Direct category budget tracking with no double-counting.
*/

const VD = { cat: null, weights: null, ranked: null, quotePrev: null };
const WLAB = { budget: "Fits budget", rating: "Rating", distance: "Distance", availability: "Available on date", fit: "Fit for event" };

const ALL_CATEGORY_LABELS = {
  venue: "🏛️ Venue & Mantapam",
  caterer: "🍲 Catering & Sadya",
  decorator: "🌸 Decor & Florals",
  photographer: "📸 Photo & Cinema",
  entertainment: "🎵 Music & Nadaswaram",
  makeup: "💄 Styling & Mehendi",
  priest: "🪔 Priests & Rituals",
  transport: "🚗 Logistics & Stay",
  sound: "🔊 Sound & Lighting",
  security: "🛡️ Security & Valet",
  invitations: "✉️ Invitations & RSVP"
};

VIEWS.vendors = {
  render(p) {
    const cats = Object.keys(p.vendors);
    if (!VD.cat || (!p.vendors[VD.cat] && !ALL_CATEGORY_LABELS[VD.cat])) {
      VD.cat = cats[0] || "caterer";
    }

    const currentCat = p.vendors[VD.cat] ? VD.cat : cats[0];
    const v = p.vendors[currentCat] || { label: ALL_CATEGORY_LABELS[currentCat] || currentCat, allocation: 0, weights: { budget: 0.35, rating: 0.25, distance: 0.15, availability: 0.15, fit: 0.10 }, ranked: [] };
    const w = VD.weights || v.weights || { budget: 0.35, rating: 0.25, distance: 0.15, availability: 0.15, fit: 0.10 };
    const list = VD.ranked || v.ranked || [];
    const sel = p.selection[currentCat];

    // Find category budget allocation from budget engine to avoid double-counting
    const budgetCat = p.budget.categories.find(c => c.label.toLowerCase().includes(currentCat.slice(0, 4))) || { allocated: v.allocation || 0 };
    const allocPaise = v.allocation || budgetCat.allocated || 0;
    const selectedPricePaise = sel ? (sel.price_estimate ? sel.price_estimate.mid : 0) : 0;
    const variancePaise = allocPaise - selectedPricePaise;

    return `
    <div class="sect">
      <div class="row mb">
        <h1 class="grow">🤝 Smart Vendor Marketplace</h1>
        <span class="chip ok">11 Service Categories</span>
      </div>
      <div class="callout warn small">
        <b>SAMPLE DATA DISCLAIMER:</b> Vendor names, ratings, and prices are synthetically generated for planning and demonstration. Always verify actual contracts, credentials, and date commitments with vendors directly.
      </div>
    </div>

    <!-- 11 Category Selector Tabs -->
    <div class="tabs mt" style="overflow-x:auto;padding-bottom:4px">
      ${Object.keys(ALL_CATEGORY_LABELS).map(c => `
        <button data-cat="${c}" ${c === currentCat ? 'aria-current="true"' : ""}>
          ${ALL_CATEGORY_LABELS[c]}
          ${p.selection[c] ? ' <span class="badge ok">✓</span>' : ''}
        </button>
      `).join("")}
    </div>

    <!-- Category Financial Status Bar -->
    <div class="card mt" style="background:#fffdfa;border:1px solid var(--navy-border);padding:14px 18px">
      <div class="row" style="justify-content:space-between">
        <div>
          <span class="tiny bold text-gold">${(ALL_CATEGORY_LABELS[currentCat] || currentCat).toUpperCase()} BUDGET INTEGRATION</span>
          <h3 style="margin:2px 0 0">${esc(v.label || ALL_CATEGORY_LABELS[currentCat])}</h3>
        </div>
        <div class="row" style="gap:16px;text-align:right">
          <div>
            <div class="tiny muted">Allocated Cap</div>
            <div class="bold">${short(allocPaise)}</div>
          </div>
          <div>
            <div class="tiny muted">Selected Quote</div>
            <div class="bold text-gold">${selectedPricePaise ? short(selectedPricePaise) : 'None Selected'}</div>
          </div>
          <div>
            <div class="tiny muted">Category Variance</div>
            <div class="bold ${variancePaise >= 0 ? 'text-teal' : 'text-magenta'}">
              ${selectedPricePaise ? (variancePaise >= 0 ? '+' : '') + short(variancePaise) + (variancePaise >= 0 ? ' buffer' : ' deficit') : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid g-side mt">
      <!-- Left Column: Ranking & Vendor Cards -->
      <div class="col">
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <h3 style="margin:0">Transparent Weighted Ranking</h3>
            <span class="tiny muted">Sum of weights = 100%</span>
          </div>
          <p class="tiny muted mt-tight" style="margin-bottom:12px">
            Adjust priorities to re-rank available vendors in ${esc(p.spec.city)} instantly:
          </p>
          <div class="row mb" style="gap:12px">
            ${Object.keys(WLAB).map(k => `
              <label class="f" style="min-width:115px">
                <span class="tiny">${WLAB[k]} <b>${Math.round((w[k] || 0) * 100)}%</b></span>
                <input type="range" data-w="${k}" min="0" max="100" value="${Math.round((w[k] || 0) * 100)}" style="accent-color:var(--gold)">
              </label>
            `).join("")}
          </div>

          ${list.length ? list.map((r, i) => `
            <div class="finding mt" ${sel && sel.vendor.id === r.vendor.id ? 'style="border-color:var(--gold);background:#fffdf7"' : ""}>
              <div class="row" style="align-items:flex-start">
                <div>
                  <b>${i + 1}. ${esc(r.vendor.name)}</b>
                  <span class="chip sm">SAMPLE</span>
                  ${sel && sel.vendor.id === r.vendor.id ? '<span class="chip ok sm">✓ SELECTED</span>' : ""}
                  ${r.available ? '<span class="chip ok sm">Available</span>' : '<span class="chip bad sm">Busy on date</span>'}
                  ${r.over_allocation ? '<span class="chip warn sm">Over category budget</span>' : '<span class="chip info sm">Within budget</span>'}
                </div>
                <span class="grow"></span>
                <div class="text-right">
                  <span style="font-size:18px;font-weight:750" class="text-gold">${r.score}</span>
                  <span class="tiny muted">/100</span>
                </div>
              </div>

              <div class="small mt-tight">
                ★ <b>${r.vendor.rating}</b> · ${r.vendor.distance_km} km away · Price: <b>${short(r.price_estimate.low)} – ${short(r.price_estimate.high)}</b> (Expected: ${short(r.price_estimate.mid)})
              </div>
              <div class="tiny muted mt-tight">
                Tags: ${r.vendor.tags ? r.vendor.tags.map(t => `<span class="chip sm ghost" style="margin:1px">${esc(t)}</span>`).join(" ") : 'Standard'}
              </div>

              <div class="tiny muted mt" style="background:var(--ivory-warm);padding:6px 8px;border-radius:4px">
                <b>Score Formula:</b> ${Object.keys(WLAB).map(k => `${WLAB[k]} ${(r.contributions && r.contributions[k]) || 0}`).join(" + ")}
              </div>

              <div class="row mt" style="gap:8px">
                <button class="btn ${sel && sel.vendor.id === r.vendor.id ? "ghost" : "gold"} sm" data-sel="${r.vendor.id}">
                  ${sel && sel.vendor.id === r.vendor.id ? "Unselect Vendor" : "Select Vendor"}
                </button>
                <button class="btn ghost sm" data-out="${r.vendor.id}">Draft WhatsApp / Email</button>
                ${sel && sel.vendor.id === r.vendor.id ? `
                  <button class="btn ghost sm" data-cancel="1" title="Simulate vendor cancellation impact" style="color:var(--magenta)">
                    Mark Cancelled (Emergency)
                  </button>
                ` : ""}
              </div>
            </div>
          `).join("") : `
            <div class="small muted mt" style="padding:16px;text-align:center;background:var(--ivory-warm);border-radius:8px">
              Direct vendor quotes for <b>${esc(ALL_CATEGORY_LABELS[currentCat] || currentCat)}</b> are tracked in your budget. Use the Quote Comparator on the right to paste quotes and verify deliverables.
            </div>
          `}

          <div class="tiny muted mt">
            Scoring algorithm computes exact Euclidean distance, category budget bounds, and calendar busy-slots.
          </div>
        </div>
      </div>

      <!-- Right Column: Verification Checklist & Quote Intelligence -->
      <div class="col">
        <div class="card">
          <div class="row">
            <h3 class="grow" style="margin:0">${esc(v.label || ALL_CATEGORY_LABELS[currentCat])} Verification Checklist</h3>
            <span class="tiny muted">Audit Guard</span>
          </div>
          <div id="ck" class="small muted mt">Loading verification checklist…</div>
        </div>

        <div class="card">
          <div class="row">
            <h3 class="grow" style="margin:0">Quote Intelligence &amp; OCR Evidence</h3>
            <span class="chip ok sm">Audit-Grade</span>
          </div>
          <p class="small muted" style="margin:4px 0 10px">
            Paste incoming quotation text from WhatsApp or email. EventForge extracts line items, verifies GST terms, and flags omissions:
          </p>
          <input id="q-l" placeholder="Vendor Label (e.g. Royal Kitchens Quote)" class="mt">
          <textarea id="q-t" rows="4" placeholder="Paste WhatsApp message or email text from vendor…"></textarea>
          <div class="row mt">
            <button class="btn ghost sm" id="q-add">Extract &amp; Verify Terms</button>
          </div>
          <div id="q-out" class="mt small">${this.quotes(p)}</div>
        </div>
      </div>
    </div>
    `;
  },

  quotes(p) {
    if (!p.quotes || !p.quotes.length) return '<span class="muted">No quotes logged yet. Paste vendor text above to verify.</span>';
    return p.quotes.map(q => `
      <div class="finding mt">
        <div class="row">
          <b>${esc(q.label)}</b>
          <span class="chip sm ${q.completeness >= 0.7 ? 'ok' : 'warn'}">${Math.round(q.completeness * 100)}% terms verified</span>
          <span class="grow"></span>
          <button class="btn ghost sm" data-qdel="${q.id}">Remove</button>
        </div>
        <div class="tiny mt">
          ${Object.entries(q.fields).filter(([k, x]) => x && x.value !== undefined).map(([k, x]) => `
            <div><b>${esc(cap(k))}:</b> ${typeof x.value === "number" && /total|per_head|amount/.test(k) ? inr(x.value) : esc(x.value)} <span class="muted">(evidence: “${esc(x.evidence)}”)</span></div>
          `).join("")}
        </div>
        ${q.missing && q.missing.length ? `<div class="tiny mt" style="color:var(--amber)"><b>Missing Critical Terms:</b> ${q.missing.map(esc).join(", ")}</div>` : ""}
        ${q.gst_note ? `<div class="tiny muted mt">${esc(q.gst_note)}</div>` : ""}
      </div>
    `).join("") + (p.quotes.length > 1 ? '<button class="btn gold sm mt" id="q-cmp">Compare Quotes Side-by-Side</button><div id="q-cmp-out" class="mt"></div>' : "");
  },

  bind(root, p) {
    const re = () => { render(); };

    // Category Tabs
    $$("[data-cat]", root).forEach(b => {
      b.onclick = () => {
        VD.cat = b.dataset.cat;
        VD.weights = VD.ranked = null;
        re();
      };
    });

    // Ranking Sliders
    $$("[data-w]", root).forEach(s => {
      s.onchange = async () => {
        const w = {};
        $$("[data-w]", root).forEach(x => w[x.dataset.w] = +x.value / 100);
        const sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
        Object.keys(w).forEach(k => w[k] /= sum);
        VD.weights = w;
        if (p.vendors[VD.cat]) {
          const res = await api(`/projects/${S.pid}/vendors/rank`, { body: { category: VD.cat, weights: w } });
          VD.ranked = res.ranked;
        }
        re();
      };
    });

    // Select Vendor
    $$("[data-sel]", root).forEach(b => {
      b.onclick = () => {
        const cur = p.selection[VD.cat];
        propose(cur && cur.vendor.id === b.dataset.sel ? { unselect_vendor: VD.cat } : { select_vendor: { category: VD.cat, vendor_id: b.dataset.sel } });
      };
    });

    // Vendor Cancel Simulation
    $$("[data-cancel]", root).forEach(b => {
      b.onclick = () => propose({ vendor_cancel: VD.cat });
    });

    // Outreach
    $$("[data-out]", root).forEach(b => {
      b.onclick = () => this.outreach(b.dataset.out);
    });

    // Checklists
    if (p.vendors[VD.cat]) {
      api(`/projects/${S.pid}/checklist/${VD.cat}`).then(c => {
        const el = $("#ck", root);
        if (!el) return;
        const done = new Set(p.checklist_done || []);
        const sec = (title, arr, kind) => `
          <div class="mt">
            <b>${title}</b>
            ${arr.map((q, i) => {
              const id = `${VD.cat}:${kind}:${i}`;
              return `<label class="row tight small" style="align-items:flex-start;margin:4px 0">
                <input type="checkbox" data-tick="${esc(id)}" ${done.has(id) ? "checked" : ""}>
                <span>${esc(q)}</span>
              </label>`;
            }).join("")}
          </div>`;
        el.className = "";
        el.innerHTML = sec("Pre-Contract Questions", c.questions || [], "q") +
                       sec("Essential Documents & Licenses", c.documents || [], "d") +
                       (c.red_flags ? sec("Contract Red Flags", c.red_flags, "r") : "");
        $$("[data-tick]", el).forEach(x => {
          x.onchange = () => api(`/projects/${S.pid}/checklist`, { body: { item_id: x.dataset.tick, done: x.checked } }).then(r => {
            S.plan = r.plan;
            renderNav();
          });
        });
      }).catch(() => {});
    }

    // Add Quote
    const qAdd = $("#q-add", root);
    if (qAdd) {
      qAdd.onclick = () => guard(async () => {
        const t = $("#q-t", root).value.trim();
        if (!t) return toast("Paste the quote text first", "bad");
        setPlan(await api(`/projects/${S.pid}/quotes`, { body: { text: t, label: $("#q-l", root).value || "Quote " + ((p.quotes || []).length + 1), category: VD.cat } }));
      });
    }

    // Delete Quote
    $$("[data-qdel]", root).forEach(b => {
      b.onclick = () => guard(async () => setPlan(await api(`/projects/${S.pid}/quotes/${b.dataset.qdel}`, { method: "DELETE" })));
    });

    // Compare Quotes
    const c = $("#q-cmp", root);
    if (c) {
      c.onclick = () => guard(async () => {
        const r = await api(`/projects/${S.pid}/quotes/compare`);
        $("#q-cmp-out", root).innerHTML = `
          <table class="w-full" style="font-size:12px;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:2px solid var(--line);text-align:left">
                <th style="padding:6px">Quotation</th>
                <th class="right" style="padding:6px">Total (incl. GST)</th>
                <th style="padding:6px">Audit Completeness</th>
                <th class="right" style="padding:6px">Value Score</th>
              </tr>
            </thead>
            <tbody>
              ${r.rows.map(x => `
                <tr style="border-bottom:1px solid var(--line)">
                  <td style="padding:6px"><b>${esc(x.label)}</b>${x.label === r.best_value ? ' <span class="chip ok sm">Best Value</span>' : ""}</td>
                  <td class="right" style="padding:6px">${x.total_normalised ? inr(x.total_normalised) : "—"}</td>
                  <td style="padding:6px">${Math.round(x.completeness * 100)}%</td>
                  <td class="right" style="padding:6px">${x.value_score ?? "—"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <div class="tiny muted mt">${esc(r.note)}</div>`;
      });
    }
  },

  outreach(vid) {
    const draw = async (ch, lang) => {
      const o = await api(`/projects/${S.pid}/outreach`, { body: { vendor_id: vid, channel: ch, lang } });
      openModal(`
        <h2>Direct Vendor Outreach Message</h2>
        <div class="row mb">
          <select id="o-ch">
            <option value="whatsapp" ${ch === "whatsapp" ? "selected" : ""}>WhatsApp</option>
            <option value="email" ${ch === "email" ? "selected" : ""}>Email</option>
          </select>
          <select id="o-lang">
            <option value="en" ${lang === "en" ? "selected" : ""}>English</option>
            <option value="hi" ${lang === "hi" ? "selected" : ""}>हिन्दी (Hindi)</option>
          </select>
        </div>
        ${o.subject ? `<div class="small"><b>Subject:</b> ${esc(o.subject)}</div>` : ""}
        <textarea id="o-body" rows="12">${esc(o.body)}</textarea>
        <div class="row mt">
          <button class="btn gold" id="o-copy">Copy Message</button>
          <button class="btn ghost" onclick="closeModal()">Close</button>
        </div>
        <div class="tiny muted mt">Pre-composed with your event date, city, and guest count. Paste directly into WhatsApp or email client.</div>
      `);
      $("#o-ch").onchange = $("#o-lang").onchange = () => guard(() => draw($("#o-ch").value, $("#o-lang").value));
      $("#o-copy").onclick = () => {
        navigator.clipboard?.writeText($("#o-body").value);
        toast("Outreach message copied to clipboard", "ok");
      };
    };
    guard(() => draw("whatsapp", "en"));
  }
};
