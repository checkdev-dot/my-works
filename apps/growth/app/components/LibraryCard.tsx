"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LeftOut, Pick, PickScore } from "@/lib/types";
import { ChevronRight, type LucideIcon } from "./icons";
import { lengthText } from "@/lib/rating-state.mjs";

/** One place for the Library card's pieces: the drawn tile, the verdict, the time cue, the fold with the six checks. */

const VERDICT: Record<PickScore["verdict"], string> = { read_now: "Read now", worth_it: "Worth it", skim: "Skim" };
const VERDICT_VERB: Partial<Record<Pick["kind"], string>> = { video: "Watch now", podcast: "Listen now" };

const ROWS: { key: "fit" | "gain" | "time" | "substance" | "fresh" | "best"; label: string }[] = [
  { key: "fit", label: "Fits you" },
  { key: "gain", label: "You’ll learn" },
  { key: "time", label: "Worth the time" },
  { key: "substance", label: "Real substance, not jargon" },
  { key: "fresh", label: "Up to date" },
  { key: "best", label: "Best option" },
];

/** Open Library answers a missing cover with a blank 1px image unless asked to fail. */
export function thumbSrc(url?: string): string | undefined {
  if (!url) return undefined;
  if (/covers\.openlibrary\.org/i.test(url) && !/[?&]default=false/.test(url)) return url + (url.includes("?") ? "&" : "?") + "default=false";
  return url;
}

const fmt = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso.length === 4 ? `${iso}-01-01T00:00:00` : iso.length === 7 ? `${iso}-01T00:00:00` : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const opts: Intl.DateTimeFormatOptions = iso.length === 4 ? { year: "numeric" } : iso.length === 7 ? { month: "short", year: "numeric" } : { day: "numeric", month: "short", year: "numeric" };
  return d.toLocaleDateString("en-GB", opts);
};

/** The drawn stand-in for a missing picture: never an empty box. Shapes carry the kind. */
function Drawn({ kind }: { kind: Pick["kind"] }) {
  const c = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "book")
    return (
      <svg className="pt-book" viewBox="0 0 48 68" aria-hidden>
        <rect x="2" y="2" width="44" height="64" rx="4" fill="var(--bg)" stroke="currentColor" strokeWidth="2" />
        <path d="M11 2v64" {...c} />
        <path d="M19 18h19M19 25h14" {...c} />
      </svg>
    );
  if (kind === "video")
    return (
      <svg className="pt-wide" viewBox="0 0 96 56" aria-hidden>
        <rect x="2" y="2" width="92" height="52" rx="6" fill="var(--bg)" stroke="currentColor" strokeWidth="2" />
        <circle cx="48" cy="28" r="14" {...c} />
        <path d="M43 21.5v13l11-6.5z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  if (kind === "visual")
    return (
      <svg className="pt-wide" viewBox="0 0 96 56" aria-hidden>
        {[0, 1, 2].map((i) => <rect key={i} x={6 + i * 30} y="6" width="26" height="20" rx="4" fill="var(--bg)" stroke="currentColor" strokeWidth="2" />)}
        {[0, 1, 2].map((i) => <rect key={i} x={6 + i * 30} y="30" width="26" height="20" rx="4" fill="var(--bg)" stroke="currentColor" strokeWidth="2" />)}
      </svg>
    );
  if (kind === "podcast")
    return (
      <svg className="pt-wide" viewBox="0 0 96 56" aria-hidden>
        {[10, 22, 34, 18, 40, 26, 12].map((h, i) => <path key={i} d={`M${14 + i * 11} ${28 - h / 2}v${h}`} {...c} strokeWidth="4" />)}
      </svg>
    );
  if (kind === "news")
    return (
      <svg className="pt-wide" viewBox="0 0 96 56" aria-hidden>
        <rect x="8" y="6" width="80" height="44" rx="6" fill="var(--bg)" stroke="currentColor" strokeWidth="2" />
        <path d="M18 18h30M18 27h60M18 36h44" {...c} />
        <circle cx="72" cy="17" r="4" fill="currentColor" />
      </svg>
    );
  return (
    <svg className="pt-wide" viewBox="0 0 96 56" aria-hidden>
      <rect x="22" y="3" width="52" height="50" rx="5" fill="var(--bg)" stroke="currentColor" strokeWidth="2" />
      <path d="M32 16h32M32 25h32M32 34h20" {...c} />
    </svg>
  );
}

/** Thumbnail when there is one, the drawn tile otherwise or when the picture fails to load. */
export function PickTile({ p, tone }: { p: Pick; tone?: "skill" | "reach" }) {
  const [bad, setBad] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  const src = bad ? undefined : thumbSrc(p.thumb);
  const book = p.kind === "book";
  // Errors can fire before hydration, so check the element itself once mounted.
  useEffect(() => {
    const im = ref.current;
    if (!im || !im.complete) return;
    if (im.naturalWidth > 1) setLoaded(true);
    else setBad(true);
  }, [src]);
  return (
    <div className={`pick-tile${tone ? ` tone-${tone}` : ""}${book ? " is-book" : ""}`} aria-hidden>
      {(!src || !loaded) && <Drawn kind={p.kind} />}
      {src && (
        // A plain img on purpose: covers come from other hosts. The drawn tile shows until it has loaded.
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={ref} src={src} alt="" width={book ? 56 : 128} height={book ? 80 : 72} loading="lazy" decoding="async" referrerPolicy="no-referrer"
          className={loaded ? "is-loaded" : "is-pending"} onLoad={(e) => { if (e.currentTarget.naturalWidth > 1) setLoaded(true); else setBad(true); }} onError={() => setBad(true)} />
      )}
    </div>
  );
}

/** A picture only where one really loads (YouTube, Open Library). No drawn stand-in, no empty box. */
export function PickThumb({ p, className }: { p: Pick; className?: string }) {
  const [state, setState] = useState<"wait" | "ok" | "bad">("wait");
  const ref = useRef<HTMLImageElement>(null);
  const src = thumbSrc(p.thumb);
  useEffect(() => {
    const im = ref.current;
    if (!im || !im.complete) return;
    setState(im.naturalWidth > 1 ? "ok" : "bad");
  }, [src]);
  if (!src || state === "bad") return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
      className={`lib-thumb${p.kind === "book" ? " is-book" : ""}${state === "ok" ? " is-loaded" : " is-pending"}${className ? ` ${className}` : ""}`}
      onLoad={(e) => setState(e.currentTarget.naturalWidth > 1 ? "ok" : "bad")} onError={() => setState("bad")} />
  );
}

/** Claude's verdict as one quiet word, or an honest "Not scored yet". No ring, no number. */
/** A 20px monogram tile for a source or provider: its first letter, neutral ink on a faint tint. Drawn locally, never fetched. */
export function SourceMark({ name }: { name?: string }) {
  const ch = (name ?? "").trim().charAt(0).toUpperCase();
  if (!ch) return null;
  return <span className="src-mark" aria-hidden="true">{ch}</span>;
}

export function PickWord({ p }: { p: Pick }) {
  const sc = p.score;
  // Said once, in the page lede ("N of M picks are scored"); a card with no score just has no verdict word.
  if (!sc) return null;
  const below = Math.round(sc.total) < 65;
  const word = below ? "Below the bar" : (p.kind === "video" || p.kind === "podcast") && sc.verdict === "read_now" ? VERDICT_VERB[p.kind]! : VERDICT[sc.verdict];
  return <span className={`pick-word${below ? " is-below" : ""}`} title={`Claude scored this ${Math.round(sc.total)} out of 100`}>{word}</span>;
}

/** "checked 3 days ago", only where a date exists. Never claims a check that did not happen. */
export function checkedAgo(p: Pick, today: string): { label: string; due: boolean } | null {
  // An unscored pick says "Not scored yet" and nothing about being checked.
  if (!p.checked || !p.score) return null;
  const d = Math.floor((new Date(`${today}T00:00:00`).getTime() - new Date(`${p.checked}T00:00:00`).getTime()) / 864e5);
  if (Number.isNaN(d)) return null;
  if (d <= 0) return { label: "checked today", due: false };
  if (d === 1) return { label: "checked yesterday", due: false };
  if (d <= 30) return { label: `checked ${d} days ago`, due: false };
  const w = Math.round(d / 7);
  return { label: `checked ${w} weeks ago, due for a recheck`, due: true };
}

/** The verdict word with the total in a small neutral ring. */
export function PickVerdict({ p }: { p: Pick }) {
  const sc = p.score;
  if (!sc) return null;
  const C = 2 * Math.PI * 13;
  const t = Math.max(0, Math.min(100, Math.round(sc.total)));
  const below = t < 65;
  const word = below ? "Below the bar" : (p.kind === "video" || p.kind === "podcast") && sc.verdict === "read_now" ? VERDICT_VERB[p.kind]! : VERDICT[sc.verdict];
  const label = `Claude scored this ${t} out of 100`;
  return (
    <span className={`pick-verdict${below ? " is-below" : ""}`} title={label}>
      <span className="pv-word">{word}</span>
      <span className="pv-ring" title={label}>
        <span className="pv-hidden">Scored {t} of 100</span>
        <span className="pv-n" aria-hidden>{t}</span>
        <svg viewBox="0 0 32 32" aria-hidden>
          <circle cx="16" cy="16" r="13" className="pv-track" />
          <circle cx="16" cy="16" r="13" className="pv-arc" strokeDasharray={`${(C * t) / 100} ${C}`} transform="rotate(-90 16 16)" />
        </svg>
      </span>
    </span>
  );
}

/** Minutes against his hour a night: a thin bar and one plain sentence. Books are measured in evenings instead. */
export function TimeCue({ p }: { p: Pick }) {
  if (!p.minutes) return null;
  const len = lengthText(p.minutes, p.kind);
  const cap1 = len.charAt(0).toUpperCase() + len.slice(1);
  if (p.kind === "book") return <p className="pick-time"><span>{cap1}</span></p>;
  const pct = Math.min(100, Math.round((p.minutes / 60) * 100));
  const words = len.startsWith("about") ? cap1 : `About ${len}${p.minutes <= 60 ? " of tonight" : ""}`;
  return (
    <p className="pick-time">
      <span className="pt-bar" aria-hidden><span style={{ width: `${Math.max(pct, 6)}%` }} /></span>
      <span>{words}</span>
    </p>
  );
}

function Segs({ n, label }: { n: number; label: string }) {
  const v = Math.max(0, Math.min(10, Math.round(n)));
  return (
    <span className="seg10" role="img" aria-label={`${label}: ${v} out of 10`}>
      {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < v ? "on" : ""} />)}
    </span>
  );
}

/** The fold: the six checks in plain words, what it was compared with, and when it was checked. */
export function ScoreFold({ p }: { p: Pick }) {
  const sc = p.score;
  if (!sc) return null;
  const when = [p.checked ? `Checked ${fmt(p.checked)}` : sc.scored ? `Scored ${fmt(sc.scored)}` : "", p.published ? `published ${fmt(p.published)}` : ""].filter(Boolean).join(", ");
  return (
    <details className="pick-fold">
      <summary><ChevronRight className="chev" aria-hidden /> <span>How it scored, {Math.round(sc.total)} of 100</span></summary>
      <div className="pf-body">
        <p className="pf-line muted">This is Claude&apos;s judgement, not a popularity count. Fit and what you&apos;d learn count most.</p>
        <ul className="pf-rows">
          {ROWS.map((r) => (
            <li key={r.key}>
              <span className="pf-label">{r.label}</span>
              <Segs n={sc[r.key]} label={r.label} />
              <span className="pf-n">{Math.round(sc[r.key])}<span className="muted">/10</span></span>
            </li>
          ))}
        </ul>
        {sc.compared?.length > 0 && <p className="pf-line"><b>Compared with:</b> {sc.compared.join(", ")}</p>}
        {sc.better && <p className="pf-line"><b>Something better?</b> {sc.better}</p>}
        {when && <p className="pf-line muted">{when}.</p>}
      </div>
    </details>
  );
}

export interface LibraryCardProps {
  p: Pick;
  Icon: LucideIcon;
  kindLabel: string;
  tone?: "skill" | "reach";
  /** Small tags beside the kind, such as where it can be done. */
  tags?: ReactNode;
  meta: string[];
  closes?: string | null;
  feeds?: string | null;
  kept?: boolean;
  /** Notes, the finish form and the actions. Rendered under the fold. */
  children?: ReactNode;
}

/** The whole card: one drawn tile, the verdict, the title and why, the time cost, and the fold. */
export function LibraryCard({ p, Icon, kindLabel, tone, tags, meta, closes, feeds, children, row, today, expanded, hideWhy }: LibraryCardProps & { /** The rationale is identical on 2+ picks, so it is not shown. */ hideWhy?: boolean; /** A bare T3 row: no card, no ring, the verdict as a word. */ row?: boolean; today?: string; /** Row opened with More: shows what it closes and the six checks. */ expanded?: boolean }) {
  if (row) {
    const chk = today ? checkedAgo(p, today) : null;
    return (
      <li className="att-3 lib-row" id={`pick-${p.id}`} tabIndex={-1}>
        <div className="lib-row-top">
          <PickThumb p={p} />
          <div className="lib-row-main">
            <h3 className="lib-row-title"><a href={p.url} target="_blank" rel="noreferrer">{p.title}</a></h3>
            <p className="lib-meta">
              <span>{kindLabel}</span>
              {p.by && <span className="has-mark"><SourceMark name={p.by} />{p.by}</span>}
              {meta.map((m, i) => <span key={i}>{m}</span>)}
              <PickWord p={p} />
              {chk && <span className={chk.due ? "is-due" : undefined}>{chk.label}</span>}
            </p>
            {!hideWhy && (p.score?.why || p.why) && <p className="lib-row-why">{p.score?.why || p.why}</p>}
            {expanded && (closes || feeds) && (
              <p className="lib-row-feeds">
                {closes && <span>Closes: {closes}</span>}
                {feeds && <span>Feeds: {feeds}</span>}
              </p>
            )}
          </div>
        </div>
        {expanded && <ScoreFold p={p} />}
        {children}
      </li>
    );
  }
  return (
    <li className="pick" id={`pick-${p.id}`} tabIndex={-1}>
      <div className="pick-face">
        <PickTile p={p} tone={tone} />
        <div className="pick-main">
          <div className="pick-head">
            <span className="tag tag-gray"><Icon aria-hidden /> {kindLabel}</span>
            {tags}
            <PickVerdict p={p} />
          </div>
          <h3 className="pick-title"><a href={p.url} target="_blank" rel="noreferrer">{p.title}</a></h3>
          <p className="pick-by"><span className="pick-by-i has-mark"><SourceMark name={p.by} />{p.by}</span>{meta.map((m, i) => <span key={i} className="pick-by-i muted">{m}</span>)}</p>
          <p className="pick-why">{p.score?.why || p.why}</p>
          <TimeCue p={p} />
          {(closes || feeds) && (
            <p className="pick-feeds">
              {closes && <span><b>Closes:</b> {closes}</span>}
              {feeds && <span><b>Feeds:</b> {feeds}</span>}
            </p>
          )}
        </div>
      </div>
      <ScoreFold p={p} />
      {children}
    </li>
  );
}

/** What Claude looked at and left out, so the list can be trusted. Hidden when empty. */
export function LeftOutFold({ items }: { items?: LeftOut[] }) {
  if (!items || items.length === 0) return null;
  const kind: Record<LeftOut["kind"], string> = { book: "Book", article: "Article", video: "Video", visual: "Flows to study", podcast: "Podcast", news: "New in design" };
  return (
    <details className="toggle att-4">
      <summary><ChevronRight className="chev" aria-hidden /> <span><b>What I left out and why ({items.length})</b><span className="muted">Looked at, scored, and not picked. The reason is on each.</span></span></summary>
      <ul className="leftout">
        {items.map((l, i) => (
          <li key={`${l.title}-${i}`}>
            <span className="lo-title">{l.url ? <a href={l.url} target="_blank" rel="noreferrer">{l.title}</a> : l.title}</span>
            <span className="lo-meta muted">{kind[l.kind]}{typeof l.total === "number" ? ` · scored ${l.total}` : ""}</span>
            <span className="lo-why">{l.why_not}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
