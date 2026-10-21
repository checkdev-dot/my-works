(function () {
  var H = window.HOME, A = H.address, SC = window.Scene;
  var $ = function (id) { return document.getElementById(id); };
  var store = {
    get: function (k) { try { return localStorage.getItem("home." + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem("home." + k, v); } catch (e) {} }
  };
  var mq = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  var reduce = !!(mq && mq.matches);
  if (mq && mq.addEventListener) mq.addEventListener("change", function (e) { reduce = e.matches; });
  var desktop = matchMedia("(min-width: 960px)");
  var fullAddress = [A.line1, A.line2, A.city].join(", ") + ". " + A.landmark + ".";
  var FLOOR = parseInt(String(H.flat).slice(0, -2), 10) || 1;
  document.title = H.greeting;
  $("introTitle").textContent = H.greeting + "!";
  var KEYS = { gate: H.gate, society: H.society, tower: H.tower, floor: FLOOR, flat: H.flat, gateRoad: H.gateRoad };
  document.querySelectorAll("[data-k]").forEach(function (e) { e.textContent = KEYS[e.dataset.k]; });

  /* ---------- paint the society into every screen ---------- */
  $("homeScene").insertAdjacentHTML("afterbegin", SC.make.home());
  $("gateScene").insertAdjacentHTML("afterbegin", SC.make.gate());
  $("roadScene").insertAdjacentHTML("afterbegin", SC.make.road());

  /* ---------- content ---------- */
  document.querySelectorAll(".placeLine").forEach(function (e) { e.textContent = H.tower + " · " + H.society; });
  $("greeting").textContent = H.greeting;
  var hr = new Date().getHours();
  $("greetTime").textContent = hr < 5 ? "Late arrival? No problem" : hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  $("ssid").textContent = H.wifi.ssid; $("ssid2").textContent = H.wifi.ssid;
  document.querySelectorAll(".ssidName").forEach(function (e) { e.textContent = H.wifi.ssid; });
  $("dtAddr").textContent = A.line1;
  $("pass").textContent = H.wifi.password;
  $("gateHint").textContent = "Closest to " + H.tower + ". Tell the guard: Flat " + H.flat + ".";
  [A.line1, A.line2].forEach(function (t) { var s = document.createElement("span"); s.textContent = t; $("addr").appendChild(s); });
  var cty = document.createElement("span"); cty.className = "city"; cty.textContent = A.city; $("addr").appendChild(cty);
  // the hosts: call or WhatsApp
  (H.hosts || []).forEach(function (h) {
    var li = document.createElement("li"); li.className = "host";
    var digits = h.phone.replace(/[^0-9]/g, "");
    var pretty = h.phone.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2");
    li.innerHTML = '<span class="av" aria-hidden="true"></span><span><b></b><small></small></span>' +
      '<a class="call" aria-label=""><span class="i" style="--i:url(icons/ui/phone.svg);--s:19px"></span></a>' +
      '<a class="wa" target="_blank" rel="noopener noreferrer" aria-label=""><span class="i" style="--i:url(icons/ui/message-circle.svg);--s:20px"></span></a>';
    li.querySelector(".av").textContent = h.name[0];
    li.querySelector("b").textContent = h.name; li.querySelector("small").textContent = pretty;
    var c = li.querySelector(".call"), w = li.querySelector(".wa");
    c.href = "tel:" + h.phone; c.setAttribute("aria-label", "Call " + h.name);
    w.href = "https://wa.me/" + digits + "?text=" + encodeURIComponent("Hi " + h.name + ", I'm at " + H.society + " Gate " + H.gate + " for flat " + H.flat + ".");
    w.setAttribute("aria-label", "WhatsApp " + h.name);
    c.addEventListener("click", function () { haptic("tap"); }); w.addEventListener("click", function () { haptic("tap"); });
    $("hostList").appendChild(li);
  });
  var names = (H.hosts || []).map(function (h) { return h.name; });
  var who = names.length > 1 ? names.slice(0, -1).join(", ") + " or " + names[names.length - 1] : (names[0] || "us");
  $("deskCall").textContent = "Stuck? Call " + who; $("callFab").setAttribute("aria-label", "Stuck? Call " + who);
  var hostOpener = null;
  function openHosts(e) {
    haptic("sheet"); hostOpener = e && e.currentTarget; $("hostSheet").hidden = false; views.inert = true; $("tabbar").inert = true;
    setTimeout(function () { $("hostClose").focus({ preventScroll: true }); }, 60);
  }
  function closeHosts() {
    if ($("hostSheet").hidden) return;
    $("hostSheet").hidden = true; views.inert = false; $("tabbar").inert = false; current = -1; follow();
    if (hostOpener && hostOpener.focus) hostOpener.focus({ preventScroll: true });
  }
  document.querySelectorAll("[data-hosts]").forEach(function (b) { b.addEventListener("click", openHosts); });
  $("hostClose").addEventListener("click", closeHosts);
  $("hostSheet").addEventListener("click", function (e) { if (e.target === $("hostSheet")) closeHosts(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeHosts(); });

  /* ---------- copy: runs inside the tap, and only claims success when it worked ---------- */
  function copy(text) {
    var ok = false;
    var t = document.createElement("textarea"); t.value = text; t.setAttribute("readonly", "");
    t.style.position = "fixed"; t.style.top = "0"; t.style.opacity = "0"; document.body.appendChild(t);
    t.select(); t.setSelectionRange(0, text.length);
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(t);
    if (!ok) {   // fall back to the async API; if that also fails, correct the message
      try {
        if (navigator.clipboard && window.isSecureContext) {
          ok = true;
          navigator.clipboard.writeText(text).catch(function () { haptic("error"); toast("Couldn’t copy. Long-press to copy: " + text, 7000); });
        }
      } catch (e) { ok = false; }
    }
    return ok;
  }
  function done(el, ms) {
    el.classList.remove("is-done"); void el.offsetWidth; el.classList.add("is-done"); clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("is-done"); }, ms || 2200);
  }
  /* ---------- haptics: Android vibrates; iPhone (iOS 18+) ticks via a native switch, the only haptic Safari allows ---------- */
  var PATTERN = { tap: 8, tab: 6, success: [12, 50, 18], flip: 16, sheet: [6, 30, 10], celebrate: [18, 40, 18, 40, 40, 60, 70], error: [30, 60, 30] };
  var iosTick = (function () {
    if (!/iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return null;
    var l = document.createElement("label"), c = document.createElement("input");
    c.type = "checkbox"; c.setAttribute("switch", ""); c.tabIndex = -1;
    l.setAttribute("aria-hidden", "true"); l.style.cssText = "position:fixed;left:-99px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
    l.appendChild(c); document.body.appendChild(l);
    return function (n) { for (var k = 0; k < n; k++) setTimeout(function () { l.click(); }, k * 70); };
  })();
  function haptic(kind) {
    var act = navigator.userActivation;
    if (act && !act.hasBeenActive) return;   // browsers only allow haptics after the guest has touched the page
    var p = PATTERN[kind] || PATTERN.tap;
    try {
      if (navigator.vibrate) navigator.vibrate(p);
      else if (iosTick) iosTick(Array.isArray(p) ? Math.ceil(p.length / 2) : 1);
    } catch (e) {}
  }
  function buzz(kind) { haptic(kind || "tap"); }
  function toast(msg, ms) {
    var t = $("toast"); $("toastText").textContent = msg;
    t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove("show"); }, ms || 2800);
  }
  function copied(ok, what, text) {
    haptic(ok ? "success" : "error");
    if (ok) toast(what, 2600);
    else toast(text ? "Couldn’t copy. Long-press to copy: " + text : "Couldn’t copy. Long-press the text to copy it.", 7000);
    return ok;
  }

  /* ---------- screens + nav ---------- */
  [].forEach.call(document.querySelectorAll(".view .body"), function (b) { [].forEach.call(b.children, function (c, k) { c.style.setProperty("--k", k); }); });
  [].forEach.call(document.querySelectorAll(".route, .groups"), function (b) { [].forEach.call(b.children, function (c, k) { c.style.setProperty("--k2", k); }); });
  var views = $("views"), viewEls = [].slice.call(views.children), tabs = [].slice.call(document.querySelectorAll(".tab")), current = -1, auto = null;
  function select(i) {
    if (i === current) return;
    current = i;
    tabs.forEach(function (t, k) {
      if (k === i) { t.setAttribute("aria-current", "page"); if (!reduce) { t.classList.remove("anim"); void t.offsetWidth; t.classList.add("anim"); } }
      else t.removeAttribute("aria-current");
    });
    viewEls.forEach(function (v, k) {
      if (k === i && !reduce && !desktop.matches) { v.classList.remove("enter"); void v.offsetWidth; v.classList.add("enter"); }
      v.classList.toggle("on", desktop.matches || k === i);
      if (desktop.matches) v.inert = false; else v.inert = k !== i;
    });
    onEnter(i);
  }
  function follow() {
    var p = views.scrollLeft / Math.max(1, views.clientWidth);
    var frac = Math.abs(p - Math.round(p));
    $("tabbar").style.setProperty("--at", p.toFixed(4));
    $("tabbar").style.setProperty("--stretch", (1 + frac * 0.18).toFixed(3));
    var i = Math.round(p);
    if (auto !== null && i !== auto) return;
    if (i !== current && current !== -1) haptic("tab");   // a tab tap glides past the middle screen without waking it
    if (auto !== null && frac < .01) auto = null;
    select(i);
  }
  function go(i) {
    if (!viewEls[i]) return;
    auto = i;
    views.scrollTo({ left: i * views.clientWidth, behavior: reduce ? "auto" : "smooth" });
    clearTimeout(go._t); go._t = setTimeout(function () { auto = null; follow(); }, 900);
  }
  tabs.forEach(function (t) { t.addEventListener("click", function () { go(+t.dataset.go); }); });
  var raf; views.addEventListener("scroll", function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(follow); }, { passive: true });
  window.addEventListener("resize", function () { if (current > 0 && !desktop.matches) views.scrollLeft = current * views.clientWidth; });

  var gate = $("gateScene"), road = $("roadScene");
  function onEnter(i) {
    if (i === 1) { cars = 0; gate.classList.remove("open", "drive"); clearTimeout(onEnter._g); onEnter._g = setTimeout(driveIn, 450); }
    if (i === 2) zoom();
  }
  function driveIn(feel) {   // barrier lifts, then a car drives in through the gate
    if (feel) haptic("sheet");
    gate.classList.remove("drive"); gate.classList.add("open"); void gate.offsetWidth;
    clearTimeout(driveIn._t); driveIn._t = setTimeout(function () { gate.classList.add("drive"); }, 500);
  }
  function zoom(color) {
    if (color) road.style.setProperty("--box", color);
    road.classList.remove("zoom"); void road.offsetWidth; road.classList.add("zoom");
  }
  if (desktop.matches) setTimeout(driveIn, 1200);
  // the society keeps living: while Arrive is in view, another car comes in through the gate every few seconds
  var cars = 0;
  setInterval(function () {
    if (document.hidden || !intro.hidden || reduce) return;
    if ((current === 1 || desktop.matches) && cars < 3) { cars++; driveIn(); }
  }, 6500);
  document.addEventListener("visibilitychange", function () { document.body.classList.toggle("asleep", document.hidden); });

  /* ---------- progress + celebration ---------- */
  var progress = {};
  try { progress = JSON.parse(store.get("progress") || "{}"); } catch (e) { progress = {}; }
  function mark(step) {
    if (progress[step]) return;
    progress[step] = 1; store.set("progress", JSON.stringify(progress));
    if (progress.wifi && progress.gate && progress.app) setTimeout(party, 900);
  }
  function party() {
    haptic("celebrate");
    toast("Wi-Fi, gate and your app: all three done. Welcome home!", 3800);
    if (reduce) return;
    var colors = ["#494fdf", "#8f94ff", "#ffc800", "#58cc02", "#ff4b4b", "#ffffff"];
    var box = document.createElement("div"); box.className = "confetti";
    for (var i = 0; i < 80; i++) {
      var p = document.createElement("i");
      p.style.left = Math.random() * 100 + "vw"; p.style.background = colors[i % colors.length];
      p.style.setProperty("--x", (Math.random() * 160 - 80) + "px");
      p.style.setProperty("--r", (Math.random() * 720 - 360) + "deg");
      p.style.setProperty("--d", (1.8 + Math.random() * 1.4) + "s");
      p.style.setProperty("--delay", (Math.random() * .4) + "s");
      if (i % 3 === 0) { p.style.width = "8px"; p.style.height = "8px"; p.style.borderRadius = "50%"; }
      box.appendChild(p);
    }
    document.body.appendChild(box); setTimeout(function () { box.remove(); }, 3800);
  }

  /* ---------- Wi-Fi ---------- */
  var ua = navigator.userAgent;
  var detected = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : /Android/i.test(ua) ? "android" : null;
  var notSafari = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
  var platform = store.get("platform") || detected || "ios";
  var webview = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|MicroMessenger|Line\/|; wv\)|Snapchat|LinkedInApp/i.test(ua);
  if (webview) $("webview").hidden = false;
  $("directions").href = "https://www.google.com/maps/dir/?api=1&destination=" + H.gatePin.lat + "%2C" + H.gatePin.lng;
  $("directions").addEventListener("click", function () { buzz(); mark("gate"); });
  function setSwap(btn, icon, idle, doneTxt) {
    var a = btn.querySelector(".idle"), d = btn.querySelector(".done");
    a.querySelector(".i").style.setProperty("--i", "url(icons/ui/" + icon + ".svg)"); a.lastChild.textContent = idle; d.lastChild.textContent = doneTxt;
  }
  function setPlatform(p) {
    platform = p; store.set("platform", p); document.body.classList.toggle("android", p === "android");
    var j = $("joinPrimary");
    if (p === "ios") {
      var noSafari = notSafari || webview;
      j.setAttribute("href", noSafari ? "#" : "wifi.mobileconfig"); if (noSafari) j.setAttribute("role", "button"); else j.removeAttribute("role");
      $("joinIcon").style.setProperty("--i", "url(icons/ui/" + (noSafari ? "copy" : "apple") + ".svg)");
      $("joinLabel").textContent = noSafari ? "Copy link for Safari" : "Join on iPhone"; $("joinDone").textContent = noSafari ? "Now paste it in Safari" : "Now open Settings";
      $("otherIcon").style.setProperty("--i", "url(icons/ui/smartphone.svg)"); $("otherLabel").textContent = "On Android?";
      $("howtoText").innerHTML = notSafari
        ? "Open this page in <b>Safari</b> to join in one tap, or flip the card for the QR."
        : "One tap downloads the Wi-Fi profile and copies the password. We'll show you the 3 taps.";
      $("androidSteps").hidden = true;
      $("copyPass").dataset.mode = "copy"; setSwap($("copyPass"), "copy", "Copy password", "Copied!");
    } else {
      j.setAttribute("href", "#"); j.setAttribute("role", "button");
      $("joinIcon").style.setProperty("--i", "url(icons/ui/qr-code.svg)");
      $("joinLabel").textContent = "Join in one tap"; $("joinDone").textContent = "Hold the home bar";
      $("otherIcon").style.setProperty("--i", "url(icons/ui/apple.svg)"); $("otherLabel").textContent = "On iPhone?";
      $("howtoText").innerHTML = "Shows a code. Hold the home bar (Circle to Search) and tap <b>Connect</b>.";
      $("androidSteps").hidden = true;
      $("copyPass").dataset.mode = "copy"; setSwap($("copyPass"), "copy", "Copy password", "Copied!");
    }
  }
  setPlatform(platform);
  function joinTap(e) {
    buzz();
    if (platform === "android") { e.preventDefault(); openQr(); return; }
    else if (notSafari || webview) { e.preventDefault(); copied(copy(location.origin + "/"), "Link copied. Open Safari and paste it in the address bar.", location.origin + "/"); done($("joinPrimary"), 3200); return; }
    copy(H.wifi.password);   // the profile downloads and the password is ready to paste, from one tap
    done($("joinPrimary"), 3200); mark("wifi");
    setTimeout(function () {
      iosOpener = document.activeElement; $("iosSheet").hidden = false; views.inert = true; $("tabbar").inert = true; haptic("sheet");
      setTimeout(function () { $("iosDone").focus({ preventScroll: true }); }, 60);
    }, 700);
  }
  $("joinPrimary").addEventListener("click", joinTap);
  $("joinPrimary").addEventListener("keydown", function (e) { if (e.key === " " && platform === "android") { e.preventDefault(); joinTap(e); } });
  // Android: big QR for Circle to Search, which shows a one-tap Connect
  var qrSheet = $("qrSheet"), qrOpener = null;
  function openQr() {
    haptic("sheet"); qrOpener = document.activeElement; qrSheet.hidden = false; views.inert = true; $("tabbar").inert = true;
    setTimeout(function () { $("qrClose").focus({ preventScroll: true }); }, 60);
    mark("wifi");
  }
  function closeQr() {
    if (qrSheet.hidden) return;
    qrSheet.hidden = true; views.inert = false; $("tabbar").inert = false; current = -1; follow();
    if (qrOpener && qrOpener.focus) qrOpener.focus({ preventScroll: true });
  }
  $("qrClose").addEventListener("click", closeQr);
  var iosOpener = null;
  function closeIos() {
    if ($("iosSheet").hidden) return;
    $("iosSheet").hidden = true; views.inert = false; $("tabbar").inert = false; current = -1; follow();
    if (iosOpener && iosOpener.focus) iosOpener.focus({ preventScroll: true });
  }
  $("iosClose").addEventListener("click", closeIos); $("iosDone").addEventListener("click", closeIos);
  $("iosSheet").addEventListener("click", function (e) { if (e.target === $("iosSheet")) closeIos(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeIos(); });
  qrSheet.addEventListener("click", function (e) { if (e.target === qrSheet) closeQr(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeQr(); });
  $("qrFallback").addEventListener("click", function () {
    buzz(); copied(copy(H.wifi.password), "Password copied! Now follow the 3 steps.", H.wifi.password);
    closeQr(); $("androidSteps").hidden = false;
    setTimeout(function () { $("androidSteps").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" }); }, 80);
  });
  $("joinOther").addEventListener("click", function () { buzz(); setPlatform(platform === "ios" ? "android" : "ios"); });
  $("copyPass").addEventListener("click", function () {
    buzz();
    if (copied(copy(H.wifi.password), "Password copied!", H.wifi.password)) done($("copyPass")); mark("wifi");
  });

  var card = $("wcard"), front = card.querySelector(".front"), back = card.querySelector(".back");
  var cardFloat = $("cardFloat"), cardEnter = $("cardEnter");
  back.setAttribute("aria-hidden", "true");
  function flipCard() {
    var sel = window.getSelection && String(window.getSelection());
    if (sel && sel.length > 1) return;   // selecting the password should not flip the card
    buzz("flip");
    var f = card.classList.toggle("flipped");
    card.setAttribute("aria-pressed", f ? "true" : "false");
    front.setAttribute("aria-hidden", f ? "true" : "false"); back.setAttribute("aria-hidden", f ? "false" : "true");
    if (f) rest();
  }
  card.addEventListener("click", flipCard);
  card.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flipCard(); } });

  // tilt: finger or mouse on any phone/desktop, the phone's own tilt on Android. Never touches the entrance.
  var pending = null, restT = null;
  function apply() {
    var t = pending; pending = null; if (!t) return;
    card.style.setProperty("--ry", (t[0] * 14).toFixed(2) + "deg"); card.style.setProperty("--rx", (-t[1] * 10).toFixed(2) + "deg");
    card.style.setProperty("--gx", (50 + t[0] * 50).toFixed(1) + "%"); card.style.setProperty("--gy", (50 + t[1] * 50).toFixed(1) + "%");
  }
  function tilt(x, y) {
    if (reduce || card.classList.contains("flipped")) return;
    if (!pending) requestAnimationFrame(apply);
    pending = [x, y];
    card.classList.add("live"); cardFloat.classList.add("live");
    clearTimeout(restT); restT = setTimeout(rest, 1800);
  }
  function rest() {
    clearTimeout(restT); pending = null;
    card.classList.remove("live"); cardFloat.classList.remove("live");
    card.style.setProperty("--ry", "0deg"); card.style.setProperty("--rx", "0deg");
  }
  if (reduce) cardFloat.style.animation = "none";
  $("cardStage").addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch" && e.buttons === 0) return;
    var r = $("cardStage").getBoundingClientRect();
    tilt(((e.clientX - r.left) / r.width - .5) * 2, ((e.clientY - r.top) / r.height - .5) * 2);
  });
  $("cardStage").addEventListener("pointerleave", rest);
  window.addEventListener("deviceorientation", function (e) {
    if (e.gamma == null || e.beta == null || current !== 0 || !intro.hidden || document.hidden) return;
    tilt(Math.max(-1, Math.min(1, e.gamma / 35)), Math.max(-1, Math.min(1, (e.beta - 50) / 35)));
  });
  function esc(s) { return String(s).replace(/([\\;,:"])/g, "\\$1"); }
  var wifiString = "WIFI:T:" + (H.wifi.security || "WPA") + ";S:" + esc(H.wifi.ssid) + ";P:" + esc(H.wifi.password) + ";;";
  window.__wifiString = wifiString;
  try { var q = qrcode(0, "M"); q.addData(wifiString); q.make(); $("qr").innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); $("qrBig").innerHTML = q.createSvgTag({ cellSize: 4, margin: 16, scalable: true }); }
  catch (e) { $("qr").textContent = "QR unavailable"; }

  /* ---------- address + apps ---------- */
  document.querySelectorAll("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      buzz();
      if (copied(copy(fullAddress), "Address copied! Paste it in your app.", fullAddress)) done(b);
      mark("gate");
    });
  });

  var BRAND = {
    zomato: { c: "#e23744", logo: "zomato" }, swiggy: { c: "#fc8019", logo: "swiggy" }, instamart: { c: "#e8336e", logo: "swiggy" },
    zepto: { c: "#5b1e8c", t: "Z" }, blinkit: { c: "#f8cb46", ink: "#1d1d1f", t: "b" }, bigbasket: { c: "#84c225", logo: "bigbasket" },
    amazon: { c: "#232f3e", ink: "#ff9900", logo: "amazon" }, flipkart: { c: "#2874f0", ink: "#ffe11b", logo: "flipkart" },
    district: { c: "#2a2a2e", t: "D" }, zeptocafe: { c: "#5b1e8c", icon: "coffee" }, swish: { c: "#ff3f6c", t: "S" },
    urban: { c: "#ffffff", ink: "#000000", t: "UC" }, yesmadam: { c: "#e5007d", t: "YM" }, uber: { c: "#ffffff", ink: "#000000", logo: "uber" }, ola: { c: "#2a2a2e", ink: "#cddc39", t: "ola" },
    rapido: { c: "#f9c935", ink: "#1d1d1f", t: "R" }, maps: { c: "#ffffff", ink: "#4285f4", logo: "googlemaps" }
  };
  var g = H.gatePin;
  function linkFor(app) {
    if (app.share) return app.share;
    if (app.web === "uber") return "https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=" + g.lat + "&dropoff[longitude]=" + g.lng + "&dropoff[nickname]=" + encodeURIComponent("Gate " + H.gate + ", " + H.society) + "&dropoff[formatted_address]=" + encodeURIComponent(H.cabDrop);
    if (app.web === "maps") return "https://www.google.com/maps/dir/?api=1&destination=" + g.lat + "%2C" + g.lng;
    return app.web;
  }
  var GROUPS = { food: ["Food & café", "utensils"], grocery: ["Groceries in minutes", "shopping-basket"], more: ["Shopping & events", "package"], home: ["Home services", "house"] }, lists = {};
  function groupList(key) {
    key = GROUPS[key] ? key : "food";
    if (lists[key]) return lists[key];
    var g = document.createElement("section"); g.className = "group";
    g.innerHTML = '<div class="sec-h label"><span class="i" style="--i:url(icons/ui/' + GROUPS[key][1] + '.svg);--s:16px"></span></div><ul class="apps four"></ul>';
    g.querySelector(".sec-h").append(GROUPS[key][0]);
    $("deliveryGroups").appendChild(g);
    return (lists[key] = g.querySelector("ul"));
  }
  ["food", "grocery", "more", "home"].forEach(groupList);
  H.apps.forEach(function (app) {
    var b = BRAND[app.id] || { c: "#2a2a2e", t: app.name[0] };
    var li = document.createElement("li");
    var a = document.createElement("a"); a.className = "tile"; a.href = linkFor(app); a.target = "_blank"; a.rel = "noopener noreferrer";
    var logo = document.createElement("span"); logo.className = "logo"; logo.setAttribute("aria-hidden", "true");
    logo.style.setProperty("--brand", b.c); if (b.ink) logo.style.setProperty("--brand-ink", b.ink);
    if (b.logo || b.icon) { var m = document.createElement("span"); m.className = "i"; m.style.setProperty("--i", "url(icons/" + (b.logo ? "brand/" + b.logo : "ui/" + b.icon) + ".svg)"); m.style.setProperty("--s", "22px"); logo.appendChild(m); }
    else { logo.textContent = b.t; if (b.t.length > 1) logo.style.fontSize = "14px"; }
    var nm = document.createElement("span"); nm.className = "nm";
    nm.innerHTML = '<span class="name"></span><span class="ok">Copied!</span>'; nm.firstChild.textContent = app.name;
    a.append(logo, nm);
    var opensOnly = app.share || app.web === "maps";
    a.setAttribute("aria-label", app.name + (opensOnly ? ", opens directions" : app.kind === "cab" ? ", copies the drop point and opens " + app.name : ", copies the address and opens " + app.name));
    a.addEventListener("click", function () {
      buzz();
      a.classList.remove("pop"); void a.offsetWidth; a.classList.add("pop");
      var ok = true;
      if (!opensOnly) ok = copy(app.kind === "cab" ? H.cabDrop : fullAddress);
      if (!opensOnly && ok) { a.classList.add("copied"); clearTimeout(a._c); a._c = setTimeout(function () { a.classList.remove("copied"); }, 4000); }
      if (app.kind === "delivery") { zoom(b.c === "#ffffff" ? "#494fdf" : b.c); mark("app"); copied(ok, "Copied! Paste the address in " + app.name + ".", fullAddress); }
      else { driveIn(true); mark("gate"); if (!opensOnly) copied(ok, "Drop point copied! Paste it in " + app.name + ".", H.cabDrop); }
    });
    li.appendChild(a); (app.kind === "cab" ? $("cabApps") : groupList(app.group)).appendChild(li);
  });
  Object.keys(lists).forEach(function (k) {
    if (k === "home") lists[k].className = "apps wide"; else lists[k].style.setProperty("--n", Math.min(4, lists[k].children.length));
  });

  /* ---------- onboarding: the lift climbs the tower to the flat ---------- */
  var intro = $("intro"), introBuilt = null, timers = [], opener = null, landAt = 0;
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function landCard() { cardEnter.classList.remove("landed"); void cardEnter.offsetWidth; cardEnter.classList.add("landed"); }
  function closeIntro() {
    if (intro.hidden || intro.classList.contains("leaving")) return;
    clearTimers(); store.set("seen", "1"); try { sessionStorage.setItem("home.visit", "1"); } catch (e) {}
    intro.classList.add("leaving");
    views.inert = false; $("tabbar").inert = false; document.body.classList.remove("intro-open");
    setTimeout(function () { intro.hidden = true; intro.classList.remove("leaving", "arrived"); }, reduce ? 0 : 1000);
    views.scrollLeft = landAt * views.clientWidth; current = -1; follow(); landCard();
    setTimeout(function () { (opener && opener.isConnected ? opener : $("joinPrimary")).focus({ preventScroll: true }); opener = null; }, 700);
  }
  function fitIntro() {   // portrait fills the screen; wide screens show the whole society instead of zooming in
    var svg = $("introScene").querySelector("svg"); if (!svg) return;
    svg.setAttribute("preserveAspectRatio", innerWidth / innerHeight > 0.62 ? "xMidYMax meet" : "xMidYMax slice");
  }
  window.addEventListener("resize", fitIntro);
  function runIntro(e) {
    clearTimers();
    opener = e && e.currentTarget ? e.currentTarget : null;
    if (!introBuilt) { introBuilt = SC.make.intro(); $("introScene").innerHTML = introBuilt.svg; }
    fitIntro();
    intro.hidden = false; intro.classList.remove("leaving", "arrived", "play", "climb");
    var sc = $("introScene");
    sc.querySelectorAll(".tower").forEach(function (t, k) { t.style.setProperty("--td", (0.25 + [0.15, 0.3, 0][k % 3] + Math.floor(k / 3) * 0.1) + "s"); });
    sc.querySelectorAll(".tree").forEach(function (t, k) { t.style.setProperty("--pd", (1.05 + k * 0.09) + "s"); });
    sc.querySelectorAll(".star").forEach(function (t, k) { t.style.setProperty("--sd", (k * 0.035) + "s"); });
    sc.querySelectorAll("[data-f]").forEach(function (w) { w.classList.remove("on"); });
    void intro.offsetWidth; intro.classList.add("play");
    views.inert = true; $("tabbar").inert = true; document.body.classList.add("intro-open");
    $("skip").focus({ preventScroll: true });
    var floor = FLOOR;
    var lift = intro.querySelector(".lift rect"), fh = introBuilt.fh;
    $("floorText").textContent = "Going up to floor " + floor;
    $("guess").textContent = "";
    var guess = detected || "ios";
    document.querySelectorAll("[data-pick]").forEach(function (b) {
      var mine = b.dataset.pick === guess;
      b.className = "btn" + (mine ? "" : " ghost");
      b.lastChild.textContent = detected ? (mine ? "Continue on " + (guess === "ios" ? "iPhone" : "Android") : (b.dataset.pick === "ios" ? "I'm on iPhone" : "I'm on Android")) : (b.dataset.pick === "ios" ? "iPhone" : "Android");
    });
    $("pickRow").classList.toggle("sure", !!detected);
    var i = 1, ctr = $("counter"); ctr.textContent = "01";
    $("floorText").textContent = H.society + " · " + H.tower;
    function place(n) {
      if (lift) lift.style.transform = "translateY(" + (-(n - 1) * fh).toFixed(1) + "px)";
      sc.querySelectorAll('[data-f="' + n + '"]').forEach(function (w) { w.classList.add("on"); });   // each floor lights up as the lift passes
    }
    function arrive() {
      place(floor); ctr.textContent = H.flat; $("floorText").textContent = "Floor " + floor + ". You're here!";
      intro.classList.add("arrived"); haptic("success");
      later(function () { var p = intro.querySelector("[data-pick].btn:not(.ghost)"); if (p) p.focus({ preventScroll: true }); }, 650);
    }
    if (reduce) { intro.classList.add("climb"); for (var n = 1; n <= floor; n++) place(n); arrive(); return; }
    var quick = !!store.get("seen"); intro.classList.toggle("quick", quick);
    later(function () { $("floorText").textContent = "Going up to floor " + floor; intro.classList.add("climb"); place(1); later(tick, quick ? 120 : 300); }, quick ? 700 : 1900);
    function tick() {
      ctr.textContent = (i < 10 ? "0" : "") + i; place(i); if (i % 4 === 0) haptic("tab");
      if (i >= floor) { later(arrive, 320); return; }
      i++; later(tick, (quick ? 22 : 55) + Math.pow(i / floor, 3) * (quick ? 50 : 110));
    }
  }
  document.querySelectorAll("[data-pick]").forEach(function (b) { b.addEventListener("click", function () { setPlatform(b.dataset.pick); closeIntro(); }); });
  $("skip").addEventListener("click", closeIntro);
  document.addEventListener("keydown", function (e) {
    if (intro.hidden) return;
    if (e.key === "Escape") closeIntro();
    if (e.key === "Tab") {   // keep focus inside the welcome
      var f = [].slice.call(intro.querySelectorAll("button")).filter(function (x) { return x.offsetParent; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  $("replay").addEventListener("click", runIntro);

  // deep links: #wifi, #here, #order open that screen directly
  var hashes = { "#wifi": 0, "#here": 1, "#order": 2 };
  var deep = hashes[location.hash];
  function jump(n) { views.scrollLeft = n * views.clientWidth; current = -1; follow(); }
  window.addEventListener("hashchange", function () { var n = hashes[location.hash]; if (n !== undefined) go(n); });
  if (deep !== undefined) {
    jump(deep);
    window.addEventListener("load", function () { if (current !== deep || views.scrollLeft === 0) jump(deep); });
  } else follow();
  landAt = deep || 0;
  if (/[?&]nointro/.test(location.search)) landCard(); else runIntro();
  // ?sheet=qr | ios | hosts opens that sheet straight away (handy for demos and screenshots)
  var sheet = (location.search.match(/[?&]sheet=([a-z]+)/) || [])[1];
  if (sheet) setTimeout(function () {
    if (sheet === "qr") openQr();
    if (sheet === "hosts") openHosts();
    if (sheet === "ios") { $("iosSheet").hidden = false; views.inert = true; $("tabbar").inert = true; }
  }, 300);
})();
