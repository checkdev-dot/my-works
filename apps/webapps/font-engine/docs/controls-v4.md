# Controls v4: build spec

2026-10-31. Replaces `controls-v3.md`. Usable alone with three binding files: `PRODUCT.md`, `failure-cases.md` (C1 to C37, N1 to N34) and `library-v1-results.md` (all matching numbers). Sources: axis ranges from `api.fontsource.org/v1/variable/<id>`, which normalises defaults to 400 and lists `ital` for families that ship italics separately, so it answers only "what range"; defaults, named instances, GSUB and sizes from the TTFs in `google/fonts`. Values marked "by eye" are tuned once with Dev, then frozen by the build into `lib/clay/<family>.json`. The UI reads those files and never decides presence, home, scale or mapping at runtime.

## 0. Decisions

1. Letters are real variable fonts; dials are their axes.
2. Character: four letter tiles. Plain (Roboto Flex), Squarish (Saira), Rounded ends (Nunito), Feet (Roboto Serif). Fallbacks: Science Gothic, Fredoka. Casual and Soft feet are cut (glyph swaps along axes, partial instancing).
3. One tile at a time in v1. Two tiles is built behind a flag and promoted when the two blended eye queries pass. C25 closes with one tile plus the terminal and bowl groups and the Squarer and Rounded ends chips.
4. Blank start is solved by **three doors**, not word-drag. Word-drag is cut: it skipped the reveal, fought trackpad scroll and text selection, and had no evidence. Three doors are three build-made pins and add no mechanics.
5. Start from a font you know is deferred to v1.1, with the grid it needs defined in section 9 so it can be built.
6. Dials: Thick, Wide, Lean, Openings, Middle height, Tall letters, Tails, Capitals, Thick-thin. One word everywhere, each with a definition.
7. Home per family; W fixed per word across tiles; pixel-to-axis mapping by inverting the sweep's step table.
8. Results: column beside the sheet, rows in the person's sentence at matched size, percentage or band word, one match and one difference, Compare with blink, Try with pasted text, Not this, Close and Not close, Get it, Shape this as rows. Live shortlist of three.
9. Veto semantics: a vetoed family ranks after every unvetoed family, in distance order, and shows a band word, never a number.
10. Cobalt #2447F5 as marks only, every state also a word; UI text 14 px at 4.5:1; Big mode is one CSS scale variable.
11. State in the URL hash; pins in localStorage.
12. Preselected word "Hamburg". Latin only, said on the page. Under 1024 px: "Works best on a laptop or desktop."
13. Decided: Saira and Nunito (section 13).

## 1. Families

| Tile | File | Axes (min..file default..max) | Dials | Named instances | rvrn |
|---|---|---|---|---|---|
| Plain | RobotoFlex[13 axes].ttf, 1,787 KB, 948 glyphs | wght 100..400..1000, wdth 25..100..151, slnt -10..0..0, opsz 8..14..144, XTRA 323..468..603, YTLC 416..514..570, YTAS 649..750..854, YTDE -305..-203..-98, YTUC 528..712..760, YOPQ 25..79..135; GRAD 0, XOPQ 96, YTFI 738 held | all nine | 20, wght only, wdth 100, upright and slnt -10 | yes |
| Squarish | Saira[wdth,wght].ttf, 484 KB; Saira-Italic 535 KB | wght 100..100..900, wdth 50..100..125 | Thick, Wide, Lean (two-up) | 9 wght at wdth 100 | yes |
| Rounded ends | Nunito[wght].ttf, 277 KB; Nunito-Italic 282 KB | wght 200..200..1000 | Thick, Lean (two-up) | 8 wght, 200 to 900 | no |
| Feet | RobotoSerif[GRAD,opsz,wdth,wght].ttf, 3,945 KB; Italic 4,680 KB | wght 100..400..900, wdth 50..100..150, opsz 8..20..144; GRAD 0 held | Thick, Wide, Lean (two-up) | 9 wght, Thin to Black, opsz 20, wdth 100 | no |

Fallbacks: Science Gothic (wght 100..400..900, wdth 50..100..200, slnt -10..0, CTRS 0 held; 2,726 KB; rvrn yes). Fredoka (wght 300..300..700, wdth 75..100..125; 159 KB; rvrn no).

**Home** (applied before first paint, read by sweep, Reset and exclusion): wght 400; wdth 100; slnt 0; upright file; opsz from Use (14, 36, 144); Roboto Flex parametric axes at their file defaults above. Written into `lib/clay/<family>.json`.

Because Roboto Flex and Saira swap glyphs along axes (`rvrn`), every render in the sweep and the query uses shaping (`font.layout(text, ["liga","rvrn","locl"], variation)`), never `glyphForCodePoint`.

## 2. Control model

| Dial | Axis | Ends | Verb | Definition | Letters (Plain) |
|---|---|---|---|---|---|
| Thick | wght | hairline to black | Thicker | How heavy the strokes are | all |
| Wide | wdth | narrow to wide | Wider | How much room each letter takes sideways | all, families with wdth |
| Lean | slnt or ital | upright to leaning | More lean | Whether the letters slope to the right | all; row on Plain, two tiles elsewhere |
| Openings | XTRA | tight to roomy | Roomier | The space inside letters like a, e and o | a b d e g o p q c n m u h |
| Middle height | YTLC | short to tall | Higher middle | How tall small letters are next to capitals | lowercase with a body at x-height |
| Tall letters | YTAS | short to tall | Taller | How far b, d, h, k and l rise | b d f h k l |
| Tails | YTDE | short to long | Longer tail | How far g, j, p, q and y hang below | g j p q y |
| Capitals | YTUC | short to tall | Taller caps | How tall capital letters are | capitals |
| Thick-thin | YOPQ | even to varied | More thick-thin | How much thinner the flat strokes are than the upright ones | letters with a horizontal or curve |

Thick-thin moves YOPQ alone (measured: YOPQ 25 to 135 moves the e crossbar 23 to 117 px at wght 400 while the n stem stays at 91 px). Use: Small text, Headings, Huge tiles (opsz 14, 36, 144 on Plain and Feet; specimen sizes; matching steer).

Presence: only where `lib/clay/<family>.json` says so; absent, never grey; one line names where a dial lives. Values remembered across switches.

Readouts: a position track with end words; the file's stop name when within one sweep step of a named instance; mono axis tag and value on hover; screen readers get name, definition, end words and percent of live range. No raw numbers.

Direction: out from the letter is more (stem outer edge, right side, tops, Tails bottom, counter inner edge toward the stem). Pointer movement is projected onto the handle's axis. Keyboard Right and Up are more, Tails uses Down and says so.

Mapping: the sweep writes, per handle and letter, the edge position in sheet units at each of the 24 steps. A drag inverts that table by linear interpolation, so the edge under the square follows the pointer and axis non-linearity (wght 100 to 400 moves a stem less than 700 to 1000) is absorbed. Rows use the same table so a row drag and a handle drag feel the same. A handle must travel at least 80 px across its live range at the zoomed scale, else it is a row.

Targets: handle 12 px drawn, 24 px hit, 44 px between centres; marker 8 px; Big mode multiplies these and the rail by a single CSS variable (1.5).

Undo: a drag or a run of arrow presses within 400 ms is one step; Cmd or Ctrl Z; Reset restores family, Use and dials to home; double-click a row label resets that dial. Pins: family, Use, dials; up to eight in a strip along the sheet's bottom edge; kept in localStorage. The URL hash holds the same state.

## 3. Word view

Top bar: word input; status text naming letter and family; "Closest to this", reading "See all" once the shortlist shows and "Match again · changed" when stale.

Sheet: white, hairline grid quieter than a wght 100 stroke. The word in black at W (6), baseline on a major grid line. Marker: cobalt square 8 px from the marked glyph's measured top-right, leader to "carries the most character · double-click to open". Hovering any letter draws a hairline box with the same words; zoom cursor on letters. Word not selectable.

**Three doors.** On first paint, beside the word, three small versions of it: "thin and wide", "heavy and round", "with feet", each a pin filled by the build (Plain wght 200 wdth 130; Rounded ends wght 900; Feet wght 400) drawn in its own family. Click one and the clay lands there with the switch motion; the doors then become ordinary pins in the strip. A person who ignores them has lost nothing.

Specimen strip below the word: a fixed neutral sentence at Small text and the word at Headings, live. Under the word, one line after any change, from the dial deltas: "Thicker and a little wider." The same generator writes **Describe my letter** for the whole state ("a heavy, wide, upright plain letter"), read by screen readers, copied by a button, used as the layer name in Get it for Figma.

Rail: Character tiles (the marked letter in each family at current Thick and Wide, clamped; Plain preselected; on a switch the old letter stays as a hairline ghost for one second, then becomes a pin if any dial had moved); Use tiles; Thick, Wide, Lean; More: Openings, Middle height, Thick-thin as the family allows; Pin this, Undo, Reset; footer "Every change here reaches all the letters of your word." Rows: drag anywhere, click jumps, arrows step, Shift five, capture releases at the live end with "That is as far as this letter goes".

Two tiles (flagged): second tile by Shift-click; word drawn twice, stacked, under "No font can be both. We will look for one."; rail shows the intersection of dials; double-click opens the first tile's letter with the second as a ghost; shortlist and Yours hidden; pins and URL store both.

## 4. Zoomed view

Full-width sheet, no rail. Letter in the upper two thirds, left of centre; callout margins at least 220 px; size strip in the bottom third (the letter in a short line of the word at Small text, Headings, Huge); bottom strip with Zoom out, rows for dials without a handle here, Lean tiles on ital families, Undo, More handles, and "Only this letter shows while you edit. The whole word changes when you zoom out."

Handles: squares on the measured ink edge, anchors from the shaped outline each frame (from the worker, one frame of lag at most); leaders straight to the nearest margin, sliding or demoting if they would cross ink; callouts spread, never overlapping. Default: Thick, Wide, Lean where present plus the two of the rest with the largest visible effect on this letter; five at most; one handle per repeated part ("all three"). Feel: the edge follows the pointer through the step table; a hairline ghost of the start stays through the drag and fades 500 ms after; dead stop at the live end. Scale from the live extremes of every handle that could show on this letter, so nothing rescales during a drag or when More opens.

Learning: verb callouts; hover or Tab focus draws a hairline ghost of the letter at the far end of the range in the more direction; two-headed cursor; callouts in full on first open of a session, then label only until hover or focus.

Marked letter: sans tiles a, then e n o g H; Feet g, then a e n o H; else the first letter. "Hamburg" gives a on sans and g on Feet, and the H shows Capitals.

## 5. Matching and results

All numbers (distances, quantiles, weights, thresholds, test results) live in the results section of `library-v1-results.md` and in `lib/match/constants.json`, written by the library build. This section states method only.

### 5.1 Query and gates

Seven glyphs (a e g n o H O) shaped from the clay at the current axes into the canonical frame, measured in the worker with the library's code from the measured TTF. Gates: serif class from the tile; italic class from Lean; the person's word's charset (missing letters drawn hollow and named); storey as a tolerance penalty, known on the query side from `lib/clay`, majority-of-three-renders on the library side with "unknown" never penalised.

### 5.2 Groups and combination

Groups: weight, width, serifs, slant, contrast, x-height ratio (n over H), openings, bowl fullness, terminal shape. The shipped corner-radius group (`cornerRatio`, radius-based) is removed; it lowered top-1 on the train set and did not fix the heavy rounded query. Combination is a p-norm over groups with per-group weights, a rarity multiplier on the query's rare groups and a tile multiplier on the group the tile defines, combined as a max with a cap; values in `constants.json`.

Measurement methods for the two new groups, so they are buildable: **terminal shape** takes the bottom rows of the n stem and the end of the g tail's path, fits the ink boundary to a semicircle of radius half the stem (round), a flat line (flat) or a widening wedge (flared); class is the best fit, confidence the margin, "unknown" below it, never gated on unknown. **Bowl fullness** on o: bowl ink area over its bounding box, plus the share of boundary pixels with low local curvature. Both must survive the same jitter test as storey, reported on holdout.

**Veto**: each group has a veto threshold (class mismatch for serifs, slant and terminal; a distance in library standard deviations for the rest). A family with any vetoed group ranks after every unvetoed family, in distance order, and shows a band word, never a number. "Nothing is really close" is the state where every family is vetoed.

**Stability**: compute the new list; any family within margin m of the old cut keeps its old position.

**Exclusion**: the clay family and its superfamily. Superfamily = same first word of the family name plus `lib/match/superfamilies.json` for exceptions (Nunito and Nunito Sans; Roboto with Heebo, Vazirmatn, Yantramanav), written into the index at build. Other near-home families show normally with the grey words "near where you started" while no dial has moved more than one step; derivatives show "a Roboto derivative" through the alias list.

**Library hygiene**: script variants and derivatives are collapsed at build by seven-letter distance plus n/N overlap agreement, preferring the name without a script suffix, keeping aliases and showing "also as IBM Plex Sans JP". Small-caps and caps-only families are never collapsed into text families. The measured near-duplicate rate and the collapse threshold are in the results file.

### 5.3 Percentage

Meaning: how likely a designer would call this a close match. In v1 the judge is Dev, and the spec says so where the number is explained.

Stage one maps distance to a percentage from quantiles of the library's own first-neighbour distances after collapse (95, 75 and 60 at three quantiles, 30 at the random-pair median, log-linear between; the quantiles are in the results file). Release gate is human: Dev judges 30 top-1 rows at 90 or above from real-font queries; nine in ten acceptable, else the quantiles move down one notch. The spread check ("under 60" on a minority of top-1 rows) is reported, not gated. Stage two fits a monotonic curve to judged rows once each band has 20, and replaces stage one.

Display: integer and band word in mono beside the family name: 90 and up "near twin", 75 to 89 "close", 60 to 74 "same spirit", under 60 "under 60" in grey. Vetoed rows: band word only. **Point at the number**: hover or focus lights the letters on the row and on Yours that drive the distance, with the group name in plain words ("mostly the a and the g: openings"). Number and sentence read the same distances.

Every target in the results file is reported on the library's 20 percent holdout; train numbers choose, never pass. Property tests, not font lists: the heavy rounded query passes when slots 1 to 3 all have measured terminal class round; the thin squarish query when slots 1 to 3 all have bowl fullness above the library median.

### 5.4 Rows and actions

Mono rank; family and style; percentage or band; the sentence at matched x-height (precomputed per family); one sentence, one match and one difference, highest-multiplier group first; two spec bars (thickness, width; cobalt tick yours); licence; Compare, Try, Not this, Close, Not close, Get it, Shape this (variable fonts, rows only, its superfamily joins the exclusion).

Nudge chips re-query the whole library with one group's multiplier at the cap, then apply the stability rule: Rounder, Squarer, Softer corners, Rounded ends, One-storey a, Two-storey g; on serif results Softer joins, Sharp joins. Not this raises the weight of the group where that font is farthest from the query, re-queries, greys the row. Close and Not close record (shown percentage, judgment) in the browser only, exportable from test sessions; this is how stage two gets its 20 rows per band.

Yours, above the list: "Yours: Roboto Flex at your settings. Free, already a font." with Get it. Live shortlist: three tiny rows in the sheet margin following the dials with a 600 ms debounce and the stability rule; hidden while the column is open; disabled with "Measuring" until the measured TTF loads, and not enabled at all until the worker query is under the budget in the results file.

Compare stacks the row's font under Yours at the same size and baseline; a second tick adds a third; Overlay draws its marked letter in hairline over yours; Blink flips the two in place every 400 ms while held. Try expands the row: the sentence at Headings, a paragraph at Small text (neutral text or anything pasted), one word at Huge, light or dark paper; loads the full Latin subset first. Get it: one tool chip (Figma, Word, Docs or Slides, Canva, PowerPoint, Website, Just download); office tools get the nearest named instance and the loss named ("Word gets Roboto Flex Bold. Your Wide and Openings are not in that file. The web version keeps them."); Website gets the Fontsource line, CSS and `font-variation-settings`; Canva "Search this name in Canva"; licence on every row.

## 6. Sizes and composition

S 14, H 36, X 144 px, and W. W is computed once per word from the widest Wide across all four tiles (Roboto Flex 151): the size at which the word at that width spans 92 percent of the sheet, capped so cap height is at most 36 percent of sheet height. W changes only when the word changes; never on a dial move or a tile switch. The default word never wraps; sentences wrap at word boundaries. Rows at H; Try and the size strip at S, H, X; zoomed scale fixed per letter.

One sheet: both views share grid and baseline row; zooming is a camera move; baseline and middle line run across the word unlabelled and are labelled when zoomed; the results column is the sheet continued right (55 to 45). At 1440 by 900: word baseline near 55 percent of sheet height, specimen strip from 65 percent, rail full height on grid rows, shortlist in the right margin.

## 7. Motion

Within a family: no easing during a drag; discrete changes interpolate axis values over 240 ms ease-out in one requestAnimationFrame loop writing `font-variation-settings` once per frame; letters are spans FLIPped from old to new positions over the same 240 ms. Across families: 180 ms morph of shared axes to the clamped values, then a 240 ms per-letter crossfade with 20 ms stagger and FLIP; ital switches are a file change and use the crossfade only. Reveal: zoom out 560 ms, then crossfade and FLIP from the zoom-in state with 30 ms stagger from the edited letter; 200 ms and no stagger while the column is open. Transforms and opacity only during motion; one layout read per change; anchors from the worker cached per rounded axis vector; ghosts computed once per hover or drag start. Reduced motion: no slides, stagger or crossfade; a 120 ms opacity dip marks a switch or reveal.

## 8. Visual world and accessibility

The specimen owns contrast; chrome is cool grey and hairline; specimens on white, or dark paper in Try. Cobalt as marks only (active handle, marker, selected rule, focus ring, stale marker, your tick), never behind text; every cobalt state has a word. Mono for measurement; one UI sans at 14 px minimum, 4.5:1; Big mode is one CSS scale variable on chrome, rows, squares and callouts. Tab focus does what hover does. Page says Latin only; under 1024 px, "Works best on a laptop or desktop." Copy: one match, one difference, dial names, rare thing first, no "and" lists, no type terms, no readability claims.

## 9. The sweep

Node, in CI, over the four clay families and two fallbacks, every Latin character in each cmap, every dial, every pair, and the corner sets. Rendering: fontkit on the TTF, shaped, rasterised into the canonical frame at 512 px x-height, 24 steps per axis. Output `lib/clay/<family>.json`: per character the default and More handles, live ranges, step lists, **edge position per step per handle** (the mapping table), anchor rules, verbs, directions, pair and corner clamps, zoomed scale, home; plus the **landing grid**: the seven query glyphs measured at every Thick by Wide by Lean step of each family, stored as group vectors, for Start from a font in v1.1 and for the reachability map. Any fail blocks release.

1. Presence and live range: XOR area over the home glyph's ink per step; visible threshold by eye; live range the longest run of visible steps; fewer than three means not shown.
2. Jumps: a step above the jump threshold (by eye) gets extra steps. One arrow press is one step.
3. Distinctness: mask correlation between two dials on a letter above a threshold hides the lower-ranked; inverse pairs show one.
4. Direction: the named quantity rises monotonically with more; a synthetic 100 px drag in the more direction increases it on every letter where the handle shows.
5. Travel: at least 80 px across the live range at the zoomed scale, else row.
6. Components: ink and counter counts equal home at every single setting, pair corner and edge midpoint, the all-more and all-less corners on every family, and on Plain every corner of the k dials present on the letter (2^k, k at most 9). A failing corner records a clamp on the last-moved dial, applied live with the dead-stop message.
7. Fit: bounding box within the sheet at the scale from all possible handles; anchors 60 px from edges; 44 px between centres; no leader crosses ink; callouts do not overlap.
8. Named stops sit where the file says.
9. Glyph identity: the shaped glyph id of every character is constant across each live range; a swap clips the range.

## 10. Loading

Per family, one `pyftsubset` Latin run yields a display woff2 and an uncompressed TTF for the worker, both brotli-served, so display and measurement cannot drift; subset sizes are written to `lib/clay/sizes.json`. Order: Plain woff2, Plain TTF, the other three tiles' woff2, their TTFs, italics on first hover of Lean, Try subsets on demand. States: until Plain woff2 loads, the word shows in the system sans in a box sized from Roboto Flex's metrics with rows disabled and "Loading the letter"; tiles and doors show hairline squares with family names until loaded; anchors and shortlist show "Measuring" until the TTF loads. Nothing in the rail moves when a font arrives. Result rows load through the Google Fonts CSS API with `text=` set to the sentence and show a hairline bar at the row's x-height until then, never fallback text. Library: `public/library/index.json` plus per family x-height, storey with confidence, named instances, superfamily, aliases, terminal class and bowl fullness. Matching runs in the worker.

## 11. Acceptance

The binding list is `failure-cases.md`. Closures, in short: C1, C26 real fonts; C2 cmap and sweep; C3, C14 rows, tiles, tracks; C4 stop names and check 4; C5, C11, C13 sweep checks with corner sets; C6, C12 anchors and check 7; C7 size and specimen strips; C8, C35 marker from the glyph rect, status fixed; C9 one sheet; C10, C33 presence from the table, grouped undo, Reset to home; C15, C32 scale from all handles; C16, C28, C29 direction, projection, step-table mapping, travel rule, synthetic drag; C17 status; C18 announcements, Tab as hover; C19 fixed; C20 paper only, marks with words; C21 one match one difference; C22 stack, overlay, blink; C23 column beside the sheet; C24 matched x-height, placeholders, and collapse of script variants for variety; C25 one tile plus terminal and bowl groups, Squarer and Rounded ends chips, veto ranking, property test on holdout; C27 font spacing, quiet grid; C30 marker words, hover box, cursor, three doors; C31 one name per thing, no rail zoomed, five handles; C34 W fixed per word across tiles; C36 tiles are letters; C37 Nunito tile, terminal group and chip, property test; N1 to N34 as listed there.

## 12. Risks

1. Saira and Nunito unseen at extremes; fallbacks named.
2. Only Plain is deep; other tiles show two or three handles.
3. By-eye sweep thresholds and the three-door settings are first values.
4. Terminal shape and bowl fullness are specified methods with no measured results yet; C25 and C37 stay open on the binding list until the holdout property tests pass.
5. The percentage rests on one judge in v1; stage two needs Close and Not close data from test sessions.
6. The live shortlist depends on a worker query under budget; if it is not met, the button alone ships.
7. Three doors add three visible choices at first paint; if the first five sessions show people freezing on them, cut to one door.
8. Two tiles is flagged and unevidenced.

## 13. Decided

Dev approved Saira for Squarish and Nunito for Rounded ends on 2026-10-31, from `docs/saira-nunito.png`.
