import type { OnboardAnswer, OnboardingFile, UnknownItem } from "./types";

export interface Patch {
  file: "profile" | "evidence" | "proof" | "onboarding" | "prior";
  path: string;
  value: unknown;
  op: "set" | "append";
  because: string[];
  as_of: string;
  confidence: number;
  reviewed_by: string;
  question: string;
  private?: boolean;
}
export interface Contradiction {
  id: string; between: string[]; detail: string; status: "open" | "resolved" | "accepted_by_dev"; resolved_by?: string;
  /** "note" never blocks a round; "block" must be decided before the round ends. */
  severity?: "note" | "block";
  /** True when only changing an answer can settle it (it cannot be accepted). */
  fixable_only?: boolean;
}
export interface HoursInfo { per_week: number | null; per_day: number | null; nights: number; basis: string; capped_by_focus: boolean; provisional: boolean; missing: string[] }
export interface Risk { id: string; text: string; source: string; watch: string }
export interface MapperOut {
  patches: Patch[];
  tasks: Record<string, any>[];
  gaps: Record<string, any>[];
  demands: { updated: string; source_hash: string; items: Record<string, any>[] };
  unknowns: UnknownItem[];
  contradictions: Contradiction[];
  risks: Risk[];
  /** Skill areas from R1 that could not be placed on a competency of the rubric. */
  unmapped: { id: string; skill_area: string; reason: string }[];
  /** ready_by is partial when some competencies are not assessed and have no gap, or the rubric is still generic. */
  readiness: { partial: boolean; missing: string[]; generic_rubric: boolean };
  hours: HoursInfo;
  /** hours x 60 x 0.9, from the one hours function; null when no hours are known. */
  capacity_min_per_week: number | null;
}
export interface Progress {
  status: string; round: string; answered: number; unknown: number; skipped: number;
  must_total: number; must_answered: number; must_unknown: number;
  per_round: Record<string, { must_total: number; must_done: number }>;
  missing_must: string[]; skipped_once: string[]; deferred_must: string[];
  adaptive: { registered: number; competencies: string[]; with_research: number; skipped: boolean; unsourced: boolean; min: number; ok: boolean };
  unmapped: string[];
  ready_to_plan: boolean; readiness: "not_yet" | "ready" | "enough_with_gaps" | "exploring"; readiness_blockers: string[]; r1_r2_missing: string[];
  /** No target role yet: the course is an exploration course. */
  exploring: boolean;
  /** quick, standard (default) or deep: how many optional questions are offered. */
  depth: "quick" | "standard" | "deep";
  /** Optional questions offered now, best value first, packed into what is left of the sitting. */
  optional_ids: string[];
  optional_left_in_round: number;
  next_ids: string[]; open_unknowns: number;
}
export function valueHash(v: unknown): string;
export function confidenceFor(o?: { evidence_ask?: string; evidence?: string[]; hasNumber?: boolean; given?: number }): number;
export function confidenceBand(c: number): "low" | "medium" | "high";
export function displayValue(v: unknown): string;
export function shouldMirror(q: any, a: any): boolean;
export function intakeItem(q: any, a: any, today: string, vocab?: Record<string, string | undefined>): { id: string; q: string; why: string; asked: string; answer: string; date: string; source: "self"; takeaway: string };
export function vocabOf(state: Record<string, any>, answers?: Record<string, any>): Record<string, string | undefined>;
export function hoursInfo(answers: Record<string, any>, existingContradictions?: Contradiction[]): HoursInfo;
export function applyPatches(state: Record<string, any>, patches: Patch[]): { state: Record<string, any>; touched: string[] };
export function unknownFor(q: any, status: string, ledger: UnknownItem[], today: string, seq?: number, vocab?: Record<string, string | undefined>): UnknownItem | null;
export function mapUnknownFor(skillArea: string, ledger: UnknownItem[], today: string): UnknownItem;
export function researchRoundUnknown(ledger: UnknownItem[], today: string, reason: string): UnknownItem;
export function detectContradictions(state: Record<string, any>, answers: Record<string, any>, today?: string): Contradiction[];
export function mergeContradictions(existing: Contradiction[], found: Contradiction[]): Contradiction[];
export function blocking(list: Contradiction[] | undefined): Contradiction[];
export function consumerOutputs(answers: Record<string, any>, today: string): { tasks: Record<string, any>[]; risks: Risk[]; demands: Record<string, any>[] };
export function deriveBrief(ob: OnboardingFile | undefined | null): { check_in_every: number; feedback_style: "plain" | "name_what_you_did"; feedback_tone: string; slip_policy: string };
export function applyAnswers(state: Record<string, any>, answers: Record<string, OnboardAnswer | any>, opts?: { today?: string; only?: string[] }): MapperOut;
export function adaptiveStatus(ob: OnboardingFile | undefined | null): Progress["adaptive"];
export function roundQuestions(ob: OnboardingFile | undefined, round: string): { id: string; must: boolean; hard: boolean }[];
export function progress(ob: OnboardingFile | undefined | null, ledger?: UnknownItem[]): Progress;
export function nextCommand(ob: OnboardingFile | undefined | null): "growth start" | "resume" | null;
export function newOnboarding(today: string, o?: { backup?: string; round?: string }): OnboardingFile;
export function capacityMinPerWeek(hours: number): number;
export function employedOf(answers: Record<string, any>): boolean;
export const NO_EMPLOYER_IDS: string[];

export interface Normalised {
  ok: boolean;
  /** One number (num) or [low, high] (numpair), in the unit the question asks. Null for a refused range. */
  value?: number | [number, number] | null;
  low?: number; high?: number; is_range?: boolean;
  unit?: string; currency?: string | null; period?: "month" | "year" | null; normalised_to?: string;
  confidence?: number; converted?: boolean;
  /** Present when the same figure has two readings (per month or per year); the answer is sent again with unit or reading_confirmed. */
  ambiguous: { reading: string; value: number }[];
  warnings: string[];
  needs_confirm?: boolean;
  echo?: string;
  message?: string;
  passthrough?: boolean;
}
/** P1-2: turns what a person said into the one number (or low and high) a number question asks for, or refuses with a precise message. */
export function normaliseValue(q: any, raw: unknown, ctx?: { currency?: string; period?: "month" | "year"; unit?: string; confirmed?: boolean; hours_per_week?: number }): Normalised;
export function parseNumberToken(tok: string): number;
export function periodIn(text: string): "month" | "year" | "week" | "hour" | "day" | "none" | "mixed";
export function currencyIn(text: string): string | null;
export function parseRangeClaim(text: string, ctx?: { currency?: string; period?: "month" | "year" }): { low: number; high: number; currency: string | null; period: "month" | "year"; converted: boolean } | null;
export const EXPLORING_NA: string[];
export const EXPLORING_MUST: string[];
export const STANDARD_NICE: Record<string, number>;
export function isExploring(answers: Record<string, any>): boolean;
export function isMustFor(ob: Record<string, any> | undefined, id: string): boolean;
export function optionalIds(ob: Record<string, any> | undefined): string[];
export function explorationTasks(answers: Record<string, any>, today: string): Record<string, any>[];
export function roundQuestions(ob: Record<string, any> | undefined, round: string): { id: string; must: boolean; hard?: boolean; na?: boolean }[];
