// Career actions: the one place the CV and the case studies change. Shared by scripts/cv-act.mjs and the app (lib/store.ts), like
// lib/onboarding-actions.mjs. Each action validates the shape, runs the honesty check (lib/career-honesty.mjs) and renders the html.
// The honesty check refuses a version or case with an unsourced number, a quote that is not word for word in its source, or a
// confidential / not-yours term. Placeholders are fine: they are counted and shown as facts still needed.
// Paths come in through ctx (no import.meta here: lib/ is also compiled into a temp folder by the store test).
//   ctx = { dataDir, today: "YYYY-MM-DD", dossierPath?, denylistPath?, internal?: boolean }
// applyCareerAction(a, s, ctx) mutates s.career and returns ["career"]; the array also carries .writes (html files to write after the
// whole state validates: use writeCvFiles) and .notes / .result.
import fs from "fs";
import path from "path";
import { careerErrors } from "./validate.mjs";
import { renderCv } from "./career-render.mjs";
import { foldText, makeContext, withEvidence, checkVersion, checkCase, checkCareer, toStored, explain, noteProblem, numberTokens, quoteProblem, backingTokens, denyHit, urlSeen, testDeployment, PRIVATE_ANSWER } from "./career-honesty.mjs";
import { textSlots, placeholderList, normWs, stripPlaceholders } from "./career-needs.mjs";

export const CAREER_ACTIONS = ["cv.version.add", "cv.section.set", "cv.fill", "cv.current", "cv.ats.set", "case.set", "case.remove", "cv.restore", "evidence.note", "cv.why.set"];
/** What the app itself may send: every career action except cv.restore and cv.why.set, which are for the scripts only (the app undoes through its snapshots). */
export const CAREER_APP_ACTIONS = CAREER_ACTIONS.filter((t) => t !== "cv.restore" && t !== "cv.why.set");
/** Only the scripts may use these: they record a file that a script made (the pdf, a promotion). */
export const CAREER_INTERNAL_ACTIONS = ["cv.pdf.set", "cv.promote.mark", "cv.checks.set"];

export const emptyCareer = (today) => ({ updated: today, cv: { current: null, versions: [] }, cases: [] });
const clone = (x) => JSON.parse(JSON.stringify(x));
const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
const NOTE_POINTS = { note: 5, shipped: 15, win: 25 }; // the same points as the store's `log` action
const draftFile = (id) => `cv/drafts/CV_${id}.html`;

/** A keyword or a text in one comparison form: folded, lower case, every run of other characters one space. */
const kwNorm = (s) => foldText(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** A keyword in its comparison form with a plural read as its singular ("design reviews" and "design review" are one). */
const kwStem = (s) => kwNorm(s).replace(/s$/, "");
/** What a version says, for the keyword check: every text slot except why and the target (the job post is not the CV), placeholders removed. */
const atsText = (v) => textSlots(v).filter((x) => !/\/why$|\/target\./.test(x.where)).map((x) => stripPlaceholders(x.text)).join(" \n ");
/** Honesty warnings as notes. With `before` (the warnings the version this one came from has TODAY: checkVersion(base, ctx).warnings, never the stored ones, which may be stale) only the new ones are listed; the version id is ignored when comparing. */
const warnNotes = (r, before = []) => {
  const key = (w) => String(w).replace(/^v\d+\//, "");
  const old = new Set((before || []).map(key));
  return [...new Set((r.warnings || []).filter((w) => !old.has(key(w))))].map((w) => `Warning: ${w}`);
};

/** The honesty message for a refusal, in plain words. */
const refuse = (what, r) => new Error(`${what} has a problem with the facts: ${explain(r)}. Nothing was changed.`);

function ensureCareer(s, today) {
  if (!isObj(s.career)) s.career = emptyCareer(today);
  if (!isObj(s.career.cv)) s.career.cv = { current: null, versions: [] };
  if (!Array.isArray(s.career.cv.versions)) s.career.cv.versions = [];
  if (!Array.isArray(s.career.cases)) s.career.cases = [];
  return s.career;
}

function findVersion(career, id) {
  const want = id || career.cv.current;
  const v = career.cv.versions.find((x) => x.id === want);
  if (!v) throw new Error(id ? `There is no CV version ${id}. Nothing was changed.` : "There is no current CV yet. Nothing was changed.");
  return v;
}

function nextVersionId(career) {
  let n = 0;
  for (const v of career.cv.versions) { const m = /^v(\d+)$/.exec(v.id || ""); if (m) n = Math.max(n, Number(m[1])); }
  return `v${n + 1}`;
}

/**
 * The version an edit works on: a copy of `v` (the edit stays out of the stored career until it passes). With newVersion the copy gets
 * a new id, `base` pointing at the original, a new draft file and no pdf. Any edit clears the pdf (it no longer matches) and stamps
 * `changed`; cv-promote refuses a pdf older than that.
 */
function workingCopy(career, v, { newVersion, why }, today, nowIso) {
  const draft = clone(v);
  const staleAts = v.checks && v.checks.ats ? { ...v.checks.ats, stale: true } : null;
  if (newVersion) {
    draft.id = nextVersionId(career);
    draft.made = today;
    draft.base = v.id;
    draft.promoted = false;
    draft.file = draftFile(draft.id);
  }
  if (why) draft.why = why;
  draft.pdf = null;
  draft.promoted = false; // the canonical CV no longer matches an edited version
  draft.changed = nowIso;
  draft.checks = { honesty: null, ats: staleAts };
  return draft;
}

/** Stores an edited copy: pushed as a new version (and made current unless told not to), or put in place of the original. */
function commitDraft(career, draft, { newVersion, makeCurrent }, ts) {
  if (newVersion) {
    career.cv.versions.push(draft);
    if (makeCurrent || !career.cv.current) career.cv.current = draft.id;
  } else {
    career.cv.versions[career.cv.versions.findIndex((x) => x.id === draft.id)] = draft;
  }
  ts.writes.push({ rel: draft.file, text: renderCv(draft) });
}

/** Checks a draft inside a copy of the career (shape rules, then honesty). Throws a plain sentence; returns the honesty result. */
function vetDraft(career, draft, newVersion, what, hctx) {
  const next = clone(career);
  if (newVersion) next.cv.versions.push(draft); else next.cv.versions[next.cv.versions.findIndex((x) => x.id === draft.id)] = draft;
  shapeOrThrow(next);
  const r = checkVersion(draft, hctx());
  if (!r.pass) throw refuse(what, r);
  return r;
}

/** Runs the shape rules on the whole career, refusing with the first error. */
function shapeOrThrow(career) {
  const errs = careerErrors(career);
  if (errs.length) throw new Error(`${errs[0].replace(/^career: /, "").replace(/[.\s]+$/, "")}. Nothing was changed.`);
}

export function applyCareerAction(a, s, ctx) {
  const ts = ["career"];
  ts.writes = [];
  const today = ctx.today;
  if (CAREER_INTERNAL_ACTIONS.includes(a.type) && !ctx.internal) throw new Error(`${a.type} is only for the scripts. Nothing was changed.`);
  if (![...CAREER_ACTIONS, ...CAREER_INTERNAL_ACTIONS].includes(a.type)) throw new Error(`${a.type} is not a career action. Nothing was changed.`);
  const career = ensureCareer(s, today);
  // Several cv.fill actions in one list (with no version named) all go into ONE new version: the first makes it, the others edit it.
  // evidence.note in between does not break the chain; any other action does.
  if (a.type !== "cv.fill" && a.type !== "evidence.note") ctx.chain = null;
  const nowIso = () => (ctx.now || new Date()).toISOString();
  // Evidence is read from the state in memory, so a note saved earlier in the same list can be cited by a later action.
  const hctx = () => {
    const h = makeContext({ dataDir: ctx.dataDir, dossierPath: ctx.dossierPath, denylistPath: ctx.denylistPath, now: ctx.now || new Date() });
    return s.evidence && Array.isArray(s.evidence.entries) ? withEvidence(h, s.evidence.entries) : h;
  };

  switch (a.type) {
    case "cv.version.add": {
      const src = a.version;
      if (!isObj(src)) throw new Error("There is no CV to add. Nothing was changed.");
      const id = src.id || nextVersionId(career);
      if (career.cv.versions.some((v) => v.id === id)) throw new Error(`Version ${id} already exists. Nothing was changed.`);
      const target = src.target || null;
      const v = {
        id, made: today, changed: nowIso(), why: src.why, base: src.base ?? null, target, promoted: false, file: draftFile(id), pdf: null,
        header: src.header, sections: src.sections, checks: { honesty: null, ats: null },
      };
      const next = clone(career);
      next.cv.versions.push(v);
      shapeOrThrow(next);
      const r = checkVersion(v, hctx());
      if (!r.pass) throw refuse(`CV ${id}`, r);
      v.checks.honesty = toStored(r);
      career.cv.versions.push(v);
      // The newest version is the one the person reviews, tailored or not: it becomes current unless make_current is false.
      const makeCurrent = a.make_current !== undefined ? a.make_current === true : true;
      if (makeCurrent || !career.cv.current) career.cv.current = id;
      ts.writes.push({ rel: v.file, text: renderCv(v) });
      ts.result = { id, placeholders: r.placeholders, honesty: "pass" };
      ts.notes = [...(r.dev_sources.length ? [`${r.dev_sources.length} line${r.dev_sources.length === 1 ? " rests" : "s rest"} on what the person said in chat, not on a written source.`] : []), ...warnNotes(r)];
      break;
    }
    case "cv.section.set": {
      const v = findVersion(career, a.version);
      const sec = a.section;
      if (!isObj(sec) || typeof sec.id !== "string") throw new Error("That section needs an id. Nothing was changed.");
      const newVersion = a.new_version === true;
      const why = typeof a.why === "string" && a.why.trim() ? a.why : newVersion ? `Rewrote ${sec.title || sec.id}` : "";
      const draft = workingCopy(career, v, { newVersion, why }, today, nowIso());
      const i = draft.sections.findIndex((x) => x.id === sec.id);
      if (i >= 0) draft.sections[i] = clone(sec); else draft.sections.push(clone(sec));
      const r = vetDraft(career, draft, newVersion, `Section ${sec.id}`, hctx);
      draft.checks.honesty = toStored(r);
      commitDraft(career, draft, { newVersion, makeCurrent: a.make_current !== false }, ts);
      ts.result = { id: draft.id, section: sec.id, placeholders: r.placeholders, honesty: "pass" };
      ts.notes = warnNotes(r, checkVersion(v, hctx()).warnings);
      break;
    }
    case "cv.fill": {
      // One fact filled in: a new version (a copy of the given or current one), so the earlier one stays as it was.
      // The exception is a later fill in the same list with no version named: it edits the version the first fill made (one new version per list).
      const chained = !a.version && !!ctx.chain && ctx.chain.id && career.cv.versions.some((x) => x.id === ctx.chain.id);
      const v = findVersion(career, chained ? ctx.chain.id : a.version);
      if (typeof a.text !== "string" || !a.text.trim()) throw new Error('Say what the fact is: give "text". Nothing was changed.');
      const srcs = a.sources === undefined ? [] : a.sources;
      if (!Array.isArray(srcs)) throw new Error('"sources" must be a list of quotes. Nothing was changed.');
      if (!srcs.length) throw new Error('A fact needs a source: give "sources" with a short word-for-word quote that holds it (or save it as a note from the person first and cite that note). Nothing was changed.');
      const draft = workingCopy(career, v, { newVersion: !chained, why: "" }, today, nowIso());
      const list = placeholderList(draft);
      if (!list.length) throw new Error(`${v.id} has no fact still needed. Nothing was changed.`);
      const pick = Number.isInteger(a.placeholder) ? list[a.placeholder - 1]
        : typeof a.placeholder === "string" ? (list.find((x) => x.placeholder === a.placeholder) || list.find((x) => normWs(x.placeholder) === normWs(a.placeholder))) : undefined;
      if (!pick) throw new Error(`I could not find that placeholder in ${v.id}. It has ${list.length} fact${list.length === 1 ? "" : "s"} still needed; give the exact placeholder text, or its number from 1 to ${list.length}. Nothing was changed.`);
      // The new text must be proven by the new sources alone: the bullet's old sources never count for it.
      const newText = a.text.trim();
      const toks = [...new Set(numberTokens(newText))];
      if (/^\[NEEDS REAL NUMBER/.test(pick.placeholder) && !toks.length) throw new Error("That slot needs a real number: the text has none. Give the number and a source that holds it. Nothing was changed.");
      const h = hctx();
      const slot0 = textSlots(draft).find((x) => x.where === pick.where);
      const fullText = slot0 ? slot0.text.replace(pick.placeholder, () => newText) : newText;
      // An address is a fact about who the person is: a slot that asks for a URL takes only an address his career file, answers or evidence already hold,
      // and an address those call a test deployment is never the final one.
      if (/URL/i.test(pick.placeholder)) {
        if (!urlSeen(newText, h) || !newText.trim()) throw new Error("That address is not in your career file, answers or evidence, so I cannot put it on your CV. Say it in chat so it is saved as a note from you first, or give an address your notes already have. Nothing was changed.");
        if (/final|live|real|public|main/i.test(pick.placeholder) && testDeployment(newText, h)) throw new Error("Your notes call that address a test deployment, so it is not your final portfolio address yet. Give the final address once it is live. Nothing was changed.");
      }
      srcs.forEach((sr, n) => {
        const label = `Source ${n + 1}${sr && sr.ref ? ` (${sr.ref})` : ""}`;
        const p = quoteProblem(sr, h, fullText);
        if (p === PRIVATE_ANSWER) throw new Error(`${p} Nothing was changed.`);
        if (p) throw new Error(`${label} does not hold up: ${p.replace(/[.\s]+$/, "")}. Nothing was changed.`);
        if (!toks.length) return;
        if (sr.kind === "dev") throw new Error(`${label}: a number cannot rest on what you said in chat. Save it as a note from you first, then cite that note. Nothing was changed.`);
      });
      if (toks.length) {
        const have = backingTokens(srcs);
        const miss = toks.filter((t) => !have.has(t));
        // Write the number as the source does; a number from a line that holds a confidential item is never repeated back.
        const shown = denyHit(h.deny, newText) ? "(withheld)" : miss.join(", ");
        if (miss.length) throw new Error(`The quote of none of the sources holds ${miss.length === 1 ? "the number" : "the numbers"} ${shown} from the new text. Write the number as your source does ("ten" and "10" match, "40%" and "40 percent" match, "40" and "40%" do not).${miss.some((t) => /^\d{1,3}$/.test(t)) ? " Your source does not state this count. Drop it or name the items." : ""} Nothing was changed.`);
      }
      // placeholderList ran on the copy, so its `where` already carries the new id.
      const slot = textSlots(draft).find((x) => x.where === pick.where);
      if (!slot) throw new Error("I could not place that fact. Nothing was changed.");
      slot.set(slot.text.replace(pick.placeholder, () => newText));
      slot.attach(clone(srcs));
      const inner = pick.placeholder.replace(/^\[NEEDS(?: REAL NUMBER)?:\s*/, "").replace(/\]$/, "").replace(/[\u2013\u2014]/g, "-").trim().slice(0, 80);
      const count = chained ? ctx.chain.n + 1 : 1;
      // The why carries no numbers (the honesty check refuses a number there): digits are dropped from the placeholder text.
      draft.why = count > 1 ? "Filled in several facts" : `Filled in: ${inner.replace(/\d[\d,.]*/g, "").replace(/\s+/g, " ").trim()}`;
      const r = vetDraft(career, draft, !chained, "That fact", hctx);
      draft.checks.honesty = toStored(r);
      commitDraft(career, draft, { newVersion: !chained, makeCurrent: a.make_current !== false }, ts);
      ctx.chain = { id: draft.id, n: count };
      ts.result = { id: draft.id, filled: pick.placeholder, placeholders: r.placeholders, honesty: "pass" };
      ts.notes = warnNotes(r, checkVersion(v, hctx()).warnings);
      break;
    }
    case "cv.current": {
      if (!career.cv.versions.some((v) => v.id === a.id)) throw new Error(`There is no CV version ${a.id}. Nothing was changed.`);
      career.cv.current = a.id;
      break;
    }
    case "cv.why.set": {
      // Only the reason text changes. The why is not on the page, so the html, the pdf, `changed` and the ATS result are all left as they are.
      if (typeof a.version !== "string" || !a.version.trim()) throw new Error('Say which CV version this reason is for: add "version": "v1". Nothing was changed.');
      const v = findVersion(career, a.version);
      if (typeof a.why !== "string" || !a.why.trim()) throw new Error('Give the reason as plain text: "why". Nothing was changed.');
      const draft = clone(v);
      draft.why = a.why.trim();
      const next = clone(career);
      next.cv.versions[next.cv.versions.findIndex((x) => x.id === v.id)] = draft;
      shapeOrThrow(next);
      const r = checkVersion(draft, hctx());
      // The reason is judged on its own words: a version whose lines have a problem is not made worse or better by its reason.
      const mine = [...r.problems.filter((p) => p.startsWith(`${v.id}/why`)), ...r.unsourced_numbers.filter((p) => p.startsWith(`${v.id}/why`))];
      if (mine.length) throw new Error(`The reason has a problem: ${mine[0].replace(/^v\d+\/why:\s*/, "")}. Nothing was changed.`);
      v.why = draft.why;
      ts.result = { id: v.id, why: v.why };
      break;
    }
    case "cv.ats.set": {
      if (typeof a.version !== "string" || !a.version.trim()) throw new Error('Say which CV version this check is for: add "version": "v2". Nothing was changed.');
      const v = findVersion(career, a.version);
      // Two shapes are accepted: {version, ats: {...}} and the flat {version, job, matched, missing, estimate}.
      const x = isObj(a.ats) ? a.ats : ["job", "matched", "missing", "estimate"].some((k) => a[k] !== undefined) ? a : null;
      if (!x) throw new Error("There is no ATS result to save. Nothing was changed.");
      // The estimate is a plain number from 0 to 100 ("72"), never text such as "72%" or "about 70".
      if (x.estimate !== undefined && (typeof x.estimate !== "number" || !Number.isFinite(x.estimate) || x.estimate < 0 || x.estimate > 100)) throw new Error(`The estimate must be a number from 0 to 100, written as digits only (72, not "72%"). Nothing was changed.`);
      // One keyword cannot be both matched and missing.
      {
        const m = new Set((Array.isArray(x.matched) ? x.matched : []).filter((k) => typeof k === "string").map(kwStem).filter(Boolean));
        const both = [...new Set((Array.isArray(x.missing) ? x.missing : []).filter((k) => typeof k === "string" && m.has(kwStem(k))))];
        if (both.length) throw new Error(`${both.map((k) => `"${k}"`).join(", ")} ${both.length === 1 ? "is" : "are"} in both matched and missing. Put each keyword in one list. Nothing was changed.`);
      }
      const ats = { ran: nowIso(), job: String(x.job ?? ""), matched: x.matched, missing: x.missing, estimate: typeof x.estimate === "number" ? Math.round(x.estimate) : x.estimate, label: "AI estimate" };
      // A keyword listed as matched must be in the words of this version; one listed as missing that is in them is a warning.
      const hay = ` ${kwNorm(atsText(v))} `;
      const inCv = (kw) => { const k = kwNorm(kw); return !!k && [k, `${k}s`, k.replace(/s$/, "")].some((f) => f && hay.includes(` ${f} `)); };
      const notThere = (Array.isArray(ats.matched) ? ats.matched : []).filter((kw) => typeof kw === "string" && kw.trim() && !inCv(kw));
      if (notThere.length) throw new Error(`${notThere.map((k) => `"${k}"`).join(", ")} ${notThere.length === 1 ? "is" : "are"} listed as matched, but ${notThere.length === 1 ? "it is" : "they are"} not in ${v.id}, so I did not save this check. Move ${notThere.length === 1 ? "it" : "them"} to missing, or add the word to the CV with a source first. Nothing was changed.`);
      const thereAfterAll = (Array.isArray(ats.missing) ? ats.missing : []).filter((kw) => typeof kw === "string" && kw.trim() && inCv(kw));
      if (thereAfterAll.length) ts.notes = [`Warning: ${thereAfterAll.map((k) => `"${k}"`).join(", ")} ${thereAfterAll.length === 1 ? "is" : "are"} listed as missing, but ${thereAfterAll.length === 1 ? "it appears" : "they appear"} in ${v.id}. Check the list.`];
      const next = clone(career);
      next.cv.versions.find((y) => y.id === v.id).checks = { honesty: v.checks && v.checks.honesty, ats };
      shapeOrThrow(next);
      v.checks = { honesty: v.checks ? v.checks.honesty : null, ats };
      break;
    }
    case "case.set": {
      const src = a.case;
      if (!isObj(src) || typeof src.id !== "string") throw new Error("That case study needs an id. Nothing was changed.");
      const prev = career.cases.find((c) => c.id === src.id);
      const c = {
        one_line: "", type: "", owned: "", team: "", audience: "", hook: "", beats: [], decisions: [],
        ...(prev || {}), ...src, format: src.format || (prev && prev.format) || "decision_log", status: src.status || (prev && prev.status) || "outline", updated: today,
      };
      // A case that is sent back with fewer beats or decisions than it holds would quietly drop work: refuse unless the action says replace: true.
      if (prev && a.replace !== true) {
        const lost = [["beat", (prev.beats || []).length - (c.beats || []).length], ["decision", (prev.decisions || []).length - (c.decisions || []).length]].filter(([, n]) => n > 0);
        if (lost.length) throw new Error(`Case study ${c.id} would lose ${lost.map(([w, n]) => `${n} ${w}${n === 1 ? "" : "s"}`).join(" and ")} that it has now. Send the whole list, or add "replace": true if you mean to drop ${lost.length === 1 && lost[0][1] === 1 ? "it" : "them"}. Nothing was changed.`);
      }
      const next = clone(career);
      const j = next.cases.findIndex((x) => x.id === c.id);
      if (j >= 0) next.cases[j] = c; else next.cases.push(c);
      shapeOrThrow(next);
      const r = checkCase(c, hctx());
      if (!r.pass) throw refuse(`Case study ${c.id}`, r);
      if (c.status === "ready" && r.placeholders > 0) throw new Error(`Case study ${c.id} cannot be ready while ${r.placeholders} fact${r.placeholders === 1 ? " is" : "s are"} still needed. Fill ${r.placeholders === 1 ? "it" : "them"} in first, or keep it as a draft. Nothing was changed.`);
      const k = career.cases.findIndex((x) => x.id === c.id);
      if (k >= 0) career.cases[k] = c; else career.cases.push(c);
      ts.result = { id: c.id, placeholders: r.placeholders, honesty: "pass" };
      ts.notes = warnNotes(r);
      break;
    }
    case "evidence.note": {
      // Same as the store's `log` action for kinds note, shipped and win: one evidence entry, id ev-NNN. Returns the id.
      const text = typeof a.text === "string" ? a.text.trim() : "";
      if (!text) throw new Error('Write what happened first: give "text". Nothing was changed.');
      const bad = noteProblem(text, hctx());
      if (bad) throw new Error(`${bad} Nothing was changed.`);
      const kind = a.kind === undefined ? "note" : a.kind;
      if (!Object.prototype.hasOwnProperty.call(NOTE_POINTS, kind)) throw new Error('evidence.note kind must be "note", "shipped" or "win". Nothing was changed.');
      if (!isObj(s.evidence) || !Array.isArray(s.evidence.entries)) throw new Error("evidence.json is missing, so the note could not be saved. Nothing was changed.");
      const top = s.evidence.entries.map((e) => e.id).filter((i) => typeof i === "string" && i.startsWith("ev-")).map((i) => parseInt(i.slice(3), 10)).filter((x) => !Number.isNaN(x));
      const id = `ev-${String((top.length ? Math.max(...top) : 0) + 1).padStart(3, "0")}`;
      if (kind === "win") {
        if (!isObj(s.reach) || !isObj(s.reach.recognition) || !Array.isArray(s.reach.recognition.inbound_messages)) throw new Error("reach.json is missing, so a win could not be saved. Nothing was changed.");
        s.reach.recognition.inbound_messages.push({ date: today, from: text.slice(0, 80) });
        ts.push("reach");
      }
      const type = kind === "win" ? "market" : kind === "shipped" ? "shipped" : "note";
      s.evidence.entries.push({ id, date: today, type, title: text.split("\n")[0].slice(0, 90), detail: text, links: [], points: NOTE_POINTS[kind], by: "chat" });
      ts.push("evidence");
      ts.result = { ev: id };
      break;
    }
    case "case.remove": {
      const k = career.cases.findIndex((x) => x.id === a.id);
      if (k < 0) throw new Error(`There is no case study ${a.id}. Nothing was changed.`);
      career.cases.splice(k, 1);
      break;
    }
    case "cv.restore": {
      // One step Undo: the client keeps the career it had before and sends it back. The shape rules still apply; the html is rebuilt.
      if (!isObj(a.career)) throw new Error("There is nothing to bring back. Nothing was changed.");
      const back = clone(a.career);
      shapeOrThrow(back);
      // The earlier career must still pass the honesty check today (the dossier, the deny-list and the evidence may have changed).
      const hc = checkCareer(back, hctx());
      if (!hc.pass) {
        const bad = [...Object.entries(hc.versions).map(([id, r]) => [`CV ${id}`, r]), ...Object.entries(hc.cases).map(([id, r]) => [`Case study ${id}`, r])].find(([, r]) => !r.pass);
        throw refuse(bad[0], bad[1]);
      }
      s.career = { ...back, updated: today };
      for (const v of s.career.cv.versions) if (ALLOWED_REL.test(v.file)) ts.writes.push({ rel: v.file, text: renderCv(v) });
      break;
    }
    case "cv.pdf.set": {
      const v = findVersion(career, a.version);
      v.pdf = a.pdf;
      break;
    }
    case "cv.checks.set": {
      // Record only, like cv.pdf.set: today's honesty result goes into each version's (and each case's) stored checks, so what the app shows is
      // never older than the engine. Nothing else changes: not the lines, the pdf, `changed`, `promoted`, the html or the `updated` stamp.
      const h = hctx();
      if (h.loadProblems.length) throw new Error(`The honesty check could not run (${h.loadProblems[0]}). Nothing was changed.`);
      const same = (x, y) => JSON.stringify({ ...x, ran: 0 }) === JSON.stringify({ ...y, ran: 0 });
      let n = 0;
      for (const v of career.cv.versions) {
        const now = toStored(checkVersion(v, h));
        const was = v.checks && v.checks.honesty;
        if (!was || !same(was, now)) { v.checks = { honesty: now, ats: v.checks ? v.checks.ats : null }; n++; }
      }
      for (const c of career.cases) {
        const now = toStored(checkCase(c, h));
        const was = c.checks && c.checks.honesty;
        if (!was || !same(was, now)) { c.checks = { honesty: now }; n++; }
      }
      ts.result = { rechecked: n };
      return ts;
    }
    case "cv.promote.mark": {
      // id null clears the mark (cv-promote --undo)
      if (a.id !== null && a.id !== undefined) findVersion(career, a.id);
      for (const v of career.cv.versions) v.promoted = a.id !== null && a.id !== undefined && v.id === a.id;
      break;
    }
    default:
      throw new Error("Unknown career action. Nothing was changed.");
  }
  s.career.updated = today;
  return ts;
}

// ---- files -----------------------------------------------------------------------------------------------------------------------
const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
const ALLOWED_REL = /^cv\/drafts\/[A-Za-z0-9_.-]+\.html$/;

/**
 * Writes the html files an action made. An existing file whose content changes is copied first to cv/drafts/_history/<stamp>_<name>.
 * Only cv/drafts/<name>.html is ever written here: the canonical cv/CV.html and .pdf change only through cv-promote.
 */
export function writeCvFiles(appDir, writes, now = new Date()) {
  const done = [];
  for (const w of writes || []) {
    if (!ALLOWED_REL.test(w.rel)) throw new Error(`Refusing to write ${w.rel}: only cv/drafts/<name>.html can be written here.`);
    const abs = path.join(appDir, ...w.rel.split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    let old = null;
    try { old = fs.readFileSync(abs, "utf8"); } catch { /* new file */ }
    if (old === w.text) continue;
    if (old !== null) {
      const hist = path.join(path.dirname(abs), "_history");
      fs.mkdirSync(hist, { recursive: true });
      fs.writeFileSync(path.join(hist, `${stamp(now)}_${path.basename(abs)}`), old);
    }
    fs.writeFileSync(`${abs}.tmp`, w.text);
    fs.renameSync(`${abs}.tmp`, abs);
    done.push(w.rel);
  }
  return done;
}

/** The app folder that holds cv/ and data/: the parent of the data folder. */
export const appDirOf = (dataDir) => path.dirname(path.resolve(dataDir));
