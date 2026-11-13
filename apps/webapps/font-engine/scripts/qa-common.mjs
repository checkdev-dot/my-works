// Shared QA helpers: bundle any matcher copy, build clay queries, read font outlines. Truth sources here never use the new matcher code.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { CACHE, TTF, ROOT, HERE, readJSON } from './common.mjs';
const rs = createRequire(import.meta.url), rr = createRequire(path.join(ROOT, 'package.json'));
export const opentype = rs('opentype.js'), canvas = rs('@napi-rs/canvas'), fontkit = rr('fontkit');
export const BEFORE = path.join(CACHE, 'before');
export async function bundle(entry, name) {
  const outfile = path.join(HERE, '.build', name + '.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', outfile, logLevel: 'error', target: 'es2022' });
  return import(pathToFileURL(outfile).href + '?t=' + Date.now());
}
export async function loadMatcher(dir, indexPath, name) {
  const M = await bundle(path.join(dir, 'internal.ts'), 'qa-' + name);
  M.setCanvasFactory((w, h) => canvas.createCanvas(w, h));
  const index = readJSON(indexPath); return { M, index, lib: M.loadLibrary(index) };
}
export const LET = ['a', 'e', 'g', 'n', 'o', 'H', 'O'];
const otc = new Map();
export function getFont(file) { if (!otc.has(file)) { const b = fs.readFileSync(path.join(TTF, file)); otc.set(file, opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))); if (otc.size > 50) otc.delete(otc.keys().next().value); } return otc.get(file); }
export const fileOf = f => `${f.familyId}/${f.weight}-${f.style}.ttf`;
export function emCmds(font, ch) {
  if (!font.charToGlyphIndex(ch)) return null; const g = font.charToGlyph(ch); if (!g || g.index === 0) return null;
  const upm = font.unitsPerEm, p = g.getPath(0, 0, upm).commands; if (!p.length) return null;
  return p.map(c => { const o = { type: c.type }; if ('x' in c) { o.x = c.x / upm; o.y = -c.y / upm; } if ('x1' in c) { o.x1 = c.x1 / upm; o.y1 = -c.y1 / upm; } if ('x2' in c) { o.x2 = c.x2 / upm; o.y2 = -c.y2 / upm; } return o; });
}
/** glyphs of a library font file; withAdvance adds QueryGlyph.advance (em) */
export function glyphsOf(file, withAdvance = false, letters = LET) {
  const font = getFont(file), upm = font.unitsPerEm;
  return letters.map(L => { const c = emCmds(font, L); if (!c) return null; const g = { char: L, commands: c }; if (withAdvance) g.advance = font.charToGlyph(L).advanceWidth / upm; return g; }).filter(Boolean);
}
let CL = null;
export async function clay() {
  if (CL) return CL;
  const C = await bundle(path.join(ROOT, 'lib', 'clay.ts'), 'qa-clay'); const fk = {};
  CL = { C, query(fam, st) {
    const f = C.FAMILIES.find(x => x.id === fam); fk[f.file] ??= fontkit.openSync(path.join(ROOT, 'public', f.file));
    const font = fk[f.file].getVariation(C.axes(f, st)), upm = font.unitsPerEm, shape = ch => font.layout(ch, ['liga', 'rvrn', 'locl']).glyphs[0];
    const glyphs = LET.map(char => { const commands = []; for (const c of shape(char).path.commands) { const a = c.args.map(n => n / upm);
      if (c.command === 'moveTo') commands.push({ type: 'M', x: a[0], y: a[1] }); else if (c.command === 'lineTo') commands.push({ type: 'L', x: a[0], y: a[1] });
      else if (c.command === 'quadraticCurveTo') commands.push({ type: 'Q', x1: a[0], y1: a[1], x: a[2], y: a[3] }); else if (c.command === 'bezierCurveTo') commands.push({ type: 'C', x1: a[0], y1: a[1], x2: a[2], y2: a[3], x: a[4], y: a[5] });
      else if (c.command === 'closePath') commands.push({ type: 'Z' }); } return { char, commands }; });
    return { glyphs, f };
  } }; return CL;
}
/** the 57 clay queries of the matching audit (problems-matching.md) */
export function clayCases(C) {
  const cases = []; const add = (fam, name, st) => cases.push({ fam, name, st });
  for (const f of C.FAMILIES) { add(f.id, 'home', {}); const d = f.dials;
    if (d.thick) { add(f.id, 'thin', { thick: -1 }); add(f.id, 'black', { thick: 1 }); add(f.id, 'semithin', { thick: -.5 }); add(f.id, 'bold', { thick: .5 }); }
    if (d.wide) { add(f.id, 'narrow', { wide: -1 }); add(f.id, 'wide', { wide: 1 }); }
    if (d.thick && d.wide) { add(f.id, 'thin+narrow', { thick: -1, wide: -1 }); add(f.id, 'thin+wide', { thick: -1, wide: 1 }); add(f.id, 'black+narrow', { thick: 1, wide: -1 }); add(f.id, 'black+wide', { thick: 1, wide: 1 }); } }
  for (const k of ['lean', 'openings', 'middle', 'tall', 'tails', 'caps', 'contrast']) { add('plain', k + '+', { [k]: 1 }); add('plain', k + '-', { [k]: -1 }); }
  add('plain', 'contrast+_black', { contrast: 1, thick: 1 }); add('plain', 'openings-_black', { openings: -1, thick: 1 }); add('plain', 'lean+_thin', { lean: 1, thick: -1 }); add('plain', 'middle+_narrow', { middle: 1, wide: -1 }); add('plain', 'middle-_wide', { middle: -1, wide: 1 });
  return cases;
}
export const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
export function rng(seed) { let s = seed; const r = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; r.gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); return r; }
export function jitter(cmds, r, sigma = 0.010, wscale = 0.04) { const ws = 1 + (r() * 2 - 1) * wscale; return cmds.map(c => { const o = { type: c.type }; for (const [a, b] of [['x', 'y'], ['x1', 'y1'], ['x2', 'y2']]) if (a in c) { o[a] = c[a] * ws + r.gauss() * sigma; o[b] = c[b] + r.gauss() * sigma; } return o; }); }
// ---- truth sources (independent of the matcher under test) ----
export const LIST = readJSON(path.join(CACHE, 'list.json'), []);
export const catOf = Object.fromEntries(LIST.map(f => [f.id, f.category]));
export const GF = Object.fromEntries((readJSON(path.join(CACHE, 'gfmeta.json'), { familyMetadataList: [] }).familyMetadataList).map(f => [f.family, f]));
export const SCRIPTFIRST_RE = /Noto (Sans|Serif) [A-Z][a-z]+|Hentaigana|Kawi|Hebrew|Bpmf|Lisu|Koh Santepheap|Mallanna|Mandali|NTR|Suravaram|Nokora|Gothic A1|Sawarabi|Zen Loop|Arabic|Thai|Tai Heritage|Namdhinggo|Ruwudu|Gulzar|Shafarik|Uchen|Kedebideri|Tirra|BIZ|Sarabun|Palanquin|Khula|Parastoo|Benne|Pattaya|Galada|Hanuman|Chiron/;
export const scriptFirstGF = family => { const p = GF[family]?.primaryScript; return !!p && p !== 'Latn'; };
export const MONO_TRUTH_IDS = new Set(['courier-prime', 'cutive-mono', 'xanh-mono', 'nova-mono', 'space-mono', 'ibm-plex-mono', 'cousine', 'roboto-mono', 'source-code-pro', 'pt-mono', 'overpass-mono', 'anonymous-pro', 'fira-code', 'fira-mono', 'jetbrains-mono', 'inconsolata', 'ubuntu-mono', 'dm-mono', 'red-hat-mono', 'courier-new']);
export const isMonoTruth = (id, family) => catOf[id] === 'monospace' || MONO_TRUTH_IDS.has(id) || /\b(mono|code|courier|typewriter)\b/i.test(family);
export const SCRIPT_TRUTH_IDS = new Set(['lobster', 'satisfy', 'kaushan-script', 'dancing-script', 'sacramento', 'yellowtail', 'lobster-two', 'courgette', 'damion', 'great-vibes', 'cookie', 'pacifico', 'allura', 'pinyon-script', 'alex-brush', 'berkshire-swash', 'oleo-script']);
export const isScriptTruth = (id, family) => SCRIPT_TRUTH_IDS.has(id) || /\b(script|signature|brush)\b/i.test(family);
