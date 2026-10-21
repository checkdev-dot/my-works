/*
  The society: towers, trees, birds, clouds, a night sky.
  Everything is authored SVG, drawn from code so it scales to any screen.
  Scenes: "intro" (full screen, the lift climbs your tower), "home" (Wi-Fi hero),
          "gate" (your gate with boom barrier, guard booth, car), "road" (delivery scooter).
*/
(function () {
  var HOME = window.HOME || {};
  var SOC = String(HOME.society || "Home").toUpperCase(), GATE = "GATE " + (HOME.gate || ""), TMARK = String(HOME.tower || "").replace(/\D/g, "") || "1";
  var FLOOR = Math.min(28, parseInt(String(HOME.flat || "101").slice(0, -2), 10) || 1);
  var hr = new Date().getHours();
  var q = location.search;
  var NIGHT = !/[?&]day/.test(q);   // the app lives on a black canvas, so the society is always at night

  var C = NIGHT ? {
    skyTop: "#1a2b6b", skyBot: "#4b5cc4", far: "#3a4a9e", farSide: "#2f3d85",
    face: "#f1ecff", side: "#c9c0f0", roof: "#ddd5ff", trim: "#8f84d6",
    win: "#5a64b8", lit: "#ffd24d", ground: "#1d4a12", groundTop: "#2f6f1c",
    road: "#3c3f58", cloud: "rgba(255,255,255,.18)", orb: "#fff3c4", bird: "#ffffff"
  } : {
    skyTop: "#5ec8ff", skyBot: "#c9f0ff", far: "#a6dcf7", farSide: "#8fcdee",
    face: "#ffffff", side: "#d7e9f5", roof: "#eef7fc", trim: "#1cb0f6",
    win: "#bfe7fb", lit: "#ffffff", ground: "#58cc02", groundTop: "#89e219",
    road: "#4b4b4b", cloud: "#ffffff", orb: "#ffc800", bird: "#3c3c3c"
  };

  function rnd(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function f(n) { return Math.round(n * 10) / 10; }

  // A tower with a lit front, a shaded side and a roof: chunky, flat, slightly isometric.
  function tower(o) {
    var r = rnd(o.seed || 9), d = o.d || 12, x = o.x, y = o.y, w = o.w, h = o.h, top = y - h, k = d * 0.6;
    var g = '<g class="tower">';
    g += '<path d="M' + f(x + w) + ' ' + f(top) + 'l' + d + ' ' + -k + 'V' + f(y - k) + 'l' + -d + ' ' + k + 'z" fill="' + (o.side || C.side) + '"/>';
    g += '<path d="M' + x + ' ' + f(top) + 'l' + d + ' ' + -k + 'h' + w + 'l' + -d + ' ' + k + 'z" fill="' + (o.roof || C.roof) + '"/>';
    g += '<rect x="' + x + '" y="' + f(top) + '" width="' + w + '" height="' + h + '" fill="' + (o.face || C.face) + '"/>';
    if (o.band) g += '<rect x="' + x + '" y="' + f(top) + '" width="' + w + '" height="4" fill="' + C.trim + '"/>';
    var floors = o.floors || 30, cols = Math.max(2, Math.floor((w - 8) / 11)), cw = (w - 8) / cols, fh = (h - 12) / floors;
    var info = { floorY: function (n) { return y - 6 - (n - 0.5) * fh; }, x: x, w: w, fh: fh };
    if (o.windows !== false) {
      for (var fl = 0; fl < floors; fl++) {
        for (var c = 0; c < cols; c++) {
          var wx = x + 4 + c * cw + cw * 0.18, wy = y - 6 - (fl + 1) * fh + fh * 0.22;
          var lit = NIGHT ? r() < 0.42 : r() < 0.12;
          var hl = o.hl && fl === o.hl - 1 && c === Math.floor(cols / 2);
          g += '<rect' + (hl ? ' class="home-win"' : '') + (o.tag ? ' data-f="' + (fl + 1) + '"' : '') + ' x="' + f(wx) + '" y="' + f(wy) + '" width="' + f(cw * 0.64) + '" height="' + f(Math.max(1.4, fh * 0.56)) + '" rx="1" fill="' + (hl ? "#ffc800" : lit ? C.lit : C.win) + '"/>';
        }
      }
    }
    if (o.mark) {
      var cx = x + w / 2, cy = top - k - 16;
      g += '<g class="tmark"><circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="13" fill="#58cc02" stroke="#46a302" stroke-width="3"/>' +
        '<text x="' + f(cx) + '" y="' + f(cy + 5) + '" text-anchor="middle" font-family="-apple-system, Inter, system-ui, sans-serif" font-weight="700" font-size="15" fill="#fff">' + o.mark + '</text></g>';
    }
    g += '</g>';
    return { svg: g, info: info };
  }

  // A rooftop billboard: two legs, a dark panel, neon lettering. Sits on a roof at (cx, roofY).
  function billboard(cx, roofY, w, fs) {
    var pad = Math.max(5, fs * 0.8), h = fs + pad * 1.3, x = cx - w / 2, y = roofY - h - 9;
    return '<g class="billboard">' +
      '<rect x="' + f(x + w * 0.2) + '" y="' + f(y + h) + '" width="3" height="10" fill="#8f84d6"/><rect x="' + f(x + w * 0.8 - 3) + '" y="' + f(y + h) + '" width="3" height="10" fill="#8f84d6"/>' +
      '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + w + '" height="' + h + '" rx="3" fill="#0f1640" stroke="#494fdf" stroke-width="2"/>' +
      '<text class="neon" x="' + f(cx) + '" y="' + f(y + h / 2 + fs * 0.36) + '" text-anchor="middle" font-family="-apple-system, Inter, system-ui, sans-serif" font-weight="700" font-size="' + fs + '" textLength="' + f(w - pad * 2) + '" lengthAdjust="spacingAndGlyphs" fill="#ffd24d">' + SOC + '</text></g>';
  }

  function tree(x, y, s, i) {
    s = s || 1;
    return '<g class="tree" style="--d:' + (2.6 + (i % 3) * 0.5) + 's;--o:' + f(x) + 'px ' + f(y) + 'px">' +
      '<rect x="' + f(x - 2.5 * s) + '" y="' + f(y - 14 * s) + '" width="' + f(5 * s) + '" height="' + f(14 * s) + '" rx="2" fill="#a5743f"/>' +
      '<circle cx="' + f(x) + '" cy="' + f(y - 24 * s) + '" r="' + f(15 * s) + '" fill="#46a302"/>' +
      '<circle cx="' + f(x - 3 * s) + '" cy="' + f(y - 27 * s) + '" r="' + f(12.5 * s) + '" fill="#58cc02"/>' +
      '<circle cx="' + f(x - 6 * s) + '" cy="' + f(y - 31 * s) + '" r="' + f(5 * s) + '" fill="#89e219"/></g>';
  }
  function bush(x, y, s) {
    return '<g><circle cx="' + f(x) + '" cy="' + f(y - 6 * s) + '" r="' + f(9 * s) + '" fill="#46a302"/><circle cx="' + f(x + 9 * s) + '" cy="' + f(y - 5 * s) + '" r="' + f(7 * s) + '" fill="#58cc02"/></g>';
  }
  function cloud(x, y, s, dur) {
    return '<g class="cloud" style="--dur:' + dur + 's"><g transform="translate(' + f(x) + ' ' + f(y) + ') scale(' + s + ')" fill="' + C.cloud + '">' +
      '<rect x="0" y="10" width="60" height="16" rx="8"/><circle cx="20" cy="12" r="11"/><circle cx="38" cy="8" r="14"/></g></g>';
  }
  function birds(y, n, dur, delay) {
    var g = '<g class="flock" style="--dur:' + dur + 's;--delay:' + delay + 's">';
    for (var i = 0; i < n; i++) {
      var bx = i * 18 + (i % 2) * 6, by = y + (i % 3) * 8 - i * 2;
      g += '<g transform="translate(' + bx + ' ' + by + ')"><path class="wing" style="--fd:' + (0.32 + i * 0.04) + 's" d="M0 0q5 -6 10 0q5 -6 10 0" fill="none" stroke="' + C.bird + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>';
    }
    return g + '</g>';
  }
  function sky(id, W, H) {
    return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C.skyTop + '"/><stop offset="1" stop-color="' + C.skyBot + '"/></linearGradient></defs>' +
      '<rect width="' + W + '" height="' + H + '" fill="url(#' + id + ')"/>';
  }
  function orb(x, y, r) {
    if (NIGHT) {
      var stars = "", rr = rnd(5);
      for (var i = 0; i < 26; i++) stars += '<circle class="star" style="--tw:' + (1.5 + rr() * 2.5).toFixed(2) + 's" cx="' + f(rr() * 400) + '" cy="' + f(rr() * y * 2.2) + '" r="' + f(0.6 + rr() * 1.1) + '" fill="#fff"/>';
      return stars + '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + C.orb + '"/><circle cx="' + (x + r * 0.45) + '" cy="' + (y - r * 0.3) + '" r="' + r * 0.85 + '" fill="' + C.skyTop + '"/>';
    }
    return '<g class="sun"><circle cx="' + x + '" cy="' + y + '" r="' + (r + 10) + '" fill="#ffc800" opacity=".25"/><circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + C.orb + '"/></g>';
  }
  function ground(W, H, gy) {
    return '<rect y="' + gy + '" width="' + W + '" height="' + (H - gy) + '" fill="' + C.ground + '"/><rect y="' + gy + '" width="' + W + '" height="6" fill="' + C.groundTop + '"/>';
  }
  function farTowers(gy, scale) {
    var g = '<g class="far">', r = rnd(3), x = -10;
    while (x < 410) {
      var w = 34 + r() * 26, h = (90 + r() * 120) * scale;
      g += '<rect x="' + f(x) + '" y="' + f(gy - h) + '" width="' + f(w) + '" height="' + f(h) + '" fill="' + C.far + '"/>';
      g += '<rect x="' + f(x + w) + '" y="' + f(gy - h + 4) + '" width="6" height="' + f(h - 4) + '" fill="' + C.farSide + '"/>';
      x += w + 8 + r() * 14;
    }
    return g + "</g>";
  }

  /* ---------------- scenes ---------------- */
  var S = {};

  // Full-screen onboarding: three towers, yours in front with its lift and your flat's window.
  S.intro = function () {
    var W = 400, H = 860, gy = H - 150;
    var t9 = tower({ x: 140, y: gy, w: 112, h: 450, floors: 30, hl: FLOOR, mark: TMARK, seed: 21, d: 16, band: true, tag: true });
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' + sky("sk-i", W, H) + orb(330, 250, 26) +
      '<line class="shoot" x1="40" y1="60" x2="120" y2="100" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>' +
      cloud(20, 150, 1.1, 38) + cloud(230, 220, 0.8, 52) + cloud(110, 70, 0.7, 64) +
      farTowers(gy, 1.1) +
      tower({ x: 14, y: gy, w: 96, h: 320, floors: 18, seed: 4, d: 14 }).svg + billboard(62, gy - 320 - 8, 104, 9) +
      tower({ x: 288, y: gy, w: 96, h: 360, floors: 20, seed: 11, d: 14 }).svg +
      t9.svg +
      '<g class="lift" style="--fh:' + f(t9.info.fh) + 'px"><rect x="' + f(140 + 112 / 2 - 7) + '" y="' + f(t9.info.floorY(1) - 6) + '" width="14" height="12" rx="3" fill="#ffc800" stroke="#e5a800" stroke-width="2"/></g>' +
      '<circle class="win-glow" cx="' + f(140 + 56) + '" cy="' + f(t9.info.floorY(FLOOR)) + '" r="10" fill="#ffc800"/>' +
      ground(W, H, gy) +
      '<rect x="160" y="' + gy + '" width="72" height="' + (H - gy) + '" fill="#e8d7b0"/>' +
      tree(30, gy + 40, 1.3, 0) + tree(95, gy + 70, 1.6, 1) + tree(300, gy + 55, 1.4, 2) + tree(365, gy + 85, 1.7, 3) + bush(130, gy + 30, 1.2) + bush(250, gy + 32, 1.2) +
      birds(260, 4, 16, 0) + birds(330, 3, 22, 7) +
      '</svg>';
    return { svg: s, floorY: t9.info.floorY, fh: t9.info.fh };
  };

  // Wi-Fi hero: the skyline behind the greeting.
  S.home = function () {
    var W = 400, H = 300, gy = H - 34;
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' + sky("sk-h", W, H) + orb(362, 176, 13) +
      cloud(10, 70, 0.8, 40) + cloud(250, 120, 0.6, 55) +
      farTowers(gy, 0.32) +
      tower({ x: 6, y: gy, w: 70, h: 78, floors: 7, seed: 4, d: 10 }).svg +
      tower({ x: 316, y: gy, w: 74, h: 86, floors: 8, seed: 11, d: 10 }).svg +
      tower({ x: 150, y: gy, w: 84, h: 104, floors: 11, hl: 8, seed: 21, d: 12, band: true }).svg + billboard(198, gy - 104 - 7, 100, 8) +
      ground(W, H, gy) + tree(108, gy + 22, 1.05, 0) + tree(282, gy + 24, 1.15, 1) + tree(40, gy + 28, 0.9, 2) + tree(360, gy + 30, 0.95, 3) +
      birds(150, 3, 18, 2) + '</svg>';
  };

  // Arrive: your gate, boom barrier, guard booth, a car that drives in.
  S.gate = function () {
    var W = 400, H = 220, gy = 168;
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' + sky("sk-g", W, H) + orb(52, 44, 16) +
      cloud(240, 30, 0.6, 46) +
      farTowers(gy, 0.6) +
      tower({ x: 250, y: gy, w: 66, h: 130, floors: 12, mark: TMARK, seed: 21, d: 10, band: true }).svg +
      ground(W, H, gy) +
      '<rect x="0" y="' + (gy + 18) + '" width="' + W + '" height="34" fill="' + C.road + '"/>' +
      '<line class="dash" x1="0" y1="' + (gy + 35) + '" x2="' + W + '" y2="' + (gy + 35) + '" stroke="#fff" stroke-width="3" stroke-dasharray="14 12"/>' +
      // gate pillars and beam
      '<rect x="96" y="' + (gy - 92) + '" width="20" height="112" rx="3" fill="#fff"/><rect x="116" y="' + (gy - 88) + '" width="6" height="108" fill="#d7e3ea"/>' +
      '<rect x="290" y="' + (gy - 92) + '" width="20" height="112" rx="3" fill="#fff"/><rect x="310" y="' + (gy - 88) + '" width="6" height="108" fill="#d7e3ea"/>' +
      '<rect x="88" y="' + (gy - 110) + '" width="236" height="30" rx="8" fill="#58cc02"/><rect x="88" y="' + (gy - 86) + '" width="236" height="6" rx="3" fill="#46a302"/>' +
      '<text x="206" y="' + (gy - 89) + '" text-anchor="middle" font-family="-apple-system, Inter, system-ui, sans-serif" font-weight="700" font-size="17" letter-spacing="2" fill="#fff">' + GATE + '</text>' +
      // guard booth
      '<g class="prop"><rect x="40" y="' + (gy - 50) + '" width="44" height="58" rx="4" fill="#ffc800"/><rect x="40" y="' + (gy - 58) + '" width="48" height="10" rx="3" fill="#e5a800"/><rect x="48" y="' + (gy - 40) + '" width="28" height="18" rx="3" fill="#bfe7fb"/></g>' +
      // boom barrier (pivot at 124, gy-6)
      '<g class="boom"><rect x="120" y="' + (gy - 10) + '" width="166" height="9" rx="4.5" fill="#ff4b4b"/>' +
      '<rect x="146" y="' + (gy - 10) + '" width="18" height="9" fill="#fff"/><rect x="186" y="' + (gy - 10) + '" width="18" height="9" fill="#fff"/><rect x="226" y="' + (gy - 10) + '" width="18" height="9" fill="#fff"/><rect x="262" y="' + (gy - 10) + '" width="18" height="9" fill="#fff"/></g>' +
      '<circle cx="124" cy="' + (gy - 6) + '" r="7" fill="#4b4b4b"/>' +
      // the car
      '<g class="car"><g transform="translate(-70 ' + (gy + 6) + ')">' +
      '<rect x="0" y="10" width="62" height="18" rx="7" fill="#1cb0f6"/><path d="M12 10 l8 -12 h20 l10 12z" fill="#1cb0f6"/><path d="M18 10 l5 -8 h7 v8z M33 10 v-8 h6 l7 8z" fill="#ddf4ff"/>' +
      '<rect x="0" y="22" width="62" height="6" rx="3" fill="#1899d6"/><circle class="wheel" cx="15" cy="29" r="7" fill="#3c3c3c"/><circle class="wheel" cx="47" cy="29" r="7" fill="#3c3c3c"/><circle cx="15" cy="29" r="2.5" fill="#e5e5e5"/><circle cx="47" cy="29" r="2.5" fill="#e5e5e5"/>' +
      '<rect x="57" y="14" width="5" height="4" rx="1" fill="#ffc800"/></g></g>' +
      tree(20, gy + 4, 0.85, 0) + tree(350, gy + 4, 1, 1) + tree(380, gy + 6, 0.8, 2) +
      birds(40, 3, 20, 4) + '</svg>';
  };

  // Order: a delivery scooter rides past the towers. Its box takes the colour of the app you tap.
  S.road = function () {
    var W = 400, H = 190, gy = 132;
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' + sky("sk-r", W, H) + orb(350, 40, 15) +
      cloud(30, 26, 0.6, 44) + cloud(200, 50, 0.5, 60) +
      farTowers(gy, 0.55) +
      tower({ x: 30, y: gy, w: 60, h: 110, floors: 10, seed: 4, d: 9 }).svg +
      tower({ x: 168, y: gy, w: 70, h: 92, floors: 9, hl: 7, seed: 21, d: 10, band: true }).svg + billboard(208, gy - 92 - 6, 86, 7) +
      tower({ x: 300, y: gy, w: 62, h: 100, floors: 9, seed: 11, d: 9 }).svg +
      ground(W, H, gy) +
      '<rect x="0" y="' + (gy + 12) + '" width="' + W + '" height="40" fill="' + C.road + '"/>' +
      '<line class="dash fast" x1="0" y1="' + (gy + 32) + '" x2="' + W + '" y2="' + (gy + 32) + '" stroke="#fff" stroke-width="3" stroke-dasharray="16 14"/>' +
      tree(120, gy + 6, 0.8, 0) + tree(268, gy + 6, 0.9, 1) + tree(390, gy + 6, 0.8, 2) +
      '<g class="scooter"><g transform="translate(150 ' + (gy + 2) + ')"><g class="bob">' +
      '<rect class="box" x="-2" y="-2" width="24" height="22" rx="5" fill="var(--box, #ff9600)"/><rect x="-2" y="-2" width="24" height="5" rx="2" fill="rgba(0,0,0,.18)"/>' +
      '<path d="M20 22 h30 l8 -10 h6" fill="none" stroke="#ff4b4b" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="34" cy="2" r="9" fill="#ffd9b0"/><path d="M25 0 a9 9 0 0 1 18 -2 v-1 h-18z" fill="var(--box, #ff9600)"/><rect x="28" y="10" width="14" height="14" rx="5" fill="var(--box, #ff9600)"/>' +
      '<circle class="wheel" cx="12" cy="30" r="8" fill="#3c3c3c"/><circle class="wheel" cx="58" cy="30" r="8" fill="#3c3c3c"/><circle cx="12" cy="30" r="3" fill="#e5e5e5"/><circle cx="58" cy="30" r="3" fill="#e5e5e5"/>' +
      '</g></g></g>' +
      birds(30, 3, 19, 1) + '</svg>';
  };

  window.Scene = { make: S, night: NIGHT };
})();
