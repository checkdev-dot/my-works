// Writes app/dev/skeleton/skeleton-state.json: the blank state an onboarding reset leaves, built on a TEMP COPY of data/.
// The live data is only read. Run: node scripts/make-skeleton-fixture.mjs
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { planReset, applyReset, readAll, listTree, PHRASE } from "../lib/onboarding-reset.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = path.join(APP, "data");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "growth-skel-"));
try {
  for (const rel of listTree(LIVE)) {
    if (rel.startsWith(".")) continue;
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.copyFileSync(path.join(LIVE, rel), path.join(tmp, rel));
  }
  const now = new Date();
  const plan = planReset(tmp, { now });
  if (!plan.ok) throw new Error(`plan failed: ${plan.problems.join("; ")}`);
  const r = applyReset({ dataDir: tmp, token: plan.token, phrase: PHRASE, now });
  if (!r.ok) throw new Error(`apply failed: ${r.message}`);
  const { d, errors } = readAll(tmp);
  if (errors.length) throw new Error(errors[0]);
  const out = path.join(APP, "app", "dev", "skeleton", "skeleton-state.json");
  fs.writeFileSync(out, `${JSON.stringify(d, null, 2)}\n`);
  console.log(`wrote ${out} (${Object.keys(d).length} files, status ${d.onboarding?.status}, tasks ${d.week.tasks.length})`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
