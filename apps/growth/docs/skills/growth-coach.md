# The growth-coach skill

`growth-coach` is the coach behind Growth. It holds the rules Growth coaches by, and it answers the work the app queues.

Source: [`skills/growth-coach/SKILL.md`](https://github.com/checkdev-dot/my-works/blob/main/apps/growth/skills/growth-coach/SKILL.md) and its [README](https://github.com/checkdev-dot/my-works/blob/main/apps/growth/skills/growth-coach/README.md).

## Purpose

Its rules are simple:

- Diagnose before advising.
- Fix the earliest broken stage of your job search first.
- Plan skill and reach together, two tasks a night.
- Rank evidence by how much it can be trusted.
- Never flatter.

It installs together with `growth`. If the two disagree, growth-coach wins on coaching and data shapes.

## When it runs

It runs when the app has queued work for Claude. Say `answer it` (or `run my queue`). The app queues:

- a critique of something you handed in,
- your weekly review, so Claude can plan next week,
- a skill test to write or score,
- a research brief,
- library picks,
- answers to questions Claude asked you,
- a changed goal.

It also answers `review`, `critique`, `where do I stand`, `I feel like a fraud` and "is this worth my time?".

## Commands it handles

| Say | What it does |
|---|---|
| `answer it` | Processes every pending queue item, oldest first, then reports what it did. |
| `where do I stand` | Funnel, skills, calibration and the next three things, each with a source. |
| `review` or `critique` | Ranked feedback on a piece of work, about the work and not about you. |
| `plan my week` | Reviews the week and plans the next, with both tracks in it. |
| `plan my four weeks`, `weekly check`, `review my four weeks`, `why this task` | The plan engine. See [Plan your weeks](../guides/plan-your-weeks.md). |
| `I feel like a fraud` | Answers a bad moment with your own evidence and one small thing for tonight. |
| `is X worth learning?` | Scores it the six-question way and compares it with alternatives. |

## How it handles each queue item

| Item | What Claude does |
|---|---|
| `answers` | Updates the diagnosis first, because answers can change priorities. Logs countable facts as evidence. Writes a takeaway for each answer. |
| `ask` | An older request. A question is answered in a reply of under 150 words. A change is made if it serves your goal and keeps two tasks a night. |
| `goal` | Re-plans around it. If the goal feels too far, it plans toward a stepping stone first and does not quietly lower anything. |
| `picks` | Writes library picks with scores. |
| `research` | Writes a brief of three to six things to do differently, with checked sources. |
| `critique` | Opens every link, then writes feedback on the task: a verdict, what works, up to three ranked fixes, one next step. |
| `test` | Writes three to five scenario questions, or scores your answers from 1 to 4 and writes a note on each. |
| `plan` | Re-rates from new evidence, checks the active bets, picks the earliest broken stage and writes next week. |

Every handled item is closed with a `reply` or `feedback`. The data check refuses an item marked done without one.

## What it reads and writes

| File | What it holds | What the coach does |
|---|---|---|
| `queue.json` | Requests from the app | Processes every pending item. |
| `profile.json` | Goal, root causes, beliefs, intake questions | Updates beliefs, stores intake answers. |
| `rubric.json` | Level definitions, 1 junior to 4 lead | Reads only. |
| `skills.json` | Level, target, confidence, source, history | Re-rates only with a history entry. |
| `evidence.json` | Append-only log | Appends. |
| `week.json` | This week's tasks and feedback | Writes critiques and next week. |
| `learning.json` | Research briefs | Appends. |
| `tests.json` | Scenario tests | Writes and scores. |
| `proof.json` | What a recruiter can see | Updates statuses from evidence. |
| `reach.json` | The funnel and applications | Market facts only. |
| `library.json` | Picks, gaps, trinkets | Writes picks weekly. |
| `demands.json`, `plan.json`, `research.json`, `sources.json`, `runs.json`, `reviews.json` | Plan engine files, all optional | Writes only through the plan engine. |

Read [Data files](../reference/data-files.md) for each one.

## Rating rules

- Rate against the markers in your rubric, never by feel.
- Trust ranks as market, expert, shipped, Claude's read, then your own rating. See [Honesty rules](../concepts/honesty-rules.md).
- A skill moves at most half a level at a time. A bigger jump needs an expert or market source.
- Every change appends `{date, level, source, reason}` to the history.
- Low confidence is a diagnosis gap, not a skill gap. The fix is evidence, not a course.
- Once a month it compares your self-score with the latest outside score and records the gap.

## Planning a week

- Two tasks per planned day: one `skill`, one `reach`. Evenings come from your pace: lighter 3, steady 5, push 6.
- Each task is 30 minutes or less, never over 60. It has two to four steps of 15 minutes or less, a named artifact and a reason.
- Every task has `where`: `phone` or `desk`.
- Saved-for-later tasks carry into next week first. It never mentions that they were skipped.

## When you spiral

It does not argue, and it does not flatter. It shows your own evidence, says what the evidence cannot yet support, and names one small thing for tonight. It does not diagnose and does not give therapy.

## Safeguards

- It never raises a skill level without evidence, and never presents a blog number as fact.
- Where its research has a strength label, it names it. When evidence is weak, it says so.
- Plans give a range, never a guarantee.
- Its tone rules apply to everything it writes into your data: plain second person, no dashes, no game words, no failure framing.
- It runs `npm run check` after every write and fixes every error before it reports back.

Next: [g-mini](g-mini.md).
