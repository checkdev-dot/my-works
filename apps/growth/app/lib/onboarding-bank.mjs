// The onboarding question bank, as data. One source for: the skill files, scripts/onboarding-lint.mjs,
// scripts/onboarding-check.mjs, the store actions and the mapper (lib/onboarding.mjs).
// Pure: no node built-ins, so the app, the scripts and the validator can all import it.
//
// Per question: { id, round, must, hard, text, type, options, fields, why, changes, writes, validate, follow_up,
//   evidence_ask, bias_guard, consumer, unknown: { task_kind, method, gap, placement, default? } }
//   must          true = the plan engine or gap sizing cannot run without it (MUST). false = NICE.
//   hard          counts 1.5 against the sitting limit; at most 3 in a row.
//   evidence_ask  E0 none, E1 artifact (link, file), E2 number with date and source, E3 third party named and dated.
//   bias_guard    SD social desirability, AN anchoring, AQ acquiescence, SR self rating, RC recall, HI hindsight, DB double barrel checked.
//   writes        live field paths (see MODEL_PATHS). Every answer also lands in onboarding.answers.<id>.
//   consumer      what the answer DOES: field (a live profile or evidence field), demand, task, risk, gap, brief, gate, feeds.
//                 `changes` must be true about it; scripts/onboarding-fixtures.mjs proves each consumer with a fixture answer.
//   unknown       what an "I don't know" becomes: task_kind U1 to U5 (see UNKNOWN_KINDS) or "none" when it is accepted as an answer.
// Wording rule: one decision per question. Alternatives live in `options`, never in the text. Follow-ups are asked only after the answer is saved.
// Universal: no field, currency or channel is assumed. Placeholders ({currency}, {period}, {role}, {target_role}, {artifact},
// {field}, {core_skill}, {market_action}) are filled from the person's own earlier answers by resolveText().

export const ROUNDS = ["R0", "R1", "R2", "R3", "R4", "R5"];
export const ROUND_NAMES = { R0: "Set-up and consent", R1: "Baseline", R2: "Industry-informed", R3: "Deep truth", R4: "Timelines and commitment", R5: "Gaps we could not fill" };

/** What each kind of unknown becomes. how/how_kind/owner are the ledger fields; plan_kind is the plan engine task kind. */
export const UNKNOWN_KINDS = {
  U1: { label: "diagnostic task", how: "task", how_kind: "diagnostic", owner: "dev", plan_kind: "practice", minutes: 25 },
  U2: { label: "research task, done by Claude", how: "research", how_kind: undefined, owner: "claude", plan_kind: null, minutes: 0 },
  U3: { label: "evidence task", how: "task", how_kind: "evidence", owner: "dev", plan_kind: "proof", minutes: 20 },
  // 15 minutes: the plan placer accepts 15 to 60, so an ask task can always be placed.
  U4: { label: "ask a named person", how: "ask", how_kind: "person", owner: "dev", plan_kind: "practice", minutes: 15 },
  U5: { label: "observe and log", how: "observe", how_kind: "log", owner: "dev", plan_kind: "practice", minutes: 15 },
};

/** Every live field a question may write. The lint script checks each `writes` entry is here and each leaf is in lib/types.ts. */
export const MODEL_PATHS = [
  "profile.role_now", "profile.north_star.role", "profile.north_star.waypoint", "profile.north_star.salary_inr_per_month",
  "profile.north_star.recognition", "profile.north_star.timeline", "profile.north_star.feeling", "profile.north_star.trigger",
  "profile.constraints.hours_per_day", "profile.constraints.hours_per_week", "profile.constraints.avoid", "profile.constraints.salary_floor_inr",
  "profile.constraints.blocked_days", "profile.constraints.stop_doing", "profile.constraints.learns_best_by",
  "profile.constraints.learning_mode", "profile.constraints.risk_stance", "profile.constraints.focus_hours_weekday",
  "profile.constraints.known_disruptions", "profile.constraints.stay_rule",
  "profile.situation.runway_months", "profile.situation.notice_days", "profile.situation.notice_paid", "profile.situation.dependents",
  "profile.situation.location_pref", "profile.situation.places", "profile.situation.work_auth",
  "profile.situation.currency", "profile.situation.pay_period", "profile.situation.country", "profile.situation.field",
  "profile.situation.proof_kind", "profile.situation.role_start", "profile.situation.fixed_costs_monthly", "profile.situation.debt_total",
  "profile.situation.household_cover_months", "profile.situation.work_limits", "profile.situation.internal_option",
  "profile.situation.credential", "profile.situation.history", "profile.situation.history_reason",
  "profile.baseline.time_use", "profile.baseline.hours_actual_4w", "profile.baseline.salary_now_inr", "profile.baseline.salary_range",
  "profile.baseline.salary_why", "profile.baseline.salary_source", "profile.baseline.priority", "profile.baseline.refusals",
  "profile.baseline.funnel", "profile.baseline.interviews", "profile.baseline.network_size",
  "profile.pace", "profile.intake", "profile.beliefs_to_test",
  "evidence.entries", "skills.ratings", "proof.items", "library.gaps", "demands.items",
  "profile.situation.status", "profile.situation.obligations", "profile.situation.education", "profile.situation.can_move", "profile.situation.hard_date",
  "profile.constraints.energy_evenings", "profile.exploration.energisers", "profile.exploration.field_or_job", "profile.exploration.try_month", "profile.strengths",
  "onboarding.depth", "onboarding.sitting.budget_min", "onboarding.tone", "onboarding.off_limits", "onboarding.consent", "onboarding.notes", "onboarding.answers",
  "onboarding.tasks", "onboarding.risks", "onboarding.skill_map",
  "prior.confirmed",
  // domain graph (lib/domain-bank.mjs); every leaf is also in lib/types.ts, see handoff-docs/specs/domain-wiring-todo.md
  "profile.domain.family_now", "profile.domain.role_now", "profile.domain.level_now", "profile.domain.targets",
  "profile.domain.context.work_mode", "profile.domain.context.team_size",
  "profile.domain.evidence.case_studies", "profile.domain.evidence.placements", "profile.domain.evidence.best_result",
  "profile.domain.evidence.budget_owned", "profile.domain.evidence.people_managed", "profile.domain.evidence.measure_level",
  "profile.domain.evidence.public_presence", "profile.domain.evidence.tools", "profile.domain.evidence.channel", "profile.domain.evidence.experiment",
  "profile.domain.industry_now", "profile.constraints.project_hours_per_week", "profile.domain.target_setting", "profile.domain.target_level", "profile.domain.target_words", "profile.domain.second_words", "profile.domain.gap_preview", "profile.domain.blockers", "profile.domain.shared_first", "profile.domain.reviewer", "profile.domain.proof_project",
  "profile.situation.work_mode", "profile.situation.family_now", "onboarding.research",
];

/** What a question's answer does. Checked by the lint script and proved by the fixtures. */
export const CONSUMER_KINDS = ["field", "demand", "task", "risk", "gap", "brief", "gate", "feeds"];

const FACT = "fact";
const Q = (id, round, o) => ({ id, round, must: true, hard: false, options: null, fields: null, follow_up: [], evidence_ask: "E0", bias_guard: [], meta: null, meta_required: [], consumer: { kind: "field", what: "" }, ...o });
const unk = (task_kind, method, gap, placement, def) => ({ task_kind, method, gap, placement, ...(def !== undefined ? { default: def } : {}) });
const NONE = (gap, def) => unk("none", "Accepted as an answer", gap, "none", def);
const f = (n, text, when) => ({ n, text, ...(when ? { when } : {}) });
const C = (kind, what) => ({ kind, what });

const PRIORITIES = ["pay", "skill growth", "scope and ownership", "stability", "flexibility", "name brand", "mission"];

// ---- vocabulary: placeholders resolved from the person's own earlier answers ---------------------------------------
export const VOCAB_DEFAULTS = {
  role: "your current role", target_role: "your target role", currency: "your currency", period: "month",
  artifact: "your work", field: "your field", core_skill: "your core skill", market_action: "applications or direct approaches", outcome: "an offer",
};
const VOCAB_RE = /\{(role|target_role|currency|period|artifact|field|core_skill|market_action|outcome)\}/g;
/** Fills the vocabulary placeholders. {n}, {low}, {high}, {competency} and {credential} are filled by the brief or the model. */
export function resolveText(text, vocab = {}) {
  const v = { ...VOCAB_DEFAULTS };
  for (const [k, x] of Object.entries(vocab || {})) if (typeof x === "string" && x.trim()) v[k] = x.trim();
  return String(text).replace(VOCAB_RE, (_, k) => v[k]);
}
/** A copy of the question with its text, options and follow-ups resolved for this person. */
export function renderQuestion(q, vocab = {}) {
  return { ...q, text: resolveText(q.text, vocab), options: q.options ? q.options.map((o) => resolveText(o, vocab)) : q.options, follow_up: (q.follow_up || []).map((x) => ({ ...x, text: resolveText(x.text, vocab) })) };
}

/** The placeholder rubric an onboarding reset writes: one generic competency, marked generic, until Round 2 writes the real one. */
export const GENERIC_RUBRIC = {
  _about: "Placeholder written by an onboarding reset. It is not a ladder for any field. Round 2 replaces it with a researched rubric (onboard.rubric); the earlier rubric is archived in prior.json.",
  generic: true,
  levels: { 1: "Starting: does the work with guidance", 2: "Working: does the work alone", 3: "Strong: does it well and teaches others", 4: "Leading: sets the standard for others" },
  competencies: [
    {
      id: "core_skill", name: "Core skill of your target role", group: "skill",
      levels: { 1: "Does the core work with guidance", 2: "Does the core work alone", 3: "Does the core work well and raises the bar for others", 4: "Sets the standard for the core work" },
    },
  ],
};

const R0 = [
  Q("R0-01", "R0", { text: "How long can each sitting be, in minutes?", type: "mcq", options: ["20", "40", "60"], why: "It sets how many questions I ask in one sitting.", changes: "Questions per sitting: 3 at 20 minutes, 6 at 40, 7 at 60.", writes: ["onboarding.sitting.budget_min"], validate: { kind: "mcq" }, bias_guard: ["DB"], consumer: C("gate", "sitting.max is derived from the budget"), unknown: NONE("Defaults to 40 minutes", "40") }),
  Q("R0-02", "R0", { text: "For the hard questions, which tone do you want?", type: "mcq", options: ["straight", "straight with check-ins", "slower"], why: "It decides how often I check in with you.", changes: "How often I check in during Round 3: never, every 3 hard questions, or after each.", writes: ["onboarding.tone"], validate: { kind: "mcq" }, bias_guard: ["AQ"], consumer: C("brief", "check_in_every in the onboarding brief"), unknown: NONE("Defaults to straight with check-ins", "straight with check-ins") }),
  Q("R0-03", "R0", { text: "Which topics are off limits for my questions? Write none if there are not any.", type: "list", why: "I will not ask what you have ruled out.", changes: "Which questions are never asked, with the consequence shown.", writes: ["onboarding.off_limits"], validate: { kind: "list", min: 1 }, bias_guard: ["SD"], consumer: C("gate", "off_limits refuses those answers"), unknown: NONE("An empty list is valid", "none") }),
  Q("R0-11", "R0", { must: false, text: "How deep should this interview go?", type: "mcq", options: ["quick", "standard", "deep"], why: "Optional questions add depth and cost time.", changes: "Quick asks only what the plan needs, standard adds the most useful few, deep offers every question.", writes: ["onboarding.depth"], validate: { kind: "mcq" }, bias_guard: ["AQ"], consumer: C("gate", "depth decides how many optional questions the brief offers"), unknown: NONE("Defaults to standard", "standard") }),
  Q("R0-04", "R0", { must: false, text: "Here are facts I held about you before this reset. For each one, mark: still true, changed, not sure.", type: "list_mcq", options: ["still true", "changed", "not sure"], why: "It decides which earlier facts I may reuse.", changes: "Which prior facts may be reused as they are.", writes: ["prior.confirmed"], validate: { kind: "list_mcq", min: 1 }, follow_up: [f(1, "What is true now?", "answer is changed")], bias_guard: ["AQ"], consumer: C("field", "prior.confirmed"), unknown: unk("U3", "Find the source for each fact marked not sure", "A prior fact stays unconfirmed", "Before the task that relies on it") }),
  Q("R0-06", "R0", { text: "In which currency do you think about pay? Write the three letter code, for example USD.", type: "free", why: "Every money question uses it.", changes: "The currency in every money question and every salary demand.", writes: ["profile.situation.currency"], validate: { kind: "currency" }, consumer: C("field", "situation.currency, used in demand text"), unknown: NONE("Defaults to the currency in your first pay answer", "USD") }),
  Q("R0-07", "R0", { text: "How do you usually think about pay?", type: "mcq", options: ["per month", "per year"], why: "Pay questions are asked in your unit.", changes: "Whether pay answers are read per month or per year, then stored per month.", writes: ["profile.situation.pay_period"], validate: { kind: "mcq" }, consumer: C("field", "situation.pay_period, converts answers to monthly"), unknown: NONE("Defaults to per month", "per month") }),
  Q("R0-08", "R0", { text: "Which country do you live in?", type: "free", why: "It sets the market I research and the support line I show.", changes: "The market I research and the crisis line in Safety.", writes: ["profile.situation.country"], validate: { kind: "free", min: 2 }, consumer: C("field", "situation.country, picks the support line"), unknown: NONE("The market stays global and I show findahelpline.com", "unknown") }),
  Q("R0-09", "R0", { text: "What field do you work in? Name it in a few words.", type: "free", why: "It sets the vocabulary of every later question.", changes: "The words I use for your field and the rubric I research.", writes: ["profile.situation.field"], validate: { kind: "free", min: 3 }, consumer: C("field", "situation.field, filled into {field}"), unknown: NONE("I use your role title", "unknown") }),
  Q("R0-10", "R0", { text: "What counts as proof of good work in your field? Name one kind of thing a stranger could open.", type: "free", why: "Proof tasks ask for that kind of thing.", changes: "What every proof task asks you to produce.", writes: ["profile.situation.proof_kind"], validate: { kind: "free", min: 3 }, consumer: C("field", "situation.proof_kind, filled into {artifact}"), unknown: NONE("I ask for a link, file or number", "a link, file or number") }),
  Q("R0-05", "R0", { text: "Ground rules: direct questions, pause any time, career coaching only. Do you want to start Round 1?", type: "mcq", options: ["yes, start Round 1", "not yet"], why: "Round 1 does not start without your own yes.", changes: "Whether Round 1 starts.", writes: ["onboarding.consent"], validate: { kind: "mcq" }, consumer: C("gate", "consent.R0 opens Round 1"), unknown: NONE("No yes means no Round 1") }),
];

const R1 = [
  Q("B-01", "R1", { text: "What is your job title today? Write owner if you run your own business.", type: "free", why: "It is the starting point of the bridge.", changes: "Where you start in the plan.", writes: ["profile.role_now"], validate: { kind: "free", min: 2 }, bias_guard: ["DB"], consumer: C("field", "profile.role_now, filled into {role}"), unknown: NONE("Not applicable") }),
  Q("S-01", "R1", { must: false, text: "Which of these describes your work situation today?", type: "mcq", options: ["employed", "self-employed or business owner", "between jobs", "studying", "caring or not working", "other"], why: "It decides which questions apply to you.", changes: "Whether the notice, contract and owner questions are asked.", writes: ["profile.situation.status"], validate: { kind: "mcq" }, follow_up: [f(1, "Say it in your own words.", "answer is other")], bias_guard: ["DB"], consumer: C("field", "situation.status, decides the employer questions"), unknown: NONE("Accepted as other", "other") }),
  Q("S-02", "R1", { must: false, text: "Which signed obligations would still run after you stop?", type: "list", why: "An exit date is set by what is signed.", changes: "The earliest date you could stop.", writes: ["profile.situation.obligations"], validate: { kind: "list", min: 1 }, bias_guard: ["SD"], consumer: C("field", "situation.obligations"), unknown: unk("U3", "List each signed document with its end date", "Obligations unknown", "Week 1, night 2") }),
  Q("B-32", "R1", { must: false, text: "In which month did you start that job? Write YYYY-MM.", type: "free", why: "Tenure shapes how a hiring manager reads you.", changes: "Your tenure in the role, shown with your starting point.", writes: ["profile.situation.role_start"], validate: { kind: "month" }, bias_guard: ["RC"], consumer: C("field", "situation.role_start"), unknown: NONE("Not applicable") }),
  Q("B-02", "R1", { text: "List up to five things you spend your working week on, in your own words.", type: "list", why: "It shows the job you do against the job you want.", changes: "The categories of the next question.", writes: ["profile.baseline.time_use"], validate: { kind: "list", min: 1, max: 5 }, bias_guard: ["RC"], consumer: C("feeds", "B-31 uses these as its categories"), unknown: unk("U5", "Log what you work on for 5 working days", "Real time use unknown", "Week 1, nights 1 to 3") }),
  Q("B-31", "R1", { text: "For each of those, what percent of a normal week is it? They must total 100.", type: "timeuse", why: "The job you do against the job you want.", changes: "Which skills get daily practice and which need a new setting.", writes: ["profile.baseline.time_use"], validate: { kind: "timeuse_of", of: "B-02" }, follow_up: [f(1, "Which of these is closest to the work your next role does most?")], evidence_ask: "E2", bias_guard: ["SD", "RC"], consumer: C("field", "baseline.time_use with the person's own keys"), unknown: unk("U5", "Log hours by category for 5 working days", "Real time use unknown", "Week 1, nights 1 to 3") }),
  Q("B-03", "R1", { text: "Name the last example of {artifact} that you completed. Include the month it was done.", type: FACT, fields: ["name", "month"], why: "It anchors what recent work means for you.", changes: "The first piece of evidence, and the proof tasks that follow.", writes: ["evidence.entries"], validate: { kind: "fact", fields: ["name", "month"], month_fields: ["month"] }, follow_up: [f(1, "What was your exact part?"), f(2, "What changed because of it? Give a number if you have one.")], evidence_ask: "E1", bias_guard: ["RC"], consumer: C("field", "an evidence entry, and a prove-it task without a link"), unknown: unk("U3", "Find the link or a screenshot of the last finished work", "Recent work has no proof", "Before any skill task") }),
  Q("B-04", "R1", { text: "What role do you want next, written as the title in a job post you would apply to today?", type: "free", why: "It is the target the whole course aims at.", changes: "The target role, the rubric I research and the first target list.", writes: ["profile.north_star.role"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "Paste two live job posts with that title that you would apply to today.", "the title is generic")], evidence_ask: "E1", bias_guard: ["AN", "DB"], consumer: C("field", "north_star.role, filled into {target_role}"), unknown: unk("U2", "Collect 5 live posts for the stated direction, then ask which 2 fit", "Target role is vague", "Before Round 2") }),
  Q("B-05", "R1", { must: false, text: "If the next role goes well, what role comes after it, three to five years out?", type: "free", why: "It separates the next step from the destination.", changes: "The waypoint shown with your goal.", writes: ["profile.north_star.waypoint"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "What does that role let you do that the next one does not?")], bias_guard: ["AN"], unknown: unk("U2", "Research common career paths from the target role", "Waypoint left empty", "Before Round 4") }),
  Q("B-06", "R1", { meta: { skill_area: "REQUIRED: the skill area this task is about, in his words, two or three words; if the answer names none, ask B-06.f1 FIRST and its answer fills it" }, meta_required: ["skill_area"], text: "Name one concrete task you would do in {target_role} that you cannot do well today.", type: "free", why: "It seeds your first gap in your own words.", changes: "The first gap and its title, once its skill area is mapped to the rubric in Round 2.", writes: ["library.gaps"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "Which skill is that task mostly about? Name it in a few words.", "the answer names no skill"), f(2, "What happens the first time you try it today?")], bias_guard: ["RC"], consumer: C("gap", "the first gap, after the skill area is mapped"), unknown: unk("U1", "Attempt the task for 25 minutes and note where it breaks", "The first gap has no measured start", "Week 1, night 1") }),
  Q("B-07", "R1", { text: "What do you earn per {period} now, before tax, in {currency}?", type: "num", why: "It is the baseline of the salary demand.", changes: "The salary demand and the cost of staying.", writes: ["profile.baseline.salary_now_inr"], validate: { kind: "num", min: 0 }, evidence_ask: "E2", bias_guard: ["SD"], consumer: C("field", "baseline.salary_now_inr, stored per month"), unknown: unk("U3", "Read the latest payslip or statement and note gross pay", "Current pay unknown", "Week 1, night 1") }),
  Q("B-08", "R1", { text: "What range of pay per {period} would feel right for {target_role}, in {currency}? Give a low value, then a high value.", type: "numpair", why: "It is the wish, asked before I show you any market number.", changes: "The salary range, kept as a wish until it is sourced.", writes: ["profile.baseline.salary_range"], validate: { kind: "numpair", min: 0 }, bias_guard: ["AN"], consumer: C("field", "baseline.salary_range, stored per month"), unknown: unk("U2", "Research the range for the role and place, then ask again in Round 2", "Salary wish is empty", "Round 2 entry") }),
  Q("B-33", "R1", { text: "Which single number in that range would make you say yes?", type: "num", why: "The plan needs one target, and the midpoint is my guess, not yours.", changes: "The salary target in your goal and the D-salary demand.", writes: ["profile.north_star.salary_inr_per_month", "demands.items"], validate: { kind: "num", min: 0 }, bias_guard: ["AN"], consumer: C("demand", "D-salary, never hard, flagged if below the floor"), unknown: unk("U1", "Write the number you would sign for tomorrow and test it against one job post", "No salary target", "Week 1, night 2") }),
  Q("F-10", "R1", { text: "What are your fixed costs per {period}, in {currency}, that you cannot stop?", type: "num", why: "It sets the real floor and the runway.", changes: "Whether your floor covers your costs, and how much risk the plan may take.", writes: ["profile.situation.fixed_costs_monthly"], validate: { kind: "num", min: 0 }, evidence_ask: "E2", bias_guard: ["RC"], consumer: C("field", "situation.fixed_costs_monthly, checked against the floor"), unknown: unk("U1", "List last month's bills and add them up", "Fixed costs unknown, so the floor is unchecked", "Week 1, night 2") }),
  Q("B-10", "R1", { text: "What is the lowest pay per {period} you would accept, in {currency}, before tax?", type: "num", hard: true, why: "It is the one number the plan may never trade away.", changes: "The hard salary floor demand (D-floor).", writes: ["profile.constraints.salary_floor_inr", "demands.items"], validate: { kind: "num", min: 0 }, follow_up: [f(1, "Would you take it if the role gave you real mentoring?"), f(2, "What breaks if you took a smaller step first?", "floor is over 60 percent above current pay")], bias_guard: ["AN"], consumer: C("demand", "D-floor, hard"), unknown: unk("U1", "List your fixed monthly costs and add them up", "No floor, so the salary demand stays a wish", "Week 1, night 2") }),
  Q("B-09", "R1", { must: false, text: "What would that money change in your life, specifically?", type: "free", why: "It finds the real driver behind the number.", changes: "Whether the salary is a need, a proxy or a wish.", writes: ["profile.baseline.salary_why"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "What would that give you?"), f(2, "Why does that one matter?")], bias_guard: ["SD"], unknown: NONE("Accepted as an answer") }),
  Q("B-11", "R1", { must: false, text: "Where did your target number come from?", type: "mcq", options: ["a person", "a job post", "a salary site", "a feeling", "other"], why: "It decides if the number is sourced or a wish.", changes: "Whether the salary demand is marked a wish.", writes: ["profile.baseline.salary_source"], validate: { kind: "mcq" }, follow_up: [f(1, "Name it so I can check.", "answer is a person or a salary site")], evidence_ask: "E1", bias_guard: ["SD"], unknown: unk("U2", "Research where the number sits in the market", "Salary source unknown", "Round 2 entry") }),
  Q("B-12", "R1", { text: "In one sentence, what do you want to be known for that you are not known for now?", type: "free", why: "It is the recognition goal, which is half of the course.", changes: "The recognition demand and the reach tasks.", writes: ["profile.north_star.recognition", "demands.items"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "Who would say it?")], bias_guard: ["AQ"], consumer: C("demand", "D-recog-n"), unknown: NONE("Accepted as an answer") }),
  Q("B-13", "R1", { must: false, text: "Which ONE matters most in your next job?", type: "mcq", options: PRIORITIES, why: "It sets the order for every trade-off I show you.", changes: "Which roles rank first and what the plan protects.", writes: ["profile.baseline.priority"], validate: { kind: "mcq" }, bias_guard: ["AQ"], unknown: NONE("Accepted as an answer") }),
  Q("B-14", "R1", { must: false, text: "Which one would you give up first?", type: "mcq", options: PRIORITIES, why: "It completes the top and bottom of your priorities.", changes: "What the plan may trade when time is short.", writes: ["profile.baseline.priority"], validate: { kind: "mcq", differs_from: "B-13" }, follow_up: [f(1, "Give up how much of it, concretely?")], bias_guard: ["SD"], unknown: NONE("Accepted as an answer") }),
  Q("B-15", "R1", { text: "Name three things in a job that you would refuse.", type: "list", fields: ["one", "two", "three"], why: "It filters the roles I put in front of you.", changes: "The avoid list and the target filter.", writes: ["profile.constraints.avoid", "profile.baseline.refusals", "demands.items"], validate: { kind: "list", min: 3 }, follow_up: [f(1, "Has that been true for you before?")], bias_guard: ["SD"], consumer: C("demand", "D-refuse-n"), unknown: NONE("Accepted as an answer") }),
  Q("B-16", "R1", { text: "By what date do you want your next role to start? Write none if there is no date.", type: "date", why: "It is the deadline your forecast is compared with.", changes: "The forecast shows ready-by against this date.", writes: ["profile.north_star.timeline"], validate: { kind: "date", allow_none: true }, follow_up: [f(1, "What happens on that date if you are not there?")], bias_guard: ["AN"], unknown: NONE("none is accepted; the forecast shows ready-by without a deadline", "none") }),
  Q("B-17", "R1", { text: "In the last four weeks, how many hours did you spend learning for your next role? Give one number.", type: "num", hard: true, why: "Your real capacity beats your planned capacity.", changes: "How many hours a week the plan can assume.", writes: ["profile.baseline.hours_actual_4w"], validate: { kind: "num", min: 0 }, follow_up: [f(1, "What took the evenings?", "answer is 8 or less")], evidence_ask: "E2", bias_guard: ["SD", "RC"], consumer: C("field", "baseline.hours_actual_4w, checked against B-18"), unknown: unk("U5", "Log growth hours for 7 days, 2 minutes a day", "Actual hours unknown", "Week 1, nights 1 to 3") }),
  Q("B-19", "R1", { text: "Which days of the week are impossible for you?", type: "multi", options: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], why: "It decides which nights tasks may sit on.", changes: "Blocked days in the plan. Sunday is the weekly check, so blocking it changes nothing.", writes: ["profile.constraints.blocked_days"], validate: { kind: "multi", allow_empty: true }, bias_guard: ["DB"], consumer: C("field", "constraints.blocked_days and hours per night"), unknown: NONE("No day is blocked", "none") }),
  Q("B-18", "R1", { text: "From now, how many hours a week can you protect for this, on nights you will actually use?", type: "num", why: "It is the capacity the plan is built to.", changes: "Hours per week, and hours per night once your blocked days are known.", writes: ["profile.constraints.hours_per_week", "profile.constraints.hours_per_day"], validate: { kind: "num", min: 0, max: 40 }, follow_up: [f(1, "What will you stop doing to make that true?")], bias_guard: ["SD"], consumer: C("field", "hours_per_week and hours_per_day, provisional until B-19"), unknown: NONE("Assumed 5 hours, flagged assumed", "5") }),
  Q("H-01", "R1", { text: "On a normal weekday, how many hours of focus do you have left once your work day is over?", type: "num", hard: true, why: "It separates the hours you protect from the hours you wish for.", changes: "The per night limit: the plan never asks for more than this.", writes: ["profile.constraints.focus_hours_weekday"], validate: { kind: "num", min: 0, max: 16 }, evidence_ask: "E2", bias_guard: ["SD"], consumer: C("field", "constraints.focus_hours_weekday caps hours_per_day"), unknown: unk("U5", "Rate your energy 1 to 5 each night for 7 days", "Focus hours unknown", "Week 1, nights 1 to 3") }),
  Q("B-20", "R1", { text: "If your income stopped today, how many months could you pay for your life?", type: "num", why: "Runway decides how much risk the plan may take.", changes: "The risk language in the plan and the contradiction check C-03.", writes: ["profile.situation.runway_months"], validate: { kind: "num", min: 0 }, evidence_ask: "E2", bias_guard: ["SD"], consumer: C("field", "situation.runway_months"), unknown: unk("U3", "Add up savings and divide by monthly costs", "Runway unknown", "Week 1, night 3") }),
  Q("F-11", "R1", { must: false, text: "How much do you owe in total on debts, in {currency}? Write 0 if nothing.", type: "num", why: "Debt sets how much risk you can carry.", changes: "How much risk the plan may take with your income.", writes: ["profile.situation.debt_total"], validate: { kind: "num", min: 0 }, evidence_ask: "E2", bias_guard: ["SD"], consumer: C("field", "situation.debt_total"), unknown: unk("U3", "Read the loan statements", "Debt unknown", "Week 1, night 3") }),
  Q("F-12", "R1", { must: false, text: "If you live with someone who earns, how many months of your shared costs could their income cover alone? Write 0 if none.", type: "num", why: "It sets whether a pay drop is survivable.", changes: "How much of a pay drop the plan may suggest.", writes: ["profile.situation.household_cover_months"], validate: { kind: "num", min: 0 }, bias_guard: ["SD"], consumer: C("field", "situation.household_cover_months"), unknown: unk("U4", "Ask the other earner", "Household cover unknown", "Week 1, night 3") }),
  Q("F-01", "R1", { text: "In the last 12 months, how many {market_action} did you make for roles like {target_role}? Write 0 if none.", type: "num", why: "It shows where the funnel breaks.", changes: "Whether the fix is reach or how you present.", writes: ["profile.baseline.funnel", "profile.intake"], validate: { kind: "num", min: 0 }, evidence_ask: "E2", bias_guard: ["RC"], consumer: C("field", "baseline.funnel.approaches"), unknown: unk("U3", "Open your sent items or applied list and count", "Number of approaches unknown", "Week 1, night 1") }),
  Q("F-02", "R1", { must: false, text: "Of those, how many led to a conversation with a person?", type: "num", why: "It gives the warm path rate.", changes: "Whether outreach tasks come before applications.", writes: ["profile.baseline.funnel", "profile.intake"], validate: { kind: "num", min: 0 }, evidence_ask: "E2", bias_guard: ["RC"], consumer: C("field", "baseline.funnel.conversations"), unknown: unk("U3", "Open your sent items and mark each reply", "Reply rate unknown", "Week 1, night 1") }),
  Q("F-03", "R1", { must: false, text: "Of those, how many did you adjust for the specific role?", type: "num", why: "It shows if the same material went to every role.", changes: "Whether a rewrite of your material sits early in the plan.", writes: ["profile.baseline.funnel", "profile.intake"], validate: { kind: "num", min: 0 }, evidence_ask: "E2", bias_guard: ["RC"], consumer: C("field", "baseline.funnel.adjusted"), unknown: unk("U3", "Compare file dates against the sent list", "Tailoring rate unknown", "Week 1, night 2") }),
  Q("B-24", "R1", { must: false, text: "List each interview you had in the last 12 months for roles like {target_role}, with how far it got.", type: "list", why: "It shows whether the problem is getting in or doing well.", changes: "Whether the plan works on reach or on interview skill.", writes: ["profile.baseline.interviews"], validate: { kind: "list", min: 1 }, follow_up: [f(1, "What was the hardest question?")], evidence_ask: "E3", bias_guard: ["RC", "SD"], consumer: C("field", "baseline.interviews"), unknown: unk("U3", "Rebuild the list from email threads", "Interview history unknown", "Week 1, night 2") }),
  Q("B-25", "R1", { text: "How many days of notice do you have to give an employer? Write 0 if none.", type: "num", why: "It decides how soon a new role could start.", changes: "Start-date feasibility in the forecast.", writes: ["profile.situation.notice_days"], validate: { kind: "num", min: 0 }, evidence_ask: "E1", bias_guard: ["DB"], consumer: C("field", "situation.notice_days"), unknown: unk("U3", "Read the notice clause in your contract", "Notice period unknown", "Week 1, night 1") }),
  Q("B-36", "R1", { must: false, text: "Is your notice period paid?", type: "mcq", options: ["yes", "no"], why: "Unpaid notice shortens your runway.", changes: "Whether notice counts against your runway in check C-03.", writes: ["profile.situation.notice_paid"], validate: { kind: "mcq" }, bias_guard: ["DB"], consumer: C("field", "situation.notice_paid, used by C-03"), unknown: NONE("Assumed paid", "yes") }),
  Q("B-26", "R1", { text: "Which work arrangements would you accept?", type: "multi", options: ["remote", "hybrid", "on site"], why: "It filters the market I research for you.", changes: "The roles and pay ranges I research.", writes: ["profile.situation.location_pref"], validate: { kind: "multi", allow_empty: false }, bias_guard: ["AQ"], consumer: C("field", "situation.location_pref"), unknown: NONE("Accepted as an answer") }),
  Q("B-35", "R1", { must: false, text: "Which places would you accept? Write any if it is open.", type: "list", why: "It filters the market I research for you.", changes: "The places I research pay and demand for.", writes: ["profile.situation.places"], validate: { kind: "list", min: 1 }, bias_guard: ["AQ"], consumer: C("field", "situation.places"), unknown: NONE("Accepted as any", "any") }),
  Q("B-27", "R1", { text: "Who depends on your income? Write nobody if no one does.", type: "list", why: "It sets how much risk the plan may take.", changes: "Your floor and the risk language.", writes: ["profile.situation.dependents"], validate: { kind: "list", min: 1 }, follow_up: [f(1, "How much of your income, roughly?")], bias_guard: ["SD"], consumer: C("field", "situation.dependents"), unknown: NONE("Accepted as nobody", "nobody") }),
  Q("B-28", "R1", { must: false, text: "What is your work authorisation situation for working abroad?", type: "mcq", options: ["citizen", "visa held", "would need sponsorship", "not applicable"], why: "It filters the roles I research.", changes: "Which countries stay in the market research.", writes: ["profile.situation.work_auth"], validate: { kind: "mcq" }, bias_guard: ["DB"], consumer: C("field", "situation.work_auth"), unknown: unk("U2", "Research visa routes for the countries you named", "Authorisation unknown", "Before Round 2 research") }),
  Q("B-29", "R1", { must: false, text: "How many people in your field would reply to a message from you within a week?", type: "num", why: "It decides how much outreach the plan needs.", changes: "Outreach tasks and their size.", writes: ["profile.baseline.network_size"], validate: { kind: "num", min: 0 }, follow_up: [f(1, "Name five.")], evidence_ask: "E1", bias_guard: ["SD"], consumer: C("field", "baseline.network_size"), unknown: unk("U1", "List 10 names in 10 minutes", "Network size unknown", "Week 1, night 3") }),
  Q("B-30", "R1", { must: false, text: "What is the most serious attempt you have made to move toward {target_role}? Name it. Write when it ended.", type: "free", hard: true, why: "It stops me repeating a method that already failed.", changes: "A demand that the plan does not repeat that method.", writes: ["demands.items"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "What happened?"), f(2, "What made you stop?")], evidence_ask: "E3", bias_guard: ["SD", "HI"], consumer: C("demand", "D-method"), unknown: NONE("Accepted as an answer") }),
  Q("E-01", "R1", { text: "Does your employment contract limit work you do outside your job?", type: "mcq", options: ["yes", "no"], why: "It decides whether proof can be built on your own time.", changes: "A demand to build proof outside your employer's scope, and a task to read the clauses.", writes: ["profile.situation.work_limits", "demands.items"], validate: { kind: "mcq" }, bias_guard: ["DB"], consumer: C("demand", "D-limits when yes, with a read-the-clauses task"), unknown: unk("U3", "Read the side work and publishing clauses in your contract", "Work limits unknown", "Week 1, night 1") }),
  Q("E-02", "R1", { must: false, text: "Is there a role at your current employer that is close to {target_role}? Name it. Write none if there is not one.", type: "free", why: "The cheapest bridge is often internal.", changes: "Whether an internal move sits before outside applications.", writes: ["profile.situation.internal_option"], validate: { kind: "free", min: 3 }, bias_guard: ["SD"], consumer: C("field", "situation.internal_option"), unknown: unk("U4", "Ask your manager what roles exist near it", "Internal option unknown", "Week 1, night 3") }),
  Q("P-01", "R1", { must: false, text: "Would you take a job that pays 20 percent less for six months if it moved you toward {target_role}?", type: "mcq", options: ["yes", "only with conditions", "no"], why: "It decides whether a stepping stone role is allowed.", changes: "Whether the plan may suggest a lower paid stepping stone.", writes: ["profile.constraints.risk_stance"], validate: { kind: "mcq" }, bias_guard: ["SD"], consumer: C("field", "constraints.risk_stance"), unknown: NONE("Accepted as an answer") }),
  Q("L-01", "R1", { must: false, text: "How did you learn the last thing you learned well?", type: "free", why: "It shows the format that works for you.", changes: "How tasks are shaped, as an unconfirmed starting guess.", writes: ["profile.constraints.learns_best_by"], validate: { kind: "free", min: 5 }, bias_guard: ["RC"], consumer: C("field", "constraints.learns_best_by"), unknown: unk("U5", "Note how you study during 3 sessions", "Learning style unknown", "Week 1, nights 1 to 3") }),
  Q("P-04", "R1", { text: "Should the plan include tasks that are only about consuming material?", type: "mcq", options: ["no, always make or practise something", "yes, a few", "yes, freely"], why: "Some people refuse consumption only learning.", changes: "Whether the demand D-learn (no consumption only tasks) exists, and is hard.", writes: ["profile.constraints.learning_mode", "demands.items"], validate: { kind: "mcq" }, bias_guard: ["AQ"], consumer: C("demand", "D-learn, hard, only when the answer says no"), unknown: NONE("No learning demand is created", "yes, a few") }),
  Q("H-02", "R1", { must: false, text: "Is there a duty outside work that will cut your hours in the next six months? Name it. Write none if there is not one.", type: "free", why: "Known disruptions change what the plan can promise.", changes: "A note on the plan's capacity and the dates it avoids.", writes: ["profile.constraints.known_disruptions"], validate: { kind: "free", min: 3 }, bias_guard: ["SD"], consumer: C("field", "constraints.known_disruptions"), unknown: NONE("Accepted as none", "none") }),
  Q("K-01", "R1", { must: false, text: "List the jobs you have held, with the dates of each, most recent first.", type: "list", why: "Tenure and gaps shape how you are read.", changes: "Your history, shown with your starting point.", writes: ["profile.situation.history"], validate: { kind: "list", min: 1 }, evidence_ask: "E1", bias_guard: ["RC"], consumer: C("field", "situation.history"), unknown: unk("U3", "Pull dates from your CV", "Job history unknown", "Week 1, night 3") }),
  Q("K-02", "R1", { must: false, text: "Why did you leave your last job? Write still there if you have not.", type: "free", why: "It shows whether the reason repeats.", changes: "Whether the plan guards against the same reason.", writes: ["profile.situation.history_reason"], validate: { kind: "free", min: 3 }, bias_guard: ["SD"], consumer: C("field", "situation.history_reason"), unknown: NONE("Accepted as an answer") }),
  Q("W-01", "R1", { must: false, text: "What happened that made you start this now rather than last year?", type: "free", why: "A trigger predicts how long motivation lasts.", changes: "The reason shown on your goal.", writes: ["profile.north_star.trigger"], validate: { kind: "free", min: 5 }, bias_guard: ["HI"], consumer: C("field", "north_star.trigger"), unknown: NONE("Accepted as an answer") }),
];

const R1_MORE = [
  Q("X-01", "R1", { must: false, text: "Which piece of work in the last two years gave you the most energy? Name it.", type: "free", why: "It is the strongest signal when there is no target role yet.", changes: "The first experiments and the reading list.", writes: ["profile.exploration.energisers"], validate: { kind: "free", min: 5 }, bias_guard: ["RC"], consumer: C("field", "exploration.energisers, seeds the experiments"), unknown: unk("U5", "Log each work block as drained or energised for 7 days", "What gives you energy is unknown", "Week 1, nights 1 to 3") }),
  Q("X-02", "R1", { must: false, text: "If your current job were fixed tomorrow, would you still want to leave this field?", type: "mcq", options: ["yes", "no", "not sure"], why: "It separates a bad job from a wrong field.", changes: "Whether the exploration looks inside or outside your field.", writes: ["profile.exploration.field_or_job"], validate: { kind: "mcq" }, bias_guard: ["AQ"], consumer: C("field", "exploration.field_or_job"), unknown: NONE("Accepted as not sure", "not sure") }),
  Q("X-03", "R1", { must: false, text: "Name one kind of work you would try for a month if money did not matter.", type: "free", why: "It seeds the small experiments.", changes: "One of the two experiments in your exploration course.", writes: ["profile.exploration.try_month"], validate: { kind: "free", min: 5 }, bias_guard: ["SD"], consumer: C("field", "exploration.try_month, seeds an experiment"), unknown: unk("U1", "Spend 25 minutes on a day-in-the-life search for three options", "No direction to test", "Week 1, night 2") }),
  Q("A-01", "R1", { must: false, text: "Name three things colleagues ask you for help with.", type: "list", fields: ["one", "two", "three"], why: "It shows strengths, not gaps.", changes: "Which experiments build on what you already do well.", writes: ["profile.strengths"], validate: { kind: "list", min: 3 }, bias_guard: ["SD"], consumer: C("field", "profile.strengths"), unknown: unk("U4", "Ask two colleagues the same question", "Strengths unknown", "Week 1, night 3") }),
  Q("E-03", "R1", { must: false, text: "On how many evenings in a normal week do you have energy left after work?", type: "num", why: "Hours of focus are not the same as energy you can use.", changes: "How many evenings the plan may use.", writes: ["profile.constraints.energy_evenings"], validate: { kind: "num", min: 0, max: 7 }, bias_guard: ["SD"], consumer: C("field", "constraints.energy_evenings caps the nights"), unknown: unk("U5", "Rate your energy 1 to 5 each night for 7 days", "Usable evenings unknown", "Week 1, nights 1 to 3") }),
  Q("Q-01", "R1", { must: false, text: "What is the highest qualification you have completed? Name it with the subject.", type: "free", why: "Some roles gate on it.", changes: "Whether a credential gap is listed.", writes: ["profile.situation.education"], validate: { kind: "free", min: 3 }, bias_guard: ["DB"], consumer: C("field", "situation.education"), unknown: NONE("Accepted as an answer") }),
  Q("M-01", "R1", { must: false, text: "Could you move to another city for a role?", type: "mcq", options: ["yes", "no", "with conditions"], why: "A list of places is not the same as being able to go.", changes: "Whether other cities stay in the market research.", writes: ["profile.situation.can_move"], validate: { kind: "mcq" }, bias_guard: ["AQ"], consumer: C("field", "situation.can_move"), unknown: NONE("Accepted as an answer") }),
  Q("D-01", "R1", { must: false, text: "By what date does money force a decision? Write none if there is no such date.", type: "date", why: "A date you do not control changes the order of the plan.", changes: "The order of the plan and the risk language.", writes: ["profile.situation.hard_date"], validate: { kind: "date", allow_none: true }, bias_guard: ["AN"], consumer: C("field", "situation.hard_date"), unknown: NONE("none is accepted", "none") }),
];

const R2 = [
  Q("I-01", "R2", { text: "Here are the four level descriptions for {target_role}. Which one describes the work you actually did in the last 12 months?", type: "mcq", options: ["1", "2", "3", "4"], why: "It is your first calibration, taken before I show any evidence.", changes: "The starting prior for gap sizing, kept at low confidence.", writes: ["onboarding.notes"], validate: { kind: "mcq" }, follow_up: [f(1, "Which piece of work shows it?")], evidence_ask: "E1", bias_guard: ["SR"], consumer: C("gap", "provisional level prior for gaps with no artifact"), unknown: unk("U1", "Take a 60 minute skill test against the rubric", "Self level unknown", "Week 1, night 1") }),
  Q("I-02", "R2", { meta: { competency: "the rubric competency id of the option he chose (see rubric.json)" }, meta_required: ["competency"], text: "Which of these {n} skills would you bet you are weakest at?", type: "mcq", options: ["from research"], why: "It orders the gaps.", changes: "The rank of your gaps.", writes: ["library.gaps"], validate: { kind: "mcq" }, follow_up: [f(1, "When did that last show?")], bias_guard: ["HI"], consumer: C("gap", "a gap for that competency"), unknown: unk("U1", "Do a 20 minute test on the top two skills", "Weakest skill unknown", "Week 1, night 2") }),
  Q("I-03", "R2", { text: "Where does your salary range sit against the researched range of {low} to {high}?", type: "mcq", options: ["inside", "above", "below"], why: "It checks your wish against sources.", changes: "Whether the salary demand stays a wish or becomes a market range.", writes: ["demands.items"], validate: { kind: "mcq" }, follow_up: [f(1, "What do you make of that?"), f(2, "What in your evidence justifies above?", "answer is above")], evidence_ask: "E1", bias_guard: ["AN"], consumer: C("demand", "D-salary status and contradiction C-01"), unknown: unk("U2", "Research the pay range for the role, place and level from two independent sources", "The salary stays a wish", "Round 2 entry") }),
  Q("I-04", "R2", { meta: { requirement_competency: "map of each requirement he chose to its rubric competency id" }, meta_required: ["requirement_competency"], text: "Which of these {n} requirements have you never done, not even once?", type: "multi", options: ["from research"], why: "Zero level items become learning tasks.", changes: "New gaps at level 0.", writes: ["library.gaps"], validate: { kind: "multi", allow_empty: true }, follow_up: [f(1, "Which one scares you most?")], bias_guard: ["SD"], consumer: C("gap", "a level 0 gap per requirement"), unknown: NONE("Accepted as an answer") }),
  Q("I-05", "R2", { text: "Which of those requirements do you believe you have done but could not show proof for today?", type: "multi", options: ["from research"], why: "Work without proof cannot be used in an application.", changes: "Prove-it tasks.", writes: ["proof.items"], validate: { kind: "multi", allow_empty: true }, follow_up: [f(1, "What would you have to dig up to show it?")], evidence_ask: "E1", bias_guard: ["SR"], consumer: C("field", "a proof item per requirement"), unknown: unk("U3", "Search your files for one example per item", "Proof status unknown", "Week 1, night 2") }),
  Q("CR-01", "R2", { text: "The research says {target_role} usually requires {credential}. Do you hold it?", type: "mcq", options: ["yes", "no", "in progress", "not required"], why: "A credential can gate the interview.", changes: "A credential gap when the answer is no.", writes: ["profile.situation.credential"], validate: { kind: "mcq" }, bias_guard: ["DB"], consumer: C("field", "situation.credential"), unknown: unk("U2", "Research which credentials the posts require", "Credential gate unknown", "Round 2 entry") }),
  Q("I-06", "R2", { must: false, text: "Which requirement on that list do you refuse to do?", type: "mcq", options: ["from research", "none"], why: "It filters tracks and anchors.", changes: "The refusals list.", writes: ["profile.baseline.refusals"], validate: { kind: "mcq" }, follow_up: [f(1, "What would change your mind?")], bias_guard: ["AQ"], consumer: C("field", "baseline.refusals"), unknown: NONE("Accepted as none", "none") }),
  Q("I-07", "R2", { must: false, text: "Name one person in your field, two levels above you, whose judgement of your work you would trust.", type: "free", why: "It names the outside judge you have been missing.", changes: "An ask-a-person task and the review step of your plan.", writes: ["onboarding.notes"], validate: { kind: "free", min: 3 }, follow_up: [f(1, "Have they ever seen your work?")], evidence_ask: "E3", bias_guard: ["SD"], consumer: C("task", "OT-I-07: ask that person to look at one piece of work"), unknown: unk("U4", "Draft a two line request to a named person", "No outside judge", "Week 1, night 3") }),
  Q("I-08", "R2", { must: false, text: "If a stranger searched your name for work, what is the first thing they would find? Paste the link. Write nothing found if there is nothing.", type: "free", why: "I will open it and show you the difference.", changes: "A proof item and the first presentation tasks.", writes: ["evidence.entries", "proof.items"], validate: { kind: "free", min: 3 }, follow_up: [f(1, "Paste the link.")], evidence_ask: "E1", bias_guard: ["HI"], consumer: C("field", "an evidence entry and a proof item"), unknown: unk("U3", "Search your own name as a stranger and screenshot the first screen", "First impression unverified", "Week 1, night 1") }),
  Q("RJ-01", "R2", { must: false, text: "What feedback did you get from your last rejection, in the words used? Write none if you got none.", type: "free", why: "It is evidence of how you are read.", changes: "An evidence entry, quoted.", writes: ["evidence.entries"], validate: { kind: "free", min: 3 }, evidence_ask: "E3", bias_guard: ["HI"], consumer: C("field", "an evidence entry"), unknown: NONE("Accepted as none", "none") }),
];

const R3 = [
  Q("R3-01", "R3", { hard: true, text: "What have you been avoiding doing for your career for more than a month? Name the thing, not the reason.", type: "free", why: "The first task usually sits where the avoidance is.", changes: "A 15 minute task in week 1 on that thing.", writes: ["onboarding.tasks"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "What do you imagine happens when you do it?")], bias_guard: ["SD"], consumer: C("task", "OT-R3-01: 15 minutes on the avoided thing"), unknown: unk("U5", "Notice and log each time you postpone a career task for 7 days", "Avoidance not named", "Week 1, nights 1 to 3") }),
  Q("R3-02", "R3", { hard: true, text: "Which part of your work would you least want reviewed closely? Write none if there is none.", type: "free", why: "It shows which work to have reviewed first.", changes: "A task to ask one trusted person to look closely at one piece of work.", writes: ["onboarding.tasks", "onboarding.risks"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "How true is that: true, partly true, untested?")], bias_guard: ["SD"], consumer: C("task", "OT-R3-02: ask one person to look closely; a risk flag"), unknown: unk("U4", "Ask one trusted person to look closely at one piece of work", "Exposure untested", "Week 2") }),
  Q("R3-03", "R3", { must: false, text: "What was different about how you worked on the last thing you finished that you were proud of?", type: "free", why: "It shows the conditions where you do your best work.", changes: "How tasks are shaped, once you confirm it.", writes: ["profile.constraints.learns_best_by"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "Who saw it?"), f(2, "What stopped you repeating that?")], evidence_ask: "E1", bias_guard: ["RC"], consumer: C("field", "constraints.learns_best_by when confirmed"), unknown: unk("U5", "After each work block, note what made it easy or hard for 7 days", "Best conditions unknown", "Week 1") }),
  Q("R3-04", "R3", { must: false, text: "Who told you a hard truth about your work in the last year?", type: "free", hard: true, why: "It tests whether you have an outside judge.", changes: "A task to ask for one when the answer is nobody.", writes: ["onboarding.tasks"], validate: { kind: "free", min: 3 }, follow_up: [f(1, "What was it?"), f(2, "What did you do about it?")], evidence_ask: "E3", bias_guard: ["SD"], consumer: C("task", "OT-R3-04: ask someone for one when the answer is nobody"), unknown: unk("U4", "Name one person who could have, and draft a one line ask", "No hard truth on record", "Week 1, night 3") }),
  Q("R3-05", "R3", { must: false, text: "What is the worst feedback you have received about your work?", type: "free", why: "It shows how you handle criticism.", changes: "A belief I test against your work.", writes: ["profile.beliefs_to_test"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "Which part of it was true?"), f(2, "Which part do you still not accept?")], evidence_ask: "E3", bias_guard: ["HI"], consumer: C("field", "beliefs_to_test entry"), unknown: unk("U4", "Ask one colleague for the hardest thing they would say about your work", "Worst feedback unknown", "Week 2") }),
  Q("R3-06", "R3", { text: "What have you started then dropped in the last three years that was meant to help your career?", type: "list", why: "It shows how you quit, so tasks can be sized to survive it.", changes: "Tasks capped at 25 minutes when you dropped two or more.", writes: ["demands.items"], validate: { kind: "list", min: 1 }, follow_up: [f(1, "What was the real reason, not the polite one?"), f(2, "What did the first week of dropping look like?")], bias_guard: ["SD"], consumer: C("demand", "D-size: tasks at most 25 minutes when two or more were dropped"), unknown: NONE("Accepted as an answer") }),
  Q("R3-07", "R3", { must: false, text: "What is one piece of your public work you would remove if nobody would notice?", type: "free", hard: true, why: "It finds the quality and shame spots.", changes: "A proof item to rebuild.", writes: ["proof.items"], validate: { kind: "free", min: 3 }, follow_up: [f(1, "Why is it there?"), f(2, "What would you replace it with?")], evidence_ask: "E1", bias_guard: ["SD"], consumer: C("field", "a proof item to rebuild"), unknown: unk("U1", "List every public piece with one weakness each", "Weak pieces unknown", "Week 1, night 2") }),
  Q("R3-08", "R3", { must: false, text: "Think of the {market_action} that got no reply. Give your three best guesses for why, most likely first.", type: "list", fields: ["first", "second", "third"], why: "It tests your own model of the silence against the numbers.", changes: "The beliefs I test against your numbers.", writes: ["profile.beliefs_to_test"], validate: { kind: "list", min: 3 }, follow_up: [f(1, "Which guess moved after you saw the data?")], bias_guard: ["HI", "AN"], consumer: C("field", "beliefs_to_test entries"), unknown: NONE("Accepted as an answer") }),
  Q("R3-09", "R3", { must: false, text: "If no one would ever notice your work, what work would you still do?", type: "free", why: "It finds what you do for its own sake.", changes: "A 20 minute task to make a small version of it.", writes: ["onboarding.tasks"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "When did you last make it?")], bias_guard: ["SD"], consumer: C("task", "OT-R3-09: make a small version"), unknown: NONE("Accepted as an answer") }),
  Q("R3-10", "R3", { must: false, text: "What would your harshest honest critic say about you, in two sentences?", type: "free", why: "It separates evidence from story.", changes: "Each sentence becomes a belief I test against your work.", writes: ["profile.beliefs_to_test"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "Which of those sentences is accurate?"), f(2, "What would you need to see to stop believing the false one?")], bias_guard: ["SD"], consumer: C("field", "beliefs_to_test entries"), unknown: NONE("Accepted as an answer") }),
  Q("R3-11", "R3", { must: false, text: "If nothing changes, which cost hurts most in two years?", type: "mcq", options: ["money", "skills", "standing", "self-respect", "other"], hard: true, why: "It names your real motive for acting.", changes: "A cost of staying demand shown with your goal.", writes: ["demands.items"], validate: { kind: "mcq" }, follow_up: [f(1, "Put a number on it.")], bias_guard: ["AQ"], consumer: C("demand", "D-cost"), unknown: NONE("Accepted as an answer") }),
  Q("R3-12", "R3", { must: false, text: "What would you do differently this month if you were certain nobody would judge it?", type: "free", why: "It names a concrete act, not a feeling.", changes: "A 15 minute task: the smallest version of that act.", writes: ["onboarding.tasks"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "What is the smallest version you could do this week?")], bias_guard: ["SD"], consumer: C("task", "OT-R3-12: the smallest version this week"), unknown: NONE("Accepted as an answer") }),
  Q("R3-13", "R3", { must: false, text: "When something you did at work goes well, what do you tell yourself it was due to?", type: "multi", options: ["luck", "the team", "the tools", "effort", "my ability", "other"], why: "It shows how you explain your own wins.", changes: "Whether feedback names what you did, when you credit luck or the team.", writes: ["onboarding.notes"], validate: { kind: "multi", allow_empty: false }, follow_up: [f(1, "What was it, the last time?")], bias_guard: ["SD"], consumer: C("brief", "feedback_style: name_what_you_did"), unknown: NONE("Accepted as an answer") }),
  Q("R3-14", "R3", { must: false, text: "When your work was last criticised in front of others, what did you do first?", type: "mcq", options: ["defended it", "went quiet", "asked questions", "took notes", "left or changed the subject"], why: "It shows how you react when exposed.", changes: "Whether reviews and mock interviews start in writing.", writes: ["demands.items"], validate: { kind: "mcq" }, follow_up: [f(1, "What would you do if it happened tomorrow?")], bias_guard: ["RC"], consumer: C("demand", "D-review: written feedback first, when you defended, went quiet or left"), unknown: NONE("Accepted as an answer") }),
  Q("R3-16", "R3", { must: false, text: "What is one thing you would stop doing for six months to reach {target_role}?", type: "free", hard: true, why: "It makes the trade-off real before the plan is built.", changes: "It seeds the stop-doing list in Round 4.", writes: ["profile.constraints.stop_doing"], validate: { kind: "free", min: 3 }, follow_up: [f(1, "For how long?")], bias_guard: ["SD"], consumer: C("field", "constraints.stop_doing, seeded"), unknown: NONE("Accepted as an answer") }),
  Q("R3-17", "R3", { must: false, text: "What will you not give up, under any circumstances?", type: "free", why: "It becomes a hard limit if you confirm it.", changes: "A hard refusal in the demands.", writes: ["profile.constraints.avoid", "demands.items"], validate: { kind: "free", min: 3 }, bias_guard: ["SD"], consumer: C("demand", "D-refuse-core, hard, when confirmed"), unknown: NONE("Accepted as an answer") }),
  Q("R3-18", "R3", { must: false, text: "Is any part of this goal someone else's wish for you? Write no if it is not.", type: "free", why: "A goal that is not yours does not survive a hard month.", changes: "Whether the goal is marked not yours and reviewed.", writes: ["profile.north_star.feeling"], validate: { kind: "free", min: 2 }, follow_up: [f(1, "Which part is it?", "answer is not no")], bias_guard: ["AQ"], consumer: C("field", "north_star.feeling when confirmed"), unknown: NONE("Accepted as an answer") }),
  Q("R3-19", "R3", { must: false, text: "What does enough look like, so you know when you can stop climbing?", type: "free", why: "It protects you from a goalpost that keeps moving.", changes: "A principle shown with your goal: what enough means.", writes: ["demands.items"], validate: { kind: "free", min: 8 }, bias_guard: ["SD"], consumer: C("demand", "D-enough"), unknown: NONE("Accepted as an answer") }),
];

const R4 = [
  Q("T-01", "R4", { must: false, text: "By what date do you want one finished example of {artifact} that you could show? Write none if you do not want a date.", type: "date", why: "It is your first milestone.", changes: "A dated milestone demand in the plan.", writes: ["demands.items"], validate: { kind: "date", allow_none: true }, follow_up: [f(1, "Which part of the estimate do you doubt?", "date is earlier than the estimate")], bias_guard: ["AN"], consumer: C("demand", "D-milestone-1 with the date"), unknown: NONE("Claude proposes a date from the forecast; you accept or edit", "propose") }),
  Q("T-02", "R4", { must: false, text: "By what date do you want to send your first approach to a role you actually want?", type: "date", why: "It is your second milestone.", changes: "A dated milestone demand in the plan.", writes: ["demands.items"], validate: { kind: "date", allow_none: true }, bias_guard: ["AN"], consumer: C("demand", "D-milestone-2 with the date"), unknown: NONE("Claude proposes a date from the forecast", "propose") }),
  Q("T-03", "R4", { text: "By what date do you want {outcome}? Write unknown if you do not know.", type: "date", why: "It is the outcome date the forecast is compared with.", changes: "The deadline shown with your forecast and the check C-07.", writes: ["profile.north_star.timeline"], validate: { kind: "date", allow_none: true, allow_unknown: true }, bias_guard: ["AN"], consumer: C("field", "north_star.timeline and C-07"), unknown: NONE("The forecast shows a range only", "unknown") }),
  Q("T-04", "R4", { must: false, text: "What would tell you at the end of week 4 that you are on track? Make it visible to an outsider.", type: "free", why: "It is the test the four week review uses.", changes: "A week 4 target demand the review checks.", writes: ["demands.items"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "Could a stranger verify that?")], bias_guard: ["AQ"], consumer: C("demand", "D-week4"), unknown: unk("U2", "Propose three measures; you pick one", "No review criterion", "Round 4") }),
  Q("T-05", "R4", { text: "What will you stop doing to free the hours you gave?", type: "list", why: "It turns the hours into a real trade-off.", changes: "The stop-doing list; with no answer I plan fewer hours.", writes: ["profile.constraints.stop_doing"], validate: { kind: "list", min: 1 }, follow_up: [f(1, "When exactly does that slot start?")], bias_guard: ["SD"], consumer: C("field", "constraints.stop_doing"), unknown: NONE("Answer nothing and I reduce the hours in the plan", "nothing") }),
  Q("T-06", "R4", { must: false, text: "Who will see your progress every week? Write nobody if no one will.", type: "free", why: "Progress that nobody sees tends to stop.", changes: "A weekly update task, or a task to ask someone to be that person.", writes: ["onboarding.tasks"], validate: { kind: "free", min: 3 }, follow_up: [f(1, "Who could you ask?", "answer is nobody")], evidence_ask: "E3", bias_guard: ["SD"], consumer: C("task", "OT-T-06: weekly update, or ask someone"), unknown: unk("U4", "Draft a one line ask to a named person", "No accountability", "Week 1, night 3") }),
  Q("T-07", "R4", { text: "How many hours a week do you commit to, as a number you would bet on?", type: "num", why: "It sets the pace you will be held to.", changes: "Pace (3 lighter, 5 steady, 6 push) and the hours; a gap above B-18 is raised as a contradiction.", writes: ["profile.pace", "profile.constraints.hours_per_week"], validate: { kind: "num", min: 0, max: 40 }, follow_up: [f(1, "In a week you manage half of it, what should I do?")], bias_guard: ["SD"], consumer: C("field", "pace and hours, with contradiction C-02 against B-18"), unknown: NONE("Defaults to steady", "steady") }),
  Q("T-08", "R4", { text: "What would make you quit this plan?", type: "free", hard: true, why: "It names the quit trigger so the weekly check can watch for it.", changes: "A risk the weekly check looks for.", writes: ["onboarding.risks"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "How would you notice it starting?")], bias_guard: ["SD"], consumer: C("risk", "R-quit in the brief and the weekly check"), unknown: NONE("Accepted as an answer") }),
  Q("T-09", "R4", { text: "Imagine it is 12 weeks from now with nothing moved. Write the most likely reason.", type: "free", hard: true, why: "It surfaces the obstacle you would not volunteer.", changes: "A risk and a 15 minute task that makes that reason less likely.", writes: ["onboarding.tasks", "onboarding.risks"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "What is one thing you can do now that makes that less likely?")], bias_guard: ["HI"], consumer: C("task", "OT-T-09: a mitigation task; a risk flag"), unknown: NONE("Accepted as an answer") }),
  Q("T-10", "R4", { must: false, text: "What is your definition of done for this whole bridge, as something someone else could verify?", type: "free", why: "It is the top level finish line.", changes: "A done-means demand: the closes-when line of the whole course.", writes: ["demands.items"], validate: { kind: "free", min: 8 }, follow_up: [f(1, "Who would verify it?")], evidence_ask: "E1", bias_guard: ["AQ"], consumer: C("demand", "D-done"), unknown: unk("U2", "Propose a definition from the role rubric", "No finish line", "Round 4") }),
  Q("T-11", "R4", { must: false, text: "When you are behind, how do you want to hear it?", type: "mcq", options: ["straight", "gently", "only if I ask"], why: "It sets the tone of the weekly check.", changes: "The wording of weekly feedback in the brief.", writes: ["onboarding.notes"], validate: { kind: "mcq" }, bias_guard: ["AQ"], consumer: C("brief", "feedback_tone in the status brief"), unknown: NONE("Defaults to straight", "straight") }),
  Q("T-12", "R4", { must: false, text: "If the date slips, what changes first?", type: "mcq", options: ["scope", "date", "hours"], why: "It is the slip policy, decided now instead of in a bad week.", changes: "A slip-policy demand: what I propose first when a week slips.", writes: ["demands.items"], validate: { kind: "mcq" }, bias_guard: ["AQ"], consumer: C("demand", "D-slip"), unknown: NONE("Defaults to date", "date") }),
  Q("P-02", "R4", { must: false, text: "What offer would you take tomorrow? Write the role, the pay, one condition.", type: "free", why: "A decision rule becomes a plan target.", changes: "An accept-rule demand the plan works toward.", writes: ["demands.items"], validate: { kind: "free", min: 8 }, bias_guard: ["AN"], consumer: C("demand", "D-accept"), unknown: NONE("Accepted as an answer") }),
  Q("P-03", "R4", { must: false, text: "What would make you stay where you are?", type: "free", why: "It sets your stay and counter-offer rule.", changes: "The stay rule shown with your goal.", writes: ["profile.constraints.stay_rule"], validate: { kind: "free", min: 5 }, bias_guard: ["SD"], consumer: C("field", "constraints.stay_rule"), unknown: NONE("Accepted as an answer") }),
];

/**
 * How much an optional (NICE) question is worth asking, 1 to 10. A MUST is 10. The depth setting (R0-11) offers the highest values
 * first: standard takes the first few of each round by this score, deep takes all, quick takes none.
 */
const NICE_VALUE = {
  "R0-11": 10, "R0-04": 3,
  "S-01": 9, "S-02": 8, "X-01": 9, "X-02": 8, "X-03": 8, "A-01": 8, "E-03": 8, "Q-01": 5, "M-01": 4, "D-01": 6,
  "B-32": 3, "B-05": 6, "B-09": 5, "B-11": 5, "B-13": 8, "B-14": 7, "F-11": 7, "F-12": 5, "F-02": 6, "F-03": 5, "B-24": 6, "B-36": 6, "B-35": 4, "B-28": 5,
  "B-29": 6, "B-30": 7, "E-02": 6, "P-01": 7, "L-01": 5, "H-02": 7, "K-01": 4, "K-02": 4, "W-01": 6,
  "I-06": 5, "I-07": 8, "I-08": 6, "RJ-01": 5,
  "R3-03": 8, "R3-04": 8, "R3-05": 7, "R3-07": 5, "R3-08": 6, "R3-09": 9, "R3-10": 7, "R3-11": 6, "R3-12": 8, "R3-13": 4, "R3-14": 6, "R3-16": 9, "R3-17": 6, "R3-18": 5, "R3-19": 7,
  "T-01": 8, "T-02": 7, "T-04": 8, "T-06": 8, "T-10": 7, "T-11": 5, "T-12": 6, "P-02": 6, "P-03": 5,
};
/**
 * The minimum viable path (critique 4, P1-7): the MUST questions the bridge to a first plan cannot do without. At quick depth
 * only these are asked before the first plan (the other MUST of R0 to R2 are deferred with what stays unknown, never dropped).
 * 19 fixed questions plus the 3 adaptive ones make 22: with 3 questions a sitting (20 minutes) that is about 7 sittings.
 */
export const MINIMUM_VIABLE = ["R0-01", "R0-02", "R0-03", "R0-05", "R0-06", "R0-07", "R0-08", "B-01", "B-04", "B-06", "B-07", "B-33", "B-10", "B-15", "B-18", "B-19", "B-20", "I-01", "I-02"];
export const BANK = [...R0, ...R1, ...R1_MORE, ...R2, ...R3, ...R4].map((q) => {
  const withConsumer = q.consumer.what ? q : { ...q, consumer: { kind: "field", what: `the live field ${q.writes.filter((w) => !w.startsWith("onboarding.")).join(", ")}` } };
  return { ...withConsumer, value: q.must ? 10 : NICE_VALUE[q.id] ?? 3, minimum_viable: MINIMUM_VIABLE.includes(q.id) };
});

/** Adaptive Round 2 slots: filled per competency from the researched rubric, then linted before asking. Registration is mandatory. */
export const ADAPTIVE = {
  version: 2,
  k: 4,
  /** Fewest generated questions that count as a registered batch. */
  min_registered: 3,
  rounds: ["R2"],
  inputs: ["target role from B-04 and 2 or more live job posts", "current role from B-01", "research items (rubric levels, hiring bar, pay range, skill frequency) with url, retrieved date, excerpt of 25 words or fewer", "prior confirmed facts", "time use B-31, interviews B-24, weakest skill I-02", "off limits list"],
  outputs: ["for each of the top K competencies: A.1 to A.3 (and A.4 only if the gap is 1 level or more), each citing research ids", "the research pack: 10 lines read before I-01"],
  slots: [
    { slot: "A.1", must: true, meta: { evidenced_level: "0 to 4, the level the artifact shows; send only after you opened it, with the artifact in evidence" }, meta_required: [], text: "What is the most advanced thing you did in {competency} in the last 12 months that someone else could verify?", type: "free", follow_up: ["Name the project, your exact part, the outcome."], writes: ["evidence.entries"], evidence_ask: "E1", bias_guard: ["RC"], unknown: unk("U3", "Produce one verifiable example for the competency", "No verifiable work in this competency", "Before any learn task for it") },
    { slot: "A.2", must: true, meta: { descriptor_level: "1 to 4, the level of the descriptor he chose (the server fills the four descriptors from the rubric)", target_level: "the level the researched rubric requires for the target role" }, meta_required: ["descriptor_level"], text: "Which one of these four descriptions fits that piece of work best?", type: "mcq", options: ["four verbatim descriptors from the researched rubric, shuffled and unlabelled", "none of these"], writes: ["skills.ratings", "onboarding.notes"], evidence_ask: "E1", bias_guard: ["SR"], unknown: unk("U1", "Take a diagnostic test on the competency", "Self level unknown", "Week 1") },
    { slot: "A.3", must: true, text: "In the next 90 days, what do you want to be able to do in {competency} that you cannot do now?", type: "free", follow_up: ["What is the main thing stopping you?"], writes: ["library.gaps"], evidence_ask: "E0", bias_guard: ["AQ"], unknown: NONE("no goal is accepted: the gap is marked not wanted and listed") },
    { slot: "A.4", must: false, text: "When did you last get feedback on {competency} from someone who could judge it?", type: "free", follow_up: ["What was the hardest part to hear?"], writes: ["evidence.entries"], evidence_ask: "E3", bias_guard: ["SD"], unknown: unk("U4", "Ask one person who could judge it", "No outside feedback on this competency", "Week 2") },
  ],
  constraints: ["one decision per question", "35 words or fewer", "no jargon unless the posts use it, then define it in a clause", "A.2 options are the rubric's own descriptors, shuffled and unlabelled", "at most 1 question per competency per sitting", "no salary or level number appears before B-08 and I-01 are answered"],
  banned_patterns: ["do you agree that", "would you say you are good at", "how would you rate yourself", "don't you think", "and also", "just", "two question marks", "any statistic without a source", "any compliment", "any mention of a diagnosis"],
  self_check: ["single barrelled", "asks behaviour with a date or an artifact", "has an unknown handling", "no leading frame", "not answerable from the dossier or prior"],
  research_caps: { searches: 12, fetches: 10, haiku: 4, advisor: 1 },
};

/** A generated question must pass the same mechanical rules before it is asked. */
export const BANNED = [
  { re: /\bdon'?t you\b/i, why: "leading: don't you" },
  { re: /\bobviously\b/i, why: "leading: obviously" },
  { re: /\bjust\b/i, why: "minimising: just" },
  { re: /\bdo you agree\b/i, why: "leading: do you agree" },
  { re: /\bwould you say you are good at\b/i, why: "trait wording" },
  { re: /\bhow would you rate yourself\b/i, why: "self rating" },
  { re: /\band also\b/i, why: "double barrelled: and also" },
  { re: /\b(of course|clearly|surely)\b/i, why: "leading word" },
];
export const MAX_WORDS = 30;
export const MAX_PER_SITTING = 7;
/** Minutes a question takes, for the fatigue estimate: easy 3, hard 5. */
export const EST_MIN = { easy: 3, hard: 5 };

/** Questions per sitting from the minutes he gave in R0-01: 3 at 20, 6 at 40, 7 at 60. */
export function sittingMax(budgetMin) {
  const b = Number(budgetMin);
  if (!Number.isFinite(b) || b <= 0) return MAX_PER_SITTING;
  return Math.max(3, Math.min(MAX_PER_SITTING, Math.floor(b / 6)));
}

/**
 * Mechanical lint for one wording. Returns a list of problems (empty = clean). Used by the lint script and for generated questions.
 * `names`: competency names (or any proper names) that may contain " and " or " or "; they are removed before the structure checks,
 * so "Design systems and IA" is a name, not two asks.
 */
export function lintText(text, { maxWords = MAX_WORDS, names = [] } = {}) {
  const out = [];
  if (typeof text !== "string" || !text.trim()) return ["empty text"];
  let t = text.replace(/\{[^}]*\}/g, "X");
  for (const n of [...names].filter((x) => typeof x === "string" && x.trim()).sort((a, b) => b.length - a.length)) {
    const esc = n.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(esc, "gi"), "X");
  }
  const words = t.trim().split(/\s+/).filter(Boolean).length;
  if (words > maxWords) out.push(`${words} words (max ${maxWords})`);
  if (/[–—]/.test(text)) out.push("em or en dash");
  if (/\sand\s/i.test(t)) out.push('" and " joins two asks');
  if (/\sor\s/i.test(t)) out.push('" or " offers an alternative outside the options');
  if ((t.match(/\?/g) || []).length > 1) out.push("two question marks");
  for (const b of BANNED) if (b.re.test(t)) out.push(b.why);
  return out;
}

export const byId = Object.fromEntries(BANK.map((q) => [q.id, q]));
const GENERATED = /^A-[a-z0-9_]+\.[1-4]$/;
/** Resolves a bank id, a follow-up id (B-04.f1) or a generated id (A-craft.1) to a descriptor, or null. */
/** Domain questions (lib/domain-bank.mjs registers them). Kept apart from BANK so the 48 MUST cap of the main bank is untouched. */
export const EXTRA_BY_ID = {};
export function registerExtraQuestions(list) { for (const q of list) EXTRA_BY_ID[q.id] = q; }
export function resolveQuestion(id) {
  if (byId[id]) return byId[id];
  if (EXTRA_BY_ID[id]) return EXTRA_BY_ID[id];
  const dm = /^(DM-\d+)\.f(\d)$/.exec(id);
  if (dm && EXTRA_BY_ID[dm[1]] && EXTRA_BY_ID[dm[1]].follow_up.some((x) => x.n === Number(dm[2]))) return { ...EXTRA_BY_ID[dm[1]], id, follow_of: dm[1] };
  const m = /^(.+)\.f(\d)$/.exec(id);
  if (m && byId[m[1]] && byId[m[1]].follow_up.some((x) => x.n === Number(m[2]))) return { ...byId[m[1]], id, follow_of: m[1] };
  if (GENERATED.test(id)) {
    const slot = ADAPTIVE.slots.find((s) => s.slot === `A.${id.split(".")[1]}`);
    return slot ? { id, round: "R2", must: slot.must, hard: false, text: slot.text, type: slot.type, options: slot.options || null, why: "Generated from the researched rubric.", changes: "A gap for this competency.", writes: slot.writes, meta: slot.meta || null, meta_required: slot.meta_required || [], validate: { kind: slot.type === "mcq" ? "mcq" : "free", min: 8 }, follow_up: [], evidence_ask: slot.evidence_ask, bias_guard: slot.bias_guard, consumer: { kind: "gap", what: "a gap for the competency" }, unknown: slot.unknown, generated: true } : null;
  }
  return null;
}
export const isKnownId = (id) => !!resolveQuestion(id);

export const mustIds = (round) => BANK.filter((q) => q.must && (!round || q.round === round)).map((q) => q.id);
export const counts = () => {
  const must = BANK.filter((q) => q.must);
  const minRounds = ["R0", "R1", "R2"];
  return {
    fixed: BANK.length,
    must: must.length,
    nice: BANK.length - must.length,
    by_round: Object.fromEntries(ROUNDS.map((r) => [r, BANK.filter((q) => q.round === r).length])),
    must_by_round: Object.fromEntries(ROUNDS.map((r) => [r, must.filter((q) => q.round === r).length])),
    hard: BANK.filter((q) => q.hard).length,
    adaptive_must_slots: ADAPTIVE.slots.filter((s) => s.must).length * ADAPTIVE.k,
    adaptive_nice_slots: ADAPTIVE.slots.filter((s) => !s.must).length * ADAPTIVE.k,
    adaptive_min_registered: ADAPTIVE.min_registered,
    /** Minimum viable path to "enough to start": R0, R1 and R2 MUST, plus the mandatory adaptive batch. */
    min_viable: must.filter((q) => minRounds.includes(q.round)).length + ADAPTIVE.min_registered,
    /** The quick path to "enough to start": the marked questions plus the registered adaptive minimum. */
    min_viable_quick: BANK.filter((q) => q.minimum_viable).length + ADAPTIVE.min_registered,
  };
};

/**
 * Packs ids into sittings: at most `max` weight (hard 1.5, others 1), at most 3 hard questions in a row, a new round starts a new sitting.
 * `ids` defaults to every MUST in bank order. Returns [{ round, ids, weight, est_min }].
 */
export function planSittings(ids = BANK.filter((q) => q.must).map((q) => q.id), max = MAX_PER_SITTING) {
  const out = [];
  let cur = null;
  let hardRun = 0;
  for (const id of ids) {
    const q = resolveQuestion(id);
    if (!q) continue;
    const w = q.round === "R0" ? 0 : q.hard ? 1.5 : 1;
    if (!cur || cur.round !== q.round || cur.weight + w > max) { cur = { round: q.round, ids: [], weight: 0, est_min: 0 }; out.push(cur); hardRun = 0; }
    if (q.hard && hardRun >= 3) { cur = { round: q.round, ids: [], weight: 0, est_min: 0 }; out.push(cur); hardRun = 0; }
    cur.ids.push(id);
    cur.weight += w;
    cur.est_min += q.hard ? EST_MIN.hard : EST_MIN.easy;
    hardRun = q.hard ? hardRun + 1 : 0;
  }
  return out;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, " ");
/**
 * Checks an answer value against the question's validate rule.
 * Returns { ok, value, reason }. value is the cleaned value to store.
 * ctx: { answers } so one answer can be checked against another (B-31 against B-02); { options } overrides the question's options
 * (registered A.2 descriptors).
 */
export function validateValue(q, value, ctx = {}) {
  const rule = q.validate || { kind: "free", min: 1 };
  const bad = (reason) => ({ ok: false, value, reason });
  const ok = (v) => ({ ok: true, value: v });
  const str = (v) => (typeof v === "string" ? v.trim() : v);
  const options = ctx.options || q.options || [];
  switch (rule.kind) {
    case "num": {
      // A list is never one number: joining its pieces ([10, 12] -> 1012) was a silent corruption.
      if (Array.isArray(value)) return bad("needs one number, not a list or a range");
      const str = typeof value === "string" ? value.trim() : "";
      // Commas must be thousands groups (90,000 or 1,40,000); anything else ("10,12") is two numbers, not one.
      if (typeof value === "string" && /,/.test(str) && !/^-?\d{1,3}(,\d{2})*,\d{3}(\.\d+)?$/.test(str) && !/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(str)) return bad("has a comma that is not a thousands group; send one plain number");
      const n = typeof value === "number" ? value : Number(str.replace(/[,\s]/g, ""));
      if (!Number.isFinite(n)) return bad("needs a number");
      if (rule.min !== undefined && n < rule.min) return bad(`must be at least ${rule.min}`);
      if (rule.max !== undefined && n > rule.max) return bad(`must be at most ${rule.max}`);
      return ok(n);
    }
    case "numpair": {
      const a = Array.isArray(value) ? value : null;
      if (!a || a.length !== 2) return bad("needs a low value and a high value");
      if (a.some((x) => Array.isArray(x) || (typeof x === "string" && /,/.test(x) && !/^-?\d{1,3}(,\d{2})*,\d{3}(\.\d+)?$/.test(x.trim()) && !/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(x.trim())))) return bad("each value must be one plain number");
      const [lo, hi] = a.map((x) => (typeof x === "number" ? x : Number(String(x).replace(/[,\s]/g, ""))));
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return bad("both values must be numbers");
      if (lo > hi) return bad("low must not be above high");
      if (rule.min !== undefined && lo < rule.min) return bad(`must be at least ${rule.min}`);
      return ok([lo, hi]);
    }
    case "date": {
      const v = str(value);
      if (typeof v !== "string") return bad("needs a date as YYYY-MM-DD");
      if (rule.allow_none && /^none$/i.test(v)) return ok("none");
      if (rule.allow_unknown && /^unknown$/i.test(v)) return ok("unknown");
      if (!ISO.test(v)) return bad("needs a date as YYYY-MM-DD");
      // a date that is not on any calendar (2027-13-40, 2026-02-30) is refused, never stored (critique 5, P2)
      { const [y, mo, da] = v.split("-").map(Number); const dt = new Date(Date.UTC(y, mo - 1, da)); if (!(dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === da)) return bad(`${v} is not a date on the calendar (month 1 to 12, day 1 to 28, 30 or 31). Ask him again`); }
      return ok(v);
    }
    case "month": {
      const v = str(value);
      if (typeof v !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return bad("needs a month as YYYY-MM");
      return ok(v);
    }
    case "currency": {
      const v = str(value);
      if (typeof v !== "string" || !/^[A-Za-z]{3}$/.test(v)) return bad("needs the three letter currency code, for example USD");
      return ok(v.toUpperCase());
    }
    case "mcq": {
      const v = str(value);
      if (typeof v !== "string" || !v) return bad("needs one of the options");
      const opts = options.filter((o) => o !== "from research");
      if (!opts.length || options.includes("from research")) return ok(v);
      if (opts.includes(v) || /^other:\s*\S/.test(v)) return ok(v);
      return bad(`must be one of: ${opts.join(", ")}, or other: <text>`);
    }
    case "multi": {
      if (!Array.isArray(value)) return bad("needs a list");
      if (!rule.allow_empty && !value.length) return bad("needs at least one");
      const opts = options.filter((o) => o !== "from research");
      if (opts.length && !options.includes("from research")) {
        const strays = value.filter((x) => !opts.includes(x) && !/^other:\s*\S/.test(String(x)));
        if (strays.length) return bad(`not an option: ${strays.join(", ")}`);
      }
      return ok(value.map(String));
    }
    case "list": {
      if (!Array.isArray(value)) return bad("needs a list");
      const v = value.map((x) => (typeof x === "string" ? x.trim() : x)).filter((x) => x !== "" && x !== null && x !== undefined);
      if (v.length < (rule.min ?? 1)) return bad(`needs at least ${rule.min ?? 1}`);
      if (rule.max !== undefined && v.length > rule.max) return bad(`needs at most ${rule.max}`);
      return ok(v);
    }
    case "list_mcq": {
      if (!value || typeof value !== "object") return bad("needs a map of fact to still true, changed or not sure");
      const entries = Array.isArray(value) ? value : Object.entries(value);
      if (entries.length < (rule.min ?? 1)) return bad("needs at least one fact");
      const okSet = ["still true", "changed", "not sure", "still_true", "unsure"];
      for (const e of entries) { const val = Array.isArray(e) ? e[1] : e && e.answer; if (!okSet.includes(val)) return bad(`each fact needs one of: still true, changed, not sure`); }
      return ok(value);
    }
    case "fact": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return bad(`needs ${rule.fields.join(", ")}`);
      const miss = rule.fields.filter((k) => typeof value[k] !== "string" || !value[k].trim());
      if (miss.length) return bad(`missing ${miss.join(", ")}`);
      // A month field is written YYYY-MM ("June 2026" or "last summer" cannot be compared with anything).
      const badMonth = (rule.month_fields || []).filter((k) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value[k]).trim()));
      if (badMonth.length) return bad(`${badMonth.join(", ")} needs a month as YYYY-MM, for example 2026-06`);
      return ok(Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])));
    }
    case "timeuse": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return bad("needs a percent for each category");
      const vals = Object.values(value).map(Number);
      if (vals.some((n) => !Number.isFinite(n) || n < 0)) return bad("each percent must be a number, zero or more");
      const sum = vals.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 1) return bad(`must total 100 (it totals ${sum})`);
      return ok(Object.fromEntries(Object.entries(value).map(([k, v]) => [k, Number(v)])));
    }
    case "timeuse_of": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return bad("needs a percent for each of your own categories");
      const src = ctx.answers && ctx.answers[rule.of];
      const items = src && src.status === "answered" && Array.isArray(src.value) ? src.value.map(String) : null;
      if (!items) return bad(`answer ${rule.of} first: its items are the categories`);
      const keys = Object.keys(value);
      const want = new Map(items.map((x) => [norm(x), x]));
      const unknownKeys = keys.filter((k) => !want.has(norm(k)));
      const missing = items.filter((x) => !keys.some((k) => norm(k) === norm(x)));
      if (unknownKeys.length || missing.length) return bad(`use exactly your ${rule.of} items as the keys (${items.join("; ")})${unknownKeys.length ? `; not one of them: ${unknownKeys.join("; ")}` : ""}`);
      const vals = keys.map((k) => Number(value[k]));
      if (vals.some((n) => !Number.isFinite(n) || n < 0)) return bad("each percent must be a number, zero or more");
      const sum = vals.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 1) return bad(`must total 100 (it totals ${sum})`);
      return ok(Object.fromEntries(keys.map((k) => [want.get(norm(k)), Number(value[k])])));
    }
    case "text_ok":
      return /^ok$/i.test(String(value).trim()) ? ok("ok") : bad("type ok to confirm");
    case "free":
    default: {
      const v = str(value);
      if (typeof v !== "string") return bad("needs text");
      if (v.length < (rule.min ?? 1)) return bad(`needs at least ${rule.min ?? 1} characters, or say I don't know`);
      return ok(v);
    }
  }
}
