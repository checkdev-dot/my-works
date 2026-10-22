// Drives the app's REAL act() and readState() (lib/store.ts) against TEMP COPIES of data/. Never touches live data.
// store.ts is TypeScript with a parameter property, which Node's strip-only mode refuses, so it is compiled first with the
// project's own typescript to a temp folder: this is the existing mechanism, now a script (`npm run test:store`).
// Run: node scripts/onboarding-store-test.mjs        Exit 1 on any FAIL.
import { actArgs } from "./onboarding-transport.mjs";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import { PERSONAS, buildSteps, ratingActionsFor } from "./onboarding-personas.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "growth-store-"));
const OUT = path.join(ROOT, "build");
const results = [];
const ok = (n, c, d = "") => results.push([c ? "PASS" : "FAIL", n, c ? "" : String(d)]);

// ---- compile store.ts (and what it imports) once ------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
const tsconfig = path.join(ROOT, "tsconfig.store.json");
fs.writeFileSync(tsconfig, JSON.stringify({ compilerOptions: { outDir: OUT, rootDir: `${APP}/lib`, module: "esnext", target: "es2022", moduleResolution: "bundler", skipLibCheck: true, strict: false, noEmit: false, types: ["node"], typeRoots: [`${APP}/node_modules/@types`] }, files: [`${APP}/lib/store.ts`] }));
try {
  const tsc = path.join(APP, "node_modules", "typescript", "bin", "tsc");
  execFileSync(process.execPath, [tsc, "-p", tsconfig], { cwd: APP, stdio: "pipe" });
} catch (e) { console.log(String(e.stdout || e)); process.exit(1); }
for (const f of fs.readdirSync(`${APP}/lib`)) if (/\.(mjs|json)$/.test(f)) fs.copyFileSync(`${APP}/lib/${f}`, path.join(OUT, f));
fs.writeFileSync(path.join(OUT, "package.json"), '{"type":"module"}');
for (const f of fs.readdirSync(OUT).filter((x) => x.endsWith(".js"))) {
  const t = fs.readFileSync(path.join(OUT, f), "utf8").replace(/from "(\.\/[a-z-]+)"/g, 'from "$1.js"');
  fs.writeFileSync(path.join(OUT, f), t);
}
const liveBefore = JSON.stringify(fs.readdirSync(`${APP}/data`).filter((f) => f.endsWith(".json")).map((f) => [f, fs.statSync(`${APP}/data/${f}`).size, fs.statSync(`${APP}/data/${f}`).mtimeMs]));
const resetMod = await import(pathToFileURL(path.join(OUT, "onboarding-reset.mjs")).href);
const bank = await import(pathToFileURL(path.join(OUT, "onboarding-bank.mjs")).href);
const { planReset, PHRASE } = resetMod;

let runNo = 0;
/** A fresh copy of the live data and a fresh instance of the store that reads it (DATA is fixed at import time). */
async function freshStore() {
  runNo += 1;
  const run = path.join(ROOT, `run${runNo}`);
  fs.mkdirSync(path.join(run, "data"), { recursive: true });
  for (const f of fs.readdirSync(`${APP}/data`)) { const p = `${APP}/data/${f}`; if (fs.statSync(p).isFile()) fs.copyFileSync(p, path.join(run, "data", f)); }
  process.chdir(run);
  const store = await import(`${pathToFileURL(path.join(OUT, "store.js")).href}?run=${runNo}`);
  return { store, dataDir: path.join(run, "data"), rd: (f) => JSON.parse(fs.readFileSync(path.join(run, "data", `${f}.json`), "utf8")) };
}
const refuses = async (store, n, a, re) => { try { await store.act(a); ok(n, false, "did not throw"); } catch (e) { ok(n, re.test(e.message), e.message); } };
/** Sends an answer; when the sitting is full, opens the next one the way the skill says (he asked to carry on tonight). */
const answerSafe = async (store, a) => {
  try { return await store.act(a); } catch (e) {
    if (!/sitting is full/.test(e.message)) throw e;
    const s = await store.readState();
    await store.act({ type: "onboard.round", round: s.onboarding.round, new_sitting: true, reason_tag: "he_asked_to_continue" });
    return store.act(a);
  }
};
const resetThroughAct = async (ctx) => {
  process.env.GROWTH_RESET_FROM_CLAUDE_CODE = "1";
  const plan = planReset(ctx.dataDir);
  await ctx.store.act({ type: "onboard.reset", token: plan.token, phrase: PHRASE });
  delete process.env.GROWTH_RESET_FROM_CLAUDE_CODE;
};

// ---- A. guards and edge cases through act() -----------------------------------------------------------------
{
  const ctx = await freshStore();
  const { store } = ctx;
  await refuses(store, "answer before start is refused", { type: "onboard.answer", id: "R0-01", value: "40" }, /has not started/);
  await refuses(store, "reset over the app (no Claude Code flag) is refused whatever the token", { type: "onboard.reset", token: "nope", phrase: PHRASE }, /from Claude Code/);
  process.env.GROWTH_RESET_FROM_CLAUDE_CODE = "1";
  await refuses(store, "reset without a valid token is refused", { type: "onboard.reset", token: "nope", phrase: PHRASE }, /token/);
  const plan = planReset(ctx.dataDir);
  await refuses(store, "reset with a wrong phrase is refused", { type: "onboard.reset", token: plan.token, phrase: "yes" }, /not the phrase/);
  await store.act({ type: "onboard.reset", token: plan.token, phrase: PHRASE });
  delete process.env.GROWTH_RESET_FROM_CLAUDE_CODE;
  let s = await store.readState();
  ok("reset through act: onboarding in progress, profile blank, rubric generic, placeholder ratings", s.onboarding.status === "in_progress" && s.profile.role_now === "" && s.week.tasks.length === 0 && s.rubric.generic === true && Object.values(s.skills.ratings).every((r) => r.placeholder === true));
  await store.act({ type: "onboard.answer", id: "R0-01", value: "40" });
  s = await store.readState();
  ok("R0-01 saved: budget and a derived sitting size of 6", s.onboarding.sitting.budget_min === 40 && s.onboarding.sitting.max === 6);
  await refuses(store, "moving to R1 before R0 is done is refused", { type: "onboard.round", round: "R1" }, /R0 is not finished/);
  await refuses(store, "R1 consent: the answer must be yes (not yet is not consent)", { type: "onboard.round", round: "R1" }, /R0 is not finished|ground rules/);
  for (const [id, v] of Object.entries(PERSONAS.engineer.r0)) await answerSafe(store, { type: "onboard.answer", id, value: v });
  await store.act({ type: "onboard.round", round: "R1" });
  s = await store.readState();
  ok("round moved to R1 with a new sitting", s.onboarding.round === "R1" && s.onboarding.sitting.asked === 0 && s.onboarding.consent.R0);
  await store.act({ type: "onboard.answer", id: "B-01", value: "Senior backend engineer" });
  const before = JSON.stringify(await store.readState());
  await store.act({ type: "onboard.answer", id: "B-01", value: "Senior backend engineer" });
  ok("same value again is a no-op", JSON.stringify(await store.readState()) === before);
  await refuses(store, "a bad number is refused with the rule", { type: "onboard.answer", id: "B-07", value: "abc" }, /needs a number/);
  await refuses(store, "a question from a later round is refused", { type: "onboard.answer", id: "I-01", value: "2" }, /belongs to R2/);
  await refuses(store, "a Round 3 answer before consent is refused", { type: "onboard.answer", id: "R3-01", value: "Writing my case study" }, /belongs to R3/);
  await store.act({ type: "onboard.answer", id: "B-07", value: null, status: "unknown" });
  s = await store.readState();
  ok("B-07 unknown creates an unknowns row with a draft task", s.unknowns.items.some((u) => u.question === "B-07" && u.status === "open" && u.draft_task));
  await store.act({ type: "onboard.answer", id: "B-07", value: 78000 });
  s = await store.readState();
  ok("answering it later closes the unknown, and a yearly answer is stored per month", s.unknowns.items.find((u) => u.question === "B-07").status === "answered" && s.profile.baseline.salary_now_inr === 6500);
  await refuses(store, "research without a subject is refused with the rule", { type: "onboard.research", items: [{ claim: "x", supports: "requirement", source_url: "https://a.b/c", source_name: "A", tier: 3 }] }, /subject needs/);
  await store.act({ type: "onboard.research", items: PERSONAS.engineer.research });
  s = await store.readState();
  ok("onboard.research through act: items stored with their hash and valid", s.research.items.length === PERSONAS.engineer.research.length && s.research.items.every((x) => x.excerpt_sha));
  await refuses(store, "a rubric that cites no research is refused", { type: "onboard.rubric", competencies: PERSONAS.engineer.rubric.competencies.map((c) => ({ ...c, research: [] })) }, /cite at least one research id/);
  await store.act({ type: "onboard.rubric", competencies: PERSONAS.engineer.rubric.competencies.map((c) => ({ ...c, group: "skill" })), levels: PERSONAS.engineer.rubric.levels, source: "test" });
  s = await store.readState();
  ok("onboard.rubric through act: the researched rubric is live, ratings are placeholders for it", s.rubric.generic === undefined && s.rubric.competencies.length === 5 && Object.keys(s.skills.ratings).length === 5);
  await store.act({ type: "onboard.pause" });
  await refuses(store, "answering while paused is refused", { type: "onboard.answer", id: "B-09", value: "To feel safe enough to take a risk" }, /paused/);
  await store.act({ type: "onboard.round", round: "R1" });
  s = await store.readState();
  ok("resume starts a new sitting", s.onboarding.status === "in_progress" && s.onboarding.sitting.asked === 0 && s.onboarding.sitting.n >= 2);
  // the sitting cap
  let blocked = null;
  for (const id of ["B-01", "B-04", "B-05", "B-09", "B-11", "B-13", "B-14", "B-16"]) {
    try {
      const q = bank.BANK.find((x) => x.id === id);
      const v = q.validate.kind === "mcq" ? q.options[0] : q.validate.kind === "date" ? "2027-01-01" : "A plain answer that is long enough";
      await store.act({ type: "onboard.answer", id, value: id === "B-01" ? "Senior backend engineer 2" : v });
    } catch (e) { blocked = e.message; break; }
  }
  ok("an answer past the sitting size is refused", /sitting is full/.test(blocked || ""), blocked);
}

// ---- B. both people, all of R0 to R5, through the app's act() ----------------------------------------------------------
for (const [key, P] of Object.entries(PERSONAS)) {
  const ctx = await freshStore();
  const { store } = ctx;
  await resetThroughAct(ctx);
  const { steps } = buildSteps(P);
  let refused = null;
  for (const st of steps) {
    const a = st.a;
    try {
      if (a.type === "decide_open") {
        const s = await store.readState();
        for (const c of s.onboarding.contradictions.filter((x) => x.status === "open" && x.severity !== "note")) await store.act({ type: "onboard.contradiction", id: c.id, between: c.between, status: "accepted_by_dev", resolved_by: "decided with him in chat" });
      } else if (a.type === "write_ratings") {
        // P1-6: rating is an action through act(), appended to the history, no file edit
        const s = await store.readState();
        for (const ra of ratingActionsFor(s.rubric.competencies, s.onboarding.answers)) await store.act(ra);
      } else await store.act(a);
    } catch (e) { refused = `${st.say}: ${e.message}`; break; }
  }
  ok(`${key}: ${steps.length} actions from R0 to complete through act() with no refusal`, refused === null, refused);
  let s = null; let loadErr = "";
  try { s = await store.readState(); } catch (e) { loadErr = e.message; }
  ok(`${key}: readState loads the final state (the app would render it)`, !!s, loadErr);
  if (s) {
    ok(`${key}: complete, researched rubric, adaptive batch registered with research, plan_pending recorded`, s.onboarding.status === "complete" && s.rubric.generic === undefined && Object.keys(s.onboarding.generated_questions).length >= 3 && s.onboarding.plan_pending.next_command === "plan my four weeks");
    ok(`${key}: gaps and demands were written with their sources at the hand-off`, s.library.gaps.length >= 2 && s.library.gaps.every((g) => g.because || g.evenings_basis) && s.demands.items.some((d) => d.id === "D-floor" && d.hard === true) && !s.demands.items.find((d) => d.id === "D-salary").hard);
    ok(`${key}: R3 answers private, none in intake`, Object.entries(s.onboarding.answers).filter(([id]) => /^R3-/.test(id)).every(([, a]) => a.private === true) && !s.profile.intake.some((x) => /^R3-/.test(x.id)));
    ok(`${key}: money is stored per month in the person's currency`, s.profile.situation.currency === P.r0["R0-06"].toUpperCase() && s.profile.constraints.salary_floor_inr === Math.round(P.r1.find((x) => x[0] === "B-10")[1] / (P.r0["R0-07"] === "per year" ? 12 : 1)));
    await refuses(store, `${key}: answering after complete is refused`, { type: "onboard.answer", id: "B-09", value: "x long enough answer" }, /complete/);
    // redo round 1 after complete
    await store.act({ type: "onboard.round", round: "R1" });
    const s2 = await store.readState();
    ok(`${key}: redo round 1 reopens it, supersedes the answers and keeps their values`, s2.onboarding.status === "in_progress" && s2.onboarding.round === "R1" && s2.onboarding.answers["B-04"].status === "superseded" && s2.onboarding.answers["B-04"].value);
    await store.act({ type: "onboard.answer", id: "B-04", value: "Staff Machine Learning Engineer" });
    const s3 = await store.readState();
    ok(`${key}: redo keeps the old value in history and updates the role`, s3.onboarding.answers["B-04"].history && s3.onboarding.answers["B-04"].history.length >= 1 && s3.profile.north_star.role === "Staff Machine Learning Engineer");
    // the CLI check script on this folder, through the real script
    let chk;
    try { chk = JSON.parse(execFileSync(process.execPath, [path.join(APP, "scripts", "onboarding-check.mjs"), "--data-dir", ctx.dataDir, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })); } catch (e) { chk = JSON.parse(String(e.stdout || "{}")); }
    ok(`${key}: the check script gives no FAIL after a redo (WARN lists the reasons)`, chk.verdict !== "FAIL", JSON.stringify(chk.fails));
  }
}

// ---- B2. the app's act() and the script share one lock: no lost write (P2) -----------------------------------------------
{
  const ctx = await freshStore();
  const { store } = ctx;
  await resetThroughAct(ctx);
  const lockFile = path.join(ctx.dataDir, ".lock");
  // two acts started together, both changing onboarding.json: before the lock the second read the state the first had not written yet
  await Promise.all([
    store.act({ type: "onboard.answer", id: "R0-02", value: "straight" }),
    store.act({ type: "onboard.answer", id: "R0-03", value: ["none"] }),
    store.act({ type: "onboard.answer", id: "R0-06", value: "usd" }),
  ]);
  const ob = ctx.rd("onboarding");
  ok("lock: three app acts started together are all on disk (no lost write)", ob.answers["R0-02"] && ob.answers["R0-03"] && ob.answers["R0-06"], JSON.stringify(Object.keys(ob.answers)));
  ok("lock: the lock is released after the acts (and a refused act releases it too)", !fs.existsSync(lockFile));
  // while an act is in flight the lock exists, in the script's own format, so the script cannot slip in between the read and the write
  {
    let fin = false; let seen = null;
    const p = store.act({ type: "onboard.answer", id: "R0-01", value: "40" }).finally(() => { fin = true; });
    while (!fin) {
      try { const l = JSON.parse(fs.readFileSync(lockFile, "utf8")); if (l && l.by) seen = l; } catch { /* not there yet */ }
      await new Promise((r) => setImmediate(r));
    }
    await p;
    ok("lock: while the app's act is in flight data/.lock exists with by, started, pid and token (the script's format)", seen && seen.by === "Growth app" && typeof seen.started === "string" && seen.pid === process.pid && typeof seen.token === "string", JSON.stringify(seen));
  }
  await refuses(store, "lock: a refused act under the lock still releases it", { type: "onboard.answer", id: "R0-02", value: "whatever" }, /must be one of/);
  ok("lock: no lock file left after a refusal", !fs.existsSync(lockFile));
  // the script and the app together: the script is started, the app acts while it holds the lock or after, neither loses its write
  const { execFile } = await import("child_process");
  const cli = (action) => new Promise((resolve) => execFile(process.execPath, [path.join(APP, "scripts", "onboarding-act.mjs"), ...actArgs(action), "--data-dir", ctx.dataDir], { encoding: "utf8" }, (e, out) => resolve(String(out || "").trim().split(/\r?\n/).pop())));
  const [fromCli, fromApp] = await Promise.all([cli({ type: "onboard.answer", id: "R0-08", value: "Germany" }), store.act({ type: "onboard.answer", id: "R0-07", value: "per month" })]);
  const ob2 = ctx.rd("onboarding");
  ok("lock: an act from the script and an act from the app together both persist", JSON.parse(fromCli).ok === true && ob2.answers["R0-08"] && ob2.answers["R0-07"], fromCli);
  // a live lock of another writer refuses the app, a lock of a dead process is cleared
  fs.writeFileSync(lockFile, JSON.stringify({ by: "Claude (onboarding-act)", started: new Date().toISOString(), pid: process.pid, token: "x" }));
  await refuses(store, "lock: a live lock of another writer refuses the app's act (nothing changed)", { type: "onboard.answer", id: "R0-09", value: "backend engineering" }, /updating your data/);
  fs.writeFileSync(lockFile, JSON.stringify({ by: "Claude (onboarding-act)", started: new Date().toISOString(), pid: 999999, token: "dead" }));
  await store.act({ type: "onboard.answer", id: "R0-09", value: "backend engineering" });
  ok("lock: a lock whose process is gone is cleared and the act goes through", ctx.rd("onboarding").answers["R0-09"] && !fs.existsSync(lockFile));
}

// ---- B3. the app's undo reads a partial snapshot set (P2) ----------------------------------------------------------------
{
  const ctx = await freshStore();
  const { store } = ctx;
  await resetThroughAct(ctx);
  const before = JSON.parse(JSON.stringify(ctx.rd("onboarding")));
  // a set the way the onboarding script writes it: only the file about to change, and a _what.json saying so
  const sets = path.join(ctx.dataDir, ".backups", "_sets");
  const set = path.join(sets, "2999-01-01T00-00-00-000Z");
  fs.mkdirSync(set, { recursive: true });
  fs.writeFileSync(path.join(set, "onboarding.json"), JSON.stringify(before));
  fs.writeFileSync(path.join(set, "_what.json"), JSON.stringify({ by: "Claude (onboarding-act)", partial: true, files: ["onboarding"] }));
  await store.act({ type: "onboard.answer", id: "R0-02", value: "straight" });
  const t = await store.restoreSet();
  const after = ctx.rd("onboarding");
  ok("undo: restoreSet reads a partial set (the touched file from it, every other file as it is) and puts the earlier onboarding back", t === "2999-01-01T00-00-00-000Z" && !after.answers["R0-02"] && JSON.stringify(after.answers) === JSON.stringify(before.answers), String(t));
}

// ---- C. nothing outside the temp folders changed ------------------------------------------------------------------------
{
  const liveAfter = JSON.stringify(fs.readdirSync(`${APP}/data`).filter((f) => f.endsWith(".json")).map((f) => [f, fs.statSync(`${APP}/data/${f}`).size, fs.statSync(`${APP}/data/${f}`).mtimeMs]));
  ok("live data: untouched", liveAfter === liveBefore);
}

process.chdir(APP);
const w = Math.max(...results.map((r) => r[1].length));
for (const [st, n, d] of results) console.log(`${st.padEnd(5)} ${n.padEnd(w)} ${d}`);
const fails = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - fails} PASS, ${fails} FAIL`);
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* temp only */ }
process.exit(fails ? 1 : 0);
