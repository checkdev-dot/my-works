// Plan engine, pure functions only: no node built-ins, no network, no clock unless a date is passed in.
// Used by scripts/plan-check.mjs, scripts/place-tasks.mjs, scripts/demands.mjs and /api/plan-status.
import { readyBy, forecastInputs } from "./forecast.mjs";
import { formatMoney } from "./money.mjs";

/** Defaults the person chose (2026-10-14). Change here, not in the callers. */
export const PLAN_CONFIG = {
  horizon_weeks: 4,
  weekly_check_day: "Sun",
  /** Review is suggested, never run on its own. */
  review_auto_run: false,
  per_week_evenings: 5,
  max_tasks_per_night: 2,
  max_min_per_night: 60,
  /** At least this share of a week's capacity stays unplanned. */
  slack_pct: 0.1,
  min_task_min: 15,
  max_task_min: 60,
  /** Used when no night in the current week has zero tasks. Sunday is never a task night. */
  rest_night_fallback: "Sun",
  /** Research budget per run (spec section 3.7). */
  caps: { searches: 48, fetches: 40, verify_fetches: 12, sonnet_subagents: 10, haiku_lookups: 20, advisor_calls: 2, wall_clock_min: 45, gaps_researched: 8 },
  /** Days a citation stays fresh, by need. */
  fresh_days: { market_demand: 90, salary: 60, level_framework: 365, method_guide: 730, tool_docs: 120 },
  /** Weekly check older than this many days is review debt. */
  weekly_check_max_days: 9,
  /** Suggest the four week review at this share of tasks done. */
  review_suggest_done_share: 0.8,
};

/** The phrases the person says in Claude Code. One place, so the app, the brief and the skill files cannot drift. */
export const PLAN_PHRASES = { plan: "plan my four weeks", review: "review my four weeks", check: "weekly check", why: "why this task" };

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL_DAYS = [...DAYS, "Sun"];

// ---- small pure helpers -------------------------------------------------------------------------

/** Stable JSON: object keys sorted, so equal data hashes equal. */
export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}

/** Pure SHA-1 of a string (UTF-8), hex. Kept here so this file works in the browser and in node. */
export function sha1(str) {
  const bytes = new TextEncoder().encode(str);
  const ml = bytes.length * 8;
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(ml / 0x100000000));
  dv.setUint32(padded.length - 4, ml >>> 0);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  const rol = (x, n) => (x << n) | (x >>> (32 - n));
  for (let i = 0; i < padded.length; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4);
    for (let j = 16; j < 80; j++) w[j] = rol(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let j = 0; j < 80; j++) {
      let f, k;
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (rol(a, 5) + f + e + k + w[j]) >>> 0;
      e = d; d = c; c = rol(b, 30) >>> 0; b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((x) => x.toString(16).padStart(8, "0")).join("");
}
export const hashOf = (v) => `sha1:${sha1(stable(v))}`;

const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 864e5);
export const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const ageDaysOf = (iso, today) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? daysBetween(iso, today) : null);

/** Position of a placement on one line: week, then night. Strictly smaller means strictly earlier night. */
export const posOf = (pl) => (pl.week - 1) * 7 + ALL_DAYS.indexOf(pl.day);
export const isOpenTask = (t) => !["done", "submitted", "dropped"].includes(t.status || "todo");

/** The night to keep free: the first Mon-Sat night with no task in this week.json, else Sunday. */
export function defaultRestNight(weekTasks) {
  const used = new Set((weekTasks || []).map((t) => t.day));
  return DAYS.find((d) => !used.has(d)) || PLAN_CONFIG.rest_night_fallback;
}

// ---- demands ------------------------------------------------------------------------------------

/**
 * Demands derived from the profile, ratings and proof. Pure: the same input gives the same items and source_hash.
 * `d` needs profile, skills and optionally rubric and proof. Salary is kept as a wish and is never hard.
 */
export function deriveDemands(d, today) {
  const ns = (d.profile && d.profile.north_star) || {};
  const cons = (d.profile && d.profile.constraints) || {};
  const names = Object.fromEntries((((d.rubric && d.rubric.competencies) || [])).map((c) => [c.id, c.name]));
  const ratings = (d.skills && d.skills.ratings) || {};
  const proof = (d.proof && d.proof.items) || [];
  const hours = typeof cons.hours_per_day === "number" ? cons.hours_per_day : 1;
  const items = [];
  const push = (x) => items.push(x);
  if (ns.role) push({ id: "D-role", kind: "target", text: ns.role, from: "profile.north_star.role" });
  // Data that predates the onboarding (no onboarding.json) keeps the old behaviour byte for byte. With an onboarding, every
  // demand comes from an answer: the currency from R0-06, D-learn only when P-04 says no consumption only learning.
  const onboarded = !!d.onboarding;
  const cur = (d.profile && d.profile.situation && d.profile.situation.currency) || "INR";
  const learnMode = cons.learning_mode;
  if (typeof ns.salary_inr_per_month === "number" && (ns.salary_inr_per_month > 0 || !onboarded)) push({ id: "D-salary", kind: "target", text: `${formatMoney(ns.salary_inr_per_month, cur, "none", "en-US", { display: "code" })} per month`, from: "profile.north_star.salary_inr_per_month", status: "wish_unsourced" });
  push({ id: "D-time", kind: "constraint", text: `${hours === 1 ? "One hour" : `${hours} hours`} per night, at most ${PLAN_CONFIG.max_tasks_per_night} tasks`, from: "profile.constraints.hours_per_day", hard: true });
  if (!onboarded) push({ id: "D-fast", kind: "principle", text: "Fastest route to being the best candidate for D-role", from: "dev words 2026-10-14" });
  if (!onboarded || learnMode === "make_only") push({ id: "D-learn", kind: "constraint", text: `Practise and build with critique; no consumption-only learning${cons.learns_best_by ? ` (${cons.learns_best_by})` : ""}`, from: onboarded ? "profile.constraints.learning_mode" : "profile.constraints.learns_best_by, profile.constraints.avoid", hard: true });
  const skillRows = [];
  for (const [k, r] of Object.entries(ratings)) {
    if (typeof r.target === "number" && typeof r.level === "number" && r.target > r.level) {
      push({ id: `D-skill-${k}`, kind: "ladder", text: `${names[k] || k} ${r.level} to ${r.target}`, from: `skills.ratings.${k}.target` });
      skillRows.push([k, r.level, r.target]);
    }
  }
  const cvIds = ["pr-cv", "pr-recruiter-view"].filter((id) => proof.some((p) => p.id === id && !["done", "verified"].includes(p.status)));
  if (cvIds.length) push({ id: "D-reach-cv", kind: "reach", text: "CV and portfolio ready for recruiters", from: `proof.${cvIds.join(", ")}` });
  (ns.recognition || []).forEach((line, i) => push({ id: `D-recog-${i + 1}`, kind: "recognition", text: line, from: `profile.north_star.recognition[${i}]` }));
  const read = {
    role: ns.role || null, salary: ns.salary_inr_per_month ?? null, hours, learns: cons.learns_best_by || null, avoid: cons.avoid || [],
    skills: skillRows, cv: cvIds, recognition: ns.recognition || [],
    // Only present once an onboarding set them, so earlier data hashes exactly as before.
    ...(onboarded ? { onboarded: true, currency: cur, learning_mode: learnMode || null } : {}),
  };
  return { updated: today, source_hash: hashOf(read), items };
}

// ---- placement ----------------------------------------------------------------------------------

/**
 * Deterministic placement of tasks onto nights.
 *
 * tasks: [{ id, minutes, track, depends_on?: string[], wait_days?: number, rank?: number, later?: boolean, where?: "phone"|"desk" }]
 * constraints (all optional, defaults from PLAN_CONFIG):
 *   weeks, per_week_evenings, max_tasks_per_night, max_min_per_night, slack_pct, rest_night, from_day (first night of week 1),
 *   occupied: [{ week, day, minutes, track }] nights already taken (for a re-plan)
 * returns { placements, overflow, notes }
 *
 * Rules: dependencies are placed on a strictly earlier night; a wait of N days puts the dependent N or more days after;
 * 15 to 60 minute tasks; at most 2 tasks and 60 minutes a night; the rest night is never used; only per_week_evenings
 * distinct nights a week; a week keeps at least slack_pct of its capacity unplanned; one task of each track per night
 * where one is ready; same input always gives the same output.
 */
export function placeTasks(tasks, constraints = {}) {
  const c = { ...PLAN_CONFIG, weeks: PLAN_CONFIG.horizon_weeks, rest_night: PLAN_CONFIG.rest_night_fallback, from_day: "Mon", occupied: [], ...constraints };
  const notes = [];
  const overflow = [];
  const capacity = c.per_week_evenings * c.max_min_per_night;
  const usable = Math.floor(capacity * (1 - c.slack_pct));
  const nights = DAYS.filter((dn) => dn !== c.rest_night);
  const fromAt = nights.findIndex((n) => DAYS.indexOf(n) >= DAYS.indexOf(c.from_day));
  const fromIdx = fromAt < 0 ? nights.length : fromAt;
  const grid = {};
  const weekUsed = {};
  const weekNights = {};
  const key = (w, dn) => `${w}|${dn}`;
  for (const o of c.occupied || []) {
    const k = key(o.week, o.day);
    const g = (grid[k] ||= { minutes: 0, ids: [], tracks: new Set() });
    g.minutes += o.minutes; g.tracks.add(o.track); g.ids.push(`~${o.day}`);
    weekUsed[o.week] = (weekUsed[o.week] || 0) + o.minutes;
    (weekNights[o.week] ||= new Set()).add(o.day);
  }

  const byId = new Map();
  const index = new Map();
  tasks.forEach((t, i) => { index.set(t.id, i); });
  for (const t of tasks) {
    if (byId.has(t.id)) { overflow.push({ id: t.id, reason: "duplicate task id" }); continue; }
    byId.set(t.id, t);
  }
  const bad = new Set();
  for (const t of byId.values()) {
    if (!Number.isInteger(t.minutes) || t.minutes < c.min_task_min || t.minutes > c.max_task_min) { overflow.push({ id: t.id, reason: `${t.minutes} min is outside ${c.min_task_min} to ${c.max_task_min}; split or merge it` }); bad.add(t.id); }
    else if (!["skill", "reach"].includes(t.track)) { overflow.push({ id: t.id, reason: "track must be skill or reach" }); bad.add(t.id); }
  }
  // Unknown dependencies and cycles overflow the task and everything that depends on it.
  const deps = (t) => (Array.isArray(t.depends_on) ? t.depends_on : []);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of byId.values()) {
      if (bad.has(t.id)) continue;
      for (const dep of deps(t)) {
        if (!byId.has(dep)) { overflow.push({ id: t.id, reason: `depends on ${dep}, which is not in this set` }); bad.add(t.id); grew = true; break; }
        if (bad.has(dep)) { overflow.push({ id: t.id, reason: `depends on ${dep}, which could not be placed` }); bad.add(t.id); grew = true; break; }
      }
    }
  }
  // Topological order with a stable tie-break: later tasks first, then rank, then input order.
  const pending = [...byId.values()].filter((t) => !bad.has(t.id));
  const order = [];
  const done = new Set();
  const keyOf = (t) => [t.later || t.status === "later" ? 0 : 1, Number.isFinite(t.rank) ? t.rank : 1e6, index.get(t.id)];
  const cmp = (a, b) => { const x = keyOf(a), y = keyOf(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  while (pending.length) {
    const ready = pending.filter((t) => deps(t).every((dep) => done.has(dep) || bad.has(dep))).sort(cmp);
    if (!ready.length) {
      for (const t of pending) overflow.push({ id: t.id, reason: "dependency cycle" });
      notes.push(`Dependency cycle among ${pending.map((t) => t.id).join(", ")}; none of them were placed.`);
      break;
    }
    const t = ready[0];
    order.push(t);
    done.add(t.id);
    pending.splice(pending.indexOf(t), 1);
  }

  const placed = new Map(); // id -> {week, day, why}
  for (const t of order) {
    let minDay = 0;
    let waitFrom = null;
    let depFrom = null;
    for (const dep of deps(t)) {
      const p = placed.get(dep);
      if (!p) continue;
      const need = posOf(p) + Math.max(1, Number.isInteger(t.wait_days) && t.wait_days > 0 ? t.wait_days : 1);
      if (need > minDay) { minDay = need; depFrom = dep; waitFrom = t.wait_days > 1 ? dep : null; }
    }
    const rejects = new Set();
    let first = null;
    let balanced = null;
    for (let w = 1; w <= c.weeks; w++) {
      for (let ni = 0; ni < nights.length; ni++) {
        if (w === 1 && ni < fromIdx) continue;
        const dn = nights[ni];
        const pos = posOf({ week: w, day: dn });
        if (pos < minDay) { rejects.add("dependency"); continue; }
        const g = grid[key(w, dn)] || { minutes: 0, ids: [], tracks: new Set() };
        if (g.ids.length >= c.max_tasks_per_night) { rejects.add("night_tasks"); continue; }
        if (g.minutes + t.minutes > c.max_min_per_night) { rejects.add("night_minutes"); continue; }
        if ((weekUsed[w] || 0) + t.minutes > usable) { rejects.add("week_full"); continue; }
        const nset = weekNights[w] || new Set();
        if (!nset.has(dn) && nset.size >= c.per_week_evenings) { rejects.add("evenings"); continue; }
        if (!first) first = { week: w, day: dn, rejects: new Set(rejects) };
        if (!g.tracks.has(t.track)) { balanced = { week: w, day: dn }; break; }
      }
      // The first feasible night fixes the week; a balanced night is only looked for inside that week.
      if (first) break;
    }
    const pick = balanced || (first && { week: first.week, day: first.day });
    if (!pick) {
      overflow.push({ id: t.id, reason: `no night left in ${c.weeks} weeks within the limits` });
      // Anything that depends on it cannot be placed either: the next loop iterations see no placed dep and overflow too.
      bad.add(t.id);
      continue;
    }
    const k = key(pick.week, pick.day);
    const g = (grid[k] ||= { minutes: 0, ids: [], tracks: new Set() });
    g.minutes += t.minutes; g.ids.push(t.id); g.tracks.add(t.track);
    weekUsed[pick.week] = (weekUsed[pick.week] || 0) + t.minutes;
    (weekNights[pick.week] ||= new Set()).add(pick.day);
    // The decisive constraint, in plain words.
    let why;
    const atEarliest = first && pick.week === first.week && pick.day === first.day;
    if (waitFrom) why = `Waits ${t.wait_days} days after ${waitFrom} so the other person has time to reply.`;
    else if (depFrom && minDay > 0 && first && first.rejects.has("dependency") && !first.rejects.has("week_full") && !first.rejects.has("night_tasks") && !first.rejects.has("night_minutes")) why = `Needs ${depFrom} first, so it goes on the next night after it.`;
    else if (first && first.rejects.has("week_full")) why = `The earlier week is at the ${Math.round((1 - c.slack_pct) * 100)}% line that keeps slack, so this moves to week ${first.week}.`;
    else if (first && (first.rejects.has("night_tasks") || first.rejects.has("night_minutes") || first.rejects.has("evenings"))) why = "Earlier nights were full (two tasks, 60 minutes or five evenings), so this is the next open night.";
    else if (t.later || t.status === "later") why = "Set aside last time, so it goes first.";
    else why = "First open night, in the order of the gaps.";
    if (!atEarliest && balanced) why = `${why} Paired with a ${t.track === "skill" ? "reach" : "skill"} task so the night has one of each.`;
    if (t.where === "phone") why = `${why} Phone only, so it fits a tired night.`;
    placed.set(t.id, { week: pick.week, day: pick.day, why });
  }

  // Order within a night follows the order of placement; load and single-track reasons are computed from the final grid.
  const placements = [];
  const seq = new Map(order.map((t, i) => [t.id, i]));
  const ids = [...placed.keys()].sort((a, b) => posOf(placed.get(a)) - posOf(placed.get(b)) || seq.get(a) - seq.get(b));
  const counters = {};
  for (const id of ids) {
    const p = placed.get(id);
    const t = byId.get(id);
    const k = key(p.week, p.day);
    counters[k] = (counters[k] || 0) + 1;
    const g = grid[k];
    const row = { id, week: p.week, day: p.day, order: counters[k], slot_min: t.minutes, placed_because: p.why, depends_on: deps(t).slice(), load_that_day_min: g.minutes };
    if (g.tracks.size === 1) {
      const other = t.track === "skill" ? "reach" : "skill";
      row.single_track_reason = `No ${other} task was ready for this night (dependency, wait or load).`;
    }
    placements.push(row);
  }
  for (let w = 1; w <= c.weeks; w++) {
    const used = weekUsed[w] || 0;
    if (used) notes.push(`Week ${w}: ${used} of ${usable} planned minutes (capacity ${capacity}, ${Math.round(c.slack_pct * 100)}% kept as slack), ${(weekNights[w] || new Set()).size} of ${c.per_week_evenings} evenings.`);
  }
  notes.push(`Rest night: ${c.rest_night}. Sunday is the weekly check, not a task night.`);
  if (overflow.length) notes.push(`${overflow.length} task${overflow.length === 1 ? "" : "s"} did not fit: ${overflow.map((o) => o.id).join(", ")}.`);
  return { placements, overflow, notes };
}

// ---- forecast -----------------------------------------------------------------------------------

/**
 * The plan's forecast: readyBy over gaps whose evenings come from their open plan tasks (one evening per 30 minutes).
 * Returns the PlanFile.forecast shape. A gap with no open task and no waiting reason gives ready_by null with a reason.
 */
export function planForecast(s, pace, opts = {}) {
  const today = opts.today;
  const plan = s.plan;
  const perWeek = opts.perWeek;
  const gaps = ((s.library && s.library.gaps) || []).map((g) => ({ ...g }));
  const open = gaps.filter((g) => g.status !== "closed");
  // Open minutes per gap: plan tasks that are open and not closed in week.json (matched by id).
  const closedInWeek = new Set((((s.week && s.week.tasks) || []).filter((x) => ["done", "submitted"].includes(x.status))).map((x) => x.id));
  const minutesBy = {};
  const planned = {};
  for (const [id, t] of Object.entries((plan && plan.tasks) || {})) {
    if (!t.gap) continue;
    planned[t.gap] = (planned[t.gap] || 0) + 1;
    if (isOpenTask(t) && !closedInWeek.has(id)) minutesBy[t.gap] = (minutesBy[t.gap] || 0) + (t.minutes || 0);
  }
  const empty = open.filter((g) => !planned[g.id] && !(g.waiting_days > 0));
  const base = { as_of: today, depends_on: [] };
  if (empty.length) {
    return { ready_by: null, range: null, confidence: null, ...base, reason: `${empty.map((g) => g.id).join(", ")} ${empty.length === 1 ? "has" : "have"} no planned tasks, so there is no date`, reproduce: { inputs_hash: hashOf({ empty: empty.map((g) => g.id) }) } };
  }
  // The planner owns these gaps: evenings come from open minutes as of today, so the count starts at as_of and
  // finished tasks are already out of the minutes (week is emptied so readyBy does not subtract them twice).
  for (const g of gaps) if (planned[g.id]) { const m = minutesBy[g.id] || 0; g.evenings = Math.ceil(m / 30); g.estimated = today; g.evenings_basis = `planner: ${m} open task minutes in 30 minute evenings`; }
  const st = { library: { ...(s.library || {}), gaps }, week: { tasks: [] } };
  const o = { today, ...(perWeek ? { perWeek } : {}) };
  const rb = readyBy(st, pace, o);
  if (!rb) return { ready_by: null, range: null, confidence: null, ...base, reason: "no open gap has an estimate", reproduce: { inputs_hash: hashOf(forecastInputs(st, pace, o)) } };
  return {
    ready_by: rb.date,
    range: { earliest: rb.range.earliest, latest: rb.range.latest },
    confidence: rb.confidence,
    depends_on: rb.basis.depends_on,
    as_of: today,
    reproduce: { inputs_hash: hashOf(forecastInputs(st, pace, o)) },
  };
}

// ---- status for the app and the brief -----------------------------------------------------------

/** Plain facts about the plan for one screen or one brief line. Never throws on missing files. */
export function planStatus(d, today) {
  const p = d.plan;
  const research = (d.research && d.research.items) || [];
  const stale = research.filter((r) => {
    const a = ageDaysOf(r.retrieved, today);
    return a === null || (Number.isInteger(r.fresh_days) && a > r.fresh_days) || (r.verified && ["mismatch", "unreachable"].includes(r.verified.result));
  }).length;
  if (!p || p.status === "closed") {
    return { has_plan: false, horizon: null, weeks_done: 0, review_due: false, stale_research_count: stale, next_action: PLAN_PHRASES.plan, next_action_note: `No plan yet. Say "${PLAN_PHRASES.plan}" in Claude Code to get four weeks, researched and placed.` };
  }
  const weeks = p.weeks || [];
  const weeksDone = weeks.filter((w) => w.status === "done").length;
  const all = Object.values(p.tasks || {});
  const doneShare = all.length ? all.filter((t) => ["done", "submitted"].includes(t.status)).length / all.length : 0;
  const rev = p.review || {};
  const lastWeekly = rev.weekly_last || null;
  const weeklyAge = lastWeekly ? ageDaysOf(lastWeekly, today) : ageDaysOf(p.starts, today);
  const overdue = (rev.four_week_due && rev.four_week_due < today) || (p.ends && p.ends < today);
  const weeklyOld = p.status === "active" && weeklyAge !== null && weeklyAge > PLAN_CONFIG.weekly_check_max_days;
  const suggest = doneShare >= PLAN_CONFIG.review_suggest_done_share || stale > 3;
  const review_due = !!(overdue || weeklyOld || suggest) && p.status !== "closed";
  let next_action = PLAN_PHRASES.check;
  let note = `The plan is on track. Say "${PLAN_PHRASES.check}" in Claude Code on Sunday.`;
  if (p.status === "draft") { next_action = PLAN_PHRASES.plan; note = `The plan is a draft. Say "${PLAN_PHRASES.plan}" in Claude Code to look at the diff and approve it.`; }
  else if (overdue) { next_action = PLAN_PHRASES.review; note = `Your four weeks are up. Say "${PLAN_PHRASES.review}" in Claude Code, then plan the next four.`; }
  else if (weeklyOld) { next_action = PLAN_PHRASES.check; note = `The weekly check is overdue. Say "${PLAN_PHRASES.check}" in Claude Code.`; }
  else if (suggest) { next_action = PLAN_PHRASES.review; note = `The plan is close to done or has stale research. Say "${PLAN_PHRASES.review}" in Claude Code.`; }
  return { has_plan: true, horizon: p.horizon_weeks, weeks_done: weeksDone, review_due, stale_research_count: stale, next_action, next_action_note: note };
}

// ---- guarded write helpers (shared by lib/store.ts actions and lib/bridge.ts imports) ------------
// Pure: they return the new value plus a list of problems. A caller refuses the whole write when problems is not empty.

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIER_CAP = { 1: 0.9, 2: 0.75, 3: 0.55, 4: 0.35 };
const words = (s) => (typeof s === "string" ? s.trim().split(/\s+/).filter(Boolean).length : 0);
/** Lowercase, quotes straightened, everything but letters and digits collapsed to one space. */
export const normClaim = (x) => String(x ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Tasks whose status the person or a run has settled. A re-sent plan never reopens them. */
export const SETTLED = ["done", "submitted", "dropped"];

/** Problems with one research item as a write would see it (not the cross-file ids; the shared validator does those). */
export function researchItemProblems(r, today) {
  const at = r && r.id ? r.id : "a research item";
  const p = [];
  if (!r || typeof r !== "object" || Array.isArray(r)) return ["a research item is not an object"];
  if (typeof r.id !== "string" || !r.id.trim()) p.push("a research item has no id");
  if (!r.subject || typeof r.subject !== "object" || typeof r.subject.id !== "string") p.push(`${at} needs a subject with a type and id`);
  if (typeof r.claim !== "string" || !r.claim.trim()) p.push(`${at} has no claim`);
  if (typeof r.source_url !== "string" || !/^https?:\/\/\S+$/.test(r.source_url)) p.push(`${at}.source_url must be an http or https address`);
  if (typeof r.source_name !== "string" || !r.source_name.trim()) p.push(`${at} has no source_name`);
  if (![1, 2, 3, 4].includes(r.tier)) p.push(`${at}.tier must be 1 to 4`);
  if (!ISO_RE.test(r.retrieved || "")) p.push(`${at}.retrieved must be YYYY-MM-DD`);
  else if (today && r.retrieved > today) p.push(`${at}.retrieved is in the future`);
  if (r.published !== null && r.published !== undefined && !ISO_RE.test(r.published)) p.push(`${at}.published must be YYYY-MM-DD or null`);
  const unreachable = r.verified && r.verified.result === "unreachable";
  if (typeof r.excerpt !== "string" || !r.excerpt.trim()) { if (!unreachable) p.push(`${at} needs a verbatim excerpt of 25 words or fewer`); }
  else if (words(r.excerpt) > 25) p.push(`${at}.excerpt is ${words(r.excerpt)} words; keep it to 25 or fewer`);
  if (typeof r.confidence !== "number" || r.confidence < 0 || r.confidence > 1) p.push(`${at}.confidence must be 0 to 1`);
  if (!(Number.isInteger(r.fresh_days) && r.fresh_days > 0)) p.push(`${at}.fresh_days must be a whole number of days`);
  return p;
}

/**
 * Adds research items to the existing list.
 * Never overwrites a verified match with an unsourced or unverified copy; never brings back a claim that failed its check
 * (verified.result "mismatch"); an identical item is skipped quietly. Confidence is capped by tier.
 * Returns { items, added, updated, skipped: [{id, why}], problems }.
 */
export function mergeResearch(existing, incoming, today) {
  const items = (existing || []).map((x) => ({ ...x }));
  const problems = [];
  const skipped = [];
  const added = [];
  const updated = [];
  const seen = new Set();
  for (const raw of incoming || []) {
    const bad = researchItemProblems(raw, today);
    if (bad.length) { problems.push(...bad); continue; }
    if (seen.has(raw.id)) { problems.push(`${raw.id} appears twice in this batch`); continue; }
    seen.add(raw.id);
    const r = { ...raw };
    const cap = TIER_CAP[r.tier];
    if (r.confidence > cap) r.confidence = cap;
    if (r.published === null || r.published === undefined) { if (r.tier < 3) r.tier = 3; r.confidence = Math.min(r.confidence, TIER_CAP[r.tier]); r.published = null; }
    const byId = items.findIndex((x) => x.id === r.id);
    const dup = byId < 0 ? items.findIndex((x) => normClaim(x.source_url) === normClaim(r.source_url) && normClaim(x.claim) === normClaim(r.claim)) : -1;
    const cur = items[byId >= 0 ? byId : dup];
    if (cur) {
      const curRes = cur.verified && cur.verified.result;
      if (curRes === "mismatch") { problems.push(`${r.id}: ${cur.id} failed its check and was removed from use; send a new claim with a new id and a different excerpt`); continue; }
      const newRes = r.verified && r.verified.result;
      if (curRes === "match" && newRes !== "match") { problems.push(`${r.id}: ${cur.id} is verified; an unverified copy would overwrite it`); continue; }
      if (byId < 0) { skipped.push({ id: r.id, why: `same claim and page as ${cur.id}` }); continue; }
      if (stable(cur) === stable(r)) { skipped.push({ id: r.id, why: "already there, unchanged" }); continue; }
      items[byId] = r;
      updated.push(r.id);
      continue;
    }
    items.push(r);
    added.push(r.id);
  }
  return { items, added, updated, skipped, problems };
}

/**
 * A re-sent plan may not undo what the person or a run settled. For the same plan (same starts date):
 * tasks that were done, submitted or dropped keep that status, and may not disappear.
 * A plan with a different starts date is a new plan and replaces the old one.
 * Returns { plan, kept: [ids], problems }.
 */
export function preserveTaskStatus(oldPlan, newPlan) {
  const problems = [];
  const kept = [];
  const plan = JSON.parse(JSON.stringify(newPlan));
  if (!oldPlan || !oldPlan.tasks || oldPlan.starts !== newPlan.starts) return { plan, kept, problems };
  for (const [id, t] of Object.entries(oldPlan.tasks)) {
    if (!SETTLED.includes(t.status)) continue;
    const n = plan.tasks && plan.tasks[id];
    if (!n) { problems.push(`${id} is ${t.status} and cannot disappear from the plan; mark it dropped instead`); continue; }
    if (!SETTLED.includes(n.status)) { n.status = t.status; kept.push(id); }
  }
  return { plan, kept, problems };
}

/** The week.json task shape from a plan task, keeping what the person already did with it (status, steps, hand-in, feedback). */
function weekTaskFrom(id, pt, prev) {
  const pl = pt.placement || {};
  const base = {
    id,
    day: pl.day,
    track: pt.track,
    ...(pt.competency ? { competency: pt.competency } : {}),
    ...(pt.proof ? { proof: pt.proof } : {}),
    ...(pt.kind ? { kind: pt.kind } : {}),
    ...(pt.where ? { where: pt.where } : {}),
    minutes: pt.minutes,
    points: typeof pt.points === "number" ? pt.points : 20,
    adds: pt.adds || pt.artifact || pt.task,
    task: pt.task,
    why: pt.why || "",
    steps: Array.isArray(pt.steps) ? pt.steps : [],
    artifact: pt.artifact || "",
    ...(pt.impact ? { impact: pt.impact } : {}),
    ...(pt.example ? { example: pt.example } : {}),
    ...(pt.exampleWhy ? { exampleWhy: pt.exampleWhy } : {}),
    ...(pt.link ? { link: pt.link } : {}),
    ...(pt.because ? { because: pt.because } : {}),
    ...(pt.as_of ? { as_of: pt.as_of } : {}),
    ...(pt.reviewed_by ? { reviewed_by: pt.reviewed_by } : {}),
    status: ["done", "submitted", "later"].includes(pt.status) ? pt.status : "todo",
  };
  if (!prev) return base;
  const keep = {};
  for (const k of ["status", "closed", "stepsDone", "prev", "submission", "feedback", "points"]) if (prev[k] !== undefined) keep[k] = prev[k];
  // The plan may have reworded the steps: keep only the ticks that still point at a step.
  if (Array.isArray(keep.stepsDone)) keep.stepsDone = keep.stepsDone.filter((i) => Number.isInteger(i) && i >= 0 && i < base.steps.length);
  return { ...base, ...keep };
}

/**
 * Projects plan week 1 into week.json. Keeps status, closed, stepsDone, submission, feedback and prev of every task
 * that is already in the week (matched by id). Never drops a done or handed-in task of the same week.
 * Returns { week, added, removed, kept, problems }.
 */
export function projectWeek(week, plan) {
  const problems = [];
  if (!plan || typeof plan !== "object") return { week, added: [], removed: [], kept: [], problems: ["there is no plan to project"] };
  if (plan.status !== "active") problems.push(`the plan is ${plan.status || "missing a status"}; only an active plan goes into the week`);
  const w1 = (plan.weeks || [])[0];
  if (!w1 || !Array.isArray(w1.tasks)) return { week, added: [], removed: [], kept: [], problems: [...problems, "the plan has no first week"] };
  const same = week && week.week_of === w1.week_of;
  const old = new Map(((week && week.tasks) || []).map((t) => [t.id, t]));
  if (same) {
    for (const t of old.values()) if (["done", "submitted"].includes(t.status) && !w1.tasks.includes(t.id)) problems.push(`${t.id} is ${t.status} this week and is not in plan week 1; it would be lost`);
  }
  const order = [];
  for (const id of w1.tasks) {
    const pt = plan.tasks && plan.tasks[id];
    if (!pt) { problems.push(`plan week 1 lists ${id}, which is not in the plan`); continue; }
    if (pt.status === "dropped") continue;
    if (!pt.placement || !DAYS.includes(pt.placement.day)) { problems.push(`${id} has no placement day`); continue; }
    order.push([id, pt]);
  }
  order.sort((a, b) => DAYS.indexOf(a[1].placement.day) - DAYS.indexOf(b[1].placement.day) || (a[1].placement.order || 0) - (b[1].placement.order || 0));
  const tasks = order.map(([id, pt]) => weekTaskFrom(id, pt, same || (old.get(id) && ["done", "submitted"].includes(old.get(id).status)) ? old.get(id) : undefined));
  const next = { ...(week || {}), week_of: w1.week_of, tasks };
  if (!same) {
    next.focus = w1.goal || next.focus || "";
    delete next.focus_short;
  }
  const ids = new Set(tasks.map((t) => t.id));
  return {
    week: next,
    added: tasks.filter((t) => !old.has(t.id)).map((t) => t.id),
    removed: [...old.keys()].filter((id) => !ids.has(id)),
    kept: tasks.filter((t) => same && old.has(t.id) && old.get(t.id).status !== "todo").map((t) => t.id),
    problems,
  };
}

/** Appends a run record, keeping the last 60. A reused id is refused. */
export function appendRun(runs, run) {
  const list = ((runs && runs.runs) || []).slice();
  const problems = [];
  if (!run || typeof run !== "object" || typeof run.id !== "string" || !run.id) problems.push("a run needs an id");
  else if (list.some((r) => r.id === run.id)) problems.push(`run ${run.id} is already in the log`);
  if (run && !["complete", "partial", "aborted"].includes(run.status)) problems.push("a run status must be complete, partial or aborted");
  if (run && (typeof run.command !== "string" || !run.command)) problems.push("a run needs a command");
  return { runs: { runs: problems.length ? list : [...list, run].slice(-60) }, problems };
}

/** Appends a review record. A reused id is refused, so a review is never rewritten after the fact. */
export function appendReview(reviews, review) {
  const list = ((reviews && reviews.reviews) || []).slice();
  const problems = [];
  if (!review || typeof review !== "object" || typeof review.id !== "string" || !review.id) problems.push("a review needs an id");
  else if (list.some((r) => r.id === review.id)) problems.push(`review ${review.id} is already saved; reviews are not rewritten`);
  return { reviews: { reviews: problems.length ? list : [...list, review] }, problems };
}

/** Lowercase, straight quotes, dashes as spaces, no zero-width marks, whitespace collapsed. Used to compare an excerpt with a page. */
export const normExcerpt = (x) => String(x ?? "")
  .replace(/[​-‍﻿]/g, "")
  .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
  .replace(/[‐-―−]/g, "-")
  .replace(/ /g, " ").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Checks excerpts against page text that Claude saved after fetching. Fetches nothing.
 * items: research items [{ id, excerpt }]. pages: [{ id, fetched_text, http? }] matched to items by id.
 * Result per item: "match" (excerpt is a substring after normalising), "mismatch" (page read, words not there),
 * "unreachable" (no text, or an http status that is not 2xx). "paraphrase" is a judgment only a reader can make and is never returned here.
 */
export function verifyExcerpts(items, pages) {
  const pageBy = new Map((pages || []).map((p) => [p.id, p]));
  const matched = [];
  const failed = [];
  const missing = [];
  for (const it of items || []) {
    const pg = pageBy.get(it.id);
    if (!pg) { missing.push(it.id); continue; }
    const http = Number.isInteger(pg.http) ? pg.http : undefined;
    const text = typeof pg.fetched_text === "string" ? pg.fetched_text : "";
    if ((http !== undefined && (http < 200 || http > 299)) || !text.trim()) { failed.push({ id: it.id, result: "unreachable", http, why: http !== undefined && (http < 200 || http > 299) ? `page answered ${http}` : "no page text was saved" }); continue; }
    const ex = normExcerpt(it.excerpt);
    if (!ex) { failed.push({ id: it.id, result: "mismatch", http, why: "the item has no excerpt to check" }); continue; }
    if (normExcerpt(text).includes(ex)) matched.push({ id: it.id, result: "match", http });
    else failed.push({ id: it.id, result: "mismatch", http, why: "the excerpt is not on the page" });
  }
  return { matched, failed, missing };
}
