# Matching algorithm: final plan

Merged from `matching-algorithm.md` (Claude) and `matching-algorithm-critique.md` (Fable). Change the frozen table here, not numbers buried in code.

## The system: one frame, one loop

Every letter, from our generator or a real font, goes into the same canonical raster: fixed x-height, baseline row, left stem column. Grouped attributes, a blurred mask and topology flags all come from that frame, with the same code for fonts offline and for the query live.

1. **Gates:** Latin, construction, caps-only, italic, a and g storey.
2. **Distance:** about 8 attribute groups combined by a p=4 norm, so one big miss vetoes a match.
3. **Overlap:** aligned mask overlap on the top 40.
4. **List:** group by family, choose nearest style, stability rule, variety from slot 4.
5. **Words:** explanation and confidence read the same group distances. No second computation, so they cannot contradict the rank.

## Decisions

| Part | Decision | Whose |
|---|---|---|
| Library | All styles, including italics. Detect caps-only by n and N overlap, collapse confirmed duplicates | Fable, built on Claude's |
| Normalise | One canonical frame | Fable |
| Features | Named groups plus mask. No learned model in v1 | Fable overrules Claude |
| Intent from edits | Later, only as tolerance bands and explanation order. Untouched means "I accept this", not "don't care" | Fable overrules Claude |
| Fit to every font | Keep as a grid lookup for a reachability map and benchmark. Never match in that space | Claude's idea, Fable's method |
| Retrieval | Brute force. No ANN, worker or shards at this size | Fable overrules Claude |
| Metric | p=4 over groups, hand weights tuned on a frozen eye set of 12, 4 held back | Fable |
| Explanation | From group distances, visible differences only | Both |
| Confidence | From local nearest-neighbour rank, not raw distance | Both |
| Learning from use | Later | Both |
| Evaluation | Parameter-rendered retrieval on holdout replaces jitter. Sibling test dropped, since it rewards ignoring weight | Fable |
| Spacing | Generator has sidebearings; not compared in v1; real word shown in results | Fable's question, decided here |

## Build order, each with its proof

1. Library hygiene. Eye set loses caps-only, pixel and dot slots; no duplicate families.
2. Grouped attributes and p-norm. Wide thin, oblique sans and condensed bold sans queries return the right kinds of font.
3. Parameter grid and reachability map. Generator defects found before a user does.
4. Parameter-rendered retrieval test. A number that moves when the metric moves.
5. Aligned mask overlap on the top 40. Better slots 1 to 3.
6. Explanation, confidence, stability. One stepper notch changes at most 3 rows.

Dev's eye judges the eye set. Percent targets in the critique are Fable's estimates, not measurements.

## Riskiest assumptions

1. Generator letters are close enough to real letters for overlap to mean something.
2. One designer's hand weights generalise.
3. Seven letters without spacing capture what a designer means.
