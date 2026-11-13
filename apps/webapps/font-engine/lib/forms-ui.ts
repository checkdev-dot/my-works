// Letter-form pictures (docs/letter-forms.md section 4.1). Where each picture comes from, and what a chosen form does to the clay.
// Facts below were read from the shipped files (every cmap glyph diffed per feature) and rendered, not taken from the notes:
//   Nunito ss01 = one-storey a and a 1 without a base; ss02 = an l WITHOUT the tail (Nunito's own l has the tail).
//   Roboto Serif ss02 = one-storey g; ss06 = one-storey a. Saira ss01 = A G R 4 6 9: R gets a vertical, curved leg; 4 closes at the top
//   (Saira's own 4 is open); its G changes too subtly to call a spur, so G is not claimed as shipped.
import { FORM_KEYS, type FormFacts, type FormKey } from "@/lib/match";
import type { FamilyId } from "@/lib/clay";

export type FormDef = (typeof FORM_KEYS)[number];

/** The form rows a letter has, in FORM_KEYS order. Letters with none show no row. */
export const formsForLetter = (ch: string): FormDef[] => FORM_KEYS.filter((f) => f.letter === ch);

/** What each tile draws with no feature on, read from the library survey of the four clay families. */
const HOME: Record<FamilyId, Partial<Record<FormKey, string>>> = {
  plain: { a: "two", aTail: "none", g: "one", bJoin: "high", tTop: "flat", lTail: "plain", dot: "round", G: "plain", R: "straight", Q: "down", J: "baseline", one: "plain", four: "closed" },
  squarish: { a: "two", aTail: "none", g: "one", bJoin: "high", tTop: "flat", lTail: "plain", dot: "square", G: "plain", R: "straight", Q: "down", J: "baseline", one: "plain", four: "open" },
  rounded: { a: "two", aTail: "none", g: "one", bJoin: "high", tTop: "flat", lTail: "tail", dot: "round", G: "plain", R: "straight", Q: "down", J: "baseline", one: "base", four: "closed" },
  feet: { a: "two", aTail: "tail", g: "two", bJoin: "high", tTop: "flat", lTail: "plain", dot: "round", G: "plain", R: "straight", Q: "down", J: "baseline", one: "base", four: "closed" },
};

/** The stylistic set that turns a form on, per tile. Applied to the one letter the form is about, never to a whole word (the sets are bundles). */
const SHIP: Record<FamilyId, Partial<Record<FormKey, Record<string, string>>>> = {
  plain: {},
  squarish: { R: { curved: "ss01" }, four: { closed: "ss01" } },
  rounded: { a: { one: "ss01" }, lTail: { plain: "ss02" }, one: { plain: "ss01" } },
  feet: { a: { one: "ss06" }, g: { one: "ss02" } },
};

/** A representative real font for each form value the tile cannot draw, from the library (Fontsource, weight 400, the same files the results use). */
const REP: Record<FormKey, Record<string, string>> = {
  a: { one: "outfit", two: "inter" },
  aTail: { none: "inter", tail: "work-sans" },
  g: { one: "inter", two: "open-sans" },
  bJoin: { smooth: "abel", notch: "lato", high: "inter" },
  tTop: { flat: "inter", cut: "open-sans" },
  lTail: { plain: "inter", tail: "ubuntu" },
  dot: { round: "inter", square: "rubik" },
  G: { plain: "inter", spur: "work-sans" },
  R: { straight: "inter", curved: "chakra-petch" },
  Q: { down: "inter", swash: "quicksand", short: "raleway" },
  J: { baseline: "inter", below: "open-sans" },
  one: { plain: "inter", base: "source-sans-3" },
  four: { closed: "inter", open: "montserrat" },
};

export type Source = { kind: "tile"; feat?: string } | { kind: "lib"; id: string };

/** Where the picture of one value comes from, and so whether choosing it changes the clay letter or only the search. */
export function sourceOf(fam: FamilyId, key: FormKey, value: string): Source {
  if (HOME[fam][key] === value) return { kind: "tile" };
  const feat = SHIP[fam][key]?.[value];
  if (feat) return { kind: "tile", feat };
  return { kind: "lib", id: REP[key][value] };
}

/** The tile draws this value itself (at home or through a shipped set), so the letter and the word swap. */
export const shipped = (fam: FamilyId, key: FormKey, value: string) => sourceOf(fam, key, value).kind === "tile";

/** Feature tags for one character: only the forms that are about that character, and only where the tile ships them. */
export function featsFor(fam: FamilyId, forms: FormFacts, ch: string): string[] {
  const out: string[] = [];
  for (const def of formsForLetter(ch)) {
    const v = (forms as Record<string, string | undefined>)[def.key];
    const f = v ? SHIP[fam][def.key]?.[v] : undefined;
    if (f && !out.includes(f)) out.push(f);
  }
  return out;
}

/** CSS font-feature-settings for those tags. */
export const ffs = (tags: string[]) => (tags.length ? tags.map((t) => `"${t}" 1`).join(", ") : "normal");
export const ffsFor = (fam: FamilyId, forms: FormFacts, ch: string) => ffs(featsFor(fam, forms, ch));

/** A stable text for the chosen forms: stale checks, effects. */
export const formsKey = (forms: FormFacts) =>
  Object.keys(forms)
    .sort()
    .map((k) => k + "=" + (forms as Record<string, string>)[k])
    .join(",");

/** The chosen forms in plain words, from the matcher's own `words`. */
export function formWords(forms: FormFacts): string[] {
  return FORM_KEYS.flatMap((d) => {
    const v = (forms as Record<string, string | undefined>)[d.key];
    return v ? [(d.words as Record<string, string>)[v]] : [];
  });
}

/** "its b joins the stem low and smooth" -> "b joins the stem low and smooth" */
export const hint = (def: FormDef, value: string) => "We will look for fonts whose " + (def.words as Record<string, string>)[value].replace(/^its /, "") + ".";

// ---- representative fonts, loaded only for the letter that is open

const loaded = new Map<string, Promise<string | null>>();
export const repFamily = (id: string) => "FE Rep " + id;
/** Resolves with the CSS family once the file is in, or null if it could not be fetched (the picture then stays blank, nothing throws). */
export function loadRep(id: string): Promise<string | null> {
  let p = loaded.get(id);
  if (!p) {
    const name = repFamily(id);
    p = new FontFace(name, `url(https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/latin-400-normal.woff2)`)
      .load()
      .then((f) => {
        document.fonts.add(f);
        return name;
      })
      .catch(() => null);
    loaded.set(id, p);
  }
  return p;
}
