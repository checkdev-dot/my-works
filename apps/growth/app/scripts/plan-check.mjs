// The 23 plan checks over the live data. Run: node scripts/plan-check.mjs [--week] [--preflight] [--json]
// Read only, no network. Exit 1 only on a FAIL. With no data/plan.json it says "no plan yet" and exits 0.
import { loadData, todayISO } from "./_data.mjs";
import { runPlanChecks, PLAN_MUST_PRODUCE } from "./_plan.mjs";
import { planStatus } from "../lib/plan.mjs";

const args = process.argv.slice(2);
const today = todayISO();
const d = loadData();
const { rows, noPlan } = runPlanChecks(d, today, { week: args.includes("--week") });
const broken = d._optional_errors || [];
const fails = rows.filter((r) => r.status === "FAIL").length + broken.length;
if (args.includes("--preflight")) {
  // Short form for the start of a plan run: only what needs a look, and whether it is safe to go on.
  console.log(`Plan preflight, ${today}: ${noPlan ? "no plan yet" : fails ? "not ready" : "ready"}`);
  for (const b of broken) console.log(`FAIL  ${b}`);
  for (const r of rows.filter((x) => x.status === "FAIL" || x.status === "WARN")) console.log(`${r.status.padEnd(4)}  ${r.id} ${r.title}: ${r.note}${r.ids.length ? ` [${r.ids.slice(0, 5).join(", ")}]` : ""}`);
  process.exit(fails ? 1 : 0);
}

if (args.includes("--json")) {
  console.log(JSON.stringify({ today, no_plan: noPlan, status: planStatus(d, today), rows, must_produce: noPlan ? PLAN_MUST_PRODUCE : undefined }, null, 2));
  process.exit(fails ? 1 : 0);
}

console.log(`Plan check, ${today}\n`);
for (const b of broken) console.log(`FAIL  ${b}  (skipped; fix the file)`);
if (noPlan) {
  const open = ((d.library && d.library.gaps) || []).filter((g) => g.status !== "closed");
  console.log("No plan yet (data/plan.json does not exist). That is valid; the app keeps working from week.json.");
  console.log(`Today: ${open.length} open gap${open.length === 1 ? "" : "s"}, ${(d.week.tasks || []).length} tasks in week.json, none linked to a gap or a demand.\n`);
  console.log("A plan run (/growth plan) must produce:");
  for (const x of PLAN_MUST_PRODUCE) console.log(`  - ${x}`);
  console.log("");
}
const w = Math.max(...rows.map((r) => (r.id + " " + r.title).length));
for (const r of rows) {
  const ids = r.ids.length ? ` [${r.ids.slice(0, 6).join(", ")}${r.ids.length > 6 ? `, +${r.ids.length - 6} more` : ""}]` : "";
  console.log(`${r.status.padEnd(4)}  ${(r.id + " " + r.title).padEnd(w)}  ${String(r.count).padStart(3)}${ids}${r.note && !noPlan ? `\n      ${r.note}` : ""}`);
}
const n = (s) => rows.filter((r) => r.status === s).length;
console.log(`\n${n("PASS")} pass, ${n("WARN")} warn, ${fails} fail${noPlan ? `, ${n("N/A")} not applicable until a plan exists` : ""}`);
if (!fails && !noPlan) console.log(`Nothing failed. ${n("WARN")} warning${n("WARN") === 1 ? "" : "s"} listed above; say that in the same sentence if you say "checked".`);
process.exit(fails ? 1 : 0);
