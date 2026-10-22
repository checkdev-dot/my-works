// Drives the invented people of scripts/onboarding-personas.mjs through R0 to R5 with the REAL scripts, on a temp copy of the data.
// The live data is never written: the temp copy is made from data/ and every script gets --data-dir.
// Run: node scripts/onboarding-sim.mjs [engineer|designer|all] [--keep <dir>] [--json]
// Exports runSteps / inProcess so the fixtures and the store test can run the same lists without the CLI.
import { actArgs } from "./onboarding-transport.mjs";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { PERSONAS, buildSteps, ratingActionsFor } from "./onboarding-personas.mjs";
import { applyOnboardingAction } from "../lib/onboarding-actions.mjs";
import { validate } from "../lib/validate.mjs";
import { listTree, readAll, PHRASE } from "../lib/onboarding-reset.mjs";
import { progress, blocking } from "../lib/onboarding.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = path.join(APP, "data");

/** An in-memory act(): applies one action to a clone of `box.state`, validates, commits. Returns { ok, message }. */
export function inProcess(box, { today = new Date().toLocaleDateString("en-CA") } = {}) {
  let nowMs = Date.now();
  return {
    act(action) {
      const clone = structuredClone(box.state);
      try {
        // Each call is a few minutes later, so the 8 hour fatigue rule is exercised for real.
        nowMs += 3 * 60000;
        applyOnboardingAction(action, clone, today, new Date(nowMs).toISOString());
      } catch (e) { return { ok: false, message: e.message }; }
      const v = validate(clone);
      if (v.errors.length) return { ok: false, message: `validator: ${v.errors[0]}` };
      box.state = clone;
      return { ok: true, message: "ok" };
    },
    read: () => box.state,
  };
}

/** Runs a step list through `io` ({ act, read }). Stops at the first refusal. Returns { log, ok }. */
export function runSteps(steps, io, { stopOnRefusal = true, personaCompetencies = [] } = {}) {
  const log = [];
  for (const step of steps) {
    const a = step.a;
    if (a.type === "decide_open") {
      const ob = io.read().onboarding;
      for (const c of blocking(ob.contradictions)) {
        const r = io.act({ type: "onboard.contradiction", id: c.id, between: c.between, status: "accepted_by_dev", resolved_by: "decided with him in chat" });
        log.push({ say: `Decide ${c.id}`, a: { type: "onboard.contradiction", id: c.id }, ...r });
        if (!r.ok && stopOnRefusal) return { log, ok: false };
      }
      continue;
    }
    if (a.type === "write_ratings") {
      // P1-6: the rating step is a list of onboard.rating actions (append only, each citing its answers), never a file edit.
      const st = io.read();
      const acts = ratingActionsFor(st.rubric.competencies, st.onboarding.answers);
      let all = true; let n = 0;
      for (const ra of acts) {
        const r = io.act(ra);
        log.push({ say: `Rate ${ra.competency}`, a: { type: "onboard.rating", id: ra.competency }, ...r });
        if (!r.ok) { all = false; if (stopOnRefusal) return { log, ok: false }; } else n += 1;
      }
      log.push({ say: step.say, a: { type: "write_ratings" }, ok: all, message: `${n} ratings appended` });
      continue;
    }
    const r = io.act(a);
    log.push({ say: step.say, tag: step.tag, a: { type: a.type, id: a.id, round: a.round }, ...r });
    if (!r.ok && stopOnRefusal) return { log, ok: false };
  }
  return { log, ok: true };
}

// ---- CLI -------------------------------------------------------------------------------------------------------------

function copyLive(to) {
  fs.mkdirSync(to, { recursive: true });
  for (const rel of listTree(LIVE)) {
    if (rel.startsWith(".")) continue;
    fs.mkdirSync(path.dirname(path.join(to, rel)), { recursive: true });
    fs.copyFileSync(path.join(LIVE, rel), path.join(to, rel));
  }
  return to;
}
const node = process.execPath;
function run(script, args) {
  try {
    const out = execFileSync(node, [path.join(APP, "scripts", script), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: String(e.stdout || "") + String(e.stderr || "") }; }
}
const lastJson = (t) => { try { return JSON.parse(String(t).trim().split(/\r?\n/).filter((l) => l.startsWith("{")).pop()); } catch { return {}; } };

export function simulate(key, dataDir) {
  const persona = PERSONAS[key];
  const out = { persona: key, label: persona.label, dataDir, steps: 0, refused: [] };
  const live0 = JSON.stringify(readAllHashes(LIVE));
  // reset: plan, then apply with the exact phrase (the temp copy only)
  const plan = run("onboarding-reset.mjs", ["plan", "--data-dir", dataDir]);
  const token = (/Token \(valid 15 minutes[^)]*\): (\S+)/.exec(plan.out) || [])[1];
  out.reset_plan = plan.out.split(/\r?\n/).filter((l) => /NOTE|PROBLEM|Backup folder|Archived|Blanked/.test(l)).slice(0, 6);
  const ap = run("onboarding-reset.mjs", ["apply", "--token", token || "x", "--phrase", PHRASE, "--data-dir", dataDir]);
  out.reset_apply = ap.out.trim().split(/\r?\n/).pop();
  if (ap.code !== 0) { out.error = "reset failed"; return out; }
  const { steps } = buildSteps(persona);
  const io = {
    act(action) {
      const r = run("onboarding-act.mjs", [...actArgs(action), "--data-dir", dataDir]);
      const j = lastJson(r.out);
      return { ok: r.code === 0 && j.ok !== false, message: j.message || r.out.slice(0, 200), progress: j.progress };
    },
    read: () => readAll(dataDir).d,
  };
  const res = runSteps(steps, io);
  out.steps = res.log.length;
  out.ok = res.ok;
  out.refused = res.log.filter((l) => !l.ok).map((l) => `${l.say}: ${l.message}`);
  out.log = res.log;
  const chk = run("onboarding-check.mjs", ["--data-dir", dataDir, "--json"]);
  try { const c = JSON.parse(chk.out); out.check = { verdict: c.verdict, fails: c.fails, warns: c.warns, readiness: c.readiness, adaptive: c.adaptive, must: `${c.must_answered} of ${c.must_total}`, status: c.status }; } catch { out.check = { raw: chk.out.slice(0, 300) }; }
  const { d } = readAll(dataDir);
  out.validate = validate(d).errors;
  out.final = {
    status: d.onboarding && d.onboarding.status, round: d.onboarding && d.onboarding.round,
    rubric: d.rubric && d.rubric.competencies.map((c) => c.id), rubric_generic: d.rubric && d.rubric.generic === true,
    gaps: ((d.library && d.library.gaps) || []).map((g) => `${g.id} ${g.competency}`),
    demands: ((d.demands && d.demands.items) || []).map((x) => x.id),
    unknowns_open: ((d.unknowns && d.unknowns.items) || []).filter((u) => u.status === "open").map((u) => `${u.id} ${u.question}`),
    contradictions: ((d.onboarding && d.onboarding.contradictions) || []).map((c) => `${c.id} ${c.status}`),
    risks: ((d.onboarding && d.onboarding.derived && d.onboarding.derived.risks) || []).map((r) => r.id),
    tasks_waiting: ((d.onboarding && d.onboarding.derived && d.onboarding.derived.tasks) || []).map((t) => `${t.id} ${t.minutes}m`),
    hours: d.onboarding && d.onboarding.derived && d.onboarding.derived.hours,
    constraints: d.profile && d.profile.constraints,
    salary: d.profile && { target: d.profile.north_star.salary_inr_per_month, floor: d.profile.constraints.salary_floor_inr, range: d.profile.baseline && d.profile.baseline.salary_range, currency: d.profile.situation && d.profile.situation.currency },
    plan_pending: d.onboarding && d.onboarding.plan_pending,
    research: ((d.research && d.research.items) || []).length,
    generated: Object.keys((d.onboarding && d.onboarding.generated_questions) || {}),
  };
  out.live_untouched = JSON.stringify(readAllHashes(LIVE)) === live0;
  return out;
}

function readAllHashes(dir) {
  const o = {};
  for (const rel of listTree(dir)) o[rel] = fs.statSync(path.join(dir, rel)).size + ":" + fs.statSync(path.join(dir, rel)).mtimeMs;
  return o;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const which = args.find((a) => !a.startsWith("--")) || "all";
  const ki = args.indexOf("--keep");
  const root = ki >= 0 ? path.resolve(args[ki + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), "growth-sim-"));
  const keys = which === "all" ? Object.keys(PERSONAS) : [which];
  const results = [];
  for (const k of keys) {
    if (!PERSONAS[k]) { console.error(`unknown persona ${k}`); process.exit(2); }
    const dir = copyLive(path.join(root, k));
    results.push(simulate(k, dir));
  }
  if (args.includes("--json")) console.log(JSON.stringify(results, null, 2));
  else for (const r of results) {
    console.log(`\n== ${r.persona}: ${r.label}`);
    console.log(`   data: ${r.dataDir}`);
    console.log(`   reset: ${r.reset_apply}`);
    console.log(`   steps ${r.steps}, ${r.ok ? "no refusal" : `STOPPED: ${r.refused[0]}`}`);
    if (r.check) console.log(`   check: ${r.check.verdict} (${r.check.status}, must ${r.check.must}, readiness ${r.check.readiness}); fails ${JSON.stringify(r.check.fails)}; warns ${(r.check.warns || []).length}`);
    console.log(`   validator errors: ${(r.validate || []).length}`);
    console.log(`   live data untouched: ${r.live_untouched}`);
  }
  process.exit(results.every((r) => r.ok && (r.validate || []).length === 0 && r.live_untouched) ? 0 : 1);
}
