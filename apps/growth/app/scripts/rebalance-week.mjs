// Dry run: how the live week.json would be laid out under the person's own limits. Prints; writes nothing.
// Run: node scripts/rebalance-week.mjs [--from Wed] [--rest Sun] [--json]
// Limits: PLAN_CONFIG in lib/plan.mjs (2 tasks and 60 minutes a night, 5 evenings, 10% slack, one rest night).
// Done and handed-in tasks keep their nights. Open tasks are placed in week order, saved-for-later first.
// Tasks that do not fit this week are listed with the gap they belong to and where they would land.
import { loadData, todayISO } from "./_data.mjs";
import { placeTasks, PLAN_CONFIG, DAYS } from "../lib/plan.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const d = loadData();
const today = todayISO();
const wk = d.week;
const tasks = wk.tasks || [];
const closed = (t) => ["done", "submitted"].includes(t.status);

/** Which gap a task belongs to: a gap that lists it, a pick that names both, else the open gap of the same skill (marked). */
export function gapOf(t, library) {
  const gaps = (library && library.gaps) || [];
  const listed = gaps.find((g) => (g.tasks || []).includes(t.id));
  if (listed) return { gap: listed.id, basis: "listed on the gap" };
  const pick = ((library && library.picks) || []).find((p) => p.task === t.id && p.gap);
  if (pick) return { gap: pick.gap, basis: "a pick ties them" };
  const same = gaps.find((g) => g.status !== "closed" && t.competency && g.competency === t.competency);
  if (same) return { gap: same.id, basis: "same skill (a guess)" };
  const track = gaps.find((g) => g.status !== "closed" && (g.track || "skill") === t.track && !t.competency);
  if (track) return { gap: track.id, basis: `same track, ${t.track} (a guess)` };
  return { gap: null, basis: "no gap found" };
}

// First night that can still be used: today when it falls inside this week, else Monday.
const idxToday = Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${wk.week_of}T00:00:00Z`)) / 864e5);
const from = opt("--from") || (idxToday >= 0 && idxToday <= 5 ? DAYS[idxToday] : "Mon");
// Sunday is the weekly check, never a task night; with 5 evenings of 6 nights, one weeknight is free as well.
const rest = opt("--rest") || PLAN_CONFIG.rest_night_fallback;
const occupied = tasks.filter(closed).map((t) => ({ week: 1, day: t.day, minutes: t.minutes, track: t.track }));
const open = tasks.filter((t) => !closed(t));
const input = open.map((t, i) => ({ id: t.id, minutes: t.minutes, track: t.track, rank: i, later: t.status === "later", where: t.where }));
const out = placeTasks(input, { weeks: 2, rest_night: rest, from_day: from, occupied });
const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
const capacity = PLAN_CONFIG.per_week_evenings * PLAN_CONFIG.max_min_per_night;
const usable = Math.floor(capacity * (1 - PLAN_CONFIG.slack_pct));
const openMin = open.reduce((s, t) => s + t.minutes, 0);
const doneMin = tasks.filter(closed).reduce((s, t) => s + t.minutes, 0);
const thisWeek = out.placements.filter((p) => p.week === 1);
const nextWeek = out.placements.filter((p) => p.week === 2);
const overflow = [
  ...nextWeek.map((p) => ({ id: p.id, minutes: p.slot_min, track: byId[p.id].track, lands: `week 2 ${p.day}`, ...gapOf(byId[p.id], d.library) })),
  ...out.overflow.map((o) => ({ id: o.id, minutes: byId[o.id] ? byId[o.id].minutes : null, track: byId[o.id] && byId[o.id].track, lands: "not placed", reason: o.reason, ...gapOf(byId[o.id] || {}, d.library) })),
];
const result = {
  today, week_of: wk.week_of, from, rest_night: rest,
  limits: { usable_min_per_week: usable, capacity_min: capacity, max_tasks_per_night: PLAN_CONFIG.max_tasks_per_night, max_min_per_night: PLAN_CONFIG.max_min_per_night, evenings: PLAN_CONFIG.per_week_evenings },
  live: { tasks: tasks.length, minutes: openMin + doneMin, done_minutes: doneMin, open_minutes: openMin },
  fits_this_week: thisWeek.map((p) => ({ id: p.id, day: p.day, order: p.order, minutes: p.slot_min, why: p.placed_because })),
  overflow,
  notes: out.notes,
};
if (args.includes("--json")) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }
console.log(`Rebalance (dry run), week of ${wk.week_of}, from ${from}. Nothing is written.`);
console.log(`Your limits: 2 tasks and 60 minutes a night, ${PLAN_CONFIG.per_week_evenings} evenings, ${Math.round(PLAN_CONFIG.slack_pct * 100)}% slack, so ${usable} usable minutes a week (of ${capacity}).`);
console.log(`The live week holds ${tasks.length} tasks, ${openMin + doneMin} minutes (${doneMin} done, ${openMin} open).`);
console.log(`\nFits this week (${thisWeek.length}):`);
for (const p of thisWeek) console.log(`  ${p.day} #${p.order}  ${p.id.padEnd(5)} ${String(p.slot_min).padStart(2)} min  ${byId[p.id].track.padEnd(5)}  ${byId[p.id].task.slice(0, 60)}`);
console.log(`\nOverflow (${overflow.length}): these would not fit this week under your limits`);
for (const o of overflow) console.log(`  ${o.id.padEnd(5)} ${String(o.minutes ?? "?").padStart(2)} min  gap ${o.gap || "none"} (${o.basis})  ${o.lands}${o.reason ? `, ${o.reason}` : ""}`);
const per = {};
for (const o of overflow) per[o.gap || "none"] = (per[o.gap || "none"] || 0) + (o.minutes || 0);
if (overflow.length) console.log(`\nMinutes pushed out, by gap: ${Object.entries(per).map(([g, m]) => `${g} ${m}`).join(", ")}`);
console.log(`\n${out.notes.join("\n")}`);
console.log(overflow.length ? "\nThe first plan run must rebalance this week and say so. Say which tasks move and which gap each one slows." : "\nThe week already fits your limits.");
