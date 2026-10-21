// Shared facts for the Calm Home UI spec: the current Android build (Xiaomi 27") and the
// Samsung 65" Tizen target. Units: "dp" = Android density-independent px on the Xiaomi
// (960x540 dp canvas, 1.333 px/dp at 1280x720); "css" = CSS px on Tizen's 1920x1080 web viewport.

// Xiaomi canvas is 960 dp wide; Tizen web viewport is 1920 css px wide -> 2.0 css/dp keeps the
// same proportions. A 65" set is watched from further away (~3 m vs ~1.6 m) but is 2.4x bigger,
// so the same proportions look ~1.3x larger to the eye. Scale content down to 0.85 of
// proportional to show more apps while staying glanceable: 2.0 * 0.85 = 1.7 css per dp.
const CSS_PER_DP = 1.7;
const css = (dp) => Math.round(dp * CSS_PER_DP);

const platform = {
  current: {
    device: "Xiaomi MiTV-AXFR2 (watchmen), 27-inch-class panel driven at 1280x720 UI",
    os: "Android 11 (Google TV, launcherx), Amlogic T5D, 1.5 GB RAM, 32-bit userspace",
    app: "Native Android APK com.calmtv.home (Java, no Gradle: aapt2 -> javac --release 8 -> d8 -> zipalign -> apksigner)",
    canvas_dp: [960, 540], px_per_dp: 1.333,
    role: "Default HOME activity + accessibility service (HomeWatcher) redirecting stock launchers",
  },
  target: {
    device: "Samsung 65-inch-class 4K TV (3840x2160 panel)",
    os: "Tizen (web apps run in the TV's Chromium-based web engine)",
    app: "Tizen Web Application (.wgt): HTML + CSS + JavaScript, config.xml manifest",
    viewport_css: [1920, 1080], device_pixel_ratio_note: "Web UI is laid out at 1920x1080 CSS px; ship image assets at 2x (3840x2160) for the 4K panel",
    css_per_dp: CSS_PER_DP,
    viewing_distance_m: [2.5, 3.5],
    role: "Regular app (opened from Samsung's Smart Hub / app bar). It cannot replace the Samsung home screen.",
  },
  tizen_capabilities: {
    can: [
      "Full-screen HTML/CSS/JS UI with hardware-accelerated CSS transforms and opacity",
      "Launch other installed apps by Tizen app ID (tizen.application.launch / launchAppControl) - IDs must be verified on the actual TV",
      "Receive arrow/OK/Back plus registered optional keys (tizen.tvinputdevice.registerKey: media keys, colour keys, numbers)",
      "Fetch network data (weather/AQI) with the internet privilege; read network state via the systeminfo/network APIs",
      "Store settings and history locally (localStorage / IndexedDB / Tizen filesystem)",
      "Run as a developer-signed app on your own TV via Developer Mode + Tizen Studio certificate",
    ],
    cannot_or_restricted: [
      "Replace the Samsung home screen or Smart Hub (no third-party default launcher)",
      "Intercept the Home, Source or Samsung app-shortcut buttons on the remote",
      "Disable, debloat or force-stop other apps or system services",
      "Read other apps' usage history (no UsageStats equivalent) - Calm Home keeps its own launch log",
      "Switch HDMI inputs or read HDMI connection state without partner-level privileges (tvwindow / tv input APIs are partner-only on retail TVs) - treat as unavailable and fall back to opening Samsung's Source menu guidance",
      "Draw system-wide overlays (no volume stepper over other apps)",
    ],
  },
};

// Every value below is read from the Android source at the time of writing.
const current_layout = {
  canvas: { width_dp: 960, height_dp: 540, safe_x_dp: 48, safe_bottom_dp: 40 },
  regions: [
    { id: "top_left", contents: ["greeting", "greeting_note", "wifi_chip"], align: "left edge at safe_x" },
    { id: "top_right", contents: ["clock", "date", "weather_row"], align: "right edge at width - safe_x; ink-aligned via trailing-space correction" },
    { id: "divider", contents: ["hairline 1dp, gradient 0x00FFFFFF-0x33FFFFFF-0x33FFFFFF-0x00FFFFFF"], y: "24dp below the lower of the two top columns" },
    { id: "for_you", contents: ["label 'For you, right now' / 'Recent'", "3 round app bubbles 56dp, gap 20dp"], align: "left at safe_x, 18dp below divider" },
    { id: "hero", contents: ["focused app name 24sp regular", "detail 14sp, key words emphasised"], align: "left at safe_x, bottom = safe_bottom + glass_h - 8" },
    { id: "dock", contents: ["one straight row of 16:9 tiles 128x72dp, gap 16dp", "'More' tile last"], focus_spot_dp: "safe_x + (tile_w + gap) from the left" },
    { id: "shelf", contents: ["full-width gradient from the bottom edge, tinted with the photo's colour"], height_dp: "glass_h + safe_bottom + 190" },
    { id: "edge_fades", contents: ["110dp gradient at both dock ends"], },
    { id: "shelf_peek", contents: ["up to 14 mini 16:9 cards 56x32dp, gap 12dp, half off the bottom edge, alpha 0.55"] },
    { id: "all_apps_capsule", contents: ["'All apps' 11sp medium + chevron", "dark capsule radius 13dp, hairline edge"], bottom_dp: 27 },
    { id: "library_panel", contents: ["page below Home in the same window: rail + A-Z sections"], transition: "both pages translate together 420ms" },
  ],
  type_scale_sp: {
    greeting_name: { size: 28, weight: "bold" }, greeting_phrase: { size: 20.7, weight: "light", note: "0.74 x name size" },
    greeting_note: 14, clock: { size: 56, weight: "light" }, date: 14, weather: 14, aqi: { size: 14, weight: "medium" },
    wifi_name: { size: 14, weight: "medium" }, wifi_status: 12, change_button: { size: 12, weight: "medium" },
    for_you_label: { size: 13, weight: "medium", letter_spacing: 0.04 }, hero_title: { size: 24, weight: "regular" },
    hero_detail: { size: 14, colour: "0xCCFFFFFF", key_words: "medium + 0xFFFFFFFF" }, tile_caption: { size: 12, weight: "medium", shadow: "r4 dy1 0xF0000000" },
    all_apps: { size: 11, weight: "medium" }, library_title: 28, library_section: 15,
  },
  text_shadow: { radius: 6, dy: 1, colour: "0xE6000000" },
  components: {
    wifi_chip: { height_dp: 46, radius_dp: 26, padding_dp: [16, 0, 7, 0], icon: "Wi-Fi fan, dot + 3 arcs lit by level 0-4, 19x15dp", parts: ["name", "green/red dot + Connected/Not connected", "ghost 'Change' button 28dp, stroke 0x59FFFFFF"], focus: "white fill 0xF2FFFFFF, dark text, Change turns 0xFF2F6FDE, scale 1.04 from the left edge", glass: "same tinted gradient as the dock" },
    tile: { size_dp: [128, 72], radius_dp: 14, focus: { scale: 1.05, lift_dp: -3, interpolator: "Overshoot(1.2) 200ms", ring: "2dp 0xF2FFFFFF, fades in after 150ms over 180ms" }, dim_others: "INVISIBLE/VISIBLE veil 0x24000000 (no relayout)", recent_dot: "5dp white dot under the card when recently used", caption: "name under the focused card" },
    library_tile: { size_dp: [136, 77], columns: 5, gap_dp: 18 },
    bubble: { size_dp: 56, focus: "scale 1.15, lift 3dp, white 2dp ring", reveal: "staggered 120 + 60*i ms, 320ms" },
    hero: { fixed_size_dp: [760, 34], sub_dp: [760, 22], change: "fade + 8dp rise, 180ms, withLayer, skipped if title unchanged" },
    shelf: { colours: "day 0x00/0x80/0xE0 + base, night 0x00/0x99/0xF0 + base", base: "photo average colour, saturation x1.4+0.1, value 0.22" },
    volume_stepper: { size_dp: [60, 304], segments: 20, gradient: ["0xFF5EEAD4", "0xFF60A5FA", "0xFFB794F6"], hide_ms: 3200 },
    ps4_card: { countdown_s: 5, ok: "switch now", back: "stay" },
  },
  dock_behaviour: {
    model: "straight row, moved as one piece (row translationX), focused tile always at the focus spot (one app in from the left)",
    ends: "row clamps so the screen stays full; holding Left/Right stops at the ends; a fresh press past 'More' jumps to the landing tile; Left from the first jumps to 'More'",
    landing: "focus lands on the app after the PS4 tile (never on PS4)",
    left_visibility: "tiles cut off at the left edge get alpha 0 (only full tiles show on the left)",
  },
  motion: {
    page_slide: { duration_ms: 420, curve: "cubic-bezier(0.4, 0, 0.2, 1)", rule: "Home and Library move together, translate only, no layers" },
    dock_glide_ms: 280, focus_lift_ms: 200, ring_settle_delay_ms: 150, ring_fade_ms: 180,
    wallpaper: { crossfade_ms: 1600, settle_zoom: "1.04 -> 1.0 over 2400ms (skipped in quiet stage and right after returning from an app)", rotate_min: 5, rotate_quiet_min: 15, arrival_hold: "wait for 3s without key presses before changing the photo after returning" },
    idle: { dim_after_s: 10, quiet_after_s: 30, quiet_shows: "clock + photo only" },
    all_apps_nudge: "0 -> 4 -> 0 -> 3 -> 0 dp over 1100ms, 900ms after Home appears",
  },
  data: {
    wallpapers: "12 photos 960x540 ARGB_8888 + 64x36 frosted copy, shade baked in (top band, two radial pools full-canvas, bottom band)",
    recents: "UsageEvents 21 days: habit within +-1h of now + recency, memoised 3 min / hour change",
    weather: "Open-Meteo forecast + air quality (us_aqi), ipwho.is location, 30 min cache",
    greeting: "time-of-day headline pools + context notes (AQI, rain, temperature, weekday, habits, PS4 evenings), avoids the last two shown",
  },
  measured_performance_xiaomi: {
    home_nav: "p90 12-14 ms, p99 13-24 ms, 0-2 missed deadlines per 9 moves (warm)",
    library_open: "p90 16 ms, p99 21-24 ms (warm), first open after an app ~61 ms p99",
    memory: "PSS 67-74 MB", idle: "0 frames, 0% CPU",
  },
};

module.exports = { CSS_PER_DP, css, platform, current_layout };
