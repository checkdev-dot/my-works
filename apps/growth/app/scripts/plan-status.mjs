// Prints the plan status as one JSON object: { has_plan, horizon, weeks_done, review_due, stale_research_count, next_action }.
// Read only. Used by GET /api/plan-status and handy from a terminal: node scripts/plan-status.mjs
import { loadData, todayISO } from "./_data.mjs";
import { planStatus } from "../lib/plan.mjs";

process.stdout.write(`${JSON.stringify(planStatus(loadData(), todayISO()))}\n`);
