// Fixtures for scripts/domains-check.mjs: the six validation personas (spec 7.1), the worked examples (spec 3.8, 2.4) and the
// spec's requirement vectors for the roles that are only `planned` in the data file. Test-only: these vectors are NOT shipped
// in lib/domains.data.json (The person's decision: 5 launch roles, the rest are stubs). Every number is the spec's, labelled `model`.

/** Spec 2.2 base vectors for the 8 planned roles, supplied to computeGap as opts.roles (test only). */
export const PLANNED_VECTORS = {
  ux_writer:        { family: "D", anchor: "S", base: [2, 3, 1, 4, 3, 3, 2, 2, 1, 2, 3, 2, 1, 0, 0, 0, 3, 0, 3, 3, 2, 1, 0, 2, 3, 3] },
  creative_director: { family: "D", anchor: "S", base: [4, 2, 4, 3, 4, 1, 3, 3, 3, 1, 2, 1, 1, 3, 2, 1, 2, 0, 4, 3, 3, 3, 1, 2, 2, 4] },
  design_leader:    { family: "D", anchor: "L", base: [3, 3, 2, 2, 4, 3, 2, 2, 2, 4, 3, 3, 2, 1, 0, 0, 1, 0, 4, 4, 4, 4, 1, 2, 3, 4] },
  corporate_comms:  { family: "P", anchor: "S", base: [1, 0, 1, 4, 4, 1, 3, 3, 3, 1, 1, 2, 3, 3, 3, 3, 3, 0, 4, 3, 2, 3, 4, 1, 3, 3] },
  comms_leader:     { family: "P", anchor: "L", base: [1, 0, 2, 3, 4, 1, 3, 4, 4, 2, 1, 3, 4, 3, 3, 3, 2, 0, 4, 4, 4, 4, 4, 1, 3, 3] },
  brand_strategist: { family: "M", anchor: "S", base: [2, 0, 3, 3, 4, 3, 4, 4, 4, 1, 0, 2, 3, 3, 3, 1, 2, 0, 3, 3, 2, 3, 1, 1, 2, 3] },
  growth_marketer:  { family: "M", anchor: "S", base: [0, 0, 0, 2, 1, 2, 3, 2, 1, 3, 1, 4, 4, 3, 3, 0, 2, 4, 2, 3, 1, 3, 0, 3, 2, 2] },
  marketing_leader: { family: "M", anchor: "L", base: [1, 0, 2, 2, 3, 2, 4, 4, 4, 3, 1, 3, 4, 4, 3, 2, 2, 2, 4, 4, 4, 4, 2, 1, 3, 3] },
};

/** The 12 HR and OD competencies were appended to the order (indices 26 to 37): the spec vectors above need no HR skill, so they are padded with zeros. */
for (const v of Object.values(PLANNED_VECTORS)) v.base = [...v.base, ...Array(12).fill(0)];

/** { id: level } -> computeGap `current` with evidence (a shipped artifact), so the self cap does not bind. */
export const evidenced = (levels, source = "shipped") =>
  Object.fromEntries(Object.entries(levels).map(([id, level]) => [id, { level, confidence: 0.6, source, evidence: ["fixture: from the spec's persona table"] }]));

/** The person's rubric.json levels on 2026-10-12 as the spec 3.8 example 1 reads them (rubric ids, not domain ids). */
export const DEV_RUBRIC = {
  product_thinking: { level: 2.5, confidence: 0.5, source: "ai", evidence: ["skills.json 2026-10-12"] },
  craft: { level: 2, confidence: 0.3, source: "self" },
  systems: { level: 2.5, confidence: 0.6, source: "shipped", evidence: ["skills.json 2026-10-12"] },
  research: { level: 1.5, confidence: 0.3, source: "self" },
  communication: { level: 1.5, confidence: 0.5, source: "ai", evidence: ["skills.json 2026-10-12"] },
  collaboration: { level: 2, confidence: 0.3, source: "self" },
  building: { level: 3, confidence: 0.7, source: "shipped", evidence: ["skills.json 2026-10-12"] },
  domain: { level: 3, confidence: 0.7, source: "shipped", evidence: ["skills.json 2026-10-12"] },
};

const CONTENT_MARKETER_M = {
  copywriting: 3, storytelling: 3, audience_insight: 2, positioning_messaging: 1.5, content_production: 3, channel_media: 2, data_analytics: 2,
  measurement_eval: 2, campaign_planning: 2, growth_performance: 1, user_research: 1, product_strategy: 1, cross_functional: 2,
  stakeholder_influence: 2, domain_context: 1, brand_strategy: 1, business_commercial: 1.5,
};
const PR_ASSOCIATE = {
  copywriting: 3, storytelling: 2.5, audience_insight: 2, positioning_messaging: 2, media_relations: 3, channel_media: 2.5, content_production: 2.5,
  measurement_eval: 1.5, campaign_planning: 2, crisis_reputation: 1.5, stakeholder_influence: 2, cross_functional: 2, business_commercial: 1,
  team_leadership: 0.5, data_analytics: 1, brand_strategy: 1, domain_context: 2, critique_judgement: 1.5,
};
const BRAND_DESIGNER_P2 = {
  visual_craft: 3.5, brand_identity: 3.5, copywriting: 2.5, storytelling: 2.5, audience_insight: 2, brand_strategy: 2, positioning_messaging: 1.5,
  critique_judgement: 3, stakeholder_influence: 2, team_leadership: 1, cross_functional: 2, campaign_planning: 1, business_commercial: 1, tooling_building: 2,
};
const DESIGNER_P5 = {
  visual_craft: 3, brand_identity: 3, storytelling: 2.5, user_research: 2, copywriting: 2, product_strategy: 2, stakeholder_influence: 2.5,
  cross_functional: 3, critique_judgement: 3,
};
const PR_P6 = { copywriting: 3.5, storytelling: 3, audience_insight: 2.5, stakeholder_influence: 2, content_production: 3, domain_context: 2, critique_judgement: 2 };

/** Spec 7.1. `spec` holds the spec's expected values; the frozen values live in domains-expected.json. */
// HR and organisation development personas (model estimates, frozen on 2026-10-21; levels are plausible self-reports with an artifact, not data about a real person)
const HR_GENERALIST_M = {
  hr_core_practice: 3, talent_learning: 2.5, employee_experience: 2, stakeholder_influence: 2, cross_functional: 2, data_analytics: 1.5,
  measurement_eval: 1.5, copywriting: 2, storytelling: 1.5, process_redesign: 1.5, hr_tech_data: 2, team_leadership: 1, business_commercial: 1.5,
  domain_context: 2.5, critique_judgement: 2, coaching_facilitation: 1.5, tooling_building: 2,
};
const HRBP_S = {
  hr_core_practice: 3, talent_learning: 3, employee_experience: 3, stakeholder_influence: 3.5, cross_functional: 3, data_analytics: 2.5,
  measurement_eval: 2, copywriting: 2.5, storytelling: 3, process_redesign: 2, hr_tech_data: 2, team_leadership: 2.5, business_commercial: 3,
  domain_context: 3, critique_judgement: 3, coaching_facilitation: 3, audience_insight: 3, change_management: 2, consulting_skills: 2.5,
  tooling_building: 2, people_analytics: 2, org_design: 1.5,
};
const RECRUITER_M = {
  talent_learning: 3.5, hr_tech_data: 3, data_analytics: 2, measurement_eval: 2, stakeholder_influence: 2.5, cross_functional: 2, copywriting: 2.5,
  storytelling: 2, audience_insight: 3, channel_media: 2, tooling_building: 3, domain_context: 3, critique_judgement: 2.5, hr_core_practice: 2,
  employee_experience: 1.5, process_redesign: 2, business_commercial: 1.5, team_leadership: 1,
};
const LD_M = {
  talent_learning: 3.5, coaching_facilitation: 3.5, copywriting: 3, storytelling: 3, audience_insight: 2.5, content_production: 3, measurement_eval: 2,
  data_analytics: 1.5, stakeholder_influence: 2, cross_functional: 2.5, critique_judgement: 3, hr_core_practice: 2, employee_experience: 2,
  change_management: 1.5, tooling_building: 2, domain_context: 2, business_commercial: 1.5, team_leadership: 1.5,
};
export { HR_GENERALIST_M, HRBP_S, RECRUITER_M, LD_M };

export const PERSONAS = [
  { id: "P1", name: "The person, product designer M to L (same role)", spec_example: "3.8 example 1", via_rubric_map: true,
    input: { fromRole: "product_designer", target: { role: "product_designer", level: "L" }, constraints: { proof: { portfolio_case_study: 0 } } },
    spec: { largest_gaps: ["interaction_craft", "storytelling", "user_research", "stakeholder_influence", "visual_craft"], blocker: "G-proof-portfolio_case_study", first5: ["TK-T03", "TK-P02", "TK-P01", "TK-P17", "TK-P04"] } },
  { id: "P2", name: "Brand designer M to creative director L", spec_example: "2.4 row 5", planned_role: "creative_director",
    input: { fromRole: "brand_designer", current: evidenced(BRAND_DESIGNER_P2), target: { role: "creative_director", level: "L" }, constraints: { proof: { led_campaign: 0 } } },
    spec: { largest_gaps: ["campaign_planning", "team_leadership", "business_commercial", "stakeholder_influence", "positioning_messaging"], blocker: "G-proof-led_campaign", first5: ["TK-P10", "TK-A02", "TK-P17", "TK-P18", "TK-P12"], distance: 26.4, evenings: 325 } },
  { id: "P3", name: "PR associate to corporate comms S (waypoint toward comms leader H)", spec_example: "3.8 example 3 waypoint", planned_role: "corporate_comms",
    input: { fromRole: "pr_specialist", current: evidenced(PR_ASSOCIATE), target: { role: "corporate_comms", level: "S" }, constraints: { proof: { earned_media_clippings: 0 } } },
    spec: { largest_gaps: ["crisis_reputation", "stakeholder_influence", "brand_strategy", "business_commercial", "storytelling"], blocker: "G-proof-earned_media_clippings", first5: ["TK-T05", "TK-P08", "TK-P09", "TK-A04", "TK-P17"], distance: 25.4, evenings: 315 } },
  { id: "P4", name: "Content marketer M to product marketer M", spec_example: "3.8 example 2",
    input: { fromRole: "content_marketer", current: evidenced(CONTENT_MARKETER_M), target: { role: "product_marketer", level: "M" }, constraints: { proof: { launch_with_results: 0 } } },
    spec: { largest_gaps: ["positioning_messaging", "audience_insight", "cross_functional", "user_research", "product_strategy"], blocker: "G-proof-launch_with_results", first5: ["TK-T06", "TK-T10", "TK-P12", "TK-B11", "TK-A06"], distance: 9.5, evenings: 145 } },
  { id: "P5", name: "Brand designer M to brand strategist M (same_industry false)", spec_example: "2.4 row 7", planned_role: "brand_strategist",
    input: { fromRole: "brand_designer", current: evidenced(DESIGNER_P5), target: { role: "brand_strategist", level: "M" }, sameIndustry: false, constraints: { proof: { brand_strategy_doc_with_outcome: 0 } } },
    spec: { largest_gaps: ["storytelling", "audience_insight", "positioning_messaging", "brand_strategy", "measurement_eval"], blocker: "G-proof-brand_strategy_doc_with_outcome", first5: ["TK-B04", "TK-T10", "TK-P12", "TK-B05", "TK-A06"], distance: 11.0, evenings: 130 } },
  { id: "P6", name: "PR specialist to UX writer M (same_industry true)", spec_example: "2.4 row 8", planned_role: "ux_writer",
    input: { fromRole: "pr_specialist", current: evidenced(PR_P6), target: { role: "ux_writer", level: "M" }, sameIndustry: true, constraints: { proof: { portfolio_case_study: 0 } } },
    spec: { largest_gaps: ["interaction_craft", "user_research", "systems_ia", "cross_functional", "critique_judgement"], blocker: "G-proof-portfolio_case_study", first5: ["TK-B10", "TK-T01", "TK-B07", "TK-P03", "TK-A03"], distance: 7.6, evenings: 136 } },
  // HR and organisation development: model-estimate personas, spec fields hold the first frozen run (no published spec numbers exist)
  { id: "H1", name: "Traditional HR generalist M to HR transformation consultant M (practice into consulting, cross-over blocker)", spec_example: "hr-od-domain-research.md", hr: true,
    input: { fromRole: "hr_generalist", current: evidenced(HR_GENERALIST_M), target: { role: "hr_transformation_consultant", level: "M" }, sameIndustry: true, constraints: { proof: { hr_consulting_deliverable: 0 } } },
    spec: { largest_gaps: ["process_redesign","stakeholder_influence","data_analytics","measurement_eval","team_leadership"], blocker: "G-proof-hr_consulting_deliverable", first5: ["TK-H46","TK-H17","TK-H29","TK-Q03","TK-H03"] } },
  { id: "H2", name: "HR business partner S to organisation development consultant M", spec_example: "hr-od-domain-research.md", hr: true,
    input: { fromRole: "hrbp", current: evidenced(HRBP_S), target: { role: "od_consultant", level: "M" }, sameIndustry: true, constraints: { proof: { hr_consulting_deliverable: 0 } } },
    spec: { largest_gaps: ["consulting_skills","org_design","change_management","user_research","measurement_eval"], blocker: "G-proof-hr_consulting_deliverable", first5: ["TK-H48","TK-H19","TK-H31","TK-H44","TK-H15"] } },
  { id: "H3", name: "Recruiter M to people analytics analyst M", spec_example: "hr-od-domain-research.md", hr: true,
    input: { fromRole: "talent_acquisition", current: evidenced(RECRUITER_M), target: { role: "people_analyst", level: "M" }, sameIndustry: true, constraints: { proof: { people_analytics_case: 0 } } },
    spec: { largest_gaps: ["data_analytics","measurement_eval","business_commercial","tooling_building","user_research"], blocker: "G-proof-people_analytics_case", first5: ["TK-H49","TK-Q03","TK-Q01","TK-H08","TK-H20"] } },
  { id: "H4", name: "HR generalist M to HR business partner S (same family, no cross-over)", spec_example: "hr-od-domain-research.md", hr: true,
    input: { fromRole: "hr_generalist", current: evidenced(HR_GENERALIST_M), target: { role: "hrbp", level: "S" }, sameIndustry: true, constraints: { proof: { hr_practice_outcome: 0 } } },
    spec: { largest_gaps: ["stakeholder_influence","team_leadership","storytelling","data_analytics","business_commercial"], blocker: "G-proof-hr_practice_outcome", first5: ["TK-H22","TK-P01","TK-A08","TK-P17","TK-Q03"] } },
  { id: "H5", name: "L&D specialist M to change management consultant M", spec_example: "hr-od-domain-research.md", hr: true,
    input: { fromRole: "ld_specialist", current: evidenced(LD_M), target: { role: "change_consultant", level: "M" }, sameIndustry: true, constraints: { proof: { change_plan_with_adoption: 0 } } },
    spec: { largest_gaps: ["change_management","stakeholder_influence","business_commercial","measurement_eval","campaign_planning"], blocker: "G-proof-change_plan_with_adoption", first5: ["TK-H42","TK-H13","TK-H25","TK-P17","TK-Q02"] } },
];

/** Spec 3.8: the three worked examples, plus the 2.4 rows that need only fixtures already defined above. */
export const WORKED = [
  { id: "W1", name: "The person PD M+ to product designer L", persona: "P1", spec: { distance: 19.6, evenings: 219 }, planned_role_used: false },
  { id: "W2", name: "Content marketer M to product marketer M", persona: "P4", spec: { distance: 9.5, evenings: 145 }, planned_role_used: false },
  { id: "W3", name: "PR associate to comms leader H", spec: { distance: 37.3, evenings: 435 }, planned_role_used: true,
    input: { fromRole: "pr_specialist", current: evidenced(PR_ASSOCIATE), target: { role: "comms_leader", level: "H" }, constraints: { proof: { led_team_outcome: 0, earned_media_clippings: 0 } } } },
  { id: "W3b", name: "PR associate waypoint, corporate comms S", persona: "P3", spec: { distance: 25.4, evenings: 315 }, planned_role_used: true },
];

/** Dual target (spec 3.6): designer wants lead product designer plus brand strategist M as optional. */
export const DUAL = {
  fromRole: "product_designer",
  targets: [{ role: "product_designer", level: "L", kind: "primary", weight: 1 }, { role: "brand_strategist", level: "M", kind: "optional", weight: 0.5 }],
};

export { PR_ASSOCIATE, CONTENT_MARKETER_M, BRAND_DESIGNER_P2, DESIGNER_P5, PR_P6 };
