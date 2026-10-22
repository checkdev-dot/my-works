// The honesty check on the CV versions and case studies in data/career.json. It prints first, then records today's result in each
// version's (and case's) stored checks.honesty (a record-only action, like cv.pdf.set: no undo step, the lines, pdf and html are not
// touched). Pass --no-write to leave career.json exactly as it is.
// Run: node scripts/cv-check.mjs [--data-dir D] [--dossier P] [--denylist P] [--version vN] [--case id] [--json] [--no-write]
//   npm run cv:check
// Checks (lib/career-honesty.mjs): every number is in a quote of its own source; every quote is word for word in the dossier
// (default <your career notes file>, or env GROWTH_DOSSIER, or --dossier), your interview
// answers (data/onboarding.json) or evidence (data/evidence.json); nothing from the deny-list (cv/.denylist.json, local only);
// placeholders are counted. Exit 1 when any version or case fails. A missing dossier or deny-list is a failure, not a pass.
import "./_no-people.mjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { makeContext, checkVersion, checkCase, placeholderList, plainUnsourced, toStored } from "../lib/career-honesty.mjs";
import { runCareerActions } from "./cv-act.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const dataDir = path.resolve(flag("--data-dir") || path.join(APP, "data"));
const json = args.includes("--json");

let career = null;
try { career = JSON.parse(fs.readFileSync(path.join(dataDir, "career.json"), "utf8")); } catch (e) {
  if (e && e.code === "ENOENT" && flag("--data-dir") !== undefined) { console.log(json ? JSON.stringify({ pass: false, versions: {}, cases: {}, note: `There is no career.json in ${dataDir}` }) : `There is no career.json in ${dataDir}, so there is nothing to check. Check the --data-dir path.`); process.exit(1); }
  if (e && e.code === "ENOENT") { console.log(json ? JSON.stringify({ pass: true, versions: {}, cases: {}, note: "career.json does not exist yet" }) : "No career.json yet: nothing to check."); process.exit(0); }
  console.log(`career.json is not valid JSON (${e.message}).`); process.exit(1);
}
const ctx = makeContext({ dataDir, dossierPath: flag("--dossier"), denylistPath: flag("--denylist") });
const onlyV = flag("--version");
const onlyC = flag("--case");
const out = { pass: true, versions: {}, cases: {} };
const lists = {};
for (const v of (career.cv && career.cv.versions) || []) { if (onlyV && v.id !== onlyV) continue; if (onlyC && !onlyV) continue; out.versions[v.id] = checkVersion(v, ctx); lists[v.id] = placeholderList(v); out.versions[v.id].placeholder_list = lists[v.id]; }
for (const c of career.cases || []) { if (onlyC && c.id !== onlyC) continue; if (onlyV && !onlyC) continue; out.cases[c.id] = checkCase(c, ctx); }
out.pass = [...Object.values(out.versions), ...Object.values(out.cases)].every((r) => r.pass);
// Records today's result in the stored checks (after anything is printed). Not when the engine could not load its sources, and a busy lock is a note, never a failure.
const sameStored = (a, b) => JSON.stringify({ ...a, ran: 0 }) === JSON.stringify({ ...b, ran: 0 });
const recordChecks = () => {
  if (args.includes("--no-write") || ctx.loadProblems.length) return "";
  const stale = (career.cv.versions || []).some((v) => out.versions[v.id] && !(v.checks && v.checks.honesty && sameStored(v.checks.honesty, toStored(out.versions[v.id]))))
    || (career.cases || []).some((c) => out.cases[c.id] && !(c.checks && c.checks.honesty && sameStored(c.checks.honesty, toStored(out.cases[c.id]))));
  if (!stale) return "";
  const rec = runCareerActions([{ type: "cv.checks.set" }], { dataDir, dossierPath: flag("--dossier"), denylistPath: flag("--denylist"), internal: true, by: "Claude (cv-check)" });
  return rec.ok ? "Stored checks refreshed in career.json." : `Note: the stored checks were not refreshed (${rec.message}).`;
};
if (json) { const note = recordChecks(); if (note) console.error(note); console.log(JSON.stringify(out, null, 2)); process.exit(out.pass ? 0 : 1); }

console.log(`Dossier: ${ctx.dossierPath}${ctx.dossier === null ? "  (NOT FOUND)" : ""}`);
console.log(`Deny-list: ${ctx.denylistPath}${ctx.deny.length ? ` (${ctx.deny.length} rules)` : "  (MISSING OR EMPTY)"}`);
let devCount = 0;
let needs = 0;
let warnCount = 0;
const show = (kind, id, r) => {
  devCount += r.dev_sources.length;
  needs += r.placeholders;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${kind} ${id}: ${r.placeholders} fact${r.placeholders === 1 ? "" : "s"} still needed, ${r.unsourced_numbers.length} unsourced number${r.unsourced_numbers.length === 1 ? "" : "s"}, ${r.deny_hits.length} deny-list hit${r.deny_hits.length === 1 ? "" : "s"}, ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"}`);
  for (const x of r.unsourced_numbers) console.log(plainUnsourced(x) ? `      ${plainUnsourced(x)}` : `      number with no quote: ${x}`);
  for (const x of r.deny_hits) console.log(`      deny-list: ${x}`);
  for (const x of r.problems) console.log(`      ${x}`);
  for (const x of r.warnings || []) console.log(`      warning: ${x}`);
  warnCount += (r.warnings || []).length;
};
const showNeeds = (id) => { for (const p of lists[id] || []) console.log(`      still needed #${p.index} (cv.fill placeholder): ${p.placeholder}  in ${p.where}`); };
for (const [id, r] of Object.entries(out.versions)) { show("CV", id, r); showNeeds(id); }
for (const [id, r] of Object.entries(out.cases)) show("case", id, r);
if (devCount) console.log(`${devCount} line${devCount === 1 ? "" : "s"} rest on what the person said in chat (a note from him, or kind dev).`);
if (warnCount) console.log(`${warnCount} warning${warnCount === 1 ? "" : "s"} (not failures): a line whose quote shares few of its words. Look at each one.`);
console.log(out.pass ? `Honesty check passed. ${needs} fact${needs === 1 ? "" : "s"} still needed in total.` : "Honesty check FAILED.");
{ const note = recordChecks(); if (note) console.log(note); }
process.exit(out.pass ? 0 : 1);
