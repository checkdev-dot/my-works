# Touchpad-first remote: design brief

Shaped 2026-11-04 with Dev (answers: auto per page, essentials only, player gestures). Target: `web/remote/` (index.html, remote.js, remote.css) plus the PC side that tells the remote which page is on screen.

## 1. Job and audience
Dev, lying in bed in a dark room, often tired, phone in one hand, not looking at it. Mode: Operate. He wants to move around every screen (TV Mode home, JioHotstar, Prime, Netflix, YouTube) with one thumb. He doesn't want to think about which control fits which app.

## 2. Outcome and proof
- **Primary action:** one big touch surface that does the right thing on whatever is on the TV.
- **Success:** a show found and playing with no button hunting. No press that does something he didn't mean. Back always gets him out.
- **What's true only here:** TV Mode knows which app and which page is on screen, so the pad can change behaviour by itself. A plain remote can't do that.

## 3. Direction (inside the existing TV Mode world: black ground, dark grey surfaces, dim text, one red fill)
**Thesis:** the pad reads intent, not finger position. It has three behaviours, and the PC picks one for the page on screen:

| Page on the TV | Pad behaviour | Why |
|---|---|---|
| TV Mode home, episodes, details; Netflix and YouTube browse | **Focus.** A swipe moves the highlight one card. A longer or faster swipe moves several cards, with momentum along a row. Tap = OK. | These pages are grids made for a d-pad. Jumping card to card is faster and never misses. |
| JioHotstar and Prime browse pages, sign-in pages, anything arrow keys handle badly | **Cursor.** Drag moves a cursor that snaps onto the nearest button or card when it is close. Tap = click. Two fingers = scroll. | Arrow keys get lost on these sites; a cursor that snaps to targets is precise and still quick. |
| Any player (video playing or paused) | **Player.** Tap = play or pause. Swipe left or right = seek 10 s (repeat swipes add up). Hold and slide = scrub with a preview, committed on release. Swipe down = the app's own controls or episodes. | Watching needs only play, seek and the app's menu, and these fit the pad naturally. |

A small label at the top of the pad names the current behaviour ("Moving between cards", "Cursor", "Playing"). Dev never switches it himself, but **hold two fingers** swaps Focus and Cursor for that page if the guess is wrong.

## 4. Scope and boundaries
- **In:** a new main screen with the pad taking most of the phone; gesture engine; per-page mode from the PC; haptics; a swipe-up drawer.
- **Main screen buttons:** Back, Home, play/pause, volume (− / mute / +), Full. Everything else moves into a swipe-up drawer: d-pad, seek buttons, scroll, sleep timer, type box, the app row.
- **Kept:** the Point (gyro) mode, as a held button at the pad's bottom edge. Also kept: pairing, relay/WebRTC transport, power hold-to-confirm, the sleep timer, typing, and the visual world.
- **Anti-goals:**
  - No gesture that needs looking at the phone.
  - No hidden mode Dev must remember.
  - No gesture whose mistake can't be undone with Back. Seeking is undone by swiping the other way; a scrub can be cancelled by sliding back to where it started.

## 5. Avoiding mis-touches (binding)
- **Dead edges:** a 16 px band along each side ignores touches that start there, so a gripping palm or thumb does nothing.
- **Tap:** shorter than 200 ms, moved less than 10 px, one finger. Anything else isn't a tap.
- **Swipe:** counts after 24 px. The direction locks to the stronger axis, so a diagonal never moves two ways.
- **Repeat:** one swipe moves one step; the speed of the flick adds steps. A held drag repeats with gentle acceleration, and lifting the finger stops it at once.
- **Two fingers:** scroll only (in Cursor). Never a click.
- **After a page change:** the pad ignores input for 300 ms while the new page loads, so a swipe in flight doesn't land on the next screen.
- **Feedback:**
  - A haptic tick on every focus step, seek or click; a double tick when the edge of a row is reached.
  - On the TV, the existing focus ring moves. In Cursor, the cursor is drawn bigger while it is snapped to a target.

## 6. States
- **Connecting:** the pad is dimmed and says so.
- **Mode switches:** when the page changes, the label crossfades with no layout shift.
- **Edge of a row:** double tick, no movement.
- **Player with no seek** (some live content): seek swipes give a short buzz and the label says "Can't seek this".
- **Typing needed:** the type box opens on its own, as it does today.

## 7. Constraints and open decisions
- **Mode source.** The PC already knows the app, the URL and whether a video is present. It sends a `padMode` (focus / cursor / player) with each state update. The per-app table above is the default; a page that rejects arrow keys drops to Cursor.
- **Netflix in Chrome.** Focus needs the arrow keys to work there:
  - It works when TV Mode started Chrome (spatial navigation) or when the helper extension is installed.
  - Otherwise Netflix gets Cursor. The builder must not invent another route.
- **Snap targets in Cursor.** For Edge pages, they come from the page itself: links, buttons and cards in view. In Netflix's Chrome window TV Mode can't see the page, so the cursor there doesn't snap.
- **Pointer.** The gyro Point mode stays as it is. It is held from a button on the pad's bottom edge, and while held it overrides the pad.
- **Tests.** Every gesture rule above gets a smoke check, using synthetic touches on the remote page.
- **Accessibility.** Each drawer control keeps its label. The pad has an aria description of the current behaviour.

## 8. Player tasks: the full list (2026-11-04)
Everything a viewer does while watching, how the remote does it, and what's been checked. "Checked" means tried on the real app, not just in a test.

| Task | How | JioHotstar | Prime | Netflix (Chrome) | YouTube |
|---|---|---|---|---|---|
| Play / pause | Tap the pad, or the Play button | built | built | built (media key) | built |
| Scrub | Slide sideways on the pad; a long slide covers more | built | built | jumps by the slide (length unknown without the helper) | built |
| Skip 10 s | Flick sideways | built | built | built | built |
| Subtitles and audio | Subtitles button or swipe up: the phone lists the subtitles and audio; tap one. The app's menu opens and closes on the TV by itself | menu reader, not checked | menu reader, not checked | helper 1.3 (Netflix's player), not checked | captions on/off |
| Skip intro / recap / next episode | "Skip intro or next episode" in the drawer | built, not checked | built, not checked | presses OK (Netflix puts focus on Skip) | n/a |
| Full screen | Full button | F key | F key | F11 on the window | F key |
| The app's own controls | Swipe down no longer sends Down (on Netflix Down turns the volume down) | | | | |
| Volume | Volume buttons | Windows volume | same | same | same |
| Back to the show | Back | browser back | browser back | opens the show page when it opened straight on the episode | browser back |
| Speed | Player sheet, Speed tab (0.75 to 2) | built | built | helper 1.3, not checked | built |
| Pick an episode | Swipe down, or the sheet's Episodes tab | built | built | built | n/a |
| Next/previous episode without the app's button | not built | | | | |
| Show where you are (time left) | Time bar at the top of the remote | built | built | needs the helper | built |

Netflix with the helper extension 1.2 (`extensions/netflix-dpad`, loaded by Dev in Chrome): the time shows, the pad turns into the player pad by itself, scrub and seek use Netflix's own player, and Subtitles and Skip press Netflix's buttons. Not checked on the real app yet. Without the helper: an episode started inside Netflix (Continue Watching, autoplay) looks like a browse page to TV Mode, so the pad stays on Cards. Hold two fingers once to get the player pad; again for the cursor. Without the helper, a scrub on Netflix is sent as 10 s arrow presses (not checked on the real app).

Next to check on the TV: subtitles and Skip on JioHotstar and Prime, with a video playing; a long Netflix scrub.

## 9. Player panel: what has been checked (2026-11-04)

"Live" means seen working on the real TV. "Test" means a Go test or the demo remote in a browser. "Built" means the code is there but nobody has watched it work.

| Case | Status |
|---|---|
| Netflix: subtitle and audio list, switching | Live (log 15:05: 6 audio, 12 subtitles, Hindi and English set) |
| Panel layout with 12+ items, 360x640 and 412x870 | Test: only the list scrolls, ±10 and Done stay put |
| Phone Back with a panel open | Test: closes the panel, stays on the remote, also after a reload |
| Episodes list for a Netflix show | Test, real TMDB (Pantheon: 8 episodes, season 2 pager) |
| Episodes when only the title is known (no season yet) | Test (falls back to the title) |
| Tapping an episode a minute later | Test (the show stays known after a shelf refresh) |
| Tapping an episode while Netflix is open | Built: old window closes first, TV no longer jumps to Home mid-swap |
| Every phone button reaches a handler on the PC | Test (wiring test over remote.js) |
| Subtitles or Episodes on the Home screen | Built: says "Nothing is playing" |
| A movie in Episodes | Built: says it is not a series |
| ±10 on Netflix | Not checked live |
| Speed on Netflix | Not checked live |
| JioHotstar and Prime subtitle menus | Not checked on the real sites (mock menu only) |
| Prime at all | Can't check: not signed in |
