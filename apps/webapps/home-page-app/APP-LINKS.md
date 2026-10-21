# How each app takes an address, and how to make it one tap

**The short version:** a website cannot type into Zomato or Swiggy. What *can* be one tap is the app's own "share address" link. You make it once from your phone, paste it into `home.config.js`, and the guest's tap opens their app with the address ready to save. Until you paste a link, the tap copies the address and opens the app, so the guest pastes it.

## What a guest's tap does today

| App | Today, with no link pasted | With your share link pasted | Verified? |
|---|---|---|---|
| Zomato | Copies full address, opens zomato.com (opens the app if installed) | Opens Zomato with your address | Share feature: **check in app** |
| Swiggy | Copies, opens swiggy.com | Opens Swiggy with your address | **check in app** |
| Instamart | Copies, opens swiggy.com/instamart | Same as Swiggy | **check in app** |
| Zepto | Copies, opens zeptonow.com | Opens Zepto with your address | **check in app** |
| Blinkit | Copies, opens blinkit.com | Opens Blinkit with your address | **check in app** |
| BigBasket | Copies, opens bigbasket.com | Opens BigBasket with your address | **check in app** |
| Amazon Now | Copies, opens Amazon's "add address" page | n/a, Amazon has no shared-address link I could confirm | Page URL unverified |
| Flipkart Minutes | Copies, opens flipkart.com | Opens Flipkart with your address | **check in app** |
| District | Copies, opens district.in | Opens District with your address | **check in app** |
| Uber | Opens Uber with the drop point **already set** to the Gate 4 pin. Also copies the drop text | n/a | Yes, Uber's documented link |
| Ola | Copies "Maple Heights Gate 4, Sector 00, Your City", opens Ola | n/a, no public link | No deep link exists |
| Rapido | Copies the drop text, opens Rapido | n/a, no public link | No deep link exists |
| Google Maps | Opens directions to the Gate 4 pin | n/a | Yes, Google's documented link |

## Share links (not used)

The apps' own share-address links expire after 24 hours, so the page does not rely on them. Every tile copies the full address and opens the app. If you ever want to try one anyway, the steps below still apply, but expect to refresh it daily.

### Making a share link

**Where:** in each app, open your saved addresses. Usually **Profile → Addresses** (or **Saved addresses**), then the address for flat 1204.
**What to do:** look for **Share** (a share icon, or inside the ⋮ menu next to the address). Share it to WhatsApp "Message yourself" or Notes, then copy the link.
**Where it goes:** open `home.config.js`, find that app's line, and paste the link between the quotes after `share:`. Example:

```js
{ id: "zepto", name: "Zepto", kind: "delivery", share: "https://...the link you copied...", web: "https://www.zeptonow.com/" },
```

**What happens:** the tile's small text changes from "Copies address" to "Adds address", and a guest's tap opens the app with your address.
**Check it:** open the link on a *second* phone (one that is not logged into your account). Some share links expire or only work once. If it fails, clear the `share:` back to `""` and the tile falls back to copy + open.

## Map pin

Set to **Gate 4, Maple Heights** from Google Maps (28.6139, 77.2090; Plus Code XXXX+XXX, Main Road). Uber drops there and Directions leads there. To change it, edit `gate4` in `home.config.js`.

## Hosts

Dev, Sam and Jo are in `hosts` in `home.config.js`. Guests see Call and WhatsApp buttons from the phone icon on the Wi-Fi screen, "Guard asking? Call us" on Arrive, and "Stuck?" on Order. Anyone with the link can see these numbers.

## Wi-Fi

- **iPhone button** downloads `wifi.mobileconfig`. The guest taps **Allow**, opens **Settings → Profile Downloaded → Install**, and enters their passcode. It shows "Not Verified" because it's not signed by a company. Only works from **Safari**; the page tells Chrome users to switch.
- **Android button** copies the password and shows the three steps (Settings → Wi-Fi → network → paste). Android does not let a website join Wi-Fi by itself.
- **QR** works on both: another phone's camera scans it and joins.
- **If you change the Wi-Fi password:** update `wifi` in `home.config.js` **and** the `Password` line inside `wifi.mobileconfig` (one line, near the top).

## True one-tap Wi-Fi on every phone

Android only shows its native **Join network → Yes** prompt when it reads a Wi-Fi code itself: from a camera/Lens scan, an NFC tap, or Quick Share. No website can open that prompt (Chrome blocks it on purpose). So the one-tap routes are:

1. **Door card (iPhone + Android, one tap):** open **https://your-site.vercel.app/card.html** on your laptop → **Print card** (A6). Stick it by the door. Guest opens camera → taps **Join**.
2. **NFC sticker (Android, one tap, no camera):** buy any NTAG215 sticker (~₹50). Install **NXP TagWriter** on an Android phone → *Write tags → New dataset → Wi-Fi* → network `Home_WiFi`, WPA2, the password → hold the sticker to the phone. Stick it by the door. Guest taps their phone on it → **Connect**.
3. **From your own phone:** Android: *Settings → Wi-Fi → your network → Share → Quick Share* to the guest. iPhone to iPhone: when the guest tries to join, your iPhone pops up *Share Password*.
4. **On the guest page itself:**
   - **Android (one tap):** the page shows a big Wi-Fi QR. The guest touches and holds the home bar (Circle to Search), which finds the code by itself and offers **Connect**. Copy-and-paste is the backup.
   - **iPhone:** one tap downloads the Wi-Fi profile *and* copies the password, then the page shows the 3 taps (Allow → Settings → Profile Downloaded → Install). Apple does not let an iPhone join from a QR on its own screen, so the true one-tap is the Camera on the door card.

## Putting it on Vercel

Live at **https://your-site.vercel.app** (project `your-site`). After editing `home.config.js`, publish again from the `guest-1204` folder with `vercel deploy --prod`. `vercel.json` makes iPhones recognise the Wi-Fi profile and keeps the page out of Google; `.vercelignore` keeps these notes and design files off the site. Anyone with the link can see the Wi-Fi password, so share it only with guests.

Handy links: `…/#wifi`, `…/#here` (gate + cabs), `…/#order` (delivery apps) open that screen directly and skip the welcome.
