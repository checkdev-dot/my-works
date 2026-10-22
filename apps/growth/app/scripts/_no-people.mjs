// Side-effect import for the person's own Growth scripts: refuses any --data-dir, --dossier or --denylist inside growth/people (the Growth mini's folders).
// Growth (for the person) and Growth mini (for people he helps) never mix. Usage: import "./_no-people.mjs"; at the top of a script that takes --data-dir.
// Paths are compared after realpath (junctions and symlinks resolved), so a link into growth/people is caught too.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const PEOPLE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "people");

/** realpath of the longest existing part of p, then the rest as written. Never throws. */
export function realish(p) {
  let cur = path.resolve(p); const rest = [];
  for (let i = 0; i < 64; i += 1) {
    try { return path.join(fs.realpathSync.native(cur), ...rest.reverse()); } catch { /* not there yet */ }
    const up = path.dirname(cur); if (up === cur) break;
    rest.push(path.basename(cur)); cur = up;
  }
  return path.resolve(p);
}
/** True when p is the people folder or anything inside it, before or after links are resolved. */
export function insidePeople(p, peopleRoot = PEOPLE) {
  const inside = (base, q) => { const b = base.toLowerCase(), x = q.toLowerCase(); return x === b || x.startsWith(b + path.sep); };
  return inside(path.resolve(peopleRoot), path.resolve(p)) || inside(realish(peopleRoot), realish(p));
}

const argv = process.argv.slice(2);
for (const flagName of ["--data-dir", "--dossier", "--denylist", "--from"]) {
  const i = argv.indexOf(flagName);
  if (i < 0 || !argv[i + 1]) continue;
  if (insidePeople(argv[i + 1])) {
    console.log(JSON.stringify({ ok: false, message: "That folder belongs to Growth mini (growth/people). The person's Growth scripts never read or write it. Use the growth-mini skill for that person. Nothing was changed." }));
    process.exit(1);
  }
}
