// Makes a safe working copy of an installed add-on's skill files: modules/_scratch/<id>/.
// Run: node scripts/module-scratch.mjs <id> [--modules-dir D] [--data-dir D]      (prints one JSON line: { ok, path, removed, files })
//      node scripts/module-scratch.mjs --clean [--modules-dir D]                    (empties modules/_scratch)
// 1. Every file in modules/<id>/skill/ that has a recorded sha1 (modules/<id>/notes.md, and for SKILL.md also the entry in
//    data/profile.json modules.installed) is hashed. One mismatch and nothing is written: the file was changed after install.
//    SKILL.md must have a recorded sha1.
// 2. The flagged lines (notes.md "- line N: ...", "- SKILL.md:N: ..." lines, and the flagged texts of the profile entry) are replaced
//    in the copy by "[REMOVED: flagged]". The originals are never edited.
// 3. The copy is written to modules/_scratch/<id>/ (the folder is created, and emptied first if it exists). Empty it when done (--clean).
import "./_no-people.mjs";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const modulesDir = path.resolve(flag("--modules-dir") || path.join(APP, "modules"));
const dataDir = path.resolve(flag("--data-dir") || path.join(modulesDir, "..", "data"));
const say = (o, code = 0) => { console.log(JSON.stringify(o)); process.exit(code); };
const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex");
const scratchRoot = path.join(modulesDir, "_scratch");

if (args.includes("--clean")) {
  fs.rmSync(scratchRoot, { recursive: true, force: true });
  say({ ok: true, message: "modules/_scratch is empty." });
}

const id = args.find((x, i) => !x.startsWith("--") && !["--modules-dir", "--data-dir"].includes(args[i - 1]));
if (!id) say({ ok: false, message: "Say which add-on: node scripts/module-scratch.mjs <id>. Nothing was written." }, 1);
if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) say({ ok: false, message: `${id} is not an add-on id. Nothing was written.` }, 1);
const skillDir = path.join(modulesDir, id, "skill");
if (!fs.existsSync(skillDir)) say({ ok: false, message: `There is no add-on ${id} (no modules/${id}/skill). Nothing was written.` }, 1);

// ---- recorded hashes and flagged lines ---------------------------------------------------------------------------------------------
let notes = "";
try { notes = fs.readFileSync(path.join(modulesDir, id, "notes.md"), "utf8"); } catch { /* none */ }
let entry = null;
try {
  const prof = JSON.parse(fs.readFileSync(path.join(dataDir, "profile.json"), "utf8"));
  entry = ((prof.modules && prof.modules.installed) || []).find((m) => m && m.id === id) || null;
} catch { /* no profile: the notes alone must carry the hash */ }

const want = new Map(); // file name -> Set of recorded sha1
const addWant = (f, h) => { if (!want.has(f)) want.set(f, new Set()); want.get(f).add(h.toLowerCase()); };
for (const m of notes.matchAll(/sha1 of skill\/([\w.-]+):\s*([0-9a-f]{40})/gi)) addWant(m[1], m[2]);
for (const m of notes.matchAll(/^\s*-\s*skill\/([\w.-]+)\s+([0-9a-f]{40})\s*$/gim)) addWant(m[1], m[2]);
if (entry && typeof entry.sha1 === "string" && /^[0-9a-f]{40}$/i.test(entry.sha1)) addWant("SKILL.md", entry.sha1);

if (!want.has("SKILL.md")) say({ ok: false, message: `No recorded sha1 for modules/${id}/skill/SKILL.md in notes.md or the profile, so I cannot tell it is unchanged. Nothing was written.` }, 1);
const files = fs.readdirSync(skillDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
if (!files.includes("SKILL.md")) say({ ok: false, message: `modules/${id}/skill has no SKILL.md. Nothing was written.` }, 1);
for (const f of files) {
  const recorded = want.get(f);
  if (!recorded) continue; // LICENSE and other files with no recorded hash are not copied below
  const h = sha1(fs.readFileSync(path.join(skillDir, f)));
  if (![...recorded].every((x) => x === h)) say({ ok: false, message: `modules/${id}/skill/${f} has changed since it was installed (its sha1 is not the recorded one). Stop and ask the person before using it. Nothing was written.` }, 1);
}

// Flagged lines: the "Flagged lines" section of notes.md, in blocks (separated by a blank line). A block that says the person switched it back on
// is KEPT, not removed (it stays listed only so its limits are read with it). In the other blocks every "file.md:N", "file.md:N-M",
// "file.md:N, M" and, in a one-file note, "line N" is a line (or range) to remove.
const flagged = [];
let keptRaw = "";
{
  const at = notes.search(/^## Flagged lines/m);
  const rest = at >= 0 ? notes.slice(at).replace(/^## Flagged lines[^\n]*\n/, "") : "";
  const next = rest.search(/^## /m);
  const section = next >= 0 ? rest.slice(0, next) : rest;
  for (const block of section.split(/\r?\n[ \t]*\r?\n/)) {
    if (/switched back on/i.test(block)) { keptRaw += `\n${block}`; continue; }
    for (const ln of block.split(/\r?\n/)) {
      if (!/^\s*-\s/.test(ln)) continue;
      const single = /^\s*-\s*line\s+(\d+)\s*:/i.exec(ln);
      if (single) { flagged.push({ file: "SKILL.md", from: Number(single[1]), to: Number(single[1]) }); continue; }
      for (const t of ln.matchAll(/([\w.-]+\.md):(\d+(?:-\d+)?(?:(?:,\s*|\s+and\s+)\d+(?:-\d+)?)*)/g)) {
        for (const part of t[2].split(/,\s*|\s+and\s+/)) { const [x, y] = part.split("-").map(Number); flagged.push({ file: t[1], from: x, to: y || x }); }
      }
    }
  }
}
// flagged texts of the profile entry (matched anywhere in SKILL.md), except any that sit in a kept block
const texts = ((entry && entry.flagged) || []).filter((t) => typeof t === "string" && t.trim().length >= 8 && !keptRaw.includes(t.trim())).map((t) => t.trim());

// ---- the working copy ---------------------------------------------------------------------------------------------------------------
const out = path.join(scratchRoot, id);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const removed = [];
const warnings = [];
for (const f of files) {
  if (!want.has(f)) continue;
  const src = fs.readFileSync(path.join(skillDir, f), "utf8");
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const lines = src.split(/\r?\n/);
  const hit = new Set();
  for (const fl of flagged.filter((x) => x.file === f)) {
    for (let n = fl.from; n <= fl.to; n++) {
      if (n < 1 || n > lines.length) { warnings.push(`${f}:${n} is past the end of the file`); continue; }
      hit.add(n - 1);
    }
  }
  if (f === "SKILL.md") lines.forEach((ln, i) => { if (texts.some((t) => ln.includes(t))) hit.add(i); });
  for (const i of hit) { lines[i] = "[REMOVED: flagged]"; removed.push(`${f}:${i + 1}`); }
  fs.writeFileSync(path.join(out, f), lines.join(eol));
}
say({ ok: true, path: path.relative(APP, out).replace(/\\/g, "/").startsWith("..") ? out : path.relative(APP, out).replace(/\\/g, "/"), abs: out, removed, files: files.filter((f) => want.has(f)), ...(warnings.length ? { warnings } : {}) });
