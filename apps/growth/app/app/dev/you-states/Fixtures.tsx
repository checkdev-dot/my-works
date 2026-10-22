"use client";

import { SkillView } from "@/components/App";
import type { GrowthState } from "@/lib/types";

const noop = async () => false;

/** Each state is a deep copy of the real data with only the inputs changed. Never saved anywhere. */
function make(base: GrowthState, id: string): GrowthState {
  const s: GrowthState = JSON.parse(JSON.stringify(base));
  const focus = s.bets.bets.find((b) => b.track === "skill" && b.status === "active")?.focus;
  if (id === "evidence" && focus) {
    const r = s.skills.ratings[focus];
    r.as_of = new Date(Date.now() - 6 * 86400000).toLocaleDateString("en-CA");
    r.reviewed_by = "claude";
  }
  if (id === "no-evidence" && focus) {
    s.evidence.entries = s.evidence.entries.filter((e) => e.competency !== focus);
    s.skills.ratings[focus].evidence = [];
  }
  if (id === "no-focus") for (const b of s.bets.bets) if (b.track === "skill") b.status = "paused" as typeof b.status;
  if (id === "empty-person" && s.profile.person) { s.profile.person.words = []; s.profile.person.items = []; }
  return s;
}

const LABEL: Record<string, string> = {
  evidence: "Focus skill with evidence, Claude's estimate set 6 days ago",
  "no-evidence": "Focus skill with no evidence",
  "no-focus": "No focus skill: quiet hero",
  "empty-person": "Empty person: no words, no sentences",
};

function One({ id, base }: { id: string; base: GrowthState }) {
  const s = make(base, id);
  return (
    <section style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px" }}>
      <p style={{ font: "600 13px system-ui", opacity: 0.6 }}>Fixture: {LABEL[id]}</p>
      <SkillView s={s} act={noop as never} open={() => {}} go={() => {}} busy={false} />
    </section>
  );
}

function Inner({ initial, only }: { initial: GrowthState; only?: string }) {
  const ids = ["evidence", "no-evidence", "no-focus", "empty-person"];
  return <>{(only ? [only] : ids).map((id) => <One key={id} id={id} base={initial} />)}</>;
}

export function Fixtures({ initial, only }: { initial: GrowthState; only?: string }) {
  return <Inner initial={initial} only={only} />;
}
