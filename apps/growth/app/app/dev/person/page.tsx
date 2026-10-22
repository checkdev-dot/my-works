"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { PersonCard } from "@/components/Person";
import type { Action, GrowthState, PersonItem } from "@/lib/types";

const item = (id: string, over: Partial<PersonItem>): PersonItem => ({
  id, area: "learns", text: "Sample item for layout only.", source: "you_said", evidence: [], confidence: 0.9,
  status: "confirmed", private: false, use_for: ["feedback"], noted: "2026-10-01", ...over,
});

const ITEMS: PersonItem[] = [
  item("W-001", { area: "learns", text: "Sample item for layout only.", confirmed: "2026-10-05" }),
  item("W-002", { area: "works", text: "Sample item for layout only, a little longer so the wrap can be checked on a narrow screen.", source: "observed", confidence: 0.7, confirmed: "2026-10-06" }),
  item("W-003", { area: "worry", text: "Sample private item for layout only.", private: true, confirmed: "2026-10-07" }),
  item("W-004", { area: "energy", text: "Sample item for layout only.", source: "estimate", confidence: 0.5, status: "proposed", why: "Sample reason for layout only.", evidence: ["E-001", "I-002", "X-404"] }),
  item("W-005", { area: "wants", text: "Sample item for layout only.", source: "observed", confidence: 0.7, status: "proposed", why: "Sample reason for layout only." }),
  item("W-006", { area: "limits", text: "Sample item for layout only.", source: "estimate", confidence: 0.5, status: "proposed" }),
];

/** Dev-only: the "Who you are" card with placeholder content. Actions change this page's own state, nothing is saved. */
function Fake({ items, card }: { items: PersonItem[]; card?: string }) {
  const [list, setList] = useState(items);
  const [log, setLog] = useState("");
  const s = {
    profile: { name: "Sample", person: { items: list, card }, intake: [{ id: "I-002", q: "Sample question for layout only?", asked: "2026-10-01", answer: "Sample" }] },
    evidence: { entries: [{ id: "E-001", date: "2026-10-01", type: "note", title: "Sample journal entry for layout only", detail: "", links: [] }] },
    library: { items: [], roles: [] },
    week: { tasks: [] },
  } as unknown as GrowthState;
  const act = async (a: Action) => {
    if (a.type === "person.set") setList((l) => l.map((i) => (i.id === a.id ? { ...i, status: a.status } : i)));
    if (a.type === "person.edit") setList((l) => l.map((i) => (i.id === a.id ? { ...i, text: a.text } : i)));
    if (a.type === "person.clear") setList([]);
    if (a.type === "person.restore") setList(a.person.items);
    setLog(a.type);
    return true;
  };
  return (
    <>
      <PersonCard s={s} act={act} busy={false} />
      <p className="muted" style={{ fontSize: 12 }}>Last action: {log || "none"}</p>
    </>
  );
}

export default function PersonFixture() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="shell comp" style={{ padding: "40px 16px", display: "grid", gap: 40, maxWidth: 760 }}>
      <p className="muted">Fixture content, not the person&apos;s data. Nothing is saved.</p>
      <section style={{ display: "grid", gap: 8 }}><h2 style={{ fontSize: 14, margin: 0 }}>Confirmed, one private, three proposed, one with evidence. Try Forget all of this.</h2>
        <Fake items={ITEMS} card="Sample card text for layout only. It stays short and in the second person." /></section>
      <section style={{ display: "grid", gap: 8 }}><h2 style={{ fontSize: 14, margin: 0 }}>Empty</h2>
        <Fake items={[]} /></section>
    </div>
  );
}
