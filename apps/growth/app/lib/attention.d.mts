import type { GrowthState } from "./types";

export type AttentionLevel = "now" | "today" | "week" | "fyi";
export type AttentionView = "today" | "skill" | "reach" | "journal" | "library" | "companion";
export type AttentionAction =
  | { type: "view"; view: AttentionView }
  | { type: "sheet"; sheet: { kind: "intake" } | { kind: "respond"; id: string } | { kind: "skill"; id: string } | { kind: "quest"; id: string } }
  | { type: "command"; cmd: string };

export interface AttentionItem {
  id: string;
  level: AttentionLevel;
  kind: string;
  /** Plain, 70 characters at most. */
  title: string;
  /** One quiet line, 100 characters at most. */
  why?: string;
  /** YYYY-MM-DD the thing dates from (or is due): used for ordering and the time phrase. */
  when?: string;
  action: AttentionAction;
  count?: number;
  /** For tonight and carried: how many tasks the one item stands for, and which. */
  taskCount?: number;
  taskIds?: string[];
}

/** "Carried over", defined once: still open from an earlier day this week. */
export function carriedOver<T extends { id: string; day?: string; status: string }>(tasks: T[], todayIdx: number, pathIds?: string[]): { all: T[]; onPath: T[]; rest: T[] };

export interface AttentionContext {
  /** Replies from Claude not yet seen on this device. The app reads it from local storage. */
  unreadReplies?: number;
  /** From GET /api/onboarding-status. "not_started" or "paused" adds one "Start your onboarding" item at "today". Missing adds nothing. */
  onboarding?: { status?: "not_started" | "in_progress" | "paused" | "complete" } | null;
}

export const LEVEL_ORDER: AttentionLevel[];
export function deriveAttention(state: GrowthState, now: Date, ctx?: AttentionContext): AttentionItem[];
/** The one summary: n is the sum of the numbers written in the "now" and "today" rows; phrase names them ("5 questions, 3 replies"). */
export function inboxSummary(items: AttentionItem[]): { n: number; rows: { id: string; kind: string; n: number; label: string }[]; phrase: string; sentence: string; /** The one sentence for a screen: "6 things need you: 5 questions, 1 earlier task." */ line: string };
/** The badge number: the sum of the counts of "now" and "today" items. "week" and "fyi" never raise it. */
export function attentionBadge(items: AttentionItem[]): number;
/** At most `perLevel` per level are eligible, at most `top` are shown; everything else goes to `later`, nothing is dropped. */
export function splitAttention(items: AttentionItem[], opts?: { perLevel?: number; top?: number }): { top: AttentionItem[]; later: AttentionItem[] };
/** "today", "yesterday", "3 days ago", "in 2 days", or a short date. */
export function whenPhrase(when: string | undefined, nowIso: string): string;
/** Items not in the count (this week, good to know): "N more, not counted", or "" when none. */
export function notCounted(items: AttentionItem[]): { n: number; text: string };
/** "new today", "waiting since yesterday", "waiting 3 days": how long a counted row has waited. */
export function waitingPhrase(when: string | undefined, nowIso: string): string;
