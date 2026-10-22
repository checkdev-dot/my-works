import type { GrowthState, Pace } from "./types";

export const PACE: Record<Pace, number>;
export const SPREAD: { low: number; high: number };

export interface GapEta { date: string; evenings: number; late: boolean; status: "late" | "on_track" }
export interface ReadyBy {
  /** The likely date, never clamped to today. */
  date: string;
  /** Today when late, otherwise date. For UI that must not show a past date. */
  shown_date: string;
  status: "late" | "on_track";
  open: number;
  unknown: number;
  range: { earliest: string; likely: string; latest: string };
  confidence: number;
  confidence_label: "low" | "medium" | "fair";
  as_of: string;
  reviewed_by: "claude";
  basis: {
    rule: string; pace: Pace; per_week: number; evenings_total: number;
    gaps: { id: string; evenings: number; track: string; estimated: string | null; evenings_basis: string | null; date: string; status: string }[];
    estimated_dates: string[]; unestimated: string[]; without_basis: number; depends_on: string[]; waiting_days: number;
    spread: { low: number; high: number };
  };
}
export function gapForecast(s: Pick<GrowthState, "library" | "week">, pace: Pace, opts?: { today?: string; perWeek?: number }): Record<string, GapEta | null>;
export function readyBy(s: Pick<GrowthState, "library" | "week">, pace: Pace, opts?: { today?: string; perWeek?: number }): ReadyBy | null;
export interface ForecastInputs {
  pace: Pace; per_week: number; spread: { low: number; high: number }; worked: Record<string, number>; refreshed: string;
  gaps: { id: string; evenings: number | null; track: string; estimated: string | null; waiting_days: number; third_party: boolean }[];
}
export function forecastInputs(s: Pick<GrowthState, "library" | "week">, pace: Pace, opts?: { today?: string; perWeek?: number }): ForecastInputs;
