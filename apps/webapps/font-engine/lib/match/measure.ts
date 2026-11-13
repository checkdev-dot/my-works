// Glyph measurement. Port of spike/engine.js with the weak spots addressed (see FEATURES in features.ts).
// Input: outline commands in EM units, y-up. Output: raw measures, all lengths in em.
// The only environment-specific step is the injected canvas; everything after the bitmap is plain typed-array maths,
// so Node (@napi-rs/canvas) and the browser (OffscreenCanvas / HTMLCanvas) run the same numerics on the same bitmap.
import type { CanvasFactory, CanvasLike, PathCmd } from './types';

// ONE canonical frame for every letter, from a font or from the generator: the ink above the baseline is scaled to TOP px,
// the baseline sits on row BASE, and the left ink edge on column LEFT. Shape comparison is then alignment-free.
export const RENDER = { TOP: 300, CW: 800, CH: 560, LEFT: 60, BASE: 340 } as const;

export type Raster = { bin: Uint8Array; w: number; h: number; S: number; baseY: number; originX: number };

/** Outline bounds in em, sampling curves. */
export function bounds(cmds: PathCmd[]) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, px = 0, py = 0;
  const add = (x: number, y: number) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const m of cmds) {
    if (m.type === 'Z') continue;
    const x = m.x as number, y = m.y as number;
    if (m.type === 'C') for (let t = 1; t <= 12; t++) { const u = t / 12, v = 1 - u; add(v*v*v*px + 3*v*v*u*(m.x1 as number) + 3*v*u*u*(m.x2 as number) + u*u*u*x, v*v*v*py + 3*v*v*u*(m.y1 as number) + 3*v*u*u*(m.y2 as number) + u*u*u*y); }
    else if (m.type === 'Q') for (let t = 1; t <= 12; t++) { const u = t / 12, v = 1 - u; add(v*v*px + 2*v*u*(m.x1 as number) + u*u*x, v*v*py + 2*v*u*(m.y1 as number) + u*u*y); }
    else add(x, y);
    px = x; py = y;
  }
  return { x0, x1, y0, y1 };
}

let defaultFactory: CanvasFactory | null = null;
export function setCanvasFactory(f: CanvasFactory | null) { defaultFactory = f; }
export function resolveCanvasFactory(f?: CanvasFactory): CanvasFactory {
  if (f) return f;
  if (defaultFactory) return defaultFactory;
  const g = globalThis as any;
  if (typeof g.OffscreenCanvas === 'function') return (w, h) => new g.OffscreenCanvas(w, h) as CanvasLike;
  if (typeof g.document !== 'undefined') return (w, h) => { const c = g.document.createElement('canvas'); c.width = w; c.height = h; return c as CanvasLike; };
  throw new Error('No canvas available: pass opts.canvas or call setCanvasFactory() (Node: @napi-rs/canvas createCanvas).');
}

/** Rasterise em-space (y-up) commands to a 1-bit bitmap. Alpha above 127 counts as ink. */
export function rasterise(cmds: PathCmd[], factory?: CanvasFactory): Raster {
  const { TOP, CW: w, CH: h, LEFT, BASE } = RENDER;
  const bb = bounds(cmds);
  if (!(bb.y1 > 0.02) || !isFinite(bb.x0)) return { bin: new Uint8Array(w * h), w, h, S: 1, baseY: BASE, originX: LEFT };
  const S = TOP / bb.y1, OX = LEFT - bb.x0 * S;
  const c = resolveCanvasFactory(factory)(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d context unavailable');
  const X = (v: number) => OX + v * S, Y = (v: number) => BASE - v * S;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  for (const m of cmds) {
    if (m.type === 'Z') { ctx.closePath(); continue; }
    const x = X(m.x as number), y = Y(m.y as number);
    if (m.type === 'M') ctx.moveTo(x, y);
    else if (m.type === 'L') ctx.lineTo(x, y);
    else if (m.type === 'C') ctx.bezierCurveTo(X(m.x1 as number), Y(m.y1 as number), X(m.x2 as number), Y(m.y2 as number), x, y);
    else if (m.type === 'Q') ctx.quadraticCurveTo(X(m.x1 as number), Y(m.y1 as number), x, y);
  }
  ctx.fill('nonzero');
  const d = ctx.getImageData(0, 0, w, h).data;
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bin[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  return { bin, w, h, S, baseY: BASE, originX: OX };
}

// ---------- Euclidean distance transform (Felzenszwalb) ----------
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s: number;
    for (;;) {
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
/** Squared distance from every pixel to the nearest mask=1 pixel. */
function edt(mask: Uint8Array, w: number, h: number): Float64Array {
  const INF = 1e12, g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = mask[i] ? 0 : INF;
  const m = Math.max(w, h), f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; edt1d(f, h, d, v, z); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[y * w + x]; edt1d(f, w, d, v, z); for (let x = 0; x < w; x++) g[y * w + x] = d[x]; }
  return g;
}

function pct(arr: ArrayLike<number>, p: number): number {
  if (!arr.length) return NaN;
  const a = Float64Array.from(arr as ArrayLike<number>).sort();
  return a[Math.min(a.length - 1, Math.floor(p * a.length))];
}
const median = (a: number[]) => pct(a, 0.5);

/** Fit the end profile (width at k/8 stem widths from the very end, relative to the stem) to flat, round and wedge models. cls NaN when serifed or ambiguous. */
function fitEnd(P: number[]): { end: number; cls: number } {
  const xs = P.map((_, i) => (i + 1) / 8);
  if (P[0] > 1.7 || P.some(v => !Number.isFinite(v))) return { end: NaN, cls: NaN };
  const res = (m: (x: number) => number) => Math.sqrt(P.reduce((s, v, i) => s + (v - m(xs[i])) ** 2, 0) / P.length);
  const rFlat = res(() => 1), rRound = res(x => (x < 0.5 ? 2 * Math.sqrt(x * (1 - x)) : 1));
  let num = 0, den = 0; P.forEach((v, i) => { const t = 1 - xs[i] / 0.75; if (t > 0) { num += (v - 1) * t; den += t * t; } });
  const c = Math.max(0.12, Math.min(1, den ? num / den : 0.12)), rWedge = res(x => 1 + c * Math.max(0, 1 - x / 0.75));
  const arr = [rFlat, rRound, rWedge], best = arr.indexOf(Math.min(...arr)), second = arr.filter((_, i) => i !== best).reduce((a, b) => Math.min(a, b), 9);
  const end = Math.max(-0.8, Math.min(0.8, 1 - (P[0] + P[1] + P[2]) / 3));
  return { end, cls: second - arr[best] >= 0.02 ? best : NaN };
}

/** n height over H height from the two outlines (em, y-up). NaN when either is missing. */
export function xHeightRatio(nCmds: PathCmd[] | undefined, hCmds: PathCmd[] | undefined): number {
  if (!nCmds || !hCmds || !nCmds.length || !hCmds.length) return NaN;
  const a = bounds(nCmds).y1, b = bounds(hCmds).y1;
  return a > 0.02 && b > 0.02 ? a / b : NaN;
}

export type Measures = {
  desc: number; aspect: number; width: number;
  stemRel: number; thinRel: number; contrast: number;
  sharpA: number; sharpB: number; cornerRatio: number;
  slant: number; openFrac: number; counter: number; solidity: number; density: number;
  holes: number; holeSpan: number; stress: number;
  serifLen: number; serifThick: number; topLeft: number; exitTail: number;
  /** n height over H height (em); filled in by the caller that has both outlines, NaN otherwise. */
  xRatio: number;
  /** Outer silhouette area over its bounding box (circle 0.785, square 1) and the length share of its outline that is nearly straight. */
  bowlFill: number; flatShare: number;
  /** End of the left stem (n, H): taper (0 flat, positive round, negative flared), class (0 flat, 1 round, 2 wedge, NaN unknown or serifed). */
  termEnd: number; termCls: number;
  /** Same for the tail end of a one-storey g (NaN when there is no tail). */
  tailEnd: number; tailCls: number;
  /** Three independent storey votes for a (sa*) and g (sg*): 1 one-storey, 2 two-storey, 0 abstain. */
  sa1: number; sa2: number; sa3: number; sg1: number; sg2: number; sg3: number;
};

/** Measure one em-space glyph. Returns null for an empty glyph. */
export function measureGlyph(cmds: PathCmd[], factory?: CanvasFactory): Measures | null {
  return measureRaster(rasterise(cmds, factory));
}

export function measureRaster(R: Raster): Measures | null {
  const { bin, w, h, S, baseY, originX } = R;
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bin[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const M = 3, cw = x1 - x0 + 1 + 2 * M, ch = y1 - y0 + 1 + 2 * M;
  const b = new Uint8Array(cw * ch);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) b[(y - y0 + M) * cw + (x - x0 + M)] = bin[y * w + x];
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const top = M, bot = M + bh - 1, left = M, right = M + bw - 1;
  const baseC = baseY - y0 + M;
  let area = 0; for (let i = 0; i < b.length; i++) area += b[i];

  // ---- stroke widths from run lengths ----
  const hrun = new Int32Array(cw * ch), vrun = new Int32Array(cw * ch);
  for (let y = 0; y < ch; y++) { let x = 0; while (x < cw) { if (!b[y * cw + x]) { x++; continue; } const s = x; while (x < cw && b[y * cw + x]) x++; for (let i = s; i < x; i++) hrun[y * cw + i] = x - s; } }
  for (let x = 0; x < cw; x++) { let y = 0; while (y < ch) { if (!b[y * cw + x]) { y++; continue; } const s = y; while (y < ch && b[y * cw + x]) y++; for (let i = s; i < y; i++) vrun[i * cw + x] = y - s; } }
  const VW: number[] = [], HW: number[] = [];
  for (let i = 0; i < b.length; i++) if (b[i]) { if (hrun[i] <= vrun[i]) VW.push(hrun[i]); else HW.push(vrun[i]); }
  const stem = VW.length ? pct(VW, 0.4) : NaN;
  const thin = HW.length > 20 ? pct(HW, 0.4) : stem;
  

  // ---- enclosed counters (holes): area and how many separate ones ----
  const bg = new Uint8Array(cw * ch); const stack: number[] = [];
  for (let x = 0; x < cw; x++) stack.push(x, (ch - 1) * cw + x);
  for (let y = 0; y < ch; y++) stack.push(y * cw, y * cw + cw - 1);
  while (stack.length) { const p = stack.pop() as number; if (b[p] || bg[p]) continue; bg[p] = 1; const x = p % cw, y = (p / cw) | 0; if (x > 0) stack.push(p - 1); if (x < cw - 1) stack.push(p + 1); if (y > 0) stack.push(p - cw); if (y < ch - 1) stack.push(p + cw); }
  let holesArea = 0;
  for (let y = top; y <= bot; y++) for (let x = left; x <= right; x++) { const p = y * cw + x; if (!b[p] && !bg[p]) holesArea++; }
  // count separate enclosed counters (ignore specks under 10 px)
  let holes = 0, holeSpan = 0;
  const holeList: { n: number; cy: number; y0: number; y1: number }[] = [];
  { const seen = new Uint8Array(cw * ch);
    for (let p0 = 0; p0 < b.length; p0++) {
      if (b[p0] || bg[p0] || seen[p0]) continue;
      let n = 0, ry0 = ch, ry1 = 0, sy = 0; const st = [p0]; seen[p0] = 1;
      while (st.length) { const p = st.pop() as number; n++; const x = p % cw, y = (p / cw) | 0; sy += y; if (y < ry0) ry0 = y; if (y > ry1) ry1 = y; for (const q of [x > 0 ? p - 1 : -1, x < cw - 1 ? p + 1 : -1, y > 0 ? p - cw : -1, y < ch - 1 ? p + cw : -1]) if (q >= 0 && !b[q] && !bg[q] && !seen[q]) { seen[q] = 1; st.push(q); } }
      if (n >= 10) { holes++; holeSpan = Math.max(holeSpan, (ry1 - ry0 + 1) / bh); holeList.push({ n, cy: sy / n, y0: ry0, y1: ry1 }); }
    } }

  // ---- convex hull area (per-row extremes) ----
  const pts: number[][] = [];
  for (let y = 0; y < ch; y++) { let l = -1, r = -1; for (let x = 0; x < cw; x++) if (b[y * cw + x]) { if (l < 0) l = x; r = x; } if (l >= 0) pts.push([l, y], [r + 1, y], [l, y + 1], [r + 1, y + 1]); }
  pts.sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  const cross = (o: number[], a: number[], c: number[]) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
  const lo: number[][] = []; for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  const up: number[][] = []; for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const hull = lo.slice(0, -1).concat(up.slice(0, -1));
  let hullA = 0; for (let i = 0; i < hull.length; i++) { const a = hull[i], c = hull[(i + 1) % hull.length]; hullA += a[0] * c[1] - c[0] * a[1]; } hullA = Math.abs(hullA) / 2;
  const whiteInHull = Math.max(1, hullA - area);

  // ---- corner / terminal softness: opening with two disc radii ----
  // A hard right-angle corner loses 0.215 r^2 of ink to the opening; a corner already rounded beyond r loses nothing.
  // Small disc (A) tells razor-sharp from slightly eased; large disc (B) tells eased from properly round.
  const m = Math.min(stem, thin);
  const rA = Math.max(4, 0.2 * m), rB = Math.max(rA + 2, 0.38 * m); // discs stay inside the strokes: they remove corners, not thin strokes
  const bgMask = new Uint8Array(cw * ch); for (let i = 0; i < b.length; i++) bgMask[i] = b[i] ? 0 : 1;
  const dIn = edt(bgMask, cw, ch); // squared distance of ink pixels to nearest background
  const opened = (r: number) => {
    const er = new Uint8Array(cw * ch); for (let i = 0; i < b.length; i++) er[i] = (b[i] && dIn[i] >= r * r) ? 1 : 0;
    const dEr = edt(er, cw, ch); let lost = 0; for (let i = 0; i < b.length; i++) if (b[i] && dEr[i] > r * r) lost++;
    return lost / (0.215 * r * r);
  };
  const sharpA = opened(rA), sharpB = opened(rB);

  // ---- stem-based serif / flag / tail probes (meaningful on n, H) ----
  const rowInk = (y: number) => { let c = 0; for (let x = 0; x < cw; x++) c += b[y * cw + x]; return c; };
  const rowLeft = (y: number) => { for (let x = 0; x < cw; x++) if (b[y * cw + x]) return x; return NaN; };
  const rowRightF = (y: number) => { for (let x = cw - 1; x >= 0; x--) if (b[y * cw + x]) return x; return NaN; };
  const longestRun = (y: number) => { let best = 0, c = 0; for (let x = 0; x < cw; x++) { if (b[y * cw + x]) { c++; if (c > best) best = c; } else c = 0; } return best; };
  const midRows: number[] = []; for (let y = Math.round(bot - 0.35 * bh); y <= Math.round(bot - 0.15 * bh); y++) midRows.push(y);
  const midLeft = median(midRows.map(rowLeft)), midRight = median(midRows.map(rowRightF));
  const bandRows: number[] = []; for (let y = Math.max(top, bot - Math.max(1, Math.round(0.05 * bh))); y <= bot; y++) bandRows.push(y);
  const footRun = median(bandRows.map(longestRun));
  const serifLen = Math.log(Math.max(0.7, footRun / Math.max(1, stem)));
  // thickness of the foot at its outer-left edge: sans stems run the whole height (capped), serifs are thin
  let serifThick = 0.25;
  if (serifLen > 0.22) {
    let bestRow = bot, bestL = 1e9; for (const y of bandRows) { const l = rowLeft(y); if (l < bestL) { bestL = l; bestRow = y; } }
    const col = Math.min(cw - 1, Math.round(bestL) + Math.max(1, Math.round(0.1 * footRun)));
    let up2 = bestRow; while (up2 > top && b[(up2 - 1) * cw + col]) up2--;
    serifThick = Math.min(0.25, (bestRow - up2 + 1) / bh);
  }
  const topY = Math.min(bot, top + Math.round(0.06 * bh));
  const topLeft = (midLeft - rowLeft(topY)) / Math.max(1, stem);
  const footL = Math.min(...bandRows.map(rowLeft).filter(Number.isFinite)), footR = Math.max(...bandRows.map(rowRightF).filter(Number.isFinite));
  const exitTail = ((footR - midRight) - (midLeft - footL)) / Math.max(1, stem); // exit stroke longer than entry: pen-written

  // ---- slant: shear that makes columns sharpest ----
  let bestK = 0, bestS = -1; const yb = (top + bot) / 2;
  const ink: number[] = []; for (let y = top; y <= bot; y += 2) for (let x = left; x <= right; x++) if (b[y * cw + x]) ink.push(x, y);
  for (let k = -0.30; k <= 0.4501; k += 0.025) {
    const hist = new Int32Array(cw + 400); const off = 200;
    for (let i = 0; i < ink.length; i += 2) hist[Math.round(ink[i] - k * (yb - ink[i + 1])) + off]++;
    let s = 0; for (let i = 0; i < hist.length; i++) s += hist[i] * hist[i];
    if (s > bestS) { bestS = s; bestK = k; }
  }

  // ---- stress tilt: where the thickest parts sit left vs right of centre (after removing slant) ----
  // Upright design: thick parts level with each other (0 deg). Pen-written / calligraphic: one side higher.
  let maxD = 0; for (let i = 0; i < b.length; i++) if (b[i] && dIn[i] > maxD) maxD = dIn[i];
  let sx = 0, n0 = 0; for (let i = 0; i < ink.length; i += 2) { sx += ink[i] - bestK * (yb - ink[i + 1]); n0++; }
  const cx = n0 ? sx / n0 : 0;
  let lx = 0, ly = 0, ln = 0, rx = 0, ry = 0, rn = 0;
  for (let y = top; y <= bot; y++) for (let x = left; x <= right; x++) {
    const p = y * cw + x; if (!b[p] || dIn[p] < 0.81 * maxD) continue;
    const xs = x - bestK * (yb - y);
    if (xs < cx) { lx += xs; ly += y; ln++; } else { rx += xs; ry += y; rn++; }
  }
  let tilt = 0;
  if (ln > 3 && rn > 3 && rx / rn - lx / ln > 1) tilt = Math.min(45, Math.abs(Math.atan2(ry / rn - ly / ln, rx / rn - lx / ln)) * 180 / Math.PI);
  // ---- terminal shape: how the left stem ends at the bottom (n, H) and how a one-storey g tail ends ----
  const inkAt = (x: number, y: number) => x >= 0 && x < cw && y >= 0 && y < ch && b[y * cw + x] === 1;
  const runAt = (y: number, x: number) => { let l = x, r = x; while (inkAt(l - 1, y)) l--; while (inkAt(r + 1, y)) r++; return [l, r]; };
  let termEnd = NaN, termCls = NaN, tailEnd = NaN, tailCls = NaN;
  {
    const y0 = Math.round(bot - 0.45 * bh);
    const ls: number[] = [], rs: number[] = [];
    for (let y = y0; y <= y0 + Math.round(0.1 * bh); y++) { const l = rowLeft(y); if (Number.isFinite(l)) { ls.push(l); rs.push(runAt(y, l)[1]); } }
    if (ls.length) {
      let cl = median(ls), cr = median(rs); const ref = cr - cl + 1;
      const wAt = new Map<number, number>(); let yEnd = y0;
      for (let y = y0; y <= bot; y++) {
        let hit = -1; for (let x = Math.round(cl); x <= Math.round(cr); x++) if (inkAt(x, y)) { hit = x; break; }
        if (hit < 0) break;
        const [l, r] = runAt(y, hit); wAt.set(y, r - l + 1); cl = l; cr = r; yEnd = y;
      }
      if (ref >= 4 && ref < 2.4 * stem && yEnd - y0 > 1.2 * ref) {
        const P: number[] = [];
        for (let k = 1; k <= 6; k++) { const yy = yEnd - Math.round(k * ref / 8); P.push((wAt.get(yy) ?? ref) / ref); }
        const f = fitEnd(P); termEnd = f.end; termCls = f.cls;
      }
    }
  }
  if (holes <= 1 && baseC < bot - 0.12 * bh) {
    // one-storey g: the tail tip is the leftmost ink below the baseline; thickness is read column by column inward from the tip
    let xl = cw; for (let y = baseC + 2; y <= bot; y++) { const l = rowLeft(y); if (Number.isFinite(l) && l < xl) xl = l; }
    const ys: number[] = []; for (let y = baseC + 2; y <= bot; y++) for (let x = xl; x <= xl + 1; x++) if (inkAt(x, y)) ys.push(y);
    if (ys.length && thin >= 3) {
      const ty = median(ys), thick = (x: number) => {
        let best = -1, bd = 1e9; for (let y = Math.max(baseC + 2, Math.round(ty - 2 * thin)); y <= Math.min(bot, Math.round(ty + 2 * thin)); y++) if (inkAt(x, y) && Math.abs(y - ty) < bd) { bd = Math.abs(y - ty); best = y; }
        if (best < 0) return NaN; let u = best, d = best; while (inkAt(x, u - 1)) u--; while (inkAt(x, d + 1)) d++; return d - u + 1;
      };
      const refs: number[] = []; for (let t = Math.round(0.9 * thin); t <= Math.round(1.4 * thin); t++) { const v = thick(xl + t); if (Number.isFinite(v)) refs.push(v); }
      if (refs.length >= 3) {
        const ref = median(refs), P: number[] = [];
        for (let k = 1; k <= 6; k++) { const v = thick(xl + Math.round(k * thin / 8)); P.push(Number.isFinite(v) ? v / ref : 0); }
        const f = fitEnd(P); tailEnd = f.end; tailCls = f.cls;
      }
    }
  }

  // ---- bowl fullness: outer silhouette (ink plus counters) over its box, and the share of its outline that is nearly straight ----
  const silArea = area + holesArea;
  const bowlFill = silArea / (bw * bh);
  let flatShare = NaN;
  {
    const isSil = (x: number, y: number) => x >= 0 && x < cw && y >= 0 && y < ch && (b[y * cw + x] === 1 || !bg[y * cw + x]);
    let sx2 = 0, sy2 = 0, sn = 0;
    for (let y = top; y <= bot; y++) for (let x = left; x <= right; x++) if (isSil(x, y)) { sx2 += x; sy2 += y; sn++; }
    if (sn > 50) {
      const cx0 = sx2 / sn, cy0 = sy2 / sn, N = 240, r: number[] = new Array(N);
      for (let i = 0; i < N; i++) {
        const a = 2 * Math.PI * i / N, c = Math.cos(a), s2 = Math.sin(a); let rr = 0;
        while (isSil(Math.round(cx0 + c * (rr + 0.5)), Math.round(cy0 + s2 * (rr + 0.5)))) rr += 0.5;
        r[i] = rr;
      }
      const W2 = 2, rs2: number[] = r.map((_, i) => { let t = 0; for (let k = -W2; k <= W2; k++) t += r[(i + k + N) % N]; return t / (2 * W2 + 1); });
      const px = rs2.map((v, i) => cx0 + v * Math.cos(2 * Math.PI * i / N)), py = rs2.map((v, i) => cy0 + v * Math.sin(2 * Math.PI * i / N));
      const Req = Math.sqrt(sn / Math.PI); let tot = 0, flat = 0;
      for (let i = 0; i < N; i++) {
        const i0 = (i + N - 1) % N, i1 = (i + 1) % N;
        const ax = px[i] - px[i0], ay = py[i] - py[i0], bx = px[i1] - px[i], by = py[i1] - py[i];
        const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by); if (la < 1e-6 || lb < 1e-6) continue;
        const turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
        tot += lb; if ((turn / ((la + lb) / 2)) * Req < 0.35) flat += lb;
      }
      if (tot > 0) flatShare = flat / tot;
    }
  }

  // ---- storey votes (a: counter span, counter area, counter height; g: counters, counter below baseline, a full-height right-hand stem) ----
  const bigHole = holeList.slice().sort((p, q) => q.n - p.n)[0];
  let rightStem = 0;
  for (let x = Math.round(left + 0.6 * bw); x <= right; x++) { let best = 0, c = 0; for (let y = top; y <= bot; y++) { if (b[y * cw + x]) { c++; if (c > best) best = c; } else c = 0; } if (best > rightStem) rightStem = best; }
  rightStem /= bh;
  const holeCy = bigHole ? (bigHole.cy - top) / bh : NaN;
  const sa1 = holeSpan > 0.7 ? 1 : holeSpan < 0.5 ? 2 : 0;
  const ctr = holesArea / (bw * bh);
  const sa2 = ctr > 0.22 ? 1 : ctr < 0.17 ? 2 : 0;
  const sa3 = !Number.isFinite(holeCy) ? 0 : holeCy < 0.58 ? 1 : holeCy > 0.64 ? 2 : 0;
  const sg1 = holes >= 2 ? 2 : 1;
  const sg2 = holeList.some(h => h.cy > baseC + 0.1 * Math.max(1, bot - baseC)) ? 2 : 1;
  const sg3 = rightStem >= 0.85 ? 1 : rightStem <= 0.6 ? 2 : 0;

  const contrast = stem / thin;
  const stress = tilt * Math.max(0, Math.min(1, (contrast - 1.25) / 0.75)); // only counts where there is thick-thin contrast

  return {
    desc: (bot - baseC) / (baseC - top + 1), aspect: bw / bh, width: bw / S,
    stemRel: stem / bh, thinRel: thin / bh, contrast,
    sharpA, sharpB, cornerRatio: (sharpA + 1) / (sharpB + 1), slant: bestK,
    openFrac: 1 - holesArea / whiteInHull, counter: holesArea / (bw * bh), solidity: area / hullA, density: area / (bw * bh),
    holes, holeSpan, stress, serifLen, serifThick, topLeft, exitTail,
    xRatio: NaN, bowlFill, flatShare, termEnd, termCls, tailEnd, tailCls, sa1, sa2, sa3, sg1, sg2, sg3
  };
}
