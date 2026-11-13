"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CLAY_ENDS, FORM_KEYS, fetchLibrary, findClosest, type FormFacts, type Library, type MatchResult } from "@/lib/match";
import { DIALS, FAMILIES, effective, family, markedIndex, toU, variationCss, type DialId, type DialState, type FamilyId } from "@/lib/clay";
import { queryFor } from "@/lib/query";
import { MAX_WORD, affects, cleanWord, describe, dialsInWord } from "@/lib/word";
import { Dials } from "./Dials";
import { Forms } from "./Forms";
import { featsFor, ffs, ffsFor, formsForLetter, formsKey, hint as formHint, loadRep, repFamily, shipped, sourceOf, type FormDef } from "@/lib/forms-ui";
import { Handles } from "./Handles";
import { loadFont, plan, type Handle } from "@/lib/handles";
import { Results, type Yours } from "./Results";
import { usePreview } from "./usePreview";
import { PreviewLead, PreviewStage } from "./Preview";

const RAIL = 280;
const DEFAULT_WORD = "Hamburg";
const BASE_Y = 0.55; // word baseline, share of sheet height
const FILL = 0.92; // the widest the word can get takes this much of the sheet at rest (controls-v4 section 6)
const CLAMP = 0.9; // and nothing the person does may take more than this, whatever shares the sheet
const GRID = 160;
const ZP = 240; // the zoomed view's bottom panel: size strip, then rows and buttons
const FORMS_H = 92; // one more band in that panel when the open letter has forms: a row of small pictures
const SIZES = [
  { name: "Small text", px: 14 },
  { name: "Headings", px: 36 },
  { name: "Huge", px: 80 },
];
/** The three doors: a start the person can take without knowing a name for it. Axis values, turned into dial positions per family. */
const DOORS: { label: string; fam: FamilyId; axes: Partial<Record<DialId, number>> }[] = [
  { label: "thin and wide", fam: "plain", axes: { thick: 200, wide: 130 } },
  { label: "heavy and round", fam: "rounded", axes: { thick: 900 } },
  { label: "with feet", fam: "feet", axes: {} },
];
const doorState = (id: FamilyId, a: Partial<Record<DialId, number>>): DialState => {
  const f = family(id);
  const out: DialState = {};
  for (const k of Object.keys(a) as DialId[]) if (f.dials[k]) out[k] = toU(f.dials[k]!, a[k]!);
  return out;
};
const SPECIMEN = "The quick brown fox jumps over the lazy dog.";

type Snap = { fam: FamilyId; st: DialState; forms: FormFacts };
type View = "word" | "zoom" | "out";
type Status = "idle" | "measuring" | "searching" | "done" | "error";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function Editor() {
  const [word, setWord] = useState(DEFAULT_WORD);
  const [note, setNote] = useState("");
  const [famId, setFamId] = useState<FamilyId>("plain");
  const [st, setSt] = useState<DialState>({});
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState<View>("word");
  const [zi, setZi] = useState(0);
  const [frozen, setFrozen] = useState<DialState | null>(null);
  const [W, setW] = useState<number | null>(null);
  const [sheet, setSheet] = useState({ w: 0, h: 0 });
  const [fontsReady, setFontsReady] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [side, setSide] = useState<"right" | "left" | "wrap">("right");
  const [tip, setTip] = useState<FamilyId | null>(null);
  const [undone, setUndone] = useState("");
  const [below, setBelow] = useState("");
  const [zx, setZx] = useState<number | null>(null); // pen origin of the zoomed letter, fixed while it is open
  const [specs, setSpecs] = useState<Handle[]>([]);
  const [reach, setReach] = useState(0.8);
  const [ghost, setGhost] = useState<{ vs: string; css: string; fade: boolean } | null>(null);
  const ghostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hot, setHot] = useState<DialId | null>(null);
  const [hugeK, setHugeK] = useState(1);
  const hugeEl = useRef<HTMLSpanElement>(null);
  const [fontTick, setFontTick] = useState(0);
  const [forms, setForms] = useState<FormFacts>({}); // letter forms the person chose; a key left out is "either"
  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const ghostWrap = useRef<HTMLDivElement>(null);

  const fam = effective(family(famId), st); // the italic file while Lean is on
  const sheetRef = useRef<HTMLDivElement>(null);
  const wordWrap = useRef<HTMLDivElement>(null);
  const wordEl = useRef<HTMLDivElement>(null);
  const zoomWrap = useRef<HTMLDivElement>(null);
  const zoomEl = useRef<HTMLSpanElement>(null);
  const measureEls = useRef<(HTMLSpanElement | null)[]>([]);
  const zoomBtn = useRef<HTMLButtonElement>(null);
  const closestBtn = useRef<HTMLButtonElement>(null);
  const railScroll = useRef<HTMLDivElement>(null);
  const flipFrom = useRef<{ left: number; base: number; size: number } | null>(null);
  const fit = useRef(1); // how far the word is squeezed to stay inside the sheet
  const undo = useRef<Snap[]>([]);
  const lastKey = useRef<{ id: DialId; t: number } | null>(null);
  const live = useRef({ famId, st, forms });
  live.current = { famId, st, forms };
  const refocus = useRef(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // results
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<MatchResult[]>([]);
  const [yours, setYours] = useState<Yours | null>(null);
  const [matchedKey, setMatchedKey] = useState("");
  const library = useRef<Library | null>(null);
  const running = useRef(false);

  const previewBtn = useRef<HTMLButtonElement>(null);
  const pv = usePreview({
    fam,
    st,
    fontsReady,
    onClose: () => {
      pv.setOpen(false);
      setTimeout(() => previewBtn.current?.focus(), 0);
    },
  });
  const onPreview = () => {
    if (pv.open) {
      pv.setOpen(false);
      return;
    }
    if (view === "zoom") zoomOut(() => pv.setOpen(true));
    else pv.setOpen(true);
  };

  const key = famId + "|" + fam.css + "|" + variationCss(fam, st) + "|" + formsKey(forms);
  const stale = status === "done" && matchedKey !== key;
  const busy = status === "measuring" || status === "searching";

  // fonts before anything is shown
  useEffect(() => {
    let alive = true;
    Promise.all(FAMILIES.flatMap((f) => [f.css, ...(f.italic ? [f.italic.css] : [])]).map((c) => document.fonts.load(`100px "${c}"`))).then(() => alive && setFontsReady(true), () => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // sheet size
  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSheet({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSheet({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Word size: set once per word, from the widest the word can get in any of the four tiles, in the narrowest layout (results open)
  useLayoutEffect(() => {
    if (!fontsReady || !sheet.h || !word.trim()) return;
    const widest = Math.max(...measureEls.current.map((m) => (m ? m.getBoundingClientRect().width / 100 : 0)));
    if (!widest) return;
    // set from the sheet at rest (rail on, nothing open beside it), so opening the results never changes it: the word glides smaller, it does not jump
    const avail = window.innerWidth - RAIL;
    const byCap = (0.36 * sheet.h) / 0.711;
    setW(Math.max(48, Math.min((FILL * avail) / widest, byCap)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, fontsReady, sheet.h > 0]);

  // the zoomed letter takes the upper two thirds: the tallest and the deepest it can get fit above the panel with room for callouts
  const zoomLetter = Array.from(word)[zi] ?? "";
  // a small letter has less to fit, so it is drawn larger; the tallest and deepest it can get set the scale
  const asc = /[a-z]/.test(zoomLetter) && !/[bdfhijklt]/.test(zoomLetter) ? 0.68 : 0.86;
  const desc = /[gjpqy]/.test(zoomLetter) ? 0.31 : 0.12;
  const formDefs = view !== "word" ? formsForLetter(zoomLetter) : [];
  const zp = ZP + (formDefs.length ? FORMS_H : 0);
  const featZ = featsFor(famId, forms, zoomLetter);
  const featStr = ffs(featZ);
  const Z = Math.max(160, Math.min(sheet.h * 0.62, (sheet.h - zp - 28 - 72 - 36) / (asc + desc)));
  const baseY = BASE_Y * sheet.h;
  const floorY = sheet.h - zp - 28;
  // the zoomed letter stands on a major grid line, so the grid reads as a ruler
  const zoomBase = (() => {
    // the highest grid line where the tallest and the deepest the letter can get both still fit
    for (let k = -3; k <= 3; k++) {
      const b = baseY + GRID * k;
      if (b - asc * Z >= 72 && b + desc * Z <= floorY) return b;
    }
    return Math.max(72 + asc * Z, Math.min(floorY - desc * Z, baseY));
  })();
  const railOff = view !== "word"; // no rail while a letter is open; the word keeps its place on the page meanwhile
  const restW = sheet.w - (railOff ? RAIL : 0);
  const gridOffset = ((baseY % GRID) + GRID) % GRID;

  // put the baseline where we want it, whatever the family's metrics
  useLayoutEffect(() => {
    const place = (wrap: HTMLElement | null, y: number) => {
      if (!wrap || !sheet.h) return;
      const bl = wrap.querySelector<HTMLElement>(".bl");
      if (!bl) return;
      const off = bl.getBoundingClientRect().bottom - wrap.getBoundingClientRect().top;
      wrap.style.top = `${y - off}px`;
    };
    place(wordWrap.current, baseY);
    place(zoomWrap.current, zoomBase);
    place(ghostWrap.current, zoomBase);
  }, [famId, W, word, sheet.h, view, zi, fontsReady, baseY, zoomBase, forms]);

  // keep the word inside the sheet, whatever the dials do to its width
  useLayoutEffect(() => {
    const w = wordEl.current;
    if (!w || !sheet.w) return;
    const apply = () => {
      const bl = w.querySelector<HTMLElement>(".bl");
      w.style.transform = "none";
      const wr = w.getBoundingClientRect();
      const k = Math.min(1, (CLAMP * restW) / Math.max(1, wr.width));
      fit.current = k;
      if (bl) w.style.transformOrigin = `50% ${bl.getBoundingClientRect().bottom - wr.top}px`;
      w.style.transform = k < 1 ? `scale(${k})` : "none";
      w.style.setProperty("--k", String(k)); // the marker label stays 14 px whatever the word is squeezed to
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(w);
    return () => ro.disconnect();
  }, [famId, W, word, restW, fontsReady, view]);

  // the marker label goes to whichever side has room for it
  useLayoutEffect(() => {
    const m = wordEl.current?.querySelector<HTMLElement>(".mark");
    const sh = sheetRef.current;
    if (!m || !sh) return;
    m.className = "mark right";
    const em = m.querySelector("em") as HTMLElement;
    const lw = em.getBoundingClientRect().width;
    const x = m.getBoundingClientRect().left;
    const sr = sh.getBoundingClientRect();
    const right = sr.right - x - 12;
    const left = x - sr.left - 12;
    const s = right >= lw ? "right" : left >= lw ? "left" : right >= left ? "right wrap" : "left wrap";
    m.className = `mark ${s}`;
    setSide(s.split(" ")[0] as "right" | "left");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [famId, W, word, sheet.w, fontsReady, view, open]);

  // ---- history
  const snap = (): Snap => ({ fam: live.current.famId, st: { ...live.current.st }, forms: { ...live.current.forms } });
  const pushUndo = () => {
    undo.current.push(snap());
    if (undo.current.length > 100) undo.current.shift();
    setUndoCount(undo.current.length);
  };
  const say = (text: string) => {
    setUndone(text);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndone(""), 2400);
  };
  const doUndo = useCallback(() => {
    const s = undo.current.pop();
    setUndoCount(undo.current.length);
    if (!s) return;
    const now = live.current;
    const changed = DIALS.filter((d) => (s.st[d.id] ?? 0) !== (now.st[d.id] ?? 0)).map((d) => d.label.toLowerCase());
    const sf = s.forms as Record<string, string | undefined>;
    const nf = now.forms as Record<string, string | undefined>;
    const fch = FORM_KEYS.filter((d) => sf[d.key] !== nf[d.key]).map((d) => d.letter);
    if (fch.length) changed.push(`the form of the ${[...new Set(fch)].join(" and ")}`);
    say(s.fam !== now.famId ? `Undid the switch to ${family(now.famId).label}.` : changed.length ? `Undid ${changed.join(" and ")}.` : "Undid the last step.");
    setFamId(s.fam);
    setSt(s.st);
    setForms(s.forms);
  }, []);

  const home = famId === "plain" && DIALS.every((d) => !st[d.id]) && !Object.keys(forms).length;

  // ---- dials
  // While a letter is open, the start of a gesture stays as a hairline outline, and fades 500 ms after the last change.
  const holdGhost = (wait: number) => {
    if (ghostTimer.current) clearTimeout(ghostTimer.current);
    ghostTimer.current = setTimeout(() => {
      setGhost((g) => (g ? { ...g, fade: true } : g));
      ghostTimer.current = setTimeout(() => setGhost(null), 560);
    }, wait);
  };
  const onBegin = (id: DialId, viaKey: boolean) => {
    const now = performance.now();
    if (viaKey) {
      const lk = lastKey.current;
      lastKey.current = { id, t: now };
      if (lk && lk.id === id && now - lk.t < 400) return; // a run of presses is one step
    } else lastKey.current = null;
    if (view === "zoom") {
      if (ghostTimer.current) clearTimeout(ghostTimer.current);
      setGhost({ vs: variationCss(family(live.current.famId), live.current.st), css: effective(family(live.current.famId), live.current.st).css, fade: false });
    }
    pushUndo();
  };
  const onSet = (id: DialId, u: number, drag: boolean) => {
    setDragging(drag);
    setUndone("");
    setSt((s) => ({ ...s, [id]: u }));
    if (!drag && view === "zoom") holdGhost(900); // arrow keys never send an end
  };
  const onEnd = () => {
    setDragging(false);
    if (view === "zoom") holdGhost(0);
  };
  const resetOne = (id: DialId) => {
    if (!live.current.st[id]) return;
    pushUndo();
    setSt((s) => ({ ...s, [id]: 0 }));
  };
  const resetAll = () => {
    if (home) return;
    pushUndo();
    setFamId("plain");
    setSt({});
    setForms({});
  };
  const pickForm = (def: FormDef, value: string | null) => {
    const cur = (live.current.forms as Record<string, string | undefined>)[def.key] ?? null;
    if (cur === value) return;
    pushUndo();
    setUndone("");
    setForms((f) => {
      const n = { ...f } as Record<string, string>;
      if (value === null) delete n[def.key];
      else n[def.key] = value;
      return n as FormFacts;
    });
  };
  const pickFamily = (id: FamilyId) => {
    if (id === famId) return;
    pushUndo();
    setFamId(id);
  };

  // ---- zoom
  const hasHere = (d: DialId) => !!fam.dials[d] && (famId !== "plain" || affects(d, zoomLetter));
  const handled = new Set<DialId>(specs.map((s) => s.dial));
  const onLetter = DIALS.filter((d) => hasHere(d.id));
  const zoomDials = onLetter.filter((d) => !handled.has(d.id)); // a dial with a handle on the letter is not also a row
  const resetZoom = () => {
    // everything that acts on this letter, the handled dials too
    const ids = onLetter.filter((d) => st[d.id]).map((d) => d.id);
    const fks = formDefs.filter((d) => (forms as Record<string, string | undefined>)[d.key]).map((d) => d.key);
    if (!ids.length && !fks.length) return;
    pushUndo();
    if (fks.length)
      setForms((f) => {
        const n = { ...f } as Record<string, string>;
        fks.forEach((k) => delete n[k]);
        return n as FormFacts;
      });
    setSt((s) => {
      const n = { ...s };
      ids.forEach((id) => (n[id] = 0));
      return n;
    });
  };

  const openLetter = (i: number) => {
    if (view !== "word" || !wordEl.current) return;
    const ch = wordEl.current.querySelectorAll<HTMLElement>(".ch")[i];
    if (!ch) return;
    const r = ch.getBoundingClientRect();
    const b = ch.querySelector<HTMLElement>(".bl")!.getBoundingClientRect();
    flipFrom.current = { left: r.left, base: b.bottom, size: (W ?? 100) * fit.current };
    setFrozen({ ...st });
    setZi(i);
    setZx(null);
    setSpecs([]);
    setGhost(null);
    setView("zoom");
  };

  useLayoutEffect(() => {
    const from = flipFrom.current;
    if (view !== "zoom" || !from || !zoomEl.current) return;
    flipFrom.current = null;
    const el = zoomEl.current;
    const r = el.getBoundingClientRect();
    setZx(r.left - sheetRef.current!.getBoundingClientRect().left);
    const b = el.querySelector<HTMLElement>(".bl")!.getBoundingClientRect();
    const k = from.size / Z;
    const dx = from.left - r.left;
    const dy = from.base - b.bottom;
    el.style.transformOrigin = `0px ${b.bottom - r.top}px`;
    const dur = reduced() ? 0 : 560;
    if (dur) el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { transform: "none" }], { duration: dur, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  }, [view, Z]);

  // which edges of this letter can be dragged, decided once when it opens
  useEffect(() => {
    let alive = true;
    loadFont(fam).then(() => alive && setFontTick((t) => t + 1), () => {});
    return () => {
      alive = false;
    };
  }, [fam]);
  useEffect(() => {
    if (view !== "zoom" || !sheet.h) return;
    const r = plan(fam, live.current.st, zoomLetter, Z, hasHere, featZ);
    setSpecs(r.handles);
    setReach(r.reach);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view === "zoom", zi, famId, fontTick, Z, featStr]);

  // a form the tile draws: the old letter fades out and the new one in. (font-feature-settings cannot be animated, so this is a crossfade, not a morph.)
  const prevFeat = useRef({ ch: zoomLetter, ff: featStr });
  useLayoutEffect(() => {
    const p = prevFeat.current;
    prevFeat.current = { ch: zoomLetter, ff: featStr };
    if (view !== "zoom" || p.ch !== zoomLetter || p.ff === featStr || reduced()) return;
    setSwapFrom(p.ff);
    zoomEl.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    const t = setTimeout(() => setSwapFrom(null), 260);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featStr, zoomLetter]);

  // the chosen forms this tile cannot draw: a hairline ghost of each beside the letter, and one line that says what will be searched
  const asked = formDefs.flatMap((d) => {
    const v = (forms as Record<string, string | undefined>)[d.key];
    return v && !shipped(famId, d.key, v) ? [{ d, v, src: sourceOf(famId, d.key, v) }] : [];
  });
  // beside the letter, past the callouts; smaller when results have narrowed the sheet, so it never runs off it
  const ghostX = (zx ?? 0) + reach * Z + 210;
  const ghostZ = Math.max(Z * 0.4, Math.min(Z, (sheet.w - 24 - ghostX) / 0.72));
  useEffect(() => {
    asked.forEach((a) => a.src.kind === "lib" && void loadRep(a.src.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked.map((a) => a.v).join()]);

  // keyboard: opening a letter lands on Zoom out; closing returns to the letter
  useEffect(() => {
    if (view === "zoom") zoomBtn.current?.focus();
  }, [view]);
  useEffect(() => {
    if (view === "word" && refocus.current) {
      refocus.current = false;
      wordEl.current?.querySelectorAll<HTMLElement>(".ch")[zi]?.focus();
    }
  }, [view, zi]);

  const zoomOut = (then?: () => void) => {
    const wEl = wordEl.current;
    const zEl = zoomEl.current;
    if (!wEl || !zEl || view !== "zoom") return;
    refocus.current = true;
    const letters = wEl.querySelectorAll<HTMLElement>(".ch");
    const target = letters[zi];
    const oldVs = variationCss(fam, frozen ?? st);
    const newVs = variationCss(fam, st);
    // where the letter will land, measured with the new settings applied at once
    wEl.classList.add("notrans");
    letters.forEach((l) => (l.style.fontVariationSettings = newVs));
    const tr = target.getBoundingClientRect();
    const tb = target.querySelector<HTMLElement>(".bl")!.getBoundingClientRect();
    letters.forEach((l) => (l.style.fontVariationSettings = oldVs));
    void wEl.offsetWidth;
    wEl.classList.remove("notrans");
    const r = zEl.getBoundingClientRect();
    const b = zEl.querySelector<HTMLElement>(".bl")!.getBoundingClientRect();
    const k = ((W ?? 100) * fit.current) / Z;
    zEl.style.transformOrigin = `0px ${b.bottom - r.top}px`;
    setView("out");
    setFrozen(null);
    const dur = reduced() ? 120 : 560;
    const a = zEl.animate(
      reduced()
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { transform: "none", opacity: 1 },
            { transform: `translate(${tr.left - r.left}px, ${tb.bottom - b.bottom}px) scale(${k})`, opacity: 1, offset: 0.8 },
            { transform: `translate(${tr.left - r.left}px, ${tb.bottom - b.bottom}px) scale(${k})`, opacity: 0 },
          ],
      { duration: dur, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" },
    );
    a.onfinish = () => {
      setView("word");
      then?.();
    };
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        const t = e.target as HTMLElement;
        if (t && t.tagName === "INPUT") return;
        e.preventDefault();
        doUndo();
      }
      if (e.key === "Escape" && view === "zoom") zoomOut();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- closest
  const runMatch = useCallback(async () => {
    if (running.current) return; // a second click while measuring does nothing
    running.current = true;
    const { famId: fid, st: s, forms: fo } = live.current;
    const fkey = formsKey(fo);
    const f = effective(family(fid), s);
    setOpen(true);
    setClosing(false);
    setStatus("measuring");
    let again = false;
    try {
      const q = await queryFor(f, s, fo);
      setStatus("searching");
      library.current ??= await fetchLibrary();
      await new Promise((r) => setTimeout(r, 30));
      const now = live.current;
      if (now.famId !== fid || effective(family(now.famId), now.st) !== f || variationCss(family(now.famId), now.st) !== variationCss(f, s) || formsKey(now.forms) !== fkey) {
        again = true; // the letter moved while we measured, so these results would be for the old one
        return;
      }
      // only forms the person chose go in; the tile's own forms (CLAY_FORMS) are never passed on their own
      const res = findClosest(q.glyphs, library.current, { limit: 12, excludeSuperfamily: true, ends: fid === "rounded" ? CLAY_ENDS.rounded : undefined, forms: Object.keys(fo).length ? { ...fo } : undefined });
      const fv = fo as Record<string, string | undefined>;
      const undrawn = [...new Set(FORM_KEYS.filter((d) => fv[d.key] && !shipped(fid, d.key, fv[d.key]!)).map((d) => d.letter))];
      setYours({ fam: f, vs: variationCss(f, s), xHeight: q.xHeight, forms: { ...fo }, undrawn });
      setResults(res);
      setMatchedKey(fid + "|" + f.css + "|" + variationCss(f, s) + "|" + fkey);
      setStatus("done");
    } catch (e) {
      console.error(e);
      setStatus("error");
    } finally {
      running.current = false;
      if (again) void runMatchRef.current();
    }
  }, []);
  const runMatchRef = useRef<() => Promise<void>>(async () => {});
  runMatchRef.current = runMatch;

  const onClosest = () => {
    if (view === "zoom") zoomOut(runMatch); // matching reads the whole word, so come back to it first
    else void runMatch();
  };
  const closeResults = () => {
    setClosing(true);
    closestBtn.current?.focus();
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, reduced() ? 0 : 240);
  };

  // ---- the word field
  const onWord = (raw: string) => {
    const c = cleanWord(raw);
    setWord(c.text);
    setUndone("");
    if (c.dropped.length) setNote(`Left out ${c.dropped.slice(0, 6).join(" ")}. These fonts draw Latin script only.`);
    else if (c.cut) setNote(`Kept the first ${MAX_WORD} characters, left out ${c.cut}.`);
    else setNote("");
  };
  const onWordBlur = () => {
    const t = word.replace(/ +$/, "");
    if (!t) {
      setWord(DEFAULT_WORD);
      setNote("");
    } else if (t !== word) setWord(t);
  };

  // ---- rail: scroll cue
  useEffect(() => {
    const el = railScroll.current;
    if (!el) return;
    const check = () => {
      const cut = Array.from(el.querySelectorAll<HTMLElement>(".row")).filter((r) => r.offsetTop + r.offsetHeight - el.scrollTop > el.clientHeight + 2);
      setBelow(cut.map((r) => r.querySelector(".row-label")?.textContent ?? "").join("|"));
    };
    check();
    el.addEventListener("scroll", check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  });

  // the Huge line shrinks to fit the sheet so a long word never runs off it
  useLayoutEffect(() => {
    const el = hugeEl.current;
    if (view !== "zoom" || !el || !sheet.w) return;
    const natural = el.getBoundingClientRect().width / hugeK;
    const avail = (sheet.w - 80) * 0.6;
    if (natural > 0) setHugeK(Math.max(0.2, Math.min(1, avail / natural)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, word, famId, sheet.w, fontsReady]);

  // ---- render helpers
  const wordVs = variationCss(fam, view === "zoom" && frozen ? frozen : st);
  const zoomVs = variationCss(fam, st);
  const mi = markedIndex(fam, word);
  const letters = Array.from(word);
  const inWord = dialsInWord(word);
  const railDials = DIALS.filter((d) => d.rail && fam.dials[d.id] && (famId !== "plain" || !word.trim() || inWord.has(d.id)));
  const offTile = DIALS.filter((d) => d.rail && !fam.dials[d.id]);
  const unused = DIALS.filter((d) => d.rail && fam.dials[d.id] && !railDials.includes(d));
  const heldOff = offTile.some((d) => st[d.id]);
  // for each dial this tile lacks: which other tiles have it, read from the family data
  const livesOn = (id: DialId) => FAMILIES.filter((f) => f.id !== famId && f.dials[id]);
  const others = FAMILIES.length - 1;
  const deltas = describe(st);
  const shown = view === "zoom" ? "zoomed" : "word";
  const empty = !word.trim();
  const statusText =
    undone ||
    (view === "word"
      ? empty
        ? "Type a word to start."
        : `${fam.label}, ${fam.name}. ${deltas || "As it starts."}`
      : `Letter ${zoomLetter}, ${fam.label}. ${describe(st) || "As it starts."}`);
  const hint =
    view !== "word" ? "Zoom out to change the word." : note || (empty ? "Type a word to start." : "Latin script only, up to 24 characters.");
  const tipFam = family(tip ?? famId);
  // text drawn as one string gets the forms on the letters they are about, never on the whole word
  const withForms = (text: string) =>
    Array.from(text).map((c, i) => {
      const f = ffsFor(famId, forms, c);
      return f === "normal" ? c : <span key={i} style={{ fontFeatureSettings: f }}>{c}</span>;
    });
  const letterCount = Array.from(word).length;
  const underTop = baseY + 0.3 * (W ?? 100) * fit.current + 40;

  return (
    <div className={`app ${dragging ? "dragging" : ""} ${view === "zoom" ? "is-zoom" : ""} ${railOff ? "rail-off" : ""} ${open ? "has-results" : ""} ${pv.open ? "is-preview" : ""}`}>
      <header className="bar">
        <h1 className="sr">Font engine</h1>
        <div className="word-field">
          <label className="word-label">
            <span className="sr">Your word</span>
            <input
              className="word-input"
              value={word}
              disabled={view !== "word"}
              onChange={(e) => onWord(e.target.value)}
              onBlur={onWordBlur}
              spellCheck={false}
              autoComplete="off"
              aria-label="Your word"
              aria-describedby="word-hint"
            />
            <span className="counter mono" aria-hidden>
              {letterCount}/{MAX_WORD}
            </span>
          </label>
          <p className={`hint ${note ? "warn" : ""}`} id="word-hint" role={note ? "status" : undefined}>
            {hint}
          </p>
        </div>
        <p className="status" aria-live="polite">
          {statusText}
        </p>
        <p className="narrow-note">Works best on a laptop or desktop.</p>
      </header>

      <main className="main">
        {view === "word" && (
        <aside className="rail" aria-label="Shape the letters">
            <div className="rail-body" key="rail">
              <section className="rail-top">
                <h2>Character</h2>
                <div className="tiles">
                  {FAMILIES.map((f) => {
                    const ch = letters[markedIndex(f, word)] ?? "a";
                    const on = f.id === famId;
                    return (
                      <button
                        key={f.id}
                        className={`tile ${on ? "on" : ""}`}
                        onClick={() => pickFamily(f.id)}
                        onMouseEnter={() => setTip(f.id)}
                        onMouseLeave={() => setTip(null)}
                        onFocus={() => setTip(f.id)}
                        onBlur={() => setTip(null)}
                        aria-pressed={on}
                        aria-describedby="tile-blurb"
                        title={`${f.name}. ${f.blurb}`}
                      >
                        <span
                          className="tile-letter"
                          aria-hidden
                          style={{ fontFamily: `"${f.css}"`, fontVariationSettings: variationCss(f, { thick: Math.max(-0.5, st.thick ?? 0), wide: st.wide }), visibility: fontsReady ? "visible" : "hidden" }}
                        >
                          {ch}
                        </span>
                        <span className="tile-name">{f.label}</span>
                        {on && <span className="sr"> (chosen)</span>}
                      </button>
                    );
                  })}
                </div>
                <p className="blurb" id="tile-blurb">
                  <b>{tipFam.name}.</b> {tipFam.blurb}
                </p>
              </section>
              <div className="rail-mid">
                <div className="rail-scroll" ref={railScroll}>
                  <h2 className="sr">Shape</h2>
                  <Dials fam={fam} st={st} list={railDials} onBegin={onBegin} onSet={onSet} onEnd={onEnd} onResetOne={resetOne} onHot={setHot} />
                  {(offTile.length > 0 || unused.length > 0) && (
                    <div className="dial-note">
                      {offTile.length > 0 && (
                        <ul className="lives">
                          {offTile.map((d) => {
                            const on = livesOn(d.id);
                            return (
                              <li key={d.id}>
                                <b>{d.label}</b> lives on {on.length === others ? "every other tile" : on.map((f) => f.label).join(" and ")}.{" "}
                                {on.length > 0 && (
                                  <button className="linkbtn" onClick={() => pickFamily(on[0].id)}>
                                    Go to {on[0].label}
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {heldOff && <p>Your settings there are kept.</p>}
                      {unused.length > 0 && <p>No letter in this word uses {unused.map((d) => d.label).join(", ")}.</p>}
                    </div>
                  )}
                </div>
                <p className="dial-def" aria-hidden>
                  {hot ? DIALS.find((d) => d.id === hot)!.definition + "." : "Hover or focus a dial to see what it does."}
                </p>
                {below && (
                  <p className="cue" aria-hidden>
                    {below.split("|").length} more below
                  </p>
                )}
              </div>
              <footer className="rail-foot">
                <div className="rail-actions">
                  <button className="textbtn" onClick={doUndo} disabled={!undoCount}>
                    Undo
                  </button>
                  <button className="textbtn" onClick={resetAll} disabled={home}>
                    Reset all
                  </button>
                </div>
                <p>Every change here reaches all the letters of your word.</p>
              </footer>
            </div>
        </aside>
        )}

        <div className="sheet" ref={sheetRef} style={{ ["--gy" as string]: `${gridOffset}px`, ["--gx" as string]: railOff ? `${RAIL}px` : "0px" }}>
          {FAMILIES.map((f, i) => (
            <span
              key={f.id}
              className="measure"
              ref={(el) => {
                measureEls.current[i] = el;
              }}
              aria-hidden
              style={{ fontFamily: `"${f.css}"`, fontVariationSettings: variationCss(f, { wide: 1 }) }}
            >
              {word || "a"}
            </span>
          ))}

          {empty && view === "word" && (
            <p className="empty" style={{ top: baseY - 40 }}>
              Type a word to start.
            </p>
          )}

          {W && sheet.h > 0 && !empty && (
            <div className={`word-wrap ${shown === "zoomed" ? "hide" : ""}`} ref={wordWrap} inert={view !== "word"}>
              <div className="word" ref={wordEl} key={famId} style={{ fontFamily: `"${fam.css}"`, fontSize: W }} role="group" aria-label={`Your word, ${word}`}>
                {letters.map((c, i) => {
                  const isSpace = c === " ";
                  const marked = i === mi && !isSpace;
                  return (
                    <span
                      key={i}
                      className={`ch ${isSpace ? "sp" : ""} ${marked ? "marked" : ""}`}
                      style={{ fontVariationSettings: wordVs, fontFeatureSettings: ffsFor(famId, forms, c) }}
                      onDoubleClick={isSpace ? undefined : () => openLetter(i)}
                      onKeyDown={isSpace ? undefined : (e) => (e.key === "Enter" ? openLetter(i) : undefined)}
                      tabIndex={isSpace ? -1 : 0}
                      role={isSpace ? undefined : "button"}
                      aria-label={isSpace ? undefined : `Open the letter ${c}`}
                    >
                      {isSpace ? " " : c}
                      <i className="bl">
                        {!isSpace && <b className="tip">double-click or press Enter</b>}
                        {marked && view === "word" && (
                          <span className={`mark ${side}`} style={{ bottom: `${fam.xh * W}px`, ["--lead" as string]: `${Math.max(34, (0.84 - fam.xh) * W + 12)}px` }}>
                            <i className="mark-sq" />
                            <i className="mark-leader" />
                            <em>carries the most character · double-click or press Enter to open</em>
                          </span>
                        )}
                      </i>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {view !== "word" && W && (
            <div className={`zoom-wrap ${zx !== null ? "pinned" : ""}`} ref={zoomWrap} style={zx !== null ? { left: zx } : undefined}>
              <span className="zl-stack">
                <span className="zl" ref={zoomEl} style={{ fontFamily: `"${fam.css}"`, fontSize: Z, fontVariationSettings: zoomVs, fontFeatureSettings: featStr }} aria-label={`Letter ${zoomLetter}`}>
                  {zoomLetter}
                  <i className="bl" />
                </span>
                {swapFrom !== null && view === "zoom" && (
                  <span className="zl zswap" aria-hidden style={{ fontFamily: `"${fam.css}"`, fontSize: Z, fontVariationSettings: zoomVs, fontFeatureSettings: swapFrom }}>
                    {zoomLetter}
                  </span>
                )}
                {ghost && view === "zoom" && (
                  <span className={`zl zghost ${ghost.fade ? "fade" : ""}`} aria-hidden style={{ fontFamily: `"${ghost.css}"`, fontSize: Z, fontVariationSettings: ghost.vs }}>
                    {zoomLetter}
                  </span>
                )}
              </span>
            </div>
          )}

          {view === "word" && W && !empty && (
            <div className="under" style={{ top: underTop }}>
              {home && fontsReady && (
                <div className="doors" role="group" aria-label="Start from a feel">
                  <span className="doors-lead">Or start from</span>
                  {DOORS.map((d) => {
                    const f = family(d.fam);
                    const ds = doorState(d.fam, d.axes);
                    return (
                      <button key={d.label} className="door" onClick={() => { pushUndo(); setFamId(d.fam); setSt(ds); }}>
                        <span className="door-word" aria-hidden style={{ fontFamily: `"${f.css}"`, fontVariationSettings: variationCss(f, ds) }}>
                          {word}
                        </span>
                        <span className="door-name">{d.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="specimen" aria-hidden style={{ fontFamily: `"${fam.css}"`, fontVariationSettings: wordVs }}>
                <div>
                  <small>Headings</small>
                  <span className="spec-h">{withForms(word)}</span>
                </div>
                <div>
                  <small>Small text</small>
                  <span className="spec-s">{SPECIMEN}</span>
                </div>
              </div>
            </div>
          )}

          {view === "zoom" && zx !== null && asked.length > 0 && (
            <>
              <div className="zoom-wrap pinned zform-wrap" ref={ghostWrap} style={{ left: ghostX }}>
                <span
                  className="zl zfghost"
                  aria-hidden
                  style={{ fontFamily: asked[0].src.kind === "lib" ? `"${repFamily(asked[0].src.id)}", "${fam.css}"` : `"${fam.css}"`, fontSize: ghostZ, fontVariationSettings: "normal", fontFeatureSettings: "normal" }}
                >
                  {zoomLetter}
                  <i className="bl" />
                </span>
              </div>
              <div className="zfnote" style={{ left: ghostX, top: Math.max(10, zoomBase - asc * Z - 16 - 22 * asked.length), width: Math.min(260, Math.max(160, sheet.w - ghostX - 24)) }} role="status">
                {asked.map((a) => (
                  <p key={a.d.key}>{formHint(a.d, a.v)}</p>
                ))}
              </div>
            </>
          )}

          {view === "zoom" && zx !== null && specs.length > 0 && (
            <Handles fam={fam} st={st} ch={zoomLetter} feat={featZ} specs={specs} reach={reach} ox={zx} base={zoomBase} Z={Z} maxY={floorY - 10} sheet={sheetRef} onBegin={onBegin} onSet={onSet} onEnd={onEnd} />
          )}

          {pv.open && !empty && <PreviewStage pv={pv} word={word} />}

          {view !== "word" && (
            <div className={`zpanel ${view === "out" ? "gone" : ""}`} style={{ height: zp }}>
              <div className="zsizes" aria-hidden>
                <div className="zsize-grid">
                  {SIZES.map((z) => {
                    const huge = z.name === "Huge";
                    return (
                      <span key={z.name} className="zsize-line" ref={huge ? hugeEl : undefined} style={{ fontFamily: `"${fam.css}"`, fontSize: huge ? z.px * hugeK : z.px }}>
                        {letters.map((c, i) => (
                          <span key={i} className={i === zi ? "me" : "rest"} style={{ fontVariationSettings: i === zi ? zoomVs : wordVs, fontFeatureSettings: ffsFor(famId, forms, c) }}>
                            {c}
                          </span>
                        ))}
                      </span>
                    );
                  })}
                  {SIZES.map((z) => (
                    <small key={z.name}>
                      {z.name} <span className="mono">{z.px} px</span>
                    </small>
                  ))}
                </div>
                <p className="znote">Only this letter shows while you edit. The whole word changes when you zoom out.</p>
              </div>
              {formDefs.length > 0 && <Forms fam={fam} st={st} ch={zoomLetter} forms={forms} onPick={pickForm} />}
              <div className="zctl">
                <div className="zbtns">
                  <button className="btn" ref={zoomBtn} onClick={() => zoomOut()}>
                    Zoom out
                  </button>
                  <div className="zbtns-row">
                    <button className="textbtn" onClick={doUndo} disabled={!undoCount}>
                      Undo
                    </button>
                    <button className="textbtn" onClick={resetZoom} disabled={!onLetter.some((d) => st[d.id]) && !formDefs.some((d) => (forms as Record<string, string | undefined>)[d.key])}>
                      Reset these
                    </button>
                  </div>
                </div>
                <div className="zrows">
                  {zoomDials.length > 0 ? (
                    <Dials fam={fam} st={st} list={zoomDials} onBegin={onBegin} onSet={onSet} onEnd={onEnd} onResetOne={resetOne} onHot={setHot} flow="row" />
                  ) : (
                    <p className="zrows-none">Every dial that acts on {zoomLetter} has a square on it.</p>
                  )}
                  <p className="dial-def">{hot ? DIALS.find((d) => d.id === hot)!.definition + "." : zoomDials.length ? "Hover or focus a dial to see what it does." : ""}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {(open || pv.open) && (
          <div className={`results-slot ${closing && !pv.open ? "closing" : ""}`}>
            <Results
              status={status}
              results={results}
              yours={yours}
              word={word}
              stale={stale}
              onMatchAgain={runMatch}
              onRetry={runMatch}
              onClose={closeResults}
              kept={pv.keptOf}
              onKeep={pv.keep}
              onUnkeep={pv.unkeep}
              lead={pv.open ? <PreviewLead pv={pv} word={word} /> : undefined}
            />
          </div>
        )}
      </main>

      <div className="top-actions">
        <button className="btn ghost" ref={previewBtn} onClick={onPreview} aria-pressed={pv.open} disabled={empty} title={empty ? "Type a word first" : undefined}>
          {pv.open ? "Back to shaping" : "Preview"}
        </button>
        <button
          className="btn closest"
          ref={closestBtn}
          onClick={onClosest}
          disabled={empty || busy}
          aria-describedby={empty ? "word-hint" : undefined}
          title={empty ? "Type a word first" : undefined}
        >
          {stale && <span className="stale-mark" aria-hidden />}
          {busy ? "Measuring" : stale ? "Match again" : "Closest to this"}
        </button>
      </div>
    </div>
  );
}
