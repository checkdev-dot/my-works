export interface TopicDef { label: string; words: string[]; ids: string[] }
export const TOPICS: Record<string, TopicDef>;
export interface OffLimits {
  /** Bank question ids that will not be asked. */
  ids: string[];
  /** His own words, as given (excluding "none"). */
  words: string[];
  /** Topic keys the words matched. */
  topics: string[];
  /** True when he said nothing is off limits (recorded explicitly, not left empty). */
  none: boolean;
  boundary: Record<string, { topic: string; at: string }>;
  unmatched: string[];
  /** Phrases whose topics he confirmed with onboard.boundary: phrase -> topic keys. */
  mapped: Record<string, string[]>;
}
export function parseOffLimits(list: unknown, today?: string, boundaryMap?: Record<string, { topics: string[]; confirmed?: boolean; quote?: string }>): OffLimits;
export function phraseTopics(phrase: string): { topics: string[]; rest: string[] };
export function normPhrase(s: unknown): string;
export const TOPIC_KEYS: string[];
export function topicsHitBy(text: string, off?: Partial<OffLimits>): string[];
export function describeOffLimits(off?: Partial<OffLimits>): { not_asked: string[]; must_not_asked: { id: string; label: string; what_stays_unknown: string }[]; nice_not_asked: string[]; unmatched_words: string[] };
export function labelOf(id: string): string;
export function idsOfTopic(k: string): string[];
export function mappedIds(): string[];
export function bankHas(id: string): boolean;
