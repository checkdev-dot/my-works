// Multi-letter query -> closest real fonts, one row per lineage. Scores never leave this module's public surface.
// Loop: (1) gates, only for what the person declared (upright vs italic style, declared letter forms and storeys, a declared mono or script class),
// (2) grouped attribute distance with a p=2 norm over the query letters (plus proportion and spacing when the query carries them),
// (3) soft penalties (class mismatch, script-first, capitals-only, effect fonts) and vetoes (a group far off, a different serif or end class, a hard form),
// (4) family grouping, then one row per lineage ("also" lists the rest), at most one script-first family, (5) match percentage, (6) words.
// Hard facts rank a family after every family that agrees. Anything the person did not declare is "either".
import { GROUPS, LETTERS, MAX_FEATS, Q_STEP, TUNE, VETO, FEATS_BY_LETTER, groupedDist, rawFromZ, zVector, type GroupId, type Letter } from './features';
import { factsFrom, majority, votesAgainst, STOREY_PENALTY, type Facts } from './facts';
import { isLibrary, loadLibrary, modelP, modelVector, STRIDE, type Library, type LibraryIndex } from './library';
import { bounds, measureGlyph, xHeightRatio, type Measures } from './measure';
import { FORM_KEYS, FORM_INDEX, NF, UNKNOWN_FORM, softCost, type FormKey } from './forms';
import type { CanvasFactory, FindOptions, MatchResult, QueryGlyph } from './types';
import { explain } from './why';

/** raw = measures from outlines; absent when a query is built from stored vectors (then facts are decoded from z). storey = declared build of a and g (a known fact). */
export type QueryZ = {
  letters: Letter[]; z: number[][]; raw?: Measures[]; storey?: { a?: 1 | 2; g?: 1 | 2 };
  /** Capitals the query carries (A E G N), z-scored as the lowercase letter of the same name. Compared only with capitals-only families. */
  cap?: { letters: Letter[]; z: number[][] };
  /** Advance widths (em) of the query letters, when the glyphs carried them. */
  adv?: Partial<Record<Letter, number>>;
  /** Ascender and descender over x-height from l/b/d/h/k and p/q/y/j when the query has them; spacing tightness from the advances of n, o, H. */
  asc?: number; desc?: number; spacing?: number;
};
const CAP_CHARS: Record<string, Letter> = { A: 'a', E: 'e', G: 'g', N: 'n' };
const median = (a: number[]) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };

/** Measure the query letters (those the library knows: a e g n o H O, and capitals A E G N) in the canonical frame and standardise against library stats. */
export function measureQuery(glyphs: QueryGlyph[], lib: Library, canvas?: CanvasFactory): QueryZ {
  const byChar = new Map<string, QueryGlyph>();
  for (const g of glyphs) if (g.commands?.length) byChar.set(g.char, g);
  const xr = xHeightRatio(byChar.get('n')?.commands, byChar.get('H')?.commands);
  const letters: Letter[] = [], z: number[][] = [], raw: Measures[] = [], adv: Partial<Record<Letter, number>> = {};
  for (const L of LETTERS) {
    const g = byChar.get(L); if (!g) continue;
    const m = measureGlyph(g.commands, canvas); if (!m) continue;
    if (L === 'n') m.xRatio = xr;
    letters.push(L); z.push(zVector(L, m, lib.stats[L])); raw.push(m);
    if (typeof g.advance === 'number' && g.advance > 0) adv[L] = g.advance;
  }
  const q: QueryZ = { letters, z, raw };
  if (Object.keys(adv).length) q.adv = adv;
  const capL: Letter[] = [], capZ: number[][] = [];
  for (const [ch, L] of Object.entries(CAP_CHARS)) { const g = byChar.get(ch); if (!g) continue; const m = measureGlyph(g.commands, canvas); if (!m) continue; capL.push(L); capZ.push(zVector(L, m, lib.stats[L])); }
  if (capL.length) q.cap = { letters: capL, z: capZ };
  // proportions and spacing: outline bounds only, no raster
  const nTop = byChar.get('n') ? bounds(byChar.get('n')!.commands).y1 : NaN;
  if (nTop > 0.02) {
    const up = ['l', 'b', 'd', 'h', 'k'].map(c => byChar.get(c)).filter(Boolean).map(g => bounds(g!.commands).y1 / nTop);
    const dn = ['p', 'q', 'y', 'j'].map(c => byChar.get(c)).filter(Boolean).map(g => -bounds(g!.commands).y0 / nTop);
    const a = median(up), d = median(dn);
    if (Number.isFinite(a) && lib.propStats) q.asc = a;
    if (Number.isFinite(d) && lib.propStats) q.desc = d;
    const tight: number[] = [];
    for (const c of ['n', 'o', 'H']) { const g = byChar.get(c); if (g && typeof g.advance === 'number') { const b = bounds(g.commands); tight.push((b.x0 + (g.advance - b.x1)) / nTop); } }
    if (tight.length >= 2 && lib.spStats) q.spacing = tight.reduce((s, v) => s + v, 0) / tight.length;
  }
  return q;
}

/** Combine per-letter distances robustly: with 5+ letters the single worst one counts half (a hand-made letter may be off), but is never dropped, so a letter the person changed still moves the result. keepAll counts every letter fully. */
export function combine(ds: number[], keepAll = false): number {
  if (!ds.length) return Infinity;
  if (ds.length < 5 || keepAll) return ds.reduce((s, v) => s + v, 0) / ds.length;
  let wi = 0; for (let i = 1; i < ds.length; i++) if (ds[i] > ds[wi]) wi = i;
  let s = 0, w = 0; for (let i = 0; i < ds.length; i++) { const k = i === wi ? 0.5 : 1; s += ds[i] * k; w += k; }
  return s / w;
}

// ---- query facts: from raw measures when drawn, from z when the query is a library vector ----
export function queryFacts(q: QueryZ, lib: Library): Facts {
  if (q.raw) {
    return factsFrom((L, f) => { const k = q.letters.indexOf(L); if (k < 0) return NaN; const v = (q.raw as Measures[])[k][f as keyof Measures] as number; return typeof v === 'number' ? v : NaN; });
  }
  return factsFrom((L, f) => { const k = q.letters.indexOf(L), fi = FEATS_BY_LETTER[L].indexOf(f); if (k < 0 || fi < 0) return NaN; const v = q.z[k][fi]; return Number.isFinite(v) ? rawFromZ(L, f, v, lib.stats[L]) : NaN; });
}
/** The query's declared build of a and g (from storey or from declared forms). Never measured: the clay's accidental storeys are not facts. */
function declaredStoreys(q: QueryZ, opts: DistOpts): { a: 1 | 2 | null; g: 1 | 2 | null; viaForms: { a: boolean; g: boolean } } {
  const fa = opts.forms?.a, fg = opts.forms?.g;
  return { a: fa ? (fa === 'one' ? 1 : 2) : (q.storey?.a ?? null), g: fg ? (fg === 'one' ? 1 : 2) : (q.storey?.g ?? null), viaForms: { a: !!fa, g: !!fg } };
}
/** Letters whose declared build (a, g) the library font i contradicts by a majority of its three votes. Empty when nothing is declared. */
export function buildMismatch(lib: Library, q: QueryZ, i: number, _qf?: Facts, forms?: FindOptions['forms']): Letter[] {
  const s = declaredStoreys(q, { forms }), v = lib.facts[i].votes, out: Letter[] = [];
  if (s.a && votesAgainst(v, 0, s.a) >= 2) out.push('a');
  if (s.g && votesAgainst(v, 3, s.g) >= 2) out.push('g');
  return out;
}
const querySlant = (q: QueryZ, lib: Library) => {
  if (q.raw && q.raw.length) return q.raw.reduce((s, m) => s + m.slant, 0) / q.raw.length;
  let s = 0, n = 0;
  q.letters.forEach((L, k) => { const fi = FEATS_BY_LETTER[L].indexOf('slant'); if (fi >= 0 && Number.isFinite(q.z[k][fi])) { s += rawFromZ(L, 'slant', q.z[k][fi], lib.stats[L]); n++; } });
  return n ? s / n : null;
};

/** Plain names of the groups, for vetoGroups. */
export const GROUP_NAME: Partial<Record<GroupId, string>> = { weight: 'weight', width: 'width', xheight: 'x-height', contrast: 'thick and thin', bowl: 'bowl shape', open: 'openings', serifs: 'serifs', terminal: 'stroke ends', prop: 'tail length' };
const VETO_BIT: Record<string, number> = { weight: 1, width: 2, xheight: 4, contrast: 8, bowl: 16, open: 32, serifs: 64 };
/** Bit 128 of the veto array means "see the extra bits": a hard letter form, a class (mono, script) or stroke ends. */
const EXTRA_MARK = 128, X_MONO = 1 << 13, X_SCRIPT = 1 << 14, X_TERM = 1 << 15;
export function vetoNames(bits: number, extra = 0): string[] {
  const out = Object.keys(VETO_BIT).filter(k => bits & VETO_BIT[k]).map(k => GROUP_NAME[k as GroupId] as string);
  if (bits & EXTRA_MARK && !extra) out.push('stroke ends');
  if (extra & X_TERM) out.push('stroke ends');
  if (extra & X_MONO) out.push('fixed or proportional spacing');
  if (extra & X_SCRIPT) out.push('script or upright');
  for (let k = 0; k < NF; k++) if (extra & (1 << k)) out.push(`its ${FORM_KEYS[k].noun} form`);
  return out;
}

export type DistOpts = Pick<FindOptions, 'forms' | 'classes' | 'includeEffects' | 'scripts' | 'capsOnly' | 'changed' | 'ends'> & { extraOut?: Uint16Array };

function mapQuantile(d: number, from: number[], to: number[]): number {
  if (from.length < 4 || to.length < 4 || !(d > 0)) return d;
  if (d <= from[0]) return d * to[0] / from[0];
  for (let k = 0; k < 3; k++) if (d <= from[k + 1]) { const t = (Math.log(d) - Math.log(from[k])) / (Math.log(from[k + 1]) - Math.log(from[k])); return Math.exp(Math.log(to[k]) + t * (Math.log(to[k + 1]) - Math.log(to[k]))); }
  return d * to[3] / from[3];
}
const PEN_CLASS = 0.9, PEN_SCRIPTFIRST = 0.2, PEN_CAPS = 0;
export type QClass = { mono: number; monoSure: boolean; script: number; scriptSure: boolean; scriptAdv: boolean };
export function queryClasses(q: QueryZ, lib: Library, opts: Pick<FindOptions, 'classes'> = {}): QClass {
  let mono = NaN, monoSure = false, script = NaN, scriptSure = false, scriptAdv = false;
  if (opts.classes?.mono !== undefined) { mono = opts.classes.mono ? 1 : 0; monoSure = true; }
  else if (q.adv) { const v = Object.values(q.adv).filter(x => Number.isFinite(x)) as number[]; if (v.length >= 6) { const r = Math.max(...v) / Math.min(...v); if (r < 1.03) { mono = 1; monoSure = true; } else if (r > 1.08) { mono = 0; monoSure = true; } } }
  if (opts.classes?.script !== undefined) { script = opts.classes.script ? 1 : 0; scriptSure = true; }
  if (!Number.isFinite(mono) || !Number.isFinite(script)) {
    const x = modelVector((L, k) => { const i = q.letters.indexOf(L); return i < 0 ? NaN : q.z[i][k]; }, L => q.letters.includes(L));
    // Without advance widths a fixed pitch cannot be seen in seven outlines (the model is weak: AUC 0.79). Undeclared queries are taken as proportional, so mono fonts are soft-demoted.
    if (!Number.isFinite(mono)) mono = lib.models.mono ? Math.min(0.15, modelP(lib.models.mono, x)) : NaN;
    if (!Number.isFinite(script)) {
      if (q.spacing !== undefined && lib.spStats && lib.models.scriptAdv) { const x2 = new Float32Array(x.length + 1); x2.set(x); x2[x.length] = Math.max(-3, Math.min(3, (q.spacing * 1000 - lib.spStats.mean) / lib.spStats.sd)); script = modelP(lib.models.scriptAdv, x2); scriptAdv = true; }
      else script = lib.models.script ? modelP(lib.models.script, x) : NaN;
    }
  }
  return { mono, monoSure, script, scriptSure, scriptAdv };
}

/** Distance from the query to every font (Infinity when gated out). Internal: used by findClosest and the evaluation scripts.
 * vetoOut (optional) receives a bit set per font of the groups that veto it; add it to the ranking with rankKey(). */
export function distances(lib: Library, q: QueryZ, includeConstruction = false, skip?: (i: number) => boolean, scale?: Partial<Record<GroupId, number>>, noGates = false, vetoOut?: Uint8Array, dopts: DistOpts = {}): Float64Array {
  const out = new Float64Array(lib.fonts.length).fill(Infinity);
  const li = q.letters.map(L => LETTERS.indexOf(L));
  const tmp: number[] = new Array(q.letters.length + 14);
  const zf = new Float64Array(MAX_FEATS), gOut = new Float64Array(GROUPS.length), gSum = new Float64Array(GROUPS.length), gCnt = new Float64Array(GROUPS.length);
  const qs = noGates ? null : querySlant(q, lib);
  const qf = queryFacts(q, lib), st = noGates ? { a: null, g: null, viaForms: { a: false, g: false } } : declaredStoreys(q, dopts);
  const declEnds = dopts.ends === 'round' ? 1 : dopts.ends === 'flat' ? 0 : dopts.ends === 'wedge' ? 2 : -1;
  const qEnd = declEnds >= 0 ? declEnds : qf.tcls >= 0 ? qf.tcls : -1;
  const roundQuery = qEnd === 1;
  const sc: Partial<Record<GroupId, number>> = { ...scale }; if (roundQuery && !noGates) sc.terminal = (sc.terminal ?? 1) * 1.75;
  const vetoThr = TUNE.veto ?? VETO;
  const vk = (Object.keys(vetoThr) as GroupId[]).filter(g => (scale?.[g] ?? 1) !== 0).map(g => ({ k: GROUPS.indexOf(g), thr: vetoThr[g] as number, bit: VETO_BIT[g] }));
  const qc: QClass = noGates ? { mono: NaN, monoSure: false, script: NaN, scriptSure: false, scriptAdv: false } : queryClasses(q, lib, dopts);
  const hard: { k: number; code: number }[] = [], soft: { k: number; code: number; key: FormKey }[] = [];
  if (!noGates && dopts.forms) for (const [key, val] of Object.entries(dopts.forms)) {
    const k = FORM_INDEX[key]; if (k === undefined || val === undefined) continue;
    const code = (FORM_KEYS[k].values as readonly string[]).indexOf(val); if (code < 0) continue;
    if (FORM_KEYS[k].kind === 'hard') { if (key !== 'a' && key !== 'g') hard.push({ k, code }); } else soft.push({ k, code, key: key as FormKey });
  }
  const allowAll = dopts.scripts === 'allow', allowSet = Array.isArray(dopts.scripts) ? new Set(dopts.scripts.map(s => s.toLowerCase())) : null;
  const keepAll = !!dopts.changed?.length;
  const capCal = lib.capCal, tgtCal = lib.cal[q.letters.length] ?? [];
  const hasCap = q.cap ? q.cap.letters.length : 0;
  const zp = (v: number, mean: number, sd: number) => Math.max(-3, Math.min(3, (v - mean) / sd));
  const qAsc = q.asc !== undefined && lib.propStats ? zp(q.asc, lib.propStats.mean[0], lib.propStats.sd[0]) : NaN;
  const qDesc = q.desc !== undefined && lib.propStats ? zp(q.desc, lib.propStats.mean[1], lib.propStats.sd[1]) : NaN;
  const qSp = q.spacing !== undefined && lib.spStats ? zp(q.spacing * 1000, lib.spStats.mean, lib.spStats.sd) : NaN;
  if (vetoOut) vetoOut.fill(0);
  if (dopts.extraOut) dopts.extraOut.fill(0);
  for (let i = 0; i < lib.fonts.length; i++) {
    const cf = lib.cls[i];
    if (!includeConstruction && lib.fonts[i].construction) continue;
    if ((cf & 8) && !dopts.includeEffects && !includeConstruction) continue;
    if ((cf & 1) && dopts.capsOnly === 'exclude') continue;
    if (skip && skip(i)) continue;
    let pen = 0, extra = 0;
    // style gate: an upright query meets only upright fonts. A leaning query is graded by slant (below), never cut off.
    if (qs !== null) {
      const fs = lib.slant[i];
      if (qs <= 0.04 && (lib.fonts[i].style === 'italic' || fs > 0.12)) continue;
      if (qs >= 0.08) pen += 2.5 * Math.max(0, qs - fs - 0.03);
    }
    const fv = lib.facts[i].votes;
    const mis: Letter[] = [];
    const wantA = st.a, wantG = st.g;
    for (const [L, want, off, viaForms, fk] of [['a', wantA, 0, st.viaForms.a, FORM_INDEX.a], ['g', wantG, 3, st.viaForms.g, FORM_INDEX.g]] as [Letter, 1 | 2 | null, number, boolean, number][]) {
      if (!want) continue;
      const ag = votesAgainst(fv, off, want);
      if (viaForms) {
        let have: number = majority(fv, off); if (!have) { const c = lib.form[i * NF + fk]; have = c === UNKNOWN_FORM ? 0 : c + 1; }
        if (have && have !== want) { extra |= 1 << fk; mis.push(L); }
      } else { pen += STOREY_PENALTY[ag]; if (ag >= 2) mis.push(L); }
    }
    for (const h of hard) { const c = lib.form[i * NF + h.k]; if (c !== UNKNOWN_FORM && c !== h.code) extra |= 1 << h.k; }
    for (const s of soft) pen += softCost(s.key, s.code, lib.form[i * NF + s.k]);
    // classes
    if (!noGates) {
      const fMono = (cf & 2) ? 1 : 0, fScript = (cf & 4) ? 1 : 0;
      if (Number.isFinite(qc.mono)) { if (qc.monoSure) { if (qc.mono === 1 && !fMono) extra |= X_MONO; else if (qc.mono === 0 && fMono) pen += PEN_CLASS; } else { const pf = lib.pMono[i]; pen += PEN_CLASS * Math.abs(qc.mono - (Number.isFinite(pf) ? pf : fMono)); if (qc.mono < 0.2 && fMono) pen += 0.3; else if (qc.mono > 0.8 && !fMono) pen += 0.3; } }
      if (Number.isFinite(qc.script)) { if (qc.scriptSure) { if (qc.script === 1 && !fScript) extra |= X_SCRIPT; else if (qc.script === 0 && fScript) pen += PEN_CLASS; } else { const pf = qc.scriptAdv ? lib.pScriptAdv[i] : lib.pScript[i]; pen += PEN_CLASS * Math.abs(qc.script - (Number.isFinite(pf) ? pf : fScript)); if (qc.script < 0.15 && fScript) pen += 0.3; else if (qc.script > 0.85 && !fScript) pen += 0.3; } }
      if ((cf & 16) && !allowAll && !(allowSet && allowSet.has(String(lib.fonts[i].scriptFirst).toLowerCase()))) pen += PEN_SCRIPTFIRST;
    }
    // stroke ends: a round query is decided by ends. The font's class comes from n and H, or from more stems where those could not be read.
    if (roundQuery && !noGates) {
      const ff = lib.facts[i], fe = declEnds >= 0 ? (lib.ends[i] >= 0 ? lib.ends[i] : ff.tcls) : (ff.tcls >= 0 ? ff.tcls : lib.ends[i]);
      if (fe === 0 || fe === 2) extra |= X_TERM; else if (fe < 0) pen += 0.25;
    } else if (declEnds >= 0 && !noGates) {
      const ff = lib.facts[i], fe = declEnds >= 0 ? (lib.ends[i] >= 0 ? lib.ends[i] : ff.tcls) : (ff.tcls >= 0 ? ff.tcls : lib.ends[i]);
      if (fe >= 0 && fe !== declEnds) extra |= X_TERM;
    }
    // ---- letter distances ----
    let n = 0, ok = true; if (vetoOut) { gSum.fill(0); gCnt.fill(0); }
    const capsFont = (cf & 1) !== 0;
    for (let k = 0; k < li.length; k++) {
      const L = q.letters[k];
      if (capsFont && L !== 'H' && L !== 'O') continue;
      const o = i * STRIDE + li[k] * MAX_FEATS;
      if (lib.z[o] === -128) { ok = false; break; }
      if (mis.includes(L)) continue; // different build of this letter: not compared (the veto above says so)
      for (let f = 0; f < MAX_FEATS; f++) { const v = lib.z[o + f]; zf[f] = v === -128 ? NaN : v / Q_STEP; }
      tmp[n++] = groupedDist(q.z[k], zf, L, sc, vetoOut ? gOut : undefined);
      if (vetoOut) for (let g = 0; g < GROUPS.length; g++) if (gOut[g] === gOut[g]) { gSum[g] += gOut[g]; gCnt[g]++; }
    }
    if (ok && capsFont && hasCap && q.cap) {
      const row = lib.capsRow.get(i);
      if (row !== undefined) for (let c = 0; c < q.cap.letters.length; c++) {
        const L = q.cap.letters[c], slot = ['a', 'e', 'g', 'n'].indexOf(L); if (slot < 0) continue;
        const o = row + slot * MAX_FEATS; for (let f = 0; f < MAX_FEATS; f++) { const v = lib.capsZ[o + f]; zf[f] = v === -128 ? NaN : v / Q_STEP; }
        tmp[n++] = groupedDist(q.cap.z[c], zf, L, sc);
      }
    }
    if (!ok || !n) continue;
    // proportions and spacing behave like extra letters of weight one
    if (!capsFont) {
      const pa = lib.prop[i * 2], pd = lib.prop[i * 2 + 1];
      if (lib.propStats) {
        if (Number.isFinite(qAsc) && Number.isFinite(pa)) tmp[n++] = 0.6 * Math.min(3, Math.abs(qAsc - zp(pa, lib.propStats.mean[0], lib.propStats.sd[0])));
        if (Number.isFinite(qDesc) && Number.isFinite(pd)) tmp[n++] = 0.6 * Math.min(3, Math.abs(qDesc - zp(pd, lib.propStats.mean[1], lib.propStats.sd[1])));
      }
      if (lib.spStats && Number.isFinite(qSp) && Number.isFinite(lib.sp[i])) tmp[n++] = 0.5 * Math.min(3, Math.abs(qSp - zp(lib.sp[i] * 1000, lib.spStats.mean, lib.spStats.sd)));
    }
    let d = combine(tmp.slice(0, n), keepAll);
    if (capsFont) { d = mapQuantile(d, capCal, tgtCal); pen += PEN_CAPS; }
    out[i] = d * (1 + pen);
    if (vetoOut) {
      let bits = 0;
      for (const v of vk) if (gCnt[v.k] && gSum[v.k] / gCnt[v.k] > v.thr) bits |= v.bit;
      const ff = lib.facts[i];
      if (qf.serif >= 0 && ff.serif >= 0 && qf.serif !== ff.serif && (scale?.serifs ?? 1) !== 0) bits |= VETO_BIT.serifs;
      if (qf.tcls >= 0 && ff.tcls >= 0 && qf.tcls !== ff.tcls && (scale?.terminal ?? 1) !== 0) extra |= X_TERM;
      // bowl, serif and stroke-end measures are unreliable on connected scripts: no veto from them when the font or the query is a script
      if ((cf & 4) || (Number.isFinite(qc.script) && qc.script > 0.7)) { bits &= ~(VETO_BIT.bowl | VETO_BIT.serifs); extra &= ~X_TERM; }
      if (extra) bits |= EXTRA_MARK;
      vetoOut[i] = bits;
    }
    if (dopts.extraOut) dopts.extraOut[i] = extra;
  }
  return out;
}

/** Ranking key: vetoed fonts sort after every unvetoed one, each group in distance order. */
export function rankKey(d: Float64Array, veto: Uint8Array): Float64Array {
  const k = new Float64Array(d.length); for (let i = 0; i < d.length; i++) k[i] = veto[i] ? d[i] + (veto[i] & EXTRA_MARK ? 1e7 : 1e6) : d[i]; return k;
}

/** Best font per family, nearest first (unvetoed before vetoed). Internal (carries distances). */
export function rankFamilies(lib: Library, d: Float64Array, limit: number, veto?: Uint8Array): { idx: number; d: number; veto: number }[] {
  const key = veto ? rankKey(d, veto) : d;
  const best = new Map<string, number>();
  for (let i = 0; i < d.length; i++) {
    if (!Number.isFinite(d[i])) continue;
    const f = lib.fonts[i].familyId, b = best.get(f);
    if (b === undefined || key[i] < key[b]) best.set(f, i);
  }
  return [...best.values()].sort((a, b) => key[a] - key[b]).slice(0, limit).map(idx => ({ idx, d: d[idx], veto: veto ? veto[idx] : 0 }));
}

/** Piecewise log-linear map from a first-neighbour distance to 0..100: 95 at p10, 75 at the median, 60 at p90, 30 at far. Above 95 it rises to 100 at distance 0; below 30 it falls to 0 at twice far. */
export function calibrate(cal: number[], dist: number): number {
  const [p10, p50, p90, far] = cal;
  const seg = (d: number, d0: number, d1: number, v0: number, v1: number) => v0 + (v1 - v0) * (Math.log(d) - Math.log(d0)) / (Math.log(d1) - Math.log(d0));
  if (dist <= 0) return 100;
  if (dist <= p10) return 95 + 5 * (1 - dist / p10);
  if (dist <= p50) return seg(dist, p10, p50, 95, 75);
  if (dist <= p90) return seg(dist, p50, p90, 75, 60);
  if (dist <= far) return seg(dist, p90, far, 60, 30);
  return Math.max(0, 30 * (1 - (dist - far) / far));
}
/** Old local-rank calibration, only for indexes built before v2 (no `cal`). */
function matchFromNn(qs: number[], dist: number): number {
  if (!qs || !qs.length) return 50;
  if (dist <= qs[0]) return 100;
  if (dist >= qs[qs.length - 1]) return 0;
  let i = 1; while (qs[i] < dist) i++;
  return 100 * (1 - ((i - 1) + (dist - qs[i - 1]) / Math.max(1e-9, qs[i] - qs[i - 1])) / (qs.length - 1));
}
/** Match percentage for a result at `dist` with `letters` query letters. Vetoed results are scaled by 0.8 and capped under 60. */
export function matchPercent(lib: Library, letters: number, dist: number, vetoed = false): number {
  const cal = lib.cal[letters];
  const pct = cal && cal.length >= 4 ? calibrate(cal, dist) : matchFromNn(lib.nn[letters], dist);
  return Math.max(0, Math.min(vetoed ? 59 : 100, Math.round(vetoed ? pct * 0.8 : pct)));
}
export const WEAK_BELOW = 40;
/** The band follows the number, vetoed or not. */
export function bandWord(match: number, _vetoed = false): string { return match >= 90 ? 'near twin' : match >= 75 ? 'close' : match >= 60 ? 'same spirit' : 'under 60'; }

const CLAY_CUTS = ['roboto-flex', 'saira', 'nunito', 'roboto-serif'];

function formMisses(lib: Library, i: number, forms: FindOptions['forms'], q: QueryZ): string[] {
  const out: string[] = [];
  if (!forms) return out;
  for (const [key, val] of Object.entries(forms)) {
    const k = FORM_INDEX[key]; if (k === undefined || val === undefined) continue;
    const def = FORM_KEYS[k], want = (def.values as readonly string[]).indexOf(val); if (want < 0) continue;
    let have = lib.form[i * NF + k] as number;
    if (key === 'a' || key === 'g') { const m = majority(lib.facts[i].votes, key === 'a' ? 0 : 3); if (m) have = m - 1; }
    if (have === UNKNOWN_FORM || have === want) continue;
    out.push((def.words as Record<string, string>)[def.values[have]]);
  }
  void q; return out;
}

export function findClosest(queryGlyphs: QueryGlyph[], library: Library | LibraryIndex, opts: FindOptions = {}): MatchResult[] {
  const lib = isLibrary(library) ? library : loadLibrary(library);
  const q = measureQuery(queryGlyphs, lib, opts.canvas);
  if (!q.letters.length && !q.cap) return [];
  if (opts.storey) q.storey = opts.storey;
  const exSet = new Set<string>(opts.exclude ?? []);
  if (opts.excludeSuperfamily) {
    // your own font and its true cuts (SC, Display, widths); derivatives stay available. The four clay fonts are never a result.
    const cutsOf = (id: string) => { const f = lib.fonts.find(x => x.familyId === id); if (!f) return; for (const [, fams] of lib.byCut) if (fams.includes(id)) for (const fam of fams) exSet.add(fam); };
    for (const id of opts.exclude ?? []) cutsOf(id);
    for (const id of CLAY_CUTS) { exSet.add(id); cutsOf(id); }
  }
  const ex = exSet.size ? exSet : null;
  const veto = new Uint8Array(lib.fonts.length), extra = new Uint16Array(lib.fonts.length);
  const dopts = { ends: opts.ends, forms: opts.forms, classes: opts.classes, includeEffects: opts.includeEffects, scripts: opts.scripts, capsOnly: opts.capsOnly, changed: opts.changed, extraOut: extra };
  const d = distances(lib, q, !!opts.includeConstruction, ex ? i => ex.has(lib.fonts[i].familyId) : undefined, opts.groupScale, false, veto, dopts);
  const limit = Math.max(1, opts.limit ?? 10);
  const cand = rankFamilies(lib, d, Math.max(limit * 10, 80), veto);
  // one row per lineage; the rest of a lineage is "also". At most one script-first family; the others wait until the list cannot fill otherwise.
  const rows: { idx: number; d: number; veto: number; also: { idx: number; d: number }[] }[] = [], bySf = new Map<string, number>(), waiting: typeof rows = []; let sfCount = 0;
  for (const c of cand) {
    const f = lib.fonts[c.idx], sf = f.superfamily as string, at = bySf.get(sf);
    if (at !== undefined) { rows[at].also.push({ idx: c.idx, d: c.d }); continue; }
    const first = (lib.cls[c.idx] & 16) !== 0;
    if (first && sfCount >= 1 && opts.scripts !== 'allow') { waiting.push({ ...c, also: [] }); continue; }
    if (rows.length >= limit) { continue; }
    if (first) sfCount++;
    bySf.set(sf, rows.length); rows.push({ ...c, also: [] });
  }
  for (const w of waiting) { if (rows.length >= limit) break; const sf = lib.fonts[w.idx].superfamily as string; if (bySf.has(sf)) continue; bySf.set(sf, rows.length); rows.push(w); }
  let runMin = 100;
  return rows.map(({ idx, d: dist, veto: vb, also }) => {
    const ex16 = extra[idx];
    const why = explain(q.letters, q.z, k => { const o = idx * STRIDE + LETTERS.indexOf(q.letters[k]) * MAX_FEATS; return lib.z[o] === -128 ? null : lib.z.subarray(o, o + MAX_FEATS); }, lib.stats);
    // serif wording comes from the serif class (presence), never from the serif length alone
    const qf = queryFacts(q, lib), ff = lib.facts[idx];
    const strip = (a: string[]) => a.filter(s => !/serifs?$/.test(s));
    let matches = strip(why.matches), differs = strip(why.differs);
    if (qf.serif >= 0 && ff.serif >= 0) { if (qf.serif === ff.serif) matches = [...matches, qf.serif ? 'serifs' : 'no serifs'].slice(0, 4); else differs = [ff.serif ? 'serifs where the query has none' : 'no serifs where the query has them', ...differs].slice(0, 3); }
    let spacingDriver: { group: string; share: number; gap: number } | null = null;
    if (q.spacing !== undefined && lib.spStats && Number.isFinite(lib.sp[idx])) {
      const zq = (q.spacing * 1000 - lib.spStats.mean) / lib.spStats.sd, zf = (lib.sp[idx] * 1000 - lib.spStats.mean) / lib.spStats.sd, gap = zf - zq;
      if (Math.abs(gap) >= 0.7) { const w = (Math.abs(gap) >= 2 ? 'much ' : Math.abs(gap) < 1.2 ? 'slightly ' : '') + (gap > 0 ? 'looser' : 'tighter') + ' letter spacing'; differs = Math.abs(gap) >= 1.5 ? [w, ...differs].slice(0, 3) : [...differs, w].slice(0, 3); spacingDriver = { group: 'letter spacing', share: 0, gap: +Math.abs(gap).toFixed(2) }; }
      else if (Math.abs(gap) < 0.4) matches = [...matches, 'letter spacing'].slice(0, 4);
    }
    const misses = formMisses(lib, idx, opts.forms, q);
    if (misses.length) differs = [...misses, ...differs].slice(0, 3);
    const vetoed = vb !== 0, match0 = matchPercent(lib, q.letters.length || 2, dist, vetoed);
    // a row never reads above the row before it, and never above 79 when a group is more than 1 SD off
    let match = why.over1 >= 1 ? Math.min(match0, 79) : match0;
    match = Math.min(match, runMin); if (!vetoed) runMin = match;
    const tags: string[] = [];
    const f = lib.fonts[idx];
    if (f.mono) tags.push('monospace'); if (f.script) tags.push('script'); if (f.capsOnly) tags.push('capitals only'); if (f.scriptFirst) tags.push(`Latin from a ${f.scriptFirst} font`); if (f.effect) tags.push(f.effect);
    const r: MatchResult = {
      font: f, why: { matches, differs }, match, vetoed, band: bandWord(match, vetoed), showNumber: !vetoed,
      weak: match < WEAK_BELOW || why.over1 >= 3 || (vetoed && match < 50),
      drivers: why.groups.filter(g => g.share >= 0.1).slice(0, 3).map(g => ({ group: g.name, share: +g.share.toFixed(2), gap: +g.mag.toFixed(2) }))
    };
    if (spacingDriver) { spacingDriver.share = +Math.min(0.5, spacingDriver.gap / 6).toFixed(2); r.drivers = [spacingDriver, ...(r.drivers ?? [])].sort((a, b) => b.share - a.share).slice(0, 3); }
    if (vetoed) r.vetoGroups = vetoNames(vb, ex16);
    if (misses.length) r.formMisses = misses;
    if (tags.length) r.tags = tags;
    if (also.length) r.also = also.slice(0, 6).map(a => ({ family: lib.fonts[a.idx].family, familyId: lib.fonts[a.idx].familyId, match: matchPercent(lib, q.letters.length || 2, a.d, veto[a.idx] !== 0) }));
    return r;
  });
}
