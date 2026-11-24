/* TV Mode desk: the TV launcher's world, made for a mouse at a desk. Plain REST against the PC's own
   loopback server (never /ws/screen: this page must not count as a TV screen). Every write carries
   X-TVMode: desk. The page never sends an address: only a title key (or a Continue index with its
   title, or a library id) and the app and episode chosen.
   ?demo=1 (or a file: page) runs on canned data with no server. */
(function () {
  "use strict";
  var q = new URLSearchParams(location.search);
  var DEMO = q.has("demo") || location.protocol === "file:";
  var SVC = { netflix: "Netflix", prime: "Prime Video", jiohotstar: "JioHotstar", youtube: "YouTube" };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svcName(s) { return SVC[s] || ""; }
  var NS = "http://www.w3.org/2000/svg";
  function icon(d, cls) {
    var s = document.createElementNS(NS, "svg"), p = document.createElementNS(NS, "path");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); if (cls) s.setAttribute("class", cls);
    p.setAttribute("d", d); s.appendChild(p); return s;
  }
  var CHEV_L = "M15 5l-7 7 7 7", CHEV_R = "M9 5l7 7-7 7";
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  var S = {
    view: "home", app: "all", tried: {}, offOpen: false, rows: null, rowsJSON: "", lib: null, rated: null, year: null, month: 0, city: null,
    tv: "unknown", tvApp: "", want: "", sureTv: false, menu: "", moreOpen: false, moreSel: "", mode: "desk", phone: false, phoneZero: 0, up: false, pending: 0,
    q: "", results: null,
    lf: { state: "all", q: "", sort: "lastAt", dir: -1 }, sure: "",
    panel: null, panelSeq: 0,
    slides: [], hi: 0, hm: null, heroKey: "", markEdit: "",
    det: {}, detPending: {}, marks: {},
    down: null // null while it is unknown; "off" | "starting" once the first answer failed
  };
  var VIEWS = { home: "Home", library: "Library", watched: "Watched", year: "Your year" };

  /* ---------- api ---------- */
  function api(path, body) {
    if (DEMO) return Promise.resolve(demoApi(path, body));
    var opt = body ? { method: "POST", headers: { "Content-Type": "application/json", "X-TVMode": "desk" }, body: JSON.stringify(body) } : { cache: "no-store" };
    return fetch(path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; if (!r.ok && j.ok == null) j.ok = false; return j; });
    });
  }

  var toastT;
  function toast(msg, act) {
    var t = $("#toast"); t.textContent = ""; t.appendChild(el("span", null, msg));
    if (act) {
      var b = el("button", "tundo", act.label); b.type = "button";
      b.addEventListener("click", function () { t.hidden = true; clearTimeout(toastT); act.fn(); });
      t.appendChild(b);
    }
    t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, act ? 8000 : 4200);
  }
  var NET_MSG = "TV Mode did not answer. Is it running on this PC?";
  // a server error word in plain English; `what` leads when the server gave no mapped word
  function failMsg(j, what) {
    var e = j && j.error;
    if (e === "not ready" || (j && j.__status === 503)) return "TV Mode is still starting. Try again in a few seconds.";
    if (e === "unavailable") return "That app didn't answer. Try again in a moment.";
    if (e === "unknown title") return "That title is not in the library any more.";
    // a plain sentence from the server reads fine; a raw code does not
    if (typeof e === "string" && /^[A-Z][^<>{}]{8,140}[.!?]$/.test(e)) return e;
    return what + ". Try again in a moment.";
  }
  function retryAct(fn) { return { label: "Try again", fn: fn }; }
  // the generic server lines say nothing; "services" is "apps" to Dev
  function cleanWhy(w) {
    if (!w || w === "Picked for you" || /^Highly rated on your (services|apps)$/i.test(w)) return "";
    return String(w).replace(/\bservices\b/g, "apps").replace(/\bService\b/g, "App");
  }
  function isYt(m) { return m.t === "lib" ? m.it.kind === "yt" : m.service === "youtube" && m.t === "cont"; }
  function markMsg(title, v) { return v === 1 ? "Marked watched and liked: " + title + "." : "Marked watched, not for me: " + title + ". It will not be suggested."; }

  /* ---------- small parts ---------- */
  function pic(src, title, cls) {
    var p = el("span", cls || "pic");
    var ph = el("span", "ph", (title || "?").trim().charAt(0).toUpperCase()); ph.setAttribute("aria-hidden", "true"); p.appendChild(ph);
    if (src) {
      var i = el("img"); i.alt = ""; i.loading = "lazy"; i.decoding = "async"; i.src = src;
      i.onerror = function () { i.remove(); };
      p.appendChild(i);
    }
    return p;
  }
  function bar(pct, quiet) {
    var b = el("span", "bar"), i = el("i"), n = Math.max(0, Math.min(100, Math.round(pct * 100)));
    i.style.width = n + "%"; b.appendChild(i);
    if (!quiet) b.appendChild(el("span", "sr", n + "% watched"));
    return b;
  }
  // the service's own wordmark (the switcher's tiles are the source), for the Watch at desk button
  function logo(svc) {
    var t = $("#apps [data-svc=\"" + svc + "\"] svg");
    if (!t) return null;
    var c = t.cloneNode(true); c.setAttribute("class", "alogo"); c.setAttribute("aria-hidden", "true"); return c;
  }
  function compact(n) { return n >= 10000 ? Math.round(n / 1000) + "k" : n >= 1000 ? (n / 1000).toFixed(1).replace(".0", "") + "k" : String(n); }
  function runtimeText(min) { if (!min) return ""; var h = Math.floor(min / 60), m = min % 60; return h ? h + "h" + (m ? " " + m + "m" : "") : m + "m"; }
  function occMark(occ) {
    var s = icon(/diwali|dhanteras|bhai|deepavali/.test(occ || "")
      ? "M12 2c1.8 2.6 2.7 4.6 2.7 6.1A2.7 2.7 0 0 1 12 10.8a2.7 2.7 0 0 1-2.7-2.7C9.3 6.6 10.2 4.6 12 2zM2.5 13h19c-.6 4.3-4.6 7.5-9.5 7.5S3.1 17.3 2.5 13z"
      : "M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z", "omark");
    s.firstChild.setAttribute("style", "fill:var(--occ,#ffb04a);stroke:none");
    return s;
  }
  function parseKey(k) { var m = /^(movie|tv)(\d+)$/.exec(k || ""); return m ? { kind: m[1], id: +m[2] } : null; }
  function markWord(v) { return v === 1 ? "Liked it" : v === -1 ? "Not for me" : ""; }
  function itemSvc(it) { return it.svc || (it.services && it.services[0]) || ""; }
  function kindWord(k) { return k === "tv" ? "Series" : k === "movie" ? "Movie" : k === "yt" ? "Video" : "Link"; }
  function whereWord(w) { return w === "Desk" ? "at the desk" : w === "TV" ? "on TV" : w === "Phone" ? "from your phone" : (w || ""); }
  function inApp(svc) { return S.app === "all" || svc === S.app; }

  /* ---------- models: one shape for a card, a hero slide and a panel ---------- */
  function mItem(c, rowId) {
    return { t: "item", key: c.key, title: c.title, service: c.service, img: c.img, kind: c.kind, year: c.year, vote: c.vote, votes: c.votes, why: c.why, over: c.over, occ: c.occ, line: c.line, cid: "i:" + c.key + ":" + (rowId || "") };
  }
  function libKeyByTitle(t) {
    t = String(t || "").toLowerCase(); var l = (S.lib && S.lib.items) || [];
    for (var i = 0; i < l.length; i++) if (parseKey(l[i].id) && String(l[i].show || l[i].title || "").toLowerCase() === t) return l[i].id;
    return "";
  }
  function mCont(c) { return { t: "cont", key: c.key || libKeyByTitle(c.title), i: c.i || 0, title: c.title, service: c.service, img: c.img, pct: c.pct, line: c.line, cid: "c:" + (c.i || 0) }; }
  // "on Wed 4 Nov at 19:48" -> "Wed 4 Nov" (the place word already says "on"); "today at 19:50" stays
  function shortWhen(w) { return String(w || "").replace(/^on /, "").replace(/^(\w{3} \d+ \w{3}) at .*$/, "$1"); }
  function libLine(it) {
    var sub = "";
    if (it.season && it.episode) sub = "S" + it.season + " E" + it.episode + (it.epTitle ? "  ·  " + it.epTitle : "");
    else if (it.epTitle) sub = it.epTitle;
    else if (it.host) sub = it.host;
    return sub;
  }
  function mLib(it) {
    var svc = itemSvc(it);
    return { t: "lib", id: it.id, key: parseKey(it.id) ? it.id : "", it: it, title: it.title, service: svc, img: it.img, pct: it.state === "watching" ? it.pct : 0, state: it.state, sub: libLine(it), line: [whereWord(it.where), it.when].filter(Boolean).join(" · "), meta: [whereWord(it.where), shortWhen(it.when)].filter(Boolean).join(", "), cid: "l:" + it.id };
  }
  function mSlide(h) {
    var m = { service: h.service, title: h.title, img: h.img || h.thumb, thumb: h.thumb || h.img, kick: h.kick, occ: h.occ, sub: h.sub, why: h.why, over: h.over, year: h.year, genres: h.genres, kind: h.kind, vote: h.vote, votes: h.votes, pct: h.pct, left: h.left, stopped: h.stopped, slide: true };
    if (h.k === "cont") { m.t = "cont"; m.i = h.i || 0; } else { m.t = "item"; m.key = h.key; m.se = h.se; m.ep = h.ep; m.next = h.k === "next"; }
    return m;
  }
  function descOf(m) {
    if (m.t === "item") return { k: "item", key: m.key, title: m.title, kind: m.kind };
    if (m.t === "cont") return { k: "cont", i: m.i, title: m.title };
    if (m.t === "lib") return { k: "lib", id: m.id, title: m.title, it: m.it };
    return { k: "svc" };
  }
  function targetOf(m) { return { m: m, d: descOf(m), svc: m.service || "", se: m.se || 0, ep: m.ep || 0 }; }

  /* ---------- details cache (TMDB through Go) ---------- */
  function getDet(key) {
    if (S.det[key]) return Promise.resolve(S.det[key]);
    var k = parseKey(key); if (!k) return Promise.resolve(null);
    if (S.detPending[key]) return S.detPending[key];
    S.detPending[key] = api("/api/title?id=" + k.id + "&type=" + k.kind).then(function (j) {
      delete S.detPending[key];
      if (j && !j.error && j.__status !== 503) { S.det[key] = j; return j; }
      return null;
    }).catch(function () { delete S.detPending[key]; return null; });
    return S.detPending[key];
  }
  function getMark(key) {
    if (!key) return Promise.resolve(0);
    if (S.marks[key] != null) return Promise.resolve(S.marks[key]);
    return api("/api/rated?key=" + encodeURIComponent(key)).then(function (j) { S.marks[key] = (j && j.v) || 0; return S.marks[key]; }).catch(function () { return 0; });
  }

  /* ---------- the hero ---------- */
  var heroEl = $("#hero"), bdA = null, bdB = null, bdSrc = "", txtEl = null;
  function heroInit() {
    heroEl.textContent = "";
    bdA = el("img", "bd"); bdB = el("img", "bd");
    [bdA, bdB].forEach(function (b) { b.alt = ""; b.decoding = "async"; });
    heroEl.appendChild(bdA); heroEl.appendChild(bdB);
    heroEl.appendChild(el("div", "wash")); heroEl.appendChild(el("div", "lamps")); heroEl.appendChild(el("div", "shade"));
    txtEl = el("div", "txt"); heroEl.appendChild(txtEl);
    heroEl.appendChild(el("div", "strip")); heroEl.appendChild(el("div", "pos"));
    // Left and Right change the slide while the hero has focus
    heroEl.tabIndex = 0; heroEl.setAttribute("aria-label", "Featured. Left and right arrow keys change the slide.");
    heroEl.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || (e.target.matches && e.target.matches("input,select,textarea"))) return;
      e.preventDefault(); heroStep(e.key === "ArrowRight" ? 1 : -1); heroEl.focus({ preventScroll: true });
    });
  }
  // the backdrop: the new picture fades in over the old one (400 ms, the one authored moment)
  function setBackdrop(src) {
    if (src === bdSrc) return;
    bdSrc = src;
    var front = bdA.classList.contains("on") ? bdA : bdB.classList.contains("on") ? bdB : null;
    var back = front === bdA ? bdB : bdA;
    if (!src) { if (front) front.classList.remove("on"); return; }
    function show() { if (bdSrc === src) { back.classList.add("on"); if (front) front.classList.remove("on"); } }
    var yt = /^(https?:\/\/[^/]*ytimg\.com\/vi(?:_webp)?\/[^/]+\/)(?!maxresdefault)[^/?]+/.exec(src), tried = false;
    back.onload = function () {
      if (bdSrc !== src) return;
      var box = back.clientWidth || heroEl.clientWidth * 0.7;
      // a small YouTube thumbnail stretched over the banner looks soft: try the big one, keep the small one if it is missing
      if (yt && !tried && back.naturalWidth && back.naturalWidth < 0.7 * box) {
        tried = true;
        var probe = new Image(), small = back.naturalWidth;
        probe.onload = function () { if (bdSrc !== src) return; if (probe.naturalWidth > small) { back.onload = show; back.src = yt[1] + "maxresdefault.jpg"; } else show(); };
        probe.onerror = show;
        probe.src = yt[1] + "maxresdefault.jpg";
        return;
      }
      show();
    };
    back.onerror = function () { if (bdSrc === src) { back.classList.remove("on"); if (front) front.classList.remove("on"); } };
    back.src = src;
    if (back.complete && back.naturalWidth) back.onload();
  }
  function pkCount() { var w = window.innerWidth; return w >= 2300 ? 6 : w >= 1800 ? 5 : 4; }

  function factsOf(m, d) {
    var box = el("div", "facts"), n = 0;
    function part(node) { if (n++) box.appendChild(el("span", "sep")); box.appendChild(node); }
    var vote = d ? d.rating : m.vote, votes = d ? d.votes : m.votes;
    if (vote) {
      if (votes >= 50) { var r = el("span", "rate", Number(vote).toFixed(1)); r.appendChild(el("small", null, compact(votes) + " ratings")); part(r); }
      else part(el("span", "muted", "Too new to rate"));
    }
    if (d && d.cert) part(el("span", "age", d.cert));
    if (m.year) part(el("span", null, m.year));
    ((d && d.genres && d.genres.length ? d.genres : m.genres || []).slice(0, 2)).forEach(function (g) { part(el("span", null, g)); });
    var kind = m.kind || (d && d.type) || "";
    if (d) {
      if (kind === "tv") { if (d.seasons) part(el("span", null, d.seasons + (d.seasons === 1 ? " season" : " seasons"))); }
      else if (d.runtime) part(el("span", null, runtimeText(d.runtime)));
    } else if (kind) part(el("span", null, kind === "tv" ? "Series" : "Movie"));
    return n ? box : null;
  }
  // the shelf "Because you watched X" that carries this title, if any
  function becauseOf(m) {
    var sh = (S.rows && S.rows.shelves) || [];
    for (var i = 0; i < sh.length; i++) {
      var x = sh[i];
      if (x.id === "because" && m.key && (x.items || []).some(function (it) { return it.key === m.key; })) {
        var t = (x.titles && x.titles[0]) || x.title || "";
        var w = String(t).replace(/^because you watched\s*/i, "");
        if (w) return w;
      }
    }
    return "";
  }
  // a real reason first, in plain words; the studio tagline comes after as a muted line
  function whyOf(m, d) {
    if (m.occ && m.line) return m.line;
    var b = becauseOf(m);
    if (b) return "Because you watched " + b;
    // no reason found: the shelf's own why-line for a slide (a card's kicker already carries it); else nothing, and the muted tagline takes the line
    return m.slide ? (cleanWhy(m.why) || m.line || "") : "";
  }
  function tagOf(m, d) {
    if (m.occ && m.line) return "";
    var t = (d && d.tagline && d.tagline.length < 90 ? d.tagline : "") || (m.slide ? cleanWhy(m.why) : "");
    return t && t !== whyOf(m, d) ? t : "";
  }

  function openHereBtn(T, label, sayFn, pid) {
    var b = el("button", T.svc ? "btn primary" : "btn second neutral"); b.type = "button"; if (T.svc) b.setAttribute("data-svc", T.svc);
    if (pid) b.setAttribute("data-pid", pid);
    var name = svcName(T.svc), lg = logo(T.svc);
    b.appendChild(document.createTextNode(label));
    if (lg) { b.appendChild(el("span", "div")); b.appendChild(lg); b.setAttribute("aria-label", label + " on " + name); }
    b.addEventListener("click", function () { doOpen(T, "desk", sayFn || hsay, b); });
    return b;
  }
  var NOAPPS = "Not on JioHotstar, Prime Video, Netflix or YouTube";
  function tvTip() { return S.mode === "tv" ? "Plays this on the TV right now" : "The TV is off: it starts first (about half a minute), then plays this"; }
  function tvLabel() { return "Watch on TV"; }
  function playTvBtn(T, label, cls) {
    var b = el("button", cls || "btn second", label); b.type = "button"; b.title = tvTip();
    b.addEventListener("click", function () { doOpen(T, "tv", hsay, b); });
    return b;
  }
  function hsay(msg, err, retry) { toast(msg, err && retry ? retryAct(retry) : undefined); }

  function paintHero(m, quiet) {
    if (!m) return;
    S.hm = m;
    heroEl.classList.remove("skel");
    var d = m.key ? S.det[m.key] : null;
    // the festival light and the service wash
    if (m.occ) heroEl.setAttribute("data-occ", m.occ); else heroEl.removeAttribute("data-occ");
    if (m.service) heroEl.setAttribute("data-svc", m.service); else heroEl.removeAttribute("data-svc");
    setBackdrop(m.img || "");
    if (!quiet) { txtEl.classList.add("fade"); }
    txtEl.textContent = "";
    if (m.occ) txtEl.setAttribute("data-occ", m.occ); else txtEl.removeAttribute("data-occ");
    var svc = svcName(m.service), T = targetOf(m);
    // kicker
    var parts;
    if (m.t === "svc") parts = [svc];
    else if (m.t === "cont") parts = ["Continue", svc];
    else if (m.t === "lib") parts = [m.state === "watching" ? "Continue" : m.state === "saved" ? "Saved" : "", svc];
    else if (m.slide) parts = m.kick ? [m.kick, svc] : [m.next ? "Up next" : "Tonight's pick", svc];
    else parts = ["On " + svc, m.occ ? "" : cleanWhy(m.why)];
    var kk = el("div", "kick", parts.filter(Boolean).join("  ·  "));
    if (m.occ) kk.insertBefore(occMark(m.occ), kk.firstChild);
    txtEl.appendChild(kk);
    var tt = el("div", "ttl" + (m.title.length > 20 ? " long" : ""), m.title); tt.title = m.title; txtEl.appendChild(tt);
    if (m.t === "item") {
      var f = factsOf(m, d); if (f) txtEl.appendChild(f);
      var w = whyOf(m, d); if (m.sub) w = m.sub + (w ? "  ·  " + w : "");
      if (w) txtEl.appendChild(el("div", "why", w));
      var tg = tagOf(m, d); if (tg) txtEl.appendChild(el("div", "tag", tg));
      var ov = m.over || (d && d.overview); if (ov) txtEl.appendChild(el("div", "over", ov));
    } else if (m.t === "cont" || m.t === "lib") {
      var sub = m.t === "lib" ? m.sub : (m.slide ? m.sub : m.line);
      // every Continue slide shows its progress the same way: a bar when known, then time left or percent, then when it stopped
      var hasProg = m.pct || m.left || m.stopped, tp = [];
      if (m.left || m.pct) tp.push(m.left ? m.left + " min left" : Math.round(m.pct * 100) + "% watched");
      if (m.stopped) tp.push("stopped " + m.stopped);
      if (!hasProg && m.t === "cont" && sub) { tp.push(sub); sub = ""; }
      if (!hasProg && m.t === "cont") {
        var ff = el("div", "facts"), fn = 0, fk = m.kind || (d && d.type) || "";
        [m.year || (d && d.year) || "", fk === "tv" ? "Series" : fk === "movie" ? "Movie" : "", d && d.runtime && fk !== "tv" ? runtimeText(d.runtime) : ""].filter(Boolean).forEach(function (x) { if (fn++) ff.appendChild(el("span", "sep")); ff.appendChild(el("span", null, x)); });
        if (fn) txtEl.appendChild(ff);
      }
      if (sub) txtEl.appendChild(el("div", "why", sub));
      if (tp.length) {
        var pr = el("div", "prog");
        if (m.pct) { pr.appendChild(bar(m.pct, true)); pr.firstChild.className = "bar"; }
        pr.appendChild(el("span", null, tp.join("  \u00b7  "))); txtEl.appendChild(pr);
      }
      if (m.t === "lib" && m.line) txtEl.appendChild(el("div", "over", m.line));
    } else if (m.t === "svc") {
      txtEl.appendChild(el("div", "why", m.why));
    }
    // actions
    var acts = el("div", "acts");
    var noApps = m.t === "item" && d && Array.isArray(d.services) && d.services.length === 0;
    if (noApps) {
      txtEl.appendChild(el("div", "why", NOAPPS));
    } else if (m.t === "svc") {
      var hb = el("button", "btn primary", "Open " + svc + " here"); hb.type = "button"; hb.setAttribute("data-svc", m.service);
      hb.addEventListener("click", function () { doOpen(T, "desk", hsay, hb); });
      acts.appendChild(hb);
      acts.appendChild(playTvBtn(T, "Open " + svc + " on TV"));
    } else {
      var canHere = m.t !== "lib" || m.it.canHere, canTV = m.t !== "lib" || m.it.canTV;
      var lab = "Watch at desk" + (m.se && m.ep ? "  ·  S" + m.se + " E" + m.ep : "");
      if (canHere) acts.appendChild(openHereBtn(T, lab));
      if (canTV) acts.appendChild(playTvBtn(T, tvLabel()));
      if (m.t === "item" && m.key) acts.appendChild(watchedBtn(m));
    }
    txtEl.appendChild(acts);
    if (!quiet) requestAnimationFrame(function () { requestAnimationFrame(function () { txtEl.classList.remove("fade"); }); });
    fitHero();
    paintStrip();
    // details for a card the mouse rests on: the overview and facts arrive a moment later
    if (m.t === "item" && m.key && !S.det[m.key]) {
      var mm = m;
      getDet(m.key).then(function (dd) { if (dd && S.hm === mm) paintHero(mm, true); });
    }
  }
  // the text block never climbs above the banner or into the app strip: drop the overview, then the facts
  function fitHero() {
    var floor = 14;
    txtEl.classList.remove("tight", "tighter");
    if (txtEl.offsetTop < floor) txtEl.classList.add("tight");
    if (txtEl.offsetTop < floor) txtEl.classList.add("tighter");
  }
  function watchedBtn(m) {
    var key = m.key, cur = S.marks[key];
    if (S.markEdit === key) {
      var g = el("span", "acts"); g.style.margin = "0";
      [[1, "Liked it"], [-1, "Not for me"]].forEach(function (o) {
        var b = el("button", "btn sm" + (cur === o[0] ? " on" : ""), o[1]); b.type = "button";
        b.addEventListener("click", function () { rateKey(m, o[0]); });
        g.appendChild(b);
      });
      if (cur) { var rm = el("button", "btn sm", "Remove mark"); rm.type = "button"; rm.addEventListener("click", function () { rateKey(m, 0); }); g.appendChild(rm); }
      return g;
    }
    var b = el("button", "btn third", cur ? "Marked: " + markWord(cur) : "Watched it"); b.type = "button";
    b.addEventListener("click", function () { S.markEdit = key; paintHero(m, true); });
    if (cur == null) getMark(key).then(function () { if (S.hm === m && S.markEdit !== key) paintHero(m, true); });
    return b;
  }
  function rateKey(m, v, undo) {
    var prev = S.marks[m.key] || 0;
    api("/api/desk/rate", { key: m.key, v: v, title: m.title, service: m.service || "", kind: m.kind || "" }).then(function (j) {
      if (j && j.ok) {
        S.marks[m.key] = j.v; S.rated = null; S.markEdit = "";
        if (undo) toast("Mark put back on " + m.title + ".");
        else toast(v === 0 ? "Mark removed from " + m.title : markMsg(m.title, v), { label: "Undo", fn: function () { rateKey(m, prev, true); } });
        if (S.hm === m) paintHero(m, true);
      } else toast(failMsg(j, "Could not mark it"), retryAct(function () { rateKey(m, v, undo); }));
    }).catch(function () { toast(NET_MSG, retryAct(function () { rateKey(m, v, undo); })); });
  }

  // the slides as a strip of thumbnails with arrows; no auto-rotate
  function paintStrip() {
    var strip = $(".strip", heroEl), pos = $(".pos", heroEl);
    strip.textContent = ""; pos.textContent = "";
    var l = S.slides;
    if (l.length < 2) return;
    var n = Math.min(pkCount(), l.length), start = Math.max(0, Math.min(S.hi - Math.floor(n / 2), l.length - n));
    var cur = S.hm && S.hm.slide;
    var pv = el("button", "pnav"); pv.type = "button"; pv.disabled = S.hi <= 0; pv.setAttribute("aria-label", "Previous slide"); pv.appendChild(icon(CHEV_L));
    var nx = el("button", "pnav"); nx.type = "button"; nx.disabled = S.hi >= l.length - 1; nx.setAttribute("aria-label", "Next slide"); nx.appendChild(icon(CHEV_R));
    pv.addEventListener("click", function () { heroStep(-1); }); nx.addEventListener("click", function () { heroStep(1); });
    strip.appendChild(pv);
    var pks = el("div", "pks");
    for (var k = start; k < start + n; k++) (function (k) {
      var h = l[k], b = el("button", "pk"); b.type = "button"; b.setAttribute("aria-label", h.title);
      var pph = el("span", "ph", (h.title || "?").charAt(0).toUpperCase()); pph.setAttribute("aria-hidden", "true"); b.appendChild(pph);
      var src = h.thumb || h.img;
      if (src) { var im = el("img"); im.alt = ""; im.src = src; im.onerror = function () { im.remove(); }; b.appendChild(im); }
      b.appendChild(el("span", "t", h.title));
      if (k === S.hi && cur) b.setAttribute("aria-current", "true");
      b.addEventListener("click", function () { S.hi = k; heroShow(); });
      pks.appendChild(b);
    })(k);
    strip.appendChild(pks); strip.appendChild(nx);
    pos.textContent = (S.hi + 1) + " / " + l.length;
  }
  function heroStep(d) { var l = S.slides; if (l.length < 2) return; var n = S.hi + d; if (n < 0 || n >= l.length) return; S.hi = n; heroShow(); }
  function heroShow() { S.markEdit = ""; var m = S.slides[S.hi]; if (m) paintHero(m); }

  // slides for the chosen app; an app with none still gets a hero with its two Open buttons
  function heroSet() {
    var f = S.rows, list = (f && f.hero && (f.hero.all || f.hero)) || [];
    if (!Array.isArray(list)) list = [];
    var prevKey = S.slides[S.hi] && S.slides[S.hi].title + "|" + S.slides[S.hi].service;
    var rest = list.filter(function (h) { return inApp(h.service); }).map(mSlide);
    // the newest Continue title for the filtered app leads, whatever the banner sent
    // never a YouTube clip: the first long-form Continue title, else Tonight's pick leads
    var cm = contModels().filter(function (m) { return inApp(m.service) && !isYt(m); })[0], first = null;
    if (cm) {
      first = {}; for (var k in cm) first[k] = cm[k];
      first.slide = true;
      if (first.t === "cont") first.sub = first.line;
      rest = rest.filter(function (m) { return !(m.title === first.title && m.service === first.service); });
    }
    // the other slots come from For you and the occasion picks, never more Continue titles (those sit in the Continue row)
    var others = rest.filter(function (m) { return m.t !== "cont"; });
    S.slides = (first ? [first] : []).concat(others).slice(0, 6);
    var keep = -1;
    S.slides.forEach(function (m, i) { if (m.title + "|" + m.service === prevKey) keep = i; });
    S.hi = keep >= 0 ? keep : 0;
  }
  function heroRefresh(force) {
    if (!S.rows) { heroEl.classList.add("skel"); return; }
    var m;
    if (S.slides.length) m = S.slides[Math.min(S.hi, S.slides.length - 1)];
    else if (S.app !== "all") m = { t: "svc", service: S.app, title: svcName(S.app), why: "Nothing from " + svcName(S.app) + " on the banner right now. Its home page is one click away.", img: "" };
    else m = { t: "svc", service: "", title: "Nothing here yet", why: "The TV has nothing to show yet. Its rows fill in a minute or two after TV Mode starts.", img: "", empty: true };
    var same = S.hm && S.hm.title === m.title && S.hm.service === m.service && S.hm.slide === m.slide;
    if (same && !force) return;
    paintHero(m);
  }

  /* ---------- rows ---------- */
  // the card: a hover/focus overlay inside the picture carries kind, year and rating; the hero is for its slides only
  function card(m) {
    var b = el("button", "card"); b.type = "button"; b.setAttribute("data-svc", m.service || ""); b.setAttribute("data-cid", m.cid || "");
    var p = pic(m.img, m.title);
    if (m.pct) p.appendChild(bar(m.pct));
    // the overlay never repeats the line under the card: a library card adds its episode, a Continue card adds nothing
    var ov = m.t === "item" ? [m.kind === "tv" ? "Series" : m.kind === "movie" ? "Movie" : "", m.year, m.vote ? Number(m.vote).toFixed(1) : ""].filter(Boolean).join(" · ") : m.t === "lib" ? m.sub || "" : "";
    var meta, none = false;
    if (m.t === "item" && m.apps) { meta = m.apps.length ? m.apps.map(svcName).join(" · ") : "Not on your apps"; none = !m.apps.length; }
    else if (m.t === "item" && m.fromSearch && !svcName(m.service)) { meta = m.checking ? "Checking apps\u2026" : "Apps unknown"; none = true; }
    else if (m.t === "item") meta = svcName(m.service);
    else if (m.t === "lib") meta = [svcName(m.service), m.meta].filter(Boolean).join(" · ");
    else meta = [svcName(m.service), m.line].filter(Boolean).join(" · ");
    if (ov && ov !== meta) { var ovs = el("span", "ov", ov); ovs.setAttribute("aria-hidden", "true"); p.appendChild(ovs); }
    b.appendChild(p);
    var ct = el("span", "ct", m.title); ct.title = m.title; b.appendChild(ct);
    b.appendChild(el("span", "cm" + (none ? " none" : ""), meta));
    b.addEventListener("click", function () { if (m.fromSearch && S.q.trim()) pushRecent(S.q); $$(".card.sel").forEach(function (e) { e.classList.remove("sel"); }); b.classList.add("sel"); openPanel(m, b); });
    if (S.panel && S.panel.m.cid === m.cid) b.classList.add("sel");
    return b;
  }

  // one Tab stop per rail: the last-focused (or first) card; arrows, Home and End move between cards
  function rove(tr) {
    var cs = $$(".card", tr); if (!cs.length) return;
    cs.forEach(function (c, i) { c.tabIndex = i === 0 ? 0 : -1; });
    tr.addEventListener("focusin", function (e) {
      var c = e.target.closest && e.target.closest(".card"); if (!c || c.parentNode !== tr) return;
      cs.forEach(function (x) { x.tabIndex = x === c ? 0 : -1; });
    });
    tr.addEventListener("keydown", function (e) {
      var c = e.target.closest && e.target.closest(".card"); if (!c || c.parentNode !== tr || e.shiftKey) return;
      var i = cs.indexOf(c), n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? cs.length - 1 : -1;
      if (n < 0) return;
      e.preventDefault(); n = Math.max(0, Math.min(cs.length - 1, n));
      cs.forEach(function (x, k) { x.tabIndex = k === n ? 0 : -1; });
      cs[n].focus({ preventScroll: true }); cs[n].scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    });
  }
  function rowEl(id, title, why, models, occ, noHead) {
    var sec = el("section", "rrow"); sec.setAttribute("data-row", id);
    if (occ) sec.setAttribute("data-occ", occ);
    if (!noHead) {
      var h = el("div", "rhead"), h2 = el("h2");
      h2.id = "rh-" + String(id).replace(/[^\w-]/g, "_"); sec.setAttribute("aria-labelledby", h2.id);
      if (occ) h2.appendChild(occMark(occ));
      h2.appendChild(document.createTextNode(title)); h.appendChild(h2);
      if (why) h.appendChild(el("span", "why2", why));
      sec.appendChild(h);
    }
    var tr = el("div", "track");
    models.forEach(function (m) { tr.appendChild(card(m)); });
    rove(tr);
    var l = el("button", "chev l"), r = el("button", "chev r");
    [[l, CHEV_L, -1, "back"], [r, CHEV_R, 1, "forward"]].forEach(function (x) {
      x[0].type = "button"; x[0].setAttribute("aria-label", "Scroll " + title + " " + x[3]); x[0].appendChild(icon(x[1]));
      x[0].addEventListener("click", function () { tr.scrollBy({ left: x[2] * tr.clientWidth * 0.85, behavior: "smooth" }); });
    });
    function edges() { l.hidden = tr.scrollLeft < 8; r.hidden = tr.scrollLeft + tr.clientWidth >= tr.scrollWidth - 8; }
    tr.addEventListener("scroll", edges, { passive: true });
    sec.appendChild(l); sec.appendChild(r); sec.appendChild(tr);
    requestAnimationFrame(edges);
    return sec;
  }
  function skelRow() {
    var sec = el("section", "rrow"), h = el("div", "rhead"), t = el("h2", "sk", " "); t.style.width = "220px"; h.appendChild(t); sec.appendChild(h);
    var tr = el("div", "track");
    for (var i = 0; i < 9; i++) { var c = el("span", "card skel"); c.appendChild(el("span", "pic")); c.appendChild(el("span", "ct", " ")); c.appendChild(el("span", "cm", " ")); tr.appendChild(c); }
    sec.appendChild(tr); return sec;
  }
  function contModels() {
    var w = [];
    if (S.lib) w = S.lib.items.filter(function (it) { return it.state === "watching"; }).sort(function (a, b) { return (b.lastAt || 0) - (a.lastAt || 0); }).map(mLib);
    if (!w.length) w = ((S.rows && S.rows.cont) || []).map(mCont);
    // long-form titles first; a YouTube clip at 85% or more is finished; at most three clips, at the end
    var long = w.filter(function (m) { return !isYt(m); });
    var clips = w.filter(function (m) { return isYt(m) && !(m.pct >= 0.85); }).slice(0, 3);
    return long.concat(clips);
  }
  function savedModels() {
    if (!S.lib) return [];
    return S.lib.items.filter(function (it) { return it.state === "saved"; }).sort(function (a, b) { return (b.lastAt || 0) - (a.lastAt || 0); }).map(mLib);
  }

  var STOP = { and: 1, the: 1, of: 1, a: 1, an: 1, for: 1, with: 1, in: 1, on: 1, to: 1, you: 1, touch: 1 };
  function words(t) { return String(t || "").toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w && !STOP[w]; }); }
  function sameWord(a, b) { if (a === b) return true; var s = a.length < b.length ? a : b, l = s === a ? b : a; return s.length >= 4 && l.indexOf(s) === 0; }
  // the shelves past the tenth: one quiet section, collapsed; a heading opens one shelf at a time
  function moreEl(list) {
    var sec = el("section", "more"), top = el("button", "mtop"); top.type = "button";
    top.setAttribute("aria-expanded", S.moreOpen ? "true" : "false");
    top.appendChild(el("h2", null, "More shelves")); top.appendChild(el("span", "mcount", list.length + " more"));
    top.appendChild(icon(S.moreOpen ? "M6 14l6-6 6 6" : "M6 10l6 6 6-6", "i"));
    top.addEventListener("click", function () { S.moreOpen = !S.moreOpen; if (!S.moreOpen) S.moreSel = ""; paintRows(); });
    sec.appendChild(top);
    if (S.moreOpen) {
      var ul = el("div", "mlist");
      var LANG = { indian: 1, tamil: 1, malayalam: 1, telugu: 1, korean: 1, anime: 1, spanish: 1, british: 1 };
      var az = function (a, b) { return String(a.noun || a.title).localeCompare(String(b.noun || b.title), undefined, { sensitivity: "base" }); };
      var groups = [
        ["Languages", list.filter(function (r) { return LANG[r.id] && !r.fold; }).sort(az)],
        ["Because you watched", list.filter(function (r) { return r.fold; })],
        ["Kinds", list.filter(function (r) { return !LANG[r.id] && !r.noun && !r.fold; }).sort(az)],
        ["A touch of", list.filter(function (r) { return r.noun; })]
      ];
      groups.forEach(function (g, gi) {
        if (!g[1].length) return;
        var gh = el("h3", "msub", g[0]); gh.id = "mg-" + gi; ul.appendChild(gh);
        var grid = el("div", "mgrid"); grid.setAttribute("role", "group"); grid.setAttribute("aria-labelledby", gh.id);
        g[1].forEach(function (r) {
          var open = S.moreSel === r.id, b = el("button", "mh" + (open ? " on" : "")); b.type = "button"; b.setAttribute("aria-expanded", open ? "true" : "false");
          b.id = "mh-" + String(r.id).replace(/[^\w-]/g, "_");
          if (r.occ) b.appendChild(occMark(r.occ));
          var lab = r.noun ? "A touch of " + r.noun : r.title;
          var mt = el("span", "mt", lab); mt.title = lab; b.appendChild(mt); b.appendChild(el("span", "mcount", String(r.models.length)));
          b.addEventListener("click", function () { S.moreSel = open ? "" : r.id; paintRows(); var nb = document.getElementById(b.id); if (nb) nb.focus({ preventScroll: true }); });
          grid.appendChild(b);
          if (open) { var rail = rowEl(r.id, r.title, "", r.models, r.occ, true); rail.setAttribute("aria-labelledby", b.id); grid.appendChild(rail); }
        });
        ul.appendChild(grid);
      });
      sec.appendChild(ul);
    }
    return sec;
  }

  function paintRows() {
    var host = $("#rows"), keep = {};
    $$(".track", host).forEach(function (t) { keep[t.parentNode.getAttribute("data-row")] = t.scrollLeft; });
    host.textContent = "";
    if (!S.rows) { host.appendChild(skelRow()); host.appendChild(skelRow()); return; }
    var any = false;
    function add(sec) { host.appendChild(sec); any = true; }
    if (S.month === 12) {
      var yn = el("button", "yearnudge"); yn.type = "button";
      var yf = S.year && S.year.finished;
      yn.appendChild(el("b", null, "Your year")); yn.appendChild(el("span", null, yf ? yf + (yf === 1 ? " title" : " titles") + " finished so far" : "so far"));
      yn.appendChild(el("span", "go", "See it"));
      yn.addEventListener("click", function () { go("year"); });
      host.appendChild(yn);
    }
    var c = contModels().filter(function (m) { return inApp(m.service); });
    // the hero leads with the first long-form Continue title, so the row starts after it
    var lead = c.filter(function (m) { return !isYt(m); })[0];
    if (lead) c = c.filter(function (m) { return m !== lead; });
    var sv = savedModels().filter(function (m) { return inApp(m.service); });
    // at most 10 rails: Continue, Saved, Because you watched, the occasion, On this day, For you, Top rated, then
    // the next shelves in order; the rest fold into "More shelves"
    var all = [], folded = [];
    if (c.length) all.push({ id: "cont", title: "Continue", why: "", models: c, p: 0 });
    if (sv.length) all.push({ id: "saved", title: "Saved", why: "From your phone and the desk", models: sv, p: 1 });
    (S.rows.shelves || []).forEach(function (s, n) {
      var items = (s.items || []).filter(function (it) { return inApp(it.service); });
      if (!items.length) return;
      var occ = /^occ-/.test(s.id) ? s.id.slice(4) : "";
      var title = (s.titles && s.titles[0]) || s.title || s.id;
      var w = cleanWhy(occ && s.line ? s.line : (s.why && s.why !== title ? s.why : ""));
      // a why-line that only repeats the shelf name says nothing
      if (w && w.toLowerCase().replace(/s$/, "") === String(title).toLowerCase().replace(/s$/, "")) w = "";
      if (s.id === "new" && !w) w = "Newest first";
      if (s.id === "otd" && !w) w = "A year ago today, and out this week in years past";
      var pr = s.id === "because" ? 2 : occ ? 3 : s.id === "otd" ? 4 : s.id === "fy" ? 5 : s.id === "top" ? 6 : s.id === "new" ? 7 : /^fy/.test(s.id) ? 100 + n : 10 + n;
      var rowDef = { id: s.id, title: title, why: w, models: items.map(function (c2) { return mItem(c2, s.id); }), occ: occ, p: pr, n: n };
      if ((s.id === "because" && items.length < 6) || (S.app !== "all" && items.length < 4)) { rowDef.fold = true; folded.push(rowDef); return; } // a short "Because you watched" goes into More shelves
      all.push(rowDef);
    });
    var shown = {};
    all.slice().sort(function (a, b) { return a.p - b.p; }).slice(0, 10).forEach(function (r) { shown[r.id] = 1; });
    var more = [];
    all.slice().sort(function (a, b) { return a.p - b.p; }).forEach(function (r) { if (shown[r.id]) add(rowEl(r.id, r.title, r.why, r.models, r.occ)); else more.push(r); });
    more.sort(function (a, b) { return a.p - b.p; });
    // "For you, with a touch of X" variants: list the noun only, and drop one a shown or listed shelf already covers
    var covers = all.filter(function (r) { return shown[r.id] || r.p < 100; }).map(function (r) { return r.title; });
    more = more.filter(function (r) {
      if (r.p < 100) return true;
      r.noun = r.title.replace(/^for you,?\s*with a touch of\s*/i, "");
      var nw = words(r.noun);
      if (!nw.length) return true;
      var dup = covers.some(function (t) { var tw = words(t); return nw.every(function (w) { return tw.some(function (x) { return sameWord(w, x); }); }); });
      if (!dup) covers.push(r.noun);
      return !dup;
    });
    more = more.concat(folded);
    if (more.length) add(moreEl(more));
    if (!any) {
      var e = el("p", "empty", S.app === "all" ? "The TV has nothing to show yet. Its rows fill in a minute or two after TV Mode starts." : "Nothing from " + svcName(S.app) + " in the rows right now. Open " + svcName(S.app) + " from its tile above.");
      e.style.padding = "32px var(--gut)"; host.appendChild(e);
    }
    $$(".track", host).forEach(function (t) { var x = keep[t.parentNode.getAttribute("data-row")]; if (x) t.scrollLeft = x; });
  }

  function paintHome() {
    if (!S.rows) {
      heroEl.classList.add("skel"); txtEl.textContent = ""; setBackdrop("");
      [["120px", "14px"], ["420px", "64px"], ["300px", "16px"], ["220px", "52px"]].forEach(function (s) { var b = el("div", "sk"); b.style.width = s[0]; b.style.height = s[1]; txtEl.appendChild(b); });
      S.hm = null; paintRows(); return;
    }
    heroSet(); heroRefresh(false); paintRows();
  }

  /* ---------- views other than Home ---------- */
  function pageHead(title, sub, noChips) {
    var f = document.createDocumentFragment();
    f.appendChild(el("h1", null, title));
    f.appendChild(el("p", "sub", sub));
    if (!noChips) f.appendChild(chipsEl());
    return f;
  }
  // search results as models: the app each title is on (from its details), titles on an app first
  function searchModels(ignoreApp) {
    var l = S.results.items.map(function (c, i) {
      var m = mItem(c, "search"), d = S.det[c.key];
      m.fromSearch = true; m.idx = i;
      if (d && Array.isArray(d.services)) { m.apps = d.services.slice(); m.service = d.services.length ? (d.services.indexOf(m.service) >= 0 ? m.service : d.services[0]) : ""; }
      else if (c.key && !S.tried[c.key]) m.checking = true;
      return m;
    });
    l = l.filter(function (m) { return ignoreApp || S.searchAll || S.app === "all" || (m.apps ? m.apps.indexOf(S.app) >= 0 : m.service === S.app); });
    var rank = function (m) { return m.apps ? (m.apps.length ? 0 : 2) : (m.service ? 0 : 1); };
    l.sort(function (a, b) { return rank(a) - rank(b) || a.idx - b.idx; });
    return l;
  }
  function renderSearch(pg) {
    var t = S.q.trim(), Q = "\u201c" + t + "\u201d";
    var wrap = el("div", "res");
    var h = el("h2", null, "Search"); wrap.appendChild(h);
    wrap.appendChild(chipsEl());
    if (S.searchAll && S.app !== "all") {
      var an = el("p", "allnote", "Showing all apps");
      var ob = el("button", "btn sm", svcName(S.app) + " only"); ob.type = "button";
      ob.addEventListener("click", function () { S.searchAll = false; render(); });
      an.appendChild(ob); wrap.appendChild(an);
    }
    if (!S.results) { h.appendChild(el("span", null, Q)); wrap.appendChild(el("p", "empty", "Searching...")); }
    else if (S.results.error) {
      h.appendChild(el("span", null, Q));
      var ep = el("p", "empty", "Search did not answer. Check that TV Mode is running, then try again.");
      var rb = el("button", "btn sm retry", "Try again"); rb.type = "button"; rb.addEventListener("click", function () { S.results = null; render(); doSearch(t); });
      ep.appendChild(document.createElement("br")); ep.appendChild(rb); wrap.appendChild(ep);
    } else {
      var items = searchModels();
      var off = items.filter(function (m) { return m.apps && !m.apps.length; });
      var on = items.filter(function (m) { return !(m.apps && !m.apps.length); });
      var pend = on.filter(function (m) { return m.checking; }).length, n = on.length - pend;
      if (items.length) h.textContent = n + " on your apps"; if (items.length) h.appendChild(el("span", null, "for " + Q + (pend ? "  \u00b7  checking " + pend + " more\u2026" : "")));
      if (!items.length) {
        var filtered = S.results.items.length && S.app !== "all" && !S.searchAll;
        var hid = filtered ? searchModels(true).filter(function (m) { return m.apps && m.apps.length; }) : [];
        var hidden = hid.length, hApps = [];
        hid.forEach(function (m) { m.apps.forEach(function (a) { if (hApps.indexOf(a) < 0) hApps.push(a); }); });
        h.appendChild(el("span", null, "for " + Q));
        var ne = el("p", "empty", filtered ? "Nothing on " + svcName(S.app) + " for " + Q + "." : "Nothing found for " + Q + ".");
        if (filtered && hidden) {
          ne.appendChild(document.createElement("br"));
          var sb = el("button", "btn sm retry", "Show " + hidden + " on " + (hApps.length === 1 ? svcName(hApps[0]) : "other apps")); sb.type = "button";
          sb.addEventListener("click", function () { S.searchAll = true; render(); });
          ne.appendChild(sb);
        }
        wrap.appendChild(ne);
      }
      else {
        if (on.length) { var g = el("div", "grid"); on.forEach(function (m) { g.appendChild(card(m)); }); wrap.appendChild(g); }
        else wrap.appendChild(el("p", "empty", "None of these are on your apps."));
        if (off.length) {
          var dt = el("details", "notapps"); if (S.offOpen) dt.open = true;
          dt.addEventListener("toggle", function () { S.offOpen = dt.open; });
          dt.appendChild(el("summary", null, "Not on your apps (" + off.length + ")"));
          var g2 = el("div", "grid sm"); off.forEach(function (m) { g2.appendChild(card(m)); }); dt.appendChild(g2);
          wrap.appendChild(dt);
        }
      }
    }
    pg.appendChild(wrap);
  }
  var searchT, searchSeq = 0, detRenderT = 0;
  // details for every result, four at a time; the cache (S.det) means a repeat search asks for nothing
  function fetchResultDetails(my, list) {
    var q = list.filter(function (c) { return c.key && !S.det[c.key]; }), at = 0;
    list.forEach(function (c) { if (c.key && S.det[c.key]) S.tried[c.key] = 1; });
    function lazyRender() {
      if (detRenderT || my !== searchSeq) return;
      detRenderT = setTimeout(function () { detRenderT = 0; if (my === searchSeq) render(); }, 350);
    }
    function worker() {
      if (my !== searchSeq || at >= q.length) return Promise.resolve();
      var c = q[at++];
      return getDet(c.key).then(function () { S.tried[c.key] = 1; lazyRender(); return worker(); });
    }
    return Promise.all([worker(), worker(), worker(), worker()]);
  }
  function doSearch(t) {
    var my = ++searchSeq;
    api("/api/search?q=" + encodeURIComponent(t)).then(function (j) {
      if (my !== searchSeq) return;
      S.results = (j && j.items) ? j : { items: [], error: (j && j.error) || "no answer" };
      S.resDone = false; S.tried = {}; render();
      if (S.results.error) { S.openFirst = false; return; }
      var all = fetchResultDetails(my, S.results.items);
      var late = new Promise(function (ok) { setTimeout(ok, 6000); });
      var settle = function () {
        if (my !== searchSeq || S.resDone) return;
        S.resDone = true; render();
        if (S.openFirst) { S.openFirst = false; openFirstResult(); }
      };
      Promise.race([all, late]).then(settle);
      all.then(function () { if (my !== searchSeq) return; S.results.items.forEach(function (c) { if (c.key) S.tried[c.key] = 1; }); if (S.resDone) render(); else settle(); });
    }).catch(function () { if (my === searchSeq) { S.results = { items: [], error: "no answer" }; S.openFirst = false; render(); } });
  }
  function openFirstResult() {
    if (!S.results || S.results.error || S.q.trim().length < 2) return;
    var l = searchModels(); if (!l.length) return;
    var c = $(".res .grid .card");
    if (c) c.click(); else openPanel(l[0], $("#q"));
  }
  // the query lives in the URL (#search=q): the first one adds a history entry, later keystrokes replace it
  function searchHash(t) {
    var cur = location.hash.slice(1), isS = cur.indexOf("search=") === 0;
    try {
      if (t) { var h = "#search=" + encodeURIComponent(t); if (isS) history.replaceState(null, "", location.pathname + location.search + h); else history.pushState(null, "", location.pathname + location.search + h); }
      else if (isS) history.replaceState(null, "", location.pathname + location.search + "#" + S.view);
    } catch (e) {}
  }
  // the "Enter opens the first" hint only shows while something can open
  function hintPaint() { var h = $("#enterHint"); if (h) h.hidden = S.q.trim().length < 2 || !!(S.results && !S.results.error && !searchModels().length); }
  function searchFromHash(t) {
    S.q = t; $("#q").value = t; $("#enterHint").hidden = t.length < 2;
    S.searchAll = false; S.view = "home"; closePanel(true); paintApps();
    S.results = null; render(); doSearch(t);
  }
  function hashQuery() {
    var h = location.hash.slice(1); if (h.indexOf("search=") !== 0) return "";
    try { var t = decodeURIComponent(h.slice(7)).trim(); return t.length >= 2 ? t : ""; } catch (e) { return ""; }
  }
  function onSearchInput() {
    var inp = $("#q"); S.q = inp.value;
    clearTimeout(searchT); S.openFirst = false;
    var t = S.q.trim();
    paintRecent();
    $("#enterHint").hidden = t.length < 2;
    if (t.length < 2) { searchSeq++; S.results = null; S.searchAll = false; searchHash(""); render(); return; }
    if (S.view !== "home") { S.view = "home"; closePanel(true); paintApps(); }
    S.searchAll = false; searchHash(t);
    S.results = null; render();
    searchT = setTimeout(function () { doSearch(t); }, 280);
  }
  // the last eight searches, shown when the field is focused and empty
  var RECENT_KEY = "tvmode.desk.recent";
  function recents() {
    try { var a = JSON.parse(LS.get(RECENT_KEY) || "[]"); return Array.isArray(a) ? a.filter(function (x) { return typeof x === "string" && x; }).slice(0, 8) : []; } catch (e) { return []; }
  }
  function pushRecent(t) {
    t = String(t || "").trim(); if (t.length < 2) return;
    var a = recents().filter(function (x) { return x.toLowerCase() !== t.toLowerCase(); }); a.unshift(t);
    LS.set(RECENT_KEY, JSON.stringify(a.slice(0, 8)));
  }
  function paintRecent() {
    var box = $("#recent"), inp = $("#q"), list = recents();
    if (document.activeElement !== inp || inp.value || !list.length) { box.hidden = true; return; }
    box.textContent = "";
    var hd = el("div", "rhd"); hd.appendChild(el("span", null, "Recent searches"));
    var cl = el("button", "rclear", "Clear"); cl.type = "button"; cl.setAttribute("aria-label", "Clear recent searches");
    cl.addEventListener("click", function () { LS.set(RECENT_KEY, "[]"); box.hidden = true; inp.focus(); });
    hd.appendChild(cl); box.appendChild(hd);
    list.forEach(function (t) {
      var b = el("button", "rit"); b.type = "button"; b.appendChild(icon("M12 7v5l3.5 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z")); b.appendChild(el("span", null, t));
      b.addEventListener("click", function () { inp.value = t; box.hidden = true; onSearchInput(); inp.focus(); });
      box.appendChild(b);
    });
    box.hidden = false;
  }
  function searchBoot() {
    var inp = $("#q"), sb = $("#sbox");
    inp.addEventListener("focus", paintRecent);
    sb.addEventListener("focusout", function (e) { if (!e.relatedTarget || !sb.contains(e.relatedTarget)) $("#recent").hidden = true; });
    inp.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.isComposing) return;
      var t = inp.value.trim(); if (t.length < 2) return;
      e.preventDefault(); $("#recent").hidden = true;
      var sh = $(".res .empty .retry"); if (sh && S.results && !S.results.error) { sh.click(); return; } // nothing opens: Enter presses "Show N on X"
      pushRecent(t);
      if (S.results && !S.results.error && S.q.trim() === t) { if (S.resDone) openFirstResult(); else S.openFirst = true; return; }
      S.openFirst = true;
      if (!S.results) { clearTimeout(searchT); if (S.view !== "home") { S.view = "home"; closePanel(true); paintApps(); } render(); doSearch(t); }
    });
  }

  // a mark without a picture borrows the library or Continue picture for the same title
  function fallbackImg(r) {
    var i, l = (S.lib && S.lib.items) || [], c = (S.rows && S.rows.cont) || [], t = (r.title || "").toLowerCase();
    for (i = 0; i < l.length; i++) if (l[i].img && (l[i].key === r.key || (l[i].title || "").toLowerCase() === t)) return l[i].img;
    for (i = 0; i < c.length; i++) if (c[i].img && (c[i].key === r.key || (c[i].title || "").toLowerCase() === t)) return c[i].img;
    return "";
  }
  function renderWatched(pg) {
    pg.appendChild(pageHead("Watched", "Titles you marked. Open one to change the mark or take it off." + (S.app !== "all" ? " Showing " + svcName(S.app) + " only." : "")));
    if (!S.rated) { pg.appendChild(el("p", "empty", "Loading...")); return; }
    var all = S.rated.filter(function (r) { return inApp(r.service); });
    if (!S.rated.length) { pg.appendChild(el("p", "empty", "Nothing marked yet. Open a title and choose Watched it, then Liked it or Not for me.")); return; }
    if (!all.length) { pg.appendChild(el("p", "empty", "Nothing marked on " + svcName(S.app) + ". Choose All to see the rest.")); return; }
    [[1, "Liked it"], [-1, "Not for me"]].forEach(function (g) {
      var items = all.filter(function (r) { return r.v === g[0]; });
      if (!items.length) return;
      var sec = el("section", "sect"), h = el("h2", null, g[1]); h.appendChild(el("span", null, items.length + (items.length === 1 ? " title" : " titles")));
      sec.appendChild(h);
      var grid = el("div", "grid");
      items.forEach(function (r) {
        var m = { t: "item", key: r.key, title: r.title, service: r.service, img: r.img || fallbackImg(r), kind: r.kind, cid: "w:" + r.key };
        var c = card(m);
        c.lastChild.textContent = [svcName(r.service), r.kind === "tv" ? "Series" : r.kind === "movie" ? "Movie" : "", r.at ? "marked on " + dayWord(r.at * 1000) : ""].filter(Boolean).join(" · ");
        grid.appendChild(c);
      });
      sec.appendChild(grid); pg.appendChild(sec);
    });
  }

  /* ---------- library actions ---------- */
  var STATE_WORD = { watching: "Watching", finished: "Finished", saved: "Saved", dropped: "Dropped" };
  function lbtn(label, fn, cls, svc) {
    var b = el("button", "btn sm" + (cls ? " " + cls : ""), label); b.type = "button"; if (svc) b.setAttribute("data-svc", svc);
    b.addEventListener("click", fn); return b;
  }
  // two actions stay on the row (Watch at desk, Play on TV); the rest sit behind More
  function libActions(it) {
    var act = el("div", "lact");
    if (it.canHere) act.appendChild(lbtn("Watch at desk", function () { libOpen(it, "desk"); }, "fill", itemSvc(it)));
    if (it.canTV) { var tvb = lbtn(tvLabel(), function () { libOpen(it, "tv"); }); tvb.title = tvTip(); act.appendChild(tvb); }
    var open = S.menu === it.id;
    var more = lbtn("More", function () { S.menu = open ? "" : it.id; S.sure = ""; drawTable(); focusMore(it.id, !open); }, open ? "on" : "");
    more.setAttribute("aria-haspopup", "true"); more.setAttribute("aria-expanded", open ? "true" : "false"); more.setAttribute("data-more", it.id);
    more.setAttribute("aria-label", "More actions for " + it.title);
    act.appendChild(more);
    if (open) {
      var menu = el("div", "menu"); menu.setAttribute("role", "group"); menu.setAttribute("aria-label", "More actions for " + it.title);
      function mi(label, fn, cls) { var b = lbtn(label, fn, "mi" + (cls ? " " + cls : "")); menu.appendChild(b); return b; }
      if (it.state !== "finished") mi("Finished", function () { libState(it, "finished"); });
      if (it.state !== "dropped") mi("Drop", function () { libState(it, "dropped"); });
      if (it.state === "finished" || it.state === "dropped") mi("Resume watching", function () { libState(it, "watching"); });
      var sure = S.sure === it.id;
      var rm = mi(sure ? "Sure? Remove" : "Remove from library", function () {
        if (S.sure !== it.id) { S.sure = it.id; drawTable(); focusMore(it.id, false, true); setTimeout(function () { if (S.sure === it.id) { S.sure = ""; if (S.view === "library") drawTable(); } }, 3500); return; }
        S.sure = ""; libRemove(it);
      }, sure ? "on" : "");
      rm.setAttribute("aria-label", "Remove " + it.title + " from the library");
      act.appendChild(menu);
    }
    return act;
  }
  // after a redraw, put focus back where it was (the More button, or the Remove item in the menu)
  function focusMore(id, openedNow, remove) {
    var b = $$("[data-more]").filter(function (e) { return e.getAttribute("data-more") === id; })[0];
    if (!b) return;
    if (remove) { var r = $$(".menu .mi", b.parentNode).slice(-1)[0]; if (r) r.focus(); return; }
    if (openedNow) { var f = $(".menu .mi", b.parentNode); if (f) { f.focus(); return; } }
    b.focus();
  }
  function libReload() {
    return api("/api/library?view=all").then(function (j) {
      if (j && j.items) { S.lib = { items: j.items, counts: j.counts || {} }; if (S.view === "library" || S.view === "year") render(); else if (S.view === "home" && S.rows && S.q.trim().length < 2 && !$("#home").hidden) { paintRows(); heroSet(); heroRefresh(false); paintStrip(); } }
      else if (S.view === "library" && !S.lib) showDown(j);
    }).catch(function () { if (S.view === "library" && !S.lib) showDown(); });
  }
  function libOpen(it, where) {
    var again = function () { libOpen(it, where); };
    api("/api/library/open", { id: it.id, where: where, svc: itemSvc(it) }).then(function (j) {
      if (j && j.ok && DEMO) toast(where === "tv" ? "Demo: this would play on the TV." : "Demo: this would open in your browser.");
      else if (j && j.ok) { toast(where === "tv" ? (j.starting ? "The TV is starting. It will play in about half a minute." : "Sent to the TV.") : "Opened in your browser"); if (where === "tv") setTimeout(pollState, 1500); libReload(); }
      else toast(failMsg(j, "Could not open it"), retryAct(again));
    }).catch(function () { toast(NET_MSG, retryAct(again)); });
  }
  var DONE_WORD = { finished: "marked Finished", dropped: "dropped", watching: "back to watching", saved: "saved" };
  function libState(it, state, undo) {
    var prev = it.state;
    S.menu = "";
    api("/api/library/state", { id: it.id, state: state }).then(function (j) {
      if (j && j.ok) {
        if (undo) toast(it.title + ": put back.");
        else if (state === "finished" || state === "dropped") toast(it.title + ": " + DONE_WORD[state] + ". Gone from the TV's Continue.", { label: "Undo", fn: function () { libState(it, prev, true); } });
        else toast(it.title + ": " + DONE_WORD[state] + ".");
        libReload();
      } else { toast(failMsg(j, "Could not change it"), retryAct(function () { libState(it, state, undo); })); if (S.view === "library") drawTable(); }
    }).catch(function () { toast(NET_MSG, retryAct(function () { libState(it, state, undo); })); });
  }
  function libRemove(it) {
    api("/api/library/remove", { id: it.id }).then(function (j) {
      if (j && j.ok) { S.menu = ""; toast(it.title + " removed from the library."); libReload(); }
      else toast(failMsg(j, "Could not remove it"), retryAct(function () { libRemove(it); }));
    }).catch(function () { toast(NET_MSG, retryAct(function () { libRemove(it); })); });
  }

  function libCounts() {
    var c = { watching: 0, finished: 0, saved: 0, dropped: 0 }, n = 0;
    S.lib.items.forEach(function (it) { if (!inApp(itemSvc(it))) return; n++; if (c[it.state] != null) c[it.state]++; });
    c.total = n; return c;
  }
  function libSummary() {
    var now = new Date(), m0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime(), y0 = new Date(now.getFullYear(), 0, 1).getTime();
    var mo = 0, yr = 0, moV = 0, yrV = 0;
    S.lib.items.forEach(function (it) {
      if (!inApp(itemSvc(it))) return;
      if (it.state !== "finished" || !it.doneAt) return;
      var v = it.kind === "yt";
      if (it.doneAt >= m0) { if (v) moV++; else mo++; }
      if (it.doneAt >= y0) { if (v) yrV++; else yr++; }
    });
    var c = libCounts();
    function both(t, v) { var a = []; if (t) a.push(nTitles(t) + " finished"); if (v) a.push(nVideos(v) + " watched"); return a.join(", "); }
    var out = [];
    if (both(mo, moV)) out.push("This month: " + both(mo, moV));
    if (both(yr, yrV) && both(yr, yrV) !== both(mo, moV)) out.push("This year: " + both(yr, yrV));
    if (c.watching) out.push(c.watching + " watching");
    // a lone "N watching" only repeats the chip counts just below
    if (out.length === 1 && c.watching && !mo && !moV && !yr && !yrV) return "";
    return out.length ? out.join("  \u00b7  ") : "Nothing finished or watching yet";
  }
  function libFiltered() {
    var f = S.lf, qq = f.q.trim().toLowerCase();
    var l = S.lib.items.filter(function (it) {
      return (f.state === "all" || it.state === f.state) && inApp(itemSvc(it)) && (!qq || (it.title || "").toLowerCase().indexOf(qq) >= 0);
    });
    var key = f.sort, dir = f.dir;
    l.sort(function (a, b) {
      var x = key === "svc" ? itemSvc(a) : a[key], y = key === "svc" ? itemSvc(b) : b[key];
      var c = typeof x === "number" || typeof y === "number" ? (x || 0) - (y || 0) : String(x || "").localeCompare(String(y || ""), undefined, { sensitivity: "base" });
      return c ? c * dir : (b.lastAt || 0) - (a.lastAt || 0);
    });
    return l;
  }

  function renderLibrary(pg) {
    pg.appendChild(pageHead("Library", "Everything you watched, saved or dropped. Fix it here." + (S.app !== "all" ? " Showing " + svcName(S.app) + " only." : ""), true));
    // paste a link: a Netflix, Prime Video, JioHotstar or YouTube page goes to Saved
    var box = el("div", "pasteline");
    var inp = el("input"); inp.id = "pasteIn"; inp.type = "text"; inp.placeholder = "Paste a link to save: a YouTube video, or a Netflix, Prime Video or JioHotstar page"; inp.autocomplete = "off"; inp.spellcheck = false;
    inp.setAttribute("aria-label", "Paste a link to save");
    var go1 = el("button", "btn sm", "Save link"); go1.type = "button";
    var msg = el("p", "pnote"); msg.setAttribute("role", "status");
    function save() {
      var u = inp.value.trim(); if (!u) return;
      go1.disabled = true; msg.textContent = "Saving...";
      api("/api/library/add", { url: u }).then(function (j) {
        go1.disabled = false;
        if (j && j.ok) {
          inp.value = ""; var it = j.item || {};
          msg.textContent = (j.dup ? "Already in the library: " : "Saved: ") + (it.title || "link") + (it.canTV ? "" : ". The TV cannot open a plain link; use Watch at desk.");
          libReload();
        } else msg.textContent = failMsg(j, "Could not save it");
      }).catch(function () { go1.disabled = false; msg.textContent = "TV Mode did not answer."; });
    }
    go1.addEventListener("click", save);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); save(); } });
    box.appendChild(inp); box.appendChild(go1);
    if (!S.lib) { pg.appendChild(box); pg.appendChild(msg); pg.appendChild(el("p", "empty", "Loading...")); return; }
    var f = S.lf, c = libCounts(), total = c.total;
    var lsum = libSummary(); if (lsum) pg.appendChild(el("p", "lsum", lsum));
    var bars = el("div", "lfilters"), seg = el("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "State");
    [["all", "All", total], ["watching", "Watching", c.watching || 0], ["finished", "Finished", c.finished || 0], ["saved", "Saved", c.saved || 0], ["dropped", "Dropped", c.dropped || 0]].forEach(function (o) {
      var b = el("button", "btn sm" + (f.state === o[0] ? " on" : ""), o[2] ? o[1] + " " + o[2] : o[1]); b.type = "button"; b.setAttribute("aria-pressed", f.state === o[0] ? "true" : "false");
      b.addEventListener("click", function () { f.state = o[0]; render(); });
      seg.appendChild(b);
    });
    seg.className = "seg lgrp";
    bars.appendChild(seg);
    var cg = chipsEl(); cg.className = "chips lgrp"; cg.setAttribute("aria-label", "App"); bars.appendChild(cg);
    var qi = el("input"); qi.id = "lfQ"; qi.type = "search"; qi.placeholder = "Filter by title"; qi.autocomplete = "off"; qi.spellcheck = false; qi.setAttribute("aria-label", "Filter by title"); qi.value = f.q;
    qi.addEventListener("input", function () { f.q = qi.value; drawTable(); });
    qi.className = "lgrp"; bars.appendChild(qi); pg.appendChild(bars);
    pg.appendChild(box); pg.appendChild(msg);
    var tbl = el("div", "ltable"); tbl.id = "ltable"; tbl.setAttribute("role", "table"); pg.appendChild(tbl);
    drawTable();
  }
  function drawTable() {
    var t = $("#ltable"); if (!t) return;
    t.textContent = "";
    var f = S.lf;
    var head = el("div", "trow thead"); head.setAttribute("role", "row");
    head.appendChild(el("span"));
    [["title", "Title"], ["kind", "Kind"], ["svc", "App"], ["state", "State"], ["lastAt", "Last seen"]].forEach(function (c) {
      var b = el("button", "th", c[1]); b.type = "button";
      if (f.sort === c[0]) { var ar = icon(f.dir > 0 ? "M6 14l6-6 6 6" : "M6 10l6 6 6-6", "sortic"); b.appendChild(ar); b.setAttribute("aria-sort", f.dir > 0 ? "ascending" : "descending"); }
      b.setAttribute("aria-label", "Sort by " + c[1]);
      b.addEventListener("click", function () { if (f.sort === c[0]) f.dir = -f.dir; else { f.sort = c[0]; f.dir = c[0] === "lastAt" ? -1 : 1; } render(); });
      head.appendChild(b);
    });
    head.appendChild(el("span", "th", "Actions"));
    t.appendChild(head);
    var rows = libFiltered();
    if (!rows.length) { t.appendChild(el("p", "empty", S.lib.items.length ? "Nothing matches these filters." : "The library is empty. It fills as you watch on the TV, save from your phone or paste a link.")); return; }
    rows.forEach(function (it) {
      var r = el("div", "trow"); r.setAttribute("data-svc", itemSvc(it)); r.setAttribute("role", "row");
      r.appendChild(pic(it.img, it.title, "tpic"));
      var m = el("div", "tmain"); var tt = el("div", "wtitle", it.title); tt.title = it.title; m.appendChild(tt);
      var sub = libLine(it) + (it.state === "watching" && it.pct ? (libLine(it) ? "  ·  " : "") + Math.round(it.pct * 100) + "% watched" : ""); if (sub) m.appendChild(el("div", "wmeta", sub));
      r.appendChild(m);
      r.appendChild(el("span", "tcell", kindWord(it.kind)));
      var sv = el("span", "tcell"); if (itemSvc(it)) { sv.appendChild(el("span", "sq")); sv.appendChild(document.createTextNode(svcName(itemSvc(it)))); } r.appendChild(sv);
      var st = el("span", "tcell"); st.appendChild(el("span", "chip st-" + it.state, STATE_WORD[it.state] || it.state)); r.appendChild(st);
      var ls = el("span", "tcell two"); ls.appendChild(el("span", null, it.when || "")); ls.appendChild(el("span", "wmeta", whereWord(it.where))); r.appendChild(ls);
      r.appendChild(libActions(it));
      t.appendChild(r);
    });
  }

  /* ---------- Your year: the recap, from the library only ---------- */
  var MONTH_L = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  var MONTH_N = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function yCard(k, val, sub, none) {
    var c = el("div", "yr-card" + (none ? " none" : ""));
    c.appendChild(el("div", "k", k)); c.appendChild(el("div", "v", val));
    if (sub) c.appendChild(el("div", "s", sub));
    return c;
  }
  var DAY_N = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON_N = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dayWord(ms) { var d = new Date(ms); return DAY_N[d.getDay()] + " " + d.getDate() + " " + MON_N[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : ""); }
  function nTitles(n) { return n + (n === 1 ? " title" : " titles"); }
  function nVideos(n) { return n + (n === 1 ? " video" : " videos"); }
  function renderYear(pg) {
    pg.appendChild(pageHead("Your year", "All apps. Worked out from your library, nothing else.", true));
    var r = S.year;
    if (!r) { pg.appendChild(el("p", "empty", "Loading...")); return; }
    var w = el("div", "yr");
    var since = r.sinceMs ? new Date(r.sinceMs).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
    if (r.empty && !r.finished) {
      w.appendChild(el("p", "empty", "Nothing is recorded yet. Titles you finish on the TV, at the desk or by hand are counted here, and nothing is made up in the meantime."));
      pg.appendChild(w); return;
    }
    // YouTube clips are counted apart, as videos: the PC counts every finished item, so take them out of titles here
    var vids = 0, vidMonth = {};
    if (S.lib) S.lib.items.forEach(function (it) {
      if (it.kind !== "yt" || it.state !== "finished" || !it.doneAt) return;
      var d0 = new Date(it.doneAt); if (d0.getFullYear() !== r.year) return;
      vids++; vidMonth[d0.getMonth() + 1] = (vidMonth[d0.getMonth() + 1] || 0) + 1;
    });
    var titlesDone = Math.max(0, r.finished - vids);
    var started = 0;
    if (S.lib) S.lib.items.forEach(function (it) { if (it.state === "watching" && it.kind !== "yt") started++; });
    var hero = el("div", "yr-hero");
    var b1 = el("div", "yr-big");
    var when = r.partial ? " since " + since : " in " + r.year;
    var startedHead = !titlesDone && started > 0;
    if (startedHead) {
      b1.appendChild(el("div", "yr-num", String(started)));
      b1.appendChild(el("div", "yr-cap", (started === 1 ? "title started" : "titles started") + when));
    } else if (!titlesDone && vids) {
      b1.appendChild(el("div", "yr-num", String(vids)));
      b1.appendChild(el("div", "yr-cap", (vids === 1 ? "video watched" : "videos watched") + when));
    } else {
      b1.appendChild(el("div", "yr-num", String(titlesDone)));
      b1.appendChild(el("div", "yr-cap", (titlesDone === 1 ? "title finished" : "titles finished") + when));
    }
    hero.appendChild(b1);
    if (vids && (titlesDone || startedHead)) { var bv = el("div", "yr-big"); bv.appendChild(el("div", "yr-num mid", String(vids))); bv.appendChild(el("div", "yr-cap", vids === 1 ? "video watched" : "videos watched")); hero.appendChild(bv); }
    if (started && !startedHead) { var bs = el("div", "yr-big"); bs.appendChild(el("div", "yr-num mid", String(started))); bs.appendChild(el("div", "yr-cap", started === 1 ? "title started" : "titles started")); hero.appendChild(bs); }
    if (r.hoursKnown) { var b2 = el("div", "yr-big"); b2.appendChild(el("div", "yr-num mid", r.hours + " h")); b2.appendChild(el("div", "yr-cap", "watched")); hero.appendChild(b2); }
    if (r.dropped) { var b3 = el("div", "yr-big"); b3.appendChild(el("div", "yr-num mid", String(r.dropped))); b3.appendChild(el("div", "yr-cap", "dropped")); hero.appendChild(b3); }
    w.appendChild(hero);
    w.appendChild(el("p", "yr-since", r.partial
      ? "Your record starts on " + since + ", so this is the year so far, not the whole of " + r.year + ". It grows as you watch."
      : "Counted from your library: what you finished, dropped and watched this year."));
    var cards = el("div", "yr-cards");
    var g = r.topGenre, dg = r.dropGenre, lg = r.longest, ts = r.topSvc;
    var thin = (g ? 0 : 1) + (dg ? 0 : 1) + (lg ? 0 : 1) >= 2;
    if (g || !thin) cards.appendChild(g ? yCard("Most finished genre", g.name, g.n + " of " + nTitles(g.of) + " with a known genre") : yCard("Most finished genre", "Not enough yet", "Needs two finished titles in one genre.", true));
    if (dg || !thin) cards.appendChild(dg ? yCard("Most dropped genre", dg.name, dg.n + " of " + nTitles(dg.of) + " with a known genre") : yCard("Most dropped genre", "Not enough yet", "Needs two dropped titles in one genre.", true));
    if (lg || !thin) cards.appendChild(lg ? yCard("Longest show", lg.title, lg.episodes + " episodes, about " + lg.hours + " h") : yCard("Longest show", "Not enough yet", "Needs a series with two episodes watched.", true));
    var tsStart = null; // nothing finished yet: rank apps by titles started
    if (startedHead && S.lib) { var cnt = {}, bestS = ""; S.lib.items.forEach(function (it) { var sv = itemSvc(it); if (it.state === "watching" && it.kind !== "yt" && sv) { cnt[sv] = (cnt[sv] || 0) + 1; if (!bestS || cnt[sv] > cnt[bestS]) bestS = sv; } }); if (bestS) tsStart = { name: svcName(bestS) || bestS, n: cnt[bestS], of: started }; }
    if (tsStart) cards.appendChild(yCard("Top app", tsStart.name, tsStart.n + " of " + nTitles(tsStart.of) + " started"));
    else cards.appendChild(ts ? yCard("Top app", ts.name, vids && !titlesDone ? ts.n + " of " + nVideos(ts.of) + " watched" : ts.n + " of " + nTitles(ts.of) + " finished") : yCard("Top app", "Not enough yet", "Shows once a title is finished.", true));
    w.appendChild(cards);
    if (thin) w.appendChild(el("p", "yr-since", "Genres and your longest show appear once you finish two titles in a genre."));
    var onlyVids = !titlesDone && vids > 0;
    var h2 = el("h2", null, "Month by month"); h2.appendChild(el("span", null, onlyVids ? "videos watched" : "titles finished")); w.appendChild(h2);
    var max = 1, anyPast = false, nowM = S.month || (new Date().getMonth() + 1);
    var mnum = function (m) { return onlyVids ? (vidMonth[m.M || m.m] || 0) : Math.max(0, (m.n || 0) - (vidMonth[m.M || m.m] || 0)); };
    r.months.forEach(function (m) { if (mnum(m) > max) max = mnum(m); if (m.past) anyPast = true; });
    var nKnown = r.months.filter(function (m) { return m.known; }).length;
    if (nKnown < 2) {
      var km = r.months.filter(function (m) { return m.known; })[0], kc = km ? mnum(km) : 0;
      w.appendChild(el("p", "yr-since", km ? (kc ? (onlyVids ? nVideos(kc) : nTitles(kc)) + " in " + MONTH_N[(km.M || km.m) - 1] : "Nothing finished in " + MONTH_N[(km.M || km.m) - 1]) + ". The months fill in as your record grows." : "No month is recorded yet."));
    } else {
    var strip = el("div", "yr-months"); strip.setAttribute("role", "img");
    strip.setAttribute("aria-label", r.months.map(function (m) { return MONTH_N[(m.M || m.m) - 1] + ": " + (m.known ? mnum(m) : m.past ? "no record" : "not yet"); }).join(", "));
    r.months.forEach(function (m) {
      var mm = m.M || m.m;
      var cls = "yr-m" + (m.known ? (mnum(m) ? "" : " zero") : m.past ? " past" : " future") + (mm === nowM ? " now" : "");
      var c = el("div", cls);
      c.appendChild(el("span", "n", m.known ? String(mnum(m)) : "–"));
      var col = el("span", "col"), i = el("i"); if (m.known) i.style.height = Math.max(mnum(m) ? 6 : 3, Math.round(mnum(m) / max * 132)) + "px"; col.appendChild(i); c.appendChild(col);
      var l = el("span", "l", MONTH_L[mm - 1]); l.title = MONTH_N[mm - 1]; c.appendChild(l);
      strip.appendChild(c);
    });
    w.appendChild(strip);
    w.appendChild(el("p", "yr-key", anyPast ? "Dashed months are from before your record began: there is no count for them, which is not the same as none." : "A flat grey bar is a month with nothing finished."));
    }
    if (r.picks && r.picks.length) {
      var allVid = r.picks.every(function (p) { return p.kind === "yt" || p.svc === "youtube"; });
      var h3 = el("h2", null, allVid ? "Videos you watched" : "What you finished"); h3.appendChild(el("span", null, "newest first")); w.appendChild(h3);
      var pk = el("div", "yr-picks");
      r.picks.forEach(function (p) {
        var d = el("div", "yr-pick"); d.setAttribute("data-svc", p.svc || ""); d.title = p.title;
        d.appendChild(pic(p.img, p.title)); d.appendChild(el("span", "t", p.title));
        pk.appendChild(d);
      });
      w.appendChild(pk);
    }
    pg.appendChild(w);
  }

  /* ---------- the app tiles open an app; the chips filter ---------- */
  var CHIPS = [["all", "All"], ["jiohotstar", "JioHotstar"], ["prime", "Prime Video"], ["netflix", "Netflix"], ["youtube", "YouTube"]];
  function isSearching() { return S.view === "home" && S.q.trim().length >= 2; }
  function chipsEl(host) {
    var h = host || el("div", "chips"); h.textContent = "";
    if (!host) { h.setAttribute("role", "group"); h.setAttribute("aria-label", "Show titles from"); }
    CHIPS.forEach(function (c) {
      var b = el("button", "fchip", c[1]); b.type = "button"; b.setAttribute("data-app", c[0]); b.setAttribute("aria-pressed", c[0] === S.app ? "true" : "false");
      b.addEventListener("click", function () { var s = isSearching(); if (s) { S.searchAll = c[0] === "all"; if (c[0] === "all" || c[0] === S.app) { render(); return; } } setApp(c[0], s); });
      h.appendChild(b);
    });
    return h;
  }
  // the top-bar pill only appears once every chip row has scrolled out of view; its slot is always reserved so search never moves
  var chipSeen = {}, chipIO = null, chipN = 0;
  function pillShown() {
    var own = S.view === "year" || S.view === "library";
    if (S.app === "all" || own) return false;
    for (var k in chipSeen) if (chipSeen[k]) return false;
    return true;
  }
  function observeChips() {
    if (!("IntersectionObserver" in window)) return;
    if (chipIO) chipIO.disconnect();
    chipSeen = {}; chipN = 0;
    chipIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { chipSeen[e.target.getAttribute("data-co")] = e.isIntersecting; });
      paintPill();
    }, { rootMargin: "-72px 0px 0px 0px" });
    $$(".chips").forEach(function (c) { var id = String(chipN++); c.setAttribute("data-co", id); chipSeen[id] = true; chipIO.observe(c); });
  }
  function paintPill() {
    var pill = $("#appsPill"); if (!pill) return;
    var on = pillShown();
    pill.textContent = "";
    // with no filter set the pill holds a ghost of the widest label, so the slot width never changes
    var name = S.app === "all" ? "Prime Video" : svcName(S.app);
    pill.appendChild(el("span", "pfx", "Showing ")); pill.appendChild(el("span", null, name + " · "));
    var sa = el("button", "pillbtn", "Show all"); sa.type = "button"; sa.addEventListener("click", function () { setApp("all"); });
    pill.appendChild(sa);
    pill.classList.toggle("off", !on);
    if (on) pill.removeAttribute("aria-hidden"); else pill.setAttribute("aria-hidden", "true");
  }
  function paintApps() {
    paintPill();
    $$(".fchip").forEach(function (t) { t.setAttribute("aria-pressed", t.getAttribute("data-app") === S.app ? "true" : "false"); });
  }
  function setApp(a, quiet) {
    S.app = a; S.searchAll = false; if (!quiet) LS.set("tvmode.desk.app", a);
    paintApps(); S.markEdit = ""; S.hm = null; S.hi = 0; S.slides = []; // a filter change always starts at slide 1
    if (S.view === "home" && S.q.trim().length < 2) { paintHome(); }
    else render();
  }
  function tileGo(svc, where, btn) { doOpen(targetOf({ t: "svc", service: svc }), where, hsay, btn); }

  /* ---------- drawing ---------- */
  function showDown(j) {
    S.down = j && j.__status === 503 ? "starting" : "off";
    render();
  }
  function renderDown(pg) {
    var d = el("div", "down");
    d.appendChild(el("h1", null, S.down === "starting" ? "TV Mode is getting ready" : "TV Mode is not running"));
    if (S.down === "starting") {
      d.appendChild(el("p", null, "Its data is still loading. This page fills in by itself in a moment."));
    } else {
      var p = el("p"); p.appendChild(document.createTextNode("The desk needs TV Mode on this PC. Double-click ")); p.appendChild(el("b", null, "TV Mode desk")); p.appendChild(document.createTextNode(" on your desktop. This page fills in by itself once it is up."));
      d.appendChild(p);
      var a = el("a", null, "See a demo with sample titles"); a.href = "?demo=1"; var p2 = el("p"); p2.appendChild(a); d.appendChild(p2);
    }
    pg.appendChild(d);
  }

  function render() {
    var home = $("#home"), pg = $("#page");
    var searching = S.q.trim().length >= 2 && !S.down;
    $$(".tab").forEach(function (n) { if (n.getAttribute("data-view") === S.view && !searching && !S.down) n.setAttribute("aria-current", "page"); else n.removeAttribute("aria-current"); });
    $("#apps").hidden = !!S.down;
    $("#yearDot").hidden = S.month !== 12;
    if (S.down) { home.hidden = true; pg.hidden = false; pg.textContent = ""; renderDown(pg); return; }
    if (searching) { home.hidden = true; pg.hidden = false; pg.textContent = ""; renderSearch(pg); observeChips(); hintPaint(); return; }
    if (S.view === "home") { home.hidden = false; pg.hidden = true; paintHome(); observeChips(); return; }
    home.hidden = true; pg.hidden = false;
    var top = window.scrollY; pg.textContent = "";
    if (S.view === "library") renderLibrary(pg);
    else if (S.view === "watched") renderWatched(pg);
    else renderYear(pg);
    observeChips();
    window.scrollTo(0, top);
  }

  function go(view) {
    var had = S.q;
    if (S.q) { S.q = ""; $("#q").value = ""; S.results = null; }
    S.searchAll = false;
    S.menu = ""; S.sure = "";
    if (S.view !== view || had) closePanel(true);
    S.view = view; paintApps();
    if (location.hash.slice(1) !== view) history.replaceState(null, "", location.pathname + location.search + "#" + view);
    window.scrollTo(0, 0);
    render(); load(view);
  }

  function load(view) {
    if (view === "home") {
      api("/api/rows").then(function (j) {
        if (!j || j.__status === 503 || !j.shelves) { if (!S.rows) showDown(j); return; }
        var wasDown = !!S.down; S.down = null;
        var s = JSON.stringify(j);
        if (s === S.rowsJSON && !wasDown) return;
        S.rowsJSON = s; S.rows = j; render();
      }).catch(function () { if (!S.rows) showDown(); });
      libReload();
      if (S.month === 12 && !S.year) yearLoad();
    } else if (view === "year") {
      yearLoad(); if (!S.lib) libReload();
    } else if (view === "library") {
      libReload();
    } else if (view === "watched") {
      api("/api/rated/all").then(function (j) { if (j && j.items) { S.rated = j.items; if (S.view === "watched") render(); } else showDown(j); }).catch(function () { showDown(); });
    }
  }
  function yearLoad() {
    api("/api/desk/year").then(function (j) {
      if (j && j.months) { S.year = j; if (S.view === "year" || (S.view === "home" && S.month === 12)) render(); }
      else if (S.view === "year" && !S.year) showDown(j);
    }).catch(function () { if (S.view === "year" && !S.year) showDown(); });
  }

  /* ---------- the details panel ---------- */
  var lastFocus = null;
  function openPanel(m, opener) {
    var d = descOf(m);
    var P = { m: m, d: d, svc: m.service || "", se: m.se || 0, ep: m.ep || 0, details: null, eps: null, mark: 0, status: "", err: false, seq: (S.panelSeq = S.panelSeq + 1) };
    S.panel = { m: m, P: P };
    lastFocus = opener || document.activeElement;
    var p = $("#panel"), was = !p.hidden;
    p.hidden = false;
    if (!was) { p.classList.add("in-start"); requestAnimationFrame(function () { requestAnimationFrame(function () { p.classList.remove("in-start"); }); }); }
    drawPanel();
    p.scrollTop = 0;
    var cb = $("[data-pid=close]", p); if (cb) cb.focus({ preventScroll: true }); // focus moves into the panel; Esc or Close gives it back
    var seq = P.seq;
    var go = function () {
    var k = parseKey(m.key);
    if (d.k !== "svc" && k) {
      getDet(m.key).then(function (j) {
        if (!S.panel || S.panel.P.seq !== seq || !j) return;
        P.details = j;
        if (d.k !== "item") { /* keep the app it was last on */ }
        else if (Array.isArray(j.services) && !j.services.length) P.svc = "";
        else if (j.services && j.services.length && j.services.indexOf(P.svc) < 0) P.svc = j.services[0];
        else if (j.services && j.services.length && !m.service) P.svc = j.services[0];
        drawPanel();
      });
      getMark(m.key).then(function (v) { if (!S.panel || S.panel.P.seq !== seq) return; P.mark = v; drawPanel(); });
      if (k.kind === "tv") loadSeason(P, 0);
    }
    };
    // a Continue card has no key: look its title up once and use the exact-title match, if any
    if (d.k === "cont" && !m.key && !m.noKey && m.service !== "youtube" && m.title) {
      m.noKey = true; // one look-up per card, not one per click
      api("/api/search?q=" + encodeURIComponent(m.title)).then(function (j) {
        // a Continue card is nearly always a series: a same-name film must not win
        var t = String(m.title).toLowerCase(), same = ((j && j.items) || []).filter(function (c) { return parseKey(c.key) && String(c.title || "").toLowerCase() === t; });
        var hit = same.filter(function (c) { return parseKey(c.key).kind === "tv"; })[0] || (same.length === 1 ? same[0] : null);
        if (hit && S.panel && S.panel.P.seq === seq) { m.key = hit.key; go(); }
      }).catch(function () {});
    } else go();
  }
  function loadSeason(P, n) {
    var seq = P.seq;
    api("/api/episodes?key=" + encodeURIComponent(P.m.key) + "&n=" + n).then(function (j) {
      if (!S.panel || S.panel.P.seq !== seq || !j || !j.eps) return;
      var first = !P.eps;
      P.eps = j;
      if (first && j.nextSe && j.nextEp) { P.se = j.nextSe; P.ep = j.nextEp; }
      else if (P.se !== j.season) { P.se = 0; P.ep = 0; P.picked = false; }
      drawPanel();
    });
  }
  function closePanel(quiet) {
    if (!S.panel) return;
    var cid = S.panel.m.cid;
    S.panel = null; S.panelSeq++;
    var p = $("#panel"); p.hidden = true; p.textContent = "";
    $$(".card.sel").forEach(function (e) { e.classList.remove("sel"); });
    if (!quiet) {
      var back = lastFocus && document.contains(lastFocus) ? lastFocus : (cid ? $$(".card").filter(function (e) { return e.getAttribute("data-cid") === cid; })[0] : null);
      if (back && back.focus) back.focus({ preventScroll: true });
    }
  }
  function epLabel(P) { return P.se && P.ep ? "S" + P.se + " E" + P.ep : ""; }

  function drawPanel() {
    var p = $("#panel"); if (!S.panel) return;
    var P = S.panel.P, d = P.d, m = P.m, det = P.details;
    p.setAttribute("role", "dialog"); p.setAttribute("aria-modal", "true"); p.setAttribute("aria-label", m.title || "Details");
    var had = document.activeElement && p.contains(document.activeElement) ? document.activeElement.getAttribute("data-pid") : null;
    var sc = p.scrollTop;
    p.textContent = "";
    var head = el("div", "phead");
    head.appendChild(el("span", null, d.k === "cont" ? "Continue" : d.k === "lib" ? (STATE_WORD[m.state] || "Library") : "Details"));
    var cl = el("button", "pclose"); cl.type = "button"; cl.setAttribute("data-pid", "close"); cl.setAttribute("aria-label", "Close the panel");
    cl.appendChild(document.createTextNode("Close")); cl.appendChild(el("kbd", null, "Esc"));
    cl.addEventListener("click", function () { closePanel(); });
    head.appendChild(cl); p.appendChild(head);

    p.setAttribute("data-svc", P.svc || "");
    var pc = pic(m.img, m.title); if (m.pct) pc.appendChild(bar(m.pct)); p.appendChild(pc);
    p.appendChild(el("h2", "ptitle", m.title));
    var meta = [];
    if (det) meta = [det.type === "tv" ? "Series" : "Movie", m.year || "", det.runtime ? det.runtime + " min" : "", det.cert, det.rating ? "" + Number(det.rating).toFixed(1) : ""];
    else if (d.k === "item") meta = [m.kind === "tv" ? "Series" : m.kind === "movie" ? "Movie" : "", m.year, m.vote ? "" + Number(m.vote).toFixed(1) : ""];
    else if (d.k === "lib") meta = [kindWord(m.it.kind), svcName(m.service)];
    if (meta.filter(Boolean).length) p.appendChild(el("div", "pmeta", meta.filter(Boolean).join(" · ")));
    if (det && det.genres && det.genres.length) p.appendChild(el("div", "pmeta", det.genres.join(", ")));
    if (d.k === "cont" && m.line) p.appendChild(el("div", "pwhy", m.line));
    if (d.k === "lib") { var ll = [m.sub, m.pct ? Math.round(m.pct * 100) + "% watched" : "", m.line].filter(Boolean).join(" · "); if (ll) p.appendChild(el("div", "pwhy", ll)); }
    if (cleanWhy(m.why) && d.k === "item") p.appendChild(el("div", "pwhy", cleanWhy(m.why)));
    var over = (det && det.overview) || m.over, po = null, pm = null;
    if (over) {
      po = el("p", "pover", over); p.appendChild(po);
      pm = el("button", "pmore", "More"); pm.type = "button"; pm.setAttribute("aria-expanded", "false");
      pm.addEventListener("click", function () { var x = po.classList.toggle("open"); pm.textContent = x ? "Less" : "More"; pm.setAttribute("aria-expanded", x ? "true" : "false"); });
      p.appendChild(pm);
    }
    if (det && det.cast && det.cast.length) p.appendChild(el("div", "pcast", "With " + det.cast.join(", ")));

    var noApps = d.k === "item" && det && Array.isArray(det.services) && det.services.length === 0;
    var services = det && det.services && det.services.length ? det.services : (noApps ? [] : m.service ? [m.service] : []);
    if (noApps) p.appendChild(el("div", "pl pnone", NOAPPS));
    else if (d.k === "item" && services.length > 1) {
      p.appendChild(el("div", "pl", "Watch on"));
      var sg = el("div", "seg");
      services.forEach(function (s) {
        var b = el("button", "btn sm" + (P.svc === s ? " on" : ""), svcName(s)); b.type = "button"; b.setAttribute("data-pid", "svc-" + s); b.setAttribute("aria-pressed", P.svc === s ? "true" : "false");
        b.addEventListener("click", function () { P.svc = s; drawPanel(); });
        sg.appendChild(b);
      });
      p.appendChild(sg);
    } else if (d.k === "item" && services.length === 1) p.appendChild(el("div", "pl", "Watch on " + svcName(services[0])));
    else if (d.k === "cont") p.appendChild(el("div", "pl", "Last on " + svcName(m.service)));

    if (noApps && det && det.type === "tv" && det.seasons) p.appendChild(el("div", "pmeta", det.seasons + (det.seasons === 1 ? " season" : " seasons")));
    if (d.k !== "svc" && !noApps && P.eps && P.eps.eps && P.eps.eps.length) {
      p.appendChild(el("div", "pl", "Episode"));
      var ctl = el("div", "epctl");
      var sel = el("select"); sel.setAttribute("data-pid", "season"); sel.setAttribute("aria-label", "Season");
      for (var n = 1; n <= (P.eps.seasons || 1); n++) { var o = el("option", null, "Season " + n); o.value = n; if (n === P.eps.season) o.selected = true; sel.appendChild(o); }
      sel.addEventListener("change", function () { loadSeason(P, +sel.value); });
      ctl.appendChild(sel);
      // no history at all: the first episode of season 1 is what plays
      var fresh = !P.eps.nextSe && !P.eps.nextEp && !P.eps.eps.some(function (e) { return e.pct; });
      var nxSe = fresh ? 1 : P.eps.nextSe, nxEp = fresh ? 1 : P.eps.nextEp;
      ctl.appendChild(el("span", "pmeta", P.picked && P.se && P.ep ? "Chosen: " + epLabel(P) : nxSe && nxEp ? (fresh ? "Plays S1 E1 unless you pick one" : "Plays S" + nxSe + " E" + nxEp + " next unless you pick one") : "Plays the next one unless you pick one"));
      p.appendChild(ctl);
      var list = el("div", "eps");
      P.eps.eps.forEach(function (e) {
        var isNext = nxSe === P.eps.season && nxEp === e.n;
        var b = el("button", "ep" + (P.se === P.eps.season && P.ep === e.n ? " on" : "") + (isNext ? " next" : "")); b.type = "button"; b.setAttribute("data-pid", "ep-" + e.n);
        b.appendChild(el("span", "en", "E" + e.n));
        b.appendChild(el("span", "nm", e.name || ("Episode " + e.n)));
        b.appendChild(el("span", "em", [isNext ? (e.pct && e.pct < 1 ? "Resume" : "up next") : "", e.pct ? Math.round(e.pct * 100) + "%" : "", e.min ? e.min + " min" : ""].filter(Boolean).join(" · ")));
        b.addEventListener("click", function () { P.se = P.eps.season; P.ep = e.n; P.picked = true; drawPanel(); });
        list.appendChild(b);
      });
      p.appendChild(list);
    }
    if (d.k === "item" && m.key) {
      p.appendChild(el("div", "pl", P.mark ? "You marked this: " + markWord(P.mark) : "Watched it?"));
      var wg = el("div", "seg");
      [[1, "Liked it"], [-1, "Not for me"]].forEach(function (o) {
        var b = el("button", "btn sm" + (P.mark === o[0] ? " on" : ""), o[1]); b.type = "button"; b.setAttribute("data-pid", "rate" + o[0]); b.setAttribute("aria-pressed", P.mark === o[0] ? "true" : "false");
        b.addEventListener("click", function () { ratePanel(o[0]); });
        wg.appendChild(b);
      });
      if (P.mark) { var rm = el("button", "btn sm", "Remove mark"); rm.type = "button"; rm.setAttribute("data-pid", "rate0"); rm.addEventListener("click", function () { ratePanel(0); }); wg.appendChild(rm); }
      p.appendChild(wg);
    }

    // the actions and their status sit in a footer that stays at the bottom of the panel
    var body = el("div", "pbody"); while (p.firstChild) body.appendChild(p.firstChild); p.appendChild(body);
    var foot = el("div", "pfoot");
    var acts = el("div", "pacts");
    var T = { m: m, d: d, svc: P.svc, se: P.se, ep: P.ep };
    var canHere = d.k !== "lib" || m.it.canHere, canTV = d.k !== "lib" || m.it.canTV;
    if (noApps) {
      // on none of the four apps: nothing to open here or on the TV. (Saving a bare title is not possible: the library keeps links.)
      var ya = el("a", "btn third neutral", "Search YouTube for it"); ya.target = "_blank"; ya.rel = "noopener noreferrer";
      ya.href = "https://www.youtube.com/results?search_query=" + encodeURIComponent(m.title + (m.year ? " " + m.year : ""));
      acts.appendChild(ya);
    } else {
      if (canHere) acts.appendChild(openHereBtn(T, "Watch at desk" + (epLabel(P) ? "  ·  " + epLabel(P) : ""), function (s, e, r) { say(P, s, e, r); }, "here"));
      if (canTV) {
        var tv = el("button", "btn"); tv.type = "button"; tv.setAttribute("data-pid", "tv");
        tv.textContent = tvLabel() + (epLabel(P) ? "  ·  " + epLabel(P) : ""); tv.appendChild(el("kbd", null, "T"));
        tv.title = tvTip();
        tv.addEventListener("click", function () { doOpen(T, "tv", function (s, e, r) { say(P, s, e, r); }, tv); });
        acts.appendChild(tv);
      }
    }
    foot.appendChild(acts);
    var st = el("div", "pstatus" + (P.err ? " err" : "")); st.id = "pstatus"; st.setAttribute("role", "status"); st.textContent = P.status; statusRetry(st, P); foot.appendChild(st);
    p.appendChild(foot);
    p.scrollTop = sc;
    // after layout: More appears only when the overview really is cut off; the episode list opens on the chosen or up-next row
    if (po && pm && !(po.scrollHeight > po.clientHeight + 1)) pm.remove();
    var el0 = $(".eps", p);
    if (el0) {
      var row = $(".ep.on", el0) || $(".ep.next", el0);
      if (row) el0.scrollTop = Math.max(0, row.getBoundingClientRect().top - el0.getBoundingClientRect().top + el0.scrollTop - 4);
      // the first time the list appears, bring it above the sticky footer
      if (!P.epsSeen) {
        P.epsSeen = true;
        var ft = $(".pfoot", p), over0 = ft ? el0.getBoundingClientRect().bottom + 12 - ft.getBoundingClientRect().top : 0;
        if (over0 > 0) p.scrollTop = p.scrollTop + over0;
      }
    }
    if (had) { var again = $$("[data-pid]", p).filter(function (e) { return e.getAttribute("data-pid") === had; })[0]; if (again) again.focus({ preventScroll: true }); }
  }
  function say(P, msg, err, retry) {
    P.status = msg; P.err = !!err; P.retry = err ? retry : null;
    var s = $("#pstatus"); if (s) { s.textContent = msg; s.className = "pstatus" + (err ? " err" : ""); statusRetry(s, P); }
  }
  function statusRetry(s, P) {
    if (!P.err || !P.retry) return;
    var b = el("button", "tundo", "Try again"); b.type = "button"; b.setAttribute("data-pid", "retry");
    b.addEventListener("click", function () { var f = P.retry; P.retry = null; f(); });
    s.appendChild(document.createTextNode(" ")); s.appendChild(b);
  }

  function ratePanel(v) {
    if (!S.panel) return;
    var P = S.panel.P, m = P.m;
    api("/api/desk/rate", { key: m.key, v: v, title: m.title, service: P.svc || m.service || "", kind: m.kind || "" }).then(function (j) {
      if (j && j.ok) { P.mark = j.v; S.marks[m.key] = j.v; S.rated = null; say(P, v === 0 ? "Mark removed." : markMsg(m.title, v)); drawPanel(); if (S.hm && S.hm.key === m.key) paintHero(S.hm, true); }
      else say(P, failMsg(j, "Could not mark it"), true, function () { ratePanel(v); });
    }).catch(function () { say(P, NET_MSG, true, function () { ratePanel(v); }); });
  }

  /* ---------- opening: here, or on the TV ---------- */
  function reqFor(T, where) {
    var d = T.d;
    if (d.k === "svc") return { where: where, k: "svc", svc: T.svc };
    var b = { where: where, k: d.k, svc: T.svc || "", se: T.se || 0, ep: T.ep || 0 };
    if (d.k === "item") b.key = d.key; else { b.i = d.i; b.title = d.title; }
    return b;
  }
  function doOpen(T, where, say2, btn) {
    var d = T.d, svc = T.svc, name = svcName(svc);
    if (btn) btn.disabled = true;
    var done = function () { if (btn) btn.disabled = false; };
    var again = function () { doOpen(T, where, say2, btn); };
    say2(where === "tv" ? (S.mode === "tv" ? "Sending to the TV..." : "Starting the TV. It plays when it is up...") : "Opening in your browser...");
    var p = d.k === "lib" ? api("/api/library/open", { id: d.id, where: where, svc: svc || itemSvc(d.it), se: T.se || 0, ep: T.ep || 0 }) : api("/api/desk/open", reqFor(T, where));
    p.then(function (j) {
      done();
      if (j && j.ok) {
        if (where === "desk") { say2(DEMO ? "Demo: this would open " + (name || "the page") + " in your browser." : "Opened in your browser" + (name ? ": " + name : "")); if (d.k === "lib") libReload(); }
        else { say2(j.starting ? "The TV is starting. It will play in about half a minute." : "Sent to the TV."); setTimeout(pollState, 1500); }
      } else say2(failMsg(j, "Could not open it"), true, again);
    }).catch(function () { done(); say2(NET_MSG, true, again); });
  }

  /* ---------- the mode switch, the phone, the clock, the city ---------- */
  var paintedMode = "";
  function appWord(a) { return !a || a === "launcher" ? "Launcher" : svcName(a) || a; }
  function paintMode() {
    var box = $("#tvctl"), word = $("#tvWord"), go = $("#tvGo"), off = $("#tvOff");
    var st = !S.up ? "down" : S.tv === "starting" || S.want === "starting" && S.pending > Date.now() ? "starting" : S.tv === "closing" || S.want === "closing" && S.pending > Date.now() ? "closing" : S.tv === "on" ? "on" : "off";
    box.setAttribute("data-st", st);
    word.textContent = "";
    if (st === "on") { word.appendChild(el("span", "pre", "TV on · ")); word.appendChild(document.createTextNode(appWord(S.tvApp))); }
    else word.textContent = st === "down" ? "TV Mode not answering" : st === "starting" ? "Starting TV..." : st === "closing" ? "Closing TV..." : "TV off";
    $(".tvs", box).title = st === "on" ? "TV on · " + appWord(S.tvApp) : word.textContent;
    go.hidden = st === "down" || st === "starting" || st === "closing";
    go.textContent = st === "on" ? "Bring up" : "Start TV";
    go.title = st === "on" ? "Brings the TV window to the front of the screen" : "Starts the TV window on the TV screen. It takes about half a minute";
    off.hidden = st !== "on";
    if (st !== "on") S.sureTv = false;
    off.textContent = S.sureTv ? "Sure? Turn off" : "Turn TV off";
    off.classList.toggle("sure", S.sureTv);
    off.title = "Close the TV session. TV Mode keeps running";
    if (S.mode !== paintedMode) { // the Play on TV words depend on it
      paintedMode = S.mode;
      if (S.hm && S.view === "home" && !$("#home").hidden) paintHero(S.hm, true);
      if (S.panel) drawPanel();
    }
    var ph = $("#phone"), tx = $("#phoneTxt");
    ph.classList.toggle("on", S.phone); ph.classList.toggle("off", !S.phone);
    tx.textContent = !S.up ? "TV Mode not answering" : S.phone ? "Phone connected" : "No phone";
    ph.title = !S.up ? "TV Mode not answering" : S.phone ? "Phone connected" : "No phone. Pair from the TV's QR code";
  }
  // Start TV and Bring up ask for "tv"; Turn TV off asks for "desk" (the server closes the TV session only)
  function tvAct(mode) {
    if (!S.up) return;
    S.pending = Date.now() + 4000; S.want = mode === "desk" ? "closing" : S.tv === "on" ? "" : "starting";
    api("/api/desk/mode", { mode: mode }).then(function (j) {
      if (j && j.ok) { S.mode = mode; paintMode(); toast(mode === "tv" ? (j.starting ? "Starting the TV. It takes about half a minute." : "The TV is on.") : "TV closed. TV Mode keeps running; your phone shows Start TV."); setTimeout(pollState, 700); setTimeout(pollState, 2500); }
      else { S.pending = 0; S.want = ""; paintMode(); toast(failMsg(j, "Could not switch the TV"), retryAct(function () { tvAct(mode); })); }
    }).catch(function () { S.pending = 0; S.want = ""; paintMode(); toast(NET_MSG, retryAct(function () { tvAct(mode); })); });
    paintMode();
  }
  function pollState() {
    return api("/api/desk/state").then(function (j) {
      if (!j || j.__status === 503 || j.tv == null) { S.up = !!(j && j.__status === 503); paintMode(); return; }
      S.up = true;
      if (S.pending > Date.now() && (j.mode || "desk") !== S.mode) { /* a switch is under way: keep what was chosen until the PC says so */ }
      else { S.mode = j.mode || (j.tv === "on" || j.tv === "starting" ? "tv" : "desk"); S.pending = 0; }
      S.tv = j.tv; S.tvApp = j.app || "";
      if (j.phone) { S.phone = true; S.phoneZero = 0; } else if (++S.phoneZero >= 2) S.phone = false; // the link flaps for a moment now and then
      if (j.month && j.month !== S.month) { S.month = j.month; if (S.month === 12) yearLoad(); render(); }
      paintMode();
    }).catch(function () { S.up = false; paintMode(); });
  }
  function clockTick() {
    var d = new Date();
    $("#clock").textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    $("#clock").title = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  }

  function cityPaint() {
    var c = S.city, sum = $("#citySum"), off = $("#cityOff");
    if (!c || !c.set) { sum.textContent = "Weather off"; off.hidden = true; return; }
    var n = (c.now && c.now.word) ? " · " + c.now.temp + "° " + c.now.word.toLowerCase() : " · waiting for a reading";
    sum.textContent = c.name.split(",")[0] + n;
    off.hidden = false;
    if (!$("#cityForm").hidden && !$("#cityIn").value) $("#cityIn").value = c.name.split(",")[0];
  }
  function cityLoad() { api("/api/desk/city").then(function (j) { if (j && j.ok !== false) { S.city = j; cityPaint(); } }).catch(function () {}); }
  function citySend(city) {
    var note = $("#cityNote"), save = $("#citySave");
    save.disabled = true; note.textContent = city ? "Looking it up..." : "Switching weather off...";
    api("/api/desk/city", { city: city }).then(function (j) {
      save.disabled = false;
      if (j && j.ok) {
        S.city = j; cityPaint();
        note.textContent = !city ? "Weather is off." : "Weather is on for " + j.name + (j.now ? "." : ". The first reading arrives within the hour.");
        if (!city) $("#cityIn").value = "";
      } else note.textContent = (j && j.error) || "TV Mode did not answer.";
    }).catch(function () { save.disabled = false; note.textContent = "TV Mode did not answer."; });
  }
  function popClose(focus) { var f = $("#cityForm"), b = $("#setBtn"); if (f.hidden) return false; f.hidden = true; b.setAttribute("aria-expanded", "false"); if (focus) b.focus(); return true; }
  function cityBoot() {
    var btn = $("#setBtn"), form = $("#cityForm");
    btn.addEventListener("click", function () {
      form.hidden = !form.hidden; btn.setAttribute("aria-expanded", form.hidden ? "false" : "true");
      if (!form.hidden) { cityPaint(); $("#cityIn").focus(); }
    });
    form.addEventListener("submit", function (e) { e.preventDefault(); var t = $("#cityIn").value.trim(); if (t) citySend(t); });
    $("#cityOff").addEventListener("click", function () { citySend(""); });
    document.addEventListener("pointerdown", function (e) { if (!form.hidden && !$("#set").contains(e.target)) popClose(false); });
    cityLoad();
  }

  /* ---------- keyboard ---------- */
  // the open panel is modal: Tab and Shift+Tab cycle inside it
  function trapTab(e) {
    var p = $("#panel");
    var fs = $$("button,select,input,a[href],[tabindex]:not([tabindex='-1'])", p).filter(function (x) { return !x.disabled && !x.hidden && x.offsetParent !== null; });
    if (!fs.length) return;
    var first = fs[0], last = fs[fs.length - 1], a = document.activeElement;
    if (!p.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Tab" && S.panel && !$("#panel").hidden) trapTab(e);
    var t = e.target, typing = t && t.matches && t.matches("input,textarea,select");
    if (e.key === "Escape") {
      if (popClose(true)) { e.preventDefault(); return; }
      if (S.menu) { var mid = S.menu; S.menu = ""; S.sure = ""; e.preventDefault(); drawTable(); focusMore(mid, false); return; }
      if (S.panel) { e.preventDefault(); closePanel(); return; }
      if (typing) { if (t.id === "q" && t.value) { t.value = ""; onSearchInput(); } t.blur(); }
      return;
    }
    if (typing) return;
    if (e.key === "/") { e.preventDefault(); var i = $("#q"); i.focus(); i.select(); }
    else if ((e.key === "t" || e.key === "T") && S.panel) { var tb = $("#panel [data-pid=tv]"); if (tb && !tb.disabled) { e.preventDefault(); tb.click(); } }
  });
  document.addEventListener("pointerdown", function (e) { if (S.menu && !e.target.closest(".lact")) { S.menu = ""; S.sure = ""; drawTable(); } });

  /* ---------- demo data ---------- */
  function dimg(seed) {
    var n = 0, i; for (i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
    var h1 = n % 360, h2 = (h1 + 40 + n % 50) % 360, x = 480 + (n % 400), y = 120 + (n % 160), r = 90 + n % 120;
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='960' height='540' viewBox='0 0 960 540'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(" + h1 + ",42%,26%)'/><stop offset='1' stop-color='hsl(" + h2 + ",46%,8%)'/></linearGradient><radialGradient id='r' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='hsl(" + h2 + ",60%,56%)' stop-opacity='.55'/><stop offset='1' stop-color='hsl(" + h2 + ",60%,56%)' stop-opacity='0'/></radialGradient></defs><rect width='960' height='540' fill='url(#g)'/><circle cx='" + x + "' cy='" + y + "' r='" + (r * 2) + "' fill='url(#r)'/><circle cx='" + x + "' cy='" + y + "' r='" + r / 2 + "' fill='hsl(" + h2 + ",50%,70%)' opacity='.5'/><path d='M0 400 Q240 " + (330 + n % 60) + " 480 390 T960 360 V540 H0Z' fill='#000' opacity='.35'/><path d='M0 450 Q300 " + (400 + n % 40) + " 600 440 T960 430 V540 H0Z' fill='#000' opacity='.35'/></svg>";
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }
  var demoTitles = ["The Long Night", "Paper Moons", "Kaveri", "Last Train to Pune", "Signal Fire", "Monsoon Room", "A Quiet Verdict", "Northbound", "Sector 9", "Thirty Days", "The Understudy", "Glass Harbour", "Rani", "Night Shift", "Ember Court", "Small Hours"];
  var demoSvc = ["netflix", "prime", "jiohotstar", "youtube", "netflix", "prime", "jiohotstar", "netflix"];
  function dItem(p, i) {
    var t = demoTitles[(p * 5 + i) % demoTitles.length] + (i > 15 ? " " + i : "");
    var kind = (i + p) % 2 ? "tv" : "movie";
    return { key: kind + (p * 100 + i + 1), title: t, service: demoSvc[(i * 3 + p) % 8], kind: kind, img: dimg(t + p), ord: 100 - i, why: "Picked for you", year: String(2019 + (i % 7)), vote: 7.2 + (i % 8) / 10, votes: 1200 };
  }
  var demoShelves = [["occ-diwali", "Diwali week", "Family films for the week"], ["otd", "On this day", "A year ago, and out this week"], ["fy", "For you", "Picked for you"], ["new", "New releases", "Newest first"], ["top", "Top rated", "Highest rated on your apps"], ["indian", "Indian", "Hindi, Tamil, Telugu"], ["korean", "Korean", "Dramas and thrillers"], ["thriller", "Crime and thrillers", ""], ["comedy", "Comedy", ""]];
  var demoState = null;
  function demoInit() {
    if (demoState) return;
    var shelves = demoShelves.map(function (s, p) {
      var items = []; for (var i = 0; i < 16; i++) items.push(dItem(p + 1, i));
      var o = { id: s[0], title: s[1], titles: [s[1], s[1], s[1]], why: s[2], items: items };
      if (s[0] === "occ-diwali") { o.line = "Big, bright and for the whole house."; items.forEach(function (c, i) { c.occ = "diwali"; c.line = o.line; c.why = "Diwali week"; c.title = "Diwali Film " + (i + 1); c.img = dimg("diwali" + i); }); }
      return o;
    });
    var heroes = [
      { k: "cont", service: "netflix", title: "The Long Night", sub: "S2 E4  ·  The Verdict", img: dimg("hero0"), pct: 0.42, left: 26, stopped: "last night at 22:14", i: 0 },
      { k: "pick", kick: "Diwali week", occ: "diwali", service: "prime", title: "Paper Moons", over: "A family comes home for the festival and finds the house full of lamps, old secrets and a recipe nobody can quite remember.", img: dimg("hero1"), key: "movie12", kind: "movie", year: "2024", genres: ["Family", "Comedy"], vote: 7.9, votes: 3100, why: "Big, bright and for the whole house." },
      { k: "next", kick: "Up next", service: "jiohotstar", title: "Kaveri", sub: "S1 E10  ·  Rain Date", over: "The monsoon reaches the river town, and so does a letter that was never meant to be delivered.", img: dimg("hero2"), key: "tv301", kind: "tv", se: 1, ep: 10, why: "Carry on." }
    ];
    var longT = ["A Quiet Verdict", "Signal Fire", "Northbound", "Thirty Days", "Small Hours: The Complete Night Cinema Collection", "Glass Harbour"];
    for (var i = 3; i < 10; i++) { var t = longT[i - 3] || demoTitles[i + 3]; heroes.push({ k: "pick", service: demoSvc[i % 8 === 3 ? 3 : i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2], title: t, over: "A one-line overview of " + t + ", long enough to wrap onto a second line so the hero shows how the clamp reads at desk width.", img: dimg("hero" + i), key: (i % 2 ? "tv" : "movie") + (300 + i), kind: i % 2 ? "tv" : "movie", year: "2025", genres: ["Drama", "Crime"], vote: 8.1, votes: 2200, why: "Highly rated on your apps" }); }
    heroes[7].service = "youtube"; heroes[7].key = ""; heroes[7].k = "pick";
    demoState = {
      mode: q.get("mode") === "tv" ? "tv" : "desk", phone: q.get("phone") !== "0",
      rows: { t: "rows", hero: { all: heroes, movie: [], tv: [] }, cont: [
        { title: "The Long Night", service: "netflix", img: dimg("c0"), pct: 0.42, i: 0, line: "S2 E4 · 26 min left · last night at 22:14" },
        { title: "Kaveri", service: "jiohotstar", img: dimg("c1"), pct: 0.71, i: 1, line: "S1 E9 · 14 min left · yesterday at 21:02" }
      ], saved: [], shelves: shelves },
      rated: [
        { key: "movie201", title: "Arrival", service: "prime", kind: "movie", v: 1, at: 1730600000, img: dimg("r1") },
        { key: "tv202", title: "Dark", service: "netflix", kind: "tv", v: 1, at: 1730500000, img: dimg("r2") },
        { key: "movie203", title: "A Film Nobody Remembers the Name Of, Part Two", service: "jiohotstar", kind: "movie", v: -1, at: 1730400000, img: "" },
        { key: "tv204", title: "Reality Island", service: "prime", kind: "tv", v: -1, at: 1730300000, img: dimg("r4") }
      ], marks: {},
      lib: demoLib()
    };
  }
  function demoLib() {
    var now = Date.now(), H = 3600000, D = 24 * H;
    function it(id, kind, title, svc, state, ago, where, extra) {
      var o = { id: id, kind: kind, title: title, img: dimg(title), services: svc ? [svc] : [], svc: svc, state: state, added: now - ago, lastAt: now - ago, when: ago < D ? "today at " + new Date(now - ago).toTimeString().slice(0, 5) : ago < 2 * D ? "yesterday at 21:30" : "on Mon 2 Nov at 20:40", where: where, source: "tv-poll", canTV: kind !== "other", canHere: true };
      for (var k in extra) o[k] = extra[k];
      return o;
    }
    return [
      it("tv901", "tv", "The Long Night", "netflix", "watching", 3 * H, "TV", { season: 2, episode: 4, epTitle: "The Verdict", pct: 0.42 }),
      it("tv902", "tv", "Kaveri", "jiohotstar", "watching", 20 * H, "TV", { season: 1, episode: 9, epTitle: "Rain Date", pct: 0.71 }),
      it("movie903", "movie", "Signal Fire", "prime", "watching", 2 * D, "Desk", { pct: 0.18 }),
      it("yt:ddddddddddd", "yt", "Night Cinema: Small Hours", "youtube", "watching", 3 * D, "Desk", { pct: 0.55 }),
      it("yt:aaaaaaaaaaa", "yt", "A long talk about type (the title is long enough to be cut before the right-hand columns begin)", "youtube", "saved", 2 * H, "Phone", { source: "share" }),
      it("tv904", "tv", "Stranger Things", "netflix", "saved", 30 * H, "Phone", { source: "share" }),
      it("movie905", "movie", "Paper Moons", "prime", "saved", 4 * D, "Desk", { source: "desk-paste" }),
      it("url:example.com/post", "other", "A post about film grain", "", "saved", 5 * D, "Phone", { source: "share", host: "example.com", canTV: false }),
      it("movie906", "movie", "Arrival", "prime", "finished", 9 * D, "TV", { pct: 1, doneAt: now - 9 * D }),
      it("tv907", "tv", "Dark", "netflix", "finished", 40 * D, "TV", { season: 3, episode: 8, pct: 1, doneAt: now - 40 * D }),
      it("tv908", "tv", "Reality Island", "prime", "dropped", 12 * D, "TV", { season: 1, episode: 2, pct: 0.1 }),
      it("yt:bbbbbbbbbbb", "yt", "Night Cinema: Small Hours", "youtube", "finished", 6 * D, "Desk", { pct: 1, doneAt: now - 6 * D, source: "desk-reporter" })
    ];
  }
  // ?year=thin (a record that started on 4 Nov), ?year=empty, else a full year
  function demoYear() {
    var now = new Date(), yr = now.getFullYear(), nowM = +q.get("month") || now.getMonth() + 1, kind = q.get("year") || "full";
    var months = [], i;
    var full = [3, 5, 4, 6, 2, 7, 5, 6, 8, 9, 6, 4];
    for (i = 1; i <= 12; i++) {
      if (kind === "full") months.push({ m: i, n: i <= nowM ? full[i - 1] : 0, known: i <= nowM, past: false });
      else months.push({ m: i, n: i === nowM ? 3 : 0, known: i === nowM, past: i < nowM });
    }
    var picks = function (n) { var o = []; for (var k = 0; k < n; k++) o.push({ title: demoTitles[(k * 3) % demoTitles.length], img: dimg("yp" + k), svc: demoSvc[k % 6] }); return o; };
    if (kind === "empty") return { year: yr, empty: true, sinceMs: 0, partial: false, finished: 0, dropped: 0, hours: 0, hoursKnown: false, topGenre: null, dropGenre: null, longest: null, topSvc: null, months: months.map(function (m) { return { m: m.m, n: 0, known: false, past: m.m < nowM }; }), picks: [] };
    if (kind === "thin") return { year: yr, empty: false, sinceMs: new Date(yr, nowM - 1, 4).getTime(), partial: true, finished: 3, dropped: 1, hours: 6.4, hoursKnown: true, topGenre: null, dropGenre: null, longest: null, topSvc: { name: "Netflix", n: 2, of: 3 }, months: months, picks: picks(3) };
    return { year: yr, empty: false, sinceMs: new Date(yr, 0, 1).getTime(), partial: false, finished: 61, dropped: 7, hours: 40.5, hoursKnown: true, topGenre: { name: "Crime", n: 14, of: 52 }, dropGenre: { name: "Horror", n: 3, of: 6 }, longest: { title: "The Long Night", episodes: 24, hours: 18.6 }, topSvc: { name: "Netflix", n: 29, of: 61 }, months: months, picks: picks(14) };
  }
  function demoLibCounts() {
    var c = { watching: 0, saved: 0, finished: 0, dropped: 0 };
    demoState.lib.forEach(function (i) { c[i.state]++; });
    return c;
  }
  function demoApi(path, body) {
    demoInit();
    var u = new URL(path, location.href), p = u.pathname;
    if (p === "/api/rows") return demoState.rows;
    if (p === "/api/rated/all") return { items: demoState.rated.slice() };
    if (p === "/api/desk/state") return { tv: demoState.mode === "tv" ? "on" : "off", mode: demoState.mode, phone: demoState.phone, standby: demoState.mode !== "tv", month: +q.get("month") || new Date().getMonth() + 1 };
    if (p === "/api/desk/mode") { demoState.mode = body.mode; return { ok: true, mode: body.mode, starting: body.mode === "tv" }; }
    if (p === "/api/desk/year") return demoYear();
    if (p === "/api/desk/city") {
      if (body) {
        var t = (body.city || "").trim();
        if (!t) demoState.city = { ok: true, set: false };
        else if (/^(nowhere|xx)/i.test(t)) return { ok: false, error: "I could not find that place. Try the city name alone." };
        else demoState.city = { ok: true, set: true, name: t.charAt(0).toUpperCase() + t.slice(1) + ", Maharashtra, India", now: { temp: 29, word: "Light rain", "class": "rain" } };
      }
      return demoState.city || { ok: true, set: false };
    }
    if (p === "/api/library") return { items: demoState.lib.slice(), counts: demoLibCounts() };
    if (p === "/api/library/state") {
      var li = demoState.lib.filter(function (x) { return x.id === body.id; })[0];
      if (!li) return { ok: false, error: "unknown title" };
      li.state = body.state; li.lastAt = Date.now(); li.when = "today"; if (body.state === "finished") { li.doneAt = Date.now(); li.pct = 1; }
      return { ok: true, item: li };
    }
    if (p === "/api/library/remove") { demoState.lib = demoState.lib.filter(function (x) { return x.id !== body.id; }); return { ok: true }; }
    if (p === "/api/library/add") {
      if (!/^https?:\/\//.test(body.url)) return { ok: false, error: "That is not a web link." };
      var yt = /youtu/.test(body.url), ni = { id: yt ? "yt:ccccccccccc" : "url:example.com/new", kind: yt ? "yt" : "other", title: yt ? "A video you pasted" : "example.com", img: yt ? dimg("pasted") : "", services: yt ? ["youtube"] : [], svc: yt ? "youtube" : "", state: "saved", added: Date.now(), lastAt: Date.now(), when: "today", where: "Desk", canTV: yt, canHere: true };
      demoState.lib.unshift(ni);
      return { ok: true, dup: false, item: ni };
    }
    if (p === "/api/library/open") return body.where === "tv" ? { ok: true, starting: demoState.mode !== "tv" } : { ok: true, svc: "prime" };
    if (p === "/api/rated") return { v: demoState.marks[u.searchParams.get("key")] || 0 };
    if (p === "/api/title") {
      var id = u.searchParams.get("id"), kind = u.searchParams.get("type");
      return { id: +id, type: kind, title: "Demo", tagline: "", overview: "A canned overview of the title, long enough to wrap onto a second line so the panel layout shows how a real one will look at desktop width.", rating: 7.8, votes: 1234, genres: ["Drama", "Crime"], runtime: kind === "tv" ? 48 : 112, seasons: kind === "tv" ? 3 : 0, cert: "UA", cast: ["A One", "B Two", "C Three"], services: ["prime", "netflix"] };
    }
    if (p === "/api/episodes") {
      var n = +u.searchParams.get("n") || 2, eps = [];
      for (var i = 1; i <= 8; i++) eps.push({ n: i, name: i === 5 ? "An episode with a rather long name that must be cut" : "Episode name " + i, min: 46 + i, pct: i < 4 ? 1 : 0, known: i < 4 });
      return { key: u.searchParams.get("key"), title: "Demo", season: n, seasons: 3, nextSe: 2, nextEp: 4, svc: "prime", exact: true, eps: eps };
    }
    if (p === "/api/search") {
      var tq = u.searchParams.get("q"), items = [];
      for (var j = 0; j < 12; j++) { var it = dItem(7, j); it.title = tq + " " + (j + 1); it.over = "A one line overview."; items.push(it); }
      return { q: tq, items: items };
    }
    if (p === "/api/desk/open") {
      if (body.where === "desk") return { ok: true, svc: body.svc || "prime" };
      return { ok: true, starting: demoState.mode !== "tv" };
    }
    if (p === "/api/desk/rate") {
      if (body.v === 0) { delete demoState.marks[body.key]; demoState.rated = demoState.rated.filter(function (r) { return r.key !== body.key; }); }
      else {
        demoState.marks[body.key] = body.v;
        var f = demoState.rated.filter(function (r) { return r.key === body.key; })[0];
        if (f) f.v = body.v; else demoState.rated.unshift({ key: body.key, title: body.title, service: body.service, kind: body.kind, v: body.v, at: Math.floor(Date.now() / 1000), img: "" });
      }
      return { ok: true, v: body.v };
    }
    return {};
  }

  /* ---------- start (after the demo data is defined) ---------- */
  (function boot() {
    heroInit();
    $$(".tab").forEach(function (n) { n.addEventListener("click", function () { go(n.getAttribute("data-view")); }); });
    $(".word").addEventListener("click", function (e) { e.preventDefault(); go("home"); });
    $$("#apps .topen").forEach(function (b) { b.addEventListener("click", function () { tileGo(b.getAttribute("data-app"), "desk", b); }); });
    $$("#apps .ton").forEach(function (b) { b.addEventListener("click", function () { tileGo(b.getAttribute("data-app"), "tv", b); }); });
    chipsEl($("#chipsHome")); paintPill(); observeChips();
    $("#tvGo").addEventListener("click", function () { tvAct("tv"); });
    $("#tvOff").addEventListener("click", function () {
      if (!S.sureTv) { S.sureTv = true; paintMode(); setTimeout(function () { if (S.sureTv) { S.sureTv = false; paintMode(); } }, 3500); return; }
      S.sureTv = false; tvAct("desk");
    });
    $("#q").addEventListener("input", onSearchInput);
    searchBoot();
    var saved = LS.get("tvmode.desk.app");
    if (saved && (saved === "all" || SVC[saved])) S.app = saved;
    if (q.get("app") && SVC[q.get("app")]) S.app = q.get("app");
    paintApps();
    if (DEMO) { var dt = el("span", "phone on", "Demo data"); dt.style.marginRight = "-4px"; $(".right").insertBefore(dt, $(".right").firstChild); }
    document.addEventListener("visibilitychange", function () { if (!document.hidden) { pollState(); if (S.view === "home" && !S.panel) load("home"); } });
    window.addEventListener("resize", function () { if (S.view === "home" && S.rows && !$("#home").hidden) paintStrip(); });
    cityBoot();
    window.addEventListener("hashchange", function () {
      var sq = hashQuery(); if (sq) { if (sq !== S.q.trim()) { clearTimeout(searchT); searchFromHash(sq); } return; }
      var v = location.hash.slice(1); if (v === "tonight") v = "home"; if (VIEWS[v] && (v !== S.view || S.q)) go(v);
    });
    var start = location.hash.slice(1), startQ = hashQuery();
    if (start === "tonight") start = "home";
    S.view = VIEWS[start] ? start : "home"; paintApps();
    clockTick(); setInterval(clockTick, 10000);
    if (startQ) { S.q = startQ; $("#q").value = startQ; $("#enterHint").hidden = false; }
    render(); load(S.view);
    if (startQ) doSearch(startQ);
    pollState(); setInterval(pollState, 3000);
    // every 5 s while TV Mode is down (so the page fills in by itself), else the rows refresh once a minute
    var tick = 0;
    setInterval(function () {
      tick++; if (document.hidden) return;
      if (S.down) { load("home"); if (S.view !== "home") load(S.view); return; }
      if (tick % 12 === 0 && S.view === "home" && !S.panel && S.q.trim().length < 2) load("home");
    }, 5000);
  })();
})();
