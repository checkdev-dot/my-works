// Shared types for the matcher. Browser-safe: no Node imports anywhere in lib/match.

/** One outline command in EM units, y-UP, origin at (0, baseline). Same convention as the spike. */
export type PathCmd = {
  type: 'M' | 'L' | 'C' | 'Q' | 'Z';
  x?: number; y?: number;
  x1?: number; y1?: number;
  x2?: number; y2?: number;
};

export type QueryGlyph = {
  char: string;
  commands: PathCmd[];
  /** Optional advance width in em. When most letters carry one, the matcher can see monospace and spacing. */
  advance?: number;
};

/** Minimal 2D context surface we use. Satisfied by HTMLCanvas, OffscreenCanvas and @napi-rs/canvas. */
export interface Ctx2D {
  fillStyle: unknown;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void;
  quadraticCurveTo(a: number, b: number, c: number, d: number): void;
  closePath(): void;
  fill(rule?: 'nonzero' | 'evenodd'): void;
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray | Uint8Array };
}
export interface CanvasLike { getContext(kind: '2d', opts?: unknown): Ctx2D | null }
/** Injected by the host: browser passes OffscreenCanvas / HTMLCanvas, Node passes @napi-rs/canvas. */
export type CanvasFactory = (width: number, height: number) => CanvasLike;

export type FontMeta = {
  /** Unique per file: `<familyId>:<weight><i if italic>`, e.g. "abel:400", "roboto:400i". */
  id: string;
  familyId: string;
  family: string;
  category: string;
  license: string;
  /** Where the font came from: 'google' or 'other' (other open fonts Fontsource carries). */
  source: string;
  /** A page where the person can get the font. */
  sourceUrl: string;
  weight: number;
  style: 'normal' | 'italic';
  /** Latin woff2 on jsDelivr so results can be drawn in the real font. */
  fontUrl: string;
  /** Set when the font is built from pixels, dots or segments. Such fonts are skipped unless asked for. */
  construction?: 'pixel' | 'dot-matrix' | 'segment';
  /** Part of the fixed 20% reporting holdout. Has no effect on matching. */
  holdout?: boolean;
  /** Other families that publish this same design (collapsed as duplicates), by name. */
  aliases?: string[];
  /** Design lineage key: first word of the family name plus a hand list (see superfamily.ts). Families with the same key are one superfamily. */
  superfamily?: string;
  /** Capitals-only design (Bebas Neue, Cinzel). Matched on its capitals; its lowercase is not compared. */
  capsOnly?: boolean;
  /** Fixed-pitch design, read from advance widths. */
  mono?: boolean;
  /** Connected script: letters join when set. */
  script?: boolean;
  /** Stencil, inline, outline, shadow, pinstripe or barcode. Off by default (see FindOptions.includeEffects). */
  effect?: string;
  /** Primary script of the family when it is not Latin ("Thai", "Korean"): the Latin letters are a companion design. */
  scriptFirst?: string;
  /** The page to get the font: verified at build, never a dead link. */
  getUrl?: string;
};

export type MatchResult = {
  font: FontMeta;
  why: { matches: string[]; differs: string[] };
  /** True when nothing in the library is genuinely near; the closest fonts are still listed. */
  weak?: boolean;
  /** 0 to 100. Calibrated on how far a real font's first neighbour sits: 95 at the 10th percentile of that distance, 75 at the median, 60 at the 90th, 30 at the median random pair. Capped at 59 when vetoed. */
  match: number;
  /** A group is far off (weight, width, bowl, contrast, x-height, openings beyond 1.5 to 2 SD, or serif or terminal class differs). Vetoed families rank after every unvetoed one. */
  vetoed?: boolean;
  /** Which groups vetoed it, by plain name. */
  vetoGroups?: string[];
  /** Band word that is always safe to show: 'near twin' (90 and up), 'close' (75 to 89), 'same spirit' (60 to 74 or vetoed), 'under 60'. */
  band?: string;
  /** False when the number must not be shown (vetoed rows show the band word only). */
  showNumber?: boolean;
  /** Other families of the same lineage that were folded into this row ("also in this family"). Best first. */
  also?: { family: string; familyId: string; match: number }[];
  /** The groups that drive the number, biggest first. share = their part of the total distance (0..1); gap = how far off, in library standard deviations. */
  drivers?: { group: string; share: number; gap: number }[];
  /** Declared letter forms this font disagrees with, in words ("its a has two storeys"). Hard ones also veto. */
  formMisses?: string[];
  /** Class words for the row: 'monospace', 'script', 'capitals only', or 'Latin from a Thai font'. */
  tags?: string[];
};

export type FindOptions = {
  limit?: number;
  /** Include pixel / dot-matrix / segment fonts (off by default). */
  includeConstruction?: boolean;
  /** Family ids that must not appear (e.g. the families the letters were drawn from, so they cannot win trivially). */
  exclude?: string[];
  /** Tolerance hook: per attribute group multiplier on its weight. Reserved for intent bands; unused in v1. */
  groupScale?: Partial<Record<'weight' | 'width' | 'xheight' | 'contrast' | 'pen' | 'slant' | 'terminal' | 'bowl' | 'roundness' | 'open' | 'serifs', number>>;
  /** Also exclude every family in the superfamily of each id in `exclude` (the clay's whole lineage). Off by default. */
  excludeSuperfamily?: boolean;
  /** Known build of the query's a and g (1 one-storey, 2 two-storey), e.g. from the clay. Used as a fact instead of measuring it. */
  storey?: { a?: 1 | 2; g?: 1 | 2 };
  /** Declared letter forms (see forms.ts). Hard forms gate, soft forms penalise, anything left out is "either". The clay's accidental forms are not facts: leave them out. */
  forms?: import('./forms').FormFacts;
  /** Declared classes of the query. Undeclared: mono and script are read from advances and shapes when possible, and mono and script families are demoted when the query shows neither. */
  classes?: { mono?: boolean; script?: boolean };
  /** Include stencil, inline, outline, shadow, pinstripe and barcode designs (off by default). */
  includeEffects?: boolean;
  /** Script-first families (Latin that is a companion to Thai, Korean ... ). 'demote' (default) multiplies their distance and keeps one in the list; 'allow' treats them like any family; or name the scripts the query asks for. */
  scripts?: 'demote' | 'allow' | string[];
  /** Capitals-only designs: 'include' (default) ranks them on H, O and any capitals in the query; 'exclude' hides them. */
  capsOnly?: 'include' | 'exclude';
  /** Declared stroke-end shape of the query (the Rounded ends tile is a declared round). Decisive: families with the other known end class rank after. Undeclared: read from the query when it can be. */
  ends?: 'round' | 'flat' | 'wedge';
  /** Letters (of the query) the person changed. Never down-weighted as an outlier. Default: all letters are kept. */
  changed?: string[];
  /** Canvas factory to rasterise the query; falls back to setCanvasFactory() or OffscreenCanvas/document. */
  canvas?: CanvasFactory;
};
