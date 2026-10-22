"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { PersonCloud } from "@/components/PersonCloud";
import type { Action, GrowthState, PersonWord } from "@/lib/types";

const w = (n: number, word: string, over: Partial<PersonWord>): PersonWord => ({
  id: `W-w${String(n).padStart(2, "0")}`, word, weight: 3, area: "works", source: "you_said", confidence: 0.9, status: "confirmed", ...over,
});

const WORDS: PersonWord[] = [
  w(1, "Craft", { weight: 5, area: "wants", why: "You picked this as what you want from the next year." }),
  w(2, "Doing", { weight: 4, area: "learns", why: "You said this is how you learn best." }),
  w(3, "Curious", { weight: 4, area: "energy", source: "observed", confidence: 0.7, why: "You saved six picks on research this month." }),
  w(4, "Careful", { weight: 3, source: "observed", confidence: 0.7, status: "proposed", why: "You re-read your own task steps before starting." }),
  w(5, "Doubt", { weight: 3, area: "worry", source: "you_said", private: true, why: "You said this gets in your way." }),
  w(6, "Direct", { weight: 3, area: "voice", why: "You said this is how you want to be spoken to." }),
  w(7, "Making", { weight: 4, area: "energy" }),
  w(8, "Steady", { weight: 2, source: "estimate", confidence: 0.5, status: "proposed", why: "You finish small tasks more than big ones." }),
  w(9, "Evenings", { weight: 2, area: "limits", source: "estimate", confidence: 0.5, status: "proposed", why: "Most of your finished tasks were logged after 7pm." }),
  w(10, "Reading", { weight: 1, area: "learns", source: "observed", confidence: 0.7 }),
  w(11, "Teaching", { weight: 2, area: "energy", source: "estimate", confidence: 0.5, status: "confirmed", why: "You wrote about explaining your work to others." }),
  w(12, "Big-picture", { weight: 3, source: "estimate", confidence: 0.5, status: "proposed" }),
];

/** Dev-only: the "About you" cloud with sample words. Actions change this page's own state, nothing is saved. */
function Fake({ words }: { words: PersonWord[] }) {
  const [list, setList] = useState(words);
  const [log, setLog] = useState("");
  const s = { profile: { name: "Sample", person: { items: [], words: list } } } as unknown as GrowthState;
  const act = async (a: Action) => {
    if (a.type === "word.confirm") setList((l) => l.map((x) => (x.id === a.id ? { ...x, status: "confirmed" } : x)));
    if (a.type === "word.reject") setList((l) => l.map((x) => (x.id === a.id ? { ...x, status: "rejected" } : x)));
    if (a.type === "word.edit") setList((l) => l.map((x) => (x.id === a.id ? { ...x, word: a.word, source: "you_said", status: "confirmed" } : x)));
    if (a.type === "word.restore") { const back = a.word; setList((l) => l.map((x) => (x.id === back.id ? back : x))); }
    if (a.type === "word.set") setList((l) => l.concat(a.words.map((x, i) => ({ id: `W-w${50 + l.length + i}`, word: x.word, weight: (x.weight ?? 3) as PersonWord["weight"], area: x.area, source: x.source, confidence: 0.9, status: "confirmed" as const, why: x.why }))));
    setLog(a.type);
    return true;
  };
  return (
    <>
      <PersonCloud s={s} act={act} busy={false} />
      <p className="muted" style={{ fontSize: 12 }}>Last action: {log || "none"}</p>
    </>
  );
}

export default function PersonCloudFixture() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="shell comp" style={{ padding: "40px 16px", display: "grid", gap: 40, maxWidth: 760 }}>
      <p className="muted">Fixture content, not the person&apos;s data. Nothing is saved.</p>
      <section style={{ display: "grid", gap: 8 }}><h2 style={{ fontSize: 14, margin: 0 }}>Twelve words, mixed sources, four not confirmed. Tap a word.</h2>
        <Fake words={WORDS} /></section>
      <section style={{ display: "grid", gap: 8 }}><h2 style={{ fontSize: 14, margin: 0 }}>Empty</h2>
        <Fake words={[]} /></section>
    </div>
  );
}
