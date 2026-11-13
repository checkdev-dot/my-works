# Controls v2: build spec

2026-10-31. Replaces `controls-v1.md`. Usable alone. Binding inputs: `PRODUCT.md`, `matching-final.md`, `failure-cases.md` (C1 to C37). Axis ranges checked live at `api.fontsource.org/v1/variable/<id>`; named instances and file sizes read from the font files in `google/fonts` with a small fvar reader (section 1.2). Thresholds marked "set by eye" are first values to be tuned once with Dev on the sheet, then frozen in `lib/clay/*.json` with the reason.

## 0. Decisions

1. Letters are real variable fonts. The person shapes a real letter; the dials are the font's own axes.
2. Top-level choice is **Character**, a row of four letter tiles: Plain (Roboto Flex), Squarish (Saira), Rounded ends (Nunito), Feet (Roboto Serif). Two more behind "More character": Casual (Recursive, with MONO pinned to 0 and CRSV pinned to 0), Soft feet (Fraunces). Style names are gone.
3. A person may select **two tiles**. The sheet shows both letters side by side under one line: "No font can be both. We will look for one." The query is the measured blend. This is how C25 closes.
4. Dials: Thick, Wide, Lean, Inside, Middle height, Tall letters, Tails, Capitals, Thick-thin, Casual, Soft. Same word for the same thing in every family and both views. Cut: Dark (GRAD), Upright stroke (XOPQ), Crossbar, Edge, Roundness, Thinness, Surprise me, typed numbers.
5. Word view: scrub rows. Zoomed view: handles on the letter, no rail, at most five by default. A control exists only where the sweep (section 9) proves it acts.
6. The clay family and its near-twins are excluded from ranked results. "Yours" is a quiet line above the list.
7. Results: a column beside the sheet, type-tester rows in the person's sentence at matched size, a calibrated percentage with caps, one match and one difference, Compare, Try, Not this, Get it. A live shortlist of three follows the dials in the sheet margin.
8. Colour: cool cobalt (#2447F5) as marks only. Specimens on white or dark paper. No fills.
9. Marked letter: "a" on sans tiles, "g" on serif tiles.
10. Static downloads: nearest named instance Google already ships. No server-side instancing in v1.
11. "Draw it" (scribble a letter to start) is v1.1, after the first five designer sessions.
12. One question to Dev (section 14): approve Saira and Nunito on the sheet.

## 1. Families and axes

### 1.1 Clay families

| Tile | Family | Axes (min..default..max) | Dials here | Marked letter |
|---|---|---|---|---|
| Plain | Roboto Flex | wght 100..400..1000, wdth 25..100..151, slnt -10..0, opsz 8..14..144, XTRA 323..468..603, YTLC 416..514..570, YTAS 649..750..854, YTDE -305..-203..-98, YTUC 528..712..760, YOPQ 25..79..135 (GRAD, XOPQ, YTFI unused) | Thick, Wide, Lean, Inside, Middle height, Tall letters, Tails, Capitals, Thick-thin | a |
| Squarish | Saira | wght 100..400..900, wdth 50..100..125; italics as a separate file | Thick, Wide, Lean (two-up) | a |
| Rounded ends | Nunito | wght 200..400..1000; italics as a separate file | Thick, Lean (two-up) | a |
| Feet | Roboto Serif | wght 100..400..900, wdth 50..100..150, opsz 8..14..144, ital 0..1 (GRAD unused) | Thick, Wide, Lean (two-up) | g |
| Casual (More) | Recursive | wght 300..400..1000, slnt -15..0, CASL 0..1; MONO pinned 0, CRSV pinned 0 | Thick, Lean, Casual | a |
| Soft feet (More) | Fraunces | wght 100..400..900, opsz 9..14..144, SOFT 0..100, ital 0..1 (WONK unused) | Thick, Lean (two-up), Soft | g |

Why these: Roboto Flex is the only open family with inner-letter axes. Saira is the only squarish open variable family found with a width axis. Nunito has true rounded terminals and wght 200 to 1000, so it reaches both the thin C25 letter and the heavy thumbnail; Fredoka (wdth 75..125, wght 300..700) is the fallback if Nunito's ends read too subtle on the sheet. Roboto Serif shares wght, wdth and opsz with Roboto Flex, so a Feet switch keeps the person's work. Recursive's CRSV defaults to 0.5 (auto), which flips a, g, l, y to cursive forms when slnt passes about -14; pinning CRSV to 0 removes the flip. Fraunces has the only corner-softness axis with feet.

Library fonts with wdth (for the record): Anybody, Archivo, Mona Sans, Hubot Sans, Encode Sans, Inconsolata, Cabin, Merriweather, Noto Sans and Serif, Science Gothic, Nunito Sans. Most others are wght plus ital. Not variable on Fontsource: Amstelvar, Tomorrow, Michroma, Chakra Petch, Kanit, Zilla Slab, M PLUS Rounded, Varela Round.

### 1.2 Evidence from the font files

Read from the TTFs in `google/fonts` (fvar and name tables):

- Roboto Flex: 20 named instances, all wght steps at wdth 100 (Thin to ExtraBlack, upright and slnt -10). No named wdth stops. 948 glyphs. 1,787 KB TTF.
- Saira: 9 wght instances at wdth 100. 897 glyphs. 484 KB.
- Nunito: 8 wght instances, 200 to 900 (axis to 1000). 1,103 glyphs. 277 KB.
- Recursive: 64 instances across MONO, CASL, wght, slnt; italic instances set slnt -15 and CRSV 1. 2,379 KB.

Consequences: readouts cannot rely on named stops (2.3); the Character row cannot draw until its fonts load (10.1); Recursive must be partially instanced to drop MONO and CRSV before shipping (10.1).

## 2. The control model

### 2.1 Dials

| Dial | Axis | Row ends | Verb on the handle | Where it may show |
|---|---|---|---|---|
| Thick | wght | hairline to black | Thicker | every letter, every family |
| Wide | wdth | narrow to wide | Wider | families with wdth |
| Lean | slnt, or ital as two-up | upright to leaning | More lean | slnt families as a row; ital families as two tiles |
| Inside | XTRA | tight to roomy | Roomier | letters with a counter or an arch: a b d e g o p q c n m u h |
| Middle height | YTLC | short to tall | Higher middle | lowercase with a body at x-height |
| Tall letters | YTAS | short to tall | Taller | b d f h k l |
| Tails | YTDE | short to long | Longer tail | g j p q y |
| Capitals | YTUC | short to tall | Taller caps | capitals |
| Thick-thin | YOPQ | even to varied | More thick-thin | letters with a horizontal or a curve: e f t z a s o c A E F H T, arches of n m h |
| Casual | CASL | formal to hand | Looser | Casual tile |
| Soft | SOFT | crisp to soft | Softer | Soft feet tile |

Thick-thin is YOPQ alone. The reviewer proposed YOPQ as a fraction of the current XOPQ; that does not work in Roboto Flex because wght thickens stems while the XOPQ coordinate stays at 96, so a ratio of coordinates is not a ratio of strokes. YOPQ alone thins or thickens horizontals and leaves stems where Thick put them. The sweep shows it only where the measured horizontal-to-vertical stroke ratio moves monotonically and stem width moves less than one visible step.

Use is a three-way tile set, not a dial: Small text (opsz 14), Headings (opsz 36), Huge (opsz 144) on families with opsz; it also sets the specimen sizes and steers matching (5.3).

### 2.2 Presence

A dial or handle exists for a family, letter and setting only if the sweep table says so (section 9). Absent, never grey. One line names where it exists: "Six more dials exist in Plain." Dial values are remembered across family switches and restored when the dial returns.

### 2.3 Readouts

No raw numbers (C14). Every row and callout shows a position track: a hairline with a square at the current position and the two end words. When the value is within one sweep step of a named instance in the font file, the stop name appears beside the track (Light, Bold, Black). On Wide, Roboto Flex has no named stops, so the track alone is the readout. The mono axis tag and value appear on hover only. Screen readers get name, the end words, and the position as a percent of the live range (C18).

### 2.4 Direction

Out from the letter is more. The handle square sits on the edge that moves outward as the axis rises: the stem's outer edge for Thick, the right side for Wide, the top for Middle height, Tall letters and Capitals, the bottom for Tails, the counter's inner edge (moving toward the stem, which is outward for the counter) for Inside. Pointer movement is projected onto the handle's axis, so diagonal drags work (C29). Keyboard: Right and Up are more; Tails uses Down and the callout says so (C16, C28).

### 2.5 Travel

A handle must travel at least 80 px on screen across its live range at the zoomed scale. If it cannot, it is shown as a row in the bottom strip instead of a handle. This keeps Soft, Middle height and Thick-thin from running their whole range in a few pixels (C29).

### 2.6 Undo and pins

A drag, or a run of arrow presses within 400 ms, is one undo step. Cmd or Ctrl Z. Reset restores family, Use and every dial. Double-click a row label resets that dial. Pins save family, Use and dials, draw the word in their own family, and sit in a strip along the sheet's bottom edge; up to eight, scrolling, newest at left (C33).

## 3. Word view

Top bar: word input; status text naming the letter and family, never a pixel size (C17); "Closest to this" at right, reading "See all" once the live shortlist is showing (5.6).

Sheet: white, hairline grid at an opacity below a wght 100 stroke (C27). The word huge, black, baseline on a major grid line, size fixed per word (6.1). Marker: a cobalt square 8 px from the marked glyph's measured top-right corner, a short leader to "carries the most character · double-click to open". Hovering any letter draws a hairline box with the same words; the cursor is a zoom cursor over letters (C30, C8).

Specimen strip below the word: a fixed neutral sentence ("The quick onset of autumn surprised the whole town") at Small text and the person's word at Headings, in the current settings, live.

Rail, aligned to the sheet, top to bottom:

1. **Character**: four letter tiles drawing the marked letter in each family at the current Thick and Wide, Plain preselected. Click selects; click a second tile with Shift, or the "+ and" link under the row, to select two. "More character" reveals Casual and Soft feet. When two are selected, the sheet draws the word twice, stacked, and the line "No font can be both. We will look for one."
2. **Use**: three tiles. When the family has opsz the tile note reads "shapes tune to size".
3. **Thick, Wide, Lean** as scrub rows (Lean as two tiles on ital families).
4. **More**: Inside, Middle height, Thick-thin, Casual, Soft, as the family allows.
5. **Pin this, Undo, Reset.**
6. Footer: "Every change here reaches all the letters of your word."

Scrub row: label left, hairline track, cobalt square marker, end words, stop name when near. Drag anywhere on the row; click jumps; arrows step by one sweep step, Shift by five. Pointer capture releases at the live end with "That is as far as this letter goes".

When the family changes, the old letter stays on the sheet as a hairline ghost for one second, then becomes a pin if any dial had been moved. Switching is a comparison, not a replacement.

## 4. Zoomed view

Full-width sheet, no rail. Letter in the upper two thirds, left of centre. Callout margins at least 220 px each side. Size strip in the bottom third: the letter in a short line of the word at Small text, Headings and Huge, live. Bottom strip: Zoom out; rows for dials that have no handle on this letter or failed the travel rule; Lean tiles on ital families; Undo; More handles; the line "Only this letter shows while you edit. The whole word changes when you zoom out."

### 4.1 Handles

A square on the ink edge it moves. Anchors are measured from the real outline at the current axes, every frame: stem outer edge at mid x-height, rightmost ink at mid x-height, counter inner edge at its widest, the x-height crossing, ascender top, descender bottom, cap top, thickest horizontal. Leader straight out to the nearest margin; if the straight line crosses ink, the anchor slides along its edge until it does not, or the handle demotes to a row. Handle centres at least 44 px apart, or the lower-ranked demotes. Callouts spread in the margin and never overlap (C6, C12).

Default handles: Thick, Wide, Lean where the family has them, plus the two of Inside, Middle height, Tall letters, Tails, Capitals, Thick-thin with the largest total visible effect on this letter in the sweep. At most five. The rest behind More handles. One handle per repeated part ("all three" on m).

### 4.2 Feel

The edge under the square follows the pointer one to one. A hairline ghost of the starting outline stays through the drag and fades 500 ms after release. At the live end the square stops dead with the limit message. The sheet scale is computed from the live extremes of every handle that could show on this letter, including those behind More, so nothing rescales during a drag or when More opens (C15, C32).

### 4.3 Learning before dragging

Verb callouts. Hovering a handle draws a hairline ghost of the letter at the far end of its range in the more direction. Cursor is a two-headed arrow on the axis. Callouts show in full on the first open of a session, then fade to label and return on hover.

### 4.4 Which letter, what it teaches

"a" on sans tiles (stem, bowl, counter, x-height, a horizontal): Thick, Wide, Lean, Inside, Middle height, Thick-thin on Plain. "g" on serif tiles: feet, bowl, tail, two-storey construction in Roboto Serif. Any letter opens; a repeated letter opens the marked one. Letters teach by what they lack: "i" shows three handles, "H" shows Capitals and Thick-thin.

Construction: Roboto Flex has a single-storey g and a double-storey a; Roboto Serif has a double-storey g. The tiles show this, the crossfade carries it (7.2), and the result nudges "one-storey g" and "two-storey g" let the person ask for either.

## 5. Results and matching

### 5.1 The query

Seven glyphs (a e g n o H O) rendered from the clay at the current axes into the canonical frame and measured with the library's code. With two tiles selected, each group value is the mean of the two families' values at the shared dial settings; groups where the two differ by more than one library standard deviation are marked "either", which widens their tolerance band rather than averaging them into a shape neither has.

Gates: serif presence from the tile, italic from Lean, charset from the person's word (a result must have every letter or it shows hollow letters and says which), topology soft-gated by storey.

### 5.2 Groups and weights

Groups from `matching-final.md` plus two: **bowl fullness** (bowl ink-plus-counter area over its bounding box, and share of the outer contour with near-zero curvature) and **terminal shape** (flat, round, flared, from the end caps of the stem in n and the tail of g). Combiner stays p=4 over groups.

Weight per group = base weight times a character multiplier. The multiplier is max(rarity, tag), not their product: rarity is 1 + k times the query's z-score against the library, tag is 2.5 for the group that defines the selected tile (bowl fullness for Squarish, terminal shape for Rounded ends, serif group for Feet, corner radius for Soft feet, construction for Casual). The combined multiplier is capped at 3. The reason sentence names the highest-multiplier group first.

### 5.3 Use and exclusion

Use adds a steer of 0.3 of a group weight toward text faces (small text: lower weight range, taller x-height, opsz present) or display faces (huge). Not a gate.

The clay family, any family in the same superfamily (Roboto, Roboto Condensed, Roboto Serif, Roboto Mono for Plain) and any library family whose distance to the clay's default instance is under d_close are excluded from the ranked list. Without this every search tops out at its own family. "Yours" above the list reads: "Yours: Roboto Flex at your settings. Free, already a font. Get it." Nothing else about it.

### 5.4 Percentage

Meaning: how likely a designer would call this a close match.

Calibration, stage one (before judgments): d_close is the median nearest-neighbour distance across the library with clay superfamilies removed; d_far is the median random-pair distance. Percentage is 95 at or below d_close, 30 at d_far, linear in log distance between. Stage two: fit a monotonic curve from distance to the share of eye-set rows Dev judged acceptable; replace stage one. The calibration test, on the four held-back queries: rows at 90 or above are judged acceptable at least nine in ten; rows near 60 about half. If it fails, refit the curve, never adjust the display.

Caps: any group over its veto threshold, or fewer than three letters surviving the gates, or the "beyond the library" flag on any group: no number is shown. The row shows a band word in grey instead: "same spirit" for the first two cases, "nearest we have" for the third, with the dial named ("your Thick goes further than real fonts"). Numbers below 60 are never shown as numbers; they show "under 60" in grey. This prevents a column of 59s.

Display: integer and band word in mono beside the family name. 90 and above "near twin", 75 to 89 "close", 60 to 74 "same spirit". The number and the sentence read the same group distances, so "92, much rounder" cannot occur.

When nothing is close: header "Nothing is really close. Nearest we have:", best row with its grey band, its difference first, and the two nudges most likely to help, derived from the vetoing group.

### 5.5 Rows

Mono rank; family and chosen style; percentage or band; the person's sentence set so its x-height on screen equals the clay's at that row size (x-height per family precomputed offline from the rendered x); one sentence, one match and one difference, highest-multiplier group first ("Same squarish bowl. A little heavier."); two spec bars (thickness, width: cobalt tick for yours, black for theirs); licence; actions: Compare, Try, Not this, Get it, and Shape this when the font is variable.

Nudge chips above the list: Rounder, Squarer, Softer corners, Rounded ends, One-storey a, Two-storey g, and on serif results Softer joins, Sharp joins. A chip re-queries the whole library with that group's weight raised to the cap, then applies the stability rule, and says "moved up 3".

**Not this**: raises the weight of the group where that font is farthest from the query, re-queries, and greys the row. Three refusals teach the engine more than four dial moves and cost nothing.

**Between these two**: with two rows ticked, a link under the compare slot. The query becomes the mean of the two fonts' group values; the library is the clay.

**Shape this**: makes a variable result the clay with whatever dials it has. The dial words are the same, so nothing is relearned.

**Pick between two**: walks the top eight in pairs, eye-test style, for people who will not zoom.

### 5.6 Live shortlist

Three tiny rows in the sheet's right margin follow the dials with a 600 ms debounce and the stability rule (a one-step change moves at most three rows in the full list; the shortlist shows the top three of that). The button reads "See all". The full column never changes under the person without a click (C23); while it is open, the shortlist is hidden and the button reads "Match again" with a stale marker when dials move.

### 5.7 Compare and Try

Compare puts the row's font under Yours on the sheet, same size, same baseline grid; a second tick adds a third line. Overlay draws the result's marked letter in hairline over the person's, huge. Try expands the row: the sentence at Headings, a paragraph at Small text, one word at Huge, light or dark paper toggle. Every Compare followed by a Get it or a further Compare is recorded in the browser only (shown percentage, chosen or not), exportable from test sessions to refit the curve. Nothing leaves the browser in v1.

### 5.8 Get it

A tool chip chosen once (Figma, Word, Docs or Slides, Canva, PowerPoint, Website, Just download). Office tools: the nearest named static instance Google ships, with install steps and "Embed fonts" for PowerPoint. Website: the Fontsource line and CSS; for Yours, `font-variation-settings`. Canva: "Search this name in Canva". Licence name on every row. Yours offers the nearest named instance for office tools and the variable file for web; exact-value instancing with OFL renaming is not in v1.

## 6. Composition and sizes

### 6.1 One size system

Four sizes. S = 14 px (Small text), H = 36 px (Headings), X = 144 px (Huge), and W, the word size. W is computed once per word: the size at which the word at default Wide spans 78 percent of the sheet width, capped so cap height is at most 36 percent of sheet height. W never refits while dials move; a wider setting lengthens the word, and past the sheet edge it wraps to a second line at W with the baseline rule kept (C34). Result rows set at H; Try uses S, H, X; the size strip uses S, H, X; the zoomed letter's scale is the only free value and is fixed per letter (4.2).

### 6.2 One sheet

Both views are the same sheet. Zooming is a camera move into one letter; baselines share the same major grid line; the baseline and middle line are drawn across the word in word view and labelled only when zoomed (C9). The results column is the same sheet continued to the right.

### 6.3 At 1440 by 900

Word view: sheet from under the top bar to the pin strip; word baseline near 55 percent of sheet height; specimen strip from 65 percent; rail the full sheet height with groups spaced to grid rows; live shortlist in the right margin of the sheet. Zoomed: letter in the upper two thirds, size strip in the bottom third aligned to the word view's left margin. Results open: sheet 55 percent, column 45 percent.

## 7. Motion

### 7.1 Within a family

During a drag, no easing: the value is the pointer. For discrete changes (click to jump, arrow step, undo, pin, Use), interpolate the axis numbers over 240 ms ease-out in one requestAnimationFrame loop that writes `font-variation-settings` once per frame on the container. Each letter is its own span; before a change, record positions; after layout, transform each span from old to new position over the same 240 ms (FLIP). Wrapping uses the same slide.

### 7.2 Across a family

Two stages, 420 ms. First, 180 ms: the current family morphs its shared axes to the values the new family will clamp to (Flex wght 1000 to Serif 900), so the person sees the move. Then, 240 ms with a 20 ms stagger left to right: each span crossfades old family out and new family in while FLIPping to the new advances. Baseline shared, nothing moves vertically. Dials that leave the rail fade after the crossfade with the one-line note. The old letter's ghost (section 3) appears as the crossfade ends.

### 7.3 Reveal

Zoom out 560 ms, then letters crossfade and FLIP from the state at zoom-in to the new state, 30 ms stagger starting from the edited letter. When the results column is open, the reveal is quick: 200 ms, no stagger, so iterating is not slowed.

### 7.4 60 fps

Text is browser-rendered; one `font-variation-settings` write per frame; spans use transform and opacity only; one layout read per change for FLIP. The zoomed letter is text too. Handle anchors come from the glyph outline (fontkit on the TTF, in a Web Worker, about 1 ms, sampled at low resolution), cached per rounded axis vector, updated the frame after the value changes. Ghosts are the outline as a hairline SVG computed once per hover or drag start.

### 7.5 Reduced motion

No slides, stagger or crossfade. Discrete changes apply instantly; a family switch and the reveal apply after a 120 ms opacity dip of the word. Ghosts and dead stops are unchanged.

## 8. Visual world

- The specimen owns contrast. The only strong black is type being judged. Chrome is cool grey and hairline.
- Surfaces are paper: white sheet for specimens, cool grey ground for chrome, a dark sheet (near-black, white type) in Try. Default light. UI chrome follows the system theme; the sheet does not.
- Colour is a mark, never a fill: cobalt #2447F5 at hairline and square size for the active handle, marker square, selected row rule, focus ring, stale marker, your tick on spec bars. Never behind text (C20).
- Mono for measurement: axis tags on hover, guide labels, percentages, rank. One UI sans at one small size for sentences and buttons. Specimen fonts are the only display type.
- Hairlines, no cards, shadows or rounded corners. Standard web controls styled thin.
- Smart is shown: spec bars, calibrated percentage with a word, one specific reason, matched sizes, the live shortlist, and every element positioned from the letter itself.
- Copy: one match, one difference, dial names, rare thing first. Never a list joined by "and". No type terms. No readability claims.

## 9. The sweep

A Node script over every family, every Latin character in the family's cmap, every dial, and every pair of dials. Output: `lib/clay/<family>.json`, read by the UI; the UI never decides presence at runtime. Runs in CI; any fail blocks release.

Rendering: the TTF through fontkit, outlines rasterised into the canonical frame at 512 px x-height. 24 steps per axis for singles; for pairs, the four corners of the live ranges and the edge midpoints.

Checks:

1. **Presence and live range.** Step change = XOR area over the default glyph's ink area. Visible threshold 0.8 percent (set by eye). The live range is the longest run of visible steps; fewer than three means not shown.
2. **Jumps.** Any step above 12 percent (set by eye) gets extra steps until none jumps. One arrow press is one step.
3. **Distinctness.** Correlation of per-step XOR masks between two dials on a letter above 0.9 hides the lower-ranked one here. Inverse pairs (A then B returns within 2 percent) show only one by default.
4. **Direction.** The named quantity (stem thickness, advance, slant, x-height, counter width, ascender, descender, cap height, horizontal-to-vertical stroke ratio, corner radius, terminal angle) rises monotonically with more. A synthetic 100 px drag in the more direction increases it on every letter where the handle shows (C28).
5. **Travel.** At the zoomed scale the handle moves at least 80 px across its live range, else row (2.5).
6. **Components.** The count of ink components and of counters does not change across any single or pair setting. This is the one collision check for real fonts: it catches counters closing at extremes and parts merging, and it does not clip designer ranges where feet merely come close. If it fails, the live range is clipped and the pair clamp recorded.
7. **Fit.** Bounding box within the sheet at the scale from all possible handles; anchors at least 60 px from edges; 44 px between handle centres; no leader crosses ink; callouts do not overlap.
8. **Named stops.** Each fvar instance sits where the file says.

Predicted results: Inside hidden on r f t i l; Middle height hidden on i j; Thick-thin hidden on i l; Thick and Wide pair clamps on m and w at the extremes; Soft hidden at heavy weights on letters with no sharp corner; Casual hidden on letters whose casual form equals the formal one.

## 10. Loading and performance

### 10.1 Fonts

Ship Latin-subset woff2 per family, made with fonttools: `pyftsubset` with the Latin unicode range, and for Recursive `varLib.instancer -L` pinning MONO=0 and CRSV=0 first, which also removes the mono masters. Measured TTF sizes before subsetting: Roboto Flex 1,787 KB, Saira 484 KB, Nunito 277 KB, Recursive 2,379 KB; subset woff2 sizes are to be measured in the build and recorded here. Load order: Plain first, then the other three tiles, then More character on demand.

States: until Plain loads, the word shows in the system sans inside a box sized from Roboto Flex's metrics (no layout shift), rows disabled, one line "Loading the letter". Each Character tile shows a hairline square with the family name until its font loads, then draws. Nothing in the rail moves when a font arrives.

### 10.2 Result fonts

Each row loads its family through the Google Fonts CSS API with `text=` set to the person's sentence, so each file is a few kilobytes. Until loaded, the row shows a hairline bar at the row's x-height and the width of the sentence; never fallback text (C24). Rows load as they enter view.

### 10.3 Library

One static file per library version: Int8 group attributes, low-resolution masks or PCA vectors, x-height per family, topology flags, named instances. Brute-force matching in the main thread until profiling shows over 100 ms; the functions are pure so a worker is a one-line move.

## 11. Acceptance

| # | Closed by |
|---|---|
| C1, C26 | Real variable fonts; no outline construction in the code path. |
| C2 | Charset from cmap; sweep fails on a missing glyph; absent characters not openable. |
| C3 | Scrub rows, tiles, anchored handles; no bare numbers. |
| C4 | Readout is the position track with the file's named stop when near; sweep check 4. |
| C5 | Designer ranges plus sweep checks 1 to 7. |
| C6, C12 | Section 4.1 anchors and spacing; sweep check 7. |
| C7 | Size strip in the zoomed sheet; specimen strip in word view. |
| C8, C35 | Marker from the glyph's client rect with leader; baseline on the grid; status names letter and family. |
| C9 | One sheet, two zoom levels, shared grid and baseline. |
| C10, C33 | Presence from the sweep table; absent not grey; values remembered; one-line note; gesture-grouped undo; Reset restores family. |
| C11 | Component-count check across singles and pairs; clipped ranges. |
| C13 | Component-count check catches a counter closing; crushed-but-open counters are the designer's range and are allowed. |
| C14 | No raw numbers outside the hover tag and the result percentage. |
| C15, C32 | Scale from all possible handles; live range is the stop. |
| C16, C28, C29 | Section 2.4 direction, projection, one-to-one travel; sweep check 4 synthetic drag; travel rule. |
| C17 | Status text fixed per letter and family. |
| C18 | Name, end words, percent of live range announced. |
| C19 | Fixed. |
| C20 | Specimens on paper only; cobalt as marks. |
| C21 | One match, one difference. |
| C22 | Yours on the sheet; Compare stacks; Overlay. |
| C23 | Column beside the sheet; full list changes only on click; live shortlist is separate and small. |
| C24 | Matched x-height from precomputed values; hairline placeholders, never fallback text. |
| C25 | Two-tile selection with a blended query, the bowl-fullness and terminal groups, the character multiplier, Not this, and the nudges. The Squarish tile alone does not close it; Saira has flat ends. The eye set gains the query and must return squarish rounded-ended thin fonts in the top three. |
| C27 | Spacing from the font; grid below a hairline stroke. |
| C30 | Marker tag, hover box, zoom cursor. |
| C31 | One name per thing; no rail in zoomed view; five handles max. |
| C34 | W fixed per word; wraps, never refits. |
| C36 | Tiles are letters named Plain, Squarish, Rounded ends, Feet, Casual, Soft feet. |
| C37 | Rounded ends tile on Nunito (wght 200 to 1000), terminal-shape group, Rounded ends nudge, Shape this on rounded variable results. |

New cases this spec adds to `failure-cases.md`:

| # | Failure | Rule | Check |
|---|---|---|---|
| N1 | Use changes shapes silently | Morph plus the tile note | Reviewer |
| N2 | Word jumps when the clay arrives | Box from the family's metrics | Layout shift test |
| N3 | Family switch clamps Thick without a word | Stage one of the switch motion; note; value remembered | State test |
| N4 | Undo across a switch restores axes the family lacks | Undo steps carry family | Unit test |
| N5 | Result shows fallback glyphs as the font | Charset gate; hollow letters named | Test with "ß" |
| N6 | Two handles share one anchor mid-drag | 44 px rule each frame | Geometry test |
| N7 | Capture sticks past the end | Release with the limit message | Manual |
| N8 | Wide result overflows its row | Rows wrap | Bounds test |
| N9 | Thin fonts vanish on dark paper | Minimum rendered stem per size; "very thin at this size" | Stem test |
| N10 | Clay family tops its own results | Superfamily and d_close exclusion | Unit test |
| N11 | Column of identical capped numbers | Bands in grey, no number under 60 | Reviewer |
| N12 | Character multiplier triple-counts | max(rarity, tag), cap 3 | Unit test |
| N13 | Nudge finds nothing to promote | Re-query the whole library | Unit test |
| N14 | Two-tile blend averages into a shape neither has | "Either" bands on divergent groups | Eye set |
| N15 | Tiles blank for seconds | Subset fonts, load order, skeleton squares | Load test |
| N16 | Scale changes when More handles opens | Scale from all possible handles | Unit test |
| N17 | Nonsense paragraph from one word | Fixed neutral sentence at S | Reviewer |
| N18 | Recursive flips to cursive forms at high Lean | CRSV pinned 0 | Sweep check 2 |

## 12. Risks

1. Saira and Nunito have not been seen at extremes on the sheet. Either may fail the eye; the tile is a slot and Fredoka is the named fallback for Rounded ends.
2. Only Plain is deep. Other tiles show two to four handles. The one-line note and shared words are the mitigation; the first five designer sessions decide whether that feels like shrinking.
3. Every threshold is a first value: 0.8 and 12 percent, 0.9 correlation, 80 px travel, 44 px spacing, 2.5 tag, cap 3, 0.3 steer, d_close mapping. Set once by eye, frozen with reasons.
4. The percentage is a proxy until the eye set is judged; the caps keep it from being confidently wrong, not from being wrong.
5. Two-tile blends are a new query type with no evidence. The eye set gains two blended queries.
6. Rarity can over-fire on a group that is rare for a dull reason; the cap guards it.
7. Google Fonts CSS `text=` loading depends on Google's service; the library file must store enough to draw a hairline placeholder if it fails.
8. Crossfades between constructions (double-storey to single-storey g) read as a swap, not a morph. Acceptable; reduced motion avoids it.
9. "Not this" learns from refusals in-session only; nothing persists, by decision.

## 13. Out of scope, decided

Draw it (v1.1). Photo input (v2). Script and slab tiles (no open variable slab or script with a width axis found). Exact-value static instancing. Server logging. Readability claims. Free point editing.

## 14. The one question for Dev

Look at Saira and Nunito drawn as "a" at Thick hairline and Thick black on the sheet. Yes or no to each as a tile. If no to Nunito, Fredoka takes the slot.

## Appendix: who uses this, in one table

Reasoned judgement, not research. Each row names the test that would check it.

| Group | What breaks today | What this gives them | What would stop them | Result path | Test |
|---|---|---|---|---|---|
| Designers without type training | can see it, cannot name it | shape, two tiles, reasons | random lists, ugly extremes | Figma has Google Fonts | 5 sessions, real projects |
| Word and Docs users | dropdown shows names | picture first, install steps, static files | design-tool look, "install" | Word install; Docs More fonts | 3 sessions, never zooming |
| Students (CV, poster) | articles say Garamond | Use: small text; reasons | slow, account | as Word or Canva | 2 sessions |
| Small business in Canva | scroll, no upload on free | find the look, search name in Canva | result not in Canva | Canva search or Pro upload | 2 sessions |
| Marketers | mood, not letterform | fast shaping, copy for the brief, Compare | no two-finalist compare | hand to designer, web-safe | 1 session |
| Brand teams | stigma of free | shortlist with reasons and licence; Yours is a real font | free ceiling | brand book, CSS | 1 session |
| Wedding makers | want script | little; Casual tile | no script | print PDF | not in v1 |
| YouTubers | heavy, tight, reads small | Thick to 1000, Wide 25 to 151, size strip | text faces for posters | install or Canva | 1 session |
| Slide makers | font missing on the day | Get it: Embed fonts; Google Slides | fear of breaking | Slides More fonts | 1 session |
| Developers | default to Inter | CSS snippet, variation settings | no code | Fontsource | 1 session |
| Teachers | need one-storey a | nudge from measurement | design-tool look | Word | 1 session |
| Dyslexic readers | vendor claims | measured nudges, no claim | any claim | reading tool | string review |
| From memory or photo | paid matches | shaping from memory; Draw it in v1.1 | no photo | any | 2 sessions with the real font revealed |
| Type designers | plain labels | axis tags on hover, families credited | row zero as "a Roboto tester" | none | one review before build |
