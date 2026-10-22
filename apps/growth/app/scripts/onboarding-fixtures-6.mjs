// Fixtures for the sixth round (critique 5, builder OF4). Called from scripts/onboarding-fixtures.mjs with its helpers, so every
// result is counted in the one total. The class named by the reviewer is tested as a class: a DERIVED value is never stored beside a
// SOURCE value that disagrees, and a number is never accepted as proof by its shape. Each block names the finding it proves; the
// "before" column of handoff-docs/specs/onboarding-sim-6.md is the behaviour of the code of critique 5.
import fs from "fs";
import path from "path";
import * as OB from "../lib/onboarding.mjs";
import { integrityFails } from "../lib/onboarding.mjs";
import { inProcess } from "./onboarding-sim.mjs";
import { PERSONAS, buildSteps } from "./onboarding-personas.mjs";
import { DOMAIN_PEOPLE } from "./domains-personas.mjs";
import { gapFromProfile, assessResult, resultState, countedRatings, domainGapEntries } from "../lib/domain-flow.mjs";
import { invariantFindings, claimsHiringBar } from "../lib/onboarding-invariants.mjs";
import { resolveQuestion } from "../lib/onboarding-bank.mjs";
import { execFileSync } from "child_process";
import { buildBrief } from "./make-brief.mjs";
import { validate } from "../lib/validate.mjs";
import { runSteps3 } from "./onboarding-sim-3.mjs";

export async function section6(h) {
  const { ok, tryAct, seq, toR1, copyData, skState, TODAY } = h;
  const act = (s, a) => { try { return h.act(s, a); } catch { return s; } };
  const guard = async (name, fn) => { try { await fn(); } catch (e) { ok(`${name}: the block ran to the end`, false, e.stack || e.message); } };
  const fullRun = (steps) => { const box = { state: structuredClone(skState) }; const r = runSteps3(steps, inProcess(box, { today: TODAY })); return { box, r }; };
  const COMPLETE = { type: "onboard.round", round: "R5", complete: true, plan_pending: { reason: "the plan is built in its own step", next_command: "plan my four weeks" } };

  // ---- P1-6 the finish dead end: one command redacts every derived copy ------------------------------------------------
  await guard("p6-1", async () => {
    const SAME = "Waiting for a perfect moment to publish my case study instead of shipping a rough one";
    const P = structuredClone(PERSONAS.designer);
    P.r3 = P.r3.map(([id, v, o]) => (id === "R3-01" ? [id, SAME, o] : [id, v, o]));
    P.r4 = P.r4.map(([id, v, o]) => (id === "T-09" ? [id, SAME, {}] : [id, v, o]));
    const steps = buildSteps(P).steps;
    const pre = steps.findIndex((x) => x.a.type === "onboard.round" && x.a.complete === true);
    const { box, r } = fullRun(steps.slice(0, pre));
    ok("P1-6 setup: R4 T-09 repeats R3-01 word for word and the flow reaches R5", r.ok, JSON.stringify(r.log.filter((l) => !l.ok).slice(0, 1)));
    const fails = integrityFails(box.state).filter((f) => f.kind === "private_leak");
    ok("P1-6: the check fails on BOTH places: profile.intake T-09 and the derived task OT-T-09 (before: only the first was fixable)", fails.some((f) => f.id === "T-09") && fails.some((f) => f.id === "OT-T-09" && f.fixable === true), JSON.stringify(fails.map((f) => [f.id, f.fixable])));
    const comp = tryAct(box.state, COMPLETE);
    ok("P1-6: complete is refused and the message names the ONE command with the answer id", !!comp.err && /onboard\.redact/.test(comp.err) && /"T-09"/.test(comp.err), comp.err);
    const red = tryAct(box.state, { type: "onboard.redact", id: "T-09" });
    const tasks = (red.s && red.s.onboarding.derived.tasks) || [];
    const t09 = tasks.find((x) => x.id === "OT-T-09");
    const intake = red.s && (red.s.profile.intake || []).find((x) => x.id === "T-09");
    ok("P1-6: ONE onboard.redact {id: T-09} redacts the intake line AND rebuilds the task and the risk in neutral words", !red.err && intake && intake.answer === "(private)" && t09 && !/perfect moment|shipping a rough/i.test(t09.task) && !(red.s.onboarding.derived.risks || []).some((x) => /perfect moment/i.test(x.text || "")), red.err || JSON.stringify([intake, t09]));
    ok("P1-6: no integrity FAIL is left after that one command", integrityFails(red.s).length === 0, JSON.stringify(integrityFails(red.s).map((f) => f.message)));
    const done = tryAct(red.s, COMPLETE);
    ok("P1-6: the same complete is accepted with zero manual edits", !done.err && done.s.onboarding.status === "complete", done.err);
    const again = tryAct(red.s, { type: "onboard.redact", id: "T-09" });
    ok("P1-6: the command is idempotent: a second call is a success that changes nothing", !again.err && JSON.stringify(again.s.onboarding.derived.tasks) === JSON.stringify(red.s.onboarding.derived.tasks), again.err);
    const alias = tryAct(box.state, { type: "onboard.redact", id: "OT-T-09" });
    ok("P1-6: the derived id (OT-T-09) is accepted as the same fix (before: 'Nothing public under OT-T-09 holds a copy')", !alias.err && integrityFails(alias.s).length === 0, alias.err);
    const all = tryAct(box.state, { type: "onboard.redact" });
    ok("P1-6: onboard.redact with no id redacts every copy at once", !all.err && integrityFails(all.s).length === 0, all.err);
    const resend = act(red.s, { type: "onboard.answer", id: "T-09", value: SAME });
    const t09b = (resend.onboarding.derived.tasks || []).find((x) => x.id === "OT-T-09");
    ok("P1-6: a resend of the same answer does not bring the copy back (the redaction is on the answer, so every recompute holds it)", t09b && !/perfect moment/i.test(t09b.task) && integrityFails(resend).length === 0, t09b && t09b.task);
    // The person's own flow: R3-16 against T-05 (a list), plus a demand copy of a redacted R3 answer
    const D = structuredClone(PERSONAS.designer);
    D.r3.push(["R3-16", "Scrolling at night instead of making my case study better every single evening", {}]);
    D.r4 = D.r4.map(([id, v, o]) => (id === "T-05" ? [id, ["Scrolling at night instead of making my case study better every single evening"], o] : [id, v, o]));
    const ds = buildSteps(D).steps;
    const dpre = ds.findIndex((x) => x.a.type === "onboard.round" && x.a.complete === true);
    const dev = fullRun(ds.slice(0, dpre));
    const dred = tryAct(dev.box.state, { type: "onboard.redact", id: "T-05" });
    const ddone = dred.s ? tryAct(dred.s, COMPLETE) : { err: dred.err };
    ok("P1-6: The person's flow (R3-16 against T-05) reaches complete after ONE redact, no manual edit", dev.r.ok && !dred.err && !ddone.err && ddone.s.onboarding.status === "complete", dred.err || ddone.err);
  });
  /** A domain person (scripts/domains-personas.mjs) from the skeleton up to and including the step whose say matches. */
  const domainTo = (key, re) => {
    const steps = DOMAIN_PEOPLE[key].steps();
    const ix = steps.findIndex((x) => x.say && re.test(x.say));
    return fullRun(steps.slice(0, ix >= 0 ? ix + 1 : steps.length));
  };
  const RESULT = ["launch_with_results", "published_content_with_metrics", "pipeline_or_revenue_result"];
  const blockerKinds = (st) => { const g = gapFromProfile({ profile: st.profile, skills: st.skills, rubric: st.rubric }); return g && g.ok ? g.result.blockers : []; };
  const resultBlocker = (st) => blockerKinds(st).find((b) => RESULT.includes(b.kind));

  // ---- P1-5 a number is not proof by its shape ------------------------------------------------------------------------
  await guard("p5", async () => {
    const { box, r } = domainTo("dm_p4", /Answer DM-12$/);
    ok("P1-5 setup: a content marketer to product marketer is in R1 with DM-20 not yet answered", r.ok && !box.state.onboarding.answers["DM-20"], JSON.stringify(r.log.filter((l) => !l.ok).slice(0, 1)));
    const st0 = act(box.state, { type: "onboard.round", round: "R1", new_sitting: true, reason_tag: "he_asked_to_continue" });
    const kind = resultBlocker(st0);
    ok("P1-5 setup: before DM-20 the results blocker exists and is not known yet", !!kind && kind.have === null, JSON.stringify(kind && [kind.kind, kind.have]));
    const send = (s0, v, extra = {}) => act(s0, { type: "onboard.answer", id: "DM-20", value: v, ...extra });
    // before: any digit cleared the blocker; after: a hedge word makes it claimed at 0.3, not proved
    const HEDGES = [["about", "ROAS of about 4 on 20,000 rupees in March 2026"], ["I think", "ROAS 4 on 20,000 rupees in March 2026, I think"], ["maybe", "maybe ROAS 4 on 20,000 rupees in March 2026"], ["roughly", "roughly 4 ROAS on 20,000 rupees in March 2026"], ["I believe", "ROAS 4 on 20,000 rupees in March 2026, I believe"], ["around", "ROAS around 4 on 20,000 rupees in March 2026"]];
    for (const [w, text] of HEDGES) {
      const s1 = send(st0, text);
      const b = resultBlocker(s1);
      ok(`P1-5: a hedged result ("${w}") is claimed at confidence 0.3 and does NOT clear the results blocker`, !!b && b.claimed === true && b.claimed_confidence === 0.3 && resultState(s1.profile.domain).state === "claimed", JSON.stringify(b && [b.have, b.claimed, b.claimed_confidence]));
    }
    const bare = send(st0, "4");
    ok("P1-5: a bare digit with no baseline, period, link or client is claimed, not proved", !!resultBlocker(bare) && resultState(bare.profile.domain).state === "claimed");
    const proved = send(st0, "ROAS 4.1 on 20,000 rupees in March 2026, up from 2.8 in February");
    ok("P1-5: a metric WITH a baseline and a period, not hedged, clears the blocker", !resultBlocker(proved) && resultState(proved.profile.domain).state === "proved", JSON.stringify(resultState(proved.profile.domain)));
    const linked = send(st0, "Signup rate 6.2% on https://example.org/report/q2");
    ok("P1-5: a link is a proof part by itself", !resultBlocker(linked));
    const named = send(st0, "A 31% open rate on a newsletter for Acme Foods");
    ok("P1-5: a named client or employer is a proof part by itself", !resultBlocker(named));
    // follow-ups supply the parts: a bare number plus its date and its source
    const f1 = act(act(bare, { type: "onboard.answer", id: "DM-20.f1", value: "2026-03-31" }), { type: "onboard.answer", id: "DM-20.f2", value: "Meta Ads Manager report" });
    ok("P1-5: the number plus its date (DM-20.f1) and its source (DM-20.f2) becomes proved", !resultBlocker(f1) && resultState(f1.profile.domain).state === "proved", JSON.stringify(resultState(f1.profile.domain)));
    // withdrawal
    const idk = act(proved, { type: "onboard.answer", id: "DM-20", status: "unknown" });
    ok("P1-5: a later I don't know WITHDRAWS the proof (before: best_result stayed set and the blocker stayed cleared)", idk.profile.domain.evidence.best_result === undefined && !!resultBlocker(idk) && resultBlocker(idk).have === null, JSON.stringify([idk.profile.domain.evidence, resultBlocker(idk) && resultBlocker(idk).have]));
    const fix = send(proved, "ROAS about 4, I think");
    ok("P1-5: a later correction to a hedged number withdraws the proof too (recomputed from the latest answer)", !!resultBlocker(fix) && resultBlocker(fix).claimed === true);
    const none = send(proved, "none");
    ok("P1-5: a later none keeps the blocker open with 0 of 1", !!resultBlocker(none) && resultBlocker(none).have === 0 && resultState(none.profile.domain).state === "none");
    {
      const sc = send(st0, "ROAS about 4");
      const e = domainGapEntries(gapFromProfile({ profile: sc.profile, skills: sc.skills, rubric: sc.rubric }), sc.rubric, TODAY).find((x) => RESULT.includes(x.proof_blocker));
      ok("P1-5/P1-4: the proof gap says 'model estimate, not sourced' and what is claimed; it never says 'needs this before you apply'", !!e && /model estimate, not sourced/.test(e.why) && /claimed/.test(e.why) && !/before you apply/.test(e.why), e && e.why);
    }
    // the pure function, class test: every hedge word against every proof part
    const parts = ["in March 2026 up from 2.8", "https://example.org/r", "for Acme Foods"];
    const bad = [];
    for (const [w] of HEDGES) for (const pt of parts) if (assessResult([`ROAS ${w} 4 ${pt}`]).state === "proved") bad.push(`${w} ${pt}`);
    ok("P1-5 class: no hedge word combined with any proof part is proved (6 words x 3 parts)", bad.length === 0, bad.join(" | "));
  });
  // ---- the invariants: each one fails on a corrupted copy of a good state and passes on the good one -------------------------
  const readGapMap = () => { try { return fs.readFileSync(path.join(h.APP, "components", "GapMap.tsx"), "utf8"); } catch { return ""; } };
  const viewOf = (s) => ({ profile: s.profile, skills: s.skills, rubric: s.rubric, library: s.library, demands: s.demands, onboarding: s.onboarding });
  await guard("inv", async () => {
    const { box, r } = fullRun(DOMAIN_PEOPLE.dm_p1.steps());
    ok("invariants setup: The person's product designer flow (dm_p1) completes in process", r.ok && box.state.onboarding.status === "complete", JSON.stringify(r.log.filter((l) => !l.ok).slice(0, 1)));
    const good = box.state;
    const find = (s) => invariantFindings(viewOf(s), { gapMapSource: readGapMap() });
    const nOf = (s) => find(s).map((f) => f.n);
    ok("invariants: a good complete state has none of the nine findings", find(good).length === 0, JSON.stringify(find(good).map((f) => f.message).slice(0, 3)));
    const c1 = structuredClone(good); c1.profile.domain.targets = [{ ...c1.profile.domain.targets[0], level: "S" }];
    ok("invariant 1: domain.targets that disagree with DM-03 and DM-06 are found", nOf(c1).includes(1));
    const c1b = structuredClone(good); c1b.profile.domain.target_level = "J";
    ok("invariant 1: a target level that disagrees with DM-06 is found", nOf(c1b).includes(1));
    // 2: evidence kept after an I don't know (the P1-5 defect, as a state)
    const c2 = structuredClone(good); c2.onboarding.answers["DM-14"] = { ...c2.onboarding.answers["DM-14"], status: "unknown", value: null };
    ok("invariant 2: evidence that an I don't know should have withdrawn (case_studies kept) is found", nOf(c2).includes(2), JSON.stringify(find(c2).map((f) => f.id)));
    // 3: a rating without the counted level, and one that disagrees
    const c3 = structuredClone(good);
    const cap = Object.entries(c3.skills.ratings).find(([, rt]) => rt.capped === true);
    ok("invariant 3 setup: the completed flow has at least one capped rating with its marker", !!cap && /counted as/.test(cap[1].cap_reason || ""), JSON.stringify(cap && cap[1].cap_reason));
    if (cap) {
      delete c3.skills.ratings[cap[0]].level_counted;
      ok("invariant 3: a rating with no level_counted (the page would show the claimed level beside the gap's counted one) is found", nOf(c3).includes(3));
      const c3b = structuredClone(good); c3b.skills.ratings[cap[0]].level_counted = c3b.skills.ratings[cap[0]].level;
      ok("invariant 3: a counted level that differs from the gap's is found", nOf(c3b).includes(3));
    }
    // 4: an unsourced hiring-bar sentence
    const c4 = structuredClone(good); c4.library.gaps[0] = { ...c4.library.gaps[0], status: "open", why: "Product designer needs this before you apply. You have: 0." };
    ok("invariant 4: 'needs this before you apply' with no research id and no label is found", nOf(c4).includes(4));
    const c4b = structuredClone(good); c4b.library.gaps[0] = { ...c4b.library.gaps[0], status: "open", why: "Typically asked for (model estimate, not sourced). You have: 0." };
    ok("invariant 4: the same claim with the 'model estimate' label passes", !nOf(c4b).includes(4));
    // 5: the GapMap source
    ok("invariant 5: a GapMap that says 'an hour a night' is found, the real one (the person's hours a week) passes", invariantFindings(viewOf(good), { gapMapSource: "At about an hour a night, roughly 3 months" }).some((f) => f.n === 5) && !nOf(good).includes(5));
    // 6: dates
    const c6 = structuredClone(good); c6.onboarding.answers["B-16"] = { ...c6.onboarding.answers["B-16"], value: "2027-13-40" };
    ok("invariant 6: 2027-13-40 in a date answer is found", nOf(c6).includes(6));
    const rej = tryAct(toR1(skState), { type: "onboard.answer", id: "B-16", value: "2027-13-40" });
    const rej2 = tryAct(toR1(skState), { type: "onboard.answer", id: "B-16", value: "2027-02-30" });
    const okd = tryAct(toR1(skState), { type: "onboard.answer", id: "B-16", value: "2028-02-29" });
    ok("invariant 6 at the write: 2027-13-40 and 2027-02-30 are refused, a real leap day is accepted", !!rej.err && /calendar/.test(rej.err) && !!rej2.err && !okd.err, JSON.stringify([rej.err, rej2.err, okd.err]));
    // 8: the preview is rebuilt, and a stale one is found
    const c8 = structuredClone(good); c8.profile.domain.gap_preview = { ...c8.profile.domain.gap_preview, distance: 1 };
    ok("invariant 8: a stale gap_preview is found; the one the flow wrote passes", nOf(c8).includes(8) && !nOf(good).includes(8) && !!good.profile.domain.gap_preview);
    // 9: a business target whose saved gaps carry no business part
    const biz = fullRun(DOMAIN_PEOPLE.dm_pr_consultancy.steps()).box.state;
    const c9 = structuredClone(biz);
    c9.library.gaps = c9.library.gaps.filter((x) => !["pricing", "selling", "pipeline", "contracting_admin", "business_positioning", "financial_runway"].includes(x.domain_competency));
    ok("invariant 9: a business target whose saved gaps hold no business competency is found; the real saved gaps pass", find(c9).some((f) => f.n === 9) && !find(biz).some((f) => f.n === 9), JSON.stringify(find(biz).map((f) => f.message)));
    // a rating the app moved after onboarding is the app's: no validator ERROR, no FAIL (the guards of invariants 3 and 8)
    const moved = structuredClone(good);
    const [mid, mr] = Object.entries(moved.skills.ratings).find(([, rt]) => rt.placeholder !== true);
    moved.skills.ratings[mid] = { ...mr, level: Math.min(4, mr.level + 0.5), history: [...mr.history, { date: TODAY, level: Math.min(4, mr.level + 0.5), source: "expert", reason: "A reviewer judged the work in the weekly review." }], source: "expert", confidence: 0.8 };
    const vres = validate({ ...moved });
    ok("the app moving a rating (a review) leaves no validator error from the counted fields (a warning at most)", vres.errors.filter((e) => /level_counted|level_claimed|cap_reason/.test(e)).length === 0, JSON.stringify(vres.errors.slice(0, 2)));
    ok("and no invariant FAILs for that rating: it belongs to the app now (ownership guard); a stale preview is only a warning", !find(moved).some((f) => f.n === 3) && find(moved).filter((f) => f.n === 8).every((f) => f.severity === "warn"), JSON.stringify(find(moved).map((f) => [f.n, f.severity])));
  });

  // ---- invariant 7: the estimate counts the domain questions ---------------------------------------------------------------
  await guard("estimate", async () => {
    const steps = DOMAIN_PEOPLE.dm_p4.steps();
    const upTo = (re) => { const ix = steps.findIndex((x) => x.say && re.test(x.say)); return fullRun(steps.slice(0, ix + 1)); };
    const noFamily = upTo(/Answer R0-03$/);
    const withFamily = upTo(/Answer DM-01$/);
    const e0 = OB.estimateToStart(noFamily.box.state.onboarding);
    const e1 = OB.estimateToStart(withFamily.box.state.onboarding);
    ok("invariant 7: before DM-01 no domain question is counted (the person may take the generic path)", (e0.domain_questions || 0) === 0, JSON.stringify(e0));
    ok("invariant 7: from DM-01 on, the domain MUST questions between now and a first plan are counted in the estimate and said in words", e1.domain_questions > 0 && /about your role and level/.test(e1.say), JSON.stringify(e1));
    const noDm = { ...withFamily.box.state.onboarding, answers: Object.fromEntries(Object.entries(withFamily.box.state.onboarding.answers).filter(([id]) => !/^DM-/.test(id))) };
    const main = OB.estimateToStart(noDm);
    ok("invariant 7: the estimate with the domain questions is larger than the main bank alone (it said 15 questions when 24 were asked)", e1.questions > main.questions && e1.sittings >= main.sittings, JSON.stringify([e1.questions, main.questions]));
  });

  // ---- P1-4 two levels for one skill ------------------------------------------------------------------------------------------
  await guard("p4", async () => {
    const { box, r } = fullRun(DOMAIN_PEOPLE.dm_p1.steps());
    const s = box.state;
    const rated = Object.entries(s.skills.ratings).filter(([, rt]) => rt.placeholder !== true);
    ok("P1-4: every rating the gap counts carries level_claimed, level_counted and capped (one record, two numbers, never one beside the other)", r.ok && rated.every(([, rt]) => typeof rt.level_counted === "number" && rt.level_claimed === rt.level && typeof rt.capped === "boolean"), JSON.stringify(rated.map(([k, rt]) => [k, rt.level, rt.level_counted, rt.capped])));
    const capped = rated.filter(([, rt]) => rt.capped);
    ok("P1-4: at least one self rating is above what is counted, and says so in the plain marker 'counted as N until you show a piece of work or pass a test'", capped.length > 0 && capped.every(([, rt]) => rt.level_counted < rt.level && /^counted as \d(\.\d+)? until you show a piece of work or pass a test$/.test(rt.cap_reason)), JSON.stringify(capped.map(([k, rt]) => [k, rt.level, rt.level_counted, rt.cap_reason])));
    const inv = invariantFindings(viewOf(s), { gapMapSource: readGapMap() }).filter((f) => f.n === 3);
    ok("P1-4: invariant 3 holds: no rating's counted level differs from the gap's current level for the competency it maps to", inv.length === 0, JSON.stringify(inv.map((f) => f.message)));
    const markers = (s.library.gaps || []).filter((x) => x.domain_competency && /counted as/.test(x.now || ""));
    ok("P1-4: the gap line carries the same marker for a capped competency", capped.length === 0 || markers.length > 0, JSON.stringify((s.library.gaps || []).slice(0, 2).map((x) => x.now)));
    const brief = buildBrief("cv", s, TODAY, 20);
    ok("P1-4: the brief reads the counted level too (the claimed one is never shown alone)", capped.length === 0 || (brief.ratings || []).some((x) => /counted as/.test(JSON.stringify(x))), JSON.stringify((brief.ratings || []).slice(0, 1)));
    const comp = (s.library.gaps || []).filter((x) => x.status !== "closed");
    ok("P1-4: no open gap says an employer 'needs this before you apply' or what 'every application' asks for without the model estimate label", comp.every((x) => !claimsHiringBar(`${x.why} ${x.title}`) || /model estimate|not sourced|researched rubric/.test(x.why)), JSON.stringify(comp.slice(0, 2).map((x) => x.why.slice(0, 100))));
    // a retarget rebuilds the counted level (it depends on the target): same person, a different target level
    const rt = tryAct(s, { type: "onboard.target", role: "Product designer", level: "senior" });
    const before = rated.map(([k, x]) => [k, x.level_counted].join(":")).join(",");
    const after = rt.s ? Object.entries(rt.s.skills.ratings).filter(([, x]) => x.placeholder !== true).map(([k, x]) => [k, x.level_counted].join(":")).join(",") : "";
    ok("P1-4: after a retarget the counted levels are rebuilt for the new target and still equal what the gap counts", !rt.err && before !== after && invariantFindings(viewOf(rt.s), { gapMapSource: readGapMap() }).filter((f) => f.n === 3).length === 0, rt.err || `${before} -> ${after}`);
  });

  // ---- P1-2 retarget with no interview shows the distance -----------------------------------------------------------------------
  await guard("p2", async () => {
    const dir = copyData("p6-target");
    // The person's live shape: no interview on file
    const live = structuredClone(skState); live.onboarding = { status: "not_started" };
    const t2 = tryAct(live, { type: "onboard.target", role: "Product designer", level: "lead", role_now: "Product designer", level_now: "mid" });
    const gp = t2.s && t2.s.profile.domain.gap_preview;
    ok("P1-2: onboard.target with no interview on file computes the gap (distance, evenings, top 3 gaps, blockers, basis, labels) and keeps it on profile.domain.gap_preview", !t2.err && gp && typeof gp.distance === "number" && typeof gp.evenings === "number" && gp.top_gaps.length === 3 && Array.isArray(gp.blockers) && gp.label === "model estimate" && /domain model/.test(gp.basis), t2.err || JSON.stringify(t2.s && t2.s.profile.domain));
    const b = buildBrief("status", t2.s, TODAY, 10);
    ok("P1-2: make-brief status carries domain_gap with the 'model estimate' label and the same distance (before: absent)", b.inputs && b.inputs.domain_gap && b.inputs.domain_gap.label === "model estimate" && b.inputs.domain_gap.distance === gp.distance, JSON.stringify(b.inputs && b.inputs.domain_gap && Object.keys(b.inputs.domain_gap)));
    const bp = buildBrief("plan", t2.s, TODAY, 10);
    ok("P1-2: make-brief plan carries it too", bp.inputs && bp.inputs.domain_gap && bp.inputs.domain_gap.evenings === gp.evenings);
    // 'Founding designer': his words are stored even when mapped
    const f1 = tryAct(live, { type: "onboard.target", role: "Founding designer", level: "lead", role_now: "Product designer", level_now: "mid" });
    ok("P1-2: an unknown role ('Founding designer') is refused with the exact step: closest launch role, his words as 'as', his confirmation", !!f1.err && /launch role as role/.test(f1.err) && /Founding designer/.test(f1.err) && /Nothing was changed/.test(f1.err), f1.err);
    const f2 = tryAct(live, { type: "onboard.target", role: "Product designer", as: "Founding designer", level: "lead", role_now: "Product designer", level_now: "mid" });
    ok("P1-2: his words (target_words) are stored with the launch role, so they are never lost", !f2.err && f2.s.profile.domain.target_words === "Founding designer" && f2.s.profile.domain.targets[0].role === "product_designer", f2.err || JSON.stringify(f2.s.profile.domain.target_words));
    // the read only script
    // The person's live shape WITH real ratings (not placeholders): a target with no interview rebuilds the counted levels too
    const devLive = structuredClone(fullRun(DOMAIN_PEOPLE.dm_p1.steps()).box.state);
    devLive.onboarding = { status: "not_started" };
    for (const rt of Object.values(devLive.skills.ratings)) { delete rt.level_counted; delete rt.level_claimed; delete rt.capped; delete rt.cap_reason; }
    delete devLive.profile.domain;
    const tl = tryAct(devLive, { type: "onboard.target", role: "Product designer", level: "lead", role_now: "Product designer", level_now: "mid" });
    const rts = tl.s ? Object.values(tl.s.skills.ratings).filter((x) => x.placeholder !== true) : [];
    ok("P1-4 on the person's live path: onboard.target with no interview gives every real rating its level_counted, capped and marker (before: only the preview was written)", !tl.err && rts.length > 0 && rts.every((x) => typeof x.level_counted === "number") && rts.some((x) => x.capped === true), tl.err || JSON.stringify(rts.slice(0, 2).map((x) => [x.level, x.level_counted, x.capped])));
    // the writer of the business blocker
    const bz = tryAct(live, { type: "onboard.target", role: "PR specialist", level: "lead", role_now: "PR specialist", level_now: "senior", setting: "freelance", clients_lined_up: 0 });
    const bz2 = bz.s ? tryAct(bz.s, { type: "onboard.target", role: "PR specialist", level: "lead", role_now: "PR specialist", level_now: "senior", setting: "freelance", clients_lined_up: 2 }) : null;
    const hv = (st) => { const g = gapFromProfile({ profile: st.profile, skills: st.skills, rubric: st.rubric }); const b = g && g.ok && g.result.blockers.find((x) => x.kind === "first_paid_client_or_pipeline"); return b ? b.have : "cleared"; };
    ok("P1-1: clients_lined_up (onboard.target) is the writer of the business blocker: 0 keeps it open at 0 of 1, 2 clears it", !bz.err && hv(bz.s) === 0 && bz2 && !bz2.err && hv(bz2.s) === "cleared", bz.err || (bz2 && bz2.err) || JSON.stringify([bz.s && hv(bz.s), bz2 && bz2.s && hv(bz2.s)]));
    // a second target at the SAME role and a higher level, through the target action on an interview copy
    const preSteps = DOMAIN_PEOPLE.dm_p4.steps();
    const preRun = fullRun(preSteps.slice(0, preSteps.findIndex((x) => x.a.type === "onboard.round" && x.a.complete === true)));
    const sq = tryAct(preRun.box.state, { type: "onboard.target", role: "Content marketer", level: "mid", second: "Growth lead", sequential: true, confirmed: true, quote: "yes, the closest is content marketer" });
    ok("P1-3 through onboard.target on an interview copy: the second target 'Growth lead' (same launch role, level L from the title) is kept, sequential, and the preview names it", !sq.err && sq.s.profile.domain.targets.length === 2 && sq.s.profile.domain.targets[1].level === "L" && sq.s.profile.domain.targets[1].sequential === true && sq.s.profile.domain.gap_preview.then.length === 1, sq.err || JSON.stringify(sq.s && sq.s.profile.domain.targets));
    const before = JSON.stringify(h.tree(dir));
    const cp = execFileSync(process.execPath, [path.join(h.APP, "scripts", "domain-gap.mjs"), "Product designer", "mid", "Product designer", "lead", "--json", "--data-dir", dir], { encoding: "utf8" });
    const pv = JSON.parse(cp);
    ok("P1-2: scripts/domain-gap.mjs prints the distance, evenings, top gaps and blockers, labelled, and writes nothing", pv.label === "model estimate" && typeof pv.distance === "number" && pv.top_gaps.length === 3 && pv.written === false && before === JSON.stringify(h.tree(dir)));
  });

  // ---- P1-1 a business target is not an employee ladder ----------------------------------------------------------------------------
  await guard("p1", async () => {
    const { box, r } = fullRun(DOMAIN_PEOPLE.dm_pr_consultancy.steps());
    const s = box.state;
    const dom = s.profile.domain;
    ok("P1-1 setup: the redundant PR manager reaches complete with a consultancy as his target", r.ok && s.onboarding.status === "complete" && dom.target_setting === "business", JSON.stringify(r.log.filter((l) => !l.ok).slice(0, 1)));
    const gaps = (s.library.gaps || []).filter((x) => x.status !== "closed");
    const BIZ = ["pricing", "selling", "pipeline", "contracting_admin", "business_positioning", "financial_runway"];
    ok("P1-1: pricing, selling, pipeline, contracts and admin, positioning and runway are competencies of the gap (before: none; the map was PR specialist lead only)", BIZ.every((c) => gaps.some((x) => x.domain_competency === c)), JSON.stringify(gaps.map((x) => x.domain_competency)));
    ok("P1-1: the business part is labelled model estimate and unverified, never sourced", gaps.filter((x) => BIZ.includes(x.domain_competency)).every((x) => /model estimate, not sourced/.test(x.why) && x.provisional === true), JSON.stringify(gaps.filter((x) => BIZ.includes(x.domain_competency)).map((x) => x.why.slice(0, 80))));
    ok("P1-1: the two business blockers are open: a first paid client or pipeline, and runway months", gaps.some((x) => x.proof_blocker === "first_paid_client_or_pipeline") && gaps.some((x) => x.proof_blocker === "runway_months"), JSON.stringify(gaps.filter((x) => x.proof_blocker).map((x) => x.proof_blocker)));
    const ids = (s.onboarding.derived.domain.tasks || []).map((x) => x.id);
    ok("P1-1: the first tasks are the three the business needs (3 priced offers, 5 client conversations, a one-page proposal)", ["TK-B01", "TK-B02", "TK-B03"].every((id) => ids.includes(id)), JSON.stringify(ids));
    ok("P1-1: T-03 was asked as 'your first paying client' and the timeline says so", /first paying client/.test(s.profile.north_star.timeline || ""), s.profile.north_star.timeline);
    const q = resolveQuestion("T-03");
    ok("P1-1: the T-03 text uses the {outcome} slot: 'an offer' for an employee, 'your first paying client' for a business", /\{outcome\}/.test(q.text) && OB.vocabOf({ profile: s.profile }, s.onboarding.answers).outcome === "your first paying client" && OB.vocabOf({ profile: skState.profile }, {}).outcome === undefined);
    const inv = invariantFindings(viewOf(s), { gapMapSource: readGapMap() });
    ok("P1-1: every invariant holds for the business target", inv.length === 0, JSON.stringify(inv.map((f) => f.message).slice(0, 2)));
    const stripped = structuredClone(s);
    stripped.profile.domain.target_setting = "employee";
    ok("P1-1: the same person read as an employee has no business competency or blocker (the overlay is the only difference)", !gapFromProfile({ profile: stripped.profile, skills: stripped.skills, rubric: stripped.rubric }).result.byCompetency.some((x) => BIZ.includes(x.competency)));
    const emp = fullRun(DOMAIN_PEOPLE.dm_p3.steps());
    ok("P1-1: an employee target (dm_p3) has no business competency and no business blocker", !(emp.box.state.library.gaps || []).some((x) => BIZ.includes(x.domain_competency) || x.proof_blocker === "runway_months"));
  });

  // ---- P1-3 a second target outside the launch roles ------------------------------------------------------------------------------
  await guard("p3", async () => {
    const { box, r } = fullRun(DOMAIN_PEOPLE.dm_social_perf.steps());
    const s = box.state;
    const dom = s.profile.domain;
    ok("P1-3 setup: the social media manager (performance marketer, then growth lead) reaches complete", r.ok && s.onboarding.status === "complete", JSON.stringify(r.log.filter((l) => !l.ok).slice(0, 1)));
    ok("P1-3: 'other: Growth lead' is mapped to the nearest launch role WITH confirmation and put on domain.targets at weight 0.5, sequential (before: accepted and unused)", dom.targets.length === 2 && dom.targets[1].weight === 0.5 && dom.targets[1].sequential === true && dom.targets[1].level === "L" && dom.second_words === "Growth lead", JSON.stringify(dom.targets));
    ok("P1-3: DM-06's level is stored beside the targets (target_level)", dom.target_level === "M", dom.target_level);
    const gaps = (s.library.gaps || []).filter((x) => x.status !== "closed" && x.domain_competency).map((x) => x.domain_competency);
    ok("P1-3: paid media and attribution competencies appear on the map (channel and media, measurement, growth)", ["channel_media", "measurement_eval", "growth_performance"].every((c) => gaps.includes(c)), JSON.stringify(gaps));
    const pv = dom.gap_preview;
    ok("P1-3: the preview names the 'then' target", pv && pv.then && pv.then.length === 1, JSON.stringify(pv && pv.then));
    // without confirmation it is not silently used
    const allSteps = DOMAIN_PEOPLE.dm_social_perf.steps();
    const pre = fullRun(allSteps.slice(0, allSteps.findIndex((x) => x.a.type === "onboard.round" && x.a.complete === true)));
    const unconf = structuredClone(pre.box.state);
    unconf.onboarding.answers["DM-04"] = { ...unconf.onboarding.answers["DM-04"], confirmed: false };
    const tr = tryAct(unconf, { type: "onboard.answer", id: "DM-04.f1", value: "after this one", meta: {} });
    const t = tr.s || unconf;
    const nt = OB.progress(t.onboarding, []).domain.note || "";
    ok("P1-3: an unconfirmed 'other' second role is not used: the note says it must be confirmed first", (t.profile.domain.targets || []).length === 1 && /not one of the launch roles/.test(nt), JSON.stringify([t.profile.domain.targets, nt]));
    const wr = tryAct(unconf, { type: "onboard.answer", id: "DM-04", value: "other: Chief vibes officer" });
    const w = wr.s || unconf;
    const note = OB.progress(w.onboarding, []).domain.note || "";
    ok("P1-3: a role that maps to nothing is saved as his words and the map says so", (w.profile.domain.targets || []).length === 1 && /saved as your words, not on the map/.test(note), note);
  });

  // ---- P2 -------------------------------------------------------------------------------------------------------------------------------
  await guard("p2b", async () => {
    let st = toR1(skState);
    st = act(st, { type: "onboard.answer", id: "DM-01", value: "marketing" });
    const field0 = st.profile.situation.field;
    st = act(st, { type: "onboard.answer", id: "DM-08", value: "pharmaceuticals" });
    ok("P2: DM-08 (industry) does not overwrite situation.field from R0-09 (the vocabulary of every later question)", st.profile.situation.field === field0 && st.profile.domain.industry_now === "pharmaceuticals", JSON.stringify([field0, st.profile.situation.field, st.profile.domain.industry_now]));
    let t = toR1(skState);
    t = act(t, { type: "onboard.answer", id: "DM-01", value: "marketing" });
    const r4 = structuredClone(t); r4.onboarding.round = "R4"; r4.onboarding.consent.R4 = TODAY;
    const a = act(r4, { type: "onboard.answer", id: "DM-47", value: 6 });
    ok("P2: DM-47 writes constraints.project_hours_per_week, and hours_per_week when B-18 and T-07 are not answered", a.profile.constraints.project_hours_per_week === 6 && a.profile.constraints.hours_per_week === 6, JSON.stringify(a.profile.constraints));
    const b = act(a, { type: "onboard.answer", id: "DM-50", value: "only with conditions" });
    ok("P2: DM-50 writes constraints.stay_rule unless P-03 already did", /only with conditions/.test(b.profile.constraints.stay_rule || ""), b.profile.constraints.stay_rule);
    const c = act(act(r4, { type: "onboard.answer", id: "P-03", value: "A lead title with a pay rise within a year" }), { type: "onboard.answer", id: "DM-50", value: "no" });
    ok("P2: DM-50 does not overwrite the stay rule P-03 gave", /lead title/.test(c.profile.constraints.stay_rule || ""), c.profile.constraints.stay_rule);
    // the brief lists only what the sitting will take
    const f = toR1(skState);
    f.onboarding = { ...f.onboarding, sitting: { ...f.onboarding.sitting, asked: f.onboarding.sitting.max } };
    const bf = buildBrief("onboarding", f, TODAY, 10);
    const nonR0 = (bf.next_questions || []).filter((x) => x.round && x.round !== "R0");
    ok("P2: with a full sitting the brief lists no new question the script would refuse ('This sitting is full'), says what it held back, and names the way on", nonR0.length === 0 && bf.sitting_full && bf.sitting_full.held_back.length > 0, JSON.stringify([nonR0.map((x) => x.id), bf.sitting_full]));
    const refused = tryAct(f, { type: "onboard.answer", id: bf.sitting_full ? bf.sitting_full.held_back[0] : "B-01", value: "Product designer at a startup" });
    ok("P2: and the script does refuse what the brief held back (the two agree)", !!refused.err && /sitting is full/i.test(refused.err), refused.err);
    // a plain reset shows no previous owner's facts at R0-04
    const withPrior = structuredClone(toR1(skState));
    withPrior.onboarding.round = "R0";
    withPrior.prior = { ...(withPrior.prior || {}), profile: { role_now: "Product designer", north_star: { role: "Lead designer" } } };
    const base = seq(withPrior, [{ type: "onboard.answer", id: "R0-01", value: "40" }, { type: "onboard.answer", id: "R0-02", value: "straight" }, { type: "onboard.answer", id: "R0-03", value: ["none"] }]);
    const plain = buildBrief("onboarding", base, TODAY, 20);
    ok("P2: with archived facts and no explicit same_person, R0-04 is NOT offered to a possible stranger", !(plain.next_questions || []).some((x) => x.id === "R0-04"));
    const same = structuredClone(base); same.prior.same_person = true;
    ok("P2: with same_person (--same-person at reset, his explicit yes) R0-04 is offered", (buildBrief("onboarding", same, TODAY, 20).next_questions || []).some((x) => x.id === "R0-04"));
    const diff = structuredClone(same); diff.prior.different_person = true;
    ok("P2: a different person is never shown the facts, even with a same_person flag left over", !(buildBrief("onboarding", diff, TODAY, 20).next_questions || []).some((x) => x.id === "R0-04"));
  });
}
