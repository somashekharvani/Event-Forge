"use strict";
/* Pseudo-3D first-person walkthrough drawn on a canvas from the validated layout (no external libraries). */
const Walk = (() => {
  const HEIGHT = { stage: .9, mandap: 3, seating: .04, dining: .04, buffet: 1, dance_floor: .05, activity: .5, reg_desk: 1, photo_booth: 2.2, first_aid: 1.2, kitchen: 2.5, backstage: 2.5 };
  const SKY = { golden: ["#f6c58b", "#fbe8cf"], day: ["#bcd9f2", "#eef6fc"], evening: ["#f3a37a", "#f8d6b8"], night: ["#141b3a", "#2c3560"] };
  let st = null;
  const hex = (c, k) => { const n = parseInt(c.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255, f = x => Math.max(0, Math.min(255, Math.round(x * k))); return `rgb(${f(r)},${f(g)},${f(b)})`; };

  function mount(box, plan) {
    stop();
    const sc = plan.vision.scenes;
    if (!sc.length) { box.innerHTML = '<div class="empty">No programmes to walk through yet.</div>'; return; }
    box.innerHTML = `<canvas id="walk" width="880" height="400" style="width:100%;border-radius:10px;background:#222" aria-label="First-person walkthrough"></canvas>
      <div class="row mt"><button class="btn sm" id="w-play">Play</button><button class="btn ghost sm" id="w-prev">◀</button><button class="btn ghost sm" id="w-next">▶</button>
        <button class="btn ghost sm" id="w-voice">🔊 Narration: Off</button>
        <button class="btn ghost sm" id="w-rec">Record video (.webm)</button><a class="btn ghost sm" href="/api/projects/${S.pid}/export/gif">Download GIF</a><span class="small muted grow" id="w-cap"></span></div>
      <div class="row mt">${sc.map((s, i) => `<button class="scene-btn" data-sc="${i}">${esc(s.start)} ${esc(s.title.length > 22 ? s.title.slice(0, 21) + "…" : s.title)}</button>`).join("")}</div>
      <div class="row mt" style="gap:6px;align-items:center;flex-wrap:wrap">
        <span class="tiny bold muted">Tweak this scene:</span>
        <button class="btn ghost sm" data-tweak="move dining away from the entrance">Move dining away</button>
        <button class="btn ghost sm" data-tweak="widen the central aisle">Widen aisle</button>
        <button class="btn ghost sm" data-tweak="make the stage bigger">Enlarge stage</button>
      </div>
      <div class="tiny muted mt">Planning preview with narration. Furniture is represented as simplified blocks; lighting follows the program schedule.</div>`;
    st = { plan, scenes: sc, i: 0, t: 0, playing: false, voice: false, raf: 0, last: 0, cv: $("#walk", box), box };
    $("#w-play", box).onclick = () => st.playing ? pause() : play();
    $("#w-prev", box).onclick = () => jump(st.i - 1); $("#w-next", box).onclick = () => jump(st.i + 1);
    $$("[data-sc]", box).forEach(b => b.onclick = () => jump(+b.dataset.sc));
    $$("[data-tweak]", box).forEach(b => b.onclick = () => propose({ vision_command: b.dataset.tweak }));
    $("#w-voice", box).onclick = () => {
      st.voice = !st.voice;
      $("#w-voice", box).textContent = st.voice ? "🔊 Narration: ON" : "🔇 Narration: Off";
      if (st.voice) speak(`${st.scenes[st.i].start}: ${st.scenes[st.i].title}. ${st.scenes[st.i].caption}`);
      else if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
    $("#w-rec", box).onclick = record;
    frame(); caption();
  }
  function stop() { if (st) { cancelAnimationFrame(st.raf); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); st = null; } }
  function play() { st.playing = true; st.last = performance.now(); $("#w-play", st.box).textContent = "Pause"; st.raf = requestAnimationFrame(tick); if (st.voice) speak(`${st.scenes[st.i].start}: ${st.scenes[st.i].title}. ${st.scenes[st.i].caption}`); }
  function pause() { st.playing = false; cancelAnimationFrame(st.raf); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); const b = $("#w-play", st.box); if (b) b.textContent = "Play"; }
  function jump(i) { st.i = (i + st.scenes.length) % st.scenes.length; st.t = 0; caption(); frame(); }
  function caption() {
    const scn = st.scenes[st.i];
    $("#w-cap", st.box).textContent = scn.caption;
    $$("[data-sc]", st.box).forEach((b, k) => b.setAttribute("aria-current", k === st.i ? "true" : "false"));
    if (st.voice) speak(`${scn.start}: ${scn.title}. ${scn.caption}`);
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
  const DUR = 7;
  function tick(now) {
    if (!st || !st.playing) return;
    st.t += (now - st.last) / 1000; st.last = now;
    if (st.t > DUR) { st.i = (st.i + 1) % st.scenes.length; st.t = 0; caption(); }
    frame(); st.raf = requestAnimationFrame(tick);
  }
  function camera(sc, venue, t) {
    const r = sc.route.length > 1 ? sc.route : [[venue.width / 2, venue.depth - .8], [sc.zone.cx, sc.zone.cy]];
    const segs = []; let tot = 0;
    for (let k = 1; k < r.length; k++) { const l = Math.hypot(r[k][0] - r[k - 1][0], r[k][1] - r[k - 1][1]); segs.push(l); tot += l; }
    const walkT = Math.min(DUR * .6, Math.max(2, tot / 1.4)), u = Math.min(1, t / walkT);
    let d = u * tot, k = 0; while (k < segs.length - 1 && d > segs[k]) { d -= segs[k]; k++; }
    const a = r[k], b = r[k + 1], f = segs[k] ? Math.min(1, d / segs[k]) : 0;
    let x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
    const target = Math.atan2(sc.zone.cy - y, sc.zone.cx - x);
    let head = target; if (u < 1 && segs[k]) { const wa = Math.atan2(b[1] - a[1], b[0] - a[0]); const mix = Math.min(1, u * 2.5); head = wa + angDiff(target, wa) * mix; }
    head += Math.sin(t * .6) * .06 * (u >= 1 ? 1 : 0);
    return { x, y, head, bob: u < 1 ? Math.sin(t * 7) * .035 : 0 };
  }
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  function draw(cv, plan, sc, t) {
    const ctx = cv.getContext("2d"), W = cv.width, H = cv.height, vis = plan.vision, v = vis.venue, L = vis.layout;
    const cam = camera(sc, v, t), fx = Math.cos(cam.head), fy = Math.sin(cam.head), rx = -fy, ry = fx, F = W * .62, hz = H * .5, eye = 1.65 + cam.bob;
    const sky = SKY[sc.lighting] || SKY.day, dark = sc.lighting === "night" ? .55 : sc.lighting === "evening" ? .85 : 1;
    const g = ctx.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz);
    ctx.fillStyle = hex(v.indoor ? "#d9cdb4" : "#7a9a5a", dark); ctx.fillRect(0, hz, W, H - hz);
    const P = (x, y, z) => { const dx = x - cam.x, dy = y - cam.y; return { d: dx * fx + dy * fy, s: dx * rx + dy * ry, z }; };
    const proj = p => [W / 2 + F * p.s / p.d, hz - F * (p.z - eye) / p.d];
    const clip = pts => { const out = [], N = .25; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], ia = a.d >= N, ib = b.d >= N; if (ia) out.push(a); if (ia !== ib) { const k = (N - a.d) / (b.d - a.d); out.push({ d: N, s: a.s + (b.s - a.s) * k, z: a.z + (b.z - a.z) * k }); } } return out; };
    const faces = [];
    const quad = (pts, fill, stroke, shade = 1) => { const q = clip(pts.map(p => P(...p))); if (q.length < 3) return; faces.push({ q, fill: hex(fill, shade * dark), stroke, dist: q.reduce((a, p) => a + p.d, 0) / q.length }); };
    const box = (x, y, w, h, z, col, edge) => {
      quad([[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]], col, edge, 1.08);
      if (z > .06) {
        quad([[x, y, 0], [x + w, y, 0], [x + w, y, z], [x, y, z]], col, edge, .8); quad([[x, y + h, 0], [x + w, y + h, 0], [x + w, y + h, z], [x, y + h, z]], col, edge, .92);
        quad([[x, y, 0], [x, y + h, 0], [x, y + h, z], [x, y, z]], col, edge, .72); quad([[x + w, y, 0], [x + w, y + h, 0], [x + w, y + h, z], [x + w, y, z]], col, edge, .86);
      }
    };
    // floor carpet and walls
    quad([[0, 0, 0], [v.width, 0, 0], [v.width, v.depth, 0], [0, v.depth, 0]], v.indoor ? "#e4d8bf" : "#8fae6c", null, 1);
    if (v.indoor) { const wc = L.theme.palette[3] || "#f3efe4"; const wh = 3.8;
      quad([[0, 0, 0], [v.width, 0, 0], [v.width, 0, wh], [0, 0, wh]], wc, null, .95); quad([[0, v.depth, 0], [v.width, v.depth, 0], [v.width, v.depth, wh], [0, v.depth, wh]], wc, null, .85);
      quad([[0, 0, 0], [0, v.depth, 0], [0, v.depth, wh], [0, 0, wh]], wc, null, .8); quad([[v.width, 0, 0], [v.width, v.depth, 0], [v.width, v.depth, wh], [v.width, 0, wh]], wc, null, .88); }
    v.obstacles.forEach(o => box(o.x, o.y, o.w, o.h, o.type === "pillar" ? 3.6 : 1.2, "#b9b19c", "#8a826e"));
    L.elements.forEach(e => {
      if (L.params.shared && e.type === "seating") return;
      const base = TYPE_COLORS[e.type] || "#999", pal = L.theme.palette, col = e.type === "mandap" || e.type === "stage" ? pal[0] : e.type === "dining" || e.type === "seating" ? "#efe6d2" : base;
      const active = e.id === sc.zone.id; box(e.x, e.y, e.w, e.h, HEIGHT[e.type] ?? .5, active ? pal[1] || col : col, "rgba(0,0,0,.35)");
      if (e.type === "mandap") { [[e.x, e.y], [e.x + e.w - .3, e.y], [e.x, e.y + e.h - .3], [e.x + e.w - .3, e.y + e.h - .3]].forEach(([a, b]) => box(a, b, .3, .3, 3, pal[1] || "#d4a017", "rgba(0,0,0,.3)")); }
      if (e.type === "dining" || (e.type === "seating" && !L.params.shared)) { for (let i = 0; i < Math.min(18, Math.floor(e.w / 2.4)); i++) for (let j = 0; j < Math.min(6, Math.floor(e.h / 2.4)); j++) box(e.x + 1 + i * 2.4, e.y + 1 + j * 2.4, .9, .9, .78, "#ffffff", "rgba(0,0,0,.25)"); }
    });
    faces.sort((a, b) => b.dist - a.dist);
    faces.forEach(f => { ctx.beginPath(); f.q.forEach((p, i) => { const [x, y] = proj(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fillStyle = f.fill; ctx.fill(); if (f.stroke) { ctx.strokeStyle = f.stroke; ctx.lineWidth = 1; ctx.stroke(); } });
    if (sc.lighting === "night" || sc.lighting === "evening") { ctx.fillStyle = `rgba(255,214,120,${sc.lighting === "night" ? .10 : .06})`; ctx.fillRect(0, 0, W, H); }
    // caption bar
    ctx.fillStyle = "rgba(17,22,40,.72)"; ctx.fillRect(0, H - 44, W, 44); ctx.fillStyle = "#fff"; ctx.font = "600 15px system-ui, sans-serif"; ctx.fillText(sc.title, 14, H - 25);
    ctx.font = "12px system-ui, sans-serif"; ctx.fillStyle = "#d8def0"; ctx.fillText(`Day ${sc.day} · ${sc.start}–${sc.end} · ~${sc.attendees} guests · ${sc.zone.label}`, 14, H - 8);
    ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "right"; ctx.fillText("Planning preview", W - 10, 16); ctx.textAlign = "left";
  }
  function frame() { if (st) draw(st.cv, st.plan, st.scenes[st.i], st.t); }
  function record() {
    if (!st || !st.cv.captureStream || typeof MediaRecorder === "undefined") return toast("Recording isn't supported in this browser — use the GIF download", "bad");
    const chunks = [], rec = new MediaRecorder(st.cv.captureStream(30), { mimeType: MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "" });
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(chunks, { type: "video/webm" })); a.download = "eventforge-walkthrough.webm"; a.click(); pause(); toast("Video saved", "ok"); };
    st.i = 0; st.t = 0; caption(); play(); rec.start(); toast("Recording the full walkthrough…");
    const total = st.scenes.length * DUR * 1000; setTimeout(() => rec.state !== "inactive" && rec.stop(), total + 300);
  }
  return { mount, stop };
})();
