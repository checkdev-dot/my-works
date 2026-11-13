// Clay families: the four Character tiles and the dials that truly act on each.
// A dial is an axis. Its position is stored as `u`, a signed fraction of travel away from home:
// 0 is home, +1 is the "more" end of the axis, -1 is the "less" end. Because it is relative to
// each family's own home, a family switch keeps what a dial means and nothing jumps.

export type FamilyId = "plain" | "squarish" | "rounded" | "feet";
export type DialId = "thick" | "wide" | "lean" | "openings" | "middle" | "tall" | "tails" | "caps" | "contrast";

export type DialDef = {
  id: DialId;
  label: string;
  /** What this dial does, in plain words. Read by screen readers and shown on hover. */
  definition: string;
  less: string;
  more: string;
  group: "main" | "more";
  /** Shown in the rail. The rest live in the zoomed view, on the letters they change (controls-v4 section 3). */
  rail: boolean;
};

export const DIALS: DialDef[] = [
  { id: "thick", label: "Thick", definition: "How heavy the strokes are", less: "hairline", more: "black", group: "main", rail: true },
  { id: "wide", label: "Wide", definition: "How much room each letter takes sideways", less: "narrow", more: "wide", group: "main", rail: true },
  { id: "lean", label: "Lean", definition: "Whether the letters slope to the right", less: "upright", more: "leaning", group: "main", rail: true },
  { id: "openings", label: "Openings", definition: "The space inside letters like a, e and o", less: "tight", more: "roomy", group: "more", rail: true },
  { id: "middle", label: "Middle height", definition: "How tall small letters are next to capitals", less: "short", more: "tall", group: "more", rail: true },
  { id: "tall", label: "Tall letters", definition: "How far b, d, h, k and l rise", less: "short", more: "tall", group: "more", rail: false },
  { id: "tails", label: "Tails", definition: "How far g, j, p, q and y hang below", less: "short", more: "long", group: "more", rail: false },
  { id: "caps", label: "Capitals", definition: "How tall capital letters are", less: "short", more: "tall", group: "more", rail: false },
  { id: "contrast", label: "Thick-thin", definition: "How much thinner the flat strokes are than the upright ones", less: "even", more: "varied", group: "more", rail: true },
];

export type AxisDial = { axis: string; less: number; more: number; home: number };

export type Family = {
  id: FamilyId;
  label: string;
  name: string; // real font name
  css: string; // CSS font-family
  file: string;
  /** Fontsource id in the library, excluded from results */
  libraryId: string;
  googleUrl: string;
  /** Axes held at fixed values, not exposed as dials */
  held: Record<string, number>;
  dials: Partial<Record<DialId, AxisDial>>;
  /** x-height and cap-height as fractions of the em, for the marker */
  xh: number;
  cap: number;
  /** Letters to mark, in order of preference */
  mark: string;
  /** One line on what this tile is, for hover and focus */
  blurb: string;
  /** End words that tell the truth for this file, where they differ from the default */
  ends?: Partial<Record<DialId, [string, string]>>;
  /** Lean is a second file, not an axis: the family ships its italics separately. Lean 0 draws the upright file, 1 the italic one. */
  italic?: { css: string; file: string };
};

export const FAMILIES: Family[] = [
  {
    id: "plain", label: "Plain", name: "Roboto Flex", css: "FE Plain", file: "/fonts/RobotoFlex.ttf",
    libraryId: "roboto-flex", googleUrl: "https://fonts.google.com/specimen/Roboto+Flex",
    held: { opsz: 36 }, xh: 0.514, cap: 0.711, mark: "aengH",
    blurb: "Even and neutral.",
    dials: {
      thick: { axis: "wght", less: 100, more: 1000, home: 400 },
      wide: { axis: "wdth", less: 40, more: 151, home: 100 },
      lean: { axis: "slnt", less: 0, more: -10, home: 0 },
      openings: { axis: "XTRA", less: 323, more: 603, home: 468 },
      middle: { axis: "YTLC", less: 416, more: 570, home: 514 },
      tall: { axis: "YTAS", less: 649, more: 854, home: 750 },
      tails: { axis: "YTDE", less: -98, more: -305, home: -203 },
      caps: { axis: "YTUC", less: 528, more: 760, home: 712 },
      contrast: { axis: "YOPQ", less: 105, more: 25, home: 79 },
    },
  },
  {
    id: "squarish", label: "Squarish", name: "Saira", css: "FE Squarish", file: "/fonts/Saira.ttf",
    libraryId: "saira", googleUrl: "https://fonts.google.com/specimen/Saira",
    held: {}, xh: 0.51, cap: 0.688, mark: "aengH",
    blurb: "Squared curves, a technical feel.",
    dials: {
      thick: { axis: "wght", less: 100, more: 900, home: 400 },
      wide: { axis: "wdth", less: 50, more: 125, home: 100 },
    },
  },
  {
    id: "rounded", label: "Rounded ends", name: "Nunito", css: "FE Rounded", file: "/fonts/Nunito.ttf",
    libraryId: "nunito", googleUrl: "https://fonts.google.com/specimen/Nunito",
    held: {}, xh: 0.484, cap: 0.705, mark: "aengH",
    blurb: "Soft, round stroke ends.",
    ends: { thick: ["light", "black"] },
    italic: { css: "FE Rounded Italic", file: "/fonts/Nunito-Italic.ttf" },
    dials: {
      thick: { axis: "wght", less: 200, more: 1000, home: 400 },
      lean: { axis: "ital", less: 0, more: 1, home: 0 },
    },
  },
  {
    id: "feet", label: "Feet", name: "Roboto Serif", css: "FE Feet", file: "/fonts/RobotoSerif.ttf",
    libraryId: "roboto-serif", googleUrl: "https://fonts.google.com/specimen/Roboto+Serif",
    held: { opsz: 36, GRAD: 0 }, xh: 0.518, cap: 0.71, mark: "gaenoH",
    blurb: "Small feet, a book feel.",
    dials: {
      thick: { axis: "wght", less: 100, more: 900, home: 400 },
      wide: { axis: "wdth", less: 50, more: 150, home: 100 },
    },
  },
];

export const family = (id: FamilyId) => FAMILIES.find((f) => f.id === id)!;

/** A dial that is a file switch, not a position: the family's italic file. */
export const isSwitch = (d: AxisDial | undefined) => d?.axis === "ital";
export const isItalic = (f: Family, st: DialState) => !!f.italic && (st.lean ?? 0) > 0.5;

const eff = new Map<string, Family>();
/** The family as it is drawn right now: its italic file when Lean is on. Same object each time, so effects keyed on it stay still. */
export function effective(f: Family, st: DialState): Family {
  if (!isItalic(f, st)) return f;
  let e = eff.get(f.id);
  if (!e) {
    e = { ...f, css: f.italic!.css, file: f.italic!.file };
    eff.set(f.id, e);
  }
  return e;
}

export type DialState = Partial<Record<DialId, number>>; // u per dial, missing = home

export const dialsFor = (f: Family) => DIALS.filter((d) => f.dials[d.id]);

/** u (-1..1, 0 home) to the axis value */
export function axisValue(d: AxisDial, u: number): number {
  return u >= 0 ? d.home + u * (d.more - d.home) : d.home + -u * (d.less - d.home);
}

/** axis value to u */
export function toU(d: AxisDial, v: number): number {
  const s = v - d.home;
  if (s === 0) return 0;
  const up = d.more - d.home;
  if (up !== 0 && Math.sign(s) === Math.sign(up)) return Math.min(1, s / up);
  const dn = d.less - d.home;
  return dn === 0 ? 0 : -Math.min(1, s / dn);
}

/** Position along the track, 0 = less end, 1 = more end */
export function trackPos(d: AxisDial, u: number): number {
  return (axisValue(d, u) - d.less) / (d.more - d.less);
}
export function fromTrack(d: AxisDial, p: number): number {
  const c = Math.max(0, Math.min(1, p));
  return toU(d, d.less + c * (d.more - d.less));
}

const round = (n: number) => Math.round(n * 10) / 10;

export function axes(f: Family, st: DialState): Record<string, number> {
  const out: Record<string, number> = { ...f.held };
  for (const id of Object.keys(f.dials) as DialId[]) {
    const d = f.dials[id]!;
    if (isSwitch(d)) continue; // a file, not an axis
    out[d.axis] = round(axisValue(d, st[id] ?? 0));
  }
  return out;
}

/** Full, stable-ordered list so CSS can interpolate between any two states */
export function variationCss(f: Family, st: DialState): string {
  const a = axes(f, st);
  return Object.keys(a).sort().map((k) => `"${k}" ${a[k]}`).join(", ");
}

/** The marked letter: the one that carries the most character among those typed */
export function markedIndex(f: Family, word: string): number {
  for (const ch of f.mark) {
    const i = word.indexOf(ch);
    if (i >= 0) return i;
  }
  return word.search(/\S/);
}
