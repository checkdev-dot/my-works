# Calm Home: working notes (start here)

Repo layout: Calm Home overall at the top (`README.md`, `spec/`), device work in `xiaomi-tv/`. This file covers the Xiaomi TV, the only device so far.

# Xiaomi TV

Handoff from the first session (Oct 19–20, 2026). Read this before touching the TV.

## What this is
- **The TV:** Xiaomi MiTV-AXFR2 ("watchmen"), Amlogic T5D, Android 11 / Google TV, 1.5 GB RAM, 32-bit, 1280x720 UI. Owner: a friend of the user. It's **not** the user's TV, so be careful and reversible.
- **Connection:** over Wi-Fi ADB at **192.168.1.50:5555**. Network debugging stays on across reboots.
- **The goal so far:**
  - Debloat reversibly: `pm disable-user`, never uninstall.
  - Replace the ad-heavy home with **Calm Home** (`com.calmtv.home`), a fast, minimal Apple-TV-style launcher.
- **Must keep working:**
  - Streaming apps: Netflix, Prime Video, JioHotstar, SonyLIV, YouTube, YouTube Music, FanCode, Spotify, Crunchyroll.
  - The PS4 on **HDMI 2**.
  - The Xiaomi XMRM-M remote.
  - Google Assistant voice.

## Folder map
- `xiaomi-tv/app/`: the Android app (Java, no Gradle)
  - `src/com/calmtv/home/*.java`, `res/`, `assets/wallpapers/` (12 photos + CREDITS.txt), `AndroidManifest.xml`
  - `build.ps1`: aapt2 → javac `--release 8` → jar → d8 → zipalign → apksigner. Output: `build/CalmHome.apk`.
  - `keystore/calmhome.jks` (not in git; its password goes in the `CALM_KEYSTORE_PASS` environment variable). **Keep it.** Without it, updates need an uninstall, which loses settings.
- `spec/` (repo root): machine-readable UI spec for a future Samsung (Tizen) version. Regenerate with `node gen.js`; output is `calm-ui-spec.json`.
- `tools/` (repo root, **not in git**; re-download on a new PC, see README): `jdk` (17), `sdk` (platform android-30, build-tools 34.0.0), `platform-tools` (adb). All paths in the scripts are relative.
- `xiaomi-tv/backup/` (kept locally, not in git): the original package state and a log of every change.
- `xiaomi-tv/restore.ps1`: puts the TV back to stock (re-enables apps, removes Calm Home, resets appops/settings, gives HOME back to launcherx, waits, syncs, reboots).
- `xiaomi-tv/tv-audit.ps1`: 40-check audit bot (debloat state, smoothness, memory).
- `docs/screenshots/`: a few screenshots for the README. Raw test captures, videos and audits are kept locally, not in git.

## Build and install (PowerShell, from `xiaomi-tv/app`)
```
.\build.ps1
..\..\tools\platform-tools\adb.exe connect 192.168.1.50:5555
..\..\tools\platform-tools\adb.exe install -r --no-incremental build\CalmHome.apk
..\..\tools\platform-tools\adb.exe shell cmd package compile -m speed -f com.calmtv.home
```
- The first time a **new PC** connects, the TV shows "Allow USB debugging?". The **user** must accept it on the TV (tick "Always allow"). Don't accept it on their behalf.
- Always use `--no-incremental`: incremental install fails with "not enough space".
- Screenshots: `adb shell screencap -p /sdcard/x.png` then `adb pull`. Never redirect binary output in PowerShell.
- Measure smoothness with `dumpsys gfxinfo com.calmtv.home` and key presses sent from **one** `adb shell "..."` string. `input` starts a JVM per press, so "high input latency" flags are mostly an artefact; trust "deadline missed" and "Slow UI thread".

## Hard rules (learned the hard way)
1. **Never disable `com.google.android.apps.tv.launcherx` or `com.mitv.tvhome.atv`.** It causes a boot loop.
2. **Before any reboot**, run `sync` and wait about 25 s. Settings changes are lost if the TV restarts within about 10 s.
3. **Never use accessibility key filtering** (`FLAG_REQUEST_FILTER_KEY_EVENTS`). Filtered keys lose their repeat count, which breaks hold-to-seek and double-tap-to-mute on volume.
4. **Remote app buttons need these two kept as they are:** `com.xiaomi.mitv.partnercustomizer` enabled, and launcherx allowed in the background.
5. **Ask the user before:**
   - disabling any app they might use,
   - downloading files,
   - rebooting,
   - changing a system or account setting.
6. **GitHub:** this lives in the user's personal `my-works` repo.
7. **Don't do these yourself; the user does:**
   - type passwords (e.g. Wi-Fi),
   - accept consent dialogs,
   - change privacy settings (they turned Location on themselves so the Wi-Fi name shows).
8. **Don't build anything that gives Calm Home shell/ADB-level access to its own TV** (a "self-ADB helper"). It was attempted and stopped. Not an option.
9. **No root.** None exists for this model: bootloader locked, `ro.oem_unlock_supported=0`.
10. **What the ROM blocks:**
   - Apps can't close launcherx or PatchWall (`killBackgroundProcesses` returns "Invalid packageName").
   - Shell can't disable other apps' components ("Shell cannot change component state").
   - The Home button always starts launcherx first; HomeWatcher redirects to Calm Home.
11. **Optimisation is the top priority:**
    - animate only transform/opacity,
    - no shadows or blur on moving views,
    - no layout work per key press.

## How Calm Home works (key classes)
- `HomeActivity`:
  - **Top section:** greeting with the name in bold at the left; clock, date and weather/AQI at the right; Wi-Fi chip; For you circles.
  - **Dock:** one straight row moved as a single piece. The focus spot sits one app in from the left. Ends clamp; holding a key stops at the ends; a fresh press past "More" jumps back to the start.
  - **Landing:** focus starts on the app after PS4.
  - **Library:** `LibraryPanel` is a page *below* Home in the same window. Down slides both pages together (420 ms).
  - **Shelf:** a full-width shade at the bottom, the shelf peek cards, and the "All apps" capsule.
  - **Idle stages:** dim after 10 s, quiet after 30 s.
- `HomeWatcher` (accessibility service, events only, no key filter):
  - redirects launcherx to Calm Home;
  - PatchWall button → Crunchyroll (debounced, with a verify loop; Back returns Home);
  - grid button → Library;
  - PS4 auto-switch rules in `Ps4Switch` (rules 1–12: no prompt on service restart, rest-mode guard, 10-min cooldown);
  - boot cleanup (`Apps.quietTrim(force)` at 90/150 s; unverified, logs didn't show it working);
  - `takeOverIfStockHome()`: on service start, if Google TV/PatchWall is already in front, go Home. This fixed a reboot bug.
- `Apps`: app list cache (volatile, lock-free invalidate), memoised recents (UsageEvents), dock order, PS4 entry.
- `Weather` (Open-Meteo + air quality, ipwho.is), `Greeting`, `Tile`, `Carousel` (centred mode, `glide()`), `Emph` (bold key words), `WifiBars` (Wi-Fi fan icon), `Volume`/`VolumeStepper`, `SelfHeal` (re-binds the service).

## State at handoff
- **Performance (warm):**
  - home navigation p90 ~12 ms, p99 13–24 ms;
  - Library open p90 ~16 ms, p99 21–24 ms;
  - PSS ~67–74 MB;
  - idle: 0 frames.
- **Strict audit score:** 87%. The ceiling is set by the ROM (launcherx/PatchWall memory) and by the full-colour photos, which were kept on purpose because 16-bit colour showed banding.
- **After a cold boot the TV is slow for 3–4 min** (load up to ~33). Cause: the TV's own apps auto-start; this can't be stopped without root. Tip for the owner: use standby.

## Open ideas / next steps
- **Samsung 65":** Tizen can't host a replacement launcher. The plan is either a Tizen web app (UI only), or an Android/Google TV box on HDMI running Calm Home (recommended). The spec is in `spec/`.
- **Verify the boot cleanup** on the next real reboot (look for `am_kill ... kill background` in `logcat -b events`).
- **The user's remaining no-root ideas:** Quick Start/standby; Google TV "Apps only mode" (user sets it); a one-time force-stop of rarely used apps from the PC (needs the user's app list).
