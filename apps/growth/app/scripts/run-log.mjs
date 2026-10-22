// Works out what a run left undone, so the changelog cannot skip it by omission.
//   left = (stale + unsourced + failing) - touched
// Run: node scripts/run-log.mjs [--touched G-01,S-01,RS-003] [--updated updated.json] [--command plan] [--status complete|partial] [--json] [--record]
//   --updated  JSON list of { ref, what } the run changed (optional; becomes `updated` in the record)
//   --record   print a draft runs.json record (id, command, status, updated, left) for run.log or the write protocol
// Read only: it reads data/ and prints. Never writes.
import { readFileSync } from "fs";
import path from "path";
import { loadData, todayISO } from "./_data.mjs";
import { computeLeft } from "./_plan.mjs";
import { hashOf } from "../lib/plan.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const today = todayISO();
const d = loadData();
const touched = (opt("--touched") || "").split(",").map((x) => x.trim()).filter(Boolean);
const updated = opt("--updated") ? JSON.parse(readFileSync(path.resolve(opt("--updated")), "utf8")) : [];
const left = computeLeft(d, today, touched);
const command = opt("--command") || "plan";
const status = opt("--status") || (left.length ? "partial" : "complete");
if (args.includes("--record") || args.includes("--json")) {
  const n = ((d.runs && d.runs.runs) || []).filter((r) => String(r.id).startsWith(`PR-${today.replace(/-/g, "")}`)).length + 1;
  const record = { id: `PR-${today.replace(/-/g, "")}-${n}`, command, started: today, ended: today, status, updated, left, data_hash_after: hashOf({ plan: d.plan || null, research: d.research || null }) };
  if (status === "partial" && left.length) record.resume_token = `${command.toUpperCase()}:${left[0].ref}`;
  console.log(JSON.stringify(args.includes("--record") ? record : { today, touched, left, record }, null, 2));
  process.exit(0);
}
console.log(`Left undone, ${today}: ${left.length} item${left.length === 1 ? "" : "s"} (touched ${touched.length})`);
for (const l of left) console.log(`  ${l.ref.padEnd(8)} ${l.why}`);
if (!left.length) console.log("  Nothing is stale, unsourced or failing outside what this run touched.");
console.log("\nSay this list in the changelog line: Updated: ... Left: ... because ...");
