// TV Mode relay on Cloudflare Workers: one Durable Object per PC room.
// Same protocol as internal/relay/relay.go (the reference). See PROTOCOL.md.
//
//   GET /relay/<pcid>?role=pc&key=<key>   the PC; pcid must equal sha256(key)[:32]
//   GET /relay/<pcid>?role=phone          a phone
//
// Everything else is served from the static assets (web/), so the remote is
// at https://<worker>/remote/ with a real certificate: a secure context, so
// motion sensors, vibration and add-to-home-screen work without any install.

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = /^\/relay\/([0-9a-f]{32})$/.exec(url.pathname);
    if (!m) return env.ASSETS ? env.ASSETS.fetch(req) : new Response("not found", { status: 404 });
    if (req.headers.get("Upgrade") !== "websocket") return new Response("websocket only", { status: 426 });
    const role = url.searchParams.get("role");
    if (role === "pc") {
      const key = url.searchParams.get("key") || "";
      if ((await sha256hex(key)).slice(0, 32) !== m[1]) return new Response("bad key", { status: 403 });
    } else if (role !== "phone") {
      return new Response("role?", { status: 400 });
    }
    const id = env.ROOMS.idFromName(m[1]);
    return env.ROOMS.get(id).fetch(req);
  }
};

async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class Room {
  constructor(state) {
    this.state = state;
    // Hibernation API: sockets survive the object being evicted; tags carry role and sid.
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // the newest open PC socket: a restart can leave the old one listed for a while,
  // and frames sent to it vanish (2026-11-04: the phone went dead after a restart)
  pc() { const l = this.state.getWebSockets("pc").filter((w) => w.readyState === 1); return l[l.length - 1] || null; }
  phones() { return this.state.getWebSockets("phone"); }
  sidOf(ws) { return (this.state.getTags(ws).find((t) => t.startsWith("sid:")) || "").slice(4); }
  phone(sid) { return this.state.getWebSockets("sid:" + sid)[0] || null; }

  send(ws, v) { try { ws.send(typeof v === "string" ? v : JSON.stringify(v)); } catch (e) {} }

  async fetch(req) {
    const url = new URL(req.url);
    const role = url.searchParams.get("role");
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    if (role === "pc") {
      for (const old of this.state.getWebSockets("pc")) { try { old.close(1008, "replaced"); } catch (e) {} }
      this.state.acceptWebSocket(server, ["pc"]);
      for (const p of this.phones()) {
        this.send(p, { t: "pc" });
        this.send(server, { sid: this.sidOf(p), ev: "open" });
      }
    } else {
      const sid = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      this.state.acceptWebSocket(server, ["phone", "sid:" + sid]);
      const pc = this.pc();
      if (pc) { this.send(server, { t: "pc" }); this.send(pc, { sid, ev: "open" }); }
      else this.send(server, { t: "nopc" });
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== "string" || msg.length > 65536) return;
    const tags = this.state.getTags(ws);
    if (tags.includes("pc")) {
      let env;
      try { env = JSON.parse(msg); } catch (e) { return; }
      if (!env || typeof env.sid !== "string") return;
      const p = this.phone(env.sid);
      if (!p) return;
      if (env.ev === "close") { try { p.close(1008, "closed by pc"); } catch (e) {} return; }
      if (env.d !== undefined) this.send(p, JSON.stringify(env.d));
      return;
    }
    if (msg[0] !== "{") return;
    const pc = this.pc();
    if (!pc) return;
    try { JSON.parse(msg); } catch (e) { return; }
    this.send(pc, '{"sid":"' + this.sidOf(ws) + '","d":' + msg + "}");
  }

  // A close frame (1000/1001, or any clean close) is TV Mode saying goodbye; an error, 1006
  // or a timeout means the PC just stopped answering (asleep, offline, crashed).
  async webSocketClose(ws, code, reason, wasClean) { this.gone(ws, code === 1000 || code === 1001 || wasClean === true ? "closed" : "quiet"); }
  async webSocketError(ws) { this.gone(ws, "quiet"); }

  gone(ws, why) {
    const tags = this.state.getTags(ws);
    try { ws.close(); } catch (e) {}
    if (tags.includes("pc")) {
      if (this.pc() && this.pc() !== ws) return; // a newer PC already took over
      for (const p of this.phones()) this.send(p, { t: "nopc", why });
    } else {
      const pc = this.pc();
      if (pc) this.send(pc, { sid: this.sidOf(ws), ev: "close" });
    }
  }
}
