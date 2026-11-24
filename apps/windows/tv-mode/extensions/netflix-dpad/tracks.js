// The audio and subtitle menu reader for Prime Video and JioHotstar, ported unchanged
// from TV Mode's Edge-side reader (internal/services/tracks.go, jsTracksBody). Neither
// player has an API: this opens the player's own menu, reads its choices, presses one
// if asked, and closes the menu again (it is never left open on the TV). Best effort:
// it was written without the signed-in players' markup.
// TVTracks.run(null)            -> {audio:[{id,label,on}], subs:[...]} or {err:"nobutton"|"nolist"|"nochoice"}
// TVTracks.run({kind, id})      -> the same lists after pressing one choice (kind "audio" or "subs")
// TVTracks.close()              -> presses the subtitles button again (closes a menu left open)
// Prime (helper 2.5.2, from the 2026-11-13 probe): its "Turn off subtitles" / "Turn on subtitles" button is a plain
// ON/OFF TOGGLE, never a menu: it is never pressed to read. The lists live at Settings -> "Subtitles" / "Audio" -> choices.
// The Prime path also returns subsOn (true/false, from the toggle's label). JioHotstar keeps the generic path below.
(function () {
  'use strict';
  // one run at a time: two overlapping runs (a double tap, a settrack and the refresh after it)
  // click the same toggle twice and leave the menu shut or open
  var chain = Promise.resolve();
  function queued(set) {
    var p = chain.then(function () { return once(set); });
    chain = p.then(function () { }, function () { });
    return p;
  }
  // lists read last (a subs pick still returns the audio list and the other way round without a second menu pass)
  var cache = { href: '', audio: [], subs: [] };
  var TURN = /^turn (on|off) (subtitles?|captions?)\b/i; // an on/off toggle, never a menu opener or a choice
  var XRAY = '[class*="xray" i],[role=tablist],[role=tab]'; // Prime's X-Ray panel ("In scene", "Related", "Details", cast rows)
  async function once(set) {
    {
      var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
      function lab(b) { return (b.getAttribute('aria-label') || b.getAttribute('title') || b.innerText || b.textContent || '').replace(/\s+/g, ' ').trim(); }
      function vis(e) { var r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; var s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; }
      function wake() { var v = document.querySelector('video'); var r = v ? v.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight }; var o = { bubbles: true, clientX: r.left + r.width / 2 + Math.random() * 4, clientY: r.top + r.height * 0.8 }; (v || document.body).dispatchEvent(new MouseEvent('mousemove', o)); document.dispatchEvent(new MouseEvent('mousemove', o)); }
      function isXray(e) { try { if (e.closest(XRAY)) return true; } catch (x) { /* ignore */ } return /^(in scene|related|details|x-?ray)$/i.test(lab(e)); }
      function toggle() {
        var pick = null, best = 0;
        [].slice.call(document.querySelectorAll('button,[role=button],[data-uia]')).forEach(function (b) {
          var l = (b.getAttribute('aria-label') || b.getAttribute('title') || b.getAttribute('data-uia') || b.innerText || '').replace(/\s+/g, ' ').trim(); if (!l || l.length > 60 || /unavailable/i.test(l) || TURN.test(l)) return;
          var sc = /audio.{0,6}subtitle|subtitle.{0,6}audio|audio-subtitle|subtitleaudio/i.test(l) ? 3 : /subtitle|caption/i.test(l) ? 2 : /^audio|language/i.test(l) ? 1 : 0; if (sc > best) { best = sc; pick = b; }
        });
        return pick;
      }
      // Prime's Settings button: the one place an audio list may hide when the subtitles menu has none
      function settingsBtn() { return [].slice.call(document.querySelectorAll('button,[role=button]')).filter(function (b) { return /^settings$/i.test(lab(b)) && vis(b); })[0] || null; }
      var HA = /^(audio|audio languages?|languages?|audio track|spoken language)$/i, HS = /^(subtitles?|captions?|subtitles? (and|&) captions?|closed captions?)$/i;
      // the player's own controls are never choices (2026-11-13 probe: the control bar was read as a menu)
      var CTRL = /^(close( player)?|mute|unmute|full ?screen|exit full ?screen|settings|play|pause|enter picture.in.picture|exit picture.in.picture|skip\b.*|don.t show again|speed\b.*|subtitles?\b.*|captions?\b.*|turn (on|off)\b.*|back|video quality)$/i;
      var MENU = '[role=menu],[role=dialog],[role=listbox],[role=radiogroup]';
      var CS = '[role=menuitemradio],[role=radio],[role=option],[role=menuitemcheckbox],[role=menuitem],li,button,label,[aria-checked],[aria-selected]'; var before = new Set(), beforeMenus = new Set();
      function snap() {
        before = new Set([].slice.call(document.querySelectorAll(CS)).filter(vis));
        beforeMenus = new Set([].slice.call(document.querySelectorAll(MENU)).filter(vis));
      }
      // a menu container that was not on screen before the click
      function newMenu() { return [].slice.call(document.querySelectorAll(MENU)).some(function (m) { return vis(m) && !beforeMenus.has(m); }); }
      // the control bar again (a row of the player's own buttons), not a menu
      function barLike(e) {
        var g = e.parentElement;
        for (var i = 0; i < 4 && g; i++, g = g.parentElement) {
          var bs = g.querySelectorAll('button,[role=button]');
          if (bs.length >= 3) { var n = 0; [].slice.call(bs).forEach(function (b) { if (CTRL.test(lab(b))) n++; }); return n >= 2; }
        }
        return false;
      }
      function read(tg) {
        var heads = [].slice.call(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading],p,span,div,legend,label')).filter(function (h) { if (h.children.length > 2 || !vis(h)) return false; var t = (h.textContent || '').replace(/\s+/g, ' ').trim(); return HA.test(t) || HS.test(t); });
        var cand = [].slice.call(document.querySelectorAll(CS)).filter(function (e) {
          if (e === tg || e.contains(tg) || before.has(e) || !vis(e) || isXray(e)) return false;
          var t = lab(e); if (!t || t.length > 40 || HA.test(t) || HS.test(t) || CTRL.test(t.replace(/\s*(selected|checked|current)$/i, ''))) return false;
          if (e.querySelector('[role=menuitemradio],[role=radio],[role=option],li,button')) return false;
          var m = e.closest(MENU);
          if (m) return !beforeMenus.has(m); // inside a menu that opened after the click
          return !barLike(e);
        });
        var out = { audio: [], subs: [] }, seen = {};
        cand.forEach(function (e) {
          var h = null; heads.forEach(function (x) { if (x.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) h = x; }); if (!h) return;
          var kind = HA.test(h.textContent.replace(/\s+/g, ' ').trim()) ? 'audio' : 'subs'; var t = lab(e).replace(/\s*(selected|checked|current)$/i, ''); if (seen[kind + t]) return; seen[kind + t] = 1;
          var el = e.closest('[aria-checked],[aria-selected],[aria-pressed]') || e; var on = el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true' || /(^|[\s_-])(selected|active|checked|is-selected|isSelected)/.test(String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className));
          out[kind].push({ id: t, label: t, on: !!on, el: e });
        });
        return out;
      }
      var PR = window.TVProbe;
      function mainVid() { var best = null, a = -1; [].slice.call(document.querySelectorAll('video')).forEach(function (x) { var r = x.getBoundingClientRect(), s = r.width * r.height; if (s > a) { a = s; best = x; } }); return best; }
      function loading() { var v = mainVid(); return !v || v.readyState < 3 || !isFinite(v.duration); }
      function isUn() { return [].slice.call(document.querySelectorAll('button,[role=button]')).some(function (b) { return /^(subtitles?|captions?)\b.{0,4}unavailable/i.test((b.getAttribute('aria-label') || '').trim()); }); }
      // close what a button opened: press it again only when a menu really is open (a press on a
      // control bar that opened nothing would open something else), then Escape
      async function shut(find, listed) {
        var seen = listed || newMenu(), b = null;
        if (seen) { b = find(); if (b) b.click(); }
        if (!seen) return;
        await sleep(250);
        // Escape only when a menu was seen open and the press did not close it
        var still = (b && b.isConnected && b.getAttribute('aria-expanded') === 'true') || newMenu();
        if (still) { try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); } catch (e) { /* ignore */ } }
      }
      // open a menu by its button, read it, press one choice when asked, close it
      async function session(find, want, tag) {
        var tg = find(); if (!tg) return { L: { audio: [], subs: [] }, nobtn: true };
        snap(); tg.click(); await sleep(700);
        var L = read(tg);
        if (PR) PR.event(tag, { audio: L.audio.length, subs: L.subs.length }); // the menu is open now: its markup is in the snapshot
        // the menu may still be drawing: give it a moment more before calling it empty
        for (var r = 0; r < 4 && !(L.audio.length + L.subs.length); r++) { await sleep(500); L = read(tg); }
        var hit = null;
        if (want) {
          hit = (L[want.kind] || []).filter(function (x) { return x.id === want.id; })[0] || null;
          if (hit) {
            hit.el.click(); await sleep(500); L = read(tg);
            if (!L.audio.length && !L.subs.length) { wake(); var t3 = find() || tg; snap(); t3.click(); await sleep(700); L = read(t3); }
          }
        }
        await shut(find, L.audio.length + L.subs.length > 0);
        return { L: L, hit: hit };
      }
      // ---- Prime Video: Settings -> "Subtitles" / "Audio" -> choices; the "Turn on/off subtitles" button is only a toggle ----
      function turnBtn() { return [].slice.call(document.querySelectorAll('button,[role=button]')).filter(function (b) { return TURN.test(lab(b)); })[0] || null; }
      function subsState() { var t = turnBtn(); return t ? /^turn off/i.test(lab(t)) : null; } // true: subtitles are on
      var SETITEM = /^(subtitles?|audio|speed|video quality)(\s*:.*)?$/i;
      function setItem(kind) {
        var re = kind === 'audio' ? /^audio( languages?)?$/i : /^(subtitles?|captions?)$/i;
        var els = [].slice.call(document.querySelectorAll('button,[role=button],[role=menuitem],li,a')).filter(function (e) { return vis(e) && re.test(lab(e)) && !isXray(e); });
        return els[0] || null;
      }
      function panelOpen(sb, shown) {
        return !!(setItem('subs') || setItem('audio') || (sb && sb.getAttribute('aria-expanded') === 'true') || (shown || []).some(function (e) { return e.isConnected && vis(e); }));
      }
      async function closePanel(shown) {
        var sb = settingsBtn();
        if (!panelOpen(sb, shown)) return;
        if (sb) { sb.click(); await sleep(350); }
        if (!panelOpen(settingsBtn(), shown)) return;
        // still open: Escape, only now
        try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); } catch (e) { /* ignore */ }
        await sleep(250);
        if (PR && panelOpen(settingsBtn(), shown)) PR.event('tracks:close-stuck', {});
      }
      function newVisible() { return new Set([].slice.call(document.body.querySelectorAll('*')).filter(vis)); }
      function describe(e) {
        function r(x, n) { x = String(x == null ? '' : x).replace(/\s+/g, ' ').trim(); return /\bhello\b|\bhi,|account|profile|sign ?(in|out)|log ?(in|out)|@/i.test(x) ? '[redacted]' : x.slice(0, n); }
        var c = e.className; c = c && c.baseVal !== undefined ? c.baseVal : c;
        return { tag: e.tagName.toLowerCase(), role: e.getAttribute('role') || '', aria: r(e.getAttribute('aria-label'), 40), checked: e.getAttribute('aria-checked'), selected: e.getAttribute('aria-selected'), pressed: e.getAttribute('aria-pressed'), text: r(e.textContent, 40), cls: r(c, 60) };
      }
      // the choices that were not on screen before the submenu click
      // Prime's real submenu (2026-11-13 probe): a fieldset of <label>s, each a radio choice; the name is the
      // label's first line ("English", with "AD available • Dialogue Boost available" under it on audio)
      function radioOn(l) {
        var i = l.querySelector('input'); if (!i && l.htmlFor) i = document.getElementById(l.htmlFor);
        if (i && (i.type === 'radio' || i.type === 'checkbox')) return !!i.checked;
        return l.getAttribute('aria-checked') === 'true' || !!l.querySelector('[aria-checked=true],[aria-selected=true]');
      }
      function primeRead(all, item) {
        var labs = [].slice.call(document.querySelectorAll('fieldset label')).filter(function (l) { return !all.has(l) && vis(l) && !isXray(l); });
        if (labs.length) {
          var o2 = [], s2 = {};
          labs.forEach(function (l) {
            var t = ((l.innerText || l.textContent || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean)[0] || '').replace(/\s+/g, ' ');
            if (!t || t.length > 40 || CTRL.test(t) || TURN.test(t) || s2[t]) return; s2[t] = 1;
            o2.push({ id: t, label: t, on: radioOn(l), el: l });
          });
          if (o2.length) return o2;
        }
        var out = [], seen = {};
        [].slice.call(document.querySelectorAll(CS)).forEach(function (e) {
          if (all.has(e) || e === item || !vis(e) || isXray(e)) return;
          var t = lab(e).replace(/\s*(selected|checked|current)$/i, ''); if (!t || t.length > 40 || SETITEM.test(t) || HA.test(t) || HS.test(t) || CTRL.test(t) || TURN.test(t) || seen[t]) return;
          if (e.querySelector('[role=menuitemradio],[role=radio],[role=option],li,button')) return;
          seen[t] = 1;
          var el = e.closest('[aria-checked],[aria-selected],[aria-pressed]') || e;
          var on = el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true' || /(^|[\s_-])(selected|active|checked|is-selected|isSelected)/.test(String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className));
          out.push({ id: t, label: t, on: !!on, el: e });
        });
        return out;
      }
      // one pass: open Settings, open the submenu, read it (and press a choice), close. Returns {list, hit}; list null = could not open
      async function pass(kind, pick) {
        var sb = settingsBtn();
        if (!sb) return { list: null };
        wake();
        if (!setItem(kind)) { sb.click(); await sleep(600); }
        var item = setItem(kind);
        if (!item) { if (PR) PR.event('tracks:settings-noitem', { kind: kind, items: [].slice.call(document.querySelectorAll('button,[role=button]')).filter(vis).slice(0, 12).map(function (b) { return lab(b).slice(0, 30); }) }); await closePanel(); return { list: null }; }
        var all = newVisible(); item.click(); await sleep(600);
        var list = primeRead(all, item);
        if (PR) PR.event('tracks:submenu-open', { kind: kind, n: list.length, items: [].slice.call(document.body.querySelectorAll('*')).filter(function (e) { return !all.has(e) && vis(e); }).slice(0, 40).map(describe) });
        for (var r = 0; r < 3 && !list.length; r++) { await sleep(500); list = primeRead(all, item); }
        var hit = null;
        if (pick) { hit = list.filter(function (x) { return x.id === pick.id; })[0] || null; if (hit) { hit.el.click(); await sleep(500); } }
        await closePanel(list.map(function (x) { return x.el; }));
        return { list: list, hit: hit };
      }
      function strip(a) { return a.map(function (x) { return { id: x.id, label: x.label, on: x.on }; }); }
      function primeOut() {
        var on = subsState();
        var subs = cache.subs.length ? cache.subs : on === null ? [] : [{ id: 'Off', label: 'Off', on: !on }, { id: 'On', label: 'On', on: on }];
        var o = { audio: cache.audio, subs: subs };
        if (on !== null) o.subsOn = on;
        return o;
      }
      async function prime(set) {
        var ck = location.pathname + location.search;
        if (cache.href !== ck) cache = { href: ck, audio: [], subs: [] };
        var kinds = ['subs', 'audio'];
        if (set && set.kind === 'subs' && (set.id === 'Off' || set.id === 'On')) { // the toggle itself: only pressed when it says the opposite
          var tb = turnBtn(), want = set.id === 'On';
          if (tb && (/^turn on/i.test(lab(tb))) === want) { tb.click(); await sleep(500); }
          wake(); await sleep(200);
          if (PR) PR.event('tracks:toggle', { want: set.id, now: subsState() });
          if (subsState() === false) cache.subs = cache.subs.map(function (x) { return { id: x.id, label: x.label, on: false }; });
          return primeOut();
        }
        if (set) { var other = set.kind === 'audio' ? 'subs' : 'audio'; kinds = [set.kind === 'audio' ? 'audio' : 'subs'].concat(cache[other].length ? [] : [other]); }
        var pressed = false;
        for (var i = 0; i < kinds.length; i++) {
          var k = kinds[i], pk = set && set.kind === k ? set : null;
          var p = await pass(k, pk);
          if (p.list && p.list.length) cache[k] = strip(p.list);
          if (pk && p.hit) {
            pressed = true;
            await sleep(300);
            var p2 = await pass(k, null); // the same menu again: the new marks
            if (p2.list && p2.list.length) cache[k] = strip(p2.list);
            // a language picked while subtitles are off may leave the toggle saying "Turn on subtitles"
            if (k === 'subs' && subsState() === false) { wake(); await sleep(250); var tb2 = turnBtn(); if (tb2 && /^turn on/i.test(lab(tb2))) { tb2.click(); await sleep(500); } }
          }
          if (i < kinds.length - 1) await sleep(250);
        }
        if (set && !pressed) return { err: 'nochoice' };
        return primeOut();
      }
      // the player hides its buttons (they leave the page) a few seconds after the last mouse move:
      // wake it and wait for the button instead of failing at once
      function ready() { return turnBtn() || toggle(); }
      var tg = null, t0 = Date.now();
      for (var w = 0; w < 6 && !tg; w++) { wake(); await sleep(w ? 400 : 250); tg = ready(); }
      // Prime greys the button out as "Subtitles unavailable" while the video is still loading (2026-11-13
      // probe: duration NaN, readyState 0, captions already showing): wait for it, up to about 6 s
      while (!tg && isUn() && loading() && Date.now() - t0 < 6000) { wake(); await sleep(400); tg = ready(); }
      if (!tg) {
        var un = isUn();
        if (PR) PR.event(un ? 'tracks:unavailable' : 'tracks:nobutton', { loading: loading() });
        return { err: un ? 'unavailable' : 'nobutton' };
      }
      if (turnBtn() && !/hotstar/i.test(location.hostname)) return prime(set); // JioHotstar stays on the generic path below
      var s1 = await session(function () { return toggle() || (tg.isConnected ? tg : null); }, set, 'tracks:menu-open');
      var L = s1.L, pressed = !!s1.hit;
      // no audio list in the subtitles menu and no audio / language button: Prime keeps it under Settings
      if (!L.audio.length && !(set && set.kind === 'subs') && settingsBtn() && !/audio|language/i.test(lab(tg))) {
        wake(); await sleep(250);
        var s2 = await session(settingsBtn, set && set.kind === 'audio' ? set : null, 'tracks:settings-open');
        if (!s2.nobtn) {
          L = { audio: s2.L.audio, subs: L.subs.length ? L.subs : s2.L.subs };
          pressed = pressed || !!s2.hit;
        }
      }
      if (set && !pressed) return { err: 'nochoice' };
      if (!L.audio.length && !L.subs.length) { if (PR) PR.event('tracks:nolist', {}); return { err: 'nolist' }; } // the menu is already closed: the next try must not close it
      return { audio: strip(L.audio), subs: strip(L.subs) };
    }
  }
  window.TVTracks = {
    run: queued,
    close: function () {
      var pick = null, best = 0;
      [].slice.call(document.querySelectorAll('button,[role=button],[data-uia]')).forEach(function (b) {
        var l = (b.getAttribute('aria-label') || b.getAttribute('title') || b.getAttribute('data-uia') || b.innerText || '').replace(/\s+/g, ' ').trim(); if (!l || l.length > 60 || /unavailable/i.test(l) || TURN.test(l)) return;
        var sc = /audio.{0,6}subtitle|subtitle.{0,6}audio|audio-subtitle|subtitleaudio/i.test(l) ? 3 : /subtitle|caption/i.test(l) ? 2 : /^audio|language/i.test(l) ? 1 : 0; if (sc > best) { best = sc; pick = b; }
      });
      if (!pick) return 'none'; pick.click(); return 'ok';
    }
  };
})();
