# Failure cases

Every problem Dev has reported, turned into a rule a machine or a reviewer can check. Screenshots are in `docs/cases/`. A case is closed only when its check passes. Add new cases here, never delete them.

| # | Seen in | What went wrong | Root cause | Rule that prevents it | How to check |
|---|---|---|---|---|---|
| C1 | 2, 3 | `a`, `g`, `r` have broken joins and spiky terminals at heavy settings | Hand-built skeleton generator | Letters come only from fonts drawn by type designers | No generated outlines in the code path |
| C2 | 2, 3 | Empty box for `b` | Unfinished charset | Every Latin character the source font has is drawable | Sweep charset; any missing glyph fails |
| C3 | 1 | Five identical chevron steppers, numbers 0 to 5, no feel | One control pattern used for everything | Each control's form fits what it does; no bare numbers | Fable's design and reviewer |
| C4 | 1, 2, 3 | Regular thinness still looks heavy | Label and visual disagree | Labels are derived from measured stroke, not a preset | Measure stem at each label |
| C5 | r screenshot | `r` turns into a blob | Width, edge and stem fight | Any allowed combination stays a good letter | Sweep axes; compare with the font's own limits |
| C6 | r screenshot | Two handles side by side, leader lines crossing the letter | Handles placed by rule, no layout | Handles and callouts never overlap or cross the letter | Geometry test on every letter |
| C7 | 5 | Large dead area under the letter | Sheet sized to em box, not composed | Both views composed to fill their space with purpose | Reviewer at 1440x900 |
| C8 | 4 | Tag drifts far from its letter | Positioned by a fixed offset | Tag sits against its letter | Distance test |
| C9 | 4, 5 | Word view had no grid, so it felt unfinished | Views treated separately | Word and zoomed views share one sheet | Reviewer |
| C10 | 6, 7 | `Corner softer` does nothing on slab `m` | Handle shown without checking effect | A control appears only if it visibly changes this letter in this style | Sweep: outline must change by a visible amount at each step |
| C11 | 6 | Serifs merge across `m` into one bar | Serif width unaware of neighbours | Inside a letter and between letters, shapes never collide beyond the design | Count separate feet and gaps across sweeps |
| C12 | 7 | Handle sits on nothing meaningful | Fixed anchor per letter | Handles anchor to measured anatomy of the real outline | Handle distance to outline test |
| C13 | 8, 9, 10 | Counter of `b` crushed to a sliver, stem swallows it | Stem allowed beyond what the counter permits | Counter must stay open at every allowed setting | Minimum counter area, per letter |
| C14 | 8, 9, 10 | `Stem 240` raw number with no meaning | Internal value shown | No internal numbers on screen | Copy check |
| C15 | 8, 9, 10 | Letter overflows the view and the handles go off-screen | Scale ignored new width | Letter always fits; zoom recomputes without jumping | Bounds test over sweeps |
| C16 | evidence | Arrow right makes the stem thinner | Direction tied to handle side | Right and up always mean more | Keyboard test |
| C17 | evidence | Readout number changes as you edit | Reports display scale | Status never moves for no reason | Reviewer |
| C18 | evidence | Sliders have no range for screen readers | Missing attributes | Every control announces name, value and range | Accessibility test |
| C19 | evidence | Next.js badge covers Zoom out | Dev indicator | Turned off | Fixed |

## Classes to hunt, beyond the cases
Dead controls, dead ranges, jumps, two controls doing the same thing, controls that fight each other, effects hidden on the current letter, a change that only shows on other letters, collisions inside a letter, collisions between letters, handles off-screen, labels that lie, wrong direction.

## Added from the results view

| # | Seen in | What went wrong | Root cause | Rule that prevents it | How to check |
|---|---|---|---|---|---|
| C20 | 11, 12 | Fonts shown black on orange; thin fonts vanish and vibrate | Brand colour used as the viewing surface | Fonts are always judged on a neutral sheet. Colour never sits behind a specimen | Contrast test, reviewer |
| C21 | 11 | Reasons read as a run-on list: "Same weight and thick and thin strokes and no serifs and open shapes" | Lists joined by "and" | At most one thing that matches and one that differs, in natural words | Copy check |
| C22 | 11, 12 | Person cannot compare a result with their own letter | Results replace the work | Result and own letter visible together | Reviewer |
| C23 | 12 | Panel cuts through the letter and handles, and the editor is unusable behind it | Overlay on top of the task | Results and editing have a designed relationship | Reviewer |
| C24 | 11 | Every "unusual" result looks samey, specimen sizes vary by font | No normalised sizing or variety | Specimens set to matched visual size; list has real variety | Measure x-height on screen |

## Added from match quality

| # | Seen in | What went wrong | Root cause | Rule that prevents it | How to check |
|---|---|---|---|---|---|
| C25 | 13, 14 | Very thin, squarish rounded `b` returned Poppins Thin, a round geometric font. Dev: "not even close" | Bowl shape (square versus circular) barely counts; weight and sans dominate; the query's character was lost | The most distinctive thing about the person's letter must lead the match | Eye set query: thin squarish rounded must return squarish rounded fonts |
| C26 | 15 | Thin joins do not meet cleanly, arches are pointed | Hand-built skeleton generator | Same as C1 | Same as C1 |
| C27 | 16 | Letters spaced loosely and unevenly, word falls apart when thin; grid lines compete with thin letters | No real spacing; grid too strong behind type | Spacing comes from the font; the grid stays quieter than the thinnest letter | Reviewer on Hairline settings |

## Added from critique round 1 (score 22/40, partial: results and reveal not tested)

| # | Seen in | What went wrong | Rule that prevents it | How to check |
|---|---|---|---|---|
| C28 | critique | `Stem wider` thins on 45 of 62 glyphs; `Curve rounder` inverted on 11 of 32 | A handle's direction is tested per letter: out always gives more | Synthetic drag on every handle |
| C29 | critique | `Corner softer` says drag in, only vertical works, flips by letter, 60px runs the whole range | Any sensible drag direction works; sensible sensitivity; handle tracks the pointer | Drag test |
| C30 | critique | Double-click never taught on the resting screen | The first action is visible | Reviewer |
| C31 | critique | Rail and handles name the same thing differently, and zoomed view shows 13 controls | One name per thing; no duplicate control sets | Reviewer |
| C32 | critique | `Next thinness` gets heavier; handles exceed the top stop | Scale direction matches its name | Reviewer |
| C33 | critique | Style switch silently drops Edge and Roundness; Reset ignores style; no Ctrl+Z; each arrow press floods undo | Changes never vanish silently; undo groups a gesture | Interaction test |
| C34 | critique | Word refits to the stage, so wider letters read as a shorter word | Size never hides the change just made | Reviewer |
| C35 | critique | Word vertically floating, tag without arrow, status readout meaningless | See C7, C8, C17 | Reviewer |
| C36 | critique | Style names are jargon: Grotesk, Humanist, Slab | Plain language | Copy check |
| C37 | 17 | Fully rounded stroke ends are a real character people may want; real variable fonts may not offer it | Rounded ends stay reachable, through a rounded family if needed | Reviewer |

## Predicted by the controls spec (controls-v2 to v4)

| # | What would go wrong | Rule that prevents it | How to check |
|---|---|---|---|
| N1 | Use changes letter shapes silently through opsz | The change runs the morph; the tile says "shapes tune to size" | Reviewer |
| N2 | Word jumps when the clay font arrives after the fallback | Stage box sized from the family's metrics | Layout shift test |
| N3 | A family switch clamps Thick (1000 to 900) without a word | Stage one of the switch motion shows the move; note line; value remembered | State test |
| N4 | Undo across a family switch restores axes the family lacks | Undo steps carry the family; a switch is one step | Unit test |
| N5 | A result shows fallback glyphs as if they were the font | Charset gate per result; missing letters drawn hollow and named | Test with a word containing "ß" |
| N6 | Two handles share one anchor mid-drag | 44 px rule every frame; lower-ranked slides or hides | Geometry test in the sweep |
| N7 | Scrubbing past the end keeps the pointer captured | Capture releases at the live end with the limit message | Manual |
| N8 | A very wide result overflows its row at matched x-height | Rows wrap, never clip | Bounds test |
| N9 | Thin fonts vanish on dark paper | Minimum rendered stem per size; "very thin at this size" | Stem test |
| N10 | The clay family tops its own results | Family and superfamily exclusion | Unit test |
| N11 | A column of identical capped numbers | Band words in grey; no number under 60 | Reviewer |
| N12 | Tile tag and rarity multiply on one group | max(rarity, tag), capped | Unit test |
| N13 | A nudge finds nothing to promote in the top forty | Nudges re-query the whole library | Unit test |
| N14 | Two-tile blend averages into a shape neither family has | "Either" bands on divergent groups (flagged feature) | Eye set |
| N15 | Character tiles blank for seconds | Subset fonts, load order, skeleton squares | Load test |
| N16 | Zoomed scale changes when More handles opens | Scale from all handles that could show | Unit test |
| N17 | A one-word "paragraph" in the specimen strip | Fixed neutral sentence at small size | Reviewer |
| N18 | A glyph swaps shape mid-range (rvrn in Roboto Flex and Saira) | Sweep check 9: shaped glyph id constant across a live range; range clipped at a swap | Sweep |
| N19 | File default drawn before home (Saira Thin, Nunito ExtraLight) | Home applied before first paint | Visual test |
| N20 | Two tiles selected with no editing model | Defined; feature behind a flag until two blended eye queries pass | Flag |
| N21 | Shape this needs presence decided at runtime | Rows only, no handles | Reviewer |
| N22 | Near-home fonts hidden from a person who moved the dials | Exclude family and superfamily only; "near where you started" only while nothing moved | Unit test |
| N23 | Three dials together close a counter that no pair closes | Corner sets in the component check; clamp on the last-moved dial | Sweep |
| N24 | The word wraps mid-word on the first Wide drag | W sized for the widest Wide across all tiles; the default word never wraps | Bounds test |
| N25 | Office download loses Wide and Openings silently | Get it names the loss | Copy check |
| N26 | Try's paragraph needs glyphs the text= load never fetched | Try loads the full Latin subset first | Network test |
| N27 | Italic files never loaded | Listed, loaded on first hover of Lean | Load test |
| N28 | No marked letter when the word lacks a and g | Fallback order per tile | Unit test |
| N29 | Teaching only on hover | Tab focus does what hover does; definitions under rows | Keyboard review |
| N30 | Stale state is a colour mark only | Every cobalt state has a word | Reviewer |
| N31 | Script variants uncollapsed fill slots with one design | Build collapses by seven-letter distance plus n/N agreement, keeps aliases, shows "also as" | Alias test |
| N32 | Superfamily exclusion has no table | Rule: first word of the name, plus `superfamilies.json` for exceptions, written into the index at build | Unit test |
| N33 | Vetoed fonts outrank honest ones | Vetoed families rank after every unvetoed family and show a band word only | Unit test |
| N34 | W changes when switching tiles | W computed once per word across all tiles | Visual test |
