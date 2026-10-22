import type { BankQuestion } from "./onboarding-bank.mjs";

export interface DomainQuestion extends BankQuestion {
  topics: string[];
  applies: { family?: "D" | "P" | "M"; when?: string } | null;
  options_by_family?: Record<"D" | "P" | "M", string[]>;
  off_limit_topics?: string[];
}
export interface R2Template { queries: string[]; tiers: number[]; extract: string[]; caps: { searches: number; fetches: number } }

export const DOMAIN_ROUNDS: Record<string, string>;
export const DOMAIN_BANK: DomainQuestion[];
export const DOMAIN_RETIRED_IDS: string[];
export const domainById: Record<string, DomainQuestion>;
export const DOMAIN_MODEL_PATHS: string[];
export const DOMAIN_MODEL_PATHS_NEW: string[];
export const SPEC_PATH_ADDITIONS: string[];
export const R2_RUN_CAPS: { searches: number; fetches: number; haiku: number; advisor: number };
export const R2_TIERS: Record<number, string>;
export const R2_EXTRACT_ALL: string[];
export const R2_TEMPLATES: Record<string, R2Template>;
export const SECOND_TARGET_CAP_FACTOR: number;
export function lintDomainBank(o?: { extraPaths?: string[] }): { ok: boolean; fails: string[]; warns: string[]; counts: { total: number; must: number; nice: number; retired: number; new_paths: number; r2_templates: number } };
