(function () {
  "use strict";

  var WS_URL = "ws://" + (location.host || "127.0.0.1:8770") + "/ws/screen";
  var APP_FOCUS = { jiohotstar: 0, prime: 1, netflix: 2, youtube: 3 };
  var SVC = { jiohotstar: "JioHotstar", prime: "Prime Video", netflix: "Netflix", youtube: "YouTube" };
  var EXACT = { jiohotstar: 1, prime: 1, netflix: 1 }; // apps TV Mode opens at the exact episode (Netflix: its public page names every episode)
  var MODES = ["all", "movie", "tv"];
  var MODE_WORD = { all: "", movie: "Movies", tv: "TV shows" };

  function $(id) { return document.getElementById(id); }
  var epsEl = $("eps"), etitle = $("etitle"), etabs = $("etabs"), egrid = $("egrid"), ehint = $("ehint");
  var searchEl = $("search"), sq = $("sq"), sgrid = $("sgrid"), shint = $("shint");
  var stage = $("stage"), flow = $("flow"), rowsEl = $("rows"), stagetxt = $("stagetxt"), sbg = $("sbg"), strailer = $("strailer"), panelEl = $("panel");
  var tiles = Array.prototype.slice.call(document.querySelectorAll(".tile"));
  var clockEl = $("clock"), dateEl = $("date"), sleepEl = $("sleep"), sleepSep = $("sleepSep"), phoneEl = $("phone"), phoneTxt = $("phoneTxt"), downN = $("downN"), qrEl = $("qr");

  var q = new URLSearchParams(location.search);
  var demoParam = q.get("demo"), demoOn = q.has("demo"); // ?demo with no value is still the demo

  var st = { focus: 1, phone: true, sleepAt: null, countdown: null };
  var everPhone = false, pairUrl = null, phoneWhenPairShown = false;
  var connected = false, ws = null, tries = 0, retryTimer = 0, isDemo = false, view = "";

  var data = { hero: {}, cont: [], shelves: [] };
  var mode = "all";
  var rows = [];                 // built rows: { id, el, inner, cards, items, h2 }
  var pills = [];
  var sel = { id: "hero", col: 0, mem: {} };

  function two(n) { return n < 10 ? "0" + n : String(n); }
  function modeIdx() { return MODES.indexOf(mode); }
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

  /* ---------- clock, status ---------- */
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function renderClock() {
    var d = new Date();
    var t = two(d.getHours()) + ":" + two(d.getMinutes());
    if (clockEl.textContent !== t) clockEl.textContent = t;
    var ds = DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()];
    if (dateEl.textContent !== ds) dateEl.textContent = ds;
    if (st.sleepAt) {
      var m = Math.max(1, Math.ceil((st.sleepAt - Date.now()) / 60000));
      sleepEl.textContent = "Sleep " + m + " min";
      sleepEl.hidden = false; sleepSep.hidden = false;
    } else { sleepEl.hidden = true; sleepSep.hidden = true; }
  }
  function renderPhone() {
    if (st.phone) { phoneTxt.textContent = "Phone on"; phoneEl.className = ""; }
    else { phoneTxt.textContent = "No phone"; phoneEl.className = "lost"; }
  }

  /* ---------- pairing ---------- */
  function showQr(url) {
    try {
      var qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      qrEl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) { qrEl.textContent = url; }
  }

  function render() {
    renderClock();
    renderPhone();
    var next = st.countdown != null ? "down" : pairUrl ? "pair" : "launcher";
    if (next !== view) { view = next; stage.setAttribute("data-view", next); if (next === "launcher") changed(); }
    if (next === "down") downN.textContent = String(st.countdown);
  }
  function setPair(url) {
    if (url) { if (url !== pairUrl) showQr(url); phoneWhenPairShown = st.phone; }
    pairUrl = url || null;
    render();
  }
  function onState(m) {
    var f = typeof m.focus === "number" ? m.focus : (m.app in APP_FOCUS ? APP_FOCUS[m.app] : st.focus);
    st.focus = Math.max(0, Math.min(3, f));
    if (sel.id === "svc") sel.col = st.focus + 1;
    st.phone = !!m.phone;
    st.sleepAt = m.sleepAt || null;
    st.countdown = typeof m.countdown === "number" ? m.countdown : null;
    if (st.phone) { everPhone = true; if (pairUrl && !phoneWhenPairShown) pairUrl = null; }
    render();
    if (view === "launcher") paint();
  }

  /* ---------- numbers and words ---------- */
  function compact(n) { return n >= 10000 ? Math.round(n / 1000) + "k" : n >= 1000 ? (n / 1000).toFixed(1).replace(".0", "") + "k" : String(n); }
  function leftText(min) { return (min > 60 ? runtimeText(min) : min + " min") + " left"; }
  function runtimeText(min) { if (!min) return ""; var h = Math.floor(min / 60), m = min % 60; return h ? h + "h" + (m ? " " + m + "m" : "") : m + "m"; }
  function svcName(s) { return SVC[s] || ""; }
  // "Open in Prime Video" shows Prime's own wordmark (the tile's) for the name; the words stay for screen readers
  function logoize(btn, svc) {
    var name = svcName(svc), t = btn.lastChild, tile = document.querySelector("#svc [data-svc=\"" + svc + "\"] svg");
    if (!name || !tile || !t || t.nodeType !== 3 || t.textContent.slice(-name.length) !== name) return;
    btn.setAttribute("aria-label", t.textContent.replace(/^OK/, ""));
    t.textContent = t.textContent.slice(0, -name.length).replace(/s+$/, "");
    var lg = tile.cloneNode(true); lg.setAttribute("class", "alogo"); lg.setAttribute("aria-hidden", "true");
    btn.appendChild(lg);
  }
  function parseKey(k) { var m = /^(movie|tv)(\d+)$/.exec(k || ""); return m ? { type: m[1], id: +m[2] } : null; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /* ---------- details (TMDB through Go), cached ---------- */
  var detCache = {}, detPending = {};
  function getDetails(key) {
    if (detCache[key]) return Promise.resolve(detCache[key]);
    var p = parseKey(key);
    if (!p || isDemo) return Promise.resolve(null);
    if (detPending[key]) return detPending[key];
    detPending[key] = fetch("/api/title?id=" + p.id + "&type=" + p.type).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      delete detPending[key]; if (d) detCache[key] = d; return d;
    }).catch(function () { delete detPending[key]; return null; });
    return detPending[key];
  }

  function recent(dateStr, days) {
    if (!dateStr) return false;
    var t = Date.parse(dateStr);
    return !isNaN(t) && Date.now() - t < days * 86400000 && t - Date.now() < 7 * 86400000;
  }

  // the line of facts: rating, age box, year, genres, runtime or seasons
  function factsNode(item, d, noRating) {
    var box = el("div", "facts"), n = 0;
    function part(node) { if (n++) box.appendChild(el("span", "sep")); box.appendChild(node); }
    var vote = d ? d.rating : item.vote, votes = d ? d.votes : item.votes;
    if (vote && !noRating) {
      if (votes >= 50) { var r = el("span", "rate", vote.toFixed(1)); r.appendChild(el("small", null, compact(votes) + " ratings")); part(r); }
      else part(el("span", "muted", "Too new to rate"));
    }
    if (d && d.cert) part(el("span", "age", d.cert));
    var year = item.year || "";
    if (year) part(el("span", null, year));
    var genres = (d && d.genres && d.genres.length ? d.genres : item.genres || []).slice(0, 2);
    genres.forEach(function (g) { part(el("span", null, g)); });
    var kind = item.kind || (d && d.type) || "";
    if (d) {
      if (kind === "tv") {
        if (d.seasons) part(el("span", null, d.seasons + (d.seasons === 1 ? " season" : " seasons") + (mode === "tv" && d.episodes ? ", " + d.episodes + " episodes" : "")));
        if (recent(d.lastAir, 14) || recent(d.nextAir, 7)) part(el("span", "new", "New episode"));
      } else if (d.runtime) part(el("span", null, runtimeText(d.runtime)));
    }
    return n ? box : null;
  }

  function whyWatch(item, d) {
    if (!d) return "";
    if (d.tagline && d.tagline.length < 90) return d.tagline;
    var g = (d.genres && d.genres[0]) || "";
    var s = (g ? g + " " : "") + (item.kind === "tv" ? "series" : "movie");
    if (item.year) s += " from " + item.year;
    if (d.cast && d.cast.length) s += ", with " + d.cast.slice(0, 2).join(" and ");
    s += ".";
    s += d.votes >= 50 ? " Rated " + d.rating.toFixed(1) + " by " + compact(d.votes) + " people." : " Too new to rate.";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ---------- stage ---------- */
  var bdA = null, bdB = null, bdFront = null, bdSrc = "";
  function setStageImg(src) {
    if (src === bdSrc) return;
    bdSrc = src;
    if (!bdA) { bdA = el("img", "bd"); bdB = el("img", "bd"); bdA.alt = bdB.alt = ""; sbg.insertBefore(bdB, sbg.firstChild); sbg.insertBefore(bdA, sbg.firstChild); bdFront = bdB; }
    var back = bdFront === bdA ? bdB : bdA;
    if (!src) { bdA.classList.remove("on"); bdB.classList.remove("on"); return; }
    back.onload = function () { back.classList.add("on"); bdFront.classList.remove("on"); bdFront = back; };
    back.src = src;
  }
  var trailTimer = 0, trailFor = "";
  function stageTrailer(key) {
    clearTimeout(trailTimer); trailTimer = 0;
    if (trailFor === key) return;
    trailFor = key;
    strailer.classList.remove("on");
    while (strailer.firstChild) strailer.removeChild(strailer.firstChild);
    if (!key || isDemo) return;
    trailTimer = setTimeout(function () {
      fetch("/api/preview?key=" + encodeURIComponent(key)).then(function (r) { return r.json(); }).then(function (j) {
        if (trailFor !== key || !j.key || view !== "launcher" || panel.open) return;
        strailer.appendChild(trailerFrame(j.key, true));
        strailer.classList.add("on");
      }).catch(function () {});
    }, 3000);
  }
  // A trailer whose owner blocks embedding shows YouTube's blank player (a white-edged
  // box, 2026-11-04). The player says over postMessage when it really plays; if it
  // never does within 8 s, the frame goes and the poster stays.
  var ytFrames = [];
  window.addEventListener("message", function (e) {
    if (!/youtube(-nocookie)?\.com$/.test((e.origin || "").replace(/^https:\/\/(www\.)?/, ""))) return;
    var d; try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch (x) { return; }
    var st = d && d.info && d.info.playerState, err = d && d.event === "onError";
    ytFrames.forEach(function (f) { if (f.contentWindow === e.source) { if (st === 1) f.tvPlaying = true; if (err) dropTrailer(f); } });
  });
  function dropTrailer(f) {
    var box = f.parentNode;
    if (!box) return;
    box.removeChild(f);
    if (!box.querySelector("iframe")) box.classList.remove("on");
  }
  function trailerFrame(yt, muted) {
    var f = document.createElement("iframe");
    f.setAttribute("allow", "autoplay; encrypted-media; fullscreen");
    f.setAttribute("tabindex", "-1");
    f.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(yt) + "?autoplay=1&mute=" + (muted ? 1 : 0) + "&controls=0&loop=1&playlist=" + encodeURIComponent(yt) + "&modestbranding=1&rel=0&playsinline=1&disablekb=1&fs=0&iv_load_policy=3&enablejsapi=1&origin=" + encodeURIComponent(location.origin);
    f.addEventListener("load", function () {
      try { f.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*"); } catch (x) {}
    });
    ytFrames = ytFrames.filter(function (x) { return x.isConnected; }); ytFrames.push(f);
    setTimeout(function () { if (f.isConnected && !f.tvPlaying) dropTrailer(f); }, 8000);
    return f;
  }

  // A festival slide or shelf card: the banner takes the festival's warm light and the
  // kicker gets a small mark (a diya for Diwali, a spark for the rest).
  function occFor(occ) { if (occ) { sbg.setAttribute("data-occ", occ); stagetxt.setAttribute("data-occ", occ); } else { sbg.removeAttribute("data-occ"); stagetxt.removeAttribute("data-occ"); } }
  function occMark(occ) {
    var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), p = document.createElementNS(ns, "path");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "omark"); s.setAttribute("aria-hidden", "true");
    p.setAttribute("d", /diwali|dhanteras|bhai|deepavali/.test(occ || "")
      ? "M12 2c1.8 2.6 2.7 4.6 2.7 6.1A2.7 2.7 0 0 1 12 10.8a2.7 2.7 0 0 1-2.7-2.7C9.3 6.6 10.2 4.6 12 2zM2.5 13h19c-.6 4.3-4.6 7.5-9.5 7.5S3.1 17.3 2.5 13z"
      : "M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z");
    s.appendChild(p); return s;
  }
  function clearStage() { tintFor(null); occFor(null); while (stagetxt.firstChild) stagetxt.removeChild(stagetxt.firstChild); }
  // the banner carries a faint wash of the service's colour, a hint of where it plays
  function tintFor(svc) { if (svc) sbg.setAttribute("data-svc", svc); else sbg.removeAttribute("data-svc"); }
  function kicker(parts) { return el("div", "kick", parts.filter(Boolean).join("  ·  ")); }
  function action(label, alt) {
    var a = el("div", "act glow" + (alt ? " alt" : ""));
    a.appendChild(el("span", "ok", "OK"));
    a.appendChild(document.createTextNode(label));
    return a;
  }

  var heroIdx = 0;
  // at most 5 slides: Continue or Up next, tonight's pick, the occasion, then two more
  function heroList() {
    var l = (data.hero && (data.hero[mode] || data.hero.all)) || [];
    var out = [], used = {};
    function take(f) { for (var i = 0; i < l.length; i++) if (!used[i] && f(l[i])) { used[i] = 1; out.push(l[i]); return; } }
    take(function (h) { return h.k === "cont"; });
    take(function (h) { return h.k === "next"; });
    take(function (h) { return h.k === "pick" && !h.occ; });
    take(function (h) { return !!h.occ; });
    for (var j = 0; j < l.length && out.length < 5; j++) if (!used[j]) { used[j] = 1; out.push(l[j]); }
    return out.slice(0, 5);
  }
  // first card of the first recommendation shelf (not Continue, Saved or More shelves); with a service, the first of that service
  function topPick(svc) {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]; if (r.id === "cont" || r.id === "saved" || r.id === "more") continue;
      for (var j = 0; j < r.items.length; j++) { var it = r.items[j]; if (it && it.key && (!svc || it.service === svc)) return it; }
      if (!svc) return null;
    }
    return null;
  }
  // no slides at all: the shelves' first pick stands in, so the stage is never empty
  function heroModel() {
    var l = heroList();
    if (l.length) return l[Math.min(heroIdx, Math.max(0, l.length - 1))];
    var t = topPick(""); if (!t) return null;
    return { k: "pick", service: t.service, title: t.title, img: t.img, key: t.key, kind: t.kind, year: t.year, genres: t.genres, vote: t.vote, votes: t.votes, why: t.why };
  }
  // a pick as a card-like item, for the details panel
  function heroItem(h) { return { key: h.key, title: h.title, service: h.service, img: h.img, kind: h.kind, year: h.year, vote: h.vote, votes: h.votes, genres: h.genres, why: h.why, occ: h.occ, occWord: h.kick }; }
  function heroStep(d) {
    var l = heroList(); if (l.length < 2) return;
    heroIdx = (heroIdx + d + l.length) % l.length;
    stagetxt.style.setProperty("opacity", "0");
    setTimeout(function () { stagetxt.style.setProperty("opacity", "1"); if (view === "launcher") renderStage(); }, 150);
    renderHeroNav();
    setStageImg(l[heroIdx].img);
  }
  // position "3 / 15", a thin track, and a strip of the next three picks
  var hnav = null;
  function renderHeroNav() {
    var l = heroList();
    if (!hnav) { hnav = el("div", "hnav"); stage.insertBefore(hnav, flow); }
    while (hnav.firstChild) hnav.removeChild(hnav.firstChild);
    var show = sel.id === "hero";
    hnav.style.setProperty("opacity", show && l.length > 1 ? "1" : "0");
    hnav.setAttribute("aria-hidden", show && l.length > 1 ? "false" : "true");
    if (l.length < 2) return;
    var peek = el("div", "hpeek");
    for (var k = 1; k <= 3 && k < l.length; k++) {
      var t = l[(heroIdx + k) % l.length], d = el("div", "pk");
      if (t.thumb) { var im = el("img"); im.alt = ""; im.src = t.thumb; d.appendChild(im); }
      d.appendChild(el("span", null, t.title));
      peek.appendChild(d);
    }
    hnav.appendChild(peek);
    var pos = el("div", "hpos");
    pos.appendChild(el("span", null, (heroIdx + 1) + " / " + l.length));
    var tr = el("div", "htrack"), fi = el("i"); fi.style.setProperty("width", Math.round((heroIdx + 1) / l.length * 100) + "%"); tr.appendChild(fi); pos.appendChild(tr);
    hnav.appendChild(pos);
  }

  function renderHero() {
    clearStage();
    var h = heroModel();
    if (!h) {
      stagetxt.appendChild(el("div", "kick", "Nothing here yet"));
      stagetxt.appendChild(el("div", "ttl", "Picks appear once the shelves load"));
      setStageImg(""); stageTrailer("");
      return;
    }
    setStageImg(h.img);
    var svc = svcName(h.service);
    tintFor(h.service);
    if (h.k === "cont") {
      stagetxt.appendChild(kicker(["Continue watching", svc]));
      stagetxt.appendChild(el("div", "ttl", h.title));
      if (h.sub) stagetxt.appendChild(el("div", "meta", h.sub));
      var pr = el("div", "prog"), bar = el("div", "bar"), fi = el("i");
      fi.style.setProperty("width", Math.round((h.pct || 0) * 100) + "%");
      bar.appendChild(fi); pr.appendChild(bar);
      if (h.left) pr.appendChild(el("span", null, leftText(h.left)));
      stagetxt.appendChild(pr);
      var a = action("Resume"); a.setAttribute("data-svc", h.service); a.classList.toggle("on", sel.id === "hero"); stagetxt.appendChild(a);
      if (h.stopped) stagetxt.appendChild(el("div", "hint", "You stopped " + h.stopped));
      stageTrailer("");
    } else if (h.k === "next") {
      // the episode after one he finished: one press plays it
      stagetxt.appendChild(kicker([h.kick || "Up next", svc]));
      stagetxt.appendChild(el("div", "ttl", h.title));
      if (h.sub) stagetxt.appendChild(el("div", "meta", h.sub));
      if (h.why) stagetxt.appendChild(el("div", "why", h.why));
      if (h.over) stagetxt.appendChild(el("div", "over", h.over));
      var n = action("Play S" + h.se + " E" + h.ep); n.setAttribute("data-svc", h.service); logoize(n, h.service); n.classList.toggle("on", sel.id === "hero"); stagetxt.appendChild(n);
      stageTrailer("");
    } else {
      // an occasion slide brings its own word (DIWALI WEEK); a plain pick keeps the mode words
      var hk = kicker(h.kick ? [h.kick, svc] : [MODE_WORD[mode], "Tonight's pick", svc]);
      if (h.occ) { occFor(h.occ); hk.insertBefore(occMark(h.occ), hk.firstChild); }
      stagetxt.appendChild(hk);
      stagetxt.appendChild(el("div", "ttl", h.title));
      var f = factsNode({ year: h.year, genres: h.genres, kind: h.kind, vote: h.vote, votes: h.votes }, null);
      if (f) stagetxt.appendChild(f);
      if (h.why) stagetxt.appendChild(el("div", "why", h.why));
      if (h.over) stagetxt.appendChild(el("div", "over", h.over));
      var b = action("Open in " + svc); b.setAttribute("data-svc", h.service); logoize(b, h.service); b.classList.toggle("on", sel.id === "hero"); stagetxt.appendChild(b);
      stageTrailer(""); // a hero trailer can be embed-blocked and show an error card: previews play on row cards only
    }
    if (sel.id === "hero" && heroList().length > 1) stagetxt.appendChild(el("div", "hint nav", "Left and right for more picks"));
    renderHeroNav();
  }

  var detTimer = 0;
  function renderCard(item, cont) {
    clearStage();
    renderHeroNav();
    setStageImg(item.shelf ? item.top || "" : item.img || "");
    var svc = svcName(item.service);
    tintFor(item.service);
    if (item.shelf) { // a "More shelves" card: a shelf name, a count and a taste of what is in it
      stagetxt.appendChild(kicker(["More shelves"]));
      stagetxt.appendChild(el("div", "ttl", item.title));
      var fact = item.n + (item.n === 1 ? " title" : " titles") + (item.names && item.names.length ? " · " + item.names.join(", ") + (item.n > item.names.length ? " and more" : "") : "");
      stagetxt.appendChild(el("div", "why", fact));
      stagetxt.appendChild(el("div", "hint", "OK to open this shelf"));
      stageTrailer("");
      return;
    }
    if (cont) {
      stagetxt.appendChild(kicker(["Continue watching", svc]));
      stagetxt.appendChild(el("div", "ttl", item.title));
      if (item.line) stagetxt.appendChild(el("div", "meta", item.line));
      var pr = el("div", "prog"), bar = el("div", "bar"), fi = el("i");
      fi.style.setProperty("width", Math.round((item.pct || 0) * 100) + "%");
      bar.appendChild(fi); pr.appendChild(bar);
      if (item.left) pr.appendChild(el("span", null, leftText(item.left)));
      stagetxt.appendChild(pr);
      stagetxt.appendChild(el("div", "hint", "OK to resume in " + svc));
      stageTrailer("");
      return;
    }
    if (item.lib && !item.key) { // a Saved card: OK plays it, no details panel and no trailer to fetch
      stagetxt.appendChild(kicker(["Saved", svc]));
      stagetxt.appendChild(el("div", "ttl", item.title));
      if (item.line) stagetxt.appendChild(el("div", "meta", item.line));
      stagetxt.appendChild(el("div", "hint", "OK to play"));
      stageTrailer("");
      return;
    }
    var ck = kicker(["On " + svc, item.why]);
    if (item.occ) { occFor(item.occ); ck.insertBefore(occMark(item.occ), ck.firstChild); }
    stagetxt.appendChild(ck);
    stagetxt.appendChild(el("div", "ttl", item.title));
    var key = item.key, f = factsNode(item, detCache[key]);
    if (f) stagetxt.appendChild(f);
    var w = item.occ && item.line ? item.line : whyWatch(item, detCache[key]); // a themed shelf says its own line
    if (w) stagetxt.appendChild(el("div", "why", w));
    var ov = detCache[key] && detCache[key].overview;
    if (ov) stagetxt.appendChild(el("div", "over", ov));
    stagetxt.appendChild(el("div", "hint", "OK to see details"));
    stageTrailer(key);
    if (!detCache[key]) {
      clearTimeout(detTimer);
      detTimer = setTimeout(function () {
        getDetails(key).then(function (d) {
          if (d && curItem() === item && !panel.open) renderCard(item, false);
          prefetchNeighbours();
        });
      }, 300);
    }
  }

  function curRow() { for (var i = 0; i < rows.length; i++) if (rows[i].id === sel.id) return rows[i]; return null; }
  function curItem() { var r = curRow(); return r ? r.items[sel.col] : null; }
  function prefetchNeighbours() {
    var r = curRow(); if (!r) return;
    [sel.col + 1, sel.col - 1].forEach(function (i) { var it = r.items[i]; if (it && it.key) getDetails(it.key); });
  }

  function renderStage() {
    if (view !== "launcher") return;
    var r = curRow();
    if (r && r.items[sel.col]) renderCard(r.items[sel.col], r.id === "cont");
    else if (sel.id === "svc") renderSvc();
    else if (sel.id === "filter") renderFilter();
    else renderHero();
  }
  // the stage on the Search tile or a service tile: what OK does there, not the hero
  var SVC_AT = ["", "jiohotstar", "prime", "netflix", "youtube"];
  function renderSvc() {
    clearStage(); renderHeroNav(); stageTrailer("");
    if (sel.col === 0) {
      setStageImg("");
      stagetxt.appendChild(kicker(["Search"]));
      stagetxt.appendChild(el("div", "ttl", "Find a movie or show"));
      stagetxt.appendChild(el("div", "hint", "OK to search · or type on your phone"));
      return;
    }
    var svc = SVC_AT[sel.col] || "", name = svcName(svc);
    var last = (data.cont || []).filter(function (c) { return c.service === svc; })[0];
    tintFor(svc);
    setStageImg(last && last.img ? last.img : "");
    stagetxt.appendChild(kicker(["Open app"]));
    stagetxt.appendChild(el("div", "ttl", name));
    var tp = last ? null : topPick(svc);
    if (last) stagetxt.appendChild(el("div", "over", "Continue: " + last.title + (last.line ? " · " + last.line : "")));
    else if (tp) stagetxt.appendChild(el("div", "over", "Top pick: " + tp.title));
    stagetxt.appendChild(el("div", "hint", "OK to open " + name));
  }
  function renderFilter() {
    clearStage(); renderHeroNav(); stageTrailer(""); setStageImg("");
    var m = MODES[sel.col] || mode;
    stagetxt.appendChild(kicker(["Show"]));
    stagetxt.appendChild(el("div", "ttl", m === "movie" ? "Movies" : m === "tv" ? "TV shows" : "Everything"));
    stagetxt.appendChild(el("div", "over", m === "movie" ? "Only movies, every row" : m === "tv" ? "Only TV shows, every row" : "Movies and TV shows, every row"));
    if (m !== mode) stagetxt.appendChild(el("div", "hint", "OK to filter"));
  }

  /* ---------- rows ---------- */
  function visibleItems(shelf) {
    var l = (shelf.items || []).filter(function (it) { return mode === "all" || it.kind === mode; });
    l.sort(function (a, b) { return (b.ord || 0) - (a.ord || 0); });
    return l;
  }

  /* ---------- endless rows: 8 cards from the end, ask Go for the row's next page ---------- */
  var more = {}; // shelf id -> { page, busy, done }
  function wantMore(r) {
    if (!r || r.id === "cont" || r.id === "saved" || r.id === "because" || r.id === "more") return;
    var m = more[r.id] || (more[r.id] = { page: 1, busy: false, done: false });
    if (m.busy || m.done || sel.col < r.items.length - 8) return; // early enough that the cards are there before you are
    m.busy = true;
    send({ t: "more", key: r.id, i: m.page + 1 });
  }
  function gotMore(msg) {
    var m = more[msg.id];
    if (!m || msg.page !== m.page + 1) return;
    m.busy = false; m.page = msg.page;
    var items = msg.items || [];
    if (!items.length) { m.done = true; return; }
    var shelf = (data.shelves || []).find(function (x) { return x.id === msg.id; });
    if (!shelf) return;
    var have = {}; shelf.items.forEach(function (it) { have[it.key] = 1; });
    var low = shelf.items.reduce(function (lo, it) { return Math.min(lo, it.ord || 0); }, 0);
    var r = rows.find(function (x) { return x.id === msg.id; });
    items.forEach(function (it, i) {
      if (have[it.key]) return;
      it.ord = low - 1 - i; // after everything already there: focus never shifts
      shelf.items.push(it);
      if (r && (mode === "all" || it.kind === mode)) {
        var c = buildCard(it, r.id, r.items.length);
        r.inner.appendChild(c); r.cards.push(c); r.items.push(it);
      }
    });
    if (r && sel.id === r.id) { r.cards.forEach(loadImg); wantMore(r); } // still near the end: keep going
    paint();
  }

  function buildCard(it, rowId, i) {
    var mos = it.thumbs && it.thumbs.length, c = el("button", "card" + (it.img || mos ? "" : " noimg"));
    c.type = "button";
    c.setAttribute("data-svc", it.service || "");
    c.setAttribute("aria-label", it.title);
    c.setAttribute("data-img", it.img || "");
    if (it.img) { var w = el("div", "imgw"); c.appendChild(w); }
    if (mos) { // a shelf: the first four posters, loaded with the card
      var mw = el("div", "mos");
      it.thumbs.slice(0, 4).forEach(function (src) { var im = el("img"); im.alt = ""; im.decoding = "async"; im.src = src; im.onerror = function () { im.remove(); }; mw.appendChild(im); });
      c.appendChild(mw);
    }
    c.appendChild(el("div", "fade"));
    c.appendChild(el("div", "ct", it.title));
    if (it.shelf) c.appendChild(el("div", "cn", it.n + (it.n === 1 ? " title" : " titles")));
    if (rowId === "cont") {
      if (it.pct > 0) { var pg = el("div", "pg"), fi = el("i"); fi.style.setProperty("width", Math.round(it.pct * 100) + "%"); pg.appendChild(fi); c.appendChild(pg); }
    } else if (it.vote && it.votes >= 50) c.appendChild(el("div", "badge", it.vote.toFixed(1)));
    c.addEventListener("click", function () { if (view !== "launcher") return; sel.id = rowId; sel.col = i; changed(); activate(); });
    return c;
  }

  function loadImg(c) {
    if (c.getAttribute("data-loaded")) return;
    c.setAttribute("data-loaded", "1");
    var src = c.getAttribute("data-img"), w = c.querySelector(".imgw");
    if (!src || !w) return;
    var im = document.createElement("img"); im.alt = ""; im.decoding = "async";
    var retried = false;
    im.onerror = function () { if (!retried) { retried = true; setTimeout(function () { im.src = src + "?r=1"; }, 1500); } else { im.remove(); c.classList.add("noimg"); } };
    im.src = src;
    w.appendChild(im);
  }
  function loadNear() {
    var at = rows.findIndex(function (r) { return r.id === sel.id; });
    if (at < 0) at = 0;
    rows.forEach(function (r, k) { if (k >= at - 1 && k <= at + 2) r.cards.forEach(loadImg); });
  }

  function makeRow(id, title, items, first) {
    var sec = el("section", "row" + (first ? " first" : ""));
    sec.setAttribute("data-id", id);
    var head = el("div", "rowhead");
    if (first) {
      var pw = el("div", "pills"); pills = [];
      var names = ["All", "Movies", "TV shows"];
      MODES.forEach(function (m, i) {
        var p = el("button", "pill glow", names[i]); p.type = "button";
        p.addEventListener("click", function () { if (view === "launcher") { sel.id = "filter"; sel.col = i; setMode(m); } });
        pills.push(p); pw.appendChild(p);
      });
      head.appendChild(pw);
    }
    var h2 = el("h2", null, title); head.appendChild(h2);
    if (/^occ-/.test(id)) { sec.setAttribute("data-occ", id.slice(4)); h2.insertBefore(occMark(id.slice(4)), h2.firstChild); }
    sec.appendChild(head);
    var tr = el("div", "track"), inner = el("div", "rin"); tr.appendChild(inner); sec.appendChild(tr);
    var cards = items.map(function (it, i) { var c = buildCard(it, id, i); inner.appendChild(c); return c; });
    rowsEl.appendChild(sec);
    return { id: id, el: sec, inner: inner, cards: cards, items: items, h2: h2, first: first };
  }

  // the TV shows about 10 rows, in this order; the rest wait on "More shelves"
  function shelfRank(id) {
    if (id === "because") return 0;
    if (/^occ-/.test(id)) return 1;
    if (id === "otd") return 2;
    if (id === "fy") return 3;
    if (id === "top") return 4;
    if (id === "new") return 5;
    if (/^fy/.test(id)) return 6; // "For you, with a touch of X"
    return -1;
  }
  var opened = []; // shelves opened from More shelves, kept until new rows arrive
  function openShelf(id) {
    if (opened.indexOf(id) < 0) opened.push(id);
    buildRows();
    sel.id = id; sel.col = 0;
    changed();
  }
  function normT(t) { return String(t || "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function buildRows() {
    while (rowsEl.firstChild) rowsEl.removeChild(rowsEl.firstChild);
    rows = []; pills = [];
    // Continue watching: never the hero's own title, and each title once
    var heroT = {};
    heroList().forEach(function (h) { if (h.k === "cont" || h.k === "next") heroT[normT(h.title)] = 1; });
    var seenT = {};
    var cont = (data.cont || []).filter(function (c) {
      var k = normT(c.title);
      if (heroT[k] || seenT[k]) return false;
      seenT[k] = 1; return true;
    });
    if (cont.length >= 2) rows.push(makeRow("cont", "Continue watching", cont, false));
    var saved = data.saved || []; // the library's Saved row: phone shares and desk pastes (Go sends it only with 2+)
    if (saved.length >= 2) rows.push(makeRow("saved", "Saved", saved, false));
    var mi = modeIdx(), firstRec = true, main = [], rest = [], touches = 0;
    (data.shelves || []).forEach(function (s, n) {
      var items = visibleItems(s);
      if (items.length < 4) return;
      var rk = shelfRank(s.id), pack = { s: s, items: items, rk: rk, n: n };
      if (opened.indexOf(s.id) >= 0) pack.rk = 7; // opened from More shelves: it stays, after the main rows
      else if (rk < 0 || (rk === 6 && ++touches > 2)) { rest.push(pack); return; }
      main.push(pack);
    });
    main.sort(function (a, b) { return a.rk - b.rk || a.n - b.n; });
    function title(s) { return (s.titles && s.titles[mi]) || s.title; }
    main.forEach(function (p) {
      rows.push(makeRow(p.s.id, title(p.s), p.items, firstRec));
      firstRec = false;
    });
    if (rest.length) {
      rest.sort(function (a, b) { return (a.rk === 6 ? 1 : 0) - (b.rk === 6 ? 1 : 0) || a.n - b.n; }); // "For you, with a touch of ..." last
      var cards = rest.map(function (p) {
        var its = p.items;
        return { title: title(p.s), shelf: p.s.id, service: "", img: "", kind: "", key: "", n: its.length, top: its[0].img || "", thumbs: its.slice(0, 4).map(function (x) { return x.img; }).filter(Boolean), names: its.slice(0, 3).map(function (x) { return x.title; }) };
      });
      rows.push(makeRow("more", "More shelves", cards, firstRec));
    }
  }

  function navIds() {
    var ids = ["hero", "svc"];
    rows.forEach(function (r) { if (r.id === "cont" || r.id === "saved") ids.push(r.id); });
    if (pills.length) ids.push("filter");
    rows.forEach(function (r) { if (r.id !== "cont" && r.id !== "saved") ids.push(r.id); });
    return ids;
  }

  function setRows(m) {
    data = { hero: m.hero || {}, cont: m.cont || [], saved: m.saved || [], shelves: m.shelves || [] };
    heroIdx = 0; opened = [];
    buildRows();
    if (navIds().indexOf(sel.id) < 0) { sel.id = "svc"; sel.col = st.focus + 1; }
    changed();
  }

  function setMode(m) {
    if (m === mode) return;
    mode = m;
    heroIdx = 0;
    rowsEl.style.setProperty("transition", "opacity 200ms cubic-bezier(0,0,.2,1)");
    rowsEl.style.setProperty("opacity", "0");
    setTimeout(function () {
      buildRows();
      if (navIds().indexOf(sel.id) < 0) { sel.id = pills.length ? "filter" : "svc"; sel.col = modeIdx(); }
      changed();
      rowsEl.style.setProperty("opacity", "1");
    }, 200);
    changed();
  }

  /* ---------- paint: classes, scroll, stage ---------- */
  function paint() {
    if (view !== "launcher") return;
    var id = sel.id;
    var top = id === "hero" || id === "svc" || id === "filter";
    stage.setAttribute("data-top", top ? "1" : "0");
    stage.setAttribute("data-sel", id === "hero" ? "hero" : "other"); // off the hero, its OK button goes quiet
    tiles.forEach(function (t, i) { t.classList.toggle("on", id === "svc" && i === sel.col); });
    pills.forEach(function (p, i) { p.classList.toggle("sel", MODES[i] === mode); p.classList.toggle("on", id === "filter" && i === sel.col); p.setAttribute("aria-pressed", MODES[i] === mode ? "true" : "false"); });
    var at = rows.findIndex(function (r) { return r.id === id; });
    // on the filter, the first recommendation row (whose head holds the pills) is pinned where a
    // lit row sits, so the pills are on screen; services and Continue watching step out of the way
    var fi = id === "filter" ? rows.findIndex(function (r) { return r.first; }) : -1;
    rows.forEach(function (r, k) {
      var cls = "row" + (r.first ? " first" : "");
      if (top) cls += fi >= 0 && k < fi ? " gone" : " dim"; else if (k === at) cls += " lit"; else if (k === at + 1) cls += " peek"; else cls += " gone";
      r.el.className = cls;
      r.h2.parentNode.parentNode.classList.toggle("lit", k === at);
      r.cards.forEach(function (c, i) { c.classList.toggle("on", k === at && i === sel.col); c.classList.toggle("c0", k === at && i === 0 && sel.col === 0); });
      var col = k === at ? sel.col : (sel.mem[r.id] || 0);
      var stride = r.cards.length > 1 ? r.cards[1].offsetLeft - r.cards[0].offsetLeft : 0;
      r.inner.style.setProperty("transform", "translateX(" + (-Math.max(0, col - 2) * stride) + "px)");
    });
    document.getElementById("svc").style.setProperty("opacity", top && fi < 0 ? "1" : "0");
    var ty = at >= 0 ? -rows[at].el.offsetTop : fi >= 0 ? -rows[fi].el.offsetTop : 0;
    flow.style.setProperty("transform", "translateY(" + ty + "px)");
    loadNear();
  }
  function changed() { paint(); renderStage(); }

  /* ---------- detail panel ---------- */
  var panel = { open: false, item: null, btn: 0, full: false, d: null };
  function openPanel(item) {
    panel.open = true; panel.item = item; panel.btn = 0; panel.full = false; panel.d = detCache[item.key] || null; panel.next = null;
    panel.rate = 0; panel.rating = false;
    if (!isDemo && item.key) fetch("/api/rated?key=" + encodeURIComponent(item.key)).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.v && panel.open && panel.item === item) { panel.rate = j.v; buildPanel(); }
    }).catch(function () {});
    if (item.kind === "tv" && isDemo) panel.next = { nextSe: 1, nextEp: 3, seasons: 2 };
    if (item.kind === "tv" && !isDemo) fetch("/api/episodes?key=" + encodeURIComponent(item.key) + "&n=0").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.exact && j.svc) EXACT[j.svc] = 1;
      if (j && panel.open && panel.item === item) { panel.next = j; buildPanel(); }
    }).catch(function () {});
    send({ t: "sig", key: item.key, k: srch.open ? "search" : sel.id, a: "detail" });
    stageTrailer("");
    buildPanel();
    panelEl.hidden = false;
    getDetails(item.key).then(function (d) { if (panel.open && panel.item === item) { panel.d = d; buildPanel(); } });
    clearTimeout(panel.tm);
    panel.tm = setTimeout(function () {
      if (!panel.open) return;
      fetch("/api/preview?key=" + encodeURIComponent(item.key)).then(function (r) { return r.json(); }).then(function (j) {
        if (!panel.open || !j.key) return;
        // the Trailer button appears now; focus stays on the same button
        if (!panel.rating && panel.btn >= 1 + (item.kind === "tv" ? 1 : 0)) panel.btn++;
        panel.yt = j.key; buildPanel();
        var ptr = panelEl.querySelector(".ptr");
        if (ptr) { ptr.appendChild(trailerFrame(j.key, true)); ptr.classList.add("on"); }
      }).catch(function () {});
    }, 800);
  }
  function closePanel() {
    clearTimeout(panel.tm);
    panel.open = false; panel.full = false; panel.yt = "";
    panelEl.hidden = true;
    while (panelEl.firstChild) panelEl.removeChild(panelEl.firstChild);
    renderStage();
  }
  function ratingBox(num, label, sub) { var b = el("div", "rbox"), l = el("div", "lab", label); if (sub) l.appendChild(el("span", "k", sub)); b.appendChild(el("div", "num", num)); b.appendChild(l); return b; }
  // a row's title knows its service; a search result learns it from the details
  function panelSvc() {
    var it = panel.item, d = panel.d;
    if (d && d.services) return d.services[0] || ""; // checked order: watched there, shown there, then TMDB
    return it.service || "";
  }
  function buildPanel() {
    var it = panel.item, d = panel.d, svc = panelSvc(), unknown = !svc && !d, nowhere = !svc && !!d;
    var keepTrailer = panelEl.querySelector(".ptr iframe");
    while (panelEl.firstChild) panelEl.removeChild(panelEl.firstChild);
    var bd = el("div", "pbd" + (panel.full ? " full" : ""));
    if (it.img) { var im = el("img"); im.alt = ""; im.src = it.img; bd.appendChild(im); }
    var ptr = el("div", "ptr" + (keepTrailer ? " on" : "")); if (keepTrailer) ptr.appendChild(keepTrailer); bd.appendChild(ptr);
    panelEl.appendChild(bd);
    var col = el("div", "pcol");
    col.appendChild(kicker([svc ? "On " + svcName(svc) : unknown ? "Finding where it streams" : "Not on Prime Video, Netflix or JioHotstar", svc && it.occ ? (it.occWord || it.why) : ""]));
    col.appendChild(el("div", "ttl", it.title));
    var rs = el("div", "ratings");
    var vote = d ? d.rating : it.vote, votes = d ? d.votes : it.votes;
    if (vote && votes >= 50) rs.appendChild(ratingBox(vote.toFixed(1), "TMDB · ", compact(votes)));
    else rs.appendChild(ratingBox("—", "Too new to rate"));
    col.appendChild(rs);
    var f = factsNode(it, d, true); if (f) col.appendChild(f);
    var w = it.occ && it.line ? it.line : whyWatch(it, d); if (w) col.appendChild(el("div", "why", w));
    if (d && d.overview) col.appendChild(el("div", "over", d.overview));
    if (d && d.cast && d.cast.length) {
      var c = d.cast.slice(0, 3), s = c.length > 1 ? c.slice(0, -1).join(", ") + " and " + c[c.length - 1] : c[0];
      col.appendChild(el("div", "cast", "With " + s));
    }
    panelEl.appendChild(col);
    var acts = el("div", "pacts");
    var a1 = el("button", "act glow" + (panel.btn === 0 ? " on" : "")); a1.type = "button"; a1.setAttribute("data-svc", svc);
    a1.appendChild(el("span", "ok", "OK")); a1.appendChild(document.createTextNode(svc ? "Open in " + svcName(svc) : unknown ? "Checking…" : "Not streaming on your services"));
    if (!svc) a1.disabled = true;
    if (EXACT[svc] && it.kind === "tv" && panel.next) { // the apps TV Mode lands on the exact episode in
      var nx = panel.next, nse = nx && nx.nextSe ? nx.nextSe : 1, nep = nx && nx.nextEp ? nx.nextEp : 1;
      a1.lastChild.textContent = (nx && nx.nextSe ? "Resume S" : "Play S") + nse + " E" + nep + " in " + svcName(svc);
    }
    // Off focus only a plain "Open in X" collapses to the wordmark; Resume / Play S.. E.. keeps its
    // episode words, because they say what OK will do and the logo alone would not.
    var plain = a1.lastChild.textContent.indexOf("Open in ") === 0;
    logoize(a1, svc);
    if (plain && panel.btn !== 0 && a1.lastChild.nodeType === 1) a1.childNodes[1].textContent = ""; // off focus: the wordmark alone
    acts.appendChild(a1);
    panel.fns = {};
    var bi = 0;
    if (it.kind === "tv" && !panel.rating) { // the three answers take the whole row
      bi++;
      var ae = el("button", "act alt glow" + (panel.btn === bi ? " on" : "")); ae.type = "button";
      ae.appendChild(document.createTextNode("Episodes"));
      panel.fns[bi] = function () { openEps(it); };
      (function (k) { ae.addEventListener("click", function () { panel.btn = k; panelAct(); }); })(bi);
      acts.appendChild(ae);
    }
    if (panel.yt && !panel.rating) { // no trailer found, no button
      bi++;
      var a2 = el("button", "act alt glow" + (panel.btn === bi ? " on" : "")); a2.type = "button";
      a2.appendChild(document.createTextNode("Trailer with sound"));
      panel.fns[bi] = playTrailer;
      (function (k) { a2.addEventListener("click", function () { panel.btn = k; panelAct(); }); })(bi);
      acts.appendChild(a2);
    }
    a1.addEventListener("click", function () { panel.btn = 0; panelAct(); });
    // Watched it: one button; pressed, it becomes the two answers (and a way back off)
    var firstMark = bi + 1; // Watched it's place; in rating mode the answers start right after the primary
    var marks = panel.rating
      ? [["Liked it", function () { rateIt(1); }], ["Not for me", function () { rateIt(-1); }]].concat(panel.rate ? [["Not watched", function () { rateIt(0); }]] : [])
      : [[panel.rate === 1 ? "Watched · liked" : panel.rate === -1 ? "Watched · not for me" : "Watched it", function () { panel.rating = true; panel.btn = 1; buildPanel(); }]];
    marks.forEach(function (m) {
      bi++;
      var b = el("button", "act alt glow" + (panel.btn === bi ? " on" : "") + (panel.rating ? " rate" : "")); b.type = "button";
      b.appendChild(document.createTextNode(m[0]));
      panel.fns[bi] = m[1];
      (function (k) { b.addEventListener("click", function () { panel.btn = k; panelAct(); }); })(bi);
      acts.appendChild(b);
    });
    if (panel.rating) panelEl.appendChild(el("div", "prate", "Watched it? · Back to leave"));
    panelEl.appendChild(acts);
    panel.n = bi + 1;
  }
  function watchedAt() { return 1 + (panel.item.kind === "tv" ? 1 : 0) + (panel.yt ? 1 : 0); }
  // a mark: the PC learns it (strongest signal) and stops suggesting the title
  function rateIt(v) {
    var key = panel.item && panel.item.key;
    if (!key) return;
    send({ t: "sig", key: key, k: "panel", a: v === 1 ? "liked" : v === -1 ? "disliked" : "unrated" });
    panel.rate = v; panel.rating = false; panel.btn = watchedAt();
    buildPanel(); // focus stays where the answer was: on the Watched button, now with the mark
  }
  function panelAct() {
    if (panel.fns && panel.fns[panel.btn]) { panel.fns[panel.btn](); return; }
    if (panel.btn === 0) { var s0 = panelSvc(), nx = panel.next; if (!s0) return; playEp(panel.item, s0, nx && nx.nextSe || 0, nx && nx.nextEp || 0); return; }
  }
  function playTrailer() {
    if (!panel.yt) return;
    panel.full = true;
    var bd = panelEl.querySelector(".pbd"), ptr = panelEl.querySelector(".ptr");
    bd.classList.add("full");
    while (ptr.firstChild) ptr.removeChild(ptr.firstChild);
    ptr.appendChild(trailerFrame(panel.yt, false));
    ptr.classList.add("on");
  }
  function panelBack() {
    if (panel.rating) { panel.rating = false; panel.btn = watchedAt(); buildPanel(); return; } // Back leaves the two answers, not the panel
    if (panel.full) {
      panel.full = false;
      var bd = panelEl.querySelector(".pbd"), ptr = panelEl.querySelector(".ptr");
      bd.classList.remove("full");
      while (ptr.firstChild) ptr.removeChild(ptr.firstChild);
      if (panel.yt) ptr.appendChild(trailerFrame(panel.yt, true));
      return;
    }
    closePanel();
  }

  /* ---------- input ---------- */
  function move(dRow, dCol) {
    if (ep.open) { epsMove(dRow, dCol); return; }
    if (panel.open) {
      var pn = panel.n || 2, pd = dCol || dRow, nb = Math.max(0, Math.min(pn - 1, panel.btn + (pd > 0 ? 1 : -1)));
      if (pd && nb !== panel.btn) { panel.btn = nb; buildPanel(); }
      return;
    }
    if (srch.open) { searchMove(dRow, dCol); return; }
    var ids = navIds(), at = ids.indexOf(sel.id);
    if (at < 0) { sel.id = "svc"; sel.col = st.focus + 1; at = ids.indexOf("svc"); }
    if (dRow) {
      var nr = Math.max(0, Math.min(ids.length - 1, at + dRow));
      if (nr === at) return;
      if (curRow()) sel.mem[sel.id] = sel.col;
      sel.id = ids[nr];
      var r = curRow();
      sel.col = sel.id === "svc" ? st.focus + 1 : sel.id === "filter" ? modeIdx() : sel.id === "hero" ? 0 : Math.min(sel.mem[sel.id] || 0, r.items.length - 1);
    } else {
      if (sel.id === "hero") { heroStep(dCol); return; }
      var rr = curRow();
      var max = sel.id === "svc" ? 4 : sel.id === "filter" ? 2 : rr.items.length - 1;
      var nc = Math.max(0, Math.min(max, sel.col + dCol));
      if (nc === sel.col) return;
      sel.col = nc;
      if (sel.id === "svc") { if (nc > 0) { st.focus = nc - 1; send({ t: "focus", i: nc - 1 }); } } // tile 0 is Search
      else if (rr) { sel.mem[rr.id] = nc; wantMore(rr); }
    }
    changed();
    dwellLater();
  }

  // looking at a recommendation for two seconds is a (small) signal of interest
  var dwellTm = 0;
  function dwellLater() {
    clearTimeout(dwellTm);
    var r = curRow(), it = r && r.items[sel.col];
    if (!it || r.id === "cont" || !it.key) return;
    dwellTm = setTimeout(function () {
      var r2 = curRow();
      if (!panel.open && !srch.open && r2 === r && r2.items[sel.col] === it) send({ t: "sig", key: it.key, k: r.id, a: "dwell" });
    }, 2000);
  }

  /* ---------- episodes: every season and episode, his progress on each; OK lands on that episode ---------- */
  var ep = { err: false, open: false, item: null, svc: "", season: 1, seasons: 1, list: [], at: -1, tab: 0, nextSe: 0, nextEp: 0, seq: 0 };
  // play: se/ep 0 means the next one to watch (or the movie); Go finds the exact page
  function playEp(item, svc, se, epn) {
    send({ t: "openitem", k: "item", key: item.key, a: svc, se: se, ep: epn });
    if (ep.open) closeEps();
    if (panel.open) closePanel();
    if (srch.open) closeSearch();
  }
  function openEps(item) {
    ep.open = true; ep.item = item; ep.svc = panelSvc(); ep.list = []; ep.at = -1;
    var d = panel.d;
    ep.seasons = (d && d.seasons) || 1;
    ep.season = panel.next && panel.next.nextSe ? panel.next.nextSe : 1;
    ep.tab = ep.season - 1;
    epsEl.hidden = false;
    etitle.textContent = item.title;
    loadSeason(ep.season, true);
  }
  function closeEps() { ep.open = false; epsEl.hidden = true; if (panel.open) buildPanel(); }
  function loadSeason(n, focusNext) {
    ep.season = n; ep.list = []; ep.err = false; drawEps("Loading season " + n + "…");
    var s = ++ep.seq;
    if (isDemo) {
      ep.seasons = 2; ep.nextSe = 1; ep.nextEp = 3; ep.svc = ep.svc || "jiohotstar";
      ep.list = [1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return { n: i, name: "Demo episode " + i, over: "What happens in this episode, in a line or two.", min: 21, air: "2012-06-1" + i, pct: i < 3 ? 1 : i === 3 ? 0.4 : 0 }; });
      ep.at = focusNext ? 2 : -1; drawEps(""); return;
    }
    fetch("/api/episodes?key=" + encodeURIComponent(ep.item.key) + "&n=" + n).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (s !== ep.seq || !ep.open) return;
      if (!j) { epFail(); return; }
      ep.list = j.eps || []; ep.seasons = Math.max(ep.seasons, j.seasons || 1); ep.nextSe = j.nextSe; ep.nextEp = j.nextEp;
      if (j.svc && !ep.svc) ep.svc = j.svc;
      if (j.exact && j.svc) EXACT[j.svc] = 1;
      ep.at = -1;
      if (focusNext) {
        var k = ep.list.findIndex(function (x) { return j.nextSe === n && x.n === j.nextEp; });
        ep.at = k >= 0 ? k : 0;
      }
      drawEps("");
    }).catch(function () { if (s === ep.seq) epFail(); });
  }
  function epFail() { ep.err = true; ep.at = 0; drawEps("Can't load the episodes right now."); }
  function drawEps(msg) {
    while (etabs.firstChild) etabs.removeChild(etabs.firstChild);
    var from = Math.max(0, Math.min(ep.seasons - 8, ep.tab - 3));
    for (var i = from; i < Math.min(ep.seasons, from + 8); i++) {
      var t = el("button", "etab" + (i + 1 === ep.season ? " sel" : "") + (ep.at === -1 && i === ep.tab ? " on" : ""), "Season " + (i + 1)); t.type = "button";
      (function (n) { t.addEventListener("click", function () { ep.tab = n - 1; loadSeason(n, false); }); })(i + 1);
      etabs.appendChild(t);
    }
    while (egrid.firstChild) egrid.removeChild(egrid.firstChild);
    if (ep.err) { // the one thing to do: ask again
      var rb = el("button", "act alt glow retry"); rb.type = "button";
      rb.appendChild(el("span", "ok", "OK")); rb.appendChild(document.createTextNode("Try again"));
      rb.addEventListener("click", function () { ep.at = 0; epsAct(); });
      egrid.appendChild(rb);
    }
    ep.list.forEach(function (x, i) {
      var c = el("button", "scard"); c.type = "button"; c.setAttribute("data-svc", ep.svc || "none");
      var im = el("div", "si");
      if (x.img) { var g = el("img"); g.alt = ""; g.decoding = "async"; g.loading = "lazy"; g.src = x.img; im.appendChild(g); }
      if (ep.nextSe === ep.season && ep.nextEp === x.n) im.appendChild(el("div", "nx", x.pct > 0 ? "Resume" : "Up next"));
      if (x.pct > 0) { var pg = el("div", "pg"), fi = el("i"); fi.style.setProperty("width", Math.min(100, Math.round(x.pct * 100)) + "%"); pg.appendChild(fi); im.appendChild(pg); }
      c.appendChild(im);
      c.appendChild(el("div", "st", "E" + x.n + "  ·  " + (x.name || "Episode " + x.n)));
      var bits = [];
      if (x.min) bits.push(runtimeText(x.min));
      if (x.air) { var dt = new Date(x.air); if (!isNaN(dt)) bits.push(dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })); }
      if (x.pct >= 0.92) bits.push("Watched"); else if (x.pct > 0) bits.push(Math.round(x.pct * 100) + "% watched");
      c.appendChild(el("div", "sm", bits.join("  ·  ")));
      if (x.over) c.appendChild(el("div", "so", x.over));
      (function (k) { c.addEventListener("click", function () { ep.at = k; epsAct(); }); })(i);
      egrid.appendChild(c);
    });
    ehint.textContent = msg || (!ep.svc ? "Not streaming on your apps." : EXACT[ep.svc] ? "OK to play that episode in " + svcName(ep.svc) + (ep.list.some(function (x) { return x.pct > 0 && x.pct < 0.92; }) ? ", from where you stopped" : "") + ". Up for seasons." : "OK to open " + svcName(ep.svc) + " at its search for this show: it could not find the episode itself.");
    paintEps();
  }
  function paintEps() {
    var cards = egrid.children;
    for (var i = 0; i < cards.length; i++) cards[i].classList.toggle("on", i === ep.at);
    var tabs = etabs.children, from = Math.max(0, Math.min(ep.seasons - 8, ep.tab - 3));
    for (var j = 0; j < tabs.length; j++) tabs[j].classList.toggle("on", ep.at === -1 && j + from === ep.tab);
    var c = cards[ep.at];
    if (c) { var r = Math.floor(ep.at / SCOLS); egrid.scrollTop = r < 1 ? 0 : c.offsetTop - egrid.offsetTop - c.offsetHeight * 0.5; } else egrid.scrollTop = 0;
  }
  function epsMove(dRow, dCol) {
    var n = ep.list.length;
    if (ep.at === -1) {
      if (dCol) {
        var nt = Math.max(0, Math.min(ep.seasons - 1, ep.tab + dCol));
        if (nt !== ep.tab) { ep.tab = nt; clearTimeout(ep.tm); drawEps(""); ep.tm = setTimeout(function () { loadSeason(ep.tab + 1, false); }, 300); }
      } else if (dRow > 0 && (n || ep.err)) { ep.at = 0; paintEps(); }
      return;
    }
    var row = Math.floor(ep.at / SCOLS), col = ep.at % SCOLS;
    if (dCol) { var nc = col + dCol; if (nc < 0 || nc >= SCOLS || ep.at + dCol >= n) return; ep.at += dCol; }
    else if (dRow < 0) { if (row === 0) ep.at = -1; else ep.at -= SCOLS; }
    else if (dRow > 0) { if ((row + 1) * SCOLS >= n) return; ep.at = Math.min(n - 1, ep.at + SCOLS); }
    paintEps();
  }
  function epsAct() {
    if (ep.err && ep.at === 0) { loadSeason(ep.season, true); return; }
    if (ep.at === -1) { if (ep.tab + 1 !== ep.season) loadSeason(ep.tab + 1, false); else if (ep.list.length) { ep.at = 0; paintEps(); } return; }
    var x = ep.list[ep.at];
    if (!x || !ep.svc) return;
    playEp(ep.item, ep.svc, ep.season, x.n);
  }

  /* ---------- search: TMDB through Go; OK opens the same details panel ---------- */
  var srch = { open: false, items: [], at: -1, q: "", tm: 0, seq: 0, empty: null }, SCOLS = 4;
  // recent searches: the last 8, kept on this PC
  var RECENT_KEY = "tvmode.recentSearches";
  function recents() {
    try { var l = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(l) ? l.filter(function (x) { return typeof x === "string" && x; }).slice(0, 8) : []; } catch (e) { return []; }
  }
  function saveRecent(text) {
    text = (text || "").trim();
    if (text.length < 2) return;
    var l = recents().filter(function (x) { return x.toLowerCase() !== text.toLowerCase(); });
    l.unshift(text);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(l.slice(0, 8))); } catch (e) {}
  }
  // the empty search: recent searches, then one row of Top rated, so it is never a void
  function emptyView() {
    var rec = recents().map(function (t) { return { k: "q", title: t }; });
    var top = (data.shelves || []).filter(function (x) { return x.id === "top"; })[0];
    var tops = top ? visibleItems(top).slice(0, SCOLS) : [];
    return { groups: [{ head: rec.length ? "Recent searches" : "", items: rec }, { head: tops.length ? "Top rated" : "", items: tops }] };
  }
  // from the phone's Search button: close whatever is open and land in search
  function goSearch() {
    if (ep.open) closeEps();
    if (panel.open) closePanel();
    sel.id = "svc"; sel.col = 0;
    if (srch.open) { srch.at = -1; sq.focus(); paintSearch(); return; }
    changed();
    openSearch();
  }
  function openSearch() {
    srch.open = true; srch.at = -1;
    searchEl.hidden = false;
    sq.value = srch.q;
    sq.focus(); // the phone sees a text field and opens its keyboard
    drawResults(srch.q.length >= 2 && !srch.empty && srch.items.length ? "" : null);
  }
  function closeSearch() {
    srch.open = false;
    clearTimeout(srch.tm);
    searchEl.hidden = true;
    try { sq.blur(); } catch (e) {}
    changed();
  }
  function runSearch() {
    clearTimeout(srch.tm);
    var q = sq.value.trim();
    if (q === srch.q && srch.items.length) return;
    srch.q = q;
    if (q.length < 2) { srch.items = []; drawResults(null); return; }
    if (isDemo) { srch.items = demoRows().shelves[0].items.slice(0, 8).map(function (x) { x.over = "A one line overview."; return x; }); drawResults(""); return; }
    var n = ++srch.seq;
    shint.textContent = "Searching for “" + q + "”…";
    fetch("/api/search?q=" + encodeURIComponent(q)).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (n !== srch.seq || !srch.open) return;
      if (!j) { srch.items = []; drawResults("Search can't reach TMDB right now. Check the internet and try again."); return; }
      srch.items = j.items || [];
      drawResults(srch.items.length ? "" : "No movies or shows match “" + q + "”. Try fewer words.");
    }).catch(function () { if (n === srch.seq) { srch.items = []; drawResults("Search can't reach TMDB right now. Check the internet and try again."); } });
  }
  sq.addEventListener("input", function () { clearTimeout(srch.tm); srch.tm = setTimeout(runSearch, 350); });
  sq.addEventListener("focus", function () { if (srch.open && srch.at !== -1) { srch.at = -1; paintSearch(); } });
  // search items, row by row (focus moves by these rows); the empty view has two groups
  function searchRows() {
    var out = [], base = 0;
    function chunk(n) { for (var i = 0; i < n; i += SCOLS) { var r = []; for (var k = i; k < Math.min(n, i + SCOLS); k++) r.push(base + k); out.push(r); } base += n; }
    if (srch.empty) srch.empty.groups.forEach(function (g) { chunk(g.items.length); }); else chunk(srch.items.length);
    return out;
  }
  function drawResults(msg) {
    while (sgrid.firstChild) sgrid.removeChild(sgrid.firstChild);
    srch.empty = msg === null ? emptyView() : null;
    var list = srch.items;
    if (srch.empty) { // the items are the recents, then the top rated
      list = []; srch.empty.groups.forEach(function (g) { list = list.concat(g.items); });
      srch.items = list;
    }
    var gi = 0, gleft = 0;
    list.forEach(function (it, i) {
      if (srch.empty) {
        while (gleft === 0 && gi < srch.empty.groups.length) { var g = srch.empty.groups[gi++]; gleft = g.items.length; if (gleft && g.head) sgrid.appendChild(el("h3", "sh", g.head)); }
        gleft--;
      }
      if (it.k === "q") { // a recent search
        var qc = el("button", "scard qt"); qc.type = "button";
        var qb = el("div", "qb"), ico = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        ico.setAttribute("viewBox", "0 0 24 24"); ico.setAttribute("aria-hidden", "true");
        ico.innerHTML = "<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"m15.5 15.5 5 5\"/>";
        qb.appendChild(ico); qb.appendChild(el("span", null, it.title)); qc.appendChild(qb);
        qc.addEventListener("click", function () { srch.at = i; paintSearch(); useRecent(it.title); });
        sgrid.appendChild(qc);
        return;
      }
      var c = el("button", "scard"); c.type = "button"; c.setAttribute("data-svc", it.service || "");
      var im = el("div", "si");
      if (it.img) { var g = el("img"); g.alt = ""; g.decoding = "async"; g.loading = "lazy"; g.src = it.img; im.appendChild(g); }
      c.appendChild(im);
      c.appendChild(el("div", "st", it.title));
      var m = el("div", "sm"), parts = [];
      if (it.vote && it.votes >= 50) { var b = el("b", null, it.vote.toFixed(1)); m.appendChild(b); parts.push(""); }
      [it.year, it.kind === "tv" ? "Series" : "Movie"].forEach(function (p) { if (p) parts.push(p); });
      m.appendChild(document.createTextNode((parts[0] === "" ? "  ·  " : "") + parts.filter(Boolean).join("  ·  ")));
      var sv = el("span", "sv", it.service ? "  ·  " + svcName(it.service) : ""); m.appendChild(sv);
      c.appendChild(m);
      // colour = where it streams (white only when none of his apps has it): ask before he opens it
      if (!it.service) getDetails(it.key).then(function (d) {
        if (!d) return;
        var s0 = (d.services && d.services[0]) || "";
        c.setAttribute("data-svc", s0 || "none");
        sv.textContent = "  ·  " + (s0 ? svcName(s0) : "Not on your apps");
        if (s0) it.service = s0;
      });
      if (it.over) c.appendChild(el("div", "so", it.over));
      c.addEventListener("click", function () { srch.at = i; paintSearch(); openFromSearch(it); });
      sgrid.appendChild(c);
    });
    shint.textContent = msg === null ? "Type on your phone. Down for " + (recents().length ? "recent searches and top rated" : "top rated") + ", Back to close." : msg || (srch.items.length + (srch.items.length === 1 ? " result" : " results") + ". OK to see details, rating, cast and where it streams.");
    paintSearch();
  }
  function paintSearch() {
    var cards = sgrid.querySelectorAll(".scard");
    for (var i = 0; i < cards.length; i++) cards[i].classList.toggle("on", i === srch.at);
    sq.parentNode.classList.toggle("on", srch.at === -1);
    var c = cards[srch.at];
    if (c) { var top = c.offsetTop - sgrid.offsetTop, r = Math.floor(srch.at / SCOLS); sgrid.scrollTop = r < 1 || srch.empty ? 0 : top - c.offsetHeight * 0.5; }
    else sgrid.scrollTop = 0;
  }
  function searchMove(dRow, dCol) {
    var rws = searchRows();
    if (srch.at === -1) {
      if (dRow > 0) {
        if (!srch.empty) runSearch(); // typed and pressed Down before the pause: search now
        if (srch.items.length) { srch.at = 0; try { sq.blur(); } catch (e) {} paintSearch(); }
      }
      return;
    }
    var ri = rws.findIndex(function (r) { return r.indexOf(srch.at) >= 0; }), r = rws[ri], ci = r.indexOf(srch.at);
    if (dCol) {
      var nc = ci + dCol;
      if (nc < 0 || nc >= r.length) return;
      srch.at = r[nc];
    } else if (dRow < 0) {
      if (ri === 0) { srch.at = -1; sq.focus(); }
      else srch.at = rws[ri - 1][Math.min(ci, rws[ri - 1].length - 1)];
    } else if (dRow > 0) {
      if (ri + 1 >= rws.length) return;
      srch.at = rws[ri + 1][Math.min(ci, rws[ri + 1].length - 1)];
    }
    paintSearch();
  }
  // OK on a recent search runs it again; on a result it opens the details (and remembers the words)
  function useRecent(text) { sq.value = text; srch.q = ""; srch.at = -1; runSearch(); sq.focus(); }
  function openFromSearch(it) {
    if (it.k === "q") { useRecent(it.title); return; }
    if (!srch.empty) saveRecent(srch.q);
    openPanel(it);
  }
  function searchBack() {
    if (srch.at >= 0) { srch.at = -1; sq.focus(); paintSearch(); return; }
    closeSearch();
  }

  // OK: heroes and Continue watching open at once; a recommendation opens its details
  function activate() {
    if (ep.open) { epsAct(); return; }
    if (panel.open) { panelAct(); return; }
    if (srch.open) {
      if (srch.at === -1) { if (!srch.empty) runSearch(); if (srch.items.length) { srch.at = 0; try { sq.blur(); } catch (e) {} paintSearch(); } }
      else if (srch.items[srch.at]) openFromSearch(srch.items[srch.at]);
      return;
    }
    var id = sel.id;
    if (id === "svc") {
      if (sel.col === 0) { openSearch(); return; }
      st.focus = sel.col - 1; send({ t: "focus", i: st.focus }); send({ t: "open", i: st.focus });
    }
    else if (id === "filter") setMode(MODES[sel.col]);
    else if (id === "hero") {
      var h = heroModel();
      if (!h) return;
      if (h.k === "cont") send({ t: "openitem", k: "cont", i: h.i });
      else if (h.k === "next") send({ t: "openitem", k: "item", key: h.key, a: h.service, se: h.se, ep: h.ep });
      else openPanel(heroItem(h));
    } else {
      var r = curRow(), it = r && r.items[sel.col];
      if (!it) return;
      if (r.id === "more") openShelf(it.shelf);
      else if (r.id === "cont") send({ t: "openitem", k: "cont", i: it.i });
      else if (r.id === "saved") send({ t: "openitem", k: "lib", key: it.lib, a: it.service });
      else openPanel(it);
    }
  }
  // remote Play/Pause: open the service directly, whatever has focus
  function playNow() {
    if (ep.open) { epsAct(); return; }
    if (panel.open) { var s0 = panelSvc(); if (s0) playEp(panel.item, s0, 0, 0); return; }
    if (srch.open) return;
    var id = sel.id;
    if (id === "svc") { activate(); return; }
    if (id === "hero") { var h = heroModel(); if (h) send(h.k === "cont" ? { t: "openitem", k: "cont", i: h.i } : h.k === "next" ? { t: "openitem", k: "item", key: h.key, a: h.service, se: h.se, ep: h.ep } : { t: "openitem", k: "item", key: h.key }); return; }
    if (id === "filter") return;
    var r = curRow(), it = r && r.items[sel.col];
    if (!it || r.id === "more") return;
    send(r.id === "cont" ? { t: "openitem", k: "cont", i: it.i } : r.id === "saved" ? { t: "openitem", k: "lib", key: it.lib, a: it.service } : { t: "openitem", k: "item", key: it.key });
  }

  document.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (pairUrl && (e.key === "Escape" || e.key === "Enter")) { e.preventDefault(); pairUrl = null; render(); return; }
    // Esc never quits: TV Mode itself sends Esc to leave a service's full screen, and one
    // that lands here just as the home page appears turned TV Mode off (2026-11-04).
    // Quitting is the phone's More > Turn off, or tvmode.exe -quit.
    if (view !== "launcher") return;
    if (e.target === sq && e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Enter" && e.key !== "Escape") return; // typing
    switch (e.key) {
      case "ArrowLeft": e.preventDefault(); move(0, -1); break;
      case "ArrowRight": e.preventDefault(); move(0, 1); break;
      case "ArrowUp": e.preventDefault(); move(-1, 0); break;
      case "ArrowDown": e.preventDefault(); move(1, 0); break;
      case "Enter":
      case " ": e.preventDefault(); activate(); break;
      case "Escape": e.preventDefault(); if (ep.open) closeEps(); else if (panel.open) panelBack(); else if (srch.open) searchBack(); break;
    }
  });
  tiles.forEach(function (t, i) { t.addEventListener("click", function () { if (view === "launcher") { sel.id = "svc"; sel.col = i; changed(); activate(); } }); }); // tile 0 is Search

  /* ---------- socket ---------- */
  function demoRows() {
    var svcs = ["prime", "netflix", "jiohotstar"];
    var WHYS = ["Top rated", "New this week", "Because you liked Demo Series", "Trending in India", "Critics love it", "Short and easy tonight"];
    function items(n, p) {
      var o = [];
      for (var i = 0; i < n; i++) o.push({ key: "movie" + (p * 100 + i), title: "Title " + p + "." + (i + 1), service: svcs[i % 3], kind: i % 2 ? "tv" : "movie", img: "", ord: 100 - i, why: WHYS[(p * 3 + i) % WHYS.length], year: "2025", vote: 7.8, votes: 1200 });
      return o;
    }
    var names = [["new", "New releases"], ["top", "Top rated"], ["fy", "For you"], ["fyt1", "For you, with a touch of Crime"], ["fyt2", "For you, with a touch of Comedy"], ["fyt3", "For you, with a touch of Anime"], ["fyt4", "For you, with a touch of Sci-fi"], ["indian", "Indian"], ["korean", "Korean"], ["anime", "Japanese anime"], ["crime", "Crime and thrillers"], ["comedy", "Comedy"], ["scifi", "Sci-fi and fantasy"]];
    return {
      // the demo mirrors a Diwali week: an occasion slide after the pick, and the themed shelf third
      hero: { all: [
        { k: "pick", kick: demoParam === "mood" ? "LIGHT TONIGHT" : undefined, service: "prime", title: "Demo Pick", over: "A one line overview of the featured title goes here.", img: "", key: "movie1", kind: "movie", year: "2025", genres: ["Drama", "Crime"], vote: 7.8, votes: 1200, why: "Top rated this week" },
        { k: "pick", kick: "Diwali week", occ: "diwali", service: "netflix", title: "Diwali Film One", over: "A one line overview of the Diwali film goes here, for the whole house.", img: "", key: "movie9001", kind: "movie", year: "2024", genres: ["Family", "Comedy"], vote: 7.4, votes: 3100, why: "Big, bright and for the whole house." },
        { k: "next", kick: "Up next", service: "prime", title: "Demo Series", sub: "S1 E4  ·  The fourth one", over: "A one line overview of the next episode.", img: "", key: "tv9100", kind: "tv", se: 1, ep: 4, why: "You finished episode 3 last night." }
      ] },
      cont: [
        { title: "Demo Series", service: "prime", img: "", pct: 0.4, i: 0, line: "S1 E3" }, // the hero's own title: left out of the row
        { title: "Another Show", service: "netflix", img: "", pct: 0.6, i: 1, line: "S2 E5" },
        { title: "A Film Half Seen", service: "jiohotstar", img: "", pct: 0.3, i: 2, line: "1h 10m left" }
      ],
      // ?demo=saved: the library's Saved row (phone shares and desk pastes), after Continue watching
      saved: demoParam === "saved" ? [
        { title: "A long talk about type", service: "youtube", kind: "yt", img: "", lib: "yt:aaaaaaaaaaa", why: "From your phone, today", line: "From your phone, today" },
        { title: "Demo Series", service: "netflix", kind: "tv", img: "", lib: "tv9100", why: "From your phone, yesterday", line: "From your phone, yesterday" },
        { title: "Saved Film", service: "prime", kind: "movie", img: "", lib: "movie77", why: "Saved at the desk, 3 days ago", line: "Saved at the desk, 3 days ago" }
      ] : [],
      shelves: names.map(function (nm, r) { var t = nm[1]; return { id: nm[0], title: t, titles: [t, t, t], why: t, items: items(14, r) }; }).map(function (s, r) {
        return s;
      }).reduce(function (acc, s, r) {
        acc.push(s);
        if (r === 1) { // third row: the themed shelf
          var oi = items(12, 90).map(function (c, i) { c.title = "Diwali Film " + (i + 1); c.why = "Diwali week"; c.occ = "diwali"; c.line = "Big, bright and for the whole house."; c.kind = i % 5 === 4 ? "tv" : "movie"; return c; });
          acc.push({ id: "occ-diwali", title: "Diwali week", titles: ["Diwali week", "Diwali week", "Diwali week"], why: "Diwali week", line: "Big, bright and for the whole house.", items: oi });
          if (demoParam === "otd") { // ?demo=otd: the On this day shelf, after the themed shelf
            var yo = items(8, 95).map(function (c, i) { c.title = (i < 2 ? "Finished last year " : "Classic ") + (i + 1); c.why = i < 2 ? "You finished it a year ago" : "Out this week in " + (2014 + i); return c; });
            acc.push({ id: "otd", title: "On this day", titles: ["On this day", "On this day", "On this day"], why: "On this day", items: yo });
          }
        }
        return acc;
      }, [])
    };
  }
  function enterDemo() {
    if (isDemo) return;
    isDemo = true;
    st = { focus: 1, phone: true, sleepAt: Date.now() + 28 * 60000, countdown: null };
    everPhone = true;
    if (demoParam === "nophone") st.phone = false;
    if (demoParam === "countdown") st.countdown = 7;
    if (demoParam === "pair") { st.phone = false; everPhone = false; st.sleepAt = null; setPair("https://tvmode.example.workers.dev/remote/#t=demo&p=0123456789abcdef0123456789abcdef"); }
    var d = demoRows(); setRows(d);
    render();
  }
  function connect() {
    clearTimeout(retryTimer);
    var s;
    try { s = new WebSocket(WS_URL); } catch (e) { s = null; }
    if (!s) { retry(); return; }
    ws = s;
    s.onopen = function () { connected = true; tries = 0; if (isDemo) { isDemo = false; pairUrl = null; } };
    s.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === "state") onState(m);
      else if (m.t === "rows") { more = {}; setRows(m); }
      else if (m.t === "more") gotMore(m);
      else if (m.t === "pair") setPair(m.url);
      else if (m.t === "lean") { stage.style.setProperty("--lx", m.x || 0); stage.style.setProperty("--ly", m.y || 0); }
      else if (m.t === "cmd") {
        if (m.a === "back") { if (ep.open) closeEps(); else if (panel.open) panelBack(); else if (srch.open) searchBack(); else if (view === "launcher" && sel.id !== "hero") { if (curRow()) sel.mem[sel.id] = sel.col; sel.id = "hero"; sel.col = 0; changed(); } }
        else if (m.a === "play" && view === "launcher") playNow();
        else if (m.a === "search" && view === "launcher") goSearch(); // the phone's Search button, from any state
      }
    };
    s.onclose = function () { if (ws === s) ws = null; if (!connected) enterDemo(); retry(); };
    s.onerror = function () { try { s.close(); } catch (e) {} };
  }
  function retry() {
    var delay = Math.min(5000, 400 * Math.pow(1.6, tries++));
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, delay);
  }

  /* ---------- go ---------- */
  window.__launcher = { sel: sel, data: function () { return data; }, mode: function () { return mode; } };
  setInterval(renderClock, 1000);
  window.addEventListener("resize", function () { paint(); });
  render();
  renderHero();
  if (location.protocol === "file:" || demoOn) { enterDemo(); if (location.protocol !== "file:" && !demoOn) connect(); }
  else connect();

  /* The stage text grows up from above the rows. A long title with a reason and a
     summary would climb under the top bar (Search, Phone on), so it gives room back,
     least important first: the summary shortens, then goes, then the facts line, then the
     hint, and last the title gets smaller. It stops at the bar's bottom plus 24 units of --p
     (24px at 1080). It runs after every stage render (the observer below sees hero, card,
     service, filter and More shelves alike) and again once images and fonts have settled. */
  (function () {
    var bar = document.querySelector(".topbar");
    function fit() {
      Array.prototype.forEach.call(stagetxt.querySelectorAll(".over,.why,.ttl,.facts,.hint"), function (n) {
        n.style.removeProperty("-webkit-line-clamp"); n.style.removeProperty("font-size"); n.style.removeProperty("display");
      });
      var br = bar.getBoundingClientRect(), p = br.height / 56; // the bar is 56 --p units tall
      var limit = br.bottom + p * 24;
      function over() { return stagetxt.getBoundingClientRect().top < limit; }
      function clamp(sel) { return function () { var n = stagetxt.querySelector(sel); if (n) n.style.setProperty("-webkit-line-clamp", "1"); }; }
      function drop(sel) { return function () { var n = stagetxt.querySelector(sel); if (n) n.style.setProperty("display", "none"); }; }
      function size(u) { return function () { var n = stagetxt.querySelector(".ttl"); if (n) n.style.setProperty("font-size", "calc(var(--p) * " + u + ")"); }; }
      var steps = [clamp(".over"), drop(".over"), drop(".hint.nav"), clamp(".why"), size(64), drop(".facts"), size(52)];
      for (var i = 0; i < steps.length && over(); i++) steps[i]();
    }
    // a timer, not requestAnimationFrame: the TV's Edge is often behind Chrome, where frames stop
    var later = 0;
    function soon() { fit(); clearTimeout(later); later = setTimeout(fit, 400); }
    new MutationObserver(soon).observe(stagetxt, { childList: true });
    stagetxt.addEventListener("load", fit, true); // logos inside the action button
    window.addEventListener("load", fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    window.addEventListener("resize", fit);
    window.__fit = fit;
    fit();
  })();
})();
