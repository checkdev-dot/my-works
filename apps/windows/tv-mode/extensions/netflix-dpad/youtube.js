// TV Mode Helper on YouTube (2.1): DESK REPORTS ONLY. The TV's own YouTube runs in TV Mode's
// Edge, so on a Chrome page this never takes a command, never moves the player and never shows
// anything: it tells TV Mode what Dev is watching (title, video id, progress) so the library
// can list it ("at the desk, 20:14"). One report every 30 s while a video plays, one when it
// pauses or ends. Only /watch?v=<id> pages count (not the home page, a channel, Shorts or live).
(function () {
  'use strict';
  var D = window.TVDesk;
  if (!D || window.__tvhYT) return;
  window.__tvhYT = true;

  // the page's address, through one door so a mock can stand in for it
  function loc() { return window.__tvhLoc ? window.__tvhLoc : { pathname: location.pathname, search: location.search }; }
  function videoId() {
    var l = loc();
    if (l.pathname !== '/watch') return '';
    var m = /[?&]v=([A-Za-z0-9_-]{11})(?:&|$)/.exec(l.search || '');
    return m ? m[1] : '';
  }

  function mainVideo() {
    return document.querySelector('video.html5-main-video') || document.querySelector('#movie_player video') || document.querySelector('video');
  }

  function titleOf(id) {
    // YouTube is a single-page app: after a click the old title can linger. The watch page says
    // which video it shows (video-id on ytd-watch-flexy); until that matches, report nothing.
    var fx = document.querySelector('ytd-watch-flexy');
    var fid = fx && fx.getAttribute('video-id');
    if (fid && fid !== id) return '';
    var h = document.querySelector('ytd-watch-metadata h1') || document.querySelector('h1.ytd-watch-metadata') || document.querySelector('#title h1');
    var t = h ? (h.textContent || '').replace(/\s+/g, ' ').trim() : '';
    if (!t && !fid) { // no marker on the page at all: the tab title is the fallback
      t = (document.title || '').replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube\s*$/i, '').trim();
    }
    return t;
  }

  var stableId = '', stableAt = 0;
  function read() {
    var id = videoId();
    if (!id) { stableId = ''; return null; }
    var v = mainVideo();
    if (!v || !isFinite(v.duration) || !(v.duration > 0)) return null; // live streams and loading pages report nothing
    var t = titleOf(id);
    if (!t) return null;
    if (id !== stableId) { stableId = id; stableAt = Date.now(); }
    if (Date.now() - stableAt < (typeof window.__tvhStable === 'number' ? window.__tvhStable : 3000)) return null; // the id has not settled yet
    var mp = document.getElementById('movie_player');
    return {
      title: t, pos: Math.floor(v.currentTime), dur: Math.floor(v.duration), playing: !v.paused && !v.ended, ended: !!v.ended,
      ad: !!(mp && mp.classList.contains('ad-showing')), url: 'https://www.youtube.com/watch?v=' + id
    };
  }

  function send(path, body, cb) {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
      body.scr = { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight, dpr: window.devicePixelRatio || 1 };
      chrome.runtime.sendMessage({ type: 'ext', path: path, body: body }, function (j) { void chrome.runtime.lastError; if (cb) cb(j); });
    } catch (e) { /* the extension was reloaded: ignore */ }
  }

  var desk = D.make({ svc: 'youtube', always: true, send: send });
  setInterval(function () { desk.tick(read()); }, 1000);
  window.__tvhYoutube = { read: read, desk: desk }; // a hook for tests
})();
