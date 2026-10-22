"use client";

import { ClaudePage, JournalView, LibraryView, ReachView, SkillView, Today } from "@/components/App";
import type { GrowthState } from "@/lib/types";

const noop = async () => false;
const none = () => {};
/** The app's own page names. The old names (reach, skill) still work in ?p= and map to hiring and you. */
const PAGES = ["today", "commands", "hiring", "you", "journal", "library"] as const;
type P = (typeof PAGES)[number];
const ALIAS: Record<string, P> = { reach: "hiring", skill: "you" };

function Page({ p, s }: { p: P; s: GrowthState }) {
  const act = noop as never;
  const ob = { status: s.onboarding?.status ?? "not_started", must_total: 40, must_answered: 0, ready_to_plan: false } as const;
  return (
    <main className="page"><div className="world">
      {p === "today" && <Today s={s} act={act} busy={false} open={none} go={none} attn={[]} onAct={none} />}
      {p === "commands" && <ClaudePage s={s} open={none} attn={[]} needs={0} onAct={none} onboarding={{ ...ob, status: "not_started" }} />}
      {p === "hiring" && <ReachView s={s} act={act} open={none} go={none} busy={false} />}
      {p === "you" &&<SkillView s={s} act={act} busy={false} open={none} go={none} />}
      {p === "journal" && <JournalView s={s} act={act} busy={false} />}
      {p === "library" && <LibraryView s={s} act={act} busy={false} go={none} openSheet={none} />}
    </div></main>
  );
}

function Inner({ initial, q }: { initial: GrowthState; q?: string | null }) {
  const p: P = ALIAS[q ?? ""] ?? ((PAGES as readonly string[]).includes(q ?? "") ? (q as P) : "today");
  return (
    <div className="shell">
      <nav aria-label="Fixture pages" style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "8px 16px" }}>
        {PAGES.map((x) => <a key={x} href={`?p=${x}`} className="linkbtn" aria-current={x === p ? "page" : undefined}>{x}</a>)}
      </nav>
      <Page key={p} p={p} s={initial} />
    </div>
  );
}

export function Fixtures({ initial, q }: { initial: GrowthState; q?: string }) {
  return <Inner initial={initial} q={q} />;
}
