// Applies CV and case study actions to data/career.json with the SAME logic the app uses (lib/career.mjs): shape rules, the honesty
// check (quotes word for word, numbers in a quote, deny-list), the html render. Takes the lock, snapshots the file first, writes
// nothing if anything is refused. cv/drafts/<name>.html is rewritten (the old one is kept in cv/drafts/_history).
// Run: node scripts/cv-act.mjs --file actions.json [--data-dir D] [--dossier P] [--denylist P] [--dry-run]   (one action or a list, in order, under one lock)
//      node scripts/cv-act.mjs --stdin < actions.json
// Actions (lib/career.mjs is the reference):
//   cv.version.add {version: {why, header, sections, base?, target?, id?}, make_current?}   the new version becomes current unless make_current is false (tailored ones too)
//   cv.section.set {version?, section: {id, kind, title, items}, why?, new_version?}       replaces or adds one section (default: the current version); new_version: true edits a copy under a new id
//   cv.fill {version?, placeholder: "<exact [NEEDS...] text>" | 1-based number, text, sources: [{kind, ref, quote}] (at least one)}   fills one fact into a copy (new version, why "Filled in: ..."); every number in text must be in the quote of at least one source; a [NEEDS REAL NUMBER] slot needs a number
//   cv.current {id}     cv.ats.set {version (required), ats: {job, matched, missing, estimate}} or the same fields flat   the label is always "AI estimate"
//   cv.why.set {version, why}   changes only the reason text of a version (not the page, pdf or checks); refused when it reads like an engine message ("Say ...", "Use the ...")
//   evidence.note {text, kind?: note|shipped|win}   saves the person's own words (verbatim) as an evidence entry marked by "chat" (refused if it holds a confidential item or repeats a private answer); result.ev is its id, and later actions in the list may cite {kind:"evidence", ref:"ev-NNN", quote}
//   case.set {case: {id, title, format?, status?, ...}, replace?}   (fewer beats or decisions than the case holds is refused unless replace: true)     case.remove {id}     cv.restore {career}   (undo: send back the earlier career object)
// A file may hold one action or a list: a list is applied in order and is all or nothing. Any edit clears the version's pdf.
// The dossier is <your career notes file> unless env GROWTH_DOSSIER or --dossier says otherwise.
// Prints one JSON line: { ok, touched, message, results?, notes? }. Exit 1 when refused. A missing career.json counts as empty;
// one that is present but not valid is never overwritten.
import "./_no-people.mjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FILES, OPTIONAL_FILES, validate } from "../lib/validate.mjs";
import { applyCareerAction, writeCvFiles, appDirOf, CAREER_ACTIONS, CAREER_INTERNAL_ACTIONS } from "../lib/career.mjs";
import { backupRoot } from "../lib/onboarding-reset.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OWN = "Claude (cv-act)";
const ALL = [...FILES, ...OPTIONAL_FILES];
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e && e.code === "EPERM"; } };
const localDay = (d = new Date()) => d.toLocaleDateString("en-CA");

/** Copies the draft html files an action is about to change into a snapshot folder. Returns { held, created } (paths relative to the app folder). */
function snapshotHtml(appDir, writes, dir) {
  const held = [];
  const created = [];
  for (const w of writes) {
    if (!/^cv\/drafts\/[A-Za-z0-9_.-]+\.html$/.test(w.rel)) continue;
    const src = path.join(appDir, ...w.rel.split("/"));
    if (!fs.existsSync(src)) { created.push(w.rel); continue; }
    const to = path.join(dir, ...w.rel.split("/"));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(src, to);
    held.push(w.rel);
  }
  return { held, created };
}

/**
 * Applies actions under the data lock. opts: { dataDir, dry, dossierPath, denylistPath, internal, by }.
 * Returns { ok, message, touched?, results?, notes?, busy? }. Never calls process.exit.
 */
export function runCareerActions(actions, opts = {}) {
  const dataDir = path.resolve(opts.dataDir || path.join(APP, "data"));
  const appDir = appDirOf(dataDir);
  const by = opts.by || OWN;
  const lockPath = path.join(dataDir, ".lock");
  const clearDir = `${lockPath}.clearing`;
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const notes = [];
  let held = false;
  const release = () => {
    if (!held) return;
    held = false;
    try { const l = JSON.parse(fs.readFileSync(lockPath, "utf8")); if (l && l.token === token) fs.rmSync(lockPath, { force: true }); } catch { /* already gone */ }
  };
  const readLockFile = () => { try { return JSON.parse(fs.readFileSync(lockPath, "utf8")); } catch { return null; } };
  const ageMs = (l) => { const t = new Date(l && l.started); return Number.isNaN(t.getTime()) ? Infinity : Date.now() - t.getTime(); };
  const staleWhy = (l) => {
    if (!l) return "";
    if (typeof l.pid === "number" && !alive(l.pid)) return `its owner (process ${l.pid}) is no longer running`;
    if (l.by === OWN) return ageMs(l) > 2 * 60000 ? "it is over 2 minutes old and one cv-act call never takes that long" : "";
    return ageMs(l) > 30 * 60000 ? "it is over 30 minutes old" : "";
  };
  const clearStale = (seen) => {
    try { fs.mkdirSync(clearDir); } catch {
      try { if (Date.now() - fs.statSync(clearDir).mtimeMs > 10000) fs.rmSync(clearDir, { recursive: true, force: true }); } catch { /* gone */ }
      return false;
    }
    try {
      const now = readLockFile();
      if (now && now.started === seen.started && now.pid === seen.pid && now.token === seen.token) { fs.rmSync(lockPath, { force: true }); return true; }
      return false;
    } finally { try { fs.rmSync(clearDir, { recursive: true, force: true }); } catch { /* temp */ } }
  };
  /** Takes data/.lock exclusively (flag wx), retrying with backoff for up to 5 seconds. Returns null on success or the lock in the way. */
  const acquire = () => {
    fs.mkdirSync(dataDir, { recursive: true });
    const until = Date.now() + 5000;
    let wait = 20;
    for (;;) {
      try {
        const fd = fs.openSync(lockPath, "wx");
        try { fs.writeSync(fd, JSON.stringify({ by, started: new Date().toISOString(), pid: process.pid, token })); } finally { fs.closeSync(fd); }
        held = true;
        return null;
      } catch (e) { if (!e || e.code !== "EEXIST") throw e; }
      const l = readLockFile();
      let why = staleWhy(l);
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
  const fail = (message, extra = {}) => { release(); return { ok: false, message, ...extra, ...(notes.length ? { notes } : {}) }; };

  const allowed = [...CAREER_ACTIONS, ...(opts.internal ? CAREER_INTERNAL_ACTIONS : [])];
  const bad = actions.find((a) => !a || !allowed.includes(a.type));
  if (bad) return { ok: false, message: `${bad && bad.type} is not a career action. Allowed: ${allowed.join(", ")}.` };

  if (!opts.dry) {
    const busy = acquire();
    if (busy) return { ok: false, busy: true, message: `${busy.by || "Claude"} is updating your data right now (since ${busy.started}). I waited 5 seconds. Nothing was changed; send this again in a moment.` };
  }
  try {
    const s = {};
    for (const n of ALL) {
      const p = path.join(dataDir, `${n}.json`);
      if (!fs.existsSync(p)) { if (FILES.includes(n)) return fail(`${n}.json is missing. Nothing was changed.`); continue; }
      try { s[n] = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "")); } catch (e) { return fail(`${n}.json is not valid JSON (${e.message}). Say fix my growth data. Nothing was changed.`); }
    }
    const before = validate(s);
    if (before.errors.length) return fail(`The data has errors already (${before.errors[0]}). Say fix my growth data. Nothing was changed.`);

    const touched = new Set();
    const results = [];
    const writes = new Map();
    const noteList = [];
    const ctx = { dataDir, today: localDay(), dossierPath: opts.dossierPath, denylistPath: opts.denylistPath, internal: opts.internal === true, now: new Date() };
    try {
      for (const a of actions) {
        const ts = applyCareerAction(a, s, ctx);
        for (const t of ts) touched.add(t);
        for (const w of ts.writes || []) writes.set(w.rel, w);
        if (ts.result) results.push(ts.result);
        for (const n of ts.notes || []) if (!noteList.includes(n)) noteList.push(n);
      }
    } catch (e) { return fail(e.message); }
    const after = validate(s);
    if (after.errors.length) return fail(`That would leave your data in a bad state (${after.errors[0]}). Nothing was changed.`);
    if (opts.dry) return { ok: true, dry_run: true, touched: [...touched], results, message: "Dry run: nothing written.", ...(noteList.length ? { notes: noteList } : {}) };

    // cv.pdf.set and cv.promote.mark are records of a script (cv-export, cv-promote): they leave no undo step and no snapshot of their own.
    const recordOnly = actions.every((a) => CAREER_INTERNAL_ACTIONS.includes(a.type));
    // Snapshot of the file about to change (its state BEFORE), as onboarding-act does, so Undo in the app finds this moment too.
    if (!recordOnly) try {
      const dir = path.join(backupRoot(dataDir), "_sets", new Date().toISOString().replace(/[:.]/g, "-"));
      fs.mkdirSync(dir, { recursive: true });
      const heldFiles = [];
      for (const n of touched) { const p = path.join(dataDir, `${n}.json`); if (fs.existsSync(p)) { fs.copyFileSync(p, path.join(dir, `${n}.json`)); heldFiles.push(n); } }
      // The draft html files this call changes are held too (as cv/drafts/<name>.html inside the set), so one undo restores data and pages together.
      const { held: heldHtml, created: createdHtml } = snapshotHtml(appDir, [...writes.values()], dir);
      fs.writeFileSync(path.join(dir, "_what.json"), JSON.stringify({ by, partial: true, files: heldFiles, html: heldHtml, created_html: createdHtml, actions: actions.map((a) => a.type + (a.id ? ` ${a.id}` : "")) }));
    } catch { /* the validation above is the real guard */ }
    if (!recordOnly && dataDir === path.join(APP, "data")) {
      try {
        const un = path.join(APP, "..", "companion", ".undo");
        const stampName = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
        const dir = path.join(un, stampName);
        fs.mkdirSync(dir, { recursive: true });
        for (const n of touched) { const p = path.join(dataDir, `${n}.json`); if (fs.existsSync(p)) fs.copyFileSync(p, path.join(dir, `${n}.json`)); }
        snapshotHtml(appDir, [...writes.values()], dir);
        fs.writeFileSync(path.join(dir, "_what.txt"), `cv-act: ${actions.map((a) => a.type + (a.id ? " " + a.id : "")).join(", ")}\n`);
        const all = fs.readdirSync(un).filter((x) => /^\d{8}-\d{6}$/.test(x)).sort();
        for (const old of all.slice(0, Math.max(0, all.length - 20))) fs.rmSync(path.join(un, old), { recursive: true, force: true });
      } catch { /* the _sets snapshot above still exists */ }
    }
    // Files first (the previous html is kept in cv/drafts/_history), then the data file, each atomically.
    let wrote = [];
    try { wrote = writeCvFiles(appDir, [...writes.values()]); } catch (e) { return fail(e.message); }
    for (const n of touched) {
      const p = path.join(dataDir, `${n}.json`);
      fs.writeFileSync(`${p}.tmp`, `${JSON.stringify(s[n], null, 2)}\n`);
      fs.renameSync(`${p}.tmp`, p);
    }
    release();
    return { ok: true, touched: [...touched], message: `Saved ${[...touched].map((n) => `${n}.json`).join(", ")}${wrote.length ? ` and ${wrote.join(", ")}` : ""}.`, results, ...(noteList.length || notes.length ? { notes: [...notes, ...noteList] } : {}) };
  } finally {
    release();
  }
}

// ---- command line ----------------------------------------------------------------------------------------------------------------
const isMain = (() => { try { return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] || ""); } catch { return false; } })();
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const done = (o, code = 0) => {
    const line = `${JSON.stringify(o)}\n`;
    try { fs.writeSync(1, line); } catch { console.log(line.trim()); }
    process.exit(code);
  };
  const stripBom = (t) => String(t).replace(/^\uFEFF/, "");
  let raw;
  const f = flag("--file");
  if (f) {
    try { raw = stripBom(fs.readFileSync(f, "utf8")); } catch (e) { done({ ok: false, message: `Cannot read ${f} (${e.message}). Write the JSON with the Write tool to a file and pass --file <path>. Nothing was changed.` }, 2); }
  } else if (args.includes("--stdin")) {
    try { raw = stripBom(fs.readFileSync(0, "utf8")); } catch { raw = ""; }
  }
  if (!raw) done({ ok: false, message: "Give the actions: write the JSON to a file and pass --file <path> (or --stdin). Nothing was changed." }, 2);
  let actions;
  try { const j = JSON.parse(raw); actions = Array.isArray(j) ? j : [j]; } catch (e) { done({ ok: false, message: `That is not valid JSON (${e.message}). Write it to a file with the Write tool and use --file. Nothing was changed.` }, 2); }
  const r = runCareerActions(actions, { dataDir: flag("--data-dir"), dry: args.includes("--dry-run"), dossierPath: flag("--dossier"), denylistPath: flag("--denylist") });
  done(r, r.ok ? 0 : 1);
}
