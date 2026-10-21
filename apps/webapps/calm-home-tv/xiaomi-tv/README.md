# Calm Home on the Xiaomi TV

**Device:** Xiaomi MiTV-AXFR2 (codename *watchmen*)
- Amlogic T5D chip, 1.5 GB RAM
- Android 11 with Google TV
- 1280×720 interface
- Owner: a friend

## The problem

- The TV came with two home screens fighting each other, Google TV and Xiaomi's PatchWall, both full of ads.
- Menus were slow on the weak chip.
- The remote's PatchWall button opened more ads.
- Apps and tracking services ran in the background all the time.

## What was done

**1. Debloat (reversible).**
- 25 ad, tracking and junk apps were *disabled*, not uninstalled: Mi TV+, telemetry, PatchWall channels and the like.
- Every change is logged, and the original state is backed up (both kept locally, not in git).

**2. Calm Home launcher** ([`app/`](app/)), an Android app (`com.calmtv.home`):
- It's the TV's home screen. A small background service switches away from Google's and Xiaomi's home screens whenever they pop up.
- Greeting, clock, weather and air quality, Wi-Fi, For you, the dock, and All apps as a page below Home.
- **PS4 on HDMI 2:** when the console turns on, a card counts down 5 seconds and switches to it. Back cancels.
- **Remote fixes:** the PatchWall button opens **Crunchyroll**, and the grid button opens **All apps**.
- A custom volume bar, real nature photos, and dimming when idle.

**3. Speed work.**
- Home navigation: about 12–16 ms per frame (smooth 60 fps).
- Opening All apps is one smooth slide.
- Calm Home uses about 70 MB of memory and draws nothing while idle.
- A strict code-and-measurement audit scored it 87%. The ceiling is set by the TV's own apps and memory.

## What it can't fix

- **The first 3–4 minutes after a full power-off are slow.** The TV's preinstalled apps (Netflix, YouTube, Prime, Hotstar and others, plus Google's launcher) all start at once. Without root that can't be stopped, and this model can't be rooted.
- **Tip:** turn the TV off with the remote (standby) rather than at the plug.

## Folder contents

| Path | What it is |
|---|---|
| [`app/`](app/) | The Calm Home Android app: Java source, resources, wallpapers, `build.ps1` |
| [`restore.ps1`](restore.ps1) | Puts the TV back to stock: re-enables apps, removes Calm Home, resets settings, reboots |
| [`tv-audit.ps1`](tv-audit.ps1) | 40-check audit: debloat state, smoothness, memory |
| *(local only)* | Backups, walkthrough videos, raw screenshots and audit dumps stay on the PC |

## Build, install, restore

From `xiaomi-tv/app` in PowerShell:
```
.\build.ps1
..\..\tools\platform-tools\adb.exe connect 192.168.1.50:5555
..\..\tools\platform-tools\adb.exe install -r --no-incremental build\CalmHome.apk
```
To put the TV back to stock (from `xiaomi-tv/`):
```
powershell -ExecutionPolicy Bypass -File restore.ps1 -TvIp 192.168.1.50
```
The signing key `app/keystore/calmhome.jks` (not in git; password via `CALM_KEYSTORE_PASS`) must be kept. Without it, updates need an uninstall first, which loses settings.
