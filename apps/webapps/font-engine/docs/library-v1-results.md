# Library and matcher v1: results

Built 2026-10-31 from Fontsource. Raw evidence is in `scripts/reports/`, the eye sheet is `spike/contact-v2.png`. Fonts live outside OneDrive in `C:\Users\check\AppData\Local\font-engine-cache`.

## What exists
- 2,103 families listed. 6,993 files in 1,572 matchable families are in `public/library/index.json` (1.54 MB). Another 89 families (pixel, dot-matrix, segment) are tagged and skipped by default.
- 309 near-duplicate families collapsed into aliases. Known false positives exist, such as bodoni-moda-sc into bodoni-moda.
- 98% OFL-1.1, the rest Apache-2.0, CC0, MIT, Unlicense, UFL-1.0.
- One query takes about 7 letters x 30 ms. The matcher has not yet been run in a browser.

## API
`findClosest(queryGlyphs, library, opts)` returns `{font, why, weak?, match}`. `match` is 0 to 100. Query letters: a e g n o H O. Options: `limit`, `includeConstruction`, `exclude` (family ids), `groupScale` (tolerance hook, not yet used), `canvas`.

## Open problems
| Problem | Evidence | Status |
|---|---|---|
| Percentages read low | A real neighbour's top result has median match 30 (quartiles 8 to 66), 27% flagged weak. Calibrated against each font's nearest neighbour, and near-duplicates pull that distance low | Open. Recalibrate, for example against the 5th nearest neighbour |
| Worse than the spike on the noise test | Family top-1, n+a+o: 29 vs 40. All 7: 48 vs 59. The new library is harder (9 weights per family), and p=4 lets one noisy group decide | Guard test only, but p=2 beat p=4 on every train row (60 vs 46) |
| Heavy rounded query regressed | Returns Orbitron 900, Audiowide, Sour Gummy 900, weak. An earlier build returned Fredoka and DynaPuff | Open, and this is the same class as C25 |
| Roundness group | All 7 train top-1: 46% as shipped, 55% at 0.25x, 64% removed | Open |
| a/g build gate unstable | Flips for 56 of 315 jittered queries (18%) | Open |
| Weight-ignored sibling test regressed | Median 302 vs spike 47 | Open |
| x-height ratio missing | n over H group not built, a gap against the critique | Open |

Eye read of the 9 shaped queries, by the agent and not by a designer: thin sans 4 of 5, slab 5 of 5, condensed bold 5 of 5, wide light 3 of 5. Slanted sans returns true italics, mostly monospace.

## Other sources
Nothing downloaded. This is not legal advice, and each licence must be read before shipping.

| Source | Recommendation | Reason |
|---|---|---|
| League of Moveable Type | Join | OFL, small, high quality |
| Velvetyne | Join, OFL only | Mostly OFL, check each repository |
| Fontshare | OFL subset only, linking out | Secondary summaries say redistribution and serving are restricted. Official text not read |
| 1001 Fonts | Skip | Per-font custom licences, many personal use only, no hotlinking |
| 1001 Free Fonts | Skip | Mostly "freeware" with terms in each readme, no hosting terms found |
| Open Foundry | Skip | No licence stated, mostly upstream fonts already in the library |

## v2 results (2026-10-31)
Cut-down run: the coordinator gave 30 minutes, so the eye sheet `spike/contact-v3.png`, the roundness ablation and the group-weight check on train were not done. All numbers below are the 20% holdout (315 families, own family and superfamily excluded). Raw: `scripts/reports/bench-before.json`, `bench-after.json`; script `scripts/bench.mjs`.

**What changed**
- Near-twin collapse by seven-letter distance under 0.06 (mean over letters, none over 0.3), same n/N class, same a/g build; script-suffix names lose to plain names; names kept as aliases. 347 collapsed (was 309). Small-caps-named pairs (bodoni-moda-sc, spectral-sc, baskervville-sc, bona-nova-sc, sedan-sc, anton-sc) are now kept apart by name, although their default Latin letters are identical to the parent's. 5 pairs kept apart for a differing storey.
- Superfamily key on every family (first word, two words for generic ones, hand list in `lib/match/superfamily.ts`); `excludeSuperfamily` option.
- p=2. Vetoes (weight, width 1.5 SD; bowl, contrast, x-height, openings 2 SD; serif or terminal class differs): vetoed families rank after all unvetoed, with `vetoed`, `band`, `showNumber:false`, number capped at 59.
- Match recalibrated (95 at p10, 75 median, 60 p90, 30 at d_far), train families only, 7 letters: p10 0.114, median 0.313, p90 0.859, d_far 1.42. d_far is the median random-pair distance (the spec's choice; it sits 1.65x above p90, so the 60-to-30 slope is sane).
- New groups: terminal shape (n and H stem bottoms, fitted to flat, round, wedge), bowl fullness (o, O), x-height ratio (n over H). Roundness group removed (not ablated this run; the earlier train evidence favoured removal).
- Storey gate: query side takes a declared build (`storey` option) or the majority of three votes; library side is a soft penalty by votes against (0, 0.1, 0.5).

**Numbers (before to after)**
| Test | Before | After |
|---|---|---|
| Neighbour match median (Q1 to Q3) | 22 (5 to 56) | 74 (65 to 89) |
| Share at 90+ | 4.8% | 23.5% |
| Share under 60 | 78.7% | 12.4% |
| Noise top-1/5/10, n+a+o | 29/46/55 | 32/41/46 |
| Noise top-1/5/10, all 7 | 48/62/68 | 48/60/65 |
| Sibling median rank (weight ignored) | 302 | 217 |
| Gate flips on jittered own font | 17.8% | 12.4% |
| Near-twin slots in top 5 (mask overlap) | 3.5% | 2.7% |
| Time per query (mean, 7 letters) | 107 ms | 102 ms (125 in a busier run) |

**Properties**: thin squarish returns squarish bowls in slots 1 to 3 (Bai Jamjuree, KoHo, Encode Sans Expanded). Heavy rounded fails: slots 1, 2, 4 are round (Chiron GoRound, SN Pro, Cause), slot 3 is Encode Sans 900 whose terminal class is unknown. Raising the terminal weight to 1.2 did not change it.

**Still open**
- Heavy rounded property fails on slot 3; unknown terminal class is not penalised.
- g tail terminal was built and dropped: its class agrees with the stem class on only 41% of fonts. n and H stem bottoms only.
- Noise test is lower at top-5/10 for n+a+o; sibling median 217 and gate flips 12.4% are still far above the targets (100 and 3%).
- Group weights are the by-eye table, not tuned on train; the "x-height lifts wide light" claim is unchecked; no eye sheet.
- Serif and terminal class vetoes are untested for over-vetoing beyond the 0.3% of vetoed top-1 rows.

## v3 results (2026-11-03)
Matcher rebuilt for the measured matching problems (M1 to M31, `docs/problems-matching.md`) and for letter forms (`docs/letter-forms.md`). Holdout: the 20% families that exist in both indexes (305 of 315); the 28 new holdout families (caps-only and new representatives) are reported separately. Before = the v2 matcher and index frozen on 2026-11-03; after = this build. Script: `scripts/bench3.mjs` (truth sets are independent of the new code: old first-word key, mask overlap, Google metadata, probe lists). Contact sheets: `docs/cases/matching/v3/`.

**Index**: 7053 files, 1715 families (was 6,830 and 1,628); 2.04 MB (was 1.80). A strict superset of the old file: everything new is optional, caps-only rows keep -128 in their lowercase slots, so the previous reader loads the new index and never ranks them (checked).

| Measure | Before | After |
|---|---|---|
| Self-retrieval (nothing excluded, holdout regular files) | 99.4% | 99.3% (misses: anton-sc->anton, bodoni-moda-sc->bodoni-moda; identical designs) |
| Noise test n+a+o, top-1 / 5 / 10 | 32.4% / 41.0% / 46.0% | 29.5% / 43.9% / 47.5% |
| Noise test all 7, top-1 / 5 / 10 | 47.9% / 60.0% / 64.8% | 46.2% / 63.3% / 66.6% |
| Neighbour match median (Q1 to Q3) | 74 (65 to 89) | 78 (67 to 92) |
| Script-first share of top 8 (57 clay lists), by primaryScript | 26.8% | 9.9% |
| Same, by the old hand regex | 13.2% | 5.0% |
| Duplicate share of top-8 slots, old key / identical masks | 9.2% / 3.5% | 2.2% / 2.0% |
| Fredoka / Varela Round rank, heavy rounded query (as Editor calls it) | 179 / 561 | 124 / 534 |
| Same, with `ends: 'round'` declared | n/a | 19 / 131 (round-ended in top 8: 3) |
| Courier Prime returning mono (of 8), outlines only / with advances | 0 / 0 | 0 / 7 |
| Pacifico returning scripts (of 8), outlines only / with advances | 0 / n/a | 0 / 2 |
| Bebas Neue rank: Oswald 400 / clay squarish black+narrow / clay plain black+narrow | absent | 10 / 2 / 511 (Anton 400: 5) |
| Speed, median ms per query (bench run; machine shared) | 110.8 | 127.6. Five alternating back-to-back runs on the 57 clay queries: before 118 to 126, after 115 to 125 |

Neighbour median 74 to 78 is partly recalibration (the percentage is recalibrated on the new distance and library; it is not a quality gain by itself). The noise test is level (all 7) or a few points lower (n+a+o top-1) because script-first and class penalties act on the true family too. New holdout families: 24 of 28 find themselves (misses are effect cuts and small-caps twins). Mono and script from outlines alone are weak (mono model AUC 0.787, script 0.934); with advance widths mono is exact and script is 0.96.

**Checks asked for by the coordinator and the advisor** (`scripts/smoke-v3.mjs`)
- Weight words, Roboto Serif at Thick 95, top 12 rows: stem over x-height off by more than 12% on 8 rows before, 9 after (the library has no closer stem at that weight; the distance cannot invent one). Rows that said "same weight" while off by more than 12%: 7 before, 1 after.
- Lexend: plain wide folds the widths into one row (Giga, with Mega, Peta, Tera, Zetta, Exa and Lexend under "also"); thin+wide 2 rows to 1. Zalando widths fold by the cut key.
- Letter spacing ("looser spacing") is worded only when the query glyphs carry `advance`. Editor does not pass it today, so in the app that reason does not appear yet. It is not fixed until lib/query.ts passes advances.
- `why` names a letter only for letters the person declared a form for (a declared form counts as an opened letter) or that the matcher scores (a e g n o H O; tail length only when g is in the query).
- Declared forms end to end on plain_home (top 8 families carrying the declared form; the rest are unknown): a one 7 of 8, g two 8, bJoin smooth 7, R curved 4, G spur 8, tTop cut 7, aTail tail 6, four open 8. No family that contradicts a hard fact appears in the top 60. `forms: {}` gives results identical to no option.
- Numbers never rise down a list (0 rises over 57 lists). `weak` is set on 2.6% of the top-8 rows (12 of 456), so the UI keeps nearly all its numbers.
- Langar (a self-retrieval regression after the first rebuild) was a stroke-end veto on its own font from a family-level end class disagreeing with its per-file class; fixed. Self-retrieval misses now: anton-sc, bodoni-moda-sc.
- Rounded sheets render with `ends: round` (marked in the title) plus an `_editor-call` variant without it.

**What changed**
- Letter forms: 13 forms measured per family (survey files at weights 300, 400, 700, majority vote; unknown when fewer than two of three agree), stored as a string per family. `FindOptions.forms`: hard facts rank a contradicting family after every agreeing one and are named in `why` and `formMisses`; soft facts add a distance penalty; undeclared is "either"; unknown is never penalised. The measured storeys of the clay no longer gate anything.
- Caps-only, collapse by popularity, superfamily and cut keys, script-first demotion, mono and script classes, effect tags, verified links, graded slant, italic style gate, veto bands that follow the number, reasons by distinctiveness with spacing words and `drivers`, round-ends decisiveness, combine() that keeps every letter, extra query letters (ascender, descender, capitals, advances).
- Build: `scripts/measure-forms.mjs` (one worker pass), `scripts/verify-links.mjs`, `scripts/build-index.mjs` (rewritten), `scripts/bench3.mjs`, `scripts/smoke-v3.mjs`, `scripts/contact-v3.mjs`. Google Fonts metadata (popularity, primaryScript) is cached next to the Fontsource list.

**Still open**
- UI side: pass `advance` per glyph in lib/query.ts; add l and p to the query letters; pass `ends: CLAY_ENDS[tile]` and any `forms`, `classes` the person declares. M22 (contrast dial direction, clay.ts), M23, M27 (hysteresis), M28 (Web Worker) are UI-owned.
- Heavy rounded without a declared end shape; Pacifico-like brush scripts from outlines only; y tail and e bar are not measured (classifier not robust); forms are per family at the regular weight (L51); squarish bowl (M14) and grotesque versus humanist (M15); hubness (M4).
