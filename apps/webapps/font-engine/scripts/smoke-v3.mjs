// End-to-end smoke checks for the v3 matcher: declared forms, coordinator cases (weight words, Lexend widths), weak rate, number monotonicity.
import path from 'node:path';
import { CACHE, ROOT, readJSON } from './common.mjs';
import * as Q from './qa-common.mjs';
const NEW = await Q.loadMatcher(path.join(ROOT, 'lib', 'match'), path.join(ROOT, 'public', 'library', 'index.json'), 'smk-new');
const OLD = await Q.loadMatcher(path.join(Q.BEFORE, 'match'), path.join(Q.BEFORE, 'index.json'), 'smk-old');
const A = readJSON(path.join(CACHE, 'analysis.json')).files;
const CL = await Q.clay();
const { M, lib } = NEW;
const EDITOR = id => ({ limit: 12, exclude: [id], excludeSuperfamily: true });
const out = {};
// 1. forms
const home = CL.query('plain', {});
const base = M.findClosest(home.glyphs, lib, EDITOR('roboto-flex'));
out.formsEmptyIdentical = JSON.stringify(base.map(r => [r.font.id, r.match])) === JSON.stringify(M.findClosest(home.glyphs, lib, { ...EDITOR('roboto-flex'), forms: {} }).map(r => [r.font.id, r.match]));
const fidx = f => lib.fonts.indexOf(f);
out.forms = {};
for (const [key, val] of [['a', 'one'], ['g', 'two'], ['bJoin', 'smooth'], ['R', 'curved'], ['G', 'spur'], ['tTop', 'cut'], ['aTail', 'tail'], ['four', 'open']]) {
  const k = M.FORM_INDEX[key], code = M.FORM_KEYS[k].values.indexOf(val);
  const all = M.findClosest(home.glyphs, lib, { ...EDITOR('roboto-flex'), limit: 60, forms: { [key]: val } });
  const has = r => { if (key === 'a' || key === 'g') { const m = M.majority(lib.facts[fidx(r.font)].votes, key === 'a' ? 0 : 3); if (m) return m - 1 === code; } return lib.form[fidx(r.font) * M.NF + k] === code; };
  const known = r => lib.form[fidx(r.font) * M.NF + k] !== M.UNKNOWN_FORM;
  const top8 = all.slice(0, 8); let lastAgree = -1, firstMiss = 1e9; all.forEach((r, i) => { if (!r.vetoed || !(r.formMisses || []).length) { if (has(r) || !known(r)) lastAgree = i; } if ((r.formMisses || []).length && i < firstMiss) firstMiss = i; });
  const sortedAfter = all.every((r, i) => !(r.formMisses || []).length || all.slice(0, i).every(p => !(p.formMisses || []).length || true)) && firstMiss > Math.max(-1, all.findIndex(r => !(r.formMisses || []).length && false));
  const misses = all.map((r, i) => (r.formMisses || []).length ? i : -1).filter(i => i >= 0), agree = all.map((r, i) => ((r.formMisses || []).length ? -1 : i)).filter(i => i >= 0);
  out.forms[`${key}=${val}`] = { top8Carrying: top8.filter(has).length, top8Contradicting: top8.filter(r => (r.formMisses || []).length).length, agreeingBeforeAllMisses: agree.length ? Math.max(...agree.filter(i => misses.length === 0 || i < misses[0])) + 1 >= (misses[0] ?? 0) : true, firstMissRow: misses[0] ?? null, sampleMiss: all.find(r => (r.formMisses || []).length)?.formMisses?.[0] ?? null, sampleVeto: all.find(r => (r.formMisses || []).length)?.vetoGroups ?? null };
}
// spot checks of the classifier
const FM = (id) => { const i = lib.fonts.findIndex(f => f.familyId === id && f.style === 'normal'); if (i < 0) return null; return Object.fromEntries(M.FORM_KEYS.map((fk, k) => [fk.key, lib.form[i * M.NF + k] === M.UNKNOWN_FORM ? '-' : fk.values[lib.form[i * M.NF + k]]])); };
out.spot = Object.fromEntries(['poppins', 'jost', 'lato', 'open-sans', 'montserrat', 'inter', 'playfair-display', 'lora', 'comfortaa', 'josefin-sans'].map(id => { const f = FM(id); return [id, f && { a: f.a, g: f.g, aTail: f.aTail, tTop: f.tTop, G: f.G, one: f.one }]; }));
// 2. weight words: feet tile, Thick 95
const feet = CL.query('feet', { thick: 0.95 });
function weightCheck(X, optsFn) {
  const q = X.M.measureQuery(feet.glyphs, X.lib); const qn = q.raw[q.letters.indexOf('n')].stemRel;
  const r = X.M.findClosest(feet.glyphs, X.lib, optsFn);
  let off = 0, offSame = 0, n = 0;
  for (const x of r) { const a = A[Q.fileOf(x.font)]?.m?.n?.stemRel; if (!a) continue; n++; const bad = Math.abs(a / qn - 1) > 0.12; if (bad) { off++; if (x.why.matches.includes('weight')) offSame++; } }
  return { rows: n, offMoreThan12pct: off, ofWhichSaySameWeight: offSame };
}
out.weight = { before: weightCheck(OLD, EDITOR('roboto-serif')), after: weightCheck(NEW, EDITOR('roboto-serif')) };
// 3. Lexend widths
out.lexend = {};
for (const [nm, st] of [['plain wide', { wide: 1 }], ['plain thin+wide', { thick: -1, wide: 1 }], ['plain home', {}]]) { const q = CL.query('plain', st); const rn = X => X.M.findClosest(q.glyphs, X.lib, EDITOR('roboto-flex')); const cnt = r => r.filter(x => /^Lexend/.test(x.font.family)).length; out.lexend[nm] = { beforeLexendRows: cnt(rn(OLD)), afterLexendRows: cnt(rn(NEW)), afterAlso: rn(NEW).filter(x => /^Lexend/.test(x.font.family)).map(x => x.font.family + ' also ' + (x.also || []).map(a => a.family).join('/')) }; }
// 4. weak rate and monotone numbers over the 57 clay lists
let rows = 0, weak = 0, up = 0, lists = 0;
for (const c of Q.clayCases(CL.C)) { const q = CL.query(c.fam, c.st); const o = EDITOR(q.f.libraryId); const r = M.findClosest(q.glyphs, lib, o).slice(0, 8); lists++; r.forEach((x, i) => { rows++; if (x.weak) weak++; if (i > 0 && !x.vetoed && !r[i - 1].vetoed && x.match > r[i - 1].match) up++; }); }
out.weakAndOrder = { top8Rows: rows, weakRows: weak, weakShare: +(weak / rows).toFixed(3), numberRisesDownList: up, lists };
// 5. langar self-retrieval miss
{ const f = lib.fonts.find(x => x.familyId === 'langar'); const g = Q.glyphsOf(Q.fileOf(f), true); const r = M.findClosest(g, lib, { limit: 3 }); out.langar = { top3: r.map(x => x.font.family + ':' + x.match), langarFlags: { scriptFirst: f.scriptFirst, script: f.script, mono: f.mono }, withoutAdvances: M.findClosest(Q.glyphsOf(Q.fileOf(f), false), lib, { limit: 2 }).map(x => x.font.family) }; }
console.log(JSON.stringify(out, null, 1));
