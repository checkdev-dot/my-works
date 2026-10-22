// Checks the domain graph: data integrity, the 5 launch roles, the question bank lint, the six validation personas and the
// worked examples (spec section 7 and 3.8). No network, no LLM, writes nothing. Exit 1 on any FAIL.
// Run: node scripts/domains-check.mjs            all checks
//      node scripts/domains-check.mjs --print     print the computed numbers as JSON (how domains-expected.json was frozen)
//      node scripts/domains-check.mjs --table     print the spec vs computed table
// Frozen numbers: scripts/domains-expected.json ("frozen from first run"). A frozen mismatch is a FAIL (the implementation
// changed). A spec mismatch is a WARN, printed with the delta (the spec's own numbers are `model` estimates).
import { readFileSync, existsSync } from "fs";
import path from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import {
  DOMAINS, COMPETENCY_ORDER, LAUNCH_ROLES, TASKS, getRole, roleVector, transfer, computeGap, pickTasks, mapRubricLevels, roleDistance, currentLevel,
} from "../lib/domains.mjs";
import { lintDomainBank, DOMAIN_BANK, R2_TEMPLATES, DOMAIN_MODEL_PATHS_NEW } from "../lib/domain-bank.mjs";
import { BANK, lintText } from "../lib/onboarding-bank.mjs";
import { PERSONAS, PLANNED_VECTORS, WORKED, DEV_RUBRIC, DUAL, evidenced, PR_ASSOCIATE } from "./domains-fixtures.mjs";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const NEW_HR = ["change_management", "od_diagnosis", "org_design", "hr_operating_model", "process_redesign", "hr_tech_data", "consulting_skills", "people_analytics", "employee_experience", "hr_core_practice", "talent_learning", "coaching_facilitation"];
const fails = [];
const warns = [];
const notes = [];
const fail = (m) => fails.push(m);
const warn = (m) => warns.push(m);
const ok = (c, m) => { if (!c) fail(m); };
const r2 = (x) => Math.round(x * 100) / 100;

// ---- 1. the data file parses and has the right shape --------------------------------------------------------------
const rawPath = path.join(APP, "lib", "domains.data.json");
let data;
let raw = "";
try { raw = readFileSync(rawPath, "utf8"); data = JSON.parse(raw); } catch (e) { fail(`data file does not parse: ${e.message}`); }
if (data) {
  ok(!/[–—]/.test(raw), "domains.data.json has an em or en dash");
  ok(!/[$€£₹]\s?\d/.test(raw), "domains.data.json has a currency amount (no compensation numbers are allowed)");
  ok(data.competencies.length === 38, `expected 38 competencies (26 design, PR and marketing plus 12 HR and OD), found ${data.competencies.length}`);
  ok(data.competency_order.length === 38 && data.competency_order.every((c, i) => data.competencies[i].id === c && data.competencies[i].index === i), "competency_order and competencies disagree");
  ok(data.roles.length === 23, `expected 23 roles (13 design, PR and marketing plus 10 HR and OD), found ${data.roles.length}`);
  const launch = data.roles.filter((r) => r.status === "launch");
  ok(launch.length === 15 && launch.every((r) => r.launch) && JSON.stringify(launch.map((r) => r.id).sort()) === JSON.stringify([...data.launch_roles].sort()), "launch flags and launch_roles disagree");
  const fams = new Set();
  for (const r of data.roles) {
    fams.add(r.family);
    if (r.status === "launch") {
      ok(Array.isArray(r.base) && r.base.length === 38, `${r.id}: base needs 38 numbers`);
      ok((r.base || []).every((v) => typeof v === "number" && v >= 0 && v <= 4), `${r.id}: a base value is outside 0 to 4`);
      for (const l of ["J", "M", "S", "L"]) ok(r.ladder && r.ladder[l] && r.ladder[l].title && r.ladder[l].scope, `${r.id}: ladder ${l} is missing`);
      ok(r.source && r.source.label, `${r.id}: no source label`);
    } else {
      ok(r.status === "planned" && r.base === null && !r.launch, `${r.id}: a planned role must be a stub with no vector`);
    }
    ok(r.ladder && ["J", "M", "S", "L", "H"].every((l) => l in r.ladder), `${r.id}: ladder needs the keys J M S L H`);
  }
  ok(fams.size === 5, "roles must span the five families (D, P, M, H, O)");
  // transfer matrix
  const tc = data.transfer.competencies;
  for (const c of data.competency_order) {
    const t = tc[c];
    if (!t) { fail(`transfer: ${c} missing`); continue; }
    ok(t.default >= 0 && t.default <= 1, `transfer: ${c} default outside 0 to 1`);
    for (const [k, v] of Object.entries(t.pair)) {
      ok(/^[DPMHO]>[DPMHO*]$/.test(k), `transfer: ${c} pair key ${k}`);
      ok(v >= 0 && v <= 1, `transfer: ${c} pair ${k} outside 0 to 1`);
    }
    if (t.same_industry !== undefined) ok(t.same_industry >= 0 && t.same_industry <= 1, `transfer: ${c} same_industry outside 0 to 1`);
  }
  ok(data.transfer.same_family === 0.9 && data.transfer.same_role === 1.0, "transfer: same_family 0.9 and same_role 1.0 expected");
  // prereqs: known ids and acyclic
  const ids = new Set(data.competency_order);
  for (const [c, ps] of Object.entries(data.prereqs)) { ok(ids.has(c), `prereq: unknown ${c}`); for (const p of ps) ok(ids.has(p), `prereq: ${c} needs unknown ${p}`); }
  {
    const state = {};
    const visit = (c, stack = []) => {
      if (state[c] === 2) return;
      if (state[c] === 1) { fail(`prereq cycle: ${[...stack, c].join(" -> ")}`); return; }
      state[c] = 1;
      for (const p of data.prereqs[c] || []) visit(p, [...stack, c]);
      state[c] = 2;
    };
    for (const c of Object.keys(data.prereqs)) visit(c);
  }
  // family tags are derived from the spec vectors (launch roles in the file, planned roles from the fixtures)
  {
    const vecs = [...data.roles.filter((r) => r.base).map((r) => ({ f: r.family, b: r.base })), ...Object.values(PLANNED_VECTORS).map((r) => ({ f: r.family, b: r.base }))];
    for (const c of data.competencies) {
      const derived = [...new Set(vecs.filter((v) => v.b[c.index] >= 3).map((v) => v.f))].sort();
      ok(JSON.stringify(derived) === JSON.stringify([...c.families].sort()), `${c.id}: family tags ${c.families} differ from the vectors (${derived})`);
    }
    for (const [id, p] of Object.entries(PLANNED_VECTORS)) {
      const stub = data.roles.find((r) => r.id === id);
      ok(stub && stub.status === "planned" && stub.family === p.family && stub.anchor === p.anchor, `fixtures: ${id} does not match its planned stub`);
      ok(p.base.length === 38 && p.base.every((v) => v >= 0 && v <= 4), `fixtures: ${id} vector is not 38 values in 0 to 4`);
    }
  }
  // task library
  const kinds = { proof: 0, test: 0, learn: 0, ask: 0, bridge: 0 };
  const tid = new Set();
  const srcIds = new Set(data.sources.map((s) => s.id));
  for (const t of data.tasks) {
    ok(!tid.has(t.id), `task ${t.id}: duplicate id`);
    tid.add(t.id);
    ok(t.kind in kinds, `task ${t.id}: kind ${t.kind}`);
    if (t.kind in kinds) kinds[t.kind] += 1;
    ok(ids.has(t.competency), `task ${t.id}: unknown competency ${t.competency}`);
    for (const a of t.also || []) ok(ids.has(a), `task ${t.id}: unknown also ${a}`);
    ok(["D", "P", "M", "X", "H", "O"].includes(t.family), `task ${t.id}: family`);
    ok(typeof t.minutes === "number" && t.minutes >= 15 && t.minutes <= 60, `task ${t.id}: minutes ${t.minutes} outside 15 to 60`);
    ok(t.verb && t.output && t.task && t.min_evidence, `task ${t.id}: needs verb, output, task and min_evidence`);
    ok(!/[–—]/.test(JSON.stringify(t)), `task ${t.id}: dash`);
    if (t.kind === "learn") ok(["B", "C", "TD", "CG", "F"].includes(t.source_type), `task ${t.id}: learn task needs a source type`);
    if (t.kind === "bridge") ok(t.from && t.to, `task ${t.id}: bridge needs from and to`);
    if (t.kind === "proof") ok(Array.isArray(t.level) && t.level.length === 2, `task ${t.id}: proof task needs a level range`);
    for (const s of t.sources || []) ok(srcIds.has(s), `task ${t.id}: unknown source ${s}`);
  }
  ok(data.tasks.length === 128, `expected 128 tasks (72 design, PR and marketing plus 56 HR and OD), found ${data.tasks.length}`);
  ok(kinds.proof === 37 && kinds.test === 24 && kinds.learn === 20 && kinds.ask === 21 && kinds.bridge === 26, `task kinds ${JSON.stringify(kinds)}`);
  // the original 72 tasks are unchanged: same ids, same kind split; no HR task is family X and no HR bridge is from or to X
  {
    const orig = data.tasks.slice(0, 72);
    ok(orig.every((t) => /^TK-[PTLAB]\d\d$/.test(t.id) && ["D", "P", "M", "X"].includes(t.family)), "the first 72 tasks are no longer the original design, PR and marketing tasks");
    const k72 = orig.reduce((m, t) => ({ ...m, [t.kind]: (m[t.kind] || 0) + 1 }), {});
    ok(JSON.stringify(k72) === JSON.stringify({ proof: 20, test: 12, learn: 14, ask: 10, bridge: 16 }), `the original 72 tasks changed their kind split ${JSON.stringify(k72)}`);
    const hr = data.tasks.slice(72);
    ok(hr.every((t) => /^TK-[HQ]\d\d$/.test(t.id) && ["H", "O"].includes(t.family)), "an HR task has a wrong id or a family other than H or O (never X: it would reach the design, PR and marketing personas)");
    ok(hr.filter((t) => t.kind === "bridge").every((t) => t.from === "H" && t.to === "O"), "an HR bridge must run from H to O");
    ok(hr.filter((t) => t.id.startsWith("TK-H")).every((t) => NEW_HR.includes(t.competency)), "a TK-H task is keyed to a competency outside the 12 new ones (it could reach the original personas)");
    // TK-Q tasks are HR proofs on competencies the original tasks cover: the proof fallback sorts by id, so every TK-Q id must sort after every original proof id (TK-P)
    const maxOrig = orig.filter((t) => t.kind === "proof").map((t) => t.id).sort().pop();
    ok(hr.filter((t) => t.id.startsWith("TK-Q")).every((t) => t.kind === "proof" && t.family === "O" && t.id > maxOrig), "a TK-Q task must be an O family proof whose id sorts after every original id");
  }
  for (const [k, pk] of Object.entries(data.proof_kinds)) for (const t of pk.clears_with) ok(tid.has(t), `proof kind ${k}: clears_with ${t} is not a task`);
  for (const r of data.roles) for (const k of Array.isArray(r.proof_kind) ? r.proof_kind : [r.proof_kind]) ok(data.proof_kinds[k], `${r.id}: proof kind ${k} is not defined`);
  notes.push(`tasks by kind ${JSON.stringify(kinds)}`);
}

// ---- 2. the launch roles are connected -----------------------------------------------------------------------------
const connect = [];
{
  const th = DOMAINS.waypoints.threshold;
  const nodes = LAUNCH_ROLES;
  const edge = {};
  // two clusters: design, PR and marketing (D, P, M) and HR (H, O). A design role and an HR role are not a single-hop move in this model, so reachability is asked inside each cluster.
  const cluster = (r) => (["H", "O"].includes(getRole(r).family) ? "hr" : "dpm");
  for (const a of nodes) for (const b of nodes) {
    if (a === b || cluster(a) !== cluster(b)) continue;
    const g = roleDistance({ role: a, level: "M" }, { role: b, level: "M" });
    if (!g || !g.ok || !Number.isFinite(g.distance)) { fail(`connectivity: ${a} M to ${b} M has no finite distance`); continue; }
    connect.push({ from: a, to: b, distance: g.distance });
    if (g.distance <= th) (edge[a] ||= new Set()).add(b);
  }
  // every ordered pair reachable through edges within the waypoint threshold
  for (const a of nodes) {
    const seen = new Set([a]);
    const q = [a];
    while (q.length) { const x = q.shift(); for (const y of edge[x] || []) if (!seen.has(y)) { seen.add(y); q.push(y); } }
    for (const b of nodes) if (cluster(a) === cluster(b) && !seen.has(b)) fail(`connectivity: no path from ${a} to ${b} within distance ${th} per hop`);
  }
  const byFamily = new Set(LAUNCH_ROLES.map((r) => getRole(r).family));
  ok(byFamily.size === 5, "launch roles must cover D, P, M, H and O");
  notes.push(`connectivity: ${connect.length} ordered pairs inside the two clusters (design, PR and marketing; HR and OD), max direct distance ${Math.max(...connect.map((c) => c.distance))}, all pairs reachable within ${th} per hop`);
}

// ---- 3. the question bank lint --------------------------------------------------------------------------------------
const lint = lintDomainBank();
for (const m of lint.fails) fail(`domain-bank: ${m}`);
{
  ok(lint.counts.total === 52, `domain bank count ${lint.counts.total}`);
  // the linter itself must reject bad wording
  ok(lintText("Which tool do you use and how often?").length > 0, "lint does not reject a double barrel");
  ok(lintText("Why did you just stop — really?").length > 0, "lint does not reject a dash or a minimiser");
  const bankIds = new Set(BANK.map((q) => q.id));
  ok(DOMAIN_BANK.every((q) => !bankIds.has(q.id)), "a DM id collides with an onboarding id");
  ok(DOMAIN_BANK.every((q) => q.writes.every((w) => w.startsWith("profile.") || w.startsWith("evidence.") || w.startsWith("proof.") || w.startsWith("skills.") || w.startsWith("onboarding.") || w.startsWith("demands."))), "a DM question writes outside the known namespaces");
}

// ---- 4. personas -----------------------------------------------------------------------------------------------------
const hash = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 12);
function run(p, overrides = {}) {
  const input = { ...p.input, roles: PLANNED_VECTORS, ...overrides };
  if (p.via_rubric_map) input.current = mapRubricLevels(DEV_RUBRIC);
  return computeGap(input);
}
const top5 = (g) => [...g.byCompetency].sort((a, b) => b.gap - a.gap || a.index - b.index).slice(0, 5).map((r) => r.competency);
const frozenPath = path.join(APP, "scripts", "domains-expected.json");
const results = {};
for (const p of PERSONAS) {
  const g = run(p);
  if (!g.ok) { fail(`${p.id}: computeGap failed: ${g.error}`); continue; }
  const picks = pickTasks(g, 5, 5);
  results[p.id] = {
    name: p.name, distance: g.distance, evenings: g.evenings, n_gaps: g.byCompetency.length, largest5: top5(g),
    blockers: g.blockers.map((b) => b.id), first5: picks.map((t) => t.id), waypoint: g.waypoints[0] ? { role: g.waypoints[0].role, level: g.waypoints[0].level, distance: g.waypoints[0].distance, evenings: g.waypoints[0].evenings } : null,
    planned_role_used: !!p.planned_role,
  };
}
const w3 = WORKED.find((w) => w.id === "W3");
{
  const g = computeGap({ ...w3.input, roles: PLANNED_VECTORS });
  if (g.ok) results.W3 = { name: w3.name, distance: g.distance, evenings: g.evenings, n_gaps: g.byCompetency.length, largest5: top5(g), blockers: g.blockers.map((b) => b.id), waypoint: g.waypoints[0] ? { role: g.waypoints[0].role, level: g.waypoints[0].level, distance: g.waypoints[0].distance, evenings: g.waypoints[0].evenings, first_hop: g.waypoints[0].first_hop } : null, planned_role_used: true };
  else fail(`W3: ${g.error}`);
}
if (argv.includes("--print")) { console.log(JSON.stringify(results, null, 2)); process.exit(0); }

const frozen = existsSync(frozenPath) ? JSON.parse(readFileSync(frozenPath, "utf8")) : null;
if (!frozen) fail("scripts/domains-expected.json is missing (frozen from first run)");

const owned = (g, p) => g.byCompetency.map((r) => r.competency);
for (const p of PERSONAS) {
  const g = run(p);
  if (!g.ok) continue;
  const res = results[p.id];
  const exp = frozen && frozen.personas && frozen.personas[p.id];
  // spec 7.1 assertions
  ok(g.blockers.some((b) => b.id === p.spec.blocker), `${p.id}: blocker ${p.spec.blocker} is not raised (got ${g.blockers.map((b) => b.id)})`);
  const first = g.orderedTasks[0];
  ok(first && (first.kind === "test" || first.clears_blocker), `${p.id}: the first task is neither a test nor a blocker proof (${first && first.id})`);
  ok(res.first5.filter((id) => TASKS.find((t) => t.id === id).kind === "learn").length <= 2, `${p.id}: more than 2 learn tasks in the first 5`);
  const compIds = new Set(owned(g, p));
  for (const t of g.orderedTasks) if (!t.clears_blocker) ok(compIds.has(t.competency), `${p.id}: task ${t.id} references ${t.competency}, which has no open gap above 1.0`);
  const fromRole = p.input.fromRole;
  for (const r of g.byCompetency) {
    const role = r.roles[0];
    const a = getRole(fromRole, { roles: PLANNED_VECTORS });
    const b = getRole(role, { roles: PLANNED_VECTORS });
    const tc = data.transfer.competencies[r.competency];
    let want = fromRole === role ? 1.0 : a.family === b.family ? 0.9 : (tc.pair[`${a.family}>${b.family}`] ?? tc.pair[`${a.family}>*`] ?? tc.default);
    if (r.competency === "domain_context" && fromRole !== role && a.family !== b.family && p.input.sameIndustry) want = Math.max(want, tc.same_industry);
    ok(Math.abs(r.transfer_w - want) < 1e-9, `${p.id}: ${r.competency} uses transfer ${r.transfer_w}, table says ${want}`);
    if (!r.known) ok(r.provisional, `${p.id}: unknown ${r.competency} is not provisional`);
  }
  ok(g.byCompetency.every((r) => r.target > 1), `${p.id}: a gap row has a target of 1.0 or less`);
  ok(hash(run(p)) === hash(g) && hash(g.orderedTasks) === hash(run(p).orderedTasks), `${p.id}: not idempotent`);
  // frozen values
  if (exp) {
    ok(Math.abs(exp.distance - res.distance) <= 0.01, `${p.id}: distance ${res.distance} differs from frozen ${exp.distance}`);
    ok(exp.evenings === res.evenings, `${p.id}: evenings ${res.evenings} differ from frozen ${exp.evenings}`);
    ok(JSON.stringify([...exp.largest5].sort()) === JSON.stringify([...res.largest5].sort()), `${p.id}: largest gaps ${res.largest5} differ from frozen ${exp.largest5}`);
    ok(JSON.stringify(exp.first5) === JSON.stringify(res.first5), `${p.id}: first 5 tasks ${res.first5} differ from frozen ${exp.first5}`);
    ok(JSON.stringify(exp.blockers) === JSON.stringify(res.blockers), `${p.id}: blockers differ from frozen`);
  } else fail(`${p.id}: no frozen expectation`);
  // spec comparison (WARN only)
  const overlap = p.spec.largest_gaps.filter((c) => res.largest5.includes(c)).length;
  const firstOverlap = p.spec.first5.filter((c) => res.first5.includes(c)).length;
  const dd = p.spec.distance !== undefined ? r2(res.distance - p.spec.distance) : null;
  const de = p.spec.evenings !== undefined ? res.evenings - p.spec.evenings : null;
  if (overlap < 5) warn(`${p.id}: top-5 gaps overlap the spec on ${overlap}/5 (computed ${res.largest5.join(", ")})`);
  if (dd !== null && Math.abs(dd) > 0.1) warn(`${p.id}: distance ${res.distance} vs spec ${p.spec.distance} (delta ${dd})`);
  if (de !== null && de !== 0) warn(`${p.id}: evenings ${res.evenings} vs spec ${p.spec.evenings} (delta ${de})`);
  if (firstOverlap < 5) warn(`${p.id}: first 5 tasks overlap the spec on ${firstOverlap}/5 (frozen ${res.first5.join(" ")})`);
  if (p.planned_role) notes.push(`${p.id}: planned role used for the worked example (${p.planned_role}, spec vector from the fixtures, not shipped)`);
}

// persona 6 flag guard (spec 7.1 assertion 8)
{
  const p6 = PERSONAS.find((p) => p.id === "P6");
  const yes = run(p6, { sameIndustry: true });
  const no = run(p6, { sameIndustry: false });
  ok(!yes.byCompetency.some((r) => r.competency === "domain_context"), "P6: same_industry true must not show domain_context as a gap");
  ok(no.byCompetency.some((r) => r.competency === "domain_context"), "P6: same_industry false must show domain_context as a gap");
}

// ---- 5. worked examples ----------------------------------------------------------------------------------------------
const worked = [];
for (const w of WORKED) {
  const res = results[w.persona || w.id];
  if (!res) continue;
  const exp = frozen && frozen.worked && frozen.worked[w.id];
  const dd = r2(res.distance - w.spec.distance);
  const de = res.evenings - w.spec.evenings;
  worked.push({ id: w.id, name: w.name, spec: w.spec, computed: { distance: res.distance, evenings: res.evenings }, delta: { distance: dd, evenings: de }, planned_role_used: w.planned_role_used });
  if (exp) {
    ok(Math.abs(exp.distance - res.distance) <= 0.01 && exp.evenings === res.evenings, `${w.id}: computed ${res.distance}/${res.evenings} differs from frozen ${exp.distance}/${exp.evenings}`);
  } else fail(`${w.id}: no frozen expectation`);
  if (Math.abs(dd) > 0.1 || de !== 0) warn(`${w.id} ${w.name}: spec ${w.spec.distance}/${w.spec.evenings}, computed ${res.distance}/${res.evenings} (delta ${dd}/${de})${w.planned_role_used ? " [planned role used for the worked example]" : ""}`);
}
{
  const wp = results.W3 && results.W3.waypoint;
  ok(wp && wp.role === "corporate_comms" && wp.level === "S", "W3: waypoint corporate_comms S not inserted when the distance is above the threshold");
  const w2 = run(PERSONAS.find((p) => p.id === "P2"));
  ok(w2.ok && w2.waypoints.length === 0, "P2: 26 to 30 distance must not insert a waypoint");
}

// ---- 6. beyond personas: self cap, dual target, planned refusal, rubric mapping, symmetry -----------------------------------
{
  // self cap: a self-rating of 4 against a target of 3 counts as 2 with confidence 0.3
  const cl = currentLevel({ level: 4, confidence: 0.9, source: "self" }, 3);
  ok(cl.level === 2 && cl.confidence === 0.3 && cl.provisional && cl.capped, "self cap: level must be capped at target - 1 with confidence 0.3");
  ok(currentLevel({ level: 4, source: "shipped", evidence: ["x"] }, 3).level === 4, "self cap: an evidenced level must not be capped");
  ok(currentLevel({ level: 4, source: "self", tested: true }, 3).level === 4, "self cap: a tested level must not be capped");
  ok(currentLevel({ level: 4, source: "ai", confidence: 0.9, evidence: ["x"] }, 3).confidence === 0.6, "ai rating confidence must be capped at 0.6");
  // planned role without a vector is refused, not thrown
  const pl = computeGap({ current: {}, target: { role: "comms_leader", level: "H" } });
  ok(pl.ok === false && pl.status === "planned", "a planned role without a vector override must return status planned");
  ok(roleVector("ux_writer", "M") === null && roleVector("ux_writer", "M", { roles: PLANNED_VECTORS }) !== null, "planned vectors must come only from the override");
  // shift rule spot checks (spec 2.2 expanded examples)
  const pdM = roleVector("product_designer", "M");
  ok(pdM.interaction_craft === 3 && pdM.visual_craft === 2 && pdM.data_analytics === 1.5 && pdM.team_leadership === 1 && pdM.brand_identity === 0.5, "shift rule: product_designer M differs from the spec's expansion");
  const pdL = roleVector("product_designer", "L");
  ok(pdL.interaction_craft === 4 && pdL.visual_craft === 3.5 && pdL.team_leadership === 2.5 && pdL.copywriting === 2, "shift rule: product_designer L differs from the spec's expansion");
  const prL = roleVector("pr_specialist", "L");
  ok(prL.media_relations === 4 && prL.storytelling === 3.5 && prL.crisis_reputation === 3.5 && prL.measurement_eval === 3.5, "shift rule: pr_specialist L differs from the spec's expansion");
  const cdL = roleVector("creative_director", "L", { roles: PLANNED_VECTORS });
  ok(cdL.brand_identity === 4 && cdL.team_leadership === 3.5 && cdL.business_commercial === 3.5 && cdL.copywriting === 3.5, "shift rule: creative_director L differs from the spec's expansion");
  // transfer lookups from the matrix (the lead's four anchors)
  ok(transfer("product_designer", "pr_specialist", "copywriting") === 0.8, "transfer: writing D to P must be 0.8");
  ok(transfer("product_designer", "product_marketer", "user_research") === 0.7, "transfer: research D to M must be 0.7");
  ok(transfer("product_designer", "product_marketer", "brand_strategy") === 0.6, "transfer: brand strategy must be 0.6");
  ok(transfer("product_marketer", "product_designer", "data_analytics") === 0.4, "transfer: analytics M to D must be 0.4");
  ok(transfer("content_marketer", "product_marketer", "visual_craft") === 0.9 && transfer("product_designer", "product_designer", "visual_craft") === 1.0, "transfer: same family 0.9, same role 1.0");
  ok(transfer("product_designer", "product_marketer", "domain_context", { sameIndustry: true }) === 0.9 && transfer("product_designer", "product_marketer", "domain_context") === 0.4, "transfer: same industry must raise domain_context to 0.9");
  // rubric.json compatibility: every existing rubric id is mapped, and the person's levels map to the spec's example 1 numbers
  const rubricPath = path.join(APP, "data", "rubric.json");
  if (existsSync(rubricPath)) {
    const rub = JSON.parse(readFileSync(rubricPath, "utf8"));
    for (const c of rub.competencies) {
      const m = DOMAINS.maps_to[c.id];
      ok(Array.isArray(m) && m.length > 0, `maps_to: rubric competency ${c.id} has no mapping`);
      for (const x of m || []) ok(COMPETENCY_ORDER.includes(x.domain_id) && x.factor > 0 && x.factor <= 1, `maps_to: ${c.id} -> ${x.domain_id} invalid`);
    }
    notes.push(`rubric.json read only: ${rub.competencies.length} competencies, all mapped`);
  }
  const mapped = mapRubricLevels(DEV_RUBRIC);
  const want = { product_strategy: 2.5, business_commercial: 1.25, visual_craft: 2, interaction_craft: 2, systems_ia: 2.5, user_research: 1.5, audience_insight: 1.05, storytelling: 1.5, stakeholder_influence: 1.5, copywriting: 1.05, cross_functional: 2, team_leadership: 1.4, critique_judgement: 2, tooling_building: 3, domain_context: 3 };
  for (const [k, v] of Object.entries(want)) ok(mapped[k] && Math.abs(mapped[k].level - v) < 1e-9, `rubric map: ${k} is ${mapped[k] && mapped[k].level}, spec example 1 says ${v}`);
  ok(!("data_analytics" in mapped), "rubric map: data_analytics must stay unknown");
  const own = mapRubricLevels(DEV_RUBRIC, { user_research: { level: 3, source: "shipped", evidence: ["x"] } });
  ok(own.user_research.level === 3, "rubric map: an own domain rating must win");
  // dual target: the shared base is counted once, with the larger target
  const single = computeGap({ current: mapped, fromRole: "product_designer", target: { role: "product_designer", level: "L" }, roles: PLANNED_VECTORS });
  const dual = computeGap({ ...DUAL, current: mapped, roles: PLANNED_VECTORS });
  ok(dual.ok && dual.sharedBase.length > 0, "dual: no shared base found");
  const names = dual.byCompetency.map((r) => r.competency);
  ok(new Set(names).size === names.length, "dual: a competency is counted twice");
  const st = (g) => g.byCompetency.find((r) => r.competency === "storytelling");
  ok(st(dual) && st(single) && st(dual).gap >= st(single).gap && st(dual).target >= st(single).target, "dual: storytelling must keep the larger target");
  ok(dual.byCompetency.every((r) => !r.roles.includes("brand_strategist") || r.shared), "dual: an optional target may only add shared-base competencies");
  ok(dual.distance >= single.distance && dual.distance - single.distance < 5, "dual: the second target must add a small amount, not double the plan");
  // symmetry: both directions exist, and differ by design
  const ab = roleDistance({ role: "product_designer", level: "M" }, { role: "pr_specialist", level: "M" });
  const ba = roleDistance({ role: "pr_specialist", level: "M" }, { role: "product_designer", level: "M" });
  ok(ab.ok && ba.ok && ab.distance > 0 && ba.distance > 0, "symmetry: both directions must compute");
  // evenings: the transfer bonus is reported but never changes the headline number
  ok(PERSONAS.every((p) => !results[p.id] || results[p.id].evenings >= computeGap({ ...p.input, ...(p.via_rubric_map ? { current: mapped } : {}), roles: PLANNED_VECTORS }).basis.evenings_adjusted), "evenings_adjusted must not exceed evenings");
  // output items carry because and status
  const sample = run(PERSONAS[0]);
  const labelled = [...sample.byCompetency, ...sample.blockers, ...sample.orderedTasks].every((x) => Array.isArray(x.because) && x.because.length && ["model", "unverified", "verified"].includes(x.status));
  ok(labelled, "every output item must carry because[] and a status");
  // learn cap and week placement in pickTasks
  ok(!sample.orderedTasks.some((t) => t.kind === "learn"), "a learn task was planned without a recorded knowledge hole (spec 3.5)");
  for (const p of PERSONAS) ok(!run(p).orderedTasks.some((t) => t.kind === "learn"), `${p.id}: a learn task was planned without a recorded hole`);
  const holes = sample.byCompetency.map((r) => r.competency);
  const withHoles = computeGap({ current: mapped, fromRole: "product_designer", target: { role: "product_designer", level: "L" }, roles: PLANNED_VECTORS, constraints: { proof: { portfolio_case_study: 0 }, holes } });
  const learnTasks = withHoles.orderedTasks.filter((t) => t.kind === "learn");
  ok(learnTasks.length > 0 && learnTasks.every((t) => t.because.some((b) => b.startsWith("hole:"))), "with recorded holes, learn tasks must appear and cite the hole");
  for (const t of learnTasks) { const test = withHoles.orderedTasks.find((x) => x.kind === "test" && x.competency === t.competency); if (test) ok(test.order < t.order, `test ${test.id} must precede learn ${t.id}`); }
  const makeOnly = computeGap({ current: mapped, fromRole: "product_designer", target: { role: "product_designer", level: "L" }, roles: PLANNED_VECTORS, constraints: { holes, learningMode: "make_only" } });
  ok(!makeOnly.orderedTasks.some((t) => t.kind === "learn"), "make_only must drop every learn task (demand D-learn)");
  // cross-over blockers: a bridge creates the first proof of the new kind, the native proof follows it
  for (const p of PERSONAS) {
    const g = run(p);
    for (const b of g.blockers.filter((x) => x.cross_over)) {
      const items = g.orderedTasks.filter((t) => t.clears_blocker === b.id);
      ok(items.length > 0 && items[0].kind === "bridge", `${p.id}: cross-over blocker ${b.id} is not cleared by a bridge task first`);
      const native = items.find((t) => b.clears_with.includes(t.id));
      if (native) ok(items[0].order < native.order, `${p.id}: native proof ${native.id} must come after the bridge`);
    }
  }
  const pick = pickTasks(withHoles, 5, 12);
  let learn = 0, other = 0;
  for (const t of pick) { if (t.kind === "learn") { learn += 1; ok(other >= 3 * learn, `pickTasks: learn ${t.id} placed before 3 practice tasks per learn task`); } else other += 1; }
  ok(pick.every((t, i) => i === 0 || t.week >= pick[i - 1].week), "pickTasks: weeks must not go backwards");
  // dependencies: a prereq that is still open is planned before its dependent
  const idx = (c) => sample.byCompetency.findIndex((r) => r.competency === c);
  for (const [c, ps] of Object.entries(DOMAINS.prereqs)) for (const p of ps) if (idx(c) >= 0 && idx(p) >= 0 && sample.byCompetency[idx(c)].waits_for.includes(p)) ok(idx(p) < idx(c), `ordering: ${p} must come before ${c}`);
  // test before proof for the same competency
  for (const p of PERSONAS) {
    const g = run(p);
    for (const t of g.orderedTasks.filter((x) => x.kind === "proof")) {
      const test = g.orderedTasks.find((x) => x.kind === "test" && x.competency === t.competency);
      if (test) ok(test.order < t.order, `${p.id}: test ${test.id} must come before proof ${t.id}`);
    }
  }
  // research templates: only launch roles
  ok(Object.keys(R2_TEMPLATES).sort().join() === [...LAUNCH_ROLES].sort().join(), "r2 templates must cover exactly the launch roles");
}

// ---- report ---------------------------------------------------------------------------------------------------------
if (argv.includes("--table")) {
  console.log("persona | distance | evenings | n gaps | top gaps | first 5 tasks");
  for (const p of PERSONAS) { const r = results[p.id]; if (r) console.log(`${p.id} | ${r.distance} | ${r.evenings} | ${r.n_gaps} | ${r.largest5.join(", ")} | ${r.first5.join(" ")}`); }
  console.log("\nworked | spec | computed | delta");
  for (const w of worked) console.log(`${w.id} ${w.name} | ${w.spec.distance}/${w.spec.evenings} | ${w.computed.distance}/${w.computed.evenings} | ${w.delta.distance}/${w.delta.evenings}${w.planned_role_used ? " planned role used" : ""}`);
}
for (const m of fails) console.log(`FAIL  ${m}`);
for (const m of warns) console.log(`WARN  ${m}`);
for (const m of notes) console.log(`NOTE  ${m}`);
const launchCount = DOMAINS.roles.filter((r) => r.launch).length;
console.log(`\nCounts: ${DOMAINS.roles.length} roles (${launchCount} launch, ${DOMAINS.roles.length - launchCount} planned), ${DOMAINS.competencies.length} competencies, ${TASKS.length} tasks, ${DOMAIN_BANK.length} questions (${lint.counts.must} MUST, ${lint.counts.nice} NICE, ${lint.counts.retired} ids retired), ${Object.keys(R2_TEMPLATES).length} R2 templates, ${DOMAIN_MODEL_PATHS_NEW.length} new model paths.`);
console.log(`Personas: ${PERSONAS.length}, worked examples: ${WORKED.length}. Frozen from first run: scripts/domains-expected.json.`);
console.log(fails.length ? `\nFAIL: ${fails.length} problem(s), ${warns.length} warning(s).` : `\nPASS with ${warns.length} spec-comparison warning(s).`);
process.exit(fails.length ? 1 : 0);
