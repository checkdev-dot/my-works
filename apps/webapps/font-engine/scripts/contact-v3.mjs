// Contact sheets for the matching audit queries (same names as docs/cases/matching/*.png), written to docs/cases/matching/v3/.
//   node contact-v3.mjs [--match dir] [--index file] [--out dir] [--only substring]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './common.mjs';
import * as Q from './qa-common.mjs';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const matchDir = args.match || path.join(ROOT, 'lib', 'match'), indexPath = args.index || path.join(ROOT, 'public', 'library', 'index.json');
const OUT = args.out || path.join(ROOT, 'docs', 'cases', 'matching', 'v3'); fs.mkdirSync(OUT, { recursive: true });
const { M, lib } = await Q.loadMatcher(matchDir, indexPath, 'sheets');
const cv = Q.canvas;
function drawGlyphs(ctx, glyphs, x0, base, size) {
  let x = x0;
  for (const ch of Q.LET) {
    const g = glyphs.find(g => g.char === ch); if (!g) continue;
    ctx.beginPath(); const xs = [];
    for (const c of g.commands) { const X = v => x + v * size, Y = v => base - v * size;
      if (c.type === 'M') ctx.moveTo(X(c.x), Y(c.y)); else if (c.type === 'L') ctx.lineTo(X(c.x), Y(c.y)); else if (c.type === 'Q') ctx.quadraticCurveTo(X(c.x1), Y(c.y1), X(c.x), Y(c.y)); else if (c.type === 'C') ctx.bezierCurveTo(X(c.x1), Y(c.y1), X(c.x2), Y(c.y2), X(c.x), Y(c.y)); else if (c.type === 'Z') ctx.closePath();
      if (c.x !== undefined) xs.push(c.x); }
    ctx.fill('nonzero'); const w = xs.length ? Math.max(...xs) : 0.5; x += Math.max(w, 0.3) * size + size * 0.08;
  }
}
const xh = g => { const n = g.find(x => x.char === 'n'); let m = 0; if (n) for (const c of n.commands) if (c.y > m && c.y < 0.9) m = c.y; return m || 0.5; };
function sheet(title, qGlyphs, results, file) {
  const W = 1500, rowH = 90, head = 70, n = results.length + 1;
  const c = cv.createCanvas(W, head + n * rowH + 10), ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, c.height); ctx.fillStyle = '#000'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(title, 12, 28);
  ctx.font = '13px sans-serif'; ctx.fillStyle = '#555'; ctx.fillText('letters: a e g n o H O  (all drawn at the same x-height)', 12, 50);
  const row = (i, g, label, sub, tag) => { const y = head + i * rowH; ctx.fillStyle = i === 0 ? '#fff4e0' : (i % 2 ? '#f6f6f6' : '#fff'); ctx.fillRect(0, y, W, rowH);
    if (g && g.length) { ctx.fillStyle = '#000'; drawGlyphs(ctx, g, 400, y + 62, 34 / xh(g)); }
    ctx.fillStyle = '#000'; ctx.font = 'bold 14px sans-serif'; ctx.fillText(label, 12, y + 20); ctx.font = '12px sans-serif'; ctx.fillStyle = '#444'; sub.forEach((s, k) => ctx.fillText(s.slice(0, 62), 12, y + 38 + k * 14));
    if (tag) { ctx.fillStyle = '#b00'; ctx.font = 'bold 12px sans-serif'; ctx.fillText(tag.slice(0, 40), W - 260, y + 20); } };
  row(0, qGlyphs, 'QUERY', [title], '');
  results.forEach((r, i) => { const f = r.font; const file2 = Q.fileOf(f); let g = null; try { g = Q.glyphsOf(file2); } catch { }
    const pct = r.showNumber === false ? r.band : `${r.match}% ${r.band}`;
    const sub = [`${pct}${r.vetoed ? ' VETO:' + (r.vetoGroups || []).join(',') : ''} [${f.category}]${(r.tags || []).length ? ' ' + r.tags.join(', ') : ''}`, '+ ' + (r.why.matches.join(', ') || '-'), '- ' + (r.why.differs.join(', ') || '-'), r.also?.length ? 'also: ' + r.also.map(a => a.family).join(', ') : (r.drivers?.length ? 'drivers: ' + r.drivers.map(d => d.group).join(', ') : '')];
    row(i + 1, g, `${i + 1}. ${f.family} ${f.weight}${f.style === 'italic' ? 'i' : ''}`, sub, r.vetoed ? 'vetoed' : (f.capsOnly ? 'capitals only' : '')); });
  fs.writeFileSync(file, c.toBuffer('image/png'));
}
const only = args.only;
const CL = await Q.clay();
const EDITOR = id => ({ limit: 12, exclude: [id], excludeSuperfamily: true });
const done = [];
for (const c of Q.clayCases(CL.C)) {
  const nm = `${c.fam}_${c.name}`.replace(/[^a-z0-9+_-]/gi, '_'); if (only && !nm.includes(only)) continue;
  const q = CL.query(c.fam, c.st); const opts = EDITOR(q.f.libraryId); if (c.fam === 'rounded') opts.ends = 'round';
  const r = M.findClosest(q.glyphs, lib, opts); sheet(`${c.fam} / ${c.name} ${JSON.stringify(c.st)}${opts.ends ? '  [ends: round declared]' : '  [Editor call: no declared facts]'}`, q.glyphs, r.slice(0, 8), path.join(OUT, nm + '.png')); done.push(nm);
  if (c.fam === 'rounded') { const r2 = M.findClosest(q.glyphs, lib, EDITOR(q.f.libraryId)); sheet(`${c.fam} / ${c.name} ${JSON.stringify(c.st)}  [Editor call: no declared facts]`, q.glyphs, r2.slice(0, 8), path.join(OUT, nm + '_editor-call.png')); done.push(nm + '_editor-call'); }
}
const KA = [['inter', 400], ['lora', 400], ['playfair-display', 400], ['space-grotesk', 400], ['pacifico', 400], ['courier-prime', 400], ['comfortaa', 400], ['dm-serif-display', 400], ['lobster', 400], ['oswald', 400], ['montserrat', 400], ['merriweather', 400], ['fira-code', 400], ['caveat', 400], ['abril-fatface', 400], ['quicksand', 400], ['open-sans', 400], ['poppins', 400], ['lato', 400], ['eb-garamond', 400], ['archivo-black', 400], ['dancing-script', 400], ['playfair-display', 900], ['inter', 100], ['inter', 900], ['roboto-mono', 400], ['libre-baskerville', 400], ['special-elite', 400], ['crimson-text', 400], ['nunito', 400], ['josefin-sans', 400], ['raleway', 400], ['zilla-slab', 400]];
for (const [id, w] of KA) {
  const nm = `ka_${id}_${w}`; if (only && !nm.includes(only)) continue;
  const f = lib.fonts.find(x => x.familyId === id && x.weight === w && x.style === 'normal'); if (!f) { console.log('missing', id); continue; }
  const g = Q.glyphsOf(Q.fileOf(f), true); const r = M.findClosest(g, lib, { limit: 12, exclude: [id] });
  sheet(`known-answer ${f.family} ${w} [${f.category}] (own family excluded; advances supplied)`, g, r.slice(0, 8), path.join(OUT, nm + '.png')); done.push(nm);
}
console.log('sheets', done.length, OUT);
