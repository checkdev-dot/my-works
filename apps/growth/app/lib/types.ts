export type Source = "market" | "expert" | "shipped" | "ai" | "self";
export type Track = "skill" | "reach";

/** Optional provenance: why Claude believes an item, when that was true, and who has looked at it. Never required. */
export interface Provenance {
  /** Ids of the evidence, ratings, tasks or answers that justify this item. Each must exist. */
  because?: string[];
  /** YYYY-MM-DD the item was last true or last checked. */
  as_of?: string;
  /** "dev", "claude", "person:<name>" or "market:<source>". */
  reviewed_by?: string;
}

export type DomainLevelId = "J" | "M" | "S" | "L" | "H";
/** profile.domain: the person's side of the domain graph. Every field is optional; an old profile validates unchanged. */
export interface DomainProfile {
  family_now?: "D" | "P" | "M" | "H" | "O";
  /** A role id of lib/domains.data.json. */
  role_now?: string;
  level_now?: DomainLevelId;
  /** Derived from DM-08 and its follow-up; never asked directly. */
  same_industry?: boolean;
  /** DM-08: the industry he works in today, kept apart from situation.field (R0-09), which it never overwrites. */
  industry_now?: string;
  targets?: { role: string; level: DomainLevelId; weight: number; kind: "primary" | "optional" | "bridge"; /** true when this second target comes AFTER the first (stated as "then") */ sequential?: boolean }[];
  /** employee, or business (freelance, a consultancy, an own business): a business target adds pricing, selling, pipeline, contracts and runway to the gap. */
  target_setting?: "employee" | "business";
  /** His own words for the target, kept even when it was mapped to a launch role. */
  target_words?: string;
  /** The level he said in DM-06, kept even when no launch role is the target yet. */
  target_level?: DomainLevelId;
  /** His words for a second target that is not a launch role (saved as words until he confirms the nearest one). */
  second_words?: string;
  /** The distance he can read at once, recomputed with every answer and every target change (model estimate). */
  gap_preview?: { label: string; from: { role: string } | null; to: { role: string; level: string }; then: { role: string; level: string }[]; distance: number | null; evenings: number | null; hours_per_week: number; months: number | null; top_gaps: { competency: string; name: string; gap: number; target: number; current: number | null }[]; blockers: { kind: string; label: string; have: number | null; needs: number; claimed?: boolean }[]; basis: string; business: boolean; at?: string };
  business?: { clients_lined_up?: number | null };
  /** The words he used when his role is not one of the launch roles and was mapped to the closest one (the role_mapped flag). */
  role_mapped?: { now?: string; target?: string };
  context?: { work_mode?: "in-house" | "agency" | "freelance" | "founder"; team_size?: number };
  evidence?: {
    case_studies?: number | null; placements?: number | null; best_result?: string | null; budget_owned?: string | null;
    people_managed?: number | null; measure_level?: string | null; public_presence?: string | null; tools?: string[];
    /** The date or period and the source of best_result: a result counts as proof only with one of these (or a link, or a named client) and when it is not hedged. */
    best_result_date?: string | null; best_result_source?: string | null; best_result_state?: "none";
    channel?: string | null; experiment?: string | null;
  };
  /** Market overrides of requirement cells: { research_ids, cells: { competencyId: level } }. */
  calibration?: { research_ids: string[]; cells: Record<string, number> } | null;
  /** Proof kind ids (keys of the domain data's proof_kinds). */
  blockers?: string[];
  shared_first?: string | null;
  reviewer?: string | null;
  proof_project?: string | null;
}

export interface Competency {
  id: string;
  name: string;
  levels: Record<string, string>;
  group?: string;
  /** Ids of the research items the descriptors rest on (written by onboard.rubric). */
  research?: string[];
  /** Domain graph: which domain competencies a level here counts for, and at what factor. */
  maps_to?: { domain_id: string; factor: number }[];
}

export interface RatingHistory {
  date: string;
  level: number;
  source: Source;
  reason: string;
  /** True on the placeholder entry an onboarding reset or onboard.rubric writes: the first real rating may leave it by more than half a level. */
  placeholder?: boolean;
  /** The answer ids (A-x.1, A-x.2 ...) a first rating is cited from (written by onboard.rating). */
  because?: string[];
}

export interface Rating extends Provenance {
  /** True on the marked placeholder an onboarding reset writes: not assessed, never used as a starting level. */
  placeholder?: boolean;
  level: number;
  /** The level he claimed (equal to level) and the level the gap COUNTS until a piece of work or a test backs it. Every surface reads level_counted. */
  level_claimed?: number;
  level_counted?: number;
  capped?: boolean;
  /** Plain marker text: "counted as 2.5 until you show a piece of work or pass a test". */
  cap_reason?: string;
  target?: number;
  confidence: number;
  source: Source;
  evidence: string[];
  note: string;
  history: RatingHistory[];
}

export type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";

export interface Task extends Provenance {
  /** Domain graph: the TK-* id of lib/domains.data.json this task came from. */
  domain_task?: string;
  /** Where it can be done: on the phone in a spare few minutes, or at a desk with a laptop. */
  where?: "phone" | "desk";
  id: string;
  day?: Day;
  track: Track;
  competency?: string;
  proof?: string;
  kind?: "learn" | "practice" | "test" | "proof" | "roles" | "ask";
  minutes: number;
  points: number;
  adds: string;
  task: string;
  why: string;
  steps: string[];
  stepsDone?: number[];
  /** What a hand-in changed, so it can be undone. */
  prev?: { ev: string; q?: string; proof?: { id: string; status: "missing" | "draft" | "done" | "verified"; links: number } };
  artifact: string;
  link?: { label: string; href: string };
  example?: string;
  exampleWhy?: string;
  impact?: "high" | "medium" | "low";
  status: "todo" | "done" | "submitted" | "later";
  submission?: { links: string[]; files: string[]; note: string; elsewhere?: boolean };
  /** Written by Claude after it reviews the hand-in. Shown on the task and as a "feedback is back" moment. */
  feedback?: TaskFeedback;
  closed?: string;
}

export interface Evidence {
  id: string;
  date: string;
  type: Source | "note";
  title: string;
  detail: string;
  links: string[];
  competency?: string;
  /** "chat": The person's own words saved by the CV engine (evidence.note). A CV line that cites it counts in checks.honesty.dev_sources. */
  by?: "chat";
  pending?: boolean;
  points?: number;
  /** "tonight" marks the one line written at the end of an evening. */
  tag?: "tonight";
  /** The gap (library.gaps id) this entry helps close. */
  gap?: string;
}

export interface ProofItem extends Provenance {
  id: string;
  name: string;
  status: "missing" | "draft" | "done" | "verified";
  priority: number;
  note: string;
  evidence: string[];
  links?: string[];
  why?: string;
  cv?: number;
  interview?: number;
  unlocks?: string;
}

export interface Batch {
  id: string;
  label: string;
  period: string;
  applied: number;
  screen: number;
  portfolio_review: number;
  challenge: number;
  final: number;
  offer: number;
  titles: string[];
  note: string;
}

export type Stage = "applied" | "screen" | "portfolio_review" | "challenge" | "final" | "offer" | "rejected";

export interface Application {
  id: string;
  date: string;
  company: string;
  title: string;
  batch: string;
  stage: Stage;
  url?: string;
}

export interface Bet extends Provenance {
  id: string;
  track: Track;
  status: "active" | "queued" | "won" | "lost";
  focus?: string;
  hypothesis: string;
  action: string;
  metric: string;
  baseline: string;
  target: string;
  started: string | null;
  review_by: string | null;
  result: string | null;
  learned: string | null;
  tasks?: string[];
}

export interface QueueItem {
  id: string;
  type: "research" | "critique" | "test" | "plan" | "answers" | "ask" | "picks" | "goal";
  status: "pending" | "done";
  /** What the person wrote, for "ask" items. */
  ask?: { text: string; kind: "question" | "change" };
  /** Claude's plain-words reply, shown back in the app. Every done item should have one. */
  reply?: string;
  created: string;
  competency?: string;
  task?: string;
  request: string;
  done?: string;
}

export interface Brief {
  id: string;
  competency: string;
  title: string;
  created: string;
  summary: string;
  points: string[];
  sources: { title: string; url: string }[];
  read?: boolean;
}

/** Claude's review of one hand-in: specific, ranked, and tied to the next level. */
export interface TaskFeedback {
  date: string;
  /** One sentence: what this shows about the skill, at which level. */
  verdict: string;
  /** What already works, concretely. 1 to 3 items. */
  working: string[];
  /** What to change first, ranked. 1 to 3 items. */
  fix_first: string[];
  /** The single next move. */
  next: string;
  /** The level this piece reads at, e.g. "Mid". */
  reads_at?: string;
}

export interface SkillTest {
  id: string;
  competency: string;
  status: "ready" | "answered" | "scored";
  created: string;
  questions: { q: string; answer?: string }[];
  score?: number;
  feedback?: string;
  /** Per-question notes from Claude, same order as questions. */
  notes?: string[];
  scored_on?: string;
}

export interface NotNow {
  what: string;
  why: string;
  revisit: string;
}

// ---- Plan engine (all optional; a missing file is valid). See scripts/plan-check.mjs for the rules. ----
export type ResearchStatus = "verified" | "partly" | "unsourced";
export type PlanDay = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";

export interface Demand {
  id: string;
  kind: "target" | "constraint" | "principle" | "ladder" | "reach" | "recognition";
  text: string;
  from: string;
  /** True: the planner may never trade this off. */
  hard?: boolean;
  /** "wish_unsourced" for a number the person holds but nobody has sourced. Such a demand is never hard. */
  /** "market_range": the number now has 2 or more sources. Still never hard. */
  status?: "wish_unsourced" | "market_range";
}
export interface DemandsFile { updated: string; source_hash: string; items: Demand[] }

export interface PlanMeet { demand_id: string; how: string }
export interface PlanPlacement {
  week: number;
  day: PlanDay;
  order: number;
  slot_min: number;
  placed_because: string;
  depends_on: string[];
  load_that_day_min: number;
  /** Required when the day holds only one track. */
  single_track_reason?: string;
}
export interface PlanTask extends Provenance {
  /** Domain graph: the TK-* id of lib/domains.data.json this task came from. */
  domain_task?: string;
  task: string;
  track: Track;
  kind?: "learn" | "practice" | "proof";
  competency?: string;
  minutes: number;
  artifact?: string;
  steps?: string[];
  why?: string;
  where?: "phone" | "desk";
  status?: "todo" | "done" | "submitted" | "later" | "dropped" | "carried";
  /** A gap id. Required unless demand_only is true. */
  gap?: string;
  demand_only?: boolean;
  demand_only_reason?: string;
  meets?: PlanMeet[];
  placement?: PlanPlacement;
  research?: string[];
  research_status?: ResearchStatus;
  example?: string;
  /** Set to "illustration" when the example is made up to show a shape. */
  example_kind?: "illustration" | "real";
  /** Merge candidate when a week slips. */
  compressible?: boolean;
}
export interface PlanWeek {
  n: number;
  week_of: string;
  goal: string;
  goal_gaps?: string[];
  load: { planned_min: number; capacity_min: number };
  status: "upcoming" | "current" | "done" | "slipped" | "carried";
  tasks: string[];
}
export interface PlanForecast {
  ready_by: string | null;
  range: { earliest: string; latest: string } | null;
  confidence: number | null;
  depends_on: string[];
  as_of: string;
  reproduce: { inputs_hash: string };
  /** When ready_by is null: why there is no date. */
  reason?: string;
}
export interface PlanFile {
  updated: string;
  version: number;
  horizon_weeks: 1 | 2 | 4;
  starts: string;
  ends: string;
  status: "draft" | "active" | "in_review" | "closed";
  generated_by?: string;
  inputs?: {
    data_hash?: string; demands_hash?: string; pace?: Pace; per_week_evenings?: number; gap_rule?: string;
    caps?: { searches?: number; fetches?: number };
    /** Set true when the person picked a horizon other than 4. */
    horizon_chosen_by_dev?: boolean;
    /** Rating levels when the plan was made, so P22 can see moves. */
    ratings?: Record<string, number>;
  };
  weeks: PlanWeek[];
  tasks: Record<string, PlanTask>;
  forecast?: PlanForecast;
  slack_min?: number;
  review?: { weekly_next?: string; weekly_last?: string | null; four_week_due?: string; last?: string | null };
}

export interface ResearchItem {
  id: string;
  subject: { type: "task" | "gap" | "demand" | "level" | "source_list"; id: string };
  claim: string;
  supports: string;
  source_url: string;
  source_name: string;
  tier: 1 | 2 | 3 | 4;
  published: string | null;
  retrieved: string;
  excerpt?: string;
  excerpt_sha?: string;
  confidence: number;
  fresh_days: number;
  verified?: { by: string; on: string; result: "match" | "paraphrase" | "mismatch" | "unreachable"; http?: number };
  conflicts_with?: string[];
}
export interface ResearchFile { updated: string; items: ResearchItem[] }

export interface SourceRank { rank: number; name: string; url: string; tier: 1 | 2 | 3 | 4; why_best: string; last_checked: string; alive?: boolean }
export interface SourceTopic { topic: string; competency?: string; need: string; ranked: SourceRank[]; refresh_days: number }
export interface SourcesFile { updated: string; topics: SourceTopic[] }

export interface RunRecord {
  id: string;
  command: string;
  started: string;
  ended?: string;
  status: "complete" | "partial" | "aborted";
  caps?: Record<string, { used: number; max: number }>;
  updated?: { ref: string; what: string }[];
  left?: { ref: string; why: string }[];
  verdicts?: { matched?: number; drifted?: number; unsourced?: number; outdated?: number; done?: number };
  /** The verification pass: how many citations were re-fetched out of how many. */
  verification?: { sampled: number; total: number; matched: number; failed: number };
  data_hash_before?: string;
  data_hash_after?: string;
  resume_token?: string;
}
export interface RunsFile { runs: RunRecord[] }

export type Verdict = "matched" | "drifted" | "unsourced" | "outdated" | "done";
export interface ReviewRecord {
  id: string;
  scope: "week" | "plan";
  date: string;
  plan_id?: string;
  items: { ref: string; verdict: Verdict; why: string; evidence_ids?: string[] }[];
  skills?: { competency: string; moved: "moved" | "not_moved" | "insufficient"; evidence_ids?: string[] }[];
  calibration?: { gap_type: string; planned_min: number; actual_min: number }[];
  decisions?: { ask: string; options: string[]; chosen?: string }[];
}
export interface ReviewsFile { reviews: ReviewRecord[] }

export interface GrowthState {
  /** Plan engine files. Absent until a plan run writes them. */
  demands?: DemandsFile;
  plan?: PlanFile;
  /** Onboarding files. Absent until `growth start`. */
  onboarding?: OnboardingFile;
  unknowns?: UnknownsFile;
  prior?: PriorFile;
  /** CV versions and case studies. Absent until the first CV is made; absent is the same as empty. */
  career?: CareerData;
  research?: ResearchFile;
  sources?: SourcesFile;
  runs?: RunsFile;
  reviews?: ReviewsFile;
  /** Set by the server when Claude Code is working on the data right now. */
  lock?: { by: string; started: string } | null;
  profile: {
    name: string;
    north_star: { role: string; salary_inr_per_month: number; /** currency and period of salary_inr_per_month (the field name is kept for compatibility; the number is in this currency) */ salary_currency?: string; salary_period?: "month"; recognition: string[]; timeline?: string; feeling?: GoalFeeling; trigger?: string; waypoint?: { role: string; salary_inr_per_month?: number } };
    /** Every change to the goal, newest last, with how the person felt about it. */
    goal_history?: { date: string; role: string; salary_inr_per_month: number; feeling?: GoalFeeling; note?: string; waypoint?: string }[];
    /** Questions Claude asked to understand the person before advising. answer null = waiting for the person. */
    intake?: IntakeQ[];
    /** Spaced recall of journal notes: how many times each one was confirmed, and when it was last seen. */
    recall?: Record<string, { step: number; last: string }>;
    /** How many evenings a week the person wants to work: lighter 3, steady 5, push 6. */
    pace?: Pace;
    /** Claude's read of the earliest broken stage, shown on Getting hired. */
    stage?: { name: string; why: string; date: string };
    beliefs_to_test?: { belief: string; counter: string; status: string }[];
    /** Onboarding additions (all optional). Written by the onboard.answer action from the answers, never by hand. */
    role_now?: string;
    constraints?: {
      hours_per_day?: number; hours_per_week?: number; /** DM-47: weekly hours for real project work (not practice); hours_per_week follows it only when B-18 and T-07 are not answered. */ project_hours_per_week?: number; skips_allowed?: boolean; learns_best_by?: string; avoid?: string[];
      /** The person's own lowest acceptable monthly salary. A hard demand (D-floor) because it is his stated need. */
      salary_floor_inr?: number;
      salary_floor_currency?: string; salary_floor_period?: "month";
      blocked_days?: Day[];
      stop_doing?: string[];
      /** How the hours were derived: final, or provisional until every input exists. */
      hours_basis?: string;
      /** Focus hours left on a normal weekday (H-01). Caps hours_per_day. */
      focus_hours_weekday?: number;
      known_disruptions?: string[];
      /** P-01: would he take a lower paid stepping stone. */
      risk_stance?: string;
      stay_rule?: string;
      /** P-04: make_only (D-learn is a hard demand), mixed or free. */
      learning_mode?: "make_only" | "mixed" | "free";
      /** E-03: evenings in a normal week with energy left. Caps the nights the plan uses. */
      energy_evenings?: number;
    };
    /** Round 1 discovery answers for a person with no target role yet (X-01 to X-03). Seeds the exploration course. */
    exploration?: { energisers?: string; field_or_job?: string; try_month?: string };
    /** Domain graph (lib/domains.mjs). Person-side only; the static reference is lib/domains.data.json. Written by onboard.answer from DM-* answers. */
    domain?: DomainProfile;
    /** A-01: what colleagues ask him for. Strengths, not gaps. */
    strengths?: string[];
    /** Money fields named *_inr or *_per_month hold the person's own currency in situation.currency, per month. */
    situation?: {
      runway_months?: number; notice_days?: number; notice_paid?: string; dependents?: string[]; location_pref?: string[]; places?: string[]; work_auth?: string;
      currency?: string; pay_period?: "month" | "year"; country?: string; field?: string; proof_kind?: string; role_start?: string;
      fixed_costs_monthly?: number; fixed_costs_currency?: string; fixed_costs_period?: "month"; debt_total?: number; debt_currency?: string; household_cover_months?: number; work_limits?: string; internal_option?: string;
      credential?: string; history?: string[]; history_reason?: string;
      /** S-01: employed, self-employed or business owner, between jobs, studying, caring or not working, other. */
      status?: string; obligations?: string[]; education?: string; can_move?: string; hard_date?: string;
      work_mode?: string; family_now?: string;
    };
    baseline?: {
      time_use?: Record<string, number>; hours_actual_4w?: number; salary_now_inr?: number; salary_now_currency?: string; salary_now_period?: "month"; salary_range?: [number, number]; salary_range_currency?: string; salary_range_period?: "month";
      salary_why?: string; salary_source?: string; priority?: string[]; refusals?: string[];
      funnel?: { channels?: string; warm?: string; tailored?: string; approaches?: number; conversations?: number; adjusted?: number };
      interviews?: string[]; network_size?: number;
    };
    /**
     * A living, editable estimate of who the person is: how he learns, works, what drains him, what he has said worries him,
     * what he wants, his limits, his voice. His to correct. Private items never leave the app.
     * card is the short core (<= 150 words) always read before feedback, planning, library, CV or outreach.
     */
    person?: { items: PersonItem[]; card?: string; reviewed?: string; words?: PersonWord[] };
    /** Add-on tools (skill files) the person has installed, and what they found. Kept here so backups and restore cover it. */
    modules?: {
      installed: ModuleInfo[];
      results: ModuleResult[];
      /** Who answers each topic: a module id, or "built-in". Set when an add-on is connected. */
      primary?: Record<string, string>;
      /** Built-in ability ids hidden from hints and the Companion list because an add-on does them better. Reversible. */
      retired?: string[];
    };
  };
  /** generic: true on the placeholder an onboarding reset writes; Round 2 replaces it with a researched rubric (onboard.rubric). */
  rubric: { levels: Record<string, string>; competencies: Competency[]; schema_version?: number; _domains_ref?: string; roles?: Record<string, { label: string; domain_role: string; level_map: Record<string, string>; default?: boolean }>; generic?: boolean; /** true when described from his own answers because no research was available: confidence stays at or under 0.3 */ unsourced?: boolean; source?: string; as_of?: string; _about?: string };
  skills: { updated: string; ratings: Record<string, Rating> };
  evidence: { entries: Evidence[] };
  proof: { items: ProofItem[] };
  reach: {
    funnel: { stages: string[]; batches: Batch[]; applications: Application[] };
    recognition: {
      linkedin_followers: { date: string; value: number }[];
      inbound_messages: { date: string; from: string }[];
      published: { date: string; title: string; url?: string }[];
      mentions_by_strangers: { date: string; detail: string }[];
    };
  };
  bets: { bets: Bet[] };
  week: { week_of: string; focus: string; focus_short?: string; goal?: number; tasks: Task[] };
  notnow: { items: NotNow[] };
  queue: { items: QueueItem[] };
  learning: { briefs: Brief[] };
  tests: { tests: SkillTest[] };
  library: { items: { title: string; url: string; for: string; note: string }[]; roles: { company: string; title: string; url: string; note?: string }[]; picks?: Pick[]; gaps?: Gap[]; refreshed?: string; /** Things Claude looked at and left out, with the reason. Shown folded, so the list can be trusted. */ left_out?: LeftOut[]; /** Small checked thoughts from designers and thinkers, shown one at a time. Never required. */ trinkets?: Trinket[] };
}

/**
 * A small, checked thought from a designer or thinker, for the person to carry for a day.
 * Either a short exact quote (quoted: true, at most 25 words, opened at its source) or Claude's plain-words
 * paraphrase (quoted: false, labelled as a paraphrase). Never an invented quote.
 */
export interface Trinket {
  /** "T-001" */
  id: string;
  week_of: string;
  /** Who it is from, as they are known: "Dieter Rams". */
  who: string;
  /** The words. At most 200 characters. */
  line: string;
  quoted: boolean;
  /**
   * The page Claude opened to check it. Required.
   * excerpt: the sentence on that page the thought rests on, copied from the page. For a quote it must contain `line`.
   * found_at: where on the page ("heading: Principle 10", "paragraph 3").
   */
  source: { title: string; url: string; excerpt?: string; found_at?: string };
  /** One tiny thing to notice or try today, optional. */
  try?: string;
  competency?: string;
  gap?: string;
  /** Date Claude opened the source and confirmed it. */
  checked: string;
  status: "new" | "saved" | "hidden";
}

/**
 * The honest check Claude runs on a pick before it is shown. Six questions, 0 to 10 each.
 * total = round(10 * (0.25 fit + 0.25 gain + 0.15 time + 0.15 substance + 0.10 fresh + 0.10 best)).
 * verdict: total >= 80 read_now, 65 to 79 worth_it, 50 to 64 skim. A shown pick (new or kept) needs total 65 or more,
 * fit, substance and fresh at 4 or more, gain at 5 or more and time at 3 or more. Anything else is not a pick:
 * it goes to library.left_out with the reason.
 */
export interface PickScore {
  /** Is it about his goal, his gaps, his level and this week? */
  fit: number;
  /** Will he learn something that changes what he does, or is it new to him? */
  gain: number;
  /** Is the payoff worth the minutes, next to his hour a night? */
  time: number;
  /** Concrete and evidenced, or industry jargon and buzzwords? */
  substance: number;
  /** Still true and current, or stale? */
  fresh: number;
  /** Compared with the alternatives, is this the best he can do for this growth? */
  best: number;
  total: number;
  verdict: "read_now" | "worth_it" | "skim";
  /** One line, second person: why this, for you. */
  why: string;
  /** When best is under 7: what would be better and why it isn't the pick, or "nothing better found". */
  better?: string;
  /** Titles of the other candidates it was compared with. At least 2, so "is there something better?" can be checked. */
  compared: string[];
  /** YYYY-MM-DD */
  scored: string;
}

export interface LeftOut {
  title: string;
  kind: Pick["kind"];
  url?: string;
  /** Plain reason: "Mostly vocabulary, no examples", "Out of date since the 2025 Figma rebuild". */
  why_not: string;
  total?: number;
  checked: string;
}

/** What kind of job an add-on tool does. Core commands such as "analyse cv" find the tool by this. */
export type ModuleCapability = "cv" | "linkedin" | "portfolio" | "interview" | "other";

export type PersonArea = "learns" | "works" | "energy" | "worry" | "wants" | "limits" | "voice";

/**
 * One line of the person model. An estimate with its evidence, never a verdict.
 * Confidence caps by source: estimate 0.5, observed 0.7, you_said 0.9. A "worry" is only stored when the person said it.
 * A rejected item is never inferred again.
 */
export interface PersonItem extends Provenance {
  /** "W-001" */
  id: string;
  area: PersonArea;
  /** Second person, at most 140 characters: "You learn fastest by making something real." */
  text: string;
  source: "you_said" | "observed" | "estimate";
  /** Ids of what it rests on: journal entries, intake answers, skipped picks, tasks. */
  evidence: string[];
  confidence: number;
  status: "proposed" | "confirmed" | "rejected" | "hidden";
  /** Private items never go into add-ons, packs for third parties, CV or any copy. */
  private: boolean;
  /** Where Claude may use it, so it is read only when it changes the output. */
  use_for: ("feedback" | "planning" | "library" | "cv" | "outreach" | "tone")[];
  noted: string;
  confirmed?: string;
  /** Why Claude thinks this, in one line. */
  why?: string;
}

/**
 * One single word Claude assumes about the person, shown in the "About you" cloud. His to fix.
 * Confidence caps by source: estimate 0.5, observed 0.7, you_said 0.9. A "worry" word is only stored when the person said it.
 * A rejected word is never added again.
 */
export interface PersonWord extends Provenance {
  /** "W-w01" */
  id: string;
  /** One word or hyphenated, at most 24 characters, no spaces. */
  word: string;
  /** 1 (small) to 5 (large). */
  weight: 1 | 2 | 3 | 4 | 5;
  area: PersonArea;
  source: "you_said" | "observed" | "estimate";
  confidence: number;
  status: "proposed" | "confirmed" | "rejected";
  /** Where it came from, at most 140 characters. */
  why?: string;
  /** Private words never leave the app. */
  private?: boolean;
}

/** The fields a caller gives to word.set. The app fills id, caps confidence and decides status. */
export interface PersonWordInput {
  word: string;
  area: PersonArea;
  weight?: number;
  source: PersonWord["source"];
  confidence?: number;
  why?: string;
  private?: boolean;
}

/** One thing an add-on lets the person do, in plain words. Comes from the skill file, never preselected. */
export interface Ability {
  /** Short, lowercase, hyphenated, unique within the module. */
  id: string;
  /** "Score your LinkedIn profile". */
  label: string;
  /** One to three plain phrases the person can say, each at most 60 characters. */
  say: string[];
  /** Groups abilities that do the same job across add-ons and built-ins: "cv-review", "linkedin-review". */
  topic: string;
  /** What it needs, in plain words: "your profile text or the PDF from LinkedIn's Save to PDF". */
  reads: string;
  gives: "score" | "notes";
  enabled: boolean;
  /** Always false or absent. Anything that posts, sends or publishes is never an ability. */
  posts?: false;
}

/** One line of the "what this adds / strengthens / can drop" report. */
export interface ImpactLine {
  /** At most 120 characters. */
  text: string;
  /** What in the file, or in the person's own data, supports it. At most 120 characters. */
  why: string;
  /** A built-in ability id, a module id, a gap id or a score key. */
  target?: string;
}

export interface ModuleImpact {
  adds: ImpactLine[];
  strengthens: ImpactLine[];
  /** Proposals to hide, never to delete. */
  can_drop: ImpactLine[];
  /** "file": judged from the skill file's text only. "trial": compared by running it once. */
  based_on: "file" | "trial";
  /** YYYY-MM-DD */
  decided: string;
}

/** An add-on: someone's skill file, kept unchanged, plus how the Growth app uses it. */
export interface ModuleInfo {
  /** What the file enables, in plain words. New add-ons always have at least one. */
  abilities?: Ability[];
  impact?: ModuleImpact;
  /** Short, lowercase, hyphenated: "cv-analyser". */
  id: string;
  name: string;
  capability: ModuleCapability;
  /** One plain line on what it does for the person. */
  does: string;
  /** Where the unchanged skill file is: copied into growth/modules/<id>/skill/ ("file"), or already installed in Claude ("installed"). */
  skill: { kind: "file"; path: string } | { kind: "installed"; name: string };
  /** What it needs from the person, in plain words: "Your CV as a PDF or pasted text". */
  input: string;
  /** Where it came from: a URL, a path, or "pasted". */
  source: string;
  installed: string;
  enabled: boolean;
  /** When two tools share a capability, the one "analyse cv" uses. */
  default?: boolean;
  /** True when the skill can post, send or publish. It is never allowed to; the person approves each time or it stays read-only. */
  can_publish?: boolean;
  /** sha1 of the skill file as stored at install. `module run` recomputes it and stops if it changed. */
  sha1?: string;
  /** Lines in the skill that tried to instruct Claude beyond its job, quoted at install. Refused on every run. */
  flagged?: string[];
}

export interface ModuleResult {
  id: string;
  module: string;
  date: string;
  /** What was looked at: "CV.pdf, 1 page". */
  subject: string;
  /** 0 to 100, or null when the tool gave notes and no number. */
  score: number | null;
  /** One or two words for the number: "Solid", "Needs work". */
  word?: string;
  /** At most about 240 characters, plain second person. */
  summary: string;
  /** Up to 3. */
  strengths: string[];
  /** Up to 5, most useful first. */
  fixes: { what: string; why: string; effort?: string }[];
  /** "stale" once the subject has changed since this was run. */
  status: "current" | "stale";
  /** Short hash or modified date of the subject, so staleness can be told. */
  fingerprint?: string;
}

export type LogKind = "application" | "feedback" | "shipped" | "win" | "note";

export type Action =
  | CareerAction
  | { type: "task.done"; id: string }
  | { type: "task.later"; id: string }
  | { type: "task.reopen"; id: string }
  | { type: "task.undo"; id: string }
  | { type: "task.step"; id: string; step: number }
  | { type: "task.submit"; id: string; links: string[]; files: string[]; note: string; elsewhere?: boolean }
  | { type: "log"; kind: LogKind; text: string; company?: string; title?: string; competency?: string; from?: Source; tag?: "tonight"; gap?: string; recall?: string }
  /** Takes back the journal line just saved (today, same text, a plain note). */
  | { type: "log.undo"; text: string }
  | { type: "queue.request"; kind: "research" | "test"; competency: string }
  | { type: "application.stage"; id: string; stage: Stage }
  | { type: "proof.attach"; id: string; links: string[]; files: string[]; note: string }
  | { type: "proof.respond"; id: string; who: string; said: string; from: Source }
  | { type: "followers"; value: number }
  | { type: "test.answer"; id: string; answers: string[] }
  | { type: "brief.read"; id: string }
  | { type: "review.submit"; happened: string }
  | { type: "intake.answer"; answers: { id: string; answer: string }[] }
  | { type: "ask"; text: string; kind: "question" | "change" }
  | { type: "pick.set"; id: string; status: "new" | "kept" | "skipped"; reason?: string }
  | { type: "pick.done"; id: string; note: string }
  | { type: "picks.request" }
  | { type: "trinket.set"; id: string; status: "new" | "saved" | "hidden" }
  | { type: "person.set"; id: string; status: "proposed" | "confirmed" | "rejected" | "hidden" }
  | { type: "person.edit"; id: string; text: string }
  | { type: "word.set"; words: PersonWordInput[] }
  | { type: "word.confirm"; id: string }
  | { type: "word.reject"; id: string }
  | { type: "word.edit"; id: string; word: string }
  | { type: "word.restore"; word: PersonWord }
  | { type: "person.clear" }
  | { type: "person.restore"; person: NonNullable<GrowthState["profile"]["person"]> }
  | { type: "pace.set"; pace: Pace }
  | { type: "recall.mark"; id: string; kept: boolean }
  | { type: "goal.set"; role: string; salary: number; feeling: GoalFeeling; note?: string; waypoint?: { role: string; salary?: number } | null }
  | { type: "gap.move"; id: string; dir: "up" | "down" }
  // Plan engine. Each runs the shared validator and refuses a write that would create an error. Only plan.project_week touches week.json.
  | { type: "plan.set"; plan: PlanFile }
  | { type: "demands.set"; demands: DemandsFile }
  | { type: "research.add"; items: ResearchItem[] }
  | { type: "sources.set"; sources: SourcesFile }
  | { type: "run.log"; run: RunRecord }
  | { type: "review.set"; review: ReviewRecord }
  | { type: "plan.project_week" }
  // Onboarding. Each is guarded, snapshotted and validated like the rest. onboard.reset needs a token from scripts/onboarding-reset.mjs plan.
  | { type: "onboard.answer"; id: string; value: unknown; raw?: string; status?: "answered" | "unknown"; evidence?: string[]; confirmed?: boolean; quote?: string; echo?: string; private?: boolean; meta?: Record<string, unknown>; /** per month, per year, per week, per hour: how a bare number is to be read (P1-2) */ unit?: string; /** true: the person confirmed the reading the script echoed for an ambiguous or unusual number */ reading_confirmed?: boolean }
  | { type: "onboard.confirm"; id: string; quote: string }
  | { type: "onboard.skip"; id: string; reason?: string; consequence: string }
  | { type: "onboard.consent"; round: OnboardRound; answer: "yes" | "no"; quote: string }
  | { type: "onboard.round"; round: OnboardRound; summary?: string; confirmed?: boolean; quote?: string; consent?: boolean; skip_r3?: boolean; skip_r2?: { reason: string }; new_sitting?: boolean; /** required with new_sitting: he_asked_to_continue, has_time_now, has_energy, deadline or other */ reason_tag?: string; reason?: string; /** after a crisis pause: his own yes to continue (with quote) */ continue?: boolean; complete?: boolean; plan_pending?: { reason: string; next_command: string }; generated?: { id: string; competency: string; text: string; research: string[] }[] }
  | { type: "onboard.pause"; reason?: string; /** stored as a tag, never his sentence: tired, busy, unsure, interrupted, rest, other */ reason_tag?: string; /** true, or reason "crisis": nothing he said is stored and resume never quotes it */ crisis?: boolean }
  | { type: "onboard.rating"; competency: string; level: number; source?: "self" | "ai" | "shipped"; because: string[]; reason?: string; target?: number; note?: string }
  | { type: "onboard.forget"; round: "R3"; quote?: string }
  /** His reading of an off-limits phrase of R0-03 as taxonomy topics; counts only with confirmed: true and his words in quote. */
  | { type: "onboard.boundary"; phrase: string; topics: string[]; confirmed: boolean; quote: string }
  /** A private Round 3 answer found in a public place: the public copy becomes "(private)". Without id, every such copy. */
  | { type: "onboard.redact"; id?: string }
  /** "Skip the rest of this round": answers stay, uncovered MUST are deferred with their consequence. reason_tag: tired, busy, too_personal, not_useful, unsure, other. */
  | { type: "onboard.skip_round"; round: OnboardRound; reason_tag: string; quote: string }
  | { type: "onboard.contradiction"; id: string; between?: string[]; status: "resolved" | "accepted_by_dev"; resolved_by?: string }
  | { type: "onboard.research"; items: (Partial<ResearchItem> & { subject: ResearchItem["subject"]; claim: string; supports: string; source_url: string; source_name: string; tier: ResearchItem["tier"] })[] }
  | { type: "onboard.rubric"; competencies: { id: string; name: string; group?: string; levels: Record<string, string>; research: string[] }[]; levels?: Record<string, string>; /** "self_described" accepts zero research ids: the rubric is labelled unsourced */ source?: string; reason?: string; remap?: Record<string, string> }
  | { type: "onboard.map"; id: string; competency: string | null; quote?: string; reason?: string; skill_area?: string }
  | { type: "unknown.add"; item: Omit<UnknownItem, "id"> & { id?: string } }
  | { type: "unknown.resolve"; id: string; answered_in: string; abandoned_reason?: string }
  | { type: "onboard.reset"; token: string; phrase: string; force_new?: boolean; different_person?: boolean; /** true when he said he is the person the archived data was about: only then is R0-04 offered */ same_person?: boolean };

export interface IntakeQ {
  id: string;
  q: string;
  /** One line on what the answer decides, shown under the question. */
  why?: string;
  /** Optional choices; the person can still write his own. */
  options?: string[];
  asked: string;
  answer: string | null;
  date?: string;
  source?: "self";
  /** Claude's one line on what this answer changed. */
  takeaway?: string;
}

/** Something worth the person's time this week: picked by Claude, always optional. */
export interface Pick extends Provenance {
  /** Set by an onboarding reset: the pick is kept, but Claude re-checks it against the new goal. */
  needs_review?: boolean;
  /** YYYY-MM-DD the pick was added. Picks added on or after SCORE_REQUIRED_FROM must be scored. */
  added?: string;
  id: string;
  week_of: string;
  kind: "book" | "article" | "video" | "visual" | "podcast" | "news";
  title: string;
  by: string;
  url: string;
  /** Read or watch time. Books: hours to read. */
  minutes?: number;
  /** When it was published: YYYY, YYYY-MM or YYYY-MM-DD. */
  published?: string;
  /** Why it matters for this week's focus, one sentence. */
  why: string;
  /** What to look for or keep, so it turns into something you use. */
  look_for?: string;
  competency?: string;
  /** The task this pick feeds, so the app can show it at the right moment. */
  task?: string;
  /** The gap (library.gaps id) this pick helps close. */
  gap?: string;
  /** When Claude last opened it and confirmed it's current and the link works. */
  checked?: string;
  /** For anything older than three years: why it's still the standard. */
  still_current?: string;
  /** News only: one small thing to try, so it turns into skill. */
  try_it?: string;
  /** Books only: an investment, so price and a way to try it first. */
  price_inr?: number;
  try_first?: { title: string; url: string };
  status: "new" | "kept" | "skipped" | "done";
  skip_reason?: string;
  note?: string;
  done?: string;
  /** Journal entry made from the takeaway, removed again on undo. */
  ev?: string;
  /** The honest check run before it was shown. Every new pick carries one. */
  score?: PickScore;
  /** A picture for the card: a YouTube thumbnail derived from a verified video id, or a book cover from a verified ISBN. Optional; the card draws its own visual without it. */
  thumb?: string;
}

/** Something the person doesn't know or hasn't done yet that matters for his goal. Claude opens, tracks and closes these. */
export interface Gap extends Provenance {
  /** Domain graph: the competency id of lib/domains.data.json this gap is about (competency stays the rubric id it is hosted on). */
  domain_competency?: string;
  /** Domain graph: the 0 to 1 share of an earlier role's level that counts for the target role. */
  transfer_w?: number;
  /** Domain graph: the requirement level of the target role. */
  target_level?: number;
  /** Domain graph: set when this gap is a hard proof blocker (a proof kind id). */
  proof_blocker?: string | null;
  /** Domain graph: true until an artifact or a test supports the level. */
  provisional?: boolean;
  /** "onboarding": written and kept consistent with the ratings by the interview's bridge (recomputeBridge); the planner owns evenings once it plans. */
  origin?: "onboarding";
  /** What the evenings estimate rests on, in plain words (task counts, past pace). */
  evenings_basis?: string;
  /** Plan engine, all optional: research ids (data/research.json), planned task ids, rank and why. */
  research?: string[];
  tasks?: string[];
  rank?: number;
  rank_why?: string;
  research_status?: ResearchStatus;
  market_evidence?: { research_id: string; kind: string; note: string }[];
  level_definition?: { from: string; current: string; target: string };
  best_source?: { research_id: string; why: string };
  chosen_path?: string;
  paths_considered?: { path: string; rejected_because: string }[];
  /** Days of waiting on other people that the estimate does not count. */
  waiting_days?: number;
  id: string;
  competency: string;
  /** The gap in plain words, as something to be able to do: "Run a usability test with a real person". */
  title: string;
  /** Why it matters for his goal, one sentence. */
  why: string;
  /** Where Claude saw it: "your dossier", "Claude's review of S-01", "your answer about interviews". */
  source: string;
  status: "open" | "closing" | "closed";
  opened: string;
  closed?: string;
  /** What would close it, as something he can show. */
  closes_when: string;
  /** Claude's one line on where it stands now. */
  now?: string;
  /** Claude's estimate of evenings of work left to close it. Lowered as work lands. */
  evenings?: number;
  /** The day Claude made the evenings estimate. Dates count from here, so working never pushes them later. */
  estimated?: string;
  /** Which nightly slot works on it: the skill task or the getting-hired task. */
  track?: "skill" | "reach";
}

export type Pace = "lighter" | "steady" | "push";
export type GoalFeeling = "right" | "too_far" | "not_mine" | "higher";

// ---- Onboarding (`growth start`). All optional files. Rules: lib/validate.mjs. Question bank: lib/onboarding-bank.mjs. ----
export type OnboardRound = "R0" | "R1" | "R2" | "R3" | "R4" | "R5";
export type OnboardStatus = "not_started" | "in_progress" | "paused" | "complete";
export interface OnboardAnswer {
  round: OnboardRound;
  value: unknown;
  raw: string;
  asked: string;
  answered: string;
  status: "answered" | "unknown" | "superseded" | "off_limits";
  confirmed: boolean;
  /** 0 to 1. Self report with no artifact is capped at 0.3, a number he can check at 0.5. */
  confidence: number;
  source: "self";
  evidence: string[];
  /** Hash of value, so applying the same value again is a no-op. */
  hash: string;
  echo?: string;
  /** His own words (80 characters or fewer) when he confirmed this answer. */
  confirmed_quote?: string;
  private?: boolean;
  /** Crisis wording in a free answer: value is the placeholder "(private: answered, not stored)" and the answer feeds nothing. */
  withheld?: boolean;
  /** The public copy of this (private) answer was replaced with "(private)" by onboard.redact; a resend does not mirror it back. */
  redacted?: boolean;
  /** Earlier values when the question was redone: [{ value, at }]. Two different values raise C-09. */
  history?: { value: unknown; at: string }[];
  /** Small extras Claude records: evidenced_level, descriptor_level, competency. */
  meta?: Record<string, unknown>;
  /** For a number question: the unit, currency and period it was read in, and whether a unit or a figure was converted. */
  normalised?: { unit?: string; currency: string | null; period: "month" | "year" | null; converted: boolean; confidence?: number; low?: number; high?: number };
}
export interface OnboardingFile {
  version: 1;
  status: OnboardStatus;
  started?: string;
  /** Folder name under data/.backups, empty when onboarding started without an erase. */
  backup?: string;
  round: OnboardRound;
  sitting?: { n: number; asked: number; max: number; started?: string; started_at?: string; budget_min?: number; /** why a full sitting was continued: a tag, never his sentence */ reason_tag?: string };
  consent: Partial<Record<OnboardRound, string | null>>;
  /** His own words for each consent (yes or no), 80 characters or fewer. */
  consent_quotes?: Partial<Record<OnboardRound, { answer: "yes" | "no"; quote: string; at: string }>>;
  /** Rounds he said no to, with the date and his words; their MUST questions are deferred with a consequence. */
  declined?: Partial<Record<OnboardRound, { at: string; quote: string }>>;
  /** Set when the research round was skipped on purpose. Readiness is then "enough_with_gaps". */
  adaptive_skipped?: { reason: string; at: string };
  /** A skill area from R1 (his words, normalised) mapped to a rubric competency, with his confirmation. */
  skill_map?: Record<string, { competency: string; at: string; quote: string }>;
  /** What the answers produced without a live file of their own: risks, tasks for the plan, hours, readiness. Rebuilt on every answer. */
  derived?: {
    updated: string;
    risks: { id: string; text: string; source: string; watch: string }[];
    tasks?: { id: string; task: string; minutes: number; kind: string; placed?: { week: number; day: string } }[];
    hours: { per_week: number | null; per_day: number | null; nights: number; basis: string; provisional: boolean; missing: string[] } | null;
    readiness: { partial: boolean; missing: string[]; generic_rubric: boolean };
    unmapped: { id: string; skill_area: string; reason: string }[];
  };
  /** Set when the researched rubric could not be built (no research): the rubric is described from his own answers and labelled unsourced. */
  unsourced_rubric?: { reason: string; at: string };
  /** Set when onboarding was completed with the research round not done (generic or unsourced rubric): the course still holds the research task. */
  complete_with_gaps?: { reason: string; at: string };
  /** Earlier values of a set-up answer that was replaced (R0), kept without raising a contradiction. */
  superseded_values?: Record<string, { value: unknown; at: string }[]>;
  /** Set when onboarding was completed before a plan existed: why, and the command that builds it. */
  plan_pending?: { reason: string; next_command: string; at: string };
  tone?: "straight" | "straight_checkins" | "slower";
  /** Question ids that are not asked (derived from his R0-03 words by topic; literal ids are accepted too). */
  off_limits?: string[];
  /** His own words for R0-03, the topics they matched, and whether he said nothing is off limits (recorded explicitly). */
  off_limits_words?: string[];
  off_limits_topics?: string[];
  off_limits_none?: boolean;
  /** His phrases that matched no taxonomy topic and still need a confirmed reading (onboard.boundary). */
  off_limits_unmatched?: string[];
  /** His confirmed readings of off-limits phrases: normalised phrase to topics, with his words. Re-sending R0-03 never wipes them. */
  boundary_map?: Record<string, { phrase: string; topics: string[]; confirmed: boolean; quote: string; at: string }>;
  /** Rounds he stopped part way (onboard.skip_round): the tag, his words, how many answers stayed, the MUST that were deferred. */
  skipped_rounds?: Partial<Record<OnboardRound, { at: string; reason_tag: string; quote: string; answered_before: number; deferred: string[] }>>;
  /** Set when the gaps and demands were first written (entering R5); from then on every action recomputes them. */
  bridge_written?: string;
  /** One record per question not asked because of a boundary: covered, no consequence, no task. */
  skipped_by_boundary?: Record<string, { topic: string; at: string }>;
  /** How many of the optional questions are offered: quick (none), standard (the best few per round), deep (all). */
  depth?: "quick" | "standard" | "deep";
  /** Set by onboard.pause. A crisis pause stores no sentence of his; resume never quotes the last answer while it is active. */
  paused?: { at: string; reason: string; crisis: boolean };
  crisis?: { active: boolean; at: string; resumed_at?: string };
  /** Set by onboard.forget: rounds whose answers he asked to be deleted, and the date. */
  forgotten?: Partial<Record<OnboardRound, string>>;
  /** Set when there is no target role yet: the course is an exploration course, not a rubric. */
  exploring?: { since: string; reason: string };
  last_asked?: string | null;
  pending_followup?: string | null;
  answers: Record<string, OnboardAnswer>;
  skipped: Record<string, { when: string; reason: string; consequence: string; count?: number }>;
  contradictions?: { id: string; between: string[]; detail: string; status: "open" | "resolved" | "accepted_by_dev"; resolved_by?: string; severity?: "note" | "block"; fixable_only?: boolean; sig?: string }[];
  round_summaries?: Partial<Record<OnboardRound, { text: string; confirmed: string | null; quote?: string }>>;
  /** Registered adaptive questions: each cites research ids; A.2 stores the rubric's own four descriptors (options) and their levels. */
  generated_questions?: Record<string, { template: string; competency: string; text: string; research?: string[]; options?: string[]; levels?: Record<string, number>; inputs_hash?: string }>;
  /** Named extras from questions that have no live field (avoidance, exposure, premortem). Private ones stay here. */
  notes?: Record<string, unknown>;
  research?: { items: string[]; done: string };
}
export type UnknownKind = "U1" | "U2" | "U3" | "U4" | "U5";
export interface UnknownItem extends Provenance {
  id: string;
  what: string;
  question: string;
  round: OnboardRound;
  kind: UnknownKind;
  why_it_matters: string;
  blocks?: string[];
  how: "task" | "ask" | "research" | "observe";
  how_kind?: "diagnostic" | "evidence" | "person" | "log";
  method: string;
  owner: "dev" | "claude";
  /** The task this becomes, before the plan engine places it. plan_kind is a PlanTask kind. */
  draft_task?: { task: string; plan_kind: "learn" | "practice" | "proof"; minutes: number; artifact: string; why: string };
  task_id?: string;
  research_id?: string;
  placed?: { week: number; day: PlanDay; because: string };
  due: string;
  status: "open" | "answered" | "abandoned";
  answered_in?: string;
  abandoned_reason?: string;
  assumption?: string;
  confidence_if_assumed?: number;
}
export interface UnknownsFile { updated: string; items: UnknownItem[] }
/** Read only archive of what was known before a reset. Nothing here is current until the person confirms it or answers again. */
export interface PriorFile {
  archived: string;
  backup: string;
  note: string;
  profile: unknown;
  evidence: unknown[];
  ratings: unknown;
  gaps: unknown[];
  reach: unknown;
  rubric: unknown;
  confirmed: Record<string, "still_true" | "changed" | "unsure">;
}

// ---- CV and case studies (data/career.json, optional). Rules: handoff-docs/specs/cv-portfolio-spec.md ----
export type CvSourceKind = "dossier" | "onboarding" | "evidence" | "dev";
/** One fact's evidence: a short excerpt, word for word, from the named source. */
export interface CvSource { kind: CvSourceKind; ref: string; quote: string }
export interface CvBullet { id: string; text: string; sources: CvSource[] }
export interface CvItem {
  id: string; heading: string; sub?: string; dates?: string;
  /** Renders in the compact "earlier roles" grid (experience) or the small muted line (education). */
  compact?: boolean;
  /** Quotes that support the heading, sub line and dates (the numbers in them). */
  sources?: CvSource[];
  bullets: CvBullet[];
}
export type CvSectionKind = "summary" | "experience" | "skills" | "education" | "projects" | "links" | "other";
export interface CvSection { id: string; kind: CvSectionKind; title: string; items: CvItem[] }
export interface CvHonesty {
  ran: string; pass: boolean; unsourced_numbers: string[]; deny_hits: string[]; placeholders: number;
  /** Plain sentences: a quote that is not word for word in its source, a line with no source, a link not in the career file. */
  problems?: string[];
  /** Ids (version/section/item/bullet) of lines that rest on the person's word: a dev source (wording only, never a number) or a cited note saved from chat (by "chat"). The app says "N lines rest on your word". */
  dev_sources?: string[];
  /** Lines worth a second look that do not block the CV. */
  warnings?: string[];
}
export interface CvAts {
  ran: string; job: string; matched: string[]; missing: string[]; estimate: number;
  /** Always "AI estimate": it is never a measured score. */
  label: "AI estimate";
  /** True when the CV was edited after this ran. */
  stale?: boolean;
}
export interface CvVersion {
  id: string; made: string; why: string; base: string | null;
  /** ISO time of the last edit. A PDF older than this is out of date (cv-promote refuses it). */
  changed?: string;
  target: { company: string; role: string; post_excerpt?: string } | null;
  promoted: boolean;
  /** cv/drafts/CV_vN.html */
  file: string;
  pdf: string | null;
  header: { name: string; title: string; location: string; email: string; links: { label: string; url: string }[]; /** Quotes that back any number in the header text, section titles or link labels (checked like a bullet's). */ sources?: { kind: "dossier" | "onboarding" | "evidence" | "dev"; ref: string; quote: string }[] };
  sections: CvSection[];
  checks: { honesty: CvHonesty | null; ats: CvAts | null };
}
export type CaseFormat = "decision_log" | "six_part" | "star" | "problem_solution_impact" | "before_after_bridge";
export interface CaseBeat {
  title: string; text: string; sources: CvSource[];
  /** Facts still needed, in plain words, each starting [NEEDS: ... ]. */
  needs: string[];
}
export interface CaseDecision { decision: string; context: string; options: string[]; tradeoffs: string; outcome: string; sources: CvSource[] }
export interface CaseStudy {
  id: string; title: string; one_line: string; type: string; owned: string; team: string; audience: string;
  format: CaseFormat; hook: string; status: "outline" | "draft" | "ready"; updated: string;
  beats: CaseBeat[]; decisions: CaseDecision[];
  /** Recomputed by readState and written back by cv-check; never trusted from the client. */
  checks?: { honesty: CvHonesty | null };
}
export interface CareerData {
  updated: string;
  cv: { current: string | null; versions: CvVersion[] };
  cases: CaseStudy[];
}

/** Career actions (lib/career.mjs). Each runs the shape rules and the honesty check; cv.restore is the one step Undo. */
export type CareerAction =
  | { type: "cv.version.add"; version: { id?: string; why: string; base?: string | null; target?: CvVersion["target"]; header: CvVersion["header"]; sections: CvSection[] }; make_current?: boolean }
  /** new_version: true edits a copy under a new id (base = the original, why = `why`) and makes it current. */
  | { type: "cv.section.set"; version?: string; section: CvSection; why?: string; new_version?: boolean; make_current?: boolean }
  /** Fills one [NEEDS ...] into a copy (a new version, why "Filled in: ..."). placeholder: the exact text, or its number from 1. */
  | { type: "cv.fill"; version?: string; placeholder: string | number; text: string; sources?: CvSource[]; make_current?: boolean }
  | { type: "cv.current"; id: string }
  /** version is required. Either wrapped in `ats` or flat. */
  | { type: "cv.ats.set"; version: string; ats: { job: string; matched: string[]; missing: string[]; estimate: number } }
  | { type: "cv.ats.set"; version: string; job: string; matched: string[]; missing: string[]; estimate: number }
  | { type: "case.set"; case: Partial<CaseStudy> & { id: string; title: string } }
  | { type: "case.remove"; id: string }
  /** Saves a fact the person said as an evidence entry (like `log`, kind note|shipped|win) and returns its id (ev-NNN) in results[].ev; later actions in the same list can cite it as {kind:"evidence", ref:id, quote}. */
  | { type: "evidence.note"; text: string; kind?: "note" | "shipped" | "win" };
// cv.restore is not an app action: only scripts/cv-act.mjs accepts it. The app undoes through its snapshots.
