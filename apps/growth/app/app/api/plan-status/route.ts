import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import path from "node:path";

export const dynamic = "force-dynamic";

/**
 * Where the plan stands, in a few fields: { has_plan, horizon, weeks_done, review_due, stale_research_count, next_action }.
 * GET only, read only: it runs scripts/plan-status.mjs, which never writes.
 * The pairing and host guards in proxy.ts apply to this route like every other.
 */
export async function GET() {
  const script = path.join(process.cwd(), "scripts", "plan-status.mjs");
  try {
    const out = await new Promise<string>((resolve, reject) => {
      execFile(process.execPath, [script], { cwd: process.cwd(), timeout: 10_000, maxBuffer: 200_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
    });
    return new NextResponse(out, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read the plan status." }, { status: 500 });
  }
}
