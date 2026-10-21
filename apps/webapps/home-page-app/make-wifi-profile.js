/*
  Makes wifi.mobileconfig (the iPhone one-tap Wi-Fi profile) from your config.
  Run:  node make-wifi-profile.js
  Reads home.config.local.js if it exists, otherwise home.config.js.
  wifi.mobileconfig holds your real password, so it is in .gitignore.
*/
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const file = fs.existsSync(path.join(__dirname, "home.config.local.js")) ? "home.config.local.js" : "home.config.js";
const sandbox = { window: {} };
require("vm").runInNewContext(fs.readFileSync(path.join(__dirname, file), "utf8"), sandbox);
const H = sandbox.window.HOME;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const uuid = () => crypto.randomUUID().toUpperCase();

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>AutoJoin</key><true/>
      <key>EncryptionType</key><string>Any</string>
      <key>HIDDEN_NETWORK</key><false/>
      <key>IsHotspot</key><false/>
      <key>Password</key><string>${esc(H.wifi.password)}</string>
      <key>SSID_STR</key><string>${esc(H.wifi.ssid)}</string>
      <key>PayloadDisplayName</key><string>Wi-Fi at ${esc(H.flat)}</string>
      <key>PayloadIdentifier</key><string>home.wifi.network</string>
      <key>PayloadType</key><string>com.apple.wifi.managed</string>
      <key>PayloadUUID</key><string>${uuid()}</string>
      <key>PayloadVersion</key><integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key><string>Joins the Wi-Fi at flat ${esc(H.flat)}, ${esc(H.tower)}, ${esc(H.society)}.</string>
  <key>PayloadDisplayName</key><string>Wi-Fi at ${esc(H.flat)}</string>
  <key>PayloadIdentifier</key><string>home.wifi</string>
  <key>PayloadOrganization</key><string>${esc(H.flat)} ${esc(H.society)}</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>${uuid()}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>
`;
fs.writeFileSync(path.join(__dirname, "wifi.mobileconfig"), xml);
console.log("Wrote wifi.mobileconfig for " + H.wifi.ssid + " (from " + file + ")");
