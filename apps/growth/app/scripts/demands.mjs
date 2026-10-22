// Derives the demands from the profile, ratings and proof. Prints; never writes data/.
// Run: node scripts/demands.mjs [--out]      --out writes scripts/.out/demands.json (for a plan run to copy in with the write protocol)
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { loadData, todayISO, APP } from "./_data.mjs";
import { deriveDemands } from "../lib/plan.mjs";

const d = loadData();
const out = deriveDemands(d, todayISO());
const text = `${JSON.stringify(out, null, 2)}\n`;
if (process.argv.includes("--out")) {
  const dir = path.join(APP, "scripts", ".out");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "demands.json"), text);
  process.stderr.write(`wrote scripts/.out/demands.json (${out.items.length} demands, ${out.source_hash})\n`);
} else process.stdout.write(text);
const cmp = d.demands ? (d.demands.source_hash === out.source_hash ? "data/demands.json is current" : "data/demands.json is out of date") : "data/demands.json does not exist yet";
process.stderr.write(`${out.items.length} demands, ${out.items.filter((x) => x.hard).length} hard, source_hash ${out.source_hash}. ${cmp}.\n`);
