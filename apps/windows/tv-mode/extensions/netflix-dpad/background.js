// The only network use of this extension: relay the reports from the Netflix, Prime Video,
// JioHotstar and YouTube pages to TV Mode running on this PC (127.0.0.1 only, never any other
// host). An https page cannot POST to http://127.0.0.1 itself, so the content script asks this
// worker to. The service a report speaks for is taken from the address of the page that sent
// it, never from what the page says.
'use strict';

var ALLOWED = { hello: true, watch: true, link: true, tracks: true, probe: true };

// which service an https page belongs to ('' for none)
function svcOf(u) {
  var p;
  try { p = new URL(u); } catch (e) { return ''; }
  if (p.protocol !== 'https:') return '';
  var h = p.hostname;
  if (h === 'www.netflix.com') return 'netflix';
  if (h === 'primevideo.com' || /\.primevideo\.com$/.test(h)) return 'prime';
  if ((h === 'www.amazon.in' || h === 'www.amazon.com') && p.pathname.indexOf('/gp/video') === 0) return 'prime';
  if (h === 'hotstar.com' || /\.hotstar\.com$/.test(h) || h === 'jiohotstar.com' || /\.jiohotstar\.com$/.test(h)) return 'jiohotstar';
  if (h === 'www.youtube.com') return 'youtube';
  return '';
}

// an address with no query and no fragment; a YouTube watch address keeps only ?v=<id>
function cleanURL(u) {
  try {
    var p = new URL(u);
    if (p.hostname === 'www.youtube.com') {
      var v = p.searchParams.get('v');
      return v && /^[A-Za-z0-9_-]{11}$/.test(v) ? p.origin + '/watch?v=' + v : p.origin + p.pathname;
    }
    return p.origin + p.pathname;
  } catch (e) { return ''; }
}

chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
  try {
    if (sender.id !== chrome.runtime.id || !sender.url) return;
    var svc = svcOf(sender.url);
    if (!svc) return;
    if (!msg || msg.type !== 'ext' || !ALLOWED[msg.path]) return;
    var body = msg.body || {};
    body.svc = svc;
    if (svc === 'youtube') {
      // YouTube in Chrome is for desk reports only: hello and a passive watch report, nothing else
      if (msg.path !== 'hello' && msg.path !== 'watch') return;
      if (msg.path === 'watch') body.where = 'desk';
    }
    if (msg.path === 'probe' && svc !== 'prime' && svc !== 'jiohotstar') return; // the probe is for Prime's and JioHotstar's players only
    if (msg.path === 'watch' && body.where === 'desk') {
      // a desk report is passive: no player failure notes, no query strings or fragments anywhere
      body.where = 'desk';
      delete body.cmdErr;
      body.url = cleanURL(body.url || sender.url);
      if (body.w && typeof body.w === 'object') body.w.href = cleanURL(body.w.href || sender.url);
    }
    fetch('http://127.0.0.1:8770/api/ext/' + msg.path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
      cache: 'no-store'
    }).then(function (r) {
      // the watch reply carries player commands TV Mode queued (seek, play/pause, subtitles, skip)
      // for the TV's window; for a desk report it is {"cmds":[],"desk":bool} and the page ignores the commands
      return (msg.path === 'watch' || msg.path === 'hello') && r.ok ? r.json().catch(function () { return null; }) : null;
    }).then(function (j) {
      // 2.2: TV Mode says the files on disk are newer than this copy: load them (no Reload click)
      if (msg.path === 'hello') { if (j && j.reload === true) setTimeout(function () { chrome.runtime.reload(); }, 200); reply(null); return; }
      reply(j);
    })
      .catch(function () { reply(null); /* TV Mode is not running: nothing to do */ });
    return true; // reply comes after the fetch
  } catch (e) { /* ignore */ }
});
