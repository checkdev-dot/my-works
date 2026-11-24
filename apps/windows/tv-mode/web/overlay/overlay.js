/* TV Mode overlay. Injected by the Go program into every service page.
   One root, closed Shadow DOM, no innerHTML (Trusted Types safe), no inline <style> (CSP safe),
   no timers while hidden. Contract: PROTOCOL.md, "Go -> page overlay". */
(function () {
  "use strict";
  if (window.top !== window) return;
  if (window.__tv) return;

  var FACE = '"TVModeCond","Bahnschrift Condensed","Arial Narrow","Segoe UI",sans-serif';
  var LAMPS = 40;
  var STEP_MS = 30;
  var HOLD_MS = 2000;

  var CSS = [
    ":host{all:initial}",
    ".bar{position:fixed;left:0;right:0;top:2.2vh;display:flex;flex-direction:column;align-items:center;gap:.7vh;opacity:0;pointer-events:none;" +
      "font-family:" + FACE + ";font-variant-numeric:tabular-nums lining-nums;font-weight:700;text-transform:uppercase;-webkit-font-smoothing:antialiased}",
    ".bar.on{opacity:1}",
    ".bar.fade{transition:opacity .3s linear}",
    ".mk{display:flex;align-items:baseline;gap:1.4vw;padding:.9vh 2.2vw;border-radius:.5vh;background:#1f1f1f;color:#e6e6e6;outline:.25vh solid #4a4a4a;outline-offset:-.25vh;" +
      "font-size:clamp(20px,2.7vw,64px);line-height:1;letter-spacing:.1em;white-space:nowrap}",
    ".mk.lost{background:#000000;color:#e6e6e6;outline:.35vh solid #4a4a4a;outline-offset:-.35vh}",
    ".mk .v{letter-spacing:.04em}",
    ".mk s{text-decoration-thickness:.4vh}",
    ".rail{display:flex;justify-content:space-between;align-items:center;width:min(62vw,1500px);padding:.8vh 1vw;border-radius:.5vh;background:#000000}",
    ".rail[hidden]{display:none}",
    ".rail i{display:block;width:clamp(5px,.55vw,13px);height:clamp(5px,.55vw,13px);border-radius:50%;background:#4a4a4a}",
    ".rail i.lit{background:#b00710}",
    ".ptr{position:fixed;left:0;top:0;display:none;width:clamp(26px,1.7vw,44px);height:clamp(26px,1.7vw,44px);box-sizing:border-box;" +
      "border-radius:50%;background:#b00710;border:max(3px,.18vw) solid #e6e6e6;pointer-events:none;will-change:transform}",
    ".ptr.on{display:block}",
    ".cal{position:fixed;top:50%;display:none;width:clamp(48px,4vw,96px);height:clamp(48px,4vw,96px);border-radius:50%;" +
      "background:#b00710;transform:translate(-50%,-50%);pointer-events:none;box-shadow:0 0 0 max(6px,.5vw) #4a4a4a}",
    ".cal.on{display:block}",
    ".foc{position:fixed;left:0;top:0;display:none;box-sizing:border-box;pointer-events:none;border-radius:3px;border:2px solid #e6e6e6;outline:1px solid rgba(0,0,0,.55);will-change:transform}",
    ".foc.on{display:block}",
    "@media (prefers-reduced-motion:reduce){.bar.fade{transition:none}}"
  ].join("\n");

  var supportsPopover = typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  var host = null, bar, mk, rail, ptr, lampEls = [];
  var lampsLit = 0, lampTarget = 0, lampTimer = 0, hideTimer = 0;
  var barOn = false, ptrOn = false, fontTried = false, cal, calOn = false;
  var topTimer = 0;

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function loadFont() {
    if (fontTried || window.__tvNoFont === true) return;
    fontTried = true;
    try {
      if (typeof FontFace === "undefined" || !document.fonts) return;
      if (typeof window.__tvFont !== "string" || !window.__tvFont) return;
      var bin = atob(window.__tvFont), buf = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      var f = new FontFace("TVModeCond", buf.buffer, { weight: "700" });
      f.load().then(function (ff) { document.fonts.add(ff); }, function () {});
    } catch (e) {}
  }

  function build() {
    if (host) return;
    host = document.createElement("tv-mode-root");
    var root = host.attachShadow({ mode: "closed" });
    var sheetOk = false;
    try {
      var sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
      sheetOk = true;
    } catch (e) {}
    if (!sheetOk) {
      var st = document.createElement("style");
      st.textContent = CSS;
      root.appendChild(st);
    }
    bar = el("div", "bar");
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-live", "polite");
    mk = el("div", "mk");
    rail = el("div", "rail");
    rail.setAttribute("aria-hidden", "true");
    for (var i = 0; i < LAMPS; i++) { var l = el("i"); rail.appendChild(l); lampEls.push(l); }
    bar.appendChild(mk);
    bar.appendChild(rail);
    ptr = el("div", "ptr");
    ptr.setAttribute("aria-hidden", "true");
    cal = el("div", "cal");
    cal.setAttribute("aria-hidden", "true");
    foc = el("div", "foc");
    foc.setAttribute("aria-hidden", "true");
    root.appendChild(bar);
    root.appendChild(cal);
    root.appendChild(foc);
    root.appendChild(ptr);

    // CSSOM only: page CSP may forbid inline style attributes.
    var s = host.style;
    var props = { position: "fixed", inset: "0", width: "100vw", height: "100vh", margin: "0", padding: "0", border: "0",
      background: "transparent", overflow: "visible", "pointer-events": "none", "max-width": "none", "max-height": "none",
      "z-index": "2147483647", display: "none" };
    for (var p in props) s.setProperty(p, props[p], "important");
    if (supportsPopover) host.setAttribute("popover", "manual");
    place();
  }

  /* ---------- top layer / fullscreen ---------- */
  function parentFor() {
    var fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (fs && !/^(VIDEO|IFRAME|IMG|INPUT|CANVAS|EMBED|OBJECT)$/.test(fs.tagName)) return fs;
    return document.documentElement;
  }

  function place() {
    if (!host) return;
    var want = parentFor();
    if (!want) return;
    var moved = host.parentNode !== want;
    if (moved) want.appendChild(host); // a moved popover hides itself
    if (barOn || ptrOn || calOn || focOn) raise(moved);
  }

  /* Re-stack the overlay above whatever the page put in the top layer since
     (player controls, dialogs): hide and show the popover again. */
  function restack() {
    if (!host || !(barOn || ptrOn || calOn || focOn)) return;
    place();
    raise(true);
  }

  function ensureTop() {
    if (!host) return;
    if (!host.isConnected) { place(); return; }
    if (supportsPopover) {
      try { if (!host.matches(":popover-open")) host.showPopover(); } catch (e) {}
    }
  }

  function raise(force) {
    host.style.setProperty("display", "block", "important");
    if (!supportsPopover) return;
    try {
      var open = host.matches(":popover-open");
      if (open && !force) return;
      if (open) host.hidePopover();
      host.showPopover();
    } catch (e) {}
  }

  function lower() {
    if (!host) return;
    if (supportsPopover) { try { host.hidePopover(); } catch (e) {} }
    host.style.setProperty("display", "none", "important");
  }

  function syncActive() {
    if (barOn || ptrOn || calOn || focOn) { place(); raise(false); }
    else lower();
    clearInterval(topTimer);
    topTimer = 0;
    // while the pointer or ring is up, re-stack once a second (sites open their own top-layer UI)
    if (ptrOn || focOn) topTimer = setInterval(restack, 1000);
  }

  /* ---------- lamps: 30 ms per lamp ---------- */
  // The rail is always painted whole from lampsLit, so the DOM can never drift
  // from the number (painting one lamp per step missed the last lamp of every
  // rise, and the rail fell behind the volume).
  function paintAll() { for (var i = 0; i < lampEls.length; i++) { var c = i < lampsLit ? "lit" : ""; if (lampEls[i].className !== c) lampEls[i].className = c; } }

  function setLamps(n, instant) {
    n = Math.max(0, Math.min(LAMPS, Math.round(n)));
    lampTarget = n;
    clearTimeout(lampTimer);
    lampTimer = 0;
    if (instant || reduce.matches || n === lampsLit) { jump(n); return; }
    var gap = Math.abs(n - lampsLit);
    var every = Math.min(STEP_MS, 450 / gap);
    (function tick() {
      lampsLit += lampsLit < n ? 1 : -1;
      paintAll();
      if (lampsLit !== n) lampTimer = setTimeout(tick, every);
      else lampTimer = 0;
    })();
  }

  function jump(n) {
    lampsLit = n;
    paintAll();
  }

  /* ---------- bar ---------- */
  function clock(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") + m : m) + ":" + (s < 10 ? "0" : "") + s;
  }

  function put(parts, opt) {
    while (mk.firstChild) mk.removeChild(mk.firstChild);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], n;
      if (p.strike) { n = el("s"); } else { n = el("span"); if (p.v) n.className = "v"; }
      n.textContent = p.t;
      mk.appendChild(n);
    }
    mk.className = opt && opt.lost ? "mk lost" : "mk";
  }

  function reveal() {
    barOn = true;
    syncActive();
    bar.className = "bar on";
    clearTimeout(hideTimer);
    hideTimer = setTimeout(dim, HOLD_MS);
  }

  function dim() {
    hideTimer = 0;
    bar.className = "bar fade";
    // fade is 300 ms; then drop out of the top layer so nothing runs while hidden
    hideTimer = setTimeout(function () {
      hideTimer = 0;
      clearTimeout(lampTimer);
      lampTimer = 0;
      jump(lampTarget);
      barOn = false;
      syncActive();
    }, reduce.matches ? 0 : 320);
  }

  function show(kind, d) {
    d = d || {};
    build();
    loadFont();
    if (barOn && bar.className === "bar fade") bar.className = "bar on";
    rail.hidden = true;
    switch (kind) {
      case "vol":
        if (d.muted) { put([{ t: "Muted" }]); rail.hidden = false; setLamps(0, !barOn); }
        else { put([{ t: "Volume" }, { t: String(Math.round(d.vol || 0)), v: 1 }]); rail.hidden = false; setLamps((d.vol || 0) / 100 * LAMPS, !barOn); }
        break;
      case "seek":
        put([{ t: clock(d.pos), v: 1 }, { t: "/" }, { t: clock(d.dur), v: 1 }]);
        rail.hidden = false;
        setLamps(d.dur > 0 ? (d.pos / d.dur) * LAMPS : 0, !barOn);
        break;
      case "sleep":
        put([{ t: "Sleep" }, { t: String(Math.max(0, Math.round(d.minLeft || 0))), v: 1 }, { t: "min" }]);
        break;
      case "countdown":
        put([{ t: "Shutting down in" }, { t: String(Math.max(0, Math.round(d.s || 0))), v: 1 }]);
        rail.hidden = false;
        if (!barOn) setLamps(LAMPS, true);
        setLamps(Math.max(0, d.s || 0) / 10 * LAMPS);
        break;
      case "cancelled":
        put([{ t: String(d.what || "Shutdown"), strike: 1 }, { t: "Cancelled" }]);
        break;
      case "opening":
        put([{ t: "Opening" }, { t: String(d.name || ""), v: 1 }]);
        break;
      case "phone":
        put([{ t: d.on ? "Phone on" : "No phone" }], { lost: !d.on });
        break;
      case "link": // the relay to the phone is down: the phone says "PC off or asleep"
        put([{ t: "Phone link down" }, { t: String(d.why || "Restart TV Mode from the desktop shortcut"), v: 1 }], { lost: true });
        break;
      default:
        return;
    }
    reveal();
  }

  /* ---------- pointer: a laser dot that eases toward the newest target ---------- */
  // Go sends targets (up to ~60/s); the dot is drawn by requestAnimationFrame and
  // eases toward the newest target with exponential smoothing, tau ~50 ms, so
  // uneven arrivals still look like smooth motion. The loop runs only while the
  // pointer is shown. pointer() returns {h, e}: e = 1 once after the dot entered a new
  // clickable thing (Go turns it into a haptic tick); h is always 0 (no slowing).
  var TAU = 50;                    // ms
  var tx = 0, ty = 0, px = 0, py = 0, pLast = 0, pRaf = 0, pFresh = true;
  var hoverEl = null, hoverAt = 0, pendingEnter = 0;

  var pTmo = 0;
  // rAF paused (window covered, page busy): a 40 ms timer carries the animation, whichever fires first runs it
  function pnext() {
    if (pRaf || pTmo) return;
    pRaf = requestAnimationFrame(function (t) { clearTimeout(pTmo); pstep(t); });
    pTmo = setTimeout(function () { if (pRaf) cancelAnimationFrame(pRaf); pstep(performance.now()); }, 40);
  }
  function pstep(now) {
    pRaf = 0; pTmo = 0;
    if (!ptrOn) return;
    var dt = pLast ? Math.min(100, now - pLast) : 16;
    pLast = now;
    var a = 1 - Math.exp(-dt / TAU);
    px += (tx - px) * a;
    py += (ty - py) * a;
    if (Math.abs(tx - px) < 0.05) px = tx;
    if (Math.abs(ty - py) < 0.05) py = ty;
    ptr.style.setProperty("transform", "translate(" + px.toFixed(1) + "px," + py.toFixed(1) + "px) translate(-50%,-50%)");
    pnext();
  }

  function pointer(x, y, visible) {
    if (!visible) {
      if (ptrOn) { ptrOn = false; if (ptr) ptr.className = "ptr"; if (pRaf) cancelAnimationFrame(pRaf); clearTimeout(pTmo); pRaf = pTmo = 0; hoverEl = null; syncActive(); }
      return { h: 0, e: 0 };
    }
    build();
    tx = x; ty = y;
    if (!ptrOn) {
      ptrOn = true; ptr.className = "ptr on"; px = x; py = y; pLast = 0; // appear where it is: snap, do not glide
      ptr.style.setProperty("transform", "translate(" + Math.round(x) + "px," + Math.round(y) + "px) translate(-50%,-50%)");
      syncActive();
    }
    focHide(); // the pointer and the focus outline never show together
    ensureTop();
    pnext();
    var nowT = performance.now();
    if (nowT - hoverAt > 50) { hoverAt = nowT; hoverTest(x, y); } // haptic tick when the aim enters a new pressable thing
    var e = pendingEnter; pendingEnter = 0;
    return { h: 0, e: e };
  }

  function ptrState() { return { tx: tx, ty: ty, px: px, py: py, on: ptrOn }; }

  /* ---------- what counts as something you can press ---------- */
  var SEL = "a[href],button,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=switch],[role=radio],[onclick],summary," +
    "input:not([type=hidden]),select,textarea,[contenteditable=true],[tabindex]:not([tabindex^='-'])";
  var MAXAREA = 0.6;      // bigger than this share of the viewport is a page, not a button

  function related(a, b) { for (var n = b; n; n = n.parentNode || n.host) if (n === a) return true; return false; }
  function isCursorPtr(e) { try { return getComputedStyle(e).cursor === "pointer"; } catch (x) { return false; } }

  function hoverTest(x, y) {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return;
    var t = document.elementFromPoint(x, y);
    if (!t || t === document.documentElement || t === document.body) { hoverEl = null; return; }
    var c = t.closest ? t.closest(SEL) : null;
    if (!c && isCursorPtr(t)) c = t;
    if (c) {
      var r = c.getBoundingClientRect();
      if (r.width * r.height > MAXAREA * innerWidth * innerHeight) c = null;
    }
    if (c && c !== hoverEl) pendingEnter = 1;
    hoverEl = c || null;
  }

  function deepAll(root, out, cap) {
    var list = root.querySelectorAll("*");
    for (var i = 0; i < list.length && out.length < cap; i++) {
      var e = list[i];
      out.push(e);
      if (e.shadowRoot) deepAll(e.shadowRoot, out, cap);
    }
    return out;
  }

  // Everything pressable that is visible (or just off screen in a carousel) and not covered.
  function candidates() {
    var W = innerWidth, H = innerHeight, all = deepAll(document, [], 20000), out = [], i, e, r;
    for (i = 0; i < all.length; i++) {
      e = all[i];
      if (e === host || e.tagName === "TV-MODE-ROOT") continue;
      var isSel = false;
      try { isSel = e.matches(SEL); } catch (x) {}
      // a carousel slide with nothing pressable inside is the card itself (Hotstar's poster
      // rows: an image in a swiper slide, clicked through a script handler, no link, no cursor)
      if (!isSel && e.classList && e.classList.contains("swiper-slide") && !e.querySelector(SEL)) isSel = true;
      if (!isSel && !/^(DIV|SPAN|LI|IMG|SVG|FIGURE|PICTURE|P|H1|H2|H3|H4|SECTION|ARTICLE)$/i.test(e.tagName)) continue;
      r = e.getBoundingClientRect();
      if (r.width < 12 || r.height < 10) continue;
      if (r.right < -W * 0.5 || r.left > W * 1.5 || r.bottom < -H * 0.5 || r.top > H * 1.5) continue;
      if (r.width * r.height > MAXAREA * W * H) continue;
      if (e.disabled || e.getAttribute("aria-disabled") === "true") continue;
      if (!isSel) { // only the outermost thing that shows a pointer cursor, and not inside a real link or button
        if (!isCursorPtr(e)) continue;
        var par = e.parentElement;
        if (par && isCursorPtr(par)) continue;
        if (e.closest && e.closest(SEL)) continue;
      }
      out.push({ e: e, r: r });
    }
    var vis = [];
    for (i = 0; i < out.length; i++) {
      var o = out[i], cs;
      try { cs = getComputedStyle(o.e); } catch (x) { continue; }
      if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity < 0.05 || cs.pointerEvents === "none" && !o.e.matches("a[href],button,input,select,textarea")) continue;
      var cx = o.r.left + o.r.width / 2, cy = o.r.top + o.r.height / 2;
      if (cx > 1 && cx < W - 2 && cy > 1 && cy < H - 2) { // on screen: not covered at its centre
        var top = document.elementFromPoint(cx, cy);
        if (top && !(related(o.e, top) || related(top, o.e))) {
          // cover test at a second spot (left third) so a corner badge does not hide a whole card
          var top2 = document.elementFromPoint(o.r.left + o.r.width * 0.3, o.r.top + o.r.height * 0.5);
          if (!top2 || !(related(o.e, top2) || related(top2, o.e))) continue;
        }
      }
      vis.push(o);
    }
    // drop a plain wrapper when an inner candidate fills most of it
    var keep = [];
    for (i = 0; i < vis.length; i++) {
      var a = vis[i], wrap = false;
      for (var j = 0; j < vis.length && !wrap; j++) {
        var b = vis[j];
        if (b !== a && a.e.contains(b.e) && b.r.width * b.r.height >= 0.6 * a.r.width * a.r.height) wrap = true;
      }
      if (!wrap) keep.push(a);
    }
    // drop a small control on top of (or nested in the link of) a bigger card
    // (Hotstar's hover-only "View More Details" and watchlist buttons): one stop per card
    var out2 = [];
    for (i = 0; i < keep.length; i++) {
      var p = keep[i], pa = p.r.width * p.r.height, onCard = false;
      for (j = 0; j < keep.length && !onCard; j++) {
        var q = keep[j];
        var qa = q.r.width * q.r.height; // a card, not a hero banner: a Play button on a banner stays
        if (q === p || qa < 2 * pa || qa > 0.12 * innerWidth * innerHeight || p.e.contains(q.e)) continue;
        if (q.e.contains(p.e)) { if (q.e.matches("a[href],[role=link],[role=button],button")) onCard = true; continue; } // inside a card link: OK on the card does it
        var ow = Math.min(p.r.right, q.r.right) - Math.max(p.r.left, q.r.left), oh = Math.min(p.r.bottom, q.r.bottom) - Math.max(p.r.top, q.r.top);
        if (ow > 0 && oh > 0 && ow * oh >= 0.85 * pa) onCard = true;
      }
      if (!onCard) out2.push(p);
    }
    return out2;
  }

  /* ---------- focus: real DOM focus, the site's own focus style, a thin white outline if it has none ---------- */
  var foc, focOn = false, cur = null, focRaf = 0, focOwn = false, lastNavAt = 0, ids = (typeof WeakMap !== "undefined") ? new WeakMap() : null, idN = 0;

  function idOf(e) { if (!e || !ids) return 0; var v = ids.get(e); if (!v) { v = ++idN; ids.set(e, v); } return v; }

  function focFollow() {
    focRaf = 0;
    if (!focOn) return;
    if (!cur || !cur.isConnected) { focHide(); return; }
    var r = cur.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) { focHide(); return; }
    foc.style.setProperty("width", Math.round(r.width) + "px");
    foc.style.setProperty("height", Math.round(r.height) + "px");
    foc.style.setProperty("transform", "translate(" + Math.round(r.left) + "px," + Math.round(r.top) + "px)");
    focRaf = requestAnimationFrame(focFollow); // follows transform-based carousels, which fire no scroll events
  }
  function focDraw() {
    build();
    if (!focOn) { focOn = true; foc.className = "foc on"; syncActive(); }
    if (!focRaf) focRaf = requestAnimationFrame(focFollow);
  }
  function focHide() {
    if (!focOn) return;
    focOn = false;
    if (foc) foc.className = "foc";
    if (focRaf) cancelAnimationFrame(focRaf);
    focRaf = 0;
    syncActive();
  }
  function navClear() { focHide(); cur = null; }

  function styleSig(e) {
    try {
      var c = getComputedStyle(e);
      return [c.outlineStyle, c.outlineWidth, c.outlineColor, c.boxShadow, c.borderTopColor, c.borderTopWidth, c.backgroundColor, c.transform, c.filter, c.opacity, c.color, c.textDecorationLine].join("|");
    } catch (x) { return ""; }
  }

  // Focus el for real. Non-focusable things (divs with a click handler) get tabindex=-1 first.
  function focusEl(el) {
    var before = styleSig(el);
    focOwn = true;
    try { el.focus({ preventScroll: true, focusVisible: true }); } catch (x) {}
    if (document.activeElement !== el && !(el.shadowRoot && el.shadowRoot.activeElement)) {
      try { if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true, focusVisible: true }); } catch (x) {}
    }
    focOwn = false;
    cur = el;
    lastNavAt = Date.now();
    try { el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" }); } catch (x) {}
    unhide(el);
    var siteStyled = false;
    try { siteStyled = el.matches(":focus-visible") && getComputedStyle(el).outlineStyle !== "none" && parseFloat(getComputedStyle(el).outlineWidth) > 0; } catch (x) {}
    if (!siteStyled) focDraw(); else focHide();
    // a site that restyles on focus (it may transition) shows its own style: then ours steps aside
    setTimeout(function () {
      if (cur !== el) return;
      var now = styleSig(el), own = false;
      try { own = el.matches(":focus-visible") && getComputedStyle(el).outlineStyle !== "none" && parseFloat(getComputedStyle(el).outlineWidth) > 0; } catch (x) {}
      if (own || (now && before && now !== before && !sigOnlyOutline(before, now))) focHide();
    }, 180);
  }
  function sigOnlyOutline(a, b) { return false; }

  // A sticky header or footer must not hide what we just focused (a real click would hit the header).
  function unhide(el) {
    var r = el.getBoundingClientRect(), cx = Math.max(1, Math.min(innerWidth - 2, r.left + r.width / 2)), cy = Math.max(1, Math.min(innerHeight - 2, r.top + r.height / 2));
    var top = document.elementFromPoint(cx, cy);
    if (!top || related(el, top) || related(top, el)) return;
    var tr = top.getBoundingClientRect();
    for (var n = top; n && n !== document.body; n = n.parentElement) {
      var p = getComputedStyle(n).position;
      if (p === "fixed" || p === "sticky") { tr = n.getBoundingClientRect(); break; }
    }
    if (tr.top <= 1 || tr.bottom < innerHeight / 2) window.scrollBy({ top: -(tr.bottom - r.top + 12), behavior: "instant" });
    else window.scrollBy({ top: r.bottom - tr.top + 12, behavior: "instant" });
  }

  function curValid() {
    if (!cur || !cur.isConnected) return false;
    var r = cur.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)) return false;
    var a = document.activeElement;
    return a === cur || cur.contains(a) || (cur.shadowRoot && cur.shadowRoot.activeElement != null);
  }
  function navActive() { return curValid(); }

  // The site moved focus by itself (carousels, Hotstar): adopt it, shortly after we last drove.
  document.addEventListener("focusin", function (e) {
    if (focOwn || ptrOn || Date.now() - lastNavAt > 10000) return;
    var t = e.target;
    if (!t || t === document.body || t === document.documentElement || !t.getBoundingClientRect) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) { focHide(); cur = null; return; }
    cur = t;
    lastNavAt = Date.now();
    var own = false;
    try { own = t.matches(":focus-visible") && getComputedStyle(t).outlineStyle !== "none" && parseFloat(getComputedStyle(t).outlineWidth) > 0; } catch (x) {}
    if (!own) focDraw(); else focHide();
  }, true);
  document.addEventListener("focusout", function (e) { if (!focOwn && e.target === cur) { setTimeout(function () { if (!curValid()) focHide(); }, 50); } }, true);

  function nearestToCentre(list) {
    var best = null, bd = 1e12, mx = innerWidth / 2, my = innerHeight / 2;
    for (var i = 0; i < list.length; i++) {
      var r = list[i].r;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      var d = Math.pow(r.left + r.width / 2 - mx, 2) + Math.pow(r.top + r.height / 2 - my, 2);
      if (d < bd) { bd = d; best = list[i]; }
    }
    return best;
  }

  // left/right stay in their row: the two must share a third of the shorter one's height
  // (cards in one row differ in height; a wide banner must not reach the row above)
  function rowTol(a, b) { return Math.max(a.height, b.height) * 1.5 + 40; }
  function sameRow(a, b) { return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) >= Math.min(a.height, b.height) / 3; }

  // A zone is the fixed bar an element lives in (a side rail, a header), or the page.
  // Up and down stay in their zone while it has somewhere to go: on Hotstar, Up from a row
  // must reach the row above, not the side menu that happens to sit a little higher.
  function zoneOf(e, memo) {
    for (var n = e; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (memo.has(n)) return memo.get(n);
      var p = "";
      try { p = getComputedStyle(n).position; } catch (x) {}
      if (p === "fixed") { memo.set(n, n); return n; }
    }
    return null;
  }

  // loose: the old, laxer rule, tried last (after the rail and a scroll) so a layout
  // these rules have not met still moves instead of leaving a dead key
  function pick(list, dir, from, loose) {
    var r = from.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var best = null, bs = 1e12, memo = new Map(), vert = dir === "up" || dir === "down", z0 = vert ? zoneOf(from, memo) : null;
    for (var i = 0; i < list.length; i++) {
      var c = list[i], strict = !loose;
      if (c.e === from || from.contains(c.e) && c.r.width * c.r.height > 0.8 * r.width * r.height || c.e.contains(from) && r.width * r.height > 0.8 * c.r.width * c.r.height) continue;
      var px_ = c.r.left + c.r.width / 2, py_ = c.r.top + c.r.height / 2, dx = px_ - cx, dy = py_ - cy, main, side;
      if (dir === "right") { if (dx <= 4 || (strict ? c.r.left < r.right - r.width * 0.25 || !sameRow(r, c.r) : Math.abs(dy) > rowTol(r, c.r))) continue; main = dx; side = Math.max(0, Math.abs(dy) - (r.height + c.r.height) / 2) * 3 + Math.abs(dy) * 0.3; }
      else if (dir === "left") { if (dx >= -4 || (strict ? c.r.right > r.left + r.width * 0.25 || !sameRow(r, c.r) : Math.abs(dy) > rowTol(r, c.r))) continue; main = -dx; side = Math.max(0, Math.abs(dy) - (r.height + c.r.height) / 2) * 3 + Math.abs(dy) * 0.3; }
      else if (dir === "down") { if (dy <= 4 || strict && c.r.top < r.bottom - r.height * 0.25) continue; main = dy; side = Math.max(0, Math.abs(dx) - (r.width + c.r.width) / 2) * 3 + Math.abs(dx) * 0.3; }
      else { if (dy >= -4 || strict && c.r.bottom > r.top + r.height * 0.25) continue; main = -dy; side = Math.max(0, Math.abs(dx) - (r.width + c.r.width) / 2) * 3 + Math.abs(dx) * 0.3; }
      var s = main + side;
      // up and down pass over a thin row title or View All on the way to the cards; they
      // stay reachable when nothing bigger is that way
      if (vert && c.r.height < 40 && c.r.height < r.height * 0.6) s += 400;
      if (vert && zoneOf(c.e, memo) !== z0) s += 100000; // another zone only when this one has nothing that way
      if (s < bs) { bs = s; best = c; }
    }
    if (best && vert && zoneOf(best.e, memo) !== z0) best.cross = true;
    // nothing in this row that way: a side rail or bar (another fixed zone) is next, nearest in height
    if (!best && !vert && !loose) {
      var zf = zoneOf(from, memo);
      for (i = 0; i < list.length; i++) {
        var q = list[i];
        if (q.e === from || zoneOf(q.e, memo) === zf) continue;
        var qx = q.r.left + q.r.width / 2, qy = q.r.top + q.r.height / 2;
        if (dir === "right" ? qx <= r.right : qx >= r.left) continue;
        var sq = Math.abs(qy - cy) + Math.abs(qx - cx) * 0.3;
        if (sq < bs) { bs = sq; best = q; }
      }
    }
    return best;
  }

  // Move focus one step. dir "" focuses the thing nearest the middle. True when focus moved (or was put somewhere).
  function nav(dir) {
    build();
    focHide(); focOn = false;
    var list = candidates();
    var d = dir === "up" || dir === "down" || dir === "left" || dir === "right";
    var from = curValid() ? cur : null;
    if (!from) {
      var a = document.activeElement;
      if (d && a && a !== document.body && a !== document.documentElement && !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.getBoundingClientRect) {
        var ar = a.getBoundingClientRect();
        if (ar.width > 0 && ar.height > 0 && ar.bottom > 0 && ar.top < innerHeight) from = a;
      }
    }
    if (!from || !d) {
      var first = nearestToCentre(list);
      if (!first) return false;
      focusEl(first.e);
      return true;
    }
    var next = pick(list, dir, from);
    // nothing that way in this zone on screen (only a header or rail): scroll the page first
    if ((!next || next.cross) && (dir === "up" || dir === "down")) {
      var before = window.scrollY;
      window.scrollBy({ top: (dir === "down" ? 1 : -1) * innerHeight * 0.6, behavior: "instant" });
      if (window.scrollY !== before) {
        var l2 = candidates(), n2 = pick(l2, dir, from);
        if (n2 && !n2.cross) next = n2;
        else if (!next) next = n2 || nearestToCentre(l2);
        else window.scrollTo({ top: before, behavior: "instant" }); // the page had nothing more: the bar it is then
      }
    }
    if (!next) next = pick(candidates(), dir, from, true);
    if (!next) { cur = from; focDraw(); return false; }
    focusEl(next.e);
    return true;
  }

  // The point a real mouse click should hit: inside the element, on the element.
  function clickPoint(e) {
    var r = e.getBoundingClientRect();
    var xs = [0.5, 0.25, 0.75, 0.5, 0.5], ys = [0.5, 0.5, 0.5, 0.25, 0.75];
    for (var i = 0; i < xs.length; i++) {
      var x = Math.max(1, Math.min(innerWidth - 2, r.left + r.width * xs[i])), y = Math.max(1, Math.min(innerHeight - 2, r.top + r.height * ys[i]));
      var t = document.elementFromPoint(x, y);
      if (t && (related(e, t) || related(t, e))) return { x: x, y: y };
    }
    return { x: Math.max(1, Math.min(innerWidth - 2, r.left + r.width / 2)), y: Math.max(1, Math.min(innerHeight - 2, r.top + r.height / 2)) };
  }

  function navTarget() {
    if (curValid()) return clickPoint(cur);
    var a = document.activeElement;
    if (a && a !== document.body && a !== document.documentElement && !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !a.isContentEditable && a.getBoundingClientRect) {
      var r = a.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) return clickPoint(a);
    }
    return null;
  }

  // Script click on the focused element (the fallback; Go prefers a real mouse click at navTarget).
  function navOk() {
    var e = curValid() ? cur : null;
    if (!e) return nav("");
    try { e.click(); return true; } catch (x) { return false; }
  }

  // An open dialog (Netflix's signed-out title popup, cookie sheets): Back closes it first.
  function dialogEl() {
    var ds = document.querySelectorAll("[role=dialog],[aria-modal=true],dialog[open]");
    for (var i = 0; i < ds.length; i++) {
      var r = ds[i].getBoundingClientRect(), cs = getComputedStyle(ds[i]);
      if (r.width > 200 && r.height > 120 && cs.visibility !== "hidden" && cs.display !== "none" && r.bottom > 0 && r.top < innerHeight) return ds[i];
    }
    return null;
  }
  function modalOpen() { return !!dialogEl(); }
  function modalClose() {
    var d = dialogEl();
    if (!d) return "none";
    var b = d.querySelector("[aria-label*='lose' i],[aria-label*='ismiss' i],[data-uia*='close' i],[data-testid*='close' i],button[class*='close' i],[class*='close' i][role=button]");
    if (b) { b.click(); return "btn"; }
    return "none";
  }

  function onScroll() {}

  /* ---------- calibration lamp: 0 = left, 1 = right, -1 = off ---------- */
  function calib(i) {
    if (i !== 0 && i !== 1) {
      if (calOn) { calOn = false; cal.className = "cal"; syncActive(); }
      return;
    }
    build();
    cal.style.left = (i === 0 ? 10 : 90) + "%";
    if (!calOn) { calOn = true; cal.className = "cal on"; syncActive(); }
  }

  /* ---------- media ---------- */
  function mediaState() {
    var vs = document.getElementsByTagName("video");
    var best = null, area = 0;
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (v.readyState < 1) continue;
      var r = v.getBoundingClientRect();
      var a = r.width * r.height;
      if (a >= area) { area = a; best = v; }
    }
    if (!best) return null;
    var dur = isFinite(best.duration) ? best.duration : 0;
    return { playing: !best.paused && !best.ended, pos: Math.floor(best.currentTime || 0), dur: Math.floor(dur) };
  }

  // Entering or leaving fullscreen: follow the fullscreen element and re-stack,
  // always (a video in fullscreen keeps the host where it is, but the popover
  // has to be shown again to sit above it).
  function onFs() { place(); restack(); }
  document.addEventListener("fullscreenchange", onFs);
  document.addEventListener("webkitfullscreenchange", onFs);

  window.__tv = { v: 2, show: show, pointer: pointer, calib: calib, mediaState: mediaState,
    lamps: function () { var c = 0; for (var i = 0; i < lampEls.length; i++) if (lampEls[i].className === "lit") c++; return { lit: c, n: lampsLit, target: lampTarget }; },
    nav: nav, navOk: navOk, navTarget: navTarget, navActive: navActive, navClear: navClear,
    activeId: function () { return idOf(document.activeElement); }, ptr: ptrState, modalOpen: modalOpen, modalClose: modalClose,
    focusInfo: function () { var a = document.activeElement, r = a && a.getBoundingClientRect ? a.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 }; return { id: idOf(a), tag: a && a.tagName, text: a && (a.getAttribute("aria-label") || a.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40), out: focOn, r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }; } };
})();
