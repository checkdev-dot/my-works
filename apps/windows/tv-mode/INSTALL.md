# Install TV Mode

A first-time walkthrough, start to finish. Every step says **where** to do it, **what** to do, **what happens**, and **how to tell it worked**.

Allow about an hour, most of it waiting for logins and downloads. You can do it by hand, or hand this file to Claude Code (see [Set it up with Claude Code](#set-it-up-with-claude-code)).

**How to read the marks.** Steps marked **(verified in code)** were checked against the source in this folder. Anything marked **(not verified)** comes from the way these tools usually behave and could not be confirmed from the code here. Treat those as the first place to look if something differs.

Commands are for **PowerShell** unless said otherwise. `<repo>` means the folder that holds this file, for example `C:\Users\you\tv-mode`.

---

## 0. The order, and why

1. Get the requirements (so nothing stops you halfway).
2. Build `tvmode.exe` (the program).
3. Deploy the phone remote and relay to Cloudflare (this gives you the web address the phone uses).
4. Write `config.json` and `tmdb.json` (so the first run already knows that address and your TMDB key).
5. Load the Chrome helper (so Netflix, Prime and JioHotstar can be controlled).
6. First run on the right monitor, pair the phone, sign in to each service.
7. Make it start with Windows, add the desk shortcut.

The order matters: the web address from step 3 goes into a file that step 6 reads. If you run TV Mode first, it makes its own `config.json` and you edit it later, which also works but needs a restart.

---

## 1. Requirements

| You need | Why | Check it |
|---|---|---|
| Windows 10 or 11 | TV Mode uses Windows APIs (monitors, volume, shutdown) | `winver` |
| A second monitor or a TV on the PC | the "TV" screen | Windows Settings, System, Display, shows two screens |
| **Go 1.27.0** (what `go.mod` says: `go 1.27.0`) | builds `tvmode.exe` | `go version` prints `go1.27.0` or newer |
| **Node.js** | gives you `npx`, which runs Cloudflare's `wrangler` tool | `node -v` prints a version |
| **Google Chrome** | Netflix, Prime Video and JioHotstar play here, with the helper | installed normally |
| **Microsoft Edge** | the launcher and YouTube run here (Edge comes with Windows) | installed normally; the code looks for it at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` **(verified in code)** |
| A free **Cloudflare** account | hosts the phone remote and the relay | sign up at cloudflare.com |
| A free **TMDB** API key | fills the launcher's rows with titles and posters | see step 4 |
| An **Android phone with Chrome** | the remote | an iPhone is **untested**: the page asks iOS for motion permission, but nobody has run it end to end |
| Accounts for the services you use | each person signs in themselves, in the TV window. **Never share a password with anyone, including a helper or Claude Code.** | |

Not verified: the minimum Node.js version that `wrangler` needs. A current LTS release is the safe choice.

If the PC is on a work or school network that blocks WebRTC or Cloudflare, the phone may not connect. Home Wi-Fi is the tested case.

---

## 2. Get the code and build `tvmode.exe`

**Where:** PowerShell.

**Do:**

```powershell
git clone https://github.com/checkdev-dot/my-works.git
cd my-works\apps\windows\tv-mode
go build -ldflags '-H windowsgui' -o tvmode.exe ./cmd/tvmode
```

**What happens:** Go downloads the libraries in `go.mod` (the first build takes a minute or two) and writes `tvmode.exe` in this folder. `-H windowsgui` makes a program with no console window, which is what you want when it starts at login.

**It worked if:** `tvmode.exe` exists in the folder (about 20 MB) and the command printed no error. **(verified: this exact command builds from a clean copy.)**

**Important, and not obvious:** TV Mode serves the launcher and phone pages **from the `web` folder on disk**. It does not embed them. So `tvmode.exe` must be started with `-web` pointing at the `web` folder in this repo (the shortcuts below do that). Keep the repo where it is, do not move only the `.exe`. **(verified in code: `-web` defaults to `./web` relative to where it starts.)**

---

## 3. Deploy the phone remote and relay to Cloudflare

The phone needs a public **HTTPS** address for the remote page. HTTPS is what makes the phone's motion sensors and "Add to Home screen" work. The relay on the same address is the fallback path when the phone cannot reach the PC directly. **(verified in `relay/wrangler.toml`, `relay/worker.js`.)**

### 3a. Log in to Cloudflare

**Where:** PowerShell, in the `relay` folder.

**Do:**

```powershell
cd relay
npx wrangler login
```

**What happens:** `npx` may ask to install `wrangler`; say yes. A browser tab opens on Cloudflare asking you to allow Wrangler. **You** click Allow. Do not give anyone else your Cloudflare password.

**It worked if:** the terminal says you are logged in. `npx wrangler whoami` shows your account. **(not verified: exact wording.)**

### 3b. Deploy

**Do:**

```powershell
npx wrangler deploy
```

**What happens:** Wrangler reads `wrangler.toml`. It uploads `worker.js`, creates a Durable Object class named `Room` (one room per PC) and uploads the `web` folder as static files. The first time, Cloudflare may ask you to pick a `workers.dev` subdomain. **(not verified: that prompt.)** The worker is named `tvmode`.

**It worked if:** the output ends with a line like

```
https://tvmode.<your-account>.workers.dev
```

**Write this address down.** It is your **remote address**. Open `https://tvmode.<your-account>.workers.dev/remote/` in any browser: you should see the TV Mode remote page, saying it cannot find the PC (that is correct for now).

**Note:** that address is public. Anyone who knows it can load the remote page, but they cannot control anything without the pairing token that only your PC and paired phones hold.

### 3c. Go back to the repo folder

```powershell
cd ..
```

---

## 4. Settings: `config.json` and `tmdb.json`

TV Mode keeps its settings in `%APPDATA%\TVMode` (that is `C:\Users\<you>\AppData\Roaming\TVMode`). **Not** in OneDrive, and never put these files in git: they hold secrets. **(verified in `internal/certs/certs.go`, `internal/tmdb/tmdb.go`.)**

### 4a. Create the folder

```powershell
mkdir "$env:APPDATA\TVMode" -Force
```

### 4b. Tell TV Mode your remote address (`config.json`)

**Where:** `%APPDATA%\TVMode\config.json`

**Do:** create it with this content, using the address from step 3b:

```json
{
  "remote": "https://tvmode.<your-account>.workers.dev"
}
```

In PowerShell (replace the address first):

```powershell
Set-Content "$env:APPDATA\TVMode\config.json" '{ "remote": "https://tvmode.<your-account>.workers.dev" }'
```

**What happens:** on its first run TV Mode reads this, then fills in everything missing: a random pairing `token`, a `relayKey` (it claims your private relay room), and defaults. It writes the full file back. You never edit the token or key. **(verified in code.)**

**It worked if:** after step 6 the file also contains `token`, `relayKey`, `aimGain`, `padGain`, `invertYaw`, `invertPitch`, `youtubeUA` and `everPaired`.

**Do not skip the `remote` line.** If it is empty, the code falls back to a built-in address that belongs to the original author's Cloudflare account (`DefaultRemote` in `internal/app/app.go`). The QR would then point at someone else's worker, not yours. **(verified in code.)** Optional fields: `invertYaw` / `invertPitch` flip the gyro if the pointer moves the wrong way, `aimGain` and `padGain` set pointer speed.

**Edit this file only while TV Mode is not running.** TV Mode rewrites it on start, and a running copy overwrites your edit. TV Mode also keeps a backup copy in `%LOCALAPPDATA%\TVMode\config.bak.json`; if `config.json` goes missing it restores the pairing from there. **(verified in code.)**

### 4c. Get a TMDB key and save it (`tmdb.json`)

**Where to get it:** themoviedb.org. Create a free account, then Settings, then API, and request a key for personal use. It gives you two things: an **API Read Access Token** (a long string starting `eyJ`) and an **API Key** (32 characters). One is enough. **(not verified: TMDB's current page layout.)**

**Where to save it:** `%APPDATA%\TVMode\tmdb.json`

**Do:** create it with **one** of these shapes **(verified in `internal/tmdb/tmdb.go`)**:

```json
{ "readToken": "<your API Read Access Token>" }
```

or

```json
{ "apiKey": "<your 32-character API Key>" }
```

**What happens:** only the Go program reads this file. It sends the key to `api.themoviedb.org` and nowhere else, and never logs it or hands it to a web page.

**It worked if:** after step 6 the TV launcher shows rows of posters. If the file is missing, TV Mode still runs but the log says `launcher: tmdb: no credentials file (recommendations off)` and the rows stay empty. Fix the file and restart TV Mode.

**India note:** the launcher asks TMDB about the **India** region (`IN`) and the occasion rows lean on Indian festivals. This is fixed in the code, not a setting. Elsewhere the rows may be thin. **(verified in code.)**

---

## 5. Load the TV Mode Helper in Chrome

The helper is a Chrome extension. Without it, Netflix, Prime Video and JioHotstar still open on the TV, but the phone cannot seek, change subtitles, skip, or open an episode, and Netflix has no d-pad.

**Where:** Chrome, on the PC.

**Do:**

1. In Chrome's address bar type `chrome://extensions` and press Enter.
2. Turn on **Developer mode** (switch at the top right).
3. Click **Load unpacked**.
4. In the file dialog, pick the folder `<repo>\extensions\netflix-dpad` (the folder that contains `manifest.json`). The folder name says "netflix" for historical reasons; the extension is called **TV Mode Helper**.

**What happens:** Chrome adds a card named **TV Mode Helper**. It can read pages on netflix.com, primevideo.com, amazon.in and amazon.com (video pages only), hotstar.com, jiohotstar.com and youtube.com, and it may talk **only** to `http://127.0.0.1:8770/api/ext/*` (TV Mode on this PC). **(verified in `manifest.json`.)**

**It worked if:** the card is listed and switched on, with no red "Errors" button. The version on the card should match `"version"` in `extensions/netflix-dpad/manifest.json` (2.5.2 at the time of writing). The real proof comes in step 6, when you open a service from the TV.

**Keep these true:**
- Do not move or delete `extensions\netflix-dpad`. Chrome reads it from there each time.
- Leave Developer mode on. Turning it off makes Chrome drop the helper silently.
- Chrome may show a "Disable developer mode extensions" prompt at startup. Choose to keep it. **(not verified.)**

**Updates.** After you `git pull` a newer version: restart TV Mode. When the helper says hello, TV Mode compares its version with the one in `manifest.json` on disk, and if the disk copy is newer it tells the helper to reload itself, once per old version per run. So normally you do nothing. **(verified in `internal/app/extreload.go`.)** This relies on TV Mode being started with `-web` pointing at this repo (it looks for `extensions\netflix-dpad\manifest.json` next to the `web` folder). If a card ever shows an old version, click the circular reload arrow on the card by hand.

**The old `extensions\prime-skip`** is not needed: its logic is in the helper now. Do not load both.

---

## 6. First run

### 6a. Find out which monitor number the TV is

The `-display` flag picks the screen: `0` is the primary monitor, `1` is the next one, `2` the one after. **(verified in `internal/winsys/power_windows.go`: the primary monitor is always first, the others follow in the order Windows lists them.)** If your TV is the second screen, use `-display 1`.

Not verified: how Windows numbers three or more screens. Try `1` first, then `2`. If the number does not exist, the phone shows the error **TV monitor not found** and nothing opens.

### 6b. Run it once from a terminal to see it work

**Where:** PowerShell, in `<repo>` (the folder with `tvmode.exe` and `web`).

**Do:**

```powershell
.\tvmode.exe -web "$PWD\web" -dry-run=false -display 1
```

**What happens:** Edge opens full screen on the TV monitor with the launcher, a QR code appears (because no phone has paired yet), and TV Mode joins your relay room. The first time, Windows Firewall may ask about `tvmode.exe`. **Allow Private networks.** Without it, the phone still works through the relay but not the direct link. **(verified in `cmd/tvmode/README.md`.)**

About `-dry-run=false`: the default is `-dry-run=true`, where the phone's power button only logs and says "Dry run: the PC would shut down now". Leave it at the default while testing if you do not want the PC to shut down. **(verified in code.)**

**It worked if:** the TV monitor shows the launcher with a QR code, and `%APPDATA%\TVMode\config.json` now has a `token` and a `relayKey`.

### 6c. Pair the phone

**Where:** your Android phone, Chrome.

**Do:** point the phone's camera at the QR on the TV and open the link. The link looks like `https://tvmode.<your-account>.workers.dev/remote/#t=...&p=...`. The page keeps the secret part and removes it from the address bar. Then in Chrome's menu choose **Add to Home screen**. **(verified in `PROTOCOL.md`; the Add to Home screen step is a normal Chrome feature.)**

**What happens:** the phone proves it knows the token, the QR disappears from the TV, and the phone shows the remote. The next time, the QR does not come back (`everPaired` is saved).

**It worked if:** moving a finger on the phone's touchpad moves a pointer on the TV.

**If the QR is gone but you need it** (first phone lost, say): on the PC open `http://127.0.0.1:8770/api/pair.png` in a browser. **(verified in `internal/app/server.go`; it only answers from the PC itself.)**

**More phones:** on a phone that already works, tap **More**, then **Add a phone**. It shows a one-time QR and a link. The code works for one phone for 10 minutes, and TV Mode hands the new phone the real token only after it proves the code. A room holds a limited number of signed-in phones; the oldest is dropped when it is full. **(verified in `internal/app/invite.go`, `link.go`.)**

### 6d. Sign in to each service, on the TV

**Where:** the TV screen. Use the phone's touchpad, d-pad and keyboard.

**Do, for each service you have:**
- **Netflix, Prime Video, JioHotstar:** tap the service on the phone or TV. It opens in a **Chrome app window** on the TV monitor. Sign in there. Because these windows use your normal Chrome profile, you may already be signed in if you use Chrome on this PC. **(verified in `internal/extapp/extapp.go`: it opens `chrome.exe --app=...` with no profile flag.)**
- **YouTube:** opens in TV Mode's own Edge window, with its own profile. Sign in there if you want your account. The profile lives in `%LOCALAPPDATA%\TVMode\edge-profile`.

Type your passwords yourself, on the TV window or with the phone's keyboard. Nobody else, including Claude Code, should type them.

**It worked if:** Netflix shows a title list you can move through with the phone's d-pad, the phone's player controls (seek, subtitles) respond while a video plays, and no error banner appears. If the phone says **TV Mode Helper isn't running in Chrome on the PC**, go to [Troubleshooting](#troubleshooting).

---

## 7. Start with Windows, and the desk shortcut

TV Mode has three shortcuts you make yourself. Windows shortcuts are plain `.lnk` files; TV Mode does not create them.

| Shortcut | Where it lives | What it does |
|---|---|---|
| **TV Mode.lnk** | Desktop | starts TV Mode and brings the TV up |
| **TV Mode standby.lnk** | Startup folder (`shell:startup`) | runs in the background from login: no Edge, no screen, only the link to the phone. The phone's **Start TV** button brings the TV up |
| **TV Mode desk.lnk** | Desktop | opens desk mode in your normal browser; starts TV Mode in standby first if needed |

**Where:** PowerShell. Replace the two `<...>` values, then run it. `<repo>` is the full path to this folder and `-display 1` is the number from step 6a.

```powershell
$repo = "<repo>"
$disp = 1
$ws = New-Object -ComObject WScript.Shell
function New-TvLink($path, $args2, $style) {
  $l = $ws.CreateShortcut($path)
  $l.TargetPath = "$repo\tvmode.exe"
  $l.Arguments = $args2
  $l.WorkingDirectory = $repo
  $l.WindowStyle = $style      # 1 normal, 7 minimized
  $l.Save()
}
$common = "-web `"$repo\web`" -dry-run=false -display $disp"
New-TvLink "$([Environment]::GetFolderPath('Desktop'))\TV Mode.lnk"                         $common           1
New-TvLink "$([Environment]::GetFolderPath('Desktop'))\TV Mode desk.lnk"                    "-desk $common"   1
New-TvLink "$([Environment]::GetFolderPath('Startup'))\TV Mode standby.lnk"                 "-standby $common" 7
```

**What each one runs (verified in `cmd/tvmode/main.go`):**
- Desktop: `tvmode.exe -web "<repo>\web" -dry-run=false -display 1`
- Startup: `tvmode.exe -standby -web "<repo>\web" -dry-run=false -display 1`
- Desk: `tvmode.exe -desk -web "<repo>\web" -dry-run=false -display 1`

Keep the exact name **TV Mode.lnk** on the Desktop. TV Mode looks for a desktop shortcut with that name and uses it to re-launch itself properly if it ever finds itself started from inside the Claude desktop app (see troubleshooting). **(verified in `cmd/tvmode/pkg_windows.go`.)**

**What happens:** at your next login, `TV Mode standby.lnk` starts TV Mode with no window. Opening the remote on your phone (or pressing **Start TV**) brings the TV session up in that same process. The desktop shortcut does the same: if TV Mode is already running it just asks it to bring the TV up. Closing the TV screen from the phone goes back to standby, so Start TV keeps working. **More, then Turn off TV Mode** quits it fully; so does `tvmode.exe -quit`. **(verified in `PROTOCOL.md` and `main.go`.)**

**It worked if:** after signing out and in again (or double-clicking the standby shortcut), opening the remote on the phone shows a **Start TV** button, and tapping it brings the launcher up on the TV.

**Desk mode:** double-click **TV Mode desk**. Your normal browser opens `http://127.0.0.1:8770/desk/`, the TV stays off, and the same recommendations are there at your desk. The page only answers from this PC. **(verified in code.)**

**Turn off start-with-Windows:** delete `TV Mode standby.lnk` (press Win+R, type `shell:startup`) or switch it off in Task Manager, Startup apps.

---

## Troubleshooting

**Where the logs are** **(verified in `cmd/tvmode/main.go`)**
- `%APPDATA%\TVMode\tvmode.log`: the current run. `tvmode.prev.log` is the one before.
- `%APPDATA%\TVMode\crash.log`: a crash trace, if there was one.
- `start.log` next to `tvmode.exe`: one line per start, showing which folders it used. It is in `.gitignore`; do not commit it.
- If `%APPDATA%\TVMode` cannot be written, the log goes to `%TEMP%\tvmode.log`.

Open the folder with Win+R and `%APPDATA%\TVMode`.

| What you see | What it means and what to do |
|---|---|
| The phone says **Can't reach TV Mode on the PC** ("It may be asleep or off, or TV Mode is closed") | TV Mode is not running, or the PC is asleep. Wake the PC (move the mouse), then start TV Mode from the **TV Mode** desktop shortcut. In the log look for `relay: joined room`; if it never appears, the PC cannot reach your Cloudflare address. Check `"remote"` in `config.json`. |
| The TV shows, after 20 seconds: **Restart TV Mode from the desktop shortcut** / **TV Mode started without its saved settings** | The PC could not join the relay. Check `config.json` has your `"remote"` and that it was in `%APPDATA%\TVMode` of the same Windows user. Log line: `relay: phone link down for 20 s`. |
| The phone says **Not paired** | The phone does not hold the current token. Open `http://127.0.0.1:8770/api/pair.png` on the PC and scan it, or use **More, Add a phone** from a working phone. If an invite fails with "already used or expired", make a new one. |
| Phone error **`<service>` controls are limited: TV Mode Helper isn't running in Chrome on the PC** (also the phone's "helper is off" note) | The helper never said hello within 25 seconds of the window opening. In Chrome, open `chrome://extensions`: is **TV Mode Helper** present, switched on, Developer mode on, no errors? Press its reload arrow, close the service window on the TV and open it again. Log line: `ext: no hello from TV Mode Helper 25 s after opening ...`. The helper only runs in your real Chrome profile; if you signed Chrome into a different profile than the one TV Mode opens, load it in that one. **(not verified: which profile Chrome opens when several exist.)** |
| Phone error **TV monitor not found** | The `-display` number does not match a connected screen. Check the TV is on and set as an extended display, then fix the number in the shortcuts. |
| **Chrome is not installed** or the service window will not open | Chrome was not found in the registry's App Paths or in Program Files / LocalAppData. Install Chrome normally, for the current user or all users. |
| Prime Video looks soft | **Prime plays standard definition in Chrome on Windows.** This is a limit of the setup, not a setting you can change here. **(not verified in code; it is a Widevine limit of Chrome.)** |
| A Prime or JioHotstar control does nothing, or the pad looks dimmed | Their pages change often and the helper reads them from outside, so control is best-effort. Netflix is the most solid. Update the helper (`git pull`, restart TV Mode) in case a fix is out. |
| The service did not go full screen | TV Mode presses F11 on its own window once, up to twice. If you click into the window and it exits full screen, press F11 once. Log line: `extapp: window ... fullscreen=false`. |
| Pointer moves the wrong way on gyro | Set `"invertYaw": true` or `"invertPitch": true` in `config.json` (with TV Mode stopped). |
| Launcher rows are empty | `tmdb.json` is missing or wrong. Log line: `launcher: tmdb: ... (recommendations off)`. Check step 4c and restart. |
| Phone page never loads, or "Add to Home screen" is missing | You are on plain HTTP or the wrong address. The remote address must be the HTTPS `workers.dev` one from step 3. |
| Power does not shut the PC down | The shortcut still has `-dry-run=true` (the default) or lacks `-dry-run=false`. The phone says "Dry run: the PC would shut down now". |
| Settings seem to reset after a restart, or two copies of the settings exist | A copy of TV Mode started from inside the Claude desktop app runs in an app package where Windows redirects `%APPDATA%`. Start TV Mode only from the desktop shortcut or the Startup shortcut, never from a terminal inside Claude. TV Mode tries to hand over to `TV Mode.lnk` itself, and merges old redirected data back in. **(verified in `pkg_windows.go`.)** |

**Reporting a problem:** do not paste `tvmode.log` as it is. At start it writes a line `remote: ... pair: <link>` that contains your pairing token, and a line naming your Windows user name and folders **(verified in `internal/app/server.go`, `cmd/tvmode/dirs_windows.go`)**. Cut those lines out first, and add the version from `extensions
etflix-dpadmanifest.json`. If a pairing link was ever posted anywhere, treat it as leaked: stop TV Mode, delete both `%APPDATA%TVModeconfig.json` and `%LOCALAPPDATA%TVModeconfig.bak.json`, write `config.json` again as in step 4b, and start TV Mode. It makes a new token and room, and every phone must pair again. **(follows from `LoadConfig`; not run.)**

---

## Uninstall

**Where:** PowerShell. In this order, so nothing restarts underneath you.

1. **Stop TV Mode.** From the phone: More, then Turn off TV Mode. Or `.\tvmode.exe -quit` in `<repo>`. **It worked if** Task Manager no longer lists `tvmode.exe`.
2. **Remove the shortcuts.** Delete `TV Mode.lnk` and `TV Mode desk.lnk` from the Desktop, and `TV Mode standby.lnk` from `shell:startup`.
3. **Remove the helper.** Chrome, `chrome://extensions`, **Remove** on the TV Mode Helper card.
4. **Remove the phone remote.** Delete its icon from the phone's home screen. Optionally remove the Cloudflare worker: from `<repo>\relay` run `npx wrangler delete`. **(not verified: exact prompts.)**
5. **Delete the settings and data.** This removes your pairing, history and saved TMDB key:
   ```powershell
   Remove-Item "$env:APPDATA\TVMode" -Recurse -Force
   Remove-Item "$env:LOCALAPPDATA\TVMode" -Recurse -Force
   ```
   `%LOCALAPPDATA%\TVMode` holds the Edge profile, the settings backup and the caches.
6. **Delete the repo folder.** Nothing else was installed system-wide.

TV Mode never changed Chrome's own profile. The signed-in sessions in your normal Chrome stay as they were; sign out of services there if you want.

---

## Set it up with Claude Code

If you use Claude Code, open it in this folder and paste the prompt below. It will do the command-line parts and stop at everything that needs you.

> Follow `INSTALL.md` in this folder step by step to set up TV Mode on this Windows PC. Read the whole file first. Do the steps in order and do one step at a time: for each, say what you are about to do and why, run it, and check the "It worked if" line before moving on. Write down the Cloudflare address and the monitor number you learn, and use them in later steps.
>
> **Stop and ask me** whenever a step needs a person: `npx wrangler login` (I click Allow in the browser), getting my TMDB key (I make it and paste it to you, or put it in `tmdb.json` myself), loading the extension in `chrome://extensions` (I do it and tell you when it shows), pairing my phone (I scan the QR), and signing in to Netflix, Prime Video, JioHotstar and YouTube on the TV. **Never type, guess, store or ask me to paste a password.** Do not read, print or paste the `token` or `relayKey` from `config.json` or my TMDB key into this chat or any file in the repo.
>
> **Do not start `tvmode.exe` yourself.** A copy started from inside Claude gets Windows' redirected AppData folders and ends up with a second, split set of settings. When a step needs it running, create the shortcuts from step 7 first, then tell me to double-click `TV Mode.lnk` on the Desktop, and wait for me to confirm. Do not commit anything.
>
> Work only inside this folder, `%APPDATA%\TVMode` and `%LOCALAPPDATA%\TVMode`. Mark anything that does not match INSTALL.md and tell me before you improvise. When done, list each step as done, skipped or needs-me.

**Why it must not start the program itself:** when Claude's desktop app launches a process, Windows redirects that process's `%APPDATA%` and `%LOCALAPPDATA%` writes into the app's own package folder. The pairing, history and library would end up in a second copy of the settings, apart from the one your shortcuts use. TV Mode tries to detect this and hand over to `TV Mode.lnk`, but it is safer never to start it that way. **(verified in `cmd/tvmode/pkg_windows.go`.)**

---

## Things I could not verify from the code

- Cloudflare's and TMDB's current sign-up screens and the exact wording of `wrangler` prompts.
- The minimum Node.js version for `wrangler`.
- Whether Chrome shows a "disable developer mode extensions" prompt on your version, and which Chrome profile opens when you have several.
- That Prime Video is capped at standard definition in Chrome (stated as a limit of the setup; the code only notes that Edge fails Prime with a DRM error here).
- Behaviour on an iPhone, on a PC with three or more monitors, and on non-Indian regions.
- Anything on a Windows version other than 11.
