// Checks growth/data after Claude (or anyone) writes to it.
// Run: npm --prefix growth run check      Exit code 1 means the app may break or mislead the person.
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FILES, OPTIONAL_FILES, validate } from "../lib/validate.mjs";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const parseErrors = [];
const d = {};
for (const f of FILES) {
  const p = path.join(DATA, `${f}.json`);
  if (!existsSync(p)) { parseErrors.push(`${f}: file is missing`); continue; }
  try { d[f] = JSON.parse(readFileSync(p, "utf8")); } catch (e) { parseErrors.push(`${f}: not valid JSON (${e.message})`); }
}
// Plan engine files are optional: read them only when present.
for (const f of OPTIONAL_FILES) {
  const p = path.join(DATA, `${f}.json`);
  if (!existsSync(p)) continue;
  try { d[f] = JSON.parse(readFileSync(p, "utf8")); } catch (e) { parseErrors.push(`${f}: not valid JSON (${e.message})`); }
}
const { errors, warnings } = parseErrors.length ? { errors: parseErrors, warnings: [] } : validate(d);
// Script-only checks: they look at the disk, which the shared rules cannot.
if (!parseErrors.length && d.profile && d.profile.modules && Array.isArray(d.profile.modules.installed)) {
  const APP = path.join(DATA, "..");
  const inst = d.profile.modules.installed;
  for (const m of inst) {
    if (m && m.skill && m.skill.kind === "file" && typeof m.skill.path === "string" && !existsSync(path.join(APP, m.skill.path))) warnings.push(`profile: module ${m.id} skill file ${m.skill.path} does not exist on disk`);
  }
  const byCap = {};
  for (const m of inst) if (m && m.enabled === true) (byCap[m.capability] ||= []).push(m);
  for (const [cap, list] of Object.entries(byCap)) if (list.length >= 2 && !list.some((m) => m.default)) warnings.push(`profile: ${list.length} enabled modules share ${cap} and none is the default`);
  // Add-ons v2: compare against the ledger of built-in abilities.
  const ledgerPath = path.join(APP, "modules", "ledger.json");
  let ledgerIds = null;
  if (existsSync(ledgerPath)) {
    try { ledgerIds = new Set(JSON.parse(readFileSync(ledgerPath, "utf8")).abilities.map((x) => x.id)); } catch (e) { warnings.push(`modules/ledger.json: not valid (${e.message})`); }
  } else warnings.push("modules/ledger.json: file is missing, so retired and can_drop ids can't be checked");
  const modIds = new Set(inst.map((m) => m && m.id));
  if (ledgerIds) {
    for (const r of d.profile.modules.retired || []) if (!ledgerIds.has(r)) warnings.push(`profile: retired id ${r} is not in modules/ledger.json`);
    for (const m of inst) for (const l of (m && m.impact && m.impact.can_drop) || []) if (l && l.target && !ledgerIds.has(l.target) && !modIds.has(l.target)) warnings.push(`profile: module ${m.id} can_drop target ${l.target} is neither a built-in ability nor an installed add-on`);
  }
  for (const m of inst) if (m && (!Array.isArray(m.abilities) || !m.abilities.length)) warnings.push(`profile: module ${m.id} has no abilities; ask Claude to list what it enables`);
  const byTopic = {};
  for (const m of inst) if (m && m.enabled === true) for (const a of m.abilities || []) if (a && a.enabled !== false && a.topic) ((byTopic[a.topic] ||= new Set())).add(m.id);
  const primary = d.profile.modules.primary || {};
  for (const [topic, set] of Object.entries(byTopic)) if (set.size >= 2 && !(topic in primary)) warnings.push(`profile: ${set.size} enabled add-ons (${[...set].join(", ")}) share the topic ${topic} and none is primary`);
}
// The person model: a card should exist once something is confirmed, and evidence ids should point at something real.
if (!parseErrors.length && d.profile && d.profile.person && Array.isArray(d.profile.person.items)) {
  const per = d.profile.person;
  if (per.items.some((x) => x && x.status === "confirmed") && !(typeof per.card === "string" && per.card.trim())) warnings.push("profile: person has confirmed items but no card; write the core card (150 words or fewer)");
  const known = new Set([
    ...(d.evidence?.entries || []).map((x) => x.id),
    ...((d.profile.intake || []).map((x) => x.id)),
    ...((d.library?.picks || []).map((x) => x.id)),
    ...((d.library?.gaps || []).map((x) => x.id)),
    ...((d.library?.trinkets || []).map((x) => x.id)),
    ...((d.week?.tasks || []).map((x) => x.id)),
    ...((d.queue?.items || []).map((x) => x.id)),
    ...((d.tests?.tests || []).map((x) => x.id)),
  ]);
  for (const it of per.items) for (const e of (it && Array.isArray(it.evidence) ? it.evidence : [])) if (!known.has(e)) warnings.push(`profile: person item ${it.id} cites ${e}, which isn't a journal entry, intake answer, pick or task`);
}
// Career (CV and case studies): the schema is in lib/validate.mjs. Script-only checks look at the disk and at the career file:
// the html of each version exists, and the honesty check passes (the dossier is read here, never by the shared rules). If the
// dossier is not reachable on this computer that is a warning, not an error: nothing was found to be wrong.
if (!parseErrors.length && d.career && !errors.length) {
  const { makeContext, checkVersion, checkCase } = await import("../lib/career-honesty.mjs");
  const ctx = makeContext({ dataDir: DATA });
  const cantRead = ctx.loadProblems.length > 0;
  const bad = [];
  for (const v of d.career.cv.versions) {
    if (!existsSync(path.join(DATA, "..", ...String(v.file).split("/")))) warnings.push(`career: ${v.id} has no html file at ${v.file}; say save my CV as a PDF or rebuild it`);
    if (v.pdf && !existsSync(path.join(DATA, "..", ...String(v.pdf).split("/")))) warnings.push(`career: ${v.id} points to ${v.pdf}, which is not on disk`);
    const r = checkVersion(v, ctx); if (!r.pass) bad.push([`CV ${v.id}`, r]);
  }
  for (const c of d.career.cases) { const r = checkCase(c, ctx); if (!r.pass) bad.push([`case ${c.id}`, r]); }
  for (const [what, r] of bad) {
    const real = [...r.unsourced_numbers, ...r.deny_hits, ...r.problems.filter((p) => !ctx.loadProblems.includes(p))];
    if (real.length) errors.push(`career: ${what} fails the honesty check: ${real[0]}${real.length > 1 ? ` (and ${real.length - 1} more; run npm run cv:check)` : ""}`);
    else if (cantRead) warnings.push(`career: ${what} could not be checked: ${ctx.loadProblems[0]}`);
  }
}
for (const m of errors) console.log(`ERROR  ${m}`);
for (const m of warnings) console.log(`warn   ${m}`);
// Tone warnings name the entry (queue Q-xxx, journal E-xxx, task T-xxx, module result): Claude fixes these on the next review.
const toneWarnings = warnings.filter((m) => /failure framing/.test(m));
if (toneWarnings.length) {
  console.log(`\nTone: ${toneWarnings.length} line(s) of Claude-written text frame a failure. Rewrite them on the next review:`);
  for (const m of toneWarnings) console.log(`  - ${m.replace(/^\w+: /, "")}`);
}
console.log(errors.length ? `
${errors.length} error(s): fix before the person opens the app.` : `
Data OK${warnings.length ? `, ${warnings.length} warning(s)` : ""}.`);
process.exit(errors.length ? 1 : 0);
