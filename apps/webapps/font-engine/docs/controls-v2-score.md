# Controls v2: independent score

Reviewed 2026-10-31 against `controls-v2.md`, `PRODUCT.md`, `failure-cases.md` (C1 to C37), `matching-final.md`, cases 6, 7, 9, 11, 12, 13, 14, 16, 17. Scores were formed before reading `controls-v1-score.md`. Axis ranges re-checked at `api.fontsource.org`. The fvar tables of Roboto Flex, Saira, Nunito, Recursive, Roboto Serif, Fraunces and Fredoka were read from the real TTFs. Outlines were rasterised with fontkit to test the YOPQ claim, the storey claims and the component-count check at extremes.

## Scores

| What | Score | One line |
|---|---|---|
| Direction | 8.5 | Real fonts as clay, two tiles, the sweep deciding presence, a live shortlist, Not this. The right product. |
| Buildability | 6.5 | Spec numbers a builder would copy are wrong (axis defaults), two render paths are unspecified (browser TTF, shaping), two features have no definition (two-tile editing, Shape this), and three constants are missing. |
| Intuitiveness, no training | 7.5 | Rail is plain and small. "Inside" is cryptic, learning depends on hover, and the exclusion rule hides the fonts a Word user recognises. |
| Closure of C1 to C37 | 7.5 | Most closures are real. C25 is closed on paper only until the eye set runs; N18's check cannot fire as written; C11/C13 escape through triples. |
| Smoothness of change | 8.0 | Motion is specified to the frame. Mid-word wrapping and italic-as-separate-file crossfades are the holes. |
| **Overall** | **7.4** | Below the 8.5 bar. A good builder would build most of it right and then get stuck on five things listed below. Fix those and this is 8.5 or more. |

## Ranked issues, each with the exact fix

1. **The axis defaults in table 1.1 are not what the font files say, and four parts of the spec depend on "default".** Fontsource reports default 400 for every family; the TTFs in `google/fonts` do not. Measured: Saira wght default **100**, Nunito **200**, Recursive **300**, Fredoka **300**, Fraunces wght **900**, opsz **9**, WONK **1**, Roboto Serif opsz **20**. Only Roboto Flex matches the table. What breaks: sweep check 1 measures XOR "over the default glyph" (Saira Thin, Fraunces Black); 5.3 excludes library fonts near "the clay's default instance"; Reset "restores every dial" to a different letter in every family; the browser draws the file default until the first `font-variation-settings` write. Fix: delete "default" from the spec. Add a **home** row per family to 1.1: wght 400, wdth 100, opsz from Use, slnt 0, ital 0, CASL 0, SOFT 0, XTRA/YTLC/YTAS/YTDE/YTUC/YOPQ at the Roboto Flex file defaults. Sweep, exclusion and Reset all read home. Write home into `lib/clay/<family>.json`.

2. **Fraunces ships with WONK=1 and Recursive's cursive flip is a GSUB substitution, so the sweep as written cannot see either.** CRSV in Recursive and WONK in Fraunces swap glyphs through `rvrn` feature variations, not outline interpolation. fontkit's `glyphForCodePoint` returns the base glyph at every axis value (verified: CRSV 0.5 vs 0 at slnt -15 gives identical outlines through that call), but the browser applies the swap. N18 says "Sweep check 2" catches the flip. It cannot. And the Soft feet tile shows wonky alternates (leaning n, odd a) by default because WONK is never pinned. Fix: pin WONK=0 with `varLib.instancer -L` exactly as CRSV is pinned, and add it to decision 2. In the sweep and in the query renderer (5.1), shape every string with `font.layout(text, features, variationSettings)` and rasterise the returned glyph ids, never `glyphForCodePoint`. Add sweep check 9: glyph id per character is constant across the live range.

3. **The browser needs a parseable variable TTF, and the spec ships only woff2.** 7.4 computes handle anchors with fontkit in a worker; 5.1 renders the seven query glyphs "with the library's code". fontkit's `getVariation` needs a TTF, not woff2. Nothing in section 10 ships one, sizes one or says when it loads. Fix: in 10.1 add a Latin-subset TTF per clay family (uncompressed, served with brotli) loaded by the worker after the display woff2; record its size; anchors and the shortlist stay disabled with the row note "Measuring" until it arrives. State that the display font and the measured font are built from the same subset run so they cannot drift.

4. **Two tiles selected: nothing says what the person edits.** Decision 3 defines the query blend and the stacked sheet, but not which family's dial set is in the rail, what double-click opens, which handles show, or what "Yours" reads. A builder will invent it. Fix: the rail shows the intersection of the two families' dials (Thick, and Wide or Lean where both have them); double-click opens the letter of the first-selected tile with the second drawn as a hairline ghost behind it; the live shortlist and "Yours" are hidden and replaced by the "No font can be both" line; Pin stores both families.

5. **"Shape this" on a variable result has no sweep behind it.** Section 9 runs the sweep only over the six clay families, but 5.5 promises handles on any variable result (hundreds of families). Presence, travel, anchors and the component check would all be decided at runtime, which 2.2 forbids. Fix for v1: Shape this gives rows only (Thick, Wide, Lean as the file allows), no handles, with the note "Handles are for the six starting letters"; or run the sweep over every variable family in CI and state the budget.

6. **The d_close exclusion hides the fonts a Word user wants, regardless of what they did.** Exclusion is measured from the clay's home, not from the current query. Roboto, Arimo, Public Sans and the whole plain-grotesque cluster vanish from every Plain search, including one where the person has moved Thick to 900 and Wide to 70. Fix: exclude the clay family and its named superfamily only. For other families within d_close of home, show them with the grey word "near where you started" when the person has moved no dial more than one step, and normally otherwise.

7. **Triples escape the component check.** Measured on Roboto Flex: wght 1000 + wdth 25 keeps a, g and B open; adding XTRA 323 closes the counters of a, g and B and merges the arms of w into two new counters. Pairs at corners and edge midpoints (9) do not test this. Fix: on Plain, also test the 2^k corners of all k dials present on the letter (k is at most 9, so 512 renders per letter, cheap), and the all-more and all-less corners on every family. Where a triple fails, record a clamp on the last-moved dial and apply it live with the dead-stop message.

8. **Three constants a builder needs are not in the document.** Rarity's k (5.2), the veto threshold per group (5.4), and the base group weights (5.2 points to `matching-final.md`, which does not list them). Fix: add a frozen table to section 5 with every group, its base weight, its veto threshold in library standard deviations and k, marked "set by eye", so the risk list in 12.3 is complete.

9. **The stability rule is a goal, not a mechanism.** "A one-step change moves at most three rows" cannot be guaranteed by a true ranking. The mechanism exists in `matching-algorithm-critique.md` and is missing here. Fix: state it. Compute the new list; any family whose new distance is within margin m of the old cut keeps its old position; m set once by eye.

10. **W is sized so that Wide wraps the word mid-word.** "hamburg" at 78 percent of the sheet at wdth 100 becomes about 110 percent at wdth 151 and wraps to "hambu / rg". A word broken in two reads as a bug on the first dial a person touches. Fix: W is the size at which the word at the family's maximum Wide spans 92 percent of the sheet. The default word is smaller and never wraps; sentences still wrap at word boundaries.

11. **Get it for office tools loses dials silently.** Roboto Flex's named instances are weight only at wdth 100 (verified: 20 instances, all wdth 100). A person who set Wide 70 and Inside tight gets Roboto Flex Bold and no word about it. Fix: the Get it panel names the loss: "Word gets Roboto Flex Bold. Your Wide and Inside are not in that file. The web version keeps them."

12. **Try's paragraph needs glyphs the `text=` load never fetched.** 10.2 loads each row with `text=` set to the sentence; 5.7 Try sets a paragraph. Fix: Try loads the family's full Latin subset before expanding, with the hairline placeholder meanwhile.

13. **Lean on Saira, Nunito and Roboto Serif is a second file nobody loads.** Italics are separate variable files of similar size. Not in 10.1, not in the load order, and a crossfade between files cannot morph shared axes (7.2 stage one). Fix: list the italic files and sizes in 10.1, load on first hover of the Lean tile, and state that ital switches use the crossfade only.

14. **Handle targets have no size.** Marker squares are 8 px; the handle square size is "square size". Fix: 12 px drawn, 24 px hit area, 44 px spacing as already written.

15. **No marked letter when the word lacks a and g.** "Hello" has neither. Fix: fallback order per tile, sans a e n o g H, serif g a e n o H, else the first letter, and say so in 4.4.

16. **Calibration test is underpowered.** Four held-back queries give too few rows at 90 or above to test "nine in ten". Fix: state a minimum of 20 judged rows per band before the curve is trusted, and keep stage one until then.

17. **"Inside" does not say what it is.** A Word user reads it as a tab. Fix: "Openings" (the holes in a, e, o) with the handle verb "Roomier". Keep one word everywhere.

## v1 issues not really closed

- **v1 issue 1 (C25).** Closed in principle by two tiles, honestly marked as pending the eye set. Not closed as a build: the two-tile editing model is missing (issue 4 above).
- **v1 issue 6 (sweep overbuilt).** The component check is the right replacement and my probe confirms it catches counter closure. But the rendering path misses glyph substitution (issue 2), so N18 is marked closed by a check that cannot fire.
- **v1 issue 12 (static download).** Decided as nearest named instance, correct, but the loss is still silent (issue 11).
- **v1 new issue "load state".** Closed for woff2; the measured TTF the worker needs is not part of it (issue 3).
- Everything else from the v1 list is genuinely closed: Thick anchor contradiction, travel rule, Upright stroke and Dark cut, Thick-thin as YOPQ alone (verified: at wght 400 and 900, YOPQ 25 to 135 moves the e crossbar 23 to 117 px and 53 to 146 px while the n stem stays at 91 and 180 px), one question to Dev, Nunito for rounded ends, CRSV pinned, track readouts, typed numbers gone, nudges over the whole library, rarity cap, bands instead of 59s, fixed specimen sentence, one size system, personas as an appendix.

## New issues the author could not see

- The Fontsource API normalises defaults to 400 and lists `ital` as an axis for families that ship italics as a separate file. It is a fine source for ranges and a bad source for defaults and file layout. Say which source answers which question.
- "Roboto Flex is the only open family with inner-letter axes" is not true (Amstelvar and Science Gothic have parametric axes; Science Gothic has wdth and YOPQ and is squarish). Not load-bearing, but Science Gothic is a candidate for the Squarish slot if Saira fails Dev's eye, and the spec names no fallback for Squarish.
- Hover carries the teaching: verb callouts, destination ghosts, axis tags. Keyboard-only and touch users never see a ghost. Make Tab focus on a handle do what hover does.
- Stale marker, selected rule and focus ring are all cobalt-only. Colour-blind users lose none of them against black, but a stale state that is only a colour mark is still a colour-only cue. Give stale a word ("changed").
- One UI sans at "one small size" plus hairline grey chrome is low-vision hostile. Fix: UI text 14 px minimum at 4.5:1, chrome grey no lighter than that, and a Big toggle that scales rail, tracks and squares by 1.5.
- The dial words are English idioms (Feet, Tails, Lean, Thick-thin). Non-native speakers and any later localisation need a glossary line per dial that is a definition, not a synonym. Add the definition under each row on first hover; it doubles as the screen-reader description.
- Nothing is shareable. A marketer cannot hand a designer the letter. Put family, Use and dials in the URL hash; costs nothing and needs no server.

## Ideas further out, and which I would adopt

1. **Start from a font you know.** Type "Calibri" or "Arial" and the clay lands at the nearest tile and dial values (the reachability map already exists in `matching-final.md`). For Word users this is the front door; for everyone it skips the blank-start problem. **Adopt for v1.** Small, uses code the matcher already has.
2. **Blink compare.** In Compare, a key or click flips yours and theirs in the same place at the same size, like an astronomer's blink comparator. Untrained eyes see differences they cannot name. **Adopt.** A toggle on the existing stack.
3. **What changed, in a line.** After the reveal, one sentence from the dial deltas: "Thicker and a little wider." Teaches the dial words by use. **Adopt.** Pure copy from state.
4. **Sliding between yours and the result.** A single track under a Compare row that morphs the result's measured groups toward yours, so "83 percent" becomes a distance you can feel. Interesting, but it needs a renderable midpoint and most results are static. **Defer.**
5. **Paste your text.** Try accepts a pasted paragraph so the specimen is the person's own heading and body. Students and slide makers judge their actual words. **Adopt for Try only.** Half a day.
6. **Big mode.** One toggle: 1.5 times scale on chrome, rows, squares and callouts; sheet unchanged. **Adopt.** The cheapest real accessibility gain here.
7. **Specimen card.** Export a PNG of yours, the top three and their reasons, for a brief or a Slack thread. Marketers and brand teams live on this. **Adopt in v1.1.**
8. **Say it in words.** Type "chunky friendly" and get dials. Rejected: it reverses the product's one principle, shape not search.
9. **Pairings.** Suggest a body font for a heading result. Real need, separate product. **Reject for now.**

## Personas checked

General people, designers, people designing in Word, students, small business owners in Canva, marketers, developers, low vision, plus three of mine: keyboard-only and motor-impaired users (hover-only teaching, 8 px targets), colour-blind users (cobalt-only stale cue), and non-native English speakers (idiomatic dial words, no definitions). The appendix in the spec covers the first eight fairly; the three added here are each one small fix and are in the issues above.
