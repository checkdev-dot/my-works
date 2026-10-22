import type { GrowthState, ProofItem, Task } from "./types";

/** Skill levels run 1 (Junior) to 4 (Lead) in half steps. */
export const LEVEL_WORDS: Record<string, string> = { "1": "Junior", "1.5": "Junior+", "2": "Mid", "2.5": "Mid+", "3": "Senior", "3.5": "Senior+", "4": "Lead" };
export const levelWord = (l: number) => LEVEL_WORDS[String(Math.round(l * 2) / 2)] ?? `Level ${l}`;
export const nextLevel = (l: number) => Math.min(4, Math.floor(l * 2) / 2 + 0.5);

/**
 * One chain, everywhere: a quest gives 20 XP to the thing it trains.
 * Skill quests fill that skill's bar; 60 XP means Claude re-rates the skill on Sunday, and the skill's level moves the ratings.
 * Getting hired quests fill the proof item they build; finishing it moves the CV and interview ratings.
 */
export const XP_PER_TASK = 20;
export const XP_PER_LEVEL = 60;
/** What lead and senior roles usually expect on each rating (0–100). */
export const TARGET = 70;

const toScore = (avg: number) => Math.max(0, Math.min(100, Math.round(((avg - 1) / 3) * 100)));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
// Bands sit on the lead-ready line: nothing below 70 reads as green.
export const ratingWord = (n: number) => (n >= 85 ? "Strong" : n >= TARGET ? "Solid" : n >= 40 ? "Taking shape" : "Early");
export const isDone = (p?: ProofItem) => !!p && (p.status === "done" || p.status === "verified");
/** Self-reported proof counts for 70% until someone outside has read it. */
const proofWeight = (p: ProofItem) => (p.status === "verified" ? 1 : p.status === "done" ? 0.7 : p.status === "draft" ? 0.4 : 0);

export const RATING_SKILLS = {
  work: ["craft", "product_thinking", "systems", "building", "domain", "collaboration"],
  interview: ["communication", "research", "product_thinking", "collaboration"],
} as const;

export type RatingKey = "work" | "interview" | "cv";
export interface Rating { key: RatingKey; name: string; short: string; score: number; word: string; means: string; how: string; held: string; next: string }

const lv = (s: GrowthState, id: string) => s.skills.ratings[id]?.level ?? 1;
const confirmed = (s: GrowthState, id: string) => ["shipped", "expert", "market"].includes(s.skills.ratings[id]?.source ?? "");

function scores(s: GrowthState) {
  const work = toScore(mean(RATING_SKILLS.work.map((c) => lv(s, c))));
  const proofBonus = Math.round(s.proof.items.reduce((n, p) => n + (p.interview ?? 0) * proofWeight(p), 0));
  const interview = Math.min(100, toScore(mean(RATING_SKILLS.interview.map((c) => lv(s, c)))) + proofBonus);
  const cv = Math.min(100, 10 + Math.round(s.proof.items.reduce((n, p) => n + (p.cv ?? 0) * proofWeight(p), 0)));
  return { work, interview, cv };
}

export function ratings(s: GrowthState): Rating[] {
  const { work, interview, cv } = scores(s);
  const nameOf = (id: string) => (s.rubric.competencies.find((c) => c.id === id)?.name ?? id).split(":")[0];
  // Ties go to this month's focus skill, so the app never points two ways at once.
  const focus = s.bets.bets.find((b) => b.track === "skill" && b.status === "active")?.focus;
  const weakest = (ids: readonly string[]) => [...ids].sort((a, b) => lv(s, a) - lv(s, b) || (b === focus ? 1 : 0) - (a === focus ? 1 : 0))[0];
  const conf = (ids: readonly string[]) => ids.filter((c) => confirmed(s, c)).length;
  const cvNext = [...s.proof.items].filter((p) => !isDone(p) && (p.cv ?? 0) > 0).sort((a, b) => (b.cv ?? 0) - (a.cv ?? 0))[0];
  return [
    { key: "work", name: "Doing the job", short: "Job", score: work, word: ratingWord(work), means: "How you'd perform day to day as a product designer.",
      how: `Average of 6 skills; ${conf(RATING_SKILLS.work)} of 6 confirmed by shipped work, the rest are estimates.`,
      held: `Lowest: ${nameOf(weakest(RATING_SKILLS.work))}.`, next: "Rises as skills level up on Sundays." },
    { key: "interview", name: "Interview readiness", short: "Interviews", score: interview, word: ratingWord(interview), means: "How you'd come across explaining your work and decisions.",
      how: `Average of ${RATING_SKILLS.interview.map(nameOf).join(", ")}, plus finished case studies.`,
      held: `Lowest: ${nameOf(weakest(RATING_SKILLS.interview))}.`, next: "Rises with research, communication and each case study." },
    { key: "cv", name: "CV and portfolio", short: "CV", score: cv, word: ratingWord(cv), means: "How a recruiter sees you in the first minute.",
      how: `Adds up the ${s.proof.items.filter((p) => (p.cv ?? 0) > 0).length} things recruiters look for, from a base of 10. Self-reported items count 70% until someone else has read them; drafts count 40%.`,
      held: cvNext ? `Missing: ${cvNext.name}.` : "Most of what recruiters look for is there.", next: cvNext ? `${gainText(cvNext, "cv")}.` : "Keep it current." },
  ];
}

/** XP a stat has earned since its last rating. */
export function statXp(s: GrowthState, competency: string) {
  const r = s.skills.ratings[competency];
  const since = r?.history[r.history.length - 1]?.date ?? "0000";
  const n = s.evidence.entries.filter((e) => e.competency === competency && (e.points ?? 0) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date >= since).reduce((sum, e) => sum + (e.points ?? 0), 0);
  return Math.min(XP_PER_LEVEL, n);
}

/** XP from work shipped before this app existed: the three years count. */
export const priorXp = (s: GrowthState) => s.evidence.entries.filter((e) => e.points === undefined && (e.type === "shipped" || e.type === "expert")).length * XP_PER_TASK;

/** The character: all eight skills combined. */
export function character(s: GrowthState) {
  const avg = mean(s.rubric.competencies.map((c) => lv(s, c.id)));
  const floor = Math.floor(avg * 2) / 2;
  const toNext = (avg - floor) / 0.5;
  const earned = s.evidence.entries.reduce((n, e) => n + (e.points ?? 0), 0);
  const prior = priorXp(s);
  return { avg, word: levelWord(floor), next: levelWord(Math.min(4, floor + 0.5)), toNext, totalXp: earned + prior, earned, prior };
}

export type Chain =
  | { kind: "skill"; stat: string; full: boolean; xpFrom: number; xpTo: number; levelFrom: string; levelTo: string; ratings: { key: RatingKey; name: string; from: number; to: number }[] }
  | { kind: "proof"; proofId: string; proof: string; step: number; steps: number; cvFrom: number; cvTo: number; cvSeen: number; interviewFrom: number; interviewTo: number; unlocks?: string }
  | { kind: "plain"; adds: string };

/** What finishing a task changes, end to end, in numbers. */
export function chainOf(s: GrowthState, t: Task): Chain {
  if (t.track === "skill" && t.competency) {
    const id = t.competency;
    const r = s.skills.ratings[id];
    const xp = statXp(s, id);
    const before = scores(s);
    const bumped: GrowthState = { ...s, skills: { ...s.skills, ratings: { ...s.skills.ratings, [id]: { ...r, level: nextLevel(r.level) } } } };
    const after = scores(bumped);
    const names = { work: "Doing the job", interview: "Interview readiness", cv: "CV and portfolio" } as const;
    return {
      kind: "skill", stat: (s.rubric.competencies.find((c) => c.id === id)?.name ?? id).split(":")[0], full: xp >= XP_PER_LEVEL,
      xpFrom: xp, xpTo: Math.min(XP_PER_LEVEL, xp + t.points), levelFrom: levelWord(r.level), levelTo: levelWord(nextLevel(r.level)),
      ratings: (["work", "interview"] as const).filter((k) => after[k] > before[k]).map((k) => ({ key: k, name: names[k], from: before[k], to: after[k] })),
    };
  }
  const gate = t.proof ? s.proof.items.find((p) => p.id === t.proof) : undefined;
  if (gate && !isDone(gate)) {
    const before = scores(s);
    const as = (status: ProofItem["status"]) => scores({ ...s, proof: { ...s.proof, items: s.proof.items.map((p) => (p.id === gate.id ? { ...p, status } : p)) } });
    const after = as("done");
    const seen = as("verified");
    const steps = s.week.tasks.filter((x) => x.proof === gate.id);
    const stepsDone = steps.filter((x) => x.status === "done" || x.status === "submitted").length;
    return { kind: "proof", proofId: gate.id, proof: gate.name, step: stepsDone + 1, steps: Math.max(1, steps.length), cvFrom: before.cv, cvTo: after.cv, cvSeen: seen.cv, interviewFrom: before.interview, interviewTo: after.interview, unlocks: gate.unlocks };
  }
  return { kind: "plain", adds: t.adds };
}

/** What one proof item adds to a rating. One source for every screen: what it counts for now, and what's left to gain once it's done and someone has seen it. */
export function gainOf(p: ProofItem, key: "cv" | "interview") {
  const w = p[key] ?? 0;
  const now = Math.round(w * proofWeight(p));
  const atDone = Math.max(now, Math.round(w * 0.7));
  return { full: w, now, left: w - now, whenDone: atDone - now, whenSeen: w - atDone };
}
/** The one way a proof item's gain is written, on every screen. */
export function gainText(p: ProofItem, key: "cv" | "interview") {
  const g = gainOf(p, key);
  if (!g.full) return "";
  if (p.status === "verified") return `+${g.full}, counted`;
  return [g.whenDone ? `+${g.whenDone} when done` : "", g.whenSeen ? `+${g.whenSeen} once someone else has read it` : ""].filter(Boolean).join(" · ");
}

/** How far a proof item is: its quests this week, then done. */
export function proofSteps(s: GrowthState, id: string) {
  const steps = s.week.tasks.filter((x) => x.proof === id);
  return { done: steps.filter((x) => x.status === "done" || x.status === "submitted").length, total: steps.length };
}


/** Hand-ins Claude reviews: every skill task, and getting-hired work that a recruiter will see. */
export const reviewed = (t: Task) => t.track === "skill" || t.kind === "proof";
