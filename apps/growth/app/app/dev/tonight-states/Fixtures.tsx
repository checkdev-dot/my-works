"use client";

import { Today } from "@/components/App";
import type { GrowthState } from "@/lib/types";

const noop = async () => false;
const today = () => new Date().toLocaleDateString("en-CA");

function make(base: GrowthState, id: string): { s: GrowthState; force?: { sunday?: boolean; weekEnded?: boolean } } {
  const s: GrowthState = JSON.parse(JSON.stringify(base));
  const t = today();
  const open = () => { for (const k of s.week.tasks) { if (k.status === "done" || k.status === "submitted") { k.status = "todo"; k.closed = undefined; } } s.evidence.entries = s.evidence.entries.filter((e) => !(e.tag === "tonight" && e.date === t)); };
  const first = () => s.week.tasks.find((k) => k.status === "todo");
  if (id === "open" || id === "queued-open") open();
  if (id === "step-done") { open(); const k = first(); if (k) { k.status = "done"; k.closed = t; } }
  if (id === "all-done") { for (const k of s.week.tasks) { if (k.status === "todo") { k.status = "done"; k.closed = t; } } s.evidence.entries.push({ id: "fx", type: "note", tag: "tonight", date: t, title: "fixture", points: 0 } as never); }
  if (id === "nothing") s.week.tasks = [];
  // Something is queued for Claude: the command row leads with "answer it".
  if (id.startsWith("queued-")) s.queue.items = [...s.queue.items.filter((q) => q.status !== "pending"), { id: "Q-fx", type: "critique", status: "pending", created: t, task: s.week.tasks[0]?.id } as never];
  return { s, force: id === "week-ended" || id === "queued-week-ended" ? { weekEnded: true } : id === "sunday" ? { sunday: true } : { sunday: false, weekEnded: false } };
}

function One({ id, base }: { id: string; base: GrowthState }) {
  const { s, force } = make(base, id);
  return (
    <section style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px" }}>
      <p style={{ font: "600 13px system-ui", opacity: 0.6 }}>Fixture: {id}</p>
      <div className="world">
        <Today s={s} act={noop as never} busy={false} open={() => {}} go={() => {}} attn={[]} onAct={() => {}} force={force} />
      </div>
    </section>
  );
}

function Inner({ initial, only }: { initial: GrowthState; only?: string }) {
  const ids = ["open", "step-done", "all-done", "week-ended", "sunday", "nothing", "queued-open", "queued-week-ended"];
  return <>{(only ? [only] : ids).map((id) => <One key={id} id={id} base={initial} />)}</>;
}

export function Fixtures({ initial, only }: { initial: GrowthState; only?: string }) {
  return <Inner initial={initial} only={only} />;
}
