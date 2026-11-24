// Runs in the Netflix page itself (manifest "world": "MAIN") so it can reach Netflix's own
// player: writing video.currentTime makes Netflix stop with an error, its player's seek()
// does not. content.js asks by window message; this answers with ok or the error.
// It only acts on messages from this same page: seek, and the audio and subtitle tracks.
(function () {
  'use strict';
  function player() {
    var api = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
    var ids = api.getAllPlayerSessionIds();
    var p = api.getVideoPlayerBySessionId(ids[ids.length - 1]);
    if (!p) throw new Error('no player session');
    return p;
  }
  function label(t) {
    var n = t.displayName || t.language || t.bcp47 || String(t.trackId);
    if (/ASSISTIVE|CLOSEDCAPTION/i.test(String(t.trackType || t.rawTrackType || ''))) n += ' (CC)';
    return n;
  }
  // the phone's list: audio and subtitles, each {id, label, on}
  function tracks(p) {
    var a = p.getAudioTrack() || {}, s = p.getTimedTextTrack() || {};
    function list(all, cur, isSub) {
      var out = [], seen = {};
      (all || []).forEach(function (t) {
        if (!t || t.isImageBased || t.hidden) return;
        var l = isSub && (t.isNoneTrack || /^off$/i.test(t.displayName || '')) ? 'Off' : label(t);
        if (seen[l]) return;
        seen[l] = true;
        out.push({ id: String(t.trackId), label: l, on: t.trackId === cur.trackId });
      });
      return out;
    }
    return { audio: list(p.getAudioTrackList(), a, false), subs: list(p.getTimedTextTrackList(), s, true) };
  }
  // the player session and its track lists appear a moment after the page does: for a read of the
  // lists, wait up to ~3 s for them instead of failing the phone's Subtitles button
  async function ready(a) {
    for (var i = 0; ; i++) {
      try {
        var p = player();
        if (a !== 'tracks' && a !== 'settrack') return p;
        if ((p.getAudioTrackList() || []).length || (p.getTimedTextTrackList() || []).length) return p;
        if (i >= 10) return p;
      } catch (x) { if (i >= 10) throw x; }
      await new Promise(function (r) { setTimeout(r, 300); });
    }
  }
  window.addEventListener('message', async function (e) {
    var d = e.data;
    if (e.source !== window || !d || d.tvmode !== 'cmd') return;
    var res = { tvmode: 'res', id: d.id, a: d.a, ok: false, err: '' };
    try {
      var p = await ready(d.a);
      if (d.a === 'seekto') p.seek(Math.max(0, d.ms));
      else if (d.a === 'seekby') p.seek(Math.max(0, Math.min(p.getDuration() - 1000, p.getCurrentTime() + d.ms)));
      else if (d.a === 'tracks') res.tracks = tracks(p);
      else if (d.a === 'speed') { var v = document.querySelector('video'); if (!v) throw new Error('no video'); v.playbackRate = Math.max(0.5, Math.min(2, d.ms / 1000)); }
      else if (d.a === 'settrack') {
        var all = d.kind === 'audio' ? p.getAudioTrackList() : p.getTimedTextTrackList();
        var t = (all || []).filter(function (x) { return String(x.trackId) === String(d.id2); })[0];
        if (!t) throw new Error('no such track');
        if (d.kind === 'audio') p.setAudioTrack(t); else p.setTimedTextTrack(t);
        res.tracks = tracks(p);
      } else throw new Error('unknown ' + d.a);
      res.ok = true;
    } catch (x) {
      res.err = d.a + ': ' + String(x && x.message || x).slice(0, 120);
    }
    window.postMessage(res, location.origin);
  });
})();
