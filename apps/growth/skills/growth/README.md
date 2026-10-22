# growth

**Your career growth, run from Claude Code.** The front door to the Growth app: it interviews you, maps your skills against the roles you want, plans your weeks, reviews your work and builds an honest CV where every fact has a source. It writes into the app's local files; the app shows the result.

**Use it when** you want to know what to build next, what to do tonight, or how to get seen by the right people.

**Start:** `growth start` (the onboarding interview, in rounds of about 20 minutes).

**Everyday commands**

| Say | What happens |
|---|---|
| `where do I stand` (or `/growth`) | Where things stand, tonight's step, anything Claude owes you |
| `answer it` | Works through everything the app queued |
| `plan my week` / `plan my four weeks` | Plans the week or the next four weeks, after your yes |
| `change my plan` | Lighter week, move a gap, or change your goal |
| `look at my CV` | Reviews your CV or a piece of work, most important change first |
| `update my library` | Finds and scores things worth your time this week |
| `build my CV` / `fill in my CV` | Builds a sourced CV version; asks only for missing facts |
| `tailor my CV for this job` | A version for one job post |
| `save my CV as a PDF` / `use this CV` | Saves the PDF; makes a version your main CV |
| `write my case studies` | One case study at a time, with you |

**What it will not do:** invent a number, title or result (gaps become `[NEEDS: ...]`), credit you for others' work, send or post anything, or call an API. It runs on your Claude Code subscription.

**Needs:** the [Growth app](../../app) and the [growth-coach](../growth-coach) skill. Install with `node ../../install.mjs --only=growth`.
