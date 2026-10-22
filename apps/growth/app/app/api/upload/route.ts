import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { UPLOADS } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX = 15 * 1024 * 1024;

/** Saves attached files (screenshots, PDFs) into growth/data/uploads and returns their stored paths. */
export async function POST(req: Request) {
  try {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "No file received." }, { status: 400 });
    }
    const files = form.getAll("file").filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: "No file received." }, { status: 400 });
    await fs.mkdir(UPLOADS, { recursive: true });
    const saved: string[] = [];
    for (const f of files) {
      if (f.size > MAX) return NextResponse.json({ error: `${f.name} is over 15 MB.` }, { status: 400 });
      const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const name = `${Date.now()}-${safe}`;
      await fs.writeFile(path.join(UPLOADS, name), Buffer.from(await f.arrayBuffer()));
      saved.push(`uploads/${name}`);
    }
    return NextResponse.json({ files: saved });
  } catch {
    return NextResponse.json({ error: "Couldn't save the file." }, { status: 500 });
  }
}
