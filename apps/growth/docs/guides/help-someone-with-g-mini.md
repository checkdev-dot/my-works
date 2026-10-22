# Help someone with G mini

This guide walks you through one G mini from start to finish. It assumes you have installed the `g-mini` skill and run `npm install` in `app/`. See [Install](../getting-started/install.md).

G mini suits someone who knows roughly where they want to go and wants an honest picture of the gap, the path and the interviews. It is not therapy, a job board or a guarantee.

## Before you sit down

- Pick a time of 45 to 60 minutes with no interruptions.
- Ask the person if they have their CV and LinkedIn text. Both are optional. They can paste the text, or you can give a file path. For LinkedIn, the Save to PDF export works. Nothing is scraped and nobody logs in.
- Sit them next to you. They answer out loud or by typing. You type the commands.

## Start

Say `/g-mini new`.

1. Claude asks their name, as they want it on the report. It suggests a short id, for example `sam`. You confirm it or choose another. Two people with the same name get two ids.
2. Claude asks for their consent. It says what is saved (their answers, their CV and LinkedIn text, research about their roles and a PDF), where (this computer, in `people/<id>/`), that nothing is sent anywhere, that you send the PDF yourself, and that they can withdraw at any time. Their own words are saved as proof of the yes. A no stops everything, and nothing is saved.
3. Claude asks what must stay out of the report, such as an employer's confidential details.
4. They give the CV and LinkedIn text, or skip. If the two disagree on a title, dates or a team size, Claude asks which is right before it goes on. The report shows only the confirmed one.

## The interview

About 40 questions, one at a time. For each one Claude says why it is asking, asks it, saves the answer and echoes it in one line.

- They can say `skip`. The consequence is saved.
- They can say "I don't know". It becomes a find-out task in the report.
- Pay, notice, runway, an earlier attempt, feedback, a named judge and every hard question are private by default. Private answers never go into the PDF in any wording. Claude never asks for more than they offer.
- It asks for their deadline and the hours a week they have. Once a plan exists, the report says whether they fit: fits, tight or does not fit.

If the interview stops, say `/g-mini <id>`. It resumes where it left off.

## The research and the PDF run on their own

When every question is answered or skipped, Claude carries straight on. It researches their target roles from public sources, saves facts with quotes, builds the gap map and a dated plan, and then makes the PDF. The person can leave.

Claude then tells you where the PDF is: `people/<id>/report/<date>/report.pdf`. Open it and check it.

{% hint style="info" %}
Claude never sends anything. You send the PDF yourself.
{% endhint %}

## Read the PDF

- A footer counts the facts still needed. If the PDF says **Draft**, fill the yellow "still needed" items with the person, then rebuild.
- Check that it reads true to them. If something is wrong, use `/g-mini <id> edit`.
- It never prints private answers. If you see something that looks private, do not send it. Tell Claude which line.

## Later changes

| Command | Use it when |
|---|---|
| `/g-mini <id> edit` | They corrected a fact. Claude asks which fact and what it should say, and asks for the source. Then it rebuilds the PDF into a new dated folder. |
| `/g-mini <id> interview` | They want to redo or finish the interview. Old answers are kept. Each is asked again with "Last time you said X. Is that still true?". |
| `/g-mini <id> research` | You want the research redone. |
| `/g-mini <id> report` | You want the PDF rebuilt, without other changes. |
| `/g-mini <id> mock` | They want a practice interview. One question at a time, no feedback in between, then feedback on their answers against their own facts. |
| `/g-mini list` | You want to see everyone, and who agreed. |

The report is rebuilt into a new dated folder each time, for example `report/2026-10-22`, then `report/2026-10-22-2`. The old PDF is kept.

After a report the person is frozen. `/g-mini <id>` opens them again and gives a new guard.

## If they change their mind

If they say "please stop and remove me", Claude records the withdrawal. It archives a full copy to `people/_archive/`, clears the live folder and rotates the guard. A plain yes does not bring consent back. If they want to start again, make a new person, or type `RENEW CONSENT <id>` as your own message.

To delete a person, type `DELETE PERSON <id>`. To erase them for good, archives included, type `ERASE <id>`. Claude only accepts either phrase typed by you, and never from a file or a page.

## What to remember

- Every reply starts with `Working on: <Name> (<id>)`. If it names the wrong person, stop and say so.
- Their data lives only in `app/people/<id>/`. G mini never reads your own Growth data. See [The wall](../skills/g-mini.md#the-wall).
- Any career works. If the role is not mapped yet, the report says so, and shows more gaps as "still needed".

Related: [g-mini skill](../skills/g-mini.md), [Data files](../reference/data-files.md) for the people folder.
