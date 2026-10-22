"use client";

import { notFound } from "next/navigation";
import { AttentionBanner, AttentionList } from "@/components/Attention";
import { attentionBadge, type AttentionItem } from "@/lib/attention.mjs";

const TODAY = "2026-10-14";
const go: AttentionItem["action"] = { type: "view", view: "today" };
const mk = (id: string, level: AttentionItem["level"], title: string, over: Partial<AttentionItem> = {}): AttentionItem => ({ id, level, kind: id, title, action: go, ...over });

const one = [mk("asked", "now", "5 questions from Claude", { count: 5, why: "Your answers decide what Claude plans first. About a minute each.", when: "2026-10-12", action: { type: "sheet", sheet: { kind: "intake" } } })];
const mixed = [
  ...one,
  mk("waiting", "today", "2 things are queued for Claude", { count: 2, why: "Nothing changes until you say it in Claude Code.", when: "2026-10-13", action: { type: "command", cmd: "answer it" } }),
  mk("tonight", "today", "Tonight: Rewrite the onboarding case study intro and 1 more", { count: 2, why: "About 45 minutes in all. A smaller night still counts.", when: TODAY }),
  mk("library-new", "week", "3 picks in the Library you have not looked at", { count: 3, why: "Each one is scored and checked. All optional.", when: "2026-10-12", action: { type: "view", view: "library" } }),
  mk("trinkets", "fyi", "A thought from Dieter Rams", { when: "2026-10-12" }),
];
const many = [
  mk("asked", "now", "5 questions from Claude", { count: 5, why: "Your answers decide what Claude plans first.", when: "2026-10-08", action: { type: "sheet", sheet: { kind: "intake" } } }),
  mk("replies", "now", "3 replies from Claude", { count: 3, why: "Reviews, briefs and scored tests are on the Claude page.", when: "2026-10-13", action: { type: "view", view: "companion" } }),
  mk("a", "now", "A review of your case study came back", { when: "2026-10-13" }),
  mk("b", "now", "A fourth now item goes behind Later", { when: "2026-10-13" }),
  mk("waiting", "today", "4 things are queued for Claude", { count: 4, when: "2026-10-09", action: { type: "command", cmd: "answer it" } }),
  mk("carried", "today", "3 tasks have carried over 3 evenings", { count: 3, why: "Picking them up costs nothing. Dates move at Sunday's review.", when: "2026-10-12" }),
  mk("tonight", "today", "Tonight: Interview story, first draft and 1 more", { count: 2, when: TODAY }),
  mk("proof-read", "week", "2 finished items are proof waiting for a reader", { count: 2, why: "It counts in full once someone has read it and said something.", action: { type: "view", view: "reach" } }),
  mk("library-stale", "week", "Your Library needs a refresh", { when: "2026-09-20", action: { type: "command", cmd: "update my library" } }),
  mk("skill-start", "week", "Research has no evidence yet", { when: "2026-10-12", why: "This week's first step starts it." }),
  mk("trinkets", "fyi", "2 new thoughts to carry", { count: 2, when: "2026-10-11" }),
  mk("podcasts", "fyi", "A podcast pick: The Design Details", { when: "2026-10-10", action: { type: "view", view: "library" } }),
];
const noop = () => {};

export default function AttentionFixture() {
  if (process.env.NODE_ENV === "production") notFound();
  const states: [string, AttentionItem[]][] = [["Empty", []], ["One thing", one], ["Mixed", mixed], ["Many", many]];
  return (
    <div className="shell comp" style={{ padding: "40px 16px", display: "grid", gap: 40, maxWidth: 480, margin: "0 auto" }}>
      <p className="muted">Placeholder content for layout only. Rows do nothing here.</p>
      {states.map(([name, items]) => (
        <section key={name}>
          <h2>{name} <span className="muted">(badge {attentionBadge(items)})</span></h2>
          <AttentionList items={items} today={TODAY} onAct={noop} />
        </section>
      ))}
      <section>
        <h2>Tonight banner</h2>
        <AttentionBanner items={mixed} today={TODAY} onAct={noop} />
      </section>
    </div>
  );
}
