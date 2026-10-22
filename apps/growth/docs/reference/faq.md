# FAQ

## Does Growth need an API key or a paid plan?

No API key. It runs on your Claude Code subscription. Nothing in Growth asks for a key, and it never calls a paid API.

## Where is my data?

In folders on your computer: `app/data`, `app/cv` and `app/people`. They are git-ignored. See [Data and privacy](../concepts/data-and-privacy.md) and [Data files](data-files.md).

## What does Anthropic see?

When you run a command, Claude reads the files that command needs. That text goes to Anthropic like any Claude Code session. Growth adds nothing beyond that. The app itself has no analytics and uploads nothing.

## Why does the app say "Waiting on Claude"?

The app has no AI in it. When it needs Claude, it adds a request to `queue.json`. Open Claude Code and say `answer it`. See [The queue loop](../concepts/how-it-fits-together.md#the-queue-loop).

## Can I use the Claude app or my phone instead of Claude Code?

No. The skills need to read and write files on your computer. The Claude app and phone chats cannot do that. Claude Code on your computer is the only place you talk to Claude. You can open the app itself on a phone on the same Wi-Fi with `npm run lan`, and a pairing code.

## Why did Claude write [NEEDS: ...] on my CV?

It could not source that fact. Claude never invents a number, a title or a result. Say `fill in my CV` and answer the missing facts. See [Honesty rules](../concepts/honesty-rules.md).

## Why won't Claude put that on my CV?

The honesty check refused it. Common reasons: the number has no quote behind it, the quote is not word for word in your notes, the line credits you with work that is not yours, or it says something the source does not. See [Build an honest CV](../guides/build-an-honest-cv.md#when-a-line-is-refused).

## Does Claude rate me?

It rates skills from evidence, never from feel. Trust ranks as market result, then expert review, then shipped work, then Claude's read, then your own rating. A skill moves by at most half a level at a time. See the [trust ladder](../concepts/honesty-rules.md#evidence-ranking).

## What is the difference between a match score and a rating?

A match or ATS score from a CV check is an AI estimate. It is not measured. A rating is a skill level from evidence. An add-on score never raises a rating on its own.

## Will Growth send emails or post to LinkedIn for me?

No. It drafts. You send. This holds for messages, applications, LinkedIn, emails and the G mini PDF.

## Do I have to answer every onboarding question?

No. Say `skip`, or "I don't know". An unknown becomes a task in your course. Some questions are marked must-answer. Claude asks about them once more as a choice: answer now, or take the task. Tasks are never refused silently, and you may set a later date.

## Can I stop in the middle?

Yes. Say `pause` at any time, even in the middle of a question. Say `resume growth start` to carry on.

## What if the interview gets heavy?

Say `pause`, or `skip the rest of this round`. Claude checks how you are holding up after each block of three hard questions. Round 3 answers are private, and you can say `forget R3` to delete them. If you write about hurting yourself, Claude stops asking, shows a helpline for your country and pauses. It does not diagnose and it is not therapy.

## Can I start over?

Yes. Say `growth start`, review the dry run and type the exact phrase Claude shows. It archives your old data to `data/prior.json` and backs up every file first. Nothing is deleted. See [Your first run](../getting-started/first-run.md).

## What do the six front-door commands do?

`/growth`, `answer it`, `update my library`, `change my plan`, `look at my CV` and `add a skill file`. Everything else works in plain words. See [Commands](commands.md).

## Does it work on macOS or Linux?

It is tested on Windows only. Expect rough edges elsewhere. For example, PDF export looks for Microsoft Edge unless you set `GROWTH_EDGE` to a Chromium or Edge executable.

## Is it only for designers?

It is built for design, PR and communications, and marketing, with five launch roles: product designer, brand designer, content marketer, product marketer and PR specialist. The interview does not assume a field, a currency or a channel, so it can run for someone else. A role that is not mapped is saved in your own words and labelled as not on the map.

## What is G mini, and does it touch my data?

G mini helps someone else with one career move: one interview, one PDF. It never reads or writes your own Growth data, and your Growth skills never read its people folders. See [The g-mini skill](../skills/g-mini.md#the-wall).

## Can G mini help anyone?

Yes, with one limit on depth. It knows design, PR and communications, marketing, and HR moving into transformation, OD, change management, HR technology or people analytics. For another career it researches fresh, and says the role is not mapped yet.

## How do I add someone else's skill file?

Say `add a skill file`. Claude checks it first, shows what it adds, and installs it unchanged only after your yes. See [Add a skill file](../guides/add-a-skill-file.md).

## How do I undo something?

Say `undo`. Claude puts the files back as they were before its last change. The app also keeps the last 40 versions of every file in `app/data/.backups`.

## Does Growth count streaks or points?

No streaks, no penalties and no game words. Progress shows as percentages and plain words. Skipping a night costs nothing, and the app does not mention missed nights. Points count work done, never skill.

## Which version of the app is this?

The app is a Next.js 16 app on port 4321, in `app/`. It is a personal project, shared as it is.

More help: [Troubleshooting](troubleshooting.md).
