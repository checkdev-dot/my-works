"use client";
// The A to B gap map: where you are, where you want to be, and what is between, per competency. Desktop first.
// Reads only state that already exists (profile.domain, ratings, rubric); no fetch, no write. Every number is a model
// estimate and says so. Spec: handoff-docs/specs/domain-graph-spec.md; wiring: domain-wiring-todo.md section 8.
import { useState } from "react";
import type { GrowthState } from "@/lib/types";
import { gapFromProfile, LEVEL_NAMES, type DomainGap } from "@/lib/domain-flow.mjs";
import { DOMAINS, getRole, taskById, type GapRow } from "@/lib/domains.mjs";
import { att } from "./ui";

const SCALE = 4;
const pct = (v: number) => `${Math.max(0, Math.min(1, v / SCALE)) * 100}%`;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
const nameOf = (id: string) => (DOMAINS.competencies as { id: string; name: string }[]).find((c) => c.id === id)?.name ?? ((DOMAINS.business_overlay?.competencies ?? []) as { id: string; name: string }[]).find((c) => c.id === id)?.name ?? id;
const STATUS_WORD = { model: "Claude's estimate", unverified: "not confirmed", verified: "confirmed" } as const;
/** Plain names for the proofs that applications of a kind typically ask for (a model estimate, not sourced; falls back to the engine's label). */
const PROOF_NAME: Record<string, string> = {
  portfolio_case_study: "A portfolio case study with an outcome",
  portfolio_brand_work: "Three pieces of brand work in your portfolio",
  earned_media_clippings: "Three press placements and one measured campaign",
  published_content_with_metrics: "Published content with real numbers",
  launch_with_results: "A launch or campaign with a result",
  led_team_outcome: "Proof you have led people and a budget",
  led_campaign: "A campaign you directed, with a result",
  measured_reputation_result: "A reputation result you measured",
  brand_strategy_doc_with_outcome: "A brand strategy document with an outcome",
  experiment_log_with_kpi: "An experiment log with a result",
  pipeline_or_revenue_result: "A pipeline or revenue result",
};

/** A plain sentence for each reason id the gap engine attaches to a row or a task (never the raw id). */
function why(because: string[], row?: GapRow): string[] {
  const out: string[] = [];
  for (const b of because) {
    if (b === "step:test_first") out.push("A short test comes first, because nothing shows this level yet.");
    else if (b === "step:proof") out.push("This is the piece of work that shows the level.");
    else if (b === "step:feedback_person") out.push("One person who can judge it tells you where you stand.");
    else if (b === "step:bridge" || b === "rule:cross_over_bridge_first") out.push("A bridge from the work you do now comes first: proof from one family does not carry into another.");
    else if (b === "step:native_proof_after_bridge") out.push("The proof of the new kind follows the bridge.");
    else if (b === "rule:cross_family_fallback") out.push("No task of this kind exists for the new family yet, so a shared one is used.");
    else if (b === "provisional") out.push("Unconfirmed until you show work or take a test.");
    else if (b.startsWith("blocker:")) out.push("It clears a proof that applications of this kind typically ask for (a model estimate, not sourced).");
  }
  if (row && row.capped) out.push("Your own rating is held one level under the target until there is work or a test behind it.");
  return [...new Set(out)].slice(0, 3);
}

/** The row's one honest line under the bars. */
function lineOf(r: GapRow, numbers = false): string {
  if (r.current === null) return `Not rated yet, so it counts one level short. Needs ${fmt(r.target)}.`;
  if (numbers) {
    const carries = r.carried ? ` ${fmt(r.effective)} of your ${fmt(r.current)} counts here (carries over at ${fmt(r.transfer_w)}).` : "";
    return `You: ${fmt(r.current)}. Needs: ${fmt(r.target)}.${carries}`;
  }
  return `You: ${fmt(r.current)}. Needs: ${fmt(r.target)}.${r.carried ? " Most of this carries over from your other target." : ""}`;
}

function Row({ r, gap, open, onToggle }: { r: GapRow; gap: DomainGap; open: boolean; onToggle: () => void }) {
  const task = gap.result.orderedTasks.find((t) => t.competency === r.competency);
  const have = r.current === null ? 0 : r.current;
  const counts = r.current === null ? 0 : r.effective;
  const status = STATUS_WORD[r.status];
  return (
    <li className="att-3 gm-row">
      <button type="button" className="gm-head" aria-expanded={open} onClick={onToggle} aria-label={`${nameOf(r.competency)}: ${fmt(r.gap)} short of ${fmt(r.target)}. ${open ? "Hide" : "Show"} the next task.`}>
        <span className="gm-name">{nameOf(r.competency)}</span>
        <span className="gm-gap"><b>{fmt(r.gap)}</b> short</span>
        <span className={`gm-bar${r.status === "unverified" ? " is-provisional" : ""}`} role="img" aria-label={`${r.current === null ? "Not rated" : `You ${fmt(r.current)}`}, needs ${fmt(r.target)}`}>
          {r.current !== null && <i className="gm-have" style={{ width: pct(have) }} />}
          <i className="gm-counts" style={{ width: pct(counts) }} />
          <s className="gm-target" style={{ left: pct(r.target) }} />
        </span>
        <span className="gm-line muted">{lineOf(r)} <span className={`gm-status s-${r.status}`}>{status}</span></span>
      </button>
      {open && (
        <div className="gm-next">
          {task ? (
            <>
              <p className="gm-next-t"><b>Next:</b> {task.task}</p>
              <p className="muted gm-next-m">{task.minutes} minutes. Done when: {task.min_evidence}</p>
              {why(task.because, r).map((w) => <p key={w} className="muted gm-next-m">{w}</p>)}
            </>
          ) : <p className="muted gm-next-m">No task is placed for this one yet. A short test comes first; ask for it with &ldquo;test me on {nameOf(r.competency).toLowerCase()}&rdquo;.</p>}
        </div>
      )}
    </li>
  );
}

/**
 * Renders nothing when the person has no domain data (the caller keeps the current page). `gap` comes from
 * gapFromProfile, so the numbers are the ones the interview wrote and the brief gives Claude.
 */
export function GapMap({ s, gap }: { s: GrowthState; gap?: DomainGap | null }) {
  const g = gap === undefined ? domainGapOf(s) : gap;
  const [openId, setOpenId] = useState<string | null>(null);
  if (!g || !g.ok) return null;
  const dom = s.profile.domain ?? {};
  const r = g.result;
  const t0 = g.targets[0];
  const fromRole = g.fromRole ? getRole(g.fromRole) : null;
  const toRole = getRole(t0.role);
  const fromText = fromRole ? `${fromRole.name}${dom.level_now ? `, ${LEVEL_NAMES[dom.level_now]}` : ""}` : "Where you are";
  const toText = `${toRole?.name ?? t0.role}, ${LEVEL_NAMES[t0.level]}`;
  const sameRole = fromRole && toRole && fromRole.id === toRole.id;
  const headline = sameRole
    ? `${fromRole.name}, ${dom.level_now ? LEVEL_NAMES[dom.level_now] : "now"} to ${LEVEL_NAMES[t0.level]}`
    : `${fromText} to ${toText}`;
  const ordered = [...r.byCompetency].sort((a, b) => b.gap - a.gap || a.index - b.index);
  // The three gaps tonight's path moves first (in plan order), topped up with the largest gaps.
  const pathIds: string[] = [];
  for (const t of r.orderedTasks) if (!pathIds.includes(t.competency) && ordered.some((o) => o.competency === t.competency)) pathIds.push(t.competency);
  const topIds = [...pathIds, ...ordered.map((o) => o.competency).filter((id) => !pathIds.includes(id))].slice(0, 3);
  const top = topIds.map((id) => ordered.find((o) => o.competency === id)!).filter(Boolean);
  const rest = ordered.filter((o) => !topIds.includes(o.competency));
  const wp = r.waypoints[0];
  const second = g.targets.find((x, i) => i > 0 && x.kind === "optional");
  // the person's own hours a week, the same number the months are worked out from, never a fixed sentence
  const perWeek = Math.max(1, g.hoursPerWeek || 5);
  const hoursText = `${Math.round(perWeek * 10) / 10} hours a week`;
  const months = r.evenings === null || r.evenings === undefined ? null : Math.max(1, Math.round(r.evenings / perWeek / 4.3));
  const when = months === null ? "Not enough to estimate yet." : `At about ${hoursText}, roughly ${months} month${months === 1 ? "" : "s"}. An estimate, not a promise.`;
  const solid = r.byCompetency.filter((x) => x.status === "verified").length;
  const confidence = solid === 0 ? "Low" : solid * 2 >= r.byCompetency.length ? "Medium" : "Low to medium";
  const rowProps = (row: GapRow) => ({ r: row, gap: g, open: openId === row.competency, onToggle: () => setOpenId(openId === row.competency ? null : row.competency) });
  return (
    <section className={att(2)} aria-labelledby="gm-h">
      <h2 id="gm-h" className="att-2-title">From here to there</h2>
      <p className="gm-ab"><b>{headline}</b></p>
      <p className="gm-est">{when} <span className="gm-conf">Confidence: {confidence}.</span></p>
      <p className="muted gm-reassure">Dates move at Sunday review. Working on it counts.</p>
      {dom.role_mapped && (dom.role_mapped.target || dom.role_mapped.now) && (
        <p className="gm-chips"><span className="gm-chip">Closest launch role used{dom.role_mapped.target ? ` for ${dom.role_mapped.target}` : ""}</span></p>
      )}
      {second && <p className="gm-chips"><span className="gm-chip">{second.sequential ? "Then" : "Second target"}: {getRole(second.role)?.name ?? second.role}</span></p>}
      {r.blockers.length > 0 && (
        <ul className="gm-blockers" aria-label="Typically asked for (model estimate, not sourced)">
          {r.blockers.map((b) => {
            const first = b.clears_with.map((id) => taskById(id)).find(Boolean);
            return (
              <li key={b.id} className="gm-blocker">
                <span className="gm-blocker-k">Typically asked for</span>
                <span className="gm-blocker-t"><b>{PROOF_NAME[b.kind as string] ?? b.label}.</b> You have: {b.have === null ? "not known yet" : `${b.have} of ${b.needs}`}{b.claimed ? " (a number you gave is claimed, not counted until it has a date and a source)" : ""}.{first ? <> First: {first.task.replace(/^./, (c) => c.toLowerCase())} ({first.minutes} minutes).</> : null}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted gm-key">Solid = confirmed by you. Hatched = Claude&apos;s estimate.</p>
      <ul className="att-list gm-list">
        {top.map((row) => <Row key={row.competency} {...rowProps(row)} />)}
      </ul>
      {rest.length > 0 && (
        <details className="fold gm-fold">
          <summary><span><b>Smaller gaps ({rest.length})</b><span className="muted">the rest of the map, largest first</span></span></summary>
          <ul className="att-list gm-list">
            {rest.map((row) => <Row key={row.competency} {...rowProps(row)} />)}
          </ul>
        </details>
      )}
      <details className="fold gm-fold">
        <summary><span><b>How this is worked out</b><span className="muted">where the estimate comes from</span></span></summary>
        <div className="gm-how">
          <p className="muted">This is an estimate from public career ladders, not a promise. Gaps marked not confirmed rest on your own rating or on nothing yet; a test or a piece of work makes them solid.</p>
          {r.sharedBase.length > 0 && <p className="muted">Some skills help both of your targets, so they are only counted once.</p>}
          {wp && <p className="muted">There is a first stop on the way: {getRole(wp.role)?.name ?? wp.role}, {LEVEL_NAMES[wp.level]}. This is a multi-year road, not a single plan.</p>}
          <details className="fold gm-fold">
            <summary><span><b>Show the numbers</b></span></summary>
            <div className="gm-how">
              <p className="muted">Distance {fmt(r.distance ?? 0)}{r.evenings === null || r.evenings === undefined ? "" : `, about ${r.evenings} evenings`}.</p>
              {r.sharedBase.length > 0 && <p className="muted">Shared base, counted once: {r.sharedBase.map(nameOf).join(", ")}.</p>}
              {wp && <p className="muted">First stop: distance {fmt(wp.distance)}, about {wp.evenings} evenings.</p>}
              <ul className="gm-nums">
                {ordered.map((row) => <li key={row.competency} className="muted"><b>{nameOf(row.competency)}.</b> {lineOf(row, true)}</li>)}
              </ul>
            </div>
          </details>
        </div>
      </details>
    </section>
  );
}

/** The gap from the person's own state, or null when there is no domain data (the page then stays as it was). */
export function domainGapOf(s: GrowthState): DomainGap | null {
  const d = s.profile.domain;
  if (!d || !d.targets || !d.targets.length) return null;
  return gapFromProfile({ profile: s.profile, skills: s.skills, rubric: s.rubric, hoursPerWeek: s.profile.constraints?.hours_per_week });
}
