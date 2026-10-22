export const ESTIMATE: string;
export const CONFIRMED: string;
export function ratingState(r: { source?: string; reviewed_by?: string; as_of?: string } | null | undefined): { owner: "dev" | "claude"; label: string; dot: "filled" | "hollow"; aria: string; date: string | null; backing: string };
export function ratingSummary(list: Array<{ source?: string; reviewed_by?: string; as_of?: string }>): { n: number; confirmed: number; line: string };
export function lengthText(min: number | undefined | null, kind?: string): string;
export function lookForText(score: number): string;
export function secondPerson(text: string): string;
