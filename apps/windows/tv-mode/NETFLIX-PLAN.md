# Netflix outside TV Mode's Edge (plan)

Why: Netflix fails in any Edge started with `--remote-debugging-port` (even with nothing attached) and plays in plain Edge on the same profile. JioHotstar and the others are fine with the port. So Netflix leaves the CDP browser: it opens in Dev's normal Chrome as an `--app` window on the TV monitor, and TV Mode drives it with Windows `SendInput`, no debug port, no injected script.

Hard rules: never read, copy or write Chrome's profile data; never sign in for Dev; no `--user-data-dir`, no `--remote-debugging-port`; never force-kill Chrome (close with WM_CLOSE only).

## What changes for the user

- Netflix on the phone remote opens a fullscreen Chrome app window over the TV. The launcher (Edge) stays running behind it.
- d-pad, OK, Back, Play, seek, volume, Point, scroll, Type, Home, Sleep and Power all still work; they go through SendInput instead of CDP.
- Lost: the TV overlay bar (volume lamps and the like) and the progress/time readout on the phone while Netflix is up (no page script). Volume is the Windows volume, as now. The phone shows no scrub bar for Netflix.
- Home closes the Chrome window and brings the launcher back.

## Files and functions

### `internal/winsys/sendinput_windows.go` (new)
- `KeyTap(vk uint16, extended bool)` and `KeyCombo(vks ...uint16)`: SendInput keydown/keyup (arrows need the extended flag).
- `MouseMoveAbs(x, y int)`: `MOUSEEVENTF_MOVE|ABSOLUTE|VIRTUALDESK`, coordinates mapped to 0..65535 over the virtual screen.
- `MouseClick(left bool)`, `MouseWheel(delta int32)`.
- `TypeText(s string)`: `KEYEVENTF_UNICODE` per rune.
- `FindWindowByTitle(substr string) (hwnd, bool)`: EnumWindows, class `Chrome_WidgetWin_1`, visible, title contains "Netflix".
- `ForceForeground(hwnd)`: `AttachThreadInput` plus `SetForegroundWindow` (an Alt key tap first if it still refuses).
- `PlaceOnMonitor(hwnd, rect)`: `SetWindowPos` to the monitor rect (uses `winsys.Monitors()`), then F11-less fullscreen by sizing to the rect with no frame (app windows have none).
- `CloseWindow(hwnd)`: `PostMessage(WM_CLOSE)`.

### `internal/extapp/extapp.go` (new)
- `type App struct{ hwnd; cmd *exec.Cmd; ... }`.
- `FindChrome() (path string, err error)`: registry `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe` (also HKCU), then `%ProgramFiles%` / `%ProgramFiles(x86)%` / `%LocalAppData%\Google\Chrome\Application\chrome.exe`. Reads the path only, never the profile.
- `Open(url string, mon Monitor) error`: runs `chrome.exe --app=<url> --window-position=X,Y --window-size=W,H --start-fullscreen` (no profile or debug flags), waits up to 15 s for the window (FindWindowByTitle), ForceForeground, PlaceOnMonitor. If Chrome was already running, the new app window joins it; the window is what we track, not the process.
- `Close()`: WM_CLOSE on the tracked window; `Alive() bool`: IsWindow.
- `Key(name string)`: maps remote names to SendInput: up/down/left/right, ok = Enter, back = Escape (Netflix leaves the player; in browse Alt+Left), playpause = Space, seek ±10 = Left/Right, fullscreen = `f`.

### `internal/services/netflix.go`
- Add `External bool` to `Service` (true for Netflix). Keep the CDP key map and SeekJS as a fallback for a future Edge fix.

### `internal/app` (app.go, nav.go)
- `openApp`: when `s.External`, call `a.ext.Open(...)` instead of `Edge.Navigate`; set `st.App = "netflix"`, `st.Media = nil`; keep the "Opening Netflix" overlay on the launcher until the window is found; on failure send the phone `Could not open Netflix in Chrome` (and `Chrome is not installed` when `FindChrome` fails).
- `pollLoop`: when the active service is external, skip `Edge.Eval`; instead check `ext.Alive()`; if the window was closed by hand, return to `launcher` state.
- `handleRemote` (key, media, vol stays system, tap, scroll, pad, aim, point, text, textkey, recenter, open, home): if `a.external()` route to `extapp`/`winsys`:
  - `key up/down/left/right/ok` -> `ext.Key`; `back` -> Escape then, if the page did not change after 400 ms, Alt+Left; `home` -> `ext.Close()` then `goHome()`.
  - `media playpause/seek` -> Space / Left / Right; `scrub` -> reply `Scrubbing is not available for Netflix. Use the seek buttons.`
  - Point: the pointer is the real Windows cursor. A small `input.Cursor` (same absolute-angle maths and jolt rewind as `input.Controller`, one shared function for target = base + gain x angle) calls `MouseMoveAbs` at 60 Hz with the same exponential smoothing (tau 50 ms) done in Go, because there is no overlay to draw a dot. Cursor hides itself after 4 s idle (move it to a corner pixel and let Windows hide it) and OK = `MouseClick`.
  - `text` -> `TypeText`; `textkey` -> Backspace / Enter.
  - `scroll` -> `MouseWheel` at the cursor.
- `Run`: create `a.ext = extapp.New()`; `Exit`: close the Chrome window with WM_CLOSE first.

### `cmd/smoke`
- `-ext` mode with a harmless page: `TVMODE_TEST_URL_NETFLIX=http://127.0.0.1:8780/extpage?tvmode-app=netflix` (a page that logs keydown, mousemove, click, wheel into the title). Steps: open Netflix from the phone; window found within 15 s and sits on the chosen monitor; send `right`, `ok`, `back`, `playpause`, a Point sweep and a scroll; read the log back from the window title through `FindWindowByTitle`; Home closes the window and the launcher is on top again. Skipped when Chrome is not found.
- Unit tests: key-name mapping, absolute mouse coordinate mapping for several monitor layouts, Chrome path discovery with a fake registry.

## Checks

1. `go vet ./...`, `go test ./...`.
2. Smoke `-ext` on a spare port pair (or after `-quit` of Dev's copy), harmless page only.
3. Real check, by Dev: press Netflix on the remote. Expected: Netflix opens on the TV monitor in a Chrome app window (he is already signed in there), d-pad moves the red focus ring, OK opens a title, Play pauses, Back leaves the player, Home returns to the launcher. If the window opens on the wrong monitor: `Display` in config.
4. No debug port and no `--user-data-dir` on the Chrome command line (check in Task Manager, command line column).

## Risks

- `SetForegroundWindow` can refuse from a background process: AttachThreadInput trick plus Alt tap; worst case Dev clicks the window once.
- SendInput goes to whatever has focus: before every key the code verifies the Netflix window is foreground and re-focuses it, otherwise it drops the key (never types into another app).
- Netflix keyboard navigation on the web is limited (arrows move only in some rows); Point plus OK is the reliable path there.
- Chrome may show a "restore pages" or profile picker: it does not for `--app`, but if it does, that is Dev's Chrome setting.
