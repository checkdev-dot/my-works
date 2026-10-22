# Attention tiers

The app has one rule for what it shows you: one thing first. It does not show a wall of notifications. A single function, `deriveAttention` in `app/lib/attention.mjs`, decides what needs you and how much. Every screen reads from it, so the badge, the sheet, the Tonight row and the Commands sentence always agree.

Every item comes from a real field in your data. Nothing is invented.

## The four tiers

| Tier | Label in the app | Counted? | What goes here |
|---|---|---|---|
| `now` | Now | Yes | Things only you can unblock right now. |
| `today` | Today | Yes | Things to look at today. |
| `week` | This week | No | Good to do this week. |
| `fyi` | Good to know | No | Small, optional things. |

Only `now` and `today` items add to the number you see. The rest are summed up as "N more, not in the count".

## What lands in each tier

| Item | Tier | Comes from |
|---|---|---|
| Questions from Claude | Now | Intake questions in `profile.json` that have no answer yet. |
| Replies from Claude | Now | Reviews, scored tests, briefs and queue replies you have not seen on this device. |
| Start your onboarding | Today | Onboarding is not started, or paused. Not shown while questions wait. |
| Things queued for Claude | Today | Queue items with status `pending`. The action is `answer it`. |
| Tasks from earlier days | Today | Tasks still `todo` from an earlier day this week, minus tonight's path. |
| Proof waiting for a reader | This week | Proof items that are `done` but not yet `verified`. |
| Picks you have not looked at | This week | This week's scored library picks with status `new`, while none is kept or done. |
| Your Library needs a refresh | This week | `library.refreshed` is missing, or over 14 days old. |
| A skill has no evidence yet | This week | The active skill bet's focus has no evidence. |
| A thought from a designer | Good to know | A new trinket. |
| A podcast pick | Good to know | A new podcast pick. |

Tonight's path is the page itself, so it is never an item and never counted. A task is counted once, at its highest tier.

## How the list is sorted

1. By tier: now, today, week, then good to know.
2. Inside a tier, the oldest dated item first.
3. Dated items before undated ones.
4. Then by id, so the order never jumps.

## How many show at once

Only the top three counted items show on a screen, at most three from each tier. The rest sit behind "later". This is the one-thing-first rule: you see the smallest set that lets you act.

## One sentence everywhere

The summary line reads like this:

```
2 things need you: 1 question, 1 reply.
```

If nothing is counted, it says "Nothing needs you." Each row also says how long it has been open: "new today", "open since yesterday" or "open 3 days". There is no failure framing and no mention of missed nights.

## Why tiers instead of notifications

- A short list you can finish beats a long list you scan.
- Waiting on Claude is shown as waiting. It is never your to-do.
- Optional things stay optional. A podcast pick never counts against you.

The consistency of these tiers is covered by `attention-check.mjs`. See [Scripts](../reference/scripts.md). To see each page, read [Tonight](../app/tonight.md) and [The Commands page](../app/commands-page.md).
