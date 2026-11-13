// v3 benchmark. Runs any matcher copy + index pair; truth sources are independent (qa-common.mjs).
//   node bench3.mjs --label before --match <dir> --index <index.json> [--baseline bench3-before.json]
import path from 'node:path';
import { CACHE, ROOT, REPORTS, readJSON, writeJSON } from './common.mjs';
import * as Q from './qa-common.mjs';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const label = args.label || 'after', matchDir = args.match || path.join(ROOT, 'lib', 'match'), indexPath = args.index || path.join(ROOT, 'public', 'library', 'index.json');
const { M, lib } = await Q.loadMatcher(matchDir, indexPath, 'b3-' + label);
const OLD = await Q.bundle(path.join(Q.BEFORE, 'match', 'superfamily.ts'), 'qa-oldsf'); // old key, frozen
const oldKey = f => OLD.superfamilyKey(f.familyId, f.family);
const A = readJSON(path.join(CACHE, 'analysis.json')).files;
const base = args.baseline ? readJSON(path.join(REPORTS, args.baseline)) : null;
const famsNow = new Set(lib.fonts.map(f => f.familyId));
const isReg = f => f.style === 'normal' && !f.construction && A[Q.fileOf(f)]?.role === 'regular';
let holdQ = lib.fonts.map((f, i) => i).filter(i => lib.fonts[i].holdout && isReg(lib.fonts[i]));
let newQ = [];
if (base) { const keep = new Set(base.holdoutFamilies); newQ = holdQ.filter(i => !keep.has(lib.fonts[i].familyId)); holdQ = holdQ.filter(i => keep.has(lib.fonts[i].familyId)); }
const pct = Q.pct;
const out = { label, matchDir, indexPath, files: lib.fonts.length, families: famsNow.size, holdoutFamilies: holdQ.map(i => lib.fonts[i].familyId), holdoutN: holdQ.length };
const EDITOR = id => ({ limit: 12, exclude: [id], excludeSuperfamily: true });
const timeIt = fn => { const t = performance.now(); const r = fn(); return [r, performance.now() - t]; };

// 1. self-retrieval (nothing excluded) and 3. neighbour match (own family + old-key superfamily excluded)
let self = 0, selfN = 0; const selfFail = [], nbr = [], times = [];
for (const i of holdQ) {
  const f = lib.fonts[i], g = Q.glyphsOf(Q.fileOf(f), true); if (g.length < 7) continue;
  const [r0] = timeIt(() => M.findClosest(g, lib, { limit: 3, includeEffects: !!f.effect })); selfN++; if (r0[0]?.font.familyId === f.familyId) self++; else selfFail.push(f.familyId + '->' + r0[0]?.font.familyId);
  const sf = oldKey(f), exclude = [...new Set(lib.fonts.filter(h => oldKey(h) === sf || h.familyId === f.familyId).map(h => h.familyId))];
  const [r1, ms] = timeIt(() => M.findClosest(g, lib, { limit: 5, exclude })); times.push(ms); if (r1[0]) nbr.push(r1[0].match);
}
out.selfRetrieval = { n: selfN, top1: +(self / selfN).toFixed(4), fails: selfFail.slice(0, 20) };
out.neighbour = { n: nbr.length, median: pct(nbr, 0.5), q1: pct(nbr, 0.25), q3: pct(nbr, 0.75), share90: +(nbr.filter(v => v >= 90).length / nbr.length).toFixed(3) };
// 2. noise
const r9 = Q.rng(9001), noiseQ = [];
for (const i of holdQ) { const f = lib.fonts[i], font = Q.getFont(Q.fileOf(f)); const jg = []; for (const L of Q.LET) { const c = Q.emCmds(font, L); if (c) jg.push({ char: L, commands: Q.jitter(c, r9) }); } if (jg.length < 7) continue; noiseQ.push({ i, q7: M.measureQuery(jg, lib), q3: M.measureQuery(jg.filter(g => 'nao'.includes(g.char)), lib) }); }
const veto = new Uint8Array(lib.fonts.length);
function famRank(key, id) { const m = new Map(); for (let k = 0; k < key.length; k++) { if (!Number.isFinite(key[k])) continue; const h = lib.fonts[k].familyId; if (!(m.get(h) <= key[k])) m.set(h, key[k]); } const own = m.get(id); if (own === undefined) return Infinity; let r = 1; for (const [k, v] of m) if (k !== id && v < own) r++; return r; }
out.noise = {};
for (const [name, key] of [['n+a+o', 'q3'], ['all 7', 'q7']]) { const ranks = noiseQ.map(nq => { const d = M.distances(lib, nq[key], false, undefined, undefined, false, veto); return famRank(M.rankKey(d, veto), lib.fonts[nq.i].familyId); }); const f = k => +(ranks.filter(r => r <= k).length / ranks.length).toFixed(3); out.noise[name] = { n: ranks.length, top1: f(1), top5: f(5), top10: f(10), median: pct(ranks, 0.5) }; }
// 4/5/6. clay lists
const CL = await Q.clay(); const cases = Q.clayCases(CL.C); const lists = [];
for (const c of cases) { const q = CL.query(c.fam, c.st); const [r, ms] = timeIt(() => M.findClosest(q.glyphs, lib, EDITOR(q.f.libraryId))); times.push(ms); lists.push({ nm: c.fam + '_' + c.name, r }); }
const top8 = lists.flatMap(l => l.r.slice(0, 8));
const sfRe = top8.filter(x => Q.SCRIPTFIRST_RE.test(x.font.family)).length, sfGF = top8.filter(x => Q.scriptFirstGF(x.font.family)).length;
out.scriptFirst = { slots: top8.length, regexShare: +(sfRe / top8.length).toFixed(3), primaryScriptShare: +(sfGF / top8.length).toFixed(3), listsWithAny: lists.filter(l => l.r.slice(0, 8).some(x => Q.scriptFirstGF(x.font.family))).length, top1: lists.filter(l => l.r[0] && Q.scriptFirstGF(l.r[0].font.family)).length, lists: lists.length };
const hexIou = (a, b) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { const x = parseInt(a[k], 16), y = parseInt(b[k], 16); for (let t = 0; t < 4; t++) { const p1 = (x >> t) & 1, p2 = (y >> t) & 1; i += p1 & p2; u += p1 | p2; } } return u ? i / u : 0; };
const sameDesign = (f, g) => { const a = A[Q.fileOf(f)]?.masks, b = A[Q.fileOf(g)]?.masks; return !!a && !!b && ['n', 'a', 'g'].every(L => a[L] && b[L] && hexIou(a[L], b[L]) >= 0.97); };
let dupKey = 0, dupDesign = 0, dupLists = 0;
for (const l of lists) { const t = l.r.slice(0, 8); let any = false; t.forEach((x, k) => { const prev = t.slice(0, k); if (prev.some(p => oldKey(p.font) === oldKey(x.font))) { dupKey++; any = true; } if (prev.some(p => sameDesign(p.font, x.font))) dupDesign++; }); if (any) dupLists++; }
out.duplicates = { slots: top8.length, oldKeyShare: +(dupKey / top8.length).toFixed(3), maskIdenticalShare: +(dupDesign / top8.length).toFixed(3), listsWithOldKeyDup: dupLists, lists: lists.length, distinctTop1: new Set(lists.map(l => l.r[0]?.font.familyId)).size };
// heavy rounded
const rb = CL.query('rounded', { thick: 1 }); const rAll = M.findClosest(rb.glyphs, lib, { ...EDITOR(rb.f.libraryId), limit: 1000 });
const rowRank = (res, id) => { const k = res.findIndex(x => x.font.familyId === id || (x.also || []).some(a => a.familyId === id)); return k < 0 ? null : k + 1; };
const rk = id => rowRank(rAll, id);
const termClass = f => { const m = A[Q.fileOf(f)]?.m; if (!m) return -1; const c = [m.n?.termCls, m.H?.termCls].filter(v => v === 0 || v === 1 || v === 2); if (!c.length) return -1; const cnt = [0, 0, 0]; c.forEach(v => cnt[v]++); const b = Math.max(...cnt); return b * 2 > c.length ? cnt.indexOf(b) : -1; };
const rAll2 = M.findClosest(rb.glyphs, lib, { ...EDITOR(rb.f.libraryId), limit: 1000, ends: 'round' });
out.heavyRoundedDeclared = { fredoka: rowRank(rAll2, 'fredoka'), varelaRound: rowRank(rAll2, 'varela-round'), quicksand: rowRank(rAll2, 'quicksand'), top8: rAll2.slice(0, 8).map(x => x.font.family + ' ' + x.font.weight), roundEndsInTop8: rAll2.slice(0, 8).filter(x => termClass(x.font) === 1).length };
out.heavyRounded = { query: 'clay rounded, Thick at black', fredoka: rk('fredoka'), varelaRound: rk('varela-round'), quicksand: rk('quicksand'), top8: rAll.slice(0, 8).map(x => x.font.family + ' ' + x.font.weight), roundEndsInTop8: rAll.slice(0, 8).filter(x => termClass(x.font) === 1).length };
// Courier Prime / Pacifico / Bebas
const lookup = (id, w = 400) => lib.fonts.find(f => f.familyId === id && f.weight === w && f.style === 'normal');
const kq = (id, withAdv) => { const f = lookup(id); return f ? Q.glyphsOf(Q.fileOf(f), withAdv) : null; };
const monoRun = adv => { const r = M.findClosest(kq('courier-prime', adv), lib, { limit: 12, exclude: ['courier-prime'] }).slice(0, 8); return { top8: r.map(x => x.font.family), monoCount: r.filter(x => Q.isMonoTruth(x.font.familyId, x.font.family)).length }; };
out.courierPrime = { outlinesOnly: monoRun(false), withAdvances: monoRun(true) };
const pr = M.findClosest(kq('pacifico'), lib, { limit: 600, exclude: ['pacifico'] }); const prk = id => rowRank(pr, id);
out.pacifico = { top8: pr.slice(0, 8).map(x => x.font.family + (x.font.style === 'italic' ? ' i' : '')), scriptCount: pr.slice(0, 8).filter(x => Q.isScriptTruth(x.font.familyId, x.font.family)).length, ranks: Object.fromEntries(['lobster', 'satisfy', 'courgette', 'kaushan-script', 'dancing-script'].map(id => [id, prk(id)])) };
const pr2 = M.findClosest(kq('pacifico', true), lib, { limit: 600, exclude: ['pacifico'] });
out.pacifico.withAdvances = { top8: pr2.slice(0, 8).map(x => x.font.family), scriptCount: pr2.slice(0, 8).filter(x => Q.isScriptTruth(x.font.familyId, x.font.family)).length, ranks: Object.fromEntries(['lobster', 'satisfy', 'courgette', 'kaushan-script', 'dancing-script'].map(id => [id, rowRank(pr2, id)])) };
const bebas = [];
{ const o = lookup('oswald'); const o7 = lookup('oswald', 700), an = lookup('anton');
const extraQ = [['oswald700 (info)', o7 ? Q.glyphsOf(Q.fileOf(o7)) : null, 'oswald'], ['anton400 (info)', an ? Q.glyphsOf(Q.fileOf(an)) : null, 'anton']];
const qs = [['oswald400', o ? Q.glyphsOf(Q.fileOf(o)) : null, 'oswald'], ['clay squarish black+narrow', CL.query('squarish', { thick: 1, wide: -1 }).glyphs, 'saira'], ['clay plain black+narrow', CL.query('plain', { thick: 1, wide: -1 }).glyphs, 'roboto-flex']];
  for (const [nm, g, ex] of [...qs, ...extraQ]) { if (!g) continue; const r = M.findClosest(g, lib, { limit: 1500, exclude: [ex], excludeSuperfamily: true }); bebas.push({ query: nm, rank: rowRank(r, 'bebas-neue') }); } }
out.bebasNeue = { inIndex: famsNow.has('bebas-neue'), queries: bebas, reachableTop12: bebas.slice(0, 3).some(b => b.rank && b.rank <= 12), reachableTop12AnyQuery: bebas.some(b => b.rank && b.rank <= 12) };
out.speed = { medianMs: +pct(times, 0.5).toFixed(1), meanMs: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1), p90Ms: +pct(times, 0.9).toFixed(1), n: times.length };
if (base) { out.newReps = { n: newQ.length }; let s = 0; const fails = []; for (const i of newQ) { const f = lib.fonts[i]; const g = Q.glyphsOf(Q.fileOf(f), true); if (g.length < 5) continue; const r = M.findClosest(g, lib, { limit: 1 }); if (r[0]?.font.familyId === f.familyId) s++; else fails.push(f.familyId + '->' + r[0]?.font.familyId); } out.newReps.selfTop1 = s; out.newReps.fails = fails.slice(0, 10); }
writeJSON(path.join(REPORTS, `bench3-${label}.json`), out, true);
console.log(JSON.stringify({ ...out, holdoutFamilies: undefined }, null, 1));
