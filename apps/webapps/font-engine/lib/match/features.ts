// Feature definitions. Every measure is taken in ONE canonical frame (see measure.ts), then grouped into attribute groups.
// A group has one scalar distance (RMS of its z differences); groups are combined with a p=2 norm.
// A group that is far off is a "veto" (see VETO): the family still ranks, but after every unvetoed family, and shows a band word, never a number.
// Gates, not distances: slant (italic vs upright) and the build of a and g (one- vs two-storey, decided by three votes).
import type { Measures } from './measure';

export const LETTERS = ['a', 'e', 'g', 'n', 'o', 'H', 'O'] as const;
export type Letter = (typeof LETTERS)[number];

export type FeatureId = Exclude<keyof Measures, 'width' | 'sharpA' | 'sharpB'>;
export type GroupId = 'weight' | 'width' | 'xheight' | 'contrast' | 'pen' | 'slant' | 'terminal' | 'bowl' | 'roundness' | 'open' | 'serifs' | 'prop' | 'gate';

type Def = { group: GroupId; w: number; tf: (v: number) => number; /** a missing value stays missing (-128 in the index) and is skipped in distances */ nan?: boolean };
const log = Math.log;
export const FEATURES: Record<FeatureId, Def> = {
  stemRel:    { group: 'weight',    w: 1.5, tf: v => log(v) },
  thinRel:    { group: 'weight',    w: 1,   tf: v => log(v) },
  density:    { group: 'weight',    w: 1,   tf: v => v },
  aspect:     { group: 'width',     w: 1,   tf: v => log(v) },
  desc:       { group: 'prop',      w: 1,   tf: v => v },            // tail of the g, relative to its height
  xRatio:     { group: 'xheight',   w: 1,   tf: v => log(v), nan: true }, // n height over H height
  contrast:   { group: 'contrast',  w: 1,   tf: v => log(Math.max(0.3, Math.min(8, v))) },
  stress:     { group: 'pen',       w: 1,   tf: v => v },
  exitTail:   { group: 'pen',       w: 1,   tf: v => Math.max(-3, Math.min(6, v)) },
  slant:      { group: 'slant',     w: 1,   tf: v => v },
  termEnd:    { group: 'terminal',  w: 1,   tf: v => v, nan: true },  // n, H: stem-bottom taper (positive round, 0 flat, negative flared)
  tailEnd:    { group: 'terminal',  w: 1,   tf: v => v, nan: true },  // g tail taper: measured, NOT used (agrees with the stem class on 41% of fonts; see v2 results)
  bowlFill:   { group: 'bowl',      w: 1,   tf: v => v },             // silhouette area over box: circle 0.785, square 1
  flatShare:  { group: 'bowl',      w: 1,   tf: v => v, nan: true },  // share of outline with low curvature
  cornerRatio:{ group: 'roundness', w: 1,   tf: v => log(v) },      // radius-based; only used when ROUNDNESS is on
  openFrac:   { group: 'open',      w: 1,   tf: v => v },
  counter:    { group: 'open',      w: 1,   tf: v => v },
  solidity:   { group: 'open',      w: 0.5, tf: v => v },
  serifLen:   { group: 'serifs',    w: 1.25, tf: v => v },
  serifThick: { group: 'serifs',    w: 1,   tf: v => v },
  topLeft:    { group: 'serifs',    w: 0.75, tf: v => Math.max(-1, Math.min(4, v)) },
  holes:      { group: 'gate',      w: 0,   tf: v => v },
  holeSpan:   { group: 'gate',      w: 0,   tf: v => v },
  termCls:    { group: 'gate',      w: 0,   tf: v => v, nan: true },  // 0 flat, 1 round, 2 wedge
  tailCls:    { group: 'gate',      w: 0,   tf: v => v, nan: true },
  sa1:        { group: 'gate',      w: 0,   tf: v => v },
  sa2:        { group: 'gate',      w: 0,   tf: v => v },
  sa3:        { group: 'gate',      w: 0,   tf: v => v },
  sg1:        { group: 'gate',      w: 0,   tf: v => v },
  sg2:        { group: 'gate',      w: 0,   tf: v => v },
  sg3:        { group: 'gate',      w: 0,   tf: v => v }
};

/** Whether the shipped corner-radius group is part of the vectors. Decided on the train split (docs/library-v1-results.md, v2). */
export const ROUNDNESS = false;

export const GROUPS: GroupId[] = ['weight', 'width', 'xheight', 'contrast', 'pen', 'slant', 'terminal', 'bowl', 'roundness', 'open', 'serifs', 'prop'];
/** Base weight per group (controls-v3 5.2, by eye; train-checked). */
export const GROUP_WEIGHT: Record<Exclude<GroupId, 'gate'>, number> = { weight: 1, width: 1, xheight: 0.6, contrast: 0.7, pen: 0.5, slant: 0.8, terminal: 0.6, bowl: 0.9, roundness: 0.8, open: 0.5, serifs: 1, prop: 0.5 };
/** A group whose RMS z difference (averaged over the query letters) passes this vetoes the family: it ranks after every unvetoed family. */
export const VETO: Partial<Record<GroupId, number>> = { weight: 1.5, width: 1.5, bowl: 2, contrast: 2, xheight: 2, open: 2 };
export const P_NORM = 2;
/** Mutable only for evaluation scripts (ablations); the app never touches it. */
export const TUNE: { p: number; gw: Partial<Record<GroupId, number>>; veto: Partial<Record<GroupId, number>> | null } = { p: P_NORM, gw: {}, veto: null };

const BASE: FeatureId[] = ['stemRel', 'thinRel', 'density', 'aspect', 'contrast', 'stress', 'slant', ...(ROUNDNESS ? ['cornerRatio' as FeatureId] : []), 'openFrac', 'counter', 'solidity'];
const STEMMED: FeatureId[] = [...BASE, 'serifLen', 'serifThick', 'topLeft', 'exitTail'];
export const FEATS_BY_LETTER: Record<Letter, FeatureId[]> = {
  a: [...BASE, 'holes', 'holeSpan', 'sa1', 'sa2', 'sa3'],
  e: BASE,
  o: [...BASE, 'bowlFill', 'flatShare'],
  O: [...BASE, 'bowlFill', 'flatShare'],
  g: [...BASE, 'desc', 'holes', 'holeSpan', 'sg1', 'sg2', 'sg3'],
  n: [...STEMMED, 'xRatio', 'termEnd', 'termCls'],
  H: [...STEMMED, 'termEnd', 'termCls']
};
export const MAX_FEATS = 20;
export const Z_CLIP = 3;
/** z values are stored as Int8 in steps of 1/Q_STEP. -128 marks "letter missing" (first slot) or "value missing" (any other slot). */
export const Q_STEP = 20;

export type LetterStats = { mean: number[]; sd: number[] };

export function tfValue(f: FeatureId, m: Measures): number {
  const raw = m[f] as number | null;
  if (raw === null || raw === undefined) return NaN;
  const v = FEATURES[f].tf(raw);
  return Number.isFinite(v) ? v : NaN;
}
export function zVector(letter: Letter, m: Measures, st: LetterStats): number[] {
  return FEATS_BY_LETTER[letter].map((f, i) => {
    let v = (tfValue(f, m) - st.mean[i]) / st.sd[i];
    if (!Number.isFinite(v)) v = FEATURES[f].nan ? NaN : 0;
    return Number.isNaN(v) ? NaN : Math.max(-Z_CLIP, Math.min(Z_CLIP, v));
  });
}
/** Raw (un-transformed is not recoverable for logs; gates use identity-transformed features only: holes, holeSpan, slant, votes, classes). */
export function rawFromZ(letter: Letter, f: FeatureId, zq: number, st: LetterStats): number {
  const i = FEATS_BY_LETTER[letter].indexOf(f); return i < 0 ? NaN : zq * st.sd[i] + st.mean[i];
}

/** Per-letter layout used by the distance: group index and weight of each feature. */
export const LAYOUT: Record<Letter, { g: number[]; w: number[] }> = Object.fromEntries(LETTERS.map(L => [L, {
  g: FEATS_BY_LETTER[L].map(f => GROUPS.indexOf(FEATURES[f].group as GroupId)),
  w: FEATURES_W(L)
}])) as unknown as Record<Letter, { g: number[]; w: number[] }>;
/** Per-letter weight overrides: stem thickness against the x-height is read on n above all (H is measured against the capital height). */
const LETTER_W: Partial<Record<Letter, Partial<Record<FeatureId, number>>>> = { n: { stemRel: 3 }, o: { stemRel: 2 } };
for (const L of LETTERS) { const ov = LETTER_W[L]; if (ov) FEATS_BY_LETTER[L].forEach((f, i) => { if (ov[f] !== undefined) LAYOUT[L].w[i] = ov[f] as number; }); }
function FEATURES_W(L: Letter) { return FEATS_BY_LETTER[L].map(f => FEATURES[f].w); }

const gwOf = (k: number, scale?: Partial<Record<GroupId, number>>) => (TUNE.gw[GROUPS[k]] ?? GROUP_WEIGHT[GROUPS[k] as keyof typeof GROUP_WEIGHT]) * (scale?.[GROUPS[k]] ?? 1);
const _s = new Float64Array(GROUPS.length), _sw = new Float64Array(GROUPS.length);

/** Grouped distance between two z vectors of one letter: RMS inside each group, then a p-norm across groups (p=2).
 * Missing values (NaN) on either side are skipped. If gOut is given it receives each group's RMS (NaN where the group has no value). */
export function groupedDist(a: ArrayLike<number>, b: ArrayLike<number>, L: Letter, scale?: Partial<Record<GroupId, number>>, gOut?: Float64Array): number {
  const { g, w } = LAYOUT[L];
  const s = _s.fill(0), sw = _sw.fill(0);
  for (let i = 0; i < g.length; i++) { if (g[i] < 0) continue; const d = a[i] - b[i]; if (d !== d) continue; s[g[i]] += w[i] * d * d; sw[g[i]] += w[i]; }
  let num = 0, den = 0; const p = TUNE.p;
  for (let k = 0; k < GROUPS.length; k++) {
    if (!sw[k]) { if (gOut) gOut[k] = NaN; continue; }
    const rms = Math.sqrt(s[k] / sw[k]); if (gOut) gOut[k] = rms;
    const gw = gwOf(k, scale);
    num += gw * (p === 2 ? rms * rms : Math.pow(rms, p)); den += gw;
  }
  if (!den) return 0;
  return p === 2 ? Math.sqrt(num / den) : Math.pow(num / den, 1 / p);
}
