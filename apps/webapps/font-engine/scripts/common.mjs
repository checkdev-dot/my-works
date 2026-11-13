// Shared paths + helpers. Font files and heavy intermediates live OUTSIDE OneDrive.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const CACHE = process.env.FONT_ENGINE_CACHE || './.font-cache';
export const TTF = path.join(CACHE, 'ttf');
export const OUT_LIB = path.join(ROOT, 'public', 'library');
export const REPORTS = path.join(HERE, 'reports');
for (const d of [CACHE, TTF, REPORTS, OUT_LIB]) fs.mkdirSync(d, { recursive: true });

export const readJSON = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return dflt; } };
export const writeJSON = (p, o, pretty) => fs.writeFileSync(p, JSON.stringify(o, null, pretty ? 1 : 0));
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Bundle lib/match (TypeScript, extensionless imports for Next) into one ESM file Node can load.
export async function bundleMatch(dir = process.env.FE_MATCH_DIR || path.join(ROOT, 'lib', 'match')) {
  const outfile = path.join(HERE, '.build', 'match.mjs');
  await build({ entryPoints: [path.join(dir, 'internal.ts')], bundle: true, format: 'esm', platform: 'neutral', outfile, logLevel: 'error', target: 'es2022' });
  return outfile;
}
export const fileUrl = p => pathToFileURL(p).href;
