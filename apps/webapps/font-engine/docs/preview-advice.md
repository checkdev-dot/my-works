# Preview advice: keep 2-3 fonts, see them in use

2026-11-03. Advice for the feature Dev described: after shaping a letter and getting results, keep two or three fonts, mark one as preferred, and see them inside real-looking UI and graphics with one quick toggle. Reads against `PRODUCT.md`, `docs/controls-v4.md` (sections 5.4, 6, 7, 8, 10), `components/Results.tsx`, `components/Editor.tsx` and `app/globals.css`. No code here.

Dev's two decisions, folded in: the kept fonts are **both** rivals and, on one switch, a pairing; and **all four template groups** matter (app or web screen; social and ads; print and brand; documents).

The one-line version: **a three-slot tray, a stage that replaces the sheet, two switches that each have exactly two positions (UI / Graphics, Compare / Pair), swap in place with the keys 1 2 3, and seven fixed templates where the typed word is the brand name.**

## 1. What "2-3 fonts, 1 preferred" means

Decided by Dev: the fonts start as **rivals** (three candidates for one job, each template set entirely in one of them) and can be turned into a **pairing** (preferred as headings, the second as body, an optional third as accent).

What this needs to stay fatigue-free: the pairing must come from the tray the person already filled, with no role picking. So:

- **Compare** (the default): the stage shows one kept font at a time, in every text role. The tray slots are rivals.
- **Pair**: the stage shows all kept fonts at once, roles assigned by the tray itself. Preferred = headings. The next slot in order = body. The third slot, if there is one = accent (kickers, labels, numerals strips, tracked caps lines). With two fonts kept, accent falls back to the headings font. With one font kept, Pair is not offered; the switch reads `Keep a second font to pair` in grey.

That is the whole role model. The person never names a role, never drags a font onto a heading, never sees the word "role". They see a switch with two positions and one `Swap` text button in Pair mode that exchanges headings and body (accent stays). If they want a different body font, they move preferred in the tray, which they already know how to do. Three fonts, one switch, one swap: every pairing of three fonts is reachable in at most three clicks, and the common one (preferred up top, second as text) is zero clicks.

Why Compare is the default: the product's question is "which real font is closest to the letter I shaped", and comparing whole templates in one font at a time is the harder, more honest test of that answer. Pair is the reward once the rivals have been judged.

"Preferred" means one thing in both modes: the font the stage shows first in Compare, the headings font in Pair, the one Get it points at, the one named in the share link. A default, not a verdict.

## 2. How choosing works

**One gesture: Keep.** Every result row gets a `Keep` text button next to `Get it`. One click adds that font to the tray. The row stays in the list and shows `Kept · 2`. Clicking `Kept` removes it. No drag, no modal, no star.

**Where the picks live: the tray.** A strip at the top of the right column, under the "Closest to this" heading and above Yours. Three slots drawn as hairline squares, each a third of the column wide. An empty slot reads `Keep one` in grey. A filled slot shows the typed word in that font at a fixed small size (about 22 px cap height), the family name under it at 13 px, and the match percentage in mono. The tray is visible in both the list and the stage, so the person never loses sight of what they are comparing.

**Preferred.** The leftmost slot is preferred by default (the first font kept). Each slot carries a small cobalt square in its corner, the same mark the app already uses for the carrier letter; the preferred slot's square is filled, the others are hollow and say `Prefer` on hover or focus. Click the square to move preferred. Nothing reorders; the slots keep their numbers so 1 2 3 on the keyboard stay stable. In Pair mode, the slots also show a one-word role under the name: `Headings`, `Body`, `Accent`, in grey, so the pairing is readable without opening the stage.

**When the tray is full.** `Keep` on a fourth row swaps out the slot that is neither preferred nor most recently shown, with a one-line notice under the tray: "Swapped out Inter for Manrope. Undo." Undo is Ctrl Z, the same stack the dials use.

**Yours takes part as the reference.** Yours is a fourth, fixed slot to the left of the three, hairline outline, labelled `Yours`, key `0`. It is always loaded (it is the clay family at the current settings), so the stage works before any match runs: shape a letter, press Preview, see your own letter on a dashboard. Yours cannot be removed or swapped out, but it can be preferred: it is a real font, and the spec already says so. In Pair mode Yours only takes part if it is preferred (then it is the headings font); otherwise it stays out of the pairing, because a pairing of four is a committee.

**Stale.** If the dials move after a match, Yours updates live. Kept fonts stay; a new match only changes the list. Tray, preferred and mode persist in localStorage and the URL hash with the rest of the state.

## 3. The two switches, and flipping between fonts

**Where the stage is.** Not in the 400 px column; too narrow for a real screen or a real poster. The stage takes the sheet. The sheet is already "one camera" in the spec; Preview is a third camera position. The word view, the rail and the grid fade; the template fills the sheet with the same 32 px gutters. The right column stays open and becomes the control strip: heading, the UI / Graphics switch, the tray with its Compare / Pair switch, the template thumbnails, then the results list continuing below so Keep is still reachable while previewing.

**UI / Graphics.** First thing under the column heading: a two-segment switch, plain words, no icons; the chosen segment ink on white with the cobalt underline the tiles use. Under the tray, the templates of the active side show as small named thumbnails in one row. Keys: `U` and `G` switch sides; Left and Right step through templates; `Esc` returns to the letter.

**Compare / Pair.** A second two-segment switch sitting on the tray's bottom edge, because it is about the fonts, not the templates. `Pair` is greyed with a reason until two fonts are kept. Key: `P` toggles. Switching modes keeps the current template; the stage re-sets in place with a hard cut, so the eye sees exactly which lines changed font. In Pair mode a single `Swap` text button appears beside the switch (key `S`).

**What happens on a side switch.** Crossfade to the first template of the other side, or to the one last used there this session. The selected font and the mode stay. 160 ms crossfade, no slide, no scale; hard cut under reduced motion. Both sides' templates stay mounted and hidden, so the switch feels like flipping a page, not loading one. Target: under 100 ms to first paint; the crossfade is the only thing the eye waits for.

**Flipping between fonts in Compare: swap in place, hard cut.** Primary and only method in v1: click a tray slot or press `0` `1` `2` `3`, and the whole template re-sets in that font with no animation. A hard cut is deliberate. Typographers judge two fonts by flicking between them on one layout, because the eye catches what moved: a wider a, a lower x-height, a heavier bold. Any crossfade blurs exactly the thing the person is here to see. The frame, every box and every baseline stays fixed (section 6), so only the letters change.

In Pair mode the number keys do nothing except pulse the slot; the only flip is `Swap`.

Considered and set aside:

- *Side by side.* Halves every template, so the phone becomes a toy and the poster a card. Also asks which two to compare: a decision. If designers ask later, make it `S` on the Document template only.
- *Blink.* Already in the spec for rows at 400 ms. On the stage it is a free bonus: hold `Space` to flip between the selected slot and the preferred one. Zero new UI. Ship it as a shortcut, never as the primary path.
- *Slot rail.* The tray is the slot rail. A second rail on the stage would put the same fonts on screen twice.

Discoverability, one sentence under the thumbnails: "Press 1, 2, 3 to swap fonts. P pairs them. Hold Space to flick back to your preferred one."

## 4. The templates

**How the four groups map onto the two modes.** UI is everything a person reads and uses on a screen: app and web screens, and documents (a press release page, a slide, a report page are read on screens before they are ever printed; and the Word user lives on a screen). Graphics is everything a person looks at as an image: social and ads, print and brand. So:

- **UI**: Dashboard (web), Phone (app), Document (press release, the Word case), Slide (deck or report page).
- **Graphics**: Poster (print), Social (post, story, banner), Brand (wordmark, business card, packaging label).

Seven templates, four and three. That is one more than six, and it is worth it because Document and Slide test different things (12 px body in a page against 24 px bullets at a distance) and both are where PR and marketing people actually put a font. Each side is still one row of thumbnails, seen in under a minute. Eight would start to look like a directory, which is what this product is against.

Rules for all seven:

- In Compare, every text role is the selected font. In Pair, each template names its headings, body and accent elements below; nothing else changes.
- Weights come from the family's named instances only, never synthetic bold. A one-weight family uses one weight and its slot says `One weight` in grey; that is a true finding, not a bug.
- Italic appears only where the family ships one. No line depends on italic to read.
- Content is real-feeling and specific to Dev's audience: designers, PR and marketing. No lorem ipsum, no "Acme", no real brands. The typed word is the brand or product name everywhere (section 5).
- Dates, money and percentages appear in every template, because numerals are where free fonts fall apart first and where marketers look first.
- Each template plants one long word where it has to survive (a tab label, a column header, a subline).
- Type on white paper or ink paper only. Colour is blocks and rules that never sit behind the candidate (section 6).
- Current, not generic: large type, generous space, hairline rules, square corners, one accent colour, and real 2026 patterns (dense tables with tabular figures, segmented controls, bottom tab bars, pill chips, stacked social cards). No drop shadows, no gradients, no rounded-everything.

### UI 1: Dashboard

A campaign dashboard for a small marketing team, 1280 by 800 on the stage.

- Left nav, 220 px: the typed word as the workspace name at 18 px semibold; six items at 14 px (`Overview`, `Campaigns`, `Press mentions`, `Audience`, `Reports`, `Settings`), the active one with the cobalt underline.
- Top row: page title `Spring launch` at 28 px; a segmented control `7 days · 30 days · Quarter`; a filled button `Export report` and a ghost button `Share`.
- Four KPI tiles: `Open rate 42.8%`, `Press mentions 127`, `Reach 1,284,900`, `Budget left €18,250`; number at 36 px semibold, label at 13 px, delta `+3.4 pts vs last week` at 13 px.
- A table of eight rows: campaign, channel, `14 Apr 2026`, open rate, clicks, status chip; 14 px, tabular figures, right-aligned numbers. One column header is `Impressions`.
- A toast: `Report sent to 4 people` with an `Undo` text button.

Pair: headings = workspace name, page title, KPI numbers. Body = nav, table, buttons, toast. Accent = KPI labels and the status chips.

Reveals: numerals at three sizes and whether they are tabular; 13 px labels; weight range; button text; whether the font looks like a product or a poster when used small. In Pair, whether a display font's numbers can sit above a text font's table.

### UI 2: Phone

A 390 by 844 phone frame, two screens side by side; one is too little evidence, three is a gallery.

Screen A, onboarding: the typed word as the app name at 32 px bold; a 17 px sentence, "Every press mention, every post, every number, in one place."; three list rows at 15 px with a 13 px second line (`Track coverage` / `Across 40 outlets`, `Draft the next post` / `From what worked`, `Share the week` / `One link for the team`); a primary button `Get started`; a text button `I already have an account`.

Screen B, a feed: header `Mentions` at 22 px; four cards with outlet name at 13 px, headline at 16 px, `2 h ago`, `1,204 shares`; a bottom tab bar with five 10 px labels: `Home`, `Mentions`, `Calendar`, `Reports`, `Settings`.

Pair: headings = app name, screen header, card headlines. Body = everything else. Accent = tab-bar labels and time stamps.

Reveals: x-height at 13 and 10 px, the hardest test in the set; whether bold is really bold at 32 px; wrapping at 17 px; how the font sits in a tab bar, where almost every display font dies. In Pair, whether the accent font reads at 10 px at all; if not, the person has learned the right thing.

### UI 3: Document

An A4 page at screen scale, the Word case, a press release.

- Letterhead: the typed word as a wordmark at 28 px; an address line at 10 px.
- `FOR IMMEDIATE RELEASE` at 11 px, tracked.
- Headline at 24 px, two lines: "The typed word opens a studio in Hamburg and names Lena Okafor head of communications".
- Dateline `Hamburg, 3 November 2026 —` running into the first paragraph.
- Three paragraphs at 12 px, 1.45 line height, about 90 words each, real prose; one carries `a 38 percent lift`, one carries `responsibilities`.
- A pull quote at 16 px (italic only if the family has it, else regular with a left rule).
- `About the typed word` boilerplate at 11 px, and a contact block: name, `+49 40 123 456 78`, `press@hamburg.studio`.

Pair: headings = wordmark, headline, pull quote. Body = paragraphs, boilerplate, contact. Accent = the release line and dateline.

Reveals: body texture at the size press releases are actually read; the size ladder 10 → 12 → 16 → 24 → 28 on one page; phone numbers and email addresses; whether a PR person could live in this font in Word.

### UI 4: Slide

Two 16:9 slides, stacked small enough to read as a deck.

- Title slide: the typed word at 20 px top left as the deck brand; a title at 64 px, "Q2 press review"; a subtitle at 28 px, "What earned coverage, what did not, what we do next"; a date and presenter line at 18 px.
- Content slide: a heading at 40 px, "Three numbers that changed the plan"; three columns, each a number at 72 px (`127`, `42.8%`, `€18,250`) with a 20 px label and a two-line 18 px note; a footer at 14 px with the typed word and `12 / 24`.

Pair: headings = title, slide heading, the three numbers. Body = subtitle, notes, footer. Accent = labels and the page counter.

Reveals: reading at distance, which is a different test from reading at 12 px; headline rhythm at 64 px; giant numerals; how a text font looks when there is nothing else on the page to hide behind.

### Graphics 1: Poster

A 2:3 poster, about 560 by 840, white paper with Ink one click away.

- The typed word at the largest size that fits the width on one line, heaviest instance.
- The same word under it at the lightest instance, same size, so the extremes of the weight range sit together. One-weight families drop the line and keep the space.
- A date line in caps at 20 px, tracked: `THURSDAY 18 JUNE 2026 · 19:00`.
- A venue line at 16 px: `Kunsthalle, Deichtorplatz 1, 20095 Hamburg` (the city, not the typed word, so the long German word is always there).
- A numerals strip at the foot, 14 px: `0123456789 €£$ 14:00 2026`.
- One cobalt square in a corner, behind nothing, as the only colour.

Pair: headings = the two big words. Body = venue line. Accent = date line and numerals strip.

Reveals: letterforms at display size, where every wobble shows; caps with tracking; the weight range at a glance; numerals; how much character the font has alone on a page.

### Graphics 2: Social

Three pieces at true proportions, scaled to fit: a 1:1 post, a 9:16 story, a 970 by 250 banner ad.

- Post: a quote at 34 px over four lines, "We stopped chasing coverage and started earning it."; the handle `@hamburg` (the typed word) at 16 px; `12.05.2026`.
- Story: the typed word at 72 px bold; a three-line statement at 28 px; a pill `Swipe up` at 16 px.
- Banner: the typed word at 24 px as the brand; a line at 20 px, "Press, posts and numbers in one place"; a button `Start free` at 14 px; the tiny legal line at 9 px, `Offer ends 30.06.2026`.
- Under the three, the post again at 120 px wide, as a feed thumbnail. Marketers decide at thumbnail size.

Pair: headings = quote, story word, banner brand. Body = statement, banner line, button. Accent = handle, date, legal line.

Reveals: mid-size headline setting; a handle and a domain, the lower-case string every brand lives with; a banner's 9 px legal line; whether the font stays itself squashed into a story column and shrunk to a thumbnail.

### Graphics 3: Brand

One sheet, the thing a designer hands a client.

- The typed word as a wordmark at three sizes (120, 48, 18 px), to show it survives at favicon size.
- A business card, 85 by 55 mm scaled: `Lena Okafor`, `Head of Communications`, `+49 40 123 456 78`, `lena@hamburg.studio`. Phone numbers are the quiet killer of numerals.
- A packaging label, 90 by 120 mm scaled, for a coffee bag or a candle: the wordmark; a product name at 22 px, `Morning roast`; a weight line `250 g · Net wt 8.8 oz`; a four-line ingredients paragraph at 8 px, the smallest text in the whole set; a batch line `Lot 2026-11 · Best before 03.05.2027`.
- A tagline at 20 px in the family's second weight.
- A tracked caps line at 11 px, `BRAND · PRESS · CAMPAIGNS`.

Pair: headings = wordmark, product name. Body = card details, ingredients, batch line. Accent = tagline and caps line.

Reveals: wordmark potential; the font as a system across sizes; 8 px legibility on a label; the second weight; small caps lines; whether this is a font a small business can put on everything.

### Why not more

Cut: a settings form (buttons and labels already in Dashboard and Phone), an email newsletter (covered by Document and Social), a landing page (covered by Dashboard's buttons and Slide's big type), a second poster size. If usage shows a gap, the first addition is a landing page hero, because designers will ask for it.

## 5. The typed word, and what is fixed

**The word is the brand.** Whatever is in the top bar is the brand or product name in every template: workspace in Dashboard, app name on Phone, wordmark and headline subject in Document, deck brand on Slide, the big line on Poster, handle and brand in Social, wordmark on Brand. That is the thread from the letter they shaped to the thing they would ship. "Hamburg" makes a credible studio name; nearly any word does. If the word is a sentence, its first word is the brand and the whole sentence replaces the Poster's second line, the Social quote and the Slide subtitle.

**Everything else is fixed.** No editable fields on the stage in v1. The content was written to test the font, and every field someone edits is a decision they did not come here to make. Two exceptions, both already in the spec:

- One text area in the right column, `Your own paragraph`, reusing the paste box the spec gives Try. It feeds the Document paragraphs, the Social quote and the Slide notes.
- Paper: `White` and `Ink`, one toggle under the thumbnails. Nothing else.

The word is set as typed, never forced to caps; caps lines use fixed text.

## 6. States, motion, and what must never happen

**Loading.** Result rows load through the Google Fonts CSS API with `text=` set to the word, so they lack the full alphabet. Keep triggers a full Latin subset load for that family at the instances the templates use: regular, semibold or bold, light if present, italic if present. The slot shows the word in the row's subset at once and a hairline progress bar along its bottom until the full set is in. The slot is not selectable on the stage until then; its key only pulses the bar. The stage shows Yours until the preferred font is ready, then cuts. Preferred loads first, then the others in slot order. Pair is not offered until every font in the pairing is ready.

**Never a fallback font.** Every text element on the stage renders only after `document.fonts.load` resolves for that family and weight. Until then the frame shows its boxes with hairline bars at each text block's x-height, the device the rows already use. A fallback font on the stage is worse than a blank stage: the person judges the wrong font for a second and the wrong judgement sticks.

**Never a layout jump.** Every template is a fixed grid of fixed-height boxes. Text sits in boxes with explicit pixel line heights, not multiples of the font's metrics, so a tall-ascender font shows tighter leading instead of pushing the box. Headlines may wrap differently; the box holds two lines whether one or two are used. Clipping is allowed only on the Poster word, sized to fit once per font per word before paint. Templates never normalise x-height; that is deliberately the opposite of the results rows, which match x-height. Rows compare shape; the stage compares use. Switching Compare to Pair changes fonts in some boxes, never the boxes.

**Swap motion.** Font swap, mode switch and Swap: no transition, a hard cut in one frame. Template switch within a side and side switch: 160 ms crossfade. Enter Preview: the word view fades out over 200 ms while the stage fades in; the right column does not move. Exit: reverse. Reduced motion: hard cuts throughout. No letter FLIPs on the stage; those belong to the letter view.

**Colour behind specimens.** Type sits on white (`#fff`) or ink (`#14161a`) only. Colour is blocks, rules and chips beside type, never under it. The cobalt the app reserves for marks is the one accent. Saturated paper flatters or punishes a font by contrast and hides the thing being judged. If Dev wants brand colour later, add it as a third paper with a contrast readout and a word (`4.6:1, fine`), not a free picker.

**Stale and empty.** Empty tray: the stage opens with Yours and the thumbnails say "Keep fonts from the list to swap them in here." Dials change while the stage is open: Yours updates live and shows a cobalt `changed` square. A font fails to load: its slot reads `Did not load · Try again` and the stage never switches to it; in Pair mode its role falls back to the preferred font and the slot says so.

**Keyboard and screen readers.** Every stage action has a key and a word. The stage region announces "Preview, Dashboard, in Manrope" or, in Pair, "Preview, Dashboard, Manrope headings, Inter body". A swap announces the family names only. The tray is a radio group for preferred and a toolbar for selection.

**Never.** Never render a template with any text outside the kept fonts. Never synthesize bold or italic. Never animate a font swap or a mode switch. Never resize a box to the font. Never show a template before all its weights have loaded. Never put colour under type. Never ask the person to assign a role.

## 7. Personas

| Persona | Would they use it | What makes them stop |
|---|---|---|
| General person | Yes, more than the letter editor. Seeing "my word" on a phone and a poster is the moment the tool makes sense. | A template that looks like a template. Any field that asks them to type. Pair, if it ever asks "which font for what". |
| Designer | Yes, daily, if the templates are good enough to screenshot into a deck. Pair with Swap is a pairing tool they do not have. | Synthetic bold, a fallback flash, x-height normalised on the stage, no keyboard swap. |
| Someone designing in Word | Yes, for Document and Slide; 12 px body on a page is their whole question. | No way to know which weight Word will get. Get it must name the named instance, as the spec already says. |
| PR person | Yes, for Document, Social and Brand; they judge at thumbnail and on a press release. | Landing on Dashboard first. Remember the last template per session, and open on Document when the tray's preferred font is a serif. |
| Marketer | Yes; Dashboard, Social and the banner are their world. Numerals and thumbnails decide it. | Fake-looking numbers, lorem ipsum, no banner, no thumbnail view. |
| Small business owner | Yes; Poster, the business card and the packaging label are what they came for. | Tray full logic they cannot see; anything called "instance" or "axis". |
| Student | Yes, to explore. Document teaches body texture without the term; Pair teaches pairing without the lecture. | Nothing to export. Get it on the preferred font must be one click from the stage. |
| Developer | Yes, for Dashboard and Phone, to check tabular figures and 13 px labels. | No CSS from the stage. The spec's Website chip should be reachable from the tray. |
| Low vision | Partly. The stage's small sizes are small by design. Big mode must scale chrome, not templates. | Big mode scaling template text; chrome under 14 px; a swap without an announcement. |
| Brand manager at an agency (chosen) | Yes, to argue with a client. Hard-cut swap between three candidates, then Pair, is exactly their meeting. | No way to share the tray. The URL hash must carry the kept fonts, preferred and mode. |
| Indie app maker (chosen) | Yes; Phone is the whole decision for them. | One phone screen. Two is the minimum; dark mode is the next ask (Ink paper covers it). |
| Teacher making handouts (chosen) | Yes, for Document and Brand, to pick one font for a term of PDFs. | Content too corporate to picture a classroom in. Document's prose should read as general, not marketing-only. |

## 8. Risks, ranked

1. **The templates look generic, and the feature reads as a specimen page.** This is the whole risk. Mitigation: build each template as a real screen from a current product, with written content and numbers that feel observed; review each with `/impeccable critique` at desktop size before the tray exists; cut any template a designer would not screenshot.
2. **Pair quietly reintroduces decisions.** Someone will ask for "accent as headings" or a fourth role. Mitigation: hold the line at order-is-role, one Swap, nothing else; log the asks and revisit only if the same one appears five times.
3. **Fallback font or layout jump on swap.** Mitigation: manual `FontFace` loading per weight, fixed boxes, hairline placeholders, and a test that presses 0 1 2 3 and P a hundred times and diffs box rects.
4. **One-weight or no-italic families look broken inside templates.** Mitigation: templates written to degrade (weight line drops, quote loses italic) plus the grey slot note. Never synthesize.
5. **Keep adds a third control to a row that already has Get it, Compare, Try, Not this, Close, Not close.** Mitigation: Keep and Get it are the only two visible text buttons on a row; the rest live on hover or under the Try expansion, as the spec allows.
6. **Yours in the tray confuses "kept fonts" with "my shape".** Mitigation: a different outline, the label Yours, position left of the three, never counted in "3 kept", and out of Pair unless preferred.
7. **Full Latin subsets at three weights per kept font are slow on first Keep.** Mitigation: preferred first, bars in the slots, swap disabled until ready, browser cache; measure and report the median in `library-v1-results.md` style.
8. **Seven templates still feel like a directory.** Mitigation: one row of thumbnails per side, names not pictures of UI, remember last used, and watch the first ten sessions; if nobody opens Slide or Brand, fold them.
9. **The stage replaces the letter view and people lose their place.** Mitigation: Esc and a `Back to the letter` text button at the top of the stage; the word view's state is untouched; the stage opens from one button beside `Closest to this`.
10. **Big mode or small windows break template proportions.** Mitigation: the stage scales each template as one unit to fit, with a mono readout `shown at 82 percent`; Big mode touches chrome only.
11. **Colour creep.** Mitigation: refuse in v1 and put the contrast-readout paper in the backlog as a planned feature, not a hole.

## 9. What to build first

The smallest version that feels complete:

1. **Keep and the tray.** Keep on every row, three slots plus Yours, preferred by the cobalt square, swap-out with Undo, state in the hash and localStorage.
2. **The stage with UI / Graphics** and one template a side: **Dashboard** and **Poster**. Dashboard tests numerals, labels, buttons and weight range in one frame; Poster is the fastest to make beautiful and the most honest at display size. With these two the toggle already means something.
3. **Compare only, hard-cut swap** by click and 0 1 2 3, hold Space to blink, Esc back.
4. **Loading done right**: hairline bars, no fallback, no jump.

That is shippable. Then, in this order: Phone (the small-size test is the second most valuable thing in the set), **Pair with Swap** (once two templates and the tray have proven themselves; it is a mode on top of fixed boxes, so it is cheap by then), Document, Social, Slide, Brand, the paste box, Ink paper.

Do not start with all seven templates or with Pair. One good Dashboard and one good Poster will tell Dev within a day whether the stage earns its place.
