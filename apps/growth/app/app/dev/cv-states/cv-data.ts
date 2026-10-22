import type { CareerData, CaseStudy, CvSource, CvVersion } from "@/lib/types";

/** Made-up people and numbers for looking at the panels only. Nothing here is real, saved or read by the app. */
const header: CvVersion["header"] = { name: "Sample Person", title: "Product Designer", location: "Anywhere", email: "sample@example.com", links: [{ label: "Portfolio", url: "https://example.com" }] };
const src: CvSource[] = [{ kind: "dossier", ref: "3.4", quote: "led the checkout redesign" }];

const sections = (needy: boolean, extra?: string): CvVersion["sections"] => [
  { id: "summary", kind: "summary", title: "Summary", items: [{ id: "s", heading: "", bullets: [{ id: "b0", text: "Product designer who leads design from first sketch to shipped flow.", sources: src }] }] },
  { id: "experience", kind: "experience", title: "Experience", items: [
    { id: "exp-a", heading: "Acme Pay · Lead Designer", sub: "Remote · Payments product", dates: "2023 to 2025", sources: src, bullets: [
      { id: "b1", text: "Led the checkout redesign across web and app.", sources: src },
      { id: "b2", text: needy ? "Cut drop-off at payment by [NEEDS REAL NUMBER: drop-off change at payment, with the period]." : "Shipped the new payment step to every user.", sources: src },
      { id: "b3", text: needy ? "Worked with [NEEDS: team size and roles you worked with]." : "Worked daily with two engineers and a product manager.", sources: src },
    ] },
    { id: "exp-b", heading: "Earlier studio", sub: "Designer", dates: "2021 to 2023", compact: true, sources: src, bullets: [{ id: "b5", text: "Designed marketing pages and small product flows.", sources: src }] },
  ] },
  { id: "skills", kind: "skills", title: "Skills", items: [{ id: "sk", heading: "Tools", bullets: [{ id: "b4", text: "Figma, user research, design systems, prototyping", sources: src }] }] },
  /* The data puts the portfolio gap first on purpose: the page sorts real links ahead of it. */
  { id: "live", kind: "links", title: "Live work", items: [
    ...(needy ? [{ id: "l0", heading: "[NEEDS: portfolio link]", sub: "Case studies", bullets: [] }] : []),
    { id: "l1", heading: "example.com/checkout", sub: "Checkout redesign", bullets: [] },
  ] },
  ...(extra ? [{ id: "extra", kind: "experience" as const, title: "Experience", items: [{ id: "ex", heading: "Side project", sub: "", dates: "2024", bullets: [{ id: "bx", text: extra, sources: src }] }] }] : []),
];

const mk = (id: string, over: Partial<CvVersion> & { changed?: string }, needy = false, extra?: string): CvVersion => ({
  id, made: "2026-10-21", base: null, target: null, promoted: false, file: `cv/drafts/CV_${id}.html`, pdf: null,
  why: "First CV, built from your current CV and your career notes.",
  header,
  sections: sections(needy, extra),
  checks: { honesty: { ran: "2026-10-21T10:00:00Z", pass: true, unsourced_numbers: [], deny_hits: [], placeholders: needy ? 3 : 0 }, ats: null },
  ...over,
});

const cases: CaseStudy[] = [
  { id: "checkout", title: "Checkout redesign", one_line: "Made the payment step keep working when a card is declined.", type: "product", format: "decision_log", status: "outline", updated: "2026-10-21", owned: "The deposit flow design.", team: "[NEEDS: team size and roles]", audience: "Hiring managers", hook: "",
    beats: [
      { title: "The problem", text: "Deposits failed whenever one provider went down. [NEEDS REAL NUMBER: how often, in a month]", sources: src, needs: [] },
      { title: "What you did", text: "You designed a fallback path and a clear waiting state. You mapped every point where a deposit could stall, wrote the plain words for each wait, and tested the flow with five people from support before it shipped to everyone.", sources: [...src, ...src], needs: [] },
      { title: "What changed afterwards", text: "", sources: [], needs: [] },
      { title: "What you would do differently", text: "", sources: [], needs: [] },
      { title: "Who else was involved", text: "", sources: [], needs: [] },
    ],
    decisions: [{ decision: "Show a waiting state instead of an error", context: "Providers were slow, not always down.", options: ["Retry silently", "Show a waiting state"], tradeoffs: "People saw a delay, but stopped retrying.", outcome: "[NEEDS REAL NUMBER: change in repeat attempts]", sources: src }] },
  { id: "kyc", title: "Identity check redesign", one_line: "A shorter identity check people finish.", type: "product", format: "six_part", status: "ready", updated: "2026-10-20", owned: "All screens.", team: "", audience: "", hook: "",
    beats: [{ title: "Outcome", text: "More people finished the check.", sources: src, needs: [] }], decisions: [] },
];

/** Marked ready in the file but a fact is missing: the card must not say Ready. */
const readyButNeeds: CaseStudy = { id: "onboarding", title: "Onboarding flow", one_line: "A first-run flow people finish.", type: "product", format: "star", status: "ready", updated: "2026-10-19", owned: "All screens.", team: "Two engineers", audience: "Hiring managers", hook: "",
  beats: [{ title: "Result", text: "Completion went up by [NEEDS REAL NUMBER: completion change, with the period].", sources: src, needs: [] }], decisions: [] };
/** Complete cases, for the ready state. */
const doneCases: CaseStudy[] = [
  { ...cases[1], owned: "All screens.", team: "Two engineers and a product manager", audience: "Hiring managers" },
  { ...readyButNeeds, id: "onboarding", beats: [{ title: "Result", text: "More people finished the first-run flow.", sources: src, needs: [] }] },
];

/** Five facts missing: the start card names the first three, then "+2 more". */
const manyNeeds: CaseStudy = { id: "payouts", title: "Payouts dashboard", one_line: "A dashboard that shows when money lands.", type: "product", format: "star", status: "draft", updated: "2026-10-21", owned: "[NEEDS: what you owned]", team: "[NEEDS: team size and roles]", audience: "[NEEDS: who it was for]", hook: "",
  beats: [{ title: "Result", text: "Support questions went down by [NEEDS REAL NUMBER: change in support questions, with the period].", sources: src, needs: ["The date it launched"] }], decisions: [] };

const base: CareerData = { updated: "2026-10-21", cv: { current: "v1", versions: [] }, cases: [] };

export const FIXTURES: { id: string; label: string; career: CareerData | null }[] = [
  { id: "empty", label: "Empty: no career data yet", career: null },
  { id: "draft", label: "Draft with placeholders: 3 facts still needed", career: { ...base, cv: { current: "v1", versions: [mk("v1", {}, true)] }, cases: [...cases, readyButNeeds] } },
  { id: "tailored", label: "Tailored with an ATS result (AI estimate), edited since it ran", career: { ...base, cv: { current: "v2", versions: [mk("v1", {}), mk("v2", {
    made: "2026-10-22", changed: "2026-10-22T11:00:00Z", why: "Tailored to the job post you pasted, same facts, reordered.", base: "v1", target: { company: "Northwind", role: "Lead Product Designer", post_excerpt: "We are looking for" },
    checks: { honesty: { ran: "2026-10-22T10:00:00Z", pass: true, unsourced_numbers: [], deny_hits: [], placeholders: 0, dev_sources: ["v2/experience/exp-a/b2", "v2/experience/exp-a/b3", "v2/experience/exp-b"], warnings: ["v2/experience/exp-a/b2: only 1 of 5 key words in this skills line are in its quotes. Check that the quote really says you have this skill"] }, ats: { ran: "2026-10-22T10:05:00Z", job: "Northwind, Lead Product Designer", matched: ["design systems", "prototyping", "user research"], missing: ["accessibility audits", "A/B testing"], estimate: 72, label: "AI estimate", stale: true } },
  })] }, cases } },
  { id: "problems", label: "Failed the honesty check: a number with no source", career: { ...base, cv: { current: "v1", versions: [mk("v1", {
    checks: { honesty: { ran: "2026-10-21T10:00:00Z", pass: false, unsourced_numbers: ["v1/extra/ex/bx: 40%"], deny_hits: [], placeholders: 0, problems: ["v1/extra/ex/bx: a number cannot rest on what you said in chat. Save it as a note from you first, then cite that note"] }, ats: null },
  }, false, "Grew sign-ups by 40%.")] }, cases } },
  { id: "draftpdf", label: "Draft with a PDF already saved: Want a draft now? chip", career: { ...base, cv: { current: "v1", versions: [mk("v1", { pdf: "cv/drafts/CV_v1.pdf" }, true)] }, cases } },
  { id: "many", label: "Case study with five facts missing: three shown, then +2 more", career: { ...base, cv: { current: "v1", versions: [mk("v1", {})] }, cases: [manyNeeds, cases[1]] } },
  { id: "ready", label: "Ready: every fact has a source", career: { ...base, cv: { current: "v1", versions: [mk("v1", { promoted: true, pdf: "cv/drafts/CV_v1.pdf" })] }, cases: doneCases } },
];
