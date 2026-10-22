export const FILES: string[];
export const SCORE_REQUIRED_FROM: string;
export function validate(d: Record<string, unknown>): { errors: string[]; warnings: string[] };
export const OPTIONAL_FILES: string[];
export function validateTolerant(d: Record<string, unknown>): { errors: string[]; dropped: string[]; data: Record<string, unknown> };
/** Errors (each starting with "career:") for a career.json value on its own. */
export function careerErrors(career: unknown): string[];
