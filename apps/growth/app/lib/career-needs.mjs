// What a CV version or a case study still needs, in ONE place. Pure: no node imports, so the engine (lib/career-honesty.mjs,
// lib/career.mjs) and the app's components (CvPanel, CaseStudies) count the very same slots and can never disagree.
// The numbers shown in the app (checks.honesty.placeholders) are the length of placeholderList(v) / caseNeeds(c).

export const PLACEHOLDER_RE = /\[NEEDS(?: REAL NUMBER)?:[^\]]*\]/g;

export const normWs = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
export const countPlaceholders = (s) => (typeof s === "string" ? (s.match(PLACEHOLDER_RE) || []).length : 0);
export const stripPlaceholders = (s) => (typeof s === "string" ? s.replace(PLACEHOLDER_RE, " ") : "");

/**
 * Every user-facing string slot of a CV version, in page order: { where, text, set(newText), attach(sources) }.
 * Quotes, checks and the pasted job post are not text. `attach` adds sources to the bullet or item the text belongs to.
 */
export function textSlots(v) {
  const out = [];
  const add = (where, obj, key, owner) => {
    if (obj && typeof obj[key] === "string" && obj[key]) out.push({
      where, text: obj[key], set: (t) => { obj[key] = t; },
      attach: (srcs) => { if (owner && Array.isArray(srcs) && srcs.length) { if (!Array.isArray(owner.sources)) owner.sources = []; owner.sources.push(...srcs); } },
    });
  };
  add(`${v.id}/why`, v, "why");
  const h = v.header || {};
  // Header text and section titles are backed by the header-level `sources` (a number there needs a quote in them).
  for (const k of ["name", "title", "location", "email"]) add(`${v.id}/header.${k}`, h, k, h);
  (h.links || []).forEach((l, i) => { add(`${v.id}/header.links[${i}].label`, l, "label", h); add(`${v.id}/header.links[${i}].url`, l, "url", h); });
  for (const sec of v.sections || []) {
    add(`${v.id}/${sec.id}/title`, sec, "title", h);
    for (const it of sec.items || []) {
      for (const k of ["heading", "sub", "dates"]) add(`${v.id}/${sec.id}/${it.id}/${k}`, it, k, it);
      for (const b of it.bullets || []) add(`${v.id}/${sec.id}/${it.id}/${b.id}`, b, "text", b);
    }
  }
  if (v.target) { add(`${v.id}/target.company`, v.target, "company"); add(`${v.id}/target.role`, v.target, "role"); }
  return out;
}

/** Every user-facing string of a CV version with a path label. */
export function versionTexts(v) {
  return textSlots(v).map(({ where, text }) => ({ where, text }));
}

/** Every placeholder of a version in page order (bullets, headings, sub lines, dates, header, links): [{ index (1-based), where, placeholder }]. Its length is the number the app and the engine both show. */
export function placeholderList(v) {
  const out = [];
  for (const sl of textSlots(v)) for (const ph of sl.text.match(PLACEHOLDER_RE) || []) out.push({ index: out.length + 1, where: sl.where, placeholder: ph });
  return out;
}
export const listPlaceholders = placeholderList;

/** Every user-facing string of a case. */
export function caseTexts(c) {
  const out = [];
  const add = (where, text) => { if (typeof text === "string" && text) out.push({ where, text }); };
  for (const k of ["title", "one_line", "type", "owned", "team", "audience", "hook"]) add(`${c.id}/${k}`, c[k]);
  (c.beats || []).forEach((b, i) => { add(`${c.id}/beat ${i + 1} title`, b.title); add(`${c.id}/beat ${i + 1}`, b.text); (b.needs || []).forEach((n, j) => add(`${c.id}/beat ${i + 1} needs ${j + 1}`, n)); });
  (c.decisions || []).forEach((d, i) => {
    for (const k of ["decision", "context", "tradeoffs", "outcome"]) add(`${c.id}/decision ${i + 1} ${k}`, d[k]);
    (d.options || []).forEach((o, j) => add(`${c.id}/decision ${i + 1} option ${j + 1}`, o));
  });
  return out;
}

/**
 * The facts a case study still needs, de-duplicated (the same placeholder or need written twice counts once): [{ where, text }].
 * The text is a [NEEDS ...] marker found in the case, or a beat's "needs" entry that has no marker of its own.
 */
export function caseNeeds(c) {
  const seen = new Set();
  const out = [];
  const add = (where, text) => { const k = normWs(text).toLowerCase(); if (!k || seen.has(k)) return; seen.add(k); out.push({ where, text: normWs(text) }); };
  for (const t of caseTexts(c)) for (const ph of t.text.match(PLACEHOLDER_RE) || []) add(t.where, ph);
  (c.beats || []).forEach((b, i) => (b.needs || []).forEach((n, j) => { if (typeof n === "string" && countPlaceholders(n) === 0) add(`${c.id}/beat ${i + 1} needs ${j + 1}`, n); }));
  // A part with nothing written and no fact named for it (no marker in its text, no "needs" entry) is one missing fact, "Not written yet",
  // counted under that part's own where (so two empty parts are two facts).
  (c.beats || []).forEach((b, i) => {
    const w = `${c.id}/beat ${i + 1}`;
    if (!normWs(stripPlaceholders(b && b.text)) && !out.some((n) => n.where === w || n.where.startsWith(`${w} `))) out.push({ where: w, text: "Not written yet" });
  });
  return out;
}
