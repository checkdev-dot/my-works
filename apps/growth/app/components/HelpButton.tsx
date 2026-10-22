"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Question } from "./icons";
import { Sheet } from "./ui";
import { HELP_ABOUT, type AboutEntry } from "@/lib/help";
import { PAGE_COMMAND, howLines } from "@/lib/commands";
import { CmdChip } from "./CommandHint";

/** One small picture: where you do things, where you type a command, where you see the result. */
export function HowTheyFit({ caption = true }: { caption?: boolean }) {
  return (
    <figure className="fit">
      <ol className="fit-flow" aria-label="How the app and Claude Code fit together">
        <li className="fit-node"><b>Growth app</b><span>You do things</span></li>
        <li className="fit-link" aria-hidden><span>Hand-ins queue for Claude</span><ArrowRight /></li>
        <li className="fit-node"><b>Claude Code</b><span>Type a command</span></li>
        <li className="fit-link" aria-hidden><span>Writes back</span><ArrowRight /></li>
        <li className="fit-node"><b>Growth app</b><span>You see it</span></li>
      </ol>
      {caption && <figcaption>The app is where you do things. Claude Code is where you talk to Claude, by typing a command.</figcaption>}
    </figure>
  );
}

/** A page whose help depends on its state (Your CV) passes its own entry; `say` replaces the page's fixed phrase. */
export type StateAbout = AboutEntry & { say?: string };

function AboutBody({ id, about }: { id: string; about?: StateAbout }) {
  const a = about ?? HELP_ABOUT[id];
  if (!a) return null;
  const say = about?.say ?? (PAGE_COMMAND[id] ?? PAGE_COMMAND.companion).say;
  return (
    <div className="help-body">
      {!about && id !== "person-cloud" && a.diagram !== "fit" && (
        <ol className="help-how" aria-label="How this works">
          {howLines(id).map(([who, what]) => <li key={who}><b>{who}</b> {what}</li>)}
        </ol>
      )}
      {a.diagram === "fit" && <HowTheyFit caption={false} />}
      <ul className="help-lines">{a.lines.map((l) => <li key={l}>{l.split("{say}").flatMap((part, i, arr) => i < arr.length - 1 ? [part, <b key={i}>“{say}”</b>] : [part])}</li>)}</ul>
      {PAGE_COMMAND[id] && a.diagram !== "fit" && <p className="help-next"><b>What to say next</b> <CmdChip text={say} /> in Claude Code.</p>}
      {a.once && a.each && (
        <div className="help-oe">
          <div><h3>Once</h3><ol>{a.once.map((l) => <li key={l}>{l}</li>)}</ol></div>
          <div><h3>Each time</h3><ol>{a.each.map((l) => <li key={l}>{l}</li>)}</ol></div>
        </div>
      )}
      {a.recipe && (
        <dl className="door-recipe">
          <div><dt>Where</dt><dd>{a.recipe.where}</dd></div>
          <div><dt>Give it</dt><dd>{a.recipe.give}</dd></div>
          <div><dt>Then</dt><dd>{a.recipe.then}</dd></div>
          <div><dt>You&apos;ll see</dt><dd>{a.recipe.see}</dd></div>
        </dl>
      )}
    </div>
  );
}

/** A quiet "?" that opens what this page is for. It never opens by itself. */
export function HelpButton({ id, about }: { id: string; about?: StateAbout }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const [place, setPlace] = useState<{ up: boolean; max: number }>({ up: false, max: 520 });
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const uid = useId();
  const a = about ?? HELP_ABOUT[id];

  useEffect(() => {
    let mq: MediaQueryList | null = null;
    const apply = () => setPhone(!!mq?.matches);
    try { mq = window.matchMedia("(max-width: 720px), (max-height: 559px)"); apply(); mq.addEventListener("change", apply); } catch {}
    return () => { try { mq?.removeEventListener("change", apply); } catch {} };
  }, []);

  // Measure from the trigger: open below, or above when there is more room there, and never taller than what fits.
  const toggle = () => {
    if (!open) {
      try {
        const r = btn.current!.getBoundingClientRect();
        const below = window.innerHeight - r.bottom - 8 - 16;
        const above = r.top - 8 - 16;
        const up = below < 280 && above > below;
        setPlace({ up, max: Math.max(160, Math.min(520, up ? above : below)) });
      } catch {}
    }
    setOpen((o) => !o);
  };

  const close = () => { setOpen(false); btn.current?.focus(); };

  useEffect(() => {
    if (!open || phone) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || btn.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    pop.current?.focus({ preventScroll: true });
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open, phone]);

  if (!a) return null;
  return (
    <span className="help-wrap">
      <button ref={btn} type="button" className="help-btn" aria-label={id === "person-cloud" ? "About the word list" : a.title || "About this page"} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? uid : undefined} onClick={toggle}>
        <Question aria-hidden />
      </button>
      {open && !phone && (
        <div ref={pop} id={uid} className={`help-pop${place.up ? " help-pop-up" : ""}`} style={{ maxHeight: place.max }} role="dialog" aria-label={a.title} tabIndex={-1}>
          <p className="help-pop-h">{a.title}</p>
          <AboutBody id={id} about={about} />
          <button type="button" className="linkbtn help-close" onClick={close}>Close</button>
        </div>
      )}
      {open && phone && (
        <Sheet title={a.title} size="content" onClose={() => setOpen(false)}>
          <AboutBody id={id} about={about} />
        </Sheet>
      )}
    </span>
  );
}
