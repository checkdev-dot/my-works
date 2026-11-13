// Shared evaluation helpers: loads the built library, the analysis cache, fonts, and both engines (new + frozen spike).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { CACHE, TTF, OUT_LIB, ROOT, readJSON, bundleMatch, fileUrl } from './common.mjs';

const require = createRequire(import.meta.url);
export const opentype = require('opentype.js');
export const { createCanvas, loadImage } = require('@napi-rs/canvas');
export const legacy = require('./legacy-engine.cjs');
export const M = await import(fileUrl(await bundleMatch()));
M.setCanvasFactory((w, h) => createCanvas(w, h));

export const index = readJSON(path.join(OUT_LIB, 'index.json'));
export const lib = M.loadLibrary(index);
export const A = readJSON(path.join(CACHE, 'analysis.json')).files;
export const LETTERS = M.LETTERS;
export const fileOf = f => `${f.familyId}/${f.weight}-${f.style}.ttf`;
export const spikeManifest = readJSON(path.join(ROOT, 'spike', 'manifest.json'), []);

// seeded RNG
export function rng(seed) { let s = seed; const r = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; r.gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); return r; }

const fcache = new Map();
export function getFont(file) {
  if (!fcache.has(file)) { const b = fs.readFileSync(path.join(TTF, file)); fcache.set(file, opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))); if (fcache.size > 60) fcache.delete(fcache.keys().next().value); }
  return fcache.get(file);
}
/** em-space (y-up) commands for a character, or null */
export function emCmds(font, ch, px = false) {
  if (!font.charToGlyphIndex(ch)) return null;
  const g = font.charToGlyph(ch); if (!g || g.index === 0) return null;
  const upm = font.unitsPerEm, p = g.getPath(0, 0, upm).commands;
  if (!p.length) return null;
  return p.map(c => { const o = { type: c.type }; if ('x' in c) { o.x = c.x / upm; o.y = -c.y / upm; } if ('x1' in c) { o.x1 = c.x1 / upm; o.y1 = -c.y1 / upm; } if ('x2' in c) { o.x2 = c.x2 / upm; o.y2 = -c.y2 / upm; } return o; });
}
/** spike "variant B": outline jitter 0.010 em, width scale +-4% */
export function jitter(cmds, r, sigma = 0.010, wscale = 0.04) {
  const ws = 1 + (r() * 2 - 1) * wscale;
  return cmds.map(c => { const o = { type: c.type }; for (const [a, b] of [['x', 'y'], ['x1', 'y1'], ['x2', 'y2']]) if (a in c) { o[a] = c[a] * ws + r.gauss() * sigma; o[b] = c[b] + r.gauss() * sigma; } return o; });
}

// ---- legacy (spike) engine over the same library ----
export const LEG_STATS = (() => {
  const raw = {}; LETTERS.forEach(L => raw[L] = []);
  lib.fonts.forEach(f => { if (f.construction) return; const a = A[fileOf(f)]; LETTERS.forEach(L => raw[L].push(a.legacy[L])); });
  // spike FEATS only knows n,o,a,e,g,H,O: same seven letters
  return legacy.buildStats(raw);
})();
export const LEG_Z = lib.fonts.map(f => { const a = A[fileOf(f)]; const o = {}; for (const L of LETTERS) o[L] = a.legacy[L] ? legacy.zvec(L, a.legacy[L], LEG_STATS) : null; return o; });
export function legacyQueryZ(letterCmds /* {L: emCmds} */) {
  const z = {}; for (const L in letterCmds) { const m = legacy.measure(legacy.rasterise(legacy.toPx(letterCmds[L], 400), 400)); z[L] = m ? legacy.zvec(L, m, LEG_STATS) : null; } return z;
}
/** spike matcher: mean of per-letter RMS distance with equal weights; Infinity for construction fonts */
export function legacyDistances(qz) {
  const Ls = Object.keys(qz).filter(L => qz[L]);
  return Float64Array.from(lib.fonts, (f, i) => { if (f.construction) return Infinity; let s = 0; for (const L of Ls) { const z = LEG_Z[i][L]; if (!z) return Infinity; s += legacy.dist(qz[L], z); } return s / Ls.length; });
}

// ---- ranking helpers ----
export function famMin(d) { const m = new Map(); for (let i = 0; i < d.length; i++) { if (!Number.isFinite(d[i])) continue; const k = lib.fonts[i].familyId; if (!(m.get(k) <= d[i])) m.set(k, d[i]); } return m; }
export function fileRank(d, i) { let r = 1; for (let k = 0; k < d.length; k++) if (k !== i && d[k] < d[i]) r++; return r; }
export function famRank(d, familyId, fm = famMin(d)) { const own = fm.get(familyId); if (own === undefined) return Infinity; let r = 1; for (const [k, v] of fm) if (k !== familyId && v < own) r++; return r; }
export const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
export function summarise(ranks, nCand) { const n = ranks.length; const f = k => ranks.filter(r => r <= k).length / n; return { n, top1: +f(1).toFixed(3), top5: +f(5).toFixed(3), top10: +f(10).toFixed(3), median: pct(ranks, 0.5), chanceTop10: +(10 / nCand).toFixed(3) }; }
