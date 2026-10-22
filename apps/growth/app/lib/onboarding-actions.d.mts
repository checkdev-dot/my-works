export const ONBOARDING_ACTIONS: string[];
/** Applies one onboarding action to the state in memory and returns the data file names it touched. Throws a plain Error when refused. */
export function applyOnboardingAction(a: { type: string; [k: string]: any }, s: Record<string, any>, today?: string, now?: string): Set<string> & { notes?: string[] };
/** Removes everything Round 3 wrote from a map of file name to parsed file (any may be absent). Returns the file names it changed. Used by onboard.forget and by the script on every snapshot. */
export function forgetRound3(s: Record<string, any>, today?: string): Set<string>;
