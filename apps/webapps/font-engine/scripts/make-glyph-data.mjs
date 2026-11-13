// Build-time data for the UI, from the real font files:
//  lib/glyph-data.json: { charset: chars all four tiles can draw, presence: { char: dial ids that change that letter on Plain } }
// Run: node scripts/make-glyph-data.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fk = require("fontkit");
const dir = path.resolve("public/fonts");
const open = (f) => fk.openSync(path.join(dir, f));
const fonts = { plain: open("RobotoFlex.ttf"), squarish: open("Saira.ttf"), rounded: open("Nunito.ttf"), feet: open("RobotoSerif.ttf") };

// charset: printable ASCII + Latin-1 + Latin Extended-A that every tile has
const cand = [];
for (let c = 0x20; c <= 0x17f; c++) if (c < 0x7f || c > 0xa0) cand.push(c);
const ok = cand.filter((c) => Object.values(fonts).every((f) => f.hasGlyphForCodePoint(c)));
const charset = ok.map((c) => String.fromCodePoint(c)).join("");

// presence on Plain: does moving one dial from its less end to its more end change this letter's outline?
const D = {
  thick: ["wght", 100, 1000], wide: ["wdth", 40, 151], lean: ["slnt", 0, -10], openings: ["XTRA", 323, 603],
  middle: ["YTLC", 416, 570], tall: ["YTAS", 649, 854], tails: ["YTDE", -98, -305], caps: ["YTUC", 528, 760], contrast: ["YOPQ", 25, 135],
};
const home = { wght: 400, wdth: 100, slnt: 0, opsz: 36, XTRA: 468, YTLC: 514, YTAS: 750, YTDE: -203, YTUC: 712, YOPQ: 79 };
const pts = (g) => {
  const out = [];
  for (const c of g.path.commands) for (let i = 0; i < c.args.length; i++) out.push(c.args[i]);
  return out;
};
const glyphOf = (ch, v) => {
  const f = fonts.plain.getVariation(v);
  const run = f.layout(ch, ["liga", "rvrn", "locl"]);
  return run.glyphs[0];
};
const upem = fonts.plain.unitsPerEm;
const presence = {};
const stats = {};
for (const ch of charset) {
  if (ch === " ") continue;
  const hit = [];
  for (const [id, [ax, a, b]] of Object.entries(D)) {
    const ga = glyphOf(ch, { ...home, [ax]: a });
    const gb = glyphOf(ch, { ...home, [ax]: b });
    const pa = pts(ga), pb = pts(gb);
    let d = Math.abs(ga.advanceWidth - gb.advanceWidth) * (id === "wide" || id === "thick" || id === "openings" ? 1 : 0);
    if (pa.length !== pb.length) d = 1e6;
    else for (let i = 0; i < pa.length; i++) d = Math.max(d, Math.abs(pa[i] - pb[i]));
    (stats[id] ??= []).push([ch, Math.round((d / upem) * 1000) / 1000]);
    if (d / upem > 0.012) hit.push(id);
  }
  presence[ch] = hit;
}
fs.writeFileSync("lib/glyph-data.json", JSON.stringify({ charset, presence }));
console.log("charset", charset.length, charset);
for (const id of Object.keys(D)) {
  const letters = "aHbgmrut".split("").map((c) => c + ":" + (stats[id].find((s) => s[0] === c) || [])[1]).join(" ");
  console.log(id, letters);
}
console.log("a", presence.a, "H", presence.H, "g", presence.g, "m", presence.m, "b", presence.b, "u", presence.u, "i", presence.i, "l", presence.l, "ß", presence["ß"], "é", presence["é"], "1", presence["1"]);
