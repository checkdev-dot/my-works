import { NextResponse } from "next/server";
import { readLock, restoreLatest, restoreSet } from "@/lib/store";

export const dynamic = "force-dynamic";

const page = (title: string, body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:560px;margin:64px auto;padding:0 16px;color:#37352f;background:#fff}h1{font-size:24px}code{background:#f1f1ef;padding:2px 6px;border-radius:4px}a{color:#5645d4}@media(prefers-color-scheme:dark){body{background:#191919;color:#e6e6e4}code{background:#2a2a2a}a{color:#a99ff5}}</style></head>
<body><h1>${title}</h1>${body}<p><a href="/">Back to the app</a></p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );

/** Puts back the last good copy of a broken data file. Used by the error page. */
export async function POST(req: Request) {
  try {
    var form = await req.formData();
  } catch {
    return page("Couldn't restore", "<p>That wasn't a valid request. Nothing was changed.</p>", 400);
  }
  const file = String(form.get("file") ?? "").replace(/[^a-z]/g, "");
  const lock = await readLock();
  if (lock) return page("Claude is working on your data", `<p>${lock.by} is updating your data right now, so nothing was restored. Go back and try again when it has finished; the app shows when that is.</p>`);
  try {
    const when = file === "all" ? await restoreSet() : await restoreLatest(file);
    if (!when && file === "all") {
      return page("No good moment saved yet", "<p>The app hasn't saved a complete good copy of your data yet. In Claude Code, in the growth folder, say <code>fix my growth data</code>, then go back.</p>");
    }
    if (!when) {
      return page("No good copy saved yet", `<p>None of the saved copies of <code>${file}.json</code> fit with your other files right now, or none is saved yet. Go back and try <b>Put everything back to the last good moment</b>, which restores all files together. Or, in Claude Code, in the growth folder, say <code>fix my growth data (${file}.json)</code>.</p>`);
    }
    // Relative, so the phone (reaching the app through the relay) stays on its own address.
    return new NextResponse(null, { status: 303, headers: { Location: `/?restored=${encodeURIComponent(file === "all" ? "all your data" : `${file}.json`)}` } });
  } catch (e) {
    return page("Couldn't restore", `<p>${e instanceof Error ? e.message : "Something went wrong."} Nothing was changed.</p>`, 400);
  }
}
