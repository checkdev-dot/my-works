"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, Info } from "./icons";
import { PAGE_COMMAND, commandInfo } from "@/lib/commands";

export type HintContext = "today" | "task" | "skill" | "cv" | "portfolio" | "library" | "journal" | "you";

/** Opens the Commands page. App listens for this, so a hint inside any sheet can reach it. */
export const openCompanion = () => { try { window.dispatchEvent(new CustomEvent("growth-companion")); } catch {} };

/** What to type in Claude Code for each place. Slash commands and plain words both work; these are the exact phrases. */
const PHRASE: Record<HintContext, string> = {
  today: PAGE_COMMAND.today.say, // while something is queued the Tonight strip says "answer it" instead
  task: "I’m stuck on this one",
  skill: PAGE_COMMAND.skill.say,
  cv: PAGE_COMMAND.reach.say,
  portfolio: PAGE_COMMAND.reach.say,
  library: PAGE_COMMAND.library.say,
  journal: PAGE_COMMAND.journal.say,
  you: PAGE_COMMAND.you.say,
};

/** A command as a copyable chip: the exact text, and a 44px copy target. Used by the page strips and the Commands page. */
export function CmdChip({ text, className, label, info }: { text: string; className?: string; /** Accessible name when the same command shows twice on a page. */ label?: string; /** Adds an "i" button that says what the command does and where the answer shows. */ info?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [tip, setTip] = useState(false);
  const tipId = useId();
  const infoBtn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const about = info ? commandInfo(text) : null;
  // The "how to use it" line shows only the first time, per browser.
  const [seenHow, setSeenHow] = useState(true);
  useEffect(() => {
    if (!tip) { setSeenHow(true); return; }
    try { if (localStorage.getItem("growth.cmdhow") !== "1") { setSeenHow(false); localStorage.setItem("growth.cmdhow", "1"); } } catch { setSeenHow(false); }
  }, [tip]);
  const tipEl = useRef<HTMLSpanElement>(null);
  const [place, setPlace] = useState<{ up: boolean; end: boolean }>({ up: false, end: false });
  // Open downward and left-aligned; flip up or to the right edge when the card would leave the window.
  useLayoutEffect(() => {
    if (!tip || !tipEl.current || !box.current) return;
    const t = tipEl.current.getBoundingClientRect(), b = box.current.getBoundingClientRect();
    setPlace({ up: b.bottom + 6 + t.height > window.innerHeight && b.top - 6 - t.height > 0, end: b.left + t.width > window.innerWidth - 8 });
  }, [tip]);
  useEffect(() => {
    if (!tip) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setTip(false); infoBtn.current?.focus(); } };
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setTip(false); };
    document.addEventListener("keydown", key); document.addEventListener("mousedown", away);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", away); };
  }, [tip]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); }
  };
  return (
    <span ref={box} className={`cmd-chip${about ? " has-info" : ""}${className ? ` ${className}` : ""}`}>
      <code>{text}</code>
      <button type="button" className="cmd-copy" aria-label={label ?? `Copy: ${text}`} title={copied ? "Copied" : "Copy"} onClick={copy}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </button>
      <span className="cmd-ok" role="status">{copied ? "Copied" : ""}</span>
      {about && (
        <>
          <button type="button" ref={infoBtn} className="cmd-info" aria-label={`What this does: ${text}`} aria-expanded={tip} aria-controls={tipId} title="What this does" onClick={() => setTip((v) => !v)}><Info aria-hidden /></button>
          {tip && <span id={tipId} ref={tipEl} role="note" className={`cmd-tip${place.up ? " is-up" : ""}${place.end ? " is-end" : ""}`}>{about.rows.map((r) => <span key={r.label} className="cmd-tip-row"><span className="cmd-tip-l">{r.label}</span>{r.badge && <><span className={`cmd-often is-${r.badge}`}>{r.badge === "regular" ? "Regularly" : r.badge === "sometimes" ? "Sometimes" : "Rarely"}</span> </>}{r.text}{r.steps?.map((st) => <span key={st.s} className="cmd-step"><span className={`cmd-tag is-${st.t}`}>{st.t === "needed" ? "Needed" : "Optional"}</span> {st.s}</span>)}</span>)}{!seenHow && <span className="cmd-tip-how">Copy it, paste it into Claude Code, press Enter.</span>}</span>}
        </>
      )}
    </span>
  );
}

/** The one command strip on a page: "In Claude Code" and the exact thing to type for this place. */
export function CommandHint({ context, className, phrase, ask }: { /** The worry this answers, in the reader's voice ("Stuck on this task?"). Shown before the chip. */ ask?: string; context: HintContext; /** Accepted so old call sites still compile; ignored. */ only?: string[]; className?: string; /** The thing to type, when the page can name what is on screen ("I'm stuck on the usability test brief"). Beats the generic one. */ phrase?: string }) {
  const text = phrase ?? PHRASE[context];
  return (
    <div className={`cmd-strip${className ? ` ${className}` : ""}`}>
      <span className="cmd-strip-label">{ask ?? "In Claude Code"}</span>
      <CmdChip text={text} info />
    </div>
  );
}
