// Step 3: parse every cached TTF, measure letters with the NEW matcher code (bundled from lib/match) and with the
// frozen spike engine (for before/after comparison), and gather cleanup flags. Parallel via worker_threads.
// Output: <cache>/analysis.json   (resumable per run: re-run overwrites; ~minutes)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { CACHE, TTF, readJSON, writeJSON, bundleMatch, fileUrl } from './common.mjs';

const require = createRequire(import.meta.url);
const LETTERS = ['a', 'e', 'g', 'n', 'o', 'H', 'O'];
const GRID = 32;

if (isMainThread) {
  const bundle = await bundleMatch();
  const { plan } = readJSON(path.join(CACHE, 'plan.json'));
  const dl = readJSON(path.join(CACHE, 'downloads.json'), { failed: {} });
  const files = plan.filter(p => fs.existsSync(path.join(TTF, p.file)));
  const t0 = Date.now();
  const nW = Math.max(1, Math.min(os.cpus().length - 1, 11));
  const chunks = []; for (let i = 0; i < files.length; i += 12) chunks.push(files.slice(i, i + 12));
  const results = {}; let next = 0, done = 0;
  await new Promise((resolve, reject) => {
    let live = 0;
    const spawn = () => {
      const w = new Worker(new URL(import.meta.url), { workerData: { bundle } }); live++;
      const feed = () => { if (next < chunks.length) w.postMessage(chunks[next++]); else { w.terminate(); if (--live === 0) resolve(); } };
      w.on('message', rs => { for (const r of rs) results[r.file] = r; done += rs.length; if (done % 240 < 12) console.log(done + '/' + files.length, ((Date.now() - t0) / 1000).toFixed(0) + 's'); feed(); });
      w.on('error', reject); feed();
    };
    for (let i = 0; i < nW; i++) spawn();
  });
  writeJSON(path.join(CACHE, 'analysis.json'), { builtAt: new Date().toISOString(), seconds: (Date.now() - t0) / 1000, files: results });
  console.log('analysed', Object.keys(results).length, 'files in', ((Date.now() - t0) / 1000).toFixed(0), 's');
} else {
  const opentype = require('opentype.js');
  const { createCanvas } = require('@napi-rs/canvas');
  const legacy = require('./legacy-engine.cjs');
  const M = await import(fileUrl(workerData.bundle));
  M.setCanvasFactory((w, h) => createCanvas(w, h));

  const emCmds = (font, ch) => {
    if (!font.charToGlyphIndex(ch)) return null;
    const g = font.charToGlyph(ch); if (!g || g.index === 0) return null;
    const upm = font.unitsPerEm, p = g.getPath(0, 0, upm).commands;
    if (!p.length) return null;
    return { cmds: p.map(c => { const o = { type: c.type }; if ('x' in c) { o.x = c.x / upm; o.y = -c.y / upm; } if ('x1' in c) { o.x1 = c.x1 / upm; o.y1 = -c.y1 / upm; } if ('x2' in c) { o.x2 = c.x2 / upm; o.y2 = -c.y2 / upm; } return o; }), g, upm };
  };
  const shape = (cmds) => { // coarse GRIDxGRID occupancy of the ink box, plus box height in px
    const R = M.rasterise(cmds); const { bin, w, h } = R; let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bin[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null; const bw = x1 - x0 + 1, bh = y1 - y0 + 1, g = new Uint8Array(GRID * GRID);
    for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
      let s = 0, c = 0; const ya = y0 + Math.floor(gy * bh / GRID), yb = y0 + Math.max(Math.floor((gy + 1) * bh / GRID), Math.floor(gy * bh / GRID) + 1);
      const xa = x0 + Math.floor(gx * bw / GRID), xb = x0 + Math.max(Math.floor((gx + 1) * bw / GRID), Math.floor(gx * bw / GRID) + 1);
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { s += bin[y * w + x]; c++; }
      g[gy * GRID + gx] = s * 2 > c ? 1 : 0;
    }
    return { h: bh, w: bw, g };
  };
  const pack = g => { let h = ''; for (let i = 0; i < g.length; i += 4) h += (g[i] * 8 + g[i + 1] * 4 + g[i + 2] * 2 + g[i + 3]).toString(16); return h; };
  const iou = (a, b) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { i += a[k] & b[k]; u += a[k] | b[k]; } return u ? i / u : 0; };
  const rectilinear = (cmds) => {
    let px = 0, py = 0, sx = 0, sy = 0, ys = new Set(), xs = new Set();
    for (const c of cmds) {
      if (c.type === 'C' || c.type === 'Q') return { rect: false };
      if (c.type === 'M') { px = sx = c.x; py = sy = c.y; continue; }
      if (c.type === 'L') { if (Math.abs(c.x - px) > 0.002 && Math.abs(c.y - py) > 0.002) return { rect: false }; px = c.x; py = c.y; ys.add(Math.round(py * 2000)); xs.add(Math.round(px * 2000)); }
    }
    return { rect: true, nx: xs.size, ny: ys.size };
  };

  // lattice: do all outline points sit on a coarse grid (pixel fonts)? returns grid step in em, or 0
  const lattice = (cmds) => {
    const xs = [], ys = [];
    for (const c of cmds) if (c.type === 'M' || c.type === 'L') { xs.push(c.x); ys.push(c.y); } else if (c.type === 'C' || c.type === 'Q') return 0;
    const uniq = a => [...new Set(a.map(v => Math.round(v * 4000)))].sort((p, q) => p - q).map(v => v / 4000);
    const ux = uniq(xs), uy = uniq(ys); let step = Infinity;
    for (const u of [ux, uy]) for (let i = 1; i < u.length; i++) { const d = u[i] - u[i - 1]; if (d > 0.004 && d < step) step = d; }
    if (!isFinite(step) || step < 0.03) return 0;
    const ok = v => { const q = v / step; return Math.abs(q - Math.round(q)) < 0.1; };
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return xs.every(v => ok(v - x0)) && ys.every(v => ok(v - y0)) ? +step.toFixed(4) : 0;
  };
  // dots: split into subpaths; how many, how small and how alike
  const pieces = (cmds) => {
    const subs = []; let cur = null;
    for (const c of cmds) { if (c.type === 'M') { cur = []; subs.push(cur); } if (cur && c.type !== 'Z') { cur.push([c.x, c.y]); } }
    const areas = subs.map(p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; }).filter(a => a > 1e-6);
    if (areas.length < 2) return { n: areas.length, med: 0, cv: 0 };
    const med = areas.slice().sort((a, b) => a - b)[Math.floor(areas.length / 2)];
    const mean = areas.reduce((a, b) => a + b, 0) / areas.length, sd = Math.sqrt(areas.reduce((a, b) => a + (b - mean) ** 2, 0) / areas.length);
    return { n: areas.length, med: +med.toFixed(5), cv: +(sd / mean).toFixed(3) };
  };

  parentPort.on('message', (chunk) => {
    const out = [];
    for (const p of chunk) {
      const r = { file: p.file, id: p.id, role: p.role, parseError: null, m: {}, legacy: {}, flags: {} };
      try {
        const buf = fs.readFileSync(path.join(TTF, p.file));
        const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
        r.upm = font.unitsPerEm; r.hash = crypto.createHash('md5').update(buf).digest('hex');
        r.name = font.names?.fontFamily?.en;
        const hashes = {}, cmdsBy = {}, missing = [], rect = {}, contours = {}, lat = {}, pcs = {}, masks = {};
        for (const L of LETTERS) {
          const g = emCmds(font, L);
          if (!g) { missing.push(L); r.m[L] = null; r.legacy[L] = null; continue; }
          r.m[L] = M.measureGlyph(g.cmds); cmdsBy[L] = g.cmds;
          if (!r.m[L]) { missing.push(L); r.legacy[L] = null; continue; }
          hashes[L] = crypto.createHash('md5').update(g.cmds.map(c => c.type + (c.x ?? '') + (c.y ?? '')).join(',')).digest('hex').slice(0, 8);
          if ('nag'.includes(L)) { const sh = shape(g.cmds); if (sh) masks[L] = pack(sh.g); } rect[L] = rectilinear(g.cmds); contours[L] = g.cmds.filter(c => c.type === 'M').length; lat[L] = lattice(g.cmds); pcs[L] = pieces(g.cmds);
          try { const gp = g.g.getPath(150, 560, 400).commands; const lm = legacy.measure(legacy.rasterise(gp, 400)); if (lm) { lm.rsb = g.g.advanceWidth / g.upm - lm.right; } r.legacy[L] = lm; } catch (e) { r.legacy[L] = null; }
        }
        if (r.m.n && cmdsBy.H) r.m.n.xRatio = M.xHeightRatio(cmdsBy.n, cmdsBy.H);
        r.flags.missing = missing;
        r.flags.distinct = new Set(Object.values(hashes)).size;
        r.flags.rect = Object.fromEntries(Object.entries(rect).map(([k, v]) => [k, v.rect ? [v.nx, v.ny] : 0]));
        r.masks = masks; r.flags.contours = contours; r.flags.lattice = lat; r.flags.pieces = pcs;
        // caps-only / small-caps: lowercase same shape as capital
        const caps = {};
        for (const [lo, up] of [['n', 'N'], ['a', 'A'], ['e', 'E'], ['g', 'G']]) {
          const a = emCmds(font, lo), b = emCmds(font, up); if (!a || !b) continue;
          const sa = shape(a.cmds), sb = shape(b.cmds); if (!sa || !sb) continue;
          caps[lo] = { iou: +iou(sa.g, sb.g).toFixed(3), hr: +(sa.h / sb.h).toFixed(3), wr: +(sa.w / sb.w).toFixed(3) };
        }
        r.flags.caps = caps;
      } catch (e) { r.parseError = String(e && e.message || e); }
      out.push(r);
    }
    parentPort.postMessage(out);
  });
}
