# Letter forms: what the tool cannot say

2026-11-03. Answers Dev's cases 20 (`b`) and 21 (`a`): "there are no ways to have different a, b without a tail or this opening. There are thousands of fonts we are missing." Measured on the shipped library (`public/library/index.json`, 1,536 upright matchable families, one file nearest 400 per family, from `C:\Users\check\AppData\Local\font-engine-cache\ttf`) and on the four clay fonts in `public/fonts` through fontkit at home and at every dial end. Scripts and raw output are in the session scratchpad (`forms.mjs`, `clayforms.mjs`, `count.mjs`, `gsub.mjs`, `forms.json`, `clayforms.json`, `dist.json`, `gsub.json`); nothing was added to `scripts/`.

## 1. The finding in one paragraph

The dials are axes, and axes scale. None of the four clay fonts changes the *construction* of a letter anywhere on any dial: not the storeys of a and g, not where the bowl of b meets the stem, not the top of t, the tail of y, the bar of e, the spur of G, the leg of R, the tail of Q, the base of 1. Each tile is one designer's full set of opinions, and choosing "Rounded ends" also silently chooses Nunito's a, l, M, y and 1. The matcher sees four of these facts (a storey, g storey, serifs, stroke ends) and nothing else, so even where a person could not ask for a form, the matcher could not tell the answer apart. Counting only the four facts the matcher knows, 44% of the library (676 of 1,536 families; 35% of sans and serif) can never be the right answer to any query the tool can build. Counting five lowercase forms a person sees at once (a storey, g storey, t top, y tail, e bar), 67% of the library (57% of sans and serif) is unreachable.

## 2. Anatomy catalogue

Shares are measured on the library unless marked *est.* (type knowledge, not measured). "Sans" and "serif" are the Google category of the family; display and handwriting families were measured too but their shares are noisy and are only folded into "all". Classifiers are pixel heuristics tuned by eye on 30 known families (Roboto, Inter, Arimo, Jost, Open Sans, Montserrat, Poppins, Lato, Work Sans, Merriweather, Lora, Tinos, Playfair, Comfortaa, Quicksand, Ubuntu, Oswald, Raleway, Saira, Nunito, and the rest); on a and g the classifier agrees with the matcher's own storey votes on 99.6% and 93.7% of families. Treat each share as ±5 points. "Clay" says which of Plain (P), Squarish (S), Rounded ends (R), Feet (F) has the form at home; "Dials" says whether any dial can change it (measured at both ends of every dial).

### Lowercase

| Letter | Alternate | How common | Clay | Dials | Matcher sees it |
|---|---|---|---|---|---|
| a | two-storey | sans 81%, serif 93% | P S R F | no | yes, storey votes (soft penalty) |
| a | one-storey | sans 14%, serif 5%, all 20% (297 families by the matcher's votes) | none | no | yes |
| a | with a tail or foot at bottom right | sans 16%, serif 79% | F only | no (P grows a tail only at wght 100) | no |
| a | without a tail | sans 84%, serif 21% | P S R | no | no |
| a | two-storey with a straight stem to the top (grotesque) vs a hooked top | full stem: sans 15%, serif 38% | all hooked | no | no |
| a | open vs closed aperture (the gap under the hook) | *est.* roughly half and half | fixed per tile | Openings widens the counter, not the aperture | partly (openFrac, continuous) |
| b d p q | bowl meets the stem high with a notch (Dev's "opening") vs smooth join at the baseline | high join (over 12% of x-height): sans 50%, serif 28%; notch 4 to 12%: sans 24%; smooth: sans 26%, serif 41% | all four high join: P 0.135, S 0.137, R 0.184, F 0.186 (library median 0.100, p75 0.170) | Thick, Wide, Openings move P's join by one class at most, never to smooth | no |
| b d p q | spur or serif at the stem end | *est.* serif nearly always, sans rarely | F | no | no |
| c | terminal cut vertical, angled or horizontal; ball terminal | *est.* vertical cut a third of sans; ball in a third of serifs | fixed per tile | no | no |
| e | horizontal bar | sans 77%, serif 60% | P S R F | no | no |
| e | angled bar (Josefin, Capriola, Convergence) | sans 7%, serif 24% | none | P reads "angled" only at XTRA 323 or YOPQ 25, which is the counter collapsing, not a real tilt | no |
| e | small eye vs large eye; terminal cut | *est.* continuous | fixed | Openings on P only | partly (counter, openFrac) |
| f | wide hook vs narrow; crossbar length; descending f (italic) | *est.* narrow f in a fifth of sans | fixed | no | no, f not in the query |
| g | one-storey | sans 74%, serif 24%, all 58% | P S R | no | yes, storey votes |
| g | two-storey (closed or open loop); ear flat, ball or none | sans 26%, serif 76% (251 sans and 151 serif families sit on the wrong side of the tiles) | F only | no | yes (loop open or closed: no) |
| h m n | arch leaves the stem high or low; splayed m | *est.* continuous | fixed | no | partly (terminal class on n) |
| i j | round dot | sans 67%, serif 91% | P R F | no | no |
| i j | square dot | sans 31%, serif 4% | S only | no | no |
| i j | diamond, slash or joined dot | all 12% | none | no | no |
| j | hooked tail vs straight cut | hook sans 88%, straight 12% | all hook | no | no |
| k | arms meet the stem at one point | sans 96%, serif 13% | P S R | no | no |
| k | leg starts from the arm (humanist, serif) | sans 4%, serif 87% | F | no | no |
| l | plain | sans 70%, serif 7% | P S | no | no |
| l | with a tail | sans 27%, serif 5% | R only (Nunito) | no | no |
| l | serif foot; top flag | foot sans 2%, serif 88%; flag sans 4%, serif 42% | F | no | yes for serifs (n, H) |
| o | round, squarish, oval | continuous | fixed per tile | Wide stretches it | yes (bowlFill, flatShare) |
| r | plain arm | sans 96%, serif 58% | all | no | no |
| r | ball terminal | sans 4%, serif 42% | none, not even F | no | no |
| s | terminal cut; spine angle | *est.* continuous | fixed | no | no |
| t | flat top | sans 87%, serif 52% | P S R | no | no |
| t | slanted or cut top | sans 10%, serif 48% | F | F reads flat at wght 100 and 900 (classifier noise at extremes, not a real change) | no |
| t | straight bottom vs hooked right | hook sans 24%, serif 57% | F hook, others straight | no | no |
| t | short t (below ascender) vs tall | *est.* short in most text faces, tall in geometric | fixed | Tall letters moves P's ascenders only | no |
| u | with a stem (like n upside down) | sans 99%, serif 91% | all | no | no |
| u | symmetric, no stem (Quicksand) | sans 1%, serif 9%, all 25% (scripts) | none | no | no |
| v w x | pointed vs flat apex; crossed w | *est.* flat apex in a tenth of sans | fixed | no | no |
| y | straight diagonal tail | sans 57%, serif 52% | R only | no | no |
| y | curved or hooked tail | sans 39%, serif 45% | P S F | no | no |
| z | plain vs descending or swash z | *est.* rare | fixed | no | no |
| any | stroke ends flat, round, wedge or flared | flat 613, round 283, wedge 143, unknown 497 of 1,536 families | P S flat, R round, F serifed | no | yes, class veto (n, H) |
| any | serifs: bracketed, slab, wedge, hairline | one serif shape (bracketed, moderate contrast) | F | Thick only | partly (serifLen, serifThick) |

### Capitals and numerals

| Letter | Alternate | How common | Clay | Dials | Matcher sees it |
|---|---|---|---|---|---|
| G | with a straight jaw (stem) | sans 99%, serif 97% | all | no | no |
| G | no stem, open curve | sans 1%, serif 4% | none | no | no |
| G | with a spur under the jaw | sans 22%, serif 3% | none (Saira ships it as ss01, unused) | no | no |
| J | sits on the baseline | sans 78%, serif 39% | all | no | no |
| J | descends below the baseline | sans 22%, serif 62% | none | no | no |
| J | top bar | sans 15%, serif 91% | F | no | no |
| K | arms meet at one point | sans 97%, serif 13% | P S R | no | no |
| K | leg from the arm | sans 3%, serif 87% | F | no | no |
| M | vertical sides | sans 90%, serif 86% | all | P reads splayed at slnt -10 only (shear) | no |
| M | splayed sides | sans 10%, serif 15% | none | no | no |
| M | middle vertex to the baseline | sans 68%, serif 90% | P S F | no | no |
| M | middle vertex stops high | sans 33%, serif 10% | R only | no | no |
| Q | tail down to the right | sans 63%, serif 52% | all | no | no |
| Q | horizontal swash tail | sans 14%, serif 43% | none | no | no |
| Q | tail inside or short, no descender | sans 14%, serif 2% | none | no | no |
| Q | centred tail; tail on the right side | sans 6%, 3% | none | no | no |
| R | straight leg | sans 86%, serif 70% | all | no | no |
| R | curved leg | sans 9%, serif 24% | none (Saira ss01, unused) | no | no |
| R | leg with a flat foot out vs tucked in | out sans 90% | all out | no | no |
| W | middle apex at cap height | sans 87%, serif 92% | all | no | no |
| W | low or crossed middle | sans 13%, serif 9% | none | no | no |
| 1 | with a flag | sans 95%, serif 88% | all | no | no |
| 1 | plain stroke, no flag | sans 5%, serif 12% | none | no | no |
| 1 | with a base | sans 32%, serif 93% | R F | no | no |
| 1 | no base | sans 68%, serif 7% | P S | no | no |
| 2 | flat base vs curled; neck shape | *est.* flat in most | fixed | no | no |
| 4 | closed top | sans 72%, serif 83% | P R F | no | no |
| 4 | open top | sans 28%, serif 17% | S only (Saira ss01 also swaps it) | no | no |
| 7 | plain | sans 100%, serif 100% at default | all | no | no |
| 7 | crossed | 1.8% of all defaults, otherwise only through a feature | none | no | no |

The lowercase set the matcher actually reads is a e g n o H O. b, t, y, l, i, u, r, k, G, J, K, M, Q, R, W and every numeral are never measured, on the query or in the library, so the rows marked "no" are blind on both sides.

## 3. What is reachable now

### 3.1 The dials never change a form

`clayforms.mjs` classified every form above on each clay font at home and at the less and more end of every dial it has (Plain: nine dials, Squarish two, Rounded one, Feet two), shaped through fontkit with `liga rvrn locl` so glyph swaps would show. Result: no tile swaps a glyph on any single axis (Saira's `rvrn` swaps only Q from wght 300 up). The flips the classifier reported at dial ends are all at wght 100 or 900 to 1000 (strokes so thin or so heavy that the pixel rule tips), plus two genuine but small movements on Plain: the b join drops one class (high join to notch) at wght 1000, wdth 40 or XTRA 323, and never reaches smooth; and the e bar reads tilted at XTRA 323 or YOPQ 25 because the counter is collapsing. So for a person, every structural cell in the tables above is fixed by the tile they picked.

### 3.2 How much of the library is out of reach

Method: for each family, compare its measured forms with the home forms of the four tiles; a family is reachable if at least one tile matches it on every key in the set. The matcher-visible set uses the matcher's own facts decoded from `analysis.json` the same way `lib/match/facts.ts` does (majority of three storey votes for a and g, serif at `serifLen` 0.4 and 0.15, terminal class majority on n and H; unknowns count as compatible).

| Key set | Unreachable, all 1,536 | Unreachable, sans and serif (790) | Reading |
|---|---|---|---|
| Matcher-visible: a storey, g storey, serifs, stroke-end class | 676 (44%) | 279 (35%) | These families sit on the wrong side of a gate or veto for *every* query the tool can make. Causes: 297 families with a one-storey a (no tile has one); 251 sans with a two-storey g (only Feet has it, and Feet brings serifs); 151 serifs with a one-storey g; 143 families with wedge or flared ends (no tile). |
| Five visible lowercase forms: a storey, g storey, t top, y tail, e bar | 1,031 (67%) | 452 (57%) | What a person sees in "Hamburg" at a glance. |
| Lowercase core, eight keys (adds a tail, b join, l bottom) | 1,468 (96%) | 733 (93%) | Upper bound; the b join alone (three classes, all tiles high) disqualifies most. |
| Capitals and numerals, eight keys (G spur, R leg, Q tail, J, M vertex, K join, 1 base, 4 top) | | 676 (86%) | |
| All 21 measured keys | 1,525 (99%); only 11 families match a tile on everything | | Inflated by classifier noise; quoted only to show the shape of the problem. Median family differs from its nearest tile on 5 keys. |

Keys most often different from the nearest tile (families, all 1,536): b join 869, y tail 754, Q tail 734, J 643, l bottom 511, a storey 439, e bar 407, g storey 384, i dot 383, u stem 383, 4 top 377, t top 358.

Dev's two cases in numbers: Roboto Flex's b joins at 0.135 of x-height; 62% of the library joins lower and 26% of sans join smoothly at the baseline, and no dial gets there. Roboto Flex's a has no tail at home (foot 0.21 stem widths, under the tail threshold); a tail appears only at wght 100. 16% of sans and 79% of serifs have a tail; 21% of serifs do not, and Feet always does.

The honest number to quote: **about two in three library families cannot be asked for, and the matcher itself can rule out 44% before a dial moves.** Everything below the first row depends on measurements the matcher does not take yet.

### 3.3 Stylistic alternates that already exist

Full files in `public/fonts` (fontkit, `availableFeatures`):

| Tile | Alternates shipped and unused |
|---|---|
| Plain, Roboto Flex | none (liga locl pnum rvrn only) |
| Squarish, Saira | ss01 = salt: A G R 4 6 9. Checked by render: R gets a vertical, curved leg; the 4 CLOSES at the top (Saira's own 4 is open, so the earlier "open 4" was reversed); the G changes too subtly to call a spur. titl: Q T W q t w |
| Rounded ends, Nunito | ss01 = salt: one-storey a, a 1 without a base; ss02: an l WITHOUT the tail (Nunito's own l has the tail, so the earlier "l with tail" was reversed) |
| Feet, Roboto Serif | ss01: E F; ss02: one-storey g; ss04: f; ss06: one-storey a |

So three of the four tiles could already offer a one-storey a or g, a curved R, a closed 4 (Saira), a plain l and a baseless 1 (Nunito) through `font-feature-settings`, with no new fonts. These sets are bundles (Nunito ss01 moves a and 1; Saira ss01 moves A G R 4 6 9), so the UI applies a feature only to the one letter a form is about, never to a whole word. Diffed per glyph over A-Z a-z 0-9 in `public/fonts`; Roboto Flex has no sets at all.

Library files (`gsub.mjs` over the Fontsource TTFs): only 27 of 1,328 families with a GSUB table carry any ss, salt or cv feature, 22 of them touching a basic letter: Iosevka (four families, cv01 to cv86, ss01 to ss20), Geist (ss01 a, ss02 a, ss03 l, ss04 R, ss06 G), Pretendard (cv11 a, cv10 G, cv05 l, cv02 4), Google Sans Flex (ss01 a, ss02 g), Nebula Sans (a g l), Uncut Sans (R Y Q a 1 4), Commit Mono, Maple Mono, Pitagon Sans, FiraGO (a g 4), League Mono, iA Writer Duo, DejaVu, OpenDyslexic. Letters touched, by families: a 18, g 15, l 13, 1 10, i 10, j 9, Q 9, r 8, f 8, y 8, G 8, R 7, J 7, t 7. **This is a floor, not the truth**: Fontsource's subsetting drops stylistic sets. Inter's library file has none, while Inter's own file has cv01 to cv13 and ss01 to ss08 (cv11 one-storey a, cv05 l with tail, cv10 G with spur, cv06 simplified u, cv13 compact t, cv02 open 4, cv01 alternate 1, cv08 serifed I; from rsms.me/inter). Recursive's library file shows only `rvrn l 0`; its full file has ss01 to ss20 (one-storey a, simplified g, f, i, l, r, 6 and 9, dotted 0) plus MONO and CASL axes (from the arrowtype/recursive README). Any plan that relies on library alternates must use the google/fonts files, not Fontsource.

## 4. The fix

### 4.1 Decision

Add **forms** as a second kind of control, separate from dials: a form is a structural choice drawn as a picture, never a word, offered only on the letter that is open, only where real fonts actually differ, at most four pictures per letter. Feed every form to the matcher as a fact, hard where the measurement is binary and robust, soft where it is a degree. Measure the same forms in the library at build. Keep four tiles.

Concretely, when a letter is open, under the dials a row titled with the letter itself ("this a") shows the letter drawn two to four ways: a: one-storey, two-storey, two-storey with a tail. b d p q: smooth join, notched join. e: level bar, tilted bar. g: one loop, two loops. t: flat top, cut top. y: straight tail, hooked tail. l: plain, tail. i j: round dot, square dot. G: with spur, without. R: straight leg, curved leg. Q: tail down, swash, short. J: on the line, below it. 1: base, no base. 4: closed, open. Letters with no row (h m n o s v w x z) show nothing. The current form is marked; the pictures are the real letter at the person's current Thick and Wide. Choosing one:

1. If the tile ships the form (Nunito a l, Roboto Serif a g f, Saira G R 4), the clay letter swaps through `font-feature-settings` and the word changes on zoom out, as any edit does.
2. Otherwise the clay letter keeps its shape and a hairline ghost of the chosen form sits over it, with one line: "We will look for fonts whose b joins low." The chip is still a picture; the ghost is the only new thing on the sheet. This is honest: the tool promises only what real axes can do, and a form the tile cannot draw is a search fact, not a drawn letter.

Matcher: a chosen form is a declared fact passed in `FindOptions` (as `storey` is today, extended to a `forms` map). Hard facts gate like the terminal class: a one-storey a, g loops, t top, y tail, l tail, G spur, R leg, J descent, 1 base, 4 top are binary, agreed with the matcher's own votes at 94 to 99.6% on a and g, and families on the other side rank after every unvetoed family with a band word. Soft facts carry a penalty multiplier like `STOREY_PENALTY` (0.1 one vote against, 0.5 majority): the b join class (three classes, a continuous depth behind them), the e bar tilt, the i dot (round versus square, with "other" never penalised), the Q tail kind, M vertex. Unknown is never penalised, as now. A form the person did not touch is **not** a fact: the matcher must stop reading the tile's accidental forms as if they were chosen. That is the other half of this fix: today the tile's a and g storeys are measured on the query and used as a penalty against 44% of the library even though the person never chose them. With forms, only a chosen form gates; an untouched letter is "either".

"Point at the number" and the why line then get the words they lack: "its a is one-storey", "its b joins low", from the same facts.

### 4.2 Ranked by value against cost

| Rank | Mechanism | Value | Cost | Verdict |
|---|---|---|---|---|
| 1 | **Measure forms in the library and treat an untouched form as "either"** (`measure.ts` gains a b t y l i G R Q J 1 4; `facts.ts` gains the classes above; index rebuild; 12 more letters cost about 30 ms each in the worker, so measure forms at build only and keep the 7-letter distance query) | Unlocks everything else; alone it stops the tile's accidental storeys gating 44% of the library | 2 to 3 days; the classifiers in `forms.mjs` are a working first draft with thresholds tuned on 30 families | Do first |
| 2 | **Form pictures on the open letter, declared as facts** (section 4.1) | Directly answers cases 20 and 21; no words, no type training; hidden until a letter is open | 3 to 4 days: chip row, ghost, `forms` option, why-line words | Do second |
| 3 | **Turn on the alternates the tiles already ship** (Nunito ss01 ss02, Roboto Serif ss02 ss06 ss04, Saira ss01) | Gives real drawn swaps for a, g, l, f, G, R, 4 on three tiles at zero font cost | 1 day, inside rank 2 | Part of 2 |
| 4 | **Swap Plain to a family with alternates and a rounding axis** (candidate: Google Sans Flex, in the library with ss01 one-storey a and ss02 one-storey g; its axes include ROND, which would make "rounded ends" a dial on Plain and is the direct fix for C37; verify axes and licence from the google/fonts file before deciding) | A one-storey a and g on the main tile, plus round ends without switching tile | 2 days plus a re-sweep; loses Roboto Flex's parametric dials unless the new family has them | Decide after 1 and 2 ship |
| 5 | **Pick a letter from a strip of real examples** (the six most different real a's at your weight, from the library) | The best source of chip pictures; as a standalone control it adds choice without facts | Falls out of rank 1 (the library knows the forms) | Use as the picture source for 2, not as its own control |
| 6 | **More clay families** (Recursive for MONO and CASL, Inter for cv sets) | Each adds one more bundle of opinions; the bundling is the problem | High: sweep, home, clamps, tiles per family | Not the route; add Recursive only if monospace and casual become tiles later |

## 5. Problems found

Each line: what goes wrong, then the one-line fix. Numbers are from sections 2 and 3.

**Forms that cannot be asked for**

L1. A one-storey a is unreachable: no tile has one, 297 families do, and every query penalises them by up to 1.5x. Fix: form picture on a, hard fact; untouched a is "either".
    Status (v3): Handled (library side). `forms.a` is a hard fact; 295 families measured one-storey. An undeclared a no longer gates.
    Status (UI, 2026-11-03): Handled. Open an a: a row of pictures for storeys. Nunito (ss01) and Roboto Serif (ss06) draw the one-storey a, so the letter and the word swap; Roboto Flex and Saira show a hairline cobalt ghost (Outfit) and one line, and the choice goes to the matcher as `forms.a`. Either is the default and passes nothing.
L2. A sans with a two-storey g (251 families: Abel, Acme, Alegreya Sans, Anaheim, Lato, Open Sans, Work Sans, IBM Plex Sans) is reachable only through Feet, which brings serifs. Fix: form picture on g, independent of the tile.
    Status (v3): Handled. `forms.g` hard; 665 families measured two-storey.
    Status (UI, 2026-11-03): Handled. The g row shows the two-loop g (Open Sans) as a ghost on every tile but Roboto Serif, whose own g is two-storey; `forms.g` is sent only when chosen.
L3. A serif with a one-storey g (151 families) is unreachable. Fix: same as L2; Roboto Serif already ships ss02.
    Status (v3): Handled. Same key; the clay-side swap (Roboto Serif ss02) is a UI job.
    Status (UI, 2026-11-03): Handled. Roboto Serif ss02 now draws the one-storey g (verified: it differs from the default for g only); the g row swaps the letter and the word to it. The other three tiles already draw a one-storey g.
L4. Dev's b: all four tiles join the bowl high (0.135 to 0.186 of x-height, 62nd to 77th percentile); a smooth join at the baseline (26% of sans: Abel, Acme, Actor, Advent Pro, Jost, Lato, Poppins) cannot be asked for. Fix: b join as a soft fact with two pictures; measure it on b, not inferred from a.
    Status (v3): Handled. `forms.bJoin` soft (smooth, notch, high): 640, 340, 705 families.
    Status (UI, 2026-11-03): Handled. The b row shows smooth (Abel), notch (Lato) and high (Inter) joins. No tile ships a b alternate, so every choice is a ghost plus "We will look for fonts whose b joins the stem low and smooth"; results that miss it say so through `formMisses`.
L5. Dev's a: the a's foot or tail is fixed per tile (only Feet has a tail; 21% of serifs have none, 16% of sans do). Fix: a-tail picture, hard fact.
    Status (v3): Handled. `forms.aTail` hard: 537 with a tail.
    Status (UI, 2026-11-03): Handled. The second a row (no tail, tail at the foot). Roboto Serif is the only tile with a tail at home; the tail picture is a ghost (Work Sans) on the others and "no tail" is a ghost on Roboto Serif.
L6. A cut or slanted t top (10% of sans: Arimo, Alegreya Sans, Armata; 48% of serifs) exists only on Feet. Fix: t form picture.
    Status (v3): Handled. `forms.tTop` hard: 282 cut tops.
    Status (UI, 2026-11-03): Handled. The t row (flat, cut top). No tile ships a cut top, so it is a ghost (Open Sans) and a search fact on every tile.
L7. A straight y tail exists only on Nunito; a hooked y never on Rounded ends. Fix: y form picture, hard fact.
    Status (v3): Not measured: the y tail classifier agrees with itself across weights on 79% of families. Listed in FORMS_NOT_MEASURED.
L8. A tilted e bar (Josefin Sans, Capriola, Convergence; 7% of sans, 24% of serifs) is unreachable. Fix: e bar picture, soft fact.
    Status (v3): Not measured: the e bar classifier agrees across weights on 60%. Listed in FORMS_NOT_MEASURED.
L9. An l with a tail (27% of sans) exists only through Nunito, so it always comes with round ends. Fix: l form picture; Nunito ss02 covers it on Rounded, a fact elsewhere.
    Status (v3): Handled. `forms.lTail` hard: 348 with a tail.
    Status (UI, 2026-11-03): Handled, with a correction. Nunito draws the l WITH a tail at home and ss02 removes it (the note above had it reversed). The l row swaps on Nunito through ss02; on the other tiles the tail picture is a ghost (Ubuntu).
L10. Square dots on i and j (31% of sans) exist only on Saira, so square dots always come with squarish bowls. Fix: dot form picture, soft fact.
    Status (v3): Handled. `forms.dot` soft; other and joined dots are never penalised.
    Status (UI, 2026-11-03): Handled. The i row (round, square dot). Saira draws square at home; the others show the square picture (Rubik) as a ghost.
L11. A G with a spur (22% of sans: ABeeZee, Aldrich, Almarai) is unreachable; Saira ships it as ss01 and nobody can reach it. Fix: G form picture; turn on Saira ss01.
    Status (v3): Handled (library side). `forms.G` hard: 298 with a spur.
    Status (UI, 2026-11-03): Handled as a search fact only. Saira ss01 changes the G, but by too little to call it a spur, so no tile claims to draw the spur: the G row shows the spur picture (Work Sans) as a ghost on all four.
L12. A curved-leg R (9% of sans, 24% of serifs) is unreachable; Saira ships it. Fix: as L11.
    Status (v3): Handled. `forms.R` hard: 323 curved.
    Status (UI, 2026-11-03): Handled. Saira ss01 gives the R a vertical, curved leg (verified by render), so the R row swaps on Squarish; the other tiles show a ghost (Chakra Petch).
L13. Q tails: 37% of sans have a swash, short or centred tail; all tiles have the same tail. Fix: Q form picture, soft fact.
    Status (v3): Handled. `forms.Q` soft: down, swash, short.
    Status (UI, 2026-11-03): Handled. The Q row (down, swash, short) as ghosts from Inter, Quicksand and Raleway; Saira titl changes Q but is a title-case set and is not used.
L14. A J below the baseline (22% of sans, 62% of serifs) is unreachable. Fix: J form picture, hard fact.
    Status (v3): Handled. `forms.J` hard: 684 below the line.
    Status (UI, 2026-11-03): Handled. The J row (on the line, below it) as ghosts (Inter, Open Sans); no tile ships a descending J.
L15. A 1 without a base is impossible on Rounded ends and Feet, and with a base impossible on Plain and Squarish (68% versus 32% of sans). Fix: 1 form picture.
    Status (v3): Handled. `forms.one` hard: 763 with a base.
    Status (UI, 2026-11-03): Handled. The 1 row. Nunito ss01 draws a 1 without a base, so it swaps on Rounded ends; the based 1 is a ghost (Source Sans 3) on Roboto Flex and Saira.
L16. An open 4 (28% of sans) exists only on Saira. Fix: 4 form picture.
    Status (v3): Handled. `forms.four` hard: 568 open.
    Status (UI, 2026-11-03): Handled, with a correction. Saira draws the OPEN 4 at home and ss01 CLOSES it (the note above had it reversed). The 4 row swaps on Squarish for the closed 4; the open 4 is a ghost (Montserrat) on the other three tiles.
L17. A ball-terminal r (42% of serifs) is unreachable even on Feet. Fix: r form picture on Feet; measure r.
L18. A symmetric u without a stem (Quicksand, Comfortaa and most scripts) is unreachable. Fix: u form picture, soft fact.
L19. A splayed M (10% of sans) and a low or crossed W (13%) are unreachable. Fix: capital form pictures, soft facts.
L20. K and k with the leg from the arm (87% of serifs) come only with Roboto Serif's whole design. Fix: k form picture on Feet.
L21. Round ends come only as Nunito, so "rounded ends" silently also means Nunito's hooked a, l tail, high M, straight y and based 1 (seven forms the person never chose). Fix: forms as facts separate from tiles; a rounding axis on Plain (rank 4).
    Status (v3): Partly. Forms are facts separate from tiles; ends are a declared fact (`FindOptions.ends`). A rounding axis on Plain is still open.
L22. Wedge or flared stroke ends (143 families) have no tile and are vetoed by every query that has a known end class. Fix: an "ends" form picture (flat, round, wedge) on n, hard fact; untouched is "either".
    Status (v3): Partly. `ends` can be declared round, flat or wedge and is decisive; the UI picture is open.
L23. Rounded-corner squarish designs (Chakra Petch, Orbitron, Aldrich) sit between Squarish and Rounded ends and neither tile reaches them (C25 is this). Fix: corner form picture on o or n, or a ROND axis on Plain.
L24. Slab serifs (unbracketed, even strokes) are unreachable: Feet is bracketed and has no contrast dial, and the spec cut Soft feet. Fix: serif-shape pictures on n (bracketed, slab, wedge, hairline), hard fact.
L25. High-contrast serifs (Didone, Playfair) are unreachable: Feet's GRAD is held and it has no Thick-thin dial, so no serif query can reach them. Fix: give Feet a Thick-thin dial (GRAD or a contrast-bearing family) or a contrast fact.
L26. Monospace (60 families) has no tile and spacing is not measured, so a mono design can only be found by accident. Fix: a "same width" fact from the typed word (advance widths), later a MONO axis tile (Recursive).
    Status (v3): Handled. Mono is detected from advance widths and gates a query that carries advances.
L27. Handwriting and script (332 families, 22% of the library) have no tile at all: connected strokes, loops and cursive construction cannot be shaped. Fix: say so on the page, and give Lean a "cursive" form picture (upright, slanted, joined) as a hard fact.
    Status (v3): Partly. Script (connected) is detected and gates or demotes; a "cursive" Lean picture is UI.
L28. Display and decorative (354 families, 23%): inline, outline, stencil, shadowed and reverse-contrast designs cannot be asked for, and the pixel measures misread them (stem from run lengths, counters from holes). Fix: a build-time "construction" class (solid, outline, inline, stencil) like the pixel flag; a fact, never a dial.
    Status (v3): Partly. Effect fonts are tagged and off by default; a solid, outline, inline class by outline shape is not built.
L29. True italics are unreachable: Lean is an oblique of upright forms, while most library italics are true italics with a one-storey a and a descending f, so a leaning query gets the italic gate and then a storey penalty against the very fonts it should find. Fix: on Lean past the gate, treat a storey as "either" and offer the italic a as a form picture.
L30. Lean exists only on Plain; Saira, Nunito and Roboto Serif italics are listed in the spec but not loaded, so a leaning squarish, rounded or serif letter cannot be made. Fix: load the italic files on Lean for those tiles (spec N27) or hide Lean with the one-line "lives on Plain" note the spec promises.
L31. Small caps, unicase and caps-only designs cannot be asked for, and caps-only families (Anton SC and kin) are kept apart in the index but never surfaced for an all-caps word. Fix: a "capitals only" fact from the typed word being all caps.
    Status (v3): Handled. Caps-only families are back and matched on H, O and capitals.
L32. Aperture (open or closed c, e, a, s) cannot be set: Openings moves XTRA, the counter width, and only on Plain. Fix: rename the dial "Counters" and add aperture as a form picture on e (open, closed), soft fact.

**Controls that lie**

L33. Thick-thin runs from "even" to "varied" but YOPQ 25 to 135 actually runs high contrast (crossbar 23 px) through even (near YOPQ 95) to reverse contrast (crossbar 117 px against a 91 px stem), so "even" is the most contrasted end and "more varied" ends in reverse contrast. Fix: ends "thin flats" to "thick flats", home marked "even", measured per the spec's own numbers.
L34. Tall letters (YTAS) changes nothing in the match: b d f h k l are not query letters. Fix: say "does not change the search" under the row, or add l to the query.
    Status (v3): Partly. Ascender height (b d h k l) is measured and scored when the query has such a letter; the UI must send l.
L35. Tails (YTDE) reaches the match only as the g's `desc` at weight 0.5 inside the width group; the dial reads as a strong control and is nearly invisible to results. Fix: as L34, or add y and p to the query.
    Status (v3): Partly. Descender (p q y j, and g) sits in a proportion group; the UI must send p.
L36. Capitals (YTUC) and Middle height exist only on Plain, yet the x-height ratio group (n over H) is scored on every query, so a Saira, Nunito or Roboto Serif query carries a fixed x-height it cannot change. Fix: on tiles without the dial, scale that group to zero.
L37. The query is always a e g n o H O drawn from the clay, not the letters the person typed or opened: shaping a b or t changes the search only through axes shared with a and n. Fix: say which letters are searched (mark them in the word), and add the opened letter's forms as facts.
L38. "Hamburg" shows no e, o or O, three of the seven letters the matcher scores, and shows b, m, u, r, which it ignores. Fix: a default word that contains the query letters ("Hamburgeons" or similar), or mark scored letters.
L39. The clay's storey is known (`lib/clay`) but `findClosest` is called without `storey`, so the query's storey is re-measured from pixels and flips on 12% of jittered queries. Fix: pass the declared build (and later declared forms) from the clay.
    Status (v3): Handled. Nothing is measured as a fact any more: only declared `storey` or `forms.a`, `forms.g` gate.
L40. Lean has a cliff: past about 45% of the row the italic gate flips the whole result set from upright to italic families and nothing says so. Fix: show "now looking at italics" on the row at the gate value, or make the gate a soft penalty near the threshold.
L41. Saira's Q swaps glyph (rvrn) from wght 300 up, mid-dial, silently; the spec's check 9 (clip the range at a swap) is not built. Fix: clip or announce, per N18.
L42. The percentage hides structure: a two-storey-g family against a one-storey query is penalised 1.5x yet can still read "close 78", and the why line says "slightly wider" rather than "its g has two loops". Fix: build mismatches veto (band word, no number) and lead the why line.
    Status (v3): Handled. A declared hard form the font contradicts ranks the font after all others and the reason names it ("its a has two storeys").
L43. Stroke-end class is unknown on 497 of 1,536 families (32%) and unknown is never penalised, so a Rounded-ends query favours fonts whose ends it could not read (the C25 slot-3 case). Fix: measure ends on more letters (l, i, u) before calling a family unknown; show "ends not read" on the row.
    Status (v3): Handled. End class read on seven more stems fills in where n and H were unreadable; an unknown class is penalised for a round query.
L44. The terminal and serif vetoes are decided by the tile before any dial moves: picking Squarish vetoes every round-ended family, picking Rounded ends vetoes every flat one. Fix: an untouched form is "either"; only a chosen ends-form vetoes.
    Status (v3): Handled. Only a declared ends form or a measured round query decides on ends.
L45. At wght 100 the pixel measures lose counters and classes (thin strokes drop below the run-length floors), so hairline queries match broadly and badly (the Poppins Thin case). Fix: measure the query at a weight-normalised stroke (rasterise at a fixed stem width) or declare forms from the clay instead of measuring them.
L46. At wght 1000 on Plain the b join reads one class lower and the e bar reads tilted, so a fact measured from a heavy clay would be wrong. Fix: facts come from the chosen form or the home instance, never from pixels of the extreme.
L47. PRODUCT.md says the engine measures "spacing"; it does not: glyphs are measured alone in a canonical frame and sidebearings are discarded (`originX` unused). Fix: measure advance and sidebearings on n o H, or drop the claim.
L48. Spec v4 promises nudge chips (One-storey a, Two-storey g, Rounder, Squarer, Rounded ends), the only structural choice in the plan, and none is built. Fix: replace them with the form pictures of section 4; chips re-query with the fact.
    Status (UI, 2026-11-03): Handled. The nudge chips are replaced by the picture row on the open letter; choosing one marks the results stale and is part of undo, Reset all and Reset these. There is no URL state in the app, so nothing is written there.
L49. "Yours: Roboto Flex at your settings. Free, already a font." sits above results that exclude Roboto Flex and its superfamily, so a person who wants the nearest cousin of their own tile (Nunito Sans for Nunito) cannot see it. Fix: show the superfamily as one grey row "near where you started", per N22, instead of hiding it.
L50. Result rows are drawn from Fontsource files that strip stylistic sets, while "Get it" sends to Google Fonts whose file has them, so a row can never show a family's alternate a or g and the index measures only defaults (Geist, Pretendard, Google Sans Flex, Nebula Sans, Uncut Sans, FiraGO ship a one-storey a and are indexed as two-storey only). Fix: measure alternates at build from the google/fonts files and index a family once per form it ships; draw rows through the Google Fonts CSS API.
L51. A library family's forms are measured at one weight (nearest 400); several families change construction across weights (Saira's Q, Work Sans and Roboto Flex through rvrn). Fix: measure forms per file, not per family, and gate per file.
L52. Width is a dial on three tiles but Nunito has none, so a condensed or wide rounded letter is impossible, while the width group vetoes at 1.5 SD. Fix: on Rounded ends, scale the width group down and say "width lives on Plain, Squarish and Feet".
L53. Feet has no Openings, Middle height, Tall letters, Tails or Thick-thin, so a serif query is three numbers (Thick, Wide, and Lean once italics load) against 287 serif families that differ mostly in contrast, serif shape and x-height. Fix: pick or add a serif family with opsz-driven contrast, or add form facts for serifs (L24, L25).
L54. "Rounded ends" is named as if it were an end shape but is a whole family (Nunito); the stroke-end class it declares (round) vetoes 613 flat-ended families at once. Fix: rename the tile "Soft" and make ends a form picture (L22).
L55. Three tiles share one storey of a and g, so the tile row offers four designs but only two structural worlds (sans one-storey g, serif two-storey g); the pictures suggest more choice than exists. Fix: forms as facts; tile pictures show the marked letter plus its storey state.
L56. The why line's vocabulary ("bowl shape", "stroke ends", "pen-written feel") never names a letter form, so the one difference that made a result wrong for Dev (the b's join, the a's tail) can never be said. Fix: facts first in the why line: "its a has a tail", "its b joins low".
    Status (v3): Handled. `why.differs` leads with the form the font has when a form was declared.
L57. The classifier survey found no 7 crossed, no plain-stroke 1, no swash Q and no no-stem G in the tiles, while the Saira and Nunito files ship swaps for exactly these; the sweep (controls-v4 section 9) does not record shipped GSUB features at all. Fix: the sweep writes each tile's stylistic sets and the letters they touch into `lib/clay/<family>.json`.

## 6. Method notes

- Form classifiers (`forms.mjs`): opentype.js outlines rasterised at 200 px per em with @napi-rs/canvas; rules on runs, holes, column tops and bottoms, outside-connected gaps (b join), slope change of the left edge (y tail), line-fit residual of the right edge (R leg), component solidity (i dot). Thresholds tuned by eye on the 30 families named above; every rule has a numeric companion in `forms.json` (`b_join`, `y_bend`, `R_leg_res`, `i_dot_sol`, `a_tail_px`) for retuning.
- Clay forms (`clayforms.mjs`): fontkit `getVariation` and `layout` with `liga rvrn locl`, at home and at both ends of every dial in `lib/clay.ts`.
- Matcher facts: `analysis.json` measures decoded with the rules of `facts.ts` (majority storey votes, serif thresholds 0.4 and 0.15, terminal class majority on n and H).
- Counting: a family is reachable on a key set if one tile matches it on every key, with "unsure", "short" and missing values treated as compatible; shares in section 3.2 are therefore conservative on the noisy end.
- Alternates: `gsub.mjs` reads GSUB single and alternate substitution coverage for the basic Latin letters and digits in each Fontsource file; the clay files were read with fontkit's `availableFeatures` and a per-feature `layout` diff.
