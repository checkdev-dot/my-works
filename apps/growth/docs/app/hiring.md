# Hiring

The Hiring page is about getting seen and getting hired. It holds your goal, three scores, your CV, your case studies and your applications.

## When you can apply

The top of the page shows when you will be ready to apply for your goal, at your pace. It is a range with a basis, never a promise. Working on it does not push a date later. Waiting on other people does.

| Pace | Evenings a week |
|---|---|
| Lighter | 3 |
| Steady | 5 |
| Push | 6 |

Change the pace or the order of your gaps here and every date moves. Claude re-dates things at Sunday review. You can also say `pace lighter`, `pace steady` or `pace push` in Claude Code.

## Your goal

Your goal can change as you do. On this page you can say how it feels (right, too far, higher, or not mine), change it, or add a stepping stone. Claude then re-plans around it. Every change is kept in your goal history.

## Where you stand

Three numbers, each out of 100.

| Number | What it means |
|---|---|
| Doing the job | How you would perform day to day in the role. It is the average of six skills. |
| Interview readiness | How you would come across explaining your work and decisions. It adds finished case studies. |
| CV and portfolio | How a recruiter sees you in the first minute. It is built from proof items, not from feel. |

They move only when your work is checked, never because of how you feel. Open a number to see what it is made of.

| Score | Word |
|---|---|
| Under 40 | Early |
| 40 to 69 | Taking shape |
| 70 to 84 | Solid |
| 85 and up | Strong |

70 is where lead roles start to look at you. Self-reported proof counts for 70 percent until someone outside has read it. See [Honesty rules](../concepts/honesty-rules.md).

## The gap map

If you set a target role in the design, PR and communications, or marketing family, the three numbers above give way to an A to B gap map. It has one row per competency: where you are now, what the target role needs, and what sits between. Each number says whether it is Claude's estimate, not confirmed or confirmed. Until something confirms it, it stays an estimate. You can print the same distance from the terminal with `domain-gap.mjs`. See [Scripts](../reference/scripts.md).

## Claude's read

If Claude has diagnosed the earliest broken stage of your job search, the page names it, with one sentence of why. The road runs: CV ready, portfolio ready, applications, first interview. Claude works on the earliest broken stage first.

## Your CV

The CV panel shows a preview of one version at a time, with a version picker. Each version has a plain role:

| Role | Meaning |
|---|---|
| Working draft | Facts are still needed, or the honesty check fails. |
| Ready, not yet your CV file | It passes the check but is not promoted. |
| Your CV file | It is the CV saved as `app/cv/CV.html` and `CV.pdf`. |
| Ready, for a company | A version tailored to one job post. |

Under the status you see the facts still needed, each with where it sits. You also see any ATS result, labelled as an AI estimate. The status carries one command chip with the next step, for example `build my CV`, `fill in my CV`, `save my CV as a PDF`, `use this CV` or `tailor my CV for this job`.

If Edge is missing, use Print or save as PDF on this page. See [Build an honest CV](../guides/build-an-honest-cv.md).

## Your case studies

Each case study is one project, in one of five formats: `decision_log`, `six_part`, `star`, `problem_solution_impact` or `before_after_bridge`. Its status is `outline`, `draft` or `ready`. A case cannot be `ready` while a fact is still needed. Every part and every decision carries its sources and its missing facts. Say `write my case studies` and Claude works through one at a time.

## Applications

Log an application from here, or from the journal. Each row has a date, company, role and stage. You change the stage in the row.

| Stage |
|---|
| Applied |
| Screen |
| Portfolio review |
| Challenge |
| Final |
| Offer |
| Rejected |

An application counts as a market result only once someone replies. Until then it is a funnel count.

## Tools

A fold at the bottom lists the add-on skill files you have installed and what each found. See [Add a skill file](../guides/add-a-skill-file.md).

Related commands: `cv`, `cv build`, `cv tailor`, `cv ats`, `cv section`, `cv fill`, `cv export`, `cv promote`, `casestudy`, `apply`, `interview`, `outreach`, `portfolio`. See [Commands](../reference/commands.md). Next: [Journal](journal.md).
