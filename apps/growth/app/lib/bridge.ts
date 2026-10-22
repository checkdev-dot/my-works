/**
 * The bridge for using the Claude app (no file access) instead of Claude Code.
 * Export: one message with everything Claude needs. Import: Claude's reply, applied only if it passes the same checks as everything else.
 */
import { promises as fs } from "fs";
import { createHash } from "crypto";
import path from "path";
import type { Bet, Brief, Gap, GrowthState, IntakeQ, LeftOut, ModuleInfo, ModuleResult, NotNow, Pick, ProofItem, SkillTest, PersonItem, PersonWord, PersonWordInput, PlanFile, ResearchItem, ReviewRecord, RunRecord, Source, Task, TaskFeedback, Trinket } from "./types";
import { validate } from "./validate.mjs";
import { mergeResearch, preserveTaskStatus, appendRun, appendReview } from "./plan.mjs";
import { FILES, OPTIONAL, assertUnlocked, readState, unloadedFiles, write } from "./store";
import type { DataFile } from "./store";

const today = () => new Date().toLocaleDateString("en-CA");
const SKILL = process.env.GROWTH_COACH_SKILL || path.join(process.cwd(), "..", "skills", "growth-coach", "SKILL.md");
const EVIDENCE = path.join(process.cwd(), "research", "evidence-base.md");
// Your own career notes file. Unset by default: set GROWTH_DOSSIER to its path (see the README).
const DOSSIER = process.env.GROWTH_DOSSIER || "";

const UNDO = path.join(process.cwd(), "data", ".backups", "_last-import");

/** Puts back everything the last applied Claude reply changed. */
export async function undoImport(): Promise<GrowthState> {
  let names: string[] = [];
  let absent: string[] = [];
  try { const all = await fs.readdir(UNDO); names = all.filter((n) => n.endsWith(".json")); absent = all.filter((n) => n.endsWith(".absent")); } catch { /* none */ }
  if (!names.length && !absent.length) throw new Error("There's nothing to undo.");
  // career.json never comes from a Claude import (the honesty check guards it), so Undo never writes or removes it here.
  for (const n of names.filter((x) => x !== "career.json")) await write(n.replace(/\.json$/, "") as DataFile, JSON.parse(await fs.readFile(path.join(UNDO, n), "utf8")));
  // A plan engine file the reply created did not exist before: take it away again.
  for (const n of absent) { const f = n.replace(/\.absent$/, ""); if (f !== "career" && (OPTIONAL as readonly string[]).includes(f)) await fs.rm(path.join(process.cwd(), "data", `${f}.json`), { force: true }); }
  await fs.rm(UNDO, { recursive: true, force: true });
  return readState();
}

/** A short fingerprint of the data, so a reply written for an older copy can be caught. */
export const stateId = (s: GrowthState) => createHash("sha1").update(JSON.stringify(s)).digest("hex").slice(0, 10);
/** Requests in the queue are written for Claude Code; in the app route Claude returns things instead of writing files. */
const forChat = (r: string) => r.replace(/Write the result to week\.json task (\S+) as feedback \{[^}]*\}\./g, "Return it as feedback for task $1.").replace(/Write what you did to this item's reply\./g, "Say what you did in this item's reply.").replace(/store it in profile\.intake/g, "add it as a question or takeaway");

async function readOr(file: string, fallback: string) {
  try { return await fs.readFile(file, "utf8"); } catch { return fallback; }
}

const webLinks = (xs: string[]) => xs.filter((l) => /^https?:/i.test(l));
const fileLinks = (xs: string[]) => xs.filter((l) => !/^https?:/i.test(l));

/** Everything Claude needs in one message: who the person is, what's waiting, the rules, and the exact reply format. */
export async function exportForClaude(s: GrowthState, full = false): Promise<string> {
  const pending = s.queue.items.filter((q) => q.status === "pending");
  const skill = await readOr(SKILL, "(growth-coach skill file not found)");
  const evidence = await readOr(EVIDENCE, "(evidence base not found)");
  const dossier = await readOr(DOSSIER, "(career notes file not set: ask the person to paste their CV text if a CV or case-study task needs it, or set GROWTH_DOSSIER)");
  const handins = s.evidence.entries.filter((e) => e.pending);
  // A check-in with nothing waiting doesn't need the long reference material.
  const light = !full && !pending.length && !handins.length;
  const lines = [
    "# Growth app: work for Claude",
    "",
    `Copy id: ${stateId(s)}. Put this exact value in "based_on" in your reply.`,
    "",
    `Today is ${today()}. You are the person's growth coach. The person uses the Claude app, so you cannot read his files: everything you need is below. Follow the growth-coach skill (included at the end) exactly, then reply with ONE fenced code block tagged growth-update, in the format described in "How to reply". The app checks it and applies it; anything that fails the checks is rejected with the reason, and nothing is half-applied.`,
    "",
    "## Waiting for you",
    pending.length ? pending.map((q) => `- ${q.id} (${q.type}, ${q.created})${q.task ? ` task ${q.task}` : ""}${q.competency ? ` skill ${q.competency}` : ""}: ${q.ask ? `${q.ask.kind === "change" ? "CHANGE REQUEST" : "QUESTION"}: "${q.ask.text}"` : forChat(q.request)}`).join("\n") : "- Nothing is queued. Do a check-in: read the state, write any useful questions, and reply with what you see.",
    "",
    handins.length ? `## Hand-ins waiting for review\n${handins.map((e) => `- ${e.id} ${e.date} "${e.title}" (${e.competency ?? "no skill"}): ${e.detail}${webLinks(e.links).length ? `\n  Links: ${webLinks(e.links).join(", ")}` : ""}${fileLinks(e.links).length ? `\n  Files he attached in the app (you can't open them; ask him to attach them in this chat by these names): ${fileLinks(e.links).map((l) => l.split(/[\\/]/).pop()).join(", ")}` : ""}`).join("\n")}\nIf a link needs a login or is a local file, say so in the feedback and judge the note.\n` : "",
    "## The current state (JSON)",
    "Use these exact ids. Copy rules apply to anything the person reads: plain second person, no en or em dashes, no game words.",
    "```json",
    JSON.stringify(light ? {
      // A check-in only needs the shape of things, not every detail.
      profile: { north_star: s.profile.north_star, stage: s.profile.stage, intake: s.profile.intake, pace: s.profile.pace ?? "steady", ...(s.profile.person?.card ? { person_card: s.profile.person.card } : {}) },
      skills: Object.fromEntries(Object.entries(s.skills.ratings).map(([k, r]) => [k, { level: r.level, source: r.source, confidence: r.confidence }])),
      week: { week_of: s.week.week_of, focus: s.week.focus, tasks: s.week.tasks.map(({ id, day, track, task, status, competency }) => ({ id, day, track, task, status, competency })) },
      gaps: s.library.gaps ?? [],
      picks: (s.library.picks ?? []).filter((p) => p.week_of === s.week.week_of).map(({ id, kind, title, status, skip_reason, gap, checked }) => ({ id, kind, title, status, skip_reason, gap, checked })),
      recent_journal: s.evidence.entries.slice(-8).map(({ id, date, type, title, detail, gap }) => ({ id, date, type, title, detail, gap })),
      queue: s.queue.items.slice(-5),
    } : {
      profile: (({ person, ...rest }) => ({
        ...rest,
        ...(person?.card ? { person_card: person.card } : {}),
        // The "About you" words, as one line each way. Private and declined words never travel as assumptions; declined ones are named only so they are not proposed again.
        ...(person?.words?.some((w) => !w.private && w.status !== "rejected") ? { person_words: person.words.filter((w) => !w.private && w.status !== "rejected").map((w) => `${w.word} (${w.area}, ${w.status === "confirmed" ? "confirmed" : "not confirmed yet"}, ${w.source === "you_said" ? "he said" : w.source === "observed" ? "noticed" : "guess"}, weight ${w.weight})`).join("; ") } : {}),
        ...(person?.words?.some((w) => w.status === "rejected") ? { person_words_declined: person.words.filter((w) => w.status === "rejected").map((w) => w.word).join(", ") } : {}),
      }))(s.profile),
      rubric: s.rubric,
      skills: s.skills,
      week: s.week,
      proof: s.proof.items.map(({ id, name, status, why, cv, interview, priority }) => ({ id, name, status, why, cv, interview, priority })),
      reach: s.reach.funnel,
      bets: s.bets,
      notnow: s.notnow,
      tests: s.tests.tests,
      briefs: s.learning.briefs.map(({ id, competency, title, created, read }) => ({ id, competency, title, created, read })),
      picks: s.library.picks ?? [],
      gaps: s.library.gaps ?? [],
      journal_toward_gaps: s.evidence.entries.filter((e) => e.gap).slice(-20),
      recent_evidence: s.evidence.entries.slice(-25),
      queue: s.queue.items.slice(-15),
    }, null, 1),
    "```",
    "",
    "## How to reply",
    "One fenced block, tagged growth-update, containing a JSON object. Include only the keys you need. Every queue item you handle must be closed through replies or feedback.",
    "```growth-update",
    JSON.stringify({
      growth_update: 1,
      based_on: stateId(s),
      replies: [{ queue: "Q-003", reply: "Plain words, second person, under 150 words. Required for ask, answers, plan and picks items." }],
      feedback: [{ task: "S-01", queue: "Q-002", feedback: { verdict: "One sentence about the work against the next level.", working: ["What works"], fix_first: ["Ranked, max 3, each doable in 30 minutes"], next: "The one next action.", reads_at: "Mid" } }],
      takeaways: [{ id: "funnel.channels", takeaway: "What this answer changed, one line." }],
      questions: [{ id: "proof.seven_second", q: "A countable question.", why: "What the answer decides.", options: ["Optional quick answers"] }],
      stage: { name: "where you apply", why: "One sentence citing his own numbers." },
      skills: [{ id: "research", level: 2, source: "ai", confidence: 0.4, reason: "Cites evidence ids." }],
      evidence: [{ type: "ai", title: "Short title", detail: "What you judged", competency: "research" }],
      briefs: [{ id: "L-002", competency: "research", title: "...", summary: "...", points: ["..."], sources: [{ title: "...", url: "https://..." }] }],
      tests: [{ id: "T-002", competency: "research", status: "ready", questions: [{ q: "..." }] }],
      scores: [{ test: "T-001", queue: "Q-004", score: 2.5, feedback: "What a next-level answer would say.", notes: ["One per question"] }],
      picks: [{ id: "P-007", kind: "article", title: "...", by: "...", url: "https://...", minutes: 8, published: "2026-05", checked: today(), why: "Ties to a task this week.", look_for: "...", task: "S-03", gap: "G-01", competency: "research" }, { id: "P-008", kind: "news", title: "...", by: "...", url: "https://...", published: "2026-10-01", checked: today(), why: "Why it matters to a product designer like him.", try_it: "One small thing to try in 15 minutes." }],
      // A pick may also carry score {fit,gain,time,substance,fresh,best,total,verdict,why,better?,compared:[2+ titles],scored} and thumb (YouTube or Open Library only).
      // trinkets: [{ id: "T-001", who: "Dieter Rams", line: "Good design is as little design as possible.", quoted: true, source: { title: "...", url: "https://..." }, try: "Optional, one tiny thing.", gap: "G-01", checked: today() }] (max 12 in all; quoted only if exact and 25 words or fewer).
      // person: { items: [{ id: "W-004", area: "learns", text: "You learn fastest by making something real.", source: "estimate", evidence: ["P-003"], confidence: 0.5, status: "proposed", private: false, use_for: ["planning"], noted: today(), why: "Because you skipped 3 videos over 30 minutes." }], card: "At most 150 words, only when the person has confirmed or edited something." } (max 3 new proposals; never a diagnosis; a worry only if the person said it; the app ignores anything he already confirmed, rejected or hid).
      // person.words: [{ word: "curious", area: "energy", weight: 4, source: "you_said"|"observed"|"estimate", confidence: 0.5, why: "One line, where it came from." }] (single words only, add only when sure; they arrive as not confirmed; declined words never return; a worry word only if the person said it).
      // Optional top level: left_out [{ title, kind, why_not, checked }] (max 8, replaces the list) and modules { installed: [...], results: [...] }.
      bets: [{ id: "B-S1", status: "won", result: "What happened, with numbers.", learned: "One line.", tasks: ["S-01", "S-02"] }],
      notnow: { add: [{ what: "Motion design", why: "Doesn't fix the first broken stage yet.", revisit: "2027-01" }], retire: ["Exact what of an item to drop"] },
      proof: [{ id: "pr-cv", status: "done", note: "Why it changed." }],
      gaps: [{ id: "G-01", competency: "research", title: "Run a usability test with a real person", why: "Why it matters for his goal.", source: "where you saw it", status: "open", closes_when: "Something he can show.", now: "Where it stands, one line." }],
      week: "Optional: the full next week object, same shape as state.week, when you plan a week. Carry saved-for-later tasks first. When you send week, also send bets with each active bet's new task ids.",
      // Plan engine, all optional. plan: the full plan object (same shape as data/plan.json); tasks the person finished or dropped keep that status. research: [{ id, subject: {type, id}, claim, supports, source_url, source_name, tier: 1-4, published: "YYYY-MM-DD" or null, retrieved, excerpt: "25 words or fewer, verbatim", confidence, fresh_days, verified?: {by, on, result, http?} }] (a claim that failed its check never comes back; a verified item is never replaced by an unverified one). review: one record { id, scope: "week"|"plan", date, items: [{ ref, verdict: "matched"|"drifted"|"unsourced"|"outdated"|"done", why }] }. run: one record { id, command, started, status: "complete"|"partial"|"aborted", updated?, left? }.
      plan: "Optional: the full plan object, same shape as data/plan.json. Tasks the person finished or dropped keep that status. Needs based_on.",
      research: [{ id: "RS-001", subject: { type: "gap", id: "G-01" }, claim: "One sentence.", supports: "why this task", source_url: "https://...", source_name: "Name", tier: 2, published: null, retrieved: today(), excerpt: "Verbatim words from the page, 25 or fewer.", confidence: 0.6, fresh_days: 365 }],
      review: { id: "RV-001", scope: "week", date: today(), items: [{ ref: "S-01", verdict: "matched", why: "One line." }] },
      run: { id: "PR-" + today().replace(/-/g, "") + "-1", command: "plan", started: today(), status: "complete", updated: [{ ref: "G-01", what: "research +2" }], left: [{ ref: "G-04", why: "no source found" }] },
    }, null, 1),
    "```",
    "Rules for the reply: research for real and verify every URL you add; never invent numbers, quotes, prices or lengths; feedback is about the work, never about the person; skills move at most half a level unless the source is expert or market.",
    "",
    ...(s.plan ? [
      "## Plan engine (current four-week plan, for plan, check and review replies)",
      `Plan ${s.plan.status}, ${s.plan.starts} to ${s.plan.ends}, ${s.plan.weeks.length} weeks, ${Object.keys(s.plan.tasks).length} tasks. Research items: ${(s.research?.items ?? []).length} (${(s.research?.items ?? []).filter((r) => r.verified?.result === "match").length} verified). Runs logged: ${(s.runs?.runs ?? []).length}. Reviews: ${(s.reviews?.reviews ?? []).length}.`,
      ...(full ? ["```json", JSON.stringify({ demands: s.demands ?? null, plan: s.plan, research: s.research ?? null, sources: s.sources ?? null }, null, 1), "```"] : ["(Say “pack” in Claude Code to get the full pack with the plan, research and demands.)"]),
      "",
    ] : []),
    "## The growth-coach skill (follow it)",
    skill,
    "",
    ...(light ? ["", "(Nothing is waiting, so the evidence base and career dossier are left out to keep this short. If you need them, ask the person to copy again after handing something in.)"] : [
      "## Evidence base (cite sections)",
      evidence,
      "",
      "## the person's career dossier (read before CV, case study, interview or positioning work; obey 3.9 and 3.10)",
      dossier,
    ]),
  ];
  return lines.filter((l) => l !== "").join("\n");
}

type Update = {
  growth_update?: number;
  replies?: { queue: string; reply: string }[];
  feedback?: { task: string; queue?: string; feedback: Omit<TaskFeedback, "date"> & { date?: string } }[];
  takeaways?: { id: string; takeaway: string }[];
  questions?: Omit<IntakeQ, "asked" | "answer">[];
  stage?: { name: string; why: string };
  skills?: { id: string; level: number; source: Source; confidence: number; reason: string; note?: string }[];
  evidence?: { type: Source | "note"; title: string; detail: string; competency?: string; links?: string[] }[];
  briefs?: Omit<Brief, "created">[];
  tests?: Omit<SkillTest, "created">[];
  scores?: { test: string; queue?: string; score: number; feedback: string; notes?: string[] }[];
  picks?: Omit<Pick, "week_of" | "status">[];
  left_out?: LeftOut[];
  trinkets?: Omit<Trinket, "week_of" | "status">[];
  person?: { items?: PersonItem[]; card?: string; reviewed?: string; words?: PersonWordInput[] };
  modules?: { installed?: ModuleInfo[]; results?: ModuleResult[]; primary?: Record<string, string>; retired?: string[] };
  week?: { week_of: string; focus: string; focus_short?: string; tasks: Task[] };
  based_on?: string;
  bets?: (Partial<Bet> & { id: string })[];
  notnow?: { add?: NotNow[]; retire?: string[] };
  proof?: { id: string; status: ProofItem["status"]; note?: string; links?: string[] }[];
  gaps?: (Partial<Gap> & { id: string })[];
  /** Plan engine, all optional. Same guards as the store actions: dedupe, shared validator, nothing verified is overwritten, nothing rejected comes back. */
  plan?: PlanFile;
  research?: ResearchItem[];
  review?: ReviewRecord;
  run?: RunRecord;
};

/** Finds the growth-update block in whatever the person pasted (the whole chat reply is fine). */
/** Lowercases and strips everything but letters and digits (unicode aware). A regression test reads this file as text and checks the unicode classes below. */
export function normaliseText(x: string): string {
  return Array.from(String(x ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLowerCase()).map((c) => (/[\p{L}\p{N}]/u.test(c) ? c : " ")).join("").split(" ").filter(Boolean).join(" ");
}

function parseUpdate(text: string): Update {
  const fence = text.match(/```growth-update\s*([\s\S]*?)```/) ?? text.match(/```json\s*([\s\S]*?"growth_update"[\s\S]*?)```/);
  const raw = (fence ? fence[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("There's no growth-update block in what you pasted. Ask Claude Code to write its update again.");
  try { return JSON.parse(raw.slice(start, end + 1)) as Update; }
  catch (e) { throw new Error(`Claude's block isn't valid JSON (${e instanceof Error ? e.message : "parse error"}). Ask Claude to resend it as one growth-update block.`); }
}

const nextId = (prefix: string, ids: string[]) => {
  const n = ids.filter((i) => i.startsWith(prefix)).map((i) => parseInt(i.slice(prefix.length), 10)).filter((x) => !Number.isNaN(x));
  return `${prefix}${String((n.length ? Math.max(...n) : 0) + 1).padStart(3, "0")}`;
};

/** Applies Claude's reply to a copy of the data; writes only if the result passes every check. */
export async function importFromClaude(text: string): Promise<{ state: GrowthState; summary: string[] }> {
  await assertUnlocked();
  const u = parseUpdate(text);
  const before = await readState();
  const fingerprint = createHash("sha1").update(text.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 12);
  const applied = ((before.profile as { bridge_applied?: string[] }).bridge_applied ?? []);
  if (applied.includes(fingerprint)) throw new Error("This reply was already applied. Nothing was changed.");
  if (u.based_on && u.based_on !== stateId(before) && (u.week || u.plan)) throw new Error("Your data changed since you copied it for Claude, and this reply would replace the whole week. Nothing was changed. Say “answer it” in Claude Code so it reads your current data, then try again.");
  if (!u.based_on && (u.week || u.plan)) throw new Error("This reply plans a week but doesn't say which copy it was based on. Nothing was changed. Ask Claude to add the based_on value from the top of the message.");
  const s = structuredClone(before) as GrowthState;
  const d = today();
  const done: string[] = [];
  const problems: string[] = [];
  const queue = (id?: string) => (id ? s.queue.items.find((q) => q.id === id) : undefined);
  const close = (id?: string) => { const q = queue(id); if (q && q.status !== "done") { q.status = "done"; q.done = d; } };

  for (const r of u.replies ?? []) {
    const q = queue(r.queue);
    if (!q) { problems.push(`replies: queue item ${r.queue} doesn't exist`); continue; }
    if (q.status === "done" && q.reply) { problems.push(`replies: ${r.queue} was already answered`); continue; }
    q.reply = r.reply; close(q.id);
  }
  if (u.replies?.length) done.push(`${u.replies.length} repl${u.replies.length === 1 ? "y" : "ies"}`);

  for (const f of u.feedback ?? []) {
    const t = s.week.tasks.find((x) => x.id === f.task);
    if (!t) { problems.push(`feedback: task ${f.task} isn't in this week`); continue; }
    if (t.feedback) { problems.push(`feedback: task ${f.task} already has a review`); continue; }
    t.feedback = { date: d, ...f.feedback } as TaskFeedback;
    for (const e of s.evidence.entries) if (e.pending && e.title === t.task) delete e.pending;
    close(f.queue ?? s.queue.items.find((q) => q.type === "critique" && q.task === t.id && q.status === "pending")?.id);
    s.evidence.entries.push({ id: nextId("ev-", s.evidence.entries.map((e) => e.id)), date: d, type: "ai", title: `Claude's review: ${t.task}`, detail: `${f.feedback.verdict} Next: ${f.feedback.next}`, links: [], competency: t.competency });
  }
  if (u.feedback?.length) done.push(`${u.feedback.length} review${u.feedback.length === 1 ? "" : "s"}`);

  s.profile.intake = s.profile.intake ?? [];
  for (const k of u.takeaways ?? []) {
    const q = s.profile.intake.find((x) => x.id === k.id);
    if (!q) { problems.push(`takeaways: question ${k.id} doesn't exist`); continue; }
    q.takeaway = k.takeaway;
  }
  for (const q of u.questions ?? []) {
    if (s.profile.intake.some((x) => x.id === q.id)) { problems.push(`questions: ${q.id} was already asked`); continue; }
    s.profile.intake.push({ ...q, asked: d, answer: null });
  }
  if (u.questions?.length) done.push(`${u.questions.length} new question${u.questions.length === 1 ? "" : "s"}`);
  for (const q of s.queue.items) {
    if (q.type !== "answers" || q.status !== "pending") continue;
    const ids = [...q.request.matchAll(/\[([\w.]+)\]/g)].map((m) => m[1]);
    if (ids.length && ids.every((id) => s.profile.intake?.find((x) => x.id === id)?.takeaway)) close(q.id);
  }
  if (u.stage) { s.profile.stage = { ...u.stage, date: d }; done.push("Claude's read"); }

  for (const k of u.skills ?? []) {
    const r = s.skills.ratings[k.id];
    if (!r) { problems.push(`skills: ${k.id} isn't a skill`); continue; }
    r.level = k.level; r.source = k.source; r.confidence = k.confidence;
    if (k.note) r.note = k.note;
    r.history.push({ date: d, level: k.level, source: k.source, reason: k.reason } as (typeof r.history)[number]);
  }
  if (u.skills?.length) done.push(`${u.skills.length} skill rating${u.skills.length === 1 ? "" : "s"}`);

  for (const e of u.evidence ?? []) s.evidence.entries.push({ id: nextId("ev-", s.evidence.entries.map((x) => x.id)), date: d, type: e.type, title: e.title, detail: e.detail, links: e.links ?? [], competency: e.competency });

  for (const b of u.briefs ?? []) {
    s.learning.briefs = s.learning.briefs.filter((x) => x.id !== b.id).concat({ ...b, created: d });
    close(s.queue.items.find((q) => q.type === "research" && q.competency === b.competency && q.status === "pending")?.id);
  }
  if (u.briefs?.length) done.push(`${u.briefs.length} brief${u.briefs.length === 1 ? "" : "s"}`);

  for (const t of u.tests ?? []) {
    s.tests.tests = s.tests.tests.filter((x) => x.id !== t.id).concat({ ...t, created: d });
    close(s.queue.items.find((q) => q.type === "test" && q.competency === t.competency && q.status === "pending" && !/^Score/.test(q.request))?.id);
  }
  for (const sc of u.scores ?? []) {
    const t = s.tests.tests.find((x) => x.id === sc.test);
    if (!t) { problems.push(`scores: test ${sc.test} doesn't exist`); continue; }
    Object.assign(t, { status: "scored", score: sc.score, feedback: sc.feedback, notes: sc.notes, scored_on: d });
    close(sc.queue ?? s.queue.items.find((q) => q.type === "test" && q.status === "pending" && q.request.includes(t.id))?.id);
  }
  if (u.tests?.length || u.scores?.length) done.push("tests");

  if (u.picks?.length) {
    s.library.picks = s.library.picks ?? [];
    // Sending an id again keeps what the person did with it (kept, done, skipped, his note); a new id starts as new.
    for (const p of u.picks) {
      const old: Pick | undefined = s.library.picks.find((x) => x.id === p.id);
      const keep: Record<string, unknown> = old ? { status: old.status, done: old.done, note: old.note, skip_reason: old.skip_reason, ev: old.ev } : { status: "new" };
      const kept: Record<string, unknown> = Object.fromEntries(Object.entries(keep).filter(([, v]) => v !== undefined));
      s.library.picks = s.library.picks.filter((x) => x.id !== p.id).concat({ ...p, week_of: u.week?.week_of ?? s.week.week_of, ...kept } as Pick);
    }
    for (const q of s.queue.items) if (q.type === "picks") close(q.id);
    done.push(`${u.picks.length} library pick${u.picks.length === 1 ? "" : "s"}`);
  }
  if (u.trinkets?.length) {
    // Replace by id; a thought the person already saved or hid keeps that status when Claude sends it again.
    s.library.trinkets = s.library.trinkets ?? [];
    // A thought is the same thought when its line and source match, whatever id it arrives under (so a hidden one never comes back).
    const norm = (x: string) => Array.from(String(x ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLowerCase()).map((c) => (c.trim() === "" ? " " : c)).join("").split(" ").filter(Boolean).join(" ");
    const same = (a: { line: string; source: { url: string } }, b: { line: string; source: { url: string } }) => norm(a.line) === norm(b.line) && norm(a.source?.url) === norm(b.source?.url);
    for (const t of u.trinkets) {
      const old: Trinket | undefined = s.library.trinkets.find((x) => x.id === t.id) ?? s.library.trinkets.find((x) => same(x, t as Trinket));
      s.library.trinkets = s.library.trinkets.filter((x) => x !== old).concat({ ...t, id: old ? old.id : t.id, week_of: old?.week_of ?? u.week?.week_of ?? s.week.week_of, status: old && old.status !== "new" ? old.status : "new" } as Trinket);
    }
    done.push(`${u.trinkets.length} small thought${u.trinkets.length === 1 ? "" : "s"}`);
  }
  if (u.left_out) {
    s.library.left_out = u.left_out;
    done.push(`${u.left_out.length} left-out item${u.left_out.length === 1 ? "" : "s"}`);
  }
  const um = u.modules;
  if (um && (um.installed?.length || um.results?.length || um.primary || um.retired)) {
    const m = (s.profile.modules = s.profile.modules ?? { installed: [], results: [] });
    // Upsert by id; abilities and impact ride along on each installed entry. The shared validator below refuses the whole block if any of it is invalid.
    for (const x of um.installed ?? []) m.installed = m.installed.filter((y) => y.id !== x.id).concat(x);
    for (const x of um.results ?? []) m.results = m.results.filter((y) => y.id !== x.id).concat(x);
    if (um.primary) m.primary = { ...(m.primary ?? {}), ...um.primary };
    if (um.retired) m.retired = [...new Set(um.retired)];
    done.push("add-on tools");
  }
  if (u.person && (u.person.items?.length || u.person.words?.length || u.person.card !== undefined || u.person.reviewed)) {
    const up = u.person;
    const per = (s.profile.person = s.profile.person ?? { items: [] });
    const nt = normaliseText;
    const STOP = new Set(["a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "is", "are", "was", "it", "that", "this", "i", "you", "your", "my", "for", "with", "be", "as", "so", "but"]);
    const words = (x: string) => new Set(nt(x).split(" ").filter((w) => w && !STOP.has(w)));
    const similar = (a: string, b: string) => {
      if (nt(a) === nt(b)) return true;
      const wa = words(a), wb = words(b);
      if (!wa.size || !wb.size) return false;
      let inter = 0;
      for (const w of wa) if (wb.has(w)) inter++;
      return inter / (wa.size + wb.size - inter) >= 0.7;
    };
    let took = 0;
    for (const it of up.items ?? []) {
      if (!it || typeof it !== "object") { problems.push("person: an item isn't an object"); continue; }
      const byId = per.items.find((x) => x.id === it.id);
      // What the person decided is his: confirmed, rejected or hidden items are never changed by a re-sent version.
      if (byId && byId.status !== "proposed") {
        problems.push(`Skipped ${it.id}: it is already on your list, or you said it isn't you.`);
        continue;
      }
      // A thought he already has under another id (any status) never comes back under a new one.
      if (!byId && per.items.some((x) => similar(x.text, it.text))) {
        problems.push(`Skipped ${it.id}: it is already on your list, or you said it isn't you.`);
        continue;
      }
      // Claude only proposes: he decides what is confirmed.
      const { confirmed: _c, ...rest } = it;
      const next = { ...rest, status: "proposed" } as PersonItem;
      per.items = per.items.filter((x) => x !== byId).concat(next);
      took++;
    }
    if (up.card !== undefined) per.card = up.card;
    if (up.reviewed) per.reviewed = up.reviewed;
    // Words from Claude always arrive as proposed; a rejected or confirmed word is the person's and is never changed.
    let tookWords = 0;
    const CAPW = { estimate: 0.5, observed: 0.7, you_said: 0.9 } as const;
    for (const w of up.words ?? []) {
      const word = typeof w?.word === "string" ? w.word.trim() : "";
      if (!word || /\s/.test(word) || word.length > 24 || !(w.source in CAPW)) { problems.push(`Skipped a word: use one word, 24 characters or fewer, with a source.`); continue; }
      const list = (per.words = per.words ?? []);
      const cur = list.find((x) => x.word.toLowerCase() === word.toLowerCase());
      if (cur) { problems.push(`Skipped ${cur.word}: it is already on your list, or you said it isn't you.`); continue; }
      const id = `W-w${String(Math.max(0, ...list.map((x) => Number(x.id.slice(3)) || 0)) + 1).padStart(2, "0")}`;
      const weight = Math.min(5, Math.max(1, Math.round(Number(w.weight ?? 3)))) as PersonWord["weight"];
      const next: PersonWord = { id, word, weight, area: w.area, source: w.source, confidence: Math.min(CAPW[w.source], typeof w.confidence === "number" ? w.confidence : CAPW[w.source]), status: "proposed", ...(w.why ? { why: String(w.why).slice(0, 140) } : {}), ...(w.private ? { private: true } : {}) };
      list.push(next);
      tookWords++;
    }
    if (!per.items.length && !per.words?.length && per.card === undefined) delete s.profile.person;
    if (took || tookWords || up.card !== undefined || up.reviewed) done.push("what the app knows about you");
  }
  if (u.week) { s.week = u.week as GrowthState["week"]; done.push("next week's plan"); }
  for (const b of u.bets ?? []) {
    const cur = s.bets.bets.find((x) => x.id === b.id);
    if (!cur) { problems.push(`bets: ${b.id} doesn't exist`); continue; }
    Object.assign(cur, b);
  }
  if (u.bets?.length) done.push("bets");
  for (const n of u.notnow?.add ?? []) s.notnow.items.push(n);
  for (const w of u.notnow?.retire ?? []) {
    const before = s.notnow.items.length;
    s.notnow.items = s.notnow.items.filter((x) => x.what !== w);
    if (s.notnow.items.length === before) problems.push(`notnow: nothing called "${w}" to retire`);
  }
  if (u.notnow?.add?.length || u.notnow?.retire?.length) done.push("Not now");
  for (const pr of u.proof ?? []) {
    const cur = s.proof.items.find((x) => x.id === pr.id);
    if (!cur) { problems.push(`proof: ${pr.id} doesn't exist`); continue; }
    cur.status = pr.status;
    if (pr.note) cur.note = pr.note;
    if (pr.links?.length) cur.links = [...(cur.links ?? []), ...pr.links];
  }
  if (u.proof?.length) done.push("proof");
  s.library.gaps = s.library.gaps ?? [];
  for (const g of u.gaps ?? []) {
    const cur = s.library.gaps.find((x) => x.id === g.id);
    if (cur) { Object.assign(cur, g); if (g.status === "closed" && !cur.closed) cur.closed = d; }
    else s.library.gaps.push({ opened: d, status: "open", ...g } as Gap);
  }
  if (u.gaps?.length) done.push(`${u.gaps.length} gap${u.gaps.length === 1 ? "" : "s"}`);
  if (u.picks?.length) s.library.refreshed = d;

  // Plan engine. Order matters: the plan first, so research about its tasks resolves in the shared validator below.
  // None of these writes week.json; only the store's plan.project_week does.
  if (u.plan || (Array.isArray(u.research) && u.research.length) || u.review || u.run) {
    // A file on disk that could not be loaded looks absent here; writing would replace the real one, and Undo would delete it.
    const bad = await unloadedFiles(before);
    if (bad.length) throw new Error(`${bad.map((f) => `${f}.json`).join(" and ")} has problems, so nothing was changed. Say "fix my growth data" in Claude Code first.`);
  }
  if (u.plan && typeof u.plan === "object" && !Array.isArray(u.plan)) {
    if (typeof (u.plan as { tasks?: unknown }).tasks !== "object") problems.push("plan: tasks must be an object keyed by task id");
    else {
      const r = preserveTaskStatus(s.plan, u.plan);
      if (r.problems.length) problems.push(...r.problems.map((x: string) => `plan: ${x}`));
      else { s.plan = r.plan as unknown as PlanFile; done.push("the four-week plan"); }
    }
  }
  if (Array.isArray(u.research) && u.research.length) {
    const m = mergeResearch(s.research?.items as unknown as Record<string, unknown>[] | undefined, u.research as unknown as Record<string, unknown>[], d);
    if (m.problems.length) problems.push(...m.problems.map((x: string) => `research: ${x}`));
    else if (m.added.length || m.updated.length) { s.research = { updated: d, items: m.items as unknown as ResearchItem[] }; done.push(`${m.added.length + m.updated.length} research item${m.added.length + m.updated.length === 1 ? "" : "s"}`); }
  }
  if (u.review && typeof u.review === "object") {
    const r = appendReview(s.reviews, u.review as unknown as Record<string, unknown>);
    if (r.problems.length) problems.push(...r.problems.map((x: string) => `review: ${x}`));
    else { s.reviews = r.reviews as unknown as GrowthState["reviews"]; done.push("a review"); }
  }
  if (u.run && typeof u.run === "object") {
    const r = appendRun(s.runs, u.run as unknown as Record<string, unknown>);
    if (r.problems.length) problems.push(...r.problems.map((x: string) => `run: ${x}`));
    else { s.runs = r.runs as unknown as GrowthState["runs"]; done.push("the run log"); }
  }

  if (problems.length) throw new Error(`Nothing was changed. Fix these and paste again: ${problems.join("; ")}.`);
  const { errors, warnings } = validate(s as unknown as Record<string, unknown>);
  if (u.week) errors.push(...warnings.filter((w) => w.startsWith("bets:")));
  if (errors.length) throw new Error(`Nothing was changed. Claude's update didn't pass the checks: ${errors.slice(0, 6).join("; ")}${errors.length > 6 ? `; and ${errors.length - 6} more` : ""}. Paste this message back to Claude and ask it to fix the block.`);
  if (!done.length) throw new Error("Claude's block had nothing to apply.");

  (s.profile as { bridge_applied?: string[] }).bridge_applied = [...applied, fingerprint].slice(-30);
  const changed = ([...FILES, ...OPTIONAL] as readonly string[]).filter((f) => !["onboarding", "unknowns", "prior", "career"].includes(f)).filter((f) => JSON.stringify((s as unknown as Record<string, unknown>)[f]) !== JSON.stringify((before as unknown as Record<string, unknown>)[f]));
  // Keep what this reply replaces, so Undo can put it back exactly. A plan engine file that did not exist before gets an .absent marker: Undo removes it.
  await fs.rm(UNDO, { recursive: true, force: true });
  await fs.mkdir(UNDO, { recursive: true });
  await Promise.all(changed.map((f) => {
    const was = (before as unknown as Record<string, unknown>)[f];
    return was === undefined ? fs.writeFile(path.join(UNDO, `${f}.absent`), "") : fs.writeFile(path.join(UNDO, `${f}.json`), JSON.stringify(was, null, 2) + "\n");
  }));
  await Promise.all(changed.map((f) => write(f as DataFile, (s as unknown as Record<string, unknown>)[f])));
  return { state: s, summary: done };
}

const JOURNEY = path.join(process.cwd(), "..", "companion", "journey.md");

/** Persona for the Claude app version of the companion (a Project's custom instructions). It cannot read files, so it works from the pack. */
export const COMPANION_INSTRUCTIONS = `# the person's Growth, in Claude Code

You are the person's growth mentor: a calm, honest senior design mentor who knows his whole journey. This chat exists so he can open Claude and talk, with nothing else cluttering the chat. You are conversational, not a report generator. The person is anxious and has imposter syndrome, so be warm, steady and specific.

## What you work from

You cannot read his files. The Growth pack file ("growth-companion-<date>.md") attached to this chat is the pack: the growth-coach skill, his career dossier, the evidence base, his full current state (profile, skills, week, gaps, library, journal, past feedback, goal) and your journey notes. Read it silently at the start of every chat. If the pack looks older than a week, or he says he changed things in the app, tell him once that a fresh pack would help.

## Start of every chat

Greet him in a few lines at most: one line on where things stand (the ready-by date from the gaps, tonight's tasks, anything Claude owes him), then ask what's on his mind. Do not dump a report.

## How you talk

- Answer like a person who knows him. Use the pack; never ask what it already answers.
- Assess his work against the rubric with evidence: name the marker and cite the entry id.
- Diagnose before advising. If a decision rests on a fact you don't have, ask one exact question with a number, a link or a yes/no.
- Never invent facts, numbers, links, quotes or outcomes.
- Feedback is about the work, never about him. Name what to change first, then why it helps.
- If the pack has a "Core card" section, read it first: it is what the person has confirmed about how he works, to shape tone and advice. Use it quietly, add one "Because ..." line only when it changed your answer, and never raise a worry he hasn't raised.
- When he spirals, follow "When the person spirals" in the skill: name it once, answer with his evidence, one small thing for tonight.
- Copy rules for anything the person reads: plain second person, no em or en dashes, no game words, no failure framing, warm and calm.
- Keep replies short. One idea at a time.
- Obey the dossier's sections 3.9 and 3.10: keep confidential items out, credit only the person's own work.

## Changing things with him

Before you propose any week change, read the current files first, so your change is based on the current data.

You can't edit files. When the person agrees in the chat to a change (plan, tasks, goal, gaps, library, proof, bets, not-now), reply with exactly ONE fenced code block tagged growth-update, in the format from the pack ("How to reply"), containing only the keys that change, and put the copy id from the top of the pack in "based_on". Tell him in a line what it does and to paste your whole reply into the paste box on the Commands page. The app checks it and applies it only if it passes. Never claim a change happened until he confirms it applied.

## Memory

At the end of a meaningful chat, offer a journey note: 3 to 5 plain lines of decisions made, how he feels about the goal, and things to remember. He can paste it into the app's journal. Only what he would want remembered; never secrets or confidential details.`;

/** The companion pack for the Claude app: instructions plus everything the app can export, always in full, plus the companion's journey notes. */
export async function companionPack(s: GrowthState, part: "all" | "instructions" = "all", withCard = true): Promise<string> {
  if (part === "instructions") return COMPANION_INSTRUCTIONS;
  const journey = await readOr(JOURNEY, "");
  // The export is written for the "Copy for Claude" flow. In the pack the Project instructions lead, so drop its coach preamble and check-in line.
  const packReference = (await exportForClaude(s, true))
    .replace(/^# Growth app: work for Claude/m, "### Growth app: work for Claude")
    .replace(/^Today is (\d{4}-\d{2}-\d{2})\. You are the person's growth coach\..*$/m, "Today is $1. Everything the app can export is below. Follow the growth-coach skill (included at the end).")
    .replace(/- Nothing is queued\. Do a check-in:.*$/m, "- Nothing is queued.")
    .replace(/"person_card": "(?:[^"\\]|\\.)*"/g, '"person_card": null')
    .replace(/"person_words(_declined)?": "(?:[^"\\]|\\.)*"/g, withCard ? "$&" : '"person_words$1": null');
  // Only the short core card travels. Person items, private or not, never leave the app.
  const card = withCard ? s.profile.person?.card?.trim() : "";
  return [
    "# Growth pack",
    "",
    `Made ${today()}. This is the knowledge file for Growth in Claude Code. The instructions are separate.`,
    "",
    "## Core card (what the person has confirmed about how he works)",
    card || "(Not included: nothing confirmed yet, or switched off in the app. Do not guess.)",
    ...(card ? ["", "This card is the only part of the person model in this pack."] : []),
    "",
    "## Journey notes (the companion's long-term memory)",
    journey.trim().replace(/^# /m, "## ") || "(No notes yet.)",
    "",
    "## Reference: the app's export format. Only use 'How to reply' when the person has agreed to a change.",
    "",
    packReference,
  ].join("\n");
}
