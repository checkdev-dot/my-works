"use client";

import { LibraryView } from "@/components/App";
import type { GrowthState } from "@/lib/types";

const noop = async () => false;

/** Each state is a deep copy of the real data with only the picks changed. Never saved anywhere. */
function make(base: GrowthState, id: string): GrowthState {
  const s: GrowthState = JSON.parse(JSON.stringify(base));
  const wk = (s.library.picks ?? []).filter((p) => p.week_of === s.week.week_of);
  // The real data is not scored yet, so the scored states give each pick a made-up verdict (fixture only).
  const give = (p: (typeof wk)[number], i: number) => { p.score = { fit: 9, gain: 8, time: 8, substance: 9, fresh: 9, best: 8, total: [88, 74, 61, 80, 70][i % 5], verdict: ["read_now", "worth_it", "skim", "read_now", "worth_it"][i % 5] as "read_now", why: "It shows how a real team ran the same test you have to run this week.", compared: ["Another guide"], scored: s.week.week_of }; p.checked = p.checked ?? s.week.week_of; };
  if (id !== "unscored" && id !== "empty") wk.forEach((p, i) => { if (id !== "mixed" || i % 2 === 0) give(p, i); else delete p.score; });
  if (id === "scored") wk.forEach((p, i) => { if (i < 2) p.thumb = i === 0 ? "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" : "https://covers.openlibrary.org/b/isbn/9780321965516-M.jpg"; });
  if (id === "unscored") for (const p of wk) delete p.score;
  if (id === "empty") s.library.picks = (s.library.picks ?? []).filter((p) => p.week_of !== s.week.week_of);
  if (id === "left-out") s.library.left_out = [
    { title: "50 UX buzzwords every designer should know", kind: "article", why_not: "Mostly vocabulary, no examples.", total: 41, checked: s.week.week_of },
    { title: "Figma 2023 plugins roundup", kind: "video", why_not: "Out of date since the 2025 rebuild.", checked: s.week.week_of },
  ];
  return s;
}

const LABEL: Record<string, string> = {
  scored: "Scored picks (real data)",
  mixed: "Some scored, some not scored yet",
  unscored: "Unscored picks only",
  empty: "Empty: nothing picked this week",
  "left-out": "With the left-out list",
};

function One({ id, base }: { id: string; base: GrowthState }) {
  const s = make(base, id);
  return (
    <section style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px" }}>
      <p style={{ font: "600 13px system-ui", opacity: 0.6 }}>Fixture: {LABEL[id]}</p>
      <LibraryView s={s} act={noop as never} busy={false} go={() => {}} openSheet={() => {}} />
    </section>
  );
}

function Inner({ initial, only }: { initial: GrowthState; only?: string }) {
  const ids = ["scored", "mixed", "unscored", "empty", "left-out"];
  return <>{(only ? [only] : ids).map((id) => <One key={id} id={id} base={initial} />)}</>;
}

export function Fixtures({ initial, only }: { initial: GrowthState; only?: string }) {
  return <Inner initial={initial} only={only} />;
}
