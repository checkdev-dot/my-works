# TV Mode

Turn a Windows PC and a second monitor (or a TV plugged into the PC) into a TV that is easier than a TV. Your phone, in its web browser, is the remote.

Four services sit behind one calm launcher: **Netflix, Prime Video, JioHotstar and YouTube**. You lie down, open the remote on your phone, pick something, and it plays on the big screen. No reaching for the mouse or keyboard.

## What it does

**On the phone (the remote, a web page you add to your home screen)**
- **Touchpad.** Slide a finger to move a pointer on the TV, tap to click.
- **D-pad.** Up, down, left, right, OK and Back, for the places where a pad is easier than a pointer.
- **Gyro point.** Aim the phone and the pointer follows.
- **Player controls.** Play and pause, seek, scrub, speed, subtitles and audio, skip intro or ad, volume.
- **Sleep timer** (30 or 60 minutes) and **power**: hold to shut the PC down, with a 10 second countdown you can cancel.
- **Add a phone**: show a one-time QR so a second phone can join. The code works for one phone for 10 minutes.

**On the TV (the launcher)**
- Rows of things to watch, filled from TMDB (The Movie Database) and matched to the services you have.
- **Continue watching**, remembered from what you played.
- **Occasions**: rows that follow the calendar, such as a festival week or a long weekend.
- A QR on first run to pair your phone.

**At your desk**
- **Desk mode** at `http://127.0.0.1:8770/desk/` on the PC: the same recommendations in an ordinary browser tab, while the TV session stays closed.

**The TV Mode Helper (a Chrome extension)**
Netflix, Prime Video and JioHotstar open in Chrome, so a small extension called *TV Mode Helper* lives there. It gives Netflix a proper d-pad, lets the phone control the player on all three services (seek, scrub, speed, subtitles, audio, skip), skips Prime Video ads and intros, records episode links so the Episodes tab works, and tells the launcher what you watch. It talks only to TV Mode on your own PC (`127.0.0.1:8770`): no tracking, no cookies, no remote code.

## How it fits together

```
  Phone (Chrome)  <--- WebRTC, direct on your Wi-Fi --->  tvmode.exe on your PC
        \                                                     |
         \--- a tiny relay on Cloudflare (free) as fallback --/
                                                              |
                          drives Edge (YouTube, launcher) and Chrome (Netflix, Prime, JioHotstar)
                          on the monitor you choose
```

- `tvmode.exe` is one Go program. It serves the launcher, keeps a link to the relay, starts and drives the browsers, sets the volume, keeps the screen awake and handles shutdown.
- The phone page and the relay live on a free Cloudflare Worker you deploy yourself. A public HTTPS address is what lets the phone use its motion sensors and be added to the home screen.
- Nothing is installed system-wide. Settings live in `%APPDATA%\TVMode`.

## Be honest about the limits

- **Windows only** (10 or 11). It uses Windows APIs for monitors, volume, window placement and shutdown.
- **Built for one person's setup.** It was made for one Android phone, one desk monitor and one second screen. Expect rough edges on other setups.
- **India-region assumptions.** The launcher asks TMDB what is streaming in **India** (`IN`), JioHotstar is one of the four services, and the occasion rows lean on Indian festivals. Elsewhere the rows will be thinner or wrong, and JioHotstar may not exist for you. These are fixed in the Go code, not settings.
- **Prime Video plays standard definition in Chrome** on Windows. Full HD from Prime needs a different browser or app than this uses.
- **Prime Video and JioHotstar player control is best-effort.** Their pages change often, and the helper reads them from the outside. Netflix is the most solid; the other two can lose a control after a site update.
- **Netflix, Prime Video and JioHotstar use your everyday Chrome profile.** The TV window is a normal Chrome window with the helper loaded, so you sign in there, in the TV window, yourself. YouTube runs in its own Edge profile.
- **Tested on Android with Chrome.** iPhone is untested. The gyro needs a permission prompt on iOS that the page does ask for, but nobody has tried it end to end.
- **It is not finished software.** The `.md` files in this folder (`PROTOCOL.md`, `HUB-DIRECTION.md` and others) are working notes from the build, kept because they explain why things are the way they are. Some are out of date.
- You need your own accounts for the services. TV Mode never sees your passwords and nobody should share theirs.

## What you need

- A Windows 10 or 11 PC and a second monitor or TV on it
- **Go** (the version in `go.mod`, currently 1.27.0) to build `tvmode.exe`
- **Node.js** for `npx wrangler` (to deploy the phone remote)
- **Google Chrome** and **Microsoft Edge** (both are used)
- A free **Cloudflare** account
- A free **TMDB** API key
- An **Android phone with Chrome**
- Your own accounts for Netflix, Prime Video, JioHotstar, YouTube, as many as you use

## Install

Follow **[INSTALL.md](INSTALL.md)**. It walks through every step, says how to tell it worked, covers troubleshooting and uninstall, and ends with a prompt you can paste into Claude Code to have it do the setup with you.

## What is in this folder

| Path | What it is |
|---|---|
| `cmd/tvmode` | the program (`main.go`, flags, Windows start-up handling) |
| `internal/` | the app: relay link, launcher data, TMDB, browser control, Windows helpers |
| `web/` | the launcher, the desk page, the phone remote and the overlay |
| `relay/` | the Cloudflare Worker (relay and static hosting for `web/`) |
| `extensions/netflix-dpad` | the TV Mode Helper (the folder name is historical) |
| `extensions/prime-skip` | the earlier Prime Video skipper, now ported into the helper |
| `PROTOCOL.md` | how the phone, the relay and the PC talk |
| `PRODUCT.md`, `SHAPE.md`, `DESIGN.md` | what it is for and how it should look |

## Tests

```
go test ./...
node --test extensions/netflix-dpad/test/nav-core.test.js
```

Some tests need Edge or Chrome or a stopped TV Mode (see `cmd/tvmode/README.md`), so a plain `go test ./...` may not pass everywhere.

## Licence

No licence file has been added to this folder yet. The Sofia Sans Condensed font in `web/fonts` is under the SIL Open Font License (see `web/fonts/SofiaSansCondensed-OFL.txt`).
