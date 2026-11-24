// TV Mode Helper on JioHotstar: the player's selectors for core.js, its skip-intro
// button, and the episode addresses a show page lists (the same reading TV Mode's Edge
// scout used: a link to /watch whose label says "S1 E2"). Written without a signed-in
// page to look at: the selectors are guesses with text fallbacks.
(function () {
  'use strict';
  var Core = window.TVHelperCore;
  if (!Core || !window.TVTracks) return;

  var SKIP_SELS = [
    '[data-testid*="skip" i]', 'button[aria-label*="skip" i]'
  ];
  var SKIP_WORDS = /^(skip( (intro|recap|ad|ads|credits))?|next episode)$/i;
  var AD_SELS = ['[data-testid*="ad-timer" i]', '[class*="ad-timer" i]', '[class*="AdTimer"]', '[data-testid*="adbadge" i]'];

  function visible(el) {
    if (!el || !el.isConnected) return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    var s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) !== 0;
  }

  function isPlayer() {
    // a home page plays trailers by itself: only a /watch address is the player
    return /\/watch(\/|$)/.test(location.pathname) && Core.coverage() >= 0.5;
  }

  function ad() {
    for (var i = 0; i < AD_SELS.length; i++) {
      var el = document.querySelector(AD_SELS[i]);
      if (visible(el)) return true;
    }
    // a short "Ad 1 of 2" / "Ad 0:15" label over the player
    var cand = document.querySelectorAll('span,div,p');
    for (var j = 0; j < cand.length; j++) {
      var e = cand[j];
      if (e.children.length) continue;
      var t = (e.textContent || '').trim();
      if (t.length > 3 && t.length < 24 && /^Ad(s)?\s*(\d+\s*(of|\/)\s*\d+|[·•:\-]\s*\d+[:\d]*\s*(s|sec)?)$/i.test(t) && visible(e)) return true;
    }
    return false;
  }

  function skip() {
    return Core.pressFirst(SKIP_SELS) || Core.pressByText(SKIP_WORDS);
  }

  function links() {
    if (/\/watch(\/|$)/.test(location.pathname)) return null;
    if (!/\/(shows|movies)\/[^/]+\/\d+\/?$/.test(location.pathname)) return null; // a title's own page
    var h = document.querySelector('h1');
    var title = h ? (h.textContent || '').trim() : '';
    if (!title) return null;
    var eps = [];
    [].slice.call(document.querySelectorAll("a[href*='/watch']")).forEach(function (a) {
      var l = (a.getAttribute('aria-label') || a.innerText || '').replace(/\s+/g, ' ');
      var m = /\bS(\d+) E(\d+)\b/.exec(l);
      if (m) eps.push([+m[1], +m[2], a.href.split('?')[0]]);
    });
    return { title: title, url: location.origin + location.pathname.replace(/\/$/, ''), eps: eps };
  }

  Core.start({ svc: 'jiohotstar', isPlayer: isPlayer, ad: ad, skip: skip, links: links });
  Core._hotstar = { isPlayer: isPlayer, ad: ad, links: links, skip: skip };
})();
