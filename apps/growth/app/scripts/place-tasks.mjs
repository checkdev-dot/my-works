// Places tasks onto nights with the deterministic rules in lib/plan.mjs. Prints; never writes data/.
// Run: node scripts/place-tasks.mjs [tasks.json] [--weeks 4] [--rest Sat] [--from Mon] [--json]
// With no file it places the open tasks of data/week.json, as a dry run of how the engine would lay them out.
import { readFileSync } from "fs";
import { loadData } from "./_data.mjs";
import { placeTasks, defaultRestNight, PLAN_CONFIG } from "../lib/plan.mjs";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => !a.startsWith("--") && !["--weeks", "--rest", "--from"].includes(args[i - 1]));
let tasks;
let rest = opt("--rest");
if (file) tasks = JSON.parse(readFileSync(file, "utf8"));
else {
  const d = loadData();
  const wt = d.week.tasks;
  if (!rest) rest = defaultRestNight(wt);
  tasks = wt.filter((t) => !["done", "submitted"].includes(t.status)).map((t, i) => ({ id: t.id, minutes: t.minutes, track: t.track, rank: i, later: t.status === "later", where: t.where }));
}
const constraints = { weeks: Number(opt("--weeks") || PLAN_CONFIG.horizon_weeks), ...(rest ? { rest_night: rest } : {}), ...(opt("--from") ? { from_day: opt("--from") } : {}) };
const out = placeTasks(tasks, constraints);
if (args.includes("--json")) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
console.log(`Placed ${out.placements.length} of ${tasks.length} tasks over ${constraints.weeks} weeks. Rest night: ${rest || PLAN_CONFIG.rest_night_fallback}.\n`);
for (const p of out.placements) console.log(`W${p.week} ${p.day} #${p.order}  ${p.id.padEnd(6)} ${String(p.slot_min).padStart(2)} min  ${p.placed_because}${p.depends_on.length ? ` [after ${p.depends_on.join(", ")}]` : ""}`);
if (out.overflow.length) { console.log("\nDid not fit:"); for (const o of out.overflow) console.log(`  ${o.id}: ${o.reason}`); }
console.log("");
for (const n of out.notes) console.log(n);
