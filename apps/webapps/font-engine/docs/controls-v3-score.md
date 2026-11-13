# Controls v3: independent score

Reviewed 2026-10-31 against `controls-v3.md`, `PRODUCT.md`, `failure-cases.md` (C1 to C37), `matching-final.md`, `library-v1-results.md`, cases 7, 11, 12, 13, 14, 16, 17. Scores were formed before reading `controls-v2-score.md`. Verified against real files: fvar tables of Roboto Flex, Saira, Nunito, Roboto Serif, Fredoka and Science Gothic; `api.fontsource.org` for the same families; the real matcher (`lib/match`, `public/library/index.json`, run through `scripts/eval-lib.mjs`) for the neighbour test in 5.0, the heavy rounded and thin squarish queries, the clay families at home, and the alias coverage. Test scripts are in the session scratchpad (`nntest.mjs`, `q2.mjs`, `q3.mjs`).

## Scores

| What | Score | One line |
|---|---|---|
| Direction | 8.5 | Real fonts as clay, home not default, sweep decides presence, honest band words when the number is not earned. Word-drag quietly undoes the reveal, and the round grew five features nobody asked for. |
| Buildability | 7.0 | Tables are now right (fvar and Fontsource agree with 1.1 to 1.3). But the release gate for percentages cannot pass, veto means two different things, two new groups have no measurement method, the superfamily table the tests need does not exist, and N1 to N18 live in a file this one says it replaces. |
| Intuitiveness, no training | 8.0 | Definitions under rows, the what-changed line, one word per thing, Tab as hover. A two-axis pad, two stacked words, "either" bands, a second field in the top bar and eight chips is more than a Word user needs on day one. |
| Closure of C1 to C37 | 7.5 | Most closures are real. C25 is still closed on paper (groups not built, no method), C37's test names the wrong fonts, C24's variety is broken by uncollapsed script variants, C34 returns on tile switch through W. |
| Smoothness of change | 8.5 | Specified to the frame. W is per family, so switching tiles rescales the word; word-drag fights trackpad scroll and text selection. |
| Matching | 6.5 | Measured honestly and the hypotheses are the right ones, but the proof tests are wrong or missing: the percentage gate is impossible, the heavy rounded list is too narrow, terminal shape and bowl fullness are names without measures, all numbers are train numbers. |
| **Overall** | **7.6** | Below the 8.5 bar. A good builder builds the sheet, the rail, the sweep and the loading right from this document, then gets stuck in section 5 and ships band words forever. Fix the first six issues below and this is 8.5. |

## Ranked issues, each with the exact fix

1. **The percentage gate in 5.0 cannot pass, so percentages never ship.** I ran the test as written on 524 library families (one upright file near 400 per family, own family and aliases excluded, current matcher). d_close as the median fifth-neighbour distance is 0.433; the median first-neighbour distance is 0.272. Stage one gives 95 to anything at or below d_close, so 64 percent of top-1 rows sit at exactly 95: median 95, upper quartile 95. The test demands "median in 75 to 89, upper quartile below 95". It fails by construction, because a family's first neighbour is always nearer than the library's typical fifth. With d_close as the first neighbour it is the same picture (median 95, 19 percent under 60). What breaks: "until this passes, no percentage is shown anywhere" means band words forever, or a builder who bends the test. Fix: stop testing the formula against itself. Define stage one from quantiles of the library's own first-neighbour distances (aliases and script variants excluded): 95 at the 10th percentile, 75 at the median, 60 at the 90th, 30 at d_far, log-linear between. Replace the gate with a human one: Dev judges 30 top-1 rows from real-font queries at or above 90; nine in ten acceptable, else the quantiles move down one notch. Keep "under 60 on fewer than 20 percent of top-1 rows" (it passes today at 12 percent).

2. **"Veto" means two things.** 5.0 says vetoes replace p=4 and "the width veto must carry" the wide light query into slots 1 to 3, so a veto changes rank. 5.4 says a veto only hides the number and the row shows "same spirit". With p=2 and a veto that does not rank, a bold font sits in slot 1 for a hairline query with a grey word beside it, which is the C25 class again. Fix: one sentence in 5.2: "A vetoed family is ranked after every unvetoed family, in distance order, and shows a band word, never a number." Then the width veto genuinely carries Q5, and the empty case in 5.4 ("Nothing is really close") is simply the state where every family is vetoed.

3. **Terminal shape and bowl fullness are names, not measures, and C25 and C37 rest on them.** The spec says what they mean (flat, round, flared end caps; bowl area over its box; "share of straight contour") and nothing about how a raster in the canonical frame yields them. The one shipped shape measure, `cornerRatio`, is radius-based (two-disc opening in `measure.ts`), not a "corner count" as 5.0 says, so the diagnosis is also off. Measured: at p=2 with roundness removed, the thin squarish query moves from IBM Plex Sans to Bai Jamjuree, KoHo, Encode Sans and Titillium, which is closer to squarish, so removal is right; but the heavy rounded query still returns SN Pro and Mulish (flat terminals) in slots 2 to 4 with or without roundness. Only a terminal measure fixes that. Fix: write the method. Terminal shape: take the n stem's bottom 8 percent of rows and the g tail's last 8 percent of its path length; fit the ink boundary to a semicircle of radius stem/2 (round), a flat line (flat), or a widening wedge (flared); class is the best fit, confidence the margin, "unknown" below a margin, never gated on unknown. Bowl fullness: on o, bowl ink area over its bounding box (a square bowl fills more than a round one), plus the share of boundary pixels whose local curvature is below a threshold over three pixels. Both must survive the same three-render jitter test as storey.

4. **The heavy rounded test names the wrong fonts.** "Fredoka, DynaPuff, Baloo or M PLUS Rounded class in slots 1 to 3" is a list of the fonts an earlier build happened to return. Today's slot 1 for Nunito 900 with Nunito and Nunito Sans excluded is Chiron GoRound TC, a rounded font that is not on the list, so a correct result fails the test. Fix: the test is a property, not a list: "slots 1 to 3 are all fonts whose measured terminal class is round". The named four are examples.

5. **Script variants are not collapsed, so variety (C24) breaks and d_close is pulled low anyway.** For the thin squarish query the top five are IBM Plex Sans KR, IBM Plex Sans JP, IBM Plex Sans, Noto Sans Hebrew, Geist: three rows with one Latin design. In a sample of 391 families, 52 (13 percent) have another family's 400 within 0.06, uncollapsed: Heebo and Vazirmatn (both Roboto Latin), Archivo Narrow and Pragati Narrow, Gentium Book Plus and Gentium Book Basic. The "fifth neighbour" choice in 5.0 was made to escape duplicates, but the duplicates are the neighbours. Fix: in the library build, collapse a family into another when their seven-letter distance is under 0.06 and the n/N overlap test agrees, preferring the name without a script suffix (JP, KR, SC, TC, HK, Hebrew, Arabic, Thai, Devanagari, Math). Keep the collapsed names as aliases and show "also as IBM Plex Sans JP" in the row. Then d_close can be the first neighbour again and issue 1 gets simpler.

6. **The superfamily table does not exist.** The neighbour test, exclusion (5.3) and Shape this all exclude "the named superfamily", but `index.json` has `aliases` only, and the spec names superfamilies for the four clays alone. 1,572 families need a rule. Fix: superfamily = same first word of the family name (Saira, Saira Condensed) plus a hand list in `lib/match/superfamilies.json` for the exceptions (Nunito and Nunito Sans; Roboto and Heebo and Vazirmatn as derivatives). Write it at build time into the index.

7. **The document says "usable alone" and is not.** N1 to N18 are cited as closed "as v2" and are defined only in `controls-v2.md`, which this spec replaces. Fix: paste the N1 to N31 table into `failure-cases.md`, where the binding list lives, and point section 11 there.

8. **W is computed per family, so switching tiles rescales the word.** 6.1 computes W from the family's maximum Wide. Nunito has no Wide; Roboto Flex goes to 151. Clicking Plain to Rounded ends changes the word size, which is C34 by another route. Fix: W is computed once per word from the widest Wide across the four tiles, and only recomputed when the word changes.

9. **Word-drag undoes the reveal and fights the trackpad.** PRODUCT.md names the reveal as the product's moment. Word-drag makes the first move in word view with no zoom and no reveal, and vertical drag on a trackpad is page scroll until `preventDefault` fires on the pad; horizontal drag inside text is selection. Risk 8 admits "found by nobody". Fix for v1: keep the marked letter as the pad only for Thick (vertical, single axis), make the word non-selectable, and make the marker's leader read "drag up for thicker · double-click to shape". Two-axis padding waits for sessions.

10. **One-to-one edge following has no mapping.** 4 says "the edge follows the pointer one to one", but axis units are not pixels and the relationship is not linear (wght 100 to 400 moves a stem less than 700 to 1000). Fix: the sweep writes, per handle and letter, the edge position at each of the 24 steps; the drag inverts that table by linear interpolation. Say so in section 9's output list.

11. **Start from a font depends on a grid nobody has built, for a generator that no longer exists.** `matching-final.md` lists the reachability map as build step 3 over the hand-built generator. 3.4 says "the reachability grid in matching-final.md" as if it exists. Risk 9 hides the field if it is missing. Fix: define it in section 9 as a sweep output: measure the seven query glyphs at every Thick by Wide (by Lean) step of each clay family, store the vectors, and nearest by the matcher's own distance gives the landing. Calibri, Segoe UI and Cambria are measured on Dev's Windows machine once; only the vectors ship.

12. **All matching targets are train numbers.** "Noise test at or above 60", "train top-1 at or above 64", "median sibling rank below 100" are measured on the rows the weights were tuned on. The library has a 20 percent holdout flag already. Fix: every number in the 5.0 table is reported on holdout; the train number may be used to choose, never to pass.

13. **Two tiles is the largest untested surface in the document.** Stacked words, intersected rails, blended query, "either" bands with a standard-deviation threshold, hidden shortlist, two-family pins and URLs. Risk 5 says no evidence. Fix: build it behind a flag, and close C25 in v1 through one tile plus the terminal and bowl groups and the Squarer and Rounded ends chips, which the eye set can test without a blend. Promote two tiles when the two blended eye queries pass.

14. **Roboto Serif named instances are omitted from 1.3.** The file has nine (Thin to Black at opsz 20, wdth 100). Trivial, but a builder copying the table writes "none" into stop readouts. Fix: fill the cell.

## Scope, judged

| Feature | Verdict | Why |
|---|---|---|
| What-changed line | Keep | Pure copy from state, teaches the words |
| URL hash | Keep | No server, closes "nothing is shareable" |
| Blink compare | Keep | A toggle on the existing stack |
| Paste text in Try | Keep | Half a day, students and slide makers need it |
| Big mode | Keep, smaller | 14 px and 4.5:1 do most of the work; Big mode can be a single CSS variable |
| Start from a font you know | Defer unless issue 11 is built | The grid it needs does not exist; without it the field is hidden anyway |
| Drag the word | Cut to one axis | Undoes the reveal, fights scroll and selection, no evidence |
| Two tiles | Flag | Largest untested surface, no evidence, carries C25 alone |

Counting the two deferred items and the flag against the score is why buildability is 7.0 and not 7.5.

## v2 issues not really closed

- **v2 issue 8 (constants).** The table exists and is good. But the veto threshold column has no semantics (issue 2), so the table does not yet say what the matcher does.
- **v2 issue 16 (calibration underpowered).** 20 rows per band is written. Stage one, the thing shown until then, is now gated behind a test that cannot pass (issue 1), so the fix made the number less reachable, not more.
- **C25.** Still closed in principle. The two groups it depends on have no measurement method (issue 3), the test for one of them is a font list (issue 4), and the blend is unevidenced (issue 13).
- **v2 idea 1 (start from a font).** Adopted on the premise that "the reachability map already exists". It does not (issue 11).
- **Everything else from v2 is genuinely closed, and verified where a file could be read:** home table matches fvar (Saira default 100, Nunito 200, Roboto Serif opsz 20, all overridden by home 400, 100, Use); Fontsource normalises defaults to 400 and lists `ital` as an axis (confirmed for Saira and Nunito); Recursive and Fraunces cut so `rvrn` is confined to Roboto Flex and Saira with check 9; TTF for the worker; two-tile editing written; Shape this rows only; exclusion by superfamily only (rule needs issue 6); corner sets; stability mechanism; W from maximum Wide (needs issue 8); loss named in Get it; Try loads full Latin; italic files in load order; 12/24/44 px; marked-letter fallback; Openings; Tab as hover; words on cobalt states; 14 px and Big mode; definitions; URL.

## New issues the author could not see

- The library's "near-duplicate" pass missed script variants and derivatives (issue 5). This also means the clay at home finds Heebo, Vazirmatn and Yantramanav (Roboto Latin under other names) in slots 1 to 5 for Plain: a Word user reads "the tool found Roboto". The grey "near where you started" word covers it only while no dial has moved; after one step, Heebo is a normal result with 95. Say "a Roboto derivative" in the row through the alias list.
- `cornerRatio` is already radius-based (issue 3). The spec's diagnosis "corner count" is wrong even though its decision (remove) is right by my run.
- Monospace is not a problem: 1.9 percent of top-5 slots for proportional queries against a 3.9 percent library share. `library-v1-results.md` worried about it for slanted queries; the spec need not act.
- The default word "hamburg" has no capital, so Capitals, H and O never appear to the person while the query sends H and O from the clay. Honest, but the specimen strip is the only place capitals are seen. Add one capital to the preselected word ("Hamburg") so Capitals has a visible letter and the marked-letter rule still picks a.
- Touch is absent. Double-tap, no hover, drag is scroll. Desktop is primary by Dev's decision, so one line on the page at under 1024 px ("Works best on a laptop or desktop") is enough for v1.
- Pins are session-only. The URL covers one state; eight pins vanish on reload. Store pins in localStorage, or say they are session-only in the strip.
- Dev is the only judge for stage two. One person's eye becomes "how likely a designer would call this close". Fine for v1, but name it in 5.4 so nobody reads the percentage as a measurement.

## Ideas further out, and which I would adopt

1. **Three doors instead of a blank start.** At first paint, three tiny pre-shaped versions of the word beside the hero (thin and wide, heavy and rounded, with feet). Click one and the clay lands there. Solves the blank-start problem that word-drag and start-from-a-font were both reaching for, with zero new mechanics: they are three pins filled by the build. **Adopt for v1.** Costs a day, removes two riskier features.
2. **Point at the number.** Hover or focus the percentage and the letters that drive it light up on the row and on Yours, with the group name: "mostly the a and the g: openings". The reasons already come from the same distances. **Adopt.** Turns a number into something a Word user can check with their own eyes.
3. **Close or not, one tap.** Two small buttons on every row, "Close" and "Not close", feeding the stage two curve directly. Compare-then-Get it is a weak signal; this gets 20 judged rows per band in a week of test sessions instead of a quarter. **Adopt.** Store locally, export from test sessions as 5.7 already plans.
4. **Describe my letter.** One sentence in plain words for the current clay: "a heavy, wide, upright plain letter with round ends". It is the what-changed line generalised to the whole state, read by screen readers, pasted into Slack by marketers, used as the Figma layer name. **Adopt.** Copy from state, no new data.
5. **In place.** Compare at the person's real destination: a Word page at 11 pt, a slide title, a web button, a shop sign. Picks the size strip's sizes and dresses them. **Adopt in v1.1.** This is what students, slide makers and small businesses actually judge on.
6. **Blind pair.** Two results without names; pick one; three picks reorder the list by what the person's eye preferred. Fights the "stigma of free" by hiding names until chosen. **Defer.** Real but a separate loop.
7. **Lock a letter.** Mark the g as "must match this shape" so the storey and tail class become hard gates for that query only. **Defer.** The chips cover it well enough for v1.
8. **Result directions, not ranks.** Group results under three headings from the dominant difference: "heavier ones", "rounder ones", "with feet". **Reject for v1.** The chips already do this with less chrome.

## Personas checked

General people, designers without training, people designing in Word, students, small business owners in Canva, marketers, developers, low vision, plus five of mine: touch and tablet users (nothing in the spec; one line for v1), keyboard-only (closed by Tab as hover), non-native speakers (closed by definitions), dyslexic readers (Openings and Middle height are the dials that matter to them; the Use tile for small text should say so in one line), and non-Latin script users (out of scope by PRODUCT.md; the page should say Latin only, not fail silently with hollow letters). The appendix in the spec covers its thirteen groups fairly; the test column there is sessions, and two sessions each is too few to decide word-drag, which risk 8 leaves to "first sessions".
