"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Chats, Copy, ChatCircleText, EnvelopeOpen, Plug, Compass, Keyboard } from "./icons";
import ledger from "../modules/ledger.json";
import { COMMANDS, FRONT_DOOR, plainExample, type GrowthCommand } from "@/lib/commands";
import { Modules, type ModulesData } from "./Modules";
import { CmdChip } from "./CommandHint";
import { Hero, HeroSkeleton, att } from "./ui";
import { inboxSummary, type AttentionItem } from "@/lib/attention.mjs";

/** The one sentence under the Commands title, for the live page and every fixture. Not connected comes first: nothing else is true yet. */
export function commandsSub(connected: boolean, items: AttentionItem[]): string {
  if (!connected) return "Connect Claude Code first.";
  return inboxSummary(items).line;
}

export { HOW_LINES } from "@/lib/help";

/* The Commands page. Internal names (companion, growth.companion.*, /api/companion, ?v=companion) stay; nothing he reads says companion. */

const SETUP_KEY = "growth.companion.setup";
const COMP_EVENT = "growth-companion-state";
const FOLDER = process.env.NEXT_PUBLIC_GROWTH_FOLDER || "your Growth folder (the app folder you installed)";
const read = () => { try { return localStorage.getItem(SETUP_KEY) === "1"; } catch { return false; } };

/** Has Claude Code been marked as connected on this device? Starts at "no" so server and client agree. */
export function useSetupDone(back = 0): [boolean, (v: boolean) => void, boolean] {
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setDone(read());
    sync(); setReady(true);
    window.addEventListener(COMP_EVENT, sync);
    return () => window.removeEventListener(COMP_EVENT, sync);
  }, []);
  const set = (v: boolean) => {
    setDone(v);
    try { if (v) localStorage.setItem(SETUP_KEY, "1"); else localStorage.removeItem(SETUP_KEY); } catch {}
    try { window.dispatchEvent(new Event(COMP_EVENT)); } catch {}
  };
  // "Connected" is only what you marked ("It answered"). A reply on record is shown separately as "has replied before".
  return [done || back > 0, set, ready];
}

/** What GET /api/onboarding-status says, in the fields the app uses. */
export type OnboardingStatus = { status: "not_started" | "in_progress" | "paused" | "complete"; must_total: number; must_answered: number; ready_to_plan: boolean };
const OB_TTL = 60_000;
let obCache: { at: number; v: OnboardingStatus } | null = null;
const OB_STATUSES = ["not_started", "in_progress", "paused", "complete"];

/** The onboarding status, read once a minute at most. Null until it arrives (or if it cannot be read), so nothing waits on it and nothing flashes. */
export function useOnboardingStatus(): OnboardingStatus | null {
  const [v, setV] = useState<OnboardingStatus | null>(null);
  useEffect(() => {
    let live = true;
    if (obCache && Date.now() - obCache.at < OB_TTL) { setV(obCache.v); return; }
    fetch("/api/onboarding-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live || !j || !OB_STATUSES.includes(j.status)) return;
        const n: OnboardingStatus = { status: j.status, must_total: Number(j.must_total) || 0, must_answered: Number(j.must_answered) || 0, ready_to_plan: j.ready_to_plan === true };
        obCache = { at: Date.now(), v: n };
        setV(n);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return v;
}

/** The one quiet line in the Tonight footer, until Claude Code is connected. Always below the night's tasks. */
export function SetupNudge({ onOpen, back = 0 }: { onOpen: () => void; back?: number }) {
  const [done, , ready] = useSetupDone(back);
  if (!ready || done) return null;
  return (
    <span className="ask-line"><Chats aria-hidden /> <button className="linkbtn" onClick={onOpen}>Connect Claude Code once</button></span>
  );
}

/** Group names as shown here, so they never repeat the Add-ons section title. */
const LABEL: Record<string, string> = { "Add-ons": "Working with skill files" };
/** G mini is for other people, so it lives in its own section and never in "All commands". */
const G_MINI = "G mini (for people you help)";
const MINI_COMMANDS = COMMANDS.filter((c) => c.group === G_MINI);
const OWN_COMMANDS = COMMANDS.filter((c) => c.group !== G_MINI);
const GROUPS = Array.from(new Set(OWN_COMMANDS.map((c) => c.group)));

/** Commands that really change the plan. Everything else that writes says what it writes. */
const PLAN_CMDS = new Set(["week", "plan", "change", "task", "goal", "pace", "swap", "later", "gaps", "notnow", "tonight"]);
const NOTE_CMDS = new Set(["journal", "journal add", "remember", "apply"]);
const PLAN_NEEDED = new Set(["plan", "check", "review 4w"]);
const tagFor = (c: GrowthCommand) => c.tag ?? (PLAN_CMDS.has(c.cmd) ? "Changes your plan" : NOTE_CMDS.has(c.cmd) ? "Adds a note" : "Changes your data, after your yes");
const needsId = (c: GrowthCommand) => /\b[SRGAQ]-\d+/.test(c.example);

function Row({ c, hasPlan }: { c: GrowthCommand; hasPlan: boolean | null }) {
  return (
    <li className="comp-cmd">
      <CmdChip text={plainExample(c.example)} label={`Copy: ${plainExample(c.example)} (all commands list)`} />
      <p className="comp-does">{c.does}{c.changes ? <span className="comp-tag">{tagFor(c)}</span> : <span className="comp-tag">Reads only</span>}</p>
      {needsId(c) && <p className="muted comp-plain">The id (like S-03) is shown at the top of each task&apos;s sheet in the app.</p>}
      {PLAN_NEEDED.has(c.cmd) && hasPlan === false && <p className="muted comp-plain">No plan yet. Say &ldquo;plan my four weeks&rdquo; to make one.</p>}
      {c.plain && c.plain.length > 0 && <p className="muted comp-plain">or just say: {c.plain.map((p) => `"${p}"`).join(", ")}</p>}
    </li>
  );
}

/** A G mini command: always shown with its leading /g-mini, so every form reads the same. */
function MiniRow({ c }: { c: GrowthCommand }) {
  const text = c.example.trim().startsWith("/") ? c.example.trim() : `/${c.example.trim()}`;
  return (
    <li className="comp-cmd">
      <CmdChip text={text} label={`Copy: ${text} (G mini)`} />
      <p className="comp-does">{c.does}<span className="comp-tag">{c.changes ? tagFor(c) : "Reads only"}</span></p>
      {c.plain && c.plain.length > 0 && <p className="muted comp-plain">or just say: {c.plain.map((p) => `"${p}"`).join(", ")}</p>}
    </li>
  );
}

const matches = (c: GrowthCommand, q: string) =>
  `${c.cmd} ${c.args ?? ""} ${c.does} ${c.example} ${(c.plain ?? []).join(" ")} ${c.group}`.toLowerCase().includes(q);
const canMatches = (i: { label: string; say: string; source: string }, topic: string, q: string) =>
  `${i.label} ${i.say} ${i.source} ${topic}`.toLowerCase().includes(q);

const TOPIC: Record<string, string> = {
  "task-review": "Work you hand in", "cv-review": "Your CV", "linkedin-review": "Your LinkedIn", "portfolio-review": "Your portfolio",
  "case-study": "Case studies", "interview-practice": "Interviews", library: "Your library", trinkets: "Little things worth keeping",
  journal: "Your journal", planning: "Your week", goal: "Your goal", "pace-and-gaps": "Pace and gaps", support: "Hard moments",
};
const topicName = (t: string) => TOPIC[t] ?? (t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, " "));

type Can = { key: string; label: string; say: string; source: string };

/** Topics the six examples already cover, so the list below never repeats them. */
const SIX_TOPICS = new Set(["task-review", "cv-review", "linkedin-review", "portfolio-review", "case-study", "library", "trinkets", "journal", "planning", "goal", "pace-and-gaps", "support"]);

/** Built-in abilities minus the retired ones, plus enabled abilities of installed skill files, grouped by topic. */
function whatYouCanDo(modules: ModulesData) {
  const retired = new Set(modules?.retired ?? []);
  const groups = new Map<string, Can[]>();
  const add = (topic: string, c: Can) => { const l = groups.get(topic) ?? []; l.push(c); groups.set(topic, l); };
  for (const a of (ledger as { abilities: { id: string; topic: string; label: string; say: string[] }[] }).abilities) {
    if (retired.has(a.id) || !a.say?.length || SIX_TOPICS.has(a.topic)) continue;
    add(a.topic, { key: a.id, label: a.label, say: a.say[0], source: "built-in" });
  }
  for (const m of modules?.installed ?? []) {
    if (!m.enabled) continue;
    for (const a of m.abilities ?? []) {
      if (!a.enabled || !a.say?.length) continue;
      add(a.topic, { key: m.id + a.id, label: a.label, say: a.say[0], source: m.name });
    }
  }
  return Array.from(groups.entries()).map(([topic, items]) => ({ topic, items }));
}

/** A text button that copies something and says so for two seconds. */
function CopyText({ label, get }: { label: string; get: () => string }) {
  const [state, setState] = useState<"idle" | "ok" | "failed">("idle");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return (
    <>
      <button type="button" className="btn" onClick={async () => {
        try { await navigator.clipboard.writeText(get()); setState("ok"); } catch { setState("failed"); }
        if (t.current) clearTimeout(t.current);
        t.current = setTimeout(() => setState("idle"), 2000);
      }}><Copy aria-hidden /> {state === "ok" ? "Copied" : label}</button>
      {state === "failed" && <span className="field-err" role="alert">Couldn&apos;t copy. Select the path and copy it.</span>}
    </>
  );
}

/** The hero's one primary: copies the command that fits now. */
function CopyPrimary({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "ok" | "failed">("idle");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return (
    <>
      <button type="button" className="btn btn-signal att-act" aria-label={`Copy: ${text}`} onClick={async () => {
        try { await navigator.clipboard.writeText(text); setState("ok"); } catch { setState("failed"); }
        if (t.current) clearTimeout(t.current);
        t.current = setTimeout(() => setState("idle"), 2000);
      }}><Copy aria-hidden /> {state === "ok" ? "Copied" : `Copy: ${text}`}</button>
      {state === "failed" && <span className="field-err" role="alert">Couldn&apos;t copy. Select the command and copy it.</span>}
    </>
  );
}

/** The folder path, breakable only after a backslash so a folder name never splits mid-word. */
function FolderPath() {
  const parts = FOLDER.split("\\");
  return (
    <span className="muted comp-path">
      {parts.map((p, i) => (
        <span key={i} className="comp-seg">{p}{i < parts.length - 1 && <>{"\\"}<wbr /></>}</span>
      ))}
    </span>
  );
}

/** Extra things to say that the six don't cover (built in, and from skill files). */
function MoreToSay({ can, q = "" }: { can: ReturnType<typeof whatYouCanDo>; q?: string }) {
  const shown = can.map((g) => ({ ...g, items: q ? g.items.filter((i) => canMatches(i, topicName(g.topic), q)) : g.items })).filter((g) => g.items.length > 0);
  if (shown.length === 0) return null;
  return (
    <div className="can-groups">
      {shown.map((g) => (
        <div key={g.topic} className="can-group">
          <h3 className="can-h">{topicName(g.topic)}</h3>
          <ul className="can-list">
            {g.items.map((i) => (
              <li key={i.key}>
                <span>{i.label}</span>
                <span className="muted can-say">Say &ldquo;{i.say}&rdquo;</span>
                {i.source !== "built-in" && <span className="can-chip is-addon">From {i.source}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export type ClaudeCounts = { waiting: number; asked: number; back: number; unread: number; known?: number; /** The badge number from the attention inbox: the one count the page says. */ total?: number };
export type ClaudeSlots = { waiting: React.ReactNode; asked?: React.ReactNode; fromClaude: React.ReactNode; /** The attention inbox, first block under the status card. */ attention?: React.ReactNode };

/** Which of the six fits right now: answer what is waiting, else refresh a stale library, else ask where you stand. */
export type FirstCommand = "answer" | "library" | "growth";
const FIRST_CMD: Record<FirstCommand, string> = { answer: "/growth answer", library: "/growth library", growth: "/growth" };

/** The Commands page body. The page header is passed in so it uses the app's own PageHead. */
export function CompanionView({ head, modules, counts, slots, onAnswer, first = "growth", reply, onboarding = null, statusLine }: { head: React.ReactNode; /** "Claude last ran: ... When you say answer it, it reads: ..." from claudeStatus(). */ statusLine?: string; modules?: ModulesData; counts: ClaudeCounts; slots: ClaudeSlots; onAnswer?: () => void; first?: FirstCommand; /** The newest unread reply from Claude: it becomes the T1. */ reply?: { title: string; onRead: () => void }; /** Where the onboarding stands. Null (not read yet) shows no onboarding hero. */ onboarding?: OnboardingStatus | null }) {
  const [done, setDone, ready] = useSetupDone(counts.back);
  const [marked] = useSetupDone(0);
  const [hasPlan, setHasPlan] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/plan-status").then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j && typeof j.has_plan === "boolean") setHasPlan(j.has_plan); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const can = whatYouCanDo(modules);
  const hasAddons = (modules?.installed ?? []).length > 0;
  const [stepsOpen, setStepsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const findRef = useRef<HTMLInputElement>(null);
  // Until the saved state is read, show only the header: no status flashing for someone who is already connected.
  if (!ready) return (
    <div className="world comp">
      {head}
      <HeroSkeleton />
    </div>
  );
  const q = query.trim().toLowerCase();
  // The one T1: not connected, else unanswered questions (answered in the app), else the command that fits now.
  // A reply that came back is the T1. With nothing waiting and nothing stale the T1 is a quiet "Nothing is waiting." and the fitting command is a row.
  // Onboarding comes right after "connect": it is what everything else is built from.
  const ob: "start" | "enough" | "resume" | null = !onboarding || onboarding.status === "complete" ? null
    : onboarding.status === "not_started" ? "start"
    : onboarding.ready_to_plan ? "enough" : "resume";
  // Priority: connect, questions, reply, onboarding (never while questions wait), the fitting command, quiet.
  const t1: "connect" | "onboarding" | "questions" | "reply" | "command" | "quiet" = !done ? "connect" : counts.asked > 0 ? "questions" : reply ? "reply" : ob ? "onboarding" : first === "growth" ? "quiet" : "command";
  // The order of "Then say" is the same in every state: the front door order, minus the one the hero already shows.
  const door = [...FRONT_DOOR];
  const fits = door.find((d) => d.cmd === FIRST_CMD[first]) ?? door[0];
  // One hero, at most three next commands; everything else is behind "All commands" (searchable by plain phrase).
  // With something queued, "answer it" leads the list (the hero's after-line no longer repeats it).
  const answerRow = door.find((d) => d.cmd === "/growth answer");
  const ordered = counts.waiting > 0 && answerRow ? [answerRow, ...door.filter((d) => d !== answerRow)] : door;
  const rows = (t1 === "command" ? ordered.filter((d) => d !== fits) : ordered).slice(0, 3);
  const stepsBody = (
    <div id="comp-setup" className="comp-setup-body">
      <ol className="route-steps comp-steps">
        <li><span>Open <b>Claude Code</b> on your computer.</span></li>
        <li><span>Start a new session in this folder (the Growth skill also works from any folder):</span>
          <span className="comp-open-act"><CopyText label="Copy folder path" get={() => FOLDER} /><FolderPath /></span></li>
        <li><span>Type <code>/growth</code>. If it answers, you&apos;re connected.</span></li>
      </ol>
      <p className="muted comp-p">The Growth skill is already installed for your whole computer. Nothing to install.</p>
      <div className="comp-done">
        {done && marked
          ? <button type="button" className="linkbtn" onClick={() => setDone(false)}>Mark as not connected</button>
          : <button type="button" className="btn btn-sm" onClick={() => setDone(true)}>It answered</button>}
      </div>
    </div>
  );
  const shownGroups = GROUPS.map((g) => ({ g, list: OWN_COMMANDS.filter((c) => c.group === g && (!q || matches(c, q))) })).filter((x) => x.list.length > 0);
  const shownN = shownGroups.reduce((n, x) => n + x.list.length, 0);
  const canN = q ? can.reduce((n, g) => n + g.items.filter((i) => canMatches(i, topicName(g.topic), q)).length, 0) : 0;
  return (
    <div className="world comp">
      {head}

      {/* T1: exactly one. Not connected, else questions waiting in the app, else the command that fits now. */}
      {t1 === "connect" && (
        <Hero icon={<Plug size={16} />} eyebrow="Set up once" title="Connect Claude Code" label="Connect Claude Code"
          act={<button type="button" className="btn btn-signal att-act" aria-expanded={stepsOpen} aria-controls="comp-setup" onClick={() => setStepsOpen((o) => !o)}>{stepsOpen ? "Hide the steps" : "Show the 3 steps"}</button>}>
          <p className="att-why">Claude Code is the only way to talk to Claude. It takes three steps, once.</p>
          {ob === "start" && <p className="att-note">Then say <CmdChip text="growth start" label="Copy: growth start" /> to begin your onboarding.</p>}
          {stepsOpen && stepsBody}
        </Hero>
      )}
      {t1 === "onboarding" && ob === "start" && (
        <Hero icon={<Compass size={16} />} eyebrow="Say this in Claude Code" title="Start your onboarding" label="Start your onboarding" act={<CopyPrimary text="growth start" />}>
          <p className="att-why">Claude asks you a few rounds of questions, then builds your plan from your answers. About 20 minutes a sitting.</p>
          <p className="att-note"><code className="comp-hero-cmd">growth start</code></p>
        </Hero>
      )}
      {t1 === "onboarding" && ob === "resume" && onboarding && (
        <Hero icon={<Compass size={16} />} eyebrow="Say this in Claude Code" title={`Resume your onboarding: ${onboarding.must_answered} of ${onboarding.must_total} answered`} label="Resume your onboarding" act={<CopyPrimary text="resume growth start" />}>
          <p className="att-why">Claude picks up where you stopped. About 20 minutes a sitting.</p>
          <p className="att-note"><code className="comp-hero-cmd">resume growth start</code></p>
        </Hero>
      )}
      {t1 === "onboarding" && ob === "enough" && (
        <Hero icon={<Compass size={16} />} eyebrow="Say this in Claude Code" title="Enough to start: say plan my four weeks" label="Enough to start" act={<CopyPrimary text="plan my four weeks" />}>
          <p className="att-why">You have answered enough for Claude to build your plan. You can keep answering after.</p>
          <p className="att-note"><code className="comp-hero-cmd">plan my four weeks</code></p>
        </Hero>
      )}
      {t1 === "questions" && (
        <Hero icon={<ChatCircleText size={16} />} eyebrow="Answer in the app" title={`${counts.asked} ${counts.asked === 1 ? "question" : "questions"} from Claude`} label="Questions from Claude"
          act={<button type="button" className="btn btn-signal att-act" onClick={onAnswer}><ChatCircleText size={20} aria-hidden="true" />Answer {counts.asked === 1 ? "it" : "them"}</button>}>
          <p className="att-why">Answer {counts.asked === 1 ? "it" : "them"} here in the app.{counts.waiting > 0 ? "" : <> After that, say <CmdChip text="answer it" label="Copy: answer it (after answering)" /> in Claude Code.</>}</p>
        </Hero>
      )}
      {t1 === "reply" && reply && (
        <Hero icon={<EnvelopeOpen size={16} />} eyebrow="From Claude" title={`Claude replied: ${reply.title}`} label="Claude replied"
          act={<button type="button" className="btn btn-signal att-act" onClick={reply.onRead}>Read it</button>}>
          <p className="att-why">Open it to see what Claude says and what it changed.</p>
        </Hero>
      )}
      {t1 === "quiet" && (
        <Hero quiet icon={<Keyboard size={16} />} eyebrow="When you want something" title="Say a command in Claude Code" label="Commands">
          <p className="att-why">The one that fits you now is first below.</p>
        </Hero>
      )}
      {t1 === "command" && (
        <Hero icon={<Keyboard size={16} />} eyebrow="Say this in Claude Code" title={<code className="comp-hero-cmd">{fits.chip}</code>} label={`Say ${fits.chip} in Claude Code`}
          act={<CopyPrimary text={fits.chip} />}>
          <p className="att-why">{fits.does}</p>
          <p className="att-note">Use it when {fits.when}.</p>
        </Hero>
      )}

      {/* T2 (three at most): what needs you, what is waiting, what came back. */}
      {slots.attention && (
        <section className={att(2)} aria-labelledby="comp-needs-h">
          <h2 id="comp-needs-h" className="att-2-title">Needs you</h2>
          {slots.attention}
        </section>
      )}

      {counts.waiting > 0 && (
        <section className={att(2)} aria-labelledby="comp-wait-h">
          <h2 id="comp-wait-h" className="att-2-title">Queued for Claude</h2>
          {slots.waiting}
          <p className="att-2-body comp-promise">It only changes things after you say yes.</p>
        </section>
      )}

      {statusLine && <p className="comp-status muted" role="status"><b>Claude&apos;s queue:</b> {statusLine}</p>}

      {(counts.back - (t1 === "reply" ? 1 : 0) > 0 || (counts.known ?? 0) > 0) && (
        <section className={counts.unread > 0 ? att(2) : "comp-bare"} aria-labelledby="comp-back-h">
          <h2 id="comp-back-h" className={counts.unread > 0 ? "att-2-title" : "comp-say-h"}>From Claude</h2>
          {slots.fromClaude}
        </section>
      )}

      {/* T3: the other commands, bare rows. */}
      <section aria-labelledby="comp-say-h" className="comp-bare">
        <h2 id="comp-say-h" className="comp-say-h">You can also say</h2>
        <ul className="att-list comp-say-list">
          {rows.map((d) => (
            <li key={d.cmd} className={`${att(3)} comp-say-row`}>
              <CmdChip text={d.chip} />
              <p className="comp-say-line">{d.does}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* T4: folded. */}
      {done && (
        <details className="fold att-4 comp-conn">
          <summary><ChevronRight className="chev" aria-hidden /> <span><b className="comp-setup-done"><Check aria-hidden /> {marked ? "Claude Code is connected" : "Claude Code has replied before"}</b></span></summary>
          {stepsBody}
        </details>
      )}

      <details className="fold att-4 comp-all" id="comp-all" open={q ? true : undefined} onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) findRef.current?.focus({ preventScroll: true }); }}>
        <summary><ChevronRight className="chev" aria-hidden /> <span><b>All commands ({OWN_COMMANDS.length})</b><span className="muted">Every command, grouped</span></span></summary>
        <label className="field comp-find">
          <span className="sr-only">Find a command</span>
          <input ref={findRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a command, in plain words" autoComplete="off" />
        </label>
        {q && <p className="muted comp-p comp-find-count" role="status">{shownN + canN} {shownN + canN === 1 ? "command matches" : "commands match"} &ldquo;{query.trim()}&rdquo;.</p>}
        <div className="comp-groups">
          {shownGroups.map(({ g, list }) => (
            <section key={g} aria-label={LABEL[g] ?? g}>
              <h3 className="comp-gh">{LABEL[g] ?? g}</h3>
              <ul className="comp-list">{list.map((c) => <Row key={c.cmd} c={c} hasPlan={hasPlan} />)}</ul>
            </section>
          ))}
          {q && shownN === 0 && !canN && <p className="muted comp-p">No command matches &ldquo;{query.trim()}&rdquo;. You can also just say what you want, in your own words.</p>}
        </div>
        <MoreToSay can={can} q={q} />
      </details>

      <details className="fold att-4 comp-mini-fold">
        <summary><ChevronRight className="chev" aria-hidden /> <span><b>G mini</b><span className="muted">For the people you help. It never touches your own Growth.</span></span></summary>
        <p className="muted comp-p">You run it in Claude Code with the person next to you. Each person has their own folder, and every reply starts with whose file is open.</p>
        <ol className="comp-mini-steps">
          <li><b>Start</b><CmdChip text="/g-mini new" /><span>Claude asks their name and their OK to save answers, then the interview starts.</span></li>
          <li><b>Interview</b><span>About 40 questions, one at a time, 45 to 60 minutes. They can say &ldquo;skip&rdquo; to any. To give a CV, paste its text or give the file path in Claude Code. Their LinkedIn text works the same way.</span></li>
          <li><b>Then on its own</b><span>Claude researches their target roles and builds the PDF. They can leave once the interview ends.</span></li>
          <li><b>You send it</b><span>Claude tells you where the PDF is saved. Check it and send it yourself. Claude never sends anything.</span></li>
          <li><b>If the PDF says Draft</b><CmdChip text="/g-mini <id> edit" /><span>Fill the yellow items with the person, then rebuild the PDF.</span></li>
        </ol>
        <h3 className="comp-gh">Later, only when needed</h3>
        <ul className="comp-list">{MINI_COMMANDS.filter((c) => c.cmd !== "g-mini new").map((c) => <MiniRow key={c.cmd} c={c} />)}</ul>
      </details>

      {(hasAddons || modules) && (
        <details className="fold att-4 comp-addons-fold">
          <summary><ChevronRight className="chev" aria-hidden /> <span><b>Add-ons</b><span className="muted">{hasAddons ? "Skill files that give Claude a new ability" : "Skill files you can add"}</span></span></summary>
          {hasAddons && <p className="muted comp-p">Each skill file says what new ability it gives Claude. To add another, say <CmdChip text="add this skill file" />.</p>}
          <Modules modules={modules} />
        </details>
      )}

      <details className="fold att-4 comp-safe-fold">
        <summary><ChevronRight className="chev" aria-hidden /> <span><b>How changes stay safe</b></span></summary>
        <ul className="comp-safe">
          <li>It checks your data before saving it.</li>
          <li>It keeps a copy first, so saying &ldquo;undo that&rdquo; puts things back.</li>
          <li>It never sends or posts anything for you.</li>
        </ul>
      </details>
    </div>
  );
}
