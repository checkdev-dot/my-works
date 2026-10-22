import { cookies } from "next/headers";
import { App, type View } from "@/components/App";
import { DataError, ShapeError, readLock, readState } from "@/lib/store";

export const dynamic = "force-dynamic";

const VIEWS: View[] = ["today", "skill", "reach", "journal", "library", "companion"];

/** One "put back the last good copy" button per broken file. */
function RestoreButtons({ files }: { files: string[] }) {
  return (
    <div className="restore-list">
      <p>The quickest fix: put back the last good copy. The app keeps one every time your data is in good shape, and keeps today&apos;s broken copy aside too.</p>
      {files.map((file) => (
        <form key={file} method="post" action="/api/restore">
          <input type="hidden" name="file" value={file} />
          <button className="btn btn-signal" type="submit">Restore the last good {file}.json</button>
        </form>
      ))}
      <form method="post" action="/api/restore">
        <input type="hidden" name="file" value="all" />
        <button className={`btn${files.length ? "" : " btn-signal"}`} type="submit">Put everything back to the last good moment</button>
      </form>
    </div>
  );
}

const VIEW_NAME: Record<View, string> = { today: "Tonight", skill: "You", reach: "Hiring", journal: "Journal", library: "Library", companion: "Commands" };
/** Friendly words in the address (?v=hiring) open the same page as the internal key (?v=reach). */
const ALIAS: Record<string, View> = { tonight: "today", you: "skill", hiring: "reach", commands: "companion" };
const asView = (v?: string): View | undefined => (VIEWS.includes(v as View) ? (v as View) : ALIAS[v ?? ""]);

/** The first title the browser sees is already the right page, before any script runs. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const saved = (await cookies()).get("growth_view")?.value;
  const view: View = asView(v) ?? asView(saved) ?? "today";
  return { title: `${VIEW_NAME[view]} - Growth` };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ v?: string; restored?: string }> }) {
  const { v, restored } = await searchParams;
  const KNOWN = ["all your data", ...["bets", "evidence", "learning", "library", "notnow", "profile", "proof", "queue", "reach", "rubric", "skills", "tests", "week"].map((f) => `${f}.json`)];
  const restoredOk = restored && KNOWN.includes(restored) ? restored : undefined;
  const jar = await cookies();
  // Explicit ?v= wins; a bare "/" reopens the last view from the growth_view cookie (allowlisted, trusted no further).
  const saved = jar.get("growth_view")?.value;
  const initialView: View = asView(v) ?? asView(saved) ?? "today";
  const seenIntro = jar.get("growth_seen")?.value === "1";
  try {
    return <App initial={{ ...(await readState()), lock: await readLock() }} initialView={initialView} restored={restoredOk}seenIntro={seenIntro} />;
  } catch (e) {
    const shape = e instanceof ShapeError ? e : null;
    const files = e instanceof DataError ? [e.file] : shape ? shape.files : [];
    return (
      <main className="page data-error">
        <h1>Your data needs a quick fix</h1>
        <p>
          {e instanceof DataError
            ? <>The file <code>growth/data/{e.file}.json</code> couldn&apos;t be read.</>
            : shape ? <>Something in {files.length ? files.map((f) => `${f}.json`).join(", ") : "your data"} doesn&apos;t follow the rules the app needs.</>
            : "One of your data files couldn't be read."}{" "}
          Nothing was lost; the app just can&apos;t open it as it is.
        </p>
        {shape
          ? <ul className="muted">{shape.problems.slice(0, 6).map((x) => <li key={x}>{x}</li>)}</ul>
          : <p className="muted">{e instanceof Error ? e.message : "Something went wrong reading your data."}</p>}
        <RestoreButtons files={files} />
        <p>Or ask Claude to fix it. In Claude Code, say:</p>
        <pre className="code">fix my growth data{files.length ? ` (${files.map((f) => `${f}.json`).join(", ")})` : ""}</pre>
        <p className="muted">Claude runs the data check, repairs the file and tells you what changed. Then reload this page. The restore buttons above also work without Claude.</p>
      </main>
    );
  }
}
