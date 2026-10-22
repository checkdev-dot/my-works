"use client";

import { useEffect, useRef, useState } from "react";
import { HELP_BY_ID, HELP_PREFIX, PHONE_LINE } from "@/lib/help";

/* One help moment on screen at a time. Sheets outrank the page under them; otherwise first come, first shown. */
type Slot = { id: string; layer: number; seq: number };
const slots: Slot[] = [];
const listeners = new Set<() => void>();
let seq = 0;
const winner = () => [...slots].sort((a, b) => b.layer - a.layer || a.seq - b.seq)[0]?.id ?? null;
const notify = () => listeners.forEach((f) => f());
function claim(id: string, layer: number) {
  const slot = { id, layer, seq: seq++ };
  slots.push(slot);
  notify();
  return () => { const i = slots.indexOf(slot); if (i >= 0) slots.splice(i, 1); notify(); };
}

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

/** Forget every remembered hint and recipe so they show again. Returns how many were cleared. */
export function resetHelp(): number {
  let n = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(HELP_PREFIX)) keys.push(k); }
    keys.forEach((k) => { localStorage.removeItem(k); n++; });
  } catch {}
  try { window.dispatchEvent(new CustomEvent("growth-help-reset")); } catch {}
  return n;
}

/** Whether a once-only thing was seen. Marks it seen when asked. Safe with storage blocked. */
export function seenHelp(id: string, mark = false): boolean {
  const k = `${HELP_PREFIX}${id}`;
  const was = read(k) !== null;
  if (mark && !was) write(k, "1");
  return was;
}

/**
 * One muted line with a small "Got it". Shows once per id, never alongside another, and on a phone says that
 * Claude needs a computer when it points at the companion chat.
 * `hold` keeps it away (Tonight, before the steps are done). `force` ignores what was remembered (fixtures).
 */
export function HelpMoment({ id, children, vars, hold, force, sheet, className }: {
  id: string;
  children?: React.ReactNode;
  vars?: Record<string, string | number>;
  hold?: boolean;
  force?: boolean;
  sheet?: boolean;
  className?: string;
}) {
  const entry = HELP_BY_ID[id];
  const [ready, setReady] = useState(false);
  const [phone, setPhone] = useState(false);
  const [gone, setGone] = useState(false);
  const [top, setTop] = useState<string | null>(null);

  useEffect(() => {
    let mq: MediaQueryList | null = null;
    const apply = () => setPhone(!!mq?.matches);
    try { mq = window.matchMedia("(max-width: 720px)"); apply(); mq.addEventListener("change", apply); } catch {}
    setGone(!force && read(`${HELP_PREFIX}${id}`) !== null);
    setReady(true);
    const again = () => setGone(false);
    window.addEventListener("growth-help-reset", again);
    return () => { try { mq?.removeEventListener("change", apply); } catch {} window.removeEventListener("growth-help-reset", again); };
  }, [id, force]);

  const applicable = !!entry && ready && !gone && !hold && (!entry.phoneOnly || phone);
  useEffect(() => {
    if (!applicable || force) return; // fixtures (force) show every moment, so they skip the one-at-a-time rule
    const sync = () => setTop(winner());
    listeners.add(sync);
    const release = claim(id, sheet ? 1 : 0);
    sync();
    return () => { listeners.delete(sync); release(); setTop(null); };
  }, [applicable, force, id, sheet]);

  if (!applicable || (!force && top !== id)) return null;
  let text: React.ReactNode;
  if (entry.needsComputer && phone) text = PHONE_LINE;
  else if (children) text = children;
  else text = entry.copy.replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? ""));
  return (
    <p className={`help-moment${className ? ` ${className}` : ""}`} role="note">
      <span>{text}</span>
      <button type="button" className="linkbtn help-got" onClick={() => { if (!force) write(`${HELP_PREFIX}${id}`, "1"); setGone(true); }}>Got it</button>
    </p>
  );
}

/**
 * First time: the recipe shows open. After that it folds to a quiet "How this works". The recipe itself is passed in,
 * so its wording stays in one place.
 */
export function RecipeOnce({ id, force, children }: { id: string; force?: boolean; children: React.ReactNode }) {
  const [first, setFirst] = useState<boolean | null>(null);
  const decided = useRef<boolean | null>(null); // survives the dev double-effect, so the first look isn't lost
  useEffect(() => {
    if (decided.current === null) {
      const was = !force && read(`${HELP_PREFIX}recipe-${id}`) !== null;
      decided.current = !was;
      if (!force && !was) write(`${HELP_PREFIX}recipe-${id}`, "1");
    }
    setFirst(decided.current);
  }, [id, force]);
  if (first === null) return null;
  if (first) return <>{children}</>;
  return (
    <details className="how-fold">
      <summary>How this works</summary>
      {children}
    </details>
  );
}
