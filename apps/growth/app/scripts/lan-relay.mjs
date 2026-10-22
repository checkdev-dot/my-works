// Phone relay: listens on the Wi-Fi (0.0.0.0:4322) and forwards to the laptop-only app on 127.0.0.1:4321.
// Every forwarded request is marked x-growth-via: lan, so the app asks the phone to be paired.
import http from "node:http";
import net from "node:net";

const LISTEN = 4322, TARGET_PORT = 4321, TARGET_HOST = "127.0.0.1";

const DOWN = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Growth</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:20vh auto;padding:0 1.5rem;line-height:1.5"><p>The app isn't running on your laptop. Start it with Start Growth, then try again.</p></body>`;

function fwdHeaders(h) {
  const out = { ...h };
  delete out["x-growth-via"];
  delete out["x-growth-host"];
  out["x-growth-via"] = "lan";
  if (h.host) out["x-growth-host"] = h.host;
  out.host = `${TARGET_HOST}:${TARGET_PORT}`;
  return out;
}

const server = http.createServer((req, res) => {
  const up = http.request(
    { host: TARGET_HOST, port: TARGET_PORT, method: req.method, path: req.url, headers: fwdHeaders(req.headers) },
    (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); },
  );
  up.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/html; charset=utf-8" });
    res.end(DOWN);
  });
  req.on("aborted", () => up.destroy());
  req.pipe(up);
});

server.on("upgrade", (req, socket, head) => {
  const up = net.connect(TARGET_PORT, TARGET_HOST, () => {
    const h = fwdHeaders(req.headers);
    let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (const [k, v] of Object.entries(h)) for (const x of [].concat(v)) raw += `${k}: ${x}\r\n`;
    up.write(raw + "\r\n");
    if (head && head.length) up.write(head);
    socket.pipe(up);
    up.pipe(socket);
  });
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
  socket.on("close", () => up.destroy());
  up.on("close", () => socket.destroy());
});

server.on("error", (e) => { console.error(e.code === "EADDRINUSE" ? `Port ${LISTEN} is already in use (relay may already be running).` : e.message); process.exit(1); });
server.listen(LISTEN, "0.0.0.0", () => console.log(`Phone relay on port ${LISTEN} -> ${TARGET_HOST}:${TARGET_PORT}`));

// Quit on our own once the app has stopped answering for 60 seconds (any HTTP response counts as alive).
let downFor = 0;
setInterval(() => {
  const probe = http.get({ host: TARGET_HOST, port: TARGET_PORT, path: "/api/lan", timeout: 5000 }, (r) => { r.resume(); downFor = 0; });
  probe.on("timeout", () => probe.destroy());
  probe.on("error", () => {
    downFor += 15;
    if (downFor >= 60) { console.log("The app has stopped, so the phone relay is closing."); process.exit(0); }
  });
}, 15000);
