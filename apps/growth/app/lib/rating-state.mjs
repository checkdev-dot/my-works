// The one place that says who owns a skill rating. Two words, used everywhere:
//   "Claude's estimate"  Claude set the level from evidence (it has a date)
//   "Confirmed by you"   the person accepted the level or set it himself
// Shipped work, a reviewer or a real result can back a level; that is said in `backing`, it never creates a third owner.
// Pure: no clock, no DOM.

export const ESTIMATE = "Claude's estimate";
export const CONFIRMED = "Confirmed by you";

/** @param {{ source?: string, reviewed_by?: string, as_of?: string } | null | undefined} r */
export function ratingState(r) {
  const rb = (r && r.reviewed_by) || "";
  const src = (r && r.source) || "";
  const owner = rb === "dev" || src === "self" ? "dev" : "claude";
  const label = owner === "dev" ? CONFIRMED : ESTIMATE;
  const m = r && r.as_of ? /^(\d{4}-\d{2}-\d{2})/.exec(r.as_of) : null;
  const date = m ? m[1] : null;
  const backing = src === "shipped" ? "backed by shipped work" : src === "expert" ? "read by a reviewer" : src === "market" ? "backed by a real result" : "";
  return { owner, label, dot: owner === "dev" ? "filled" : "hollow", aria: owner === "dev" ? "confirmed by you" : "Claude's estimate", date, backing };
}

/** One sentence for a list of ratings; the hero line and the list summary both read it. */
export function ratingSummary(list) {
  const n = list.length;
  const c = list.filter((r) => ratingState(r).owner === "dev").length;
  const line = n === 0 ? "" : c === 0 ? (n === 1 ? "This level is Claude's estimate. You have not confirmed it." : `All ${n} levels are Claude's estimates. You have not confirmed any yet.`) : c === n ? (n === 1 ? "You confirmed this level." : `You confirmed all ${n} levels.`) : `You confirmed ${c} of ${n} levels. The rest are Claude's estimates.`;
  return { n, confirmed: c, line };
}

/** One length phrase for every screen (minutes in, words out). */
export function lengthText(min, kind) {
  if (typeof min !== "number" || !isFinite(min) || min <= 0) return "";
  const hours = (n) => `${n} ${n === 1 ? "hour" : "hours"}`;
  if (kind === "book") return `about ${hours(Math.max(1, Math.ceil(min / 60)))} of reading`;
  if (min < 120) return `${Math.round(min)} min`;
  return `about ${hours(Math.round(min / 60))}`;
}

/** The recruiter-readiness sentence, by score. */
export function lookForText(score) {
  return score >= 80 ? "Everything recruiters look for is there." : score >= 60 ? "Most of what recruiters look for is there." : "Some of what recruiters look for is there.";
}

/** Stored notes are written about "the user". The person reads them, so they say "you": only these exact patterns change. Pure. */
export function secondPerson(text) {
  const src = String(text ?? "");
  if (!/\bthe user\b/i.test(src)) return src;
  return src
    .replace(/\bthe user['’]s\b/gi, (m) => (m[0] === "T" ? "Your" : "your"))
    .replace(/\bthe user\b/gi, (m) => (m[0] === "T" ? "You" : "you"))
    .replace(/\bthey\b/g, "you")
    .replace(/\btheir\b/g, "your");
}
