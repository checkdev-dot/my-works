import type { CareerData, CvVersion, CaseStudy } from "./types";
export const DEFAULT_DOSSIER: string;
export { PLACEHOLDER_RE } from "./career-needs.mjs";
export const SOURCE_KINDS: string[];
/** Puts evidence entries held in memory (a list not yet written) into a context so a later action can cite them. */
export function withEvidence<T>(ctx: T, entries: unknown[]): T;
export { normWs, countPlaceholders, stripPlaceholders, textSlots, versionTexts, placeholderList, listPlaceholders, caseTexts, caseNeeds } from "./career-needs.mjs";
/** Number tokens of a text in canonical form (placeholders, urls, emails and hex colours left out). */
export function numberTokens(text: unknown): string[];
/** The one normal form for comparing text: NFKC, invisible characters removed, other scripts' digits to 0-9, Cyrillic/Greek look-alikes to Latin. */
export function foldText(s: unknown): string;
/** A quote that backs a number must be at least this many characters. */
export const MIN_NUMBER_QUOTE: number;
/** The number tokens a set of sources can back (dev sources and quotes under MIN_NUMBER_QUOTE characters never back one). */
export function backingTokens(srcs: unknown[]): Set<string>;
/** Does a line say who said it: a name within three words of a verb of saying or a quote mark, or a name from the evidence titles. */
export function attributes(text: string, titles?: string[]): boolean;
/** "" when an evidence note text is allowed, else a plain reason (confidential item, or a private/Round 3 answer or dossier 3.9/3.10 text). */
export function noteProblem(text: string, ctx: HonestyContext): string;
/** The dossier as normalised text plus its numbered headings (offset into that text). */
export function parseDossier(raw: string): { text: string; heads: { at: number; num: string }[]; blocked: string[]; bare: string; bareHeads: { at: number; num: string }[]; spans: { at: number; end: number; tags: string[] }[]; bareSpans: { at: number; end: number; tags: string[] }[] };
/** The evidence tags (lower case: fact, shown, reported, requested, proposed, analysis, unknown) on one line of the career file. */
export function lineTags(line: string): string[];
/** "proposed", "requested", "reported" or "analysis" when the tags prove nothing was done (no fact or shown beside them), else "". */
export function weakTag(tags: string[]): string;
/** The weak evidence tag behind a dossier quote (every usable place it sits is tagged only proposed, requested, reported or analysis), else "". */
export function sourceWeakTag(src: unknown, ctx: HonestyContext): string;
/** The refusal sentence for a credit verb over a weak tag: "Your notes say this was <tag>. Say what you did: proposed, designed or asked for it." */
export function WEAK_MSG(tag: string): string;
/** A plain sentence for one unsourced_numbers entry whose token is a word ("second", "once"), or "" for a number in digits. */
export function plainUnsourced(entry: string): string;
export interface HonestyContext { dataDir: string | null; dossierPath: string; denylistPath: string | null; now: Date; loadProblems: string[]; dossier: string | null; dossierHeads: { at: number; num: string }[]; [k: string]: unknown }
export function makeContext(opts?: { dataDir?: string; dossierPath?: string; denylistPath?: string; now?: Date }): HonestyContext;
export const PRIVATE_ANSWER: string;
/** claimText is the line the quote backs: a third-party source (expert, market) is only allowed when that line says who said it. */
export function quoteProblem(src: unknown, ctx: HonestyContext, claimText?: string): string;
export interface HonestyResult { ran: string; pass: boolean; unsourced_numbers: string[]; deny_hits: string[]; placeholders: number; problems: string[]; dev_sources: string[]; warnings: string[] }
export function checkVersion(v: CvVersion, ctx: HonestyContext): HonestyResult;
export function checkCase(c: CaseStudy, ctx: HonestyContext): HonestyResult;
export function checkCareer(career: CareerData, ctx: HonestyContext): { pass: boolean; versions: Record<string, HonestyResult>; cases: Record<string, HonestyResult> };
export function toStored(r: HonestyResult): { ran: string; pass: boolean; unsourced_numbers: string[]; deny_hits: string[]; placeholders: number; problems?: string[]; dev_sources?: string[]; warnings?: string[] };
export function explain(r: HonestyResult): string;
/** Does any deny-list rule match this text (folded first; "40 percent" is read as 40%)? */
export function denyHit(deny: unknown[] | undefined, text: string): boolean;
/** A note with at least REWORD_MIN_WORDS content words, REWORD_OVERLAP or more of them in one private answer, is refused as that answer reworded. */
export const REWORD_MIN_WORDS: number;
export const REWORD_OVERLAP: number;
/** The one sentence shown when a line says something its quotes do not (a refusal when it uses an outcome or credit word the quotes lack, a warning when few of its words are in the quotes). */
export const MEANING_MSG: string;
/** A line with fewer than this share of its content words in its quotes gets the meaning warning. */
export const MEANING_OVERLAP: number;
/** True when a "why" reads like one of the engine's own messages ("Say ...", "Use the ...", "Write the number ...", "Your source ...", "Your notes say ..."). */
export function engineMessageLike(text: unknown): boolean;
/** The products the career file calls "in development" (from every line that says so), without "The": ["Beta"]. */
export function inDevEntities(raw: string): string[];
/** The clauses of a line: split at . ; : ! ? and where a comma or "and" is followed by a verb. Lists stay whole. */
export function clausesOfLine(text: string): string[];
/** The status word (shipped, launched, live...) a line says about an in-development product, judged per clause on the nearest named product, or "". `fallbackDev` covers a clause that names no product. */
export function devStatusHit(text: string, inDev: string[], fallbackDev?: boolean): string;
/** Is this address (or email) in the career file, the answers or the evidence, as a whole address (mint.com is not found inside example-mint.com)? An empty one is fine. */
export function urlSeen(raw: string, ctx: HonestyContext): boolean;
/** The web addresses, domains and emails a free text holds (placeholders left out). */
export function urlsIn(text: string): string[];
/** Does the career file, the answers or the evidence call this address a test deployment (so it is never a final address)? */
export function testDeployment(raw: string, ctx: HonestyContext): boolean;
/** The stems of the words in some texts (a heading, an employer, a case title): words a line may use without them being in its quote. */
export function ignoreStems(...texts: unknown[]): Set<string>;
/** The warning for a line whose words are not in its notes: "Your notes say '<source words>'. This line says '<line words>'. Say yes if that is the same thing." */
export function wordingWarning(where: string, sourceWords: string, lineWords: string[]): string;
