"use client";

import { useEffect, useState } from "react";

interface ScaleProps {
  min: number;
  max: number;
  /** null = nothing measured yet: the window shows no needle. */
  value: number | null;
  target?: number;
  ghosts?: number[];
  majors: number[];
  minors?: number[];
  labels?: (v: number) => string;
  hollow?: boolean;
  compact?: boolean;
  label: string;
}

const seenKey = (label: string) => `growth.seen.${label.split(":")[0]}`;

/** The T3 tuning strip: a recessed window, ticks and printed legends, a hairline needle at the current reading, a target mark, faint needles for past readings. */
export function Scale({ min, max, value, target, ghosts = [], majors, minors = [], labels, hollow, compact, label }: ScaleProps) {
  const pos = (v: number) => `${((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100}%`;
  // First paint shows the true reading. If the needle stood somewhere else when the person last looked,
  // jump it back there and let it glide to now: the one moment where evidence visibly moves the needle.
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (value === null) return;
    let last: number | null = null;
    try {
      const raw = localStorage.getItem(seenKey(label));
      last = raw === null ? null : Number(raw);
      localStorage.setItem(seenKey(label), String(value));
    } catch {}
    if (last === null || Number.isNaN(last) || last === value) {
      setShown(value);
      return;
    }
    setShown(last);
    const t = setTimeout(() => setShown(value), 120);
    return () => clearTimeout(t);
  }, [value, label]);

  return (
    <div className={`scale${compact ? " compact" : ""}`} role="meter" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value ?? undefined}>
      <div className="scale-window"><div className="scale-inner">
        <div className="scale-track" />
        {minors.map((m) => <div key={`m${m}`} className="scale-tick minor" style={{ left: pos(m) }} />)}
        {majors.map((m) => <div key={`M${m}`} className="scale-tick" style={{ left: pos(m) }} />)}
        {ghosts.filter((g) => g !== value).map((g, i) => <div key={`g${i}`} className="scale-ghost" style={{ left: pos(g) }} />)}
        {target !== undefined && <div className="scale-target" style={{ left: pos(target) }} title={`Target ${labels ? labels(target) : target}`} />}
        {shown !== null && <div className={`scale-needle${hollow ? " hollow" : ""}`} style={{ left: pos(shown) }} />}
      </div></div>
      <div className="scale-legend" aria-hidden>
        {majors.map((m) => (
          <span key={`L${m}`} style={{ left: pos(m), transform: m === min ? "none" : m === max ? "translateX(-100%)" : undefined }}>{labels ? labels(m) : m}</span>
        ))}
      </div>
    </div>
  );
}

/** Outlined needle = the reading isn't backed by outside evidence yet (your own rating or Claude's assessment), or confidence is low. */
export function SkillScale({ level, target, history, confidence, source, compact, name }: { level: number; target?: number; history: { level: number }[]; confidence: number; source?: string; compact?: boolean; name: string }) {
  const unverified = confidence < 0.5 || source === "self" || source === "ai";
  return (
    <Scale
      min={1}
      max={4}
      value={level}
      target={target}
      ghosts={history.slice(0, -1).map((h) => h.level)}
      majors={[1, 2, 3, 4]}
      minors={[1.5, 2.5, 3.5]}
      labels={(v) => ["", "Junior", "Mid", "Senior", "Lead"][v] ?? String(v)}
      hollow={unverified}
      compact={compact}
      label={`${name}: level ${level} of 4`}
    />
  );
}
