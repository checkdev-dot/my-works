"use client";

import { useState } from "react";
import { Check, ChevronRight, Lock, PenTool, X } from "./icons";
import { fmtDate } from "./ui";
import { PersonCloud } from "./PersonCloud";
import type { Action, GrowthState, PersonArea, PersonItem } from "@/lib/types";

type ActFn = (a: Action, ok?: string, undo?: string | Action) => Promise<boolean>;

const AREA_ORDER: PersonArea[] = ["learns", "works", "energy", "worry", "wants", "limits", "voice"];
const AREA_LABEL: Record<PersonArea, string> = {
  learns: "How you learn",
  works: "How you work",
  energy: "What gives you energy",
  worry: "What you've said worries you",
  wants: "What you want",
  limits: "Your limits",
  voice: "How you sound",
};
const SOURCE_LABEL: Record<PersonItem["source"], string> = {
  you_said: "You said",
  observed: "Seen in your work",
  estimate: "Claude's estimate",
};

const DOMINANT_TEXT: Record<PersonItem["source"], string> = {
  estimate: "Claude's estimates",
  you_said: "Mostly things you said",
  observed: "Mostly seen in your work",
};

const MAX_MAIN = 6;
const MAX_PROPOSED = 3;

/** What an evidence id points at, in words the person would use. Falls back to the id itself. */
function evidenceLabel(s: GrowthState, id: string): string {
  // Shorten on a word boundary so a label never ends mid-word.
  const clip = (t: string, n = 90) => {
    if (t.length <= n) return t;
    const cut = t.slice(0, n);
    const sp = cut.lastIndexOf(" ");
    return `${(sp > n * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-]+$/, "")}…`;
  };
  const e = s.evidence?.entries?.find((x) => x.id === id);
  if (e) return clip(e.title);
  const p = s.library?.picks?.find((x) => x.id === id);
  if (p) return `Library: ${clip(p.title, 60)}`;
  const q = s.profile.intake?.find((x) => x.id === id);
  if (q) return `Your answer to: ${clip(q.q, 56)}`;
  const t = s.week?.tasks?.find((x) => x.id === id);
  if (t) return `Task: ${clip(t.task, 60)}`;
  return id;
}

/** The "About you" area: the word cloud first, then the sentences. */
export function PersonCard({ s, act, busy }: { s: GrowthState; act: ActFn; busy: boolean }) {
  return (
    <>
      <PersonCloud s={s} act={act} busy={busy} />
      <PersonSentences s={s} act={act} busy={busy} />
    </>
  );
}

function PersonSentences({ s, act, busy }: { s: GrowthState; act: ActFn; busy: boolean }) {
  const [hidePrivate, setHidePrivate] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [forgetStep, setForgetStep] = useState<0 | 1>(0);
  const [allMain, setAllMain] = useState(false);
  const [allProposed, setAllProposed] = useState(false);

  const person = s.profile.person;
  const all = (person?.items ?? []).filter((i) => i.status === "confirmed" || i.status === "proposed");
  const privateN = all.filter((i) => i.private).length;
  const shown = hidePrivate ? all.filter((i) => !i.private) : all;
  const confirmedAll = all.filter((i) => i.status === "confirmed").length;

  if (all.length === 0) {
    return (
      <section className="person person-empty" aria-labelledby="person-h">
        <h2 id="person-h" tabIndex={-1}>You, in your own words</h2>
        <p>Say &ldquo;get to know me&rdquo; in Claude Code. Claude writes down a few things it has noticed, and you fix them.</p>
      </section>
    );
  }

  const byArea = (a: PersonItem, b: PersonItem) => AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area);
  const mainAll = shown.filter((i) => i.status === "confirmed").sort(byArea);
  const proposedAll = shown.filter((i) => i.status === "proposed");
  const main = allMain ? mainAll : mainAll.slice(0, MAX_MAIN);
  const proposed = allProposed ? proposedAll : proposedAll.slice(0, MAX_PROPOSED);
  const hiddenPrivateConfirmed = confirmedAll - mainAll.length;
  const countText = `${main.length} confirmed${mainAll.length > main.length ? `, ${mainAll.length - main.length} more` : ""}${hiddenPrivateConfirmed > 0 ? `, ${hiddenPrivateConfirmed} hidden` : ""}`;
  const reviewed = person?.reviewed ? fmtDate(person.reviewed.slice(0, 10)) : "";
  // Provenance once, as one line. A row says where it comes from only when it differs from the rest.
  const tally = all.reduce<Record<string, number>>((m, i) => { m[i.source] = (m[i.source] ?? 0) + 1; return m; }, {});
  const dominant = (Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] ?? "estimate") as PersonItem["source"];
  const sourcedN = all.filter((i) => (i.evidence ?? []).length > 0).length;
  const summary = `${DOMINANT_TEXT[dominant]}, ${sourcedN === 0 ? "none sourced yet" : `${sourcedN} of ${all.length} sourced`}. ${confirmedAll} of ${all.length} confirmed with you.`;

  const setStatus = (i: PersonItem, status: "confirmed" | "rejected") =>
    act({ type: "person.set", id: i.id, status }, status === "confirmed" ? "Noted. Claude will use that." : "Removed. Claude won't guess that again.", { type: "person.set", id: i.id, status: i.status });
  const startEdit = (i: PersonItem) => { setEditing(i.id); setDraft(i.text); };
  const saveEdit = async (i: PersonItem) => {
    const text = draft.trim();
    if (!text || text === i.text) { setEditing(null); return; }
    if (await act({ type: "person.edit", id: i.id, text }, "Saved your wording.", { type: "person.edit", id: i.id, text: i.text })) setEditing(null);
  };

  const row = (i: PersonItem) => {
    const quiet = i.status === "proposed";
    const isEditing = editing === i.id;
    const evid = i.evidence ?? [];
    return (
      <li key={i.id} className={`person-item${quiet ? " is-proposed" : ""}`}>
        {isEditing ? (
          <div className="person-edit">
            <label className="person-sr" htmlFor={`pe-${i.id}`}>Change this line</label>
            <textarea id={`pe-${i.id}`} className="person-textarea" rows={2} maxLength={140} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            <div className="person-acts">
              <button type="button" className="btn btn-sm" disabled={busy || !draft.trim()} onClick={() => saveEdit(i)}>Save</button>
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => setEditing(null)}>Cancel</button>
              <span className="person-count">{draft.length} of 140</span>
            </div>
          </div>
        ) : (
          <>
            <p className="person-text">{i.text}</p>
            {(i.source !== dominant || i.private) && (
              <p className="person-meta">
                {i.source !== dominant && <span>{SOURCE_LABEL[i.source]}</span>}
                {i.private && <span className="person-lock"><Lock aria-hidden /> Private: kept out of packs and skill files. Claude still reads it in Claude Code.</span>}
              </p>
            )}
            <div className="person-acts">
              {quiet && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setStatus(i, "confirmed")}><Check aria-hidden /> Right</button>}
              <button type="button" className="btn btn-sm btn-quiet" disabled={busy} onClick={() => setStatus(i, "rejected")}><X aria-hidden /> {i.source === "you_said" ? "Remove" : "Not me"}</button>
              <button type="button" className="btn btn-sm btn-quiet" disabled={busy} onClick={() => startEdit(i)}><PenTool aria-hidden /> Edit</button>
            </div>
            {(i.why || evid.length > 0) && (
              <details className="person-why" open={quiet}>
                <summary>Why I think that</summary>
                {i.why && <p>{i.why}</p>}
                {evid.length > 0 && (
                  <ul>{evid.map((id) => <li key={id}>{evidenceLabel(s, id)}</li>)}</ul>
                )}
              </details>
            )}
          </>
        )}
      </li>
    );
  };

  let lastArea: PersonArea | null = null;
  return (
    <section className="person" aria-labelledby="person-h">
      <div className="person-head">
        <div>
          <h2 id="person-h" tabIndex={-1}>You, in your own words</h2>
          <p className="person-sub">{summary} Fix anything that&apos;s wrong.</p>
          {reviewed && <p className="person-sub">Last looked at {reviewed}</p>}
        </div>
        <p className="person-confirmed">{countText}</p>
      </div>

      {person?.card && <p className="person-card">{person.card}</p>}

      {main.length > 0 && (
        <ul className="person-list">
          {main.map((i) => {
            const head = i.area !== lastArea;
            lastArea = i.area;
            return (
              <li key={i.id} className="person-group">
                {head && <h3 className="person-area">{AREA_LABEL[i.area]}</h3>}
                <ul className="person-list-inner">{row(i)}</ul>
              </li>
            );
          })}
        </ul>
      )}
      {mainAll.length > MAX_MAIN && (
        <button type="button" className="linkbtn person-more" aria-label={allMain ? "Show fewer of the things you confirmed" : `Show all ${mainAll.length} things you confirmed`} onClick={() => setAllMain((v) => !v)}>{allMain ? "Show fewer" : `Show all ${mainAll.length}`}</button>
      )}

      {proposed.length > 0 && (
        <div className="person-proposals" role="group" aria-label="Claude noticed">
          <h3 className="person-area">Claude noticed these. Are they right?</h3>
          <ul className="person-list-inner">{proposed.map(row)}</ul>
          {proposedAll.length > MAX_PROPOSED && (
            <button type="button" className="linkbtn person-more" aria-label={allProposed ? "Show fewer of the things Claude noticed" : `Show all ${proposedAll.length} things Claude noticed`} onClick={() => setAllProposed((v) => !v)}>{allProposed ? "Show fewer" : `Show all ${proposedAll.length}`}</button>
          )}
        </div>
      )}

      <details className="fold att-4 person-fold">
      <summary><ChevronRight className="chev" aria-hidden /> <span><b>Privacy and forgetting</b></span></summary>
      <div className="person-foot">
        <button type="button" role="switch" aria-checked={hidePrivate} className={`person-switch${hidePrivate ? " on" : ""}`} onClick={() => setHidePrivate((v) => !v)}>
          <span className="person-switch-track" aria-hidden><i /></span>
          <span>Hide private{privateN > 0 ? ` (${privateN})` : ""}</span>
        </button>
        {forgetStep === 0 ? (
          <button type="button" className="linkbtn person-forget" disabled={busy} onClick={() => setForgetStep(1)}>Forget all of this</button>
        ) : (
          <span className="person-confirm" role="alert">
            <span>This removes everything on this list, including what you told Claude isn't you, so it may come back. You can undo it for a few seconds.</span>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={async () => { if (await act({ type: "person.clear" }, "Forgotten. Claude starts fresh.", person ? { type: "person.restore", person } : undefined)) setForgetStep(0); }}>Yes, forget it</button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setForgetStep(0)}>Keep it</button>
          </span>
        )}
      </div>
      </details>
      {hidePrivate && privateN > 0 && shown.length === 0 && <p className="person-sub">Everything here is private, so it&apos;s hidden.</p>}
    </section>
  );
}
