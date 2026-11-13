# Matching quality: problems found

Run 2026-11-03. Queries built the way the app builds them (`lib/query.ts`: fontkit, `getVariation(axes(f, st))`, letters a e g n o H O, `limit 12`, `exclude [libraryId]`, `excludeSuperfamily true`) against `public/library/index.json` (1,628 families, 6,830 files). 57 clay queries (each tile at home, thin, black, narrow, wide, thin+narrow, thin+wide, black+narrow, black+wide, plus the Plain-only dials), 39 known-answer queries (a real library font's own outlines, its family excluded), and 383 sampled library fonts for class statistics. Contact sheets (query on top, top 8 below, all drawn at one x-height, reason lines under each name) are in `docs/cases/matching/`; names are `<tile>_<setting>.png` and `ka_<family>_<weight>.png`. Scripts are in the session scratchpad `matchqa/`. Nothing in `lib/` or `components/` was changed.

The eye judgement comes from looking at about 20 sheets. Counts come from scripts. Top ten are marked **TOP 10**.

Overall read: good where the answer is a plain sans or serif at ordinary weight (thin rounded gives Chiron GoRound 98; Lobster gives Pattaya, Galada, Lobster Two, though note M3). Self-retrieval is perfect (139 of 139). The damage is in what the library allows as an answer, in classes the seven letters cannot see (mono, script, round ends), in how results are worded and scored, and in sameness. Plus one dial that points the wrong way.

---

## Library and coverage

**M1. TOP 10. Caps-only display fonts are not in the library.**
Query: any bold condensed query: `squarish_black+narrow.png`, Oswald 400 (`ka_oswald_400.png`), Archivo Black.
Came back: Anton, Big Shoulders, Antonio. Absent: Bebas Neue, Bangers, Cinzel, Permanent Marker, Bungee and its 6 variants, Passion One, Six Caps, Castoro Titling, Aboreto. `library-report.json`: 86 families (170 files) excluded as "caps-only or small-caps".
Why wrong: these are what a designer shaping a heavy condensed letter wants. The rule is "lowercase is missing", but the query only needs the shapes.
Fix: index caps-only fonts by mapping a e g n o to their capital glyphs and tag them "capitals only", or match them on H and O alone.
Status (v3): Fixed. 86 caps-only families (220 files) are back, matched on H, O and any capitals A, E, G, N in the query; their H+O distance is mapped onto the 7-letter scale (own calibration) so they rank fairly. Bebas Neue: absent before, now rank 10 for Oswald 400, 2 for squarish black+narrow, 5 for Anton 400.

**M2. TOP 10. Popular fonts are collapsed into obscure names.**
Index `aliases`: Roboto Slab is an alias of Hanuman (a Khmer font), IBM Plex Mono of Lilex, Fira Sans of FiraGO, Cormorant Garamond of Cormorant, Heebo of Roboto, Noto Sans JP and KR of Noto Sans HK, Noto Naskh Arabic of Noto Serif.
Why wrong: a card says "Hanuman" and Get it goes to a Khmer font; the person wanted Roboto Slab and cannot find it. Slab queries (`feet_*`, Zilla Slab 400) never return Roboto Slab.
Fix: keep the best-known Latin-origin family as the representative (hand list or popularity) and show aliases on the card.
Status (v3): Fixed. Near-twin collapse keeps the Latin-first, most popular name (Google popularity rank): Roboto Slab, IBM Plex Mono, Fira Sans, Cormorant Garamond are kept; Hanuman, Battambang, FiraGO, Cormorant become aliases. The four clay ids are protected.

**M3. TOP 10. Script-first fonts fill the results.**
Fonts made for Korean, Thai, Khmer, Telugu, Devanagari, kana, CJK, Arabic and Hebrew with a Latin that is a borrowed or cloned design. By a hand-picked list of 53 such families (approximate; Prompt, Kanit and Rubik are left out as Latin-first): 119 of 456 top-8 slots (26%), 17 of 57 top-1s, and 49 of 57 lists contain at least one. Gothic A1 (Korean) is top-1 for 5 queries and in 9 lists; Sarabun in 8; Palanquin 7; Koh Santepheap, Nokora, Noto Serif Hentaigana, Chiron GoRound TC; Mallanna, Mandali, NTR (Telugu) in `rounded_home.png`. Known answers: Lora gives Parastoo (Persian) 96, EB Garamond gives Benne (Kannada) 96, Open Sans gives Khula (Devanagari) 98, Lobster gives Pattaya (Thai) and Galada (Bengali) 98. Several of these are the right design but the wrong font to send someone to.
Why wrong: the promise is "the real free font I can use". The Get it page shows a script the designer does not read.
Fix: add a `primaryScript` flag; prefer Latin-first families, cap script-first ones at one per list and label them "Latin from a Thai font".
Status (v3): Fixed. `scriptFirst` from Google `primaryScript` (families in the top 100 by popularity, such as Prompt and Kanit, are exempt) with a Fontsource-subset fallback: 286 families flagged. Distance x1.2, at most one per list, labelled "Latin from a Thai font". Share of top-8 slots by primaryScript 26.8% to 9.9%; by the old hand regex 13.2% to 5.0%; top-1s 18 to 6 of 57.

**M4. Same few hub fonts answer many queries, and the eight look alike.**
`plain_home.png`: Gothic A1 89, Glory 88, Signika Negative 88, Oxygen 87, Sarabun 86, Signika 85, Palanquin 85, Gudea 85: eight humanist sans that cannot be told apart. Gothic A1 is top-1 for home, lean-, tall+, tall-, and appears in 9 of 57 lists; Signika Negative 8, Sarabun 8. Median spread between rank 1 and rank 8 is 6 points (Playfair known-answer: 69, 67, 67, 67, 67, 67, 67, 67).
Why wrong: eight near-identical rows waste the list (C24 asks for variety).
Fix: diversify the top 12 (maximal marginal relevance on glyph distance) and apply a hubness correction (CSLS) to the distance.
Status (v3): Partly. One row per lineage ("also" holds the rest) removes the near-identical eights. No hubness correction or maximal-marginal-relevance yet. Open.

**M5. TOP 10. The same design takes several slots (and regional cuts flood handwriting).**
31 of 57 clay lists (54%) and 160 of 383 library-font lists (42%) have two or more families of one superfamily in the top 10; 8% of slots are redundant. Source Serif 4 and Source Serif Pro together in all 6 feet lists; Big Shoulders, Text and Display in `squarish_narrow`; Anton and Anton SC at ranks 1 and 2 (`squarish_black+narrow.png`); Bodoni Moda and Bodoni Moda SC, Baskervville and Baskervville SC (`ka_playfair-display_400.png`); Noto Sans, Hebrew, Mono, Display in `plain_thin`; Zalando Sans Expanded and SemiExpanded; Rubik and Rubik One. Regional cuts: Caveat returns 8 Edu fonts in 8 slots; Edu VIC WA NT Hand returns 7 Playwrite; the library holds 92 Playwrite and 14 Edu families; 25 of 383 lists have 4 or more from one superfamily.
Why wrong: the lowercase is identical, so the person sees one font twice and Nothing You Could Do, Patrick Hand and Kalam never show.
Fix: one result per superfamily (best weight and width) with "also in this family" on the card; fold SC, Hebrew, Display, Text and width suffixes into the key; collapse Playwrite and Edu by hand.
Status (v3): Fixed. One row per superfamily, the rest in `also`. Redundant top-8 slots by the old first-word key 9.2% to 2.2% (lists with a repeat 31 to 10 of 57); by identical masks 3.5% to 2.0%. Lexend Deca, Tera and the other widths, and the Zalando widths, fold into one row.

**M6. TOP 10. Get it links that 404.**
Google Fonts specimen URL returns 404 (HEAD; a made-up family also 404, Inter 200) for 15 families: Source Serif Pro (in 6 of 9 feet lists), Big Shoulders Display and Text (in the top 8 of `squarish_narrow`), Big Shoulders Inline Display/Text, Stencil Display/Text, Arima Madurai (`plain_contrast-`), Briem Hand, Coda Caption, Finlandica, Fredoka One, Gentium Book Basic (`ka_crimson-text`), Merienda One, Saira Stencil One. The 6,830 woff2 preview URLs all return 200.
Why wrong: the last step of the core flow ends on a dead page for fonts that rank high.
Fix: HEAD-check `sourceUrl` at build; fall back to `fontsource.org/fonts/<id>`; map renames (Fredoka One to Fredoka, Arima Madurai to Arima, Big Shoulders Display/Text to Big Shoulders, Source Serif Pro to Source Serif 4).
Status (v3): Fixed. Every family's Get it page was HEAD-checked (a made-up family returns 404 on both hosts): 14 Google renames mapped, 130 fall back to fontsource.org, 0 dead. Stored in the index and exposed as `FontMeta.getUrl` (sourceUrl is overridden).

**M7. Effect and barcode fonts come back as ordinary answers.**
`plain_openings-_black`: Saira Stencil 900 is #1, Saira Stencil One #2. `plain_thin+narrow`: Alumni Sans Pinstripe #7 (69). The query Big Shoulders Stencil returns Libre Barcode 128 at #2. The library keeps 31 stencil, inline, outline, shadow, fill and pinstripe fonts and 4 barcode fonts untagged; only pixel, dot-matrix and segment are `construction`.
Fix: tag stencil, inline, outline, shadow, pinstripe and barcode as effect fonts, off by default.
Status (v3): Fixed. 29 stencil, inline, outline, shadow, pinstripe and barcode families are tagged `effect` (by name) and are off unless `includeEffects`.

**M8. Wrong categories in metadata.**
Noto Sans Mono, SUSE Mono, Atkinson Hyperlegible Mono, Cascadia Code are `sans-serif`; Pattaya (a Lobster-like script) is `sans-serif` (`ka_lobster_400.png`); Oleo Script, Lily Script One, Nova Script are `display`; Khand and Story Script are `sans-serif`.
Fix: derive monospace from fixed pitch and script from stroke features; do not trust Fontsource category.
Status (v3): Fixed. `mono` (136 families, from advance widths of seven letters, ratio under 1.03) and `script` (185 families, letters that connect when set) are measured; the Fontsource category is not trusted for either.

**M9. Superfamily key is both too broad and too narrow.**
Too broad (first-word rule): `source` joins Source Code Pro, Sans 3, Serif 4, Serif Pro; `nova` joins eight unrelated Nova fonts; `roboto` joins Roboto, Condensed, Flex, Mono, Serif, Yantramanav. For Plain this removes Roboto Condensed from `plain_narrow`, the most natural answer (Archivo Narrow comes in at 78). Too narrow: derivatives are not recognised, so they show as separate "near twins": Pretendard (Inter plus Korean) 98 and Open Runde 95 for Inter, Fira Mono 98 and FiraGO 92 for Fira Code, Archivo 99 for Archivo Black, Carlito 93 (metric clone) for Lato, Montserrat Alternates 97 for Montserrat.
Fix: hand list of derivatives; exclude only the clay font and its true cuts, and show derivatives under the original.
Status (v3): Fixed. `cutKey` (same design in other cuts) is used to exclude your own font; `superfamilyKey` (cuts plus derivatives such as Nunito Sans, Pretendard) is used for "one per lineage". Roboto Condensed, Source Serif and Source Sans are no longer glued together.

---

## Classes the seven letters cannot see

**M10. TOP 10. Mono versus sans, both directions.**
Courier Prime (`ka_courier-prime_400.png`): top 8 are Kiwi Maru, Oldenburg, Rokkitt, Podkova, Sanchez, Solway, Pridi, Zilla Slab, all proportional; first mono is Cutive Mono at rank 41; Space Mono, Cousine, Source Code Pro, Roboto Mono (all in the library) are outside the first 400. Roboto Mono gives Source Code Pro 117, Fira Code 112, JetBrains Mono 172. In the sample, 30% of monospace queries' top 5 are sans; 10 of 57 clay lists contain a mono font (Azeret Mono is #1 for `plain_black+narrow`, Reddit Mono #5 for `plain_thin`, DejaVu Mono Italic #7 for `lean+`).
Why wrong: mono is a spacing fact (i, l, m, w share a width). The query letters have none of them and no advance width.
Fix: store a fixed-pitch flag and add a gate or penalty when it differs from the query's (clay queries are never mono).
Status (v3): Partly. Mono is a gate when the query carries advance widths (`QueryGlyph.advance`): Courier Prime returns 7 of 8 mono (before 0). Without advances (today's `lib/query.ts`) the query is taken as proportional and mono fonts are soft-demoted, so outlines-only Courier Prime still returns 0. Needs one line in lib/query.ts: pass `advance: glyph.advanceWidth / upm`.

**M11. TOP 10. No script class: Pacifico gives italic sans.**
`ka_pacifico_400.png`: Josefin Slab 700i, GFS Neohellenic 700i, Josefin Sans 700i, Jost 600i, Ysabeau Infant 700i, two Edu hands. No script. Lobster rank 91, Satisfy 31, Courgette 70, Kaushan Script and Dancing Script absent. Sample: handwriting queries return 19% sans and 14% display in the top 5 (58% handwriting).
Why wrong: slant gate and weight outrank joined, brush-written strokes, the thing that makes Pacifico Pacifico.
Fix: add a script fact (exit strokes, stress, joining) as a class gate like serif and terminal class.
Status (v3): Partly. A connected-script class (join test) plus a model on the same z vectors (holdout AUC 0.934; 0.96 with side-bearings). Pacifico with advances: 2 of 8 scripts (before 0), Satisfy rank 7, Lobster 20. From outlines only the top 8 still hold 0 scripts (Lobster 25, Satisfy 45; before 91 and 31). Brush scripts that do not connect are not seen from seven outlines.

**M12. Vetoes misfire on scripts and fat faces.**
Dancing Script to Pacifico: rank 386, 9%, vetoed on "bowl shape"; to Satisfy 125 ("bowl shape"); Great Vibes 99 ("serifs"); Kaushan Script 93 ("width, x-height"). Lobster to Courgette 140 ("stroke ends"). DM Serif Display to Abril Fatface 217 ("stroke ends").
Why wrong: bowl, serif and terminal measures are unreliable on connected scripts and fat faces.
Fix: skip serif, terminal and bowl vetoes when the pen group marks a script, or require two groups to agree.
Status (v3): Fixed. Bowl, serif and stroke-end vetoes are skipped when the font or the query is a script.

**M13. TOP 10. The Rounded-ends tile loses its rounded ends.**
`rounded_home.png` (Nunito): top 8 are Mallanna, Chiron GoRound, Mandali, SN Pro, Thasadith, NTR, M PLUS Rounded, Huninn; the flat-ended ones are labelled "Same stroke ends". Fredoka rank 32, Baloo 2 171 (vetoed), Rubik 219. `rounded_black.png`: Encode Sans Semi Expanded 900 (89), Alexandria 800, Montserrat 900, REM 900 are flat-ended; Fredoka 179, Varela Round 561 (vetoed), Quicksand 456, Comfortaa none.
Why wrong: "rounded ends" is the tile's name. Terminal weight is 0.6 and measured only at n and H stem bottoms; the corner-radius group is off (`ROUNDNESS=false`). This is C25 again.
Fix: measure terminals on all stems (a, e, g, o), raise terminal weight to at least 1.0 for a round query, restore the corner group.
Status (v3): Partly. New `FindOptions.ends` ('round' declared by the Rounded ends tile, see `CLAY_ENDS`) is decisive: families with another known end class rank after; end class is also read on l, i, h, m, r, k, p stems. Heavy rounded query, declared: Fredoka rank 19 (was 179), Varela Round 131 (was 561), 3 of 8 round-ended (was 2). Undeclared, as Editor calls it today: Fredoka 124, Varela Round 534; at black the query's own end class cannot be read (termEnd is NaN), and the corner-radius group does not separate round from flat ends (tried, dropped). Needs `ends: CLAY_ENDS[tile]` in Editor.

**M14. The Squarish tile returns round fonts.**
`squarish_home.png` (Saira): Oxanium 94, Nokora 90 "near twin", Noto Sans 88, Roboto Flex 88, Metrophobic 88, Bai Jamjuree 88, Encode Sans Semi Expanded 88, Noto Sans Kawi 87; all 8 say "slightly rounder bowls". `squarish_black`: Inter Tight 900, Inter 900, Estedad, Encode Sans. Orbitron rank 378.
Why wrong: the squarish bowl is the tile's character, and fonts that differ by it score 88 to 90.
Fix: raise the bowl weight and veto at 1.5 SD; apply flatShare to o, O, e, g.
Status (v3): Partly. Bowl group weight 0.8 to 0.9. A tighter bowl veto (1.5 SD) cost the noise test 4 points and was reverted. Open.

**M15. Plain home: humanist answers, neo-grotesque neighbours buried.**
Roboto Flex is a neo-grotesque; `plain_home.png` top 8 are humanist. Inter rank 91, Open Sans 134, Public Sans 113, Source Sans 3 123, Arimo 195, DM Sans 155, Lato 292, Work Sans 330. (`plain_black` is good: Prompt, Rubik, Kanit.)
Fix: add letters with grotesque versus humanist cues (t, y, R, G, 1) and weight terminals and storey more for plain sans.
Status (v3): Open. Needs t, y, R, G, 1 cues in the distance; the forms exist in the index (tTop, G, R, one) but the clay has no declared value to compare.

**M16. Spacing is not matched.**
PRODUCT.md lists "spacing" as analysed; the features in `features.ts` have no advance width, side-bearing or letter fit, only glyph aspect. Two fonts with identical glyphs and different spacing tie.
Fix: add mean side-bearing and advance of n, o, H as a spacing group.
Status (v3): Partly. Letter-fit (mean side-bearing of n, o, H over x-height) is in the index and is scored and worded ("looser letter spacing") only when the query carries advances. Today's clay query does not, so it needs the same one-line `advance` change.

---

## Percentages and words

**M17. Percentages read higher than the eye allows.**
Saira home vs Nokora 90 "near twin" and Noto Sans 88 "close", both round next to a squarish query. Courier Prime vs Kiwi Maru 76 "close" while proportional. Rounded black vs Encode Sans Expanded 900 82 "close", flat-ended and wider than the query. Pacifico vs Josefin Slab italic 65. Calibration is against each font's nearest neighbour inside a dense library, so dense regions read high and sparse ones (script, slab) read low.
Fix: calibrate on rank within the query and cap at 79 when any group is over 1 SD.
Status (v3): Partly. A row never reads above 79 when a group other than tail length is more than 1 SD off, and numbers never rise down a list. Calibration is still against the first neighbour (recalibrated for the new distance).

**M18. Percentages do not separate rows and swing between neighbouring settings.**
Plain home 89 to 85 over eight rows; Playfair 69, 67 x7. Rounded thickness in 0.25 steps: top-1 98, 86, 97, 92, 89, 97, 97, 97, 90. Top-1 at home differs by tile: Squarish 94, Rounded 89, Plain 89, Feet 78, so "close" means different things.
Fix: show rank order until the top row leads by 5 points; show band words only.
Status (v3): Open (UI). Show rank order until the top row leads by 5 points. The matcher now returns `drivers` so the UI can say what drives each number.

**M19. TOP 10. "Same weight" is the lead reason on 89% of rows.**
405 of 456 top-8 rows begin with weight; the UI shows only `matches[0]` and `differs[0]` (`Results.tsx whyLine`), so nearly every row reads "Same weight. Slightly rounder bowls." The top first-differs: "slightly rounder bowls" 74 rows, "slightly taller lowercase" 52, "rounder bowls" 49. 26 rows have no difference line.
Why wrong: ORDER in `why.ts` is fixed (weight first), not by what distinguishes this result.
Fix: lead with the matching group of largest query z-magnitude and the differing group with the largest gap.
Status (v3): Fixed. The matching trait that is most distinctive in the query leads; the differing group with the biggest gap leads; `drivers` lists the top groups of the distance; weight no longer leads by default.

**M20. "No serifs" claimed for heavy serif fonts; serifs invented on sans.**
`feet_black`: Tienne 900, Vollkorn 900, Montagu Slab 700, Source Serif Pro 900 all say "no serifs" as a match, so does Tienne in `feet_black+wide`. Mali, a sans, says "bigger serifs" (`ka_comfortaa_400.png`).
Fix: take serif wording from `facts.serif` (presence class), not `serifLen` thresholds that fail on slab and fat-face.
Status (v3): Fixed. Serif wording comes from the serif presence class, not from serif length.

**M21. "Same weight" or "same width" contradicted by the outlines.**
Across 272 clay slots stem thickness is off by over 35% on 14 and o width off by over 22% on 10; on 8 the card says "same" anyway: Alumni Sans Pinstripe (stem x0.71), Lexend Giga 100 and Alexandria 100 (x0.71) for `thin+wide`, Big Shoulders Display (width x0.70) for `squarish thin+narrow`, Besley 900 (stem x0.70) for `feet black+wide`. Feet thin+narrow returns Literata (o 1.24 wider) and Aleo (1.31).
Fix: say "same" only within 12% in linear stem or width.
Status (v3): Fixed in wording, partly in distance. "Same weight" and "same width" only within 12% in linear stem or letter width. Roboto Serif at Thick 95, top 12: rows saying "same weight" while off by more than 12%: 7 before, 1 after. Stem over x-height on n is weighted 3 (was 1.5); the number of rows more than 12% off stayed 8 to 9 because the library has no closer stem at that weight.

---

## Dials and gates

**M22. TOP 10. The Thick-thin dial points the wrong way.**
`clay.ts`: contrast `less: 25` ("even"), `more: 135` ("varied"), axis YOPQ. YOPQ is the thickness of the thin strokes, so 25 gives hairline crossbars. Measured on the query n: at "even" (YOPQ 25) contrast 4.00, thinRel 0.037; home 1.16; at "varied" (135) contrast 0.61, thinRel 0.240. `plain_contrast-.png`: the "even" end returns Italiana, Spirax, Libre Caslon Display, Tenor Sans, Kalnia (high-contrast); the "varied" end returns Savate, Reddit Mono, Overpass Mono, Margarine (monoline).
Why wrong: the person asks for even strokes and gets the highest-contrast fonts. This is the C16 wrong-direction class, and the label is a promise the matcher then keeps faithfully.
Fix: swap `less` and `more` for contrast (or relabel the ends).
Status (v3): Open (clay.ts owner). Swap `less` and `more` for contrast, or relabel the ends. Not touched.

**M23. Openings is Wide under another name.**
Plain tile: top-8 overlap between Openings "roomy" and Wide is 5 of 8; between Openings "tight" and Narrow 7 of 8. Measured query o at full travel: openings roomy aspect 1.22, wide 1.10; tight 0.63, narrow 0.62; openFrac stays 0.01 and counter 0.47 vs 0.45.
Why wrong: two controls doing the same thing; the "space inside letters" claim is not visible to the matcher.
Fix: hide Openings from the matching handoff or keep width fixed while it moves (compensate XTRA with wdth).
Status (v3): Open (UI). Hide Openings from the match handoff or hold width while it moves.

**M24. Tails, Tall letters, Capitals: dials that cannot change the result.**
Plain, five positions each: Tall letters gives an identical top 3 at every position (no ascender letter is queried). Capitals +0.5 equals home. Tails: g descender does change (YTDE -98 to -305, g minY -0.106 to -0.314, measured `desc` 0.21 to 0.64) but top-8 at -1 and +1 are the same 8 families. Cause: `combine()` drops the worst of 5+ letters, and the g is the only letter that moves, so it is discarded as an outlier; `desc` also has weight 0.5 in the width group.
Why wrong: the person moves a dial, presses Closest to this and nothing changes.
Fix: do not drop the worst letter when it is the only one moving; add b, d, h, l, p, y to the measured letters.
Status (v3): Partly. `combine()` no longer drops the worst letter (it counts half, or fully when `changed` names it). Ascender, descender (b d h k l, p q y j) and spacing enter as extra terms; capitals A E G N are accepted. The UI must add l and p (and any opened letters) to `QUERY_LETTERS` for Tall letters and Tails to move results.

**M25. Lean is a cliff.**
Lean steps: 0 to 0.3 gives 0 of 12 italics, 0.4 gives 2 of 12, 0.5 gives 11 of 12, 1.0 gives 12 of 12. The gate flips at slant 0.04 and 0.08 with an ungated dead zone between.
Why wrong: 3 degrees is ignored, 5 degrees throws away every upright font.
Fix: replace the hard gate with a graded slant penalty.
Status (v3): Fixed. The slant cliff is a graded penalty; only an upright query still excludes italic cuts.

**M26. Italic fonts leak into upright queries.**
22 of 3,120 top-10 slots for upright library queries are italic cuts: Lora 400i for Cormorant Infant (#3), Literata italics (measured slant 0.03) for Gabriela, Griffy, Kurale, Miltonian Tattoo; Simonetta 400i for Playwrite FR Trad; Gentium Book Basic/Plus, Dai Banna SIL, Rasa 300i for Diphylleia; Asap 100i for Londrina Outline.
Why wrong: the gate uses measured slant, so italics with little slant pass.
Fix: also gate on `font.style === 'italic'` when the query is upright.
Status (v3): Fixed. An upright query skips every italic-style file regardless of measured slant.

**M27. Results churn with tiny dial changes.**
Plain thickness in 0.05 steps: top-1 changes at 21 of 40 steps, mean top-5 overlap 2.7 of 5; width 22 of 40 and 3.6 of 5; squarish thickness 20 of 40.
Fix: hysteresis or a coarser query grid; M4's diversification also stabilises ties.
Status (v3): Open (UI). Hysteresis or a coarser query grid. One row per lineage lowers the churn.

**M28. Speed.**
Node, desktop: median 123 ms per query, p90 155, worst 309; the first call needs 282 ms to measure the query alone (7 canvas rasterisations), then all 6,830 fonts are scored. In the browser it runs on the main thread (`Editor.tsx` calls `findClosest` directly); the Canvas readback there was not measured. `loadLibrary` is cheap (16 ms).
Fix: Web Worker; pre-filter by weight and width bins before the grouped distance.
Status (v3): Open (UI: Web Worker). Matcher median per query on the 57 clay lists, five alternating back-to-back runs: before 118 to 126 ms, after 115 to 125 ms (level).

---

## Result behaviour

**M29. "Nothing is close" never fires.**
Top-1 is weak (under 40) in 0 of 57 clay queries and for every known-answer failure: Pacifico 65, Courier Prime 76, Special Elite 69, Playfair 69. `weakAll` in `Results.tsx` never triggers.
Fix: base weak on class gates (M10, M11) and the number of groups past 1 SD, not on calibrated distance.
Status (v3): Fixed. `weak` is set when 3 or more groups are past 1 SD, for a weak vetoed row, or under 40: 2.6% of top-8 rows (12 of 456).

**M30. Veto ordering and the "same spirit" word.**
A veto sorts a font after every unvetoed one: Comfortaa gives Dosis at rank 87 with 48% and Poppins at rank 160 with 59% (vetoed on "stroke ends"). `bandWord` returns "same spirit" for every vetoed row regardless of number, even at 9% (Pacifico from Dancing Script), so that word can sit below an unvetoed "under 60" row and mean less. 22 of 383 sampled lists have a vetoed row in the top 12 (Astloch #2 Wire One, vetoed on bowl, serifs and stroke ends).
Fix: keep the veto as a label and a 0.8 multiplier on the number, and use the number for the band.
Status (v3): Fixed. Numbers never rise down a list (running minimum; 0 rises over 57 lists). The band word follows the number; a vetoed row shows 0.8 x the number, capped at 59. Ordering: hard facts (class, letter form, stroke ends) rank after everything, group vetoes after unvetoed rows.

**M31. Another tile's source font is a result.**
Saira home: Roboto Flex #4 (88). Squarish thickness sweep: Roboto Flex is #1 at u=0.05.
Why wrong: it reads as "you came back to where you started".
Fix: exclude all four clay families from every query.
Status (v3): Fixed in the matcher. `excludeSuperfamily` also excludes Roboto Flex, Saira, Nunito and Roboto Serif and their cuts. No Editor change needed.

---

## Top ten

1. **M1** Caps-only display fonts missing (86 families)
2. **M2** Popular fonts aliased to obscure ones (Roboto Slab to Hanuman)
3. **M3** Script-first fonts fill 26% of slots
4. **M5** Same superfamily repeated in 54% of clay lists
5. **M6** 15 dead Get it links, several in the top 8
6. **M10** Mono versus sans confusion
7. **M11** No script class (Pacifico gives italic sans)
8. **M13** Rounded tile loses rounded ends
9. **M19** "Same weight" leads 89% of reasons
10. **M22** Thick-thin dial points the wrong way

31 problems (M1 to M31).
