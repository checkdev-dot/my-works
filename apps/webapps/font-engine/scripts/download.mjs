// Step 2: resumable, throttled download of latin TTFs: 400 normal (or nearest), 700 normal, 400 italic (or nearest).
// Icon fonts (category "icons") are not downloaded: they are recorded as excluded. Failures go to downloads.json.
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, TTF, readJSON, writeJSON, sleep } from './common.mjs';

const list = readJSON(path.join(CACHE, 'list.json'));
if (!list) throw new Error('run fetch-list.mjs first');
const nearest = (arr, t) => arr.slice().sort((a, b) => Math.abs(a - t) - Math.abs(b - t) || a - b)[0];

const plan = []; const skipped = [];
for (const f of list) {
  if (!f.subsets.includes('latin')) { skipped.push({ id: f.id, reason: 'no latin subset' }); continue; }
  if (f.category === 'icons') { skipped.push({ id: f.id, reason: 'icon font (category icons)' }); continue; }
  const ws = f.weights.slice().sort((x, y) => x - y);
  const roles = [];
  const regW = ws.includes(400) ? 400 : nearest(ws, 400);
  // every weight, normal and italic (critique step 1: ingest all weights and italics)
  for (const style of ['normal', 'italic']) if (f.styles.includes(style)) for (const w of ws) roles.push({ role: style === 'italic' ? 'italic' : w === regW ? 'regular' : w === 700 ? 'bold' : 'weight', weight: w, style, fallback: false });
  for (const r of roles) plan.push({ id: f.id, ...r, file: `${f.id}/${r.weight}-${r.style}.ttf`, url: `https://cdn.jsdelivr.net/fontsource/fonts/${f.id}@latest/latin-${r.weight}-${r.style}.ttf` });
}
writeJSON(path.join(CACHE, 'plan.json'), { plan, skipped });
console.log('plan files', plan.length, 'families skipped', skipped.length);

const statePath = path.join(CACHE, 'downloads.json');
const state = readJSON(statePath, { ok: {}, failed: {} });
const todo = plan.filter(p => !(fs.existsSync(path.join(TTF, p.file)) && fs.statSync(path.join(TTF, p.file)).size > 0));
console.log('already cached', plan.length - todo.length, 'to fetch', todo.length);
let i = 0, done = 0, bytes = 0;
async function once(p) {
  const r = await fetch(p.url, { headers: { 'User-Agent': 'font-engine-research/1.0 (data only)' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 200) throw new Error('tiny file ' + buf.length);
  fs.mkdirSync(path.dirname(path.join(TTF, p.file)), { recursive: true });
  fs.writeFileSync(path.join(TTF, p.file), buf); return buf.length;
}
async function worker() {
  while (i < todo.length) {
    const p = todo[i++];
    let err;
    for (let t = 0; t < 3; t++) {
      try { bytes += await once(p); err = null; break; } catch (e) { err = e; if (/HTTP 404/.test(String(e))) break; await sleep(800 * (t + 1)); }
    }
    if (err) state.failed[p.file] = String(err); else { state.ok[p.file] = 1; delete state.failed[p.file]; }
    if (++done % 100 === 0) { writeJSON(statePath, state); console.log(done + '/' + todo.length, 'failed', Object.keys(state.failed).length, (bytes / 1e6).toFixed(0) + ' MB'); }
    await sleep(40);
  }
}
const t0 = Date.now();
await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(worker));
writeJSON(statePath, state);
console.log('done in', ((Date.now() - t0) / 1000).toFixed(0), 's; failed', Object.keys(state.failed).length, 'MB', (bytes / 1e6).toFixed(0));
