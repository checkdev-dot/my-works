import type { GapResult, GapTask, DomainLevel, DomainFamily, DomainRole } from "./domains.mjs";

export const FAMILY_BY_WORD: Record<string, DomainFamily>;
export const LEVEL_BY_WORD: Record<string, DomainLevel>;
export const WORD_BY_LEVEL: Record<DomainLevel, string>;
export const LEVEL_NAMES: Record<DomainLevel, string>;
export const OUTSIDE_NOTE: string;
export const DOMAIN_MUST_CAP: number;
export const DOMAIN_MINIMUM_VIABLE: string[];

export function roleIdFor(text: string): string | null;
export function nearestLaunch(roleId: string): { role: string; level: DomainLevel | null; mapped: boolean; from?: string } | null;
export interface DomainSelection {
  asked: boolean; family_now: DomainFamily | null; role_now: string | null; level_now: DomainLevel | null;
  targets: { role: string; level: DomainLevel; weight: number; kind: "primary" | "optional" | "bridge"; sequential?: boolean }[];
  role_mapped: { now?: string; target?: string; second?: string }; outside: boolean; notes: string[]; second: unknown; target_setting: "employee" | "business" | null; target_words: string | null; target_level: DomainLevel | null; target_role?: string | null;
}
export function domainSelection(answers: Record<string, unknown>): DomainSelection;
export function sameIndustryOf(answers: Record<string, unknown>): boolean | undefined;
export function domainPatchesFor(id: string, a: unknown, answers: Record<string, unknown>, today: string): { file: string; path: string; value: unknown; op: string }[];
export function proofFrom(domain: unknown): Record<string, number>;
export function claimedFrom(domain: unknown): Record<string, number>;
export const HEDGE_RE: RegExp;
export const CLAIMED_CONFIDENCE: number;
export const BUSINESS_OPTION: string;
export const BUSINESS_COMPETENCY_IDS: string[];
export const BUSINESS_BLOCKER_KINDS: string[];
export const EVIDENCE_KEYS: Record<string, string[]>;
export function assessResult(parts: (string | null | undefined)[], requires?: string[]): { state: "proved" | "claimed" | "none" | "unknown"; confidence: number | null; found: Record<string, boolean>; hedged: boolean };
export function resultState(domain: unknown): { state: "proved" | "claimed" | "none" | "unknown"; confidence: number | null; found: Record<string, boolean>; hedged: boolean };
export function levelFromTitle(text: string, roleId?: string): string | null;
export function domainClearPatchesFor(id: string): { file: string; path: string; value: unknown; op: string }[];
export function domainEstimateIds(ob: unknown): string[];
export function countedRatings(input: { profile: unknown; skills: unknown; rubric: unknown; hoursPerWeek?: number }): Record<string, { level_claimed: number; level_counted: number; capped: boolean; cap_reason?: string }>;
export function businessOverlay(input: { profile: unknown; hoursPerWeek?: number; completed?: string[] }): Record<string, unknown> | null;
export function gapPreview(g: DomainGap | null, hoursPerWeek?: number): Record<string, any> | null;
export function currentFromRatings(ratings: Record<string, unknown>, rubric: unknown): Record<string, unknown>;
export function rubricHostFor(domainId: string, rubric: unknown): string | null;
export interface DomainGap {
  ok: boolean; status: string; error?: string; result: GapResult;
  targets: { role: string; level: DomainLevel; weight: number; kind: string; sequential?: boolean }[]; fromRole: string | null;
  hoursPerWeek?: number; tasks?: GapTask[]; proof?: Record<string, number>;
}
export function gapFromProfile(input: { profile: unknown; skills: unknown; rubric: unknown; hoursPerWeek?: number; completed?: string[] }): DomainGap | null;
export function domainGapEntries(g: DomainGap | null, rubric: unknown, today: string): Record<string, unknown>[];
export function domainSummary(g: DomainGap | null, sel?: DomainSelection): Record<string, unknown> | null;
export function dmApplies(q: unknown, sel: DomainSelection): boolean;
export function domainProgress(ob: unknown): Record<string, any>;
export function domainRubricFor(roleId: string, level: DomainLevel, n?: number): { role: string; level: DomainLevel; levels: Record<string, string>; competencies: { id: string; name: string; group: string; levels: Record<string, string>; research: string[] }[] } | null;
export function domainTargetName(answers: Record<string, unknown>): string | undefined;
export type { DomainRole };
export function domainLevelProblem(answers: Record<string, unknown>, id: string, value: unknown): string | null;
export function domainLevelOptions(answers: Record<string, unknown>, id: string): { role: string | null; options: string[]; ladder: { level: string; title?: string; scope: string }[] };
export function taskRef(t: Record<string, any>, idByKey?: Record<string, string>): Record<string, unknown>;
export function gapIdIndex(gaps: unknown): Record<string, string>;
