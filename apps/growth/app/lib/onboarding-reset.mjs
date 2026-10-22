// Archive-then-blank for `growth start`, and the way back. Node only (fs, crypto). Used by scripts/onboarding-reset.mjs
// and by the store action onboard.reset. Nothing here deletes anything under data/.backups.
//
//   planReset(dataDir)                      dry run: reads, writes nothing, returns the report and a token
//   applyReset({ dataDir, token, phrase })  verify, back up with a hashed MANIFEST, archive, blank, validate, auto-restore on failure
//   restoreBackup({ dataDir, from })        verify the MANIFEST, back up the current state, put the files back byte for byte
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { FILES, OPTIONAL_FILES, validate } from "./validate.mjs";
import { newOnboarding } from "./onboarding.mjs";
import { GENERIC_RUBRIC } from "./onboarding-bank.mjs";

export const PHRASE = "ERASE MY GROWTH DATA AND START OVER";
export const PHRASE_SHA1 = crypto.createHash("sha1").update(PHRASE).digest("hex");
export const TOKEN_TTL_MIN = 15;
const SALT = "growth-onboarding-reset-v1";
const LOCK_FRESH_MIN = 30;
const SKIP_TOP = new Set([".backups", ".lock"]);
const ALL = [...FILES, ...OPTIONAL_FILES];

const sha1 = (b) => crypto.createHash("sha1").update(b).digest("hex");

/**
 * Where backups live. Default: <dataDir>/.backups (unchanged). With the environment variable GROWTH_BACKUP_DIR set to a folder
 * OUTSIDE a synced path (a folder under a cloud-synced path uploads every answer, finance and Round 3 line in every copy), backups go to
 * <GROWTH_BACKUP_DIR>/<ten characters of the data folder's hash>/. The hash keeps two data folders from sharing one backup tree.
 */
export function backupRoot(dataDir) {
  const e = process.env.GROWTH_BACKUP_DIR;
  // On Windows the same folder can arrive as c:\ or C:\ (the app's cwd, the script's file URL): hash one spelling.
  const key = process.platform === "win32" ? path.resolve(dataDir).toLowerCase() : path.resolve(dataDir);
  if (typeof e === "string" && e.trim()) return path.join(path.resolve(e.trim()), sha1(key).slice(0, 10));
  return path.join(dataDir, ".backups");
}
const iso = (d) => d.toISOString();
const localDay = (d) => d.toLocaleDateString("en-CA");
const stamp = (d) => { const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

/** Every file under dataDir (relative, forward slashes, sorted), skipping .backups and .lock at the top. */
export function listTree(dataDir) {
  const out = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!rel && SKIP_TOP.has(e.name)) continue;
      if (e.name.endsWith(".tmp")) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else out.push(r);
    }
  };
  if (fs.existsSync(dataDir)) walk(dataDir, "");
  return out.sort();
}

/** Digest of the top level JSON files: if any changes between plan and apply, the token no longer matches. */
export function dataDigest(dataDir) {
  const lines = fs.readdirSync(dataDir).filter((n) => n.endsWith(".json")).sort().map((n) => `${n}:${sha1(fs.readFileSync(path.join(dataDir, n)))}`);
  return sha1(lines.join("\n"));
}

export function readAll(dataDir) {
  const d = {};
  const errors = [];
  for (const f of ALL) {
    const p = path.join(dataDir, `${f}.json`);
    if (!fs.existsSync(p)) { if (FILES.includes(f)) errors.push(`${f}.json is missing`); continue; }
    try { d[f] = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { errors.push(`${f}.json is not valid JSON (${e.message})`); }
  }
  return { d, errors };
}

export function makeToken(dataDir, now = new Date()) {
  const ts = String(now.getTime());
  const dig = dataDigest(dataDir);
  return `v1.${ts}.${dig.slice(0, 12)}.${sha1(`${ts}|${dig}|${SALT}`).slice(0, 16)}`;
}
export function parseToken(token) {
  const m = /^v1\.(\d{10,})\.([0-9a-f]{12})\.([0-9a-f]{16})$/.exec(String(token || ""));
  return m ? { ts: Number(m[1]), digest12: m[2], sig: m[3] } : null;
}
/** Returns { ok, reason, backupName, ts }. */
export function verifyToken(dataDir, token, now = new Date()) {
  const t = parseToken(token);
  if (!t) return { ok: false, reason: "That token is not one the plan step produced. Run the plan step again." };
  const backupName = `onboarding-${stamp(new Date(t.ts))}`;
  if (now.getTime() - t.ts > TOKEN_TTL_MIN * 60000) return { ok: false, reason: `The token is older than ${TOKEN_TTL_MIN} minutes. Run the plan step again.`, backupName, expired: true };
  if (t.ts - now.getTime() > 60000) return { ok: false, reason: "The token is from the future. Run the plan step again." };
  const dig = dataDigest(dataDir);
  if (sha1(`${t.ts}|${dig}|${SALT}`).slice(0, 16) !== t.sig || dig.slice(0, 12) !== t.digest12) return { ok: false, reason: "Your data changed since the plan step, or the token was not made for it. Run the plan step again.", backupName, changed: true };
  return { ok: true, backupName, ts: t.ts };
}

const strip = (o, keys) => { const c = { ...o }; for (const k of keys) delete c[k]; return c; };

/** The blank state. Returns { files: { name: object | null }, prior }. null means the file is removed (absent is valid). */
export function buildSkeleton(d, { now = new Date(), backupName = "", differentPerson = false, samePerson = false } = {}) {
  const today = localDay(now);
  const p = d.profile || {};
  const priorProfile = strip(p, ["modules"]);
  const prior = {
    archived: iso(now), backup: backupName,
    note: "Read only. Nothing here is current until the person confirms it or answers again.",
    profile: priorProfile,
    evidence: ((d.evidence && d.evidence.entries) || []).map((e) => ({ ...e, prior: true })),
    ratings: (d.skills && d.skills.ratings) || {},
    gaps: (d.library && d.library.gaps) || [],
    reach: d.reach || {},
    rubric: d.rubric || {},
    confirmed: {},
  };
  // CV versions and case studies are archived too (only when there are any), and the live file is blanked. The files under cv/ are never touched.
  const hasCareer = d.career && typeof d.career === "object";
  if (hasCareer) prior.career = d.career;
  if (d.prior && typeof d.prior === "object") prior.earlier = [...(Array.isArray(d.prior.earlier) ? d.prior.earlier : []), strip(d.prior, ["earlier"])];
  const lib = d.library || {};
  // The old rubric is archived (prior.rubric). The live rubric is a generic placeholder until Round 2 writes the researched one,
  // so a pick or trinket may not keep a competency id that belongs to the old ladder: it is cleared and marked for review.
  const noGap = (x) => { const c = { ...x }; delete c.gap; delete c.task; delete c.competency; return c; };
  // A different person (the dossier owner's name and reading list are not theirs): the name is not kept, and the picks and
  // trinkets are archived in prior.json and left out of the live library. Nothing is deleted.
  const library = {
    ...strip(lib, ["gaps", "forecast"]),
    picks: differentPerson ? [] : (lib.picks || []).map((x) => ({ ...noGap(x), needs_review: true })),
    gaps: [],
  };
  if (Array.isArray(lib.trinkets)) library.trinkets = differentPerson ? [] : lib.trinkets.map(noGap);
  // R0-04 shows the archived facts back to him only when he is the same person: an explicit yes at reset (critique 5, P2). A reset with
  // neither flag does not show a previous owner's role, target, pay or hours to someone who may be a stranger.
  if (samePerson && !differentPerson) prior.same_person = true;
  if (differentPerson) { prior.different_person = true; prior.library_picks = lib.picks || []; prior.library_trinkets = lib.trinkets || []; }
  const rubric = JSON.parse(JSON.stringify(GENERIC_RUBRIC));
  const files = {
    profile: {
      name: differentPerson ? "" : p.name, updated: today, role_now: "", positioning: "",
      north_star: { role: "", salary_inr_per_month: 0, recognition: [] },
      constraints: { hours_per_day: 1, skips_allowed: true, learns_best_by: "", avoid: [] },
      root_causes: {}, beliefs_to_test: [], intake: [], pace: "steady",
      person: { items: [], words: [] },
      ...(p.modules ? { modules: p.modules } : {}),
    },
    rubric,
    // Every page indexes ratings[competency], so the blank state carries a clearly marked placeholder per competency:
    // level 1 = not assessed, target = level (no gap is invented), confidence 0.1, source self. Round 2 replaces each from evidence.
    skills: {
      ...(d.skills && d.skills._about ? { _about: d.skills._about } : {}), updated: today,
      ratings: Object.fromEntries(rubric.competencies.map((c) => [c.id, {
        level: 1, target: 1, confidence: 0.1, source: "self", evidence: [], placeholder: true,
        note: "Not assessed yet. Round 2 rates this from evidence.",
        history: [{ date: today, level: 1, source: "self", reason: "Placeholder written by an onboarding reset. Not assessed yet.", placeholder: true }],
      }])),
    },
    evidence: { ...(d.evidence && d.evidence._about ? { _about: d.evidence._about } : {}), entries: [] },
    proof: { ...(d.proof && d.proof._about ? { _about: d.proof._about } : {}), updated: today, items: [] },
    reach: {
      ...(d.reach && d.reach._about ? { _about: d.reach._about } : {}), updated: today,
      funnel: { stages: (d.reach && d.reach.funnel && d.reach.funnel.stages) || [], batches: [], applications: [] },
      recognition: { linkedin_followers: [], inbound_messages: [], published: [], mentions_by_strangers: [] },
    },
    bets: { ...(d.bets && d.bets._about ? { _about: d.bets._about } : {}), updated: today, bets: [] },
    week: { ...(d.week && d.week._about ? { _about: d.week._about } : {}), week_of: d.week.week_of, focus: "", focus_short: "", tasks: [] },
    notnow: { ...(d.notnow && d.notnow._about ? { _about: d.notnow._about } : {}), updated: today, items: [] },
    queue: { ...(d.queue && d.queue._about ? { _about: d.queue._about } : {}), items: [] },
    learning: { ...(d.learning && d.learning._about ? { _about: d.learning._about } : {}), briefs: [] },
    tests: { ...(d.tests && d.tests._about ? { _about: d.tests._about } : {}), tests: [] },
    library,
    demands: null, plan: null, research: null, sources: null, runs: null, reviews: null,
    onboarding: newOnboarding(today, { backup: backupName, round: "R0" }),
    unknowns: { updated: today, items: [] },
    prior,
    ...(hasCareer ? { career: { updated: today, cv: { current: null, versions: [] }, cases: [] } } : {}),
  };
  return { files, prior };
}

function fullState(d, files) {
  const s = { ...d };
  for (const [k, v] of Object.entries(files)) { if (v === null) delete s[k]; else s[k] = v; }
  return s;
}

/** Dry run. Writes nothing. */
export function planReset(dataDir, { now = new Date() } = {}) {
  const { d, errors } = readAll(dataDir);
  const report = { dataDir, phrase: PHRASE, token: null, backup: `onboarding-${stamp(now)}`, ok: true, problems: [], notes: [], mid_interview: false, archive: [], blank: [], keep: [], queue_dropped: 0, existing_onboarding: d.onboarding ? d.onboarding.status : "none" };
  if (errors.length) { report.ok = false; report.problems.push(...errors.map((e) => `cannot read: ${e}`)); return report; }
  const v = validate(d);
  if (v.errors.length) { report.ok = false; report.problems.push(`npm run check fails on the current data (${v.errors.length} error(s), first: ${v.errors[0]}). Fix first; I will not archive broken data.`); }
  const lock = readLock(dataDir);
  if (lock) { report.ok = false; report.problems.push(`${lock.by} is updating your data right now (lock since ${lock.started}).`); }
  // Not a problem and not broken data: an interview is under way. Starting over is allowed with --force-new (force_new) and the phrase.
  if (d.onboarding && ["in_progress", "paused"].includes(d.onboarding.status)) {
    report.mid_interview = true;
    report.notes.push("An onboarding is already under way. To carry on, say resume growth start. To erase it and start over, apply with --force-new and the phrase (the interview so far is archived, never deleted).");
  }
  const n = (a) => (Array.isArray(a) ? a.length : 0);
  report.archive = [
    ["data/prior.json: profile (role, positioning, root causes, beliefs, intake, goal, constraints, pace, person)", 1],
    ["data/prior.json: evidence entries, each flagged prior", n(d.evidence && d.evidence.entries)],
    ["data/prior.json: skill ratings", Object.keys((d.skills && d.skills.ratings) || {}).length],
    ["data/prior.json: gaps", n(d.library && d.library.gaps)],
    ["data/prior.json: reach funnel (batches, applications, followers)", n(d.reach && d.reach.funnel && d.reach.funnel.batches)],
    ...((d.career && ((d.career.cv && d.career.cv.versions) || []).length + n(d.career.cases)) ? [["data/prior.json: CV versions and case studies (the html and pdf files under cv/ are not touched)", n(d.career.cv && d.career.cv.versions) + n(d.career.cases)]] : []),
    ["data/prior.json: rubric (a copy of the earlier ladder; the live rubric becomes a generic placeholder until Round 2 researches the real one for your target role)", n(d.rubric && d.rubric.competencies)],
  ].map(([what, count]) => ({ what, count }));
  report.blank = [
    ["profile.json: everything except name and installed add-ons", 1],
    ["skills.json: ratings replaced by marked placeholders (level 1, not assessed, confidence 0.1) so every page still renders", Object.keys((d.skills && d.skills.ratings) || {}).length],
    ["evidence.json: entries emptied", n(d.evidence && d.evidence.entries)],
    ["proof.json: items emptied", n(d.proof && d.proof.items)],
    ["bets.json: bets emptied", n(d.bets && d.bets.bets)],
    ["week.json: tasks emptied", n(d.week && d.week.tasks)],
    ["notnow.json: items emptied", n(d.notnow && d.notnow.items)],
    ["learning.json and tests.json: emptied", n(d.learning && d.learning.briefs) + n(d.tests && d.tests.tests)],
    ["rubric.json: replaced by a generic placeholder (one competency) until Round 2 writes the researched rubric", n(d.rubric && d.rubric.competencies)],
    ["library.json: gaps emptied, picks kept and marked needs_review", n(d.library && d.library.gaps)],
    ["reach.json: batches and applications emptied", n(d.reach && d.reach.funnel && d.reach.funnel.batches) + n(d.reach && d.reach.funnel && d.reach.funnel.applications)],
    ["queue.json: emptied (pending requests are dropped)", n(d.queue && d.queue.items)],
    ["demands, plan, research, sources, runs, reviews: removed (absent is valid)", ["demands", "plan", "research", "sources", "runs", "reviews"].filter((f) => d[f]).length],
  ].map(([what, count]) => ({ what, count }));
  report.queue_dropped = ((d.queue && d.queue.items) || []).filter((q) => q.status === "pending").length;
  report.keep = [
    "Dossier, cv/, research/ folders (read as prior knowledge, never changed)",
    "profile.json name and installed add-ons (modules). The name is kept for the person who owns the dossier only: if this is someone else, apply with --different-person (the name, picks and trinkets are then archived, not kept). For the owner, R0-04 asks 'is this still you?' for the name.",
    "library picks, left out items and trinkets (marked needs_review, competency cleared)",
    "uploads/, .cache, data/.backups and every earlier backup",
  ];
  report.backup_contents = `every file under data/ except .backups and .lock (${listTree(dataDir).length} files), with a sha1 MANIFEST checked by read-back`;
  if (report.ok) report.token = makeToken(dataDir, now);
  return report;
}

function readLock(dataDir) {
  try {
    const l = JSON.parse(fs.readFileSync(path.join(dataDir, ".lock"), "utf8"));
    const started = l.started ? new Date(l.started) : null;
    if (!started || Number.isNaN(started.getTime())) return null;
    if (Date.now() - started.getTime() > LOCK_FRESH_MIN * 60000) return null;
    return { by: l.by || "Claude", started: l.started };
  } catch { return null; }
}

function copyTree(src, dst, files) {
  for (const rel of files) {
    const to = path.join(dst, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(src, rel), to);
  }
}

/** Copies the tree to <dataDir>/.backups/<name>/, writes MANIFEST.json and verifies it by reading every copy back. */
export function backupAll(dataDir, name, now = new Date()) {
  const dst = path.join(backupRoot(dataDir), name);
  if (fs.existsSync(dst)) throw new Error(`The backup folder ${name} already exists. Nothing was changed.`);
  const files = listTree(dataDir);
  copyTree(dataDir, dst, files);
  const manifest = { created: iso(now), source: path.resolve(dataDir), count: files.length, files: files.map((rel) => { const b = fs.readFileSync(path.join(dataDir, rel)); return { path: rel, sha1: sha1(b), bytes: b.length }; }) };
  fs.writeFileSync(path.join(dst, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const bad = verifyManifest(dst);
  if (bad.length) throw new Error(`The backup did not verify (${bad.length} mismatch, first: ${bad[0]}). Nothing was changed.`);
  // The app's own undo set, so "undo" in the app also finds this moment.
  try {
    const set = path.join(backupRoot(dataDir), "_sets", iso(now).replace(/[:.]/g, "-"));
    fs.mkdirSync(set, { recursive: true });
    for (const f of ALL) { const p = path.join(dataDir, `${f}.json`); if (fs.existsSync(p)) fs.copyFileSync(p, path.join(set, `${f}.json`)); }
  } catch { /* the hashed backup above is the one that counts */ }
  return { dir: dst, manifest };
}

/** Returns a list of mismatches (empty = every file in the MANIFEST is present with the recorded sha1). */
export function verifyManifest(dir) {
  const bad = [];
  let m;
  try { m = JSON.parse(fs.readFileSync(path.join(dir, "MANIFEST.json"), "utf8")); } catch (e) { return [`MANIFEST.json unreadable (${e.message})`]; }
  for (const f of m.files) {
    const p = path.join(dir, f.path);
    if (!fs.existsSync(p)) { bad.push(`${f.path} is missing`); continue; }
    if (sha1(fs.readFileSync(p)) !== f.sha1) bad.push(`${f.path} differs`);
  }
  return bad;
}

function writeAtomic(p, text) {
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, p);
}

/** Puts the files of a backup folder back. Makes a pre-restore backup of the current state first. */
export function restoreBackup({ dataDir, from, now = new Date() }) {
  const dir = path.isAbsolute(from) ? from : path.join(backupRoot(dataDir), from);
  if (!fs.existsSync(dir)) throw new Error(`No backup folder at ${dir}.`);
  const bad = verifyManifest(dir);
  if (bad.length) throw new Error(`That backup does not verify (${bad[0]}). Nothing was changed.`);
  const m = JSON.parse(fs.readFileSync(path.join(dir, "MANIFEST.json"), "utf8"));
  let pre = null;
  try { pre = backupAll(dataDir, `pre-restore-${stamp(now)}`, now).dir; } catch (e) { if (!/already exists/.test(e.message)) throw e; }
  const keep = new Set(m.files.map((f) => f.path));
  // Only top level data files that were not in the backup are removed (the files a reset created). uploads and other folders are left alone.
  for (const rel of listTree(dataDir)) if (!rel.includes("/") && rel.endsWith(".json") && !keep.has(rel)) fs.rmSync(path.join(dataDir, rel), { force: true });
  copyTree(dir, dataDir, m.files.map((f) => f.path));
  const after = [];
  for (const f of m.files) if (sha1(fs.readFileSync(path.join(dataDir, f.path))) !== f.sha1) after.push(f.path);
  if (after.length) throw new Error(`Restore did not verify (${after[0]}). The pre-restore backup is ${pre}.`);
  return { restored: m.files.length, from: dir, pre_restore: pre };
}

/**
 * The only destructive step. Order: phrase, token, current data valid, lock, skeleton valid in memory, backup verified,
 * write, re-read and validate, auto-restore on any failure.
 */
export function applyReset({ dataDir, token, phrase, forceNew = false, differentPerson = false, samePerson = false, now = new Date(), inject = null }) {
  if (typeof phrase !== "string" || phrase !== PHRASE || sha1(phrase) !== PHRASE_SHA1) return { ok: false, code: "phrase", message: "That is not the phrase. Nothing changed." };
  const tv = verifyToken(dataDir, token, now);
  if (!tv.ok) {
    // Same plan applied twice: the data already changed, but the onboarding record names this backup.
    try {
      const o = JSON.parse(fs.readFileSync(path.join(dataDir, "onboarding.json"), "utf8"));
      if (tv.backupName && o.backup === tv.backupName) return { ok: true, code: "already_applied", message: `Already applied (${tv.backupName}). Nothing changed.`, backup: tv.backupName };
    } catch { /* not applied */ }
    return { ok: false, code: tv.expired ? "expired" : "token", message: tv.reason };
  }
  const { d, errors } = readAll(dataDir);
  if (errors.length) return { ok: false, code: "unreadable", message: `I will not archive data I cannot read: ${errors[0]}` };
  const v = validate(d);
  if (v.errors.length) return { ok: false, code: "check", message: `I will not archive broken data over a good backup: ${v.errors[0]}. Fix first.` };
  if (d.onboarding && ["in_progress", "paused"].includes(d.onboarding.status) && !forceNew) return { ok: false, code: "in_progress", message: "An onboarding is already under way. Resume it, or ask to start over with force_new." };
  const lock = readLock(dataDir);
  if (lock) return { ok: false, code: "lock", message: `${lock.by} is updating your data right now. Try again in a minute; nothing was changed.` };
  const { files } = buildSkeleton(d, { now, backupName: tv.backupName, differentPerson, samePerson });
  const pre = validate(fullState(d, files));
  if (pre.errors.length) return { ok: false, code: "skeleton", message: `The blank state would not validate (${pre.errors[0]}). Nothing was changed.` };

  const lockPath = path.join(dataDir, ".lock");
  fs.writeFileSync(lockPath, JSON.stringify({ by: "onboarding-reset", started: iso(now) }));
  let backup;
  try {
    backup = backupAll(dataDir, tv.backupName, now);
  } catch (e) {
    fs.rmSync(lockPath, { force: true });
    return { ok: false, code: "backup", message: e.message };
  }
  try {
    for (const [name, value] of Object.entries(files)) {
      const p = path.join(dataDir, `${name}.json`);
      if (value === null) fs.rmSync(p, { force: true });
      else writeAtomic(p, `${JSON.stringify(value, null, 2)}\n`);
    }
    if (inject === "post_write") throw new Error("injected failure after writing (test hook)");
    const again = readAll(dataDir);
    const post = again.errors.length ? { errors: again.errors } : validate(again.d);
    if (post.errors.length) throw new Error(`the blank state did not validate after writing (${post.errors[0]})`);
  } catch (e) {
    try { restoreBackup({ dataDir, from: backup.dir, now: new Date(now.getTime() + 1000) }); } catch (r) { fs.rmSync(lockPath, { force: true }); return { ok: false, code: "restore_failed", message: `${e.message}. Restore also failed: ${r.message}. The backup is ${backup.dir}.`, backup: backup.dir }; }
    fs.rmSync(lockPath, { force: true });
    return { ok: false, code: "restored", message: `${e.message}. Your data was restored from ${backup.dir}.`, backup: backup.dir };
  }
  fs.rmSync(lockPath, { force: true });
  return { ok: true, code: "applied", message: `Archived and blanked. Backup: ${backup.dir} (${backup.manifest.count} files, hashes verified).`, backup: tv.backupName, backup_dir: backup.dir, files: backup.manifest.count };
}
