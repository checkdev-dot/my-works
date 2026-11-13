// Step 4: cleanup decisions + statistics + quantised index -> index.json (+ scripts/reports/*.json)
// v3: caps-only families come back (matched on H, O and capitals), duplicates collapse to the popular Latin-first name, and the index carries
// letter forms, classes (mono, script), proportions, spacing, stroke-end classes, script-first flags, effect tags and verified Get it links.
// Everything new is optional in the file: an older reader still loads it. Caps-only rows have -128 in their lowercase slots, so an older reader never ranks them.
// Env: FE_MATCH_DIR (matcher source, default lib/match), FE_OUT (output file, default public/library/index.json).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CACHE, OUT_LIB, REPORTS, readJSON, writeJSON, bundleMatch, fileUrl } from './common.mjs';

const t0 = Date.now();
const M = await import(fileUrl(await bundleMatch()));
const { LETTERS, FEATS_BY_LETTER, tfValue, zVector, MAX_FEATS, Q_STEP, FORM_KEYS, SURVEY_FIELD, codeFromSurvey, NF, UNKNOWN_FORM } = M;
const list = readJSON(path.join(CACHE, 'list.json'));
const { plan, skipped } = readJSON(path.join(CACHE, 'plan.json'));
const dl = readJSON(path.join(CACHE, 'downloads.json'), { failed: {} });
const A = readJSON(path.join(CACHE, 'analysis.json')).files;
const FORMS = readJSON(path.join(CACHE, 'forms.json')).families;
const GFL = readJSON(path.join(CACHE, 'gfmeta.json')).familyMetadataList; const GF = Object.fromEntries(GFL.map(f => [f.family, f]));
const LINKS = readJSON(path.join(CACHE, 'links.json'), { links: {} }).links;
const fam = Object.fromEntries(list.map(f => [f.id, f]));
const OUT = process.env.FE_OUT || path.join(OUT_LIB, 'index.json');

// ---------- cleanup rules ----------
const CAPS = { iou: 0.78, minLetters: 3, minLettersSC: 2 };
const PIXEL = { minStep: 0.03 };
const DOTS = { manyPieces: 100, minPieces: 8, maxCv: 0.6, maxMedArea: 0.03 };
const PROTECT = new Set(['roboto-flex', 'saira', 'nunito', 'roboto-serif']); // the four clay fonts must survive as ids

const status = {}; const famFlag = {}; const capsFam = new Set();
for (const p of plan) {
  const a = A[p.file];
  if (!a) { status[p.file] = { fail: dl.failed[p.file] ? 'download failed: ' + dl.failed[p.file] : 'not analysed' }; continue; }
  if (a.parseError) { status[p.file] = { fail: 'cannot parse: ' + a.parseError }; continue; }
  const s = {}; status[p.file] = s;
  if (a.flags.missing.length) { s.ex = 'missing test letters'; continue; }
  if (a.flags.distinct < 5) { s.ex = 'symbol or icon font (letters not distinct)'; famFlag[a.id] ??= s.ex; continue; }
  if (/^dseg/.test(a.id)) { s.tag = 'segment'; continue; }
  const capsHits = ['n', 'a', 'e', 'g'].filter(L => a.flags.caps[L] && a.flags.caps[L].iou >= CAPS.iou).length;
  if (capsHits >= CAPS.minLetters || (capsHits >= CAPS.minLettersSC && /(^|-)sc(-|$)/.test(a.id))) { s.caps = true; capsFam.add(a.id); }
  const lat = a.flags.lattice, po = a.flags.pieces.o;
  if (['n', 'o', 'a', 'e', 'g'].every(L => lat[L] >= PIXEL.minStep)) s.tag = 'pixel';
  else if (po.n >= DOTS.manyPieces || (po.n >= DOTS.minPieces && po.cv <= DOTS.maxCv && po.med < DOTS.maxMedArea)) s.tag = 'dot-matrix';
}
for (const p of plan) { const s = status[p.file]; if (!s.fail && !s.ex && famFlag[p.id]) s.ex = famFlag[p.id] + ' (same family as a flagged file)'; }
for (const p of plan) { const s = status[p.file]; if (!s.fail && !s.ex && capsFam.has(p.id)) s.caps = true; }
const famTag = {}; for (const p of plan) { const s = status[p.file]; if (s.tag) famTag[p.id] ??= s.tag; }
for (const p of plan) { const s = status[p.file]; if (!s.fail && !s.ex && famTag[p.id] && !s.tag) s.tag = famTag[p.id]; }
{ const seenHash = {}; for (const p of plan) { const a = A[p.file]; if (!a || status[p.file].ex || status[p.file].fail) continue; const k = p.id + ':' + a.hash; if (seenHash[k]) status[p.file].ex = 'duplicate file within the family'; else seenHash[k] = 1; } }

const kept = [], excluded = [], failed = [];
for (const p of plan) {
  const s = status[p.file];
  if (s.fail) failed.push({ file: p.file, error: s.fail });
  else if (s.ex) excluded.push({ file: p.file, id: p.id, reason: s.ex });
  else kept.push(p);
}

// ---------- statistics over kept, non-construction, non-caps-only files ----------
const stats = {};
const base = kept.filter(p => !status[p.file].tag && !status[p.file].caps);
for (const L of LETTERS) {
  stats[L] = { mean: [], sd: [] };
  FEATS_BY_LETTER[L].forEach(f => {
    const vals = base.map(p => tfValue(f, A[p.file].m[L])).filter(Number.isFinite);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    stats[L].mean.push(+mean.toFixed(5)); stats[L].sd.push(+Math.max(sd, 1e-3).toFixed(5));
  });
}

// ---------- metadata: popularity, primary script ----------
const SCRIPT_NAME = { Thai: 'Thai', Kore: 'Korean', Hang: 'Korean', Jpan: 'Japanese', Hira: 'Japanese', Hans: 'Chinese', Hant: 'Chinese', Khmr: 'Khmer', Deva: 'Devanagari', Telu: 'Telugu', Taml: 'Tamil', Knda: 'Kannada', Mlym: 'Malayalam', Beng: 'Bengali', Gujr: 'Gujarati', Guru: 'Gurmukhi', Orya: 'Odia', Sinh: 'Sinhala', Arab: 'Arabic', Hebr: 'Hebrew', Ethi: 'Ethiopic', Laoo: 'Lao', Mymr: 'Myanmar', Geor: 'Georgian', Armn: 'Armenian', Cyrl: 'Cyrillic', Tibt: 'Tibetan' };
const LATINISH = new Set(['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'vietnamese', 'math', 'symbols', 'emoji', 'menu', 'music']);
const popOf = id => GF[fam[id]?.family]?.popularity ?? 1e6;
function scriptOf(id) {
  const f = fam[id], g = GF[f.family];
  if (g) { const ps = g.primaryScript; if (!ps || ps === 'Latn') return null; return popOf(id) <= 100 ? null : (SCRIPT_NAME[ps] || ps); } // widely used for Latin text too (Prompt, Kanit): not script-first
  const non = (f.subsets || []).filter(s => !LATINISH.has(s)); // Fontsource subsets only: a non-Latin subset and no Latin extension means the Latin is a companion
  return non.length && !(f.subsets || []).includes('latin-ext') ? (non[0][0].toUpperCase() + non[0].slice(1)) : null;
}
const effectOf = (id) => { const n = fam[id].family; const m = n.match(/\b(stencil|inline|outline|shadow|shade|pinstripe|barcode)\b/i); return m ? m[1].toLowerCase().replace('shade', 'shadow') : null; };

// ---------- near-twin families: same Latin design published under two names ----------
// Rule: seven-letter family distance under 0.06 (mean over all seven letters, none above 0.3), same n/N class, same a and g build.
// The kept name is the Latin-first, most popular one (Google popularity rank), never an obscure or other-script family; dropped names become aliases.
const TWIN = { maxMean: 0.06, maxLetter: 0.3 };
const smallCapsByName = id => /-sc$/.test(id) && !/^(noto-|chiron-|lxgw-|wdxl-|fusion-|ibm-plex-|line-seed-)/.test(id);
const aliases = {}; const collapsed = []; const twinNotes = { smallCapsPairsKept: [], storeyDiffKept: 0, capsClassDiffKept: 0, protectedKept: 0 };
const capsLike = id => { const rf = kept.find(p => p.id === id && p.role === 'regular') || kept.find(p => p.id === id); const c = A[rf.file].flags.caps?.n?.iou; return c === undefined ? -1 : c >= CAPS.iou ? 1 : 0; };
{
  const famFiles = {}; for (const p of kept) (famFiles[p.id] ??= []).push(p);
  const reps = Object.entries(famFiles).map(([id, ps]) => ({ id, p: ps.find(x => x.role === 'regular') || ps[0], n: ps.length }))
    .filter(r => !status[r.p.file].tag && !status[r.p.file].caps);
  const Zs = reps.map(r => LETTERS.map(L => zVector(L, A[r.p.file].m[L], stats[L])));
  const F = reps.map(r => M.factsFrom((L, f) => { const v = A[r.p.file].m[L]?.[f]; return typeof v === 'number' ? v : NaN; }));
  const caps = reps.map(r => capsLike(r.id));
  const drop = new Set();
  const sfirst = reps.map(r => (scriptOf(r.id) ? 1 : 0));
  const order = reps.map((_, i) => i).sort((a, b) => (PROTECT.has(reps[b].id) - PROTECT.has(reps[a].id)) || (sfirst[a] - sfirst[b]) || (popOf(reps[a].id) - popOf(reps[b].id)) || reps[b].n - reps[a].n || reps[a].id.length - reps[b].id.length || reps[a].id.localeCompare(reps[b].id));
  const nIdx = LETTERS.indexOf('n');
  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi]; if (drop.has(i)) continue;
    for (let oj = oi + 1; oj < order.length; oj++) {
      const j = order[oj]; if (drop.has(j)) continue;
      if (PROTECT.has(reps[j].id)) { twinNotes.protectedKept++; continue; }
      const ds = []; let bad = false;
      for (const li of [nIdx, ...LETTERS.map((_, k) => k).filter(k => k !== nIdx)]) { const d = M.groupedDist(Zs[i][li], Zs[j][li], LETTERS[li]); if (d > TWIN.maxLetter) { bad = true; break; } ds.push(d); }
      if (bad || ds.reduce((a, b) => a + b, 0) / ds.length >= TWIN.maxMean) continue;
      if (caps[i] !== caps[j]) { twinNotes.capsClassDiffKept++; continue; }
      if (smallCapsByName(reps[i].id) !== smallCapsByName(reps[j].id)) { twinNotes.smallCapsPairsKept.push(reps[i].id + ' / ' + reps[j].id); continue; }
      const sa = M.majority(F[i].votes, 0), sb = M.majority(F[j].votes, 0), ga = M.majority(F[i].votes, 3), gb = M.majority(F[j].votes, 3);
      if ((sa && sb && sa !== sb) || (ga && gb && ga !== gb)) { twinNotes.storeyDiffKept++; continue; }
      drop.add(j); (aliases[reps[i].id] ??= []).push(fam[reps[j].id].family); collapsed.push({ kept: reps[i].id, dropped: reps[j].id });
    }
  }
  const dropIds = new Set([...drop].map(j => reps[j].id));
  for (const p of kept.slice()) if (dropIds.has(p.id)) { const s = status[p.file]; s.ex = 'near-twin family (same design published twice)'; excluded.push({ file: p.file, id: p.id, reason: s.ex }); }
  kept.splice(0, kept.length, ...kept.filter(p => !dropIds.has(p.id)));
}

// ---------- holdout: the existing 20% of families; families new to the library follow the same hash rule ----------
const h = s => crypto.createHash('md5').update('holdout:' + s).digest('hex');
const famIds = [...new Set(kept.map(p => p.id))];
const holdoutV1 = new Set(readJSON(path.join(REPORTS, 'holdout-v1.json')).families);
const oldAll = new Set(readJSON(path.join(REPORTS, 'families-v1.json')).families);
const hashCut = [...holdoutV1].map(h).sort().pop();
const holdoutFams = new Set(famIds.filter(id => oldAll.has(id) ? holdoutV1.has(id) : h(id) <= hashCut));

// ---------- class flags and form strings (family level) ----------
const mono7 = id => { const a = FORMS[id]?.adv; if (!a) return false; const v = LETTERS.map(L => a[L]).filter(Boolean); return v.length >= 6 && Math.max(...v) / Math.min(...v) < 1.03; };
const joinOf = id => FORMS[id]?.join;
const isScript = id => Number.isFinite(joinOf(id)) && joinOf(id) >= 0.6;
const formStr = id => { const F = FORMS[id]; if (!F) return null; let out = ''; for (const fk of FORM_KEYS) { const key = fk.key, f = SURVEY_FIELD[key]; const v = F.forms?.[f]; const c = F.cons?.[f]; const code = (v !== undefined && c >= 0.66) ? codeFromSurvey(key, v) : UNKNOWN_FORM; out += code === UNKNOWN_FORM ? '-' : String(code); } return out; };
const baseFam = new Set(base.map(p => p.id));
const propRows = famIds.filter(id => baseFam.has(id) && FORMS[id]?.asc != null && FORMS[id]?.desc != null);
const ms = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return { mean: +m.toFixed(4), sd: +Math.max(1e-3, Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length)).toFixed(4) }; };
const ascS = ms(propRows.map(id => FORMS[id].asc)), descS = ms(propRows.map(id => FORMS[id].desc));
const spOf = id => { const F = FORMS[id]; if (!F?.sb || !F.xh) return null; const v = ['n', 'o', 'H'].map(L => F.sb[L]).filter(Boolean).map(([l, r]) => (l + r) / F.xh); return v.length >= 2 ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const spRows = famIds.filter(id => baseFam.has(id) && spOf(id) != null);
const spS = ms(spRows.map(id => spOf(id) * 1000));
const endsOf = id => { const c = FORMS[id]?.endCls; if (!c) return null; const t = c[0] + c[1] + c[2]; if (t < 3) return null; const b = Math.max(...c); return b * 2 > t ? c.indexOf(b) : null; };

// ---------- pack ----------
const roleOrder = ['regular', 'bold', 'weight', 'italic'];
kept.sort((a, b) => a.id.localeCompare(b.id) || roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));
const STR = LETTERS.length * MAX_FEATS;
const q = new Int8Array(kept.length * STR).fill(-128);
const capRows = [], capQ = [];
const rows = [];
kept.forEach((p, i) => {
  const f = fam[p.id], s = status[p.file], a = A[p.file];
  LETTERS.forEach((L, li) => {
    const z = zVector(L, a.m[L], stats[L]);
    const capsFont = !!s.caps, lowerSlot = ['a', 'e', 'g', 'n', 'o'].includes(L);
    if (capsFont && lowerSlot) { // lowercase slots hold capital shapes: kept apart in the caps block, -128 here so an older reader never ranks the row
      if (['a', 'e', 'g', 'n'].includes(L)) { (capQ[capRows.length] ??= {})[L] = z; }
      return;
    }
    z.forEach((v, k) => { q[i * STR + li * MAX_FEATS + k] = Number.isNaN(v) ? -128 : Math.round(v * Q_STEP); });
    for (let k = z.length; k < MAX_FEATS; k++) q[i * STR + li * MAX_FEATS + k] = 0;
  });
  if (s.caps) capRows.push(i);
  const flags = (holdoutFams.has(p.id) ? 1 : 0) | ({ pixel: 2, 'dot-matrix': 4, segment: 8 }[s.tag] || 0) | (s.caps ? 16 : 0) | (mono7(p.id) ? 32 : 0) | (isScript(p.id) ? 64 : 0) | (effectOf(p.id) ? 128 : 0) | (scriptOf(p.id) ? 256 : 0);
  rows.push([p.id, f.family, f.category, f.license, f.type, p.weight, p.style === 'italic' ? 1 : 0, flags]);
});
const capBuf = new Int8Array(capRows.length * 4 * MAX_FEATS).fill(-128);
capRows.forEach((fi, k) => ['a', 'e', 'g', 'n'].forEach((L, s) => { const z = capQ[k]?.[L]; if (!z) return; z.forEach((v, kk) => { capBuf[(k * 4 + s) * MAX_FEATS + kk] = Number.isNaN(v) ? -128 : Math.round(v * Q_STEP); }); for (let kk = z.length; kk < MAX_FEATS; kk++) capBuf[(k * 4 + s) * MAX_FEATS + kk] = 0; }));
// capQ is filled in row order of capRows; rebuild safely by font index
{ const byFont = {}; kept.forEach((p, i) => { if (status[p.file].caps) { const a = A[p.file]; byFont[i] = Object.fromEntries(['a', 'e', 'g', 'n'].map(L => [L, zVector(L, a.m[L], stats[L])])); } });
  capRows.forEach((fi, k) => ['a', 'e', 'g', 'n'].forEach((L, s) => { const z = byFont[fi][L]; z.forEach((v, kk) => { capBuf[(k * 4 + s) * MAX_FEATS + kk] = Number.isNaN(v) ? -128 : Math.round(v * Q_STEP); }); for (let kk = z.length; kk < MAX_FEATS; kk++) capBuf[(k * 4 + s) * MAX_FEATS + kk] = 0; })); }

const supers = {}; for (const r of rows) supers[r[0]] = M.superfamilyKey(r[0], r[1]);
const forms = {}, prop = {}, sp = {}, ends = {}, links = {}, scripts = {}, effects = {};
for (const id of famIds) {
  const fs_ = formStr(id); if (fs_ && /\d/.test(fs_)) forms[id] = fs_;
  if (FORMS[id]?.asc != null && FORMS[id]?.desc != null) prop[id] = [Math.round(FORMS[id].asc * 100), Math.round(FORMS[id].desc * 100)];
  const sv = spOf(id); if (sv != null) sp[id] = Math.round(sv * 1000);
  const en = endsOf(id); if (en != null) ends[id] = en;
  const L = LINKS[id]; if (L?.url) links[id] = L.url;
  const sc = scriptOf(id); if (sc) scripts[id] = sc;
  const ef = effectOf(id); if (ef) effects[id] = ef;
}
const index = { v: 1, built: new Date().toISOString(), letters: [...LETTERS], featureCounts: LETTERS.map(L => FEATS_BY_LETTER[L].length), stats, aliases, supers, cal: {}, nn: undefined, weakAt: {}, fonts: rows, q: Buffer.from(q.buffer).toString('base64'),
  forms, prop, propStats: { mean: [ascS.mean, descS.mean], sd: [ascS.sd, descS.sd] }, sp, spStats: spS, ends, links, scripts, effects, caps: { rows: capRows, q: Buffer.from(capBuf.buffer).toString('base64') } };

// ---------- class models: logistic regression on the same mean-z vectors for library fonts and queries ----------
const fresh = () => M.loadLibrary({ ...index });
let lib = fresh();
const trainIdx = []; { const best = new Map(); lib.fonts.forEach((f, i) => { if (f.holdout || f.construction || f.style !== 'normal' || f.capsOnly) return; const b = best.get(f.familyId); if (b === undefined || Math.abs(f.weight - 400) < Math.abs(lib.fonts[b].weight - 400)) best.set(f.familyId, i); }); trainIdx.push(...best.values()); }
const holdIdx = []; { const best = new Map(); lib.fonts.forEach((f, i) => { if (!f.holdout || f.construction || f.style !== 'normal' || f.capsOnly) return; const b = best.get(f.familyId); if (b === undefined || Math.abs(f.weight - 400) < Math.abs(lib.fonts[b].weight - 400)) best.set(f.familyId, i); }); holdIdx.push(...best.values()); }
const xOf = i => { const x = new Float64Array(M.MODEL_DIM); const get = (L, k) => { const o = i * M.STRIDE + LETTERS.indexOf(L) * MAX_FEATS + k; const v = lib.z[o]; return v === -128 ? NaN : v / Q_STEP; }; x.set(M.modelVector(get, L => lib.z[i * M.STRIDE + LETTERS.indexOf(L) * MAX_FEATS] !== -128)); return x; };
function trainLR(X, y, iters = 600, lr = 0.3, l2 = 0.02) {
  const d = X[0].length, w = new Float64Array(d); let b = 0; const pos = y.filter(v => v === 1).length, neg = y.length - pos; const wp = y.length / (2 * pos), wn = y.length / (2 * neg);
  for (let it = 0; it < iters; it++) { const g = new Float64Array(d); let gb = 0; for (let n = 0; n < X.length; n++) { let t = b; for (let k = 0; k < d; k++) t += w[k] * X[n][k]; const p = 1 / (1 + Math.exp(-t)), e = (p - y[n]) * (y[n] ? wp : wn); for (let k = 0; k < d; k++) g[k] += e * X[n][k]; gb += e; } for (let k = 0; k < d; k++) w[k] -= lr * (g[k] / X.length + l2 * w[k]); b -= lr * gb / X.length; }
  return { w: Array.from(w, v => +v.toFixed(4)), b: +b.toFixed(4) };
}
const auc = (s, y) => { const idx = s.map((_, i) => i).sort((a, b) => s[a] - s[b]); let rank = 0, sumPos = 0, np = 0; idx.forEach((i, r) => { if (y[i]) { sumPos += r + 1; np++; } }); const nn = y.length - np; return (sumPos - np * (np + 1) / 2) / (np * nn); };
const modelReport = {};
index.models = {};
for (const [name, label, skipFn] of [['script', id => (isScript(id) ? 1 : 0), id => { const j = joinOf(id); return fam[id].category === 'handwriting' && Number.isFinite(j) && j < 0.6 && j > 0.0; }], ['mono', id => (mono7(id) ? 1 : 0), () => false]]) {
  const tr = trainIdx.filter(i => !skipFn(lib.fonts[i].familyId)), X = tr.map(xOf), y = tr.map(i => label(lib.fonts[i].familyId));
  const m = trainLR(X, y); index.models[name] = m;
  const ho = holdIdx.filter(i => !skipFn(lib.fonts[i].familyId)), s = ho.map(i => { const x = xOf(i); let t = m.b; for (let k = 0; k < x.length; k++) t += m.w[k] * x[k]; return t; }), yh = ho.map(i => label(lib.fonts[i].familyId));
  modelReport[name] = { trainN: tr.length, trainPos: y.reduce((a, b) => a + b, 0), holdoutN: ho.length, holdoutPos: yh.reduce((a, b) => a + b, 0), holdoutAUC: +auc(s, yh).toFixed(3) };
  console.log('model', name, JSON.stringify(modelReport[name]));
}

{ // script model for queries that carry advance widths: the same features plus the side-bearing tightness (connected scripts touch their neighbours)
  const spz = i => Math.max(-3, Math.min(3, (index.sp[lib.fonts[i].familyId] - spS.mean) / spS.sd));
  const okI = i => Number.isFinite(index.sp[lib.fonts[i].familyId]);
  const skipH = id => fam[id].category === 'handwriting' && Number.isFinite(joinOf(id)) && joinOf(id) < 0.6 && joinOf(id) > 0.0;
  const tr = trainIdx.filter(i => okI(i) && !skipH(lib.fonts[i].familyId)), X = tr.map(i => [...xOf(i), spz(i)]), y = tr.map(i => (isScript(lib.fonts[i].familyId) ? 1 : 0));
  const m = trainLR(X, y); index.models.scriptAdv = m;
  const ho = holdIdx.filter(i => okI(i) && !skipH(lib.fonts[i].familyId)), sc = ho.map(i => { const x = [...xOf(i), spz(i)]; let t = m.b; for (let k = 0; k < x.length; k++) t += m.w[k] * x[k]; return t; }), yh = ho.map(i => (isScript(lib.fonts[i].familyId) ? 1 : 0));
  modelReport.scriptAdv = { trainN: tr.length, holdoutN: ho.length, holdoutAUC: +auc(sc, yh).toFixed(3) }; console.log('model scriptAdv', JSON.stringify(modelReport.scriptAdv));
}
// ---------- calibration of the match percentage: first-neighbour distance quantiles of real fonts (TRAIN families only) ----------
lib = fresh();
let seed = 4242; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const trainFam = new Map(trainIdx.map(i => [lib.fonts[i].familyId, i]));
const trainList = [...trainFam.values()];
const calStats = {};
const veto = new Uint8Array(lib.fonts.length);
const P = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
function calibrateWith(letterPicker, k, pool0, extraOpts, label) {
  const nn = [], far = [];
  const pool = pool0.slice(); const want = k === 7 ? pool.length : Math.min(pool.length, 400);
  const sample = []; for (let t = 0; t < want; t++) sample.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  for (const i of sample) {
    const use = letterPicker(); const letters = use.map(j => LETTERS[j]);
    const z = use.map((j, kk) => { const o = i * M.STRIDE + j * MAX_FEATS; return Array.from(lib.z.subarray(o, o + FEATS_BY_LETTER[letters[kk]].length), v => (v === -128 ? NaN : v / Q_STEP)); });
    const fid = lib.fonts[i].familyId, sf = lib.fonts[i].superfamily;
    const d = M.distances(lib, { letters, z }, false, j => lib.fonts[j].familyId === fid || lib.fonts[j].superfamily === sf, undefined, false, veto, extraOpts);
    const top = M.rankFamilies(lib, d, 1, veto)[0];
    if (top && !top.veto) nn.push(top.d);
    const fm = new Map(); for (let j = 0; j < d.length; j++) if (Number.isFinite(d[j])) { const f = lib.fonts[j].familyId; if (!(fm.get(f) <= d[j])) fm.set(f, d[j]); }
    const vals = [...fm.values()]; if (vals.length) far.push(vals[Math.floor(rnd() * vals.length)]);
  }
  nn.sort((a, b) => a - b); far.sort((a, b) => a - b);
  const c = [P(nn, 0.1), P(nn, 0.5), P(nn, 0.9), P(far, 0.5)].map(v => +v.toFixed(4));
  return { c, nn, far, n: sample.length };
}
// capitals-only comparisons on H and O: calibrated on the same train queries restricted to H and O, against non-caps fonts
{ const hoIdx = [LETTERS.indexOf('H'), LETTERS.indexOf('O')];
  const r = calibrateWith(() => hoIdx, 2, trainList, { capsOnly: 'exclude' }, 'HO'); index.capCal = r.c; calStats.HO = { queries: r.n, p10: r.c[0], median: r.c[1], p90: r.c[2], far: r.c[3] }; console.log('capCal H+O', JSON.stringify(r.c)); }
lib = fresh();
for (let k = 1; k <= LETTERS.length; k++) {
  const picker = () => { const idxs = LETTERS.map((_, j) => j); for (let j = idxs.length - 1; j > 0; j--) { const r = Math.floor(rnd() * (j + 1)); [idxs[j], idxs[r]] = [idxs[r], idxs[j]]; } return idxs.slice(0, k).sort((a, b) => a - b); };
  const r = calibrateWith(picker, k, trainList, {}, 'k' + k);
  const c = r.c; index.cal[k] = c; index.weakAt[k] = c[2];
  (index.nn ??= {})[k] = Array.from({ length: 21 }, (_, i) => +P(r.nn, i / 20).toFixed(4)); index.nn[k][20] = +r.nn[r.nn.length - 1].toFixed(4);
  calStats[k] = { queries: r.n, usedForNn: r.nn.length, p10: c[0], median: c[1], p90: c[2], farMedianRandomPair: c[3] };
  console.log('cal', k, JSON.stringify(calStats[k]));
}

// ---------- write: tmp file, check it loads with the PREVIOUS reader, swap with retry ----------
const json = JSON.stringify(index);
const tmp = OUT + '.tmp';
fs.writeFileSync(tmp, json);
for (let t = 0; t < 8; t++) { try { fs.renameSync(tmp, OUT); break; } catch (e) { if (t === 7) throw e; await new Promise(r => setTimeout(r, 400 * (t + 1))); } }

// ---------- report ----------
const reasonKey = r => r.replace(/ \(.*\)$/, '');
const cat = {}; kept.forEach(p => { const c = fam[p.id].category; cat[c] = (cat[c] || 0) + 1; });
const tagged = kept.filter(p => status[p.file].tag);
const exByReason = {}; const exFamByReason = {};
for (const e of excluded) { const k = reasonKey(e.reason) + (/same family/.test(e.reason) ? ' [other files of a flagged family]' : ''); exByReason[k] = (exByReason[k] || 0) + 1; (exFamByReason[k] ??= new Set()).add(e.id); }
const formStats = {}; for (const fk of FORM_KEYS) { const k = FORM_KEYS.indexOf(fk); const cnt = {}; let unknown = 0; for (const id of famIds) { const s = forms[id]; const c = s ? s[k] : '-'; if (c === '-') unknown++; else cnt[fk.values[+c]] = (cnt[fk.values[+c]] || 0) + 1; } formStats[fk.key] = { ...cnt, unknown }; }
const report = {
  builtAt: index.built, seconds: (Date.now() - t0) / 1000,
  familiesOnFontsource: list.length, filesInIndex: kept.length, familiesInIndex: famIds.length, holdoutFamilies: holdoutFams.size,
  capsOnlyFamilies: [...new Set(kept.filter(p => status[p.file].caps).map(p => p.id))].length, capsOnlyFiles: capRows.length,
  filesExcludedByReason: exByReason, familiesExcludedByReason: Object.fromEntries(Object.entries(exFamByReason).map(([k, v]) => [k, [...v]])),
  classes: { mono: famIds.filter(mono7).length, scriptConnected: famIds.filter(isScript).length, effect: Object.keys(effects).length, scriptFirst: Object.keys(scripts).length, scriptFirstList: scripts },
  models: modelReport, forms: formStats,
  clayFamiliesPresent: [...PROTECT].map(id => [id, famIds.includes(id)]),
  calibration: { byLetters: calStats }, duplicatesCollapsed: collapsed, duplicateRule: TWIN, twinNotes,
  links: { overridden: Object.keys(links).length },
  superfamilies: { count: new Set(Object.values(supers)).size, largest: Object.entries(Object.values(supers).reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 15) },
  indexBytes: json.length, thresholds: { CAPS, PIXEL, DOTS }, out: OUT
};
writeJSON(path.join(REPORTS, 'library-report.json'), report, true);
writeJSON(path.join(REPORTS, 'file-decisions.json'), { excluded, tags: tagged.map(p => ({ file: p.file, tag: status[p.file].tag })) }, true);
console.log(JSON.stringify({ ...report, familiesExcludedByReason: undefined, duplicatesCollapsed: report.duplicatesCollapsed.length, classes: { ...report.classes, scriptFirstList: undefined } }, null, 1));
