# The Commands page

The app is where you do things. Claude Code is where you talk to Claude. The Commands page is the bridge. It tells you what Claude owes you, and what to say next. Open it with `C`, or key `6`.

## What you see

| Section | What it shows |
|---|---|
| Needs you | The counted items from [Attention tiers](../concepts/attention-tiers.md): questions to answer and replies to read. |
| Queued for Claude | Requests waiting in the queue, with their dates. Nothing changes until you say `answer it` in Claude Code. |
| From Claude | Recent replies, with "New" on the ones you have not seen. |
| You can also say | A few plain phrases that fit where you are. |
| Claude Code is connected | A fold that shows setup, or "Claude Code has replied before". |
| All commands | Every command, grouped. Each has an "i" button. |
| G mini | For the people you help. It never touches your own Growth. |
| Add-ons | Skill files that give Claude a new ability. |
| How changes stay safe | The snapshot, lock and check steps. |

A status line says when Claude last ran and what it will read: "When you say answer it, it reads: 1 question, 2 tasks." It reads only fields that exist, so it never says "ran" when nothing is recorded.

## The "i" button

Every command has an "i" button. It tells you:

- what the command does,
- what it changes, and which pages,
- how often to use it (a rhythm, sometimes, or almost never),
- when it happens, and where to look afterwards,
- what you do next. Each next step is marked "needed" (Claude waits for it) or "optional" (Claude goes on without it).

A command that changes data carries a badge, such as "Changes your plan", "Adds a line to your log" or "Adds a CV version with that part". A command that only answers in Claude Code carries none. After your yes, the change happens. See the lock and undo steps in [How it fits together](../concepts/how-it-fits-together.md).

## What's on the page that is not a command

- **What Claude knows about you.** Your answers to Claude's questions, and what each one changed.

The app's "How the app works" sheet also holds the keys and the code for opening the app on another device on the same Wi-Fi. See [Data and privacy](../concepts/data-and-privacy.md).

The same command list is in [Commands](../reference/commands.md). Both come from one source file, `app/lib/commands.ts`.

Next: the skills. Start with [growth](../skills/growth.md).
