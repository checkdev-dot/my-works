// Matcher benchmark on the 20% HOLDOUT (never used to choose weights or thresholds). Works on any matcher source + index pair,
// so the same numbers can be produced "before" (old source + old index) and "after" (current source + current index).
//   node bench.mjs --label after
//   node bench.mjs --label before --match <dir with internal.ts> --index <index.json>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { CACHE, TTF, OUT_LIB, ROOT, REPORTS, HERE, readJSON, writeJSON, fileUrl } from './common.mjs';

const require = createRequire(import.meta.url);
const opentype = require('opentype.js');
const { createCanvas } = require('@napi-rs/canvas');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const label = args.label || 'after';
const matchDir = args.match || path.join(ROOT, 'lib', 'match');
const indexPath = args.index || path.join(OUT_LIB, 'index.json');
const analysisPath = args.analysis || path.join(CACHE, 'analysis.json');

async function bundle(entry, name) {
  const outfile = path.join(HERE, '.build', name + '.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', outfile, logLevel: 'error', target: 'es2022' });
  return import(fileUrl(outfile) + '?t=' + Date.now());
}
const M = await bundle(path.join(matchDir, 'internal.ts'), 'bench-' + label);
const SF = await bundle(path.join(ROOT, 'lib', 'match', 'superfamily.ts'), 'bench-sf');
M.setCanvasFactory((w, h) => createCanvas(w, h));
const index = readJSON(indexPath), lib = M.loadLibrary(index);
const A = readJSON(analysisPath).files;
const LETTERS = M.LETTERS;
const fileOf = f => `${f.familyId}/${f.weight}-${f.style}.ttf`;
const sfOf = f => SF.superfamilyKey(f.familyId, f.family);
const hasVeto = M.rankKey !== undefined;

const fcache = new Map();
function getFont(file) { if (!fcache.has(file)) { const b = fs.readFileSync(path.join(TTF, file)); fcache.set(file, opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))); if (fcache.size > 40) fcache.delete(fcache.keys().next().value); } return fcache.get(file); }
function emCmds(font, ch) {
  if (!font.charToGlyphIndex(ch)) return null; const g = font.charToGlyph(ch); if (!g || g.index === 0) return null;
  const upm = font.unitsPerEm, p = g.getPath(0, 0, upm).commands; if (!p.length) return null;
  return p.map(c => { const o = { type: c.type }; if ('x' in c) { o.x = c.x / upm; o.y = -c.y / upm; } if ('x1' in c) { o.x1 = c.x1 / upm; o.y1 = -c.y1 / upm; } if ('x2' in c) { o.x2 = c.x2 / upm; o.y2 = -c.y2 / upm; } return o; });
}
function rng(seed) { let s = seed; const r = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; r.gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); return r; }
function jitter(cmds, r, sigma = 0.010, wscale = 0.04) { const ws = 1 + (r() * 2 - 1) * wscale; return cmds.map(c => { const o = { type: c.type }; for (const [a, b] of [['x', 'y'], ['x1', 'y1'], ['x2', 'y2']]) if (a in c) { o[a] = c[a] * ws + r.gauss() * sigma; o[b] = c[b] + r.gauss() * sigma; } return o; }); }
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const glyphsOf = file => { const font = getFont(file); return LETTERS.map(L => ({ char: L, commands: emCmds(font, L) })).filter(g => g.commands); };

const nonCon = lib.fonts.map((f, i) => i).filter(i => !lib.fonts[i].construction);
const regularIdx = nonCon.filter(i => A[fileOf(lib.fonts[i])]?.role === 'regular' && lib.fonts[i].style === 'normal');
const holdQ = regularIdx.filter(i => lib.fonts[i].holdout);
const nFams = new Set(nonCon.map(i => lib.fonts[i].familyId)).size;
console.log(label, 'library files', lib.fonts.length, 'families', nFams, 'holdout queries', holdQ.length);

// ---- properties: terminal class and bowl squareness read from the measured analysis (same data for before and after) ----
const rawM = f => A[fileOf(f)]?.m;
const termClass = f => { const m = rawM(f); if (!m) return -1; const c = [m.n?.termCls, m.H?.termCls].filter(v => v === 0 || v === 1 || v === 2); if (!c.length) return -1; const cnt = [0, 0, 0]; c.forEach(v => cnt[v]++); const b = Math.max(...cnt); return b * 2 > c.length ? cnt.indexOf(b) : -1; };
const CLS = ['flat', 'round', 'wedge', 'unknown'];
const regAll = Object.values(A).filter(a => a.role === 'regular' && a.m?.o);
const fillP75 = pct(regAll.map(a => a.m.o.bowlFill), 0.75), flatP75 = pct(regAll.map(a => a.m.o.flatShare).filter(Number.isFinite), 0.75);
const squarish = f => { const m = rawM(f); return !!m && m.o.bowlFill >= fillP75; };

// ---- twin metrics ----
const hexIou = (a, b) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { const x = parseInt(a[k], 16), y = parseInt(b[k], 16); for (let t = 0; t < 4; t++) { const p1 = (x >> t) & 1, p2 = (y >> t) & 1; i += p1 & p2; u += p1 | p2; } } return u ? i / u : 0; };
const sameDesign = (f, g) => { const a = A[fileOf(f)]?.masks, b = A[fileOf(g)]?.masks; return !!a && !!b && ['n', 'a', 'g'].every(L => a[L] && b[L] && hexIou(a[L], b[L]) >= 0.97); };

// ---- 1. neighbour test: holdout families, clean outlines, own family and superfamily excluded ----
const t1 = []; const times = [];
for (const i of holdQ) {
  const f = lib.fonts[i], sf = sfOf(f);
  const exclude = [...new Set(lib.fonts.filter(g => sfOf(g) === sf || g.familyId === f.familyId).map(g => g.familyId))];
  const glyphs = glyphsOf(fileOf(f)); if (glyphs.length < 7) continue;
  const t0 = performance.now();
  const res = M.findClosest(glyphs, lib, { limit: 5, exclude });
  times.push(performance.now() - t0);
  if (!res.length) continue;
  let twins = 0, twinsOwn = 0;
  for (let j = 1; j < res.length; j++) {
    if (res.slice(0, j).some(r => sameDesign(r.font, res[j].font))) twins++;
  }
  t1.push({ id: f.familyId, match: res[0].match, vetoed: !!res[0].vetoed, weak: !!res[0].weak, top: res.map(r => r.font.familyId + ':' + r.font.weight), twins });
}
const mv = t1.map(r => r.match);
const nbr = {
  queries: t1.length, matchMedian: pct(mv, 0.5), matchQ1: pct(mv, 0.25), matchQ3: pct(mv, 0.75),
  shareAt90: +(mv.filter(v => v >= 90).length / mv.length).toFixed(3), shareUnder60: +(mv.filter(v => v < 60).length / mv.length).toFixed(3),
  weakShare: +(t1.filter(r => r.weak).length / t1.length).toFixed(3), vetoedTop1Share: +(t1.filter(r => r.vetoed).length / t1.length).toFixed(3),
  nearTwinShareTop5: +(t1.reduce((s, r) => s + r.twins, 0) / (t1.length * 5)).toFixed(3),
  rowsWithAnyTwinInTop5: +(t1.filter(r => r.twins > 0).length / t1.length).toFixed(3)
};
const timing = { findClosestMsMean: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1), findClosestMsMedian: +pct(times, 0.5).toFixed(1) };
console.log('neighbour', JSON.stringify(nbr), JSON.stringify(timing));

// ---- 2. noise test: holdout fonts, outline jitter 0.010 em and width +-4%, rank of the true family among all families ----
const r9 = rng(9001);
const SETS = { 'n+a+o': ['n', 'a', 'o'], 'all 7': [...LETTERS] };
const noiseQ = [];
for (const i of holdQ) {
  const f = lib.fonts[i], font = getFont(fileOf(f)); const jg = [];
  for (const L of LETTERS) { const c = emCmds(font, L); if (c) jg.push({ char: L, commands: jitter(c, r9) }); }
  if (jg.length < 7) continue;
  noiseQ.push({ i, q7: M.measureQuery(jg, lib), q3: M.measureQuery(jg.filter(g => 'nao'.includes(g.char)), lib) });
}
const veto = new Uint8Array(lib.fonts.length);
function famRankOf(key, familyId) { const m = new Map(); for (let k = 0; k < key.length; k++) { if (!Number.isFinite(key[k])) continue; const fid = lib.fonts[k].familyId; if (!(m.get(fid) <= key[k])) m.set(fid, key[k]); } const own = m.get(familyId); if (own === undefined) return Infinity; let r = 1; for (const [k, v] of m) if (k !== familyId && v < own) r++; return r; }
const noise = {};
for (const [name, key] of [['n+a+o', 'q3'], ['all 7', 'q7']]) {
  const ranks = [];
  for (const nq of noiseQ) {
    const d = hasVeto ? M.distances(lib, nq[key], false, undefined, undefined, false, veto) : M.distances(lib, nq[key]);
    ranks.push(famRankOf(hasVeto ? M.rankKey(d, veto) : d, lib.fonts[nq.i].familyId));
  }
  const f = k => +(ranks.filter(r => r <= k).length / ranks.length).toFixed(3);
  noise[name] = { n: ranks.length, top1: f(1), top5: f(5), top10: f(10), medianRank: pct(ranks, 0.5) };
}
console.log('noise', JSON.stringify(noise));

// ---- gate flips: jittered own font, all 7 letters, does the a or g build contradict the font's own? ----
let flips = 0;
for (const nq of noiseQ) if (M.buildMismatch(lib, nq.q7, nq.i).length) flips++;
const gate = { flips, n: noiseQ.length, rate: +(flips / noiseQ.length).toFixed(3) };
console.log('gate flips', JSON.stringify(gate));

// ---- 3. sibling test: does a Regular find its own Bold when weight is ignored? (holdout families with both) ----
const byFam = new Map(); lib.fonts.forEach((f, i) => { if (f.style !== 'normal' || f.construction) return; const role = A[fileOf(f)]?.role; if (!role) return; (byFam.get(f.familyId) ?? byFam.set(f.familyId, {}).get(f.familyId))[role] = i; });
const pairs = [...byFam.values()].filter(v => v.regular !== undefined && v.bold !== undefined && lib.fonts[v.regular].holdout && A[fileOf(lib.fonts[v.regular])].hash !== A[fileOf(lib.fonts[v.bold])].hash);
const sibRanks = [];
for (const p of pairs) {
  const letters = ['n', 'a', 'o'];
  const z = letters.map(L => { const o = p.regular * M.STRIDE + LETTERS.indexOf(L) * M.MAX_FEATS; return Array.from(lib.z.subarray(o, o + M.FEATS_BY_LETTER[L].length), v => (v === -128 ? NaN : v / M.Q_STEP)); });
  const d = hasVeto ? M.distances(lib, { letters, z }, false, j => j === p.regular, { weight: 0 }, true, veto) : M.distances(lib, { letters, z }, false, j => j === p.regular, { weight: 0 }, true);
  const key = hasVeto ? M.rankKey(d, veto) : d;
  sibRanks.push(1 + [...key].filter((v, j) => v < key[p.bold] && j !== p.bold).length);
}
const sibling = { pairs: pairs.length, median: pct(sibRanks, 0.5), q1: pct(sibRanks, 0.25), q3: pct(sibRanks, 0.75), top10: +(sibRanks.filter(r => r <= 10).length / sibRanks.length).toFixed(3), top30: +(sibRanks.filter(r => r <= 30).length / sibRanks.length).toFixed(3) };
console.log('sibling', JSON.stringify(sibling));

// ---- 4. properties: heavy rounded (Nunito 900) and thin squarish (Saira 100), own superfamily excluded ----
function property(id, weight) {
  const file = `${id}/${weight}-normal.ttf`; if (!fs.existsSync(path.join(TTF, file))) return { missing: file };
  const sf = SF.superfamilyKey(id, lib.fonts.find(f => f.familyId === id)?.family ?? id);
  const exclude = [...new Set(lib.fonts.filter(g => sfOf(g) === sf).map(g => g.familyId))];
  const res = M.findClosest(glyphsOf(file), lib, { limit: 8, exclude });
  return { excluded: exclude, rows: res.map(r => ({ font: r.font.family + ' ' + r.font.weight, match: r.match, vetoed: !!r.vetoed, band: r.band, terminal: CLS[termClass(r.font) < 0 ? 3 : termClass(r.font)], squarish: squarish(r.font), oFill: +(rawM(r.font)?.o.bowlFill ?? NaN).toFixed(3), oFlat: +(rawM(r.font)?.o.flatShare ?? NaN).toFixed(2) })) };
}
const heavy = property('nunito', 900), thin = property('saira', 100);
const prop = {
  squarishRule: `o bowlFill >= ${fillP75.toFixed(3)} (library p75 of regular files; circle 0.785, square 1)`,
  heavyRounded: { ...heavy, pass: !!heavy.rows && heavy.rows.slice(0, 3).every(r => r.terminal === 'round'), roundInTop3: heavy.rows?.slice(0, 3).filter(r => r.terminal === 'round').length },
  thinSquarish: { ...thin, pass: !!thin.rows && thin.rows.slice(0, 3).every(r => r.squarish), squarishInTop3: thin.rows?.slice(0, 3).filter(r => r.squarish).length, squarishInTop5: thin.rows?.slice(0, 5).filter(r => r.squarish).length }
};
console.log('properties', JSON.stringify({ heavy: prop.heavyRounded.rows?.slice(0, 5).map(r => r.font + '/' + r.terminal), pass: prop.heavyRounded.pass, thin: prop.thinSquarish.rows?.slice(0, 5).map(r => r.font + '/' + (r.squarish ? 'sq' : 'no') + ' ' + r.oFill), pass2: prop.thinSquarish.pass }));

const out = { label, matchDir, indexPath, library: { files: lib.fonts.length, families: nFams }, holdoutQueries: holdQ.length, neighbour: nbr, timing, noise, gate, sibling, properties: prop };
writeJSON(path.join(REPORTS, `bench-${label}.json`), out, true);
