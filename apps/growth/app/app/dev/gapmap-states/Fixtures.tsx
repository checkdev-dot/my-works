"use client";

import { GapMap } from "@/components/GapMap";
import { ReachView } from "@/components/App";
import { computeGap, type DomainLevel } from "@/lib/domains.mjs";
import { gapFromProfile, type DomainGap } from "@/lib/domain-flow.mjs";
import type { GrowthState } from "@/lib/types";

const noop = async () => false;

/** Test-only requirement vectors for two planned roles (spec 2.2). They are NOT shipped in the data file; they only let the dev page show a waypoint. */
const PLANNED = {
  corporate_comms: { family: "P" as const, anchor: "S" as DomainLevel, base: [1, 0, 1, 4, 4, 1, 3, 3, 3, 1, 1, 2, 3, 3, 3, 3, 3, 0, 4, 3, 2, 3, 4, 1, 3, 3] },
  comms_leader: { family: "P" as const, anchor: "L" as DomainLevel, base: [1, 0, 2, 3, 4, 1, 3, 4, 4, 2, 1, 3, 4, 3, 3, 3, 2, 0, 4, 4, 4, 4, 4, 1, 3, 3] },
};
const ev = (levels: Record<string, number>) => Object.fromEntries(Object.entries(levels).map(([id, level]) => [id, { level, confidence: 0.6, source: "shipped" as const, evidence: ["fixture"] }]));
const CONTENT_MARKETER_M = { copywriting: 3, storytelling: 3, audience_insight: 2, positioning_messaging: 1.5, content_production: 3, channel_media: 2, data_analytics: 2, measurement_eval: 2, campaign_planning: 2, growth_performance: 1, user_research: 1, product_strategy: 1, cross_functional: 2, stakeholder_influence: 2, domain_context: 1, brand_strategy: 1, business_commercial: 1.5 };
const PR_ASSOCIATE = { copywriting: 3, storytelling: 2.5, audience_insight: 2, positioning_messaging: 2, media_relations: 3, channel_media: 2.5, content_production: 2.5, measurement_eval: 1.5, campaign_planning: 2, crisis_reputation: 1.5, stakeholder_influence: 2, cross_functional: 2, business_commercial: 1, team_leadership: 0.5, data_analytics: 1, brand_strategy: 1, domain_context: 2, critique_judgement: 1.5 };

type Built = { id: string; label: string; s: GrowthState; gap: DomainGap | null; inPage: boolean };

function build(base: GrowthState, id: string): Built {
  const s: GrowthState = JSON.parse(JSON.stringify(base));
  if (id === "designer-to-lead") {
    s.profile.domain = { family_now: "D", role_now: "product_designer", level_now: "M", same_industry: false, targets: [{ role: "product_designer", level: "L", weight: 1, kind: "primary" }], evidence: { case_studies: 0 } };
    const gap = gapFromProfile({ profile: s.profile, skills: s.skills, rubric: s.rubric, hoursPerWeek: 5 });
    return { id, label: "Product designer, mid to lead (full Hiring page, the real path from profile.domain)", s, gap, inPage: true };
  }
  if (id === "marketer-to-pmm") {
    s.profile.domain = { family_now: "M", role_now: "content_marketer", level_now: "M", same_industry: true, targets: [{ role: "product_marketer", level: "M", weight: 1, kind: "primary" }, { role: "content_marketer", level: "S", weight: 0.5, kind: "optional" }], evidence: { best_result: null } };
    const result = computeGap({ fromRole: "content_marketer", sameIndustry: true, current: ev(CONTENT_MARKETER_M), targets: s.profile.domain.targets, constraints: { proof: { launch_with_results: 0 }, hoursPerWeek: 5 } });
    return { id, label: "Content marketer to product marketer, with a second target (shared base counted once)", s, gap: { ok: result.ok, status: result.status, result, targets: s.profile.domain.targets as DomainGap["targets"], fromRole: "content_marketer" }, inPage: false };
  }
  s.profile.domain = { family_now: "P", role_now: "pr_specialist", level_now: "J", same_industry: false, targets: [{ role: "comms_leader", level: "H", weight: 1, kind: "primary" }], evidence: { placements: 1 } };
  const result = computeGap({ fromRole: "pr_specialist", current: ev(PR_ASSOCIATE), target: { role: "comms_leader", level: "H" }, roles: PLANNED, constraints: { proof: { led_team_outcome: 0, earned_media_clippings: 0 }, hoursPerWeek: 5 } });
  return { id, label: "PR associate to communications leader: a long way, so a first stop is shown (test vectors for a planned role)", s, gap: { ok: result.ok, status: result.status, result, targets: [{ role: "comms_leader", level: "H" as DomainLevel, weight: 1, kind: "primary" }], fromRole: "pr_specialist" }, inPage: false };
}

function One({ id, base }: { id: string; base: GrowthState }) {
  const b = build(base, id);
  return (
    <section style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px" }} data-fixture={id}>
      <p style={{ font: "600 13px system-ui", opacity: 0.6 }}>Fixture: {b.label}</p>
      {b.inPage
        ? <ReachView s={b.s} act={noop as never} open={() => {}} go={() => {}} busy={false} />
        : <GapMap s={b.s} gap={b.gap} />}
    </section>
  );
}

export function Fixtures({ initial, only }: { initial: GrowthState; only?: string }) {
  const ids = ["designer-to-lead", "marketer-to-pmm", "pr-to-comms-leader"];
  return <>{(only ? [only] : ids).map((id) => <One key={id} id={id} base={initial} />)}</>;
}
