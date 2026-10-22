// The honesty check for the CV and the case studies. Node only (it reads the dossier, the deny-list and two data files).
// Rules (handoff-docs/specs/cv-portfolio-spec.md):
//   1. Every number token in a bullet, beat or decision (digits, %, $, rupee, k/m suffix, x multipliers, number words) must appear in the
//      QUOTE of one of its own sources. Tokens are compared as tokens, not substrings: 1 does not match inside 2021, 40% is not 40.
//   2. Every quote must be found verbatim (whitespace normalised, nothing else) in its source: the dossier file, the answers in
//      data/onboarding.json (private answers and R3- answers are never a source), or data/evidence.json. A dossier quote must sit under
//      the section its `ref` names, and never under 3.9 (not his work) or 3.10 (confidential). A `dev` source (The person said it in chat) is
//      allowed for wording only: it never backs a number (save the fact as an evidence note first), and it is counted and listed.
//   3. The deny-list (cv/.denylist.json: phrases from dossier 3.9 and 3.10) must not appear anywhere in the text. Local only, never rendered.
//   4. Placeholders [NEEDS REAL NUMBER: ...] and [NEEDS: ...] are counted. They are not failures.
// It fails closed: a missing dossier or a missing deny-list is a failure, never a pass with nothing to compare.
// No import.meta here: callers pass paths in, because lib/ is also compiled into a temp folder by the store test.
import fs from "fs";
import path from "path";

export const DEFAULT_DOSSIER = ""; // unset by default: point GROWTH_DOSSIER at your own career notes file (see the README)
import { PLACEHOLDER_RE, normWs, countPlaceholders, stripPlaceholders, textSlots, versionTexts, placeholderList, listPlaceholders, caseTexts, caseNeeds } from "./career-needs.mjs";
export { PLACEHOLDER_RE, normWs, countPlaceholders, stripPlaceholders, textSlots, versionTexts, placeholderList, listPlaceholders, caseTexts, caseNeeds };
export const SOURCE_KINDS = ["dossier", "onboarding", "evidence", "dev"];
const MAX_QUOTE = 600;

// ---- number tokens ---------------------------------------------------------------------------------------------------------------
// A web address or email. A domain counts only when it starts with a letter ("100.in" is a number, "app.example.com" is not).
// One list of top-level domains for both the number rules and the "is this address the person's" rule (a host such as example.design is an address, never a number).
const TLD_BASE = "com|io|app|dev|in|ai|co|org|net|xyz";
const TLD_MORE = "design|website|site|me|page|pages|so|studio|online|tech|space|cloud|store|shop|info|ly|gg|fm|tv|run|sg|hk|uk|us|de";
const urlRe = (tlds) => new RegExp(`(?:https?:\\/\\/\\S+|\\b[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+|(?<![\\w.@-])[A-Za-z][\\w-]*(?:\\.[\\w-]+)*\\.(?:${tlds})\\b(?:\\/\\S*)?)`, "gi");
const URLISH = urlRe(`${TLD_BASE}|md|${TLD_MORE}`);
// The same without "md" (README.md is a file): used on free text to find an address that must be the person's.
const FREE_URL = urlRe(`${TLD_BASE}|${TLD_MORE}`);
// A hex colour: #rrggbb or #rrggbbaa always; #rgb only with a colour word close by ("#500" on its own is a number).
const HEX_LONG = /#(?:[0-9a-f]{8}|[0-9a-f]{6})\b/gi;
const HEX_SHORT = /#[0-9a-f]{3}\b/gi;
const COLOUR_WORD = /\b(?:colou?rs?|hex|palette|background|fill|accent|tint|shade|rgb|hsl|swatch|stroke|border)\b/i;
const stripShortHex = (t) => t.replace(HEX_SHORT, (m, off) => (COLOUR_WORD.test(t.slice(Math.max(0, off - 30), off + m.length + 30)) ? " " : m));
// A digit after a letter is a number too (GPT4, S3, iOS17), except in a short list of names that hold a digit (Web3, B2B, L2, v2, H1, Q3, 2D):
// see NAME_DIGITS. "x2" and "2x" stay multipliers. A currency code before a number is part of the number: "Rs 500" and "INR 500" are ₹500.
const NUM = /([$₹€£]|AED|SGD|HKD)?(\d+(?:,\d{3})*(?:\.\d+)?)(?:\s?(%|[mM][nNmM]|[bB][nN]|[kKmMbB]|[xX×])(?![A-Za-z]))?/g;
const NAME_DIGITS = /\b(?:Web[23]|B2[BC]|D2C|L[12]|v[1-9](?:\.\d+)*)\b/gi; // Q1-Q4 and H1/H2 are periods, so they stay numbers (handled in prep)
const NUMWORD_SRC = "zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety|ninty|hundred|thousand|million|billion|dozen";
// Words that name a quantity without a digit. "couple", "pair", "trio", "fortnight" and "both" always mean a count.
const EXTRA_WORDS = "couple|pair|trio|fortnight|both";
const NUMWORD = new RegExp(`\\b(${NUMWORD_SRC}|${EXTRA_WORDS}|dozens|hundreds|thousands|millions|billions|doubled|tripled|quadrupled|halved|half|twice|thrice|percent|double|doubles|doubling|triple|triples|tripling|quadruple|quadruples|quadrupling|quarter|quarters|crore|crores|lakh|lakhs|lac|lacs|multiples)\\b`, "gi");
// A number word and its digits are the same quantity: "ten seconds" and "10 seconds", "four-phase" and "4 phases".
const WORD_VALUE = { zero: "0", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20", thirty: "30", forty: "40", fourty: "40", fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90", ninty: "90" };
const TENS_VALUE = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, ninty: 90 };
const ONES_VALUE = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const valueOfWord = (w) => { const k = w.toLowerCase(); return WORD_VALUE[k] === undefined ? k : WORD_VALUE[k]; };
const TENS_ONES = /\b(twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety|ninty)[\s-](one|two|three|four|five|six|seven|eight|nine)\b/gi;
// Other ways to state a quantity: "once a week", "only once", "the second time", "first in", "first to", "first ever", "a week", "a month", "a year",
// "under a minute", "an order of magnitude", "single-digit", "double-digit". Each is a token a quote must carry.
const ONCE = /\bonce(?=\s+(?:a|an|per|every|each)\b)|\b(?:only|just)\s+once\b/gi;
const SECOND = /(?<!(?:\b(?:per|a|one|every|each)|\d)\s)(?<![\d-])\bsecond\b(?![\s-]*(?:hand|party|parties|class)\b)/gi;
const FIRST = /\bfirst(?=\s+(?:in|to|ever)\b)/gi;
const DURATION = /\ba\s+(week|month|year|fortnight)\b/gi;
const SHORT_SPAN = /\b(?:under|within|in|inside|less than)\s+a\s+(minute|hour|day)\b/gi;
const ORDER_MAG = /\border of magnitude\b/gi;
const DIGIT_BAND = /\b(?:single|double|triple)[\s-]digits?\b/gi;
// "a third", "one third", "third of" (a fraction or a rank), but not "a third party".
const THIRD = /\b(?:(?:a|one|each|every|two)[\s-]+third(?![\s-]*part(?:y|ies)\b)|thirds?\s+of)\b/gi;
// "a fifth", "one-fifth", "three sixths", "fifths of": fractions fifth to tenth, only when the fraction ends the phrase or is followed by "of".
const FRACTION = /\b(?:(?:a|one|each|every|two|three|four)[\s-]+(fifth|sixth|seventh|eighth|ninth|tenth)s?(?=\s+of\b|\s*[^\s\w]|\s*$)|(fifth|sixth|seventh|eighth|ninth|tenth)s\s+of\b)/gi;
// A roman numeral only counts after Phase, Series, Level, Part or Round ("Phase II"), upper case, 1 to 39. Its value is compared like a digit.
const ROMAN_CTX = /\b(?:[Pp]hase|[Ss]eries|[Ll]evel|[Pp]art|[Rr]ound)\s+(X{1,3}(?:IX|IV|V?I{0,3})|IX|IV|V?I{1,3}|V)\b/g;
const romanValue = (s) => { const v = { I: 1, V: 5, X: 10 }; let n = 0; for (let i = 0; i < s.length; i++) n += v[s[i]] < (v[s[i + 1]] || 0) ? -v[s[i]] : v[s[i]]; return n; };
// Honest phrases that only look like numbers.
const NOT_NUMBERS = [
  /\b(?:double|triple|zero|one)[\s-]?(?:check(?:ed|ing|s)?|click(?:ed|ing|s)?|tap(?:ped|ping|s)?|blind)\b/gi,
  /\b(?:zero|one)[\s-]to[\s-](?:one|zero)\b/gi,
  /\bzero[\s-](?:state|states|click|ui|party|friction|config|trust|downtime|day)\b/gi,
  /\blayers?[\s-]?\d+\b/gi, // Layer 2 (L2 is skipped by the letter-before-digit rule)
  /\b[23]D\b/g, // 2D, 3D
];
const TIMES = /(\d)\s*times\b/gi;

// Characters that show nothing (zero-width, soft hyphen, bidi marks, joiners), stripped before any comparison.
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/g;
// Cyrillic and Greek letters that look like Latin ones, folded to the Latin letter.
const CONFUSABLE = {};
for (const [from, to] of [
  ["АВЕКМНОРСТХУІЈЅ", "ABEKMHOPCTXYIJS"], ["аекорсхуіјѕԁԛԝ", "aekopcxyijsdqw"],
  ["ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ", "ABEZHIKMNOPTYX"], ["αινορυχκ", "aivopuxk"],
]) for (let i = 0; i < from.length; i++) CONFUSABLE[from[i]] = to[i];
CONFUSABLE["Ӏ"] = "I"; // Cyrillic palochka
const CONFUSABLE_RE = new RegExp(`[${Object.keys(CONFUSABLE).join("")}]`, "g");
// First code point of each block of ten non-ASCII decimal digits (Arabic-Indic, Devanagari, Bengali, Thai and the rest).
const DIGIT_ZEROS = [0x660, 0x6F0, 0x7C0, 0x966, 0x9E6, 0xA66, 0xAE6, 0xB66, 0xBE6, 0xC66, 0xCE6, 0xD66, 0xDE6, 0xE50, 0xED0, 0xF20, 0x1040, 0x1090, 0x17E0, 0x1810, 0x1946, 0x19D0, 0x1A80, 0x1A90, 0x1B50, 0x1BB0, 0x1C40, 0x1C50, 0xA620, 0xA8D0, 0xA900, 0xA9D0, 0xA9F0, 0xAA50, 0xABF0, 0xFF10];
const digitOf = (ch) => { const cp = ch.codePointAt(0); const z = DIGIT_ZEROS.find((s) => cp >= s && cp < s + 10); return z === undefined ? ch : String(cp - z); };

/**
 * The one normal form for everything the honesty check compares (numbers, deny-list, quotes, links): NFKC (full-width digits and
 * letters, ligatures, fractions), invisible characters removed, other scripts' digits to 0-9, Arabic percent to %, and Cyrillic and
 * Greek look-alike letters to Latin. Not lower-cased and whitespace is left alone (use norm for quotes).
 */
export function foldText(s) {
  let t = String(s ?? "").normalize("NFKC").replace(INVISIBLE, "");
  t = t.replace(/\p{Nd}/gu, (ch) => (ch >= "0" && ch <= "9" ? ch : digitOf(ch))).replace(/[٪﹪]/g, "%");
  return t.replace(CONFUSABLE_RE, (c) => CONFUSABLE[c]);
}
/** foldText, then whitespace normalised: what a quote and the text it is searched in are both turned into. */
// Markdown emphasis (** and *) is not part of what was said: it is stripped on both sides (the quote and the text it is searched in).
// A bracketed tag such as "[Requested/Reported]" is stripped too, but only as a second try (normBare): a quote is first looked for with
// its brackets (a source can say "[after team correction]"), and when that fails, with the tags gone from both sides. A "[text](url)" link is kept.
const MD_TAG = /\s*\[[^\[\]\n]{1,60}\](?!\()/g;
const norm = (s) => normWs(foldText(s).replace(/\*+/g, ""));
const normBare = (s) => normWs(foldText(s).replace(/\*+/g, "").replace(MD_TAG, ""));
// "one in ten", "threefold", "3-fold": a quantity written another way. They need a matching quote like any digit.
// "one in three", "one in 5", "one in a hundred": a ratio. "one in" before any other word ("one in the team") is not a number.
const ONE_IN = new RegExp(`\\bone in (?=\\d|an?\\b|(?:${NUMWORD_SRC})\\b)`, "gi");
// "threefold", "ten-fold", "3 fold": any number word (or digits) before "fold".
const FOLD = new RegExp(`\\b(?:(${NUMWORD_SRC})|(\\d+))[\\s-]?fold\\b`, "gi");
const PERCENT_AFTER_DIGIT = /(\d)[\s-]*(?:per[\s-]?cent|percent)\b/gi;
const BIG_WORD = { million: "m", thousand: "k", billion: "b" };

/** The integer as written, without commas or leading zeros ("01" and "1" are the same count: Phase 01, Phase 1). */
const cleanInt = (s) => s.replace(/,/g, "").replace(/^0+(?=\d)/, "");

/** The number tokens of a text, canonical form. Placeholders, urls, emails and hex colours are left out first. */
/** The text the number rules read: placeholders, urls, emails and hex colours out, one spelling for each way of writing a quantity. */
function prep(text) {
  // Placeholders go first, on the raw text: a look-alike "[NEEDS:" is not a placeholder and its numbers count. Then everything is folded.
  // "40 percent" and "40%" are the same quantity; "per cent" is "percent"; "20 times" is "20x"; "20mn" is "20m"; "2 million" is "2m";
  // "x2" is "2x"; "twenty-five" is 25; a number word is its digits (compared as values, not as strings).
  let t = foldText(stripPlaceholders(text)).replace(URLISH, " ").replace(HEX_LONG, " ");
  t = stripShortHex(t).replace(PERCENT_AFTER_DIGIT, "$1%").replace(/\bper cent\b/gi, "percent").replace(TIMES, "$1x");
  for (const re of NOT_NUMBERS) t = t.replace(re, " ");
  t = t.replace(NAME_DIGITS, " ");
  // A currency code or "Rs" before a number is the currency sign: "Rs 500", "INR 500" and "₹500" are one amount.
  t = t.replace(/\b(?:Rs\.?|INR)\s?(?=\d)/gi, () => "₹").replace(/\bUSD\s?(?=\d)/gi, () => "$").replace(/\bEUR\s?(?=\d)/gi, () => "€").replace(/\bGBP\s?(?=\d)/gi, () => "£").replace(/\b(AED|SGD|HKD)\s?(?=\d)/gi, (_, c) => c.toUpperCase());
  t = t.replace(/(?<![A-Za-z0-9])[xX×](\d+(?:\.\d+)?)(?![\w])/g, "$1x").replace(/\b([QqHh])([1-4])\b/g, "$1 $2");
  t = t.replace(/(\d)\s*(million|thousand|billion)\b/gi, (_, d, w) => `${d}${BIG_WORD[w.toLowerCase()]}`);
  t = t.replace(TENS_ONES, (_, a, b) => String(TENS_VALUE[a.toLowerCase()] + ONES_VALUE[b.toLowerCase()]));
  return t;
}
/** One NUM match as its canonical token. */
function numTok(m) {
  const unit = (m[3] || "").toLowerCase().replace("×", "x").replace(/^(?:mn|mm)$/, "m").replace(/^bn$/, "b");
  const [whole, ...frac] = m[2].split(".");
  return `${m[1] || ""}${cleanInt(whole)}${frac.length ? `.${frac.join(".")}` : ""}${unit}`;
}

export function numberTokens(text) {
  if (typeof text !== "string" || !text) return [];
  const t = prep(text);
  const out = [];
  for (const m of t.matchAll(NUM)) out.push(numTok(m));
  for (const m of t.matchAll(NUMWORD)) out.push(valueOfWord(m[1]));
  for (const _ of t.matchAll(ONCE)) out.push("once");
  for (const _ of t.matchAll(SECOND)) out.push("second");
  for (const _ of t.matchAll(FIRST)) out.push("first");
  for (const m of t.matchAll(DURATION)) out.push(`a ${m[1].toLowerCase()}`);
  for (const m of t.matchAll(SHORT_SPAN)) out.push(`a ${m[1].toLowerCase()}`);
  for (const _ of t.matchAll(ORDER_MAG)) out.push("order of magnitude");
  for (const _ of t.matchAll(DIGIT_BAND)) out.push("digit");
  for (const _ of t.matchAll(THIRD)) out.push("third");
  for (const m of t.matchAll(FRACTION)) out.push((m[1] || m[2]).toLowerCase());
  for (const m of t.matchAll(ROMAN_CTX)) out.push(String(romanValue(m[1])));
  for (const m of t.matchAll(FOLD)) { out.push(m[1] ? valueOfWord(m[1]) : cleanInt(m[2])); out.push("fold"); }
  for (const _ of t.matchAll(ONE_IN)) out.push("one in");
  return out;
}

// ---- walking the data ------------------------------------------------------------------------------------------------------------
// textSlots, versionTexts, placeholderList, caseTexts and caseNeeds live in lib/career-needs.mjs (pure, shared with the app).

/** Every string in a value, with a label. Used for the deny-list, which looks at everything but the pasted job post. */
function allStrings(value, label, out = [], skip = () => false) {
  if (typeof value === "string") { out.push({ where: label, text: value }); return out; }
  if (Array.isArray(value)) { value.forEach((x, i) => allStrings(x, `${label}[${i}]`, out, skip)); return out; }
  if (value && typeof value === "object") for (const [k, x] of Object.entries(value)) { if (skip(k)) continue; allStrings(x, label ? `${label}.${k}` : k, out, skip); }
  return out;
}

// ---- sources ---------------------------------------------------------------------------------------------------------------------
/** Flattens a JSON value to [{ref, text}] for the nearest id: answers by id, evidence entries by id. */
function flattenById(obj, idKey) {
  const out = [];
  const strs = (v, acc) => { if (typeof v === "string") acc.push(v); else if (Array.isArray(v)) v.forEach((x) => strs(x, acc)); else if (v && typeof v === "object") Object.values(v).forEach((x) => strs(x, acc)); return acc; };
  const row = (base, v) => { const ss = strs(v, []); return { ...base, text: norm(ss.join(" ")), parts: ss.map(norm), bt: normBare(ss.join(" ")), bparts: ss.map(normBare) }; };
  if (Array.isArray(obj)) for (const e of obj) out.push(row({ ref: e && e[idKey], by: e && e.by, type: e && e.type, title: e && typeof e.title === "string" ? e.title : "" }, e));
  else if (obj && typeof obj === "object") for (const [k, v] of Object.entries(obj)) out.push(row({ ref: k }, v));
  return out;
}

/** Puts the evidence entries a list has built in memory (not yet on disk) into a context, so a later action can cite them. */
export function withEvidence(ctx, entries) {
  ctx.evidence = flattenById(entries, "id");
  ctx.haystack = [ctx.dossier || "", ...ctx.onboarding.map((x) => x.text), ...ctx.evidence.map((x) => x.text)].join(" \n ");
  return ctx;
}

/**
 * The dossier as one whitespace-normalised string (the same text normWs would give) plus its numbered headings with their offsets in it:
 * [{ at, num: "3.4" }]. "## 3. Title" gives num "3"; "### 3.10 Title" gives "3.10".
 */
// Evidence tags (dossier section 0): [Fact] [Shown] [Reported] [Requested] [Proposed] [Analysis] [Unknown]. A tag sits at the end of the line it
// describes ("Rewrote the walkthrough. **[Reported]**"), on a heading ("## 8. Analysis [Analysis]"), or on a parent line whose sub-lines it covers.
// Only the first word of each part counts: "[Requested/Shown]" is Requested and Shown, "[Shown, 8 Sep 2026]" is Shown.
const TAG_WORDS = new Set(["fact", "shown", "reported", "requested", "proposed", "analysis", "unknown"]);
const TAG_RE = /\[([^\[\]\n]{1,60})\](?!\()/g;
/** The evidence tags (lower case) on one line of the career file. */
export function lineTags(line) {
  const out = [];
  for (const m of foldText(line).replace(/\*+/g, "").matchAll(TAG_RE)) for (const part of m[1].split(/[\/,]/)) { const w = (/^\s*([A-Za-z]+)/.exec(part) || [])[1]; if (w && TAG_WORDS.has(w.toLowerCase())) out.push(w.toLowerCase()); }
  return [...new Set(out)];
}
/** Tags that record a request, a proposal, a report or an analysis: not proof the person did the work. A line with Fact or Shown beside them is not weak. */
const WEAK_TAGS = ["proposed", "requested", "reported", "analysis"];
const STRONG_TAGS = ["fact", "shown"];
/** The weak tag a set of tags amounts to ("" when the tags prove the work, are empty or unknown). */
export const weakTag = (tags) => { const t = tags || []; return t.length && !t.some((x) => STRONG_TAGS.includes(x)) ? (WEAK_TAGS.find((w) => t.includes(w)) || "") : ""; };
export function parseDossier(raw) {
  let text = "";
  const heads = [];
  // The tags of every line, with the line's span in `text` and in `bare` (the same text without bracketed tags).
  const spans = [];
  const bareSpans = [];
  const stack = []; // { indent, tags } of the lines above, for sub-lines that inherit a parent's tags
  let h2Tags = [];
  let h3Tags = [];
  const blocked = []; // the lines under 3.9 and 3.10 (and anything beneath them), then those sections joined
  let inBlocked = false;
  let joined = "";
  const flush = () => { if (joined) blocked.push(joined); joined = ""; };
  // The same text with bracketed tags removed (the second try for a quote), with its own heading offsets.
  let bare = "";
  const bareHeads = [];
  for (const line of String(raw).split(/\r\n|\r|\n/)) {
    // This line's tags: its own, else its parent line's (a shallower line above), else its heading's.
    const own = lineTags(line);
    const isHead = /^\s{0,3}#{1,6}\s/.test(line);
    const level = isHead ? (/^\s{0,3}(#+)/.exec(line)[1].length) : 0;
    const indent = (/^[ \t]*/.exec(line)[0].replace(/\t/g, "    ")).length;
    let tags = own;
    if (isHead) { stack.length = 0; if (level <= 2) { h2Tags = own; h3Tags = []; } else if (level === 3) h3Tags = own; if (!own.length && level >= 3) tags = h3Tags.length ? h3Tags : h2Tags; }
    else {
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      if (!tags.length) tags = (stack.length ? stack[stack.length - 1].tags : []).length ? stack[stack.length - 1].tags : (h3Tags.length ? h3Tags : h2Tags);
      if (normWs(line)) stack.push({ indent, tags });
    }
    const b = normBare(line);
    if (b) {
      if (bare) bare += " ";
      const bm = /^#{2,4}\s+(\d+(?:\.\d+)*)(?![\d])/.exec(b);
      if (bm) bareHeads.push({ at: bare.length, num: bm[1] });
      bareSpans.push({ at: bare.length, end: bare.length + b.length, tags });
      bare += b;
    }
    const t = norm(line);
    if (!t) continue;
    if (text) text += " ";
    const m = /^#{2,4}\s+(\d+(?:\.\d+)*)(?![\d])/.exec(t);
    if (m) { heads.push({ at: text.length, num: m[1] }); const was = inBlocked; inBlocked = BLOCKED_SECTION.test(m[1]); if (was && !inBlocked) flush(); }
    if (inBlocked) { blocked.push(t); joined += `${joined ? " " : ""}${t}`; }
    spans.push({ at: text.length, end: text.length + t.length, tags });
    text += t;
  }
  flush();
  return { text, heads, blocked, bare, bareHeads, spans, bareSpans };
}
/** The tags of every line that a stretch [from, to) of the text touches, joined. */
const tagsBetween = (spans, from, to) => [...new Set((spans || []).filter((s) => s.at < to && s.end > from).flatMap((s) => s.tags))];
/** The number of the nearest heading before an offset, or "" when there is none. */
const headingAt = (heads, offset) => { let num = ""; for (const h of heads) { if (h.at <= offset) num = h.num; else break; } return num; };
/** 3.9 (not the person's work) and 3.10 (confidential), and anything beneath them. */
const BLOCKED_SECTION = /^3\.(?:9|10)(?:\.|$)/;
const refNumber = (ref) => { const m = /^\s*(?:section\s+|§\s*)?(\d+(?:\.\d+)*)/i.exec(String(ref ?? "")); return m ? m[1] : ""; };
const refMatches = (ref, num) => !!ref && (ref === num || ref.startsWith(`${num}.`) || (ref.includes(".") && num.startsWith(`${ref}.`)));

/**
 * The products the career file calls "in development" (a product still being built): read from every line that says so. A table row gives its first cell,
 * a heading its title before the bracket, any other line the words before "is" or "are". "The" is dropped.
 */
export function inDevEntities(raw) {
  const out = [];
  for (const line0 of String(raw ?? "").split(/\r\n|\r|\n/)) {
    const line = foldText(line0).replace(/[*`]+/g, "");
    if (!IN_DEV.test(line)) continue;
    let name = "";
    if (/^\s*\|/.test(line)) name = line.split("|")[1] || "";
    else if (/^\s{0,3}#{1,6}\s/.test(line)) name = line.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/^\d+(?:\.\d+)*\.?\s+/, "").split(/[(,]/)[0];
    else { const m = /^\s*(?:[-+]\s+|\d+\.\s+)?(.+?)\s+(?:is|are|was|were|remains?|stays?)\b/i.exec(line); name = m ? m[1] : ""; }
    name = name.replace(/^\s*(?:the|a|an)\s+/i, "").replace(/[^\p{L}\p{N}\s.$'-]+/gu, " ").replace(/\s+/g, " ").trim();
    if (name && name.split(" ").length <= 4 && /^[\p{Lu}$]/u.test(name) && !out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}
/** The "owned-..." and "founding-..." compounds the career file itself uses (lower case). */
const dossierCompounds = (text) => new Set([...foldText(text).matchAll(COMPOUND)].map((m) => m[0].toLowerCase()));

// ---- the deny-list ---------------------------------------------------------------------------------------------------------------
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STOPWORDS = new Set(["of", "the", "a", "an", "and", "for", "to", "in", "on", "by", "with"]);
const SUFFIX = /(ations|ation|ances|ance|ences|ence|ings|ing|ions|ion|ies|ied|ed|es|s|e)$/i;
const SEP = "[\\s,\\-\\/()\"'\\u2019\\u201c\\u201d&\\u2010-\\u2015\\u2212_.]+";
/** One word of a deny-list phrase as a regex source that also matches its inflections: insurance -> insur\w*, treasury -> treasur(?:y|ies|ied). */
function wordSource(w) {
  if (/[^A-Za-z]/.test(w)) return esc(w);
  if (STOPWORDS.has(w.toLowerCase())) return esc(w);
  if (w.length >= 4 && /y$/i.test(w)) return `${esc(w.slice(0, -1))}(?:y|ies|ied)`;
  let base = w;
  const m = SUFFIX.exec(w);
  if (m && w.length - m[0].length >= 3) { base = w.slice(0, -m[0].length); if (/^ation/i.test(m[0]) && /i$/i.test(base) && base.length > 4) base = base.slice(0, -1); }
  if (base.length >= 5) return `${esc(base)}\\w*`;
  // A short word matches only its own forms (fee, fees; time is not timing, feed is not fee): the singular, plural, -ed and -ing.
  const one = w.length >= 4 && /s$/i.test(w) && !/ss$/i.test(w) ? w.slice(0, -1) : w;
  const forms = new Set([one, /(?:s|x|sh|ch)$/i.test(one) ? `${one}es` : `${one}s`]);
  if (one.length >= 4) { if (/e$/i.test(one)) { forms.add(`${one}d`); forms.add(`${one.slice(0, -1)}ing`); } else { forms.add(`${one}ed`); forms.add(`${one}ing`); } }
  return `(?:${[...forms].map(esc).join("|")})`;
}
/**
 * The regexes of one deny-list term. A case-sensitive term is matched exactly. Any other term matches its words with their inflections,
 * in order. Only a term marked "reorder": true (two content words, still unambiguous in either order) also matches both orders with up
 * to three words between them ("distribution to the holders", "holders receive distributions"). A term can set "stem": false to be matched as written.
 */
function termRules(t) {
  const term = String(t.term).trim();
  const bound = (src) => new RegExp(`(?<![A-Za-z0-9])${src}(?![A-Za-z0-9])`, t.caseSensitive ? "" : "i");
  if (t.caseSensitive || t.stem === false) return [bound(term.split(/\s+/).map(esc).join("\\s+"))];
  const words = term.split(/[\s\-\/]+/).filter(Boolean);
  const srcs = words.map(wordSource);
  const rules = [bound(srcs.join(SEP))];
  const content = words.map((w, i) => ({ w, i })).filter((x) => !STOPWORDS.has(x.w.toLowerCase()));
  if (t.reorder === true && content.length === 2) {
    const [a, b] = [srcs[content[0].i], srcs[content[1].i]];
    const gap = `(?:${SEP}\\w+){0,3}${SEP}`;
    rules.push(bound(`${a}${gap}${b}`), bound(`${b}${gap}${a}`));
  }
  return rules;
}
// Confidential figures (dossier 3.10) in every wording, always on whatever the deny-list file says: a fleet count, a return, an amount raised,
// each as digits or in number words ("forty machines", "twelve percent", "two million"), "percent" or "%". Applied by denyHit, so the deny
// scan of a version or case, the "withheld" rule and the evidence note check all use them.
const NW = `(?:${NUMWORD_SRC})`;
const PCT = `[~(\\u2248<>]?(?:\\d+(?:\\.\\d+)?|${NW}(?:[\\s-]+${NW})?)[\\s-]*(?:%|percent|per[\\s-]?cent)(?![A-Za-z])`;
// "returning users" is the people, not the money.
const RET = "(?:APR|APY|IRR|returns?(?!\\s+(?:rates?|visits?|paths?)\\b)|returned|returning(?!\\s+(?:users?|customers?|visitors?|clients?|members?|players?|buyers?|readers?))|yields?|yielded|yielding)";
const GAP = "(?:\\s+[^\\s.;!?]+){0,5}?";
const BIG = "(?:hundred|thousand|million|billion|crore|lakh|lac)s?";
const SUM = `(?:\\d[\\d,.]*|${NW})[\\s-]+${BIG}\\b`;
const RAISE = "\\brais(?:e|ed|es|ing)\\b";
// A count as digits or number words ("fifty", "fifty five", "a hundred and fifty"), and the machine words a fleet count sits beside.
const NWP = `(?:${NW}(?:[\\s-]+(?:and[\\s-]+)?${NW}){0,3})`;
const CNT = `(?:\\d[\\d,]*|${NWP})`;
// A map, list, view or card that shows N machines is a line about the screen, not a fleet count.
const UI_SHOWS = "(?<!\\b(?:map|list|grid|view|card|cards)\\s+(?:shows?|displays?|lists?|renders?|with)\\s+(?:(?:about|around|nearly|over|just|only)\\s+)?)";
const FLEET_Q ="(?:(?:vending|kiosk|store|outlet|site)[\\s,/&-]+(?:(?:and|or)[\\s,/&-]+)?){0,4}";
// A machine, a robot, an asset or a unit is the fleet, with or without a qualifier. Only "units of <something>" ("three units of work") is left alone.
const FLEET_PLURAL = "(?:machines|robots|assets|units(?!\\s+of\\b))";
// "two machine learning demos" is not a fleet; a singular unit counts only as "machine" (not before learning, vision and the like) or before "fleet".
const FLEET_ONE = "(?:machine(?![\\s-]+(?:learning|vision|translation|code|readable|intelligence|language|models?|gun|shop|room|cards?|views?|states?|pages?))|(?:unit|robot|asset)(?=[\\s-]+(?:fleet|park|network|portfolio|pool)\\b))";
// An amount: a percent, a currency amount, a number with k, m or a big word, or a number in words with a big word.
const AMT = `(?:[~(\\u2248<>]?[$\\u20b9\\u20ac\\u00a3]\\s?\\d[\\d,.]*(?:\\s?(?:k|m|mn|bn|b|million|billion|thousand|crore|lakh|lac|cr)\\b)?|(?<![\\w.])\\d[\\d,.]*\\s?(?:k|m|mn|bn|b|million|billion|thousand|crore|lakh|lac|cr)\\b|(?<![\\w.])${PCT}|(?<![\\w])${SUM})`;
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may(?=\\s+\\d)|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WHEN = `(?:${MONTH}\\b(?:\\s+\\d{1,2}(?:st|nd|rd|th)?)?|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b|\\b[qh][1-4]\\b|(?:first|second|third|fourth|1st|2nd|3rd|4th)\\s+quarter|(?:next|this|coming)\\s+(?:quarter|month)|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4})`;
const FEE = "\\b(?:fees?|commissions?|revenue[\\s-]shares?|take[\\s-]rates?)\\b";
const LAUNCH = "\\b(?:launch(?:es|ed|ing)?|go[\\s-]live|goes\\s+live|going\\s+live|mainnet)\\b";
const FUNDING = "\\b(?:funding|deposit)[\\s-]targets?\\b";
// "pre-deposit" alone is a phase or a page: it counts only beside a money word (target, goal, raise, a currency sign or a money amount).
const PRE_DEPOSIT = "\\bpre[\\s-]?deposits?\\b(?![\\s-]+(?:pages?|phases?|screens?|flows?|states?|views?|cta|journey|stage))";
const MONEY_WORD = /(?:target|goal|rais|[$₹€£]|\b(?:usd|usdc|dollars?|rupees?|inr|crores?|lakhs?|million|thousand)\b|\d\s?(?:k|m|mn|bn)\b)/i;
// A count followed by people ("1,227 sign-ups", "300 depositors") is not an amount of money.
const PEOPLE_AFTER = "(?!\\s*-?\\s*(?:sign[\\s-]?ups?|depositors?|wallets?|users?|people|visitors?|members?|participants?|subscribers?|customers?|investors?|holders?|referrals?|emails?|followers?)\\b)";
const PLAIN_AMT = "(?<![\\w.])(?!(?:19|20)\\d\\d\\b)\\d[\\d,]{2,}\\b";
const FUND_AMT = `(?:(?:${AMT}|${PLAIN_AMT})${PEOPLE_AFTER})`;
const WITHIN ="[^\\w\\s.;!?]{0,2}";
// A noun beside a figure, either order, within about five words.
const near = (a, b) => [`${a}${WITHIN}${GAP}\\s+${b}`, `(?<![\\w.])${b}[,)]?${GAP}\\s+${a}`];
const BUILT_IN_DENY = [
  ["a fleet count (a number of machines)", `${UI_SHOWS}\\b${CNT}[\\s-]+${FLEET_Q}${FLEET_PLURAL}\\b`],
  ["a fleet count (a number of machines)", `\\b${CNT}[\\s-]+${FLEET_Q}${FLEET_ONE}\\b`],
  ["a fleet count (fleet of a number)", `\\bfleet\\s+of\\s+(?:(?:about|around|nearly|over|roughly|approximately|some|just|only|up\\s+to)\\s+)?${CNT}\\b`],
  ["a fleet count (a number-strong fleet)", `\\b${CNT}[\\s-]+strong\\s+fleet\\b`],
  ["a return percentage (a percent beside return, yield, APR, APY or IRR)", `(?<![\\w.])${PCT}[,)]?${GAP}\\s+${RET}\\b`],
  ["a return percentage (return, yield, APR, APY or IRR beside a percent)", `\\b${RET}\\b${GAP}\\s+${PCT}`],
  ["an amount raised (raise beside an amount in words or digits)", `${RAISE}${GAP}\\s+${SUM}`],
  ["an amount raised (an amount in words or digits beside raise)", `(?<![\\w])${SUM}${GAP}\\s+${RAISE}`],
  ...near(FEE, AMT).map((s) => ["a fee or commission figure (a fee, commission, revenue share or take rate beside a percent or an amount)", s]),
  ...near(LAUNCH, WHEN).map((s) => ["launch timing (a launch or go-live beside a date, month or quarter)", s]),
  ...near(FUNDING, FUND_AMT).map((s) => ["a funding or deposit target (a target beside an amount)", s]),
  ...near(PRE_DEPOSIT, FUND_AMT).map((s) => ["a funding or deposit target (a pre-deposit beside an amount and a money word)", s, MONEY_WORD]),
].map(([label, src, need]) => ({ label, re: new RegExp(src, "i"), from: "3.10", ...(need ? { need } : {}) }));
/** foldText, then "40 percent", "40-percent" and "40 per-cent" as 40%, and "twelve-percent" as twelve%: the form the deny patterns for return and raise figures look for. */
const denyFold = (text) => foldText(text).replace(PERCENT_AFTER_DIGIT, "$1%").replace(new RegExp(`\\b(${NW}(?:[\\s-]+${NW})?)[\\s-]*(?:per[\\s-]?cent|percent)(?![A-Za-z])`, "gi"), "$1%");
/** Does any deny-list rule match this text (folded first, so look-alike letters and invisible characters do not hide a term)? */
// U+04C0 (Cyrillic palochka) looks like a capital I or a lowercase l, so a text that holds one is checked both ways.
const denyVariants = (text) => { const s = String(text ?? ""); return s.includes("Ӏ") ? [s, s.replace(/Ӏ/g, "l")] : [s]; };
const ruleHits = (d, t) => d.re.test(t) && (!d.need || d.need.test(t));
export const denyHit = (deny, text) => denyVariants(text).some((v) => { const t = denyFold(v); return (deny || []).some((d) => ruleHits(d, t)); });
/** The deny-list rules that match a text (same folding as denyHit). */
const denyMatches = (deny, text) => denyVariants(text).flatMap((v) => { const t = denyFold(v); return (deny || []).filter((d) => ruleHits(d, t)); });

/**
 * Loads what a check needs. Nothing throws: what is missing becomes `problems`, and a check with problems fails.
 * opts: { dataDir, dossierPath, denylistPath }  (defaults: env GROWTH_DOSSIER, else none, <dataDir>/../cv/.denylist.json)
 */
export function makeContext(opts = {}) {
  const dataDir = opts.dataDir ? path.resolve(opts.dataDir) : null;
  const dossierPath = opts.dossierPath || process.env.GROWTH_DOSSIER || DEFAULT_DOSSIER;
  const denylistPath = opts.denylistPath || (dataDir ? path.join(path.dirname(dataDir), "cv", ".denylist.json") : null);
  const ctx = { dataDir, dossierPath, denylistPath, now: opts.now || new Date(), loadProblems: [], inDevNames: [], compounds: new Set(), dossier: null, dossierHeads: [], blocked: [], onboarding: [], privateAnswers: [], evidence: [], deny: [], haystack: "" };
  try { const raw = fs.readFileSync(dossierPath, "utf8"); const d = parseDossier(raw); ctx.inDevNames = inDevEntities(raw); ctx.compounds = dossierCompounds(d.text); ctx.dossier = d.text; ctx.dossierHeads = d.heads; ctx.blocked = d.blocked; ctx.dossierBare = d.bare; ctx.dossierBareHeads = d.bareHeads; ctx.dossierSpans = d.spans; ctx.dossierBareSpans = d.bareSpans; } catch { ctx.loadProblems.push(`The career file was not found at ${dossierPath}, so quotes cannot be checked. Set GROWTH_DOSSIER or pass --dossier.`); }
  if (dataDir) {
    try {
      const o = JSON.parse(fs.readFileSync(path.join(dataDir, "onboarding.json"), "utf8"));
      // Private answers and every Round 3 answer (R3-) are never a source: a CV or case study must not carry them, so a quote of one fails.
      const open = {};
      const closed = {};
      for (const [id, a] of Object.entries((o && o.answers) || {})) { if (!/^R3-/.test(id) && !(a && a.private)) open[id] = a; else closed[id] = a; }
      ctx.onboarding = flattenById(open, "id");
      ctx.privateAnswers = flattenById(closed, "id");
    } catch { /* none yet: onboarding quotes then fail by themselves */ }
    try { const e = JSON.parse(fs.readFileSync(path.join(dataDir, "evidence.json"), "utf8")); ctx.evidence = flattenById(e && e.entries, "id"); } catch { /* same */ }
  }
  try {
    const dl = JSON.parse(fs.readFileSync(denylistPath, "utf8"));
    const terms = (dl.terms || []).map((t) => (typeof t === "string" ? { term: t } : t)).filter((t) => t && t.term);
    const pats = (dl.patterns || []).filter((p) => p && p.pattern);
    ctx.deny = [
      ...terms.flatMap((t) => termRules(t).map((re) => ({ label: t.term, re, from: String(t.from ?? "").trim() }))),
      ...pats.map((p) => ({ label: p.label || p.pattern, re: new RegExp(p.pattern, p.flags || "i"), from: String(p.from ?? "").trim(), ...(p.need ? { need: new RegExp(p.need, "i") } : {}) })),
    ];
    if (!ctx.deny.length) ctx.loadProblems.push(`The deny-list at ${denylistPath} is empty, so confidential terms cannot be checked.`);
  } catch { ctx.loadProblems.push(`The deny-list was not found at ${denylistPath}, so confidential terms cannot be checked.`); }
  ctx.deny.push(...BUILT_IN_DENY);
  ctx.haystack = [ctx.dossier || "", ...ctx.onboarding.map((x) => x.text), ...ctx.evidence.map((x) => x.text)].join(" \n ");
  return ctx;
}

/** The start of a quote for a message. A quote that holds a deny-list item is never repeated. */
const echo = (q, n, ctx) => (denyHit(ctx.deny, q) ? "(withheld: it holds a confidential item)" : `${q.slice(0, n)}${q.length > n ? "..." : ""}`);

/** Words that show a line says who said it: a third-party quote (an expert or the market) may back a line only when the line attributes it. */
const ATTRIBUTES = /\b(said|says|wrote|writes|told|recommend(?:ed|s|ation|ations)?|according to|described|noted|praised)\b|"[^"]+"|“[^”]+”/i;
const ATTR_VERB = /^(?:said|says|wrote|writes|told|recommend(?:ed|s|ation|ations)?|described|noted|praised|according)$/i;
// Capitalised words that are not a person's or a company's name.
const NOT_NAMES = new Set(("the a an he she they it we i you my his her their our this that these those one someone everyone anyone people dev " +
  "recruiter recruiters manager managers client clients colleague colleagues lead leads founder founders ceo cto designer designers developer developers engineer engineers " +
  "teammate teammates mentor mentors reviewer reviewers customer customers user users buyer buyers hiring team teams company market expert experts industry report article post study survey " +
  "and but as after before when while then also which who later once in on at by for from with to of if so per not no yes every each some many most all both several another other others " +
  "feedback note notes comment comments review reviews quote quotes message messages email emails according " +
  // Companies, products and platforms are not people: "Acme users said" names nobody.
  "linkedin figma vercel github penpot framer claude codex comfyui").split(" "));
const stripEdge = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
const isQuoteOpen = (w) => /^["“]/.test(w);
const isQuoteClose = (w) => /["”][^\p{L}\p{N}]*$/u.test(w);
/** Is this word a name? Capitalised, not a stop word, and (at the start of a sentence) followed by a verb of saying or another capitalised word. */
function nameAt(ws, i) {
  const x = stripEdge(ws[i]).replace(/['’]s$/i, "");
  if (x.length < 2 || !/^\p{Lu}[\p{L}'’-]*$/u.test(x) || NOT_NAMES.has(x.toLowerCase()) || ATTR_VERB.test(x)) return false;
  const start = i === 0 || /[.!?:]["”)]*$/.test(ws[i - 1]);
  if (!start) return true;
  const nx = ws[i + 1] === undefined ? "" : stripEdge(ws[i + 1]);
  return ATTR_VERB.test(nx) || (/^\p{Lu}/u.test(nx) && !NOT_NAMES.has(nx.toLowerCase())) || /['’]s$/i.test(stripEdge(ws[i]));
}
/**
 * Does the line say WHO said it? A name (a capitalised word) must sit within three words of a verb of saying ("Priya wrote", "according to
 * Priya") or of a quote mark. Failing that, the line must still use a verb or quote mark and hold a name taken from the evidence entry's
 * own title (`titles`).
 */
export function attributes(text, titles = []) {
  const ws = String(text ?? "").split(/\s+/).filter(Boolean);
  const inQuote = [];
  let open = false;
  ws.forEach((w, i) => {
    const o = isQuoteOpen(w);
    const c = isQuoteClose(w);
    if (o && !c) open = true;
    inQuote[i] = open || (o && c);
    if (c) open = false;
  });
  // When the evidence entry's own title holds a person's name, the line must carry one of those names (and say it with a verb or a quote
  // mark). Any other capitalised word does not stand in for the person whose words these are.
  const names = new Set();
  for (const t of titles) { const tw = String(t ?? "").split(/\s+/).filter(Boolean); tw.forEach((w, i) => { if (nameAt(tw, i)) names.add(stripEdge(w).replace(/['’]s$/i, "")); }); }
  if (names.size) return ATTRIBUTES.test(String(text ?? "")) && ws.some((w, i) => !inQuote[i] && names.has(stripEdge(w).replace(/['’]s$/i, "")));
  // Otherwise the generic rule: a name (not a company, product or platform) within three words of a verb of saying or a quote mark.
  const anchors = [];
  ws.forEach((w, i) => { if (ATTR_VERB.test(stripEdge(w)) || isQuoteOpen(w) || isQuoteClose(w)) anchors.push(i); });
  for (const i of anchors) {
    const ahead = /^according$/i.test(stripEdge(ws[i])) ? 4 : 3;
    for (let j = Math.max(0, i - 3); j <= Math.min(ws.length - 1, i + ahead); j++) if (j !== i && !inQuote[j] && nameAt(ws, j)) return true;
  }
  return false;
}
export const PRIVATE_ANSWER = "That answer is private. Leave it out of your CV.";
// A quote is held by a source when it is found as written or, as a second try, with bracketed tags removed from both sides (qb is the quote without them).
const holds = (e, q, qb = q) => e.text.includes(q) || e.parts.some((p) => p.includes(q)) || (!!qb && !!e.bt && (e.bt.includes(qb) || e.bparts.some((p) => p.includes(qb))));
const inPrivate = (q, ctx, qb) => q.length >= 12 && (ctx.privateAnswers || []).some((e) => holds(e, q, qb));

/**
 * Where a dossier quote sits. First as written; failing that, with bracketed tags ("[Requested/Reported]") removed from both the quote and
 * the career file. Returns { hay, heads, spans, qq, offsets } (offsets of every occurrence, at most 200).
 */
function findInDossier(src, ctx) {
  let hay = ctx.dossier || "";
  let heads = ctx.dossierHeads || [];
  let spans = ctx.dossierSpans || [];
  let qq = norm(src.quote);
  const offsets = [];
  if (qq) for (let i = hay.indexOf(qq); i >= 0 && offsets.length < 200; i = hay.indexOf(qq, i + 1)) offsets.push(i);
  if (!offsets.length && typeof ctx.dossierBare === "string") {
    hay = ctx.dossierBare; heads = ctx.dossierBareHeads || []; spans = ctx.dossierBareSpans || []; qq = normBare(src.quote);
    if (qq) for (let i = hay.indexOf(qq); i >= 0 && offsets.length < 200; i = hay.indexOf(qq, i + 1)) offsets.push(i);
  }
  return { hay, heads, spans, qq, offsets };
}
/**
 * The weak evidence tag behind a dossier quote: "proposed", "requested", "reported" or "analysis" when every usable place the quote sits
 * (not under 3.9 or 3.10, under the section its ref names) is tagged only with those. "" for any other source or any stronger tag.
 */
export function sourceWeakTag(src, ctx) {
  if (!src || src.kind !== "dossier" || typeof src.quote !== "string" || !ctx || ctx.dossier == null) return "";
  const { heads, spans, qq, offsets } = findInDossier(src, ctx);
  if (!offsets.length) return "";
  const want = refNumber(src.ref);
  const blockedAt = heads.filter((h) => BLOCKED_SECTION.test(h.num)).map((h) => h.at);
  const usable = offsets.filter((o) => !blockedAt.some((at) => at > o && at < o + qq.length)).filter((o) => { const n = headingAt(heads, o); return !BLOCKED_SECTION.test(n) && (n === "" || refMatches(want, n)); });
  if (!usable.length) return "";
  const tags = usable.map((o) => weakTag(tagsBetween(spans, o, o + qq.length)));
  return tags.every(Boolean) ? tags[0] : "";
}

/**
 * Is this quote verbatim in its source? Returns "" when it is, or a plain reason when it is not.
 * `claimText` is the line the quote backs: a third-party source (expert, market) is only allowed when that line says who said it.
 */
export function quoteProblem(src, ctx, claimText) {
  if (!src || typeof src !== "object") return "a source is not an object";
  if (!SOURCE_KINDS.includes(src.kind)) return `a source has kind ${JSON.stringify(src.kind)}; use dossier, onboarding, evidence or dev`;
  if (typeof src.quote !== "string" || !norm(src.quote)) return `a ${src.kind} source ${src.ref ? `(${src.ref}) ` : ""}has no quote`;
  const q = norm(src.quote);
  if (q.length > MAX_QUOTE) return `a quote is ${q.length} characters; keep it to the short excerpt that supports the line`;
  if (src.kind === "dev") return inPrivate(q, ctx, normBare(src.quote)) ? PRIVATE_ANSWER : "";
  const where =`${src.kind} ${src.ref || ""}`.trim();
  if (src.kind === "dossier") {
    if (ctx.dossier === null) return "";
    const { heads, qq, offsets } = findInDossier(src, ctx);
    if (!offsets.length) return inPrivate(q, ctx, normBare(src.quote)) ? PRIVATE_ANSWER : `the quote "${echo(q, 60, ctx)}" is not word for word in the career file (${where})`;
    // An occurrence is unusable when it starts under 3.9 or 3.10, or runs across the start of one of them.
    const blockedAt = heads.filter((h) => BLOCKED_SECTION.test(h.num)).map((h) => h.at);
    const secs = offsets.filter((o) => !blockedAt.some((at) => at > o && at < o + qq.length)).map((o) => headingAt(heads, o));
    const usable = secs.filter((n) => !BLOCKED_SECTION.test(n));
    if (!usable.length) return `a ${where} quote comes from a part of the career file that is confidential or not your work, so it can never go into a CV or case study`;
    const want = refNumber(src.ref);
    // A text before the first numbered heading has no section to name; any ref is then fine.
    if (usable.some((n) => n === "" || refMatches(want, n))) return "";
    const first = usable[0];
    return `the quote "${echo(q, 40, ctx)}" is in section ${first} of the career file, but its ref says ${src.ref ? JSON.stringify(String(src.ref)) : "nothing"}; use ref "${first}"`;
  }
  const pool = src.kind === "onboarding" ? ctx.onboarding : ctx.evidence;
  const qb = normBare(src.quote);
  const rows = pool.filter((e) => holds(e, q, qb));
  if (!rows.length) {
    // A quote of a private or Round 3 answer is never named or hinted at: only that it is private.
    if (inPrivate(q, ctx, qb)) return PRIVATE_ANSWER;
    return `the quote "${echo(q, 60, ctx)}" is not word for word in ${src.kind === "onboarding" ? "your interview answers" : "your evidence"} (${where})`;
  }
  // The ref must be the id of the entry or answer that holds the quote.
  const want = String(src.ref ?? "").trim();
  const exact = rows.filter((e) => String(e.ref) === want);
  const what = src.kind === "onboarding" ? "answer" : "evidence entry";
  if (!exact.length) {
    const right = [...new Set(rows.map((e) => String(e.ref)))];
    return want
      ? `the quote is in ${what} ${right[0]}, but its ref says ${JSON.stringify(want)}; use ref "${right[0]}"`
      : `a ${src.kind} source needs a ref: the quote is in ${what} ${right[0]}, so use ref "${right[0]}"`;
  }
  if (src.kind === "evidence") {
    if (exact.every((e) => e.type === "ai")) return `evidence ${want} is Claude's own critique, not something you did, so it cannot be the source of a line. Cite your own note or the career file instead`;
    if (exact.every((e) => e.type === "expert" || e.type === "market") && !attributes(claimText, exact.map((e) => e.title))) {
      return `evidence ${want} is someone else's words (${exact[0].type}). Say who said it in the line, with their name next to the verb or the quote, for example "Priya wrote that ...", and quote them`;
    }
  }
  return "";
}

/** True when the source rests on what the person said in chat: a dev source, or a citation of an evidence note saved from chat (by "chat"). */
function restsOnChat(src, ctx) {
  if (!src || typeof src !== "object") return false;
  if (src.kind === "dev") return true;
  if (src.kind !== "evidence" || typeof src.quote !== "string") return false;
  const q = norm(src.quote);
  if (!q) return false;
  const rows = (ctx.evidence || []).filter((e) => (!src.ref || e.ref === src.ref) && holds(e, q, normBare(src.quote)));
  return rows.length > 0 && rows.every((e) => e.by === "chat");
}
/** A quote that backs a number must be at least this long, so a bare "2025" or "40%" cannot be a source. */
export const MIN_NUMBER_QUOTE = 12;
/** The number tokens that a set of sources can back: dev sources never, and no quote shorter than MIN_NUMBER_QUOTE characters. */
export function backingTokens(srcs) {
  return new Set((srcs || []).filter((s) => s && s.kind !== "dev" && typeof s.quote === "string" && norm(s.quote).length >= MIN_NUMBER_QUOTE).flatMap((s) => [...numberTokens(s.quote), ...listCounts(s.quote)]));
}
// A count that a quote does not state but shows: the number of items in a list it quotes. Items are split on commas, "and", "plus" and "&",
// or are the "Phase 01", "Phase 02" markers. "four phases" against "Phase 01 Waitlist, ..., Phase 04 Beta Live" and "three layers" against
// "financial, operational and onchain layers" are honest. A run of items counts when it has two or more and every item after the first is short.
const LIST_MARK = /\b(phase|stage|step)\s+(\d+)\b/gi;
const HAS_MARK = /\b(?:phase|stage|step)\s+\d+\b/i; // not global: a global regex keeps its position between calls
const SHORT_ITEM = 5;
/** The "Phase 01", "Phase 02" markers of a text: Map of kind (phase, stage, step) to the set of numbers seen. */
function markerKinds(text) {
  const kinds = new Map();
  for (const m of norm(text).matchAll(LIST_MARK)) { const k = m[1].toLowerCase(); if (!kinds.has(k)) kinds.set(k, new Set()); kinds.get(k).add(cleanInt(m[2])); }
  return kinds;
}
// "three phases", "4-phase", "two stages": a number straight before the word. When a quote lists the phases (two or more markers), only the
// number of markers backs it: the digits in "Phase 03" do not make "three phases" true.
const MARKER_NOUN = new RegExp(`(?<![\\p{L}\\d])(\\d+|${NUMWORD_SRC})[\\s-]+(phase|stage|step)s?(?![\\p{L}\\d])`, "giu");
/** Counts in a line written as "N phases" (or stages, steps) that a quoted marker list contradicts. Returns true when one does. */
function markerMismatch(clause, quotes) {
  for (const m of prep(clause).matchAll(MARKER_NOUN)) {
    const val = /^\d+$/.test(m[1]) ? cleanInt(m[1]) : valueOfWord(m[1]);
    const lists = quotes.map((q) => markerKinds(q).get(m[2].toLowerCase())).filter((s) => s && s.size >= 2);
    if (lists.length && !lists.some((s) => String(s.size) === val)) return true;
  }
  return false;
}
const listCache = new Map();
/** The counts (as number tokens) that the lists in a quote add up to. */
function listCounts(quote) {
  const key = String(quote ?? "");
  if (listCache.has(key)) return listCache.get(key);
  const out = new Set();
  const t = norm(key).replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  for (const s of markerKinds(t).values()) if (s.size >= 2) out.add(String(s.size));
  for (const seg of t.split(/(?<=[.;!?:])\s+/)) {
    if (HAS_MARK.test(seg)) continue; // a Phase list is counted by its markers
    // "X and Y" inside one comma item of three words or fewer is one item ("failed and retry" is one state). A piece that starts with
    // "not" or "rather" is a contrast, not a list item.
    // The last comma item is different: "A, B and C" still ends the list with its "and" ("operational and onchain" is two items there).
    const commaItems = seg.split(/\s*[,&]\s*/);
    const pieces = commaItems.flatMap((c, ci) => (ci < commaItems.length - 1 && c.trim().split(/\s+/).length <= 3 ? [c] : c.split(/\s+(?:and|plus)\s+/i)))
      .map((p) => p.replace(/^(?:and|plus)\s+/i, "").replace(/[.;:!?]+$/, "").trim()).filter((p) => p && !/^(?:not|rather)\b/i.test(p));
    const short = (p) => p.split(/\s+/).length <= SHORT_ITEM;
    for (let i = 0; i < pieces.length - 1;) {
      if (!short(pieces[i + 1])) { i++; continue; }
      let j = i + 1;
      while (j < pieces.length && short(pieces[j])) j++;
      out.add(String(j - i));
      i = j;
    }
  }
  listCache.set(key, out);
  return out;
}
const shortQuote = (srcs) => (srcs || []).some((s) => s && s.kind !== "dev" && typeof s.quote === "string" && norm(s.quote) && norm(s.quote).length < MIN_NUMBER_QUOTE && numberTokens(s.quote).length);
const NO_COUNT = "Your source does not state this count. Drop it or name the items.";
const SHORT_QUOTE = "a quote that backs a number must be at least 12 characters, so quote the whole phrase around it";
const hasContent = (s) => /[A-Za-z0-9]/.test(stripPlaceholders(s));

/**
 * Checks one claim: its text against its own sources. `pool` is extra quotes whose numbers also count (used by item and case level fields).
 * Pushes into r. Returns nothing.
 */
// ---- the claim tie ---------------------------------------------------------------------------------------------------------------
// A number must not be borrowed from a quote about something else. For each number, the words of the clause that holds it must be found
// in the quote that backs it: at least two content words (four letters or more, not a stop word, not a number), or all of them when the
// clause has fewer than two.
const TIE_STOP = new Set(("with that this from into over about their which while where when were have been than then they them also each every more most only both such across through using after before " +
  "here there what your will would could should other some many much very just like made make makes under again still onto upon within without during since until around among between these those being does done ones " +
  "its our his her was are for and the not but all any can had has how may out per via who why").split(" "));
const stemOf = (w) => {
  const low = w.toLowerCase();
  let s = low.replace(/['’]s$/, "");
  const had = /ies$/.test(s) ? "" : (/(?:ing|ed)$/.exec(s) || [""])[0];
  s = /ies$/.test(s) ? s.replace(/ies$/, "y") : s.replace(/(?:ing|ed|es|s)$/, "");
  // splitting and split, mapped and map: a doubled letter that the ending added is one letter
  if (had && /([bgmnprt])\1$/.test(s) && s.length >= 4) s = s.slice(0, -1);
  s = s.replace(/e$/, ""); // phase, phases and phased are one word
  return s.length >= 3 ? s : low;
};
const NUMWORD_ONLY = new RegExp(`^(?:${NUMWORD_SRC}|${EXTRA_WORDS}|dozens|hundreds|thousands|millions|billions|doubled|tripled|quadrupled|halved|half|twice|thrice|percent|double|doubles|doubling|triple|triples|tripling|quadruple|quadruples|quadrupling|quarter|quarters|crore|crores|lakh|lakhs|lac|lacs|multiples|third|thirds|fifth|sixth|seventh|eighth|ninth|tenth|fold)$`, "i");
/** The content stems of a text: words of four letters or more that are not stop words or number words. */
const contentStems = (s) => new Set((foldText(s).match(/[A-Za-z][A-Za-z'’]*/g) || []).filter((w) => w.length >= 4 && !TIE_STOP.has(w.toLowerCase()) && !NUMWORD_ONLY.test(w)).map(stemOf));
/** The clauses of a line: split at . ; : ! ? commas and the joining words and, but, while, plus (not the comma inside 1,227 or the dot inside 9.2). */
const clausesOf = (text) => stripPlaceholders(text).split(/(?<!\d),|,(?!\d)|[.;:!?]+(?=\s|$)|\n|\s(?:and|but|while|plus)\s/i).map((c) => c.trim()).filter(Boolean);
/** Does a number's clause share enough content words with at least one of the quotes that hold the number? Returns true when it does (or there is nothing to compare). */
// A year (and so a month-year pair such as Aug 2026) is not tied to its clause: it only has to be in the quote.
const isYear = (tok) => /^(?:19|20)\d\d$/.test(tok);
// Does a quote hold the number as written, or as the count of a list it quotes?
const holdsLiteral = (q, tok) => numberTokens(q).includes(tok);
const holdsCount = (q, tok) => listCounts(q).has(tok);
function tied(clause, tok, quotes) {
  if (isYear(tok)) return true;
  const want = contentStems(clause);
  if (!want.size) return true;
  const holders = quotes.filter((q) => holdsLiteral(q, tok) || holdsCount(q, tok));
  if (!holders.length) return true; // the number itself is reported as unsourced elsewhere
  // A number and its unit or counted noun found together in a quote ("1,227 sign-ups") is tied, whatever else the clause says.
  const mine = numberFollowers(clause).filter((f) => f.tok === tok);
  if (mine.length && holders.some((q) => numberFollowers(q).some((g) => g.tok === tok && mine.some((f) => (f.unit ? g.unit === f.unit : !!g.words && f.words.some((w) => g.words.some((x) => stemOf(x) === stemOf(w)))))))) return true;
  // The count of a quoted list is tied by one shared content word; a number written in the quote by two.
  // A generic container word beside a list count ("13 deposit states") is the link to the list, so it may stand in for the shared word.
  return holders.some((q) => { const need = holdsCount(q, tok) ? 1 : Math.min(2, want.size); const have = contentStems(q); let n = 0; for (const w of want) if (have.has(w)) n++; return n >= need || (!holdsLiteral(q, tok) && [...want].some((w) => CONTAINERS.has(w))); });
}

// The word after a number. "840 px" and "ten seconds" name a unit: the quote must carry that unit (in any of its forms). Any other word
// ("40 designers") is the thing counted: it, or the word after it, must be in the quote. Skipped: a year, a number with % or x, "of" and
// other small words ("a couple of", "3 of the 5"), and a number followed by another number or by a preposition.
const UNIT_OF = { px: "px", pixel: "px", pixels: "px", ms: "ms", millisecond: "ms", milliseconds: "ms", s: "s", sec: "s", secs: "s", second: "s", seconds: "s", min: "min", mins: "min", minute: "min", minutes: "min", hr: "hr", hrs: "hr", hour: "hr", hours: "hr", day: "day", days: "day", week: "wk", weeks: "wk", month: "mo", months: "mo", yr: "yr", yrs: "yr", year: "yr", years: "yr", time: "x", times: "x", x: "x" };
const DETERMINERS = new Set("of the our his her their my its your all a an this that these those new own".split(" "));
const NOT_COUNTED = new Set(("in on at for to by with from as is was are were has had have be been and or but than then it he she they we you not so if when while after before during per via into over under about up down out off more most less fewer very too also only just still even who which what where how why can will would could should may might do does did no other another each every any some").split(" "));
const CARDINAL = new RegExp(`^(?:${NUMWORD_SRC})$`, "i");
const unitsOf = (q) => new Set((foldText(q).match(/[A-Za-z]+/g) || []).map((w) => UNIT_OF[w.toLowerCase()]).filter(Boolean));
const wordStems = (q) => new Set((foldText(q).match(/[A-Za-z][A-Za-z'’]*/g) || []).map(stemOf));
/** For each number in a text that can be followed by a thing or a unit: { tok, unit } or { tok, words } (the one or two words that follow). */
function numberFollowers(text) {
  const t = prep(text);
  const found = [];
  const after = (end) => {
    const seg = t.slice(end).split(/[,.;:!?()\n]/)[0].trim();
    const ws = seg ? seg.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")).filter(Boolean) : [];
    let i = 0;
    while (i < ws.length && DETERMINERS.has(ws[i].toLowerCase())) i++;
    const first = (ws[i] || "").toLowerCase();
    if (!first || /^\d/.test(first) || NUMWORD_ONLY.test(first) || NOT_COUNTED.has(first)) return null;
    if (UNIT_OF[first] && i === 0) return { unit: UNIT_OF[first] };
    // "Pre-deposit" is two words: any of the letter runs may be the one the quote has.
    const words = ws.slice(i, i + 2).flatMap((w) => w.match(/[A-Za-z]+/g) || []).filter((w) => w.length >= 3 && !NOT_COUNTED.has(w.toLowerCase()) && !DETERMINERS.has(w.toLowerCase()) && !UNIT_OF[w.toLowerCase()]);
    return words.length ? { words } : null;
  };
  for (const m of t.matchAll(NUM)) {
    if (m[3] && /^[%xX×]$/.test(m[3])) continue;
    if (!m[3] && /^(?:19|20)\d\d$/.test(m[2])) continue;
    const f = after(m.index + m[0].length);
    if (f) found.push({ tok: numTok(m), ...f });
  }
  for (const m of t.matchAll(NUMWORD)) {
    if (!CARDINAL.test(m[1])) continue;
    const f = after(m.index + m[0].length);
    if (f) found.push({ tok: valueOfWord(m[1]), ...f });
  }
  return found;
}
/** Does one quote carry the unit, or one of the words, that follows a number in the line? */
const followedBy = (f, q) => (f.unit ? unitsOf(q).has(f.unit) : f.words.some((w) => wordStems(q).has(stemOf(w))));
// A count that is the number of items in a quoted list: the noun after it must be in the quote, or be a generic container. A noun for
// people or an activity (designers, users, tests, studies...) must be in the quote itself, whatever else the line says.
const CONTAINERS = new Set("products parts layers states phases categories screens items steps sections pages views flows colours colors".split(" ").map(stemOf));
const PEOPLE_ACTIVITY = new Set(("designers engineers people persons person studies study tests test users user interviews interview clients client partners partner customers customer " +
  "developers developer researchers researcher members member colleagues colleague stakeholders stakeholder teams team founders founder managers manager employees employee hires " +
  "sessions session workshops workshop reviews review projects project campaigns campaign experiments experiment surveys survey audits audit companies company investors investor " +
  "teammates teammate reviewers reviewer participants participant respondents respondent").split(" ").map(stemOf));
const listFollowedBy = (f, q) => {
  if (f.unit) return unitsOf(q).has(f.unit);
  const have = wordStems(q);
  // The counted noun is the last of the (up to two) words: "4 user flows" counts flows, "4 users" counts users. A people or activity noun
  // there must be in the quote itself.
  const last = stemOf(f.words[f.words.length - 1]);
  if (PEOPLE_ACTIVITY.has(last) && !have.has(last)) return false;
  return f.words.some((w) => have.has(stemOf(w)) || CONTAINERS.has(stemOf(w)));
};

// How each number in a text is hedged: Map of token to { soft, strong, plain } (soft: nearly, almost, about, around, roughly, under, up to...;
// strong: over, more than, exactly, at least, or a "+" after the number; plain: neither). Each holds the word as written, or "" when absent.
const SOFT_Q = /(?:^|[^\p{L}])(nearly|almost|about|around|roughly|approximately|under|up\s+to|close\s+to)\s*(?:a\s+)?$/iu;
const STRONG_Q = /(?:^|[^\p{L}])(over|more\s+than|exactly|at\s+least|upwards?\s+of)\s*(?:a\s+)?$/iu;
function numberQuals(text) {
  const t = prep(text);
  const out = new Map();
  const add = (tok, start, end) => {
    const before = t.slice(Math.max(0, start - 18), start);
    const soft = SOFT_Q.exec(before);
    const strong = STRONG_Q.exec(before) || (/^\s?\+/.test(t.slice(end, end + 2)) ? [null, "+"] : null);
    const cur = out.get(tok) || { soft: "", strong: "", plain: "" };
    if (soft) cur.soft ||= soft[1].toLowerCase(); else if (strong) cur.strong ||= strong[1].toLowerCase(); else cur.plain ||= "plain";
    out.set(tok, cur);
  };
  for (const m of t.matchAll(NUM)) add(numTok(m), m.index, m.index + m[0].length);
  for (const m of t.matchAll(NUMWORD)) add(valueOfWord(m[1]), m.index, m.index + m[0].length);
  return out;
}

// In a case beat built from the case list in the career file (section 8.3), "the second case" and "case 2" are the list's own order, not a
// number the person claims. Only the exact phrases "the second case (study)" and "case 2" are left out of the number check, only in a case beat
// that has an 8.3 source. "A third of the users", "the second designer" and every CV bullet still need a quote.
const ORD_WORD = "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|[4-9]th|10th";
const CASE_PHRASE = new RegExp(`\\b(?:(?:${ORD_WORD})\\s+case(?:\\s+stud(?:y|ies))?|case(?:\\s+stud(?:y|ies))?\\s+(?:\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten))\\b`, "gi");
const caseOrderOnly = (srcs) => srcs.some((s) => s && s.kind === "dossier" && /^8\.3(?:\.|$)/.test(refNumber(s.ref)));
function checkClaim(where, text, sources, ctx, r, { pool = [], needSource = true, attrib, tie = needSource, caseBeat = false } = {}) {
  if (typeof text !== "string" || !text) return;
  const srcs = Array.isArray(sources) ? sources : [];
  const plain = caseBeat && caseOrderOnly(srcs) ? (t) => foldText(t).replace(CASE_PHRASE, " ") : (t) => t;
  const tokensOf = (t) => numberTokens(plain(t));
  for (const s of srcs) {
    const p = quoteProblem(s, ctx, attrib ?? text);
    if (p) r.problems.push(`${where}: ${p}`);
  }
  if (srcs.some((s) => restsOnChat(s, ctx))) r.dev_sources.push(where);
  if (needSource && hasContent(text) && !srcs.length && !pool.length) r.problems.push(`${where}: has no source. Add a dossier, onboarding or evidence quote, or write [NEEDS: what is missing].`);
  // What the person said in chat never backs a number: the quote of a `dev` source is not counted. Save the fact as an evidence note first.
  const all = [...srcs, ...pool];
  const have = backingTokens(all);
  // A line that holds a confidential item never has its numbers repeated back (the deny scan names the line).
  const shown = (tok) => (denyHit(ctx.deny, text) ? "(withheld)" : tok);
  let missed = 0;
  for (const tok of new Set(tokensOf(text))) if (!have.has(tok)) { r.unsourced_numbers.push(`${where}: ${shown(tok)}`); missed++; }
  if (missed && shortQuote(all)) r.problems.push(`${where}: ${SHORT_QUOTE}`);
  // A plain count (digits or a number word) that no quote states and no quoted list adds up to.
  if ([...new Set(tokensOf(text))].some((tok) => !have.has(tok) && /^\d{1,3}$/.test(tok))) r.problems.push(`${where}: ${NO_COUNT}`);
  if (missed && srcs.some((s) => s && s.kind === "dev")) r.problems.push(`${where}: a number cannot rest on what you said in chat. Save it as a note from you first, then cite that note`);
  const quotes = all.filter((s) => s && s.kind !== "dev" && typeof s.quote === "string" && norm(s.quote).length >= MIN_NUMBER_QUOTE).map((s) => norm(s.quote));
  // Direction of a hedge: a source that says "nearly 3" or "about 20" never backs "over 3", "exactly 20" or "20+".
  const claimQ = numberQuals(text);
  const quoteQ = quotes.map(numberQuals);
  for (const [tok, c] of claimQ) {
    if (!c.strong) continue;
    const held = quoteQ.filter((m) => m.has(tok));
    if (held.length && held.every((m) => m.get(tok).soft && !m.get(tok).plain && !m.get(tok).strong)) r.problems.push(`${where}: the number ${shown(tok)} is stated as "${c.strong}" in your line, but your source only says "${held[0].get(tok).soft}" with it. Use the same hedge your source uses`);
  }
  if (missed || !tie) return;
  const loose = new Set();
  for (const clause of clausesOf(text)) for (const tok of new Set(tokensOf(clause))) if (!tied(clause, tok, quotes)) loose.add(tok);
  if (clausesOf(text).some((c) => markerMismatch(c, quotes))) r.problems.push(`${where}: ${NO_COUNT}`);
  for (const tok of loose) r.problems.push(`${where}: the number ${shown(tok)} is not tied to its quote: the words around it in your line are not in the quote that holds it. Quote the phrase that sits around the number`);
  // The word right after a number (its unit or the thing counted) must be in the quote that holds the number.
  const seenTok = new Set();
  for (const clause of clausesOf(text)) for (const f of numberFollowers(plain(clause))) {
    const holders = quotes.filter((q) => holdsLiteral(q, f.tok) || holdsCount(q, f.tok));
    // A count that is only the number of items in a quoted list ("three products" for "Alpha, Beta and Gamma") has no noun to
    // find in the quote, so its noun must be a generic container (products, states, layers...). People and activity nouns never are.
    if (!holders.length || holders.some((q) => (holdsLiteral(q, f.tok) && followedBy(f, q)) || (holdsCount(q, f.tok) && listFollowedBy(f, q)))) continue;
    const what = f.unit ? `the unit after it` : `"${f.words[0]}"`;
    const key = `${f.tok}|${what}`;
    if (seenTok.has(key)) continue;
    seenTok.add(key);
    r.problems.push(`${where}: the number ${shown(f.tok)} is followed by ${denyHit(ctx.deny, text) ? "(withheld)" : what} in your line, but the quote that holds the number does not say it. Quote the phrase that sits around the number, or use the word your source uses`);
  }
}

/** A deny-list refusal never repeats the term it matched. */
const DENY_LABEL = "a confidential item";
// A rule from dossier 3.9 (work that is not the person's) is safe to explain: it names no secret. Anything else (3.10 confidential, or a rule with
// no section) stays hidden, and a text that hits any hidden rule is hidden whatever else it hits.
const NOT_YOURS_HINT = "this says you built something that was not your work; say what you designed";
const NOT_YOURS_FROM = /^3\.9$/;
const newResult = (ctx) => ({ ran: ctx.now.toISOString(), pass: false, unsourced_numbers: [], deny_hits: [], placeholders: 0, problems: [...ctx.loadProblems], dev_sources: [], warnings: [] });

function denyScan(strings, ctx, r) {
  for (const { where, text } of strings) {
    const hits = denyMatches(ctx.deny, text);
    if (hits.length) r.deny_hits.push(`${where}: ${hits.every((d) => NOT_YOURS_FROM.test(d.from || "")) ? NOT_YOURS_HINT : DENY_LABEL}`);
  }
}
/** A "why" that is really one of this engine's own refusal hints ("Say deploy, as the source does"): a leak, never a reason. */
const ENGINE_MESSAGE = /^\s*(?:Say\s|Use\s+the\b|Write\s+the\s+number\b|Your\s+source\b|Your\s+notes\s+say\b)/i;
export const engineMessageLike = (text) => typeof text === "string" && ENGINE_MESSAGE.test(foldText(text));
const finish = (r) => { r.pass = !r.unsourced_numbers.length && !r.deny_hits.length && !r.problems.length; return r; };

// A title the person has not been given must not appear: the career file says not to call him senior, lead, contractor or the like unless he confirms.
// Also the verbs and forms that claim the same thing (led, leading, founding, co-founder, spearheaded, directed, managed, managing, owner, head of).
// A word is allowed only when a quote of the same item has a form of the same word (led, lead, leads and leading are one; founder and founding are one).
const ROLE_WORD = /(?<![\p{L}\p{N}])(senior|leading|lead|led|head(?:\s+of)?|principal|staff|managers?|managed|managing|director|directed|co-?founders?|founders?|founding|spearhead\w*|owner|freelance|contractor|founded|owned|headed|oversaw|in\s+charge\s+of|launched|shipped|architected|ran\s+(?:the|our|his|their|a)\s+(?:[\p{L}-]+\s+){0,2}(?:team|teams|function|functions|department|departments)(?![\s-]*(?:meeting|sync|page|retro|standup|workshop|offsite))|built\s+(?:the|our|his|their|a)\s+(?:[\p{L}-]+\s+)?team(?![\s-]*(?:page|pages|section|view|screen|profile|meeting|sync)))(?:['’]s|s)?(?![\p{L}\p{N}])/giu;
const roleKey = (w) => { const k = w.toLowerCase().replace(/\s+/g, " ").replace(/^co-?/, ""); if (/^(?:leading|lead|led)$/.test(k)) return "lead"; if (/^head(?: of)?$/.test(k)) return "head"; if (/^ran /.test(k)) return "ran team"; if (/^built /.test(k)) return "built team"; if (/^managers?$/.test(k)) return "manager"; if (/^(?:managed|managing)$/.test(k)) return "managed"; if (/^founders?$|^founding$/.test(k)) return "founder"; if (/^spearhead/.test(k)) return "spearhead"; return k; };
/** The role words of a text: Map of key to the word as written. */
// "Owned-position views" and "founding-team notes" are compounds, not a claim of ownership or founding: when a quote holds the same
// compound it is left out of the role words (the compound itself must be in a quote; a bare "owned" still is not).
const COMPOUND = /(?<![\p{L}\p{N}])(?:owned|founding)-[\p{L}][\p{L}-]*/giu;
// "Owned-position views" is a compound the career file itself uses: when the file holds it, it is never a role word. A line that
// denies a claim ("not-yet-shipped", "instead of ...") claims nothing either.
const roleWords = (t, quotes = [], compounds = null) => {
  const held = foldText((quotes || []).join(" \n ")).toLowerCase();
  const line = foldText(stripPlaceholders(t)).replace(NEGATED, " ").replace(COMPOUND, (m) => (held.includes(m.toLowerCase()) || (compounds && compounds.has(m.toLowerCase())) ? " " : m));
  return new Map([...line.matchAll(ROLE_WORD)].map((m) => [roleKey(m[1]), m[1].toLowerCase()]));
};
// A status verb (shipped, launched) claims an outcome: say what you designed. Any other role word (led, owner, senior...): use the source's words.
const roleAdvice = (key) => (/^(?:shipped|launched)$/.test(key) ? "Say what you designed" : "Use the words your source uses");
const quotesHoldRole =(quotes, key) => quotes.some((q) => { for (const x of foldText(q).replace(COMPOUND, " ").matchAll(ROLE_WORD)) if (roleKey(x[1]) === key) return true; return false; });

// "Shipped", "launched" and "live" about something the source calls "in development". "Beta Live" (a capitalised name) is a name, not a claim.
const IN_DEV = /\b(?:in|under)[\s-]+development\b/i;
const STATUS_WORD = /\b(?:shipped|launched|released\b|rolled\s+out\b|deployed\b|(?:went|goes|going|gone|go)\s+out\b|in\s+production\b|available\s+to\b|open\s+to\b|generally\s+available\b|now\s+available\b|(?:went|goes|going|gone|go)\s+live|go-live|(?:is|are|was|now|already|been|be|being)\s+live|live\s+(?:in|on|by|since|at)\b|live\s*[.,;)]?\s*$)/i;
const cleanStatus = (t) => foldText(stripPlaceholders(t)).replace(/\b\p{Lu}\p{L}*\s+Live\b/gu, " ").replace(/\b(?:which|that)\s+\w+\s+(?:are|is)\s+live\b/gi, " ").replace(/\b(?:machines?|assets?|devices?|nodes?)\s+(?:(?:that|which)\s+)?(?:are|is)\s+live\b/gi, " ");
const tidyStatus = (s) => s.trim().toLowerCase().replace(/[.,;)]+$/, "").trim();
const statusWord = (t) => { const m = STATUS_WORD.exec(cleanStatus(t)); return m ? tidyStatus(m[0]) : ""; };

// The products the person's work is about. A status word (shipped, launched, live...) is about the product named nearest to it in its clause.
// The products the career file calls "in development" (ctx.inDevNames, read from the file: a product still being built) may never be said to be live.
const OTHER_PRODUCTS = [];
const escRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A clause starts at a sentence mark, or at "and", "but", "while", "plus" or a comma when a verb of its own follows.
const VERB_AHEAD = "(?=(?:[\\p{L}]+ed|built|rebuilt|ran|made|wrote|led|grew|sold|hit|won|cut|drove|took|gave|got|set|put|sent|kept|held|found|began|did|brought|taught|chose|spoke|saw|came|went|became|is|was|are|were)(?![\\p{L}]))";
const CLAUSE_SPLIT = new RegExp(`(?<!\\d),\\s+${VERB_AHEAD}|,?\\s+(?:and|but|while|plus)\\s+${VERB_AHEAD}`, "iu");
/** The clauses of a line: split at . ; : ! ? and new lines, then where a comma or a joining word is followed by a verb. Lists ("financial, operational and onchain") stay whole. */
export function clausesOfLine(text) {
  return String(text ?? "").split(/[.;!?:]+(?=\s|$)|\n/).flatMap((s) => s.split(CLAUSE_SPLIT)).map((c) => (c || "").trim()).filter(Boolean);
}
function productMatches(clause, inDev) {
  const dev = new Set((inDev || []).map((x) => x.toLowerCase()));
  const names = [...new Set([...(inDev || []), ...OTHER_PRODUCTS])];
  const out = [];
  for (const n of names) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escRe(n).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, "giu");
    for (const m of clause.matchAll(re)) out.push({ start: m.index, end: m.index + m[0].length, dev: dev.has(n.toLowerCase()) });
  }
  return out.sort((a, b) => a.start - b.start);
}
const COORD = /^[\s,&]*(?:(?:and|plus|the|a|an|our|his|their)\b[\s,&]*)*$/i;
/**
 * The status word (shipped, launched, live...) a line says about a product the career file calls "in development", or "". Each clause is
 * judged on the product named nearest to its status word (and the products listed with it: "Alpha and Beta, now live").
 * A clause that names no product falls back to `fallbackDev`: true when the item's own source or heading says "in development".
 */
export function devStatusHit(text, inDev, fallbackDev = false) {
  const line = foldText(stripPlaceholders(String(text ?? ""))).replace(NEGATED, " ");
  for (const clause of clausesOfLine(line)) {
    const cleaned = cleanStatus(clause);
    const words = [...cleaned.matchAll(new RegExp(STATUS_WORD.source, "gi"))];
    if (!words.length) continue;
    const ents = productMatches(cleaned, inDev);
    for (const w of words) {
      const ws = w.index;
      const we = w.index + w[0].length;
      if (!ents.length) { if (fallbackDev) return tidyStatus(w[0]); continue; }
      const dist = (e) => (e.start >= we ? e.start - we : ws >= e.end ? ws - e.end : 0);
      const best = Math.min(...ents.map(dist));
      const near = new Set(ents.filter((e) => dist(e) === best));
      // grow the group over products listed together ("Alpha and Beta")
      let grew = true;
      while (grew) {
        grew = false;
        ents.forEach((e, i) => {
          for (const n of [ents[i - 1], ents[i + 1]]) {
            if (!n || near.has(e) === near.has(n)) continue;
            const [a, b] = e.start < n.start ? [e, n] : [n, e];
            if (COORD.test(cleaned.slice(a.end, b.start))) { near.add(e); near.add(n); grew = true; }
          }
        });
      }
      if ([...near].some((e) => e.dev)) return tidyStatus(w[0]);
    }
  }
  return "";
}

// A skills line is a claim about ability, so a quote that shares few of its words may not say it. Not a refusal: a warning in checks.honesty.warnings.
export const SKILLS_OVERLAP = 0.5;
// The word overlap behind the two warnings (not the number tie, which keeps contentStems). Spelling variants are one word: "on-chain" and
// "onchain" and "on chain"; RWA is real-world asset, UX is user experience, QA is quality assurance. Generic design verbs and the words
// screen, page and phase say nothing about the topic, so they are left out of the count.
const ABBREVIATIONS = [[/\breal[\s-]world[\s-]assets?\b/gi, " rwa "], [/\brwas?\b/gi, " rwa "], [/\buser[\s-]experience\b/gi, " ux "], [/\bux\b/gi, " ux "], [/\bquality[\s-]assurance\b/gi, " qa "], [/\bqa\b/gi, " qa "]];
const SHORT_CANON = new Set(["rwa", "ux", "qa"]);
const OVERLAP_IGNORE = new Set("design designed designs designing redesign redesigned redesigns craft crafted shape shaped create created made make makes making built build builds produce produced screen screens page pages phase phases".split(" ").map(stemOf));
// Light paraphrase pairs: two words that say the same thing here count as one word in the overlap (stems, first is the key).
// "who runs it" and "operator", "when it pays" and "payout schedule", "proposed" and "a proposal".
const SYNONYMS = [["run", "operator", "operat"], ["pay", "payout", "paid"], ["propos", "proposal"], ["invest", "investment", "investor"]];
const SYN_KEY = new Map(SYNONYMS.flatMap((g) => g.map((w) => [w, g[0]])));
const canonStem = (st) => SYN_KEY.get(st) || st;
// "in development" is a status the line may repeat: its word is never uncovered.
const STATUS_IGNORE = new Set(["development"].map(stemOf));
function overlapWords(s) {
  let t = foldText(s);
  for (const [re, to] of ABBREVIATIONS) t = t.replace(re, to);
  return (t.match(/[A-Za-z][A-Za-z'’-]*/g) || []).map((w) => w.replace(/^[-'’]+|[-'’]+$/g, "")).filter(Boolean);
}
/** The words of a claim: hyphen compounds written as one word, small words, number words and the ignore list dropped. */
function overlapWant(s) {
  // stem -> the word as written (first time it appears), so a message can name it
  const out = new Map();
  for (const w of overlapWords(s)) {
    const j = w.replace(/[-]/g, "").replace(/['’]s$/i, "");
    const low = j.toLowerCase();
    if (!(SHORT_CANON.has(low) || (j.length >= 4 && !TIE_STOP.has(low) && !NUMWORD_ONLY.test(j)))) continue;
    const st = canonStem(stemOf(j));
    if (!OVERLAP_IGNORE.has(st) && !STATUS_IGNORE.has(st) && !out.has(st)) out.set(st, w.replace(/^[-'’]+|[-'’]+$/g, ""));
  }
  return out;
}
/** The words a quote offers: each word, each hyphen part, and each pair of neighbours joined ("on chain" is onchain, "cash flow" is cashflow). */
function overlapHave(s) {
  const out = new Set();
  const ws = overlapWords(s);
  ws.forEach((w, i) => {
    out.add(canonStem(stemOf(w.replace(/-/g, "").replace(/['’]s$/i, ""))));
    if (w.includes("-")) for (const p of w.split("-")) if (p) out.add(canonStem(stemOf(p)));
    if (ws[i + 1]) out.add(canonStem(stemOf(`${w.replace(/-/g, "")}${ws[i + 1].replace(/-/g, "")}`)));
  });
  return out;
}
/**
 * { n, total, missing }: how many of the claim's words some quote holds. `ignore` is a set of stems (or text to take them from) that never
 * count: the words of the item's heading, the employer, the case title.
 */
function overlapOf(claim, quotes, ignore = null) {
  const want = overlapWant(claim);
  const skip = ignore instanceof Set ? ignore : new Set();
  const have = new Set(quotes.flatMap((q) => [...overlapHave(q)]));
  let n = 0;
  const missing = [];
  for (const [st, word] of want) { if (skip.has(st)) continue; if (have.has(st)) n++; else missing.push(word); }
  return { n, total: n + missing.length, missing };
}
/** The stems of the words in some texts (a heading, an employer, a case title): words a line may use without them being in the quote. */
export const ignoreStems = (...texts) => new Set(texts.flatMap((t) => (typeof t === "string" ? [...overlapWant(stripPlaceholders(t)).keys()] : [])));
function softSkillsCheck(where, b, r) {
  if (typeof b.text !== "string") return;
  const quotes = (Array.isArray(b.sources) ? b.sources : []).filter((s) => s && typeof s.quote === "string").map((s) => s.quote);
  const { n, total } = overlapOf(stripPlaceholders(b.text), quotes);
  if (!total || !quotes.length) return;
  if (n / total < SKILLS_OVERLAP) r.warnings.push(`${where}: only ${n} of ${total} key words in this skills line are in its quotes. Check that the quote really says you have this skill, or quote a line that does`);
}

// ---- the meaning tie -------------------------------------------------------------------------------------------------------------
// A line must not say something its quotes do not. An outcome, credit or activity word in the line (increased, won, mentored, strategy,
// smart contracts...) that no quote of the line carries is a refusal. Any other line with few of its content words in its quotes is a warning.
export const MEANING_MSG = "This line says something your source does not. Use the source's words, or say it in chat so Claude can save it as your note.";
export const MEANING_OVERLAP = 0.5;
const MEANING_TERMS = [
  ["increased", /\bincreas(?:e|es|ed|ing)\b/i], ["improved", /\bimprov(?:e|es|ed|ing|ement|ements)\b/i], ["boosted", /\bboost(?:ed|s|ing)?\b/i],
  ["grew", /\b(?:grew|grow|grows|growing|grown|growth)\b/i], ["drove", /(?<![-\w])(?:drove|driv(?:e|es|ing|en))\b/i],
  ["reduced", /\breduc(?:e|es|ed|ing|tion)\b/i], ["cut", /\bcut(?:s|ting)?\b/i], ["won", /\b(?:won|wins?|winning)\b/i], ["award", /\bawards?\b|\bawarded\b/i],
  ["retention", /\bretention\b|\bretain(?:ed|s|ing)?\b/i], ["revenue", /\brevenues?\b/i], ["conversion", /\bconversions?\b/i],
  ["mentored", /\bmentor(?:ed|s|ing|ship)?\b/i], ["coached", /\bcoach(?:ed|es|ing)?\b/i], ["conducted", /\bconduct(?:ed|s|ing)?\b/i],
  ["defined", /\bdefin(?:e|es|ed|ing)\b/i], ["strategy", /\bstrateg(?:y|ies|ic)\b/i], ["research", /\bresearch(?:ed|ing)?\b/i],
  ["activated", /\bactivat(?:e|es|ed|ing|ion)\b/i], ["partnered with", /\bpartner(?:ed|ing)\s+with\b/i], ["ship", /\bship(?:s|ping)?\b/i],
  ["smart contracts", /\bsmart[\s-]contracts?\b/i], ["backend", /\bback[\s-]?ends?\b/i], ["Solidity", /\bsolidity\b/i],
  ["a contract you wrote or implemented", /\b(?:implement|wr[oi]te|written|deploy|code|build|built)\w*\b[^.;!?]{0,30}\bcontracts?\b/i],
  // Credit for finishing, fixing or delivering (wave 10): the quote must use the word itself.
  ["delivered", /\bdeliver(?:ed|s|ing)\b/i], ["contributed", /\bcontribut(?:e|es|ed|ing)\b/i], ["worked on", /\bwork(?:ed|s|ing)\s+on\b/i],
  ["fixed", /\bfix(?:ed|es|ing)\b/i], ["resolved", /\bresolv(?:e|es|ed|ing)\b/i], ["eliminated", /\beliminat(?:e|es|ed|ing)\b/i],
  ["verified", /\bverif(?:y|ies|ied|ying)\b/i], ["committed", /\bcommitted\b/i], ["coded", /(?<![-\w])coded\b/i], ["programmed", /\bprogrammed\b/i],
  ["engineered", /\bengineered\b/i], ["implemented", /\bimplement(?:ed|s|ing)\b/i],
  // "Built" alone stays allowed (he builds prototypes, a system, a workflow); built, built out or coded a software feature is engineering work.
  ["built a feature", /\bbuil(?:t|d|ds|ding)\b(?:\s+[^\s.;!?]+){0,4}?\s+(?:leaderboards?|animations?|sdks?|apis?|back[\s-]?ends?|smart[\s-]contracts?|integrations?|endpoints?|databases?|pipelines?|features?|functionality)\b/i],
  // Reception: what people thought is not something a designer can state without a source that says it.
  ["loved", /\blov(?:ed|es)\b/i], ["liked", /\bliked\b/i], ["praised", /\bpraise[sd]?\b|\bpraising\b/i], ["positive feedback", /\bpositive\s+(?:feedback|reviews?|responses?|reception)\b/i],
  ["intuitive", /\bintuitive(?:ly)?\b/i], ["seamless", /\bseamless(?:ly)?\b/i], ["delightful", /\bdelight(?:ful|fully|ed)\b/i], ["users found", /\busers?\s+found\b/i], ["adopted", /\badopt(?:ed|s|ing|ion)\b/i],
  // Vague gains.
  ["streamlined", /\bstreamlin(?:e|es|ed|ing)\b/i], ["simplified", /\bsimplif(?:y|ies|ied|ying)\b/i], ["optimised", /\boptimi[sz](?:e|es|ed|ing|ation)\b/i],
  ["attracted", /\battract(?:ed|s|ing)\b/i], ["generated", /\bgenerat(?:es|ed|ing)\b/i], ["converted", /\bconverted\b/i], ["onboarded", /\bonboarded\b/i], ["secured", /\bsecured\b/i],
  // Proof of success (wave 11): a designer line may not say the work took off, held up or sold unless the quote says so.
  ["a hit with users", /\ba\s+hit\s+with\b|\bhit\s+with\s+(?:\w+\s+)?users?\b/i], ["proved", /\bprov(?:ed|es|ing|en)\b/i],
  ["validated", /\bvalidat(?:ed|es|ing)\b/i], ["success", /\bsuccess(?:ful|fully)?\b(?!\s+(?:states?|screens?|messages?|pages?|toasts?|confirmations?)\b)/i],
  ["scaled", /\bscal(?:ed|es|ing)\b/i], ["sold", /\bsold\b(?![\s-]+out\b)/i],
  // Technology: a stack the quote does not name is not claimed. Case matters for the two that are also plain words.
  ["React", /(?<![\w.-])React(?:\.js|js)?(?![\w-])(?!\s+(?:to|on)\b)/], ["Next.js", /\bnext\.?js\b/i], ["TypeScript", /\btypescript\b/i], ["Python", /\bpython\b/i],
  ["Node.js", /\bnode\.?js\b/i], ["Node", /(?<![\w.-])Node(?![\w-])(?!\s+(?:graphs?|maps?|diagrams?|views?|operators?|sales?|licen[cs]es?))/],
  // Wave 12: team size, trust, speed, release and measurement are claims about the outcome or the people around the work. A quote must say them.
  // Trust as an outcome (built, earned or gained trust; trusted by; more trust), not a design topic ("trust signals", "a trustless protocol").
  // Faster, quicker and easier only when the sentence has no number: a number is held to its quote by the number rules. A third entry is what the QUOTE must hold.
  ["a team of", /\bteam\s+of\b/i],
  ["trust", /\b(?:built|build(?:s|ing)?|earned?|gain(?:ed|s)?|won|increased?|raised?|boosted?|improved?)\s+(?:\w+\s+)?(?:the\s+)?trust\b|\btrusted\s+by\b|\b(?:more|higher|greater)\s+trust\b|\btrust\s+(?:grew|increased|improved|rose)\b/i, /\btrust\w*/i],
  ["faster", /(?:^|[.;!?]\s*)(?![^.;!?]*\d)[^.;!?]*\b(?:faster|quicker|easier)\b/i, /\b(?:faster|quicker|easier)\b/i],
  ["went out", /\bwent\s+out\b/i], ["now deployed", /\b(?:now|already)\s+deployed\b/i], ["measured", /\bmeasured\b/i],
];
// Credit verbs (verb forms only): a line whose ONLY backing is a proposal, a request, a report or an analysis may not claim any of them
// unless the quote uses the word itself. Together with every MEANING_TERM.
const CREDIT_VERBS = [
  ["implemented", /\bimplement(?:ed|s|ing)\b/i], ["built", /\bbuilt\b/i], ["shipped", /\bshipped\b/i], ["launched", /\blaunch(?:ed|es|ing)\b/i], ["delivered", /\bdeliver(?:ed|s|ing)\b/i],
  ["released", /\breleas(?:ed|es|ing)\b/i], ["engineered", /\bengineered\b/i], ["programmed", /\bprogrammed\b/i], ["coded", /(?<![-\w])coded\b/i], ["fixed", /\bfix(?:ed|es|ing)\b/i],
  ["resolved", /\bresolv(?:e|es|ed|ing)\b/i], ["eliminated", /\beliminat(?:e|es|ed|ing)\b/i], ["verified", /\bverif(?:y|ies|ied|ying)\b/i], ["committed", /\bcommitted\b/i],
  ["rolled out", /\brolled\s+out\b/i], ["deployed", /\bdeploy(?:ed|s|ing)\b/i], ["increased", /\bincreas(?:e|es|ed|ing)\b/i], ["improved", /\bimprov(?:e|es|ed|ing)\b/i], ["grew", /\b(?:grew|grow|grows|growing|grown)\b/i],
  // Wave 12: splitting something is finishing it, unlike "proposed splitting". The quote must say it outside a "proposed ..." phrase.
  ["split", /\bsplit(?:s|ting)?\b/i],
  ...MEANING_TERMS,
];
const PROPOSED_SPAN = /\bpropos(?:ed|es|ing|al|als)\b(?:\s+(?:to\s+|a\s+|the\s+)?\w+)?/gi;
const NEGATED = /\b(?:whether|if)\b[^.,:;!?]*|\b(?:instead\s+of|rather\s+than)\b[^.,:;!?]*|\bnot[\s-]yet(?:[\s-]+[^\s.,:;!?]+){1,3}|\b(?:not(?!\s+only\b)|never|nor|without|isn['’]t|wasn['’]t|hasn['’]t|haven['’]t|didn['’]t|doesn['’]t)\b(?:\s+[^\s.,:;!?]+){1,3}/gi;
// A clause whose own verb says what the person did with a proposal, a request or a report.
const ALLOWED_WEAK_VERB = /^\s*(?:(?:also|then|first|later)\s+)?(?:propos(?:ed|ing)|design(?:ed|ing)|explor(?:ed|ing)|mapp(?:ed|ing)|specif(?:ied|ying)|draft(?:ed|ing)|ask(?:ed|ing)|flagg?(?:ed|ing)|suggest(?:ed|ing)|pointed\s+out)\b/i;
const WEAK_WORD = { proposed: "proposed", requested: "requested", reported: "reported", analysis: "an analysis" };
export const WEAK_MSG = (tag) => `Your notes say this was ${WEAK_WORD[tag] || tag}. Say what you did: proposed, designed or asked for it.`;
/** A short piece of a quote for a message: no markdown, no dashes, at most `n` characters, cut at a word. */
const excerpt = (q, n = 80) => {
  const t = foldText(q).replace(/[*`]+/g, "").replace(/[–—]/g, "-").replace(/'/g, "’").replace(/\s+/g, " ").trim().replace(/[.;:,!?]+$/, "");
  if (t.length <= n) return t;
  const cut = t.slice(0, n).replace(/\s+\S*$/, "").replace(/[.;:,!?]+$/, "");
  return `${cut || t.slice(0, n)}...`;
};
/** The warning for a line whose words are not in its notes. Plain: what the notes say, what the line says, and the question. */
export const wordingWarning = (where, sourceWords, lineWords) => (sourceWords && lineWords.length
  ? `${where}: Your notes say '${sourceWords}'. This line says '${lineWords.join(", ").replace(/'/g, "’")}'. Say yes if that is the same thing.`
  : `${where}: Your notes say something different from this line. Say yes if that is the same thing.`);
function meaningTie(where, text, sources, r, { warn = true, ctx = null, ignore = null } = {}) {
  if (typeof text !== "string") return;
  const line = foldText(stripPlaceholders(text));
  const srcList = Array.isArray(sources) ? sources : [];
  const quotes = srcList.filter((s) => s && typeof s.quote === "string" && norm(s.quote)).map((s) => foldText(s.quote));
  if (!quotes.length || !line.trim()) return;
  const joined = quotes.join(" \n ");
  // Backed only by quotes tagged proposed, requested, reported or analysis: no credit verb unless the source says that very word.
  // A word the line denies ("Whether it shipped is not recorded", "a proposal, not shipped work") claims nothing.
  const claim = line.replace(NEGATED, " ");
  const tags = ctx ? srcList.map((s) => sourceWeakTag(s, ctx)) : [];
  if (tags.length && tags.every(Boolean)) {
    // A clause that already says what the person did (proposed, designed, mapped...) is not a claim to have built or shipped: only the other clauses are held to the rule.
    const open = clausesOfLine(claim).filter((cl) => !ALLOWED_WEAK_VERB.test(cl));
    const done = joined.replace(PROPOSED_SPAN, " ");
    const credit = CREDIT_VERBS.filter(([k, re, qre]) => open.some((cl) => re.test(cl)) && !(qre || re).test(k === "split" ? done : joined)).map(([k]) => k);
    if (credit.length) { r.problems.push(`${where}: ${WEAK_MSG(tags[0])} The line says "${credit.join('", "')}".`); return; }
  }
  const missing = MEANING_TERMS.filter(([, re, qre]) => re.test(claim) && !(qre || re).test(joined)).map(([k]) => k);
  if (missing.length) { r.problems.push(`${where}: ${MEANING_MSG} The line says "${missing.join('", "')}" and your quote does not.`); return; }
  if (!warn) return;
  // The whole line and then each clause: a short false clause is not hidden by a long honest one. One warning per line, naming the words.
  // A line that denies something ("not shipped", "instead of one badge") does not count the words it denies, so the whole line is read as `claim`.
  const shown = [];
  const whole = overlapOf(claim, quotes, ignore);
  if (whole.total && whole.n / whole.total < MEANING_OVERLAP) shown.push(...whole.missing);
  for (const cl of clausesOfLine(claim)) {
    const o = overlapOf(cl, quotes, ignore);
    if (o.total >= 3 && o.n / o.total < MEANING_OVERLAP) for (const w of o.missing) if (!shown.includes(w)) shown.push(w);
  }
  if (!shown.length) return;
  // What the notes say: the quote that holds the most of the line's words, a short piece of it. Nothing confidential is ever repeated.
  const hidden = !!ctx && (denyHit(ctx.deny, line) || quotes.some((q) => denyHit(ctx.deny, q)));
  const best = quotes.map((q) => ({ q, n: overlapOf(claim, [q], ignore).n })).sort((a, b) => b.n - a.n)[0];
  r.warnings.push(hidden ? wordingWarning(where, "", []) : wordingWarning(where, excerpt(best.q), shown.slice(0, 3)));
}

// ---- identity: addresses, employers, name, place ----------------------------------------------------------------------------------
// An address, an employer, a name or a place is a fact about who the person is. None of them may be new: each must already be in the career
// file, his answers or his evidence (an address and a sub line), in the item's own quotes (an employer), or in the career file or his
// answers (his name and place), unless a header quote says it.
/** An address in its comparison form: no protocol, no www, no trailing slash or punctuation, lower case. */
const urlKey = (s) => norm(String(s ?? "")).replace(/^mailto:/i, "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/[.,;:!?)\]}"'’”]+$/, "").replace(/\/+$/, "").toLowerCase();
const hayLow = (ctx) => { if (ctx._hlSrc !== ctx.haystack) { ctx._hlSrc = ctx.haystack; ctx._hl = String(ctx.haystack || "").toLowerCase(); } return ctx._hl; };
/** Where an address sits in a lower-case text as a whole address: not inside a longer host (mint.com in example-mint.com), not a part of a longer word. */
function urlAt(key, hay) {
  const out = [];
  if (!key) return out;
  for (let i = hay.indexOf(key); i >= 0; i = hay.indexOf(key, i + 1)) {
    const b = hay[i - 1] || " ";
    const a = hay[i + key.length] || " ";
    const beforeOk = !/[a-z0-9@_-]/.test(b) && (b !== "." || hay.slice(Math.max(0, i - 4), i) === "www.");
    const afterOk = !/[a-z0-9_-]/.test(a) && !/^\.[a-z0-9]/.test(hay.slice(i + key.length, i + key.length + 2));
    if (beforeOk && afterOk) out.push(i);
  }
  return out;
}
/** Is this address (or email) in the career file, the answers or the evidence? An empty one is fine. */
export function urlSeen(raw, ctx) { const k = urlKey(raw); return !k || urlAt(k, hayLow(ctx)).length > 0; }
/** The addresses a free text holds (placeholders left out). */
export function urlsIn(text) {
  if (typeof text !== "string" || !text) return [];
  return [...new Set([...foldText(stripPlaceholders(text)).matchAll(FREE_URL)].map((m) => m[0].replace(/[.,;:!?)\]}"'’”]+$/, "")).filter((u) => urlKey(u)))];
}
const TEST_DEPLOY = /\btest(?:ing)?[\s-]+(?:deploy\w*|site|build|version|link|url)|\bstaging\b|\bplaceholder[\s-]+(?:url|link|site)/i;
/** Does the career file, the answers or the evidence call this address a test deployment (so it cannot be a final address)? */
export function testDeployment(raw, ctx) {
  const k = urlKey(raw);
  const hay = hayLow(ctx);
  return urlAt(k, hay).some((i) => TEST_DEPLOY.test(hay.slice(Math.max(0, i - 20), i + k.length + 50)));
}
/** The career file and the answers as one lower-case text (the evidence is left out: a name or a place comes from who the person says he is). */
const idHay = (ctx) => { if (ctx._idHay === undefined) ctx._idHay = [ctx.dossier || "", ...(ctx.onboarding || []).map((x) => x.text)].join(" \n ").toLowerCase(); return ctx._idHay; };
const wordIn = (w, hay) => new RegExp(`(?<![a-z0-9])${esc(w.toLowerCase())}`).test(hay);
// Words a place line may hold without them being a place.
const PLACE_GENERIC = /^(?:remote|hybrid|on-?site|open to relocation|relocat\w*|worldwide|anywhere|global|flexible)$/i;
// Capitalised words of a sub line that are not names (working arrangements).
const SUB_GENERIC = new Set(["remote", "hybrid", "onsite", "on-site", "full", "part", "time", "contract", "internship", "apprenticeship"]);

/** Checks one CV version. Returns { ran, pass, unsourced_numbers, deny_hits, placeholders, problems, dev_sources }. */
const addressProblems = (r, ctx, where, text) => { for (const u of urlsIn(text)) if (!urlSeen(u, ctx)) r.problems.push(`${where}: ${denyHit(ctx.deny, u) ? "an address" : u} is an address that is not in your career file, answers or evidence. Use an address you have, or write [NEEDS: the address]`); };
export function checkVersion(v, ctx) {
  const r = newResult(ctx);
  const noAddress = (where, text) => addressProblems(r, ctx, where, text);
  // The employers of the version: words that name where the person worked are never "uncovered" in a line of that job.
  const employerOf = (h) => (typeof h === "string" ? h.split("·")[0].trim() : "");
  const employers = (v.sections || []).filter((s) => s.kind === "experience").flatMap((s) => (s.items || []).map((it) => employerOf(it.heading)));
  for (const sec of v.sections || []) for (const it of sec.items || []) {
    const itemSrc = Array.isArray(it.sources) ? it.sources : [];
    const bulletSrc = (it.bullets || []).flatMap((b) => (Array.isArray(b.sources) ? b.sources : []));
    const itemText = [it.heading, it.sub, it.dates, ...(it.bullets || []).map((b) => b.text)].filter(Boolean).join(" ");
    for (const s of itemSrc) { const p = quoteProblem(s, ctx, itemText); if (p) r.problems.push(`${v.id}/${sec.id}/${it.id}: ${p}`); }
    if (itemSrc.some((s) => restsOnChat(s, ctx))) r.dev_sources.push(`${v.id}/${sec.id}/${it.id}`);
    const ignore = ignoreStems(it.heading, ...employers);
    for (const b of it.bullets || []) {
      checkClaim(`${v.id}/${sec.id}/${it.id}/${b.id}`, b.text, b.sources, ctx, r);
      const isSkills = sec.kind === "skills" || sec.id === "skills";
      meaningTie(`${v.id}/${sec.id}/${it.id}/${b.id}`, b.text, b.sources, r, { warn: !isSkills, ctx, ignore });
      if (isSkills) softSkillsCheck(`${v.id}/${sec.id}/${it.id}/${b.id}`, b, r);
      noAddress(`${v.id}/${sec.id}/${it.id}/${b.id}`, b.text);
    }
    // An address in a heading or a sub line (a "Live work" link, a project name) must be one the person has.
    noAddress(`${v.id}/${sec.id}/${it.id}/heading`, it.heading);
    noAddress(`${v.id}/${sec.id}/${it.id}/sub`, it.sub);
    // The employer or school (the heading before the "·") must be named in a quote of this item.
    if (typeof it.heading === "string" && it.heading.includes("·")) {
      const name = norm(employerOf(stripPlaceholders(it.heading))).toLowerCase();
      const held = [...itemSrc, ...bulletSrc].filter((s) => s && typeof s.quote === "string").map((s) => norm(s.quote).toLowerCase()).join(" \n ");
      if (name && /[a-z0-9]/.test(name) && !held.includes(name)) r.problems.push(`${v.id}/${sec.id}/${it.id}/heading: "${employerOf(it.heading)}" is not named in any quote of this item. Quote the line of your career file that names it`);
    }
    // A name in the sub line (a place, a company: "Singapore-based") must be one the career file, answers or evidence has.
    if (typeof it.sub === "string") {
      const hay = hayLow(ctx);
      const seenWords = new Set();
      for (const w of (foldText(stripPlaceholders(it.sub)).replace(FREE_URL, " ").match(/\p{Lu}[\p{L}]{2,}/gu) || [])) {
        const low = w.toLowerCase();
        if (seenWords.has(low) || SUB_GENERIC.has(low)) continue;
        seenWords.add(low);
        if (!wordIn(w, hay)) r.problems.push(`${v.id}/${sec.id}/${it.id}/sub: "${w}" is not in your career file, answers or evidence. Say it the way your notes do`);
      }
    }
    // A role word (senior, lead, founder...) in the heading, the sub line or a bullet must be in a quote of this item.
    const itemQuotes = [...itemSrc, ...bulletSrc].filter((s) => s && typeof s.quote === "string").map((s) => s.quote);
    for (const [k, t] of [["heading", it.heading], ["sub", it.sub], ...(it.bullets || []).map((b) => [b.id, b.text])]) {
      for (const [key, w] of roleWords(t, itemQuotes, ctx.compounds)) if (!quotesHoldRole(itemQuotes, key)) r.problems.push(`${v.id}/${sec.id}/${it.id}/${k}: "${w}" is a role word, and none of this item's quotes says it. ${roleAdvice(key)}`);
    }
    // Something the source calls "in development" is never said to be shipped, launched or live. The item's own heading, sub line or
    // item-level quotes make every line of the item "in development"; a bullet's own quotes make that bullet so.
    // Each clause is judged on the product named nearest to its status word; a clause that names no product falls back to the item's own
    // heading, sub line and quotes (and a heading that names an in-development product).
    const inDev = ctx.inDevNames || [];
    const itemDev = IN_DEV.test([it.heading, it.sub, ...itemSrc.map((s) => s && s.quote)].filter((x) => typeof x === "string").map(foldText).join(" "))
      || [it.heading, it.sub].some((x) => typeof x === "string" && productMatches(foldText(x), inDev).some((e) => e.dev));
    for (const [k, t, own] of [["heading", it.heading, []], ["sub", it.sub, []], ...(it.bullets || []).map((b) => [b.id, b.text, Array.isArray(b.sources) ? b.sources : []])]) {
      if (typeof t !== "string") continue;
      const hit = devStatusHit(t, inDev, itemDev || IN_DEV.test(own.map((s) => (s && typeof s.quote === "string" ? foldText(s.quote) : "")).join(" ")));
      if (hit) r.problems.push(`${v.id}/${sec.id}/${it.id}/${k}: says "${hit}", but your source says this is in development. Say what you designed, or say it is in development`);
    }
    // Heading, sub line and dates make claims too (dates are numbers). Their numbers must be in a quote of the item or of one of its bullets.
    for (const k of ["heading", "sub", "dates"]) {
      const have = backingTokens([...itemSrc, ...bulletSrc]);
      let missed = 0;
      for (const tok of new Set(numberTokens(it[k]))) if (!have.has(tok)) { r.unsourced_numbers.push(`${v.id}/${sec.id}/${it.id}/${k}: ${denyHit(ctx.deny, it[k]) ? "(withheld)" : tok}`); missed++; }
      if (missed && shortQuote([...itemSrc, ...bulletSrc])) r.problems.push(`${v.id}/${sec.id}/${it.id}/${k}: ${SHORT_QUOTE}`);
    }
  }
  // A link in the header must be one the person actually has: found in the career file, his answers or his evidence.
  const h = v.header || {};
  const seen = (s) => urlSeen(s, ctx);
  if (h.email && !seen(h.email)) r.problems.push(`${v.id}/header.email: ${h.email} is not in your career file, answers or evidence`);
  (h.links || []).forEach((l, i) => { if (l && l.url && !seen(l.url)) r.problems.push(`${v.id}/header.links[${i}]: ${l.url} is not in your career file, answers or evidence`); });
  // The rest of the page makes claims too: name, title, location, section titles, link labels. A number there needs a quote in the
  // header-level `sources` (checked like a bullet's). The target and the "why" may carry only numbers that are in the pasted job post.
  const hSrc = h.sources === undefined ? [] : h.sources;
  if (!Array.isArray(hSrc)) r.problems.push(`${v.id}/header.sources: must be a list of quotes`);
  const headSrc = Array.isArray(hSrc) ? hSrc : [];
  const frame = [["name", h.name], ["title", h.title], ["location", h.location], ...(h.links || []).map((l, i) => [`links[${i}].label`, l && l.label])]
    .map(([k, t]) => [`${v.id}/header.${k}`, t]);
  for (const sec of v.sections || []) frame.push([`${v.id}/${sec.id}/title`, sec.title]);
  headSrc.forEach((s) => { const p = quoteProblem(s, ctx, [h.name, h.title, h.location].filter(Boolean).join(" ")); if (p) r.problems.push(`${v.id}/header.sources: ${p}`); });
  if (headSrc.some((s) => restsOnChat(s, ctx))) r.dev_sources.push(`${v.id}/header`);
  // His name and where he is based are in his career file or answers, or a header quote says them.
  {
    const said = headSrc.filter((s) => s && s.kind !== "dev" && typeof s.quote === "string").map((s) => norm(s.quote).toLowerCase()).join(" \n ");
    const known = (t) => idHay(ctx).includes(t) || said.includes(t);
    const nm = norm(stripPlaceholders(h.name ?? "")).toLowerCase();
    if (nm && !known(nm)) r.problems.push(`${v.id}/header.name: "${h.name}" is not the name in your career file or answers. Use your name as they have it, or add the quote to header.sources`);
    for (const part of norm(stripPlaceholders(h.location ?? "")).split(/\s*[·,|\/;]\s*/).map((p) => p.trim().toLowerCase()).filter(Boolean)) {
      if (PLACE_GENERIC.test(part) || known(part)) continue;
      r.problems.push(`${v.id}/header.location: "${part}" is not a place in your career file or answers. Use the place as they have it, or add the quote to header.sources`);
    }
  }
  for (const [k, t] of [["name", h.name], ["title", h.title], ["location", h.location], ...(h.links || []).map((l, i) => [`links[${i}].label`, l && l.label])]) noAddress(`${v.id}/header.${k}`, t);
  for (const sec of v.sections || []) noAddress(`${v.id}/${sec.id}/title`, sec.title);
  for (const [key, w] of roleWords(h.title, headSrc.filter((s) => s && typeof s.quote === "string").map((s) => s.quote), ctx.compounds)) if (!quotesHoldRole(headSrc.filter((s) => s && typeof s.quote === "string").map((s) => s.quote), key)) r.problems.push(`${v.id}/header.title: "${w}" is a role word, and none of the header's quotes says it. ${roleAdvice(key)}, or add the quote to header.sources`);
  const headHave = backingTokens(headSrc);
  for (const [where, t] of frame) {
    let missed = 0;
    for (const tok of new Set(numberTokens(t))) if (!headHave.has(tok)) { r.unsourced_numbers.push(`${where}: ${denyHit(ctx.deny, t) ? "(withheld)" : tok}`); missed++; }
    if (missed && shortQuote(headSrc)) r.problems.push(`${where}: ${SHORT_QUOTE}`);
  }
  if (engineMessageLike(v.why)) r.problems.push(`${v.id}/why: this reads like a message from the engine, not a reason. Say in plain words why this version exists, for example "First CV, built from your current CV and your career file."`);
  const post = new Set(numberTokens(v.target && v.target.post_excerpt));
  const postText = [[`${v.id}/why`, v.why], ...(v.target ? [[`${v.id}/target.company`, v.target.company], [`${v.id}/target.role`, v.target.role]] : [])];
  for (const [where, t] of postText) for (const tok of new Set(numberTokens(t))) if (!post.has(tok)) r.unsourced_numbers.push(`${where}: ${denyHit(ctx.deny, t) ? "(withheld)" : tok}`);
  // The deny scan skips the stored checks and the target (the employer's own words: company, role and the pasted post). The number
  // checks above still run on the target. The why is not rendered in the CV, so it is not scanned for terms (its numbers are still checked
  // above); every bullet, heading and sub line is.
  denyScan(allStrings(v, v.id, [], (k) => k === "checks" || k === "target" || k === "why"), ctx, r);
  r.placeholders = placeholderList(v).length;
  return finish(r);
}

/** The in-development rule for one case-study text (a beat, a decision field or an option) and its own quotes. */
function devStatusCase(where, text, sources, ctx, r) {
  if (typeof text !== "string") return;
  const own = (Array.isArray(sources) ? sources : []).map((s) => (s && typeof s.quote === "string" ? foldText(s.quote) : "")).join(" ");
  const hit = devStatusHit(text, ctx.inDevNames || [], IN_DEV.test(own));
  if (hit) r.problems.push(`${where}: says "${hit}", but your source says this is in development. Say what you designed, or say it is in development`);
}

/** Checks one case study. Placeholders are the [NEEDS: ...] in the text plus each entry of a beat's `needs` list. */
export function checkCase(c, ctx) {
  const r = newResult(ctx);
  const caseQuotes = [];
  const caseIgnore = ignoreStems(c.title);
  for (const b of c.beats || []) caseQuotes.push(...(Array.isArray(b.sources) ? b.sources : []));
  for (const d of c.decisions || []) caseQuotes.push(...(Array.isArray(d.sources) ? d.sources : []));
  (c.beats || []).forEach((b, i) => {
    checkClaim(`${c.id}/beat ${i + 1}`, b.text, b.sources, ctx, r, { caseBeat: true });
    meaningTie(`${c.id}/beat ${i + 1}`, b.text, b.sources, r, { ctx, ignore: caseIgnore });
    addressProblems(r, ctx, `${c.id}/beat ${i + 1}`, b.text);
    addressProblems(r, ctx, `${c.id}/beat ${i + 1} title`, b.title);
    devStatusCase(`${c.id}/beat ${i + 1}`, b.text, b.sources, ctx, r);
    // A beat's title and its "needs" lines are text too: a number in them needs a quote in the case (a [NEEDS ...] marker is left out).
    checkClaim(`${c.id}/beat ${i + 1} title`, b.title, [], ctx, r, { pool: caseQuotes, needSource: false });
    (Array.isArray(b.needs) ? b.needs : []).forEach((n, j) => checkClaim(`${c.id}/beat ${i + 1} needs ${j + 1}`, n, [], ctx, r, { pool: caseQuotes, needSource: false }));
  });
  (c.decisions || []).forEach((d, i) => {
    const attrib = [d.decision, d.context, d.tradeoffs, d.outcome, ...(d.options || [])].filter((x) => typeof x === "string").join(" ");
    for (const k of ["decision", "context", "tradeoffs", "outcome"]) { addressProblems(r, ctx, `${c.id}/decision ${i + 1} ${k}`, d[k]); checkClaim(`${c.id}/decision ${i + 1} ${k}`, d[k], d.sources, ctx, r, { attrib }); meaningTie(`${c.id}/decision ${i + 1} ${k}`, d[k], d.sources, r, { warn: false, ctx }); devStatusCase(`${c.id}/decision ${i + 1} ${k}`, d[k], d.sources, ctx, r); }
    (d.options || []).forEach((o, j) => { checkClaim(`${c.id}/decision ${i + 1} option ${j + 1}`, o, d.sources, ctx, r, { attrib }); meaningTie(`${c.id}/decision ${i + 1} option ${j + 1}`, o, d.sources, r, { warn: false, ctx }); devStatusCase(`${c.id}/decision ${i + 1} option ${j + 1}`, o, d.sources, ctx, r); });
  });
  for (const k of ["title", "one_line", "type", "owned", "team", "audience", "hook"]) { addressProblems(r, ctx, `${c.id}/${k}`, c[k]); checkClaim(`${c.id}/${k}`, c[k], [], ctx, r, { pool: caseQuotes, needSource: false }); }
  denyScan(allStrings(c, c.id), ctx, r);
  r.placeholders = caseNeeds(c).length;
  return finish(r);
}

/** Checks everything in a career object. Returns { pass, versions: {id: result}, cases: {id: result} }. */
export function checkCareer(career, ctx) {
  const out = { pass: true, versions: {}, cases: {} };
  for (const v of (career && career.cv && career.cv.versions) || []) { out.versions[v.id] = checkVersion(v, ctx); if (!out.versions[v.id].pass) out.pass = false; }
  for (const c of (career && career.cases) || []) { out.cases[c.id] = checkCase(c, ctx); if (!out.cases[c.id].pass) out.pass = false; }
  return out;
}

/** The stored shape (checks.honesty) from a full result. The problems list is kept so the app can say what to fix. */
export function toStored(r) {
  return { ran: r.ran, pass: r.pass, unsourced_numbers: r.unsourced_numbers, deny_hits: r.deny_hits, placeholders: r.placeholders, ...(r.problems.length ? { problems: r.problems } : {}), ...(r.dev_sources.length ? { dev_sources: r.dev_sources } : {}), ...(r.warnings && r.warnings.length ? { warnings: r.warnings } : {}) };
}

/** One plain sentence for a person: what to fix. */
const WORD_TOKEN_NAME = { digit: "single or double digit", "order of magnitude": "an order of magnitude", "one in": "one in ...", fold: "fold", once: "once", second: "second", third: "third", first: "first" };
/**
 * A plain sentence for one entry of unsourced_numbers ("where: token") when the token is a word, not a digit ("second", "once", "a week"):
 * the entry itself keeps its short form. "" for a number written in digits.
 */
export function plainUnsourced(entry) {
  const i = String(entry).lastIndexOf(": ");
  if (i < 0) return "";
  const where = entry.slice(0, i);
  const tok = entry.slice(i + 2);
  if (!/^[a-z]/i.test(tok) || /\d/.test(tok) || tok === "(withheld)") return "";
  return `In ${where} your line says "${WORD_TOKEN_NAME[tok] || tok}", which counts or ranks something, and your source does not say it. Use your source's words, or take it out`;
}
export function explain(r) {
  const parts = [];
  if (r.unsourced_numbers.length && plainUnsourced(r.unsourced_numbers[0])) parts.push(`${r.unsourced_numbers.length > 1 ? `${r.unsourced_numbers.length} counts have no quote behind them. First: ` : ""}${plainUnsourced(r.unsourced_numbers[0])}`);
  else if (r.unsourced_numbers.length) parts.push(`${r.unsourced_numbers.length} number${r.unsourced_numbers.length === 1 ? " has" : "s have"} no quote behind ${r.unsourced_numbers.length === 1 ? "it" : "them"} (first: ${r.unsourced_numbers[0]}). Write the number as your source does ("ten" and "10" match, "40%" and "40 percent" match, "40" and "40%" do not)`);
  if (r.deny_hits.length) parts.push(`${r.deny_hits.length} confidential or not-yours term${r.deny_hits.length === 1 ? "" : "s"} (first: ${r.deny_hits[0]})`);
  if (r.problems.length) parts.push(r.problems[0] + (r.problems.length > 1 ? ` (and ${r.problems.length - 1} more)` : ""));
  return parts.join("; ").replace(/[.\s]+$/, "");
}

/** A note with at least this many content words, 60% or more of them found in one private answer, is that answer in other words. */
export const REWORD_MIN_WORDS = 4;
export const REWORD_OVERLAP = 0.6;
function reworded(text, answers) {
  const want = contentStems(text);
  if (want.size < REWORD_MIN_WORDS) return false;
  return (answers || []).some((e) => [e.text, ...(e.parts || [])].some((a) => { const have = contentStems(a); let n = 0; for (const w of want) if (have.has(w)) n++; return n / want.size >= REWORD_OVERLAP; }));
}

/**
 * Is this evidence note text allowed? Returns "" or a plain reason. Refused: a deny-list hit, or text that matches (normalised, either one
 * inside the other, 20 characters or more) a private or Round 3 interview answer, or anything under dossier 3.9 or 3.10. Never repeats the text.
 */
export function noteProblem(text, ctx) {
  const t = norm(text).toLowerCase();
  if (!t) return "";
  if (denyHit(ctx.deny, String(text))) return "That note holds a confidential item, so I did not save it. Keep it out of your CV and case studies.";
  const hit = (other) => { const o = norm(other).toLowerCase(); return (t.length >= 20 && o.includes(t)) || (o.length >= 20 && t.includes(o)); };
  const priv = (ctx.privateAnswers || []).some((e) => hit(e.text) || e.parts.some(hit)) || reworded(String(text), ctx.privateAnswers);
  if (priv) return "That note repeats one of your private interview answers, so I did not save it. Say it again in different words, or leave it out.";
  if ((ctx.blocked || []).some(hit)) return "That note repeats something that is confidential or not your work, so I did not save it.";
  return "";
}
