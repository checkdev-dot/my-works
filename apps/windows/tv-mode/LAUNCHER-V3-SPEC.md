# Launcher v3 spec: "One thing lit"

From the impeccable layout + typeset + distill review (2026-11-04) and Dev's asks. 1920x1080, viewed from bed ~3 m away, dark room. Overrides DESIGN.md where they conflict (per-service glow replaces "no glow"); update DESIGN.md after the build.

## Thesis
The top 560 px is a stage that always describes the focused item and says what OK does. Below it, one lit row stays pinned in the same band; the next row peeks dimly; everything else is black. Eyes never travel.

## Grid
Safe area: 96 px left/right, 48 top, 40 bottom (content 1728 wide). Keep `--u` (10 px at 1080p). Spacing scale only: 4, 8, 12, 16, 24, 32, 48, 64, 96 px.

## Structure (focus on hero, first screen)
1. Top bar y 48-104, no background. Right edge: clock 56 px Segoe UI Light + date on the same baseline ("TUE 4 NOV"). Left of the clock: status words "PHONE ON · SLEEP 30" (no box). Never resizes. Lost phone must look different: words "NO PHONE" + a warning icon (fix `--red` = ivory bug).
2. Stage y 0-560. Backdrop anchored right, brightness .6. Scrims: `linear-gradient(to right,#000 0%,#000 30%,rgba(0,0,0,.6) 55%,rgba(0,0,0,0) 100%)` + `linear-gradient(to top,#000 0%,rgba(0,0,0,0) 35%)`. Pure black below 560: no backdrop or trailer behind rows. Trailer only inside the stage after 3 s focus, muted, opacity .5. Text block left 96, bottom at y 520, max-width 1040.
3. Services row y 600-696: four tiles 414x96, gap 24; unfocused #141414 + wordmark #9a9a9a; focused: service glow, scale 1.05, wordmark #e6e6e6.
4. Continue watching row (when 2+ items remain after the hero takes the first).
5. Filter bar right above the first recommendation row: ALL / MOVIES / TV SHOWS pills, 56 tall, at x 96, with the first row's label on the same line after the pills. Up from the first rec row lands on it; max 2 Downs from services.
6. Recommendation rows: cards 384x216, gap 24, stride 408 (4 full + a 96 px peek). Continue cards same size + 6 px progress bar at the bottom edge. Row stride: label 32 + 12 + card 216 + 48 = 308.

Focus order: hero (default) -> services -> continue -> filter -> rows.

## Scrolling
On any row: stage shows that card's details; services and filter scroll out; focused row pinned (label y 600, cards 644-860); next row label y 908, cards peek from 952 cut at 1080; rows above go to opacity 0. Horizontal: scroll once column > 2, stride 408. Derive JS strides from CSS custom properties, not magic numbers.

## Focus model
- Focused card: scale 1.08 (origin left for the first card), image brightness 1, title #e6e6e6, service glow, z-index 2, 200 ms ease-out; one rating badge top-right (26/700 #e6e6e6 on rgba(0,0,0,.72), padding 4px 10px, radius 4; IMDb if present else TMDB).
- Unfocused cards in the lit row: brightness .5, title #9a9a9a. Peek/other rows: opacity .35 whole shelf.
- `.track` must not clip glow/scale (overflow: clip with overflow-clip-margin 64px, or padding + negative margin).
- Cards show the title only (one line, ellipsis). No service chip, no meta line. No-image card: #141414, title centred 30 px, 2 lines.
- Glow on `::after` (inset 0, radius inherit), animate opacity only; driven by `data-svc` + `--ring`/`--glow`:
  - netflix: `0 0 0 3px rgba(229,9,20,.75), 0 0 48px 8px rgba(229,9,20,.28)`
  - prime: `0 0 0 3px rgba(26,152,255,.70), 0 0 48px 8px rgba(26,152,255,.24)`
  - youtube: `0 0 0 3px rgba(255,0,51,.70), 0 0 48px 8px rgba(255,0,51,.26)`
  - jiohotstar: `0 0 0 3px rgba(31,128,224,.72), 0 0 40px 6px rgba(31,128,224,.22), 0 0 72px 14px rgba(106,61,232,.18)`
  - neutral (pills, no service): `0 0 0 3px rgba(230,230,230,.6), 0 0 32px 4px rgba(230,230,230,.10)`

## Hero (a manual carousel, no autoplay)
At most 5 slides (Continue or Up next, tonight's pick, the occasion, then two more; capped in launcher.js heroList for live and demo data alike). Left and right step through them on the hero only; a "2 / 5" position, a thin track and a peek of the next three picks sit at the stage's right edge, and only while the hero has focus. On the services row and the filter the stage describes that item instead (Search, "Open app", "Show").
a) Last watched (progress 2-95%): kicker `CONTINUE WATCHING · PRIME VIDEO`; title = show; line `S1 E3 · Episode title`; progress bar 480x6 (#4a4a4a track, #e6e6e6 fill) + `24 min left`; red pill `OK  RESUME`; muted `You stopped last night at 23:10`.
b) Finished + next known: kicker `UP NEXT · NETFLIX`, action `OK  PLAY S1 E4` (or "Open").
c) No history: kicker `TONIGHT'S PICK · NETFLIX`; title; fact line; why (`Because you watched Dune` / `Top rated this week`); overview 2 lines; `OK  OPEN IN NETFLIX`.
Empty: "Nothing to continue yet. Here's a pick for tonight." Loading: #141414 skeletons, no shimmer.

## Stage while a card has focus
Kicker 26/700 .14em caps #9a9a9a: `ON NETFLIX · BECAUSE YOU WATCHED DUNE` (reason from the shelf). Title 80/700 up to 2 lines. Fact line 30/500 #e6e6e6 joined " · ": IMDb "8.1" (700) + 22/600 "IMDb" label; TMDB "7.8 (12k)" muted; age box (24/700, 2px #9a9a9a border, radius 4, padding 2px 8px); year; up to 2 genres; "2h 5m" or "3 seasons". Why-watch sentence 30/500 #e6e6e6. Overview 28/500 lh 1.35 #9a9a9a, 2 lines. Hint 24/600 #9a9a9a: "OK for details" (continue items: "OK to open"). Max 5 lines under the title. Fetch `/api/title` on focus (300 ms debounce, cached, prefetch neighbours).

Why-watch sentence: TMDB tagline if < 90 chars; else "{Genre} {movie/series} from {year}, with {cast1} and {cast2}. Rated {r} by {votes} people." Fewer than 50 votes: "Too new to rate" instead of a number. Votes compact (1.2k, 34k). Missing fields drop with their separator; never "N/A".

## Detail panel (OK on a recommendation card)
Full-screen black, same safe area. Right: trailer box 1152x648 at x 672, y 48, radius 8; backdrop at .7 first, muted trailer autoplay after 800 ms, loop, no controls; left 30% fades to black. Left column x 96-900 from y 160: kicker `ON PRIME VIDEO`; title 80/700 up to 3 lines; ratings row (gap 48): big number 64/700 + label under 22/600 caps (`IMDb · 34k`, `TMDB · 12k`, RT % only if enabled); fact line 30; why-watch 32/600 #e6e6e6; overview 28/500 #9a9a9a up to 5 lines; cast "With A, B and C" 28/500. Actions (y 880-952): `OK  OPEN IN {SERVICE}` red #b00710, 72 tall, 30/700 caps, default focus, service glow; `TRAILER WITH SOUND` #141414, neutral glow (unmute + full screen; Back returns). Back closes the panel, focus returns to the same card. Fast paths: hero Resume one press; continue cards open directly; remote Play/Pause on a rec card opens the service directly.

## Rows (10, in order; each title appears once, earliest row wins; hero item excluded; max 12; drop rows < 4)
1 Continue watching (rest), 2 Because you watched X, 3 New releases, 4 Top rated, 5 Indian (origin IN or language hi), 6 Korean, 7 Japanese anime, 8 Crime & thrillers (thriller+crime+mystery), 9 Comedy, 10 Sci-fi & fantasy. Movies/TV/All filter applies to all rec rows.

## Type roles (Sofia Sans Condensed unless noted)
Clock Segoe UI Light 300 56 px .02em tabular #e6e6e6 · Date 26/500 .06em caps #9a9a9a · Status 24/600 .10em caps #9a9a9a · Hero kicker 26/700 .14em caps · Hero title 80/700 .01em lh 1.0 · Hero meta 32/500 · Why/time left 28/500 #9a9a9a · Overview 28/500 lh 1.35 · Action pill 30/700 .06em caps, 72 tall, 36 side padding, radius 8 · Wordmark 36 · Filter pill 28/600 .06em caps, 56 tall (selected #2a2a2a, #e6e6e6, 2px #e6e6e6 bottom edge; unselected #141414 #9a9a9a) · Row title 32/600 sentence case (lit #e6e6e6, others #9a9a9a) · Card title 30/600 lh 1.1. Nothing under 22 px; anything read for meaning >= 28 px.

## Ratings data
TMDB vote average/count (have). IMDb: official daily `title.ratings.tsv.gz` (personal use), map by imdb_id from TMDB `external_ids`, refreshed daily in Go. Rotten Tomatoes: only via OMDb with a free key Dev must get himself; without it, show nothing.

## Clean-up
Remove dead CSS (.hint, .pairtext span, .mark font-size, duplicate .exit/.view-launch/.shelf/z-index rules), clamp long strings (nowrap + ellipsis), QR fallback text wraps (word-break: break-all).
