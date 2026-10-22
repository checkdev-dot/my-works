import os from "os";
import { pairToken } from "@/lib/pair";

export const dynamic = "force-dynamic";

const VIRTUAL = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Loopback|docker/i;

export async function GET() {
  const found: string[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL.test(name)) continue;
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) found.push(a.address);
    }
  }
  const rank = (ip: string) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : 2);
  found.sort((x, y) => rank(x) - rank(y));
  // 172.16.0.0/12 is usually a virtual adapter (Docker, WSL, VPN); keep it only when nothing else exists.
  const is172 = (ip: string) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  const real = found.filter((ip) => !is172(ip));
  const k = pairToken();
  const urls = (real.length ? real : found).map((ip) => `http://${ip}:4322/?k=${k}`);
  return Response.json({ urls, primary: urls[0] ?? null });
}
