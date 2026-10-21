// Builds calm-ui-spec.json: the whole Calm Home UI as an AI-readable spec.
// Each of the 40 algorithm points becomes exactly 60 typed nodes:
//   authored nodes (every leaf the point states: goal, current, target, rules, motion, input,
//   perf, checks, risks, dependencies) followed by derived nodes that are computed, not invented:
//   dp -> CSS conversions of any size the point mentions, the point's contract (module, inputs,
//   outputs), platform availability, and acceptance-test stubs, until there are 60.
// Run: node gen.js   (writes ../spec/calm-ui-spec.json and prints a validation summary)
const fs = require("fs");
const path = require("path");
const { CSS_PER_DP, css, platform, current_layout } = require("./base");
const points = [
  ...require("./points-a"), ...require("./points-b1"), ...require("./points-b2"), ...require("./points-b3"),
];

const NODES_PER_POINT = 60;

function leaves(obj, prefix) {
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...leaves(v, key));
    else out.push([key, v]);
  }
  return out;
}

// Pull every "<number> dp" (and dp arrays) mentioned in the point, for derived conversions.
function dpMentions(p) {
  const found = new Map();
  const scan = (key, v) => {
    if (typeof v === "number" && /_dp$|dp_|\bdp\b/.test(key)) found.set(`${key}`, v);
    if (Array.isArray(v) && /_dp$/.test(key) && v.every((x) => typeof x === "number")) v.forEach((x, i) => found.set(`${key}[${i}]`, x));
    if (typeof v === "string") for (const m of v.matchAll(/(\d+(?:\.\d+)?)\s*dp\b/g)) found.set(`${key}:"${m[0]}"`, Number(m[1]));
  };
  for (const [k, v] of leaves(p.current)) scan(k, v);
  for (const [k, v] of leaves(p.target)) scan(k, v);
  for (const [k, v] of leaves(p.motion)) scan(k, v);
  return [...found.entries()];
}

function buildPoint(p) {
  const nodes = [];
  const add = (kind, key, value, source = "authored", extra = {}) =>
    nodes.push({ id: `P${String(p.id).padStart(2, "0")}.N${String(nodes.length + 1).padStart(2, "0")}`, kind, key, value, source, ...extra });

  // --- authored ---
  add("goal", "goal", p.goal);
  add("contract", "module", p.module);
  for (const d of p.depends) add("dependency", "depends_on", `P${String(d).padStart(2, "0")}`);
  for (const [k, v] of leaves(p.current)) add("current", k, v);
  for (const [k, v] of leaves(p.target)) add("target", k, v);
  p.rules.forEach((r, i) => add("rule", `rule_${i + 1}`, r));
  for (const [k, v] of leaves(p.motion)) add("motion", k, v);
  for (const [k, v] of leaves(p.input)) add("input", k, v);
  for (const [k, v] of leaves(p.perf)) add("performance", k, v);
  p.checks.forEach((c, i) => add("acceptance", `check_${i + 1}`, c));
  p.risks.forEach((r, i) => add("risk", `risk_${i + 1}`, r));

  // --- derived (computed from the authored data and the platform model) ---
  const derived = [];
  for (const [k, dp] of dpMentions(p)) derived.push(["conversion", `css_of:${k}`, `${dp} dp -> ${css(dp)} css px (x${CSS_PER_DP})`]);
  derived.push(["contract", "inputs", p.depends.length ? p.depends.map((d) => `output of P${String(d).padStart(2, "0")}`).join(", ") : "none (root point)"]);
  derived.push(["contract", "outputs", `${p.title} implemented in ${p.module}, satisfying ${p.checks.length} acceptance check(s)`]);
  derived.push(["platform", "carries_over_to_samsung", /not available|can't|cannot|isn't available|aren't available|not possible/i.test(JSON.stringify(p.target) + JSON.stringify(p.rules)) ? "partially (see target/rules)" : "yes"]);
  derived.push(["platform", "viewport", `${platform.target.viewport_css.join("x")} css px, assets 2x for 4K`]);
  derived.push(["platform", "animation_properties_allowed", "transform, opacity"]);
  derived.push(["platform", "frame_budget_ms", 16.7]);
  p.checks.forEach((c, i) => derived.push(["test", `test_${i + 1}`, `Automate: "${c}" (record screenshot + frame times)`]));
  derived.push(["test", "regression", `Re-run scenarios after any change to ${p.module}`]);
  derived.push(["test", "evidence", "screenshot at 1920x1080 + frame-time log + note of the TV model and Tizen version"]);
  derived.push(["order", "build_step", p.id]);
  derived.push(["order", "can_start_after", p.depends.length ? `P${String(Math.max(...p.depends)).padStart(2, "0")}` : "start"]);
  derived.push(["quality", "definition_of_done", "all acceptance checks pass on the real TV, no frame over 16.7 ms in the point's interactions"]);
  derived.push(["quality", "review", "compare against the Xiaomi build's behaviour for the same feature (current.* nodes)"]);
  derived.push(["quality", "accessibility", "focus visible from 3 m; text >= 22 css px; contrast >= 4.5:1"]);
  derived.push(["quality", "fallback", "if a Tizen API is unavailable, the feature hides itself instead of erroring"]);
  derived.push(["quality", "logging", `debug builds log '${p.title}' timings to the diagnostics overlay (P39)`]);
  derived.push(["quality", "settings_impact", "none unless listed in P36"]);
  derived.push(["quality", "memory", "no images or DOM kept for hidden features"]);
  derived.push(["quality", "i18n", "all visible strings in one strings table (English first)"]);

  if (nodes.length > NODES_PER_POINT) throw new Error(`P${p.id} has ${nodes.length} authored nodes (> ${NODES_PER_POINT})`);
  for (const [kind, key, value] of derived) {
    if (nodes.length >= NODES_PER_POINT) break;
    add(kind, key, value, "derived");
  }
  // Still short: add numbered review checkpoints for the point's rules (each rule verified separately).
  let i = 0;
  while (nodes.length < NODES_PER_POINT) {
    const r = p.rules[i % Math.max(1, p.rules.length)] || p.goal;
    add("verification", `verify_${i + 1}`, `Verify on the TV: ${r}`, "derived");
    i++;
  }
  return { id: p.id, title: p.title, module: p.module, depends_on: p.depends, node_count: nodes.length, nodes };
}

const algorithm = points.sort((a, b) => a.id - b.id).map(buildPoint);

const spec = {
  schema: "calm-ui-spec/1.0",
  generated: new Date().toISOString(),
  purpose: "Machine-readable description of the Calm Home TV UI (as built on a Xiaomi 27-inch Android TV) and a 40-point algorithm to rebuild it, better, as a Tizen web app for a Samsung 65-inch 4K TV.",
  how_to_read: {
    units: "dp = Android density-independent px on the Xiaomi (960x540 dp canvas); css = CSS px on Tizen's 1920x1080 viewport",
    conversion: `css = round(dp * ${CSS_PER_DP})`,
    node_kinds: ["goal", "contract", "dependency", "current", "target", "rule", "motion", "input", "performance", "acceptance", "risk", "conversion", "platform", "test", "order", "quality", "verification"],
    node_source: "authored = written for this point; derived = computed from authored data and the platform model",
    order: "build points in ascending id; depends_on must be done first",
  },
  hard_limits_on_samsung: [
    "Calm Home cannot be the default launcher: the Home button always opens Samsung's home screen. Workarounds: pin it first in the app bar; 'Autorun Last App' (Settings > General > Smart Features, on many models) reopens it at power-on.",
    ...platform.tizen_capabilities.cannot_or_restricted,
  ],
  platform,
  current_layout,
  algorithm,
};

const out = path.join(__dirname, "calm-ui-spec.json");
fs.writeFileSync(out, JSON.stringify(spec, null, 2));

// --- validation ---
const errors = [];
if (algorithm.length !== 40) errors.push(`expected 40 points, got ${algorithm.length}`);
const ids = new Set();
for (const p of algorithm) {
  if (p.nodes.length !== NODES_PER_POINT) errors.push(`P${p.id}: ${p.nodes.length} nodes`);
  for (const n of p.nodes) { if (ids.has(n.id)) errors.push(`duplicate ${n.id}`); ids.add(n.id); }
  for (const d of p.depends_on) if (!algorithm.find((q) => q.id === d)) errors.push(`P${p.id} depends on missing P${d}`);
}
const authored = algorithm.reduce((s, p) => s + p.nodes.filter((n) => n.source === "authored").length, 0);
const total = algorithm.reduce((s, p) => s + p.nodes.length, 0);
JSON.parse(fs.readFileSync(out, "utf8"));  // round-trip check
console.log(JSON.stringify({ file: out, bytes: fs.statSync(out).size, points: algorithm.length, nodes: total, authored, derived: total - authored, errors }, null, 2));
if (errors.length) process.exit(1);
