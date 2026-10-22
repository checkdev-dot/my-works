"use client";

import { notFound } from "next/navigation";
import { Modules, ToolsFold } from "@/components/Modules";
import type { ModuleInfo, ModuleResult } from "@/lib/types";

const base = { skill: { kind: "file", path: "modules/x/skill/SKILL.md" }, input: "Your CV as text", source: "pasted", installed: "2026-10-10", enabled: true } as const;
const cv: ModuleInfo = { ...base, id: "cv-analyser", name: "CV analyser", capability: "cv", does: "Checks your CV against the 7-second test.", default: true };
const li: ModuleInfo = { ...base, id: "li-reader", name: "LinkedIn reader", capability: "linkedin", does: "Reads your profile the way a recruiter does.", can_publish: true };
const pf: ModuleInfo = { ...base, id: "portfolio-notes", name: "Portfolio notes", capability: "portfolio", does: "Gives notes on a case study, no score." };
const iv: ModuleInfo = { ...base, id: "interview-coach", name: "Interview coach", capability: "interview", does: "Mock interview feedback.", enabled: false };

const ab = (id: string, label: string, say: string[], topic: string, over: Partial<NonNullable<ModuleInfo["abilities"]>[number]> = {}) => ({ id, label, say, topic, reads: "your pasted text", gives: "score" as const, enabled: true, ...over });
const v2: ModuleInfo = { ...base, id: "placeholder-pack", name: "Placeholder pack", capability: "other", does: "Placeholder description of what this file does for you.", abilities: [
  ab("score-one", "Score the first placeholder thing", ["score the first thing", "rate the first thing"], "cv-review"),
  ab("notes-two", "Give notes on the second placeholder thing", ["notes on the second thing"], "portfolio-review", { gives: "notes", reads: "a link to the placeholder page" }),
  ab("score-three", "Score the third placeholder thing", ["score the third thing"], "linkedin-review", { enabled: false }),
], impact: { based_on: "file", decided: "2026-10-14",
  adds: [{ text: "Placeholder: a check nothing here does yet.", why: "Placeholder: named in the file's checks list." }],
  strengthens: [{ text: "Placeholder: goes further than the built-in read.", why: "Placeholder: 12 checks against 6.", target: "builtin-cv-read" }],
  can_drop: [{ text: "Placeholder: duplicates an existing read.", why: "Placeholder: same checks, fewer of them." }] } };
const tried: ModuleInfo = { ...v2, id: "placeholder-tried", name: "Placeholder tried", abilities: [ab("only", "Placeholder tried ability", ["placeholder tried"], "cv-review")], impact: { ...v2.impact!, based_on: "trial", can_drop: [] } };
const flagged: ModuleInfo = { ...v2, id: "placeholder-flagged", name: "Placeholder flagged", flagged: ["Placeholder quoted line one", "Placeholder quoted line two"], can_publish: true, enabled: true, abilities: [ab("only", "Placeholder flagged ability", ["placeholder flagged"], "linkedin-review", { enabled: false })] };
const rV2: ModuleResult = { ...rPfBase(), id: "r5", module: "placeholder-pack" };
function rPfBase(): ModuleResult { return { id: "x", module: "x", date: "2026-10-13", subject: "Placeholder subject", score: 81, word: "Strong", status: "current", summary: "Placeholder summary for a scored result.", strengths: ["Placeholder strength"], fixes: [{ what: "Placeholder fix", why: "Placeholder reason", effort: "10 min" }] }; }
const rStale: ModuleResult = { ...rPfBase(), id: "r6", module: "placeholder-tried", status: "stale", score: 55, word: "Needs work" };
const rNotes: ModuleResult = { ...rPfBase(), id: "r7", module: "placeholder-flagged", score: null, word: undefined };
const legacy: ModuleInfo = { ...base, id: "legacy-one", name: "Legacy add-on", capability: "cv", does: "Placeholder: an add-on installed before abilities existed." };

const rCv: ModuleResult = { id: "r1", module: "cv-analyser", date: "2026-10-12", subject: "CV.pdf, 1 page", score: 72, word: "Solid", status: "current",
  summary: "Clear and scannable. The top third says what you do, but results are buried under duties.",
  strengths: ["One page, clean hierarchy", "Real numbers in the latest role"],
  fixes: [{ what: "Lead each role with the outcome", why: "Recruiters read the first line only.", effort: "20 min" }, { what: "Cut the skills list to six", why: "It dilutes the strong ones.", effort: "5 min" }, { what: "Add a link to one case study", why: "It lets them check the claim." }] };
const rLi: ModuleResult = { id: "r2", module: "li-reader", date: "2026-09-30", subject: "your LinkedIn headline and About", score: 58, word: "Needs work", status: "stale",
  summary: "The headline names a job title, not the problem you solve.", strengths: ["Photo and banner are consistent"],
  fixes: [{ what: "Rewrite the headline around the outcome", why: "It is the only line search results show.", effort: "10 min" }] };
const rPf: ModuleResult = { id: "r3", module: "portfolio-notes", date: "2026-10-11", subject: "Checkout redesign case study", score: null, status: "current",
  summary: "Strong problem framing. The trade-off section is thin.", strengths: ["Clear role statement"], fixes: [{ what: "Say what you gave up and why", why: "That is the part senior reviewers look for." }] };
const rIv: ModuleResult = { id: "r4", module: "interview-coach", date: "2026-10-01", subject: "Mock, Acme Pay", score: 64, word: "Getting there", status: "current", summary: "Hidden because switched off.", strengths: [], fixes: [] };

export default function ModulesFixture() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="shell comp" style={{ padding: "40px 16px", display: "grid", gap: 48 }}>
      <p className="muted">Fixture data, not the person&apos;s add-ons.</p>
      <section><h2>Empty</h2><Modules modules={undefined} /></section>
      <section><h2>CV scored, LinkedIn stale, portfolio notes only, interview switched off</h2>
        <Modules modules={{ installed: [cv, li, pf, iv], results: [rCv, rLi, rPf, rIv] }} /></section>
      <section><h2>v2: legacy, three abilities with one off, impact, tried once and stale, flagged with notes only</h2>
        <Modules modules={{ installed: [legacy, v2, tried, flagged], results: [rV2, rStale, rNotes], primary: { "cv-review": "placeholder-pack" }, retired: [] }} /></section>
      <section><h2>Getting hired fold</h2>
        <ToolsFold modules={{ installed: [cv, li, pf, iv], results: [rCv, rLi, rPf, rIv] }} onOpen={() => {}} /></section>
    </div>
  );
}
