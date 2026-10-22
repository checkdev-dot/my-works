// Twelve trust checks over the live data. Run: npm run trust   (read only; exit 1 only on a FAIL)
import { loadData, todayISO } from "./_data.mjs";
import { runChecks } from "./_trust.mjs";

const today = todayISO();
const rows = runChecks(loadData(), today);
console.log(`Trust check, ${today}\n`);
const w = Math.max(...rows.map((r) => r.id.length));
for (const r of rows) {
  const ids = r.ids.length ? ` [${r.ids.slice(0, 8).join(", ")}${r.ids.length > 8 ? `, +${r.ids.length - 8} more` : ""}]` : "";
  console.log(`${r.status.padEnd(4)}  ${r.id.padEnd(w)}  ${String(r.count).padStart(3)}${ids}${r.note ? `\n      ${r.note}` : ""}`);
}
const n = (s) => rows.filter((r) => r.status === s).length;
console.log(`\n${n("PASS")} pass, ${n("WARN")} warn, ${n("FAIL")} fail`);
process.exit(n("FAIL") ? 1 : 0);
