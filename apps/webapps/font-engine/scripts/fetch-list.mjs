// Step 1: fetch the full Fontsource family list (covers all of Google Fonts + other open fonts).
import path from 'node:path';
import { CACHE, writeJSON } from './common.mjs';
const r = await fetch('https://api.fontsource.org/v1/fonts');
if (!r.ok) throw new Error('list fetch failed ' + r.status);
const list = await r.json();
writeJSON(path.join(CACHE, 'list.json'), list);
console.log('families on Fontsource:', list.length);
