# Split attention map

Date: 23 Oct 2026

**Why:** every list in the app used the same raised box: people, groups, activity, payments to split. Nothing told the eye what mattered, so the app read as crowded. This map scores every element, gives it a visual tier, and caps how much attention each screen may ask for at once.

## 1. The method

### 40 points per element
Each element is scored on four questions, 0–10 each, for 40 points in all:

| Factor | Question |
|---|---|
| **F**requency | How often does someone look at or use this? |
| **C**onsequence | How much money or how big a decision rides on it? |
| **U**rgency | Does it need an answer now? |
| **R**ecognition | Must it be found at a glance, without searching? |

### Five tiers from the score

| Score | Tier | What it looks like |
|---|---|---|
| 32–40 | **T1 Hero** | The biggest figure or action on the screen, 40–56 sp numerals, sitting straight on the ground. One per screen. |
| 24–31 | **T2 Card** | A raised card with a lip: 17 sp title, 20 sp amount. Things you act on. |
| 16–23 | **T3 Line** | A plain line with no box, separated by a hairline: 15 sp title, 17 sp amount. Things you read. |
| 8–15 | **T4 Quiet** | Small muted text, caps labels and small buttons, 11–13 sp. |
| 0–7 | **T5 On demand** | Not drawn until asked for: behind a tap or removed. |

### The 40-point screen budget (density)
Whatever is visible at once, in one phone-height view, may cost **at most 40 attention points**:

| Tier | Cost |
|---|---|
| T1 | 10 |
| T2 | 5 |
| T3 | 2 |
| T4 | 1 |
| T5 | 0 |

When a view goes over budget, the lowest-scoring T2 items drop to T3, or the list folds behind "See all". Never more than one T1 per screen.

## 2. The 40 nodes

| # | Screen | Element | F | C | U | R | Score | Tier |
|---|---|---|---|---|---|---|---|---|
| 1 | Home | What you're owed (dial + figure) | 9 | 8 | 5 | 10 | **32** | T1 |
| 2 | Home | What you owe (beside it) | 7 | 8 | 5 | 7 | 27 | T2, inline in the hero |
| 3 | Home | "Split" title | 3 | 1 | 0 | 5 | 9 | T4 |
| 4 | Home | Alerts / Finish setup | 2 | 3 | 4 | 4 | 13 | T4 |
| 5 | Home | A person with an open balance | 9 | 8 | 5 | 8 | **30** | T2 |
| 6 | Home | "On Split" tag | 4 | 3 | 0 | 5 | 12 | T4 |
| 7 | Home | See all people | 5 | 3 | 1 | 5 | 14 | T4 |
| 8 | Home | A group | 7 | 6 | 3 | 7 | 23 | T3 |
| 9 | Home | Group "₹ spent" context | 3 | 2 | 0 | 3 | 8 | T4 |
| 10 | Home | A payment to split | 6 | 8 | 7 | 6 | 27 | T2 |
| 11 | Home | Just me / Split on that payment | 6 | 7 | 7 | 6 | 26 | inside #10 |
| 12 | Home | Add expense button | 8 | 7 | 4 | 9 | 28 | T2, floating |
| 13 | Home | Section labels | 6 | 1 | 0 | 6 | 13 | T4 |
| 14 | Home | "+" add person / new group | 3 | 3 | 1 | 4 | 11 | T4 |
| 15 | Person | Their balance | 9 | 9 | 5 | 9 | **32** | T1 |
| 16 | Person | Remind | 6 | 7 | 5 | 6 | 24 | T2 |
| 17 | Person | Settle up | 5 | 9 | 4 | 6 | 24 | T2 |
| 18 | Person | Add expense with them | 3 | 5 | 1 | 3 | 12 | T4 |
| 19 | Person | An activity line | 6 | 5 | 1 | 4 | 16 | T3 |
| 20 | Person | Lent / borrowed amount on it | 6 | 6 | 1 | 5 | 18 | T3 |
| 21 | Person | A payment line | 4 | 7 | 1 | 4 | 16 | T3, green amount |
| 22 | Person | "Tap any line" hint | 1 | 1 | 0 | 2 | 4 | T5 |
| 23 | Group | The group's balance with you | 8 | 8 | 4 | 8 | 28 | T1 on its screen |
| 24 | Group | Member chips | 6 | 6 | 3 | 6 | 21 | T3 |
| 25 | Group | Add expense | 6 | 6 | 3 | 7 | 22 | T3, upgraded to T2 as the screen's main action |
| 26 | Group | Remind | 4 | 6 | 4 | 5 | 19 | T3 |
| 27 | Group | Change icon | 1 | 0 | 0 | 2 | 3 | T5 |
| 28 | Expense | Total | 8 | 7 | 2 | 8 | 25 | T1 on its sheet |
| 29 | Expense | Each share | 6 | 7 | 1 | 5 | 19 | T3 |
| 30 | Expense | Edit / Delete | 5 | 6 | 2 | 6 | 19 | T3 buttons |
| 31 | Editor | Title + amount | 9 | 9 | 6 | 9 | **33** | T1 |
| 32 | Editor | "Paid by you · split equally" | 7 | 9 | 5 | 8 | 29 | T2 |
| 33 | Editor | Who's in, with each share | 9 | 9 | 6 | 8 | **32** | T2 cards (the task itself) |
| 34 | Editor | Group chips | 6 | 5 | 4 | 6 | 21 | T3 |
| 35 | Editor | "Others owe you ₹" footer | 7 | 8 | 5 | 7 | 27 | T2 |
| 36 | Editor | Save / Split | 9 | 8 | 7 | 10 | **34** | T1 action |
| 37 | Editor | "Left to assign" warning | 3 | 9 | 9 | 7 | 28 | T2, only when not ₹0 |
| 38 | Popup | Payment detected card | 7 | 9 | 10 | 9 | **35** | T1 |
| 39 | Alerts | Alert switches | 2 | 6 | 1 | 4 | 13 | T4 |
| 40 | Alerts | Smarter detection (Jev) | 1 | 6 | 1 | 4 | 12 | T4 |

## 3. Budgets, before and after

| Screen (first view) | Before | Over by | After |
|---|---|---|---|
| Home | Hero 10 + 5 people cards 25 + 2 headers + tags + buttons ≈ **44** | 4 | Hero 10 + 3 people cards 15 + group lines (3 × 2) 6 + labels and buttons 5 = **36** |
| Person | Headline + 3 buttons + 6 boxed activity rows (6 × 5) ≈ **51** | 11 | Hero 10 + Remind and Settle up 10 + 6 activity lines 12 + labels 3 = **35** |
| Group | Headline + 2 buttons + chips + 4 boxed rows ≈ **47** | 7 | Hero 10 + Add expense 5 + Remind 2 + chips 2 + 6 lines 12 + labels 3 = **34** |
| Expense editor | Header + sentence + chips + 3 cards + footer + button ≈ **47** | 7 | Header 10 + sentence 5 + chips 2 + 3 cards 15 + footer and Save folded into one bar 5 = **37** |
| Expense sheet | ≈ 30 | 0 | unchanged, shares become lines |

## 4. What changes in the app

1. **Activity stops looking like people.** Activity lines lose their boxes (T3). They become plain lines under date labels ("Today", "This week", "Earlier"), with a hairline between them.
2. **Every list is lines on one quiet panel.** People, groups, To split and who's in all use this, so a screen is a few calm blocks rather than many boxes. (Revised after testers still found the cards cluttered: people were raised cards in the first build.)
3. **Home shows 4 people**, the largest balances. The panel's last line, "See all 7 people", opens everyone. This keeps home within budget.
4. **One hero per screen**, drawn larger and without a box:
   - **Home:** what you're owed.
   - **Person:** their balance.
   - **Group:** your balance in it.
   - **Expense:** the total.
   - **Editor:** the amount.
5. **Quiet section labels** (T4): small caps text and a count. The tick rule stays only on the three home sections.
6. **Removed (T5):** the "Tap any line" hint, the "tap the icon to change it" hint, and the group's spent figure on home. The spent figure stays on the group screen.
7. **Buttons by tier:**
   - **T2:** the one main action per screen, a cream keycap.
   - **T3:** secondary actions, a ghost keycap.
   - **T4:** small text buttons ("Add", "See all", "Just me").
