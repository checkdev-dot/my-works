# Growth

*A personal career growth app that you run with Claude Code. Built by Dev.*

Growth answers two questions every night: what skill should I build next, and what should I do to get seen. It keeps the answers in plain files on your own computer, and Claude Code does the thinking that a web page can't: diagnosing gaps, researching your field, critiquing your work and writing the plan.

<!-- Screenshot placeholder: docs/media/tonight.png. The Tonight screen: one Skill task and one Reach task for the evening. -->
<!-- Screenshot placeholder: docs/media/you-and-hiring.png. The You page (skill levels with evidence) and the Hiring page (CV, case studies, funnel). -->
<!-- Screenshot placeholder: docs/media/g-mini-report.png. A page of a G mini PDF report. -->

> Screenshots are not added yet. Drop your own into `docs/media/`, taken from the demo data so nothing real appears in them, and link them here.

## The three pieces

Growth is three parts that read and write the same folders.

```
   You, in Claude Code                       You, in the browser
   "growth start", "answer it",              http://localhost:4321
   "build my CV", "/g-mini new"                      |
            |                                        |
            v                                        v
   +---------------------+   reads and writes   +---------------------+
   |  Skills (Claude)    | -------------------> |  App (Next.js)      |
   |  growth             |                      |  Tonight, You,      |
   |  growth-coach       | <------------------- |  Hiring, Journal,   |
   |  g-mini             |   the app's queue    |  Library, Commands  |
   +---------------------+                      +---------------------+
            |                                        |
            +-------------------+--------------------+
                                v
                 Local folders, git-ignored
                 app/data    your plan, evidence, ratings
                 app/cv      your CV versions and PDF
                 app/people  one folder per G mini person
```

| Piece | Where it lives | What it does |
|---|---|---|
| **App** | `app/` | A Next.js 16 app on port 4321. Shows tonight's two tasks, your skill levels with the evidence behind each, your CV and case studies, your journal and a library of things worth reading. It never calls an AI itself. When it needs Claude, it adds a request to a queue and says "Waiting on Claude". |
| **Skills** | `skills/` | Three Claude Code skills. `growth` is the command front door (`/growth`, "answer it", "build my CV"). `growth-coach` holds the coaching rules: diagnose before advising, fix the earliest broken stage first, plan skill and reach together. `g-mini` is the separate tool for other people (below). |
| **Data** | `app/data`, `app/cv`, `app/people` | Plain JSON and HTML files. They are the only memory. Back them up like any folder. |

The loop is simple. You work in the app. When something needs Claude (a critique, a plan, a test to score), the app queues it. In Claude Code you say "answer it" and Claude reads the queue, does the work, writes the result back into the data files, and the app shows it.

## G mini: for people you help

G mini is a smaller, separate tool for helping someone else, such as a friend or a colleague who is stuck in their career. That person doesn't need Claude Code. You type, they answer beside you.

- `/g-mini new` starts a person. One command then runs a 45 to 60 minute interview, researches their target roles with sources, and builds a PDF report.
- Each person gets their own folder in `app/people/<id>/`. Nothing from one person is ever used for another, and G mini never reads your own Growth data, CV or career notes. The scripts refuse any path outside that person's folder.
- Every reply starts with "Working on: <name>" so you always know whose file is open.
- Other commands: `/g-mini <id> interview`, `research`, `report`, `edit`, `mock`, and `/g-mini list`.

## Install

You need [Claude Code](https://claude.com/claude-code) with a subscription, and Node 18 or newer. No API key is needed and nothing here asks for one.

```
git clone https://github.com/checkdev-dot/my-works.git
cd my-works/apps/growth
node install.mjs            # add --demo to start with one made-up person in the app
cd app
npm install
npm run dev
```

Then open http://localhost:4321.

What `install.mjs` does:

1. Copies the three skills into `~/.claude/skills/growth`, `growth-coach` and `g-mini`.
2. Writes a `config.json` in the `growth` and `g-mini` skill folders with the absolute path of your `app/` folder, so the skills can find the app from any chat.
3. Creates `app/cv` and `app/people`, and fills `app/data` with 13 blank starter files from `blank-data/` (the app and the scripts need them to exist). With `--demo` it copies the made-up person from `demo-data/` instead. It never touches an `app/data` that already has files, even with `--force`.

If a skill is already installed, it asks before overwriting (or refuses when there is no terminal). Pass `--force` to replace the skills without asking. `--dry-run` shows what it would do and writes nothing.

Then, in Claude Code, from any folder:

- `growth start` runs the onboarding interview. It asks in rounds, says why it asks each question, and turns anything you can't answer into a task. If data already exists it archives it first, after you type a confirmation phrase.
- `/g-mini new` starts a G mini for someone else.
- `/growth` shows where you are and what's on tonight.

### Optional: your career notes file

The CV honesty check can compare every fact against a markdown file of your own career notes. Set `GROWTH_DOSSIER` to its path before `npm run dev`. It is unset by default, and with nothing set the check says so and refuses to pass. Never put this file in the repo.

## Privacy

- **Your data stays on your computer.** `app/data`, `app/cv`, `app/people` and `app/research` are in `.gitignore`. The app has no analytics and uploads nothing.
- **Claude Code sees what it reads.** When you run a command, Claude reads the files that command needs, and that text goes to Anthropic like any Claude Code session. Growth adds nothing beyond that.
- **Backups.** The app and skills snapshot the files they change into `app/data/.backups`. Set `GROWTH_BACKUP_DIR` to a folder outside any cloud-synced folder if you don't want backups synced.
- **Phone access is optional.** `npm run lan` starts a relay on your local network with a one-time pairing code. Skip it and nothing is exposed beyond your own machine.
- **People you help.** Their data lives only in `app/people/<id>/`, away from yours.

## Honesty rules

Growth is built so it can't flatter you.

- **Every fact on a CV or case study needs a source.** Each line carries a quote from your career notes, your interview answers or your logged evidence, and the check requires the quote to appear word for word. Numbers must appear in the quote of their own line.
- **Gaps are marked, not filled.** A missing fact becomes a `[NEEDS: ...]` marker, and Claude asks you for the real one. It never invents a number, a title or a result.
- **Work that isn't yours isn't credited.** A deny-list and a "not your work" section stop a CV from claiming other people's work or leaking confidential terms.
- **Claude's own opinions are not evidence.** A critique from Claude can guide you but can never back a fact.
- **Trust is ranked.** A market result beats an expert review, which beats shipped work, which beats Claude's read, which beats your own rating. Points count work done, never skill.
- **No promises.** Plans say "ready around X, range Y to Z", never "the fastest way" or a guaranteed outcome.

## Third-party skills

The `app/modules/` folder includes add-on skills written by other people, kept unchanged under their MIT licences (each folder has its own `LICENSE`):

- [Paramchoudhary/ResumeSkills](https://github.com/Paramchoudhary/ResumeSkills): `resume-ats-optimizer`, `resume-tailor`, `resume-section-builder`. MIT.
- [SonwaneyY/portfolio-case-study-generator](https://github.com/SonwaneyY/portfolio-case-study-generator): `case-study`. MIT.
- [varunr89/resume-tailoring-skill](https://github.com/varunr89/resume-tailoring-skill): `resume-tailoring`. MIT.

Thank you to the authors. Their skills are theirs; each folder also has a `notes.md` with the rules Growth applies when it uses the skill.

## What's in this folder

```
apps/growth/
  README.md
  install.mjs        installs the skills and sets up local folders
  skills/            growth, growth-coach, g-mini (SKILL.md each)
  app/               the Next.js app, its scripts and add-ons
  demo-data/         one made-up person, for --demo
  blank-data/        the 13 blank starter files for a fresh start
  docs/media/        screenshots go here
```

## Status

A personal project, shared as it is. It is tested on Windows only, with a Claude Code subscription and no API key. Expect rough edges on macOS and Linux (for example, PDF export looks for Microsoft Edge unless you set `GROWTH_EDGE`). Some automated tests that depended on one person's real career notes were removed from this copy, and the remaining checks run on synthetic data.

---

Built by Dev. The demo person, Sam Rivera, and their company are made up.
