import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import path from "node:path";

export const dynamic = "force-dynamic";

const COMMANDS = ["answer", "library", "review", "plan", "cv", "journal", "person", "status", "onboarding"];

/**
 * The compact, source-tagged brief for one command (4 to 8 KB of JSON) so Claude reads only what it needs.
 * GET only, read only: it never writes the "changed since last run" cache (--no-write).
 * The pairing and host guards in proxy.ts apply to this route like every other.
 */
export async function GET(req: Request) {
  const command = new URL(req.url).searchParams.get("command") ?? "status";
  if (!COMMANDS.includes(command)) return NextResponse.json({ error: `command must be one of ${COMMANDS.join(", ")}` }, { status: 400 });
  const script = path.join(process.cwd(), "scripts", "make-brief.mjs");
  try {
    const out = await new Promise<string>((resolve, reject) => {
      execFile(process.execPath, [script, command, "--no-write"], { cwd: process.cwd(), timeout: 10_000, maxBuffer: 1_000_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
    });
    return new NextResponse(out, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't build the brief." }, { status: 500 });
  }
}
