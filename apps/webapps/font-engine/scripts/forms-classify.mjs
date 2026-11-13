// Letter-form classifiers (pixel heuristics on 200 px rasters). Ported from the letter-forms survey; used by measure-forms.mjs and for the clay fonts.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');

const SZ = 200; // em -> px
const CW = 420, CH = 420, BASE = 300;
const canvas = createCanvas(CW, CH); const ctx = canvas.getContext('2d');

function raster(font, ch) {
  ctx.clearRect(0, 0, CW, CH); ctx.fillStyle = '#000';
  let S;
  if (font.__fontkit) { const run = font.layout(ch, ['liga', 'rvrn', 'locl']); const g = run.glyphs[0]; if (!g || g.id === 0) return null; S = SZ / font.unitsPerEm; ctx.beginPath(); for (const c of g.path.commands) { const a = c.args; if (c.command === 'moveTo') ctx.moveTo(60 + a[0] * S, BASE - a[1] * S); else if (c.command === 'lineTo') ctx.lineTo(60 + a[0] * S, BASE - a[1] * S); else if (c.command === 'quadraticCurveTo') ctx.quadraticCurveTo(60 + a[0] * S, BASE - a[1] * S, 60 + a[2] * S, BASE - a[3] * S); else if (c.command === 'bezierCurveTo') ctx.bezierCurveTo(60 + a[0] * S, BASE - a[1] * S, 60 + a[2] * S, BASE - a[3] * S, 60 + a[4] * S, BASE - a[5] * S); else if (c.command === 'closePath') ctx.closePath(); } ctx.fill('nonzero'); }
  else { const g = font.charToGlyph(ch); if (!g || g.index === 0) return null; S = SZ / font.unitsPerEm; const p = g.getPath(60, BASE, SZ); p.fill = '#000'; p.draw(ctx); }
  const d = ctx.getImageData(0, 0, CW, CH).data; const b = new Uint8Array(CW * CH); let n = 0;
  for (let i = 0; i < CW * CH; i++) if (d[i * 4 + 3] > 127) { b[i] = 1; n++; }
  if (n < 20) return null;
  let x0 = CW, x1 = -1, y0 = CH, y1 = -1;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (b[y * CW + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { b, x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const ink = (R, x, y) => x >= 0 && x < CW && y >= 0 && y < CH && R.b[y * CW + x] === 1;
const rowL = (R, y) => { for (let x = R.x0; x <= R.x1; x++) if (ink(R, x, y)) return x; return NaN; };
const rowR = (R, y) => { for (let x = R.x1; x >= R.x0; x--) if (ink(R, x, y)) return x; return NaN; };
const runs = (R, y) => { const out = []; let x = R.x0; while (x <= R.x1) { if (!ink(R, x, y)) { x++; continue; } const s = x; while (x <= R.x1 && ink(R, x, y)) x++; out.push([s, x - 1]); } return out; };
const colTop = (R, x) => { for (let y = R.y0; y <= R.y1; y++) if (ink(R, x, y)) return y; return NaN; };
const colBot = (R, x) => { for (let y = R.y1; y >= R.y0; y--) if (ink(R, x, y)) return y; return NaN; };
const colRun = (R, x) => { let best = 0, c = 0; for (let y = R.y0; y <= R.y1; y++) { if (ink(R, x, y)) { c++; if (c > best) best = c; } else c = 0; } return best; };
const med = a => { const s = a.filter(Number.isFinite).sort((p, q) => p - q); return s.length ? s[s.length >> 1] : NaN; };
// stem thickness: median horizontal run width over rows in the middle band, taking the thinnest run per row that is at least 2px
function stemW(R) { const v = []; for (let y = Math.round(R.y0 + 0.3 * R.h); y <= Math.round(R.y0 + 0.7 * R.h); y++) { const rs = runs(R, y); if (rs.length) v.push(Math.max(...rs.map(r => r[1] - r[0] + 1))); } return med(v); }
function outside(R) { const bg = new Uint8Array(CW * CH); const st = []; for (let x = 0; x < CW; x++) st.push(x, (CH - 1) * CW + x); for (let y = 0; y < CH; y++) st.push(y * CW, y * CW + CW - 1); while (st.length) { const p = st.pop(); if (R.b[p] || bg[p]) continue; bg[p] = 1; const x = p % CW, y = (p / CW) | 0; if (x > 0) st.push(p - 1); if (x < CW - 1) st.push(p + 1); if (y > 0) st.push(p - CW); if (y < CH - 1) st.push(p + CW); } return bg; }
function holes(R) { // enclosed white components (>= 8 px), with bbox
  const bg = new Uint8Array(CW * CH); const st = [];
  for (let x = 0; x < CW; x++) st.push(x, (CH - 1) * CW + x); for (let y = 0; y < CH; y++) st.push(y * CW, y * CW + CW - 1);
  while (st.length) { const p = st.pop(); if (R.b[p] || bg[p]) continue; bg[p] = 1; const x = p % CW, y = (p / CW) | 0; if (x > 0) st.push(p - 1); if (x < CW - 1) st.push(p + 1); if (y > 0) st.push(p - CW); if (y < CH - 1) st.push(p + CW); }
  const seen = new Uint8Array(CW * CH); const out = [];
  for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) { const p0 = y * CW + x; if (R.b[p0] || bg[p0] || seen[p0]) continue; let n = 0, hx0 = CW, hx1 = 0, hy0 = CH, hy1 = 0; const q = [p0]; seen[p0] = 1; while (q.length) { const p = q.pop(); n++; const px = p % CW, py = (p / CW) | 0; if (px < hx0) hx0 = px; if (px > hx1) hx1 = px; if (py < hy0) hy0 = py; if (py > hy1) hy1 = py; for (const r of [p - 1, p + 1, p - CW, p + CW]) if (r >= 0 && r < CW * CH && !R.b[r] && !bg[r] && !seen[r]) { seen[r] = 1; q.push(r); } } if (n >= 8) out.push({ n, x0: hx0, x1: hx1, y0: hy0, y1: hy1 }); }
  return out;
}
function components(R) { const seen = new Uint8Array(CW * CH); const out = []; for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) { const p0 = y * CW + x; if (!R.b[p0] || seen[p0]) continue; let n = 0, cx0 = CW, cx1 = 0, cy0 = CH, cy1 = 0; const q = [p0]; seen[p0] = 1; while (q.length) { const p = q.pop(); n++; const px = p % CW, py = (p / CW) | 0; if (px < cx0) cx0 = px; if (px > cx1) cx1 = px; if (py < cy0) cy0 = py; if (py > cy1) cy1 = py; for (const r of [p - 1, p + 1, p - CW, p + CW]) if (r >= 0 && r < CW * CH && R.b[r] && !seen[r]) { seen[r] = 1; q.push(r); } } out.push({ n, x0: cx0, x1: cx1, y0: cy0, y1: cy1 }); } return out; }

export function classify(font) {
  const f = {};
  const Rx = raster(font, 'x'), RH = raster(font, 'H'); if (!Rx || !RH) return null;
  const xh = BASE - Rx.y0, cap = BASE - RH.y0; if (xh < 20 || cap < 30) return null;
  f.xh = +(xh / SZ).toFixed(3); f.cap = +(cap / SZ).toFixed(3);
  // ---- a ----
  const Ra = raster(font, 'a'); if (Ra) { const H = holes(Ra); const sw = stemW(Ra); const big = H.slice().sort((p, q) => q.n - p.n)[0]; const span = big ? (big.y1 - big.y0 + 1) / Ra.h : 0;
    f.a_storey = !big ? 'open' : span > 0.62 ? 'single' : span < 0.5 ? 'double' : 'unsure';
    // tail: bottom rows reach right of the stem's right edge
    const stemR = med([...Array(9)].map((_, i) => rowR(Ra, Math.round(Ra.y0 + (0.35 + 0.03 * i) * Ra.h)))); const botR = Math.max(...[...Array(4)].map((_, i) => rowR(Ra, Ra.y1 - i)).filter(Number.isFinite)); const botL = Math.min(...[...Array(4)].map((_, i) => rowL(Ra, Ra.y1 - i)).filter(Number.isFinite));
    const stemL = med([...Array(9)].map((_, i) => { const rs = runs(Ra, Math.round(Ra.y0 + (0.35 + 0.03 * i) * Ra.h)); return rs.length ? rs[rs.length - 1][0] : NaN; }));
    f.a_tail = (botR - stemR) > 0.35 * sw ? 'tail' : 'none'; f.a_tail_px = +((botR - stemR) / sw).toFixed(2);
    // stem reaches the top of the letter? (double-storey: a vertical stem rising to the top right = 'stem-top'; otherwise the top is a hook only)
    f.a_topstem = f.a_storey === 'double' ? (colRun(Ra, Math.round(stemR - sw / 2)) / Ra.h > 0.92 ? 'full' : 'hooked') : '-'; }
  // ---- b spur ----
  const Rb = raster(font, 'b'); if (Rb) { const sw = stemW(Rb); let notch = 0; const base = BASE; const bg = outside(Rb); for (let y = Math.round(base - 0.3 * xh); y <= Math.min(Rb.y1, base + 2); y++) { const rs = runs(Rb, y); if (rs.length >= 2) { const gap = rs[1][0] - rs[0][1] - 1; if (gap > 0 && rs[0][1] - rs[0][0] + 1 < 1.6 * sw && bg[y * CW + rs[0][1] + 1]) { notch = notch ? Math.min(notch, y) : y; } } }
    // spur: a row within the bottom 12% of x-height where stem and bowl are separate runs
    const depth = notch ? (Rb.y1 - notch) / xh : 0; f.b_join = +depth.toFixed(3); f.b_spur = depth >= 0.12 ? 'high-join' : depth >= 0.04 ? 'notch' : 'smooth';
    const hs = holes(Rb); f.b_counter = hs.length; }
  // ---- t top ----
  const Rt = raster(font, 't'); if (Rt) { const sw = stemW(Rt); const Hs = holes(Rt); const rs = runs(Rt, Math.round(Rt.y0 + 0.5 * (BASE - Rt.y0)));
    // stem columns: the run containing the column with the longest vertical run
    let bx = Rt.x0, bl = 0; for (let x = Rt.x0; x <= Rt.x1; x++) { const r = colRun(Rt, x); if (r > bl) { bl = r; bx = x; } }
    const r0 = runs(Rt, Math.round(Rt.y0 + 0.3 * Rt.h)).find(r => bx >= r[0] - 1 && bx <= r[1] + 1); if (r0) { const tl = colTop(Rt, r0[0] + 1), tr = colTop(Rt, r0[1] - 1); const d = (tl - tr); f.t_top = Math.abs(d) > 0.3 * (r0[1] - r0[0] + 1) ? (d > 0 ? 'slanted' : 'slanted-rev') : 'flat'; f.t_top_dpx = d; }
    f.t_height = +((BASE - Rt.y0) / cap).toFixed(2); // 1 = ascender height, ~0.8 = short t
    // bottom: hook to the right (curved) or straight cut
    const botR = Math.max(...[0, 1, 2].map(i => rowR(Rt, Rt.y1 - i))); f.t_bottom = (botR - (r0 ? r0[1] : bx)) > 0.6 * sw ? 'hook' : 'straight'; }
  // ---- y tail ----
  const Ry = raster(font, 'y'); if (Ry && Ry.y1 > BASE + 0.1 * xh) { const sw = stemW(Ry); const d0 = BASE, d1 = Ry.y1; const bottomRows = []; for (let y = Math.round(d1 - 0.18 * (d1 - d0)); y <= d1; y++) bottomRows.push(y);
    const ext = Math.max(...bottomRows.map(y => { const rs = runs(Ry, y); return rs.length ? Math.max(...rs.map(r => r[1] - r[0] + 1)) : 0; }));
    // leftmost ink in the bottom band compared with leftmost ink in the band just above it: a hook turns left sharply
    const lBot = Math.min(...bottomRows.map(y => rowL(Ry, y)).filter(Number.isFinite)); const lMid = Math.min(...[...Array(5)].map((_, i) => rowL(Ry, Math.round(d0 + 0.5 * (d1 - d0)) + i)).filter(Number.isFinite));
    const D = d1 - d0; const slope = (a, b) => { const ys = [], xs = []; for (let y = Math.round(d0 + a * D); y <= Math.round(d0 + b * D); y++) { const l = rowL(Ry, y); if (Number.isFinite(l)) { ys.push(y); xs.push(l); } } if (ys.length < 3) return NaN; const n = ys.length, my = ys.reduce((p, q) => p + q) / n, mx = xs.reduce((p, q) => p + q) / n; let sxy = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (ys[i] - my) * (xs[i] - mx); syy += (ys[i] - my) ** 2; } return sxy / syy; };
    const su = slope(0.1, 0.45), sl = slope(0.55, 0.85); const bend = sl - su; f.y_bend = +bend.toFixed(2); f.y_tail = D < 0.25 * xh ? 'short' : bend < -0.45 ? 'curved' : 'straight'; f.y_tail_ext = +(ext / sw).toFixed(2); }
  // ---- e bar ----
  const Re = raster(font, 'e'); if (Re) { const Hs = holes(Re); const sw = stemW(Re); if (Hs.length) { const top = Hs.sort((p, q) => q.n - p.n)[0]; const by = top.y1 + 1; // first ink row under the counter = bar
      const left = Re.x0 + Math.round(0.25 * Re.w), right = Re.x0 + Math.round(0.75 * Re.w); let bl = NaN, br = NaN; for (let y = top.y0; y <= Re.y1; y++) if (ink(Re, left, y) && y > top.y0 + 2 && !ink(Re, left, y - 1)) { bl = y; break; } for (let y = top.y0; y <= Re.y1; y++) if (ink(Re, right, y) && y > top.y0 + 2 && !ink(Re, right, y - 1)) { br = y; break; }
      const dy = bl - br; f.e_bar = Number.isFinite(dy) ? (Math.abs(dy) > 0.07 * xh ? 'angled' : 'horizontal') : 'unsure'; f.e_bar_dy = +(dy / xh).toFixed(3); f.e_bar_y = +((BASE - by) / xh).toFixed(2); }
    // terminal cut on e: rightmost extent rows of the lower arm end
    }
  // ---- c terminal cut ----
  const Rc = raster(font, 'c'); if (Rc) { const sw = stemW(Rc); const top = []; for (let y = Rc.y0; y <= Rc.y0 + Math.round(0.35 * Rc.h); y++) top.push(rowR(Rc, y)); const mx = Math.max(...top.filter(Number.isFinite)); const cnt = top.filter(v => v >= mx - 0.12 * sw).length; f.c_cut_ratio = +(cnt / sw).toFixed(2); }
  // ---- g ----
  const Rg = raster(font, 'g'); if (Rg) { const Hs = holes(Rg); const below = Hs.filter(h => h.y0 > BASE); f.g_storey = Hs.length >= 2 ? 'double' : below.length ? 'double-open' : 'single'; const sw = stemW(Rg);
    if (f.g_storey === 'single') { // ear-less single g: tail form. Tail open hook vs closed? Count: if the lowest hole is below baseline it was 'double'. Tail ends: rightmost extent of below-baseline ink vs stem right
      const rows = []; for (let y = BASE + 2; y <= Rg.y1; y++) rows.push(y); const L = Math.min(...rows.map(y => rowL(Rg, y)).filter(Number.isFinite)); f.g_tail_reach = +((Rg.x0 + 0.5 * Rg.w - L) / Rg.w).toFixed(2); } }
  // ---- l ----
  const Rl = raster(font, 'l'); if (Rl) { const sw = stemW(Rl); const stemL = med([0.3, 0.4, 0.5, 0.6].map(k => rowL(Rl, Math.round(Rl.y0 + k * Rl.h)))), stemR = med([0.3, 0.4, 0.5, 0.6].map(k => rowR(Rl, Math.round(Rl.y0 + k * Rl.h)))); const bR = Math.max(...[0, 1, 2].map(i => rowR(Rl, Rl.y1 - i))), bL = Math.min(...[0, 1, 2].map(i => rowL(Rl, Rl.y1 - i)));
    const right = bR - stemR > 0.45 * sw, left = stemL - bL > 0.45 * sw; f.l_bottom = right && left ? 'serif' : right ? 'tail' : left ? 'left-foot' : 'plain'; const tL = rowL(Rl, Rl.y0 + 2); f.l_topflag = stemL - tL > 0.45 * sw ? 'flag' : 'none'; }
  // ---- i dot ----
  const Ri = raster(font, 'i'); if (Ri) { const cs = components(Ri).sort((p, q) => p.y0 - q.y0); if (cs.length >= 2) { const dot = cs[0]; const sol = dot.n / ((dot.x1 - dot.x0 + 1) * (dot.y1 - dot.y0 + 1)); f.i_dot = sol > 0.93 ? 'square' : sol > 0.68 ? 'round' : 'other'; f.i_dot_sol = +sol.toFixed(2); } else f.i_dot = 'joined'; }
  // ---- u stem ----
  const Ru = raster(font, 'u'); if (Ru) { const sw = stemW(Ru); let best = 0; for (let x = Math.round(Ru.x1 - 1.2 * sw); x <= Ru.x1; x++) best = Math.max(best, colRun(Ru, x)); f.u_stem = best / Ru.h > 0.9 ? 'stem' : 'symmetric'; }
  // ---- G jaw ----
  const RG = raster(font, 'G'); if (RG) { const sw = stemW(RG); let best = 0; for (let x = Math.round(RG.x1 - 1.3 * sw); x <= RG.x1; x++) best = Math.max(best, colRun(RG, x)); f.G_jaw = best / RG.h > 0.33 ? 'stem' : 'none'; f.G_jaw_h = +(best / RG.h).toFixed(2);
    // spur: ink at the bottom of the stem column below the baseline area? use: in the bottom 12% rows, rightmost ink equals stem column (stem reaches baseline) and bottom run narrow
    const rows = []; for (let y = Math.round(RG.y1 - 0.1 * RG.h); y <= RG.y1; y++) rows.push(y); const rr = Math.max(...rows.map(y => rowR(RG, y)).filter(Number.isFinite)); f.G_spur = f.G_jaw === 'stem' && rr >= RG.x1 - 0.3 * sw && colBot(RG, Math.round(RG.x1 - 0.5 * sw)) >= RG.y1 - 2 ? 'spur' : 'none'; }
  // ---- R leg ----
  const RR = raster(font, 'R'); if (RR) { const Hs = holes(RR); const sw = stemW(RR); if (Hs.length) { const bowl = Hs[0]; const ys = []; const xs = []; for (let y = bowl.y1 + Math.round(0.6 * sw); y <= RR.y1 - Math.round(0.4 * sw); y++) { const r = rowR(RR, y); if (Number.isFinite(r)) { ys.push(y); xs.push(r); } }
      if (ys.length > 6) { const n = ys.length, my = ys.reduce((a, b) => a + b) / n, mx = xs.reduce((a, b) => a + b) / n; let sxy = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (ys[i] - my) * (xs[i] - mx); syy += (ys[i] - my) ** 2; } const k = sxy / syy; let res = 0; for (let i = 0; i < n; i++) res += (xs[i] - (mx + k * (ys[i] - my))) ** 2; res = Math.sqrt(res / n) / sw; f.R_leg = res > 0.16 ? 'curved' : 'straight'; f.R_leg_res = +res.toFixed(2); f.R_leg_slope = +k.toFixed(2);
        const bR = Math.max(...[0, 1, 2].map(i => rowR(RR, RR.y1 - i))); f.R_foot = bR > RR.x1 - 0.3 * sw ? 'flat-out' : 'in'; } } }
  // ---- Q tail ----
  const RQ = raster(font, 'Q'), RO = raster(font, 'O'); if (RQ && RO) { const sw = stemW(RO); const desc = RQ.y1 - RO.y1; const below = []; for (let y = RO.y1 + 1; y <= RQ.y1; y++) { const l = rowL(RQ, y), r = rowR(RQ, y); if (Number.isFinite(l)) below.push([l, r]); }
    const span = below.length ? Math.max(...below.map(b => b[1])) - Math.min(...below.map(b => b[0])) : 0; const cx = below.length ? (Math.max(...below.map(b => b[1])) + Math.min(...below.map(b => b[0]))) / 2 : NaN;
    const inside = holes(RQ).length !== holes(RO).length || RQ.w > RO.w + 0.3 * sw;
    f.Q_tail = desc < 0.04 * cap ? (RQ.w > RO.w + 0.5 * sw ? 'right-side' : 'inside') : span > 0.55 * RQ.w ? 'swash' : (cx - RQ.x0) / RQ.w > 0.6 ? 'right-down' : 'centre-down'; f.Q_desc = +(desc / cap).toFixed(2); }
  // ---- M ----
  const RM = raster(font, 'M'); if (RM) { const sw = stemW(RM); const tL = rowL(RM, RM.y0 + Math.round(0.08 * RM.h)), bL = rowL(RM, RM.y1 - Math.round(0.08 * RM.h)); f.M_sides = (tL - bL) > 0.5 * sw ? 'splayed' : 'vertical'; const cx = Math.round((RM.x0 + RM.x1) / 2); const cb = colBot(RM, cx); f.M_vertex = (cb - RM.y0) / RM.h > 0.85 ? 'baseline' : 'high'; f.M_vertex_depth = +((cb - RM.y0) / RM.h).toFixed(2); }
  // ---- W ----
  const RW = raster(font, 'W'); if (RW) { const cx = Math.round((RW.x0 + RW.x1) / 2); const ct = colTop(RW, cx); f.W_apex = (ct - RW.y0) / RW.h < 0.12 ? 'full' : 'low'; f.W_apex_depth = +((ct - RW.y0) / RW.h).toFixed(2); }
  // ---- J ----
  const RJ = raster(font, 'J'); if (RJ) { const sw = stemW(RJ); f.J_desc = RJ.y1 > BASE + 0.05 * cap ? 'descends' : 'baseline'; const tL = rowL(RJ, RJ.y0 + 2); const stemL = med([0.3, 0.4, 0.5].map(k => rowL(RJ, Math.round(RJ.y0 + k * RJ.h)))); f.J_top = stemL - tL > 0.6 * sw ? 'bar' : 'none'; }
  // ---- K ---- (do the arms meet the stem at one point, or does the leg start from the arm?)
  const RK = raster(font, 'K'); if (RK) { const sw = stemW(RK); const stemR = med([0.1, 0.2, 0.8, 0.9].map(k => { const rs = runs(RK, Math.round(RK.y0 + k * RK.h)); return rs.length ? rs[0][1] : NaN; })); const x = Math.round(stemR + 0.4 * sw); let rr = 0; for (let y = RK.y0; y <= RK.y1; y++) if (ink(RK, x, y)) rr++; // ink rows just right of the stem
    const gapRows = []; for (let y = RK.y0; y <= RK.y1; y++) if (!ink(RK, x, y)) gapRows.push(y); // rows with no ink just right of stem = where arms do not touch
    // one junction: the ink rows just right of the stem form one contiguous band (plus edges); two junctions: two bands
    let bands = 0, prev = false; for (let y = RK.y0; y <= RK.y1; y++) { const v = ink(RK, x, y); if (v && !prev) bands++; prev = v; } f.K_join = bands <= 1 ? 'one-point' : 'split'; f.K_bands = bands; }
  // ---- 1 ----
  const R1 = raster(font, '1'); if (R1) { const sw = stemW(R1); const stemL = med([0.4, 0.5, 0.6].map(k => rowL(R1, Math.round(R1.y0 + k * R1.h)))); const flagL = Math.min(...[0.08, 0.14, 0.2, 0.26].map(k => rowL(R1, Math.round(R1.y0 + k * R1.h))).filter(Number.isFinite)); f.one_flag = stemL - flagL > 0.5 * sw ? 'flag' : 'none'; const bw = Math.max(...[0, 1, 2].map(i => { const rs = runs(R1, R1.y1 - i); return rs.length ? Math.max(...rs.map(r => r[1] - r[0] + 1)) : 0; })); f.one_base = bw > 1.7 * sw ? 'base' : 'none'; }
  // ---- 4 ----
  const R4 = raster(font, '4'); if (R4) f.four_top = holes(R4).length ? 'closed' : 'open';
  // ---- 7 ---- crossbar in the middle?
  const R7 = raster(font, '7'); if (R7) { const sw = stemW(R7); const mid = Math.round(R7.y0 + 0.55 * R7.h); const rs = runs(R7, mid); const wmid = rs.length ? Math.max(...rs.map(r => r[1] - r[0] + 1)) : 0; f.seven_bar = wmid > 2.2 * sw ? 'crossed' : 'plain'; }
  // ---- 2 ---- (flat base vs curl) skip. ---- j ----
  const Rj = raster(font, 'j'); if (Rj) { const sw = stemW(Rj); const bl = Math.min(...[0, 1, 2].map(i => rowL(Rj, Rj.y1 - i))); const stemL = med([0.45, 0.55].map(k => rowL(Rj, Math.round(Rj.y0 + k * Rj.h)))); f.j_tail = stemL - bl > 0.6 * sw ? 'hook' : 'straight'; }
  // ---- f ---- top reach: crossbar width symmetry; terminal hook
  const Rf = raster(font, 'f'); if (Rf) { const sw = stemW(Rf); const tR = Math.max(...[0, 1, 2, 3].map(i => rowR(Rf, Rf.y0 + i)).filter(Number.isFinite)); let bx = Rf.x0, bl = 0; for (let x = Rf.x0; x <= Rf.x1; x++) { const r = colRun(Rf, x); if (r > bl) { bl = r; bx = x; } } f.f_hook = tR - bx > 1.2 * sw ? 'wide-hook' : 'narrow'; }
  // ---- r ---- arm end: ball vs flat (thickness of arm end vs arm)
  const Rr = raster(font, 'r'); if (Rr) { const sw = stemW(Rr); const rx = Rr.x1 - Math.round(0.25 * sw); const endH = colRun(Rr, rx); const armH = colRun(Rr, Rr.x1 - Math.round(1.2 * sw)); f.r_end = endH > 1.35 * armH && endH > 1.1 * sw ? 'ball' : 'plain'; f.r_end_ratio = +(endH / Math.max(1, armH)).toFixed(2); }
  // ---- k ---- arms meet at the stem? same test as K
  const Rk = raster(font, 'k'); if (Rk) { const sw = stemW(Rk); const stemR = med([0.1, 0.9].map(k => { const rs = runs(Rk, Math.round(Rk.y0 + k * Rk.h)); return rs.length ? rs[0][1] : NaN; })); const x = Math.round(stemR + 0.4 * sw); let bands = 0, prev = false; for (let y = Rk.y0; y <= Rk.y1; y++) { const v = ink(Rk, x, y); if (v && !prev) bands++; prev = v; } f.k_join = bands <= 1 ? 'one-point' : 'split'; }
  // ---- serifs / monospace flags from index are elsewhere ----
  return f;
}
