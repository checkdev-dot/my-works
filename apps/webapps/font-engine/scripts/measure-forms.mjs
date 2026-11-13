// One worker pass over the cached TTFs, one row per family: letter forms (3 weights, for a consistency check), advances and side-bearings,
// ascender and descender proportions, a join score (do letters connect when set), and stroke-end class on more stems.
// Output: <cache>/forms.json. Run: node measure-forms.mjs   (about 10 minutes)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { CACHE, TTF, readJSON, writeJSON, bundleMatch, fileUrl, ROOT } from './common.mjs';
const require = createRequire(import.meta.url);

if (isMainThread) {
  const bundle = await bundleMatch();
  const { plan } = readJSON(path.join(CACHE, 'plan.json'));
  const fams = new Map();
  for (const p of plan) if (p.style === 'normal' && fs.existsSync(path.join(TTF, p.file))) (fams.get(p.id) ?? fams.set(p.id, []).get(p.id)).push(p);
  const tasks = [...fams.entries()].map(([id, ps]) => ({ id, files: ps.map(p => ({ file: p.file, weight: p.weight })) }));
  const t0 = Date.now(), nW = Math.max(1, Math.min(os.cpus().length - 1, 10)), res = {}; let next = 0, done = 0;
  await new Promise((resolve, reject) => {
    let live = 0;
    for (let i = 0; i < nW; i++) {
      const w = new Worker(new URL(import.meta.url), { workerData: { bundle } }); live++;
      const feed = () => { if (next < tasks.length) w.postMessage(tasks[next++]); else { w.terminate(); if (--live === 0) resolve(); } };
      w.on('message', r => { res[r.id] = r; if (++done % 200 === 0) console.log(done + '/' + tasks.length, ((Date.now() - t0) / 1000).toFixed(0) + 's'); feed(); });
      w.on('error', reject); feed();
    }
  });
  writeJSON(path.join(CACHE, 'forms.json'), { builtAt: new Date().toISOString(), families: res });
  console.log('families', Object.keys(res).length, ((Date.now() - t0) / 1000).toFixed(0) + 's');
} else {
  const opentype = require('opentype.js');
  const { createCanvas } = require('@napi-rs/canvas');
  const fontkit = createRequire(path.join(ROOT, 'package.json'))('fontkit');
  const { classify } = await import('./forms-classify.mjs');
  const M = await import(fileUrl(workerData.bundle));
  M.setCanvasFactory((w, h) => createCanvas(w, h));
  const open = f => { const b = fs.readFileSync(path.join(TTF, f)); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
  const nearest = (files, t) => files.slice().sort((a, b) => Math.abs(a.weight - t) - Math.abs(b.weight - t) || a.weight - b.weight)[0];
  const bb = (font, ch) => { const i = font.charToGlyphIndex(ch); if (!i) return null; const g = font.charToGlyph(ch); const b = g.getBoundingBox(); if (!(b.y2 - b.y1) && !(b.x2 - b.x1)) return null; return { x1: b.x1, x2: b.x2, y1: b.y1, y2: b.y2, adv: g.advanceWidth, g }; };
  const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
  // join score: set a string with fontkit (contextual forms included) and count separate ink pieces
  const JW = 760, JH = 200, jc = createCanvas(JW, JH), jx = jc.getContext('2d');
  function joinScore(file) {
    try {
      const fk = fontkit.openSync(path.join(TTF, file)); const sz = 90, S = sz / fk.unitsPerEm; let tot = 0, cnt = 0;
      for (const str of ['nunanenoen', 'ooooooooo', 'aeaeaeaea']) {
        const run = fk.layout(str); jx.clearRect(0, 0, JW, JH); jx.fillStyle = '#000'; jx.beginPath(); let x = 20;
        run.glyphs.forEach((g, i) => { const pos = run.positions[i]; for (const c of g.path.commands) { const a = c.args; const X = k => x + (pos.xOffset + k) * S, Y = k => 130 - (pos.yOffset + k) * S; if (c.command === 'moveTo') jx.moveTo(X(a[0]), Y(a[1])); else if (c.command === 'lineTo') jx.lineTo(X(a[0]), Y(a[1])); else if (c.command === 'quadraticCurveTo') jx.quadraticCurveTo(X(a[0]), Y(a[1]), X(a[2]), Y(a[3])); else if (c.command === 'bezierCurveTo') jx.bezierCurveTo(X(a[0]), Y(a[1]), X(a[2]), Y(a[3]), X(a[4]), Y(a[5])); else if (c.command === 'closePath') jx.closePath(); } x += pos.xAdvance * S; });
        jx.fill('nonzero'); const d = jx.getImageData(0, 0, JW, JH).data; const ink = new Uint8Array(JW * JH); for (let i = 0; i < JW * JH; i++) ink[i] = d[i * 4 + 3] > 127 ? 1 : 0;
        const seen = new Uint8Array(JW * JH); let comps = 0;
        for (let p0 = 0; p0 < JW * JH; p0++) { if (!ink[p0] || seen[p0]) continue; let n = 0; const st = [p0]; seen[p0] = 1; while (st.length) { const p = st.pop(); n++; const px = p % JW, py = (p / JW) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const qx = px + dx, qy = py + dy; if (qx < 0 || qy < 0 || qx >= JW || qy >= JH) continue; const q = qy * JW + qx; if (ink[q] && !seen[q]) { seen[q] = 1; st.push(q); } } } if (n >= 12) comps++; }
        const letters = run.glyphs.length; tot += 1 - Math.min(letters, comps) / letters; cnt++;
      }
      return +(tot / cnt).toFixed(3);
    } catch { return NaN; }
  }
  const emCmds = (font, ch) => { if (!font.charToGlyphIndex(ch)) return null; const g = font.charToGlyph(ch); const upm = font.unitsPerEm, p = g.getPath(0, 0, upm).commands; if (!p.length) return null; return p.map(c => { const o = { type: c.type }; if ('x' in c) { o.x = c.x / upm; o.y = -c.y / upm; } if ('x1' in c) { o.x1 = c.x1 / upm; o.y1 = -c.y1 / upm; } if ('x2' in c) { o.x2 = c.x2 / upm; o.y2 = -c.y2 / upm; } return o; }); };
  parentPort.on('message', task => {
    const r = { id: task.id, file: null, forms: {}, cons: {}, raw: {} };
    try {
      const reg = nearest(task.files, 400); r.file = reg.file; r.weight = reg.weight;
      const picks = [...new Set([nearest(task.files, 300), reg, nearest(task.files, 700)].map(f => f.file))];
      const cls = []; let regC = null;
      for (const f of picks) { try { const c = classify(open(f)); if (c) { cls.push(c); if (f === reg.file) regC = c; } } catch { } }
      const KEYS = ['a_storey', 'a_tail', 'b_spur', 't_top', 'y_tail', 'e_bar', 'g_storey', 'l_bottom', 'i_dot', 'G_spur', 'R_leg', 'Q_tail', 'J_desc', 'one_base', 'four_top', 'u_stem', 'M_vertex', 'k_join'];
      for (const k of KEYS) {
        const vals = cls.map(c => c[k]).filter(v => typeof v === 'string');
        if (!vals.length) continue;
        const cnt = {}; vals.forEach(v => cnt[v] = (cnt[v] || 0) + 1); const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
        r.forms[k] = (regC && regC[k] && cnt[regC[k]] === best[1]) ? regC[k] : best[0]; r.cons[k] = +(best[1] / vals.length).toFixed(2);
      }
      if (regC) for (const k of ['b_join', 'e_bar_dy', 'i_dot_sol', 'y_bend', 'R_leg_res', 'a_tail_px', 'xh', 'cap']) if (regC[k] !== undefined) r.raw[k] = regC[k];
      r.nw = cls.length;
      // spacing, advances, proportions from the regular file
      const font = open(reg.file), upm = font.unitsPerEm;
      const adv = {}; for (const L of ['a', 'e', 'g', 'n', 'o', 'H', 'O', 'i', 'l', 'm', 'w']) { const b = bb(font, L); if (b) adv[L] = +(b.adv / upm).toFixed(4); }
      r.adv = adv;
      const nb = bb(font, 'n'), xh = nb ? nb.y2 : NaN; r.xh = nb ? +(xh / upm).toFixed(4) : null;
      const sb = {}; for (const L of ['n', 'o', 'H']) { const b = bb(font, L); if (b) sb[L] = [+(b.x1 / upm).toFixed(4), +((b.adv - b.x2) / upm).toFixed(4)]; } r.sb = sb;
      const asc = med(['l', 'h', 'b', 'd', 'k'].map(L => { const b = bb(font, L); return b ? b.y2 / xh : NaN; })), desc = med(['p', 'q', 'y', 'j'].map(L => { const b = bb(font, L); return b ? -b.y1 / xh : NaN; }));
      r.asc = Number.isFinite(asc) ? +asc.toFixed(3) : null; r.desc = Number.isFinite(desc) ? +desc.toFixed(3) : null;
      // stroke-end class on more stems
      const ec = [0, 0, 0], ee = [];
      for (const L of ['l', 'i', 'h', 'm', 'r', 'k', 'p']) { const c = emCmds(font, L); if (!c) continue; const m = M.measureGlyph(c); if (m && Number.isFinite(m.termCls)) { ec[m.termCls]++; ee.push(m.termEnd); } }
      r.endCls = ec; r.endMean = ee.length ? +(ee.reduce((a, b) => a + b, 0) / ee.length).toFixed(3) : null;
      r.join = joinScore(reg.file);
    } catch (e) { r.error = String(e && e.message || e); }
    parentPort.postMessage(r);
  });
}
