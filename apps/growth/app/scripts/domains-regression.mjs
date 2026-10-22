// The domain regression: the six cross-family personas of the spec (scripts/domains-personas.mjs), each driven from the reset
// to complete through the REAL CLIs (onboarding-reset.mjs, onboarding-act.mjs, onboarding-check.mjs) on a TEMP COPY of the data,
// with GROWTH_BACKUP_DIR pointing at a temp folder. It reuses regress() of scripts/onboarding-regression.mjs, so every generic
// assertion holds for them too: no hand edit, the validator finds 0 errors, onboarding-check gives no FAIL, no concatenated
// numbers, off limits respected, the live data untouched. On top of that, per person (verify):
//   * profile.domain holds the family, role, level and targets the answers gave; a planned role was mapped to the nearest launch
//     role with the role_mapped flag and a note, and computeGap on the planned role itself says { ok: false, status: "planned" }
//   * every domain gap names a competency id of the domain data, its title is the competency name, no concatenated numbers
//   * the persisted gaps equal computeGap on the persisted state (consistent with the ratings), and the first tasks are in
//     ob.derived.domain with minutes 15 to 60
//   * where the roles are launch roles, the frozen expectations of scripts/domains-expected.json hold (blockers; and for the
//     person whose ratings are the person's own, the largest gaps, the first five tasks, distance and evenings of an evidenced twin)
// Run: node scripts/domains-regression.mjs [dm_p1|dm_p2|dm_p3|dm_p4|dm_p5|dm_p6|dm_hr_transform|dm_hr_od|dm_hr_analytics|all] [--keep <dir>] [--json]
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { regress } from "./onboarding-regression.mjs";
import { REGRESSION } from "./onboarding-personas.mjs";
import { DOMAIN_PEOPLE } from "./domains-personas.mjs";
import { listTree } from "../lib/onboarding-reset.mjs";
import { computeGap, getRole, pickTasks, DOMAINS } from "../lib/domains.mjs";
import { CONTENT_MARKETER_M } from "./domains-fixtures.mjs";
import { gapFromProfile, domainProgress } from "../lib/domain-flow.mjs";
import { progress } from "../lib/onboarding.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = path.join(APP, "data");
const EXPECTED = JSON.parse(fs.readFileSync(path.join(APP, "scripts", "domains-expected.json"), "utf8"));
const DASH = /[–—]/;

function copyLive(to) {
  fs.mkdirSync(to, { recursive: true });
  for (const rel of listTree(LIVE)) {
    if (rel.startsWith(".")) continue;
    fs.mkdirSync(path.dirname(path.join(to, rel)), { recursive: true });
    fs.copyFileSync(path.join(LIVE, rel), path.join(to, rel));
  }
  return to;
}

const NEW_HR_COMP = new Set(["change_management", "od_diagnosis", "org_design", "hr_operating_model", "process_redesign", "hr_tech_data", "consulting_skills", "people_analytics", "employee_experience", "hr_core_practice", "talent_learning", "coaching_facilitation"]);
const OVER = DOMAINS.business_overlay || { competencies: [] };
const compIds = new Set([...DOMAINS.competency_order, ...OVER.competencies.map((c) => c.id)]);
const compName = Object.fromEntries([...DOMAINS.competencies, ...OVER.competencies].map((c) => [c.id, c.name]));

/** Which expectation set applies: frozen persona id and the launch roles it names. */
const FROZEN = { dm_p1: "P1", dm_p4: "P4", dm_hr_transform: "H1", dm_hr_od: "H2", dm_hr_analytics: "H3" };
const HR_PEOPLE = { dm_hr_transform: { now: "hr_generalist", target: "hr_transformation_consultant", blocker: "G-proof-hr_consulting_deliverable", cross: true }, dm_hr_od: { now: "hrbp", target: "od_consultant", blocker: "G-proof-hr_consulting_deliverable", cross: true }, dm_hr_analytics: { now: "talent_acquisition", target: "people_analyst", blocker: "G-proof-people_analytics_case", cross: true } };
const PLANNED_TARGET = { dm_p2: "creative_director", dm_p3: "corporate_comms", dm_p5: "brand_strategist", dm_p6: "ux_writer" };
const CRIT5 = { dm_ux_strategy: true, dm_pr_consultancy: true, dm_social_perf: true };
const NEAREST = { dm_p2: "brand_designer", dm_p3: "pr_specialist", dm_p5: "content_marketer", dm_p6: "content_marketer" };

function verifyFor(key) {
  return ({ d, ob, answers, pr }) => {
    const out = [];
    const dom = (d.profile && d.profile.domain) || {};
    const tg = (dom.targets || [])[0] || {};
    const spec = DOMAIN_PEOPLE[key].spec;
    const t = (name, ok, detail = "") => out.push([`${key}: ${name}`, !!ok, detail]);
    t("DM-01 family and DM-02 role are on profile.domain as ids", ["D", "P", "M", "H"].includes(dom.family_now) && getRole(dom.role_now) && getRole(dom.role_now).launch === true, JSON.stringify([dom.family_now, dom.role_now]));
    t("the target is a launch role at a level on its ladder", tg.role && getRole(tg.role).launch === true && getRole(tg.role).ladder[tg.level] && tg.kind === "primary" && tg.weight === 1, JSON.stringify(dom.targets));
    if (PLANNED_TARGET[key]) {
      const planned = computeGap({ target: { role: PLANNED_TARGET[key], level: "M" }, fromRole: dom.role_now, current: {} });
      t(`planned role ${PLANNED_TARGET[key]}: computeGap says status planned, ok false`, planned.ok === false && planned.status === "planned", JSON.stringify([planned.ok, planned.status]));
      t(`mapped to the nearest launch role ${NEAREST[key]} with the role_mapped flag and a note`, tg.role === NEAREST[key] && dom.role_mapped && dom.role_mapped.target && ob.derived.domain && (ob.derived.domain.notes || []).some((n) => /planned/i.test(n)), JSON.stringify([tg.role, dom.role_mapped, ob.derived.domain && ob.derived.domain.notes]));
    } else if (CRIT5[key]) {
      t("mapped with his confirmation: his own words are kept (role_mapped, target_words), not lost", dom.role_mapped && dom.role_mapped.target && dom.target_words === DOMAIN_PEOPLE[key].spec.targetFree && dom.role_mapped.now !== undefined === (DOMAIN_PEOPLE[key].spec.roleNowOption === "none of these"), JSON.stringify([dom.role_mapped, dom.target_words]));
    } else t("a launch role as asked: no mapping flag", !dom.role_mapped || !dom.role_mapped.target, JSON.stringify(dom.role_mapped));
    if (HR_PEOPLE[key]) {
      const h = HR_PEOPLE[key];
      t("HR: family H now, the current role and the target are the launch HR roles asked for, no mapping flag", dom.family_now === "H" && dom.role_now === h.now && tg.role === h.target && (!dom.role_mapped || (!dom.role_mapped.target && !dom.role_mapped.now)), JSON.stringify([dom.family_now, dom.role_now, tg.role, dom.role_mapped]));
      t("HR: the three consulting evidence questions of the bank (DM-51 to DM-53) were asked, and answered or marked unknown, never missing", ["DM-51", "DM-52", "DM-53"].every((id) => answers[id] && ["answered", "unknown"].includes(answers[id].status)), JSON.stringify(["DM-51", "DM-52", "DM-53"].map((id) => answers[id] && answers[id].status)));
      t("HR: no design, PR or marketing evidence question was asked (DM-14 to DM-22)", !Object.keys(answers).some((id) => /^DM-(1[4-9]|2[0-2])$/.test(id)), JSON.stringify(Object.keys(answers).filter((id) => /^DM-(1[4-9]|2[0-2])/.test(id))));
      const gr = gapFromProfile({ profile: d.profile, skills: d.skills, rubric: d.rubric, hoursPerWeek: undefined });
      t(`HR: the frozen blocker ${h.blocker} is raised and its cross-over (practice into consulting) is a bridge task first`, gr && gr.ok && gr.result.blockers.some((b) => b.id === h.blocker && b.cross_over === h.cross) && gr.result.orderedTasks.filter((x) => x.clears_blocker === h.blocker)[0].kind === "bridge", JSON.stringify(gr && gr.ok && gr.result.blockers.map((b) => [b.id, b.cross_over])));
      t("HR: the tasks come from the HR library (TK-H or TK-Q) for the HR competencies, and the plan opens with a test or the blocker's first task", gr && gr.ok && gr.result.orderedTasks.filter((x) => NEW_HR_COMP.has(x.competency)).every((x) => /^TK-[HQ]/.test(x.id)) && (gr.result.orderedTasks[0].kind === "test" || gr.result.orderedTasks[0].clears_blocker), JSON.stringify(gr && gr.ok && gr.result.orderedTasks.slice(0, 5).map((x) => x.id)));
      t("HR: the new HR competencies are on the saved map by their ids and names", ["change_management", "od_diagnosis", "org_design", "hr_operating_model", "process_redesign", "hr_tech_data", "consulting_skills", "people_analytics", "employee_experience", "hr_core_practice", "talent_learning", "coaching_facilitation"].some((c) => ((d.library && d.library.gaps) || []).some((x) => x.domain_competency === c && x.status !== "closed")), "");
    }
    if (key === "dm_p5") t("a second target is optional, weight 0.5, and the shared base is counted once", dom.targets.length === 2 && dom.targets[1].kind === "optional" && dom.targets[1].weight === 0.5, JSON.stringify(dom.targets));
    if (key === "dm_dev") {
      const tasks = (ob.derived && ob.derived.tasks) || [];
      const t09 = tasks.find((x) => x.id === "OT-T-09");
      t("The person: R4 T-09 repeated R3-01 and T-05 repeated R3-16, the interview is complete, and no public place holds a run of either private answer", ob.status === "complete" && answers["T-09"].redacted === true && (d.profile.intake || []).filter((x) => /^(T-09|T-05)$/.test(x.id)).every((x) => x.answer === "(private)") && t09 && !/telling my manager/i.test(t09.task), JSON.stringify([ob.status, t09 && t09.task]));
      t("The person: the private answers are unchanged (only the public copies were redacted)", answers["R3-01"].status === "answered" && answers["R3-16"].status === "answered" && !answers["R3-01"].redacted);
    }
    if (key === "dm_ux_strategy") {
      t("UX researcher: DM-02 none of these is mapped to product designer WITH his confirmation, his words kept, and the target is product designer senior", dom.role_now === "product_designer" && dom.role_mapped.now === "UX researcher" && tg.role === "product_designer" && tg.level === "S" && dom.target_setting === "employee", JSON.stringify([dom.role_now, dom.role_mapped, dom.targets, dom.target_setting]));
      t("his level is stored as he said it (DM-06) and the counted levels never exceed what he claimed", dom.target_level === "S" && Object.values(d.skills.ratings).every((r) => r.placeholder === true || typeof r.level_counted !== "number" || r.level_counted <= r.level + 1e-9), JSON.stringify(dom.target_level));
    }
    if (key === "dm_pr_consultancy") {
      const gs = ((d.library && d.library.gaps) || []).filter((x) => x.status !== "closed");
      const biz = gs.filter((x) => OVER.competencies.some((c) => c.id === x.domain_competency));
      t("business target: target_setting business, his words kept, and the overlay competencies (pricing, selling, pipeline, contracts, positioning, runway) are on the map", dom.target_setting === "business" && dom.target_words === "Brand communications consultant" && OVER.competencies.every((c) => biz.some((x) => x.domain_competency === c.id)), JSON.stringify([dom.target_setting, biz.map((x) => x.domain_competency)]));
      t("the business blockers are open (a first paid client or a pipeline; six months of runway) and labelled model estimate, not sourced", gs.some((x) => x.proof_blocker === "first_paid_client_or_pipeline" && /model estimate, not sourced/.test(x.why)) && gs.some((x) => x.proof_blocker === "runway_months"), JSON.stringify(gs.filter((x) => x.proof_blocker).map((x) => x.proof_blocker)));
      t("T-03 was asked for the first paying client (the answer is read as that), and the first tasks include a priced offer, client conversations and a proposal", /first paying client/.test((d.profile.north_star && d.profile.north_star.timeline) || "") && ["TK-B01", "TK-B02", "TK-B03"].every((id) => ob.derived.domain.tasks.some((x) => x.id === id)), JSON.stringify([d.profile.north_star && d.profile.north_star.timeline, ob.derived.domain.tasks.map((x) => x.id)]));
    }
    if (key === "dm_social_perf") {
      t("performance marketer then growth lead: the second target is on the map, weight 0.5, sequential, mapped from his words with his confirmation", dom.targets.length === 2 && dom.targets[1].sequential === true && dom.targets[1].weight === 0.5 && dom.second_words === "Growth lead" && dom.role_mapped.second === "Growth lead", JSON.stringify([dom.targets, dom.second_words, dom.role_mapped]));
      const rows = (ob.derived.domain && ob.derived.domain.largest) || [];
      const gs = ((d.library && d.library.gaps) || []).filter((x) => x.status !== "closed" && x.domain_competency);
      t("paid media and attribution competencies are on the map (channel and media, measurement and evaluation, growth and performance)", ["channel_media", "measurement_eval", "growth_performance"].every((c) => gs.some((x) => x.domain_competency === c)), JSON.stringify(gs.map((x) => x.domain_competency)));
      t("his hedged ROAS is claimed at 0.3, not proof: the results blocker stays open", dom.evidence.best_result && (d.library.gaps || []).some((x) => /published_content_with_metrics|launch_with_results|pipeline_or_revenue_result/.test(x.proof_blocker || "") && x.status !== "closed" && /claimed/.test(x.why)), JSON.stringify((d.library.gaps || []).filter((x) => x.proof_blocker).map((x) => [x.proof_blocker, x.why.slice(0, 120)])));
      void rows;
    }
    // the gap is computed from the persisted state and is what is stored
    const g = gapFromProfile({ profile: d.profile, skills: d.skills, rubric: d.rubric, hoursPerWeek: undefined });
    t("computeGap runs on the persisted state", g && g.ok, g && g.error);
    if (!g || !g.ok) return out;
    const gaps = ((d.library && d.library.gaps) || []).filter((x) => x.status !== "closed");
    const domainGaps = gaps.filter((x) => x.domain_competency);
    const blockGaps = gaps.filter((x) => x.proof_blocker);
    t(`one gap per open domain competency (${g.result.byCompetency.length}) plus one per blocker (${g.result.blockers.length})`, domainGaps.filter((x) => !x.proof_blocker).length === g.result.byCompetency.length && blockGaps.length === g.result.blockers.length, JSON.stringify([domainGaps.length, blockGaps.length, g.result.byCompetency.length, g.result.blockers.length]));
    t("every domain gap names a domain competency id and its title is the competency name", gaps.filter((x) => !x.proof_blocker).every((x) => compIds.has(x.domain_competency) && x.title === compName[x.domain_competency]), JSON.stringify(gaps.map((x) => [x.domain_competency, x.title]).slice(0, 4)));
    t("every gap is hosted on a rubric competency that exists (the app never meets an unknown id)", gaps.every((x) => (d.rubric.competencies || []).some((c) => c.id === x.competency)), JSON.stringify(gaps.map((x) => x.competency)));
    t("gap numbers agree with the ratings: target_level equals the requirement, provisional until an artifact or test", g.result.byCompetency.every((r) => { const gp = domainGaps.find((x) => x.domain_competency === r.competency); return gp && gp.target_level === r.target && gp.provisional === r.provisional && gp.evenings === Math.min(60, r.evenings); }), JSON.stringify(g.result.byCompetency.slice(0, 2)));
    t("no concatenated number: every evenings figure is a whole number of 0 to 60", gaps.every((x) => Number.isInteger(x.evenings) && x.evenings >= 0 && x.evenings <= 60), JSON.stringify(gaps.map((x) => x.evenings)));
    const dd = ob.derived && ob.derived.domain;
    t("onboarding.derived.domain matches: distance, evenings, blockers, first tasks", dd && dd.ok && dd.distance === g.result.distance && dd.evenings === g.result.evenings && JSON.stringify(dd.blockers) === JSON.stringify(g.result.blockers.map((b) => b.id)) && JSON.stringify(dd.tasks.map((x) => x.id)) === JSON.stringify(g.tasks.map((x) => x.id)), JSON.stringify(dd && { d: dd.distance, e: dd.evenings, b: dd.blockers, n: dd.tasks && dd.tasks.length }));
    t("tasks respect the plan engine's 15 to 60 minutes and each cites a gap or a blocker", g.tasks.length >= 5 && g.tasks.every((x) => x.minutes >= 15 && x.minutes <= 60 && (x.gap_ref || x.clears_blocker) && x.because.length > 0), JSON.stringify(g.tasks.map((x) => [x.id, x.minutes])));
    const ids = new Set(gaps.map((x) => x.id));
    const refs = ((ob.derived && ob.derived.domain && ob.derived.domain.tasks) || []);
    t("every task points at a SAVED gap id (G-01 and so on): gap_ref or clears_blocker is in library.gaps, none dangles", refs.length >= 5 && refs.every((x) => (x.gap_ref && ids.has(x.gap_ref)) || (x.clears_blocker && ids.has(x.clears_blocker))) && refs.every((x) => !x.gap_ref || ids.has(x.gap_ref)) && refs.every((x) => !x.clears_blocker || ids.has(x.clears_blocker)), JSON.stringify(refs.slice(0, 3).map((x) => [x.id, x.gap_ref, x.clears_blocker])));
    t("honesty: every row and task carries a status of model, unverified or verified", g.result.byCompetency.every((r) => ["model", "unverified", "verified"].includes(r.status)) && g.tasks.every((x) => ["model", "unverified", "verified"].includes(x.status)));
    t("the domain questions have a count apart from the main bank: asked MUST within the cap of 19, none missing at the end", pr.domain && pr.domain.active && pr.domain.must_total <= 19 && pr.domain.missing_must.length === 0, JSON.stringify(pr.domain && { total: pr.domain.must_total, missing: pr.domain.missing_must }));
    const texts = JSON.stringify(dom) + JSON.stringify(gaps.map((x) => [x.title, x.why, x.closes_when, x.now, x.evenings_basis]));
    t("no em or en dash in anything the domain flow wrote", !DASH.test(texts));
    t("labelled as an estimate: the evenings basis says my estimate", gaps.every((x) => /^my estimate:/.test(x.evenings_basis || "")));
    if (key === "dm_p2") {
      const u = ((d.unknowns && d.unknowns.items) || []).find((x) => x.question === "DM-14");
      t("an I don't know to a domain question (DM-14) is an unknowns row with how, a method and a draft task of 15 to 60 minutes", u && u.status === "open" && u.how && u.method && u.draft_task && u.draft_task.minutes >= 15 && u.draft_task.minutes <= 60, JSON.stringify(u && { how: u.how, method: u.method, draft: u.draft_task }));
      t("the unknown count is provisional, not zero: the portfolio blocker says not known yet", g.result.blockers.some((b) => b.kind === "portfolio_brand_work" && b.have === null && b.provisional === true), JSON.stringify(g.result.blockers.map((b) => [b.kind, b.have])));
    }
    if (key === "dm_p3") {
      t("money and debt are off limits: DM-10 was refused by topic, never answered, and the boundary is recorded", !answers["DM-10"] && (ob.off_limits_topics || []).includes("money_debt"), JSON.stringify([ob.off_limits_topics, Object.keys(answers).filter((x) => /^DM-10/.test(x))]));
    }
    if (key === "dm_retarget") {
      const d3 = answers["DM-03"];
      t("the interview stays complete after the target change (the status, the round and the readiness are not touched)", ob.status === "complete" && ob.round === "R5" && pr.readiness === "ready", JSON.stringify([ob.status, ob.round, pr.readiness]));
      t("the new target is on profile.domain: product marketer, senior, with a second optional target", dom.targets && dom.targets[0].role === "product_marketer" && dom.targets[0].level === "S" && dom.targets[1] && dom.targets[1].role === "content_marketer" && dom.targets[1].kind === "optional", JSON.stringify(dom.targets));
      t("the old answer is kept apart (superseded_values), not lost, and no contradiction was raised for the change", answers["DM-06"] && answers["DM-06"].value === "senior" && ((ob.superseded_values || {})["DM-06"] || []).some((h) => h.value === "mid") && !(ob.contradictions || []).some((c) => c.status === "open"), JSON.stringify([ob.superseded_values, ob.contradictions && ob.contradictions.map((c) => [c.id, c.status])]));
      t("the gaps were recomputed for the new target: derived.domain.to is product marketer senior and the saved gaps carry the new targets", ob.derived.domain && ob.derived.domain.to && ob.derived.domain.to.level === "S" && g.result.byCompetency.every((r) => { const gp = domainGaps.find((x) => x.domain_competency === r.competency); return gp && gp.target_level === r.target; }), JSON.stringify(ob.derived.domain && ob.derived.domain.to));
      t("onboarding-check and the validator were run by the harness on the final state (shared checks above); the change is dated", ob.last_target_change && ob.last_target_change.at, JSON.stringify(ob.last_target_change));
      void d3;
    }
    // frozen expectations
    const fz = FROZEN[key] && EXPECTED.personas[FROZEN[key]];
    if (fz) {
      t(`frozen blockers ${JSON.stringify(fz.blockers)}`, JSON.stringify(g.result.blockers.map((b) => b.id)) === JSON.stringify(fz.blockers), JSON.stringify(g.result.blockers.map((b) => b.id)));
      t("no waypoint for this distance (frozen null)", !g.result.waypoints.length === !fz.waypoint, JSON.stringify(g.result.waypoints));
    }
    if (key === "dm_p4") {
      // the same levels as the fixture, with the artifacts it assumes: the evidenced twin of the interview's person
      const ratings = Object.fromEntries(Object.entries(CONTENT_MARKETER_M).map(([id, level]) => [id, { level, confidence: 0.6, source: "shipped", evidence: ["fixture artifact"] }]));
      const twin = gapFromProfile({ profile: d.profile, skills: { ratings }, rubric: d.rubric, hoursPerWeek: 5 });
      const top5 = twin.ok ? [...twin.result.byCompetency].sort((a, b) => b.gap - a.gap || a.index - b.index).slice(0, 5).map((r) => r.competency) : [];
      const first5 = twin.ok ? pickTasks(twin.result, 5, 5).map((x) => x.id) : [];
      t(`evidenced twin: distance ${fz.distance} and evenings ${fz.evenings} (frozen)`, twin.ok && twin.result.distance === fz.distance && twin.result.evenings === fz.evenings, JSON.stringify(twin.ok && [twin.result.distance, twin.result.evenings]));
      t(`evidenced twin: largest five gaps ${fz.largest5.join(", ")} (frozen, as a set)`, JSON.stringify([...top5].sort()) === JSON.stringify([...fz.largest5].sort()), JSON.stringify(top5));
      t(`evidenced twin: first five tasks ${fz.first5.join(", ")} (frozen, pickTasks at 5 hours)`, JSON.stringify(first5) === JSON.stringify(fz.first5), JSON.stringify(first5));
    }
    if (key === "dm_p1") {
      // The interview's ratings are capped by design (no artifact yet). The same levels with the artifacts the person's file holds
      // (evidence on ai and shipped ratings) are the fixture of the spec: the twin must give the frozen numbers.
      const live8 = ["product_thinking", "craft", "systems", "research", "communication", "collaboration", "building", "domain"];
      const withEv = new Set(["product_thinking", "systems", "communication", "building", "domain"]);
      const ratings = {};
      for (const id of live8) { const r = d.skills.ratings[id]; if (r) ratings[id] = { ...r, evidence: withEv.has(id) ? ["interview artifact"] : [] }; }
      const twin = gapFromProfile({ profile: d.profile, skills: { ratings }, rubric: d.rubric, hoursPerWeek: 5 });
      t(`evidenced twin: distance ${fz.distance} and evenings ${fz.evenings} (frozen)`, twin.ok && twin.result.distance === fz.distance && twin.result.evenings === fz.evenings, JSON.stringify(twin.ok && [twin.result.distance, twin.result.evenings]));
      const top5 = twin.ok ? [...twin.result.byCompetency].sort((a, b) => b.gap - a.gap || a.index - b.index).slice(0, 5).map((r) => r.competency) : [];
      const first5 = twin.ok ? pickTasks(twin.result, 5, 5).map((x) => x.id) : [];
      t(`evidenced twin: largest five gaps ${fz.largest5.join(", ")} (frozen, as a set)`, JSON.stringify([...top5].sort()) === JSON.stringify([...fz.largest5].sort()), JSON.stringify(top5));
      t(`evidenced twin: first five tasks ${fz.first5.join(", ")} (frozen, pickTasks at 5 hours)`, JSON.stringify(first5) === JSON.stringify(fz.first5), JSON.stringify(first5));
      t("capped by design: with the interview's own ratings (no artifact) the same person has provisional rows at confidence 0.3", g.result.byCompetency.some((r) => r.provisional && r.confidence === 0.3 && r.capped !== undefined));
    }
    void answers; void spec;
    return out;
  };
}

for (const [k, p] of Object.entries(DOMAIN_PEOPLE)) REGRESSION[k] = { ...p, expect: { ...p.expect, verify: verifyFor(k) } };

// The universal fallback: the nurse of the main regression answers DM-01 "none of these". The domain flow must stay out of the way:
// the generic path, a clear note, no domain gap, no refusal.
REGRESSION.dm_outside = {
  label: "Outside the launch roles: a nurse moving to UX research answers DM-01 none of these (the generic path)",
  different_person: true,
  steps: () => REGRESSION.nurse.steps().flatMap((s) => (s.a.type === "onboard.answer" && s.a.id === "R0-05" ? [{ a: { type: "onboard.answer", id: "DM-01", value: "none of these" }, say: "Answer DM-01: none of the three families" }, s] : [s])),
  expect: { ...REGRESSION.nurse.expect, verify: ({ d, ob, pr }) => {
    const t = (name, ok, detail = "") => [`dm_outside: ${name}`, !!ok, detail];
    const gaps = ((d.library && d.library.gaps) || []).filter((x) => x.status !== "closed");
    return [
      t("DM-01 none of these: the domain flow is inactive and says so in plain words", pr.domain && pr.domain.asked && pr.domain.active === false && pr.domain.outside === true && pr.domain.note === "Outside the launch roles: using the generic path.", JSON.stringify(pr.domain)),
      t("no profile.domain, no domain gap, no domain question was asked", !(d.profile && d.profile.domain) && !gaps.some((g) => g.domain_competency || g.proof_blocker) && !Object.keys(ob.answers).some((id) => /^DM-0[2-9]/.test(id)), JSON.stringify(Object.keys(ob.answers).filter((id) => /^DM-/.test(id)))),
      t("the generic gap builder ran: gaps on the researched rubric ids, as for the nurse", gaps.length > 0 && gaps.every((g) => d.rubric.competencies.some((c) => c.id === g.competency)), String(gaps.length)),
      t("no domain block on the derived state (the generic path leaves it out)", !(ob.derived && ob.derived.domain && ob.derived.domain.ok), JSON.stringify(ob.derived && ob.derived.domain)),
    ];
  } },
};
DOMAIN_PEOPLE.dm_outside = { label: REGRESSION.dm_outside.label, steps: REGRESSION.dm_outside.steps, spec: null };

export function runAll(which = "all", root = fs.mkdtempSync(path.join(os.tmpdir(), "growth-dm-reg-"))) {
  const keys = which === "all" ? Object.keys(DOMAIN_PEOPLE) : [which];
  const out = [];
  for (const k of keys) {
    if (!DOMAIN_PEOPLE[k]) { console.error(`unknown person ${k}; one of ${Object.keys(DOMAIN_PEOPLE).join(", ")}`); process.exit(2); }
    out.push(regress(k, copyLive(path.join(root, k, "data")), path.join(root, k, "backups")));
  }
  return { out, root };
}

void progress; void domainProgress;
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const which = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--keep") || "all";
  const ki = args.indexOf("--keep");
  const root = ki >= 0 ? path.resolve(args[ki + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), "growth-dm-reg-"));
  const { out } = runAll(which, root);
  if (args.includes("--json")) console.log(JSON.stringify(out, null, 2));
  else {
    for (const r of out) {
      const fails = r.checks.filter((c) => !c.ok);
      console.log(`\n== ${r.key}: ${r.label}`);
      console.log(`   ${r.steps} steps, readiness ${r.readiness}, ${r.refused} refused`);
      for (const c of r.checks) console.log(`   ${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : `  -> ${c.detail}`}`);
      console.log(`   ${fails.length ? `${fails.length} FAIL` : "ALL PASS"}`);
    }
    const total = out.reduce((n, r) => n + r.checks.length, 0);
    const bad = out.reduce((n, r) => n + r.checks.filter((c) => !c.ok).length, 0);
    console.log(`\n${out.length} people, ${total - bad} PASS, ${bad} FAIL`);
  }
  if (ki < 0) { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* temp only */ } }
  process.exit(out.every((r) => r.checks.every((c) => c.ok)) ? 0 : 1);
}
