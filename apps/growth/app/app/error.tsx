"use client";

/** If anything breaks while showing the app, say so plainly and offer the ways back. Nothing on disk is touched. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page data-error">
      <h1>Something went wrong in the app</h1>
      <p>This is a problem in the app itself, not in your data. Your data is safe; nothing was changed. Try again first.</p>
      <p><button className="btn btn-signal" onClick={reset}>Try again</button></p>
      <p className="muted">If it keeps happening, reload the page.</p>
      <p className="muted">If that doesn&apos;t help, in Claude Code, in the growth folder, say:</p>
      <pre className="code">fix the growth app</pre>
    </main>
  );
}
