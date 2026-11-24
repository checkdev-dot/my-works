/* TV Remote service worker: caches the app shell so the page opens at once.
   Network first for the shell (fresh when online, 3 s patience), cache when the
   network is slow or gone. It never touches /relay/ (the WebSocket and its
   handshake) and never stores anything but the static shell files below. The
   pairing token lives in localStorage and the URL hash, which are never sent
   to the server and never cached. */
var CACHE = "tvremote-shell-v1";
var SHELL = [
  "/remote/",
  "/remote/remote.css",
  "/remote/remote.js",
  "/remote/manifest.webmanifest",
  "/remote/icon.svg",
  "/remote/icon-192.png",
  "/remote/icon-512.png",
  "/remote/icon-maskable-512.png",
  "/vendor/sha256.js"
];
var PATHS = {};
SHELL.forEach(function (p) { PATHS[p] = 1; });
PATHS["/remote/index.html"] = 1;

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return fetch(u, { cache: "reload" }).then(function (r) { if (r.ok && !r.redirected) return c.put(u, r); });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/relay/") === 0) return;
  if (!PATHS[url.pathname]) return;
  // one cache key per file: ?demo, ?act= and friends share the page
  var key = url.pathname === "/remote/index.html" ? "/remote/" : url.pathname;
  e.respondWith(
    new Promise(function (resolve) {
      var done = false;
      function fromCache() {
        caches.match(key).then(function (hit) { if (!done) { done = true; resolve(hit || fetch(req)); } });
      }
      var timer = setTimeout(fromCache, 3000);
      fetch(req).then(function (res) {
        clearTimeout(timer);
        if (res.ok && !res.redirected) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(key, copy); }); }
        if (!done) { done = true; resolve(res); }
      }, function () { clearTimeout(timer); fromCache(); });
    })
  );
});
