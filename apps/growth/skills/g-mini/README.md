# g-mini

**Help someone else with one career move.** For a friend or colleague who needs a little help, not a coaching programme. You run it in Claude Code with them beside you. It interviews them for 45 to 60 minutes, researches their target roles from public sources, and builds a deep PDF report (15 to 25 pages, with charts) for them to keep.

**Careers it knows well:** design, PR and communications, marketing, and HR moving into HR transformation, OD, change management, HR technology or people analytics. Other careers are researched fresh and marked as not mapped yet.

**The PDF covers:** where they are, where they want to go, an honest read on the best first step, a gap map, how others made the move (patterns, never names), what the interviews look like, a dated plan in phases with a fits / tight / does not fit verdict, and what to find out next.

**Commands**

| Command | What it does |
|---|---|
| `/g-mini new` | Name, consent, interview, then research and the PDF on its own |
| `/g-mini <id>` | Open a person, or resume a stopped interview |
| `/g-mini <id> edit` | Change a fact, rebuild the PDF as a new dated version |
| `/g-mini <id> interview` / `research` / `report` | Redo one step |
| `/g-mini <id> mock` | A practice interview, only when asked |
| `/g-mini list` | Everyone you have made one for |

**Privacy:** each person has their own folder in `app/people/<id>/`, locked with a code. Nothing from one person is used for another, and it never reads your own Growth data. Their data stays on your computer, and Claude never sends the PDF: you do.

**Needs:** the [Growth app](../../app) (its scripts build the report). Install alone with `node ../../install.mjs --only=g-mini`.
