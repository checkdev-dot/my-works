// Checks research excerpts against page text that Claude saved after fetching. Fetches nothing, writes nothing.
// Run: node scripts/verify-excerpts.mjs <pages.json> [--items <items.json>] [--json]
//   pages.json  [{ "id": "RS-014", "fetched_text": "the page text", "http": 200 }]   (http is optional)
//   --items     a JSON list of research items, or { "items": [...] }; default is data/research.json
// Prints matched and failed. Exit 1 if anything failed or a page is missing. A claim that fails must be removed or marked mismatch.
import { readFileSync } from "fs";
import path from "path";
import { loadData, todayISO } from "./_data.mjs";
import { verifyExcerpts } from "../lib/plan.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--items");
if (!file) { console.error("Usage: node scripts/verify-excerpts.mjs <pages.json> [--items items.json] [--json]"); process.exit(2); }
const read = (p) => JSON.parse(readFileSync(path.resolve(p), "utf8"));
const pages = read(file);
let items;
if (opt("--items")) { const x = read(opt("--items")); items = Array.isArray(x) ? x : x.items; }
else items = (loadData().research || { items: [] }).items;
const wanted = new Set(pages.map((p) => p.id));
const subset = items.filter((i) => wanted.has(i.id));
const unknown = [...wanted].filter((id) => !items.some((i) => i.id === id));
const r = verifyExcerpts(subset, pages);
const today = todayISO();
const verified = (x) => ({ by: "verify-excerpts", on: today, result: x.result, ...(x.http !== undefined ? { http: x.http } : {}) });
if (args.includes("--json")) {
  console.log(JSON.stringify({ today, matched: r.matched.map((x) => ({ id: x.id, verified: verified(x) })), failed: r.failed.map((x) => ({ id: x.id, why: x.why, verified: verified(x) })), unknown_ids: unknown, checked: subset.length }, null, 2));
} else {
  console.log(`Excerpt check, ${today}: ${r.matched.length} matched, ${r.failed.length} failed of ${subset.length} checked`);
  for (const m of r.matched) console.log(`  match     ${m.id}`);
  for (const f of r.failed) console.log(`  ${f.result.padEnd(9)} ${f.id}  ${f.why}`);
  for (const id of unknown) console.log(`  unknown   ${id}  not in the research list`);
  if (r.failed.length) console.log(`Failure rate ${Math.round((100 * r.failed.length) / Math.max(1, subset.length))}%. Above 20%, re-check every citation for that gap.`);
}
process.exit(r.failed.length || unknown.length ? 1 : 0);
