import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import path from "node:path";

export const dynamic = "force-dynamic";

/**
 * Where the onboarding stands, in a few fields:
 * { status, round, answered, unknown, must_total, must_answered, ready_to_plan, open_unknowns, open_contradictions, next_command }.
 * next_command is "growth start" when it has not begun, "resume" when in progress or paused, null when complete.
 * GET only, read only: it runs scripts/onboarding-status.mjs, which never writes.
 * The pairing and host guards in proxy.ts apply to this route like every other.
 */
export async function GET() {
  const script = path.join(process.cwd(), "scripts", "onboarding-status.mjs");
  try {
    const out = await new Promise<string>((resolve, reject) => {
      execFile(process.execPath, [script], { cwd: process.cwd(), timeout: 10_000, maxBuffer: 200_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
    });
    return new NextResponse(out, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read the onboarding status." }, { status: 500 });
  }
}
