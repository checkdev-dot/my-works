import { NextResponse } from "next/server";
import { exportForClaude, importFromClaude, undoImport } from "@/lib/bridge";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The message to paste into the Claude app. */
export async function GET() {
  return new NextResponse(await exportForClaude(await readState()), { headers: { "content-type": "text/plain; charset=utf-8" } });
}

/** Claude's reply, pasted back. Applied only if it passes every check. */
export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    if (typeof body !== "object" || body === null || Array.isArray(body) || typeof (body as { text?: unknown }).text !== "string") throw new TypeError("bad body");
    const text = (body as { text: string }).text;
    if (!text.trim()) throw new Error("There is nothing to read yet. Say “answer it” in Claude Code.");
    const { state, summary } = await importFromClaude(text);
    return NextResponse.json({ state, summary });
  } catch (e) {
    const bad = e instanceof SyntaxError || e instanceof TypeError || e instanceof RangeError;
    return NextResponse.json({ error: e instanceof Error && !bad ? e.message : "That wasn't a valid request. Nothing was changed." }, { status: 400 });
  }
}

/** Undo the last applied reply. */
export async function DELETE() {
  try {
    return NextResponse.json({ state: await undoImport() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't undo." }, { status: 400 });
  }
}
