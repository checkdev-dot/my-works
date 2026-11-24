// TV Mode Helper 2.4 (2.5: JioHotstar too, see hot() below): the probe. The Prime selectors in prime.js and tracks.js were written without
// ever seeing the signed-in player's markup. This sends TV Mode (POST /api/ext/probe, which appends a
// line to %APPDATA%\TVMode\prime-probe.jsonl) a snapshot of the PLAYER AREA only, at the moments that
// matter: an ad starting or ending, a subtitles read that failed or worked, a play / pause command,
// a full-screen request, an episode landing on its page, and once a minute while the player is up
// (60 at most per page load). Buttons (labels, test ids, classes), elements whose class names an ad,
// skip, timer, subtitle, audio or caption, the videos, and any open menu. No cookies, no storage, no
// account names: elements inside a header, nav or footer are left out, and a label that names an
// account is replaced.
(function () {
  'use strict';
  var P = window.TVProbe = {};
  var cfg = null, Core = null, send = null, total = 0, periodic = 0, adTried = false, pageKey = '', pages = 0;
  var TOTAL_MAX = 400;

  function redact(s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    if (/\bhello\b|\bhi,|account|profile|sign ?(in|out)|log ?(in|out)|@/i.test(s)) return '[redacted]';
    return s.slice(0, n);
  }
  function vis(e) {
    var r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var s = getComputedStyle(e);
    return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05;
  }
  function outside(e) { return !!(e.closest && e.closest('header,nav,footer,[role=navigation],[role=banner],[role=contentinfo]')); }
  function cls(e) { var c = e.className; return String(c && c.baseVal !== undefined ? c.baseVal : c || '').trim().slice(0, 120); }

  // the player area: the video's ancestor that holds the controls (3+ buttons), up to 8 levels; the whole body if unsure
  function root() {
    var v = Core && Core.mainVideo && Core.mainVideo();
    if (!v || !(cfg && cfg.isPlayer())) return document.body;
    var e = v;
    for (var i = 0; i < 8 && e.parentElement && e.parentElement !== document.body && e.parentElement !== document.documentElement; i++) {
      e = e.parentElement;
      if (e.querySelectorAll('button,[role=button]').length >= 3) return e;
    }
    return document.body;
  }

  function videos() {
    return [].slice.call(document.querySelectorAll('video')).slice(0, 6).map(function (v) {
      var r = v.getBoundingClientRect();
      var o = { dur: isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : String(v.duration), t: Math.round(v.currentTime * 10) / 10, paused: v.paused, rate: v.playbackRate, muted: v.muted, loop: v.loop, ready: v.readyState, w: Math.round(r.width), h: Math.round(r.height) };
      if (cfg && cfg.svc === 'jiohotstar') { var ch = [], e = v.parentElement; for (var i = 0; i < 6 && e && e !== document.body; i++, e = e.parentElement) ch.push(e.tagName.toLowerCase() + '.' + cls(e).slice(0, 50)); o.chain = ch; }
      return o;
    });
  }

  var EL_RE = /(^|[^a-z])ads?([^a-z]|$)|skip|timer|subtitle|audio|caption/i;
  function snapshot() {
    var rt = root(), out = { root: rt === document.body ? 'body' : rt.tagName.toLowerCase() + '.' + cls(rt).slice(0, 60) };
    out.buttons = [].slice.call(rt.querySelectorAll('button,[role=button]')).filter(function (b) { return !outside(b); }).slice(0, 80).map(function (b) {
      return { l: redact(b.getAttribute('aria-label'), 60), t: redact(b.getAttribute('title'), 60), id: redact(b.getAttribute('data-testid'), 60), da: redact(b.getAttribute('data-automation-id'), 60), c: cls(b), v: vis(b), tx: b.getAttribute('aria-label') || b.getAttribute('title') ? undefined : redact(b.textContent, 30) };
    });
    out.els = [].slice.call(rt.querySelectorAll('[class]')).filter(function (e) { return !outside(e) && EL_RE.test(cls(e)); }).slice(0, 60).map(function (e) {
      return { tag: e.tagName.toLowerCase(), c: cls(e), tx: redact(e.textContent, 60), v: vis(e) };
    });
    out.menus = [].slice.call(document.querySelectorAll('[role=menu],[role=dialog],[role=listbox],[role=tablist]')).filter(function (m) { return !outside(m) && vis(m); }).slice(0, 4).map(function (m) {
      var roles = {};
      [].slice.call(m.querySelectorAll('[role]')).forEach(function (x) { var r = x.getAttribute('role'); roles[r] = (roles[r] || 0) + 1; });
      return { role: m.getAttribute('role'), heads: [].slice.call(m.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')).slice(0, 6).map(function (h) { return redact(h.textContent, 40); }), roles: roles, items: [].slice.call(m.querySelectorAll('[role=menuitem],[role=menuitemradio],[role=radio],[role=option],li,button')).slice(0, 24).map(function (x) { return redact(x.getAttribute('aria-label') || x.textContent, 30); }) };
    });
    return out;
  }

  // the player's controls are on screen (3 or more visible buttons in the player area): a snapshot without them says nothing
  function controlsUp() {
    var rt = root();
    return [].slice.call(rt.querySelectorAll('button,[role=button]')).filter(function (b) { return !outside(b) && vis(b); }).length >= 3;
  }

  // JioHotstar: what the written selectors in hotstar.js never saw (2.5). Where the player lives (an iframe, a shadow
  // root), the three title sources, the ad's own text and class, skip buttons, and on a show page the episode links.
  function hot() {
    var o = {};
    o.path = location.pathname;
    o.ttl = { h1: redact((document.querySelector('h1') || {}).textContent, 80), og: redact((document.querySelector('meta[property="og:title"]') || {}).content, 80), doc: redact(document.title, 80) };
    o.iframes = document.querySelectorAll('iframe').length;
    var sh = 0, shv = 0, all = document.querySelectorAll('*');
    for (var i = 0; i < all.length && i < 4000; i++) { if (all[i].shadowRoot) { sh++; if (all[i].shadowRoot.querySelector('video')) shv++; } }
    o.shadow = { hosts: sh, withVideo: shv };
    o.adDom = [].slice.call(document.querySelectorAll('span,div,p')).filter(function (e) { return !e.children.length && /^ads?\b/i.test((e.textContent || '').trim()) && (e.textContent || '').trim().length < 30; }).slice(0, 5).map(function (e) { return { tx: redact(e.textContent, 30), c: cls(e), v: vis(e) }; });
    o.skips = [].slice.call(document.querySelectorAll('button,[role=button],a')).filter(function (e) { return /skip|next episode/i.test((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '').slice(0, 40)); }).slice(0, 6).map(function (e) { return { tx: redact(e.getAttribute('aria-label') || e.textContent, 30), id: redact(e.getAttribute('data-testid'), 40), c: cls(e), v: vis(e) }; });
    if (!cfg.isPlayer()) o.eps = [].slice.call(document.querySelectorAll("a[href*='/watch']")).slice(0, 20).map(function (a) { return { l: redact(a.getAttribute('aria-label') || a.innerText, 60), h: a.getAttribute('href') ? a.getAttribute('href').split('?')[0].slice(0, 120) : '' }; });
    return o;
  }

  // one event: name, what the caller knows (extra), light = videos only (the timed play / pause reads)
  P.event = function (name, extra, light) {
    if (!send || total >= TOTAL_MAX) return;
    total++;
    var b = { ev: name, path: location.pathname, vid: videos(), x: extra || {} };
    try { b.player = !!cfg.isPlayer(); b.ad = !!cfg.ad(); b.cov = Math.round(Core.coverage() * 1000) / 1000; } catch (e) { /* never break the page */ }
    if (!light && cfg.svc === 'jiohotstar') { try { b.hot = hot(); } catch (e) { b.hotErr = String(e && e.message || e).slice(0, 80); } }
    if (!light) { try { var s = snapshot(); b.root = s.root; b.buttons = s.buttons; b.els = s.els; b.menus = s.menus; } catch (e) { b.err = String(e && e.message || e).slice(0, 80); } }
    if (JSON.stringify(b).length > 90000) { b.buttons = (b.buttons || []).slice(0, 30); b.els = (b.els || []).slice(0, 20); }
    send('probe', b);
  };

  // a play / pause command: the state before, then 300 ms and 1500 ms after
  P.cmd = function (name, pausedBefore) {
    P.event('cmd:' + name, { pausedBefore: pausedBefore }, true);
    setTimeout(function () { P.event('cmd:' + name + ':+300', {}, true); }, 300);
    setTimeout(function () { P.event('cmd:' + name + ':+1500', {}, true); }, 1500);
  };

  // a currentTime / playbackRate write: does it stick? the value asked for, the state at once, and 500 ms and 2 s later
  // (at most one per 4 s and 30 per page, so a scrub drag cannot fill the file)
  var lastWrite = 0, writes = 0;
  P.write = function (kind, want, v, before) {
    if (!send || writes >= 30 || Date.now() - lastWrite < 4000) return;
    lastWrite = Date.now(); writes++;
    function rd() { return kind === 'speed' ? v.playbackRate : v.currentTime; }
    P.event('write:' + kind, { want: want, before: before, now: rd() }, true);
    [500, 2000].forEach(function (ms) { setTimeout(function () { P.event('write:' + kind + ':+' + ms, { want: want, now: rd() }, true); }, ms); });
  };

  // during an ad, once per page load: can its rate be raised? (set 8, read it back after 500 ms)
  P.adRate = function () {
    if (adTried || !Core) return;
    var v = Core.mainVideo();
    if (!v) return;
    adTried = true;
    var skipper = v.dataset.tvhAdActive === '1'; // prime.js's skipper may have raised it already: the rate before that is its note
    var before = skipper ? (parseFloat(v.dataset.tvhAdRate) || 1) : v.playbackRate;
    try { v.playbackRate = 8; } catch (e) { /* recorded below */ }
    setTimeout(function () {
      var after = v.playbackRate;
      if (!v.dataset.tvhAdActive) { try { v.playbackRate = before; } catch (e) { /* ignore */ } } // the skipper restores its own change
      P.event('ad:rate', { before: before, skipperAlreadyOn: skipper, set: 8, readBack: after, dur: isFinite(v.duration) ? v.duration : null }, true);
    }, 500);
  };

  P.init = function (o) {
    if (cfg) return;
    cfg = o.cfg; Core = o.Core; send = o.send;
    // once a minute while the player is up, 60 at most
    // (2.5: only while the player's controls are up; a snapshot without them is empty. JioHotstar also gets one
    // snapshot of the hidden state, so both are on record)
    var hiddenDone = false;
    setInterval(function () {
      if (periodic >= 60 || !cfg.isPlayer()) return;
      if (!controlsUp()) {
        if (cfg.svc === 'jiohotstar' && !hiddenDone) { hiddenDone = true; P.event('controls:hidden', {}); }
        return;
      }
      periodic++;
      P.event('minute', { n: periodic });
    }, 60000);
    // a page that is not the player (a title's page with its Resume button): one snapshot a few seconds after it loads
    setInterval(function () {
      var k = location.pathname;
      if (cfg.isPlayer() || k === pageKey || pages >= 20) return;
      pageKey = k; pages++;
      setTimeout(function () { if (!cfg.isPlayer()) P.event('page', { n: pages }); }, 3500);
    }, 3000);
  };
})();
