// Drag handles on the zoomed letter: where each edge is, measured from the shaped outline at the letter's current axes.
// A handle is one dial seen as one edge of the letter. Dragging the square inverts the sweep's step table, so the edge under the
// square follows the pointer. When an edge travels too little to grab, the table is stretched instead of the handle being dropped.
import { axes, fromTrack, type DialId, type DialState, type Family } from "@/lib/clay";

type FKFont = import("fontkit").Font;
type Pt = [number, number];

/** Which measured edge of the letter a dial moves. c is the position that changes, along is where on the edge the square sits. */
export type Kind = "right" | "left" | "stemR" | "stemR2" | "stemR3" | "stemR4" | "top" | "topL" | "bottom" | "lean" | "lean2" | "counterL" | "counterR";
export type Dir = "right" | "left" | "up" | "down";
export const isVertical = (k: Kind) => k === "top" || k === "topL" || k === "bottom";

export type Handle = {
  dial: DialId;
  kind: Kind;
  verb: string;
  /** The way the pointer goes to get more */
  dir: Dir;
  /** Pixels of pointer per pixel of edge: above 1 when the edge travels too little to grab */
  gain: number;
  /** The edge does not move cleanly with the dial, so the pointer maps to the dial in a straight line instead */
  synthetic: boolean;
};

const MIN_TRAVEL = 80; // px across the live range at the zoomed scale (controls-v4 section 2); shorter is scaled, not dropped
const SYNTH = 110; // px of pointer across the live range when the edge cannot be followed
const MIN_GAP = 44; // px between handle centres
const MAX_HANDLES = 5;
const STEPS = 24;

type Rule = { dial: DialId; kinds: Kind[]; verb: string; /** The pointer moves the edge one to one, never stretched */ exact?: boolean };
/** In the order they are offered. Five at most; the rest of what the letter has stays a row. */
const RULES: Rule[] = [
  { dial: "thick", kinds: ["stemR", "stemR2", "stemR3", "stemR4"], verb: "Thicker", exact: true },
  { dial: "wide", kinds: ["right"], verb: "Wider" },
  { dial: "lean", kinds: ["lean", "lean2"], verb: "More lean" },
  { dial: "openings", kinds: ["counterR", "counterL"], verb: "Roomier" },
  { dial: "middle", kinds: ["top", "topL"], verb: "Higher middle" },
  { dial: "caps", kinds: ["top", "topL"], verb: "Taller capitals" },
  { dial: "tall", kinds: ["top", "topL"], verb: "Taller" },
  { dial: "tails", kinds: ["bottom"], verb: "Longer tail" },
];
const MIDDLE_LETTERS = "acemnorsuvwxzg";

// ---- font and outline

const loading = new Map<string, Promise<FKFont>>();
const base = new Map<string, FKFont>();
export function loadFont(f: Family): Promise<FKFont> {
  let p = loading.get(f.file);
  if (!p) {
    p = import("fontkit").then(async (mod) => {
      const r = await fetch(f.file);
      if (!r.ok) throw new Error("font file " + r.status);
      const font = mod.create(new Uint8Array(await r.arrayBuffer()) as never) as FKFont;
      base.set(f.file, font);
      return font;
    });
    loading.set(f.file, p);
  }
  return p;
}
export const fontReady = (f: Family) => base.has(f.file);

type Outline = { contours: Pt[][]; pts: Pt[]; minX: number; maxX: number; minY: number; maxY: number };
const outlines = new Map<string, Outline | null>();

/** The shaped glyph as dense points: curves are subdivided so a straight or curved edge has a point wherever a square could sit. */
function outlineAt(f: Family, st: DialState, ch: string, feat: string[] = []): Outline | null {
  const b = base.get(f.file);
  if (!b) return null;
  const a = axes(f, st);
  const key = f.file + "|" + ch + "|" + feat.join("+") + "|" + Object.keys(a).sort().map((k) => k + a[k]).join(",");
  if (outlines.has(key)) return outlines.get(key)!;
  if (outlines.size > 1500) outlines.clear();
  const font = b.getVariation(a) as FKFont;
  const g = font.layout(ch, ["liga", "rvrn", "locl", ...feat]).glyphs[0];
  const upem = font.unitsPerEm;
  const step = upem * 0.012;
  const contours: Pt[][] = [];
  let cur: Pt[] = [];
  let at: Pt = [0, 0];
  let start: Pt = [0, 0];
  const seg = (to: Pt, ctrl: Pt[]) => {
    const pts = [at, ...ctrl, to];
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const n = Math.max(1, Math.min(48, Math.ceil(len / step)));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      if (ctrl.length === 0) cur.push([at[0] + (to[0] - at[0]) * t, at[1] + (to[1] - at[1]) * t]);
      else if (ctrl.length === 1) cur.push([u * u * at[0] + 2 * u * t * ctrl[0][0] + t * t * to[0], u * u * at[1] + 2 * u * t * ctrl[0][1] + t * t * to[1]]);
      else cur.push([u * u * u * at[0] + 3 * u * u * t * ctrl[0][0] + 3 * u * t * t * ctrl[1][0] + t * t * t * to[0], u * u * u * at[1] + 3 * u * u * t * ctrl[0][1] + 3 * u * t * t * ctrl[1][1] + t * t * t * to[1]]);
    }
    at = to;
  };
  for (const c of g.path.commands) {
    const v = c.args;
    if (c.command === "moveTo") {
      if (cur.length) contours.push(cur);
      at = [v[0], v[1]];
      start = at;
      cur = [at];
    } else if (c.command === "closePath") {
      if (at[0] !== start[0] || at[1] !== start[1]) seg(start, []); // the closing edge is an edge too
    } else if (c.command === "lineTo") seg([v[0], v[1]], []);
    else if (c.command === "quadraticCurveTo") seg([v[2], v[3]], [[v[0], v[1]]]);
    else if (c.command === "bezierCurveTo") seg([v[4], v[5]], [[v[0], v[1]], [v[2], v[3]]]);
  }
  if (cur.length) contours.push(cur);
  let out: Outline | null = null;
  const cs = contours.map((c) => c.map((p) => [p[0] / upem, p[1] / upem] as Pt));
  const pts = cs.flat();
  if (pts.length) {
    out = {
      contours: cs,
      pts,
      minX: Math.min(...pts.map((p) => p[0])),
      maxX: Math.max(...pts.map((p) => p[0])),
      minY: Math.min(...pts.map((p) => p[1])),
      maxY: Math.max(...pts.map((p) => p[1])),
    };
  }
  outlines.set(key, out);
  return out;
}

export type Edge = { /** em from the pen origin (x kinds) or the baseline (y kinds) */ c: number; /** where along the edge the square sits, em in the other direction */ along: number };

const median = (a: Pt[], i: 0 | 1) => [...a].sort((p, q) => p[i] - q[i])[Math.floor(a.length / 2)];

/** The edge of the shaped letter at these dials. Null until the font file is here or when the letter has no such edge. */
export function edgeAt(f: Family, st: DialState, ch: string, kind: Kind, feat: string[] = []): Edge | null {
  const o = outlineAt(f, st, ch, feat);
  if (!o) return null;
  const tol = 0.006;
  const cx = (o.minX + o.maxX) / 2;
  switch (kind) {
    case "right": {
      const on = o.pts.filter((p) => p[0] >= o.maxX - tol);
      return { c: o.maxX, along: median(on, 1)[1] };
    }
    case "stemR":
    case "stemR2":
    case "stemR3":
    case "stemR4": {
      // The first stroke met on a scanline low in the x-height, read from the left: its far edge is the side the stroke grows toward when Thick goes up,
      // so it moves by the whole change in stroke width and the pointer can follow it one to one. (The glyph's leftmost point moves a fraction of that.)
      // three heights, tried in turn, so the square can clear another handle without leaving the stem
      const y0 = f.xh * (kind === "stemR" ? 0.32 : kind === "stemR2" ? 0.62 : kind === "stemR3" ? 0.12 : 0.85);
      const xs: number[] = [];
      for (const c of o.contours) {
        for (let i = 0; i < c.length; i++) {
          const p = c[i], q = c[(i + 1) % c.length];
          if ((p[1] <= y0) !== (q[1] <= y0)) xs.push(p[0] + ((y0 - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] >= 0.008) return { c: xs[i + 1], along: y0 };
      return null;
    }
    case "left": {
      const on = o.pts.filter((p) => p[0] <= o.minX + tol);
      return { c: o.minX, along: median(on, 1)[1] };
    }
    case "top": {
      const on = o.pts.filter((p) => p[1] >= o.maxY - tol);
      const p = on.reduce((a, q) => (Math.abs(q[0] - cx) < Math.abs(a[0] - cx) ? q : a));
      return { c: o.maxY, along: p[0] };
    }
    case "topL": {
      const on = o.pts.filter((p) => p[1] >= o.maxY - tol);
      const p = on.reduce((a, q) => (q[0] < a[0] ? q : a));
      return { c: o.maxY, along: p[0] };
    }
    case "bottom": {
      const on = o.pts.filter((p) => p[1] <= o.minY + tol);
      const p = on.reduce((a, q) => (Math.abs(q[0] - cx) < Math.abs(a[0] - cx) ? q : a));
      return { c: o.minY, along: p[0] };
    }
    case "lean": {
      const p = o.pts.reduce((a, q) => (q[0] + q[1] > a[0] + a[1] ? q : a));
      return { c: p[0], along: p[1] };
    }
    case "lean2": {
      const hi = o.pts.filter((p) => p[1] >= o.maxY * 0.7);
      const p = hi.reduce((a, q) => (q[0] > a[0] ? q : a));
      return { c: p[0], along: p[1] };
    }
    case "counterL":
    case "counterR": {
      const area = (c: Pt[]) => {
        const xs = c.map((p) => p[0]);
        const ys = c.map((p) => p[1]);
        return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      };
      const inner = [...o.contours].sort((a, b) => area(b) - area(a)).slice(1);
      if (!inner.length) return null;
      const c = inner[0];
      if (kind === "counterL") {
        const m = Math.min(...c.map((p) => p[0]));
        return { c: m, along: median(c.filter((p) => p[0] <= m + tol), 1)[1] };
      }
      const m = Math.max(...c.map((p) => p[0]));
      return { c: m, along: median(c.filter((p) => p[0] >= m - tol), 1)[1] };
    }
  }
}

/** Where the letter's ink spans at these dials, in em. */
export function extent(f: Family, st: DialState, ch: string, feat: string[] = []) {
  const o = outlineAt(f, st, ch, feat);
  return o ? { minX: o.minX, maxX: o.maxX, minY: o.minY, maxY: o.maxY } : null;
}

const tables = new Map<string, number[] | null>();
/** Edge position in em at each of the 25 steps of a dial, other dials held where they are. This is the mapping table. */
export function sweep(f: Family, st: DialState, ch: string, dial: DialId, kind: Kind, feat: string[] = []): number[] | null {
  const ax = f.dials[dial];
  if (!ax) return null;
  const rest = { ...st, [dial]: 0 };
  const key = f.id + "|" + ch + "|" + feat.join("+") + "|" + dial + "|" + kind + "|" + JSON.stringify(Object.entries(rest).filter(([, v]) => v).sort());
  if (tables.has(key)) return tables.get(key)!;
  if (tables.size > 400) tables.clear();
  const out: number[] = [];
  let ok = true;
  for (let k = 0; k <= STEPS; k++) {
    const e = edgeAt(f, { ...st, [dial]: fromTrack(ax, k / STEPS) }, ch, kind, feat);
    if (!e) {
      ok = false;
      break;
    }
    out.push(e.c);
  }
  const t = ok ? out : null;
  tables.set(key, t);
  return t;
}

/** The edge never turns back along the dial and travels far enough to grab. */
function cleanEdge(t: number[], Z: number): boolean {
  const sg = Math.sign(t[STEPS] - t[0]) || 1;
  return Math.abs(t[STEPS] - t[0]) * Z >= 30 && !t.some((v, i) => i > 0 && (v - t[i - 1]) * sg < -1e-3);
}

const defaultDir: Record<Kind, Dir> = { right: "right", left: "left", stemR: "right", stemR2: "right", stemR3: "right", stemR4: "right", top: "up", topL: "up", bottom: "down", lean: "right", lean2: "right", counterL: "left", counterR: "right" };

/** Which handles this letter gets: the dials it has whose edge can be followed, at most five. `has` says whether a dial acts on this letter. */
export function plan(f: Family, st: DialState, ch: string, Z: number, has: (d: DialId) => boolean, feat: string[] = []): { handles: Handle[]; reach: number } {
  const none = { handles: [] as Handle[], reach: 0.8 };
  if (!fontReady(f) || !ch) return none;
  const out: Handle[] = [];
  const placed: Pt[] = [];
  for (const r of RULES) {
    if (out.length >= MAX_HANDLES) break;
    if (!f.dials[r.dial] || !has(r.dial)) continue;
    if (f.dials[r.dial]!.axis === "ital") continue;
    if (r.dial === "middle" && !MIDDLE_LETTERS.includes(ch)) continue;
    let best: { kind: Kind; t: number[]; net: number } | null = null;
    let clean: { kind: Kind; t: number[]; net: number } | null = null; // first anchor that is monotone and travels enough to follow the pointer
    for (const kind of r.kinds) {
      const t = sweep(f, st, ch, r.dial, kind, feat);
      if (!t) continue;
      const net = t[STEPS] - t[0];
      if (!best || Math.abs(net) > Math.abs(best.net)) best = { kind, t, net };
      if (!clean && cleanEdge(t, Z)) clean = { kind, t, net };
    }
    // a rule that must track the pointer one to one takes the first clean anchor in its order, never a bigger but unrelated edge
    if (r.exact && clean) best = clean;
    if (!best) continue;
    if (Math.abs(best.net) * Z < 1.5) continue; // the dial does not move this letter's edge
    // try the best kind first; another anchor of the same dial is used when the first would sit on another handle
    const kinds = [best.kind, ...r.kinds.filter((k) => k !== best!.kind)];
    let kind: Kind | null = null;
    for (const k of kinds) {
      const e = edgeAt(f, st, ch, k, feat);
      if (!e) continue;
      if (r.exact && k !== best.kind) {
        const tk = sweep(f, st, ch, r.dial, k, feat);
        if (!tk || !cleanEdge(tk, Z)) continue; // the stand-in must be a clean, travelling edge
      }
      const at: Pt = isVertical(k) ? [e.along * Z, -e.c * Z] : [e.c * Z, -e.along * Z];
      if (placed.every((q) => Math.hypot(q[0] - at[0], q[1] - at[1]) >= MIN_GAP)) {
        kind = k;
        placed.push(at);
        break;
      }
    }
    if (!kind) continue;
    const t = kind === best.kind ? best.t : (sweep(f, st, ch, r.dial, kind, feat) ?? best.t);
    const sgn = Math.sign(t[STEPS] - t[0]) || 1;
    let mono = true;
    for (let k = 1; k <= STEPS; k++) if ((t[k] - t[k - 1]) * sgn < -1e-4) mono = false;
    const net = Math.abs(t[STEPS] - t[0]) * Z;
    const vertical = isVertical(kind);
    const dir: Dir = mono && net > 1.5 ? (vertical ? (sgn > 0 ? "up" : "down") : sgn > 0 ? "right" : "left") : defaultDir[kind];
    out.push({ dial: r.dial, kind, verb: r.verb, dir, gain: mono ? (r.exact ? 1 : Math.max(1, MIN_TRAVEL / Math.max(net, 1))) : 1, synthetic: !mono });
  }
  // how far right the letter can reach, so the callouts keep still while Wide moves
  let reach = extent(f, st, ch, feat)?.maxX ?? 0.8;
  if (f.dials.wide) {
    const t = sweep(f, st, ch, "wide", "right", feat);
    if (t) reach = Math.max(reach, ...t);
  }
  return { handles: out, reach };
}

/** Pointer position (px along the handle's axis) at each of the 25 steps, as the drag sees them: stretched around the grab, or a straight line. */
export function pointerTable(h: Handle, table: number[], toPx: (c: number) => number, p0: number): number[] {
  const px = table.map(toPx);
  const at = p0 * STEPS;
  const lo = Math.min(STEPS - 1, Math.floor(at));
  const E0 = px[lo] + (px[lo + 1] - px[lo]) * (at - lo);
  if (h.synthetic) {
    const sign = h.dir === "right" || h.dir === "down" ? 1 : -1;
    return px.map((_, k) => E0 + sign * (k / STEPS - p0) * SYNTH);
  }
  return px.map((v) => E0 + (v - E0) * h.gain);
}

/** Invert the table: the track position (0..1) whose edge sits at target, by linear interpolation. Clamps at the live ends. */
export function invert(table: number[], target: number): { p: number; atEnd: boolean } {
  const inc = table[table.length - 1] >= table[0];
  const v = inc ? table : table.map((x) => -x);
  const t = inc ? target : -target;
  if (t <= v[0]) return { p: 0, atEnd: true };
  if (t >= v[v.length - 1]) return { p: 1, atEnd: true };
  for (let k = 0; k < v.length - 1; k++) {
    if (t >= v[k] && t <= v[k + 1]) {
      const span = v[k + 1] - v[k];
      return { p: (k + (span ? (t - v[k]) / span : 0)) / STEPS, atEnd: false };
    }
  }
  return { p: 0, atEnd: true };
}
