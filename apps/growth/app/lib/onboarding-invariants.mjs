// One invariant per derived value (critique 5, section 9: "stop adding questions; add one invariant check per derived value").
// A derived value is never stored beside a source value that disagrees, and a number is never accepted as proof by its shape.
// Each invariant recomputes the derived value with THE SAME function that wrote it, from the same sources, and compares. Nothing
// here reimplements a formula, so a rule changed in one place cannot make the check and the writer drift apart.
// Pure (no file reads): scripts/onboarding-check.mjs and the fixtures call invariantFindings(state). Severity is the caller's:
// FAIL at `complete`, WARN before (the table of the check).
import { domainSelection, gapFromProfile, gapPreview, countedRatings, EVIDENCE_KEYS, domainPatchesFor, domainClearPatchesFor, domainEstimateIds, BUSINESS_COMPETENCY_IDS } from "./domain-flow.mjs";
import { applyPatches, estimateToStart } from "./onboarding.mjs";

/** A sentence that states what employers ask for as a fact (never without a research id or the 'model estimate' label). */
export const claimsHiringBar = (t) => /\b(needs this before you apply|before you apply|every application|every job post|all applications|asks? for level|needs level \d)/i.test(String(t || ""));
import { resolveQuestion } from "./onboarding-bank.mjs";

const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const answered = (a) => a && a.status === "answered" && a.withheld !== true;

/** A real calendar date: 2027-13-40 and 2026-02-30 are not. */
export function validDate(v) {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(y, mo - 1, da));
  return d.getUTCFullYear() === y && d.getUTCMonth() === mo - 1 && d.getUTCDate() === da;
}

/**
 * state: { profile, skills, rubric, library, demands, onboarding }. Returns [{ n, id, message }]. Each finding says which source and
 * which derived value disagree.
 */
export function invariantFindings(state, { gapMapSource } = {}) {
  const out = [];
  const add = (n, id, message, severity) => out.push({ n, id, message, ...(severity ? { severity } : {}) });
  const ob = state.onboarding;
  const prof = state.profile || {};
  const dom = prof.domain;
  const answers = (ob && ob.answers) || {};
  const sel = ob && domainSelection(answers);
  const active = !!(sel && sel.asked && sel.family_now && dom);

  // (1) domain.targets match the DM-03, DM-04 and DM-06 answers (derived follows its source), and so do the setting and his words
  if (active) {
    const norm = (ts) => (ts || []).map((t) => [t.role, t.level, t.weight, t.kind, t.sequential === true]);
    if (!same(norm(sel.targets), norm(dom.targets))) add(1, "domain.targets", `profile.domain.targets (${JSON.stringify(norm(dom.targets))}) does not match what DM-03, DM-04 and DM-06 say (${JSON.stringify(norm(sel.targets))})`);
    if (sel.target_level && dom.target_level !== sel.target_level) add(1, "domain.target_level", `profile.domain.target_level is ${dom.target_level || "empty"} but DM-06 says ${sel.target_level}`);
    if (sel.target_setting && dom.target_setting !== sel.target_setting) add(1, "domain.target_setting", `profile.domain.target_setting is ${dom.target_setting || "empty"} but his answers say ${sel.target_setting}`);
    if (sel.second && sel.second.words && sel.second.on_map === false && !(sel.notes || []).some((n) => n.includes(sel.second.words))) add(1, "domain.second_words", `a second role (${sel.second.words}) is neither on the map nor said to be saved as his words`);
  }

  // (2) the evidence-derived blocker state equals the latest follow-up answers: the evidence is rebuilt from the answers and compared
  if (active) {
    let ev = { domain: { evidence: {} } };
    const patches = [];
    for (const [id, a] of Object.entries(answers)) {
      if (!/^DM-\d+/.test(id)) continue;
      if (answered(a)) { for (const p of domainPatchesFor(id, a, answers, "1970-01-01")) { if (p.file === "profile" && /^domain\.evidence\./.test(p.path)) patches.push(p); } }
      else if (a && ["unknown", "off_limits"].includes(a.status)) { for (const p of domainClearPatchesFor(id)) patches.push(p); }
    }
    ev = applyPatches({ profile: { domain: { evidence: {} } } }, patches).state.profile.domain.evidence || {};
    const have = (dom && dom.evidence) || {};
    const keys = [...new Set(Object.values(EVIDENCE_KEYS).flat())];
    for (const k of keys) {
      const want = ev[k]; const got = have[k];
      if (!same(want === undefined ? null : want, got === undefined ? null : got) && !(want === undefined && got === undefined)) add(2, `domain.evidence.${k}`, `profile.domain.evidence.${k} is ${JSON.stringify(got === undefined ? null : got)} but the answers (latest, an I don't know withdraws) give ${JSON.stringify(want === undefined ? null : want)}`);
    }
    const g = gapFromProfile({ profile: prof, skills: state.skills, rubric: state.rubric });
    const dd = ob.derived && ob.derived.domain;
    if (g && g.ok && dd && dd.ok && !same(dd.blockers, g.result.blockers.map((b) => b.id))) add(2, "derived.domain.blockers", `onboarding.derived.domain.blockers (${dd.blockers.join(", ")}) differs from the blockers computed from the evidence now (${g.result.blockers.map((b) => b.id).join(", ")})`);
  }

  // (3) every rating the gap counts carries level_counted and capped, and they equal what the gap counts now
  if (dom && Array.isArray(dom.targets) && dom.targets.length && state.skills && state.skills.ratings) {
    const c = countedRatings({ profile: prof, skills: state.skills, rubric: state.rubric });
    // Ownership: onboarding keeps level_counted in step. A rating that moved after onboarding wrote it (a weekly review, a test: level
    // no longer equals level_claimed) belongs to the app now, and is not a finding. A rating onboarding never wrote carries no
    // 'because' on its last history entry and no level_counted: also not onboarding's.
    const moved = (r) => typeof r.level_claimed === "number" && r.level_claimed !== r.level;
    const owned = (r) => (typeof r.level_counted === "number" ? !moved(r) : Array.isArray((r.history || [])[(r.history || []).length - 1] && r.history[r.history.length - 1].because) && r.history[r.history.length - 1].because.length > 0);
    const anyMoved = Object.values(state.skills.ratings).some((r) => r && r.placeholder !== true && moved(r));
    for (const [rid, k] of Object.entries(c)) {
      const r = state.skills.ratings[rid];
      if (!r || !owned(r)) continue;
      if (typeof r.level_counted !== "number") { add(3, `skills.${rid}`, `skills.${rid} has no level_counted: the Skills page would show ${r.level} while the gap counts ${k.level_counted}`); continue; }
      if (r.level_counted !== k.level_counted || (r.capped === true) !== k.capped || r.level_claimed !== k.level_claimed) add(3, `skills.${rid}`, `skills.${rid} says counted ${r.level_counted} (capped ${r.capped === true}) but the gap counts ${k.level_counted} (capped ${k.capped}): the page and the gap show two levels for one skill`);
      if (k.capped && !(typeof r.cap_reason === "string" && r.cap_reason.trim())) add(3, `skills.${rid}`, `skills.${rid} is capped and has no marker text (counted as ${k.level_counted} until a piece of work or a test)`);
    }
    for (const g of (anyMoved ? [] : (state.library && state.library.gaps) || [])) {
      if (g.status === "closed" || !g.domain_competency) continue;
      const m = /Level (\d+(?:\.\d+)?)/.exec(g.now || "");
      if (!m) continue;
      // the gap's "now" is the counted level of the rating that maps to it (same function), never a different number
      const fresh = gapFromProfile({ profile: prof, skills: state.skills, rubric: state.rubric });
      const row = fresh && fresh.ok && fresh.result.byCompetency.find((x) => x.competency === g.domain_competency);
      if (row && row.current !== null && Number(m[1]) !== row.current) add(3, `gap ${g.id}`, `gap ${g.id} says now Level ${m[1]} but the counted level is ${row.current} (the gap is stale against the ratings)`);
    }
  }

  // (4) no hiring-bar claim without a research id or the 'model estimate' label
  for (const g of (state.library && state.library.gaps) || []) {
    if (g.status === "closed") continue;
    for (const k of ["why", "title", "closes_when"]) {
      const t = String(g[k] || "");
      const research = (g.because || []).some((x) => /^rs-/.test(String(x)));
      if (claimsHiringBar(t) && !research && !/model estimate|not sourced|not yet sourced|researched rubric/i.test(t)) add(4, `gap ${g.id}`, `gap ${g.id} ${k} states what employers ask for with no research id and no 'model estimate' label: "${t.slice(0, 80)}"`);
    }
  }

  // (5) the hours in GapMap are the person's own hours: no hard-coded "an hour a night"
  if (typeof gapMapSource === "string") {
    if (/an hour a night/i.test(gapMapSource)) add(5, "GapMap", "components/GapMap.tsx still says 'an hour a night' as a fixed sentence: the months are worked out from the person's hours a week, so the sentence must say those hours");
    if (!/hours a week/.test(gapMapSource)) add(5, "GapMap", "components/GapMap.tsx does not say the person's hours a week beside the months");
  }

  // (6) dates are real dates
  if (ob) {
    for (const [id, a] of Object.entries(answers)) {
      const q = resolveQuestion(id);
      if (!q || !answered(a) || !(q.validate && q.validate.kind === "date")) continue;
      if (typeof a.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.value) && !validDate(a.value)) add(6, id, `${id} holds ${a.value}, which is not a date on the calendar`);
    }
    for (const [k, v] of [["north_star.timeline", prof.north_star && prof.north_star.timeline], ["situation.hard_date", prof.situation && prof.situation.hard_date]]) {
      const m = typeof v === "string" ? /\b(\d{4}-\d{2}-\d{2})\b/.exec(v) : null;
      if (m && !validDate(m[1])) add(6, `profile.${k}`, `profile.${k} holds ${m[1]}, which is not a date on the calendar`);
    }
  }

  // (7) the estimate of sittings includes the domain questions
  if (ob && ob.status !== "not_started" && ob.status !== "complete") {
    const e = estimateToStart(ob);
    const dq = domainEstimateIds(ob).length;
    if ((e.domain_questions || 0) !== dq) add(7, "estimate", `the estimate counts ${e.domain_questions || 0} domain question(s) but ${dq} remain between now and a first plan`);
  }

  // (8) the distance preview on profile.domain equals the distance computed now
  if (dom && dom.gap_preview && Array.isArray(dom.targets) && dom.targets.length) {
    const g = gapFromProfile({ profile: prof, skills: state.skills, rubric: state.rubric });
    const fresh = g && g.ok ? gapPreview(g) : null;
    if (fresh && !same({ ...dom.gap_preview, at: undefined }, { ...fresh, at: undefined })) add(8, "domain.gap_preview", `profile.domain.gap_preview (distance ${dom.gap_preview.distance}, ${dom.gap_preview.evenings} evenings) is stale: it is ${fresh.distance} and ${fresh.evenings} now`, "warn");
  }

  // (9) a business target carries the business competencies and blockers (an employee ladder is not the road to a business)
  if (dom && dom.target_setting === "business" && Array.isArray(dom.targets) && dom.targets.length) {
    // compared with what is STORED: once the gaps are written (the bridge), the library holds the business competencies and blockers
    const written = !!(ob && (ob.bridge_written || ob.status === "complete"));
    const open = ((state.library && state.library.gaps) || []).filter((x) => x.status !== "closed");
    if (written && !open.some((x) => BUSINESS_COMPETENCY_IDS.includes(x.domain_competency))) add(9, "business", "the target is a business of his own but no business competency (pricing, selling, pipeline, contracts, positioning, runway) is among the saved gaps");
  }
  void isObj;
  return out;
}
