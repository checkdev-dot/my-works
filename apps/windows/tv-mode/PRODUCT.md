# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated (2026-11-03). Dev asked for whatever is fastest, smoothest, most reliable and needs no intervention; chosen by a Fable-model review:
- PC: one Go binary with a tray icon. Drives Edge over the DevTools protocol (keys, pointer, page injection), sets Windows volume, shuts down, keeps the screen awake, relaunches Edge if it dies, reconnects after sleep.
- Screen: real Microsoft Edge, fullscreen (not kiosk), its own profile. Launcher is a local page in the same window. Edge gives the best DRM quality on Windows.
- Overlays: injected into each service page (never an OS window over protected video).
- Remote: a static page on a public HTTPS origin (Cloudflare Workers, free; `relay/`), so it is a secure context on every phone with nothing to install. Control goes over a WebRTC data channel straight to the PC (LAN) when it can, and over a tiny WebSocket relay on the same origin when it cannot. The PC keeps one outbound connection to the relay; nothing on the phone ever dials the PC's LAN address, which Android 17 and Chrome now block. Token in the QR URL, proved by hash, never sent. Chosen 2026-11-03 after Chrome on Dev's phone refused the LAN address outright (see PROTOCOL.md).
- Gyro: orientation deltas at 60 Hz, One Euro filter.
- YouTube: youtube.com/tv with a TV user agent if it still works, else normal YouTube shortcuts.
- Spike first: Go launches Edge, opens Netflix fullscreen, injects an overlay, sends arrow keys, confirms quality.

## Users

One user: Dev, 26, watching alone on his desktop monitor from bed or the sofa, a few metres away, in a dim room, usually at night and often tired. Android phone in hand, Chrome.

## Product Purpose

Turn a Windows PC and its monitor into a TV that is easier than a TV. A simple launcher with four services (JioHotstar, Prime Video, Netflix, YouTube) and a phone remote that navigates inside each, plays, seeks, sets volume, and shuts the PC down.

Success: from lying down, a show playing in under 30 seconds, and no reaching for mouse or keyboard during a session.

## Positioning

Not another streaming app. A calm shell around the four real services he already pays for, with a remote that knows each one's controls: d-pad, touchpad, typing, and a gyro pointer (aim the phone, the pointer follows).

## Operating Context

- Starts from a desktop shortcut, not on boot. Exits back to normal Windows from the phone or Esc.
- Phone pairs once by QR code; the remote is a web page added to the home screen, no install.
- Sessions end in bed: shutdown by hold-to-confirm with a 10 second countdown, or a 30 / 60 minute sleep timer.

## Capabilities and Constraints

Confirmed:
- Four services exactly. Their own websites, fullscreen, already signed in. No custom catalogue.
- Remote: d-pad, OK, Back, Home, play/pause, seek, scrub where possible, Windows volume, touchpad mode, typing box, Point mode (gyro + accelerometer), haptic tick per press.
- Pairing uses a secret token so nobody else on the Wi-Fi can control or shut down the PC.
- Motion sensors need HTTPS on Android Chrome; the remote is served from a public HTTPS origin, so no certificate or trust step on the phone.
- Cannot: wake the PC from off; use the phone's hardware volume buttons.

Undecided:
- Final stack (see Stack).
- Browser per service, pending playback-quality checks.
- Whether youtube.com/tv works in a desktop browser.

## Brand Commitments

Voice: direct, plain English, short sentences. No buzzwords.

## Evidence on Hand

- Shape brief: `SHAPE.md` in this folder.
- No service logos licensed for use; service tiles must not imply any partnership. Service names are factual labels.

## Product Principles

1. **The monitor shows almost nothing; the phone does almost everything.**
2. **Never look down to find Play.** The remote works by thumb and feel in the dark.
3. **Zero intervention.** It reconnects, recovers and keeps working without fiddling.
4. **One step for common things.** Opening a service, pausing, volume, sleep timer: one press each.
