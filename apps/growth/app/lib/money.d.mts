/** True for a three letter currency code. */
export function isCurrency(c: unknown): boolean;
/** Value per month from a value per period (month, year, week). Null when the value is not a number. */
export function monthlyOf(value: unknown, period?: "month" | "year" | "week" | string): number | null;
/** True when profile.situation.currency is a valid three letter code. */
export function hasCurrency(profile: { situation?: { currency?: string } } | null | undefined): boolean;
/**
 * The only formatter for money. A symbol is never assumed: the rupee sign appears for INR only, lakh and crore only for INR with
 * opts.compact. A missing currency is said as "(currency not set)". Returns "" for a value that is not a number.
 */
export function formatMoney(value: unknown, currency: string | null | undefined, period?: "month" | "year" | "week" | "day" | "hour" | "none" | null, locale?: string, opts?: { compact?: boolean; display?: "code" | "symbol" }): string;
