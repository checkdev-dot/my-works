// "Go to this": TV Mode opens Netflix at its search with #tvgo={title, kind, se, ep, pos}
// and this script lands on the title (or the exact episode) and starts it, so Dev
// never has to use Netflix's own menus. Episode ids come from Netflix's own metadata
// (the same request its title pages make); whatever it finds it reports back to TV
// Mode, which keeps them so the next time opens the episode at once.
(function () {
  'use strict';
  var KEY = 'tvmode-go';

  function norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9\u0080-\uffff]/g, ''); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function send(path, body) {
    try { body.scr = { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight, dpr: window.devicePixelRatio || 1 }; chrome.runtime.sendMessage({ type: 'ext', path: path, body: body }, function () { void chrome.runtime.lastError; }); } catch (e) { /* reloaded */ }
  }

  function take() {
    var m = location.hash.match(/^#tvgo=(.+)$/);
    if (m) {
      try { sessionStorage.setItem(KEY, JSON.stringify(Object.assign(JSON.parse(decodeURIComponent(m[1])), { at: Date.now() }))); } catch (e) { /* bad note */ }
      history.replaceState(null, '', location.pathname + location.search);
    }
    var job = null;
    try { job = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { /* none */ }
    if (job && Date.now() - job.at > 240000) job = null; // a stale note must never hijack a later visit (the clock restarts while the profile picker waits)
    if (!job) sessionStorage.removeItem(KEY);
    return job;
  }
  function done() { sessionStorage.removeItem(KEY); }
  function save(job) { try { sessionStorage.setItem(KEY, JSON.stringify(job)); } catch (e) { /* none */ } }

  // Netflix's "Who's watching?" page (and its sign-in) sits in front of everything until a
  // profile is picked, and it drops the address we were sent to: the note lives in
  // sessionStorage, so wait here (a profile pick is a click on the TV) and carry on after it
  function onGate() { return /^\/(profilesgate|chooseprofile|switchprofile|login|signup)/i.test(location.pathname) || !!document.querySelector('.profile-gate-label,[data-uia="profile-gate-label"]'); }
  async function waitGate(job) {
    for (var end = Date.now() + 5 * 60000; onGate() && Date.now() < end; await sleep(700)) {
      if (location.pathname.indexOf('/watch') === 0) return;
      job.at = Date.now(); save(job); // the note does not age while the picker waits
    }
  }

  function play(id, job) {
    done();
    var t = job.t > 0 ? '?t=' + job.t : job.pos > 60 ? '?t=' + Math.max(0, Math.round(job.pos) - 3) : '';
    location.assign('/watch/' + id + t);
  }

  // the search result whose name starts with the title
  async function findId(job) {
    var w = norm(job.title), pre = '', preAt = 0, most = 0, cov = ''; // the exact name wins; a name that only starts with it (a spin-off) after 3 s; one holding every word of it, after 12 s
    var words = job.title.toLowerCase().split(/[^a-z0-9]+/).filter(function (x) { return x.length > 2 && ['the', 'and', 'of'].indexOf(x) < 0; });
    for (var end = Date.now() + 80000, t0 = Date.now(); Date.now() < end; await sleep(500)) {
      var links = document.querySelectorAll('a[href*="/watch/"],a[href*="/title/"]');
      var near = 0;
      for (var i = 0; i < links.length; i++) {
        var a = links[i], l = norm(a.getAttribute('aria-label') || a.textContent);
        var lw = (a.getAttribute('aria-label') || a.textContent || '').toLowerCase().split(/[^a-z0-9]+/);
        if (words.some(function (x) { return lw.indexOf(x) >= 0; })) near++;
        var m = (a.getAttribute('href') || '').match(/\/(?:watch|title)\/(\d+)/);
        if (m && l === w) return m[1];
        if (m && l && !pre && l.indexOf(w) === 0) { pre = m[1]; preAt = Date.now(); }
        if (m && !cov && words.length && words.every(function (x) { return lw.indexOf(x) >= 0; })) cov = m[1];
      }
      most = Math.max(most, near);
      if (pre && Date.now() - preAt > 3000) return pre;
      if (!pre && cov && Date.now() - t0 > 12000) return cov; // never leave him on the search page with the title in sight
    }
    // a miss only when results like it came (two names sharing a word) and none was it:
    // Netflix's own rows alone prove nothing
    findId.loaded = most >= 2 && location.pathname.indexOf('/search') >= 0;
    return pre || cov;
  }

  function buildId() {
    var s = document.scripts;
    for (var i = 0; i < s.length; i++) {
      var m = (s[i].textContent || '').match(/"BUILD_IDENTIFIER":"([^"]+)"/);
      if (m) return m[1];
    }
    return '';
  }

  // every episode id of a show, from the metadata Netflix's own title pages load
  async function episodes(showId) {
    for (var n = 0; n < 3; n++) { // the build id or the request can miss right after a load
      var out = await episodes1(showId);
      if (out.length) return out;
      await sleep(1200);
    }
    return [];
  }
  async function episodes1(showId) {
    var b = buildId();
    var urls = ['/nq/website/memberapi/' + b + '/metadata?movieid=' + showId, '/api/shakti/' + b + '/metadata?movieid=' + showId];
    for (var i = 0; b && i < urls.length; i++) {
      try {
        var r = await fetch(urls[i], { credentials: 'include' });
        if (!r.ok) continue;
        var j = await r.json(), out = [];
        ((j.video && j.video.seasons) || []).forEach(function (s) {
          (s.episodes || []).forEach(function (e) { out.push({ se: s.seq, ep: e.seq, id: String(e.id || e.episodeId) }); });
        });
        if (out.length) return out;
      } catch (e) { /* try the other */ }
    }
    return [];
  }

  async function run() {
    var job = take();
    if (!job || location.pathname.indexOf('/watch') === 0) { if (job) done(); return; }
    if (onGate()) { await waitGate(job); job = take(); if (!job || location.pathname.indexOf('/watch') === 0) { if (job) done(); return; } }
    var id = job.id;
    if (!id) {
      // not on the search page (after the profile picker Netflix lands on /browse): go there once
      if (location.pathname.indexOf('/search') < 0) {
        if (job.nav) { done(); return; }
        job.nav = 1; job.at = Date.now(); save(job);
        location.assign('/search?q=' + encodeURIComponent(job.title));
        return; // the new page runs this again with the note
      }
      id = await findId(job);
      // the result list can be slow or still empty: look once more on a fresh search before giving up
      if (!id && !findId.loaded && !job.again) {
        job.again = 1; job.at = Date.now(); save(job);
        location.reload();
        return;
      }
    }
    if (!id) { done(); if (findId.loaded) send('link', { title: job.title, none: true }); return; } // stays on the search; TV Mode tries his next app
    send('link', { title: job.title, se: 0, ep: 0, url: 'https://www.netflix.com/title/' + id });
    if (job.kind !== 'tv' || !job.se) { play(id, job); return; } // a film, or the show where Netflix left it
    var list = await episodes(id), hit = '';
    list.forEach(function (e) { if (e.se === job.se && e.ep === job.ep) hit = e.id; });
    send('link', { title: job.title, eps: list.map(function (e) { return [e.se, e.ep, 'https://www.netflix.com/watch/' + e.id]; }) });
    play(hit || id, hit ? job : { pos: 0 });
  }

  take(); // at document_start: keep the note before Netflix rewrites the address
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
