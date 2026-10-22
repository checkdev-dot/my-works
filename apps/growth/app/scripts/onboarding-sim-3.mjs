// Round 3 simulation: the three people of critique 2 (a nurse, a fresh graduate who answers "I don't know" to half, a hostile
// person who gives one word answers and contradicts himself), each driven through the REAL scripts on a temp copy of the data,
// following the skill literally, with ZERO hand edits of any data file.
//   nurse     41, UX research, 5 hours a week, a child, 4 months of savings, online research works. Uses the sanctioned R5
//             rating step of the protocol (the one rate command the skill allows); nothing else is edited.
//   graduate  no job, no target role, research cannot run, R3 declined. Ends complete_with_gaps with plan_pending. No rating edit.
//   hostile   one word answers, refuses to name a role, contradicts himself, tries to skip and to jump rounds. No rating edit.
// Run: node scripts/onboarding-sim-3.mjs [nurse|graduate|hostile|all] [--keep <dir>] [--json]
// Exports PEOPLE3 / stepsFor / simulate3 for scripts/onboarding-fixtures.mjs.
import { actArgs } from "./onboarding-transport.mjs";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { runSteps } from "./onboarding-sim.mjs";
import { validate } from "../lib/validate.mjs";
import { listTree, readAll, PHRASE } from "../lib/onboarding-reset.mjs";
import { REGRESSION } from "./onboarding-personas.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = path.join(APP, "data");

// The three people of critique 2 now live in scripts/onboarding-personas.mjs with the three of critique 3 (one list, all six).
export const PEOPLE3 = { nurse: REGRESSION.nurse, graduate: REGRESSION.graduate, hostile: REGRESSION.hostile };
export const stepsFor = (key) => PEOPLE3[key].steps();

// ---- running -----------------------------------------------------------------------------------------------------------

/** Like runSteps, but a step marked expect:"refuse" passes only when the script refuses it. Returns { log, ok, refused_as_expected }. */
export function runSteps3(steps, io) {
  const log = [];
  let refusedAsExpected = 0;
  let edits = 0;
  for (const step of steps) {
    const a = step.a;
    if (a.type === "decide_open" || a.type === "write_ratings") {
      const r = runSteps([step], io, { stopOnRefusal: true });
      log.push(...r.log);
      if (a.type === "write_ratings") edits += 1;
      if (!r.ok) return { log, ok: false, refusedAsExpected, edits };
      continue;
    }
    const r = io.act(a);
    if (step.expect === "refuse") {
      const good = !r.ok;
      if (good) refusedAsExpected += 1;
      log.push({ say: step.say, a: { type: a.type, id: a.id, round: a.round }, ok: good, message: r.ok ? "SHOULD HAVE BEEN REFUSED" : `refused: ${r.message}`, expected_refusal: true });
      if (!good) return { log, ok: false, refusedAsExpected, edits };
      continue;
    }
    log.push({ say: step.say, a: { type: a.type, id: a.id, round: a.round }, ...r });
    if (!r.ok) return { log, ok: false, refusedAsExpected, edits };
  }
  return { log, ok: true, refusedAsExpected, edits };
}

const node = process.execPath;
function run(script, args) {
  try { return { code: 0, out: execFileSync(node, [path.join(APP, "scripts", script), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; } catch (e) { return { code: e.status, out: String(e.stdout || "") + String(e.stderr || "") }; }
}
const lastJson = (t) => { try { return JSON.parse(String(t).trim().split(/\r?\n/).filter((l) => l.startsWith("{")).pop()); } catch { return {}; } };

function copyLive(to) {
  fs.mkdirSync(to, { recursive: true });
  for (const rel of listTree(LIVE)) {
    if (rel.startsWith(".")) continue;
    fs.mkdirSync(path.dirname(path.join(to, rel)), { recursive: true });
    fs.copyFileSync(path.join(LIVE, rel), path.join(to, rel));
  }
  return to;
}

/** Real scripts on a temp copy: reset (token + phrase), every step through onboarding-act.mjs, then the check and the validator. */
export function simulate3(key, dataDir) {
  const person = PEOPLE3[key];
  const out = { person: key, label: person.label, dataDir, hand_edits: 0, sanctioned_rate_steps: 0 };
  const plan = run("onboarding-reset.mjs", ["plan", "--data-dir", dataDir]);
  const token = (/Token \(valid 15 minutes[^)]*\): (\S+)/.exec(plan.out) || [])[1];
  const ap = run("onboarding-act.mjs", [...actArgs({ type: "onboard.reset", token: token || "x", phrase: PHRASE, different_person: person.different_person === true }), "--data-dir", dataDir]);
  out.reset = String(lastJson(ap.out).message || ap.out).slice(0, 120);
  if (ap.code !== 0) { out.ok = false; out.error = "reset failed"; return out; }
  const skillsFile = path.join(dataDir, "skills.json");
  const skillsAfterReset = fs.readFileSync(skillsFile, "utf8");
  const io = {
    act(action) {
      const r = run("onboarding-act.mjs", [...actArgs(action), "--data-dir", dataDir]);
      const j = lastJson(r.out);
      return { ok: r.code === 0 && j.ok !== false, message: j.message || r.out.slice(0, 200) };
    },
    read: () => readAll(dataDir).d,
  };
  const res = runSteps3(person.steps(), io);
  out.steps = res.log.length;
  out.ok = res.ok;
  out.refused_as_expected = res.refusedAsExpected;
  out.sanctioned_rate_steps = res.edits;
  // Measured, not asserted: with no rubric action and no rate step, skills.json must be byte for byte what the reset wrote.
  const usesRubric = person.steps().some((x) => x.a.type === "onboard.rubric");
  out.hand_edits = !usesRubric && fs.readFileSync(skillsFile, "utf8") !== skillsAfterReset ? 1 : 0;
  out.skills_file_unchanged = fs.readFileSync(skillsFile, "utf8") === skillsAfterReset;
  out.refused = res.log.filter((l) => !l.ok).map((l) => `${l.say}: ${l.message}`);
  out.log = res.log;
  const chk = run("onboarding-check.mjs", ["--data-dir", dataDir, "--json"]);
  try { const c = JSON.parse(chk.out); out.check = { verdict: c.verdict, fails: c.fails, warns: c.warns, readiness: c.readiness, must: `${c.must_answered} of ${c.must_total}`, status: c.status }; } catch { out.check = { raw: chk.out.slice(0, 300) }; }
  const { d } = readAll(dataDir);
  out.validate = validate(d).errors;
  out.final = {
    status: d.onboarding && d.onboarding.status, round: d.onboarding && d.onboarding.round, complete_with_gaps: d.onboarding && d.onboarding.complete_with_gaps,
    plan_pending: d.onboarding && d.onboarding.plan_pending, rubric_generic: d.rubric && d.rubric.generic === true,
    rubric: d.rubric && d.rubric.competencies.map((c) => c.id), ratings_placeholder: Object.values((d.skills && d.skills.ratings) || {}).filter((r) => r.placeholder).length,
    open_unknowns: ((d.unknowns && d.unknowns.items) || []).filter((u) => u.status === "open").length,
    contract_tasks: ((d.unknowns && d.unknowns.items) || []).filter((u) => /contract/i.test(`${u.method} ${u.what}`)).length,
    contradictions: ((d.onboarding && d.onboarding.contradictions) || []).map((c) => `${c.id} ${c.status}`),
    name: d.profile && d.profile.name,
  };
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const which = args.find((a) => !a.startsWith("--")) || "all";
  const ki = args.indexOf("--keep");
  const root = ki >= 0 ? path.resolve(args[ki + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), "growth-sim3-"));
  const keys = which === "all" ? Object.keys(PEOPLE3) : [which];
  const results = keys.map((k) => simulate3(k, copyLive(path.join(root, k))));
  if (args.includes("--json")) console.log(JSON.stringify(results, null, 2));
  else for (const r of results) {
    console.log(`\n== ${r.person}: ${r.label}`);
    console.log(`   reset: ${r.reset}`);
    console.log(`   steps ${r.steps}, ${r.ok ? "no unexpected refusal" : `STOPPED: ${r.refused[0]}`}; refused as expected: ${r.refused_as_expected}; hand edits: ${r.hand_edits} (measured); skills.json unchanged since the reset: ${r.skills_file_unchanged}; sanctioned rate steps: ${r.sanctioned_rate_steps}`);
    if (r.check) console.log(`   check: ${r.check.verdict} (${r.check.status}, must ${r.check.must}, readiness ${r.check.readiness}); fails ${JSON.stringify(r.check.fails)}; warns ${(r.check.warns || []).length}`);
    console.log(`   validator errors: ${(r.validate || []).length}`);
    console.log(`   final: ${JSON.stringify(r.final)}`);
  }
  process.exit(results.every((r) => r.ok && (r.validate || []).length === 0 && r.check && r.check.verdict !== "FAIL" && r.hand_edits === 0) ? 0 : 1);
}
