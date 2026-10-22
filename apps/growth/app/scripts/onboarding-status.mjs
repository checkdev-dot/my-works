// Prints the onboarding status as one JSON object:
// { status, round, answered, must_total, must_answered, ready_to_plan, readiness, open_unknowns, open_contradictions (blocking only), next_command }
// next_command is "growth start" when nothing has begun, "resume" when it is in progress or paused, null when complete.
// Read only. Used by GET /api/onboarding-status and handy from a terminal: node scripts/onboarding-status.mjs
import "./_no-people.mjs";
import { readAll } from "../lib/onboarding-reset.mjs";
import { progress, nextCommand, blocking } from "../lib/onboarding.mjs";
import { DATA } from "./_data.mjs";

const { d } = readAll(DATA);
const ob = d.onboarding;
const p = progress(ob, (d.unknowns && d.unknowns.items) || []);
process.stdout.write(`${JSON.stringify({
  status: p.status,
  round: ob ? ob.round : null,
  answered: p.answered,
  unknown: p.unknown,
  must_total: p.must_total,
  must_answered: p.must_answered,
  ready_to_plan: p.ready_to_plan,
  readiness: p.readiness,
  open_unknowns: p.open_unknowns,
  open_contradictions: ob ? blocking(ob.contradictions).length : 0,
  next_command: nextCommand(ob),
})}\n`);
