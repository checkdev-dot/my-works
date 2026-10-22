// Prints the distance from A to B without writing anything (critique 5, P1-2): where he stands now and where he wants to be,
// before the interview, so a retarget or a first look shows real numbers instead of an instruction to "show the distance".
//   node scripts/domain-gap.mjs <role_now> <level_now> <role_target> <level_target> [--business] [--then <role> [<level>]] [--json] [--data-dir D]
//   roles: a launch role name or id ("Product designer", product_designer) or the title of a planned role (mapped to the nearest
//          launch role and said so); levels: junior, mid, senior, lead, head.
// Reads skills.json, rubric.json and profile.json of the data folder (hours a week, ratings) and changes nothing.
import "./_no-people.mjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { gapFromProfile, gapPreview, roleIdFor, nearestLaunch, levelFromTitle, LEVEL_BY_WORD, WORD_BY_LEVEL, LEVEL_NAMES } from "../lib/domain-flow.mjs";
import { getRole } from "../lib/domains.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const di = args.indexOf("--data-dir");
const dataDir = path.resolve(di >= 0 ? args[di + 1] : path.join(APP, "data"));
const asJson = args.includes("--json");
const business = args.includes("--business");
const ti = args.indexOf("--then");
const skip = new Set();
if (di >= 0) { skip.add(di); skip.add(di + 1); }
if (ti >= 0) { skip.add(ti); skip.add(ti + 1); if (args[ti + 2] && !args[ti + 2].startsWith("--") && LEVEL_BY_WORD[String(args[ti + 2]).toLowerCase()]) skip.add(ti + 2); }
const pos = args.filter((a, i) => !a.startsWith("--") && !skip.has(i));
const die = (m) => { console.error(m); process.exit(2); };
if (pos.length < 4) die("Usage: node scripts/domain-gap.mjs <role_now> <level_now> <role_target> <level_target> [--business] [--then <role> [<level>]] [--json] [--data-dir D]\nExample: node scripts/domain-gap.mjs \"Product designer\" mid \"Product designer\" lead");

const read = (n) => { try { return JSON.parse(fs.readFileSync(path.join(dataDir, `${n}.json`), "utf8")); } catch { return {}; } };
const profile0 = read("profile");
const skills = read("skills");
const rubric = read("rubric");
const notes = [];
const roleOf = (text, what) => {
  const id = roleIdFor(text);
  if (!id) die(`${what} "${text}" is not a role I know. The launch roles are ${["product_designer", "brand_designer", "content_marketer", "product_marketer", "pr_specialist"].map((r) => getRole(r).name).join(", ")}.`);
  const near = nearestLaunch(id);
  if (!near) die(`${what} "${text}" has no launch role near it.`);
  if (near.mapped) notes.push(`${what} "${text}" is planned: ${getRole(near.role).name} is used as the nearest launch role. Confirm it with him before saving it as his target.`);
  return { id, role: near.role, hint: near.level };
};
const levelOf = (text, what) => {
  const l = LEVEL_BY_WORD[String(text).trim().toLowerCase()] || (["J", "M", "S", "L", "H"].includes(String(text).trim()) ? String(text).trim() : null);
  if (!l) die(`${what} must be junior, mid, senior, lead or head.`);
  return l;
};
const now = roleOf(pos[0], "role_now");
const levelNow = levelOf(pos[1], "level_now");
const to = roleOf(pos[2], "role_target");
const levelTo = levelOf(pos[3], "level_target");
for (const [r, l, what] of [[now, levelNow, "level_now"], [to, levelTo, "level_target"]]) {
  if (!(getRole(r.role).ladder && getRole(r.role).ladder[l])) die(`${getRole(r.role).name} has no ${WORD_BY_LEVEL[l]} step. The steps are ${["J", "M", "S", "L", "H"].filter((x) => getRole(r.role).ladder[x]).map((x) => WORD_BY_LEVEL[x]).join(", ")} (${what}).`);
}
const targets = [{ role: to.role, level: levelTo, weight: 1, kind: "primary" }];
if (ti >= 0 && args[ti + 1]) {
  const sec = roleOf(args[ti + 1], "then");
  const sl = (args[ti + 2] && LEVEL_BY_WORD[String(args[ti + 2]).toLowerCase()]) || levelFromTitle(args[ti + 1], sec.id) || sec.hint || levelTo;
  if (!(sec.role === to.role && sl === levelTo) && getRole(sec.role).ladder[sl]) targets.push({ role: sec.role, level: sl, weight: 0.5, kind: "optional", sequential: true });
}
const profile = {
  ...profile0,
  domain: { family_now: getRole(now.role).family, role_now: now.role, level_now: levelNow, targets, same_industry: false, target_setting: business ? "business" : "employee" },
};
const g = gapFromProfile({ profile, skills, rubric });
if (!g || !g.ok) die(`The map could not be computed: ${g && g.error ? g.error : "no target"}.`);
const pv = gapPreview(g);
if (asJson) { console.log(JSON.stringify({ ...pv, notes, written: false }, null, 2)); process.exit(0); }
const nm = (r) => getRole(r).name;
console.log(`From ${nm(now.role)}, ${LEVEL_NAMES[levelNow]} to ${nm(to.role)}, ${LEVEL_NAMES[levelTo]}${pv.then.length ? `, then ${nm(pv.then[0].role)}, ${LEVEL_NAMES[pv.then[0].level]}` : ""}  (model estimate, not sourced; nothing was written)`);
console.log(`  Distance ${pv.distance}, about ${pv.evenings} evenings, roughly ${pv.months} month${pv.months === 1 ? "" : "s"} at ${pv.hours_per_week} hours a week.`);
console.log(`  Largest gaps: ${pv.top_gaps.map((x) => `${x.name} (${x.gap} short of ${x.target}${x.current === null ? ", not rated" : `, you ${x.current}`})`).join("; ")}.`);
if (pv.blockers.length) console.log(`  Typically asked for (model estimate, not sourced): ${pv.blockers.map((b) => `${b.label} (you have: ${b.have === null ? "not known yet" : `${b.have} of ${b.needs}`})`).join("; ")}.`);
console.log(`  Basis: ${pv.basis}.`);
for (const n of notes) console.log(`  NOTE: ${n}`);
