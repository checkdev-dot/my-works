// Inline SVG charts for the Growth mini report. Pure: no node built-ins, no clock, no files, no scripts, no external assets.
// Every chart takes the report model (lib/mini.mjs buildReportModel) and returns an SVG string, or "" when its data is missing (the report
// then shows the [NEEDS: ...] line its section already carries). No number is invented: every figure printed is in the model, or is the
// plain sum / difference of model figures (hours needed against hours had, minutes a week, weeks to a date). Colour never carries meaning
// alone: every colour has a label, solid against hatched marks counted against claimed, so it reads in greyscale.
// ViewBox width is 680 units, shown 182 mm wide, so 12 units is about 9 pt.

const INK = "#1d1d1b", GREEN = "#2f6b4f", GREEN_T = "#cfe3d8", AMBER = "#e9d27a", AMBER_D = "#8a6d00", TRACK = "#ecece6", LINE = "#bdbdb4", MUTE = "#555";
const BLUE = "#3b6ea5", BLUE_T = "#cddff0", RUST = "#a4452f", RUST_T = "#f1d9c4";
const FONT = 'font-family="Arial, Helvetica, sans-serif"';
export const W = 680;
export const LEVELS = ["none yet", "starting", "working", "strong", "leading"];

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const undash = (s) => String(s ?? "").replace(/\s*[–—]\s*/g, " - ");
const clean = (s) => esc(undash(s));
const isNeed = (s) => /\[NEEDS/.test(String(s ?? ""));
const num = (n) => String(Math.round(n * 10) / 10);

/** Greedy word wrap to at most maxChars per line and maxLines lines (the last line ends in "..." when cut). */
export function wrap(text, maxChars, maxLines = 3) {
  const words = undash(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (let w of words) {
    while (w.length > maxChars) { if (cur) { lines.push(cur); cur = ""; } lines.push(w.slice(0, maxChars)); w = w.slice(maxChars); }
    if (!cur) cur = w; else if ((cur + " " + w).length <= maxChars) cur += " " + w; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const keep = lines.slice(0, maxLines); keep[maxLines - 1] = keep[maxLines - 1].slice(0, Math.max(1, maxChars - 3)).replace(/\s+$/, "") + "..."; return keep; }
  return lines;
}
const MIN_SIZE = 11.5; // 11.5 units is about 8.7 pt on the page: nothing in a chart is smaller
const tx = (x, y, lines, { size: size0 = 12, anchor = "start", weight = "400", fill = INK, lh = 1.25, halo = false } = {}) => {
  const size = Math.max(size0, MIN_SIZE);
  const ls = Array.isArray(lines) ? lines : [lines];
  return `<text x="${num(x)}" y="${num(y)}" ${FONT} font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${halo ? ' stroke="#ffffff" stroke-width="4" paint-order="stroke" stroke-linejoin="round"' : ""}>${ls.map((l, i) => `<tspan x="${num(x)}" dy="${i === 0 ? 0 : num(size * lh)}">${clean(l)}</tspan>`).join("")}</text>`;
};
const svg = (h, body, label, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${num(h)}" width="100%" role="img" aria-label="${clean(label)}" class="chart"><title>${clean(label)}</title>${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>`;
const hatch = (id, color) => `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#ffffff"/><line x1="0" y1="0" x2="0" y2="6" stroke="${color}" stroke-width="2.6"/></pattern>`;
const arrowDef = (id) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${INK}"/></marker>`;

// ---- dates ----------------------------------------------------------------------------------------------------------------------------
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const dayN = (s) => { const [y, m, d] = String(s).split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---- 1a. you are here, bridge, target --------------------------------------------------------------------------------------------------
function currentRole(m) {
  const w = m.s.s1.where;
  if (isNeed(w)) return null;
  const hit = String(w).match(/ works as (.+?)\.?$/);
  return hit ? hit[1] : null;
}
const gapSteps = (r) => r.needed - r.now;
/** A row counts as assessed when its level now is a whole number and the engine has not marked it "not assessed". */
export const isAssessed = (r) => Number.isInteger(r.now) && Number.isInteger(r.needed) && !r.not_assessed && r.assessed !== false;
const normT = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
/** The path from the current role to the target roles. Each bridge box is one skill to close for ONE target and is joined to that target only. */
export function pathDiagram(m) {
  const role = currentRole(m);
  const targets = (m.s.s1.want || []).filter((x) => !isNeed(x));
  const allRows = m.s.s5.rows || [];
  if (!role || !targets.length || !allRows.length) return "";
  const rows = allRows.filter((r) => isAssessed(r) && r.needed > r.now);
  const tg = targets.slice(0, 4);
  const perTarget = tg.length > 2 ? 1 : 2;
  // A research bridge role (s4.types[].bridge) is drawn as the first box of its target, in a different fill.
  const bridgeRole = (t) => { const hit = (m.s.s4.types || []).find((x) => x.bridge && !isNeed(x.bridge) && typeFits(x.subject, [t])); return hit ? String(hit.bridge).replace(/s+/g, " ").trim() : ""; };
  const groups = tg.map((t) => {
    const by = new Map();
    for (const r of rows) if (normT(r.role) === normT(t)) { const cur = by.get(r.name); if (!cur || gapSteps(r) > gapSteps(cur)) by.set(r.name, r); }
    const br = bridgeRole(t);
    return { target: t, role_bridge: br, bridge: [...by.values()].sort((a, b) => gapSteps(b) - gapSteps(a) || a.name.localeCompare(b.name)).slice(0, br ? 1 : perTarget) };
  });
  const bx = [0, 250, 495], bw = 185, LH = 15.5, SH = 14, gap = 12, minH = 52;
  const roleBox = (txt) => { const title = wrap(`First step: ${txt.split(/s+befores+|:s/)[0].replace(/.$/, "")}`, 21, 5); return { title, sub: [], h: Math.max(minH, 14 + title.length * LH + 8), role: true }; };
  const bridgeBox = (r) => { const title = wrap(`Build ${r.name}`, 21, 3), sub = wrap(`${LEVELS[r.now]} to ${LEVELS[r.needed]}`, 26, 1); return { title, sub, h: Math.max(minH, 14 + title.length * LH + 6 + sub.length * SH + 6) }; };
  const targetBox = (t) => { const title = wrap(t, 21, 3); return { title, sub: [], h: Math.max(minH, 16 + title.length * LH + 8) }; };
  let y = 30;
  const laid = groups.map((g) => {
    const bs = [...(g.role_bridge ? [roleBox(g.role_bridge)] : []), ...g.bridge.map(bridgeBox)], tb = targetBox(g.target);
    const stack = bs.reduce((a, b) => a + b.h, 0) + Math.max(0, bs.length - 1) * gap;
    const band = Math.max(stack, tb.h);
    let by = y + (band - stack) / 2;
    const bpos = bs.map((b) => { const p = { ...b, y: by }; by += b.h + gap; return p; });
    const out = { g, band, y, bpos, t: { ...tb, y: y + (band - tb.h) / 2 } };
    y += band + gap + 6;
    return out;
  });
  const H = y - gap - 6 + 6;
  const roleLines = wrap(role, 21, 4), roleH = Math.max(minH, 16 + roleLines.length * LH + 8), roleY = 30 + (H - 36 - roleH) / 2;
  let body = "";
  body += tx(bx[0], 16, "You are here", { size: 12, weight: "700", fill: GREEN });
  body += tx(bx[1], 16, "Bridge: close these gaps", { size: 12, weight: "700", fill: GREEN });
  body += tx(bx[2], 16, tg.length === 1 ? "Target" : "Targets", { size: 12, weight: "700", fill: GREEN });
  const box = (x, yy, h, lines, sub, { fill = "#ffffff", stroke = LINE, sw = 1.2, bold = true } = {}) => `<rect x="${x}" y="${num(yy)}" width="${bw}" height="${num(h)}" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>${tx(x + 10, yy + 20, lines, { size: 12.5, weight: bold ? "700" : "400", lh: LH / 12.5 })}${sub.length ? tx(x + 10, yy + 20 + (lines.length - 1) * LH + 17, sub, { size: 11.5, fill: MUTE, lh: SH / 11.5 }) : ""}`;
  body += box(bx[0], roleY, roleH, roleLines, [], { fill: GREEN_T, stroke: GREEN, sw: 1.8 });
  const arrow = (x1, y1, x2, y2) => `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${INK}" stroke-width="1.6" marker-end="url(#pa)"/>`;
  const from = roleY + roleH / 2;
  for (const L of laid) {
    body += box(bx[2], L.t.y, L.t.h, L.t.title, [], { fill: AMBER + "55", stroke: AMBER_D, sw: 1.8 });
    const ty = L.t.y + L.t.h / 2;
    if (!L.bpos.length) { body += arrow(bx[0] + bw + 2, from, bx[2] - 4, ty); continue; }
    for (const b of L.bpos) {
      body += box(bx[1], b.y, b.h, b.title, b.sub, b.role ? { fill: BLUE_T, stroke: BLUE, sw: 1.6 } : undefined);
      body += arrow(bx[0] + bw + 2, from, bx[1] - 4, b.y + b.h / 2);
      body += arrow(bx[1] + bw + 2, b.y + b.h / 2, bx[2] - 4, ty);
    }
  }
  const names = groups.flatMap((g) => [...(g.role_bridge ? [g.role_bridge] : []), ...g.bridge.map((r) => r.name)]);
  return svg(Math.max(H, 30 + roleH + 8), body, `Path from ${role} through ${names.length ? names.join(" and ") : "no gap"} to ${tg.join(", ")}`, arrowDef("pa"));
}

// ---- 1b. ready date range, with today and your date marked ------------------------------------------------------------------------------
/** Month ticks on a date axis: every month for a short span, every 2 or 3 months for a long one. */
function monthTicks(lo, hi, x0, x1, axisY) {
  let body = `<line x1="${x0}" y1="${axisY}" x2="${x1}" y2="${axisY}" stroke="${LINE}" stroke-width="1.2"/>`;
  const spanM = (hi - lo) / 30.4, step = spanM > 18 ? 3 : spanM > 9 ? 2 : 1;
  const start = new Date(lo * 86400000); let y = start.getUTCFullYear(), mo = start.getUTCMonth() + 1, k = 0;
  for (let guard = 0; guard < 80; guard += 1, mo += 1) {
    if (mo > 11) { mo = 0; y += 1; }
    const d = Date.UTC(y, mo, 1) / 86400000;
    if (d > hi) break; if (d < lo) continue;
    if (k % step === 0) { const x = x0 + ((d - lo) / (hi - lo)) * (x1 - x0); body += `<line x1="${num(x)}" y1="${axisY}" x2="${num(x)}" y2="${axisY + 5}" stroke="${MUTE}" stroke-width="1"/>${tx(x, axisY + 18, `${MONTHS[mo]} ${y}`, { size: 11.5, anchor: "middle", fill: MUTE })}`; }
    k += 1;
  }
  return body;
}
/** A date axis with the ready range as a green bar, today as a black marker and your date as a solid red line. Labels sit on separate rows so none overlap. */
export function readyBar(m) {
  const rd = m.s.s8.ready;
  const today = m.meta.date, dl = m.s.s8.deadline || m.meta.deadline;
  if (!rd || !isDate(rd.from) || !isDate(rd.to) || !isDate(today)) return "";
  const pts = [today, rd.from, rd.to, ...(isDate(dl) ? [dl] : [])].map(dayN);
  const lo0 = Math.min(...pts), hi0 = Math.max(...pts), pad = Math.max(7, (hi0 - lo0) * 0.04);
  const lo = lo0 - pad, hi = hi0 + pad, x0 = 24, x1 = W - 24;
  const X = (d) => x0 + ((dayN(d) - lo) / (hi - lo)) * (x1 - x0);
  const barY = 92, barH = 24, axisY = 168;
  const xtd = X(today), xd = isDate(dl) ? X(dl) : null;
  const near = xd !== null && Math.abs(xd - xtd) < 170;
  let body = monthTicks(lo, hi, x0, x1, axisY);
  const xf = X(rd.from), xt = X(rd.to);
  let lab = "";
  body += `<rect x="${num(xf)}" y="${barY}" width="${num(Math.max(3, xt - xf))}" height="${barH}" rx="4" fill="${GREEN}"/>`;
  if (xt - xf > 190) body += tx((xf + xt) / 2, barY + 16, "likely ready in this range", { size: 11.5, anchor: "middle", fill: "#ffffff", weight: "700" });
  lab += tx(xf, barY + barH + 17, `Earliest ${rd.from}`, { halo: true, size: 12, anchor: xf > x1 - 140 ? "end" : "start", weight: "700" });
  lab += tx(xt, barY + barH + 36, `Latest ${rd.to}`, { halo: true, size: 12, anchor: xt < x0 + 140 ? "start" : "end", weight: "700" });
  body += `<line x1="${num(xf)}" y1="${barY + barH}" x2="${num(xf)}" y2="${barY + barH + 6}" stroke="${INK}" stroke-width="1"/><line x1="${num(xt)}" y1="${barY + barH}" x2="${num(xt)}" y2="${barY + barH + 25}" stroke="${INK}" stroke-width="1"/>`;
  body += `<path d="M${num(xtd - 6)},${barY - 22} L${num(xtd + 6)},${barY - 22} L${num(xtd)},${barY - 10} z" fill="${INK}"/><line x1="${num(xtd)}" y1="${barY - 10}" x2="${num(xtd)}" y2="${axisY}" stroke="${INK}" stroke-width="1.6"/>`;
  body += tx(xtd, 16, `Today ${today}`, { size: 12, anchor: xtd > x1 - 90 ? "end" : xtd < x0 + 60 ? "start" : "middle", weight: "700" });
  if (xd !== null) {
    const ly = near ? 36 : 16;
    body += `<line x1="${num(xd)}" y1="${ly + 6}" x2="${num(xd)}" y2="${axisY}" stroke="#ffffff" stroke-width="6"/><line x1="${num(xd)}" y1="${ly + 6}" x2="${num(xd)}" y2="${axisY}" stroke="${RUST}" stroke-width="2.6"/>`;
    body += tx(xd, ly, `Your date ${dl}`, { size: 12, anchor: xd > x1 - 90 ? "end" : xd < x0 + 60 ? "start" : "middle", weight: "700", fill: RUST });
  }
  body += lab;
  return svg(axisY + 30, body, `Ready between ${rd.from} and ${rd.to}, today is ${today}${isDate(dl) ? `, your date is ${dl}` : ""}`);
}

// ---- 1c. fit gauge: hours needed against hours you have --------------------------------------------------------------------------------
/** The same sum as the fit check in lib/mini.mjs: whole weeks from the start to your date, times your hours, against the plan hours. */
export function fitFacts(m) {
  const s = m.s.s8, today = m.meta.date;
  const dl = s.deadline || m.meta.deadline, hrs = s.hours ?? m.meta.hours;
  if (!isDate(dl) || hrs === null || hrs === undefined || !(s.weeks || []).length) return null;
  const start = s.start && s.start > today ? s.start : (s.start || today);
  if (!isDate(start)) return null;
  const weeks = Math.floor((dayN(dl) - dayN(start)) / 7);
  // The engine's fit check (lib/mini.mjs timeFit) is the one source: the chart and the verdict sentence read the same figures.
  const d = s.fit_detail;
  if (d && Number.isFinite(d.need_hours)) {
    const needH = Math.round(d.need_hours * 10) / 10;
    const haveH = Number.isFinite(d.have_hours) ? Math.round(d.have_hours * 10) / 10 : 0;
    const spareH = Math.round((haveH - needH) * 10) / 10;
    const status = ["fits", "tight", "no"].includes(d.status) ? d.status : (weeks <= 0 || needH > haveH ? "no" : "fits");
    return { weeks: Number.isFinite(d.weeks) ? d.weeks : weeks, hrs, needH, haveH, spareH, status, start, dl, estimate: d.estimate === true, planH: Number.isFinite(d.plan_hours) ? d.plan_hours : null, readyStatus: d.ready_status || null, fromEngine: true };
  }
  // No engine figure (an older model): the plain sum of the plan's minutes against the hours you have. No own "tight" rule.
  const needMin = s.weeks.reduce((a, w) => a + [...w.learn, ...w.make, ...w.prove].reduce((x, t) => x + t.minutes, 0), 0);
  const needH = Math.round((needMin / 60) * 10) / 10;
  const haveH = weeks > 0 ? Math.round(weeks * hrs * 10) / 10 : 0;
  const spareH = Math.round((haveH - needH) * 10) / 10;
  const status = weeks <= 0 || needH > haveH ? "no" : "fits";
  return { weeks, hrs, needH, haveH, spareH, status, start, dl, estimate: false, planH: needH, readyStatus: null, fromEngine: false };
}
/** Two filled bars of one colour family: hours the plan needs (dark) against hours you have (light), then the spare or short hours in words. */
export function fitGauge(m) {
  const f = fitFacts(m);
  if (!f) return "";
  const short = f.spareH < 0 || f.weeks <= 0;
  const color = short ? RUST : GREEN, tint = short ? RUST_T : GREEN_T;
  const max = Math.max(f.needH, f.haveH, 1) * 1.08, x0 = 215, x1 = 560;
  const bw = (v) => Math.max(2, ((v / max) * (x1 - x0)));
  let body = "";
  body += tx(0, 38, [f.estimate ? "Hours the gaps need (estimate)" : "Hours the gaps need"], { size: 12.5, weight: "700" });
  body += `<rect x="${x0}" y="22" width="${num(bw(f.needH))}" height="24" rx="4" fill="${f.estimate ? "url(#fgE)" : color}" stroke="${color}" stroke-width="1.6"/>${tx(x0 + bw(f.needH) + 8, 39, `${f.estimate ? "about " : ""}${num(f.needH)} hours`, { size: 12.5, weight: "700" })}`;
  body += tx(0, 82, f.weeks > 0 ? ["Hours you have by your date"] : ["Hours you have"], { size: 12.5, weight: "700" });
  if (f.weeks > 0) {
    body += `<rect x="${x0}" y="66" width="${num(bw(f.haveH))}" height="24" rx="4" fill="${tint}" stroke="${color}" stroke-width="1.6"/>${tx(x0 + bw(f.haveH) + 8, 83, `${num(f.haveH)} hours`, { size: 12.5, weight: "700" })}`;
    body += tx(0, 108, [`${f.hrs} hours a week for ${f.weeks} weeks, from ${f.start} to ${f.dl}`], { size: 11.5, fill: MUTE });
    body += tx(0, 130, f.spareH >= 0 ? `Spare: ${num(f.spareH)} hours` : `Short by ${num(-f.spareH)} hours`, { size: 13, weight: "700", fill: f.spareH >= 0 ? GREEN : RUST });
  } else body += tx(x0, 83, `Your date ${f.dl} comes before the plan can start (${f.start}).`, { size: 12, fill: RUST });
  return svg(f.weeks > 0 ? 142 : 100, body, `The gaps need ${f.estimate ? "about " : ""}${num(f.needH)} hours${f.estimate ? " (an estimate)" : ""}, you have ${num(f.haveH)} hours by your date: ${f.weeks > 0 ? (f.spareH >= 0 ? `${num(f.spareH)} spare` : `${num(-f.spareH)} short`) : "the date comes first"}`, f.estimate ? hatch("fgE", color) : "");
}

// ---- 2. gap map ------------------------------------------------------------------------------------------------------------------------
const evidenced = (r) => Array.isArray(r.basis) && r.basis.length > 0 && !r.no_source;
let uid = 0;
/** One bar per skill and role: level now (solid when counted, hatched when claimed) against the level needed. Sorted by gap. Chunks of 14. */
export function gapMap(m, { limit = 14, chunk = 14, order = true } = {}) {
  const all = (m.s.s5.rows || []).filter((r) => Number.isInteger(r.needed));
  if (!all.length) return "";
  const rows = (order ? [...all].sort((a, b) => (isAssessed(b) ? 1 : 0) - (isAssessed(a) ? 1 : 0) || (isAssessed(a) ? gapSteps(b) - gapSteps(a) : 0) || a.name.localeCompare(b.name) || a.role.localeCompare(b.role)) : all).slice(0, limit);
  const out = [];
  for (let c = 0; c < rows.length; c += chunk) out.push(gapChunk(rows.slice(c, c + chunk), c === 0));
  return out.join("");
}
function gapChunk(rows, first) {
  uid += 1;
  const id = `hg${uid}`;
  const x0 = 236, seg = 58, rowH = 38, top = 26;
  const H = top + rows.length * rowH + 36;
  let body = "";
  for (let l = 0; l <= 4; l += 1) body += `<line x1="${x0 + l * seg}" y1="${top - 4}" x2="${x0 + l * seg}" y2="${top + rows.length * rowH - 6}" stroke="${LINE}" stroke-width="0.8" stroke-dasharray="2 3"/>${tx(x0 + l * seg, top - 9, String(l), { size: 11, anchor: "middle", fill: MUTE })}`;
  body += tx(0, top - 9, first ? "Skill and role (levels 0 none yet to 4 leading)" : "Skill and role", { size: 11, fill: MUTE });
  rows.forEach((r, i) => {
    const y = top + i * rowH, by = y + 4, bh = 16;
    body += tx(0, y + 13, wrap(r.name, 34, 1), { size: 12.5, weight: "700" });
    body += tx(0, y + 27, wrap(r.role, 40, 1), { size: 11, fill: MUTE });
    body += `<rect x="${x0}" y="${by}" width="${4 * seg}" height="${bh}" rx="3" fill="${TRACK}"/>`;
    const na = !isAssessed(r);
    if (!na && r.now > 0) body += evidenced(r) ? `<rect x="${x0}" y="${by}" width="${r.now * seg}" height="${bh}" rx="3" fill="${GREEN}"/>` : `<rect x="${x0}" y="${by}" width="${r.now * seg}" height="${bh}" rx="3" fill="url(#${id})" stroke="${GREEN}" stroke-width="1.4"/>`;
    if (!na && r.needed > r.now) body += `<rect x="${x0 + r.now * seg}" y="${by}" width="${(r.needed - r.now) * seg}" height="${bh}" fill="${AMBER}" stroke="${AMBER_D}" stroke-width="1" stroke-dasharray="3 2"/>`;
    if (!na) body += `<line x1="${x0 + r.needed * seg}" y1="${by - 4}" x2="${x0 + r.needed * seg}" y2="${by + bh + 4}" stroke="${INK}" stroke-width="2.4"/>`;
    if (na) { body += tx(x0 + 4 * seg + 14, y + 13, `not assessed yet, ${LEVELS[r.needed]} needed`, { size: 11.5 }); body += tx(x0 + 4 * seg + 14, y + 27, "no level counted yet", { size: 11.5, fill: MUTE }); return; }
    body += tx(x0 + 4 * seg + 14, y + 13, r.now === 0 ? `no evidence yet, ${LEVELS[r.needed]} needed` : `${LEVELS[r.now]} now, ${LEVELS[r.needed]} needed`, { size: 11.5 });
    body += tx(x0 + 4 * seg + 14, y + 27, evidenced(r) ? "counted: a source backs it" : r.now === 0 ? "a source is still needed" : "claimed: your word only", { size: 11.5, fill: MUTE });
  });
  const ly = top + rows.length * rowH + 8;
  const sw = (x, inner, label) => `${inner}${tx(x + 22, ly + 10, label, { size: 11, fill: MUTE })}`;
  body += sw(0, `<rect x="0" y="${ly}" width="16" height="12" fill="${GREEN}"/>`, "counted level");
  body += sw(130, `<rect x="130" y="${ly}" width="16" height="12" fill="url(#${id})" stroke="${GREEN}" stroke-width="1.2"/>`, "claimed level");
  body += sw(262, `<rect x="262" y="${ly}" width="16" height="12" fill="${AMBER}" stroke="${AMBER_D}" stroke-dasharray="3 2"/>`, "gap to the level needed");
  body += sw(452, `<line x1="458" y1="${ly - 2}" x2="458" y2="${ly + 14}" stroke="${INK}" stroke-width="2.4"/>`, "level the role asks for");
  return svg(H, body, `Skill levels now against needed for ${rows.length} skill rows, counted solid and claimed hatched`, hatch(id, GREEN));
}

// ---- 3. role types grid -----------------------------------------------------------------------------------------------------------------
const STOP = new Set(["consultant", "specialist", "senior", "junior", "associate", "partner", "officer", "executive", "director", "roles", "role", "lead", "head", "with", "versus", "business", "professional", "advisor", "adviser"]);
const stems = (s) => new Set(String(s || "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 5)));
/** A role type fits when it shares a word (first five letters) with a target role title. */
export function typeFits(subject, targets) {
  const a = stems(subject);
  return (targets || []).some((t) => { const b = stems(t); return [...a].some((x) => b.has(x)); });
}
const firstSentence = (s) => { const t = undash(s).replace(/\s+/g, " ").trim(); const m = t.match(/^(.+?[.!?])(\s|$)/); return m ? m[1] : t; };
export function roleGrid(m) {
  const types = m.s.s4.types || [];
  if (types.length < 2) return "";
  const targets = (m.s.s3.targets || []).map((t) => t.title);
  const colW = 330, gapX = 20, h = 82, gapY = 12;
  let body = "", fitN = 0;
  types.forEach((x, i) => {
    const col = i % 2, row = Math.floor(i / 2), X = col * (colW + gapX), Y = row * (h + gapY);
    const fits = typeFits(x.subject, targets); if (fits) fitN += 1;
    body += `<rect x="${X}" y="${Y}" width="${colW}" height="${h}" rx="7" fill="${fits ? GREEN_T : "#ffffff"}" stroke="${fits ? GREEN : LINE}" stroke-width="${fits ? 2.2 : 1.2}"${x.missing ? ' stroke-dasharray="5 3"' : ""}/>`;
    body += tx(X + 10, Y + 19, wrap(x.subject, 44, 2), { size: 12.5, weight: "700" });
    const tl = wrap(x.subject, 44, 2).length;
    body += tx(X + 10, Y + 19 + tl * 15 + 2, x.missing ? ["Research still to do"] : wrap(firstSentence(x.what), 56, 2), { size: 11.5, fill: x.missing ? MUTE : INK });
    if (fits) body += `<rect x="${X + colW - 86}" y="${Y + 8}" width="76" height="18" rx="9" fill="${GREEN}"/>${tx(X + colW - 48, Y + 21, "Fits you", { size: 11, anchor: "middle", weight: "700", fill: "#ffffff" })}`;
  });
  const rows = Math.ceil(types.length / 2), H = rows * (h + gapY) + 22;
  body += `<rect x="0" y="${H - 16}" width="16" height="12" rx="2" fill="${GREEN_T}" stroke="${GREEN}" stroke-width="2"/>${tx(24, H - 6, "Fits you: shares a word with a target role you named", { size: 11, fill: MUTE })}<rect x="340" y="${H - 16}" width="16" height="12" rx="2" fill="#ffffff" stroke="${LINE}" stroke-dasharray="4 2"/>${tx(364, H - 6, "Dashed: research still to do", { size: 11, fill: MUTE })}`;
  return svg(H, body, `${types.length} role types, ${fitN} marked as fitting you`);
}

// ---- 4. how others made the jump --------------------------------------------------------------------------------------------------------
export function patternBars(m) {
  const ps = (m.s.s6.patterns || []).filter((p) => Number.isFinite(p.n) && Number.isFinite(p.of) && p.of > 0);
  if (!ps.length) return "";
  const rows = [...ps].sort((a, b) => b.n / b.of - a.n / a.of);
  const x0 = 300, bw = 260, rowH = 44;
  let body = "";
  rows.forEach((p, i) => {
    const y = 8 + i * rowH;
    body += tx(0, y + 14, wrap(p.claim, 46, 2), { size: 12 });
    body += `<rect x="${x0}" y="${y + 2}" width="${bw}" height="18" rx="3" fill="${TRACK}"/><rect x="${x0}" y="${y + 2}" width="${num(Math.max(2, (p.n / p.of) * bw))}" height="18" rx="3" fill="${GREEN}"/>`;
    body += tx(x0 + bw + 10, y + 16, `${p.n} of ${p.of}`, { size: 12.5, weight: "700" });
  });
  const H = 8 + rows.length * rowH + 4;
  return svg(H, body, `How many in each sample showed each pattern: ${rows.map((p) => `${p.n} of ${p.of}`).join(", ")}`);
}

// ---- 5. interview flow ------------------------------------------------------------------------------------------------------------------
export function interviewFlow(iv) {
  const rounds = (iv.rounds || []).filter(Boolean);
  if (rounds.length < 2) return "";
  const per = 4, bw = 140, gx = 40, bh = 70, gy = 34;
  const nRows = Math.ceil(rounds.length / per), H = nRows * bh + (nRows - 1) * gy + 4;
  uid += 1; const aid = `fa${uid}`;
  let body = "";
  const pos = (i) => ({ x: (i % per) * (bw + gx), y: Math.floor(i / per) * (bh + gy) });
  rounds.forEach((r, i) => {
    const { x, y } = pos(i);
    body += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="7" fill="${i === rounds.length - 1 ? GREEN_T : "#ffffff"}" stroke="${i === rounds.length - 1 ? GREEN : LINE}" stroke-width="1.6"/>`;
    body += `<circle cx="${x + 16}" cy="${y + 17}" r="10" fill="${GREEN}"/>${tx(x + 16, y + 21, String(i + 1), { size: 11.5, anchor: "middle", weight: "700", fill: "#ffffff" })}`;
    body += tx(x + 32, y + 21, wrap(r, 17, 4), { size: 11.5, weight: "700" });
    if (i < rounds.length - 1) {
      const n = pos(i + 1);
      if (n.y === y) body += `<line x1="${x + bw + 2}" y1="${y + bh / 2}" x2="${n.x - 4}" y2="${y + bh / 2}" stroke="${INK}" stroke-width="1.6" marker-end="url(#${aid})"/>`;
      else body += `<path d="M${x + bw / 2},${y + bh + 2} V${y + bh + gy / 2} H${n.x + bw / 2} V${n.y - 4}" fill="none" stroke="${INK}" stroke-width="1.6" marker-end="url(#${aid})"/>`;
    }
  });
  return svg(H, body, `Interview rounds for ${iv.subject}: ${rounds.join(", then ")}`, arrowDef(aid));
}

// ---- 6. plan phases and the timeline of them ----------------------------------------------------------------------------------------------
const addDays = (iso, n) => new Date((dayN(iso) + n) * 86400000).toISOString().slice(0, 10);
const cleanLane = (t) => undash(t).replace(/\s*\(week \d+\)\s*/i, " ").replace(/^Study:\s*/i, "").replace(/\s+/g, " ").trim();
const texts = (x) => (Array.isArray(x) ? x : x ? [x] : []).map((y) => (y && typeof y === "object" ? y.text : y)).filter(Boolean).map(String);
const uniq = (xs) => { const seen = new Set(), out = []; for (const x of xs) { const k = x.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(x); } } return out; };
/**
 * The plan as four to six phases. When the engine gives phases (plan.phases) they are used as given; otherwise the plan weeks are grouped
 * by consecutive topic, and the closest pair of small groups is merged until at most six remain. Each phase: name, weeks a to b, dates,
 * what you study, the deliverable you make, and the named proof you show.
 */
export function planPhases(m) {
  const s = m.s.s8 || {};
  const weeks = Array.isArray(s.weeks) ? s.weeks : [];
  const start = isDate(s.start) ? s.start : isDate(m.meta.date) ? m.meta.date : null;
  const when = (a, b) => (start ? { start: addDays(start, (a - 1) * 7), end: addDays(start, b * 7 - 1) } : { start: null, end: null });
  if (Array.isArray(s.phases) && s.phases.length) {
    return s.phases.map((p, i) => {
      const w = Array.isArray(p.weeks) ? p.weeks : null;
      const a = Number(w ? w[0] : p.from_week ?? p.start_week ?? p.week_from ?? p.from ?? i + 1), b = Number(w ? w[w.length - 1] : p.to_week ?? p.end_week ?? p.week_to ?? p.to ?? a);
      return { name: String(p.name || p.title || p.focus || p.topic || `Phase ${i + 1}`), a, b, weeks: b - a + 1, minutes: Number(p.minutes) || null, ...when(a, b), learn: uniq(texts(p.learn).map(cleanLane)), deliverable: uniq(texts(p.deliverable ?? p.make).map(cleanLane)), proof: uniq(texts(p.proof ?? p.prove).map(cleanLane)) };
    });
  }
  const groups = [];
  weeks.forEach((w, i) => {
    const key = String(w.focus || "").toLowerCase().trim();
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.ws.push({ ...w, n: w.n ?? i + 1 }); else groups.push({ key, names: [w.focus], ws: [{ ...w, n: w.n ?? i + 1 }] });
  });
  while (groups.length > 6) {
    let at = 0, best = Infinity;
    for (let i = 0; i < groups.length - 1; i += 1) { const n = groups[i].ws.length + groups[i + 1].ws.length; if (n < best) { best = n; at = i; } }
    const [x, y] = [groups[at], groups[at + 1]];
    groups.splice(at, 2, { key: `${x.key}+${y.key}`, names: [...x.names, ...y.names], ws: [...x.ws, ...y.ws] });
  }
  return groups.map((g) => {
    const a = g.ws[0].n, b = g.ws[g.ws.length - 1].n;
    const lane = (k, pick) => uniq(pick.flatMap((w) => (w[k] || []).map((x) => cleanLane(x.text))));
    return {
      name: uniq(g.names.map(undash)).join(" and "), a, b, weeks: g.ws.length, ...when(a, b),
      minutes: g.ws.reduce((x, w) => x + [...w.learn, ...w.make, ...w.prove].reduce((y, t) => y + t.minutes, 0), 0),
      learn: lane("learn", g.ws).slice(0, 2), deliverable: lane("make", [g.ws[g.ws.length - 1]]), proof: lane("prove", g.ws).slice(0, 2),
    };
  });
}

const PHASE_COLORS = [[GREEN, GREEN_T], [BLUE, BLUE_T], [AMBER_D, AMBER + "88"], [RUST, RUST_T]];
/** Phases as bars on a date axis. The axis always reaches your date and the end of the ready range, so the deadline marker is never off the chart. */
export function planTimeline(m) {
  const s = m.s.s8, phases = planPhases(m);
  if (!phases.length || !phases[0].start) return "";
  const start = phases[0].start, endD = phases[phases.length - 1].end;
  const dl = isDate(s.deadline) ? s.deadline : null;
  const rd = s.ready && isDate(s.ready.from) && isDate(s.ready.to) ? s.ready : null;
  const lo = dayN(start), hi = Math.max(dayN(endD) + 1, dl ? dayN(dl) : 0, rd ? dayN(rd.to) : 0) + 7;
  const x0 = 215, x1 = W - 8, X = (d) => x0 + ((dayN(d) - lo) / (hi - lo)) * (x1 - x0);
  const rowH = 44, top = 40;
  const n = phases.length, axisY = top + n * rowH + 6;
  let body = "", labs = "";
  phases.forEach((p, i) => {
    const y = top + i * rowH, [strong, tint] = PHASE_COLORS[i % PHASE_COLORS.length];
    const lines = wrap(p.name, 30, 2);
    body += `<line x1="0" y1="${y + rowH - 2}" x2="${x1}" y2="${y + rowH - 2}" stroke="${TRACK}" stroke-width="1"/>`;
    body += tx(0, y + (lines.length > 1 ? 15 : 24), lines, { size: 12.5, weight: "700" });
    const xa = X(p.start), xb = X(addDays(p.end, 1)), w = Math.max(6, xb - xa);
    body += `<rect x="${num(xa)}" y="${y + 8}" width="${num(w)}" height="24" rx="4" fill="${tint}" stroke="${strong}" stroke-width="1.6"/>`;
    const lab = p.a === p.b ? `Week ${p.a}` : `Weeks ${p.a} to ${p.b}`;
    if (w >= 96) labs += tx(xa + w / 2, y + 25, lab, { halo: true, size: 11.5, anchor: "middle", weight: "700" });
    else labs += tx(xa + w + 6, y + 25, lab, { halo: true, size: 11.5, weight: "700", anchor: xa + w + 100 > x1 ? "end" : "start" });
  });
  body += monthTicks(lo, hi, x0, x1, axisY);
  let H = axisY + 30;
  if (rd) {
    const a = Math.max(x0, X(rd.from)), b = Math.min(x1, X(rd.to));
    body += `<rect x="${num(a)}" y="${axisY + 28}" width="${num(Math.max(4, b - a))}" height="10" rx="3" fill="${GREEN}"/>${tx(b > x1 - 220 ? b : a, axisY + 54, `Likely ready ${rd.from} to ${rd.to}`, { size: 11.5, fill: GREEN, weight: "700", anchor: b > x1 - 220 ? "end" : "start" })}`;
    H = axisY + 62;
  }
  if (dl) {
    const xd = X(dl);
    body += `<line x1="${num(xd)}" y1="${top - 12}" x2="${num(xd)}" y2="${axisY}" stroke="#ffffff" stroke-width="6"/><line x1="${num(xd)}" y1="${top - 12}" x2="${num(xd)}" y2="${axisY}" stroke="${RUST}" stroke-width="2.6"/>`;
    body += tx(xd, top - 20, `Your date ${dl}`, { size: 12, anchor: xd > x1 - 100 ? "end" : "middle", weight: "700", fill: RUST });
  }
  body += tx(0, 16, `Plan starts ${start}`, { size: 11.5, fill: MUTE });
  body += labs;
  return svg(H, body, `Plan in ${n} phases over ${phases[n - 1].b} weeks: ${phases.map((p) => p.name).join(", then ")}`);
}

// ---- 7. salary bands (only when sourced and parseable) --------------------------------------------------------------------------------
const BAND = /^\s*(\d[\d,]*(?:\.\d+)?)\s*(?:to|-|–)\s*(\d[\d,]*(?:\.\d+)?)\s+(\S.*?)\s*$/i;
export function parseBand(claim) {
  const hit = String(claim || "").match(BAND);
  if (!hit) return null;
  const lo = Number(hit[1].replace(/,/g, "")), hi = Number(hit[2].replace(/,/g, ""));
  return Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo ? { lo, hi, loT: hit[1], hiT: hit[2], unit: hit[3] } : null;
}
/** Indian digit grouping (12,34,567) for rupee amounts written with a rupee sign, Rs or INR. Other text is left alone. */
export function inr(text) {
  return String(text ?? "").replace(/(₹|\bRs\.?\s?|\bINR\s?)(\d{1,3}(?:,\d{3})+|\d{4,})(\.\d+)?/gi, (_, cur, digits, dec) => {
    const d = digits.replace(/,/g, "");
    const grouped = d.length <= 3 ? d : d.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + d.slice(-3);
    return cur + grouped + (dec || "");
  });
}
export function salaryBands(m) {
  const rows = [];
  for (const x of m.s.s9.salary || []) { const b = parseBand(x.claim); if (b && x.src && x.src.length) rows.push({ ...b, subject: x.subject, region: x.region }); }
  if (!rows.length) return "";
  const unit = rows[0].unit, same = rows.filter((r) => r.unit.toLowerCase() === unit.toLowerCase());
  const max = Math.max(...same.map((r) => r.hi)) * 1.05, x0 = 250, x1 = 560, rowH = 40;
  let body = tx(x0, 12, "0", { size: 11, anchor: "middle", fill: MUTE }) + `<line x1="${x0}" y1="16" x2="${x0}" y2="${16 + same.length * rowH}" stroke="${LINE}" stroke-width="1"/>`;
  same.forEach((r, i) => {
    const y = 22 + i * rowH, a = x0 + (r.lo / max) * (x1 - x0), b = x0 + (r.hi / max) * (x1 - x0);
    body += tx(0, y + 12, wrap(r.subject, 38, 2), { size: 12, weight: "700" }) + tx(0, y + 12 + 15 * wrap(r.subject, 38, 2).length, wrap(r.region || "", 40, 1), { size: 11, fill: MUTE });
    body += `<rect x="${num(a)}" y="${y}" width="${num(Math.max(3, b - a))}" height="16" rx="3" fill="${GREEN}"/>`;
    body += tx(b + 8, y + 13, inr(`${r.loT} to ${r.hiT} ${r.unit}`), { size: 12, weight: "700" });
  });
  return svg(22 + same.length * rowH, body, `Salary bands in ${unit} for ${same.length} roles`);
}
export const salarySources = (m) => {
  const seen = new Set(), out = [];
  for (const x of m.s.s9.salary || []) if (parseBand(x.claim)) for (const y of x.src || []) { const k = `${y.name}|${y.retrieved}`; if (!seen.has(k)) { seen.add(k); out.push(y); } }
  return out;
};
