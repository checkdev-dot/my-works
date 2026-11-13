// Discrete facts about a font or a query, read from raw measures (query outlines) or decoded from z vectors (library fonts):
// storey votes for a and g, terminal class, serif presence. Same rules both ways, so a library font used as a query behaves like a drawn one.
import type { FeatureId, Letter } from './features';

/** votes: a1 a2 a3 g1 g2 g3, each 0 (abstain), 1 (one-storey) or 2 (two-storey). tcls: 0 flat, 1 round, 2 wedge, -1 unknown. serif: 1 serifs, 0 none, -1 unclear. */
export type Facts = { votes: number[]; tcls: number; serif: number };
export type Getter = (L: Letter, f: FeatureId) => number;

const VOTE_IDS: [Letter, FeatureId][] = [['a', 'sa1'], ['a', 'sa2'], ['a', 'sa3'], ['g', 'sg1'], ['g', 'sg2'], ['g', 'sg3']];
const clsOf = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(2, Math.round(v))) : -1);

export function factsFrom(get: Getter): Facts {
  const votes = VOTE_IDS.map(([L, f]) => { const v = get(L, f); return Number.isFinite(v) ? Math.max(0, Math.min(2, Math.round(v))) : 0; });
  const cl = [get('n', 'termCls'), get('H', 'termCls')].map(clsOf).filter(c => c >= 0);
  let tcls = -1;
  if (cl.length) { const cnt = [0, 0, 0]; cl.forEach(c => cnt[c]++); const best = Math.max(...cnt); if (best * 2 > cl.length) tcls = cnt.indexOf(best); }
  const sl = [get('n', 'serifLen'), get('H', 'serifLen')].filter(Number.isFinite);
  const m = sl.length ? sl.reduce((s, v) => s + v, 0) / sl.length : NaN;
  const serif = !Number.isFinite(m) ? -1 : m >= SERIF_ON ? 1 : m <= SERIF_OFF ? 0 : -1;
  return { votes, tcls, serif };
}
export const SERIF_ON = 0.4, SERIF_OFF = 0.15;

/** Majority of three votes: 1 or 2, or 0 when there is no majority. */
export function majority(v: number[], off: number): 0 | 1 | 2 {
  const c1 = (v[off] === 1 ? 1 : 0) + (v[off + 1] === 1 ? 1 : 0) + (v[off + 2] === 1 ? 1 : 0);
  const c2 = (v[off] === 2 ? 1 : 0) + (v[off + 1] === 2 ? 1 : 0) + (v[off + 2] === 2 ? 1 : 0);
  return c2 >= 2 ? 2 : c1 >= 2 ? 1 : 0;
}
/** How many of the three library-side votes for letter a (off 0) or g (off 3) say the other build than `want`. */
export function votesAgainst(v: number[], off: number, want: 1 | 2): number {
  const other = want === 1 ? 2 : 1;
  return (v[off] === other ? 1 : 0) + (v[off + 1] === other ? 1 : 0) + (v[off + 2] === other ? 1 : 0);
}
/** Soft penalty added to the distance multiplier per letter: 0, 0.1 when one vote disagrees, 0.5 when the majority does. */
export const STOREY_PENALTY = [0, 0.1, 0.5, 0.5];
