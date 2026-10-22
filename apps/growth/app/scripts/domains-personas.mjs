// The six cross-family personas of the domain graph (handoff-docs/specs/domain-graph-spec.md section 7), as interview scripts:
// each is driven from the reset to complete through the REAL CLIs by scripts/domains-regression.mjs, exactly like the ten people
// of scripts/onboarding-personas.mjs. They are kept in their own file so `npm run onboarding:regression` stays at ten people.
//
//   dm_p1  product designer, mid to lead                    launch to launch; the 8 live rubric ids; the person's own ratings
//   dm_p2  brand designer, mid to creative director (L)     creative director is planned: mapped to brand designer with a note
//   dm_p3  PR associate to communications manager           planned (corporate comms): mapped to PR specialist with a note
//   dm_p4  content marketer, mid to product marketer, mid   launch to launch
//   dm_p5  product designer to marketing strategist         planned: mapped to content marketer; a second target (dual)
//   dm_p6  PR specialist to UX writer                       planned: mapped to content marketer with a note
//   dm_hr_transform, dm_hr_od, dm_hr_analytics  HR practice (family H) into HR transformation, OD and people analytics (family O); launch to launch
//
// Every answer is literal and goes through onboard.answer; nothing edits a data file.
import { resolveQuestion, sittingMax } from "../lib/onboarding-bank.mjs";
import "../lib/domain-bank.mjs";
import { domainRubricFor } from "../lib/domain-flow.mjs";

const U = "https://example.org";
const rs = (id, subject, claim, supports, n, extra = {}) => ({ id, subject, claim, supports, source_url: `${U}/${id}`, source_name: `Example source ${n}`, tier: 3, published: "2026-08-01", retrieved: "2026-10-15", excerpt: claim.split(" ").slice(0, 18).join(" "), confidence: 0.5, fresh_days: 120, ...extra });
const weight = (id) => { const q = resolveQuestion(id); return !q ? 1 : q.round === "R0" ? 0 : q.follow_of ? 0.5 : q.hard ? 1.5 : 1; };

function flow(budget) {
  const steps = [];
  const max = sittingMax(Number(budget));
  let asked = 0;
  let round = "R0";
  const push = (a, say, extra = {}) => steps.push({ a, say, ...extra });
  const ans = (id, value, o = {}) => {
    const w = weight(id);
    if (asked + w > max + 1e-9) { push({ type: "onboard.round", round, new_sitting: true, reason_tag: "he_asked_to_continue" }, "A full sitting; he wants to carry on tonight"); asked = 0; }
    const a = { type: "onboard.answer", id, value };
    if (o.status) a.status = o.status;
    if (o.evidence) a.evidence = o.evidence;
    if (o.meta) a.meta = o.meta;
    if (o.confirmed) { a.confirmed = true; a.quote = o.quote; }
    push(a, `Answer ${id}`, o.expect ? { expect: o.expect } : {});
    if (!o.expect) asked += w;
  };
  const skip2 = (id, consequence) => {
    if (asked + 1 > max + 1e-9) { push({ type: "onboard.round", round, new_sitting: true, reason_tag: "he_asked_to_continue" }, "A full sitting; he wants to carry on tonight"); asked = 0; }
    asked += 1;
    push({ type: "onboard.skip", id, consequence }, `Skip ${id} (first)`);
    push({ type: "onboard.skip", id, consequence }, `Skip ${id} (second)`);
  };
  const move = (r, extra = {}, say = `Move to ${r}`) => { push({ type: "onboard.round", round: r, ...extra }, say); round = r; asked = 0; };
  const summary = (r, text) => push({ type: "onboard.round", round: r, summary: text, confirmed: true, quote: "that is right" }, `Round ${r} summary, confirmed in his words`);
  return { steps, push, ans, move, summary, skip2 };
}

const LEVEL_NUM = { junior: 1, mid: 2, senior: 3, lead: 4, head: 4 };

/** The shared interview: only the person-specific fields differ. */
function build(p) {
  const f = flow("40");
  // R0
  f.ans("R0-01", "40"); f.ans("R0-02", "straight with check-ins"); f.ans("R0-03", p.offLimits || ["none"]);
  f.ans("R0-06", p.currency); f.ans("R0-07", "per year"); f.ans("R0-08", p.country); f.ans("R0-09", p.field); f.ans("R0-10", p.proofKind);
  f.ans("DM-01", p.family);
  f.ans("R0-05", "yes, start Round 1");
  f.move("R1", {}, "Enter R1");
  // R1: the role questions of the main bank, then the domain selection
  f.ans("B-01", p.title);
  f.ans("B-02", p.tasks);
  f.ans("B-31", p.timeUse);
  f.ans("B-03", { name: p.lastWork, month: "2026-06" }, { evidence: [`${U}/work-${p.key}`] });
  f.ans("B-04", p.targetText);
  f.ans("B-06", p.skillArea, { meta: { skill_area: p.skillAreaName } });
  // the domain selection: family was asked in R0
  f.ans("DM-02", p.roleNowOption, p.roleNowMeta ? { meta: p.roleNowMeta, confirmed: true, quote: "yes, that is the closest one" } : {});
  if (p.roleNowFree) f.ans("DM-02.f1", p.roleNowFree);
  f.ans("DM-05", p.levelNow);
  f.ans("DM-03", p.targetOption, p.targetMeta ? { meta: p.targetMeta, confirmed: true, quote: "yes, that is the closest one" } : {});
  if (p.targetFree) f.ans("DM-03.f1", p.targetFree);
  f.ans("DM-06", p.levelTarget);
  if (p.second) f.ans("DM-04", p.second, p.secondMeta ? { meta: p.secondMeta, confirmed: true, quote: "yes, that is the closest one" } : {});
  if (p.secondFollow) f.ans("DM-04.f1", p.secondFollow);
  // a domain question under a topic he ruled out is refused, never asked (the same boundary rule as the main bank)
  if (p.offLimits) f.ans("DM-10", "none", { expect: "refuse" });
  f.ans("DM-07", p.workMode);
  f.ans("DM-08", p.industryNow);
  f.ans("DM-08.f1", p.industryTarget);
  f.ans("B-07", p.pay); f.ans("B-08", [Math.round(p.pay * 1.1), Math.round(p.pay * 1.4)]); f.ans("B-33", Math.round(p.pay * 1.3)); if (!p.offLimits) f.ans("F-10", Math.round(p.pay * 0.5)); f.ans("B-10", Math.round(p.pay * 1.05));
  f.ans("B-12", p.recognition);
  f.ans("B-15", ["Unpaid trial work", "Relocating", "Night shifts only"]);
  f.ans("B-16", "2027-09-01"); f.ans("B-17", 6); f.ans("B-19", ["Sat", "Sun"]); f.ans("B-18", 5); f.ans("H-01", 2); if (!p.offLimits) f.ans("B-20", 4); f.ans("F-01", 3);
  f.ans("B-25", 60); f.ans("B-26", ["hybrid", "remote"]); f.ans("B-27", ["nobody"]); f.ans("P-04", "yes, a few"); f.ans("E-01", "no");
  f.ans("DM-11", p.bestWork);
  f.ans("DM-12", p.ownPart);
  for (const [id, v, o] of p.evidence) f.ans(id, v, o || {});
  f.push({ type: "decide_open" }, "Every open contradiction is decided with him");
  f.summary("R1", "Round 1 done. Your role, level, target, pay, limits and hours are recorded.");
  // R2: research, the rubric, the adaptive batch
  f.push({ type: "onboard.consent", round: "R2", answer: "yes", quote: "yes, do the research" }, "Round 2 consent, in his words");
  const items = [
    rs("rs-001", { type: "level", id: "target_role" }, `${p.role} posts ask for ${p.req1}`, "requirement", 1, { label: p.req1 }),
    rs("rs-002", { type: "level", id: "target_role" }, `${p.role} posts ask for ${p.req2}`, "requirement", 2, { label: p.req2 }),
    rs("rs-003", { type: "level", id: "target_role" }, `${p.role} posts ask for ${p.req3}`, "requirement", 3, { label: p.req3 }),
    rs("rs-004", { type: "source_list", id: "salary" }, `${p.role} pay in ${p.country} ranges from ${Math.round(p.pay * 1.1)} to ${Math.round(p.pay * 1.5)} ${p.currency.toUpperCase()} per year`, "salary", 4),
    rs("rs-005", { type: "source_list", id: "salary" }, `Mid level ${p.role} report ${Math.round(p.pay * 1.05)} to ${Math.round(p.pay * 1.4)} ${p.currency.toUpperCase()} per year`, "salary", 5),
    rs("rs-006", { type: "level", id: p.comps[0].id }, `Career ladders describe the move from doing the work to setting the direction of the work`, "level", 6),
  ];
  f.push({ type: "onboard.research", items }, "Research items, each with url and date (the per-role template caps)");
  if (p.rubric === "domain_graph") f.push({ type: "onboard.rubric", source: "domain_graph", role: p.rubricRole, level: p.rubricLevel }, "The rubric of a launch role, from the domain model");
  else f.push({ type: "onboard.rubric", competencies: p.comps.map((c) => ({ ...c, group: "skill", research: ["rs-001"] })), levels: p.rubricLevels, source: "rs-001 to rs-006" }, "The researched rubric");
  const c0 = p.comps[0].id;
  f.push({ type: "onboard.map", id: "B-06", competency: c0, quote: "yes that fits" }, "Map the skill area of B-06");
  f.move("R2", {}, "Enter R2");
  f.push({ type: "onboard.round", round: "R2", generated: [
    { id: `A-${c0}.1`, competency: c0, text: `What is the most advanced ${p.comps[0].name.toLowerCase()} work you did in the last 12 months that someone else could verify?`, research: ["rs-001"] },
    { id: `A-${c0}.2`, competency: c0, text: `Which one of these four descriptions fits that piece of work best?`, research: ["rs-001"] },
    { id: `A-${c0}.3`, competency: c0, text: `In the next 90 days, what do you want to be able to do in ${p.comps[0].name.toLowerCase()} that you cannot do now?`, research: ["rs-001"] },
  ] }, "Register the adaptive batch, each citing research");
  f.ans("I-01", "2");
  f.ans("I-02", p.comps[0].name, { meta: { competency: c0 } });
  f.ans("I-03", "inside");
  f.ans("I-04", [`${p.role} posts ask for ${p.req2}`], { meta: { requirement_competency: { [`${p.role} posts ask for ${p.req2}`]: p.comps[1].id } } });
  f.ans("I-05", [`${p.role} posts ask for ${p.req1}`]);
  f.skip2("CR-01", "no credential named by the sources");
  f.ans(`A-${c0}.1`, p.a1);
  f.ans(`A-${c0}.2`, p.comps[0].levels[2]);
  f.ans(`A-${c0}.3`, p.a3);
  f.ans("DM-32", p.jobPost);
  f.ans("DM-32.f1", p.jobPostNote);
  f.summary("R2", "Round 2 done. Your level and your gaps are placed on the rubric.");
  // R3
  f.push({ type: "onboard.consent", round: "R3", answer: "yes", quote: "continue" }, "Round 3 consent, in his words");
  f.move("R3", {}, "Enter R3");
  f.ans("R3-01", "Telling my manager I want to move into the new kind of work"); f.ans("R3-02", "That the best piece in my portfolio was mostly my team's");
  f.ans("R3-06", ["Evening course", "A newsletter", "A language app"]);
  f.ans("DM-37", p.notOwned); f.ans("DM-38", p.skeptic); f.ans("DM-42", p.avoided);
  f.summary("R3", "Round 3 done. The avoided work is named and became tasks.");
  f.push({ type: "onboard.consent", round: "R4", answer: "yes", quote: "yes, plan the dates" }, "Round 4 consent, in his words");
  f.move("R4", {}, "Enter R4");
  f.ans("T-03", "2027-09-01"); f.ans("T-05", ["Evening television"]); f.ans("T-07", 5); f.ans("T-08", "A sick relative for two weeks in a row");
  f.ans("T-09", "I keep putting the first proof off because the work has no deadline");
  f.ans("DM-45", "2027-03-01");
  f.push({ type: "decide_open" }, "Every open contradiction is decided with him");
  f.summary("R4", "Round 4 done. Your hours, your dates and what you will stop doing are recorded.");
  f.move("R5", {}, "Enter R5");
  if (p.ratings) for (const r of p.ratings) f.push({ type: "onboard.rating", competency: r.id, level: r.level, source: r.source, because: ["I-01"], reason: "Estimate from the onboarding answers cited; not yet judged by anyone else." }, `Rate ${r.id}`);
  else f.push({ type: "write_ratings" }, "Rate each competency from the evidence given (the sanctioned rate step), no other edit");
  f.push({ type: "onboard.round", round: "R5", complete: true, plan_pending: { reason: "the plan is built in its own step", next_command: "plan my four weeks" } }, "Complete, with the plan still to come");
  return f.steps;
}

const gen = (role, level) => domainRubricFor(role, level).competencies;
const common = { currency: "gbp", country: "United Kingdom" };

// The person's eight live rubric ids (product design), so the interview rubric is the one the live data has
const LIVE8 = [
  { id: "product_thinking", name: "Product thinking", levels: { 1: "Executes the problem as given", 2: "Frames a feature problem", 3: "Owns problem framing and the metric", 4: "Sets product direction across teams" } },
  { id: "craft", name: "Craft", levels: { 1: "Makes clean screens with guidance", 2: "Makes strong flows alone", 3: "Raises the bar of craft for others", 4: "Sets the craft standard" } },
  { id: "systems", name: "Systems", levels: { 1: "Uses a design system", 2: "Extends a design system", 3: "Designs parts of a system", 4: "Owns the system" } },
  { id: "research", name: "Research", levels: { 1: "Observes a study", 2: "Runs a small study alone", 3: "Plans studies and decides from them", 4: "Sets the research practice" } },
  { id: "communication", name: "Communication", levels: { 1: "Presents work with help", 2: "Presents rationale alone", 3: "Influences senior people", 4: "Shapes the narrative of a team" } },
  { id: "collaboration", name: "Collaboration", levels: { 1: "Works with one team", 2: "Works across a function", 3: "Leads across functions", 4: "Builds the working model of a group" } },
  { id: "building", name: "Building", levels: { 1: "Hands off to engineers", 2: "Prototypes in code", 3: "Ships production work", 4: "Sets how the team builds" } },
  { id: "domain", name: "Domain", levels: { 1: "Knows the basics of the field", 2: "Knows the field well", 3: "Knows the field deeply", 4: "Is a reference for the field" } },
];
// The person's levels on 2026-10-12 (the spec's worked example 1), appended through onboard.rating
const DEV_LEVELS = [
  { id: "product_thinking", level: 2.5, source: "ai" }, { id: "craft", level: 2, source: "self" }, { id: "systems", level: 2.5, source: "ai" },
  { id: "research", level: 1.5, source: "self" }, { id: "communication", level: 1.5, source: "ai" }, { id: "collaboration", level: 2, source: "self" },
  { id: "building", level: 3, source: "ai" }, { id: "domain", level: 3, source: "ai" },
];

const PEOPLE = {
  dm_p1: {
    key: "dm_p1", label: "Product designer, 29, mid to lead product designer (launch to launch, the 8 live rubric ids)", ...common, field: "product design", proofKind: "a case study with a measured outcome",
    family: "design", title: "Product designer", tasks: ["Flows", "Prototypes", "Design reviews", "Research sessions", "Handoff"],
    timeUse: { Flows: 40, Prototypes: 25, "Design reviews": 15, "Research sessions": 10, Handoff: 10 }, lastWork: "Checkout flow redesign", targetText: "Lead product designer",
    skillArea: "Run a usability test with five users without help", skillAreaName: "research",
    roleNowOption: "Product designer", levelNow: "mid", targetOption: "Product designer", levelTarget: "lead", workMode: "in-house", industryNow: "fintech", industryTarget: "health",
    pay: 52000, recognition: "Known for turning messy requirements into clear flows", bestWork: "https://example.org/checkout-redesign", ownPart: "I designed the full flow and ran the tests myself",
    evidence: [["DM-14", 0], ["DM-15", "I chose to fix the failed payment step because it lost the most orders"]],
    role: "Lead product designer", req1: "Case studies with outcomes", req2: "Research with real users", req3: "Influencing senior stakeholders",
    comps: LIVE8, rubric: "researched", rubricLevels: { 1: "Executes defined tasks with guidance", 2: "Owns features end to end", 3: "Owns problem framing and outcomes", 4: "Sets direction across products or teams" },
    ratings: DEV_LEVELS, a1: "I ran a usability test of the checkout flow with five users, my part was the script and the report", a3: "Plan and run a study and turn it into a decision a team acts on",
    jobPost: "https://example.org/jobs/lead-product-designer", jobPostNote: "Fintech", notOwned: "The onboarding redesign, where product set the outcome", skeptic: "Few finished case studies and no write-ups of results", avoided: "Running research with real users",
  },
  dm_p2: {
    key: "dm_p2", label: "Brand designer, 31, mid to creative director (planned role, mapped to brand designer)", ...common, field: "brand design", proofKind: "three applications of one identity",
    family: "design", title: "Brand designer", tasks: ["Identity systems", "Campaign assets", "Presentations", "Packaging", "Client calls"],
    timeUse: { "Identity systems": 35, "Campaign assets": 30, Presentations: 15, Packaging: 10, "Client calls": 10 }, lastWork: "Rebrand of a food label", targetText: "Creative director",
    skillArea: "Direct a campaign from brief to result", skillAreaName: "campaign planning",
    roleNowOption: "Brand designer", levelNow: "mid", targetOption: "a role not listed", targetFree: "Creative director", targetMeta: { role: "creative_director", role_mapped: true }, levelTarget: "lead", workMode: "agency", industryNow: "food and drink", industryTarget: "food and drink",
    pay: 46000, recognition: "Known for identity systems that hold up across channels", bestWork: "https://example.org/food-label-rebrand", ownPart: "I built the identity system and the guidelines",
    evidence: [["DM-14", null, { status: "unknown" }], ["DM-15", "I chose to simplify the range architecture before any visual work"]],
    role: "Creative director", req1: "Directing a campaign team", req2: "Owning a budget", req3: "Presenting strategy to clients",
    comps: gen("brand_designer", "L"), rubric: "domain_graph", rubricRole: "brand_designer", rubricLevel: "L",
    a1: "I led the packaging identity for three product lines and presented the rationale to the client", a3: "Direct a full campaign and show the result with a number",
    jobPost: "https://example.org/jobs/creative-director", jobPostNote: "Food and drink", notOwned: "The campaign launch, where the agency lead set the strategy", skeptic: "Strong identity work but no campaign results", avoided: "Presenting the budget to the client",
  },
  dm_p3: {
    key: "dm_p3", label: "PR associate, 27, to communications manager (planned role, mapped to PR specialist; money and debt are off limits)", ...common, offLimits: ["my debt"], field: "public relations", proofKind: "a coverage report with links and dates",
    family: "PR and communications", title: "PR associate", tasks: ["Media lists", "Press releases", "Monitoring", "Pitching", "Client reports"],
    timeUse: { "Media lists": 20, "Press releases": 25, Monitoring: 25, Pitching: 20, "Client reports": 10 }, lastWork: "Product launch press push", targetText: "Communications manager",
    skillArea: "Handle a press enquiry about a problem", skillAreaName: "crisis and reputation",
    roleNowOption: "PR specialist", levelNow: "junior", targetOption: "a role not listed", targetFree: "Communications manager", targetMeta: { role: "corporate_comms", role_mapped: true }, levelTarget: "senior", workMode: "agency", industryNow: "consumer technology", industryTarget: "consumer technology",
    pay: 32000, recognition: "Known for quick, clean press releases", bestWork: "https://example.org/launch-coverage", ownPart: "I wrote the release and pitched it to six outlets",
    evidence: [["DM-17", 2], ["DM-19", "outputs"]],
    role: "Communications manager", req1: "Earned media placements", req2: "Measurement beyond clippings", req3: "Handling issues and crisis",
    comps: gen("pr_specialist", "S"), rubric: "domain_graph", rubricRole: "pr_specialist", rubricLevel: "S",
    a1: "I secured two placements in named trade outlets and wrote the coverage report", a3: "Run a campaign and show measured outcomes",
    jobPost: "https://example.org/jobs/communications-manager", jobPostNote: "Consumer technology", notOwned: "The launch interview in a national outlet, which my director arranged", skeptic: "Mostly outputs, no measured outcomes", avoided: "Handling the difficult press call",
  },
  dm_p4: {
    key: "dm_p4", label: "Content marketer, 30, mid to product marketer, mid (launch to launch)", ...common, field: "content marketing", proofKind: "a launch result with a before and after number",
    family: "marketing", title: "Content marketer", tasks: ["Blog posts", "Newsletters", "Landing pages", "Reporting", "SEO"],
    timeUse: { "Blog posts": 35, Newsletters: 20, "Landing pages": 15, Reporting: 15, SEO: 15 }, lastWork: "Pillar page for the analytics product", targetText: "Product marketing manager",
    skillArea: "Position a product against two competitors", skillAreaName: "positioning and messaging",
    roleNowOption: "Content marketer", levelNow: "mid", targetOption: "Product marketer", levelTarget: "mid", workMode: "in-house", industryNow: "software", industryTarget: "media",
    pay: 41000, recognition: "Known for explaining technical products simply", bestWork: "https://example.org/pillar-page", ownPart: "I wrote the page and ran the SEO plan",
    evidence: [["DM-20", "none"], ["DM-22", "I improved the signup page copy and the conversion rose a little"]],
    role: "Product marketer", req1: "Launch results with numbers", req2: "Positioning and messaging work", req3: "Sales enablement material",
    comps: gen("product_marketer", "M"), rubric: "domain_graph", rubricRole: "product_marketer", rubricLevel: "M",
    a1: "I wrote the messaging for a feature release and the launch email, with open rate numbers", a3: "Own a launch and show the result with a number",
    jobPost: "https://example.org/jobs/product-marketing-manager", jobPostNote: "Software", notOwned: "The launch campaign, where product marketing set the plan", skeptic: "Strong writing, no launch results", avoided: "Talking to customers about the product",
  },
  dm_p5: {
    key: "dm_p5", label: "Product designer, 28, to marketing strategist (planned, mapped to content marketer) with a second target (dual)", ...common, field: "product design", proofKind: "a campaign result with numbers",
    family: "design", title: "Product designer", tasks: ["Flows", "Prototypes", "Design reviews", "Brand work", "Handoff"],
    timeUse: { Flows: 40, Prototypes: 20, "Design reviews": 15, "Brand work": 15, Handoff: 10 }, lastWork: "Marketing site refresh", targetText: "Marketing strategist",
    skillArea: "Explain the positioning of a product to a customer", skillAreaName: "positioning and messaging",
    roleNowOption: "Product designer", levelNow: "mid", targetOption: "a role not listed", targetFree: "Marketing strategist", targetMeta: { role: "brand_strategist", role_mapped: true }, levelTarget: "mid", second: "Product designer", workMode: "in-house", industryNow: "travel", industryTarget: "travel",
    pay: 44000, recognition: "Known for brand work that holds together", bestWork: "https://example.org/site-refresh", ownPart: "I designed the pages and wrote the headlines",
    evidence: [["DM-14", 1], ["DM-15", "I chose to cut the booking steps from five to three"], ["DM-20", "none"], ["DM-22", "I tested two headlines on the site and kept the better one"]],
    role: "Marketing strategist", req1: "Positioning and messaging work", req2: "Audience research", req3: "Campaign planning",
    comps: gen("content_marketer", "M"), rubric: "domain_graph", rubricRole: "content_marketer", rubricLevel: "M",
    a1: "I wrote and tested the headlines for the marketing site and kept the version that converted", a3: "Plan a campaign and show the result with a number",
    jobPost: "https://example.org/jobs/marketing-strategist", jobPostNote: "Travel", notOwned: "The campaign that marketing ran on my pages", skeptic: "A designer with no marketing results", avoided: "Reading the analytics reports",
  },
  dm_p6: {
    key: "dm_p6", label: "PR specialist, 34, to UX writer (planned, mapped to content marketer, same industry)", ...common, field: "communications", proofKind: "a writing sample for a product",
    family: "PR and communications", title: "PR specialist", tasks: ["Press releases", "Pitching", "Social posts", "Messaging", "Reports"],
    timeUse: { "Press releases": 30, Pitching: 20, "Social posts": 20, Messaging: 20, Reports: 10 }, lastWork: "Product messaging for a launch", targetText: "UX writer",
    skillArea: "Write interface copy that people understand", skillAreaName: "copywriting",
    roleNowOption: "PR specialist", levelNow: "mid", targetOption: "a role not listed", targetFree: "UX writer", targetMeta: { role: "ux_writer", role_mapped: true }, levelTarget: "mid", workMode: "in-house", industryNow: "software", industryTarget: "software",
    pay: 38000, recognition: "Known for clear plain language", bestWork: "https://example.org/launch-messaging", ownPart: "I wrote the messaging and the launch copy",
    evidence: [["DM-17", 4], ["DM-19", "outcomes"], ["DM-20", "none"], ["DM-22", "I rewrote the help page and support tickets dropped"]],
    role: "UX writer", req1: "Interface copy portfolio", req2: "Working with designers", req3: "Writing for clarity",
    comps: gen("content_marketer", "M"), rubric: "domain_graph", rubricRole: "content_marketer", rubricLevel: "M",
    a1: "I wrote the product messaging for a launch and tested two versions with customers", a3: "Write interface copy for a real flow and test it",
    jobPost: "https://example.org/jobs/ux-writer", jobPostNote: "Software", notOwned: "The launch interview coverage that my director landed", skeptic: "Plenty of PR writing and no interface samples", avoided: "Working in design tools",
  },
};

// The three people of critique 5 (people 9 to 11 of the domain regression), written as that critique described them.
const BUSINESS = "my own business or freelance";
PEOPLE.dm_ux_strategy = {
  key: "dm_ux_strategy", label: "UX researcher, 31, agency, to product strategy (a role not listed: mapped to product designer, senior, with his confirmation; CAD per year)",
  currency: "cad", country: "Canada", field: "ux research", proofKind: "a research report with a decision it changed",
  family: "design", title: "UX researcher", tasks: ["Interviews", "Synthesis", "Reports", "Workshops", "Stakeholder updates"],
  timeUse: { Interviews: 30, Synthesis: 25, Reports: 20, Workshops: 15, "Stakeholder updates": 10 }, lastWork: "Research for a banking app", targetText: "Product strategist",
  skillArea: "Choose which problem a team should solve next", skillAreaName: "product strategy",
  roleNowOption: "none of these", roleNowFree: "UX researcher", roleNowMeta: { role: "product_designer", role_mapped: true }, levelNow: "senior",
  targetOption: "a role not listed", targetFree: "Product strategist", targetMeta: { role: "product_designer", role_mapped: true }, levelTarget: "senior",
  workMode: "agency", industryNow: "banking", industryTarget: "software",
  pay: 125000, recognition: "Known for research that changes what a team builds", bestWork: "https://example.org/banking-research", ownPart: "I ran the study, wrote the report and presented it",
  evidence: [["DM-14", 2], ["DM-15", "I chose to study why people dropped out of the transfer flow"]],
  role: "Product strategist", req1: "Setting product direction", req2: "Research that changes decisions", req3: "Working with senior stakeholders",
  comps: gen("product_designer", "S"), rubric: "domain_graph", rubricRole: "product_designer", rubricLevel: "S",
  a1: "I ran twelve interviews and the report changed which feature the team built first", a3: "Choose the next problem for a team and show the decision it changed",
  jobPost: "https://example.org/jobs/product-strategist", jobPostNote: "Software", notOwned: "The roadmap, where product set the direction", skeptic: "Strong research but no strategy decisions of my own", avoided: "Asking for more money when an offer arrives",
};
PEOPLE.dm_pr_consultancy = {
  key: "dm_pr_consultancy", label: "In-house PR manager, 45, made redundant, wants a brand communications consultancy of his own (a business target; GBP per year)",
  ...common, field: "public relations", proofKind: "a coverage report with links and dates",
  family: "PR and communications", title: "PR manager", tasks: ["Media relations", "Issues", "Internal communications", "Reporting", "Agency management"],
  timeUse: { "Media relations": 30, Issues: 20, "Internal communications": 20, Reporting: 15, "Agency management": 15 }, lastWork: "Annual results announcement", targetText: "My own brand communications consultancy",
  skillArea: "Win a first client from a cold introduction", skillAreaName: "selling",
  roleNowOption: "PR specialist", levelNow: "senior", targetOption: BUSINESS, targetFree: "Brand communications consultant", targetMeta: { role: "pr_specialist", role_mapped: true }, levelTarget: "lead",
  workMode: "in-house", industryNow: "consumer goods", industryTarget: "consumer goods",
  pay: 62000, recognition: "Known for calm handling of a difficult announcement", bestWork: "https://example.org/results-announcement", ownPart: "I wrote the plan and led the media briefing",
  evidence: [["DM-17", 14], ["DM-19", "outcomes"]],
  role: "Brand communications consultant", req1: "Earned media placements", req2: "Measurement beyond clippings", req3: "Winning and keeping clients",
  comps: gen("pr_specialist", "L"), rubric: "domain_graph", rubricRole: "pr_specialist", rubricLevel: "L",
  a1: "I secured fourteen placements in named outlets and wrote the coverage report", a3: "Win a first paying client and show the result",
  jobPost: "https://example.org/jobs/communications-consultant", jobPostNote: "Consumer goods", notOwned: "The results announcement, where the finance team set the message", skeptic: "No client has ever paid me directly", avoided: "Putting a price on my own work",
};
PEOPLE.dm_social_perf = {
  key: "dm_social_perf", label: "Social media manager, 24, to performance marketer, then growth lead (a second target that comes after the first; INR per month)",
  currency: "inr", country: "India", field: "social media marketing", proofKind: "a campaign result with a before and after number",
  family: "marketing", title: "Social media manager", tasks: ["Posting", "Community replies", "Reporting", "Paid boosts", "Creators"],
  timeUse: { Posting: 30, "Community replies": 25, Reporting: 15, "Paid boosts": 20, Creators: 10 }, lastWork: "Festival campaign for a D2C brand", targetText: "Performance marketer",
  skillArea: "Run paid campaigns and read the attribution report", skillAreaName: "paid media",
  roleNowOption: "none of these", roleNowFree: "Social media manager", roleNowMeta: { role: "content_marketer", role_mapped: true }, levelNow: "junior",
  targetOption: "a role not listed", targetFree: "Performance marketer", targetMeta: { role: "content_marketer", role_mapped: true }, levelTarget: "mid",
  second: "other: Growth lead", secondMeta: { sequential: true }, secondFollow: "after it",
  workMode: "in-house", industryNow: "consumer brands", industryTarget: "consumer brands",
  pay: 40000, recognition: "Known for posts that people share", bestWork: "https://example.org/festival-campaign", ownPart: "I wrote the posts and ran the paid boosts",
  evidence: [["DM-20", "ROAS of about 4 on 20,000 rupees, I think"], ["DM-22", "I tested two creatives and kept the one that converted"]],
  role: "Performance marketer", req1: "Paid media results with numbers", req2: "Attribution and measurement", req3: "Running experiments",
  comps: gen("content_marketer", "M"), rubric: "domain_graph", rubricRole: "content_marketer", rubricLevel: "M",
  a1: "I ran the paid boosts for a festival campaign and kept the creative that converted", a3: "Run a paid campaign and show the attribution with a number",
  jobPost: "https://example.org/jobs/performance-marketer", jobPostNote: "Consumer brands", notOwned: "The festival media plan, which the agency set", skeptic: "A lot of posting and a hedged number", avoided: "Opening the attribution report",
};


// HR and organisation development (2026-10-21, research notes in handoff-docs/specs/hr-od-domain-research.md). Three people who move from HR practice
// (family H) into HR consulting, transformation, OD or people analytics (family O). All roles are launch roles, so nothing is mapped and no planned role is used.
// Fictional interview scripts, written like the others: every answer is literal and goes through onboard.answer.
const HRC = { currency: "inr", country: "India", family: "HR and organisation development", offLimits: undefined };
PEOPLE.dm_hr_transform = {
  key: "dm_hr_transform", label: "Traditional HR generalist, 28, mid to HR transformation consultant, mid (practice into consulting; launch to launch; INR per year)",
  ...HRC, field: "human resources", proofKind: "a client-ready deliverable with a recommendation",
  title: "HR generalist", tasks: ["Employee queries", "Onboarding", "Policy updates", "HR reports", "Payroll inputs"],
  timeUse: { "Employee queries": 30, Onboarding: 20, "Policy updates": 15, "HR reports": 20, "Payroll inputs": 15 }, lastWork: "Leave policy rollout for four sites", targetText: "HR transformation consultant",
  skillArea: "Map an HR process and redesign it with the time saved", skillAreaName: "process redesign",
  roleNowOption: "HR generalist", levelNow: "mid", targetOption: "HR transformation consultant", levelTarget: "mid", workMode: "in-house", industryNow: "manufacturing", industryTarget: "professional services",
  pay: 900000, recognition: "Known for keeping HR records clean and answering queries fast", bestWork: "https://example.org/leave-policy-rollout", ownPart: "I wrote the policy note and briefed the managers myself",
  evidence: [["DM-51", null, { status: "unknown" }], ["DM-52", "I supported the leave policy rollout by briefing 40 managers and tracking questions"], ["DM-53", "I compared attrition by tenure at one site and my manager changed the notice rules"], ["DM-55", "I cut the onboarding checklist from 14 steps to 9"]],
  role: "HR transformation consultant", req1: "HR operating model design", req2: "Process redesign for HR", req3: "Stakeholder management with senior clients",
  comps: gen("hr_transformation_consultant", "M"), rubric: "domain_graph", rubricRole: "hr_transformation_consultant", rubricLevel: "M",
  a1: "I mapped the onboarding process for four sites and cut the checklist, my part was the map and the new checklist", a3: "Redesign an HR process and show the time saved with a number",
  jobPost: "https://example.org/jobs/hr-transformation-consultant", jobPostNote: "Professional services", notOwned: "The HR system rollout, where the vendor set the design", skeptic: "A lot of HR admin and no client-facing deliverable", avoided: "Presenting findings to senior leaders",
};
PEOPLE.dm_hr_od = {
  key: "dm_hr_od", label: "HR business partner, 33, senior to organisation development consultant, mid (practice into OD; launch to launch; INR per year)",
  ...HRC, field: "human resources", proofKind: "a diagnosis with a recommendation",
  title: "HR business partner", tasks: ["Manager coaching", "Workforce planning", "Employee relations", "Talent reviews", "Org changes"],
  timeUse: { "Manager coaching": 25, "Workforce planning": 20, "Employee relations": 20, "Talent reviews": 20, "Org changes": 15 }, lastWork: "Sales team restructure", targetText: "Organisation development consultant",
  skillArea: "Run a diagnosis of a team and choose an intervention", skillAreaName: "OD diagnosis",
  roleNowOption: "HR business partner", levelNow: "senior", targetOption: "Organisation development consultant", levelTarget: "mid", workMode: "in-house", industryNow: "software", industryTarget: "software",
  pay: 2400000, recognition: "Known for calm handling of difficult team conversations", bestWork: "https://example.org/sales-restructure", ownPart: "I ran the interviews and wrote the options note",
  evidence: [["DM-51", "A restructure options note for a sales team with two structures and the criteria"], ["DM-52", "I led the move of a sales team to a new structure and tracked adoption of the new reporting lines"], ["DM-53", "I used attrition and span data to argue against a split of one team"], ["DM-57", "A two-hour team workshop for 12 people on how the team decides"]],
  role: "Organisation development consultant", req1: "Diagnosis and intervention design", req2: "Facilitation of groups", req3: "Change management",
  comps: gen("od_consultant", "M"), rubric: "domain_graph", rubricRole: "od_consultant", rubricLevel: "M",
  a1: "I ran six interviews for the sales team restructure and wrote the options note, my part was the interviews and the note", a3: "Run a diagnosis for a team and show what changed after the intervention",
  jobPost: "https://example.org/jobs/od-consultant", jobPostNote: "Software", notOwned: "The final decision on the sales structure, which the vice president took", skeptic: "A strong business partner with no OD credential and no diagnosis on paper", avoided: "Facilitating a workshop without a script",
};
PEOPLE.dm_hr_analytics = {
  key: "dm_hr_analytics", label: "Recruiter, 26, mid to people analytics analyst, mid (practice into analytics; launch to launch; INR per year)",
  ...HRC, field: "talent acquisition", proofKind: "one analysis with a recommendation",
  title: "Recruiter", tasks: ["Sourcing", "Screening", "Interview scheduling", "Offers", "Hiring reports"],
  timeUse: { Sourcing: 30, Screening: 25, "Interview scheduling": 15, Offers: 10, "Hiring reports": 20 }, lastWork: "Hiring funnel report for engineering", targetText: "People analytics analyst",
  skillArea: "Read an attrition table and say what to check next", skillAreaName: "people analytics",
  roleNowOption: "Talent acquisition specialist", levelNow: "mid", targetOption: "People analytics analyst", levelTarget: "mid", workMode: "in-house", industryNow: "software", industryTarget: "software",
  pay: 1100000, recognition: "Known for the cleanest hiring reports on the team", bestWork: "https://example.org/hiring-funnel-report", ownPart: "I built the report and wrote the three findings",
  evidence: [["DM-51", null, { status: "unknown" }], ["DM-52", null, { status: "unknown" }], ["DM-53", "I showed that offers took 12 days longer for one team and the hiring manager changed the approval step"], ["DM-54", "Workday recruiting reports, my part was the report build"]],
  role: "People analytics analyst", req1: "SQL and Power BI", req2: "Analysis with a recommendation", req3: "Explaining numbers to non-technical audiences",
  comps: gen("people_analyst", "M"), rubric: "domain_graph", rubricRole: "people_analyst", rubricLevel: "M",
  a1: "I built the hiring funnel report and found that one team's offers took twelve days longer, my part was the report and the finding", a3: "Run one analysis end to end and show the decision it changed",
  jobPost: "https://example.org/jobs/people-analytics-analyst", jobPostNote: "Software", notOwned: "The approval step change, which the hiring manager made", skeptic: "Strong reporting but no analysis written up with a method", avoided: "Writing SQL without a template",
};

/** The regression records (same shape as REGRESSION in onboarding-personas.mjs); `verify` is added by scripts/domains-regression.mjs. */
export const DOMAIN_PEOPLE = Object.fromEntries(Object.entries(PEOPLE).map(([k, p]) => [k, {
  label: p.label, steps: () => build(p), different_person: true,
  expect: { status: "complete", readiness: "ready", researched: true, currency: p.currency.toUpperCase(), off_limits: p.offLimits ? ["F-11", "F-10", "F-12", "B-20", "B-36"] : [], refused: p.offLimits ? 1 : 0 },
  spec: p,
}]));

/**
 * dm_retarget: dm_p4 completes the interview, THEN changes target with onboard.target (the `target` command). Two attempts are
 * refused on purpose: a role that is not a launch role without his confirmation, and a level the ladder has no step for.
 */
const P4 = PEOPLE.dm_p4;
DOMAIN_PEOPLE.dm_retarget = {
  label: "Content marketer after a completed interview changes target (the target command): the status stays complete",
  steps: () => [
    ...build(P4),
    { a: { type: "onboard.target", role: "Creative director", level: "lead" }, say: "Change target to a planned role without his yes", expect: "refuse" },
    { a: { type: "onboard.target", role: "PR specialist", level: "head" }, say: "Change target to a level the ladder has no step for", expect: "refuse" },
    { a: { type: "onboard.target", role: "Product marketer", level: "senior", second: "Content marketer" }, say: "Change target: product marketer, senior, with a second target" },
  ],
  different_person: true,
  expect: { status: "complete", readiness: "ready", researched: true, currency: "GBP", off_limits: [], refused: 2 },
  spec: P4,
};

/**
 * dm_dev: The person's own flow (the product designer of dm_p1) with the two copies critique 5 found: his Round 4 answer to T-09 repeats
 * his Round 3 answer to R3-01 word for word, and T-05 repeats R3-16. `complete` is refused with the one command in the message, the
 * harness sends that one command (onboard.redact, no id), and the same `complete` is accepted. No file is edited by hand.
 */
const P1 = PEOPLE.dm_p1;
DOMAIN_PEOPLE.dm_dev = {
  label: "The person's flow: R4 repeats R3 word for word (T-09 against R3-01, T-05 against R3-16); one onboard.redact, then complete, no manual edit",
  steps: () => {
    const base = build({ ...P1, key: "dm_dev" });
    const r301 = base.find((x) => x.a.type === "onboard.answer" && x.a.id === "R3-01").a.value;
    const scroll = "Scrolling at night instead of making my case study better every single evening";
    const out = [];
    for (const st of base) {
      if (st.a.type === "onboard.answer" && st.a.id === "T-09") { out.push({ ...st, a: { ...st.a, value: r301 } }); continue; }
      if (st.a.type === "onboard.answer" && st.a.id === "T-05") { out.push({ ...st, a: { ...st.a, value: [scroll] } }); continue; }
      if (st.a.type === "onboard.answer" && st.a.id === "DM-37") out.push({ a: { type: "onboard.answer", id: "R3-16", value: scroll }, say: "Answer R3-16" });
      if (st.a.type === "onboard.round" && st.a.complete === true) {
        out.push({ ...st, expect: "refuse", say: "Complete is refused: the check has a FAIL and names the one command" });
        out.push({ a: { type: "onboard.redact" }, say: "The one command: redact every public copy (intake, task, risk)" });
      }
      out.push(st);
    }
    return out;
  },
  different_person: true,
  expect: { status: "complete", readiness: "ready", researched: true, currency: "GBP", off_limits: [], refused: 1 },
  spec: P1,
};
