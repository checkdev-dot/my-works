import type { CvVersion, CaseStudy } from "./types";
export const PLACEHOLDER_RE: RegExp;
export function normWs(s: unknown): string;
export function countPlaceholders(s: unknown): number;
export function stripPlaceholders(s: unknown): string;
/** Every text slot of a version in page order, with a setter and a way to attach sources to its bullet or item. */
export function textSlots(v: CvVersion): { where: string; text: string; set(t: string): void; attach(sources: unknown[]): void }[];
export function versionTexts(v: CvVersion): { where: string; text: string }[];
/** The placeholders of a version in page order; index is 1-based. Its length is checks.honesty.placeholders. */
export function placeholderList(v: CvVersion): { index: number; where: string; placeholder: string }[];
export function listPlaceholders(v: CvVersion): { index: number; where: string; placeholder: string }[];
export function caseTexts(c: CaseStudy): { where: string; text: string }[];
/** The facts a case study still needs, de-duplicated. Its length is checks.honesty.placeholders for a case. */
export function caseNeeds(c: CaseStudy): { where: string; text: string }[];
