// The domain graph: 26 shared competencies, 13 roles (5 launch, 8 planned stubs), a transfer matrix, hard blockers and a
// 72-task library. Pure: no node built-ins, no side effects, same input gives the same output. The reference data is
// lib/domains.data.json (copy it to data/domains.json at integration). Spec: handoff-docs/specs/domain-graph-spec.md.
//
//   getRole(id, opts)                         the role record (planned roles have base: null)
//   roleVector(roleId, level, opts)           { competencyId: required level 0 to 4 } or null when the role has no vector
//   transfer(fromRole, toRole, comp, opts)    0 to 1, how much of a level in the from role counts toward the to role
//   mapRubricLevels(ratings, own)             the person's 8 rubric competencies -> the 26 domain ids
//   computeGap({ current, target | targets, fromRole, sameIndustry, constraints })
//   pickTasks(gapResult, hoursPerWeek, n)     dependency-ordered tasks, learn capped, placed into weeks
//
// Labels: every number here is `model` (an estimate from the spec) unless a market cell overrides it. Every output item
// carries `because` (ids it was derived from) and `status`: "model" (estimate on evidenced input), "unverified" (a
// self-rating, an unknown, a planned role or an AI rating drove it), "verified" (evidenced input and a market-sourced target).
// opts.roles: { roleId: { family?, anchor?, base: number[26], status? } } overrides a role, which is how tests supply
// vectors for planned roles without shipping them.
import DATA from "./domains.data.json" with { type: "json" };

export const DOMAINS = DATA;
export const COMPETENCY_ORDER = DATA.competency_order;
export const LAUNCH_ROLES = DATA.launch_roles;
export const TASKS = DATA.tasks;
const IDX = Object.fromEntries(COMPETENCY_ORDER.map((c, i) => [c, i]));
const LV = DATA.levels;
const D = DATA.distance;
const LEADERSHIP = new Set(DATA.leadership_class);
const ROLE_BY_ID = Object.fromEntries(DATA.roles.map((r) => [r.id, r]));
const TASK_BY_ID = Object.fromEntries(DATA.tasks.map((t) => [t.id, t]));
const r05 = (x) => Math.round(x * 2) / 2;
const r2 = (x) => Math.round(x * 100) / 100;
const clean = (x) => Math.round(x * 1e6) / 1e6;

export const taskById = (id) => TASK_BY_ID[id] || null;
export const listRoles = ({ launchOnly = false } = {}) => DATA.roles.filter((r) => !launchOnly || r.launch);

/** The role record. opts.roles overrides or supplies a vector for a planned role (tests only). */
export function getRole(id, opts = {}) {
  const base = ROLE_BY_ID[id];
  const over = opts && opts.roles && opts.roles[id];
  if (!base && !over) return null;
  return over ? { ...(base || { id, status: "planned", launch: false, anchor: "S" }), ...over, id } : base;
}

const isCoreAt = (role, i, c) => (Array.isArray(role.base) ? role.base[i] >= 3 : false) || LEADERSHIP.has(c);

/** Requirement vector of a role at a level via the shift rule (spec 2.2). Null when the role has no vector (planned). */
export function roleVector(roleId, level, opts = {}) {
  const role = getRole(roleId, opts);
  if (!role || !Array.isArray(role.base) || role.base.length !== COMPETENCY_ORDER.length) return null;
  if (!(level in LV) || !(role.anchor in LV)) return null;
  const delta = LV[level] - LV[role.anchor];
  const out = {};
  COMPETENCY_ORDER.forEach((c, i) => {
    const b = role.base[i];
    if (b === 0) { out[c] = 0; return; }
    const core = isCoreAt(role, i, c);
    let v = b;
    if (delta > 0) v = core ? b + 0.5 * delta : b;
    else if (delta < 0) v = b + (core ? 1.0 : 0.5) * delta;
    out[c] = Math.min(4, Math.max(0, r05(v)));
  });
  return out;
}

/** w(c, A -> B): same role 1.0, same family 0.9, cross family from the matrix; same industry raises domain_context. */
export function transfer(fromRole, toRole, competencyId, opts = {}) {
  if (!fromRole || fromRole === toRole) return 1.0;
  const a = getRole(fromRole, opts);
  const b = getRole(toRole, opts);
  if (!a || !b) return DATA.transfer.competencies[competencyId] ? DATA.transfer.competencies[competencyId].default : 0;
  if (a.family === b.family) return DATA.transfer.same_family;
  const t = DATA.transfer.competencies[competencyId];
  if (!t) return 0;
  let w = t.pair[`${a.family}>${b.family}`];
  if (w === undefined) w = t.pair[`${a.family}>*`];
  if (w === undefined) w = t.default;
  if (competencyId === "domain_context" && opts.sameIndustry) w = Math.max(w, t.same_industry ?? DATA.transfer.same_industry_domain_context);
  return w;
}

const evCount = (r) => (Array.isArray(r.evidence) ? r.evidence.length : r.evidence ? 1 : 0) + (r.tested ? 1 : 0);

/** Current level per competency (spec 3.2). `target` is the requirement used by the self cap. */
export function currentLevel(rating, target) {
  if (rating == null) return { known: false, level: null, confidence: null, evidenced: false, provisional: true, basis: "unknown" };
  const r = typeof rating === "number" ? { level: rating } : rating;
  if (typeof r.level !== "number" || Number.isNaN(r.level)) return { known: false, level: null, confidence: null, evidenced: false, provisional: true, basis: "unknown" };
  const ev = evCount(r);
  const src = r.source || (ev > 0 ? "shipped" : "self");
  const conf = typeof r.confidence === "number" ? r.confidence : 0.5;
  // an artifact or a test lifts the cap, even on a rating the person made themselves
  if (["market", "expert", "shipped", "self"].includes(src) && ev > 0) return { known: true, level: r.level, confidence: conf, evidenced: true, provisional: false, basis: src === "self" ? "self_evidenced" : src };
  if (src === "ai" && ev > 0) return { known: true, level: r.level, confidence: Math.min(conf, 0.6), evidenced: true, provisional: false, basis: "ai" };
  // self rating only: level may not shrink the gap below target - 1, confidence 0.3, until an artifact or test exists
  const cap = Math.max(0, target - 1);
  return { known: true, level: Math.min(r.level, cap), confidence: D.self_cap.confidence, evidenced: false, provisional: true, basis: "self", capped: r.level > cap };
}

/** Maps rubric.json ratings (8 competencies) to domain ids at level * factor. `own` ratings of a domain id win. */
export function mapRubricLevels(ratings, own = {}) {
  const out = {};
  for (const [rid, r0] of Object.entries(ratings || {})) {
    const maps = DATA.maps_to[rid];
    if (!Array.isArray(maps)) continue;
    const r = typeof r0 === "number" ? { level: r0 } : r0;
    if (!r || typeof r.level !== "number") continue;
    for (const m of maps) {
      const level = clean(r.level * m.factor);
      const cur = out[m.domain_id];
      if (!cur || level > cur.level) out[m.domain_id] = { ...r, level, mapped_from: [rid], factor: m.factor };
    }
  }
  return { ...out, ...(own || {}) };
}

function gapCore(targets, ctx) {
  const { current, fromRole, sameIndustry, opts } = ctx;
  const vecs = targets.map((t) => ({ t, vec: roleVector(t.role, t.level, opts), role: getRole(t.role, opts) }));
  const live = vecs.filter((v) => v.t.kind !== "bridge");
  // shared base (3.6): competencies where every live target needs >= 2 and the effective level is below the smallest
  const shared = new Set();
  if (live.length > 1) {
    for (const c of COMPETENCY_ORDER) {
      if (!live.every((v) => v.vec[c] >= 2)) continue;
      const mins = Math.min(...live.map((v) => v.vec[c]));
      const cur = currentLevel(current[c], mins);
      const w = Math.min(...live.map((v) => (fromRole ? transfer(fromRole, v.t.role, c, { ...opts, sameIndustry }) : 1)));
      const eff = cur.known ? cur.level * w : Math.max(0, mins - 1);
      if (eff < mins) shared.add(c);
    }
  }
  const rows = new Map();
  for (const { t, vec, role } of live) {
    const weight = typeof t.weight === "number" ? t.weight : t.kind === "optional" ? 0.5 : 1;
    for (const c of COMPETENCY_ORDER) {
      const T = vec[c];
      if (!(T > D.ignore_target_at_or_below)) continue;
      if (t.kind === "optional" && !t.sequential && !shared.has(c)) continue; // a second target that comes AFTER the first adds its own rows (critique 5, P1-3)
      const cur = currentLevel(current[c], T);
      const w = fromRole ? transfer(fromRole, t.role, c, { ...opts, sameIndustry }) : 1.0;
      const eff = cur.known ? cur.level * w : Math.max(0, T - D.unknown_gap);
      const gap = Math.max(0, T - eff) * weight;
      if (gap < D.open_gap_min) continue;
      const core = isCoreAt(role, IDX[c], c);
      const row = {
        competency: c, index: IDX[c], gap: clean(gap), target: T, current: cur.known ? clean(cur.level) : null,
        current_raw: cur.known && typeof (current[c] || {}).level === "number" ? current[c].level : cur.known ? cur.level : null,
        effective: clean(eff), transfer_w: w, core, importance: core ? D.importance_core : D.importance_support,
        provisional: cur.provisional, evidenced: cur.evidenced, known: cur.known, confidence: cur.confidence, basis: cur.basis,
        capped: !!cur.capped, roles: [t.role], shared: shared.has(c), carried: !!(cur.known && fromRole && w < 1),
        target_source: "model",
      };
      const prev = rows.get(c);
      if (!prev) rows.set(c, row);
      else {
        const win = row.gap > prev.gap ? row : prev;
        rows.set(c, { ...win, roles: [...new Set([...prev.roles, t.role])], target: Math.max(prev.target, row.target), importance: Math.max(prev.importance, row.importance), core: prev.core || row.core });
      }
    }
  }
  const list = [...rows.values()].map((r) => {
    const steps = Math.ceil(clean(r.gap / 0.5));
    const evenings = steps * (r.known ? D.evenings_per_half_level : D.evenings_per_half_level_unknown);
    const bonus = r.known && r.evidenced && r.transfer_w > 0.6 && r.transfer_w < 1;
    return { ...r, weighted: clean(r.gap * r.importance), evenings, evenings_adjusted: bonus ? Math.ceil(evenings * D.transfer_bonus.factor) : evenings };
  });
  const distance = list.reduce((s, r) => s + r.weighted, 0);
  const evenings = list.reduce((s, r) => s + r.evenings, 0);
  const evenings_adjusted = list.reduce((s, r) => s + r.evenings_adjusted, 0);
  return { rows: list, distance, evenings, evenings_adjusted, shared: [...shared], vecs };
}

function normKinds(pk) { return Array.isArray(pk) ? pk : pk ? [pk] : []; }

function blockersFor(targets, ctx) {
  const { fromRole, opts, constraints } = ctx;
  const proof = constraints.proof || {};
  const fromFam = fromRole ? (getRole(fromRole, opts) || {}).family : null;
  const open = [];
  const cleared = [];
  const seen = new Set();
  for (const t of targets) {
    if (t.kind === "optional") continue; // optional targets share work but add no gate (spec 3.6: bridge targets add the proof blocker only)
    const role = getRole(t.role, opts);
    if (!role) continue;
    const kinds = [...normKinds(role.proof_kind)];
    const leader = DATA.blockers.leader_roles.includes(role.id) || DATA.blockers.leader_levels.includes(t.level);
    if (leader && !kinds.includes("led_team_outcome")) kinds.push("led_team_outcome");
    for (const kind of kinds) {
      if (seen.has(kind)) continue;
      seen.add(kind);
      const pk = DATA.proof_kinds[kind];
      if (!pk) continue;
      const have = typeof proof[kind] === "number" ? proof[kind] : null;
      const ok = have !== null && have >= pk.min_count;
      const b = {
        id: `G-proof-${kind}`, kind, label: pk.label, needs: pk.min_count, have, cleared: ok, provisional: have === null,
        cleared_by: pk.cleared_by, clears_with: [...pk.clears_with], role: role.id,
        ...(typeof (constraints.claimed || {})[kind] === "number" && !ok ? { claimed: true, claimed_confidence: constraints.claimed[kind] } : {}),
        cross_over: !!(fromFam && fromFam !== role.family && pk.family !== "leader"),
        because: [`role:${role.id}`, `proof_kind:${kind}`, ...(fromFam && fromFam !== role.family ? ["rule:cross_over_does_not_carry_proof"] : [])],
        status: have === null ? "unverified" : "model",
      };
      (ok ? cleared : open).push(b);
    }
  }
  return { open, cleared };
}

function orderGaps(rows, blockers, constraints, ctx) {
  const blockComps = new Set();
  for (const b of blockers) for (const id of b.clears_with) { const t = TASK_BY_ID[id]; if (t) blockComps.add(t.competency); }
  const open = new Set(rows.map((r) => r.competency));
  const deps = Object.fromEntries(rows.map((r) => [r.competency, 0]));
  for (const r of rows) for (const p of DATA.prereqs[r.competency] || []) if (open.has(p)) deps[p] += 1;
  const tf = ctx.targetFamily;
  const hasTest = (c) => DATA.tasks.some((t) => t.kind === "test" && t.competency === c && (t.family === "X" || t.family === tf));
  const prio = {};
  for (const r of rows) {
    prio[r.competency] = clean(r.weighted + (blockComps.has(r.competency) ? 1 : 0) + 0.5 * deps[r.competency] - (r.provisional && hasTest(r.competency) ? 0.5 : 0));
  }
  const waits = (r) => (DATA.prereqs[r.competency] || []).filter((p) => {
    const pr = rows.find((x) => x.competency === p);
    return pr && (pr.current === null || pr.effective < DATA.prereq_min_level);
  });
  const done = new Set();
  const out = [];
  const left = [...rows];
  while (left.length) {
    const ready = left.filter((r) => waits(r).every((p) => done.has(p)));
    const pool = ready.length ? ready : left; // a cycle cannot occur in the shipped graph; never loop forever
    pool.sort((a, b) => prio[b.competency] - prio[a.competency] || a.index - b.index);
    const nx = pool[0];
    left.splice(left.indexOf(nx), 1);
    done.add(nx.competency);
    out.push({ ...nx, priority: prio[nx.competency], blocks_applying: blockComps.has(nx.competency), dependents_open: deps[nx.competency], waits_for: waits(nx) });
  }
  return out;
}

function statusOf(row) {
  if (row.basis === "unknown" || row.basis === "self" || row.basis === "ai") return "unverified";
  return row.target_source === "market" && row.basis === "market" ? "verified" : "model";
}

function planTasks(gaps, blockers, ctx) {
  const { targetFamily: tf, fromFamily, constraints, fromRoleDifferent } = ctx;
  const excluded = new Set([...(constraints.exclude || []), ...(constraints.completed || [])]);
  const holes = new Set(constraints.holes || []);
  const seen = new Set();
  const out = [];
  const famOk = (t) => t.family === "X" || t.family === tf;
  const push = (t, g, because, extra = {}) => {
    if (!t || seen.has(t.id) || excluded.has(t.id)) return;
    seen.add(t.id);
    out.push({
      id: t.id, kind: t.kind, family: t.family, competency: t.competency, gap_ref: g ? `G-${g.competency}` : null, minutes: t.minutes,
      verb: t.verb, output: t.output, task: t.task, min_evidence: t.min_evidence, ...(t.source_type ? { source_type: t.source_type } : {}),
      sources: t.sources || [], because, status: g ? statusOf(g) : "model", ...extra,
    });
  };
  const inLevel = (t, g) => !t.level || (Math.ceil(g.target) >= t.level[0] && !(g.current !== null && g.current >= t.level[1]));
  for (const g of gaps) {
    const c = g.competency;
    const mine = DATA.tasks.filter((t) => t.competency === c || (t.also || []).includes(c));
    const why = [`gap:${c}`, `target:${g.target}`, ...(g.provisional ? ["provisional"] : []), ...g.roles.map((r) => `role:${r}`)];
    if (!g.evidenced) {
      const test = mine.filter((t) => t.kind === "test" && famOk(t)).sort((a, b) => a.id.localeCompare(b.id))[0];
      push(test, g, [...why, "step:test_first"]);
    }
    if (fromFamily && fromFamily !== undefined) {
      const crossFam = fromFamily !== tf;
      for (const t of mine.filter((x) => x.kind === "bridge").sort((a, b) => a.id.localeCompare(b.id))) {
        const toOk = t.to === "X" || t.to === tf;
        const fromOk = t.from === "X" || t.from === fromFamily;
        const sameFamBridge = t.from === t.to && t.from !== "X";
        if (!toOk || !fromOk) continue;
        if (crossFam ? t.from === t.to && t.from !== "X" : !(sameFamBridge && fromRoleDifferent)) continue;
        push(t, g, [...why, `bridge:${t.from}>${t.to}`, "step:bridge"], { reps: 1 });
      }
    }
    let proofs = mine.filter((t) => t.kind === "proof" && famOk(t) && inLevel(t, g));
    let fallback = false;
    if (!proofs.length) { proofs = mine.filter((t) => t.kind === "proof" && inLevel(t, g)); fallback = proofs.length > 0; }
    proofs.sort((a, b) => (a.family === tf ? 0 : 1) - (b.family === tf ? 0 : 1) || a.id.localeCompare(b.id));
    push(proofs[0], g, [...why, "step:proof", ...(fallback ? ["rule:cross_family_fallback"] : [])], { reps: 2, practice: "2 to 3 repetitions with feedback from a named person (S4)" });
    const ask = mine.filter((t) => t.kind === "ask" && famOk(t)).sort((a, b) => (a.family === tf ? 0 : 1) - (b.family === tf ? 0 : 1) || a.id.localeCompare(b.id))[0];
    push(ask, g, [...why, "step:feedback_person"]);
    const learn = mine.filter((t) => t.kind === "learn" && famOk(t)).sort((a, b) => (a.family === tf ? 0 : 1) - (b.family === tf ? 0 : 1) || a.id.localeCompare(b.id))[0];
    // spec 3.5: a learn task only when a test showed a knowledge hole (constraints.holes), never in make-only mode (demand D-learn)
    if (learn && holes.has(c) && constraints.learningMode !== "make_only") push(learn, g, [...why, "step:learn_after_test_hole", `hole:${c}`]);
  }
  // blockers (spec 3.4). A proof of one kind does not clear a blocker of another kind: for a cross-over blocker the first
  // eligible bridge (from > to) creates the first proof of the new kind and the native proof follows it.
  const leadIds = [];
  const tag = (t, b, why) => {
    let item = out.find((x) => x.id === t.id);
    if (!item) {
      const g = gaps.find((x) => x.competency === t.competency) || null;
      item = { id: t.id, kind: t.kind, family: t.family, competency: t.competency, gap_ref: g ? `G-${g.competency}` : null, minutes: t.minutes, verb: t.verb, output: t.output, task: t.task, min_evidence: t.min_evidence, sources: t.sources || [], because: [], status: "model" };
      out.push(item);
      seen.add(t.id);
    }
    item.clears_blocker = item.clears_blocker || b.id;
    item.because = [...item.because, `blocker:${b.id}`, ...why];
    return item;
  };
  for (const b of blockers) {
    const native = b.clears_with.map((id) => TASK_BY_ID[id]).filter((t) => t && !excluded.has(t.id))[0];
    if (b.cross_over && fromFamily) {
      const rank = (c) => { const i = gaps.findIndex((x) => x.competency === c); return i < 0 ? 999 : i; };
      const bridge = DATA.tasks
        .filter((t) => t.kind === "bridge" && !excluded.has(t.id) && (t.from === fromFamily || t.from === "X") && (t.to === tf || t.to === "X") && t.from !== t.to)
        .sort((x, y) => rank(x.competency) - rank(y.competency) || x.id.localeCompare(y.id))[0];
      if (bridge) {
        const bi = tag(bridge, b, ["rule:cross_over_bridge_first"]);
        if (native) {
          const ni = tag(native, b, ["step:native_proof_after_bridge"]);
          const a = out.indexOf(ni);
          const z = out.indexOf(bi);
          if (a < z) { out.splice(a, 1); out.splice(out.indexOf(bi) + 1, 0, ni); }
        }
        leadIds.push(bridge.id);
        continue;
      }
    }
    if (native) { tag(native, b, []); leadIds.push(native.id); }
  }
  // a plan opens with a test or with the first blocker's proof, never with an unrelated practice task
  if (out.length && leadIds.length && out[0].kind !== "test" && out[0].id !== leadIds[0]) {
    const i = out.findIndex((x) => x.id === leadIds[0]);
    if (i > 0) out.unshift(...out.splice(i, 1));
  }
  return out.map((t, i) => ({ ...t, order: i + 1 }));
}

/**
 * computeGap: the A -> B gap (spec section 3).
 *  current      { competencyId: { level, confidence?, source?, evidence? } }  (source: market | expert | shipped | ai | self)
 *  target       { role, level }   or  targets [{ role, level, weight?, kind: primary | optional | bridge }]
 *  fromRole     the role the person works in now (cross-role transfer weights); omit for "same role" (w 1.0)
 *  sameIndustry raises domain_context carry-over to 0.9
 *  constraints  { proof: { proofKind: count }, roles: <vector override>, exclude: [taskId], completed: [taskId], hoursPerWeek, threshold }
 * Returns { ok, status, distance, byCompetency[], blockers[], waypoints[], orderedTasks[], evenings, basis, ... }.
 */
export function computeGap(input) {
  const inp = input || {};
  const constraints = inp.constraints || {};
  const opts = { roles: inp.roles || constraints.roles, sameIndustry: !!inp.sameIndustry };
  const current = inp.current || {};
  const fromRole = inp.fromRole || constraints.fromRole || null;
  const targets = (inp.targets || (inp.target ? [{ ...inp.target, kind: "primary", weight: 1 }] : [])).map((t) => ({ kind: "primary", weight: 1, ...t }));
  const basisBase = {
    spec: "domain-graph-spec v1", vectors: "model", transfer: "model", self_cap: "level <= target - 1 and confidence 0.3 until an artifact or test exists (The person to confirm)",
    unknown_rule: "unknown counts 1.0, provisional", importance: "1.0 core (base >= 3 or leadership class), 0.6 support", evenings: "ceil(gap / 0.5) * 5 (7 when unknown)",
  };
  const fail = (status, error) => ({ ok: false, status, error, distance: null, byCompetency: [], blockers: [], waypoints: [], orderedTasks: [], evenings: null, sharedBase: [], basis: basisBase });
  if (!targets.length) return fail("no_target", "no target role");
  for (const t of targets) {
    const role = getRole(t.role, opts);
    if (!role) return fail("unknown_role", `unknown role ${t.role}`);
    if (!(t.level in LV)) return fail("unknown_level", `unknown level ${t.level}`);
    if (t.kind !== "bridge" && !roleVector(t.role, t.level, opts)) return fail("planned", `role ${t.role} is planned: no requirement vector is shipped yet`);
    if (t.kind !== "bridge" && role.ladder && !role.ladder[t.level]) return fail("no_ladder_step", `role ${t.role} has no ${t.level} step on its ladder`);
  }
  const live = targets.filter((t) => t.kind !== "bridge");
  const primary = live[0] || targets[0];
  const prole = getRole(primary.role, opts);
  const ctx = { current, fromRole, sameIndustry: !!inp.sameIndustry, opts, constraints };
  const core = gapCore(targets, ctx);
  const bl = blockersFor(targets, ctx);
  const fromFamily = fromRole ? (getRole(fromRole, opts) || {}).family : undefined;
  const ordered = orderGaps(core.rows, bl.open, constraints, { targetFamily: prole.family });
  const byCompetency = ordered.map((r) => ({
    ...r, status: statusOf(r),
    because: [`role:${r.roles.join("+")}`, `requirement:${r.target}`, `transfer:${r.transfer_w}`, `basis:${r.basis}`, ...(r.capped ? ["rule:self_cap"] : []), ...(r.provisional ? ["provisional"] : []), ...(r.shared ? ["shared_base"] : []), ...r.waits_for.map((p) => `prereq:${p}`)],
    gap: r2(r.gap), weighted: r2(r.weighted), priority: r2(r.priority),
  }));
  const orderedTasks = planTasks(ordered, bl.open, { targetFamily: prole.family, fromFamily, constraints, fromRoleDifferent: !!fromRole && fromRole !== primary.role });
  const distance = r2(core.distance);
  const threshold = typeof constraints.threshold === "number" ? constraints.threshold : DATA.waypoints.threshold;
  const waypoints = [];
  if (core.distance > threshold && !constraints.noWaypoints && live.length === 1) {
    const cands = DATA.waypoints.candidates[primary.role] || [];
    for (const cnd of cands) {
      if (cnd.role === primary.role && LV[cnd.level] >= LV[primary.level]) continue;
      if (!roleVector(cnd.role, cnd.level, opts)) continue;
      const sub = gapCore([{ role: cnd.role, level: cnd.level, kind: "primary", weight: 1 }], ctx);
      if (sub.distance < threshold && sub.distance < core.distance) {
        const subOrdered = orderGaps(sub.rows, [], constraints, { targetFamily: (getRole(cnd.role, opts) || {}).family });
        waypoints.push({
          role: cnd.role, level: cnd.level, distance: r2(sub.distance), evenings: sub.evenings,
          first_hop: subOrdered.slice(0, 3).map((r) => r.competency),
          warn: "multi-year, not a single plan",
          because: [`distance:${r2(core.distance)}>threshold:${threshold}`, `candidate_of:${primary.role}`], status: "model",
        });
        break;
      }
    }
  }
  const basis = {
    ...basisBase, planned_role_used: targets.some((t) => (getRole(t.role, {}) || {}).status === "planned" && roleVector(t.role, t.level, opts)),
    waypoint_threshold: threshold, threshold_label: DATA.waypoints.threshold_label, from_role: fromRole, same_industry: !!inp.sameIndustry,
    evenings_adjusted: core.evenings_adjusted, evenings_adjusted_rule: `${D.transfer_bonus.factor} when ${D.transfer_bonus.when} (model, not part of the headline number)`,
  };
  return {
    ok: true, status: "ok", distance, distance_raw: core.distance, evenings: core.evenings, byCompetency,
    blockers: bl.open, clearedBlockers: bl.cleared, waypoints, orderedTasks, sharedBase: core.shared,
    targets: targets.map((t) => ({ role: t.role, level: t.level, kind: t.kind, weight: t.weight })),
    ...(waypoints.length ? { warning: "multi-year, not a single plan" } : {}), basis,
  };
}

/** Distance between two role+level points, using the from vector as evidenced current levels (graph and connectivity checks). */
export function roleDistance(from, to, opts = {}) {
  const vec = roleVector(from.role, from.level, opts);
  if (!vec) return null;
  const current = {};
  for (const c of COMPETENCY_ORDER) if (vec[c] > 0) current[c] = { level: vec[c], confidence: 0.7, source: "shipped", evidence: ["role vector"] };
  return computeGap({ current, fromRole: from.role, target: to, sameIndustry: !!opts.sameIndustry, roles: opts.roles, constraints: { noWaypoints: true } });
}

/** Picks n tasks: dependency order kept, learn capped at one per three practice tasks, placed into weeks by minutes. */
export function pickTasks(gapResult, hoursPerWeek = 5, n = 5) {
  if (!gapResult || !gapResult.ok) return [];
  const budget = Math.max(15, Math.round((Number(hoursPerWeek) || 5) * 60));
  const queue = gapResult.orderedTasks.slice();
  const picked = [];
  let learn = 0;
  let nonLearn = 0;
  let cum = 0;
  let guard = 0;
  while (picked.length < n && queue.length && guard++ < 1000) {
    let i = queue.findIndex((t) => t.kind !== "learn" || nonLearn >= 3 * (learn + 1));
    if (i < 0) break;
    const t = queue.splice(i, 1)[0];
    if (t.kind === "learn") learn += 1; else nonLearn += 1;
    const week = Math.floor(cum / budget) + 1;
    cum += t.minutes;
    picked.push({ ...t, week });
  }
  return picked;
}
