// TV Mode Netflix Remote: a spatial d-pad for Netflix's browse pages.
// Capture-phase keydown on window, registered at document_start so it runs
// before Netflix's own listeners. On /watch the player keeps its own keys.
(function () {
  'use strict';
  if (window.__tvDpadLoaded) return;
  window.__tvDpadLoaded = true;
  var Core = window.TVNavCore;
  if (!Core) return;

  var RING_RGB = '229,9,20';
  var SEL = [
    'a[href]', 'button', '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]',
    '[role="option"]', 'input:not([type="hidden"])', '[tabindex]:not([tabindex="-1"])',
    '.slider-item a', '.title-card a', '[data-uia*="button"]', '[data-uia*="episode"]',
    '.profile-link', '[data-uia*="profile"]', '[data-uia*="search-box"]', '[data-uia*="menu-item"]', '[data-uia*="nav-"]'
  ].join(',');
  var DIALOG_SEL = '[role="dialog"],[aria-modal="true"],.previewModal--container,.previewModal--wrapper,.detail-modal,[data-uia="modal-container"]';
  var HOVER_PREVIEW_SEL = '.bob-card,.bob-container,[data-uia^="bob"]';
  var CLOSE_SEL = '[data-uia="previewModal-closebtn"],button[aria-label="Close"],button[aria-label="close"],[data-uia="modal-close-button"],button.close,.close-button';

  var cur = null;        // {el, rect}: where the d-pad is
  var colX = null;       // remembered column (horizontal centre) for Up/Down
  var busy = false;      // a carousel page is in flight
  var moving = false;    // our own focus() is running
  var lastBrowse = null; // last focused element outside a dialog
  var hoverTimer = 0, hoverEl = null;
  var rowMemory = new WeakMap(); // row container -> last focused element
  var swallowUp = {};
  var ring = null, ringOn = false, ringTimer = 0;

  // ---------- helpers ----------
  function isWatch() { return location.pathname.indexOf('/watch') === 0; }
  function isOff() { return isWatch() || location.pathname.indexOf('/login') === 0; }

  function isTyping(t) {
    if (!t || !t.tagName) return false;
    var n = t.tagName;
    if (n === 'TEXTAREA' || n === 'SELECT' || t.isContentEditable) return true;
    if (n === 'INPUT') {
      var ty = (t.type || 'text').toLowerCase();
      return ['button', 'submit', 'checkbox', 'radio', 'image', 'reset', 'file', 'range', 'color'].indexOf(ty) < 0;
    }
    return false;
  }

  // where this window is, so TV Mode only listens to the one on the TV monitor (2.0)
  function scr() { return { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight, dpr: window.devicePixelRatio || 1 }; }
  function ver() { try { return chrome.runtime.getManifest().version; } catch (e) { return ''; } }

  function sendBg(path, body) {
    try {
      body.scr = scr();
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
      chrome.runtime.sendMessage({ type: 'ext', path: path, body: body }, function () { void chrome.runtime.lastError; });
    } catch (e) { /* extension was reloaded: ignore */ }
  }

  var styleCache = null;
  function style(el) {
    var s = styleCache && styleCache.get(el);
    if (!s) { s = getComputedStyle(el); if (styleCache) styleCache.set(el, s); }
    return s;
  }

  // visible: not display:none / visibility:hidden / opacity:0 up the tree, and
  // its centre is not clipped by an overflow:hidden ancestor (a carousel's mask).
  function usable(el, r) {
    var s = style(el);
    if (s.visibility === 'hidden' || s.visibility === 'collapse') return false;
    var x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
    for (var p = el; p && p !== document.documentElement; p = p.parentElement) {
      var ps = style(p);
      if (ps.display === 'none' || parseFloat(ps.opacity) === 0) return false;
      if (p === el || p === document.body) continue;
      var ox = ps.overflowX, oy = ps.overflowY;
      if (ox === 'hidden' || ox === 'clip' || oy === 'hidden' || oy === 'clip') {
        var pr = p.getBoundingClientRect();
        if ((ox === 'hidden' || ox === 'clip') && (x < pr.left || x > pr.right)) return false;
        if ((oy === 'hidden' || oy === 'clip') && (y < pr.top || y > pr.bottom)) return false;
      }
    }
    return true;
  }

  function topDialog() {
    var vw = innerWidth, vh = innerHeight, best = null, bz = -Infinity, order = 0;
    var list = document.querySelectorAll(DIALOG_SEL);
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (d.matches(HOVER_PREVIEW_SEL) || d.closest(HOVER_PREVIEW_SEL)) continue;
      var r = d.getBoundingClientRect();
      if (r.width < 50 || r.height < 50) continue;
      var s = getComputedStyle(d);
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) continue;
      // a real detail modal is big; a small popup (menu, tooltip) is not one
      if (r.width * r.height < 0.2 * vw * vh && d.getAttribute('aria-modal') !== 'true') continue;
      var z = parseInt(s.zIndex, 10); if (isNaN(z)) z = 0;
      var score = z * 10000 + order++;
      if (score >= bz) { bz = score; best = d; }
    }
    return best;
  }

  // Candidates in the current scope (topmost dialog, or the page).
  function collect() {
    var root = topDialog() || document, vh = innerHeight, out = [], set = new Set();
    styleCache = new WeakMap();
    var els = root.querySelectorAll(SEL);
    var keep = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      if (el.closest('[aria-hidden="true"]') && !root.contains(el)) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      if (r.bottom < -vh * 1.2 || r.top > vh * 2.2) continue;
      if (!usable(el, r)) continue;
      keep.push({ el: el, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });
      set.add(el);
    }
    // an outer candidate that contains another one is not a target itself
    var outer = new Set();
    keep.forEach(function (k) {
      for (var p = k.el.parentElement; p; p = p.parentElement) if (set.has(p)) outer.add(p);
    });
    keep.forEach(function (k) { if (!outer.has(k.el)) out.push(k); });
    styleCache = null;
    return out;
  }

  function rowKey(el) {
    return el.closest('.lolomoRow,.slider,.sliderMask,[data-list-context]') || (el.parentElement && el.parentElement.parentElement) || el;
  }

  // ---------- ring + hover ----------
  function ensureRing() {
    if (ring && ring.isConnected) return ring;
    ring = document.createElement('div');
    ring.id = 'tvmode-dpad-ring';
    ring.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483647;opacity:0;' +
      'box-sizing:border-box;border-radius:4px;box-shadow:0 0 0 3px rgba(' + RING_RGB + ',.85),0 0 24px 4px rgba(' + RING_RGB + ',.45);' +
      'transition:none';
    (document.documentElement || document.body).appendChild(ring);
    return ring;
  }

  function placeRing() {
    if (!ringOn) return;
    var rg = ensureRing();
    if (!cur || !cur.el.isConnected || isOff()) { rg.style.opacity = '0'; requestAnimationFrame(placeRing); return; }
    var r = cur.el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) { rg.style.opacity = '0'; requestAnimationFrame(placeRing); return; }
    cur.rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    rg.style.left = r.left + 'px'; rg.style.top = r.top + 'px';
    rg.style.width = r.width + 'px'; rg.style.height = r.height + 'px';
    var br = getComputedStyle(cur.el).borderRadius;
    rg.style.borderRadius = br && br !== '0px' ? br : '4px';
    rg.style.opacity = '1';
    requestAnimationFrame(placeRing);
  }

  function showRing(animate) {
    var rg = ensureRing();
    if (animate) {
      rg.style.transition = 'left 200ms ease-out, top 200ms ease-out, width 200ms ease-out, height 200ms ease-out, opacity 200ms ease-out';
      clearTimeout(ringTimer);
      ringTimer = setTimeout(function () { rg.style.transition = 'opacity 200ms ease-out'; }, 260);
    }
    if (!ringOn) { ringOn = true; requestAnimationFrame(placeRing); }
  }

  function hideRing() {
    ringOn = false;
    if (ring) ring.style.opacity = '0';
  }

  function fire(el, type, bubbles) {
    var r = el.getBoundingClientRect();
    try {
      el.dispatchEvent(new MouseEvent(type, { bubbles: bubbles, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    } catch (e) { /* ignore */ }
  }

  function scheduleHover(el) {
    clearTimeout(hoverTimer);
    if (hoverEl && hoverEl !== el) { fire(hoverEl, 'mouseout', true); fire(hoverEl, 'mouseleave', false); hoverEl = null; }
    if (!el.closest('.slider-item,.title-card,.title-card-container')) return;
    hoverTimer = setTimeout(function () {
      if (!cur || cur.el !== el || !el.isConnected) return;
      var t = el.closest('.title-card,.title-card-container,.slider-item') || el;
      hoverEl = t;
      fire(t, 'mouseover', true); fire(t, 'mouseenter', false); fire(t, 'mousemove', true);
    }, 600);
  }

  // ---------- focus ----------
  function focusItem(item, opts) {
    opts = opts || {};
    var el = item.el;
    cur = { el: el, rect: item.rect };
    if (opts.col !== false) colX = Core.cx(item.rect);
    moving = true;
    try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    moving = false;
    if (!topDialog()) lastBrowse = el;
    rowMemory.set(rowKey(el), el);
    var vh = innerHeight, r = el.getBoundingClientRect();
    if (opts.scroll && (r.top < vh * 0.08 || r.bottom > vh * 0.92)) {
      try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch (e) { /* ignore */ }
    }
    showRing(true);
    scheduleHover(el);
  }

  function initialPick(items) {
    var vh = innerHeight, i, k;
    var pri = ['[data-uia="play-button"]', '.billboard-row button', '.billboard a'];
    for (i = 0; i < pri.length; i++) for (k = 0; k < items.length; k++) {
      if (items[k].el.matches(pri[i]) && items[k].rect.top >= 0 && items[k].rect.bottom <= vh) return items[k];
    }
    var onScreen = items.filter(function (it) { return it.rect.top >= 70 && it.rect.bottom <= vh; });
    var pool = onScreen.length ? onScreen : items;
    pool = pool.slice().sort(function (a, b) { return a.rect.top - b.rect.top || a.rect.left - b.rect.left; });
    return pool[0] || null;
  }

  // Where is the d-pad in this fresh candidate list?
  function locate(items) {
    if (cur && cur.el.isConnected) {
      for (var i = 0; i < items.length; i++) if (items[i].el === cur.el) return i;
      // it is a valid focus that the candidate filter dropped (container): add it
      var r = cur.el.getBoundingClientRect();
      if (r.width > 2 && r.height > 2 && !topDialog() === !cur.el.closest(DIALOG_SEL)) {
        items.push({ el: cur.el, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });
        return items.length - 1;
      }
    }
    if (cur && cur.rect) { // Netflix re-rendered the node: take the nearest one
      var best = -1, bd = Infinity, cx = Core.cx(cur.rect), cy = Core.cy(cur.rect);
      items.forEach(function (it, i) {
        var d = Math.abs(Core.cx(it.rect) - cx) + Math.abs(Core.cy(it.rect) - cy);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0 && bd < 400) return best;
    }
    return -1;
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---------- carousel paging ----------
  function findHandle(el, dir) {
    var sel = dir === 'right' ? '.handleNext,.handle.handleNext' : '.handlePrev,.handle.handlePrev';
    var r = el.getBoundingClientRect(), y = (r.top + r.bottom) / 2;
    for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      var list = p.querySelectorAll(sel);
      for (var i = 0; i < list.length; i++) {
        var hr = list[i].getBoundingClientRect();
        if (hr.top <= y && hr.bottom >= y) return list[i]; // a handle of this very row
      }
    }
    return null;
  }

  function sameRow(it, r) { return Core.vOverlap(it.rect, r) >= 0.5; }

  async function page(dir) {
    var handle = findHandle(cur.el, dir);
    if (!handle) return null;
    var row = cur.rect;
    var before = new Set(collect().filter(function (it) { return sameRow(it, row); }).map(function (it) { return it.el; }));
    handle.click();
    var fresh = [], t0 = Date.now();
    while (Date.now() - t0 < 1500) {
      await sleep(80);
      fresh = collect().filter(function (it) { return sameRow(it, row) && !before.has(it.el); });
      if (fresh.length) break;
    }
    if (!fresh.length) return null;
    // wait until the slide stops
    var last = '', still = 0;
    t0 = Date.now();
    while (still < 2 && Date.now() - t0 < 1200) {
      await sleep(70);
      var now = collect().filter(function (it) { return sameRow(it, row) && !before.has(it.el); });
      if (now.length) fresh = now;
      var sig = fresh.map(function (it) { return Math.round(it.rect.left); }).join(',');
      still = sig === last ? still + 1 : 0; last = sig;
    }
    fresh.sort(function (a, b) { return a.rect.left - b.rect.left; });
    return dir === 'right' ? fresh[0] : fresh[fresh.length - 1];
  }

  // ---------- moves ----------
  async function move(dir) {
    var items = collect();
    if (!items.length) return;
    var idx = locate(items);
    if (idx < 0) { var first = initialPick(items); if (first) focusItem(first, { scroll: true }); return; }
    var rects = items.map(function (it) { return it.rect; });
    var next = -1;
    if (dir === 'left' || dir === 'right') {
      next = Core.horizontal(rects, idx, dir);
      if (next >= 0) { focusItem(items[next]); return; }
      busy = true;
      try {
        var landed = await page(dir);
        if (landed) { focusItem(landed); return; }
      } finally { busy = false; }
      var fb = Core.scored(rects, idx, dir);
      if (fb >= 0 && Core.score(rects[idx], rects[fb], dir) < 10000 && Core.vOverlap(rects[idx], rects[fb]) > 0) focusItem(items[fb]);
      return;
    }
    if (colX == null) colX = Core.cx(rects[idx]);
    var prefer = function (rowIdxs) {
      for (var i = 0; i < rowIdxs.length; i++) {
        var it = items[rowIdxs[i]];
        if (rowMemory.get(rowKey(it.el)) === it.el) return rowIdxs[i];
      }
      return -1;
    };
    next = Core.vertical(rects, idx, dir, colX, prefer);
    if (next < 0) {
      next = Core.scored(rects, idx, dir);
      if (next < 0 || Core.score(rects[idx], rects[next], dir) >= 10000) return;
    }
    focusItem(items[next], { col: false, scroll: true });
  }

  function click(el) {
    var n = el.tagName;
    if (n === 'INPUT' || n === 'TEXTAREA') { el.focus(); return; }
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(function (t) {
      try { el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window, button: 0 })); } catch (e) { /* ignore */ }
    });
    el.click();
  }

  function activate() {
    if (!cur || !cur.el.isConnected) return false;
    var el = cur.el, hadDialog = !!topDialog();
    click(el);
    // a detail modal may open: put the d-pad in it
    setTimeout(function () {
      var d = topDialog();
      if (d && !hadDialog && !d.contains(cur && cur.el)) {
        var items = collect();
        var pick = items.filter(function (it) { return it.el.matches('[data-uia="play-button"]'); })[0] || initialPick(items);
        if (pick) focusItem(pick);
      }
    }, 600);
    return true;
  }

  function closeDialog(d) {
    var btn = d.querySelector(CLOSE_SEL);
    if (btn) click(btn);
    else {
      ['keydown', 'keyup'].forEach(function (t) {
        var ev = new KeyboardEvent(t, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true });
        (document.activeElement || document.body).dispatchEvent(ev);
      });
    }
    setTimeout(function () {
      var again = topDialog();
      if (again && /[?&]jbv=/.test(location.search)) history.back();
      setTimeout(function () {
        if (!topDialog() && lastBrowse && lastBrowse.isConnected) {
          var r = lastBrowse.getBoundingClientRect();
          focusItem({ el: lastBrowse, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });
        }
      }, 250);
    }, 300);
  }

  function leave() {
    if (history.length > 1) history.back(); else location.assign('/browse');
  }

  // ---------- keys ----------
  var DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

  function eat(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    swallowUp[e.code || e.key] = true;
  }

  function onKey(e) {
    if (!e.isTrusted && !window.__tvDpadAllowSynthetic) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var k = e.key, typing = isTyping(e.target);

    if (k === 'BrowserBack' || k === 'Escape' || k === 'Backspace') {
      if (typing && k !== 'BrowserBack') return;
      if (location.pathname.indexOf('/login') === 0) return;
      if (isWatch()) { eat(e); leave(); return; }
      var d = topDialog();
      if (d) { eat(e); closeDialog(d); return; }
      if (k === 'Backspace') { eat(e); history.back(); }
      return; // Escape / BrowserBack with nothing open: the browser does its own thing
    }
    if (isOff()) return;
    if (DIRS[k]) {
      if (typing && (k === 'ArrowLeft' || k === 'ArrowRight')) return;
      eat(e);
      if (busy) return;
      move(DIRS[k]);
      return;
    }
    if (k === 'Enter') {
      if (typing) return;
      if (cur && cur.el.isConnected && (!document.activeElement || document.activeElement === document.body || cur.el === document.activeElement || cur.el.contains(document.activeElement))) {
        eat(e);
        activate();
      }
    }
  }

  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', function (e) {
    var id = e.code || e.key;
    if (swallowUp[id]) { delete swallowUp[id]; e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // a real mouse or touch takes over: hide the ring; a real focus (Tab, click) moves the d-pad
  window.addEventListener('mousemove', function (e) {
    if (e.isTrusted && ringOn && (Math.abs(e.movementX) + Math.abs(e.movementY) > 3)) hideRing();
  }, true);
  window.addEventListener('focusin', function (e) {
    if (moving || !e.target || e.target === document.body) return;
    var el = e.target.closest ? e.target.closest(SEL) : null;
    if (!el || isOff()) return;
    var r = el.getBoundingClientRect();
    cur = { el: el, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
    colX = Core.cx(cur.rect);
    if (!topDialog()) lastBrowse = el;
  }, true);

  // ---------- reports to TV Mode ----------
  function sayHello() { sendBg('hello', { v: 2, ver: ver(), host: location.hostname, path: location.pathname }); }

  var seenTitle = null, lastReal = false;
  function readWatch(forDesk) {
    var v = document.querySelector('video');
    if (!v || !(v.duration > 0)) return null;
    var title = '', ep = 0, season = 0, epTitle = '';
    var box = document.querySelector('[data-uia="video-title"]');
    if (box) {
      var h = box.querySelector('h4,h1,h2,h3');
      title = (h ? h.textContent : '').trim();
      var spans = box.querySelectorAll('span');
      var texts = [];
      for (var i = 0; i < spans.length; i++) { var t = spans[i].textContent.trim(); if (t) texts.push(t); }
      if (!title && texts.length) title = texts.shift();
      var m = (box.textContent || '').match(/S(?:eason)?\s*(\d+)\s*[:.\s]*E(?:pisode)?\s*(\d+)/i);
      if (m) { season = +m[1]; ep = +m[2]; }
      else if ((m = (box.textContent || '').match(/\bE(?:pisode)?\s*(\d+)/i))) { season = 1; ep = +m[1]; }
      if (ep) epTitle = texts.filter(function (x) { return !/^S?\d*[:.]?E\d+$/i.test(x) && x !== title; }).pop() || '';
    }
    // 2.1 (the desk reporter): the title box only exists while Netflix's controls show. Remember what it said for
    // this address and use that when the controls are hidden; lastReal says whether the title is a real one.
    var fromBox = !!title;
    if (fromBox) seenTitle = { p: location.pathname, title: title, season: season, episode: ep, epTitle: epTitle };
    else if (forDesk && seenTitle && seenTitle.p === location.pathname) { title = seenTitle.title; season = seenTitle.season; ep = seenTitle.episode; epTitle = seenTitle.epTitle; fromBox = true; }
    if (!title) title = document.title.replace(/\s*[-–|]\s*Netflix.*$/i, '').trim();
    lastReal = fromBox || (!!title && !/^netflix$/i.test(title));
    return { title: title, season: season, episode: ep, epTitle: epTitle, pos: Math.round(v.currentTime), dur: Math.round(v.duration), playing: !v.paused, url: location.origin + location.pathname };
  }

  // ---------- player commands from the phone (seek, play/pause, subtitles, skip) ----------
  // Every half second on the player, the report to TV Mode also collects any commands
  // queued for it. Seek and play/pause go to player.js in the page; menus are clicked here.
  var cmdId = 0, cmdErr = '';
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.source !== window || !d || d.tvmode !== 'res') return;
    cmdErr = d.ok ? '' : d.err || 'failed';
    // the audio and subtitle lists go to the phone; after a change, read them again once it has applied
    if (d.ok && d.tracks) sendBg('tracks', d.tracks);
    if (d.ok && d.a === 'settrack') setTimeout(function () { window.postMessage({ tvmode: 'cmd', id: ++cmdId, a: 'tracks' }, location.origin); }, 900);
  });
  function wake() {
    var v = document.querySelector('video');
    var r = v ? v.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    var o = { bubbles: true, clientX: r.left + r.width / 2 + Math.random() * 4, clientY: r.top + r.height * 0.8 };
    (v || document.body).dispatchEvent(new MouseEvent('mousemove', o));
    document.dispatchEvent(new MouseEvent('mousemove', o));
  }
  function clickFirst(sels) {
    for (var i = 0; i < sels.length; i++) {
      var b = document.querySelector(sels[i]);
      if (b) { b.click(); return true; }
    }
    return false;
  }
  function skipBtn() {
    if (clickFirst(['[data-uia="player-skip-intro"]', '[data-uia="player-skip-recap"]', '[data-uia="player-skip-preplay"]', '[data-uia="next-episode-seamless-button"]', '[data-uia="next-episode-seamless-button-draining"]'])) return true;
    var bs = document.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      var l = (bs[i].getAttribute('aria-label') || bs[i].textContent || '').trim();
      if (/^skip|next episode/i.test(l)) { bs[i].click(); return true; }
    }
    return false;
  }
  function runCmd(c) {
    if (!c || !c.a) return;
    if (desk && desk.isDesk()) return; // at the desk nothing is obeyed, whatever a reply says
    if (c.a === 'subs') {
      wake();
      setTimeout(function () { if (!clickFirst(['[data-uia="control-audio-subtitle"]', 'button[aria-label*="udio" i]', 'button[aria-label*="ubtitle" i]'])) cmdErr = 'no subtitles button'; }, 150);
    } else if (c.a === 'skip') {
      if (!skipBtn()) cmdErr = 'no skip button';
    } else {
      window.postMessage({ tvmode: 'cmd', id: ++cmdId, a: c.a, ms: c.ms || 0, kind: c.kind || '', id2: c.id || '' }, location.origin);
      if (c.a === 'seekto' || c.a === 'seekby') wake(); // show Netflix's own time bar while seeking
    }
  }
  // 2.1: when TV Mode says this window is not on the TV monitor (its reply carries desk:true),
  // the page only sends the passive desk report (deskrep.js) and never asks for or obeys commands.
  var desk = window.TVDesk ? window.TVDesk.make({ svc: 'netflix', send: function (p, b, cb) {
    b.scr = scr();
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
      chrome.runtime.sendMessage({ type: 'ext', path: p, body: b }, function (j) { void chrome.runtime.lastError; if (cb) cb(j); });
    } catch (e) { /* extension was reloaded: ignore */ }
  } }) : null;
  setInterval(function () {
    var atDesk = !!(desk && desk.isDesk());
    if (!isWatch()) { if (atDesk) desk.tick(null); return; }
    var w = readWatch(atDesk);
    if (atDesk && w && !lastReal) return; // no real title yet (the controls have not shown): say nothing, and do not call it "gone"
    if (atDesk) { desk.tick(w && w.title ? { title: w.title, season: w.season, episode: w.episode, epTitle: w.epTitle, pos: w.pos, dur: w.dur, playing: w.playing, url: w.url } : null); return; }
    if (!w) return;
    if (!w.title) w.title = 'Netflix';
    w.cmdErr = cmdErr;
    w.scr = scr();
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
      chrome.runtime.sendMessage({ type: 'ext', path: 'watch', body: w }, function (j) {
        void chrome.runtime.lastError;
        if (desk && desk.reply(j)) return; // not the TV's window: the reply holds no commands
        if (j && j.cmds) j.cmds.forEach(runCmd);
      });
    } catch (e) { /* extension was reloaded: ignore */ }
  }, 500);

  // Netflix is a single-page app: a page change (browse -> search, the profile picker -> browse) leaves the
  // d-pad pointing at a node that is gone, and "the nearest node" can land anywhere in the new page. Start
  // fresh instead: forget the old spot and, if the ring was showing, put it on the new page's first target.
  var lastPath = location.pathname;
  setInterval(function () {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    cur = null; colX = null; lastBrowse = null;
    if (!ringOn || isOff()) return;
    setTimeout(function () {
      if (cur || isOff()) return;
      var items = collect(), first = items.length ? initialPick(items) : null;
      if (first) focusItem(first, { scroll: true });
    }, 900);
  }, 400);

  sayHello();
  [4000, 12000, 30000].forEach(function (ms) { setTimeout(sayHello, ms); }); // TV Mode may still be starting
  // Netflix is a single-page app: keep saying hello (TV Mode counts 10 minutes of silence as "gone")
  setInterval(sayHello, 3 * 60 * 1000);

  // a hook for tests
  window.__tvDpad = {
    current: function () { return cur && cur.el; },
    colX: function () { return colX; },
    busy: function () { return busy; }
  };
})();
