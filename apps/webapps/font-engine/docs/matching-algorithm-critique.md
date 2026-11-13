# Matching algorithm: critique and a tighter plan

Written 2026-10-31 against `docs/matching-algorithm.md`, the spike (`spike/engine.js`, `run.js`, `generator.js`, `results.json`, `notes.json`, `contact.png`) and the current `lib/match` build. Planning only. Nothing here is code.

## The short version

The proposal has 13 good instincts and three representations fighting each other: named attributes, a learned embedding, and parametric coordinates. That is three things to build, three things to keep in sync, and three places to be wrong. The spike evidence does not ask for any of them yet. It asks for four plainer things:

1. A clean library. Caps-only, pixel, dot, Latin-less and duplicate fonts caused most of the bad slots in the contact sheet (Q1, Q5, Q6, Q7). That is a filter problem, not a metric problem.
2. A metric where one big visible miss cannot be averaged away by twelve small hits. Q5 lost "wide" to twelve equal features. Root-mean-square is the wrong combiner.
3. One shared frame: every letter, drawn by the generator or taken from a font, rendered at the same x-height, aligned on the same baseline and left stem, compared as shape. Attributes are derived from that frame and used to gate and to explain, not as the only distance.
4. A test that measures the real pipeline. Self-retrieval with jitter tests measurement noise, not the crude generator. The test that matters renders a font's best-fit parameters through the generator and asks whether the font comes back.

The two big ideas (intent weighting, fitting the parametric system to every font) are judged in their own section. One should be demoted to a tolerance rule and a tie-break. The other should be kept, but built as a lookup table, not an optimiser, and used for benchmarks and explanations, not as the matching space.

## Part by part

### 1. Library intake

**Fault.** The proposal names the pollution (pixel, icon, caps-only) and then proposes to tag construction (pixel, dot, stencil, inline, shadow). Caps-only is not a construction. It is the pollution the contact sheet actually shows (Syncopate, Julius Sans One in Q1 and Q5) and there is no detector for it anywhere in the proposal or in `lib/match/types.ts`, which only knows `pixel | dot-matrix | segment`. Duplicate detection by "outline hash" is fragile: two builds of one design differ in units per em, point order, hinting and composite glyphs, so hashes miss exactly the duplicates that matter. The spike library also holds dozens of Noto script fonts (Lydian, Saurashtra, Thaana, Ogham and so on) whose Latin glyphs are the same Noto Sans Latin, which means one design can fill several result slots.

**What fails on real data.** Any thin or wide query lands on caps-only display faces, because their "n" slot holds a small capital with the right stem and width. Any "soft" query lands on dotted fonts because dots are round. Scaling to all of Google Fonts makes both worse, since display and script fonts are a larger share there than in the 304-family sample.

**Better.** Cheap detectors run once offline, in the same render frame as everything else:
- Caps-only or small-caps: render `n` and `N` at the same scale and compare masks. Overlap above a set threshold means caps-only. Same for `a` versus `A`. Tag `capsOnly`, exclude by default.
- Latin presence: require real outlines for the 7 query letters and that they differ from `.notdef`. Already partly done (`-128` marker). Add a check that lowercase letters are not all the same height as capitals (unicase).
- Duplicates: compare the quantised feature vectors already stored, then confirm with mask overlap on `n`, `a`, `g`. Collapse to one family, keep the better-covered one, store the aliases so the result row can say "also published as".
- Construction: `pixel`, `dot`, `outline/inline`, `stencil` from mask properties (run-length histogram peaks for pixel, many small holes for dot, a hole along the whole stem for inline and outline, breaks in stems for stencil). Exclude by default, one toggle to include.
- Styles: ingest every weight and the italic for every family. The spike had zero italic files, which is why Q8 could only find school scripts. Variable fonts: sample the named instances only. Do not walk axes.

Cut: tagging `shadow` and anything that needs more than mask arithmetic. Popularity, kerning presence and glyph coverage as quality signals (part 8) can wait.

### 2. Glyph normalisation

**Fault.** "Scaled to its own x-height (shape) and to em (proportion)" is right, but the proposal misses that the hard part is alignment, not scale. Shape overlap means nothing until the two letters share a baseline, an x-height and a left stem edge. Em scale is also the wrong proportion reference: fonts set their em arbitrarily (the spike's `top` feature is x-height per em, and a font with a small em-relative x-height but the same shape would look "different"). The proposal also wants to "measure on outlines where possible". Real outlines overlap, self-intersect, come as quadratics and composites and sometimes open contours. The raster at 400 px worked for 2338 glyphs in 65 seconds. Outline measurement is a month of edge cases for a solo builder.

**Better.** One canonical frame per letter: x-height (or cap height for `H`, `O`) mapped to a fixed pixel height, baseline on a fixed row, left ink edge of the stem letters on a fixed column (left ink edge of the bowl for `o`). Store three things from that one raster: the binary mask, a blurred or signed-distance version of it at low resolution (for tolerant overlap), and the measured attributes. Em-relative values that designers actually see (x-height to cap height ratio, ascender ratio) become named attributes computed from `H` versus `n` in the same font, not from the em.

### 3. Features

**Fault.** The named attribute list is good. The learned embedding is not honest for this project right now. A self-supervised convnet needs a training stack (no Python installed, no GPU, no labels), a positive-pair design that does not exist yet (same family different style teaches weight invariance, which is the opposite of what a user dragging "stem wider" wants), and a way to explain its output. The claim that augmentation with parametric renders "closes the domain gap" is a hope, not a result. I am not aware of an off-the-shelf open model that embeds Latin glyph shapes for perceptual similarity in the browser, and I would not claim one exists without checking. The published font recognition work I know of (deep font classifiers trained on large labelled sets) solves "which font is this" and not "which font looks closest to a crude drawing".

Two faults the lead did not notice. First, the current corner-sharpness feature counts right-angle equivalents. Script faces score 47 against 7 for the query (Q8 notes). This is a construction-count feature masquerading as a shape feature and it is the main thing dragging slanted queries to scripts. Second, `a` and `g` construction is listed as an attribute but the generator presumably draws one construction per style. If the query's `a` is single-storey and the font's is double-storey, no amount of feature distance is meaningful for that letter. That is a gate, not a distance.

**Better.** Two layers, neither learned with labels:
- Named attributes, grouped. Eight groups are enough: weight (stem over x-height), width (aspect), x-height ratio (n height over H height), contrast and stress (thin over thick, angle of the thinnest point on `o`), slant, roundness (corner radius relative to stem, not corner count), aperture and counter (open fraction, counter area), serifs (foot presence and length, top flag, slab thickness). Each group gets a single scalar distance so the combiner (part 7) can see groups, not nineteen correlated numbers.
- A dense shape descriptor that needs no training: the aligned, blurred mask at low resolution (for example 24 by 24 per letter), reduced with PCA computed offline in Node on the library. PCA is label-free, deterministic, runs in minutes on this PC and gives a 16 to 32 number vector per letter that you can project back and draw as an overlay. This is the honest "embedding" for v1. If a learned model is ever added, it replaces this one component and nothing else moves.
- Topology gates: hole count and arch presence for `a`, `g`, and the "two storey" question. Match only against fonts with the same construction for that letter, or drop that letter from the comparison.

Cut from v1: the convnet. Replace corner-count sharpness with a radius-based roundness measure.

### 4. Query formation: intent weighting from edits

**Fault.** This is the most seductive idea and the weakest. Untouched is not "do not care". The person picked "Serif" from the style swapper and left contrast alone. The style default contrast is what they want. Weighting it low lets a low-contrast slab win, which is exactly the designer-facing failure. In the current editor (`lib/params.ts`) there are five styles and seven numbers, three exposed as steppers. Most parameters will be untouched in every session. Intent weighting would collapse the query onto one or two dimensions and return every font that shares one stem width.

There is also a subtler fault. "Dragged stem wider means weight matters" confuses attention with importance. People drag the handle that is nearest and most fun. The attribute they did not touch may be the one they would reject a font on.

**What fails on real data.** A query that changed only roundness returns Fredoka, Comic Relief, Baloo and a heavy grotesk with round terminals, in a mix of weights the person never wanted. The person reads it as random.

**Better.** Keep the edit history, use it for three things that cannot hurt:
- Tolerance, not weight. A parameter the person moved and settled gets a tight band around its value. An untouched parameter keeps its style default as the target but with a wider band. Neither band is ever zero width or infinite. In practice this is a per-group scale on the distance that ranges, say, 0.7 to 1.3, not 0 to 1.
- Ordering of the explanation. Say the moved attribute first.
- A tie-break when two fonts are within the same distance band.

Do later, after the basic list is right, and only if a session log shows it helps. The letter is the query. The product principle already says so.

### 5. Shared space: fitting the parametric system to every font

**Fault.** The idea that every font gets coordinates in the editor's space is valuable, but the proposed use (nearest neighbour in param space plus residual) is wrong. The generator has about seven numbers and a style enum. Real fonts have hundreds of degrees of freedom. Fitting is many-to-one: dozens of visibly different fonts land on the same parameters. Matching in param space would then throw away exactly the detail that separates them, which is what the person wants to see in slots 1 to 5. The residual term does not rescue it, because a residual is a single number that says "far from the generator", not "far from the query".

The fitting itself is also over-specified. Optimising `LetterParams` per font with a shape loss, for 1500 families times several styles times seven letters, is a long offline job with local minima, and every change to the generator invalidates it.

**Better.** Build it as a table, not an optimiser, and use it for three things:
- Render a coarse grid of the parameter space through the generator once (five styles times a handful of steps on the main numbers; a few thousand renders, minutes in Node). Measure each render in the same frame as the fonts. For each font, record the nearest grid point and the distance to it. That is the fitted parameters and the residual, with no optimiser.
- Use the residual as a reachability map. It tells you which parts of the library the generator can express at all. The Q4 failure (slabs closing the `n`) is a reachability problem. The map also tells you which attributes to never explain for which fonts (part 9).
- Use the grid for the benchmark that matters (part 12) and for "start from this font" later.

Matching stays shape to shape and attribute to attribute in the canonical frame. The parameter delta is a by-product used for explanation and for a future "nudge toward" feature.

### 6. Retrieval

**Fault.** Two stages with approximate nearest neighbour in a Web Worker is sized for a library a hundred times larger than any free-font library will be. Five thousand styles times seven letters times about twenty numbers is under a million multiply-adds. Brute force is a few milliseconds on any laptop. ANN adds a dependency, an index build, and recall loss, for no gain.

The valuable part of this section is stage two: aligned glyph overlap. It is listed as a re-rank of the top 200 but it is the core comparison and should be shaped as such. The "word-level check" has a hidden assumption: the person's word rendered by the generator has no spacing, no kerning and crude joins, so comparing word images would mostly measure spacing, which the generator does not express.

**Better.**
- One pass of hard gates: script and Latin presence, construction tags, caps-only, letter construction (part 3), and italic versus upright. The italic gate is important: a slanted query should bring true italics and obliques, an upright query should exclude them. Q8 shows what happens without it.
- One pass of grouped attribute distance over all remaining fonts (part 7). Keep the top 40 families.
- One pass of blurred mask overlap on the aligned letters for those 40. Combine with the attribute distance by rank, not by adding raw numbers.
- Render the person's word in the top results for display only. Do not score it.
- No worker until profiling shows more than 100 ms on the target machine. Keep the code pure so moving it to a worker later is a one-line change.

### 7. The metric

**Fault.** The proposal wants weights learned from designer triplets, bootstrapped from "sibling and look-alike pseudo-labels". There are no designer triplets and there will not be many for months. The sibling pseudo-labels are worse than nothing: a sibling pair is the same design at a different weight, so a metric fit to rank siblings close learns to ignore weight. The spike then measured that weight "swamps everything" using the sibling test, which is the one test where weight is supposed to hurt. The conclusion follows from the test design, not from the data. The lead did not notice this.

The deeper fault is the combiner. Root-mean-square over features is an average. Designers do not average. A font that is right on eleven things and clearly wrong on one visible thing (weight, width, serif presence, slant) is rejected. Q5 is the clean example: width was 1.8 SD off and lost to twelve features that were each a little right. The current `lib/match` answer (aspect weight 3) treats the symptom.

**Better.**
- Group distances (part 3), then combine with a high-order norm (p of about 4) across groups. This behaves like "the worst group decides, with some credit for the rest". It is one line of code and it changes lists more than any reweighting.
- Hand-set group weights, tuned by eye on a frozen set of about twelve shaped queries, checked by Dev, who is a designer. Record the choice and the reason in the doc. This is the honest v1 metric.
- Replace the sibling test with the two tests in part 12. Keep the "weight ignored" sibling test only as a shape-invariance check that must not regress.
- Revisit learned weights only when at least a few hundred human judgments exist (part 11).

### 8. Ranking the list

**Fault.** Maximal marginal relevance is fine and cheap. The proposal spends its words on variety and quality signals while the actual list problem in the contact sheet is slots 1 to 3 being wrong kinds of font. Fix the gates and the combiner first. "Prefer fonts with fuller weight sets" is a bias toward big families, which pushes small good designs down for a reason the person did not ask for.

**Better.** Group by family, pick the style nearest the query weight and slant, show the chosen style name in the row. Apply MMR from slot 4 onward only. Make list stability a ranking rule: when the person moves one stepper by one notch, the list should change by at most a few rows. Compute the new list, then keep any font whose new distance is within a small margin of the cut in its old position. Churn is what makes a tool feel random. Cut quality signals and popularity from v1.

### 9. Explanation

**Fault.** "Thresholded by perceptual size" assumes a known just-noticeable difference per attribute. Nobody has those numbers for this feature set. Also, several current features are generator artefacts (corner count, top-left flag thickness in Q3 notes). Explaining them would tell the person their letter differs in a way they never drew.

**Better.** Thresholds in library standard deviations, set by eye on the frozen query set, stored in one table. Only explain groups that are both visible by that rule and reachable by the generator for that font (part 5 residual map). Say what matches first, in the person's words (the stepper labels: edge, width, roundness, style, thinness), then one or two differences. Never more than three sentences per row.

### 10. Confidence

**Fault.** Calibrating against local nearest-neighbour density is right and `lib/match` already has `weakAt` per letter count. What is missing is the other reason for a weak list: the query is outside anything fonts do. The spike clipped query features at 3 SD on Q3 and Q4. Those are not "weak matches". They are "your letter is beyond the library".

**Better.** Two flags with two messages. "Nearest we have" when the best distance is beyond the local nearest-neighbour band. "Your letter goes further than real fonts do on X" when the query's group value is clipped, naming the group. The second flag is also a hint to the editor rules (part of what makes edits "safe").

### 11. Learning from use

**Fault.** Rocchio on "More like this" and "Not this" is fine. The proposal jumps to anonymous triplet collection with consent. That is a product and legal surface, not an algorithm.

**Better.** Do the in-session re-weighting later, after the list is right, as a group-weight nudge from the clicked row's group distances. Log nothing in v1. When logging starts, store the query parameters and the chosen row, which is already a weak triplet, and nothing personal.

### 12. Evaluation

**Fault.** "A gold set of about 100 shaped queries judged by real designers" is the right end state and the wrong first step. It does not exist, and the only designer available is Dev. Meanwhile the current benchmark, self-retrieval with jitter, measures measurement noise. It passed at 79 percent top-1 even before jitter, and it says nothing about the thing that fails, which is the crude generator meeting real fonts.

**Better, in this order.**
- Frozen eye set. Twelve shaped queries covering the editor's five styles and the known weak cases (wide, condensed, soft, slanted). One contact sheet per round, judged by Dev, acceptable slots counted. This is the number that decides whether a change ships.
- Parameter-rendered retrieval. For each holdout font, take its fitted grid parameters (part 5), render them through the generator, query, and record the rank of the font and of its duplicates. This is the only automatic test that exercises the whole pipeline including the generator. Report median rank and top-10 per category.
- Shape-invariance check. The "weight ignored" sibling test from the spike, as a regression guard only.
- Designer gold set later, built from logged sessions once there are users.

### 13. Speed and delivery

**Fault.** Overbuilt. The library at 5000 styles is a few hundred kilobytes of Int8 attributes plus a few megabytes of low-resolution masks or PCA vectors. One file, loaded once, fits. Shards, a worker and pre-warming solve a problem that does not exist at this size. Query rasterisation of seven letters at 400 px on a canvas is tens of milliseconds.

**Better.** One static JSON or binary file per library version, cached by the browser. Pure functions so a worker is a later one-line move. Measure on this PC before adding any of it.

## What is missing

- **The generator is part of the matching algorithm.** Its vocabulary bounds what can be found. Q4 failed because of slab geometry, not matching. The generator needs its own acceptance test: every style at every stepper extreme must produce a letter whose counters are open and whose joins are clean. The reachability map (part 5) is the measurement.
- **Letter construction as a gate.** Single versus double storey `a` and `g`, cursive versus roman forms. Decided by the style swapper, enforced in matching.
- **Italic and oblique handling.** A library style axis, a query slant gate, and obliques matched to sans italics rather than scripts.
- **Alignment before overlap.** Baseline, x-height, left stem. Without it, overlap scores are noise.
- **List stability under small edits.** A ranking rule, not a UI trick.
- **Spacing.** The generator has none. Either give it default sidebearings from stem width so word rendering looks right, or never compare spacing. Pick one and write it down.
- **Which letters carry the query.** `params.ts` has a master order and seven query letters. Dropping the single worst letter (current `combine`) is a good start. Also drop any letter the topology gate rejects, and weight the master letter higher since it is the one the person actually shaped.
- **A doc of frozen decisions.** Weights, thresholds, gates and the reasons, in one table, so every agent that touches `lib/match` changes the table and not the code.

## How the parts become one system

One frame, one loop.

The frame: every letter, from the generator or from a font, is rendered into the same canonical raster (fixed x-height, baseline row, left stem column). From that raster come three derived things: grouped attributes, a low-resolution blurred mask (and its PCA vector), and topology flags. Fonts get these offline. The query gets them live, with the same code.

The loop:
1. Gates on flags (Latin, construction, caps-only, italic, letter topology).
2. Grouped attribute distance with a high-order combiner, over all remaining fonts.
3. Mask overlap on the top 40, merged by rank.
4. Family grouping, nearest style, stability rule, MMR from slot 4.
5. Explanation and confidence read the same group distances and flags. No second computation.

What follows from sharing the frame:
- The parametric fit (part 5) is just "which grid render is nearest to this font in the frame". No optimiser.
- The benchmark (part 12) is just "render the nearest grid point and query it".
- The explanation never contradicts the ranking because both read the same group distances.
- Intent weighting (part 4), if it comes, is a per-group scale on step 2 and an ordering on step 5. Nothing else moves.
- A learned embedding, if it ever comes, replaces the PCA vector in step 3. Nothing else moves.

Judgment on the two big ideas. Intent weighting from edits: demote to tolerance bands and explanation order, do later, prove with sessions. Fitting the parametric system to every font: keep, but as a grid lookup that yields a reachability map, a benchmark and future "start from this font". Do not match in parameter space.

## Do now, do later

Do now: library gates and duplicate collapse; canonical frame with aligned low-resolution masks; grouped attributes with radius-based roundness; high-order combiner with hand weights; italic and topology gates; frozen eye set; parameter grid and reachability map; parameter-rendered retrieval test; explanation and confidence from group distances; stability rule.

Do later: intent tolerance bands; Rocchio from row clicks; session logging and a designer gold set; learned embedding; Web Worker and shards; quality signals; MMR beyond slot 4 if lists still look samey.

## Smallest build order with proof at each step

1. **Library hygiene.** Caps-only, Latin, construction and duplicate detectors; ingest all weights and italics. Proof: contact sheet for the frozen eye set loses every caps-only, pixel and dotted slot; duplicate families no longer fill two slots. Expect the acceptable-slot count to move from about 55 percent to above 70 percent with no metric change.
2. **Grouped attributes and the high-order combiner.** Eight groups, p-norm, hand weights, radius roundness, italic and topology gates. Proof: Q5 returns wide thin fonts in slots 1 to 3; Q8 returns oblique sans faces now that italics exist; Q6 returns condensed bold sans. Eye set above 80 percent acceptable.
3. **Parameter grid and reachability map.** Render the grid, measure, nearest grid point per font. Proof: a histogram of residuals by category. Sans and slab should be mostly reachable; display and script mostly not. Use it to remove generator defects like Q4 before they reach a user.
4. **Parameter-rendered retrieval test.** Proof: a median rank and top-10 figure on the 20 percent holdout that moves when the metric moves and is flat under jitter. This replaces the jitter test as the number in the report.
5. **Aligned mask overlap on the top 40.** Proof: Q7 soft rounded brings genuinely rounded fonts; eye set gains in slots 1 to 3 specifically.
6. **Explanation, confidence, stability rule.** Proof: for every row in the eye set, Dev agrees the sentence names a visible difference; moving one stepper by one notch changes at most three rows.

Each step is a day or two for a Sonnet agent with the frozen eye set as the gate. Nothing in steps 1 to 6 needs Python, a GPU, labels or a model.

## The three riskiest assumptions

1. **The generator's letters are close enough to real letters for shape comparison to mean anything.** If joins, overshoot and terminals dominate the mask overlap, step 5 will rank on artefacts. Mitigation: blur before overlap, and check the reachability map before trusting overlap for a category.
2. **Hand weights tuned by one designer on twelve queries generalise.** Dev's eye is the only label source. Mitigation: freeze the set before tuning, hold back four queries, and never tune on the held-back four.
3. **Seven letters without spacing capture what a designer "means".** A designer judges a face by its texture in a word, which spacing and rhythm carry. Mitigation: render the real word in results for display from day one, and add spacing to the generator before deciding that matching is "done".
