"use client";

import { useEffect, useState } from "react";
import type { Action, GrowthState, Trinket } from "@/lib/types";
import { ChevronRight } from "./icons";

type Act = (a: Action, ok?: string, undo?: string | Action) => Promise<boolean>;

const today = () => new Date().toLocaleDateString("en-CA");
const dayOfYear = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 864e5);
};

/** One small thought: the words, who from, the source it rests on, and what you can do with it. */
export function TrinketCard({ trinket: t, act, busy, compact }: { trinket: Trinket; act: Act; busy: boolean; compact?: boolean }) {
  const saved = t.status === "saved";
  return (
    <article className={`trinket${compact ? " trinket-compact" : ""}`} aria-label={`A small thought from ${t.who}`}>
      {!t.quoted && <p className="trinket-label">In plain words</p>}
      <blockquote className="trinket-line">{t.quoted ? `“${t.line}”` : t.line}</blockquote>
      <p className="trinket-who">{t.who}</p>
      {t.try && <p className="trinket-try"><span className="muted">Try today:</span> {t.try}</p>}
      {!compact && (t.source.excerpt || t.source.found_at) && (
        <details className="trinket-from">
          <summary>From the source</summary>
          {t.source.excerpt && <p className="trinket-excerpt">{t.source.excerpt}</p>}
          {t.source.found_at && <p className="trinket-found muted">Found at {t.source.found_at}</p>}
        </details>
      )}
      <p className="trinket-foot">
        <a className="trinket-src" href={t.source.url} target="_blank" rel="noreferrer">Source: {t.source.title}</a>
        {!compact && (
          <span className="trinket-acts">
            <button type="button" className="trinket-btn" disabled={busy} aria-pressed={saved} aria-label={`${saved ? "Saved" : "Save"}: ${t.source.title}`} onClick={() => act({ type: "trinket.set", id: t.id, status: saved ? "new" : "saved" })}>{saved ? "Saved" : "Save"}</button>
            <button type="button" className="trinket-btn" disabled={busy} aria-label={`Not for me: ${t.source.title}`} onClick={() => act({ type: "trinket.set", id: t.id, status: "hidden" })}>Not for me</button>
          </span>
        )}
      </p>
    </article>
  );
}

/** A quiet shelf on the Library: saved thoughts first, then this week's new ones. Nothing when there are none. */
export function TrinketShelf({ s, act, busy }: { s: GrowthState; act: Act; busy: boolean }) {
  const all = s.library.trinkets ?? [];
  const wk = s.week.week_of;
  const list = [
    ...all.filter((t) => t.status === "saved"),
    ...all.filter((t) => t.status === "new" && t.week_of === wk),
  ].slice(0, 4);
  if (!list.length) return null;
  return (
    <details className="trinket-shelf fold att-4" aria-labelledby="trinkets-h">
      <summary><ChevronRight className="chev" aria-hidden /> <span><b id="trinkets-h">Small thoughts ({list.length})</b><span className="muted">Short things from designers. Each one links to where it came from.</span></span></summary>
      <ul className="trinket-grid">{list.map((t) => <li key={t.id}><TrinketCard trinket={t} act={act} busy={busy} /></li>)}</ul>
    </details>
  );
}

/** Tonight's closing moment: one thought, the same one all day. Nothing when there are none. */
export function TonightTrinket({ s, act, busy }: { s: GrowthState; act: Act; busy: boolean }) {
  const pool = (s.library.trinkets ?? []).filter((t) => t.status === "new" || t.status === "saved");
  const [id, setId] = useState<string | null>(null);
  const key = pool.map((t) => t.id).join("|");
  useEffect(() => {
    if (!pool.length) { setId(null); return; }
    const k = `growth.trinket.${today()}`;
    let kept: string | null = null;
    try { kept = localStorage.getItem(k); } catch {}
    if (kept && pool.some((t) => t.id === kept)) { setId(kept); return; }
    const pick = pool[dayOfYear(today()) % pool.length];
    try { localStorage.setItem(k, pick.id); } catch {}
    setId(pick.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const t = (s.library.trinkets ?? []).find((x) => x.id === id && x.status !== "hidden");
  if (!t) return null;
  return <TrinketCard trinket={t} act={act} busy={busy} compact />;
}
