// How every harness sends an action to scripts/onboarding-act.mjs: through a file (--file), the same form the skill tells Claude
// to use. The inline form is deprecated and refuses payloads with shell metacharacters or over 2000 characters, so a harness that
// used it would not be testing what a model on this machine actually does.
import fs from "fs";
import os from "os";
import path from "path";

let n = 0;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "growth-act-"));
process.on("exit", () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp only */ } });

/** ["--file", "<temp path>"] for one action (or a list of actions). */
export function actArgs(action) {
  n += 1;
  const p = path.join(dir, `action-${process.pid}-${n}.json`);
  fs.writeFileSync(p, JSON.stringify(action));
  return ["--file", p];
}
