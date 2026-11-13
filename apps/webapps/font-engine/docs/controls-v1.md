# Controls v1: how a person shapes a letter and gets a real font

Written 2026-10-31. Planning only. No code. Written against PRODUCT.md, the surface brief, `matching-final.md`, `matching-algorithm-critique.md`, `failure-cases.md` (C1 to C37, binding), the screenshots in `docs/cases/`, `ControlRail.tsx`, `LetterSheet.tsx`, `lib/params.ts`, and Fontsource axis data fetched live (section 1).

Dev's words: "the font construction is really bad, and the bars, the changing of stuff feels off. The controls don't feel intuitive and easy to use." "Keeping serif and also sans? Should they be different? I don't know." "Orange with black doesn't work." On C25: "the font shown is not even close."

Decided by Dev: letters come from real variable fonts (Roboto Flex tested clean at extremes, about 1 ms per setting). Percentages are shown on results. Fully rounded stroke ends must stay reachable.

Contents: 0 short answer. 1 real axes. 2 personas. 3 the 40 nodes. 4 concepts and the choice. 5 word view. 6 zoomed view. 7 composition. 8 no-dead-control rule and sweep test. 9 matching: what C25 teaches, distinctiveness, the percentage. 10 serif, sans and brackets. 11 motion. 12 visual world and results. 13 acceptance C1 to C37. 14 risks. 15 open questions.

## 0. The short answer

Stop drawing letters. The clay is a real variable font, and the dials are its real axes. But one clay is not enough. C25 proved it: a thin, squarish, rounded "b" came back as Poppins Thin because nothing in the query carried "squarish", and nothing in a single neutral clay could have. Character that no axis can move (squarish bowls, rounded stroke ends, feet, soft feet, a casual hand) is a family, not a dial. So the top-level choice becomes **Character**: one row of six letter tiles, each a real variable family drawn as the person's marked letter at their current thickness and width. The dials (Thick, Wide, Lean, and the deep ones) are the same words everywhere and appear per family only where the sweep proves they visibly act.

Controls stop being five identical chevron boxes with numbers 0 to 5. In word view they are thin scrub rows; in zoomed view they are square handles sitting on the exact part of the letter they move, and the rail is gone. A handle only appears if it visibly changes this letter in this family, proved by an automatic sweep over every family, letter, control and pair of controls.

Matching changes in three ways: a bowl-fullness group so squarish counts; a distinctiveness rule that finds what is rare about the person's letter and lets it lead; and a calibrated percentage that is never confident on a bad match.

Results are a column of type-tester rows on a neutral sheet, beside the person's own word, in their own sentence, at matched size, with a percentage, a plain reason, and a way to compare and try. The first row is the letter they shaped, which is already a real font.

## 1. What the Fontsource API actually says

Checked 2026-10-31 at `https://api.fontsource.org/v1/variable/<id>`. Ranges are min..default..max.

| Font | Axes | Role here |
|---|---|---|
| roboto-flex | opsz 8..14..144, slnt -10..0, wdth 25..100..151, wght 100..400..1000, GRAD -200..0..150, XOPQ 27..96..175, XTRA 323..468..603, YOPQ 25..79..135, YTAS 649..750..854, YTDE -305..-203..-98, YTFI 560..738..788, YTLC 416..514..570, YTUC 528..712..760 | Clay: Plain |
| saira | ital, wdth 50..100..125, wght 100..400..900 | Clay: Squarish |
| fredoka | wdth 75..100..125, wght 300..400..700 | Clay: Rounded ends |
| recursive | slnt -15..0, wght 300..400..1000, CASL 0..1, CRSV 0..0.5..1, MONO 0..1 | Clay: Casual |
| roboto-serif | ital, opsz 8..14..144, wdth 50..100..150, wght 100..400..900, GRAD -50..0..100 | Clay: Feet |
| fraunces | ital, opsz 9..14..144, wght 100..400..900, SOFT 0..100, WONK 0..1 | Clay: Soft feet |
| nunito-sans | ital, opsz 6..12, wdth 75..100..125, wght 200..400..1000, YTLC 440..500..540 | candidate, not rounded |
| science-gothic | slnt, wdth 50..200, wght, CTRS 0..85 | candidate for a thick-thin dial |
| geologica | slnt, wght, CRSV, SHRP 0..100 | candidate for a corner dial, no width |
| commissioner | slnt, wght, FLAR, VOLM | candidate, flared ends |
| readex-pro | wght 160..700, HEXP 0..100 | candidate, expansion |
| anybody, archivo, mona-sans, hubot-sans, encode-sans, inconsolata, cabin | wdth plus wght (some ital) | library |
| merriweather | ital, opsz, wdth 87..112, wght | library |
| source-serif-4, literata, newsreader | ital, opsz, wght | library |
| exo-2, jura, orbitron, dosis, quicksand, comfortaa, baloo-2, lexend, nunito, rubik, urbanist, and most others | wght, often ital | library |
| amstelvar, tomorrow, michroma, chakra-petch, kanit, zilla-slab, m-plus-rounded-1c, varela-round | not variable on Fontsource | library as statics |

What this means:

- Only Roboto Flex has handles for the inside of a letter. It is the only honest clay for "controls go deep".
- Squarish bowls and rounded stroke ends exist as families, not axes. Saira (squarish, with a width axis) and Fredoka (rounded ends, with a width axis) are the two open variable families found with both the character and a width axis. Each must be checked by eye on the sheet before being fixed as a clay.
- Roboto Serif shares wght, wdth, opsz and GRAD with Roboto Flex, so Feet keeps the person's work on those.
- No open variable font morphs serif to sans, has a bracket axis, or has a bowl-roundness axis.
- Most of the library is wght plus ital only. That is fine. The library is for matching.

## 2. Who would use this, in depth

Dev asked for this. Everything here is reasoned judgement, not research. No numbers are claimed. Each group: real job, today, what breaks, what this fixes, what would stop them, what they do with the result, and how we would find the issues they hit (a test method).

### 2.1 Product and brand designers with no type training (core)

- Job: choose a typeface for a product, deck, site or brand, and defend it.
- Today: Google Fonts and Fontshare by category, ten tabs, gut. Ask a friend who knows type.
- Breaks: they know it when they see it but cannot name it. Category filters do not help.
- Fixes: shape, do not name. A reason in plain words they can repeat to a client. The Character row lets them say "squarish" by pointing, not by knowing the word.
- Stops them: a list that changes randomly after a small move; an ugly letter when pushed; a toy feel.
- Result: Figma has Google Fonts built in. Otherwise download and install.
- Find issues: five designers, each with a real project. They describe the wanted font in their own words first, then shape, then match. Compare their words to the reason sentences. Log hovers without clicks, undos, and "that is not what I did".

### 2.2 People who design in Word or Google Docs

- Job: a report, flyer, menu or notice that looks decent in the tool they have.
- Today: the font dropdown. Calibri, Arial, Georgia. Some download from dafont and get warnings.
- Breaks: the dropdown shows names, not looks.
- Fixes: picture-first route, then a plain install path. Docs users need the font in Google Fonts and the "More fonts" menu.
- Stops them: a design-tool look. They will not zoom. They want "which of these two" and "how do I get it into Word".
- Result: Word needs a static TTF, double-click, Install, restart. Variable TTFs misbehave in Word, so static instance files only.
- Find issues: three people, one Word document. Do they ever double-click a letter? Do they find "Get it for Word"? How many give up between download and the dropdown? Word-view controls must stand alone for this group.

### 2.3 Students making a poster or a CV

- Job: look serious (CV) or alive (poster) with no budget.
- Today: Canva and Word templates, "best fonts for CV" articles.
- Breaks: the article says Garamond; they do not know why or what else is like it.
- Fixes: shape the feeling, see real fonts, read why. "Use: small text" steers a CV to text faces.
- Stops them: slow, account, price.
- Find issues: two students, one CV, one poster. Did Use make sense unprompted?

### 2.4 Small business owners in Canva

- Job: logo, sign, menu, post, tonight.
- Today: Canva's list and font pairs.
- Breaks: hundreds of fonts, scroll. Free plan cannot upload fonts.
- Fixes: find the look, then learn whether Canva has it. The row says "Search this name in Canva" until a checked list exists.
- Stops them: a result they cannot get into Canva; the word "install".
- Find issues: two owners, a real sign. Watch the moment after the list. Do they know the next step?

### 2.5 Marketers

- Job: landing page, ad set, email header, to a mood brief.
- Today: brand fonts or the template's. A Pinterest board and a guess.
- Breaks: a mood and a deadline, not a letterform.
- Fixes: shaping is faster than describing. Reason sentences become brief copy.
- Stops them: no two-finalist compare in their own headline.
- Result: hand to a designer or paste into an email tool with a web-safe fallback. The row says when a font is on Google Fonts.
- Find issues: one marketer, one headline. Does the word input become the headline? Do they find Compare?

### 2.6 Brand teams

- Job: pick or replace a brand typeface, defend it, roll it out.
- Today: an agency, Fontshare, a paid foundry.
- Breaks: free fonts carry a stigma; decisions are political.
- Fixes: a shape-based shortlist with reasons and a percentage; the exact-instance row (a real, free, open font a brand can ship).
- Stops them: a free-only library is a ceiling. They explore here, decide elsewhere.
- Result: brand book, CSS, licence. The row shows the licence name.
- Find issues: one brand lead, a real refresh. Does the licence line answer first? Do plain words read as smart or dumbed down?

### 2.7 Wedding and invitation makers

- Job: an invitation that feels like the couple.
- Today: Canva, Etsy templates, dafont scripts.
- Breaks: they want script. No clay bends into a script. Recursive's Casual goes toward a hand, not a wedding script.
- Fixes in v1: little. The Casual tile and the "more decorative" nudge help a bit. Honest: weak for them.
- Stops them: no script clay.
- Find issues: do not test on them in v1.

### 2.8 YouTubers making thumbnails

- Job: a thumbnail that reads at 160 px and shouts.
- Today: Impact, Bebas, Montserrat Black.
- Breaks: heavy, tight or wide, and does it read small.
- Fixes: wght to 1000 and wdth 25 to 151 on Plain; Squarish for the tech look; "Use: huge". The size strip under the zoomed letter answers "reads small".
- Stops them: text faces when they wanted posters.
- Find issues: one creator, their title. Do they push Thick to the end, then Wide? Does the list follow?

### 2.9 Slide makers

- Job: a deck that is not the default theme.
- Breaks: fonts fall back to Arial on another laptop.
- Fixes: a nicer pick, fast. "Get it" says: Google Slides, More fonts; PowerPoint, install static and tick Embed fonts.
- Find issues: one deck. After the match, "what do you do now?"

### 2.10 Developers picking a site font

- Job: one or two fonts, loaded fast, in CSS.
- Today: Inter by default because choosing is work.
- Fixes: a minute of shaping, then a CSS snippet. Row zero gives `font-variation-settings`.
- Stops them: no copyable code.
- Find issues: seconds from result to pasted CSS.

### 2.11 Teachers

- Job: worksheets and signs, often with a one-storey a and a plain g.
- Breaks: nobody's filter has letter construction.
- Fixes: the "one-storey a" nudge, from measurement.
- Find issues: one primary teacher. Do they find it? Would they have asked in those words?

### 2.12 Dyslexic readers and people choosing for them

- Fixes: nothing we can honestly claim. Measured nudges only, no reading claim.
- Stops them: any claim.
- Find issues: one reviewer who knows the research reads every string for claims.

### 2.13 People who want a font from a memory or a photo

- Fixes in v1: the memory case. Shaping is how you search from memory. Photo is v2: measure the photo letter in the canonical frame, set the nearest clay and dials, adjust.
- Find issues: two people with a remembered font they can later show. Shape, match, reveal. Where does the real one sit? Also a matching benchmark.

### 2.14 Type designers and type-literate critics

- Not users. Reviewers. Plain labels on real axes will read as wrong; row zero reads as "just Roboto". Show the axis tag on hover, credit families by name, send this spec to one type designer before build.

### 2.15 What the personas changed

1. **Use** as a three-way choice: small text, headings, huge. Maps to opsz and steers matching.
2. **Get it** per result, by tool: Figma, Word, Docs or Slides, Canva, PowerPoint, website. Chosen once.
3. **Nudges** on the result list for what the library measures but no axis moves: rounder, squarer, softer corners, rounded ends, one-storey a, two-storey g.
4. **Word-view controls work alone**, because most groups will never zoom.

Dropped for v1: script clay, photo input, readability claims.

## 3. The 40-node map

### Mental model

**1. What is the person holding?** A real letter from a real family, acting as clay. Every move is one the type designer allowed and the sweep (8) has proved looks right.

**2. What is the letter for?** It is the search query. It is itself a real font instance, so the first result is always true.

**3. How do they understand "all letters change"?** By seeing it: live in word view, on zoom out in zoomed view.

**4. Is this a font editor?** No. "Shape a letter. We find real fonts that match." Families credited by name.

### Top-level choice

**5. What is the real top-level choice?** **Character**: which family is the clay. Six tiles, each the person's marked letter drawn in that family at their current Thick and Wide: Plain, Squarish, Rounded ends, Casual, Feet, Soft feet. This replaced "style" names (jargon, C36) and a serif toggle, because C25 showed that character the axes cannot move must be chosen by eye. Then **Use** (small text, headings, huge).

**6. How many choices before the first dial?** Zero. Plain, Headings, dials live.

**7. Where do Character and Use live?** Top of the word-view rail, as letter tiles. Not in zoomed view.

### Serif versus sans

**8. Keep both?** Yes. Half of what designers reach for has feet. Judgement.

**9. Different controls?** Not controls. Two of the six Character tiles have feet. Shared dials carry across (Thick, Wide, Dark, Use). Dials a family lacks are absent, with one line saying where they exist. Section 10.

**10. Brackets?** Not a dial in v1. Section 10.

### Naming

**11. Dial names.** Thick (wght). Wide (wdth). Lean (slnt or ital). Dark (GRAD). Open (XTRA). Middle height (YTLC). Casual (CASL, Casual tile only). Soft (SOFT, Soft feet only). Same word for the same thing in every family and in both views (C31).

**12. Real axis names.** Mono tag on hover only.

**13. Row ends and readouts.** Words at the ends. Readout is the family's own named stop (Light, Regular, Bold; Condensed, Extended) read from the font file, or a position track for axes with no stops. No raw numbers (C14).

**14. The finder.** "Closest to this".

### Control types

**15. Replacement for swappers.** Scrub rows: label, hairline track, square marker, word readout. Drag anywhere, click to jump, arrows to nudge.

**16. Why the old bars felt off.** Meaningless numbers, hidden position, crude redraw, no hierarchy, inverted Thinness. All removed.

**17. Rows by default.** Thick, Wide, Lean. Then More: Dark, Open, Middle height, plus Casual or Soft where the family has it.

**18. Discrete things.** Tiles that show the letter each way. Never a stepper for a continuous axis.

### Direct manipulation

**19. Handles.** Scrub rows made spatial, anchored to the measured outline (6.2). At most five by default (C31).

**20. Handle rules.** One axis, within the live range, dead stop at the end with "That is as far as this letter goes". Out from the letter is always more (C28, 6.3).

**21. Drag or row.** Same control, two places. No rail in zoomed view (6.4).

**22. Free point editing.** Anti-goal.

### Feedback

**23. Word view.** Whole word live. Specimen strip below (7.2). The word's size never refits to hide a change (C34, 7.2).

**24. Zoomed view.** Only the letter, with a ghost of where it was when the drag began.

**25. Zoom out.** The reveal, letter by letter, with real spacing. Stale marker on the match button.

### Reversibility

**26. Undo.** A gesture is one step (C33). Cmd or Ctrl Z. Reset returns the whole state including family. Double-click a row label resets that dial.

**27. Back to a liked letter.** Pins, which carry their family.

### Defaults and starting points

**28. Start.** "hamburg", Plain at default, Use headings.

**29. Marked letter.** "a" when present, else "g", else the order in `params.ts`. Test (6.6).

**30. Presets.** No gallery. One quiet "Surprise me" inside the live ranges, Dev to confirm.

### Discovery

**31. Learning to zoom (C30).** The resting screen teaches it three ways: the marker tag reads "double-click to open"; hovering any letter draws a hairline box around it with the same words; the cursor is a zoom cursor over letters.

**32. Learning what a drag does before dragging.** Verb callouts and a hover ghost of the destination (6.5).

### Comparing

**33. Two shaped letters.** Pins, up to four, in a strip at the sheet's bottom.

**34. A result against their own letter.** Results sit beside the sheet; "Yours" stays on top; clicking a row stacks it beneath at the same size; overlay mode for one letter (12.4).

### Expert depth

**35. More handles** (Plain only): Tall letters (YTAS), Tails (YTDE), Capitals (YTUC), Crossbar (YOPQ), Upright stroke (XOPQ).

**36. Thick-thin.** Derived on Plain from XOPQ against YOPQ, clamped, hidden where it overlaps Thick.

### Keyboard

**37. Keyboard.** Tab to everything. Arrows one visible step, Shift five. Type a number into a focused row. Z zoom, Escape out, Enter match, P pin. Every control announces name, value, min, max (C18).

### Matching

**38. The query.** Seven real glyphs from the clay, measured like the library. Gates follow the controls. New: bowl fullness group, distinctiveness rule, family character carried into the query (9).

**39. Results.** Row zero "Yours". Rows with percentage, one match and one difference, spec bars, Compare, Try, Get it. Nudges. Section 12.

### Failure states

**40. What the screen says.** Live range end; family switch dropping dials ("Three more dials exist in Plain"); characters the clay lacks; empty word; long sentence wraps; "Nearest we have"; "Your letter goes further than real fonts do on Thick"; loading without layout shift; library unreachable; a result missing letters of the word drawn hollow and named.

## 4. Three whole concepts, from outside font tools

**A. The eye test.** "Better one, or two?" Two real fonts, six to eight rounds. No dials. Anyone can do it. It does not feel like making, cannot say "a little narrower", and throws away the zoom.

**B. Clay and mixing desk.** A real variable letter with faders; handles are faders made spatial. Honest depth; the letter cannot break; keeps everything Dev fixed. Weakness, before C25: one clay cannot express character the axes lack.

**C. Map pins.** The library plotted on two measured axes; drag a pin and the word flips font. Every state is real; the library's gaps are visible. Two dimensions at a time; jumpy; no zoomed letter.

**D. Tasting notes.** Rings of plain words. Fastest from a mood; asks the person to name, which is the problem.

**E. Moving through real fonts (added after C25).** No base clay. The person starts from a result, and every result that is a variable font becomes the clay. The flow is: shape a little, match, pick, shape that, match again.

**The choice: B with a Character row, borrowing from C and E.** The Character row is E's insight made small: six real families chosen to cover the kinds of character no axis moves, so the person moves between real fonts before the dials, not after. From C: every state is a real font, so row zero is always true. From A: tiles that show both options, and "Pick between two" in results. E in full ("start from any result") is kept as a later feature: "Shape this" on any result row that is a variable font, which makes that family the clay with whatever dials it has. The dials are the same words, so the person is never relearning.

## 5. Word view

Top bar: word input; a status text that never changes while editing (letter and family, no pixel sizes; C17, C35); "Closest to this" at right with a stale marker.

The sheet (7.1): white, hairline grid quieter than the thinnest letter (C27), the word huge and black with its baseline on a major grid line. Marker square and tag sit against the master letter with a short leader (C8, C35).

Right rail, aligned to the sheet:

| Control | Type | Maps to | Shown when | What changes | Feel |
|---|---|---|---|---|---|
| Character | six letter tiles: Plain, Squarish, Rounded ends, Casual, Feet, Soft feet | family: Roboto Flex, Saira, Fredoka, Recursive, Roboto Serif, Fraunces | always | the whole word changes family with the motion in 11.2; dials the family lacks leave the rail with one line saying where they live | the one big fork, seen as letters before chosen |
| Use | three tiles: Small text, Headings, Huge | opsz 14, 36, 144 where the family has opsz; sizes of the specimen strips; matching steer | always | specimen strips redraw at size; the tile says "shapes tune to size" when opsz exists (C25 of section 13.1) | once per project |
| Thick | scrub row, hairline to black | wght | every family | strokes thicken, word darkens | the big fader |
| Wide | scrub row, narrow to wide | wdth | Plain, Squarish, Rounded ends, Feet | letters stretch, the word gets longer on the sheet | second fader |
| Lean | scrub row (slnt) or two-up (ital) | slnt or ital | Plain, Casual (slnt); Squarish, Feet, Soft feet (ital two-up) | letters tilt | short row |
| More | one line | | | | |
| Dark | scrub row | GRAD | Plain, Feet | bolder without longer | quiet trick |
| Open | scrub row | XTRA | Plain | counters widen | |
| Middle height | scrub row | YTLC | Plain | small letters grow against capitals | |
| Casual | scrub row, formal to hand | CASL | Casual only | shapes loosen | |
| Soft | scrub row, crisp to soft | SOFT | Soft feet only | corners and ends soften | |
| Pin this, Undo, Reset | actions | | | | |

Rail footer: "Every change here reaches all the letters of your word."

Pin strip along the sheet's bottom.

## 6. The zoomed view, deep

Dev's screenshots (cases 5 to 10, 14): handles stacked on one letter; raw "Stem 150"; two handles side by side with leaders crossing ink; a rail repeating the handles under different names; a dead area; a crushed counter; a letter off the sheet; handles moving the wrong way on most letters (C28); "Corner softer" said drag in, only vertical worked, 60 px ran the whole range (C29). All of it comes from handles placed by fixed rule on a generated letter and shown whether or not they acted. The fix is a different idea of a handle.

### 6.1 What a handle is

A square that sits on the ink edge it moves. Drag it and that edge follows the pointer one to one. You are holding the edge of the letter, not a slider. The anchor is measured from the real outline every frame, so the square stays on the edge as the letter changes. Each handle carries a verb callout ("Thicker", "Wider", "Taller", "Airier"), a leader straight out to the nearest margin that never crosses ink, and the mono axis tag on hover.

### 6.2 Which handles belong on which letter

Anatomy says where a handle may anchor. The sweep says whether it appears. The sweep table overrides this table per letter and per family.

| Handle | Axis | Anchors to | May appear on | Never on |
|---|---|---|---|---|
| Thick | wght | inner edge of the main stem at mid x-height (so dragging away from the stem's centre line, toward the counter, is thicker on the inner side; see 6.3); on round letters the thickest point of the bowl's left side | all | nothing |
| Wide | wdth | rightmost ink at mid x-height | all with wdth | families without wdth |
| Lean | slnt | top of the main stem, or top of the bowl | all with slnt | ital families (two-up in the bottom strip instead) |
| Middle height | YTLC | the x-height line where the body meets it | a c e m n o r s u v w x z, bowl tops of b d g p q | capitals, i j l |
| Open | XTRA | inner edge of the main counter at its widest | a b d e g o p q, c n m u h | i l I f t r |
| Tall letters | YTAS | top of the ascender | b d f h k l | others |
| Tails | YTDE | bottom of the descender | g j p q y | others |
| Capitals | YTUC | top of the capital | capitals | lowercase |
| Crossbar | YOPQ | middle of the thickest horizontal | e f t z A E F H T, arch tops of n m h | i l I |
| Upright stroke | XOPQ | as Thick, behind More, only where distinct from Thick | stem letters | round letters |
| Thick-thin | XOPQ against YOPQ | second square on the stem | letters with a stem and a horizontal or curve | i l I |
| Casual | CASL | the terminal of the main stroke | Casual family | others |
| Soft | SOFT | the sharpest corner of the letter | Soft feet family | others |

Where a letter has several of one part (m), one handle appears on the first and the callout says "all three". Default handles on open: at most five, the three shared ones plus the two with the largest visible effect on this letter by the sweep. The rest behind "More handles". The old "r" with four stacked handles becomes Thick, Wide, Lean, Middle height, with Open hidden by the sweep.

### 6.3 What the person feels when dragging

- The edge under the square follows the pointer one to one. No gain, no lag. This fixes C29's "60 px runs the whole range": the range on screen is however far the edge really moves.
- A hairline ghost of the starting outline stays for the drag and fades after release.
- At the live range's end the square stops. The pointer keeps going; nothing moves; the callout reads "That is as far as this letter goes". No bounce.
- **Direction (C28, C16).** The rule is physical: dragging away from the letter's centre line makes more; dragging toward it makes less. The square sits on the edge that moves outward when the axis increases. For Thick on a stem letter that is the stem's outer edge, which moves away from the letter's centre as the stem thickens. For Wide it is the right side. For Tall letters the top, for Tails the bottom, for Middle height and Capitals the top. Any pointer movement is projected onto the handle's axis, so a diagonal drag still works (C29). Keyboard: Right and Up are more, except Tails where Down is more and the callout says so. The sweep checks every handle on every letter: a synthetic drag outward must increase the measured quantity (8.6).
- Readouts are words or a position track, never raw numbers.
- The letter never leaves the sheet. Scale is set from the live extremes of the shown handles, so a drag never rescales (C15, C32).

### 6.4 The rail does not come to the zoomed view

It duplicated the handles under other names and made 13 controls (C31). In zoomed view the sheet is full width and the handles are the controls. Controls with no place on the letter (Dark, Lean on ital families) sit as one row in the bottom strip. Character and Use are word decisions and stay in word view.

### 6.5 Learning what a drag does before dragging

- Verb callouts: "Thicker", "Wider", "Taller", "Airier", "Softer", "Looser".
- Hover draws the destination: a hairline ghost of the letter at the far end of that handle's range in the more direction. Gone on mouse out.
- Cursor is a two-headed arrow along the axis.
- Callouts show in full on first open; after the first drag, inactive ones fade to label and return on hover.
- Nothing pulses.

### 6.6 Which letter to open, and what zooming teaches

On Plain, "a" shows Thick, Wide, Lean, Middle height, Open, Crossbar: six. "g" (single storey in Roboto) shows Thick, Wide, Lean, Middle height, Open, Tails: six, and it was the most informative letter in the matching test. "R" is the capital teacher. Recommend "a" when present, "g" otherwise, and test with the first five designers.

Zooming teaches that a letter is a few parts with one dial each; that all letters share four lines; that heavy choices read differently small (size strip); that dials have ends which are the designer's. Letters teach by what they lack: "i" shows three handles, "H" shows Capitals and Crossbar.

### 6.7 What the letter shows besides itself

The four guide lines with plain labels. The start ghost during a drag and the destination ghost on hover. The size strip in the bottom third: the same letter in a short line of the word at Small text, Headings and Huge sizes, live. This fills the dead area with purpose (C7). No neighbours while zoomed, to keep the reveal.

### 6.8 Bottom strip

Zoom out at left; Dark row (and Lean two-up on ital families) centre; Undo and More handles right; the line "Only this letter shows while you edit. The whole word changes when you zoom out."

### 6.9 Other things worth naming

Opening a repeated letter opens the marked one and both change. Capitals and descenders shift the guide lines so the baseline stays on the major grid line. No Character change while zoomed. Double-click on the sheet background zooms out. "More handles" open state is per session.

## 7. Composition: both views as one product

Dev's screenshots (cases 4, 5): the word floats; the tag drifts; the zoomed letter leaves a dead area. Elements were placed, not composed.

### 7.1 One sheet, two zoom levels

Both views are the same white sheet with the same hairline grid. Zooming is a camera moving into one letter. The baseline of the big word and of the zoomed letter sit on the same major grid line. The baseline and middle line are drawn across the word in word view, unlabelled; zooming in labels lines the person has already seen (C9).

### 7.2 Word view at 1440 by 900

- Sheet from under the top bar to the pin strip, 24 px to the rail.
- The word is set at a fixed size chosen once from the word length at default width: cap height about one third of the sheet height, baseline near 55 percent. **The size does not refit as dials move** (C34). A wider setting makes the word longer on the sheet; the person sees the change they made. If the word would pass the sheet's right edge it wraps to a second line at the same size with the baseline rule kept (13.1 C36). Only a new word resets the size.
- Specimen strip from about 65 percent down: the person's word as a short paragraph at Small text size and a line at Headings size, in the current family and settings, live. This is the purpose for the empty space.
- Marker: a small accent square 8 px from the glyph's measured top right (Range client rects, never a constant), with a short leader to the tag "carries the most character · double-click to open" (C8, C30, C35).
- Rail the full sheet height, groups spaced to the grid.

### 7.3 Zoomed view

Letter in the upper two thirds, left of centre, scaled to the live extremes; callout margins of at least 220 px; size strip in the bottom third aligned to the word view's left margin; hairline bottom strip.

### 7.4 Product, not demo

The sheet is continuous. Every empty area has a job. Every element is positioned from a measurement of the real letter.

## 8. The no-dead-control rule and the sweep

Dev's slab "m" had a "Corner softer" handle that did nothing and serifs that merged. His "b" had a crushed counter and ran off the sheet. The critique found handles that thin when they say thicken on 45 of 62 glyphs. This section makes the class impossible.

### 8.1 The rule

A control appears for a given family, letter and setting only if:

1. **It acts here.** One step changes this letter's outline by at least the visible threshold.
2. **It acts across its shown range.** The shown range is the live range: the longest contiguous run of steps that all clear the threshold. Fewer than three live steps: not shown.
3. **It is distinct.** Not the same effect as another shown control on this letter.
4. **It is safe.** No setting in its live range, alone or at the live extremes of any other control, collides inside the letter or between letters.
5. **It is honest.** The quantity it names rises when it says more, on this letter.

A control that fails is absent, not grey. One line says where it exists ("Three more dials exist in Plain"; "Open appears on letters with a hole"). Grey controls invite dead clicks, which is the feeling Dev described (C10, C33).

### 8.2 The sweep

A Node script, run before every release and in CI, over every family, every character in the Latin set the family has, every control, every pair, and the word test. Output: one JSON table per family that the UI reads. Presence of a control is never decided at runtime by rule; it is read from the table.

Rendering: real font files through a variable-font-aware library (fontkit, or HarfBuzz via WebAssembly) into the same canonical frame as matching, 512 px x-height. At about 1 ms per setting the sweep is minutes.

Steps: 24 per axis for singles. Pairs: four corners of the live ranges plus edge midpoints (eight per pair). Triples: corners of Thick, Wide and Open only.

### 8.3 Visible change, step size, jumps

- Change between settings: XOR area of aligned masks over the default glyph's ink area.
- Visible threshold 0.8 percent per step. Below: dead step.
- Jump threshold 12 percent per step. Above: more steps are inserted in that region until none jumps.
- One arrow press is one sweep step, so every press shows and none startles.
- Both numbers are first guesses, set once by eye with Dev at 1440 by 900, then frozen with the reason.

### 8.4 Overlap, inverses, fights

- Same effect: correlate per-step XOR masks of two controls on a letter. Above 0.9, the lower-ranked one is hidden on this letter. Expected: Upright stroke and Thick on round letters; Thick-thin on i and l; Middle height on i.
- Inverse: A by k steps then B by k steps returns within 2 percent of the start. Only one shown by default. Expected: Dark against Thick at small steps, so Dark stays behind More.
- Fight: a pair where either live range shrinks by more than half when the other is at an extreme. Recorded as a two-dimensional clamp the UI applies, so the person meets a clean stop, never a crushed counter. Expected: Thick max with Open min on b, o, e.

### 8.5 Collisions

Inside a letter: connected components of ink and of counters must not change across any single or pair setting (m keeps three feet, b keeps one hole). Every counter stays above 30 percent of its default area (case 9). Gaps between separate parts stay above 4 percent of x-height (case 6 serifs). Between letters: every ordered pair of characters as a two-letter word with the family's own spacing and kerning, at the live extremes of Thick, Wide and Lean together: no ink overlap; for serif families, feet stay separate. Also the default word and the eye-set words. Fit: bounding box within the sheet at the computed scale; every anchor at least 60 px from the edge; handle centres at least 44 px apart or the lower one demotes; no leader crosses ink or the anchor slides along the edge or demotes; callouts in a margin never overlap or demote. Where the family's own axis range fails, the live range is clipped. The designer's range is the maximum, never the minimum.

### 8.6 Direction and label truth

For each control, measure the quantity it names across its live range on each letter: stem thickness, advance, slant angle, x-height, counter width, ascender, descender, cap height, horizontal stroke, mean darkness, corner radius (Soft), terminal angle (Casual). It must rise monotonically with more. Synthetic drag: a pointer move of 100 px in the handle's more direction must increase the quantity on every letter where the handle shows (C28). Named stops must sit where the font's own instances put them.

### 8.7 Output and predicted hits

Per family: per character, controls shown by default and behind More, live ranges, step lists, anchor rules, verbs, directions; pair clamps; sheet scale. Per family a pass or fail report; CI fails on any fail. `failure-cases.md` gets a column naming the sweep check that closes each case.

Predicted: Open hidden on r f t; Middle height hidden on i j; Thick max with Wide min clamps on m w; Lean max with Wide max clamps on f; Dark behind More as an inverse of Thick; Upright stroke hidden on o c s; Thick-thin hidden on l i; Soft on Fraunces hidden on letters with no sharp corner at the current weight; Casual on Recursive hidden on letters whose casual form equals the formal one.

## 9. Matching: what C25 teaches, distinctiveness, and the percentage

### 9.1 Why the thin squarish "b" came back as Poppins Thin

Three reasons, all visible in `matching-final.md`:

1. **The distinctive thing was not a group.** The eight groups are weight, width, x-height ratio, contrast and stress, slant, roundness (corner radius), aperture and counter, serifs. "Squarish bowl" is none of them. Corner radius measures the ends of strokes, not the shape of a bowl. A superellipse bowl with round corners scores as round.
2. **The common things had the most variance.** Weight (hairline) and no serifs are strong signals and most of the library is far from hairline, so a thin geometric sans wins on two groups and the p=4 norm never sees a big miss, because the miss is in a dimension that was not measured.
3. **The generator did not carry character.** Its bowl was a parameterised blend; the squareness was a hand-built artefact that no library font has. With real families as clay, a Squarish tile is a real squarish font and the library has squarish neighbours.

### 9.2 Three changes to the matching plan

**A. Add a bowl-fullness group.** For o, b, e (and O): the bowl's ink-plus-counter area over its bounding box area. A circle is about 0.785; a square is 1. Superellipse bowls sit between 0.85 and 0.95. Also the curvature profile along the outer contour, summarised as the share of the contour with near-zero curvature (straight runs). Both come from the canonical raster. This group makes "squarish" measurable for the query and the library.

**B. Let what is rare lead.** For each group, the query's z-score against the library distribution says how unusual the person's letter is on that group. Group weight becomes base weight times (1 + k times |z|), capped at three times base. With the p=4 norm, a font that misses the person's rare group is vetoed. This is distinctiveness from rarity, not from edit history, so it does not reopen the intent-weighting idea the critique demoted: untouched still means "I accept this". k is tuned on the frozen eye set, which gains the C25 query. The reason sentence names the rare group first, which is also what the person is proudest of.

**C. Carry the family's character into the query.** Each Character tile has a tag: squarish, rounded ends, casual, feet, soft feet. The tag becomes a strong group weight (not a hard gate) on the measured attribute that defines it: bowl fullness, terminal roundness, construction, serif presence, corner radius. The library's attribute table gets terminal roundness (end shape of strokes: flat, round, flared) so "rounded ends" is measurable (C37).

Other changes to `matching-final.md`: the "generator letters close enough" risk is deleted; the parameter grid becomes a per-family instance grid (named instances plus a coarse grid on wght and wdth), used for reachability and for "Shape this" on results; the eye set grows to sixteen with four held back, including the thin squarish b, a rounded-ends heavy, a soft-feet text face, and a casual slanted.

### 9.3 Can the person even ask for something no clay can draw?

If no tile and no dial reaches a character, the honest answer is the nudges and "Shape this". Nudges let the library answer what the clay cannot (rounder, squarer, softer corners, rounded ends, storey). "Shape this" on any variable result makes that family the clay, with the same dial words and whatever dials it has. The flow then is: shape, match, pick, shape that, match again. A person can walk through real fonts toward a character no single clay has. Static results cannot be shaped and say so.

### 9.4 The percentage

Dev wants a number. Raw distance did not track quality in the spike, so the number must be calibrated against judgement, not distance.

- **What it means.** "How likely a designer would call this a close match." That is the only honest meaning for a percentage here.
- **Calibration.** Two stages. Before human judgments exist: for every library font, compute its distance to its nearest neighbour outside its own family. The median of those is what "twins" look like among real fonts; call it d_close. The median distance between random pairs is d_far. Map distance to percentage on a log scale: d at or below d_close is 95; d at d_far is 30; between is linear in log d. Once Dev's eye set judgments exist (acceptable or not per row), fit a monotonic curve from distance to the share judged acceptable and use that instead. The test that defines calibration: on the held-back queries, rows shown at 90 or above must be judged acceptable at least nine times in ten, and rows at 60 must be near half. If not, the curve is refit, never the display.
- **Never confident on a bad match.** Three hard caps. If any group distance exceeds its veto threshold, the percentage is capped at 59. If the "beyond the library" flag is on for any group, no number is shown; the row says "Nearest we have" and the dial that went further. If fewer than three letters of the word survived the topology and charset gates, the number is capped at 69 and the row says "judged on fewer letters".
- **Display.** The integer in small mono beside the family name with a word that the same scale defines: 90 and above "near twin", 75 to 89 "close", 60 to 74 "same spirit", below 60 no word, and the list header reads "Nothing is really close. Nearest we have:". The reason sentence and the number read the same group distances, so they cannot disagree: a 92 with "much rounder" is impossible because "much" is itself a group distance above the veto line.
- **Top result when nothing is close.** Header "Nothing is really close. Nearest we have:", the best row with its capped number in grey, its one difference stated first ("Rounder bowl than yours"), and a line under it offering the two nudges most likely to help, derived from the vetoing group ("Try: Squarer").

## 10. Serif, sans and brackets: a reasoned answer

**Quick change between serif and sans: yes, required.** Half the library has feet and the person must be able to say "with feet" or "without" in one move. Real variable fonts cannot do it as an axis, so it is a family switch, and the design makes it one click: the Feet and Soft feet tiles in the Character row. The switch keeps Thick, Wide, Dark and Use because Roboto Flex and Roboto Serif share those axes. It is quick, visible as letters before it is chosen, and honest about what it is.

**Add, remove or change brackets: no, not as a control in v1.** Reasons. No open variable font has a bracket axis; Fraunces's SOFT softens corners and terminals, which changes how joins feel, but does not add or remove a bracket, and Roboto Serif has none. The audience cannot name a bracket and would not know what the dial was for; it is exactly the kind of depth that should appear as a difference between two letters, not as a word. And the library can already answer it: measure the concavity at the serif-to-stem junction offline and expose it as a nudge in serif results ("softer joins" and "sharp joins"), and let the two serif tiles show it by example (Roboto Serif is bracketed; Fraunces at SOFT 100 is soft; a slab, if a variable slab with a width axis is found, would be unbracketed).

What it would look like if it were ever added: a Soft handle on the join of the serif, as Fraunces's SOFT already allows on the Soft feet tile. That is the whole honest surface. Anything more means drawing letters again, which failed.

## 11. Motion: every change smooth

Dev's question: how does every change of character, thickness, width and the rest feel smooth, not jarring.

### 11.1 Within a family: axis interpolation

- During a drag or scrub, no easing. The value is the pointer. Smoothness comes from the font: variable fonts interpolate outlines continuously, and the browser re-renders text each frame.
- For a discrete change (click to jump, arrow step, undo, pin load, Surprise me, Use change): interpolate the axis numbers over 240 ms with an ease-out curve, in one requestAnimationFrame loop that writes `font-variation-settings` once per frame to the container. Letters morph because the font morphs.
- Word layout: each letter is its own inline span. Before a change, record every span's position (FLIP). After the change, the browser lays the word out at the new advances; the loop transforms each span from its old position to its new one over the same 240 ms, so the word lengthens or shortens as a slide, never a jump. Wrapping to a second line uses the same FLIP, with the moved letters sliding down.

### 11.2 Across a family switch: outlines do not match

Interpolation is impossible between two fonts. Two stages, 420 ms total:

1. **Shared axes first (180 ms).** If the new family has the person's Thick, Wide, Dark or Use values at different clamps (Flex wght 1000 to Serif 900), the current family first morphs to the clamped values. The person sees their letter move to where it will land.
2. **Crossfade per letter, staggered (240 ms, 20 ms stagger left to right).** Each span holds two layers: old family fading out, new family fading in, with positions FLIPped from old advances to new advances so the word slides to its new length during the fade. Baseline is shared, so nothing moves vertically. Because the families were chosen with the same Thick and Wide meaning, the crossfade is between two letters of the same weight and width, which reads as the letter changing its mind rather than being replaced.

Dials that leave the rail fade out after the crossfade with the one-line note, not before.

### 11.3 The reveal on zoom out

The sheet zooms out (560 ms, as now). Then each letter of the word crossfades and FLIPs from its state when the person zoomed in to its new state, staggered 30 ms, starting from the letter they edited. The edited letter changes first because it is where the eye is.

### 11.4 Keeping 60 fps with font outlines

- Text is rendered by the browser, which is fast for variable fonts. One container-level `font-variation-settings` write per frame; letter spans use `transform` only. No per-frame layout reads except the one FLIP measurement at the start of a change.
- The zoomed letter is also text, not an SVG path, so it morphs for free. Handle anchors need the outline: fetch the glyph path from the font file (fontkit, in a Web Worker) at the current axes, about 1 ms, sampled along the contour at low resolution to find the stem edge, rightmost ink, counter edge and line crossings. Cache per rounded axis vector. Anchors update on the frame after the value changes, which is one frame of lag at most on the handle square, never on the letter.
- Ghosts are the glyph path as a hairline SVG over the text, computed once per hover or drag start, not per frame.
- Specimen and size strips are text too; they redraw with the same single write.
- Budget: one layout per change, transforms and opacity only during motion, outline work off the main thread.

### 11.5 Reduced motion

With `prefers-reduced-motion`: no FLIP slides, no stagger, no crossfade. A discrete change applies instantly; a family switch swaps instantly after a 120 ms opacity dip of the whole word so the eye registers a change happened; the reveal is a single instant redraw with the same dip. Ghosts and dead stops are unchanged, since they are not motion.

## 12. The visual world for judging type

Dev: "Orange with black doesn't work." Right, for a reason that applies to any font finder: the thing judged is black type, and black type can only be judged on a neutral surface with nothing fighting it. The block also made thin fonts vibrate (C20). What stays from Dev's references: the Standards Manual sheet, huge tight type, mono labels, thin rows, type-tester rows. What goes: any area of saturated colour.

### 12.1 Principles

- **The specimen owns contrast.** The only strong black is type being judged. Chrome is grey and hairline.
- **Surfaces are paper.** White sheet for specimens, cool grey ground for chrome, and a dark sheet (near-black, white type) available in results because designers judge both polarities. Default light.
- **Colour is a mark, never a fill.** One accent at hairline and square size: active handle, marker square, selected row's rule, focus ring, stale marker. Never behind text, never a block. Candidate: a cool cobalt (around #2447F5), which reads as instrument panel rather than brand and does not warm the greys. The red-orange at mark size only is also acceptable. The rule matters more than the hue; Dev picks.
- **Mono for measurement, sans for words.** Mono for axis tags, guide labels, percentages, rank numerals. One UI sans at one small scale for sentences and buttons. Specimen fonts are the only display type.
- **Hairlines, not boxes.** No cards, shadows or rounded corners. Standard web controls styled thin.
- **The grid is quieter than the thinnest letter** (C27): grid lines at an opacity below a hairline stroke at wght 100.

### 12.2 Why this feels smart

Smart is shown. Every result row carries two small spec bars (thickness and width: the person's value as an accent tick, the font's as black), a calibrated percentage with its word, one short specific reason, specimens at matched size, and every position on the sheet comes from the letter itself. Nothing decorative. The restraint is the intelligence.

### 12.3 How results are shown

After "Closest to this": if zoomed, zoom out and run the reveal, so the person sees their whole word first. Then the result column slides in from the right, about 45 percent of the width; the sheet narrows left. Nothing covers the work (C23).

The sheet shows "Yours" at the top: the word in the current family and settings at Headings size, a line "Roboto Flex at your settings" (or the family's name), and Get it. Below it, the compare slot.

The result column is type-tester rows on the same white sheet, same grid and hairlines:

- Header line: state ("Nothing is really close. Nearest we have:" when so). Then the nudge chips in one thin row: Rounder, Squarer, Softer corners, Rounded ends, One-storey a, Two-storey g, and for serif results Softer joins, Sharp joins. A chip re-ranks within the top forty and says "moved up 3". Then "Pick between two".
- Each row: small mono rank; family and chosen style in the UI sans; the percentage and its word in mono; the person's own sentence in that font at matched x-height for the row size (C24); one reason sentence, one match and one difference, rare thing first ("Same squarish bowl. A little heavier.", C21); the two spec bars; licence; Compare, Try, Get it, and "Shape this" when the font is variable.
- Selected row's rule turns accent. Further results are smaller rows, not boxed tiles.

### 12.4 Comparing and trying in context

- **Compare**: puts the row's font under Yours at the same size and baseline grid. Two stacked words is the oldest and clearest type comparison. A second tick adds a third line. **Overlay**: the result's marked letter in hairline over the person's, huge, on the sheet. The single most convincing image of a match or a miss.
- **Try**: expands the row into a specimen: the person's sentence as a heading at Headings size, a paragraph at Small text, one word at Huge, with a light or dark paper toggle.
- **Get it**: the per-tool steps.
- Editing with results open: dials work, the list gets a stale marker and the button reads "Match again". The list never changes under the person without a click.

### 12.5 Copy

One match, one difference, natural words, dial names, rare thing first. "Same thickness. A little narrower." Never a list joined by "and". No type terms.

## 13. Acceptance against failure-cases.md

| # | How this design closes it |
|---|---|
| C1, C26 | No generator. All letters are rendered from real variable fonts by the browser. |
| C2 | Charset from each family's cmap; sweep enumerates and fails on a missing glyph; characters a family lacks show in fallback and are not openable. |
| C3 | Scrub rows, tiles, anchored handles. No bare numbers. |
| C4 | Readouts are the font's own named stops; sweep checks the measured stem rises with Thick. |
| C5 | Every combination is a type designer's drawing; pair and triple sweeps clip where even that fails. |
| C6 | Handles 44 px apart, leaders to the nearest margin never crossing ink, demotion when a margin is full; geometry test every setting. |
| C7 | Size strip fills the zoomed sheet's bottom third; specimen strip in word view. |
| C8 | Marker from the glyph's client rect, 8 px, short leader; distance test under 12 px at every setting. |
| C9 | One sheet, two zoom levels, shared grid and baseline row. |
| C10 | No-dead-control rule and sweep. Absent, not grey. |
| C11 | Component count, part gaps, ordered-pair word test at live extremes; ranges clipped. |
| C12 | Anchors measured from the real outline each frame; anchor to ink edge within 1 px. |
| C13 | Counter area above 30 percent of default across all single and pair settings; pair clamps. |
| C14 | Raw values only in a hover tag. Copy check: no digits in default labels except the percentage in results. |
| C15, C32 | Sheet scale from live extremes; nothing rescales in a drag; handles cannot pass the top stop because the live range is the stop. |
| C16, C28 | Out from the letter is more; keyboard Right and Up are more (Down for Tails, stated); synthetic drag test on every handle and letter. |
| C17, C35 | Status names letter and family only. Word baseline on the grid; tag with leader against the letter. |
| C18 | Every control is a slider with name, value text, min and max. |
| C19 | Fixed. |
| C20 | Specimens only on white or dark sheets; colour never behind type; contrast test. |
| C21 | One match, one difference per row; copy check on "and". |
| C22 | Yours stays on the sheet; Compare stacks under it; Overlay. |
| C23 | Results are a column beside the sheet after the reveal; editing stays live. |
| C24 | Matched x-height per row size, measured; variety from slot 4 as a ranking rule. |
| C25 | Bowl-fullness group, rarity-led weights, family character carried into the query, Squarish tile exists so the query is a real squarish letter. Eye set gains the query. |
| C27 | Spacing is the font's own; grid quieter than a wght 100 hairline. |
| C29 | One-to-one edge tracking; pointer projected onto the axis; the range on screen is the real edge movement. |
| C30 | Marker tag says double-click to open; hover box on any letter says it; zoom cursor. |
| C31 | One name per thing in both views; no rail in zoomed view; at most five default handles. |
| C33 | A family switch never drops a value silently: the one-line note and value memory; Reset restores family too; Ctrl or Cmd Z; a drag or a run of arrow presses within 400 ms is one undo step. |
| C34 | Word size fixed per word; width changes change the word's length; wraps rather than refits. |
| C36 | Style names gone. Tiles are letters; names are Plain, Squarish, Rounded ends, Casual, Feet, Soft feet. |
| C37 | Rounded ends tile (Fredoka, a real rounded variable family with a width axis), a Rounded ends nudge measured on the library's terminals, and "Shape this" on any rounded variable result. |

### 13.1 New cases predicted here

| # | What would go wrong | Rule | Check |
|---|---|---|---|
| N1 | Use changes shapes silently through opsz | Use change runs the morph in 11.1 and the tile says "shapes tune to size" | Reviewer |
| N2 | Clay loads after fallback and the word jumps | Stage height from the family's metrics; fallback drawn in the same box | Layout shift test |
| N3 | Family switch clamps Thick (1000 to 900) without a word | Stage one of the switch motion shows the move; note line; value remembered | State test |
| N4 | Undo across a family switch restores axes the family lacks | Undo steps carry the family; a switch is one step | Unit test |
| N5 | A result lacks a letter of the word and shows a fallback glyph as if it were the font | Charset gate per result; missing letters hollow and named | Test with "ß" |
| N6 | Two handles share one anchor after a drag moves parts together | 44 px rule every frame; lower-ranked slides along its edge or hides until apart | Geometry test |
| N7 | Scrubbing past the end keeps the pointer captured | Capture releases at the end with the limit message | Manual |
| N8 | Matched x-height makes a very wide font overflow its row | Rows wrap, never clip | Bounds test |
| N9 | Dark sheet makes thin fonts vanish | Minimum rendered stem per row size; below it the row says "very thin at this size" | Stem test |
| N10 | Pins drawn in the wrong family after a switch | Pins carry their family | Unit test |
| N11 | Long word at Wide max overflows in word view | Wrap at fixed size, baseline rule kept | Bounds test |
| N12 | A 92 percent with "much rounder" | Number and sentence read the same group distances; veto caps the number | Unit test on eye set |
| N13 | Squarish or Rounded ends family turns out to have a poor Latin set or ugly extremes | Each candidate family is checked on the sheet by Dev before it is fixed as a tile; the sweep clips | Eye check |
| N14 | Six tiles reintroduce decision fatigue | Tiles are letters, not words; Plain is preselected; the row is one glance | Test with first designers |

## 14. Risks and what I am unsure of

1. **Candidate families.** Saira as Squarish and Fredoka as Rounded ends are the open variable fonts found with both the character and a width axis. Neither has been seen on the sheet at extremes. Either may fail the eye and need replacing; the Character row is a slot, so replacing is cheap.
2. **Only Plain is deep.** The inner handles exist on Roboto Flex alone. On other tiles the zoomed view shows three or four handles. People may feel the tool shrank when they switch. The one-line note and the shared dial words are the mitigation. Test.
3. **Six tiles and decision fatigue.** It is one more decision than a serif toggle. The defence is that it is visual and preselected. If the first designers freeze on it, cut to four (Plain, Squarish, Rounded ends, Feet).
4. **Thresholds are guesses.** 0.8 percent visible, 12 percent jump, 30 percent counter, 44 px spacing, 0.9 correlation, three-times weight cap, d_close and d_far mapping. Each set once by eye with Dev and frozen with the reason.
5. **The percentage before judgments exist** is a distance-shape proxy. It will be wrong in places until the eye set is judged. The caps keep it from being confidently wrong; they do not make it right.
6. **Matching bias toward the clay families.** Queries cluster near six designs. Mask overlap may favour their look-alikes. Watch on the eye set; lower the overlap stage's weight if so.
7. **Rarity-led weighting can over-fire** on a group that is rare for a dull reason (an odd x-height from opsz). The cap and the eye set guard it.
8. **Personas are judgement.** Nothing in section 2 is measured.
9. **Licensing.** Static instance downloads of OFL fonts are allowed; every other source must be checked. Canva's list must not be promised.
10. **Lean is a slider on some tiles and a two-up on others.** Honest but a seam.
11. **Hover ghosts assume a pointer.** Keyboard users get verbs and announced ranges.
12. **Crossfade across families** can look like a glitch on letters whose constructions differ (double-storey a to single-storey). It is still better than a cut. Reduced motion avoids it entirely.
13. **Accent hue is open.** The rule is firm.

## 15. Open questions for Dev

- Accent: cool cobalt or red-orange at mark size only?
- Six tiles or four?
- Saira and Fredoka: approve on the sheet before they are fixed as tiles.
- Master letter: a or g?
- Row zero as "Yours" header or a quiet line?
- "Surprise me": keep or cut?
- Dark behind More, or front row?
