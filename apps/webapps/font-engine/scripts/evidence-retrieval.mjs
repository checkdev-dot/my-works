// Evidence part 1: self-retrieval (spike test 1) and sibling test (spike test 2) on the 20% holdout, new vs spike engine,
// plus a small ablation on TRAIN fonts only (never on the holdout) that justified the feature weights.
import path from 'node:path';
import { REPORTS, writeJSON } from './common.mjs';
import { M, lib, A, LETTERS, legacy, LEG_Z, LEG_STATS, fileOf, getFont, emCmds, jitter, rng, famMin, fileRank, famRank, summarise, spikeManifest } from './eval-lib.mjs';

const t0 = Date.now();
const isReg = f => f.weight === 400 || true;
const regularIdx = lib.fonts.map((f, i) => i).filter(i => A[fileOf(lib.fonts[i])].role === 'regular' && !lib.fonts[i].construction);
const holdQ = regularIdx.filter(i => lib.fonts[i].holdout);
const trainQ = regularIdx.filter(i => !lib.fonts[i].holdout);
const nCandFiles = lib.fonts.filter(f => !f.construction).length, nCandFams = new Set(lib.fonts.filter(f => !f.construction).map(f => f.familyId)).size;
console.log('library files', lib.fonts.length, 'candidates', nCandFiles, 'families', nCandFams, 'holdout queries', holdQ.length, 'train queries', trainQ.length);

// ---- measure noisy queries once (spike "variant B": outline jitter 0.010 em, width scale +-4%) ----
function makeQueries(idxs, seed) {
  const r = rng(seed); const out = new Map();
  for (const i of idxs) {
    const f = lib.fonts[i], font = getFont(fileOf(f)), q = { z: {}, raw: {}, leg: {}, legSkip: {} };
    for (const L of LETTERS) {
      const c = emCmds(font, L); if (!c) continue;
      const cj = jitter(c, r);
      const qz = M.measureQuery([{ char: L, commands: cj }], lib);
      if (qz.letters.length) { q.z[L] = qz.z[0]; q.raw[L] = qz.raw[0]; }
      const m = legacy.measure(legacy.rasterise(legacy.toPx(cj, 400), 400));
      if (m) { q.leg[L] = legacy.zvec(L, m, LEG_STATS); q.legSkip[L] = legacy.zvec(L, m, LEG_STATS, legacy.WEIGHT_FEATS); }
    }
    out.set(i, q);
  }
  return out;
}
const HQ = makeQueries(holdQ, 9001), TQ = makeQueries(trainQ.filter((_, k) => k % 3 === 0), 9002);
console.log('queries measured', ((Date.now() - t0) / 1000).toFixed(0) + 's');

const SETS = { a: ['a'], e: ['e'], g: ['g'], n: ['n'], o: ['o'], H: ['H'], O: ['O'], 'n+a+o': ['n', 'a', 'o'], 'all 7': [...LETTERS] };
const newD = (q, letters, opt = {}) => M.distances(lib, { letters, z: letters.map(L => q.z[L]), raw: letters.map(L => q.raw[L]) }, false, opt.skip, opt.scale);
const oldD = (q, letters, skey = 'leg') => { const Ls = letters; return Float64Array.from(lib.fonts, (f, i) => { if (f.construction) return Infinity; let s = 0; for (const L of Ls) { const z = skey === 'leg' ? LEG_Z[i][L] : null; if (!z) return Infinity; s += legacy.dist(q[skey][L], z); } return s / Ls.length; }); }

function retrieval(QS, engine, opt = {}) {
  const res = {};
  for (const [name, letters] of Object.entries(SETS)) {
    const fileRanks = [], famRanks = [];
    for (const [i, q] of QS) {
      if (!letters.every(L => (engine === 'new' ? q.z[L] : q.leg[L]))) continue;
      const d = engine === 'new' ? newD(q, letters, opt) : oldD(q, letters);
      if (!Number.isFinite(d[i])) continue;
      fileRanks.push(fileRank(d, i)); famRanks.push(famRank(d, lib.fonts[i].familyId));
    }
    res[name] = { file: summarise(fileRanks, nCandFiles), family: summarise(famRanks, nCandFams) };
  }
  return res;
}

// ---- 1. holdout retrieval: new vs spike engine on the same (new) library and the same noisy queries ----
const hold = { new: retrieval(HQ, 'new'), spikeEngine: retrieval(HQ, 'old') };

// ---- 2. spike's original 304-font library, all its regular fonts as queries (not holdout; for comparison with the recorded spike numbers) ----
const inSpike = new Set(spikeManifest.map(m => m.id + ':' + m.weight));
const spikeIdx = new Set(lib.fonts.map((f, i) => (inSpike.has(f.familyId + ':' + f.weight) && f.style === 'normal' ? i : -1)).filter(i => i >= 0));
const spikeQ = makeQueries([...spikeIdx].filter(i => lib.fonts[i].weight === 400 && !lib.fonts[i].construction), 9003);
const nSpikeFiles = spikeIdx.size;
function retrievalSubset(QS, engine) {
  const res = {};
  for (const [name, letters] of Object.entries({ n: ['n'], o: ['o'], 'n+a+o': ['n', 'a', 'o'] })) {
    const ranks = [];
    for (const [i, q] of QS) {
      if (!letters.every(L => (engine === 'new' ? q.z[L] : q.leg[L]))) continue;
      const d = engine === 'new' ? newD(q, letters, { skip: j => !spikeIdx.has(j) }) : oldD(q, letters).map((v, j) => spikeIdx.has(j) ? v : Infinity);
      if (!Number.isFinite(d[i])) continue; ranks.push(fileRank(d, i));
    }
    res[name] = summarise(ranks, nSpikeFiles);
  }
  return res;
}
const spike304 = { libraryFiles: nSpikeFiles, queries: spikeQ.size, new: retrievalSubset(spikeQ, 'new'), spikeEngineRerun: retrievalSubset(spikeQ, 'old') };

// ---- 3. siblings: does a Regular find its own Bold? (holdout families with both) ----
const byFam = new Map(); lib.fonts.forEach((f, i) => { if (f.style !== 'normal' || f.construction) return; (byFam.get(f.familyId) ?? byFam.set(f.familyId, {}).get(f.familyId))[A[fileOf(f)].role] = i; });
const pairs = [...byFam.values()].filter(v => v.regular !== undefined && v.bold !== undefined && lib.fonts[v.regular].holdout && A[fileOf(lib.fonts[v.regular])].hash !== A[fileOf(lib.fonts[v.bold])].hash);
function sibling(engine, weightIgnored) {
  const ranks = [];
  for (const p of pairs) {
    const letters = ['n', 'a', 'o']; let d;
    if (engine === 'new') {
      const z = letters.map((L, k) => { const o = p.regular * M.STRIDE + M.LETTERS.indexOf(L) * M.MAX_FEATS; return Array.from(lib.z.subarray(o, o + M.FEATS_BY_LETTER[L].length), v => v / M.Q_STEP); });
      d = M.distances(lib, { letters, z }, false, j => j === p.regular, weightIgnored ? { weight: 0 } : undefined);
    } else {
      const skip = weightIgnored ? legacy.WEIGHT_FEATS : [];
      const f = lib.fonts[p.regular], a = A[fileOf(f)];
      const qz = letters.map(L => legacy.zvec(L, a.legacy[L], LEG_STATS, skip));
      d = Float64Array.from(lib.fonts, (g, j) => { if (g.construction || j === p.regular) return Infinity; let s = 0; for (let k = 0; k < letters.length; k++) { const zz = A[fileOf(g)].legacy[letters[k]]; if (!zz) return Infinity; s += legacy.dist(qz[k], legacy.zvec(letters[k], zz, LEG_STATS, skip)); } return s / letters.length; });
    }
    ranks.push(1 + [...d].filter((v, j) => v < d[p.bold] && j !== p.bold).length);
  }
  const n = ranks.length, srt = ranks.slice().sort((a, b) => a - b);
  return { n, median: srt[Math.floor(n / 2)], top10: +(ranks.filter(r => r <= 10).length / n).toFixed(3), top30: +(ranks.filter(r => r <= 30).length / n).toFixed(3), chanceMedian: Math.round(nCandFiles / 2) };
}
const siblings = { pairs: pairs.length, new_weightIn: sibling('new', false), new_weightIgnored: sibling('new', true), spikeEngine_weightIn: sibling('old', false), spikeEngine_weightIgnored: sibling('old', true) };

// ---- 4. ablation on TRAIN queries only (this is what the chosen weights were checked against) ----
const abl = {};
const configs = {
  'as shipped': undefined,
  'roundness x0.5': { roundness: 0.5 },
  'roundness x0.25': { roundness: 0.25 },
  'no roundness group': { roundness: 0 },
  'no serif group': { serifs: 0 },
  'no pen-written group': { pen: 0 },
  'no open-shapes group': { open: 0 },
  'no weight group (shape-only)': { weight: 0 },
  'weight+open+roundness off (spike-equivalent shape check)': { weight: 0, open: 0, roundness: 0 },
  'p=2 norm': { _p: 2 },
  'p=2 norm, roundness x0.25': { _p: 2, roundness: 0.25 }
};
for (const [name, cfg] of Object.entries(configs)) {
  const { _p, ...scale0 } = cfg || {}; const scale = cfg ? scale0 : undefined; M.TUNE.p = _p || 4;
  const r = {};
  for (const key of ['n', 'n+a+o', 'all 7']) {
    const fam = []; for (const [i, q] of TQ) { const letters = SETS[key]; if (!letters.every(L => q.z[L])) continue; const d = newD(q, letters, { scale }); fam.push(famRank(d, lib.fonts[i].familyId)); }
    r[key] = summarise(fam, nCandFams);
  }
  abl[name] = r;
}
M.TUNE.p = 4;
// ---- gate flips on noise, and the real use case (clean outlines of holdout fonts, own family excluded) ----
let flips = 0, flipN = 0;
for (const [i, q] of HQ) { const letters = SETS['all 7']; if (!letters.every(L => q.z[L])) continue; flipN++; if (M.buildMismatch(lib, { letters, z: letters.map(L => q.z[L]), raw: letters.map(L => q.raw[L]) }, i).length) flips++; }
const real = []; const rr = [];
for (const i of holdQ.filter((_, k) => k % 2 === 0)) {
  const f = lib.fonts[i], font = getFont(fileOf(f));
  const glyphs = LETTERS.map(L => ({ char: L, commands: emCmds(font, L) })).filter(g => g.commands);
  const res = M.findClosest(glyphs, lib, { limit: 5, exclude: [f.familyId] });
  if (res.length) rr.push({ match: res[0].match, weak: res[0].weak });
}
rr.sort((a, b) => a.match - b.match);
const realUse = { queries: rr.length, top1MatchMedian: rr[Math.floor(rr.length / 2)]?.match, p25: rr[Math.floor(rr.length * 0.25)]?.match, p75: rr[Math.floor(rr.length * 0.75)]?.match, weakRate: +(rr.filter(x => x.weak).length / rr.length).toFixed(3) };
console.log('GATE FLIPS on jittered own font', flips + '/' + flipN, ' REAL USE (clean outlines, own family excluded)', JSON.stringify(realUse));
const out = { gateFlips: { flips, n: flipN }, realUse, seconds: (Date.now() - t0) / 1000, library: { files: lib.fonts.length, matchableFiles: nCandFiles, families: nCandFams }, holdoutQueries: HQ.size, holdout: hold, spike304, siblings, ablationTrain: { queries: TQ.size, results: abl } };
writeJSON(path.join(REPORTS, 'evidence-retrieval.json'), out, true);
const row = (s) => `${(s.top1 * 100).toFixed(0)}/${(s.top5 * 100).toFixed(0)}/${(s.top10 * 100).toFixed(0)} med ${s.median}`;
console.log('\nHOLDOUT (top1/top5/top10 %, median rank), file-level then family-level');
for (const k of Object.keys(SETS)) console.log(k.padEnd(6), 'NEW file', row(hold.new[k].file).padEnd(24), 'fam', row(hold.new[k].family).padEnd(24), '| SPIKE file', row(hold.spikeEngine[k].file).padEnd(24), 'fam', row(hold.spikeEngine[k].family));
console.log('\nSPIKE-304 lib'); for (const k in spike304.new) console.log(k, 'new', row(spike304.new[k]), '| spike rerun', row(spike304.spikeEngineRerun[k]));
console.log('\nSIBLINGS', JSON.stringify(siblings));
console.log('\nABLATION (train, family-level top1/5/10)'); for (const [k, v] of Object.entries(abl)) console.log(k.padEnd(40), 'n', row(v.n), '| n+a+o', row(v['n+a+o']), '| all', row(v['all 7']));
console.log('done', out.seconds.toFixed(0) + 's');
