"use client";

import { CompanionView, commandsSub, type FirstCommand } from "@/components/Companion";
import { AttentionList } from "@/components/Attention";
import { claudeStatus } from "@/lib/claude-status.mjs";
import type { AttentionItem } from "@/lib/attention.mjs";
import { STATES, type Key } from "./states";

const TODAY = "2026-10-14";
const view: AttentionItem["action"] = { type: "view", view: "today" };
const mk = (id: string, level: AttentionItem["level"], title: string, over: Partial<AttentionItem> = {}): AttentionItem => ({ id, level, kind: id, title, action: view, ...over });

// The same kinds the real inbox produces, so the shared builder (inboxSummary) says the same sentence here and live.
const questions = mk("asked", "now", "5 questions from Claude", { count: 5, why: "Your answers decide what Claude plans first.", when: "2026-10-12", action: { type: "sheet", sheet: { kind: "intake" } } });
const items: AttentionItem[] = [
  questions,
  mk("carried", "today", "2 tasks from earlier days", { count: 2, when: "2026-10-13", why: "Picking them up costs nothing." }),
  mk("library-new", "week", "3 picks in the Library you have not looked at", { count: 3, when: "2026-10-12", action: { type: "view", view: "library" } }),
];
const backItems: AttentionItem[] = [mk("replies", "now", "1 reply from Claude", { when: "2026-10-13", count: 1 })];
const noop = () => {};

const waitingList = (
  <ul className="timeline"><li><span className="d">13 Oct 2026</span><span>Review of &quot;Onboarding case study&quot;</span></li></ul>
);
const backList = (state: Key) => (
  <ul className="timeline back-log"><li><span className="d">13 Oct 2026</span><span className="back-note"><span className="ask-who">Review of your case study{state === "reply" ? <span className="back-new"> · New</span> : null}</span></span></li></ul>
);

/** Dev only. One state at a time, because the hero's action bar is fixed on a short screen. Layout stand-in: nothing here can write. */
export function Fixtures({ state }: { state: Key }) {
  const asked = state === "questions" ? 5 : 0;
  const waiting = state === "questions" ? 1 : 0;
  // A reply having come back is what marks the app as connected, so every state but the last has one.
  const back = state === "disconnected" ? 0 : 1;
  const unread = state === "reply" ? 1 : 0;
  const attn = state === "questions" ? items : state === "reply" ? backItems : [];
  // The hero says the questions or the reply once; the inbox does not repeat them (same rule as the live page).
  const inbox = attn.filter((i) => !(state === "questions" && i.id === "asked") && !(state === "reply" && i.id === "replies"));
  const total = attn.filter((i) => i.level === "now" || i.level === "today").reduce((n, i) => n + (i.count ?? 1), 0);
  const first: FirstCommand = state === "questions" ? "answer" : state === "disconnected" ? "library" : "growth";
  const status = claudeStatus({ queue: { items: waiting ? [{ status: "pending", type: "critique" }, { status: "done", done: "2026-10-12" }] : [{ status: "done", done: "2026-10-12" }] } }).sentence;
  return (
    <div className="shell">
      <nav aria-label="Fixture states" style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "8px 16px" }}>
        {STATES.map((x) => <a key={x.key} href={`?s=${x.key}`} className="linkbtn" aria-current={x.key === state ? "page" : undefined}>{x.label}</a>)}
      </nav>
      <main className="page">
        <CompanionView
          key={state}
          first={first}
          reply={state === "reply" ? { title: "Review of \"Case study draft\"", onRead: noop } : undefined}
          counts={{ waiting, asked, back, unread, known: 0, total }}
          onAnswer={noop}
          statusLine={state === "disconnected" ? undefined : status}
          head={<header className="page-head att-head"><h1 className="att-label">Commands</h1><p className="page-sub">{commandsSub(state !== "disconnected", attn)}</p></header>}
          slots={{
            waiting: waitingList,
            attention: inbox.length > 0 ? <AttentionList items={inbox} today={TODAY} onAct={noop} showSum={false} /> : undefined,
            fromClaude: backList(state),
          }}
        />
      </main>
    </div>
  );
}
