// TV Mode Helper 2.1: the desk reporter, shared by Netflix, Prime Video, JioHotstar and YouTube.
//
// Two modes per page:
//   tv   (the default) the helper does what it always did: reports twice a second, takes the
//        phone's commands back in the reply.
//   desk the window is not on the TV monitor (TV Mode says so in its reply: {"desk":true}).
//        The helper then only tells TV Mode what Dev is watching, so the library can show it
//        ("at the desk, 20:14"): one report every 30 s while playing, one when it pauses or
//        ends. It never asks for commands and never runs one, never sends tracks or links.
//
// How a page knows it is at the desk: TV Mode decides, from the window position every report
// carries (scr). If the window moves (its position or size changes) the page goes back to a
// normal TV report once, and TV Mode answers again, so a window dragged onto the TV monitor
// gets its phone controls back at once.
//
// TVDesk.make({ svc, send(path, body, cb), always }) -> {
//   isDesk(), reply(j) -> bool, tick(snap|null)
// }
//   snap = { title, show?, season?, episode?, epTitle?, pos, dur, playing, ended?, ad?, url, w? }
//   reply(j): feed it every reply to a TV-style watch report; true means "desk: do not run j.cmds".
//   tick(snap): call it about once a second while isDesk(); snap is null when no player shows.
//   always: YouTube has no TV mode in Chrome: always desk, the server's answer is ignored.
(function () {
  'use strict';
  var D = {};
  window.TVDesk = D;

  function every() { return typeof window.__tvdeskEvery === 'number' ? window.__tvdeskEvery : 30000; }
  function now() { return typeof window.__tvdeskNow === 'function' ? window.__tvdeskNow() : Date.now(); }
  function scrKey() { return [Math.round(window.screenX), Math.round(window.screenY), Math.round(window.outerWidth), Math.round(window.outerHeight)].join(','); }

  // an address with no query and no fragment (a YouTube watch address keeps only ?v=<id>)
  D.cleanURL = function (u) {
    try {
      var p = new URL(u);
      if (/(^|\.)youtube\.com$/.test(p.hostname)) {
        var v = p.searchParams.get('v');
        return v && /^[A-Za-z0-9_-]{11}$/.test(v) ? p.protocol + '//' + p.host + '/watch?v=' + v : p.protocol + '//' + p.host + p.pathname;
      }
      return p.protocol + '//' + p.host + p.pathname;
    } catch (e) { return ''; }
  };

  D.make = function (cfg) {
    // lastAt: when the last PLAYING report went out (pause and resume do not reset it: at most one
    // playing report per interval, however often he pauses); a final report does not count
    var st = { desk: !!cfg.always, scr: scrKey(), lastAt: 0, key: '', playing: false, last: null };

    function body(snap, final) {
      var b = {
        where: 'desk', svc: cfg.svc, title: snap.title || '', pos: snap.pos | 0, dur: snap.dur | 0,
        playing: final ? false : !!snap.playing, ad: false, url: D.cleanURL(snap.url)
      };
      if (snap.show) b.show = snap.show;
      if (snap.season) b.season = snap.season;
      if (snap.episode) b.episode = snap.episode;
      if (snap.epTitle) b.epTitle = snap.epTitle;
      if (final) b.final = true;
      if (snap.w) {
        var w = {}, k;
        for (k in snap.w) if (Object.prototype.hasOwnProperty.call(snap.w, k)) w[k] = snap.w[k];
        w.href = D.cleanURL(w.href || snap.url);
        b.w = w;
      }
      return b;
    }

    function out(snap, final) {
      if (!final) st.lastAt = now();
      cfg.send('watch', body(snap, final), function (j) {
        // the answer to a desk report is {"cmds":[],"desk":bool}: any command in it is ignored.
        // desk:false means TV Mode now sees this window on the TV monitor.
        if (!cfg.always && j && j.desk === false) st.desk = false;
      });
    }

    var self = {
      isDesk: function () { return st.desk; },
      reply: function (j) {
        if (st.desk) return true;
        if (j && j.desk === true) { st.desk = true; st.scr = scrKey(); st.lastAt = 0; return true; }
        return false;
      },
      tick: function (snap) {
        if (!cfg.always && scrKey() !== st.scr) { // the window moved: let TV Mode judge it again
          st.desk = false; st.playing = false; return;
        }
        if (snap && snap.ad) return; // an ad is not what he watches
        if (!snap || !(snap.dur > 120)) {
          if (st.playing && st.last) { st.playing = false; out(st.last, true); } // the player went away
          return;
        }
        var key = snap.url, t = now();
        if (key !== st.key) { // another video: forget the old one (its last report already went)
          st.key = key; st.playing = false; st.lastAt = 0;
        }
        st.last = snap;
        var ended = !!snap.ended || (snap.dur > 0 && snap.pos >= snap.dur - 1);
        if (snap.playing && !ended) {
          if (t - st.lastAt >= every()) out(snap, false);
          st.playing = true;
        } else if (st.playing) { // paused or ended: one last report, with the position it stopped at
          st.playing = false;
          out(snap, true);
        }
      },
      // the page is going away: say where it stopped (a best effort; the browser may not deliver it)
      leave: function () { if (st.desk && st.playing && st.last) { st.playing = false; out(st.last, true); } }
    };
    window.addEventListener('pagehide', function () { try { self.leave(); } catch (e) { /* ignore */ } });
    return self;
  };
})();
