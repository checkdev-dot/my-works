// Font-engine spike: raster -> measure -> normalise -> distance.
// FROZEN 2026-10-31 before any test was run: equal feature weights, z clip +-3, jitter sigma 0.010 em,
// variant A = 200px/em + 0.37px offset. Changes after this date must be logged in the report.
const { createCanvas } = require('@napi-rs/canvas');

const CW = 700, CH = 800, OX = 150, BASE = 560; // canvas at S=400; scaled for other S

// ---------- rasterise ----------
// cmds: opentype-style commands in PIXEL coords (y-down)
function rasterise(cmds, S = 400, offx = 0, offy = 0) {
  const k = S / 400, w = Math.round(CW * k), h = Math.round(CH * k);
  const c = createCanvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.beginPath();
  for (const m of cmds) {
    const x = m.x + offx, y = m.y + offy;
    if (m.type === 'M') ctx.moveTo(x, y);
    else if (m.type === 'L') ctx.lineTo(x, y);
    else if (m.type === 'C') ctx.bezierCurveTo(m.x1 + offx, m.y1 + offy, m.x2 + offx, m.y2 + offy, x, y);
    else if (m.type === 'Q') ctx.quadraticCurveTo(m.x1 + offx, m.y1 + offy, x, y);
    else if (m.type === 'Z') ctx.closePath();
  }
  ctx.fill('nonzero');
  const d = ctx.getImageData(0, 0, w, h).data;
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bin[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  return { bin, w, h, S, baseY: BASE * k + offy, originX: OX * k + offx };
}

// em-space (y-up) commands -> pixel commands
function toPx(cmds, S = 400, ox = OX * S / 400, base = BASE * S / 400) {
  const X = v => ox + v * S, Y = v => base - v * S;
  return cmds.map(m => {
    const o = { type: m.type };
    if ('x' in m) { o.x = X(m.x); o.y = Y(m.y); }
    if ('x1' in m) { o.x1 = X(m.x1); o.y1 = Y(m.y1); }
    if ('x2' in m) { o.x2 = X(m.x2); o.y2 = Y(m.y2); }
    return o;
  });
}

// ---------- EDT (Felzenszwalb), squared distance to nearest "zero" pixel ----------
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) {
      const p = v[k];
      s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
      if (s <= z[k]) k--; else break;
      if (k < 0) { k = 0; break; }
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k]; d[q] = (q - p) * (q - p) + f[p];
  }
}
// input: mask where 1 = "feature" pixels whose distance we measure FROM. returns Float32 sq dist to nearest mask=1 pixel
function edt(mask, w, h) {
  const INF = 1e12, g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = mask[i] ? 0 : INF;
  const m = Math.max(w, h), f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; edt1d(f, h, d, v, z); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[y * w + x]; edt1d(f, w, d, v, z); for (let x = 0; x < w; x++) g[y * w + x] = d[x]; }
  return g;
}

function pct(arr, p) { if (!arr.length) return NaN; const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; }
function median(a) { return pct(a, 0.5); }

// ---------- measure one glyph bitmap ----------
// returns null if empty. All lengths returned in em units (divide by S).
function measure(R, opts = {}) {
  const { bin, w, h, S, baseY, originX } = R;
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bin[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const M = 3, cw = x1 - x0 + 1 + 2 * M, ch = y1 - y0 + 1 + 2 * M;
  const b = new Uint8Array(cw * ch);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) b[(y - y0 + M) * cw + (x - x0 + M)] = bin[y * w + x];
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1; // ink bbox px
  const top = M, bot = M + bh - 1, left = M, right = M + bw - 1;
  const baseC = baseY - y0 + M; // baseline row in crop coords
  let area = 0; for (let i = 0; i < b.length; i++) area += b[i];

  // run lengths -> stem / thin
  const hrun = new Int32Array(cw * ch), vrun = new Int32Array(cw * ch);
  for (let y = 0; y < ch; y++) { let x = 0; while (x < cw) { if (!b[y * cw + x]) { x++; continue; } let s = x; while (x < cw && b[y * cw + x]) x++; for (let i = s; i < x; i++) hrun[y * cw + i] = x - s; } }
  for (let x = 0; x < cw; x++) { let y = 0; while (y < ch) { if (!b[y * cw + x]) { y++; continue; } let s = y; while (y < ch && b[y * cw + x]) y++; for (let i = s; i < y; i++) vrun[i * cw + x] = y - s; } }
  const VW = [], HW = [];
  for (let i = 0; i < b.length; i++) if (b[i]) { if (hrun[i] <= vrun[i]) VW.push(hrun[i]); else HW.push(vrun[i]); }
  const stem = VW.length ? pct(VW, 0.4) : NaN;
  let thin = HW.length > 20 ? pct(HW, 0.4) : stem; // fall back to stem if no horizontal strokes
  const topAbove = (baseC - top) / S; // ink top above baseline (em)

  // holes (enclosed background) via flood fill from border (4-conn)
  const bg = new Uint8Array(cw * ch); const stack = [];
  for (let x = 0; x < cw; x++) { stack.push(x, (ch - 1) * cw + x); }
  for (let y = 0; y < ch; y++) { stack.push(y * cw, y * cw + cw - 1); }
  while (stack.length) { const p = stack.pop(); if (b[p] || bg[p]) continue; bg[p] = 1; const x = p % cw, y = (p / cw) | 0; if (x > 0) stack.push(p - 1); if (x < cw - 1) stack.push(p + 1); if (y > 0) stack.push(p - cw); if (y < ch - 1) stack.push(p + cw); }
  let holes = 0; for (let y = top; y <= bot; y++) for (let x = left; x <= right; x++) { const p = y * cw + x; if (!b[p] && !bg[p]) holes++; }

  // convex hull area from per-row extremes
  const pts = [];
  for (let y = 0; y < ch; y++) { let l = -1, r = -1; for (let x = 0; x < cw; x++) if (b[y * cw + x]) { if (l < 0) l = x; r = x; } if (l >= 0) { pts.push([l, y], [r + 1, y], [l, y + 1], [r + 1, y + 1]); } }
  pts.sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  const cross = (o, a, c) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
  const lo = []; for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  const up = []; for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const hull = lo.slice(0, -1).concat(up.slice(0, -1));
  let hullA = 0; for (let i = 0; i < hull.length; i++) { const a = hull[i], c = hull[(i + 1) % hull.length]; hullA += a[0] * c[1] - c[0] * a[1]; } hullA = Math.abs(hullA) / 2;
  const whiteInHull = Math.max(1, hullA - area);

  // corner sharpness: opening with disc radius r = 0.45*min(stem,thin)
  const r = Math.max(1.5, 0.45 * Math.min(stem, thin));
  const bgMask = new Uint8Array(cw * ch); for (let i = 0; i < b.length; i++) bgMask[i] = b[i] ? 0 : 1;
  const dIn = edt(bgMask, cw, ch); // dist of ink px to nearest bg
  const er = new Uint8Array(cw * ch); for (let i = 0; i < b.length; i++) er[i] = (b[i] && dIn[i] >= r * r) ? 1 : 0;
  const dEr = edt(er, cw, ch);
  let lost = 0; for (let i = 0; i < b.length; i++) if (b[i] && dEr[i] > r * r) lost++;
  const sharp = lost / (0.215 * r * r);

  // serif cues (rows measured from the ink bbox)
  const rowInk = y => { let c = 0; for (let x = 0; x < cw; x++) c += b[y * cw + x]; return c; };
  const rowLeft = y => { for (let x = 0; x < cw; x++) if (b[y * cw + x]) return x; return NaN; };
  const footY = Math.max(top, bot - Math.max(1, Math.round(0.04 * bh)));
  const midRows = []; for (let y = Math.round(bot - 0.35 * bh); y <= Math.round(bot - 0.15 * bh); y++) midRows.push(y);
  const midInk = median(midRows.map(rowInk)), midLeft = median(midRows.map(rowLeft));
  const footGain = rowInk(footY) / Math.max(1, midInk);
  const topY = Math.min(bot, top + Math.round(0.06 * bh));
  const topLeft = (midLeft - rowLeft(topY)) / S; // flag/serif overhang to the left at the top

  // slant: shear that makes columns sharpest
  let bestK = 0, bestS = -1; const yb = (top + bot) / 2;
  const ink = []; for (let y = top; y <= bot; y += 2) for (let x = left; x <= right; x++) if (b[y * cw + x]) ink.push(x, y);
  for (let k = -0.30; k <= 0.4501; k += 0.025) {
    const hist = new Int32Array(cw + 400); const off = 200;
    for (let i = 0; i < ink.length; i += 2) { const xs = Math.round(ink[i] - k * (yb - ink[i + 1])); hist[xs + off]++; }
    let s = 0; for (let i = 0; i < hist.length; i++) s += hist[i] * hist[i];
    if (s > bestS) { bestS = s; bestK = k; }
  }

  return {
    top: topAbove,                         // ink height above baseline (x-height for n,a,o,e,g)
    desc: (bot - baseC) / S,               // ink below baseline (descender, g)
    aspect: bw / bh,                       // width / ink height
    width: bw / S,
    stemRel: stem / (bh),                  // stem / ink height
    thinRel: thin / (bh),
    contrast: stem / thin,
    sharp,                                 // number of right-angle-corner equivalents
    footGain, topLeft,
    slant: bestK,
    openFrac: 1 - holes / whiteInHull,
    counter: holes / (bw * bh),
    solidity: area / hullA,
    density: area / (bw * bh),
    lsb: (x0 - originX) / S,               // left of ink vs glyph origin (needs a font origin)
    right: (x1 + 1 - originX) / S,
    _stemPx: stem, _thinPx: thin, _bh: bh
  };
}

// ---------- feature definitions ----------
const TF = { // transform to a roughly-linear scale
  top: v => v, desc: v => v, aspect: v => Math.log(v), stemRel: v => Math.log(v), thinRel: v => Math.log(v),
  contrast: v => Math.log(Math.max(0.3, Math.min(8, v))), sharp: v => Math.log1p(v), footGain: v => Math.log(Math.max(0.3, v)),
  topLeft: v => v, slant: v => v, openFrac: v => v, counter: v => v, solidity: v => v, density: v => v
};
const BASE_FEATS = ['top', 'aspect', 'stemRel', 'thinRel', 'contrast', 'sharp', 'slant', 'openFrac', 'counter', 'solidity', 'density'];
const FEATS = {
  n: [...BASE_FEATS, 'footGain', 'topLeft'], H: [...BASE_FEATS, 'footGain', 'topLeft'],
  o: BASE_FEATS, O: BASE_FEATS, a: BASE_FEATS, e: BASE_FEATS, g: [...BASE_FEATS, 'desc']
};
const WEIGHT_FEATS = ['stemRel', 'thinRel', 'density', 'solidity', 'counter', 'sharp']; // dropped for "ignore weight"
const GROUPS = { // for reporting which attribute differs
  top: 'x-height', aspect: 'width', stemRel: 'stem weight', thinRel: 'thin-stroke weight', contrast: 'contrast', sharp: 'corner sharpness',
  slant: 'slant', openFrac: 'aperture', counter: 'counter size', solidity: 'solidity', density: 'ink density', footGain: 'foot serif', topLeft: 'top serif/flag', desc: 'descender'
};

// ---------- normalisation + distance ----------
function buildStats(rawByLetter) { // rawByLetter[letter] = array of measure() objects (library)
  const stats = {};
  for (const L in FEATS) {
    stats[L] = {};
    for (const f of FEATS[L].concat(SP)) {
      const vals = rawByLetter[L].filter(m => m).map(m => TF[f](m[f])).filter(Number.isFinite);
      const mean = vals.reduce((a, c) => a + c, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((a, c) => a + (c - mean) ** 2, 0) / vals.length);
      stats[L][f] = { mean, sd: Math.max(sd, 1e-3) };
    }
  }
  return stats;
}
const SP = ["lsb", "rsb"]; TF.lsb = v => v; TF.rsb = v => v; // spacing features (fonts only)
const CLIP = 3;
function zvec(L, m, stats, skip = [], useSP = false) {
  if (!m) return null;
  const z = {}, clipped = [];
  for (const f of FEATS[L].concat(useSP ? SP : [])) {
    if (skip.includes(f)) continue;
    let v = (TF[f](m[f]) - stats[L][f].mean) / stats[L][f].sd;
    if (!Number.isFinite(v)) v = 0;
    if (Math.abs(v) > CLIP) { clipped.push(f); v = Math.sign(v) * CLIP; }
    z[f] = v;
  }
  z._clipped = clipped;
  return z;
}
function dist(za, zb) { // rms difference over shared features
  let s = 0, n = 0; for (const f in za) { if (f[0] === '_' || !(f in zb)) continue; s += (za[f] - zb[f]) ** 2; n++; }
  return Math.sqrt(s / n);
}

module.exports = { SP, rasterise, toPx, measure, FEATS, TF, GROUPS, WEIGHT_FEATS, buildStats, zvec, dist, CW, CH, OX, BASE };
