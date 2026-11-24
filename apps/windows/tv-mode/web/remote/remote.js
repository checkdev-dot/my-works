(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var app = $("app");
  var NAMES = { launcher: "Home", jiohotstar: "JioHotstar", prime: "Prime Video", netflix: "Netflix", youtube: "YouTube" };
  var MODE_NAMES = { remote: "Remote", pad: "Touchpad", type: "Type" };
  var TOKEN_KEY = "tvmode.token", ROOM_KEY = "tvmode.room";

  var q = new URLSearchParams(location.search);
  var pendingAct = q.get("act") || "";   // PWA shortcut, e.g. /remote/?act=playpause
  if (pendingAct) { try { var qq = new URLSearchParams(location.search); qq.delete("act"); history.replaceState(null, "", location.pathname + (qq.toString() ? "?" + qq : "")); } catch (e) {} }
  // Share to TV: the phone's share sheet opens /remote/?url=..&title=..&text=.. (manifest share_target).
  // The address is often inside text. Read once and strip at once, so a reload never shares it again.
  var pendingShare = null;
  (function () {
    var u = q.get("url") || "", t = q.get("text") || "", ti = q.get("title") || "";
    if (!u && !t && !ti) return;
    pendingShare = { url: u.slice(0, 2048), title: ti.slice(0, 300), text: t.slice(0, 1000) };
    try { var sq = new URLSearchParams(location.search); ["url", "text", "title"].forEach(function (k) { sq.delete(k); }); history.replaceState(null, "", location.pathname + (sq.toString() ? "?" + sq : "")); } catch (e) {}
  })();
  var demo = location.protocol === "file:" || q.has("demo");
  var S = null;               // last state
  var mode = "remote";
  var pointHeld = false;

  /* ---------- helpers ---------- */
  function vib(p) { try { if (navigator.vibrate) navigator.vibrate(p || 10); } catch (e) {} }
  function two(n) { return n < 10 ? "0" + n : String(n); }
  function clock(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? h + ":" + two(m) + ":" + two(s) : m + ":" + two(s);
  }
  document.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  /* ---------- what the phone remembers about the PC ----------
     lastOkAt: when the PC last answered ("Last heard from the PC at 23:41"). quitAt: when this
     phone turned TV Mode off, so the next "PC gone" says so instead of guessing. Neither is
     written in demo. */
  var LASTOK_KEY = "tvmode.lastOkAt", QUIT_KEY = "tvmode.quitAt", MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function lsNum(k) { try { return +localStorage.getItem(k) || 0; } catch (e) { return 0; } }
  function lsPut(k, v) { try { if (v) localStorage.setItem(k, String(v)); else localStorage.removeItem(k); } catch (e) {} }
  var lastOkAt = demo ? 0 : lsNum(LASTOK_KEY), quitAt = demo ? 0 : lsNum(QUIT_KEY), lastOkSaved = 0;
  function markHeard(at, force) {
    lastOkAt = at || Date.now();
    if (!demo && (force || lastOkAt - lastOkSaved > 60000)) { lastOkSaved = lastOkAt; lsPut(LASTOK_KEY, lastOkAt); }
  }
  function atText(ts) { // "at 23:41", "yesterday at 23:41", "on 9 Nov at 23:41"
    var d = new Date(ts), n = new Date(), t = two(d.getHours()) + ":" + two(d.getMinutes());
    if (d.toDateString() === n.toDateString()) return "at " + t;
    if (d.toDateString() === new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1).toDateString()) return "yesterday at " + t;
    return "on " + d.getDate() + " " + MONTHS[d.getMonth()] + " at " + t;
  }

  /* ---------- token ----------
     The QR is <origin>/remote/#t=<token>&p=<pcid>: the secret token and the
     PC's public relay room. Both are kept in localStorage and stripped from
     the URL. */
  var token = "", room = "", invite = "", inviteBad = false, fallbackTok = "";
  (function () {
    var m = /[#&]t=([^&]+)/.exec(location.hash), r = /[#&]p=([0-9a-f]{32})/.exec(location.hash), mi = /[#&]i=([0-9a-f]{32})/.exec(location.hash);
    var st = "", sr = "";
    try { st = localStorage.getItem(TOKEN_KEY) || ""; sr = localStorage.getItem(ROOM_KEY) || ""; } catch (e) {}
    function strip() { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} }
    if (m && r) {
      token = decodeURIComponent(m[1]);
      room = r[1];
      try { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(ROOM_KEY, room); } catch (e) {}
      strip();
    } else if (mi && r) {
      // a one-time invite: the page proves it with the code, and the PC answers with the real token.
      // A fresh invite always wins over a stored token. If the PC rejects it, the stored token
      // for the same PC is tried once. The #i= stays in the address until that token arrives, but
      // the PC burns the code at sign-in, so a reload after that does not work: ask for a new link.
      invite = mi[1];
      room = r[1];
      if (st && sr === r[1]) fallbackTok = st;
    } else {
      token = st; room = sr;
      if (mi) strip();   // an invite for a PC this phone already has
    }
    if (!room) { token = ""; invite = ""; }
  })();

  /* ---------- link: relay + WebRTC ----------
     The page is loaded from a public https origin (or this PC over plain
     LAN HTTP in dev). It opens a WebSocket to <origin>/relay/<pcid> where the
     PC is waiting, proves the token, and is live at once over the relay. Then
     it offers a WebRTC data channel; when that opens (usually a direct LAN
     path) frames move over it instead. See PROTOCOL.md. */
  var relay = null, pc = null, dc = null, dcOpen = false;
  var tries = 0, retryTimer = 0, pingTimer = 0, lastMsg = 0, noteTimer = 0;
  var authed = false, pcHere = null, badToken = false;
  var authMiss = 0, hiddenAt = 0, lastWake = 0;   // auth errors in a row; when the page was hidden; last wake-up
  var helloMiss = 0, offWhy = "", tryUntil = 0;   // hello timeouts in a row; why the PC left ("closed" | "quiet" | ""); Try again feedback
  var link = "connecting";
  var STUN = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

  function relayUrl() {
    return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/relay/" + room + "?role=phone";
  }
  function relayOpen() { return !!(relay && relay.readyState === 1); }
  function rawSend(o) {
    if (relayOpen()) { relay.send(JSON.stringify(o)); return true; }
    return false;
  }
  /* Presses carry an id and wait for the PC's ack. No ack in 400 ms on the
     data channel: write the channel off and resend once over the relay (the PC
     drops a repeated id). Still nothing: say so. Streams (aim, pad, scroll,
     ping) carry no id: a late replay of them would look like a jump. */
  var runId = Math.random().toString(36).slice(2, 7), seq = 0, pend = {};
  var NOACK = { aim: 1, ping: 1, pad: 1, scroll: 1 };
  var ACK_DC_MS = 800, ACK_RELAY_MS = 1500, NOTE_LOST = "That press didn't reach the PC.";

  function dcDead() {
    if (!dcOpen && !dc) return;
    dcOpen = false;
    app.setAttribute("data-path", path());
    clearTimeout(rtcTimer);
    rtcTimer = setTimeout(function () { if (authed) startRTC(); }, rtcDelay(5000));
  }

  function track(id, s, via) {
    var p = pend[id] = { s: s, via: via, resent: false, timer: 0 };
    function check() {
      if (!pend[id]) return;
      if (p.via === "dc" && !p.resent) {
        dcDead();
        p.resent = true;
        if (authed && relayOpen()) { p.via = "relay"; relay.send(s); p.timer = setTimeout(check, ACK_RELAY_MS); return; }
      } else if (p.via === "relay" && !p.resent) {
        p.resent = true;
        if (authed && relayOpen()) { relay.send(s); p.timer = setTimeout(check, ACK_RELAY_MS); return; }
      }
      delete pend[id];
      note(NOTE_LOST);
    }
    p.timer = setTimeout(check, via === "dc" ? ACK_DC_MS : ACK_RELAY_MS);
  }

  // returns "dc", "relay" or false (nothing could be sent)
  function send(o) {
    if (o.t === "key") {
      if (o.k === "up" || o.k === "down" || o.k === "left" || o.k === "right") lastDpad = Date.now();
      // OK on a text box on the TV is a request to type
      else if (o.k === "ok" && S && S.typing && mode === "remote") setTimeout(function () { autoType = true; setMode("type"); }, 0);
    }
    if (demo) { demoSend(o); return true; }
    var acked = !NOACK[o.t];
    if (acked) o.id = runId + "-" + (++seq);
    var s = JSON.stringify(o), via = false;
    if (dcOpen && dc) { try { dc.send(s); via = "dc"; } catch (e) { dcDead(); } }
    if (!via && authed && relayOpen()) { relay.send(s); via = "relay"; }
    if (!via) { if (acked) note(NOTE_LOST); return false; }
    if (acked) track(o.id, s, via);
    return via;
  }
  function path() { return dcOpen ? "direct" : authed && relayOpen() ? "relay" : "none"; }

  /* What is wrong, in words. b: the short banner under the header; t and body: the pad's
     off state; retry: whether Try again makes sense. Nothing here guesses at a fix that could
     do harm: it says what is known and what is not. */
  function diag(k) {
    var heard = lastOkAt ? "Last heard from the PC " + atText(lastOkAt) + "." : "";
    switch (k) {
      case "connecting": return { b: "Connecting to the PC.", kind: "", t: "Connecting", body: "Looking for TV Mode on the PC.", retry: true };
      case "reconnecting": return { b: "No link to the PC", kind: "lost", t: "Lost the PC", body: "Reconnecting. This can take a few seconds.", last: heard, retry: true };
      case "norelay": return { b: "No link to the PC", kind: "lost", t: "No connection", body: "Check this phone's internet or Wi-Fi.", last: heard, retry: true };
      case "stuck": return { b: "No link to the PC", kind: "lost", t: "TV Mode doesn't answer", body: "The PC answers but TV Mode doesn't. It may be stuck or starting up.", last: heard, retry: true };
      case "off":
        return { b: "No link to the PC", kind: "lost", t: "Can't reach TV Mode on the PC.",
          body: quitAt ? "TV Mode was turned off from this phone " + atText(quitAt) + "."
            : offWhy === "closed" ? "TV Mode was closed on the PC. Start it from the TV Mode shortcut on the PC."
            : offWhy === "quiet" ? "The PC went quiet (asleep or offline). If it's asleep, move the mouse or press a key on the PC."
            : "It may be asleep or off, or TV Mode is closed.", last: heard, retry: true };
      case "unpaired": return { b: "Not paired with this PC.", kind: "lost", t: "Not paired",
          body: inviteBad ? "That link was already used or has expired. On the phone that works, tap More, then Add a phone, for a new one." : "Ask the phone that works to tap More, then Add a phone. Or open 127.0.0.1:8770/api/pair.png on the PC.", retry: true };
    }
    return null;
  }

  // the pad's off state: the diagnosis and the way back, where the thumb already is
  function offPaint() {
    var d = link === "ok" ? null : diag(link);
    if (!d) return;
    var trying = Date.now() < tryUntil || link === "connecting";
    var calm = link === "connecting" || link === "reconnecting" || link === "unpaired";   // retrying by itself: Try again is quiet
    var sets = [{ t: $("gpOffT"), b: $("gpOffB"), l: $("gpOffL"), r: $("tryAgain") }];
    Array.prototype.forEach.call(document.querySelectorAll(".moff"), function (m) {
      sets.push({ t: m.querySelector(".gpoffT"), b: m.querySelector(".gpoffB"), l: m.querySelector(".gpoffL"), r: m.querySelector(".tryagain") });
    });
    sets.forEach(function (x) {
      x.t.textContent = d.t; x.b.textContent = d.body;
      x.l.textContent = d.last || ""; x.l.hidden = !d.last;
      x.r.hidden = !d.retry; x.r.disabled = trying;
      x.r.classList.toggle("calm", calm);
      x.r.textContent = trying ? "Trying\u2026" : "Try again";
    });
  }
  // Try again: a clean start. The relay socket is usually still open (it says "no PC"), so it is closed first.
  function retryNow() {
    vib(10);
    helloMiss = 0; badToken = false; authMiss = 0; pcHere = null;
    killRelay();
    tries = 0;
    tryUntil = Date.now() + 1500;
    setTimeout(offPaint, 1550);
    setLink("connecting");
    connect();
  }
  // Drop the current relay socket for good and redial. The old socket's handlers are
  // detached first, so its late close can never touch the new one. Every forced redial uses this.
  function killRelay() {
    var s = relay, was = authed;
    relay = null; authed = false;
    if (s) {
      clearTimeout(s.helloT); clearTimeout(s.dialT);
      s.onopen = s.onmessage = s.onclose = s.onerror = null;
      if (was) markHeard(lastMsg, true);
      tries = was ? 0 : tries + 1;
    }
    stopPing(); closeRTC();
    if (s) { try { s.close(); } catch (e) {} }
    setLink(failedLink());
    schedule();
  }
  Array.prototype.forEach.call(document.querySelectorAll(".tryagain"), function (b) {
    b.addEventListener("click", function () { if (demo) vib(10); else retryNow(); });
  });

  // while the link is down nothing on the main screen looks live
  var DEADS = "[data-act], #point, #power, #psBtn, #pad";
  function blankLive(off) {
    Array.prototype.forEach.call(document.querySelectorAll(DEADS), function (b) { if (off) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled"); });
    if (!off) scrubEl.setAttribute("aria-disabled", hasMedia() ? "false" : "true");
    else {
      $("tPos").textContent = "--:--"; $("tDur").textContent = "--:--"; $("volN").textContent = "--";
      paintScrub(0); scrubEl.setAttribute("aria-disabled", "true"); scrubEl.setAttribute("aria-valuenow", "0");
    }
  }

  function setBanner(text, kind, isNote) {
    var b = $("banner");
    if (!text) { b.hidden = true; b.removeAttribute("data-note"); return; }
    $("bannerText").textContent = text;
    b.setAttribute("data-kind", kind || "");
    if (isNote) b.setAttribute("data-note", "1"); else b.removeAttribute("data-note");
    b.hidden = false;
  }
  // a server note can be tapped away; the link banner is not a note and stays
  $("banner").addEventListener("click", function () {
    if (!noteTimer) return;
    clearTimeout(noteTimer); noteTimer = 0;
    setLink(link);
  });

  function setLink(k) {
    link = k;
    if (k !== "ok") moodSynced = false;
    app.setAttribute("data-link", k === "ok" ? "ok" : "off");
    app.setAttribute("data-path", path());
    blankLive(k !== "ok");
    if (k !== "ok") { $("playUse").setAttribute("href", "#i-play"); $("play").setAttribute("aria-label", "Play or pause"); }
    gpRender();
    offPaint();
    renderHead();
    joinPaint();
    helperPaint();
    if (noteTimer) return; // a server note is showing
    var b = diag(k);
    if (b) setBanner(b.b, b.kind);
    else if (S && S.screenOn === false) setBanner("Desk screen is off", "");
    else setBanner("");
  }

  // no token and nothing that works: a full-screen way in, with no dimmed remote behind it
  var joinEl = $("joinview");
  function joinPaint() {
    if (!joinEl) return;
    var on = link === "unpaired" && !token;
    $("joinWhy").hidden = !inviteBad;
    if (joinEl.hidden === !on) return;
    joinEl.hidden = !on;
    if (on) { try { $("joinRetry").focus({ preventScroll: true }); } catch (e) {} }
  }
  if (joinEl) $("joinRetry").addEventListener("click", function () { if (demo) vib(10); else location.reload(); }); // a reload re-reads a token another tab stored

  function failedLink() {
    if (!(token || invite) || badToken) return "unpaired";
    if (pcHere === false) return "off";
    if (pcHere && helloMiss >= 3) return "stuck";   // the relay has a PC socket but TV Mode never says hello
    if (tries >= 4) return "norelay";
    return "reconnecting";
  }

  var lastRtt = 0, lastRttPath = "", rtts = [], lastPongTs = 0, lastHover = 0;
  function onFrame(m, viaDc) {
    lastMsg = Date.now();
    if (m.t === "ack") {
      if (viaDc && window.tvlink && window.tvlink.dropAcks) return; // test hook: lose acks that come over the channel
      var p = pend[m.id];
      if (p) { clearTimeout(p.timer); delete pend[m.id]; }
      return;
    }
    if (m.t === "pong") {
      if (m.ts) {
        lastPongTs = m.ts;
        lastRtt = Math.max(1, Date.now() - m.ts);
        lastRttPath = pingPath;
        rtts.push(lastRtt);
        if (rtts.length > 40) rtts.shift();
        showDebug();
      }
      return;
    }
    if (m.t === "hover") {
      var now = Date.now();
      if (now - lastHover >= 120) { lastHover = now; vib(8); }
      return;
    }
    if (m.t === "standby") {
      var scd = typeof m.countdown === "number" ? m.countdown : null;   // a shutdown countdown that began on the Start TV screen
      showStandby(true);
      showCountdown(scd);
      if (scd == null) autoStartOnOpen(true); else autoArmed = false;
      shipShare();
      return;
    }
    if (m.t === "saved") { gotSaved(m); return; }
    if (m.t === "pairtv") { addTvAnswer(m.ok); return; }
    if (m.t === "invite") { gotInvite(m); return; }
    if (m.t === "token" && m.k) {   // the invite bought the real token: keep it exactly as #t= does, drop the #i=
      token = String(m.k); invite = ""; inviteBad = false;
      try { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(ROOM_KEY, room); } catch (e) {}
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      return;
    }
    if (m.t === "mood") { moodSet(m.m); return; }
    if (m.t === "state") { markHeard(); autoStartOnOpen(false); applyState(m); }
    else if (m.t === "calib" && m.ok) note("Pointer calibrated.", "");
    else if (m.t === "tracks") { if (ps.hidden && Date.now() - psReqAt < 10000) psOpen("subs", true); psTracks(m); }
    else if (m.t === "eps") psEps(m);
    else if (m.t === "tick") vib(m.n > 1 ? [6, 30, 6] : 8); // Point stepped focus on the TV home screen
    else if (m.t === "error" && m.msg) {
      if (!authed && invite && !token) {
        if (fallbackTok) { token = fallbackTok; fallbackTok = ""; invite = ""; authMiss = 0; try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} killRelay(); return; }   // this phone is already paired: use what it has, once
        badToken = true; inviteBad = true; setLink("unpaired"); return;
      }
      if (!authed) {
        // one mismatch can be a stale nonce: redial for a fresh one; only two in a row mean unpaired
        if (++authMiss >= 2) { badToken = true; setLink("unpaired"); }
        else killRelay();
      } else {
        if (/TV Mode Helper is off/i.test(m.msg)) helperSet(S ? S.app : "");
        psPendClear(true);   // a pick the PC refused: the tick goes back
        note(m.msg);
      }
    }
  }

  var remoteSet = false, pendIce = [];   // ICE candidates wait here until the answer is applied
  function closeRTC() {
    dcOpen = false; remoteSet = false; pendIce = [];
    if (dc) { try { dc.close(); } catch (e) {} dc = null; }
    if (pc) { try { pc.close(); } catch (e) {} pc = null; }
    app.setAttribute("data-path", path());
  }

  var rtcTries = 0, rtcTimer = 0, rtcPauseUntil = 0;
  // retry delay for a failed direct link; the 3rd failure in a row pauses for 5 min
  function rtcDelay(base) {
    if (++rtcTries >= 3) { rtcTries = 0; rtcPauseUntil = Date.now() + 300000; return 300000; }
    return Math.min(60000, base * Math.pow(2, rtcTries - 1));
  }
  function startRTC() {
    if (Date.now() < rtcPauseUntil) return;   // paused: the timer set at the 3rd failure restarts it
    clearTimeout(rtcTimer);
    closeRTC();
    if (typeof RTCPeerConnection === "undefined") return;
    var p;
    try { p = new RTCPeerConnection({ iceServers: STUN }); } catch (e) { return; }
    pc = p;
    var d = p.createDataChannel("tv", { ordered: true });
    dc = d;
    d.onopen = function () { if (dc !== d) return; dcOpen = true; app.setAttribute("data-path", path()); };
    d.onclose = function () { if (dc === d) { dcOpen = false; app.setAttribute("data-path", path()); } };
    d.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } onFrame(m, true); };
    p.onicecandidate = function (ev) { if (ev.candidate && pc === p) rawSend({ t: "ice", c: ev.candidate.toJSON() }); };
    p.onconnectionstatechange = function () {
      if (pc !== p) return;
      var st = p.connectionState;
      // "disconnected" can last ~25 s before "failed": use the relay meanwhile, not a dead channel
      if (st === "disconnected" || st === "failed" || st === "closed") dcOpen = false;
      else if (st === "connected" && d.readyState === "open") { dcOpen = true; rtcTries = 0; }
      app.setAttribute("data-path", path());
      // a drop that has not healed in 6 s: rebuild the direct link instead of waiting ~40 s on the slow relay
      // (2.5 s tore down links that were about to recover by themselves)
      if (st === "disconnected") {
        clearTimeout(rtcTimer);
        rtcTimer = setTimeout(function () { if (pc === p && authed && p.connectionState !== "connected") startRTC(); }, 6000);
      }
      if (st === "failed") {
        clearTimeout(rtcTimer);
        rtcTimer = setTimeout(function () { if (pc === p && authed) startRTC(); }, rtcDelay(3000));
      }
    };
    p.createOffer().then(function (o) { return p.setLocalDescription(o); }).then(function () {
      if (pc === p) rawSend({ t: "offer", sdp: p.localDescription.sdp });
    }).catch(function () {});
  }

  function connect() {
    clearTimeout(retryTimer);
    if (demo) return;
    if (!(token || invite) || badToken) { setLink("unpaired"); return; }
    if (relay && (relay.readyState === 0 || relay.readyState === 1)) return;
    var s;
    try { s = new WebSocket(relayUrl()); } catch (e) { tries++; setLink(failedLink()); schedule(); return; }
    relay = s;
    authed = false;
    // the watchdog runs from the first moment, not only once signed in: a socket that opened
    // while the PC was away sat "off" forever if the network dropped it silently (2026-11-11)
    // a dial that never opens (half-dead network) is killed after 8 s and redialed
    s.dialT = setTimeout(function () { if (relay === s && s.readyState === 0) killRelay(); }, 8000);
    s.onopen = function () { clearTimeout(s.dialT); tries = 0; lastMsg = Date.now(); startPing(); };
    s.onmessage = function (ev) {
      lastMsg = Date.now(); // raw "pong" from the relay counts too
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      switch (m.t) {
        case "nopc":
          pcHere = false; authed = false; helloMiss = 0;
          if (m.why === "closed" || m.why === "quiet") offWhy = m.why;   // older relays send no why: keep what we knew
          showStandby(false); closeRTC(); setLink("off"); return;
        case "pc": pcHere = true; offWhy = ""; if (link !== "ok" && link !== "stuck") setLink("connecting");
          // the TV says hello within a second; if it does not (a restart can leave the
          // relay pointing at a dead TV socket, 2026-11-04), drop and dial again
          clearTimeout(s.helloT);
          s.helloT = setTimeout(function () { if (relay === s && !authed) { helloMiss++; killRelay(); } }, 6000);
          return;
        case "hello": clearTimeout(s.helloT); helloMiss = 0; rawSend({ t: "auth", h: window.sha256((token || invite) + ":" + m.n) }); return;
        case "ok": authed = true; badToken = false; authMiss = 0; helloMiss = 0; offWhy = ""; quitAt = 0; lsPut(QUIT_KEY, 0); markHeard(0, true); setLink("ok"); startPing(); startRTC(); return;
        case "answer":
          if (pc) {
            var ap = pc;
            ap.setRemoteDescription({ type: "answer", sdp: m.sdp }).then(function () {
              if (pc !== ap) return;
              remoteSet = true;
              var q2 = pendIce; pendIce = [];
              q2.forEach(function (c) { ap.addIceCandidate(c).catch(function () {}); });
            }).catch(function () {});
          }
          return;
        case "ice":
          if (pc && m.c) {
            if (remoteSet) pc.addIceCandidate(m.c).catch(function () {});
            else pendIce.push(m.c);
          }
          return;
      }
      onFrame(m);
    };
    s.onclose = function () {
      clearTimeout(s.dialT); clearTimeout(s.helloT);
      if (relay && relay !== s) return; // an old socket closing late: the new one carries on
      relay = null;
      var was = authed;
      if (was) markHeard(lastMsg, true);
      authed = false;
      stopPing();
      closeRTC();
      tries = was ? 0 : tries + 1;
      setLink(failedLink());
      schedule();
    };
    s.onerror = function () { try { s.close(); } catch (e) {} };
  }

  function schedule() {
    clearTimeout(retryTimer);
    if (document.hidden || badToken) return; // visibilitychange reconnects
    retryTimer = setTimeout(connect, Math.min(4000, 400 * Math.pow(1.6, tries)));
  }

  // how long a note stays: 6 s, or a second for every 3 words when it is longer
  function noteMs(msg) { return Math.max(6000, Math.ceil(String(msg).split(/\s+/).length / 3) * 1000); }
  // an open sheet sits above the banner, so the note goes in the sheet's own line instead
  var sheetNoteT = 0;
  function openWrap() { return ps && !ps.hidden ? ps : sheet && !sheet.hidden ? sheet : drawer && !drawer.hidden ? drawer : null; }
  function sheetMsgEl(w) {
    var s = w.querySelector(".sheet"), e = s.querySelector(".sheetmsg");
    if (!e) {
      e = document.createElement("p"); e.className = "psnote sheetmsg"; e.hidden = true; e.setAttribute("role", "status");
      var t = s.querySelector(".sheettitle");
      s.insertBefore(e, t ? t.nextSibling : s.firstChild);
    }
    return e;
  }
  function sheetSayClear() {
    clearTimeout(sheetNoteT);
    Array.prototype.forEach.call(document.querySelectorAll(".sheetmsg"), function (e) { e.hidden = true; });
  }
  function note(msg, kind) {
    var w = openWrap();
    if (w) {
      var e = sheetMsgEl(w);
      e.textContent = msg; e.hidden = false;
      clearTimeout(sheetNoteT);
      sheetNoteT = setTimeout(function () { e.hidden = true; }, noteMs(msg));
      return;
    }
    setBanner(msg, kind == null ? "lost" : kind, true);
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { noteTimer = 0; setLink(link); }, noteMs(msg));
  }

  // A ping every 4 s keeps the data channel from looking idle, times the
  // round trip, and finds a dead channel: a direct ping with no pong in 1.5 s
  // writes the channel off.
  var pingPath = "", pongMiss = 0;
  function pingNow() {
    var ts = Date.now();
    var via = send({ t: "ping", ts: ts, rtt: lastRtt, path: lastRttPath });
    pingPath = via === "dc" ? "direct" : "relay";
    lastRtt = 0;
    // two late pongs in a row (3 s each) before the direct channel is written off:
    // one slow Wi-Fi moment must not drop to the slow relay for a minute
    if (via === "dc") setTimeout(function () { if (lastPongTs >= ts) { pongMiss = 0; return; } if (++pongMiss >= 2) { pongMiss = 0; dcDead(); } }, 3000);
  }
  function startPing() {
    stopPing();
    pingTimer = setInterval(function () {
      if (document.hidden) return;
      // 3 missed pongs: a dead link, redial now
      if (Date.now() - lastMsg > 12000) { killRelay(); return; }
      if (!authed) { try { relayOpen() && relay.send("ping"); } catch (e) {} return; } // the relay itself answers "pong"
      pingNow();
    }, 4000);
  }
  var dbg = $("dbg");
  function showDebug() {
    if (!dbg || !q.has("debug")) return;
    var a = rtts.slice().sort(function (x, y) { return x - y; });
    dbg.hidden = false;
    dbg.textContent = path() + "  rtt " + (a.length ? a[Math.floor(a.length / 2)] : 0) + " ms p50, " + (a.length ? a[Math.floor((a.length - 1) * 0.95)] : 0) + " p95, last " + (rtts[rtts.length - 1] || 0);
  }
  function stopPing() { clearInterval(pingTimer); pingTimer = 0; }

''  // the phone woke up (visible, page restored, window focused): check the link at once
  function wake() {
    if (demo || document.hidden) return;
    var now = Date.now();
    if (now - lastWake < 1000) return;   // visible + focus fire together
    lastWake = now;
    if (relay && relay.readyState === 0) killRelay(); // a dial stuck while asleep: start over
    if (relayOpen()) {
      if (authed) pingNow(); else { try { relay.send("ping"); } catch (e) {} }
      var at = Date.now(), cur = relay;
      setTimeout(function () { if (relay === cur && lastMsg < at) killRelay(); }, 3000);
    } else {
      tries = 0;
      badToken = false; authMiss = 0;
      connect();
    }
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      hiddenAt = Date.now();
      releasePoint("hidden");
      return;
    }
    // hidden for over 30 min: the page itself may be stale, start clean (never mid-press)
    if (!demo && hiddenAt && Date.now() - hiddenAt > 1800000 && !pointHeld) { location.reload(); return; }
    hiddenAt = 0;
    wake();
  });
  window.addEventListener("pageshow", function (e) { if (e.persisted) wake(); });
  window.addEventListener("focus", wake);
  // unpaired is not a dead end: try again every 30 s while the page is visible
  setInterval(function () {
    if (demo || document.hidden || !badToken || !token) return;
    badToken = false; authMiss = 1;   // one more mismatch puts it straight back to unpaired
    connect();
  }, 30000);
  window.addEventListener("online", function () { if (!demo && !relayOpen()) { tries = 0; connect(); } });
  window.addEventListener("pagehide", function () { releasePoint("hidden"); });

  // for tests and the console: window.tvlink.path() is "direct", "relay" or "none"
  window.tvlink = { breakDc: function () { if (dc) dc.send = function () {}; }, dropAcks: false, pending: function () { return Object.keys(pend).length; }, rtts: function () { return rtts.slice(); }, ping: function () { pingNow(); }, path: path, send: send, link: function () { return link; }, last: function () { return lastMsg; } };

  /* ---------- state ---------- */
  var scrubEl = $("scrub"), scrubFill = $("scrubFill"), scrubDrag = -1;
  function paintScrub(frac) {
    scrubFill.style.width = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + "%";
  }

  var downFill = $("downFill");

  var sleepPick = 0, sleepBtn30 = document.querySelector('.sleep [data-act="sleep:30"]'), sleepBtn60 = document.querySelector('.sleep [data-act="sleep:60"]');
  function sleepText() {
    if (!S || !S.sleepAt) return "";
    var m = Math.max(1, Math.ceil((S.sleepAt - Date.now()) / 60000));
    return "Sleep " + m + " min";
  }

  function renderHead() {
    var nm = S ? (NAMES[S.app] || "TV Mode") : "TV Mode", w = $("where");
    $("whereTxt").textContent = link === "unpaired" ? "Not paired" : link === "ok" || !S ? nm : "Last: " + nm;   // "Last:" only when something was heard
    // on the TV's home the name opens the drawer at the services, one tap from an app
    var wb = $("whereBtn"), svcLive = link === "ok" && !!S && S.app === "launcher";
    wb.disabled = !svcLive;
    wb.setAttribute("aria-label", svcLive ? "Home. Open the services" : nm);
    w.classList.toggle("muted", link !== "ok");
    var pm = pointHeld || (S && S.point);
    $("modeName").textContent = pm ? "Point mode" : ""; $("modeName").hidden = !pm;
    var t = sleepText(), tag = $("sleepTag");
    $("sleepVal").textContent = t ? t.replace(/^Sleep /, "") : "Off";
    tag.hidden = !t || link !== "ok";
    tag.textContent = t;
    if (!t) sleepPick = 0;
    var pick = !t ? 0 : sleepPick || (Math.ceil((S.sleepAt - Date.now()) / 60000) <= 30 ? 30 : 60);
    // the tag is a button: 30 -> 60 -> off
    var nx = pick === 30 ? 60 : 0;
    tag.setAttribute("data-act", "sleep:" + nx);
    tag.setAttribute("aria-label", t ? t + " left. Tap to " + (nx ? "make it " + nx + " minutes" : "turn it off") : "Sleep timer");
    sleepBtn30.classList.toggle("set", pick === 30);
    sleepBtn60.classList.toggle("set", pick === 60);
  }

  var wasDown = false;
  // a text box got focus on the TV: open Type (tapping the box brings up the keyboard);
  // when the box loses focus, go back only if it was this that opened Type
  var autoType = false, wasTyping = false, lastDpad = 0;
  function syncTyping(on) {
    if (on === wasTyping) return;
    wasTyping = on;
    // arrowing past a search box is moving, not typing: only a box the page focused by itself opens Type
    if (on && mode === "remote" && Date.now() - lastDpad > 1000) { autoType = true; setMode("type"); vib(10); }
    else if (!on && autoType && mode === "type") { autoType = false; setMode("remote"); }
  }

  // Play / pause. On Prime and JioHotstar the page takes the wanted state ("play" or "pause", from the last
  // reported state), so a press that is sent twice, or arrives late, cannot undo itself; Netflix and old
  // PCs get the toggle.
  function playMsg() {
    var a = "playpause";
    if (S && (S.app === "prime" || S.app === "jiohotstar") && S.media) a = S.media.playing ? "pause" : "play";
    return { t: "media", a: a };
  }
  var psTracksAt = 0; // when a subtitles frame (a list or a note) last arrived: the sheet stays open for it
  var menuNote = "", menuNoteAt = 0;   // what the PC said about the menu now open on the TV, shown beside Close the menu
  function menuNotePaint() {
    var e = $("menuNote"); if (!e) return;
    var t = S && S.menu ? (S.note || (Date.now() - menuNoteAt < 120000 ? menuNote : "")) : "";
    e.textContent = t; e.hidden = !t;
  }
  /* The helper is off for a service: the PC says so once (an error frame; a state field "helper":false works too).
     The phone keeps a quiet line under the time bar until the helper is back (media with a length arrives, or the
     service changes). Dimmed controls then ignore taps and the line pulses once, instead of looking live. */
  var helperOff = "";
  function helperOffNow() { return !!helperOff && !!S && S.app === helperOff && link === "ok"; }
  function helperSet(app) { helperOff = app || ""; helperPaint(); }
  function helperPaint() {
    var l = $("helperLine"); if (!l) return;
    var on = helperOffNow();
    if (on) l.textContent = (NAMES[helperOff] || "This service") + " controls are limited. The helper is off on the PC.";
    l.hidden = !on;
  }
  function helperPulse() {
    var l = $("helperLine"); if (!l || l.hidden) return;
    l.classList.remove("pulse"); void l.offsetWidth; l.classList.add("pulse");
  }

  function applyState(m) {
    var wasMenu = !!(S && S.menu);
    S = m;
    var mc = $("menuClose"); if (mc) mc.hidden = !m.menu;
    if (wasMenu && !m.menu) { menuNote = ""; menuNoteAt = 0; }
    menuNotePaint();
    if (m.helper === false) helperOff = m.app; else if (helperOff && (m.helper === true || m.app !== helperOff || (m.media && m.media.dur > 0))) helperOff = "";
    helperPaint();
    if (m.menu && typeof psClose === "function" && Date.now() - psTracksAt > 20000) psClose(); // the TV's own menu is open: the pad is the cursor for it
    syncTyping(!!m.typing);
    showStandby(false);
    renderHead();
    renderScreen();
    gpRender();
    if (pendingAct && !demo) { var pa = pendingAct; pendingAct = ""; if (pa === "playpause") send(playMsg()); }
    shipShare();
    moodSync();
    var md = m.media;
    var playing = !!(md && md.playing);
    $("playUse").setAttribute("href", playing ? "#i-pause" : "#i-play");
    $("play").setAttribute("aria-label", playing ? "Pause" : m.app === "launcher" ? "Play the picked title" : "Play");
    $("psSkip").hidden = !md;
    $("psPlayUse").setAttribute("href", playing ? "#i-pause" : "#i-play");
    $("psPlayT").textContent = playing ? "Pause" : "Play";
    $("psPlay").setAttribute("aria-label", playing ? "Pause" : "Play");
    if (md && typeof md.rate === "number") {   // the PC reports the speed: that is the tick
      if (psPend && psPend.rate != null) { if (Math.abs(md.rate - psPend.rate) < 0.01) { var sp = psPend; psPendClear(false); sp.confirm(); } }
      else psTick(md.rate);
    }
    $("dwSkip").hidden = !md;
    // nothing playing: Player, Full and the 10 s jumps answer nothing, so they look it
    document.querySelectorAll('#psBtn,[data-act="media:fullscreen"],[data-act^="media:seek"]').forEach(function (b) {
      var seek = (b.getAttribute("data-act") || "").indexOf("media:seek") === 0, dead = !md || (seek && md.ad);   // an ad has no seeking
      b.classList.toggle("idle", dead);
      if (!dead) b.removeAttribute("aria-disabled"); else b.setAttribute("aria-disabled", "true");
    });
    var epsTab = ps && ps.querySelector('[data-ps="eps"]');   // no episode list to build: no Episodes tab
    if (epsTab) { epsTab.hidden = m.eps === false; ps.querySelector(".pstabs").style.gridTemplateColumns = m.eps === false ? "repeat(2,1fr)" : ""; }
    if (ps && m.eps === false && psTab === "eps" && !ps.hidden) psShowTab("subs");
    var has = !!(md && md.dur > 0);
    var onAd = !!(md && md.ad);   // an ad is on the TV: the PC says so; the time and the scrub are not the show's
    scrubEl.setAttribute("aria-disabled", has && !onAd ? "false" : "true");
    scrubEl.style.opacity = onAd ? "0.4" : "";
    if (scrubDrag < 0) {
      paintScrub(has ? md.pos / md.dur : 0);
      $("tPos").textContent = onAd ? "Ad" : md ? clock(md.pos) : "--:--";
      $("tDur").textContent = onAd ? "" : has ? clock(md.dur) : "--:--";   // an ad hides the show's length
      scrubEl.setAttribute("aria-valuenow", has ? String(Math.round(md.pos / md.dur * 100)) : "0");
    }
    $("volN").textContent = m.muted ? "Off" : String(typeof m.vol === "number" ? m.vol : "--");
    $("mute").setAttribute("aria-label", m.muted ? "Unmute" : "Mute");
    $("muteUse").setAttribute("href", m.muted ? "#i-mute" : "#i-spk");
    $("point").classList.toggle("held", pointHeld || !!m.point);
    Array.prototype.forEach.call(document.querySelectorAll(".svc .b[data-app]"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-app") === m.app ? "true" : "false");
    });

    showCountdown(typeof m.countdown === "number" ? m.countdown : null);
  }

  // the shutdown countdown view: from a state frame, or (Start TV screen) a standby frame
  function showCountdown(cd) {
    var dv = $("downview");
    if (cd != null) {
      $("downN").textContent = String(cd);
      downFill.style.width = Math.max(0, Math.min(10, cd)) * 10 + "%";
      if (dv.hidden) { dv.hidden = false; vib([20, 60, 20]); $("cancel").focus({ preventScroll: true }); }
    } else if (!dv.hidden) {
      dv.hidden = true;
    }
    wasDown = cd != null;
  }

  setInterval(function () { if (!document.hidden && S) renderHead(); }, 15000);

  /* ---------- buttons ---------- */
  var typeIn = $("typeIn");
  var typePrev = "";

  var HAP = { "key:up": 15, "key:down": 15, "key:left": 15, "key:right": 15, "key:back": [10, 50, 10], "key:home": [30, 50, 30], "key:ok": 25, "media:playpause": 25 };
  var armTimer = 0, armIdx = -1;
  function disarm() {
    clearTimeout(armTimer); armTimer = 0; armIdx = -1;
    var a = $("svcArm"); if (a) a.hidden = true;
  }
  // while something is playing, switching service needs a second tap ("Open Prime Video?", 3 s, like Exit)
  function openNeedsConfirm(b) {
    return !b.classList.contains("svcarm") && S && S.media && S.media.playing && b.getAttribute("data-app") !== S.app;
  }
  function fire(b) {
    var act = b.getAttribute("data-act");
    if (act.indexOf("media:seek") === 0 && S && S.media && S.media.ad) { vib(5); note("Ad playing. Seeking comes back after it", ""); return; }   // the PC refuses it too
    if (b.classList.contains("idle") && helperOffNow()) { helperPulse(); vib(5); return; }   // dimmed and the helper is off: say why, send nothing
    var p = act.split(":");
    var msg = null;
    if (p[0] === "open") {
      if (openNeedsConfirm(b)) {
        var a = $("svcArm");
        clearTimeout(armTimer);
        armIdx = +p[1];
        a.setAttribute("data-act", "open:" + armIdx);
        a.textContent = "Open " + (b.getAttribute("data-name") || "this") + "?";
        a.hidden = false;
        vib(10);
        armTimer = setTimeout(disarm, 3000);
        return;
      }
      if (b.classList.contains("svcarm")) disarm();
    }
    switch (p[0]) {
      case "key": msg = { t: "key", k: p[1] }; break;
      case "media": msg = p[1] === "seek" ? { t: "media", a: "seek", s: +p[2] } : p[1] === "playpause" ? playMsg() : { t: "media", a: p[1] }; break;
      case "vol": msg = { t: "vol", a: p[1] }; break;
      case "tap": msg = { t: "tap", b: p[1] }; break;
      case "open": msg = { t: "open", i: +p[1] }; break;
      case "scroll": msg = { t: "scroll", dy: +p[1] }; break;
      case "recenter": msg = { t: "recenter" }; break;
      case "sleep": sleepPick = +p[1]; msg = { t: "sleep", min: sleepPick }; break;
      case "textkey":
        msg = { t: "textkey", k: p[1] };
        if (p[1] === "backspace") { typeIn.value = typeIn.value.slice(0, -1); typePrev = typeIn.value; }
        else { typeIn.value = ""; typePrev = ""; }
        break;
    }
    vib(HAP[act] != null ? HAP[act] : 10);
    if (msg) send(msg);
  }

  var repDelay = 0, repTimer = 0;
  function stopRep() { clearTimeout(repDelay); clearInterval(repTimer); repDelay = repTimer = 0; }

  /* Press behaviour. Arrows, OK, Play, seek, volume and scroll fire on touch-down.
     Back, Home, services and Sleep (data-fire="up") fire on release: the finger must still
     be over the same button, have moved under 10 px and have held at least 40 ms;
     sliding off cancels. */
  function overEl(b, e) {
    var r = b.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-act]"), function (b) {
    var onUp = b.getAttribute("data-fire") === "up", st = null;
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });
    b.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (x) {}
      b.classList.add("p");
      b._pd = Date.now();
      if (onUp) { st = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp || performance.now(), ok: true }; return; }
      fire(b);
      if (b.getAttribute("data-rep")) {
        stopRep();
        repDelay = setTimeout(function () { repTimer = setInterval(function () { fire(b); }, 110); }, 380);
      }
    });
    if (onUp) {
      b.addEventListener("pointermove", function (e) {
        if (!st || e.pointerId !== st.id || !st.ok) return;
        if (Math.abs(e.clientX - st.x) + Math.abs(e.clientY - st.y) >= 10 || !overEl(b, e)) { st.ok = false; b.classList.remove("p"); }
      });
      b.addEventListener("pointerup", function (e) {
        var s0 = st; st = null;
        b.classList.remove("p");
        if (!s0 || e.pointerId !== s0.id || !s0.ok) return;
        var dx = e.clientX - s0.x, dy = e.clientY - s0.y;
        if (Math.sqrt(dx * dx + dy * dy) >= 10 || !overEl(b, e)) return;
        if ((e.timeStamp || performance.now()) - s0.t < 40) return;
        fire(b);
      });
      b.addEventListener("pointercancel", function () { st = null; b.classList.remove("p"); });
      b.addEventListener("lostpointercapture", function () { b.classList.remove("p"); });
    } else {
      var up = function () { b.classList.remove("p"); stopRep(); };
      b.addEventListener("pointerup", up);
      b.addEventListener("pointercancel", up);
      b.addEventListener("lostpointercapture", up);
    }
    b.addEventListener("click", function (e) { if (e.detail === 0 && Date.now() - (b._pd || 0) > 800) fire(b); }); // keyboard (a screen reader's click after a touch is the same press)
  });

  $("cancel").addEventListener("pointerdown", function (e) { e.preventDefault(); vib(10); send({ t: "power", a: "cancel" }); });
  $("cancel").addEventListener("click", function (e) { if (e.detail === 0) send({ t: "power", a: "cancel" }); });

  /* Desk screen on/off (the PC turns the other monitors off over DDC/CI, or blacks it out) */
  function renderScreen() {
    var off = !!S && S.screenOn === false;
    $("screenBtn").setAttribute("aria-pressed", off ? "true" : "false");
    $("screenName").textContent = "Desk screen: " + (off ? "Off" : "On");
    $("screenHint").textContent = off ? "Tap to turn the desk monitor on" : "Tap to turn the desk monitor off";
    if (link === "ok" && !noteTimer) setLink(link);
  }
  $("screenBtn").addEventListener("click", function () {
    vib(10);
    send({ t: "screen", on: !!S && S.screenOn === false });
  });

  /* exit: tap twice */
  // "Close TV screen" ({t:"exit"}: back to standby) and "Turn off TV Mode" ({t:"exit",a:"quit"}: quits fully)
  var exitRows = []; // one armed at a time, so a second tired tap can't confirm the other one
  function exitRow(id, label, frame, onSent) {
    var btn = $(id), rt = btn.querySelector(".rt"), timer = 0;
    function disarm() { clearTimeout(timer); btn.classList.remove("sure"); rt.textContent = label; }
    exitRows.push(disarm);
    btn.addEventListener("click", function () {
      vib(10);
      if (!btn.classList.contains("sure")) exitRows.forEach(function (d) { d(); });
      if (btn.classList.contains("sure")) {
        clearTimeout(timer);
        btn.classList.remove("sure");
        rt.textContent = label;
        if (send(frame) && onSent) onSent();
        return;
      }
      btn.classList.add("sure");
      rt.textContent = "Sure? " + label;
      timer = setTimeout(disarm, 3000);
    });
  }
  exitRow("exit", "Close TV screen", { t: "exit" });
  // remember that it was this phone, so the next "can't reach the PC" says so
  exitRow("quitTv", "Turn off TV Mode", { t: "exit", a: "quit" }, function () { quitAt = Date.now(); if (!demo) lsPut(QUIT_KEY, quitAt); });

  /* ---------- Add a phone: a one-time invite, never the permanent token ----------
     Opening the screen asks the PC for {"t":"invite"}; it answers {"t":"invite","url"} with a link
     that works once, for 10 minutes. The QR, Show on TV and Share link all carry that one link. */
  // guarded: a slow network can pair this script with an older cached page that has none of it
  var addEl = $("addview"), addHint = $("addHint"), addTv = $("addTv"), addShare = $("addShare"), ADD_HINT = addHint ? addHint.textContent : "";
  var addUrl = "", addTvSt = "idle", addTvT = 0, addWaitT = 0, ADD_TV_FAIL = "The TV didn't answer. Scan the QR above or tap Share link. Works once, for 10 minutes.";
  function addSay(t) { addHint.textContent = t; addHint.classList.toggle("say", t !== ADD_HINT); }
  function addCode() { var m = /#i=([0-9a-f]{32})/.exec(addUrl); return m ? m[1] : ""; }
  function addTvPaint(st) {
    addTvSt = st;
    clearTimeout(addTvT);
    addTv.disabled = st === "wait" || !addUrl;
    addTv.classList.toggle("quiet", st === "on" || st === "fail");
    addTv.textContent = st === "wait" ? "Showing on TV\u2026" : st === "on" ? "On the TV now \u00b7 Take it down" : st === "fail" ? "Try the TV again" : "Show on TV";
    if (st === "wait") addTvT = setTimeout(function () { addTvAnswer(false); }, 4000);
  }
  function addTvAnswer(ok) {
    if (!addHint || addTvSt !== "wait") return;
    addTvPaint(ok ? "on" : "fail");
    addSay(ok ? "The QR is on the TV now. It goes away when the new phone joins, or in 10 minutes." : ADD_TV_FAIL);
  }
  function gotInvite(m) {
    if (!addEl || addEl.hidden || !m.url) return;
    clearTimeout(addWaitT);
    addUrl = String(m.url);
    try {
      var qr = qrcode(0, "M"); qr.addData(addUrl); qr.make();
      $("addQr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) { $("addQr").textContent = ""; }
    addTvPaint(addTvSt === "wait" ? "wait" : "idle");
    addShare.disabled = false;
  }
  function closeAdd() {
    if (!addEl || addEl.hidden) return;
    addEl.hidden = true;
    clearTimeout(addTvT); clearTimeout(addWaitT);
    var code = addCode();
    addUrl = "";
    if (!demo && code) send({ t: "invite", a: "cancel", i: code }); // the link dies with the screen
    if (!demo) send({ t: "pairtv", a: "hide" }); // take the TV's QR down too
    try { moreBtn.focus({ preventScroll: true }); } catch (e) {}
  }
  if (addEl && addHint && addTv && $("addPhone") && addShare && $("addDone")) {
  $("addPhone").addEventListener("click", function () {
    vib(10);
    closeSheet();
    addUrl = ""; $("addQr").textContent = "";
    addSay(ADD_HINT);
    addTvPaint("idle"); addShare.disabled = true;
    addEl.hidden = false;
    $("addDone").focus();
    if (!send({ t: "invite" })) addSay("No link to the PC right now. Try again in a moment.");
    else addWaitT = setTimeout(function () { if (!addUrl) addSay("The PC didn't make a link. Close this and try again."); }, 5000);
  });
  addTv.addEventListener("click", function () {
    vib(10);
    if (addTvSt === "on") { send({ t: "pairtv", a: "hide" }); addTvPaint("idle"); addSay(ADD_HINT); return; }
    if (!addUrl || addTvSt === "wait") return;
    addTvPaint("wait");
    if (!send({ t: "pairtv", i: addCode() })) addTvAnswer(false);
  });
  addShare.addEventListener("click", function () {
    vib(10);
    var url = addUrl;
    if (!url) return;
    if (navigator.share) { navigator.share({ title: "TV Mode remote", url: url }).catch(function () {}); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () {
      addSay("Link copied. Send it to the other phone. It works once, for 10 minutes.");
    }, function () { addSay("This browser cannot share. Scan the QR above instead."); });
  });
  $("addDone").addEventListener("click", function () { vib(10); closeAdd(); });
  // a focus trap: Tab and Shift+Tab stay inside this full-screen view
  addEl.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;
    var f = Array.prototype.filter.call(addEl.querySelectorAll("button"), function (b) { return !b.disabled && !b.hidden; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (!addEl.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  }

  /* ---------- modes ---------- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  function setMode(m) {
    mode = m;
    if (m !== "remote") closeSheet();
    app.setAttribute("data-mode", m);
    tabs.forEach(function (t) { t.setAttribute("aria-pressed", t.getAttribute("data-mode") === m ? "true" : "false"); });
    if (m === "type") typeIn.focus(); else if (document.activeElement === typeIn) typeIn.blur();
    renderHead();
  }
  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      vib(10); closeSheet(); autoType = false;
      var m = t.getAttribute("data-mode");
      // Type on the TV home opens its search (the PC ignores this anywhere else)
      if (m === "type" && S && S.app === "launcher" && !S.typing) send({ t: "key", k: "search" });
      setMode(m);
    });
  });

  /* ---------- more: bottom sheet ---------- */
  var sheet = $("sheet"), moreBtn = $("more");
  function openSheet() {
    sheetSayClear();
    sheet.hidden = false;
    moreBtn.setAttribute("aria-expanded", "true");
    try { $("sheetClose").focus({ preventScroll: true }); } catch (e) {}
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    moreBtn.setAttribute("aria-expanded", "false");
  }
  moreBtn.addEventListener("click", function () { vib(10); openSheet(); });
  $("sheetScrim").addEventListener("click", closeSheet);
  $("sheetClose").addEventListener("click", closeSheet);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });
  $("calBtn").addEventListener("click", closeSheet);
  sheet.querySelector('[data-act="recenter"]').addEventListener("pointerdown", function () {
    setTimeout(function () { closeSheet(); note("Pointer re-centred.", ""); }, 150);
  });

  /* ---------- drawer: apps, arrows, seek, scroll, sleep ---------- */
  var drawer = $("drawer"), drawerBtn = $("drawerBtn");
  function openDrawer(toServices) {
    sheetSayClear();
    drawer.hidden = false;
    drawerBtn.setAttribute("aria-expanded", "true");
    if (toServices) {
      var first = $("svc").querySelector(".b"), sh = drawer.querySelector(".sheet");
      try { first.focus({ preventScroll: true }); $("svcWrap").scrollIntoView({ block: "start" }); if (sh) sh.scrollTop = 0; } catch (e) {}
      return;
    }
    try { $("drawerClose").focus({ preventScroll: true }); } catch (e) {}
  }
  function closeDrawer() {
    if (drawer.hidden) return;
    drawer.hidden = true;
    drawerBtn.setAttribute("aria-expanded", "false");
  }
  drawerBtn.addEventListener("click", function () { vib(10); openDrawer(); });
  $("whereBtn").addEventListener("click", function () { if (!this.disabled) { vib(10); openDrawer(true); } });
  $("drawerScrim").addEventListener("click", closeDrawer);
  $("drawerClose").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

  /* ---------- mood tap: Light, Gripping, Comfort ----------
     One tap sets a mood for tonight, a tap on the same word clears it, and it clears
     itself at 05:00. The phone sends the word it wants in force ({"t":"mood","m":"light"},
     "" = none), so a repeat changes nothing; the PC echoes the word to every phone. The
     word is kept in this browser, and sent again once per connection, so a restarted PC
     still knows it. */
  var MOODS = ["light", "gripping", "comfort"], mood = "", moodSynced = false;
  var moodCaps = { "": "Mood for tonight", light: "Light tonight", gripping: "Gripping tonight", comfort: "Comfort tonight" };
  function moodGone(at) { // is a mood set at `at` past its 05:00?
    var d = new Date(at), n = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 5, 0, 0);
    if (n.getTime() <= d.getTime()) n.setDate(n.getDate() + 1);
    return Date.now() >= n.getTime();
  }
  function moodRead() {
    try {
      var j = JSON.parse(localStorage.getItem("tv.mood") || "null");
      if (j && MOODS.indexOf(j.m) >= 0 && !moodGone(j.at)) return { m: j.m, at: j.at };
    } catch (e) {}
    return null;
  }
  function moodPaint() {
    Array.prototype.forEach.call(document.querySelectorAll("#mood [data-mood]"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-mood") === mood ? "true" : "false");
    });
    $("moodVal").textContent = mood ? mood.charAt(0).toUpperCase() + mood.slice(1) : "None";
  }
  function moodSet(m, at) {
    mood = MOODS.indexOf(m) >= 0 ? m : "";
    try { if (mood) localStorage.setItem("tv.mood", JSON.stringify({ m: mood, at: at || Date.now() })); else localStorage.removeItem("tv.mood"); } catch (e) {}
    moodPaint();
  }
  Array.prototype.forEach.call(document.querySelectorAll("#mood [data-mood]"), function (b) {
    b.addEventListener("click", function () {
      var w = b.getAttribute("data-mood"), next = mood === w ? "" : w;
      vib(10);
      moodSet(next);
      send({ t: "mood", m: next });
    });
  });
  $("moodRow").addEventListener("click", function () {
    var open = $("moodBody").hidden;
    vib(8);
    $("moodBody").hidden = !open;
    this.setAttribute("aria-expanded", String(open));
  });
  (function () { var r = moodRead(); if (r) moodSet(r.m, r.at); else moodPaint(); })();
  function moodSync() { // once per connection: tell the PC the mood this phone still holds
    if (moodSynced) return;
    moodSynced = true;
    var r = moodRead();
    if (r) { moodSet(r.m, r.at); send({ t: "mood", m: r.m }); } else if (mood) moodSet("");
  }
  /* ---------- player sheet: subtitles and audio, episodes, speed (every app) ----------
     The PC answers "media:subs" with {t:"tracks", audio, subs} (Netflix from the helper,
     JioHotstar and Prime from their own menu, opened and closed again on the TV) and
     {t:"eps"} with the season of what is playing. A tap sends the choice; the lists come
     back with the new marks. */
  var ps = $("psheet"), psTab = "subs", psSeason = 0, psRate = 1, psList = null, psWait = 0, epsNoneAt = 0;
  // a pick waits for the PC: the row says "Setting…" and keeps the old tick until a frame confirms it.
  // Nothing back in 5 s, or an error: the row goes back and the sheet says so.
  var psPend = null, psReqAt = 0;   // psReqAt: the phone last asked the PC for tracks or a pick (a frame with no request behind it must not reopen the sheet)
  function psPendClear(revert) {
    var p = psPend; if (!p) return;
    psPend = null; clearTimeout(p.timer); clearTimeout(p.soft);
    if (revert && p.revert) p.revert();
  }
  function psPendStart(revert, confirm, rate) {
    psPendClear(true);
    var p = psPend = { revert: revert, confirm: confirm, rate: rate };
    p.timer = setTimeout(function () {
      if (psPend !== p) return;
      psPendClear(true);
      note((S && NAMES[S.app] ? NAMES[S.app] : "The player") + " did not confirm that. Try again.");
    }, 5000);
    return p;
  }
  var psSpeedEl = $("psSpeed");
  function psTick(r) { Array.prototype.forEach.call(psSpeedEl.children, function (x) { x.setAttribute("aria-checked", String(Math.abs(+x.getAttribute("data-rate") - r) < 0.01)); }); }
  function epsNoneNow() { return Date.now() - epsNoneAt < 600000; }   // the list said "none" lately: Episodes would be empty
  function psBackstop(id, msg) { // nothing came back: say so rather than wait for ever
    clearTimeout(psWait);
    psWait = setTimeout(function () { var n = $(id); if (!ps.hidden && !n.hidden && /…$/.test(n.textContent)) n.textContent = msg; }, 6000);
  }
  function psShowTab(tab, quiet) {
    if (tab === "eps" && S && S.eps === false) tab = "subs";   // the PC has no episode list to build: no dead-end tab
    psTab = tab;
    Array.prototype.forEach.call(ps.querySelectorAll("[data-ps]"), function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-ps") === tab)); });
    Array.prototype.forEach.call(ps.querySelectorAll("[data-pane]"), function (p) { p.hidden = p.getAttribute("data-pane") !== tab; });
    if (quiet) return;
    if (tab === "subs") {
      $("psSubsNote").textContent = S && S.media && S.media.ad ? "Subtitles come back after the ad" : "Reading the player…"; $("psSubsNote").hidden = false;
      $("psSubs").textContent = ""; $("psAudio").textContent = ""; $("psSubsH").hidden = true; $("psAudioH").hidden = true;
      psReqAt = Date.now(); send({ t: "media", a: "subs" });
      psBackstop("psSubsNote", "The player did not answer. Start the video, then tap Player again.");
    } else if (tab === "eps") {
      $("psEpsNote").textContent = "Finding the episodes…"; $("psEpsNote").hidden = false;
      send({ t: "eps", i: psSeason });
      psBackstop("psEpsNote", "The episodes did not come. Try again in a moment.");
    }
  }
  function psOpen(tab, quiet) {
    vib(10);
    sheetSayClear();
    closeDrawer();
    if (ps.hidden) psSeason = 0; // a fresh open starts at the season of what is playing
    sheetMsgEl(ps);   // the message slot exists from the start (fixed height), so a note never moves the rows
    ps.hidden = false;
    psShowTab(tab || "subs", quiet);
    try { $("psClose").focus({ preventScroll: true }); } catch (e) {}
  }
  function psClose() { psReqAt = 0; if (ps) ps.hidden = true; }   // closed by hand: a late reply must not reopen it
  window.tvps = { open: psOpen, close: psClose };
  $("psBtn").addEventListener("click", function () { if (helperOffNow() && $("psBtn").classList.contains("idle")) { helperPulse(); return; } psOpen("subs"); });
  $("psScrim").addEventListener("click", psClose);
  $("psClose").addEventListener("click", psClose);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") psClose(); });

  Array.prototype.forEach.call(ps.querySelectorAll("[data-ps]"), function (b) {
    b.addEventListener("click", function () { vib(8); psShowTab(b.getAttribute("data-ps")); });
  });
  function psRow(label, on, onTap) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "b"; b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(!!on));
    var lb = document.createElement("span"); lb.textContent = label; b.appendChild(lb);
    b.insertAdjacentHTML("beforeend", '<svg class="ic ck" aria-hidden="true"><use href="#i-check"/></svg>');
    b.addEventListener("click", function () {
      vib(10);
      var old = lb.textContent;
      lb.textContent = "Setting\u2026"; b.classList.add("setting");
      psPendStart(function () { lb.textContent = old; b.classList.remove("setting"); }, null, null);
      psReqAt = Date.now();
      onTap();
    });
    return b;
  }
  function psTracks(m) {
    var subs = (m.subs || []).slice(), audio = m.audio || [];
    if (typeof m.subsOn === "boolean" && subs.length) {   // Prime: the PC says whether subtitles are on (its on/off button)
      var bare = subs.every(function (t) { return t.id === "On" || t.id === "Off"; });
      if (bare) subs = subs.map(function (t) { return { id: t.id, label: t.label, on: (t.id === "On") === m.subsOn }; });
      else {
        subs = subs.map(function (t) { return { id: t.id, label: t.label, on: m.subsOn && t.on }; });
        if (!subs.some(function (t) { return t.id === "Off"; })) subs.unshift({ id: "Off", label: "Off", on: !m.subsOn });
      }
    }
    var none = !subs.length && !audio.length;
    clearTimeout(psWait);
    psPendClear(false);   // this frame is the PC's own answer: the ticks below are the truth
    psTracksAt = Date.now();   // a note-only frame keeps the sheet open too, so the note is read
    if (none && m.msg) { menuNote = String(m.msg); menuNoteAt = Date.now(); menuNotePaint(); }
    else if (!none) { menuNote = ""; menuNoteAt = 0; menuNotePaint(); }
    $("psSubsNote").hidden = !none;
    if (none) $("psSubsNote").textContent = S && S.media && S.media.ad ? "Subtitles come back after the ad" : m.msg || "This player has no subtitle or audio choices.";
    $("psSubsH").hidden = !subs.length; $("psAudioH").hidden = !audio.length;
    var sl = $("psSubs"), al = $("psAudio");
    sl.textContent = ""; al.textContent = "";
    subs.forEach(function (t) { sl.appendChild(psRow(t.label, t.on, function () { send({ t: "media", a: "track", s: { kind: "subs", id: t.id } }); })); });
    audio.forEach(function (t) { al.appendChild(psRow(t.label, t.on, function () { send({ t: "media", a: "track", s: { kind: "audio", id: t.id } }); })); });
  }
  function psEps(m) {
    var l = m.list, box = $("psEps");
    clearTimeout(psWait);
    box.textContent = "";
    var sr = ps.querySelector(".psseason");
    if (m.none || !l) {
      psList = null; epsNoneAt = Date.now();
      $("psEpsNote").textContent = m.msg ? String(m.msg).replace(/TMDB/g, "The episode list") : "Episodes show once TV Mode knows the series you are watching.";
      $("psEpsNote").hidden = false;
      $("psSe").textContent = "";
      sr.hidden = true;   // no list, no season arrows
      return;
    }
    epsNoneAt = 0; sr.hidden = false;
    psList = l; psSeason = l.season;
    $("psSe").textContent = "Season " + l.season + (l.seasons > 1 ? " of " + l.seasons : "");
    $("psSePrev").disabled = l.season <= 1; $("psSeNext").disabled = l.season >= l.seasons;
    $("psEpsNote").hidden = !!l.eps.length;
    if (!l.eps.length) $("psEpsNote").textContent = "No episodes listed for this season.";
    l.eps.forEach(function (e) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "b ep" + (l.nextSe === l.season && l.nextEp === e.n ? " next" : "");
      var n = document.createElement("span"); n.className = "en"; n.textContent = e.n + ". " + (e.name || "Episode " + e.n);
      var h = document.createElement("span"); h.className = "eh";
      h.textContent = (l.nextSe === l.season && l.nextEp === e.n ? "Up next · " : "") + (e.pct >= 0.9 ? "Watched" : e.pct > 0.02 ? Math.round(e.pct * 100) + "% watched" : (e.min ? e.min + " min" : ""));
      b.appendChild(n); b.appendChild(h);
      b.addEventListener("click", function () {
        vib(12);
        send({ t: "openitem", k: "item", key: l.key, a: l.svc || "", se: l.season, ep: e.n });
        psClose();
        note("Opening episode " + e.n + "…", "");
      });
      box.appendChild(b);
    });
  }
  $("psSePrev").addEventListener("click", function () { if (psList && psList.season > 1) { psSeason = psList.season - 1; psShowTab("eps"); } });
  $("psSeNext").addEventListener("click", function () { if (psList && psList.season < psList.seasons) { psSeason = psList.season + 1; psShowTab("eps"); } });
  Array.prototype.forEach.call(psSpeedEl.children, function (b) {
    b.addEventListener("click", function () {
      vib(10);
      var want = +b.getAttribute("data-rate"), lbl = b.textContent;
      if (S && S.media && typeof S.media.rate === "number" && Math.abs(S.media.rate - want) < 0.01) { psRate = want; psTick(want); return; }   // already at that speed: nothing to wait for
      function done() { b.textContent = lbl; b.classList.remove("setting"); }
      b.textContent = "\u2026"; b.classList.add("setting");
      var p = psPendStart(done, function () { done(); psRate = want; psTick(want); }, want);
      // an older PC does not report the speed: with no error after 2 s, the tap stands
      if (!(S && S.media && typeof S.media.rate === "number")) p.soft = setTimeout(function () { if (psPend === p) { psPendClear(false); p.confirm(); } }, 2000);
      send({ t: "media", a: "speed", s: want });
    });
  });

  // opening an app closes the drawer: the pad is where the next move happens
  Array.prototype.forEach.call(drawer.querySelectorAll("[data-act^=open]"), function (b) {
    b.addEventListener("pointerup", function () { setTimeout(function () { if ($("svcArm").hidden) closeDrawer(); }, 120); });
  });

  /* ---------- type ---------- */
  typeIn.addEventListener("input", function () {
    var cur = typeIn.value, prev = typePrev, n = Math.min(prev.length, cur.length), i = 0;
    while (i < n && prev.charAt(i) === cur.charAt(i)) i++;
    for (var d = prev.length - i; d > 0; d--) send({ t: "textkey", k: "backspace" });
    var add = cur.slice(i);
    if (add) send({ t: "text", s: add });
    typePrev = cur;
  });
  typeIn.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      vib(10);
      send({ t: "textkey", k: "enter" });
      typeIn.value = "";
      typePrev = "";
    }
  });

  /* ---------- scrub ----------
     A tap does nothing. It wakes after a 16 px sideways drag or a 300 ms hold; while
     it is awake the target time shows large and nothing is sent. Letting go sends the
     seek, unless the finger is more than 48 px off the bar: that cancels. */
  var SCRUB_DRAG = 16, SCRUB_HOLD = 300, SCRUB_OFF = 48;
  var scrubTip = $("scrubTip"), scrubSt = null;
  function scrubFrac(e) {
    var r = scrubEl.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  }
  function scrubOff(e) {
    var r = scrubEl.getBoundingClientRect();
    return e.clientY < r.top - SCRUB_OFF || e.clientY > r.bottom + SCRUB_OFF;
  }
  function scrubShow(f, off) {
    paintScrub(f);
    var dur = S && S.media ? S.media.dur : 0;
    if (dur > 0) { $("tPos").textContent = clock(f * dur); $("tipT").textContent = clock(f * dur); }
    $("tipH").textContent = off ? "Let go to cancel" : "Let go to jump";
    scrubTip.classList.toggle("off", !!off);
    scrubEl.setAttribute("aria-valuenow", String(Math.round(f * 100)));
  }
  function hasMedia() { return !!(S && S.media && S.media.dur > 0 && !S.media.ad); }
  function scrubWake(e) {
    if (!scrubSt || scrubSt.on) return;
    scrubSt.on = true;
    clearTimeout(scrubSt.timer);
    scrubDrag = scrubFrac(e);
    scrubEl.classList.add("drag");
    scrubTip.hidden = false;
    vib(10);
    scrubShow(scrubDrag, false);
  }
  function scrubStop(apply) {
    var st = scrubSt;
    scrubSt = null;
    if (!st) return;
    clearTimeout(st.timer);
    var f = scrubDrag;
    scrubDrag = -1;
    scrubEl.classList.remove("drag");
    scrubTip.hidden = true;
    if (apply && st.on && f >= 0) send({ t: "scrub", to: +f.toFixed(4) });
    else if (S) applyState(S);
  }
  scrubEl.addEventListener("pointerdown", function (e) {
    if (!hasMedia() || scrubSt) return;
    e.preventDefault();
    try { scrubEl.setPointerCapture(e.pointerId); } catch (x) {}
    scrubSt = { id: e.pointerId, x: e.clientX, on: false, last: { clientX: e.clientX, clientY: e.clientY }, timer: setTimeout(function () { if (scrubSt) scrubWake(scrubSt.last); }, SCRUB_HOLD) };
  });
  scrubEl.addEventListener("pointermove", function (e) {
    if (!scrubSt || e.pointerId !== scrubSt.id) return;
    scrubSt.last = { clientX: e.clientX, clientY: e.clientY };
    if (!scrubSt.on) {
      if (Math.abs(e.clientX - scrubSt.x) >= SCRUB_DRAG) scrubWake(e);
      return;
    }
    scrubDrag = scrubFrac(e);
    scrubShow(scrubDrag, scrubOff(e));
  });
  scrubEl.addEventListener("pointerup", function (e) {
    if (!scrubSt || e.pointerId !== scrubSt.id) return;
    scrubStop(scrubSt.on && !scrubOff(e));
  });
  scrubEl.addEventListener("pointercancel", function () { scrubStop(false); });
  scrubEl.addEventListener("keydown", function (e) {
    if (!hasMedia()) return;
    var f = S.media.pos / S.media.dur;
    if (e.key === "ArrowRight") f += 0.02; else if (e.key === "ArrowLeft") f -= 0.02; else return;
    e.preventDefault();
    send({ t: "scrub", to: +Math.max(0, Math.min(1, f)).toFixed(4) });
  });

  /* ---------- power: hold one second ----------
     The same hold on the main screen's ring and on the Start TV screen's ring: one second held,
     then the PC's 10 second countdown (which can be cancelled). */
  function bindHold(btn) {
    var timer = 0;
    function start() {
      if (timer) return;
      vib(10);
      btn.classList.add("hold");
      timer = setTimeout(function () {
        timer = 0;
        btn.classList.remove("hold");
        vib([30, 50, 30]);
        send({ t: "power", a: "arm" });
      }, 1000);
    }
    function end() {
      clearTimeout(timer);
      timer = 0;
      btn.classList.remove("hold");
    }
    btn.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (x) {}
      start();
    });
    btn.addEventListener("pointerup", end);
    btn.addEventListener("pointercancel", end);
    btn.addEventListener("lostpointercapture", end);
    btn.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); start(); } });
    btn.addEventListener("keyup", end);
    btn.addEventListener("blur", end);
  }
  bindHold($("power"));
  bindHold($("standPower"));

  /* ---------- touchpad ---------- */
  (function () {
    var pad = $("pad");
    var ptrs = {};          // id -> {x,y}
    var n = 0;
    var downAt = 0, moved = 0, maxN = 0;
    var accX = 0, accY = 0, accS = 0, raf = 0;

    function flush() {
      raf = 0;
      if (accX || accY) {
        send({ t: "pad", dx: +accX.toFixed(1), dy: +accY.toFixed(1) });
        accX = accY = 0;
      }
      if (accS) {
        send({ t: "scroll", dy: Math.round(accS) });
        accS = 0;
      }
    }
    function queue() { if (!raf) raf = requestAnimationFrame(flush); }

    pad.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      try { pad.setPointerCapture(e.pointerId); } catch (x) {}
      if (n === 0) { downAt = Date.now(); moved = 0; maxN = 0; }
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      n++;
      if (n > maxN) maxN = n;
      pad.classList.add("touch");
    });
    pad.addEventListener("pointermove", function (e) {
      var p = ptrs[e.pointerId];
      if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (n === 1) { accX += dx; accY += dy; }
      else if (n >= 2) { accS += -dy / n * 2.4; } // fingers up = page down, wheel convention
      queue();
    });
    function end(e) {
      if (!ptrs[e.pointerId]) return;
      delete ptrs[e.pointerId];
      n--;
      if (n <= 0) {
        n = 0;
        pad.classList.remove("touch");
        if (Date.now() - downAt < 250 && moved < 12) {
          vib(10);
          send({ t: "tap", b: maxN >= 2 ? "right" : "left" });
        }
      }
    }
    pad.addEventListener("pointerup", end);
    pad.addEventListener("pointercancel", end);
  })();

  /* ---------- the pad: the main way to move around the TV (TOUCHPAD-SHAPE.md) ----------
     The PC says what the page on screen needs (S.padMode):
       focus  : a swipe moves the highlight one card; a longer drag ratchets on, a flick adds steps; tap = OK
       cursor : drag moves the mouse, tap clicks, two fingers scroll
       player : tap = play/pause, swipe sideways = 10 s each, hold then slide = scrub, swipe down/up = the app's own controls
     Holding two fingers still cycles the behaviour for this page when the guess is wrong (on Netflix the player is in the cycle).
     Mis-touch rules: touches that start within 16 px of an edge are ignored; a tap is under 200 ms
     and 10 px; a swipe counts after 24 px and locks to one axis; nothing is read for 300 ms after
     the behaviour changes. */
  var gp = $("gpad"), gpLabel = $("gpLabel"), gpHint = $("gpHint"), gpDot = $("gpDot");
  var GP_EDGE = 16, GP_TAP_MS = 200, GP_TAP_PX = 10, GP_SWIPE = 24, GP_STEP = 56, GP_SETTLE = 300, GP_HOLD = 350, GP_SWAP = 600;
  var GP_TEXT = {
    focus: ["Cards", "Swipe to move. Tap for OK."],
    cursor: ["Cursor", "Drag to move. Tap to click. Two fingers scroll."],
    player: ["Player", "Tap: pause \u00b7 Slide: scrub \u00b7 Up: subtitles"],
    off: ["Not connected", "The pad wakes when the PC is back."]
  };
  var gpSwap = null, gpSwapFor = "", gpLast = "", gpQuiet = 0, gpAd = false;
  var GP_AD = ["Ad playing", "Tap to pause. Skip shows when the ad allows it"];
  function gpBase() { return (S && S.padMode) || "focus"; }
  function gpMode() {
    var b = gpBase();
    if (gpSwap && gpSwapFor === (S ? S.app : "") + "|" + b) return gpSwap;
    return b;
  }
  function gpRender() {
    if (!gp) return;
    var m = link === "ok" ? gpMode() : "off";
    var ad = m === "player" && !!(S && S.media && S.media.ad);
    if (m !== gpLast || ad !== gpAd) {
      if (gpLast && gpLast !== "off" && gpLast !== m) gpQuiet = Date.now() + GP_SETTLE;
      gpLast = m; gpAd = ad;
      var tx = ad ? GP_AD : GP_TEXT[m];
      gp.setAttribute("data-pm", m);
      $("gpLabelT").textContent = m === "off" ? tx[0] : ad ? tx[0] : "Pad: " + tx[0].toLowerCase();
      gpHint.textContent = tx[1];
      gp.setAttribute("aria-label", "Touchpad: " + tx[0]);
    }
    gp.classList.toggle("swap", !!gpSwap && m === gpSwap);
    if (m !== "off") {
      var nx = GP_SHORT[gpNext()];
      $("gpLabelN").textContent = "Switch to " + nx.toLowerCase();
      gpLabel.setAttribute("aria-label", "The pad moves " + GP_SAYS[m] + ". Switch to " + nx.toLowerCase());
    }
  }
  var GP_SHORT = { focus: "Cards", cursor: "Cursor", player: "Player" };
  var GP_SAYS = { focus: "between cards", cursor: "a cursor", player: "the player" }; // the chip says what the pad does now, then what a tap on the chip switches to
  function gpOrder() { var b = gpBase(); return S && S.app === "netflix" ? ["focus", "player", "cursor"] : b === "player" ? ["player", "focus"] : ["focus", "cursor"]; }
  function gpNext() { var o = gpOrder(); return o[(o.indexOf(gpMode()) + 1) % o.length]; }
  // the next behaviour for this page; the label chip taps it and two fingers held still do the same.
  // On Netflix the player is one of them, since an episode started inside Netflix looks like a browse page.
  function gpCycle() {
    var b = gpBase();
    gpSwapFor = (S ? S.app : "") + "|" + b;
    gpSwap = gpNext();
    if (gpSwap === b) gpSwap = null;
    vib([10, 40, 10]);
    gpLast = ""; gpRender();
    note({ cursor: "Cursor on this page.", focus: "Cards on this page.", player: "Player: tap to pause, slide to scrub." }[gpMode()], "");
  }
  gpLabel.addEventListener("click", function () { if (link === "ok") gpCycle(); });
  window.tvpad = { mode: gpMode, render: gpRender, demo: function (pm, app) { if (demo && S) { var n = JSON.parse(JSON.stringify(S)); n.padMode = pm; if (app) n.app = app; if (arguments[2] === "nomedia") n.media = null; applyState(n); } } };

  (function () {
    if (!gp) return;
    var t = null, fingers = {}, nf = 0;
    var accX = 0, accY = 0, accS = 0, raf = 0;
    function flush() {
      raf = 0;
      if (accX || accY) { send({ t: "pad", dx: +accX.toFixed(1), dy: +accY.toFixed(1) }); accX = accY = 0; }
      if (accS) { send({ t: "scroll", dy: Math.round(accS) }); accS = 0; }
    }
    function queue() { if (!raf) raf = requestAnimationFrame(flush); }
    function dotAt(x, y) {
      var r = gp.getBoundingClientRect();
      gpDot.style.transform = "translate(" + (x - r.left) + "px," + (y - r.top) + "px)";
    }
    function dirOf(axis, sign) { return axis === "x" ? (sign > 0 ? "right" : "left") : (sign > 0 ? "down" : "up"); }
    function step(mode, dir) {
      vib(8);
      if (mode === "player" && (dir === "left" || dir === "right")) send({ t: "media", a: "seek", s: dir === "right" ? 10 : -10 });
      else send({ t: "key", k: dir });
    }
    function stopTimers(s) { clearTimeout(s.holdTimer); clearTimeout(s.swapTimer); clearInterval(s.rep); }
    // scrub: the slide is relative to where the video is. A short slide is fine-grained, a long
    // one covers more (a tenth of the pad ~40 s, half ~6 min, the whole width ~20 min)
    function scrubSecs(dx) {
      var w = gp.getBoundingClientRect().width, u = Math.abs(dx) / w;
      return (dx < 0 ? -1 : 1) * (u * 300 + u * u * 900);
    }
    function scrubMove(x) {
      var dx = x - t.x0, secs = scrubSecs(dx), md = S && S.media, off = Math.abs(dx) < 12;
      t.secs = secs;
      if (md && md.dur > 0) {
        var f = Math.max(0, Math.min(1, (md.pos + secs) / md.dur));
        t.f = f; scrubDrag = f;
        scrubShow(f, off);
        // big: where he'll land; small: how far that is
        $("tipT").textContent = clock(f * md.dur);
        $("tipH").textContent = off ? "Let go to cancel" : (secs < 0 ? "Back " : "Forward ") + clock(Math.abs(secs));
      } else { // no length known (Netflix without the helper): a jump by the slide
        t.f = -1;
        $("tipT").textContent = (secs < 0 ? "−" : "+") + clock(Math.abs(Math.round(secs / 10) * 10));
        $("tipH").textContent = off ? "Let go to cancel" : "Let go to jump";
        scrubTip.classList.toggle("off", off);
      }
    }
    gp.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest("#point,.gpoff,.gplabel")) return;
      e.preventDefault();
      try { gp.setPointerCapture(e.pointerId); } catch (x) {}
      fingers[e.pointerId] = { x: e.clientX, y: e.clientY };
      nf++;
      if (nf === 2 && t && !t.dead) { // a second finger: scroll, or a still hold swaps the behaviour
        t.n = 2; clearTimeout(t.holdTimer); clearInterval(t.rep);
        var s2 = t;
        s2.swapTimer = setTimeout(function () {
          if (t !== s2 || s2.moved2 > 14) return;
          s2.dead = true;
          gpCycle();
        }, GP_SWAP);
        return;
      }
      if (nf > 1 || t) return;
      var r = gp.getBoundingClientRect(), now = e.timeStamp || performance.now();
      var edge = e.clientX - r.left < GP_EDGE || r.right - e.clientX < GP_EDGE || e.clientY - r.top < GP_EDGE || r.bottom - e.clientY < GP_EDGE;
      var m = link === "ok" ? gpMode() : "off";
      t = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, t0: now, n: 1, mode: m, axis: null, ref: 0, sign: 1,
        moved: 0, moved2: 0, once: false, dead: edge || m === "off" || Date.now() < gpQuiet, samples: [[now, e.clientX, e.clientY]],
        lastMove: now, scrub: false, f0: 0, f: -1 };
      gp.classList.add("touch");
      gpDot.classList.toggle("edge", t.dead);
      dotAt(e.clientX, e.clientY);
      if (t.dead) return;
    });
    gp.addEventListener("pointermove", function (e) {
      var f = fingers[e.pointerId];
      if (!f) return;
      var ddx = e.clientX - f.x, ddy = e.clientY - f.y;
      f.x = e.clientX; f.y = e.clientY;
      if (!t || t.dead) return;
      if (t.n >= 2) {
        t.moved2 += Math.abs(ddx) + Math.abs(ddy);
        if (t.moved2 > 14) clearTimeout(t.swapTimer);
        if (t.mode !== "player") { accS += -ddy * 1.2; queue(); } // fingers up = page down, wheel convention
        return;
      }
      if (e.pointerId !== t.id) return;
      var now = e.timeStamp || performance.now();
      t.lx = e.clientX; t.ly = e.clientY; t.lastMove = now;
      t.moved += Math.abs(ddx) + Math.abs(ddy);
      t.samples.push([now, e.clientX, e.clientY]);
      while (t.samples.length > 2 && now - t.samples[0][0] > 80) t.samples.shift();
      dotAt(e.clientX, e.clientY);
      if (t.scrub) { scrubMove(e.clientX); return; }
      if (t.mode === "cursor") {
        if (t.moved > GP_TAP_PX) { accX += ddx; accY += ddy; queue(); }
        return;
      }
      var dx = e.clientX - t.x0, dy = e.clientY - t.y0;
      if (!t.axis) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < GP_SWIPE) return;
        clearTimeout(t.holdTimer);
        t.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
        t.sign = (t.axis === "x" ? dx : dy) > 0 ? 1 : -1;
        t.ref = (t.axis === "x" ? t.x0 : t.y0) + t.sign * GP_SWIPE;
        if (t.mode === "player" && t.axis === "x" && S && S.media && S.media.ad) { // the ad's clock is not the show's: nothing to scrub
          vib(8); t.once = true;
          note("Ad playing. Seeking comes back after it", "");
          return;
        }
        if (t.mode === "player" && t.axis === "x") {
          t.scrub = true; vib(10);
          scrubTip.hidden = false; scrubEl.classList.add("drag");
          scrubMove(e.clientX);
          return;
        }
        if (t.mode === "player" && t.axis === "y") { // once a swipe: up = subtitles and audio, down = the app's own controls
          vib(10);
          psOpen(t.sign < 0 || epsNoneNow() || (S && S.eps === false) ? "subs" : "eps"); // an empty Episodes tab is no use: Subtitles instead. never the Down key: on Netflix it turns the volume down
          t.once = true;
          return;
        }
        step(t.mode, dirOf(t.axis, t.sign));
        // a drag held still well past its start repeats, gently faster
        var s3 = t, every = 320, lastRep = 0;
        s3.rep = setInterval(function () {
          if (t !== s3 || s3.dead) return;
          var n2 = performance.now();
          var far = Math.abs(s3.axis === "x" ? s3.lx - s3.x0 : s3.ly - s3.y0) > 90;
          if (far && n2 - s3.lastMove > 250 && n2 - lastRep >= every) { lastRep = n2; step(s3.mode, dirOf(s3.axis, s3.sign)); every = Math.max(140, every - 45); }
        }, 40);
        return;
      }
      if (t.once) return;
      var along = t.axis === "x" ? e.clientX : e.clientY;
      while (along - t.ref >= GP_STEP) { t.ref += GP_STEP; t.sign = 1; step(t.mode, dirOf(t.axis, 1)); }
      while (along - t.ref <= -GP_STEP) { t.ref -= GP_STEP; t.sign = -1; step(t.mode, dirOf(t.axis, -1)); }
    });
    function end(e) {
      if (!fingers[e.pointerId]) return;
      delete fingers[e.pointerId];
      nf = Math.max(0, nf - 1);
      if (!t) return;
      if (nf > 0) return;
      var s = t; stopTimers(s); t = null;
      gp.classList.remove("touch");
      if (s.scrub) {
        scrubDrag = -1; scrubEl.classList.remove("drag"); scrubTip.hidden = true;
        var dxe = e.clientX - s.x0, quick = (e.timeStamp || performance.now()) - s.t0 < 250 && Math.abs(dxe) < 110;
        if (e.type !== "pointerup" || Math.abs(dxe) < 12) { if (S) applyState(S); return; }
        vib(12);
        if (quick) send({ t: "media", a: "seek", s: dxe > 0 ? 10 : -10 }); // a flick: 10 s
        else if (s.f >= 0) send({ t: "scrub", to: +s.f.toFixed(4) });
        else send({ t: "media", a: "seek", s: Math.round(s.secs / 10) * 10 });
        if (S) applyState(S);
        return;
      }
      if (s.dead || e.type !== "pointerup") return;
      var now = e.timeStamp || performance.now();
      if (!s.axis && s.n === 1 && now - s.t0 < GP_TAP_MS && s.moved < GP_TAP_PX) {
        vib(15);
        if (s.mode === "focus") send({ t: "key", k: "ok" });
        else if (s.mode === "cursor") send({ t: "tap", b: "left" });
        else if (s.mode === "player") send(playMsg());
        return;
      }
      // a flick adds steps (cards only: seeking stays one swipe = 10 s)
      if (s.axis && s.mode === "focus" && s.n === 1 && s.samples.length >= 2) {
        var a0 = s.samples[0], a1 = s.samples[s.samples.length - 1], dt = Math.max(1, a1[0] - a0[0]);
        var v = ((s.axis === "x" ? a1[1] - a0[1] : a1[2] - a0[2]) / dt) * s.sign;
        if (v > 0.9) {
          var extra = Math.min(4, Math.floor((v - 0.9) / 0.5) + 1), i = 0, dir = dirOf(s.axis, s.sign);
          var fl = setInterval(function () { if (i++ >= extra || t) { clearInterval(fl); return; } vib(6); send({ t: "key", k: dir }); }, 90);
        }
      }
    }
    gp.addEventListener("pointerup", end);
    gp.addEventListener("pointercancel", end);
  })();

  /* ---------- point: hold, aim, let go ---------- */
  function OneEuro(minCut, beta, dCut) {
    var xp = null, dxp = 0, tp = 0;
    function alpha(te, cut) { var tau = 1 / (2 * Math.PI * cut); return 1 / (1 + tau / te); }
    this.reset = function () { xp = null; dxp = 0; };
    this.f = function (x, t) {
      if (xp === null) { xp = x; tp = t; dxp = 0; return x; }
      var te = Math.max(0.001, (t - tp) / 1000);
      tp = t;
      var dx = (x - xp) / te;
      dxp = dxp + alpha(te, dCut) * (dx - dxp);
      var cut = minCut + beta * Math.abs(dxp);
      xp = xp + alpha(te, cut) * (x - xp);
      return xp;
    };
  }
  // Units are degrees. Cutoff = 1 Hz + 0.06 x speed in deg/s: a still hand is
  // smoothed hard (no tremor), a normal 50 deg/s move passes at ~4 Hz (little lag).
  // Light filter: the overlay on the TV smooths the drawn pointer (tau ~50 ms), so this only
  // removes sensor quantisation. 6 Hz floor, +0.04 Hz per deg/s.
  var fYaw = new OneEuro(6, 0.04, 1), fPitch = new OneEuro(6, 0.04, 1);
  var pointBtn = $("point");
  var pointOn = false, motionOk = null, pointId = -1;
  var baseY = null, baseP = null, sentY = 0, sentP = 0, aimSeq = 0;
  var rawYaw = null, unwrapped = 0, lastFY = null, lastFP = null, lastAim = 0, sawEvent = false, sawTimer = 0;
  var aimN = 0, aimFirst = 0;
  var D2R = Math.PI / 180;

  // yaw (+ = turning right) and pitch (+ = tilting up) of the phone's top edge, in degrees
  function yawPitch(e) {
    var a = e.alpha * D2R, b = e.beta * D2R;
    var px = -Math.sin(a) * Math.cos(b), py = Math.cos(a) * Math.cos(b), pz = Math.sin(b);
    return [Math.atan2(px, py) / D2R, Math.asin(Math.max(-1, Math.min(1, pz))) / D2R];
  }
  function unwrap(prev, acc, yaw) {
    if (prev === null) return yaw;
    var d = yaw - prev;
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    return acc + d;
  }

  function onOrient(e) {
    if (!pointOn || e.alpha == null || e.beta == null) return;
    sawEvent = true;
    var yp = yawPitch(e), yaw = yp[0], pitch = yp[1];
    unwrapped = unwrap(rawYaw, unwrapped, yaw);
    rawYaw = yaw;
    var t = e.timeStamp || performance.now();
    var fy = fYaw.f(unwrapped, t), fp = fPitch.f(pitch, t);
    // Lift to rest: flat on a surface and still for REST_MS freezes the pointer
    // (no drift); picking the phone up, or moving it, wakes it without a jump.
    var flat = Math.abs(e.beta) < REST_TILT && Math.abs(e.gamma || 0) < REST_TILT;
    var moved = lastFY !== null && (Math.abs(fy - lastFY) + Math.abs(fp - lastFP)) > REST_MOVE;
    if (flat && !moved) { if (!restSince) restSince = t; } else { restSince = 0; if (resting) { resting = false; baseY = fy - sentY; baseP = fp - sentP; lastFY = fy; lastFP = fp; return; } }
    if (!resting && restSince && t - restSince > REST_MS) { resting = true; }
    if (resting) { lastFY = fy; lastFP = fp; return; }
    lastFY = fy; lastFP = fp;
    if (baseY === null) { baseY = fy; baseP = fp; sentY = sentP = 0; }
    // ABSOLUTE angles since Point was pressed (radians), with a sequence number.
    // Absolute values make a skipped or late frame harmless: the PC keeps the newest seq.
    var ba = dcOpen && dc ? dc.bufferedAmount : (relay ? relay.bufferedAmount : 0);
    if (ba > 4096) return; // backed-up socket: the next frame carries the newer absolute angle anyway
    // Through the relay (no direct link), 20 a second is plenty; every 18 ms flooded the
    // relay and held up the presses behind it ("That press didn't reach the PC").
    if (!(dcOpen && dc) && lastAim && t - lastAim < 50) return;
    sentY = fy - baseY; sentP = fp - baseP;
    lastAim = t;
    if (!aimN) aimFirst = t;
    aimN++;
    send({ t: "aim", abs: 1, q: ++aimSeq, yaw: +(sentY * D2R).toFixed(5), pitch: +(sentP * D2R).toFixed(5), ts: Math.round(t) });
  }

  /* ---- Point extras: every number here is a knob ---- */
  var REST_TILT = 12, REST_MOVE = 0.12, REST_MS = 1500;       // lift to rest: flat within 12 deg, still, for 1.5 s
  var SWIPE_START = 8, SCROLL_K = 3.2, FLING_MIN = 700, FLING_K = 2.4; // swipe on Point: px before it counts, wheel px per finger px, flick speed (px/s), momentum scale
  var DOUBLE_TAP_MS = 380, SHORT_TAP_MS = 220;                 // double-tap Point re-centres
  var SHAKE_ACC = 18, SHAKE_N = 3, SHAKE_WINDOW = 700;         // shake: 3 hard jerks (m/s^2) in 0.7 s re-centres
  var resting = false, restSince = 0;
  var swipe = { on: false, y0: 0, ly: 0, acc: 0, samples: [], moved: false }, downAt = 0, lastShortTap = 0;
  var shakes = [], shakeAbove = false, lastShake = 0;

  function onMotion(e) {
    var a = e.acceleration;
    if (!pointOn || !a || a.x == null) return;
    var m = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z), t = e.timeStamp || performance.now();
    if (m > SHAKE_ACC && !shakeAbove) { shakeAbove = true; shakes.push(t); }
    else if (m < SHAKE_ACC * 0.5) shakeAbove = false;
    while (shakes.length && t - shakes[0] > SHAKE_WINDOW) shakes.shift();
    if (shakes.length >= SHAKE_N && t - lastShake > 1500) {
      lastShake = t; shakes.length = 0;
      vib(20);
      send({ t: "recenter" });
    }
  }

  // swipe up/down on the Point button while holding it: scroll; a quick flick: momentum
  var SWIPE_ON = false; // off: Dev found swipe-scroll on Point broke pointing; the scroll buttons do it
  function swipeMove(e) {
    if (!SWIPE_ON || !pointOn || e.pointerId !== pointId) return;
    var now = performance.now();
    if (!swipe.on) { swipe.on = true; swipe.y0 = swipe.ly = e.clientY; swipe.acc = 0; swipe.samples = []; swipe.moved = false; }
    var dy = e.clientY - swipe.ly;
    swipe.ly = e.clientY;
    swipe.samples.push([now, e.clientY]);
    while (swipe.samples.length > 2 && now - swipe.samples[0][0] > 100) swipe.samples.shift();
    if (!swipe.moved && Math.abs(e.clientY - swipe.y0) < SWIPE_START) return;
    swipe.moved = true;
    swipe.acc += -dy * SCROLL_K;
    if (Math.abs(swipe.acc) >= 1) { send({ t: "scroll", dy: Math.round(swipe.acc) }); swipe.acc = 0; }
  }
  function swipeEnd() {
    var v = 0, s = swipe.samples;
    if (swipe.moved && s.length > 1) {
      var dt = (s[s.length - 1][0] - s[0][0]) / 1000;
      if (dt > 0.01) v = (s[s.length - 1][1] - s[0][1]) / dt; // px/s, + = finger down
    }
    var fl = Math.abs(v) >= FLING_MIN;
    var wasSwipe = swipe.moved;
    swipe.on = false; swipe.samples = []; swipe.moved = false;
    if (fl) send({ t: "fling", v: Math.round(-v * FLING_K) });
    return wasSwipe;
  }

  function needsPermission() {
    return typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function";
  }

  function pointStart(e) {
    if (pointOn || e.button > 0) return;
    e.preventDefault();
    pointId = e.pointerId;
    try { pointBtn.setPointerCapture(e.pointerId); } catch (x) {}
    vib(10);
    var go = function () {
      if (pointId === -1) return; // released while asking
      pointOn = true;
      pointHeld = true;
      rawYaw = null; lastFY = lastFP = null; baseY = baseP = null; sentY = sentP = 0; aimSeq = 0; lastAim = 0; sawEvent = false; aimN = 0;
      resting = false; restSince = 0; shakes.length = 0; shakeAbove = false; swipe.on = false; swipe.moved = false; downAt = performance.now();
      window.addEventListener("devicemotion", onMotion, true);
      fYaw.reset(); fPitch.reset();
      pointBtn.classList.add("held");
      renderHead();
      window.addEventListener("deviceorientation", onOrient, true);
      send({ t: "point", on: true });
      clearTimeout(sawTimer);
      sawTimer = setTimeout(function () {
        if (pointOn && !sawEvent) note(window.isSecureContext ? "The phone gave no motion data. Check Chrome's motion sensor permission." : "Point needs the remote opened from the QR code (https). This copy is on plain HTTP.");
      }, 900);
    };
    if (motionOk === true || !needsPermission()) { motionOk = true; go(); return; }
    DeviceOrientationEvent.requestPermission().then(function (r) { motionOk = r === "granted"; if (motionOk) go(); else note("Motion sensors are off for this page."); }, function () { note("Motion sensors are off for this page."); });
  }

  function releasePoint(why) {
    pointId = -1;
    if (!pointOn) return;
    pointOn = false;
    pointHeld = false;
    clearTimeout(sawTimer);
    window.removeEventListener("deviceorientation", onOrient, true);
    window.removeEventListener("devicemotion", onMotion, true);
    var wasSwipe = swipeEnd();   // may send a fling first
    pointBtn.classList.toggle("held", !!(S && S.point));
    send({ t: "point", on: false, why: typeof why === "string" ? why : "up", path: path(), n: aimN, ms: aimN > 1 ? Math.round((lastAim - aimFirst) / (aimN - 1)) : 0 });
    // double-tap Point: two short taps close together re-centre the pointer
    var now = performance.now();
    if (why === "up" && !wasSwipe && now - downAt < SHORT_TAP_MS) {
      if (now - lastShortTap < DOUBLE_TAP_MS) { lastShortTap = 0; vib(20); send({ t: "recenter" }); }
      else lastShortTap = now;
    }
    renderHead();
  }

  /* ---------- calibrate: aim at a lamp on each side of the TV ---------- */
  var calView = $("calview"), calStep = -1, calYaw = [0, 0], calHist = [], calRaw = null, calAcc = 0;
  function onCalOrient(e) {
    if (calStep < 0 || e.alpha == null || e.beta == null) return;
    var yaw = yawPitch(e)[0];
    calAcc = unwrap(calRaw, calAcc, yaw);
    calRaw = yaw;
    var t = performance.now();
    calHist.push([t, calAcc]);
    while (calHist.length && t - calHist[0][0] > 600) calHist.shift();
  }
  // the yaw just before the tap: the tap itself twists the phone
  function calSample() {
    var t = performance.now(), s = 0, n = 0;
    for (var i = 0; i < calHist.length; i++) {
      var dt = t - calHist[i][0];
      if (dt >= 60 && dt <= 300) { s += calHist[i][1]; n++; }
    }
    return n ? s / n : null;
  }
  function calShow(i) {
    calStep = i;
    $("calSide").textContent = i === 0 ? "left" : "right";
    send({ t: "calib", a: i === 0 ? "start" : "step", i: i });
  }
  function calEnd(cancelled) {
    if (calStep < 0) return;
    calStep = -1;
    calView.hidden = true;
    window.removeEventListener("deviceorientation", onCalOrient, true);
    if (cancelled) send({ t: "calib", a: "cancel" });
  }
  $("calBtn").addEventListener("click", function () {
    if (calStep >= 0) return;
    releasePoint("cal");
    calHist = []; calRaw = null; calAcc = 0;
    window.addEventListener("deviceorientation", onCalOrient, true);
    calView.hidden = false;
    calShow(0);
  });
  $("calHere").addEventListener("click", function () {
    if (calStep < 0) return;
    var y = calSample();
    if (y === null) { note(window.isSecureContext ? "The phone gave no motion data. Check Chrome's motion sensor permission." : "Calibrate needs the remote opened from the QR code."); calEnd(true); return; }
    vib(10);
    calYaw[calStep] = y;
    if (calStep === 0) { calShow(1); return; }
    var span = (calYaw[1] - calYaw[0]) * D2R;
    calEnd(false);
    send({ t: "calib", a: "done", span: +span.toFixed(5) });
  });
  $("calStop").addEventListener("click", function () { calEnd(true); });

  pointBtn.addEventListener("mousedown", function (e) { e.preventDefault(); });
  pointBtn.addEventListener("pointerdown", pointStart);
  pointBtn.addEventListener("pointerup", function () { releasePoint("up"); });
  pointBtn.addEventListener("pointercancel", function () { releasePoint("cancel"); });
  pointBtn.addEventListener("lostpointercapture", function () { releasePoint("lost"); });
  pointBtn.addEventListener("pointermove", swipeMove);
  // the browser must never take the hold over as a scroll or a long-press
  pointBtn.addEventListener("touchstart", function (e) { e.preventDefault(); }, { passive: false });
  pointBtn.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });

  // Click without letting go: while Point is held, a quick tap on any empty
  // part of the screen clicks at the pointer (OK does the same).
  (function () {
    var t0 = 0, x0 = 0, y0 = 0, pid = -1;
    document.addEventListener("pointerdown", function (e) {
      if (!pointOn || e.pointerId === pointId || e.target.closest("button,input,.tab,.scrub")) { pid = -1; return; }
      pid = e.pointerId; t0 = performance.now(); x0 = e.clientX; y0 = e.clientY;
    }, true);
    document.addEventListener("pointerup", function (e) {
      if (e.pointerId !== pid) return;
      pid = -1;
      if (pointOn && performance.now() - t0 < 250 && Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) < 14) { vib(10); send({ t: "tap", b: "left" }); }
    }, true);
  })();
  pointBtn.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && !e.repeat && !pointOn) { e.preventDefault(); pointStart({ button: 0, pointerId: 0, preventDefault: function () {} }); } });
  pointBtn.addEventListener("keyup", function () { releasePoint("key"); });

  /* ---------- left hand ---------- */
  var HAND_KEY = "tvmode.hand", handBtn = $("handBtn");
  function setHand(left, save) {
    app.setAttribute("data-hand", left ? "left" : "right");
    handBtn.setAttribute("aria-pressed", left ? "true" : "false");
    $("handHint").textContent = (left ? "On" : "Off") + ". Mirrors the header, Back, Home and Power";
    if (save) { try { localStorage.setItem(HAND_KEY, left ? "left" : "right"); } catch (e) {} }
  }
  var savedHand = ""; try { savedHand = localStorage.getItem(HAND_KEY) || ""; } catch (e) {}
  setHand(savedHand === "left", false);
  handBtn.addEventListener("click", function () { vib(10); setHand(app.getAttribute("data-hand") !== "left", true); });

  /* ---------- install on this phone (PWA) ---------- */
  var installBtn = $("installBtn"), installEv = null;
  var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  function paintInstall() {
    if (standalone) { installBtn.hidden = true; return; }
    installBtn.hidden = false;
    $("installHint").textContent = installEv ? "Opens straight from the home screen" : "Browser menu, then Add to Home screen";
  }
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEv = e; paintInstall(); });
  window.addEventListener("appinstalled", function () { standalone = true; installEv = null; paintInstall(); });
  installBtn.addEventListener("click", function () {
    vib(10);
    if (!installEv) return;
    var ev = installEv; installEv = null;
    ev.prompt();
    if (ev.userChoice) ev.userChoice.then(paintInstall, paintInstall);
  });
  paintInstall();
  // the shell is cached for an instant open; never the relay or anything with the token
  if ("serviceWorker" in navigator && window.isSecureContext && !demo) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(function () {}); });
  }

  /* ---------- standby: the PC is here but TV Mode is not running ---------- */
  var standEl = $("standby"), startBtn = $("startTv"), startTimer = 0;
  function showStandby(on) {
    if (!standEl || standEl.hidden === !on) return;
    standEl.hidden = !on;
    if (on) { startBtn.disabled = false; startBtn.textContent = "Start TV"; try { startBtn.focus({ preventScroll: true }); } catch (e) {} }
    else { clearTimeout(startTimer); }
  }
  function sendStart(label) {
    startBtn.disabled = true;
    startBtn.textContent = label;
    send({ t: "start" });   // acked like any press
    clearTimeout(startTimer);
    startTimer = setTimeout(function () { startBtn.disabled = false; startBtn.textContent = "Start TV"; }, 20000);
  }
  startBtn.addEventListener("click", function () { vib(25); sendStart("Starting"); });

  /* Auto-start: opening (or bringing to the foreground) this page while the PC is in
     standby starts the TV, once per opening. An "opening" is armed on load and whenever the
     page becomes visible; the FIRST state or standby frame after that decides it, and any
     frame uses the arm up. So a reconnect that keeps the page open (WebRTC flaps every
     ~20 s) never starts it, and neither does a standby frame that arrives because the
     desk switched back to Desk mode while this page was already open and showing the TV. */
  var autoArmed = !document.hidden && !demo, autoArmAt = Date.now();
  function autoStartOnOpen(isStandby) {
    var ok = autoArmed && Date.now() - autoArmAt < 30000;
    autoArmed = false;
    if (!ok || !isStandby || document.hidden) return;
    sendStart("Starting the TV…");
  }
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && !demo) { autoArmed = true; autoArmAt = Date.now(); }
  });

  /* ---------- share to TV: what another app shared goes to the PC's library ----------
     Sent once, after the first state (or standby: the library does not need the TV).
     The PC answers {"t":"saved"}; "Play on TV" then asks it to play that item. */
  var savedEl = $("saved"), savedTitle = $("savedTitle"), savedHint = $("savedHint"), savedPlay = $("savedPlay"), savedDone = $("savedDone");
  var savedId = "", savedTimer = 0;
  function showSaved(title, hint, canPlay) {
    savedTitle.textContent = title; savedHint.textContent = hint;
    savedPlay.hidden = !canPlay; savedDone.hidden = title === "Saving to TV";
    savedEl.hidden = false;
    if (canPlay) { try { savedPlay.focus({ preventScroll: true }); } catch (e) {} }
  }
  function shipShare() {
    if (!pendingShare) return;
    var s = pendingShare; pendingShare = null;
    savedId = "";
    showSaved("Saving to TV", "Just a moment.", false);
    send({ t: "save", url: s.url, title: s.title, text: s.text });
    clearTimeout(savedTimer);
    savedTimer = setTimeout(function () { showSaved("Not saved", "The PC did not answer. Try sharing it again.", false); }, 12000);
  }
  function gotSaved(m) {
    clearTimeout(savedTimer);
    if (savedEl.hidden) return;   // the view was closed (or this was not asked for here)
    if (!m.ok) { showSaved("Not saved", m.msg || "That did not work.", false); vib([20, 40, 20]); return; }
    savedId = m.id || "";
    vib(10);
    showSaved("Saved to TV", (m.dup ? "Already saved: " : "") + (m.title || "Link"), !!(m.playable && savedId));
  }
  savedPlay.addEventListener("click", function () {
    vib(20);
    if (savedId) send({ t: "openitem", k: "lib", key: savedId });
    savedEl.hidden = true;
  });
  savedDone.addEventListener("click", function () { savedEl.hidden = true; });

  /* ---------- phone Back closes an open panel, not the remote ----------
     Android's Back moves the browser back, which would leave the remote. While any
     panel or full-screen view (Add a phone, Calibrate, Saved) is open there is one extra history step; Back takes it and closes the panel.
     A panel closed any other way gives that step back, so history never piles up. */
  function closeSaved() { if (savedEl && !savedEl.hidden) savedEl.hidden = true; }
  function closeAll() { closeSheet(); closeDrawer(); psClose(); closeAdd(); calEnd(true); closeSaved(); }
  // Escape closes the full-screen views the way their own Done or Cancel does
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeAdd(); calEnd(true); closeSaved(); } });
  (function () {
    var panels = [sheet, drawer, ps, addEl, calView, savedEl];
    function anyOpen() { return panels.some(function (p) { return p && !p.hidden; }); }
    // a reload (self-update) keeps the old step's mark while every panel starts closed: clear it
    try { if (history.state && history.state.tvpanel) history.replaceState(null, "", location.href); } catch (e) {}
    function sync() {
      var marked = history.state && history.state.tvpanel;
      if (anyOpen() && !marked) {
        try { history.pushState({ tvpanel: 1 }, "", location.href); } catch (e) {}
      } else if (!anyOpen() && marked) {
        try { history.back(); } catch (e) {}
      }
    }
    window.addEventListener("popstate", function () {
      if (anyOpen()) closeAll();
    });
    var mo = new MutationObserver(function () { setTimeout(sync, 0); });
    panels.forEach(function (p) { if (p) mo.observe(p, { attributes: true, attributeFilter: ["hidden"] }); });
  })();
  /* ---------- demo ---------- */
  var demoCd = 0;
  function demoSend(o) {
    (window.tvsent = window.tvsent || []).push(o); // tests read what the pad sent
    if (o.t === "power" && !standEl.hidden) { // the Start TV screen's shutdown hold: a countdown without a state frame
      clearInterval(demoCd);
      if (o.a === "arm") { var c = 10; showCountdown(c); demoCd = setInterval(function () { if (--c > 0) showCountdown(c); else { clearInterval(demoCd); showCountdown(null); } }, 1000); }
      else showCountdown(null);
      return;
    }
    if (o.t === "save") { setTimeout(function () { onFrame(/\bfail\b/.test(o.url || "") ? { t: "saved", ok: false, msg: "That is not a web link." } : { t: "saved", ok: true, id: "yt:dQw4w9WgXcQ", title: o.title || "A video you shared from your phone", kind: "yt", playable: !/\bplain\b/.test(o.url || ""), dup: false }); }, 400); }
    if (o.t === "invite") { setTimeout(function () { onFrame({ t: "invite", url: location.origin + "/remote/#i=0123456789abcdef0123456789abcdef&p=" + (room || "0123456789abcdef0123456789abcdef") }); }, 200); return; }
    if (o.t === "pairtv") { if (o.a !== "hide") setTimeout(function () { onFrame({ t: "pairtv", ok: !/\bnotv\b/.test(location.search) }); }, 500); return; }
    if (o.t === "mood") { setTimeout(function () { onFrame({ t: "mood", m: o.m }); }, 150); return; }
    if (o.t === "media" && o.a === "subs") { setTimeout(function () { onFrame({ t: "tracks", app: "netflix", subs: [{ id: "0", label: "Off", on: true }, { id: "1", label: "English", on: false }, { id: "2", label: "English (CC)", on: false }, { id: "3", label: "Hindi", on: false }], audio: [{ id: "a1", label: "English [Original]", on: true }, { id: "a2", label: "Hindi", on: false }] }); }, 300); }
    if (o.t === "eps") { setTimeout(function () { var se = o.i || 3; onFrame({ t: "eps", list: { key: "tv42009", title: "Black Mirror", season: se, seasons: 7, nextSe: 3, nextEp: 5, svc: "netflix", eps: [1, 2, 3, 4, 5, 6].map(function (n) { return { n: n, name: ["Nosedive", "Playtest", "Shut Up and Dance", "San Junipero", "Men Against Fire", "Hated in the Nation"][n - 1], min: 60, pct: n < 5 ? 1 : n === 5 ? 0.4 : 0 }; }) } }); }, 300); }
    if (!S) return;
    var m = JSON.parse(JSON.stringify(S));
    if (o.t === "media" && (o.a === "playpause" || o.a === "play" || o.a === "pause") && m.media) m.media.playing = o.a === "play" ? true : o.a === "pause" ? false : !m.media.playing;
    else if (o.t === "vol") {
      if (o.a === "up") m.vol = Math.min(100, m.vol + 2); else if (o.a === "down") m.vol = Math.max(0, m.vol - 2); else m.muted = !m.muted;
    } else if (o.t === "sleep") m.sleepAt = o.min ? Date.now() + o.min * 60000 : null;
    else if (o.t === "power" && o.a === "arm") {
      m.countdown = 10; clearInterval(demoCd);
      demoCd = setInterval(function () { if (S.countdown > 0) { var n = JSON.parse(JSON.stringify(S)); n.countdown--; applyState(n); } else { clearInterval(demoCd); } }, 1000);
    } else if (o.t === "power" && o.a === "cancel") { clearInterval(demoCd); m.countdown = null; }
    else if (o.t === "scrub" && m.media) m.media.pos = Math.round(o.to * m.media.dur);
    else return;
    applyState(m);
  }

  /* ---------- a screen taller than the viewport ----------
     Big text or a zoomed page: the app column scrolls. Nearly every pixel is a control with
     touch-action:none, so while it overflows plain buttons let a finger pan (.tall); the pad,
     scrub, Point and Power never do. */
  (function () {
    var main = document.querySelector(".main");
    function chk() { app.classList.toggle("tall", app.scrollHeight > app.clientHeight + 2); }
    if (window.ResizeObserver) { var ro = new ResizeObserver(chk); ro.observe(main); ro.observe(app); }
    window.addEventListener("resize", chk);
    chk();
  })();

  /* ---------- go ---------- */
  renderHead();
  if (demo) {
    var d = q.get("demo");
    var st = { t: "state", app: "netflix", focus: 2, vol: 42, muted: false,
      media: { playing: true, pos: 4328, dur: 6510 }, sleepAt: Date.now() + 28 * 60000, countdown: null, phone: true, point: false };
    if (d === "launcher") { st.app = "launcher"; st.media = null; st.sleepAt = null; }
    if (d === "countdown") st.countdown = 7;
    applyState(st);
    if (d === "standby") showStandby(true);
    // preview the no-link states: ?demo&off (generic), &off=closed, &off=quiet, &off=quit, &off=stuck; ?demo&lost
    if (d === "off" || q.has("off")) {
      var w = q.get("off") || "";
      lastOkAt = Date.now() - 37 * 60000;
      if (w === "closed" || w === "quiet") offWhy = w;
      if (w === "quit") quitAt = Date.now() - 4 * 60000;
      if (w === "stuck") { pcHere = true; helloMiss = 3; setLink("stuck"); } else { pcHere = false; setLink("off"); }
    }
    else if (d === "unpaired" || q.has("unpaired")) { token = ""; invite = ""; setLink("unpaired"); }
    else if (d === "lost" || q.has("lost")) { lastOkAt = Date.now() - 2 * 60000; setLink("reconnecting"); }
    else setLink("ok");
    if (q.get("mode")) setMode(q.get("mode"));
    if (q.get("sheet") === "1") openSheet();
  } else {
    setLink("connecting");
    connect();
  }

  /* ---------- self-update: a remote left open picks up a new version by itself ----------
     It asks for the ETag of remote.js when the phone wakes the page and every 2 minutes.
     When it changed, the page reloads at the next quiet moment (no finger on the pad,
     no sheet open), so a deploy never leaves an old remote running. */
  (function () {
    if (demo || location.protocol === "file:") return;
    var seen = "", pending = false;
    function tag() {
      return fetch("remote.js", { method: "HEAD", cache: "no-store" }).then(function (r) { return r.ok ? r.headers.get("etag") || "" : ""; }).catch(function () { return ""; });
    }
    function quiet() { return !document.querySelector(".gpad.touch") && $("psheet").hidden && $("drawer").hidden && $("sheet").hidden; }
    function check() {
      tag().then(function (t) {
        if (!t) return;
        if (!seen) { seen = t; return; }
        if (t !== seen) pending = true;
        if (pending && quiet()) location.reload();
      });
    }
    check();
    setInterval(check, 120000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) check(); });
  })();
})();
