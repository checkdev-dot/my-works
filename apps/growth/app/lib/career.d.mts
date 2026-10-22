import type { CareerData } from "./types";
export const CAREER_ACTIONS: string[];
/** The career actions the app may send: CAREER_ACTIONS without cv.restore (scripts only). */
export const CAREER_APP_ACTIONS: string[];
/** Only the scripts may use these (they record a pdf a script made, or a promotion). */
export const CAREER_INTERNAL_ACTIONS: string[];
export function emptyCareer(today: string): CareerData;
export interface CareerCtx { dataDir: string; today: string; dossierPath?: string; denylistPath?: string; internal?: boolean; now?: Date }
export type CareerTouched = string[] & { writes: { rel: string; text: string }[]; notes?: string[]; result?: Record<string, unknown> };
/** Mutates s.career and returns ["career"]. Throws a plain sentence when it refuses; nothing is written by this call. */
export function applyCareerAction(a: { type: string; [k: string]: unknown }, s: Record<string, unknown>, ctx: CareerCtx): CareerTouched;
/** Writes cv/drafts/<name>.html files (backing up a changed one to cv/drafts/_history). Returns the paths written. */
export function writeCvFiles(appDir: string, writes: { rel: string; text: string }[], now?: Date): string[];
export function appDirOf(dataDir: string): string;
