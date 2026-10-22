# Install

## What you need

- [Claude Code](https://claude.com/claude-code) with a subscription.
- Node 18 or newer.
- No API key. Nothing here asks for one.

Growth is tested on Windows only. Expect rough edges on macOS and Linux. For example, PDF export looks for Microsoft Edge unless you set `GROWTH_EDGE`.

## Install everything

```
git clone https://github.com/checkdev-dot/my-works.git
cd my-works/apps/growth
node install.mjs
cd app
npm install
npm run dev
```

Then open http://localhost:4321.

Add `--demo` to `node install.mjs` if you want to look around first. It puts one made-up person, Sam Rivera, into the app.

## What the installer does

`install.mjs` does three things.

1. It copies the three skills into `~/.claude/skills/growth`, `growth-coach` and `g-mini`.
2. It writes a `config.json` in the `growth` and `g-mini` skill folders. The file holds the absolute path of your `app/` folder, so the skills can find the app from any chat.
3. It creates `app/cv` and `app/people`, and fills `app/data` with 13 blank starter files from `blank-data/`. With `--demo` it copies the demo person from `demo-data/` instead.

It never touches an `app/data` that already has files, even with `--force`.

| Flag | What it does |
|---|---|
| `--demo` | Starts with one made-up person in the app. |
| `--force` | Replaces skills that are already installed, without asking. |
| `--dry-run` | Prints what it would do and writes nothing. |
| `--only=g-mini` | Installs only G mini. |
| `--only=growth` | Installs `growth` and `growth-coach`. The first hands queued work to the second, so they come together. |

If a skill is already installed, the installer asks before it overwrites it. With no terminal it refuses.

## Install one skill on its own

| You want | Run | You get |
|---|---|---|
| Everything | `node install.mjs` | growth, growth-coach and g-mini |
| Only G mini | `node install.mjs --only=g-mini` | g-mini |
| Only your own Growth | `node install.mjs --only=growth` | growth and growth-coach |

All of them still need the `app/` folder and `npm install` in it. The skills run the app's scripts, and the app shows the results. G mini writes only to `app/people/`, so you can ignore the Growth pages in the app.

## Install without the installer

1. Copy `skills/<name>/SKILL.md` into `~/.claude/skills/<name>/SKILL.md`. On Windows that is `C:\Users\<you>\.claude\skills\<name>\`.
2. Create a `config.json` next to it.
   - For `growth`: `{ "growthRoot": "<full path to app>", "coachSkill": "<full path to ~/.claude/skills/growth-coach/SKILL.md>", "dossier": "" }`
   - For `g-mini`: `{ "appRoot": "<full path to app>", "peopleDir": "<full path to app>/people" }`
3. Use forward slashes in the paths.
4. Restart Claude Code so it picks up the skill.

## Remove a skill

Delete its folder in `~/.claude/skills/`. Your data in `app/` stays.

## Settings

These are environment variables. Set them before `npm run dev`.

| Variable | What it is for |
|---|---|
| `GROWTH_DOSSIER` | Path to your own career notes file (markdown). The CV honesty check reads it. Unset by default. With nothing set, the check says so and refuses to pass. |
| `GROWTH_BACKUP_DIR` | Where backups go. Set it to a folder outside any cloud-synced folder. |
| `GROWTH_COACH_SKILL` | Path to the growth-coach skill file, if it is not at `../skills/growth-coach/SKILL.md`. |
| `GROWTH_EDGE` | Path to a Chromium or Edge executable, for PDF export of the CV and G mini reports. |
| `NEXT_PUBLIC_GROWTH_FOLDER` | The folder name shown on the Commands page. Optional. |

{% hint style="warning" %}
Never put your career notes file inside the repo. It holds facts about you, and the repo is public if you publish it.
{% endhint %}

Next: [Your first run](first-run.md). See also [Data and privacy](../concepts/data-and-privacy.md).
