import { promises as fs } from "fs";
import path from "path";
import type { Action, Application, GrowthState, LogKind, Stage } from "./types";
import { reviewed } from "./ratings";
import { validate, validateTolerant } from "./validate.mjs";
import { mergeResearch, preserveTaskStatus, projectWeek, appendRun, appendReview } from "./plan.mjs";
import { ONBOARDING_ACTIONS, applyOnboardingAction } from "./onboarding-actions.mjs";
import { applyReset, backupRoot } from "./onboarding-reset.mjs";
import { formatMoney } from "./money.mjs";
import { CAREER_APP_ACTIONS, applyCareerAction, writeCvFiles } from "./career.mjs";
import { makeContext, withEvidence, checkVersion, checkCase, toStored, DEFAULT_DOSSIER } from "./career-honesty.mjs";
import type { CvHonesty } from "./types";

const DATA = path.join(process.cwd(), "data");
export const UPLOADS = path.join(DATA, "uploads");
const FILES = ["profile", "rubric", "skills", "evidence", "proof", "reach", "bets", "week", "notnow", "queue", "learning", "tests", "library"] as const;
/** Plan engine files. Each may be absent; the app reads them only when they exist. */
const OPTIONAL = ["demands", "plan", "research", "sources", "runs", "reviews", "onboarding", "unknowns", "prior", "career"] as const;
export type DataFile = (typeof FILES)[number] | (typeof OPTIONAL)[number];
const ALL_FILES: readonly string[] = [...FILES, ...OPTIONAL];

/** What each kind of logged event adds to the week. Informational, not a game. */
export const LOG_POINTS: Record<LogKind, number> = { application: 15, feedback: 20, shipped: 15, win: 25, note: 5 };

/** A data file that couldn't be read, named so the fix is obvious. */
export class DataError extends Error {
  constructor(public file: string, public reason: string) { super(`${file}.json: ${reason}`); }
}

/** Data that parses but breaks the rules (wrong shape, missing fields). Lists the problems and the files. */
export class ShapeError extends Error {
  constructor(public problems: string[]) { super(problems.join("; ")); }
  get files() { return [...new Set(this.problems.map((x) => x.split(":")[0]).filter((f) => ALL_FILES.includes(f)))]; }
}

/** The raw text last snapshotted per file, so an unchanged file isn't copied again. */
const lastSnap = new Map<string, string>();

/** Keeps a copy of every file whenever the whole data set is valid. This also catches edits Claude Code makes directly. */
async function snapshot(raws: Record<string, string>) {
  // A whole, consistent set too, so a break that spans files can be rolled back to one good moment.
  if (Object.entries(raws).some(([f, raw]) => lastSnap.get(f) !== raw)) {
    try {
      const sets = path.join(BACKUPS, "_sets");
      const dir = path.join(sets, new Date().toISOString().replace(/[:.]/g, "-"));
      await fs.mkdir(dir, { recursive: true });
      await Promise.all(Object.entries(raws).map(([f, raw]) => fs.writeFile(path.join(dir, `${f}.json`), raw)));
      const all = (await fs.readdir(sets)).sort();
      await Promise.all(all.slice(0, Math.max(0, all.length - 15)).map((n) => fs.rm(path.join(sets, n), { recursive: true, force: true })));
    } catch { /* never blocks reading */ }
  }
  await Promise.all(Object.entries(raws).map(async ([f, raw]) => {
    const dir = path.join(BACKUPS, f);
    if (lastSnap.get(f) === raw) { try { await fs.access(dir); return; } catch { /* folder gone: snapshot again */ } }
    try {
      await fs.mkdir(dir, { recursive: true });
      const names = (await fs.readdir(dir)).filter((n) => n.endsWith(".json")).sort();
      const newest = names.length ? await fs.readFile(path.join(dir, names[names.length - 1]), "utf8") : null;
      if (newest !== raw) {
        await fs.writeFile(path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`), raw);
        const all = [...names, "x"];
        await Promise.all(names.slice(0, Math.max(0, all.length - KEEP)).map((n) => fs.unlink(path.join(dir, n))));
      }
      lastSnap.set(f, raw);
    } catch { /* a backup hiccup never blocks reading */ }
  }));
}

/** Reads every file. Throws DataError for a file that won't parse, ShapeError when the data breaks the rules. */
export async function readState(): Promise<GrowthState> {
  const raws: Record<string, string> = {};
  const entries = await Promise.all(
    FILES.map(async (f) => {
      let raw: string;
      try { raw = await fs.readFile(path.join(DATA, `${f}.json`), "utf8"); }
      catch { throw new DataError(f, "the file is missing"); }
      raws[f] = raw;
      try { return [f, JSON.parse(raw)] as const; }
      catch (e) { throw new DataError(f, e instanceof Error ? e.message : "it isn't valid JSON"); }
    })
  );
  const state = Object.fromEntries(entries) as unknown as GrowthState;
  // Plan engine files: read only the ones that exist. One that is not valid JSON is left out, so it cannot take the app down.
  const bag = state as unknown as Record<string, unknown>;
  for (const f of OPTIONAL) {
    let raw: string;
    try { raw = await fs.readFile(path.join(DATA, `${f}.json`), "utf8"); } catch { continue; }
    try { bag[f] = JSON.parse(raw); raws[f] = raw; } catch { /* scripts/plan-check.mjs names the broken file */ }
  }
  // Only plan engine files at fault, and the rest is valid without them: show the app without them rather than not at all.
  // Otherwise the first errors are thrown as they are, so they name the real file. Writers refuse while a file is left out (see unloadedFiles).
  const t = validateTolerant(bag);
  if (t.errors.length) throw new ShapeError(t.errors);
  for (const f of t.dropped) { delete bag[f]; delete raws[f]; }
  await refreshCareerChecks(state, raws);
  await snapshot(raws);
  return state;
}

// The honesty result stored in career.json is the one from when it was last written; the engine gets stricter. So the app is given today's
// result for each CV version and case, worked out here on the server and never written by this function (cv-check, cv-export and cv-promote
// write it back). Kept when the engine cannot load its sources (no career file or deny-list on this computer). Worked out once per change.
let careerChecksMemo: { key: string; versions: Record<string, CvHonesty>; cases: Record<string, CvHonesty> } | null = null;
async function refreshCareerChecks(state: GrowthState, raws: Record<string, string>): Promise<void> {
  const career = state.career;
  if (!career || !career.cv || !Array.isArray(career.cv.versions)) return;
  try {
    const mtime = async (p: string) => { try { return (await fs.stat(p)).mtimeMs; } catch { return 0; } };
    const dossierPath = process.env.GROWTH_DOSSIER || DEFAULT_DOSSIER;
    const denylistPath = path.join(path.dirname(DATA), "cv", ".denylist.json");
    const key = [raws.career, raws.evidence, raws.onboarding ?? "", await mtime(dossierPath), await mtime(denylistPath)].join("\u0001");
    if (!careerChecksMemo || careerChecksMemo.key !== key) {
      const base = makeContext({ dataDir: DATA, dossierPath, denylistPath });
      if (base.loadProblems.length) return;
      const ctx = state.evidence && Array.isArray(state.evidence.entries) ? withEvidence(base, state.evidence.entries) : base;
      const versions: Record<string, CvHonesty> = {};
      const cases: Record<string, CvHonesty> = {};
      for (const v of career.cv.versions) versions[v.id] = toStored(checkVersion(v, ctx)) as CvHonesty;
      for (const c of career.cases ?? []) cases[c.id] = toStored(checkCase(c, ctx)) as CvHonesty;
      careerChecksMemo = { key, versions, cases };
    }
    const memo = careerChecksMemo;
    for (const v of career.cv.versions) if (memo.versions[v.id]) v.checks = { honesty: JSON.parse(JSON.stringify(memo.versions[v.id])) as CvHonesty, ats: v.checks ? v.checks.ats : null };
    for (const c of career.cases ?? []) if (memo.cases[c.id]) (c as unknown as { checks?: { honesty: CvHonesty } }).checks = { honesty: JSON.parse(JSON.stringify(memo.cases[c.id])) as CvHonesty };
  } catch { /* the stored checks stay as they are */ }
}

/**
 * Plan engine files that exist on disk but were not loaded (not valid JSON, or left out so the app could run).
 * A writer must refuse while this is not empty: to it the file looks absent, and a write would replace the real one.
 */
export async function unloadedFiles(s: GrowthState): Promise<string[]> {
  const bag = s as unknown as Record<string, unknown>;
  const out: string[] = [];
  for (const f of OPTIONAL) {
    if (bag[f] !== undefined) continue;
    try { await fs.access(path.join(DATA, `${f}.json`)); out.push(f); } catch { /* really absent */ }
  }
  return out;
}

// Backups live in data/.backups, or under GROWTH_BACKUP_DIR (kept outside a synced folder) when that variable is set.
const BACKUPS = backupRoot(DATA);
const LOCK = path.join(DATA, ".lock");
const LOCK_FRESH_MIN = 30;

/** Claude Code writes data/.lock while it runs the person's queue. A fresh lock means: don't write now. */
export async function readLock(): Promise<{ by: string; started: string } | null> {
  try {
    const l = JSON.parse(await fs.readFile(LOCK, "utf8")) as { by?: string; started?: string; pid?: number };
    const started = l.started ? new Date(l.started) : null;
    if (!started || Number.isNaN(started.getTime())) return null;
    if (Date.now() - started.getTime() > LOCK_FRESH_MIN * 60000) return null;
    // A lock left by a killed onboarding-act: its process is gone, or it is over 2 minutes old (one act takes well under one).
    if (typeof l.pid === "number") {
      let alive = true;
      try { process.kill(l.pid, 0); } catch (e) { alive = (e as NodeJS.ErrnoException).code === "EPERM"; }
      if (!alive) return null;
      if (l.by === "Claude (onboarding-act)" && Date.now() - started.getTime() > 2 * 60000) return null;
    }
    // The app's own act in flight (this very process) is not "Claude is working": it must not show as a banner or block itself.
    if (l.by === APP_LOCK_BY && l.pid === process.pid) return null;
    return { by: l.by ?? "Claude", started: l.started! };
  } catch { return null; }
}

const APP_LOCK_BY = "Growth app";
/**
 * The app takes the same data/.lock the onboarding script takes (same file, same fields: by, started, pid, token), exclusively,
 * for the whole read-change-write of one act. Without it an app write and a Claude write could each read the old state and the
 * second one silently erased the first. A live lock of another writer refuses the act; a stale one (dead pid, 30 minutes) is cleared.
 */
async function takeLock(): Promise<string> {
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const until = Date.now() + 3000;
  const pause = () => new Promise((r) => setTimeout(r, 40));
  for (;;) {
    try {
      const fh = await fs.open(LOCK, "wx");
      try { await fh.writeFile(JSON.stringify({ by: APP_LOCK_BY, started: new Date().toISOString(), pid: process.pid, token })); } finally { await fh.close(); }
      return token;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    let l: { by?: string; pid?: number } | null = null;
    try { l = JSON.parse(await fs.readFile(LOCK, "utf8")); } catch { /* a writer is creating it, or it is junk */ }
    if (!l) {
      if (Date.now() > until) { try { await fs.rm(LOCK, { force: true }); } catch { /* retried */ } }
      else await pause();
      continue;
    }
    // The same process (another module instance mid act) counts as live; readLock calls its own lock "not Claude" for the banner.
    const live = (l.by === APP_LOCK_BY && l.pid === process.pid) || !!(await readLock());
    if (!live) { try { await fs.rm(LOCK, { force: true }); } catch { /* retried */ } continue; }
    if (Date.now() > until) throw new Error(`${l.by ?? "Claude"} is updating your data right now. Try again in a minute; nothing was changed.`);
    await pause();
  }
}
async function releaseLock(token: string) {
  try {
    const l = JSON.parse(await fs.readFile(LOCK, "utf8")) as { token?: string };
    if (l && l.token === token) await fs.rm(LOCK, { force: true });
  } catch { /* already gone */ }
}

/** Refuses a write while Claude is working, so neither side overwrites the other. */
export async function assertUnlocked() {
  const l = await readLock();
  if (l) throw new Error(`${l.by} is updating your data right now. Try again in a minute; nothing was changed.`);
}
const KEEP = 40;

/** Writes atomically. The next valid read snapshots the result, so every good state is kept. */
export async function write(file: DataFile, value: unknown) {
  const target = path.join(DATA, `${file}.json`);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(tmp, target);
}

/** Puts back the newest backup of a file that is valid JSON. Returns its timestamp, or null if there is none. */
export async function restoreLatest(file: string): Promise<string | null> {
  if (!ALL_FILES.includes(file)) throw new Error("Unknown data file.");
  const dir = path.join(BACKUPS, file);
  let names: string[] = [];
  try { names = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).sort().reverse(); } catch { return null; }
  // Everything else as it is now, to test each candidate against the full rules.
  const others: Record<string, unknown> = {};
  // Plan engine files count too: their ids point into the other files and back, and a missing one is simply skipped.
  for (const f of ALL_FILES) {
    if (f === file) continue;
    try { others[f] = JSON.parse(await fs.readFile(path.join(DATA, `${f}.json`), "utf8")); } catch { /* checked on its own */ }
  }
  const fullCheck = FILES.every((f) => f === file || f in others);
  for (const n of names) {
    const raw = await fs.readFile(path.join(dir, n), "utf8");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { continue; }
    if (fullCheck && validate({ ...others, [file]: parsed }).errors.length) continue;
    const target = path.join(DATA, `${file}.json`);
    try { await fs.copyFile(target, path.join(dir, `broken-${Date.now()}.txt`)); } catch { /* nothing to keep */ }
    await fs.writeFile(target, raw);
    return n.replace(/\.json$/, "");
  }
  return null;
}

/** Puts every file back to the newest moment when the whole set was valid. Returns that moment, or null. */
export async function restoreSet(): Promise<string | null> {
  const sets = path.join(BACKUPS, "_sets");
  let asc: string[] = [];
  try { asc = (await fs.readdir(sets)).sort(); } catch { return null; }
  const names = [...asc].reverse();
  const readIn = async (set: string, f: string): Promise<unknown | undefined> => {
    try { return JSON.parse(await fs.readFile(path.join(sets, set, `${f}.json`), "utf8")); } catch { return undefined; }
  };
  for (const n of names) {
    const d: Record<string, unknown> = {};
    // A set written by the onboarding script holds only the files that action was about to change (the state BEFORE it). A file
    // missing from such a set had not changed yet at that moment: its state is the copy in the next newer set that holds it
    // (the state before that later action), or, when no later action touched it, the file as it is now.
    let partial = false;
    let html: string[] = [];
    let madeHtml: string[] = [];
    try { const w = JSON.parse(await fs.readFile(path.join(sets, n, "_what.json"), "utf8")) as { partial?: boolean; html?: string[]; created_html?: string[] }; partial = w.partial === true; html = Array.isArray(w.html) ? w.html : []; madeHtml = Array.isArray(w.created_html) ? w.created_html : []; } catch { /* a complete set */ }
    const at = asc.indexOf(n);
    const find = async (f: string): Promise<unknown | undefined> => {
      const own = await readIn(n, f);
      if (own !== undefined || !partial) return own;
      for (let j = at + 1; j < asc.length; j++) { const later = await readIn(asc[j], f); if (later !== undefined) return later; }
      try { return JSON.parse(await fs.readFile(path.join(DATA, `${f}.json`), "utf8")); } catch { return undefined; }
    };
    let broken = false;
    for (const f of FILES) { const v = await find(f); if (v === undefined) { broken = true; break; } d[f] = v; }
    if (broken) continue;
    // Plan engine files that existed at that moment come back with it, so cross-file ids still match.
    const back: string[] = [...FILES];
    for (const f of OPTIONAL) { const v = await find(f); if (v !== undefined) { d[f] = v; back.push(f); } }
    if (validate(d).errors.length) continue;
    const keep = path.join(BACKUPS, `_before-restore-${Date.now()}`);
    await fs.mkdir(keep, { recursive: true });
    for (const f of back) {
      try { await fs.copyFile(path.join(DATA, `${f}.json`), path.join(keep, `${f}.json`)); } catch { /* missing file */ }
      await fs.writeFile(path.join(DATA, `${f}.json`), JSON.stringify(d[f], null, 2) + "\n");
    }
    // CV pages the same step changed (held by scripts/cv-act.mjs) come back with the data, so the career and its html agree.
    for (const rel of html) {
      if (!/^cv\/drafts\/[A-Za-z0-9_.-]+\.html$/.test(rel)) continue;
      try { await fs.copyFile(path.join(sets, n, ...rel.split("/")), path.join(path.dirname(DATA), ...rel.split("/"))); } catch { /* the page is rebuilt from career.json on the next edit */ }
    }
    // Pages that step created are removed: their version is gone from career.json now.
    for (const rel of madeHtml) {
      if (!/^cv\/drafts\/[A-Za-z0-9_.-]+\.html$/.test(rel)) continue;
      try { await fs.rm(path.join(path.dirname(DATA), ...rel.split("/")), { force: true }); } catch { /* left in place */ }
    }
    return n;
  }
  return null;
}

export { FILES, OPTIONAL };

const today = () => new Date().toLocaleDateString("en-CA");

function nextId(prefix: string, ids: string[]) {
  const n = ids
    .filter((i) => i.startsWith(prefix))
    .map((i) => parseInt(i.slice(prefix.length), 10))
    .filter((x) => !Number.isNaN(x));
  return `${prefix}${String((n.length ? Math.max(...n) : 0) + 1).padStart(3, "0")}`;
}

const STAGE_ORDER: Stage[] = ["applied", "screen", "portfolio_review", "challenge", "final", "offer"];
const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
const LOCAL = /^(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?$/i;
const LINK = /^(https?:\/\/)?((localhost|127\.0\.0\.1)(:\d+)?|[\w-]+(\.[\w-]+)+(:\d+)?)(\/\S*)?$/i;
/** Links must look like links; bare domains get https:// added, local ones http://. */
function asLinks(xs: string[]) {
  return clean(xs).map((l) => {
    if (!LINK.test(l)) throw new Error(`"${l.slice(0, 40)}" doesn't look like a link. Try pasting the full address.`);
    return /^https?:\/\//i.test(l) ? l : LOCAL.test(l) ? `http://${l}` : `https://${l}`;
  });
}

function recountBatch(s: GrowthState, batchId: string) {
  const batch = s.reach.funnel.batches.find((b) => b.id === batchId);
  if (!batch) return;
  const apps = s.reach.funnel.applications.filter((a) => a.batch === batchId) as (Application & { furthest?: Stage })[];
  for (const st of STAGE_ORDER) {
    (batch as unknown as Record<string, number>)[st] = apps.filter((a) => {
      const furthest = a.stage === "rejected" ? a.furthest ?? "applied" : a.stage;
      return STAGE_ORDER.indexOf(furthest) >= STAGE_ORDER.indexOf(st);
    }).length;
  }
}

let actChain: Promise<unknown> = Promise.resolve();
/** One act at a time in this process (a queue), and the data lock across processes. Every act is read, change, validate, write under it. */
export function act(a: Action): Promise<GrowthState> {
  const run = actChain.then(() => actLocked(a), () => actLocked(a));
  actChain = run.catch(() => undefined);
  return run;
}

async function actLocked(a: Action): Promise<GrowthState> {
  await assertUnlocked();
  // onboard.reset takes the lock itself (applyReset checks it and writes the whole folder); every other act holds it here.
  if (a.type === "onboard.reset") return actInner(a);
  const token = await takeLock();
  try { return await actInner(a); } finally { await releaseLock(token); }
}

async function actInner(a: Action): Promise<GrowthState> {
  if (a.type === "onboard.reset") {
    // Archive then blank. Never from the app: the server process does not carry this flag, only a Claude Code script run does.
    if (process.env.GROWTH_RESET_FROM_CLAUDE_CODE !== "1") throw new Error("Erasing and starting over is done from Claude Code, not from the app. Say growth start in Claude Code. Nothing was changed.");
    // Needs the token the plan step of scripts/onboarding-reset.mjs printed and the typed phrase.
    const r = applyReset({ dataDir: DATA, token: String(a.token ?? ""), phrase: String(a.phrase ?? ""), forceNew: a.force_new === true, differentPerson: a.different_person === true, samePerson: a.same_person === true });
    if (!r.ok) throw new Error(r.message);
    lastSnap.clear();
    return readState();
  }
  const s = await readState();
  const touched = new Set<DataFile>();
  let cvWrites: { rel: string; text: string }[] = [];
  const evId = () => nextId("ev-", s.evidence.entries.map((e) => e.id));
  const qId = () => nextId("Q-", s.queue.items.map((q) => q.id));
  const task = (id: string) => {
    const t = s.week.tasks.find((t) => t.id === id);
    if (!t) throw new Error(`That task isn't in this week any more.`);
    return t;
  };
  const proofItem = (id: string) => {
    const p = s.proof.items.find((x) => x.id === id);
    if (!p) throw new Error("That proof item doesn't exist.");
    return p;
  };

  // A plan engine file that is on disk but could not be loaded looks absent here; writing would replace the real one.
  if (["plan.set", "demands.set", "research.add", "sources.set", "run.log", "review.set", "plan.project_week", ...ONBOARDING_ACTIONS, ...CAREER_APP_ACTIONS].includes(a.type)) {
    const bad = await unloadedFiles(s);
    if (bad.length) throw new Error(`${bad.map((f) => `${f}.json`).join(" and ")} has problems, so nothing was changed. Say "fix my growth data" in Claude Code first.`);
  }

  switch (a.type) {
    case "task.done": {
      const t = task(a.id);
      t.status = "done";
      t.closed = today();
      t.stepsDone = t.steps.map((_, i) => i);
      const ev = evId();
      s.evidence.entries.push({ id: ev, date: today(), type: "self", title: t.task, detail: t.artifact, links: [], competency: t.competency, points: t.points });
      t.prev = { ev };
      touched.add("week").add("evidence");
      break;
    }
    case "task.later": {
      const t = task(a.id);
      t.status = "later";
      touched.add("week");
      break;
    }
    case "task.reopen": {
      const t = task(a.id);
      t.status = "todo";
      delete t.closed;
      touched.add("week");
      break;
    }
    case "task.undo": {
      const t = task(a.id);
      if (!t.prev || (t.status !== "done" && t.status !== "submitted")) throw new Error("There's nothing to undo on that quest.");
      const { ev, q, proof } = t.prev;
      s.evidence.entries = s.evidence.entries.filter((e) => e.id !== ev);
      if (q) { s.queue.items = s.queue.items.filter((x) => x.id !== q || x.status !== "pending"); touched.add("queue"); }
      if (proof) { const p = proofItem(proof.id); p.status = proof.status; p.links = (p.links ?? []).slice(0, proof.links); touched.add("proof"); }
      t.status = "todo";
      delete t.closed;
      delete t.prev;
      delete t.submission;
      touched.add("week").add("evidence");
      break;
    }
    case "task.step": {
      const t = task(a.id);
      if (!Number.isInteger(a.step) || a.step < 0 || a.step >= t.steps.length) throw new Error("That step isn't on this task. Nothing was changed.");
      const done = new Set(t.stepsDone ?? []);
      if (done.has(a.step)) done.delete(a.step);
      else done.add(a.step);
      t.stepsDone = [...done].sort((x, y) => x - y);
      touched.add("week");
      break;
    }
    case "task.submit": {
      const t = task(a.id);
      const links = asLinks(a.links);
      const files = clean(a.files);
      const note = a.note.trim();
      if (a.elsewhere && !note) throw new Error("Say in one line what you made.");
      if (!a.elsewhere && !links.length && !files.length && !note) throw new Error("Add a link, a file or a note first.");
      const proven = links.length + files.length > 0;
      // Proof earns full points; "did it elsewhere" without anything attached earns half.
      // Points count work done; trust comes from the evidence source (shipped vs self), not from points.
      const earned = t.points;
      t.status = "submitted";
      t.closed = today();
      t.stepsDone = t.steps.map((_, i) => i);
      t.submission = { links, files, note, elsewhere: a.elsewhere };
      const ev = evId();
      t.prev = { ev };
      s.evidence.entries.push({
        id: ev, date: today(), type: proven ? "shipped" : "self", title: t.task,
        detail: [note, ...links, ...files].filter(Boolean).join("\n"), links: [...links, ...files],
        competency: t.competency, pending: reviewed(t), points: earned,
      });
      if (reviewed(t)) {
        t.prev.q = qId();
        s.queue.items.push({ id: t.prev.q, type: "critique", status: "pending", created: today(), competency: t.competency, task: t.id, request: `Critique ${t.id} (${t.task}). Skill: ${t.competency ?? "none"}. Expected: ${t.artifact}. Links: ${links.join(", ") || "none"}. Files: ${files.join(", ") || "none"}. ${a.elsewhere ? "Made somewhere he can't link; judge the note." : ""} Note: "${note || "none"}". Judge it with the growth-coach checklist for this kind of work${t.proof ? ` (proof item ${t.proof})` : ""}. Write the result to week.json task ${t.id} as feedback {date, verdict, working, fix_first, next, reads_at}.` });
        touched.add("queue");
      }
      if (t.proof && (links.length || files.length)) {
        const p = proofItem(t.proof);
        t.prev.proof = { id: p.id, status: p.status, links: (p.links ?? []).length };
        p.links = [...(p.links ?? []), ...links, ...files];
        if (p.status === "missing") p.status = "draft";
        // The last quest that builds this item finishes it (self-reported until someone else sees it).
        const rest = s.week.tasks.filter((x) => x.proof === t.proof && x.id !== t.id);
        if (p.status === "draft" && rest.every((x) => x.status === "done" || x.status === "submitted")) p.status = "done";
        touched.add("proof");
      }
      touched.add("week").add("evidence");
      break;
    }
    case "log": {
      const text = a.text.trim();
      if (!text) throw new Error("Write what happened first.");
      if (!Object.prototype.hasOwnProperty.call(LOG_POINTS, a.kind)) throw new Error("That isn't something I can save. Nothing was changed.");
      if (a.from !== undefined && !["market", "expert", "shipped", "ai", "self"].includes(a.from)) throw new Error("That isn't something I can save. Nothing was changed.");
      if (a.kind === "feedback" && !a.from) throw new Error("Choose who said it.");
      if (a.kind === "application") {
        s.reach.funnel.applications.push({ id: nextId("A-", s.reach.funnel.applications.map((x) => x.id)), date: today(), company: a.company?.trim() || "Unknown", title: a.title?.trim() || "Product Designer", batch: "batch-1", stage: "applied" });
        recountBatch(s, "batch-1");
        touched.add("reach");
      }
      if (a.kind === "win") {
        s.reach.recognition.inbound_messages.push({ date: today(), from: text.slice(0, 80) });
        touched.add("reach");
      }
      const type = a.kind === "feedback" ? a.from! : a.kind === "application" || a.kind === "win" ? "market" : a.kind === "shipped" ? "shipped" : "note";
      const title = a.kind === "application" ? `Applied: ${a.title || "Product Designer"} at ${a.company || "Unknown"}` : text.split("\n")[0].slice(0, 90);
      s.evidence.entries.push({ id: evId(), date: today(), type, title, detail: text, links: [], competency: a.competency, points: LOG_POINTS[a.kind], ...(a.tag ? { tag: a.tag } : {}), ...(a.gap ? { gap: a.gap } : {}) });
      // Learning something toward an open gap moves it to "closing"; Claude decides when it's closed.
      const g = a.gap ? s.library.gaps?.find((x) => x.id === a.gap) : undefined;
      if (g && g.status === "open") { g.status = "closing"; touched.add("library"); }
      if (a.recall) {
        s.profile.recall = s.profile.recall ?? {};
        const cur = s.profile.recall[a.recall]?.step ?? 0;
        s.profile.recall[a.recall] = { step: Math.min(cur + 1, 4), last: today() };
        touched.add("profile");
      }
      touched.add("evidence");
      break;
    }
    case "log.undo": {
      const text = a.text.trim();
      let at = -1;
      for (let i = s.evidence.entries.length - 1; i >= 0; i--) {
        const e = s.evidence.entries[i];
        if (e.type === "note" && e.date === today() && (e.detail ?? "").trim() === text) { at = i; break; }
      }
      if (at < 0) throw new Error("That line is already gone. Nothing was changed.");
      s.evidence.entries.splice(at, 1);
      touched.add("evidence");
      break;
    }
    case "queue.request": {
      if (a.kind !== "research" && a.kind !== "test") throw new Error("Claude can only be asked for a brief or a test.");
      if (!s.rubric.competencies.some((c) => c.id === a.competency)) throw new Error("That skill isn't there any more.");
      const exists = s.queue.items.find((q) => q.status === "pending" && q.type === a.kind && q.competency === a.competency);
      if (!exists) {
        const name = s.rubric.competencies.find((c) => c.id === a.competency)?.name ?? a.competency;
        const lvl = s.skills.ratings[a.competency]?.level ?? 1;
        const next = Math.min(4, Math.floor(lvl) + 1);
        s.queue.items.push({
          id: qId(), type: a.kind, status: "pending", created: today(), competency: a.competency,
          request: a.kind === "research" ? `Research brief on ${name}: what designers at level ${next} know and do, with sources.` : `Skill test for ${name}: scenario questions at level ${next}.`,
        });
        touched.add("queue");
      }
      break;
    }
    case "application.stage": {
      const app = s.reach.funnel.applications.find((x) => x.id === a.id) as (Application & { furthest?: Stage }) | undefined;
      if (!app) throw new Error("That application doesn't exist.");
      if (!["applied", "screen", "portfolio_review", "challenge", "final", "offer", "rejected"].includes(a.stage)) throw new Error("Pick a stage from the list.");
      if (a.stage === "rejected" && app.stage !== "rejected") app.furthest = app.stage;
      app.stage = a.stage;
      recountBatch(s, app.batch);
      s.evidence.entries.push({ id: evId(), date: today(), type: "market", title: `${app.company}: ${a.stage.replace("_", " ")}`, detail: app.title, links: [], points: a.stage === "rejected" ? 0 : 20 });
      touched.add("reach").add("evidence");
      break;
    }
    case "proof.attach": {
      const p = proofItem(a.id);
      const links = asLinks(a.links);
      const files = clean(a.files);
      if (!links.length && !files.length) throw new Error("Attach a link or a file. That's what makes it proof.");
      p.links = [...(p.links ?? []), ...links, ...files];
      if (p.status !== "verified") p.status = "done";
      const pts = p.priority <= 2 ? 30 : 15;
      s.evidence.entries.push({ id: evId(), date: today(), type: "shipped", title: `Ready: ${p.name}`, detail: [a.note.trim(), ...links, ...files].filter(Boolean).join("\n"), links: [...links, ...files], points: pts });
      p.evidence.push(s.evidence.entries[s.evidence.entries.length - 1].id);
      touched.add("proof").add("evidence");
      break;
    }
    case "proof.respond": {
      const p = proofItem(a.id);
      if (!["market", "expert", "shipped", "ai", "self"].includes(a.from)) throw new Error("Choose who responded.");
      if (!a.who.trim() || !a.said.trim()) throw new Error("Add who responded and what they said.");
      if (!(p.links ?? []).length) throw new Error("Attach the work first, so the response has something to point at.");
      p.status = "verified";
      s.evidence.entries.push({ id: evId(), date: today(), type: a.from, title: `${a.who.trim()} on ${p.name}`, detail: a.said.trim(), links: [], points: 25 });
      p.evidence.push(s.evidence.entries[s.evidence.entries.length - 1].id);
      touched.add("proof").add("evidence");
      break;
    }
    case "followers": {
      if (!Number.isFinite(a.value) || a.value < 0) throw new Error("Enter a follower count.");
      s.reach.recognition.linkedin_followers.push({ date: today(), value: Math.round(a.value) });
      touched.add("reach");
      break;
    }
    case "test.answer": {
      const t = s.tests.tests.find((x) => x.id === a.id);
      if (!t) throw new Error("That test doesn't exist.");
      t.questions.forEach((q, i) => (q.answer = a.answers[i] ?? ""));
      t.status = "answered";
      s.queue.items.push({ id: qId(), type: "test", status: "pending", created: today(), competency: t.competency, request: `Score answered test ${t.id}.` });
      const linked = s.week.tasks.find((x) => x.kind === "test" && x.competency === t.competency && x.status === "todo");
      if (linked) {
        linked.status = "submitted";
        linked.closed = today();
        linked.stepsDone = linked.steps.map((_, i) => i);
        s.evidence.entries.push({ id: evId(), date: today(), type: "self", title: linked.task, detail: "Answers sent for scoring.", links: [], competency: t.competency, points: linked.points, pending: true });
        touched.add("week").add("evidence");
      }
      touched.add("tests").add("queue");
      break;
    }
    case "brief.read": {
      const b = s.learning.briefs.find((x) => x.id === a.id);
      if (b && !b.read) {
        b.read = true;
        touched.add("learning");
      }
      break;
    }
    case "review.submit": {
      s.evidence.entries.push({ id: evId(), date: today(), type: "note", title: "Weekly review", detail: a.happened.trim() || "No notes.", links: [] });
      s.queue.items.push({ id: qId(), type: "plan", status: "pending", created: today(), request: `Weekly review for week of ${s.week.week_of}. Notes: ${a.happened.trim() || "none"}. Tonight lines this week: ${s.evidence.entries.filter((e) => e.tag === "tonight" && e.date >= s.week.week_of).map((e) => `[${e.date}] ${e.detail}`).join(" | ") || "none"}. Tasks done: ${s.week.tasks.filter((t) => t.status === "done" || t.status === "submitted").map((t) => t.id).join(", ") || "none"}; saved for later: ${s.week.tasks.filter((t) => t.status === "later").map((t) => t.id).join(", ") || "none"}. Follow the growth-coach weekly review protocol.` });
      touched.add("evidence").add("queue");
      break;
    }
    case "intake.answer": {
      const qs = s.profile.intake ?? [];
      const given = a.answers.map((x) => ({ ...x, answer: x.answer.trim() })).filter((x) => x.answer);
      if (!given.length) throw new Error("Write at least one answer first.");
      const lines: string[] = [];
      for (const g of given) {
        const q = qs.find((x) => x.id === g.id);
        if (!q) continue;
        q.answer = g.answer;
        q.date = today();
        q.source = "self";
        lines.push(`[${q.id}] ${q.q} → "${g.answer}"`);
      }
      if (!lines.length) throw new Error("Those questions aren't there any more.");
      s.queue.items.push({ id: qId(), type: "answers", status: "pending", created: today(), request: `The person answered ${lines.length} question${lines.length === 1 ? "" : "s"}: ${lines.join(" | ")}. Update the diagnosis, say what it changes, and adjust this week only if a priority moved.` });
      touched.add("profile").add("queue");
      break;
    }
    case "ask": {
      const text = a.text.trim();
      if (!text) throw new Error("Write your question first.");
      if (a.kind !== "question" && a.kind !== "change") throw new Error("That isn't something I can save. Nothing was changed.");
      s.queue.items.push({
        id: qId(), type: "ask", status: "pending", created: today(), ask: { text, kind: a.kind },
        request: a.kind === "change"
          ? `The person asks to change something: "${text}". Make the change if it serves his goal and the two-tracks rule; if it doesn't, say why and make the closest change that does. Write what you did to this item's reply.`
          : `The person asks: "${text}". Answer in this item's reply: plain words, under 150 words, cite evidence-base sections where it rests on them. If the answer teaches you something about him, store it in profile.intake.`,
      });
      touched.add("queue");
      break;
    }
    case "pick.set": {
      const p = (s.library.picks ?? []).find((x) => x.id === a.id);
      if (!p) throw new Error("That pick isn't there any more.");
      if (!["new", "kept", "skipped"].includes(a.status)) throw new Error("That isn't something I can save. Nothing was changed.");
      p.status = a.status;
      if (a.status === "skipped") { if (a.reason) p.skip_reason = a.reason; } else delete p.skip_reason;
      if (a.status === "new" && p.ev) {
        // Undoing "finished": take back the journal line it made.
        s.evidence.entries = s.evidence.entries.filter((e) => e.id !== p.ev);
        delete p.ev; delete p.note; delete p.done;
        touched.add("evidence");
      }
      if (a.status === "new") { delete p.done; delete p.note; }
      touched.add("library");
      break;
    }
    case "trinket.set": {
      const t = (s.library.trinkets ?? []).find((x) => x.id === a.id);
      if (!t) throw new Error("That thought isn't here any more.");
      if (!["new", "saved", "hidden"].includes(a.status)) throw new Error("That isn't something I can save. Nothing was changed.");
      t.status = a.status;
      touched.add("library");
      break;
    }
    case "person.set": {
      const it = s.profile.person?.items.find((x) => x.id === a.id);
      if (!it) throw new Error("That isn't on your list any more.");
      if (!["proposed", "confirmed", "rejected", "hidden"].includes(a.status)) throw new Error("That isn't something I can save. Nothing was changed.");
      // A card written from a confirmed thought can no longer be trusted once that thought is rejected or hidden: drop it, Claude rewrites it on the next confirm.
      if (it.status === "confirmed" && a.status !== "confirmed" && s.profile.person) delete s.profile.person.card;
      it.status = a.status;
      // Rejected and hidden items stay on the list, so they are never worked out again.
      if (a.status === "confirmed") it.confirmed = today(); else delete it.confirmed;
      touched.add("profile");
      break;
    }
    case "person.edit": {
      const it = s.profile.person?.items.find((x) => x.id === a.id);
      if (!it) throw new Error("That isn't on your list any more.");
      const text = String(a.text ?? "").trim();
      if (!text) throw new Error("Write the line first.");
      if (text.length > 140) throw new Error("Keep it to 140 characters or fewer.");
      // The card may carry the old wording: drop it so it is never shown stale.
      if (s.profile.person) delete s.profile.person.card;
      // His own words now: confirmed, and as sure as something he said can be.
      it.text = text;
      it.source = "you_said";
      it.status = "confirmed";
      it.confidence = 0.9;
      it.confirmed = today();
      touched.add("profile");
      break;
    }
    case "word.set": {
      // Add or update single words. Same word (any case) updates in place; a rejected word never comes back; what the person confirmed is not changed by a guess.
      if (!Array.isArray(a.words) || !a.words.length) throw new Error("There is no word to save.");
      const CAP = { estimate: 0.5, observed: 0.7, you_said: 0.9 } as const;
      const per = (s.profile.person = s.profile.person ?? { items: [] });
      const list = (per.words = per.words ?? []);
      let took = 0;
      for (const w of a.words) {
        const word = String(w?.word ?? "").trim();
        if (!word || /\s/.test(word) || word.length > 24) throw new Error("Use one word, 24 characters or fewer.");
        if (!(w.source in CAP)) throw new Error("That isn't something I can save. Nothing was changed.");
        const cur = list.find((x) => x.word.toLowerCase() === word.toLowerCase());
        if (cur?.status === "rejected") continue;
        if (cur && cur.status === "confirmed" && w.source !== "you_said") continue;
        const weight = Math.min(5, Math.max(1, Math.round(Number(w.weight ?? 3)))) as 1 | 2 | 3 | 4 | 5;
        const confidence = Math.min(CAP[w.source], typeof w.confidence === "number" ? w.confidence : CAP[w.source]);
        const status = w.source === "you_said" ? "confirmed" : "proposed";
        const why = w.why ? String(w.why).slice(0, 140) : undefined;
        const next = { id: cur?.id ?? `W-w${String(Math.max(0, ...list.map((x) => Number(x.id.slice(3)) || 0)) + 1).padStart(2, "0")}`, word: cur?.word ?? word, weight, area: w.area, source: w.source, confidence, status, ...(why ? { why } : {}), ...(w.private ? { private: true } : {}) } as import("./types").PersonWord;
        if (cur) Object.assign(cur, next); else list.push(next);
        took++;
      }
      if (!took) throw new Error("Those words are ones you said aren't you, or already confirmed. Nothing was changed.");
      touched.add("profile");
      break;
    }
    case "word.confirm":
    case "word.reject": {
      const w = s.profile.person?.words?.find((x) => x.id === a.id);
      if (!w) throw new Error("That word isn't on your list any more.");
      // Rejected words stay on the list, so they are never added again.
      w.status = a.type === "word.confirm" ? "confirmed" : "rejected";
      touched.add("profile");
      break;
    }
    case "word.edit": {
      const list = s.profile.person?.words ?? [];
      const w = list.find((x) => x.id === a.id);
      if (!w) throw new Error("That word isn't on your list any more.");
      const word = String(a.word ?? "").trim();
      if (!word || /\s/.test(word) || word.length > 24) throw new Error("Use one word, 24 characters or fewer.");
      if (list.some((x) => x !== w && x.word.toLowerCase() === word.toLowerCase())) throw new Error("That word is already on your list.");
      // His own word now: confirmed, and as sure as something he said can be.
      w.word = word;
      w.source = "you_said";
      w.status = "confirmed";
      w.confidence = 0.9;
      touched.add("profile");
      break;
    }
    case "word.restore": {
      // One-step Undo for the word actions: the client keeps the previous version of the word.
      const w = a.word as unknown as { id?: string };
      const per = s.profile.person;
      if (!w || typeof w !== "object" || typeof w.id !== "string" || !per) throw new Error("There is nothing to bring back.");
      per.words = (per.words ?? []).filter((x) => x.id !== w.id).concat(a.word);
      touched.add("profile");
      break;
    }
    case "person.clear": {
      delete s.profile.person;
      touched.add("profile");
      break;
    }
    case "person.restore": {
      // One-step Undo for person.clear: the client keeps the previous person object; the whole-state validation below refuses a bad one.
      const p = a.person as unknown;
      if (!p || typeof p !== "object" || !Array.isArray((p as { items?: unknown }).items)) throw new Error("There is nothing to bring back.");
      s.profile.person = p as NonNullable<GrowthState["profile"]["person"]>;
      touched.add("profile");
      break;
    }
    case "pick.done": {
      const p = (s.library.picks ?? []).find((x) => x.id === a.id);
      if (!p) throw new Error("That pick isn't there any more.");
      p.status = "done";
      p.done = today();
      const note = a.note.trim();
      if (note) {
        p.note = note;
        p.ev = evId();
        s.evidence.entries.push({ id: p.ev, date: today(), type: "note", title: `From "${p.title}"`, detail: note, links: [p.url], competency: p.competency, ...(p.gap ? { gap: p.gap } : {}) });
        const g = p.gap ? s.library.gaps?.find((x) => x.id === p.gap) : undefined;
        if (g && g.status === "open") g.status = "closing";
        touched.add("evidence");
      }
      touched.add("library");
      break;
    }
    case "goal.set": {
      const role = a.role.trim();
      if (!role) throw new Error("Write the role you're aiming for.");
      if (!(a.salary > 0)) throw new Error("Add the monthly salary you're aiming for, in rupees.");
      const feelings = { right: "still feels right", too_far: "feels too far right now", not_mine: "isn't what he wants any more", higher: "he wants to aim higher" } as const;
      if (!Object.prototype.hasOwnProperty.call(feelings, a.feeling)) throw new Error("Pick how the goal feels.");
      const ns = s.profile.north_star;
      const before = `${ns.role}, ${formatMoney(ns.salary_inr_per_month, s.profile.situation?.currency ?? "INR", "month")}${ns.waypoint ? ` (stepping stone: ${ns.waypoint.role})` : ""}`;
      ns.role = role;
      ns.salary_inr_per_month = Math.round(a.salary);
      ns.feeling = a.feeling;
      if (a.waypoint?.role.trim()) ns.waypoint = { role: a.waypoint.role.trim(), ...(a.waypoint.salary ? { salary_inr_per_month: Math.round(a.waypoint.salary) } : {}) };
      else delete ns.waypoint;
      s.profile.goal_history = [...(s.profile.goal_history ?? []), { date: today(), role, salary_inr_per_month: ns.salary_inr_per_month, feeling: a.feeling, ...(a.note?.trim() ? { note: a.note.trim() } : {}), ...(ns.waypoint ? { waypoint: ns.waypoint.role } : {}) }];
      const after = `${role}, ${formatMoney(ns.salary_inr_per_month, s.profile.situation?.currency ?? "INR", "month")}${ns.waypoint ? ` (stepping stone first: ${ns.waypoint.role})` : ""}`;
      s.queue.items.push({ id: qId(), type: "goal", status: "pending", created: today(), request: `The person updated his goal. Before: ${before}. Now: ${after}. He says the goal ${feelings[a.feeling]}.${a.note?.trim() ? ` His words: "${a.note.trim()}".` : ""} Follow the growth-coach goal protocol: re-order gaps and next week around it, and reply with what changes and why.` });
      touched.add("profile").add("queue");
      break;
    }
    case "recall.mark": {
      if (!s.evidence.entries.some((e) => e.id === a.id)) throw new Error("That note isn't there any more.");
      s.profile.recall = s.profile.recall ?? {};
      const cur = s.profile.recall[a.id]?.step ?? 0;
      // "Still true" pushes it further out; "I'd add to it" keeps the same interval so it comes back again.
      s.profile.recall[a.id] = { step: a.kept ? Math.min(cur + 1, 4) : cur, last: today() };
      touched.add("profile");
      break;
    }
    case "pace.set": {
      if (!["lighter", "steady", "push"].includes(a.pace)) throw new Error("Pick a pace.");
      s.profile.pace = a.pace;
      touched.add("profile");
      break;
    }
    case "gap.move": {
      const gaps = s.library.gaps ?? [];
      const live = gaps.filter((g) => g.status !== "closed");
      const i = live.findIndex((g) => g.id === a.id);
      if (i < 0) throw new Error("That gap isn't there any more.");
      const track = live[i].track ?? "skill";
      let j = a.dir === "up" ? i - 1 : i + 1;
      while (j >= 0 && j < live.length && (live[j].track ?? "skill") !== track) j += a.dir === "up" ? -1 : 1;
      if (j < 0 || j >= live.length) break;
      [live[i], live[j]] = [live[j], live[i]];
      s.library.gaps = [...live, ...gaps.filter((g) => g.status === "closed")];
      touched.add("library");
      break;
    }
    case "picks.request": {
      if (!s.queue.items.some((q) => q.status === "pending" && q.type === "picks")) {
        s.queue.items.push({ id: qId(), type: "picks", status: "pending", created: today(), request: `Pick what's worth the person's time this week (focus: ${s.week.focus}). Follow the growth-coach library protocol.` });
        touched.add("queue");
      }
      break;
    }
    // ---- Plan engine. None of these touches week.json except plan.project_week. The validator below refuses any that leave an error. ----
    case "plan.set": {
      const p = a.plan as unknown;
      if (!p || typeof p !== "object" || Array.isArray(p) || typeof (p as { tasks?: unknown }).tasks !== "object") throw new Error("That isn't a plan. Nothing was changed.");
      const r = preserveTaskStatus(s.plan, a.plan);
      if (r.problems.length) throw new Error(`${r.problems.join("; ")}. Nothing was changed.`);
      s.plan = r.plan as unknown as GrowthState["plan"];
      touched.add("plan");
      break;
    }
    case "demands.set": {
      const d = a.demands as unknown;
      if (!d || typeof d !== "object" || !Array.isArray((d as { items?: unknown }).items)) throw new Error("That isn't a list of demands. Nothing was changed.");
      s.demands = a.demands;
      touched.add("demands");
      break;
    }
    case "research.add": {
      if (!Array.isArray(a.items) || !a.items.length) throw new Error("There is no research to add. Nothing was changed.");
      const m = mergeResearch(s.research?.items as unknown as Record<string, unknown>[] | undefined, a.items as unknown as Record<string, unknown>[], today());
      if (m.problems.length) throw new Error(`${m.problems.slice(0, 4).join("; ")}. Nothing was changed.`);
      if (!m.added.length && !m.updated.length) throw new Error(`Nothing new to add (${m.skipped.map((x) => `${x.id}: ${x.why}`).join("; ")}).`);
      s.research = { updated: today(), items: m.items as unknown as NonNullable<GrowthState["research"]>["items"] };
      touched.add("research");
      break;
    }
    case "sources.set": {
      const x = a.sources as unknown;
      if (!x || typeof x !== "object" || !Array.isArray((x as { topics?: unknown }).topics)) throw new Error("That isn't a list of sources. Nothing was changed.");
      s.sources = a.sources;
      touched.add("sources");
      break;
    }
    case "run.log": {
      const r = appendRun(s.runs, a.run as unknown as Record<string, unknown>);
      if (r.problems.length) throw new Error(`${r.problems.join("; ")}. Nothing was changed.`);
      s.runs = r.runs as unknown as GrowthState["runs"];
      touched.add("runs");
      break;
    }
    case "review.set": {
      const r = appendReview(s.reviews, a.review as unknown as Record<string, unknown>);
      if (r.problems.length) throw new Error(`${r.problems.join("; ")}. Nothing was changed.`);
      s.reviews = r.reviews as unknown as GrowthState["reviews"];
      touched.add("reviews");
      break;
    }
    case "plan.project_week": {
      const r = projectWeek(s.week as unknown as Record<string, unknown>, s.plan as unknown as Record<string, unknown> | undefined);
      if (r.problems.length) throw new Error(`${r.problems.slice(0, 4).join("; ")}. Nothing was changed.`);
      s.week = r.week as unknown as GrowthState["week"];
      touched.add("week");
      break;
    }
    case "onboard.answer":
    case "onboard.confirm":
    case "onboard.skip":
    case "onboard.consent":
    case "onboard.round":
    case "onboard.pause":
    case "onboard.contradiction":
    case "onboard.research":
    case "onboard.rubric":
    case "onboard.map":
    case "onboard.rating":
    case "onboard.forget":
    case "onboard.boundary":
    case "onboard.redact":
    case "onboard.skip_round":
    case "unknown.add":
    case "unknown.resolve":
      for (const f of applyOnboardingAction(a, s as unknown as Record<string, unknown>, today())) touched.add(f as DataFile);
      break;
    // ---- CV and case studies. applyCareerAction runs the shape rules and the honesty check; the html is written after the whole state validates. ----
    case "cv.version.add":
    case "cv.section.set":
    case "cv.fill":
    case "cv.current":
    case "cv.ats.set":
    case "case.set":
    case "case.remove":
    case "evidence.note": {
      // cv.restore is not here: it is for scripts/cv-act.mjs only. The app undoes a CV change through its snapshots.
      const ts = applyCareerAction(a as unknown as { type: string }, s as unknown as Record<string, unknown>, { dataDir: DATA, today: today() });
      for (const f of ts) touched.add(f as DataFile);
      cvWrites = ts.writes;
      break;
    }
    default:
      throw new Error("Unknown action. Nothing was changed.");
  }

  const { errors } = validate(s as unknown as Record<string, unknown>);
  if (errors.length) throw new Error(`That would leave your data in a bad state (${errors[0]}). Nothing was changed.`);
  if (cvWrites.length) writeCvFiles(path.dirname(DATA), cvWrites);
  await Promise.all([...touched].map((f) => write(f, s[f])));
  return s;
}
