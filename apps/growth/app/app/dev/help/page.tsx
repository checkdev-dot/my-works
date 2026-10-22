"use client";

import { notFound } from "next/navigation";
import { HelpMoment, RecipeOnce } from "@/components/HelpMoment";
import { HELP } from "@/lib/help";

/** Dev-only: every help moment with fixture values. `force` ignores what was remembered and writes nothing. */
const VARS: Record<string, Record<string, string | number>> = {
  addon: { say: "score my CV" },
  pace: { label: "Lighter", date: "15 Dec", delta: ", about 4 weeks later" },
};

export default function HelpFixture() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="shell comp" style={{ padding: "40px 16px", display: "grid", gap: 24, maxWidth: 720 }}>
      <p className="muted">Fixture copy, not the person&apos;s data. Narrow the window to 720px or less to see the phone wording. Nothing is saved.</p>
      {HELP.filter((h) => h.kind === "note").map((h) => (
        <section key={h.id} style={{ display: "grid", gap: 6 }}>
          <h2 style={{ fontSize: 14, margin: 0 }}>{h.id}{h.needsComputer ? " (needs a computer)" : ""}{h.phoneOnly ? " (phone only)" : ""}</h2>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>{h.where}</p>
          {h.id === "pace"
            ? <p className="help-moment">{h.copy.replace(/\{(\w+)\}/g, (_, k) => String(VARS.pace[k]))}</p>
            : <HelpMoment id={h.id} force vars={VARS[h.id]} />}
        </section>
      ))}
      <section style={{ display: "grid", gap: 6 }}>
        <h2 style={{ fontSize: 14, margin: 0 }}>recipe (first time open, then folded)</h2>
        <RecipeOnce id="fixture-open" force>
          <dl className="recipe">
            <div><dt>Where</dt><dd>In Claude Code.</dd></div>
            <div><dt>Give it</dt><dd>Nothing to attach.</dd></div>
            <div><dt>Then</dt><dd>Say “answer it”.</dd></div>
            <div><dt>You&apos;ll see</dt><dd>The reply here.</dd></div>
          </dl>
        </RecipeOnce>
        <details className="how-fold" open={false}>
          <summary>How this works</summary>
          <p className="help-moment">Folded state: shown after the first time.</p>
        </details>
      </section>
    </div>
  );
}
