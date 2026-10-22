// The regression suite for the onboarding: ten people (six end to end, four structural: units, transport, boundaries, crisis), each driven from the reset to the end (or the defined stopping state)
// through the REAL scripts (onboarding-reset.mjs, onboarding-act.mjs, onboarding-check.mjs) on a TEMP COPY of the data, with
// GROWTH_BACKUP_DIR pointing at a temp folder (so the snapshots land outside the data folder, as they should under a synced folder).
// The people and their literal answers are in scripts/onboarding-personas.mjs (REGRESSION). Each new critique adds a person
// there, never a patch for the last one: the classes of failure are asserted on every person, every time.
//
// Per person it asserts: no hand edit of any data file, no refusal without a stated reason (and none that was not expected),
// the validator finds 0 errors, onboarding-check gives no FAIL, no number was concatenated, no currency symbol disagrees with
// the person's currency, what he ruled out was never asked, interview snapshots hold only touched files and are pruned at the
// end, and the final state (status, readiness, currency, refusals) is what the person's definition says.
// Run: node scripts/onboarding-regression.mjs [nurse|graduate|hostile|owner|burnout|voice|apprentice|redundancy|mother|adversary|all] [--keep <dir>] [--json]
import { actArgs } from "./onboarding-transport.mjs";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { REGRESSION } from "./onboarding-personas.mjs";
import { runSteps3 } from "./onboarding-sim-3.mjs";
import { validate } from "../lib/validate.mjs";
import { listTree, readAll, PHRASE, backupRoot } from "../lib/onboarding-reset.mjs";
import { progress, isMustFor } from "../lib/onboarding.mjs";
import { resolveQuestion } from "../lib/onboarding-bank.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = path.join(APP, "data");
const node = process.execPath;
const sha = (b) => crypto.createHash("sha1").update(b).digest("hex");

function run(script, args, env) {
  try { return { code: 0, out: execFileSync(node, [path.join(APP, "scripts", script), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout || "") + String(e.stderr || "") }; }
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
const treeHash = (dir) => Object.fromEntries(listTree(dir).filter((r) => !r.startsWith(".")).map((r) => [r, sha(fs.readFileSync(path.join(dir, r)))]));

const SYMBOL = [["₹", "INR"], ["£", "GBP"], ["€", "EUR"], ["$", "USD"]];
const DOLLAR_FAMILY = new Set(["USD", "CAD", "AUD", "NZD", "SGD", "HKD", "MXN"]);

export function regress(key, dataDir, backupDir) {
  const person = REGRESSION[key];
  const env = { GROWTH_BACKUP_DIR: backupDir };
  process.env.GROWTH_BACKUP_DIR = backupDir; // this process reads the same backup tree the scripts write
  const checks = [];
  const check = (name, okv, detail = "") => checks.push({ name, ok: !!okv, detail: okv ? "" : String(detail).slice(0, 400) });
  const liveBefore = JSON.stringify(treeHash(LIVE));

  // reset by token and phrase through the real script (the temp copy only)
  const plan = run("onboarding-reset.mjs", ["plan", "--data-dir", dataDir], env);
  const token = (/Token \(valid 15 minutes[^)]*\): (\S+)/.exec(plan.out) || [])[1];
  const ap = run("onboarding-act.mjs", [...actArgs({ type: "onboard.reset", token: token || "x", phrase: PHRASE, different_person: person.different_person === true }), "--data-dir", dataDir], env);
  check("reset by token and phrase applied", ap.code === 0, ap.out.slice(0, 200));
  if (ap.code !== 0) return { key, label: person.label, checks, steps: 0 };
  const afterReset = treeHash(dataDir);

  // every step through the act script; the harness itself never writes a data file
  const refusals = [];
  const io = {
    act(action) {
      const r = run("onboarding-act.mjs", [...actArgs(action), "--data-dir", dataDir], env);
      const j = lastJson(r.out);
      const res = { ok: r.code === 0 && j.ok !== false, message: j.message || r.out.slice(0, 300), notes: j.notes };
      if (!res.ok) refusals.push({ action: `${action.type}${action.id ? ` ${action.id}` : action.round ? ` ${action.round}` : ""}`, message: res.message });
      return res;
    },
    read: () => readAll(dataDir).d,
  };
  const res = runSteps3(person.steps(), io);
  check("every step went through the act script, none refused unexpectedly", res.ok, JSON.stringify(res.log.filter((l) => !l.ok && !l.expected_refusal).slice(0, 2)));
  check("0 refused without a reason: every refusal states one (non empty, says nothing was changed)", refusals.every((r) => r.message && r.message.length > 15 && /Nothing was changed|nothing was changed|Nothing changed|busy/.test(r.message)), JSON.stringify(refusals.filter((r) => !r.message || r.message.length <= 15 || !/Nothing was changed|nothing was changed|Nothing changed|busy/.test(r.message)).slice(0, 2)));
  check(`refusals are exactly the expected ones (${person.expect.refused})`, res.refusedAsExpected === person.expect.refused && refusals.length === person.expect.refused, `${res.refusedAsExpected} expected-refusals, ${refusals.length} refusals in total`);

  const { d, errors } = readAll(dataDir);
  const v = validate(d).errors;
  check("validator finds 0 errors", v.length === 0 && errors.length === 0, v.slice(0, 2).join(" | "));
  const chk = run("onboarding-check.mjs", ["--data-dir", dataDir, "--json"], env);
  let verdict = "unreadable";
  try { verdict = JSON.parse(chk.out).verdict; } catch { /* below */ }
  check("onboarding-check gives no FAIL", verdict !== "FAIL" && verdict !== "unreadable", verdict + " " + chk.out.slice(0, 200));

  const ob = d.onboarding || {};
  const answers = ob.answers || {};
  // no hand edit: skills.json is what the reset wrote plus onboard.rubric / onboard.rating only; ratings are appended, never replaced
  const ratings = (d.skills && d.skills.ratings) || {};
  const rated = Object.values(ratings).filter((r) => r.placeholder !== true);
  check("no hand edit: every rating keeps its placeholder entry first and only appends (history length 2, placeholder true on entry 0)", rated.every((r) => r.history.length === 2 && r.history[0].placeholder === true && Array.isArray(r.history[1].because) && r.history[1].because.length > 0), JSON.stringify(rated.slice(0, 1)));
  if (!person.steps().some((s) => s.a.type === "onboard.rubric")) check("no hand edit: with no rubric action skills.json is byte for byte what the reset wrote", sha(fs.readFileSync(path.join(dataDir, "skills.json"))) === afterReset["skills.json"]);
  check("no hand edit: the harness has no step that edits a data file (only onboard.* actions, decide_open and the rating step, which is onboard.rating)", person.steps().every((s) => s.a.type.startsWith("onboard.") || s.a.type === "decide_open" || s.a.type === "write_ratings" || s.a.type.startsWith("unknown.")));

  // no concatenated numbers
  const bad = [];
  for (const [id, a] of Object.entries(answers)) {
    const q = resolveQuestion(id);
    if (!q || !["num", "numpair"].includes((q.validate || {}).kind) || a.status !== "answered") continue;
    const vals = Array.isArray(a.value) ? a.value : [a.value];
    if (!vals.every((x) => typeof x === "number" && Number.isFinite(x))) { bad.push(`${id}: ${JSON.stringify(a.value)}`); continue; }
    const rawNums = (String(a.raw || "").match(/\d[\d,]*/g) || []).map((x) => x.replace(/,/g, ""));
    const joined = rawNums.join("");
    if (rawNums.length > 1 && vals.length === 1 && String(vals[0]) === joined) bad.push(`${id}: ${a.raw} became ${vals[0]}`);
    if (vals.some((x) => x < 0 || x > 1e9)) bad.push(`${id}: out of range ${vals}`);
  }
  check("no concatenated or absurd numbers", bad.length === 0, bad.join(" | "));

  // currency: every symbol anywhere in what he said agrees with his currency, and every money field carries it
  const cur = String((d.profile.situation || {}).currency || "").toUpperCase();
  const mismatches = [];
  for (const [id, a] of Object.entries(answers)) {
    const txt = `${a.raw || ""} ${typeof a.value === "string" ? a.value : ""}`;
    for (const [sym, code] of SYMBOL) if (txt.includes(sym) && !(code === cur || (sym === "$" && DOLLAR_FAMILY.has(cur)))) mismatches.push(`${id} has ${sym} but the currency is ${cur}`);
  }
  check(`no currency symbol mismatch (currency ${cur})`, cur === person.expect.currency && mismatches.length === 0, mismatches.join(" | ") || `currency ${cur}`);
  const pf = d.profile;
  const moneyFields = [["north_star.salary_inr_per_month", pf.north_star && pf.north_star.salary_inr_per_month, pf.north_star && pf.north_star.salary_currency], ["constraints.salary_floor_inr", pf.constraints && pf.constraints.salary_floor_inr, pf.constraints && pf.constraints.salary_floor_currency], ["baseline.salary_now_inr", pf.baseline && pf.baseline.salary_now_inr, pf.baseline && pf.baseline.salary_now_currency]];
  // a field the person never answered (a blank 0 from the reset, or absent) holds no money value, so it has no currency to carry
  check("every money field he gave carries its currency beside it", moneyFields.every(([, val, c]) => val === undefined || val === null || val === 0 || (typeof c === "string" && c.toUpperCase() === cur)), JSON.stringify(moneyFields));

  // off limits: asked never, answered never, no task, recorded as skipped_by_boundary
  const off = person.expect.off_limits || [];
  const asked = off.filter((id) => answers[id] && ["answered", "unknown"].includes(answers[id].status));
  const rows = off.filter((id) => ((d.unknowns && d.unknowns.items) || []).some((u) => u.question === id));
  const recorded = off.filter((id) => ob.skipped_by_boundary && ob.skipped_by_boundary[id]);
  check(`off limits respected (${off.length} questions ruled out, none asked, none a task, all recorded as skipped_by_boundary)`, asked.length === 0 && rows.length === 0 && recorded.length === off.length && off.every((id) => (ob.off_limits || []).includes(id)), `asked ${asked} rows ${rows} recorded ${recorded.length}/${off.length}`);

  // the final state
  const pr = progress(ob, (d.unknowns && d.unknowns.items) || []);
  // A structural person (critique 4) stops where his class of failure has been exercised: not complete, so no plan is pending and the
  // MUST of the later rounds are not yet covered. Everything else (no refusal without a reason, the validator, the check) still holds.
  const partial = person.expect.partial === true;
  check(`final status is ${person.expect.status}`, ob.status === person.expect.status, ob.status);
  if (person.expect.readiness) check(`final readiness is ${person.expect.readiness}`, pr.readiness === person.expect.readiness, `${pr.readiness} (${pr.readiness_blockers.join("; ")})`);
  if (!partial) {
    check("nothing MUST is missing at the end", pr.missing_must.length === 0, pr.missing_must.join(","));
    check("a plan is pending with a next command (no plan.json yet)", ob.plan_pending && ob.plan_pending.next_command, JSON.stringify(ob.plan_pending));
  }

  // snapshots: only touched files, outside the data folder, pruned at completion
  const root = backupRoot(dataDir);
  const sets = (() => { try { return fs.readdirSync(path.join(root, "_sets")).sort(); } catch { return []; } })();
  const interview = sets.filter((n) => { try { return JSON.parse(fs.readFileSync(path.join(root, "_sets", n, "_what.json"), "utf8")).partial === true; } catch { return false; } });
  const widest = Math.max(0, ...interview.map((n) => fs.readdirSync(path.join(root, "_sets", n)).length));
  const inData = path.join(dataDir, ".backups");
  check(`snapshots and the reset archive go to GROWTH_BACKUP_DIR, nothing into the data folder (${interview.length} interview sets kept)`, root.startsWith(path.resolve(backupDir)) && !fs.existsSync(inData), root);
  check(`interview snapshots are pruned at completion (at most 3 kept, was one per act)`, ob.status !== "complete" || interview.length <= 3, String(interview.length));
  check(`each interview snapshot holds only the files that act changed (widest ${widest} files, a full set is 20)`, widest <= 8, String(widest));
  const live = JSON.stringify(treeHash(LIVE));
  check("live data untouched", live === liveBefore);

  // person specific
  const tasks = (ob.derived && ob.derived.tasks) || [];
  const rowsOpen = ((d.unknowns && d.unknowns.items) || []).filter((u) => u.status === "open");
  if (person.expect.no_contract_task) check("an owner gets no read-your-contract task", !rowsOpen.some((u) => ["B-25", "E-01", "B-36"].includes(u.question)) && !tasks.some((t) => t.id === "OT-E-01"), JSON.stringify(rowsOpen.map((u) => u.question)));
  if (person.expect.exploring) {
    const dead = [...rowsOpen.map((u) => `${u.method} ${u.what}`), ...tasks.map((t) => t.task)].filter((s) => /stated direction|Attempt the task|range for the role|research round|rubric|live posts/i.test(s));
    check("an exploration course with no dead task (3 talks, shadow, 2 experiments, energy audit, reading)", tasks.filter((t) => /^OT-X-/.test(t.id)).length === 8 && dead.length === 0, dead.join(" | "));
    check("the discovery questions were asked (MUST for him) and the role questions were not", ["X-01", "X-02", "X-03", "A-01", "E-03"].every((id) => answers[id] && answers[id].status === "answered") && ["B-06", "B-08", "B-33", "B-16", "T-03"].every((id) => !answers[id]), JSON.stringify(Object.keys(answers).filter((id) => ["B-06", "B-08", "B-33", "B-16", "T-03", "X-01"].includes(id))));
  }
  if (person.expect.voice) {
    const items = (d.research && d.research.items) || [];
    const p4 = items.find((x) => x.id === "rs-004"); const p5 = items.find((x) => x.id === "rs-005");
    check("voice: both salary items are numbers per month (12 to 18 LPA is 100,000 to 150,000)", p4 && p4.parsed && p4.parsed.low === 100000 && p4.parsed.high === 150000 && p5 && p5.parsed && p5.parsed.low === 90000 && p5.parsed.high === 140000, JSON.stringify([p4 && p4.parsed, p5 && p5.parsed]));
    check("voice: B-33 1200000 per year was stored as 100000 per month and B-10 85000 from words", answers["B-33"].value === 100000 && answers["B-10"].value === 85000 && answers["B-07"].value === 90000 && answers["B-17"].value === 10 && answers["B-20"].value === 2, JSON.stringify(["B-33", "B-10", "B-07", "B-17", "B-20"].map((id) => answers[id] && answers[id].value)));
  }
  if (typeof person.expect.verify === "function") for (const [name, okv, detail] of person.expect.verify({ d, ob, answers, pr })) check(name, okv, detail);
  return { key, label: person.label, checks, steps: res.log.length, readiness: pr.readiness, refused: refusals.length, interview_sets: interview.length, widest_set: widest };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const which = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--keep") || "all";
  const ki = args.indexOf("--keep");
  const root = ki >= 0 ? path.resolve(args[ki + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), "growth-reg-"));
  const keys = which === "all" ? Object.keys(REGRESSION) : [which];
  const out = [];
  for (const k of keys) {
    if (!REGRESSION[k]) { console.error(`unknown person ${k}; one of ${Object.keys(REGRESSION).join(", ")}`); process.exit(2); }
    const dataDir = copyLive(path.join(root, k, "data"));
    out.push(regress(k, dataDir, path.join(root, k, "backups")));
  }
  if (args.includes("--json")) console.log(JSON.stringify(out, null, 2));
  else {
    for (const r of out) {
      const fails = r.checks.filter((c) => !c.ok);
      console.log(`\n== ${r.key}: ${r.label}`);
      console.log(`   ${r.steps} steps, readiness ${r.readiness}, ${r.refused} refused as expected, ${r.interview_sets} interview snapshot sets kept (widest ${r.widest_set} files)`);
      for (const c of r.checks) console.log(`   ${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : `  -> ${c.detail}`}`);
      console.log(`   ${fails.length ? `${fails.length} FAIL` : "ALL PASS"}`);
    }
    const total = out.reduce((n, r) => n + r.checks.length, 0);
    const bad = out.reduce((n, r) => n + r.checks.filter((c) => !c.ok).length, 0);
    console.log(`\n${out.length} people, ${total - bad} PASS, ${bad} FAIL (temp: ${root})`);
  }
  if (ki < 0) { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* temp only */ } }
  process.exit(out.every((r) => r.checks.every((c) => c.ok)) ? 0 : 1);
}
