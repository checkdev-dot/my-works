# Split vs Splitwise: why testers found Split confusing, and what to change

Date: 23 Oct 2026

## 1. What this is based on

| Source | What it tells us | How sure |
|---|---|---|
| Splitwise public API docs (dev.splitwise.com) | Their exact data model: users, friends, groups, expenses, payments, debt simplification | Observed, primary source |
| Splitwise App Store listing and third-party how-to guides | The split options and the settle-up flow as people describe them | Secondhand; menu labels not confirmed |
| Our own code (`data/Models.kt`, `ui/MainActivity.kt`, `ui/FriendsScreen.kt`, `ui/SplitActivity.kt`) | How Split works today | Observed |

**What was not done:** reverse engineering the Splitwise APK with REA (`/reverse-engineer-anything`). Two things are missing:

1. **The APK.** The emulator's Play Store isn't signed in, and APK mirror sites aren't a safe source. The clean route is your own phone: install Splitwise from the Play Store, plug the phone in with USB debugging on, and I pull the APK with `adb`.
2. **A decompiler for REA.** REA's Android tools need a `jadx-headless-mcp 0.7.1` JAR, which isn't set up on this PC.

What REA would add: Splitwise's exact screen names, split-type labels and settle-up wording. The data model below already comes from their own API docs, so the conclusions shouldn't change.

## 2. Splitwise's mental model in six ideas

1. **Everything is an expense.** An expense has a total, a date, a description, a category, and one line per person saying what they **paid** and what they **owe**. Their net is paid minus owed.
2. **Anyone can be the payer**, and an expense can have several payers.
3. **Settling up is also an expense.** A payment is an expense flagged `payment: true`, recorded as "Rahul paid you ₹500". It is never "tick off this one dinner".
4. **One number per person.** Each friend shows one net balance across every group and expense: "Rahul owes you ₹904" or "You owe Meera ₹210". A group shows the same thing per member.
5. **Simplify debts** (on by default per group) turns a web of pairwise debts into the fewest transfers. They keep both versions: `original_debts` and `simplified_debts`.
6. **Three places to look.** Friends (balances per person), Groups (balances per group), Activity (a feed of everything that happened). One always-visible **Add expense** button, and **Settle up** on every person and group.

The add-expense screen reads as one sentence: **"Paid by _you_ and split _equally_."** Each blank is a tap target. Split options: equally, exact amounts, percentages, shares, and adjustment ("+₹200 for Rahul, the rest equal").

## 3. Where Split differs, and what to do about it

| Split today | Splitwise | Verdict |
|---|---|---|
| Two money objects: `SplitRecord` (from a detected payment, you always paid) and `Debt` (a hand-made record) | One object: an expense with paid/owed per person | **Restructure.** Merge them into one `Expense`. A hand-made record becomes an expense too. |
| You are always the payer | Any payer | **Restructure.** Add "Paid by". Default: you for detected payments, pick for manual ones. |
| Settling = striking off individual shares (open / reminded / settled plates) | Settling = recording a payment against the person's total | **Restructure.** Add "Settle up" per person: "Meera paid you ₹___". Keep striking off one share as a shortcut that records a payment of that exact amount. |
| "To recover" and "I owe" kept separately, never netted | One net number per person | **Restructure.** Home and person screens show one net figure per person. Keep the two totals only on the home summary. |
| Home: dial + people stacks + group cards + payment deck, all on one screen | Friends / Groups / Activity tabs | **Restructure.** Keep one home but give it a plain order (see section 4). Bring back an Activity list. |
| Words: "To recover", "Not shared", "Later", "record", plates, keycaps | "Owes you", "You owe", "Settled up", "Add expense", "Settle up" | **Rename.** Use Splitwise's words. People already know them, and that's the point. |
| Split modes: equal, shares, percent | Equal, exact, percent, shares, adjustment | **Add** exact amounts (the editor already supports one-person overrides) and adjustment. |
| Detected payments arrive in a popup and a deck on home | Nothing; Splitwise has no detection | **Keep. This is our edge.** Rename the deck to **"To split"** and make it an inbox with a count. |
| Groups with icons, people search sheet | Same idea | **Keep.** |
| Reminders drafted later from a person or group | "Remind" from a balance | **Keep.** Already matches. |
| Sync tag for friends on the app | Server sync | **Keep.** No change to the model it rides on. |

## 4. The simpler Split

**Model:**
- `Expense` with total, date, merchant/description, category, group (optional), `source` (sms / notification / manual), and lines of `{ person, paid, owed }`.
- A settle-up is an `Expense` with `payment = true`.
- Balances are computed (paid minus owed), netted per person, and optionally simplified per group.
- `Payment` (a detected debit) stays as the inbox item. Splitting it creates an `Expense`.

**Home, top to bottom:**
1. **Summary line:** "You're owed ₹9,782 · You owe ₹210". The dial can stay as the visual for the first number.
2. **To split (3):** detected payments waiting for an answer. Each has **Split** and **Not shared**. "Later" just leaves it here.
3. **People:** one row each, with avatar, name and net balance in plain words ("owes you ₹904"). Search sits on top.
4. **Groups:** same row pattern ("Flat 302 · you're owed ₹1,530").
5. A floating **Add expense** button, always there.

**Person / group screen:** net balance at the top, then **Settle up** and **Remind**, then the activity list (expenses and payments, newest first).

**Split screen** (from the popup or Add expense): amount, then the sentence **"Paid by you · split equally between 3"**, each part tappable, then who's in.

## 5. Jev: smarter detection (design only, nothing built)

**What Jev is:** a hosted classification model from TypeSafe. You give it text and a set of questions with fixed answers, and it returns:
- yes/no with a calibrated probability
- a pick from a list, with a probability for each option
- a 0–10 score

It is early access, through TypeSafe's waitlist, OpenRouter or Vercel's AI Gateway. **It can't be installed on the phone**; it's an API call. Its exact request format isn't public in what I found, so nothing here invents one.

**The privacy conflict:** the app and the video promise "Read on your phone. Never uploaded." Sending SMS text to Jev would break that. The design keeps the promise:

1. **Rules first, on the phone.** The existing parser (`detect/DebitParser.kt` + `Merchants.kt`) handles every known merchant. Most debits never leave the device.
2. **Only the unknowns go to Jev**: a merchant string the rules don't recognise, such as "VPA turfnation@ybl" or "BOOKMYSHOW*EVT".
3. **Minimal payload.** Send only the merchant string, the amount band (e.g. "₹1,000–2,000") and the time of day. Never the account number, reference number, bank name or full message.
4. **Off until you turn it on.** It's a switch in Alerts: "Smarter detection: sends only the shop name to classify it." The privacy line becomes **"Your messages stay on your phone."**

**Questions to ask Jev** (all three answer types):

| Question | Type | Use |
|---|---|---|
| Is this spend usually shared with friends? | yes/no | The main gate |
| Which kind of place is it? food delivery / quick commerce / dining / sports & venues / events / rides / personal shopping / bills & utilities / transfer to a person | pick | Category, icon, and suggested group |
| How likely is this to be split? | 0–10 | Ranking in the To split inbox |

**What the app does with the answer:**
- P(shared) ≥ 0.75: popup and notification.
- 0.4 to 0.75: goes quietly into **To split**, no popup.
- Below 0.4: ignored, but searchable.

**Learning from the user:** every Split or Not shared is stored locally against the merchant. Next time the local rule wins and Jev isn't asked. Jev's job shrinks the more you use the app.

**Cost and speed:** the reported cost is about $0.0007 per check, so a few hundred unknown merchants a year costs almost nothing. Batch checks if several arrive together.

## 6. Questions for the testers

Their answers decide which fixes come first:
1. What were they trying to do when they got stuck: add something by hand, see who owes them, or mark someone as paid?
2. Did the dial and the stacks read as "money people owe me"?
3. Did they understand "Not shared" and "Later" on the popup?
4. Did anyone need to record that someone else paid?

## 7. Open question for Jev

A VPA such as `rahul.m@okaxis` can be a person, not a shop. Before Jev is connected, the app should skip names that look like a person's UPI handle, or ask Jev a fourth question ("Is this a business or a person?") and drop person handles from anything sent.

