# TV Mode protocol (v1)

Shared contract between the Go program (`cmd/`, `internal/`) and the web pages (`web/`). Change it here first.

## How the phone reaches the PC

The phone never has to open a connection to the PC's LAN address, and never installs anything. That is what makes it work on every phone and browser with no settings: Android 17's per-app local-network permission and Chrome's Local Network Access rules both block plain LAN connections from a browser, but neither touches internet traffic or WebRTC.

1. The remote page is served from a **public HTTPS origin** (`config.json` → `remote`, e.g. `https://tvmode.<account>.workers.dev`): a real certificate, so it is a secure context (gyro, vibration, add-to-home-screen) with nothing to install.
2. The same origin hosts the **relay** (`/relay/<pcid>`), a WebSocket room per PC. The PC keeps one outbound connection to its room; each phone joins the room and is forwarded to the PC. This path always works (it is ordinary internet traffic) and is the fallback for control, at relay latency.
3. Once the phone has proved the token, it offers a **WebRTC data channel**. ICE finds the shortest path, normally the LAN directly (host candidates; STUN `stun.l.google.com` helps when the router hairpins). When the channel opens, frames move over it instead of the relay. If it never opens or drops, frames keep going over the relay.

Reference relay: `internal/relay/relay.go` (runs inside `tvmode.exe`). Hosted relay: `relay/worker.js` (Cloudflare Workers + Durable Objects, free plan; `npx wrangler deploy` from `relay/` publishes both the page and the relay).

Dev with no hosting: leave `remote` empty. The PC then serves the same page and relay itself at `http://<lan-ip>:8770/remote/`, plain HTTP over LAN (no gyro, no home-screen install; Chrome on new Android may refuse the LAN address). The protocol is identical.

## Servers

- `http://127.0.0.1:8770/` (loopback only): the launcher (`web/launcher/`), `/overlay.js` (`web/overlay/overlay.js`) for Edge, `/ws/screen` WebSocket for the launcher page (no token), `/api/pair` (`{"url","ip","origin"}`) and `/api/pair.png`.
- The same port answers LAN requests only for `/remote/`, `/fonts/`, `/vendor/` and `/relay/`; every other path is 403 off-loopback. Nothing listens on 8771 any more and there is no TLS and no CA.
- In development Go serves `web/` from disk (`-web ./web`). Release builds embed it.

## Pairing

- Token: 32 random bytes, base64url, stored in `%APPDATA%\TVMode\config.json`. Rotatable from the tray. `relayKey` (same shape) is a second secret that claims the relay room; it never changes, so a rotated token keeps the same room and the phone learns it is unpaired instead of "PC off".
- `pcid` = first 32 hex chars of sha256(relayKey). Public; the relay only lets a PC with the matching key hold the room.
- Launcher shows a QR of `<origin>/remote/#t=<token>&p=<pcid>` on first run or when asked (`showPair`). The remote stores both in localStorage and strips them from the URL. Then "Add to Home screen".
- Proof of pairing never sends the token: the PC sends `{"t":"hello","n":"<nonce>"}`, the phone answers `{"t":"auth","h":sha256(token + ":" + nonce)}` (hex), the PC answers `{"t":"ok"}` then `state`. Wrong proof: `{"t":"error","msg":"This phone is not paired. Scan the QR on the TV."}` then the session is closed. Nothing else is accepted before `ok`.

## Relay (`/relay/<pcid>`, WebSocket, JSON text frames)

- PC joins with `?role=pc&key=<relayKey>` (relay checks `sha256(key)[:32] == pcid`; a new PC socket replaces the old). Phone joins with `?role=phone`; the relay assigns it a session id `sid`.
- Relay → phone: `{"t":"pc"}` when the PC is in the room, `{"t":"nopc","why":"closed|quiet"}` when it is not. `why` is optional (older relays send none, and a phone that joins while no PC is there gets none): "closed" = the PC's socket closed cleanly (close code 1000/1001: TV Mode was closed or quit), "quiet" = it errored or timed out (asleep, offline, crashed). The remote shows "TV Mode was closed on the PC." or "The PC went quiet (asleep or offline)." and, with neither, "It may be asleep or off, or TV Mode is closed." Only `relay/worker.js` sends `why`; `internal/relay/relay.go` (the local reference) still sends a bare `nopc`, which phones handle. The remote also counts hello timeouts: after 3 in a row (the relay has a PC socket but TV Mode never says hello) it says "The PC answers but TV Mode doesn't. It may be stuck or starting up." Then every frame the PC addresses to it, unwrapped.
- Relay → PC: `{"sid":"..","ev":"open"}` / `{"sid":"..","ev":"close"}` as phones come and go (all current phones are replayed as `open` when the PC joins), and `{"sid":"..","d":<frame>}` for each phone frame.
- PC → relay: `{"sid":"..","d":<frame>}` to one phone, `{"sid":"..","ev":"close"}` to drop one.
- Frames are at most 64 KB. The PC pings the relay every 20 s.

## WebRTC (signalled through the relay, after `ok`)

```
phone → PC  {"t":"offer","sdp":"..."}          data channel label "tv", ordered, reliable
PC → phone  {"t":"answer","sdp":"..."}
both        {"t":"ice","c":{candidate,sdpMid,sdpMLineIndex}}   trickle
```

When the channel is open both sides send the frames below on it; `state` is re-sent on open. When it closes they fall back to the relay session; the channel lives only as long as that session. The page exposes `window.tvlink.path()` = `"direct" | "relay" | "none"` (also `data-path` on `#app`).

## Remote → PC (JSON text frames on the data channel or the relay session)

```
{"t":"key","k":"up|down|left|right|ok|back|home"}
{"t":"media","a":"playpause|seek","s":-10}        // s in seconds, seek only
{"t":"scrub","to":0.42}                            // fraction 0..1 of duration
{"t":"vol","a":"up|down|mute"}                     // steps of 2
{"t":"vol","set":40}                               // 0..100
{"t":"pad","dx":3.5,"dy":-1.2}                     // touchpad delta, CSS px on phone
{"t":"tap","b":"left|right"}                       // click at pointer
{"t":"scroll","dy":-120}
{"t":"point","on":true}                            // Point mode clutch pressed / released
{"t":"aim","abs":1,"q":17,"yaw":-0.21,"pitch":0.04} // ABSOLUTE radians since Point was pressed; q counts 1.. per press, sensor rate (~60 Hz)
{"t":"text","s":"stranger things"}                 // typed into focused field
{"t":"textkey","k":"backspace|enter"}
{"t":"power","a":"arm|cancel"}                     // arm starts the 10 s countdown
{"t":"sleep","min":30}                             // 30 | 60 | 0 = cancel
{"t":"exit"}                                       // leave TV mode to Windows
{"t":"ping"}
```

## PC → remote and launcher (`state`, sent on connect and on every change)

```
{"t":"state",
 "app":"launcher|jiohotstar|prime|netflix|youtube",
 "focus":1,                       // launcher focused index 0..3
 "vol":42,"muted":false,
 "media":{"playing":true,"pos":4328,"dur":6510} | null,
 "sleepAt":1730662200000 | null,   // epoch ms
 "countdown":7 | null,             // seconds left on shutdown
 "phone":true,                     // a remote is connected
 "point":false}
{"t":"pong"}
{"t":"error","msg":"plain words"}
```

Also on `/ws/screen` to the launcher: `{"t":"pair","url":"<origin>/remote/#t=<token>&p=<pcid>"}` shows the QR; `"url":null` closes it (it also closes when `state.phone` goes true).

Laser pointer: the PC sets target = (pointer position at press) + gain x angle, drops any `q` at or below the newest seen and any `aim` after `point` released. Re-centre, the release jolt rewind and touchpad moves re-base so the next frame continues from the new spot. A frame without `abs` (an old cached remote) is read as the old per-frame delta.

Conventions: `aim` yaw positive = right, pitch positive = up. `scroll` dy positive = page scrolls down.

Routes: launcher at `/launcher/` (`/` on 8770 redirects there), remote at `/remote/` (on the public origin and, in dev, on 8770), `/fonts/` and `/vendor/` from `web/`, `/overlay.js` = `web/overlay/overlay.js`. `/fonts/` sends `Access-Control-Allow-Origin: *` so the overlay can load its font inside service pages.

Launcher page sends `{"t":"exit"}` on Esc, and `{"t":"focus","i":2}` and `{"t":"open","i":2}` on `/ws/screen` when it moves focus or opens (keyboard and mouse on the PC itself also work).

## Go → page overlay (CDP `Runtime.evaluate` into every service target)

`overlay.js` is injected into every service page and every new target. It defines:

```
window.__tv.show(kind, data)   // kind: "vol" {vol,muted} | "seek" {pos,dur} | "sleep" {minLeft} | "countdown" {s} | "cancelled" {what} | "phone" {on}
window.__tv.pointer(x, y, visible)   // CSS px in the viewport
window.__tv.mediaState() -> {playing,pos,dur} | null   // reads the main <video>
```

Every overlay element lives in one root that re-parents itself into `document.fullscreenElement` (or uses popover top layer) on `fullscreenchange`, so it stays visible over player fullscreen.

## Services

| id | name | url |
|---|---|---|
| jiohotstar | JioHotstar | https://www.hotstar.com/in |
| prime | Prime Video | https://www.primevideo.com |
| netflix | Netflix | https://www.netflix.com/browse |
| youtube | YouTube | https://www.youtube.com/tv (TV user agent), fallback https://www.youtube.com |

Per-service key maps live in `internal/services/<id>.go`, each small and separate.

## Acks, ids and latency (added 2026-11-03)

- Every press from the phone carries an id: `{"t":"key","k":"ok","id":"<run>-<n>"}` (`<run>` is random per page load). Not carried by streams: `aim`, `pad`, `scroll`, `ping`.
- The PC answers `{"t":"ack","id":"..."}` on the path the frame arrived on (data channel frame: on the data channel; relay frame: straight to the relay socket), **before** doing any work. It keeps the last 64 ids per session and ignores a repeated id (it still acks it).
- The phone waits 400 ms for the ack when it sent over the data channel; none: it writes the channel off (`path` becomes `relay`, WebRTC is retried later with back-off) and resends the same frame once over the relay. Frames sent over the relay wait 1.5 s, are resent once, and then the phone shows "That press didn't reach the PC."
- When the PC receives a control frame over the relay it stops using the data channel for its own frames to that phone until the channel opens again.
- Frames from a phone are handled in order by one worker per session, so a slow press (page load, CDP timeout) cannot hold up the relay read loop; when the queue (256) is full the PC drops `aim` and `pad` first.
- Latency: `{"t":"ping","ts":<ms>,"rtt":<ms of last pong>,"path":"direct|relay"}` every 4 s; the PC answers `{"t":"pong","ts":<same>}` at once. The phone shows RTT p50/p95 when the remote is opened with `?debug`; the PC logs p50/p95 per path once a minute (`latency direct: n=.. p50=.. p95=..`).

## Added remote -> PC messages

```
{"t":"open","i":2}                  // open service i (order of services.Apps); also from the launcher
{"t":"recenter"}                    // pointer to the middle of the screen
{"t":"fling","v":-1800}             // momentum scroll, px/s, + = page down; stopped by any other pointer input
{"t":"point","on":false,"why":"up|cancel|lost|hidden|key|cal"}   // why Point was released (logged)
{"t":"scroll","dy":260}             // also sent by the scroll buttons and by a swipe on the Point button
```

## Added PC -> remote messages

```
{"t":"ack","id":".."}
{"t":"pong","ts":..}
{"t":"hover"}                       // the pointer entered a new clickable target; the phone does vib(8), at most once per 120 ms
```

## OK, arrows and Back (replaced 2026-11-04: no ring)

- There is no amber ring and no magnet ring. Arrows (not launcher, not YouTube, not a player, left/right not in a text field): `__tv.nav(dir)` finds the best next pressable element by geometry (links, buttons, role/onclick/tabindex>=0 and cursor:pointer things; invisible, tiny, covered and page-sized ones skipped; off-screen carousel items allowed), focuses it for real (`focus({focusVisible:true})`, tabindex=-1 added if needed), scrolls it into view and un-hides it from sticky bars. Left/right stay in their row. If the site shows no focus style, a 2 px white outline is drawn in the closed shadow root; it follows the element and vanishes when the pointer is used. Only when nothing is found does the native key go through.
- OK: pointer live -> click at the pointer; launcher/YouTube -> Enter; something focused by nav (or the page) -> real CDP mouse click at the element's click point; text field -> Enter; player -> play/pause; nothing focused -> focus the element nearest the middle (second OK clicks).
- Back: a dialog/modal open ([role=dialog], aria-modal) closes first (Escape, then its close button); a second Back within 10 s on the same page goes back out. Then exit fullscreen, the service's own back control, else history.back().

(Older text follows, partly superseded.)

## OK, arrows and Back (old)

- OK: pointer live -> click at the pointer; launcher or YouTube -> Enter; spatial-nav ring up -> real mouse click on the ringed element; a main player on the page (fullscreen, a watch-style URL, or a long non-looping video covering 70% of the viewport; browse-page trailers do not count) -> play/pause; otherwise Enter when something has focus, else the ring is shown on the element nearest the middle (press OK again to click it).
- Arrows (not launcher, not YouTube, not a player, not a text field): if focus is on `<body>` or the ring is up, `__tv.nav(dir)` moves the ring; if a real element has focus the native key goes first and the ring takes over only if focus did not move.
- Back: leaves HTML fullscreen (`document.exitFullscreen()`, never touches Edge's own kiosk fullscreen), then the service's own back control if the page has one, else `history.back()`. YouTube TV gets Escape first. On the launcher Back does nothing.
- `open` returns at once: the state is broadcast with the new `app` immediately, the TV overlay says "Opening <name>", Edge navigates in the background (a newer open cancels the previous; a repeat of the same service within 8 s is ignored).

## Overlay additions (Go -> page)

```
__tv.show("opening", {name})
__tv.pointer(x, y, visible) -> {h:0, e}   // x,y = newest TARGET; the dot eases to it (requestAnimationFrame + 40 ms timer fallback, exponential, tau 50 ms); e: entered a new clickable thing (haptic tick)
__tv.ptr() -> {tx,ty,px,py,on}            // target and drawn position (tests)
__tv.focusInfo(), __tv.activeId(), __tv.modalOpen(), __tv.modalClose()
__tv.nav("up|down|left|right"|"") -> bool   // spatial-nav ring (amber, 4 px); "" shows it on the element nearest the middle
__tv.navOk() -> bool                    // script-click the ringed element (Go prefers navTarget + a real click)
__tv.navTarget() -> {x,y}|null, __tv.navActive() -> bool, __tv.navClear()
__tv.lamps() -> {lit, n, target}        // test aid: lit lamps in the rail
```

## Point extras (tunable constants)

- PC (`internal/input`): `EdgeBand` 6%, `EdgeDwell` 250 ms, `EdgeMaxSpeed` 38 wheel px per 16 ms (speed rises with depth into the band; vertical and horizontal, only while Point is held), `MagnetGain` 1.0 (no slowing), `MouseEvery` 66 ms (real mouse moves ~15 Hz while pointing, plus one on release), `HoverEvery` 120 ms, `FlingDecay` 0.94 per tick, `FlingStop` 30 px/s.
- Phone (`remote.js`, "Point extras"): `REST_TILT/REST_MOVE/REST_MS` (flat and still for 1.5 s freezes the pointer), `SWIPE_START/SCROLL_K/FLING_MIN/FLING_K`, `DOUBLE_TAP_MS/SHORT_TAP_MS`, `SHAKE_ACC/SHAKE_N/SHAKE_WINDOW`.

## Stopping and testing

- `tvmode.exe -quit` (or `POST http://127.0.0.1:8770/api/quit` with header `X-TVMode: quit`, loopback only) closes Edge with `Browser.close`, waits for it (up to 12 s) so cookies are flushed, then exits. Never force-kill msedge.
- `TVMODE_BISECT=overlay,ext,autoplay,ua,poll` (environment) switches those pieces off at start, to find what a site dislikes. `-test` makes a page URL containing `tvmode-app=<id>` count as that service (smoke tests only).

## Launcher rows (rewritten 2026-11-04 to match the code; occasion fields added)

- `/ws/screen` (launcher only, never phones): `{"t":"rows","hero":{"all":[..],"movie":[..],"tv":[..]},"cont":[cardItem],"shelves":[shelfFrame]}` on connect and whenever Continue watching, the TMDB rows, the up-next lookup or the clock change. `img` and `thumb` are `/img/<hash>`: Go registered the source (TMDB image CDN or a page og:image) and serves it from a disk cache; the page cannot ask for any other address. Fields are only ever added; the page ignores ones it does not know.
- `shelfFrame`: `{id, title, titles:[all,movies,tv], why, line?, items:[cardItem]}`. `id` is a row name (`fy`, `new`, `because`, ...) or, for a themed shelf, `occ-<node>` (`occ-diwali`, `occ-late-night`). At most two `occ-*` shelves are sent: one calendar shelf (festival, day, season) right after "Because you watched", one moment shelf (clock, week) after "For you". On an `occ-*` shelf `why` is the node's name ("Diwali week", so a card's stage kicker reads `ON NETFLIX · DIWALI WEEK`) and `line` is the node's one-sentence why ("Big, bright and for the whole house.").
- `cardItem`: `{key, title, service, kind, img, ord, why, year, vote, votes, pct, i, line, occ}`. On a themed shelf `occ` is the node id and `line` its sentence; the page shows `line` under the title.
- `heroFrame` (`hero[mode]` is a list: Continue first, then Up next, then at most one occasion slide, then picks): `{k, service, title, sub, over, img, thumb, key, kind, year, genres, vote, votes, why, pct, left, stopped, i, kick, occ, se, ep}`.
  - `k:"cont"`: Continue watching (`i` indexes the history list).
  - `k:"next"`: Up next, the episode after one he finished (`kick:"UP NEXT"`, `sub:"S1 E4  ·  name"`, `se`/`ep` say which). OK sends `openitem` with `k:"item"`, `key`, `se`, `ep`, `a:<service>`.
  - `k:"pick"`: a pick. With `kick` set (`"DIWALI WEEK"`) and `occ` (`"diwali"`) it is the occasion slide: the kicker reads `DIWALI WEEK · NETFLIX`, `why` is the node's sentence, the picture is the title's own. Without `kick` the page uses its own words ("Tonight's pick").
  - The page no longer rotates the hero by itself; the stage moves only when he moves.
- Launcher -> Go: `{"t":"openitem","k":"cont","i":N}` reopens a history entry; `{"t":"openitem","k":"item","key":"movie123","a":"netflix","se":1,"ep":4}` opens a title (se/ep optional); `{"t":"sig","key":..,"k":<row id>,"a":"dwell"|"detail"|"liked"|"disliked"|"unrated"}` teaches the taste model and, for rows starting `occ-`, the occasion engine (`occasions-learned.json`). `{"t":"more","key":<row>,"i":page}` asks for more of a row. `/api/preview?i=N` and `/api/title`, `/api/search`, `/api/episodes` are loopback JSON as before.
- Occasions (HUB-DIRECTION section 3): the engine runs inside every `rows` build against the clock, so each push is current; a ticker re-sends the rows on the hour (and 00:01). `TVMODE_FAKE_NOW=2026-11-06T21:30` (environment, read in one place, logged as `occasion: FAKE NOW ...`) moves the clock for the engine, the 120-day "new" window and "stopped at" lines. Dates: embedded table 2026-2028 (`internal/occasion/dates.json`, with a source per year), Dev's own `%APPDATA%\TVMode\occasions.json` overrides it, a keyless public ICS refresh is cached in `%LOCALAPPDATA%\TVMode\cache\occasions-<year>.json`; a lunar date nobody knows leaves that node off.
- TMDB credentials (`%APPDATA%\TVMode\tmdb.json`) are read only in `internal/tmdb`, sent only to api.themoviedb.org, never logged or sent to a page. Keyword ids are cached in `cache\keywords.json`. History: `%APPDATA%\TVMode\history.json` (12 titles, fed by the poll loop from the page title, URL and the playing video; Netflix in Chrome has no page access and is not recorded).

## Standby and start (built 2026-11-04, both sides)

For the state "the PC agent is connected to the relay but TV Mode (Edge, launcher, overlay) is not running":

```
PC -> phone:  {"t":"standby"}                 // sent after "ok" instead of "state"
phone -> PC:  {"t":"start","id":".."}         // the big Start TV button; acked like any press
```

- Shutdown from the Start TV screen: `{"t":"power","a":"arm|cancel"}` is handled in standby too (`standbyGate`): the same 1 s hold on the phone, the same 10 s countdown on the PC. Standby phones get no `state` frames, so the countdown travels as `{"t":"standby","countdown":N}` once a second, then a plain `{"t":"standby"}` when it is cancelled (and in the first frame a phone gets after reconnecting mid-countdown). A standby frame that carries a countdown never triggers the auto-start.
- The phone shows a full-screen "TV Mode is not running" view with one Start TV button (and, under a rule, a Power ring that must be held for one second). Any `state` frame (or `nopc`) hides it. The button is disabled for 20 s after a tap so it cannot double-fire; the PC should also ignore a second `start` while starting.
- On `start` the PC acks, launches TV Mode, then sends `state` as usual.
- Remote page, app shell: `/remote/sw.js` (scope `/remote/`) caches the shell for an instant open (network first, 3 s, cache fallback). It ignores `/relay/` and caches nothing but static files. The page can be opened as `/remote/?act=playpause` (the installed app's Play / Pause shortcut): after the first `state` the phone sends one `{"t":"media","a":"playpause"}` and strips the parameter.

### Standby on the PC, exits, screen on/off (PC side built 2026-11-04)

- `tvmode.exe -standby` joins the relay with no Edge and no screen. After auth (and on every reconnect) a phone gets `{"t":"standby"}` instead of `state`; everything except `ping` and `{"t":"start"}` is ignored. `start` launches Edge and the launcher in the same process, then phones get `state`. A second `tvmode.exe` (the desktop shortcut) finds port 8770 busy and POSTs `/api/start` (header `X-TVMode: start`, loopback only) to the running one, then exits; if the TV is already up Edge is brought to the front. `-standby` while something already runs just exits.
- Exits: `{"t":"exit"}` (More: "Close TV screen") and Esc on the PC close Edge gracefully (CDP `Browser.close`) and go back to standby, phones get `standby`. `{"t":"exit","a":"quit"}` (More: "Turn off TV Mode") quits the whole program; `tvmode.exe -quit` does the same. Without `-standby` both end the program. Nothing reopens the TV by itself: the Edge watchdog relaunches only after a crash (non-zero exit code, and not within 20 s of the last launch); a clean exit (user closed the window with Alt+F4) is treated as Close TV screen. Log lines: `exit: close screen`, `exit: turn off`, `watchdog: relaunch after crash`.
- Screen: `{"t":"screen","on":false|true}` (acked) turns every monitor EXCEPT the TV (`-display`, which is never touched) off or on: "Desk screen" in More. PC first tries DDC/CI power (VCP 0xD6: 0x04 standby, 0x05 off, 0x01 on, state read first); if the monitor does not answer it puts a borderless topmost black window over it (per monitor) and sends `{"t":"error","msg":"Screen dark (this monitor doesn't support power off)"}`. If "on" fails the phone gets "Press the monitor's power button". `state.screenOn` (bool) is false while off. Playback is left alone. Closing the TV screen or quitting turns the monitor back on. Log: `screen: off via ddc|dark`, `screen: on`.
- Windows startup: `TV Mode standby.lnk` in the user's Startup folder runs `tvmode.exe -standby ...`. To remove it, delete that .lnk (Win+R, `shell:startup`) or switch it off in Task Manager > Startup apps.

### Auto-start when the phone opens (2026-11-04, `remote.js`)

Opening the phone page (or bringing it back to the foreground) while the PC is in standby starts the TV by itself: no tap on Start TV.

- An "opening" is armed on page load and on every `visibilitychange` to visible (never in `?demo`). The FIRST `state` or `standby` frame that arrives after that decides it, and uses the arm up: if it is `standby` while the page is visible (and within 30 s of the arming) the page sends one `{"t":"start"}` and shows "Starting the TV…" in place of the button text (the same 20 s disable as a tap). A `state` frame as the first frame just disarms.
- So a reconnect while the page stays open does not start anything (the WebRTC link flaps about every 20 s and each reconnect gets a fresh `standby`), and neither does the `standby` the PC broadcasts when the desk switches to Desk mode while this page is already open and showing the TV. To start again the phone is closed and reopened, or sent to the background and brought back, or Start TV is tapped.

### Desk mode switch (2026-11-04, `desk.go`, `standby.go`)

Loopback only, `X-TVMode: desk` on the POST, like the other desk writes.

```
POST /api/desk/mode  {"mode":"tv"}    // TV session off: requestStart (202, "starting":true; waits out a close in progress).
                                      // TV session on: Edge is brought to the front (200).
POST /api/desk/mode  {"mode":"desk"}  // close the TV session, keep TV Mode running (back to standby): the desk keeps
                                      // working, phones get {"t":"standby"}. 409 while the TV is still starting.
GET  /api/desk/state                  // {"tv":"off|starting|on|closing","mode":"tv|desk","phone":bool,"standby":bool,"month":n}
POST /api/desk/open  {"where":"desk|tv","k":"svc","svc":"netflix"}   // a whole service: its home page here, or on the TV
```

- `mode` is `tv` while the session is starting or on, else `desk`. `phone` is true while at least one phone session is connected. The desk polls the state every 3 s (there is no push channel for it) and shows "No phone" only after two empty polls in a row.
- `desk` sets a process-wide `deskKeepAlive` flag before closing, and `standbyMode()` (= `-standby` or the flag) replaces `o.Standby` in `runLoop`, `standbyNow` and `exitRequest`. So a TV started without `-standby` also returns to standby instead of ending the program, and the phone's Start TV works afterwards. `{"t":"exit","a":"quit"}` (Turn off TV Mode) and `-quit` still end the program. (A real launch already runs with `Standby` set; the flag covers the other paths.)

## Library, share to TV, Saved (built 2026-11-04, HUB-DIRECTION section 4)

Store: `%APPDATA%\TVMode\library.json` (`internal/library`; a temp path under `go test`, empty in smoke mode `TVMODE_TEST_ROWS`). `history.json` still feeds Continue watching exactly as before; the library records on top. Items: `id` (`tv1396`, `movie27205`, `yt:<11 chars>`, `url:host/path`, or `name:<title>` until TMDB matches it, then it is renamed and the old name stays an alias), `kind` movie|tv|yt|other, `state` watching|finished|saved|dropped, `img` (a SOURCE address, never `/img/<hash>`), plus season/episode/pos/dur/pct, `lastAt`, `lastWhere` tv|desk|phone, `lastSvc`, `source`, `doneAt`, `markAt` (the last state change Dev made by hand). Events (`play|progress|finish|save|drop|open`, capped at 5000): a `finish` is written once per title or episode at pct >= 0.92; progress is one event per five minutes. A series is `finished` only on the last episode of the last season of a show that has ended (checked against TMDB); a movie, video or link finishes at 0.92. Playing again below 0.92 puts a finished or dropped item back to `watching`.

### Library ingest (the fixed contract for phase 4)

Every writer calls one Go function: `func (a *App) libNote(ev LibEvent) (library.Item, bool)` in `internal/app/lib.go`. It never blocks on the network and is cheap per poll.

```
LibEvent {
  type    "play|progress|finish|save|drop|open"   (progress when empty)
  where   "tv|desk|phone"                          (tv when empty)
  svc     "netflix|prime|jiohotstar|youtube"
  source  "tv-poll|netflix-helper|helper|tv-open|desk-reporter|share|desk-open|desk-paste|desk-manual|watchlist"
  key     optional: "tv1396" | "movie27205" | "yt:<id>" when the caller already knows it
  title, show, epTitle, season, episode, pos, dur (seconds), url, img, at (ms, 0 = now), manual
}
```
Identity (no network): `key`, else a YouTube id from `url`, else the alias `name:<normalised title>` (same as `normTitle`), matched to TMDB later in the background (exact title only).

Desk report (phase 4: the TV Mode Helper in Dev's everyday Chrome): the SAME `POST /api/ext/watch` the helper already uses (loopback, `Origin: chrome-extension://`), with `"where":"desk"` added:

```
{"where":"desk","svc":"netflix|prime|jiohotstar|youtube","title":"..","season":1,"episode":4,"epTitle":"..",
 "pos":312,"dur":2710,"playing":true,"ad":false,"url":"https://www.netflix.com/watch/70000001","w":{page snapshot, Prime and JioHotstar}}
```

The PC answers `{"cmds":[]}` at once. A `where:"desk"` report goes to `libDeskReport` only: never to history, the episode book, `a.nf` media state or player commands, and it is not subject to the TV-monitor check. It is dropped unless it is a real video (`dur` > 120 s, `playing` not false, no `ad`) on that service's own https host (YouTube: youtube.com). It becomes a `LibEvent{where:"desk", source:"desk-reporter"}`. Reports without `where` (the TV's window) are handled as before and also reach the library (`tv-poll`, `netflix-helper`, `helper` for Prime and JioHotstar in the Chrome window). Hooks: `noteWatching`, `noteNetflix` (progress), `noteNetflixOpen`, `openItem` (cont and item: `open`), `fillMeta` (title and picture), desk Open here (`where:"desk"`, `desk-open`). The service-only open in `ext.go` (`NoteOpened`) carries no title and is not recorded.

### Phone -> PC (added)

```
{"t":"save","url":"..","title":"..","text":".."}     // from the share sheet: /remote/?url=&title=&text= (manifest share_target, GET). The address is often in text.
{"t":"openitem","k":"lib","key":"<library id>"}      // Play on TV for a saved item (also in standby: it starts the TV first)
```

Both are handled before the standby gate and the input device: a share is saved even when the TV is down. The remote reads and strips `url|title|text` from its address at once, sends `save` after the first `state` or `standby`, and shows "Saving to TV" then "Saved to TV" with a Play on TV button.

### PC -> phone (added)

```
{"t":"saved","ok":true,"id":"yt:..","title":"..","kind":"yt|tv|movie|other","playable":true,"dup":false}
{"t":"saved","ok":false,"msg":"That is not a web link."}
```

Resolver (`libshare.go`, shared with the desk's Paste a link): the host must be youtube.com or youtu.be, netflix.com, primevideo.com, amazon.* with a /gp/video path, hotstar.com or jiohotstar.com, over https. YouTube: oEmbed (no key). A service page: its title from the shared text, else the JioHotstar slug, else the page's own og:title (https only, redirects must stay on that service, 8 s, 256 KB); then an EXACT-title match on TMDB, which makes a TMDB item. No match: a plain link carrying the title. Any other address, and any http one: a plain link, never fetched. `javascript:`, `file:` and addresses with credentials are refused. A second share of the same link changes nothing (`dup`).

### Launcher and desk (added)

- `rows` frame gains `saved:[cardItem]` (empty with fewer than two) and `cardItem.lib`. Only TMDB titles and YouTube videos (the TV can open them), newest first. The page shows a `Saved` row right after Continue watching; OK sends `{"t":"openitem","k":"lib","key":<lib>,"a":<service>}`. `openItem` kind `lib`: a TMDB title goes through the normal `item` path (link book, scouts); YouTube opens `https://www.youtube.com/tv#/watch?v=<id>`.
- Continue watching hides an entry only when Dev marked its title Finished or Dropped by hand and that mark is newer than the entry. With nothing marked the row is as before.
- Desk (loopback only; POST needs `X-TVMode: desk`): `GET /api/library?view=all|continue|watching|saved|finished|dropped` gives `{items:[..],counts:{..}}`; `POST /api/library/state {id,state:finished|dropped|saved|watching}`; `POST /api/library/remove {id}`; `POST /api/library/add {url,title?,text?}`; `POST /api/library/open {id,where:desk|tv,svc?,se?,ep?}`. Dropped teaches the taste model Abandon once per item. Open here opens a TMDB title through the desk's own resolver, a YouTube video's watch page, and a plain link only if it is an http(s) address.

## Phase 5 (2026-11-04)

```
remote -> PC  {"t":"mood","m":"light|gripping|comfort|"}   // sets the mood in force ("" clears); works in standby; clears itself at 05:00
PC -> remotes {"t":"mood","m":"light"}                      // echo to every phone so the three buttons agree
```
- A mood leans tonight's ranking by at most 15 percent (genre match); picks it floats carry `hero[].kick` = `LIGHT TONIGHT`, `GRIPPING TONIGHT` or `COMFORT TONIGHT` (no `occ`). Memory only: nothing is written to disk. The phone keeps the word in localStorage (same 05:00 rule) and sends it again once per connection.
- `rows` frame: a shelf `id:"otd"` ("On this day") after the calendar shelf, only with 4+ titles. Cards from the library say "You finished it a year ago"; classics say "Out this week in 2014". No TMDB calls: classics come from rows already fetched.
- Desk (loopback, X-TVMode on POST): `GET /api/desk/year` (the recap), `GET|POST /api/desk/city {city}` (geocode with Open-Meteo, keep in `%LOCALAPPDATA%\TVMode\cache\weather.json`; empty city = weather off), and `GET /api/desk/state` gains `month`.

### Desk reports: two additions (phase 4)
- Request `final:true`: a pause, end or page-leave report (`playing:false`). Accepted only when the same video was playing within the last 10 minutes; recorded as a position update.
- Reply `desk:bool`: the server tells the helper its window is off the TV (`{"cmds":[],"desk":true}`); the helper then sends desk reports only, and asks again with one TV-style report when its window moves.
