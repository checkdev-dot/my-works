// The one place that decides what needs the person, and how much. Pure: no storage, no clock, no DOM.
// Every item comes from a real field named in the comment above its rule. Nothing is invented.

export const LEVEL_ORDER = ["now", "today", "week", "fyi"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const clip = (t, n) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const iso = (d) => d.toLocaleDateString("en-CA");
const addDays = (isoDate, n) => { const d = new Date(`${isoDate}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const dayDiff = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);
const minDate = (list) => list.filter(isDate).sort()[0];
const maxDate = (list) => list.filter(isDate).sort().slice(-1)[0];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * "Carried over", defined once: a task still open (status "todo") from an earlier day this week.
 * todayIdx is Mon 0 .. Sat 5 (Sunday 6). pathIds are the tasks on tonight's path.
 * Returns { all, onPath, rest } so every screen says the same numbers.
 */
export function carriedOver(tasks, todayIdx, pathIds = []) {
  const on = new Set(pathIds);
  const all = tasks.filter((t) => t.status === "todo" && t.day && DAYS.includes(t.day) && todayIdx > DAYS.indexOf(t.day));
  return { all, onPath: all.filter((t) => on.has(t.id)), rest: all.filter((t) => !on.has(t.id)) };
}

/**
 * @param {import("./types").GrowthState} s
 * @param {Date} now
 * @param {{ unreadReplies?: number, onboarding?: { status?: string } | null }} [ctx]
 */
export function deriveAttention(s, now, ctx = {}) {
  const today = iso(now);
  const todayIdx = (now.getDay() + 6) % 7; // Mon 0 .. Sat 5; Sunday reads as 6, so every planned day has passed
  const tasks = s.week?.tasks ?? [];
  const out = [];

  // RULE asked: profile.intake[].answer === null (questions Claude asked and the person has not answered).
  const asked = (s.profile?.intake ?? []).filter((q) => q.answer === null);
  if (asked.length) out.push({ id: "asked", level: "now", kind: "asked", title: `${plural(asked.length, "question", "questions")} from Claude`, why: "Your answers decide what Claude plans first. About a minute each.", when: minDate(asked.map((q) => q.asked)), action: { type: "sheet", sheet: { kind: "intake" } }, count: asked.length });

  // RULE replies: replies Claude wrote back (week.tasks[].feedback, tests.tests[] scored, learning.briefs[], queue.items[] done with reply), minus those already seen on this device (ctx.unreadReplies).
  const unread = Math.max(0, ctx.unreadReplies ?? 0);
  if (unread > 0) {
    const dates = [
      ...tasks.filter((t) => t.feedback).map((t) => t.feedback.date),
      ...(s.tests?.tests ?? []).filter((t) => t.status === "scored").map((t) => t.scored_on ?? t.created),
      ...(s.learning?.briefs ?? []).map((b) => b.created),
      ...(s.queue?.items ?? []).filter((q) => q.status === "done" && q.reply).map((q) => q.done ?? q.created),
    ];
    out.push({ id: "replies", level: "now", kind: "replies", title: `${plural(unread, "reply", "replies")} from Claude`, why: "Reviews, briefs and scored tests are on the Commands page.", when: maxDate(dates), action: { type: "view", view: "companion" }, count: unread });
  }

  // RULE onboarding: ctx.onboarding.status (from /api/onboarding-status) is "not_started" or "paused". One today item; "in_progress" and "complete" add nothing.
  const ob = ctx.onboarding?.status;
  // Not while questions wait: the questions come first, onboarding comes back once they are answered.
  if (asked.length === 0 && (ob === "not_started" || ob === "paused")) out.push({ id: "onboarding", level: "today", kind: "onboarding", title: "Start your onboarding", why: ob === "paused" ? "Claude picks up where you stopped. About 20 minutes a sitting." : "A few rounds of questions, then your plan. About 20 minutes a sitting.", action: { type: "command", cmd: ob === "paused" ? "resume growth start" : "growth start" }, count: 1 });

  // RULE waiting: queue.items[].status === "pending" (left for Claude; it only runs when the person says so in Claude Code).
  const pending = (s.queue?.items ?? []).filter((q) => q.status === "pending");
  if (pending.length) out.push({ id: "waiting", level: "today", kind: "waiting", title: `${plural(pending.length, "thing is", "things are")} queued for Claude`, why: "Nothing changes until you say it in Claude Code.", when: minDate(pending.map((q) => q.created)), action: { type: "command", cmd: "answer it" }, count: pending.length });

  // RULE tonight: week.tasks[] per track, in day order, the first with status "todo" (the same pick as the Tonight page).
  const order = (t) => (t.day ? DAYS.indexOf(t.day) : 99);
  const path = ["skill", "reach"].map((track) => tasks.filter((t) => t.track === track).sort((a, b) => order(a) - order(b)).find((t) => t.status === "todo")).filter(Boolean);
  // Tonight's path is the page itself, not something that needs the person: it is computed only so "carried" can leave its tasks out.

  // RULE carried: week.tasks[] with status "todo" still open from an earlier day this week (task.day before today), minus the tasks on tonight's path (a task is counted once, at its highest level).
  const carried = carriedOver(tasks, todayIdx, path.map((t) => t.id)).rest;
  if (carried.length) {
    const when = isDate(s.week?.week_of) ? minDate(carried.map((t) => addDays(s.week.week_of, DAYS.indexOf(t.day)))) : undefined;
    out.push({ id: "carried", level: "today", kind: "carried", title: carried.length === 1 ? clip(`${carried[0].task} is from an earlier day`, 70) : `${carried.length} tasks from earlier days`, why: "Picking them up costs nothing. Dates move at Sunday review.", when, action: { type: "view", view: "today" }, count: carried.length, taskCount: carried.length, taskIds: carried.map((t) => t.id) });
  }

  // RULE read: proof.items[].status === "done" (finished, but nobody has read it yet; "verified" means someone did).
  const unreadProof = (s.proof?.items ?? []).filter((p) => p.status === "done");
  if (unreadProof.length) out.push({ id: "proof-read", level: "week", kind: "proof", title: unreadProof.length === 1 ? clip(`Proof waiting for a reader: “${unreadProof[0].name}”`, 70) : `${unreadProof.length} finished items are proof waiting for a reader`, why: "It counts in full once someone has read it and said something.", action: unreadProof.length === 1 ? { type: "sheet", sheet: { kind: "respond", id: unreadProof[0].id } } : { type: "view", view: "reach" }, count: unreadProof.length });

  // RULE library: library.picks[] this week (week_of === week.week_of) with a score and status "new", while none this week is "kept" or "done".
  const week = (s.library?.picks ?? []).filter((p) => p.week_of === s.week?.week_of);
  const fresh = week.filter((p) => p.status === "new" && p.score && p.kind !== "podcast");
  if (fresh.length && !week.some((p) => p.status === "kept" || p.status === "done")) out.push({ id: "library-new", level: "week", kind: "library", title: `${plural(fresh.length, "pick", "picks")} in the Library you have not looked at`, why: "Each one is scored and checked. All optional.", when: minDate(fresh.map((p) => p.checked ?? p.score.scored)), action: { type: "view", view: "library" }, count: fresh.length });

  // RULE stale library: library.refreshed missing, or more than 14 days before today.
  const refreshed = s.library?.refreshed;
  if (!isDate(refreshed) || dayDiff(refreshed, today) > 14) out.push({ id: "library-stale", level: "week", kind: "library", title: "Your Library needs a refresh", why: isDate(refreshed) ? "Claude has not checked it for over two weeks." : "Claude has not checked it yet.", when: isDate(refreshed) ? refreshed : undefined, action: { type: "command", cmd: "update my library" } });

  // RULE skill start: bets.bets[] active skill bet's focus, with skills.ratings[focus].evidence empty and no evidence.entries[] for it.
  const focus = (s.bets?.bets ?? []).find((b) => b.track === "skill" && b.status === "active")?.focus;
  const rating = focus ? s.skills?.ratings?.[focus] : undefined;
  if (focus && rating && (rating.evidence ?? []).length === 0 && !(s.evidence?.entries ?? []).some((e) => e.competency === focus)) {
    const name = ((s.rubric?.competencies ?? []).find((c) => c.id === focus)?.name ?? focus).split(":")[0];
    out.push({ id: "skill-start", level: "week", kind: "skill", title: clip(`${name} has no evidence yet`, 70), why: "This week's first step starts it.", when: isDate(s.week?.week_of) ? s.week.week_of : undefined, action: { type: "sheet", sheet: { kind: "skill", id: focus } } });
  }

  // RULE trinkets: library.trinkets[].status === "new" (a checked thought not yet kept or hidden).
  const thoughts = (s.library?.trinkets ?? []).filter((t) => t.status === "new");
  if (thoughts.length) out.push({ id: "trinkets", level: "fyi", kind: "trinket", title: thoughts.length === 1 ? clip(`A thought from ${thoughts[0].who}`, 70) : `${thoughts.length} new thoughts to carry`, when: minDate(thoughts.map((t) => t.checked)), action: { type: "view", view: "today" }, count: thoughts.length });

  // RULE podcasts: library.picks[] with kind "podcast" and status "new".
  const pods = (s.library?.picks ?? []).filter((p) => p.kind === "podcast" && p.status === "new");
  if (pods.length) out.push({ id: "podcasts", level: "fyi", kind: "podcast", title: pods.length === 1 ? clip(`A podcast pick: ${pods[0].title}`, 70) : `${pods.length} new podcast picks`, when: minDate(pods.map((p) => p.checked ?? p.week_of)), action: { type: "view", view: "library" }, count: pods.length });

  return out.map((i) => (i.why && i.why.length > 100 ? { ...i, why: clip(i.why, 100) } : i)).sort(compare);
}

function compare(a, b) {
  const l = LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level);
  if (l) return l;
  if (a.when && b.when && a.when !== b.when) return a.when < b.when ? -1 : 1;
  if (!!a.when !== !!b.when) return a.when ? -1 : 1; // dated things before undated ones
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const COUNTED = (i) => i.level === "now" || i.level === "today";
const LABELS = { asked: (n) => plural(n, "question", "questions"), replies: (n) => plural(n, "reply", "replies"), onboarding: () => "onboarding to start", waiting: (n) => `${n} queued for Claude`, carried: (n) => plural(n, "earlier task", "earlier tasks") };

/**
 * The one summary every screen reads: the badge, the sheet, the Tonight row and the Commands sentence.
 * n is the sum of the numbers written in the rows (5 questions + 3 replies = 8), so nothing disagrees.
 * Tonight's path is never an item, so it is never counted.
 */
export function inboxSummary(items) {
  const rows = items.filter(COUNTED).map((i) => { const n = i.count ?? 1; return { id: i.id, kind: i.kind, n, label: (LABELS[i.kind] ?? ((c) => plural(c, "thing", "things")))(n) }; });
  const n = rows.reduce((a, r) => a + r.n, 0);
  const phrase = rows.map((r) => r.label).join(", ");
  const sentence = n === 0 ? "Nothing needs you." : `${n} ${n === 1 ? "thing needs" : "things need"} you.`;
  // `line` is the one sentence every screen says (page head, banner, fixtures): the count once, then what it is made of.
  const line = n === 0 ? sentence : `${n} ${n === 1 ? "thing needs" : "things need"} you: ${phrase}.`;
  return { n, rows, phrase, sentence, line };
}

/** Items on the list that are not in the count (this week, good to know). Said as "N more, not counted". */
export function notCounted(items) {
  const n = items.filter((i) => !COUNTED(i)).length;
  return { n, text: n === 0 ? "" : `${n} more, not in the count` };
}

/** "open 2 days": how long a counted row has been open. Empty when there is no date. (The row says what is open; "waiting" alone is not used.) */
export function waitingPhrase(when, nowIso) {
  if (!isDate(when)) return "";
  const d = dayDiff(when, nowIso);
  if (d <= 0) return "new today";
  if (d === 1) return "open since yesterday";
  return `open ${d} days`;
}

export function attentionBadge(items) {
  return inboxSummary(items).n;
}

export function splitAttention(items, opts = {}) {
  const perLevel = opts.perLevel ?? 3;
  const topN = opts.top ?? 3;
  const seen = {};
  const top = [];
  const later = [];
  for (const i of [...items].sort(compare)) {
    seen[i.level] = (seen[i.level] ?? 0) + 1;
    const eligible = (i.level === "now" || i.level === "today") && seen[i.level] <= perLevel;
    if (eligible && top.length < topN) top.push(i); else later.push(i);
  }
  return { top, later };
}

export function whenPhrase(when, nowIso) {
  if (!isDate(when)) return "";
  const d = dayDiff(when, nowIso);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d === -1) return "tomorrow";
  if (d > 1 && d < 14) return `${d} days ago`;
  if (d < -1 && d > -14) return `in ${-d} days`;
  const [, m, day] = when.split("-").map(Number);
  return `${day} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
}
