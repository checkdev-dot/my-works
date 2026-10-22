# Commands

Every command in Growth, grouped as the app's Commands page groups them. You can type the command or say the plain words. Both work in Claude Code.

This list comes from `app/lib/commands.ts`, the same file the Commands page reads. The skill files in `skills/` hold the full rules for each command.

{% hint style="info" %}
The "Changes data" column says whether the command can change your files. A command that changes data asks for your yes first, except where you have just asked for exactly that thing (see [How it fits together](../concepts/how-it-fits-together.md#how-every-write-stays-safe)). `undo` puts the files back.
{% endhint %}

## The front door: six things

| Say | Use it when |
|---|---|
| `/growth` or `where do I stand` | You feel lost, or it is the start of an evening. |
| `/growth answer` or `answer it` | You asked something in the app or handed in work. |
| `/growth library` or `update my library` | It is the start of the week, or you want something new. |
| `/growth change` or `change my plan` | The week does not fit, or your goal feels different. |
| `/growth review` or `look at my CV` | You made something and want it looked at. |
| `/growth add-on` or `add a skill file` | Someone shared a skill file you want to use. |

Everything else works in plain words.

## Every day

The small things you do most evenings.

| Command | What it does | Example | Plain words | Changes data |
|---|---|---|---|---|
| `status` | Tells you where things stand, what's on tonight and anything Claude owes you. | `/growth` | "where do I stand", "how am I doing" | No |
| `tonight [hour/30/15]` | Shapes tonight to the time you have, with the smallest useful step first. | `/growth tonight 30` | "I only have 20 minutes", "what should I do tonight" | No |
| `done <task or step>` | Marks a task, or one step of it, as done and adds it to your log. | `/growth done S-03` | "I finished the CV task" | Yes |
| `stuck <task>` | Finds where you stopped, then gives the smallest next move. | `/growth stuck S-03` | "I'm stuck", "I don't know where to start" | No |
| `swap` | Replaces tonight's task with one that fits your energy, time or place better. | `/growth swap` | "swap this one", "I can't do this tonight" | Yes |
| `later <task>` | Saves a task for later. It moves to next week first. | `/growth later S-04` | "save this for later", "not tonight" | Yes |
| `journal <what happened>` | Adds a line to your log, with a skill you're working on if it fits. | `/growth journal Ran my first test with one person` | "note this down" | Yes |
| `journal add <what happened>` | Adds one line to your log. The same as writing the line after journal. | `/growth journal add Showed my case study to a friend` | "add this to my journal" | Yes |
| `fraud` | Answers a bad moment with your own evidence and one small thing for tonight. | `/growth fraud` | "I feel like a fraud", "I feel stuck on this skill" | No |
| `why <task>` | Explains one task: the sources behind it, why it sits on this night and which of your goals it serves. Changes nothing. | `/growth why S-03` | "why this task", "why am I doing this" | No |

## Feedback on your work

Hand work in, get it reviewed, and clear the queue.

| Command | What it does | Example | Plain words | Changes data |
|---|---|---|---|---|
| `handin <task> [link or file]` | Hands a task in with a link, file or note, and asks Claude to review it. | `/growth handin S-03 https://my-portfolio.example/case-1` | "here's my work for the task" | Yes |
| `review <link, file or text>` | Gives ranked feedback on a piece of work: what to change first, then why. | `/growth review https://my-portfolio.example/case-1` | "what do you think of this" | Yes |
| `queue` | Works through everything you have asked Claude for in the app. | `/growth queue` | "answer it" | Yes |
| `answer` | Answers everything queued for Claude in the app, then lists what was done. | `/growth answer` | "answer it", "answer everything", "answer all" | Yes |

## Changing your course

Plans, goals, pace, gaps, skills and the onboarding interview.

| Command | What it does | Example | Plain words | Changes data |
|---|---|---|---|---|
| `week` | Reviews the week and plans the next one, with both tracks in it. | `/growth week` | "plan my week", "Sunday review" | Yes |
| `plan [lighter / change]` | Plans your next four weeks, researched and placed, and shows what would change. Nothing is saved until you say yes. With a plan in place it shows it, or adjusts it. | `/growth plan` | "plan my four weeks", "make this week lighter" | Yes |
| `check` | A five minute check on your four weeks: what got done, what slipped, how the dates moved, and up to three choices for you. | `/growth check` | "weekly check", "how did my week go" | Yes |
| `review 4w` | Looks back over your four weeks: did the work move a skill, are the gaps still the right ones, and what to plan next. It suggests; you decide. | `/growth review 4w` | "review my four weeks" | Yes |
| `task add / change / move / drop <task>` | Adds, edits, moves or drops one task, keeping two a night. | `/growth task move S-05 Fri` | "move this to another night" | Yes |
| `goal` | Updates your goal and how it feels, then re-plans around it. | `/growth goal` | "my goal feels too far", "I want to aim higher" | Yes |
| `target [role] [level]` | Changes the role and level you are aiming for among the five launch roles, or adds a second target, and shows how the gap changes. Asks before it saves. | `/growth target product marketer` | "change my target", "I want to aim for a different role" | Yes |
| `pace lighter / steady / push` | Sets how many evenings a week you want to work: 3, 5 or 6. | `/growth pace lighter` | "I'm tired this week", "I want to push harder" | Yes |
| `gaps [show / move / add / close / redate]` | Shows what stands between you and your goal, and keeps the list honest. | `/growth gaps move G-02 up` | "what am I missing" | Yes |
| `skills` | Shows each skill, how sure the rating is, and what would move it. | `/growth skills` | "how good am I at research" | No |
| `rate <skill>` | Re-rates one skill from evidence, never from feel. | `/growth rate research` | "rate my research skill", "re-rate my research" | Yes |
| `person [show / seed / edit / clear]` | Proposes a few things Claude has noticed about you, for you to confirm or reject. Nothing is kept as true until you say so. | `/growth person` | "get to know me", "what do you know about me" | Yes |
| `test <skill>` | Gives you a short scenario test for a skill, then scores your answers. | `/growth test communication` | "test me on research" | Yes |
| `notnow [add / back] <what>` | Parks something on purpose with a date to revisit, or brings it back. | `/growth notnow add motion design` | "I'm not doing this right now" | Yes |
| `start [--dry-run]` | Starts your onboarding: rounds of direct questions, a few each night. Whatever you cannot answer becomes a task in the course. Nothing is erased until you type the exact phrase. | `/growth start` | "growth start", "start over", "start again", "onboard me", "begin" | Yes |
| `resume` | Carries on the onboarding from the last question you answered. | `/growth resume` | "resume growth start", "carry on with the questions" | Yes |
| `pause` | Stops the questions now and keeps everything you answered. Works in the middle of a question. | `/growth pause` | "pause", "not now", "stop" | Yes |
| `onboarding status` | Shows the round, what is answered, what is unknown and what does not add up. Changes nothing. | `/growth onboarding status` | "how far is my onboarding", "onboarding status" | No |
| `redo round <N>` | Reopens one round. Your earlier answers are kept, and each question is asked again with what you said last time. | `/growth redo round 2` | "redo round 2", "ask round 3 again" | Yes |
| `change [what]` | Asks what you want, shows what would change, and only then changes it. | `/growth change` | "make this week lighter", "my goal feels too far" | Yes |

## Hiring

Your CV, your portfolio, case studies and applications.

| Command | What it does | Example | Plain words | Changes data |
|---|---|---|---|---|
| `cv` | Checks your CV against the 7-second test and says what to change first. To build or improve it, use cv build. | `/growth cv` | "look at my CV", "my resume" | No |
| `cv build` | Builds a new version of your CV from your interview answers, your career file and your evidence. Every fact has a source, and anything missing is marked as still needed. | `/growth cv build` | "build my CV" | Yes |
| `cv tailor <job post>` | Makes a new CV version fitted to one job post, and shows it as your current one. It reorders and rewords what is true. It adds no skill and no number. | `/growth cv tailor https://example.com/jobs/product-designer` | "tailor my CV for this job" | Yes |
| `cv ats <job post>` | Compares your CV with one job post: keywords found, keywords missing, and a match number labelled as an AI estimate. | `/growth cv ats https://example.com/jobs/product-designer` | "check my CV against this job" | Yes |
| `cv section <name>` | Rewrites one part of your CV, such as the summary, skills, experience or projects, from facts that have a source. | `/growth cv section summary` | "rewrite my summary" | Yes |
| `cv fill` | Asks you only for the facts your CV still needs, such as a result or a number, and fills them in with your words as the source. You can skip any of them. | `/growth cv fill` | "fill in my CV" | Yes |
| `cv export [version]` | Saves a CV version as a PDF in your Growth folder. It does not replace the CV you send out. | `/growth cv export` | "save my CV as a PDF" | Yes |
| `cv promote [version]` | Makes one CV version the CV in your Growth folder. The old one is kept first. Only when you say so, and only when no fact is still needed. | `/growth cv promote` | "use this CV" | Yes |
| `portfolio` | Reviews your portfolio the way a recruiter sees it, in 30 seconds and in 3 minutes. | `/growth portfolio` | "review my portfolio" | No |
| `casestudy <name>` | Writes one case study with you. It fills the questions from what you already told Claude, asks only what is missing, one project at a time, and suggests a format. | `/growth casestudy Checkout redesign` | "write my case studies", "work on a case study" | Yes |
| `apply <company, role>` | Logs an application, tracks its stage and gives CV tailoring notes. | `/growth apply Acme Pay, Product Designer` | "I applied to Acme", "they moved me to a screen" | Yes |
| `interview <company>` | A mock interview, one question at a time, with feedback at the end. | `/growth interview Acme Pay` | "I have an interview", "mock interview" | Yes |
| `outreach <person or company>` | Drafts a short message for you to send. Claude never sends anything. | `/growth outreach Jordan at Acme Pay` | "write a message to someone", "how do I reach out" | No |

## Learning

Your journal read back, briefs, the library and news.

| Command | What it does | Example | Plain words | Changes data |
|---|---|---|---|---|
| `journal read [week / gap <id> / <n days>]` | Reads your log back as themes, wins and blockers that repeat. Changes nothing. | `/growth journal read week` | "what have I been writing about", "read my journal" | No |
| `learn <topic>` | A short brief on a topic, tied to a gap, with sources that were checked. | `/growth learn usability testing` | "teach me this", "is this worth learning" | Yes |
| `library` | Shows this week's picks and how they tie to your gaps and tasks. | `/growth library` | "what should I read" | No |
| `library update` | Rebuilds your picks from your gaps and journal, scored, with what was left out and why. | `/growth library update` | "update my library", "refresh my picks" | Yes |
| `library score <title, link or text>` | Tells you if something is worth your time, with a better option if there is one. Adds nothing. | `/growth library score https://example.com/article` | "is this worth my time" | No |
| `news` | Up to three things that changed lately and matter to your work. | `/growth news` | "anything new in design" | No |
| `recall` | Brings back one of your own notes so it sticks, and asks if it is still true. | `/growth recall` | "quiz me on my notes" | Yes |

## Add-ons

Skill files that give Claude a new ability.

| Command | What it does | Example | Plain words | Changes data |
|---|---|---|---|---|
| `modules` | Lists the skill files you have, what each is for and its last result. | `/growth modules` | "what skill files do I have" | No |
| `module add <file, link or pasted text>` | Installs a skill file after telling you what it does and what it needs. Saved unchanged. | `/growth module add C:/Users/me/cv-analyser/SKILL.md` | "add this skill" | Yes |
| `module run <id> [input]` | Runs one skill file on your input and saves what it found for the app. | `/growth module run cv-analyser` |  | Yes |
| `module enable <id>` | Turns a skill file on so the app can use it. | `/growth module enable cv-analyser` |  | Yes |
| `module disable <id>` | Turns a skill file off without removing it. | `/growth module disable cv-analyser` |  | Yes |
| `module remove <id>` | Takes a skill file out. Its past results stay unless you say delete. | `/growth module remove cv-analyser` |  | Yes |
| `module default <id>` | Picks which skill file is used when two do the same job. | `/growth module default cv-analyser` |  | Yes |
| `module results [id]` | Shows what your skill files found, newest first, and which results are out of date. | `/growth module results` |  | No |
| `analyse cv [file]` | Scores your CV with a CV add-on you chose, or says there is none and offers the built-in review. To build or tailor your CV, use cv build. | `/growth analyse cv` | "analyse my CV", "score my CV" | Yes |
| `analyse linkedin [pasted text or file]` | Reads your LinkedIn profile from text you paste or the data export. It never visits LinkedIn. | `/growth analyse linkedin` | "analyse LinkedIn" | Yes |
| `analyse portfolio` | Runs your portfolio skill file on your live site or pasted case studies. | `/growth analyse portfolio` |  | Yes |
| `analyse interview` | Runs your interview skill file on an answer you paste. It never records anyone. | `/growth analyse interview` |  | Yes |
| `add-on` | Keeps a skill file unchanged, checks it, and adds it as a tool. Its scores show in the app. | `/growth skill file` | "add this skill file" | Yes |

## Memory and upkeep

The story so far, undo, repairs and help.

| Command | What it does | Example | Plain words | Changes data |
|---|---|---|---|---|
| `journey` | Tells you the story so far from Claude's long-term memory of you. | `/growth journey` |  | No |
| `remember <thing>` | Saves a short dated note to the journey for next time. | `/growth remember I want a calmer pace in November` | "note this for next time" | Yes |
| `undo` | Puts back the files as they were before Claude's last change. | `/growth undo` | "undo that", "put it back" | Yes |
| `fix` | Repairs data that won't load, keeping everything you entered. | `/growth fix` | "the app is broken", "fix my growth data" | Yes |
| `pack` | Tells you where the Growth pack is, a single file with your plan and evidence you can take elsewhere. You rarely need it. | `/growth pack` | "where is my pack" | No |
| `help` | Lists every command. Plain words work too. | `/growth help` |  | No |

## G mini (for people you help)

A separate tool. It never reads or writes your own Growth. See [g-mini](../skills/g-mini.md).

| Command | What it does | Example | Plain words | Changes data |
|---|---|---|---|---|
| `g-mini new` | Starts a new person. Asks their name and whether they agree, then runs the whole interview, the research and the PDF one after the other, with no stops in between. | `/g-mini new` | "start a g mini" | Yes |
| `g-mini <id>` | Opens one person, or carries on where you stopped. Every reply says whose file is open. | `/g-mini alex` | "open &lt;name&gt;'s g mini" | No |
| `g-mini interview <id>` | Redo the interview for that person. Their old answers are kept, and each one is asked again before it is replaced. | `/g-mini alex interview` | "redo &lt;name&gt;'s g mini interview" | Yes |
| `g-mini research <id>` | Redo the research for that person: public patterns only, India and remote roles, every source with its date. Never people's names or links. | `/g-mini alex research` | "redo &lt;name&gt;'s g mini research" | Yes |
| `g-mini report <id>` | Rebuild the PDF for that person. The old PDF is kept in its own dated folder. | `/g-mini alex report` | "rebuild &lt;name&gt;'s g mini PDF" | Yes |
| `g-mini edit <id>` | Changes one fact in that person's file, then rebuilds the PDF in a new dated folder. | `/g-mini alex edit` | "change a fact in &lt;name&gt;'s g mini" | Yes |
| `g-mini mock <id>` | Runs a live mock interview for that person. Only when you ask for it. | `/g-mini alex mock` | "run a g mini mock for &lt;name&gt;" | No |
| `g-mini list` | Lists everyone you have made a g mini for, and who agreed. | `/g-mini list` | "list my g minis" | No |

## Notes on a few commands

- `answer` and `queue` do the same thing. Say `answer it`.
- `start`, `resume`, `pause`, `onboarding status` and `redo round` are the onboarding interview. See [Your first run](../getting-started/first-run.md).
- `plan`, `check`, `review 4w` and `why` are the plan engine. See [Plan your weeks](../guides/plan-your-weeks.md).
- `cv build`, `cv fill`, `cv export` and `cv promote` are the CV pipeline. See [Build an honest CV](../guides/build-an-honest-cv.md). `cv promote` always says what it replaces and waits for your yes.
- `g-mini` commands are typed as `/g-mini ...`, not `/growth ...`. The id comes before the verb, for example `/g-mini sam interview`. Follow the Example column.
- The add-on command is typed `/growth add-on`, or you can say "add a skill file". Plain words work either way.
