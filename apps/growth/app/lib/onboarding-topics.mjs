// Off-limits by TOPIC and by MEANING. R0-03 is what a person rules out, in his own words. This file turns those words into topics,
// the topics into the question ids they cover, and gives the keyword test that keeps a generated or follow-up question from
// asking about a topic he excluded. Pure: no node built-ins. One decision is recorded per question: skipped_by_boundary, no penalty.
//
// How a phrase is read (critique 4, P1-3), in this order and no other:
//   1. a bank id ("B-27") excludes that question;
//   2. a mapping he confirmed (onboard.boundary {phrase, topics, confirmed, quote}) excludes those topics;
//   3. a phrase made ONLY of taxonomy words ("my health", "my mental health", "my baby") excludes those topics;
//   4. anything else is "unmatched": it excludes nothing, and the model shows it back ("I read 'my baby' as: parenting, family.
//      OK?") and records the answer with onboard.boundary. A word that merely CONTAINS a taxonomy word ("energy drink",
//      "income tax", "feelings of being a fraud") is never a hit. The taxonomy is the only vocabulary; the model's reading is
//      the intent layer, and it counts only with his words.
//
//   parseOffLimits(list, today, boundaryMap)  his words -> { ids, words, topics, none, boundary, unmatched, mapped }
//   topicsHitBy(text, off)                    the excluded topics (and his own words) a piece of wording touches
//   describeOffLimits(off)                    the plain list shown to him: which questions will not be asked, and what that costs
import { BANK, resolveQuestion } from "./onboarding-bank.mjs";

/** The taxonomy. `words`: what a person says (matched on word starts). `ids`: bank questions that ask about it. */
export const TOPICS = {
  health: { label: "health", words: ["health", "medical", "illness", "ill", "sick", "sickness", "disease", "surgery", "diagnos", "chronic", "pain", "hospital", "doctor", "medication", "treatment", "pregnan", "maternity", "body"], ids: ["H-01", "H-02", "K-02"] },
  mental_health: { label: "mental health", words: ["mental", "burnout", "burn out", "burnt out", "anxiety", "anxious", "depress", "therapy", "therapist", "counsel", "panic", "stress", "trauma", "breakdown", "wellbeing", "well-being", "energy", "mood", "feelings", "emotion"], ids: ["H-01", "H-02", "R3-01", "R3-02", "R3-04", "R3-05", "R3-07", "R3-10", "R3-13", "R3-14"] },
  family: { label: "family and relationships", words: ["family", "partner", "spouse", "wife", "husband", "marriage", "married", "divorce", "children", "child", "kids", "kid", "son", "daughter", "parents", "mother", "father", "mum", "mom", "dad", "grandparents", "carer", "caring", "caregiver", "dependant", "dependent", "household", "relationship", "girlfriend", "boyfriend", "in-laws", "in laws", "siblings", "sister", "brother"], ids: ["B-27", "F-12", "H-02", "R3-18"] },
  parenting: { label: "a baby, a child or parenting", words: ["baby", "babies", "newborn", "nursery", "breastfeeding", "breastfeed", "toddler", "infant", "childcare", "child care", "custody", "maternity", "paternity", "parenting", "motherhood", "fatherhood", "single parent", "single mum", "single mom", "school run"], ids: ["B-27", "H-02", "F-12", "R3-18"] },
  bereavement: { label: "a death or grief", words: ["grief", "grieving", "bereavement", "bereaved", "died", "death", "passed away", "funeral", "widow", "widowed", "mourning"], ids: ["H-02", "R3-18"] },
  redundancy_layoff: { label: "a redundancy or layoff", words: ["redundancy", "redundant", "redundancies", "layoff", "layoffs", "laid off", "let go", "severance", "downsiz", "restructur", "dismissed"], ids: ["K-02", "B-30", "R3-04", "R3-05", "RJ-01", "B-36"] },
  illness_cancer: { label: "a serious illness", words: ["cancer", "chemo", "chemotherapy", "tumour", "tumor", "oncolog", "diabetes", "diabetic", "epilep", "terminal", "dementia", "hiv", "stroke"], ids: ["H-01", "H-02", "K-02"] },
  finances_debt: { label: "money problems and debt", words: ["debt", "debts", "loan", "loans", "owe", "mortgage", "emi", "bankrupt", "bankruptcy", "overdraft", "credit card", "credit"], ids: ["F-11", "F-10", "F-12", "B-20", "B-36"] },
  identity_role_loss: { label: "who I am without this role", words: ["identity", "who i am", "sense of self", "demotion", "demoted", "role loss", "lost my role"], ids: ["R3-18", "R3-04", "R3-05"] },
  money_debt: { label: "money and debt", words: ["money", "debt", "loan", "loans", "owe", "mortgage", "emi", "credit card", "savings", "finances", "financial", "bankrupt", "bills", "rent"], ids: ["F-11", "F-10", "F-12", "B-20", "B-36"] },
  current_pay: { label: "my current pay", words: ["salary", "my pay", "income", "earnings", "what i earn", "how much i earn", "compensation"], ids: ["B-07", "B-09", "B-11"] },
  religion: { label: "religion", words: ["religion", "religious", "faith", "church", "temple", "mosque", "prayer", "worship", "belief"], ids: [] },
  caste_community: { label: "caste or community", words: ["caste", "community", "tribe", "ethnic", "ethnicity", "race", "racial", "ancestry"], ids: [] },
  disability: { label: "disability", words: ["disabilit", "disabled", "impairment", "wheelchair", "neurodiver", "adhd", "autis", "dyslex", "deaf", "blind", "special needs"], ids: ["H-01", "H-02"] },
  immigration: { label: "immigration and visa", words: ["visa", "immigration", "immigrant", "citizenship", "work permit", "sponsorship", "residency", "green card", "passport", "asylum", "right to work"], ids: ["B-28", "B-35"] },
  age: { label: "age", words: ["age", "how old", "years old", "birthday", "birth date", "date of birth"], ids: ["K-01", "B-32"] },
  politics: { label: "politics", words: ["politic", "election", "government", "vote", "voting", "party"], ids: [] },
  sexuality: { label: "sexuality and gender", words: ["sexual", "orientation", "gay", "lesbian", "queer", "lgbt", "gender", "transgender", "pronoun", "dating"], ids: [] },
  past_employer: { label: "a past employer or conflict at work", words: ["fired", "laid off", "layoff", "dismiss", "terminat", "former boss", "previous boss", "past employer", "old employer", "last job", "previous job", "harass", "grievance", "toxic", "my old boss", "ex boss"], ids: ["K-02", "B-30", "R3-04", "R3-05", "RJ-01"] },
  legal: { label: "legal matters", words: ["legal", "lawsuit", "court", "lawyer", "litigation", "police", "non-compete", "nda", "contract dispute", "contract"], ids: ["E-01", "B-25", "B-36"] },
};
/** The keys the model may map a phrase to with onboard.boundary. */
export const TOPIC_KEYS = Object.keys(TOPICS);

const NONE_WORDS = /^(none|nothing|no|nope|n\/a|na|nil|no topics?|nothing at all|nothing is off limits|nothing off limits|nothing is off limit|nothing is off the table|everything is fine|everything is ok|ask me anything|ask anything|anything is fine|no limits)$/i;
const ID_RE = /^[A-Z][A-Z0-9]{0,3}-\d{2}(\.f\d)?$/;
// Words that carry no topic of their own. A phrase is read as a topic only when every other word is a taxonomy word.
const FILLER = new Set(["my", "our", "your", "the", "a", "an", "any", "anything", "all", "about", "on", "of", "to", "and", "or", "with", "for", "in", "at", "talk", "talking", "question", "questions", "topic", "topics", "discuss", "discussing", "ask", "asking", "me", "i", "am", "im", "i'm", "is", "was", "has", "had", "have", "been", "being", "whole", "entire", "everything", "related", "regarding", "around", "no", "not", "please", "dont", "don't", "do", "mention", "that", "this", "these", "those", "issues", "issue", "matters", "stuff", "things", "thing", "situation", "lack", "recent", "recently"]);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A topic word matches at a word start (so "age" does not match "manage", "ill" does not match "skill").
const hit = (text, w) => new RegExp(`(^|[^a-z])${esc(w)}`, "i").test(text) && (w.length >= 5 || new RegExp(`(^|[^a-z])${esc(w)}([^a-z]|$)`, "i").test(text));
const tokenHits = (t, w) => (w.length >= 5 ? t.startsWith(w) : t === w);

/** A phrase, lower case, single spaces: the key of a confirmed mapping. */
export const normPhrase = (s) => String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The topics a phrase names by taxonomy words alone. Returns { topics, rest } where `rest` lists the words of the phrase that no
 * topic owns: a phrase is a hit only when `rest` is empty and `topics` is not. Multi word taxonomy entries ("laid off") are taken
 * from the phrase first.
 */
export function phraseTopics(phrase) {
  let low = normPhrase(phrase).replace(/[.,;:!?()"]/g, " ");
  const topics = [];
  const add = (k) => { if (!topics.includes(k)) topics.push(k); };
  for (const [k, t] of Object.entries(TOPICS)) for (const w of t.words) if (/[\s-]/.test(w) && low.includes(w)) { add(k); low = low.replace(w, " "); }
  const rest = [];
  for (const tok of (low.match(/[a-z']+/g) || []).filter((x) => !FILLER.has(x))) {
    const owners = Object.entries(TOPICS).filter(([, t]) => t.words.some((w) => !/[\s-]/.test(w) && tokenHits(tok, w))).map(([k]) => k);
    if (owners.length) owners.forEach(add); else rest.push(tok);
  }
  return { topics, rest };
}

/** One short label for a question, for the list shown to him. */
export function labelOf(id) {
  const q = resolveQuestion(id);
  if (!q) return id;
  return `${id} ${String(q.text).replace(/\{[^}]*\}/g, "that").split(/[?.]/)[0].split(/\s+/).slice(0, 6).join(" ")}`;
}

/**
 * His words (the value of R0-03) to what is excluded. See the header for the order. `boundaryMap` is onboarding.boundary_map:
 * { "<normalised phrase>": { topics: [...], confirmed: true, quote } }. A mapping without `confirmed` is a pending guess and
 * excludes nothing.
 * boundary: { id: { topic, at } } for every bank question that will not be asked. none: he said nothing is off limits.
 * unmatched: phrases that excluded nothing and still need a confirmed reading. pending: unconfirmed readings by phrase.
 */
export function parseOffLimits(list, today = "", boundaryMap = {}) {
  const items = (Array.isArray(list) ? list : [list]).map((x) => String(x == null ? "" : x).trim()).filter(Boolean);
  const out = { ids: [], words: [], topics: [], none: false, boundary: {}, unmatched: [], mapped: {} };
  if (!items.length) return out;
  if (items.every((x) => NONE_WORDS.test(x))) { out.none = true; return out; }
  const take = (k, label) => {
    if (!TOPICS[k]) return;
    if (!out.topics.includes(k)) out.topics.push(k);
    for (const id of TOPICS[k].ids) {
      if (!out.ids.includes(id)) out.ids.push(id);
      if (!out.boundary[id]) out.boundary[id] = { topic: label || TOPICS[k].label, at: today };
    }
  };
  for (const raw of items) {
    if (NONE_WORDS.test(raw)) continue;
    if (ID_RE.test(raw)) {
      const base = raw.replace(/\.f\d$/, "");
      if (!out.ids.includes(base)) out.ids.push(base);
      if (!out.boundary[base]) out.boundary[base] = { topic: "named by id", at: today };
      continue;
    }
    out.words.push(raw);
    const m = (boundaryMap || {})[normPhrase(raw)];
    if (m && m.confirmed === true && Array.isArray(m.topics) && m.topics.length) {
      out.mapped[raw] = m.topics.filter((k) => TOPICS[k]);
      for (const k of out.mapped[raw]) take(k);
      continue;
    }
    const pt = phraseTopics(raw);
    if (pt.topics.length && !pt.rest.length) { for (const k of pt.topics) take(k); continue; }
    out.unmatched.push(raw);
  }
  return out;
}

/** The excluded topics (labels) and his own unmatched words that a wording touches. [] when it touches none. */
export function topicsHitBy(text, off = {}) {
  const t = String(text || "").toLowerCase();
  const hits = [];
  for (const k of off.topics || []) if (TOPICS[k] && TOPICS[k].words.some((w) => hit(t, w))) hits.push(TOPICS[k].label);
  for (const w of off.words || []) {
    const lw = String(w).toLowerCase().trim();
    if (lw.length >= 4 && hit(t, lw) && !hits.includes(lw)) hits.push(lw);
  }
  return hits;
}

/** What the person is shown after R0-03: the questions that will not be asked and, in the same list, what each costs. */
export function describeOffLimits(off = {}) {
  const ids = off.ids || [];
  const must = ids.filter((id) => { const q = resolveQuestion(id); return q && q.must; });
  const nice = ids.filter((id) => !must.includes(id));
  return {
    not_asked: ids.map(labelOf),
    must_not_asked: must.map((id) => ({ id, label: labelOf(id), what_stays_unknown: resolveQuestion(id).changes })),
    nice_not_asked: nice,
    unmatched_words: off.unmatched || [],
  };
}

/** Bank ids a topic key covers (empty for an unknown key). */
export const idsOfTopic = (k) => (TOPICS[k] ? [...TOPICS[k].ids] : []);
/** Every bank question id that names a topic (for a lint that the map points at real questions). */
export const mappedIds = () => [...new Set(Object.values(TOPICS).flatMap((t) => t.ids))];
export const bankHas = (id) => BANK.some((q) => q.id === id);
