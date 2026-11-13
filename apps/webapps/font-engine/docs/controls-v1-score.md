# Controls v1: independent score

Reviewed 2026-10-31 against `controls-v1.md`, `failure-cases.md` (C1 to C37), `matching-final.md`, `PRODUCT.md`, cases 2, 6, 11, 13, 14 and `variable-font-test.png`. Axis ranges re-checked live at `api.fontsource.org/v1/variable/<id>` for roboto-flex, roboto-serif, saira, fredoka, recursive and fraunces. All ranges in section 1 of the design are correct.

## Overall: 6.5 / 10

This is the first version of the product that could actually be built and not break, and the thinking is real: real variable fonts as clay, a Character row instead of jargon names, a sweep that decides what a control may claim, a percentage that is never confident on a bad match. A design director would say "yes, this direction" and then send it back for a week, because it still has contradictions inside itself, one failure case it claims to close and does not, a sweep that is over-engineered for real fonts, and seven open questions handed to a person who has told us he has decision fatigue. Not a mean of the nodes. The direction is an 8. The document as a build spec is a 5. The honest whole is 6.5.

## Node scores

| # | Node | Score | Why |
|---|---|---|---|
| 1 | What the person holds | 7 | Right idea. Depends on the sweep working, which is unproven. |
| 2 | What the letter is for | 5 | "First result is always true" is trivially true: it is Roboto Flex. Unless the clay family and its siblings are excluded from results, every search puts the clay family at 100 percent at the top. The design never says whether it excludes them. |
| 3 | All letters change | 7 | Seen, not told. Good. |
| 4 | Not a font editor | 7 | Right framing. "Families credited by name" will make type critics read row zero as "a Roboto Flex tester". |
| 5 | Character row | 7 | The strongest idea in the doc. Two of six tiles have unverified families and two tiles lose Wide. |
| 6 | Choices before first dial | 8 | Zero. Right. |
| 7 | Where Character and Use live | 7 | Fine. Hiding them in zoomed view is right. |
| 8 | Keep serif and sans | 6 | "Half of what designers reach for has feet" is asserted, not reasoned. The answer is probably right anyway. |
| 9 | Different controls | 7 | Shared dial words is the right principle. The g construction flips between Flex and Serif, which the doc only names as a motion risk. |
| 10 | Brackets | 7 | Correct no, with a good reason. The nudge "softer joins" is the right place for it. |
| 11 | Dial names | 6 | Thick, Wide, Lean, Tails, Soft are good. Dark reads as dark mode. Open reads as a verb. Crossbar is a type term. Airier is not a word anyone says. |
| 12 | Real axis names | 8 | Hover only. Right. |
| 13 | Row ends and readouts | 6 | Named stops exist for wght in every clay. Roboto Flex ships almost no named wdth stops, so "Condensed, Extended read from the font file" will be empty on the axis that most needs it. Between stops is undefined. |
| 14 | The finder | 8 | "Closest to this". Keep. |
| 15 | Scrub rows | 7 | Good replacement. Nothing said about the readout while scrubbing between stops. |
| 16 | Why the bars felt off | 8 | Correct diagnosis. |
| 17 | Rows by default | 7 | Three plus More is right. Dark should not be in More; it should be cut (see issues). |
| 18 | Discrete things as tiles | 8 | Right. |
| 19 | Handles | 7 | Right idea, five max is right. |
| 20 | Handle rules | 6 | Section 6.2 says Thick anchors on the inner edge of the stem; 6.3 says the outer edge. The spec contradicts itself on the one handle everyone will touch first. No minimum on-screen travel rule, so Soft and Middle height can run their whole range in a few pixels, which is C29 again. |
| 21 | Drag or row | 8 | One control, two places. Right. |
| 22 | No free point editing | 9 | Right and firmly held. |
| 23 | Word view feedback | 7 | Fixed size that never refits is right. A sentence sets a tiny size "once from the word length", which fights "the word huge". |
| 24 | Zoomed view feedback | 7 | Start ghost is good. |
| 25 | Zoom-out reveal | 7 | Good, but the reveal makes zoomed editing feel slower when results are open and the person is iterating. |
| 26 | Undo | 8 | Gesture grouping, Ctrl Z, Reset restores family. Good. |
| 27 | Back to a liked letter | 7 | Pins carry family. Good. Four is arbitrary. |
| 28 | Start | 7 | "hamburg", Plain, Headings. Fine. |
| 29 | Marked letter | 6 | "a" is right for Plain. On Feet and Soft feet the g carries more character than the a, and the doc does not choose per family. |
| 30 | Presets | 5 | "Surprise me, Dev to confirm" is a decision passed to Dev. Decide: cut it. |
| 31 | Learning to zoom | 7 | Three cues is right. |
| 32 | Learning a drag before dragging | 7 | Destination ghost on hover is the best small idea in the doc. |
| 33 | Two shaped letters | 7 | Pins strip. Fine. |
| 34 | Result against own letter | 8 | Stacked words plus overlay. The overlay is the single most convincing image in the product. |
| 35 | More handles (Plain only) | 5 | On Roboto Flex the parametric axes (XOPQ, YOPQ, XTRA) and wght both move the same stems. Once XOPQ is set, Thick and Upright stroke are two dials on one quantity on every letter, not just round ones. The sweep's "distinct" rule will hide one of them everywhere, so the depth promised here mostly vanishes. |
| 36 | Thick-thin | 4 | "Derived, clamped, hidden where it overlaps Thick" is hand-waving. It overlaps Thick everywhere. Define it as YOPQ relative to the current stem, or drop it. |
| 37 | Keyboard | 6 | "Type a number into a focused row" contradicts C14 (no raw numbers). What number? |
| 38 | The query | 6 | Bowl fullness and rarity-led weighting are good. Carrying the tile tag as a strong weight plus rarity multiplier can triple-count the same thing. |
| 39 | Results | 7 | Type-tester rows, one match one difference, spec bars. Good. Nudges re-rank "within the top forty", so a nudge for a character absent from the top forty does nothing. |
| 40 | Failure states | 6 | A good list. Missing: six variable fonts (about 4 MB) must load before the Character tiles can draw, with no state named for it; result rows need every library font's webfont loaded; the clay family appearing in its own results. |

## Top issues, ranked, each with its fix

1. **C25 is not closed.** Dev's letter was thin, squarish and rounded-ended at once. Saira is squarish with flat ends. Fredoka is rounded-ended but cannot go below wght 300 and is not squarish. No tile and no dial can draw that letter, so the design's own claim ("the query is a real squarish letter") is only a third true. The nudges and "Shape this" are the real answer and the acceptance table hides that. Fix: let a person pick two Character tiles. The sheet shows both letters side by side with the line "No font can be both. We will look for one." The query becomes the measured blend of the two tiles' attributes with the shared dial values. The library answers what the clay cannot. Mark C25 as closed by this plus nudges, not by the Squarish tile.

2. **The clay family will win its own search.** The query is a real Roboto Flex glyph measured like the library. Roboto, Roboto Flex, Roboto Condensed and Roboto Serif are in the library. Every Plain search returns the Roboto family at the top at 95 or above; every Squarish search returns Saira's static cousins. The doc lists this as risk 6 and watches it. It is not a risk, it is the default behaviour. Fix: exclude the clay family and any family whose nearest-neighbour distance to it is under d_close from the ranked list. Show row zero as "Yours (Roboto Flex)" and say plainly it is a free font you can already use. Calibrate d_close on the library with clay families removed.

3. **The Thick handle is specified in two places with opposite anchors.** 6.2: inner edge of the stem, dragging toward the counter is thicker. 6.3: the stem's outer edge, dragging away from the centre is thicker. A builder will pick one and the other section's tests will fail. Fix: outer edge, out is more, delete the 6.2 sentence. Then add the missing rule: a handle must travel at least 80 px on screen across its live range at the zoomed scale or it demotes to a row in the bottom strip. Without this Soft, Middle height and Crossbar reproduce C29 (whole range in a few pixels) on the very letters where they show.

4. **The More handles on Plain promise depth that real Roboto Flex does not deliver as separate dials.** wght, XOPQ, YOPQ and GRAD all move stem thickness. The sweep's own distinct rule (0.9 mask correlation) will hide Upright stroke on every letter and Dark on most. Thick-thin is undefined. Fix: cut Upright stroke and Dark from v1. Define Thick-thin as one dial: YOPQ as a fraction of the current XOPQ, so it changes contrast without changing weight, and show it only when the measured horizontal to vertical stroke ratio moves monotonically. The depth story becomes four honest inner handles: Middle height, Tall letters, Tails, Open, plus Thick-thin.

5. **Seven open questions to a person with decision fatigue.** Accent hue, six or four tiles, two families to approve, master letter, row zero style, Surprise me, Dark placement. A design director would decide six and ask one. Fix: decide here. Cobalt. Four tiles (Plain, Squarish, Rounded ends, Feet), Casual and Soft feet behind "More character". Master letter "a" on sans tiles, "g" on serif tiles. Row zero as a quiet line. Cut Surprise me. Cut Dark. Ask Dev one thing only: look at Saira and Fredoka on the sheet and say yes or no.

6. **The sweep is overbuilt for real fonts and will clip legitimate designer ranges.** Collision rules like "gaps between parts stay above 4 percent of x-height" and "feet stay separate at live extremes" were written for a generator that broke. Roboto Serif at wdth 50 wght 900 has feet that nearly touch by design, and the sweep would clip a range the type designer shipped. Fix: keep the sweep for presence, direction, distinctness, step size and fit. Drop collision checks inside a letter and between letters for real fonts. Replace with one check: component count of ink and counters does not change across the range. That catches the only failure real variable fonts actually have (counters closing at extremes).

7. **Rounded ends is on the wrong family.** Fredoka's wght range is 300 to 700. The YouTuber persona wants heavy, the C25 persona wants thin, and Fredoka gives neither. Fix: test Nunito (rounded terminals, wght 200 to 1000) as the Rounded ends clay. It has no wdth, but neither do Casual or Soft feet, and the range on the dial people use most matters more. Keep Fredoka as the fallback if Nunito's ends read as too subtle on the sheet.

8. **Recursive's Casual tile has a hidden construction flip.** Recursive's CRSV axis defaults to 0.5 (auto), which switches letters like a, g, l and y to cursive forms when slnt passes about -14. Lean on Casual will flip letter construction near the end of its range. The doc never mentions CRSV. Fix: pin CRSV to 0 on the Casual tile. The sweep's jump threshold would catch the flip, but it is cheaper to know it now.

9. **Named-stop readouts will be empty on Wide.** Roboto Flex's fvar has weight instances and little else. Fix: readouts are the position track on every axis, with the named stop shown only when the value is within one step of one. Say so once.

10. **"Type a number into a focused row" contradicts no raw numbers.** Fix: drop it. Arrows and Shift arrows are enough.

11. **Nudges re-rank only the top forty.** A "rounded ends" nudge after a Squarish search finds nothing to promote. Fix: a nudge re-queries the full library with the nudge's attribute weight raised, then applies the stability rule.

12. **The static instance download is a licensing and engineering question the doc skips.** Row zero promises "Get it for Word" at the person's exact axis values. That means instancing a variable font on the server (fonttools varLib.instancer) and, where the OFL Reserved Font Name applies, renaming the output. Fix: name this in risks with the two options: ship the nearest named instance Google already provides, or instance and rename. Recommend the nearest named instance for v1.

## New issues nobody has listed

- **Load state for the Character row.** Six variable fonts total roughly 4 MB. The tiles draw the marked letter in each family, so none of them can render until all six have loaded. Needs a stated skeleton state and a subset per family (Latin only) or the first screen is blank for seconds.
- **Result rows need webfonts the browser has not loaded.** Each row draws the person's sentence in that family. Nothing says how or when those fonts load, or what the row shows in the meantime. Fallback text in Arial at matched x-height will look like a bug.
- **Scale from shown handles changes when More handles opens.** 6.3 fixes the zoomed scale from the live extremes of the shown handles. Opening More handles changes the shown set, so the letter rescales on a click that was not a drag. State that scale comes from all handles that could show on this letter, not the shown ones.
- **Rarity triple-counts character.** A Squarish tile adds a strong tag weight on bowl fullness, and the rarity rule adds up to three times base on the same group because squarish is rare in the library. Together the bowl group can dominate everything, so a thin squarish query returns heavy squarish fonts. Cap the combined multiplier, not each one.
- **Capped percentages cluster at 59 and 69.** Three hard caps produce many rows reading exactly 59. A column of 59s reads as a bug. Show the capped rows with the word only ("same spirit") and the number in grey, or round capped values down to a band ("under 60").
- **Specimen strip as "a short paragraph" of one word.** The default word "hamburg" repeated as a paragraph is nonsense text. Use a fixed neutral sentence for the strip and the person's word only in the big setting.
- **Two sheets, one zoom, three sizes.** Word view word size, specimen strip sizes, zoomed scale and result row sizes are four separate size systems on one "continuous sheet". Define them from one base (the Headings size) or the sheet will not feel continuous.
- **Persona section is the longest part of the doc and changed four things.** Fourteen personas, no research, and the doc admits it. Dev will not read it. Keep 2.15 and move the rest to an appendix.

## Better ideas, further out

1. **Pick two tiles.** Said above as the fix for C25, but it is bigger than a fix. It turns the Character row into the first honest "we cannot draw this, but we can find it" moment, which is the product's real promise. The sheet shows two letters and the search looks between them.

2. **Shape by reacting, not deciding.** Every result row gets a quiet "Not this" as well as Compare. "Not this" pushes the query away from that font's rare group and re-ranks. Dev suffers decision fatigue; a person who can say no to three rows has told the engine more than a person who moved four dials, and it costs nothing to learn.

3. **Draw the letter you remember.** Persona 2.13 wants a font from memory. Let them scribble a rough letter with the mouse on the sheet. Measure it in the canonical frame exactly as a library glyph, pick the nearest tile and dial values, and land them there to refine. This is the photo input (v2) without the photo, using code the matching already has. It also gives the engine its first non-clay queries.

4. **Live shortlist in the margin.** Instead of a "Closest to this" button, three tiny rows in the sheet margin follow the dials with a 600 ms debounce and the stability rule. The button becomes "See all". The person feels the library breathing under the sheet, which is the smartest thing this tool can show and nothing else in the category does it. Keep the no-silent-change rule for the full column only.

5. **Between these two.** Select two results and ask for the midpoint. The engine averages their measured groups and searches again. It makes the library itself the clay, which is concept E done properly, and it needs no new rendering.

6. **Compare clicks are calibration.** Every time a person stacks a result under theirs and then picks it, or picks another, record it against the shown percentage. Within weeks the percentage curve is fit to real judgments instead of Dev's eye set of sixteen.

7. **Carry a twin.** When the person switches Character tile, do not drop their old letter. Keep it as a ghost on the sheet for one breath, then as a pin. Switching families becomes a comparison, not a replacement, and the hardest decision on the screen becomes reversible by eye.
