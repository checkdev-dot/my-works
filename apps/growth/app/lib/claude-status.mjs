// One status line for the Commands page and the Needs-you sheet. Reads only fields that exist: runs.runs[] (started, ended)
// or, when no run is recorded, queue.items[].done. Nothing is invented: no record says "never".
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const say = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]}`; };

/** @param {any} s the app state @returns {{ last: string | null, questions: number, tasks: number, sentence: string }} */
export function claudeStatus(s) {
  const runs = s?.runs?.runs ?? [];
  const stamps = [
    ...runs.map((r) => (typeof r.ended === "string" ? r.ended : r.started)),
    ...(s?.queue?.items ?? []).filter((q) => q.status === "done").map((q) => q.done),
  ].map((v) => (typeof v === "string" ? v : null)).filter(Boolean).sort();
  const last = stamps.length ? stamps[stamps.length - 1] : null;
  const pending = (s?.queue?.items ?? []).filter((q) => q.status === "pending");
  const questions = pending.filter((q) => q.type === "ask").length;
  const tasks = pending.length - questions;
  const lastText = last ? (day(last) ? say(day(last)) : String(last)) : null;
  // runs.json is the only record of a run. Without it, the date comes from an answered queue item: say that, not "ran".
  const hasRuns = Array.isArray(s?.runs?.runs);
  const head = lastText === null ? "Claude has not answered anything yet."
    : hasRuns ? `Claude last ran: ${lastText}.` : `Claude last answered something: ${lastText}.`;
  const tail = pending.length === 0 ? "Nothing is queued for Claude yet."
    : `When you say “answer it”, it reads: ${[questions ? `${questions} ${questions === 1 ? "question" : "questions"}` : "", tasks ? `${tasks} ${tasks === 1 ? "task" : "tasks"}` : ""].filter(Boolean).join(", ")}.`;
  return { last, questions, tasks, sentence: `${head} ${tail}` };
}
