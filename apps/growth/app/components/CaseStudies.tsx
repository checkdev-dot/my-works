"use client";

import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { att } from "./ui";
import { CmdChip } from "./CommandHint";
import { Disclose, Marked, cvFactCount, needsIn } from "./CvPanel";
import { caseNeeds as caseSlots } from "@/lib/career-needs.mjs";
import { HelpButton, type StateAbout } from "./HelpButton";
import { HELP_ABOUT } from "@/lib/help";
import { PAGE_COMMAND } from "@/lib/commands";
import type { CareerData, CaseStudy } from "@/lib/types";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const hasText = (s?: string) => !!(s ?? "").replace(/\[NEEDS(?: REAL NUMBER)?:[^\]]*\]/g, "").trim();

/** Every fact still missing in a case, once each, from the engine's own list (lib/career-needs.mjs caseNeeds), so the count is the engine's count. In plain words. */
export type CaseNeed = { text: string; group: string; /** The slot inside the case ("beat 2", "decision 1 outcome", "team"). */ at: string };
const FIELD: Record<string, string> = { one_line: "Summary line", owned: "What you owned", team: "Team", audience: "Who it is for", hook: "Opening line", title: "Title", type: "Type" };
/** The part of the case a missing fact belongs to, as a group label ("What you owned", the part's name, "A decision you made"). */
function groupOf(c: CaseStudy, where: string): string {
  const rest = where.slice(c.id.length + 1);
  const b = /^beat (\d+)/.exec(rest);
  if (b) return c.beats?.[Number(b[1]) - 1]?.title || `Part ${b[1]}`;
  if (/^decision /.test(rest)) return "A decision you made";
  return FIELD[rest] ?? "This case";
}
export function caseNeeds(c: CaseStudy): CaseNeed[] {
  // The engine already counts a part with nothing written as one fact ("Not written yet"), so this only relabels.
  return caseSlots(c).map((n) => { const m = needsIn(n.text)[0]; return { text: m ? m.what : n.text.replace(/^\s*needs?:\s*/i, ""), group: groupOf(c, n.where), at: n.where.slice(c.id.length + 1) }; });
}
/** The one count line, the same unit everywhere. */
/** Case studies count questions, not facts: "facts" belongs to the CV. */
const left = (n: number) => plural(n, "question", "questions");
const missing = (n: number) => (n > 0 ? `${left(n)} left` : "Nothing missing");
/** The phrase names the case by its id (a short, plain word), so it matches the command; the ask beside it is a question, not the title again. */
const sayFor = (c: CaseStudy) => `write my case study on ${c.id}`;

/** "Ready" is only true when nothing is missing. */
const isReady = (c: CaseStudy, n: number) => c.status === "ready" && n === 0;
const statusOf = (c: CaseStudy, n: number): { label: string; cls: string } => {
  if (isReady(c, n)) return { label: "Ready", cls: " s-done" };
  if (c.status === "outline") return { label: "Outline", cls: "" };
  return { label: "Draft", cls: " s-draft" };
};

const sourceCount = (xs?: unknown[]) => (xs?.length ?? 0);

/** The start card names this many missing facts; the rest open with "+N more". */
const SHOWN = 3;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The missing facts of one closed case: three first, then "+N more". An open case lists them per part instead (see Still), so this list is hidden then. */
function NeedsList({ n }: { n: CaseNeed[] }) {
  const [all, setAll] = useState(false);
  return (
    <>
      <p className="case-need-h">{missing(n.length)}</p>
      <ul className="case-needs">{(all ? n : n.slice(0, SHOWN)).map((t, i) => <li key={i}>{cap(t.text)}{cap(t.text).toLowerCase() !== t.group.toLowerCase() && <span className="muted"> ({t.group})</span>}</li>)}</ul>
      {n.length > SHOWN && (
        <button type="button" className="linkbtn case-more-needs" aria-expanded={all} onClick={() => setAll((x) => !x)}>{all ? "Show fewer" : `+${n.length - SHOWN} more`}</button>
      )}
    </>
  );
}

/** The order of your career notes (the dossier's recommended order) is the rule: cases that are not ready come first, in that order; finished ones last. */
function orderedCases(cases: CaseStudy[]) {
  return cases
    .map((c, i) => { const n = caseNeeds(c); return { c, i, n, done: isReady(c, n.length) }; })
    .sort((a, b) => Number(a.done) - Number(b.done) || a.i - b.i);
}

/** The case that says "Start here". The Hiring hero's "Next" line reads this too, so the page names one case. */
export function startCase(career?: CareerData | null): CaseStudy | undefined {
  return orderedCases(career?.cases ?? []).find((r) => !r.done)?.c;
}

/** The text without its [NEEDS ...] markers: the "Still needed" lines under the part carry them. */
const plain = (s?: string) => (s ?? "").replace(/\[NEEDS(?: REAL NUMBER)?:[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
/** The marker under a part (a beat or a decision): one short link that scrolls to its question in the list at the top, which is the one to-do. No question text is repeated here. */
function Still({ n, qid }: { n: CaseNeed[]; /** The id of this part's first question in the list. */ qid: string | undefined }) {
  if (!n.length || !qid) return null;
  const go = (e: React.MouseEvent) => {
    const el = document.getElementById(qid);
    if (!el) return;
    e.preventDefault();
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  };
  return (
    <div className="case-still">
      <a href={`#${qid}`} className="case-need-btn" onClick={go}><mark className="need">{`Needs ${plural(n.length, "answer", "answers")}`}</mark></a>
    </div>
  );
}
/** A part's source count: the count lives in a title (hover), and only a part with no source says so out loud. */
const fromNotes = (xs?: unknown[]) => { const n = sourceCount(xs); return n ? { text: "", title: `Backed by ${plural(n, "note", "notes")}: how many quotes from your notes back this part up.` } : { text: "No source yet", title: "No quote from your notes backs this part up yet." }; };

/** A beat's prose, held to about two lines until asked for. */
function BeatText({ text }: { text: string }) {
  const [more, setMore] = useState(false);
  const long = text.length > 150;
  const id = useId();
  return (
    <>
      <p id={id} className={long && !more ? "case-clamp" : undefined}>{text}</p>
      {long && <button type="button" className="linkbtn case-readmore" aria-expanded={more} aria-controls={id} onClick={() => setMore((x) => !x)}>{more ? "Show less" : "Read more"}</button>}
    </>
  );
}
/** Two texts that say the same thing (one starts with the other), so the second is not shown again. */
const squash = (t?: string) => plain(t).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/s+/g, " ").trim();
const echoes = (a?: string, b?: string) => { const x = squash(a), y = squash(b); return x.length >= 15 && y.length >= 15 && (x === y || x.startsWith(y) || y.startsWith(x)); };
const partOf = (needs: CaseNeed[], kind: "beat" | "decision", i: number) => needs.filter((n) => n.at === `${kind} ${i + 1}` || n.at.startsWith(`${kind} ${i + 1} `));

function Open({ c, id, onClose, chip }: { c: CaseStudy; id: string; onClose: () => void; /** The command chip sits below the questions: here when open, on the card when closed. */ chip: boolean }) {
  const needs = caseNeeds(c);
  /** The id of a part's first question in the list, so its marker can scroll there. */
  const qidOf = (kind: "beat" | "decision", i: number) => { const at = needs.findIndex((n) => n.at === `${kind} ${i + 1}` || n.at.startsWith(`${kind} ${i + 1} `)); return at < 0 ? undefined : `${id}-q-${at}`; };
  const decisions = c.decisions ?? [];
  const beats = (c.beats ?? []).map((b, i) => ({ b, i }));
  const written = beats.filter(({ b }) => hasText(b.text));
  const bare = beats.filter(({ b }) => !hasText(b.text));
  const [showBare, setShowBare] = useState(false);
  const bareId = useId();
  // The Opening line shows once: here, unless the story's own first part already says it.
  const hookInStory = !!c.hook && !needsIn(c.hook).length && beats.some(({ b }) => echoes(c.hook, b.text));
  const beat = ({ b, i }: { b: (typeof beats)[number]["b"]; i: number }) => hasText(b.text) ? (
    <li key={i}>
      {b.title && <b title={fromNotes(b.sources).title}><Marked text={b.title} /></b>}
      {plain(b.text) && <BeatText text={plain(b.text)} />}
      <Still n={partOf(needs, "beat", i)} qid={qidOf("beat", i)} />
      {fromNotes(b.sources).text && <span className="muted case-src" title={fromNotes(b.sources).title}>{fromNotes(b.sources).text}</span>}
    </li>
  ) : (
    <li key={i}>
      <b>{b.title || "Untitled"}</b>
      <Still n={partOf(needs, "beat", i)} qid={qidOf("beat", i)} />
      {!partOf(needs, "beat", i).length && <span className="muted case-src">Not written yet</span>}
    </li>
  );
  return (
    <div className="case-open" id={id} role="region" aria-label={c.title} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <div className="case-open-head">
        {/* The card above already names the project, so the title is not repeated here. */}
        <div>
          {c.one_line && <p className="muted case-line"><Marked text={c.one_line} /></p>}
        </div>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>Close</button>
      </div>

      <p className="case-sum">{needs.length ? `${left(needs.length)} left` : "Nothing missing"}</p>
      {needs.length > 0 && (
        <ul className="case-needs" aria-label="Questions still to answer">
          {needs.map((t, i) => <li key={i} id={`${id}-q-${i}`} tabIndex={-1} className="case-q">{cap(t.text)}{cap(t.text).toLowerCase() !== t.group.toLowerCase() && <span className="muted"> ({t.group})</span>}</li>)}
        </ul>
      )}

      {chip && (
        <div className="case-open-foot">
          <span className="cv-ask">Ready to write this one?</span>
          <CmdChip text={sayFor(c)} label={`Copy: ${sayFor(c)}`} info />
        </div>
      )}

      {(c.owned || c.team || c.audience || (c.hook && !hookInStory)) && (
        <dl className="case-facts">
          {c.owned && <div><dt>What you owned</dt><dd><Marked text={c.owned} /></dd></div>}
          {c.team && <div><dt>Team</dt><dd><Marked text={c.team} /></dd></div>}
          {c.audience && <div><dt>Who it is for</dt><dd><Marked text={c.audience} /></dd></div>}
          {c.hook && !hookInStory && <div><dt>Opening line</dt><dd><Marked text={c.hook} /></dd></div>}
        </dl>
      )}

      {beats.length > 0 && (
        <>
          {written.length > 0 && (
            <div className="case-part">
              <h4 className="cv-label">The story</h4>
              <ol className="case-beats">{written.map(beat)}</ol>
            </div>
          )}
          {bare.length > 0 && (
            <div className="case-part">
              <button type="button" className="linkbtn case-more-needs" aria-expanded={showBare} aria-controls={showBare ? bareId : undefined} onClick={() => setShowBare((x) => !x)}>{showBare ? "Hide the parts to write" : `+${plural(bare.length, "part", "parts")} to write`}</button>
              {showBare && <div id={bareId} className="case-part">{written.length === 0 && <h4 className="cv-label">The story</h4>}<ol className="case-beats">{bare.map(beat)}</ol></div>}
            </div>
          )}
        </>
      )}

      {decisions.length > 0 && (
        <div className="case-part">
          <h4 className="cv-label">Decisions you made, and why</h4>
          <ol className="case-decisions">
            {decisions.map((d, i) => {
              const ctx = plain(d.context);
              const repeat = !!ctx && (echoes(ctx, c.hook) || beats.some(({ b }) => echoes(ctx, b.text)));
              return (
                <li key={i}>
                  <b title={fromNotes(d.sources).title}>{plain(d.decision) || "Decision"}</b>
                  <dl>
                    {ctx && !repeat && <div><dt>Context</dt><dd>{ctx}</dd></div>}
                    {!!d.options?.filter((o) => plain(o)).length && <div><dt>Options</dt><dd><ul>{d.options.filter((o) => plain(o)).map((o, j) => <li key={j}>{plain(o)}</li>)}</ul></dd></div>}
                    {plain(d.tradeoffs) && <div><dt>Trade-offs</dt><dd>{plain(d.tradeoffs)}</dd></div>}
                    {plain(d.outcome) && <div><dt>Outcome</dt><dd>{plain(d.outcome)}</dd></div>}
                  </dl>
                  <Still n={partOf(needs, "decision", i)} qid={qidOf("decision", i)} />
                  {fromNotes(d.sources).text && <span className="muted case-src" title={fromNotes(d.sources).title}>{fromNotes(d.sources).text}</span>}
                </li>
              );
            })}
          </ol>
        </div>
      )}

    </div>
  );
}

export function CaseStudies({ career }: { career?: CareerData | null; /** Kept so fixtures still compile; the card no longer shows help moments. */ force?: boolean }) {
  const cases = career?.cases ?? [];
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = orderedCases(cases);
  const start = rows.find((r) => !r.done);
  const rest = rows.filter((r) => r !== start);
  const restTotal = rest.reduce((t, r) => t + r.n.length, 0);
  const base = HELP_ABOUT.cases;
  const help: StateAbout | undefined = base ? { ...base, lines: [...base.lines.filter((l) => !/in Claude Code/i.test(l)), "Outline means a plan with little written. Draft means written, with facts still missing. Ready means nothing is missing."] } : undefined;

  const close = () => {
    const id = openId;
    setOpenId(null);
    if (id) requestAnimationFrame(() => document.getElementById(`case-card-${id}`)?.focus());
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Escape" && openId) { e.stopPropagation(); close(); } };

  return (
    <section className={att(2)} aria-labelledby="cases-h">
      <div className="page-title-row"><h2 id="cases-h" className="att-2-title">Your case studies</h2><HelpButton id="cases" about={help} /></div>
      {start && start.n.length > 0 && <p className="muted case-total">{left(start.n.length)} left in your first case study</p>}
      {cases.length === 0 ? (
        <div className="cv-act">
          <span className="cv-ask">Ready to write a case study?</span>
          <CmdChip text={PAGE_COMMAND.cases.say} info />
        </div>
      ) : (
        <div className="case-wrap" onKeyDown={onKey}>
          {start && (() => {
            const { c, n } = start;
            const on = c.id === openId;
            const st = statusOf(c, n.length);
            return (
              <div className="case-start">
                <div className="case-start-head">
                  <button type="button" id={`case-card-${c.id}`} className={`case-start-title${on ? " is-open" : ""}`} aria-label={`Open case study: ${c.title}`} aria-expanded={on} aria-controls={on ? `case-detail-${c.id}` : undefined} onClick={() => (on ? close() : setOpenId(c.id))}>
                    <ChevronRight className="case-chev" aria-hidden />
                    <b>{c.title}</b>
                  </button>
                  <span className="status-tag s-start">Start here</span>
                  <span className={`status-tag${st.cls}`}>{st.label}</span>
                </div>
                {rows.length >= 2 && <p className="muted case-why">Do this one first: your career notes recommend it.</p>}
                {!on && (n.length > 0 ? <NeedsList n={n} /> : <p className="muted case-need-h">{missing(0)}</p>)}
                {!on && (
                  <div className="cv-act">
                    <span className="cv-ask">Ready to write this one?</span>
                    <CmdChip text={sayFor(c)} label={`Copy: ${sayFor(c)}`} info />
                  </div>
                )}
                {on && <Open c={c} id={`case-detail-${c.id}`} onClose={close} chip />}
              </div>
            );
          })()}
          {rest.length > 0 && (() => {
            const list = (
              <ul className={`case-list${start ? "" : " case-ready"}`}>
                {rest.flatMap(({ c, n, i }) => {
                  const on = c.id === openId;
                  const st = statusOf(c, n.length);
                  const out = [
                    <li key={`${c.id}-${i}`}>
                      <button type="button" id={`case-card-${c.id}`} className={`case-row-btn${on ? " is-open" : ""}`} aria-label={`Open case study: ${c.title}`} aria-expanded={on} aria-controls={on ? `case-detail-${c.id}` : undefined} onClick={() => (on ? close() : setOpenId(c.id))}>
                        <span className="case-row-title"><ChevronRight className="case-chev" aria-hidden /><b>{c.title}</b></span>
                        <span className="case-row-end">{!on && <span className="muted case-row-need">{missing(n.length)}</span>}<span className={`status-tag${st.cls}`}>{st.label}</span></span>
                      </button>
                    </li>,
                  ];
                  if (on) out.push(<li key={`detail-${c.id}-${i}`} className="case-detail"><Open key={c.id} c={c} id={`case-detail-${c.id}`} onClose={close} chip /></li>);
                  return out;
                })}
              </ul>
            );
            // With nothing left to start, the finished cases are the section: say how many, and keep each one a click away.
            if (!start) return <><p className="case-need-h">{rest.length} ready</p>{list}</>;
            return <Disclose className="case-more" summary={`${plural(rest.length, "more case study", "more case studies")}${restTotal > 0 ? `, ${left(restTotal)}` : ""}`}>{list}</Disclose>;
          })()}
        </div>
      )}
    </section>
  );
}

/** The one clause under the CV and portfolio score on Hiring, so the number is explained: what is missing from the CV and from the case studies. Empty when there is nothing to say. */
export function standLine(career?: CareerData | null): string {
  const bits: string[] = [];
  const f = cvFactCount(career);
  if (f !== null) bits.push(`CV: ${f > 0 ? `${plural(f, "fact", "facts")} away.` : "nothing missing."}`);
  const cs = career?.cases ?? [];
  if (cs.length) { const q = cs.reduce((t, c) => t + caseNeeds(c).length, 0); bits.push(`Case studies: ${q > 0 ? plural(q, "question", "questions") + "." : "nothing missing."}`); }
  return bits.join(" ");
}
