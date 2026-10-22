import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pairToken } from "./lib/pair";

/**
 * Pairing guard (Next 16 "proxy", Node runtime, so fs works).
 * The dev server binds 127.0.0.1, so a request without x-growth-via: lan can only
 * come from the laptop and passes freely. The phone reaches the app through
 * scripts/lan-relay.mjs, which strips any client x-growth-via and sets it to "lan";
 * those requests need the growth_pair cookie or a matching ?k=.
 */
const PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Growth</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:20vh auto;padding:0 1.5rem;line-height:1.5"><p>This phone isn't paired yet. On your laptop, open Growth, then How this works, and scan the code under Set up your phone. It only needs doing once.</p></body>`;

const HOSTS = new Set(["localhost:4321", "127.0.0.1:4321", "[::1]:4321"]);
const BAD_HOST = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Growth</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:20vh auto;padding:0 1.5rem;line-height:1.5"><p>This address isn't allowed. Open Growth at http://localhost:4321 on your laptop.</p></body>`;
const refuse = (error: string) => NextResponse.json({ error }, { status: 403 });

export function proxy(request: NextRequest) {
  // Host allowlist (blocks DNS rebinding). The relay rewrites Host to 127.0.0.1:4321.
  const host = (request.headers.get("host") ?? "").toLowerCase();
  if (!HOSTS.has(host)) return new NextResponse(BAD_HOST, { status: 403, headers: { "content-type": "text/html; charset=utf-8" } });

  const lan = request.headers.get("x-growth-via") === "lan";

  // Block cross-site writes (CSRF) and force a CORS preflight on JSON endpoints.
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const site = request.headers.get("sec-fetch-site");
    if (site !== null && site !== "same-origin") return refuse("Refused: that request came from another site.");
    const origin = request.headers.get("origin");
    if (origin !== null) {
      const allowed = new Set(["http://localhost:4321", "http://127.0.0.1:4321", "http://[::1]:4321"]);
      const phoneHost = request.headers.get("x-growth-host");
      if (lan && phoneHost) allowed.add(`http://${phoneHost.toLowerCase()}`);
      if (!allowed.has(origin.toLowerCase())) return refuse("Refused: that request came from another site.");
    }
    const path = request.nextUrl.pathname;
    // DELETE has no body and is never a simple CORS request, so only body-carrying methods need the JSON type.
    if ((path === "/api/state" || path === "/api/bridge") && method !== "DELETE") {
      const ct = (request.headers.get("content-type") ?? "").toLowerCase();
      if (!ct.startsWith("application/json")) return refuse("Refused: send JSON.");
    }
  }

  if (!lan) return NextResponse.next();

  const token = pairToken();
  if (request.cookies.get("growth_pair")?.value === token) return NextResponse.next();

  const k = request.nextUrl.searchParams.get("k");
  if (k && k === token) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("k");
    const rel = url.pathname + url.search;
    // Next rejects a relative Location here, and the relay rewrites Host, so hop with a refresh page that stays on the phone's own address.
    const res = new NextResponse(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${rel.replace(/"/g, "%22")}"><title>Growth</title>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    res.cookies.set("growth_pair", token, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });
    return res;
  }
  return new NextResponse(PAGE, { status: 403, headers: { "content-type": "text/html; charset=utf-8" } });
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|icon|apple-icon).*)"],
};
