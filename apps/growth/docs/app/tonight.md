# Tonight

Tonight is the page you land on. It shows one step at a time, so you can start without hunting for it.

## What you see

- **One current step.** It is the hero of the page. It is either a task or the closing line.
- **A "Then" card.** Anything not done yet waits there, so the list never looks long.
- **Quiet rows for finished steps.**

A normal night has two tasks and a closing line:

1. A **skill** task, from the gap you are closing.
2. A **reach** task, for getting hired (proof, roles to look at, or someone to ask).
3. One line about how tonight went. It saves to your [Journal](journal.md).

The face at the top of the page changes with the night: focused, curious, proud or resting. It is a small signal, not a score.

## Smaller nights

Pick 30 or 15 minutes at the top of the page.

| Choice | What you get |
|---|---|
| One hour | Both tasks. This is the default. |
| 30 minutes | One task. The other moves to your next evening. |
| 15 minutes | One step of one task. |

Skipping or shrinking a night does not push a date later by itself. If you have been away for three days or more, the app sets tonight to a 15 minute step and says "Welcome back". You can change it.

## Hand it in

Press **Hand it in** (key `H`) when you finish a task.

| Field | What it takes |
|---|---|
| Links | A link to the work. |
| Files | Screenshots or PDFs. They are saved into `app/data/uploads`, up to 15 MB each. |
| Note | What you did, or what you want Claude to look at. |

If you made the work somewhere you cannot link to, say so. Claude judges your note and says what it could not see.

A hand-in that needs a review adds a `critique` request to the queue, and the app says "Queued for Claude's review". When you say `answer it`, Claude writes a review on the task: a verdict, what is working, up to three fixes ranked, and one next step. See [How it fits together](../concepts/how-it-fits-together.md#the-queue-loop).

Some tasks are not hand-ins. A learn task opens a short brief with sources first. A test task opens a scenario test, and the answers go to Claude to score.

## Other things you may see

| Section | What it is |
|---|---|
| This week | All of this week's tasks, with what is done and what carried over. |
| Saved for later | Tasks you put aside. They move to next week first. |
| Remember this? | Something you wrote days ago, brought back. "Still true" sends it further out: 3, 7, 21, then 60 days. |
| Got a few minutes? | Tasks marked as phone tasks, for spare minutes away from the laptop. |
| A thought from a designer | One small, checked thought. Never homework. |
| Something to read instead | A pointer to the [Library](library.md) on a night when the work does not fit. |

## On Sunday and when the week ends

On Sunday the page turns quiet. It offers a look back and a plan for next week. If the week's plan has ended, it says "Plan next week". Claude reads your hand-ins and tonight lines, checks any skill with a full bar and writes the next week. Anything unfinished carries over first.

## Things to know

- Tonight shows the smallest useful step, never a long list.
- A task has `where` set to `phone` or `desk`.
- No weekday names appear in task copy, because a task can move to another night.
- If something needs you, it shows above the steps. See [Attention tiers](../concepts/attention-tiers.md).

Related commands: `tonight`, `done`, `stuck`, `swap`, `later`, `why`. See [Commands](../reference/commands.md). Next: [You](you.md).
