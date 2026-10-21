---
name: 1204 Home
description: A true-black welcome app with one cobalt action colour, white pills, springy Duolingo-style motion, and an always-night illustrated society scene.
colors:
  black: "#000000"
  elevated: "#16181a"
  elevated-2: "#202326"
  white: "#ffffff"
  mute: "#a1a1a6"
  cobalt: "#494fdf"
  cobalt-press: "#3a40c4"
  cobalt-on-dark: "#8f94ff"
  success: "#34c759"
  tick: "#58cc02"
  sky-top: "#1a2b6b"
  sky-bottom: "#4b5cc4"
  far-tower: "#3a4a9e"
  tower-face: "#f1ecff"
  tower-side: "#c9c0f0"
  tower-trim: "#8f84d6"
  window-dark: "#5a64b8"
  window-lit: "#ffd24d"
  home-window: "#ffc800"
  neon-yellow: "#ffd24d"
  billboard-panel: "#0f1640"
  ground: "#1d4a12"
  ground-top: "#2f6f1c"
  road: "#3c3f58"
  canopy: "#58cc02"
  ink-on-white: "#1d1d1f"
  mute-on-white: "#636366"
typography:
  hero:
    fontFamily: "-apple-system, SF Pro Display, BlinkMacSystemFont, Inter, system-ui, sans-serif"
    fontSize: "clamp(34px, 9.6vw, 46px)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  title:
    fontFamily: "-apple-system, SF Pro Display, BlinkMacSystemFont, Inter, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.028em"
  headline:
    fontFamily: "-apple-system, SF Pro Display, BlinkMacSystemFont, Inter, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.28
    letterSpacing: "-0.015em"
  body:
    fontFamily: "-apple-system, SF Pro Text, BlinkMacSystemFont, Inter, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.47
    letterSpacing: "-0.011em"
  subtext:
    fontFamily: "-apple-system, SF Pro Text, BlinkMacSystemFont, Inter, system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "-apple-system, SF Pro Text, BlinkMacSystemFont, Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.47
  button:
    fontFamily: "-apple-system, SF Pro Text, BlinkMacSystemFont, Inter, system-ui, sans-serif"
    fontSize: "16.5px"
    fontWeight: 600
    lineHeight: 1.2
  counter:
    fontFamily: "-apple-system, SF Pro Display, BlinkMacSystemFont, Inter, system-ui, sans-serif"
    fontSize: "clamp(64px, 20vw, 96px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.045em"
rounded:
  chip: "12px"
  tile: "18px"
  card: "20px"
  sheet: "28px"
  panel: "28px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
  4xl: "40px"
  gutter: "20px"
components:
  button-primary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.black}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "13px 20px"
    height: "52px"
  button-cobalt:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "13px 20px"
    height: "52px"
  button-cobalt-active:
    backgroundColor: "{colors.cobalt-press}"
  button-ghost:
    backgroundColor: "{colors.elevated-2}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "11px 14px"
    height: "48px"
  wifi-card:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.white}"
    rounded: "{rounded.card}"
    padding: "20px"
  info-card:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.white}"
    rounded: "{rounded.card}"
    padding: "20px"
  app-tile:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.white}"
    rounded: "{rounded.tile}"
    padding: "12px 4px 8px"
    height: "96px"
  tab-bar:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    height: "64px"
  tab-active:
    backgroundColor: "{colors.white}"
    textColor: "{colors.black}"
    rounded: "{rounded.pill}"
  toast:
    backgroundColor: "{colors.white}"
    textColor: "{colors.black}"
    rounded: "{rounded.pill}"
  sheet:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.white}"
    rounded: "{rounded.sheet}"
    padding: "24px 20px"
---

# Design System: 1204 Home

Source key: **Revolut** = design-sources/revolut.DESIGN.md, **Apple** = design-sources/apple.DESIGN.md, **Duolingo** = the motion and scene-illustration language, **Own** = decided in this build.

## Overview

**Creative North Star: "The Night Society"**

A guest opens a black screen and finds a small lit town: Maple Heights's towers against a navy sky, Tower 3 with one flat window glowing, a neon billboard, Gate 4 with a boom barrier and a car, a delivery scooter. The black canvas is the stage (Revolut), the type and pill buttons are native-feeling (Apple), and everything that is touched bounces, pops or hops (Duolingo). The scene is authored SVG and is always night, because it lives on black. Own.

The UI is calm and almost monochrome: black, two elevated greys, white, and one action colour, cobalt. All colour and playfulness beyond that lives in the illustration and in the motion. Three swipe screens (Wi-Fi, Arrive, Order) on mobile; the same three as side-by-side panels on desktop. A floating frosted pill tab bar doubles as navigation.

**Key Characteristics:**
- True black canvas, elevated greys for cards (Revolut).
- One action colour, cobalt (#494fdf); white pill is the primary on black (Revolut + Apple).
- Pills for every button; 20px cards, 18px tiles (Apple geometry).
- Display 700 with tight negative tracking over a 17px/1.47 body (Apple).
- Every touch has a spring response; completion earns a boing, a pop, then confetti (Duolingo).
- A chunky, flat, slightly isometric night scene on each screen (Duolingo style, Own world).

## Colors

A black field with grey steps, white as the loudest neutral, and cobalt as the single UI voice. The scene carries its own navy-and-gold palette and never leaks into chrome.

### Primary
- **Cobalt** (colors.cobalt): the only action colour. Wi-Fi card face, blue pill, billboard outline, toast icon, "flip back" link, selection. Source: Revolut hue.
- **Cobalt Press** (colors.cobalt-press): pressed state of the blue pill. Own.
- **Cobalt on Dark** (colors.cobalt-on-dark): cobalt icons and the map pin on black cards, where #494fdf is too dim. Own.

### Neutral
- **True Black** (colors.black): canvas, text on white pills, theme-color. Revolut.
- **Elevated** (colors.elevated) and **Elevated 2** (colors.elevated-2): cards, tiles, sheet; Elevated 2 is the tile hover step. Revolut.
- **White** (colors.white): primary pill, active tab glider, toast, QR face, text. Revolut pill, Apple text.
- **Mute** (colors.mute): secondary text on black. Apple. **Ink on White** and **Mute on White**: text on the white QR face only.
- **Success / Tick** (colors.success, colors.tick): copied-state check mark (tick green is Duolingo's). Tick also appears in the scene.

### Scene palette (illustration only)
- **Sky** (sky-top to sky-bottom): vertical navy-to-periwinkle gradient behind every scene. Intro background is sky-top.
- **Towers**: far-tower for the back row, tower-face and tower-side for lit front and shaded side, tower-trim for the roof band and billboard legs, window-dark for unlit windows, window-lit for ~42% of windows.
- **Home window** (colors.home-window): the flat window; pulses between #ffc800 and #fff3b0 (1.8s).
- **Neon** (colors.neon-yellow) on **Billboard panel** (colors.billboard-panel) with a cobalt outline: the MAPLE HEIGHTS sign.
- **Ground, ground-top, road**: dark lawn, lighter top edge, slate road with white dashes.
- **Canopy** (colors.canopy) with #46a302 shade and #89e219 highlight: trees and bushes; the Gate 4 beam and the Tower 3 mark use the same green. Props also use Duolingo-style #1cb0f6 (car), #ffc800 (booth), #ff4b4b (boom), #ff9600 (default scooter box, replaced per tapped app). Duolingo.
- **Cloud** rgba(255,255,255,.18); stars white. Moon is #fff3c4.

### Named Rules
**The One Action Colour Rule.** Cobalt is the only colour that means "do". No second accent in buttons, text or borders. Revolut.
**The Scene Colour Quarantine Rule.** Greens, yellows, reds and oranges live in the illustration, confetti and brand logos only. Never in chrome.
**The Always-Night Rule.** The scene is night on a black canvas. The day palette in scene.js (`?day`) is a dev toggle, not a theme.

## Typography

**Display Font:** SF Pro Display via -apple-system, then self-hosted Inter (400, 600, 700), then system-ui
**Body Font:** SF Pro Text via -apple-system, same fallback chain
**Label/Mono Font:** none; labels are body at 600

**Character:** Apple's native voice on Apple devices, Inter elsewhere. Headings are bold and tightly tracked; body stays open. Apple.

### Hierarchy
- **Hero** (700, clamp(34px, 9.6vw, 46px), 1.02, -0.035em): the one greeting over the Wi-Fi scene.
- **Title** (700, 28px, 1.1, -0.028em): screen titles and the welcome sheet.
- **Headline** (700, 18px, 1.28, -0.015em): the address; Wi-Fi network and password use display 700 at 20-30px.
- **Body** (400, 17px, 1.47, -0.011em): default text.
- **Subtext** (400, 15.5px, 1.45, Mute): supporting lines under titles.
- **Label** (600, 14px, Mute; 12.5-13.5px on chips, card labels, tile names).
- **Button** (600, 16.5px; 15.5px small).
- **Counter** (700, clamp(64px, 20vw, 96px), tabular numerals): the lift floor count in the intro only. Own.

### Named Rules
**The Tight Display Rule.** Every display size carries negative tracking, deepening with size (-0.015em at 18px to -0.045em at the counter).

## Layout

Mobile first. Three full-width scroll-snap screens (`scroll-snap-stop: always`), each a scene band on top and a single column below, capped at 480px with a 20px gutter and 20px gaps (16px on screens shorter than 760px). The band is flexible: `clamp(150px, 30svh, var(--bh))` with per-screen max heights of 300px (Wi-Fi), 230px (Arrive), 150px (Order). The floating tab bar (max 420px wide, 64px tall) sits 12px above the bottom; screens reserve 76px + 20px at the bottom for it. The Wi-Fi card overlaps the scene by -56px (-40px on short phones). From 960px the tab bar disappears and the three screens become equal columns (24px gap, 32px padding, 1440px max) inside 28px-radius panels in #0b0c0d with a 1px white-9% ring. Spacing is a 4px base: 4, 8, 12, 16, 20, 24, 32, 40. App tiles: 3 columns (4 for cab apps and delivery groups, 5 with smaller logos), 8-12px gaps.

Container queries on the band remove scene props when the scene is short: billboard and birds below 250px on Wi-Fi, billboard below 175px on Order; props (guard booth) hide under 380px viewport width.

## Elevation & Depth

Mostly tonal: black, then Elevated, then Elevated 2. Depth beyond that comes from the scene's own layers and from three shadows.

### Shadow Vocabulary
- **Object shadow** (`3px 5px 30px rgba(0,0,0,.45)`): the Wi-Fi card faces. The card also carries an inset 1px white-30% top highlight and a cobalt glow (`0 30px 60px -30px rgba(73,79,223,.75)`) on the front. Apple.
- **Tab bar** (`0 10px 30px -10px rgba(0,0,0,.6)`, inset 1px white-6% ring, rgba(29,29,31,.86) with `backdrop-filter: saturate(180%) blur(20px)`): the floating bar. Apple.
- **Toast** (`0 10px 30px rgba(0,0,0,.4)`) and **sheet** (`0 -10px 40px rgba(0,0,0,.5)`): transient layers only.
- **Frosted chips and help button**: white-14% fill with `blur(10px)`, over the scene only.

### Named Rules
**The Tonal First Rule.** Tiles, info cards and buttons stay shadowless; only the Wi-Fi card, the tab bar, toast and the intro sheet cast shadows.

## Shapes

Round everything that is touched. Pills (9999px) for buttons, chips, tab bar, glider, toast. 20px cards, 18px tiles and hint rows, 12-14px logo squares and pin, 28px sheet top corners and desktop panels. Circles for the help button and wave badge. The scene is flat-filled geometry with small radii (rx 1-8), slightly isometric towers (lit front, shaded side, roof wedge). Revolut pill and card geometry, Apple tile geometry, Duolingo chunky scene shapes.

## Components

### Buttons
- **Shape:** full pill, 52px tall (48px small), text 600.
- **Primary:** white fill, black text. Revolut. **Blue:** cobalt fill, white text, pressed to cobalt-press. **Ghost:** white 10% fill, white text.
- **Press:** `scale(.94)` in .08s, release on the spring ease (.35s). Duolingo.
- **Label swap:** the idle label rises and fades while the "Copied!" label settles in from below at scale .7 to 1 (.4s spring); the button boings (scale 1.07, .97, 1; .5s) and reverts after 2.2s. Duolingo.
- **Focus:** 2px white outline, 3px offset.

### Wi-Fi card (signature)
Cobalt, 1.7 aspect, 20px radius, a radial highlight, faint arcs, an animated 4-bar signal. Idles in a 7s tilt loop, follows pointer/device tilt, lands with a rise-and-sweep (.9s spring), flips 180 degrees to a white QR face. Own.

### Cards, rows and tiles
Elevated fill, no border. Info card 20px radius, 20px padding. Tile 96px, 18px radius, 44px logo in a 13px brand-coloured square; hover rotates the logo -8 degrees and scales 1.08; a tap pops the tile and hops the logo; the name swaps to a green check while copied (4s).

### Tab bar
Frosted pill, three tabs with mask icons, a white glider that slides and stretches up to 1.18x while swiping. Active tab text goes black. On arrival at each tab its icon plays one animation: ping (Wi-Fi), go (Arrive), hop with squash (Order), .7s each. Duolingo.

### Toast and confetti
White pill toast springs up above the bar. When all three steps are done: 80 confetti pieces (#494fdf, #8f94ff, #ffc800, #58cc02, #ff4b4b, #fff) fall for 1.8-3.2s, removed at 3.8s.

### Intro (onboarding)
Full-screen scene on #1a2b6b: stars fade in, a shooting star, towers rise on a spring (1s), trees pop (.6s), then the lift climbs Tower 3 floor by floor (55-165ms per floor, easing slower near the top), each window lighting as it passes, a counter ticking to the flat number, the flat window bursting. A dark sheet then springs up (.75s) asking iPhone or Android. Closing zooms the scene 1.5x and fades it. Own.

### The society scene
Four authored SVG scenes drawn by scene.js into a band per screen: intro (Tower 3 climb), home (skyline behind the greeting, billboard on the middle tower), gate (Gate 4 beam, guard booth, boom barrier, car), road (scooter, billboard, towers). Every scene has sky, stars and moon, clouds drifting (38-64s), birds flapping across, trees swaying (2.6-3.6s, +/-2.5 degrees), twinkling stars, a pulsing home window, a bobbing "9" mark on Tower 3, flickering neon (4s steps). Gate: tapping into the screen drives the car in (3.4s), the boom lifts (-72 degrees, .9s spring), road dashes run, and another car arrives every 6.5s while the screen is in view. Order: the scooter rides off and re-enters (1.2s) on a tap and its box takes the tapped app's colour. A bottom fade to black (56px) joins each band to the canvas. Duolingo style, Own world.

## Motion vocabulary

- **Spring** `cubic-bezier(.34, 1.56, .64, 1)`: any element that arrives, presses or confirms (buttons, tiles, tab icons, sheet, toast, towers, trees, boom). .08s for press-in, .35-.9s for settle.
- **Ease-out** `cubic-bezier(.16, 1, .3, 1)`: large, calm moves (card tilt, scene zoom, intro far towers, tab icon keyframes, scooter).
- **Named moves:** boing (.5s), tilepop and logohop (.55s), swap (.2s fade, .4s spring), rise (.5s), land (.9s), ding (.7s), wave (1.6s x2), burst (1.2s), winpop (1.4s).
- **Loops** are ambient and slow (clouds 38-64s, birds 16-22s, trees 2.6-3.6s, glow 1.8s, card idle 7s, signal bars 1.6s).
- **Reduced motion:** all animation and transition durations collapse to .01ms, confetti is skipped, the card idle is disabled, smooth scrolling becomes instant, the intro jumps straight to the arrived state.
- **Pause what is unseen:** scenes on hidden screens, behind the intro, or on a hidden tab get `animation-play-state: paused`; non-current screens are `inert` on mobile; the drive-in interval does nothing while hidden or in the intro.

## Do's and Don'ts

### Do:
- **Do** use cobalt (#494fdf) as the only action colour; white pill as the primary on black.
- **Do** make every button a pill: 52px primary, 48px small.
- **Do** answer every press with the spring ease; confirm with a label swap and boing.
- **Do** keep the scene always night, flat-filled, and in its quarantined palette.
- **Do** keep scene props clear of text: the greeting sits on a navy scrim, the card overlaps only the empty band floor, and props hide when the band is short (billboard and birds under 250px on Wi-Fi, billboard under 175px on Order, booth under 380px wide).
- **Do** pause hidden scenes, mark off-screen screens inert, and honour `prefers-reduced-motion`.

### Don't:
- **Don't** put scene colours (green, yellow, red, orange) into buttons, text or borders.
- **Don't** add shadows to tiles, info cards or buttons.
- **Don't** add a second accent hue or a non-pill button.
- **Don't** let an ambient loop run on a screen the guest cannot see.
- **Don't** switch the scene to its day palette in the product.

**Not canonized (defects the build carries):** the small chip above the greeting and above the intro counter reads as an eyebrow/kicker; scene text "GATE 4" and the "9" mark ask for Nunito, which index.html never loads (falls back to system-ui); the hero sits at a 9.6vw clamp that was tuned by eye. Future surfaces should not copy these.
