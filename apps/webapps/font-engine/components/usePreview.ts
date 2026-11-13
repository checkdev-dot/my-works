"use client";

// Preview state: the tray, the mode, the stage. Lives apart from Editor so the editor only wires it in.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FontMeta, MatchResult } from "@/lib/match";
import { variationCss, type Family, type DialState } from "@/lib/clay";
import { loadFamily, measureTabular, rolesFor, type FamRec, type Roles } from "@/lib/preview/fonts";

export type Slot = 0 | 1 | 2 | 3; // 0 is Yours; 1 to 3 are the kept fonts, keys 0 1 2 3
export type Kept = { font: FontMeta; at: number };
export type TplId = "dashboard" | "phone" | "document" | "slide" | "poster" | "social" | "brand";
export type Side = "ui" | "graphics";
export type Mode = "compare" | "pair";
export type Paper = "white" | "ink";

export const TEMPLATES: { id: TplId; n: string; name: string; dims: string; side: Side; min: number }[] = [
  { id: "dashboard", n: "7.1", name: "Web application", dims: "1280 × 800", side: "ui", min: 13 },
  { id: "phone", n: "7.2", name: "Phone app", dims: "390 × 844", side: "ui", min: 10 },
  { id: "document", n: "7.3", name: "Press release", dims: "A4", side: "ui", min: 10 },
  { id: "slide", n: "7.4", name: "Slide", dims: "16 : 9", side: "ui", min: 14 },
  { id: "poster", n: "7.5", name: "Poster", dims: "560 × 840", side: "graphics", min: 14 },
  { id: "social", n: "7.6", name: "Social", dims: "400 × 400", side: "graphics", min: 9 },
  { id: "brand", n: "7.7", name: "Brand sheet", dims: "1280 × 800", side: "graphics", min: 8 },
];

export type RoleFont = { slot: Slot; rec: FamRec; roles: Roles; label: string };
export type Notice = { text: string; undo: () => void } | null;

const loadingRec = (f: FontMeta): FamRec => ({ key: f.id, name: f.family, css: `pv-${f.familyId}`, state: "loading", weights: [], italic: false, tabular: null, xh: 0.5 });

export function usePreview(a: { fam: Family; st: DialState; fontsReady: boolean; onClose: () => void }) {
  const { fam, st, fontsReady } = a;
  const [open, setOpen] = useState(false);
  const [tray, setTray] = useState<(Kept | null)[]>([null, null, null]);
  const [pref, setPref] = useState<Slot>(0);
  const [sel, setSel] = useState<Slot>(0);
  const [mode, setMode] = useState<Mode>("compare");
  const [swapped, setSwapped] = useState(false);
  const [tpl, setTplState] = useState<TplId>("dashboard");
  const [last, setLast] = useState<Record<Side, TplId>>({ ui: "dashboard", graphics: "poster" });
  const [paper, setPaper] = useState<Paper>("white");
  const [paste, setPaste] = useState("");
  const [recs, setRecs] = useState<Record<string, FamRec>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [blink, setBlink] = useState(false);
  const [loupe, setLoupe] = useState(false);
  const [pulse, setPulse] = useState<Slot | null>(null);
  const [tabYours, setTabYours] = useState<boolean | null>(null);

  const seq = useRef(0);
  const trayRef = useRef(tray);
  trayRef.current = tray;
  const prefRef = useRef(pref);
  prefRef.current = pref;
  const selRef = useRef(sel);
  selRef.current = sel;
  const recsRef = useRef(recs);
  recsRef.current = recs;
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const side: Side = TEMPLATES.find((t) => t.id === tpl)!.side;

  // ---- Yours: the shaped clay font at its current settings
  const vs = variationCss(fam, st);
  useEffect(() => {
    if (!fontsReady) return;
    setTabYours(measureTabular(fam.css, vs));
  }, [fam.css, vs, fontsReady]);
  const yours: FamRec = useMemo(
    () => ({ key: "yours", name: fam.name, css: fam.css, state: fontsReady ? "ready" : "loading", weights: [400], italic: false, tabular: tabYours, xh: fam.xh, vs }),
    [fam.name, fam.css, fam.xh, vs, fontsReady, tabYours],
  );

  // ---- loading
  const ensure = useCallback((f: FontMeta, retry = false) => {
    if (retry) setRecs((r) => ({ ...r, [f.id]: loadingRec(f) }));
    void loadFamily(f, retry).then((rec) => setRecs((r) => ({ ...r, [f.id]: { ...rec, key: f.id } })));
  }, []);

  const recOf = useCallback(
    (s: Slot): FamRec => {
      if (s === 0) return yours;
      const k = tray[s - 1];
      if (!k) return yours;
      return recs[k.font.id] ?? loadingRec(k.font);
    },
    [yours, tray, recs],
  );

  // ---- keep
  const say = useCallback((n: Notice) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(n);
    if (n) noticeTimer.current = setTimeout(() => setNotice(null), 9000);
  }, []);

  const keep = useCallback(
    (r: MatchResult) => {
      const t = trayRef.current;
      if (t.some((k) => k?.font.id === r.font.id)) return;
      const was = { tray: t, pref: prefRef.current, sel: selRef.current };
      let idx = t.findIndex((k) => !k);
      let out: Kept | null = null;
      if (idx < 0) {
        const cand = t.map((k, i) => ({ k: k!, i })).filter((x) => x.i + 1 !== prefRef.current);
        const old = cand.reduce((x, y) => (y.k.at < x.k.at ? y : x));
        idx = old.i;
        out = old.k;
      }
      const next = [...t];
      next[idx] = { font: r.font, at: ++seq.current };
      setTray(next);
      const first = t.every((k) => !k);
      if (first) {
        setPref((idx + 1) as Slot);
        setSel((idx + 1) as Slot);
      } else if (out && selRef.current === idx + 1) setSel(prefRef.current);
      ensure(r.font);
      say(
        out
          ? {
              text: `Swapped out ${out.font.family} for ${r.font.family}.`,
              undo: () => {
                setTray(was.tray);
                setPref(was.pref);
                setSel(was.sel);
                setNotice(null);
              },
            }
          : null,
      );
    },
    [ensure, say],
  );

  const unkeep = useCallback((fontId: string) => {
    const t = trayRef.current;
    const idx = t.findIndex((k) => k?.font.id === fontId);
    if (idx < 0) return;
    const next = [...t];
    next[idx] = null;
    setTray(next);
    const rest = next.findIndex((k) => !!k);
    if (prefRef.current === idx + 1) setPref(rest >= 0 ? ((rest + 1) as Slot) : 0);
    if (selRef.current === idx + 1) setSel(rest >= 0 ? ((rest + 1) as Slot) : 0);
    setNotice(null);
  }, []);

  const keptOf = useMemo(() => {
    const m: Record<string, number> = {};
    tray.forEach((k, i) => {
      if (k) m[k.font.id] = i + 1;
    });
    return m;
  }, [tray]);

  // ---- pairing: slot order sets the role
  const pairSlots: Slot[] = useMemo(() => {
    const filled = ([1, 2, 3] as Slot[]).filter((s) => tray[s - 1]);
    return pref === 0 ? [0, ...filled] : [pref, ...filled.filter((s) => s !== pref)];
  }, [tray, pref]);
  const pairReady = pairSlots.length >= 2 && pairSlots.every((s) => recOf(s).state === "ready");
  const pairWhy = pairSlots.length < 2 ? "Keep a second font to pair" : pairReady ? "" : "Fonts are still loading";
  const effMode: Mode = mode === "pair" && pairReady ? "pair" : "compare";

  const shown: Slot = blink ? pref : sel;
  const roleSlots = useMemo(() => {
    if (effMode === "compare") return { h: shown, b: shown, a: shown };
    const [p0, p1, p2] = pairSlots;
    const ac = p2 ?? p0;
    return swapped ? { h: p1, b: p0, a: ac } : { h: p0, b: p1, a: ac };
  }, [effMode, shown, pairSlots, swapped]);

  const roleFont = (s: Slot): RoleFont => {
    const rec = recOf(s);
    const base = s === 0 ? 400 : tray[s - 1]!.font.weight;
    return { slot: s, rec, roles: rolesFor(rec, base), label: rec.name };
  };
  const fonts = { h: roleFont(roleSlots.h), b: roleFont(roleSlots.b), a: roleFont(roleSlots.a) };
  const ready = fonts.h.rec.state === "ready" && fonts.b.rec.state === "ready" && fonts.a.rec.state === "ready";

  // ---- actions
  const select = useCallback((s: Slot) => {
    if (s !== 0 && !trayRef.current[s - 1]) return;
    if (s !== 0) {
      const rec = recsRef.current[trayRef.current[s - 1]!.font.id];
      if (rec?.state !== "ready") {
        setPulse(s);
        setTimeout(() => setPulse(null), 500);
        return;
      }
    }
    setSel(s);
  }, []);
  const prefer = useCallback((s: Slot) => {
    setPref(s);
    if (s === 0 || recsRef.current[trayRef.current[s - 1]?.font.id ?? ""]?.state === "ready") setSel(s);
  }, []);
  const setTpl = useCallback((id: TplId) => {
    setTplState(id);
    const sd = TEMPLATES.find((t) => t.id === id)!.side;
    setLast((l) => ({ ...l, [sd]: id }));
  }, []);
  const setSide = useCallback(
    (s: Side) => {
      setTplState(last[s]);
    },
    [last],
  );
  const togglePair = useCallback(() => setMode((m) => (m === "pair" ? "compare" : "pair")), []);
  const swap = useCallback(() => setSwapped((v) => !v), []);
  const retry = useCallback(
    (s: Slot) => {
      const k = s > 0 ? trayRef.current[s - 1] : null;
      if (k) ensure(k.font, true);
    },
    [ensure],
  );

  // ---- keys
  const act = useRef({ select, togglePair, swap, setSide, tpl, side, setTpl });
  act.current = { select, togglePair, swap, setSide, tpl, side, setTpl };
  const modeRef = useRef(effMode);
  modeRef.current = effMode;
  const closeRef = useRef(a.onClose);
  closeRef.current = a.onClose;
  useEffect(() => {
    if (!open) return;
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const A = act.current;
      if (k === " " || k === "Spacebar") {
        e.preventDefault();
        if (!e.repeat) setBlink(true);
      } else if (k.length === 1 && k >= "0" && k <= "3") {
        if (modeRef.current === "compare") A.select(+k as Slot);
        else if (+k === 0 || trayRef.current[+k - 1]) {
          setPulse(+k as Slot);
          setTimeout(() => setPulse(null), 400);
        }
      } else if (k === "p" || k === "P") A.togglePair();
      else if (k === "s" || k === "S") {
        if (modeRef.current === "pair") A.swap();
      } else if (k === "u" || k === "U") A.setSide("ui");
      else if (k === "g" || k === "G") A.setSide("graphics");
      else if (k === "l" || k === "L") {
        if (!e.repeat) setLoupe(true);
      } else if (k === "ArrowLeft" || k === "ArrowRight") {
        const list = TEMPLATES.filter((t) => t.side === A.side);
        const i = list.findIndex((t) => t.id === A.tpl);
        const n = list[(i + (k === "ArrowRight" ? 1 : list.length - 1)) % list.length];
        A.setTpl(n.id);
        e.preventDefault();
      } else if (k === "Escape") closeRef.current();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Spacebar") {
        if (!typing(e.target)) e.preventDefault();
        setBlink(false);
      } else if (e.key === "l" || e.key === "L") setLoupe(false);
    };
    const off = () => {
      setBlink(false);
      setLoupe(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", off);
    };
  }, [open]);

  useEffect(() => {
    if (mode === "pair" && pairSlots.length < 2) setMode("compare");
  }, [mode, pairSlots.length]);

  return {
    open, setOpen, tray, pref, sel, mode: effMode, wantPair: mode, swapped, tpl, side, paper, setPaper, paste, setPaste, notice, setNotice,
    blink, loupe, pulse, yours, recOf, keptOf, keep, unkeep, select, prefer, setTpl, setSide, togglePair, swap, retry,
    pairReady, pairWhy, pairSlots, roleSlots, fonts, ready, shown,
  };
}
export type PreviewApi = ReturnType<typeof usePreview>;
