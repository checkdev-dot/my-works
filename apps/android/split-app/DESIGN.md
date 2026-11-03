---
name: Split
description: A night stadium for shared payments. A gauge counts the debit, keycaps settle it.
colors:
  night: "#0A0C0B"
  cream-paint: "#F2EFE6"
  board-green: "#1B5A45"
  board-green-ink: "#123D30"
  board-ink: "#14130F"
  glow-green: "#2F7D62"
  glow-green-deep: "#1B4D3E"
  sheet-ground: "#121614"
  sheet-ground-alt: "#151917"
  cream-lip: "#8C8A82"
  neutral-tint: "#8A938D"
  owe-red: "#B0413E"
  setup-amber: "#F2C230"
  live-green: "#5BD69A"
  idle-grey: "#6B726E"
  face-ink: "#1B1530"
  group-green: "#1B5A45"
  group-indigo: "#3B3A8F"
  group-teal: "#0E6B73"
  group-plum: "#7A2E5C"
  group-ochre: "#8A5A00"
  creature-orange-a: "#FFB13B"
  creature-orange-b: "#FF6A3D"
  creature-sky-a: "#7CE0FF"
  creature-sky-b: "#3D6BFF"
  creature-pink-a: "#FF8AD8"
  creature-pink-b: "#9B5CFF"
  creature-lime-a: "#B6F36B"
  creature-lime-b: "#1FB58F"
  creature-mint-a: "#9DF5D8"
  creature-mint-b: "#29A3C7"
  creature-lilac-a: "#B9A6FF"
  creature-lilac-b: "#5C7CFF"
typography:
  screen-title:
    fontFamily: "Inter"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: "40px"
    letterSpacing: "-0.9px"
  step-title:
    fontFamily: "Inter"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: "30px"
    letterSpacing: "-0.5px"
  section-heading:
    fontFamily: "Inter"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: "26px"
    letterSpacing: "-0.3px"
  title:
    fontFamily: "Inter"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "22px"
    letterSpacing: "-0.15px"
  title-small:
    fontFamily: "Inter"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "20px"
    letterSpacing: "-0.1px"
  body:
    fontFamily: "Inter"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
    letterSpacing: "0px"
  body-medium:
    fontFamily: "Inter"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "22px"
    letterSpacing: "0.05px"
  meta:
    fontFamily: "Inter"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
    letterSpacing: "0.1px"
  label:
    fontFamily: "Inter"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
    letterSpacing: "0.1px"
  label-medium:
    fontFamily: "Inter"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "16px"
    letterSpacing: "0.4px"
  caps-label:
    fontFamily: "Inter"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: "14px"
    letterSpacing: "0.9px"
  numerals:
    fontFamily: "Inter"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: "1.1"
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  dial-figure:
    fontFamily: "Inter"
    fontSize: "up to 50% of dial height, stepped down to fit the arc"
    fontWeight: 500
    lineHeight: "1"
    letterSpacing: "-0.055em"
    fontFeature: "tnum"
rounded:
  plate: "6px"
  tag: "14px"
  tile: "20px"
  panel: "24px"
  card: "32px"
  card-popup: "28px"
  strip: "36px"
  sheet-top: "32px"
  keycap: "26px"
  round: "50%"
spacing:
  xs: "4px"
  s: "8px"
  m: "12px"
  l: "16px"
  xl: "24px"
  xxl: "32px"
  xxxl: "48px"
  gutter: "24px"
components:
  keycap-primary:
    backgroundColor: "{colors.cream-paint}"
    textColor: "{colors.night}"
    rounded: "{rounded.keycap}"
    height: "56px"
    typography: "{typography.title}"
  keycap-ghost:
    backgroundColor: "rgba(242,239,230,0.16)"
    textColor: "{colors.cream-paint}"
    rounded: "{rounded.keycap}"
    height: "56px"
    typography: "{typography.body}"
  tag:
    backgroundColor: "rgba(255,255,255,0.12)"
    textColor: "{colors.cream-paint}"
    rounded: "{rounded.tag}"
    padding: "8px 14px"
    typography: "{typography.label}"
  tile:
    backgroundColor: "rgba(255,255,255,0.045)"
    textColor: "{colors.cream-paint}"
    rounded: "{rounded.tile}"
  panel:
    backgroundColor: "{colors.board-green}"
    textColor: "{colors.cream-paint}"
    rounded: "{rounded.panel}"
  glow-card:
    backgroundColor: "{colors.board-green}"
    textColor: "{colors.cream-paint}"
    rounded: "{rounded.card}"
  plate-open:
    backgroundColor: "{colors.cream-paint}"
    textColor: "{colors.board-green-ink}"
    rounded: "{rounded.plate}"
    height: "42px"
    width: "92px"
  dock-add:
    backgroundColor: "{colors.cream-paint}"
    textColor: "{colors.night}"
    rounded: "{rounded.round}"
    size: "64px"
---

# Design System: Split

## Overview

**Creative North Star: "The Night Stadium"**

Split is always dark. A near-black ground (Night) is lit by one open warm glow from the top that drifts and breathes; everything that matters glows or stands up off that ground. A shared payment is treated as a scoreboard moment: the debit arrives as one neutral card carrying the paying app's icon, a gauge of fine ticks counts what's owed, and settling is recording a payment. The look refuses the category default of white lists with a green Add button and flat checkboxes (Home screen: `.impeccable/review/g-home.png`).

Density is calm and generous: 24px gutters, big rounded surfaces, one decision card at a time, then people and groups as rows that all read the same way: who, which way the money runs, how much. Depth is tactile, not decorative: raised things stand on a darker lip and sink when pressed. Cream is the only light face, reserved for the primary action and for plates. Inter is the only typeface. People are drawn as gradient creatures with tiny faces.

**Key Characteristics:**
- One open warm glow on Night; neutral, because green now means "owed to you".
- Colour carries meaning only: Owed green and Owe coral for money direction, cream for the one action. Everything else is neutral.
- A raised lip under every raised object (keycaps, plates, tags, slabs); pressable ones sink with a haptic tick.
- Gauge ticks are the recurring mark: the dial arc, section header rules.
- Money still moving is bold and in its direction's colour; money as context is small and muted.
- Brand colour lives only inside a merchant's small icon, never on a card, notification or popup ground.

## Colors

Night, one cream paint, and two money colours. Brands keep their colour inside their 36-44 px icon (user decision, 2026-10-23, after testers found nine colour families on home too many).

### Primary
- **Night** (#0A0C0B): the ground of every screen, and the ink on cream keycaps.
- **Cream Paint** (#F2EFE6): the one light face. Text on Night, the primary keycap, plates, ticks and selected chips, the "Add expense" button.
- **Surface** (#181B1A): the raised neutral card (the To split card, the expense sheet header, popups and notifications).

### Money (the only hues)
- **Owed** (#6FD9A5): someone owes the user. The home dial, "owes you" amounts, "you lent".
- **Owe** (#FF8B7B): the user owes someone. "you owe" amounts, "you borrowed", over-assigned warnings.
- Words always say the direction too ("owes you", "you owe", "settled up"); colour is never the only cue.

### Neutral
- **Sheet ground** (#151716): modal sheets.
- **Glass tints**: white at 4.5% (Tile), 6-9% (text wells), 8-12% (chips, add keycaps). Black at 35-60% for lips.
- **Group badge** (#2B2F2D): one neutral raised square for every group; the icon tells groups apart.
- **Creatures**: the six avatar gradient pairs, each mixed 55% toward warm grey (#8E8A80) so faces tell friends apart without competing with money colours.
- **Muted paint**: secondary text is paint at 86% over its ground. Rules are paint at 22%.

### Named Rules
**The One Glow Rule.** The ground carries a single wide warm radial glow from the top (cream at 10% fading to 3.5%), drifting about 18% sideways and 5% vertically over a 16-second loop and breathing 0.85 to 1.15 over 5.2 s. A touch leaves a soft white glow and one expanding ring.

**The Meaning Rule.** A hue appears only to say which way money runs. Brand colour appears only inside a merchant icon (the installed app's icon, or a lettered square in the brand colour). Groups, cards, popups and notifications are neutral.
## Typography

**Display Font:** Inter (bundled Regular, Medium, SemiBold, Bold, ExtraBold)
**Body Font:** Inter
**Label/Mono Font:** Inter, with tabular figures (`tnum`) wherever money appears

**Character:** One family, a fixed role scale. Big text tightens, small text opens up, and light-on-dark text sits slightly looser than Material defaults so it keeps its shape.

### Hierarchy
- **Screen title** (ExtraBold 800, 34/40, -0.9): "Split" on home.
- **Step title** (Bold 700, 24/30, -0.5): onboarding and sheet steps.
- **Section heading / card title** (Bold 700, 20/26, -0.3): merchant name on a payment card, group name.
- **Title** (SemiBold 600, 17/22, -0.15): person name, row title, primary button label.
- **Title small** (SemiBold, 15/20): tab-like keycap labels.
- **Body** (Regular, 16/24): body copy, ghost button label. **Body medium** (15/22) for captions under the dial.
- **Meta** (Regular, 13/18): metadata under a title ("HDFC · 4:43 pm").
- **Label** (SemiBold, 14/20): tags, chips, text buttons.
- **Caps label** (SemiBold, 11/14, +0.9): small caps names on plates (person first name over a plate) and the "LEFT TO ASSIGN" bar.
- **Numerals** (Bold 700, tabular, -0.02em, line 1.1): amounts on plates, tiles, cards and the popup; the rupee sign steps down to SemiBold at 0.78em so the number leads.
- **Dial figure** (Medium 500, tabular, -0.055em): the big amount inside the gauge. Sized to the chord inside the ticks (at most half the dial height, stepping down for long amounts); the rupee sign sits at 0.32 of that size, raised, at 75% alpha.

### Named Rules
**The Money Rule.** Money still moving is bold and bright: Numerals Bold in full paint, or the dial figure at full paint. Money that is context is small and muted: Meta or Body size in muted paint ("owes you", "to come back", "Their share"). A figure never changes weight to signal state; state is carried by plate form.

**The One Family Rule.** Inter for every word and figure in the app. Hero amounts are Inter, not a display or system face.

## Layout

One home, no tabs: title bar with the setup/Alerts keycap, the open scoreboard on the ground, then PEOPLE (two stacks of faces, owed to you and owed by you, opening a searchable sheet), GROUPS (the one or two most-used as cards, every group as a small circle), then waiting payments. A round "+" dock stays bottom right, 64px, 24px from the corner; it is always round, never a labelled pill, so it never covers an amount (`g-home.png`, `i-home.png`).

The spacing scale is fixed and every gap is one of: 4, 8, 12, 16, 24, 32, 48. Screen gutter is 24px. Section headers are 28px tall. Cards inside sheets use 16-22px internal padding. Sheets are modal bottom sheets with 32px top corners and a small grabber.

Responsive: designed and tested at desktop-width phone sizes only; horizontal rows (person tiles, group circles, group chips) scroll rather than wrap.

## Elevation & Depth

Depth is a hybrid of a physical lip and a coloured glow. There is no generic drop shadow. A raised object is a face standing a few pixels above a darker lip of the same shape drawn only below the face (the face's own area is cleared so translucent faces never look muddy). Brand cards additionally carry a brand-coloured ambient glow (28dp shadow in the brand colour); the home dock carries a 24dp shadow.

### Shadow Vocabulary
- **Keycap lip** (lift 4px, radius 26): lip is face darkened 45% toward black, alpha at least 0.55; face has a vertical gradient from +16% white to face and a 1px top highlight border (white 50% fading out).
- **Small keycap lip** (lift 3px): checkboxes, add buttons, tab keycaps, tags; lip black at 50%.
- **Slab** (depth 5px default, 6px on cards): the same lip for whole surfaces; lip is the ground darkened 70% toward Night, or black at 55% for tiles.
- **Plate** (lift 3px, only when open): lip is plate darkened 45%.
- **GlowCard glow** (28px, ambient and spot in the brand colour).

### Named Rules
**The Shared Lip Rule.** Every raised thing stands on a darker lip: keycaps, plates, chips, tags, cards. Tappable ones sink onto the lip when pressed; non-tappable ones only stand.

**The Sink Rule.** Pressing translates the face down by the lift (spring, bouncy, high stiffness) and fires a light keyboard-tap haptic on touch; primary actions fire a firmer confirm haptic on the action.

## Shapes

Generous, soft, nested. Corner radius steps down with importance: 36 (small strip), 32 (GlowCard, group card), 28 (popup card), 24 (Panel, record rows), 20 (Tile, text wells, person slabs), 14 (Tag), 6 (plates, like tin number plates). Buttons are near-pills (26px), checkboxes and add keycaps are circles (18px at 36px), the dock is a circle, switches are 56x32 pills. Merchant icons use a 25% radius; group badges 30%. People are soft creatures: round, tall pill, soft triangle, squircle or tilted diamond, never a photo or circle crop.

## Components

### Surface tiers
- **GlowCard** (32 radius): the payment you must decide. Radial gradient centred at 50%/32%: lightened brand at the centre, brand at 38%, brand toward Night 55% at 78%, 82% at the edge; faint dot grid every 7dp (white at 5.5%, 10% on light boards); 1px white 14% border; brand glow shadow. One on screen; the popup, the split sheet header (`g-sheet.png`) and the home deck use it.
- **Panel** (24 radius): status you glance at. Flat vertical gradient from 30% to 16% tint over Night, 1px tint border at 28%. Status, setup, settings, records.
- **Tile** (20 radius): one editable list row. White 4.5% fill, 1px white 8% border; with an accent, 10% fill and 35% border.
- **Deck**: waiting payments stack, newest in front, up to two behind at 6% smaller and 25% dimmer each, 14dp apart.

### Keycaps (buttons)
- **Primary** (56px high, 26 radius): cream face, Night or board-ink label, confirm haptic. **Ghost**: translucent face of the board's paint at 16% (white 38% on light boards), black lip. Disabled at 50% alpha.
- **Round answers** (52px, popup strip): close on translucent, check on cream.
- **TickKey**: 36px round checkbox keycap; checked takes the accent and shows a check, unchecked is white 10%.
- **Selected chip keycap**: cream face with the grey lip (#8C8A82); unselected is white 8% with black lip (`g-sheet.png` group chips).
- **KeySwitch**: a 56x32 groove with a keycap knob that slides on a spring; on is cream, off is a dark groove (`f-alerts-top.png`).

### Plates
A hung tin number plate; state is form, not colour. Solid cream with a lip is open; outlined is reminded; struck through is settled (the strike draws left to right in 320 ms and the figure dims to 60%); a thinner outline at 70% alpha is your own share (the code draws it solid, not dashed). Radius 6, minimum width 92 (64 in records), Numerals Bold. When the value changes the plate flips about its top edge (110 ms down, 140 ms back) like a scoreboard number.

### Tag and section header
- **Tag**: a small fact on a raised plate (14 radius, label type, top-lit white wash, 3px lip), not pressable: "You owe ₹650", "3 waiting".
- **Section header**: spaced-caps title (+1.6), then a rule of gauge ticks (every 6dp, every fifth taller, fading to the right), ending in the count on a small paint-coloured plate (6 radius, Night numerals) and an optional round add keycap.

### Gauge (signature component)
**AmountDial**: 61 ticks across a half-circle (long 14dp every fifth, short 8dp, round caps 1.4dp); ticks up to the progress are lit at 85%, the rest at 18%; a 2dp needle sits at the progress and stays inside the tick band so it never crosses the figure. When the amount changes the figure counts to the new value in whole rupees over 650 ms while the needle sweeps, with a clock-tick haptic for each sixth of the dial crossed. **RingGauge**: 36 ticks in a full ring, lit up to progress over 700 ms, for status panels. **TickBar**: the same ticks as a linear bar in group cards.

### People and groups
- **Avatar creature**: shape (5), face (4: calm, smile, sleepy, little o) and gradient pair (6) all from a hash of the lowercase name, so a friend always looks the same. Soft white highlight upper left; ink #1B1530 face. Each blinks on its own 3.2-5.6 s loop; a tap squishes it (scale to 0.82 in 90 ms then a springy return, pivoting at the base). Faces stack overlapping for owe-you rows.
- **Group badge and icon**: a soft square (30% radius) in the group colour, gradient from +22% white through colour to colour darkened 35% toward Night, 1px white 20% border, with a rounded Material icon in cream at 55% of the badge, or the initial in Inter Bold when none fits. Twelve icons (home, football, racket, cricket, trip, food, cafe, movie, party, work, ride, grocery) are guessed from keywords in the name and changeable.
- **Merchant icon**: the real app icon read from the installed package; a lettered plate in board colours when not installed.

### Popup and notification
- **Popup**: a GlowCard (28 radius) dropped from the status bar edge over whatever is open, with merchant, bank and time, a Numerals 34 amount and three keycaps (Not shared, Later, Split). **Small strip** (36 radius): amount at Numerals 28, name, and two 52px round keycaps. It enters with a vertical spring (damping 0.62, stiffness 380) plus fade, leaves on its own once the payment is handled elsewhere, and is dismissed outside the card without blocking the app behind (`g-popup.png`).
- **Notification**: a branded expanded layout (merchant icon, name, bank, large centred amount, hint) with three actions: Split, Later, Not shared. Its text is currently set in a system condensed face, a known departure from the One Family Rule that is not part of this system.

### Inputs
Soft filled wells (20 radius): white 6% unfocused, 9% focused, no outline until focus, then a 1-2px accent border, cursor and label in the accent. Placeholder cream at 62%, label at 72%.

### Motion and reduce-motion
- Count-up dial and needle sweep (650 ms); flip plate (250 ms); strike (320 ms); row stagger in the split sheet (45 ms per row, capped at the sixth, each fading in over 280 ms); spring popup entrance; keycap sink springs; avatar blink and squish; the breathing ground; ripple ring on touch (900 ms).
- **Reduce motion** (animator duration scale 0): dial and needle snap to value, plates swap without a flip, strike appears instantly, avatars do not blink or squish, the ground holds still and touches leave no trail, the live dot stays solid.

## Do's and Don'ts

### Do:
- **Do** keep Night (#0A0C0B) as the ground and light every screen with the single green glow.
- **Do** step surfaces down by importance: GlowCard (32) for the one decision, Panel (24) for status, Tile (20) for rows.
- **Do** put a darker lip under every raised surface; make tappable ones sink with the haptic tick.
- **Do** build any brand ground through `Board.from` so small text passes 4.6:1, and take secondary text as the paint at lower strength.
- **Do** show open money in Numerals Bold at full paint, and context money small and muted.
- **Do** use gauge ticks for new progress or rule marks (same 6dp rhythm, every fifth taller, fade out).
- **Do** use only the spacing scale (4, 8, 12, 16, 24, 32, 48) and the 24px gutter.
- **Do** carry state in plate form (solid, outlined, struck, dashed), not in hue.

### Don't:
- **Don't** return to white lists, a green Add button or flat checkboxes.
- **Don't** add a second wash, coloured blobs or extra gradients to the ground.
- **Don't** use a second typeface, or set hero amounts in a display face.
- **Don't** use a brand colour for a ground without the contrast-darkening step, or use grey for text on a brand ground.
- **Don't** put a GlowCard on a record or list row; one glow card decides, rows stay Tile or Panel.
- **Don't** let the dock become a labelled pill; it covered amounts on first load.
- **Don't** use photos or circle crops for people; creatures only.

## Declutter rules (2026-10-23)

- Every list is lines on one quiet panel (white 3%, 1px white 5% border, 24 radius), separated by 6% hairlines: people, groups, To split, activity, who's in. No per-item boxes.
- Section labels are small caps with a count and an optional "+ Add" text button. No tick rules, no count badges, no keycap "+".
- Type roles: hero figure; screen title 24-26; row name 15 semibold with its amount at 16; secondary 13; section label 11-12 caps.
- The "On Split" tag shows on a person's own screen and in the people picker, not on home lines.
- One-tap split: when the same shop was split before, the line and the popup say who with and how much each, and Split saves at once with Undo; Change opens the sheet.


## Home pages (2026-10-23)

Home is three swipeable pages, Groups ← Home → People, with a three-word tab row under the title whose short bar follows the swipe. Home opens in the middle and stays short: the summary, the top 3 people and top 2 groups, each ending in an "All … ›" line that slides to its page, then To split. The People and Groups pages each have a search box, quick filter chips (People: All, Owe you, You owe, On Split, Settled; Groups: All, You're owed, You owe, Settled) and the full list as lines on one panel.

