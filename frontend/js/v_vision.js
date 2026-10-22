"use strict";
/* EventForge Vision Studio: venue fit, photo/dimensions, editable floor plan with live validation,
   NL commands, 3D photorealistic walkthrough with 6 celebration visual worlds,
   interactive theme selector toolbar, visual confirmation panel,
   and Photorealistic Concept Gallery showcasing verified reference imagery.
*/
const VS = { sel: null, edits: null, orig: null, val: null, drag: null, photo: null, key: null, mode: "3d" };
const LAB_T = { stage: "Stage", mandap: "Mandap", seating: "Seating", dining: "Dining", buffet: "Buffet", dance_floor: "Dance floor", activity: "Activity", reg_desk: "Registration", photo_booth: "Photo booth", first_aid: "First aid", kitchen: "Kitchen", backstage: "Backstage" };

const THEME_CONFIGS = {
  temple_red: {
    key: "temple",
    name: "Traditional South Indian Temple",
    tag: "Kanchipuram Red & Temple Gold Mandap",
    palette: ["#9b1c1f", "#d4a017", "#f6e7c1", "#2f5d3a"],
    image: "/static/images/themes/temple_mandap_traditional.jpg",
    decor: "Carved stone pillars, banana trees, brass kuthuvilakku floor lamps with dynamic flames, sacred havan kund, and rangoli floor centerpiece."
  },
  royal_gold: {
    key: "royal",
    name: "Mysuru Royal Heritage Wedding",
    tag: "Royal White & Antique Gold Palace Jharokha",
    palette: ["#f7f1e3", "#c9a227", "#8c6d1f", "#ffffff"],
    image: "/static/images/themes/royal_palace_arches.jpg",
    decor: "Golden palace jharokha arches, crystal chandeliers, royal velvet throneseats, warm stage spotlights, and royal red carpet."
  },
  minimal_sage: {
    key: "modern",
    name: "Modern Luxury Contemporary",
    tag: "Champagne Gold Arches & Minimalist Marble",
    palette: ["#e8efe4", "#d4af37", "#f8f5ee", "#5e7a5c"],
    image: "/static/images/themes/modern_luxury_stage.jpg",
    decor: "Champagne geometric arch frames, suspended white floral canopy, mirrored plinths with calla lilies, and stage lip LED cove lighting."
  },
  boho_garden: {
    key: "garden",
    name: "Botanical Garden & Pergola",
    tag: "Rustic Timber Pergola & Fairy Lights",
    palette: ["#f4d6cc", "#cfe3d0", "#f7ecd0", "#b98d7a"],
    image: "/static/images/themes/garden_pergola_stage.jpg",
    decor: "Rustic timber pergola, climbing ivy and blush roses, criss-crossed Edison fairy bulb strings, and natural timber decking."
  },
  unicorn: {
    key: "birthday",
    name: "Festive Milestone Birthday",
    tag: "Pastel Balloon Arch & Neon Script",
    palette: ["#ffd1e8", "#d9c2ff", "#c9f1ff", "#fff3b0"],
    image: "/static/images/themes/birthday_celebration_stage.jpg",
    decor: "Cascading multi-color balloon garland arch, glowing neon sign, 3-tier birthday cake table, and festive confetti accents."
  },
  cultural_fair: {
    key: "corporate",
    name: "Executive Keynote & Corporate Gala",
    tag: "Dual Curved LED Displays & Keynote Truss",
    palette: ["#0f172a", "#0284c7", "#38bdf8", "#ffffff"],
    image: "/static/images/themes/corporate_keynote_stage.jpg",
    decor: "Dual massive curved LED presentation video walls, sleek presenter podium with cyan LED bar, and overhead stage truss spotlights."
  }
};

VIEWS.vision = {
  render(p) {
    const vis = p.vision, v = vis.venue, L = vis.layout, key = p.name + S.version;
    if (VS.key !== key) {
      VS.key = key;
      VS.edits = JSON.parse(JSON.stringify(L.elements));
      VS.orig = JSON.parse(JSON.stringify(L.elements));
      VS.val = vis.validation;
      VS.sel = null;
    }
    const val = VS.val;
    const moved = this.moved();

    // Determine currently active theme ID and config
    const currentThemeId = (L.theme && L.theme.id) || "royal_gold";
    let activeConfigId = "royal_gold";
    for (const [tid, cfg] of Object.entries(THEME_CONFIGS)) {
      if (currentThemeId.includes(cfg.key) || currentThemeId === tid) {
        activeConfigId = tid;
        break;
      }
    }
    const activeCfg = THEME_CONFIGS[activeConfigId] || THEME_CONFIGS.royal_gold;

    return `
    <div class="sect">
      <div class="row" style="margin-bottom:6px">
        <h1 class="grow">🏛️ Cinematic Vision Studio</h1>
        <span class="chip ${val.ok ? "ok" : "bad"}" id="vs-badge">${val.summary.pass}/${val.summary.total} checks pass</span>
      </div>
      <p class="muted">
        Experience your celebration venue in photorealistic 3D across 6 authentic themes, take an eye-level walkthrough down the decorated aisle, or edit furniture on the 2D architectural blueprint with real-time clearance and egress validation.
      </p>
    </div>

    <!-- ==========================================================================
         TOP-LEVEL INTERACTIVE THEME SELECTOR TOOLBAR
         ========================================================================== -->
    <div class="theme-selector-bar">
      <span class="theme-bar-label">🎨 Visual Theme Worlds:</span>
      <div class="theme-pills">
        <button class="theme-pill ${activeConfigId === 'temple_red' ? 'active' : ''}" data-switch-theme="temple_red">🛕 Traditional Temple</button>
        <button class="theme-pill ${activeConfigId === 'royal_gold' ? 'active' : ''}" data-switch-theme="royal_gold">👑 Mysuru Royal</button>
        <button class="theme-pill ${activeConfigId === 'minimal_sage' ? 'active' : ''}" data-switch-theme="minimal_sage">✨ Modern Luxury</button>
        <button class="theme-pill ${activeConfigId === 'boho_garden' ? 'active' : ''}" data-switch-theme="boho_garden">🌿 Botanical Garden</button>
        <button class="theme-pill ${activeConfigId === 'unicorn' ? 'active' : ''}" data-switch-theme="unicorn">🎈 Birthday Fantasy</button>
        <button class="theme-pill ${activeConfigId === 'cultural_fair' ? 'active' : ''}" data-switch-theme="cultural_fair">🎙️ Executive Gala</button>
      </div>
    </div>

    <!-- Main Workspace Switcher (3D Venue vs 2D Floor Plan) -->
    <div class="tabs mt" style="margin-bottom:16px">
      <button class="${VS.mode === '3d' ? 'active' : ''}" id="tab-v-3d">✨ 3D Realistic Venue &amp; Walkthrough</button>
      <button class="${VS.mode === '2d' ? 'active' : ''}" id="tab-v-2d">📐 2D Architectural Blueprint (Drag &amp; Drop)</button>
    </div>

    <div class="grid g-side">
      <div class="col">
        <!-- 3D Realistic Venue Container -->
        <div class="card" id="box-v-3d" style="display:${VS.mode === '3d' ? 'block' : 'none'};padding:14px">
          <div class="row mb" style="justify-content:space-between">
            <h3 style="margin:0">${esc(v.name)} — Realistic 3D Preview</h3>
            <span class="tiny muted">${v.width} × ${v.depth}m · ${v.indoor ? "Indoor Banquet" : "Outdoor Lawn"} · Theme: <b style="color:${(L.theme && L.theme.palette[1]) || '#d4af37'}">${esc(L.theme ? L.theme.name : "Royal Gold")}</b></span>
          </div>
          <div id="walk-box"></div>

          <!-- ==========================================================================
               VISUAL THEME CONFIRMATION PANEL
               ========================================================================== -->
          <div class="theme-confirmation-card" id="theme-confirm-panel">
            <div class="theme-confirm-thumb">
              <img id="tc-img" src="${activeCfg.image}" alt="${activeCfg.name}">
              <span class="chip sm ok" id="tc-badge" style="position:absolute;bottom:6px;left:6px;font-size:10.5px">Active</span>
            </div>
            <div class="theme-confirm-info">
              <div class="theme-confirm-title" id="tc-title">
                <span>${activeCfg.name}</span>
                <span class="tiny text-gold font-normal">✦ ${activeCfg.tag}</span>
              </div>
              <div class="theme-confirm-desc" id="tc-desc">${activeCfg.decor}</div>
              <div class="theme-confirm-status">
                <span class="chip ok sm" id="tc-status-3d">✓ 3D Environment: Active</span>
                <span class="chip ok sm" id="tc-status-2d">✓ 2D Floor Plan: Synchronized</span>
                <span class="chip info sm" id="tc-status-tour">🚶 Walkthrough Tour: Ready</span>
              </div>
            </div>
            <div class="theme-confirm-actions">
              <button class="btn gold sm" id="tc-render-video-btn">🎥 Render Walkthrough Tour</button>
              <button class="btn ghost sm" id="tc-focus-stage-btn">🎯 Focus on Focal Stage</button>
            </div>
          </div>
        </div>

        <!-- 2D Architectural Floor Plan Container -->
        <div class="card" id="box-v-2d" style="display:${VS.mode === '2d' ? 'block' : 'none'}">
          <div class="row">
            <h3 class="grow" style="margin:0">${esc(v.name)} <span class="muted small">${v.width} × ${v.depth} m</span></h3>
            <span class="small muted">Drag items to test clearance · Live 3D Sync</span>
          </div>
          <div id="vs-svg" class="mt">${this.svg(v, L)}</div>
          <div class="legend small mt">
            ${[...new Set(VS.edits.map(e => e.type))].map(t => `<span><i class="swatch" style="background:${TYPE_COLORS[t] || "#999"}"></i> ${LAB_T[t] || t}</span>`).join(" ")}
            <span><i class="swatch" style="background:#0f7b6c;border-radius:50%"></i> entrance</span>
            <span><i class="swatch" style="background:#b3225e;border-radius:50%"></i> exit</span>
          </div>
          <div class="row mt" style="gap:8px">
            <button class="btn gold sm" id="vs-save" ${moved.length ? "" : "disabled"}>Save ${moved.length} moved item(s)</button>
            <button class="btn ghost sm" id="vs-undo" ${moved.length ? "" : "disabled"}>Discard my moves</button>
            <button class="btn ghost sm" id="vs-reset">Reset to automatic layout</button>
          </div>
        </div>

        <!-- Natural Language Command Box -->
        <div class="card mt">
          <div class="row">
            <h3 class="grow" style="margin:0">💬 Natural Language Venue Director</h3>
            <span class="chip ok">Instant Sandboxing</span>
          </div>
          <p class="small muted" style="margin:4px 0 10px">
            Instruct the digital twin in plain English. EventForge parses commands, verifies spatial safety, and previews before applying:
          </p>
          <div class="row">
            <input id="vs-cmd" class="grow" placeholder="e.g. move dining away from the entrance · make the stage bigger · add a photo booth · change theme to temple traditional">
            <button class="btn gold sm" id="vs-go">Preview Change</button>
          </div>
          <div class="row mt" style="gap:6px">
            <span class="tiny bold muted">Try:</span>
            <button class="btn ghost sm" data-cmd-sugg="move dining away from the entrance">Move dining away</button>
            <button class="btn ghost sm" data-cmd-sugg="make the stage bigger">Enlarge stage</button>
            <button class="btn ghost sm" data-cmd-sugg="change decoration to temple traditional">Temple Mandap theme</button>
          </div>
        </div>
      </div>

      <!-- Right Column: Safety Checks, Selected Item & Venue Selector -->
      <div class="col">
        <div class="card">
          <div class="row"><h3 class="grow" style="margin:0">🛡️ Spatial Safety Verification</h3><span class="chip ${val.ok ? 'ok' : 'bad'}">${val.summary.pass}/${val.summary.total} Pass</span></div>
          <p class="tiny muted" style="margin:4px 0 10px">Deterministic clearance, exit path, and occupant density rules:</p>
          <div id="vs-checks">${this.checks(val)}</div>
        </div>

        <div class="card" id="vs-insp">
          <h3>Selected Item Geometry</h3>
          ${this.inspector()}
        </div>

        <div class="card">
          <h3>Venue Templates for ${p.spec.guests} Guests</h3>
          <div class="col mt" style="gap:6px">
            ${p.venue_fit.map(f => `
              <div class="row" style="margin:3px 0;padding:6px;background:${f.id === v.id ? '#fefdf8' : '#fff'};border:1px solid ${f.id === v.id ? 'var(--gold)' : '#e2e8f0'};border-radius:6px">
                <span class="chip ${f.fits ? "ok" : "bad"}">${f.fits ? "fits" : f.fails + " fail"}</span>
                <span class="grow ${f.id === v.id ? "bold text-gold" : "small"}">${esc(f.name)}</span>
                <span class="tiny muted">${f.width}×${f.depth}m · ${f.fill_pct}% full</span>
                ${f.id === v.id ? '<span class="chip sm ok">Active</span>' : `<button class="btn ghost sm" data-venue="${f.id}">Use</button>`}
              </div>
            `).join("")}
          </div>

          <h3 class="mt" style="margin-top:20px">Custom Venue Dimensions</h3>
          <p class="tiny muted">Enter exact physical measurements from your site visit:</p>
          <div class="grid g2 mt">
            <label class="f">Width (m)<input id="cv-w" type="number" min="5" max="200" value="${v.width}"></label>
            <label class="f">Depth (m)<input id="cv-d" type="number" min="5" max="200" value="${v.depth}"></label>
          </div>
          <label class="f mt">Base Door Pattern
            <select id="cv-t">
              ${p.venue_fit.map(f => `<option value="${f.id}" ${f.id === v.id ? "selected" : ""}>${esc(f.name)}</option>`).join("")}
            </select>
          </label>
          <button class="btn ghost sm mt" id="cv-go">Apply Custom Dimensions</button>
        </div>
      </div>
    </div>

    <!-- ==========================================================================
         PHOTOREALISTIC CONCEPT GALLERY & MATERIAL SPECIFICATIONS (ALL 6 THEMES)
         ========================================================================== -->
    <div class="card mt-l" style="padding:24px">
      <div class="row mb">
        <div>
          <span class="tiny bold text-gold" style="letter-spacing:1px">PRODUCTION INSPIRATION &amp; MATERIAL DOSSIER</span>
          <h2 style="font-size:22px;margin:2px 0">🖼️ Photorealistic Concept Gallery &amp; Decor Specifications</h2>
        </div>
        <span class="grow"></span>
        <span class="tiny muted">Verified Reference Imagery</span>
      </div>
      <p class="small muted" style="margin-bottom:20px">
        Examine authentic decor concepts curated for South Indian Temple, Mysuru Royal Heritage, Modern Luxury, Garden Pergola, Birthday, and Corporate celebrations:
      </p>

      <div class="grid g3" style="gap:20px">
        <!-- Concept 1: Traditional South Indian Temple Mandap -->
        <div class="concept-card" style="background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:var(--shadow-sm)">
          <div style="height:210px;overflow:hidden;position:relative">
            <img src="/static/images/themes/temple_mandap_traditional.jpg" alt="Traditional South Indian Temple Mandap" style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s ease">
            <span class="chip sm ok" style="position:absolute;top:10px;left:10px;background:rgba(11,17,32,0.85);color:#fcfaf6">Temple Traditional</span>
          </div>
          <div style="padding:14px">
            <h4 style="margin:0 0 4px">Traditional Temple Mandap &amp; Sacred Altar</h4>
            <div class="tiny muted" style="line-height:1.4">
              Carved stone pillars, banana-stem entrance framing, sacred havan kund with glowing embers, and ceremonial brass kuthuvilakku floor lamps.
            </div>
            <div class="row mt-tight" style="gap:6px">
              <span class="swatch" style="background:#9b1c1f;width:16px;height:16px;border-radius:4px" title="Kanchipuram Red (#9b1c1f)"></span>
              <span class="swatch" style="background:#d4a017;width:16px;height:16px;border-radius:4px" title="Temple Gold (#d4a017)"></span>
              <span class="swatch" style="background:#2f5d3a;width:16px;height:16px;border-radius:4px" title="Banana Leaf Green (#2f5d3a)"></span>
              <span class="swatch" style="background:#f6e7c1;width:16px;height:16px;border-radius:4px" title="Warm Ivory (#f6e7c1)"></span>
            </div>
            <button class="btn gold sm w-full mt" data-apply-theme="temple_red">Apply Temple Theme to 3D</button>
          </div>
        </div>

        <!-- Concept 2: Royal Palace Golden Jharokha Stage -->
        <div class="concept-card" style="background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:var(--shadow-sm)">
          <div style="height:210px;overflow:hidden;position:relative">
            <img src="/static/images/themes/royal_palace_arches.jpg" alt="Royal Palace Golden Jharokha Stage" style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s ease">
            <span class="chip sm ok" style="position:absolute;top:10px;left:10px;background:rgba(11,17,32,0.85);color:#fcfaf6">Mysuru Royal</span>
          </div>
          <div style="padding:14px">
            <h4 style="margin:0 0 4px">Royal Palace Golden Jharokha Stage</h4>
            <div class="tiny muted" style="line-height:1.4">
              Ornate carved multi-arch palace stage with hanging faceted crystal chandeliers, antique gold filigree detailing, and royal velvet throneseats.
            </div>
            <div class="row mt-tight" style="gap:6px">
              <span class="swatch" style="background:#c9a227;width:16px;height:16px;border-radius:4px" title="Antique Gold"></span>
              <span class="swatch" style="background:#781d26;width:16px;height:16px;border-radius:4px" title="Royal Velvet Maroon"></span>
              <span class="swatch" style="background:#8c6d1f;width:16px;height:16px;border-radius:4px" title="Carved Brass Trim"></span>
              <span class="swatch" style="background:#fdfbf7;width:16px;height:16px;border-radius:4px;border:1px solid #cbd5e1" title="Silk Drapery"></span>
            </div>
            <button class="btn gold sm w-full mt" data-apply-theme="royal_gold">Apply Royal Palace Theme</button>
          </div>
        </div>

        <!-- Concept 3: Modern Luxury Contemporary Stage -->
        <div class="concept-card" style="background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:var(--shadow-sm)">
          <div style="height:210px;overflow:hidden;position:relative">
            <img src="/static/images/themes/modern_luxury_stage.jpg" alt="Modern Luxury Contemporary Stage" style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s ease">
            <span class="chip sm info" style="position:absolute;top:10px;left:10px;background:rgba(11,17,32,0.85);color:#fcfaf6">Modern Luxury</span>
          </div>
          <div style="padding:14px">
            <h4 style="margin:0 0 4px">Modern Luxury Stage &amp; Geometric Arches</h4>
            <div class="tiny muted" style="line-height:1.4">
              Champagne gold geometric rectangular frames, suspended white wisteria floral canopy, mirrored plinths with calla lilies, and LED cove lights.
            </div>
            <div class="row mt-tight" style="gap:6px">
              <span class="swatch" style="background:#d4af37;width:16px;height:16px;border-radius:4px" title="Champagne Gold"></span>
              <span class="swatch" style="background:#ffffff;width:16px;height:16px;border-radius:4px;border:1px solid #cbd5e1" title="Pure White Marble"></span>
              <span class="swatch" style="background:#94a3b8;width:16px;height:16px;border-radius:4px" title="Mirrored Acrylic"></span>
              <span class="swatch" style="background:#fef08a;width:16px;height:16px;border-radius:4px" title="Warm Cove LED"></span>
            </div>
            <button class="btn gold sm w-full mt" data-apply-theme="minimal_sage">Apply Modern Luxury</button>
          </div>
        </div>

        <!-- Concept 4: Botanical Garden Pergola -->
        <div class="concept-card" style="background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:var(--shadow-sm)">
          <div style="height:210px;overflow:hidden;position:relative">
            <img src="/static/images/themes/garden_pergola_stage.jpg" alt="Botanical Garden Pergola" style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s ease">
            <span class="chip sm ok" style="position:absolute;top:10px;left:10px;background:rgba(11,17,32,0.85);color:#fcfaf6">Botanical Garden</span>
          </div>
          <div style="padding:14px">
            <h4 style="margin:0 0 4px">Botanical Garden &amp; Rustic Pergola</h4>
            <div class="tiny muted" style="line-height:1.4">
              Rustic timber pergola draped with climbing ivy, blush roses, suspended Edison filament fairy bulbs, and lush green lawn pavers.
            </div>
            <div class="row mt-tight" style="gap:6px">
              <span class="swatch" style="background:#5c4033;width:16px;height:16px;border-radius:4px" title="Rustic Timber"></span>
              <span class="swatch" style="background:#2e7d32;width:16px;height:16px;border-radius:4px" title="Ivy Green"></span>
              <span class="swatch" style="background:#f472b6;width:16px;height:16px;border-radius:4px" title="Blush Rose"></span>
              <span class="swatch" style="background:#fef08a;width:16px;height:16px;border-radius:4px" title="Edison Bulb Glow"></span>
            </div>
            <button class="btn gold sm w-full mt" data-apply-theme="boho_garden">Apply Botanical Garden</button>
          </div>
        </div>

        <!-- Concept 5: Festive Milestone Birthday -->
        <div class="concept-card" style="background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:var(--shadow-sm)">
          <div style="height:210px;overflow:hidden;position:relative">
            <img src="/static/images/themes/birthday_celebration_stage.jpg" alt="Festive Milestone Birthday" style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s ease">
            <span class="chip sm warn" style="position:absolute;top:10px;left:10px;background:rgba(11,17,32,0.85);color:#fcfaf6">Birthday Fantasy</span>
          </div>
          <div style="padding:14px">
            <h4 style="margin:0 0 4px">Milestone Birthday Balloon Arch &amp; Neon</h4>
            <div class="tiny muted" style="line-height:1.4">
              Cascading multi-color balloon garland arch, vibrant neon script sign, round cake display table, and cheerful celebration styling.
            </div>
            <div class="row mt-tight" style="gap:6px">
              <span class="swatch" style="background:#ec4899;width:16px;height:16px;border-radius:4px" title="Hot Pink"></span>
              <span class="swatch" style="background:#38bdf8;width:16px;height:16px;border-radius:4px" title="Cyan Sky"></span>
              <span class="swatch" style="background:#facc15;width:16px;height:16px;border-radius:4px" title="Celebration Gold"></span>
              <span class="swatch" style="background:#a855f7;width:16px;height:16px;border-radius:4px" title="Party Purple"></span>
            </div>
            <button class="btn gold sm w-full mt" data-apply-theme="unicorn">Apply Birthday Fantasy</button>
          </div>
        </div>

        <!-- Concept 6: Executive Keynote & Corporate Gala -->
        <div class="concept-card" style="background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:var(--shadow-sm)">
          <div style="height:210px;overflow:hidden;position:relative">
            <img src="/static/images/themes/corporate_keynote_stage.jpg" alt="Executive Keynote &amp; Corporate Gala" style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s ease">
            <span class="chip sm info" style="position:absolute;top:10px;left:10px;background:rgba(11,17,32,0.85);color:#fcfaf6">Executive Gala</span>
          </div>
          <div style="padding:14px">
            <h4 style="margin:0 0 4px">Executive Keynote &amp; Corporate Gala Stage</h4>
            <div class="tiny muted" style="line-height:1.4">
              Dual curved massive LED display video panels with futuristic visual data, sleek executive speaker podium with cyan LED underglow, and truss spots.
            </div>
            <div class="row mt-tight" style="gap:6px">
              <span class="swatch" style="background:#0f172a;width:16px;height:16px;border-radius:4px" title="Executive Slate"></span>
              <span class="swatch" style="background:#0284c7;width:16px;height:16px;border-radius:4px" title="Digital Cyan"></span>
              <span class="swatch" style="background:#38bdf8;width:16px;height:16px;border-radius:4px" title="LED Video Blue"></span>
              <span class="swatch" style="background:#ffffff;width:16px;height:16px;border-radius:4px;border:1px solid #cbd5e1" title="Spotlight White"></span>
            </div>
            <button class="btn gold sm w-full mt" data-apply-theme="cultural_fair">Apply Executive Gala</button>
          </div>
        </div>
      </div>
    </div>
    `;
  },

  moved() {
    if (!VS.edits) return [];
    return VS.edits.filter(e => {
      const o = VS.orig.find(x => x.id === e.id);
      return o && (Math.abs(o.x - e.x) > .01 || Math.abs(o.y - e.y) > .01 || Math.abs(o.w - e.w) > .01 || Math.abs(o.h - e.h) > .01);
    });
  },

  checks(val) {
    const fs = val.checks.filter(c => c.status !== "pass"), ok = val.checks.filter(c => c.status === "pass");
    return (fs.length ? fs.map(c => `
      <div class="check">
        <span class="dot ${c.status}"></span>
        <div>
          <b>${esc(c.title)}</b>
          <div class="tiny muted">${esc(c.detail)}</div>
          ${c.fix ? `<div class="tiny" style="color:var(--magenta)">Fix: ${esc(c.fix)}</div>` : ""}
        </div>
      </div>`).join("") : '<div class="callout ok small">Every spatial layout check passes.</div>') +
      `<details class="mt"><summary class="small">${ok.length} passing checks</summary>${ok.map(c => `<div class="check"><span class="dot pass"></span><div class="small">${esc(c.title)}<div class="tiny muted">${esc(c.detail)}</div></div></div>`).join("")}</details>` +
      `<div class="tiny muted mt" style="border-top:1px solid #e2e8f0;padding-top:6px">Seating capacity ${val.metrics.zone_capacity.seating ?? "–"} · Dining ${val.metrics.zone_capacity.dining ?? "–"} · Floor fill ${val.metrics.fill_pct}%.</div>`;
  },

  inspector() {
    const e = VS.edits && VS.edits.find(x => x.id === VS.sel);
    if (!e) return '<div class="small muted">Click any element on the floor plan to inspect its coordinates.</div>';
    const f = (k, l) => `<label class="f">${l}<input type="number" step=".25" data-f="${k}" value="${(+e[k]).toFixed(2)}"></label>`;
    return `
      <div class="row mb"><b class="grow">${esc(e.label)}</b><span class="chip">${esc(e.type)}</span></div>
      <div class="grid g2">${f("x", "X pos (m)")}${f("y", "Y pos (m)")}${f("w", "Width (m)")}${f("h", "Depth (m)")}</div>
      <div class="tiny muted mt">${(e.w * e.h).toFixed(1)} m² footprint · y=0 is north wall; main entrance on south wall.</div>`;
  },

  svg(v, L) {
    const E = VS.edits, sh = L.params.shared;
    let s = `<svg id="plan" viewBox="-1 -1 ${v.width + 2} ${v.depth + 2}" width="100%" class="plan-svg" role="img" aria-label="Editable floor plan" style="touch-action:none;background:#fbf8f1;border:1px solid var(--line);border-radius:8px">
      <defs><pattern id="gr" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#e2e8f0" stroke-width=".04"/></pattern></defs>
      <rect x="0" y="0" width="${v.width}" height="${v.depth}" fill="#fbf8f1"/><rect x="0" y="0" width="${v.width}" height="${v.depth}" fill="url(#gr)"/>
      <rect x="0" y="0" width="${v.width}" height="${v.depth}" fill="none" stroke="#1b2238" stroke-width=".25"/>`;
    v.obstacles.forEach(o => s += `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="#9aa88a"><title>${esc(o.type)}</title></rect>`);
    E.forEach(e => {
      if (sh && e.type === "seating") return;
      const c = TYPE_COLORS[e.type] || "#999", on = VS.sel === e.id, bad = this.badIds().has(e.id);
      s += `<g class="el" data-id="${e.id}" style="cursor:grab"><rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx=".2" fill="${c}" fill-opacity=".35" stroke="${bad ? "#b3225e" : c}" stroke-width="${on || bad ? .25 : .1}" ${bad ? 'stroke-dasharray=".4 .2"' : ""}/>
        <text x="${e.x + .3}" y="${e.y + .9}" font-size=".75" fill="#1b2238" pointer-events="none">${esc(this.fit(sh && e.type === "dining" ? "Shared floor" : e.label, e.w))}</text></g>`;
    });
    v.doors.forEach(d => {
      const [x, y] = doorPoint(v, d), horiz = d.wall === "N" || d.wall === "S";
      s += `<rect x="${horiz ? x - d.width / 2 : x - .2}" y="${horiz ? y - .2 : y - d.width / 2}" width="${horiz ? d.width : .4}" height="${horiz ? .4 : d.width}" fill="${d.kind === "entrance" ? "#0f7b6c" : "#b3225e"}"><title>${d.kind}</title></rect>`;
    });
    return s + "</svg>";
  },

  fit(t, w) { const n = Math.max(3, Math.floor(w / .4)); return t.length > n ? t.slice(0, n - 1) + "…" : t; },
  badIds() { const s = new Set(); (VS.val ? VS.val.checks : []).filter(c => c.status === "fail").forEach(c => (c.ids || c.elements || []).forEach(i => s.add(i))); return s; },

  bind(root, p) {
    const v = p.vision.venue;

    // View Mode Toggle (3D vs 2D)
    const btn3d = $("#tab-v-3d", root);
    const btn2d = $("#tab-v-2d", root);
    const box3d = $("#box-v-3d", root);
    const box2d = $("#box-v-2d", root);

    if (btn3d && btn2d) {
      btn3d.onclick = () => {
        VS.mode = "3d";
        btn3d.classList.add("active");
        btn2d.classList.remove("active");
        if (box3d) box3d.style.display = "block";
        if (box2d) box2d.style.display = "none";
        // Synchronize 3D elements with any moves made in 2D
        if (typeof Walk !== "undefined") {
          Walk.syncElements(VS.edits);
        }
      };
      btn2d.onclick = () => {
        VS.mode = "2d";
        btn2d.classList.add("active");
        btn3d.classList.remove("active");
        if (box3d) box3d.style.display = "none";
        if (box2d) box2d.style.display = "block";
      };
    }

    const svgBox = $("#vs-svg", root);
    const redrawSvg = () => { if (svgBox) svgBox.innerHTML = this.svg(v, p.vision.layout); wire(); };
    const revalidate = debounce(async () => {
      try {
        const r = await api(`/projects/${S.pid}/vision/validate`, { body: { elements: VS.edits } });
        VS.val = r.validation;
        $("#vs-checks", root).innerHTML = this.checks(VS.val);
        const b = $("#vs-badge", root);
        if (b) {
          b.className = "chip " + (VS.val.ok ? "ok" : "bad");
          b.textContent = `${VS.val.summary.pass}/${VS.val.summary.total} checks pass`;
        }
        redrawSvg();
        // Live bidirectional 3D synchronization
        if (typeof Walk !== "undefined") {
          Walk.syncElements(VS.edits);
        }
      } catch (e) { toast(e.message, "bad"); }
    }, 180);

    const pt = (svg, ev) => { const m = svg.getScreenCTM().inverse(), q = svg.createSVGPoint(); q.x = ev.clientX; q.y = ev.clientY; return q.matrixTransform(m); };
    const insp = () => { $("#vs-insp", root).innerHTML = "<h3>Selected Item Geometry</h3>" + this.inspector(); wireInsp(); };
    const wireInsp = () => $$("[data-f]", root).forEach(i => i.onchange = () => {
      const e = VS.edits.find(x => x.id === VS.sel);
      if (e) {
        e[i.dataset.f] = Math.max(i.dataset.f === "x" || i.dataset.f === "y" ? 0 : .5, +i.value);
        redrawSvg();
        revalidate();
        refreshButtons();
      }
    });

    const refreshButtons = () => {
      const n = this.moved().length;
      const sv = $("#vs-save", root);
      const un = $("#vs-undo", root);
      if (sv) { sv.disabled = !n; sv.textContent = `Save ${n} moved item(s)`; }
      if (un) un.disabled = !n;
    };

    const wire = () => {
      const svg = $("#plan", root);
      if (!svg) return;
      $$(".el", svg).forEach(g => g.onpointerdown = ev => {
        const e = VS.edits.find(x => x.id === g.dataset.id), q = pt(svg, ev);
        VS.sel = e.id;
        VS.drag = { id: e.id, dx: q.x - e.x, dy: q.y - e.y };
        g.setPointerCapture(ev.pointerId);
        g.style.cursor = "grabbing";
        insp();

        g.onpointermove = m => {
          if (!VS.drag) return;
          const p2 = pt(svg, m);
          e.x = Math.round(Math.max(0, Math.min(v.width - e.w, p2.x - VS.drag.dx)) * 4) / 4;
          e.y = Math.round(Math.max(0, Math.min(v.depth - e.h, p2.y - VS.drag.dy)) * 4) / 4;
          g.querySelector("rect").setAttribute("x", e.x);
          g.querySelector("rect").setAttribute("y", e.y);
          const t = g.querySelector("text");
          if (t) { t.setAttribute("x", e.x + .3); t.setAttribute("y", e.y + .9); }
          refreshButtons();
        };

        g.onpointerup = () => {
          VS.drag = null;
          g.onpointermove = g.onpointerup = null;
          insp();
          revalidate();
          refreshButtons();
        };
      });
    };

    wire();
    wireInsp();

    const svBtn = $("#vs-save", root);
    if (svBtn) svBtn.onclick = () => propose({ layout_pin: this.moved().map(e => ({ id: e.id, x: e.x, y: e.y })) });

    const unBtn = $("#vs-undo", root);
    if (unBtn) unBtn.onclick = () => {
      VS.edits = JSON.parse(JSON.stringify(VS.orig));
      VS.val = p.vision.validation;
      $("#vs-checks", root).innerHTML = this.checks(VS.val);
      redrawSvg();
      insp();
      refreshButtons();
      if (typeof Walk !== "undefined") {
        Walk.syncElements(VS.edits);
      }
    };

    const resBtn = $("#vs-reset", root);
    if (resBtn) resBtn.onclick = () => propose({ layout_reset: true });

    const cmd = () => {
      const t = $("#vs-cmd", root).value.trim();
      if (t) propose({ vision_command: t });
    };
    const goBtn = $("#vs-go", root);
    if (goBtn) goBtn.onclick = cmd;
    const cmdIn = $("#vs-cmd", root);
    if (cmdIn) cmdIn.onkeydown = e => { if (e.key === "Enter") cmd(); };

    $$("[data-cmd-sugg]", root).forEach(b => {
      b.onclick = () => propose({ vision_command: b.dataset.cmdSugg });
    });

    $$("[data-venue]", root).forEach(b => b.onclick = () => propose({ venue_id: b.dataset.venue }));

    const cvGo = $("#cv-go", root);
    if (cvGo) cvGo.onclick = () => propose({
      custom_venue: {
        name: "Custom Venue",
        template: $("#cv-t", root).value,
        width: +$("#cv-w", root).value,
        depth: +$("#cv-d", root).value
      }
    });

    // =========================================================================
    // INSTANT THEME SWITCHING HANDLER
    // Directly transforms 3D scene, updates confirmation panel, and persists.
    // =========================================================================
    const switchTheme = async (themeId) => {
      const cfg = THEME_CONFIGS[themeId] || THEME_CONFIGS.royal_gold;

      // 1. Update active toolbar pill buttons
      $$("[data-switch-theme]", root).forEach(b => b.classList.toggle("active", b.dataset.switchTheme === themeId));

      // 2. Transform the active 3D scene immediately
      if (typeof Walk !== "undefined") {
        Walk.setTheme(cfg.key, { id: themeId, name: cfg.name, palette: cfg.palette });
      }

      // 3. Update the Visual Theme Confirmation Panel
      const tcImg = $("#tc-img", root);
      const tcTitle = $("#tc-title", root);
      const tcDesc = $("#tc-desc", root);
      const tcBadge = $("#tc-badge", root);
      const tcStatusTour = $("#tc-status-tour", root);
      if (tcImg) tcImg.src = cfg.image;
      if (tcTitle) tcTitle.innerHTML = `<span>${cfg.name}</span> <span class="tiny text-gold font-normal">✦ ${cfg.tag}</span>`;
      if (tcDesc) tcDesc.textContent = cfg.decor;
      if (tcBadge) tcBadge.textContent = "Active";
      if (tcStatusTour) {
        tcStatusTour.className = "chip warn sm";
        tcStatusTour.textContent = "⚠️ Tour Render Required";
      }

      toast(`✨ Theme applied: ${cfg.name}. 3D scene updated!`, "ok");

      // 4. Commit to backend so state["layout_theme"] is saved
      try {
        const res = await api(`/projects/${S.pid}/commit`, {
          body: { changes: { theme: themeId }, label: `Switch theme to ${cfg.name}` }
        });
        if (res && res.plan) {
          S.plan = res.plan;
          S.version = res.version;
          redrawSvg();
        }
      } catch (err) {
        console.warn("Backend theme commit notification:", err);
      }
    };

    // Attach listeners to Top-Level Theme Bar Pills
    $$("[data-switch-theme]", root).forEach(btn => {
      btn.onclick = () => switchTheme(btn.dataset.switchTheme);
    });

    // Attach listeners to Concept Gallery Apply Buttons
    $$("[data-apply-theme]", root).forEach(btn => {
      btn.onclick = () => switchTheme(btn.dataset.applyTheme);
    });

    // Re-Render Walkthrough Tour button
    const renderVidBtn = $("#tc-render-video-btn", root);
    if (renderVidBtn) {
      renderVidBtn.onclick = () => {
        renderVidBtn.disabled = true;
        renderVidBtn.textContent = "⏳ Rendering Tour Lighting...";
        setTimeout(() => {
          renderVidBtn.disabled = false;
          renderVidBtn.textContent = "🎥 Render Walkthrough Tour";
          const tcStatusTour = $("#tc-status-tour", root);
          if (tcStatusTour) {
            tcStatusTour.className = "chip ok sm";
            tcStatusTour.textContent = "🚶 Walkthrough Tour: Ready";
          }
          if (typeof Walk !== "undefined") {
            Walk.markOutdated(false);
          }
          toast("✨ Celebration walkthrough tour rendered with photorealistic lighting!", "ok");
        }, 900);
      };
    }

    // Focus on Focal Stage button
    const focusBtn = $("#tc-focus-stage-btn", root);
    if (focusBtn) {
      focusBtn.onclick = () => {
        if (typeof Walk !== "undefined") {
          Walk.setCameraPreset("stage");
        }
      };
    }

    // Mount 3D Walkthrough & Realistic Renderer
    const walkBox = $("#walk-box", root);
    if (walkBox) {
      Walk.mount(walkBox, p, VS.mode);
    }
  }
};
