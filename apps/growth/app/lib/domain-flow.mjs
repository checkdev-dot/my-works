// The domain flow: how DM-* answers become profile.domain.*, and how profile.domain becomes the A to B gap.
// Pure (no node built-ins): used by lib/onboarding.mjs (patches, gaps), lib/validate.mjs and the GapMap component.
// Spec: handoff-docs/specs/domain-graph-spec.md. Wiring: handoff-docs/specs/domain-wiring-todo.md.
import { DOMAINS, getRole, roleVector, computeGap, pickTasks, LAUNCH_ROLES } from "./domains.mjs";
import { DOMAIN_BANK, domainById, R2_TEMPLATES, R2_RUN_CAPS, SECOND_TARGET_CAP_FACTOR } from "./domain-bank.mjs";

export const FAMILY_BY_WORD = { design: "D", "pr and communications": "P", marketing: "M", "hr and organisation development": "H" };
export const LEVEL_BY_WORD = { junior: "J", mid: "M", senior: "S", lead: "L", head: "H" };
export const WORD_BY_LEVEL = { J: "junior", M: "mid", S: "senior", L: "lead", H: "head" };
export const LEVEL_NAMES = { J: "Junior", M: "Mid", S: "Senior", L: "Lead", H: "Head" };
export const OUTSIDE_NOTE = "Outside the launch roles: using the generic path.";
/** The DM-03 option for a person who wants to work for himself: the launch ladders are for employees, so it is read apart. */
export const BUSINESS_OPTION = "my own business or freelance";
const BUSINESS_RE = /\b(freelanc\w*|self[- ]employed|my own\b|own (?:business|brand|agency|studio|practice|firm|company|consultancy)|start(?:ing)? (?:my|a|an) (?:own )?(?:business|agency|studio|company|consultancy)|independent consultant)\b/i;

const clean = (s) => String(s == null ? "" : s).replace(/[–—]/g, "-").trim();
const norm = (s) => clean(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

const ROLE_BY_NAME = Object.fromEntries(DOMAINS.roles.map((r) => [norm(r.name), r.id]));
const ROLE_IDS = new Set(DOMAINS.roles.map((r) => r.id));

/** A role id for a typed or chosen role name, or null. Accepts a role id, a role name, and the ladder titles. */
export function roleIdFor(text) {
  const t = norm(text);
  if (!t) return null;
  if (ROLE_IDS.has(String(text).trim())) return String(text).trim();
  if (ROLE_BY_NAME[t]) return ROLE_BY_NAME[t];
  for (const r of DOMAINS.roles) for (const step of Object.values(r.ladder || {})) if (step && norm(step.title) === t) return r.id;
  return null;
}

/** The nearest launch role for a planned one (first waypoint candidate of the data file), with the level it sits at. */
export function nearestLaunch(roleId) {
  const role = getRole(roleId);
  if (!role) return null;
  if (role.launch) return { role: roleId, level: null, mapped: false };
  const c = ((DOMAINS.waypoints.candidates || {})[roleId] || []).find((x) => (getRole(x.role) || {}).launch);
  if (c) return { role: c.role, level: c.level, mapped: true, from: roleId };
  const fam = DOMAINS.roles.find((r) => r.launch && r.family === role.family);
  return fam ? { role: fam.id, level: null, mapped: true, from: roleId } : null;
}

/** "The steps are junior, mid, senior and lead." for a role (a step the ladder has no title for is not listed). */
function ladderWords(roleId) {
  const r = getRole(roleId);
  const steps = ["J", "M", "S", "L", "H"].filter((l) => r && r.ladder && r.ladder[l]).map((l) => WORD_BY_LEVEL[l]);
  return steps.length ? `The steps are ${steps.join(", ")}.` : "";
}

const answerOf = (answers, id) => {
  const a = answers && answers[id];
  return a && a.status === "answered" && a.withheld !== true ? a : null;
};
const textOf = (a) => (a ? clean(typeof a.value === "string" ? a.value : a.raw || "") : "");

/** The level whose ladder title (any launch or planned role) is this text: "Growth lead" is the L step of the growth marketer ladder. */
export function levelFromTitle(text, roleId) {
  const t = norm(text);
  if (!t) return null;
  const roles = roleId && getRole(roleId) ? [getRole(roleId)] : DOMAINS.roles;
  for (const r of roles) for (const [l, step] of Object.entries(r.ladder || {})) if (step && norm(step.title) === t) return l;
  return null;
}

/**
 * What the answers say about family, role and level. `role_mapped` carries the free text when the person's role is not one of
 * the five launch roles and was mapped to the closest one (Claude sends meta.role with the launch role id, and DM-02.f1 or
 * DM-03.f1 with his own words). Never guessed: no mapping means role null and the generic path.
 */
export function domainSelection(answers) {
  const out = { family_now: null, role_now: null, level_now: null, targets: [], role_mapped: {}, outside: false, notes: [], second: null, target_setting: null, target_words: null, target_level: null };
  const a1 = answerOf(answers, "DM-01");
  if (!a1) return { ...out, asked: false };
  const fam = FAMILY_BY_WORD[norm(a1.value)] || null;
  if (!fam) return { ...out, asked: true, outside: true, notes: [OUTSIDE_NOTE] };
  out.family_now = fam;
  const resolve = (idMain, idFollow, which) => {
    const a = answerOf(answers, idMain);
    if (!a) return null;
    let id = roleIdFor(a.value);
    const other = /^(none of these|a role not listed|my own business or freelance)$/i.test(String(a.value).trim());
    const free = textOf(answerOf(answers, `${idFollow}`));
    if (other) {
      const hinted = a.meta && a.meta.role && ROLE_IDS.has(a.meta.role) ? a.meta.role : roleIdFor(free);
      if (!hinted) return { unresolved: true, free };
      id = hinted;
      out.role_mapped[which] = clean(free || a.value);
    }
    if (!id) return null;
    const near = nearestLaunch(id);
    if (!near) return null;
    // A mapping to the closest launch role is never silent: it holds only once he confirmed it (confirmed: true, with his words).
    if ((other || near.mapped) && a.confirmed !== true) {
      out.notes.push(`${clean(free || (getRole(id) || {}).name || id)} is not one of the launch roles: confirm that ${getRole(near.role).name} is the closest before it is used.`);
      return { unresolved: true, awaiting: near.role, free };
    }
    if (near.mapped) {
      out.role_mapped[which] = out.role_mapped[which] || clean(free || (getRole(id) || {}).name || id);
      out.notes.push(`${(getRole(id) || {}).name || id} is planned: using the nearest launch role, ${getRole(near.role).name}.`);
    }
    return { role: near.role, asked: id, level_hint: near.level };
  };
  const now = resolve("DM-02", "DM-02.f1", "now");
  if (now && now.role) out.role_now = now.role;
  else if (now && now.unresolved) out.notes.push("Current role not mapped yet: say which of the five launch roles is closest.");
  const ladderHas = (role, level) => { const r = getRole(role); return !!(r && r.ladder && r.ladder[level]); };
  const lv = answerOf(answers, "DM-05");
  if (lv && LEVEL_BY_WORD[norm(lv.value)]) {
    const l = LEVEL_BY_WORD[norm(lv.value)];
    if (!out.role_now || ladderHas(out.role_now, l)) out.level_now = l;
    else out.notes.push(`${getRole(out.role_now).name} has no ${WORD_BY_LEVEL[l]} step on its ladder, so that level is not used. ${ladderWords(out.role_now)}`);
  }
  const tg = resolve("DM-03", "DM-03.f1", "target");
  out.target_role = tg && tg.role ? tg.role : null;
  const tl = answerOf(answers, "DM-06");
  // His level is stored even when no launch role is the target yet (the generic path reads it): critique 5, P1-3.
  out.target_level = tl && LEVEL_BY_WORD[norm(tl.value)] ? LEVEL_BY_WORD[norm(tl.value)] : null;
  // The target setting: employee, or a business of his own. DM-03 says it, or the words he gave for the target do (B-04, DM-03.f1).
  {
    const d3 = answerOf(answers, "DM-03");
    const f3 = textOf(answerOf(answers, "DM-03.f1"));
    const b4 = answerOf(answers, "B-04");
    const b4t = b4 && typeof b4.value === "string" ? clean(b4.value) : "";
    if (d3 && d3.meta && ["business", "employee"].includes(d3.meta.target_setting)) out.target_setting = d3.meta.target_setting;
    else if (d3) out.target_setting = String(d3.value).trim().toLowerCase() === BUSINESS_OPTION || BUSINESS_RE.test(f3) || BUSINESS_RE.test(b4t) ? "business" : "employee";
    else if (b4t && BUSINESS_RE.test(b4t)) out.target_setting = "business";
    out.target_words = (f3 || b4t || (d3 ? clean(d3.value) : "")).slice(0, 120) || null;
  }
  const tLevel = tl && LEVEL_BY_WORD[norm(tl.value)] ? LEVEL_BY_WORD[norm(tl.value)] : tg && tg.level_hint ? tg.level_hint : null;
  if (tg && tg.role && tLevel && !ladderHas(tg.role, tLevel)) out.notes.push(`${getRole(tg.role).name} has no ${WORD_BY_LEVEL[tLevel]} step on its ladder, so that target is not used. ${ladderWords(tg.role)}`);
  else if (tg && tg.role && tLevel) out.targets.push({ role: tg.role, level: tLevel, weight: 1, kind: "primary" });
  else if (tg && tg.unresolved) { out.outside = true; out.notes.push(OUTSIDE_NOTE); }
  const sec = answerOf(answers, "DM-04");
  if (sec && !/^none$/i.test(String(sec.value).trim())) {
    const raw = clean(String(sec.value));
    const om = /^other\s*:\s*(.*)$/i.exec(raw);
    const words = clean(om ? om[1] : raw).slice(0, 80);
    const f4 = textOf(answerOf(answers, "DM-04.f1"));
    // "performance marketer, then growth lead": the second target comes after the first (kept in sequence, not alongside)
    const sequential = /\b(after|then|next|later|once)\b/i.test(f4) || /\bthen\b/i.test(raw) || (sec.meta && sec.meta.sequential === true);
    const metaRole = sec.meta && ROLE_IDS.has(sec.meta.role) ? sec.meta.role : null;
    const id = roleIdFor(words) || metaRole;
    const near = id ? nearestLaunch(id) : null;
    if (!near) {
      // never silent and never dropped: it is kept as his words, and the note says it is not on the map
      out.second = { words, role: null, on_map: false };
      out.notes.push(`"${words}" is saved as your words, not on the map: say which of the launch roles is the closest and confirm it (then it is used as a second target).`);
    } else if ((om || near.mapped || !LAUNCH_ROLES.includes(id)) && sec.confirmed !== true) {
      out.second = { words, role: null, awaiting: near.role, on_map: false };
      out.notes.push(`${words} is not one of the launch roles: confirm that ${getRole(near.role).name} is the closest before it is used as a second target.`);
    } else {
      const lv = levelFromTitle(words, id) || near.level || tLevel;
      const sl = lv && ladderHas(near.role, lv) ? lv : tLevel && ladderHas(near.role, tLevel) ? tLevel : null;
      if (!tLevel) out.second = { words, role: near.role, on_map: false };
      else if (!sl) { out.second = { words, role: near.role, on_map: false }; out.notes.push(`${getRole(near.role).name} has no step for that level, so the second target is not used. ${ladderWords(near.role)}`); }
      else if (out.targets.some((t) => t.role === near.role && t.level === sl)) out.second = { words, role: near.role, on_map: false };
      else {
        out.targets.push({ role: near.role, level: sl, weight: 0.5, kind: "optional", ...(sequential ? { sequential: true } : {}) });
        out.second = { words, role: near.role, level: sl, on_map: true, sequential };
        if (om || near.mapped || near.role !== id) out.role_mapped.second = words;
        if (near.mapped || near.role !== id) out.notes.push(`${words} is mapped to the nearest launch role, ${getRole(near.role).name}, as a second target${sequential ? " that comes after the first" : ""}.`);
      }
    }
  }
  return { ...out, asked: true };
}

/** Same industry: derived from DM-08 and its follow-up, or a stated override in meta.same_industry. Never asked directly. */
export function sameIndustryOf(answers) {
  const a = answerOf(answers, "DM-08");
  if (!a) return undefined;
  if (typeof a.meta?.same_industry === "boolean") return a.meta.same_industry;
  const f = answerOf(answers, "DM-08.f1");
  if (!f) return undefined;
  const x = norm(a.value);
  const y = norm(f.value);
  if (!x || !y) return undefined;
  return x === y || x.includes(y) || y.includes(x);
}

const SET = (file, path, value) => ({ file, path, value, op: "set" });
const APPEND = (file, path, value) => ({ file, path, value, op: "append" });

/** Evidence keys each DM question writes: an "I don't know" or a withdrawal clears exactly these (proof is recomputed from what is left). */
export const EVIDENCE_KEYS = {
  "DM-10": ["budget_owned"], "DM-13": ["tools"], "DM-14": ["case_studies"], "DM-17": ["placements"], "DM-19": ["measure_level"],
  "DM-20": ["best_result", "best_result_state", "best_result_date", "best_result_source"], "DM-20.f1": ["best_result_date"], "DM-20.f2": ["best_result_source"],
  "DM-21": ["channel"], "DM-22": ["experiment"], "DM-23": ["people_managed"], "DM-26": ["public_presence"],
};
/** The patches an unknown or off-limits DM answer makes: it withdraws what the earlier answer wrote. */
export function domainClearPatchesFor(id) {
  return (EVIDENCE_KEYS[id] || []).map((k) => SET("profile", `domain.evidence.${k}`, undefined));
}

/** The patches one DM-* answer makes (the caller adds provenance). Order matters: later ones win. */
export function domainPatchesFor(id, a, answers, today) {
  const v = a.value;
  const out = [];
  const set = (p, val) => out.push(SET("profile", p, val));
  const sel = domainSelection(answers);
  const note = (title, detail, links = []) => out.push(APPEND("evidence", "entries", { date: today, type: "note", title: title.slice(0, 120), detail: clean(detail).slice(0, 300), links: links.filter((x) => /^https?:\/\//.test(x)) }));
  switch (id) {
    case "DM-01": if (sel.family_now) { set("domain.family_now", sel.family_now); set("situation.family_now", sel.family_now); } break;
    case "DM-02": case "DM-02.f1":
      if (sel.role_now) { set("domain.role_now", sel.role_now); set("role_now", getRole(sel.role_now).name); }
      if (Object.keys(sel.role_mapped).length) set("domain.role_mapped", sel.role_mapped);
      break;
    case "DM-05": if (sel.level_now) set("domain.level_now", sel.level_now); break;
    case "DM-03": case "DM-03.f1": case "DM-04": case "DM-04.f1": case "DM-06":
      if (sel.targets.length) { set("domain.targets", sel.targets); set("north_star.role", getRole(sel.targets[0].role).name); }
      else if (sel.asked && sel.family_now) set("domain.targets", []); // a target that is not confirmed is not on the map: the derived value follows its source
      if (Object.keys(sel.role_mapped).length) set("domain.role_mapped", sel.role_mapped);
      if (sel.target_setting) set("domain.target_setting", sel.target_setting);
      if (sel.target_words) set("domain.target_words", sel.target_words);
      if (sel.target_level) set("domain.target_level", sel.target_level);
      if (sel.second && sel.second.words) set("domain.second_words", sel.second.words);
      break;
    case "DM-07": set("domain.context.work_mode", String(v)); set("situation.work_mode", String(v)); break;
    case "DM-08": case "DM-08.f1": {
      // R0-09 is the vocabulary of every later question: an industry answer never overwrites it (critique 5, P2); it is kept apart
      if (id === "DM-08") { set("domain.industry_now", clean(v)); if (!answerOf(answers, "R0-09")) set("situation.field", clean(v)); }
      const si = sameIndustryOf(answers);
      if (typeof si === "boolean") set("domain.same_industry", si);
      break;
    }
    case "DM-09": if (num(Number(v)) !== null) set("domain.context.team_size", Math.max(0, Math.round(Number(v)))); break;
    case "DM-10": set("domain.evidence.budget_owned", /^none$/i.test(String(v).trim()) ? null : clean(v).slice(0, 80)); break;
    case "DM-11": note("Your best piece of work in the last 12 months", `Link given: ${clean(v)}`, [String(v)]); break;
    case "DM-12": note("What you did yourself in that piece", clean(v)); break;
    case "DM-13": set("domain.evidence.tools", [clean(v).slice(0, 60)]); break;
    case "DM-14": if (num(Number(v)) !== null) set("domain.evidence.case_studies", Math.max(0, Math.round(Number(v)))); break;
    case "DM-15": note("The user problem you chose in your last case study", clean(v)); break;
    case "DM-17": if (num(Number(v)) !== null) set("domain.evidence.placements", Math.max(0, Math.round(Number(v)))); break;
    case "DM-18": note("Coverage you pitched yourself", `Link given: ${clean(v)}`, [String(v)]); break;
    case "DM-19": set("domain.evidence.measure_level", String(v)); break;
    case "DM-20": {
      // the text, and its state beside it: a derived value is never stored without the source it was derived from
      const none = /^none$/i.test(String(v).trim());
      set("domain.evidence.best_result", none ? null : clean(v).slice(0, 160));
      set("domain.evidence.best_result_state", none ? "none" : undefined);
      break;
    }
    case "DM-20.f1": set("domain.evidence.best_result_date", clean(v).slice(0, 80)); break;
    case "DM-20.f2": set("domain.evidence.best_result_source", clean(v).slice(0, 160)); break;
    case "DM-21": set("domain.evidence.channel", String(v)); break;
    case "DM-22": set("domain.evidence.experiment", clean(v).slice(0, 160)); break;
    case "DM-23": if (num(Number(v)) !== null) set("domain.evidence.people_managed", Math.max(0, Math.round(Number(v)))); break;
    case "DM-24": note("A stakeholder whose mind your work changed", clean(v)); break;
    case "DM-25": note("A writing sample you could send today", `Link given: ${clean(v)}`, [String(v)]); break;
    case "DM-26": set("domain.evidence.public_presence", /^none$/i.test(String(v).trim()) ? null : clean(v).slice(0, 160)); break;
    // DM-47 and DM-50 have consumers (critique 5, P2): the project hours, and the stay rule, unless B-18, T-07 or P-03 already said it
    case "DM-47": if (num(Number(v)) !== null) { set("constraints.project_hours_per_week", Math.max(0, Number(v))); if (!answerOf(answers, "B-18") && !answerOf(answers, "T-07")) set("constraints.hours_per_week", Math.max(0, Number(v))); } break;
    case "DM-50": if (!answerOf(answers, "P-03")) set("constraints.stay_rule", ({ yes: "Would take a lower-level role in the new field to get proof.", "only with conditions": "Would take a lower-level role in the new field only with conditions.", no: "Would not take a lower-level role in the new field." })[String(v).trim().toLowerCase()] || clean(v)); break;
    case "DM-46": set("domain.shared_first", String(v)); break;
    case "DM-48": set("domain.reviewer", clean(v).slice(0, 80)); break;
    case "DM-49": set("domain.proof_project", clean(v).slice(0, 160)); break;
    default: break;
  }
  return out;
}

// ---- gap -----------------------------------------------------------------------------------------------------------------

// ---- proof is a thing with parts, not a digit (critique 5, P1-5) ------------------------------------------------------------
/** Words that make a number a memory, not a measurement. A hedged result is "claimed", never "proved". */
export const HEDGE_RE = /\b(i think|i believe|i guess|i suppose|i reckon|about|around|maybe|perhaps|roughly|approximately|approx|probably|something like|more or less|not sure|ish)\b|~/i;
export const CLAIMED_CONFIDENCE = 0.3;
const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";
const PERIOD_RE = new RegExp(`\\b(from|vs\\.?|versus|compared (?:to|with)|baseline|before|up from|down from|previously|per (?:day|week|month|quarter|year)|a (?:day|week|month|quarter|year)|each (?:day|week|month|quarter)|(?:in|over|during|within|last|past|for) (?:the )?(?:last |past |first |next )?(?:\\d+ |one |two |three |four |six )?(?:days?|weeks?|months?|quarters?|years?)|q[1-4]|20\\d\\d|(?:${MONTHS})\\b\\.?\\s*\\d{0,4}|\\d{4}-\\d{2}-\\d{2})\\b`, "i");
// A named party: a role word then a name (client Acme), or for/at/with then TWO capitalised words (for Acme Foods). One capitalised word
// after "for" or "with" ("for Diwali", "with Instagram") is a campaign or a channel, not a client.
const NAMED_RE = /\b(?:client|customer|employer|company|agency|brand)\s+(?:the\s+)?[A-Z][A-Za-z0-9&.'-]{2,}|\b(?:for|at|with)\s+(?:the\s+)?[A-Z][A-Za-z0-9&.'-]+(?:\s+[A-Z][A-Za-z0-9&.'-]+)+/;
const URL_RE = /https?:\/\/|\b[a-z0-9-]+\.(?:com|org|io|co|net|app)\b/i;
// An artifact word counts only as the answer to "where does the number come from" (the source), never in the sentence of the claim.
const ARTIFACT_RE = /\b(?:report|dashboard|deck|case study|screenshot|invoice|brief|export|analytics|ads manager|search console|crm)\b/i;
const MEMORY_RE = /\b(?:memory|remember|recall|guess|not sure|no source|somewhere|heard|someone said|i think|i believe)\b/i;
const NONE_WORD = /^(none|nothing|n\/a|no|0)$/i;
const NO_ANSWER = /^(unknown|none|i do not know|i don'?t know)$/i;
/**
 * What a text answer to a "give one result" question proves. parts: [main text, date or period, source]. A result counts only when
 * it has the evidence type's required part (proof_requires of the proof kind) AND is not hedged. The answer to the date or source
 * follow-up supplies the baseline/period or the artifact. Returns { state: proved | claimed | none | unknown, confidence, found, hedged }.
 */
export function assessResult(parts, requires) {
  const [text, date, source] = (parts || []).map((x) => (x == null ? "" : clean(x)));
  const req = Array.isArray(requires) && requires.length ? requires : ["metric_with_baseline", "link_or_artifact", "named_client"];
  if (!text) return { state: "unknown", confidence: null, found: {}, hedged: false };
  if (NONE_WORD.test(text)) return { state: "none", confidence: null, found: {}, hedged: false };
  const all = [text, date, source].filter(Boolean).join(" ");
  // a source he says is memory ("from memory", "I remember") is a hedge in its own right, even beside a date
  const hedged = HEDGE_RE.test(all) || (!!source && MEMORY_RE.test(source));
  const metric = /\d/.test(text);
  // a source or a date counts only when it is one: "from memory" is neither, and a free sentence is not a source by being non-empty
  const hasSource = !!source && !NO_ANSWER.test(source) && !MEMORY_RE.test(source) && (URL_RE.test(source) || ARTIFACT_RE.test(source) || NAMED_RE.test(source) || /[A-Z]\w+\s+[A-Z]\w+/.test(source));
  const hasDate = !!date && !NO_ANSWER.test(date) && !MEMORY_RE.test(date) && (/\d/.test(date) || PERIOD_RE.test(date));
  const found = {
    metric_with_baseline: metric && (PERIOD_RE.test(text) || hasDate),
    link_or_artifact: URL_RE.test(text) || (hasSource && (URL_RE.test(source) || ARTIFACT_RE.test(source))),
    named_client: NAMED_RE.test(text) || (hasSource && NAMED_RE.test(source)),
  };
  if (req.some((r) => found[r]) && !hedged) return { state: "proved", confidence: null, found, hedged };
  return { state: "claimed", confidence: CLAIMED_CONFIDENCE, found, hedged };
}
const RESULT_KINDS = ["launch_with_results", "published_content_with_metrics", "pipeline_or_revenue_result"];
/** The state of the best-result evidence of profile.domain: the one function the proof, the gap, the check and the page read. */
export function resultState(domain) {
  const ev = (domain && domain.evidence) || {};
  const requires = ((DOMAINS.proof_kinds || {})[RESULT_KINDS[0]] || {}).proof_requires;
  if (ev.best_result_state === "none" || ev.best_result === null) return { state: "none", confidence: null, found: {}, hedged: false };
  if (ev.best_result === undefined) return { state: "unknown", confidence: null, found: {}, hedged: false };
  return assessResult([ev.best_result, ev.best_result_date, ev.best_result_source], requires);
}
/** Proof kinds a person has CLAIMED (a hedged or unsourced number): shown as claimed with confidence 0.3, never counted. */
export function claimedFrom(domain) {
  const rs = resultState(domain);
  return rs.state === "claimed" ? Object.fromEntries(RESULT_KINDS.map((k) => [k, rs.confidence])) : {};
}

/** Proof counts by proof kind from profile.domain.evidence. A kind with no answer stays out (unknown, provisional). */
export function proofFrom(domain) {
  const ev = (domain && domain.evidence) || {};
  const proof = {};
  const has = (x) => x !== undefined && x !== null;
  if (has(ev.case_studies)) { proof.portfolio_case_study = ev.case_studies; proof.portfolio_brand_work = ev.case_studies; }
  if (has(ev.placements)) proof.earned_media_clippings = ev.placements;
  const rs = resultState(domain);
  if (rs.state !== "unknown") {
    // proved counts 1; a claimed number or a "none" counts 0: it is on the page as what he remembers, never as proof
    const n = rs.state === "proved" ? 1 : 0;
    for (const k of RESULT_KINDS) proof[k] = n;
  }
  if (has(ev.people_managed)) proof.led_team_outcome = ev.people_managed > 0 && ev.budget_owned ? 1 : 0;
  if (ev.measure_level) proof.measured_reputation_result = ["outcomes", "impact"].includes(ev.measure_level) ? 1 : 0;
  if (ev.experiment !== undefined) proof.experiment_log_with_kpi = ev.experiment && !/^none$/i.test(String(ev.experiment)) ? 1 : 0;
  return proof;
}

/** Domain levels from the rubric ratings (8 or more rubric ids; a rubric competency's own maps_to wins over the shipped table). */
export function currentFromRatings(ratings, rubric) {
  const comps = (rubric && rubric.competencies) || [];
  const byId = Object.fromEntries(comps.map((c) => [c.id, c]));
  const out = {};
  for (const [rid, r0] of Object.entries(ratings || {})) {
    const r = r0 || {};
    if (r.placeholder === true || typeof r.level !== "number") continue;
    const own = byId[rid] && Array.isArray(byId[rid].maps_to) ? byId[rid].maps_to : null;
    const maps = own || DOMAINS.maps_to[rid] || (DOMAINS.competency_order.includes(rid) ? [{ domain_id: rid, factor: 1 }] : []);
    if (!Array.isArray(maps)) continue;
    for (const m of maps) {
      const level = Math.round(r.level * m.factor * 1e6) / 1e6;
      const cur = out[m.domain_id];
      if (!cur || level > cur.level) out[m.domain_id] = { level, confidence: typeof r.confidence === "number" ? r.confidence : undefined, source: r.source, evidence: Array.isArray(r.evidence) ? r.evidence : [], tested: !!r.tested };
    }
  }
  return out;
}

const hostOf = (domainId, rubric) => {
  const comps = (rubric && rubric.competencies) || [];
  if (!comps.length) return null;
  const direct = comps.find((c) => c.id === domainId);
  if (direct) return direct.id;
  const mapped = comps.find((c) => Array.isArray(c.maps_to) && c.maps_to.some((m) => m.domain_id === domainId));
  if (mapped) return mapped.id;
  for (const c of comps) if ((DOMAINS.maps_to[c.id] || []).some((m) => m.domain_id === domainId)) return c.id;
  const group = (DOMAINS.competencies.find((c) => c.id === domainId) || OVERLAY.competencies.find((c) => c.id === domainId) || {}).group;
  const sameGroup = comps.find((c) => (DOMAINS.competencies.find((k) => k.id === c.id) || {}).group === group);
  if (sameGroup) return sameGroup.id;
  const GROUP_HOST = { "Craft": "craft", "Storytelling and writing": "communication", "Research and insight": "research", "Strategy and positioning": "product_thinking", "Systems thinking": "systems", "Data and measurement": "research", "Channel and media": "communication", "Stakeholder and influence": "collaboration", "Leadership": "collaboration", "Business and commercial": "product_thinking", "Tools": "building", "Domain": "domain" };
  const gh = comps.find((c) => c.id === GROUP_HOST[group]);
  return (gh || comps[0]).id;
};
export const rubricHostFor = hostOf;

const OVERLAY = DOMAINS.business_overlay || { competencies: [], blockers: [], tasks: [] };
export const BUSINESS_COMPETENCY_IDS = OVERLAY.competencies.map((c) => c.id);
export const BUSINESS_BLOCKER_KINDS = OVERLAY.blockers.map((b) => b.kind);
const nameOf = (id) => (DOMAINS.competencies.find((c) => c.id === id) || OVERLAY.competencies.find((c) => c.id === id) || {}).name || id;
const allTasks = () => [...(DOMAINS.tasks || []), ...OVERLAY.tasks];

/**
 * The business overlay (critique 5, P1-1): a person whose target is freelance, a consultancy or a business of his own is not
 * climbing an employee ladder. The six business competencies (pricing, selling, pipeline, contracts and admin, positioning, money
 * and runway) and two blockers (a first paid client or a pipeline; six months of runway) are added to the gap as extra rows,
 * labelled model estimate and unverified. Nothing here comes from a market source. Pure. Returns null for an employee target.
 */
export function businessOverlay({ profile, hoursPerWeek, completed = [] }) {
  const d = profile && profile.domain;
  if (!d || d.target_setting !== "business" || !Array.isArray(d.targets) || !d.targets.length) return null;
  const level = d.targets[0].level;
  const sit = (profile && profile.situation) || {};
  const months = num(sit.runway_months);
  const nClients = num(d.business && d.business.clients_lined_up);
  const rows = [];
  OVERLAY.competencies.forEach((c, i) => {
    const T = c.vector[level] ?? c.vector.S;
    // the only level the answers can show: money and runway, from the months of runway he gave (B-20)
    let cur = null;
    if (c.id === "financial_runway" && months !== null) cur = months >= 6 ? 3 : months >= 3 ? 2 : 1;
    const known = cur !== null;
    const capped = known ? Math.min(cur, Math.max(0, T - 1)) : null;
    const gap = Math.max(0, T - (known ? capped : Math.max(0, T - DOMAINS.distance.unknown_gap)));
    if (gap < DOMAINS.distance.open_gap_min) return;
    const steps = Math.ceil(gap / 0.5);
    const evenings = steps * (known ? DOMAINS.distance.evenings_per_half_level : DOMAINS.distance.evenings_per_half_level_unknown);
    rows.push({
      competency: c.id, index: 100 + i, gap: Math.round(gap * 100) / 100, target: T, current: known ? capped : null, current_raw: known ? cur : null,
      effective: known ? capped : Math.max(0, T - DOMAINS.distance.unknown_gap), transfer_w: 1, core: true, importance: 1, provisional: true, evidenced: false,
      known, confidence: known ? DOMAINS.distance.self_cap.confidence : null, basis: known ? "self" : "unknown", capped: known && cur > capped,
      roles: [d.targets[0].role], shared: false, carried: false, evenings, evenings_adjusted: evenings, weighted: Math.round(gap * 100) / 100,
      priority: gap, blocks_applying: true, dependents_open: 0, waits_for: [], status: "unverified", target_source: "model", business: true,
      because: ["overlay:business", "model estimate, not sourced", ...(known ? ["rule:self_cap"] : ["basis:unknown"])],
    });
  });
  const blockers = [];
  for (const b of OVERLAY.blockers) {
    const have = b.kind === "runway_months" ? months : nClients;
    const ok = have !== null && have >= b.min_count;
    if (ok) continue;
    blockers.push({
      id: `G-proof-${b.kind}`, kind: b.kind, label: b.label, needs: b.min_count, have, cleared: false, provisional: have === null, cleared_by: b.cleared_by,
      clears_with: [...b.clears_with], role: d.targets[0].role, cross_over: false, because: ["overlay:business", `proof_kind:${b.kind}`, "model estimate, not sourced"],
      status: have === null ? "unverified" : "model", business: true,
    });
  }
  const done = new Set(completed);
  const open = new Set(rows.map((r) => r.competency));
  const tasks = OVERLAY.tasks.filter((t) => !done.has(t.id) && (open.has(t.competency) || blockers.some((b) => b.clears_with.includes(t.id)))).map((t) => ({
    id: t.id, kind: t.kind, family: t.family, competency: t.competency, gap_ref: `G-${t.competency}`, minutes: t.minutes, verb: t.verb, output: t.output, task: t.task,
    min_evidence: t.min_evidence, sources: t.sources || [], because: ["overlay:business", `gap:${t.competency}`, "model estimate, not sourced"], status: "unverified",
    ...(blockers.find((b) => b.clears_with.includes(t.id)) ? { clears_blocker: blockers.find((b) => b.clears_with.includes(t.id)).id } : {}),
  }));
  // a test first, then the proofs and the asks
  const rank = { test: 0, proof: 1, ask: 2 };
  tasks.sort((a, b) => (rank[a.kind] ?? 3) - (rank[b.kind] ?? 3) || a.id.localeCompare(b.id));
  void hoursPerWeek;
  return { rows, blockers, tasks, distance: rows.reduce((s, r) => s + r.weighted, 0), evenings: rows.reduce((s, r) => s + r.evenings, 0) };
}

/** The overlay merged into a computeGap result (a copy): rows, blockers, tasks, distance and evenings include the business part. */
function withBusiness(result, biz) {
  if (!biz) return result;
  const r2 = (x) => Math.round(x * 100) / 100;
  const orderedTasks = [...biz.tasks, ...result.orderedTasks].map((t, i) => ({ ...t, order: i + 1 }));
  return {
    ...result,
    distance: r2((result.distance || 0) + biz.distance), evenings: (result.evenings || 0) + biz.evenings,
    byCompetency: [...result.byCompetency, ...biz.rows], blockers: [...biz.blockers, ...result.blockers], orderedTasks,
    basis: { ...result.basis, business_overlay: "model estimate, not sourced: pricing, selling, pipeline, contracts and admin, positioning, money and runway are added because the target is a business of his own" },
    business: true,
  };
}

/**
 * The gap from profile.domain alone (plus ratings and the rubric). Returns null when the domain flow does not apply to this
 * person. Pure. `completed` are task ids already done.
 */
export function gapFromProfile({ profile, skills, rubric, hoursPerWeek, completed = [] }) {
  const d = profile && profile.domain;
  if (!d || !Array.isArray(d.targets) || !d.targets.length) return null;
  const targets = d.targets.filter((t) => t && getRole(t.role) && (getRole(t.role) || {}).launch);
  if (!targets.length) return null;
  const fromRole = d.role_now && getRole(d.role_now) ? d.role_now : null;
  const current = currentFromRatings((skills && skills.ratings) || {}, rubric);
  const hpw = num(hoursPerWeek) ?? num(profile && profile.constraints && profile.constraints.hours_per_week) ?? 5;
  const base = computeGap({ current, targets, fromRole, sameIndustry: d.same_industry === true, constraints: { proof: proofFrom(d), claimed: claimedFrom(d), completed, hoursPerWeek: hpw, ...(fromRole ? {} : {}) } });
  if (!base.ok) return { ok: false, status: base.status, error: base.error, result: base, targets, fromRole };
  const result = withBusiness(base, businessOverlay({ profile, hoursPerWeek: hpw, completed }));
  return { ok: true, status: "ok", result, targets, fromRole, hoursPerWeek: hpw, tasks: pickTasks(result, hpw, 12), proof: proofFrom(d), business: !!result.business };
}

/**
 * The distance he can read at once (critique 5, P1-2): distance, evenings, the three largest gaps, the blockers, the basis and the
 * labels. The same record is returned by onboard.target, kept on profile.domain.gap_preview, printed by scripts/domain-gap.mjs and
 * carried by the brief, so one function says it everywhere. `at` is not part of it: a preview is equal when its numbers are equal.
 */
export function gapPreview(g, hoursPerWeek) {
  if (!g || !g.ok) return null;
  const r = g.result;
  const hpw = Math.max(1, num(hoursPerWeek) ?? num(g.hoursPerWeek) ?? 5);
  const top = [...r.byCompetency].sort((a, b) => b.gap - a.gap || a.index - b.index).slice(0, 3);
  const t0 = g.targets[0];
  return {
    label: "model estimate",
    from: g.fromRole ? { role: g.fromRole } : null,
    to: { role: t0.role, level: t0.level },
    then: g.targets.filter((t, i) => i > 0 && t.sequential).map((t) => ({ role: t.role, level: t.level })),
    distance: r.distance, evenings: r.evenings, hours_per_week: hpw, months: r.evenings === null || r.evenings === undefined ? null : Math.max(1, Math.round(r.evenings / hpw / 4.3)),
    top_gaps: top.map((x) => ({ competency: x.competency, name: nameOf(x.competency), gap: x.gap, target: x.target, current: x.current })),
    blockers: r.blockers.map((b) => ({ kind: b.kind, label: b.label, have: b.have, needs: b.needs, ...(b.claimed ? { claimed: true } : {}) })),
    basis: `from the domain model (model estimate, not sourced); ${r.byCompetency.length} competencies, ${r.blockers.length} open proof gate${r.blockers.length === 1 ? "" : "s"}${r.business ? "; business skills added because the target is a business of his own" : ""}`,
    business: r.business === true,
  };
}

/**
 * ONE counted level per rating (critique 5, P1-4). A self rating without an artifact or a test is capped in the gap (target - 1);
 * the Skills page, the gap, the map and the brief all read THIS value, never the claimed one beside a different counted one.
 * Returns { [rubricId]: { level_claimed, level_counted, capped, cap_reason } } for the ratings that map to a domain competency of
 * the open gap. A rating that maps to several domain competencies counts at the highest level any of them counts it at.
 */
export function countedRatings({ profile, skills, rubric, hoursPerWeek }) {
  const g = gapFromProfile({ profile, skills, rubric, hoursPerWeek });
  const out = {};
  if (!g || !g.ok) return out;
  const rows = Object.fromEntries((g.result.byCompetency || []).map((r) => [r.competency, r]));
  const comps = (rubric && rubric.competencies) || [];
  const byId = Object.fromEntries(comps.map((c) => [c.id, c]));
  for (const [rid, r] of Object.entries((skills && skills.ratings) || {})) {
    if (!r || r.placeholder === true || typeof r.level !== "number") continue;
    const own = byId[rid] && Array.isArray(byId[rid].maps_to) ? byId[rid].maps_to : null;
    const maps = own || DOMAINS.maps_to[rid] || (DOMAINS.competency_order.includes(rid) ? [{ domain_id: rid, factor: 1 }] : []);
    if (!Array.isArray(maps) || !maps.length) continue;
    let counted = null;
    for (const m of maps) {
      if (!(m.factor > 0)) continue;
      const row = rows[m.domain_id];
      // a domain competency with no open gap is not capped: the rating clears the target on its own
      const v = row && row.known && typeof row.current === "number" ? Math.min(r.level, Math.round((row.current / m.factor) * 100) / 100) : r.level;
      counted = counted === null ? v : Math.max(counted, v);
    }
    if (counted === null) continue;
    const capped = counted < r.level - 1e-9;
    out[rid] = { level_claimed: r.level, level_counted: counted, capped, ...(capped ? { cap_reason: `counted as ${counted} until you show a piece of work or pass a test` } : {}) };
  }
  return out;
}

/** Gap records for library.gaps (the shape gapDerivation returns), one per domain competency plus one per open blocker. */
export function domainGapEntries(g, rubric, today) {
  if (!g || !g.ok) return [];
  const r = g.result;
  const out = [];
  const taskFirst = (dom) => (r.orderedTasks || []).find((t) => t.competency === dom);
  for (const b of r.blockers || []) {
    const t = (b.clears_with || []).map((id) => allTasks().find((x) => x.id === id)).find(Boolean);
    const host = hostOf(t ? t.competency : "storytelling", rubric);
    out.push({
      competency: host, proof_blocker: b.kind, key: `b:${b.kind}`,
      title: clean(`Proof needed: ${b.label}`).slice(0, 110),
      why: clean(`Typically asked for in ${getRole(b.role).name} applications (model estimate, not sourced)${b.cross_over ? ", and proof from another family does not carry over" : ""}. You have: ${b.have === null ? "not known yet" : b.claimed ? `${b.have} proved; a number you gave is claimed at confidence ${b.claimed_confidence}, which does not count until it has a date and a source` : `${b.have} proved`}.`).slice(0, 300),
      closes_when: clean(b.cleared_by),
      now: b.have === null ? "Not known yet." : `You have ${b.have} of ${b.needs}${b.claimed ? " (a claimed number is not counted)" : ""}.`,
      level: b.have === null ? 0 : Math.min(b.have, b.needs), target: b.needs,
      evenings: 10, evenings_basis: "my estimate: one blocker proof, about 10 evenings, model estimate",
      provisional: b.provisional, target_level: b.needs, status_label: b.status,
      because: [],
    });
  }
  for (const row of r.byCompetency || []) {
    const host = hostOf(row.competency, rubric);
    const t = taskFirst(row.competency);
    const name = nameOf(row.competency);
    out.push({
      competency: host, domain_competency: row.competency, key: `d:${row.competency}`,
      title: name,
      why: clean(`The model assumes ${row.business ? "a business of your own" : `${getRole(row.roles[0]).name} work`} at level ${row.target} in ${name} (model estimate, not sourced). What is known shows ${row.current === null ? "no level yet, counted as one level short" : `level ${row.current}${row.carried ? `, carried over at ${row.transfer_w}` : ""}`}.${row.provisional ? " Unverified until an artifact or a test exists." : ""}`).slice(0, 300),
      closes_when: clean(t ? t.min_evidence : `Be able to do the work at level ${row.target}, shown by one example someone else has judged.`).slice(0, 200),
      now: clean(`Level ${row.current === null ? "unknown" : row.current}${row.provisional ? ", provisional" : ""}${row.capped ? `; counted as ${row.current} until you show a piece of work or pass a test` : ""}.`),
      level: row.current === null ? Math.max(0, row.target - 1) : row.effective, target: row.target,
      evenings: Math.min(60, row.evenings),
      evenings_basis: `my estimate: ${row.gap} levels to close at ${row.known ? 5 : 7} evenings per half level, from the domain graph`,
      transfer_w: row.transfer_w, target_level: row.target, provisional: row.provisional, status_label: row.status,
      because: [],
    });
  }
  return out;
}

/**
 * A task as kept in onboarding.derived.domain. The engine's own refs (G-<competency>, G-proof-<kind>) are symbolic: the saved
 * gaps have ids G-01 and so on, so gap_ref and clears_blocker are the SAVED ids (null until the gap is written), and gap_key
 * and blocker_key say which gap they are (d:<competency> or b:<proof kind>).
 */
export function taskRef(t, idByKey = {}) {
  const gap_key = t.gap_ref ? `d:${String(t.gap_ref).replace(/^G-/, "")}` : null;
  const blocker_key = t.clears_blocker ? `b:${String(t.clears_blocker).replace(/^G-proof-/, "")}` : null;
  return {
    id: t.id, kind: t.kind, competency: t.competency, minutes: t.minutes, week: t.week, because: t.because, status: t.status,
    gap_key, gap_ref: gap_key ? idByKey[gap_key] || null : null,
    ...(blocker_key ? { blocker_key, clears_blocker: idByKey[blocker_key] || null } : {}),
  };
}

/** The compact block kept in onboarding.derived.domain (what the brief and the skills read). */
export function domainSummary(g, sel, idByKey = {}) {
  if (!g) return null;
  if (!g.ok) return { ok: false, status: g.status, error: g.error };
  const r = g.result;
  const tgt = g.targets[0];
  return {
    ok: true, from: g.fromRole, to: { role: tgt.role, level: tgt.level }, distance: r.distance, evenings: r.evenings,
    n_gaps: r.byCompetency.length, largest: r.byCompetency.slice(0, 5).map((x) => x.competency),
    blockers: r.blockers.map((b) => b.id), waypoint: r.waypoints[0] ? { role: r.waypoints[0].role, level: r.waypoints[0].level, distance: r.waypoints[0].distance } : null,
    shared_base: r.sharedBase, role_mapped: (sel && sel.role_mapped) || {}, label: "model estimate",
    tasks: g.tasks.map((t) => taskRef(t, idByKey)),
  };
}

// ---- progress: the domain questions of a round, counted apart from the main bank (cap 19) ------------------------------

export const DOMAIN_MUST_CAP = 19;
/** The role and level questions plus one evidence question per family: the minimum viable path of the domain bank. */
export const DOMAIN_MINIMUM_VIABLE = ["DM-01", "DM-02", "DM-03", "DM-05", "DM-06", "DM-08", "DM-11", "DM-14", "DM-17", "DM-20"];

/** True when a DM question applies to this person (family rules of the bank, spec 6.3 step 3). */
export function dmApplies(q, sel) {
  if (!q.applies || !q.applies.family) return true;
  const fams = new Set();
  if (sel.family_now) fams.add(sel.family_now);
  for (const t of sel.targets || []) { const r = getRole(t.role); if (r) fams.add(r.family); }
  return fams.has(q.applies.family);
}

/**
 * Where the domain questions stand for this onboarding. Does not change `progress()` of the main bank: a person who never
 * answers DM-01 sees exactly the old numbers.
 */
export function domainProgress(ob) {
  const answers = (ob && ob.answers) || {};
  const sel = domainSelection(answers);
  const active = !!(sel.asked && sel.family_now);
  const off = new Set((ob && ob.off_limits) || []);
  const offTopics = new Set((ob && ob.off_limits_topics) || []);
  const skipped = (ob && ob.skipped) || {};
  const quick = !!(ob && ob.depth === "quick");
  const covered = (id) => { const a = answers[id]; return !!a && ["answered", "unknown", "off_limits"].includes(a.status); };
  const ruledOut = (q) => off.has(q.id) || (q.off_limit_topics || []).some((t) => offTopics.has(t));
  const offered = !sel.asked ? ["DM-01"] : [];
  if (!active) {
    return { asked: !!sel.asked, active: false, outside: !!sel.outside, family_now: null, role_now: null, targets: [], note: sel.outside ? OUTSIDE_NOTE : null, must_total: 0, must_done: 0, must_cap: DOMAIN_MUST_CAP, missing_must: [], pending: offered, by_round: {}, next_ids: offered };
  }
  const applicable = DOMAIN_BANK.filter((q) => q.id !== "DM-01" && dmApplies(q, sel) && !ruledOut(q));
  const mustFor = (q) => q.must && !(quick && !DOMAIN_MINIMUM_VIABLE.includes(q.id));
  const musts = applicable.filter(mustFor);
  const missing = musts.filter((q) => !covered(q.id));
  const by_round = {};
  for (const r of ["R0", "R1", "R2", "R3", "R4"]) {
    const m = musts.filter((q) => q.round === r);
    by_round[r] = { must_total: m.length, must_done: m.filter((q) => covered(q.id)).length, missing: m.filter((q) => !covered(q.id)).map((q) => q.id) };
  }
  const round = (ob && ob.round) || "R1";
  const pending = missing.filter((q) => q.round === round || (round !== "R0" && ["R0", "R1"].includes(q.round))).filter((q) => !skipped[q.id]).map((q) => q.id);
  const optional = quick ? [] : applicable.filter((q) => !q.must && q.round === round && !covered(q.id) && !skipped[q.id]).sort((a, b) => b.value - a.value).slice(0, round === "R1" ? 3 : 2).map((q) => q.id);
  const role = sel.targets[0] ? sel.targets[0].role : null;
  return {
    asked: true, active: true, outside: !!sel.outside, family_now: sel.family_now, role_now: sel.role_now, level_now: sel.level_now, targets: sel.targets,
    role_mapped: sel.role_mapped, same_industry: sameIndustryOf(answers), note: sel.notes.length ? sel.notes.join(" ") : null,
    must_total: musts.length, must_done: musts.length - missing.length, must_cap: DOMAIN_MUST_CAP, cap_ok: musts.length <= DOMAIN_MUST_CAP,
    missing_must: missing.map((q) => q.id), by_round, pending, optional_ids: optional, next_ids: pending,
    r2: role && R2_TEMPLATES[role] ? { role, caps: R2_TEMPLATES[role].caps, run_caps: R2_RUN_CAPS, second_target_factor: sel.targets.length > 1 ? SECOND_TARGET_CAP_FACTOR : 1, tiers: R2_TEMPLATES[role].tiers, queries: R2_TEMPLATES[role].queries, extract: R2_TEMPLATES[role].extract } : null,
  };
}

/**
 * The domain MUST questions between now and a first plan (R0 to R2), as ids, for the estimate of sittings. The estimate used to count
 * the main bank only (15 questions) while the real interview asked 24: the domain questions are counted here, by the same rules the
 * progress uses. Before DM-01 is answered the family is unknown and it may never be answered, so none is counted; the number is exact from DM-01 on.
 */
export function domainEstimateIds(ob) {
  const early = (q) => ["R0", "R1", "R2"].includes(q.round);
  const dp = domainProgress(ob);
  if (dp.asked && !dp.active) return [];
  if (dp.active) return dp.missing_must.filter((id) => domainById[id] && early(domainById[id]));
  // DM-01 not answered: a person may never take the domain path, so none is counted; the number is exact from DM-01 on
  return [];
}

export { LAUNCH_ROLES, domainById };

// ---- the rubric of a launch-role person (onboard.rubric with source "domain_graph") ----------------------------------------

const GENERIC_LEVELS = (name) => ({
  1: `Does the ${name.toLowerCase()} work with guidance`,
  2: `Does the ${name.toLowerCase()} work alone`,
  3: `Does the ${name.toLowerCase()} work well and raises the bar for others`,
  4: `Sets the standard for ${name.toLowerCase()}`,
});

/**
 * The rubric for a launch role at a level, built from the domain model: the 8 competencies the target needs most (shift rule
 * vector), each with four level descriptors. The four rubric levels are the family's scope for J, M, S and L. Model estimate.
 * Returns { competencies, levels, role, level } or null when the role has no vector.
 */
export function domainRubricFor(roleId, level, n = 8) {
  const role = getRole(roleId);
  if (!role || !role.launch) return null;
  const vec = roleVector(roleId, level);
  if (!vec) return null;
  const rows = DOMAINS.competency_order.map((id, i) => ({ id, i, v: vec[id], core: Array.isArray(role.base) && role.base[i] >= 3 })).filter((x) => x.v > 0);
  rows.sort((a, b) => b.v - a.v || Number(b.core) - Number(a.core) || a.i - b.i);
  const top = rows.slice(0, n).sort((a, b) => a.i - b.i);
  const scope = (DOMAINS.level_scope || {})[role.family] || {};
  return {
    role: roleId, level,
    levels: { 1: clean(scope.J || "Starting"), 2: clean(scope.M || "Working"), 3: clean(scope.S || "Strong"), 4: clean(scope.L || "Leading") },
    competencies: top.map((x) => {
      const c = DOMAINS.competencies.find((k) => k.id === x.id);
      return { id: x.id, name: c.name, group: "skill", levels: GENERIC_LEVELS(c.name), research: [] };
    }),
  };
}

/** The target role's name for the {target_role} placeholder of the DM questions, from the answers (never from free text). */
export function domainTargetName(answers) {
  const s = domainSelection(answers || {});
  const t = s.targets[0];
  return t && getRole(t.role) ? getRole(t.role).name : undefined;
}

/**
 * A level answer to DM-05 or DM-06 that the role's ladder has no step for. Returns a plain sentence, or null when it is fine.
 * (PR specialist has no head step: the answer is refused with the steps that exist, never saved as a target the validator rejects.)
 */
export function domainLevelProblem(answers, id, value) {
  const l = LEVEL_BY_WORD[norm(value)];
  if (!l) return null;
  const sel = domainSelection(answers || {});
  const role = id === "DM-05" ? sel.role_now : sel.target_role;
  const r = role ? getRole(role) : null;
  if (!r || !r.ladder || r.ladder[l]) return null;
  return `${r.name} has no ${WORD_BY_LEVEL[l]} step on its ladder. ${ladderWords(r.id)}`;
}

/** The options and the ladder text the brief shows for DM-05 and DM-06: only the steps the role has, with title and scope. */
export function domainLevelOptions(answers, id) {
  const sel = domainSelection(answers || {});
  const role = id === "DM-05" ? sel.role_now : sel.target_role;
  const r = role ? getRole(role) : null;
  const fam = r ? r.family : sel.family_now;
  const scope = (DOMAINS.level_scope || {})[fam] || {};
  const steps = ["J", "M", "S", "L", "H"].filter((l) => !r || (r.ladder && r.ladder[l]));
  return {
    role: r ? r.id : null,
    options: steps.map((l) => WORD_BY_LEVEL[l]),
    ladder: steps.map((l) => ({ level: WORD_BY_LEVEL[l], title: r && r.ladder && r.ladder[l] ? r.ladder[l].title : undefined, scope: clean((r && r.ladder && r.ladder[l] && r.ladder[l].scope) || scope[l] || "") })),
  };
}

/** { "d:visual_craft": "G-04", "b:portfolio_case_study": "G-01" } for the open gaps that carry a domain key. */
export function gapIdIndex(gaps) {
  const idx = {};
  for (const g of gaps || []) {
    if (!g || g.status === "closed") continue;
    if (g.proof_blocker) idx[`b:${g.proof_blocker}`] = g.id;
    else if (g.domain_competency) idx[`d:${g.domain_competency}`] = g.id;
  }
  return idx;
}
