import { NextResponse } from "next/server";
import { act, readLock, readState } from "@/lib/store";
import type { Action } from "@/lib/types";

export const dynamic = "force-dynamic";

const BAD = "That wasn't a valid request. Nothing was changed.";

export async function GET() {
  try {
    return NextResponse.json({ ...(await readState()), lock: await readLock() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read your data." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: BAD }, { status: 400 });
    const action = body as Action;
    return NextResponse.json({ ...(await act(action)), lock: null });
  } catch (e) {
    if (e instanceof SyntaxError || e instanceof TypeError || e instanceof RangeError) return NextResponse.json({ error: BAD }, { status: 400 });
    const lock = await readLock();
    if (lock) return NextResponse.json({ error: e instanceof Error ? e.message : "Claude is updating your data.", lock }, { status: 423 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save." }, { status: 400 });
  }
}
