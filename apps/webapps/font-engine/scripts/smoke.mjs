import { createRequire } from 'node:module';
import fs from 'node:fs';
import { bundleMatch, fileUrl, TTF } from './common.mjs';
const require = createRequire(import.meta.url);
const opentype = require('opentype.js'); const { createCanvas } = require('@napi-rs/canvas');
const M = await import(fileUrl(await bundleMatch())); M.setCanvasFactory((w,h)=>createCanvas(w,h));
for (const f of process.argv.slice(2)) {
  const buf = fs.readFileSync(TTF + '/' + f); const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  for (const L of ['n','o','a','g']) {
    const upm = font.unitsPerEm, p = font.charToGlyph(L).getPath(0,0,upm).commands.map(c=>{const o={type:c.type};if('x' in c){o.x=c.x/upm;o.y=-c.y/upm}if('x1' in c){o.x1=c.x1/upm;o.y1=-c.y1/upm}if('x2' in c){o.x2=c.x2/upm;o.y2=-c.y2/upm}return o});
    const t=performance.now(); const m = M.measureGlyph(p); const dt=performance.now()-t;
    console.log(f, L, dt.toFixed(0)+'ms', Object.entries(m).map(([k,v])=>k+'='+(+v).toFixed(3)).join(' '));
  }
}
