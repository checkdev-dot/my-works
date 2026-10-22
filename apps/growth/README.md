# Growth

*A personal career growth app that you run with Claude Code. Built by Dev.*

Growth answers two questions every night: what skill should I build next, and what should I do to get seen. It keeps the answers in plain files on your own computer, and Claude Code does the thinking that a web page can't: diagnosing gaps, researching your field, critiquing your work and writing the plan.

**Documentation:** [Read the docs](docs/README.md). Install, daily use, every command, the honesty rules and the G mini guide.

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

G mini is a smaller, separate tool for giving someone a hand with one career move: a friend or colleague who needs a little help, not a full coaching programme. They sit with you for one interview and get one PDF to keep. They don't need Claude Code. You type, they answer beside you.

**Who it suits:** someone who knows roughly where they want to go and wants an honest picture of the gap, the path and the interviews. It is not therapy, a job board or a guarantee, and it does not apply for jobs.

**Careers it knows well today:**
- **Design:** product designer, UX, brand and visual design.
- **PR and communications:** PR specialist, communications and content roles.
- **Marketing:** content marketer, product marketing manager, brand and growth roles.
- **HR:** HR generalist or HR business partner moving into HR transformation, organisational development (OD), change management, HR technology consulting or people analytics.

**Any other career:** G mini still runs the interview and researches the target from public sources, but it says plainly that the role is not mapped yet. It shows more gaps as "still needed" instead of guessing. New careers can be added to the role map over time.

**What the PDF covers:**
- where they are now and where they want to go
- a gap map against the target roles
- how others made the same move (patterns, never names)
- what the interviews look like
- a dated plan in phases sized to their deadline and weekly hours, with an honest "fits / tight / does not fit" verdict
- a short list of what to find out next

**Kept apart:** each person gets their own folder in `app/people/<id>/`. Nothing from one person is ever used for another, and G mini never reads your own Growth data, CV or career notes. The scripts refuse any path outside that person's folder, and every write needs that person's lock code. Every reply starts with "Working on: <name>" so you always know whose file is open. The commands are in [Using G mini](#using-g-mini) below.

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

### Install one skill on its own

The skills are independent folders. Install only the ones you want:

| You want | Run | You get |
|---|---|---|
| Everything | `node install.mjs` | growth, growth-coach and g-mini |
| Only G mini (help other people, no personal Growth) | `node install.mjs --only=g-mini` | g-mini |
| Only your own Growth | `node install.mjs --only=growth` | growth and growth-coach (growth hands queued work to the coach, so they come together) |

Both still need the `app/` folder and `npm install` in it, because the skills run the app's scripts and the app shows the results. G mini writes only to `app/people/`, so you can ignore the Growth pages in the app.

**Without the installer:** copy `skills/<name>/SKILL.md` into `~/.claude/skills/<name>/SKILL.md` (on Windows `C:\Users\<you>\.claude\skills\<name>\`). Then create a `config.json` next to it:
- for `growth`: `{ "growthRoot": "<full path to app>", "coachSkill": "<full path to ~/.claude/skills/growth-coach/SKILL.md>", "dossier": "" }`
- for `g-mini`: `{ "appRoot": "<full path to app>", "peopleDir": "<full path to app>/people" }`

Use forward slashes in the paths. Restart Claude Code after adding a skill, so it picks it up.

**To remove a skill:** delete its folder in `~/.claude/skills/`. Your data in `app/` stays.

## Using Growth

Everything happens in Claude Code: you type a command or say it in plain words, and Claude writes the result into the app. Then open http://localhost:4321 to see it. Every command in the app's **Commands** page has an "i" button that says what it does, what it changes, how often to use it and what to do after.

**First time:**
1. Start the app: `npm run dev` in `app/`.
2. In Claude Code, say `growth start`. Answer in sittings of about 20 minutes; skip anything with "skip".
3. When the interview is done, say `plan my four weeks`, then `update my library`.

**Each evening:** open **Tonight** in the app, do the one step, and press **Hand it in**. When the app says Claude owes you something, say `answer it`.

**The six everyday commands:**

| Say | What happens |
|---|---|
| `where do I stand` (or `/growth`) | Where things stand, what's on tonight, anything Claude owes you |
| `answer it` | Claude works through everything the app queued (reviews, plans, tests) |
| `change my plan` | Makes the week lighter, moves a gap, or changes your goal, after your yes |
| `look at my CV` | Reviews your CV or any piece of work and says what to change first |
| `update my library` | Finds and scores things worth reading, watching or hearing this week |
| `add a skill file` | Adds someone else's skill file as an add-on, after a safety check |

**CV and case studies:**

| Say | What happens |
|---|---|
| `build my CV` | Builds a CV version from your answers, notes and evidence. Every fact has a source; gaps are marked |
| `fill in my CV` | Asks only for the facts still missing, one list, "skip" allowed |
| `tailor my CV for this job` | Paste a job post: a tailored version just for that job |
| `check my CV against this job` | A keyword match against a job post, labelled as an AI estimate |
| `save my CV as a PDF` | Saves a PDF (marked Draft while facts are missing) |
| `use this CV` | Makes a version your main CV file; the old one is backed up |
| `write my case studies` | Works through one case study at a time with you |

**Planning:** `plan my week`, `plan my four weeks`, `weekly check`, `review my four weeks`, `why this task`.

Plain words work too: "I'm stuck on this task", "I only have 20 minutes", "I feel like a fraud", "read my journal". The full list is on the app's Commands page.

## Using G mini

G mini needs no app page: Claude does the work in Claude Code and saves a PDF.

**Start to finish, one command:**
1. Sit the person next to you and say `/g-mini new`.
2. Claude asks their name, suggests a short id (for example `sam`), and asks their OK to save their answers.
3. Give their CV and LinkedIn text if they have them: paste the text, or give the file path. Both are optional.
4. The interview: about 40 questions, one at a time, 45 to 60 minutes. They can say "skip" to any.
5. When the last question is answered, Claude researches their target roles and builds the PDF on its own. They can leave.
6. Claude tells you where the PDF is (`app/people/<id>/report/<date>/report.pdf`). Check it and send it yourself. Claude never sends anything.

**Later, only when needed:**

| Command | What it does |
|---|---|
| `/g-mini <id>` | Opens that person, or resumes an interview that stopped |
| `/g-mini <id> edit` | Changes a fact they corrected, then rebuilds the PDF as a new dated version (the old one is kept) |
| `/g-mini <id> interview` | Redoes or finishes the interview (old answers are kept and you're asked before each is replaced) |
| `/g-mini <id> research` | Redoes the research |
| `/g-mini <id> report` | Rebuilds the PDF |
| `/g-mini <id> mock` | A live practice interview with them, only when you ask |
| `/g-mini list` | Everyone you have made a G mini for |

If the PDF says **Draft**, fill the yellow "still needed" items with the person (`/g-mini <id> edit`), then rebuild.

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
