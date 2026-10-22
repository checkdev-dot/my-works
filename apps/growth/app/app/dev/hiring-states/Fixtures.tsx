"use client";

import { ReachView } from "@/components/App";
import type { GrowthState } from "@/lib/types";
import { FIXTURES } from "../cv-states/cv-data";

const noop = async () => false;
const iso = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString("en-CA"); };

/** Each state is a deep copy of the real data with only the date inputs changed. Never saved anywhere. */
function make(base: GrowthState, id: string): GrowthState {
  const s: GrowthState = JSON.parse(JSON.stringify(base));
  const live = (s.library.gaps ?? []).filter((g) => g.status !== "closed");
  if (id === "late") for (const g of live) { g.estimated = iso(-120); if (g.evenings === undefined) g.evenings = 3; }
  if (id === "unknown") { const last = live[live.length - 1]; if (last) delete last.evenings; }
  if (id === "no-ready-by") for (const g of live) delete g.evenings;
  if (id === "gates-ready") { for (const p of s.proof.items) p.status = "done"; const ready = FIXTURES.find((f) => f.id === "ready")?.career; if (ready) s.career = JSON.parse(JSON.stringify(ready)); }
  return s;
}

const LABEL: Record<string, string> = {
  "on-track": "On track (real data)",
  late: "Late: every estimate is 120 days old",
  unknown: "One gap not estimated yet",
  "no-ready-by": "No ready-by: nothing estimated",
  "gates-ready": "Every CV and portfolio item ready: quiet hero, Applications unlocked",
};

function One({ id, base }: { id: string; base: GrowthState }) {
  const s = make(base, id);
  return (
    <section style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px" }}>
      <p style={{ font: "600 13px system-ui", opacity: 0.6 }}>Fixture: {LABEL[id]}</p>
      <ReachView s={s} act={noop as never} open={() => {}} go={() => {}} busy={false} />
    </section>
  );
}

function Inner({ initial, only }: { initial: GrowthState; only?: string }) {
  const ids = ["on-track", "late", "unknown", "no-ready-by", "gates-ready"];
  return <>{(only ? [only] : ids).map((id) => <One key={id} id={id} base={initial} />)}</>;
}

export function Fixtures({ initial, only }: { initial: GrowthState; only?: string }) {
  return <Inner initial={initial} only={only} />;
}
