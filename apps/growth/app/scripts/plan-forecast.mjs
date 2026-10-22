// The plan forecast, from the live data, with no second algorithm: lib/plan.mjs planForecast over lib/forecast.mjs readyBy.
// Run: node scripts/plan-forecast.mjs [--pace lighter|steady|push] [--per-week N] [--json]
// Read only. It prints the date range, confidence and what it depends on. A date is a range, not a promise.
import { loadData, todayISO } from "./_data.mjs";
import { planForecast, PLAN_CONFIG } from "../lib/plan.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const d = loadData();
const today = todayISO();
const pace = opt("--pace") || (d.plan && d.plan.inputs && d.plan.inputs.pace) || (d.profile && d.profile.pace) || "steady";
if (!["lighter", "steady", "push"].includes(pace)) { console.error("pace must be lighter, steady or push"); process.exit(2); }
const perWeek = opt("--per-week") ? Number(opt("--per-week")) : (d.plan && d.plan.inputs && d.plan.inputs.per_week_evenings) || undefined;
const f = planForecast(d, pace, { today, perWeek });
const stored = d.plan && d.plan.forecast;
if (args.includes("--json")) { console.log(JSON.stringify({ today, pace, per_week: perWeek ?? null, forecast: f, stored: stored || null, same_inputs: stored ? stored.reproduce && stored.reproduce.inputs_hash === f.reproduce.inputs_hash : null }, null, 2)); process.exit(0); }
console.log(`Plan forecast, ${today}, pace ${pace}${perWeek ? `, ${perWeek} evenings a week` : ""}`);
if (!f.ready_by) console.log(`No date: ${f.reason || "not enough to go on"}.`);
else {
  console.log(`Ready around ${f.ready_by}. Range ${f.range.earliest} to ${f.range.latest}. Confidence ${f.confidence}.`);
  console.log(`Depends on: ${f.depends_on.length ? f.depends_on.join(", ") : "nothing outside you"}.`);
}
console.log(`Inputs ${f.reproduce.inputs_hash}.${stored ? ` Stored forecast: ${stored.ready_by || "no date"} as of ${stored.as_of}; ${stored.reproduce && stored.reproduce.inputs_hash === f.reproduce.inputs_hash ? "same inputs" : "inputs have changed since"}.` : " No stored forecast yet."}`);
console.log(`A date is a range with a basis, never a promise. Evenings a week default: ${PLAN_CONFIG.per_week_evenings}.`);
