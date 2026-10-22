import type { Pace, PlanForecast } from "./types";

export const PLAN_CONFIG: {
  horizon_weeks: number; weekly_check_day: string; review_auto_run: boolean; per_week_evenings: number;
  max_tasks_per_night: number; max_min_per_night: number; slack_pct: number; min_task_min: number; max_task_min: number;
  rest_night_fallback: string; caps: Record<string, number>; fresh_days: Record<string, number>;
  weekly_check_max_days: number; review_suggest_done_share: number;
};
export const DAYS: string[];
export function stable(v: unknown): string;
export function sha1(s: string): string;
export function hashOf(v: unknown): string;
export function addDays(iso: string, n: number): string;
export function ageDaysOf(iso: string | undefined | null, today: string): number | null;
export function posOf(p: { week: number; day: string }): number;
export function isOpenTask(t: { status?: string }): boolean;
export function defaultRestNight(weekTasks: { day?: string }[]): string;
export function deriveDemands(d: Record<string, any>, today: string): { updated: string; source_hash: string; items: { id: string; kind: string; text: string; from: string; hard?: boolean; status?: string }[] };

export interface PlaceTask { id: string; minutes: number; track: "skill" | "reach"; depends_on?: string[]; wait_days?: number; rank?: number; later?: boolean; status?: string; where?: "phone" | "desk" }
export interface PlaceConstraints {
  weeks?: number; per_week_evenings?: number; max_tasks_per_night?: number; max_min_per_night?: number; slack_pct?: number;
  rest_night?: string; from_day?: string; occupied?: { week: number; day: string; minutes: number; track: string }[];
}
export interface Placement { id: string; week: number; day: string; order: number; slot_min: number; placed_because: string; depends_on: string[]; load_that_day_min: number; single_track_reason?: string }
export function placeTasks(tasks: PlaceTask[], constraints?: PlaceConstraints): { placements: Placement[]; overflow: { id: string; reason: string }[]; notes: string[] };
export function planForecast(s: Record<string, any>, pace: Pace, opts: { today: string; perWeek?: number }): PlanForecast;
export function planStatus(d: Record<string, any>, today: string): { has_plan: boolean; horizon: number | null; weeks_done: number; review_due: boolean; stale_research_count: number; next_action: string; next_action_note: string };

export const PLAN_PHRASES: { plan: string; review: string; check: string; why: string };
export const SETTLED: string[];
export function normClaim(x: unknown): string;
export function researchItemProblems(r: unknown, today?: string): string[];
export function mergeResearch(existing: Record<string, any>[] | undefined, incoming: Record<string, any>[], today?: string): { items: Record<string, any>[]; added: string[]; updated: string[]; skipped: { id: string; why: string }[]; problems: string[] };
export function preserveTaskStatus(oldPlan: Record<string, any> | undefined, newPlan: Record<string, any>): { plan: Record<string, any>; kept: string[]; problems: string[] };
export function projectWeek(week: Record<string, any>, plan: Record<string, any> | undefined): { week: Record<string, any>; added: string[]; removed: string[]; kept: string[]; problems: string[] };
export function appendRun(runs: { runs: Record<string, any>[] } | undefined, run: Record<string, any>): { runs: { runs: Record<string, any>[] }; problems: string[] };
export function appendReview(reviews: { reviews: Record<string, any>[] } | undefined, review: Record<string, any>): { reviews: { reviews: Record<string, any>[] }; problems: string[] };
export function normExcerpt(x: unknown): string;
export function verifyExcerpts(items: { id: string; excerpt?: string }[], pages: { id: string; fetched_text?: string; http?: number }[]): { matched: { id: string; result: "match"; http?: number }[]; failed: { id: string; result: "mismatch" | "unreachable"; http?: number; why: string }[]; missing: string[] };
