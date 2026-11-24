---
name: TV Mode
description: A night-time TV shell: an all-black ground, very dark grey surfaces, dimmed text and a small red fill for the action that matters now.
colors:
  background: "#000000"
  surface: "#141414"
  surface-pressed: "#2a2a2a"
  border: "#4a4a4a"
  text: "#e6e6e6"
  muted: "#9a9a9a"
  red: "#b00710"
  red-pressed: "#800509"
typography:
  clock:
    fontFamily: "Segoe UI Light, Segoe UI, Sofia Sans Condensed, sans-serif"
    fontSize: "56px"
    fontWeight: 300
    letterSpacing: "0.02em"
  tv-surface:
    fontFamily: "Sofia Sans Condensed, Bahnschrift Condensed, Arial Narrow, sans-serif"
    fontSize: "56px"
    fontWeight: 600
    letterSpacing: "0.08em"
  title:
    fontFamily: "system-ui, Roboto, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
  button:
    fontFamily: "system-ui, Roboto, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.1
  ok:
    fontFamily: "system-ui, Roboto, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 700
  muted:
    fontFamily: "system-ui, Roboto, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.25
  countdown:
    fontFamily: "system-ui, Roboto, Arial, sans-serif"
    fontSize: "150px"
    fontWeight: 700
    lineHeight: 1
rounded:
  sm: "4px"
  md: "8px"
  round: "50%"
spacing:
  base: "4px"
  gap: "8px"
  gutter: "16px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "48px"
    typography: "{typography.button}"
  button-pressed:
    backgroundColor: "{colors.surface-pressed}"
    textColor: "{colors.text}"
  primary-button:
    backgroundColor: "{colors.red}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "72px"
  primary-button-pressed:
    backgroundColor: "{colors.red-pressed}"
    textColor: "{colors.text}"
  play-button:
    backgroundColor: "{colors.red}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "88px"
  link-banner:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "48px"
  text-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "64px"
---

# Design System: TV Mode

## Overview

**Creative North Star: "One Red Button"**

A TV shell read in the dark by someone already settled. Pure black ground (#000000) on every surface, because it is used at night. Surfaces for what you can press are very dark greys (#141414, pressed #2a2a2a), text is dimmed to #e6e6e6 with muted text at #9a9a9a, and a small red fill marks the action that matters right now: Play, OK, the service that is on, Point while it is held. Nothing is a large bright area. Everything else is quiet.

Flat colour only: no shadow, no gradient, and no glow on the phone, the overlays or the pairing page. The one exception is the v3 launcher (LAUNCHER-V3-SPEC), where the focused card, tile and OK button carry a per-service ring and glow, the banner a faint wash of the service's own colour, and a festival adds its own warm light, so it is plain where the title will play. Feedback is a short ease-out fade (200 ms) so a press feels answered. The same palette runs across the 1920x1080 launcher, the in-page overlays, the phone remote and the pairing page, so one person on a sofa learns it once.

**Key Characteristics:**
- Black ground (#000000), surface (#141414) with a #4a4a4a edge for every control.
- Red (#b00710) is the one fill behind a white label; never red text. On the launcher the main button wears its service: Prime blue (#0f6fc0) and JioHotstar violet (#5b34d6) fills with a white label, Netflix and YouTube keep red.
- White text, real grey (#9a9a9a) for secondary text.
- Thumb sized: every target is at least 48px; Play and OK are the biggest.
- State is never colour alone: a lost link shows an icon and words.

## Colors

### Primary
- **Red** (#b00710): the primary-action fill with a white label: Play, OK, the active service button, Point while held, a confirmed Exit ("Sure?"), and the Power hold fill.
- **Pressed Red** (#800509): pressed state of any red fill.
- **Service action fills** (launcher only): the main action button is Prime blue `#0f6fc0` or JioHotstar violet `#5b34d6` for those services, white label; Netflix and YouTube use Red. Off focus the button dims to the surface fill.

### Neutral
- **Background** (#000000): the page, the full-screen views, the bottom sheet.
- **Surface** (#141414): buttons, banner, fields, touchpad, sleep tag.
- **Pressed Surface** (#2a2a2a): pressed or selected surface (sleep choice in use, the chosen subtitle, audio or speed).
- **Border** (#4a4a4a): the 1px edge on every surface, the progress track, the Power ring track.
- **Text** (#e6e6e6): primary text and icons.
- **Muted** (#9a9a9a): secondary text: times, hints, brand line, placeholder.

### Named Rules
**The Red Fill Rule.** Red is a button background with a white label, nothing else. It never colours text, icons on dark, borders or the lost-link banner.
**The Not-Colour-Alone Rule.** Any state that matters (lost link, selected sleep, active service) carries a second cue: an icon plus words, a thicker white edge, or the red fill with a label.

## Typography

**Phone font:** system-ui, Roboto, Arial, sans-serif. No web font on the phone remote.

**Clock and display face:** Segoe UI Light (300, 56px, .02em, tabular) for the launcher clock; falls back to Segoe UI, then the TV-surface face.

**TV-surface font:** Sofia Sans Condensed (500, 600, 700, self-hosted woff2 in web/fonts; fallbacks Bahnschrift Condensed, Arial Narrow, sans-serif) for the launcher, the pairing view and the in-page overlay (embedded there as "TVModeCond"). Uppercase, tracked, read from across the room.

### Hierarchy
- **Countdown** (700, 150px phone): the shutdown number, white.
- **Title** (700, 18px): service name in the header, sheet titles, big buttons (Point, volume level).
- **Button label** (600, 16px): all controls and service names.
- **OK** (700, 24px).
- **Muted** (400-600, 16px, #9a9a9a): times, brand line, sheet hints.

All phone text is at least 16px, in px floors, so it does not shrink on narrow phones. Figures are tabular. Sentence case, no tracked caps.

## Layout

The phone remote is one column capped at 460px with a 16px gutter, fitting 412x915, 375x812 and 360x780 with no scrolling and no gap under 8px. Sizes step by width, never by height. When the content is taller than the screen (big text, a zoomed page) the column scrolls, and plain buttons then allow a vertical pan (`.app.tall`); the pad, scrub, Point and Power never do. Top to bottom (as shipped 2026-11-11; the pad took the middle on 2026-11-06 and the drawer holds the rest):
1. Header: TV Mode, current service, mode, the sleep tag (a button while a timer runs: a tap cycles 30, 60, off), Keyboard and More as ghost buttons at the right. The link banner is an overlay just under the header (absolute, 48px or more, no pointer events), so More and Keyboard stay uncovered and no control ever moves.
2. Times and the scrub bar in one 56px band.
3. Back and Home on their own row at the outer corners (104x56 at 412, 88x52 at 360), the middle empty. Their position is Dev's muscle memory and stays as it is, although they are the farthest controls from a resting right thumb.
4. The pad (the main way to move, TOUCHPAD-SHAPE.md): takes all the height left; its label says what a swipe does (Cards, Cursor, Playing); Hold to point sits at its foot.
5. Transport: Play (the largest control, red), Subtitles (the player sheet) and Full.
6. Volume: down, level and mute, up.
7. Footer, set apart by a divider: "Apps, arrows, sleep" (opens the drawer) and the round Power button (hold one second).

The drawer (bottom sheet) holds the four services, Skip intro or next episode, the arrow keys with OK, seek -10 and +10, Scroll up and down, the mood tap (caption "Mood for tonight", with a line under it: it nudges tonight's picks on the TV and clears at 05:00) and Sleep 30, 60, off (caption "Sleep timer", same caption style). A Left hand switch in More mirrors the horizontal layout (header, Back and Home, footer); the arrows, seek, volume, scroll and scrub are never swapped.

**No link.** When the PC cannot be reached the whole main screen says so, not only the banner: the times and the volume read "--", Play, OK and Point lose their red fill, the scrub fill goes grey, and every control is dimmed and carries `aria-disabled`. The pad becomes the explanation: a title, one plain line of what is known (TV Mode was closed on the PC, start it from the TV Mode shortcut on the PC; the PC went quiet, if it is asleep move the mouse or press a key on the PC; TV Mode was turned off from this phone at 23:41; the PC answers but TV Mode does not; otherwise "It may be asleep or off, or TV Mode is closed"), "Last heard from the PC at 19:33." and one large red Try again button, where the thumb already is. While the phone is retrying by itself ("Lost the PC. Reconnecting.") Try again is a quiet surface button; it is red only for off, no connection and stuck. Touchpad and Type show the same diagnosis and Try again above their dimmed controls. The banner then says only "No link to the PC" so the sentence is not repeated, the header reads "Last: <service>" in muted grey and the sleep tag is hidden. The words never advise a fix that could do harm (no "press the power button"). `/remote/?demo&off` (or `&off=closed|quiet|quit|stuck`, or `&lost`) previews these states.

Press rules: arrows, OK, Play, seek, volume and scroll fire on touch-down (repeat while held). Back, Home, services and Sleep fire on release (still over the button, under 10px of travel, held 40ms or more; sliding off cancels). While something plays, a service that is not the current one asks first (a red "Open Prime Video?" over the row for 3 seconds). The scrub does nothing on a tap; a 16px sideways drag or a 300ms hold wakes it, a large target time shows, and it seeks only on release (more than 48px off the bar cancels). Haptics: arrows 15ms, Back 10-50-10, Home 30-50-30, OK and Play 25ms.

More holds Re-centre, Calibrate, Type, Left hand, Install on this phone (hidden once installed), the desk screen switch, Close TV screen and Turn off TV Mode (its hint says the phone stops working until TV Mode is started again on the PC; confirming it makes the next "can't reach" say it was turned off from this phone). Touchpad and Type fill the screen with a Back to Remote button on top (a handset icon, not the Back arrow). The shutdown countdown, the Start TV standby view and the calibration prompt are full-screen views with one huge button. The Start TV view also carries a secondary shutdown control at its foot, under a rule: the Power ring (hold one second) with "Hold to shut the PC down. It counts 10 seconds first." The countdown view sits above it, with its Cancel.

The launcher (TV) follows the v3 focus model: one thing is lit. The focused card, service tile or pill wears its service's ring and glow (Netflix red, Prime blue, YouTube red, JioHotstar violet, neutral grey for pills), everything else dims, and a festival card or slide swaps in the festival's single warm ring and light (see Festival light). On the phone, the overlays and the pairing page: black ground, #1f1f1f markers with a thin red underline for focus; no amber and no lamp rule. The pairing page follows the same tokens; its QR plate is the one light area, kept as small as scanning allows, and it carries no Wi-Fi line because the remote works over the internet.

## Elevation & Depth

On the phone, the overlays and the pairing page: flat. No shadows, glows or blur. Depth is tone and a 1px #4a4a4a edge. (The launcher's ring and glow are the v3 exception above.) The bottom sheet sits over a dark scrim.

## Shapes

4px and 8px corners on controls, a true circle for Power. Edges are 1px #4a4a4a, 2px white for a selected sleep choice, 3px white offset rings for keyboard focus.

## Components

### Button
Surface fill, 1px grey edge, white 16px label, 48px minimum. Pressed: surface darkens to #444 and the control scales to 0.97, easing out over 200 ms.

### Pill button
Back and Home: radius 28, transparent fill, 1px #4a4a4a edge, icon plus label, 52-56px tall, on their own row so they never look like arrows. Fire on release.

### Service button
Surface fill like a button, a 20px mark in the service's own colour dimmed to about 65% brightness (Hotstar purple, Prime blue, Netflix and YouTube red), and a short label. The current service is the red fill with a white mark.

### Primary button
Red fill, white label, same edge colour as the fill. Play is 72-88px tall, the d-pad OK 56-72px, Cancel on the countdown is a dark surface button with a light edge, 140px.

### Link banner
Surface with a 1px grey edge, a small warning icon (lost) or info icon and the message in white, so the state is words plus icon. A short sentence only: the full diagnosis and Try again live in the pad. An absolute overlay just under the header (it never covers More or Keyboard); it ignores touches and pushes nothing. Hidden when the link is fine.

### Progress bar
A 6px track with a grey edge and a white fill, in a 56px tall touch area (slider) with the times above the track in muted text. It seeks only after a drag or hold and shows the target time at 48px while the finger is down.

### Bottom sheet
Opens from More. Rows 60px tall with a title and a muted hint. Close, scrim tap and Escape all dismiss it. Pick Type or Touchpad and it closes and switches mode.

### Sleep tag
A small surface chip in the header with the minutes left, 16px. A button: a tap sets the next timer (30 to 60 to off) through a 48px hit area. Hidden when no timer runs.

### Power
64px circle, surface fill and grey ring track. Holding fills a white ring over 1 s linear and the circle turns red. Kept under reduced motion because it is a progress readout.

## Do's and Don'ts

### Do:
- **Do** use red only as a fill with a white label, for the one primary action.
- **Do** keep every target at 48px or more and every text at 16px or more.
- **Do** show lost link with an icon and words.
- **Do** ease press feedback out over about 200 ms and honour prefers-reduced-motion.
- **Do** keep Power apart at the bottom and behind a hold.

### Don't:
- **Don't** set text or thin icons in red on the dark ground.
- **Don't** add glow, drop shadows, blur or bounce on the phone, the overlays or the pairing page.
- **Don't** use the Netflix logo, wordmark or name as branding; the app is TV Mode (the Netflix service button is a service name).
- **Don't** let a scaling unit shrink text below 16px or targets below 48px.
- **Don't** bring back amber, ember or the lamp strip on the phone, the overlays or the pairing page (the launcher's festival light is the exception).

## Occasions on the launcher (2026-11-04)

A festival or a season is a word, the title's own picture, and the Festival light below, nothing else. Dev's decision: **words, the title's own picture and the Festival light only; no festival artwork and no confetti. The warm light and lamp string are defined under Festival light.**

- The hero slide of an occasion is the ordinary pick slide with a different kicker word (`DIWALI WEEK · NETFLIX`) and the node's one-line reason. The backdrop is the chosen title's own.
- A themed shelf is an ordinary shelf titled with the occasion ("Diwali week"). Cards, glow and sizes are unchanged; the stage kicker for a card reads `ON NETFLIX · DIWALI WEEK`.
- At most one occasion slide and two themed shelves at once. The hero never rotates by itself.
- Nothing on the page may be brighter than the title text. The only colour an occasion adds is its Festival light (`--occ`, `--occ2`).

## Festival light (2026-11-04, Dev's call)
Festival slides and festival-shelf cards set `data-occ="<node>"` on `#sbg`, `#stagetxt` and the `.row`. Tokens: `--occ` (main warm light) and `--occ2` (second light), per festival family in launcher.css: Diwali amber `#ffb04a`/`#ff6a2b`, Holi `#ff4fa3`/`#7b5cff`, Christmas/New Year `#ffd27a`/`#e0473c`, Eid `#7fe0b8`/`#d8c27a`, monsoon `#6fb6ff`, summer `#ffcf4a`, winter `#bfe3ff`. Used for: the banner glow, the lamp string (`.sbg .lamps`, 3.2 s breathe, off with reduced motion), the kicker text and its mark (`.omark`), the shelf heading and its focus ring. The red action fill stays red.

## Saved, Library and "Saved to TV" (2026-11-04)

No new colours and no new tokens. TV launcher: a `Saved` row after Continue watching, built from the existing row and card classes; its stage uses the Continue words (kicker `SAVED · YOUTUBE`, the title, a dim line such as "From your phone, today", the hint "OK to play"). Desk: Saved is the Continue list shape (`.lrow`, 160x90 picture, title, dim line, buttons on the right) under a Paste a link box. Library is a table (`.trow`: 64x36 picture, title, kind, service with its colour square, a state chip, last seen, where, buttons), with filters on top (state buttons with counts, a service select, a title filter) and sortable headers. State chips are outlined text: Watching has a white outline, Finished is dim, Dropped is dim and dashed. Remove asks twice ("Sure? Remove"). Phone: "Saved to TV" reuses the Standby full-screen view (`downview standview savedview`): title, the saved item's name, a red Play on TV button and a quiet Done.

## Desk (2026-11-04, redesigned: the launcher's world for a mouse)

The desk (`web/desk/`, http://127.0.0.1:8770/desk/) is Operate mode: the TV launcher's black ground, #141414 surfaces, dim text, red as the one fill, the service colours and the festival light, made precise, calm and generous for 1440 to 2560 px wide with a mouse. No new colours; no phone layout. The old left rail is gone.

- **Top bar** (fixed, 72 px, black): the TV Mode wordmark (Sofia Sans Condensed 700, 28 px, tracked caps); text tabs Home, Library, Watched, Your year (current: text colour and a 2 px underline); a search field (`/` focuses it); then the **TV control**, a phone status, a clock and a settings button. The **TV control** (44 px, `#141414`, 1 px border) states the TV in words and offers the actions that fit: TV off gives "TV off" and a red **Start TV**; TV on gives "TV on · Netflix" (or "Launcher"; the app comes from `/api/desk/state` `app`), **Bring up** and a quiet **Turn TV off** that asks again ("Sure? Turn off", 3.5 s) before it closes the TV session; starting or closing shows "Starting TV..." or "Closing TV..." with a dotted dot and no buttons. The phone status is an icon plus "Phone connected" or "No phone" (words hidden under 1650 px, the icon stays). The clock is the launcher's clock (Segoe UI Light 300, 28 px, tabular). Settings opens a popover with Your city.
- **App tiles** (sticky under the bar, one row of four equal tiles, 64 px): the four services with the launcher's own wordmarks. A tile **opens that app's home page here** (the same path as the hero's Open here, `k:"svc"`); a small **On TV** button at its right edge sends it to the TV. A hovered or focused tile wears its service ring (2 px, `--ring`). Tiles do not filter. **Filtering** is a quiet chip row (All, JioHotstar, Prime Video, Netflix, YouTube; the chosen chip is outlined in `--text` on `--pressed`) between the hero and the rails, and at the top of Library, Watched and search results; it filters the hero slides, every rail, search results, Library and Watched, and is kept in localStorage.
- **Hero**: the launcher's stage at 440 px (1080p), up to 560 px (1440p): backdrop on the right 70 % fading to black on the left, the service wash, kicker (Sofia 700, 20 px caps, with the festival mark), title (Sofia 700, 68 to 88 px, 2 lines at most), facts, one line of why, the overview clamped to 2 lines, and the actions: **Open here** (service fill with its wordmark: Prime #0f6fc0, JioHotstar #5b34d6, Netflix and YouTube red, white label), **Play on TV**, **Watched it**. The slides are a strip of 4 to 6 thumbnails at the bottom right with previous and next arrows; nothing rotates by itself. The text block is bottom-left and the strip bottom-right; the text block drops its overview, then its facts, if it would climb into the banner. The previous and next arrows stop at the first and last slide (disabled there, no wrap). The hero belongs to its slides: hovering a card does not change it.
- **Rows**: at most 10 rails: Continue (from the library, with a progress bar and "at the desk" or "on TV" plus when), Saved, Because you watched, the occasion shelf (`occ-*`, in its warm heading colour and mark), On this day, For you, Top rated, then the next shelves in order (the "For you, with a touch of" variants last). Everything else folds into one **More shelves** section (a 52 px bar with the count, collapsed by default): open it for a list of shelf headings, and a click opens one shelf at a time as a full-width rail. Why-lines that only say "Picked for you" are dropped. 16:9 cards, 220 px (1440), 240 px (1920), 300 px (2560), title and app under the card. A row scrolls sideways with round arrow buttons that appear on hover (and wheel-shift or a trackpad); its scrollbar shows only on hover and is themed. Hover or keyboard focus lifts a card 4 px, shows its service ring and fades in an in-card overlay at the bottom of the picture (kind, year, rating). A click or Enter slides the details panel in from the right (480 px, `#141414`, 150 ms) and moves focus to its Close button; Esc or Close closes it and gives focus back to the card. In the panel, **Open here** is the service-filled button with the wordmark (same as the hero), **Play on TV** has a `T` key hint, and `T` plays the open title on the TV.
- **Library** is a calm table (fixed columns, tabular numerals, state chips) with a paste-a-link box. Each row keeps two buttons, **Open here** (service fill) and **Play on TV**, and a **More** menu (Finished, Drop, Resume watching, Remove from library with a second click; Esc and an outside click close it). Finished and Drop show a toast with **Undo** for 8 s. **Watched** is a poster grid in two groups; **Your year** keeps its recap. Marking a title says "Marked watched and liked" or "Marked watched, not for me".
- **Tokens**: `--gut` 40 / 48 / 64 px, `--cw` card width, `--hero-h` clamp(440px, 40.7vh, 560px), `--pk-w` thumbnail width 132 / 168 / 200 px; focus ring 2 px `--text`; selection is the red fill; scrollbars `#4a4a4a` on black. Festival light: the same `[data-occ]` tokens as the launcher (`--occ`, `--occ2`), the lamp string and the kicker mark, in px, without the breathing animation.
- **Motion**: one authored moment, the 400 ms ease-out crossfade of the hero picture; everything else is instant or 150 ms; `prefers-reduced-motion` switches all of it off.
- **Desk fixes (2026-11-11)**: the hero leads with the newest Continue title for the chosen app and returns to slide 1 on every filter change; failures toast in plain words with **Try again** (starting, service not answering, TV Mode not running); the hero **Watched it** offers Undo. More shelves are three grids (Languages, Kinds, A touch of), 3 to 4 columns, A-Z; New releases is a main rail. Library has one filter row (state, app chips, title filter) with the paste box under it and the title column capped at 520 px. The panel is modal (Tab stays inside, Esc returns to the card) and lists episodes before the action buttons. **On TV**, **Play on TV** and **Bring up** carry tooltips that say what they do.

## Phase 5: delight (2026-11-04)

No new colours. Your year (desk): big numerals in text colour, four flat cards on `--surface`, a month strip of plain `--text` bars; months before the record began are a dashed rule, not a zero. Mood (phone drawer): three buttons the size of Sleep, the pressed one gets the same 2 px light border. On this day (TV): an ordinary shelf, no mark or accent.
