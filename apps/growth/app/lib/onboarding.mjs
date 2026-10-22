// Onboarding logic, pure (no node built-ins, no clock beyond what the caller passes): the mapper from answers to the course,
// the progress and readiness maths, and the small patch applier. Spec: scratchpad onboarding-spec.md section 5.
//
//   applyAnswers(state, answers, { today, only }) -> { patches, tasks, gaps, demands, unknowns, contradictions, risks, ... }
//   Nothing here writes a file. The store action onboard.answer applies the patches that target profile, evidence, proof and onboarding.
import { BANK, UNKNOWN_KINDS, ADAPTIVE, resolveQuestion, ROUNDS, planSittings, MAX_PER_SITTING, sittingMax, resolveText } from "./onboarding-bank.mjs";
import { addDays, deriveDemands } from "./plan.mjs";
import { parseOffLimits } from "./onboarding-topics.mjs";
import { formatMoney } from "./money.mjs";
import "./domain-bank.mjs"; // registers the DM-* questions with resolveQuestion
import { domainEstimateIds, domainPatchesFor, domainClearPatchesFor, domainSelection, gapFromProfile, domainGapEntries, domainSummary, domainProgress, domainTargetName, gapIdIndex } from "./domain-flow.mjs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
const clean = (s) => String(s).replace(/[–—]/g, "-");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const DAYS6 = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Evenings the plan engine uses in a week (PLAN_CONFIG.per_week_evenings). Hours per night are spread over this many at most. */
const EVENINGS = 5;
const NONE_RE = /^(none|nobody|no one|nothing|n\/a|na|no)$/i;

/** Small stable hash (FNV-1a over canonical JSON). Only used to tell "same value again" from "changed". */
export function valueHash(v) {
  const s = canon(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}

/** Spec 5.7: how sure a stored value may be, from where it came from. Self report never goes above 0.5. */
export function confidenceFor({ evidence_ask = "E0", evidence = [], hasNumber = false, given } = {}) {
  let cap;
  if (evidence_ask === "E3" && evidence.length) cap = 0.8;
  else if (evidence.length) cap = 0.7;
  else if (hasNumber || evidence_ask === "E2") cap = hasNumber ? 0.5 : 0.3;
  else cap = 0.3;
  if (typeof given === "number" && Number.isFinite(given)) return Math.max(0, Math.min(cap, given));
  return cap;
}
export const confidenceBand = (c) => (c < 0.4 ? "low" : c <= 0.7 ? "medium" : "high");

/** Spec 5.4: minutes a week the plan may fill: hours x 60 x 0.9 (10 percent slack). */
export const capacityMinPerWeek = (hours) => Math.round(Number(hours) * 60 * 0.9);

/** Plain text of a value, for profile.intake and echoes. */
export function displayValue(v) {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.length === 2 && v.every((x) => typeof x === "number") ? `${v[0]} to ${v[1]}` : v.map(displayValue).join("; ");
  if (isObj(v)) return Object.entries(v).map(([k, x]) => `${k.replace(/_/g, " ")}: ${displayValue(x)}`).join(", ");
  return String(v);
}

/** Named extras kept under onboarding.notes (private for Round 3). The consumers below read them; nothing is stored only to be stored. */
const NOTE_KEYS = {
  "B-30": "history", "I-01": "self_level", "I-07": "judge", "R3-01": "avoidance", "R3-02": "exposure", "R3-03": "best_conditions",
  "R3-04": "hard_truths", "R3-05": "worst_feedback", "R3-06": "quit_pattern", "R3-09": "intrinsic", "R3-10": "critic",
  "R3-11": "cost_of_staying", "R3-12": "unjudged_action", "R3-13": "attribution", "R3-14": "criticism_reaction",
  "R3-16": "give_up", "R3-19": "enough", "T-01": "milestone_proof", "T-02": "milestone_apply", "T-04": "week4_signal",
  "T-06": "accountability", "T-08": "quit_triggers", "T-09": "premortem", "T-10": "done_when", "T-11": "tone_behind",
  "T-12": "slip_policy", "R3-08": "silence_model", "P-02": "accept_rule",
};

// A withheld answer (crisis wording in a free answer: only a placeholder is stored) is answered for coverage, and is never data.
const isAnswered = (a) => a && (a.status === "answered") && a.withheld !== true;
/** Questions whose answer claims something that can be shown (an artifact, a document, a person): the only ones that make a prove-it task. */
export const PROOF_TASK_IDS = ["B-03", "B-11", "B-24", "B-25", "B-29", "B-30", "K-01", "I-05", "I-07", "I-08", "RJ-01"];
/** The archived facts R0-04 may confirm, as the keys he sends them under (a dot or a space becomes an underscore). */
export const PRIOR_FACT_KEYS = ["role_now", "north_star_role", "north_star_salary_inr_per_month", "constraints_hours_per_day", "constraints_salary_floor_inr", "situation_notice_days", "name"];
const val = (answers, id) => (isAnswered(answers[id]) ? answers[id].value : undefined);

/** Questions that only make sense for a person with an employer. */
export const NO_EMPLOYER_IDS = ["B-25", "B-36", "E-01"];
// The whole answer is the status (optionally followed by a comma and more): "Unemployed, recent graduate", "Student", "Freelance".
// A title such as "Student nurse" or "Freelance designer on a contract" is NOT matched: that person may have a contract.
const NOT_EMPLOYED_RE = /^(currently |recently )?(unemployed|jobless|no job|not (currently )?(working|employed)|between jobs|out of work|a student|student|looking for (a )?(job|work)|self[- ]employed|freelance|freelancer|retired|homemaker|none|n\/a|na|nothing|nobody|no)\s*([,.;:].*)?$/i;
/** False when the person's own B-01 says they have no employer (no job, student, freelance ...). Unknown stays true. */
// An owner, founder or proprietor has no employer to give notice to, whatever follows the word ("Owner and operator of a restaurant").
const OWNER_RE = /^(the |a |an )?(business |restaurant |shop |store |company |co-?)?(owner|founder|proprietor|entrepreneur)\b/i;
export function employedOf(answers) {
  // S-01 is his own statement of the situation; it beats any reading of a job title.
  const s = val(answers, "S-01");
  if (typeof s === "string") return s === "employed" || s === "other";
  const v = val(answers, "B-01");
  return !(typeof v === "string" && (NOT_EMPLOYED_RE.test(v.trim()) || OWNER_RE.test(v.trim())));
}
const text = (v) => clean(displayValue(v)).trim();

/** Should this answer be mirrored into profile.intake? Answered, not private, not R0 or R3. */
export function shouldMirror(q, a) {
  return !!q && !!a && a.status === "answered" && !a.private && !["R0", "R3"].includes(q.round) && !q.follow_of;
}
export function intakeItem(q, a, today, vocab) {
  return { id: q.id, q: resolveText(q.text, vocab).replace(/\{[^}]*\}/g, "that").slice(0, 300), why: q.why, asked: a.asked && ISO.test(a.asked) ? a.asked : today, answer: clean(displayValue(a.value)), date: a.answered && ISO.test(a.answered) ? a.answered : today, source: "self", takeaway: q.changes };
}

// ---- vocabulary and units ---------------------------------------------------------------------------------

/** The words of this person's own earlier answers, for the {placeholders} in the bank. */
export function vocabOf(state, answers = {}) {
  const p = (state && state.profile) || {};
  const sit = p.situation || {};
  const b06 = answers["B-06"];
  const skill = b06 && b06.meta && typeof b06.meta.skill_area === "string" ? b06.meta.skill_area.trim() : "";
  const cur = val(answers, "R0-06") || sit.currency;
  const per = val(answers, "R0-07");
  return {
    currency: typeof cur === "string" ? cur : undefined,
    period: per === "per year" ? "year" : per === "per month" ? "month" : sit.pay_period === "year" ? "year" : undefined,
    role: val(answers, "B-01") || p.role_now || undefined,
    target_role: val(answers, "B-04") || domainTargetName(answers) || (p.north_star && p.north_star.role) || undefined,
    artifact: val(answers, "R0-10") || sit.proof_kind || undefined,
    field: val(answers, "R0-09") || sit.field || undefined,
    core_skill: skill || val(answers, "R0-09") || sit.field || undefined,
    // a business target asks for the first paying client, not an offer (critique 5, P1-1)
    outcome: domainSelection(answers).target_setting === "business" ? "your first paying client" : (p.domain && p.domain.target_setting === "business" ? "your first paying client" : undefined),
  };
}
const periodOf = (answers, state) => (vocabOf(state, answers).period === "year" ? "year" : "month");
/** Pay answers are in the person's unit; the stored fields are per month. */
const monthly = (v, period) => (period === "year" ? Math.round(v / 12) : v);
const MONEY_IDS = ["B-07", "B-08", "B-33", "B-10", "F-10"];
const currencyOf = (state, answers = {}) => vocabOf(state, answers).currency || "INR";
// The one formatter is lib/money.mjs. The code stays in front of the amount ("USD 5,167"); a symbol is never assumed.
const money = (n, cur) => formatMoney(Math.round(n), cur, "none", "en-US", { display: "code" });

// ---- P1-2: one normalisation layer for every number question ----------------------------------------------------
// A person says "12 to 18 LPA", "90,000 to 1,40,000 per month", "ten", "uh around ninety thousand a month", [10, 12] or "$5k".
// normaliseValue turns that into ONE number (or a low and a high) in the unit the question asks, or says exactly why not.
// It never clamps and never concatenates: a list is a range or a refusal, an unusual value is a confirm step with both readings.

const UNIT_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, ek: 1, teen: 3, char: 4, paanch: 5, panch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, pandrah: 15, bees: 20, pachas: 50 };
const TENS_WORDS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE_WORDS = { thousand: 1e3, thousands: 1e3, k: 1e3, hazaar: 1e3, hazar: 1e3, hajar: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, lpa: 1e5, million: 1e6, millions: 1e6, mn: 1e6, crore: 1e7, crores: 1e7, cr: 1e7, karod: 1e7 };
const SEP_RANGE = new Set(["to", "-", "through", "till", "until", "or", "and", "&", "/", "tak"]);
const PAY_IDS = ["B-07", "B-08", "B-33", "B-10", "F-10"];
/** Bounds per question. hard: refused. warn: the person is asked to confirm the reading. Never a silent clamp. */
const NUM_RULES = {
  "B-17": { unit: "hours in the last four weeks", hard: 400, warn: 200, week_x: 4 },
  "B-18": { unit: "hours a week", hard: 100, warn: 60 },
  "T-07": { unit: "hours a week", hard: 100, warn: 60 },
  "H-01": { unit: "hours a night", hard: 20, warn: 12 },
  "B-20": { unit: "months", hard: 1200, warn: 120 },
  "F-12": { unit: "months", hard: 1200, warn: 120 },
  "B-25": { unit: "days", hard: 3650, warn: 180 },
  "F-01": { unit: "approaches", hard: 100000, warn: 1000 },
  "F-02": { unit: "conversations", hard: 100000, warn: 1000 },
  "F-03": { unit: "approaches", hard: 100000, warn: 1000 },
  "B-29": { unit: "people", hard: 1000000, warn: 5000 },
};
const DOLLARS = new Set(["USD", "CAD", "AUD", "NZD", "SGD", "HKD", "MXN"]);
const CODES = ["inr", "usd", "eur", "gbp", "cad", "aud", "sgd", "aed", "jpy", "chf", "zar", "brl", "mxn", "cny", "nzd", "hkd", "pkr", "bdt", "lkr", "npr", "php", "idr", "ngn", "kes"];
const fmt = (n) => (Number.isInteger(n) ? n.toLocaleString("en-US") : String(Math.round(n * 100) / 100));

/** One number token ("1,40,000", "90,000", "12,5", "1.234,56", "12.5") to a number, or NaN. Never joins pieces. */
export function parseNumberToken(tok) {
  const t = String(tok).trim();
  if (/^\d+$/.test(t)) return Number(t);
  if (/^\d+\.\d+$/.test(t)) return Number(t);
  if (/^\d{1,3}(,\d{2})*,\d{3}(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ""));
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ""));
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^\d+,\d{1,2}$/.test(t)) return Number(t.replace(",", "."));
  return NaN;
}

/**
 * Reads every number out of free text: [{ v, scaled, scale }]. Handles digits, word numbers ("ninety thousand", "twelve point
 * five lakh", "one hundred twenty"), scales (k, lakh, crore, million, LPA), "90 000" and a spoken self correction ("90000, no
 * wait, 95000" keeps the last). Words it does not know simply end a number. Never joins two numbers into one.
 */
function scanNumbers(text, inrHint) {
  let s = String(text).toLowerCase().replace(/[–—−]/g, "-");
  const fix = /\b(no,? wait|sorry|i mean|actually|correction|scratch that|make that|rather)\b/g;
  let m; let cut = -1;
  while ((m = fix.exec(s))) cut = m.index + m[0].length;
  if (cut >= 0 && /\d|[a-z]/.test(s.slice(cut))) s = s.slice(cut);
  s = s.replace(/₹/g, " rupee ").replace(/\$/g, " dollar ").replace(/£/g, " pound ").replace(/€/g, " euro ");
  const toks = s.match(/\d[\d,.]*\d|\d|[a-z]+|[^\s\w]/g) || [];
  const groups = [];
  let total = 0; let part = null; let last = null; let firstScale = null; let lastScale = null; let point = false; let frac = ""; let digits = null; let any = false;
  const flush = () => {
    if (any) {
      let v = total + (part || 0);
      if (point && frac) v = Number(`${v}.${frac}`);
      groups.push({ v, scaled: firstScale !== null, scale: firstScale });
    }
    total = 0; part = null; last = null; firstScale = null; lastScale = null; point = false; frac = ""; digits = null; any = false;
  };
  const NUMERIC_WORD = /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|ek|teen|char|paanch|panch|chhe|saat|aath|nau|das|gyarah|barah|pandrah|bees|pachas|hundred|sau|thousand|lakh|lac|lakhs|lacs|hazaar|hazar|hajar|crore|crores|million)$/;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]; const next = toks[i + 1] || "";
    if (/^\d/.test(t)) {
      const n = parseNumberToken(t);
      if (!Number.isFinite(n)) { flush(); groups.push({ v: NaN, bad: t, scaled: false, scale: null }); continue; }
      if (point) { frac += t; any = true; continue; }
      // "90 000": a space used as the thousands separator (a 1 to 3 digit piece, then exactly three digits)
      if (part !== null && last === "digit" && digits !== null && /^\d{1,3}$/.test(digits) && /^\d{3}$/.test(t) && lastScale === null) { part = part * 1000 + n; digits = null; continue; }
      if (part !== null && last !== "scale" && last !== "hundred") flush();
      part = (part || 0) + n; last = "digit"; digits = t; any = true;
      continue;
    }
    if (t === "point" || t === "dot") { if (any && !point) { point = true; frac = ""; last = "point"; } continue; }
    const isUnit = Object.prototype.hasOwnProperty.call(UNIT_WORDS, t) || (t === "do" && /^(mahine|mahina|hazaar|hazar|hajar|lakh|lac|saal|hafte|din)$/.test(next)) || ((t === "a" || t === "an") && /^(hundred|thousand|lakh|lac|crore|million|hazaar)$/.test(next));
    if (isUnit) {
      const n = t === "do" ? 2 : t === "a" || t === "an" ? 1 : UNIT_WORDS[t];
      if (point) { frac += String(n); any = true; continue; }
      if (part !== null && last === "tens" && n < 10) { part += n; last = "unit"; continue; }
      if (part !== null && last === "hundred") { part += n; last = "unit"; continue; }
      if (part !== null && last !== "scale") flush();
      part = (part || 0) + n; last = "unit"; any = true;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(TENS_WORDS, t)) {
      if (part !== null && last === "hundred") { part += TENS_WORDS[t]; last = "tens"; continue; }
      if (part !== null && last !== "scale") flush();
      part = (part || 0) + TENS_WORDS[t]; last = "tens"; any = true;
      continue;
    }
    if (t === "hundred" || t === "sau") { part = (part === null ? 1 : part) * 100; last = "hundred"; any = true; continue; }
    // attached units: 12l (lakh, only when the money is rupees), 1.2m (million)
    const attached = t === "l" && inrHint && part !== null ? 1e5 : t === "m" && part !== null && last === "digit" ? 1e6 : null;
    const scale = attached !== null ? attached : Object.prototype.hasOwnProperty.call(SCALE_WORDS, t) ? SCALE_WORDS[t] : null;
    if (scale !== null && (part !== null || total > 0)) {
      if (lastScale !== null && scale >= lastScale) { flush(); i -= 1; continue; }
      let p = part === null ? 1 : part;
      if (point && frac) { p = Number(`${p}.${frac}`); point = false; frac = ""; }
      total += p * scale; part = null; lastScale = scale; if (firstScale === null) firstScale = scale; last = "scale"; any = true; digits = null;
      continue;
    }
    // "twelve lakh and fifty thousand": an "and" inside one amount is part of it
    if (t === "and" && last === "scale" && (/^\d/.test(next) || NUMERIC_WORD.test(next))) continue;
    flush();
  }
  flush();
  // "12 to 18 lakh": the unit said once, at the end, applies to the number before it
  if (groups.length === 2 && groups[1].scaled && !groups[0].scaled && Number.isFinite(groups[0].v) && groups[0].v > 0 && groups[0].v < groups[1].scale / 10) {
    groups[0] = { ...groups[0], v: groups[0].v * groups[1].scale, scaled: true, scale: groups[1].scale, inherited: true };
  }
  return { groups, text: s };
}

const PERIOD_RES = [
  ["month", /\b(per|a|each|every)\s*(month|mth|mo|mahina|mahine)\b|\bmonthly\b|\bpm\b|\bp\.m\.|\/\s*(month|mo)\b/],
  ["year", /\b(per|a|each|every)\s*(year|yr|annum|saal)\b|\b(yearly|annually|annual|pa|p\.a\.|lpa|ctc|per annum)\b|\/\s*(year|yr)\b/],
  ["week", /\b(per|a|each|every)\s*(week|wk|hafta|hafte)\b|\bweekly\b/],
  ["hour", /\b(per|an|a|each)\s*(hour|hr)\b|\bhourly\b|\/\s*hr?\b/],
  ["day", /\b(per|a|each)\s*day\b|\bdaily\b/],
  ["fortnight", /\b(per|a|each|every)\s*fortnight\b|\bfortnightly\b/],
  ["quarter", /\b(per|a|each|every)\s*quarter\b|\bquarterly\b/],
];
/** The period a text says ("per month", "a year", "LPA", "hourly"), "none", or "mixed" when it says two. */
export function periodIn(text) {
  const t = String(text || "").toLowerCase();
  const hit = PERIOD_RES.filter(([, re]) => re.test(t)).map(([p]) => p);
  return hit.length === 0 ? "none" : hit.length === 1 ? hit[0] : "mixed";
}
/** The currency a text names by symbol, code or word ("$", "rs", "usd", "rupees"), or null. */
export function currencyIn(text) {
  const t = String(text || "").toLowerCase();
  if (/₹|\brs\.?(?=\s|\d|$)|\brupees?\b|\binr\b/.test(t)) return "INR";
  if (/\$|\bdollars?\b|\bbucks\b/.test(t)) return "USD$";
  if (/£|\bpounds?\b|\bquid\b/.test(t)) return "GBP";
  if (/€|\beuros?\b/.test(t)) return "EUR";
  for (const c of CODES) if (new RegExp(`\\b${c}\\b`).test(t)) return c.toUpperCase();
  return null;
}

// ---- P1-2 (critique 4): units fail closed ----------------------------------------------------------------------------------
// A unit word the table does not know is a refusal that echoes the options, never a number saved in the wrong unit. Every number
// question declares its dimension; a duration is converted to the question's own unit or refused.
const UNIT_TABLE = [
  ["minute", /^(minutes?|mins?)$/],
  ["hour", /^(hours?|hrs?|ghante|ghanta|ghanten)$/],
  ["day", /^(days?|din)$/],
  ["week", /^(weeks?|wks?|hafte|hafta|haftey)$/],
  ["fortnight", /^(fortnights?)$/],
  ["month", /^(months?|mos?|mths?|mahine|mahina|mahinon)$/],
  ["quarter", /^(quarters?)$/],
  ["year", /^(years?|yrs?|saal|saalon|annum)$/],
  ["night", /^(nights?|evenings?)$/],
];
const unitOf = (w) => { for (const [k, re] of UNIT_TABLE) if (re.test(w)) return k; return null; };
const DAYS_PER = { day: 1, week: 7, fortnight: 14, month: 30, quarter: 91, year: 365 };
const MONTHS_PER = { day: 1 / 30, week: 7 / 30, fortnight: 14 / 30, month: 1, quarter: 3, year: 12 };
/** The dimension each unit-bearing number question is asked in. A question not listed here and not a pay question takes a plain number. */
const DIM = { "B-25": "days", "B-20": "months", "F-12": "months", "B-17": "hours_4w", "B-18": "hours_week", "T-07": "hours_week", "H-01": "hours_night", "F-01": "count", "F-02": "count", "F-03": "count", "B-29": "count", "E-03": "count_evenings" };
const DIM_LABEL = { days: "a length of time in days, weeks, months or years", months: "a length of time in days, weeks, months or years", hours_4w: "hours (or minutes)", hours_week: "hours (or minutes) a week", hours_night: "hours (or minutes) on a normal night", pay: "an amount with its period: per hour, day, week, fortnight, month, quarter or year", count: "a plain count, not a length of time", count_evenings: "a count of evenings" };
const FOLLOW_OK = new Set([...Object.keys(SCALE_WORDS), ...Object.keys(UNIT_WORDS), ...Object.keys(TENS_WORDS), ...CODES, "hundred", "sau", "point", "dot", "l", "m", "k", "rs", "rupee", "rupees", "pound", "pounds", "quid", "dollar", "dollars", "buck", "bucks", "euro", "euros", "to", "or", "and", "a", "an", "per", "each", "every", "in", "of", "on", "at", "for", "the", "about", "around", "approx", "approximately", "roughly", "ish", "plus", "gross", "net", "take", "home", "after", "before", "tax", "taxes", "only", "odd", "max", "maximum", "minimum", "so", "is", "was", "now", "then", "no", "wait", "sorry", "actually", "mean", "make", "that", "rather", "correction", "scratch", "i", "we", "my", "it", "um", "uh", "hmm", "like", "give", "st", "nd", "rd", "th", "x", "something", "ctc", "total", "do", "tak", "through", "till", "until", "from", "than", "less", "more", "over", "under", "up", "down", "bit", "currently", "right", "yes", "ok", "okay", "well", "just", "last", "next", "this", "that", "year", "month", "week", "day", "hour"]);
const NUMWORD = new Set([...Object.keys(UNIT_WORDS), ...Object.keys(TENS_WORDS), "hundred", "sau", "couple"]);

/** "p/w", "pw", "p.a.", "pcm", "ph" and friends to the words the period reader knows. Nothing else is rewritten. */
function expandAbbrev(s) {
  return String(s)
    .replace(/\bp\s*\/\s*w\b/gi, " per week ")
    .replace(/\bp\.\s?w\.?/gi, " per week ")
    .replace(/\bpw\b/gi, " per week ")
    .replace(/\bp\s*\/\s*a\b/gi, " per year ")
    .replace(/\bp\.\s?a\.?/gi, " per year ")
    .replace(/\bpa\b/gi, " per year ")
    .replace(/\bp\.?c\.?m\b\.?/gi, " per month ")
    .replace(/\bp\s*\/\s*m\b/gi, " per month ")
    .replace(/\bp\s*\/\s*h\b/gi, " per hour ")
    .replace(/\bp\.\s?h\.?/gi, " per hour ")
    .replace(/\bph\b/gi, " per hour ")
    .replace(/\bp\s*\/\s*d\b/gi, " per day ")
    .replace(/\bpd\b/gi, " per day ");
}
const AMBIGUOUS_PERIOD = /\b(bi-?weekly|semi-?monthly|twice a (week|month|year)|every other (week|month)|(per|every|each)\s+(\d+|two|three|four|six|eight)\s+(weeks?|months?|days?))\b/i;
const SCI = /\b\d+(\.\d+)?e[+-]?\d+\b/i;
const NEG = /(^|[\s(=:£$€₹])-\d|\b(minus|negative)\s+(?=\d|[a-z]+\s)/i;

/** Reads a duration or a count of hours in the question's own unit. Returns { refuse } | { value, converted } | { none: true }. */
function readDuration(strs, dim) {
  const kind = dim === "days" ? "days" : dim === "months" ? "months" : "hours";
  const label = DIM_LABEL[dim];
  const unitRefuse = (w) => ({ refuse: { code: "unit_unknown", message: `I do not know "${w}" as a unit for this question. It takes ${label}. Ask him to say it that way, then send it again.` } });
  let total = 0; let used = false; let multi = false; let rateF = 1; let ratePresent = false;
  for (const raw of strs) {
    let t = ` ${String(raw).toLowerCase().replace(/[–—−]/g, "-")} `;
    t = t.replace(/\bhalf an? (minute|hour|day|week|fortnight|month|quarter|year)s?\b/g, "0.5 $1");
    t = t.replace(/\b(\d+(?:\.\d+)?|an?|one)\s+(minute|hour|day|week|fortnight|month|quarter|year)s?\s+and\s+a\s+half\b/g, (m, n, u) => `${(n === "a" || n === "an" || n === "one" ? 1 : Number(n)) + 0.5} ${u}`);
    t = t.replace(/\ba couple of\b/g, "2").replace(/\bcouple of\b/g, "2");
    // a rate: "per month", "/week", "a week" (for hours), "each night"
    const rateRe = kind === "hours" ? /(?:\b(?:per|each|every)\s+|\/\s*)(minute|hour|day|week|fortnight|month|quarter|year|night|evening)s?\b|\b(?:a|an)\s+(day|week|fortnight|month|quarter|year|night|evening)s?\b/g : /(?:\b(?:per|each|every)\s+|\/\s*)(minute|hour|day|week|fortnight|month|quarter|year|night|evening)s?\b/g;
    let m;
    while ((m = rateRe.exec(t))) {
      const u = m[1] || m[2];
      ratePresent = true;
      if (kind !== "hours") return { refuse: { code: "unit_unknown", message: `He gave a rate ("per ${u}"), and this question takes ${label}, not a rate. Ask for the length itself and send that.` } };
      const per = dim === "hours_week" ? { week: 1, month: 12 / 52, year: 1 / 52 } : dim === "hours_4w" ? { week: 4, month: 48 / 52, year: 4 / 52 } : { night: 1, evening: 1, day: 1 };
      if (per[u] === undefined) return { refuse: { code: "unit_unknown", message: `"per ${u}" does not fit this question. It takes ${label}. Ask him to say the total in that unit and send it.` } };
      rateF = per[u];
    }
    t = t.replace(rateRe, " ");
    if (kind === "hours") t = t.replace(/\b(a|an|one)\s+(hour|minute)s?\b/g, "1 $2");
    else t = t.replace(/\b(a|an|one)\s+(minute|hour|day|week|fortnight|month|quarter|year)s?\b/g, "1 $2");
    const toks = t.match(/[a-zÀ-ɏ]+|\d[\d,.]*|[^\sa-z\d]/g) || [];
    let piece = [];
    for (let i = 0; i < toks.length; i++) {
      const w = toks[i];
      const u = /^[a-z]/.test(w) ? unitOf(w) : null;
      if (u && u !== "night") {
        const f = kind === "hours" ? (u === "minute" ? 1 / 60 : u === "hour" ? 1 : null) : u === "minute" || u === "hour" ? null : (kind === "days" ? DAYS_PER : MONTHS_PER)[u];
        if (f === null || f === undefined) return unitRefuse(w);
        const sc = scanNumbers([...piece, w].join(" "), false).groups;
        if (sc.length === 0) return { refuse: { code: "unit_unknown", message: `"${w}" has no number with it. Ask him how many ${w} and send that.` } };
        if (sc.length > 1) { multi = true; piece = []; continue; }
        total += sc[0].v * f; used = true; piece = [];
        continue;
      }
      piece.push(w);
    }
    // what is left after the last unit: a number with no unit next to units is a mix; unit words that are not in the table are stray
    const leftover = piece.filter((w) => w && !/^[^\w]$/.test(w));
    const sc2 = leftover.length ? scanNumbers(leftover.join(" "), false).groups : [];
    if (used && sc2.length) return { refuse: { code: "unit_unknown", message: `He gave more than one number (a length with its unit and another number with none). This question takes ${label}, one answer. Ask which one he means and send that.` } };
    const stray = leftover.find((w, i) => /^[a-z]+$/.test(w) && !FOLLOW_OK.has(w) && !unitOf(w) && i > 0 && (/^\d/.test(leftover[i - 1]) || NUMWORD.has(leftover[i - 1])));
    if (stray) return unitRefuse(stray);
    if (!used && sc2.length === 1 && ratePresent) { total += sc2[0].v; used = true; }
  }
  if (multi) return { none: true };
  if (!used) return { none: true };
  const v = total * rateF;
  return { value: Math.round(v * 10) / 10, converted: true };
}

/** Time words and unknown unit words left in a text after the recognised period phrases are removed. Returns the first, or null. */
function strayUnit(text, { allowNight = false, allowTime = false } = {}) {
  let t = ` ${text} `;
  for (const [, re] of PERIOD_RES) t = t.replace(new RegExp(re.source, "g"), " ");
  const toks = t.match(/[a-z]+|\d[\d,.]*/g) || [];
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];
    if (!/^[a-z]+$/.test(w)) continue;
    const u = unitOf(w);
    if (u && !allowTime && !(allowNight && u === "night")) return w;
    if (u || FOLLOW_OK.has(w)) continue;
    if (i > 0 && (/^\d/.test(toks[i - 1]) || NUMWORD.has(toks[i - 1]) || ["per", "each", "every"].includes(toks[i - 1]))) return w;
  }
  return null;
}

/**
 * normaliseValue(question, raw, ctx) for the two number kinds (num, numpair); anything else passes through untouched.
 *   ctx: { currency, period ("month" | "year", the unit the question asks in), unit (his words for how a bare number is to be
 *          read, e.g. "per month"), confirmed (he confirmed the reading the script echoed), hours_per_week, prose (a researched
 *          sentence, not his answer: the unit gate is off) }
 * Returns { ok, value, low, high, unit, currency, period, normalised_to, confidence, ambiguous: [{ reading, value }], warnings,
 *           converted, echo, message, code }. ok:false carries a precise `message`; for an unusual or ambiguous number it also carries
 * the readings, and the answer is sent again with ctx.unit (which reading) or ctx.confirmed (the number is right as written).
 * A unit word it cannot read is code "unit_unknown" and is never coerced.
 */
export function normaliseValue(q, raw, ctx = {}) {
  const kind = q && q.validate && q.validate.kind;
  const id = (q && q.id) || "";
  const base = { ambiguous: [], warnings: [], converted: false };
  if (kind !== "num" && kind !== "numpair") return { ok: true, value: raw, passthrough: true, ...base };
  const pay = PAY_IDS.includes(id) || id === "F-11";
  const periodic = PAY_IDS.includes(id);
  const target = ctx.period === "year" ? "year" : "month";
  const rule = NUM_RULES[id] || null;
  const dim = DIM[id] || (pay ? "pay" : null);
  const no = (message, extra = {}) => ({ ok: false, ...base, message: `${id}: ${message}`, ...extra });
  // ---- 0. the text, before any number is read: scientific notation and a sign are refusals, abbreviations are expanded
  const items0 = Array.isArray(raw) ? raw : [raw];
  const strs = [];
  let hoursFromText = null;
  for (const it of items0) {
    if (typeof it !== "string") continue;
    if (!ctx.prose) {
      if (SCI.test(it)) return no("that reads as scientific notation (1e5). Ask him to write the number in digits, for example 100000.", { code: "unit_unknown" });
      if (NEG.test(it)) return no("a negative number is not a valid answer here and the sign is never dropped. Ask what he means: write 0 if there is none, or the amount as a positive number.", { code: "negative" });
      if (AMBIGUOUS_PERIOD.test(it)) return no(`that period is ambiguous ("${it.trim().slice(0, 40)}"). Ask for a plain per ${target === "year" ? "year" : "month"} or per week figure and send that.`, { code: "unit_unknown" });
    }
    let s = expandAbbrev(it);
    if (periodic && !ctx.prose) {
      // "£15 an hour, 40 hours a week": the hours in the same answer are the hours, not a second number of a range
      const hc = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:a|per|each|every)\s*week\b/i.exec(s);
      if (hc) { hoursFromText = Number(hc[1]); s = s.replace(hc[0], " "); }
    }
    strs.push(s);
  }
  // ---- 0b. a duration or an hours figure in the question's own unit (fail closed on any other unit word)
  let durationRead = null;
  if (!ctx.prose && dim && dim !== "pay" && !dim.startsWith("count") && strs.length) {
    const r = readDuration(strs, dim);
    if (r.refuse) return no(r.refuse.message, { code: r.refuse.code });
    if (r.value !== undefined) durationRead = r;
  }
  // ---- 1. numbers out of whatever was sent
  let groups = []; let textAll = "";
  const items = Array.isArray(raw) ? raw : [raw];
  let si = 0;
  for (const it of items) {
    if (typeof it === "number") { if (!Number.isFinite(it)) return no("needs a number, not a value that is not finite."); groups.push({ v: it, scaled: false, scale: null }); textAll += ` ${it}`; }
    else if (typeof it === "string") { const sc = scanNumbers(strs[si], ctx.currency === "INR" || /lakh|lac|lpa|₹/i.test(it)); si += 1; groups.push(...sc.groups); textAll += ` ${sc.text}`; }
    else return no("needs a number. Nothing in that looks like one.");
  }
  if (durationRead) { groups = [{ v: durationRead.value, scaled: false, scale: null }]; }
  const bad = groups.find((g) => !Number.isFinite(g.v));
  if (bad) return no(`I cannot read "${bad.bad || "that"}" as a number. Ask him to say it as digits, for example 90000.`);
  if (!groups.length) return no(`needs a number, and none was found in "${String(Array.isArray(raw) ? raw.join(", ") : raw).slice(0, 60)}".`);
  if (groups.length > 2) return no(`I found ${groups.length} numbers (${groups.map((g) => fmt(g.v)).join(", ")}). This question takes one number${kind === "numpair" ? " pair, a low and a high" : ""}. Ask which one he means and send that.`, { numbers: groups.map((g) => g.v) });
  if (kind === "num" && groups.length === 2) {
    const [lo, hi] = [groups[0].v, groups[1].v].sort((a, b) => a - b);
    return no(`he gave a range, ${fmt(lo)} to ${fmt(hi)}. This question takes one number. Ask "Which one number would you bet on?" and send that, or send status unknown. Never send the range.`, { low: lo, high: hi, is_range: true, value: null });
  }
  if (kind === "numpair" && groups.length === 1) return no(`needs a low value and a high value; I found only ${fmt(groups[0].v)}. Ask for both.`);
  let nums = groups.map((g) => g.v);
  if (kind === "numpair" && nums[0] > nums[1]) nums = [nums[1], nums[0]];
  // ---- 1b. any time word or unit word left over that no rule above consumed is not guessed at
  if (!ctx.prose && !durationRead && dim) {
    const stray = strayUnit(textAll, { allowNight: dim === "count_evenings" });
    if (stray) return no(`I do not know "${stray}" as a unit for this question. It takes ${DIM_LABEL[dim]}. Ask him to say it that way, then send it again.`, { code: "unit_unknown" });
  }
  // ---- 2. what the words around the number say: currency, period, noise
  const said = durationRead ? "none" : periodIn(textAll);
  if (said === "mixed") return no('the answer names two different periods (for example "per month" and "per year"). Ask for one and send it.');
  const unitSaid = ctx.unit ? periodIn(ctx.unit) : "none";
  const explicit = said !== "none" ? said : unitSaid !== "none" && unitSaid !== "mixed" ? unitSaid : "none";
  const hoursPerWeek = hoursFromText !== null ? hoursFromText : Number(ctx.hours_per_week);
  let currency = null;
  if (pay) {
    const det = currencyIn(textAll);
    const have = typeof ctx.currency === "string" ? ctx.currency.toUpperCase() : null;
    if (det) {
      const code = det === "USD$" ? (have && DOLLARS.has(have) ? have : "USD") : det;
      if (have && code !== have) return no(`he wrote ${det === "USD$" ? "a dollar sign" : det}, but his currency (R0-06) is ${have}. Ask which is right: send R0-06 again to change the currency, or send the amount in ${have}.`);
      currency = code;
    } else currency = have;
    if (/\blpa\b|\blakh|\blac\b|\bcrore\b/.test(textAll) && currency && currency !== "INR" && !det) return no(`lakh and crore are Indian units, but his currency is ${currency}. Ask him to say the figure in ${currency}, or send R0-06 again if the currency is wrong.`);
  }
  // ---- 3. period (pay) and unit (hours): convert to what the question asks
  let converted = durationRead ? true : false; let confidence = durationRead ? 0.8 : 0.95; let unitLabel = rule ? rule.unit : pay ? (periodic ? `${target === "year" ? "per year" : "per month"}` : "total") : "number";
  const toTarget = (v, from) => {
    if (from === "hour") {
      if (!(hoursPerWeek > 0)) return null;
      return target === "year" ? v * hoursPerWeek * 52 : (v * hoursPerWeek * 52) / 12;
    }
    const perYear = from === "year" ? v : from === "month" ? v * 12 : from === "week" ? v * 52 : from === "fortnight" ? v * 26 : from === "quarter" ? v * 4 : null;
    if (perYear === null) return null;
    return target === "year" ? perYear : perYear / 12;
  };
  if (periodic) {
    if (explicit === "day") return no("he gave a per day figure. This question takes a figure per " + target + ". Ask for the total, or how many days a month he works, and send the total.");
    if (explicit === "hour" && !(hoursPerWeek > 0)) return no("he gave an hourly rate. Ask how many hours a week he works, then send the answer again with the monthly total (the rate times those hours times 52 over 12).");
    if (explicit !== "none" && explicit !== target) {
      const conv = nums.map((n) => toTarget(n, explicit));
      if (conv.some((c) => c === null)) return no(`I cannot convert "${explicit}" to per ${target}.`, { code: "unit_unknown" });
      nums = conv; converted = true; confidence = 0.8;
    }
    // a bare number with no unit in the words, none sent, and not confirmed: an unusual size is asked, never guessed
    if (explicit === "none" && ctx.confirmed !== true) {
      const top = Math.max(...nums);
      const amb = [];
      if (target === "month" && top >= 600000) amb.push({ reading: `${fmt(top)} per month`, value: top }, { reading: `${fmt(top)} per year, which is ${fmt(Math.round(top / 12))} per month`, value: Math.round(top / 12) });
      else if (target === "year" && top > 0 && top < 15000) amb.push({ reading: `${fmt(top)} per year`, value: top }, { reading: `${fmt(top)} per month, which is ${fmt(top * 12)} per year`, value: top * 12 });
      else if (currency === "INR" && top >= 1 && top <= 200 && !groups.some((g) => g.scaled)) amb.push({ reading: `${fmt(top)} rupees ${target === "year" ? "a year" : "a month"}`, value: top }, { reading: `${fmt(top)} lakh a year, which is ${fmt(top * 100000)} a year (${fmt(Math.round((top * 100000) / 12))} per month)`, value: target === "year" ? top * 100000 : Math.round((top * 100000) / 12) });
      else if (currency !== "INR" && top > 0 && top < 100) amb.push({ reading: `${fmt(top)}`, value: top }, { reading: `${fmt(top)} thousand, which is ${fmt(top * 1000)}`, value: top * 1000 });
      if (amb.length) {
        const sentence = amb.map((a) => a.reading).join(", or ");
        return no(`"${String(Array.isArray(raw) ? raw.join(" to ") : raw).slice(0, 40)}" could mean ${sentence}. Ask which one, then send the answer again with unit set to "per month" or "per year", or with reading_confirmed true if the number is right as written.`, { ambiguous: amb, needs_confirm: true });
      }
    }
    const monthly = target === "year" ? nums.map((n) => n / 12) : nums;
    if (monthly.some((n) => n < 0)) return no("a pay figure cannot be below zero.", { code: "negative" });
    if (ctx.confirmed !== true && monthly.some((n) => n > 5000000)) return no(`${fmt(Math.max(...monthly))} per month is far above any usual pay in one month. Echo it back ("${fmt(Math.max(...nums))} per ${target}, right?") and send the answer again with reading_confirmed true only if he says yes.`, { needs_confirm: true, warnings: ["very high"] });
    unitLabel = `${currency || "currency not set"} per ${target}`;
  } else if (id === "F-11") {
    if (nums.some((n) => n < 0)) return no("a debt total cannot be below zero. Write 0 if nothing is owed.", { code: "negative" });
    unitLabel = `${currency || "currency not set"} in total`;
  } else if (rule) {
    if (!durationRead) {
      if (explicit === "day" && id !== "H-01") return no(`he gave a per day figure. This question asks for ${rule.unit}. Ask for the figure in ${rule.unit}.`);
      if (rule.week_x && explicit === "week") { nums = nums.map((n) => n * rule.week_x); converted = true; confidence = 0.8; }
      else if (explicit === "month" && /hours/.test(rule.unit) && id !== "B-17") { nums = nums.map((n) => (n * 12) / 52); converted = true; confidence = 0.7; }
    }
    if (nums.some((n) => n < 0)) return no(`cannot be below zero.`, { code: "negative" });
    if (nums.some((n) => n > rule.hard)) return no(`${fmt(Math.max(...nums))} ${rule.unit} is not possible (the most this question accepts is ${fmt(rule.hard)}). Ask again and send the number he means.`, { hard: rule.hard });
    if (ctx.confirmed !== true && nums.some((n) => n > rule.warn)) return no(`${fmt(Math.max(...nums))} ${rule.unit} is unusually high. Echo it back and send the answer again with reading_confirmed true only if he says yes.`, { needs_confirm: true, warnings: ["high"] });
  } else if (nums.some((n) => n < 0)) return no("cannot be below zero.", { code: "negative" });
  if (explicit === "none" && !converted && groups.some((g) => g.scaled)) { confidence = 0.85; converted = true; }
  if (groups.some((g) => g.inherited)) { confidence = Math.min(confidence, 0.85); }
  const round = (n) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100);
  nums = nums.map(round);
  const origText = Array.isArray(raw) ? raw.join(" to ") : String(raw);
  const typed = typeof raw === "number" || (Array.isArray(raw) && raw.every((x) => typeof x === "number"));
  const out = { ok: true, ...base, converted, confidence, unit: durationRead && dim && DIM_UNIT[dim] ? DIM_UNIT[dim] : unitLabel, currency, period: periodic ? target : null, normalised_to: durationRead && dim && DIM_UNIT[dim] ? DIM_UNIT[dim] : unitLabel };
  if (kind === "num") Object.assign(out, { value: nums[0], low: nums[0], high: nums[0] });
  else Object.assign(out, { value: [nums[0], nums[1]], low: nums[0], high: nums[1] });
  if (!typed && (converted || String(origText).trim() !== String(nums[0]))) out.echo = `I heard: ${kind === "num" ? fmt(nums[0]) : `${fmt(nums[0])} to ${fmt(nums[1])}`} ${out.unit}${converted ? ` (you said ${origText.trim().slice(0, 60)})` : ""}. Right?`;
  if (!typed) out.confidence = Math.min(out.confidence, converted ? 0.8 : 0.9);
  return out;
}
const DIM_UNIT = { days: "days", months: "months", hours_4w: "hours in the last four weeks", hours_week: "hours a week", hours_night: "hours a night" };

/**
 * A researched pay figure written as a sentence ("12 to 18 LPA", "90,000 to 1,40,000 per month", "median 5,000 USD") as { low, high,
 * currency, period } in the person's own period, or null when the sentence holds more or fewer than one number or one pair. The
 * model no longer converts units by hand, and I-03 shows the researched range in the unit the person thinks in.
 */
export function parseRangeClaim(text, ctx = {}) {
  const have = typeof ctx.currency === "string" ? ctx.currency.toUpperCase() : null;
  const named = currencyIn(text);
  const cur = named && named !== "USD$" ? named : named === "USD$" ? (have && DOLLARS.has(have) ? have : "USD") : have;
  // prose: a researched sentence, not his answer. The unit gate and the sign rule are for what a person says.
  const base = { currency: cur, period: ctx.period === "year" ? "year" : "month", confirmed: true, prose: true };
  for (const q of [{ id: "B-08", validate: { kind: "numpair" } }, { id: "B-07", validate: { kind: "num" } }]) {
    const r = normaliseValue(q, text, base);
    if (r.ok) return { low: r.low, high: r.high, currency: r.currency || cur || null, period: base.period, converted: r.converted === true };
  }
  return null;
}

// ---- hours: one function, computed from every input there is, provisional until they all exist ---------------

/**
 * One truth for hours. T-07 (the number he would bet on) wins over B-18, unless it is more than 25 percent above B-18 and that
 * contradiction is not yet decided: then the lower number is used. Nights are the Mon to Sat nights not blocked, at most 5.
 * Per night never exceeds the focus hours he named in H-01. Provisional until B-18 and B-19 have an answer or an unknown.
 */
export function hoursInfo(answers, existingContradictions = []) {
  const plan = isAnswered(answers["B-18"]) ? num(answers["B-18"].value) : answers["B-18"] && answers["B-18"].status === "unknown" ? 5 : null;
  const planAssumed = !!(answers["B-18"] && answers["B-18"].status === "unknown");
  const bet = num(val(answers, "T-07"));
  const blockedAns = answers["B-19"];
  const blocked = (val(answers, "B-19") || []).filter((d) => DAYS6.includes(d));
  let perWeek = plan; let basis = planAssumed ? "B-18 unknown, assumed 5" : "B-18";
  if (bet !== null) {
    const c = existingContradictions.find((x) => x.id.startsWith("C-02:B-18~T-07"));
    const undecided = plan !== null && bet > plan * 1.25 && (!c || c.status === "open");
    if (undecided) basis = "B-18 (T-07 is higher and not yet decided)"; else { perWeek = bet; basis = "T-07"; }
  }
  let nights = Math.max(1, Math.min(EVENINGS, 6 - blocked.length));
  // E-03: evenings he really has energy for. Hours of focus are not energy: a person who is drained says "2 hours" and means none.
  const evenings = num(val(answers, "E-03"));
  if (evenings !== null) nights = Math.max(1, Math.min(nights, evenings));
  let perDay = perWeek === null ? null : Math.max(0.5, Math.round((perWeek / nights) * 10) / 10);
  const focus = num(val(answers, "H-01"));
  let capped = false;
  if (perDay !== null && focus !== null && perDay > focus) { perDay = Math.max(0.5, focus); capped = true; }
  const missing = [];
  if (!blockedAns || !["answered", "unknown"].includes(blockedAns.status)) missing.push("B-19");
  if (plan === null && bet === null) missing.push("B-18");
  if (focus === null && !(answers["H-01"] && answers["H-01"].status === "unknown")) missing.push("H-01");
  return { per_week: perWeek, per_day: perDay, nights, basis, capped_by_focus: capped, provisional: missing.includes("B-19") || missing.includes("B-18"), missing };
}
const hoursBasisText = (h) => (h.provisional ? `provisional: ${h.missing.join(", ")} not answered yet (${h.basis})` : `${h.basis}${h.capped_by_focus ? ", per night capped by H-01" : ""}`);

// ---- patches ----------------------------------------------------------------------------------------------

function patchBase(a, id, today, extra = {}) {
  return { because: [id], as_of: today, confidence: a.confidence, reviewed_by: "dev", question: id, ...extra };
}

const LEARN_MODE = { "no, always make or practise something": "make_only", "yes, a few": "mixed", "yes, freely": "free" };
const splitSentences = (s) => String(s).split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length >= 8).slice(0, 3);
const nextProofNo = (state) => ((state.proof && state.proof.items) || []).length;

/** Per question rule: returns the patches one answer makes. file/path are relative to that data file. */
function patchesFor(id, a, answers, ctx) {
  const { today } = ctx;
  const out = [];
  const set = (file, path, value, extra) => out.push({ file, path, value, op: "set", ...patchBase(a, id, today, extra) });
  const append = (file, path, value, extra) => out.push({ file, path, value, op: "append", ...patchBase(a, id, today, extra) });
  const v = a.value;
  const prof = ctx.state.profile || {};
  const period = periodOf(answers, ctx.state);
  const mo = (x) => monthly(x, period);
  const curNow = vocabOf(ctx.state, answers).currency;
  /** The currency (and the period, always month: the stored figure is per month) that travel with a money field. */
  const unit = (group, stem, withPeriod = true) => {
    if (!curNow) return;
    set("profile", `${group}.${stem}_currency`, String(curNow).toUpperCase());
    if (withPeriod) set("profile", `${group}.${stem}_period`, "month");
  };
  const hours = () => {
    const h = hoursInfo(answers, ((ctx.state.onboarding || {}).contradictions) || []);
    if (h.per_week !== null) {
      set("profile", "constraints.hours_per_week", h.per_week);
      set("profile", "constraints.hours_per_day", h.per_day);
      set("profile", "constraints.hours_basis", hoursBasisText(h));
    }
  };
  switch (id) {
    case "R0-01": { const n = num(Number(v)); set("onboarding", "sitting.budget_min", n); set("onboarding", "sitting.max", sittingMax(n)); break; }
    case "R0-02": set("onboarding", "tone", { straight: "straight", "straight with check-ins": "straight_checkins", slower: "slower" }[String(v)] || "straight_checkins"); break;
    case "R0-03": {
      // P1-1: his words become topics, the topics become question ids. off_limits stays the list of ids (progress, the brief and
      // the answer guard all read it so); his words, the topics and an explicit "nothing is off limits" are kept beside it.
      const off = parseOffLimits(Array.isArray(v) ? v : [v], today, ((ctx.state.onboarding || {}).boundary_map) || {});
      set("onboarding", "off_limits", off.ids);
      set("onboarding", "off_limits_words", off.words);
      set("onboarding", "off_limits_topics", off.topics);
      set("onboarding", "off_limits_none", off.none);
      set("onboarding", "off_limits_unmatched", off.unmatched);
      set("onboarding", "skipped_by_boundary", off.boundary);
      break;
    }
    case "R0-04": {
      const entries = Array.isArray(v) ? v : Object.entries(v || {});
      for (const e of entries) {
        const key = Array.isArray(e) ? e[0] : e.id;
        const raw = Array.isArray(e) ? e[1] : e.answer;
        // Only the archived facts can be confirmed (PRIOR_FACT_KEYS): a made up key is refused by onboard.answer before it gets here.
        if (!PRIOR_FACT_KEYS.includes(String(key).replace(/[.\s]+/g, "_"))) continue;
        const norm = raw === "still true" || raw === "still_true" ? "still_true" : raw === "changed" ? "changed" : "unsure";
        if (key) out.push({ file: "prior", path: `confirmed.${String(key).replace(/[.\s]+/g, "_")}`, value: norm, op: "set", ...patchBase(a, id, today) });
      }
      break;
    }
    case "R0-05": if (/^yes/i.test(String(v))) set("onboarding", "consent.R0", today); break;
    case "R0-11": set("onboarding", "depth", ["quick", "standard", "deep"].includes(String(v)) ? String(v) : "standard"); break;
    case "S-01": set("profile", "situation.status", String(v)); break;
    case "S-02": set("profile", "situation.obligations", v.map(clean)); break;
    case "X-01": set("profile", "exploration.energisers", clean(v)); break;
    case "X-02": set("profile", "exploration.field_or_job", String(v)); break;
    case "X-03": set("profile", "exploration.try_month", clean(v)); break;
    case "A-01": set("profile", "strengths", v.map(clean)); break;
    case "Q-01": set("profile", "situation.education", clean(v)); break;
    case "M-01": set("profile", "situation.can_move", String(v)); break;
    case "D-01": set("profile", "situation.hard_date", String(v)); break;
    case "R0-06":
      set("profile", "situation.currency", String(v).toUpperCase());
      // Every money answer already given carries the (new) currency too.
      for (const mid of [...MONEY_IDS, "F-11"]) if (answers[mid] && isAnswered(answers[mid])) out.push(...patchesFor(mid, answers[mid], answers, { ...ctx, state: { ...ctx.state, profile: { ...(ctx.state.profile || {}), situation: { ...((ctx.state.profile || {}).situation || {}), currency: String(v).toUpperCase() } } } }));
      break;
    case "R0-07":
      set("profile", "situation.pay_period", v === "per year" ? "year" : "month");
      // Every pay answer already given is re-read in the new unit.
      for (const mid of MONEY_IDS) if (answers[mid] && isAnswered(answers[mid])) out.push(...patchesFor(mid, answers[mid], answers, { ...ctx, forcePeriod: v === "per year" ? "year" : "month" }));
      break;
    case "R0-08": set("profile", "situation.country", clean(v)); break;
    case "R0-09": set("profile", "situation.field", clean(v)); break;
    case "R0-10": set("profile", "situation.proof_kind", clean(v)); break;
    case "B-01": set("profile", "role_now", clean(v)); break;
    case "B-32": set("profile", "situation.role_start", v); break;
    case "B-31": set("profile", "baseline.time_use", v); break;
    case "B-03": append("evidence", "entries", { date: today, type: "shipped", title: clean(String(v.name)).slice(0, 120), detail: clean(`Last finished: ${v.name}, done in ${v.month}. Reported by the person${a.evidence && a.evidence.length ? ", with an artifact." : ", no artifact seen yet."}`), links: (a.evidence || []).filter((x) => /^https?:\/\//.test(x)) }); break;
    case "B-04": set("profile", "north_star.role", clean(v)); break;
    case "B-05": set("profile", "north_star.waypoint", { role: clean(v) }); break;
    // P1-4: a money field stays under its old name (compatibility) and always travels with its currency and period.
    case "B-07": set("profile", "baseline.salary_now_inr", mo(v)); unit("baseline", "salary_now"); break;
    case "B-08": set("profile", "baseline.salary_range", [mo(v[0]), mo(v[1])]); unit("baseline", "salary_range"); break;
    case "B-33": set("profile", "north_star.salary_inr_per_month", mo(v)); unit("north_star", "salary"); break;
    case "F-10": set("profile", "situation.fixed_costs_monthly", mo(v)); unit("situation", "fixed_costs"); break;
    case "B-09": set("profile", "baseline.salary_why", clean(v)); break;
    case "B-10": set("profile", "constraints.salary_floor_inr", mo(v)); unit("constraints", "salary_floor"); break;
    case "B-11": set("profile", "baseline.salary_source", String(v)); break;
    case "B-12": {
      // Idempotent by value: this answer's own earlier values (its history) are replaced, never appended to.
      const have = ((ctx.state.profile || {}).north_star || {}).recognition || [];
      const line = clean(v);
      const mine = new Set((Array.isArray(a.history) ? a.history : []).map((h) => clean(displayValue(h.value))));
      const keep = have.filter((x) => !mine.has(x));
      set("profile", "north_star.recognition", keep.includes(line) ? keep : [...keep, line]);
      break;
    }
    case "B-13": case "B-14": {
      const top = val(answers, "B-13"); const last = val(answers, "B-14");
      const order = [];
      if (top) order.push(top);
      if (last && last !== top) order.push(last);
      set("profile", "baseline.priority", order);
      break;
    }
    case "B-15": {
      const have = ((ctx.state.profile || {}).constraints || {}).avoid || [];
      set("profile", "constraints.avoid", [...have, ...v.map(clean).filter((x) => !have.includes(x))]);
      set("profile", "baseline.refusals", v.map(clean));
      break;
    }
    case "B-16": if (v !== undefined) set("profile", "north_star.timeline", v === "none" ? "No fixed deadline." : `Be in the next role by ${v}.`); break;
    case "B-17": set("profile", "baseline.hours_actual_4w", v); break;
    case "B-18": case "B-19": case "T-07": case "H-01": case "E-03":
      if (id === "E-03") set("profile", "constraints.energy_evenings", v);
      if (id === "H-01") set("profile", "constraints.focus_hours_weekday", v);
      if (id === "B-19") set("profile", "constraints.blocked_days", (v || []).filter((d) => DAYS6.includes(d)));
      if (id === "T-07") { set("profile", "pace", v <= 3 ? "lighter" : v <= 5 ? "steady" : "push"); }
      hours();
      break;
    case "B-20": set("profile", "situation.runway_months", v); break;
    case "F-11": set("profile", "situation.debt_total", v); unit("situation", "debt", false); break;
    case "F-12": set("profile", "situation.household_cover_months", v); break;
    case "F-01": set("profile", "baseline.funnel", { ...(((ctx.state.profile || {}).baseline || {}).funnel || {}), approaches: v }); break;
    case "F-02": set("profile", "baseline.funnel", { ...(((ctx.state.profile || {}).baseline || {}).funnel || {}), conversations: v }); break;
    case "F-03": set("profile", "baseline.funnel", { ...(((ctx.state.profile || {}).baseline || {}).funnel || {}), adjusted: v }); break;
    case "B-24": set("profile", "baseline.interviews", v.map((x) => clean(displayValue(x)))); break;
    case "B-25": set("profile", "situation.notice_days", v); break;
    case "B-36": set("profile", "situation.notice_paid", String(v)); break;
    case "B-26": set("profile", "situation.location_pref", v); break;
    case "B-35": set("profile", "situation.places", v.map(clean)); break;
    case "B-27": set("profile", "situation.dependents", v.map(clean)); break;
    case "B-28": set("profile", "situation.work_auth", String(v)); break;
    case "B-29": set("profile", "baseline.network_size", v); break;
    case "E-01": set("profile", "situation.work_limits", String(v)); break;
    case "E-02": set("profile", "situation.internal_option", clean(v)); break;
    case "P-01": set("profile", "constraints.risk_stance", String(v)); break;
    case "L-01": if (!(answers["R3-03"] && answers["R3-03"].confirmed)) set("profile", "constraints.learns_best_by", clean(v)); break;
    case "P-04": set("profile", "constraints.learning_mode", LEARN_MODE[String(v)] || "mixed"); break;
    case "H-02": if (!NONE_RE.test(String(v).trim())) set("profile", "constraints.known_disruptions", [clean(v)]); break;
    case "K-01": set("profile", "situation.history", v.map(clean)); break;
    case "K-02": set("profile", "situation.history_reason", clean(v)); break;
    case "W-01": set("profile", "north_star.trigger", clean(v)); break;
    case "CR-01": set("profile", "situation.credential", String(v)); break;
    case "I-06": if (v && v !== "none") set("profile", "baseline.refusals", [...new Set([...(((ctx.state.profile || {}).baseline || {}).refusals || []), clean(v)])]); break;
    case "I-05": {
      let n = nextProofNo(ctx.state);
      (Array.isArray(v) ? v : []).forEach((req, i) => { n += 1; append("proof", "items", { id: `pr-i05-${i + 1}`, name: clean(`Show proof of: ${req}`).slice(0, 110), status: "missing", priority: n, note: "You said you have done this but could not show proof today.", evidence: [], why: "Work without proof cannot be used in an application.", as_of: today, reviewed_by: "claude" }); });
      break;
    }
    case "I-08": {
      const t = clean(v);
      if (!/^nothing found$/i.test(t) && t.length >= 3) append("evidence", "entries", { date: today, type: "note", title: "What a stranger finds first", detail: clean(`Searching the name finds: ${t}`).slice(0, 300), links: (a.evidence || []).filter((x) => /^https?:\/\//.test(x)) });
      const n = nextProofNo(ctx.state) + 1;
      append("proof", "items", { id: "pr-i08", name: "What a stranger finds first when they search your name", status: /^nothing found$/i.test(t) ? "missing" : "draft", priority: n, note: clean(t).slice(0, 160), evidence: [], why: "A first screen decides whether the rest is read.", as_of: today, reviewed_by: "claude" });
      break;
    }
    case "RJ-01": if (!NONE_RE.test(String(v).trim())) append("evidence", "entries", { date: today, type: "note", title: "Feedback from a rejection", detail: clean(`In their words: ${v}`).slice(0, 300), links: [] }); break;
    case "R3-03": if (a.confirmed) set("profile", "constraints.learns_best_by", clean(v)); break;
    case "R3-05": case "R3-10": case "R3-08": {
      const have = prof.beliefs_to_test || [];
      const items = id === "R3-08" ? (Array.isArray(v) ? v : []).map((g) => clean(g)) : id === "R3-10" ? splitSentences(v) : [clean(v).slice(0, 160)];
      const fresh = items.filter((b) => b && !have.some((x) => x.belief === b)).map((b) => ({ belief: b.slice(0, 160), counter: id === "R3-08" ? "Tested against the numbers in F-01 to F-03" : "Tested against your own work in the first review", status: "untested" }));
      if (fresh.length) set("profile", "beliefs_to_test", [...have, ...fresh]);
      break;
    }
    case "R3-07": { const n = nextProofNo(ctx.state) + 1; append("proof", "items", { id: "pr-r3-07", name: "Rebuild or replace the piece of work you named in Round 3", status: "missing", priority: n, note: "You named it as work you would remove.", evidence: [], why: "Weak public work costs more than none.", as_of: today, reviewed_by: "claude" }, { private: true }); break; }
    case "R3-16": { const have = (prof.constraints || {}).stop_doing || []; const line = clean(v); if (!have.includes(line)) set("profile", "constraints.stop_doing", [...have, line]); break; }
    case "R3-17": if (a.confirmed) { const have = ((ctx.state.profile || {}).constraints || {}).avoid || []; set("profile", "constraints.avoid", [...have, ...(have.includes(clean(v)) ? [] : [clean(v)])]); } break;
    case "R3-18": if (a.confirmed) set("profile", "north_star.feeling", /^\s*no\b/i.test(String(v)) ? "right" : "not_mine"); break;
    case "T-03": if (v !== undefined) set("profile", "north_star.timeline", v === "unknown" || v === "none" ? "No fixed deadline." : `Have ${domainSelection(answers).target_setting === "business" ? "your first paying client" : "an offer"} by ${v}.`); break;
    case "T-05": { const have = (prof.constraints || {}).stop_doing || []; set("profile", "constraints.stop_doing", [...have.filter((x) => !v.map(clean).includes(x)), ...v.map(clean)]); break; }
    case "P-03": set("profile", "constraints.stay_rule", clean(v)); break;
    default:
      // the domain graph: DM-* answers write profile.domain.* (lib/domain-flow.mjs)
      if (/^DM-\d+/.test(id)) for (const dp of domainPatchesFor(id, a, answers, today)) out.push({ ...dp, ...patchBase(a, id, today) });
      break;
  }
  if (NOTE_KEYS[id]) out.push({ file: "onboarding", path: `notes.${NOTE_KEYS[id]}`, value: v, op: "set", ...patchBase(a, id, today, id.startsWith("R3") ? { private: true } : {}) });
  return out;
}

/** Apply a list of patches to a deep copy of the touched files. Pure. Returns { state, touched }. Appends get ids ev-NNN unless they carry one. */
export function applyPatches(state, patches) {
  const next = { ...state };
  const touched = new Set();
  const copy = (f) => { if (!touched.has(f)) { next[f] = JSON.parse(JSON.stringify(next[f] === undefined ? {} : next[f])); touched.add(f); } return next[f]; };
  for (const p of patches) {
    const root = copy(p.file);
    const parts = p.path.split(".");
    let o = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!isObj(o[parts[i]])) o[parts[i]] = {};
      o = o[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (p.op === "append") {
      if (!Array.isArray(o[last])) o[last] = [];
      const item = { ...p.value };
      if (item.id === undefined) {
        const ns = o[last].map((x) => parseInt(String(x.id).replace(/^\D+/, ""), 10)).filter((n) => !Number.isNaN(n));
        item.id = `ev-${String((ns.length ? Math.max(...ns) : 0) + 1).padStart(3, "0")}`;
        if (!o[last].some((x) => x.type === item.type && x.title === item.title && x.date === item.date)) o[last].push(item);
      } else if (!o[last].some((x) => x.id === item.id)) o[last].push(item);
    } else o[last] = p.value;
  }
  return { state: next, touched: [...touched] };
}

// ---- unknowns -------------------------------------------------------------------------------------

const NIGHT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function placementOf(text, seq, today) {
  const w = /week\s*(\d)/i.exec(text || "");
  const n = /night[s]?\s*(\d)/i.exec(text || "");
  const week = w ? Math.min(4, Number(w[1])) : 1;
  const night = n ? Math.min(6, Number(n[1])) : (seq % 3) + 1;
  return { week, day: NIGHT_DAYS[night - 1], because: clean(text || "Needed before the plan can size the related gap"), due: addDays(today, (week - 1) * 7 + night) };
}
const nextUnknownId = (ledger, seq = 0) => {
  const ids = (ledger || []).map((x) => parseInt(String(x.id).replace(/^U-/, ""), 10)).filter((n) => !Number.isNaN(n));
  return `U-${String((ids.length ? Math.max(...ids) : 0) + 1 + seq).padStart(3, "0")}`;
};

/** Builds one ledger item for a question the answer of which is "I don't know" (or skipped twice). */
export function unknownFor(q, status, ledger, today, seq = 0, vocab) {
  const spec = q.unknown || {};
  if (!spec.task_kind || spec.task_kind === "none") return null;
  const k = UNKNOWN_KINDS[spec.task_kind];
  if (!k) return null;
  const id = nextUnknownId(ledger, seq);
  const base = q.id.replace(/\.f\d$/, "");
  const pl = placementOf(spec.placement, seq, today);
  const qtext = resolveText(q.text, vocab).replace(/\{[^}]*\}/g, "this");
  const item = {
    id, what: clean(qtext.slice(0, 160)), question: base, round: q.round, kind: spec.task_kind,
    why_it_matters: clean(q.why), blocks: (q.writes || []).filter((w) => !w.startsWith("onboarding.")),
    how: k.how, ...(k.how_kind ? { how_kind: k.how_kind } : {}), method: clean(spec.method), owner: k.owner,
    due: k.how === "research" ? addDays(today, 3) : pl.due,
    status: "open", as_of: today, reviewed_by: "claude", because: [],
    assumption: spec.gap ? clean(spec.gap) : undefined, confidence_if_assumed: 0.2,
  };
  if (!item.assumption) delete item.assumption;
  if (k.how !== "research") {
    item.placed = { week: pl.week, day: pl.day, because: pl.because };
    item.draft_task = { task: clean(spec.method), plan_kind: k.plan_kind, minutes: k.minutes, artifact: clean(artifactFor(spec.task_kind, q)), why: `To answer: ${clean(qtext)}` };
  }
  return item;
}
function artifactFor(kind, q) {
  return { U1: "The result and where it broke, in two lines", U3: "A link, screenshot or number, with its date", U4: "The one line message, drafted, and who it goes to", U5: "A seven day log, two minutes a day" }[kind] || `An answer to ${q.id}`;
}

/** A skill area he named in R1 that cannot be mapped to the researched rubric: an unknown with a question, never a silent loss. */
export function mapUnknownFor(skillArea, ledger, today) {
  return {
    id: nextUnknownId(ledger), what: clean(`Which competency of the researched rubric "${skillArea}" belongs to`).slice(0, 160), question: "B-06", round: "R1", kind: "U2",
    why_it_matters: "The first gap you named cannot be sized until it sits on a competency.", blocks: ["library.gaps"],
    how: "research", method: clean(`Find which competency the skill area "${skillArea}" belongs to, show the choice, ask for his yes`), owner: "claude",
    due: addDays(today, 3), status: "open", as_of: today, reviewed_by: "claude", because: [],
    assumption: "The first gap is left out until it is mapped", confidence_if_assumed: 0.2,
  };
}

/** The research round, when it is explicitly skipped: a task, so the gap is placed in the course and not lost. */
export function researchRoundUnknown(ledger, today, reason) {
  return {
    id: nextUnknownId(ledger), what: "Do the research round that informs your level questions", question: "I-01", round: "R2", kind: "U2",
    why_it_matters: "Without it the level questions have no researched rubric to be asked against.", blocks: ["library.gaps", "skills.ratings"],
    how: "task", how_kind: "diagnostic", method: "Do the research round: Claude collects the rubric and 8 live posts, you read the 10 line pack and answer the level questions", owner: "dev",
    draft_task: { task: "Do the research round: read the 10 line pack and answer the level questions", plan_kind: "learn", minutes: 25, artifact: "Your answers to the level questions, saved in the app", why: clean(`Round 2 was skipped${reason ? `: ${reason}` : ""}, so the gaps are not sized from research yet.`) },
    placed: { week: 1, day: "Mon", because: "Round 2 was skipped, so this comes first" }, due: addDays(today, 1), status: "open", as_of: today, reviewed_by: "claude", because: [],
    assumption: "Gaps are provisional until the research round is done", confidence_if_assumed: 0.2,
  };
}

// ---- contradictions (spec 5.6) ---------------------------------------------------------------------

const cid = (n, ...parts) => `C-0${n}:${parts.join("~")}`;

/**
 * Raises what does not add up. Ids are unique per pair: C-01:B-08~B-10. `severity` is "note" for calibration remarks that never
 * block, "block" for ones that must be decided before the round ends. `fixable_only` ones cannot be accepted: an answer must change.
 */
export function detectContradictions(state, answers, today = "") {
  const out = [];
  const add = (id, between, detail, extra = {}) => out.push({ id, between, detail: clean(detail), status: "open", severity: "block", ...extra });
  const g = (id) => val(answers, id);
  const period = periodOf(answers, state);
  const cur = currencyOf(state, answers);
  const mo = (x) => (num(x) === null ? null : monthly(x, period));
  const range = Array.isArray(g("B-08")) ? [mo(g("B-08")[0]), mo(g("B-08")[1])] : null;
  const floor = mo(g("B-10")); const target = mo(g("B-33")); const costs = mo(g("F-10"));
  const hoursActual = g("B-17"); const hoursPlan = g("B-18"); const bet = g("T-07"); const focus = g("H-01");
  if (range && floor !== null && range[1] < floor) add(cid(1, "B-08", "B-10"), ["B-08", "B-10"], `Your range tops out at ${money(range[1], cur)} per month, below the floor of ${money(floor, cur)} you said you would accept.`);
  if (target !== null && floor !== null && target < floor) add(cid(1, "B-10", "B-33"), ["B-10", "B-33"], `Your target of ${money(target, cur)} is below your floor of ${money(floor, cur)}. A target below the floor cannot stand: which number is wrong?`, { fixable_only: true });
  if (range && target !== null && (target < range[0] || target > range[1])) add(cid(1, "B-08", "B-33"), ["B-08", "B-33"], `Your target of ${money(target, cur)} sits outside your own range of ${money(range[0], cur)} to ${money(range[1], cur)}.`, { severity: "note" });
  if (floor !== null && costs !== null && floor < costs) add(cid(1, "B-10", "F-10"), ["B-10", "F-10"], `Your floor of ${money(floor, cur)} is below your fixed costs of ${money(costs, cur)} per month. Which is right?`);
  if (g("I-03") === "above") add(cid(1, "B-08", "I-03"), ["B-08", "I-03"], "Your range sits above the researched range. Ask what in the evidence justifies it; it stays a wish.");
  // Hours: weekly actual is the 4 week total divided by 4.
  const weekly = num(hoursActual) === null ? null : hoursActual / 4;
  if (weekly !== null && num(hoursPlan) !== null && hoursPlan > 2 * weekly) add(cid(2, "B-17", "B-18"), ["B-17", "B-18"], `You spent ${hoursActual} hours in 4 weeks (about ${Math.round(weekly * 10) / 10} a week) and plan ${hoursPlan} a week. The plan keeps ${hoursPlan}, flagged as assumed, until week 1 shows what you manage.`);
  if (num(bet) !== null && num(hoursPlan) !== null && bet > hoursPlan * 1.25) add(cid(2, "B-18", "T-07"), ["B-18", "T-07"], `You said ${hoursPlan} hours a week could be protected, then ${bet} as the number you would bet on. Which is it? The plan uses ${hoursPlan} until you decide.`);
  // T-07 wins over B-18 when it is not far above it, and that is said, never silent: a note he can read and change.
  else if (num(bet) !== null && num(hoursPlan) !== null && Math.abs(bet - hoursPlan) >= 0.5) add(cid(2, "B-18", "T-07"), ["B-18", "T-07"], `You said ${hoursPlan} hours a week could be protected and ${bet} as the number you would bet on. The plan uses ${bet} (T-07 wins). Say if ${hoursPlan} is the right one.`, { severity: "note" });
  if (num(focus) !== null && num(hoursPlan) !== null) {
    const h = hoursInfo(answers, []);
    if (h.capped_by_focus) add(cid(2, "B-18", "H-01"), ["B-18", "H-01"], `${hoursPlan} hours a week is more than the ${focus} focus hours a night you have. The plan caps a night at ${focus}.`, { severity: "note" });
  }
  const runway = g("B-20"); const notice = g("B-25"); const paid = g("B-36") !== "no";
  const need = 3 + (paid || num(notice) === null ? 0 : notice / 30);
  if (num(runway) !== null && runway < need) add(cid(3, "B-20", paid ? "B-25" : "B-36"), [paid ? "B-20" : "B-20", paid ? "B-25" : "B-36"].filter((x, i, a) => a.indexOf(x) === i), `Runway of ${runway} months is short against about 3 months of search${paid ? "" : ` plus ${notice} days of unpaid notice`}.`);
  // C-04: self level against evidenced level, per competency. A calibration note, never a block.
  const ratings = (state.skills && state.skills.ratings) || {};
  for (const [id, a] of Object.entries(answers)) {
    const m = /^A-([a-z0-9_]+)\.2$/.exec(id);
    if (!m || !isAnswered(a)) continue;
    const self = num(a.meta && a.meta.descriptor_level);
    const r = ratings[m[1]];
    const a1 = answers[`A-${m[1]}.1`];
    const ev = num(a.meta && a.meta.evidenced_level) ?? (a1 && isAnswered(a1) && (a1.evidence || []).length ? num(a1.meta && a1.meta.evidenced_level) : null) ?? (r && ["shipped", "expert", "market"].includes(r.source) ? r.level : null);
    if (self !== null && ev !== null && Math.abs(self - ev) >= 1) add(cid(4, id), [id], `For ${m[1]} you chose level ${self} and the work shows level ${ev}. This is a calibration note only.`, { severity: "note" });
  }
  const si = g("I-01"); const evAll = num(answers["I-01"] && answers["I-01"].meta && answers["I-01"].meta.evidenced_level);
  if (si !== undefined && evAll !== null && Math.abs(Number(si) - evAll) >= 1) add(cid(4, "I-01"), ["I-01"], `You placed yourself at level ${si}; the work shows about ${evAll}.`, { severity: "note" });
  // C-05: role versus refusals
  const role = String(g("B-04") || ""); const refuse = [...(g("B-15") || []), ...(String(g("I-06") || "") ? [String(g("I-06"))] : [])].map((x) => String(x).toLowerCase());
  // The intent is "managing people", not a word: "a boss who micromanages" is about the boss, "managing people" is about the job.
  const MANAGES_PEOPLE = /\b(managing|manage|managers? of|supervis(?:e|ing)|leading|lead) (?:a |the |my |other )?(?:people|others|staff|reports?|teams?|direct reports)\b|\bpeople[- ]management\b|\bdirect reports?\b|\bteam lead\b|\bhiring\b|\bline management\b|\bmanagement duties\b/i;
  if (/\b(lead|head|manager|director|principal)\b/i.test(role) && refuse.some((r) => MANAGES_PEOPLE.test(r))) add(cid(5, "B-04", "B-15"), ["B-04", "B-15"], "This role usually includes managing people, and you said you would refuse it. Which gives?");
  // C-06: priority vs real time
  const top = Array.isArray(g("B-13")) ? g("B-13")[0] : g("B-13");
  const skillWord = vocabOf(state, answers).core_skill || "your core skill";
  if ((top === "skill growth" || top === "craft growth") && num(hoursActual) !== null && hoursActual <= 8) add(cid(6, "B-13", "B-17"), ["B-13", "B-17"], `Growing ${skillWord} is your top priority, and you spent ${hoursActual} hours on your growth in 4 weeks.`);
  // C-07: deadline earlier than forecast earliest
  const earliest = state.library && state.library.forecast && state.library.forecast.range && state.library.forecast.range.earliest
    || state.profile && state.profile.ready_by && state.profile.ready_by.range && state.profile.ready_by.range.earliest;
  for (const id of ["T-03", "B-16"]) {
    const d = g(id);
    if (typeof d === "string" && ISO.test(d) && earliest && ISO.test(earliest) && d < earliest) { add(cid(7, id), [id], `Your date ${d} is earlier than the earliest the forecast shows (${earliest}).`); break; }
  }
  // C-08: anchor against the role
  if (top === "stability" && /\b(found(ing|er)|early[- ]stage|startup|0 to 1|zero to one)\b/i.test(role)) add(cid(8, "B-13", "B-04"), ["B-13", "B-04"], "Stability is your top priority, and a founding or early-stage role carries the least of it.");
  // C-09: same fact answered two ways
  for (const [id, a] of Object.entries(answers)) {
    if (!isAnswered(a) || !Array.isArray(a.history) || !a.history.length) continue;
    // Set-up answers (R0) are replaced, never contradicted: "not yet" then "yes" is a change of mind, not two versions of a fact.
    if (a.round === "R0") continue;
    const old = a.history[a.history.length - 1];
    // `sig` names this exact pair of values: a decision on it stays decided until one of the two values changes again.
    if (valueHash(old.value) !== valueHash(a.value)) add(cid(9, id), [id], `You answered ${id} differently on ${old.at} and ${a.answered}. Which is true now?`, { sig: `${valueHash(old.value)}~${valueHash(a.value)}` });
  }
  return out;
}

/** Keeps the status of contradictions already decided; new ones come in open; ones that no longer hold are resolved. */
export function mergeContradictions(existing = [], found = []) {
  const key = (c) => `${c.id}|${[...c.between].sort().join(",")}`;
  const have = new Map(existing.map((c) => [key(c), c]));
  const seen = new Set();
  const out = [];
  for (const c of found) {
    const k = key(c); seen.add(k);
    const e = have.get(k);
    // A derived contradiction that still holds reopens when he marks it "resolved" (it is only closed by changing an answer);
    // C-09 is a fact he decides: "resolved" on the same pair of values stays closed.
    const stay = e && e.status === "resolved" && c.sig && e.sig === c.sig;
    out.push(e ? { ...c, status: stay ? "resolved" : e.status === "resolved" ? "open" : e.status, ...(e.resolved_by ? { resolved_by: e.resolved_by } : {}) } : c);
  }
  for (const e of existing) if (!seen.has(key(e))) out.push({ ...e, status: e.status === "accepted_by_dev" ? "accepted_by_dev" : "resolved", resolved_by: e.resolved_by || "answers changed" });
  return out;
}
/** Contradictions that stop a round from ending: open and not a calibration note. */
export const blocking = (list) => (list || []).filter((c) => c.status === "open" && c.severity !== "note");

// ---- gaps (spec 5.1) --------------------------------------------------------------------------------

function nextGapNumber(state) {
  const ns = ((state.library && state.library.gaps) || []).map((g) => parseInt(String(g.id).replace(/^\D+/, ""), 10)).filter((n) => !Number.isNaN(n));
  return ns.length ? Math.max(...ns) : 0;
}
const normArea = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The gaps the answers and ratings imply, one per competency of the rubric that has been asked about or rated, with a gap above
 * half a level. Pure. Returns { gaps: [{ competency, title, why, closes_when, now, evenings, evenings_basis, because, level, target }], unmapped }.
 * A gap is "target level minus the level he has": the level of the rating when there is one (so a rating of 2 can never sit beside
 * "now: Level 0"), else the level an artifact showed, else a provisional one from his own placement. The title is the competency's
 * name, never his own words.
 */
function gapDerivation(state, answers, today, knownBecause) {
  const comps = ((state.rubric && state.rubric.competencies) || []);
  const byId = Object.fromEntries(comps.map((c) => [c.id, c]));
  // A marked placeholder rating ("not assessed") is not a rating: its target and level are never used.
  const ratings = Object.fromEntries(Object.entries((state.skills && state.skills.ratings) || {}).filter(([, r]) => r && r.placeholder !== true));
  const skillMap = (state.onboarding && state.onboarding.skill_map) || {};
  const gaps = [];
  const unmapped = [];
  const wanted = new Map(); // competency -> { closes, neverDone, from: [ids] }
  const add = (cid2, o) => { if (!cid2) return; const w = wanted.get(cid2) || { from: [] }; Object.assign(w, o, { from: [...new Set([...w.from, ...(o.from || [])])] }); wanted.set(cid2, w); };
  const b06 = answers["B-06"];
  if (isAnswered(b06)) {
    const area = b06.meta && b06.meta.skill_area;
    const mapped = (b06.meta && b06.meta.competency) || (area && skillMap[normArea(area)] && skillMap[normArea(area)].competency) || null;
    if (mapped && byId[mapped]) add(mapped, { from: ["B-06"], closes: clean(b06.value).slice(0, 160) });
    else unmapped.push({ id: "B-06", skill_area: area || "", reason: mapped ? `${mapped} is not in the rubric now` : "not mapped yet" });
  }
  const i02 = answers["I-02"];
  if (isAnswered(i02) && i02.meta && i02.meta.competency) add(i02.meta.competency, { from: ["I-02"] });
  const i04 = answers["I-04"];
  if (isAnswered(i04) && Array.isArray(i04.value)) for (const req of i04.value) { const c = i04.meta && i04.meta.requirement_competency && i04.meta.requirement_competency[req]; add(c, { neverDone: true, from: ["I-04"] }); }
  for (const [id, a] of Object.entries(answers)) {
    const m = /^A-([a-z0-9_]+)\.(\d)$/.exec(id);
    if (!m || !isAnswered(a)) continue;
    if (m[2] === "3") add(m[1], { from: [id], closes: clean(a.value).slice(0, 160) });
    else add(m[1], { from: [id] });
  }
  // a competency he has been rated on is a competency the bridge must be honest about, whatever else he was asked
  for (const cid2 of Object.keys(ratings)) if (byId[cid2]) add(cid2, { from: [] });
  const selfLevel = num(Number(val(answers, "I-01")));
  let n = nextGapNumber(state);
  for (const [cid2, w] of wanted) {
    if (!byId[cid2]) continue;
    const a1 = answers[`A-${cid2}.1`];
    const rating = ratings[cid2];
    const a2t = num(answers[`A-${cid2}.2`] && answers[`A-${cid2}.2`].meta && answers[`A-${cid2}.2`].meta.target_level);
    const target = num(rating && rating.target) ?? a2t ?? 3;
    const targetSourced = num(rating && rating.target) !== null || a2t !== null;
    let level = null;
    let provisional = false;
    let prior = false;
    let basis = "";
    if (rating && num(rating.level) !== null) { level = rating.level; basis = `rated ${rating.level} (${rating.source || "self"})`; provisional = !["shipped", "expert", "market"].includes(rating.source); }
    else if (a1 && isAnswered(a1) && num(a1.meta && a1.meta.evidenced_level) !== null && (a1.evidence || []).length) { level = a1.meta.evidenced_level; basis = "an artifact you showed"; }
    if (w.neverDone && !(rating && num(rating.level) !== null && rating.level > 0)) { level = 0; provisional = false; basis = "never done"; }
    if (level === null) {
      level = Math.max(0, target - 1);
      // I-01 is a starting prior only: a lower self level makes the gap bigger, a higher one never makes it smaller.
      if (selfLevel !== null && selfLevel >= 0 && selfLevel < level) { level = selfLevel; prior = true; }
      provisional = true;
      basis = "provisional";
    }
    const size = Math.max(0, target - level);
    if (!(size >= 0.5)) continue;
    const base = w.neverDone ? 7 : 5;
    const evenings = Math.min(60, Math.ceil(Math.max(size, 0.5) / 0.5) * base);
    const because = [...new Set(w.from.filter((x) => knownBecause.has(x)))];
    n += 1;
    gaps.push({
      id: `G-${String(n).padStart(2, "0")}`, competency: cid2, level, target, origin: "onboarding", source: "self", status: "open", opened: today, track: "skill", estimated: today, as_of: today, reviewed_by: "claude",
      title: `Reach level ${target} in ${byId[cid2].name}`,
      why: clean(`The target role needs level ${target} in ${byId[cid2].name}${targetSourced ? " (the level in your researched rubric)" : " (generic target, not yet sourced)"}; what is known so far shows level ${level}${provisional ? ` (provisional: ${basis === "provisional" ? `no artifact or test yet${prior ? ", level taken from your own placement in I-01" : ""}` : `from ${basis}, not yet judged by anyone else`})` : ""}.`),
      closes_when: clean(w.closes || `Be able to do the work at level ${target}, shown by one example someone else has judged.`),
      now: `Level ${level}${provisional ? ", provisional" : ""}.`,
      evenings, evenings_basis: `my estimate: ${size} levels to close at ${base} evenings per half level (${w.neverDone ? "never practised" : "practised"})`,
      because,
    });
  }
  return { gaps, unmapped };
}

// ---- the bridge: gaps and demands, recomputed after every action that can change them (critique 4, P1-5) ----------------------

const gapRefs = (state, id) => {
  const hay = [state.evidence && state.evidence.entries, state.library && state.library.picks, state.tests, state.week, state.plan, state.proof];
  return hay.some((x) => x !== undefined && JSON.stringify(x).includes(`"${id}"`));
};
/** True for a gap this module wrote (by its mark, or by the estimate text of the first version, which had no mark). */
const isOnboardingGap = (g) => g && (g.origin === "onboarding" || (typeof g.evenings_basis === "string" && g.evenings_basis.startsWith("my estimate:") && g.reviewed_by === "claude"));

/**
 * One pure function for the bridge from the interview to the course. Given the live state (profile, rubric, skills, evidence,
 * library, proof, research, demands, unknowns, onboarding) it returns what library.gaps and demands should hold NOW:
 *   { active, gaps, gaps_changed, demands, demands_changed, contradictions, derived, unknowns, unmapped }
 * `active` is false until the bridge has been written once (entering R5, or complete), so nothing is written to the course half way
 * through the interview. After that every action calls it, so a rating, a rubric swap, an answer or a mapping always leaves the
 * gaps and the demands consistent with the evidence they cite. Gaps are matched by competency and keep their id; a gap the answers
 * no longer imply is removed when nothing points at it, closed when something does; the planner's own evenings are never replaced.
 */
export function recomputeBridge(state, today, opts = {}) {
  const ob = state.onboarding || {};
  const active = opts.force === true || !!ob.bridge_written;
  const answers = ob.answers || {};
  const m = applyAnswers(state, answers, { today });
  const out = { active, domain: m.domain || null, gaps: null, gaps_changed: false, demands: null, demands_changed: false, contradictions: m.contradictions, unknowns: m.unknowns, unmapped: m.unmapped, readiness: m.readiness, hours: m.hours, risks: m.risks };
  if (!active) return out;
  const cur = (state.library && Array.isArray(state.library.gaps) ? state.library.gaps : []).map((g) => ({ ...g }));
  const gkey = (g) => g.key || (g.proof_blocker ? `b:${g.proof_blocker}` : g.domain_competency ? `d:${g.domain_competency}` : g.competency);
  const dFields = (w) => ({ ...(w.domain_competency ? { domain_competency: w.domain_competency } : {}), ...(w.proof_blocker ? { proof_blocker: w.proof_blocker } : {}), ...(typeof w.transfer_w === "number" ? { transfer_w: w.transfer_w } : {}), ...(typeof w.target_level === "number" ? { target_level: w.target_level } : {}), ...(typeof w.provisional === "boolean" && w.domain_competency || w.proof_blocker ? { provisional: w.provisional } : {}) });
  const wanted = new Map(m.gaps.map((g) => [gkey(g), g]));
  const next = [];
  let n = nextGapNumber(state);
  const handled = new Set();
  for (const g of cur) {
    if (!isOnboardingGap(g) || g.status === "closed" || g.status === "closing") { next.push(g); if (g.status !== "closed") handled.add(gkey(g)); continue; }
    const w = wanted.get(gkey(g));
    if (w && !handled.has(gkey(g))) {
      handled.add(gkey(g));
      const plannerOwns = typeof g.evenings_basis === "string" && g.evenings_basis.startsWith("planner:");
      next.push({
        ...g, origin: "onboarding", title: w.title, why: w.why, closes_when: w.closes_when, now: w.now, source: "self", track: g.track || "skill", ...dFields(w),
        ...(plannerOwns ? {} : { evenings: w.evenings, estimated: today, evenings_basis: w.evenings_basis }),
        ...(w.because.length ? { because: w.because } : {}), as_of: today, reviewed_by: "claude",
      });
    } else if (gapRefs(state, g.id)) next.push({ ...g, status: "closed", closed: today });
    // else: nothing points at it and the answers no longer imply it: it is dropped
  }
  for (const [cid2, w] of wanted) {
    if (handled.has(cid2) || next.some((g) => gkey(g) === cid2 && g.status !== "closed")) continue;
    n += 1;
    next.push({
      id: `G-${String(n).padStart(2, "0")}`, competency: w.competency, origin: "onboarding", title: w.title, why: w.why, source: "self", status: "open", opened: today,
      closes_when: w.closes_when, now: w.now, track: "skill", evenings: w.evenings, estimated: today, evenings_basis: w.evenings_basis, ...dFields(w),
      ...(w.because.length ? { because: w.because } : {}), as_of: today, reviewed_by: "claude",
    });
  }
  out.gaps = next;
  // The tasks of the domain gap point at the SAVED gap ids (G-01 and so on), never at the engine's symbolic ones.
  if (m.domain && m.domain.ok && Array.isArray(m.domain.tasks)) {
    const idx = gapIdIndex(next);
    out.domain = { ...m.domain, tasks: m.domain.tasks.map((x) => ({ ...x, gap_ref: x.gap_key ? idx[x.gap_key] || null : null, ...(x.blocker_key ? { clears_blocker: idx[x.blocker_key] || null } : {}) })) };
  }
  out.gaps_changed = JSON.stringify(next) !== JSON.stringify(cur);
  const dem = m.demands;
  out.demands = dem;
  const curD = state.demands || null;
  out.demands_changed = !curD || JSON.stringify((curD.items || [])) !== JSON.stringify(dem.items);
  return out;
}

// ---- consumers: what the answers that have no live field of their own DO ----------------------------------

/**
 * Tasks, risks and demands that come from R3 and R4 style answers. Each is real output: a task for the plan engine, a risk the
 * weekly check watches, or a demand shown with the goal. The bank's `consumer` field names each one; the fixtures prove it.
 */
export function consumerOutputs(answers, today) {
  const tasks = []; const risks = []; const demands = [];
  // An answer he had redacted (onboard.redact) is read as neutral wording here, so a task, a risk or a demand rebuilt on the next
  // answer never copies it back: the derived copies come from the answer, so the redaction holds on every recompute.
  const red = (id) => !!(answers[id] && answers[id].redacted === true) || !!(answers[`${id}.f1`] && answers[`${id}.f1`].redacted === true);
  const g = (id) => val(answers, id);
  const NEUTRAL_TASK = "Do one 15 minute step on the item you named earlier; its words are kept private";
  const T = (id, o) => tasks.push({ id: `OT-${id}`, source_question: id, track: "skill", artifact: "A line in your journal saying what you did", ...o, ...(red(id) ? { task: NEUTRAL_TASK } : {}), as_of: today, reviewed_by: "claude", because: [id] });
  const short = (s, n = 90) => clean(String(s)).slice(0, n);
  if (g("R3-01") !== undefined) T("R3-01", { kind: "practice", plan_kind: "practice", task: "Spend 15 minutes on the thing you named in Round 3 as the one you have been avoiding", minutes: 15, why: "The first task usually sits where the avoidance is.", placed: { week: 1, day: "Mon" } });
  if (g("R3-01") !== undefined) risks.push({ id: "R-avoid", text: "Something he has been avoiding for over a month (his answer to R3-01, private)", source: "R3-01", watch: "Is the 15 minute task done in week 1?" });
  if (g("R3-02") !== undefined) { T("R3-02", { kind: "ask", plan_kind: "practice", track: "reach", task: "Ask one person you trust to look closely at one piece of your work", minutes: 15, artifact: "Their reply, with the date", why: "You named what you hope nobody looks at; one honest review ends the guessing.", placed: { week: 2, day: "Tue" } }); risks.push({ id: "R-exposure", text: "A piece of work he hopes nobody looks at (his answer to R3-02, private)", source: "R3-02", watch: "Has one person reviewed it by week 3?" }); }
  const r304 = g("R3-04");
  if (r304 !== undefined && NONE_RE.test(String(r304).trim())) T("R3-04", { kind: "ask", plan_kind: "practice", track: "reach", task: "Ask one named person for the hardest thing they would say about your work", minutes: 15, artifact: "Their reply, with the date", why: "Nobody told you a hard truth in a year, so there is no outside judge yet.", placed: { week: 1, day: "Wed" } });
  if (g("R3-09") !== undefined) T("R3-09", { kind: "practice", plan_kind: "practice", task: "Make a small version of the work you named in Round 3 as the work you would do unseen", minutes: 20, why: "Work you would do unseen keeps the plan from becoming only proving.", placed: { week: 2, day: "Thu" } });
  if (g("R3-12") !== undefined) T("R3-12", { kind: "practice", plan_kind: "practice", task: "This week do the smallest version of the action you named in Round 3", minutes: 15, why: "A concrete act, not a feeling.", placed: { week: 1, day: "Thu" } });
  if (g("I-07") !== undefined && !NONE_RE.test(String(g("I-07")).trim())) T("I-07", { kind: "ask", plan_kind: "practice", track: "reach", task: `Ask ${short(g("I-07"), 60)} to look at one piece of your work`, minutes: 15, artifact: "Their reply, with the date", why: "You named a judge you would trust; ask once.", placed: { week: 1, day: "Wed" } });
  if (g("E-01") === "yes" && employedOf(answers)) T("E-01", { kind: "proof", plan_kind: "proof", task: "Read the side work and publishing clauses in your contract", minutes: 15, artifact: "The clause, copied, and what it allows", why: "Your contract limits outside work, so check what proof you may build.", placed: { week: 1, day: "Tue" } });
  const t06 = g("T-06");
  if (t06 !== undefined) {
    if (NONE_RE.test(String(t06).trim())) T("T-06", { kind: "ask", plan_kind: "practice", track: "reach", task: "Ask one named person to see your progress every week", minutes: 15, artifact: "Their yes, with the date", why: "Progress that nobody sees tends to stop.", placed: { week: 1, day: "Fri" } });
    else T("T-06", { kind: "practice", plan_kind: "practice", track: "reach", task: `Send ${short(t06, 60)} one line on your week, every week`, minutes: 15, artifact: "The message sent, with the date", why: "Progress that somebody sees keeps going.", placed: { week: 1, day: "Sat" } });
  }
  if (g("T-08") !== undefined) risks.push({ id: "R-quit", text: red("T-08") ? "What would make you quit (kept private)" : `Would make you quit: ${short(g("T-08"))}`, source: "T-08", watch: "Look for it in the weekly check" });
  if (g("T-09") !== undefined) {
    const fix = answers["T-09.f1"] && isAnswered(answers["T-09.f1"]) ? answers["T-09.f1"].value : null;
    risks.push({ id: "R-premortem", text: red("T-09") ? "Most likely reason for no progress (kept private)" : `Most likely reason for no progress: ${short(g("T-09"))}`, source: "T-09", watch: "Name it in week 4 if it happened" });
    T("T-09", { kind: "practice", plan_kind: "practice", task: fix ? `Do this now: ${short(fix)}` : `Write the one thing you will do when this happens: ${short(g("T-09"), 70)}`, minutes: 15, why: "It attacks the reason you named as most likely.", placed: { week: 1, day: "Fri" } });
  }
  // demands (soft unless stated). ids are fixed so the plan and the app can refer to them.
  const dem = (id, text, from, kind = "principle", extra = {}) => demands.push({ id, kind, text: red(from) ? "In his words (kept private)" : clean(text), from, ...extra });
  const attempt = g("B-30"); if (attempt !== undefined) dem("D-method", `Do not repeat a method that already failed: ${short(attempt, 120)}`, "B-30", "constraint");
  if (g("E-01") === "yes" && employedOf(answers)) dem("D-limits", "Build proof outside your employer's scope until you have read the side work clauses", "E-01", "constraint");
  const dropped = g("R3-06"); if (Array.isArray(dropped) && dropped.filter((x) => !NONE_RE.test(String(x).trim())).length >= 2) dem("D-size", `Tasks are at most 25 minutes: you started and dropped ${dropped.length} things in three years`, "R3-06", "constraint");
  const cost = g("R3-11"); if (cost !== undefined) dem("D-cost", `Cost of staying where you are, in your words: ${short(cost, 60)}`, "R3-11", "principle");
  const react = g("R3-14"); if (["defended it", "went quiet", "left or changed the subject"].includes(String(react))) dem("D-review", "Get feedback in writing first; live review and mock interviews start in week 3", "R3-14", "constraint");
  const enough = g("R3-19"); if (enough !== undefined) dem("D-enough", `Enough means: ${short(enough, 120)}`, "R3-19", "principle");
  const m1 = g("T-01"); if (typeof m1 === "string" && ISO.test(m1)) dem("D-milestone-1", `By ${m1}: one finished example you could show`, "T-01", "target");
  const m2 = g("T-02"); if (typeof m2 === "string" && ISO.test(m2)) dem("D-milestone-2", `By ${m2}: your first approach to a role you want`, "T-02", "target");
  const w4 = g("T-04"); if (w4 !== undefined) dem("D-week4", `At the end of week 4: ${short(w4, 120)}`, "T-04", "target");
  const done = g("T-10"); if (done !== undefined) dem("D-done", `Done means: ${short(done, 120)}`, "T-10", "principle");
  const slip = g("T-12"); if (slip !== undefined) dem("D-slip", `If a date slips, change the ${String(slip)} first`, "T-12", "principle");
  const accept = g("P-02"); if (accept !== undefined) dem("D-accept", `The offer you would take tomorrow: ${short(accept, 120)}`, "P-02", "target");
  return { tasks, risks, demands };
}

/** What the answers change in how Claude speaks and checks: read by the brief. Pure. */
export function deriveBrief(ob) {
  const answers = (ob && ob.answers) || {};
  const g = (id) => val(answers, id);
  const tone = ob && ob.tone;
  const attribution = g("R3-13");
  const credits = Array.isArray(attribution) ? attribution.filter((x) => ["luck", "the team", "the tools"].includes(x)) : [];
  return {
    check_in_every: tone === "straight" ? 0 : tone === "slower" ? 1 : 3,
    feedback_style: Array.isArray(attribution) && credits.length && !attribution.includes("my ability") && !attribution.includes("effort") ? "name_what_you_did" : "plain",
    feedback_tone: ({ straight: "straight", gently: "gentle", "only if I ask": "only_when_asked" })[g("T-11")] || "straight",
    slip_policy: g("T-12") || "date",
  };
}

/**
 * The exploration course for a person with no target role: what to DO to find one. Generated from his own answers (what gave him
 * energy, what he would try, what colleagues ask him for). Nothing here assumes a direction, so none of it can be dead.
 *   3 informational interviews, 1 job shadow, 2 small experiments, a 2 week energy audit, a reading list by what energises.
 */
export function explorationTasks(answers, today) {
  const g = (id) => val(answers, id);
  const short = (s, n = 70) => clean(displayValue(s)).slice(0, n);
  const energiser = g("X-01") !== undefined ? short(g("X-01")) : "";
  const tryMonth = g("X-03") !== undefined ? short(g("X-03")) : "";
  const strengths = Array.isArray(g("A-01")) ? g("A-01").map((x) => short(x, 40)).slice(0, 3) : [];
  const fieldOrJob = g("X-02");
  const out = [];
  const T = (id, o) => out.push({ id: `OT-X-${id}`, source_question: "B-04", exploration: true, track: "reach", ...o, as_of: today, reviewed_by: "claude", because: ["B-04"] });
  const outside = fieldOrJob === "yes" ? "one step outside your current field" : "a field next to yours or a role like yours in another field";
  [["1", 1, "Tue"], ["2", 2, "Tue"], ["3", 3, "Tue"]].forEach(([n, week, day]) => T(`talk-${n}`, { kind: "ask", plan_kind: "practice", task: `Hold one 20 minute conversation with a person who works ${outside}. Ask what a normal week is like, and what they would not do again`, minutes: 25, artifact: "Your three questions and their answers, with the date and how you felt after", why: "A real week described by a person tells you more than a job title.", placed: { week, day } }));
  T("shadow", { kind: "ask", plan_kind: "practice", task: "Ask one person whose work interests you if you can watch half a day of it", minutes: 15, artifact: "Their yes or no, with the date", why: "Half a day in the room settles what reading cannot.", placed: { week: 2, day: "Thu" } });
  T("try-1", { kind: "practice", plan_kind: "practice", task: tryMonth ? `Spend 25 minutes on a small version of: ${tryMonth}` : "Take one task from a job post in a field that interests you and spend 25 minutes on it", minutes: 25, artifact: "What you made or tried, in three lines, and whether you wanted to keep going", why: "A small test of a direction costs 25 minutes; a wrong move costs a year.", placed: { week: 1, day: "Thu" } });
  T("try-2", { kind: "practice", plan_kind: "practice", task: strengths.length ? `Do a 25 minute test that uses what colleagues ask you for (${strengths[0]}) in a setting you have not worked in` : energiser ? `Do a 25 minute small version of the work behind: ${energiser}` : "Pick a second field that interests you and spend 25 minutes on one real task from it", minutes: 25, artifact: "What you made or tried, in three lines, and whether you wanted to keep going", why: "A second test shows what repeats across the first one.", placed: { week: 3, day: "Thu" } });
  T("energy", { kind: "practice", plan_kind: "practice", task: "Log each work block as energised or drained, two minutes a day, for 14 days", minutes: 15, artifact: "A 14 day log with one word per block", why: "It finds the activities that give energy, which is a better guide than a title.", placed: { week: 1, day: "Mon" } });
  T("reading", { kind: "practice", plan_kind: "learn", task: energiser ? `Read one article or chapter about work like: ${energiser}. Write three lines on what you would try` : "Read one article about a kind of work that gives people energy. Write three lines on what you would try", minutes: 25, artifact: "Three lines on what you would try, with the source", why: "Reading is chosen by what energises you, and ends in something you write.", placed: { week: 2, day: "Mon" } });
  return out;
}

// ---- demands ----------------------------------------------------------------------------------------

function demandsFor(patchedState, answers, today, consumer) {
  const d = deriveDemands(patchedState, today);
  const cur = currencyOf(patchedState, answers);
  const items = d.items.filter((x) => x.id !== "D-fast");
  if (isAnswered(answers["T-10"]) && answers["T-10"].confirmed) items.push({ id: "D-fast", kind: "principle", text: "Fastest route I can source to being the best candidate for D-role", from: "T-10" });
  const salary = items.find((x) => x.id === "D-salary");
  if (salary) {
    salary.from = answers["B-33"] ? "B-33" : answers["B-08"] ? "B-08" : salary.from;
    const research = ((patchedState.research && patchedState.research.items) || []);
    const sourced = research.filter((r) => r.subject && ((r.subject.type === "demand" && r.subject.id === "D-salary") || (r.subject.type === "source_list" && r.subject.id === "salary")));
    const urls = new Set(sourced.map((r) => r.source_url));
    salary.status = urls.size >= 2 ? "market_range" : "wish_unsourced";
    delete salary.hard;
  }
  const floor = patchedState.profile && patchedState.profile.constraints && patchedState.profile.constraints.salary_floor_inr;
  if (num(floor) !== null && floor > 0) items.push({ id: "D-floor", kind: "constraint", text: clean(`Not below ${money(floor, cur)} per month, your own stated floor`), from: "B-10", hard: true });
  const refs = val(answers, "B-15");
  if (Array.isArray(refs)) refs.forEach((r, i) => items.push({ id: `D-refuse-${i + 1}`, kind: "constraint", text: clean(`Refuse: ${r}`), from: "B-15" }));
  const r317 = answers["R3-17"];
  if (isAnswered(r317) && r317.confirmed) items.push({ id: "D-refuse-core", kind: "constraint", text: clean(`Will not give up: ${r317.value}`), from: "R3-17", hard: true });
  for (const x of consumer.demands) items.push(x);
  const seen = new Set();
  return { updated: today, source_hash: d.source_hash, items: items.filter((x) => (seen.has(x.id) ? false : seen.add(x.id))) };
}

// ---- the mapper ---------------------------------------------------------------------------------------

/**
 * Spec s5. Pure.
 *   state: { profile, rubric, skills, evidence, library, proof, research, demands, unknowns, onboarding }
 *   answers: onboarding.answers (id -> answer)
 *   opts: { today, only?: string[] }   only: restrict `patches` to these question ids (the rest is computed from all answers)
 * Returns { patches, tasks, gaps, demands, unknowns, contradictions, risks, unmapped, readiness, hours, capacity_min_per_week }.
 */
export function applyAnswers(state, answers, opts = {}) {
  const today = opts.today || "1970-01-01";
  const only = opts.only ? new Set(opts.only) : null;
  const ctx = { today, state };
  const patches = [];
  const HOURS_IDS = ["B-18", "B-19"];
  for (const [id, a] of Object.entries(answers || {})) {
    if (only && !only.has(id)) continue;
    const q = resolveQuestion(id);
    if (!q) continue;
    if (!isAnswered(a)) {
      // An unknown hours or blocked-days answer still has to produce the (assumed) hours.
      if (a && a.status === "unknown" && HOURS_IDS.includes(id)) patches.push(...patchesFor(id, { ...a, value: id === "B-19" ? [] : 5 }, answers, ctx).filter((p) => p.path.startsWith("constraints.hours")));
      // R0-01 unknown: the stated default of 40 minutes (6 questions a sitting) is written, never the silent cap of 7.
      if (a && a.status === "unknown" && id === "R0-01") patches.push(...patchesFor(id, { ...a, value: "40" }, answers, ctx));
      // An I don't know or an off limits answer to a domain question WITHDRAWS what that question wrote earlier (critique 5, P1-5):
      // the evidence is cleared, so the blocker recomputes from what is still said.
      if (a && ["unknown", "off_limits"].includes(a.status) && /^DM-\d+/.test(id)) for (const dp of domainClearPatchesFor(id)) patches.push({ ...dp, ...patchBase(a, id, today) });
      continue;
    }
    patches.push(...patchesFor(id, a, answers, ctx));
  }
  // unknowns: "I don't know", plus a MUST skipped twice
  const ledger = (state.unknowns && state.unknowns.items) || (Array.isArray(state.unknowns) ? state.unknowns : []);
  const have = new Set(ledger.filter((x) => x.status === "open").map((x) => x.question));
  const unknowns = [];
  let seq = 0;
  const ob = state.onboarding || {};
  const vocab = vocabOf(state, answers || {});
  const wantUnknown = [];
  for (const [id, a] of Object.entries(answers || {})) if (a && a.status === "unknown") wantUnknown.push(id);
  for (const [id, s] of Object.entries(ob.skipped || {})) if (s && (s.count || 1) >= 2 && !wantUnknown.includes(id)) { const q = resolveQuestion(id); if (q && isMustFor({ answers: answers || {} }, id)) wantUnknown.push(id); }
  const employed = employedOf(answers || {});
  const exploring = isExploring(answers || {});
  for (const id of wantUnknown) {
    if (only && !only.has(id)) continue;
    const q = resolveQuestion(id);
    if (!q || have.has(q.id)) continue;
    // No target role: a task that assumes a direction ("collect 5 live posts for the stated direction", "attempt the task",
    // "research the range for the role") has nothing to stand on. The exploration set below replaces them. Never a dead task.
    if (exploring && (EXPLORING_NA.includes(q.id.replace(/\.f\d$/, "")) || q.id === "B-04")) continue;
    // A person with no job has no notice period and no employment contract: no "read your contract" task for them.
    if (!employed && NO_EMPLOYER_IDS.includes(q.id.replace(/\.f\d$/, ""))) continue;
    const u = unknownFor(q, "unknown", [...ledger, ...unknowns], today, 0, vocab);
    if (u) { unknowns.push(u); have.add(q.id); seq += 1; }
  }
  // R3 and R4 consumers: tasks the plan places, risks the weekly check watches, demands shown with the goal
  const consumer = consumerOutputs(answers || {}, today);
  const tasks = [...consumer.tasks];
  // The exploration course: informational interviews, a job shadow, two small experiments, an energy audit, a reading list.
  if (exploring) tasks.push(...explorationTasks(answers || {}, today));
  // prove-it tasks: E1 or E3 asked, answered without an artifact (a consumer task of the same id wins)
  for (const [id, a] of Object.entries(answers || {})) {
    const q = resolveQuestion(id);
    if (!q || !isAnswered(a) || (a.evidence || []).length || consumer.tasks.some((t) => t.id === `OT-${id}`)) continue;
    // Only a question whose answer CLAIMS a thing that exists (work, a document, a person who said something) can be asked to back it
    // up. A reflective answer (what he fears, what he wants) has nothing to find a link for.
    if (!PROOF_TASK_IDS.includes(id.replace(/\.f\d$/, "")) && !/^A-[a-z0-9_]+\.1$/.test(id)) continue;
    if (exploring && (EXPLORING_NA.includes(id.replace(/\.f\d$/, "")) || id === "B-04")) continue;
    const shortQ = (() => { const t = resolveText(q.text, vocab).replace(/\{[^}]*\}/g, "that").replace(/\?\s*$/, "").trim(); return t.length > 70 ? `${t.slice(0, 67)}...` : t; })();
    if (q.evidence_ask === "E1" && !["R0"].includes(q.round)) tasks.push({ id: `OT-${id}`, source_question: id, kind: "proof", plan_kind: "proof", track: "skill", task: clean(`Find the link or file that backs your answer to "${shortQ}"`), artifact: "A link or file Claude can open", minutes: 20, why: clean(`Your answer to "${shortQ}" has no example yet, so it counts as a claim, not proof.`), ...patchBase(a, id, today, { reviewed_by: "claude" }) });
    else if (q.evidence_ask === "E3" && q.round !== "R0") tasks.push({ id: `OT-${id}`, source_question: id, kind: "ask", plan_kind: "practice", track: "reach", task: clean(`Ask one named person to confirm your answer to "${shortQ}"`), artifact: "Their reply, with the date", minutes: 15, why: clean(`Your answer to "${shortQ}" has no third party behind it yet.`), ...patchBase(a, id, today, { reviewed_by: "claude" }) });
  }
  for (const u of [...ledger.filter((x) => x.status === "open" && !(exploring && (EXPLORING_NA.includes(x.question) || x.question === "B-04" || x.question === "I-01"))), ...unknowns]) if (u.draft_task && !tasks.some((t) => t.id === `UT-${u.id}`)) tasks.push({ id: `UT-${u.id}`, source_question: u.question, unknown: u.id, kind: u.how === "ask" ? "ask" : u.how === "observe" ? "practice" : u.how_kind === "diagnostic" ? "test" : "proof", plan_kind: u.draft_task.plan_kind, track: "skill", task: u.draft_task.task, artifact: u.draft_task.artifact, minutes: u.draft_task.minutes, why: u.draft_task.why, because: [], as_of: today, reviewed_by: "claude", placed: u.placed, due: u.due });
  // knownBecause: ids that exist in the live data, so provenance never dangles
  const known = new Set([...((state.profile && state.profile.intake) || []).map((x) => x.id), ...(((state.evidence && state.evidence.entries) || []).map((x) => x.id))]);
  const { gaps: genericGaps, unmapped } = gapDerivation(state, answers || {}, today, known);
  // patched view for demands
  const preview = applyPatches(state, patches.filter((p) => ["profile", "evidence"].includes(p.file))).state;
  const demands = demandsFor({ ...preview, rubric: state.rubric, skills: state.skills, proof: state.proof, research: state.research, onboarding: state.onboarding }, answers || {}, today, consumer);
  const contradictions = mergeContradictions(ob.contradictions || [], detectContradictions(state, answers || {}, today));
  // Spec 5.4: capacity the plan may fill, from the one hours function.
  const hours = hoursInfo(answers || {}, ob.contradictions || []);
  const perWeek = hours.per_week !== null ? hours.per_week : num(preview.profile && preview.profile.constraints && preview.profile.constraints.hours_per_week);
  // The domain graph: for a launch role the gaps come from computeGap and pickTasks; everyone else keeps the generic builder.
  const domainSel = domainSelection(answers || {});
  const dg = domainSel.family_now ? gapFromProfile({ profile: preview.profile || {}, skills: state.skills, rubric: state.rubric, hoursPerWeek: perWeek === null ? undefined : perWeek }) : null;
  const domainGaps = dg && dg.ok ? domainGapEntries(dg, state.rubric, today) : null;
  const gaps = domainGaps && domainGaps.length ? domainGaps.map((g) => ({ ...g, because: [] })) : genericGaps;
  const domain = domainSel.family_now ? { ...(domainSummary(dg, domainSel, gapIdIndex(state.library && state.library.gaps)) || { ok: false, status: "no_target" }), used_generic: !domainGaps, ...(domainSel.notes.length ? { notes: domainSel.notes } : {}) } : null;
  // ready_by is only as complete as the competencies it was computed from.
  const comps = (state.rubric && state.rubric.competencies) || [];
  const ratings = (state.skills && state.skills.ratings) || {};
  const withGap = new Set([...gaps.map((x) => x.competency), ...((state.library && state.library.gaps) || []).filter((x) => x.status !== "closed").map((x) => x.competency)]);
  const notAssessed = comps.filter((c) => !ratings[c.id] || ratings[c.id].placeholder === true).map((c) => c.id).filter((c) => !withGap.has(c));
  const readiness = { partial: notAssessed.length > 0 || (state.rubric && state.rubric.generic === true), missing: notAssessed, generic_rubric: !!(state.rubric && state.rubric.generic === true) };
  return { patches, tasks, gaps, domain, demands, unknowns, contradictions, risks: consumer.risks, unmapped: exploring ? [] : unmapped, readiness, hours, exploring, capacity_min_per_week: perWeek === null ? null : capacityMinPerWeek(perWeek) };
}

// ---- progress -----------------------------------------------------------------------------------------

/** The adaptive batch: registered generated questions, each citing research, or an explicit skip with a reason. */
export function adaptiveStatus(ob) {
  const gen = (ob && ob.generated_questions) || {};
  const ids = Object.keys(gen);
  const competencies = [...new Set(ids.map((id) => gen[id].competency))];
  // A self described rubric has no research to cite: its questions count as registered with an explicit "unsourced" label.
  const unsourced = !!(ob && ob.unsourced_rubric);
  const citing = ids.filter((id) => unsourced || (Array.isArray(gen[id].research) && gen[id].research.length > 0));
  const skipped = !!(ob && ob.adaptive_skipped);
  const registered = ids.length;
  // No target role: Round 2 is the research of three candidate directions (onboard.research, subject source_list "directions").
  if (isExploring((ob && ob.answers) || {})) {
    const dirs = (ob && ob.directions && Array.isArray(ob.directions.ids) ? ob.directions.ids : []).length;
    return { registered: dirs, competencies: [], with_research: dirs, skipped, unsourced: false, exploring: true, directions: dirs, min: 3, ok: skipped || dirs >= 3 };
  }
  return { registered, competencies, with_research: citing.length, skipped, unsourced, min: ADAPTIVE.min_registered, ok: skipped || (registered >= ADAPTIVE.min_registered && citing.length === registered) };
}

// ---- no target role: an exploration course (P1-5) ---------------------------------------------------------------

/** Questions that assume a stated direction. For a person with no target role they do not apply (covered, no task, never asked). */
export const EXPLORING_NA = ["B-05", "B-06", "B-08", "B-33", "B-11", "B-16", "B-24", "B-30", "F-01", "F-02", "F-03", "E-02", "P-01", "T-02", "T-03", "I-01", "I-02", "I-03", "I-04", "I-05", "I-06", "I-07", "I-08", "CR-01", "RJ-01"];
/** NICE questions that become MUST for that person: they are how a direction gets found. */
export const EXPLORING_MUST = ["X-01", "X-02", "X-03", "A-01", "E-03", "R3-09", "R3-12"];
// The WHOLE answer must be one of these (a trailing "yet" or a full stop is fine): "Exploring data science roles" or "Not sure,
// maybe UX research" name a direction and are not "no target role".
const NO_TARGET_RE = /^(?:(?:i )?(?:do not|don'?t|dont) know|not sure|no idea|unsure|undecided|something else(?: entirely)?|anything(?: else)?|anything but [a-z' ]{1,40}|exploring|figuring (?:it )?out|not decided|nothing(?: in particular)?|no (?:target|role|idea)|unknown|n\/a)(?: yet| really| honestly| right now| at all)?[\s.!?,]*$/i;
/** True when there is no target role yet: B-04 is an I don't know, or an answer that names no role. */
export function isExploring(answers) {
  const a = answers && answers["B-04"];
  if (!a) return false;
  if (a.status === "unknown") return true;
  return a.status === "answered" && typeof a.value === "string" && NO_TARGET_RE.test(a.value.trim());
}
/**
 * The quick path (P1-7): at quick depth the MUST questions of R0 to R2 that are not on the minimum viable path are not asked before
 * the first plan. They are not dropped: progress lists them as deferred_by_depth with what stays unknown, and a later "standard" or
 * "deep" in R0-11 makes them MUST again.
 */
function quickDemoted(ob, q) {
  return !!(ob && ob.depth === "quick" && q && q.must && !q.generated && ["R0", "R1", "R2"].includes(q.round) && q.minimum_viable !== true);
}
/** MUST for this person: a promoted question in the exploring state, a question that does not apply is not MUST. */
export function isMustFor(ob, id) {
  const q = resolveQuestion(id);
  if (!q) return false;
  if (quickDemoted(ob, q) && !(isExploring((ob && ob.answers) || {}) && EXPLORING_MUST.includes(String(id).replace(/\.f\d$/, "")))) return false;
  if (isExploring((ob && ob.answers) || {})) {
    const base = String(id).replace(/\.f\d$/, "");
    if (EXPLORING_NA.includes(base)) return false;
    if (EXPLORING_MUST.includes(base)) return true;
  }
  return !!q.must;
}

/** MUST ids a round needs, including generated Round 2 questions when they were recorded. */
export function roundQuestions(ob, round) {
  const exploring = isExploring((ob && ob.answers) || {});
  const mark = (q) => {
    let must = q.must;
    let na = false;
    if (quickDemoted(ob, q)) must = false;
    if (exploring) {
      if (EXPLORING_NA.includes(q.id)) { must = false; na = true; }
      else if (EXPLORING_MUST.includes(q.id)) must = true;
    }
    return { id: q.id, must, hard: q.hard, ...(na ? { na: true } : {}) };
  };
  const fixed = BANK.filter((q) => q.round === round);
  if (round !== "R2") return fixed.map(mark);
  // A person with no target role has no rubric to be asked against: R2 is a research of candidate directions, not questions.
  const gen = exploring ? [] : Object.keys((ob && ob.generated_questions) || {}).sort().map((id) => {
    const r = resolveQuestion(id);
    return r ? { id, must: r.must, hard: false } : null;
  }).filter(Boolean);
  return [...fixed.map(mark), ...gen];
}

/** Questions of the current round that do not apply to this person (covered, never asked). */
const notApplicable = (ob) => (isExploring((ob && ob.answers) || {}) ? new Set(EXPLORING_NA) : new Set());

// ---- optional questions: depth, value and fatigue (P1-3) ----------------------------------------------------------
/** At standard depth: how many optional questions of each round are offered (the highest value first). Deep offers all, quick none. */
export const STANDARD_NICE = { R0: 1, R1: 6, R2: 3, R3: 9, R4: 4 };
const AREAS = {
  // an optional question that only applies in one situation
  "S-02": (answers) => /^self-employed/.test(String(val(answers, "S-01") || "")),
};

/**
 * The optional (NICE) questions offered for the current round, best value first, by depth. Never one he excluded, never one that
 * does not apply to him, never one already answered or skipped. Standard offers the first STANDARD_NICE[round] by value.
 */
export function optionalIds(ob) {
  const depth = (ob && ob.depth) || "standard";
  const round = (ob && ob.round) || "R0";
  if (depth === "quick" && round !== "R0") return [];
  const answers = (ob && ob.answers) || {};
  const off = new Set((ob && ob.off_limits) || []);
  const skipped = (ob && ob.skipped) || {};
  const na = notApplicable(ob);
  const pool = BANK.filter((q) => q.round === round && !isMustFor(ob, q.id) && !q.generated && !na.has(q.id) && !off.has(q.id) && !(AREAS[q.id] && !AREAS[q.id](answers)));
  // R0: only the depth question itself is offered on its own; R0-04 is for prior facts and is asked when there are some.
  const ranked = pool.filter((q) => (round === "R0" ? q.id === "R0-11" : true)).map((q, i) => ({ q, i })).sort((a, b) => b.q.value - a.q.value || a.i - b.i).map((x) => x.q);
  const limit = depth === "deep" ? Infinity : round === "R0" ? 1 : STANDARD_NICE[round] ?? 0;
  const chosen = ranked.slice(0, limit);
  return chosen.filter((q) => !(answers[q.id] && ["answered", "unknown", "off_limits"].includes(answers[q.id].status)) && !skipped[q.id]).map((q) => q.id);
}

/**
 * Where an onboarding stands. `ob` may be undefined (never started). `ledger` is unknowns.items.
 * A MUST is covered when it is answered, an "I don't know" (unknown), off limits, or deferred by an explicit round skip.
 * Skipped once is still open. "Enough to start" needs the adaptive Round 2 batch (or its explicit skip) as well.
 */
export function progress(ob, ledger = []) {
  const status = ob ? ob.status : "not_started";
  const round = ob ? ob.round : "R0";
  const answers = (ob && ob.answers) || {};
  const off = new Set((ob && ob.off_limits) || []);
  const skippedMap = (ob && ob.skipped) || {};
  const deferred = new Set(Object.entries(skippedMap).filter(([, s]) => s && s.deferred === true).map(([id]) => id));
  const covered = (id) => { const a = answers[id]; return !!a && ["answered", "unknown", "off_limits"].includes(a.status); };
  const done = (id) => covered(id) || off.has(id) || deferred.has(id);
  const perRound = {};
  const missing = [];
  let mustTotal = 0; let mustAnswered = 0; let mustUnknown = 0;
  for (const r of ROUNDS) {
    const qs = roundQuestions(ob, r).filter((q) => q.must);
    const dn = qs.filter((q) => done(q.id));
    perRound[r] = { must_total: qs.length, must_done: dn.length };
    mustTotal += qs.length; mustAnswered += dn.length;
    for (const q of qs) { if (answers[q.id] && answers[q.id].status === "unknown") mustUnknown += 1; if (!done(q.id)) missing.push(q.id); }
  }
  const all = Object.values(answers);
  const skippedOnce = Object.entries(skippedMap).filter(([id]) => !done(id)).map(([id]) => id);
  const r1r2 = missing.filter((id) => resolveQuestion(id) && ["R1", "R2"].includes(resolveQuestion(id).round));
  const sittingMax_ = (ob && ob.sitting && ob.sitting.max) || MAX_PER_SITTING;
  const pendingInRound = [];
  const exploring = isExploring(answers);
  const naSet = notApplicable(ob);
  for (const q of roundQuestions(ob, round)) if (!done(q.id) && !skippedMap[q.id]) pendingInRound.push(q.id);
  for (const id of skippedOnce) if (roundQuestions(ob, round).some((q) => q.id === id) && !off.has(id) && !naSet.has(id)) pendingInRound.push(id);
  const isMust = (id) => isMustFor(ob, id);
  const mustFirst = [...pendingInRound].sort((a, b) => Number(isMust(b)) - Number(isMust(a)));
  const next = planSittings(mustFirst.filter(isMust), sittingMax_)[0];
  // Optional questions, by the depth he chose, packed into what is left of this sitting after the MUST (fatigue budget).
  const weightOf = (id) => { const q = resolveQuestion(id); return !q || q.round === "R0" ? 0 : q.hard ? 1.5 : 1; };
  const asked = (ob && ob.sitting && ob.sitting.asked) || 0;
  let used = asked + (next ? next.ids.reduce((s, id) => s + weightOf(id), 0) : 0);
  const optional = [];
  const optionalAll = ob && ob.status !== "complete" ? optionalIds(ob) : [];
  for (const id of optionalAll) { const w = weightOf(id); if (used + w <= sittingMax_ + 1e-9) { optional.push(id); used += w; } }
  // Skill areas from R1 that are neither mapped to the rubric nor held by an unknown.
  const skillMap = (ob && ob.skill_map) || {};
  const unmapped = [];
  const b06 = answers["B-06"];
  if (!exploring && b06 && b06.status === "answered") {
    const area = b06.meta && b06.meta.skill_area;
    const mapped = (b06.meta && b06.meta.competency) || (area && skillMap[normArea(area)] && skillMap[normArea(area)].competency);
    const held = (ledger || []).some((x) => x.status === "open" && x.question === "B-06");
    if (!mapped && !held) unmapped.push("B-06");
  }
  // The domain questions are counted apart (cap 19); they share the sitting's remaining capacity with the main MUST.
  const domainBlock = domainProgress(ob);
  const domainNext = [...(next ? next.ids : [])];
  if (domainBlock.active && !(ob && ob.status === "complete")) {
    let room = sittingMax_ - ((ob && ob.sitting && ob.sitting.asked) || 0) - domainNext.reduce((s, id) => { const q = resolveQuestion(id); return s + (!q || q.round === "R0" ? 0 : q.hard ? 1.5 : 1); }, 0);
    for (const id of domainBlock.pending) { const q = resolveQuestion(id); const w = !q || q.round === "R0" ? 0 : q.hard ? 1.5 : 1; if (w <= room + 1e-9 && !domainNext.includes(id)) { domainNext.push(id); room -= w; } }
  }
  const ad = adaptiveStatus(ob);
  const fixedR2Done = roundQuestions(ob, "R2").filter((q) => q.must && !q.id.startsWith("A-")).every((q) => done(q.id));
  const genDone = roundQuestions(ob, "R2").filter((q) => q.must && q.id.startsWith("A-")).every((q) => done(q.id));
  const baseReady = perRound.R0.must_done === perRound.R0.must_total && perRound.R1.must_done === perRound.R1.must_total && fixedR2Done && ad.ok && (ad.skipped || genDone) && unmapped.length === 0;
  // Without ANY answer to B-04 nothing can be planned. With an honest "I don't know" the course is an exploration course:
  // readiness "exploring", a real plan_pending, never tasks that assume a direction.
  const noTarget = !exploring && !(answers["B-04"] && answers["B-04"].status === "answered");
  const startable = baseReady && !noTarget;
  const readiness = !startable ? "not_yet" : exploring ? "exploring" : ad.skipped || ad.unsourced || deferred.size > 0 ? "enough_with_gaps" : "ready";
  const blockers = [];
  if (noTarget) blockers.push("B-04: no target role yet, so there is nothing to research or plan toward");
  if (exploring && !startable) {
    blockers.push("B-04: no target role yet, so the course explores directions first");
    if (!ad.ok) blockers.push("R2: three candidate directions are not researched yet (onboard.research with subject source_list directions), or skip the research on purpose with skip_r2");
  }
  // The quick path: MUST questions of R0 to R2 that are not asked before the first plan, each with what stays unknown (never dropped).
  const deferredByDepth = (ob && ob.depth === "quick" ? BANK.filter((q) => q.must && ["R0", "R1", "R2"].includes(q.round) && q.minimum_viable !== true && !isMustFor(ob, q.id) && !done(q.id)) : []).map((q) => ({ id: q.id, consequence: `${q.changes} stays unknown until the standard path` }));
  return {
    status, round,
    answered: all.filter((a) => a.status === "answered").length,
    unknown: all.filter((a) => a.status === "unknown").length,
    skipped: Object.keys(skippedMap).length,
    must_total: mustTotal, must_answered: mustAnswered, must_unknown: mustUnknown,
    per_round: perRound, missing_must: missing, skipped_once: skippedOnce,
    deferred_must: [...deferred],
    deferred_by_depth: deferredByDepth,
    adaptive: ad,
    unmapped,
    // "Enough to start": R0, R1 and the R2 MUST covered, the adaptive batch registered with research cited (or explicitly skipped).
    ready_to_plan: startable,
    readiness,
    readiness_blockers: blockers,
    exploring,
    depth: (ob && ob.depth) || "standard",
    r1_r2_missing: r1r2,
    next_ids: domainNext,
    optional_ids: optional,
    domain: domainBlock,
    optional_left_in_round: optionalAll.length,
    open_unknowns: (ledger || []).filter((x) => x.status === "open").length,
  };
}

/** "growth start" when nothing has happened, "resume" when it is in progress or paused, otherwise null. */
export function nextCommand(ob) {
  if (!ob || ob.status === "not_started") return "growth start";
  if (ob.status === "in_progress" || ob.status === "paused") return "resume";
  return null;
}

/** A fresh onboarding record. */
export function newOnboarding(today, { backup = "", round = "R0" } = {}) {
  return { version: 1, status: "in_progress", started: today, backup, round, sitting: { n: 1, asked: 0, max: MAX_PER_SITTING, started: today }, consent: {}, off_limits: [], last_asked: null, pending_followup: null, answers: {}, skipped: {}, contradictions: [], round_summaries: {}, generated_questions: {}, notes: {}, skill_map: {} };
}

// ---- the one integrity check (critique 4, P1-4) ------------------------------------------------------------------------------
// onboarding-check.mjs and `complete` run THIS function, so a FAIL the check reports can never be a state `complete` accepts.
// A private answer is a leak only when a run of LEAK_RUN words of it appears verbatim in a public place: a short answer that
// merely shares three words with a public one is two people saying a similar thing, not a copy.

/** Words in a verbatim run that make a private answer "copied" into a public place. */
export const LEAK_RUN = 8;
const tokens = (t) => String(t == null ? "" : t).toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, " ").trim().split(/\s+/).filter(Boolean);
/** True when `publicText` holds a run of `n` or more consecutive words that `privateText` also holds. */
export function sharedRun(privateText, publicText, n = LEAK_RUN) {
  const pt = tokens(privateText);
  if (pt.length < n) return false;
  const grams = new Set();
  for (let i = 0; i + n <= pt.length; i++) grams.add(pt.slice(i, i + n).join(" "));
  const qt = tokens(publicText);
  for (let i = 0; i + n <= qt.length; i++) if (grams.has(qt.slice(i, i + n).join(" "))) return true;
  return false;
}
/** Every string leaf of a value, with its path. */
function leaves(v, path, out) {
  if (typeof v === "string") out.push({ path, text: v });
  else if (Array.isArray(v)) v.forEach((x, i) => leaves(x, [...path, i], out));
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) leaves(x, [...path, k], out);
  return out;
}
/** The places the app shows or shares, as { file, path, id, text }: intake answers, the journal, the library, proof, modules, tasks. */
function publicPlaces(s) {
  const out = [];
  const p = s.profile || {};
  (p.intake || []).forEach((it, i) => out.push({ file: "profile", path: ["intake", i, "answer"], id: it.id, text: String(it.answer || ""), where: `profile.intake ${it.id}` }));
  ((s.evidence && s.evidence.entries) || []).forEach((e, i) => { for (const k of ["title", "detail"]) if (typeof e[k] === "string") out.push({ file: "evidence", path: ["entries", i, k], id: e.id, text: e[k], where: `journal entry ${e.id}` }); });
  const walk = (file, root, label, idOf) => { for (const l of leaves(root, [], [])) out.push({ file, path: l.path, id: idOf ? idOf(l.path) : label, text: l.text, where: `${label} ${l.path.join(".")}` }); };
  if (s.library) walk("library", s.library, "library", (path) => { const o = path.slice(0, -1).reduce((x, k) => (x == null ? x : x[k]), s.library); return (o && o.id) || "library"; });
  if (p.modules) walk("profile", { modules: p.modules }, "profile.modules", () => "modules");
  // The CV versions and case studies (data/career.json): their wording, not their quotes or checks. Not auto-fixable: a CV line is rewritten by hand.
  if (isObj(s.career)) {
    const strip = (v) => (Array.isArray(v) ? v.map(strip) : isObj(v) ? Object.fromEntries(Object.entries(v).filter(([k]) => !["sources", "checks", "file", "pdf", "post_excerpt"].includes(k)).map(([k, x]) => [k, strip(x)])) : v);
    for (const l of leaves(strip({ cv: s.career.cv, cases: s.career.cases }), [], [])) out.push({ file: "career", path: l.path, id: "career", text: l.text, where: `career ${l.path.join(".")}`, fixable: false });
  }
  ((s.proof && s.proof.items) || []).forEach((it, i) => { for (const k of ["name", "note", "why"]) if (typeof it[k] === "string") out.push({ file: "proof", path: ["items", i, k], id: it.id, text: it[k], where: `proof ${it.id}` }); });
  const dv = (s.onboarding && s.onboarding.derived) || {};
  // Derived copies (tasks, risks, demands) are rebuilt from the answer they came from, so they are fixed at the source: the
  // answer is marked redacted and the derived text is rebuilt in neutral words (onboard.redact does both in one step).
  const srcOf = (id) => String(id || "").replace(/^OT-/, "");
  (dv.tasks || []).forEach((t) => out.push({ file: "onboarding", path: null, id: t.id, src: srcOf(t.id), text: String(t.task || ""), where: `task ${t.id}`, derived: true }));
  (dv.risks || []).forEach((r) => out.push({ file: "onboarding", path: null, id: r.id, src: r.source, text: String(r.text || ""), where: `risk ${r.id}`, derived: true }));
  ((s.demands && s.demands.items) || []).forEach((x) => { if (x && x.from) out.push({ file: "demands", path: null, id: x.id, src: x.from, text: String(x.text || ""), where: `demand ${x.id}`, derived: true }); });
  return out;
}
/**
 * The FAIL lines of the integrity check, as [{ kind, message, id?, source?, file?, path?, fixable? }]. `cvTexts`: the text of the
 * files in cv/, passed in by the script (this module reads no files).
 */
export function integrityFails(s, { cvTexts = [] } = {}) {
  const fails = [];
  const ob = s.onboarding;
  if (ob && isObj(ob.answers)) {
    const priv = Object.entries(ob.answers).filter(([, a]) => a && a.private && a.status === "answered" && a.withheld !== true).map(([id, a]) => [id, Array.isArray(a.value) ? a.value.filter((x) => typeof x === "string").join(" ") : typeof a.value === "string" ? a.value : ""]).filter(([, t]) => tokens(t).length >= LEAK_RUN);
    if (priv.length) {
      const places = publicPlaces(s);
      for (const [pid, text] of priv) {
        for (const pl of places) {
          if (pl.id === pid || pl.src === pid) continue;
          // a derived copy of an answer that is already redacted holds neutral words: it is not a leak (and cannot be one twice)
          if (sharedRun(text, pl.text)) { fails.push({ kind: "private_leak", message: `a private Round 3 answer (${pid}) appears in a public place (${pl.where})`, id: pl.id, ...(pl.src ? { src: pl.src } : {}), source: pid, file: pl.file, path: pl.path, fixable: pl.fixable !== false && !(pl.derived && !(ob.answers[pl.src] && ob.answers[pl.src].status === "answered")) }); }
        }
        for (const ct of cvTexts) if (sharedRun(text, ct)) { fails.push({ kind: "private_leak", message: `a private Round 3 answer (${pid}) appears in a file of cv/`, id: null, source: pid, fixable: false }); break; }
      }
    }
  }
  for (const it of (s.profile && s.profile.intake) || []) if (/^R3-/.test(String(it.id))) fails.push({ kind: "r3_intake", message: `profile.intake holds ${it.id}, a private Round 3 answer`, id: it.id, file: "profile", path: null, fixable: false });
  const sal = ((s.demands && s.demands.items) || []).find((x) => x.id === "D-salary");
  if (sal && sal.hard) fails.push({ kind: "salary_hard", message: "D-salary is hard; salary is a wish or a market range, never hard" });
  for (const [k, r] of Object.entries((s.skills && s.skills.ratings) || {})) if (r && r.source === "self" && r.confidence > 0.3 + 1e-9) fails.push({ kind: "self_rating", message: `skills.${k}: self rating with confidence ${r.confidence} (cap 0.3)` });
  return fails;
}
const setPath = (root, path, value) => { let o = root; for (let i = 0; i < path.length - 1; i++) o = o[path[i]]; o[path[path.length - 1]] = value; };
/**
 * The one step fix for a leak: the public copy becomes "(private)", the private answer stays. `onlyId` limits it to one public id.
 * Mutates `s`. Returns { count, files, ids }.
 */
export function redactLeaks(s, onlyId) {
  const want = onlyId === undefined ? undefined : String(onlyId);
  const alias = want === undefined ? undefined : want.replace(/^OT-/, "");
  const fails = integrityFails(s).filter((f) => f.kind === "private_leak" && f.fixable && (f.path || f.src) && (want === undefined || f.id === want || f.id === alias || f.src === want || f.src === alias));
  const files = new Set(); const ids = new Set(); const answers = new Set();
  for (const f of fails) {
    if (f.path && s[f.file]) { setPath(s[f.file], f.path, "(private)"); files.add(f.file); }
    // a derived copy is fixed at its source: the answer is marked redacted and every copy is rebuilt in neutral words
    if (f.src) { answers.add(f.src); files.add("onboarding"); }
    ids.add(f.src || f.id);
  }
  return { count: fails.length, files: [...files], ids: [...ids], answers: [...answers] };
}

// ---- how long it takes (critique 4, P1-7) --------------------------------------------------------------------------------------
/**
 * "About N sittings of M minutes" to reach a first plan from where the interview stands, by the same sitting packing the harness
 * measures (planSittings: the minutes he gave set the questions a sitting, a hard question counts 1.5, a new round is a new sitting).
 * `opts.depth` asks "and at this depth instead" (the quick path for a small week).
 */
export function estimateToStart(ob, opts = {}) {
  const o = ob ? { ...ob, ...(opts.depth ? { depth: opts.depth } : {}) } : { answers: {}, off_limits: [], skipped: {}, depth: opts.depth || "standard", sitting: {} };
  const budget = Number(o.sitting && o.sitting.budget_min) || Number(opts.budget_min) || 40;
  const max = opts.budget_min || (o.sitting && o.sitting.budget_min) ? sittingMax(budget) : (o.sitting && o.sitting.max) || MAX_PER_SITTING;
  const answers = o.answers || {};
  const off = new Set(o.off_limits || []);
  const deferred = new Set(Object.entries(o.skipped || {}).filter(([, x]) => x && x.deferred === true).map(([id]) => id));
  const covered = (id) => { const a = answers[id]; return !!a && ["answered", "unknown", "off_limits"].includes(a.status); };
  const ids = [];
  for (const r of ["R0", "R1", "R2"]) for (const q of roundQuestions(o, r)) { if (q.must && !(covered(q.id) || off.has(q.id) || deferred.has(q.id))) ids.push(q.id); }
  if (!isExploring(answers)) { const have = adaptiveStatus(o).registered; for (let i = have; i < ADAPTIVE.min_registered; i++) ids.push(`A-x.${i + 1}`); }
  // the domain questions are part of the interview: the estimate counts them (critique 5, P2 invariant 7)
  const ROUND_ORDER = ["R0", "R1", "R2", "R3", "R4", "R5"];
  const domainIds = domainEstimateIds(o).filter((id) => !ids.includes(id));
  const all = [...ids, ...domainIds].map((id, i) => ({ id, i, r: ROUND_ORDER.indexOf((resolveQuestion(id) || { round: "R2" }).round) }));
  all.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r));
  const orderedIds = all.map((x) => x.id);
  const plan = planSittings(orderedIds, max);
  const n = plan.length;
  return {
    sittings: n, minutes_per_sitting: budget, questions: orderedIds.length, domain_questions: domainIds.length, per_sitting: max, depth: o.depth || "standard",
    say: `About ${n} sitting${n === 1 ? "" : "s"} of ${budget} minutes to reach a first plan (${orderedIds.length} question${orderedIds.length === 1 ? "" : "s"}${domainIds.length ? `, ${domainIds.length} of them about your role and level` : ""}, ${max} a sitting).`,
  };
}

export { ADAPTIVE, BANK };
