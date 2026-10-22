"use client";

import { ArrowRight, ArrowUp, ArrowDown, BookOpen, Boxes, Brain, Briefcase, CalendarCheck, Check, ChevronRight, ClipboardCheck, Clock, Code2, Copy, FileText, Hourglass, IconContext, Info, Landmark, Lightbulb, Lock, MessageSquare, Moon, Notebook, Paperclip, PauseCircle, PenTool, Plus, Question, RotateCcw, Search, Send, Target, TrendingUp, Unlock, Upload, Users, X, Play, Sparkles, Headphones, Eye, Bookmark, Wallet, Chats, Phone, Laptop, Keyboard, ExternalLink, Compass, ChatCircleText, Newspaper, PlayCircle, PencilSimple, ClipboardText, SealCheck, Hammer, CalendarBlank, Wrench, type LucideIcon } from "./icons";
import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Action, Bet, Day, Evidence, GoalFeeling, GrowthState, LogKind, Pace, Pick, ProofItem, Source, Stage, Task } from "@/lib/types";
import { Sheet, Hero, att, fmtDate } from "./ui";
import { qrPath } from "@/lib/qr";
import { scoredStatement } from "@/lib/help";
import { Face, type Mood } from "./Face";
import { CmdChip, CommandHint, openCompanion } from "./CommandHint";
import { PAGE_COMMAND } from "@/lib/commands";
import { CvPanel, cvAsk, cvShowLabel, cvState, cvStepTask, showCvCard } from "./CvPanel";
import { CaseStudies, standLine } from "./CaseStudies";
import { LibraryCard, LeftOutFold, PickThumb, PickWord, SourceMark, checkedAgo } from "./LibraryCard";
import { CompanionView, SetupNudge, useSetupDone, useOnboardingStatus, commandsSub, HOW_LINES, type OnboardingStatus } from "./Companion";
import { claudeStatus } from "@/lib/claude-status.mjs";
import { formatMoney } from "@/lib/money.mjs";
import { ToolsFold } from "./Modules";
import { AttentionList, AttentionPopover, AttentionBanner } from "./Attention";
import { deriveAttention, attentionBadge, inboxSummary, carriedOver, type AttentionItem } from "@/lib/attention.mjs";
import { readyBy, gapForecast, forecastInputs, type ReadyBy } from "@/lib/forecast.mjs";
import { PersonCard } from "./Person";
import { GapMap, domainGapOf } from "./GapMap";
import { HelpButton } from "./HelpButton";
import { HelpMoment, RecipeOnce, resetHelp } from "./HelpMoment";
import { TrinketShelf, TonightTrinket } from "./Trinket";
import { ratingState, ratingSummary, lengthText as lengthWords, lookForText, secondPerson } from "@/lib/rating-state.mjs";
import { RATING_SKILLS, TARGET, XP_PER_LEVEL, chainOf, character, gainOf, gainText, isDone, levelWord, nextLevel, proofSteps, ratings, reviewed, statXp, type RatingKey } from "@/lib/ratings";

export type View = "today" | "skill" | "reach" | "journal" | "library" | "companion";
type SheetBase =
  | { kind: "skill"; id: string }
  | { kind: "log"; preset?: LogKind }
  | { kind: "handin"; id: string }
  | { kind: "attach"; id: string }
  | { kind: "respond"; id: string }
  | { kind: "notnow" }
  | { kind: "review" }
  | { kind: "brief"; id: string; task?: string; jump?: boolean }
  | { kind: "test"; id: string }
  | { kind: "intake" }
  | { kind: "how"; phone?: boolean }
  | { kind: "goal" }
  | { kind: "gap"; id: string }
  | { kind: "rating"; key: RatingKey }
  | { kind: "quest"; id: string };
/** A sheet can remember the one it was opened from, so closing it goes back there. */
type SheetState = (SheetBase & { back?: SheetBase }) | null;

/** undo: a task id (undoes a hand-in) or the action that reverses this one. */
type ActFn = (a: Action, ok?: string, undo?: string | Action | Action[]) => Promise<boolean>;
type OpenFn = (s: SheetState) => void;

const DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAME: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };

const localToday = () => new Date().toLocaleDateString("en-CA");
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};
const isClosed = (t: Task) => t.status === "done" || t.status === "submitted";
const isTyping = (e: KeyboardEvent) => { const el = e.target as HTMLElement | null; return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)); };
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} },
};

/** A small key hint for a button. Shown only with a keyboard and a fine pointer on a wide screen (CSS), and never to a screen reader. */
function KeyHint({ k }: { k: string }) {
  return <kbd className="key-hint" aria-hidden="true">{k}</kbd>;
}

/** The task's id (S-03), muted, with a copy: the Claude Code commands take it. */
function TaskIdChip({ id }: { id: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="linkbtn muted" title={id} aria-label={`Copy task id ${id}, used in Claude Code commands`} onClick={async () => { try { await navigator.clipboard.writeText(id); setOk(true); setTimeout(() => setOk(false), 2000); } catch { setOk(false); } }}>
      {ok ? "Copied" : "Copy id"}
    </button>
  );
}

/** Single-key shortcuts on or off, kept on this device. */
function KeysToggle() {
  const [off, setOff] = useState(false);
  useEffect(() => { setOff(store.get("growth.keys") === "off"); }, []);
  return (
    <button type="button" className="btn btn-sm" role="switch" aria-checked={!off} onClick={() => { const n = !off; setOff(n); store.set("growth.keys", n ? "off" : "on"); }}>
      Keyboard shortcuts: {off ? "off" : "on"}
    </button>
  );
}

/** State that autosaves to this device as you type, so closing a sheet never loses your words. */
function useDraft<T>(key: string, initial: T): [T, (v: T) => void, () => void] {
  const k = `growth.draft.${key}`;
  const [v, setV] = useState<T>(() => {
    const raw = store.get(k);
    if (raw === null) return initial;
    try { return JSON.parse(raw) as T; } catch { return initial; }
  });
  const set = useCallback((nv: T) => {
    setV(nv);
    const empty = nv === "" || (Array.isArray(nv) && nv.every((x) => x === "" || x == null));
    if (empty) { try { localStorage.removeItem(k); } catch {} } else store.set(k, JSON.stringify(nv));
  }, [k]);
  const clear = useCallback(() => { setV(initial); try { localStorage.removeItem(k); } catch {} }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  return [v, set, clear];
}

function DraftNote({ show }: { show: boolean }) {
  return show ? <p className="draft-note"><Check aria-hidden /> Draft saved as you type. Close any time.</p> : null;
}

/* ================= derived week ================= */

function useWeek(s: GrowthState) {
  return useMemo(() => {
    const start = s.week.week_of;
    const end = addDays(start, 6);
    const dates = DAYS.map((_, i) => addDays(start, i));
    // "This week" is one thing: the Monday-start week of today, the same one the Journal's "This week" group uses.
    const calStart = weekOf(localToday());
    const calEnd = addDays(calStart, 6);
    const inWeek = s.evidence.entries.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && ((e.date >= start && e.date <= end) || (e.date >= calStart && e.date <= calEnd)));
    const lit = dates.map((d) => inWeek.some((e) => e.date === d && e.type !== "ai"));
    const todayIdx = dates.indexOf(localToday());
    return { start, dates, lit, todayIdx, entries: inWeek };
  }, [s]);
}

/* ================= vocabulary ================= */

/** The five names for where an open task sits. Used everywhere, so the words never drift. */
const WHEN = { tonight: "Tonight", today: "Today's list", carried: "Carried over", later: "Later this week", week: "This week's list" } as const;

export const COMP_ICON: Record<string, LucideIcon> = {
  product_thinking: Lightbulb, craft: PenTool, systems: Boxes, research: Search,
  communication: MessageSquare, collaboration: Users, building: Code2, domain: Landmark,
};
/** The one next thing that raises a number: the same words on the card and in its peek. */
function nextRaiseText(s: GrowthState, k: RatingKey): string {
  if (k === "work") return "Rises when skills move up at Sunday review.";
  const key = k === "cv" ? "cv" : "interview";
  const p = [...s.proof.items].sort((a, b) => a.priority - b.priority).find((x) => !isReady(x) && (x[key] ?? 0) > 0);
  return p ? `Next: ${p.name.replace(/:\s+/, ", ").replace(/\s*→\s*/g, " to ")} (up to +${gainOf(p, key).left})` : lookForText(ratings(s).find((r) => r.key === k)?.score ?? 0);
}

/** The skill furthest below its target: the one thing to lift, instead of an overall percentage. Ties go to this month's focus. */
function bottleneck(s: GrowthState): string {
  const focus = s.bets.bets.find((b) => b.track === "skill" && b.status === "active")?.focus;
  const gap = (id: string) => (s.skills.ratings[id].target ?? 3) - (((s.skills.ratings[id] as { level_counted?: number }).level_counted) ?? s.skills.ratings[id].level);
  return [...s.rubric.competencies.map((c) => c.id)].sort((a, b) => gap(b) - gap(a) || (b === focus ? 1 : 0) - (a === focus ? 1 : 0))[0];
}

/** One name per skill everywhere: the part of the rubric name before the colon. */
/** The phone note: Claude Code lives on the computer. */
function PhoneNote({ hold }: { hold: boolean }) { return <HelpMoment id="phone" hold={hold} />; }
/** When Claude next sees what you saved. */
const nextRun = () => "next time you say “answer it” in Claude Code";
/** A short, clean name to say aloud: the first few words, no ellipsis, no trailing punctuation. */
const sayName = (text: string, fallback = "this task", max = 4) => {
  const words = text.replace(/[“”"…]/g, "").split(/\s+/).filter(Boolean);
  return words.length > max ? fallback : words.join(" ").replace(/[\s.,;:!?\-–—(]+$/, "");
};
/** The command row on a hero: each chip is labelled with the worry it answers. While something is queued for Claude, "answer it" goes first; at most 3. */
const asks = (s: GrowthState, list: { ask: string; say: string }[]) => (s.queue.items.some((q) => q.status === "pending") ? [{ ask: "Claude owes you answers?", say: "answer it" }, ...list] : list).slice(0, 3);
const LOST = { ask: "Not sure what to do?", say: "where do I stand" };
/** The full instruction for getting Claude's work. */
const howToSend = () => "In Claude Code, say \u201canswer it\u201d.";
/** The one line every save-for-Claude confirmation shows. */
const savedLine = () => "Saved. Claude sees it when you say \u201canswer it\u201d in Claude Code.";

/** Cuts at a word boundary and adds an ellipsis, so a long title never ends mid-word. */
const clipWords = (str: string, max: number): string => {
  const t = (str ?? "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.4 ? cut.slice(0, at) : t.slice(0, max)).replace(/[\s,.;:!?-]+$/, "")}…`;
};

const skillShort = (s: GrowthState, id?: string) => (s.rubric.competencies.find((c) => c.id === id)?.name ?? id ?? "").split(":")[0];
const isReady = isDone;
const TRACK = { skill: { name: "Skill task", Icon: Brain }, reach: { name: "Job-search task", Icon: Briefcase } } as const;
/** The 16px glyph that leads a Tonight hero's eyebrow: what kind of task it is. Decorative. */
function taskKindIcon(t: { kind?: Task["kind"]; track?: Task["track"] }) {
  if (t.track === "reach" || t.kind === "roles") return <Briefcase size={16} />;
  if (t.kind === "test") return <ClipboardText size={16} />;
  if (t.kind === "proof") return <SealCheck size={16} />;
  if (t.kind === "ask") return <ChatCircleText size={16} />;
  if (t.kind === "practice") return <Hammer size={16} />;
  return <BookOpen size={16} />;
}
const IMPACT_WORD = { high: "A lot of what recruiters look for", medium: "Some of what recruiters look for", low: "A little of what recruiters look for" } as const;
/** A share of a bar in words: "a sixth", "a third", "half". */
const fracWord = (f: number) => (f >= 0.95 ? "All" : f >= 0.45 ? "Half" : f >= 0.3 ? "A third" : f >= 0.22 ? "A quarter" : f >= 0.15 ? "A sixth" : "A small part");
/** Phone or desk, said plainly, so a spare few minutes can be used. */
function WhereTag({ t, where }: { t?: Task; where?: "phone" | "desk" }) {
  const w = where ?? t?.where;
  if (!w || w === "phone") return null;
  return <span className={`where where-${w}`}><Laptop aria-hidden /> At your desk</span>;
}
/** Turns each "→" in a data string into the visible arrow. */
function withArrows(str: string): React.ReactNode {
  const parts = str.split("→");
  if (parts.length === 1) return str;
  return parts.map((p, i) => <Fragment key={i}>{i > 0 && <Arr />}{p}</Fragment>);
}
/** Keeps the last two words together so a line never ends on one short word. Leaves titles of two words or fewer alone. */
function nb(str: string): string {
  const m = str.match(/^([\s\S]*\S)\s+(\S+)\s*$/);
  if (!m || !/\s/.test(m[1])) return str;
  return `${m[1]} ${m[2]}`;
}
/** A visible arrow between two values, read aloud as "to". */
function Arr() {
  return <><ArrowRight aria-hidden className="arr" /><span className="sr"> to </span></>;
}
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const STATUS_TEXT: Record<ProofItem["status"], string> = { missing: "Not started", draft: "In progress", done: "Done", verified: "Read by someone" };
const GUESS: Record<string, string> = { self: "your own estimate", ai: "Claude's estimate", shipped: "shipped work", expert: "a reviewer", market: "a real result" };
/** Money is shown by lib/money.mjs only: the person's own currency, never a hand-written symbol or a divide by 100000. Data from before onboarding is INR. */
const curOf = (s: GrowthState): string => ((s.profile as { situation?: { currency?: string } }).situation?.currency) || "INR";
const moneyOf = (s: GrowthState, n: number, compact = false): string => formatMoney(n, curOf(s), "month", undefined, compact ? { compact: true } : undefined);
const confirmedLevel = (r: GrowthState["skills"]["ratings"][string]) => ratingState(r).owner === "dev";
/** Journal entries that name no skill, so the skill view can say how many could be linked. */
const unlinkedEntries = (s: GrowthState) => s.evidence.entries.filter((e) => !e.competency).length;

function lastEvidence(s: GrowthState, t: Task) {
  return [...s.evidence.entries].reverse().find((e) => e.title === t.task);
}

/** Tonight = the next unfinished task in each track, in plan order. A task finished today stays visible as done. */
function tonight(s: GrowthState) {
  const today = localToday();
  const order = (t: Task) => (t.day ? DAYS.indexOf(t.day) : 99);
  return (["skill", "reach"] as const).map((track) => {
    const mine = s.week.tasks.filter((t) => t.track === track).sort((a, b) => order(a) - order(b));
    return mine.find((t) => isClosed(t) && t.closed === today) ?? mine.find((t) => t.status === "todo");
  }).filter(Boolean) as Task[];
}

/* ================= app ================= */

export function App({ initial, initialView = "today", restored, seenIntro = false }: { initial: GrowthState; initialView?: View; restored?: string; seenIntro?: boolean }) {
  const [s, setS] = useState(initial);
  const [view, setView] = useState<View>(initialView);
  const [sheet, setSheetRaw] = useState<SheetState>(null);
  // Remember what opened a sheet (by a stable attribute and a text/class fingerprint), so closing returns focus there
  // even if the page re-rendered the button in the meantime.
  const openerRef = useRef<{ id: string; text: string; cls: string } | null>(null);
  const setSheet = useCallback((v: SheetState | ((cur: SheetState) => SheetState)) => {
    if (typeof v !== "function" && v) {
      const a = document.activeElement as HTMLElement | null;
      if (a && a !== document.body && !a.closest(".sheet")) {
        const id = `o${Date.now().toString(36)}`;
        a.setAttribute("data-opener", id);
        openerRef.current = { id, text: (a.textContent ?? "").trim().slice(0, 80), cls: a.className && typeof a.className === "string" ? a.className : "" };
      }
    }
    setSheetRaw(v);
  }, []);
  // Escape closes the top sheet on the first press, wherever focus is (capture phase), unless an IME is composing
  // or a help popover is open (its own Escape closes that first).
  const sheetIsOpen = !!sheet;
  useEffect(() => {
    if (!sheetIsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing || e.keyCode === 229 || e.defaultPrevented) return;
      if (document.querySelector('.help-btn[aria-expanded="true"]') || document.querySelector(".discard")) return;
      const btn = document.querySelector<HTMLElement>(".sheet:not(.is-closing) .sheet-close");
      if (!btn) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      btn.click();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [sheetIsOpen]);
  const sheetWasOpen = useRef(false);
  useEffect(() => {
    if (sheet) { sheetWasOpen.current = true; return; }
    if (!sheetWasOpen.current) return;
    sheetWasOpen.current = false;
    const o = openerRef.current;
    openerRef.current = null;
    if (!o) return;
    const t = setTimeout(() => {
      if (document.querySelector(".sheet")) return;
      let el = document.querySelector<HTMLElement>(`[data-opener="${o.id}"]`);
      if (!el && o.cls) el = Array.from(document.querySelectorAll<HTMLElement>("button, a")).find((n) => n.className === o.cls && (n.textContent ?? "").trim().slice(0, 80) === o.text) ?? null;
      el?.removeAttribute("data-opener");
      if (el && el.isConnected) el.focus({ preventScroll: true });
    }, 30);
    return () => clearTimeout(t);
  }, [sheet]);
  const [toast, setToast] = useState<{ msg: string; err?: boolean; retry?: () => void; undo?: () => void } | null>(null);
  const [busy, setBusy] = useState(false);
  const [intro, setIntro] = useState(false);
  // Hidden for one frame until we know whether this is a first visit, so onboarding never flashes Tonight first.
  // When the server already knows the welcome was seen (cookie), render straight away; otherwise wait one frame.
  // The last view arrives from the growth_view cookie on the server, so a bare "/" is already right; no hiding for it.
  const [booted, setBooted] = useState(seenIntro);

  useEffect(() => {
    if (!store.get("growth.seen.intro")) setIntro(true);
    else document.cookie = "growth_seen=1; max-age=31536000; path=/; samesite=lax";
    // Coming back without a link: open where the person was last time.
    // Same evening: reopen where the person was. A new evening always starts on Tonight.
    const [day, last] = (store.get("growth.view") ?? "").split("|");
    const bare = !new URLSearchParams(location.search).get("v");
    if (bare && initialView !== "today" && day !== localToday()) { setView("today"); document.cookie = "growth_view=today; max-age=31536000; path=/; samesite=lax"; }
    else if (bare && day === localToday() && last && last !== initialView && ["skill", "reach", "journal", "library"].includes(last)) { setView(last as View); history.replaceState(null, "", "/?v=" + last); }
    setBooted(true);
    if (restored) {
      setToast({ msg: `Put back the last good copy of ${restored}. Your app is working again.` });
      history.replaceState(null, "", location.pathname + location.search.replace(/[?&]restored=[^&]*/, "").replace(/^&/, "?"));
    }
  }, []);
  const go = useCallback((v: View) => {
    setView(v);
    store.set("growth.view", `${localToday()}|${v}`);
    document.cookie = `growth_view=${v}; max-age=31536000; path=/; samesite=lax`;
    history.replaceState(null, "", v === "today" ? "/" : `/?v=${({ skill: "you", reach: "hiring", companion: "commands" } as Record<string, string>)[v] ?? v}`);
    window.scrollTo({ top: 0 });
  }, []);
  // A page title per view, and focus moves to the page's H1 after a view change (not on first load).
  const viewFirst = useRef(true);
  useEffect(() => {
    const NAME: Record<View, string> = { today: "Tonight", skill: "You", reach: "Hiring", journal: "Journal", library: "Library", companion: "Commands" };
    document.title = `${intro ? "Welcome" : NAME[view]} - Growth`;
    if (viewFirst.current) { viewFirst.current = false; return; }
    const h = setTimeout(() => (document.querySelector("main h1") as HTMLElement | null)?.focus({ preventScroll: true }), 80);
    return () => clearTimeout(h);
  }, [view, intro]);
  const finishIntro = (to?: View) => { setTimeout(() => (document.querySelector(".page h1") as HTMLElement | null)?.focus(), 60); store.set("growth.seen.intro", "1"); document.cookie = "growth_seen=1; max-age=31536000; path=/; samesite=lax"; setIntro(false); if (to) go(to); };
  useEffect(() => {
    if (!toast || toast.err) return;
    // 5s for a plain note; 8s when it has an Undo or tells you something to do (say, Claude Code), and Dismiss closes it sooner.
    const carries = /\bsay\b|Claude Code|answer it/i.test(toast.msg);
    const t = setTimeout(() => setToast(null), toast.undo || carries ? 8000 : 5000);
    return () => clearTimeout(t);
  }, [toast]);
  // Keep the last toast on screen for a short exit instead of cutting it.
  const [shownToast, setShownToast] = useState<typeof toast>(null);
  const [toastLeaving, setToastLeaving] = useState(false);
  useEffect(() => {
    if (toast) { setShownToast(toast); setToastLeaving(false); return; }
    setToastLeaving(true);
    const t = setTimeout(() => setShownToast(null), 180);
    return () => clearTimeout(t);
  }, [toast]);

  const inflight = useRef(false);
  const lockedRef = useRef(!!initial.lock);
  const act = useCallback(async (a: Action, ok?: string, undo?: string | Action | Action[]): Promise<boolean> => {
    if (inflight.current) return false; // a second click while the first is saving does nothing
    if (lockedRef.current) {
      setToast({ msg: "Saves are paused while Claude works. Your draft is kept; send it when Claude finishes.", err: true });
      return false;
    }
    inflight.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(a) });
      const body = await res.json();
      if (res.status === 423 && body.lock) {
        setS((cur) => ({ ...cur, lock: body.lock }));
        setToast({ msg: "Claude just started working on your data. Your draft is kept; send it when Claude finishes.", err: true });
        return false;
      }
      if (!res.ok) throw new Error(body.error ?? "Couldn't save.");
      setS(body);
      if (ok) setToast({ msg: ok, undo: undo ? () => {
        setToast(null);
        if (Array.isArray(undo)) { void (async () => { for (let i = 0; i < undo.length; i++) { if (!(await act(undo[i], i === undo.length - 1 ? "Undone." : undefined))) break; } })(); }
        else typeof undo === "string" ? act({ type: "task.undo", id: undo }, "Undone. Nothing was counted.") : act(undo, "Undone.");
      } : undefined });
      return true;
    } catch (e) {
      const offline = e instanceof TypeError;
      const m = e instanceof Error ? e.message : "Couldn't save.";
      setToast({ msg: offline ? "Can't reach the app. If you closed the terminal, run npm run dev in the growth folder, then Retry. Nothing was changed." : /nothing was changed/i.test(m) ? m : `${m} Nothing was changed.`, err: true, retry: () => { setToast(null); act(a, ok, undo); } });
      return false;
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }, []);
  // Keep the lock in a ref for act(), and say so when Claude has finished.
  useEffect(() => {
    const was = lockedRef.current;
    lockedRef.current = !!s.lock;
    if (was && !s.lock) setToast({ msg: "Claude has finished. You can save again." });
  }, [s.lock]);
  const closeSheet = useCallback(() => setSheet((cur) => cur?.back ?? null), []);
  // Short screens: the step bar tucks away while you scroll down and returns on scroll up, at the top and at the bottom.
  useEffect(() => {
    const root = document.documentElement;
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const atEnd = y <= 8 || window.innerHeight + y >= document.documentElement.scrollHeight - 8;
      if (atEnd || y < lastY) delete root.dataset.actbar;
      else if (y > lastY + 6) root.dataset.actbar = "hide";
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); delete root.dataset.actbar; };
  }, []);
  // When the person comes back to the window (say, after running his queue in Claude Code), pick up what Claude wrote.
  useEffect(() => {
    let last = 0;
    const refresh = async () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 4000) return;
      last = Date.now();
      try {
        const res = await fetch("/api/state");
        if (res.ok) { const next = await res.json(); setS((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next)); }
      } catch { /* offline: keep what's on screen */ }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  // While Claude is working, check every few seconds so its results appear the moment it finishes.
  useEffect(() => {
    if (!s.lock) return;
    const id = setInterval(async () => {
      try { const res = await fetch("/api/state"); if (res.ok) setS(await res.json()); } catch { /* try again next tick */ }
    }, 6000);
    return () => clearInterval(id);
  }, [s.lock]);
  const openJournal = useCallback(() => {
    go("journal");
    setTimeout(() => window.dispatchEvent(new CustomEvent("growth-journal", { detail: "learned" })), 60);
  }, [go]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e) || sheet) return;
      if (intro) { if (e.key === "Escape") finishIntro(); return; }
      if (store.get("growth.keys") === "off") return; // single-key shortcuts can be switched off in How this works
      const k = e.key.toLowerCase();
      if (k === "o") {
        if (view !== "today") go("today");
        const cur = tonight(s).find((t) => t.status === "todo");
        if (cur) setSheet({ kind: "quest", id: cur.id });
      }
      else if (k === "1") go("today");
      else if (k === "2") go("skill");
      else if (k === "3") go("reach");
      else if (k === "4") go("journal");
      else if (k === "5") go("library");
      else if (k === "6") go("companion");
      else if (k === "j") { e.preventDefault(); openJournal(); }
      else if (k === "h") {
        if (view !== "today") go("today");
        const cur = tonight(s).find((t) => t.status === "todo");
        const brief = cur?.kind === "learn" ? [...s.learning.briefs].reverse().find((b) => b.competency === cur.competency) : undefined;
        if (cur && brief) setSheet({ kind: "brief", id: brief.id, task: cur.id, jump: true });
        else if (cur && cur.kind !== "test" && cur.kind !== "ask") setSheet({ kind: "handin", id: cur.id });
        else if (cur) { setSheet({ kind: "quest", id: cur.id }); setToast({ msg: "Open the task first. It has its own steps." }); }
      }
      else if (k === "c") go("companion");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const h = () => { setSheet(null); go("companion"); };
    window.addEventListener("growth-companion", h);
    return () => window.removeEventListener("growth-companion", h);
  }, [go]);
  // "Use on another device" opens the same sheet as in How this works, already on the phone step.
  useEffect(() => {
    const h = () => setSheet({ kind: "how", phone: true });
    window.addEventListener("growth-phone", h);
    return () => window.removeEventListener("growth-phone", h);
  }, []);
  // One number, said as "things that need you": waiting for Claude + questions Claude asked + replies not yet seen.
  // One source of truth: the attention inbox. The badge, the Commands page, Tonight's banner and the phone shortlist all read it.
  const backN = cameBack(s).length;
  const unreadN = useUnread(backN);
  const onboarding = useOnboardingStatus();
  const attn = useMemo(() => deriveAttention(s, new Date(), { unreadReplies: unreadN, onboarding }), [s, unreadN, onboarding]);
  const needs = attentionBadge(attn); // inboxSummary(attn).n: the sum of the numbers in the rows, said everywhere
  useEffect(() => {
    const h = () => setAttnSheet(true);
    window.addEventListener("growth-needs", h);
    return () => window.removeEventListener("growth-needs", h);
  }, []);
  // On the Commands page, when its own T1 is "N questions from Claude", the badge number is a duplicate: it steps back to an outline.
  const [setupDone] = useSetupDone(backN);
  const dupBadge = view === "companion" && !intro && setupDone && (attn.find((i) => i.id === "asked")?.count ?? 0) > 0;
  const [attnAnchor, setAttnAnchor] = useState<HTMLElement | null>(null);
  const [attnSheet, setAttnSheet] = useState(false);
  const toggleAttn = (e: React.MouseEvent<HTMLElement>) => {
    // Decided at the tap: a popover under the badge from 900px wide, a bottom sheet below.
    if (window.matchMedia("(min-width: 900px)").matches) setAttnAnchor((a) => (a ? null : e.currentTarget));
    else setAttnSheet(true);
  };
  const closeAttn = useCallback(() => { setAttnAnchor(null); setAttnSheet(false); }, []);
  const actOnAttn = (i: AttentionItem) => {
    closeAttn();
    const a = i.action;
    if (a.type === "view") { setIntro(false); setSheet(null); go(a.view); }
    else if (a.type === "sheet") setSheet(a.sheet as SheetState);
  };
  // `tiny` is the short form for the narrowest phones only (under 340px); every wider width shows the full name.
  const PAGES: { v: View; label: string; short?: string; tiny?: string; Icon: LucideIcon; key: string }[] = [
    { v: "today", label: "Tonight", Icon: Moon, key: "1" },
    { v: "skill", label: "You", Icon: Brain, key: "2" },
    { v: "reach", label: "Hiring", Icon: Briefcase, key: "3" },
    { v: "journal", label: "Journal", Icon: Notebook, key: "4" },
    { v: "library", label: "Library", Icon: BookOpen, key: "5" },
  ];
  const peekTask = sheet?.kind === "quest" ? s.week.tasks.find((t) => t.id === sheet.id) : undefined;
  // Phone tabs never scroll: all five are equal columns (see the nav rules in notion.css).

  return (
    <IconContext.Provider value={{ weight: "regular", size: "1em" }}>
    <div className={`app${s.lock ? " is-locked" : ""}`}>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); const m = document.getElementById("main"); (m?.querySelector("h1") as HTMLElement | null)?.focus(); m?.scrollIntoView({ block: "start" }); }}>Skip to content</a>
      <aside className="side" aria-label="Workspace" inert={intro || undefined}>
        <div className="side-head"><Face mood="focused" size={26} /><b>The person&apos;s growth</b></div>
        <nav className="side-nav" aria-label="Main">
          {PAGES.map(({ v, label, Icon, key }) => (
            <button key={v} aria-current={!intro && view === v ? "page" : undefined} onClick={() => { setIntro(false); go(v); }} aria-keyshortcuts={key}>
              <Icon aria-hidden /> <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="side-nav side-more">
          <div className="side-row">
            <button aria-current={!intro && view === "companion" ? "page" : undefined} onClick={() => { setIntro(false); go("companion"); }} aria-keyshortcuts="6 c"><Chats aria-hidden /> <span>Commands</span> <KeyHint k="C" /></button>
            {needs > 0 && <button type="button" className={`attn-side${dupBadge ? " is-dup" : ""}`} aria-haspopup="dialog" aria-expanded={!!attnAnchor || attnSheet} title="Things that need you" aria-label={`${needs} ${needs === 1 ? "thing needs" : "things need"} you`} onClick={toggleAttn}><span className="attn-count">{needs}</span></button>}
          </div>
          <button onClick={() => setSheet({ kind: "how" })}><Info aria-hidden /> <span>How the app works</span></button>
        </div>
        <Hud s={s} open={setSheet} view={view} place="side" />
        <ul className="keys keys-grid" aria-hidden>
          <li><kbd>1</kbd> to <kbd>6</kbd> pages</li>
          <li><kbd>O</kbd> open task</li>
          <li><kbd>H</kbd> hand in</li>
          <li><kbd>J</kbd> journal</li>
          <li><kbd>C</kbd> Commands</li>
        </ul>
      </aside>

      <header className="mhead" inert={intro || undefined}>
        <div className="mhead-brand"><Face mood="focused" size={26} /><b><span className="brand-long">The person&apos;s growth</span><span className="brand-short" aria-hidden>Growth</span></b></div>
        <div className="mact">
          <button className="mact-claude" aria-current={!intro && view === "companion" ? "page" : undefined} onClick={() => { setIntro(false); go("companion"); }} title="Commands" aria-label="Commands" aria-describedby={needs > 0 ? "mact-needs-desc" : undefined}><Chats aria-hidden /><span className="mact-word">Commands</span>{needs > 0 && <span className="attn-count mact-pill" aria-hidden>{needs}</span>}{needs > 0 && <span id="mact-needs-desc" className="sr">{needs} {needs === 1 ? "thing needs" : "things need"} you</span>}</button>
          {needs > 0 && <button type="button" className={`mact-need${dupBadge ? " is-dup" : ""}`} aria-haspopup="dialog" aria-expanded={!!attnAnchor || attnSheet} title="Things that need you" aria-label={`${needs} ${needs === 1 ? "thing needs" : "things need"} you. Open the list`} onClick={toggleAttn}><span className="attn-count">{needs}</span><span className="mact-need-w">{needs === 1 ? "needs you" : "need you"}</span></button>}
          <button onClick={() => setSheet({ kind: "how" })} aria-label="How the app works"><Info aria-hidden /></button>
        </div>
        <nav className="mnav" aria-label="Main, bottom">
          {PAGES.map(({ v, label, tiny, Icon }) => (
            <button key={v} className="mtab" aria-current={!intro && view === v ? "page" : undefined} onClick={() => { setIntro(false); go(v); }} aria-label={label} title={label}><Icon aria-hidden /><span className="mtab-l">{label}</span>{tiny && <span className="mtab-t" aria-hidden>{tiny}</span>}</button>
          ))}
        </nav>
      </header>

      <main id="main" tabIndex={-1} key={intro ? "intro" : view} className={`page${booted ? "" : " booting"}`}>
        {s.lock && !intro && (
          <div className="working" role="status">
            <ClaudeMark size={28} />
            <p><b>{s.lock.by} is updating your data</b> (started {new Date(s.lock.started).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}). Your saves are paused until it&apos;s done, and anything you&apos;re writing stays as a draft. This page updates by itself.</p>
          </div>
        )}
        {intro ? <Intro s={s} onStart={() => finishIntro("today")} onSkip={() => finishIntro()} /> : <>
          {view === "today" && <Today s={s} act={act} busy={busy || !!s.lock} open={setSheet} go={go} attn={attn} onAct={actOnAttn} />}
          {view === "skill" && <SkillView s={s} act={act} busy={busy || !!s.lock} open={setSheet} go={go} />}
          {view === "reach" && <ReachView s={s} act={act} open={setSheet} go={go} busy={busy || !!s.lock} />}
          {view === "journal" && <JournalView s={s} act={act} busy={busy || !!s.lock} />}
          {view === "library" && <LibraryView s={s} act={act} busy={busy || !!s.lock} go={go} openSheet={setSheet} />}
          {view === "companion" && <ClaudePage s={s} open={setSheet} attn={attn} needs={needs} onAct={actOnAttn} onboarding={onboarding} />}
        </>}
      </main>

      {sheet?.kind === "quest" && peekTask && (
        <Sheet title={peekTask.task} sub={<>{TRACK[peekTask.track].name}, {lengthWords(peekTask.minutes)}{peekTask.where === "desk" ? <span className="muted"> · At your desk</span> : null}</>} onClose={closeSheet}>
          <Quest s={s} t={peekTask} act={act} busy={busy || !!s.lock} open={setSheet} />
          <details className="fold att-4 quest-details">
            <summary><ChevronRight className="chev" aria-hidden /> <span><b>Details</b></span></summary>
            <p className="muted">The id Claude Code commands take for this task. <TaskIdChip id={peekTask.id} /></p>
          </details>
        </Sheet>
      )}
      {sheet?.kind === "skill" && <SkillSheet s={s} id={sheet.id} open={setSheet} onClose={closeSheet} />}
      {sheet?.kind === "log" && <LogSheet s={s} preset={sheet.preset} act={act} onClose={closeSheet} />}
      {sheet?.kind === "handin" && <HandInSheet s={s} id={sheet.id} act={act} onClose={closeSheet} />}
      {sheet?.kind === "attach" && <AttachSheet s={s} id={sheet.id} act={act} onClose={closeSheet} />}
      {sheet?.kind === "respond" && <RespondSheet s={s} id={sheet.id} act={act} onClose={closeSheet} />}
      {sheet?.kind === "notnow" && <NotNowSheet s={s} onClose={closeSheet} />}
      {sheet?.kind === "review" && <ReviewSheet s={s} act={act} onClose={closeSheet} />}
      {sheet?.kind === "brief" && <BriefSheet s={s} id={sheet.id} taskId={sheet.task} jump={sheet.jump} act={act} onClose={closeSheet} />}
      {sheet?.kind === "rating" && <RatingSheet s={s} k={sheet.key} onClose={closeSheet} />}
      {sheet?.kind === "test" && <TestSheet s={s} id={sheet.id} act={act} onClose={closeSheet} />}
      {sheet?.kind === "intake" && <IntakeSheet s={s} act={act} onClose={closeSheet} />}
      {sheet?.kind === "gap" && <GapSheet s={s} id={sheet.id} onClose={closeSheet} />}
      {sheet?.kind === "goal" && <GoalSheet s={s} act={act} busy={busy || !!s.lock} onClose={closeSheet} />}
      {sheet?.kind === "how" && <HowSheet s={s} startOnPhone={!!sheet.phone} onReplay={() => { setSheet(null); setIntro(true); }} onClose={closeSheet} />}
      {attnAnchor && <AttentionPopover anchor={attnAnchor} onClose={closeAttn}><AttentionList items={attn} today={localToday()} onAct={actOnAttn} autoFocus /><p className="comp-status muted"><b>Claude&apos;s queue:</b> {claudeStatus(s).sentence}</p></AttentionPopover>}
      {attnSheet && <Sheet title="Needs you" size="content" onClose={closeAttn}><AttentionList items={attn} today={localToday()} onAct={actOnAttn} /><p className="comp-status muted"><b>Claude&apos;s queue:</b> {claudeStatus(s).sentence}</p></Sheet>}

      {shownToast && (
        <div className={`toast${shownToast.err ? " err" : ""}${toastLeaving ? " is-leaving" : ""}`} role={shownToast.err ? "alert" : "status"} aria-hidden={toastLeaving || undefined}>
          {withArrows(shownToast.msg)}
          {shownToast.undo && <button onClick={shownToast.undo}>Undo</button>}
          {shownToast.retry && <button onClick={shownToast.retry}>Retry</button>}
          {(shownToast.err || (!shownToast.undo && /\bsay\b|Claude Code|answer it/i.test(shownToast.msg))) && <button onClick={() => setToast(null)}>Dismiss</button>}
        </div>
      )}
    </div>
    </IconContext.Provider>
  );
}

/* ================= shared pieces ================= */

/** A Notion page header: icon, title, a one-line description, then property rows. */
/** True up to 480px wide (every phone). Starts false so the server and first paint agree. */
function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    const f = () => setPhone(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return phone;
}

function PageHead({ icon, title: fullTitle, short, sub, subClass, children, more, help, label }: { icon: React.ReactNode; title: string; /** The phone title, equal to the phone nav word ("You", "Hiring"). */ short?: string; sub?: string; subClass?: string; children?: React.ReactNode; more?: React.ReactNode; help?: string; /** The title is a 24px label, not a hero: the page's one T1 sits below it. */ label?: boolean }) {
  const h1 = label ? "att-label" : undefined;
  // Both words are in the markup on the server and the client; CSS (max-width 480) shows one, so the H1 never swaps after hydration.
  const title: React.ReactNode = short && short !== fullTitle
    ? <><span className="h1-long">{fullTitle}</span><span className="h1-short">{short}</span></>
    : fullTitle;
  return (
    <header className={`page-head${label ? " att-head" : ""}`}>
      <span className="page-icon" aria-hidden>{icon}</span>
      {help ? <div className="page-title-row"><h1 className={h1} tabIndex={-1}>{title}</h1><HelpButton id={help} /></div> : <h1 className={h1} tabIndex={-1}>{title}</h1>}
      {sub && <p className={`page-sub${subClass ? ` ${subClass}` : ""}`}>{sub}</p>}
      {children && <dl className="props">{children}</dl>}
      {more && (
        <details className="fold">
          <summary><ChevronRight className="chev" aria-hidden /> <span><b>More about this</b></span></summary>
          <dl className="props">{more}</dl>
        </details>
      )}
    </header>
  );
}
function Prop({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return <div className="prop"><dt><span aria-hidden>{icon}</span> {label}</dt><dd>{children}</dd></div>;
}

/** A progress bar, 0 to 1. `gain` shows what tonight adds; `target` draws the lead-ready line. */
function Bar({ value, gain = 0, target, segments, label, tone = "ink" }: { value: number; gain?: number; target?: number; segments?: number; label: string; tone?: "ink" | "accent" | "done" }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className={`bar bar-${tone}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <i style={{ transform: `scaleX(${v})` }} />
      {gain > 0 && <em style={{ left: `${v * 100}%`, width: `${Math.min(gain, 1 - v) * 100}%` }} />}
      {segments && Array.from({ length: segments - 1 }).map((_, k) => <b key={k} style={{ left: `${((k + 1) / segments) * 100}%` }} />)}
      {target !== undefined && <s style={{ left: `${target * 100}%` }} />}
    </span>
  );
}

/** Who the person is right now: level, and the three numbers that decide a job. */
function Hud({ s, open, view, place }: { s: GrowthState; open: OpenFn; view: View; place: "side" | "top" }) {
  const ch = character(s);
  const rs = ratings(s);
  return (
    <section className={`hud hud-${place} v-${view}`} aria-label="Where you stand">
      <div className="hud-id">
        <Face mood="focused" size={place === "side" ? 40 : 34} />
        <span className="hud-who"><b className="hud-name">The person</b><span className="hud-title">{ch.word} product designer</span></span>
      </div>
      <div className="hud-level">
        <span className="hud-next">Most to gain next: <b>{skillShort(s, bottleneck(s))}</b></span>
        {(() => { const pc = s.profile.pace ?? "steady"; const r = readyBy(s, pc); if (!r) return null; return <span className="hud-next">{r.status === "late" ? <>Ready to apply. {lateWords(r.date)}</> : <>Ready to apply around <b>{readyDate(r.date)}</b> at a {PACE[pc].label.toLowerCase()} pace</>}</span>; })()}
      </div>
      {view !== "reach" && (
        <ul className="hud-ratings" aria-label="Your three numbers">
          {rs.map((r) => (
            <li key={r.key}>
              <button className="hud-rating" onClick={() => open({ kind: "rating", key: r.key })} aria-label={`${r.name}: ${r.score} of 100, ${r.word}. Open what it's made of.`}>
                <span className="hr-name">{r.name}</span>
                <b className="hr-score">{r.score}</b>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ================= what a task moves, in career terms ================= */

/** Points from the same skill's tasks planned before this one, so previews add up across the week. */
function aheadPoints(s: GrowthState, t: Task) {
  if (!t.competency || isClosed(t)) return 0;
  const order = (x: Task) => (x.day ? DAYS.indexOf(x.day) : 99);
  return s.week.tasks.filter((x) => x.id !== t.id && x.competency === t.competency && x.status === "todo" && order(x) < order(t)).reduce((n, x) => n + x.points, 0);
}

type Effect = { label: string; big: string; pair?: [string, string]; bar?: { from: number; to: number; target?: number }; sub?: string; small?: boolean };

function effectOf(s: GrowthState, t: Task): Effect {
  const c = chainOf(s, t);
  if (c.kind === "skill") {
    const name = skillShort(s, t.competency) || c.stat;
    const ahead = aheadPoints(s, t);
    const from = Math.min(1, (c.xpFrom + ahead) / XP_PER_LEVEL), to = Math.min(1, (c.xpFrom + ahead + t.points) / XP_PER_LEVEL);
    const full = from >= 1;
    const then = c.ratings.length ? `, which lifts ${c.ratings.map((r) => `${r.name} from ${r.from} to ${r.to}`).join(" and ")}` : "";
    return {
      label: `${name}, toward Sunday review${ahead > 0 && !full ? ", once this week's earlier tasks are done" : ""}`,
      big: full ? "Already full" : `${pct(from)} to ${pct(to)}`,
      pair: full ? undefined : [pct(from), pct(to)],
      bar: { from, to },
      sub: full
        ? `This is more evidence for Sunday, when Claude checks your ${name.toLowerCase()} work.`
        : `When this is full, Claude checks your ${name.toLowerCase()} work at Sunday review. If it confirms it: ${c.levelFrom} to ${c.levelTo}${then}.`,
    };
  }
  if (c.kind === "proof") {
    const finishes = c.step >= c.steps;
    return {
      label: finishes ? "CV and portfolio" : `CV and portfolio, when all ${c.steps} steps are done`,
      big: `${c.cvFrom} to ${c.cvTo}`,
      pair: [String(c.cvFrom), String(c.cvTo)],
      bar: { from: c.cvFrom / 100, to: c.cvTo / 100, target: TARGET / 100 },
      sub: `${finishes ? "This finishes " : `Step ${c.step} of ${c.steps} toward `}“${c.proof}”. +${c.cvSeen - c.cvTo} more once someone else has read it.${c.unlocks ? ` Then you can start ${c.unlocks.toLowerCase()}.` : ""}`,
    };
  }
  return { label: "Gives you", big: cap(c.adds), small: true };
}

function EffectBlock({ s, t, compact }: { s: GrowthState; t: Task; compact?: boolean }) {
  const e = effectOf(s, t);
  if (compact) return (
    <div className="effect effect-compact">
      <p className="effect-line"><TrendingUp aria-hidden /><span className="effect-text"><span>{e.label}</span> <b>{e.pair ? <>{e.pair[0]}<Arr />{e.pair[1]}</> : e.big}</b></span></p>
      {e.bar && <Bar value={e.bar.from} gain={e.bar.to - e.bar.from} target={e.bar.target} label={`${e.label}: ${e.big}`} tone="accent" />}
    </div>
  );
  return (
    <div className="effect">
      <p className="effect-label"><TrendingUp aria-hidden /> {e.label}</p>
      <p className={`effect-big${e.small ? " small" : ""}`}>{e.pair ? <>{e.pair[0]}<Arr />{e.pair[1]}</> : e.big}</p>
      {e.bar && <Bar value={e.bar.from} gain={e.bar.to - e.bar.from} target={e.bar.target} label={`${e.label}: ${e.big}`} tone="accent" />}
      {e.sub && !compact && <p className="effect-sub">{e.sub}</p>}
    </div>
  );
}

/** What a finished task moved, in one line. */
function movedText(s: GrowthState, t: Task) {
  if (t.competency && t.track === "skill") return statXp(s, t.competency) > 0 ? `${skillShort(s, t.competency)} is ${pct(statXp(s, t.competency) / XP_PER_LEVEL)} of the way to Sunday review` : "";
  if (t.proof) {
    const p = s.proof.items.find((x) => x.id === t.proof);
    const cv = ratings(s).find((r) => r.key === "cv")!;
    return p && isReady(p) ? `${p.name}: done. CV and portfolio is now ${cv.score}` : `Step done toward ${p?.name ?? "your portfolio"}`;
  }
  return `You now have ${t.adds}`;
}

/* ================= Tonight ================= */

const FULL_DAY: Record<Day, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };
/** The day a task was planned for, if that's before today: it carried over, at no cost. */
function carried(t: Task) {
  let today = DAYS.indexOf(new Date().toLocaleDateString("en-GB", { weekday: "short" }) as Day);
  if (today < 0) today = DAYS.length; // Sunday: same reading as taskWhen, every planned day has passed
  return t.day && today > DAYS.indexOf(t.day) ? FULL_DAY[t.day] : null;
}

/** One source of truth for done steps: the ones ticked off, plus step 0 once a learn task's brief has been read. */
function doneSteps(s: GrowthState, t: Task): Set<number> {
  const done = new Set<number>(t.stepsDone ?? []);
  if (t.kind === "learn") {
    const b = [...s.learning.briefs].reverse().find((x) => x.competency === t.competency);
    if (b?.read === true) done.add(0);
  }
  return done;
}

function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 640px)");
    const f = () => setNarrow(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return narrow;
}

type Step ={ kind: "task"; t: Task } | { kind: "micro"; t: Task; i: number } | { kind: "reflect" };
type TimeChoice = "hour" | "half" | "quarter";
const TIME_LINE: Record<TimeChoice, string> = {
  hour: "Two tasks and one line about how it went. About an hour.",
  half: "One task and one line about how it went. About 30 minutes.",
  quarter: "One step and one line about how it went. About 15 minutes.",
};

/**
 * True on the blank state an onboarding reset leaves (or before any onboarding): onboarding is not complete, the rubric is the
 * generic placeholder or every rating is a placeholder, and there is nothing planned and no evidence. Live data is never this.
 */
function isBlankSkeleton(s: GrowthState): boolean {
  if ((s.onboarding?.status ?? "not_started") === "complete") return false;
  const rs = Object.values(s.skills?.ratings ?? {});
  const placeholder = s.rubric?.generic === true || (rs.length > 0 && rs.every((r) => r.placeholder === true));
  return placeholder && (s.week?.tasks ?? []).length === 0 && (s.evidence?.entries ?? []).length === 0;
}

/** A calm "Not started" page: the page's own head, one quiet T1, one line and the command to copy. Nothing to fill in, nothing at zero. */
function NotStarted({ icon, title, heading, label }: { icon: React.ReactNode; title: string; heading: string; label: string }) {
  return (
    <div className="world">
      <PageHead icon={icon} title={title} label />
      <Hero quiet icon={<Compass size={16} />} eyebrow="Not started" title={heading} label={label}>
        <p className="att-why">Say growth start in Claude Code and this fills in from your answers.</p>
        <p className="att-note"><CmdChip text="growth start" label="Copy: growth start" /></p>
      </Hero>
    </div>
  );
}

export function Today(p: React.ComponentProps<typeof TodayFull>) {
  return isBlankSkeleton(p.s) ? <NotStarted icon={<Face mood="resting" size={32} label="The person, resting" />} title="Tonight" heading="Nothing here yet" label="Nothing here yet" /> : <TodayFull {...p} />;
}

function TodayFull({ s, act, busy, open, go, attn, onAct, force }: { s: GrowthState; act: ActFn; busy: boolean; open: OpenFn; go: (v: View) => void; attn: AttentionItem[]; onAct: (i: AttentionItem) => void; /** Dev fixtures only: pretend it is Sunday or the week has ended. */ force?: { sunday?: boolean; weekEnded?: boolean } }) {
  const today = localToday();
  const isSunday = force?.sunday ?? new Date().getDay() === 0;
  const weekEnded = force?.weekEnded ?? today > addDays(s.week.week_of, 6);
  const pending = s.queue.items.filter((q) => q.status === "pending");
  const pair = tonight(s);
  const reflected = s.evidence.entries.some((e) => e.tag === "tonight" && e.date === today);
  const [pick, setPick] = useState<number | null>(null);
  const narrow = useNarrow();
  const timeKey = `growth.time.${today}`;
  const [time, setTimeState] = useState<TimeChoice>("hour");
  useEffect(() => { const v = store.get(timeKey); if (v === "half" || v === "quarter" || v === "hour") setTimeState(v); }, [timeKey]);
  const setTime = (v: TimeChoice) => { setPick(null); setTimeState(v); store.set(timeKey, v); if (v === "hour") { store.set(keepKey, ""); setKeepId(null); } };
  // A smaller night is still a real night: 30 minutes is one task, 15 minutes is one step of it.
  // Which task: the one the person picked, else the track he didn't work last time, so both tracks keep moving.
  const keepKey = `growth.keep.${today}`;
  const [keepId, setKeepId] = useState<string | null>(null);
  useEffect(() => { setKeepId(store.get(keepKey)); }, [keepKey]);
  const todo = pair.filter((x) => !isClosed(x));
  const lastTrack = [...s.week.tasks].filter((x) => isClosed(x) && x.closed).sort((a, b) => (b.closed ?? "").localeCompare(a.closed ?? ""))[0]?.track;
  const firstTodo = todo.find((x) => x.id === keepId) ?? todo.find((x) => x.track !== lastTrack) ?? todo[0];
  const swapTo = (id: string) => { setPick(null); setKeepId(id); store.set(keepKey, id); store.set(`growth.micro.${today}`, ""); setTimeout(() => (document.querySelector(".att-1 .att-title") as HTMLElement | null)?.focus(), 30); };
  const microKey = `growth.micro.${today}`;
  const micro = (() => {
    if (time !== "quarter" || !firstTodo) return null;
    const saved = store.get(microKey)?.split(":");
    const si = saved ? Number(saved[1]) : NaN;
    if (saved && saved[0] === firstTodo.id && Number.isInteger(si) && si >= 0 && si < firstTodo.steps.length) return { t: firstTodo, i: si };
    const dn = doneSteps(s, firstTodo);
    const i = firstTodo.steps.findIndex((_, k) => !dn.has(k));
    return i >= 0 ? { t: firstTodo, i } : null;
  })();
  useEffect(() => { if (micro) store.set(microKey, `${micro.t.id}:${micro.i}`); }, [micro?.t.id, micro?.i, microKey]);
  const closedTonight = pair.filter(isClosed);
  const planned: Task[] = time === "hour" ? pair : time === "half" ? (closedTonight.length ? closedTonight.slice(0, 1) : firstTodo ? [firstTodo] : []) : [];
  const later = time === "hour" ? [] : pair.filter((x) => !isClosed(x) && !planned.includes(x) && x !== micro?.t);
  const steps: Step[] = [
    ...(time === "quarter" ? (micro ? [{ kind: "micro", t: micro.t, i: micro.i } as Step] : closedTonight.slice(0, 1).map((x) => ({ kind: "task", t: x }) as Step)) : planned.map((x) => ({ kind: "task", t: x }) as Step)),
    { kind: "reflect" },
  ];
  const isDoneStep = (st: Step) => (st.kind === "task" ? isClosed(st.t) : st.kind === "micro" ? isClosed(st.t) || doneSteps(s, st.t).has(st.i) : reflected);
  const firstOpen = steps.findIndex((st) => !isDoneStep(st));
  const active = pick !== null && pick < steps.length && !isDoneStep(steps[pick]) ? pick : firstOpen;
  // When the person picks a step, keyboard focus follows it to the card.
  useEffect(() => { if (pick !== null) setTimeout(() => (document.querySelector(".att-1 .att-title") as HTMLElement | null)?.focus(), 30); }, [pick]);
  const allDone = firstOpen === -1;
  const doneCount = steps.filter(isDoneStep).length;
  const next = steps[firstOpen];
  const showSteps = !weekEnded && !isSunday;
  const nothingPlanned = showSteps && !pair.length && !allDone;
  // One current step is the hero; the rest wait in one "Then" card; finished ones are quiet rows.
  const thenIdx = steps.map((_, i) => i).filter((i) => i !== active && !isDoneStep(steps[i]));
  const doneIdx = steps.map((_, i) => i).filter((i) => isDoneStep(steps[i]));
  const tomorrow = allDone ? s.week.tasks.filter((x) => !isClosed(x) && !pair.includes(x) && x.status !== "later").sort((a, b) => (a.day ? DAYS.indexOf(a.day) : 99) - (b.day ? DAYS.indexOf(b.day) : 99))[0] : undefined;

  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    const awayKey = `growth.away.${today}`;
    const last = store.get("growth.lastvisit");
    if (last && last < today && daysSince(last) >= 3) {
      if (!store.get(`growth.time.${today}`)) { setTimeState("quarter"); store.set(`growth.time.${today}`, "quarter"); }
      store.set(awayKey, "1");
    }
    if (store.get(awayKey) === "1") setWelcome(true);
    store.set("growth.lastvisit", today);
  }, [today]);
  let mood: Mood = "focused";
  let line = TIME_LINE[time];
  if (weekEnded) { mood = "thinking"; line = "This week's plan has ended. A short review gets you next week's."; }
  else if (isSunday) { mood = "resting"; line = "Sunday. Look back at your week, then rest."; }
  else if (allDone) { mood = "proud"; line = "Done for tonight. Rest well."; }
  else if (!pair.length) { mood = "resting"; line = "Nothing planned tonight. Sunday review adds the next tasks."; }
  else if (welcome && time === "quarter" && doneCount === 0) { mood = "curious"; line = `Welcome back. Your tasks are still here. Tonight is set to one 15-minute step; change it if you like.`; }
  else if (doneCount > 0) { mood = "curious"; line = next?.kind === "reflect" ? (time === "hour" ? "Both tasks done. One line about how it went, and you're finished." : "That's tonight's work done. One line about how it went, and you're finished.") : `${doneCount === 1 ? "One down" : "Nearly there"}. Next: ${next?.kind === "task" ? next.t.task : ""}.`; }

  return (
    <div className="world">
      <PageHead icon={<Face mood={mood} size={32} label={`The person, ${mood}`} />} title="Tonight" help="today" sub={allDone || nothingPlanned || isSunday || weekEnded ? undefined : line} subClass="say tonight-head" label />
      {weekEnded ? (
        <Hero cmds={asks(s, [{ ask: "Ready to plan next week?", say: "plan my week" }, { ask: "Plan out of date?", say: "plan my four weeks" }, LOST])} icon={<CalendarBlank size={16} />} eyebrow="This week has ended" title="Plan next week" act={<button className="btn btn-signal att-act" onClick={() => open({ kind: "review" })}>Review the week</button>}>
          <p className="att-why">Say how the week went. Claude reads your hand-ins and tonight lines, checks any skill with a full bar and writes next week. Anything you didn&apos;t finish carries over first.</p>
        </Hero>
      ) : isSunday ? (
        <Hero quiet cmds={asks(s, [{ ask: "Want to look back?", say: "how did my week go" }, { ask: "Plan out of date?", say: "plan my four weeks" }, { ask: "Week felt too heavy?", say: "make this week lighter" }])} icon={<CalendarBlank size={16} />} eyebrow="Sunday" title="Look back, then rest." label="Sunday" act={<button className="btn" onClick={() => open({ kind: "review" })}>See your week</button>}>
          <p className="att-why">Fifteen minutes to see your week. Claude reads what you made, checks any skill with a full bar and plans the next week.</p>
        </Hero>
      ) : nothingPlanned ? (
        <>
          <Hero quiet cmds={asks(s, [{ ask: "Want tonight planned?", say: "plan my week" }, LOST])} icon={<Moon size={16} />} eyebrow="An open evening" title="Nothing planned tonight">
            <p className="att-why">Sunday review adds the next tasks. Rest is fine.</p>
            <p className="att-note"><button className="linkbtn" onClick={() => go("journal")}>Write in your journal instead <KeyHint k="J" /></button></p>
          </Hero>
          <LibraryNudge s={s} go={go} card />
        </>
      ) : (
        <div className="att-stack" role="group" aria-label={`${doneCount} of ${steps.length} steps done`}>
          {allDone ? (
            <Hero quiet cmds={asks(s, [{ ask: "Not sure what is next?", say: "where do I stand" }, { ask: "Need a lighter week?", say: "make this week lighter" }])} icon={<Check size={16} />} eyebrow="All finished" title="Done for tonight" label="Done for tonight">
              <p className="att-why">That&apos;s real work on record. Skipping tomorrow would cost nothing.</p>
              {tomorrow && <p className="att-note">Tomorrow: {tomorrow.task}</p>}
            </Hero>
          ) : active >= 0 && (
            <StepHero key={steps[active].kind === "reflect" ? "reflect" : `${steps[active].kind}-${(steps[active] as { t: Task }).t.id}`} s={s} st={steps[active]} act={act} busy={busy} open={open}
              recall={steps[active].kind === "reflect" ? <Recall s={s} act={act} busy={busy} go={go} /> : null} />
          )}
          {!allDone && pick !== null && active === pick && firstOpen >= 0 && firstOpen !== active && (() => {
            const b = steps[firstOpen];
            const name = b.kind === "reflect" ? "your journal line" : b.kind === "micro" ? b.t.steps[b.i] : b.t.task;
            return <p className="att-back"><button type="button" className="linkbtn" onClick={() => setPick(null)}>Back to {clipWords(name, 48)}</button></p>;
          })()}
          {allDone && <TonightTrinket s={s} act={act} busy={busy} />}
          {!allDone && pair.length > 0 && (
            <div className="att-time" role="radiogroup" aria-label="How much time tonight" onKeyDown={(e) => {
              const order = ["hour", "half", "quarter"] as const;
              const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
              if (!d) return;
              e.preventDefault();
              const n = order[(order.indexOf(time as (typeof order)[number]) + d + order.length) % order.length];
              setTime(n);
              setTimeout(() => (e.currentTarget.querySelector(`[data-time="${n}"]`) as HTMLElement | null)?.focus(), 0);
            }}>
              <span className="att-time-label">Time tonight</span>
              {([["hour", "An hour"], ["half", "30 min"], ["quarter", "15 min"]] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" data-time={v} tabIndex={time === v ? 0 : -1} aria-checked={time === v} className={`att-time-opt${time === v ? " on" : ""}`} onClick={() => setTime(v)}>{l}</button>
              ))}
            </div>
          )}
          {!allDone && (thenIdx.length > 0 || later.length > 0) && (
            <section className={att(2)} aria-labelledby="then-h">
              <h2 id="then-h" className="att-2-title">{thenIdx.length ? "Then" : "Later"}</h2>
              <ul className="att-list">
                {thenIdx.map((i) => <StepRow key={steps[i].kind === "reflect" ? "reflect" : `${steps[i].kind}-${(steps[i] as { t: Task }).t.id}`} s={s} st={steps[i]} done={false} onPick={() => setPick(i)} />)}
                {later.length > 0 && (
                  <li className={`${att(3)} att-later`}>
                    <p>{later.map((x) => x.task).join(" and ")}: moves to your next evening. {later.length === 1 && <><button className="linkbtn" onClick={() => swapTo(later[0].id)}>Do this one instead</button> · </>}<button className="linkbtn" onClick={() => setTime("hour")}>I have the hour after all</button></p>
                  </li>
                )}
              </ul>
            </section>
          )}
        </div>
      )}
      <AttentionBanner items={attn} today={today} />
      {showSteps && !nothingPlanned && doneIdx.length > 0 && (
        <ul className="att-list att-done" aria-label="Done tonight">
          {doneIdx.map((i) => <StepRow key={steps[i].kind === "reflect" ? "reflect" : `${steps[i].kind}-${(steps[i] as { t: Task }).t.id}`} s={s} st={steps[i]} done onPick={() => { const st = steps[i]; if (st.kind === "task") open({ kind: "quest", id: st.t.id }); else setPick(i); }} />)}
        </ul>
      )}
      <WeekRecap s={s} />
      <WeekView s={s} open={open} heroOpens={weekEnded || isSunday} act={act} busy={busy} />
      <CommandHint context="today" ask={pending.length > 0 ? "Claude owes you answers?" : "Not sure what to do?"} phrase={pending.length > 0 ? "answer it" : "where do I stand"} />
      <p className="tonight-foot">
        {!allDone && <LibraryNudge s={s} go={go} />}
        <SetupNudge onOpen={() => go("companion")} back={cameBack(s).length} />
      </p>
      <PhoneNote hold={!(allDone || weekEnded || isSunday || !pair.length)} />
      <Shelf s={s} act={act} busy={busy} />
    </div>
  );
}

/** One quiet line: what's in the Library for this week, by where you'd use it. */
function LibraryNudge({ s, go, card }: { s: GrowthState; go: (v: View) => void; /** On a night with nothing planned: the best pick as the one T2 card. */ card?: boolean }) {
  const week = (s.library.picks ?? []).filter((p) => p.week_of === s.week.week_of && (p.status === "new" || p.status === "kept"));
  if (!week.length) return null;
  const count = Math.min(3, week.length);
  if (card) return (
    <section className={att(2)} aria-labelledby="nudge-h">
      <h2 id="nudge-h" className="att-2-title">Something to read instead</h2>
      <p className="att-2-body"><b>{week[0].title}</b>{week[0].minutes ? `, ${lengthWords(week[0].minutes)}` : ""}. {week[0].why}</p>
      <p className="att-2-body"><button className="linkbtn" onClick={() => go("library")}>See the {count === 1 ? "pick" : `${count} picks`} in the Library</button></p>
    </section>
  );
  return (
    <span className="muted lib-line ask-line">
      <BookOpen aria-hidden />
      <button className="linkbtn" onClick={() => go("library")}>Worth your time this week: {count} {count === 1 ? "pick" : "picks"} in the Library</button>
    </span>
  );
}

/** Plain-text where line for the hero's eyebrow (no icons, no tint chips inside the T1). */
const whereText = (t: Task) => (t.where === "desk" ? "At your desk" : "");

/** The current step, as the page's one T1. Micro step, task or the closing line. */
function StepHero({ s, st, act, busy, open, recall, quiet }: { s: GrowthState; st: Step; act: ActFn; busy: boolean; open: OpenFn; recall?: React.ReactNode; quiet?: boolean }) {
  const t = st.kind === "reflect" ? null : st.t;
  const [, setOpenedTick] = useState(0);
  const linkOpened = t ? store.get(`growth.opened.${t.id}`) === "1" : false;
  const markOpened = () => { if (t) { store.set(`growth.opened.${t.id}`, "1"); setOpenedTick((n) => n + 1); } };
  if (st.kind === "micro") {
    const text = st.t.steps[st.i];
    return (
            <Hero cmds={asks(s, [{ ask: "Stuck on this task?", say: `I’m stuck on ${sayName(st.t.task)}` }, { ask: "Too big for tonight?", say: "I only have 20 minutes" }, LOST])} icon={taskKindIcon(st.t)} eyebrow={[`${TRACK[st.t.track].name}, one step`, whereText(st.t)].filter(Boolean).join(" · ")} title={text}
              act={
                <>
                {(() => {
                  const b = st.t.kind === "learn" ? [...s.learning.briefs].reverse().find((x) => x.competency === st.t.competency) : undefined;
                  const needsResource = (b && !b.read) || (!b && !!st.t.link && st.i === 0 && !linkOpened);
                  const resource = b ? <button key="resource" className={`btn${needsResource ? " btn-signal" : " brief-ghost"}`} onClick={() => open({ kind: "brief", id: b.id, task: st.t.id })}><BookOpen /> Open the brief</button> : st.t.link ? <a key="resource" className={`btn${needsResource ? " btn-signal" : ""}`} href={st.t.link.href} target="_blank" rel="noreferrer" onClick={markOpened}><FileText /> {st.t.link.label}</a> : null;
                  const doneBtn = <button key="done" className={`btn${needsResource ? "" : " btn-signal"}`} disabled={busy} onClick={() => act({ type: "task.step", id: st.t.id, step: st.i }, "Step done. That's a real evening.", { type: "task.step", id: st.t.id, step: st.i })}><Check /> Done with this step</button>;
                  const writeBtn = b && /^write\b/i.test(text) ? <button key="write" className="btn" onClick={() => open({ kind: "brief", id: b.id, task: st.t.id, jump: true })}><Upload /> Write them in the brief</button> : null;
                  return needsResource ? [resource, doneBtn, writeBtn] : [doneBtn, resource, writeBtn];
                })()}
                <button className="linkbtn" onClick={() => open({ kind: "quest", id: st.t.id })}>See the whole task</button>
                </>
              }>
              <p className="att-why">Step {st.i + 1} of {st.t.steps.length} in “{st.t.task}”. The rest moves to your next evening.</p>
              {st.t.kind === "learn" && (() => { const b = [...s.learning.briefs].reverse().find((x) => x.competency === st.t.competency); const need = b && !b.read; return b && !need ? <button type="button" className="brief-link" onClick={() => open({ kind: "brief", id: b.id, task: st.t.id })}>Open the brief</button> : null; })()}
              {carried(st.t) && !quiet && <p className="att-note"><RotateCcw aria-hidden /> Carried over. Picking it up now costs nothing.</p>}
            </Hero>
    );
  }
  if (!t) return <ReflectStep s={s} act={act} busy={busy} recall={recall} />;
  return <TaskStep s={s} t={t} act={act} busy={busy} open={open} quiet={quiet} />;
}

/** A step that is not the current one: one quiet row (T3). Tap it to make it the current step, or to open a finished task. */
function StepRow({ s, st, done, onPick }: { s: GrowthState; st: Step; done: boolean; onPick: () => void }) {
  const t = st.kind === "reflect" ? null : st.t;
  const title = st.kind === "micro" ? st.t.steps[st.i] : t ? t.task : "One line about how tonight went";
  const mins = st.kind === "micro" ? null : t ? t.minutes : 2;
  const sub = done
    ? (st.kind === "micro" ? `Step ${st.i + 1} in “${st.t.task}”, done` : t ? (movedText(s, t) || "Saved to your log") : "Saved to your journal")
    : (st.kind === "micro" ? `One step of ${st.t.task}` : `${t ? TRACK[t.track].name : "Journal"}, ${mins} min`) + (t && whereText(t) ? ` · ${whereText(t)}` : "");
  return (
    <li className={att(3)}>
      <button className="step-row" onClick={onPick}>
        <span className="step-row-text">
          <span className="step-title">{done && <Check aria-hidden weight="bold" />}{title}</span>
          <span className={done ? "step-moved" : "step-kind"}>{sub}{done && t && st.kind !== "micro" && <> <ReviewFlag s={s} t={t} /></>}</span>
        </span>
        <span className="step-meta">{done ? "Done" : "Switch to this"} <ChevronRight aria-hidden /></span>
      </button>
    </li>
  );
}

function TaskStep({ s, t, act, busy, open, quiet }: { s: GrowthState; t: Task; act: ActFn; busy: boolean; open: OpenFn; quiet?: boolean }) {
  const T = TRACK[t.track];
  const from = carried(t);
  const seenNow = useSeen(t.id);
  const { primary, after, briefLink } = questActions(s, t, act, busy, open, true, seenNow);
  return (
    <Hero cmds={asks(s, [{ ask: "Stuck on this task?", say: `I’m stuck on ${sayName(t.task)}` }, { ask: "Too big for tonight?", say: "I only have 20 minutes" }, LOST])} icon={taskKindIcon(t)} eyebrow={[T.name, lengthWords(t.minutes), whereText(t)].filter(Boolean).join(" · ")} title={t.task}
      act={
        <>
          {primary}
          {after}
          <button className="linkbtn" onClick={() => { markSeen(t.id); open({ kind: "quest", id: t.id }); }}><span className="lbl-one">Steps and details</span></button>
        </>
      }
      foot={<><EffectBlock s={s} t={t} compact />{from && !quiet && <span className="att-note">Carried over. Picking it up now costs nothing.</span>}</>}>
      <p className="att-why">{t.why}</p>
      <div className="brief-links">{briefLink}<button type="button" className="brief-link" onClick={() => { markSeen(t.id); open({ kind: "quest", id: t.id }); }}>Steps and details</button></div>
    </Hero>
  );
}

const PROMPTS = ["What surprised you?", "What was harder than expected?", "What would you do differently?"];

function ReflectStep({ s, act, busy, recall }: { s: GrowthState; act: ActFn; busy: boolean; recall?: React.ReactNode }) {
  const [text, setText, clear] = useDraft("tonight.reflect", "");
  const [adding, setAdding] = useState(false);
  return (
    <Hero cmds={asks(s, [{ ask: "Want your journal read?", say: PAGE_COMMAND.journal.say }, LOST])} icon={<Notebook size={16} />} eyebrow="Journal · 2 min" title={adding ? "Add to what you wrote" : "How did tonight go?"}
      act={!adding ? <button className="btn btn-signal att-act" disabled={!text.trim() || busy} onClick={async () => { const said = text; if (await act({ type: "log", kind: "note", text, tag: "tonight" }, "Saved to your journal", { type: "log.undo", text: said })) clear(); }}><Check /> Save to journal</button> : undefined}>
      <p className="att-why">{adding ? "Your addition goes into your journal next to the old note. Then one line about tonight, and you're finished." : "One line is enough. It goes into your journal, and Sunday review reads it."}</p>
      <div className="att-inset">
        {recall && <div data-recall-slot><RecallSlot onAdding={setAdding}>{recall}</RecallSlot></div>}
        {!adding && <>
        {!recall && <div className="prompts" aria-label="Ideas to start from">
          {PROMPTS.map((p) => <button key={p} type="button" className="prompt" onClick={() => setText(text.trim() ? `${text.trim()} ${p} ` : `${p} `)}>{p}</button>)}
        </div>}
        <label className="sr" htmlFor="reflect-text">How did tonight go?</label>
        <textarea id="reflect-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened, what surprised you, what you'd change." />
        </>}
      </div>
    </Hero>
  );
}

/** The week you're building: what each night held, what got done, and the Sunday review. */
function WeekView({ s, open, heroOpens, act, busy }: { s: GrowthState; open: OpenFn; /** The hero's own action already opens the week, so this section does not repeat it. */ heroOpens?: boolean; act?: ActFn; busy?: boolean }) {
  const w = useWeek(s);
  const listedTasks = s.week.tasks.filter((t) => !!t.day && DAYS.includes(t.day));
  const done = listedTasks.filter(isClosed).length;
  const tonightIds = tonight(s).map((t) => t.id);
  const [weekOpen, setWeekOpen] = useState(false);
  useEffect(() => { setWeekOpen(store.get("growth.week.open") === "1"); }, []);
  const firstTonight = tonight(s).find((t) => t.status === "todo");
  const co = carriedOver(s.week.tasks, w.todayIdx, tonightIds);
  const behind = co.all.length;
  const planOpen = [0, 6].includes(new Date().getDay()) || localToday() > addDays(s.week.week_of, 6);
  const behindTonight = co.onPath.length;
  const carriedFrom = firstTonight?.day && w.todayIdx > DAYS.indexOf(firstTonight.day) ? firstTonight.day : null;
  return (
    <section className="week" aria-labelledby="week-h">
      <div className="week-head">
        <div>
          <h2 id="week-h">This week</h2>
          <p className="muted">{cap(s.week.focus_short ?? s.week.focus)}. {done === 0 ? (listedTasks.length === 0 ? "Nothing planned this week." : `${listedTasks.length} ${listedTasks.length === 1 ? "task" : "tasks"} this week.`) :`${done} of ${listedTasks.length} tasks done.`}{behind > 0 ? ` ${behind} carried over${behindTonight > 0 ? `: ${behindTonight} on tonight's path${behind > behindTonight ? `, ${behind - behindTonight} more from earlier days` : ""}` : ""}. Dates change only at Sunday review.` : ""}</p>
        </div>
        {!heroOpens && <button className="btn btn-sm" onClick={() => open({ kind: "review" })}><CalendarCheck /> Your week</button>}
      </div>
      {act && behind >= 3 && (
        <p className="week-bulk"><button type="button" className="linkbtn" disabled={busy} onClick={async () => {
          const ids = co.all.map((t) => t.id);
          for (let i = 0; i < ids.length; i++) {
            const last = i === ids.length - 1;
            const okk = await act({ type: "task.later", id: ids[i] }, last ? `Saved ${ids.length} carried tasks for later.` : undefined, last ? ids.map((id) => ({ type: "task.reopen" as const, id })) : undefined);
            if (!okk) break;
          }
        }}>Save all {behind} carried tasks for later</button></p>
      )}
      <details className="toggle week-fold" open={weekOpen} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; setWeekOpen(o); store.set("growth.week.open", o ? "1" : "0"); }}>
        <summary><ChevronRight className="chev" aria-hidden /> <span><b>{weekOpen ? "Hide the days" : "See every day"}</b></span></summary>
      <ol className="week-days">
        {DAYS.map((d, i) => {
          const tasks = s.week.tasks.filter((t) => t.day === d);
          const date = Number(w.dates[i].slice(8));
          return (
            <li key={d} className={`day${w.lit[i] ? " lit" : ""}${i === w.todayIdx ? " today" : ""}${w.todayIdx > i ? " past" : ""}${tasks.some((t) => tonightIds.includes(t.id)) ? " has-tonight" : ""}`} aria-label={`${FULL_DAY[d]}${i === w.todayIdx ? ", today" : ""}${w.lit[i] ? ", worked" : ""}`}>
              <span className="day-top"><span className="day-name">{d}</span><span className="day-date">{date}</span>{i === w.todayIdx && <span className="day-today">{WHEN.today}</span>}{i < w.todayIdx && tasks.some((t) => !isClosed(t) && t.status !== "later") && <span className="day-today">{WHEN.carried}</span>}<span className="day-mark" aria-hidden>{w.lit[i] ? <Check weight="bold" /> : null}</span></span>
              <ul className="day-tasks">
                {tasks.map((t) => {
                  const isTonight = tonightIds.includes(t.id);
                  return (
                    <li key={t.id} className={`${isClosed(t) ? "done " : ""}t-${t.track}`}>
                      <button className="day-task" onClick={() => open({ kind: "quest", id: t.id })}>
                        <span className="day-task-name">{nb(t.task)}</span>
                        {isClosed(t) && (reviewOf(s, t) ? <ReviewFlag s={s} t={t} /> : <span className="day-flag done"><Check aria-hidden /> Done</span>)}
                        {t.status === "later" && !isClosed(t) && <span className="day-flag">{WHEN.later}</span>}
                      </button>
                    </li>
                  );
                })}
                {i === w.todayIdx && carriedFrom && <li className="day-note">Tonight starts with what carried over.</li>}
              </ul>
            </li>
          );
        })}
        <li className="day sunday">
          <span className="day-top"><span className="day-name">Sun</span><span className="day-date">{Number(addDays(w.start, 6).slice(8))}</span></span>
          <ul className="day-tasks"><li><button className="day-task" onClick={() => open({ kind: "review" })}><span className="day-task-name">Look back at the week and plan the next one</span>{!planOpen && <span className="muted day-task-sub"> Opens Saturday</span>}</button></li></ul>
        </li>
      </ol>
      </details>
    </section>
  );
}

/** Tasks you saved for later. They cost nothing and wait here. */
function Shelf({ s, act, busy }: { s: GrowthState; act: ActFn; busy: boolean }) {
  const later = s.week.tasks.filter((t) => t.status === "later");
  if (!later.length) return null;
  return (
    <details className="shelf toggle">
      <summary><ChevronRight className="chev" aria-hidden /> <h2 id="shelf-h">Saved for later <span className="muted">{later.length}</span></h2></summary>
      <p className="muted">Bring one back any night, or Sunday review picks them up.</p>
      <ul>
        {later.map((t, i) => {
          const I = TRACK[t.track].Icon;
          return (
            <li key={t.id} className="shelf-card park-in" style={{ ["--i" as string]: i }}>
              <span className="shelf-icon" aria-hidden><I /></span>
              <span className="shelf-text"><b>{t.task}</b><span className="muted">{TRACK[t.track].name}, {lengthWords(t.minutes)}</span></span>
              <button className="btn btn-sm" disabled={busy} onClick={() => act({ type: "task.reopen", id: t.id }, "Back on tonight's path")}><RotateCcw /> Bring back</button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/* ================= first run ================= */

function Intro({ s, onStart, onSkip }: { s: GrowthState; onStart: () => void; onSkip: () => void }) {
  const [step, setStep] = useState(0);
  const rs = ratings(s);
  const first = tonight(s).find((t) => t.status === "todo");
  const steps: { mood: Mood; title: string; body: React.ReactNode }[] = [
    { mood: "curious", title: "Hi the person. This is your evening plan.", body: <>
      <p>Each night: one skill task, one hiring task, one line about how it went. Hand in what you make, then say &ldquo;answer it&rdquo; in Claude Code to hear what to change. Skipping a night costs nothing.</p>
    </> },
    { mood: "thinking", title: "Here's where you stand today.", body: <>
      <ul className="intro-scores">{rs.map((r) => <li key={r.key}><b>{r.score}</b><span>{r.name}</span><span className={`word w-${r.word.toLowerCase()}`}>{r.word}</span></li>)}</ul>
      <p>Honest starting points, out of 100. 70 is lead-ready. They move when your work is checked, not by how you feel.</p>
    </> },
    { mood: "focused", title: "Tonight starts here.", body: <><p>{first ? <>First: <b>{first.task}</b>. {lengthWords(first.minutes).replace(/^about /, "About ").replace(/^(\d)/, "About $1")}. Everything you need is one tap away.</> : "Nothing is planned tonight. Sunday review adds the next tasks."}</p></> },
  ];
  const st = steps[step];
  const introFirst = useRef(true);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    // Keep focus on the step heading so it never drops to the page when Back disappears.
    if (introFirst.current) { introFirst.current = false; return; }
    document.getElementById("intro-h")?.focus({ preventScroll: true });
  }, [step]);
  return (
    <section className="intro" aria-labelledby="intro-h">
      <Face mood={st.mood} size={112} />
      <ol className="intro-dots" aria-label={`Step ${step + 1} of ${steps.length}`}>{steps.map((_, i) => <li key={i} className={i === step ? "on" : i < step ? "done" : ""} />)}</ol>
      <h1 id="intro-h" tabIndex={-1}>{st.title}</h1>
      <div className="intro-body">{st.body}</div>
      <div className="intro-actions">
        {step < steps.length - 1
          ? <button className="btn btn-signal btn-lg" onClick={() => setStep(step + 1)}>Next <ArrowRight /></button>
          : <button className="btn btn-signal btn-lg" onClick={onStart}>Start tonight <ArrowRight /></button>}
        {step > 0 && <button className="btn btn-quiet" onClick={() => setStep(step - 1)}>Back</button>}
        {step < steps.length - 1 && <button className="linkbtn" onClick={onSkip}>Skip</button>}
      </div>
    </section>
  );
}

/* ================= the task, inside its side peek ================= */

/** The action that starts a task, and the one that finishes it, wherever the task is shown. */
/** Has this task been looked at in this browser session? Kept in the tab, never in the person's data. */
const seenKey = (id: string) => `growth.seen.${id}`;
const wasSeen = (id: string) => { try { return sessionStorage.getItem(seenKey(id)) === "1"; } catch { return false; } };
const markSeen = (id: string) => { try { sessionStorage.setItem(seenKey(id), "1"); window.dispatchEvent(new Event("growth-seen")); } catch {} };
/** Read after mount (never during server render), and again whenever a task is marked seen. */
function useSeen(id: string) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const read = () => setSeen(wasSeen(id));
    read();
    window.addEventListener("growth-seen", read);
    return () => window.removeEventListener("growth-seen", read);
  }, [id]);
  return seen;
}

function questActions(s: GrowthState, t: Task, act: ActFn, busy: boolean, open: OpenFn, gate = false, seenNow = false) {
  const brief = [...s.learning.briefs].reverse().find((b) => b.competency === t.competency);
  const test = s.tests.tests.find((x) => x.competency === t.competency && x.status === "ready");
  const waiting = (k: "research" | "test") => s.queue.items.some((q) => q.status === "pending" && q.type === k && q.competency === t.competency);
  let primary: React.ReactNode = null;
  let after: React.ReactNode = null;
  let briefLink: React.ReactNode = null;
  if (t.kind === "learn") {
    const read = doneSteps(s, t).has(0);
    if (brief) {
      const handIn = (cls: string) => <button className={cls} onClick={() => { markSeen(t.id); open({ kind: "brief", id: brief.id, task: t.id, jump: true }); }}><Upload /> Hand it in <KeyHint k="H" /></button>;
      const openIt = (cls: string) => <button className={cls} onClick={() => { markSeen(t.id); open({ kind: "brief", id: brief.id, task: t.id }); }}><BookOpen /> Open the brief</button>;
      // A brief that is already read (it is in your data) starts in "Hand it in" on any device and session. The session flag only
      // covers "opened this session but not marked read", so a new session or device never reverts the primary.
      if (read || (gate && seenNow)) { primary = handIn("btn btn-signal"); after = openIt("btn brief-ghost"); briefLink = <button type="button" className="brief-link" onClick={() => { markSeen(t.id); open({ kind: "brief", id: brief.id, task: t.id }); }}>Open the brief</button>; }
      else { primary = openIt("btn btn-signal"); after = handIn("btn"); }
    } else primary = waiting("research") ? <p className="muted">Claude is writing the brief. It appears here <NextRun />.</p>
      : <div className="act-cmd"><span className="muted">To get the brief, type this in Claude Code:</span><CmdChip text={`growth learn ${skillShort(s, t.competency).toLowerCase()}`} /></div>;
  } else if (t.kind === "test") {
    primary = test
      ? <button className="btn btn-signal" onClick={() => open({ kind: "test", id: test.id })}><ClipboardCheck /> Start the test</button>
      : waiting("test") ? <p className="muted">Claude is writing the test. It appears here <NextRun />.</p>
      : <div className="act-cmd"><span className="muted">To get a test, type this in Claude Code:</span><CmdChip text={`growth test ${skillShort(s, t.competency).toLowerCase()}`} /></div>;
  } else if (t.link) {
    primary = <a className="btn btn-signal" href={t.link.href} target="_blank" rel="noreferrer"><FileText /> {t.link.label}</a>;
    after = <button className="btn" onClick={() => open({ kind: "handin", id: t.id })}><Upload /> Hand it in</button>;
  } else if (t.kind === "ask") {
    primary = <button className="btn btn-signal" disabled={busy} onClick={() => act({ type: "task.done", id: t.id }, `Done. ${cap(t.adds)}.`, t.id)}><Send /> I sent it</button>;
  } else if (gate && !seenNow) {
    // Tonight's card: the task has not been opened yet, so the first thing is to look at it. Handing in is the quiet second action.
    primary = <button className="btn btn-signal" aria-label={`Start: ${t.task}`} onClick={() => { markSeen(t.id); open({ kind: "quest", id: t.id }); }}><BookOpen /> Start this task <KeyHint k="O" /></button>;
    after = <button className="linkbtn" onClick={() => { markSeen(t.id); open({ kind: "handin", id: t.id }); }}>Hand it in <KeyHint k="H" /></button>;
  } else {
    primary = <button className="btn btn-signal" onClick={() => open({ kind: "handin", id: t.id })}><Upload /> Hand it in <KeyHint k="H" /></button>;
  }
  return { primary, after, briefLink };
}

/** What finishing a task moves, end to end: the bar it fills, Sunday's check, the number it lifts. */
function Chain({ s, t }: { s: GrowthState; t: Task }) {
  const c = chainOf(s, t);
  const later = c.kind === "skill" && c.xpFrom + aheadPoints(s, t) + t.points < XP_PER_LEVEL;
  return (
    <section className="chain" aria-label="What finishing this moves">
      <p className="chain-head"><span className="muted">What finishing this moves</span></p>
      <ol className="chain-steps">
        {c.kind === "skill" && <>
          <li className="cnode"><span className="node-label">{skillShort(s, t.competency) || c.stat}, toward Sunday review{aheadPoints(s, t) > 0 ? ", once earlier tasks are done" : ""}</span><b>{(() => { const ah = aheadPoints(s, t); const f = Math.min(1, (c.xpFrom + ah) / XP_PER_LEVEL); return f >= 1 ? "Already full" : <>{pct(f)}<Arr />{pct(Math.min(1, (c.xpFrom + ah + t.points) / XP_PER_LEVEL))}</>; })()}</b></li>
          <li className={`cnode${later ? " later" : ""}`}><span className="node-label">{later ? "Once this is full, if Sunday review confirms it" : "If Sunday review confirms it"}</span><b>{c.levelFrom}<Arr />{c.levelTo}</b></li>
          {c.ratings.map((r) => <li key={r.key} className={`cnode${later ? " later" : ""}`}><span className="node-label">Then {r.name}</span><b>{r.from}<Arr />{r.to}</b></li>)}
        </>}
        {c.kind === "proof" && <>
          <li className="cnode"><span className="node-label">{c.proof}</span><b>{c.step >= c.steps ? "Done when you finish this" : `Step ${c.step} of ${c.steps}`}</b></li>
          {c.interviewTo > c.interviewFrom && <li className="cnode"><span className="node-label">Interview readiness</span><b>{c.interviewFrom}<Arr />{c.interviewTo}</b></li>}
          {c.unlocks && <li className="cnode"><span className="node-label">Then you can start</span><b>{c.unlocks}</b></li>}
        </>}
        {c.kind === "plain" && <li className="cnode"><span className="node-label">Gives you</span><b>{cap(c.adds)}</b></li>}
      </ol>
    </section>
  );
}

/** Claude's own mark, so the coach's voice never wears the person's face. */
function ClaudeMark({ size = 32 }: { size?: number }) {
  return <span className="claude-mark" style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }} aria-hidden><Chats /></span>;
}

/** Where Claude's review of a hand-in stands, if one was asked for. */
function reviewOf(s: GrowthState, t: Task): "ready" | "waiting" | null {
  if (t.feedback) return "ready";
  return s.queue.items.some((q) => q.status === "pending" && q.type === "critique" && q.task === t.id) ? "waiting" : null;
}
function ReviewFlag({ s, t }: { s: GrowthState; t: Task }) {
  const r = reviewOf(s, t);
  if (!r) return null;
  return <span className={`review-flag${r === "ready" ? " ready" : ""}`}>{r === "ready" ? <><MessageSquare aria-hidden /> Review ready</> : <><Hourglass aria-hidden /> Queued for Claude</>}</span>;
}

/** Claude's review of a hand-in: what works, what to change first, the next move. */
function FeedbackBlock({ t, s }: { t: Task; s: GrowthState }) {
  const waiting = s.queue.items.some((q) => q.status === "pending" && q.type === "critique" && q.task === t.id);
  if (!t.feedback) {
    if (!waiting) return null;
    return <><div className="callout"><span className="callout-icon" aria-hidden><Hourglass /></span><div><h3>Queued for Claude&apos;s review</h3><p className="muted">{howToSend()} The review appears here, with what to change first.</p></div></div></>;
  }
  const f = t.feedback;
  return (
    <section className="feedback" aria-label="Claude's review">
      <div className="feedback-head"><ClaudeMark size={36} /><div><h3>Claude&apos;s review</h3><p className="muted">{fmtDate(f.date)}{f.reads_at ? `. Reads at ${f.reads_at}` : ""}</p></div></div>
      <p className="feedback-verdict">{f.verdict}</p>
      {f.working.length > 0 && <div><h4>What works</h4><ul className="feedback-list ok">{f.working.map((x, i) => <li key={i}><Check aria-hidden /> {x}</li>)}</ul></div>}
      {f.fix_first.length > 0 && <div><h4>Change first</h4><ol className="feedback-list fix">{f.fix_first.map((x, i) => <li key={i}><span aria-hidden>{i + 1}</span> {x}</li>)}</ol></div>}
      <p className="feedback-next"><ArrowRight aria-hidden /> <span><b>Next:</b> {f.next}</span></p>
    </section>
  );
}

function Quest({ s, t, act, busy, open }: { s: GrowthState; t: Task; act: ActFn; busy: boolean; open: OpenFn }) {
  const done = doneSteps(s, t);
  const isTonight = tonight(s).some((x) => x.id === t.id);
  const from = carried(t);
  const wc = t.track === "reach" ? chainOf(s, t) : null;
  const weightProof = wc && wc.kind === "proof" && wc.cvTo > wc.cvFrom ? `CV and portfolio ${wc.cvFrom} to ${wc.cvTo}` : null;
  const comp =s.rubric.competencies.find((c) => c.id === t.competency);
  const CompIcon = comp ? COMP_ICON[comp.id] ?? Brain : TRACK[t.track].Icon;
  const { primary, after } = questActions(s, t, act, busy, open);
  const closed = isClosed(t);
  const later = !closed && <button className="linkbtn" disabled={busy} onClick={() => act({ type: "task.later", id: t.id }, "Saved for later. No cost.")}>Save for later</button>;

  return (
    <article className={`quest t-${t.track}`} aria-label={t.task}>
      <dl className="props">
        <Prop icon={comp ? <Brain /> : <CompIcon />} label={comp ? "Skill" : "Track"}><span className={`tag tag-${t.track}`}>{comp ? skillShort(s, comp.id) : TRACK[t.track].name}</span></Prop>
        <Prop icon={<TrendingUp />} label="Moves">{t.track === "skill" && t.competency ? (() => { const c = chainOf(s, t); const x0 = c.kind === "skill" ? c.xpFrom : statXp(s, t.competency); const ah = aheadPoints(s, t); const f = Math.min(1, (x0 + ah) / XP_PER_LEVEL); const to = Math.min(1, (x0 + ah + t.points) / XP_PER_LEVEL); return `${pct(f)} to ${pct(to)} toward Sunday review`; })() : weightProof ?? IMPACT_WORD[t.impact ?? "medium"]}</Prop>
        {!closed && <Prop icon={from ? <RotateCcw /> : <CalendarCheck />} label="When">{taskWhen(s, t)}{from && taskWhen(s, t) === WHEN.tonight ? `, carried over from ${from}` : ""}</Prop>}
        {closed && <Prop icon={<Check />} label="Status">Done.{movedText(s, t) ? ` ${movedText(s, t)}.` : ""}</Prop>}
      </dl>

      {closed && <FeedbackBlock t={t} s={s} />}
      {!closed && <CommandHint context="task" ask="Stuck on this task?" phrase={`I’m stuck on ${sayName(t.task)}`} />}
      {!closed && !isTonight && <p className="callout plan-note"><CalendarCheck aria-hidden /> <span>{taskWhen(s, t) === "Carried over" ? "Picking it up now costs nothing." : "You can start it early, but tonight’s path comes first."}</span></p>}

      <p className="q-why"><b>Why:</b> {t.why}</p>
      {(() => {
        const mine = (s.library.picks ?? []).filter((p) => p.task === t.id && (p.status === "new" || p.status === "kept"));
        if (!mine.length) return null;
        return (
          <div className="q-pick">
            <p className="q-pick-h"><BookOpen aria-hidden /> <b>Goes with this, optional</b></p>
            <ul>{mine.map((p) => <li key={p.id}><a href={p.kind === "book" && p.try_first ? p.try_first.url : p.url} target="_blank" rel="noreferrer">{p.title}</a>{lengthText(p) ? ` (${lengthText(p)})` : ""}{p.look_for ? <span className="muted"> {p.look_for}</span> : null}</li>)}</ul>
          </div>
        );
      })()}
      {!closed && <details className="fold how-moves"><summary><ChevronRight className="chev" aria-hidden /> <span><b>How this moves</b></span></summary><Chain s={s} t={t} /></details>}

      {t.steps.length > 0 && (
        <div className="q-steps">
          <h4>How to do it <span className="muted">{done.size} of {t.steps.length}</span></h4>
          <ol className="steps" aria-label="Steps">
            {t.steps.map((step, i) => (
              <li key={i}>
                <label className={done.has(i) ? "on" : ""}>
                  <input type="checkbox" checked={done.has(i)} disabled={busy || closed} onChange={() => act({ type: "task.step", id: t.id, step: i })} />
                  <span className="tick" aria-hidden><Check /></span>
                  <span>{step}</span>
                </label>
              </li>
            ))}
          </ol>
        </div>
      )}

      {t.example && (
        <details className="q-example">
          <summary><ChevronRight className="chev" aria-hidden /> <Lightbulb aria-hidden /> See an example of a good {t.kind === "test" ? "answer" : "hand-in"}</summary>
          <div className="q-example-body">
            <pre>{t.example.split("\n").map((ln, i) => <span key={i} className={/^\s*\d+[.)]\s/.test(ln) ? "ex-line n" : "ex-line"}>{ln || " "}</span>)}</pre>
            {t.exampleWhy && <p className="q-example-why"><Check aria-hidden /> <span><b>Why it works:</b> {t.exampleWhy}</span></p>}
          </div>
        </details>
      )}

      {!closed && <div className="sheet-actions">{primary}{after}{later}</div>}
    </article>
  );
}

function betProgress(s: GrowthState, b?: Bet) {
  const ts = (b?.tasks ?? []).map((id) => s.week.tasks.find((t) => t.id === id)).filter(Boolean) as Task[];
  return { total: ts.length, done: ts.filter(isClosed).length };
}

/* ================= Journal ================= */

type JKind = "feedback" | "learned" | "application" | "shipped";
const JKINDS: { id: JKind; label: string; Icon: LucideIcon; hint: string }[] = [
  { id: "feedback", label: "Win or feedback", Icon: MessageSquare, hint: "Someone said something about your work, or reached out to you." },
  { id: "learned", label: "Learned", Icon: Lightbulb, hint: "Something you understood today, in your own words. Tie it to a gap and Claude counts it toward closing that gap." },
  { id: "application", label: "Applied to a job", Icon: Send, hint: "Where you applied, and for which role." },
  { id: "shipped", label: "Made", Icon: PenTool, hint: "Something you designed, built or shipped, at work or on the side." },
];

function entryKind(e: Evidence): { label: string; Icon: LucideIcon } {
  if (e.tag === "tonight") return { label: "Tonight", Icon: Moon };
  if (e.type === "market") return e.title.startsWith("Applied") ? { label: "Applied", Icon: Send } : { label: "Result", Icon: TrendingUp };
  if (e.type === "expert" || e.type === "self") return e.points === undefined || e.points > 0 ? { label: e.type === "expert" ? "Feedback" : "Done", Icon: MessageSquare } : { label: "Note", Icon: Notebook };
  if (e.type === "shipped") return { label: "Made", Icon: PenTool };
  if (e.type === "ai") return { label: "Claude's review", Icon: ClipboardCheck };
  return { label: "Learned", Icon: Lightbulb };
}

function weekOf(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toLocaleDateString("en-CA");
}

export function JournalView({ s, act, busy }: { s: GrowthState; act: ActFn; busy: boolean }) {
  const [kind, setKindState] = useState<JKind>("feedback");
  // The form opens once the person says what happened; until then only the kinds show.
  const [chosen, setChosen] = useState(false);
  const setKind = (k: JKind) => { setKindState(k); setChosen(true); };
  useEffect(() => {
    const onOpen = (e: Event) => { setKind(((e as CustomEvent).detail as JKind) ?? "learned"); setTimeout(() => document.getElementById("journal-text")?.focus(), 40); };
    window.addEventListener("growth-journal", onOpen);
    return () => window.removeEventListener("growth-journal", onOpen);
  }, []);
  const [text, setText, clearText] = useDraft("journal.text", "");
  const [reached, setReached] = useState(false);
  const [who, setWho] = useState<Source | null>(null);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [skill, setSkill] = useState("");
  const [link, setLink] = useState("");
  const [gap, setGap] = useState("");
  const openGaps = orderedGaps((s.library.gaps ?? []).filter((g) => g.status !== "closed"));
  const k = JKINDS.find((x) => x.id === kind)!;
  const ok = kind === "application" ? !!(company.trim() && role.trim()) : !!text.trim() && (kind !== "feedback" || reached || !!who);
  const save = async () => {
    const logKind: LogKind = kind === "feedback" ? (reached ? "win" : "feedback") : kind === "learned" ? "note" : kind;
    const body = kind === "application" ? (text.trim() || `Applied to ${role} at ${company}`) : kind === "shipped" && link.trim() ? `${text.trim()}\n${link.trim()}` : text;
    if (await act({ type: "log", kind: logKind, text: body, company, title: role, competency: skill || undefined, from: logKind === "feedback" ? who ?? undefined : undefined, gap: gap || undefined }, gap ? "Saved, and counted toward that gap." : "Saved to your journal")) {
      clearText(); setCompany(""); setRole(""); setSkill(""); setLink(""); setWho(null); setReached(false); setGap("");
    }
  };
  const dated = [...s.evidence.entries].filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const olderKey = (d: string) => {
    const years = d.match(/\d{4}/g);
    if (!years) return 0;
    const y = Number(years[years.length - 1]);
    const iso = /\d{4}-(\d{2})/.exec(d);
    const mon = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.exec(d);
    const m = iso ? Number(iso[1]) : mon ? ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(mon[1].toLowerCase()) + 1 : 0;
    return y * 100 + m;
  };
  const older = s.evidence.entries.filter((e) => !/^\d{4}-\d{2}-\d{2}$/.test(e.date)).sort((a, b) => olderKey(b.date) - olderKey(a.date));
  const thisWeek = weekOf(localToday());
  const groups = new Map<string, Evidence[]>();
  for (const e of dated) { const wk = weekOf(e.date); groups.set(wk, [...(groups.get(wk) ?? []), e]); }
  const thisList = groups.get(thisWeek) ?? [];
  const recent = [...groups.entries()].filter(([wk]) => wk !== thisWeek);
  const skillName = (id?: string) => (id ? s.rubric.competencies.find((c) => c.id === id)?.name.split(":")[0] : undefined);

  return (
    <div className="world att-journal">
      <PageHead icon={<Notebook />} title="Journal" help="journal" label sub="Wins, feedback, what you learned, where you applied, what you made. All of it counts as evidence." />
      <Hero quiet cmds={asks(s, [{ ask: "Want your journal read?", say: PAGE_COMMAND.journal.say }, { ask: "Feeling like a fraud?", say: "I feel like a fraud" }, LOST])} label="Add to your journal" icon={<PencilSimple size={16} />} eyebrow="New entry" title="What happened?"
        act={chosen ? <button className="btn btn-signal att-act" disabled={!ok || busy} onClick={save}><Check /> Save</button> : undefined}>
      <div className="att-inset">
        <div className="kind-tabs" role="tablist" aria-label="What happened" onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          const i = JKINDS.findIndex((x) => x.id === kind);
          const n = JKINDS[(i + (e.key === "ArrowRight" ? 1 : JKINDS.length - 1)) % JKINDS.length];
          setKind(n.id);
          (e.currentTarget.querySelector(`[data-kind="${n.id}"]`) as HTMLElement | null)?.focus();
        }}>
          {JKINDS.map((x) => (
            <button key={x.id} role="tab" id={`jtab-${x.id}`} aria-controls="jpanel" data-kind={x.id} aria-selected={chosen && kind === x.id} tabIndex={kind === x.id ? 0 : -1} className="kind-tab" onClick={() => setKind(x.id)}><x.Icon aria-hidden /> {x.label}</button>
          ))}
        </div>
        {chosen ? <div role="tabpanel" id="jpanel" aria-labelledby={`jtab-${kind}`} style={{ display: "contents" }}>
        <p className="composer-hint">{k.hint}</p>
        {kind === "application" ? (
          <div className="two">
            <label className="field"><span>Company</span><input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Jupiter" /></label>
            <label className="field"><span>Role</span><input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Founding Product Designer" /></label>
          </div>
        ) : null}
        <label className="field">
          <span>{kind === "feedback" ? "What did they say?" : kind === "learned" ? "What did you learn?" : kind === "application" ? "Anything to remember (optional)" : "What did you make?"}</span>
          <textarea id="journal-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={
            kind === "feedback" ? "As close to their words as you can." :
            kind === "learned" ? "In your own words, as if you were explaining it to a friend." :
            kind === "application" ? "How you applied, or who referred you." :
            "What you made, and what it does."} />
        </label>
        {kind === "feedback" && (
          <div className="field">
            <span>Who was it?</span>
            <div className="seg">
              {[{ v: "expert" as Source, l: "Senior designer or hiring manager" }, { v: "market" as Source, l: "Recruiter reached out" }, { v: "self" as Source, l: "Someone else" }].map((o) => (
                <label key={o.v}><input type="radio" name="jwho" checked={o.v === "market" ? reached : !reached && who === o.v} onChange={() => { if (o.v === "market") { setReached(true); setWho(null); } else { setReached(false); setWho(o.v); } }} /><span>{o.l}</span></label>
              ))}
            </div>
          </div>
        )}
        {kind === "shipped" && <label className="field"><span>Link (optional)</span><input type="text" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></label>}
        {(kind === "learned" || kind === "shipped") && openGaps.length > 0 && (
          <label className="field"><span>Does it help close one of your gaps? (optional)</span>
            <select value={gap} onChange={(e) => { setGap(e.target.value); const g = openGaps.find((x) => x.id === e.target.value); if (g) setSkill(g.competency); }}>
              <option value="">Not one gap</option>
              {openGaps.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </label>
        )}
        {(kind === "feedback" || ((kind === "learned" || kind === "shipped") && !gap)) && (
          <label className="field"><span>Which skill is it about? (optional)</span>
            <select value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="">Not one skill</option>
              {s.rubric.competencies.map((c) => <option key={c.id} value={c.id}>{skillShort(s, c.id)}</option>)}
            </select>
          </label>
        )}
        {!ok && <p className="finish-hint">{kind === "application" ? "Add the company and role to save." : !text.trim() ? "Write a line to save." : "Pick who it was to save."}</p>}
        </div> : <p className="composer-hint">Pick what happened, and the form for it opens.</p>}
      </div>
      </Hero>

      {dated.length === 0 && older.length === 0 ? (
        <div className="empty"><Face mood="curious" size={64} /><div><h3>Nothing here yet</h3><p className="muted">Your first entry can be small: one thing someone said about your work.</p></div></div>
      ) : (
        <section className="att-2" aria-labelledby="jw-h">
          <h2 id="jw-h" className="att-2-title">This week</h2>
          {thisList.length > 0
            ? <ul className="att-list">{thisList.map((e) => <EntryRow key={e.id} e={e} skill={skillName(e.competency)} gap={s.library.gaps?.find((g) => g.id === e.gap)?.title} />)}</ul>
            : <p className="att-2-body">Nothing yet this week. One line counts.</p>}
        </section>
      )}

      {recent.length > 0 && (
        <section className="jr-recent" aria-labelledby="jr-h">
          <h2 id="jr-h" className="jr-h">Recent weeks</h2>
          {recent.map(([wk, list]) => (
            <div key={wk} className="jr-week">
              <h3 className="jr-week-h">Week of {fmtDate(wk)}</h3>
              <ul className="att-list">{list.map((e) => <EntryRow key={e.id} e={e} skill={skillName(e.competency)} gap={s.library.gaps?.find((g) => g.id === e.gap)?.title} />)}</ul>
            </div>
          ))}
        </section>
      )}

      {older.length > 0 && (
        <details className="fold att-4">
          <summary><ChevronRight className="chev" aria-hidden /> <span>Before this app ({older.length})</span></summary>
          <ul className="att-list">{older.map((e) => <EntryRow key={e.id} e={e} skill={skillName(e.competency)} gap={s.library.gaps?.find((g) => g.id === e.gap)?.title} />)}</ul>
        </details>
      )}

      {(() => {
        const waiting = s.queue.items.filter((q) => q.status === "pending").length;
        if (!waiting) return null;
        return (
          <div className="cmd-strip">
            <span className="cmd-strip-label">{waiting === 1 ? "1 thing is queued for Claude. Say:" : `${waiting} things are queued for Claude. Say:`}</span>
            <CmdChip text="answer it" />
          </div>
        );
      })()}
    </div>
  );
}

function EntryRow({ e, skill, gap }: { e: Evidence; skill?: string; gap?: string }) {
  const k = entryKind(e);
  const d0 = (e.detail ?? "").trim();
  const head = e.title.trim().replace(/…$/, "");
  const cut = /…$/.test(e.title.trim()) && d0.startsWith(head);
  const title = cut ? d0 : e.title;
  const detail = cut || !d0 || d0 === e.title.trim() ? "" : d0.startsWith(head) ? d0.slice(head.length).replace(/^[\s.:,]+/, "") : d0;
  const detailRef = useRef<HTMLParagraphElement | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [clamped, setClamped] = useState(false);
  useEffect(() => {
    const el = detailRef.current;
    if (!el || showAll) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [detail, showAll]);
  return (
    <li className={`att-3 entry${e.type === "ai" ? " entry-review" : ""}`}>
      <div className="entry-main">
        {e.type === "ai" && <p className="entry-by"><k.Icon aria-hidden /> Claude&apos;s review</p>}
        <p className="entry-title">{nb(title)}</p>
        {detail && <p ref={detailRef} className={`entry-detail${showAll ? " is-open" : ""}`}>{withArrows(detail)}</p>}
        {detail && (clamped || showAll) && <button type="button" className="linkbtn entry-more" aria-expanded={showAll} aria-label={`${showAll ? "Show less of" : "Show all of"} ${title}`} onClick={() => setShowAll((v) => !v)}>{showAll ? "Show less" : "Show all"}</button>}
        <p className="entry-meta">{e.type === "ai" ? "" : `${k.label}, `}{fmtDate(e.date)}{skill ? `, ${skill}` : ""}</p>
        {gap && <p className="entry-gap"><Target aria-hidden /> Toward: {gap}</p>}
      </div>
    </li>
  );
}

/* ================= Ratings ================= */

/** A rating on its scale: where you are, and the lead-ready line. */
function TargetBar({ value }: { value: number }) {
  return (
    <div className="tbar">
      <div className="tbar-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={`${value} of 100. Lead-ready is ${TARGET}.`}>
        <i className="tbar-fill" style={{ transform: `scaleX(${value / 100})` }} />
        {[40, 70, 85].map((p) => <i key={p} className="tbar-tick" style={{ left: `${p}%` }} aria-hidden />)}
        <span className="tbar-target" style={{ left: `${TARGET}%` }}><span>Lead-ready {TARGET}</span></span>
      </div>
      <ol className="tbar-words" aria-hidden><li>Early</li><li>Taking shape</li><li>Solid</li><li>Strong</li></ol>
    </div>
  );
}

function RatingSheet({ s, k, onClose }: { s: GrowthState; k: RatingKey; onClose: () => void }) {
  const nextItem = k === "work" ? undefined : [...s.proof.items].sort((a, b) => a.priority - b.priority).find((x) => !isReady(x) && (x[k === "cv" ? "cv" : "interview"] ?? 0) > 0);
  const r = ratings(s).find((x) => x.key === k)!;
  const skills = k === "cv" ? [] : (RATING_SKILLS[k] as readonly string[]);
  const proofs = s.proof.items.filter((p) => (k === "cv" ? p.cv : k === "interview" ? p.interview : 0));
  const proofOf = (t: Task) => s.proof.items.find((p) => p.id === t.proof);
  const raises = s.week.tasks.filter((t) => t.status === "todo" && (
    (t.competency && skills.includes(t.competency)) || (k === "cv" && (proofOf(t)?.cv ?? 0) > 0) || (k === "interview" && (proofOf(t)?.interview ?? 0) > 0)));
  const key = k === "cv" ? "cv" : "interview";
  return (
    <Sheet title={r.name} sub={r.means} onClose={onClose}>
      <div className="rs-top">
        <p className="rs-num">{r.score}<span>of 100</span></p>
        <div className="rs-scale">
          <p><span className={`word w-${r.word.toLowerCase()}`}>{r.word}</span></p>
          <TargetBar value={r.score} />
        </div>
      </div>
      <p className="rs-next"><ArrowRight aria-hidden /> <b>{withArrows(nextRaiseText(s, k))}</b></p>
      {nextItem && !s.week.tasks.some((x) => x.proof === nextItem.id && x.status === "todo") && <p className="muted">That isn&apos;t planned this week; this week&apos;s work below comes first, and it&apos;s next after that.</p>}
      <div><h3>How it&apos;s worked out</h3><p>{withArrows(r.how)}</p></div>
      <div>
        <h3>What raises it this week</h3>
        {raises.length
          ? <ul className="checklist">{raises.map((t) => <li key={t.id}><span className="tick ro" aria-hidden><ArrowUp /></span><span>{withArrows(nb(t.task))}{t.where === "desk" && <span className="muted"> · At your desk</span>}{tonight(s).some((x) => x.id === t.id) && <span className="muted"> · tonight</span>}</span></li>)}</ul>
          : <p className="muted">Nothing this week. Sunday review adds some.</p>}
      </div>
      {skills.length > 0 && (
        <details className="toggle">
          <summary><ChevronRight className="chev" aria-hidden /> <h3>Made of these skills</h3></summary>
          <ul className="rs-list">{skills.map((id) => {
            const c = s.rubric.competencies.find((x) => x.id === id)!;
            const sr = s.skills.ratings[id];
            const I = COMP_ICON[id] ?? Brain;
            return <li key={id}><span className="rs-icon" aria-hidden><I /></span><span className="rs-name"><span>{skillShort(s, c.id)}</span><span className="muted">{ratingState(sr).label}</span></span><b>{levelWord(((sr as { level_counted?: number }).level_counted ?? sr.level))}</b></li>;
          })}</ul>
        </details>
      )}
      {proofs.length > 0 && (
        <details className="toggle">
          <summary><ChevronRight className="chev" aria-hidden /> <h3>{k === "cv" ? "Made of what recruiters look for" : "Plus finished case studies"}</h3></summary>
          <ul className="rs-list">{proofs.map((p) => (
            <li key={p.id} className={isReady(p) ? "on" : ""}><span className="rs-icon" aria-hidden>{isReady(p) ? <Check /> : p.status === "draft" ? <Hourglass /> : <Lock />}</span><span className="rs-name"><span>{withArrows(p.name)}</span><span className="muted">{gainText(p, key) || STATUS_TEXT[p.status]}</span></span><b>{gainOf(p, key).now ? `counts ${gainOf(p, key).now}` : ""}</b></li>
          ))}</ul>
        </details>
      )}
    </Sheet>
  );
}

/** The one keyboard line, used by the side panel and the How sheet so they never disagree. */
function KeysText() {
  return <><kbd>1</kbd> to <kbd>6</kbd> pages, <kbd>O</kbd> open tonight&apos;s task, <kbd>H</kbd> hand it in, <kbd>J</kbd> journal, <kbd>C</kbd> opens the Commands page.</>;
}

/* ================= Skills: a career ladder ================= */

const LADDER = ["Junior", "Mid", "Senior", "Lead"];
/** Level 1..4 sits at the centre of its column. */
const ladderX = (lvl: number) => 12.5 + ((lvl - 1) / 3) * 75;

/** Where a rating comes from, in words: who made it and when it was last checked. Missing facts say so; they are never hidden. */
function ratingProv(r: GrowthState["skills"]["ratings"][string]) {
  const st = ratingState(r);
  const m = st.date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(st.date) : null;
  const now = new Date();
  const days = m ? Math.max(0, Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(+m[1], +m[2] - 1, +m[3]).getTime()) / 86400000)) : null;
  const ago = days === null ? "" : days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  // Two owners only: "Claude's estimate" and "Confirmed by you". Backing (shipped work, a reviewer) is a detail, never a third owner.
  const who = st.label;
  const detail = [ago ? `set ${ago}` : "", st.backing].filter(Boolean).join(", ");
  return { who, owner: st.owner, dot: st.dot, aria: st.aria, date: st.date, ago, detail, sourced: !!st.date };
}

/**
 * The rationale under a skill, without the free-text claims about who owns the rating. Stored notes may say "Held as an
 * estimate until..." or "Confirmed by you"; the state is ratingState()'s alone, so those sentences are dropped and one is
 * generated from owner, label and date.
 */
function skillNote(r: GrowthState["skills"]["ratings"][string]): string {
  const kept = secondPerson(r.note ?? "").split(/(?<=[.!?])\s+/).filter((x) => x && !/held as an estimate|confirmed by you|until a test or a reviewer|claude'?s estimate|claude estimated/i.test(x)).join(" ");
  // The sheet's subtitle already says who owns the level (from ratingState). Say it here only when nothing else is left.
  const p = ratingProv(r);
  return kept || `${p.who}${p.detail ? `, ${p.detail}` : ""}.`;
}

export function SkillView(p: React.ComponentProps<typeof SkillViewFull>) {
  return isBlankSkeleton(p.s) ? <NotStarted icon={<Brain />} title="You" heading="No evidence yet" label="No evidence yet" /> : <SkillViewFull {...p} />;
}

function SkillViewFull({ s, act, busy, open, go }: { s: GrowthState; act: ActFn; busy: boolean; open: OpenFn; go: (v: View) => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const focusBet = s.bets.bets.find((b) => b.track === "skill" && b.status === "active")?.focus;
  const focus = focusBet && s.skills.ratings[focusBet] ? focusBet : undefined;
  const ch = character(s);
  const rows = s.rubric.competencies.map((c) => ({ c, r: s.skills.ratings[c.id], xp: statXp(s, c.id) }));
  // One rating source for the hero and the list: ratingProv(). "Confirmed" means it is not an estimate (a check by you, a reviewer, shipped work or a real result).
  const whoKey = (r: GrowthState["skills"]["ratings"][string]) => ratingProv(r).who;
  const summary = ratingSummary(rows.map(({ r }) => r));
  const focusName = focus ? skillShort(s, focus) : "";
  const fr = focus ? s.skills.ratings[focus] : undefined;
  const fc = focus ? s.rubric.competencies.find((c) => c.id === focus) : undefined;
  const fxp = focus ? statXp(s, focus) : 0;
  const fnext = fr ? nextLevel(fr.level) : 0;
  const tonightList = tonight(s);
  const stepIdx = focus ? tonightList.findIndex((t) => t.competency === focus && !isClosed(t)) : -1;
  const todo = focus ? s.week.tasks.find((t) => t.competency === focus && !isClosed(t)) : undefined;
  const fev = focus ? s.evidence.entries.filter((e) => e.competency === focus || fr?.evidence.includes(e.id)).reverse() : [];
  const fprov = fr ? ratingProv(fr) : undefined;
  // Other skills, most relevant first: open tasks this week, then the biggest gap to its target, then rubric order.
  const openTasks = (id: string) => s.week.tasks.filter((t) => t.competency === id && !isClosed(t)).length;
  const gapOf = (id: string) => (s.skills.ratings[id].target ?? 3) - (((s.skills.ratings[id] as { level_counted?: number }).level_counted) ?? s.skills.ratings[id].level);
  const others = rows.filter(({ c }) => c.id !== focus).sort((a, b) => (openTasks(b.c.id) > 0 ? 1 : 0) - (openTasks(a.c.id) > 0 ? 1 : 0) || gapOf(b.c.id) - gapOf(a.c.id));
  const addEvidence = <button className="btn btn-signal att-act" onClick={() => open({ kind: "log", preset: "win" })}><Plus /> Add evidence</button>;
  // Provenance once per list: the most common source is said in one line; a row says its own only when it differs.
  const whoTally = others.reduce<Record<string, number>>((m, { r }) => { const w = whoKey(r); m[w] = (m[w] ?? 0) + 1; return m; }, {});
  const domWho = Object.keys(whoTally).sort((a, b) => whoTally[b] - whoTally[a])[0] ?? "";
  const unlinked = unlinkedEntries(s);
  return (
    <div className="world att-you">
      <PageHead icon={<Brain />} title="You" help="skill" label sub={`Your level: ${ch.word} overall. You'll gain most from ${skillShort(s, bottleneck(s)).toLowerCase()}.`} />
      <p className="you-jump">Skills first, then you. <button type="button" className="linkbtn" onClick={() => { setMoreOpen(true); setTimeout(() => { const el = document.getElementById("you-words"); if (!el) return; const h = (el.querySelector("h2") as HTMLElement | null) ?? el; h.setAttribute("tabindex", "-1"); el.scrollIntoView({ block: "start" }); h.focus({ preventScroll: true }); }, 60); }}>More about you, in your own words</button></p>

      <Hero quiet={!focus} cmds={asks(s, [{ ask: "Want Claude to know you?", say: PAGE_COMMAND.you.say }, ...(focus ? [{ ask: "Skill level feel wrong?", say: `rate my ${focusName.split(" and ")[0].toLowerCase()} skill` }] : []), LOST])} label="This month's skill"
        icon={<Target size={16} />}
        eyebrow={focus ? "This month" : "Where you stand"}
        title={focus ? focusName : `Your level: ${ch.word} overall`}
        act={focus ? (
          <>
            {stepIdx >= 0
              ? <button className="btn btn-signal att-act" aria-label={`Open: ${tonightList[stepIdx].task}`} onClick={() => go("today")}><span className="act-t"><span className="lbl-one">Open: {clipWords(tonightList[stepIdx].task, 40)}</span></span> <ArrowRight /></button>
              : todo
                ? <button className="btn btn-signal att-act" onClick={() => open({ kind: "quest", id: todo.id })}>Do it early <ArrowRight /></button>
                : addEvidence}
            <button className="btn" onClick={() => open({ kind: "skill", id: focus })}>See the skill</button>
          </>
        ) : addEvidence}>
        {focus && fr ? (
          <>
            <div className="you-mini" role="img" aria-label={`${levelWord(fr.level)} now, ${levelWord(fnext)} next, on a ladder of ${LADDER.join(", ")}`}>
              <span className="you-mini-cols" aria-hidden>{LADDER.map((l) => <span key={l}>{l}</span>)}</span>
              <span className="ladder-track" aria-hidden>
                {LADDER.map((l) => <span key={l} className="lt-cell" />)}
                <i className="lt-line" style={{ left: `${ladderX(fr.level)}%`, width: `${ladderX(fnext) - ladderX(fr.level)}%` }} />
                <i className="lt-next" style={{ left: `${ladderX(fnext)}%` }} />
                <i className={`lt-dot${confirmedLevel(fr) ? "" : " hollow"}`} style={{ left: `${ladderX(fr.level)}%` }} />
              </span>
            </div>
            <p className="you-level">Now <b>{levelWord(fr.level)}</b>, {levelWord(fnext) !== levelWord(fr.level) ? <><b>{levelWord(fnext)}</b> next</> : "top of the ladder"}{fxp > 0 ? `. ${pct(fxp / XP_PER_LEVEL)} of the way to Sunday review.` : "."}</p>
            {stepIdx < 0 && !todo && <p className="you-moves">Nothing is planned for this skill yet. Evidence you add moves it, a shipped piece or a reviewer&apos;s read counts most.</p>}
          </>
        ) : (
          <p className="you-moves">No skill is set as this month&apos;s focus yet. Say <CmdChip text="plan my week" /> in Claude Code and it picks one. You can add evidence in the meantime.</p>
        )}
        <p className="you-prov">
          {fprov && fr ? <span>{fprov.who}{fprov.detail ? `, ${fprov.detail}` : ""}.</span> : null}
          <span>{summary.line}</span>
        </p>
      </Hero>

      <section className={att(2)} aria-labelledby="ladder-h">
        <h2 id="ladder-h" className="att-2-title">{focus ? "Your other skills" : "What you can do"}</h2>
        <div className="ladder">
          <ul className="ladder-rows att-list">
            {others.map(({ c, r, xp }) => {
              const Icon = COMP_ICON[c.id] ?? Brain;
              const nxt = nextLevel(r.level);
              const trained = s.week.tasks.some((t) => t.competency === c.id) || xp > 0;
              const pv = ratingProv(r);
              return (
                <li key={c.id} className="att-3">
                  <button className="ladder-row" onClick={() => open({ kind: "skill", id: c.id })} aria-label={`${skillShort(s, c.id)}: ${levelWord(r.level)}, ${pv.aria}. Next: ${levelWord(nxt)}.`}>
                    <span className="ladder-name">
                      <span className="ladder-icon" aria-hidden><Icon /></span>
                      <span className="ladder-text">
                        <span className="ladder-skill">{skillShort(s, c.id)}</span>
                        <span className="ladder-sub">{levelWord(r.level)}{levelWord(nxt) !== levelWord(r.level) ? ` to ${levelWord(nxt)}` : ""}{xp > 0 ? `, ${pct(xp / XP_PER_LEVEL)} to Sunday review` : trained && focus ? `, after ${focusName}` : ""}</span>
                        {(others.length <= 1 || whoKey(r) !== domWho) &&<span className={`you-prov-line${pv.sourced ? "" : " is-missing"}`}>{pv.who}{pv.detail ? `, ${pv.detail}` : ""}</span>}
                      </span>
                    </span>
                    <span className="ladder-track" aria-hidden>
                      {LADDER.map((l) => <span key={l} className="lt-cell" />)}
                      <i className="lt-line" style={{ left: `${ladderX(r.level)}%`, width: `${ladderX(nxt) - ladderX(r.level)}%` }} />
                      <i className="lt-next" style={{ left: `${ladderX(nxt)}%` }} />
                      <i className={`lt-dot${confirmedLevel(r) ? "" : " hollow"}`} style={{ left: `${ladderX(r.level)}%` }} />
                    </span>
                    <ChevronRight className="go" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <p className="scale-key"><span><span className="k-dot" aria-hidden /> Confirmed by you</span> <span><span className="k-dot hollow" aria-hidden /> Claude&apos;s estimate</span> <span><svg className="k-ring" viewBox="0 0 14 14" aria-hidden><circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3.3 2.3" /></svg> next level</span> <span className="k-note">A + means halfway to the next level.</span></p>
      </section>

      <details className="fold att-4 you-more" id="you-more" open={moreOpen} onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary><ChevronRight className="chev" aria-hidden /> <span><b>More about you</b><span className="muted">{focus ? `Evidence for ${focusName}, what ${levelWord(Math.ceil(fnext))} looks like, and you in your own words` : "You in your own words"}</span></span></summary>
      {focus && fc && fr && (
        <section className="you-sec" aria-labelledby="you-ev-h">
          <h2 id="you-ev-h" className="you-h">Evidence for {focusName}</h2>
          {fev.length > 0 ? (
            <ul className="att-list">
              {fev.slice(0, 3).map((e) => (
                <li key={e.id} className="att-3 you-ev">
                  <b>{e.title}</b>
                  <span className="muted">{fmtDate(e.date)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted you-none">No evidence is linked to this skill yet.{unlinked > 0 ? <> {unlinked} {unlinked === 1 ? "entry" : "entries"} in your journal {unlinked === 1 ? "is" : "are"} not linked to a skill. <button type="button" className="linkbtn" onClick={() => go("journal")}>Link {unlinked === 1 ? "it" : "them"}</button></> : " Add one when you finish something that shows it."}</p>}
          {fev.length > 3 && <p className="muted you-none">{fev.length - 3} more in the skill, under See the skill.</p>}
          <h3 className="you-h you-h-sub">{Number.isInteger(fnext) && fnext > fr.level ? `What ${levelWord(fnext)} looks like` : `What ${levelWord(Math.ceil(fnext))} looks like`}</h3>
          <p className="you-def">{fc.levels[String(Math.ceil(fnext))] ?? fc.levels[String(Math.ceil(fr.level))]}</p>
        </section>
      )}

      <div className="you-words" id="you-words">
        <PersonCard s={s} act={act} busy={busy} />
      </div>
      </details>

      <details className="fold att-4">
        <summary><ChevronRight className="chev" aria-hidden /> <span><b>All skills in detail</b></span></summary>
        <div className="you-table">
          <table>
            <thead><tr><th>Skill</th><th>Level</th><th>Owner</th><th>Set</th><th>Evidence</th></tr></thead>
            <tbody>
              {rows.map(({ c, r }) => {
                const pv = ratingProv(r);
                return <tr key={c.id}><td>{skillShort(s, c.id)}</td><td>{levelWord(r.level)}</td><td>{pv.who}</td><td>{pv.ago || "no date"}</td><td>{(() => { const n = s.evidence.entries.filter((e) => e.competency === c.id).length; return n === 0 ? "none linked" : `${n} linked`; })()}</td></tr>;
              })}
            </tbody>
          </table>
          {unlinked > 0 && <p className="muted">{unlinked} {unlinked === 1 ? "entry" : "entries"} in your journal {unlinked === 1 ? "is" : "are"} not linked to a skill. <button type="button" className="linkbtn" onClick={() => go("journal")}>Open the journal to link {unlinked === 1 ? "it" : "them"}</button></p>}
        </div>
      </details>

      <details className="fold att-4">
        <summary><ChevronRight className="chev" aria-hidden /> <span><b>How these levels are worked out</b></span></summary>
        <p className="muted you-basis">Six skills make up Doing the job; four make up Interview readiness (two count toward both). Open a skill to see its evidence and what the next level looks like. Levels are Claude&apos;s estimate until a test, a reviewer or a real result confirms them. A rating you made yourself says so.{focus && rows.some(({ c, xp }) => xp === 0 && c.id !== focus && s.week.tasks.some((t) => t.competency === c.id)) ? ` “After ${focusName}” means its tasks come once ${focusName} is done.` : ""}</p>
      </details>

      <details className="fold att-4">
        <summary><ChevronRight className="chev" aria-hidden /> <span><b>Say it in Claude Code</b></span></summary>
        {(s.profile.person?.items ?? []).some((i) => i.status === "confirmed" || i.status === "proposed")
          ? <CommandHint context="skill" ask="Skill level feel wrong?" phrase={focus ? `rate my ${focusName.split(" and ")[0].toLowerCase()} skill` : undefined} />
          : <CommandHint context="you" ask="Want Claude to know you?" />}
      </details>
    </div>
  );
}

/** One vocabulary for an open task's day: Today, Carried over (an earlier day, still open), Later this week. */
function taskWhen(s: GrowthState, t: Task) {
  let todayIdx = DAYS.indexOf(new Date().toLocaleDateString("en-GB", { weekday: "short" }) as Day);
  if (todayIdx < 0) todayIdx = DAYS.length; // Sunday: every planned day has passed
  const idx = t.day ? DAYS.indexOf(t.day) : -1;
  if (tonight(s).some((x) => x.id === t.id)) return WHEN.tonight;
  if (idx >= 0 && todayIdx > idx) return WHEN.carried;
  if (idx === todayIdx) return WHEN.today;
  return idx > todayIdx ? WHEN.later : WHEN.week;
}

function SkillSheet({ s, id, open, onClose }: { s: GrowthState; id: string; open: OpenFn; onClose: () => void }) {
  const c = s.rubric.competencies.find((x) => x.id === id)!;
  const r = s.skills.ratings[id];
  const nextLvl = nextLevel(r.level);
  const xp = statXp(s, id);
  const ev = s.evidence.entries.filter((e) => r.evidence.includes(e.id) || e.competency === id).reverse();
  const tasks = s.week.tasks.filter((t) => t.competency === id);
  const briefs = s.learning.briefs.filter((b) => b.competency === id);
  const ready = s.tests.tests.find((t) => t.competency === id && t.status === "ready");
  const affects = (["work", "interview"] as const).filter((k) => (RATING_SKILLS[k] as readonly string[]).includes(id));
  return (
    <Sheet title={skillShort(s, c.id)} sub={`${levelWord(r.level)} now. ${ratingState(r).label}${ratingState(r).backing ? `, ${ratingState(r).backing}` : ""}. Next: ${levelWord(Math.ceil(nextLvl))}.`} onClose={onClose}>
      {xp > 0 || (tasks.length > 0 && ev.length > 0) ? (
        <div className="effect">
          <p className="effect-label"><TrendingUp aria-hidden /> Toward Sunday review</p>
          <p className="effect-big">{pct(xp / XP_PER_LEVEL)}</p>
          <Bar value={xp / XP_PER_LEVEL} label={`${pct(xp / XP_PER_LEVEL)} toward Sunday review`} />
          <p className="effect-sub">{withArrows(skillNote(r))}</p>
          {affects.length > 0 && <p className="muted">Counts toward {affects.map((k) => (k === "work" ? "Doing the job" : "Interview readiness")).join(" and ")}.</p>}
        </div>
      ) : (
        <div className="effect">
          {tasks.length > 0 && <p className="effect-label"><TrendingUp aria-hidden /> Toward Sunday review</p>}
          <p>{tasks.length > 0 ? "No evidence yet. Your first step starts it." : "Nothing planned for this skill this week. Claude plans tasks when it becomes the focus."}</p>
          <p className="effect-sub">{withArrows(skillNote(r))}</p>
          {affects.length > 0 && <p className="muted">Counts toward {affects.map((k) => (k === "work" ? "Doing the job" : "Interview readiness")).join(" and ")}.</p>}
        </div>
      )}
      <div><h3>{Number.isInteger(nextLvl) ? `What ${levelWord(nextLvl)} looks like` : `Next: ${levelWord(Math.ceil(nextLvl))}. Here is what ${levelWord(Math.ceil(nextLvl))} looks like:`}</h3><p>{c.levels[String(Math.ceil(nextLvl))]}</p></div>
      {tasks.length > 0 && <div><h3>Tasks for this skill</h3><ul className="checklist">{tasks.map((t) => <li key={t.id} className={isClosed(t) ? "on" : ""}>{isClosed(t) ? <span className="tick" aria-hidden><Check /></span> : <span className="day-badge">{taskWhen(s, t)}</span>}<span>{t.task}{t.where === "desk" && <span className="muted"> · At your desk</span>}</span></li>)}</ul></div>}
      <div><h3>Evidence</h3>{ev.length ? <ul className="timeline">{ev.map((e) => { const g = e.gap ? s.library.gaps?.find((x) => x.id === e.gap) : undefined; const d0 = (e.detail ?? "").trim(); const head = e.title.trim().replace(/…$/, ""); const detail = !d0 || d0 === e.title.trim() ? "" : d0.startsWith(head) ? d0.slice(head.length).replace(/^[\s.:,]+/, "") : d0; return <li key={e.id}><span className="d">{fmtDate(e.date)}</span><span><b className="ev-title">{e.title}</b>{detail && <span className="ev-detail">{withArrows(detail)}</span>}{g &&<span className="entry-gap"><Target aria-hidden /> Toward: {g.title}</span>}</span></li>; })}</ul> : <p className="muted">No evidence yet.</p>}</div>
      {(ready || briefs.length > 0) && (
        <div className="sheet-actions">
          {ready && <p className="muted test-def">The test is a short check of this skill: 5 questions, about 10 minutes, scored by Claude when you say <CmdChip text="answer it" label="Copy: answer it (test)" />.</p>}
          {ready && <button className="btn btn-signal" onClick={() => open({ kind: "test", id: ready.id })}><ClipboardCheck /> Take the test</button>}
          {briefs.length > 0 && <button className="btn" onClick={() => open({ kind: "brief", id: briefs[briefs.length - 1].id, task: tasks.find((x) => x.kind === "learn" && x.status === "todo")?.id })}><BookOpen /> Open the brief</button>}
        </div>
      )}
    </Sheet>
  );
}

/* ================= Hiring ================= */

const STAGES: Stage[] = ["applied", "screen", "portfolio_review", "challenge", "final", "offer", "rejected"];
const stageLabel = (st: string) => st.replace("_", " ").replace(/^./, (m) => m.toUpperCase());

/** What each score measures, in one short line. The next step is not repeated here: the top of the page says it once. */
const MEASURES: Record<RatingKey, string> = {
  cv: "How ready your CV and case studies are to send.",
  interview: "How ready you are for interviews.",
  work: "How well you do the job today.",
};

export function ReachView(p: React.ComponentProps<typeof ReachViewFull>) {
  return isBlankSkeleton(p.s) ? <NotStarted icon={<Briefcase />} title="Hiring" heading="No plan yet" label="No plan yet" /> : <ReachViewFull {...p} />;
}

function ReachViewFull({ s, act, open, go, busy }: { s: GrowthState; act: ActFn; open: OpenFn; go: (v: View) => void; busy: boolean }) {
  const rs = ratings(s);
  const [how, setHow] = useState(false);
  const pace: Pace = s.profile.pace ?? "steady";
  const fc = readyBy(s, pace);
  const sorted = [...s.proof.items].sort((a, b) => a.priority - b.priority);
  const gates = sorted.filter((p) => p.priority <= 2);
  const ready = gates.filter(isReady).length;
  const next = sorted.find((p) => !isReady(p));
  const b1 = s.reach.funnel.batches.find((b) => b.id === "batch-1");
  const apps = b1?.applied ?? 0;
  const screens = b1?.screen ?? 0;
  const offers = b1?.offer ?? 0;
  const goal = s.profile.north_star;
  // An estimate older than 7 days is shown dimmed, and the caption says when it is from.
  const estNewest = fc ? [...fc.basis.estimated_dates].sort().pop() : undefined;
  const estStale = !!estNewest && daysSince(estNewest) > 7;
  const career = s.career; // optional: absent until a CV is built
  const questFor = (p: ProofItem) => s.week.tasks.find((t) => t.proof === p.id && t.status === "todo");
  const nextQuestRaw = next ? questFor(next) : undefined;
  // The next step is said ONCE: when the CV is the item, the hero button takes you to the Your CV card (which holds the command); otherwise the button names the task.
  const cs = cvState(career);
  const onCv = !!(next && gates[0] && next.id === gates[0].id);
  const cvStep = onCv ? cvStepTask(career) : null;
  const showLabel = onCv ? cvShowLabel(career) : null;
  /** Display text only: the task keeps its id and its data; when the CV is the item, its name is the CV state's step. */
  const nextQuest = nextQuestRaw && cvStep ? { ...nextQuestRaw, task: cvStep } : nextQuestRaw;
  const tKey = typeof window !== "undefined" ? store.get(`growth.time.${localToday()}`) : null;
  const kKey = typeof window !== "undefined" ? store.get(`growth.keep.${localToday()}`) : null;
  const inTonight = nextQuest && tonight(s).some((t) => t.id === nextQuest.id) && (!tKey || tKey === "hour" || kKey === nextQuest.id);
  /** The A to B gap map replaces the scores only when the person has domain data (profile.domain); otherwise the page is as it was. */
  const domainGap = domainGapOf(s);
  const road = [
    { name: "CV ready", done: isReady(gates[0]) },
    { name: "Portfolio ready", done: isReady(gates[1]) },
    { name: "20 new applications", done: apps >= 20, detail: `${apps} of 20 since the new CV`, when: !next || apps >= 20 || !fc ? undefined : (fc.status === "late" ? lateWords(fc.date) : `from ${readyDate(fc.date)}`) },
    { name: "First interview", done: screens > 0 },
    { name: "Offer", done: offers > 0 },
  ];
  const here = road.findIndex((m) => !m.done);
  // One done thing, after the three scores: the most recent thing you made, with its date.
  const madeLatest = [...s.evidence.entries].filter((e) => e.type === "shipped" && /^\d{4}-\d{2}-\d{2}$/.test(e.date)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return (
    <div className="world att-hiring">
      <PageHead icon={<Briefcase />} title="Hiring" help="reach" label sub={`${goal.role}, ${moneyOf(s, goal.salary_inr_per_month, true)}.`}
        more={<>
          {s.profile.stage && <Prop icon={<Target />} label="Claude's read">{next && !isReady(next) ? <><b>First: {next.name.split(",")[0]}. Then: {s.profile.stage.name}.</b> </> : <><b>First fix: {s.profile.stage.name}.</b> </>}{s.profile.stage.why}</Prop>}
          {goal.waypoint && <Prop icon={<Target />} label="First">{goal.waypoint.role}{goal.waypoint.salary_inr_per_month ? `, ${moneyOf(s, goal.waypoint.salary_inr_per_month, true)}` : ""}. A stepping stone you chose on the way.</Prop>}
          <Prop icon={<PenTool />} label="Your goal"><button className="linkbtn" onClick={() => open({ kind: "goal" })}>{goal.feeling && goal.feeling !== "right" ? "Revisit it" : "Change it, or say how it feels"}</button></Prop>
        </>} />

      <Hero quiet={!next} cmds={asks(s, cs === "none" ? [cvAsk(career), LOST] : [{ ask: "Want the next step?", say: LOST.say }]).slice(0, 2)} label="When you can apply"
        icon={<CalendarBlank size={16} />}
        eyebrow={!fc || !next ? "Your date" : fc.status === "late" ? "Next for hiring" : "Ready to apply around"}
        title={fc && next && fc.status === "late" ? <span>{withArrows(nextQuest ? nextQuest.task : next.name)}</span> : <span className={`hire-date${estStale ? " is-stale" : ""}`}>{!next ? (cs === "fill" ? "Almost ready to apply" : "Ready to apply") : fc ? readyDate(fc.date) : "Not dated yet"}</span>}
        act={next ? (
          showLabel
            ? <button className="btn btn-signal att-act" onClick={showCvCard}><span className="act-t"><span className="lbl-one">{showLabel}</span></span> <ArrowDown /></button>
            : nextQuest
              ? (inTonight
                ? <button className="btn btn-signal att-act" aria-label={`Open: ${nextQuest.task}`} onClick={() => open({ kind: "quest", id: nextQuest.id })}><span className="act-t"><span className="lbl-one">{fc && fc.status === "late" ? "Open this task" : `Open: ${clipWords(nextQuest.task, 40)}`}</span></span> <ArrowRight /></button>
                : <button className="btn btn-signal att-act" aria-label={`Do it early: ${nextQuest.task}`} onClick={() => open({ kind: "quest", id: nextQuest.id })}><span className="act-t"><span className="lbl-one">{fc && fc.status === "late" ? "Do it early" : `Do it early: ${clipWords(nextQuest.task, 40)}`}</span></span> <ArrowRight /></button>)
              : <button className="btn btn-signal att-act" aria-label={`Already have it? Add the link for ${next.name}`} onClick={() => open({ kind: "attach", id: next.id })}><span className="lbl-one">{`Already have it? Add the link to ${clipWords(next.name, 40)}`}</span></button>
        ) : undefined}>
        {next && fc && fc.status === "late"
          ? <>
              <p className="late-line">Late: was planned for {readyDate(fc.date)}.</p>
              <p className="late-line">Dates move at Sunday review; working on it counts. <button type="button" className="linkbtn" onClick={() => setHow(true)}>How this date is worked out</button></p>
            </>
          : next
          ? <>
              <ReadyCaption s={s} fc={fc} pace={pace} onHow={() => setHow(true)} />
            </>
          : <p className="hire-cap">{cs === "fill" ? "Your CV still has facts missing. Add them first." : "Your applications start now."}</p>}
      </Hero>

      {domainGap && domainGap.ok ? <GapMap s={s} gap={domainGap} /> : (
      <section className={att(2)} aria-labelledby="scores-h">
        <h2 id="scores-h" className="att-2-title">Where you stand</h2>
        <ul className="att-list">
          {rs.map((r) => (
            <li key={r.key} className="att-3">
              <button className="hire-score" onClick={() => open({ kind: "rating", key: r.key })} aria-label={`${r.name}: ${r.score} of 100, ${r.word}. Open what it's made of.`}>
                <span className="hire-score-name">{r.name}</span>
                <span className="hire-score-line"><span className="hire-score-num">{r.score}</span><span className={`word w-${r.word.toLowerCase()}`}>{r.word}</span><ChevronRight className="score-chev" aria-hidden /></span>
                <Bar value={r.score / 100} target={TARGET / 100} label={`${r.score} of 100`} />
                <span className="hire-score-next">{MEASURES[r.key]}{r.key === "cv" && standLine(career) ? ` ${standLine(career)}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
        {madeLatest && <p className="hire-done-line"><Check aria-hidden /> Your latest proof: you shipped {withArrows(madeLatest.title)}, {fmtDate(madeLatest.date)}</p>}
        <p className="muted att-2-body">Out of 100: under 40 is early, 40 to {TARGET - 1} taking shape, {TARGET} to 84 solid ({TARGET} is where lead roles start to look at you), 85 and up strong. Open a number to see what it&apos;s made of.</p>
      </section>
      )}
      {how && <HowDated s={s} fc={fc} pace={pace} onClose={() => setHow(false)} />}

      <CvPanel career={career} onTask={nextQuestRaw && onCv ? () => open({ kind: "quest", id: nextQuestRaw.id }) : undefined} />
      <CaseStudies career={career} />

      <details className="fold">
        <summary><ChevronRight className="chev" aria-hidden /> <span><b>Everything that raises your numbers</b><span className="muted">{sorted.length} items ({sorted.filter((p) => (p.cv ?? 0) > 0).length} count toward CV and portfolio), {sorted.filter(isReady).length} done. The first ones count most.</span></span></summary>
        <ol className="raise-list">
          {sorted.map((p, i) => (
            <li key={p.id} className={isReady(p) ? "done" : ""}>
              <span className="raise-n" aria-hidden>{isReady(p) ? <Check weight="bold" /> : i + 1}</span>
              <span className="raise-main"><b>{withArrows(p.name)}</b><span className="muted">{[gainOf(p, "cv").left ? `CV and portfolio +${gainOf(p, "cv").left}` : "", gainOf(p, "interview").left ? `Interview readiness +${gainOf(p, "interview").left}` : ""].filter(Boolean).join(" · ")}</span></span>
              <span className={`status-tag s-${!isReady(p) && questFor(p) ? "planned" : p.status}`}>{!isReady(p) && questFor(p) ? "Planned this week" : STATUS_TEXT[p.status]}</span>
              {!isReady(p) && !questFor(p) && (sorted.findIndex((x) => !isReady(x) && !questFor(x)) === i
                ? <button className="btn btn-quiet btn-sm attach-link" aria-label={`Already have it? Add the link for ${p.name}`} onClick={() => open({ kind: "attach", id: p.id })}>{`Add the link to ${clipWords(p.name, 36)}`}</button>
                : <button className="btn btn-quiet btn-sm icon-only attach-link" aria-label={`Already have it? Add the link for ${p.name}`} title={`Add the link to ${p.name}`} onClick={() => open({ kind: "attach", id: p.id })}><Paperclip aria-hidden /></button>)}
              {p.status === "done" && <button className="btn btn-quiet btn-sm" onClick={() => open({ kind: "respond", id: p.id })}>Someone read it</button>}
            </li>
          ))}
        </ol>
        <p className="muted hire-stay">How this list stays current: it changes when you add a link, hand in a task, or Claude checks it at your Sunday review. Say &quot;look at my CV&quot; in Claude Code to have it read now.</p>
      </details>

      <PathPanel s={s} act={act} busy={busy} go={go} road={road} here={here} openGap={(id) => open({ kind: "gap", id })}>
      <details className="fold">
        <summary><ChevronRight className="chev" aria-hidden /> <span><b>Not now</b><span className="muted">{s.notnow.items.length} things you&apos;re deliberately leaving, and what brings each back</span></span></summary>
        <ul className="choice-grid">
          {s.notnow.items.map((n, i) => {
            const w = revisitText(n.revisit);
            return (
              <li key={i} className="parked-card" style={{ ["--i" as string]: i }}>
                <span className="parked-icon" aria-hidden><PauseCircle /></span>
                <span className="parked-text"><b>{n.what}</b><span>{n.why}</span></span>
                <span className={`parked-when${w.soon ? " soon" : ""}`}>{w.label}</span>
              </li>
            );
          })}
        </ul>
      </details>
      </PathPanel>

      {ready >= gates.length && (
      <section className={att(2)} aria-labelledby="apps-h">
        <h2 id="apps-h" className="att-2-title">Applications</h2>
        {(
          <div className="apps">
            <button className="btn btn-sm" onClick={() => open({ kind: "log", preset: "application" })}><Plus /> Add application</button>
            {s.reach.funnel.applications.length ? (
              <table>
                <thead><tr><th>Date</th><th>Company</th><th>Role</th><th>Stage</th></tr></thead>
                <tbody>{[...s.reach.funnel.applications].reverse().map((a) => (
                  <tr key={a.id}><td>{fmtDate(a.date)}</td><td>{a.company}</td><td>{a.title}</td>
                    <td><select aria-label={`Stage at ${a.company}`} value={a.stage} onChange={(e) => act({ type: "application.stage", id: a.id, stage: e.target.value as Stage }, "Stage updated")}>{STAGES.map((st) => <option key={st} value={st}>{stageLabel(st)}</option>)}</select></td></tr>
                ))}</tbody>
              </table>
            ) : <p className="muted">None yet. Your first 20 go to founding, lead and senior roles.</p>}
          </div>
        )}
      </section>
      )}

      <ToolsFold modules={s.profile.modules} onOpen={() => go("companion")} />
    </div>
  );
}

/** "checked 2 days ago" from a gap's own provenance. Absent fields say so; they are never hidden. */
function sourceLine(p: { as_of?: string; because?: string[]; reviewed_by?: string }): string {
  const parts: string[] = [];
  if (p.as_of) { const n = Math.max(0, daysSince(p.as_of)); parts.push(n === 0 ? "checked today" : n === 1 ? "checked 1 day ago" : `checked ${n} days ago`); }
  if (p.reviewed_by) parts.push(p.reviewed_by === "claude" ? "by Claude" : p.reviewed_by === "dev" ? "by you" : `by ${p.reviewed_by.replace(/^(person|market):/, "")}`);
  if (p.because?.length) parts.push(`${p.because.length} ${p.because.length === 1 ? "source" : "sources"}`);
  return parts.length ? parts.join(", ") : "Not sourced yet";
}

const CONFIDENCE_WORD: Record<ReadyBy["confidence_label"], string> = { low: "Low", medium: "Low to medium", fair: "Medium" };

/** The one honest line under the date: range, confidence, what it depends on, and where it comes from. */
function ReadyCaption({ s, fc, pace, onHow }: { s: GrowthState; fc: ReadyBy | null; pace: Pace; onHow: () => void }) {
  if (!fc) {
    return (
      <>
        <p className="hire-cap">Claude dates your path at your next Sunday review. Until then there is no date to trust.</p>
        <p className="hire-src">Where this comes from: Claude's estimates, not sourced yet.</p>
      </>
    );
  }
  const titles = (s.library.gaps ?? []).reduce<Record<string, string>>((m, g) => { m[g.id] = g.title; return m; }, {});
  const dep = fc.basis.depends_on.map((id) => titles[id] ?? id);
  const newest = [...fc.basis.estimated_dates].sort().pop();
  const age = newest ? Math.max(0, daysSince(newest)) : null;
  return (
    <>
      <p className="hire-cap">
        {fc.status === "late"
          ? <><b>This is late.</b> Was planned for {readyDate(fc.range.likely)}; the skill areas you are closing are not closed yet.</>
          : <>{fc.range.earliest === fc.range.latest ? `Around ${readyDate(fc.range.likely)}` : `Between ${readyDate(fc.range.earliest)} and ${readyDate(fc.range.latest)}`}, at a {PACE[pace].label.toLowerCase()} pace.</>}
        <span className="hire-cap-more"> Confidence: {CONFIDENCE_WORD[fc.confidence_label]}.
        {dep.length > 0 && <> Depends on: {dep.slice(0, 2).join(" and ")}{dep.length > 2 ? `, and ${dep.length - 2} more` : ""}.</>}
        {fc.unknown > 0 && <> {fc.unknown} {fc.unknown === 1 ? "skill area is" : "skill areas are"} not estimated yet, so it may move.</>}</span>
        {" "}<button className="linkbtn" onClick={onHow}>How this date is worked out</button>
      </p>
      <p className="hire-src">{age === null ? "Where this comes from: Claude's estimates, not sourced yet." : age > 7 ? `Estimate from ${readyDate(newest!)}. Say where do I stand to refresh.` : `Where this comes from: Claude's estimate (as of ${readyDate(newest!)}), ${age === 0 ? "made today" : age === 1 ? "made 1 day ago" : `made ${age} days ago`}.`}</p>
    </>
  );
}

/** The basis of the date, in plain words, so the number can be argued with. */
function HowDated({ s, fc, pace, onClose }: { s: GrowthState; fc: ReadyBy | null; pace: Pace; onClose: () => void }) {
  const gaps = s.library.gaps ?? [];
  const title = (id: string) => gaps.find((g) => g.id === id)?.title ?? id;
  const b = fc?.basis;
  // Evenings still to do in the longer of the two tracks, the same sum the date uses.
  const left = (() => {
    if (!fc || !b) return 0;
    const worked = forecastInputs(s, pace).worked;
    const sums: Record<string, number> = {};
    for (const g of b.gaps) sums[g.track] = (sums[g.track] ?? 0) + g.evenings;
    return Math.max(0, ...Object.entries(sums).map(([k, v]) => Math.max(0, v - (worked[k] ?? 0))));
  })();
  const weeks = fc && b && b.per_week > 0 ? Math.ceil(left / b.per_week) : 0;
  return (
    <Sheet title="How this date is worked out" sub={fc ? `Confidence: ${CONFIDENCE_WORD[fc.confidence_label]}. A guess with a range, not a promise.` : "A guess with a range, not a promise."} onClose={onClose}>
      {!fc || !b ? (
        <p>No skill area has an estimate yet, so there is nothing to add up. Claude estimates them at your next Sunday review.</p>
      ) : (
        <>
          <dl className="props">
            <Prop icon={<Clock />} label="Your pace">{PACE[pace].label}, {b.per_week} evenings a week.</Prop>
            <Prop icon={<Check />} label="Evenings of work">{b.evenings_total} evenings across {b.gaps.length} skill {b.gaps.length === 1 ? "area" : "areas"}, split into a skill task and a hiring task each evening.</Prop>
            <Prop icon={<Target />} label="How it adds up">{left} {left === 1 ? "evening" : "evenings"} of work {left === 1 ? "is" : "are"} left. At {b.per_week} evenings a week that is {weeks} {weeks === 1 ? "week" : "weeks"}, so about {readyDate(fc.range.likely)}{fc.status === "late" ? ", which has already passed" : ""}. A rule of thumb, not a measurement.</Prop>
            <Prop icon={<TrendingUp />} label="The range">From {readyDate(fc.range.earliest)} to {readyDate(fc.range.latest)}. The early date counts {b.spread.low}x the evenings left, the late date {b.spread.high}x, because Claude's estimates can run about a quarter high or half low.{b.waiting_days > 0 ? ` The late date also adds ${b.waiting_days} days of waiting on other people.` : ""}</Prop>
            {b.depends_on.length > 0 && <Prop icon={<Users />} label="Depends on">{b.depends_on.map(title).join("; ")}. Someone else has to act, so it may move.</Prop>}
            {(b.unestimated.length > 0 || b.without_basis > 0) && <Prop icon={<Question />} label="Not in the count">{[b.unestimated.length ? `Not estimated yet: ${b.unestimated.map(title).join("; ")}. They are left out of the date.` : "", b.without_basis ? `${b.without_basis} of the estimates have no stated basis.` : ""].filter(Boolean).join(" ")}</Prop>}
          </dl>
          <h3 className="hire-how-h">The skill areas behind it</h3>
          <ol className="hire-how-list">
            {b.gaps.map((g) => (
              <li key={g.id}><b>{title(g.id)}</b><span className="muted">{g.evenings} {g.evenings === 1 ? "evening" : "evenings"}, {g.status === "late" ? <>{" "}{lateWords(g.date)}</> : `around ${readyDate(g.date)}`}{g.evenings_basis ? `. ${g.evenings_basis}` : ""}</span></li>
            ))}
          </ol>
          {b.gaps.some((g) => !g.evenings_basis) && <p className="muted">Estimates without a stated basis are Claude&apos;s own guess, not sourced yet.</p>}
        </>
      )}
    </Sheet>
  );
}

/* ================= attachments ================= */

function AttachFields({ links, setLinks, files, setFiles }: { links: string[]; setLinks: (l: string[]) => void; files: string[]; setFiles: (f: string[]) => void }) {
  const narrow = useNarrow();
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    setErr("");
    const fd = new FormData();
    [...list].forEach((f) => fd.append("file", f));
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setFiles([...files, ...body.files]);
    } catch (e) {
      setErr(`${e instanceof Error ? e.message : "Couldn't upload that."} Try again, or paste a link instead.`);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <>
      {files.length === 0 && <HelpMoment id="attach" sheet />}
      <div className="field">
        <span>Links (Figma, Penpot, a doc, a post…)</span>
        {links.map((l, i) => (
          <div className="link-row" key={i}>
            <input type="text" inputMode="url" value={l} placeholder="https://" onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Link ${i + 1}`} />
            {links.length > 1 && <button type="button" className="btn btn-quiet btn-sm" aria-label="Remove link" onClick={() => setLinks(links.filter((_, j) => j !== i))}><X /></button>}
          </div>
        ))}
        <button type="button" className="linkbtn add-link" onClick={() => setLinks([...links, ""])}>Add another link</button>
      </div>
      <div className="field">
        <span>Files or screenshots</span>
        <label className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}>
          <input ref={input} type="file" multiple accept="image/*,.pdf" onChange={(e) => upload(e.target.files)} />
          <Paperclip /> {uploading ? "Saving…" : narrow ? "Choose a file or take a photo" : "Drop files here, or choose"}
        </label>
        {files.length > 0 && <ul className="file-list">{files.map((f, i) => <li key={i}><Paperclip size={13} /> {f.replace(/^uploads\/\d+-/, "")}<button type="button" className="btn btn-quiet btn-sm" aria-label="Remove file" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X /></button></li>)}</ul>}
        {err && <p className="field-err" role="alert">{err}</p>}
      </div>
    </>
  );
}

function HandInSheet({ s, id, act, onClose }: { s: GrowthState; id: string; act: ActFn; onClose: () => void }) {
  const t = s.week.tasks.find((x) => x.id === id);
  const [links, setLinks, clearL] = useDraft(`handin.${id}.links`, [""]);
  const [files, setFiles, clearF] = useDraft<string[]>(`handin.${id}.files`, []);
  const [note, setNote, clearN] = useDraft(`handin.${id}.note`, "");
  if (!t) return <Sheet title="Task not found" onClose={onClose}><p className="muted">It may have moved to next week.</p></Sheet>;
  const has = links.some((l) => l.trim()) || files.length > 0 || note.trim();
  const msg = reviewed(t) ? `Handed in. ${savedLine()}` : `Handed in. ${cap(t.adds)}.`;
  const done = () => { clearL(); clearF(); clearN(); onClose(); };
  return (
    <Sheet title="Hand it in" sub={t.task} onClose={onClose}>
      {reviewed(t)
        ? <RecipeOnce id="handin"><Recipe
            where="Here in the app. Attaching here saves it as evidence for this task."
            give="A link, a file or your own words. Nothing else to prepare."
            then={<>To get it reviewed, say <CmdChip text="answer it" label="Copy: answer it (review)" /> in Claude Code.</>}
            see="Claude's notes on this task, with what to change first."
          /></RecipeOnce>
        : <p className="muted">Paste it, link it or attach it. This one counts straight away; it doesn&apos;t wait for Claude.</p>}
      <AttachFields links={links} setLinks={setLinks} files={files} setFiles={setFiles} />
      <label className="field"><span>{t.artifact}</span><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Paste or write it here. No link needed if it lives somewhere you can't share." /></label>
      <div className="sheet-actions">
        {!has && <p className="finish-hint">Add a link, a file, or describe what you did.</p>}
        <DraftNote show={!!has} />
        <button className="btn btn-signal" disabled={!has} onClick={async () => { const linked = links.some((l) => l.trim()) || files.length > 0; if (await act({ type: "task.submit", id, links, files, note, elsewhere: !linked }, msg, id)) done(); }}><Send /> Hand it in</button>
      </div>
    </Sheet>
  );
}

function AttachSheet({ s, id, act, onClose }: { s: GrowthState; id: string; act: ActFn; onClose: () => void }) {
  const p = s.proof.items.find((x) => x.id === id);
  const [links, setLinks, clearL] = useDraft(`attach.${id}.links`, [""]);
  const [files, setFiles, clearF] = useDraft<string[]>(`attach.${id}.files`, []);
  const [note, setNote, clearN] = useDraft(`attach.${id}.note`, "");
  if (!p) return null;
  const has = links.some((l) => l.trim()) || files.length > 0;
  return (
    <Sheet title={`Add the link to ${clipWords(p.name, 36)}`} onClose={onClose}>
      <Recipe
        where="Here in the app. Attaching saves it as evidence."
        give="A link or a file that shows it exists."
        then="It counts as done (self-reported) and adds 70% of its rating gain. The rest comes once someone else has read it."
        see={<>This item marked done on your path. Saved here as evidence. To have Claude read it, say <b>“{/\b(cv|resume)\b/i.test(p.name) ? "look at my CV" : `look at ${sayName(p.name, "this item")}`}”</b> in Claude Code{/\b(cv|resume)\b/i.test(p.name) ? "; it reads the CV in your Growth folder" : ""}.</>}
      />
      <AttachFields links={links} setLinks={setLinks} files={files} setFiles={setFiles} />
      <label className="field"><span>Notes (optional)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="sheet-actions">
        {!has && <p className="finish-hint">Add a link or a file first.</p>}
        <DraftNote show={!!(has || note.trim())} />
        <button className="btn btn-signal" disabled={!has} onClick={async () => { if (await act({ type: "proof.attach", id, links, files, note }, `Done: ${p.name}`)) { clearL(); clearF(); clearN(); onClose(); } }}>Mark it done</button>
      </div>
    </Sheet>
  );
}

const WHO: { v: Source; label: string }[] = [
  { v: "expert", label: "Senior designer or hiring manager" },
  { v: "market", label: "Recruiter or company" },
  { v: "self", label: "Someone else" },
];

function WhoPicker({ value, onChange }: { value: Source | null; onChange: (v: Source) => void }) {
  return (
    <fieldset className="field field-set">
      <span>Who was it?</span>
      <div className="seg">{WHO.map((w) => <label key={w.v}><input type="radio" name="who" checked={value === w.v} onChange={() => onChange(w.v)} /><span>{w.label}</span></label>)}</div>
    </fieldset>
  );
}

function RespondSheet({ s, id, act, onClose }: { s: GrowthState; id: string; act: ActFn; onClose: () => void }) {
  const p = s.proof.items.find((x) => x.id === id);
  const [who, setWho, clearWho] = useDraft(`respond.who.${id}`, "");
  const [said, setSaid, clearSaid] = useDraft(`respond.said.${id}`, "");
  const [from, setFrom] = useState<Source | null>(null);
  if (!p) return null;
  return (
    <Sheet title="Someone read it" sub={withArrows(p.name)} onClose={onClose}>
      <label className="field"><span>Their name</span><input type="text" value={who} onChange={(e) => setWho(e.target.value)} autoFocus /></label>
      <WhoPicker value={from} onChange={setFrom} />
      <label className="field"><span>What they said</span><textarea value={said} onChange={(e) => setSaid(e.target.value)} placeholder="As close to their words as you can." /></label>
      <div className="sheet-actions"><button className="btn btn-signal" disabled={!who.trim() || !said.trim() || !from} onClick={async () => { if (await act({ type: "proof.respond", id, who, said, from: from! }, `Seen by ${who.trim()}. Full credit now.`)) { clearWho(); clearSaid(); onClose(); } }}>Save</button></div>
    </Sheet>
  );
}

/* ================= log ================= */

const KINDS: { id: LogKind; label: string }[] = [
  { id: "application", label: "Applied" },
  { id: "feedback", label: "Feedback" },
  { id: "shipped", label: "Made something" },
  { id: "win", label: "Someone reached out" },
  { id: "note", label: "Just a note" },
];

function inferKind(text: string): LogKind {
  const t = text.toLowerCase();
  if (/\bappl(ied|y|ication)\b/.test(t)) return "application";
  if (/(recruiter|reached out|messaged me|dm'?d|inbound|invited|interview)/.test(t)) return "win";
  if (/(said|feedback|review(ed)?|critique|told me|thinks)/.test(t)) return "feedback";
  if (/(shipped|launched|published|designed|built|made|finished|posted)/.test(t)) return "shipped";
  return "note";
}

function LogSheet({ s, preset, act, onClose }: { s: GrowthState; preset?: LogKind; act: ActFn; onClose: () => void }) {
  const [text, setText, clearText] = useDraft("log.text", "");
  const [picked, setPicked] = useState<LogKind | null>(preset ?? null);
  const kind = picked ?? (text.trim() ? inferKind(text) : null);
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [competency, setCompetency] = useState("");
  const [from, setFrom] = useState<Source | null>(null);
  const ok = kind === "application" ? !!(company.trim() && title.trim()) : !!text.trim() && (kind !== "feedback" || !!from);
  const dirty = !!(text.trim() || company.trim() || title.trim());
  return (
    <Sheet title="What happened?" sub="Goes into your journal" onClose={onClose}>
      <p className="muted sheet-lead">Write what happened, then pick what kind it is.</p>
      <form className="log-form" onSubmit={async (e) => {
        e.preventDefault();
        if (!kind) return;
        const t = kind === "application" ? text.trim() || `Applied to ${title} at ${company}` : text;
        if (await act({ type: "log", kind, text: t, company, title, competency: competency || undefined, from: from ?? undefined }, "Saved to your journal")) { clearText(); onClose(); }
      }}>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} aria-label="What happened" placeholder="A designer said my case study needs outcomes. Shipped the empty state. Applied to a fintech…" />
        {kind && (
          <fieldset className="field field-set">
            <span>{picked ? "This is" : "We guessed this. Change it if not."}</span>
            <div className="seg seg-sm">{KINDS.map((k) => <label key={k.id}><input type="radio" name="kind" checked={kind === k.id} onChange={() => setPicked(k.id)} /><span>{k.label}</span></label>)}</div>
          </fieldset>
        )}
        {kind === "application" && (
          <div className="two">
            <label className="field"><span>Company</span><input type="text" value={company} onChange={(e) => setCompany(e.target.value)} /></label>
            <label className="field"><span>Role</span><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Founding Product Designer" /></label>
          </div>
        )}
        {kind === "feedback" && <WhoPicker value={from} onChange={setFrom} />}
        {(kind === "feedback" || kind === "shipped") && (
          <label className="field"><span>Which skill is it about? (optional)</span>
            <select value={competency} onChange={(e) => setCompetency(e.target.value)}>
              <option value="">Not one skill</option>
              {s.rubric.competencies.map((c) => <option key={c.id} value={c.id}>{skillShort(s, c.id)}</option>)}
            </select>
          </label>
        )}
        <div className="sheet-actions">
          {!ok && <p className="finish-hint">{!text.trim() && kind !== "application" ? "Write what happened to save." : kind === "feedback" && !from ? "Pick who it was to save." : kind === "application" ? "Add the company and role to save." : ""}</p>}
          <DraftNote show={!!text.trim()} />
          <button className="btn btn-signal" disabled={!ok}>Save</button>
        </div>
      </form>
    </Sheet>
  );
}

/* ================= other sheets ================= */

/** Everything Claude has written back, newest first, each opening where it lives. */
function cameBack(s: GrowthState): { date: string; label: string; go?: SheetState; text?: string }[] {
  const learnFor = (comp?: string) => s.week.tasks.find((x) => x.kind === "learn" && x.competency === comp && x.status === "todo")?.id;
  const REPLY_LABEL: Partial<Record<string, string>> = { goal: "About your goal", answers: "What your answers changed", plan: "About next week's plan", ask: "Reply to you", picks: "About this week's picks" };
  return [
    ...s.week.tasks.filter((t) => t.feedback).map((t) => ({ date: t.feedback!.date, label: `Review of "${t.task}"`, go: { kind: "quest", id: t.id } as SheetState })),
    ...s.tests.tests.filter((t) => t.status === "scored").map((t) => ({ date: t.scored_on ?? t.created, label: `${skillShort(s, t.competency)} test, scored`, go: { kind: "test", id: t.id } as SheetState })),
    ...s.learning.briefs.map((b) => ({ date: b.created, label: `Brief: ${b.title}`, go: { kind: "brief", id: b.id, task: learnFor(b.competency) } as SheetState })),
    ...s.queue.items.filter((q) => q.status === "done" && q.reply).map((q) => ({ date: q.done ?? q.created, label: q.type === "ask" && q.ask ? `Your earlier question: "${q.ask.text.length > 70 ? `${q.ask.text.slice(0, 70).trimEnd()}…` : q.ask.text}"` : (REPLY_LABEL[q.type] ?? "Note from Claude"), text: q.reply })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}

const SEEN_KEY = "growth.seen.replies";
const SEEN_EVENT = "growth-seen";
/** How many replies have come back since the Commands page was last opened. The first ever open sets the baseline silently. */
function useUnread(total: number): number {
  const [seen, setSeen] = useState<number | null>(null);
  useEffect(() => {
    const f = () => { const v = store.get(SEEN_KEY); setSeen(v === null ? null : Number(v || 0)); };
    f();
    window.addEventListener(SEEN_EVENT, f);
    return () => window.removeEventListener(SEEN_EVENT, f);
  }, []);
  return seen === null ? 0 : Math.max(0, total - seen);
}

/** The Commands page: the status, the six commands to type, what is waiting, what Claude asked, what came back. */
export function ClaudePage({ s, open, attn, needs, onAct, onboarding = null }: { s: GrowthState; open: OpenFn; attn: AttentionItem[]; needs: number; onAct: (i: AttentionItem) => void; onboarding?: OnboardingStatus | null }) {
  const pending = s.queue.items.filter((q) => q.status === "pending");
  const taskName = (id?: string) => s.week.tasks.find((t) => t.id === id)?.task;
  const what = (q: (typeof pending)[number]) =>
    q.type === "critique" ? `Review of "${taskName(q.task) ?? "a hand-in"}"`
    : q.type === "research" ? `A brief on ${skillShort(s, q.competency)}`
    : q.type === "test" ? `Scoring your ${skillShort(s, q.competency)} test`
    : q.type === "plan" ? "Next week's plan, from your review"
    : q.type === "ask" ? `Your ${q.ask?.kind === "change" ? "change" : "question"}: "${q.ask?.text ?? ""}"`
    : q.type === "picks" ? "This week's library picks"
    : q.type === "goal" ? "Re-planning around your new goal"
    : "Your answers to its questions";
  const asks = (s.profile.intake ?? []).filter((x) => x.answer === null).length;
  const back = cameBack(s);
  // Replies that came back since this page was last opened, captured on arrival so they can be marked "New".
  const [fresh] = useState(() => {
    const seen = store.get(SEEN_KEY);
    return seen === null ? 0 : Math.max(0, back.length - Number(seen || 0));
  });
  useEffect(() => { store.set(SEEN_KEY, String(back.length)); try { window.dispatchEvent(new Event(SEEN_EVENT)); } catch {} }, [back.length]);
  const known = (s.profile.intake ?? []).some((x) => x.answer !== null);
  // The command that fits first: what is waiting, else a library with nothing picked this week, else "where do I stand".
  // Stale means older than 14 days (or never refreshed); anything newer is not worth a hero.
  const libraryStale = !s.library.refreshed || daysSince(s.library.refreshed) > 14;
  // Unanswered questions are answered in the app (CompanionView makes them the hero); "answer it" only runs once something is queued.
  const first = pending.length > 0 ? "answer" : libraryStale ? "library" : "growth";
  // A reply that came back and has not been seen is the T1 itself.
  const newest = fresh > 0 ? back[0] : undefined;
  const reply = newest ? { title: newest.label, onRead: () => { if (newest.go) open(newest.go); else document.getElementById("comp-back-h")?.scrollIntoView({ block: "start" }); } } : undefined;
  // When the questions are the page's hero, the inbox does not repeat them.
  const [connected] = useSetupDone(back.length);
  // The onboarding hero says the same thing, so the inbox does not repeat it once Claude Code is connected.
  const obHero = connected && !!onboarding && onboarding.status !== "complete" && asks === 0 && !reply;
  // The reply hero says it once: the inbox row for the same replies and the first "From Claude" row step aside.
  const inbox = attn.filter((i) => !(connected && asks > 0 && i.id === "asked") && !(obHero && i.id === "onboarding") && !(reply && i.id === "replies"));
  return (
    <CompanionView
      statusLine={claudeStatus(s).sentence}
      modules={s.profile.modules}
      first={first}
      reply={reply}
      onboarding={onboarding}
      counts={{ waiting: pending.length, asked: asks, back: back.length, unread: fresh, known: known ? 1 : 0, total: needs }}
      onAnswer={() => open({ kind: "intake" })}
      head={<PageHead icon={<Chats />} title="Commands" help="companion" label sub={commandsSub(connected, attn)} />}
      slots={{
        waiting: <ul className="timeline">{pending.map((q) => <li key={q.id}><span className="d">{fmtDate(q.created)}</span><span>{what(q)}</span></li>)}</ul>,
        attention: inbox.length > 0 ? <AttentionList items={inbox} today={localToday()} onAct={onAct} showSum={false} /> : undefined,
        fromClaude: <>
          {back.length > 0 && <ul className="timeline back-log">{back.slice(0, 15).map((x, i) => (reply && i === 0) ? null : <li key={i}><span className="d">{fmtDate(x.date)}</span>{x.text
            ? <span className="back-note"><span className="ask-who">{x.label}{i < fresh && <span className="back-new"> · New</span>}</span><span className="back-text"><ClaudeMark size={22} /> {x.text}</span></span>
            : <button className="linkbtn back-row" onClick={() => x.go && open(x.go)}>{x.label}{i < fresh && <span className="back-new"> · New</span>} <ChevronRight aria-hidden /></button>}</li>)}</ul>}
          {known && (
            <details className="toggle">
              <summary><ChevronRight className="chev" aria-hidden /> <span><b>What Claude knows about you</b><span className="muted">Your answers, and what each one changed</span></span></summary>
              <KnowsList s={s} />
            </details>
          )}
        </>,
      }}
    />
  );
}

/** Brings the once-only hints and recipes back. Nothing else is touched. */
function ResetHints() {
  const [done, setDone] = useState(false);
  return <button type="button" className="linkbtn" onClick={() => { resetHelp(); setDone(true); }}>{done ? "Hints will show again" : "Reset hints"}</button>;
}


/** When a parked item comes back, in plain words. */
function revisitText(r: string) {
  const today = new Date(`${localToday()}T00:00:00`).getTime();
  if (r === "not planned") return { label: "No plan to pick it up", soon: false };
  if (/^\d{4}-\d{2}$/.test(r)) return { label: `Look again in ${new Date(`${r}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`, soon: false };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r)) return { label: `Comes back ${r}`, soon: false };
  const days = Math.round((new Date(`${r}T00:00:00`).getTime() - today) / 86400000);
  if (days <= 0) return { label: "Time to look again", soon: true };
  if (days < 14) return { label: `Look again in ${days} day${days === 1 ? "" : "s"}`, soon: true };
  return { label: `Look again in ${Math.round(days / 7)} weeks`, soon: false };
}

function NotNowSheet({ s, onClose }: { s: GrowthState; onClose: () => void }) {
  const when = revisitText;
  return (
    <Sheet title="Not now" sub="Parked on purpose" onClose={onClose}>
      <p className="muted sheet-lead">Things you&apos;re deliberately leaving for now, and what brings each one back. Check here before starting something new.</p>
      <ul className="parked">
        {s.notnow.items.map((n, i) => {
          const w = when(n.revisit);
          return (
            <li key={i} className="parked-card" style={{ ["--i" as string]: i }}>
              <span className="parked-icon" aria-hidden><PauseCircle /></span>
              <span className="parked-text"><b>{n.what}</b><span>{n.why}</span></span>
              <span className={`parked-when${w.soon ? " soon" : ""}`}>{w.label}</span>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

function ReviewSheet({ s, act, onClose }: { s: GrowthState; act: ActFn; onClose: () => void }) {
  const w = useWeek(s);
  const [happened, setHappened, clearHappened] = useDraft("review.happened", "");
  const [sent, setSent] = useState(false);
  const closed = s.week.tasks.filter(isClosed);
  const openOnes = s.week.tasks.filter((t) => t.status === "later" || t.status === "todo");
  const full = s.rubric.competencies.filter((c) => statXp(s, c.id) >= XP_PER_LEVEL);
  const bets = s.bets.bets.filter((b) => b.status === "active");
  if (sent) {
    return (
      <Sheet title="Week saved" onClose={onClose}>
        <p>Saved. Claude plans next week when you say <CmdChip text="answer it" label="Copy: answer it (next week)" />.</p>
        <p>It checks any skill with a full bar, looks at this month&apos;s plan and writes next week: two tasks a night, both tracks.</p>
        <ReviewSentHow />
      </Sheet>
    );
  }
  return (
    <Sheet title="Your week" sub={`Week of ${fmtDate(w.start)}`} onClose={onClose}>
      {!([0, 6].includes(new Date().getDay()) || localToday() > addDays(s.week.week_of, 6)) && <p className="muted">Here is where your week stands. Planning the next one opens Saturday.</p>}
      {(() => {
        const nJournal = w.entries.filter((e) => e.type !== "ai" && !s.week.tasks.some((t) => t.task === e.title)).length;
        return closed.length === 0 && w.lit.filter(Boolean).length === 0 && nJournal === 0;
      })() ? <p className="muted">Nothing from you logged yet this week; it counts from tonight.</p> : <div className="review-stats">
        <p><b>{closed.length}</b><span>of {s.week.tasks.length} tasks done</span></p>
        <p><b>{w.lit.filter(Boolean).length}</b><span>{w.lit.filter(Boolean).length === 1 ? "evening with something logged" : "evenings with something logged"}</span></p>
        {(() => { const n = w.entries.filter((e) => e.type !== "ai" && !s.week.tasks.some((t) => t.task === e.title)).length; return <p><b>{n}</b><span>{n === 1 ? "journal entry of yours" : "journal entries of yours"}</span></p>; })()}
      </div>}
      {openOnes.some((t) => t.day && w.todayIdx > DAYS.indexOf(t.day)) && <p className="review-full"><RotateCcw aria-hidden /> Earlier days' tasks move forward in order. What is still open after Saturday goes into Sunday review. Dates change only then.</p>}
      {full.length > 0 && <p className="review-full"><CalendarCheck aria-hidden /> Ready for Sunday review:<b>{full.map((c) => skillShort(s, c.id)).join(", ")}</b></p>}
      {(closed.length > 0 || w.lit.filter(Boolean).length > 0 || w.entries.some((e) => e.type !== "ai" && !s.week.tasks.some((t) => t.task === e.title))) && <div>
        <h3>Done</h3>
        {closed.length ?<ul className="checklist">{closed.map((t) => <li key={t.id} className="on"><span className="tick" aria-hidden><Check /></span><span>{t.task}{t.where === "desk" && <span className="muted"> · At your desk</span>}</span>{t.prev && <button className="btn btn-quiet btn-sm" onClick={() => act({ type: "task.undo", id: t.id }, "Undone. Nothing was counted.")}><RotateCcw /> Undo</button>}</li>)}</ul> : <p className="muted">No tasks done yet this week.</p>}
      </div>}
      {openOnes.length > 0 && (() => {
        const isFuture = (t: Task) => t.status !== "later" && !!t.day && DAYS.indexOf(t.day) > w.todayIdx;
        const isToday = (t: Task) => t.status !== "later" && !!t.day && DAYS.indexOf(t.day) === w.todayIdx;
        const path = new Set(tonight(s).map((x) => x.id));
        const todays = openOnes.filter((t) => isToday(t) && path.has(t.id));
        const listed = openOnes.filter((t) => isToday(t) && !path.has(t.id));
        const earlier = openOnes.filter((t) => !isFuture(t) && !isToday(t));
        const ahead = openOnes.filter(isFuture);
        const row = (t: Task) => (
          <li key={t.id}><span className="day-badge">{t.status === "later" ? "Later" : t.day ?? "Extra"}</span><span>{t.task}{t.where === "desk" && <span className="muted"> · At your desk</span>}</span>
            {t.status === "later" && <button className="btn btn-quiet btn-sm" onClick={() => act({ type: "task.reopen", id: t.id }, "Back on tonight's path")}><RotateCcw /> Bring back</button>}</li>
        );
        return (
          <div>
            {earlier.length > 0 && <><h3>{WHEN.carried}</h3><ul className="checklist">{earlier.map(row)}</ul></>}
            {todays.length > 0 && <><h3>{WHEN.tonight}</h3><ul className="checklist">{todays.map(row)}</ul></>}
            {listed.length > 0 && <><h3>{WHEN.today}</h3><ul className="checklist">{listed.map(row)}</ul></>}
            {ahead.length > 0 && <details className="fold"><summary><ChevronRight className="chev" aria-hidden /> {WHEN.later} ({ahead.length})</summary>
              {/* One heading per day, so the day is said once and its tasks sit under it. */}
              {DAYS.filter((d) => ahead.some((t) => t.day === d)).map((d) => (
                <div key={d} className="day-group">
                  <h4 className="day-group-h">{DAY_NAME[d] ?? d}</h4>
                  <ul className="checklist">{ahead.filter((t) => t.day === d).map((t) => (
                    <li key={t.id}><span>{t.task}{t.where === "desk" && <span className="muted"> · At your desk</span>}</span></li>
                  ))}</ul>
                </div>
              ))}
            </details>}
          </div>
        );
      })()}
      <div>
        <h3>This month&apos;s plan</h3>
        <ul className="bets">{bets.map((b) => { const p = betProgress(s, b); return <li key={b.id}><span>{b.hypothesis}</span><Bar value={p.done / Math.max(1, p.total)} segments={Math.max(1, p.total)} tone="done" label={`${p.done} of ${p.total} steps`} /><b>{p.done} of {p.total} steps</b></li>; })}</ul>
      </div>
      {([0, 6].includes(new Date().getDay()) || localToday() > addDays(s.week.week_of, 6))
        ? <>
            <label className="field"><span>Anything Claude should know? (optional)</span><textarea value={happened} onChange={(e) => setHappened(e.target.value)} placeholder="What got in the way, what surprised you, what felt good." /></label>
            <DraftNote show={!!happened.trim()} />
            <div className="task-actions sheet-actions"><button className="btn btn-signal" onClick={async () => { if (await act({ type: "review.submit", happened })) { clearHappened(); setSent(true); } }}>Save my week</button></div>
          </>
        : null}
    </Sheet>
  );
}


function BriefSheet({ s, id, taskId, jump, act, onClose }: { s: GrowthState; id: string; taskId?: string; jump?: boolean; act: ActFn; onClose: () => void }) {
  const b = s.learning.briefs.find((x) => x.id === id);
  const t = taskId ? s.week.tasks.find((x) => x.id === taskId && x.status === "todo") : undefined;
  // Opening is read-only: nothing is saved. It counts as read on "Mark as read", or on "Hand it in" after 20 seconds open.
  const openedAt = useRef(Date.now());
  useEffect(() => {
    if (!jump) return;
    const id = setTimeout(() => {
      const box = document.querySelector<HTMLTextAreaElement>(".brief-handin textarea");
      box?.scrollIntoView({ block: "center" });
      box?.focus({ preventScroll: true });
    }, 120);
    return () => clearTimeout(id);
  }, [jump]);
  if (!b) return <Sheet title="Brief not found" onClose={onClose}><p className="muted">It may have been replaced.</p></Sheet>;
  return (
    <Sheet title={b.title} sub={`Research brief · ${fmtDate(b.created)}`} onClose={onClose}>
      <p className="reading">{b.summary}</p>
      <div><h3>What to take from it</h3><ul className="brief-points">{b.points.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
      <div><h3>Sources</h3><ul className="timeline">{b.sources.map((x, i) => <li key={i} style={{ gridTemplateColumns: "1fr" }}><a href={x.url} target="_blank" rel="noreferrer" aria-label={`${x.title} (opens in a new tab)`}>{x.title} <ArrowRight aria-hidden style={{ transform: "rotate(-45deg)" }} /></a></li>)}</ul></div>
      {!b.read && <div><button className="btn btn-sm" disabled={!!s.lock} onClick={() => act({ type: "brief.read", id: b.id }, "Marked as read.")}><Check aria-hidden /> Mark as read</button></div>}
      {t && <BriefHandIn t={t} briefId={id} read={!!b.read} openedAt={openedAt} act={act} onClose={onClose} />}
    </Sheet>
  );
}

function BriefHandIn({ t, briefId, read, openedAt, act, onClose }: { t: Task; briefId: string; read: boolean; openedAt: React.MutableRefObject<number>; act: ActFn; onClose: () => void }) {
  const smallNight = typeof window !== "undefined" && store.get(`growth.time.${localToday()}`) === "quarter";
  const TEMPLATE = "1. \n2. \n3. \nWho I could ask: ";
  const [note, setNote, clearNote] = useDraft(`brief.${t.id}`, TEMPLATE);
  const real = note !== TEMPLATE && /^\s*1\.[ \t]*\S/m.test(note);
  return (
    <div className="brief-handin">
      <label className="field">
        <span>Now: {t.artifact.toLowerCase()}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={"1.\n2.\n3.\nWho I could ask:"} />
      </label>
      <DraftNote show={real} />
      <div className="sheet-actions">
        <p id="handin-hint" className="finish-hint">{real ? "" : "Write at least your first question to hand it in. "}Claude reads it <NextRun />, and writes back.</p>
        <button className="btn btn-signal" disabled={!real} aria-describedby="handin-hint" onClick={async () => { if (!read && Date.now() - openedAt.current >= 20000) await act({ type: "brief.read", id: briefId }); if (await act({ type: "task.submit", id: t.id, links: [], files: [], note }, `Handed in. ${savedLine()}`, t.id)) { clearNote(); onClose(); } }}><Send /> Hand it in</button>
      </div>
    </div>
  );
}

function TestSheet({ s, id, act, onClose }: { s: GrowthState; id: string; act: ActFn; onClose: () => void }) {
  const t = s.tests.tests.find((x) => x.id === id);
  const [answers, setAnswers, clearAnswers] = useDraft<string[]>(`test.${id}`, t?.questions.map((q) => q.answer ?? "") ?? []);
  const name = s.rubric.competencies.find((c) => c.id === t?.competency)?.name ?? "";
  if (!t) return <Sheet title="Test not found" onClose={onClose}><p className="muted">It may have been replaced.</p></Sheet>;
  if (t.status !== "ready") {
    return (
      <Sheet title={`${name} test`} sub={t.status === "scored" ? `Scored${t.scored_on ? ` on ${fmtDate(t.scored_on)}` : ""}` : "Sent for scoring"} onClose={onClose}>
        {t.status === "scored" && t.score !== undefined && (
          <div className="rs-top"><p className="rs-num">{levelWord(t.score)}<span>what your answers read at</span></p><p>{t.feedback}</p></div>
        )}
        {t.status === "answered" && <div className="callout"><span className="callout-icon" aria-hidden><Hourglass /></span><div><h3>Queued for Claude to score</h3><p className="muted"><SendHow /> The score and a note on each answer appear here.</p></div></div>}
        {t.questions.map((q, i) => (
          <div key={i} className="test-q">
            <h3>{i + 1}. {q.q}</h3>
            <p className="test-a">{q.answer}</p>
            {t.notes?.[i] && <p className="test-note"><MessageSquare aria-hidden /> {t.notes[i]}</p>}
          </div>
        ))}
      </Sheet>
    );
  }
  return (
    <Sheet title={`${name} test`} sub="Take your time" onClose={onClose}>
      <p className="muted sheet-lead">Answer like you would in an interview. There&apos;s no time limit.</p>
      {t.questions.map((q, i) => (
        <label className="field" key={i}>
          <span>{i + 1}. {q.q}</span>
          <textarea value={answers[i] ?? ""} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} />
        </label>
      ))}
      <div className="sheet-actions">
        {answers.some((a) => !a.trim()) && <p className="finish-hint">Answer all {t.questions.length} to send.</p>}
        <DraftNote show={answers.some((a) => a.trim())} />
        <button className="btn btn-signal" disabled={answers.some((a) => !a.trim())} onClick={async () => { if (await act({ type: "test.answer", id, answers }, "Sent for scoring")) { clearAnswers(); onClose(); } }}>Send for scoring</button>
      </div>
    </Sheet>
  );
}

/** Questions Claude asked so it can understand the person before it advises. Answer any; skip any. */
function IntakeSheet({ s, act, onClose }: { s: GrowthState; act: ActFn; onClose: () => void }) {
  const open = (s.profile.intake ?? []).filter((q) => q.answer === null);
  const [answers, setAnswers, clearAnswers] = useDraft<Record<string, string>>("intake", {});
  const given = open.filter((q) => (answers[q.id] ?? "").trim());
  const set = (id: string, v: string) => setAnswers({ ...answers, [id]: v });
  const [at, setAt] = useState(0);
  const cur = Math.min(at, Math.max(0, open.length - 1));
  if (!open.length) return <Sheet title="Your answers" onClose={onClose}><p className="muted">Nothing to answer right now.</p></Sheet>;
  return (
    <Sheet title="Your answers" sub={`Question ${cur + 1} of ${open.length}. A minute each.`} onClose={onClose}>
      <div className="iq-nav">
        <button type="button" className="btn btn-quiet btn-sm" disabled={cur === 0} onClick={() => setAt(cur - 1)}>Back</button>
        <button type="button" className="linkbtn" disabled={cur >= open.length - 1} onClick={() => setAt(cur + 1)}>Skip for now</button>
        <button type="button" className="btn btn-sm" disabled={cur >= open.length - 1} onClick={() => setAt(cur + 1)}>Next</button>
      </div>
      <p className="muted sheet-lead">Counts and examples beat feelings. If you don&apos;t know, say so; that&apos;s useful too.</p>
      {open.filter((_, i) => i === cur).map((q) => (
        <div className="field" key={q.id}>
          <label htmlFor={`iq-${q.id}`}>{q.q}</label>
          {q.why && <p className="muted iq-why">{q.why}</p>}
          {(q.options?.length || q.id.startsWith("life.")) ? (
            <div className="chips" role="group" aria-label="Quick answers">
              {[...(q.options ?? []), "Don't know", ...(q.id.startsWith("life.") ? ["Rather not say"] : [])].map((o) => <button key={o} type="button" className={`chip${answers[q.id] === o ? " on" : ""}`} aria-pressed={answers[q.id] === o} aria-label={`${o}, for: ${q.q}`} onClick={() => set(q.id, o)}>{o}</button>)}
            </div>
          ) : null}
          <textarea id={`iq-${q.id}`} value={answers[q.id] ?? ""} onChange={(e) => set(q.id, e.target.value)} placeholder={q.options?.length ? "Or say it in your own words. A rough number is fine." : "A rough number or a short example is fine. Don't know is fine too."} />
        </div>
      ))}
      <p className="muted">Write them here. Then say <CmdChip text="answer it" label="Copy: answer it (answers)" /> in Claude Code, and Claude reads them.</p>
      <div className="sheet-actions">
        <p className="finish-hint">{given.length === 0 ? "Answer any one. The rest can stay for later." : given.length < open.length ? "You can save some now and the rest later." : <>Claude reads them <NextRun />.</>}</p>
        <DraftNote show={given.length > 0} />
        <button className="btn btn-signal" disabled={!given.length} onClick={async () => { if (await act({ type: "intake.answer", answers: given.map((q) => ({ id: q.id, answer: answers[q.id] })) }, savedLine())) { clearAnswers(); onClose(); } }}>{given.length === 0 ? "Save answers" : given.length === 1 ? "Save 1 answer" : `Save ${given.length} answers`}</button>
      </div>
    </Sheet>
  );
}

/* ================= Library: worth your time this week ================= */

const PICK_KIND: Record<Pick["kind"], { label: string; Icon: LucideIcon; verb: string }> = {
  video: { label: "Video", Icon: Play, verb: "Watch" },
  podcast: { label: "Podcast", Icon: Headphones, verb: "Listen" },
  visual: { label: "Flows to study", Icon: Eye, verb: "Open" },
  article: { label: "Article", Icon: FileText, verb: "Read" },
  book: { label: "Book", Icon: BookOpen, verb: "Open" },
  news: { label: "New in design", Icon: Sparkles, verb: "Read" },
};
/** News belongs under "New in design" only when it is about design. Other news is labelled "In the news". */
const designNews = (p: Pick) => p.kind === "news" && (p.competency !== "domain" || /\b(design|figma|ux|ui|interface|prototype|component|accessib)/i.test(p.title));
const pickLabel = (p: Pick) => (p.kind === "news" && !designNews(p) ? "In the news" : PICK_KIND[p.kind].label);
/** The 16px glyph that leads a Library hero's eyebrow, by what the pick is. Decorative. */
function pickHeroIcon(p: Pick) {
  if (p.kind === "visual") return <Phone size={16} />;
  if (p.kind === "video") return <PlayCircle size={16} />;
  if (p.kind === "book") return <BookOpen size={16} />;
  if (p.kind === "podcast") return <Headphones size={16} />;
  return <Newspaper size={16} />;
}
const SKIP_REASONS = ["Not now", "Already know this", "Not my thing", "Too long"];
const RECHECK_DAYS = 30;

const daysSince = (iso: string) => Math.floor((new Date(`${localToday()}T00:00:00`).getTime() - new Date(`${iso}T00:00:00`).getTime()) / 864e5);

function lengthText(p: Pick) {
  return lengthWords(p.minutes, p.kind) || null;
}

/** How fresh a pick is, said honestly: new, recent, or an older classic with the reason it still holds. */
function freshness(p: Pick): { label: string; note?: string; tone: "new" | "ok" | "old" } | null {
  if (!p.published) return null;
  const year = Number(p.published.slice(0, 4));
  const now = Number(localToday().slice(0, 4));
  const when = p.published.length >= 7 ? new Date(`${p.published.slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : String(year);
  if (year >= now - 1) return { label: year === now ? `New, ${when}` : `Recent, ${when}`, tone: "new" };
  if (year >= now - 3) return { label: `From ${year}`, tone: "ok" };
  return { label: `From ${year}`, note: p.still_current, tone: "old" };
}

/** When Claude last confirmed it's current. Older than a month reads as due for a recheck. */
function checkedText(p: Pick) {
  if (!p.checked) return { label: "Not checked yet", due: true };
  const d = daysSince(p.checked);
  return d > RECHECK_DAYS ? { label: `Checked ${fmtDate(p.checked)}, due for a recheck`, due: true } : { label: `Checked ${d === 0 ? "today" : d === 1 ? "yesterday" : fmtDate(p.checked)}`, due: false };
}

/** A pick's reason must not name a list ("Not now"): say it in plain words instead. */
const scrubWhy = (t?: string) => t?.replace(/([A-Z][^.]*?) (?:are|is) in Not now, but this one[^.]*\./, (_m, what: string) => `You set aside ${what} earlier. This one still fits what you're working on.`);
export function PickCard({ s, p: raw, act, busy, featured, hero }: { s: GrowthState; p: Pick; act: ActFn; busy: boolean; featured?: boolean; /** The page's one T1: pass its eyebrow ("Best this week"). Without it the pick is a bare row. */ hero?: string }) {
  const p: Pick = { ...raw, why: scrubWhy(raw.why) ?? raw.why, ...(raw.score ? { score: { ...raw.score, why: scrubWhy(raw.score.why) ?? raw.score.why } } : {}) };
  const K = PICK_KIND[p.kind];
  const [finishing, setFinishing] = useState(false);
  const [note, setNote, clearNote] = useDraft(`pick.${p.id}`, "");
  const task = p.task ? s.week.tasks.find((t) => t.id === p.task) : undefined;
  const gap = p.gap ? s.library.gaps?.find((g) => g.id === p.gap) : undefined;
  const fresh = freshness(p);
  const meta = [fresh?.label, p.kind === "book" && p.price_inr ? `about ₹${p.price_inr.toLocaleString("en-IN")}` : null, p.competency ? skillShort(s, p.competency) : null].filter(Boolean) as string[];
  const tipRaw = p.kind === "news" ? (p.try_it ? { label: "Try it", text: p.try_it, Icon: PenTool } : null) : (p.look_for ? { label: "Look for", text: p.look_for, Icon: Lightbulb } : null);
  // One supporting line per card: the tip on the three to start with; elsewhere, why an older piece still holds, else the tip.
  const holds = fresh?.note ? { label: "Still holds", text: fresh.note, Icon: Check } : null;
  const tip = p.kind === "book" ? null : featured ? tipRaw : holds ?? tipRaw;
  const feeds = task ? task.task : null;
  // A rationale that is word for word the same on two or more picks says nothing about this one: show none.
  const myWhy = (p.score?.why || p.why || "").trim();
  const hideWhy = !!myWhy && (s.library.picks ?? []).filter((x) => x.week_of === p.week_of && (x.score?.why || x.why || "").trim() === myWhy).length >= 2;
  const [more, setMore] = useState(false);
  const ago = checkedAgo(p, localToday());
  const free = p.kind === "book" && p.try_first;
  const verb = free ? "Read the free part of" : `${K.verb}:`;
  const linkText = `${verb} ${p.title}`;
  const href = free ? p.try_first!.url : p.url;
  const skip = () => act({ type: "pick.set", id: p.id, status: "skipped" }, `Skipped "${p.title}". It's in Skipped this week.`, { type: "pick.set", id: p.id, status: "new" });
  const finish = async () => { if (await act({ type: "pick.done", id: p.id, note }, note.trim() ? "Marked finished. Saved to your journal." : "Marked finished.", { type: "pick.set", id: p.id, status: "new" })) clearNote(); };
  const cancel = () => { setFinishing(false); setTimeout(() => (document.querySelector(`[data-finish="${p.id}"]`) as HTMLElement | null)?.focus(), 0); };
  const form = (
    <div className="pick-form lib-form">
      <label className="field"><span>One thing you&apos;d use (optional)</span>
        <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={p.look_for ? "What did you find?" : "In a line, what stuck with you?"} /></label>
      <p className="muted">If you write a line, it goes in your journal{gap ? <>, counted toward &quot;{gap.title}&quot;</> : null}.</p>
    </div>
  );
  const tipLine = tip && <p className="pick-note lib-tip"><tip.Icon aria-hidden /> <span><b>{tip.label}:</b> {nb(tip.text)}</span></p>;
  const bookLine = p.kind === "book" && (p.price_inr || p.try_first) && (
    <p className="pick-note lib-tip"><Wallet aria-hidden /> <span>{p.try_first ? <>Start with {p.try_first.title}; <a href={p.url} target="_blank" rel="noreferrer">buy the book</a> only if it pulls you in.</> : "An investment: buy it only if it pulls you in."}</span></p>
  );
  if (hero) {
    const facts = [p.by, lengthText(p), ...meta].filter(Boolean) as string[];
    return (
      <Hero cmds={asks(s, [{ ask: "Picks out of date?", say: PAGE_COMMAND.library.say }, { ask: "Is this worth it?", say: "is this worth my time" }, LOST])} label="Best pick" icon={pickHeroIcon(p)} eyebrow={`${pickLabel(p)} · ${hero}`} title={<span id={`pick-${p.id}`} tabIndex={-1}>{p.title}</span>}
        act={finishing ? (
          <>
            <button className="btn btn-signal att-act" disabled={busy} onClick={finish}><Check /> Finished</button>
            <button className="linkbtn" onClick={cancel}>Cancel</button>
          </>
        ) : (
          <>
            <a className="btn btn-signal att-act" href={href} target="_blank" rel="noreferrer"><span className="act-t">{linkText}</span> <ExternalLink aria-hidden /><span className="sr">, opens a new tab</span></a>
            <button className="btn" data-finish={p.id} onClick={() => setFinishing(true)}>Finished it</button>
          </>
        )}
        foot={finishing ? undefined : <button className="linkbtn" disabled={busy} onClick={skip}>Skip this week</button>}>
        <div className="lib-hero-meta">
          <PickThumb p={p} className="lib-hero-thumb" />
          <p className="lib-meta">
            {facts.map((m, i) => (i === 0 && p.by && m === p.by) ? <span key={i} className="has-mark"><SourceMark name={m} />{m}</span> : <span key={i}>{m}</span>)}
            <PickWord p={p} />
            {ago && <span className={ago.due ? "is-due" : undefined}>{ago.label}</span>}
          </p>
        </div>
        <p className="att-why">{p.score?.why || p.why}</p>
        {(gap || feeds) && <p className="lib-hero-feeds att-note">{[gap ? `Closes: ${gap.title}` : "", feeds ? `Feeds: ${feeds}` : ""].filter(Boolean).join(" · ")}</p>}
        {tipLine}
        {bookLine}
        {finishing && form}
      </Hero>
    );
  }
  return (
    <LibraryCard row hideWhy={hideWhy} expanded={more || finishing} today={localToday()} p={p} Icon={K.Icon} kindLabel={pickLabel(p)} tone={task?.track} meta={[lengthText(p), ...meta].filter(Boolean) as string[]} closes={gap ? gap.title : null} feeds={feeds}
      tags={<WhereTag where={p.kind === "video" || p.kind === "podcast" || p.kind === "news" ? "phone" : "desk"} />}>
      {finishing ? (
        <>
          {form}
          <div className="lib-acts">
            <button className="btn btn-sm" disabled={busy} onClick={finish}><Check aria-hidden /> Finished</button>
            <button className="linkbtn" onClick={cancel}>Cancel</button>
          </div>
        </>
      ) : (
        <div className="lib-acts">
          <a className="linkbtn lib-open" href={href} target="_blank" rel="noreferrer"><span className="lib-open-t">{linkText}</span> <ExternalLink aria-hidden /><span className="sr">, opens a new tab</span></a>
          {more ? (
            <>
              <button className="linkbtn" data-finish={p.id} onClick={() => setFinishing(true)}>Finished it</button>
              <button className="linkbtn" disabled={busy} onClick={skip}>Skip this week</button>
            </>
          ) : (
            <button className="linkbtn" aria-expanded={false} aria-label={`More about ${p.title}: finished it, skip this week`} onClick={() => setMore(true)}>More</button>
          )}
        </div>
      )}
    </LibraryCard>
  );
}

/** A skipped pick: bring it back, or tell Claude why so it picks better. */
function SkippedRow({ p, act, busy }: { p: Pick; act: ActFn; busy: boolean }) {
  return (
    <li className="skipped-row">
      <span className="skipped-title">{p.title}<span className="muted"> · {pickLabel(p)}</span></span>
      <div className="chips" role="group" aria-label={`Why you skipped ${p.title}, optional`}>
        {SKIP_REASONS.map((r) => <button key={r} type="button" className={`chip${p.skip_reason === r ? " on" : ""}`} aria-pressed={p.skip_reason === r} disabled={busy} onClick={() => act({ type: "pick.set", id: p.id, status: "skipped", reason: r }, "Thanks. Claude will pick with that in mind.")}>{r}</button>)}
        <button type="button" className="linkbtn" disabled={busy} onClick={() => act({ type: "pick.set", id: p.id, status: "new" }, "Brought back")}>Bring back</button>
      </div>
    </li>
  );
}

const GAP_STATUS = { open: "Still open", closing: "Closing", closed: "Closed" } as const;
const PACE: Record<Pace, { label: string; evenings: number }> = {
  lighter: { label: "Lighter", evenings: 3 },
  steady: { label: "Steady", evenings: 5 },
  push: { label: "Push", evenings: 6 },
};

/* The arithmetic lives in lib/forecast.mjs (one copy, checked by scripts/forecast-check.mjs). Dates are never clamped: late is said out loud. */
/** The one date style for ready-by, everywhere: "15 Nov", with the year when it is not this year. */
const readyDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", d.getFullYear() === new Date().getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
};
/** The one way a late date is worded, everywhere. */
const lateWords = (iso: string) => `Late: was due around ${readyDate(iso)} (Claude's estimate)`;
/** "ready around 15 Nov" or, when that date has passed, the late wording. */
const readyPhrase = (r: { date: string; status?: string; late?: boolean }) => (r.status === "late" || r.late ? lateWords(r.date) : `ready around ${readyDate(r.date)}`);

/** How many evenings a week the person wants to work. It sets every date in the app and how Claude plans each week. */
function PaceControl({ s, act, busy }: { s: GrowthState; act: ActFn; busy: boolean }) {
  const pace: Pace = s.profile.pace ?? "steady";
  // What each pace would mean, shown before he picks: the ready-by date, and how far it is from today's.
  const cur = readyBy(s, pace);
  const when = (k: Pace): string => {
    const r = readyBy(s, k);
    if (!r) return "";
    if (!cur || k === pace) return readyPhrase(r);
    const weeks = Math.round((new Date(`${r.date}T00:00:00`).getTime() - new Date(`${cur.date}T00:00:00`).getTime()) / (7 * 864e5));
    if (weeks === 0) return `${readyPhrase(r)}, about the same`;
    return `${readyPhrase(r)}, about ${Math.abs(weeks)} ${Math.abs(weeks) === 1 ? "week" : "weeks"} ${weeks > 0 ? "later" : "sooner"}`;
  };
  return (
    <div className="pace">
      <span className="pace-label">Your pace</span>
      <div className="seg" role="radiogroup" aria-label="Your pace">
        {(Object.keys(PACE) as Pace[]).map((k) => (
          <label key={k}><input type="radio" name="pace" checked={pace === k} disabled={busy} onChange={() => act({ type: "pace.set", pace: k }, `Pace set to ${PACE[k].label.toLowerCase()}. Every date moved; Claude plans next week to match.`, { type: "pace.set", pace })} /><span>{PACE[k].label}, {PACE[k].evenings} evenings{when(k) && <small className="pace-when">{when(k)}</small>}</span></label>
        ))}
      </div>
    </div>
  );
}

/** Gaps grouped by track (skill, then getting hired), each in its stored order, which is what drives dates. */
function orderedGaps<T extends { track?: string }>(gaps: T[]): T[] {
  return [...gaps.filter((g) => (g.track ?? "skill") !== "reach"), ...gaps.filter((g) => g.track === "reach")];
}

/** The whole path in one line, with the detail folded: when he's ready at his pace, and the pace and order that decide it. */
function PathPanel({ s, act, busy, road, here, openGap, children }: { children?: React.ReactNode; s: GrowthState; act: ActFn; busy: boolean; go?: (v: View) => void; road?: { name: string; done: boolean; detail?: string; when?: string }[]; here?: number; openGap?: (id: string) => void }) {
  const pace: Pace = s.profile.pace ?? "steady";
  const ready = readyBy(s, pace);
  const kept = keptPerWeek(s);
  const keptReady = kept > 0 && kept < PACE[pace].evenings ? readyBy(s, pace, { perWeek: kept }) : null;
  const eta = gapForecast(s, pace);
  const goal = s.profile.north_star;
  const live = (s.library.gaps ?? []).filter((g) => g.status !== "closed");
  const proofReady = s.proof.items.filter((x) => x.priority <= 2).filter(isReady).length;
  const proofAll = s.proof.items.filter((x) => x.priority <= 2).length;
  return (
    <details className="fold att-4 path-panel path-more" id="pace-fold">
      <summary><ChevronRight className="chev" aria-hidden /> <span><b>How this date is worked out</b><span className="muted">The road, your pace and the skill areas, with what is left out</span></span></summary>
      {road && (
        <ol className="road-line road-compact" aria-label="The road to the offer" style={{ "--road": here === undefined || here < 0 ? 1 : here / Math.max(1, road.length - 1) } as React.CSSProperties}>
          {road.map((m, i) => (
            <li key={m.name} className={m.done ? "done" : i === here ? "here" : ""} aria-current={i === here ? "step" : undefined}>
              <span className="road-dot" aria-hidden>{m.done ? <Check weight="bold" /> : null}</span>
              <span className="road-name">{m.name}{m.when && !m.done && <small className="road-when"> {m.when}</small>}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="path-inner">
        <p className="path-pace-h"><b>{PACE[pace].label} pace, {PACE[pace].evenings} evenings a week</b></p>
        <div className="path-body">
          {ready && <p className="muted">That&apos;s when your {ready.open} open {ready.open === 1 ? "gap closes" : "gaps close"}, at {PACE[pace].evenings} evenings a week. Your CV and portfolio ({proofReady} of {proofAll} ready) are part of them{ready.unknown ? `; ${ready.unknown} ${ready.unknown === 1 ? "isn't" : "aren't"} estimated yet, so it may move` : ""}. It&apos;s when you&apos;ll have the proof to apply strongly, not a promise of an offer: new gaps may open, and hiring depends on openings and replies.</p>}
          {keptReady && <p className="muted">At the {kept % 1 ? kept.toFixed(1) : kept} {kept === 1 ? "evening" : "evenings"} a week you&apos;ve kept over the last two weeks: around <b>{readyDate(keptReady.date)}</b>. Pick the pace you can keep; honest dates beat hopeful ones.</p>}
          <PaceControl s={s} act={act} busy={busy} />
          {live.length > 0 && (
            <div className="pg-groups">
            {(["skill", "reach"] as const).map((tr) => {
              const grp = orderedGaps(live).filter((x) => (x.track ?? "skill") === tr);
              if (!grp.length) return null;
              return (
            <div key={tr} className="pg-group">
            <h3 className="pg-group-h">{tr === "reach" ? "Hiring gaps" : "Skill gaps"}</h3>
            <ol className="path-gaps" aria-label={tr === "reach" ? "Hiring gaps, in the order you work on them" : "Skill gaps, in the order you work on them"}>
              {grp.map((g, i, arr) => {
                const first = i === 0;
                const last = i === arr.length - 1;
                return (
                <li key={g.id}>
                  <span className="pg-title"><button className="pg-open" onClick={() => openGap?.(g.id)}>{g.title}</button></span>
                  <span className="muted">{eta[g.id] ? (eta[g.id]!.late ? lateWords(eta[g.id]!.date) : aroundText(eta[g.id]!.date)) : "not estimated"}<small className="hire-gap-src">{sourceLine(g)}</small></span>
                  <span className="pg-move">
                    <button className="iconbtn" aria-label={`Move up: ${g.title}`} disabled={busy || first} onClick={() => act({ type: "gap.move", id: g.id, dir: "up" }, "Moved up.", { type: "gap.move", id: g.id, dir: "down" })}><ArrowUp aria-hidden /></button>
                    <button className="iconbtn" aria-label={`Move down: ${g.title}`} disabled={busy || last} onClick={() => act({ type: "gap.move", id: g.id, dir: "down" }, "Moved down.", { type: "gap.move", id: g.id, dir: "up" })}><ArrowUp aria-hidden className="flip" /></button>
                  </span>
                </li>
                );
              })}
            </ol>
            </div>
              );
            })}
            </div>
          )}
          <p className="muted pace-note">Skill gaps and hiring gaps run side by side, one task each a night, so their dates interleave. The order within each is yours; Claude works the top ones first. Open a gap to see why it matters and what closes it.</p>
        </div>
      </div>
      {children}
    </details>
  );
}

/** Evenings a week the person has actually worked, from the last two weeks. */
const keptPerWeek = (s: GrowthState) => new Set(s.evidence.entries.filter((e) => e.type !== "ai" && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && daysSince(e.date) < 14).map((e) => e.date)).size / 2;

const aroundText = (iso: string) => `around ${new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

/** The gaps Claude is helping the person close, and what is closing each one: picks, tasks and his own journal notes. */
function GapsPanel({ s, go, openGap }: { s: GrowthState; act?: ActFn; busy?: boolean; go: (v: View) => void; openGap: (id: string) => void }) {
  const gaps = s.library.gaps ?? [];
  const live = orderedGaps(gaps.filter((g) => g.status !== "closed"));
  const closed = gaps.filter((g) => g.status === "closed");
  if (!gaps.length) return null;
  const shown = live.slice(0, 3);
  const rest = live.slice(3);
  const pace: Pace = s.profile.pace ?? "steady";
  const eta = gapForecast(s, pace);
  const notesFor = (id: string) => s.evidence.entries.filter((e) => e.gap === id);
  const picksFor = (id: string) => (s.library.picks ?? []).filter((p) => p.gap === id && p.status !== "skipped");
  const row = (g: (typeof live)[number]) => {
    const notes = notesFor(g.id);
    const picks = picksFor(g.id);
    return (
      <li key={g.id} className="att-3">
        <button className="gap-row" onClick={() => openGap(g.id)}>
          <span className={`gap-dot g-${g.status}`} aria-hidden />
          <span className="gap-main"><b>{g.title}</b><span className="muted">{g.track === "reach" ? "Hiring" : "Skill"} · {eta[g.id] ? (eta[g.id]!.late ? lateWords(eta[g.id]!.date) : `Closes ${aroundText(eta[g.id]!.date)}`) : "No estimate yet"} · {GAP_STATUS[g.status]}{notes.length ? ` · ${notes.length} journal note${notes.length === 1 ? "" : "s"}` : ""}{picks.length ? ` · ${picks.length} pick${picks.length === 1 ? "" : "s"}` : ""}</span></span>
          <ChevronRight className="chev" aria-hidden />
        </button>
      </li>
    );
  };
  return (
    <section className="gaps lib-gaps" aria-labelledby="gaps-h">
      <h2 id="gaps-h" className="lib-label">Gaps you&apos;re closing</h2>
      <p className="muted lib-gaps-note">Most picks point at one of these. {Object.values(eta).some(Boolean) ? <>Dates use your {PACE[pace].label.toLowerCase()} pace. <button className="linkbtn" onClick={() => { go("reach"); setTimeout(() => { const d = document.getElementById("pace-fold") as HTMLDetailsElement | null; if (!d) return; d.open = true; d.scrollIntoView({ block: "start" }); (d.querySelector("summary") as HTMLElement | null)?.focus({ preventScroll: true }); }, 140); }}>Open pace and order on Hiring</button></> : "Claude estimates when each gap closes at your next Sunday review."}</p>
      <ul className="att-list">{shown.map(row)}</ul>
      {rest.length > 0 && (
        <details className="fold att-4">
          <summary><ChevronRight className="chev" aria-hidden /> <span>Show all {live.length} gaps</span></summary>
          <ul className="att-list">{rest.map(row)}</ul>
        </details>
      )}
      {closed.length > 0 && <p className="muted gaps-closed"><Check aria-hidden /> Closed so far: {closed.map((g) => g.title).join("; ")}.</p>}
    </section>
  );
}

export function LibraryView(p: React.ComponentProps<typeof LibraryViewFull>) {
  // Picks kept through a reset are real content: only a library with nothing in it on a blank state is "not started".
  return isBlankSkeleton(p.s) && (p.s.library?.picks ?? []).length === 0 ? <NotStarted icon={<BookOpen />} title="Library" heading="Nothing here yet" label="Nothing here yet" /> : <LibraryViewFull {...p} />;
}

function LibraryViewFull({ s, act, busy, go, openSheet }: { s: GrowthState; act: ActFn; busy: boolean; go: (v: View) => void; openSheet: OpenFn }) {
  const picks = s.library.picks ?? [];
  const tot = (p: Pick) => p.score?.total ?? -1;
  const open = (p: Pick) => p.status === "new" || p.status === "kept";
  const week = picks.filter((p) => p.week_of === s.week.week_of && open(p));
  const earlier = picks.filter((p) => p.week_of < s.week.week_of && open(p) && p.kind !== "news").sort((a, b) => tot(b) - tot(a));
  const skipped = picks.filter((p) => p.week_of === s.week.week_of && p.status === "skipped");
  const done = picks.filter((p) => p.status === "done").sort((a, b) => (b.done ?? "").localeCompare(a.done ?? ""));
  const asked = s.queue.items.some((q) => q.status === "pending" && q.type === "picks");
  const why = [...s.queue.items].reverse().find((q) => q.type === "picks" && q.status === "done" && q.reply)?.reply;
  const lastChecked = week.map((p) => p.checked).filter(Boolean).sort().pop();
  const due = week.filter((p) => checkedText(p).due).length;
  const dayOf = (p: Pick) => { const d = s.week.tasks.find((t) => t.id === p.task)?.day; return d ? DAYS.indexOf(d) : 9; };
  // One order, best first: tied to a task still to do tonight, then scored above the bar, then by score, then nearest to your next task.
  const tonightIds = tonight(s).filter((t) => t.status === "todo").map((t) => t.id);
  const nextTaskIdx = Math.min(...week.filter((p) => p.task && s.week.tasks.find((t) => t.id === p.task)?.status === "todo").map(dayOf), 9);
  const tied = (p: Pick) => (tonightIds.includes(p.task ?? "") ? 1 : 0);
  const bar = (p: Pick) => (p.score && p.score.total >= 65 ? 1 : 0);
  // Scored below the bar is not a pick: it moves to "What I left out".
  const belowBar = week.filter((p) => p.score && p.score.total < 65);
  const ordered = week.filter((p) => !(p.score && p.score.total < 65)).sort((a, b) => tied(b) - tied(a) || bar(b) - bar(a) || tot(b) - tot(a) || Math.abs(dayOf(a) - nextTaskIdx) - Math.abs(dayOf(b) - nextTaskIdx));
  const unscoredN = week.filter((p) => !p.score).length;
  const best = ordered[0];
  const also = ordered.slice(1, 3);
  const rest = ordered.slice(3);
  const MORE_SHOWN = 4;
  const moreRows = rest.slice(0, MORE_SHOWN);
  const moreFold = rest.slice(MORE_SHOWN);
  useEffect(() => {
    const onPick = (e: Event) => {
      const id = String((e as CustomEvent).detail ?? "");
      if (!id) return;
      setTimeout(() => {
        const el = document.getElementById(`pick-${id}`);
        if (!el) return;
        const d = el.closest("details");
        if (d && !d.open) d.open = true;
        el.scrollIntoView({ block: "center" });
        el.focus({ preventScroll: true });
      }, 40);
    };
    window.addEventListener("growth-pick", onPick);
    return () => window.removeEventListener("growth-pick", onPick);
  }, []);
  return (
    <div className="world att-library">
      <PageHead icon={<BookOpen />} title="Library" help="library" label sub={`All optional, and your tasks come first.${week.length > 0 ? ` ${scoredStatement(week.length - unscoredN, week.length)}` : ""}`}
        more={why ? <Prop icon={<Chats />} label="Why these">{why}</Prop> : undefined} />
      {best ? (
        <div className="att-stack">
          <PickCard s={s} p={best} act={act} busy={busy} featured hero={!best.score ? "This week's pick" : tied(best) ? "Best for tonight's task" : "Best fit this week"} />
          {also.length > 0 && (
            <section className={att(2)} aria-labelledby="also-h">
              <h2 id="also-h" className="att-2-title">Also good</h2>
              <ul className="att-list">{also.map((p) => <PickCard key={p.id} s={s} p={p} act={act} busy={busy} featured />)}</ul>
            </section>
          )}
        </div>
      ) : (
        <Hero quiet cmds={asks(s, [LOST])} label="Library" icon={<Newspaper size={16} />} eyebrow="Library"
          title={asked ? "Claude is picking this week's list" : skipped.length ? "You've cleared this week's list" : "Nothing picked for this week yet"}
          act={!asked ? <CmdChip text="update my library" /> : undefined}>
          <p className="att-why">{asked ? `It appears here ${nextRun()}.` : "Claude picks a few things with each Sunday review: a video or two, an article, sometimes a book, and what's new in design. To get them now, say this in Claude Code."}</p>
        </Hero>
      )}
      <details className="fold att-4 lib-more-fold" id="lib-more-fold">
        <summary><ChevronRight className="chev" aria-hidden /> <span><b>More this week{rest.length > 0 ? ` (${rest.length})` : ""}</b><span className="muted">{rest.length > 0 ? "More picks, " : ""}the gaps you are closing, what was left out and your trinkets</span></span></summary>
        {moreRows.length > 0 && (
          <section className="lib-more" aria-label="More this week">
            <ul className="att-list">{moreRows.map((p) => <PickCard key={p.id} s={s} p={p} act={act} busy={busy} />)}</ul>
            {moreFold.length > 0 && (
              <ul className="att-list">{moreFold.map((p) => <PickCard key={p.id} s={s} p={p} act={act} busy={busy} />)}</ul>
            )}
          </section>
        )}
        <GapsPanel s={s} go={go} openGap={(id) => openSheet({ kind: "gap", id })} />
        <TrinketShelf s={s} act={act} busy={busy} />
        <LeftOutFold items={[...(s.library.left_out ?? []), ...belowBar.map((p) => ({ title: p.title, kind: p.kind, url: p.url, total: Math.round(p.score!.total), why_not: "Scored below the bar of 65, so it is not a pick.", checked: p.checked ?? "" }))]} />
      </details>

      <details className="toggle how-fresh att-4">
        <summary><ChevronRight className="chev" aria-hidden /> <span><b>How this list stays current</b><span className="muted">What Claude checks, and how it learns what helps you</span></span></summary>
        <ul className="how-list">
          <li><b>Last checked.</b> {lastChecked ? `Every link and date was checked ${fmtDate(lastChecked)}${due ? `; ${due} ${due === 1 ? "is" : "are"} due for a recheck` : ""}.` : "Not checked yet."}</li>
          <li><b>When you send your Sunday review</b> (say &ldquo;answer it&rdquo; in Claude Code), Claude rebuilds this list from next week&apos;s tasks and the gaps below. It doesn&apos;t change on its own in between. Nothing is picked just because it&apos;s popular.</li>
          <li><b>Every link is opened and every date checked.</b> New work is labelled new. An older piece stays only if it&apos;s still the standard, and the card says why.</li>
          <li><b>Each pick names the gap it moves you toward</b> and the task it goes with, so reading turns into something you make.</li>
          <li><b>&ldquo;New in design&rdquo;</b> covers what changed in the last three months that matters for a product designer, with one small thing to try.</li>
          <li><b>It learns from you.</b> Skips and their reasons, what you finish and what you note down all shape next week&apos;s list. A check older than a month shows as due for a recheck.</li>
        </ul>
        <Recipe
          where="In Claude Code, any time you want a fresh list."
          give={<>Say <CmdChip text="update my library" label="Copy: update my library (recipe)" />. Nothing to attach.</>}
          then="Claude checks every link and date, and rebuilds this list. It takes about 10 to 15 minutes."
          see="New picks appear here."
        />
      </details>

      {skipped.length > 0 && (
        <details className="toggle att-4">
          <summary><ChevronRight className="chev" aria-hidden /> <span><b>Skipped this week ({skipped.length})</b><span className="muted">Bring one back, or tell Claude why so it picks better.</span></span></summary>
          <ul className="skipped-list">{skipped.map((p) => <SkippedRow key={p.id} p={p} act={act} busy={busy} />)}</ul>
        </details>
      )}
      {earlier.length > 0 && (
        <details className="toggle att-4">
          <summary><ChevronRight className="chev" aria-hidden /> <span><b>From earlier weeks ({earlier.length})</b><span className="muted">Still here if you want them. Check the date on each.</span></span></summary>
          <ul className="att-list">{earlier.map((p) => <PickCard key={p.id} s={s} p={p} act={act} busy={busy} />)}</ul>
        </details>
      )}
      {done.length > 0 && (
        <details className="toggle att-4">
          <summary><ChevronRight className="chev" aria-hidden /> <span><b>Finished ({done.length})</b><span className="muted">Newest first.</span></span></summary>
          <ul className="timeline">{done.map((p) => <li key={p.id}><span className="d">{p.done ? fmtDate(p.done) : ""}</span><span><a href={p.url} target="_blank" rel="noreferrer">{p.title}</a>{p.note ? <><br /><span className="muted">{p.note}</span></> : null}</span></li>)}</ul>
        </details>
      )}
    </div>
  );
}

/* ================= talking to Claude ================= */

/** What Claude has learned from the person's answers, in his words and Claude's. */
function KnowsList({ s }: { s: GrowthState }) {
  const known = (s.profile.intake ?? []).filter((q) => q.answer !== null);
  if (!known.length) return null;
  return (
    <ul className="knows">
      {known.map((q) => (
        <li key={q.id}>
          <span className="knows-q">{q.q}</span>
          <b>{q.answer}</b>
          {q.takeaway && <span className="knows-t"><ArrowRight aria-hidden /> {q.takeaway}</span>}
        </li>
      ))}
    </ul>
  );
}


/** Where / Give it / Then / You'll see: the same four short lines wherever the app sends the person to Claude. */
function Recipe({ where = "In Claude Code.", give, then, see }: { where?: React.ReactNode; give: React.ReactNode; then: React.ReactNode; see: React.ReactNode }) {
  return (
    <dl className="recipe">
      <div><dt>Where</dt><dd>{where}</dd></div>
      <div><dt>Give it</dt><dd>{give}</dd></div>
      <div><dt>Then</dt><dd>{then}</dd></div>
      <div><dt>You&apos;ll see</dt><dd>{see}</dd></div>
    </dl>
  );
}

/** Recipe for things written here that Claude picks up later. */
function SendRecipe({ give, see, then }: { give: React.ReactNode; see: React.ReactNode; then?: React.ReactNode }) {
  return (
    <Recipe
      where="Write it here, then go to Claude Code."
      give={give}
      then={then ?? <>Say <CmdChip text="answer it" label="Copy: answer it (send)" />. Claude reads it and replies.</>}
      see={see}
    />
  );
}

function SendHow() { return <>{howToSend()}</>; }
function NextRun() { return <>{nextRun()}</>; }
function ReviewSentHow() {
  return <><CmdChip text="answer it" /><p className="muted">Say that in Claude Code.</p></>;
}

/** A short reference for how the app works, for any night the person wonders. The intro can still be replayed. */
function HowSheet({ s, onReplay, onClose, startOnPhone = false }: { s: GrowthState; onReplay: () => void; onClose: () => void; startOnPhone?: boolean }) {
  const narrow = useNarrow();
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/lan").then((r) => r.json()).then((j) => { if (alive && Array.isArray(j.urls)) setLanUrls(j.urls); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const [copied, setCopied] = useState(false);
  const [onPhone, setOnPhone] = useState(false);
  const [showKey, setShowKey] = useState(false);
  useEffect(() => { setOnPhone(typeof window !== "undefined" && window.location.port === "4322"); }, []);
  const [phoneDevice, setPhoneDevice] = useState(false);
  useEffect(() => { setPhoneDevice(window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 720); }, []);
  const phoneUrl = lanUrls[0];
  const qr = useMemo(() => { try { return phoneUrl ? qrPath(phoneUrl) : null; } catch { return null; } }, [phoneUrl]);
  const copyLink = () => {
    if (!phoneUrl) return;
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(phoneUrl).then(done, () => {}); return; }
    const el = document.getElementById("phone-link");
    if (el) { const r = document.createRange(); r.selectNodeContents(el); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r); }
  };
  const [phoneView, setPhoneView] = useState(startOnPhone);
  // Pairing and the firewall note live in their own sheet, reached from How: How keeps its four jobs.
  if (phoneView) return (
    <Sheet title="Use on another device" sub="Same Wi-Fi. It only needs doing once." onClose={onClose}>
      <div className="how-ref"><section>{phoneUrl ? <>
        <p>Scan this with the other device&apos;s camera. After that it remembers.</p>
        {qr && <svg className="qr" role="img" aria-label="QR code for the link to this app" viewBox={`0 0 ${qr.size} ${qr.size}`}><path d={qr.d} fill="#111" /></svg>}
        <div className="copy-row"><button className="btn" onClick={copyLink}><Copy aria-hidden /> {copied ? "Copied" : "Copy link"}</button><code id="phone-link" className="phone-link">{showKey ? phoneUrl : phoneUrl.replace(/([?&]k=)[^&]+/, "$1••••••••")}</code><button className="linkbtn" onClick={() => setShowKey((v) => !v)}>{showKey ? "Hide" : "Show"}</button></div>
        {lanUrls.length > 1 && <details><summary><span className="muted">Other addresses</span></summary><ul>{lanUrls.slice(1).map((u) => <li key={u}><code className="phone-link">{showKey ? u : u.replace(/([?&]k=)[^&]+/, "$1••••••••")}</code></li>)}</ul></details>}
        <p>The other device can&apos;t open it? Allow Node through Windows Firewall for private networks when Windows asks.</p>
      </> : <p>Your laptop&apos;s address appears here when it&apos;s on Wi-Fi.</p>}</section></div>
      <div><button className="btn" onClick={() => setPhoneView(false)}>Back to how it works</button></div>
    </Sheet>
  );
  return (
    <Sheet title="How the app works" sub={!onPhone && !narrow ? "The short version, and every key." : "The short version."} onClose={onClose}>
      <div className="how-ref">
        <section><h3><Moon aria-hidden /> Tonight</h3><p>A skill task, a job-search task, then one line about how tonight went. Skipping a night costs nothing; what you don&apos;t finish carries over.</p></section>
        <section><h3><CalendarCheck aria-hidden /> Sunday</h3><p>A short review plans next week. Any skill with enough work behind it gets a new estimate from Claude, and may move half a level (Mid to Mid+, for example). A + means halfway to the next level.</p></section>
        <section><h3><Chats aria-hidden /> Commands</h3><p>The app is where you do things. Claude Code is where you talk to Claude, by typing a command. Say <CmdChip text="answer it" label="Copy: answer it (how it works)" /> in Claude Code and Claude reviews your hand-ins and plans each week. While Claude is working the app pauses saving. Setup and every command live on <button className="linkbtn" onClick={openCompanion}>the Commands page</button>.</p></section>
        {!onPhone && !narrow && <section><h3><Keyboard aria-hidden /> Keys</h3><p><KeysText /></p>
          <ul className="how-keys">
            <li><kbd>O</kbd> Opens tonight&apos;s task, so you can start without hunting for it.</li>
            <li><kbd>H</kbd> Hands the task in. Example: you finish a case study draft, press H, add the link.</li>
            <li><kbd>J</kbd> Opens the journal to write one line. Example: after a call, press J and note what you learned.</li>
            <li><kbd>C</kbd> Opens the Commands page, with what to say in Claude Code.</li>
            <li><kbd>1</kbd> to <kbd>6</kbd> Switch pages in the order of the menu.</li>
          </ul>
          <KeysToggle /></section>}
        {!onPhone && !phoneDevice && <details className="fold how-more">
          <summary><ChevronRight className="chev" aria-hidden /> <span><b>Use on another device</b></span></summary>
          <section><p>The app can open on another device on the same Wi-Fi, once you scan a code.</p><button type="button" className="btn" onClick={() => setPhoneView(true)}>Show the code</button></section>
        </details>}
        <details className="fold how-more">
          <summary><ChevronRight className="chev" aria-hidden /> <span><b>More about how this works</b><span className="muted">Numbers, gaps, goal, library, your data</span></span></summary>
        <section><h3><TrendingUp aria-hidden /> Your three numbers</h3><p>Doing the job (how you'd perform day to day), Interview readiness (how you'd come across explaining your work) and CV and portfolio (how a recruiter sees you in the first minute), each out of 100. 70 is lead-ready. They move only when your work is checked, never because of how you feel. Open any number to see what it&apos;s made of.</p></section>
        <section><h3><Clock aria-hidden /> Smaller nights</h3><p>Short on time or energy? Pick 30 or 15 minutes at the top of Tonight. The path shrinks to one task, or one step of it, and the rest moves to your next evening at no cost. Skipping or shrinking a night does not push a date later by itself; Sunday review re-checks every date.</p></section>
        <section><h3><Lightbulb aria-hidden /> Remember this?</h3><p>Before your closing line, Tonight sometimes brings back something you wrote days ago. &ldquo;Still true&rdquo; sends it further out (3, 7, 21, then 60 days), so what you learn sticks.</p></section>
        <section><h3><Target aria-hidden /> Gaps</h3><p>What you don&apos;t know or haven&apos;t done yet that matters for your goal ({(s.library.gaps ?? []).filter((g) => g.status !== "closed").length} open now). Tasks, picks and your journal notes point at them. A gap closes when Claude sees the proof named on it. Each one has a date: Claude estimates the evenings it needs (counting any waiting on other people), and your pace and order turn that into &ldquo;closes around&rdquo;.</p></section>
        <section><h3><TrendingUp aria-hidden /> Your path and pace</h3><p>Hiring shows when you&apos;ll be ready to apply for your goal at your pace: Lighter (3 evenings a week), Steady (5) or Push (6). Change the pace or the order of your gaps there and every date moves. Working on it doesn&apos;t push a date later; waiting on other people does. Claude re-dates things at Sunday review.</p></section>
        <section><h3><PenTool aria-hidden /> Your goal</h3><p>It can change as you do. On Hiring, say how it feels or change it, add a stepping stone if it feels far, and Claude re-plans around it. Every change is kept.</p></section>
        <section><h3><BookOpen aria-hidden /> Library</h3><p>A few optional picks each week, tied to your tasks and gaps, plus what&apos;s new in design. Every link and date is checked when it&apos;s rebuilt with your Sunday review.</p></section>
        <section><h3><RotateCcw aria-hidden /> Your data is safe</h3><p>Everything lives in files on your laptop; the app opens from them. The app keeps good copies as you go, and if anything ever breaks it offers to put the last good copy back.</p></section>
        </details>
      </div>
      <div><button className="btn" onClick={onReplay}>Replay the welcome</button> <ResetHints /></div>
    </Sheet>
  );
}

const FEELINGS: { v: GoalFeeling; label: string; hint: string }[] = [
  { v: "right", label: "Still right", hint: "Keep going. Claude keeps the plan as it is." },
  { v: "too_far", label: "Too far right now", hint: "That's allowed. Add a stepping stone below; Claude plans toward it first, and the big goal stays." },
  { v: "higher", label: "I want to aim higher", hint: "Claude raises the bar on gaps and picks to match." },
  { v: "not_mine", label: "Not what I want any more", hint: "Change the role below. Claude rebuilds your gaps around the new one." },
];

/** The goal is the person's, and it can change as he does. Every change is kept, and Claude re-plans around it. */
function GoalSheet({ s, act, busy, onClose }: { s: GrowthState; act: ActFn; busy: boolean; onClose: () => void }) {
  const ns = s.profile.north_star;
  const [role, setRole] = useState(ns.role);
  const [salary, setSalary] = useState(String(ns.salary_inr_per_month));
  const [feeling, setFeeling] = useState<GoalFeeling>(ns.feeling ?? "right");
  const [note, setNote, clearNote] = useDraft("goal.note", "");
  const [wRole, setWRole] = useState(ns.waypoint?.role ?? "");
  const [wSalary, setWSalary] = useState(ns.waypoint?.salary_inr_per_month ? String(ns.waypoint.salary_inr_per_month) : "");
  const history = [...(s.profile.goal_history ?? [])].reverse();
  const f = FEELINGS.find((x) => x.v === feeling)!;
  const sal = Number(salary.replace(/[^0-9]/g, ""));
  const changed = role.trim() !== ns.role || sal !== ns.salary_inr_per_month || feeling !== (ns.feeling ?? "right") || wRole.trim() !== (ns.waypoint?.role ?? "") || !!note.trim();
  // Saying "still right" is worth recording too: it's a check-in, and Claude keeps the plan.
  const checkIn = !changed && feeling === "right";
  const ok = role.trim() && sal > 0 && (changed || checkIn);
  return (
    <Sheet title="Your goal" sub="Yours to change" onClose={onClose}>
      <p className="muted sheet-lead">It&apos;s yours, and it can change as you do. Claude re-plans around it.</p>
      <div className="field">
        <span>How does this goal feel right now?</span>
        <div className="seg seg-wrap" role="radiogroup" aria-label="How the goal feels">
          {FEELINGS.map((x) => <label key={x.v}><input type="radio" name="feeling" checked={feeling === x.v} onChange={() => setFeeling(x.v)} /><span>{x.label}</span></label>)}
        </div>
        <p className="muted">{f.hint}</p>
      </div>
      <label className="field"><span>The role you&apos;re aiming for</span><textarea className="short" rows={Math.max(2, Math.ceil(role.length / 60))} value={role} onChange={(e) => setRole(e.target.value)} /></label>
      <label className="field"><span>Monthly salary ({curOf(s)})</span><input type="text" inputMode="numeric" value={salary ? Number(salary.replace(/[^0-9]/g, "")).toLocaleString(curOf(s) === "INR" ? "en-IN" : "en-US") : ""} onChange={(e) => setSalary(e.target.value.replace(/[^0-9]/g, ""))} /></label>
      {((feeling !== "right" && feeling !== "higher") || wRole) && (
        <div className="two">
          <label className="field"><span>A stepping stone first (optional)</span><input type="text" value={wRole} onChange={(e) => setWRole(e.target.value)} placeholder="e.g. Product Designer, fintech" /></label>
          <label className="field"><span>Its monthly salary ({curOf(s)}, optional)</span><input type="text" inputMode="numeric" value={wSalary} onChange={(e) => setWSalary(e.target.value)} /></label>
        </div>
      )}
      <label className="field"><span>Anything behind it? (optional)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed, in your own words." /></label>
      {history.length > 0 && (
        <details className="toggle">
          <summary><ChevronRight className="chev" aria-hidden /> <span><b>How your goal has moved</b><span className="muted">{history.length} change{history.length === 1 ? "" : "s"}</span></span></summary>
          <ul className="timeline">{history.map((h, i) => <li key={i}><span className="d">{fmtDate(h.date)}</span><span>{h.role}, {moneyOf(s, h.salary_inr_per_month, true)}{h.waypoint ? `; first: ${h.waypoint}` : ""}{h.feeling ? <span className="muted"> · {FEELINGS.find((x) => x.v === h.feeling)?.label}</span> : null}{h.note ? <><br /><span className="muted">{h.note}</span></> : null}</span></li>)}</ul>
        </details>
      )}
      {feeling !== "right" && <RecipeOnce id="goal"><SendRecipe give="Nothing to attach. Your answers above are the whole message." see="Your gaps and next week re-planned here." /></RecipeOnce>}
      <div className="sheet-actions">
        <p className="finish-hint">{!role.trim() || !(sal > 0) ? "Add the role and a monthly salary to save." : checkIn ? "Noted as a check-in. The plan stays as it is." : `${moneyOf(s, sal)}. Nothing about your progress is lost; your gaps and next week get re-planned.${(() => { const r = readyBy(s, s.profile.pace ?? "steady"); return r ? ` ${r.status === "late" ? `Late (it was due around ${readyDate(r.date)})` : `Ready around ${readyDate(r.date)}`} now; Claude re-dates it when it re-plans.` : ""; })()}`}</p>
        <button className="btn btn-signal" disabled={!ok || busy} onClick={async () => {
          if (await act({ type: "goal.set", role, salary: sal, feeling, note, waypoint: wRole.trim() ? { role: wRole, salary: Number(wSalary.replace(/[^0-9]/g, "")) || undefined } : null }, savedLine())) { clearNote(); onClose(); }
        }}><Check /> {checkIn ? "Yes, it still feels right" : "Save my goal"}</button>
      </div>
    </Sheet>
  );
}


/** Spaced recall: once an evening, one thing the person wrote down days ago comes back. Each "still true" pushes it further out. */
const RecallCtx = createContext<(b: boolean) => void>(() => undefined);
function RecallSlot({ onAdding, children }: { onAdding: (b: boolean) => void; children: React.ReactNode }) {
  return <RecallCtx.Provider value={onAdding}>{children}</RecallCtx.Provider>;
}

function Recall({ s, act, busy, go }: { s: GrowthState; act: ActFn; busy: boolean; go: (v: View) => void }) {
  const tellCard = useContext(RecallCtx);
  const [item, setItem] = useState<{ e: Evidence; days: number } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [more, setMore, clearMore] = useDraft("recall.more", "");
  useEffect(() => {
    const today = localToday();
    if (store.get("growth.recall.shown") === today || Object.values(s.profile.recall ?? {}).some((r) => r.last === today)) { setItem(null); return; }
    const candidates = s.evidence.entries.filter((e) => e.type === "note" && e.tag !== "tonight" && e.detail && /^\d{4}-\d{2}-\d{2}$/.test(e.date));
    // Due when it's at least its interval old: 3 days, then 7, 21, 60 as it keeps sticking.
    const due = candidates.map((e) => {
      const step = s.profile.recall?.[e.id]?.step ?? 0;
      const need = [3, 7, 21, 60][Math.min(step, 3)];
      return { e, days: daysSince(e.date), need, step };
    }).filter((x) => x.days >= x.need && x.step < 4).sort((a, b) => a.step - b.step || b.days - a.days)[0];
    setItem(due ? { e: due.e, days: due.days } : null);
  }, [s.evidence.entries]);
  const finish = (msg: string) => { store.set("growth.recall.shown", localToday()); setDone(msg); setAdding(false); tellCard(false); if (msg.startsWith("Added")) clearMore(); };
  if (done) return <p className="recall recall-done" role="status"><Check aria-hidden /> {done}</p>;
  if (adding && item) return (
    <section className="recall" aria-label="Add to what you wrote">
      <p className="recall-q"><Lightbulb aria-hidden /> <span>{item.e.detail.length > 140 ? `${item.e.detail.slice(0, 140).trimEnd()}…` : item.e.detail}</span></p>
      <label className="field"><span>What you&apos;d add now</span><textarea autoFocus className="short" value={more} onChange={(e) => setMore(e.target.value)} placeholder="What you know now that you didn't then." /></label>
      <div className="recall-actions">
        <button className="btn btn-sm btn-signal" disabled={!more.trim() || busy} onClick={async () => { if (await act({ type: "log", kind: "note", text: more, competency: item.e.competency, gap: item.e.gap, recall: item.e.id })) finish("Added to your journal. It comes back later, further apart."); }}>Save the addition</button>
        <button className="linkbtn" onClick={() => { setAdding(false); tellCard(false); setTimeout(() => document.getElementById("recall-add")?.focus(), 40); }}>Cancel</button>
      </div>
    </section>
  );
  if (!item) return null;
  const step = s.profile.recall?.[item.e.id]?.step ?? 0;
  return (
    <section className="recall" aria-label="Remember this?">
      <p className="recall-q"><Lightbulb aria-hidden /> <span><b>Before you write, remember this?</b> {item.days} days ago you wrote:</span></p>
      <blockquote>{item.e.detail.length > 240 ? `${item.e.detail.slice(0, 240).trimEnd()}…` : item.e.detail}</blockquote>
      <div className="recall-actions">
        <button className="btn btn-sm" disabled={busy} onClick={async () => { if (await act({ type: "recall.mark", id: item.e.id, kept: true })) finish("Good. It comes back later, further apart each time."); }}>Still true</button>
        <button id="recall-add" className="linkbtn" onClick={() => { setAdding(true); tellCard(true); }}>I&apos;d add to it</button>
        <button className="linkbtn" onClick={() => { finish("Okay. It'll come back another night."); setTimeout(() => document.getElementById("reflect-text")?.focus(), 30); }}>Not tonight</button>
      </div>
    </section>
  );
}

/** At the start of a week: what last week added up to, in counts. Shown once. */
function WeekRecap({ s }: { s: GrowthState }) {
  const [show, setShow] = useState(false);
  const start = addDays(s.week.week_of, -7);
  const end = addDays(s.week.week_of, -1);
  const last = s.evidence.entries.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date >= start && e.date <= end);
  useEffect(() => { setShow(last.length > 0 && store.get("growth.recap.seen") !== s.week.week_of); }, [last.length, s.week.week_of]);
  if (!show) return null;
  const handed = last.filter((e) => (e.type === "self" || e.type === "shipped") && (e.points ?? 0) > 0 && e.tag !== "tonight").length;
  const evenings = new Set(last.map((e) => e.date)).size;
  const notes = last.filter((e) => e.type === "note" && e.tag !== "tonight").length;
  const reviews = last.filter((e) => e.type === "ai").length;
  const towardGaps = new Set(last.filter((e) => e.gap).map((e) => e.gap)).size;
  const items = [
    [handed, handed === 1 ? "thing finished" : "things finished"],
    [evenings, evenings === 1 ? "evening worked" : "evenings worked"],
    [notes, notes === 1 ? "note written" : "notes written"],
    [reviews, reviews === 1 ? "review from Claude" : "reviews from Claude"],
    [towardGaps, towardGaps === 1 ? "gap worked on" : "gaps worked on"],
  ].filter(([n]) => (n as number) > 0) as [number, string][];
  return (
    <section className="recap" aria-label="Last week">
      <div>
        <p className="recap-h"><b>Last week, in counts</b> <span className="muted">{fmtDate(start)} to {fmtDate(end)}</span></p>
        <ul className="recap-list">{items.map(([n, l]) => <li key={l}><b>{n}</b> {l}</li>)}</ul>
      </div>
      <button className="btn btn-sm" onClick={() => { store.set("growth.recap.seen", s.week.week_of); setShow(false); }}>Got it</button>
    </section>
  );
}

/** One gap, in full: why it matters, what closes it, when, and what has gone toward it. */
function GapSheet({ s, id, onClose }: { s: GrowthState; id: string; onClose: () => void }) {
  const g = (s.library.gaps ?? []).find((x) => x.id === id);
  if (!g) return <Sheet title="Gap not found" onClose={onClose}><p className="muted">It may have been closed or renamed.</p></Sheet>;
  const pace: Pace = s.profile.pace ?? "steady";
  const eta = gapForecast(s, pace)[g.id];
  const notes = s.evidence.entries.filter((e) => e.gap === g.id).slice(-5).reverse();
  const picks = (s.library.picks ?? []).filter((p) => p.gap === g.id && p.status !== "skipped");
  return (
    <Sheet title={g.title} sub={`${skillShort(s, g.competency)} · ${g.track === "reach" ? "Hiring" : "Skill"} · ${GAP_STATUS[g.status]}`} onClose={onClose}>
      <p>{g.why}</p>
      <dl className="props">
        <Prop icon={<Check />} label={g.status === "closing" ? "What's left" : "Closed when"}>{g.closes_when}</Prop>
        <Prop icon={<Clock />} label="When">{eta ? (eta.late ? `${lateWords(eta.date)}, from ${g.estimated ? fmtDate(g.estimated) : "its last check"}. Sunday review re-dates it.` : <>{aroundText(eta.date)} at your {PACE[pace].label.toLowerCase()} pace, about {eta.evenings} {eta.evenings === 1 ? "evening" : "evenings"} of work left{(() => { const k = keptPerWeek(s); const kk = k > 0 && k < PACE[pace].evenings / 2 ? gapForecast(s, pace, { perWeek: k })[g.id] : null; return kk ? <>; {aroundText(kk.date)} at your recent pace</> : null; })()}.</>) : "Not estimated yet; Claude dates it at your next Sunday review."}</Prop>
        {g.now && <Prop icon={<Chats />} label="Claude">{g.now}</Prop>}
        <Prop icon={<Notebook />} label="Based on">{g.source}</Prop>
      </dl>
      {picks.length > 0 && <div><h3>In your Library for it</h3><ul className="timeline">{picks.map((p) => <li key={p.id}><span className="d">{PICK_KIND[p.kind].label}</span><span><a href={p.url} target="_blank" rel="noreferrer">{p.title}</a></span></li>)}</ul></div>}
      <div><h3>What you&apos;ve put toward it</h3>{notes.length ? <ul className="timeline">{notes.map((e) => <li key={e.id}><span className="d">{fmtDate(e.date)}</span><span>{e.detail || e.title}</span></li>)}</ul> : <p className="muted">Nothing yet. In the journal, choose this gap under Learned or Made and it counts here.</p>}</div>
    </Sheet>
  );
}

/** A spare few minutes, away from the desk: what can be done on the phone right now. Shown as one quiet list. */
function FewMinutes({ s, open, go, attn }: { s: GrowthState; open: OpenFn; go: (v: View) => void; attn: AttentionItem[] }) {
  const narrow = useNarrow();
  const [expanded, setExpanded] = useState(false);
  const [onPhonePort, setOnPhonePort] = useState(false);
  useEffect(() => { setOnPhonePort(window.location.port === "4322"); }, []);
  useEffect(() => { if (expanded) document.getElementById("few-h")?.focus(); }, [expanded]);
  const tonightIds = tonight(s).map((x) => x.id);
  const phoneTask = s.week.tasks.find((x) => x.where === "phone" && x.status === "todo" && !tonightIds.includes(x.id) && x.steps.some((_, k) => !doneSteps(s, x).has(k)));
  const phoneStep = phoneTask ? phoneTask.steps[phoneTask.steps.findIndex((_, k) => !doneSteps(s, phoneTask).has(k))] : "";
  const phonePick = (s.library.picks ?? []).find((p) => p.week_of === s.week.week_of && (p.status === "new" || p.status === "kept") && ((p.kind === "video" || p.kind === "podcast") ? (p.minutes ?? 99) <= 12 : p.kind === "news"));
  const items: { key: string; label: React.ReactNode; onClick: () => void }[] = [];
  if (phoneTask) items.push({ key: "task", label: <>{phoneTask.task} <span className="muted few-meta">first step: {phoneStep}</span></>, onClick: () => open({ kind: "quest", id: phoneTask.id }) });
  if (phonePick) items.push({ key: "pick", label: <>{PICK_KIND[phonePick.kind].verb}: {phonePick.title} {lengthText(phonePick) ? <span className="muted few-meta">{lengthText(phonePick)}</span> : null}</>, onClick: () => { go("library"); setTimeout(() => window.dispatchEvent(new CustomEvent("growth-pick", { detail: phonePick.id })), 80); } });
  if (!items.length) return null;
  const compact = !narrow && !onPhonePort;
  const list = <ul>{items.slice(0, 4).map((x) => <li key={x.key}><button className="linkbtn few-item" onClick={x.onClick}><span className="few-label">{x.label}</span></button></li>)}</ul>;
  if (compact) {
    const n = Math.min(items.length, 4);
    return (
      <section className={`few${expanded ? "" : " few-quiet"}`} aria-label="Short things for a spare few minutes">
        {expanded
          ? <><div className="few-head"><h2 id="few-h" tabIndex={-1}><Phone aria-hidden /> Got a few minutes?</h2><button className="linkbtn" onClick={() => setExpanded(false)} aria-expanded>Hide</button></div>{list}<p className="few-open"><button type="button" className="linkbtn" onClick={() => { try { window.dispatchEvent(new Event("growth-phone")); } catch {} }}>Use on another device</button></p></>
          : <><button className="few-toggle" onClick={() => setExpanded(true)} aria-expanded={false}><Phone aria-hidden /><span>{n} short thing{n === 1 ? "" : "s"} for a spare few minutes</span><ChevronRight aria-hidden /></button><button type="button" className="linkbtn few-open" onClick={() => { try { window.dispatchEvent(new Event("growth-phone")); } catch {} }}>Use on another device</button></>}
      </section>
    );
  }
  return (
    <section className="few" aria-labelledby="few-h">
      <h2 id="few-h"><Phone aria-hidden /> Got a few minutes?</h2>
      {list}
    </section>
  );
}
