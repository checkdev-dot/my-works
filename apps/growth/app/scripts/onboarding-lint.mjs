// Lints the onboarding question bank (lib/onboarding-bank.mjs). No network, no LLM. Exit 1 on any FAIL.
// Run: node scripts/onboarding-lint.mjs                       lint the whole bank
//      node scripts/onboarding-lint.mjs --text "..." [--name "Design systems and IA"]...
//                                                           lint one wording (use it on every generated Round 2 question);
//                                                           a competency name, even one with "and" in it, is not two asks
//      node scripts/onboarding-lint.mjs --json              machine readable
import "./_no-people.mjs";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TOPICS, mappedIds, bankHas } from "../lib/onboarding-topics.mjs";
import { STANDARD_NICE, EXPLORING_NA, EXPLORING_MUST } from "../lib/onboarding.mjs";
import { lintDomainBank, DOMAIN_BANK } from "../lib/domain-bank.mjs";
import { DOMAIN_MUST_CAP } from "../lib/domain-flow.mjs";
import { BANK, ADAPTIVE, MODEL_PATHS, UNKNOWN_KINDS, ROUNDS, CONSUMER_KINDS, VOCAB_DEFAULTS, resolveQuestion, lintText, planSittings, counts, MAX_PER_SITTING, MAX_WORDS } from "../lib/onboarding-bank.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const ti = argv.indexOf("--text");
if (ti >= 0) {
  const names = argv.flatMap((a, i) => (a === "--name" ? [argv[i + 1]] : []));
  // The names in this app's own rubric are names too, never two asks.
  try {
    const dd = argv.indexOf("--data-dir");
    const rp = path.join(dd >= 0 ? path.resolve(argv[dd + 1]) : path.join(APP, "data"), "rubric.json");
    if (existsSync(rp)) for (const c of JSON.parse(readFileSync(rp, "utf8")).competencies || []) names.push(c.name);
  } catch { /* no rubric to read: only the names given */ }
  const problems = lintText(argv[ti + 1] || "", { maxWords: 35, names });
  console.log(problems.length ? problems.map((p) => `FAIL  ${p}`).join("\n") : "PASS  clean");
  process.exit(problems.length ? 1 : 0);
}

const fails = [];
const warns = [];
const fail = (m) => fails.push(m);
const types = readFileSync(path.join(APP, "lib", "types.ts"), "utf8");
const DASH = /[–—]/;
const seen = new Set();
const KINDS = new Set(["num", "numpair", "date", "month", "currency", "mcq", "multi", "list", "list_mcq", "fact", "timeuse", "timeuse_of", "text_ok", "free"]);
// Words that make a bank question Dev-only or career-only. The bank must work for any person in any field.
const DEV_ONLY = /\b(design|designer|portfolio|figma|linkedin|easy apply|rupee|rupees|inr|lakh|crore|craft growth|case study|product design|ux)\b/i;

for (const q of BANK) {
  const at = q.id;
  if (!/^[A-Z][A-Z0-9]*-\d{2}$/.test(q.id)) fail(`${at}: id does not match the pattern`);
  if (seen.has(q.id)) fail(`${at}: duplicate id`);
  seen.add(q.id);
  if (!ROUNDS.includes(q.round)) fail(`${at}: round ${q.round} is not R0 to R5`);
  for (const p of lintText(q.text)) fail(`${at}: ${p}`);
  for (const fu of q.follow_up) for (const p of lintText(fu.text)) fail(`${at}.f${fu.n}: ${p}`);
  for (const k of ["why", "changes"]) {
    if (!q[k] || typeof q[k] !== "string" || !q[k].trim()) fail(`${at}: missing ${k}`);
    else if (DASH.test(q[k])) fail(`${at}: ${k} has an em or en dash`);
    else if (q[k].split(/\s+/).length > 24) fail(`${at}: ${k} is longer than one line (24 words)`);
  }
  for (const t of [q.text, ...(q.options || []), ...q.follow_up.map((x) => x.text)]) if (DEV_ONLY.test(t)) fail(`${at}: "${t.slice(0, 50)}" assumes one person or one field (${DEV_ONLY.exec(t)[0]}); use a placeholder`);
  for (const m of q.text.match(/\{[^}]*\}/g) || []) {
    const k = m.slice(1, -1);
    if (!(k in VOCAB_DEFAULTS) && !["n", "low", "high", "competency", "credential"].includes(k)) fail(`${at}: placeholder ${m} is not defined`);
  }
  if (!Array.isArray(q.writes) || !q.writes.length) fail(`${at}: writes is empty`);
  for (const w of q.writes || []) {
    if (!MODEL_PATHS.includes(w)) { fail(`${at}: writes ${w}, which is not in MODEL_PATHS`); continue; }
    if (/^(profile|library|skills|evidence|proof|demands)\./.test(w)) {
      const leaf = w.split(".").pop();
      if (!types.includes(leaf) && !["entries", "items", "ratings", "gaps", "intake", "role"].includes(leaf)) fail(`${at}: writes ${w}, but ${leaf} is not in lib/types.ts`);
    }
  }
  // Every answer must DO something. The fixtures prove each kind with a sample answer.
  if (!q.consumer || !CONSUMER_KINDS.includes(q.consumer.kind) || !q.consumer.what) fail(`${at}: no consumer (what does the answer do?)`);
  else if (q.consumer.kind === "field" && !q.writes.some((w) => !w.startsWith("onboarding."))) fail(`${at}: consumer field but no live field in writes`);
  if (!q.unknown || typeof q.unknown.gap !== "string" || !q.unknown.gap) fail(`${at}: no unknown handling`);
  else if (q.unknown.task_kind !== "none" && !UNKNOWN_KINDS[q.unknown.task_kind]) fail(`${at}: unknown task_kind ${q.unknown.task_kind}`);
  else if (q.unknown.task_kind !== "none" && !(q.unknown.method && q.unknown.placement)) fail(`${at}: unknown handling has no method or placement`);
  if (!q.validate || !KINDS.has(q.validate.kind)) fail(`${at}: validate.kind ${q.validate && q.validate.kind} is not known`);
  if (["mcq", "multi"].includes(q.type) && !(q.options && q.options.length)) fail(`${at}: ${q.type} has no options`);
  if (!["E0", "E1", "E2", "E3"].includes(q.evidence_ask)) fail(`${at}: evidence_ask must be E0 to E3`);
}
for (const s of ADAPTIVE.slots) {
  for (const p of lintText(s.text, { maxWords: 35 })) fail(`adaptive ${s.slot}: ${p}`);
  for (const fu of s.follow_up || []) for (const p of lintText(fu)) fail(`adaptive ${s.slot} follow-up: ${p}`);
  for (const w of s.writes) if (!MODEL_PATHS.includes(w)) fail(`adaptive ${s.slot}: writes ${w} is not in MODEL_PATHS`);
  if (!s.unknown || !s.unknown.gap) fail(`adaptive ${s.slot}: no unknown handling`);
}
if (!ADAPTIVE.self_check.length || !ADAPTIVE.banned_patterns.length || !ADAPTIVE.constraints.length || !ADAPTIVE.inputs.length || !ADAPTIVE.outputs.length) fail("adaptive: template is missing inputs, outputs, constraints, banned patterns or self-check");
// A competency name that contains "and" must lint as a name, not as two asks.
if (lintText("What is the most advanced thing you did in Design systems and IA in the last 12 months that someone else could verify?", { maxWords: 35, names: ["Design systems and IA"] }).length) fail("lint: a competency name with 'and' in it is still rejected");
if (!lintText("What did you ship and also test?").length) fail("lint: a real double barrel is not rejected");

// Off limits by topic: every id a topic names is a question of the bank, and every topic has words to match.
for (const id of mappedIds()) if (!bankHas(id)) fail(`topics: ${id} is named by a topic but is not in the bank`);
for (const [k, tp] of Object.entries(TOPICS)) if (!tp.label || !tp.words.length) fail(`topics: ${k} has no label or no words`);
// Optional questions: each has a value 1 to 10 (a MUST is 10), and standard depth reaches at least 12 questions in Round 3.
for (const q of BANK) if (!(typeof q.value === "number" && q.value >= 1 && q.value <= 10)) fail(`${q.id}: needs a value from 1 to 10`);
{
  const r3must = BANK.filter((q) => q.round === "R3" && q.must).length;
  const r3nice = BANK.filter((q) => q.round === "R3" && !q.must).length;
  if (r3must + Math.min(STANDARD_NICE.R3, r3nice) < 12) fail(`depth: standard reaches ${r3must + Math.min(STANDARD_NICE.R3, r3nice)} questions in Round 3, fewer than 12`);
  if (r3must + r3nice < 18) fail("depth: deep must offer all of Round 3");
}
// No target role: every question that does not apply exists, and every promoted discovery question is a bank question.
for (const id of [...EXPLORING_NA, ...EXPLORING_MUST]) if (!BANK.some((q) => q.id === id)) fail(`exploring: ${id} is not a bank question`);
const sittings = planSittings();
sittings.forEach((s, i) => {
  if (s.weight > MAX_PER_SITTING) fail(`sitting ${i + 1} (${s.round}): weight ${s.weight} is over ${MAX_PER_SITTING}`);
  let run = 0;
  for (const id of s.ids) { const q = BANK.find((x) => x.id === id); run = q.hard ? run + 1 : 0; if (run > 3) fail(`sitting ${i + 1}: more than 3 hard questions in a row`); }
  if (s.est_min > 45) fail(`sitting ${i + 1} (${s.round}): about ${s.est_min} minutes, over 45`);
});
const c = counts();
if (c.min_viable_quick > 22) fail(`the quick path is ${c.min_viable_quick} questions; the cap is 22 so a 20 minute sitting reaches "enough to start" in 8 sittings or fewer`);
for (const q of BANK) if (q.minimum_viable && !q.must) fail(`${q.id} is on the minimum viable path but is not a MUST`);
if (c.must > 48) fail(`the bank has ${c.must} MUST questions; the cap is 48 (45 plus R0-01 to R0-03, which became MUST so the sitting size, tone and off-limits are never defaulted silently)`);
const sittingsMin = Math.max(...sittings.map((s) => s.est_min));
// The domain bank (lib/domain-bank.mjs): its own lint, its own MUST cap (19), and a sitting plan that counts both banks together.
const dl = lintDomainBank();
for (const m of dl.fails) fail(`domain ${m}`);
for (const m of dl.warns) warns.push(`domain ${m}`);
if (dl.counts.must > DOMAIN_MUST_CAP) fail(`the domain bank has ${dl.counts.must} MUST questions; its cap is ${DOMAIN_MUST_CAP} (counted apart from the 48 of the main bank)`);
{
  // The heaviest person: every family question (D, P and M) plus the 5 role and level ones. Main MUST and domain MUST together.
  const domainMust = DOMAIN_BANK.filter((q) => q.must).map((q) => q.id);
  const both = planSittings([...BANK.filter((q) => q.must).map((q) => q.id), ...domainMust]);
  both.forEach((s, i) => {
    if (s.weight > MAX_PER_SITTING) fail(`both banks, sitting ${i + 1} (${s.round}): weight ${s.weight} is over ${MAX_PER_SITTING}`);
    if (s.est_min > 45) fail(`both banks, sitting ${i + 1} (${s.round}): about ${s.est_min} minutes, over 45`);
  });
  var bothSittings = both.length;
  var bothMin = Math.max(...both.map((s) => s.est_min));
}
for (const q of DOMAIN_BANK) if (!resolveQuestion(q.id)) fail(`${q.id}: not registered with resolveQuestion`);

if (argv.includes("--json")) console.log(JSON.stringify({ counts: c, sittings: sittings.length, longest_sitting_min: sittingsMin, fails, warns }, null, 2));
else {
  for (const m of fails) console.log(`FAIL  ${m}`);
  for (const m of warns) console.log(`WARN  ${m}`);
  console.log(`\nBank: ${c.fixed} fixed (${Object.entries(c.by_round).map(([r, n]) => `${r} ${n}`).join(", ")}), ${c.must} MUST (${Object.entries(c.must_by_round).map(([r, n]) => `${r} ${n}`).join(", ")}), ${c.nice} NICE, ${c.hard} hard.`);
  console.log(`Adaptive Round 2: ${c.adaptive_must_slots} MUST slots (3 per competency x ${ADAPTIVE.k}) and up to ${c.adaptive_nice_slots} NICE; at least ${c.adaptive_min_registered} registered, each citing research.`);
  console.log(`Minimum viable path to "enough to start": R0, R1 and R2 MUST plus the adaptive batch = ${c.min_viable} questions.`);
  console.log(`Quick path (R0-11 quick, the minimum_viable marker): ${c.min_viable_quick} questions to "enough to start"${c.min_viable_quick <= 22 ? "" : " (OVER the 22 question limit)"}.`);
  console.log(`Sitting plan for every MUST: ${sittings.length} sittings of at most ${MAX_PER_SITTING} (hard counts 1.5, max 3 hard in a row), longest about ${sittingsMin} minutes (easy 3, hard 5), max wording ${MAX_WORDS} words.`);
  console.log(`Domain bank: ${dl.counts.total} questions (${dl.counts.must} MUST, cap ${DOMAIN_MUST_CAP}, counted apart from the main bank's 48; ${dl.counts.nice} NICE), ${dl.counts.r2_templates} research templates. Both banks together: ${bothSittings} sittings of at most ${MAX_PER_SITTING}, longest about ${bothMin} minutes.`);
  console.log(fails.length ? `\nFAIL: ${fails.length} problem(s).` : `\nPASS${warns.length ? ` with ${warns.length} warning(s)` : ""}.`);
}
process.exit(fails.length ? 1 : 0);
