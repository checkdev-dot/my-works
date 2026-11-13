"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormFacts, MatchResult } from "@/lib/match";
import type { Family, FamilyId } from "@/lib/clay";
import { ffsFor, formWords } from "@/lib/forms-ui";
import "./Results.css";

/** forms: the letter forms the person chose for this match. undrawn: the letters among them the tile cannot draw, so Yours keeps its own. */
export type Yours = { fam: Family; vs: string; xHeight: number; forms?: FormFacts; undrawn?: string[] };

/** The word with the chosen forms on the letters they are about, never on the whole word. */
function withForms(word: string, fam: FamilyId, forms?: FormFacts) {
  if (!forms || !Object.keys(forms).length) return word;
  return Array.from(word).map((c, i) => {
    const f = ffsFor(fam, forms, c);
    return f === "normal" ? c : <span key={i} style={{ fontFeatureSettings: f }}>{c}</span>;
  });
}
const plainForm = (w: string) => w.replace(/^its /, "");
function yoursLine(y: Yours) {
  const ws = y.forms ? formWords(y.forms) : [];
  if (!ws.length) return `${y.fam.name} at your settings. Free, already a font.`;
  const miss = y.undrawn?.length ? ` It cannot draw the ${y.undrawn.join(" and ")}, so Yours keeps its own.` : "";
  return `${y.fam.name} at your settings. Searching for fonts where ${ws.map(plainForm).join(" and ")}.${miss} Free, already a font.`;
}

type Props = {
  status: "idle" | "measuring" | "searching" | "done" | "error";
  results: MatchResult[];
  yours: Yours | null;
  word: string;
  /** The letter or tile changed after these results were made. Pass `stale` from Editor. */
  stale?: boolean;
  /** Run the match again with the current letter. Falls back to onRetry. */
  onMatchAgain?: () => void;
  onRetry: () => void;
  onClose: () => void;
  /** Preview: font id to its tray slot (1 to 3) */
  kept?: Record<string, number>;
  onKeep?: (r: MatchResult) => void;
  onUnkeep?: (id: string) => void;
  /** Preview: controls that sit above the list in this column */
  lead?: React.ReactNode;
};

const YOURS_SIZE = 40; // px; the x-height of every row is matched to Yours at this size
const STEM_TOL = 0.15; // stem thickness that differs by more than this reads as lighter or heavier

/** Stem thickness of an H, as a share of the x-height, read from real pixels so the sentence agrees with the eye. */
function stemOf(family: string): number | null {
  try {
    const S = 200;
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 400;
    const x = c.getContext("2d", { willReadFrequently: true });
    if (!x) return null;
    x.font = `${S}px "${family}"`;
    const xh = x.measureText("x").actualBoundingBoxAscent;
    const ch = x.measureText("H").actualBoundingBoxAscent;
    if (!(xh > 10) || !(ch > 10)) return null;
    x.fillText("H", 40, 300);
    const y = Math.round(300 - ch * 0.8);
    const d = x.getImageData(0, 0, 400, 400).data;
    let run = 0;
    for (let i = 0; i < 400; i++) {
      if (d[(y * 400 + i) * 4 + 3] > 128) run++;
      else if (run) return run / xh;
    }
    return null;
  } catch {
    return null;
  }
}

function useFont(url: string, family: string) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [ratio, setRatio] = useState(0.5);
  const [stem, setStem] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    setState("loading");
    const face = new FontFace(family, `url(${url})`);
    face.load().then(
      (f) => {
        document.fonts.add(f);
        // x-height of this real font, measured once it is here
        const c = document.createElement("canvas").getContext("2d");
        if (c) {
          c.font = `100px "${family}"`;
          const m = c.measureText("x").actualBoundingBoxAscent / 100;
          if (m > 0.2 && m < 0.9 && live) setRatio(m);
        }
        if (live) {
          setStem(stemOf(family));
          setState("ready");
        }
      },
      () => live && setState("failed"),
    );
    return () => {
      live = false;
    };
  }, [url, family]);
  return { state, ratio, stem };
}

/** The same stem read for Yours, using its own settings. */
function useYoursStem(yours: Yours | null) {
  const [stem, setStem] = useState<number | null>(null);
  const file = yours?.fam.file;
  const vs = yours?.vs;
  useEffect(() => {
    if (!file || !vs) return;
    let live = true;
    setStem(null);
    const name = "yours-" + Math.random().toString(36).slice(2);
    try {
      const face = new FontFace(name, `url(${file})`, { variationSettings: vs } as FontFaceDescriptors);
      face.load().then(
        (f) => {
          document.fonts.add(f);
          if (live) setStem(stemOf(name));
          document.fonts.delete(f);
        },
        () => {},
      );
    } catch {}
    return () => {
      live = false;
    };
  }, [file, vs]);
  return stem;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The match phrases that nearly every row shares say nothing about which row to pick; they go in the summary. */
function sharedMatches(results: MatchResult[]): string[] {
  if (results.length < 4) return [];
  const n: Record<string, number> = {};
  for (const r of results) for (const m of new Set(r.why.matches)) n[m] = (n[m] ?? 0) + 1;
  return Object.keys(n).filter((k) => n[k] >= results.length * 0.7);
}

function say(s: string) {
  // The sample is drawn at your x-height, so "taller lowercase" cannot be seen as height; it shows against the capitals.
  return s.replace(/^((?:slightly |much )?)taller lowercase$/, "lowercase $1taller beside its capitals").replace(/^((?:slightly |much )?)shorter lowercase$/, "lowercase $1shorter beside its capitals");
}

/** A reason that names letters the typed word does not have says nothing about this word. Keep the letters that are there. */
function inWord(s: string, word: string): string {
  const m = s.match(/\b(?:of )?the ((?:[A-Za-z])(?: and (?:the )?[A-Za-z])*)(?=[ .,]|$)/);
  if (!m) return s;
  const kept = m[1].split(/ and (?:the )?/).filter((c) => word.includes(c));
  if (!kept.length) return "";
  return s.replace(m[1], kept.join(" and "));
}

/** The one difference worth saying when the library names none: the larger of stroke weight and width, measured here. */
function slightly(stem: number | null, yoursStem: number | null, wr: number | null): string {
  const w = stem && yoursStem ? stem / yoursStem - 1 : 0;
  const x = wr ? wr - 1 : 0;
  const pick = Math.abs(w) >= Math.abs(x) ? { v: w, up: "Slightly heavier strokes", down: "Slightly lighter strokes" } : { v: x, up: "Slightly wider", down: "Slightly narrower" };
  if (Math.abs(pick.v) < 0.03) return "";
  return pick.v > 0 ? pick.up : pick.down;
}

function reason(r: MatchResult, shared: string[], measured: "heavier" | "lighter" | null, word: string, slight: string) {
  const diffs = r.why.differs.map((d) => inWord(d, word)).filter(Boolean).map(say);
  const apiWeight = diffs.find((d) => /heavier|lighter/.test(d));
  let match = r.why.matches.map((m) => inWord(m, word)).find((m) => m && !shared.includes(m)) ?? "";
  // Say a weight match only when the pixels agree with it.
  if (match === "weight" && measured) match = "";
  const lead = measured && !apiWeight ? `${measured === "heavier" ? "Heavier" : "Lighter"} strokes` : "";
  const differs = lead || (diffs[0] ? cap(diffs[0]) : "");
  let far = "";
  if (r.vetoed && r.vetoGroups?.length) far = `Far off in ${r.vetoGroups.join(" and ")}.`;
  return {
    match: match ? (match.startsWith("no ") ? cap(match) + "." : `Same ${match}.`) : "",
    differs: differs ? differs + "." : far ? "" : slight ? slight + "." : "",
    far,
  };
}

function Row({
  r,
  rank,
  word,
  yours,
  yoursStem,
  shared,
  showBand,
  onReady,
  onMeasured,
  keptSlot,
  onKeep,
  onUnkeep,
}: {
  r: MatchResult;
  rank: number;
  word: string;
  yours: Yours;
  yoursStem: number | null;
  shared: string[];
  showBand: boolean;
  onReady: () => void;
  onMeasured: (id: string, m: "heavier" | "lighter" | null) => void;
  keptSlot?: number;
  onKeep?: (r: MatchResult) => void;
  onUnkeep?: (id: string) => void;
}) {
  const famName = `r-${r.font.id}`;
  const { state, ratio, stem } = useFont(r.font.fontUrl, famName);
  const [compare, setCompare] = useState(false);
  const size = Math.max(18, Math.min(72, (YOURS_SIZE * yours.xHeight) / ratio));
  const showNumber = r.showNumber !== false && !r.vetoed && !r.weak;
  const band = r.band ?? (r.vetoed ? "same spirit" : "under 60");
  let measured: "heavier" | "lighter" | null = null;
  if (stem && yoursStem) {
    const d = stem / yoursStem - 1;
    if (d > STEM_TOL) measured = "heavier";
    else if (d < -STEM_TOL) measured = "lighter";
  }
  const [wr, setWr] = useState<number | null>(null);
  const w = reason(r, shared, measured, word, slightly(stem, yoursStem, wr));
  // a form the person chose that this font does not have, in the matcher's own words, unless the reason already says it
  const said = (w.differs + " " + w.far).toLowerCase();
  const misses = (r.formMisses ?? []).map((m) => cap(m) + ".").filter((m) => !said.includes(m.toLowerCase().replace(/\.$/, "")));
  useEffect(() => {
    onMeasured(r.font.id, measured);
  }, [r.font.id, measured, onMeasured]);
  const sample = useRef<HTMLDivElement>(null);
  const mine = useRef<HTMLSpanElement>(null);
  const ghost = useRef<HTMLSpanElement>(null);
  const [dy, setDy] = useState(0);

  useEffect(() => {
    if (state === "ready") onReady();
  }, [state, onReady]);

  // Width against Yours at the same x-height: both are drawn at matched x-height, so the ratio of the word widths is the ratio of the fonts.
  useLayoutEffect(() => {
    if (state !== "ready") return;
    const a = mine.current?.getBoundingClientRect().width;
    const b = document.querySelector<HTMLElement>(".yours [data-w]")?.getBoundingClientRect().width;
    if (a && b) setWr((v) => (v !== null && Math.abs(v - a / b) < 0.005 ? v : a / b));
  });

  // Put Yours on the same baseline as this row's sample so the two can be judged by eye.
  useLayoutEffect(() => {
    if (!compare || state !== "ready") return;
    const a = mine.current?.querySelector<HTMLElement>(".res-bl")?.getBoundingClientRect();
    const b = ghost.current?.querySelector<HTMLElement>(".res-bl")?.getBoundingClientRect();
    if (a && b) setDy((v) => v + (a.bottom - b.bottom));
  }, [compare, state, word, size]);

  const wt = r.font.weight !== 400 || r.font.style === "italic" ? `${r.font.weight}${r.font.style === "italic" ? " italic" : ""}` : "";
  const label = `${r.font.family}${wt ? " " + wt : ""}`;

  return (
    <li className="res">
      <div className="res-head">
        <span className="mono res-rank">{String(rank).padStart(2, "0")}</span>
        <span className="res-name" title={label}>
          {r.font.family}
          {wt && <span className="res-wt"> {wt}</span>}
        </span>
        <span className="res-pct mono" aria-label={showNumber ? `${r.match} percent, ${band}` : band}>
          {showNumber ? (
            <>
              {r.match}
              <small>%</small>
              {showBand && <em> {band}</em>}
            </>
          ) : (
            <em>{band}</em>
          )}
        </span>
      </div>
      <div className={`res-sample ${compare ? "is-compare" : ""}`} ref={sample} style={{ height: `calc(${size * 1.25}px * var(--fit, 1))` }}>
        {state === "failed" ? (
          <span className="res-fail">Preview did not load.</span>
        ) : state === "loading" ? (
          <span className="res-loading" role="status">
            Loading preview
          </span>
        ) : (
          <>
            <span ref={mine} data-w style={{ fontFamily: `"${famName}"`, fontSize: `calc(${size}px * var(--fit, 1))`, lineHeight: 1.25, whiteSpace: "nowrap" }}>
              {word}
              <i className="res-bl" />
            </span>
            {compare && (
              <span
                ref={ghost}
                className="res-ghost"
                aria-hidden
                style={{ fontFamily: `"${yours.fam.css}"`, fontVariationSettings: yours.vs, fontSize: `calc(${YOURS_SIZE}px * var(--fit, 1))`, lineHeight: 1.25, transform: `translateY(${dy}px)` }}
              >
                {word}
                <i className="res-bl" />
              </span>
            )}
          </>
        )}
      </div>
      {r.also && r.also.length > 0 && <p className="res-also">also as {r.also.slice(0, 3).map((a) => a.family).join(", ")}</p>}
      <p className="res-why">
        {w.match && <span>{w.match} </span>}
        {w.differs && <span className="res-diff">{w.differs}</span>}
        {misses.length > 0 && <span className="res-diff res-form"> {misses.join(" ")}</span>}
        {w.far && <span className="res-diff"> {w.far}</span>}
      </p>
      <div className="res-actions">
        <a className="res-get" href={r.font.sourceUrl} target="_blank" rel="noreferrer">
          Get it<span className="sr"> ({r.font.family})</span>
        </a>
        <button className="res-act" aria-pressed={compare} onClick={() => setCompare((v) => !v)} disabled={state !== "ready"}>
          {compare ? "Hide outline" : "Compare"}
          <span className="sr"> with yours ({r.font.family})</span>
        </button>
        <span className="res-slot">
          {onKeep && (
            <button className={`res-act res-keep ${keptSlot ? "is-kept" : ""}`} aria-pressed={!!keptSlot} onClick={() => (keptSlot ? onUnkeep?.(r.font.id) : onKeep(r))}>
              {keptSlot ? `Kept · ${keptSlot}` : "Keep"}
              <span className="sr"> ({r.font.family})</span>
            </button>
          )}
        </span>
      </div>
    </li>
  );
}

/** "Nearly all match your weight and width." A shared phrase that starts with "no" is not something to match, so it gets its own verb. */
function nearly(shared: string[]): string {
  const all = shared.filter((x) => !x.startsWith("no "));
  const m = [all[0], all.find((x, i) => i > 0 && !x.includes(" and ") && !all[0].includes(" and "))].filter((x): x is string => !!x);
  const n = shared.filter((x) => x.startsWith("no ")).slice(0, 1);
  if (!m.length && !n.length) return "";
  const parts = [m.length ? `match your ${m.join(" and ")}` : "", n.length ? `have ${n[0]}` : ""].filter(Boolean);
  return ` Nearly all ${parts.join(" and ")}.`;
}

function summary(results: MatchResult[]) {
  const withNum = results.filter((r) => r.showNumber !== false && !r.vetoed && !r.weak);
  const bands = Array.from(new Set(results.map((r) => r.band ?? "under 60")));
  const lo = Math.min(...results.map((r) => r.match));
  const hi = Math.max(...results.map((r) => r.match));
  const uniform = bands.length === 1;
  const range = withNum.length === results.length ? (lo === hi ? `${hi}%` : `${lo} to ${hi}%`) : "";
  return { uniform, band: bands[0], text: uniform ? `All ${results.length} are “${bands[0]}”${range ? `, at ${range}` : ""}.` : `${results.length} fonts, from “${results[0].band ?? "close"}” down to “${results[results.length - 1].band ?? "under 60"}”.` };
}

export function Results({ status, results, yours, word, stale, onMatchAgain, onRetry, onClose, kept, onKeep, onUnkeep, lead }: Props) {
  const head = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!lead) head.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const busy = status === "measuring" || status === "searching";
  const weakAll = results.length > 0 && results.every((r) => r.weak || r.vetoed);
  const yoursStem = useYoursStem(yours);
  const [flags, setFlags] = useState<Record<string, string | null>>({});
  const onMeasured = useMemo(() => (id: string, m: string | null) => setFlags((f) => (f[id] === m ? f : { ...f, [id]: m })), []);
  // Do not claim a weight match for the whole list when the pixels show many rows lighter or heavier.
  const weightOff = results.filter((r) => flags[r.font.id]).length > results.length * 0.25;
  const shared = useMemo(() => sharedMatches(results), [results]);
  const sharedShown = weightOff ? shared.filter((m) => m !== "weight") : shared;
  const sum = useMemo(() => (results.length ? summary(results) : null), [results]);

  // One scale for Yours and every row, so a long word fits the column and x-heights still match.
  const [fit, setFit] = useState(1);
  const [ready, setReady] = useState(0);
  const onReady = useMemo(() => () => setReady((n) => n + 1), []);
  useLayoutEffect(() => {
    const root = list.current;
    if (!root) return;
    const spans = root.querySelectorAll<HTMLElement>(".res-sample > span[data-w]");
    let k = 1;
    spans.forEach((s) => {
      const avail = (s.parentElement?.clientWidth ?? 0) - 2;
      const natural = s.getBoundingClientRect().width / fit;
      if (avail > 40 && natural > 0) k = Math.min(k, avail / natural);
    });
    const next = Math.max(0.35, Math.min(1, k));
    if (Math.abs(next - fit) > 0.01) setFit(next);
  }, [results, yours, word, ready, fit, status]);

  // The percentage is explained once, the first time results show in this browser.
  const [explain, setExplain] = useState(false);
  useEffect(() => {
    try {
      if (status === "done" && results.length && !localStorage.getItem("fe-pct-explained")) {
        setExplain(true);
        localStorage.setItem("fe-pct-explained", "1");
      }
    } catch {}
  }, [status, results.length]);
  const drv = results[0]?.drivers?.slice(0, 2).map((d) => d.group).join(" and ") ?? "";
  const again = onMatchAgain ?? onRetry;
  const hide = () => {
    onClose();
    // the column is gone; keep the keyboard where it was working
    setTimeout(() => document.querySelector<HTMLElement>(".bar .btn")?.focus(), 0);
  };
  const showYours = yours && !busy;

  return (
    <aside className={`results ${stale ? "is-stale" : ""} ${lead ? "is-pv" : ""}`} aria-label="Closest real fonts">
      {lead}
      <div className="results-top">
        <h2 ref={head} tabIndex={lead ? undefined : -1}>Closest real fonts</h2>
        {!lead && <button className="res-hide" onClick={hide}>Hide</button>}
      </div>
      {busy && <div className="res-progress" aria-hidden />}
      {stale && status === "done" && (
        <div className="res-stalebar" role="status">
          <p><strong>Out of date.</strong> You changed the letter after this match. These fonts are for the old one.</p>
          <button className="res-again" onClick={again}>Match again</button>
        </div>
      )}
      <div className="results-scroll" ref={list} style={{ ["--fit" as string]: fit }}>
        {showYours && (
          <section className="yours">
            <div className="res-head">
              <span className="res-name">{stale ? "Yours when you matched" : "Yours"}</span>
              <span className="res-tag">{yours.fam.label.toLowerCase()} letters</span>
            </div>
            <div className="res-sample" style={{ height: `calc(${YOURS_SIZE * 1.25}px * var(--fit, 1))` }}>
              <span data-w style={{ fontFamily: `"${yours.fam.css}"`, fontVariationSettings: yours.vs, fontSize: `calc(${YOURS_SIZE}px * var(--fit, 1))`, lineHeight: 1.25, whiteSpace: "nowrap" }}>{withForms(word, yours.fam.id as FamilyId, yours.forms)}</span>
            </div>
            <p className="res-why">{yoursLine(yours)}</p>
            <a className="res-get" href={yours.fam.googleUrl} target="_blank" rel="noreferrer">Get it<span className="sr"> ({yours.fam.name})</span></a>
          </section>
        )}
        {status === "idle" && lead && <p className="res-state">Press Closest to this to find real fonts to keep. Yours is already here to preview.</p>}
        {busy && (
          <>
            <p className="res-state" role="status">
              {status === "measuring" ? "Measuring your letters" : "Looking through the library"}
            </p>
            <ol className="reslist" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <li className="res res-skel" key={i}>
                  <div className="res-head"><span className="res-bar" style={{ width: 120 + ((i * 37) % 60) }} /></div>
                  <div className="res-sample"><span className="res-bar res-bar-tall" /></div>
                </li>
              ))}
            </ol>
          </>
        )}
        {status === "error" && (
          <div className="res-state" role="alert">
            <p>The match did not run. Your letter is safe.</p>
            <button className="res-again" onClick={onRetry}>Try again</button>
          </div>
        )}
        {status === "done" && results.length === 0 && <p className="res-state">Nothing in the library comes close to this.</p>}
        {status === "done" && weakAll && <p className="res-state">Nothing is really close. These are the nearest.</p>}
        {status === "done" && yours && results.length > 0 && sum && (
          <>
            <p className="res-sum">
              {sum.text}
              {nearly(sharedShown)}
            </p>
            {explain && <p className="res-pctnote">The percent is how likely a designer would call the font a close match{drv ? `, here mostly ${drv}` : ""}. It is not yet checked against designers' own judgement.</p>}
            <ol className="reslist">
              {results.map((r, i) => (
                <Row key={r.font.id} r={r} rank={i + 1} word={word} yours={yours} yoursStem={yoursStem} shared={shared} onMeasured={onMeasured} showBand={!sum.uniform} onReady={onReady} keptSlot={kept?.[r.font.id]} onKeep={onKeep} onUnkeep={onUnkeep} />
              ))}
            </ol>
          </>
        )}
      </div>
    </aside>
  );
}
