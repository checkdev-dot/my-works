// Evidence part 2: the spike's shaped-letter test rerun with the new multi-letter matcher (queries from spike/generator.js),
// plus contact-v2.png. Query parameters are the spike's, unchanged (Q4b is the spike's own corrected rerun).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, REPORTS, writeJSON } from './common.mjs';
import { M, lib, A, LETTERS, legacy, fileOf, getFont, emCmds, createCanvas, loadImage, legacyQueryZ, legacyDistances } from './eval-lib.mjs';

const require = createRequire(import.meta.url);
const G = require(path.join(ROOT, 'spike', 'generator.js'));
const QUERIES = [
  { id: 'q1', name: 'Thin geometric sans', p: { xh: .50, w: .50, stem: .040, thin: .040, round: .15, serif: 0, slant: 0 } },
  { id: 'q2', name: 'Heavy rounded', p: { xh: .52, w: .56, stem: .170, thin: .150, round: 1, serif: 0, slant: 0 } },
  { id: 'q3', name: 'High-contrast serif', p: { xh: .46, w: .50, stem: .085, thin: .020, round: 0, serif: 1.0, slant: 0 } },
  { id: 'q4', name: 'Slab serif (spike generator defect: slabs close the n)', p: { xh: .50, w: .52, stem: .100, thin: .085, round: 0, serif: 1.5, slant: 0 } },
  { id: 'q4b', name: 'Slab serif, shorter slabs (spike rerun)', p: { xh: .50, w: .52, stem: .100, thin: .085, round: 0, serif: 0.6, slant: 0 } },
  { id: 'q5', name: 'Wide light', p: { xh: .48, w: .68, stem: .050, thin: .045, round: .2, serif: 0, slant: 0 } },
  { id: 'q6', name: 'Condensed bold', p: { xh: .55, w: .34, stem: .125, thin: .105, round: 0, serif: 0, slant: 0 } },
  { id: 'q7', name: 'Soft rounded', p: { xh: .50, w: .50, stem: .090, thin: .085, round: .9, serif: 0, slant: 0 } },
  { id: 'q8', name: 'Slanted sans', p: { xh: .50, w: .50, stem: .070, thin: .055, round: 0, serif: 0, slant: 14 } }
];
const KINDS = ['n', 'a', 'o'];
const famOf = id => id.replace(/:.*/, '');
const nameOf = f => f.family + ' ' + f.weight + (f.style === 'italic' ? 'i' : '');

const results = [];
for (const q of QUERIES) {
  const cmds = Object.fromEntries(KINDS.map(k => [k, G.glyph(k, q.p)]));
  const glyphs = KINDS.map(k => ({ char: k, commands: cmds[k] }));
  const multi = M.findClosest(glyphs, lib, { limit: 5 });
  const single = M.findClosest([glyphs[0]], lib, { limit: 5 });
  // spike engine on the same library, same letters (names only)
  const od = legacyDistances(legacyQueryZ(cmds));
  const seen = new Set(), old = [];
  [...od.keys()].sort((a, b) => od[a] - od[b]).forEach(i => { const f = lib.fonts[i]; if (Number.isFinite(od[i]) && !seen.has(f.familyId) && old.length < 5) { seen.add(f.familyId); old.push(f); } });
  // diagnostics: how many of the results are handwriting, italic
  const stat = r => ({ handwriting: r.filter(x => x.font.category === 'handwriting').length, italic: r.filter(x => x.font.style === 'italic').length, weak: r.filter(x => x.weak).length });
  results.push({ ...q, cmds, multi, single, old, stat: { multi: stat(multi), single: stat(single), old: { handwriting: old.filter(f => f.category === 'handwriting').length, italic: old.filter(f => f.style === 'italic').length } } });
}

// ---------- contact sheet ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r1 = v => Math.round(v * 10) / 10;
const dOf = (cmds, S, ox, oy) => cmds.map(c => c.type === 'Z' ? 'Z' : c.type === 'M' ? `M${r1(ox + c.x * S)} ${r1(oy - c.y * S)}` : c.type === 'L' ? `L${r1(ox + c.x * S)} ${r1(oy - c.y * S)}` : c.type === 'Q' ? `Q${r1(ox + c.x1 * S)} ${r1(oy - c.y1 * S)} ${r1(ox + c.x * S)} ${r1(oy - c.y * S)}` : `C${r1(ox + c.x1 * S)} ${r1(oy - c.y1 * S)} ${r1(ox + c.x2 * S)} ${r1(oy - c.y2 * S)} ${r1(ox + c.x * S)} ${r1(oy - c.y * S)}`).join('');
function wrap(s, n) { const w = s.split(' '), out = []; let cur = ''; for (const x of w) { if ((cur + ' ' + x).trim().length > n) { out.push(cur.trim()); cur = x; } else cur += ' ' + x; } if (cur.trim()) out.push(cur.trim()); return out; }
function wordPath(f, text, S, ox, oy) {
  const font = getFont(fileOf(f)); let x = ox, d = '';
  for (const ch of text) { const g = font.charToGlyph(ch); d += g.getPath(x, oy, S).toPathData(1); x += g.advanceWidth / font.unitsPerEm * S; }
  return d;
}
const CHANGES = [
  'WHAT CHANGED SINCE THE SPIKE (contact.png)',
  '1. Library hygiene: every Fontsource family, all weights and italics; caps-only (n vs N mask overlap), icon, missing-letter, pixel/dot fonts removed or tagged; duplicate families collapsed.',
  '2. One canonical frame per letter (same height, baseline, left edge). 8 attribute groups, each one distance, combined with a p=4 norm so one visible miss decides.',
  '3. Gates: italic vs upright, and one- vs two-storey a and g. Radius-based roundness replaces corner counting (that fed the Q8 script-font failure).',
  '4. All shaped letters (n, a, o) compared together. Match % = share of real fonts whose own nearest neighbour is farther, capped by the worst attribute. WEAK = 10% or less.'
];
const COLW = 262, LEFT = 150, ROWH = 300, W = LEFT + COLW * 5 + 10;
let svg = '', y = 0;
CHANGES.forEach((t, i) => { svg += `<text x="8" y="${18 + i * 17}" font-size="${i ? 12 : 14}" font-family="Arial" font-weight="${i ? 400 : 700}">${esc(t)}</text>`; });
y = CHANGES.length * 17 + 22;
for (const r of results) {
  const y0 = y; svg += `<line x1="0" y1="${y0}" x2="${W}" y2="${y0}" stroke="#444" stroke-width="1.5"/>`;
  svg += `<text x="8" y="${y0 + 16}" font-size="13" font-family="Arial" font-weight="700">${esc(r.id.toUpperCase())} ${esc(r.name)}</text>`;
  KINDS.forEach((k, i) => { svg += `<path d="${dOf(r.cmds[k], 80, 10 + i * 46, y0 + 100)}" fill="#0a4"/>`; });
  svg += `<line x1="6" y1="${y0 + 100}" x2="${LEFT - 6}" y2="${y0 + 100}" stroke="#d33" stroke-width=".6"/>`;
  svg += `<text x="8" y="${y0 + 130}" font-size="10" font-family="Arial" fill="#555">spike engine, same library:</text>`;
  wrap(r.old.map(nameOf).join(', '), 28).slice(0, 5).forEach((l, i) => { svg += `<text x="8" y="${y0 + 143 + i * 12}" font-size="10" font-family="Arial" fill="#555">${esc(l)}</text>`; });
  svg += `<text x="8" y="${y0 + 218}" font-size="10" font-family="Arial" fill="#555">new, letter n alone:</text>`;
  wrap(r.single.map(x => nameOf(x.font)).join(', '), 28).slice(0, 4).forEach((l, i) => { svg += `<text x="8" y="${y0 + 231 + i * 12}" font-size="10" font-family="Arial" fill="#555">${esc(l)}</text>`; });
  r.multi.forEach((m, k) => {
    const x = LEFT + k * COLW, f = m.font, font = getFont(fileOf(f));
    ['n', 'a', 'o'].forEach((L, i) => { const c = emCmds(font, L); if (c) svg += `<path d="${dOf(c, 70, x + 6 + i * 40, y0 + 80)}" fill="#111"/>`; });
    svg += `<line x1="${x}" y1="${y0 + 80}" x2="${x + 140}" y2="${y0 + 80}" stroke="#d33" stroke-width=".5"/>`;
    svg += `<path d="${wordPath(f, 'hamburg', 36, x + 6, y0 + 135)}" fill="#111"/>`;
    svg += `<text x="${x + 6}" y="${y0 + 160}" font-size="12" font-family="Arial" font-weight="700">${esc(nameOf(f).slice(0, 30))}  ${m.match}%${m.weak ? ' WEAK' : ''}</text>`;
    svg += `<text x="${x + 6}" y="${y0 + 173}" font-size="10" font-family="Arial" fill="#555">${esc(f.category)} - ${esc(f.license)}</text>`;
    wrap('matches: ' + (m.why.matches.join(', ') || 'nothing closely'), 44).slice(0, 2).forEach((l, i) => { svg += `<text x="${x + 6}" y="${y0 + 190 + i * 12}" font-size="10.5" font-family="Arial" fill="#0a5">${esc(l)}</text>`; });
    wrap('differs: ' + (m.why.differs.join('; ') || 'nothing notable'), 44).slice(0, 4).forEach((l, i) => { svg += `<text x="${x + 6}" y="${y0 + 218 + i * 12}" font-size="10.5" font-family="Arial" fill="#a33">${esc(l)}</text>`; });
  });
  y += ROWH;
}
const H = y + 4;
const full = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>${svg}</svg>`;
const img = await loadImage(Buffer.from(full)); const c = createCanvas(W, H); c.getContext('2d').drawImage(img, 0, 0);
fs.writeFileSync(path.join(ROOT, 'spike', 'contact-v2.png'), c.toBuffer('image/png'));

const compact = results.map(r => ({ id: r.id, name: r.name, newMulti: r.multi.map(m => ({ font: nameOf(m.font), category: m.font.category, weak: m.weak, match: m.match, matches: m.why.matches, differs: m.why.differs })), newSingleN: r.single.map(m => nameOf(m.font)), spikeEngine: r.old.map(nameOf), stat: r.stat }));
writeJSON(path.join(REPORTS, 'evidence-shaped.json'), compact, true);
for (const r of compact) { console.log(r.id, r.name, JSON.stringify(r.stat)); console.log('  new  :', r.newMulti.map(m => m.font + ' ' + m.match + '%' + (m.weak ? '!' : '')).join(', ')); console.log('  n-only:', r.newSingleN.join(', ')); console.log('  spike:', r.spikeEngine.join(', ')); r.newMulti.slice(0, 2).forEach(m => console.log('   why', m.font, '| +', m.matches.join(','), '| -', m.differs.join('; '))); }
console.log('contact-v2.png', W + 'x' + H);
