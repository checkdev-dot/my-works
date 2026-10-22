// Makes one CV version the canonical CV: cv/CV.html and cv/CV.pdf. The only way those two files change.
// Run: node scripts/cv-promote.mjs --version vN [--data-dir D] [--dossier P] [--denylist P]
//      node scripts/cv-promote.mjs --undo [--data-dir D]
// Order: honesty check (must pass) -> no fact still needed (placeholders must be 0) -> the version must have a PDF, saved after its last
// change (run cv-export first) -> the current canonical html and pdf are copied to cv/drafts/_replaced/<date>/ (verified by size) ->
// vN is written to the canonical names -> career.json marks vN promoted.
// --undo puts the newest cv/drafts/_replaced/<date>/ folder back as the canonical html and pdf (what it replaces is kept in that folder
// as undone_*, and the folder is renamed <date>.used so a second --undo goes one step further back). Each backup folder holds _what.json
// with `replaced_version`: the version that was marked promoted when it was backed up. --undo marks that version promoted again, and
// clears the mark only when there was none.
import "./_no-people.mjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderCv } from "../lib/career-render.mjs";
import { makeContext, checkVersion, explain } from "../lib/career-honesty.mjs";
import { appDirOf } from "../lib/career.mjs";
import { runCareerActions } from "./cv-act.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const dataDir = path.resolve(flag("--data-dir") || path.join(APP, "data"));
const appDir = appDirOf(dataDir);
const say = (o, code = 0) => { console.log(JSON.stringify(o)); process.exit(code); };
// Anything unexpected becomes one plain sentence, never a stack trace.
process.on("uncaughtException", (e) => say({ ok: false, message: `That did not work (${e && e.code ? e.code : "a file error"}). Close the CV files if they are open and try again. Check cv/CV.pdf is the CV you expect.` }, 1));

// ---- --undo -----------------------------------------------------------------------------------------------------------------------
if (args.includes("--undo")) {
  const rep = path.join(appDir, "cv", "drafts", "_replaced");
  let folders = [];
  try { folders = fs.readdirSync(rep, { withFileTypes: true }).filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}(-\d{6})?$/.test(e.name)).map((e) => e.name).sort(); } catch { /* none */ }
  if (!folders.length) say({ ok: false, message: "There is nothing to undo: no earlier CV was backed up. Nothing was changed." }, 1);
  const name = folders[folders.length - 1];
  const from = path.join(rep, name);
  const canonDir = path.join(appDir, "cv");
  const restored = [];
  try {
    for (const f of ["CV.html", "CV.pdf"]) {
      const cur = path.join(canonDir, f);
      const bak = path.join(from, f);
      if (fs.existsSync(cur)) fs.copyFileSync(cur, path.join(from, `undone_${f}`));
      if (fs.existsSync(bak)) {
        fs.copyFileSync(bak, `${cur}.tmp`);
        if (fs.statSync(`${cur}.tmp`).size !== fs.statSync(bak).size) { fs.rmSync(`${cur}.tmp`, { force: true }); say({ ok: false, message: `Putting ${f} back did not verify. Nothing was changed.` }, 1); }
        fs.renameSync(`${cur}.tmp`, cur);
        restored.push(f);
      } else if (fs.existsSync(cur)) {
        fs.rmSync(cur, { force: true }); // there was none before that promotion
      }
    }
  } catch (e) {
    say({ ok: false, restored, message: `I could not put the earlier CV back (${e && e.code ? e.code : "a file error"}). Close the CV files if they are open, then try again. Some files may already be back; career.json was not changed.` }, 1);
  }
  // The folder is marked used under a name that is never taken (a second promote and undo on the same day made the same name twice).
  let usedAs = null;
  try {
    const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
    let target = `${from}.used`;
    if (fs.existsSync(target)) target = `${from}-${ts}.used`;
    for (let i = 2; fs.existsSync(target); i++) target = `${from}-${ts}-${i}.used`;
    fs.renameSync(from, target);
    usedAs = target;
  } catch { /* the files are back; the folder just stays where it is */ }
  // The promoted mark is cleared whether or not the rename worked: the canonical files are the earlier ones now.
  let cleared = true;
  if (fs.existsSync(path.join(dataDir, "career.json"))) {
    // The version those files came from is promoted again; with none recorded (or one that no longer exists) the mark is cleared.
    let back = null;
    try { const w = JSON.parse(fs.readFileSync(path.join(usedAs || from, "_what.json"), "utf8")); if (typeof w.replaced_version === "string") back = w.replaced_version; } catch { /* no record */ }
    let rec = runCareerActions([{ type: "cv.promote.mark", id: back }], { dataDir, internal: true, by: "Claude (cv-promote)" });
    if (!rec.ok && back) rec = runCareerActions([{ type: "cv.promote.mark", id: null }], { dataDir, internal: true, by: "Claude (cv-promote)" });
    cleared = rec.ok;
  }
  say({ ok: true, restored, from: path.relative(appDir, from).replace(/\\/g, "/"), message: `The earlier CV is back as cv/CV.html and .pdf (from ${name}).${usedAs ? "" : " The backup folder could not be marked as used, so the next undo may offer it again."}${cleared ? "" : " career.json could not be updated; run it again."}` });
}

let career;
try { career = JSON.parse(fs.readFileSync(path.join(dataDir, "career.json"), "utf8")); } catch { say({ ok: false, message: "There is no CV yet (career.json is missing or unreadable). Nothing was changed." }, 1); }
const id = flag("--version");
if (!id) say({ ok: false, message: "Say which version: --version vN. Nothing was changed." }, 1);
const v = career.cv.versions.find((x) => x.id === id);
if (!v) say({ ok: false, message: `There is no CV version ${id}. Nothing was changed.` }, 1);

const r = checkVersion(v, makeContext({ dataDir, dossierPath: flag("--dossier"), denylistPath: flag("--denylist") }));
if (!r.pass) say({ ok: false, message: `${v.id} does not pass the honesty check, so it is not promoted: ${explain(r)}.` }, 1);
if (args.includes("--allow-placeholders")) say({ ok: false, message: "--allow-placeholders no longer exists: a CV with facts still needed is never made the main CV. Fill them in first. Nothing was changed." }, 1);
if (r.placeholders > 0) say({ ok: false, message: `${v.id} still needs ${r.placeholders} fact${r.placeholders === 1 ? "" : "s"}. Fill ${r.placeholders === 1 ? "it" : "them"} first. Nothing was changed.` }, 1);
if (!v.pdf) say({ ok: false, message: `${v.id} has no PDF yet. Save it as a PDF first (cv-export), then promote. Nothing was changed.` }, 1);
const srcPdf = path.join(appDir, ...v.pdf.split("/"));
if (!fs.existsSync(srcPdf) || fs.statSync(srcPdf).size <= 0) say({ ok: false, message: `The PDF ${v.pdf} is missing on disk. Save it again first. Nothing was changed.` }, 1);
if (v.changed && fs.statSync(srcPdf).mtimeMs < Date.parse(v.changed)) say({ ok: false, message: `The PDF of ${v.id} is older than your last change to it. Save it as a PDF again (cv-export), then promote. Nothing was changed.` }, 1);

const canonHtml = path.join(appDir, "cv", "CV.html");
const canonPdf = path.join(appDir, "cv", "CV.pdf");
// 1. Back up what is there now. The version marked promoted now is the one these files came from: it is recorded in _what.json.
let backup = null;
const replacedVersion = (career.cv.versions.find((x) => x.promoted === true) || {}).id || null;
const day = new Date().toLocaleDateString("en-CA");
let dir = path.join(appDir, "cv", "drafts", "_replaced", day);
if (fs.existsSync(dir)) dir = `${dir}-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "").slice(8)}`;
for (const f of [canonHtml, canonPdf]) {
  if (!fs.existsSync(f)) continue;
  fs.mkdirSync(dir, { recursive: true });
  const to = path.join(dir, path.basename(f));
  fs.copyFileSync(f, to);
  if (fs.statSync(to).size !== fs.statSync(f).size) say({ ok: false, message: `The backup of ${path.basename(f)} did not verify. Nothing was changed.` }, 1);
  backup = dir;
}
if (backup) fs.writeFileSync(path.join(backup, "_what.json"), JSON.stringify({ replaced_version: replacedVersion, promoted_version: v.id, at: new Date().toISOString() }));
// 2. Write the canonical files (no draft stamp: placeholders, if allowed, stay visible in the text).
fs.writeFileSync(`${canonHtml}.tmp`, renderCv(v, { stamp: false }));
fs.renameSync(`${canonHtml}.tmp`, canonHtml);
fs.copyFileSync(srcPdf, `${canonPdf}.tmp`);
fs.renameSync(`${canonPdf}.tmp`, canonPdf);
// 3. Record it.
// One record-only call: the promotion mark, and today's honesty result in the stored checks.
const rec = runCareerActions([{ type: "cv.promote.mark", id: v.id }, { type: "cv.checks.set" }], { dataDir, dossierPath: flag("--dossier"), denylistPath: flag("--denylist"), internal: true, by: "Claude (cv-promote)" });
if (!rec.ok) say({ ok: false, message: `The files were written but career.json could not be updated: ${rec.message}. The earlier files are in ${backup}.` }, 1);
// A tailored version is fitted to one employer: say so, because it now becomes the main CV file.
const tailoredFor = v.target && typeof v.target.company === "string" && v.target.company.trim() ? v.target.company.trim() : null;
const tailoredLine = tailoredFor ? `This version was tailored for ${tailoredFor}. It becomes your main CV file.` : null;
// Warnings are not refusals, but they are never hidden: each is printed (stderr), counted in the message and listed in the result.
const warns = r.warnings || [];
for (const w of warns) console.error(`warning: ${w}`);
const warnLine = warns.length ? ` ${warns.length} line${warns.length === 1 ? " says" : "s say"} something its source may not. Look at ${warns.length === 1 ? "it" : "them"}: cv-check lists each one.` : "";
say({ ok: true, version: v.id, backup: backup ? path.relative(appDir, backup).replace(/\\/g, "/") : null, ...(tailoredLine ? { tailored_for: tailoredFor, note: tailoredLine } : {}), warnings: warns, message: `${v.id} is now cv/CV.html and .pdf.${tailoredLine ? ` ${tailoredLine}` : ""}${backup ? ` The earlier files are in ${path.relative(appDir, backup).replace(/\\/g, "/")}.` : ""}${warnLine}` });
