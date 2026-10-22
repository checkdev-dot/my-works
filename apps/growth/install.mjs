#!/usr/bin/env node
// Installs the three Growth skills for Claude Code and sets up the local folders.
//
//   node install.mjs            copy the skills, write their config files, create cv/ and people/ and a blank data/ (13 empty starter files)
//   node install.mjs --demo     put demo-data/ (one made-up person) into app/data instead of the blank starter files
//   node install.mjs --force    overwrite skills that are already installed (otherwise it refuses, or asks when you are at a terminal)
//   node install.mjs --dry-run  print what it would do and write nothing
//
// Skills go to ~/.claude/skills/<name>/ (the folder Claude Code reads). To test without touching your real home folder,
// set HOME (macOS, Linux) or USERPROFILE (Windows) to a temporary folder first.
// Needs Node 18 or newer. No packages, no network, no API key.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(ROOT, "app");
const SKILLS_SRC = path.join(ROOT, "skills");
const DEMO = path.join(ROOT, "demo-data");
const BLANK = path.join(ROOT, "blank-data");
const NAMES = ["growth", "growth-coach", "g-mini"];

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const DEMO_ON = args.has("--demo");
const DRY = args.has("--dry-run");
const fwd = (p) => p.split(path.sep).join("/"); // forward slashes read the same on every system and need no escaping in JSON

const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
const SKILLS_DST = path.join(home, ".claude", "skills");

const say = (s = "") => console.log(s);
const act = (s) => say(`${DRY ? "[dry run] " : ""}${s}`);
const mkdir = (p) => { if (!DRY) fs.mkdirSync(p, { recursive: true }); };

async function ask(question) {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((r) => rl.question(question, r));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

// 0. Sanity: the pieces must be next to this file.
for (const need of [APP, SKILLS_SRC, DEMO, BLANK, ...NAMES.map((n) => path.join(SKILLS_SRC, n, "SKILL.md"))]) {
  if (!fs.existsSync(need)) { console.error(`Missing ${need}. Run this from a full copy of apps/growth.`); process.exit(1); }
}

// 1. Skills that are already installed: ask, or refuse. Nothing is written until every one is settled.
const skip = new Set();
for (const n of NAMES) {
  const dst = path.join(SKILLS_DST, n);
  if (!fs.existsSync(path.join(dst, "SKILL.md"))) continue;
  if (FORCE) { say(`Overwriting the installed "${n}" skill (--force).`); continue; }
  if (await ask(`A "${n}" skill is already installed at ${dst}.\nOverwrite it? Its SKILL.md and config.json will be replaced. [y/N] `)) continue;
  skip.add(n);
}
if (skip.size) {
  say("");
  say(`Not overwritten: ${[...skip].join(", ")}.`);
  say("Run again with --force to replace them, or remove those folders yourself.");
  if (skip.size === NAMES.length) process.exit(1);
  say("Nothing was written for those; installing the rest.");
}

// 2. Copy the skills and write their config.
const appPath = fwd(APP);
const configs = {
  growth: {
    growthRoot: appPath,
    coachSkill: fwd(path.join(SKILLS_DST, "growth-coach", "SKILL.md")),
    dossier: "",
    companion: fwd(path.join(ROOT, "companion")),
    note: "dossier is optional: the path to your own career notes file (a markdown file). Leave it empty if you have none. The same path can be set as the GROWTH_DOSSIER environment variable for the app.",
  },
  "g-mini": {
    appRoot: appPath,
    peopleDir: fwd(path.join(APP, "people")),
    note: "g-mini reads and writes only peopleDir/<id>. It never reads the growth skill's config.json, growth/data, cv, modules or your career notes file.",
  },
};
for (const n of NAMES) {
  if (skip.has(n)) continue;
  const dst = path.join(SKILLS_DST, n);
  act(`Install skill "${n}" to ${dst}`);
  mkdir(dst);
  if (!DRY) fs.copyFileSync(path.join(SKILLS_SRC, n, "SKILL.md"), path.join(dst, "SKILL.md"));
  if (configs[n]) {
    act(`Write ${path.join(dst, "config.json")} (app path ${appPath})`);
    if (!DRY) fs.writeFileSync(path.join(dst, "config.json"), `${JSON.stringify(configs[n], null, 2)}\n`);
  }
}

// 3. Local folders, all empty and all git-ignored. This is where your own data will live.
for (const d of ["data", "cv", "people"]) {
  const p = path.join(APP, d);
  if (fs.existsSync(p)) continue;
  act(`Create ${p}`);
  mkdir(p);
}
act(`Create ${path.join(ROOT, "companion")} (optional notes folder, git-ignored)`);
mkdir(path.join(ROOT, "companion"));

// 4. Starting files for app/data. The app and the onboarding scripts need the 13 core files to exist, so an empty folder is
//    not enough: with --demo you get one made-up person, otherwise a blank state (no name, no tasks) for "growth start" to fill.
//    Existing data is never touched, not even with --force.
{
  const dataDir = path.join(APP, "data");
  const existing = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter((f) => !f.startsWith(".")) : [];
  const from = DEMO_ON ? DEMO : BLANK;
  const label = DEMO_ON ? "demo-data" : "blank-data";
  if (existing.length) {
    say("");
    say(`app/data already has files (${existing.slice(0, 3).join(", ")}${existing.length > 3 ? ", ..." : ""}), so nothing was copied into it.`);
    if (DEMO_ON) say("Move or rename app/data first if you want the demo person there.");
  } else {
    for (const f of fs.readdirSync(from).filter((x) => x.endsWith(".json"))) {
      act(`Copy ${label}/${f} to app/data/${f}`);
      if (!DRY) fs.copyFileSync(path.join(from, f), path.join(dataDir, f));
    }
  }
}

say("");
say("Done. Next steps:");
say("");
say(`  1. cd "${fwd(APP)}"`);
say("     npm install");
say("     npm run dev            (opens the app at http://localhost:4321)");
say("");
say("  2. In Claude Code, from any folder, say one of these:");
say('     growth start           your first interview; it builds your starting point');
say('     /g-mini new            to help someone else (their data stays in app/people)');
say("");
say("  Optional: to let the CV honesty check read your own career notes, set GROWTH_DOSSIER to that file's path");
say("  before running npm run dev (see README.md).");
if (DEMO_ON && !DRY) say("\n  The demo person is in app/data. 'growth start' archives it first, after you type a confirmation phrase.");
