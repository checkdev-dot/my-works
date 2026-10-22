// Ready-by forecast as a pure function. Same arithmetic as gapForecast/readyBy in components/App.tsx,
// plus what that code leaves out: the inputs used (basis), an honest range, a confidence, and a
// "late" status that is reported instead of clamped to today.
export const PACE = { lighter: 3, steady: 5, push: 6 };
/** Rule of thumb for the range: Claude's evenings estimate can be 25% high or 50% low. A rule, not a measurement. */
export const SPREAD = { low: 0.75, high: 1.5 };
const THIRD_PARTY = /\b(repl(y|ies)|outside|two reviews|recruiter|mentor|peer review)\b/;

const isoToday = () => new Date().toLocaleDateString("en-CA");
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 864e5);
const isClosed = (t) => t.status === "done" || t.status === "submitted";

/**
 * Per gap: { date (never clamped), evenings, late, status } or null when the gap has no estimate.
 * `late` means the date is already before today; the caller decides how to say it.
 */
export function gapForecast(s, pace, opts = {}) {
  const today = opts.today || isoToday();
  const perWeek = opts.perWeek ?? PACE[pace] ?? PACE.steady;
  const gaps = (s.library && s.library.gaps) || [];
  const live = gaps.filter((x) => x.status !== "closed");
  const refreshed = (s.library && s.library.refreshed) || today;
  const since = live.map((g) => g.estimated || refreshed).sort()[0] || today;
  const worked = { skill: 0, reach: 0 };
  for (const x of (s.week && s.week.tasks) || []) if (isClosed(x) && x.closed && x.closed >= since) worked[x.track] = (worked[x.track] || 0) + 1;
  const used = { skill: -worked.skill, reach: -worked.reach };
  const out = {};
  for (const g of live) {
    if (g.evenings === undefined) { out[g.id] = null; continue; }
    const slot = g.track || "skill";
    used[slot] += g.evenings;
    const left = Math.max(used[slot], 0);
    const days = Math.ceil((left / perWeek) * 7);
    const from = g.estimated || refreshed;
    const date = addDays(from, days);
    const late = date < today;
    out[g.id] = { date, evenings: Math.max(0, Math.min(g.evenings, used[slot])), late, status: late ? "late" : "on_track", _left: left, _slot: slot, _from: from };
  }
  return out;
}

/**
 * Everything readyBy reads, normalised, so a stored forecast can say which inputs it used and a check can hash them.
 * Same arithmetic inputs as gapForecast: pace, evenings per week, each open gap, and finished tasks since the estimate.
 */
export function forecastInputs(s, pace, opts = {}) {
  const today = opts.today || isoToday();
  const perWeek = opts.perWeek ?? PACE[pace] ?? PACE.steady;
  const live = ((s.library && s.library.gaps) || []).filter((x) => x.status !== "closed");
  const refreshed = (s.library && s.library.refreshed) || today;
  const since = live.map((g) => g.estimated || refreshed).sort()[0] || today;
  const worked = { skill: 0, reach: 0 };
  for (const x of (s.week && s.week.tasks) || []) if (isClosed(x) && x.closed && x.closed >= since) worked[x.track] = (worked[x.track] || 0) + 1;
  return {
    pace, per_week: perWeek, spread: SPREAD, worked, refreshed,
    gaps: live.map((g) => ({ id: g.id, evenings: g.evenings ?? null, track: g.track || "skill", estimated: g.estimated || null, waiting_days: Number.isInteger(g.waiting_days) ? g.waiting_days : 0, third_party: THIRD_PARTY.test(g.closes_when || "") })),
  };
}

/**
 * The date every open gap closes at this pace, with its basis, range and confidence.
 * Returns null when no open gap has an estimate. `date` is the raw likely date, never clamped.
 * `shown_date` is today when the result is late, so a UI can keep its old wording without hiding `status`.
 */
export function readyBy(s, pace, opts = {}) {
  const today = opts.today || isoToday();
  const perWeek = opts.perWeek ?? PACE[pace] ?? PACE.steady;
  const eta = gapForecast(s, pace, { today, perWeek });
  const live = ((s.library && s.library.gaps) || []).filter((x) => x.status !== "closed");
  const known = live.filter((g) => eta[g.id]);
  if (!known.length) return null;
  const likely = known.map((g) => eta[g.id].date).sort().pop();
  const evenings = known.reduce((a, g) => a + g.evenings, 0);
  const waiting = known.reduce((a, g) => a + (Number.isInteger(g.waiting_days) ? g.waiting_days : 0), 0);
  // Earliest and latest rescale the remaining evenings of the slot that ends last.
  const scaled = (k) => {
    let latest = null;
    for (const g of known) {
      const e = eta[g.id];
      const d = addDays(e._from, Math.ceil(((e._left * k) / perWeek) * 7));
      if (!latest || d > latest) latest = d;
    }
    return latest;
  };
  const earliest = scaled(SPREAD.low);
  const latestRaw = scaled(SPREAD.high);
  const latest = waiting ? addDays(latestRaw, waiting) : latestRaw;
  const noBasis = known.filter((g) => !g.evenings_basis).length;
  const stale = known.filter((g) => g.estimated && daysBetween(g.estimated, today) > 14).length;
  const third = known.filter((g) => THIRD_PARTY.test(g.closes_when || "")).map((g) => g.id);
  let confidence = 0.5;
  if (noBasis === known.length) confidence -= 0.15;
  if (stale) confidence -= 0.1;
  if (live.length > known.length) confidence -= 0.1;
  if (third.length) confidence -= 0.1;
  confidence = Math.max(0.1, Math.round(confidence * 100) / 100);
  const late = likely < today;
  return {
    date: likely,
    shown_date: late ? today : likely,
    status: late ? "late" : "on_track",
    open: live.length,
    unknown: live.length - known.length,
    range: { earliest, likely, latest },
    confidence,
    confidence_label: confidence < 0.3 ? "low" : confidence < 0.5 ? "medium" : "fair",
    as_of: today,
    reviewed_by: "claude",
    basis: {
      rule: "evenings left in each slot / evenings per week, counted from the day Claude estimated; finished tasks since then come off the first gaps",
      pace,
      per_week: perWeek,
      evenings_total: evenings,
      gaps: known.map((g) => ({ id: g.id, evenings: g.evenings, track: g.track || "skill", estimated: g.estimated || null, evenings_basis: g.evenings_basis || null, date: eta[g.id].date, status: eta[g.id].status })),
      estimated_dates: [...new Set(known.map((g) => g.estimated).filter(Boolean))],
      unestimated: live.filter((g) => !eta[g.id]).map((g) => g.id),
      without_basis: noBasis,
      depends_on: third,
      waiting_days: waiting,
      spread: SPREAD,
    },
  };
}
