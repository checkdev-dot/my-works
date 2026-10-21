# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: single static HTML/CSS/JS page with one plain config file (`home.config.js`), no build step, so it can be dropped on Vercel later as-is. Plus a generated iPhone Wi-Fi profile (`wifi.mobileconfig`) served beside it.

## Users

Guests arriving at (or about to arrive at) flat 1204, Tower 3, Maple Heights, Sector 00, Your City. They open the page on their own phone (iPhone or Android), usually standing at the door or in a cab, wanting two things fast: get on the Wi-Fi, and get the home's address into whatever delivery or cab app they use.

## Product Purpose

One page that does the host's usual "here's the Wi-Fi, here's the address, enter from gate 4" message, but as taps instead of typing. Success: a guest joins the Wi-Fi and gets the address into their app without asking the host anything.

## Positioning

It is this one home's front door, not a generic guest-book: one address, one Wi-Fi, one gate hint, and each app's own native "shared address" link where the host has generated one.

## Operating Context

- Delivery and quick-commerce apps (Zomato, Swiggy/Instamart, Zepto, Blinkit, BigBasket, Amazon Now, Flipkart Minutes, District) let a user who already has an address saved share it as a link; the recipient opens it and the app offers to save it. The host generates these links from their own phone and pastes them into the config.
- Where no share link exists yet, the fallback is: copy the full address, open the app.
- Cab apps (Uber, Ola, Rapido) get a short approximate destination ("Tower 3, Maple Heights, Sector 00, Your City") to copy, plus deep links where they exist (Uber universal link with lat/lng, Google Maps directions).
- Wi-Fi: iPhone one-tap via a configuration profile download; Android one-tap via copy-password + open Wi-Fi settings; a Wi-Fi QR beneath for camera scanning.

## Capabilities and Constraints

- Address: 1204, Tower 3, Maple Heights, Sector 00, Your City 000000.
- Project centre coordinates (OSM): 28.6139, 77.20900. Tower 3 / gate 4 exact coordinates are unverified; config holds a slot for them.
- Hint: enter from Gate No. 4 for the fastest way to the flat.
- Wi-Fi network: Home_WiFi (WPA2/WPA3 personal). Password shown openly with a copy button, per host's decision.
- No website can write into another app; "one click" is only as good as each app's own link support. Must not claim otherwise.
- Hosting: Vercel, later, by the host.

## Brand Commitments

- Greeting: "Welcome to 1204".
- Minimal: welcome, Wi-Fi, address + apps, gate hint. Nothing else.

## Evidence on Hand

No app share links yet: the host must generate them. No photos of the home. Do not fabricate share URLs.

## Product Principles

1. One tap per job; never make a guest type.
2. Be honest about what a tap does (copied vs opened vs saved).
3. Works on a stranger's phone in a lift with patchy data: tiny, no logins, no tracking.
4. The page is the host's voice, warm and brief.
