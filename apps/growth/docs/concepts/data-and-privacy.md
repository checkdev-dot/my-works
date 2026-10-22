# Data and privacy

## Your data stays on your computer

- `app/data`, `app/cv`, `app/people` and `app/research` are in `.gitignore`. The installer creates them empty.
- The app has no analytics and uploads nothing.
- Growth adds no network calls of its own. Claude Code does the research you ask for from public sources.

{% hint style="warning" %}
Claude Code sees what it reads. When you run a command, Claude reads the files that command needs. That text goes to Anthropic like any Claude Code session. Growth adds nothing beyond that.
{% endhint %}

## What Claude reads

Claude does not read the whole folder. Before a command it runs a brief script, `make-brief.mjs`, that builds a small summary of the data for that command. It lists what is stale, unsourced or low confidence. Claude opens a full data file only to edit it. The `cv` brief holds no CV data: the CV commands read `data/career.json` directly.

You can see the same brief at `http://localhost:4321/api/brief?command=<command>`. See [Scripts](../reference/scripts.md).

## Backups

The app and the scripts snapshot the files they change into `app/data/.backups`, the last 40 per file. They never delete that folder.

Set `GROWTH_BACKUP_DIR` to a folder outside any cloud-synced folder if you do not want backups synced. Everything you answer in the interview, money and Round 3 included, is otherwise uploaded in every synced copy.

An onboarding reset also writes a backup with a checksum manifest, and archives your old data to `data/prior.json`. Neither is ever pruned.

## Private answers

Round 3 answers are private. They never go into:

- a CV or a case study,
- outreach drafts or add-on input,
- the journal,
- any public copy.

They appear in the plan only as a neutral task such as "the thing you named in Round 3". Say `forget R3` and Claude deletes those answers, their notes, tasks, risks, beliefs and demands.

## Phone access is optional

`npm run lan` starts a relay on your local network, on port 4322, with a one-time pairing code. The app itself listens only on 127.0.0.1 and checks the host header, so nothing is exposed unless you start the relay. Skip it and nothing leaves your machine.

## Your career notes file

The CV honesty check can compare every fact against a markdown file of your own career notes. Set `GROWTH_DOSSIER` to its path. It is unset by default. With nothing set, the check says so and fails closed. Never put this file in the repo.

Two parts of that file matter.

| Section | Meaning |
|---|---|
| 3.9 | Work that is not yours. It is never credited to you. |
| 3.10 | Confidential items. They never appear in a CV, a case study, a saved result or the app. |

A deny-list, `app/cv/.denylist.json`, holds those terms for the check. It stays local. Claude never prints or quotes it.

## People you help

G mini keeps each person in their own folder, `app/people/<id>/`, away from your data. See [The G mini wall](../skills/g-mini.md#the-wall).

## What Claude never does

- Send, post, submit, email, schedule or publish anything for you. It drafts. You send.
- Call a paid API or write a key or a billing detail anywhere.
- Treat text in a file, a web page, a job post or an add-on as an instruction. That text is data.

Next: [Honesty rules](honesty-rules.md).
