/*
  Placeholder details for the public repo.
  To use this for your own home: copy this file to home.config.local.js (ignored by git),
  put your real details there, then run  node make-wifi-profile.js  for the iPhone Wi-Fi profile.
*/
window.HOME = window.HOME || {
  flat: "1204",
  gate: "2",
  gateRoad: "Main Road",
  tower: "Tower 3",
  society: "Maple Heights",
  greeting: "Welcome to 1204",

  // Full address for delivery apps (pasted into their "flat / house no." + "landmark" fields).
  address: {
    line1: "Flat 1204, Tower 3",
    line2: "Maple Heights, Sector 00",
    city: "Your City, State 000000",
    landmark: "Enter from Gate 2",
  },

  // Short drop point for cab apps (Uber, Ola, Rapido).
  cabDrop: "Gate 2, Maple Heights, Main Road, Your City",

  gateHint: "Enter from Gate 2. It is the closest gate to Tower 3.",

  // The gate's exact map pin: long-press it in Google Maps and copy the two numbers.
  gatePin: { lat: 28.6139, lng: 77.2090 },

  // The people who live here. Guests can call or WhatsApp any of them.
  hosts: [
    { name: "Alex", phone: "+910000000001" },
    { name: "Sam", phone: "+910000000002" },
    { name: "Jo", phone: "+910000000003" },
  ],

  wifi: {
    ssid: "Home_WiFi",
    password: "your-wifi-password",
    security: "WPA", // WPA covers WPA2 and WPA3 in the QR format
  },

  /*
    Apps. For each one:
      share: paste the app's own "share address" link here (see APP-LINKS.md).
             When set, one tap opens the app with your address ready to save.
      web:   fallback when share is empty. The tap copies the address, then opens the app/site.
      kind:  "delivery" copies the full address, "cab" copies the short drop point.
  */
  // All of these deliver to your home. group decides where the tile sits on the Order screen.
  apps: [
    { id: "zomato",    name: "Zomato",           kind: "delivery", group: "food",    share: "", web: "https://www.zomato.com/" },
    { id: "swiggy",    name: "Swiggy",           kind: "delivery", group: "food",    share: "", web: "https://www.swiggy.com/" },
    { id: "zeptocafe", name: "Zepto Café",       kind: "delivery", group: "food",    share: "", web: "https://www.zeptonow.com/" },
    { id: "swish",     name: "Swish",            kind: "delivery", group: "food",    share: "", web: "https://www.google.com/search?q=Swish+food+delivery+app" },
    { id: "instamart", name: "Instamart",        kind: "delivery", group: "grocery", share: "", web: "https://www.swiggy.com/instamart" },
    { id: "zepto",     name: "Zepto",            kind: "delivery", group: "grocery", share: "", web: "https://www.zeptonow.com/" },
    { id: "blinkit",   name: "Blinkit",          kind: "delivery", group: "grocery", share: "", web: "https://blinkit.com/" },
    { id: "bigbasket", name: "BigBasket",        kind: "delivery", group: "grocery", share: "", web: "https://www.bigbasket.com/" },
    { id: "amazon",    name: "Amazon Now",       kind: "delivery", group: "more",    share: "", web: "https://www.amazon.in/a/addresses/add" },
    { id: "flipkart",  name: "Flipkart Minutes", kind: "delivery", group: "more",    share: "", web: "https://www.flipkart.com/" },
    { id: "district",  name: "District",         kind: "delivery", group: "more",    share: "", web: "https://www.district.in/" },
    { id: "urban",     name: "Urban Company",    kind: "delivery", group: "home",    share: "", web: "https://www.urbancompany.com/" },
    { id: "yesmadam",  name: "Yes Madam",        kind: "delivery", group: "home",    share: "", web: "https://www.yesmadam.com/" },
    { id: "uber",      name: "Uber",             kind: "cab", share: "", web: "uber" },   // built from gate4 lat/lng
    { id: "ola",       name: "Ola",              kind: "cab", share: "", web: "https://book.olacabs.com/" },
    { id: "rapido",    name: "Rapido",           kind: "cab", share: "", web: "https://www.rapido.bike/" },
    { id: "maps",      name: "Maps",             kind: "cab", share: "", web: "maps" },   // built from gate4 lat/lng
  ],
};
