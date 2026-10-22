export type DomainFamily = "D" | "P" | "M";
export type DomainLevel = "J" | "M" | "S" | "L" | "H";
export type DomainStatus = "model" | "unverified" | "verified";
export type TaskKind = "proof" | "test" | "learn" | "ask" | "bridge";

export interface DomainRole {
  id: string; family: DomainFamily; name: string; anchor: DomainLevel; status: "launch" | "planned"; launch: boolean;
  proof_kind: string | string[]; base: number[] | null;
  ladder: Record<DomainLevel, { title: string; scope: string } | null>;
  source: { label: string; url: string | null; retrieved: string | null; note?: string };
}
export interface DomainTask {
  id: string; kind: TaskKind; family: DomainFamily | "X"; competency: string; also?: string[]; level: [number, number] | null; minutes: number;
  verb: string; output: string; task: string; min_evidence: string; source_type?: string; sources?: string[];
  from?: DomainFamily | "X"; to?: DomainFamily | "X"; proves?: string; role_asked?: string;
}
export interface RatingInput { level: number; confidence?: number; source?: "market" | "expert" | "shipped" | "ai" | "self"; evidence?: unknown[] | string; tested?: boolean }
export interface GapTarget { role: string; level: DomainLevel; weight?: number; kind?: "primary" | "optional" | "bridge"; sequential?: boolean }

export interface GapRow {
  competency: string; index: number; gap: number; weighted: number; priority: number; target: number; current: number | null; effective: number;
  transfer_w: number; core: boolean; importance: number; provisional: boolean; evidenced: boolean; known: boolean; confidence: number | null;
  basis: string; capped: boolean; roles: string[]; shared: boolean; carried: boolean; evenings: number; evenings_adjusted: number;
  blocks_applying: boolean; dependents_open: number; waits_for: string[]; status: DomainStatus; because: string[];
}
export interface GapBlocker {
  id: string; kind: string; label: string; needs: number; have: number | null; cleared: boolean; provisional: boolean; cleared_by: string;
  clears_with: string[]; role: string; cross_over: boolean; because: string[]; status: DomainStatus;
  claimed?: boolean; claimed_confidence?: number; business?: boolean;
}
export interface GapWaypoint { role: string; level: DomainLevel; distance: number; evenings: number; first_hop: string[]; warn: string; because: string[]; status: DomainStatus }
export interface GapTask {
  id: string; kind: TaskKind; family: DomainFamily | "X"; competency: string; gap_ref: string | null; minutes: number; verb: string; output: string;
  task: string; min_evidence: string; source_type?: string; sources: string[]; because: string[]; status: DomainStatus; order: number;
  clears_blocker?: string; conditional?: string; reps?: number; practice?: string; week?: number;
}
export interface GapResult {
  ok: boolean; status: string; error?: string; distance: number | null; distance_raw?: number; evenings: number | null;
  byCompetency: GapRow[]; blockers: GapBlocker[]; clearedBlockers?: GapBlocker[]; waypoints: GapWaypoint[]; orderedTasks: GapTask[];
  sharedBase: string[]; targets?: { role: string; level: string; kind: string; weight: number }[]; warning?: string;
  basis: Record<string, unknown>;
}
export interface GapInput {
  current?: Record<string, RatingInput | number>;
  target?: { role: string; level: DomainLevel };
  targets?: GapTarget[];
  fromRole?: string | null;
  sameIndustry?: boolean;
  roles?: Record<string, { family?: DomainFamily; anchor?: DomainLevel; base: number[]; status?: string }>;
  constraints?: {
    proof?: Record<string, number>; exclude?: string[]; completed?: string[]; hoursPerWeek?: number; threshold?: number;
    noWaypoints?: boolean; fromRole?: string; roles?: GapInput["roles"];
  };
}

export const DOMAINS: Record<string, any>;
export const COMPETENCY_ORDER: string[];
export const LAUNCH_ROLES: string[];
export const TASKS: DomainTask[];
export function taskById(id: string): DomainTask | null;
export function listRoles(o?: { launchOnly?: boolean }): DomainRole[];
export function getRole(id: string, opts?: { roles?: GapInput["roles"] }): DomainRole | null;
export function roleVector(roleId: string, level: DomainLevel, opts?: { roles?: GapInput["roles"] }): Record<string, number> | null;
export function transfer(fromRole: string | null, toRole: string, competencyId: string, opts?: { sameIndustry?: boolean; roles?: GapInput["roles"] }): number;
export function currentLevel(rating: RatingInput | number | null | undefined, target: number): { known: boolean; level: number | null; confidence: number | null; evidenced: boolean; provisional: boolean; basis: string; capped?: boolean };
export function mapRubricLevels(ratings: Record<string, RatingInput | number>, own?: Record<string, RatingInput>): Record<string, RatingInput & { mapped_from?: string[]; factor?: number }>;
export function computeGap(input: GapInput): GapResult;
export function roleDistance(from: { role: string; level: DomainLevel }, to: { role: string; level: DomainLevel }, opts?: { sameIndustry?: boolean; roles?: GapInput["roles"] }): GapResult | null;
export function pickTasks(gapResult: GapResult, hoursPerWeek?: number, n?: number): GapTask[];
