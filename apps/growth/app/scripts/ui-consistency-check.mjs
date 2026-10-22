// Pure checks for the words the UI says more than once. Run: node scripts/ui-consistency-check.mjs
import { readFileSync } from "node:fs";
import { ratingState, ratingSummary, lengthText, lookForText, secondPerson } from "../lib/rating-state.mjs";
import { claudeStatus } from "../lib/claude-status.mjs";
import { HOW_LINES, HELP_ABOUT } from "../lib/help.ts";
import { PAGE_COMMAND, howLines } from "../lib/commands.ts";

let fail = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` ${extra}` : ""}`); if (!cond) fail++; };

// 1. Two owners, one function.
const est = { source: "ai", reviewed_by: "claude", as_of: "2026-10-09" };
const mine = { source: "self", reviewed_by: "dev", as_of: "2026-10-01" };
const shipped = { source: "shipped", reviewed_by: "claude", as_of: "2026-10-01" };
ok("Claude's set level is 'Claude's estimate', hollow, dated", ratingState(est).label === "Claude's estimate" && ratingState(est).dot === "hollow" && ratingState(est).date === "2026-10-09");
ok("a level the person set is 'Confirmed by you', filled", ratingState(mine).label === "Confirmed by you" && ratingState(mine).dot === "filled" && ratingState(mine).aria === "confirmed by you");
ok("shipped work is backing, not a third owner", ratingState(shipped).owner === "claude" && ratingState(shipped).backing === "backed by shipped work");
ok("no rating state uses the word 'checked'", [est, mine, shipped, {}].every((r) => !/checked/i.test(JSON.stringify(ratingState(r)))));
const none = ratingSummary([est, est, shipped]);
ok("hero and list summary: none confirmed says so once", none.confirmed === 0 && none.line === "All 3 levels are Claude's estimates. You have not confirmed any yet.", none.line);
ok("mixed summary counts confirmed", ratingSummary([est, mine]).line === "You confirmed 1 of 2 levels. The rest are Claude's estimates.");

// 2. One length helper.
ok("a book is hours of reading, everywhere", lengthText(336, "book") === "about 6 hours of reading" && lengthText(60, "book") === "about 1 hour of reading");
ok("short lengths are minutes, long ones hours", lengthText(20) === "20 min" && lengthText(336) === "about 6 hours" && lengthText(0) === "");

// 3. Score-dependent readiness sentence.
ok("recruiter sentence follows the score", /^Some/.test(lookForText(53)) && /^Most/.test(lookForText(65)) && /^Everything/.test(lookForText(80)) && lookForText(53) !== lookForText(80));

// 4. The status line uses only what exists.
const none0 = claudeStatus({ queue: { items: [] } }).sentence;
ok("no runs and no done items does not claim a run", /has not answered anything yet\./.test(none0) && !/last ran/.test(none0) && /Nothing is queued for Claude yet\./.test(none0), none0);
const noRuns = claudeStatus({ queue: { items: [{ status: "done", done: "2026-10-12" }, { status: "pending", type: "ask" }] } }).sentence;
ok("no runs.json never says 'Claude last ran'", /^Claude last answered something: 12 Oct\./.test(noRuns) && !/last ran/.test(noRuns), noRuns);
const st = claudeStatus({ runs: { runs: [{ started: "2026-10-12T09:00:00Z", ended: "2026-10-13T10:00:00Z" }] }, queue: { items: [{ status: "pending", type: "ask" }, { status: "pending", type: "critique" }, { status: "pending", type: "test" }] } });
ok("status line names last run and what it reads", st.sentence === 'Claude last ran: 13 Oct. When you say “answer it”, it reads: 1 question, 2 tasks.', st.sentence);

// 5. How this works is three lines per page; every page that has a ? names the one thing to say, and the lead reads the same phrase.
ok("three How lines", HOW_LINES.length === 3 && howLines("skill").length === 3);
const pages = ["today", "skill", "reach", "journal", "library", "companion"];
ok("every page has one thing to say next", pages.every((k) => typeof PAGE_COMMAND[k]?.say === "string" && PAGE_COMMAND[k].say.length > 2));
ok("the lead of each ? sheet names that page's own command and reply place", pages.every((k) => howLines(k)[1][1].includes(`“${PAGE_COMMAND[k].say}”`) && howLines(k)[2][1] === PAGE_COMMAND[k].replyShowsOn));
ok("one phrase for rating: rate my research skill, not rate my skill", PAGE_COMMAND.skill.say === "rate my research skill" && !/rate my skill/.test(readFileSync(new URL("../components/CommandHint.tsx", import.meta.url), "utf8")));
ok("no ? bullet quotes a command that differs from the page chip", pages.every((k) => (HELP_ABOUT[k === "reach" ? "reach" : k]?.lines ?? []).every((l) => !/[“"][^”"]+[”"]/.test(l) || l.includes("{say}") || (l.includes("“answer it”") && /strip/.test(l)))));

// 6. Source assertions (no live writes): Undo exists on dismiss, hand in, I sent it and Finished it; the sheet resets its scroll; Moments is gone.
const app = readFileSync(new URL("../components/App.tsx", import.meta.url), "utf8");
const att = readFileSync(new URL("../components/Attention.tsx", import.meta.url), "utf8");
const ui = readFileSync(new URL("../components/ui.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/notion.css", import.meta.url), "utf8");
ok("Hand it in has an undo (task id)", /type: "task\.submit"[^;]*, msg, id\)/.test(app) && /`Handed in\. \$\{savedLine\(\)\}`, t\.id\)/.test(app));
ok("Finished it has an undo action", /type: "pick\.done"[^)]*\)[^;]*\{ type: "pick\.set", id: p\.id, status: "new" \}/.test(app));
ok("the toast keeps an Undo for 8 seconds", /toast\.undo \|\| carries \? 8000/.test(app));
ok("banner Dismiss shows an Undo", /Dismissed for today\./.test(att) && /setUndo\(true\)/.test(att));
ok("the sheet scrolls to the top when it opens or swaps", /scrollTop = 0/.test(ui) && /\[title\]/.test(ui));
ok("Moments is deleted: no code and no .moment CSS", !/function Moments\b/.test(app) && !/\.moment[-\s{.:]/.test(css.replace(/\.help-moment/g, "")));
ok("no 'Copy task id' in the page header", !/Copy task id<|"Copy task id"/.test(app.replace(/aria-label=\{`Copy task id/g, "")));
ok("no hand-written rupee division in the UI", !/\/ 100000\)\.toFixed/.test(app));

// 7. AF4: the skill sheet's rationale never carries its own ownership claim, "waiting" is never alone in the UI, toasts and clips.
ok("skill sheet note is generated from ratingState, never raw r.note", /function skillNote\(/.test(app) && !/withArrows\(r\.note\)/.test(app));
{
  // The stored notes (free text) run through the same filter the sheet uses; the sheet subtitle comes from ratingState alone.
  const m = /filter\(\(x\) => x && !\/([^\n]+)\/i\.test\(x\)\)/.exec(app);
  const filt = m ? new RegExp(m[1], "i") : null;
  let skills = {};
  try { skills = JSON.parse(readFileSync(new URL("../data/skills.json", import.meta.url), "utf8")).ratings ?? {}; } catch {}
  const bad = Object.entries(skills).filter(([, r]) => {
    const kept = String(r.note ?? "").split(/(?<=[.!?])\s+/).filter((x) => x && !(filt && filt.test(x))).join(" ");
    const sheet = `${ratingState(r).label}. ${kept}`;
    return /confirmed by you/i.test(sheet) && /held as an estimate/i.test(sheet);
  }).map(([k]) => k);
  ok("no skill sheet says both 'Confirmed by you' and 'held as an estimate'", !!filt && bad.length === 0, bad.join(","));
}
const uiFiles = ["../components/App.tsx", "../components/Companion.tsx", "../components/Attention.tsx", "../components/HelpButton.tsx", "../lib/attention.mjs", "../lib/claude-status.mjs", "../lib/commands.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8"));
const strings = uiFiles.join("\n").split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l));
const bare = strings.filter((l) => /(["'`>])[^"'`<]*\b[Ww]aiting\b(?! (for a reader|on (other people|their|them)))(?![^"'`<]* for Claude)/.test(l) && !/waiting_days|waitingPhrase|waiting:|\bwaiting\b\s*[=.)>]|const waiting|\.waiting|"waiting"|kind: "waiting"|id: "waiting"/.test(l));
ok("the word 'waiting' alone is not in UI strings", bare.length === 0, bare.slice(0, 2).map((l) => l.trim().slice(0, 90)).join(" | "));
ok("non-undo toasts last 5 seconds, instruction toasts 8", /toast\.undo \|\| carries \? 8000 : 5000/.test(app));
ok("a clipWords helper cuts at a word and the Open label uses it", /const clipWords/.test(app) && /Open: \$\{clipWords\(nextQuest\.task/.test(app));
ok("brand reads Growth under 380px", /brand-short/.test(app) && /max-width: 379px\) \{ \.brand-long/.test(css));
ok("the H1 is one string on server and client (CSS toggles the short one)", /h1-long/.test(app) && /h1-short/.test(css) && !/phone && short \? short/.test(app));
ok("a read brief starts in Hand it in on any session", /if \(read \|\| \(gate && seenNow\)\)/.test(app));
ok("key hints show from 768px", /min-width: 768px\) \{\s*\n\s*\.key-hint/.test(css));
ok("af7: action labels wrap (no nowrap override after the af7 block)", (() => { const t = css.split("/* @@af7")[1] ?? ""; return /\.att-act-row \.btn[^{]*\{[^}]*white-space: normal/.test(t) && !/\.att-act-row[^{]*\{[^}]*white-space: nowrap/.test(t); })());
ok("af7: the Commands nav name is 'Commands' and the two nav landmarks differ", /aria-label="Commands" aria-describedby/.test(app) && /aria-label="Main, bottom"/.test(app));
ok("the Save to journal toast carries an Undo", /type: "log\.undo"/.test(app));
ok("the intro makes the nav inert", /inert=\{intro \|\| undefined\}/.test(app));

// af5: one name per page, second person, one command treatment.
const pageSrc = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const visible = uiFiles.join("\n").split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l) && !/^\s*\/\*/.test(l));
ok("one name per page: nav, H1, tab title and server title agree", /skill: "You", reach: "Hiring"/.test(app) && /skill: "You", reach: "Hiring"/.test(pageSrc) && /label: "You"/.test(app) && /label: "Hiring"/.test(app) && /title="You"/.test(app) && /title="Hiring"/.test(app));
ok("friendly address aliases ?v=hiring, ?v=you, ?v=commands map to the same views", /hiring: "reach"/.test(pageSrc) && /you: "skill"/.test(pageSrc) && /commands: "companion"/.test(pageSrc));
const oldNames = visible.filter((l) => /["'`>][^"'`<]*(Getting hired|Who you are)[^"'`<]*["'`<]/.test(l) && !/^\s*\{? *v:/.test(l));
ok("no 'Getting hired' or 'Who you are' in UI strings", oldNames.length === 0, oldNames.slice(0, 2).map((l) => l.trim().slice(0, 90)).join(" | "));
const comp = visible.filter((l) => /["'`>][^"'`<{]*\b[Cc]ompanion\b[^"'`<]*["'`<]/.test(l) && !/growth\.companion|"companion"|api\/companion|\?v=companion|growth-companion|companion:|openCompanion|CompanionView|COMP_|FOLDER|personal\\companion|\.\/Companion|"@\/components\/Companion"/.test(l));
ok("no 'companion' in strings the person reads", comp.length === 0, comp.slice(0, 2).map((l) => l.trim().slice(0, 90)).join(" | "));
ok("visible rationale is run through secondPerson (no 'the user')", /secondPerson\(r\.note/.test(app) && !/the user/i.test(secondPersonSample()));
function secondPersonSample() { return secondPerson("Frames the user's questions so they can answer. The user asks."); }
ok("one label per action: no lbl-short twin labels", !/lbl-short/.test(app));
ok("Tonight is not both the eyebrow and the H1", !/eyebrow="Tonight"/.test(app));
ok("the Commands list is 'You can also say', not 'Then say'", /You can also say/.test(readFileSync(new URL("../components/Companion.tsx", import.meta.url), "utf8")));
ok("sidebar count pill is sized to its number", /\.attn-side > \.attn-count \{ flex: none; width: auto/.test(css));
ok("header actions are at least 44px at 375x416", /\.mact button \{ min-width: 44px; width: 44px/.test(css));

// AF6: the brief is never hidden at short heights; one name for the date sheet; one verb per kind; no jargon in sheets.
{
  const shortBlocks = [...css.matchAll(/@media \(max-height: 480px\) \{([^@]*?)\n\}/g)].map((m) => m[1]).join("\n");
  ok("at max-height 480 the brief link is rendered under the title (display set, not none)", /\.att-1 \.brief-link \{ display: inline-flex/.test(shortBlocks));
  ok("at max-height 480 the brief ghost stays in the bar and is 44px", /\.att-1 \.att-act-row > \.btn\.brief-ghost \{ display: inline-flex; min-height: 44px/.test(shortBlocks));
  ok("only phones under 360px drop the ghost (the link stays)", /max-height: 480px\) and \(max-width: 359px\) \{\s*\n\s*\.att-1 \.att-act-row > \.btn\.brief-ghost \{ display: none/.test(css));
  ok("the hero renders 'Open the brief' as a link and a ghost", /className="brief-link"[\s\S]{0,220}?>Open the brief</.test(app) && /openIt\("btn brief-ghost"\)/.test(app));
  ok("'Steps and details' is a link under the title at short heights", /className="brief-link"[\s\S]{0,220}?>Steps and details</.test(app));
  ok("the date sheet has one name: link, title and fold", (app.match(/How this date is worked out/g) ?? []).length >= 3 && !/How is this worked out/.test(app));
  ok("sheet subtitles wrap to three lines, two at short heights, never one", /\.sheet-head p \{[^}]*-webkit-line-clamp: 3/.test(css) && /\.sheet-head p \{ -webkit-line-clamp: 2/.test(css));
  ok("the date sheet says the sum in plain words and keeps the rule of thumb", /A rule of thumb, not a measurement\./.test(app) && /evenings a week that is/.test(app) && !/\{b\.rule\}/.test(app));
  ok("no 'slot' or 'gaps' in the date sheet", (() => { const m = /function HowDated[\s\S]*?\n\}\n/.exec(app); return !!m && !/\bslots?\b|\bgaps\b/i.test(m[0].replace(/b\.gaps|const gaps|gaps\.find|\.gaps\b|gaps =/g, "")); })());
  ok("library verbs: Read, Watch, Listen, Open; never Look or 'See the book'", /visual: \{[^}]*verb: "Open"/.test(app) && /book: \{[^}]*verb: "Open"/.test(app) && !/verb: "Look"|verb: "See the book"/.test(app));
  ok("external picks carry the icon and 'opens a new tab'", (app.match(/opens a new tab/g) ?? []).length >= 2 && /read the free part of/i.test(app));
  ok("the three scores carry the one-line scale", /under 40 is early, 40 to \{TARGET - 1\} taking shape/.test(app));
  ok("active tab keeps the inactive weight and width", /\.mtab\[aria-current="page"\] \{ color: var\(--ink\); font-weight: 500/.test(css));
  ok("the sidebar has one Commands row with the count as a pill", /className="side-row"/.test(app) && !/<span>\{needs === 1 \? "thing needs" : "things need"\} you<\/span><\/button>\}/.test(app));
  ok("Needs-you popover aligns head, sum and rows at one edge", /\.attn-pop \{ padding-inline: 3px; \}/.test(css));
  ok("/dev/skeleton uses today, hiring, you and keeps the old ?p= names", /"hiring", "you"/.test(readFileSync(new URL("../app/dev/skeleton/Fixtures.tsx", import.meta.url), "utf8")) && /reach: "hiring", skill: "you"/.test(readFileSync(new URL("../app/dev/skeleton/Fixtures.tsx", import.meta.url), "utf8")));
  ok("empty week says 'Nothing planned this week.'", /Nothing planned this week\./.test(app));
  ok("intro: one paragraph on step one, 15px", !/<p>You hand in what you make\./.test(app) && /\.intro-body \{ gap: 8px; font-size: var\(--fs-ui\)/.test(css));
  ok("intake stepper has Back, Skip for now and Next at the top", /className="iq-nav"[\s\S]{0,400}Skip for now[\s\S]{0,300}>Next</.test(app));
  ok("You page folds evidence, the next level and 'in your own words' into 'More about you'", /<b>More about you<\/b>/.test(app) && /id="you-more"/.test(app));
  // The T1 is a tinted container: no side rule anywhere, a tint token with a dark override.
  const sideRules = css.split("\n").filter((l) => /border-left\s*:\s*(var\(--att-rule-w\)|[3-9]px|[1-9]\d+px)\s+solid/.test(l) || /--att-1-rule|--att-rule-w|--att-1q-rule/.test(l));
  ok("no accent side rule in the CSS (border-left >= 3px solid, --att-rule-w)", sideRules.length === 0, sideRules[0]?.trim().slice(0, 80));
  ok("T1 is a tinted container: --att-1-tint, 16px radius, no border, background not transparent", /--att-1-tint: color-mix\(in srgb, var\(--primary\)/.test(css) && /\.att-1 \{[^}]*padding: 23px; border: 1px solid var\(--att-1-border\); border-radius: 16px;[^}]*background: var\(--att-1-bg\)/.test(css) && /--att-1-bg: var\(--att-1-tint\)/.test(css));
  const pctOf = (re) => { const m = css.match(re); return m ? parseFloat(m[1]) : NaN; };
  const lightPct = pctOf(/--att-1-tint-pct: ([\d.]+)%/);
  const darkPct = pctOf(/\[data-theme="dark"\] \{ --att-1-tint-pct: ([\d.]+)%/);
  ok("T1 tint token is at most 1.5% in light and 3% in dark", lightPct <= 1.5 && darkPct <= 3, `${lightPct}/${darkPct}`);
  ok("T1 has a 1px subtle border: 9% ink in light, 14% in dark, never a side rule over 1px", /--att-1-border: color-mix\(in srgb, var\(--ink\) 9%, transparent\)/.test(css) && /--att-1-border: color-mix\(in srgb, var\(--ink\) 14%, transparent\)/.test(css) && !/\.att-1[^{]*\{[^}]*border-left:\s*[2-9]px/.test(css));
  const heroLines = (app + "\n" + readFileSync(new URL("../components/Companion.tsx", import.meta.url), "utf8")).split("\n").filter((l) => /<Hero\b[^>]*\beyebrow=/.test(l));
  const bareHeroes = heroLines.filter((l) => !/\bicon=/.test(l));
  ok("every T1 hero with an eyebrow names its kind with an icon (one-line heroes)", heroLines.length > 0 && bareHeroes.length === 0, bareHeroes[0]?.trim().slice(0, 80));
  ok("Hero renders its eyebrow icon aria-hidden", /att-eyebrow-ic" aria-hidden="true"/.test(readFileSync(new URL("../components/ui.tsx", import.meta.url), "utf8")));
  const compFiles = ["App.tsx", "Companion.tsx", "LibraryCard.tsx", "ui.tsx", "icons.tsx"].map((f) => readFileSync(new URL(`../components/${f}`, import.meta.url), "utf8")).join("\n");
  ok("no external image or favicon fetch was added (no <img src=\"http, no favicon service)", !/<img[^>]*src=\{?["`']https?:/.test(compFiles) && !/favicon|google\.com\/s2|icon\.horse|clearbit/i.test(compFiles.replace(/\/\/ .*$/gm, "")));
  ok("a layered shadow token stays; quiet T1 is a neutral 2% ink", /--att-1-shadow: 0 1px 2px/.test(css) && /\.att-1 \{ box-shadow: var\(--att-1-shadow\)/.test(css) && /--att-1q-tint: color-mix\(in srgb, var\(--ink\) 2%/.test(css));
  const compSrc = readFileSync(new URL("../components/Companion.tsx", import.meta.url), "utf8");
  ok("All commands fold focuses its find field and shows a count", /findRef\.current\?\.focus/.test(compSrc) && /comp-find-count/.test(compSrc));
}

// 9. Gap map: default view is three bars and plain words; Tonight says nothing about phones (desktop only).
{
  const gm = readFileSync(new URL("../components/GapMap.tsx", import.meta.url), "utf8");
  ok("GapMap default shows at most 3 bars, the rest sit in a 'Smaller gaps' fold", /\.slice\(0, 3\)/.test(gm) && /Smaller gaps \(\{rest\.length\}\)/.test(gm));
  ok("GapMap keeps distance, transfer and shared-base maths inside folds", /How this is worked out/.test(gm) && /Show the numbers/.test(gm));
  const appSrc = readFileSync(new URL("../components/App.tsx", import.meta.url), "utf8");
  ok("no 'Phone is fine' or 'for your phone' copy is rendered", !/Phone is fine|for your phone|Open on your phone|Your phone</.test(appSrc));
  const strip = (h) => { let x = h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, ""); let prev; do { prev = x; x = x.replace(/<details\b[^>]*>(?:(?!<details\b)[\s\S])*?<\/details>/g, ""); } while (x !== prev); return x; };
  const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ");
  const get = async (p) => { try { const r = await fetch(`http://localhost:4321${p}`, { signal: AbortSignal.timeout(15000) }); return r.ok ? await r.text() : null; } catch { return null; } };
  const page = await get("/dev/gapmap-states");
  if (!page) console.log("SKIP live checks: dev server not reachable on :4321");
  else {
    const sections = page.split(/<section[^>]*aria-labelledby="gm-h"/).slice(1).map((x) => x.split("</section>")[0]);
    ok("live: the gap map renders", sections.length > 0, `(${sections.length} states)`);
    for (const [i, sec] of sections.entries()) {
      const vis = strip(sec);
      const bars = (vis.match(/class="att-3 gm-row"/g) || []).length;
      const t = text(vis);
      ok(`live: state ${i + 1} default has at most 3 bars`, bars <= 3, `(${bars})`);
      ok(`live: state ${i + 1} default text has no 'distance', 'carries over at', 'counts here'`, !/distance|carries over at|counts here/i.test(t));
    }
    const tonightHtml = await get("/");
    if (tonightHtml) ok("live: Tonight's visible text has no 'phone' word", !/\bphone\b/i.test(text(strip(tonightHtml))));
  }
}

console.log(fail ? `${fail} FAIL` : "0 FAIL");
process.exit(fail ? 1 : 0);
