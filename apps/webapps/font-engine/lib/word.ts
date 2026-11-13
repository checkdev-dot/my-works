// The word the person types: what the four tiles can draw, what moves a given letter, and how to say a change.
import data from "./glyph-data.json";
import { DIALS, type DialId, type DialState } from "./clay";

export const MAX_WORD = 24;
const CHARSET = new Set(Array.from(data.charset as string));
const PRESENCE = data.presence as Record<string, DialId[]>;

export type Cleaned = { text: string; dropped: string[]; cut: number };

/** Keep what every tile can draw. Say what was left out, never lose it silently. */
export function cleanWord(raw: string): Cleaned {
  const dropped: string[] = [];
  let kept = "";
  for (const ch of Array.from(raw.replace(/\s+/g, " "))) {
    if (CHARSET.has(ch)) kept += ch;
    else if (!dropped.includes(ch)) dropped.push(ch);
  }
  kept = kept.replace(/^ /, "");
  const chars = Array.from(kept);
  const cut = Math.max(0, chars.length - MAX_WORD);
  return { text: chars.slice(0, MAX_WORD).join(""), dropped, cut };
}

/** Does this dial change this letter on Plain? Measured from the font file by scripts/make-glyph-data.mjs. */
export function affects(dial: DialId, ch: string): boolean {
  if (ch === " ") return false;
  const hit = PRESENCE[ch] ?? PRESENCE[ch.normalize("NFD")[0]] ?? [];
  return hit.includes(dial);
}

export const dialsOnLetter = (ch: string) => DIALS.filter((d) => affects(d.id, ch)).map((d) => d.id);
export const dialsInWord = (word: string) => {
  const s = new Set<DialId>();
  for (const ch of Array.from(word)) for (const d of dialsOnLetter(ch)) s.add(d);
  return s;
};

const WORDS: Record<DialId, [string, string]> = {
  thick: ["thinner", "thicker"],
  wide: ["narrower", "wider"],
  lean: ["more upright", "leaning"],
  openings: ["tighter inside", "roomier inside"],
  middle: ["shorter middles", "taller middles"],
  tall: ["shorter tall letters", "taller tall letters"],
  tails: ["shorter tails", "longer tails"],
  caps: ["shorter capitals", "taller capitals"],
  contrast: ["more even", "more thick and thin"],
};

/** "Thicker and a little wider." from the dials that moved */
export function describe(st: DialState): string {
  const parts: string[] = [];
  for (const d of DIALS) {
    const u = st[d.id] ?? 0;
    if (Math.abs(u) < 0.02) continue;
    const w = WORDS[d.id][u > 0 ? 1 : 0];
    parts.push(Math.abs(u) < 0.35 ? `a little ${w}` : w);
  }
  if (!parts.length) return "";
  const s = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}
