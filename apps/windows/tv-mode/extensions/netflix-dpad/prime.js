// TV Mode Helper on Prime Video: the player's selectors for core.js, the ad / intro /
// recap / next-episode skipper (ported from extensions/prime-skip/content.js), the episode
// addresses a season page shows, and the "#tvep=N" note TV Mode leaves when it opens a
// season page to start one episode (press that row's play button).
(function () {
  'use strict';
  var Core = window.TVHelperCore;
  if (!Core || !window.TVTracks) return;

  var AD_RATE = 8;
  // Ad is playing when one of these shows text (current and legacy player UI).
  var AD_INDICATORS = [
    '.atv-player-ad-time-remaining',
    '.atvwebplayersdk-ad-timer-remaining-time',
    '.atvwebplayersdk-ad-timer-text',
    '.atvwebplayersdk-adtimeindicator-text',
    '.atvwebplayersdk-ad-resume-message'
  ];
  // Prime's own skip controls: ad, intro, recap, next-episode card.
  var SKIP_BUTTONS = [
    '.adSkipButton.skippable',
    '.atvwebplayersdk-skipelement-button',   // skip intro / recap
    '.atvwebplayersdk-nextupcard-button'     // next episode (skip credits)
  ];
  var SKIP_WORDS = /^(skip( (intro|recap|ad|ads|credits))?|next episode)$/i;

  function visible(el) {
    if (!el || !el.isConnected) return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    var s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) !== 0;
  }

  function adPlaying() {
    return AD_INDICATORS.some(function (sel) {
      var el = document.querySelector(sel);
      return visible(el) && el.textContent.trim().length > 0;
    });
  }

  // --- a title's page versus the player ---
  // Prime's player is an overlay on the same /detail/ address, so the address cannot tell them apart.
  // The title's page has a full-bleed hero (often a muted, looping trailer) with a Play / Resume
  // button on it; the player has its own chrome (title text, ad timer, atvwebplayersdk-* controls).
  var PLAY_SELS = "[data-automation-id='dp-atf-play-button'],.fbl-play-btn,[data-automation-id='atf-play-button'],[data-automation-id='play-button'],[data-testid='playbutton'],[data-testid='play-button']";
  var PLAY_WORDS = /^(resume|play|play now|watch now|continue watching|play from beginning|start watching|watch with prime)(\s|$)/i;
  var NOT_PLAY = /ad[\s-]?free|trailer/i; // "Go ad free" sells a plan, it does not play
  function labelOf(b) { return (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(); }
  function playOK(b) { return visible(b) && !NOT_PLAY.test(labelOf(b) + ' ' + (b.getAttribute('aria-label') || '')); }
  // the page's main play control that is on screen now, or null
  // the first 8 s after load only the page's own play selectors count (the text fallback can hit an episode row's "Play..." link);
  // after that, the first text match in the hero area (the top half of the page)
  var loadAt = Date.now();
  function playButton(press) { // press: the autoplay press (strict); isPlayer() asks without it
    var el = [].slice.call(document.querySelectorAll(PLAY_SELS)).filter(playOK)[0];
    if (el) return el;
    if (press && Date.now() - loadAt < 8000) return null;
    return [].slice.call(document.querySelectorAll("button,a[role=button],a[href],[role=button]")).filter(function (b) {
      var t = labelOf(b);
      if (!(t && t.length < 40 && PLAY_WORDS.test(t) && playOK(b))) return false;
      if (!press) return true;
      var r = b.getBoundingClientRect();
      return r.top + r.height / 2 < innerHeight / 2;
    })[0] || null;
  }
  function playerChrome() {
    var pt = document.querySelector('.atvwebplayersdk-title-text');
    if (pt && (pt.textContent || '').trim() !== '') return true;
    if (adPlaying()) return true;
    return [].slice.call(document.querySelectorAll('[class*="atvwebplayersdk-"]')).slice(0, 30).some(visible);
  }

  function isPlayer() {
    if (/autoplay=trailer/.test(location.search)) return false;
    var c = Core.coverage();
    if (c < 0.5) return false;
    var v = Core.mainVideo();
    if (v && v.loop) return false; // a hero trailer loops; the show does not
    var pt = document.querySelector('.atvwebplayersdk-title-text');
    var titled = !!pt && (pt.textContent || '').trim() !== '';
    // the title's page: the hero covers the window and a Play / Resume button shows, with no player chrome
    if (!titled && !playerChrome() && playButton()) return false;
    // a hero trailer on a title page covers about half the window; the player covers it all
    return c >= 0.75 || (c >= 0.5 && titled);
  }

  // --- the skipper (the standalone TV Mode Prime Skip, kept working in one extension) ---
  var skipOn = false;
  function clickSkips() {
    SKIP_BUTTONS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (b) {
        if (!visible(b) || b.dataset.tvhSkipClicked) return;
        b.dataset.tvhSkipClicked = '1';
        setTimeout(function () { b.click(); }, 400);
        setTimeout(function () { delete b.dataset.tvhSkipClicked; }, 3000); // a later button on the same node may click again
      });
    });
  }
  function videos() { return document.querySelectorAll('video'); }
  function fastForward() {
    videos().forEach(function (v) {
      if (v.dataset.tvhAdActive !== '1') {
        v.dataset.tvhAdActive = '1';
        v.dataset.tvhAdMuted = v.muted ? '1' : '0';
        v.dataset.tvhAdRate = String(v.playbackRate === AD_RATE ? 1 : v.playbackRate);
      }
      v.muted = true;
      if (v.playbackRate !== AD_RATE) v.playbackRate = AD_RATE;
      // jump to the end of a short, fully known ad
      if (isFinite(v.duration) && v.duration > 0 && v.duration < 180 && v.currentTime < v.duration - 0.3) {
        try { v.currentTime = v.duration - 0.2; } catch (e) { /* ignore */ }
      }
    });
  }
  function restore() {
    videos().forEach(function (v) {
      if (v.dataset.tvhAdActive === '1') {
        v.muted = v.dataset.tvhAdMuted === '1';
        v.playbackRate = parseFloat(v.dataset.tvhAdRate) || 1;
        delete v.dataset.tvhAdActive; delete v.dataset.tvhAdMuted; delete v.dataset.tvhAdRate;
      } else if (v.playbackRate === AD_RATE) {
        v.playbackRate = 1;
      }
    });
  }
  // the standalone "TV Mode Prime Skip" extension marks the page; if it is loaded too,
  // leave the skipping to it (two skippers fighting over the rate would be worse than one)
  setTimeout(function () {
    skipOn = document.documentElement.dataset.primeSkip !== '1';
    if (!skipOn) console.log('[tv-mode-helper] the Prime Skip extension is also loaded: its skipper is used');
  }, 1500);

  var busy = false;
  function onTick() {
    if (busy) return;
    busy = true;
    try {
      if (skipOn) {
        clickSkips();
        if (adPlaying()) fastForward(); else restore();
      }
      pressNote();
      pressAutoplay();
    } finally { busy = false; }
  }

  // --- "#tvep=N": start episode N on the season page TV Mode opened ---
  var note = 0, noteAt = 0, noteDone = false;
  var m0 = /[#&]tvep=(\d+)/.exec(location.hash);
  if (m0) { note = +m0[1]; noteAt = Date.now(); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ } }
  function pressNote() {
    if (!note || noteDone) return;
    if (Date.now() - noteAt > 30000) { noteDone = true; return; }
    var li = document.getElementById('av-ep-episode-' + (note - 1));
    var b = li && li.querySelector("[data-automation-id*='play'],button[aria-label*='Play'],a[aria-label*='Play']");
    if (b) { noteDone = true; b.click(); }
  }

  // --- "?autoplay=1" on a film's page: press its Play / Resume ---
  // 2026-11-04: Prime opened Madgaon Express at its page with Resume showing and did not
  // play. TV Mode opens a film this way when it has no play link, so the helper presses the
  // page's main play control once, within 30 s of the page loading, while no player shows.
  // (probe 2026-11-13: TV Mode opened a resume as /detail/<id>?ref_=atv_plr_detail_play with no autoplay flag, and the real
  // button is id="dp-atf-play-button" with class fbl-play-btn and no aria-label: it says "Resume" only as text)
  var auto = /[?&](autoplay=1|ref_=atv_plr_detail_play)(&|$)/.test(location.search) && location.pathname.indexOf('/detail/') >= 0;
  var autoAt = Date.now(), autoDone = false, autoSeen = false;
  function pressAutoplay() {
    if (!auto || autoDone) return;
    if (Date.now() - autoAt > 30000 || isPlayer()) {
      autoDone = true;
      if (window.TVProbe) window.TVProbe.event('autoplay:stop', { why: isPlayer() ? 'player' : 'timeout', isPlayer: isPlayer(), cov: Core.coverage() });
      return;
    }
    if (Date.now() - autoAt < 2500) return; // Prime may start it itself: give it a moment
    var el = playButton(true); // never "Go ad free" or a trailer button
    if (!autoSeen && Date.now() - autoAt > 4000 && window.TVProbe) { // once: what the page offers, and whether we took it for the player
      autoSeen = true;
      window.TVProbe.event('autoplay:seen', { playButton: el ? labelOf(el) : null, isPlayer: isPlayer(), cov: Core.coverage() });
    }
    if (el) {
      autoDone = true;
      var lab = labelOf(el);
      console.log('[tv-mode-helper] pressing', lab);
      el.click();
      if (Core.noteStart) Core.noteStart();
      if (window.TVProbe) window.TVProbe.event('autoplay:pressed', { pressed: lab, isPlayer: isPlayer(), cov: Core.coverage() });
      setTimeout(function () { if (window.TVProbe) window.TVProbe.event('autoplay:after', { isPlayer: isPlayer(), cov: Core.coverage() }); }, 3000);
    }
  }

  // --- the episode addresses a season page shows ---
  function showTitle() {
    var h = document.querySelector('[data-automation-id="title"]') || document.querySelector('h1');
    var t = h ? (h.textContent || '').trim() : '';
    if (!t) { var m = document.querySelector('meta[property="og:title"]'); t = m && m.content ? m.content : document.title.replace(/^Prime Video:\s*/i, ''); }
    return t.replace(/\s*[-:|,]?\s*Season\s*\d+.*$/i, '').trim();
  }
  function links() {
    var rows = document.querySelectorAll("li[id^='av-ep-episode-']");
    var sm = /Season\s*(\d+)/i.exec(document.title);
    var title = showTitle();
    if (!rows.length || !sm || !title) return null;
    var se = +sm[1], eps = [];
    [].slice.call(rows).forEach(function (li) {
      var k = +li.id.replace('av-ep-episode-', '') + 1;
      var a = [].slice.call(li.querySelectorAll('a[href]')).filter(function (a) { var h = a.getAttribute('href') || ''; return h.indexOf('auth-redirect') < 0 && /autoplay=1/i.test(h); })[0];
      var g = li.querySelector("[data-automation-id^='synopsis-amzn1.dv.gti.']");
      var u = a ? a.href : g ? location.origin + '/detail/' + g.getAttribute('data-automation-id').slice(9) + '/?autoplay=1' : '';
      if (u) eps.push([se, k, u]);
    });
    return { title: title, url: /\/detail\//.test(location.pathname) ? location.origin + location.pathname : '', eps: eps };
  }

  function skip() {
    return Core.pressFirst(SKIP_BUTTONS) || Core.pressByText(SKIP_WORDS);
  }

  Core.start({ svc: 'prime', isPlayer: isPlayer, ad: adPlaying, skip: skip, links: links, onTick: onTick });
  Core._prime = { playButton: playButton, pressAutoplay: pressAutoplay, isPlayer: isPlayer, adPlaying: adPlaying, links: links, skip: skip };
})();
