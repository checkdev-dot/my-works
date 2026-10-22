// Archive then blank, with a typed phrase, and the way back. Run: node scripts/onboarding-reset.mjs <plan|apply|restore> [flags]
//   plan                                 dry run: lists what is archived, blanked and kept; writes nothing; prints a token and the phrase
//   apply --token T --phrase "P"         verifies the phrase and token (15 minutes), backs up everything with a sha1 MANIFEST,
//                                        archives to data/prior.json, blanks, validates, auto-restores on any failure
//   restore --from <backup folder>       verifies the MANIFEST and puts the files back byte for byte (backs up the current state first)
// Flags: --data-dir <dir> (default growth/data)  --force-new (apply while an onboarding is in progress)  --different-person (the person is not the dossier owner: name, picks and trinkets are archived, not kept)  --json
// Claude may run `apply` only after the person typed the phrase himself in chat, as his whole message, after the plan was shown.
import "./_no-people.mjs";
import path from "path";
import { fileURLToPath } from "url";
import { planReset, applyReset, restoreBackup, backupRoot, PHRASE, TOKEN_TTL_MIN } from "../lib/onboarding-reset.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
let sub = args.find((a) => !a.startsWith("--") && !args.some((x, i) => i < args.indexOf(a) && x.startsWith("--") && ["--data-dir", "--token", "--phrase", "--from"].includes(x) && args[i + 1] === a));
if (!sub && args.includes("--dry-run")) sub = "plan";
const dataDir = path.resolve(flag("--data-dir") || path.join(APP, "data"));
const json = args.includes("--json");
const out = (o, text) => console.log(json ? JSON.stringify(o, null, 2) : text);

if (sub === "plan") {
  const r = planReset(dataDir);
  const lines = [];
  lines.push(`Dry run on ${dataDir}. Nothing is written.`);
  if (r.problems.length) lines.push("", ...r.problems.map((p) => `PROBLEM  ${p}`));
  // A NOTE is not a failure: the data is fine. When an interview is under way, apply needs --force-new.
  if (r.notes && r.notes.length) lines.push("", ...r.notes.map((p) => `NOTE  ${p}`));
  lines.push("", "Archived to data/prior.json (read only):", ...r.archive.map((x) => `  - ${x.what}: ${x.count}`));
  lines.push("", "Blanked in place:", ...r.blank.map((x) => `  - ${x.what}: ${x.count}`));
  lines.push("", "Kept as they are:", ...r.keep.map((x) => `  - ${x}`));
  lines.push("", `Pending requests dropped from the queue: ${r.queue_dropped}`);
  lines.push(`Backup folder: ${path.join(backupRoot(dataDir), r.backup)} (${r.backup_contents || "all files"}${process.env.GROWTH_BACKUP_DIR ? "; GROWTH_BACKUP_DIR is set" : ""})`);
  lines.push(`Undo: node scripts/onboarding-reset.mjs restore --from ${r.backup}`);
  if (r.token) {
    lines.push("", `Token (valid ${TOKEN_TTL_MIN} minutes, tied to the data as it is now): ${r.token}`, `Phrase the person must type, exactly, as his whole message: ${PHRASE}`);
    if (r.mid_interview) lines.push("Starting over mid-interview: after the phrase, run apply with --force-new as well (without it apply refuses and nothing changes).");
  } else lines.push("", "No token: fix the problems above first.");
  out(r, lines.join("\n"));
  process.exit(r.ok ? 0 : 1);
}

if (sub === "apply") {
  const r = applyReset({ dataDir, token: flag("--token") || "", phrase: flag("--phrase") || "", forceNew: args.includes("--force-new"), differentPerson: args.includes("--different-person"), samePerson: args.includes("--same-person") });
  out(r, `${r.ok ? "OK" : "REFUSED"}  ${r.message}`);
  process.exit(r.ok ? 0 : 1);
}

if (sub === "restore") {
  const from = flag("--from");
  if (!from) { console.error("restore needs --from <backup folder name or path>"); process.exit(2); }
  try {
    const r = restoreBackup({ dataDir, from });
    out(r, `OK  Restored ${r.restored} files from ${r.from}. The state before the restore is at ${r.pre_restore || "(already backed up)"}.`);
  } catch (e) { out({ ok: false, message: e.message }, `REFUSED  ${e.message}`); process.exit(1); }
  process.exit(0);
}

console.error("Usage: node scripts/onboarding-reset.mjs plan | apply --token T --phrase P | restore --from <backup>   [--data-dir D] [--force-new] [--json]");
process.exit(2);
