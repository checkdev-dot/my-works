# Matching algorithm: Claude's proposal, part by part

Goal: given a letter design shaped by a non-expert, return the list of real free fonts a designer would agree are closest, with honest reasons, in well under a second.

Known evidence (spike, 304 families, crude generator, read by agents, no designer yet):
- Single-letter self-retrieval with outline jitter: top-1 33 to 51%, top-10 57 to 75%. n+a+o: top-1 50%, top-10 83%.
- Shaped letters: roughly 55% of top-5 slots acceptable. Wide, condensed, soft and slanted weak.
- Raw distance does not track quality (0.59 good, 0.57 bad).
- Weight swamps everything: siblings median rank about 143 with weight, 14 without.
- 13 equal-weight features dilute proportion. Pixel, caps-only, icon fonts pollute.

## Current build (in progress in lib/match)
Raster each glyph, measure 13-ish plain-meaning features per letter, z-normalise, compare on 7 letters, group by family, threshold for `weak`.

## Part by part

### 1. Library intake
**Problem:** duplicates, forks (same design under two names), pixel, icon, caps-only fonts; thin coverage of weights and italics.
**Proposal:** analyse every style of every family, not only 400 and 700. Variable fonts sampled along their axes. Detect near-duplicate designs by outline hash and embedding and collapse them. Tag construction (pixel, dot, stencil, inline, shadow) rather than exclude, so that a shaped query can never hit them unless it asks.

### 2. Glyph normalisation
**Problem:** comparing at em scale makes x-height differences look like shape differences.
**Proposal:** two normalised views of each glyph: scaled to its own x-height (shape), and to em (proportion). Measure on outlines where possible, raster only for what needs it. High-resolution once, offline.

### 3. Features
**Problem:** hand features miss structure (storey count of a and g, terminal shape, stress angle, cursive joins).
**Proposal:** two layers.
- **Named attributes** (weight, width, x-height, contrast, stress angle, corner softness, terminal type, serif type, aperture, counter shape, slant, a and g construction): these give explanations and hard gates.
- **Learned embedding** of each glyph: a small convnet trained offline on font glyphs, self-supervised, with same-family different-style as a positive and parametric renders as augmentation, so the gap between generated letters and real fonts closes. Exported to run in the browser or as precomputed vectors.

### 4. Query formation: use intent
**Problem:** a neutral distance treats everything the person did not touch as equally important as what they did.
**Proposal:** the most unusual idea here. The person's edits are evidence of intent. Compare final params to the style default: attributes they moved get high weight, untouched ones low weight. Dragged "stem wider" means weight matters. The query is the whole drawn alphabet plus an intent-weight vector.

### 5. Shared space between our letters and real fonts
**Problem:** comparing generator output to real fonts crosses a domain gap, and the crude generator causes some failures.
**Proposal:** offline, fit the parametric system to every font: optimise `LetterParams` to reproduce each font. Each font then has coordinates in the same space as the editor. Matching becomes a nearest-neighbour in param space plus residual (how well the system can reach that font). Bonus: the explanation is a param delta, "Start from this font" becomes possible, and "what do I change to get closer to this font" can be answered.

### 6. Retrieval
**Proposal:** two stages. Stage one: hard gates on construction and script class, then approximate nearest neighbour across param plus embedding vectors in a Web Worker, under 20 ms, top 200. Stage two: re-rank top 200 by real shape comparison, aligned glyph overlap on the key letters, under 200 ms. Word-level check last: render the person's actual word in candidates, since their word is what they care about.

### 7. The metric
**Problem:** Euclidean over z-scores is not how designers see closeness.
**Proposal:** learn weights from a designer-judged triplet set ("is A or B closer to this?") with a small Mahalanobis or linear model. Start with weights from sibling and look-alike pseudo-labels, replace with human data.

### 8. Ranking the list
**Problem:** five near-twins is a poor list; a designer wants a closest and useful variety.
**Proposal:** group by family, choose the best style, apply maximal marginal relevance so that 01 to 03 are closest and later ranks show distinct takes. Prefer fonts with fuller weight sets and quality signals (glyph coverage, kerning present, popularity only as a tie-break).

### 9. Explanation
**Proposal:** sentences come from attribute differences, thresholded by perceptual size, ordered by intent weight. Only say a thing differs if a person could see it. No scores.

### 10. Confidence
**Proposal:** do not threshold raw distance. Calibrate: how does this query's best distance rank against nearest-neighbour distances of real fonts in that local region? Use that to decide "close twins" versus "the nearest we have".

### 11. Learning from use
**Proposal:** "More like this" and "Not this" on each row re-weight the query instantly (Rocchio). Anonymous choices, with consent, feed the triplet set.

### 12. Evaluation
**Proposal:** a gold set of about 100 shaped queries judged by real designers, holdout fonts, and precision at 5 reported per kind of query. Nothing ships on self-retrieval alone.

### 13. Speed and delivery
**Proposal:** all matching in the browser, in a Web Worker, index split so the first search loads a compact file, shards for detail. Pre-warm while the person is zoomed in, so results appear the moment the button is pressed.

## Questions for the critic
Which of these are wrong, overbuilt or missing? What is the smallest set that gets a designer saying "yes, that is the list I wanted"?
