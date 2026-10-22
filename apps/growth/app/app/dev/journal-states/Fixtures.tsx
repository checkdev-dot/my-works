"use client";

import { JournalView } from "@/components/App";
import type { Evidence, GrowthState } from "@/lib/types";

const noop = async () => false;
const iso = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString("en-CA"); };
const ev = (id: string, date: string, type: Evidence["type"], title: string, detail: string): Evidence => ({ id, date, type, title, detail, links: [] });

/** Each state is a deep copy of the real data with only the journal entries changed. Never saved anywhere. */
function make(base: GrowthState, id: string): GrowthState {
  const s: GrowthState = JSON.parse(JSON.stringify(base));
  const mine = [
    ev("fx-1", iso(0), "self", "Wrote three questions for the usability test", "Two of them were leading. I rewrote them as open questions and kept the third as it was."),
    ev("fx-2", iso(-1), "expert", "Senior designer liked the flow map", "She said the empty states were the strongest part and asked me to show how errors recover."),
  ];
  const review = ev("fx-3", iso(-2), "ai", "Review: usability brief", "What works: the goal is one sentence. Change first: name who you will test with. Next: draft the script.");
  const old = ev("fx-4", iso(-16), "shipped", "Shipped the onboarding redesign", "Cut the steps from six to three and moved permissions to the moment they are needed.");
  const keepOld = s.evidence.entries.filter((e) => !/^\d{4}-\d{2}-\d{2}$/.test(e.date));
  if (id === "empty") s.evidence.entries = [];
  if (id === "this-week") s.evidence.entries = [...mine, ...keepOld];
  if (id === "older") s.evidence.entries = [old, ...keepOld];
  if (id === "review") s.evidence.entries = [...mine, review, old, ...keepOld];
  return s;
}

const LABEL: Record<string, string> = {
  empty: "Empty: no entries at all",
  "this-week": "Entries this week, plus the earlier archive",
  older: "Only older entries: This week says so, Recent weeks and the fold carry the rest",
  review: "Entries this week with a Claude review in the list",
};

function One({ id, base }: { id: string; base: GrowthState }) {
  const s = make(base, id);
  return (
    <section style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px" }}>
      <p style={{ font: "600 13px system-ui", opacity: 0.6 }}>Fixture: {LABEL[id]}</p>
      <JournalView s={s} act={noop as never} busy={false} />
    </section>
  );
}

function Inner({ initial, only }: { initial: GrowthState; only?: string }) {
  const ids = ["empty", "this-week", "older", "review"];
  return <>{(only ? [only] : ids).map((id) => <One key={id} id={id} base={initial} />)}</>;
}

export function Fixtures({ initial, only }: { initial: GrowthState; only?: string }) {
  return <Inner initial={initial} only={only} />;
}
