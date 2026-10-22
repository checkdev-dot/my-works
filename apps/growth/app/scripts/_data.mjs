// Shared helpers for scripts: read the live data (read only) and small date tools.
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FILES, OPTIONAL_FILES } from "../lib/validate.mjs";

export const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA = path.join(APP, "data");
export const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const todayISO = () => new Date().toLocaleDateString("en-CA");
export const ageDays = (iso, today = todayISO()) => ISO.test(iso || "") ? Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${iso}T00:00:00Z`)) / 864e5) : null;

export function loadData() {
  const d = {};
  for (const f of FILES) {
    const p = path.join(DATA, `${f}.json`);
    if (!existsSync(p)) throw new Error(`${f}.json is missing`);
    d[f] = JSON.parse(readFileSync(p, "utf8"));
  }
  // Plan engine files are optional: read them only when they exist.
  for (const f of OPTIONAL_FILES) {
    const p = path.join(DATA, `${f}.json`);
    if (!existsSync(p)) continue;
    // A broken optional file must not take down the brief for every command: skip it and say so.
    try { d[f] = JSON.parse(readFileSync(p, "utf8")); } catch (e) { (d._optional_errors ||= []).push(`${f}.json: not valid JSON (${e.message})`); }
  }
  return d;
}
