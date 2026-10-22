// Renders one G mini report (the model from lib/mini.mjs buildReportModel) as a single HTML document: A4, calm, in the look of
// the CV renderer (same type, same green, same yellow for missing facts). Pure: no node built-ins, no clock, no files.
// Twelve sections with stable ids s1 to s12. The summary is exactly two pages (s1 and s1b) and section 2 starts page 3.
// Every text is escaped first; only then are [NEEDS: ...] placeholders wrapped. Dashes in any text become a spaced hyphen.
// Private answers are not in the model, so they cannot be printed here.
// The model may carry newer optional fields (a verdict, a bridge, level tags, "not assessed" gap rows, phases). Each is read defensively:
// when a field is absent the renderer works from the figures the model does hold, and never invents one.
import { CV_CSS } from "./career-render.mjs";
import { pathDiagram, readyBar, fitGauge, fitFacts, gapMap, patternBars, interviewFlow, planTimeline, planPhases, salaryBands, salarySources, isAssessed, typeFits, inr } from "./mini-charts.mjs";

const PLACEHOLDER = /\[NEEDS(?: REAL NUMBER)?:[^\]]*\]/g;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const undash = (s) => String(s ?? "").replace(/\s*[–—]\s*/g, " - ");
const t = (s) => esc(undash(s)).replace(PLACEHOLDER, (m) => `<span class="need">${m}</span>`);
const list = (xs, what) => {
  if (!xs || !xs.length) return "";
  if (xs.length === 1 && what) return `<p><span class="k">Only one ${what} found so far:</span> ${t(xs[0])}</p>`;
  return `<ul>${xs.map((x) => `<li>${t(x)}</li>`).join("")}</ul>`;
};
const bare = (u) => String(u || "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
const link = (u) => (/^https?:\/\//i.test(String(u || "")) ? `<a href="${esc(u)}" rel="noopener">${esc(bare(u))}</a>` : esc(u));
const LEVEL = ["none yet", "starting", "working", "strong", "leading"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
/** 2027-06-01 becomes 1 June 2027. Anything else is returned as it is. */
const human = (d) => (isIso(d) ? `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : String(d ?? ""));
const dayN = (s) => { const [y, m, d] = String(s).split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;
const hoursOf = (min) => Math.round((min / 60) * 10) / 10;
/** Text from a field that may be a string, a list of strings or an object with a text. */
const asText = (v) => (typeof v === "string" ? v : Array.isArray(v) ? asText(v[0]) : v && typeof v === "object" ? asText(v.text ?? v.summary ?? v.how ?? v.verdict ?? "") : "");

export const MINI_SECTIONS = [
  ["s1", "Summary"], ["s2", "Where you are now"], ["s3", "Where you want to be"], ["s4", "The types of roles explained"], ["s5", "Your gap map"], ["s6", "How others made this jump"],
  ["s7", "What interviews look like"], ["s8", "Your dated plan"], ["s9", "Money and market"], ["s10", "Reading and learning list"], ["s11", "Find out next"], ["s12", "Sources"],
];
/** Section titles come from the person's own target field (meta.interview_for and the model's own titles), never from a fixed field. */
const titleOf = (m, id) => {
  if (id === "s4") return asText(m.s.s4.title) || `The types of ${m.meta.interview_for || "roles"} explained`;
  if (id === "s7") return asText(m.s.s7.title) || `What interviews for ${m.meta.interview_for || "these roles"} look like`;
  return (MINI_SECTIONS.find(([x]) => x === id) || [id, id])[1];
};

export const MINI_CSS = `
  .page { max-width: 182mm; }
  body { font-size: 10pt; line-height: 1.42; }
  .cover { border-bottom: 1.5px solid #1d1d1b; padding-bottom: 6px; margin-bottom: 8px; }
  .cover h1 { font-size: 22pt; margin: 0; }
  .cover .role { font-size: 11pt; }
  .cover .meta { color: #555; font-size: 9.5pt; margin-top: 2px; }
  section.sec { break-before: page; page-break-before: always; }
  section.sec.first { break-before: auto; page-break-before: auto; }
  section.summary-page h3 { margin: 9px 0 3px; }
  section.summary-page p { margin: 3px 0 4px; }
  h2.sh { font-size: 14pt; text-transform: none; letter-spacing: 0; color: #1d1d1b; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid #cfcfc8; }
  h2.sh span { color: #2f6b4f; margin-right: 8px; }
  h3 { font-size: 11pt; margin: 12px 0 4px; }
  h4 { font-size: 9.5pt; margin: 8px 0 2px; color: #2f6b4f; text-transform: uppercase; letter-spacing: .06em; }
  p { margin: 4px 0 6px; }
  ul { margin: 3px 0 6px; padding-left: 16px; }
  li { margin: 1px 0; }
  .card { border: 1px solid #dcdcd4; border-radius: 6px; padding: 8px 10px; margin: 8px 0; break-inside: avoid; }
  .card h3 { margin-top: 0; }
  .lead { font-size: 11.5pt; }
  .k { color: #555; font-size: 9pt; }
  .src { color: #555; font-size: 9pt; }
  table { border-collapse: collapse; width: 100%; font-size: 9.5pt; margin: 6px 0; }
  th, td { text-align: left; vertical-align: top; padding: 4px 6px; border-bottom: 1px solid #e3e3dc; }
  th { color: #2f6b4f; font-weight: 700; font-size: 9pt; text-transform: uppercase; letter-spacing: .05em; }
  tr { break-inside: avoid; }
  .bar { position: relative; height: 10px; background: #ecece6; border-radius: 5px; min-width: 120px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bar .now { position: absolute; left: 0; top: 0; bottom: 0; background: #2f6b4f; border-radius: 5px 0 0 5px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bar .gapfill { position: absolute; top: 0; bottom: 0; background: #e9d27a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bar .need-mark { position: absolute; top: -3px; bottom: -3px; width: 2px; background: #1d1d1b; }
  .legend { font-size: 9pt; color: #555; margin: 2px 0 8px; }
  .big { font-size: 15pt; font-weight: 700; margin: 2px 0; }
  .toc { columns: 2; column-gap: 24px; font-size: 10pt; padding-left: 18px; }
  .lane { margin: 3px 0; }
  .lane b { color: #2f6b4f; }
  .tier { display: inline-block; font-size: 8.5pt; border: 1px solid #cfcfc8; border-radius: 8px; padding: 0 5px; color: #555; }
  .tier.warn { border-color: #e9d27a; color: #7a5a00; background: #fef7d6; }
  .need { display: inline; }
  figure.fig { margin: 6px 0 8px; break-inside: avoid; page-break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  figure.fig svg.chart { display: block; width: 100%; height: auto; }
  figure.fig figcaption { font-size: 9.5pt; margin-top: 3px; }
  figure.fig figcaption .src { display: block; margin-top: 1px; }
  .read { border-left: 4px solid #2f6b4f; background: #f3f8f5; padding: 6px 12px; margin: 8px 0; break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .read h3 { margin: 0 0 2px; }
  .read p { margin: 2px 0; font-size: 11pt; }
  .truths { margin: 2px 0 6px; padding-left: 16px; }
  .finish { border: 1.5px solid #e9d27a; background: #fffbea; border-radius: 6px; padding: 8px 12px; margin: 8px 0 10px; break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .finish h3 { margin: 0 0 2px; }
  .finish ul { margin: 4px 0 2px; }
  .finish li { margin: 3px 0; }
  .phase h3 .k { font-weight: 400; margin-left: 6px; }
  .ask { border-top: 1px dashed #cfcfc8; margin-top: 8px; padding-top: 4px; }
  .group-h { margin: 10px 0 2px; }
`;
// A chart with its one-line caption and, where the data came from research, its source line. No chart, nothing printed.
const fig = (chart, caption, source) => (chart ? `<figure class="fig">${chart}<figcaption>${t(caption)}${source ? `<span class="src">${t(source)}</span>` : ""}</figcaption></figure>` : "");

const levelsText = (r) => (r.not_assessed || r.assessed === false || !Number.isInteger(r.now) ? "not assessed yet" : r.now === 0 ? `no evidence yet, ${LEVEL[r.needed]} needed` : `${LEVEL[r.now]} now, ${LEVEL[r.needed]} needed`);
const gapBar = (r) => {
  if (!isAssessed(r)) return `<span class="k">Not assessed yet</span>`;
  const now = (r.now / 4) * 100, needed = (r.needed / 4) * 100;
  return `<div class="bar" role="img" aria-label="${esc(levelsText(r))}"><div class="now" style="width:${now}%"></div>${r.needed > r.now ? `<div class="gapfill" style="left:${now}%;width:${needed - now}%"></div>` : ""}<div class="need-mark" style="left:calc(${needed}% - 1px)"></div></div>`;
};
const head = (m, id, n) => `<h2 class="sh" id="${id}-h"><span>${n}</span>${t(titleOf(m, id))}</h2>`;
const needBlock = (x) => (x ? `<p>${t(x)}</p>` : "");

// ---- derived lines for the summary ----------------------------------------------------------------------------------------------------
const stepsOf = (rows) => rows.reduce((a, r) => a + Math.max(0, r.needed - r.now), 0);
const bridgeFor = (m, target) => {
  const own = asText(target.bridge);
  if (own) return own;
  const hit = (m.s.s4.types || []).find((x) => x.bridge && typeFits(x.subject, [target.title]));
  return hit ? asText(hit.bridge) : "";
};
/** One or two plain sentences: aim at X first because ..., Y comes later. Uses the research bridge when the model has one, else the counted gaps. */
function honestRead(m) {
  const eng = asText(m.s.s1.honest_read) || asText(m.s.s1.read) || asText(m.s.honest_read);
  if (eng) return [eng];
  const targets = (m.s.s3.targets || []).filter((x) => x && x.title);
  if (!targets.length) return [];
  const rows = (m.s.s5.rows || []).filter(isAssessed);
  const stats = targets.map((x, i) => { const rs = rows.filter((r) => norm(r.role) === norm(x.title)); return { x, i, n: rs.length, steps: stepsOf(rs), bridge: bridgeFor(m, x), top: [...rs].sort((a, b) => b.needed - b.now - (a.needed - a.now))[0] }; });
  const order = [...stats].sort((a, b) => (a.n === 0) - (b.n === 0) || a.steps - b.steps || a.i - b.i);
  const first = order[0], rest = order.slice(1);
  const count = (s) => `${plural(s.steps, "level step")} short across ${plural(s.n, "skill")}`;
  const out = [];
  if (targets.length === 1) {
    out.push(first.bridge ? `Aim at ${first.x.title}, through a bridge: ${first.bridge.replace(/\.$/, "")}.` : first.n ? `Aim at ${first.x.title}. You are ${count(first)}${first.top && first.top.needed > first.top.now ? `, the furthest in ${first.top.name}` : ""}.` : `Aim at ${first.x.title}.`);
    return out;
  }
  out.push(first.bridge ? `Aim at ${first.x.title} first. The bridge: ${first.bridge.replace(/\.$/, "")}.` : first.n ? `Aim at ${first.x.title} first because it has the fewest gaps to close: ${count(first)}.` : `Aim at ${first.x.title} first.`);
  out.push(`${rest.map((s) => s.x.title).join(" and ")} comes later${rest.every((s) => s.n) ? `, because it has more to close: ${rest.map((s) => count(s)).join("; ")}` : ""}.`);
  return out;
}
/** Hard truths already in the model, one line each: experience a post asks for, a previous round, and skills with no evidence yet. */
function hardTruths(m) {
  const out = [];
  const add = (x) => { const s = asText(x).trim(); if (s && !out.some((y) => norm(y) === norm(s))) out.push(s); };
  for (const x of [].concat(m.s.s1.hard_truths || [])) add(x);
  for (const x of m.s.s4.types || []) { add(x.hard_truth); add(x.experience_asked); }
  for (const x of m.s.s9.market || []) if (/\byears?\b.*\bexperience\b|\bexperience\b.*\byears?\b/i.test(x.claim || "")) add(`${String(x.claim).replace(/\.$/, "")}.`);
  const rows = (m.s.s5.rows || []).filter((r) => isAssessed(r) && r.now === 0 && r.needed >= 2);
  for (const r of rows.slice(0, 2)) add(`You have no evidence yet for ${r.name}, and ${r.role} asks for ${LEVEL[r.needed]}.`);
  return out.slice(0, 4);
}
const confWords = (c) => ({ low: "Confidence is low. That means the range is wide and could move", medium: "Confidence is medium. The range is a fair guide, but part of it is an estimate", high: "Confidence is high. The range rests on work you have already done and shown" })[norm(c)] || `Confidence is ${c}`;
const readySentence = (m) => {
  const rd = m.s.s8.ready;
  if (!rd || !isIso(rd.from) || !isIso(rd.to)) return m.s.s1.ready;
  return `If you finish the plan on time, you are likely ready between ${human(rd.from)} and ${human(rd.to)}.`;
};
/** The engine's verdict when the model has one; otherwise one plain sentence from the hours and the ready range, so "It fits" never sits next to a contradiction. */
function verdictOf(m) {
  const eng = asText(m.s.s8.verdict) || asText(m.s.s1.verdict) || asText(m.verdict);
  if (eng) return eng;
  const f = fitFacts(m), rd = m.s.s8.ready, dl = m.s.s8.deadline || m.meta.deadline;
  if (!f) return m.s.s1.fit;
  if (f.weeks <= 0) return `Your date (${human(f.dl)}) comes before the plan can start (${human(f.start)}), so it does not fit. Move the date or the start.`;
  const hoursOk = f.spareH >= 0;
  const est = f.estimate ? " (an estimate)" : "";
  const hours = hoursOk ? `the gaps need about ${f.needH} hours${est} and you have about ${f.haveH}, so the hours ${f.spareH === 0 ? "just fit with none to spare" : `fit with about ${f.spareH} to spare`}` : `the gaps need about ${f.needH} hours${est} but you have about ${f.haveH} before your date, about ${-f.spareH} short`;
  let ready = null, readyOk = null;
  if (rd && isIso(rd.from) && isIso(rd.to) && isIso(dl)) {
    if (dayN(rd.to) <= dayN(dl)) { ready = `you are likely ready before your date of ${human(dl)}`; readyOk = true; }
    else if (dayN(rd.from) > dayN(dl)) { ready = `you are likely not ready until after your date of ${human(dl)}`; readyOk = false; }
    else { ready = `your date of ${human(dl)} falls inside the likely ready range, so being ready by it is not certain`; readyOk = false; }
  }
  if (ready === null) return `${cap(hours)}.`;
  return `${cap(hours)}${hoursOk === readyOk ? " and " : ", but "}${ready}.`;
}

/** Every [NEEDS: ...] in the model, one line each, with who to ask, the section it fills and about how long it takes. Role research is one line. */
function needItems(m) {
  const seen = new Set(), raw = [];
  const walk = (v, sec) => {
    if (typeof v === "string") { for (const x of v.match(PLACEHOLDER) || []) if (!seen.has(x)) { seen.add(x); raw.push({ x, sec }); } }
    else if (Array.isArray(v)) v.forEach((y) => walk(y, sec));
    else if (v && typeof v === "object") for (const y of Object.values(v)) walk(y, sec);
  };
  for (const [k, v] of Object.entries(m.s)) walk(v, k === "s1b" ? "s1" : k);
  const first = String(m.meta.name || "the person").split(/\s+/)[0];
  const num = (sec) => String(sec).replace(/^s/, "");
  const items = [], roleTypes = [];
  for (const { x, sec } of raw) {
    const inner = x.replace(/^\[NEEDS(?: REAL NUMBER)?:\s*/, "").replace(/\]$/, "").trim();
    const role = inner.match(/^research on what (.+?) work is/i);
    if (role) { roleTypes.push(role[1]); continue; }
    const research = /research|sources|salary bands|what interviews|scored reading|hiring is happening|how others made/i.test(inner);
    items.push({ text: cap(inner), who: research ? "The person, with research" : `${first}, in a short chat`, section: `${num(sec)}, ${titleOf(m, sec === "s1" ? "s1" : sec)}`, min: research ? 15 : /real example|a real/i.test(inner) ? 10 : 5 });
  }
  if (roleTypes.length) items.unshift({ text: `Research on ${plural(roleTypes.length, "more role type")}: ${roleTypes.join(", ")}`, who: "The person, with research", section: `4, ${titleOf(m, "s4")}`, min: Math.min(60, 10 * roleTypes.length) });
  return items;
}
function finishBox(m, limit) {
  const items = needItems(m);
  if (!items.length) return "";
  const total = items.reduce((a, x) => a + x.min, 0);
  const shown = limit && items.length > limit + 1 ? items.slice(0, limit) : items;
  const more = items.length - shown.length;
  return `<div class="finish"><h3>To finish this report</h3><p class="k">${plural(items.length, "item")} still open, about ${total} minutes in all. Fill them in, then say <b>/g-mini &lt;id&gt; edit</b> and the yellow Draft mark goes.${more ? ` The first ${shown.length} are here and all ${items.length} are listed in section 11.` : ""}</p><ul>${shown.map((x) => `<li>${t(x.text)}. <span class="k">Ask: ${t(x.who)}. Fills section ${t(x.section)}. About ${x.min} min.</span></li>`).join("")}</ul></div>`;
}

function summary(m) {
  const s = m.s.s1;
  const read = honestRead(m), truths = hardTruths(m);
  const gapChart = fig(gapMap(m, { limit: 5 }), "Notice the longest amber bars: those are the skills furthest from the level your target asks for. Hatched bars are your own claim, solid bars are backed by a source.");
  const gap = gapChart ? gapChart : s.gap.length
    ? `<table><tr><th style="width:34%">Skill</th><th style="width:28%">Role</th><th>Now against needed</th></tr>${s.gap.map((r) => `<tr><td>${t(r.name)}</td><td>${t(r.role)}</td><td>${gapBar(r)}<span class="k">${t(levelsText(r))}</span></td></tr>`).join("")}</table><div class="legend">Green is where you are. Yellow is the distance to the level the role asks for. The black mark is that level.</div>`
    : `<p>${t(`[NEEDS: a gap map, so the gap can be shown in one picture]`)}</p>`;
  const gc = s.gap_counts;
  const planWeeks = (m.s.s8.weeks || []).length, phases = planPhases(m);
  const planLine = phases.length ? `${plural(phases.length, "phase")} over ${plural(planWeeks, "week")}: ${phases.map((p, i) => `${i + 1}. ${p.name}`).join(", ")}.` : s.plan_line;
  const wantLine = (s.want || []).length ? `<p><b>Where you want to be:</b> ${(s.want || []).map(t).join("; ")}.</p>` : "";
  return `<section class="sec first summary-page" id="s1">
<h2 class="sh" id="s1-h"><span>1</span>${t(`Summary: ${m.meta.name}`)}</h2>
${read.length ? `<div class="read"><h3>Our honest read</h3>${read.map((x) => `<p>${t(x)}</p>`).join("")}</div>` : ""}
${truths.length ? `<h3>Hard truths</h3><ul class="truths">${truths.map((x) => `<li>${t(x)}</li>`).join("")}</ul>` : ""}
<h3>Where you are</h3>
<p>${t(s.where)} ${s.where_facts.slice(0, 1).map((f) => t(`${f.text} (${f.src})`)).join("")}</p>
${wantLine}
${fig(pathDiagram(m), "Each bridge box is a skill to build, and it points only at the target it serves.")}
${finishBox(m, 3)}
<h3>The plan in one line</h3>
<p class="lead">${t(planLine)}</p>
</section>
<section class="sec summary-page last" id="s1b">
<h2 class="sh"><span>1</span>Summary, continued</h2>
<h3>The gap in one picture</h3>
${gap}
${gc.rows ? `<p>${gc.below} of ${gc.rows} skills are below the level your target asks for, ${plural(gc.steps, "level step")} in all. ${gc.unevidenced} of the ${gc.rows} levels rest on your own word only.${gc.not_assessed ? ` ${plural(gc.not_assessed, "skill")} ${gc.not_assessed === 1 ? "is" : "are"} not assessed yet: no source shows your level, so no bar is drawn.` : ""}</p>` : ""}
<h3>Your ready date</h3>
<p class="lead">${t(readySentence(m))}</p>
${fig(readyBar(m), "Green is the likely ready range, black is today, red is your date.")}
${s.ready_basis ? `<p class="k">${t(confWords(m.s.s8.ready ? m.s.s8.ready.confidence : ""))}. It rests on: ${t(s.ready_basis)} This is an estimate, not a promise.</p>` : ""}
<h3>Does it fit your time?</h3>
<p>${t(verdictOf(m))}</p>
${fig(fitGauge(m), "Dark bar: hours the gaps need (hatched when that is an estimate). Light bar: hours you have before your date.")}
<p class="k">Yellow marks a missing fact, never a guess. Figures show source and date. Private answers are not included.</p>
</section>`;
}

function now(m) {
  const s = m.s.s2;
  return `<section class="sec" id="s2">${head(m, "s2", "2")}
${needBlock(s.empty)}
${s.inputs.length ? `<h3>What this is built from</h3>${list(s.inputs.map((i) => `${i.kind === "cv" ? "Your CV" : "Your LinkedIn text"}, pasted by you on ${i.added}.`))}` : `<p>${t("[NEEDS: your CV text and your LinkedIn text]")}</p>`}
${s.facts.length ? `<h3>What your CV, LinkedIn text and answers show</h3><table><tr><th>Fact</th><th style="width:26%">Source</th></tr>${s.facts.map((f) => `<tr><td>${t(f.text)}</td><td class="src">${t(f.src)}</td></tr>`).join("")}</table>` : ""}
${s.answers.length ? `<h3>In your own answers</h3><table>${s.answers.map((a) => `<tr><td style="width:36%">${t(a.label)}</td><td>${t(a.value)}</td></tr>`).join("")}</table>` : ""}
</section>`;
}
function want(m) {
  const s = m.s.s3;
  return `<section class="sec" id="s3">${head(m, "s3", "3")}
<p>Market: ${t(s.market)}.</p>
${needBlock(s.empty)}
${s.targets.map((r) => `<div class="card"><h3>${t(r.title)}</h3><p class="k">${t(r.route)}</p>${r.why.length ? `<h4>Why it fits</h4><table>${r.why.map((w) => `<tr><td>${t(w.text)}</td><td class="src" style="width:26%">${t(w.src)}</td></tr>`).join("")}</table>` : `<p>${t(`[NEEDS: why ${r.title} fits you, from your CV, LinkedIn text or answers]`)}</p>`}</div>`).join("")}
${s.answers.length ? `<h3>In your own words</h3><table>${s.answers.map((a) => `<tr><td style="width:36%">${t(a.label)}</td><td>${t(a.value)}</td></tr>`).join("")}</table>` : ""}
</section>`;
}
function types(m) {
  const s = m.s.s4;
  const targets = (m.s.s3.targets || []).map((x) => x.title);
  const all = (s.types || []).map((x, i) => ({ x, i, fits: typeFits(x.subject, targets) }));
  const done = all.filter((e) => !e.x.missing).sort((a, b) => Number(b.fits) - Number(a.fits) || a.i - b.i);
  const shown = done.slice(0, 3), later = [...done.slice(3), ...all.filter((e) => e.x.missing)];
  return `<section class="sec" id="s4">${head(m, "s4", "4")}
<p>For each type: what the work is, who hires, how people enter, and the skills asked. At most three are written out in full, the ones closest to the roles you named.</p>
${shown.map(({ x }) => `<div class="card"><h3>${t(x.subject)}${x.level ? ` <span class="tier">${t(x.level)}</span>` : ""}${x.level_mismatch ? ` <span class="tier warn">different level: indicative</span>` : ""}</h3><h4>What the work is</h4><p>${t(x.what)}</p><h4>Who hires</h4><p>${t(x.who_hires)}</p><h4>Entry routes</h4>${list(x.entry_routes, "entry route")}<h4>Skills asked</h4>${list(x.skills, "skill")}${x.bridge ? `<h4>The bridge from your role</h4><p>${t(asText(x.bridge))}</p>` : ""}<p class="src">${x.sources} source${x.sources === 1 ? "" : "s"}, listed in section 12 (research ${t(x.id)}).</p></div>`).join("")}
${!shown.length ? `<p>${t(all[0] && all[0].x.missing ? all[0].x.missing : "[NEEDS: research on the role types for your target]")}</p>` : ""}
${later.length ? `<div class="ask"><h4>Ask next time</h4><p>${later.map((e) => t(e.x.subject)).join("; ")}.</p><p class="k">${e0(later)}</p></div>` : ""}
</section>`;
}
const e0 = (later) => (later.some((e) => e.x.missing) ? "These have no research yet, so nothing is written about them here. Each is listed in the box on page 1 as work to finish." : "These were researched but are not among the three closest to your target, so they are left out to keep the section short.");
const neededNote = (r) => { const b = String(r.needed_basis || ""); return !b || b === "not set" || b === "estimate" || !Number.isInteger(r.needed) ? "" : /^role model/.test(b) ? `Level needed from the ${b}.` : `Level needed from ${b}.`; };
function gapmap(m) {
  const s = m.s.s5;
  return `<section class="sec" id="s5">${head(m, "s5", "5")}
${needBlock(s.empty)}
${s.rows.length ? `<p>${s.counts.below} of ${s.counts.rows} skills are below the level asked, ${plural(s.counts.steps, "level step")} in all. Levels run from none yet (0) to leading (4). ${s.counts.unevidenced} rest on your own word only.${s.counts.not_assessed ? ` ${plural(s.counts.not_assessed, "skill")} ${s.counts.not_assessed === 1 ? "is" : "are"} not assessed yet and ${s.counts.not_assessed === 1 ? "is" : "are"} left out of those counts.` : ""}</p>
${fig(gapMap(m, { limit: 28 }), "Sorted with the biggest gap first. Solid means counted from a source, hatched means your own claim.", "Levels come from your CV, LinkedIn text, answers and research. The table below gives the evidence for each.")}
<table><tr><th style="width:26%">Skill</th><th style="width:22%">Role</th><th>Now against needed</th><th style="width:18%">Evidence</th></tr>${s.rows.map((r) => `<tr><td>${t(r.name)}</td><td>${t(r.role)}</td><td>${gapBar(r)}<span class="k">${t(levelsText(r))}</span>${r.note ? `<br><span class="k">${t(r.note)}</span>` : ""}${neededNote(r) ? `<br><span class="k">${t(neededNote(r))}</span>` : ""}</td><td class="src">${t(!isAssessed(r) ? "not assessed yet" : r.now === 0 && !(r.basis || []).length ? "no evidence yet" : r.no_source ? "no source yet" : r.evidence)}</td></tr>`).join("")}</table>` : ""}
</section>`;
}
function patterns(m) {
  const s = m.s.s6;
  const small = s.patterns.some((x) => x.of < 10);
  return `<section class="sec" id="s6">${head(m, "s6", "6")}
<p>Public patterns only: counted from public profiles, articles and job posts. No names, photos, contacts or links to people are kept.${small ? " Every sample here is small, so read each one as a hint, not a rule." : ""}</p>
${needBlock(s.empty)}
${fig(patternBars(m), small ? "Notice how many in each sample did this. The samples are small, so read each bar as a hint, not a rule." : "How many in each sample did this.", s.patterns.length ? `Counted from public profiles, articles and job posts, seen ${[...new Set(s.patterns.map((x) => human(x.retrieved)))].join(", ")}. The numbers are counts, never percentages.` : "")}
${s.patterns.map((x) => `<div class="card"><h4>${x.of < 10 ? `Small sample: ${x.of} counted. Indicative only` : `Sample of ${x.of}`}${x.level ? ` <span class="tier">${t(x.level)}</span>` : ""}${x.level_mismatch ? ` <span class="tier warn">different level: indicative</span>` : ""}</h4><p class="lead">${t(x.claim)}</p><p class="src">${x.n} of ${x.of}. Counted from: ${t(x.basis)} Seen on ${t(human(x.retrieved))}.${x.sources ? ` ${x.sources} public source${x.sources === 1 ? "" : "s"} in section 12.` : ""}</p></div>`).join("")}
</section>`;
}
function interviews(m) {
  const s = m.s.s7;
  const lost = (i) => {
    const eng = asText(i.not_learned) || asText(i.could_not_learn) || asText(i.unknown);
    if (eng) return eng;
    const qs = i.questions || [], bits = [];
    const open = qs.filter((q) => !q.outline.length || q.outline.every((o) => /\[NEEDS/.test(o.point))).length;
    if (qs.length < 6) bits.push(`only ${plural(qs.length, "likely question")} found`);
    if (open) bits.push(`${plural(open, "question")} still need a real example from you`);
    if (!(i.case_formats || []).length) bits.push("no case format found");
    if ((i.rounds || []).length < 2) bits.push("only one round found");
    return bits.length ? `${cap(bits.join("; "))}.` : "";
  };
  return `<section class="sec" id="s7">${head(m, "s7", "7")}
${needBlock(s.empty)}
${s.interviews.map((i) => `<h3 class="group-h">${t(i.subject)}${i.level ? ` <span class="tier">${t(i.level)}</span>` : ""}</h3><h4>Rounds</h4>${fig(interviewFlow(i), "Each box is one round, in the order you meet them.", `From research ${i.id}, listed in section 12.`)}${(i.rounds || []).length >= 2 ? "" : list(i.rounds, "round")}${(i.case_formats || []).length ? `<h4>Case formats</h4>${list(i.case_formats, "case format")}` : ""}${(i.questions || []).length ? `<h4>Likely questions (up to 6)</h4>${i.questions.slice(0, 6).map((q) => `<div class="card"><p><b>${t(q.q)}</b> <span class="src">Source: ${t(asText(q.source) || `research ${i.id}`)}</span></p><h4>What a good answer includes</h4>${q.outline.length ? `<ul>${q.outline.map((o) => `<li>${t(o.point)}${o.from ? ` <span class="src">(${t(o.from)})</span>` : ""}</li>`).join("")}</ul>` : `<p>${t("[NEEDS: a real example from your experience for this question]")}</p>`}</div>`).join("")}` : ""}${lost(i) ? `<p class="k"><b>What we could not learn:</b> ${t(lost(i))}</p>` : ""}<p class="src">Research ${t(i.id)}.</p>`).join("")}
<p class="k">Written prep only. A live mock interview runs when you ask for one.</p>
</section>`;
}
function plan(m) {
  const s = m.s.s8;
  const phases = planPhases(m);
  const f = fitFacts(m);
  const lane = (label, xs) => (xs.length ? `<div class="lane"><b>${label}</b> ${xs.map(t).join("; ")}</div>` : "");
  const range = (p) => `${p.a === p.b ? `Week ${p.a}` : `Weeks ${p.a} to ${p.b}`}${p.start ? `, ${human(p.start)} to ${human(p.end)}` : ""}${p.minutes ? `, about ${hoursOf(p.minutes)} hours` : ""}`;
  const weeksN = (s.weeks || []).length;
  return `<section class="sec" id="s8">${head(m, "s8", "8")}
${needBlock(s.empty)}
${phases.length ? `<p class="lead">${plural(phases.length, "phase")} over ${plural(weeksN || phases[phases.length - 1].b, "week")}: ${phases.map((p) => t(p.name)).join(", then ")}.</p>` : s.summary ? `<p class="lead">${t(s.summary)}</p>` : ""}
<p>${s.start ? `Starts ${t(human(s.start))}. ` : ""}${s.deadline ? `Your date: ${t(human(s.deadline))}. ` : ""}${s.hours !== null && s.hours !== undefined ? `Your hours: ${s.hours} a week.` : ""}</p>
<div class="card"><h4>Fit check</h4><p>${t(verdictOf(m))}</p>${f && f.weeks > 0 ? `<p class="k">${f.hrs} hours a week for ${plural(f.weeks, "week")} gives about ${f.haveH} hours. The gaps need about ${f.needH}${f.estimate ? " (an estimate: part of it comes from a default effort table, not a source)" : ""}. ${f.spareH >= 0 ? `Spare: about ${f.spareH} hours.` : `Short by about ${-f.spareH} hours.`}${f.planH !== null && f.planH !== undefined && f.fromEngine ? ` The plan below lists about ${f.planH} hours of tasks.` : ""}</p>` : ""}</div>
${fig(planTimeline(m), "Notice where the red line (your date) falls against the last phase, and where the green range sits.")}
${s.ready ? `<p>${t(readySentence(m))} ${t(confWords(s.ready.confidence))}. It rests on: ${t(s.ready.basis)}</p>` : ""}
${phases.map((p, i) => `<div class="card phase"><h3>Phase ${i + 1}: ${t(p.name)}<span class="k">${t(range(p))}</span></h3>${lane("Learn:", p.learn)}${lane("Deliverable:", p.deliverable)}<div class="lane"><b>Named proof:</b> ${p.proof.length ? p.proof.map(t).join("; ") : "not named yet"}</div></div>`).join("")}
</section>`;
}
const flag = (x) => {
  const lv = x.level_mismatch === true || x.level_match === false;
  const off = x.indicative === true || x.role_match === false || x.mismatch === true;
  return `${x.level ? `<span class="tier">${t(x.level)}</span> ` : ""}${lv ? `<span class="tier warn">different level: indicative</span> ` : ""}${off ? `<span class="tier warn">different role: indicative</span>` : ""}`;
};
function money(m) {
  const s = m.s.s9;
  const src = (x) => x.src.map((y) => `${t(y.name)}, seen ${t(y.retrieved)}`).join("; ");
  const abroadRow = (s.market || []).find((x) => x.subject === "Roles abroad");
  const payLine = asText(s.pay_move) || asText(((s.market || []).find((x) => x.id === "pay-move") || {}).claim);
  return `<section class="sec" id="s9">${head(m, "s9", "9")}
<p>Every figure shows its source and the date it was seen. Money is in rupees with Indian digit grouping. Treat figures as a guide that changes.</p>
${needBlock(s.empty)}
${s.salary.length ? `<h3>Salary bands</h3>${fig(salaryBands(m), "Bands are as the sources state them.", salarySources(m).map((y) => `${y.name}, seen ${y.retrieved}`).join("; "))}<table><tr><th>Role</th><th>Where</th><th>Figure</th><th>Source</th></tr>${s.salary.map((x) => `<tr><td>${t(x.subject)} ${flag(x)}</td><td>${t(x.region)}</td><td>${t(inr(x.claim))}</td><td class="src">${src(x)}</td></tr>`).join("")}</table>` : ""}
${s.market.length ? `<h3>Where hiring is happening</h3><table><tr><th>Area</th><th>What the source says</th><th>Source</th></tr>${s.market.filter((x) => x.id !== "pay-move" && x.id !== "your-answer").map((x) => `<tr><td>${t(x.subject)} ${flag(x)}</td><td>${t(inr(x.claim))}</td><td class="src">${src(x)}</td></tr>`).join("")}</table>` : `<p>${t("[NEEDS: where hiring is happening in India and for remote roles abroad, with sources and dates]")}</p>`}
${abroadRow ? `<div class="card"><h4>Roles abroad</h4><p>${t(abroadRow.claim)}</p><p class="src">${src(abroadRow)}</p></div>` : ""}
${payLine ? `<h3>What this move does to your pay</h3><p>${t(payLine)}</p><p class="k">Level matched ranges only, from the salary research above. Your own pay is never printed.</p>` : ""}
${s.arrangements || s.auth ? `<h3>Your constraints</h3><table>${s.arrangements ? `<tr><td style="width:36%">Work arrangements you accept</td><td>${t(s.arrangements)}</td></tr>` : ""}${s.auth ? `<tr><td>Work authorisation for abroad</td><td>${t(s.auth)}</td></tr>` : ""}</table>` : ""}
</section>`;
}
function reading(m) {
  const s = m.s.s10;
  return `<section class="sec" id="s10">${head(m, "s10", "10")}
<p>Scored 1 to 5 for how well each fits your gaps. The score is an estimate.</p>
${needBlock(s.empty)}
${s.items.length ? `<table><tr><th style="width:8%">Score</th><th>Title</th><th style="width:14%">Kind</th><th>Why</th></tr>${s.items.map((x) => `<tr><td>${x.score} of 5</td><td>${t(x.title)}${x.url ? `<br><span class="src">${link(x.url)}, seen ${t(x.retrieved)}</span>` : ""}</td><td>${t(x.medium)}</td><td>${t(x.why)}</td></tr>`).join("")}</table>` : ""}
</section>`;
}
function findout(m) {
  const s = m.s.s11;
  return `<section class="sec" id="s11">${head(m, "s11", "11")}
<p>Questions that could not be answered yet. Each is a small task. They are filled in later.</p>
${s.tasks.length ? `<table><tr><th style="width:8%">Done</th><th>Task</th><th>Why it matters</th></tr>${s.tasks.map((x) => `<tr><td>[ ]</td><td>${t(x.text)}</td><td>${t(x.why)}</td></tr>`).join("")}</table>` : "<p>Nothing is open from the interview.</p>"}
${finishBox(m)}
${m.meta.needs ? `<p class="k">${m.meta.needs} fact${m.meta.needs === 1 ? " is" : "s are"} still missing in this document. Each shows in yellow where it belongs, and the box on page 1 says who to ask.</p>` : ""}
</section>`;
}
/** One row per source: the same url (or label) is listed once, with every research item that used it. */
function dedupe(sources) {
  const by = new Map();
  for (const x of sources) {
    const key = norm(x.url || x.label);
    const cur = by.get(key);
    if (!cur) by.set(key, { ...x, refs: x.ref ? [x.ref] : [] });
    else { if (x.ref && !cur.refs.includes(x.ref)) cur.refs.push(x.ref); if (x.tier && (!cur.tier || x.tier < cur.tier)) cur.tier = x.tier; if (!cur.published && x.published) cur.published = x.published; if (!cur.retrieved && x.retrieved) cur.retrieved = x.retrieved; }
  }
  return [...by.values()];
}
function sources(m) {
  const s = m.s.s12;
  const rows = dedupe(s.sources || []);
  return `<section class="sec" id="s12">${head(m, "s12", "12")}
<p>${t(s.note)}</p>
<table><tr><th>Source</th><th style="width:7%">Tier</th><th style="width:15%">Seen</th><th style="width:15%">Published</th><th style="width:16%">Used in</th></tr>${rows.map((x) => `<tr><td>${t(x.label)}${x.url ? `<br><span class="src">${link(x.url)}</span>` : ""}${x.note ? `<br><span class="src">${t(x.note)}</span>` : ""}</td><td>${x.tier ? `<span class="tier">${x.tier}</span>` : ""}</td><td>${t(human(x.retrieved || ""))}</td><td>${t(human(x.published || ""))}</td><td class="src">${x.refs.length ? t(x.refs.map((r) => `research ${r}`).join(", ")) : ""}</td></tr>`).join("")}</table>
</section>`;
}

/** The full HTML document of one report. */
export function renderMini(m, opts = {}) {
  const needs = m.meta.needs;
  const draft = opts.stamp === undefined ? needs > 0 : opts.stamp === true;
  const title = `${m.meta.name} - G mini report`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(undash(title))}</title>
<style>${CV_CSS}${MINI_CSS}</style>
</head>
<body>
<div class="page">
<div class="cover"><h1>${t(m.meta.name)}</h1><div class="role">Your G mini report</div><div class="meta">Made ${t(human(m.meta.date))}. Market: ${t(m.meta.market)}.</div></div>
${summary(m)}
${now(m)}
${want(m)}
${types(m)}
${gapmap(m)}
${patterns(m)}
${interviews(m)}
${plan(m)}
${money(m)}
${reading(m)}
${findout(m)}
${sources(m)}
${draft ? `<div class="stamp">Draft: ${needs} fact${needs === 1 ? "" : "s"} still needed</div>` : ""}
</div>
</body>
</html>
`;
}

/** The text a reader sees (tags and styles removed). */
export function visibleMini(html) {
  return String(html).replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<title>[\s\S]*?<\/title>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}
