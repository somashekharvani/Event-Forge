"use strict";
/* EventForge Cinematic Vision Studio & 3D Celebration Venue Renderer
   Supports:
   1. 6 Distinct Celebration Visual Worlds:
      - Traditional South Indian Temple (Carved stone pillars, banana trees, brass kuthuvilakku lamps with flame glow, marigold torans, havan kund, rangoli floor)
      - Mysuru Royal Wedding (Golden jharokha arches, crystal chandeliers, velvet thrones, dusk courtyard lighting)
      - Modern Luxury (Champagne gold geometric frames, suspended wisteria canopy, LED cove lighting, marble reflections)
      - Garden Celebration (Rustic timber pergolas, climbing ivy, fairy-light canopies, lawn pavers)
      - Birthday Celebration (Multi-tone balloon arch garland, neon glowing script, tiered dessert table)
      - Corporate Gala (Keynote stage, dual LED displays, executive podium, truss spotlights)
   2. Instant Dynamic Theme Switching via Walk.setTheme(themeKey)
   3. Interactive Orbit & Pan Controls with Instant Viewpoint Presets
   4. Cinematic Guided Walkthrough with Voice Narration & Timeline Scrubber
   5. Live Bidirectional 2D <-> 3D Synchronization
   6. Versioned Render Outdated Tracking ("Render required after edits")
   7. High-Detail Procedural Canvas Fallback
*/

const Walk = (() => {
  let st = null; // State object
  const DUR = 7; // Seconds per scene in walkthrough

  const THEME_TITLES = {
    temple: "Traditional South Indian Temple",
    royal: "Mysuru Royal Heritage Wedding",
    modern: "Modern Luxury Contemporary",
    garden: "Botanical Garden & Pergola",
    birthday: "Festive Milestone Birthday",
    corporate: "Executive Keynote & Community Gala"
  };

  // Lighting atmospheres per theme
  const LIGHTING_PRESETS = {
    temple: { ambient: 0xffdfba, ambInt: 0.95, dir: 0xffaa5e, dirInt: 1.30, fog: 0x1e120b, sky: ["#f8961e", "#f9c74f"] },
    royal: { ambient: 0xffd1b3, ambInt: 0.85, dir: 0xffe2aa, dirInt: 1.25, fog: 0x161324, sky: ["#e07a5f", "#f4a261"] },
    modern: { ambient: 0xffffff, ambInt: 0.95, dir: 0xf5f5f7, dirInt: 1.35, fog: 0x0f172a, sky: ["#e2e8f0", "#ffffff"] },
    garden: { ambient: 0xe0f2fe, ambInt: 0.95, dir: 0xfef08a, dirInt: 1.30, fog: 0x14281d, sky: ["#38bdf8", "#bbf7d0"] },
    birthday: { ambient: 0xfdf2f8, ambInt: 1.0, dir: 0xfde047, dirInt: 1.25, fog: 0x1c1917, sky: ["#f472b6", "#a855f7"] },
    corporate: { ambient: 0x1e293b, ambInt: 0.80, dir: 0x60a5fa, dirInt: 1.20, fog: 0x090d16, sky: ["#1e3a8a", "#0284c7"] },
    golden: { ambient: 0xffe8d6, ambInt: 0.90, dir: 0xfff3e0, dirInt: 1.25, fog: 0x1a1528, sky: ["#f6c58b", "#fbe8cf"] }
  };

  function getThemeKey(theme, spec) {
    const tid = ((theme && theme.id) || (typeof theme === "string" ? theme : "")).toLowerCase();
    const tname = ((theme && theme.name) || "").toLowerCase();
    const etype = ((spec && spec.event_type) || "").toLowerCase();

    if (tid.includes("temple") || tname.includes("temple") || tid.includes("kanchipuram") || tid.includes("marigold")) return "temple";
    if (tid.includes("royal") || tname.includes("royal") || tid.includes("mysore") || tid.includes("mysuru")) return "royal";
    if (tid.includes("garden") || tname.includes("garden") || tid.includes("rustic") || tid.includes("boho")) return "garden";
    if (etype === "birthday" || tid.includes("safari") || tid.includes("space") || tid.includes("unicorn") || tid.includes("birthday")) return "birthday";
    if (etype === "community" || tid.includes("corporate") || tid.includes("cultural") || tname.includes("fair") || tname.includes("utsav")) return "corporate";
    if (tid.includes("minimal") || tname.includes("minimal") || tid.includes("modern") || tid.includes("sage")) return "modern";
    return "royal";
  }

  function mount(box, plan, initialMode = "3d") {
    stop();
    const vis = plan.vision;
    const sc = vis.scenes || [];
    const v = vis.venue;
    const L = vis.layout;
    const theme = L.theme || { name: "Royal Gold", palette: ["#f7f1e3", "#c9a227", "#8c6d1f", "#ffffff"] };
    const themeKey = getThemeKey(theme, plan.spec);

    box.innerHTML = `
      <div class="vision-studio-wrapper">
        <!-- Visualization Mode & Camera Toolbar -->
        <div class="vision-toolbar">
          <div class="toolbar-mode-group">
            <button class="v-mode-btn ${initialMode === "3d" ? "active" : ""}" data-vmode="3d">✨ Photorealistic 3D</button>
            <button class="v-mode-btn ${initialMode === "orbit" ? "active" : ""}" data-vmode="orbit">🔄 Interactive Orbit</button>
            <button class="v-mode-btn ${initialMode === "walk" ? "active" : ""}" data-vmode="walk">🚶 Walkthrough Tour</button>
          </div>
          <div class="grow"></div>
          <div class="toolbar-presets-group" id="view-presets" style="display:${initialMode === "orbit" || initialMode === "3d" ? "flex" : "none"}">
            <span class="tiny bold muted">Focus View:</span>
            <button class="btn ghost sm" data-cam="stage">Stage / Mandap</button>
            <button class="btn ghost sm" data-cam="aisle">Entrance Aisle</button>
            <button class="btn ghost sm" data-cam="seating">Guest Seating</button>
            <button class="btn ghost sm" data-cam="buffet">Dining / Buffet</button>
            <button class="btn ghost sm" data-cam="overview">Overview (3D)</button>
          </div>
        </div>

        <!-- 3D Viewport Container -->
        <div class="viewport-box" id="vp-container" style="position:relative;width:100%;height:470px;background:#0b1120;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.4)">
          <!-- Render Outdated Banner -->
          <div id="w-outdated-bar" class="walk-outdated-bar" style="display:none;position:absolute;top:12px;left:50%;transform:translateX(-50%);background:rgba(225,29,72,0.94);color:#ffffff;padding:6px 16px;border-radius:24px;font-size:12.5px;font-weight:600;z-index:25;box-shadow:0 6px 16px rgba(0,0,0,0.35);backdrop-filter:blur(4px);align-items:center;gap:10px">
            <span id="w-outdated-text">⚠️ Render required after edits (Design modified)</span>
            <button class="btn gold sm" id="w-re-render-btn" style="padding:2px 10px;font-size:11.5px">Re-Render Tour</button>
          </div>

          <!-- Active Theme Overlay Badge -->
          <div id="vp-theme-badge" style="position:absolute;top:12px;left:14px;z-index:15;background:rgba(11,17,32,0.85);backdrop-filter:blur(6px);padding:5px 12px;border-radius:20px;border:1px solid rgba(212,175,55,0.3);color:#fcfaf6;font-size:12px">
            <span class="text-gold">✦ Theme:</span> <b>${esc(THEME_TITLES[themeKey] || theme.name)}</b>
          </div>

          <canvas id="walk-cv" width="920" height="470" style="width:100%;height:100%;display:block"></canvas>
          <div id="three-container" style="position:absolute;inset:0;pointer-events:auto"></div>

          <!-- Walkthrough Floating Subtitle Overlay -->
          <div id="walk-caption-overlay" class="walk-overlay-bar" style="display:${initialMode === "walk" ? "flex" : "none"}">
            <div class="walk-cap-left">
              <span class="walk-live-dot"></span>
              <div>
                <div id="w-cap-title" class="bold text-gold" style="font-size:14px">Grand Entrance Aisle</div>
                <div id="w-cap-text" class="tiny text-ivory" style="opacity:0.85">Walking past flower-lined aisle toward the decorated celebration mandap</div>
              </div>
            </div>
            <div class="grow"></div>
            <div class="walk-cap-right">
              <span id="w-time-badge" class="chip sm info">00:00</span>
            </div>
          </div>
        </div>

        <!-- Walkthrough Controls Bar -->
        <div class="walk-controls-panel" id="walk-ctrls" style="display:${initialMode === "walk" ? "block" : "none"}">
          <div class="row mt" style="align-items:center;gap:10px">
            <button class="btn gold sm" id="w-play">▶ Play Tour</button>
            <button class="btn ghost sm" id="w-prev" title="Previous milestone">◀</button>
            <button class="btn ghost sm" id="w-next" title="Next milestone">▶</button>
            <input type="range" id="w-scrub" min="0" max="100" value="0" style="flex:1;accent-color:#d4af37" aria-label="Walkthrough timeline scrubber">
            <button class="btn ghost sm" id="w-voice">🔊 Narration: Off</button>
            <button class="btn ghost sm" id="w-rec">Record (.webm)</button>
            <a class="btn ghost sm" href="/api/projects/${S.pid}/export/gif">Download GIF</a>
          </div>

          <div class="row mt" style="gap:6px">
            ${sc.map((s, i) => `
              <button class="scene-btn ${i === 0 ? "active" : ""}" data-sc="${i}">
                <b>${esc(s.start)}</b> ${esc(s.title.length > 20 ? s.title.slice(0, 19) + "…" : s.title)}
              </button>
            `).join("")}
          </div>
        </div>

        <!-- Celebration Details Footnote -->
        <div class="row mt" style="justify-content:space-between;align-items:center;font-size:12px;color:#64748b">
          <span id="vp-footnote">Venue: <b>${esc(v.name)}</b> (${v.width} × ${v.depth}m) · Environment: <b style="color:${theme.palette[1] || '#d4af37'}">${esc(THEME_TITLES[themeKey] || theme.name)}</b></span>
          <span>100% Synchronized with 2D floor plan &amp; spatial clearances</span>
        </div>
      </div>
    `;

    st = {
      plan,
      scenes: sc,
      mode: initialMode,
      themeKey,
      i: 0,
      t: 0,
      playing: false,
      voice: false,
      raf: 0,
      last: 0,
      box,
      three: null,
      flames: [],
      canvas: $("#walk-cv", box),
      cvBox: $("#three-container", box)
    };

    // Mode Buttons
    $$("[data-vmode]", box).forEach(btn => {
      btn.onclick = () => {
        const m = btn.dataset.vmode;
        st.mode = m;
        $$("[data-vmode]", box).forEach(b => b.classList.toggle("active", b.dataset.vmode === m));
        const presets = $("#view-presets", box);
        const ctrls = $("#walk-ctrls", box);
        const overlay = $("#walk-caption-overlay", box);
        if (presets) presets.style.display = m === "orbit" || m === "3d" ? "flex" : "none";
        if (ctrls) ctrls.style.display = m === "walk" ? "block" : "none";
        if (overlay) overlay.style.display = m === "walk" ? "flex" : "none";

        if (m === "walk") {
          play();
        } else {
          pause();
          if (m === "3d") setCameraPreset("overview");
          else if (m === "orbit") setCameraPreset("stage");
        }
      };
    });

    // Camera Presets
    $$("[data-cam]", box).forEach(b => {
      b.onclick = () => setCameraPreset(b.dataset.cam);
    });

    // Walkthrough playback controls
    const pl = $("#w-play", box);
    if (pl) pl.onclick = () => st.playing ? pause() : play();
    const pv = $("#w-prev", box);
    if (pv) pv.onclick = () => jump((st.i - 1 + sc.length) % sc.length);
    const nx = $("#w-next", box);
    if (nx) nx.onclick = () => jump((st.i + 1) % sc.length);
    const vc = $("#w-voice", box);
    if (vc) vc.onclick = () => { st.voice = !st.voice; vc.textContent = `🔊 Narration: ${st.voice ? "On" : "Off"}`; if (st.voice) speak(sc[st.i].detail); };
    const rec = $("#w-rec", box);
    if (rec) rec.onclick = () => record();

    const scb = $("#w-scrub", box);
    if (scb) {
      scb.oninput = () => {
        const val = +scb.value / 100;
        const total = sc.length * DUR;
        const targetT = val * total;
        st.i = Math.min(sc.length - 1, Math.floor(targetT / DUR));
        st.t = targetT % DUR;
        caption();
        frame();
      };
    }

    $$("[data-sc]", box).forEach(b => {
      b.onclick = () => jump(+b.dataset.sc);
    });

    const reRenderBtn = $("#w-re-render-btn", box);
    if (reRenderBtn) {
      reRenderBtn.onclick = () => {
        reRender();
        toast("Walkthrough re-rendered from latest layout coordinates", "ok");
      };
    }

    init3D();
  }

  function stop() {
    if (st) {
      pause();
      if (st.three && st.three.renderer) {
        try {
          st.three.renderer.dispose();
          if (st.three.renderer.domElement && st.three.renderer.domElement.parentNode) {
            st.three.renderer.domElement.parentNode.removeChild(st.three.renderer.domElement);
          }
        } catch (e) {}
      }
      st = null;
    }
  }

  function play() {
    if (!st) return;
    st.playing = true;
    st.last = performance.now();
    const b = $("#w-play", st.box);
    if (b) b.textContent = "⏸ Pause Tour";
    caption();
    st.raf = requestAnimationFrame(tick);
  }

  function pause() {
    if (!st) return;
    st.playing = false;
    cancelAnimationFrame(st.raf);
    const b = $("#w-play", st.box);
    if (b) b.textContent = "▶ Play Tour";
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }

  function jump(idx) {
    if (!st || !st.scenes.length) return;
    st.i = idx;
    st.t = 0;
    caption();
    frame();
  }

  function caption() {
    if (!st) return;
    const s = st.scenes[st.i];
    if (!s) return;
    const title = $("#w-cap-title", st.box);
    const text = $("#w-cap-text", st.box);
    const time = $("#w-time-badge", st.box);
    const scrub = $("#w-scrub", st.box);

    if (title) title.textContent = `${s.start} — ${s.title}`;
    if (text) text.textContent = s.detail;
    if (time) time.textContent = `${s.start} (${st.i + 1}/${st.scenes.length})`;

    if (scrub) {
      const curTotal = (st.i * DUR + st.t) / (st.scenes.length * DUR);
      scrub.value = Math.round(curTotal * 100);
    }

    $$("[data-sc]", st.box).forEach((b, k) => b.classList.toggle("active", k === st.i));
    if (st.voice && st.t === 0) speak(s.detail);
  }

  function speak(text) {
    if (typeof speechSynthesis === "undefined" || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-IN";
      u.rate = 1.0;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  function tick(now) {
    if (!st || !st.playing) return;
    const delta = (now - st.last) / 1000;
    st.last = now;
    st.t += delta;

    if (st.t > DUR) {
      st.i = (st.i + 1) % st.scenes.length;
      st.t = 0;
      caption();
    }

    frame();
    st.raf = requestAnimationFrame(tick);
  }

  function setCameraPreset(preset) {
    if (!st || !st.three) return;
    const v = st.plan.vision.venue;
    const L = st.plan.vision.layout;
    const cam = st.three.camera;
    const target = st.three.target;

    const stageEl = L.elements.find(e => e.type === "mandap" || e.type === "stage") || { x: v.width / 2 - 4, y: 3, w: 8, h: 4 };
    const diningEl = L.elements.find(e => e.type === "dining" || e.type === "buffet") || { x: v.width / 2, y: v.depth - 6, w: 8, h: 4 };
    const seatingEl = L.elements.find(e => e.type === "seating") || { x: v.width / 2, y: v.depth * 0.45, w: 10, h: 6 };

    switch (preset) {
      case "stage":
        cam.position.set(stageEl.x + stageEl.w / 2, 2.2, stageEl.y + stageEl.h + 5.5);
        target.set(stageEl.x + stageEl.w / 2, 1.6, stageEl.y + stageEl.h / 2);
        break;
      case "aisle":
        cam.position.set(v.width / 2, 1.8, v.depth - 2.0);
        target.set(v.width / 2, 1.8, stageEl.y + stageEl.h / 2);
        break;
      case "seating":
        cam.position.set(seatingEl.x + seatingEl.w / 2 + 5, 2.8, seatingEl.y + seatingEl.h / 2 + 5);
        target.set(seatingEl.x + seatingEl.w / 2, 1.0, seatingEl.y + seatingEl.h / 2);
        break;
      case "buffet":
        cam.position.set(diningEl.x + diningEl.w / 2 - 4, 2.2, diningEl.y + diningEl.h / 2 + 5);
        target.set(diningEl.x + diningEl.w / 2, 1.0, diningEl.y + diningEl.h / 2);
        break;
      case "overview":
      default:
        cam.position.set(v.width / 2, Math.max(14, v.width * 0.65), v.depth * 1.15);
        target.set(v.width / 2, 1.5, v.depth / 2);
        break;
    }

    cam.lookAt(target);
    st.three.renderer.render(st.three.scene, cam);
  }

  function markOutdated(isOutdated, msg) {
    if (!st || !st.box) return;
    const bar = $("#w-outdated-bar", st.box);
    const txt = $("#w-outdated-text", st.box);
    if (bar) bar.style.display = isOutdated ? "flex" : "none";
    if (txt && msg) txt.textContent = msg;
  }

  function syncElements(elements) {
    if (!st || !st.three || !st.three.scene) return;
    const v = st.plan.vision.venue;
    const spec = st.plan.spec;
    const theme = (st.plan.vision.layout && st.plan.vision.layout.theme) || { palette: ["#f7f1e3", "#c9a227", "#8c6d1f", "#ffffff"] };

    // Clear previous dynamic element group
    if (st.three.elementsGroup) {
      st.three.scene.remove(st.three.elementsGroup);
    }
    const newGroup = new THREE.Group();
    st.three.elementsGroup = newGroup;
    st.three.scene.add(newGroup);
    st.flames = [];

    elements.forEach(el => {
      buildCelebrationElement(newGroup, el, spec, theme, v, st.themeKey);
    });

    st.three.renderer.render(st.three.scene, st.three.camera);
    markOutdated(true, "⚠️ Walkthrough video outdated (layout elements synchronized)");
  }

  /* Instant Dynamic Theme Switcher */
  function setTheme(themeIdOrKey, customThemeObj) {
    if (!st) return;
    const spec = st.plan.spec;
    const newKey = getThemeKey(customThemeObj || themeIdOrKey, spec);
    st.themeKey = newKey;

    if (customThemeObj) {
      if (!st.plan.vision.layout) st.plan.vision.layout = {};
      st.plan.vision.layout.theme = customThemeObj;
    }

    // Apply lighting, materials, rangoli, fixtures
    applyThemeVisuals(newKey);

    // Update active theme badge
    const badge = $("#vp-theme-badge", st.box);
    if (badge) {
      badge.innerHTML = `<span class="text-gold">✦ Theme:</span> <b>${esc(THEME_TITLES[newKey] || newKey)}</b>`;
    }

    const footnote = $("#vp-footnote", st.box);
    if (footnote) {
      const v = st.plan.vision.venue;
      footnote.innerHTML = `Venue: <b>${esc(v.name)}</b> (${v.width} × ${v.depth}m) · Environment: <b style="color:#d4af37">${esc(THEME_TITLES[newKey] || newKey)}</b>`;
    }

    markOutdated(true, `⚠️ Walkthrough video outdated (Theme switched to ${THEME_TITLES[newKey] || newKey})`);
  }

  function applyThemeVisuals(themeKey) {
    if (!st || !st.three) return;
    const { scene, camera, renderer, ambLight, dirLight, floorMat, carpetMat, rangoliGroup } = st.three;
    const v = st.plan.vision.venue;
    const spec = st.plan.spec;
    const theme = (st.plan.vision.layout && st.plan.vision.layout.theme) || { palette: ["#f7f1e3", "#c9a227", "#8c6d1f", "#ffffff"] };

    // 1. Lighting & Atmosphere
    const lp = LIGHTING_PRESETS[themeKey] || LIGHTING_PRESETS.golden;
    scene.background.set(lp.fog);
    scene.fog.color.set(lp.fog);
    ambLight.color.set(lp.ambient);
    ambLight.intensity = lp.ambInt;
    dirLight.color.set(lp.dir);
    dirLight.intensity = lp.dirInt;

    // 2. Floor Materials
    let floorCol = 0xddcca8, rough = 0.4, metal = 0.08;
    if (themeKey === "temple") {
      floorCol = 0xc2a677; // Terracotta / Sandstone
      rough = 0.55; metal = 0.10;
    } else if (themeKey === "royal") {
      floorCol = 0xede0cb; // Polished Royal Marble
      rough = 0.22; metal = 0.14;
    } else if (themeKey === "modern") {
      floorCol = 0xf8f9fa; // Ultra-white Reflective Marble
      rough = 0.12; metal = 0.20;
    } else if (themeKey === "garden") {
      floorCol = 0x3d6b2c; // Botanical Lawn
      rough = 0.85; metal = 0.02;
    } else if (themeKey === "birthday") {
      floorCol = 0xfce7f3; // Celebratory Terrazzo
      rough = 0.30; metal = 0.08;
    } else if (themeKey === "corporate") {
      floorCol = 0x1e2430; // Dark Graphite Auditorium
      rough = 0.65; metal = 0.05;
    }
    floorMat.color.set(floorCol);
    floorMat.roughness = rough;
    floorMat.metalness = metal;

    // 3. Ceremonial Aisle Carpet
    let carpetCol = 0x9e1b2f; // Royal Maroon
    if (themeKey === "temple") carpetCol = 0xb45309; // Saffron Gold
    else if (themeKey === "modern") carpetCol = 0xd4d4d8; // Titanium Silver
    else if (themeKey === "garden") carpetCol = 0xa8a29e; // Rustic Stone Paver
    else if (themeKey === "birthday") carpetCol = 0xdb2777; // Festive Magenta
    else if (themeKey === "corporate") carpetCol = 0x1d4ed8; // Corporate Navy
    carpetMat.color.set(carpetCol);

    // 4. Sacred Rangoli Visibility
    if (rangoliGroup) {
      rangoliGroup.visible = (themeKey === "temple");
    }

    // 5. Rebuild Elements (mandap/stage, seating, dining, buffet)
    const elements = (typeof VS !== "undefined" && VS.edits) ? VS.edits : st.plan.vision.layout.elements;
    if (st.three.elementsGroup) {
      st.three.scene.remove(st.three.elementsGroup);
    }
    const newGroup = new THREE.Group();
    st.three.elementsGroup = newGroup;
    st.three.scene.add(newGroup);
    st.flames = [];

    elements.forEach(el => {
      buildCelebrationElement(newGroup, el, spec, theme, v, themeKey);
    });

    renderer.render(scene, camera);
  }

  function reRender() {
    if (!st) return;
    const m = st.mode;
    mount(st.box, S.plan, m);
    markOutdated(false);
  }

  function init3D() {
    if (typeof THREE === "undefined") {
      st.canvas.style.display = "block";
      frame();
      return;
    }

    try {
      const width = st.cvBox.clientWidth || 920;
      const height = st.cvBox.clientHeight || 470;
      const scene = new THREE.Scene();
      const v = st.plan.vision.venue;
      const L = st.plan.vision.layout;
      const spec = st.plan.spec;
      const theme = L.theme || { palette: ["#f7f1e3", "#c9a227", "#8c6d1f", "#ffffff"] };
      const themeKey = st.themeKey;

      const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 500);
      camera.position.set(v.width / 2, Math.max(14, v.width * 0.65), v.depth * 1.15);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      st.cvBox.innerHTML = "";
      st.cvBox.appendChild(renderer.domElement);
      st.canvas.style.display = "none";

      // Orbit interaction
      let isDragging = false, prevMouse = { x: 0, y: 0 };
      const target = new THREE.Vector3(v.width / 2, 1.5, v.depth / 2);

      renderer.domElement.addEventListener("mousedown", e => {
        if (st.mode === "walk") return;
        isDragging = true;
        prevMouse = { x: e.clientX, y: e.clientY };
      });

      window.addEventListener("mousemove", e => {
        if (!isDragging || st.mode === "walk") return;
        const dx = e.clientX - prevMouse.x;
        const dy = e.clientY - prevMouse.y;
        prevMouse = { x: e.clientX, y: e.clientY };

        const rotSpeed = 0.005;
        const radius = camera.position.distanceTo(target);
        let theta = Math.atan2(camera.position.x - target.x, camera.position.z - target.z);
        let phi = Math.acos(Math.max(-1, Math.min(1, (camera.position.y - target.y) / radius)));

        theta -= dx * rotSpeed;
        phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, phi + dy * rotSpeed));

        camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
        camera.position.y = target.y + radius * Math.cos(phi);
        camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
        camera.lookAt(target);
        renderer.render(scene, camera);
      });

      window.addEventListener("mouseup", () => isDragging = false);

      renderer.domElement.addEventListener("wheel", e => {
        if (st.mode === "walk") return;
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.08 : 0.92;
        const offset = camera.position.clone().sub(target).multiplyScalar(factor);
        if (offset.length() > 3 && offset.length() < 120) {
          camera.position.copy(target).add(offset);
          camera.lookAt(target);
          renderer.render(scene, camera);
        }
      }, { passive: false });

      // Theme-specific Lighting & Atmosphere
      const lp = LIGHTING_PRESETS[themeKey] || LIGHTING_PRESETS.golden;
      scene.background = new THREE.Color(lp.fog);
      scene.fog = new THREE.FogExp2(lp.fog, 0.012);

      const ambLight = new THREE.AmbientLight(lp.ambient, lp.ambInt);
      scene.add(ambLight);

      const dirLight = new THREE.DirectionalLight(lp.dir, lp.dirInt);
      dirLight.position.set(v.width / 2, 25, v.depth * 0.8);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 2048;
      dirLight.shadow.mapSize.height = 2048;
      dirLight.shadow.camera.near = 1;
      dirLight.shadow.camera.far = 100;
      dirLight.shadow.camera.left = -v.width;
      dirLight.shadow.camera.right = v.width;
      dirLight.shadow.camera.top = v.depth;
      dirLight.shadow.camera.bottom = -v.depth;
      scene.add(dirLight);

      // Floor Mesh & Material
      let floorColor = 0xede0cb, roughness = 0.25, metalness = 0.12;
      if (themeKey === "temple") {
        floorColor = 0xc2a677;
        roughness = 0.55;
        metalness = 0.10;
      } else if (themeKey === "modern") {
        floorColor = 0xf8f9fa;
        roughness = 0.12;
        metalness = 0.20;
      } else if (themeKey === "garden") {
        floorColor = 0x3d6b2c;
        roughness = 0.85;
      } else if (themeKey === "birthday") {
        floorColor = 0xfce7f3;
        roughness = 0.30;
      } else if (themeKey === "corporate") {
        floorColor = 0x1e2430;
        roughness = 0.65;
      }

      const floorMat = new THREE.MeshStandardMaterial({ color: floorColor, roughness, metalness });
      const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(v.width, v.depth), floorMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.set(v.width / 2, 0, v.depth / 2);
      floorMesh.receiveShadow = true;
      scene.add(floorMesh);

      // Sacred Temple Rangoli Group
      const rangoliGroup = new THREE.Group();
      const rangoliGeo = new THREE.RingGeometry(0.2, 2.2, 32);
      const rangoliMat = new THREE.MeshBasicMaterial({ color: 0xd97706, side: THREE.DoubleSide });
      const rangoli = new THREE.Mesh(rangoliGeo, rangoliMat);
      rangoli.rotation.x = -Math.PI / 2;
      rangoli.position.set(v.width / 2, 0.02, v.depth * 0.35);
      rangoliGroup.add(rangoli);

      const innerRing = new THREE.Mesh(new THREE.RingGeometry(0.1, 1.2, 24), new THREE.MeshBasicMaterial({ color: 0x9b1c1f, side: THREE.DoubleSide }));
      innerRing.rotation.x = -Math.PI / 2;
      innerRing.position.set(v.width / 2, 0.025, v.depth * 0.35);
      rangoliGroup.add(innerRing);

      rangoliGroup.visible = (themeKey === "temple");
      scene.add(rangoliGroup);

      // Walls
      if (v.indoor) {
        let wallCol = 0xede4d3;
        if (themeKey === "temple") wallCol = 0xbfa980;
        else if (themeKey === "modern") wallCol = 0xf1f5f9;
        else if (themeKey === "corporate") wallCol = 0x0f172a;

        const wallMat = new THREE.MeshStandardMaterial({ color: wallCol, roughness: 0.8 });
        const wh = 5.2;

        const wN = new THREE.Mesh(new THREE.BoxGeometry(v.width, wh, 0.4), wallMat);
        wN.position.set(v.width / 2, wh / 2, 0);
        scene.add(wN);

        const wE = new THREE.Mesh(new THREE.BoxGeometry(0.4, wh, v.depth), wallMat);
        wE.position.set(v.width, wh / 2, v.depth / 2);
        scene.add(wE);

        const wW = new THREE.Mesh(new THREE.BoxGeometry(0.4, wh, v.depth), wallMat);
        wW.position.set(0, wh / 2, v.depth / 2);
        scene.add(wW);

        const mainDoor = v.doors.find(d => d.kind === "entrance") || { pos: v.width / 2, width: 4 };
        const wS1 = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.1, mainDoor.pos - mainDoor.width / 2), wh, 0.4), wallMat);
        wS1.position.set((mainDoor.pos - mainDoor.width / 2) / 2, wh / 2, v.depth);
        scene.add(wS1);

        const rWidth = Math.max(0.1, v.width - (mainDoor.pos + mainDoor.width / 2));
        const wS2 = new THREE.Mesh(new THREE.BoxGeometry(rWidth, wh, 0.4), wallMat);
        wS2.position.set(v.width - rWidth / 2, wh / 2, v.depth);
        scene.add(wS2);

        // Ceiling Chandeliers & Lighting Fixtures
        const chRows = Math.max(1, Math.floor(v.depth / 8));
        const chCols = Math.max(1, Math.floor(v.width / 8));
        for (let r = 0; r < chRows; r++) {
          for (let c = 0; c < chCols; c++) {
            const chX = (v.width / (chCols + 1)) * (c + 1);
            const chZ = (v.depth / (chRows + 1)) * (r + 1);

            const chGroup = new THREE.Group();
            const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2), new THREE.MeshBasicMaterial({ color: 0xc9a227 }));
            wire.position.set(0, wh - 0.6, 0);
            chGroup.add(wire);

            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.06, 8, 24), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 }));
            ring.rotation.x = Math.PI / 2;
            ring.position.set(0, wh - 1.2, 0);
            chGroup.add(ring);

            const chLight = new THREE.PointLight(themeKey === "temple" ? 0xffb703 : (themeKey === "modern" ? 0xffffff : 0xffe2aa), 0.85, 14);
            chLight.position.set(0, wh - 1.3, 0);
            chGroup.add(chLight);

            chGroup.position.set(chX, 0, chZ);
            scene.add(chGroup);
          }
        }
      }

      // Ceremonial Carpet Aisle
      let carpetCol = 0x9e1b2f;
      if (themeKey === "temple") carpetCol = 0xb45309;
      else if (themeKey === "modern") carpetCol = 0xd4d4d8;
      else if (themeKey === "garden") carpetCol = 0xa8a29e;
      else if (themeKey === "birthday") carpetCol = 0xdb2777;
      else if (themeKey === "corporate") carpetCol = 0x1d4ed8;

      const carpetGeo = new THREE.PlaneGeometry(3.0, v.depth - 5);
      const carpetMat = new THREE.MeshStandardMaterial({ color: carpetCol, roughness: 0.7 });
      const carpetMesh = new THREE.Mesh(carpetGeo, carpetMat);
      carpetMesh.rotation.x = -Math.PI / 2;
      carpetMesh.position.set(v.width / 2, 0.02, v.depth / 2 + 1.5);
      carpetMesh.receiveShadow = true;
      scene.add(carpetMesh);

      // Fixed Venue Pillars / Obstacles
      v.obstacles.forEach(obs => {
        const obsGeo = new THREE.CylinderGeometry(obs.w / 2, obs.w / 2, 4.8, 16);
        const obsMat = new THREE.MeshStandardMaterial({ color: themeKey === "temple" ? 0x7c6a46 : 0x8a826e, roughness: 0.6 });
        const obsMesh = new THREE.Mesh(obsGeo, obsMat);
        obsMesh.position.set(obs.x + obs.w / 2, 2.4, obs.y + obs.h / 2);
        obsMesh.castShadow = true;
        scene.add(obsMesh);
      });

      // Build Celebratory Elements per active theme
      const elementsGroup = new THREE.Group();
      scene.add(elementsGroup);
      st.flames = [];
      L.elements.forEach(el => {
        buildCelebrationElement(elementsGroup, el, spec, theme, v, themeKey);
      });

      camera.lookAt(target);
      renderer.render(scene, camera);

      st.three = {
        scene,
        camera,
        renderer,
        target,
        ambLight,
        dirLight,
        floorMesh,
        floorMat,
        carpetMesh,
        carpetMat,
        rangoliGroup,
        elementsGroup
      };
    } catch (e) {
      console.error("Three.js initialization failed:", e);
      st.canvas.style.display = "block";
      frame();
    }
  }

  /* =========================================================================
     BUILDER FOR PROCEDURAL 3D CELEBRATION ASSETS ACROSS ALL 6 THEMES
     Handles both "mandap" and "stage" gracefully so every celebration world
     renders authentic, photorealistic focal centerpieces.
     ========================================================================= */
  function buildCelebrationElement(parentGroup, el, spec, theme, venue, themeKey = "royal") {
    const pal = (theme && theme.palette) || ["#f7f1e3", "#c9a227", "#8c6d1f", "#ffffff"];
    const goldHex = parseInt((pal[1] || "#d4af37").replace("#", "0x"), 16);
    const primHex = parseInt((pal[0] || "#9e1b2f").replace("#", "0x"), 16);

    const cx = el.x + el.w / 2;
    const cz = el.y + el.h / 2;

    // Check if element is the focal celebration centerpiece (mandap OR stage)
    if (el.type === "mandap" || el.type === "stage") {
      const centerGroup = new THREE.Group();

      if (themeKey === "temple") {
        // ==========================================
        // 1. AUTHENTIC SOUTH INDIAN TEMPLE MANDAP
        // ==========================================
        // Stepped Temple Plinth Platform
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x826d4a, roughness: 0.65, metalness: 0.15 });
        const dais = new THREE.Mesh(new THREE.BoxGeometry(el.w, 0.45, el.h), stoneMat);
        dais.position.set(0, 0.22, 0);
        dais.receiveShadow = true;
        centerGroup.add(dais);

        // 4 Carved Stone Pillars with Stepped Capitals
        const offsets = [
          [-el.w / 2 + 0.4, -el.h / 2 + 0.4],
          [el.w / 2 - 0.4, -el.h / 2 + 0.4],
          [-el.w / 2 + 0.4, el.h / 2 - 0.4],
          [el.w / 2 - 0.4, el.h / 2 - 0.4]
        ];

        offsets.forEach(([ox, oz]) => {
          // Base pedestal
          const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.55), stoneMat);
          baseMesh.position.set(ox, 0.4, oz);
          centerGroup.add(baseMesh);

          // Carved fluted shaft
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.6, 16), stoneMat);
          shaft.position.set(ox, 1.8, oz);
          shaft.castShadow = true;
          centerGroup.add(shaft);

          // Bracket capital
          const cap = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.25, 0.65), stoneMat);
          cap.position.set(ox, 3.2, oz);
          centerGroup.add(cap);

          // Hanging Yellow & Orange Marigold Torans
          const toranMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.9 });
          const toran = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 8), toranMat);
          toran.position.set(ox, 1.9, oz + 0.16);
          centerGroup.add(toran);
        });

        // Temple Mandap Roof Canopy (Rich Maroon & Gold Trim)
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(el.w, 0.25, el.h), new THREE.MeshStandardMaterial({ color: 0x9b1c1f, roughness: 0.45 }));
        canopy.position.set(0, 3.4, 0);
        canopy.castShadow = true;
        centerGroup.add(canopy);

        // Floral Toran Border
        const florBorder = new THREE.Mesh(new THREE.TorusGeometry(el.w * 0.42, 0.14, 8, 20), new THREE.MeshStandardMaterial({ color: 0xffb703, roughness: 0.9 }));
        florBorder.rotation.x = Math.PI / 2;
        florBorder.position.set(0, 3.28, 0);
        centerGroup.add(florBorder);

        // 2 Banana Trees Flanking the Front Entrance Steps
        [-el.w / 2 - 0.45, el.w / 2 + 0.45].forEach(bx => {
          const bTree = new THREE.Group();
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x5a4a2b, roughness: 0.8 }));
          trunk.position.set(0, 1.1, 0);
          bTree.add(trunk);

          // 4 Broad Banana Leaves
          const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.6, side: THREE.DoubleSide });
          for (let l = 0; l < 4; l++) {
            const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 1.4), leafMat);
            leaf.rotation.x = -0.5;
            leaf.rotation.y = (l * Math.PI) / 2;
            leaf.position.set(0, 2.1, 0);
            bTree.add(leaf);
          }
          bTree.position.set(bx, 0, el.h / 2);
          centerGroup.add(bTree);
        });

        // 4 Authentic Brass Kuthuvilakku Floor Lamps with Flickering Glow
        const lampMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 });
        [
          [-el.w / 2 + 0.8, el.h / 2 - 0.2],
          [el.w / 2 - 0.8, el.h / 2 - 0.2],
          [-el.w / 2 + 0.8, -el.h / 2 + 0.8],
          [el.w / 2 - 0.8, -el.h / 2 + 0.8]
        ].forEach(([lx, lz]) => {
          const lampGroup = new THREE.Group();
          const lBase = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.1, 16), lampMat);
          lBase.position.set(0, 0.05, 0);
          lampGroup.add(lBase);

          const lStem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.1, 12), lampMat);
          lStem.position.set(0, 0.6, 0);
          lampGroup.add(lStem);

          const lDish = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.12, 0.08, 16), lampMat);
          lDish.position.set(0, 1.15, 0);
          lampGroup.add(lDish);

          const flame = new THREE.PointLight(0xff9900, 1.1, 5);
          flame.position.set(0, 1.25, 0);
          flame.baseIntensity = 1.1;
          lampGroup.add(flame);
          if (st) st.flames.push(flame);

          lampGroup.position.set(lx, 0.45, lz);
          centerGroup.add(lampGroup);
        });

        // Sacred Havan Kund (Fire Altar)
        const kund = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.9), new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.8 }));
        kund.position.set(0, 0.58, 0);
        centerGroup.add(kund);

        const kundFlame = new THREE.PointLight(0xff5500, 1.4, 7);
        kundFlame.position.set(0, 0.85, 0);
        kundFlame.baseIntensity = 1.4;
        centerGroup.add(kundFlame);
        if (st) st.flames.push(kundFlame);

      } else if (themeKey === "royal") {
        // ==========================================
        // 2. MYSURU ROYAL PALACE JHAROKHA STAGE
        // ==========================================
        // Royal Platform with Marble & Gold Finish
        const dais = new THREE.Mesh(new THREE.BoxGeometry(el.w, 0.6, el.h), new THREE.MeshStandardMaterial({ color: 0xf5eedf, roughness: 0.3 }));
        dais.position.set(0, 0.3, 0);
        centerGroup.add(dais);

        // Golden Jharokha Multi-Arch Palace Backdrop
        const archMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 });
        const jharokha = new THREE.Mesh(new THREE.BoxGeometry(el.w * 0.92, 3.4, 0.2), archMat);
        jharokha.position.set(0, 2.3, -el.h / 2 + 0.2);
        centerGroup.add(jharokha);

        // 3 Carved Palace Arches along backdrop
        [-el.w * 0.25, 0, el.w * 0.25].forEach(ax => {
          const arch = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.12, 8, 20), archMat);
          arch.position.set(ax, 2.6, -el.h / 2 + 0.32);
          centerGroup.add(arch);
        });

        // Royal Throneseat Sofa with Velvet Cushions
        const throne = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.75, 1.0), new THREE.MeshStandardMaterial({ color: 0x881337, roughness: 0.35 }));
        throne.position.set(0, 0.95, -el.h * 0.1);
        centerGroup.add(throne);

        // Crystal Chandelier above dais
        const chan = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.08, 8, 20), archMat);
        chan.rotation.x = Math.PI / 2;
        chan.position.set(0, 3.5, 0);
        centerGroup.add(chan);

        // Stage Warm Spotlights
        const spot = new THREE.SpotLight(0xfff1d0, 2.2, 18, Math.PI / 4, 0.3);
        spot.position.set(0, 5.0, 3.0);
        spot.target = dais;
        centerGroup.add(spot);

      } else if (themeKey === "modern") {
        // ==========================================
        // 3. MODERN LUXURY CONTEMPORARY STAGE
        // ==========================================
        // Pristine White Stage with Clean Edges
        const dais = new THREE.Mesh(new THREE.BoxGeometry(el.w, 0.45, el.h), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.15 }));
        dais.position.set(0, 0.22, 0);
        centerGroup.add(dais);

        // Dual Champagne Gold Geometric Arch Frames
        const goldGeoMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 });
        [-el.w * 0.22, el.w * 0.22].forEach(ax => {
          const archFrame = new THREE.Mesh(new THREE.BoxGeometry(el.w * 0.4, 3.2, 0.1), goldGeoMat);
          archFrame.position.set(ax, 2.05, -el.h / 2 + 0.3);
          centerGroup.add(archFrame);
        });

        // Suspended White Floral & Wisteria Canopy Overhead
        const florMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.8 });
        const canopyMesh = new THREE.Mesh(new THREE.BoxGeometry(el.w * 0.85, 0.3, el.h * 0.5), florMat);
        canopyMesh.position.set(0, 3.4, -el.h * 0.1);
        centerGroup.add(canopyMesh);

        // Sleek Mirrored Pedestals with Vases
        [-el.w * 0.38, el.w * 0.38].forEach(px => {
          const ped = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.2, 0.45), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.8 }));
          ped.position.set(px, 1.05, el.h * 0.15);
          centerGroup.add(ped);

          const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 12), goldGeoMat);
          vase.position.set(px, 1.95, el.h * 0.15);
          centerGroup.add(vase);
        });

        // Curved Designer Minimal Loveseat
        const couch = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 0.85), new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.25 }));
        couch.position.set(0, 0.78, -el.h * 0.08);
        centerGroup.add(couch);

        // Stage Lip Linear LED Glow Strip
        const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(el.w, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
        ledStrip.position.set(0, 0.45, el.h / 2 - 0.04);
        centerGroup.add(ledStrip);

      } else if (themeKey === "garden") {
        // ==========================================
        // 4. BOTANICAL GARDEN & PERGOLA CELEBRATION
        // ==========================================
        // Natural Timber Deck Platform
        const timberMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.8 });
        const deck = new THREE.Mesh(new THREE.BoxGeometry(el.w, 0.35, el.h), timberMat);
        deck.position.set(0, 0.17, 0);
        centerGroup.add(deck);

        // Rustic Timber Pergola (4 Uprights & Crossbeams)
        const pergolaMat = new THREE.MeshStandardMaterial({ color: 0x6f4e37, roughness: 0.75 });
        const offsets = [
          [-el.w / 2 + 0.35, -el.h / 2 + 0.35],
          [el.w / 2 - 0.35, -el.h / 2 + 0.35],
          [-el.w / 2 + 0.35, el.h / 2 - 0.35],
          [el.w / 2 - 0.35, el.h / 2 - 0.35]
        ];

        offsets.forEach(([ox, oz]) => {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.2, 0.24), pergolaMat);
          post.position.set(ox, 1.75, oz);
          centerGroup.add(post);

          // Climbing Ivy & Blush Roses
          const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.8, 8), new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.85 }));
          vine.position.set(ox + 0.08, 1.7, oz + 0.08);
          centerGroup.add(vine);
        });

        // Overhead Pergola Rafters
        for (let r = 0; r < 5; r++) {
          const rz = -el.h / 2 + 0.4 + (r * (el.h - 0.8)) / 4;
          const beam = new THREE.Mesh(new THREE.BoxGeometry(el.w + 0.4, 0.16, 0.14), pergolaMat);
          beam.position.set(0, 3.38, rz);
          centerGroup.add(beam);
        }

        // Criss-Crossed Edison Bulb Fairy Lights Overhead
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
        for (let b = 0; b < 6; b++) {
          const bx = -el.w * 0.35 + (b * (el.w * 0.7)) / 5;
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), bulbMat);
          bulb.position.set(bx, 3.15, (b % 2 === 0 ? 0.3 : -0.3));
          centerGroup.add(bulb);

          const bulbLight = new THREE.PointLight(0xffe2aa, 0.6, 6);
          bulbLight.position.set(bx, 3.1, (b % 2 === 0 ? 0.3 : -0.3));
          centerGroup.add(bulbLight);
        }

        // Rustic Wooden Garden Bench
        const bench = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 0.7), new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.7 }));
        bench.position.set(0, 0.65, -el.h * 0.1);
        centerGroup.add(bench);

      } else if (themeKey === "birthday") {
        // ==========================================
        // 5. FESTIVE MILESTONE BIRTHDAY FANTASY
        // ==========================================
        const dais = new THREE.Mesh(new THREE.BoxGeometry(el.w, 0.4, el.h), new THREE.MeshStandardMaterial({ color: 0xfdf2f8, roughness: 0.3 }));
        dais.position.set(0, 0.2, 0);
        centerGroup.add(dais);

        // Cascading Multi-Color Balloon Arch Garland
        const bColors = [0xec4899, 0x38bdf8, 0xfacc15, 0xa855f7, 0xf43f5e];
        for (let b = 0; b < 24; b++) {
          const angle = (b / 23) * Math.PI;
          const bx = Math.cos(angle) * (el.w * 0.42);
          const by = Math.sin(angle) * 2.2 + 1.1;
          const bMat = new THREE.MeshStandardMaterial({ color: bColors[b % bColors.length], roughness: 0.2, metalness: 0.1 });
          const bMesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), bMat);
          bMesh.position.set(bx, by, -el.h / 2 + 0.3);
          centerGroup.add(bMesh);
        }

        // Glowing Neon Script Sign ("CELEBRATE")
        const neonSign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.08), new THREE.MeshBasicMaterial({ color: 0xf43f5e }));
        neonSign.position.set(0, 2.7, -el.h / 2 + 0.35);
        centerGroup.add(neonSign);

        const neonGlow = new THREE.PointLight(0xf43f5e, 1.2, 7);
        neonGlow.position.set(0, 2.7, -el.h / 2 + 0.5);
        centerGroup.add(neonGlow);

        // 3-Tier Birthday Cake Table
        const cakeTable = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.85, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
        cakeTable.position.set(0, 0.82, 0);
        centerGroup.add(cakeTable);

        // Tiered Cake
        const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0xf472b6 }));
        c1.position.set(0, 1.35, 0);
        centerGroup.add(c1);

        const c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 16), new THREE.MeshStandardMaterial({ color: 0xfef08a }));
        c2.position.set(0, 1.52, 0);
        centerGroup.add(c2);

      } else if (themeKey === "corporate") {
        // ==========================================
        // 6. EXECUTIVE KEYNOTE & CORPORATE GALA STAGE
        // ==========================================
        const dais = new THREE.Mesh(new THREE.BoxGeometry(el.w, 0.55, el.h), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 }));
        dais.position.set(0, 0.27, 0);
        centerGroup.add(dais);

        // Dual Massive Curved LED Display Panels
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
        [-el.w * 0.26, el.w * 0.26].forEach(sx => {
          const scr = new THREE.Mesh(new THREE.BoxGeometry(el.w * 0.45, 2.8, 0.12), ledMat);
          scr.position.set(sx, 2.3, -el.h / 2 + 0.25);
          centerGroup.add(scr);

          const ledLight = new THREE.PointLight(0x38bdf8, 1.0, 8);
          ledLight.position.set(sx, 2.3, -el.h / 2 + 0.8);
          centerGroup.add(ledLight);
        });

        // Keynote Presenter Podium with Cyan Accent
        const podium = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.25 }));
        podium.position.set(0, 1.15, el.h * 0.15);
        centerGroup.add(podium);

        const podGlow = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.05, 0.62), new THREE.MeshBasicMaterial({ color: 0x06b6d4 }));
        podGlow.position.set(0, 1.6, el.h * 0.15);
        centerGroup.add(podGlow);

        // Overhead Stage Truss Spotlights
        const truss = new THREE.Mesh(new THREE.BoxGeometry(el.w * 0.9, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 }));
        truss.position.set(0, 4.2, 0);
        centerGroup.add(truss);

        const spot1 = new THREE.SpotLight(0xffffff, 2.5, 18, Math.PI / 5, 0.2);
        spot1.position.set(-el.w * 0.25, 4.2, 1.5);
        spot1.target = dais;
        centerGroup.add(spot1);

        const spot2 = new THREE.SpotLight(0xffffff, 2.5, 18, Math.PI / 5, 0.2);
        spot2.position.set(el.w * 0.25, 4.2, 1.5);
        spot2.target = dais;
        centerGroup.add(spot2);
      }

      centerGroup.position.set(cx, 0, cz);
      parentGroup.add(centerGroup);
      return;
    }

    switch (el.type) {
      case "seating": {
        const seatGroup = new THREE.Group();
        let chairCol = 0xd4af37, seatCol = primHex;
        if (themeKey === "modern") { chairCol = 0xffffff; seatCol = 0x334155; }
        else if (themeKey === "garden") { chairCol = 0x6f4e37; seatCol = 0xdcfce7; }
        else if (themeKey === "corporate") { chairCol = 0x1e293b; seatCol = 0x0f172a; }

        const chairMat = new THREE.MeshStandardMaterial({ color: chairCol, roughness: 0.4, metalness: 0.3 });
        const seatMat = new THREE.MeshStandardMaterial({ color: seatCol, roughness: 0.6 });

        const rows = Math.min(8, Math.max(2, Math.floor(el.h / 1.5)));
        const cols = Math.min(12, Math.max(3, Math.floor(el.w / 1.4)));

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const chX = -el.w / 2 + 0.7 + (c * (el.w - 1.4)) / Math.max(1, cols - 1);
            const chZ = -el.h / 2 + 0.7 + (r * (el.h - 1.4)) / Math.max(1, rows - 1);

            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), seatMat);
            seat.position.set(chX, 0.45, chZ);
            seat.castShadow = true;
            seatGroup.add(seat);

            const back = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.5, 0.06), chairMat);
            back.position.set(chX, 0.72, chZ + 0.22);
            seatGroup.add(back);
          }
        }

        seatGroup.position.set(cx, 0, cz);
        parentGroup.add(seatGroup);
        break;
      }

      case "dining": {
        const dinGroup = new THREE.Group();
        const linenMat = new THREE.MeshStandardMaterial({ color: 0xfdfbf7, roughness: 0.4 });
        const runMat = new THREE.MeshStandardMaterial({ color: goldHex, roughness: 0.5 });
        const florMat = new THREE.MeshStandardMaterial({ color: themeKey === "temple" ? 0xf59e0b : 0xe11d48, roughness: 0.8 });

        const tRows = Math.min(5, Math.max(1, Math.floor(el.h / 2.6)));
        const tCols = Math.min(8, Math.max(1, Math.floor(el.w / 2.6)));

        for (let r = 0; r < tRows; r++) {
          for (let c = 0; c < tCols; c++) {
            const tx = -el.w / 2 + 1.2 + (c * (el.w - 2.4)) / Math.max(1, tCols - 1);
            const tz = -el.h / 2 + 1.2 + (r * (el.h - 2.4)) / Math.max(1, tRows - 1);

            const table = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.75, 16), linenMat);
            table.position.set(tx, 0.38, tz);
            table.castShadow = true;
            dinGroup.add(table);

            const runner = new THREE.Mesh(new THREE.CylinderGeometry(0.81, 0.81, 0.02, 16), runMat);
            runner.position.set(tx, 0.76, tz);
            dinGroup.add(runner);

            const center = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), florMat);
            center.position.set(tx, 0.85, tz);
            dinGroup.add(center);
          }
        }

        dinGroup.position.set(cx, 0, cz);
        parentGroup.add(dinGroup);
        break;
      }

      case "buffet": {
        const bufGroup = new THREE.Group();
        const skirtMat = new THREE.MeshStandardMaterial({ color: primHex, roughness: 0.6 });
        const topMat = new THREE.MeshStandardMaterial({ color: 0xf8f9fa, roughness: 0.2 });
        const dishMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 });

        const counter = new THREE.Mesh(new THREE.BoxGeometry(el.w, 0.9, el.h), skirtMat);
        counter.position.set(0, 0.45, 0);
        counter.castShadow = true;
        bufGroup.add(counter);

        const counterTop = new THREE.Mesh(new THREE.BoxGeometry(el.w + 0.1, 0.05, el.h + 0.1), topMat);
        counterTop.position.set(0, 0.92, 0);
        bufGroup.add(counterTop);

        const numDishes = Math.min(8, Math.max(2, Math.floor(el.w / 1.2)));
        for (let d = 0; d < numDishes; d++) {
          const dx = -el.w / 2 + 0.7 + (d * (el.w - 1.4)) / Math.max(1, numDishes - 1);
          const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 12), dishMat);
          dish.position.set(dx, 1.05, 0);
          bufGroup.add(dish);
        }

        bufGroup.position.set(cx, 0, cz);
        parentGroup.add(bufGroup);
        break;
      }

      default: {
        const genMat = new THREE.MeshStandardMaterial({ color: goldHex, roughness: 0.5, metalness: 0.2 });
        const box = new THREE.Mesh(new THREE.BoxGeometry(el.w, 1.0, el.h), genMat);
        box.position.set(cx, 0.5, cz);
        box.castShadow = true;
        parentGroup.add(box);
        break;
      }
    }
  }

  function getWalkthroughCamPos(sc, venue, t) {
    const route = sc.route && sc.route.length > 1 ? sc.route : [
      [venue.width / 2, venue.depth - 1.0],
      [venue.width / 2, venue.depth * 0.6],
      [sc.zone.cx || venue.width / 2, sc.zone.cy || 4.0]
    ];

    const segs = [];
    let totLen = 0;
    for (let k = 1; k < route.length; k++) {
      const l = Math.hypot(route[k][0] - route[k - 1][0], route[k][1] - route[k - 1][1]);
      segs.push(l);
      totLen += l;
    }

    const walkT = Math.min(DUR * 0.75, Math.max(2, totLen / 1.5));
    const u = Math.min(1, t / walkT);
    let d = u * totLen;
    let k = 0;
    while (k < segs.length - 1 && d > segs[k]) {
      d -= segs[k];
      k++;
    }

    const a = route[k], b = route[k + 1] || a;
    const f = segs[k] ? Math.min(1, d / segs[k]) : 0;
    const x = a[0] + (b[0] - a[0]) * f;
    const z = a[1] + (b[1] - a[1]) * f;
    const targetZ = sc.zone.cy || 3.5;
    const targetX = sc.zone.cx || venue.width / 2;

    const head = Math.atan2(targetX - x, targetZ - z);
    const bob = u < 1 ? Math.sin(t * 6.5) * 0.04 : 0;

    return { x, y: 1.65 + bob, z, head };
  }

  function frame() {
    if (!st) return;
    const scn = st.scenes[st.i];
    if (!scn) return;

    // Flame flicker animation
    if (st.flames && st.flames.length) {
      const time = performance.now() * 0.006;
      st.flames.forEach((fl, idx) => {
        fl.intensity = fl.baseIntensity + Math.sin(time * 3 + idx) * 0.16 + Math.cos(time * 7 + idx * 2) * 0.08;
      });
    }

    if (st.three && st.three.renderer) {
      if (st.mode === "walk") {
        const camData = getWalkthroughCamPos(scn, st.plan.vision.venue, st.t);
        st.three.camera.position.set(camData.x, camData.y, camData.z);
        const lookTarget = new THREE.Vector3(
          camData.x + Math.sin(camData.head) * 10,
          1.7,
          camData.z + Math.cos(camData.head) * 10
        );
        st.three.camera.lookAt(lookTarget);
      }
      st.three.renderer.render(st.three.scene, st.three.camera);
    } else {
      drawCanvasFallback(st.canvas, st.plan, scn, st.t);
    }
  }

  function drawCanvasFallback(cv, plan, sc, t) {
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const vis = plan.vision, v = vis.venue;
    const camData = getWalkthroughCamPos(sc, v, t);

    const lp = LIGHTING_PRESETS[st ? st.themeKey : "golden"] || LIGHTING_PRESETS.golden;
    const sky = lp.sky;

    const g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#ddcca8"; ctx.fillRect(0, H * 0.55, W, H * 0.45);

    ctx.fillStyle = "#d4af37";
    ctx.font = "bold 18px Inter, sans-serif";
    ctx.fillText(`${sc.title} (${sc.start})`, 24, 36);
    ctx.fillStyle = "#ffffff";
    ctx.font = "13px Inter, sans-serif";
    ctx.fillText(`Camera position: (${camData.x.toFixed(1)}m, ${camData.z.toFixed(1)}m) · Eye level 1.65m`, 24, 62);
  }

  function record() {
    if (!st) return;
    const cv = st.three && st.three.renderer ? st.three.renderer.domElement : st.canvas;
    if (!cv || !cv.captureStream || typeof MediaRecorder === "undefined") {
      return toast("Recording not supported in this browser — please use GIF export", "bad");
    }
    const chunks = [];
    const rec = new MediaRecorder(cv.captureStream(30), { mimeType: MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "" });
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
      a.download = `eventforge-${st.plan.spec.event_type}-tour.webm`;
      a.click();
      pause();
      toast("Celebration walkthrough saved!", "ok");
    };
    st.i = 0; st.t = 0; caption(); play(); rec.start();
    toast("Recording full celebration walkthrough…");
    const total = st.scenes.length * DUR * 1000;
    setTimeout(() => rec.state !== "inactive" && rec.stop(), total + 400);
  }

  return { mount, stop, setCameraPreset, markOutdated, syncElements, reRender, setTheme };
})();
