# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Stack

Delegated: native Android, Kotlin + Jetpack Compose (AGP 8.7, Kotlin 2.0, Compose BOM 2024.12, minSdk 26, targetSdk 35). Chosen because the core of the product (reading incoming SMS, showing a popup over other apps, notifications, contacts) is deepest and most reliable as native Android APIs, and the user confirmed the app is Android only. Records are stored on the device in one JSON file (Store.kt); a sync service is needed only for friends who also have the app (provider undecided). Builds run through build.ps1, which also copies the APK to the "Split app - install on phone" folder on the Desktop.

## Users

The primary user lives in India and regularly pays for things that are shared: a Swiggy or Zomato order for the flat, a Blinkit or Zepto run, a District or Dineout table, a turf or court booked for a game. They pay first and then have to remember, work out and chase everyone's share. Their friends are the second audience: some use the app, many never will, and both kinds must still end up knowing what they owe.

## Product Purpose

The app notices money leaving the user's account for shared kinds of spending, asks right away whether to split it, and keeps an honest record of who owes whom. It turns "I paid ₹1,260 on Zomato" into "Rahul ₹420, Meera ₹420, me ₹420" in a few taps, and makes the follow-up message easy to send when the user chooses.

Success: no shared payment is forgotten, nobody has to do maths, and settling up takes one message.

## Positioning

Splitwise-style apps wait for you to type the expense. This one starts from the debit itself: it reads the bank or UPI SMS (and the ordering app's notification) the moment money goes out, recognises that it came from a split-prone service, and puts the split in front of the user while the moment is still fresh. Friends do not need the app for the record to exist.

## Operating Context

- **Trigger:** an incoming debit SMS from a bank or UPI app, or a notification from an ordering/booking app, with an amount and a merchant.
- **Services to recognise (starting list, to grow):** food delivery (Swiggy, Zomato), quick commerce (Blinkit, Zepto, Swiggy Instamart, Amazon Now), dining out (District, Swiggy Dineout, EazyDiner and similar), sports and venue booking (turf, court and game-booking apps), plus other group-spend categories to be added such as events, movies and rides.
- **Moment of use:** the user just paid, often while still with the group or right after an order. The prompt arrives as a popup and as a notification they can act on later.
- **Splitting:** split with a saved group or with individual people picked from contacts. A person can be added straight from the popup even if they are not a contact on the app.
- **Settling:** the app drafts a WhatsApp or SMS message with each person's share and a UPI pay link to the user. It can draft one message per person or one total for a group. The app never moves money itself.

## Capabilities and Constraints

- **Detect:** parse debit SMS and app notifications for amount, merchant and time; match the merchant to a known service; ignore debits that are not split-prone.
- **Prompt:** popup over the current screen plus an actionable notification for each detected payment. Dismiss, split now, or decide later.
- **Ledger (Splitwise model, 2026-10-23):** everything is an expense with who paid and what each person owes; anyone can be the payer. Settling up is a payment ("Rahul paid you ₹500"). Each person and group shows one net balance in words ("owes you", "you owe", "settled up"). Detected payments wait in "To split" until split or marked "Just me".
- **Groups:** named sets of people; a group's totals count splits whose people match its members exactly.
- **Settling:** Settle up records a full or partial payment either way (with undo); "Pay on UPI" opens the user's UPI app to pay someone they owe, using that person's saved UPI ID.
- **Alerts:** detection, the popup and the notification can each be switched off; the popup comes as a full card or a small strip.
- **Friends with the app:** the record syncs to them so they see the same entry.
- **Friends without the app:** nothing is sent automatically. The record stays on the user's phone as their own reminder. The user decides if and when to send a message, per person or as a total, and can keep the record without ever sending it.
- **Drafted messages:** WhatsApp and SMS first; other platforms through Android's share sheet. Messages open pre-filled in the other app; the user presses send there.
- **Payment:** UPI pay links (upi://pay with the user's UPI ID and the amount) inside drafted messages. No in-app payments, no holding money.
- **Privacy constraint:** SMS and notification reading happens on the device. Raw messages are never uploaded; only ledger entries the user chooses to share are synced.
- **Permissions:** the user grants the app full access (SMS, notifications, display over other apps, contacts), the way they already do for apps like Swiggy. The app reads SMS directly; permission onboarding must ask for each access clearly and explain why.
- **Open: Play Store listing.** Google Play reviews READ_SMS/RECEIVE_SMS use separately from what the user grants. This matters only when publishing on Play; personal installs are unaffected. Reading bank and app notifications through a notification listener is the fallback if Play refuses.
- **Open:** product name, sync service, how groups are formed with friends who have the app, handling of partial splits, refunds and cancelled orders.

## Brand Commitments

None yet. The name is undecided.

## Evidence on Hand

None. No users, testimonials, partner logos, merchant data or usage numbers exist. Do not show real company logos (Swiggy, Zomato, Blinkit and others) as endorsements or partnerships, and do not invent user counts or savings figures.

Merchant identification is wanted: each detected payment shows that service's icon (user decision, 2026-10-23). After tester feedback the same day, brand colour stays inside the icon only; cards are neutral and colour means money direction. The icon is read from the app installed on the user's phone, never bundled; a service that is not installed falls back to a lettered plate.

## Product Principles

1. **Catch it at the moment of payment.** The product's value is timing; the prompt must be fast, accurate and dismissible in one tap.
2. **The user decides what leaves the phone.** Nothing is sent to a friend without the user choosing to send it. Records can stay private reminders forever.
3. **Works with friends who never install it.** A person outside the app is a full citizen of the ledger, reached through messages the user already uses.
4. **No maths, no awkwardness.** The app computes shares and writes the reminder so asking for money feels light and fair.
5. **Never touches the money.** It points to UPI; it never holds, moves or charges anything.

## Accessibility & Inclusion

Amounts are in Indian rupees with Indian digit grouping (₹1,26,000). Drafted messages should read naturally to Indian users. No other specific requirement was established.
