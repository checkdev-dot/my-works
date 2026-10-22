"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronRight, Copy, X } from "./icons";
import { splitAttention, inboxSummary, whenPhrase, waitingPhrase, notCounted, type AttentionItem, type AttentionLevel } from "@/lib/attention.mjs";

/* The attention inbox: what needs the person, most to least. One row is one button that does its one thing. */

const HEAD: Record<AttentionLevel, string> = { now: "Now", today: "Today", week: "This week", fyi: "Good to know" };
const ORDER: AttentionLevel[] = ["now", "today", "week", "fyi"];

/** Shape carries the level, not colour: filled, ring, dash, small outline. */
function Marker({ level }: { level: AttentionLevel }) {
  return (
    <svg className={`attn-mark attn-mark-${level}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden focusable="false">
      {level === "now" && <circle cx="8" cy="8" r="6" fill="currentColor" />}
      {level === "today" && <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="2" />}
      {level === "week" && <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
      {level === "fyi" && <circle cx="8" cy="8" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.25" />}
    </svg>
  );
}

function CopyChip({ cmd }: { cmd: string }) {
  const [ok, setOk] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return (
    <div className="attn-chip">
      <span className="attn-chip-l">Say this in Claude Code</span>
      <span className="attn-chip-row">
        <code>{cmd}</code>
        <button type="button" className="attn-copy" aria-label={`Copy ${cmd}`} onClick={async () => {
          try { await navigator.clipboard.writeText(cmd); setOk(true); if (t.current) clearTimeout(t.current); t.current = setTimeout(() => setOk(false), 2000); } catch { setOk(false); }
        }}>{ok ? <Check aria-hidden /> : <Copy aria-hidden />}<span>{ok ? "Copied" : "Copy"}</span></button>
      </span>
    </div>
  );
}

/** The list. `onAct` runs a view or sheet action; a command row reveals its chip here instead. */
export function AttentionList({ items, today, onAct, autoFocus, showSum = true }: { items: AttentionItem[]; today: string; onAct: (i: AttentionItem) => void; autoFocus?: boolean; showSum?: boolean }) {
  // Every counted row (now and today) sits above the fold, so the sheet always adds up to the badge.
  const { top, later } = splitAttention(items, { perLevel: 99, top: 99 });
  const [chip, setChip] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { if (autoFocus) root.current?.querySelector<HTMLElement>(".attn-row")?.focus({ preventScroll: true }); }, [autoFocus]);
  if (items.length === 0) return <p className="attn-empty">Nothing needs you.</p>;
  const row = (i: AttentionItem) => {
    const phrase = i.level === "now" || i.level === "today" ? waitingPhrase(i.when, today) : whenPhrase(i.when, today);
    const isCmd = i.action.type === "command";
    return (
      <li key={i.id} className={`attn-item attn-${i.level}`}>
        <button type="button" className="attn-row" aria-expanded={isCmd ? chip === i.id : undefined}
          onClick={() => (isCmd ? setChip(chip === i.id ? null : i.id) : onAct(i))}>
          <Marker level={i.level} />
          <span className="attn-text">
            <span className="attn-title">{i.title}</span>
            {phrase && <span className="attn-when">{phrase}</span>}
            {i.why && <span className="attn-why">{i.why}</span>}
          </span>
          <ChevronRight className="attn-go" aria-hidden />
        </button>
        {isCmd && chip === i.id && i.action.type === "command" && <CopyChip cmd={i.action.cmd} />}
      </li>
    );
  };
  const groups = (list: AttentionItem[]) => ORDER.filter((l) => list.some((i) => i.level === l)).map((l) => (
    <section key={l} className="attn-group" aria-label={HEAD[l]}>
      <h3 className="attn-h">{HEAD[l]}</h3>
      <ul className="attn-ul">{list.filter((i) => i.level === l).map(row)}</ul>
    </section>
  ));
  return (
    <div className="attn" ref={root}>
      {showSum && inboxSummary(items).n > 0 && <p className="attn-sum muted">{inboxSummary(items).line}</p>}
      {groups(top)}
      {later.length > 0 && (
        <details className="attn-later">
          <summary><ChevronRight className="chev" aria-hidden /> <span>{notCounted(later).n > 0 ? notCounted(later).text : `${later.length} more`}</span></summary>
          {groups(later)}
        </details>
      )}
    </div>
  );
}

/** Desktop: a small panel under the badge. Escape, a click outside, or choosing a row closes it. */
export function AttentionPopover({ anchor, onClose, children }: { anchor: HTMLElement; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const measure = () => {
    const r = anchor.getBoundingClientRect();
    const w = Math.min(380, window.innerWidth - 16);
    const top = Math.round(r.bottom + 8);
    const left = Math.max(8, Math.min(Math.round(r.left), window.innerWidth - w - 8));
    return { top, left, maxH: Math.max(160, window.innerHeight - top - 16) };
  };
  // Placed on the first render so the first row can take focus straight away.
  const [pos, setPos] = useState(measure);
  const place = () => setPos(measure());
  useLayoutEffect(place, [anchor]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    const down = (e: PointerEvent) => { const t = e.target as Node; if (!ref.current?.contains(t) && !anchor.contains(t)) onClose(); };
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", down);
    window.addEventListener("resize", place);
    // Modal: the rest of the app is inert while the panel is open, and released before focus goes back to the opener.
    const muted: Element[] = [];
    const host = ref.current?.parentElement;
    if (host) for (const el of Array.from(host.children)) {
      if (el === ref.current || el.hasAttribute("inert") || el.classList.contains("toast") || el.classList.contains("skip-link")) continue;
      el.setAttribute("inert", ""); muted.push(el);
    }
    return () => {
      window.removeEventListener("keydown", key); window.removeEventListener("pointerdown", down); window.removeEventListener("resize", place);
      muted.forEach((el) => el.removeAttribute("inert"));
      anchor.focus({ preventScroll: true });
      // The opener can be re-created by the render that closes the panel; try once more after it.
      requestAnimationFrame(() => { if (anchor.isConnected && document.activeElement === document.body) anchor.focus({ preventScroll: true }); });
    };
  }, [anchor, onClose]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="attn-pop" role="dialog" aria-modal="true" aria-label="Needs you" ref={ref} style={{ top: pos.top, left: pos.left, maxHeight: pos.maxH }}>
      <div className="attn-pop-head"><b>Needs you</b></div>
      {children}
    </div>
  );
}

/** Tonight: the ONE attention row. It says the same number as the badge and names what is in it. Dismissed for the day. */
export function AttentionBanner({ items, today }: { items: AttentionItem[]; today: string; onAct?: (i: AttentionItem) => void }) {
  const sum = inboxSummary(items);
  const key = sum.n > 0 ? `growth.attn.dismissed.tonight.${sum.n}.${today}` : "";
  const [gone, setGone] = useState(true);
  // After Dismiss, an Undo line stays for 8 seconds.
  const [undo, setUndo] = useState(false);
  useEffect(() => { try { setGone(!!key && localStorage.getItem(key) === "1"); } catch { setGone(false); } }, [key]);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(false), 8000); return () => clearTimeout(t); }, [undo]);
  if (sum.n === 0) return null;
  if (gone) return undo ? (
    <div className="attn-banner-wrap">
      <p className="attn-undo" role="status">Dismissed for today. <button type="button" className="linkbtn" onClick={() => { try { localStorage.removeItem(key); } catch {} setGone(false); setUndo(false); }}>Undo</button></p>
    </div>
  ) : null;
  const top = items.find((i) => i.level === "now") ?? items.find((i) => i.level === "today");
  return (
    <div className="attn-banner-wrap">
      <div className={`attn-banner attn-${top?.level ?? "today"}`} role="status">
        <button type="button" className="attn-banner-main" aria-haspopup="dialog" onClick={() => { try { window.dispatchEvent(new Event("growth-needs")); } catch {} }}>
          <Marker level={top?.level ?? "today"} />
          <span className="attn-banner-t"><b>{sum.n} {sum.n === 1 ? "thing needs" : "things need"} you:</b> <span className="attn-banner-names">{sum.phrase}.</span></span>
          <ChevronRight className="attn-go" aria-hidden />
        </button>
        <button type="button" className="attn-banner-x" aria-label="Dismiss" title="Dismiss" onClick={() => { try { localStorage.setItem(key, "1"); } catch {} setGone(true); setUndo(true); }}><X aria-hidden /></button>
      </div>
    </div>
  );
}
