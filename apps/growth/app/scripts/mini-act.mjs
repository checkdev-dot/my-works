// The one way Growth mini data is written. Mirrors scripts/onboarding-act.mjs: every action goes through a JSON file, never a command line.
// EVERY call that touches a person needs --person <id> AND --guard <token>, the token read fresh from people/<id>/profile.json.
// There is no active person: a stale id from earlier in a chat cannot write anywhere.
//   node scripts/mini-act.mjs --file action.json --person <id> --guard <token> [--people-dir D]
//   node scripts/mini-act.mjs --list                          everyone (name, consent, frozen, report), from each profile.json only
//   node scripts/mini-act.mjs --person <id> --guard <token> --brief [--n 3]   whose file is open, progress, the next questions, what to do next
//   node scripts/mini-act.mjs --person <id> --guard <token> --validate        checks every file of that person
// Actions: person.new {name, id?}, person.suggest {name}, consent {answer, quote}, profile.set, answer {id, value | status:"unknown", private?},
//   skip {id, consequence}, input.add {kind:"cv"|"linkedin", text}, research.add {items}, research.remove {id}, gap.set {rows}, plan.set {...},
//   fact.edit {id?, section, text, sources}, fact.remove {id}, person.open, person.rename {name}, consent.withdraw {quote}, consent.renew {quote, phrase},
//   conflict.resolve {id, keep, text?}, person.delete {phrase}, person.erase {phrase} (the live folder and every archive copy), undo.
//   --validate and undo need no guard while profile.json is damaged (the refusal prints the exact command). --file must be a full path.
//   answer on an answered question needs overwrite:true (the old answer is kept in its history). --brief --redo lists answered questions to confirm.
// Writes only inside people/<id>/ (default growth/people). Never reads or writes growth/data or another person's folder.
import fs from "fs";
import path from "path";
import { createPerson, runActions, brief, withdrawConsent, deletePerson, erasePerson, listPeople, validatePerson, suggestIds, DEFAULT_PEOPLE, assertRoot } from "../lib/mini.mjs";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const has = (n) => args.includes(n);
const say = (o, code = 0) => { console.log(JSON.stringify(o)); process.exit(code); };
let root;
try { root = assertRoot(flag("--people-dir") || DEFAULT_PEOPLE); } catch (e) { say({ ok: false, message: e.message }, 1); }
const person = flag("--person");
const guard = flag("--guard");

try {
  if (has("--list")) say({ ok: true, people: listPeople(root) });
  if (has("--brief")) { if (!person) say({ ok: false, message: "Say whose: --person <id>." }, 1); const r = brief(root, person, { n: Number(flag("--n")) || 3, guard, redo: has("--redo") }); say(r, r.ok ? 0 : 1); }
  if (has("--validate")) { if (!person) say({ ok: false, message: "Say whose: --person <id>." }, 1); const r = validatePerson(root, person, guard); say(r, r.ok ? 0 : 1); }

  const file = flag("--file");
  if (!file) say({ ok: false, message: "Use --file <json> (one action or a list). Never put the person's words on a command line: write them to a file first." }, 1);
  if (!path.isAbsolute(file)) say({ ok: false, message: "Give --file as a full path (for example /tmp/g-mini-action.json), so it cannot point at the wrong place. Nothing was saved." }, 1);
  let actions;
  try { actions = JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); } catch { say({ ok: false, message: "The file is not valid JSON, or does not exist. Nothing was saved. Write the JSON with the Write tool and send --file again." }, 1); }
  const list = Array.isArray(actions) ? actions : [actions];
  const first = list[0] || {};
  if (first.type === "person.suggest") say({ ok: true, suggestions: suggestIds(first.name || ""), message: "Suggested ids. If an id exists already, ask for another." });
  if (first.type === "person.new") {
    if (list.length > 1) say({ ok: false, message: "person.new goes alone. Send the next actions after it, with --person <id>." }, 1);
    const r = createPerson(root, { name: first.name, id: first.id });
    say({ ...r, ...(r.ok ? { working_on: `Working on: ${r.name} (${r.id})` } : {}) }, r.ok ? 0 : 1);
  }
  if (!person) say({ ok: false, message: "Say whose file: --person <id>. Nothing was changed." }, 1);
  if (first.type === "consent.withdraw") { const r = withdrawConsent(root, person, { guard, quote: first.quote }); say(r, r.ok ? 0 : 1); }
  if (first.type === "person.erase") { const r = erasePerson(root, person, { guard, phrase: first.phrase }); say(r, r.ok ? 0 : 1); }
  if (first.type === "person.delete") { const r = deletePerson(root, person, { guard, phrase: first.phrase }); say(r, r.ok ? 0 : 1); }
  const r = runActions(root, person, list, { guard });
  say(r, r.ok ? 0 : 1);
} catch (e) { say({ ok: false, message: `Unexpected: ${e && e.message ? e.message : e}. Nothing was changed.` }, 1); }
