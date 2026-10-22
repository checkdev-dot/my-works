"use client";

import { X } from "./icons";
import { CmdChip } from "./CommandHint";
import { useEffect, useRef, useState } from "react";

/**
 * Side sheet. When `dirty`, closing (Esc, overlay, ×) first asks in-place instead of losing the text.
 */
export function Sheet({ title, sub, onClose, dirty, discardText = "What you wrote", size, children }: { title: string; sub?: React.ReactNode; onClose: () => void; dirty?: boolean; discardText?: string; /** "content": on a phone, a bottom sheet sized to its content instead of full screen. */ size?: "content"; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [asking, setAsking] = useState(false);
  const opener = useRef<HTMLElement | null>(typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null);
  // Hold the latest values so a re-render never re-runs the open/close effect (and never steals focus mid-typing).
  const latest = useRef({ onClose, dirty });
  latest.current = { onClose, dirty };
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Play a short exit, then hand over to the parent. The sheet stays mounted (and the page inert) until then,
  // so focus returns exactly as before once it unmounts.
  const mutedRef = useRef<Element[]>([]);
  const finish = useRef(() => {
    if (leaveTimer.current) return;
    const calm = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm) { latest.current.onClose(); return; }
    // Release the page at the start of the exit so a click during or just after the animation is never blocked.
    mutedRef.current.forEach((el) => el.removeAttribute("inert"));
    mutedRef.current = [];
    document.body.style.overflow = "";
    setLeaving(true);
    leaveTimer.current = setTimeout(() => latest.current.onClose(), 180);
  });
  const requestClose = useRef(() => {
    if (latest.current.dirty) setAsking(true);
    else finish.current();
  });
  const bodyRef = useRef<HTMLDivElement>(null);
  // A sheet always opens at its top, including when one sheet replaces another (the title changes).
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; if (ref.current) ref.current.scrollTop = 0; }, [title]);
  useEffect(() => {
    // The opener was captured during render, before any autoFocus inside the sheet could move focus.
    const prev = opener.current;
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && requestClose.current();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    // Keep focus and the screen reader inside the sheet: everything else in the app goes inert while it is open.
    const host = ref.current?.parentElement;
    const muted = mutedRef.current;
    if (host) for (const el of Array.from(host.children)) {
      if (el === ref.current || el.classList.contains("overlay") || el.classList.contains("sheet") || el.hasAttribute("inert")) continue;
      el.setAttribute("inert", "");
      muted.push(el);
    }
    return () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      mutedRef.current.forEach((el) => el.removeAttribute("inert"));
      mutedRef.current = [];
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (prev && prev !== document.body && prev.isConnected) prev.focus();
      else (document.querySelector(".att-1 .att-title") as HTMLElement | null ?? document.querySelector("h1") as HTMLElement | null)?.focus();
    };
  }, []);
  return (
    <>
      <div className={`overlay${leaving ? " is-closing" : ""}`} onClick={() => requestClose.current()} />
      <div className={`sheet${size === "content" ? " sheet-content" : ""}${leaving ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="sheet-head">
          <div>
            <h2 title={title}>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button className="btn btn-quiet btn-sm sheet-close" onClick={() => requestClose.current()} aria-label="Close">
            <X />
          </button>
        </div>
        {asking && (
          <div className="discard" role="alertdialog" aria-label="Discard changes?">
            <p>{discardText} will be lost.</p>
            <button className="btn btn-sm" autoFocus onClick={() => setAsking(false)}>Keep going</button>
            <button className="btn btn-quiet btn-sm" onClick={() => finish.current()}>Discard</button>
          </div>
        )}
        <div className="sheet-body" ref={bodyRef}>{children}</div>
      </div>
    </>
  );
}

/* ===== Attention system. One definition of each tier lives in notion.css (@@att). ===== */
export type Tier = 1 | 2 | 3 | 4;
/** The class string for a tier. Tier is derived from page state by the caller, never authored on a component. */
export function att(tier: Tier, quiet?: boolean): string {
  return tier === 1 && quiet ? "att-1 is-quiet" : `att-${tier}`;
}

/**
 * The one T1 on a page. Filled accent surface (or the quiet variant when nothing is urgent).
 * `act` is the row of actions; the one primary in it gets the inverted look from CSS.
 */
export function Hero({ quiet, eyebrow, icon, title, children, act, foot, label, cmds }: { /** Up to 3 commands for this card, each labelled with the worry it answers. */ cmds?: { ask: string; say: string }[]; quiet?: boolean; eyebrow?: React.ReactNode; /** A 16px glyph from ./icons that names the kind. Decorative: the eyebrow text already says it. */ icon?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode; act?: React.ReactNode; /** One muted line under the actions. */ foot?: React.ReactNode; label?: string }) {
  return (
    <section className={att(1, quiet)} aria-label={label}>
      {eyebrow && (icon
        ? <p className="att-eyebrow has-ic"><span className="att-eyebrow-ic" aria-hidden="true">{icon}</span><span>{eyebrow}</span></p>
        : <p className="att-eyebrow">{eyebrow}</p>)}
      <h2 className="att-title" tabIndex={-1}>{title}</h2>
      {children}
      {act && <div className="att-act-row">{act}</div>}
      {cmds && cmds.length > 0 && (
        <div className="hero-cmds">
          <span className="hero-cmds-h">In Claude Code</span>
          {cmds.filter((c, k) => cmds.findIndex((x) => x.say === c.say) === k).map((c) => (
            <span key={c.say} className="hero-cmd"><span className="hero-cmd-l">{c.ask}</span><CmdChip text={c.say} info /></span>
          ))}
        </div>
      )}
      {foot && <div className="att-foot">{foot}</div>}
    </section>
  );
}

/** What the hero is before the page's data is read: the same rule and height, a muted title bar. Rendered on the server too, so there is never a blank screen. */
export function HeroSkeleton() {
  return (
    <section className="att-1 is-quiet att-skel" aria-busy="true" aria-label="Loading">
      <span className="att-skel-bar" aria-hidden />
    </section>
  );
}

export const SOURCE_LABEL: Record<string, string> = {
  market: "market result",
  expert: "senior designer",
  shipped: "shipped work",
  ai: "Claude's assessment",
  self: "you",
  note: "note",
};

export function fmtDate(d: string) {
  const range = /^(\d{4})\s*[-–—]\s*(\d{4})$/.exec(d);
  if (range) return `${range[1]} to ${range[2]}`;
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(d)) return d;
  const [y, m, day] = d.split("-").map(Number);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return day ? `${day} ${mon} ${y}` : `${mon} ${y}`;
}
