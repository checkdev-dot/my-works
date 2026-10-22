// Applies onboarding actions to the data files with the SAME logic the app uses (lib/onboarding-actions.mjs):
// validation of the value, confidence from evidence, mirror to profile.intake, mapper patches, unknowns ledger, contradictions.
// It takes the lock, snapshots the files, runs the shared validator and writes nothing if that finds an error.
// Run: node scripts/onboarding-act.mjs --file actions.json [--data-dir D] [--dry-run]   (one action, or a list applied in order under one lock)
//      node scripts/onboarding-act.mjs --stdin < actions.json                           (from a pipe; PowerShell 5.1 turns non-ASCII into ?)
//      node scripts/onboarding-act.mjs '<action json>'    DEPRECATED: short payloads with no shell metacharacter only, else "use --file"
// Actions (lib/onboarding-actions.mjs is the reference):
//   onboard.answer {id, value, status?, evidence?, confirmed? + quote, echo?, meta?}    onboard.confirm {id, quote}
//   onboard.skip {id, consequence, reason?}      onboard.pause {reason?}
//   onboard.consent {round: R1..R4, answer: yes|no, quote}      (the one consent record: ask, record, then the questions)
//   onboard.round {round, summary? + confirmed + quote, generated?: [{id, competency, text, research}], skip_r3?, skip_r2?: {reason},
//                  new_sitting? + reason, complete? + plan_pending?: {reason, next_command}}
//   onboard.contradiction {id (full id C-0N:A~B), status, between?, resolved_by?}
//   onboard.research {items: [ResearchItem]}     onboard.rubric {competencies: [{id, name, levels{1..4}, research[]}], remap?, source?}
//   onboard.map {id: B-06, competency | null, quote | reason}     unknown.add {item}     unknown.resolve {id, answered_in | abandoned_reason}
//   onboard.reset {token, phrase, force_new?}   (token from onboarding-reset.mjs plan; the phrase must be the person's own typed message)
// A list of actions is applied in order under one lock; the first refusal stops the list and nothing is written.
// Prints one JSON line: { ok, touched, message, notes?, progress }. Exit 1 when refused.
// One call at a time: the script takes data/.lock EXCLUSIVELY before it reads and holds it until the write is done. A second
// call that meets the lock waits up to 5 seconds and then says "busy" (ok:false), so a "Saved" is never a lost update.
// A lock left by a killed run (its pid is gone, or it is older than 2 minutes) is cleared with a NOTE; onboard.pause does the same.
import "./_no-people.mjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FILES, OPTIONAL_FILES, validate } from "../lib/validate.mjs";
import { applyOnboardingAction, ONBOARDING_ACTIONS, forgetRound3 } from "../lib/onboarding-actions.mjs";
import { applyReset, backupRoot } from "../lib/onboarding-reset.mjs";
import { progress } from "../lib/onboarding.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const dataDir = path.resolve(flag("--data-dir") || path.join(APP, "data"));
const dry = args.includes("--dry-run");
const OWN = "Claude (onboarding-act)";
const lockPath = path.join(dataDir, ".lock");
const clearDir = `${lockPath}.clearing`;
const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let held = false;
const notes = [];
const release = () => {
  if (!held) return;
  held = false;
  try { const l = JSON.parse(fs.readFileSync(lockPath, "utf8")); if (l && l.token === token) fs.rmSync(lockPath, { force: true }); } catch { /* already gone */ }
};
process.on("exit", release);
// process.exit skips finally blocks, so every exit goes through here and gives the lock back first.
// The line is written synchronously (a pipe is async in Node and process.exit can cut an unflushed line: one of eight parallel
// callers once printed nothing).
const done = (o, code = 0) => {
  release();
  const line = `${JSON.stringify(notes.length ? { ...o, notes: [...notes, ...(o.notes || [])] } : o)}\n`;
  try { fs.writeSync(1, line); } catch { console.log(line.trim()); }
  process.exit(code);
};

// Transport (P1-1). Never put his words on a command line: --file <path> is the one documented form, --stdin works from a pipe.
// The inline form still runs for short payloads with no shell metacharacter, with a deprecation NOTE; anything else is refused.
const INLINE_MAX = 2000;
const SHELL_META = /[`$|;&<>\\\r\n]/;
const stripBom = (t) => String(t).replace(/^﻿/, "");
let raw;
const f = flag("--file");
let inline = false;
if (f) {
  try { raw = stripBom(fs.readFileSync(f, "utf8")); } catch (e) { done({ ok: false, message: `Cannot read ${f} (${e.message}). Write the JSON with the Write tool to a file and pass --file <path>. Nothing was changed.` }, 2); }
} else if (args.includes("--stdin")) {
  try { raw = stripBom(fs.readFileSync(0, "utf8")); } catch { raw = ""; }
} else {
  raw = args.find((a, i) => !a.startsWith("--") && !["--data-dir", "--file"].includes(args[i - 1]));
  inline = raw !== undefined;
}
if (!raw) done({ ok: false, message: "Give an action: write the JSON to a file and pass --file <path> (or --stdin). Nothing was changed." }, 2);
if (inline) {
  if (raw.length > INLINE_MAX) done({ ok: false, refusal: "use_file", message: `Use --file: an inline action of ${raw.length} characters is over the ${INLINE_MAX} limit and may be cut by the shell. Write the JSON with the Write tool to a file and run onboarding-act.mjs --file <path>. Nothing was changed.` }, 2);
  if (SHELL_META.test(raw)) done({ ok: false, refusal: "use_file", message: "Use --file: the inline action holds a character the shell can interpret (a backtick, $, |, ;, &, < or >, a backslash or a line break). Write the JSON with the Write tool to a file and run onboarding-act.mjs --file <path>. Nothing was changed." }, 2);
  notes.push("NOTE: the inline JSON form is deprecated. Write the action to a file and use --file <path>; it is the only form that is safe for his words.");
}
let actions;
try { const j = JSON.parse(raw); actions = Array.isArray(j) ? j : [j]; } catch (e) { done({ ok: false, message: `That is not valid JSON (${e.message}). You probably used the inline form: write the JSON to a file and send it with --file <path>. Nothing was changed.` }, 2); }

const ALL = [...FILES, ...OPTIONAL_FILES];

/** Sets this script wrote (they carry _what.json by us). The app's and the reset's full sets are never touched here. */
function interviewSets() {
  const root = path.join(backupRoot(dataDir), "_sets");
  let names = [];
  try { names = fs.readdirSync(root).sort(); } catch { return []; }
  return names.filter((n) => { try { return JSON.parse(fs.readFileSync(path.join(root, n, "_what.json"), "utf8")).by === OWN; } catch { return false; } }).map((n) => path.join(root, n));
}
/** Drops the oldest interview sets. Only older sets go: a kept set looks FORWARD for the files it does not hold, so it stays whole. */
function pruneInterviewSets(keep) {
  const all = interviewSets();
  const drop = all.slice(0, Math.max(0, all.length - keep));
  for (const d of drop) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* left for next time */ } }
  return drop.length;
}
/** Removes Round 3 from every snapshot there is: the interview sets, the app's sets, the per file histories, the skill's undo folder. */
function scrubSnapshots() {
  let changed = 0;
  const roots = [path.join(backupRoot(dataDir), "_sets")];
  const dirs = [];
  for (const r of roots) { try { for (const n of fs.readdirSync(r)) dirs.push(path.join(r, n)); } catch { /* none */ } }
  const un = path.join(APP, "..", "companion", ".undo");
  if (dataDir === path.join(APP, "data")) { try { for (const n of fs.readdirSync(un)) dirs.push(path.join(un, n)); } catch { /* none */ } }
  for (const d of dirs) {
    const state = {}; const present = [];
    for (const n of ALL) { const p = path.join(d, `${n}.json`); if (fs.existsSync(p)) { try { state[n] = JSON.parse(fs.readFileSync(p, "utf8")); present.push(n); } catch { /* not json */ } } }
    if (!present.length) continue;
    for (const n of forgetRound3(state)) { if (present.includes(n)) { fs.writeFileSync(path.join(d, `${n}.json`), `${JSON.stringify(state[n], null, 2)}\n`); changed += 1; } }
  }
  // per file histories the app keeps: <backups>/<file>/<stamp>.json holds one file each
  for (const n of ["onboarding", "profile", "demands", "proof", "unknowns"]) {
    const dir = path.join(backupRoot(dataDir), n);
    let names = [];
    try { names = fs.readdirSync(dir).filter((x) => x.endsWith(".json")); } catch { continue; }
    for (const x of names) {
      try {
        const p = path.join(dir, x);
        const state = { [n]: JSON.parse(fs.readFileSync(p, "utf8")) };
        if (forgetRound3(state).has(n)) { fs.writeFileSync(p, `${JSON.stringify(state[n], null, 2)}\n`); changed += 1; }
      } catch { /* not json */ }
    }
  }
  return changed;
}
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e && e.code === "EPERM"; } };
const readLockFile = () => { try { return JSON.parse(fs.readFileSync(lockPath, "utf8")); } catch { return null; } };
const ageMs = (l) => { const t = new Date(l && l.started); return Number.isNaN(t.getTime()) ? Infinity : Date.now() - t.getTime(); };
/** Why a lock is stale, or "" when it is a live, fresh one. Our own lock: its pid is gone or it is over 2 minutes old (an act takes well under one). Another writer's lock: 30 minutes, as the app reads it. */
const staleWhy = (l) => {
  if (!l) return "";
  if (typeof l.pid === "number" && !alive(l.pid)) return `its owner (process ${l.pid}) is no longer running`;
  if (l.by === OWN) return ageMs(l) > 2 * 60000 ? "it is over 2 minutes old and one onboarding-act call never takes that long" : "";
  return ageMs(l) > 30 * 60000 ? "it is over 30 minutes old" : "";
};
/** Removes a stale lock without ever removing a lock somebody else has just taken: the check and the removal happen under a short mutex. */
const clearStale = (seen) => {
  try { fs.mkdirSync(clearDir); } catch (e) {
    try { if (Date.now() - fs.statSync(clearDir).mtimeMs > 10000) fs.rmSync(clearDir, { recursive: true, force: true }); } catch { /* gone */ }
    return false;
  }
  try {
    const now = readLockFile();
    if (now && now.started === seen.started && now.pid === seen.pid && now.token === seen.token) { fs.rmSync(lockPath, { force: true }); return true; }
    return false;
  } finally { try { fs.rmSync(clearDir, { recursive: true, force: true }); } catch { /* temp */ } }
};
/** Takes data/.lock exclusively (flag wx), retrying with backoff for up to 5 seconds. Returns null on success or the lock that is in the way. */
const acquire = () => {
  fs.mkdirSync(dataDir, { recursive: true });
  const until = Date.now() + 5000;
  let wait = 20;
  for (;;) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      try { fs.writeSync(fd, JSON.stringify({ by: OWN, started: new Date().toISOString(), pid: process.pid, token })); } finally { fs.closeSync(fd); }
      held = true;
      return null;
    } catch (e) { if (!e || e.code !== "EEXIST") throw e; }
    const l = readLockFile();
    let why = staleWhy(l);
    // A lock file with no readable content is a writer in the middle of creating it: only an old one is stale.
    if (!l) { try { why = Date.now() - fs.statSync(lockPath).mtimeMs > 5000 ? "it holds no readable owner and is more than 5 seconds old" : ""; } catch { why = "gone"; } }
    if (why === "gone") continue;
    if (why) {
      if (l && clearStale(l)) notes.push(`NOTE: cleared a stale lock (${l.by || "unknown"}, started ${l.started}): ${why}.`);
      else if (!l) { try { fs.rmSync(lockPath, { force: true }); notes.push(`NOTE: cleared an empty stale lock: ${why}.`); } catch { /* retry */ } }
      continue;
    }
    if (Date.now() > until) return l || { by: "another writer", started: "just now" };
    sleep(wait + Math.floor(Math.random() * wait));
    wait = Math.min(250, wait * 2);
  }
};

if (actions.some((a) => a && a.type === "onboard.reset")) {
  if (actions.length !== 1) done({ ok: false, message: "onboard.reset goes alone." }, 2);
  const a = actions[0];
  // A stale lock of ours must not block the erase plan check; a live one still does.
  { const l = readLockFile(); if (l && staleWhy(l)) { try { fs.rmSync(lockPath, { force: true }); } catch { /* the reset reports it */ } } }
  const r = applyReset({ dataDir, token: String(a.token || ""), phrase: String(a.phrase || ""), forceNew: a.force_new === true, differentPerson: a.different_person === true, samePerson: a.same_person === true });
  done({ ok: r.ok, message: r.message, backup: r.backup }, r.ok ? 0 : 1);
}

const bad = actions.find((a) => !a || !ONBOARDING_ACTIONS.includes(a.type));
if (bad) done({ ok: false, message: `${bad && bad.type} is not an onboarding action. Allowed: ${ONBOARDING_ACTIONS.join(", ")}, onboard.reset.` }, 2);

// The lock comes BEFORE the read. A dry run only reads, so it takes none.
if (!dry) {
  const busy = acquire();
  if (busy) done({ ok: false, busy: true, message: `${busy.by || "Claude"} is updating your data right now (since ${busy.started}). I waited 5 seconds. Nothing was changed; send this again in a moment, and send onboarding actions one call at a time.` }, 1);
}

const s = {};
for (const n of ALL) {
  const p = path.join(dataDir, `${n}.json`);
  if (!fs.existsSync(p)) { if (FILES.includes(n)) done({ ok: false, message: `${n}.json is missing. Nothing was changed.` }, 1); continue; }
  try { s[n] = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { done({ ok: false, message: `${n}.json is not valid JSON (${e.message}). Say fix my growth data. Nothing was changed.` }, 1); }
}
const before = validate(s);
if (before.errors.length) done({ ok: false, message: `The data has errors already (${before.errors[0]}). Say fix my growth data. Nothing was changed.` }, 1);

const touched = new Set();
const actionNotes = [];
const actionResults = [];
try {
  for (const a of actions) { const ts = applyOnboardingAction(a, s); for (const t of ts) touched.add(t); if (ts.notes) actionNotes.push(...ts.notes); if (ts.result) actionResults.push(ts.result); }
} catch (e) { done({ ok: false, message: e.message }, 1); }
const after = validate(s);
if (after.errors.length) done({ ok: false, message: `That would leave your data in a bad state (${after.errors[0]}). Nothing was changed.` }, 1);

const pr = progress(s.onboarding, (s.unknowns && s.unknowns.items) || []);
const summary = { status: pr.status, round: pr.round, sitting: s.onboarding && s.onboarding.sitting, must: `${pr.must_answered} of ${pr.must_total}`, unknown: pr.unknown, ready_to_plan: pr.ready_to_plan, readiness: pr.readiness, adaptive: pr.adaptive, unmapped: pr.unmapped, next_ids: pr.next_ids, open_contradictions: ((s.onboarding && s.onboarding.contradictions) || []).filter((c) => c.status === "open").map((c) => c.id) };
if (dry) done({ ok: true, dry_run: true, touched: [...touched], message: "Dry run: nothing written.", progress: summary });

try {
  // The snapshot is of the files this action is about to change (their state BEFORE it), nothing else: an interview of 100 acts
  // used to leave 110 sets of every file (12 MB) in a synced folder. The app's undo reads a partial set by looking forward for the
  // files it does not hold (see restoreSet in lib/store.ts). Backups go to GROWTH_BACKUP_DIR when it is set.
  try {
    const dir = path.join(backupRoot(dataDir), "_sets", new Date().toISOString().replace(/[:.]/g, "-"));
    fs.mkdirSync(dir, { recursive: true });
    const held = [];
    for (const n of touched) { const p = path.join(dataDir, `${n}.json`); if (fs.existsSync(p)) { fs.copyFileSync(p, path.join(dir, `${n}.json`)); held.push(n); } }
    fs.writeFileSync(path.join(dir, "_what.json"), JSON.stringify({ by: OWN, partial: true, files: held, actions: actions.map((a) => a.type + (a.id ? ` ${a.id}` : "")) }));
  } catch { /* the check above is the real guard */ }
  // The skill's UNDO folder (companion/.undo) when this is the live data, so "undo that" finds this moment too.
  if (dataDir === path.join(APP, "data")) {
    try {
      const un = path.join(APP, "..", "companion", ".undo");
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
      const dir = path.join(un, stamp);
      fs.mkdirSync(dir, { recursive: true });
      for (const n of touched) { const p = path.join(dataDir, `${n}.json`); if (fs.existsSync(p)) fs.copyFileSync(p, path.join(dir, `${n}.json`)); }
      fs.writeFileSync(path.join(dir, "_what.txt"), `onboarding-act: ${actions.map((a) => a.type + (a.id ? " " + a.id : a.round ? " " + a.round : "")).join(", ")}
`);
      const all = fs.readdirSync(un).filter((x) => /^\d{8}-\d{6}$/.test(x)).sort();
      for (const old of all.slice(0, Math.max(0, all.length - 20))) fs.rmSync(path.join(un, old), { recursive: true, force: true });
    } catch { /* the _sets snapshot above still exists */ }
  }
  for (const n of touched) {
    const p = path.join(dataDir, `${n}.json`);
    fs.writeFileSync(`${p}.tmp`, `${JSON.stringify(s[n], null, 2)}\n`);
    fs.renameSync(`${p}.tmp`, p);
  }
  // "forget R3" must not leave the answers behind in the copies: scrub them from every snapshot too.
  if (actions.some((a) => a.type === "onboard.forget")) { const n = scrubSnapshots(); if (n) actionNotes.push(`Removed Round 3 from ${n} earlier snapshot file${n === 1 ? "" : "s"}.`); }
  // After the interview is complete the per action snapshots are no longer needed: keep the newest few, drop the rest.
  if (s.onboarding && s.onboarding.status === "complete") { const n = pruneInterviewSets(3); if (n) actionNotes.push(`Pruned ${n} interview snapshot set${n === 1 ? "" : "s"} (kept the newest 3).`); }
} finally {
  release();
}
done({ ok: true, touched: [...touched], message: touched.size ? `Saved ${[...touched].map((n) => `${n}.json`).join(", ")}.` : `Already saved. Nothing changed.`, ...(actionNotes.length ? { notes: actionNotes } : {}), ...(actionResults.length ? { result: actionResults.length === 1 ? actionResults[0] : actionResults } : {}), progress: summary });
