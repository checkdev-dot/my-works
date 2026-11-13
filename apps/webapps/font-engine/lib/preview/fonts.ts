// Preview fonts: load every named weight a kept family ships, once, and measure what the captions report.
// Result rows only hold one weight in a subset; the stage needs regular, semibold, bold, light and italic.
import type { FontMeta } from "@/lib/match";

export type FamRec = {
  /** Real family id, or "yours" */
  key: string;
  name: string;
  /** CSS font-family to use on the stage. Never a fallback. */
  css: string;
  state: "loading" | "ready" | "failed";
  /** Upright weights that loaded (named instances only) */
  weights: number[];
  italic: boolean;
  /** Digits 0 to 9 share one width, with tabular-nums on */
  tabular: boolean | null;
  /** x-height as a share of the em */
  xh: number;
  /** Clay variation settings (Yours only) */
  vs?: string;
};

export type RoleVars = Record<string, string | number>;
export type Roles = { reg: number; med: number; semi: number; bold: number; light: number; lightOk: boolean; boldOk: boolean };

const WANT = [300, 400, 500, 600, 700, 800];
const cache = new Map<string, Promise<FamRec>>();

const urlFor = (font: FontMeta, w: number, style: string) => font.fontUrl.replace(/latin-\d+-(normal|italic)/, `latin-${w}-${style}`);

async function listFiles(familyId: string): Promise<{ w: number; style: string }[] | null> {
  try {
    const r = await fetch(`https://data.jsdelivr.com/v1/packages/npm/@fontsource/${familyId}/resolved?specifier=latest`);
    if (!r.ok) return null;
    const ver = (await r.json()).version as string;
    const f = await fetch(`https://data.jsdelivr.com/v1/packages/npm/@fontsource/${familyId}@${ver}?structure=flat`);
    if (!f.ok) return null;
    const txt = await f.text();
    const out: { w: number; style: string }[] = [];
    for (const m of txt.matchAll(/latin-(\d+)-(normal|italic)\.woff2/g)) out.push({ w: +m[1], style: m[2] });
    return out;
  } catch {
    return null;
  }
}

/** Do the digits share one width? Measured in the DOM, because canvas ignores font-variant-numeric. */
export function measureTabular(css: string, vs?: string, weight = 400): boolean {
  const mk = (t: string) => {
    const s = document.createElement("span");
    s.textContent = t;
    s.style.cssText = `position:absolute;left:-9999px;top:0;white-space:pre;font:${weight} 100px "${css}";font-variant-numeric:tabular-nums;font-variation-settings:${vs ?? "normal"};font-synthesis:none`;
    document.body.appendChild(s);
    const w = s.getBoundingClientRect().width;
    s.remove();
    return w;
  };
  const a = mk("1111"), b = mk("0000"), c = mk("8888");
  return a > 0 && Math.abs(a - b) < 0.5 && Math.abs(c - b) < 0.5;
}

export function measureXh(css: string, vs?: string, weight = 400): number {
  try {
    const s = document.createElement("span");
    s.style.cssText = `position:absolute;left:-9999px;top:0;font:${weight} 100px "${css}";font-variation-settings:${vs ?? "normal"}`;
    document.body.appendChild(s);
    s.remove();
    const c = document.createElement("canvas").getContext("2d");
    if (!c) return 0.5;
    c.font = `${weight} 100px "${css}"`;
    const m = c.measureText("x").actualBoundingBoxAscent / 100;
    return m > 0.2 && m < 0.9 ? m : 0.5;
  } catch {
    return 0.5;
  }
}

export function loadFamily(font: FontMeta, retry = false): Promise<FamRec> {
  const key = font.familyId;
  if (retry) cache.delete(key);
  const hit = cache.get(key);
  if (hit) return hit;
  const css = `pv-${key}`;
  const p = (async (): Promise<FamRec> => {
    const base: FamRec = { key, name: font.family, css, state: "loading", weights: [], italic: false, tabular: null, xh: 0.5 };
    const listing = await listFiles(key);
    const want = new Map<string, { w: number; style: string }>();
    const add = (w: number, style: string) => want.set(`${w}${style}`, { w, style });
    add(font.weight, font.style); // the kept file always
    if (listing) {
      for (const f of listing) if (f.style === "normal" && WANT.includes(f.w)) add(f.w, "normal");
      if (listing.some((f) => f.w === 400 && f.style === "italic")) add(400, "italic");
    }
    const faces = [...want.values()];
    const ownKey = `${font.weight}${font.style}`;
    const results = await Promise.all(
      faces.map(async (f) => {
        try {
          const face = new FontFace(css, `url(${urlFor(font, f.w, f.style)})`, { weight: String(f.w), style: f.style });
          await face.load();
          document.fonts.add(face);
          return f;
        } catch {
          return null;
        }
      }),
    );
    const ok = results.filter((x): x is { w: number; style: string } => !!x);
    if (!ok.some((f) => `${f.w}${f.style}` === ownKey)) return { ...base, state: "failed" };
    const weights = ok.filter((f) => f.style === "normal").map((f) => f.w).sort((a, b) => a - b);
    const reg = weights.includes(font.weight) ? font.weight : weights[0] ?? font.weight;
    return {
      ...base,
      state: "ready",
      weights: weights.length ? weights : [font.weight],
      italic: ok.some((f) => f.style === "italic"),
      tabular: measureTabular(css, undefined, reg),
      xh: measureXh(css, undefined, reg),
    };
  })();
  cache.set(key, p);
  return p;
}

const pickUp = (have: number[], target: number, floor: number) => {
  const up = have.filter((w) => w >= floor);
  if (!up.length) return floor;
  return up.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
};

/** Which real weight fills each role, given the one the person kept. Never a weight the family does not ship. */
export function rolesFor(rec: FamRec, base: number): Roles {
  const have = rec.weights;
  if (rec.vs !== undefined || !have.length) return { reg: 400, med: 400, semi: 400, bold: 400, light: 400, lightOk: false, boldOk: false };
  const reg = have.includes(base) ? base : have.reduce((a, b) => (Math.abs(b - base) < Math.abs(a - base) ? b : a));
  const bold = pickUp(have, reg + 300, reg);
  const semi = pickUp(have, reg + 200, reg);
  const med = pickUp(have, reg + 100, reg);
  const lows = have.filter((w) => w <= reg - 100);
  const light = lows.length ? lows.reduce((a, b) => (Math.abs(b - (reg - 100)) < Math.abs(a - (reg - 100)) ? b : a)) : reg;
  return { reg, med, semi, bold, light, lightOk: light < reg, boldOk: bold > reg };
}

export const WEIGHT_NAMES: Record<number, string> = { 100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black" };
