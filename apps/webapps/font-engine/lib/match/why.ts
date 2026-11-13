// Turn per-group differences into plain words a non-expert understands. No numbers leave this file.
// Reads the same z vectors the ranking reads. Thresholds are in library standard deviations, except weight and width, which are said in linear terms:
// "same" only when the stem (or letter width) is within 12% of the query's, so the words agree with what a person measures on screen.
// Order: the matching trait that is most distinctive in the query leads, and the difference with the biggest gap leads.
import { FEATS_BY_LETTER, FEATURES, GROUP_WEIGHT, Q_STEP, type FeatureId, type GroupId, type Letter, type LetterStats } from './features';

type Spec = { label: string; primary: FeatureId[]; up: string; down: string; only?: Letter[] };
// "up" / "down" describe the FONT relative to the letter the person shaped.
const GROUPS: Partial<Record<GroupId, Spec>> = {
  weight:    { label: 'weight', primary: ['stemRel', 'thinRel', 'density'], up: 'heavier', down: 'lighter' },
  width:     { label: 'width', primary: ['aspect'], up: 'wider', down: 'narrower' },
  roundness: { label: 'roundness', primary: ['cornerRatio'], up: 'sharper corners', down: 'rounder corners' },
  terminal:  { label: 'stroke ends', primary: ['termEnd', 'tailEnd'], up: 'rounder stroke ends', down: 'flatter stroke ends' },
  bowl:      { label: 'bowl shape', primary: ['bowlFill'], up: 'squarer bowls', down: 'rounder bowls' },
  xheight:   { label: 'x-height', primary: ['xRatio'], up: 'taller lowercase', down: 'shorter lowercase', only: ['n'] },
  slant:     { label: 'slant', primary: ['slant'], up: 'leans {s}further to the right', down: '{s}more upright' },
  contrast:  { label: 'thick and thin strokes', primary: ['contrast'], up: 'more difference between thick and thin strokes', down: 'more even stroke thickness' },
  serifs:    { label: 'serifs', primary: ['serifLen'], up: 'bigger serifs', down: 'smaller or no serifs', only: ['n', 'H'] },
  open:      { label: 'open shapes', primary: ['openFrac'], up: 'more open letter shapes', down: 'more closed letter shapes' },
  pen:       { label: 'pen-written feel', primary: ['stress', 'exitTail'], up: 'more pen-written strokes', down: 'more constructed, less pen-written strokes' },
  prop:      { label: 'tail length', primary: ['desc'], up: 'longer tails', down: 'shorter tails', only: ['g'] }
};
const ORDER: GroupId[] = ['weight', 'width', 'terminal', 'bowl', 'roundness', 'contrast', 'serifs', 'xheight', 'slant', 'open', 'pen', 'prop'];
const MATCH_BELOW = 0.5;
const LIN_SAME = Math.log(1.12);

export type Explained = {
  matches: string[]; differs: string[]; worst: number;
  /** groups with a measured gap, biggest share of the distance first */
  groups: { g: GroupId; name: string; mag: number; share: number }[];
  /** how many groups are more than 1 SD off */
  over1: number;
  /** mean query z of the serif feature (callers replace the serif wording with the serif class when they know it) */
  serifQuery: number;
};

export function explain(letters: Letter[], qz: number[][], fontZ: (li: number) => ArrayLike<number> | null, stats?: Record<Letter, LetterStats>): Explained {
  const acc: Record<string, { sq: number; n: number; sg: number; sn: number; qz: number; lin: number; ln: number }> = {};
  letters.forEach((L, li) => {
    const fz = fontZ(li); if (!fz) return;
    FEATS_BY_LETTER[L].forEach((f, i) => {
      const g = FEATURES[f].group, spec = GROUPS[g];
      if (!spec || (spec.only && !spec.only.includes(L))) return;
      if (fz[i] === -128 || !Number.isFinite(qz[li][i])) return;
      const d = fz[i] / Q_STEP - qz[li][i];
      const a = (acc[g] ??= { sq: 0, n: 0, sg: 0, sn: 0, qz: 0, lin: 0, ln: 0 });
      a.sq += d * d; a.n++;
      if (spec.primary.includes(f)) {
        a.sg += d; a.sn++; a.qz += qz[li][i];
        // weight and width are logs: the z difference times the library sd is a log ratio, i.e. a linear percentage
        if (stats && ((f === 'stemRel' && (L === 'n' || L === 'o' || L === 'H' || L === 'O')) || (f === 'aspect' && (L === 'n' || L === 'o')))) { a.lin += d * stats[L].sd[i]; a.ln++; }
      }
    });
  });
  let worst = 0, over1 = 0, total = 0;
  const matches: { s: string; m: number }[] = [], differs: { s: string; m: number }[] = [], groups: Explained['groups'] = [];
  for (const g of ORDER) {
    const a = acc[g], spec = GROUPS[g]; if (!a || !a.n || !spec) continue;
    const mag = Math.sqrt(a.sq / a.n); if (mag > worst) worst = mag;
    const w = GROUP_WEIGHT[g as keyof typeof GROUP_WEIGHT] ?? 0.5; total += w * mag * mag; groups.push({ g, name: spec.label, mag, share: w * mag * mag });
    if (mag > 1 && g !== 'prop') over1++;
    const q = a.sn ? a.qz / a.sn : 0, dir = a.sn ? a.sg / a.sn : 0;
    let same = mag < MATCH_BELOW, diffDir = dir, diffMag = mag;
    if ((g === 'weight' || g === 'width') && a.ln) {
      // the sentence follows the linear ratio of stem (or width): same within 12%
      const lr = a.lin / a.ln;
      same = Math.abs(lr) < LIN_SAME && mag < 1; diffDir = lr; diffMag = Math.max(mag, Math.abs(lr) / 0.22); // 0.22 = a 25% change reads as "much"
    }
    if (same) {
      let label = spec.label;
      if (g === 'serifs') label = q > 0.3 ? 'serifs' : 'no serifs';
      else if (g === 'slant') { if (q <= 0.5) continue; }
      else if (g === 'pen') { if (q <= 0.3) continue; }
      matches.push({ s: label, m: Math.abs(q) + 0.05 });
      continue;
    }
    const phrase = diffDir >= 0 ? spec.up : spec.down;
    const strength = diffMag < 1 ? 'slightly ' : diffMag > 2 ? 'much ' : '';
    differs.push({ s: phrase.includes('{s}') ? phrase.replace('{s}', strength) : strength + phrase, m: diffMag });
  }
  matches.sort((a, b) => b.m - a.m); differs.sort((a, b) => b.m - a.m);
  groups.forEach(x => { x.share = total > 0 ? x.share / total : 0; }); groups.sort((a, b) => b.share - a.share);
  const sa = acc.serifs; const serifQuery = sa && sa.sn ? sa.qz / sa.sn : 0;
  return { matches: matches.slice(0, 4).map(x => x.s), differs: differs.slice(0, 3).map(x => x.s), worst, groups, over1, serifQuery };
}
