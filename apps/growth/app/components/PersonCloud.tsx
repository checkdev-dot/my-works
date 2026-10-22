"use client";

import { useRef, useState } from "react";
import { Check, Lock, PenTool, X } from "./icons";
import { Sheet } from "./ui";
import { HelpButton } from "./HelpButton";
import type { Action, GrowthState, PersonArea, PersonWord, PersonWordInput } from "@/lib/types";

type ActFn = (a: Action, ok?: string, undo?: string | Action) => Promise<boolean>;

/** Under this many words, Claude knows too little: the prompt to take the quick questions shows. */
const FEW = 8;

const SOURCE_PLAIN: Record<PersonWord["source"], string> = {
  you_said: "You told Claude",
  observed: "Claude noticed it",
  estimate: "Claude's guess",
};
const SOURCE_SR: Record<PersonWord["source"], string> = {
  you_said: "you said it",
  observed: "Claude noticed it",
  estimate: "Claude's guess",
};

/** The quick questions. Each chip saves one single word; the label is what he reads, the word is what is kept. */
const QUESTIONS: { id: string; q: string; area: PersonArea; weight: 1 | 2 | 3 | 4 | 5; max: number; why: string; chips: { label: string; word: string }[] }[] = [
  { id: "year", q: "What do you want from the next year?", area: "wants", weight: 4, max: 2, why: "You picked this as what you want from the next year.",
    chips: [{ label: "Better craft", word: "Craft" }, { label: "A senior role", word: "Senior-role" }, { label: "A new job", word: "New-job" }, { label: "Steadier confidence", word: "Confidence" }, { label: "Freelance", word: "Freelance" }, { label: "Leadership", word: "Leadership" }] },
  { id: "learn", q: "How do you learn best?", area: "learns", weight: 4, max: 2, why: "You said this is how you learn best.",
    chips: [{ label: "Reading", word: "Reading" }, { label: "Doing", word: "Doing" }, { label: "Watching", word: "Watching" }, { label: "Talking", word: "Talking" }] },
  { id: "way", q: "What gets in the way?", area: "worry", weight: 3, max: 2, why: "You said this gets in your way.",
    chips: [{ label: "Time", word: "Time" }, { label: "Doubt", word: "Doubt" }, { label: "Too many choices", word: "Choice-overload" }, { label: "No feedback", word: "No-feedback" }, { label: "Tired", word: "Tired" }] },
  { id: "energy", q: "What gives you energy?", area: "energy", weight: 4, max: 2, why: "You said this gives you energy.",
    chips: [{ label: "Making things", word: "Making" }, { label: "Solving hard problems", word: "Problem-solving" }, { label: "Teaching", word: "Teaching" }, { label: "Being right", word: "Being-right" }, { label: "Being seen", word: "Being-seen" }] },
  { id: "voice", q: "How do you want to be spoken to?", area: "voice", weight: 3, max: 1, why: "You said this is how you want to be spoken to.",
    chips: [{ label: "Calm and short", word: "Calm" }, { label: "Direct", word: "Direct" }, { label: "Warm", word: "Warm" }, { label: "Challenging", word: "Challenging" }] },
];

const oneWord = (t: string) => t.trim().replace(/\s+/g, "");

/** The source label already says who said it, so a stored "You told me ..." loses that prefix at render time. */
const whyText = (why?: string) => {
  const t = (why ?? "").trim().replace(/^you told me\s+(that\s+)?/i, "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
};

export function PersonCloud({ s, act, busy }: { s: GrowthState; act: ActFn; busy: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [test, setTest] = useState(false);
  const testBtn = useRef<HTMLButtonElement>(null);

  const all = s.profile.person?.words ?? [];
  const words = all
    .filter((w) => w.status !== "rejected")
    .sort((a, b) => b.weight - a.weight || a.word.localeCompare(b.word));
  const cur = words.find((w) => w.id === open) ?? null;

  const pick = (w: PersonWord) => {
    setOpen((o) => (o === w.id ? null : w.id));
    setEditing(false);
    setDraft(w.word);
    // On a short screen the detail opens below the fold: bring it into view without jumping.
    // Short heights: centre it so the sticky header never covers it.
    requestAnimationFrame(() => document.getElementById("cloud-detail")?.scrollIntoView({ block: window.innerHeight < 560 ? "center" : "nearest" }));
  };
  const confirm = async (w: PersonWord) => {
    if (await act({ type: "word.confirm", id: w.id }, "Noted. Claude will use that.", { type: "word.restore", word: w })) setOpen(null);
  };
  const reject = async (w: PersonWord) => {
    if (await act({ type: "word.reject", id: w.id }, "Removed. Claude won't add that word again.", { type: "word.restore", word: w })) setOpen(null);
  };
  const save = async (w: PersonWord) => {
    const next = oneWord(draft);
    if (!next || next === w.word) { setEditing(false); return; }
    if (await act({ type: "word.edit", id: w.id, word: next }, "Saved your word.", { type: "word.restore", word: w })) { setEditing(false); setOpen(null); }
  };

  return (
    <section className="cloud" aria-labelledby="cloud-h">
      <div className="cloud-head">
        <h2 id="cloud-h">About you</h2>
        <HelpButton id="person-cloud" />
      </div>
      {words.length > 0 && <p className="cloud-sub">{words.some((w) => w.status !== "confirmed")
        ? "These are Claude's best guesses. Tap a word to confirm, change or remove it. Only you see words marked private."
        : "You've confirmed these. Tap one to change or remove it. Only you see words marked private."}</p>}

      {words.length === 0 ? (
        <p className="cloud-empty">No words yet. A few quick questions give Claude something to start from.</p>
      ) : (
        <>
          <ul className="cloud-flow" aria-label="Words about you">
            {words.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  className={`cloud-w w${w.weight} ${w.status === "confirmed" ? "src-confirmed" : `src-${w.source}`}${w.status !== "confirmed" ? " is-proposed" : ""}${open === w.id ? " is-open" : ""}`}
                  aria-expanded={open === w.id}
                  aria-controls="cloud-detail"
                  onClick={() => pick(w)}
                >
                  {w.word}
                  {w.private && <Lock className="cloud-lock" aria-hidden />}
                  <span className="cloud-sr">, {w.status === "confirmed" ? "you confirmed it" : SOURCE_SR[w.source]}{w.status !== "confirmed" ? ", not confirmed" : ""}{w.private ? ", private" : ""}</span>
                </button>
              </li>
            ))}
          </ul>

          {cur && (
            <div className="cloud-detail" id="cloud-detail" role="group" aria-label={`About the word ${cur.word}`}>
              {editing ? (
                <div className="cloud-edit">
                  <label className="cloud-sr" htmlFor="cloud-edit-in">Change this word</label>
                  <input id="cloud-edit-in" className="cloud-input" maxLength={24} value={draft} autoFocus
                    onChange={(e) => setDraft(e.target.value.replace(/\s+/g, ""))}
                    onKeyDown={(e) => { if (e.key === "Enter") save(cur); }} />
                  <div className="cloud-acts">
                    <button type="button" className="btn btn-sm" disabled={busy || !draft.trim()} onClick={() => save(cur)}>Save</button>
                    <button type="button" className="btn btn-sm btn-quiet" onClick={() => setEditing(false)}>Cancel</button>
                    <span className="cloud-meta">One word, up to 24 letters</span>
                  </div>
                </div>
              ) : (
                <>
                  <p className="cloud-word">{cur.word}</p>
                  <p className="cloud-from"><b>{cur.status === "confirmed" ? "You confirmed it" : SOURCE_PLAIN[cur.source]}</b></p>
                  {(whyText(cur.why) || cur.status !== "confirmed") && (
                    <p className="cloud-why">
                      {whyText(cur.why)}
                      {cur.status !== "confirmed" ? `${whyText(cur.why) ? " " : ""}You haven't confirmed it yet.` : ""}
                    </p>
                  )}
                  {cur.private && <p className="cloud-meta"><Lock aria-hidden /> Private: stays on this computer.</p>}
                  <div className="cloud-acts">
                    {cur.status !== "confirmed" && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => confirm(cur)}><Check aria-hidden /> That&apos;s me</button>}
                    <button type="button" className="btn btn-sm btn-quiet" disabled={busy} onClick={() => reject(cur)}><X aria-hidden /> Not me</button>
                    <button type="button" className="btn btn-sm btn-quiet" disabled={busy} onClick={() => { setEditing(true); setDraft(cur.word); }}><PenTool aria-hidden /> Edit</button>
                  </div>
                </>
              )}
            </div>
          )}

          {words.every((w) => w.status === "confirmed") ? <p className="cloud-meta">Bigger words matter more to you. You confirmed all of them.</p> : <ul className="cloud-legend" aria-label="What the styles mean">
            <li><span className="cloud-key k-size" aria-hidden>A<span className="k-big">a</span></span> Bigger matters more</li>
            {words.some((w) => w.status === "confirmed") && <li><span className="cloud-key k-conf" aria-hidden>Aa</span> You confirmed it</li>}
            {words.some((w) => w.status !== "confirmed" && w.source === "you_said") && <li><span className="cloud-key k-you" aria-hidden>Aa</span> You said it</li>}
            {words.some((w) => w.status !== "confirmed" && w.source === "observed") && <li><span className="cloud-key k-obs" aria-hidden>Aa</span> Claude noticed it</li>}
            {words.some((w) => w.status !== "confirmed" && w.source === "estimate") && <li><span className="cloud-key k-est" aria-hidden>Aa</span> Claude&apos;s guess</li>}
            {words.some((w) => w.status !== "confirmed") && <li><span className="cloud-key k-new" aria-hidden>Aa</span> Not confirmed yet</li>}
          </ul>}
        </>
      )}

      <div className="cloud-foot">
        {words.length < FEW && words.length > 0 && <p className="cloud-meta">Claude knows only a few words about you.</p>}
        <button ref={testBtn} type="button" className="btn" onClick={() => setTest(true)}>{words.length > 0 && words.every((w) => w.status === "confirmed") ? "Add more about you" : "Help Claude know you better"}</button>
      </div>

      {test && <AboutTest title={words.length > 0 && words.every((w) => w.status === "confirmed") ? "Add more about you" : undefined} act={act} busy={busy} onClose={() => { setTest(false); requestAnimationFrame(() => testBtn.current?.focus()); }} />}
    </section>
  );
}

function AboutTest({ act, busy, onClose, title = "Help Claude know you better" }: { act: ActFn; busy: boolean; onClose: () => void; title?: string }) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [free, setFree] = useState("");
  const freeWord = oneWord(free);
  const dirty = Object.values(picked).some((v) => v.length > 0) || !!freeWord;

  const toggle = (qid: string, word: string, max: number) =>
    setPicked((p) => {
      const cur = p[qid] ?? [];
      if (cur.includes(word)) return { ...p, [qid]: cur.filter((x) => x !== word) };
      // At the limit a new pick replaces the oldest one, so a tap is never ignored.
      return { ...p, [qid]: [...cur, word].slice(-max) };
    });

  const save = async () => {
    const words: PersonWordInput[] = [];
    for (const q of QUESTIONS) {
      for (const w of picked[q.id] ?? []) {
        words.push({ word: w, area: q.area, weight: q.weight, source: "you_said", why: q.why, ...(q.area === "worry" ? { private: true } : {}) });
      }
    }
    if (freeWord) words.push({ word: freeWord, area: "works", weight: 5, source: "you_said", why: "You described yourself with this word." });
    if (!words.length) return;
    if (await act({ type: "word.set", words }, "Saved. These now shape what Claude suggests.")) onClose();
  };

  return (
    <Sheet title={title} onClose={onClose} dirty={dirty} discardText="Your answers">
      <p className="cloud-meta cloud-test-sub">Six quick questions. Every one is optional, and you can change any answer later.</p>
      {QUESTIONS.map((q) => (
        <fieldset key={q.id} className="cloud-q">
          <legend>{q.q}</legend>
          <p className="cloud-meta">{q.max > 1 ? `Pick up to ${q.max}.` : "Pick one."}</p>
          <div className="chips" role="group" aria-label={q.q}>
            {q.chips.map((c) => {
              const on = (picked[q.id] ?? []).includes(c.word);
              return (
                <button key={c.word} type="button" className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(q.id, c.word, q.max)}>
                  {c.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <label className="field cloud-q">
        <span>Describe yourself in one word</span>
        <input className="cloud-input" maxLength={24} value={free} placeholder="One word" onChange={(e) => setFree(e.target.value.replace(/\s+/g, ""))} />
      </label>
      <div className="sheet-actions">
        <button type="button" className="btn" disabled={busy || !dirty} onClick={save}>Save</button>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Skip for now</button>
      </div>
    </Sheet>
  );
}
