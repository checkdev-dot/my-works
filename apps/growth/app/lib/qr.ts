/** Tiny dependency-free QR encoder: byte mode, ECC level M, versions 1 to 6. */

// [total codewords, ec codewords per block, blocks, data codewords per block]
const VERSIONS: [number, number, number, number][] = [
  [26, 10, 1, 16],
  [44, 16, 1, 28],
  [70, 26, 1, 44],
  [100, 18, 2, 32],
  [134, 24, 2, 43],
  [172, 16, 4, 27],
];
const ALIGN: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

// GF(256), primitive polynomial 0x11d
const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function rsGenerator(degree: number): number[] {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= g[j] === 0 ? 0 : EXP[LOG[g[j]] + i];
    }
    g = next;
  }
  return g; // highest degree first, leading 1
}

function rsRemainder(data: number[], degree: number): number[] {
  const gen = rsGenerator(degree);
  const rem = new Array<number>(degree).fill(0);
  for (const b of data) {
    const factor = b ^ rem[0];
    rem.shift();
    rem.push(0);
    if (factor !== 0) for (let i = 0; i < degree; i++) rem[i] ^= EXP[LOG[gen[i + 1]] + LOG[factor]];
  }
  return rem;
}

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function buildCodewords(bytes: number[], ver: number): number[] {
  const [total, ecLen, blocks, dataPer] = VERSIONS[ver - 1];
  const dataCap = blocks * dataPer;
  const bits: number[] = [];
  const push = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  const capBits = dataCap * 8;
  push(0, Math.min(4, capBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    data.push(v);
  }
  for (let pad = 0xec; data.length < dataCap; pad ^= 0xec ^ 0x11) data.push(pad);

  const dBlocks: number[][] = [];
  const eBlocks: number[][] = [];
  for (let b = 0; b < blocks; b++) {
    const d = data.slice(b * dataPer, (b + 1) * dataPer);
    dBlocks.push(d);
    eBlocks.push(rsRemainder(d, ecLen));
  }
  const out: number[] = [];
  for (let i = 0; i < dataPer; i++) for (const d of dBlocks) out.push(d[i]);
  for (let i = 0; i < ecLen; i++) for (const e of eBlocks) out.push(e[i]);
  if (out.length !== total) throw new Error("qr: codeword count mismatch");
  return out;
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function formatBits(mask: number): number {
  const data = mask; // ECC M = 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0;
  const runScore = (line: boolean[]) => {
    let s = 0;
    let run = 1;
    for (let i = 1; i <= line.length; i++) {
      if (i < line.length && line[i] === line[i - 1]) run++;
      else { if (run >= 5) s += run - 2; run = 1; }
    }
    // finder-like 1:1:3:1:1 with 4 light on either side
    const str = line.map((b) => (b ? "1" : "0")).join("");
    for (const pat of ["10111010000", "00001011101"]) {
      let from = 0;
      for (;;) { const k = str.indexOf(pat, from); if (k < 0) break; s += 40; from = k + 1; }
    }
    return s;
  };
  for (let y = 0; y < n; y++) score += runScore(m[y]);
  for (let x = 0; x < n; x++) score += runScore(m.map((row) => row[x]));
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
  }
  let dark = 0;
  for (const row of m) for (const c of row) if (c) dark++;
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10 * 1; // each full 5% step = 10
  return score;
}

/** Encode text. Pass version/mask only to pin them (used for testing). */
export function qrEncode(text: string, opts: { version?: number; mask?: number } = {}): boolean[][] {
  const bytes = utf8(text);
  let ver = opts.version ?? 0;
  if (!ver) {
    for (let v = 1; v <= 6; v++) if (bytes.length <= VERSIONS[v - 1][2] * VERSIONS[v - 1][3] - 2) { ver = v; break; }
    if (!ver) throw new Error("qr: text too long");
  }
  const size = 17 + 4 * ver;
  const codewords = buildCodewords(bytes, ver);

  const base: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const setFn = (x: number, y: number, dark: boolean) => { base[y][x] = dark; fn[y][x] = true; };

  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      setFn(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const pos = ALIGN[ver - 1];
  for (const cy of pos) for (const cx of pos) {
    const last = pos.length - 1;
    if ((pos.indexOf(cx) === 0 && pos.indexOf(cy) === 0) || (pos.indexOf(cx) === 0 && pos.indexOf(cy) === last) || (pos.indexOf(cx) === last && pos.indexOf(cy) === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // reserve format areas (drawn per mask)
  const drawFormat = (m: boolean[][], mask: number) => {
    const bits = formatBits(mask);
    const bit = (i: number) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
    m[7][8] = bit(6); m[8][8] = bit(7); m[8][7] = bit(8);
    for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i++) m[8][size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) m[size - 15 + i][8] = bit(i);
    m[size - 8][8] = true;
  };
  drawFormat(base, 0);
  for (let i = 0; i <= 8; i++) { fn[i][8] = true; fn[8][i] = true; }
  for (let i = 0; i < 8; i++) { fn[8][size - 1 - i] = true; fn[size - 1 - i][8] = true; }
  fn[size - 8][8] = true;

  // place data bits (zigzag)
  const dataBits: boolean[] = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) dataBits.push(((cw >>> i) & 1) === 1);
  const placed: boolean[][] = base.map((r) => r.slice());
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fn[y][x]) { placed[y][x] = k < dataBits.length ? dataBits[k] : false; k++; }
      }
    }
  }

  const apply = (mask: number): boolean[][] => {
    const m = placed.map((r) => r.slice());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskBit(mask, x, y)) m[y][x] = !m[y][x];
    drawFormat(m, mask);
    return m;
  };
  if (opts.mask !== undefined) return apply(opts.mask);
  let best = apply(0), bestScore = penalty(best);
  for (let mk = 1; mk < 8; mk++) {
    const m = apply(mk), sc = penalty(m);
    if (sc < bestScore) { best = m; bestScore = sc; }
  }
  return best;
}

/** One SVG path (rects for dark modules) with a 4-module quiet zone, plus its viewBox size. */
export function qrPath(text: string, opts?: { version?: number; mask?: number }): { d: string; size: number } {
  const m = qrEncode(text, opts);
  const q = 4;
  let d = "";
  for (let y = 0; y < m.length; y++) {
    let x = 0;
    while (x < m.length) {
      if (!m[y][x]) { x++; continue; }
      let w = 1;
      while (x + w < m.length && m[y][x + w]) w++;
      d += `M${x + q} ${y + q}h${w}v1h${-w}z`;
      x += w;
    }
  }
  return { d, size: m.length + q * 2 };
}

export function qrSvg(text: string): string {
  const { d, size } = qrPath(text);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
