// Checks lib/forecast.mjs. Run: node scripts/forecast-check.mjs
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readyBy, gapForecast } from "../lib/forecast.mjs";

let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` ${extra}` : ""}`); if (!cond) fail++; };
const G = (id, evenings, over = {}) => ({ id, status: "open", track: "skill", evenings, estimated: "2026-10-13", closes_when: "x", ...over });
const st = (gaps, tasks = []) => ({ library: { gaps, refreshed: "2026-10-13" }, week: { tasks } });

// 1. Same slot gaps queue; different slots run side by side. 4+8 skill = 12 evenings at 5/week = 17 days.
{
  const r = readyBy(st([G("a", 4), G("b", 8), G("c", 10, { track: "reach" })]), "steady", { today: "2026-10-14" });
  ok("latest slot decides the date", r && r.date === "2026-10-30" &&r.basis.evenings_total === 22, r && r.date);
  ok("12 skill evenings = 17 days", gapForecast(st([G("a", 4), G("b", 8)]), "steady", { today: "2026-10-14" }).b.date === "2026-10-30");
}
// 2. A finished task since the estimate takes an evening off.
{
  const e = gapForecast(st([G("a", 5)], [{ id: "t", track: "skill", status: "done", closed: "2026-10-14" }]), "steady", { today: "2026-10-14" });
  ok("done task comes off", e.a.date === "2026-10-19" && e.a.evenings === 4, e.a.date);
}
// 3. Late is flagged and not clamped.
{
  const r = readyBy(st([G("a", 1, { estimated: "2026-09-01" })]), "steady", { today: "2026-10-14" });
  ok("late not clamped", r.status === "late" && r.date < r.shown_date && r.shown_date === "2026-10-14", `${r.date} ${r.status}`);
}
// 4. Range order, basis and confidence exist.
{
  const r = readyBy(st([G("a", 10, { closes_when: "your mentor replies" }), G("b", 3, { evenings: undefined })]), "steady", { today: "2026-10-14" });
  ok("range ordered", r.range.earliest <= r.range.likely && r.range.likely <= r.range.latest, JSON.stringify(r.range));
  ok("basis lists inputs", r.basis.gaps.length === 1 && r.basis.unestimated[0] === "b" && r.basis.depends_on[0] === "a");
  ok("confidence in 0.1..0.6", r.confidence >= 0.1 && r.confidence <= 0.6, String(r.confidence));
}
// 5. Nothing estimated gives null.
ok("no estimates = null", readyBy(st([G("a", 1, { evenings: undefined })]), "steady") === null);
// 6. Live data: reproduces the app's own number (App.tsx rule).
{
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
  const s = { library: JSON.parse(readFileSync(path.join(dir, "library.json"), "utf8")), week: JSON.parse(readFileSync(path.join(dir, "week.json"), "utf8")) };
  const r = readyBy(s, "steady", { today: "2026-10-14" });
  console.log("live:", r ? `${r.date} ${r.status} range ${r.range.earliest}..${r.range.latest} confidence ${r.confidence}` : "null");
  ok("live data forecasts", !!r);
}
console.log(fail ? `${fail} FAIL` : "all pass");
process.exit(fail ? 1 : 0);
