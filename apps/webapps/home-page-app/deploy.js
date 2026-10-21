/*
  Deploys the live site WITH your real details.
  Run:  node deploy.js
  Vercel skips git-ignored files inside a git repo, and home.config.local.js + wifi.mobileconfig are
  git-ignored on purpose. So this copies the app to a temp folder outside git and deploys from there.
*/
const fs = require("fs"), path = require("path"), os = require("os");
const { execSync } = require("child_process");

const here = __dirname;
for (const f of ["home.config.local.js", ".vercel/project.json"]) {
  if (!fs.existsSync(path.join(here, f))) { console.error("Missing " + f + ". See README: Use it for your own home."); process.exit(1); }
}
execSync("node make-wifi-profile.js", { cwd: here, stdio: "inherit" });

const out = fs.mkdtempSync(path.join(os.tmpdir(), "home-page-app-"));
const skip = new Set([".git", "node_modules", ".impeccable", "docs", "design-sources", ".claude"]);
(function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const n of fs.readdirSync(from)) {
    if (skip.has(n)) continue;
    const a = path.join(from, n), b = path.join(to, n);
    fs.statSync(a).isDirectory() ? copy(a, b) : fs.copyFileSync(a, b);
  }
})(here, out);

execSync("vercel deploy --prod --yes", { cwd: out, stdio: "inherit" });
try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) { /* Windows may still hold the temp folder; it is cleaned up later */ }
console.log("Deployed with your real details.");
