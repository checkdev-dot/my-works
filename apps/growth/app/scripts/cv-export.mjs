// Saves one CV version as a PDF with headless Edge (no installs): cv/drafts/CV_vN.pdf, and records it in career.json (pdf).
// Run: node scripts/cv-export.mjs [--version vN] [--draft] [--data-dir D] [--dossier P] [--denylist P] [--edge path-to-msedge.exe]
//   npm run cv:export -- --version v1 --draft
// It refuses when the honesty check fails. When facts are still needed (placeholders), it exports only with --draft and
// stamps the footer "Draft: N facts still needed". It never touches cv/CV.html or .pdf (that is cv-promote).
// Edge is told to use a fresh profile folder, so an Edge window that is already open cannot swallow the call.
import "./_no-people.mjs";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { spawnSync } from "child_process";
import { renderCv } from "../lib/career-render.mjs";
import { makeContext, checkVersion, explain } from "../lib/career-honesty.mjs";
import { writeCvFiles, appDirOf } from "../lib/career.mjs";
import { runCareerActions } from "./cv-act.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const dataDir = path.resolve(flag("--data-dir") || path.join(APP, "data"));
const appDir = appDirOf(dataDir);
const say = (o, code = 0) => { console.log(JSON.stringify(o)); process.exit(code); };

function findEdge(given) {
  const cands = [given, process.env.GROWTH_EDGE,
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe")].filter(Boolean);
  return cands.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}

let career;
try { career = JSON.parse(fs.readFileSync(path.join(dataDir, "career.json"), "utf8")); } catch { say({ ok: false, message: "There is no CV yet (career.json is missing or unreadable). Nothing was exported." }, 1); }
const id = flag("--version") || career.cv.current;
const v = career.cv.versions.find((x) => x.id === id);
if (!v) say({ ok: false, message: id ? `There is no CV version ${id}. Nothing was exported.` : "There is no current CV. Nothing was exported." }, 1);

const ctx = makeContext({ dataDir, dossierPath: flag("--dossier"), denylistPath: flag("--denylist") });
const r = checkVersion(v, ctx);
if (!r.pass) say({ ok: false, message: `${v.id} does not pass the honesty check, so it is not exported: ${explain(r)}.` }, 1);
if (r.placeholders > 0 && !args.includes("--draft")) say({ ok: false, message: `${v.id} still needs ${r.placeholders} fact${r.placeholders === 1 ? "" : "s"}. Fill ${r.placeholders === 1 ? "it" : "them"} first, or export a draft with --draft (the footer will say so).` }, 1);

const edge = findEdge(flag("--edge"));
if (!edge) say({ ok: false, message: "Microsoft Edge was not found under Program Files. Open the CV in the app and use Print or save as PDF instead." }, 1);

// Fresh render (stamped when facts are still needed) written to the draft file, then printed from that file.
const html = renderCv(v, { stamp: r.placeholders > 0 });
writeCvFiles(appDir, [{ rel: v.file, text: html }]);
const htmlAbs = path.join(appDir, ...v.file.split("/"));
const pdfRel = v.file.replace(/\.html$/, ".pdf");
const pdfAbs = path.join(appDir, ...pdfRel.split("/"));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "growth-edge-"));
try { fs.rmSync(pdfAbs, { force: true }); } catch { /* new */ }
const run = spawnSync(edge, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, `--print-to-pdf=${pdfAbs}`, pathToFileURL(htmlAbs).href], { timeout: 90000, stdio: "pipe" });
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* temp */ }
let size = 0;
try { size = fs.statSync(pdfAbs).size; } catch { /* none */ }
if (size <= 0) say({ ok: false, message: `Edge did not write the PDF (exit ${run.status}${run.error ? `, ${run.error.message}` : ""}). Nothing was recorded.` }, 1);

// One record-only call: the pdf, and today's honesty result in the stored checks (so the app never shows an older one).
const rec = runCareerActions([{ type: "cv.pdf.set", version: v.id, pdf: pdfRel }, { type: "cv.checks.set" }], { dataDir, dossierPath: flag("--dossier"), denylistPath: flag("--denylist"), internal: true, by: "Claude (cv-export)" });
if (!rec.ok) say({ ok: false, message: `The PDF was written to ${pdfRel} but could not be recorded: ${rec.message}` }, 1);
const warns = r.warnings || [];
for (const w of warns) console.error(`warning: ${w}`);
const warnLine = warns.length ? ` ${warns.length} line${warns.length === 1 ? " says" : "s say"} something its source may not. Look at ${warns.length === 1 ? "it" : "them"}: cv-check lists each one.` : "";
say({ ok: true, version: v.id, pdf: pdfRel, bytes: size, draft: r.placeholders > 0, placeholders: r.placeholders, warnings: warns, message: `Saved ${pdfRel}${r.placeholders > 0 ? ` as a draft (${r.placeholders} fact${r.placeholders === 1 ? "" : "s"} still needed)` : ""}.${warnLine}` });
