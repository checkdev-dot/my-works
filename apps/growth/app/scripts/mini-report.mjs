// Builds one person's Growth mini report: people/<id>/report/<date>/report.html and report.pdf (headless Edge, no installs).
//   node scripts/mini-report.mjs --person <id> --guard <token> [--people-dir D] [--edge path-to-msedge.exe] [--no-pdf]
// Refuses when consent is missing, when the honesty check fails, or when a private answer would be printed. Gaps become [NEEDS: ...] and the
// page footer says "Draft: N facts still needed". After the report the person is frozen until "open <id>". Nothing is sent anywhere.
import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { spawnSync } from "child_process";
import { checkGuard, loadPerson, personDir, safeJoin, hasConsent, checkPerson, buildReportModel, privateTexts, privateRepeat, runActions, assertRoot, DEFAULT_PEOPLE, MiniError, ymd } from "../lib/mini.mjs";
import { renderMini, visibleMini, MINI_SECTIONS } from "../lib/mini-render.mjs";
import { foldText, normWs } from "../lib/career-honesty.mjs";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const say = (o, code = 0) => { console.log(JSON.stringify(o)); process.exit(code); };
const norm = (s) => normWs(foldText(s)).toLowerCase();

export function findEdge(given) {
  const cands = [given, process.env.GROWTH_EDGE,
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe")].filter(Boolean);
  return cands.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}
const countPages = (pdf) => { try { const s = fs.readFileSync(pdf).toString("latin1"); const m = s.match(/\/Type\s*\/Page(?![s\w])/g); return m ? m.length : null; } catch { return null; } };

export function buildReport(root, id, { edge, noPdf = false, now = new Date(), guard } = {}) {
  try {
    checkGuard(root, id, guard);
    const state = loadPerson(root, id);
    if (!hasConsent(state.profile)) return { ok: false, message: `${state.profile.name} has not given consent yet, so no report is built. Ask them, then record it. Nothing was written.` };
    const check = checkPerson(state);
    if (!check.pass) return { ok: false, message: `The honesty check fails, so no report is built: ${check.problems[0]}${check.problems.length > 1 ? ` (and ${check.problems.length - 1} more)` : ""}. Nothing was written.`, problems: check.problems };
    const today = ymd(now);
    const model = buildReportModel(state, { today });
    // Every string the report will print (research items, plan text, summary, reading lines, gap notes, every rendered leaf) is checked against the private and Round 3 answers, word for word and reworded.
    const repeated = privateRepeat(state, model);
    if (repeated) return { ok: false, message: `The report would repeat private answer ${repeated} (word for word or reworded). Nothing was written. Say it in other words in the research, the plan or the facts, or take it out.` };
    const html = renderMini(model);
    const seen = norm(visibleMini(html));
    const leaks = privateTexts(state).filter((p) => norm(p.text).length >= 12 && seen.includes(norm(p.text)));
    if (leaks.length) return { ok: false, message: `A private answer (${leaks[0].id}) would be printed in the report. Nothing was written. Change the fact that quotes it.` };
    const found = MINI_SECTIONS.filter(([sid]) => html.includes(`id="${sid}"`)).length;
    if (found !== 12) return { ok: false, message: `The report has ${found} of 12 sections. Nothing was written.` };
    const dir = personDir(root, id);
    let rname = today; for (let k = 2; fs.existsSync(safeJoin(dir, "report", rname)); k += 1) rname = `${today}-${k}`;
    const rdir = safeJoin(dir, "report", rname);
    fs.mkdirSync(rdir, { recursive: true });
    const htmlAbs = path.join(rdir, "report.html"), pdfAbs = path.join(rdir, "report.pdf");
    fs.writeFileSync(htmlAbs, html);
    const out = { ok: true, id, name: state.profile.name, html: `report/${rname}/report.html`, htmlPath: htmlAbs, needs: model.meta.needs, sections: found, pdf: null, pdfPath: null, pages: null, pdf_skipped: null };
    if (!noPdf) {
      const e = findEdge(edge);
      if (!e) out.pdf_skipped = "Microsoft Edge was not found, so only the HTML was written. Open it in a browser and use Print, Save as PDF.";
      else {
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "growth-mini-edge-"));
        try { fs.rmSync(pdfAbs, { force: true }); } catch { /* new */ }
        const run = spawnSync(e, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, `--print-to-pdf=${pdfAbs}`, pathToFileURL(htmlAbs).href], { timeout: 90000, stdio: "pipe" });
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* temp */ }
        let size = 0; try { size = fs.statSync(pdfAbs).size; } catch { /* none */ }
        if (size <= 0) out.pdf_skipped = `Edge did not write the PDF (exit ${run.status}${run.error ? `, ${run.error.message}` : ""}). The HTML is saved.`;
        else { out.pdf = `report/${rname}/report.pdf`; out.pdfPath = pdfAbs; out.bytes = size; out.pages = countPages(pdfAbs); }
      }
    }
    const fr = runActions(root, id, [{ type: "person.freeze", report: out.pdf || out.html }], { internal: true, now, guard });
    if (!fr.ok) out.freeze_note = fr.message;
    out.message = `${out.pdf ? `Saved ${out.pdfPath}` : `Saved ${htmlAbs}`}${out.pages ? ` (${out.pages} pages)` : ""}. ${model.meta.needs ? `${model.meta.needs} fact${model.meta.needs === 1 ? " is" : "s are"} still needed, marked [NEEDS] in the report. ` : "Every fact has a source. "}${state.profile.name} is now frozen until you say "open ${id}". Nothing was sent: send the PDF yourself.`;
    return out;
  } catch (e) { if (e instanceof MiniError) return { ok: false, message: e.message }; throw e; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let root; try { root = assertRoot(flag("--people-dir") || DEFAULT_PEOPLE); } catch (e) { say({ ok: false, message: e.message }, 1); }
  const person = flag("--person");
  if (!person) say({ ok: false, message: "Say whose report: --person <id>." }, 1);
  const r = buildReport(root, person, { edge: flag("--edge"), noPdf: args.includes("--no-pdf"), guard: flag("--guard") });
  say(r, r.ok ? 0 : 1);
}
