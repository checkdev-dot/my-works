const test = require('node:test');
const assert = require('node:assert');
const C = require('../nav-core.js');

// 3 rows x 5 cards of 200x110 at x = 50 + 220*i, y = 100/300/500 (+ small jitter)
function grid() {
  const rects = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    const j = (c % 2) * 3;
    rects.push({ left: 50 + 220 * c, top: 100 + 200 * r + j, right: 250 + 220 * c, bottom: 210 + 200 * r + j });
  }
  return rects;
}
const at = (r, c) => r * 5 + c;

test('groupRows finds 3 rows despite jitter and input order', () => {
  const rows = C.groupRows(grid().reverse());
  assert.equal(rows.length, 3);
  rows.forEach((row) => assert.equal(row.idx.length, 5));
});

test('score: direction, cone, orthogonal weight', () => {
  const a = { left: 0, top: 0, right: 100, bottom: 100 };
  const right = { left: 200, top: 0, right: 300, bottom: 100 };
  const left = { left: -300, top: 0, right: -200, bottom: 100 };
  const diag = { left: 120, top: 400, right: 220, bottom: 500 };
  assert.ok(C.score(a, right, 'right') < C.score(a, diag, 'right'));
  assert.equal(C.score(a, left, 'right'), Infinity);
  assert.ok(C.score(a, diag, 'right') >= 10000);
  const near = { left: 0, top: 250, right: 100, bottom: 350 };
  const farAligned = { left: 0, top: 600, right: 100, bottom: 700 };
  assert.ok(C.score(a, near, 'down') < C.score(a, farAligned, 'down'));
});

test('horizontal moves within row and stops at the edge', () => {
  const g = grid();
  assert.equal(C.horizontal(g, at(1, 2), 'right'), at(1, 3));
  assert.equal(C.horizontal(g, at(1, 2), 'left'), at(1, 1));
  assert.equal(C.horizontal(g, at(1, 4), 'right'), -1);
  assert.equal(C.horizontal(g, at(1, 0), 'left'), -1);
});

test('vertical keeps the column; Down-Down-Up returns to the same column', () => {
  const g = grid();
  const col = C.cx(g[at(0, 3)]);
  const d1 = C.vertical(g, at(0, 3), 'down', col);
  assert.equal(d1, at(1, 3));
  const d2 = C.vertical(g, d1, 'down', col);
  assert.equal(d2, at(2, 3));
  assert.equal(C.vertical(g, d2, 'down', col), -1);
  assert.equal(C.vertical(g, d2, 'up', col), at(1, 3));
});

test('column memory survives a short row in between', () => {
  const g = grid();
  const items = g.filter((_, i) => !(i >= 5 && i < 10 && i - 5 >= 2));
  const col = C.cx(items[3]);
  const d1 = C.vertical(items, 3, 'down', col);
  assert.equal(C.cx(items[d1]), C.cx(g[at(1, 1)]));
  const bottom = C.vertical(items, d1, 'down', col);
  assert.equal(C.cx(items[bottom]), C.cx(g[at(2, 3)]));
});

test('prefer wins only when the column still sits under it', () => {
  const g = grid();
  const col = C.cx(g[at(0, 3)]);
  assert.equal(C.vertical(g, at(0, 3), 'down', col, () => at(1, 4)), at(1, 3));
  assert.equal(C.vertical(g, at(0, 3), 'down', col, () => at(1, 3)), at(1, 3));
});

test('vertical needs a meaningfully different row', () => {
  const rects = [
    { left: 0, top: 0, right: 100, bottom: 100 },
    { left: 120, top: 40, right: 220, bottom: 140 },
  ];
  assert.equal(C.vertical(rects, 0, 'down', 50), -1);
});

test('scored fallback picks the one in the cone', () => {
  const rects = [
    { left: 0, top: 0, right: 100, bottom: 100 },
    { left: 200, top: 0, right: 300, bottom: 100 },
    { left: 150, top: 600, right: 250, bottom: 700 },
  ];
  assert.equal(C.scored(rects, 0, 'right'), 1);
  assert.equal(C.scored(rects, 0, 'down'), 2);
  assert.equal(C.scored(rects, 0, 'up'), -1);
});

test('billboard buttons of different heights share a row', () => {
  const rects = [
    { left: 80, top: 400, right: 220, bottom: 450 },
    { left: 240, top: 396, right: 400, bottom: 454 },
    { left: 50, top: 700, right: 250, bottom: 810 },
  ];
  assert.equal(C.groupRows(rects).length, 2);
  assert.equal(C.horizontal(rects, 0, 'right'), 1);
  assert.equal(C.vertical(rects, 1, 'down', 320), 2);
});
