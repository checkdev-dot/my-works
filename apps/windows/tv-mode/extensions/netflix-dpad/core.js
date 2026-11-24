// (2.1: when TV Mode says the window is not on the TV monitor, this file switches to the passive
// desk report in deskrep.js: no commands, no kick, no tracks or links.)
// TV Mode Helper: the part Prime Video and JioHotstar share. Runs in the page's isolated
// world (no MAIN-world script is needed: <video> time and rate can be written directly
// on these players, unlike Netflix's). While a video plays it reports to TV Mode twice a
// second (through background.js) and takes back the phone's commands in the reply:
// seek, scrub, play/pause, speed, skip, and the subtitles and audio lists.
//
// TVHelperCore.start(cfg) with cfg = {
//   svc: 'prime' | 'jiohotstar',
//   isPlayer(): bool                 the player (not a browse page) is up
//   ad(): bool                       an ad shows on the player
//   skip(): bool                     press the skip / next button; true when one was pressed
//   links(): {title, url, eps} | null  what a browse page says about its title's episodes
//   onTick(): void                   optional, every 500 ms (Prime's ad skipper)
// }
(function () {
  'use strict';
  var Core = {};
  window.TVHelperCore = Core;

  function manifestVersion() { try { return chrome.runtime.getManifest().version; } catch (e) { return ''; } }

  // where this window is, so TV Mode only listens to the one on the TV monitor
  function scr() {
    return { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight, dpr: window.devicePixelRatio || 1 };
  }
  Core.scr = scr;

  function mainVideo() {
    var vs = [].slice.call(document.querySelectorAll('video')), v = null, a = -1;
    vs.forEach(function (x) { var r = x.getBoundingClientRect(), s = r.width * r.height; if (s > a) { a = s; v = x; } });
    return v;
  }
  // the share of the window the biggest video covers (a hero trailer covers about half)
  function coverage() {
    var v = mainVideo();
    if (!v) return 0;
    var r = v.getBoundingClientRect();
    var w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)), h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return (w * h) / Math.max(1, innerWidth * innerHeight);
  }
  Core.mainVideo = mainVideo;
  Core.coverage = coverage;

  // the same snapshot TV Mode's Edge poll took (services.JSWatch), so Continue watching
  // reads the page the same way for both browsers
  function readPage() {
    function q(s) { var e = document.querySelector(s); return e ? (e.textContent || '').trim() : ''; }
    function meta(p) { var m = document.querySelector('meta[property="' + p + '"]'); return m && m.content ? m.content : ''; }
    var v = mainVideo();
    var ok = v && isFinite(v.duration) && v.duration > 0 && v.getBoundingClientRect().width > 0; // a hidden preloaded video (a title's page) is not playing
    return {
      href: location.href, title: document.title, ogt: meta('og:title'), ogi: meta('og:image'),
      pt: q('.atvwebplayersdk-title-text'), ps: q('.atvwebplayersdk-subtitle-text'), h1: q('h1'),
      has: !!ok, playing: !!ok && !v.paused && !v.ended, pos: ok ? Math.floor(v.currentTime) : 0, dur: ok ? Math.floor(v.duration) : 0, loop: !!(v && v.loop), rate: ok ? Math.round(v.playbackRate * 100) / 100 : 0
    };
  }
  Core.readPage = readPage;

  // a skip button by its own words (and the player's own classes, given by the service)
  Core.pressByText = function (re, root) {
    var bs = (root || document).querySelectorAll('button,[role=button],a[role=button]');
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i], l = (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim();
      if (l && l.length < 40 && re.test(l)) {
        var r = b.getBoundingClientRect(), s = getComputedStyle(b);
        if (r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none') { b.click(); return true; }
      }
    }
    return false;
  };
  Core.pressFirst = function (sels) {
    for (var i = 0; i < sels.length; i++) {
      var b = document.querySelector(sels[i]);
      if (b) { var r = b.getBoundingClientRect(); if (r.width > 0 && r.height > 0) { b.click(); return true; } }
    }
    return false;
  };

  Core.start = function (cfg) {
    if (window.__tvhStarted) return;
    window.__tvhStarted = true;
    var ver = manifestVersion();
    var cmdErr = '';

    // 2.1: when TV Mode says this window is at the desk, only the passive desk report and hello go out
    var desk = window.TVDesk ? window.TVDesk.make({ svc: cfg.svc, send: function (p, b, cb) { sendBg(p, b, cb); } }) : null;
    Core.desk = desk;

    function sendBg(path, body, cb) {
      body = body || {};
      if (desk && desk.isDesk() && path !== 'hello' && !(path === 'watch' && body.where === 'desk')) return;
      body.svc = cfg.svc;
      body.scr = scr();
      try {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
        chrome.runtime.sendMessage({ type: 'ext', path: path, body: body }, function (j) { void chrome.runtime.lastError; if (cb) cb(j); });
      } catch (e) { /* the extension was reloaded: ignore */ }
    }
    Core.sendBg = sendBg;
    function probe(name, extra, light) { if (window.TVProbe) window.TVProbe.event(name, extra, light); }
    if (window.TVProbe) window.TVProbe.init({ cfg: cfg, Core: Core, send: sendBg });

    function sayHello() { sendBg('hello', { v: 2, ver: ver, host: location.hostname, path: location.pathname }); }

    function wake() {
      var v = mainVideo();
      var r = v ? v.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
      var o = { bubbles: true, clientX: r.left + r.width / 2 + Math.random() * 4, clientY: r.top + r.height * 0.8 };
      (v || document.body).dispatchEvent(new MouseEvent('mousemove', o));
      document.dispatchEvent(new MouseEvent('mousemove', o));
    }

    function runTracks(set, isSet) {
      if (/^(tracks|settrack):/.test(cmdErr)) cmdErr = ''; // an old tracks failure must not repeat; a pending "play:" error stays
      window.TVTracks.run(set).then(function (L) {
        if (L && L.err) { cmdErr = (isSet ? 'settrack: ' : 'tracks: ') + L.err; probe('tracks:err', { err: L.err, set: !!isSet }); return; }
        if (/^(tracks|settrack):/.test(cmdErr)) cmdErr = '';
        probe('tracks:read', { audio: L.audio.length, subs: L.subs.length, labels: L.subs.map(function (x) { return x.label; }).slice(0, 12) });
        var tb = { audio: L.audio, subs: L.subs }; if (typeof L.subsOn === 'boolean') tb.subsOn = L.subsOn;
        sendBg('tracks', tb);
      }, function (e) { cmdErr = (isSet ? 'settrack: ' : 'tracks: ') + String(e && e.message || e).slice(0, 80); });
    }

    function runCmd(c) {
      if (!c || !c.a) return;
      if (desk && desk.isDesk()) return; // at the desk nothing is obeyed, whatever a reply says
      var v = mainVideo();
      try {
        switch (c.a) {
          case 'seekto':
            if (!v) { cmdErr = 'seekto: no video'; return; }
            v.currentTime = Math.max(0, Math.min((v.duration || 1e9) - 1, (c.ms || 0) / 1000));
            if (window.TVProbe) window.TVProbe.write('seekto', v.currentTime, v);
            wake();
            break;
          case 'seekby':
            if (!v) { cmdErr = 'seekby: no video'; return; }
            v.currentTime = Math.max(0, Math.min((v.duration || 1e9) - 1, v.currentTime + (c.ms || 0) / 1000));
            if (window.TVProbe) window.TVProbe.write('seekby', v.currentTime, v);
            wake();
            break;
          case 'playpause':
            if (!v) { cmdErr = 'playpause: no video'; return; }
            if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function (e) { cmdErr = 'play: ' + String(e && e.name || e).slice(0, 40); /* needs a gesture: TV Mode presses the media key */ }); } else v.pause();
            break;
          case 'play':
          case 'pause': {
            // the wanted state, so a press that arrives twice cannot undo itself; read back after 500 ms
            if (!v) { cmdErr = c.a + ': no video'; return; }
            var wantPlay = c.a === 'play', was = v.paused;
            probe('cmd:' + c.a, { pausedBefore: was }, true);
            setTimeout(function () { probe('cmd:' + c.a + ':+300', {}, true); }, 300);
            setTimeout(function () { probe('cmd:' + c.a + ':+1500', {}, true); }, 1500);
            if (wantPlay) { if (was) { var p3 = v.play(); if (p3 && p3.catch) p3.catch(function (e) { cmdErr = 'play: ' + String(e && e.name || e).slice(0, 40); }); } } else if (!was) v.pause();
            setTimeout(function () {
              var v2 = mainVideo() || v;
              if (v2.paused === wantPlay && !(wantPlay && v2.ended)) cmdErr = c.a + ': the player reverted it (paused=' + v2.paused + ')';
            }, 500);
            break;
          }
          case 'fullscreen': {
            // the player's own full-screen control; TV Mode sends a real f key after if the video still covers little
            probe('fullscreen:before', { cov: coverage() });
            var pressed = Core.pressByText(/^(?!.*(exit|leave|close)).*full ?screen/i);
            if (!pressed) cmdErr = 'fullscreen: nobutton';
            setTimeout(function () { probe('fullscreen:after', { pressed: pressed, cov: coverage() }); }, 1500);
            break;
          }
          case 'speed':
            if (!v) { cmdErr = 'speed: no video'; return; }
            var wantRate = Math.max(0.5, Math.min(2, (c.ms || 1000) / 1000)), rateBefore = v.playbackRate;
            v.playbackRate = wantRate;
            if (window.TVProbe) window.TVProbe.write('speed', wantRate, v, rateBefore);
            break;
          case 'closemenu': {
            // the phone's Close menu on Prime / JioHotstar: Escape, then the button of a menu still open (aria-expanded)
            try { var esc = { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }; document.dispatchEvent(new KeyboardEvent('keydown', esc)); document.dispatchEvent(new KeyboardEvent('keyup', esc)); } catch (e) { /* ignore */ }
            setTimeout(function () {
              var b = [].slice.call(document.querySelectorAll('button[aria-expanded="true"],[role=button][aria-expanded="true"]')).filter(function (x) { return /subtitle|caption|audio|language|settings/i.test((x.getAttribute('aria-label') || x.textContent || '').trim()); })[0];
              if (b) b.click();
            }, 250);
            break;
          }
          case 'skip':
            if (!cfg.skip()) cmdErr = 'no skip button';
            break;
          case 'tracks':
            runTracks(null, false);
            break;
          case 'settrack':
            runTracks({ kind: c.kind, id: c.id }, true);
            break;
          default:
            cmdErr = 'unknown ' + c.a;
        }
      } catch (e) { cmdErr = c.a + ': ' + String(e && e.message || e).slice(0, 80); }
    }
    Core.runCmd = runCmd;

    // --- the report, twice a second, only while the player is up ---
    function snapOf() {
      if (!cfg.isPlayer()) return null;
      var w = readPage();
      if (!w.has) return null;
      var v = mainVideo();
      return { title: (w.pt || w.h1 || w.ogt || w.title || '').trim(), pos: w.pos, dur: w.dur, playing: w.playing, ended: !!(v && v.ended), ad: !!cfg.ad(), url: location.href, w: w };
    }
    var lastAd = false;
    function tick() {
      if (cfg.onTick) { try { cfg.onTick(); } catch (e) { /* never break the report */ } }
      if (desk && desk.isDesk()) { desk.tick(snapOf()); return; } // at the desk: no kick, no commands, no TV report
      kick();
      if (!cfg.isPlayer()) return;
      var w = readPage();
      if (!w.has) return;
      var ad = !!cfg.ad();
      if (ad !== lastAd) { lastAd = ad; probe('ad', { ad: ad }); if (ad && window.TVProbe) window.TVProbe.adRate(); }
      var title = (w.pt || w.h1 || w.ogt || w.title || '').trim();
      var body = { title: title, pos: w.pos, dur: w.dur, playing: w.playing, url: location.href, ad: ad, rate: ad ? 0 : w.rate, w: w, cmdErr: cmdErr, cov: Math.round(coverage() * 1000) / 1000 };
      cmdErr = ''; // each failure goes out once: a report sent before a retry arrives must not repeat it
      sendBg('watch', body, function (j) {
        if (desk && desk.reply(j)) return; // TV Mode says this window is not on the TV: its reply carries no commands
        if (j && j.cmds) j.cmds.forEach(runCmd);
      });
    }

    // --- start a player that waits for a click (a TV remote never makes one) ---
    var kickHref = '', kickAt = 0, kickDone = false, drove = 0, startedAt = 0;
    // a Play / Resume press (prime.js) or a page TV Mode just opened is what a kick may finish
    Core.noteStart = function () { startedAt = Date.now(); };
    ['keydown', 'mousedown', 'wheel', 'touchstart'].forEach(function (t) {
      window.addEventListener(t, function (e) { if (e.isTrusted) drove = Date.now(); }, true);
    });
    function kick() {
      if (!cfg.isPlayer()) { kickHref = ''; return; }
      if (location.href !== kickHref) { kickHref = location.href; kickAt = Date.now(); kickDone = false; }
      var age = Date.now() - kickAt;
      if (kickDone || age > 20000 || age < 3000) return;
      if (drove > kickAt) { kickDone = true; return; } // he is driving: leave it to him
      var v = [].slice.call(document.querySelectorAll('video')).filter(function (x) { return x.duration > 120 && isFinite(x.duration); }).sort(function (a, b) { return b.duration - a.duration; })[0];
      if (!v || v.readyState < 3) return;
      if (v.loop) { kickDone = true; return; } // a looping video is a page's hero trailer, never the show
      if (!v.paused) { kickDone = true; return; }
      // a resumed title starts paused part-way in, so the position says nothing: only a start TV Mode itself
      // made in the last 20 s (a press, or this page loading) is kicked, and only if he has not driven the page
      if (!(Date.now() - startedAt < 20000 || performance.now() < 20000)) { kickDone = true; return; }
      var p = v.play(); if (p && p.catch) p.catch(function () { /* blocked: nothing more to do */ });
      kickDone = true;
    }

    // --- episode addresses a browse page shows, for the link book ---
    var lastLinks = '';
    function scanLinks() {
      if (!cfg.links || cfg.isPlayer()) return;
      var l = null;
      try { l = cfg.links(); } catch (e) { return; }
      if (!l || !l.title) return;
      var sig = l.title + '|' + (l.url || '') + '|' + (l.eps ? l.eps.length : 0);
      if (sig === lastLinks) return;
      lastLinks = sig;
      sendBg('link', { title: l.title, url: l.url || '', eps: l.eps || [] });
    }

    // --- "#tvpick=<title>": TV Mode had to open the service's SEARCH (no title page known yet).
    // Click the result named exactly that (else one that starts with it, after 3 s) and let the
    // service carry on; TV Mode's own cursor is never needed. The note survives a redirect in
    // sessionStorage, and lapses after 60 s so it can never act on a later search of his own.
    var PK = 'tvh-pick', pick = null;
    try {
      var pm = /[#&]tvpick=([^&]+)/.exec(location.hash);
      if (pm) {
        pick = { t: decodeURIComponent(pm[1].replace(/\+/g, ' ')), at: Date.now() };
        sessionStorage.setItem(PK, JSON.stringify(pick));
        history.replaceState(null, '', location.pathname + location.search);
      } else pick = JSON.parse(sessionStorage.getItem(PK) || 'null');
    } catch (e) { /* none */ }
    if (pick && Date.now() - pick.at > 60000) { pick = null; try { sessionStorage.removeItem(PK); } catch (e) { /* none */ } }
    function norm(x) { return (x || '').toLowerCase().replace(/[^a-z0-9\u0080-\uffff]/g, ''); }
    function pickTick() {
      if (!pick || (desk && desk.isDesk())) return;
      if (Date.now() - pick.at > 60000 || cfg.isPlayer()) { pick = null; try { sessionStorage.removeItem(PK); } catch (e) { /* none */ } return; }
      var sel = cfg.svc === 'prime' ? "a[href*='/detail/']" : "a[href*='/shows/'],a[href*='/movies/']";
      var w = norm(pick.t), exact = '', pre = '';
      [].slice.call(document.querySelectorAll(sel)).forEach(function (a) {
        var h = a.getAttribute('href') || '';
        if (cfg.svc !== 'prime' && !/\/(shows|movies)\/[^/]+\/\d+/.test(h)) return;
        var img = a.querySelector('img[alt]');
        var l = norm(a.getAttribute('aria-label') || a.innerText || (img && img.alt));
        if (!l) return;
        if (!exact && (l === w || l === w + 'season1')) exact = a.href;
        else if (!pre && l.indexOf(w) === 0) pre = a.href;
      });
      var hit = exact || (Date.now() - pick.at > 3000 ? pre : '');
      if (!hit) return;
      pick = null; try { sessionStorage.removeItem(PK); } catch (e) { /* none */ }
      var base = hit.split('?')[0].split('#')[0];
      if (cfg.svc === 'prime') location.assign(base + '?autoplay=1'); // prime.js presses Play / Resume on it
      else location.assign(/\/movies\//.test(base) && !/\/watch$/.test(base) ? base.replace(/\/$/, '') + '/watch' : base);
    }
    setInterval(pickTick, 700);

    // hello: a burst first (TV Mode may still be starting, and one lost hello left the d-pad
    // "not live" for 3 minutes), then every 3 minutes (TV Mode counts 10 minutes of silence as "gone")
    sayHello();
    [4000, 12000, 30000].forEach(function (ms) { setTimeout(sayHello, ms); });
    setInterval(sayHello, 3 * 60 * 1000);
    setInterval(tick, 500);
    setInterval(scanLinks, 4000);
    Core._tick = tick; // a hook for tests
    Core._scanLinks = scanLinks;
  };
})();
