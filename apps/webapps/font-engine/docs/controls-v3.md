# Controls v3: build spec

2026-10-31. Replaces `controls-v2.md`. Usable alone. Binding inputs: `PRODUCT.md`, `matching-final.md`, `failure-cases.md` (C1 to C37, plus N1 to N18 from v2). Sources: axis ranges from `api.fontsource.org/v1/variable/<id>`; defaults, named instances, GSUB tables and file sizes read from the TTFs in `google/fonts` (fvar, name, GSUB readers; section 1.3). Fontsource normalises defaults to 400 and lists `ital` for families that ship italics as a separate file, so it answers "what range" and never "what default" or "what file". Numbers marked "by eye" are first values to tune once with Dev on the sheet, then frozen by the build into `lib/clay/<family>.json` or `lib/match/constants.json` with the reason. The UI reads those files and never decides presence, home or weights at runtime.

## 0. Decisions

1. Letters are real variable fonts. Dials are the fonts' axes.
2. **Character**: four letter tiles. Plain (Roboto Flex), Squarish (Saira), Rounded ends (Nunito), Feet (Roboto Serif). Nothing behind "More character" in v1. Casual (Recursive) and Soft feet (Fraunces) are cut: both swap glyphs along axes through `rvrn`, both need partial instancing, and neither earned the load. Squarish fallback is Science Gothic; Rounded ends fallback is Fredoka.
3. Two tiles may be selected. Editing model in 3.3. The query is the blend in 5.1.
4. Dials: Thick, Wide, Lean, Openings, Middle height, Tall letters, Tails, Capitals, Thick-thin. Same word everywhere, with a one-line definition.
5. Every family has a **home** (1.2). Sweep, Reset, exclusion and first paint read home, never the file default.
6. **Drag the word.** In word view the marked letter is a two-axis pad: drag up for thicker, right for wider. The first move needs no rail and no zoom (3.2).
7. **Start from a font you know.** Type a font name in the word bar's second field and the clay lands at the nearest tile and dials (3.4).
8. Word view: scrub rows. Zoomed view: handles, no rail, five at most. Presence from the sweep table.
9. Exclude only the clay family and its named superfamily from results. Near-home fonts show with a grey word when nothing has moved.
10. Results: column beside the sheet, type-tester rows at matched size, percentage with caps, one match and one difference, Compare with blink, Try with pasted text, Not this, Get it, Shape this as rows only. Live shortlist of three in the margin.
11. Cut: Dark, Upright stroke, Crossbar, Edge, Roundness, Thinness, Surprise me, typed numbers, Between these two, Pick between two, Draw it (v1.1), Specimen card (v1.1), photo input (v2).
12. Colour: cobalt #2447F5 as marks only, every state also has a word. UI text 14 px minimum at 4.5:1. Big mode toggle.
13. Share: family, Use and dials live in the URL hash.
14. Static downloads: nearest Google named instance, with the loss named.
15. One question to Dev (section 13): approve Saira and Nunito on the sheet.

## 1. Families

### 1.1 Tiles

| Tile | Family | Axes in the file (min..file default..max) | Dials | Italic |
|---|---|---|---|---|
| Plain | Roboto Flex | wght 100..400..1000, wdth 25..100..151, slnt -10..0..0, opsz 8..14..144, XTRA 323..468..603, YTLC 416..514..570, YTAS 649..750..854, YTDE -305..-203..-98, YTUC 528..712..760, YOPQ 25..79..135; GRAD, XOPQ, YTFI held at home | Thick, Wide, Lean (row), Openings, Middle height, Tall letters, Tails, Capitals, Thick-thin | slnt axis, same file |
| Squarish | Saira | wght 100..100..900, wdth 50..100..125 | Thick, Wide, Lean (two-up) | Saira-Italic, separate file |
| Rounded ends | Nunito | wght 200..200..1000 | Thick, Lean (two-up) | Nunito-Italic, separate file |
| Feet | Roboto Serif | wght 100..400..900, wdth 50..100..150, opsz 8..20..144; GRAD held at home | Thick, Wide, Lean (two-up) | RobotoSerif-Italic, separate file |

Fallbacks, if Dev says no on the sheet: Squarish, Science Gothic (wght 100..400..900, wdth 50..100..200, slnt -10..0, CTRS held at 0; 2,726 KB; has `rvrn`). Rounded ends, Fredoka (wght 300..300..700, wdth 75..100..125; 159 KB).

### 1.2 Home

| Axis | Home | Applies to |
|---|---|---|
| wght | 400 | all |
| wdth | 100 | Plain, Squarish, Feet |
| slnt | 0 | Plain |
| ital | 0 (upright file) | Squarish, Rounded ends, Feet |
| opsz | from Use: 14, 36, 144 | Plain, Feet |
| XTRA 468, YTLC 514, YTAS 750, YTDE -203, YTUC 712, YOPQ 79, XOPQ 96, GRAD 0, YTFI 738 | Roboto Flex file defaults | Plain |
| GRAD | 0 | Feet |

Home is written into `lib/clay/<family>.json`. The first paint applies home before the font is shown; the file default is never drawn.

### 1.3 Read from the files

| File | Size KB | Glyphs | Named instances | GSUB feature variations |
|---|---|---|---|---|
| RobotoFlex[13 axes].ttf | 1,787 | 948 | 20, all wght at wdth 100, upright and slnt -10 | yes (`rvrn`) |
| Saira[wdth,wght].ttf | 484 | 897 | 9 wght at wdth 100 | yes (`rvrn`) |
| Saira-Italic[wdth,wght].ttf | 535 | 898 | | |
| Nunito[wght].ttf | 277 | 1,103 | 8 wght, 200 to 900 | no |
| Nunito-Italic[wght].ttf | 282 | 1,103 | | |
| RobotoSerif[GRAD,opsz,wdth,wght].ttf | 3,945 | 1,264 | | no |
| RobotoSerif-Italic[GRAD,opsz,wdth,wght].ttf | 4,680 | 1,243 | | |
| Fredoka[wdth,wght].ttf | 159 | 335 | | no |
| ScienceGothic[CTRS,slnt,wdth,wght].ttf | 2,726 | 1,321 | | yes (`rvrn`) |

Consequences. Roboto Flex and Saira swap glyphs along their axes, so every render in the sweep and in the query goes through shaping (`font.layout(text, features, variation)`), never `glyphForCodePoint`, and the sweep checks that glyph ids stay constant across a live range (9, check 9). Named wdth stops do not exist, so readouts are tracks (2.3). Roboto Serif is the heaviest download and needs the Latin subset most (10.1).

## 2. The control model

### 2.1 Dials

| Dial | Axis | Ends | Verb | Definition (shown under the row on first hover, read by screen readers) | Where it may show |
|---|---|---|---|---|---|
| Thick | wght | hairline to black | Thicker | How heavy the strokes are | every letter |
| Wide | wdth | narrow to wide | Wider | How much room each letter takes sideways | Plain, Squarish, Feet |
| Lean | slnt or ital | upright to leaning | More lean | Whether the letters slope to the right | all; row on Plain, two tiles elsewhere |
| Openings | XTRA | tight to roomy | Roomier | The space inside letters like a, e and o | a b d e g o p q c n m u h on Plain |
| Middle height | YTLC | short to tall | Higher middle | How tall small letters are next to capitals | lowercase with a body at x-height, Plain |
| Tall letters | YTAS | short to tall | Taller | How far b, d, h, k and l rise | b d f h k l, Plain |
| Tails | YTDE | short to long | Longer tail | How far g, j, p, q and y hang below | g j p q y, Plain |
| Capitals | YTUC | short to tall | Taller caps | How tall capital letters are | capitals, Plain |
| Thick-thin | YOPQ | even to varied | More thick-thin | How much thinner the flat strokes are than the upright ones | letters with a horizontal or curve, Plain |

Thick-thin moves YOPQ alone (verified: at wght 400 and 900, YOPQ 25 to 135 moves the e crossbar from 23 to 117 px and 53 to 146 px while the n stem stays at 91 and 180 px). It shows only where the sweep finds the horizontal-to-vertical stroke ratio rises monotonically and the stem moves less than one visible step.

Use: three tiles, Small text (opsz 14), Headings (36), Huge (144); sets specimen sizes and the matching steer. Tile note on Plain and Feet: "shapes tune to size".

### 2.2 Presence

A dial or handle exists for a family, letter and setting only where `lib/clay/<family>.json` says so. Absent, never grey. One line names where it lives: "Six more dials exist in Plain." Values are remembered across family switches and restored when a dial returns.

### 2.3 Readouts

No raw numbers. A position track: hairline, cobalt square at the value, end words. A stop name (Light, Bold, Black) appears when the value is within one sweep step of a named instance in the file. Hover shows the mono axis tag and value. Screen readers get name, definition, end words and percent of live range.

### 2.4 Direction, travel, targets

Out from the letter is more: stem outer edge for Thick, right side for Wide, top for Middle height, Tall letters and Capitals, bottom for Tails, the counter's inner edge toward the stem for Openings. Pointer movement is projected onto the handle's axis. Keyboard: Right and Up are more; Tails uses Down, and the callout says so. A handle must travel at least 80 px across its live range at the zoomed scale, else it is a row in the bottom strip. Handle squares are 12 px drawn, 24 px hit area, 44 px minimum between centres; marker square 8 px; Big mode scales all by 1.5.

### 2.5 Undo, pins, share

A drag, a word-drag, or a run of arrow presses within 400 ms is one undo step. Cmd or Ctrl Z. Reset restores family, Use and every dial to home. Double-click a row label resets that dial. Pins store family (or both families), Use and dials, draw the word in their own family, up to eight in a strip along the sheet's bottom edge. The URL hash holds the same state, so a link reproduces the letter.

## 3. Word view

Top bar: word input; a second small field "or start from a font you know"; status text naming letter and family; "Closest to this", which reads "See all" once the live shortlist shows and "Match again · changed" when the full list is stale.

Sheet: white, hairline grid below a wght 100 stroke in opacity. The word black at size W (6.1), baseline on a major grid line. Marker: cobalt square 8 px from the marked glyph's measured top-right corner, leader to "carries the most character · drag to shape · double-click to open". Hovering any letter draws a hairline box with "double-click to open"; the cursor is a zoom cursor on letters and a four-way arrow on the marked letter.

Specimen strip below the word: a fixed neutral sentence at Small text and the person's word at Headings, live.

Rail: Character tiles (3.1); Use tiles; Thick, Wide, Lean rows; More (Openings, Middle height, Thick-thin, as the family allows); Pin this, Undo, Reset; footer "Every change here reaches all the letters of your word." Scrub rows: drag anywhere, click jumps, arrows step by one sweep step, Shift by five, capture releases at the live end with "That is as far as this letter goes".

After any change, one line under the word says what changed from the dial deltas: "Thicker and a little wider." It teaches the words by use.

### 3.1 Character tiles

Each tile draws the marked letter in its family at the current Thick and Wide (clamped to that family). Plain preselected. Click selects; Shift-click or the "+ and" link selects a second. On a switch the old letter stays as a hairline ghost for one second, then becomes a pin if any dial had moved.

### 3.2 Drag the word

The marked letter is a pad. Pointer down on its ink and drag: vertical movement drives Thick, horizontal drives Wide (on Rounded ends, horizontal does nothing and the cursor is a vertical arrow). 240 px of travel is the full live range on each axis (by eye). The word follows live; the rows follow the word. At a live end the axis stops and the limit line shows. This is the first move a first-time person makes, without finding a rail or learning that a letter opens. Double-click still zooms; the drag starts only after 6 px of movement so a double-click never shapes.

### 3.3 Two tiles

With two tiles selected: the sheet draws the word twice, stacked, first tile above, under the line "No font can be both. We will look for one." The rail shows the intersection of the two families' dials (Thick always; Wide and Lean where both have them). Word-drag acts on the top word and the bottom follows on shared axes. Double-click opens the first tile's letter with the second drawn as a hairline ghost behind it; handles are the first tile's. The live shortlist and Yours are hidden. Pin and the URL hash store both families.

### 3.4 Start from a font you know

The second field accepts a font name. The build precomputes, for every library family and for a list of system fonts measured offline (Arial, Calibri, Cambria, Georgia, Helvetica, Times New Roman, Verdana, Segoe UI, Trebuchet, Garamond), the nearest tile and dial values from the reachability grid in `matching-final.md`. Choosing a name lands the clay there, shows "Starting near Calibri", and the person shapes from a letter they recognise. Unknown names fall back to a search of the library list.

## 4. Zoomed view

Full-width sheet, no rail. Letter in the upper two thirds, left of centre; callout margins at least 220 px; size strip in the bottom third (the letter in a short line of the word at Small text, Headings, Huge); bottom strip with Zoom out, rows for dials with no handle here, Lean tiles on ital families, Undo, More handles, and the line "Only this letter shows while you edit. The whole word changes when you zoom out."

Handles: squares on the measured ink edge they move, anchors from the shaped outline at the current axes every frame; leaders straight out to the nearest margin, sliding along the edge or demoting if they would cross ink; callouts spread, never overlapping. Default handles: Thick, Wide, Lean where present, plus the two of Openings, Middle height, Tall letters, Tails, Capitals, Thick-thin with the largest visible effect on this letter; five at most; the rest behind More handles; one handle per repeated part ("all three").

Feel: the edge follows the pointer one to one; a hairline ghost of the start outline stays through the drag and fades 500 ms after release; dead stop at the live end. Scale is computed from the live extremes of every handle that could show on this letter, so nothing rescales during a drag or when More handles opens.

Learning: verb callouts; hovering or Tab-focusing a handle draws a hairline ghost of the letter at the far end of its range in the more direction; cursor is a two-headed arrow on the axis. Callouts show in full on the first open of a session, then fade to label and return on hover or focus.

Marked letter: sans tiles a, then e n o g H; serif tile g, then a e n o H; else the first letter. Any letter opens; a repeated letter opens the marked one. Roboto Flex has a single-storey g and double-storey a; Roboto Serif a double-storey g; the tiles show it and the nudges "one-storey g" and "two-storey g" let the person ask for either.

## 5. Matching and results

### 5.0 Measured starting point

The library and matcher exist (`library-v1-results.md`, raw evidence in `scripts/reports/`, eye sheet `spike/contact-v2.png`): 1,572 matchable families, 6,993 files, 309 near-duplicate families collapsed into aliases, 98 percent OFL. `findClosest(queryGlyphs, library, {limit, exclude, groupScale, canvas})` returns `{font, why, weak, match}`. A query costs about 7 letters by 30 ms, so matching runs in the worker (10.3) and the live shortlist debounce (5.6) stays at 600 ms. Everything below starts from the measured open problems, each with a decision and the test that proves it.

| Problem (measured) | Decision | Test that proves it |
|---|---|---|
| Percentages read low: a real neighbour's top result has median match 30, quartiles 8 to 66, 27 percent flagged weak; calibrated against each font's nearest neighbour, which near-duplicates pull low | d_close is the median distance to the **fifth** nearest neighbour outside the family, its aliases and its superfamily. Bands and the "under 60" rule stay, because they are defined by what the number means, not by today's spread | Run every library family as a query with itself, aliases and superfamily excluded. Top-1 median lands in 75 to 89; upper quartile below 95; "under 60" on fewer than 20 percent of top-1 rows. Until this passes, no percentage is shown anywhere and rows show band words only |
| p=4 lost to p=2 on every train row of the noise test (46 vs 60); one noisy group decides | **p=2**, with the one-big-miss case handled by the explicit vetoes in 5.2 instead of by the norm. A veto is a visible class or threshold miss, which is what p=4 was standing in for | Noise test at or above 60 family top-1 on all seven letters. Eye set Q5 (wide light) returns wide fonts in slots 1 to 3, which the width veto must carry now that the norm will not |
| Heavy rounded query regressed to Orbitron 900, Audiowide, Sour Gummy; same class as C25 | The shipped roundness group is a corner-count artefact (critique part 3). **Remove it.** Build **terminal shape** (end caps of the n stem and g tail: flat, round, flared) and **bowl fullness** (5.2) in its place. The Rounded ends tile makes the heavy rounded query a real Nunito Black, so the query itself now carries round terminals | Query Nunito at wght 1000 with Nunito and Nunito Sans excluded: Fredoka, DynaPuff, Baloo or M PLUS Rounded class in slots 1 to 3. Heavy rounded and thin squarish rounded join the eye set and must have squarish or rounded fonts in the top three |
| Roundness group: all-seven train top-1 46 percent as shipped, 55 at 0.25x, 64 removed | Removed (above). The two replacement groups ship only if they do not lower the train number | Train top-1 at or above 64 with terminal shape and bowl fullness on |
| a and g build gate flips for 56 of 315 jittered queries (18 percent) | Query side needs no detection: the clay's construction is a known fact per family and is stored in `lib/clay`. Library side: detect storey on three jittered renders, take the majority, mark "unknown" when they disagree, and never gate on unknown. The gate becomes a tolerance penalty through `groupScale`, not a hard cut | Library-side flips under jitter below 3 percent; zero on the query side by construction |
| Weight-ignored sibling test regressed, median rank 302 against the spike's 47 | Guard only, not a release gate. Find the groups that move with weight (expected: openings, contrast, bowl fullness) and regress stem ratio out of them at build | Median sibling rank below 100 after normalisation; the eye set must not lose a slot |
| x-height ratio group not built | Build it: n height over H height, base weight 0.6 | Wide light eye query improves from 3 of 5; train top-1 does not drop |
| Alias false positives (bodoni-moda-sc into bodoni-moda) | Never collapse a family whose n and N masks overlap (small caps or caps-only detector from the critique) and never collapse across a differing storey | Zero collapses between families whose n/N overlap differs |
| Matcher has not run in a browser | Worker build with the measured TTFs and the library file; measure before the shortlist is enabled | Under 300 ms per query on Dev's machine at the Worker boundary, or the shortlist is disabled and the button alone remains |

Library sources, decided from the same file: join League of Moveable Type and Velvetyne (OFL only); Fontshare only as OFL subset linked out; skip 1001 Fonts, 1001 Free Fonts, Open Foundry. Each licence is read before a family ships. Not legal advice.

### 5.1 Query

Seven glyphs (a e g n o H O) shaped from the clay at the current axes, rasterised into the canonical frame, measured with the library's code in a Web Worker from the measured TTF (10.1). With two tiles, each group value is the mean of the two families' values at the shared dials; groups where they differ by more than one library standard deviation are marked "either" and get a tolerance band of that width instead of a mean. Gates: serif presence from the tile; italic class from Lean; charset of the person's word (missing letters drawn hollow and named); storey soft-gated.

### 5.2 Frozen constants

Written by the library build into `lib/match/constants.json`; by eye values are the first run. Library statistics (standard deviations, d_close, d_far) are computed from the library file at build, never typed.

| Group | Measure | Base weight (by eye) | Veto threshold |
|---|---|---|---|
| Weight | stem over x-height | 1.0 | 1.5 SD |
| Width | aspect of n | 1.0 | 1.5 SD |
| Serifs | foot presence and length | 1.0 | any class mismatch |
| Slant | angle of n stem | 0.8 | class mismatch (upright, oblique) |
| Bowl fullness | bowl area over its box; share of straight contour | 0.8 | 2.0 SD |
| Contrast | thin over thick on o | 0.7 | 2.0 SD |
| Terminal shape | end caps of n stem and g tail: flat, round, flared | 0.6 | class mismatch |
| X-height ratio | n height over H height | 0.6 | 2.0 SD |
| Openings | counter area and aperture fraction, stem ratio regressed out | 0.5 | 2.0 SD |

Removed: the shipped roundness group (corner count). Corner radius returns only as a measured, radius-based group if the train number holds with it on; until then "Softer corners" nudges on terminal shape and bowl fullness.

| Constant | Value | Meaning |
|---|---|---|
| p | 2 | norm across groups; vetoes carry the one-big-miss case |
| k | 0.5 | rarity multiplier 1 + k·abs(z), z the query's z-score on the group |
| tag | 2.5 | multiplier on the group a tile defines: bowl fullness for Squarish, terminal shape for Rounded ends, serifs for Feet |
| cap | 3 | combined multiplier is max(rarity, tag), capped |
| steer | 0.3 | weight added toward text or display faces by Use |
| d_close | median distance to the fifth nearest neighbour outside family, aliases and superfamily | "what close looks like" without duplicates pulling it to zero |
| d_far | median random-pair distance | |
| m | 0.10 · d_close | stability margin |
| band | 20 judged rows | minimum before stage two calibration is trusted |

Stability mechanism: compute the new ranked list; any family whose new distance is within m of the old cut keeps its old position; the rest fill the remaining slots in new order.

### 5.3 Exclusion

Excluded from ranked results: the clay family and its named superfamily (for Plain: Roboto, Roboto Condensed, Roboto Serif, Roboto Mono, Roboto Slab; for Feet the same list; for Squarish: Saira, Saira Condensed, Saira Semi Condensed, Saira Extra Condensed; for Rounded ends: Nunito, Nunito Sans). Other families within d_close of the clay's home show normally, with the grey words "near where you started" while no dial has moved more than one step. Yours, above the list: "Yours: Roboto Flex at your settings. Free, already a font." with Get it.

### 5.4 Percentage

Meaning: how likely a designer would call this a close match. Stage one: 95 at or below d_close, 30 at d_far, linear in log distance between, shown only once the neighbour test in 5.0 passes; before that, band words only. Stage two: a monotonic fit from distance to the share of eye-set rows Dev judged acceptable, used only once each band (60 to 74, 75 to 89, 90 and up) has at least 20 judged rows; until then stage one. Test on held-back queries: rows at 90 and up acceptable at least nine in ten.

No number is shown when any group passes its veto, fewer than three letters survive the gates, or any group is flagged beyond the library; the row shows a grey band word instead: "same spirit" for the first two, "nearest we have" with the dial named for the third. Numbers under 60 show as "under 60" in grey. Display: integer and band word in mono beside the family name; 90 and up "near twin", 75 to 89 "close", 60 to 74 "same spirit". Number and sentence read the same group distances. Empty case: header "Nothing is really close. Nearest we have:", best row with its band, its difference first, and the two nudges most likely to help from the vetoing group.

### 5.5 Rows and actions

Mono rank; family and chosen style; percentage or band; the person's sentence set so its x-height equals the clay's at that row size (x-height per family precomputed); one sentence, one match and one difference, highest-multiplier group first; two spec bars (thickness, width: cobalt tick yours, black theirs); licence; Compare, Try, Not this, Get it, Shape this (variable fonts only).

Nudge chips: Rounder, Squarer, Softer corners, Rounded ends, One-storey a, Two-storey g; on serif results Softer joins, Sharp joins. A chip re-queries the whole library with that group's multiplier at the cap, applies the stability rule, and says "moved up 3".

Not this: raises the weight of the group where that font is farthest from the query, re-queries, greys the row. Shape this: makes the variable result the clay with rows only (Thick, Wide, Lean as the file allows), no handles, with the note "Handles are for the four starting letters"; its home is wght 400, wdth 100, and its superfamily joins the exclusion list.

### 5.6 Live shortlist

Three tiny rows in the sheet's right margin follow the dials with a 600 ms debounce and the stability rule. Hidden while the full column is open or two tiles are selected; disabled with the word "Measuring" until the measured TTF has loaded (10.1).

### 5.7 Compare and Try

Compare stacks the row's font under Yours at the same size and baseline; a second tick adds a third line; Overlay draws the result's marked letter in hairline over the person's, huge; Blink (space bar or a toggle) flips yours and theirs in the same place at the same size, 400 ms apart, until released. Try expands the row: the sentence at Headings, a paragraph at Small text, one word at Huge, light or dark paper; the paragraph is the neutral text or anything the person pastes into the Try field; Try loads the family's full Latin subset first and shows the hairline placeholder until then. Compare followed by Get it or another Compare is recorded in the browser only (shown percentage, chosen), exportable from test sessions to refit the curve.

### 5.8 Get it

A tool chip chosen once (Figma, Word, Docs or Slides, Canva, PowerPoint, Website, Just download). Office tools get the nearest Google named instance and the loss named: "Word gets Roboto Flex Bold. Your Wide and Openings are not in that file. The web version keeps them." Website: Fontsource line and CSS, `font-variation-settings` for Yours. Canva: "Search this name in Canva". Licence on every row.

## 6. Composition and sizes

### 6.1 Sizes

S = 14, H = 36, X = 144 px, and W. W is the size at which the word at the family's maximum Wide spans 92 percent of the sheet width, capped so cap height is at most 36 percent of sheet height; computed once per word and family, never while dials move. The default word never wraps. Sentences wrap at word boundaries only. Result rows at H; Try and the size strip at S, H, X; the zoomed scale is fixed per letter (section 4).

### 6.2 One sheet

Both views are the same sheet; zooming is a camera move; baselines share a major grid line; the baseline and middle line run across the word unlabelled and are labelled when zoomed. The results column is the sheet continued to the right: sheet 55 percent, column 45 percent.

### 6.3 At 1440 by 900

Word baseline near 55 percent of sheet height; specimen strip from 65 percent; rail full height with groups on grid rows; shortlist in the right margin; zoomed letter in the upper two thirds with the size strip below.

## 7. Motion

Within a family: no easing during a drag; discrete changes interpolate axis numbers over 240 ms ease-out in one requestAnimationFrame loop writing `font-variation-settings` once per frame; letters are spans, FLIPped from old to new positions over the same 240 ms. Across families: 180 ms morph of shared axes to the clamped values, then a 240 ms per-letter crossfade with 20 ms stagger and FLIP to new advances; baseline shared. Ital switches on Squarish, Rounded ends and Feet are a change of file, so they use the crossfade only, no stage one. Reveal: zoom out 560 ms, then crossfade and FLIP from the zoom-in state, 30 ms stagger from the edited letter; 200 ms and no stagger while the column is open. Performance: text is browser-rendered; transforms and opacity only during motion; one layout read per change; anchors from the worker the frame after a value changes, cached per rounded axis vector; ghosts computed once per hover or drag start. Reduced motion: no slides, stagger or crossfade; a 120 ms opacity dip marks a family switch or reveal.

## 8. Visual world and accessibility

The specimen owns contrast; chrome is cool grey and hairline; specimens on white, or dark paper in Try. Cobalt #2447F5 as marks only (active handle, marker, selected rule, focus ring, stale marker, your tick), never behind text; every cobalt state also has a word ("changed", "selected"). Mono for measurement, one UI sans at 14 px minimum and 4.5:1; chrome grey no lighter than that. Big mode scales rail, tracks, squares and callouts by 1.5 and leaves the sheet. Tab focus does what hover does. Copy: one match, one difference, dial names, rare thing first, no "and" lists, no type terms, no readability claims.

## 9. The sweep

Node, in CI, over the four clay families (plus the two fallbacks), every Latin character in each cmap, every dial, every pair, and the corner sets in check 6. Output `lib/clay/<family>.json`: per character the default and More handles, live ranges, step lists, anchor rules, verbs, directions, pair and corner clamps, zoomed scale, home. Any fail blocks release.

Rendering: fontkit on the TTF; every string shaped with `font.layout(text, ["liga","rvrn","locl"], variation)`; returned glyph ids rasterised into the canonical frame at 512 px x-height. Never `glyphForCodePoint`. 24 steps per axis.

1. **Presence and live range.** Step change = XOR area over the home glyph's ink area; visible threshold 0.8 percent (by eye); live range is the longest run of visible steps; fewer than three means not shown.
2. **Jumps.** A step above 12 percent (by eye) gets extra steps until none jumps. One arrow press is one step.
3. **Distinctness.** Per-step mask correlation above 0.9 between two dials on a letter hides the lower-ranked; inverse pairs show one.
4. **Direction.** The named quantity rises monotonically with more; a synthetic 100 px drag in the more direction increases it on every letter where the handle shows.
5. **Travel.** At least 80 px across the live range at the zoomed scale, else row.
6. **Components.** Ink component count and counter count equal the home counts at every single setting, every pair corner and edge midpoint, and the all-more and all-less corners of every dial set on every family; on Plain also every corner of the k dials present on the letter (2^k, k at most 9). Where a corner fails, the clamp is recorded on the last-moved dial and applied live with the dead-stop message (verified need: wght 1000 with wdth 25 keeps a, g, B open; adding XTRA 323 closes them).
7. **Fit.** Bounding box within the sheet at the scale from all possible handles; anchors 60 px from edges; 44 px between centres; no leader crosses ink; callouts do not overlap.
8. **Named stops.** Each fvar instance sits where the file says.
9. **Glyph identity.** The shaped glyph id of every character is constant across each live range; a change is a jump and clips the range at the swap.

## 10. Loading

### 10.1 Fonts

Two builds from one `pyftsubset` run per family, Latin range, so display and measurement cannot drift: a woff2 for display and an uncompressed TTF for the worker, both served with brotli. Load order: Plain woff2, then Plain TTF, then the other three tiles' woff2, then their TTFs; italic files on first hover of a Lean tile; Try subsets on demand. Subset sizes are measured in the build and written to `lib/clay/sizes.json`; unsubset sizes are in 1.3. States: until Plain woff2 loads, the word shows in the system sans inside a box sized from Roboto Flex's metrics, rows disabled, one line "Loading the letter"; each tile shows a hairline square with its family name until its woff2 loads; anchors and the shortlist show "Measuring" until the TTF loads. Nothing in the rail moves when a font arrives.

### 10.2 Result fonts

Each row loads through the Google Fonts CSS API with `text=` set to the person's sentence; until loaded, a hairline bar at the row's x-height and the sentence's width, never fallback text. Try loads the full Latin subset first.

### 10.3 Library

`public/library/index.json` today (1.54 MB, 1,572 families) plus, per family: x-height, storey with its confidence, named instances, nearest tile and dials, and the system-font table for 3.4. Brute-force matching in the worker; the measured 210 ms per query is the budget to beat before the shortlist is enabled (5.0).

## 11. Acceptance

| # | Closed by |
|---|---|
| C1, C26 | Real variable fonts; no outline construction. |
| C2 | Charset from cmap; sweep fails on a missing glyph. |
| C3, C14 | Rows, tiles, anchored handles; tracks, no raw numbers outside hover and the result percentage. |
| C4 | Track with the file's stop when near; sweep check 4. |
| C5, C11, C13 | Designer ranges; sweep checks 1 to 9, with corner sets in check 6 catching triples. |
| C6, C12 | Anchors from the shaped outline; spacing and leader rules; check 7. |
| C7 | Size strip; specimen strip. |
| C8, C35 | Marker from the glyph rect with leader; baseline on grid; status fixed. |
| C9 | One sheet, two zoom levels. |
| C10, C33 | Presence from the table, absent not grey; values remembered; grouped undo; Reset to home. |
| C15, C32 | Scale from all possible handles. |
| C16, C28, C29 | Direction, projection, one-to-one travel, 80 px rule, synthetic drag. |
| C17 | Status names letter and family. |
| C18 | Name, definition, end words, percent announced; Tab does what hover does. |
| C19 | Fixed. |
| C20 | Paper only; cobalt as marks with words. |
| C21 | One match, one difference. |
| C22 | Yours on the sheet; stack, overlay, blink. |
| C23 | Column beside the sheet; full list changes on click; shortlist separate. |
| C24 | Matched x-height; hairline placeholders. |
| C25 | Two tiles with blended query and "either" bands, bowl-fullness and terminal groups, multiplier, Not this, nudges; eye set must return thin squarish rounded-ended fonts in the top three before it is marked closed. |
| C27 | Font spacing; quiet grid. |
| C30 | Marker tag with drag and double-click words; hover box; cursors; word-drag makes the first move without either. |
| C31 | One name per thing; no rail zoomed; five handles. |
| C34 | W from maximum Wide; never refits; default word never wraps. |
| C36 | Tiles are letters named Plain, Squarish, Rounded ends, Feet. |
| C37 | Rounded ends on Nunito (wght 200 to 1000), terminal group, nudge, Shape this. |
| N1 to N17 | As v2, with N18 replaced: Casual is cut, and check 9 catches any remaining glyph swap in Roboto Flex and Saira. |

New in v3: N19 file defaults drawn before home (home applied before first paint); N20 two-tile editing undefined (3.3); N21 Shape this with runtime presence (rows only); N22 near-home fonts hidden (5.3); N23 triples (check 6 corners); N24 mid-word wrap (6.1); N25 silent loss in Get it (5.8); N26 Try missing glyphs (5.7); N27 italic files unloaded (10.1); N28 marked letter absent (section 4 fallback order); N29 hover-only teaching (Tab focus, definitions); N30 colour-only stale cue (words); N31 word-drag fires on double-click (6 px threshold).

## 12. Risks

1. Saira and Nunito unseen at extremes; fallbacks named.
2. Only Plain is deep; other tiles show two or three handles.
3. Every by-eye value is a first value: 0.8 and 12 percent, 0.9, 80 px, 240 px word-drag, base weights, vetoes, k 0.5, tag 2.5, cap 3, steer 0.3, m 0.10.
4. The percentage is stage one until 20 rows per band are judged.
5. Two-tile blends and "either" bands have no evidence; the eye set gains two blended queries.
6. Rarity can over-fire on dull rarities; the cap guards.
7. Google Fonts `text=` loading is a dependency; placeholders cover failure.
8. Word-drag may be found by nobody or fight text selection; the 6 px threshold and cursor are the mitigation; first sessions decide whether it stays.
9. Start-from-a-font depends on the reachability grid being built; without it the field is hidden.
10. The matcher's measured numbers are below the bar today (top-1 median 30, 27 percent weak, heavy rounded wrong). Every decision in 5.0 is a hypothesis with a test; if the neighbour test does not pass after the five changes, percentages stay hidden and the product ships with band words, which is still honest.
11. Moving from p=4 to p=2 shifts the burden to the vetoes. If the eye set shows a visible one-group miss slipping through, the fix is a tighter veto threshold on that group, not a return to p=4.

## 13. The one question

Look at Saira and Nunito drawn as "a" at Thick hairline and Thick black on the sheet. Yes or no to each. No to Squarish gives Science Gothic; no to Rounded ends gives Fredoka.

## Appendix: who uses this

Reasoned judgement, not research.

| Group | Breaks today | Gets | Would stop them | Result path | Test |
|---|---|---|---|---|---|
| Designers without type training | can see it, cannot name it | word-drag, two tiles, reasons | random lists, ugly extremes | Figma | 5 sessions |
| Word and Docs users | names, not looks | start from Calibri, static files, install steps | design-tool look | Word install, Docs More fonts | 3 sessions, never zooming |
| Students | articles say Garamond | Use: small text | slow, account | Word or Canva | 2 sessions |
| Small business in Canva | scroll, no upload on free | search name in Canva | result not in Canva | Canva | 2 sessions |
| Marketers | mood, not letterform | link in the URL, Compare, paste text | no compare | hand to designer | 1 session |
| Brand teams | stigma of free | reasons, licence, Yours | free ceiling | brand book, CSS | 1 session |
| YouTubers | heavy, reads small | Thick to 1000, size strip | text faces | install or Canva | 1 session |
| Slide makers | font missing on the day | Embed fonts step | fear | Slides | 1 session |
| Developers | default to Inter | CSS and variation settings | no code | Fontsource | 1 session |
| Teachers | one-storey a | nudge | design-tool look | Word | 1 session |
| Low vision, keyboard, colour-blind, non-native | small grey chrome, hover-only, colour-only, idioms | 14 px, Big mode, Tab as hover, words on states, definitions | | | string and keyboard review |
| Wedding makers | want script | little | no script | print | not in v1 |
| From memory or photo | paid matches | shaping; Draw it v1.1 | no photo | any | 2 sessions with the real font revealed |
