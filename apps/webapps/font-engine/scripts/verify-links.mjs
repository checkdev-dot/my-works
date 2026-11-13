// Verify the "Get it" page of every family. Order: Google Fonts specimen (renamed if Google renamed it), then the Fontsource page.
// Controls: a made-up family must 404 on each host, otherwise the host cannot be trusted. Output: <cache>/links.json { id: { url, kind } } (only where it differs from the default).
import path from 'node:path';
import { CACHE, readJSON, writeJSON, sleep } from './common.mjs';
const list = readJSON(path.join(CACHE, 'list.json'));
const RENAME = { 'Source Serif Pro': 'Source Serif 4', 'Source Sans Pro': 'Source Sans 3', 'Fredoka One': 'Fredoka', 'Arima Madurai': 'Arima', 'Big Shoulders Display': 'Big Shoulders', 'Big Shoulders Text': 'Big Shoulders', 'Big Shoulders Inline Display': 'Big Shoulders Inline', 'Big Shoulders Inline Text': 'Big Shoulders Inline', 'Big Shoulders Stencil Display': 'Big Shoulders Stencil', 'Big Shoulders Stencil Text': 'Big Shoulders Stencil', 'Merienda One': 'Merienda', 'Gentium Book Basic': 'Gentium Book Plus', 'Gentium Basic': 'Gentium Plus', 'Coda Caption': 'Coda', 'Saira Stencil One': 'Saira Stencil', 'Stencil Display': 'Big Shoulders Stencil', 'Stencil Text': 'Big Shoulders Stencil' };
const UA = { 'User-Agent': 'font-engine-research/1.0 (link check)' };
const gurl = n => 'https://fonts.google.com/specimen/' + encodeURIComponent(n).replace(/%20/g, '+');
const furl = id => 'https://fontsource.org/fonts/' + id;
async function ok(u) { for (let t = 0; t < 3; t++) { try { const r = await fetch(u, { method: 'HEAD', headers: UA, redirect: 'follow' }); if (r.status === 200) return true; if (r.status === 404) return false; } catch { } await sleep(500 * (t + 1)); } return false; }
const controls = { google: await ok(gurl('Zzzfake Typeface Qx')), fontsource: await ok(furl('zzzfake-typeface-qx')) };
if (controls.google || controls.fontsource) { console.log('control failed', controls); process.exit(1); }
const out = {}, stat = { googleOk: 0, renamed: 0, fontsource: 0, dead: 0 }; let i = 0;
async function worker() {
  while (i < list.length) {
    const f = list[i++]; let url = null, kind = null;
    if (f.type === 'google') {
      if (await ok(gurl(f.family))) { stat.googleOk++; continue; }
      const alt = RENAME[f.family]; if (alt && await ok(gurl(alt))) { url = gurl(alt); kind = 'google-renamed'; stat.renamed++; }
    }
    if (!url) { if (f.type !== 'google' && await ok(furl(f.id))) { stat.fontsource++; continue; } if (await ok(furl(f.id))) { url = furl(f.id); kind = 'fontsource'; stat.fontsource++; } else { stat.dead++; out[f.id] = { url: null, kind: 'dead' }; continue; } }
    out[f.id] = { url, kind };
    await sleep(30);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
writeJSON(path.join(CACHE, 'links.json'), { checked: new Date().toISOString(), controls, stat, links: out }, true);
console.log(JSON.stringify(stat), Object.entries(out).slice(0, 30).map(([k, v]) => k + ' ' + v.kind).join(', '));
