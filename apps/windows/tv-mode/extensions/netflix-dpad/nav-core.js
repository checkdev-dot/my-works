// Pure spatial-navigation maths for the TV Mode Netflix Remote. No DOM here:
// everything works on plain rects {left, top, right, bottom}, so it can be
// tested with node. Loaded before content.js (a classic script, not a module).
(function (root) {
  'use strict';

  function cx(r) { return (r.left + r.right) / 2; }
  function cy(r) { return (r.top + r.bottom) / 2; }
  function w(r) { return r.right - r.left; }
  function h(r) { return r.bottom - r.top; }

  // How much two rects overlap vertically, as a share of the shorter one (0..1).
  function vOverlap(a, b) {
    var o = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    var m = Math.min(h(a), h(b));
    return m > 0 ? Math.max(0, o) / m : 0;
  }

  // Group rects into rows by vertical bands. Returns rows sorted top to bottom,
  // each {idx: [indices left to right], top, bottom, cy}.
  function groupRows(rects) {
    var order = rects.map(function (_, i) { return i; }).sort(function (a, b) {
      return cy(rects[a]) - cy(rects[b]) || rects[a].left - rects[b].left;
    });
    var rows = [];
    order.forEach(function (i) {
      var r = rects[i], hit = null;
      for (var k = rows.length - 1; k >= 0; k--) {
        if (vOverlap(r, rows[k]) >= 0.5) { hit = rows[k]; break; }
      }
      if (!hit) { hit = { idx: [], top: r.top, bottom: r.bottom, cy: cy(r) }; rows.push(hit); }
      hit.idx.push(i);
      hit.cy = hit.idx.reduce(function (s, j) { return s + cy(rects[j]); }, 0) / hit.idx.length;
    });
    rows.forEach(function (row) {
      row.idx.sort(function (a, b) { return cx(rects[a]) - cx(rects[b]); });
    });
    rows.sort(function (a, b) { return a.cy - b.cy; });
    return rows;
  }

  // Score of moving from rect a to rect b in a direction: primary-axis distance
  // plus twice the orthogonal distance. Not in that direction: Infinity. Outside
  // the 45 degree cone: heavily penalised (still reachable as a last resort).
  function score(a, b, dir) {
    var dx = cx(b) - cx(a), dy = cy(b) - cy(a), p, o;
    if (dir === 'right') { p = dx; o = Math.abs(dy); }
    else if (dir === 'left') { p = -dx; o = Math.abs(dy); }
    else if (dir === 'down') { p = dy; o = Math.abs(dx); }
    else { p = -dy; o = Math.abs(dx); }
    if (!(p > 0.5)) return Infinity;
    var s = p + 2 * o;
    if (o > p) s += 10000;
    return s;
  }

  // Best rect by score from rect `from` (index), or -1.
  function scored(rects, from, dir) {
    var best = -1, bs = Infinity;
    rects.forEach(function (r, i) {
      if (i === from) return;
      var s = score(rects[from], r, dir);
      if (s < bs) { bs = s; best = i; }
    });
    return best;
  }

  // Left/Right inside the row: the nearest rect in that direction that shares
  // vertical space with the current one. -1 at the row's edge.
  function horizontal(rects, from, dir) {
    var a = rects[from], best = -1, bd = Infinity;
    rects.forEach(function (r, i) {
      if (i === from || vOverlap(a, r) < 0.4) return;
      var d = dir === 'right' ? cx(r) - cx(a) : cx(a) - cx(r);
      if (d <= 1) return;
      var beside = dir === 'right' ? r.right > a.right - 1 : r.left < a.left + 1;
      if (!beside) return;
      d += Math.abs(cy(r) - cy(a)) * 0.01;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  // Up/Down: the nearest row above/below (its centre must be meaningfully above
  // or below), then the item closest to colX. prefer(rowIdxs) may name the item
  // remembered for that row; it wins if colX is still roughly under it.
  function vertical(rects, from, dir, colX, prefer) {
    var rows = groupRows(rects), cur = null, curRow = -1;
    rows.forEach(function (row, k) { if (row.idx.indexOf(from) >= 0) { cur = row; curRow = k; } });
    if (!cur) return -1;
    var a = rects[from], gap = Math.max(6, 0.4 * Math.min(h(a), cur.bottom - cur.top));
    var target = null, td = Infinity;
    rows.forEach(function (row, k) {
      if (k === curRow) return;
      var d = dir === 'down' ? row.cy - cur.cy : cur.cy - row.cy;
      if (d < gap) return;
      if (d < td) { td = d; target = row; }
    });
    if (!target) return -1;
    if (prefer) {
      var p = prefer(target.idx);
      if (p != null && p >= 0 && Math.abs(cx(rects[p]) - colX) <= Math.max(w(rects[p]) * 0.75, 1)) return p;
    }
    var best = -1, bd = Infinity;
    target.idx.forEach(function (i) {
      var r = rects[i];
      var d = colX >= r.left && colX <= r.right ? Math.abs(cx(r) - colX) * 0.001 : Math.min(Math.abs(colX - r.left), Math.abs(colX - r.right));
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  var api = { cx: cx, cy: cy, vOverlap: vOverlap, groupRows: groupRows, score: score, scored: scored, horizontal: horizontal, vertical: vertical };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TVNavCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
