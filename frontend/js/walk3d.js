"use strict";
/* EventForge Cinematic Vision Studio & 3D Celebration Venue Renderer
   Supports:
   1. WebGL Three.js Realistic Celebration Environment (Wedding Mandap, Draped Stage, Linen Tables, Banquet Chairs, Chandeliers, Fairy Lights)
   2. Interactive Orbit & Pan Controls with Instant Viewpoint Presets (Stage, Aisle, Seating, Buffet, Overview)
   3. Cinematic Guided Walkthrough with Voice Narration & Timeline Scrubber
   4. High-Detail Procedural Canvas Fallback for systems without WebGL
*/

const Walk = (() => {
  let st = null; // State object
  const DUR = 7; // Seconds per scene in walkthrough

  // Lighting atmospheres
  const LIGHTING_PRESETS = {
    golden: { ambient: 0xffe8d6, ambInt: 0.85, dir: 0xfff3e0, dirInt: 1.2, fog: 0x1a1528, sky: ["#f6c58b", "#fbe8cf"] },
    evening: { ambient: 0xffd1b3, ambInt: 0.7, dir: 0xffaa5e, dirInt: 1.0, fog: 0x14182b, sky: ["#f3a37a", "#f8d6b8"] },
    night: { ambient: 0x8a9bb8, ambInt: 0.5, dir: 0x4a6fa5, dirInt: 0.6, fog: 0x090d1a, sky: ["#0b1120", "#1e293b"] },
    day: { ambient: 0xffffff, ambInt: 0.9, dir: 0xfffaf0, dirInt: 1.1, fog: 0xd8e6f3, sky: ["#bcd9f2", "#eef6fc"] }
  };

  function mount(box, plan, initialMode = "3d") {
    stop();
    const vis = plan.vision;
    const sc = vis.scenes || [];
    const v = vis.venue;
    const L = vis.layout;
    const theme = L.theme || { name: "Royal Gold", palette: ["#f7f1e3", "#c9a227", "#8c6d1f", "#ffffff"] };

    box.innerHTML = `
      <div class="vision-studio-wrapper">
        <!-- Visualization Toolbar -->
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
        <div class="viewport-box" id="vp-container" style="position:relative;width:100%;height:460px;background:#0b1120;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.4)">
          <canvas id="walk-cv" width="920" height="460" style="width:100%;height:100%;display:block"></canvas>
          <div id="three-container" style="position:absolute;inset:0;pointer-events:auto"></div>

          <!-- Walkthrough Floating Subtitle Overlay -->
          <div id="walk-caption-overlay" class="walk-overlay-bar" style="display:${initialMode === "walk" ? "flex" : "none"}">
            <div class="walk-cap-left">
              <span class="walk-live-dot"></span>
              <div>
                <div id="w-cap-title" class="bold text-gold" style="font-size:14px">Grand Entrance Aisle</div>
                <div id="w-cap-text" class="tiny text-ivory" style="opacity:0.85">Walking past flower-lined aisle toward the decorated wedding mandap</div>
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
          <span>Venue: <b>${esc(v.name)}</b> (${v.width} × ${v.depth}m) · Theme: <b style="color:${theme.palette[1] || '#d4af37'}">${esc(theme.name)}</b></span>
          <span>100% Connected to deterministic layout &amp; safety validation</span>
        </div>
      </div>
    `;

    st = {
      plan,
      scenes: sc,
      mode: initialMode,
      i: 0,
      t: 0,
      playing: false,
      voice: false,
      raf: 0,
      last: 0,
      box,
      three: null,
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

    // Walkthrough Buttons
    $("#w-play", box).onclick = () => st.playing ? pause() : play();
    $("#w-prev", box).onclick = () => jump(st.i - 1);
    $("#w-next", box).onclick = () => jump(st.i + 1);
    $$("[data-sc]", box).forEach(b => b.onclick = () => jump(+b.dataset.sc));

    $("#w-voice", box).onclick = () => {
      st.voice = !st.voice;
      $("#w-voice", box).textContent = st.voice ? "🔊 Narration: ON" : "🔇 Narration: Off";
      if (st.voice && st.scenes[st.i]) {
        speak(`${st.scenes[st.i].start}: ${st.scenes[st.i].title}. ${st.scenes[st.i].caption}`);
      } else if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };

    const scrubber = $("#w-scrub", box);
    if (scrubber) {
      scrubber.oninput = () => {
        const val = +scrubber.value;
        const total = (st.scenes.length || 1) * DUR;
        const curSec = (val / 100) * total;
        st.i = Math.min(st.scenes.length - 1, Math.floor(curSec / DUR));
        st.t = curSec % DUR;
        caption();
        frame();
      };
    }

    $("#w-rec", box).onclick = record;

    // Initialize 3D Engine (Three.js WebGL with graceful fallback)
    init3D();
    caption();
  }

  function stop() {
    if (st) {
      cancelAnimationFrame(st.raf);
      if (st.three && st.three.renderer) {
        try {
          st.three.renderer.dispose();
          st.cvBox.innerHTML = "";
        } catch (e) {}
      }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      st = null;
    }
  }

  function play() {
    if (!st) return;
    st.playing = true;
    st.last = performance.now();
    const btn = $("#w-play", st.box);
    if (btn) btn.textContent = "⏸ Pause";
    st.raf = requestAnimationFrame(tick);
    if (st.voice && st.scenes[st.i]) {
      speak(`${st.scenes[st.i].start}: ${st.scenes[st.i].title}. ${st.scenes[st.i].caption}`);
    }
  }

  function pause() {
    if (!st) return;
    st.playing = false;
    cancelAnimationFrame(st.raf);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    const btn = $("#w-play", st.box);
    if (btn) btn.textContent = "▶ Play Tour";
  }

  function jump(idx) {
    if (!st || !st.scenes.length) return;
    st.i = (idx + st.scenes.length) % st.scenes.length;
    st.t = 0;
    caption();
    frame();
  }

  function caption() {
    if (!st || !st.scenes[st.i]) return;
    const scn = st.scenes[st.i];
    const tit = $("#w-cap-title", st.box);
    const txt = $("#w-cap-text", st.box);
    const badge = $("#w-time-badge", st.box);
    if (tit) tit.textContent = `${scn.start} — ${scn.title}`;
    if (txt) txt.textContent = scn.caption;
    if (badge) badge.textContent = `Scene ${st.i + 1}/${st.scenes.length}`;

    $$("[data-sc]", st.box).forEach((b, k) => {
      b.classList.toggle("active", k === st.i);
    });

    const scrub = $("#w-scrub", st.box);
    if (scrub && st.scenes.length) {
      const curSec = st.i * DUR + st.t;
      const total = st.scenes.length * DUR;
      scrub.value = Math.round((curSec / total) * 100);
    }

    if (st.voice && st.playing) {
      speak(`${scn.start}: ${scn.title}. ${scn.caption}`);
    }
  }

  function speak(text) {
    if (!st || !st.voice || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      window.speechSynthesis.speak(u);
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
    if (!st) return;
    const v = st.plan.vision.venue;
    const W = v.width, D = v.depth;

    if (st.three && st.three.camera) {
      const cam = st.three.camera;
      const controls = st.three.controls;
      switch (preset) {
        case "stage":
          cam.position.set(W / 2, 3.2, D - 6);
          if (controls) controls.target.set(W / 2, 2.0, 3.5);
          break;
        case "aisle":
          cam.position.set(W / 2, 1.7, D - 1);
          if (controls) controls.target.set(W / 2, 1.8, D / 2);
          break;
        case "seating":
          cam.position.set(W / 4, 2.2, D / 2);
          if (controls) controls.target.set(W / 2, 2.0, 4);
          break;
        case "buffet":
          cam.position.set(W - 4, 2.2, D / 2);
          if (controls) controls.target.set(W - 3, 1.5, D * 0.7);
          break;
        case "overview":
        default:
          cam.position.set(W / 2, Math.max(16, W * 0.7), D * 1.3);
          if (controls) controls.target.set(W / 2, 1.0, D / 2);
          break;
      }
      if (controls) controls.update();
      st.three.renderer.render(st.three.scene, cam);
    } else {
      // Fallback 2D canvas view
      st.t = preset === "stage" ? 4.5 : preset === "aisle" ? 1.0 : 0;
      frame();
    }
  }

  /* ==========================================================================
     THREE.JS REALISTIC WEBGL SCENE BUILDER
     ========================================================================== */
  function init3D() {
    if (typeof THREE === "undefined") {
      console.warn("Three.js not found; using enhanced high-detail 2D/3D canvas renderer.");
      st.canvas.style.display = "block";
      frame();
      return;
    }

    try {
      const width = st.cvBox.clientWidth || 920;
      const height = st.cvBox.clientHeight || 460;
      const scene = new THREE.Scene();
      const v = st.plan.vision.venue;
      const L = st.plan.vision.layout;
      const spec = st.plan.spec;
      const theme = L.theme || { palette: ["#f7f1e3", "#c9a227", "#8c6d1f", "#ffffff"] };

      // Camera
      const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 500);
      camera.position.set(v.width / 2, Math.max(15, v.width * 0.65), v.depth * 1.25);

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      st.cvBox.innerHTML = "";
      st.cvBox.appendChild(renderer.domElement);
      st.canvas.style.display = "none"; // Hide fallback canvas

      // Orbit controls simulation
      let controls = null;
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

      controls = { target, update: () => camera.lookAt(target) };

      // Atmosphere & Lighting
      const lightPreset = LIGHTING_PRESETS.golden;
      scene.background = new THREE.Color(lightPreset.fog);
      scene.fog = new THREE.FogExp2(lightPreset.fog, 0.012);

      const ambLight = new THREE.AmbientLight(lightPreset.ambient, 0.9);
      scene.add(ambLight);

      const dirLight = new THREE.DirectionalLight(lightPreset.dir, 1.2);
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

      // Floor
      const floorMat = new THREE.MeshStandardMaterial({
        color: v.indoor ? 0xddcca8 : 0x769b52,
        roughness: 0.35,
        metalness: 0.08
      });
      const floorGeo = new THREE.PlaneGeometry(v.width, v.depth);
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.set(v.width / 2, 0, v.depth / 2);
      floorMesh.receiveShadow = true;
      scene.add(floorMesh);

      // Walls
      if (v.indoor) {
        const wallMat = new THREE.MeshStandardMaterial({
          color: 0xede4d3,
          roughness: 0.85,
          metalness: 0.02
        });
        const wh = 5.0;

        // North wall
        const wN = new THREE.Mesh(new THREE.BoxGeometry(v.width, wh, 0.4), wallMat);
        wN.position.set(v.width / 2, wh / 2, 0);
        scene.add(wN);

        // East wall
        const wE = new THREE.Mesh(new THREE.BoxGeometry(0.4, wh, v.depth), wallMat);
        wE.position.set(v.width, wh / 2, v.depth / 2);
        scene.add(wE);

        // West wall
        const wW = new THREE.Mesh(new THREE.BoxGeometry(0.4, wh, v.depth), wallMat);
        wW.position.set(0, wh / 2, v.depth / 2);
        scene.add(wW);

        // South wall with entrance gap
        const mainDoor = v.doors.find(d => d.kind === "entrance") || { pos: v.width / 2, width: 4 };
        const wS1 = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.1, mainDoor.pos - mainDoor.width / 2), wh, 0.4), wallMat);
        wS1.position.set((mainDoor.pos - mainDoor.width / 2) / 2, wh / 2, v.depth);
        scene.add(wS1);

        const rWidth = Math.max(0.1, v.width - (mainDoor.pos + mainDoor.width / 2));
        const wS2 = new THREE.Mesh(new THREE.BoxGeometry(rWidth, wh, 0.4), wallMat);
        wS2.position.set(v.width - rWidth / 2, wh / 2, v.depth);
        scene.add(wS2);

        // Chandeliers & Hanging Warm Lights
        const chRows = Math.max(1, Math.floor(v.depth / 8));
        const chCols = Math.max(1, Math.floor(v.width / 8));
        for (let r = 0; r < chRows; r++) {
          for (let c = 0; c < chCols; c++) {
            const chX = (v.width / (chCols + 1)) * (c + 1);
            const chZ = (v.depth / (chRows + 1)) * (r + 1);

            const chGroup = new THREE.Group();
            // Hanging wire
            const wireMat = new THREE.MeshBasicMaterial({ color: 0xc9a227 });
            const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2), wireMat);
            wire.position.set(0, wh - 0.6, 0);
            chGroup.add(wire);

            // Chandelier fixture
            const ringGeo = new THREE.TorusGeometry(0.8, 0.06, 8, 24);
            const ringMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.set(0, wh - 1.2, 0);
            chGroup.add(ring);

            // Point light
            const chLight = new THREE.PointLight(0xffe2aa, 0.9, 14);
            chLight.position.set(0, wh - 1.3, 0);
            chGroup.add(chLight);

            chGroup.position.set(chX, 0, chZ);
            scene.add(chGroup);
          }
        }
      }

      // Ceremonial Red Carpet Aisle
      const carpetGeo = new THREE.PlaneGeometry(3.0, v.depth - 5);
      const carpetMat = new THREE.MeshStandardMaterial({ color: 0x9e1b2f, roughness: 0.7 });
      const carpet = new THREE.Mesh(carpetGeo, carpetMat);
      carpet.rotation.x = -Math.PI / 2;
      carpet.position.set(v.width / 2, 0.02, v.depth / 2 + 1.5);
      carpet.receiveShadow = true;
      scene.add(carpet);

      // Obstacles (Pillars / Trees)
      v.obstacles.forEach(obs => {
        const obsGeo = new THREE.CylinderGeometry(obs.w / 2, obs.w / 2, 4.5, 16);
        const obsMat = new THREE.MeshStandardMaterial({ color: 0x8a826e, roughness: 0.6 });
        const obsMesh = new THREE.Mesh(obsGeo, obsMat);
        obsMesh.position.set(obs.x + obs.w / 2, 2.25, obs.y + obs.h / 2);
        obsMesh.castShadow = true;
        scene.add(obsMesh);
      });

      // Build Rich Elements
      L.elements.forEach(el => {
        buildCelebrationElement(scene, el, spec, theme, v);
      });

      camera.lookAt(target);
      renderer.render(scene, camera);

      st.three = { scene, camera, renderer, controls, target };
    } catch (e) {
      console.error("Three.js initialization failed, falling back to 2D/3D canvas:", e);
      st.canvas.style.display = "block";
      frame();
    }
  }

  /* Builder for High-Quality Procedural 3D Celebration Assets */
  function buildCelebrationElement(scene, el, spec, theme, venue) {
    const pal = theme.palette || ["#f7f1e3", "#c9a227", "#8c6d1f", "#ffffff"];
    const goldHex = parseInt((pal[1] || "#d4af37").replace("#", "0x"), 16);
    const primHex = parseInt((pal[0] || "#9e1b2f").replace("#", "0x"), 16);
    const whiteHex = 0xffffff;

    const cx = el.x + el.w / 2;
    const cz = el.y + el.h / 2;

    switch (el.type) {
      case "mandap": {
        // 4 Carved Golden Pillars + Floral Canopy
        const mandapGroup = new THREE.Group();
        const pilMat = new THREE.MeshStandardMaterial({ color: goldHex, metalness: 0.85, roughness: 0.25 });
        const pilGeo = new THREE.CylinderGeometry(0.2, 0.25, 3.2, 16);

        const offsets = [
          [-el.w / 2 + 0.3, -el.h / 2 + 0.3],
          [el.w / 2 - 0.3, -el.h / 2 + 0.3],
          [-el.w / 2 + 0.3, el.h / 2 - 0.3],
          [el.w / 2 - 0.3, el.h / 2 - 0.3]
        ];

        offsets.forEach(([ox, oz]) => {
          const col = new THREE.Mesh(pilGeo, pilMat);
          col.position.set(ox, 1.6, oz);
          col.castShadow = true;
          mandapGroup.add(col);

          // Hanging Marigold Garlands
          const garMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.9 });
          const gar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), garMat);
          gar.position.set(ox, 1.8, oz + 0.15);
          mandapGroup.add(gar);
        });

        // Canopy Roof
        const canopyMat = new THREE.MeshStandardMaterial({ color: primHex, roughness: 0.5 });
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(el.w, 0.2, el.h), canopyMat);
        canopy.position.set(0, 3.2, 0);
        canopy.castShadow = true;
        mandapGroup.add(canopy);

        // Floral border
        const florMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.9 });
        const florBorder = new THREE.Mesh(new THREE.TorusGeometry(el.w * 0.42, 0.12, 8, 16), florMat);
        florBorder.rotation.x = Math.PI / 2;
        florBorder.position.set(0, 3.1, 0);
        mandapGroup.add(florBorder);

        // Sacred Fire Altar (Havan Kund)
        const altar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 1.0), new THREE.MeshStandardMaterial({ color: 0xb45309 }));
        altar.position.set(0, 0.15, 0);
        mandapGroup.add(altar);

        const flameLight = new THREE.PointLight(0xff8c00, 1.2, 6);
        flameLight.position.set(0, 0.5, 0);
        mandapGroup.add(flameLight);

        mandapGroup.position.set(cx, 0, cz);
        scene.add(mandapGroup);
        break;
      }

      case "stage": {
        // Raised Platform + Backdrop Drapes + Royal Loveseat
        const stGroup = new THREE.Group();
        const platMat = new THREE.MeshStandardMaterial({ color: primHex, roughness: 0.6 });
        const plat = new THREE.Mesh(new THREE.BoxGeometry(el.w, 0.8, el.h), platMat);
        plat.position.set(0, 0.4, 0);
        plat.receiveShadow = true;
        plat.castShadow = true;
        stGroup.add(plat);

        // Gold Trim along Stage Edge
        const trimMat = new THREE.MeshStandardMaterial({ color: goldHex, metalness: 0.9, roughness: 0.2 });
        const trim = new THREE.Mesh(new THREE.BoxGeometry(el.w + 0.1, 0.1, el.h + 0.1), trimMat);
        trim.position.set(0, 0.78, 0);
        stGroup.add(trim);

        // Draped Backdrop
        const backMat = new THREE.MeshStandardMaterial({ color: 0xfaf5ef, roughness: 0.4 });
        const backdrop = new THREE.Mesh(new THREE.BoxGeometry(el.w * 0.95, 3.4, 0.2), backMat);
        backdrop.position.set(0, 2.4, -el.h / 2 + 0.2);
        stGroup.add(backdrop);

        // Stage Floral Arch
        const archMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.9 });
        const arch = new THREE.Mesh(new THREE.TorusGeometry(el.w * 0.35, 0.25, 8, 24), archMat);
        arch.position.set(0, 2.5, -el.h / 2 + 0.3);
        stGroup.add(arch);

        // Royal Wedding Sofa
        const sofaMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
        const sofa = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.9), sofaMat);
        sofa.position.set(0, 0.95, -el.h * 0.1);
        stGroup.add(sofa);

        // Stage Warm Spotlights
        const spot = new THREE.SpotLight(0xfff1d0, 2.0, 16, Math.PI / 4, 0.3);
        spot.position.set(0, 4.8, 2.5);
        spot.target = plat;
        stGroup.add(spot);

        stGroup.position.set(cx, 0, cz);
        scene.add(stGroup);
        break;
      }

      case "seating": {
        // Organized Rows of Banquet Chairs
        const seatGroup = new THREE.Group();
        const chairMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.4, metalness: 0.3 });
        const seatMat = new THREE.MeshStandardMaterial({ color: 0x9e1b2f, roughness: 0.6 });

        const rows = Math.min(8, Math.max(2, Math.floor(el.h / 1.5)));
        const cols = Math.min(12, Math.max(3, Math.floor(el.w / 1.4)));

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const chX = -el.w / 2 + 0.7 + (c * (el.w - 1.4)) / Math.max(1, cols - 1);
            const chZ = -el.h / 2 + 0.7 + (r * (el.h - 1.4)) / Math.max(1, rows - 1);

            // Chair Seat
            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), seatMat);
            seat.position.set(chX, 0.45, chZ);
            seat.castShadow = true;
            seatGroup.add(seat);

            // Chair Backrest
            const back = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.5, 0.06), chairMat);
            back.position.set(chX, 0.72, chZ + 0.22);
            seatGroup.add(back);
          }
        }

        seatGroup.position.set(cx, 0, cz);
        scene.add(seatGroup);
        break;
      }

      case "dining": {
        // Banquet Dining Tables with Linen Cloths & Centerpieces
        const dinGroup = new THREE.Group();
        const linenMat = new THREE.MeshStandardMaterial({ color: 0xfdfbf7, roughness: 0.4 });
        const runMat = new THREE.MeshStandardMaterial({ color: goldHex, roughness: 0.5 });
        const florMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.8 });

        const tRows = Math.min(5, Math.max(1, Math.floor(el.h / 2.6)));
        const tCols = Math.min(8, Math.max(1, Math.floor(el.w / 2.6)));

        for (let r = 0; r < tRows; r++) {
          for (let c = 0; c < tCols; c++) {
            const tx = -el.w / 2 + 1.2 + (c * (el.w - 2.4)) / Math.max(1, tCols - 1);
            const tz = -el.h / 2 + 1.2 + (r * (el.h - 2.4)) / Math.max(1, tRows - 1);

            // Table Linen
            const table = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.75, 16), linenMat);
            table.position.set(tx, 0.38, tz);
            table.castShadow = true;
            dinGroup.add(table);

            // Table Runner
            const runner = new THREE.Mesh(new THREE.CylinderGeometry(0.81, 0.81, 0.02, 16), runMat);
            runner.position.set(tx, 0.76, tz);
            dinGroup.add(runner);

            // Floral Centerpiece with Candle
            const center = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), florMat);
            center.position.set(tx, 0.85, tz);
            dinGroup.add(center);
          }
        }

        dinGroup.position.set(cx, 0, cz);
        scene.add(dinGroup);
        break;
      }

      case "buffet": {
        // Buffet Counters with Chafing Warmers
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

        // Chafing Dish Food Warmers
        const numDishes = Math.min(8, Math.max(2, Math.floor(el.w / 1.2)));
        for (let d = 0; d < numDishes; d++) {
          const dx = -el.w / 2 + 0.7 + (d * (el.w - 1.4)) / Math.max(1, numDishes - 1);
          const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 12), dishMat);
          dish.position.set(dx, 1.05, 0);
          bufGroup.add(dish);
        }

        bufGroup.position.set(cx, 0, cz);
        scene.add(bufGroup);
        break;
      }

      default: {
        // Generic styled block with bevels
        const genMat = new THREE.MeshStandardMaterial({ color: goldHex, roughness: 0.5, metalness: 0.2 });
        const box = new THREE.Mesh(new THREE.BoxGeometry(el.w, 1.0, el.h), genMat);
        box.position.set(cx, 0.5, cz);
        box.castShadow = true;
        scene.add(box);
        break;
      }
    }
  }

  /* Smooth Walkthrough Camera Route Interpolator */
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

  /* Render Frame */
  function frame() {
    if (!st) return;
    const scn = st.scenes[st.i];
    if (!scn) return;

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
      // Enhanced 2D/3D canvas fallback renderer
      drawCanvasFallback(st.canvas, st.plan, scn, st.t);
    }
  }

  /* Enhanced High-Detail 2D/3D Canvas Fallback */
  function drawCanvasFallback(cv, plan, sc, t) {
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const vis = plan.vision, v = vis.venue, L = vis.layout;
    const camData = getWalkthroughCamPos(sc, v, t);

    // Ceiling / Sky Gradient
    const sky = LIGHTING_PRESETS.golden.sky;
    const grad = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    grad.addColorStop(0, sky[0]);
    grad.addColorStop(1, sky[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H * 0.5);

    // Floor
    ctx.fillStyle = "#ddcca8";
    ctx.fillRect(0, H * 0.5, W, H * 0.5);

    // Red Carpet
    ctx.fillStyle = "#9e1b2f";
    ctx.beginPath();
    ctx.moveTo(W * 0.38, H * 0.5);
    ctx.lineTo(W * 0.62, H * 0.5);
    ctx.lineTo(W * 0.8, H);
    ctx.lineTo(W * 0.2, H);
    ctx.closePath();
    ctx.fill();

    // Decorated Stage Silhouette
    ctx.fillStyle = "#d4af37";
    ctx.fillRect(W * 0.28, H * 0.34, W * 0.44, H * 0.16);

    // Floral Arch
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.34, W * 0.18, Math.PI, 0, false);
    ctx.stroke();

    // Chandeliers
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.arc(W * 0.32, H * 0.2, 14, 0, Math.PI * 2);
    ctx.arc(W * 0.68, H * 0.2, 14, 0, Math.PI * 2);
    ctx.fill();

    // Caption
    ctx.fillStyle = "rgba(11,17,32,0.85)";
    ctx.fillRect(0, H - 44, W, 44);
    ctx.fillStyle = "#ffd700";
    ctx.font = "700 15px system-ui";
    ctx.fillText(sc.title, 16, H - 24);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px system-ui";
    ctx.fillText(`${sc.start}–${sc.end} · ~${sc.attendees} guests · ${sc.zone.label}`, 16, H - 8);
  }

  /* Video Recorder */
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

  return { mount, stop, setCameraPreset };
})();
