// Six checks on the attention inbox logic. Run: node scripts/attention-check.mjs
import { deriveAttention, attentionBadge, splitAttention, inboxSummary, notCounted, waitingPhrase } from "../lib/attention.mjs";

let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` ${extra}` : ""}`); if (!cond) fail++; };

// Wednesday 14 Oct 2026, local noon.
const NOW = new Date(2026, 9, 14, 12, 0, 0);
const base = () => ({
  profile: { intake: [] },
  week: { week_of: "2026-10-12", tasks: [] },
  queue: { items: [] },
  tests: { tests: [] },
  learning: { briefs: [] },
  proof: { items: [] },
  library: { picks: [], trinkets: [], refreshed: "2026-10-12" },
  bets: { bets: [] },
  skills: { ratings: {} },
  rubric: { competencies: [] },
  evidence: { entries: [] },
});
const task = (id, day, over = {}) => ({ id, day, track: "skill", status: "todo", minutes: 20, task: `Task ${id}`, steps: [], ...over });

// 1. Empty state: nothing needs the person.
{
  const items = deriveAttention(base(), NOW);
  ok("empty state gives no items and badge 0", items.length === 0 && attentionBadge(items) === 0);
}

// 2. Five unanswered questions: one item, count 5, level now.
{
  const s = base();
  s.profile.intake = Array.from({ length: 5 }, (_, i) => ({ id: `Q${i}`, q: "?", asked: "2026-10-10", answer: null }));
  const items = deriveAttention(s, NOW);
  const a = items.filter((i) => i.kind === "asked");
  ok("5 asked is one now item with count 5", a.length === 1 && a[0].level === "now" && a[0].count === 5 && a[0].title === "5 questions from Claude");
}

// 3. A task carried over two evenings: level today.
{
  const s = base();
  s.week.tasks = [task("A", "Mon", { track: "skill" }), task("B", "Tue", { track: "skill" })];
  const c = deriveAttention(s, NOW).find((i) => i.kind === "carried");
  ok("carried excludes tonight's task and is one today item", !!c && c.level === "today" && c.count === 1 && c.taskCount === 1 && c.taskIds[0] === "B");
}

// 3b. De-duplication: a task on tonight's path is not also carried; badge counts distinct items.
{
  const s = base();
  s.profile.intake = Array.from({ length: 5 }, (_, i) => ({ id: `Q${i}`, q: "?", asked: "2026-10-10", answer: null }));
  s.week.tasks = [task("A", "Mon", { track: "skill" }), task("B", "Tue", { track: "skill" }), task("C", "Mon", { track: "reach" })];
  const items = deriveAttention(s, NOW);
  const c = items.find((i) => i.kind === "carried");
  ok("tonight's path is never an item, so it is never listed or counted", !items.some((i) => i.kind === "tonight" || /Tonight's path/.test(i.title)));
  ok("tonight's tasks (A, C) are not in carried", c.taskIds.length === 1 && c.taskIds[0] === "B");
  ok("badge = sum of the numbers in the rows (5 questions + 1 earlier task)", attentionBadge(items) === 6, String(attentionBadge(items)));
  const sum = inboxSummary(items);
  ok("badge == sum of sheet rows == the Commands sentence number", sum.n === attentionBadge(items) && sum.n === sum.rows.reduce((a, r) => a + r.n, 0) && sum.sentence === "6 things need you." && sum.phrase === "5 questions, 1 earlier task", sum.phrase);
}

// 3c. The Tonight row names its items: "5 questions, 3 replies".
{
  const s = base();
  s.profile.intake = Array.from({ length: 5 }, (_, i) => ({ id: `Q${i}`, q: "?", asked: "2026-10-10", answer: null }));
  const sum = inboxSummary(deriveAttention(s, NOW, { unreadReplies: 3, onboarding: { status: "not_started" } }));
  ok("names the items, counts them once", sum.phrase === "5 questions, 3 replies" && sum.n === 8, sum.phrase);
  ok("onboarding waits while questions wait", !sum.rows.some((r) => r.kind === "onboarding"));
}

// 4. Sort order is stable whatever order the data arrives in.
{
  const mk = (rev) => {
    const s = base();
    s.profile.intake = [{ id: "Q1", q: "?", asked: "2026-10-10", answer: null }];
    s.queue.items = [{ id: "a", type: "ask", status: "pending", created: "2026-10-13", request: "" }];
    s.week.tasks = [task("A", "Mon"), task("B", "Tue", { track: "reach" })];
    s.proof.items = [{ id: "P", name: "CV", status: "done", priority: 1 }];
    s.library.trinkets = [{ id: "T", who: "X", status: "new", checked: "2026-10-12" }];
    if (rev) { s.week.tasks.reverse(); }
    return deriveAttention(s, NOW).map((i) => i.id);
  };
  const a = mk(false), b = mk(true);
  const rank = { now: 0, today: 1, week: 2, fyi: 3 };
  const lv = deriveAttention((() => { const s = base(); s.profile.intake = [{ id: "Q", q: "?", asked: "2026-10-10", answer: null }]; s.library.trinkets = [{ id: "T", who: "X", status: "new", checked: "2026-10-12" }]; return s; })(), NOW).map((i) => rank[i.level]);
  ok("sort order is level first and identical on repeat", JSON.stringify(a) === JSON.stringify(b) && lv.every((v, i) => i === 0 || lv[i - 1] <= v), a.join(","));
}

// 5. Cap: at most 3 per level and 3 shown, the rest go to later, none dropped.
{
  const items = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, level: "now", kind: "x", title: "t", action: { type: "view", view: "today" } }))
    .concat(Array.from({ length: 4 }, (_, i) => ({ id: `d${i}`, level: "today", kind: "x", title: "t", action: { type: "view", view: "today" } })));
  const { top, later } = splitAttention(items);
  ok("cap of 3 shown and none dropped", top.length === 3 && top.every((i) => i.level === "now") && top.length + later.length === items.length);
  const wide = splitAttention(items, { top: 9 });
  ok("cap of 3 per level when more fit", wide.top.filter((i) => i.level === "now").length === 3 && wide.top.filter((i) => i.level === "today").length === 3);
}

// 6. fyi never raises the badge.
{
  const s = base();
  s.library.trinkets = [{ id: "T", who: "X", status: "new", checked: "2026-10-12" }, { id: "U", who: "Y", status: "new", checked: "2026-10-12" }];
  s.library.picks = [{ id: "P", week_of: "2026-10-12", kind: "podcast", status: "new", title: "Show" }];
  const items = deriveAttention(s, NOW);
  ok("fyi items never count in the badge", items.length === 2 && items.every((i) => i.level === "fyi") && attentionBadge(items) === 0);
}

// 7. Onboarding: one today item when not started or paused, counted once in the badge; nothing otherwise.
{
  const ob = (status) => deriveAttention(base(), NOW, { onboarding: { status } }).filter((i) => i.kind === "onboarding");
  const a = ob("not_started");
  ok("not_started gives one today item that says growth start", a.length === 1 && a[0].level === "today" && a[0].title === "Start your onboarding" && a[0].action.type === "command" && a[0].action.cmd === "growth start");
  const p = ob("paused");
  ok("paused gives one today item that says resume growth start", p.length === 1 && p[0].level === "today" && p[0].action.cmd === "resume growth start");
  ok("in_progress, complete and unknown add nothing", ob("in_progress").length === 0 && ob("complete").length === 0 && deriveAttention(base(), NOW).length === 0 && deriveAttention(base(), NOW, { onboarding: null }).length === 0);
  const s = base();
  s.profile.intake = [{ id: "Q1", q: "?", asked: "2026-10-10", answer: null }];
  s.week.tasks = [task("A", "Mon")];
  const withQ = deriveAttention(s, NOW, { onboarding: { status: "not_started" } });
  ok("questions come first: no onboarding item while a question waits", !withQ.some((i) => i.kind === "onboarding") && attentionBadge(withQ) === 1, String(attentionBadge(withQ)));
  s.profile.intake = [];
  const all = deriveAttention(s, NOW, { onboarding: { status: "not_started" } });
  ok("onboarding counts once when no question waits", attentionBadge(all) === 1 && all.some((i) => i.kind === "onboarding"), String(attentionBadge(all)));
}

// 8. One source for the badge: the same ctx gives the same list and number, whatever page asks; unread replies count once and show as one "replies" item.
{
  const s = base();
  s.profile.intake = [{ id: "Q1", q: "?", asked: "2026-10-10", answer: null }];
  s.week.tasks = [task("A", "Mon")];
  const ctx = { unreadReplies: 2, onboarding: { status: "not_started" } };
  const pages = ["today", "skill", "reach", "journal", "library", "companion"].map(() => attentionBadge(deriveAttention(s, NOW, ctx)));
  ok("badge is identical on all six pages for one ctx", new Set(pages).size === 1 && pages[0] === 3, pages.join(","));
  const items = deriveAttention(s, NOW, ctx);
  const r = items.filter((i) => i.kind === "replies");
  ok("unread replies are one item whose count is the unread number", r.length === 1 && r[0].count === 2);
  ok("seen replies add nothing", deriveAttention(s, NOW, { ...ctx, unreadReplies: 0 }).every((i) => i.kind !== "replies") && attentionBadge(deriveAttention(s, NOW, { ...ctx, unreadReplies: 0 })) === 1);
}

// 9. One sentence per screen: `line` counts once and names its parts; "not counted" and "waiting N days" are worded by the same module.
{
  const s = base();
  s.profile.intake = Array.from({ length: 5 }, (_, i) => ({ id: `Q${i}`, q: "?", asked: "2026-10-12", answer: null }));
  s.week.tasks = [task("A", "Mon", { track: "skill" }), task("B", "Tue", { track: "skill" })];
  s.library.picks = [{ id: "P1", week_of: "2026-10-12", status: "new", kind: "article", title: "x", score: { total: 80, scored: "2026-10-12" } }];
  const items = deriveAttention(s, NOW);
  const sum = inboxSummary(items);
  ok("line is the count once then its parts", sum.line === "6 things need you: 5 questions, 1 earlier task.", sum.line);
  ok("one counted row is singular", inboxSummary(deriveAttention({ ...base(), profile: { intake: [{ id: "Q", q: "?", asked: "2026-10-12", answer: null }] } }, NOW)).line === "1 thing needs you: 1 question.");
  ok("empty line is one sentence", inboxSummary([]).line === "Nothing needs you.");
  const nc = notCounted(items);
  ok("not-counted text is 'N more, not in the count'", nc.n === items.filter((i) => i.level === "week" || i.level === "fyi").length && (nc.n === 0 || nc.text === `${nc.n} more, not in the count`), nc.text);
  ok("age phrase says open 2 days, never 2 days ago, never the bare word waiting", waitingPhrase("2026-10-12", "2026-10-14") === "open 2 days" && waitingPhrase("2026-10-13", "2026-10-14") === "open since yesterday" && waitingPhrase("2026-10-14", "2026-10-14") === "new today" && waitingPhrase(undefined, "2026-10-14") === "");
}

console.log(fail ? `${fail} FAIL` : "0 FAIL");
process.exit(fail ? 1 : 0);
