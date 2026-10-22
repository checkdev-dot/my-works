// Unit checks for the domain flow (lib/domain-flow.mjs) and its wiring: selection, the outside-the-launch fallback, the
// confirmation rule, dual targets, the cap of 19, off limits, the quick path, and the validator rules (additive, strict).
// Pure: no files are written. Run: node scripts/domains-flow-check.mjs   (npm run domains:flow)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { domainSelection, domainProgress, sameIndustryOf, gapFromProfile, domainGapEntries, domainRubricFor, domainLevelProblem, domainLevelOptions, taskRef, gapIdIndex, DOMAIN_MUST_CAP, DOMAIN_MINIMUM_VIABLE, OUTSIDE_NOTE } from "../lib/domain-flow.mjs";
import { applyOnboardingAction } from "../lib/onboarding-actions.mjs";
import { DOMAIN_BANK } from "../lib/domain-bank.mjs";
import { validate } from "../lib/validate.mjs";
import { progress } from "../lib/onboarding.mjs";
import { resolveQuestion, planSittings, BANK } from "../lib/onboarding-bank.mjs";
import { FILES, OPTIONAL_FILES } from "../lib/validate.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fails = [];
const ok = (name, cond, detail = "") => { if (cond) pass += 1; else fails.push(`${name}${detail ? ` -> ${detail}` : ""}`); };
const A = (value, extra = {}) => ({ status: "answered", value, raw: String(value), ...extra });

// ---- selection ---------------------------------------------------------------------------------------------------------
{
  const none = domainSelection({});
  ok("nothing answered: not asked, no family", none.asked === false && none.family_now === null);
  const out = domainSelection({ "DM-01": A("none of these") });
  ok("none of these: outside the launch roles, with the plain note", out.asked && out.outside && out.notes[0] === OUTSIDE_NOTE && out.targets.length === 0);
  const prOut = domainProgress({ answers: { "DM-01": A("none of these") }, round: "R1" });
  ok("none of these: domain flow inactive, nothing is asked, the note is shown", prOut.active === false && prOut.note === OUTSIDE_NOTE && prOut.next_ids.length === 0);
  const base = { "DM-01": A("design"), "DM-02": A("Product designer"), "DM-05": A("mid"), "DM-03": A("Product designer"), "DM-06": A("lead") };
  const s1 = domainSelection(base);
  ok("a launch role as asked: ids, levels, one primary target at weight 1", s1.family_now === "D" && s1.role_now === "product_designer" && s1.level_now === "M" && s1.targets.length === 1 && s1.targets[0].level === "L" && s1.targets[0].weight === 1 && s1.targets[0].kind === "primary");
  // other role: a mapping needs his confirmation
  const unconf = domainSelection({ ...base, "DM-03": A("a role not listed", { meta: { role: "creative_director" } }), "DM-03.f1": A("Creative director") });
  ok("a role not listed is NOT used until he confirms the mapping", unconf.targets.length === 0 && unconf.notes.some((n) => /confirm that Brand designer is the closest/.test(n)), JSON.stringify(unconf.notes));
  const conf = domainSelection({ ...base, "DM-03": A("a role not listed", { meta: { role: "creative_director" }, confirmed: true }), "DM-03.f1": A("Creative director") });
  ok("confirmed: mapped to the nearest launch role with the role_mapped flag and a planned-role note", conf.targets[0] && conf.targets[0].role === "brand_designer" && conf.role_mapped.target === "Creative director" && conf.notes.some((n) => /planned/.test(n)), JSON.stringify(conf));
  const unknownRole = domainSelection({ ...base, "DM-03": A("a role not listed", { confirmed: true }), "DM-03.f1": A("Underwater welder") });
  ok("a role with no mapping at all: outside the launch roles, the generic path", unknownRole.targets.length === 0 && unknownRole.outside === true, JSON.stringify(unknownRole));
  // dual targets
  const dual = domainSelection({ ...base, "DM-04": A("Brand designer") });
  ok("a second role is an optional target at weight 0.5", dual.targets.length === 2 && dual.targets[1].kind === "optional" && dual.targets[1].weight === 0.5 && dual.targets[1].role === "brand_designer");
  const none2 = domainSelection({ ...base, "DM-04": A("none") });
  ok("DM-04 none adds no target", none2.targets.length === 1);
  // same industry is derived, never asked
  ok("same industry from DM-08 and its follow-up", sameIndustryOf({ "DM-08": A("Fintech"), "DM-08.f1": A("fintech") }) === true && sameIndustryOf({ "DM-08": A("Fintech"), "DM-08.f1": A("Health") }) === false && sameIndustryOf({ "DM-08": A("Fintech") }) === undefined);
  ok("no DM question asks for same_industry directly", !DOMAIN_BANK.some((q) => /same industry/i.test(q.text)));
}

// ---- questions: cap, family rules, off limits, quick path, depth -----------------------------------------------------------
{
  const worst = { "DM-01": A("design"), "DM-02": A("Product designer"), "DM-05": A("mid"), "DM-03": A("Content marketer"), "DM-06": A("lead") };
  const dp = domainProgress({ answers: worst, round: "R1" });
  ok(`the heaviest person (design to marketing) has at most ${DOMAIN_MUST_CAP} domain MUST`, dp.active && dp.must_total <= DOMAIN_MUST_CAP && dp.cap_ok, String(dp.must_total));
  ok("a designer moving to marketing is asked both family evidence questions (spec 6.3 step 3)", ["DM-14", "DM-20"].every((id) => dp.missing_must.includes(id)));
  const designerOnly = domainProgress({ answers: { ...worst, "DM-03": A("Product designer") }, round: "R1" });
  ok("a designer staying in design is not asked the PR or marketing evidence questions", !designerOnly.missing_must.some((id) => ["DM-17", "DM-19", "DM-20", "DM-22"].includes(id)) && designerOnly.missing_must.includes("DM-14"));
  const off = domainProgress({ answers: worst, round: "R1", off_limits: ["DM-11"], off_limits_topics: ["money_debt"] });
  ok("a ruled-out question is covered, not asked", !off.missing_must.includes("DM-11") && !off.optional_ids.includes("DM-10"));
  const quick = domainProgress({ answers: worst, round: "R1", depth: "quick" });
  ok("quick depth asks only the minimum viable domain questions", quick.missing_must.every((id) => DOMAIN_MINIMUM_VIABLE.includes(id)) && quick.optional_ids.length === 0, JSON.stringify(quick.missing_must));
  const sk = domainProgress({ answers: worst, round: "R1", skipped: { "DM-11": { count: 1 } } });
  ok("a skipped question is not offered again in the same sitting", !sk.pending.includes("DM-11"));
  // the sitting plan counts both banks and the main bank is unchanged
  const ids = [...BANK.filter((q) => q.must).map((q) => q.id), ...DOMAIN_BANK.filter((q) => q.must).map((q) => q.id)];
  const plan = planSittings(ids);
  ok("both banks planned together: no sitting over 7 and at most 45 minutes", plan.every((s) => s.weight <= 7 && s.est_min <= 45));
  ok("main bank MUST cap untouched: 48", BANK.filter((q) => q.must).length === 48);
  // progress() of the main bank for a person who never answered DM-01 is unchanged and shows the offer
  const pr = progress({ status: "in_progress", round: "R0", answers: {}, sitting: { n: 1, asked: 0, max: 6 }, consent: {} }, []);
  ok("progress(): a person who never answered DM-01 sees DM-01 offered apart, main numbers untouched", pr.domain && pr.domain.pending[0] === "DM-01" && !pr.next_ids.includes("DM-01") && pr.must_total === 48, `${pr.must_total}`);
  ok("every DM id resolves (the answer action accepts it)", DOMAIN_BANK.every((q) => resolveQuestion(q.id)) && resolveQuestion("DM-03.f1") && resolveQuestion("DM-03.f1").follow_of === "DM-03");
}

// ---- levels: only the steps a role has -------------------------------------------------------------------------------------
{
  const pr = { "DM-01": A("PR and communications"), "DM-02": A("PR specialist"), "DM-05": A("mid"), "DM-03": A("PR specialist") };
  ok("a PR target is never offered head (the ladder has no step)", !domainLevelOptions(pr, "DM-06").options.includes("head") && domainLevelOptions(pr, "DM-06").options.join(",") === "junior,mid,senior,lead");
  ok("the brief shows the ladder: a title and a scope for every offered step", domainLevelOptions(pr, "DM-06").ladder.every((x) => x.title && x.scope));
  ok("answering head to a PR target is refused with the steps that exist", /no head step/.test(domainLevelProblem(pr, "DM-06", "head") || "") && /junior, mid, senior, lead/.test(domainLevelProblem(pr, "DM-06", "head") || ""), String(domainLevelProblem(pr, "DM-06", "head")));
  ok("lead is fine for PR and head is fine for a designer", domainLevelProblem(pr, "DM-06", "lead") === null && domainLevelProblem({ ...pr, "DM-03": A("Product designer") }, "DM-06", "head") === null);
  const sel = domainSelection({ ...pr, "DM-06": A("head") });
  ok("an unusable level never becomes a target (the validator would reject it)", sel.targets.length === 0 && sel.notes.some((n) => /no head step/.test(n)));
}

// ---- onboard.target: any time, no interview needed, never touches the status ---------------------------------------------------
{
  const dir = path.join(APP, "data");
  const live = {};
  for (const f of [...FILES, ...OPTIONAL_FILES]) { const p = path.join(dir, `${f}.json`); if (fs.existsSync(p)) live[f] = JSON.parse(fs.readFileSync(p, "utf8")); }
  const copy = () => JSON.parse(JSON.stringify(live));
  const s = copy();
  const hadInterview = !!s.onboarding;
  const touched = applyOnboardingAction({ type: "onboard.target", role: "Product designer", level: "lead", role_now: "Product designer", level_now: "mid" }, s, "2026-10-15");
  // Critique 5, P1-4: the target also writes the counted level (level_counted, capped, cap_reason) beside each real rating, so the
  // Skills data and the gap say the same level. Nothing else of a rating changes (level, source, confidence, history stay as they were).
  const ratingsKept = Object.keys(live.skills.ratings).every((k) => { const a = live.skills.ratings[k]; const b = s.skills.ratings[k]; return a.level === b.level && a.source === b.source && a.confidence === b.confidence && JSON.stringify(a.history) === JSON.stringify(b.history); });
  ok("target with no interview on file: profile.domain holds role now, level now and the target; the profile is written, and skills.json only gains the counted-level fields", [...touched].sort().join() === (JSON.stringify(live.skills) === JSON.stringify(s.skills) ? "profile" : "profile,skills") && ratingsKept && s.profile.domain.targets[0].role === "product_designer" && s.profile.domain.targets[0].level === "L" && s.profile.domain.role_now === "product_designer" && s.profile.domain.family_now === "D", JSON.stringify(s.profile.domain));
  ok("the interview status is untouched (still no interview)", !!s.onboarding === hadInterview);
  ok("the data validates with 0 errors after it", validate(s).errors.length === 0, validate(s).errors.slice(0, 2).join(" | "));
  const g = gapFromProfile({ profile: s.profile, skills: s.skills, rubric: s.rubric, hoursPerWeek: 5 });
  ok("the gap map reads it directly: a gap, a blocker, tasks", g && g.ok && g.result.byCompetency.length > 0 && g.tasks.length > 0);
  const refuse = (a, re, name) => { const c = copy(); let m = ""; try { applyOnboardingAction(a, c, "2026-10-15"); } catch (e) { m = e.message; } ok(name, re.test(m), m); };
  refuse({ type: "onboard.target", role: "Product designer", level: "lead" }, /needs role_now/, "no current role on file: refused (the gap would assume full transfer)");
  refuse({ type: "onboard.target", role: "Creative director", level: "lead", role_now: "Brand designer" }, /closest.*yes|is not a launch role/, "a planned role without his confirmation is refused");
  refuse({ type: "onboard.target", role: "PR specialist", level: "head", role_now: "PR specialist" }, /no head step/, "a level the ladder has no step for is refused with the steps");
  refuse({ type: "onboard.target", role: "Underwater welder", level: "mid", role_now: "Product designer" }, /not a role I know/, "an unknown role is refused with the launch roles");
  const mapped = copy();
  applyOnboardingAction({ type: "onboard.target", role: "Creative director", level: "lead", role_now: "Brand designer", level_now: "mid", confirmed: true, quote: "yes, brand designer is the closest", as: "Creative director" }, mapped, "2026-10-15");
  ok("a planned role with his confirmation maps to the nearest launch role and says so", mapped.profile.domain.targets[0].role === "brand_designer" && mapped.profile.domain.role_mapped && mapped.profile.domain.role_mapped.target === "Creative director" && validate(mapped).errors.length === 0, JSON.stringify(mapped.profile.domain));
}

// ---- task refs: symbolic ids become the saved gap ids ----------------------------------------------------------------------------
{
  const t1 = taskRef({ id: "TK-P01", kind: "proof", competency: "storytelling", minutes: 60, gap_ref: "G-storytelling", clears_blocker: "G-proof-portfolio_case_study", because: [], status: "model" }, { "d:storytelling": "G-11", "b:portfolio_case_study": "G-01" });
  ok("a task cites the saved gap and blocker ids, with their keys", t1.gap_ref === "G-11" && t1.clears_blocker === "G-01" && t1.gap_key === "d:storytelling" && t1.blocker_key === "b:portfolio_case_study");
  const t2 = taskRef({ id: "TK-P01", kind: "proof", competency: "storytelling", minutes: 60, gap_ref: "G-storytelling", because: [], status: "model" }, {});
  ok("before the gap is saved the ref is null, never the engine's symbolic id", t2.gap_ref === null && t2.gap_key === "d:storytelling");
  ok("gapIdIndex maps open gaps by key and skips closed ones", JSON.stringify(gapIdIndex([{ id: "G-01", proof_blocker: "x" }, { id: "G-02", domain_competency: "y" }, { id: "G-03", domain_competency: "z", status: "closed" }])) === JSON.stringify({ "b:x": "G-01", "d:y": "G-02" }));
}

// ---- the gap -----------------------------------------------------------------------------------------------------------
{
  const rubric = { competencies: domainRubricFor("product_designer", "L").competencies };
  const profile = { domain: { family_now: "D", role_now: "product_designer", level_now: "M", targets: [{ role: "product_designer", level: "L", weight: 1, kind: "primary" }], evidence: { case_studies: 0 } }, constraints: { hours_per_week: 5 } };
  const g = gapFromProfile({ profile, skills: { ratings: {} }, rubric });
  ok("no ratings: every row is unknown and provisional (unknowns still count as gaps)", g.ok && g.result.byCompetency.every((r) => r.known === false && r.provisional === true) && g.result.byCompetency.length > 10);
  const entries = domainGapEntries(g, rubric, "2026-10-15");
  ok("a gap entry per row and per blocker; titles are competency names; a blocker is first", entries.length === g.result.byCompetency.length + g.result.blockers.length && entries[0].proof_blocker === "portfolio_case_study");
  ok("every task cites a gap or a blocker, 15 to 60 minutes", g.tasks.every((t) => t.minutes >= 15 && t.minutes <= 60 && (t.gap_ref || t.clears_blocker)));
  const planned = gapFromProfile({ profile: { domain: { ...profile.domain, targets: [{ role: "creative_director", level: "L", weight: 1, kind: "primary" }] } }, skills: { ratings: {} }, rubric });
  ok("a planned role as the target is not computed (the caller maps it first): null, never a made up vector", planned === null);
  ok("no domain on the profile: null (the generic builder stays)", gapFromProfile({ profile: {}, skills: { ratings: {} }, rubric }) === null);
  // self cap
  const capped = gapFromProfile({ profile, skills: { ratings: { visual_craft: { level: 4, source: "self", confidence: 0.3, evidence: [] } } }, rubric });
  const vc = capped.result.byCompetency.find((r) => r.competency === "visual_craft");
  ok("a self rating of 4 against a target of 3.5 is capped at target minus 1 with confidence 0.3 until an artifact exists", vc && vc.capped === true && vc.current === 2.5 && vc.confidence === 0.3 && vc.basis === "self", JSON.stringify(vc && [vc.current, vc.confidence, vc.basis]));
  const evid = gapFromProfile({ profile, skills: { ratings: { visual_craft: { level: 4, source: "self", confidence: 0.3, evidence: ["ev-1"] } } }, rubric });
  ok("with an artifact the cap lifts", !evid.result.byCompetency.some((r) => r.competency === "visual_craft"));
}

// ---- validator: additive and strict --------------------------------------------------------------------------------------
{
  const dir = path.join(APP, "data");
  const d = {};
  for (const f of [...FILES, ...OPTIONAL_FILES]) { const p = path.join(dir, `${f}.json`); if (fs.existsSync(p)) d[f] = JSON.parse(fs.readFileSync(p, "utf8")); }
  const base = validate(d).errors.length;
  ok("live data validates with 0 errors (no domain field required)", base === 0, String(base));
  const withDomain = JSON.parse(JSON.stringify(d));
  withDomain.profile.domain = { family_now: "D", role_now: "product_designer", level_now: "M", same_industry: false, targets: [{ role: "product_designer", level: "L", weight: 1, kind: "primary" }], evidence: { case_studies: 0, measure_level: "outcomes" }, blockers: ["portfolio_case_study"] };
  ok("a valid profile.domain adds no error", validate(withDomain).errors.length === 0, validate(withDomain).errors.slice(0, 2).join(" | "));
  const bad = (mut, re, name) => { const x = JSON.parse(JSON.stringify(withDomain)); mut(x.profile.domain); const e = validate(x).errors; ok(name, e.some((m) => re.test(m)), e.slice(0, 2).join(" | ")); };
  bad((x) => { x.family_now = "Z"; }, /family_now/, "family_now outside D, P, M is an error");
  bad((x) => { x.role_now = "wizard"; }, /role_now/, "an unknown role id is an error");
  bad((x) => { x.targets[0].level = "X"; }, /level/, "a target level outside J M S L H is an error");
  bad((x) => { x.targets.push({ role: "brand_designer", level: "S", weight: 1, kind: "primary" }); }, /more than one primary/, "two primary targets are an error");
  bad((x) => { x.targets[0].weight = 2; }, /weight/, "a weight over 1 is an error");
  bad((x) => { x.evidence.case_studies = -1; }, /case_studies/, "a negative count is an error");
  bad((x) => { x.evidence.measure_level = "reach"; }, /measure_level/, "a measure level outside the AMEC chain is an error");
  bad((x) => { x.blockers = ["not_a_kind"]; }, /blockers/, "a blocker that is not a proof kind is an error");
  bad((x) => { x.reviewer = "Sam — a friend"; }, /dash/, "an em dash in domain text is an error");
  const planned = JSON.parse(JSON.stringify(withDomain)); planned.profile.domain.targets[0] = { role: "creative_director", level: "L", weight: 1, kind: "primary" };
  const pv = validate(planned);
  ok("a planned target role is a warning, not an error", pv.errors.length === 0 && pv.warnings.some((w) => /planned role/.test(w)), JSON.stringify(pv.errors.slice(0, 1)));
  const gapBad = JSON.parse(JSON.stringify(d)); if (gapBad.library.gaps && gapBad.library.gaps[0]) { gapBad.library.gaps[0].domain_competency = "nope"; ok("a gap with an unknown domain_competency is an error", validate(gapBad).errors.some((m) => /domain_competency/.test(m))); }
}

if (fails.length) { for (const f of fails) console.log(`FAIL  ${f}`); console.log(`\n${pass} PASS, ${fails.length} FAIL`); process.exit(1); }
console.log(`${pass} PASS, 0 FAIL`);
