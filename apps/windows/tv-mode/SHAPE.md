# TV Mode: shape brief

Status: shaped 2026-11-03. Visual direction chosen (Aisle Light). Stack chosen (see PRODUCT.md). No code.

## 1. Job and audience

- One user: Dev, lying in bed or on the sofa, a few metres from the desktop monitor, in a dark or dim room, often tired.
- Job: use the monitor as a TV that is easier than a TV. Pick a service, find a show, watch, adjust, and turn the PC off, all from the phone, without getting up or touching the keyboard.
- Mode: Operate, on two surfaces.
  - **Monitor (10-foot screen):** read from across the room.
  - **Phone remote:** used one-thumbed in the dark, eyes mostly on the monitor.

## 2. Outcome and proof

- Success: from lying down, he goes from "TV mode on" to a show playing in under 30 seconds, and never reaches for the mouse or keyboard during a session.
- What is unique here: it is not a new streaming app. It is a calm shell around the four real services he already pays for, plus a remote that knows each one's controls.
- Four services, not three: **JioHotstar, Prime Video, Netflix, YouTube.**

## 3. Selected direction

- **Visual direction: Aisle Light** (chosen 2026-11-03, Impeccable's pick, seed:05ac1970790ac472). The darkened cinema hall: matte black house, backlit row markers, a strip of tiny lamps, one small exit sign. Palette #050505 black, #F2A33A amber, #3A2A14 ember, #E9E4D8 warm white. Sketch: `.impeccable/mocks/decision/aisle-light.html`.
  - Launcher: four tiles as backlit row markers in one row; the focused one lit amber, the rest a faint ember. A lamp strip under the row leads to the lit tile. Status line top-right as the exit sign (time, sleep timer, phone on).
  - Overlays: a lit row marker at the picture's edge, dims after two seconds. The shutdown countdown dims the house lamp by lamp.
  - Remote: black house, backlit letters; buttons dim amber at rest, brighter on press; the d-pad is the lit row; Power is the exit sign, set apart.
  - Signature: the lamp strip, which leads the eye to the focused tile on the monitor and the thumb to Play on the phone.
  - Honest risk: amber on black is where most dark cinema-mode launchers land. The lamp strip has to work as the system (focus, progress, countdown), not as a theatre theme.
  - Build path: code-led (Operate surface, no image generation).
- Structural thesis, fixed now: the monitor shows almost nothing; the phone does almost everything. The launcher is four large tiles and nothing else. Once a service opens, the shell disappears and only comes back as brief overlays.

## 4. Scope and boundaries

In scope:
- **Launcher (monitor):** four large service tiles, one focused at a time, big obvious focus state, a small status line (time, sleep timer if running, phone connected or not).
- **Inside a service:** the service's own website, fullscreen. The shell adds only overlays on top: volume, seek position, the sleep timer, the shutdown countdown, "phone connected / disconnected".
- **Phone remote, one screen:**
  - D-pad (up, down, left, right, OK) and Back. These become keyboard presses inside the service's own interface.
  - Play/pause, seek back and forward (10 s), a scrub bar when the service allows it.
  - Volume up, down, mute (Windows volume).
  - Home: back to the four tiles.
  - Touchpad mode on the same screen, for the moments a site needs a mouse (tap = click, drag = move, two-finger = scroll).
  - **Point mode (gyro + accelerometer):** hold the Point button and aim the phone at the monitor; a large pointer follows the tilt. Let go to freeze it (no drift while the phone rests), press OK to click. Re-pressing Point re-centres from where the pointer is. On the launcher the pointer snaps to the nearest tile; inside a service it moves like a mouse, with smoothing so a shaky hand still lands on a poster. Sensitivity is one setting, not a menu.
  - Type box: text from the phone keyboard is typed into the PC, for search.
  - Power: hold for a second to shut down; sleep timer 30 / 60 min.
  - Haptic tick on every press (Android vibration).
- **Start and exit:** TV mode starts from a desktop shortcut, not on boot. The phone (or Esc) exits back to normal Windows.

Out of scope:
- A custom catalogue or "continue watching" across services. These services don't share their libraries; the remote drives their own interfaces instead.
- Turning the PC on from the phone. A web page served by the PC can't wake it; the remote says "press the power button" when the PC is off.
- Using the phone's hardware volume buttons. A web page can't capture them; volume is on-screen buttons.
- Sleep and restart menus. Power is shut down and the sleep timer only.

Anti-goals: anything that feels like a desktop app on a TV (small text, menus, mouse-first). Anything that needs a second step to do a common thing. A remote that needs looking at to find Play.

## 5. States and ranges

- **First run, pairing:** the monitor shows a QR code. Scanning it opens the remote and pairs the phone with a secret token, so nobody else on the Wi-Fi can control or shut down the PC. Then "Add to home screen".
- **First-run steps that need Dev's hands (once each):**
  - Windows firewall prompt the first time TV Mode runs: allow it on **Private networks**, or the phone can't connect.
  - Edge opens a fresh TV Mode profile: sign in to JioHotstar, Prime Video, Netflix and YouTube once, with the touchpad and type box.
- **Connected / reconnecting:** after the phone screen locks and unlocks, the remote reconnects on its own and says so. The monitor shows a quiet "phone disconnected" if it drops mid-show.
- **PC off or asleep:** the remote says the PC is off and to press its power button.
- **Service not signed in:** the first time, each service shows its own sign-in page. The remote's touchpad and type box handle it once; the browser keeps the login.
- **Netflix "Who's watching?"** and similar profile pickers: handled with the d-pad like any other screen.
- **Shutdown:** hold Power on the phone, then a 10-second countdown on the monitor with Cancel on the phone. At zero, Windows shuts down.
- **Sleep timer:** 30 or 60 min. Time left shows on the phone and in the monitor's status line. A one-minute warning overlay, cancellable from the phone. At zero, it runs the same shutdown.
- **Range:** always exactly four tiles. One phone. One user.

## 6. Interaction and layout

- **Monitor launcher:** four tiles in one row, large enough to read from bed, one focused (scaled up, clearly lit). D-pad moves focus, OK opens the service fullscreen.
- **Overlays:** appear on top of fullscreen video, at the edge, for about 2 seconds after a press, then fade. Never cover subtitles for long.
- **Phone remote:** big targets reachable by one thumb. D-pad in the middle where the thumb rests; the Point button under the thumb's resting spot so aiming needs no grip change; play/pause the largest single button; volume and seek on the sides; power apart from everything and needing a hold, so it can't be hit by accident. Dark ground, so it doesn't light the room. Touchpad and type box open as modes over the same screen, not new pages.
- **Feedback:** every press gives a haptic tick on the phone and a visible change on the monitor within about 100 ms. If nothing can change (no connection), the remote says why.

## 7. Constraints and open checks

Platform:
- Windows 11 desktop. A small local program runs on the PC: it serves the phone remote over home Wi-Fi, presses keys, moves the mouse, sets Windows volume and shuts down.
- The services run in a desktop browser in fullscreen kiosk mode, already signed in.
- Phone: Android, Chrome, no install. A web page added to the home screen.

- Point mode needs the phone's motion sensors, and Chrome only gives those to secure (HTTPS) pages. The remote is therefore a page on a public HTTPS origin that reaches the PC by WebRTC (LAN) with a relay as fallback; the phone never dials the PC's LAN address and installs nothing. One-time setup on the PC side: publish the page and relay (`relay/`, one command, free Cloudflare account) and put the URL in config.json.

To check before building (not facts yet):
- How steady the gyro pointer feels lying down (phone held at an angle, arm resting), and how much smoothing that needs.
- Which browser (Chrome or Edge) plays each of the four at full resolution on Windows. Edge is often the one that gets 1080p or 4K on Netflix and Prime.
- Whether YouTube's TV interface (youtube.com/tv) runs in a desktop browser. If it does, d-pad navigation on YouTube comes free.
- How well arrow keys and Enter move around Netflix, Prime and JioHotstar's websites. Where they don't, touchpad mode covers it.
- Whether the shell's overlays can stay on top of each service's fullscreen player.

Decisions a builder must not invent:
- Any change to the four services or adding more.
