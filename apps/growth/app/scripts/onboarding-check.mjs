// Completeness and integrity of the onboarding. No network, no LLM. Exit 1 on any FAIL.
// Run: node scripts/onboarding-check.mjs [--json] [--derive] [--data-dir D]
//   (no flag)  PASS / WARN / FAIL lines and a summary
//   --json     the same as one JSON object
//   --derive   also prints what the mapper would hand to the plan engine (gaps, demands, tasks, unknowns). Writes nothing.
// With no data/onboarding.json it prints "not started" and exits 0.
//
// Severity, one table (the skill quotes it):
//   FAIL  a MUST with no answer and no unknown in a round that is over; an open unknown with no task or owner; a private answer in a
//         public place; D-salary hard; a self rating above 0.3; the rubric still generic or the adaptive batch missing once past R2;
//         at `complete`: a blocking contradiction open, no plan.json and no plan_pending, an open unknown due within 28 days with
//         no placed task while a plan exists.
//         the invariants of lib/onboarding-invariants.mjs (a derived value that disagrees with its source: targets, evidence, counted
//         level, hiring-bar claim, hours in GapMap, calendar dates, estimate, distance preview, business overlay) are FAIL at `complete`.
//   WARN  the same invariants before `complete`; a blocking contradiction open before `complete`; answers not confirmed; hours provisional; ready_by partial;
//         plan_pending recorded; an unknown due within 28 days with no plan yet; skipped without consequence; stale answers.
import "./_no-people.mjs";
import { readFileSync, existsSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readAll } from "../lib/onboarding-reset.mjs";
import { progress, applyAnswers, blocking, employedOf, NO_EMPLOYER_IDS, isExploring, isMustFor, EXPLORING_NA, integrityFails } from "../lib/onboarding.mjs";
import { resolveQuestion, counts, BANK } from "../lib/onboarding-bank.mjs";
import { validate } from "../lib/validate.mjs";
import { invariantFindings } from "../lib/onboarding-invariants.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const di = args.indexOf("--data-dir");
const dataDir = path.resolve(di >= 0 ? args[di + 1] : path.join(APP, "data"));
const today = new Date().toLocaleDateString("en-CA");
const { d, errors: readErrors } = readAll(dataDir);

const fails = [];
const warns = [];
const notes = [];
const out = { status: "not_started", round: null };

if (readErrors.length) {
  for (const e of readErrors) fails.push(e);
}
const ob = d.onboarding;
const ledger = (d.unknowns && d.unknowns.items) || [];
const live = validate(d);
if (live.errors.length) for (const e of live.errors) fails.push(`data: ${e}`);

// Minimum to render and to run the plan: every point has a question that fills it.
const intakeIds = new Set(((d.profile && d.profile.intake) || []).map((x) => x.id));
const p = d.profile || {};
const points = {
  "profile.role_now": !!p.role_now,
  "profile.north_star.role": !!(p.north_star && p.north_star.role),
  "profile.north_star.salary_inr_per_month": !!(p.north_star && p.north_star.salary_inr_per_month > 0),
  "profile.north_star.recognition": !!(p.north_star && (p.north_star.recognition || []).length),
  "profile.north_star.timeline": !!(p.north_star && p.north_star.timeline),
  "profile.constraints.hours": !!(p.constraints && (p.constraints.hours_per_week > 0 || p.constraints.hours_per_day > 0)),
  "profile.constraints.avoid": !!(p.constraints && (p.constraints.avoid || []).length),
  "profile.situation.currency": !!(p.situation && p.situation.currency),
  "library.gaps (or a stated reason)": !!(d.library && (d.library.gaps || []).length),
  "skills.ratings (evidence based)": Object.values((d.skills && d.skills.ratings) || {}).some((r) => r && r.placeholder !== true),
};
// The currency point only means something once an interview has asked R0-06.
if (!d.onboarding) delete points["profile.situation.currency"];
// A person with no target role has no target role, no target pay and no rubric to rate against: those points do not apply to him.
const exploringNow = !!(d.onboarding && isExploring(d.onboarding.answers || {}));
if (exploringNow) for (const k of ["profile.north_star.role", "profile.north_star.salary_inr_per_month", "skills.ratings (evidence based)", "library.gaps (or a stated reason)"]) delete points[k];
out.required_points = Object.fromEntries(Object.entries(points).map(([k, v]) => [k, v ? "ok" : "missing"]));

if (!ob || ob.status === "not_started") {
  out.status = "not_started";
  out.message = "Onboarding has not started. Say growth start in Claude Code.";
  out.must_total = counts().must;
  out.must_answered = 0;
  out.next_command = "growth start";
} else {
  const pr = progress(ob, ledger);
  Object.assign(out, { status: ob.status, round: ob.round }, {
    answered: pr.answered, skipped: pr.skipped, unknown: pr.unknown, must_total: pr.must_total, must_answered: pr.must_answered, must_unknown: pr.must_unknown,
    per_round: pr.per_round, missing_must: pr.missing_must, skipped_once: pr.skipped_once, deferred_must: pr.deferred_must,
    ready_to_plan: pr.ready_to_plan, readiness: pr.readiness, exploring: pr.exploring, depth: pr.depth, readiness_blockers: pr.readiness_blockers, adaptive: pr.adaptive, unmapped: pr.unmapped, next_ids: pr.next_ids,
    coverage_pct: pr.must_total ? Math.round((100 * pr.must_answered) / pr.must_total) : 0,
    next_command: ob.status === "complete" ? (ob.plan_pending ? ob.plan_pending.next_command : null) : "resume",
  });
  const ROUND_LIST = ["R0", "R1", "R2", "R3", "R4", "R5"];
  const rIx = ROUND_LIST.indexOf(ob.round);
  const complete = ob.status === "complete";

  // FAIL: a MUST from a finished round with no answer and no unknown (ids of the rounds before the current one, or all when complete).
  const deferred = new Set(pr.deferred_must);
  // MUST for this person: a question that does not apply to a person with no target role is not required, a discovery question is.
  const must = BANK.filter((q) => isMustFor(ob, q.id));
  for (const q of must) {
    const rq = ROUND_LIST.indexOf(q.round);
    const a = ob.answers[q.id];
    const off = (ob.off_limits || []).includes(q.id);
    const done = a && ["answered", "unknown", "off_limits"].includes(a.status);
    if ((complete || rq < rIx) && !done && !off && !deferred.has(q.id)) fails.push(`${q.id} (${q.round}) is a MUST with no answer and no unknown, but the interview is past ${q.round}`);
  }
  if (deferred.size) warns.push(`${deferred.size} MUST question(s) were deferred by a round skip (${[...deferred].slice(0, 6).join(", ")}${deferred.size > 6 ? " and more" : ""}); each has its consequence recorded`);

  // Adaptivity is mandatory: from R3 on (or complete) the researched rubric and the adaptive batch must exist, or be explicitly skipped.
  if (rIx >= 3 || complete) {
    if (d.rubric && d.rubric.generic === true && !ob.adaptive_skipped && !pr.exploring) fails.push("the rubric is still the generic placeholder: Round 2 was not done (onboard.rubric) and was not skipped on purpose");
    if (!pr.adaptive.ok) fails.push(pr.exploring ? `no target role, and ${pr.adaptive.directions || 0} of 3 candidate directions are researched (onboard.research, subject source_list directions) or skipped on purpose` : `the adaptive Round 2 batch is not registered (${pr.adaptive.registered} of at least ${pr.adaptive.min}, each citing research)`);
    if (pr.unmapped.length) fails.push(`skill area of ${pr.unmapped.join(", ")} is neither mapped to the rubric nor held by an unknown`);
  } else if (rIx >= 2 && pr.unmapped.length) warns.push(`skill area of ${pr.unmapped.join(", ")} still has to be mapped to the rubric (onboard.map) before Round 2 ends`);
  if (ob.adaptive_skipped) warns.push(`the research round was skipped (${ob.adaptive_skipped.reason}): readiness is enough_with_gaps, and a task "do the research round" is in the course`);
  if (ob.unsourced_rubric) warns.push(`the rubric is described from his own answers, not researched (${ob.unsourced_rubric.reason}): UNSOURCED, ratings stay at 0.3 or lower, and a task "do the research round" is in the course`);
  if (ob.complete_with_gaps) warns.push(`complete with gaps: ${ob.complete_with_gaps.reason}; say redo round 2 when research is possible`);
  for (const [gid, g] of Object.entries(ob.generated_questions || {})) if (!(g.research || []).length && !ob.unsourced_rubric) fails.push(`${gid} cites no research`);

  // unknown ledger coverage
  let withTask = 0; let withDue = 0; let placed = 0;
  const planTasks = (d.plan && d.plan.tasks) || {};
  const hasPlan = !!(d.plan && Object.keys(planTasks).length);
  const in28 = new Date(Date.now() + 28 * 864e5).toLocaleDateString("en-CA");
  for (const u of ledger) {
    const hasTask = !!(u.task_id || u.draft_task || u.how === "research");
    if (u.status === "open") {
      if (!u.how || !u.due) fails.push(`${u.id}: an open unknown needs how and due`);
      if (!hasTask) fails.push(`${u.id}: an open unknown has no task, draft task or research owner`);
      if (u.how === "research" && !u.research_id && u.due < today) warns.push(`${u.id}: research was due ${u.due} and has no research id yet`);
      if (u.due < today && u.how !== "research") warns.push(`${u.id}: due ${u.due}, which has passed`);
      // The draft task of an unknown keeps its id UT-<unknown id> in the plan, so it counts as placed under that id too.
      const isPlaced = !!((u.task_id && planTasks[u.task_id]) || planTasks[`UT-${u.id}`]);
      if (u.how !== "research" && u.due && u.due <= in28 && !isPlaced) {
        if (hasPlan) fails.push(`${u.id}: due ${u.due} (within 4 weeks) and not placed in the plan that exists`);
        else if (rIx >= 4 || complete) warns.push(`${u.id}: due ${u.due} (within 4 weeks) and not placed in a plan yet; say plan my four weeks`);
      }
    }
    if (hasTask) withTask += 1;
    if (u.due) withDue += 1;
    if ((u.task_id && planTasks[u.task_id]) || planTasks[`UT-${u.id}`]) placed += 1;
  }
  for (const [id, a] of Object.entries(ob.answers)) {
    if (a.status !== "unknown") continue;
    const q = resolveQuestion(id);
    // A person with no job has no notice period and no contract: those unknowns make no task on purpose.
    if (q && NO_EMPLOYER_IDS.includes(id) && !employedOf(ob.answers)) notes.push(`${id}: unknown, and no task because B-01 or S-01 says there is no employer`);
    else if (q && pr.exploring && (EXPLORING_NA.includes(id) || id === "B-04")) notes.push(`${id}: unknown, and no task on purpose: he has no target role, so the exploration course replaces it`);
    else if (q && q.unknown && q.unknown.task_kind !== "none" && !ledger.some((u) => u.question === id)) fails.push(`${id}: answered I don't know, but there is no row in unknowns.json`);
    else if (q && q.unknown && q.unknown.task_kind === "none") notes.push(`${id}: unknown accepted as an answer (${q.unknown.gap})`);
  }
  out.unknown_coverage = { total: ledger.length, open: ledger.filter((u) => u.status === "open").length, with_task: withTask, with_due: withDue, placed_in_plan: placed };

  // complete needs a plan, or an explicit "plan pending" with the command that builds it
  if (complete) {
    if (!hasPlan && !d.plan && !ob.plan_pending) fails.push("complete, but there is no plan.json and no plan_pending with a next_command");
    else if (ob.plan_pending && !hasPlan) warns.push(`complete, but the plan is still pending (${ob.plan_pending.reason}); next: ${ob.plan_pending.next_command}`);
  }

  // contradictions: a blocking one is a WARN until the round ends, a FAIL once complete. A calibration note (C-04) never blocks.
  out.contradictions = (ob.contradictions || []).map((c) => ({ id: c.id, between: c.between, status: c.status, severity: c.severity || "block", detail: c.detail }));
  for (const c of blocking(ob.contradictions)) {
    if (complete) fails.push(`${c.id} is still open (${c.between.join(", ")}) and the onboarding is complete`);
    else warns.push(`${c.id} is open (${c.between.join(", ")}); it must be decided before the round ends`);
  }
  for (const c of ob.contradictions || []) if (c.status === "open" && c.severity === "note") notes.push(`${c.id}: calibration note, not blocking (${c.between.join(", ")})`);

  // derived values
  const dv = ob.derived || {};
  if (dv.hours && dv.hours.provisional) warns.push(`hours per night are provisional: ${dv.hours.missing.join(", ")} not answered yet (${dv.hours.basis})`);
  if (dv.readiness && dv.readiness.partial && rIx >= 4) warns.push(`ready_by is partial: ${dv.readiness.generic_rubric ? "the rubric is generic; " : ""}${(dv.readiness.missing || []).length ? `no gap or rating for ${dv.readiness.missing.join(", ")}` : "competencies not assessed yet"}`);
  const tgt = p.north_star && p.north_star.salary_inr_per_month; const flr = p.constraints && p.constraints.salary_floor_inr;
  if (typeof tgt === "number" && typeof flr === "number" && tgt > 0 && flr > 0 && tgt < flr) (complete ? fails : warns).push(`the salary target ${tgt} is below the floor ${flr}`);

  // assumed fields and stale answers
  out.assumed_fields = [];
  for (const q of BANK) {
    const a = ob.answers[q.id];
    if (a && a.status === "unknown" && q.unknown && q.unknown.default !== undefined) out.assumed_fields.push({ id: q.id, assumed: q.unknown.default, confidence: 0.2 });
  }
  out.stale = Object.entries(ob.answers).filter(([, a]) => a.status === "answered" && a.answered && Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${a.answered}T00:00:00Z`)) / 864e5) > 56).map(([id]) => id);

  // FAIL: private material in public places, D-salary hard, a self rating above 0.3. ONE function (lib/onboarding.mjs integrityFails)
  // is the test here and in `complete`: a FAIL printed here is never a state complete accepts, and the other way round. A private
  // answer is a leak only when a run of 8 words of it appears verbatim in a public place (a short, similar answer is not a copy).
  const cvTexts = [];
  const cvDir = path.join(APP, "cv");
  try {
    if (existsSync(cvDir)) for (const n of readdirSync(cvDir)) if (/\.(md|txt|json)$/i.test(n)) cvTexts.push(readFileSync(path.join(cvDir, n), "utf8"));
    // The CV pages (canonical and drafts), as the words a reader sees: style, script and tags are taken out.
    const pageText = (p) => readFileSync(p, "utf8").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
    for (const dir of [cvDir, path.join(cvDir, "drafts")]) if (existsSync(dir)) for (const n of readdirSync(dir)) if (/\.html$/i.test(n)) cvTexts.push(pageText(path.join(dir, n)));
  } catch { /* cv folder unreadable: skip */ }
  out.private_leak = [];
  for (const f of integrityFails(d, { cvTexts })) {
    if (f.kind === "private_leak") out.private_leak.push(f.source);
    fails.push(f.kind === "private_leak" && f.fixable && f.id ? `${f.message}. Fix, one command: onboard.redact with id "${f.src || f.id}" (every public copy, tasks and risks made from it included, is redacted at once), or change that public answer` : f.message);
  }
  const pp = d.prior && d.prior.profile;
  if (pp) {
    const pairs = [["role_now", p.role_now, pp.role_now, "B-01"], ["north_star.role", p.north_star && p.north_star.role, pp.north_star && pp.north_star.role, "B-04"], ["north_star.salary_inr_per_month", p.north_star && p.north_star.salary_inr_per_month, pp.north_star && pp.north_star.salary_inr_per_month, "B-33"]];
    for (const [name, now, then, qid] of pairs) {
      if (now && then && JSON.stringify(now) === JSON.stringify(then) && !(ob.answers[qid] && ob.answers[qid].status === "answered") && !Object.values(d.prior.confirmed || {}).includes("still_true")) fails.push(`profile.${name} equals the archived value and was not confirmed or answered again`);
    }
  }

  // WARN
  if (pr.deferred_by_depth && pr.deferred_by_depth.length) warns.push(`${pr.deferred_by_depth.length} MUST question(s) are not asked on the quick path (${pr.deferred_by_depth.slice(0, 6).map((x) => x.id).join(", ")}${pr.deferred_by_depth.length > 6 ? " and more" : ""}); each stays unknown until he picks standard or deep`);
  for (const [r, s] of Object.entries(ob.skipped_rounds || {})) warns.push(`the rest of ${r} was skipped by him (${s.reason_tag}); ${(s.deferred || []).length} MUST question(s) deferred with their consequence`);
  if ((ob.off_limits_unmatched || []).length) warns.push(`${ob.off_limits_unmatched.length} off limits phrase(s) matched no topic and exclude nothing yet (${ob.off_limits_unmatched.slice(0, 3).join("; ")}): show him how you read each and send onboard.boundary`);
  if (ob.sitting && ob.sitting.asked > ob.sitting.max + 1e-9) warns.push(`sitting ${ob.sitting.n}: ${ob.sitting.asked} asked, over the ${ob.sitting.max} limit`);
  for (const [id, s] of Object.entries(ob.skipped || {})) if (!s.consequence) warns.push(`${id}: skipped with no consequence`);
  for (const [id, a] of Object.entries(ob.answers)) if (a.status === "answered" && a.confidence < 0.4 && (resolveQuestion(id) || {}).must && /^(B-0[4-9]|B-1[0-8]|T-07)$/.test(id)) warns.push(`${id}: confidence ${a.confidence} on a field the plan uses`);
  // Round 3 answers are private and confirmed one by one only where they change something, so they are not counted here.
  const unconfirmed = Object.values(ob.answers).filter((a) => a.status === "answered" && !a.confirmed && !a.private && a.round !== "R0").length;
  if (unconfirmed) warns.push(`${unconfirmed} answer(s) are not confirmed yet (shown in the round summary; confirm with onboard.confirm and his words)`);
}

if (args.includes("--derive") && ob && ob.status !== "not_started") {
  out.derived = applyAnswers({ profile: d.profile, rubric: d.rubric, skills: d.skills, evidence: d.evidence, library: d.library, proof: d.proof, research: d.research, demands: d.demands, unknowns: d.unknowns, onboarding: ob }, ob.answers, { today });
}

// The domain flow (family, role, level, DM-* questions, the A to B gap). Counted apart from the main bank; nothing here changes a
// main bank verdict for a person who never answered DM-01.
if (ob && ob.answers && ob.status !== "not_started") {
  const dp = progress(ob, ledger).domain;
  if (dp && dp.active) {
    out.domain = { family_now: dp.family_now, role_now: dp.role_now, targets: dp.targets, must: `${dp.must_done} of ${dp.must_total}`, missing_must: dp.missing_must };
    if (dp.must_total > dp.must_cap) fails.push(`${dp.must_total} domain MUST questions apply to this person; the cap is ${dp.must_cap}`);
    if (!dp.targets.length) warns.push(`DM-01 gave a family, but no launch role is the target yet (${dp.note || "answer DM-03 and DM-06, or map his role with his confirmation"}), so the generic gap builder is used`);
    if (dp.targets.length && !(ob.derived && ob.derived.domain && ob.derived.domain.ok)) warns.push("a launch role is the target, but no domain gap is on file yet (it is written with the next answer or when the bridge is written)");
    if (ob.status === "complete" && dp.missing_must.length) warns.push(`${dp.missing_must.length} domain MUST question(s) were not covered (${dp.missing_must.slice(0, 6).join(", ")}); what stays unknown is the evidence of the new family`);
  } else if (dp && dp.outside) notes.push(dp.note);
}

// One invariant per derived value (lib/onboarding-invariants.mjs): the derived value is recomputed by the function that wrote it and
// compared with its source. FAIL at complete, WARN before.
if (ob && ob.status !== "not_started") {
  let gm;
  try { gm = readFileSync(path.join(APP, "components", "GapMap.tsx"), "utf8"); } catch { gm = undefined; }
  out.invariants = [];
  for (const f of invariantFindings({ profile: d.profile, skills: d.skills, rubric: d.rubric, library: d.library, demands: d.demands, onboarding: ob }, { gapMapSource: gm })) {
    out.invariants.push(f);
    (ob.status === "complete" && f.severity !== "warn" ? fails : warns).push(`invariant ${f.n} (${f.id}): ${f.message}`);
  }
}

out.verdict = fails.length ? "FAIL" : warns.length ? "WARN" : "PASS";
out.fails = fails;
out.warns = warns;
out.notes = notes;
out.bank = counts();

if (args.includes("--json")) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`Onboarding: ${out.status}${out.round ? `, round ${out.round}` : ""}`);
  if (out.status === "not_started") console.log(`  ${out.message}\n  The bank has ${out.bank.must} MUST questions across R0 to R4 (${out.bank.fixed} fixed); the minimum viable path to "enough to start" is ${out.bank.min_viable} questions.`);
  else {
    console.log(`  MUST covered: ${out.must_answered} of ${out.must_total} (${out.coverage_pct}%), ${out.must_unknown} are I don't know`);
    console.log(`  Answered ${out.answered}, unknown ${out.unknown}, skipped ${out.skipped}`);
    console.log(`  Adaptive Round 2: ${out.adaptive.skipped ? "skipped on purpose" : `${out.adaptive.registered} registered (need ${out.adaptive.min}), ${out.adaptive.with_research} citing research`}`);
    console.log(`  Enough to start: ${out.readiness === "ready" ? "yes, say plan my four weeks" : out.readiness === "enough_with_gaps" ? "yes, with gaps (research round skipped, rubric unsourced, or MUST deferred)" : out.readiness === "exploring" ? "yes, as an exploration course (no target role yet: say plan my four weeks)" : "not yet"}`);
    for (const b of out.readiness_blockers || []) console.log(`    not enough to start: ${b}`);
    if (out.missing_must.length) console.log(`  Missing MUST: ${out.missing_must.slice(0, 12).join(", ")}${out.missing_must.length > 12 ? ` and ${out.missing_must.length - 12} more` : ""}`);
    if (out.next_ids.length) console.log(`  Next sitting: ${out.next_ids.join(", ")}`);
    const uc = out.unknown_coverage;
    console.log(`  Unknowns: ${uc.total} (${uc.open} open), ${uc.with_task} with a task, ${uc.with_due} with a due date, ${uc.placed_in_plan} placed in the plan`);
    console.log(`  Contradictions: ${out.contradictions.length ? out.contradictions.map((c) => `${c.id} ${c.status}`).join(", ") : "none"}`);
  }
  const missing = Object.entries(out.required_points).filter(([, v]) => v === "missing").map(([k]) => k);
  console.log(`  Data points to render: ${Object.keys(out.required_points).length - missing.length} of ${Object.keys(out.required_points).length}${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
  for (const m of fails) console.log(`FAIL  ${m}`);
  for (const m of warns) console.log(`WARN  ${m}`);
  console.log(`\n${out.verdict}${out.status === "not_started" ? " (not started)" : ""}`);
  if (args.includes("--derive") && out.derived) console.log(`\nDerived (not written): ${out.derived.gaps.length} gaps, ${out.derived.demands.items.length} demands, ${out.derived.tasks.length} tasks, ${out.derived.unknowns.length} new unknowns, ${out.derived.contradictions.length} contradictions`);
}
process.exit(fails.length ? 1 : 0);
