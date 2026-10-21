"use strict";
const TYPE_COLORS = { stage: "#8e44ad", mandap: "#c0392b", seating: "#2980b9", dining: "#27ae60", buffet: "#d35400", dance_floor: "#e84393", activity: "#16a085",
  reg_desk: "#7f8c8d", photo_booth: "#f39c12", first_aid: "#e74c3c", kitchen: "#95a5a6", backstage: "#34495e" };
const CAT_COLORS = ["#3a4db8", "#0f7b6c", "#f0a500", "#b3225e", "#6a4cff", "#16a085", "#d35400", "#7f8c8d", "#2980b9", "#8e44ad"];

function donut(rows, size = 200, centerTop = "", centerBot = "") {
  const total = rows.reduce((a, r) => a + r.value, 0) || 1, R = size / 2 - 8, r = R * .62, cx = size / 2;
  let a0 = -Math.PI / 2, s = `<svg viewBox="0 0 ${size} ${size}" width="${size}" role="img" aria-label="Budget split">`;
  rows.forEach((row, i) => {
    const a1 = a0 + (row.value / total) * Math.PI * 2, big = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a, rad) => [cx + Math.cos(a) * rad, cx + Math.sin(a) * rad];
    const [x0, y0] = p(a0, R), [x1, y1] = p(a1 - .0001, R), [x2, y2] = p(a1 - .0001, r), [x3, y3] = p(a0, r);
    s += `<path d="M${x0} ${y0} A${R} ${R} 0 ${big} 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 ${big} 0 ${x3} ${y3}Z" fill="${CAT_COLORS[i % 10]}"><title>${esc(row.label)}: ${short(row.value)}</title></path>`;
    a0 = a1;
  });
  return s + `<text x="${cx}" y="${cx - 2}" text-anchor="middle" font-size="19" font-weight="750" fill="#1b2238">${esc(centerTop)}</text><text x="${cx}" y="${cx + 15}" text-anchor="middle" font-size="11" fill="#7a849e">${esc(centerBot)}</text></svg>`;
}

function histogram(risk, budget, w = 560, h = 150) {
  const c = risk.histogram.counts, e = risk.histogram.edges, mx = Math.max(...c), n = c.length;
  const lo = e[0], hi = e[n], X = v => 30 + (v - lo) / (hi - lo) * (w - 40);
  let s = `<svg viewBox="0 0 ${w} ${h + 34}" width="100%" role="img" aria-label="Simulated total cost distribution">`;
  c.forEach((v, i) => {
    const x = X(e[i]), bw = X(e[i + 1]) - X(e[i]) - 1, bh = v / mx * h;
    s += `<rect x="${x}" y="${h - bh + 4}" width="${bw}" height="${bh}" rx="2" fill="${e[i + 1] > budget ? "#b3225e" : "#3a4db8"}" opacity=".85"/>`;
  });
  const mark = (v, label, col, dy = 0) => { if (v < lo || v > hi) return ""; const x = X(v); return `<line x1="${x}" y1="0" x2="${x}" y2="${h + 6}" stroke="${col}" stroke-width="2" stroke-dasharray="${label === "Budget" ? "0" : "4 3"}"/><text x="${x + 4}" y="${12 + dy}" font-size="11" font-weight="700" fill="${col}">${label}</text>`; };
  s += mark(budget, "Budget", "#1b2238") + mark(risk.percentiles[50], "P50", "#0f7b6c", 14) + mark(risk.percentiles[90], "P90", "#9a6a00", 28);
  s += `<text x="30" y="${h + 24}" font-size="11" fill="#7a849e">${short(lo)}</text><text x="${w - 12}" y="${h + 24}" text-anchor="end" font-size="11" fill="#7a849e">${short(hi)}</text>`;
  return s + "</svg>";
}

function barRow(label, val, max, col = "#3a4db8", right = "") {
  return `<div class="row" style="gap:8px;margin:3px 0"><div style="width:130px" class="small">${esc(label)}</div><div class="grow bar"><i style="width:${Math.min(100, val / (max || 1) * 100)}%;background:${col}"></i></div><div class="small nowrap" style="width:84px;text-align:right">${right}</div></div>`;
}
