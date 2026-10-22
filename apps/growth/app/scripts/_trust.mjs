// The twelve trust checks over the live data. Pure: takes the loaded data and today's date, writes nothing.
import { readyBy } from "../lib/forecast.mjs";
import { SCORE_REQUIRED_FROM } from "../lib/validate.mjs";
import { ISO, ageDays } from "./_data.mjs";

const WARN_RATING_DAYS = 45;
const FAIL_RATING_DAYS = 90;
const FRESH_PICK_DAYS = 30;
const TRACE_FLOOR = 0.6;

/** How much a piece of evidence can be leaned on. VERIFIED > DERIVED > JUDGED > UNSOURCED. */
export function evidenceClass(e) {
  if (!e) return "UNSOURCED";
  if (/not independently verified|reported/i.test(e.detail || "")) return "JUDGED";
  if (e.type === "ai" || e.type === "self" || e.type === "note") return "JUDGED";
  const linked = Array.isArray(e.links) && e.links.length > 0;
  return linked ? "VERIFIED" : "DERIVED";
}
/** A rating is only as good as its source label and the evidence under it. */
export function ratingClass(r, evById) {
  if (!r) return "UNSOURCED";
  if (r.source === "self") return "UNSOURCED";
  if (r.source === "ai") return "JUDGED";
  const ev = (r.evidence || []).map((id) => evidenceClass(evById[id]));
  if (ev.includes("VERIFIED")) return "VERIFIED";
  return ev.length ? "JUDGED" : "UNSOURCED";
}
const good = (c) => c === "VERIFIED" || c === "DERIVED";

export function runChecks(d, today) {
  const evById = Object.fromEntries(d.evidence.entries.map((e) => [e.id, e]));
  const ratings = d.skills.ratings;
  const gaps = d.library.gaps || [];
  const picks = d.library.picks || [];
  const tasks = d.week.tasks || [];
  const person = (d.profile && d.profile.person) || {};
  const out = [];
  const add = (id, status, count, ids, note = "") => out.push({ id, status, count, ids, note });
  const level = (bad, failN = false) => (bad.length ? (failN ? "FAIL" : "WARN") : "PASS");

  // 1. ref-integrity
  {
    const known = new Set([
      ...Object.keys(ratings), ...d.evidence.entries.map((e) => e.id), ...tasks.map((t) => t.id), ...gaps.map((g) => g.id),
      ...picks.map((p) => p.id), ...(d.library.trinkets || []).map((t) => t.id), ...d.proof.items.map((p) => p.id), ...d.bets.bets.map((b) => b.id),
      ...(d.profile.intake || []).map((q) => q.id), ...d.queue.items.map((q) => q.id), ...((d.tests && d.tests.tests) || []).map((t) => t.id),
      ...((d.learning && d.learning.briefs) || []).map((b) => b.id), ...(person.items || []).map((i) => i.id), ...(person.words || []).map((i) => i.id),
    ]);
    const bad = [];
    const chk = (who, ids) => { for (const id of ids || []) if (!known.has(id)) bad.push(`${who}->${id}`); };
    for (const [k, r] of Object.entries(ratings)) { chk(k, r.evidence); chk(k, r.because); }
    for (const p of d.proof.items) { chk(p.id, p.evidence); chk(p.id, p.because); }
    for (const t of tasks) { chk(t.id, t.because); if (t.proof && !d.proof.items.some((p) => p.id === t.proof)) bad.push(`${t.id}->${t.proof}`); }
    for (const g of gaps) chk(g.id, g.because);
    for (const p of picks) { chk(p.id, p.because); if (p.gap) chk(p.id, [p.gap]); if (p.task) chk(p.id, [p.task]); }
    for (const e of d.evidence.entries) if (e.gap) chk(e.id, [e.gap]);
    for (const i of person.items || []) { chk(i.id, i.evidence); chk(i.id, i.because); }
    for (const w of person.words || []) chk(w.id, w.because);
    add("ref-integrity", level(bad, true), bad.length, bad);
  }
  // 2. rating-evidence-floor
  {
    const bad = [];
    for (const [k, r] of Object.entries(ratings)) {
      if (r.level < 3) continue;
      const ids = r.evidence || [];
      const nonAi = ids.filter((id) => evById[id] && evById[id].type !== "ai");
      if (ids.length < 2 || !nonAi.length) bad.push(k);
    }
    add("rating-evidence-floor", level(bad), bad.length, bad, "level 3.0 or more needs 2 evidence ids, one not Claude-authored");
  }
  // 3. rating-age
  {
    const warn = [], fail = [];
    for (const [k, r] of Object.entries(ratings)) {
      const dates = [r.as_of, ...(r.history || []).map((h) => h.date)].filter((x) => ISO.test(x || "")).sort();
      const last = dates[dates.length - 1];
      const a = last ? ageDays(last, today) : null;
      if (a === null || a > FAIL_RATING_DAYS) fail.push(`${k}(${a === null ? "undated" : a + "d"})`);
      else if (a > WARN_RATING_DAYS) warn.push(`${k}(${a}d)`);
    }
    add("rating-age", fail.length ? "FAIL" : warn.length ? "WARN" : "PASS", fail.length + warn.length, [...fail, ...warn], `warn over ${WARN_RATING_DAYS} days, fail over ${FAIL_RATING_DAYS}`);
  }
  // 4. evidence-date-quality
  {
    const bad = d.evidence.entries.filter((e) => !ISO.test(e.date || "")).map((e) => e.id);
    add("evidence-date-quality", level(bad), bad.length, bad, "non-ISO dates are dropped from XP");
  }
  // 5. no-ai-only-support
  {
    const bad = [];
    const aiOnly = (ids) => ids && ids.length && ids.every((id) => evById[id] && evById[id].type === "ai");
    for (const [k, r] of Object.entries(ratings)) if (aiOnly(r.evidence)) bad.push(`rating ${k}`);
    for (const p of d.proof.items) if (aiOnly(p.evidence)) bad.push(p.id);
    for (const t of tasks) if (aiOnly(t.because)) bad.push(t.id);
    add("no-ai-only-support", level(bad), bad.length, bad);
  }
  // 6. ready-by-reproduce
  {
    const pace = d.profile.pace || "steady";
    const r = readyBy({ library: d.library, week: d.week }, pace, { today });
    if (!r) add("ready-by-reproduce", "WARN", 0, [], "no gap has an evenings estimate");
    else {
      // Independent recompute: evenings per slot minus finished tasks, over evenings a week.
      const per = r.basis.per_week;
      const since = r.basis.estimated_dates.slice().sort()[0] || today;
      const worked = { skill: 0, reach: 0 };
      for (const t of tasks) if ((t.status === "done" || t.status === "submitted") && t.closed && t.closed >= since) worked[t.track] += 1;
      const slot = { skill: 0, reach: 0 };
      for (const g of r.basis.gaps) slot[g.track] += g.evenings;
      let latest = "";
      for (const g of r.basis.gaps) {
        const upto = r.basis.gaps.filter((x) => x.track === g.track && r.basis.gaps.indexOf(x) <= r.basis.gaps.indexOf(g)).reduce((a, x) => a + x.evenings, 0);
        const left = Math.max(upto - worked[g.track], 0);
        const from = g.estimated || since;
        const dt = new Date(`${from}T00:00:00Z`); dt.setUTCDate(dt.getUTCDate() + Math.ceil((left / per) * 7));
        const iso = dt.toISOString().slice(0, 10);
        if (iso > latest) latest = iso;
      }
      const match = latest === r.date;
      const weak = r.status === "late" || r.confidence < 0.35 || r.basis.without_basis > 0;
      add("ready-by-reproduce", !match ? "FAIL" : weak ? "WARN" : "PASS", 1, [],
        `${r.date} ${r.status}; recomputed ${latest} (${match ? "matches" : "DIFFERS"}); ${r.basis.evenings_total} evenings at ${per}/week (${pace}); range ${r.range.earliest}..${r.range.latest}; confidence ${r.confidence} (${r.confidence_label}); ${r.basis.without_basis} of ${r.basis.gaps.length} gaps have no stated basis; depends on ${r.basis.depends_on.join(",") || "nobody"}`);
    }
  }
  // 7. picks-scored
  {
    const shown = picks.filter((p) => p.status === "new" || p.status === "kept");
    const unscored = shown.filter((p) => !p.score).map((p) => p.id);
    const must = shown.filter((p) => !p.score && (p.added || p.checked || p.week_of || "") >= SCORE_REQUIRED_FROM).map((p) => p.id);
    add("picks-scored", must.length ? "FAIL" : unscored.length ? "WARN" : "PASS", unscored.length, unscored, `${unscored.length} of ${shown.length} shown picks unscored; gate (error) from ${SCORE_REQUIRED_FROM}`);
  }
  // 8. person-provenance
  {
    const bad = [];
    for (const w of person.words || []) {
      if (!w.as_of && !(w.because && w.because.length)) bad.push(w.id);
      else if (w.source === "estimate" && w.status === "confirmed" && w.reviewed_by !== "dev" && !w.confirmed) bad.push(`${w.id}(confirmed, no confirm record)`);
    }
    for (const i of person.items || []) if (!i.as_of && !(i.because && i.because.length) && !(i.evidence && i.evidence.length)) bad.push(i.id);
    // Estimate words that read confirmed with no record are listed even when dated.
    for (const w of person.words || []) if (w.source === "estimate" && w.status === "confirmed" && !w.confirmed && w.reviewed_by !== "dev" && !bad.some((b) => b.startsWith(w.id))) bad.push(`${w.id}(confirmed, no confirm record)`);
    add("person-provenance", level(bad), bad.length, bad);
  }
  // 9. gap-estimate-basis
  {
    const open = gaps.filter((g) => g.status !== "closed");
    const noBasis = open.filter((g) => !g.evenings_basis).map((g) => g.id);
    const dates = new Set(open.map((g) => g.estimated).filter(Boolean));
    add("gap-estimate-basis", level(noBasis), noBasis.length, noBasis, `${open.length} open gaps; ${dates.size} distinct estimate date(s)${dates.size === 1 && open.length > 2 ? " (all estimated on one day)" : ""}`);
  }
  // 10. pick-freshness
  {
    const bad = [];
    for (const p of picks) {
      if (p.status === "skipped" || p.status === "done") continue;
      const a = ageDays(p.checked, today);
      if (a === null) bad.push(`${p.id}(never checked)`);
      else if (a > FRESH_PICK_DAYS) bad.push(`${p.id}(${a}d)`);
      else if (["article", "video", "news"].includes(p.kind) && !p.published) bad.push(`${p.id}(no published date)`);
    }
    add("pick-freshness", level(bad), bad.length, bad, `recheck after ${FRESH_PICK_DAYS} days`);
  }
  // 11. numbers-have-source
  {
    const ns = (d.profile && d.profile.north_star) || {};
    const bad = [];
    const src = ns.sources || {};
    if (typeof ns.salary_inr_per_month === "number" && !(src.salary_inr_per_month && src.salary_inr_per_month.source) && !ns.salary_source) bad.push("north_star.salary_inr_per_month");
    (ns.recognition || []).forEach((t, i) => { if (/\d/.test(String(t)) && !(src[`recognition_${i}`] && src[`recognition_${i}`].source)) bad.push(`north_star.recognition[${i}]`); });
    add("numbers-have-source", level(bad), bad.length, bad, "give each number {source, as_of} under north_star.sources");
  }
  // 12. trace-completeness
  {
    const rows = [];
    const cls = (c) => c;
    const profileRec = (id, links) => rows.push({ id, links });
    for (const g of gaps.filter((x) => x.status !== "closed")) {
      const becauseCls = (g.because || []).map((i) => evidenceClass(evById[i]));
      profileRec(g.id, [
        g.evenings_basis ? "DERIVED" : "UNSOURCED",
        ISO.test(g.estimated || "") ? "DERIVED" : "UNSOURCED",
        becauseCls.length ? (becauseCls.some(good) ? "VERIFIED" : "JUDGED") : "JUDGED",
        "JUDGED", // closes_when is Claude's judgement
      ].map(cls));
    }
    for (const t of tasks) {
      const rc = t.competency ? ratingClass(ratings[t.competency], evById) : null;
      const bc = (t.because || []).map((i) => evidenceClass(evById[i]));
      const links = [t.impact ? "DERIVED" : "UNSOURCED", t.proof && d.proof.items.some((p) => p.id === t.proof) ? "DERIVED" : (t.competency ? "DERIVED" : "UNSOURCED")];
      if (rc) links.push(rc);
      links.push(bc.length ? (bc.some(good) ? "VERIFIED" : "JUDGED") : "UNSOURCED");
      profileRec(t.id, links);
    }
    for (const p of picks.filter((x) => x.status === "new" || x.status === "kept")) {
      profileRec(p.id, [
        p.score ? "DERIVED" : "UNSOURCED",
        ISO.test(p.checked || "") ? "VERIFIED" : "UNSOURCED",
        p.gap && gaps.some((g) => g.id === p.gap) ? "DERIVED" : "JUDGED",
        p.because && p.because.length ? "DERIVED" : "JUDGED",
      ]);
    }
    for (const [k, r] of Object.entries(ratings)) {
      profileRec(`rating ${k}`, [ratingClass(r, evById), ISO.test(((r.history || []).slice(-1)[0] || {}).date || "") ? "DERIVED" : "UNSOURCED", (r.evidence || []).length >= 2 ? "DERIVED" : "UNSOURCED"]);
    }
    const scored = rows.map((r) => ({ id: r.id, pct: r.links.filter(good).length / r.links.length }));
    const low = scored.filter((s) => s.pct < TRACE_FLOOR).map((s) => `${s.id}(${Math.round(s.pct * 100)}%)`);
    const avg = scored.length ? Math.round((scored.reduce((a, s) => a + s.pct, 0) / scored.length) * 100) : 100;
    add("trace-completeness", level(low), low.length, low, `${rows.length} recommendations, average ${avg}% of links verified or derived; floor ${Math.round(TRACE_FLOOR * 100)}%`);
    out.trace = scored;
  }
  return out;
}
