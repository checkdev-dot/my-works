// Library index: compact JSON (public/library/index.json) -> in-memory Library used by the matcher.
import { LETTERS, FEATS_BY_LETTER, MAX_FEATS, Q_STEP, rawFromZ, type Letter, type LetterStats } from './features';
import { factsFrom, type Facts } from './facts';
import { superfamilyKey, cutKey } from './superfamily';
import { NF, UNKNOWN_FORM } from './forms';
import type { FontMeta } from './types';

/** On-disk shape. `q` is base64 Int8: fonts x letters x MAX_FEATS, z*Q_STEP, -128 = letter missing. */
export type LibraryIndex = {
  v: 1;
  built: string;
  letters: string[];
  featureCounts: number[];
  stats: Record<string, { mean: number[]; sd: number[] }>;
  /** Distance above which a best match is called weak, by number of query letters used (1..7). */
  weakAt: Record<string, number>;
  /** Nearest-neighbour distance quantiles (0, 5% ... 100%) of real fonts, by number of letters used (1..7). Calibrates the match percentage. */
  nn?: Record<string, number[]>;
  /** [familyId, family, category, license, source, weight, italic(0|1), flags] flags: 1 holdout, 2 pixel, 4 dot-matrix, 8 segment */
  fonts: (string | number)[][];
  /** familyId -> names of duplicate families collapsed into it */
  aliases?: Record<string, string[]>;
  /** familyId -> superfamily key, for every family. Missing in older indexes (then derived from the name). */
  supers?: Record<string, string>;
  /** Calibration of the match percentage by number of query letters (1..7): [p10, p50, p90, far] of the first-neighbour distance and of random pairs. */
  cal?: Record<string, number[]>;
  q: string;
  // ---- v3 additions, all optional: an index without them still loads ----
  /** familyId -> one character per FORM_KEYS entry: a digit (value code) or '-' (unknown). */
  forms?: Record<string, string>;
  /** familyId -> [ascender, descender] over x-height, times 100. And their mean / sd over the library. */
  prop?: Record<string, number[]>; propStats?: { mean: number[]; sd: number[] };
  /** familyId -> side-bearing tightness over x-height times 1000 (mean of n, o, H), and mean / sd. */
  sp?: Record<string, number>; spStats?: { mean: number; sd: number };
  /** familyId -> stroke-end class read on more stems (0 flat, 1 round, 2 wedge). Fills in where n and H could not be read. */
  ends?: Record<string, number>;
  /** familyId -> verified Get it page, only where it differs from the default */
  links?: Record<string, string>;
  /** familyId -> non-Latin primary script name (the row flag 256 says the Latin is a companion design) */
  scripts?: Record<string, string>;
  /** familyId -> effect kind (stencil, inline ...) */
  effects?: Record<string, string>;
  /** Capitals-only rows: font row indexes and base64 Int8 vectors of the letters a e g n (their lowercase slots hold capitals) */
  caps?: { rows: number[]; q: string };
  /** Logistic models read from the same z vectors on both sides: script (connected) and mono (fixed pitch). */
  models?: Record<string, { w: number[]; b: number }>;
  /** [p10, p50, p90, far] for capitals-only comparisons on H and O, same construction as cal */
  capCal?: number[];
};

export type Library = {
  fonts: FontMeta[];
  z: Int8Array;
  /** measured slant per font (mean over letters), used by the italic gate */
  slant: Float32Array;
  stats: Record<Letter, LetterStats>;
  weakAt: number[]; // index = letters used
  nn: number[][]; // index = letters used
  /** [p10, p50, p90, far] by letters used; empty when the index has no calibration (then nn is used) */
  cal: number[][];
  /** discrete facts per font (storey votes, terminal class, serif presence), decoded from z */
  facts: Facts[];
  /** superfamily key -> family ids */
  bySuper: Map<string, string[]>;
  /** cut key -> family ids (same design in other cuts); used to exclude "your own font" */
  byCut: Map<string, string[]>;
  /** per font: bit 1 capsOnly, 2 mono, 4 script, 8 effect, 16 scriptFirst */
  cls: Uint8Array;
  /** per font: form codes, NF per font (UNKNOWN_FORM where not measured) */
  form: Uint8Array;
  /** per font: ascender, descender over x-height (NaN unknown); spacing tightness (NaN unknown) */
  prop: Float32Array; sp: Float32Array;
  propStats: { mean: number[]; sd: number[] } | null; spStats: { mean: number; sd: number } | null;
  /** per font: stroke-end class from the extra stems (-1 unknown) */
  ends: Int8Array;
  /** capitals-only rows: font index -> offset into capsZ (4 letters a e g n, MAX_FEATS each) */
  capsRow: Map<number, number>; capsZ: Int8Array;
  models: Record<string, { w: number[]; b: number }>;
  capCal: number[];
  /** per font mean-z features for the class models (MODEL_DIM per font) */
  modelX: Float32Array;
  /** per font: model probabilities. pMono; pScript without advances; pScriptAdv with the spacing feature (NaN where the font has no spacing) */
  pMono: Float32Array; pScript: Float32Array; pScriptAdv: Float32Array;
  hasV3: boolean;
  built: string;
};

export const STRIDE = LETTERS.length * MAX_FEATS;
const CONSTRUCTION: Record<number, FontMeta['construction']> = { 2: 'pixel', 4: 'dot-matrix', 8: 'segment' };

function b64ToInt8(s: string): Int8Array {
  if (typeof atob === 'function') { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Int8Array(u.buffer); }
  const B = (globalThis as any).Buffer; const buf = B.from(s, 'base64'); return new Int8Array(buf.buffer, buf.byteOffset, buf.length);
}

export function fontMetaFrom(row: (string | number)[], aliases?: string[], superfamily?: string, extra?: { getUrl?: string; scriptFirst?: string; effect?: string }): FontMeta {
  const [familyId, family, category, license, source, weight, italic, flags] = row as [string, string, string, string, string, number, number, number];
  const style = italic ? 'italic' : 'normal';
  const fam = encodeURIComponent(family).replace(/%20/g, '+');
  const m: FontMeta = {
    id: `${familyId}:${weight}${italic ? 'i' : ''}`, familyId, family, category, license, source,
    sourceUrl: source === 'google' ? `https://fonts.google.com/specimen/${fam}` : `https://fontsource.org/fonts/${familyId}`,
    weight, style, fontUrl: `https://cdn.jsdelivr.net/fontsource/fonts/${familyId}@latest/latin-${weight}-${style}.woff2`
  };
  for (const bit of [2, 4, 8]) if (flags & bit) m.construction = CONSTRUCTION[bit];
  if (flags & 1) m.holdout = true;
  if (flags & 16) m.capsOnly = true;
  if (flags & 32) m.mono = true;
  if (flags & 64) m.script = true;
  if (extra?.effect) m.effect = extra.effect;
  if (extra?.scriptFirst) m.scriptFirst = extra.scriptFirst;
  if (extra?.getUrl) { m.sourceUrl = extra.getUrl; m.getUrl = extra.getUrl; } else m.getUrl = m.sourceUrl;
  if (aliases && aliases.length) m.aliases = aliases;
  m.superfamily = superfamily ?? superfamilyKey(familyId, family);
  return m;
}

const cache = new WeakMap<object, Library>();
/** Decode the index (cached per object). Cheap: one base64 decode + one pass over the font rows. */
export function loadLibrary(index: LibraryIndex): Library {
  const hit = cache.get(index); if (hit) return hit;
  const z = b64ToInt8(index.q);
  if (z.length !== index.fonts.length * STRIDE) throw new Error('library index is corrupt (size mismatch)');
  const stats = {} as Record<Letter, LetterStats>;
  for (const L of LETTERS) {
    const s = index.stats[L];
    if (!s || s.mean.length !== FEATS_BY_LETTER[L].length) throw new Error('library index was built with a different feature set; rebuild it');
    stats[L] = s;
  }
  const weakAt: number[] = [0]; for (let k = 1; k <= LETTERS.length; k++) weakAt.push(index.weakAt[String(k)] ?? Infinity);
  const fonts = index.fonts.map(r => { const id = r[0] as string; return fontMetaFrom(r, index.aliases?.[id], index.supers?.[id], { getUrl: index.links?.[id], scriptFirst: (Number(r[7]) & 256) ? (index.scripts?.[id] ?? 'another script') : undefined, effect: index.effects?.[id] }); });
  const slant = new Float32Array(fonts.length);
  for (let i = 0; i < fonts.length; i++) {
    let s = 0, n = 0;
    for (let li = 0; li < LETTERS.length; li++) {
      const L = LETTERS[li], k = FEATS_BY_LETTER[L].indexOf('slant'), v = z[i * STRIDE + li * MAX_FEATS + k];
      if (v !== -128 && k >= 0) { s += (v / Q_STEP) * stats[L].sd[k] + stats[L].mean[k]; n++; }
    }
    slant[i] = n ? s / n : 0;
  }
  const nn: number[][] = [[]]; for (let k = 1; k <= LETTERS.length; k++) nn.push(index.nn?.[String(k)] ?? []);
  const cal: number[][] = [[]]; for (let k = 1; k <= LETTERS.length; k++) cal.push(index.cal?.[String(k)] ?? []);
  const facts: Facts[] = fonts.map((_, i) => factsFrom((L, f) => {
    const li = LETTERS.indexOf(L), k = FEATS_BY_LETTER[L].indexOf(f); if (k < 0) return NaN;
    const v = z[i * STRIDE + li * MAX_FEATS + k]; return v === -128 ? NaN : rawFromZ(L, f, v / Q_STEP, stats[L]);
  }));
  const bySuper = new Map<string, string[]>(); const seenFam = new Set<string>();
  for (const f of fonts) { if (seenFam.has(f.familyId)) continue; seenFam.add(f.familyId); const a = bySuper.get(f.superfamily as string); if (a) a.push(f.familyId); else bySuper.set(f.superfamily as string, [f.familyId]); }
  const byCut = new Map<string, string[]>();
  { const seen = new Set<string>(); for (const f of fonts) { if (seen.has(f.familyId)) continue; seen.add(f.familyId); const k = cutKey(f.familyId, f.family); const a = byCut.get(k); if (a) a.push(f.familyId); else byCut.set(k, [f.familyId]); } }
  const N = fonts.length, famIdx = new Map<string, number[]>();
  fonts.forEach((f, i) => { const a = famIdx.get(f.familyId); if (a) a.push(i); else famIdx.set(f.familyId, [i]); });
  const cls = new Uint8Array(N), form = new Uint8Array(N * NF).fill(UNKNOWN_FORM), prop = new Float32Array(N * 2).fill(NaN), sp = new Float32Array(N).fill(NaN), ends = new Int8Array(N).fill(-1);
  index.fonts.forEach((r, i) => { const fl = Number(r[7]); cls[i] = ((fl & 16) ? 1 : 0) | ((fl & 32) ? 2 : 0) | ((fl & 64) ? 4 : 0) | ((fl & 128) ? 8 : 0) | ((fl & 256) ? 16 : 0); });
  const hasV3 = !!index.forms;
  for (const [id, idxs] of famIdx) {
    const fs = index.forms?.[id], pr = index.prop?.[id], sv = index.sp?.[id], en = index.ends?.[id];
    for (const i of idxs) {
      if (fs) for (let k = 0; k < NF; k++) { const c = fs.charCodeAt(k) - 48; form[i * NF + k] = c >= 0 && c <= 9 ? c : UNKNOWN_FORM; }
      if (pr) { prop[i * 2] = pr[0] / 100; prop[i * 2 + 1] = pr[1] / 100; }
      if (sv !== undefined) sp[i] = sv / 1000;
      if (en !== undefined) ends[i] = en;
    }
  }
  const capsRow = new Map<number, number>(); const capsZ = index.caps ? b64ToInt8(index.caps.q) : new Int8Array(0);
  index.caps?.rows.forEach((fi, k) => capsRow.set(fi, k * 4 * MAX_FEATS));
  const modelX = new Float32Array(N * MODEL_DIM);
  if (index.models) for (let i = 0; i < N; i++) { if (z[i * STRIDE] === -128) continue; modelX.set(modelVector((L, k) => { const v = z[i * STRIDE + LETTERS.indexOf(L) * MAX_FEATS + k]; return v === -128 ? NaN : v / Q_STEP; }, L => z[i * STRIDE + LETTERS.indexOf(L) * MAX_FEATS] !== -128), i * MODEL_DIM); }
  const pMono = new Float32Array(N).fill(NaN), pScript = new Float32Array(N).fill(NaN), pScriptAdv = new Float32Array(N).fill(NaN);
  if (index.models) for (let i = 0; i < N; i++) { if (z[i * STRIDE] === -128) continue; const x = modelX.subarray(i * MODEL_DIM, (i + 1) * MODEL_DIM); pMono[i] = modelP(index.models.mono, x); pScript[i] = modelP(index.models.script, x); if (Number.isFinite(sp[i]) && index.spStats && index.models.scriptAdv) { const x2 = new Float32Array(MODEL_DIM + 1); x2.set(x); x2[MODEL_DIM] = Math.max(-3, Math.min(3, (sp[i] * 1000 - index.spStats.mean) / index.spStats.sd)); pScriptAdv[i] = modelP(index.models.scriptAdv, x2); } }
  const lib: Library = { fonts, z, slant, stats, weakAt, nn, cal, facts, bySuper, byCut, cls, form, prop, sp, ends, capsRow, capsZ, models: index.models ?? {}, capCal: index.capCal ?? [], modelX, pMono, pScript, pScriptAdv, propStats: index.propStats ?? null, spStats: index.spStats ?? null, hasV3, built: index.built };
  cache.set(index, lib); return lib;
}

/** Browser helper: lazily fetch and decode. */
export async function fetchLibrary(url = '/library/index.json'): Promise<Library> {
  const r = await fetch(url); if (!r.ok) throw new Error('could not load font library: HTTP ' + r.status);
  return loadLibrary(await r.json() as LibraryIndex);
}

export function isLibrary(x: unknown): x is Library { return !!x && typeof x === 'object' && 'z' in (x as object) && 'fonts' in (x as object) && !('q' in (x as object)); }
export const letterOffset = (li: number) => li * MAX_FEATS;
export { Q_STEP };

/** Features the class models read: mean over the letters present of the 10 base features, then mean over n and H of serifLen, serifThick, topLeft, exitTail. Same for library fonts and queries. */
export const MODEL_DIM = 14;
const BASE_FEATS = 10;
export function modelVector(get: (L: Letter, k: number) => number, has: (L: Letter) => boolean): Float32Array {
  const out = new Float32Array(MODEL_DIM);
  let n = 0;
  for (const L of LETTERS) { if (!has(L)) continue; n++; for (let k = 0; k < BASE_FEATS; k++) { const v = get(L, k); out[k] += Number.isFinite(v) ? v : 0; } }
  if (n) for (let k = 0; k < BASE_FEATS; k++) out[k] /= n;
  let m = 0;
  for (const L of ['n', 'H'] as Letter[]) { if (!has(L)) continue; m++; for (let k = 0; k < 4; k++) { const v = get(L, BASE_FEATS + k); out[BASE_FEATS + k] += Number.isFinite(v) ? v : 0; } }
  if (m) for (let k = 0; k < 4; k++) out[BASE_FEATS + k] /= m;
  return out;
}
export const modelP = (m: { w: number[]; b: number } | undefined, x: ArrayLike<number>) => { if (!m) return NaN; let t = m.b; for (let k = 0; k < m.w.length; k++) t += m.w[k] * x[k]; return 1 / (1 + Math.exp(-t)); };
