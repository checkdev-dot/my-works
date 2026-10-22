"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { att, fmtDate } from "./ui";
import { HelpButton, type StateAbout } from "./HelpButton";
import { CmdChip } from "./CommandHint";
import { placeholderList } from "@/lib/career-needs.mjs";
import type { CareerData, CvVersion } from "@/lib/types";

/* "Your CV" on the Hiring page. Reads `career` from the app state (optional: a missing file is the empty state).
   One status line, one command chip, the facts still needed under it. Everything else is a quiet row. */

/* ---------- placeholders ---------- */

const NEED_RE = /\[(NEEDS REAL NUMBER|NEEDS):\s*([^\]]*)\]/g;

export type Need = { kind: "number" | "fact"; what: string; where?: string };

/** The missing facts in a piece of text, in plain words. */
export function needsIn(text: string | undefined, where?: string): Need[] {
  const out: Need[] = [];
  if (!text) return out;
  for (const m of text.matchAll(NEED_RE)) out.push({ kind: m[1] === "NEEDS" ? "fact" : "number", what: m[2].trim().replace(/\s+/g, " "), where });
  return out;
}

/** A path from the engine ("v2/experience/exp-a/b3", "v2/header.email", "v2/links/ln-1/heading") in plain words. */
function whereIn(v: CvVersion, path: string, paren = false): string {
  const top = "Top of the page";
  const parts = path.split("/").slice(1); // the first part is the version id
  const one = parts[0] ?? "";
  if (parts.length === 1) {
    if (one === "why") return "The reason for this version";
    if (one === "target.company") return "The company this was made for";
    if (one === "target.role") return "The role this was made for";
    const h = /^header\.(name|title|location|email)$/.exec(one);
    if (h) return `${top}, ${h[1] === "title" ? "job title" : h[1]}`;
    const l = /^header\.links\[(\d+)\]\.(label|url)$/.exec(one);
    if (l) { const lk = v.header?.links?.[Number(l[1])]; return `${top}, ${l[2] === "label" ? "link name" : `link${lk?.label && !needsIn(lk.label).length ? ` ${lk.label}` : ""}`}`; }
    return top;
  }
  const sec = (v.sections ?? []).find((s) => s.id === parts[0]);
  if (!sec) return "Your CV";
  const secName = sec.title && !needsIn(sec.title).length ? sec.title : "A section";
  if (parts.length === 2) return "A section title";
  const it = (sec.items ?? []).find((x) => x.id === parts[1]);
  const itName = it?.heading && !needsIn(it.heading).length ? it.heading : "";
  const at = itName ? (paren ? `${itName} (${secName})` : `${itName} in ${secName}`) : secName;
  if (parts[2] === "heading") return `${secName}, ${sec.kind === "links" ? "link" : "heading"}`;
  if (parts[2] === "sub") return `${at}, sub line`;
  if (parts[2] === "dates") return `${at}, dates`;
  return at;
}

/** Every missing fact in the version, from the engine's own slots (lib/career-needs.mjs placeholderList), so the count is the engine's count. Each names where it is. */
export function versionNeeds(v: CvVersion | undefined): Need[] {
  if (!v) return [];
  return placeholderList(v).map((p) => {
    const m = needsIn(p.placeholder)[0];
    return { kind: m?.kind ?? "fact", what: m?.what ?? p.placeholder, where: whereIn(v, p.where) };
  });
}

/** Text with each [NEEDS ...] shown as a highlighted note, the same way on every surface. */
export function Marked({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(NEED_RE)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(<mark key={i++} className="need">Still needed: {m[2].trim().replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase())}</mark>);
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/* ---------- the one next step ---------- */

/** The version the panel opens on: the one marked current in your career notes, else the newest. */
export function currentVersion(career?: CareerData | null): CvVersion | undefined {
  const vs = career?.cv?.versions ?? [];
  return vs.find((v) => v.id === career?.cv?.current) ?? vs[vs.length - 1];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const FILL = "fill in my CV";
type Step = { phrase: string; hint: string };
type CvState = "fill" | "export" | "promote" | "tailor";

/** The status line and the ONE command that follows from it. The same state drives both, so they cannot disagree. */
function statusFor(v: CvVersion, needs: number): { text: string; tone: "ok" | "todo" | "idle"; ask?: string; step: Step; fix?: string; count: number; state: CvState; problems: boolean } {
  const h = v.checks?.honesty;
  // problems already name the numbers, so never add them up
  const bad = h ? (h.problems?.length || h.unsourced_numbers.length + h.deny_hits.length) : 0;
  const count = needs > 0 ? needs : (h?.placeholders ?? 0);
  // Lines that rest on what the person said in chat still go out; the panel adds "N lines are your word" to this status, as its expander.
  const ready = "Ready to send";
  if (h && (!h.pass || bad > 0)) {
    const n = bad || 1;
    const denies = h.deny_hits?.length ?? 0;
    const probs = h.problems ?? [];
    const fix = "The PDF waits until then.";
    if (denies > 0) return { text: `${plural(denies, "line has", "lines have")} something to take out`, tone: "todo", count, state: "fill", problems: true, ask: "Something to take out?", step: { phrase: FILL, hint: "Claude asks which words to take out." }, fix };
    if (probs.length > 0 && probs.every((p) => /\/header[.[]/.test(p))) return { text: "Your contact line needs a fix", tone: "todo", count, state: "fill", problems: true, ask: "Contact line wrong?", step: { phrase: FILL, hint: "Claude checks it against your career notes." }, fix };
    // "Or say take that line out" lives in the (?) recipe, not in prose.
    return { text: `${plural(n, "line needs", "lines need")} a source`, tone: "todo", count, state: "fill", problems: true, ask: "Number has no source?", step: { phrase: FILL, hint: "Claude asks where the number comes from." }, fix };
  }
  if (count > 0) return { text: `${plural(count, "fact", "facts")} away from a CV you can send`, tone: "todo", count, state: "fill", problems: false, step: { phrase: FILL, hint: "Claude asks for these one at a time." } };
  if (!v.pdf) return { text: h ? ready : "Not checked yet", tone: h ? "ok" : "idle", count, state: "export", problems: false, step: { phrase: "save my CV as a PDF", hint: "Claude saves a PDF in your Growth folder." } };
  if (!v.promoted) return { text: ready, tone: "ok", count, state: "promote", problems: false, step: { phrase: "use this CV", hint: "Makes this the CV in your Growth folder." } };
  return { text: ready, tone: "ok", count, state: "tailor", problems: false, step: { phrase: "tailor my CV for this job", hint: "Paste a job post to make a version for it." } };
}

/** The page's one command (the strip at the top of Hiring): build first, then whatever the shown CV needs next. */
export function cvPhrase(career?: CareerData | null): string {
  const v = currentVersion(career);
  if (!v) return "build my CV";
  return statusFor(v, versionNeeds(v).length).step.phrase;
}

/** How many facts the shown CV still needs, or null when there is no CV. */
export function cvFactCount(career?: CareerData | null): number | null {
  const v = currentVersion(career);
  return v ? statusFor(v, versionNeeds(v).length).count : null;
}

/** The state of the CV that Hiring shows: "none" when there is no CV yet. One pure read, used by the panel, the hero and the fixtures, so they cannot disagree. */
export function cvState(career?: CareerData | null): CvState | "none" {
  const v = currentVersion(career);
  return v ? statusFor(v, versionNeeds(v).length).state : "none";
}

/** The hero's question and the plain phrase that answers it, for the CV state. Never "build my CV" once a version exists. */
export function cvAsk(career?: CareerData | null): { ask: string; say: string } {
  return askFor(cvState(career));
}

/** The question and the phrase for one CV state, the same pattern as the hero. */
function askFor(state: CvState | "none"): { ask: string; say: string } {
  switch (state) {
    case "none": return { ask: "Need a CV?", say: "build my CV" };
    case "fill": return { ask: "Missing a fact?", say: "fill in my CV" };
    case "export": return { ask: "Want the PDF?", say: "save my CV as a PDF" };
    case "promote": return { ask: "Happy with it?", say: "use this CV" };
    default: return { ask: "Applying somewhere?", say: "tailor my CV for this job" };
  }
}

/** The CV's next step as a task name, for the hero button. Null when there is no CV or nothing is left to do but tailor. */
export function cvStepTask(career?: CareerData | null): string | null {
  switch (cvState(career)) {
    case "fill": return "Add the missing facts to your CV";
    case "export": return "Save your CV as a PDF";
    case "promote": return "Make this version your CV file";
    default: return null;
  }
}

/** The hero button's label: what happens when it is pressed (it takes you to the Your CV card). Null when the hero should not point at the card. */
export function cvShowLabel(career?: CareerData | null): string | null {
  const v = currentVersion(career);
  if (!v) return null;
  const needs = versionNeeds(v).length;
  const st = statusFor(v, needs);
  if (st.state === "fill") return needs > 0 ? `Show the ${needs === 1 ? "CV fact" : `${needs} CV facts`}` : "Show the lines that need a source";
  if (st.state === "export" || st.state === "promote") return "Show your CV";
  return null;
}

/** Scrolls to the Your CV card and puts focus on its heading. */
export function showCvCard() {
  const h = document.getElementById("cv-h");
  if (!h) return;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  h.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
  h.focus({ preventScroll: true });
}

/** The "?" and "How this works" for Your CV, from the state the CV is in: no CV, facts to fill, ready to export, ready to promote, ready to tailor. */
export function cvHelp(state: CvState | "empty", count = 0, problems = false): StateAbout & { recipe: { where: string; give: string; then: string; see: string } } {
  const title = "About Your CV";
  const where = "In Claude Code.";
  switch (state) {
    case "empty": return {
      title, say: "build my CV",
      lines: ["There is no CV in the app yet.", "Claude builds the first one from your interview answers, your career notes and your evidence.", "Every line gets a source. What Claude cannot source is marked as still needed."],
      recipe: { where, give: "Nothing to prepare. If a fact is missing, Claude asks you one question at a time.", then: "Claude builds your first CV and checks that every fact has a source.", see: "Here, under Your CV, with the facts still needed listed." },
    };
    case "fill": return {
      title, say: "fill in my CV",
      lines: problems
        ? ["A line has a number or a quote that Claude cannot find a source for.", "Claude asks where each one comes from, or takes the line out.", "The PDF waits until every line has a source."]
        : [`${plural(count, "fact is", "facts are")} still needed before this CV can be sent. They are listed under the status.`, "Claude asks for them one at a time and saves each answer with its source.", "Until they are in, a PDF is marked as a draft."],
      recipe: problems
        ? { where, give: "Where each line comes from, or say “take that line out”.", then: "Claude puts the fix into one new version. The earlier version stays as it was.", see: "Here: the list of lines that need a source gets shorter." }
        : { where, give: "A short answer to each question, or “skip”.", then: "Claude saves each answer in your words as evidence and puts all of them into one new version. The earlier version stays as it was. Skipped facts stay marked.", see: "Here: the facts still needed shrink, and the status changes when none are left." },
    };
    case "export": return {
      title, say: "save my CV as a PDF",
      lines: ["Every fact has a source and none are missing.", "Next is a PDF you can send, saved in your Growth folder."],
      recipe: { where, give: "Nothing, or the version you want.", then: "Claude saves a PDF of this version in cv/drafts.", see: "In Claude Code with the file path. Here, the status moves on to making it your CV file." },
    };
    case "promote": return {
      title, say: "use this CV",
      lines: ["This version is ready and has a PDF.", "Making it your CV file keeps a copy of the current one first, so you can undo it."],
      recipe: { where, give: "Say “use this CV”, and name the version if there is more than one.", then: "Claude copies your current CV to cv/drafts/_replaced, then makes this version the CV in your Growth folder. To take it back, ask Claude to undo the last promote.", see: "In Claude Code first. Here, that version shows as the one in use." },
    };
    default: return {
      title, say: "tailor my CV for this job",
      lines: ["This version is your CV file and is ready to send.", "To apply for one job, paste its post and Claude makes a version for it.", "A match number for a job is an AI estimate, not a measurement."],
      recipe: { where, give: "The job post: its text or its link. Add the company and the role if they are not in it.", then: "Claude makes a new version for that job. It reorders and rewords what is true, and adds no skill and no number.", see: "Here, as a new version with the job named." },
    };
  }
}

/** Where, what to give, what happens, where to look. The same four lines the other pages use. */
export function RecipeList({ r }: { r: { where: string; give: string; then: string; see: string } }) {
  return (
    <dl className="recipe">
      <div><dt>Where</dt><dd>{r.where}</dd></div>
      <div><dt>Give it</dt><dd>{r.give}</dd></div>
      <div><dt>Then</dt><dd>{r.then}</dd></div>
      <div><dt>You&apos;ll see</dt><dd>{r.see}</dd></div>
    </dl>
  );
}

/** "22 Oct" from a date or an ISO time. */
function shortDate(d?: string): string {
  if (!d) return "";
  return fmtDate(d.slice(0, 10)).replace(/\s+\d{4}$/, "");
}

/** The role of a version, from its own state: "working draft" only while facts are missing or the honesty check fails; "ready, not yet your CV file" when it passes but is not promoted;
    "your CV file" when promoted. A tailored version names its company: "ready, for Acme Pay". */
function versionRole(v: CvVersion): string {
  const st = statusFor(v, versionNeeds(v).length);
  const who = v.target?.company || v.target?.role || "";
  const base = st.state === "fill" ? "working draft" : v.promoted ? "your CV file" : "ready";
  if (who) return `${base}, for ${who}`;
  return base === "ready" ? "ready, not yet your CV file" : base;
}
/** Label for the picker and the reader: "v2 · ready, for Acme Pay". */
function versionLabel(v: CvVersion) {
  return `${v.id} · ${versionRole(v)}`;
}

/** The version that is saved as the CV file in the Growth folder, if one was promoted. */
function promotedVersion(versions: CvVersion[]): CvVersion | undefined {
  return [...versions].reverse().find((x) => !!x.promoted);
}

/** One line of the CV that is worth a second look, with the reasons it is on the list. A line named twice (it rests on chat AND its wording differs) is one entry with two tags. */
type Check = { text: string; where: string; tags: string[]; note?: string };
const TAG_CHAT = "from what you told Claude";
const TAG_WORDING = "Your CV words this differently from your notes";
const CHECK_ACTION = "Say yes in Claude Code, or tell it what changed.";

/** The line at a path from the engine ("v2/section/item/bullet" for a line, "v2/section/item" for an item's own source): its actual text and where it sits. */
function lineAt(v: CvVersion, raw: string): { text: string; where: string; kind?: string } | null {
  let parts = raw.split("/");
  if (parts[0] === v.id) parts = parts.slice(1);
  const [sid, iid, bid] = parts;
  const sec = (v.sections ?? []).find((s) => s.id === sid);
  const it = sec?.items?.find((x) => x.id === iid);
  if (sec && it && bid) {
    const b = it.bullets?.find((x) => x.id === bid);
    if (b) return { text: b.text, where: [it.heading, sec.title].filter(Boolean).join(", "), kind: sec.kind };
  } else if (sec && it) {
    const lines = (it.bullets ?? []).map((x) => x.text).filter(Boolean).join(" ");
    return { text: lines || it.sub || it.heading || `A line in ${sec.title}`, where: [lines ? it.heading : "", sec.title].filter(Boolean).join(", "), kind: sec.kind };
  } else if (sid?.startsWith("header")) return { text: "Your contact line", where: "Top of the page" };
  return null;
}

const SKILLS_WARN = /^Only d+ of the d+ skills/;
/** The skills-line warning in plain words. */
function warnNote(msg: string): string {
  const m = /only (\d+) of (\d+) key words in this skills line/i.exec(msg);
  if (m) { const rest = Number(m[2]) - Number(m[1]); return `Only ${m[1]} of the ${m[2]} skills here ${m[1] === "1" ? "appears" : "appear"} in your notes. Tell Claude which of the other ${rest} you have used.`; }
  return msg.replace(/^\S+?: /, "");
}

/** Every line to double check, once each: what rests on chat and what the check flagged as worded differently from your notes, with its reasons and its real text. */
function checkLines(v: CvVersion): Check[] {
  const out = new Map<string, Check>();
  const add = (path: string, tag: string, note?: string) => {
    const at = lineAt(v, path.replace(/^(\S+?): [\s\S]*$/, "$1"));
    const key = at ? `${at.where}|${at.text}` : path;
    const e = out.get(key) ?? { text: at?.text ?? "A line that is no longer in this version", where: at?.where ?? "", tags: [] };
    if (!e.tags.includes(tag)) e.tags.push(tag);
    // The skills note (which words are not in your notes) belongs to skills lines only.
    if (note && !e.note && at?.kind === "skills") e.note = note;
    out.set(key, e);
  };
  for (const raw of v.checks?.honesty?.dev_sources ?? []) add(String(raw), TAG_CHAT);
  for (const w of v.checks?.honesty?.warnings ?? []) add(w, TAG_WORDING, SKILLS_WARN.test(warnNote(w)) ? warnNote(w) : undefined);
  return [...out.values()];
}

/* ---------- a quiet row that opens ---------- */

/** One disclosure row, the same everywhere on this page: a chevron that turns, a hover, a focus ring, aria-expanded. Case cards use the same look. */
export function Disclose({ summary, children, className, under }: { summary: React.ReactNode; children: React.ReactNode; className?: string; /** Plain text kept visible under the row while it is closed or open. */ under?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`cv-more${className ? ` ${className}` : ""}${open ? " is-open" : ""}`}>
      <button type="button" className="cv-more-btn" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)}>
        <ChevronRight className="case-chev" aria-hidden />
        <span className="cv-more-label">{summary}</span>
      </button>
      {under}
      {open && <div id={id} className="cv-more-body">{children}</div>}
    </div>
  );
}

/* ---------- the preview ---------- */

const A4_W = 794; // 210mm at 96dpi
const A4_H = 1123; // 297mm at 96dpi

/** What the preview and the reader look for when the CV is not ready: a flagged line (its text), else the first fact still needed. */
type Focus = { text?: string } | null;

/** The first line that needs attention, measured in the page's own pixels (true size): its top and its height. Null when the page has no such line. */
function findGap(doc: Document | null | undefined, focus: Focus | undefined): { top: number; height: number } | null {
  if (!doc || !focus) return null;
  const snip = (focus.text ?? "").replace(/s+/g, " ").trim().slice(0, 40);
  const lines = Array.from(doc.querySelectorAll("li, p, .job-head, .job-sub"));
  const hit = (snip ? lines.find((e) => (e.textContent ?? "").replace(/s+/g, " ").includes(snip)) : null) ?? doc.querySelector(".need")?.closest("li, p, .job-head, .job-sub, .skills, .early") ?? null;
  if (!hit) return null;
  const r = hit.getBoundingClientRect();
  return { top: Math.round(r.top + (doc.defaultView?.scrollY ?? 0)), height: Math.round(r.height) };
}

/** The CV page at real size, scaled to the column (never above true size). `crop` shows only the top of the page, so the name is always in view; when the first gap is
    lower than the crop reaches, `onGap` says so and the reader can jump to it. The page is rendered at its true size so the text stays crisp. */
function Paper({ id, srcDoc, reader, crop, focus, onLoaded, onGap }: { id: string; srcDoc?: string; reader?: boolean; crop?: boolean; focus?: Focus; onLoaded?: (f: HTMLIFrameElement) => void; onGap?: (below: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const set = () => setW(el.clientWidth);
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const k = w ? Math.min(1, w / A4_W) : 0;
  const style = crop ? undefined : { height: k ? Math.round(A4_H * k) : undefined, aspectRatio: k ? undefined : `${A4_W} / ${A4_H}` };
  const left = k ? Math.max(0, Math.round((w - A4_W * k) / 2)) : 0;

  /** The frame is same-origin, so its document can be measured once it has loaded. */
  const loaded = (f: HTMLIFrameElement) => {
    setReady(true);
    if (crop && focus && onGap) {
      try {
        const g = findGap(f.contentDocument, focus);
        const boxH = box.current?.clientHeight || 320;
        onGap(!!g && g.top + g.height > boxH / (k || 1));
      } catch { /* not reachable: the crop stays at the top of the page */ }
    }
    onLoaded?.(f);
  };

  return (
    <div className={`cv-paper${reader ? " is-reader" : ""}${crop ? " is-crop" : ""}`} ref={box} style={style}>
      {k > 0 && (
        <iframe
          title={`Your CV, version ${id}`}
          className="cv-frame"
          /* No scripts run. Same-origin so the page's own request carries the pairing cookie; a fully sandboxed frame is cross-site and is refused. The reader may open its links in a new tab. */
          sandbox={reader ? "allow-same-origin allow-popups allow-popups-to-escape-sandbox" : "allow-same-origin"}
          style={{ width: A4_W, height: A4_H, left, transform: `scale(${k})`, ...(reader ? {} : { pointerEvents: "none" as const }) }}
          onLoad={(e) => loaded(e.currentTarget)}
          {...(reader ? {} : { tabIndex: -1, "aria-hidden": true })}
          {...(srcDoc !== undefined ? { srcDoc } : { src: `/api/cv?v=${encodeURIComponent(id)}` })}
        />
      )}
      {crop && !ready && <div className="cv-skel" aria-hidden><span /><span /><span /><span /><span /></div>}
    </div>
  );
}

/** The large reader: the CV at true size, scrollable. Esc or Close shuts it, also while focus is inside the page; focus goes back to what opened it.
    Tab cycle: Close, Open the PDF, the page (scroll), the page's own links, then back to Close. Shift+Tab goes the other way round. */
function Reader({ id, label, srcDoc, pdfHref, pdfLabel, focus, onClose }: { id: string; label: string; srcDoc?: string; pdfHref?: string; pdfLabel?: string; /** When set, a "Jump to the first gap" button scrolls the page to that line. */ focus?: Focus; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const done = useRef(onClose);
  done.current = onClose;
  const [loaded, setLoaded] = useState(false);
  const [gap, setGap] = useState(false);
  const unhook = useRef<(() => void) | null>(null);

  /** Scroll the page so the first gap sits a little below the top, with the same scale the frame is drawn at. */
  const jump = () => {
    const f = frame.current;
    const g = findGap(f?.contentDocument, focus);
    if (!f || !g || !body.current) return;
    const k = f.getBoundingClientRect().width / A4_W || 1;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    body.current.scrollTo({ top: Math.max(0, Math.round(g.top * k) - 64), behavior: calm ? "auto" : "smooth" });
    body.current.focus({ preventScroll: true });
  };
  const panelFocusables = () => (panel.current ? Array.from(panel.current.querySelectorAll<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])")).filter((x) => !x.closest(".cv-reader-body") || x === body.current) : []);
  /** The links inside the CV page, in order. */
  const frameLinks = () => { try { return Array.from(frame.current?.contentDocument?.querySelectorAll<HTMLElement>("a[href]") ?? []); } catch { return []; } };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done.current(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const f = panelFocusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1], at = document.activeElement;
      const links = frameLinks();
      if (!panel.current.contains(at)) { e.preventDefault(); first.focus(); }
      else if (!e.shiftKey && at === body.current && links.length) { e.preventDefault(); links[0].focus(); } // from the page into its first link
      else if (e.shiftKey && at === first) { e.preventDefault(); (links[links.length - 1] ?? last).focus(); } // back round: the page's last link
      else if (!e.shiftKey && at === last && !links.length) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); unhook.current?.(); unhook.current = null; document.body.style.overflow = prev; };
  }, []);

  /** Same-origin frame: key presses inside it never reach the page's window, so listen on the frame's own window. */
  const hookFrame = (f: HTMLIFrameElement) => {
    unhook.current?.();
    unhook.current = null;
    frame.current = f;
    setLoaded(true);
    try { setGap(!!findGap(f.contentDocument, focus)); } catch { /* not reachable: no jump button */ }
    const win = f.contentWindow;
    if (!win) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done.current(); return; }
      if (e.key !== "Tab") return;
      const links = Array.from(win.document.querySelectorAll<HTMLElement>("a[href]"));
      const at = win.document.activeElement;
      const first = links[0], last = links[links.length - 1];
      if (!e.shiftKey && (!last || at === last)) { e.preventDefault(); close.current?.focus(); } // past the page's last link: Close
      else if (e.shiftKey && (!first || at === first)) { e.preventDefault(); body.current?.focus(); }
    };
    try { win.addEventListener("keydown", onKey, true); unhook.current = () => { try { win.removeEventListener("keydown", onKey, true); } catch { /* frame already gone */ } }; } catch { /* not reachable: the page-level keys still work */ }
  };

  return (
    <div className="cv-reader" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cv-reader-panel" role="dialog" aria-modal="true" aria-label={`Your CV, ${label}`} ref={panel}>
        <div className="cv-reader-head">
          <p className="cv-reader-title">Your CV, {label}</p>
          {/* Close comes first in the page order, so the Tab cycle starts there; the row is drawn the other way round. */}
          <div className="cv-reader-act">
            <button type="button" className="btn btn-sm" ref={close} onClick={onClose}>Close</button>
            {gap && <button type="button" className="btn btn-sm" onClick={jump}>Jump to the first gap</button>}
            {pdfHref && <a className="btn btn-sm" href={pdfHref} target="_blank" rel="noopener">{pdfLabel ?? "Open the PDF"}</a>}
          </div>
        </div>
        <div className="cv-reader-body" tabIndex={0} ref={body} aria-label="The CV. Scroll to read." aria-busy={!loaded}>
          <div className="cv-reader-page">
            <Paper id={id} srcDoc={srcDoc} reader onLoaded={hookFrame} />
            {!loaded && <p className="cv-reader-loading muted" role="status">Loading the page</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A problem from the engine starts with the path of the line ("v1/experience/exp-a/b2: ..."): say where it is in words instead. */
function plainProblem(v: CvVersion, p: string): string {
  const m = /^(\S+\/\S+?): ([\s\S]*)$/.exec(p);
  if (!m) return p;
  const msg = m[2].charAt(0).toUpperCase() + m[2].slice(1);
  const body = /cannot rest on what you said in chat/i.test(msg) ? "This number needs a source." : msg;
  return `${whereIn(v, m[1], true)}: ${body}`;
}

/** The text of the first line the honesty check flagged (a number with no source), so the preview can scroll to it. */
function flaggedText(v: CvVersion): string {
  const h = v.checks?.honesty;
  const first = h?.unsourced_numbers?.[0] ?? h?.problems?.[0] ?? "";
  const parts = first.split(":")[0].split("/").slice(1);
  const sec = (v.sections ?? []).find((s) => s.id === parts[0]);
  const it = sec?.items?.find((x) => x.id === parts[1]);
  return it?.bullets?.find((b) => b.id === parts[2])?.text ?? it?.heading ?? "";
}

/* ---------- the section ---------- */

export function CvPanel({ career, srcDocFor }: { career?: CareerData | null; /** Kept so callers still compile; the card has one way to start (its chip). The task stays on Tonight. */ onTask?: () => void; /** Fixtures only: renders a version into the preview instead of calling the route. */ srcDocFor?: (v: CvVersion) => string | undefined; /** Kept so fixtures still compile; the card no longer shows help moments. */ force?: boolean }) {
  const versions = career?.cv?.versions ?? [];
  const opening = currentVersion(career);
  const [picked, setPicked] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [gapBelow, setGapBelow] = useState(false);
  const [checkFor, setCheckFor] = useState<string | null>(null);
  const checkId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const v = versions.find((x) => x.id === picked) ?? opening;
  const closeReader = () => { setReading(false); requestAnimationFrame(() => trigger.current?.focus()); };

  if (!v) {
    const a = askFor("none");
    return (
      <section className={att(2)} aria-labelledby="cv-h">
        <div className="page-title-row"><h2 id="cv-h" className="att-2-title" tabIndex={-1}>Your CV</h2><HelpButton id="cv" about={cvHelp("empty")} /></div>
        <div className="cv-act">
          <span className="cv-ask">{a.ask}</span>
          <CmdChip text={a.say} info />
        </div>
      </section>
    );
  }

  const needs = versionNeeds(v);
  const status = statusFor(v, needs.length);
  const ats = v.checks?.ats ?? null;
  const tailored = !!(v.target && (v.target.company || v.target.role));
  const ordered = [...versions].reverse();
  const checks = checkLines(v);
  const checksOpen = checkFor === v.id;
  const inFile = promotedVersion(versions);
  const exporting = status.state === "export";
  const help = cvHelp(status.state, status.count, status.problems);
  const focus = status.state === "fill" ? { text: status.problems ? flaggedText(v) : "" } : null;
  // One chip per state. A job check that is out of date carries its own chip inside the job check block.
  const chip = { phrase: status.step.phrase, hint: status.step.hint, ask: status.ask ?? askFor(status.state).ask };
  const fileBits = [
    inFile && inFile.id !== v.id ? `Your CV file: ${inFile.id}` : "",
    !v.pdf && !exporting ? "No PDF saved yet" : "",
  ].filter(Boolean);
  const draftNote = !!v.pdf && status.count > 0;
  const srcDoc = srcDocFor?.(v);
  const pdfHref = v.pdf ? `/api/cv/pdf?v=${encodeURIComponent(v.id)}` : undefined;
  const madeFor = tailored ? `Made for ${[v.target?.role, v.target?.company].filter(Boolean).join(" at ")}.` : "";
  const why = [madeFor, v.base ? `Changed from ${v.base}. ${v.why ?? ""}`.trim() : v.why].filter(Boolean).join(" ");
  const atsName = ats ? (ats.job || "").split(",")[0].trim() : "";

  return (
    <section className={att(2)} aria-labelledby="cv-h">
      <div className="page-title-row"><h2 id="cv-h" className="att-2-title" tabIndex={-1}>Your CV</h2><HelpButton id="cv" about={help} /></div>
      <div className="cv-wrap">
        <div className="cv-card">
          <div className="cv-main cv-main-a">
            <div className="cv-status">
              <p className={`cv-honesty is-${status.tone}`}>
                <span className="cv-dot" aria-hidden />
                <span>{status.text}</span>
                {checks.length > 0 && <span className="cv-sep" aria-hidden>·</span>}
                {checks.length > 0 && (
                  <button type="button" className="cv-word-btn" aria-expanded={checksOpen} aria-controls={checksOpen ? checkId : undefined} onClick={() => setCheckFor(checksOpen ? null : v.id)}>
                    <ChevronRight className="case-chev" aria-hidden />
                    {plural(checks.length, "line", "lines")} worth a look
                  </button>
                )}
              </p>
              {checksOpen && (
                <div id={checkId} className="cv-words">
                  <ul>
                    {checks.map((c, i) => (
                      <li key={i}>
                        <span>{c.text}{c.where && <span className="muted"> ({c.where})</span>}</span>
                        {/* A reason is shown only when it is the exception: lines resting on chat are the norm. */}
                        {c.tags.includes(TAG_WORDING) && <span className="cv-tags"><span className="cv-tag">{TAG_WORDING}</span></span>}
                        <span className="muted cv-note">{c.note ?? CHECK_ACTION}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="cv-act">
                    <span className="cv-ask">Want a second look?</span>
                    <CmdChip text="look at my CV" info />
                  </div>
                </div>
              )}
              {!(checksOpen && status.state === "fill") && (
                <div className="cv-act">
                  <span className="cv-ask">{chip.ask}</span>
                  <CmdChip text={chip.phrase} info />
                  <span className="muted cv-note">{chip.hint}</span>
                </div>
              )}
              {status.state === "export" && <p className="muted cv-note">After the PDF is saved, say use this CV to make it your CV file. Your old file is backed up first.</p>}
              {status.fix && <p className="muted cv-note">{status.fix}</p>}
            </div>

            {!!v.checks?.honesty?.problems?.length && (
              <ul className="muted cv-note cv-problems">
                {v.checks.honesty.problems.map((p, i) => <li key={i}>{plainProblem(v, p)}</li>)}
              </ul>
            )}

            {needs.length > 0 && (
              <ul className="cv-todo" aria-label="Facts still needed">
                {needs.map((n, i) => (
                  <li key={i}>
                    <span>{n.kind === "number" ? "A number: " : ""}{n.kind === "number" ? n.what : n.what.charAt(0).toUpperCase() + n.what.slice(1)}</span>
                    {n.where && <span className="muted"> ({n.where})</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="cv-thumb">
            <p className="cv-label">Preview</p>
            <div className="cv-thumb-box">
              <Paper key={v.id} id={v.id} srcDoc={srcDoc} crop focus={focus} onGap={(b) => setGapBelow(b)} />
              {/* The whole preview is a mouse target; the real button sits below the page so it never covers the text. */}
              <button type="button" className="cv-thumb-hit" tabIndex={-1} aria-hidden onClick={() => setReading(true)} />
            </div>
            {gapBelow && <p className="muted cv-note">The first gap is lower on the page. Open the full page and jump to it.</p>}
            <div className="cv-thumb-row">
              <div className="cv-pick">
                {versions.length > 1 ? (
                  <>
                    <span className="cv-label" aria-hidden>Showing</span>
                    <select aria-label="Choose which CV version to show" value={v.id} onChange={(e) => setPicked(e.target.value)}>
                      {ordered.map((x) => <option key={x.id} value={x.id}>{versionLabel(x)}</option>)}
                    </select>
                  </>
                ) : <p className="cv-one"><span className="cv-label">Showing</span> {versionLabel(v)}</p>}
                {opening && v.id !== opening.id && <button type="button" className="linkbtn cv-back" onClick={() => setPicked(null)}>Back to your working draft</button>}
              </div>
              <button type="button" className="btn btn-sm cv-thumb-open" ref={trigger} aria-haspopup="dialog" aria-label={`Open full page, CV ${v.id}`} onClick={() => setReading(true)}>Open full page</button>
            </div>
          </div>

          <div className="cv-main cv-main-b">
            {why && <p className="muted cv-note cv-why">{why}</p>}

            {ats && (
              <div className={`cv-ats-wrap${ats.stale ? " is-stale" : ""}`}>
                <Disclose className="cv-ats" under={<>
                  {!!ats.missing?.length && <p className="muted cv-note cv-ats-miss">Not in your CV yet: {ats.missing.slice(0, 3).join(", ")}.</p>}
                  {ats.stale && <div className="cv-act"><span className="cv-ask">Check out of date?</span><CmdChip text="check my CV against this job" info /><span className="muted cv-note">Your CV changed after this check.</span></div>}
                </>} summary={<>
                  <span className="cv-ats-name">{[atsName || "A job post", typeof ats.estimate === "number" ? `${ats.estimate} of 100` : "", ats.label || "AI estimate"].filter(Boolean).join(" · ")}</span>
                  {ats.stale && <span className="status-tag s-draft">Out of date: check again</span>}
                </>}>
                  <div className="cv-ats-body">
                    <p className="muted cv-note">How well this CV matches {ats.job ? ats.job : "the job post"}, out of 100. An AI estimate, not a measurement.</p>
                    {!!ats.matched?.length && (
                      <div className="cv-kw"><span className="muted">In your CV</span>
                        <ul>{ats.matched.map((k) => <li key={k} className="kw kw-in">{k}</li>)}</ul></div>
                    )}
                    {!!ats.missing?.length && (
                      <div className="cv-kw"><span className="muted">Not in your CV yet</span>
                        <ul>{ats.missing.map((k) => <li key={k} className="kw">{k}</li>)}</ul>
                        <span className="muted cv-note">Only add if true. Tell Claude if you have done this.</span></div>
                    )}
                  </div>
                </Disclose>
              </div>
            )}

            {draftNote && (
              <div className="cv-act">
                <span className="muted cv-note">The PDF is marked as a draft until the missing facts are in</span>
                <span className="cv-ask is-quiet">Want a draft now?</span>
                <CmdChip text="save my CV as a PDF" label="Save my CV as a PDF, as a draft" info />
              </div>
            )}
            {fileBits.length > 0 && <p className="muted cv-note">{fileBits.join(". ")}.</p>}
          </div>
        </div>
      </div>
      {reading && <Reader id={v.id} label={versionLabel(v)} srcDoc={srcDoc} focus={focus} pdfHref={pdfHref} pdfLabel={status.count > 0 ? "Open the PDF (draft)" : "Open the PDF"} onClose={closeReader} />}
    </section>
  );
}
