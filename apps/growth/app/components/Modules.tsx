"use client";

import { CmdChip } from "./CommandHint";
import { ChevronRight } from "./icons";
import { HelpMoment } from "./HelpMoment";
import type { Ability, ImpactLine, ModuleInfo, ModuleResult } from "@/lib/types";

export type ModulesData = { installed: ModuleInfo[]; results: ModuleResult[]; primary?: Record<string, string>; retired?: string[] } | undefined;

/** What to say for a legacy skill file that has no abilities yet. */
const CAP_SAY: Record<string, string> = { cv: "look at my CV", linkedin: "analyse my LinkedIn", portfolio: "look at my portfolio", interview: "review my interview answers" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function modDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : iso;
}

/** The newest result for a module, or undefined. */
export function latestResult(data: ModulesData, id: string): ModuleResult | undefined {
  return (data?.results ?? []).filter((r) => r.module === id).sort((a, b) => b.date.localeCompare(a.date))[0];
}

function Ring({ score }: { score: number }) {
  const r = 20, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, score));
  return (
    <span className="mod-ring" role="img" aria-label={`${v} of 100`}>
      <svg viewBox="0 0 48 48" aria-hidden>
        <circle cx="24" cy="24" r={r} className="mod-ring-track" />
        <circle cx="24" cy="24" r={r} className="mod-ring-val" strokeDasharray={`${(c * v) / 100} ${c}`} transform="rotate(-90 24 24)" />
      </svg>
      <b>{v}</b>
    </span>
  );
}

function ResultBlock({ r, say }: { r: ModuleResult; say: string }) {
  return (
    <div className="mod-result">
      <div className="mod-score">
        {r.score !== null ? <Ring score={r.score} /> : null}
        <div className="mod-score-text">
          <p className="mod-score-name"><b>{r.score !== null ? (r.word ?? "Scored") : "Notes only"}</b>{r.status === "stale" && <span className="mod-chip">Stale</span>}</p>
          <p className="muted mod-score-sub"><span className="mod-date">{modDate(r.date)}</span>{r.subject && <span className="mod-subject" title={r.subject}>{r.subject}</span>}</p>
        </div>
      </div>
      {r.status === "stale" && (
        <p className="mod-stale">This changed since it was run. To read it again, say “{say}”.</p>
      )}
      <p className="mod-summary">{r.summary}</p>
      {r.fixes.length > 0 && (
        <div className="mod-block">
          <h4>What to change first</h4>
          <ol className="mod-fixes">
            {r.fixes.slice(0, 5).map((f, i) => (
              <li key={i}>
                <span className="mod-n" aria-hidden>{i + 1}</span>
                <span><b>{f.what}</b><span className="mod-why">{f.why}</span>{f.effort && <span className="mod-effort">Effort: {f.effort}</span>}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {r.strengths.length > 0 && (
        <div className="mod-block">
          <h4>What is working</h4>
          <ul className="mod-str">{r.strengths.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      <p className="mod-caveat">An AI read of this file. It isn&apos;t a market signal. This read doesn&apos;t change your numbers.</p>
    </div>
  );
}

/** The phrase that re-runs this skill file: its first enabled ability, else a legacy default. */
function sayFor(m: ModuleInfo): string {
  const a = (m.abilities ?? []).find((x) => x.enabled && x.say.length);
  return a?.say[0] ?? CAP_SAY[m.capability] ?? "look at my CV";
}

function AbilityRow({ a }: { a: Ability }) {
  return (
    <li className={`mod-ab${a.enabled ? "" : " off"}`}>
      <p className="mod-ab-h"><b>{a.label}</b>{!a.enabled && <span className="mod-chip">Switched off</span>}</p>
      {a.enabled
        ? <p className="mod-ab-say">Say: {a.say.map((p, i) => <span key={p}>{i > 0 ? " " : ""}<CmdChip text={p} /></span>)}</p>
        : <p className="mod-ab-say">To use it, say <CmdChip text={`switch on ${a.label}`} />.</p>}
      <p className="muted mod-ab-meta">Reads: {a.reads}. {a.gives === "score" ? "Gives a score." : "Gives notes."}</p>
    </li>
  );
}

function ImpactList({ title, lines }: { title: string; lines: ImpactLine[] }) {
  if (!lines.length) return null;
  return (
    <div className="mod-block">
      <h4>{title}</h4>
      <ul className="mod-why-list">
        {lines.map((l, i) => <li key={i}><span>{l.text}</span><span className="mod-why">{l.why}</span></li>)}
      </ul>
    </div>
  );
}

function WhyThisOne({ m }: { m: ModuleInfo }) {
  const im = m.impact;
  if (!im) return null;
  return (
    <details className="fold mod-fold">
      <summary><ChevronRight className="chev" aria-hidden /> <span><b>Why this one</b></span></summary>
      <div className="mod-why-body">
        <p className="muted mod-based">{im.based_on === "trial" ? "Tried once and compared" : "Judged from the file’s text"}</p>
        <ImpactList title="Adds" lines={im.adds} />
        <ImpactList title="Strengthens" lines={im.strengthens} />
        <ImpactList title="Can drop" lines={im.can_drop} />
        {im.can_drop.length > 0 && <p className="muted mod-based">Dropping only hides something. Nothing is deleted, and removing this skill file brings it back.</p>}
      </div>
    </details>
  );
}

function ModuleBlock({ m, r }: { m: ModuleInfo; r?: ModuleResult }) {
  const abilities = m.abilities ?? [];
  const say = sayFor(m);
  const firstOn = abilities.find((a) => a.enabled);
  const flagged = m.flagged?.length ?? 0;
  return (
    <div className="mod-mod">
      <p className="mod-name"><b>{m.name}</b><span className="mod-chip">{m.enabled ? "Connected" : "Switched off"}</span></p>
      <p className="mod-does">{m.does.replace(/7-second/g, "7‑second")}</p>
      {abilities.length > 0 ? (
        <>
          <ul className="mod-abs">{abilities.map((a) => <AbilityRow key={a.id} a={a} />)}</ul>
          {firstOn && <p className="muted mod-ab-meta">To change one, say <CmdChip text={`switch off ${firstOn.label}`} /> in Claude Code.</p>}
        </>
      ) : null}
      <WhyThisOne m={m} />
      {flagged > 0 && <p className="mod-does">{flagged} {flagged === 1 ? "line" : "lines"} in the file {flagged === 1 ? "was" : "were"} ignored.</p>}
      {m.can_publish && <p className="mod-does mod-pub">Off until you switch it on. It never posts for you.</p>}
      {!m.enabled && <p className="mod-does">Say &ldquo;switch on {m.name}&rdquo; in Claude Code.</p>}
      {m.enabled && r && <ResultBlock r={r} say={say} />}
      {m.enabled && !r && <p className="mod-does mod-none">No result yet. Say &ldquo;{say}&rdquo;.</p>}
    </div>
  );
}

export function HowToAdd() {
  return (
    <div className="mod-how">
      <h3>How to add one</h3>
      <ol className="route-steps comp-steps">
        <li><span><b>Find a skill file.</b> A SKILL.md someone shared with you.</span></li>
        <li><span>In Claude Code, say <CmdChip text="add this skill file" /> and give it the file, a link, or paste it.</span></li>
        <li><span>Then say <CmdChip text="look at my CV" /> or <CmdChip text="analyse my LinkedIn" /> and the score shows up here.</span></li>
      </ol>
      <p className="muted mod-safe">It keeps the file unchanged, never runs scripts, and never posts anything for you.</p>
    </div>
  );
}

/** Installed skill files only. No empty slots: until the first one is added, one line says how. */
export function Modules({ modules }: { modules: ModulesData }) {
  const installed = modules?.installed ?? [];
  if (installed.length === 0) {
    return <p className="muted mod-empty-line">Add a skill file and it tells you what it gives you. Say &ldquo;add this skill file&rdquo;.</p>;
  }
  const legacy = installed.find((m) => (m.abilities ?? []).length === 0);
  return (
    <div className="mod">
      <HelpMoment id="addon" vars={{ say: sayFor(installed[0]) }} />
      <ul className="mod-grid">
        {installed.map((m) => (
          <li key={m.id} className="mod-slot"><ModuleBlock m={m} r={latestResult(modules, m.id)} /></li>
        ))}
      </ul>
      {legacy && <p className="muted mod-list-hint">To see what a skill file enables, say <CmdChip text={`list what ${legacy.name} enables`} /> in Claude Code.</p>}
      <p className="muted mod-safe">It keeps each file unchanged, never runs scripts, and never posts anything for you.</p>
    </div>
  );
}

/** Getting hired: one compact fold of what the CV and LinkedIn tools said. Renders nothing without results. */
export function ToolsFold({ modules, onOpen }: { modules: ModulesData; onOpen: () => void }) {
  const rows = (modules?.installed ?? [])
    .filter((m) => m.enabled && (m.capability === "cv" || m.capability === "linkedin" || (m.abilities ?? []).some((a) => /^(cv|linkedin)/.test(a.topic))))
    .map((m) => ({ m, r: latestResult(modules, m.id) }))
    .filter((x): x is { m: ModuleInfo; r: ModuleResult } => !!x.r);
  if (!rows.length) {
    // An enabled CV or LinkedIn tool with nothing scored yet: say what to say, once.
    const waiting = (modules?.installed ?? []).some((m) => m.enabled && (m.capability === "cv" || m.capability === "linkedin"));
    return waiting ? <HelpMoment id="empty-tools" /> : null;
  }
  return (
    <details className="fold">
      <summary><ChevronRight className="chev" aria-hidden />
        <span><b>What your tools say ({rows.length})</b><span className="muted">Skill-file reads of your CV and LinkedIn</span></span></summary>
      <ul className="mod-tools">
        {rows.map(({ m, r }) => (
          <li key={r.id}>
            <span className="mod-tools-name">{m.name}</span>
            <span className="mod-tools-score">{r.score !== null ? `${r.score}${r.word ? `, ${r.word}` : ""}` : "Notes"}<span className="muted"> · {modDate(r.date)}{r.status === "stale" ? " · Stale" : ""}</span></span>
            {r.fixes[0] && <span className="mod-tools-fix">First fix: {r.fixes[0].what}</span>}
          </li>
        ))}
      </ul>
      <p className="mod-tools-more"><button type="button" className="linkbtn" onClick={onOpen}>See the full read on the Commands page</button></p>
    </details>
  );
}
