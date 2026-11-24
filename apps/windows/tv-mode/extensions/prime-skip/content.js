// TV Mode Prime Skip: clicks Prime Video's own skip buttons and fast-forwards
// unskippable ads. Local only: no network, cookies, storage or remote code.
(function () {
  'use strict';
  var host = location.hostname;
  if (host.indexOf('amazon.') !== -1 && location.pathname.indexOf('/gp/video') !== 0) return;
  if (window.__primeSkip) return;
  window.__primeSkip = true;
  document.documentElement.dataset.primeSkip = '1';

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

  function log() {
    var a = ['[prime-skip]'].concat([].slice.call(arguments));
    console.log.apply(console, a);
  }

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

  function clickSkips() {
    SKIP_BUTTONS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (b) {
        if (!visible(b) || b.dataset.primeSkipClicked) return;
        b.dataset.primeSkipClicked = '1';
        log('click', sel);
        setTimeout(function () { b.click(); }, 400);
        // Allow a later button with the same node to be clicked again.
        setTimeout(function () { delete b.dataset.primeSkipClicked; }, 3000);
      });
    });
  }

  function videos() { return document.querySelectorAll('video'); }

  function fastForward() {
    videos().forEach(function (v) {
      if (v.dataset.primeSkipActive !== '1') {
        v.dataset.primeSkipActive = '1';
        v.dataset.primeSkipMuted = v.muted ? '1' : '0';
        v.dataset.primeSkipRate = String(v.playbackRate === AD_RATE ? 1 : v.playbackRate);
        log('ad detected, muting and speeding up');
      }
      v.muted = true;
      if (v.playbackRate !== AD_RATE) v.playbackRate = AD_RATE;
      // Jump to the end of a short, fully known ad.
      if (isFinite(v.duration) && v.duration > 0 && v.duration < 180 &&
          v.currentTime < v.duration - 0.3) {
        try { v.currentTime = v.duration - 0.2; } catch (e) {}
      }
    });
  }

  function restore() {
    videos().forEach(function (v) {
      if (v.dataset.primeSkipActive === '1') {
        v.muted = v.dataset.primeSkipMuted === '1';
        v.playbackRate = parseFloat(v.dataset.primeSkipRate) || 1;
        delete v.dataset.primeSkipActive;
        delete v.dataset.primeSkipMuted;
        delete v.dataset.primeSkipRate;
        log('ad over, restored');
      } else if (v.playbackRate === AD_RATE) {
        v.playbackRate = 1;
      }
    });
  }

  var busy = false;
  function tick() {
    if (busy) return;
    busy = true;
    try {
      clickSkips();
      if (adPlaying()) fastForward(); else restore();
    } finally { busy = false; }
  }

  new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(tick, 500);
  log('active on', host);
})();
