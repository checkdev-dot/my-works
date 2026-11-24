# tvmode (PC side)

One Go binary: serves the launcher, keeps a connection to the relay for the phone remote, drives Edge over DevTools, sets Windows volume, keeps the screen awake, handles shutdown and the sleep timer.

## Run (dev)

```
go run ./cmd/tvmode -web ./web -windowed
```

Flags:

| flag | default | meaning |
|---|---|---|
| `-web` | `./web` | folder with `launcher/`, `remote/`, `overlay/overlay.js` (served from disk) |
| `-dry-run` | `true` | shutdown only logs "would shut down". Real shutdown needs `-dry-run=false` |
| `-windowed` | `false` | 1600x900 window instead of fullscreen |
| `-display` | `0` | monitor index (0 = primary, 1 = next) |
| `-overlay` | `<web>/overlay/overlay.js` | override the injected overlay file |
| `-profile` | `%LOCALAPPDATA%\TVMode\edge-profile` | Edge profile folder |

Port `8770`: loopback gets the launcher, `/overlay.js`, `/ws/screen`, `/api/pair`, `/api/pair.png`; the LAN gets only `/remote/`, `/fonts/`, `/vendor/`, `/relay/` (the dev fallback when no public origin is set). Edge debug port: `127.0.0.1:9333`.

## The phone path

The remote page and the relay live on a public HTTPS origin (`relay/`, Cloudflare Workers, free). Set it once in `%APPDATA%\TVMode\config.json` as `"remote": "https://tvmode.<account>.workers.dev"` and restart. The PC joins its relay room; the phone scans the QR, proves the token, and control runs over a WebRTC data channel (direct, LAN) with the relay as fallback. See PROTOCOL.md.

With `remote` empty the PC serves the same page and relay itself over plain LAN HTTP (`http://<lan-ip>:8770/remote/`): fine for development, but not a secure context (no gyro, no home-screen install) and Chrome on new Android may refuse LAN addresses altogether.

Files: `%APPDATA%\TVMode\config.json` (`token`, `relayKey`, `remote`, `aimGain`, `padGain`, `invertYaw`, `invertPitch`, `youtubeUA`, `everPaired`). Old `ca.*` / `server.*` files from the certificate era are unused and can be deleted.

Nothing is installed system-wide. First run may trigger the Windows firewall prompt: allow Private networks (WebRTC needs inbound UDP on the LAN; without it the remote still works through the relay).

## Tests

`TVMODE_E2E=1 go test ./internal/app -run TestPhonePath -v` starts the servers (no Edge screen), drives a headless Edge as the phone against the dev origin, and checks: relay join, token proof, WebRTC data channel open ("direct"), ping/pong, relay-only ping, and a bad token rejected. Needs TV Mode stopped (port 8770).

## Spike harness

`go run ./cmd/spike` runs the app against a throwaway web folder in `%TEMP%\tvmode-spike` and prints pass/fail. Safe to delete.

## Not built yet

Tray icon, embedded `web/` for release.

## Standby at Windows startup

`TV Mode standby.lnk` in the Startup folder runs `tvmode.exe -standby` (no Edge, no screen, relay only); the phone's Start TV button or the desktop shortcut brings the TV up. To remove it, delete that .lnk (`shell:startup`) or turn it off in Task Manager > Startup apps.
