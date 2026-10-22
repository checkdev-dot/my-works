// In-memory fixtures for scripts/plan-check.mjs: an empty data set, a valid 4 week plan, and plans with deliberate defects.
// Run: node scripts/plan-check-fixtures.mjs     (exit 1 if any assertion fails). Writes nothing.
// Import { buildValid, TODAY } from here to test the validator against a plan that should pass.
import { fileURLToPath } from "url";
import path from "path";
import { runPlanChecks } from "./_plan.mjs";
import { deriveDemands, placeTasks, planForecast, addDays } from "../lib/plan.mjs";

export const TODAY = "2026-10-14";
const clone = (o) => JSON.parse(JSON.stringify(o));

/** A small, self-contained data set (no live data, so it never drifts). */
export function baseData(gapSkill = "G-01", gapReach = "G-02") {
  return {
    profile: { name: "T", pace: "steady", north_star: { role: "Lead designer", salary_inr_per_month: 250000, recognition: ["Followers: 1,000 to 5,000"] }, constraints: { hours_per_day: 1, learns_best_by: "practising", avoid: ["consumption-only learning"] } },
    rubric: { competencies: [{ id: "research", name: "Research" }] },
    skills: { ratings: { research: { level: 1.5, target: 3, source: "self", confidence: 0.3, evidence: [], history: [{ date: "2026-10-01", level: 1.5, source: "self", reason: "start" }] } } },
    proof: { items: [{ id: "pr-cv", status: "missing" }] },
    week: { week_of: "2026-10-12", focus: "x", tasks: [] },
    library: { gaps: [
      { id: gapSkill, status: "open", track: "skill", evenings: 4, estimated: "2026-10-14", closes_when: "you show a test result" },
      { id: gapReach, status: "open", track: "reach", evenings: 4, estimated: "2026-10-14", closes_when: "you send the note" },
    ] },
  };
}

/** A valid 4 week plan: 36 tasks of 30 minutes, nine a week (270 of 300 minutes), research verified, forecast reproducible. */
export function buildValid(gapSkill = "G-01", gapReach = "G-02") {
  const d = baseData(gapSkill, gapReach);
  d.demands = deriveDemands(d, TODAY);
  d.research = { updated: TODAY, items: [
    { id: "RS-1", subject: { type: "gap", id: gapSkill }, claim: "Usability tests find most problems with five users.", supports: "why this task", source_url: "https://example.org/a", source_name: "Example Org", tier: 2, published: "2020-01-01", retrieved: "2026-10-10", excerpt: "five users find most usability problems", confidence: 0.7, fresh_days: 365, verified: { by: "verify-pass", on: "2026-10-10", result: "match", http: 200 } },
    { id: "RS-2", subject: { type: "gap", id: gapSkill }, claim: "Method guides end with a worksheet.", supports: "where to learn", source_url: "https://example.org/b", source_name: "Example Docs", tier: 1, published: "2024-05-01", retrieved: "2026-10-10", excerpt: "the guide ends with a one page worksheet", confidence: 0.85, fresh_days: 730, verified: { by: "verify-pass", on: "2026-10-10", result: "match", http: 200 } },
  ] };
  d.library.gaps[0].research = ["RS-1", "RS-2"];
  const specs = [];
  for (let i = 0; i < 18; i++) {
    specs.push({ id: `S-${100 + i}`, track: "skill", gap: gapSkill, depends_on: i % 6 === 5 ? [`S-${100 + i - 1}`] : [] });
    specs.push({ id: `R-${100 + i}`, track: "reach", gap: gapReach, depends_on: [] });
  }
  const put = placeTasks(specs.map((s, i) => ({ id: s.id, minutes: 30, track: s.track, depends_on: s.depends_on, rank: i })), { weeks: 4 });
  const tasks = {};
  for (const s of specs) {
    const p = put.placements.find((x) => x.id === s.id);
    tasks[s.id] = {
      task: `Do the ${s.track} step ${s.id}`, track: s.track, kind: "practice", competency: s.track === "skill" ? "research" : undefined, minutes: 30,
      artifact: "A one page note", why: "It moves the gap forward.", status: "todo", gap: s.gap,
      meets: [{ demand_id: "D-time", how: "30 minutes, one of two tonight" }, { demand_id: "D-skill-research", how: "Adds research evidence" }],
      placement: { week: p.week, day: p.day, order: p.order, slot_min: p.slot_min, placed_because: p.placed_because, depends_on: p.depends_on, load_that_day_min: p.load_that_day_min, ...(p.single_track_reason ? { single_track_reason: p.single_track_reason } : {}) },
      research: ["RS-1", "RS-2"], research_status: "verified", as_of: TODAY, reviewed_by: "claude",
    };
  }
  const weeks = [1, 2, 3, 4].map((n) => {
    const ids = Object.keys(tasks).filter((id) => tasks[id].placement.week === n);
    return { n, week_of: addDays("2026-10-19", (n - 1) * 7), goal: `Week ${n} goal`, load: { planned_min: ids.length * 30, capacity_min: 300 }, status: n === 1 ? "current" : "upcoming", tasks: ids };
  });
  d.plan = {
    updated: TODAY, version: 1, horizon_weeks: 4, starts: "2026-10-19", ends: "2026-11-14", status: "active", generated_by: "PR-20261014-1",
    inputs: { pace: "steady", per_week_evenings: 5, ratings: { research: 1.5 } }, weeks, tasks, slack_min: 120,
    review: { weekly_next: "2026-10-25", weekly_last: null, four_week_due: "2026-11-15", last: null },
  };
  d.plan.forecast = planForecast(d, "steady", { today: TODAY, perWeek: 5 });
  d.runs = { runs: [{ id: "PR-20261014-1", command: "plan", started: TODAY, status: "complete", verification: { sampled: 2, total: 2, matched: 2, failed: 0 }, updated: [{ ref: gapSkill, what: "research +2" }], left: [] }] };
  return d;
}

/** One mutation per check, each of which must turn that check to FAIL. */
export const MUTATIONS = {
  P1: (d) => { d.library.gaps.push({ id: "G-99", status: "open", track: "skill", evenings: 2, estimated: TODAY, closes_when: "x" }); },
  P2: (d) => { delete d.plan.tasks["S-100"].gap; },
  P3: (d) => { d.plan.tasks["S-100"].meets = []; },
  P4: (d) => { delete d.plan.tasks["S-100"].placement.placed_because; },
  P5: (d) => { d.plan.tasks["S-100"].meets[0].demand_id = "D-nope"; },
  P6: (d) => { delete d.plan.tasks["S-100"].research_status; },
  P7: (d) => { d.research.items[0].retrieved = "2025-01-01"; d.research.items[0].fresh_days = 100; },
  P8: (d) => { d.research.items[0].excerpt = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" "); },
  P9: (d) => { delete d.runs.runs[0].verification; },
  P10: (d) => { const a = d.plan.tasks["S-100"].placement; Object.assign(d.plan.tasks["S-102"].placement, { week: a.week, day: a.day, order: 7 }); },
  P11: (d) => { d.plan.weeks[0].load.capacity_min = 200; },
  P12: (d) => { Object.assign(d.plan.tasks["S-105"].placement, { week: 1, day: "Mon", order: 9 }); },
  P13: (d) => { d.plan.weeks.pop(); },
  P14: (d) => { d.plan.forecast.ready_by = "2030-01-01"; },
  P15: (d) => { d.plan.tasks["R-100"].track = "skill"; },
  P16: (d) => { d.plan.tasks["S-100"].minutes = 90; },
  P17: (d) => { d.profile.north_star.role = "Something else"; },
  P18: (d) => { d.plan.tasks["S-100"].kind = "learn"; delete d.plan.tasks["S-100"].artifact; },
  P19: (d) => { d.research.items.push({ ...d.research.items[0], id: "RS-9" }); },
  P20: (d) => { d.plan.review.four_week_due = "2026-10-01"; },
  P21: (d) => { d.plan.generated_by = "PR-nope"; },
  P22: (d) => { d.plan.inputs.ratings.research = 1; },
  P23: (d) => { d.plan.tasks["S-100"].example = "Alex, a mentor"; },
};

function main() {
  const out = [];
  const ok = (name, pass, detail = "") => out.push([pass ? "PASS" : "FAIL", name, detail]);
  const status = (res, id) => res.rows.find((r) => r.id === id).status;

  // 1. empty: every check is N/A and nothing fails
  const empty = runPlanChecks(baseData(), TODAY);
  ok("empty: no plan yet", empty.noPlan && empty.rows.length === 23 && empty.rows.every((r) => r.status === "N/A"));

  // 2. valid: 23 rows, no FAIL, nothing missing
  const valid = runPlanChecks(buildValid(), TODAY);
  const vf = valid.rows.filter((r) => r.status === "FAIL");
  ok("valid 4 week plan: 23 checks, 0 FAIL", valid.rows.length === 23 && vf.length === 0, vf.map((r) => `${r.id}: ${r.note} ${r.ids.slice(0, 3)}`).join(" | "));
  ok("valid plan: 0 WARN", valid.rows.filter((r) => r.status === "WARN").length === 0, valid.rows.filter((r) => r.status === "WARN").map((r) => `${r.id} ${r.note}`).join(" | "));

  // 3. one defect per check: each must turn exactly its own check to FAIL
  for (const [id, mut] of Object.entries(MUTATIONS)) {
    const d = clone(buildValid());
    mut(d);
    const res = runPlanChecks(d, TODAY);
    ok(`defect ${id} fires`, status(res, id) === "FAIL", `${id} is ${status(res, id)}: ${res.rows.find((r) => r.id === id).note}`);
  }

  // 4. the "6 deliberate defects" plan: all six fire together
  const six = clone(buildValid());
  for (const id of ["P2", "P5", "P8", "P10", "P12", "P23"]) MUTATIONS[id](six);
  const sres = runPlanChecks(six, TODAY);
  const fired = ["P2", "P5", "P8", "P10", "P12", "P23"].filter((id) => status(sres, id) === "FAIL");
  ok("plan with 6 defects: all 6 checks fire", fired.length === 6, `fired ${fired.join(",")}`);

  // 5. WARN paths
  const w1 = clone(buildValid()); w1.plan.tasks["S-100"].research_status = "unsourced"; w1.plan.tasks["S-100"].research = [];
  ok("unsourced task is a P6 WARN, not a FAIL", status(runPlanChecks(w1, TODAY), "P6") === "WARN");
  const w2 = clone(buildValid()); w2.plan.review.four_week_due = "2026-10-18";
  ok("review due within 7 days is a P20 WARN", status(runPlanChecks(w2, TODAY), "P20") === "WARN");
  const w3 = clone(buildValid()); w3.plan.weeks[0].load.capacity_min = 290;
  ok("week over 90% is a P11 WARN", status(runPlanChecks(w3, TODAY), "P11") === "WARN");

  // 6. forecast: counted from as_of, finished tasks not subtracted twice, normal progress is a WARN not a FAIL
  const f1 = clone(buildValid());
  f1.library.gaps.forEach((g) => { g.estimated = "2026-10-07"; });
  f1.week.tasks = [{ id: "S-100", track: "skill", status: "done", closed: "2026-10-13" }];
  f1.plan.tasks["S-100"].status = "done";
  const fc = planForecast(f1, "steady", { today: TODAY, perWeek: 5 });
  ok("forecast counts from as_of, one finished task not double counted", fc.ready_by === addDays(TODAY, Math.ceil((18 / 5) * 7)), `got ${fc.ready_by}`);
  const f2 = clone(buildValid());
  f2.plan.tasks["S-101"].status = "done";
  const r14 = status(runPlanChecks(f2, TODAY), "P14");
  ok("task done since the forecast: P14 WARN, not FAIL", r14 === "WARN", r14);

  const w = Math.max(...out.map((r) => r[1].length));
  for (const r of out) console.log(`${r[0]}  ${r[1].padEnd(w)}  ${r[0] === "FAIL" ? r[2] : ""}`);
  const bad = out.filter((r) => r[0] === "FAIL").length;
  console.log(`\n${out.length - bad} pass, ${bad} fail`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
