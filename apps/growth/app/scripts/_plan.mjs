// The 23 plan checks (P1 to P23) as one pure function. Read only, no network, deterministic for a fixed `today`.
// Rows: { id, title, status: "PASS" | "WARN" | "FAIL" | "N/A", count, ids, note }
import { ageDaysOf, deriveDemands, hashOf, isOpenTask, planForecast, posOf, PLAN_CONFIG, DAYS } from "../lib/plan.mjs";

const wc = (s) => (typeof s === "string" ? s.trim().split(/\s+/).filter(Boolean).length : 0);
const GENERIC = /^(ok|fits|fine|good|next|because|first|placed|scheduled)\.?$/i;

export const PLAN_MUST_PRODUCE = [
  "data/demands.json: derived demands, with a source_hash that matches the profile",
  "data/plan.json: horizon (4 weeks), weeks with goal and load, tasks with gap, meets, placement and placed_because",
  "data/research.json: one item per claim, with a verbatim excerpt of 25 words or fewer, tier, retrieved date and verified result",
  "data/sources.json: ranked best places per topic, with the date each was last checked",
  "data/runs.json: this run, with caps used, what it updated, what it left and why, and the verification sample",
  "gaps in data/library.json: research ids, tasks, rank and rank_why, evenings and evenings_basis from the plan",
  "week.json as the projection of plan week 1",
];

const CHECKS = [
  ["P1", "every open gap has planned tasks"], ["P2", "every task has a gap or is demand only"], ["P3", "every task meets a demand"],
  ["P4", "placement is complete"], ["P5", "references resolve"], ["P6", "research is present"], ["P7", "research is fresh"],
  ["P8", "excerpt rules"], ["P9", "citation sample verified"], ["P10", "day load"], ["P11", "week load and slack"],
  ["P12", "dependencies come first"], ["P13", "horizon is full"], ["P14", "forecast reproduces"], ["P15", "both tracks on a night"],
  ["P16", "task size 15 to 60 minutes"], ["P17", "demands are current"], ["P18", "hard demands hold"], ["P19", "no orphan research"],
  ["P20", "review debt"], ["P21", "run is logged"], ["P22", "rating moves have history"], ["P23", "examples are marked as illustrations"],
];

/**
 * d: the loaded data (the 13 files plus any of demands, plan, research, sources, runs, reviews).
 * opts: { today, week: boolean } where week limits to the checks a weekly check needs.
 * Without a plan the plan-dependent checks are "N/A" and `noPlan` is true.
 */
export function runPlanChecks(d, today, opts = {}) {
  const plan = d.plan || null;
  const rows = [];
  const add = (id, status, ids = [], note = "") => {
    const title = CHECKS.find((c) => c[0] === id)[1];
    rows.push({ id, title, status, count: ids.length, ids, note });
  };
  if (!plan) {
    for (const [id] of CHECKS) add(id, "N/A", [], "no plan yet");
    return { rows, noPlan: true };
  }
  const tasks = Object.entries(plan.tasks || {}).map(([id, t]) => ({ id, ...t }));
  const open = tasks.filter(isOpenTask);
  const taskIds = new Set(tasks.map((t) => t.id));
  const gaps = ((d.library && d.library.gaps) || []).filter((g) => g.status !== "closed");
  const gapIds = new Set(((d.library && d.library.gaps) || []).map((g) => g.id));
  const demandIds = new Set(((d.demands && d.demands.items) || []).map((x) => x.id));
  const research = (d.research && d.research.items) || [];
  const rById = Object.fromEntries(research.map((r) => [r.id, r]));
  const runs = (d.runs && d.runs.runs) || [];
  const pl = (t) => t.placement;
  const status = (fail, warn) => (fail.length ? "FAIL" : warn.length ? "WARN" : "PASS");
  const note = (fail, warn, f, w) => [fail.length ? f : "", warn.length ? w : ""].filter(Boolean).join("; ");
  const by = (fn) => open.filter(fn).map((t) => t.id);

  // P1
  {
    const fail = []; const warn = [];
    for (const g of gaps) {
      const mine = open.filter((t) => t.gap === g.id);
      if (!mine.length) { if (!(g.waiting_days > 0)) fail.push(g.id); }
      else if (mine.every((t) => pl(t) && pl(t).week >= 3)) warn.push(g.id);
    }
    add("P1", status(fail, warn), [...fail, ...warn], note(fail, warn, "open gap with no open task and no waiting reason", "tasks only start in week 3 or later"));
  }
  // P2
  { const fail = by((t) => !t.gap && !(t.demand_only === true && t.demand_only_reason)); add("P2", status(fail, []), fail, fail.length ? "no gap, and not demand_only with a reason" : ""); }
  // P3
  {
    const fail = by((t) => !Array.isArray(t.meets) || !t.meets.length);
    const warn = by((t) => (t.meets || []).some((m) => wc(m.how) > 25));
    add("P3", status(fail, warn), [...fail, ...warn], note(fail, warn, "meets no demand", "a how is over 25 words"));
  }
  // P4
  {
    const fail = by((t) => { const p = pl(t); return !p || !Number.isInteger(p.week) || !p.day || !Number.isInteger(p.order) || !p.placed_because; });
    const warn = by((t) => pl(t) && pl(t).placed_because && (wc(pl(t).placed_because) < 4 || GENERIC.test(pl(t).placed_because.trim())));
    add("P4", status(fail, warn), [...fail, ...warn], note(fail, warn, "missing week, day, order or placed_because", "reason is generic"));
  }
  // P5
  {
    const fail = [];
    for (const t of tasks) {
      if (t.gap && !gapIds.has(t.gap)) fail.push(`${t.id}.gap ${t.gap}`);
      for (const m of t.meets || []) if (!demandIds.has(m.demand_id)) fail.push(`${t.id}.meets ${m.demand_id}`);
      for (const r of t.research || []) if (!rById[r]) fail.push(`${t.id}.research ${r}`);
      for (const dep of (pl(t) && pl(t).depends_on) || []) if (!taskIds.has(dep)) fail.push(`${t.id}.depends_on ${dep}`);
    }
    for (const w of plan.weeks || []) for (const id of w.tasks || []) if (!taskIds.has(id)) fail.push(`week ${w.n} ${id}`);
    add("P5", status(fail, []), fail, fail.length ? "dangling ids" : "");
  }
  // P6
  {
    const fail = []; const warn = [];
    for (const t of open) {
      if (!t.research_status) { fail.push(t.id); continue; }
      if (t.research_status === "unsourced") warn.push(t.id);
      if (t.research_status === "verified") {
        const m = (t.research || []).map((x) => rById[x]).filter((x) => x && x.verified && x.verified.result === "match");
        if (m.length < 2 || !m.some((x) => x.tier <= 2)) fail.push(t.id);
      }
    }
    const verifiedRun = runs.some((r) => r.verification);
    const share = open.length ? open.filter((t) => t.research_status === "unsourced").length / open.length : 0;
    let extra = "";
    if (plan.status === "active" && verifiedRun && share > 0.5) { fail.push(`${Math.round(share * 100)}% unsourced`); extra = "; more than half unsourced after the first verified run"; }
    add("P6", status(fail, warn), [...fail, ...warn], note(fail, warn, `no research_status, or verified without 2 matches and a tier 1 or 2 source${extra}`, "unsourced, shown honestly"));
  }
  // citations used by open tasks
  const cited = [...new Set(open.flatMap((t) => t.research || []))].map((id) => rById[id]).filter(Boolean);
  // P7
  {
    const fail = []; const warn = [];
    for (const r of cited) {
      const age = ageDaysOf(r.retrieved, today);
      const res = r.verified && r.verified.result;
      if (age === null || age > r.fresh_days || res !== "match") fail.push(r.id);
      else if (age > r.fresh_days * 0.75) warn.push(r.id);
    }
    add("P7", status(fail, warn), [...fail, ...warn], note(fail, warn, "past fresh_days, or not verified as a match", "past 75% of fresh_days"));
  }
  // P8
  {
    const fail = []; const warn = [];
    for (const r of research) {
      const res = r.verified && r.verified.result;
      if (!/^https?:\/\//.test(r.source_url || "") || (res !== "unreachable" && !r.excerpt) || wc(r.excerpt) > 25) fail.push(r.id);
      else if (r.published === null || r.published === undefined) warn.push(r.id);
    }
    add("P8", status(fail, warn), [...fail, ...warn], note(fail, warn, "excerpt over 25 words or missing, or url not http(s)", "no published date"));
  }
  // P9
  {
    if (!research.length) add("P9", "PASS", [], "no research to sample");
    else {
      // The run that wrote the plan, else the latest plan run. Later runs (answer, library) need no verification.
      const last = runs.find((r) => r.id === plan.generated_by) || [...runs].reverse().find((r) => r.command === "plan") || runs[runs.length - 1];
      const v = last && last.verification;
      const lastVer = [...runs].reverse().find((r) => r.verification);
      if (!v) add("P9", "FAIL", [last ? last.id : "no run"], lastVer ? `the last run has no verification; the latest one is ${lastVer.id}` : "no run has a verification entry");
      else if (v.total && v.sampled / v.total < 0.2) add("P9", "WARN", [last.id], `sample ${v.sampled} of ${v.total} is under 20%`);
      else add("P9", "PASS", [], `sample ${v.sampled} of ${v.total}, ${v.matched} matched`);
    }
  }
  // load maps
  const perDay = {}; const perWeek = {};
  for (const t of open) {
    const p = pl(t);
    if (!p) continue;
    const k = `${p.week}|${p.day}`;
    (perDay[k] ||= []).push(t);
    perWeek[p.week] = (perWeek[p.week] || 0) + (t.minutes || 0);
  }
  const dayOver = Object.entries(perDay).filter(([, a]) => a.reduce((s, t) => s + (t.minutes || 0), 0) > PLAN_CONFIG.max_min_per_night || a.length > PLAN_CONFIG.max_tasks_per_night).map(([k]) => `week ${k.replace("|", " ")}`);
  // P10
  add("P10", status(dayOver, []), dayOver, dayOver.length ? "over 60 minutes or over 2 tasks" : "");
  // P11
  {
    const fail = []; const warn = [];
    for (const w of plan.weeks || []) {
      const planned = perWeek[w.n] || 0;
      const cap = (w.load && w.load.capacity_min) || PLAN_CONFIG.per_week_evenings * PLAN_CONFIG.max_min_per_night;
      if (planned > cap) fail.push(`week ${w.n}: ${planned} of ${cap}`);
      else if (planned > cap * (1 - PLAN_CONFIG.slack_pct)) warn.push(`week ${w.n}: ${planned} of ${cap}`);
    }
    add("P11", status(fail, warn), [...fail, ...warn], note(fail, warn, "over capacity", "over 90%, no slack"));
  }
  // P12
  {
    const fail = [];
    for (const t of open) {
      const p = pl(t);
      if (!p) continue;
      for (const dep of p.depends_on || []) {
        const dt = plan.tasks[dep];
        if (dt && dt.placement && posOf(dt.placement) >= posOf(p)) fail.push(`${t.id} before ${dep}`);
      }
    }
    add("P12", status(fail, []), fail, fail.length ? "a task sits on or before the night of its dependency" : "");
  }
  // P13
  {
    const fail = []; const warn = [];
    const weeks = plan.weeks || [];
    if (plan.status === "active") {
      if (weeks.length < plan.horizon_weeks) fail.push(`${weeks.length} of ${plan.horizon_weeks} weeks`);
      const lastW = weeks[weeks.length - 1];
      if (lastW && !(lastW.tasks || []).length) fail.push(`week ${lastW.n} is empty`);
    }
    if (plan.horizon_weeks !== PLAN_CONFIG.horizon_weeks && !(plan.inputs && plan.inputs.horizon_chosen_by_dev)) warn.push(`horizon ${plan.horizon_weeks}`);
    add("P13", status(fail, warn), [...fail, ...warn], note(fail, warn, "active plan is not full", "horizon is not 4 and was not chosen by the person"));
  }
  // P14
  {
    const f = plan.forecast;
    if (!f) add("P14", "FAIL", ["forecast"], "plan has no forecast");
    else {
      const inp = plan.inputs || {};
      const again = planForecast(d, inp.pace || d.profile.pace || "steady", { today: f.as_of, perWeek: inp.per_week_evenings });
      const sameHash = again.reproduce.inputs_hash === (f.reproduce && f.reproduce.inputs_hash);
      const sameOut = again.ready_by === f.ready_by && JSON.stringify(again.range) === JSON.stringify(f.range);
      // Same inputs but a different answer means the stored forecast cannot be reproduced: FAIL.
      // Different inputs only means work or edits happened since as_of: WARN, refresh it.
      if (sameHash && !sameOut) add("P14", "FAIL", ["forecast"], `same inputs, stored ${f.ready_by || "no date"}, recomputed ${again.ready_by || "no date"}`);
      else if (!sameHash) add("P14", "WARN", ["forecast"], `inputs changed since ${f.as_of}; refresh the forecast (it was ${f.ready_by || "no date"}, now ${again.ready_by || "no date"})`);
      else { const age = ageDaysOf(f.as_of, today); add("P14", age !== null && age > 7 ? "WARN" : "PASS", age !== null && age > 7 ? ["forecast"] : [], age !== null && age > 7 ? `forecast is ${age} days old` : ""); }
    }
  }
  // P15
  {
    const fail = [];
    for (const [k, a] of Object.entries(perDay)) {
      if (new Set(a.map((t) => t.track)).size === 1 && !a.some((t) => pl(t).single_track_reason)) fail.push(`week ${k.replace("|", " ")}`);
    }
    add("P15", status(fail, []), fail, fail.length ? "one track on a planned night and no reason" : "");
  }
  // P16
  { const fail = by((t) => !(t.minutes >= PLAN_CONFIG.min_task_min && t.minutes <= PLAN_CONFIG.max_task_min)); add("P16", status(fail, []), fail, fail.length ? "minutes outside 15 to 60" : ""); }
  // P17
  {
    if (!d.demands) add("P17", "FAIL", ["demands.json"], "demands.json is missing");
    else {
      const now = deriveDemands(d, today);
      if (now.source_hash !== d.demands.source_hash) add("P17", "FAIL", ["demands"], "the profile changed since demands were derived; run node scripts/demands.mjs");
      else add("P17", "PASS", [], "");
    }
  }
  // P18
  {
    const fail = [];
    const hardIds = new Set(((d.demands && d.demands.items) || []).filter((x) => x.hard).map((x) => x.id));
    if ((hardIds.has("D-time") || !d.demands) && dayOver.length) fail.push(...dayOver.map((x) => `D-time ${x}`));
    if (hardIds.has("D-learn") || !d.demands) for (const t of open) if (t.kind === "learn" && !t.artifact) fail.push(`D-learn ${t.id}`);
    add("P18", status(fail, []), fail, fail.length ? "a hard demand is broken (time, or learning with no artifact)" : "");
  }
  // P19
  {
    const used = new Set();
    for (const t of tasks) for (const r of t.research || []) used.add(r);
    for (const g of (d.library && d.library.gaps) || []) {
      for (const r of g.research || []) used.add(r);
      for (const m of g.market_evidence || []) used.add(m.research_id);
      if (g.level_definition) used.add(g.level_definition.from);
      if (g.best_source) used.add(g.best_source.research_id);
    }
    for (const rv of (d.reviews && d.reviews.reviews) || []) for (const it of rv.items || []) for (const e of it.evidence_ids || []) used.add(e);
    const orphan = research.filter((r) => !used.has(r.id)).map((r) => r.id);
    add("P19", status(orphan, []), orphan, orphan.length ? "research referenced by nothing" : "");
  }
  // P20
  {
    const fail = []; const warn = [];
    const rev = plan.review || {};
    if (plan.status !== "closed") {
      if (rev.four_week_due && rev.four_week_due < today && !rev.last) fail.push(`four week review due ${rev.four_week_due}`);
      else if (rev.four_week_due && ageDaysOf(today, rev.four_week_due) !== null && ageDaysOf(today, rev.four_week_due) <= 7 && ageDaysOf(today, rev.four_week_due) >= 0) warn.push(`four week review due ${rev.four_week_due}`);
      if (plan.status === "active") {
        const base = rev.weekly_last || plan.starts;
        const age = ageDaysOf(base, today);
        if (age !== null && age > PLAN_CONFIG.weekly_check_max_days) fail.push(`weekly check ${age} days old`);
      }
    }
    add("P20", status(fail, warn), [...fail, ...warn], note(fail, warn, "review debt: suggest it to the person, never auto-run", "review due within 7 days"));
  }
  // P21
  {
    const fail = []; const warn = [];
    if (plan.generated_by && !runs.some((r) => r.id === plan.generated_by)) fail.push(`plan ${plan.generated_by}`);
    if (!plan.generated_by) fail.push("plan has no generated_by");
    const refs = new Set([...taskIds, ...gapIds, ...research.map((r) => r.id), ...demandIds]);
    for (const r of runs) for (const l of r.left || []) if (!refs.has(l.ref)) warn.push(`${r.id} left ${l.ref}`);
    add("P21", status(fail, warn), [...fail, ...warn], note(fail, warn, "the write has no run entry", "a left item points at nothing"));
  }
  // P22
  {
    const fail = [];
    const snap = (plan.inputs && plan.inputs.ratings) || null;
    if (snap) for (const [k, r] of Object.entries((d.skills && d.skills.ratings) || {})) {
      if (typeof snap[k] === "number" && snap[k] !== r.level) {
        const moved = (r.history || []).some((h) => h.level === r.level && h.date >= plan.starts);
        if (!moved) fail.push(k);
      }
    }
    add("P22", status(fail, []), fail, snap ? (fail.length ? "level changed with no history entry since the plan began" : "") : "no rating snapshot in plan.inputs, so nothing to compare");
  }
  // P23
  { const fail = by((t) => t.example && t.example_kind !== "illustration" && t.example_kind !== "real"); add("P23", status(fail, []), fail, fail.length ? "example not marked as an illustration" : ""); }

  const only = opts.week ? new Set(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P10", "P11", "P12", "P14", "P20", "P21"]) : null;
  return { rows: only ? rows.filter((r) => only.has(r.id)) : rows, noPlan: false };
}
export { DAYS };

/**
 * What a run did not cover: (stale + unsourced + failing) minus what the run touched.
 * It reads plan-check rows, the research list, plan tasks and gaps, so a run cannot leave something out by forgetting it.
 * touched: ids the run changed or refreshed (task, gap, research, demand ids). Returns [{ ref, why }] in a stable order.
 */
export function computeLeft(d, today, touched = []) {
  const done = new Set(touched);
  const why = new Map();
  const add = (ref, reason) => {
    if (!ref || done.has(ref)) return;
    const list = why.get(ref) || [];
    if (!list.includes(reason)) list.push(reason);
    why.set(ref, list);
  };
  const { rows, noPlan } = runPlanChecks(d, today);
  if (!noPlan) {
    for (const r of rows) {
      if (r.status !== "FAIL" && r.status !== "WARN") continue;
      for (const id of r.ids) {
        // Ids look like "S-01", "RS-3", "G-02", or "week 2 Mon" / "D-time S-01": keep the last token that is an id when there is one.
        const ref = /^[A-Za-z]+-[\w-]+$/.test(id) ? id : (String(id).split(/\s+/).reverse().find((x) => /^[A-Z]+-[\w-]+$/.test(x)) || id);
        add(ref, `${r.id} ${r.title}${r.note ? `: ${r.note}` : ""}`);
      }
    }
  }
  for (const r of (d.research && d.research.items) || []) {
    const a = ageDaysOf(r.retrieved, today);
    if (a === null) add(r.id, "research has no retrieved date");
    else if (Number.isInteger(r.fresh_days) && a > r.fresh_days) add(r.id, `research is ${a} days old, fresh for ${r.fresh_days}`);
    if (r.verified && ["mismatch", "unreachable"].includes(r.verified.result)) add(r.id, `its last check said ${r.verified.result}`);
  }
  for (const [id, t] of Object.entries((d.plan && d.plan.tasks) || {})) {
    if (!isOpenTask(t)) continue;
    if (t.research_status === "unsourced" || !(t.research || []).length) add(id, "task has no verified source");
  }
  for (const g of ((d.library && d.library.gaps) || []).filter((x) => x.status !== "closed")) {
    if (g.research_status === "unsourced" || (g.research_status === undefined && !(g.research || []).length)) add(g.id, "gap has no verified source");
  }
  return [...why.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ref, reasons]) => ({ ref, why: reasons.slice(0, 2).join("; ") }));
}
