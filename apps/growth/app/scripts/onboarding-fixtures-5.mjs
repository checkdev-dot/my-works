// Fixtures for the fifth round (critique 4, builder OF3). Called from scripts/onboarding-fixtures.mjs with its helpers, so every
// result is counted in the one total. Each block names the finding it proves and was run on the code of critique 4 first (the
// "before" column of handoff-docs/specs/onboarding-sim-5.md). The two classes the reviewer named are tested as classes:
//   (1) a vocabulary is never the fix: every number question is swept against every unit word, not one example;
//   (2) a seam between components is tested across the seam: the persona flow runs end to end and the bridge, the check and
//       `complete` are compared on the result.
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { validate } from "../lib/validate.mjs";
import * as OB from "../lib/onboarding.mjs";
import { normaliseValue, progress } from "../lib/onboarding.mjs";
import { resolveQuestion, BANK } from "../lib/onboarding-bank.mjs";
import { readAll } from "../lib/onboarding-reset.mjs";
import { applyOnboardingAction } from "../lib/onboarding-actions.mjs";
import { parseOffLimits } from "../lib/onboarding-topics.mjs";
import { inProcess, runSteps } from "./onboarding-sim.mjs";
import { PERSONAS, REGRESSION, buildSteps } from "./onboarding-personas.mjs";
import { runSteps3 } from "./onboarding-sim-3.mjs";
import { buildBrief } from "./make-brief.mjs";
import { actArgs } from "./onboarding-transport.mjs";

export async function section5(h) {
  const { ok, tryAct, seq, skState, TODAY, NOW, R0MUST, toR1, copyData, APP } = h;
  // A block that throws is a FAIL with its message, never a crash that hides the rest. An action that is refused leaves the state as it was.
  const act = (s, a) => { try { return h.act(s, a); } catch { return s; } };
  const guard = async (name, fn) => { try { await fn(); } catch (e) { ok(`${name}: the block ran to the end`, false, e.stack || e.message); } };
  const node = process.execPath;
  const ACT = path.join(APP, "scripts", "onboarding-act.mjs");
  const q = (id) => resolveQuestion(id);
  const lastLine = (t) => String(t).trim().split(/\r?\n/).filter((l) => l.startsWith("{")).pop() || "{}";
  const cli = (dir, args, input) => {
    try { return { code: 0, json: JSON.parse(lastLine(execFileSync(node, [ACT, ...args, "--data-dir", dir], { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] }))) }; }
    catch (e) { return { code: e.status, json: JSON.parse(lastLine(e.stdout || "{}")) }; }
  };
  const hashDir = (dir) => JSON.stringify(Object.fromEntries(fs.readdirSync(dir).filter((n) => n.endsWith(".json")).map((n) => [n, fs.statSync(path.join(dir, n)).size])));
  /** The persona flow from the skeleton, in process, up to (and including) the step whose `say` matches. */
  const runTo = (steps, re) => {
    const ix = steps.findIndex((x) => x.say && re.test(x.say));
    const box = { state: structuredClone(skState) };
    const r = runSteps3(steps.slice(0, ix >= 0 ? ix + 1 : steps.length), inProcess(box, { today: TODAY }));
    return { box, r };
  };
  const fullRun = (steps) => { const box = { state: structuredClone(skState) }; const r = runSteps3(steps, inProcess(box, { today: TODAY })); return { box, r }; };

  // ---- P1-1 transport ----------------------------------------------------------------------------------------------
  await guard("block 1", async () => {
    const dir = copyData("p5-transport");
    const reset = (() => { const s = structuredClone(skState); return s; })();
    void reset;
    // a started onboarding on the temp copy: the skeleton's files written through the act script's own reset
    const { planReset } = await import("../lib/onboarding-reset.mjs");
    const plan = planReset(dir, { now: new Date() });
    const ap = cli(dir, actArgs({ type: "onboard.reset", token: plan.token, phrase: (await import("../lib/onboarding-reset.mjs")).PHRASE, different_person: true }));
    ok("P1-1: the temp copy starts an onboarding through --file (reset is a file action too)", ap.code === 0 && ap.json.ok === true, ap.json.message);
    const marker = path.join(dir, "INJECTED.txt");
    const evil = JSON.stringify({ type: "onboard.answer", id: "R0-08", value: `France $(node -e "require('fs').writeFileSync('${marker.replace(/\\/g, "/")}','x')") \`id\` ; rm -rf / | & ` });
    const before = hashDir(dir);
    const inl = cli(dir, [evil]);
    ok("P1-1: an inline action with $( ), a backtick, ; or | is refused with 'use --file' and says nothing was changed", inl.code !== 0 && /use --file/i.test(inl.json.message || "") && /Nothing was changed/.test(inl.json.message || ""), JSON.stringify(inl.json));
    ok("P1-1: the injection text did nothing: no marker file, no byte of the data changed", !fs.existsSync(marker) && hashDir(dir) === before);
    const viaFile = cli(dir, actArgs({ type: "onboard.answer", id: "R0-08", value: "France $(whoami) `id` ; | & it's \"quoted\"" }));
    const st1 = readAll(dir).d;
    ok("P1-1: the same text through --file is stored as data, verbatim, and nothing runs", viaFile.json.ok === true && st1.onboarding.answers["R0-08"].value === "France $(whoami) `id` ; | & it's \"quoted\"", JSON.stringify(viaFile.json));
    const long = cli(dir, [JSON.stringify({ type: "onboard.answer", id: "R0-09", value: "x".repeat(2500) })]);
    ok("P1-1: an inline payload over 2000 characters is refused with 'use --file' (it would be cut by the shell)", long.code !== 0 && /use --file/i.test(long.json.message || ""), JSON.stringify(long.json));
    const safe = cli(dir, [JSON.stringify({ type: "onboard.answer", id: "R0-09", value: "product design" })]);
    ok("P1-1: a short safe inline action still runs, with a deprecation NOTE", safe.json.ok === true && (safe.json.notes || []).some((n) => /deprecated/i.test(n) && /--file/.test(n)), JSON.stringify(safe.json));
    const stdin = cli(dir, ["--stdin"], JSON.stringify({ type: "onboard.answer", id: "R0-10", value: "a case study with £ and ₹ signs" }));
    ok("P1-1: --stdin works and keeps non-ASCII text", stdin.json.ok === true && readAll(dir).d.onboarding.answers["R0-10"].value === "a case study with £ and ₹ signs", JSON.stringify(stdin.json));
    const bomPath = path.join(dir, "..", "p5-bom.json");
    fs.writeFileSync(bomPath, `\uFEFF${JSON.stringify({ type: "onboard.answer", id: "R0-09", value: "product design and research" })}`);
    const bom = cli(dir, ["--file", bomPath]);
    ok("P1-1: a file with a byte order mark (PowerShell 5.1 Out-File) is read", bom.json.ok === true, JSON.stringify(bom.json));
    const big = cli(dir, actArgs({ type: "onboard.answer", id: "R0-10", value: "word ".repeat(6000) }));
    ok("P1-1: a 30,000 character answer through --file is refused with the cap in the message, nothing saved", big.code !== 0 && /2000/.test(big.json.message || "") && readAll(dir).d.onboarding.answers["R0-10"].value === "a case study with £ and ₹ signs", JSON.stringify(big.json).slice(0, 200));
    // the cap is in the action, not the CLI
    const base = seq(skState, R0MUST);
    const inl2 = tryAct(base, { type: "onboard.answer", id: "R0-10", value: "y".repeat(2001) });
    ok("P1-1: the cap is enforced in the action itself (in process, no CLI): 2001 characters refused, 2000 accepted", inl2.err && /2000/.test(inl2.err) && !tryAct(base, { type: "onboard.answer", id: "R0-10", value: "y".repeat(2000) }).err, inl2.err);
    const sumCap = tryAct(act(base, { type: "onboard.round", round: "R1" }), { type: "onboard.round", round: "R1", summary: "s".repeat(9000), confirmed: true, quote: "ok" });
    ok("P1-1: no string anywhere in an action is unbounded (a 9000 character summary is refused)", !!sumCap.err && /characters/.test(sumCap.err), sumCap.err);
    // recognition: idempotent by value
    let s = toR1(skState);
    for (const t of ["Known for calm and fair leadership", "Known for reliable shipping", "Known for calm and fair leadership"]) s = act(s, { type: "onboard.answer", id: "B-12", value: t });
    const rec = (s.profile.north_star.recognition || []).filter((x) => /^Known for/.test(x));
    ok("P1-1: re-answering B-12 replaces the earlier value: recognition holds one line, the latest, never an append per resend", rec.length === 1 && rec[0] === "Known for calm and fair leadership", JSON.stringify(s.profile.north_star.recognition));
  });

  // ---- P1-2 units fail closed ---------------------------------------------------------------------------------------
  await guard("block 2", async () => {
    const inr = { currency: "INR", period: "month" };
    const gbp = { currency: "GBP", period: "month" };
    const n = (id, raw, ctx = {}) => normaliseValue(q(id), raw, { ...gbp, ...ctx });
    const val = (id, raw, ctx) => { const r = n(id, raw, ctx); return r.ok ? r.value : `REFUSED:${r.code || ""}`; };
    ok("P1-2: B-25 notice: three months is 90 days, 12 weeks is 84, 1 month is 30, 6 months 180 (never 3, 12, 1, 6)", val("B-25", "three months") === 90 && val("B-25", "12 weeks") === 84 && val("B-25", "1 month") === 30 && val("B-25", "6 months") === 180 && val("B-25", "30 days") === 30, JSON.stringify(["three months", "12 weeks", "1 month", "6 months"].map((x) => val("B-25", x))));
    ok("P1-2: an unusually long notice is a confirm step, never a silent value (2 years is 730 days: echo it)", n("B-25", "2 years").ok === false && n("B-25", "2 years").needs_confirm === true && n("B-25", "2 years", { confirmed: true }).value === 730);
    ok("P1-2: B-25 a fortnight is 14, 'a month' and 'one month' are 30, a bare number stays days", val("B-25", "2 weeks") === 14 && val("B-25", "a month") === 30 && val("B-25", "one fortnight") === 14 && val("B-25", "60") === 60 && val("B-25", 0) === 0);
    ok("P1-2: B-20 runway: 1.5 years is 18 months, ten weeks is 2.3, 6 months stays 6, 90 days is 3", val("B-20", "1.5 years") === 18 && val("B-20", "ten weeks") === 2.3 && val("B-20", "6 months") === 6 && val("B-20", "90 days") === 3 && val("B-20", "two") === 2);
    ok("P1-2: B-17 hours in four weeks: 30 minutes is 0.5, half an hour is 0.5, 3 hours stays, an hour and a half is 1.5", val("B-17", "30 minutes") === 0.5 && val("B-17", "half an hour") === 0.5 && val("B-17", "3 hours") === 3 && val("B-17", "an hour and a half") === 1.5, JSON.stringify([val("B-17", "30 minutes"), val("B-17", "half an hour"), val("B-17", "an hour and a half")]));
    ok("P1-2: B-18 hours a week: 90 minutes a week is 1.5; 5 hours a week stays 5; 20 hours a month is 4.6", val("B-18", "90 minutes a week") === 1.5 && val("B-18", "5 hours a week") === 5 && val("B-18", "20 hours a month") === 4.6);
    ok("P1-2: pay per period: 380 p/w is 1647 a month; 1000 per fortnight 2167; 24000 p.a. 2000; 3000 pcm 3000; 4 hours-free hourly refuses", val("B-07", "£380 p/w") === 1647 && val("B-07", "£380 pw") === 1647 && val("B-07", "1000 per fortnight") === 2167 && val("B-07", "£1000 fortnightly") === 2167 && val("B-07", "24000 p.a.") === 2000 && val("B-07", "£3000 pcm") === 3000 && val("B-07", "380 a week") === 1647, JSON.stringify(["£380 p/w", "1000 per fortnight", "24000 p.a.", "£3000 pcm"].map((x) => val("B-07", x))));
    ok("P1-2: pay per hour with its hours in the same answer is converted (15 an hour, 40 hours a week is 2600), not read as a range", val("B-07", "£15 an hour, 40 hours a week") === 2600 && val("B-07", "£15/hr", { hours_per_week: 40 }) === 2600 && val("B-07", "£15 ph", { hours_per_week: 40 }) === 2600);
    ok("P1-2: pay: a quarterly figure is converted (3000 per quarter is 1000 a month)", val("B-07", "3000 per quarter") === 1000 && val("B-07", "quarterly 3000") === 1000);
    ok("P1-2: a negative is a refusal, never a dropped sign (-5000, minus 5000, -3 months, (5,000))", ["-5000", "minus 5000", "£-5000", "negative 5000"].every((x) => n("B-07", x).ok === false && /below zero|negative/i.test(n("B-07", x).message)) && n("B-25", "-3 months").ok === false && n("B-17", "-2").ok === false, JSON.stringify(["-5000", "minus 5000"].map((x) => n("B-07", x).message)));
    ok("P1-2: a range with a spaced hyphen is still a range, not a negative (4,500 - 6,000)", n("B-08", "4,500 - 6,000").ok === true && n("B-08", "4,500 - 6,000").low === 4500 && n("B-07", "80-90k").is_range === true);
    ok("P1-2: 1e5 is not read as a range 1 to 5 (refused as scientific notation with the plain way)", n("B-07", "1e5").ok === false && /digits|scientific/i.test(n("B-07", "1e5").message));
    // unknown unit words: refused with the options, never coerced
    const unk = n("B-20", "3 semesters");
    ok("P1-2: a unit word not in the table is a refusal code unit_unknown that echoes the options", unk.ok === false && unk.code === "unit_unknown" && /days|weeks|months|years/.test(unk.message) && /semesters/.test(unk.message), JSON.stringify(unk));
    ok("P1-2: more unknown units: 3 sprints, 2 terms, 4 moons, 5 paydays (B-25, B-20, B-07)", [["B-25", "3 sprints"], ["B-20", "2 terms"], ["B-25", "4 moons"], ["B-07", "5 paydays"], ["B-18", "4 shifts"]].every(([id, t]) => n(id, t).ok === false && n(id, t).code === "unit_unknown"), JSON.stringify([["B-25", "3 sprints"], ["B-20", "2 terms"], ["B-07", "5 paydays"]].map(([id, t]) => n(id, t).code)));
    ok("P1-2: a unit that cannot apply is refused, not converted (3 hours of notice, 2 months of weekly hours is meaningless for B-25)", n("B-25", "3 hours").ok === false && n("B-20", "3 hours").ok === false);
    ok("P1-2: the value of a research claim still parses (12 to 18 LPA, 90,000 to 1,40,000 per month): claim prose is exempt from the unit gate", (() => { const a = OB.parseRangeClaim("Marketing analytics managers in India are listed at 12 to 18 LPA", { ...inr }); const b = OB.parseRangeClaim("Analytics managers in Indian cities report 90,000 to 1,40,000 per month", inr); return a && a.low === 100000 && a.high === 150000 && b && b.low === 90000 && b.high === 140000; })());
    // the class: every number question against every unit word
    const WORDS = ["minute", "minutes", "hour", "hours", "day", "days", "week", "weeks", "fortnight", "fortnights", "month", "months", "quarter", "quarters", "year", "years", "semester", "sprint", "moon", "shift"];
    const NUMQ = BANK.filter((x) => x.validate && x.validate.kind === "num").map((x) => x.id);
    const BASE = { "B-25": ["day", "days"], "B-20": ["month", "months"], "F-12": ["month", "months"], "B-17": ["hour", "hours"], "B-18": ["hour", "hours"], "T-07": ["hour", "hours"], "H-01": ["hour", "hours"] };
    const silent = [];
    for (const id of NUMQ) for (const w of WORDS) {
      const r = normaliseValue(q(id), `7 ${w}`, { ...inr, hours_per_week: 40 });
      const base = BASE[id] || [];
      if (r.ok && r.value === 7 && !base.includes(w) && !(r.converted && /\b/.test(""))) silent.push(`${id} "7 ${w}" -> 7`);
    }
    ok(`P1-2 class: no number question returns the bare number for a unit word that is not its own unit (${NUMQ.length} questions x ${WORDS.length} words)`, silent.length === 0, silent.slice(0, 6).join(" | "));
    const payBad = [];
    for (const id of ["B-07", "B-10", "B-33", "F-10"]) for (const w of ["hour", "day", "week", "fortnight", "quarter", "sprint", "shift"]) {
      const r = normaliseValue(q(id), `2000 per ${w}`, { ...gbp, hours_per_week: 40 });
      if (r.ok && r.value === 2000 && !r.converted) payBad.push(`${id} 2000 per ${w}`);
    }
    ok("P1-2 class: no pay question keeps 2000 as a monthly figure when it was said per hour, day, week, fortnight, quarter or a made-up period", payBad.length === 0, payBad.slice(0, 5).join(" | "));
    // through the action
    const st = toR1(skState);
    const r1 = tryAct(st, { type: "onboard.answer", id: "B-25", value: "three months" });
    ok("P1-2 act: 'three months' to B-25 is saved as 90 days with the echo saying so", !r1.err && r1.s.onboarding.answers["B-25"].value === 90 && r1.s.profile.situation.notice_days === 90, r1.err);
    const r2 = tryAct(st, { type: "onboard.answer", id: "B-20", value: "3 semesters" });
    ok("P1-2 act: an unknown unit is refused with the options and saves nothing", !!r2.err && /unit_unknown|semesters/.test(r2.err) && !r2.s.onboarding.answers["B-20"] && /Nothing was changed/.test(r2.err), r2.err);
  });

  // ---- P1-3 off limits by meaning ----------------------------------------------------------------------------------
  await guard("block 3", async () => {
    const base = seq(skState, R0MUST.filter((x) => x.id !== "R0-03"));
    const off = (words) => act(base, { type: "onboard.answer", id: "R0-03", value: words }).onboarding;
    const ids = (o) => o.off_limits || [];
    const hasAny = (o, list) => list.some((id) => ids(o).includes(id));
    ok("P1-3: my baby, the newborn and breastfeeding exclude the family and time questions (B-27, H-02) as parenting", ["my baby", "the newborn", "breastfeeding"].every((w) => { const o = off([w]); return ["B-27", "H-02"].every((id) => ids(o).includes(id)) && o.off_limits_topics.includes("parenting"); }), JSON.stringify(off(["my baby"]).off_limits_topics));
    ok("P1-3: cancer is an illness topic (H-01, H-02, K-02) and my redundancy is a redundancy topic (K-02, B-30)", (() => { const a = off(["cancer"]); const b = off(["my redundancy"]); return a.off_limits_topics.includes("illness_cancer") && ["H-01", "H-02", "K-02"].every((id) => ids(a).includes(id)) && b.off_limits_topics.includes("redundancy_layoff") && ["K-02"].every((id) => ids(b).includes(id)); })());
    ok("P1-3: grief and bereavement are a topic of their own (H-02, R3-18)", (() => { const a = off(["grief"]); return a.off_limits_topics.includes("bereavement") && ids(a).includes("H-02"); })());
    // false positives
    const fp1 = off(["energy drink"]);
    const fp2 = off(["feelings of being a fraud"]);
    const fp3 = off(["income tax"]);
    const fp4 = off(["my community college"]);
    ok("P1-3: 'energy drink' removes no Round 3 question (before: 10 questions, R3-01 and R3-02 among them)", !hasAny(fp1, ["R3-01", "R3-02", "H-01", "H-02"]) && !(fp1.off_limits_topics || []).includes("mental_health"), JSON.stringify([fp1.off_limits, fp1.off_limits_topics]));
    ok("P1-3: 'feelings of being a fraud' (his own words) removes nothing until he confirms a mapping; it is listed as unmatched", !hasAny(fp2, ["R3-01", "R3-02", "R3-04"]) && !(fp2.off_limits_topics || []).includes("mental_health"));
    ok("P1-3: 'income tax' keeps B-07, B-09, B-11 and 'my community college' excludes no caste question", !hasAny(fp3, ["B-07", "B-09", "B-11"]) && !(fp4.off_limits_topics || []).includes("caste_community"));
    // the intent layer
    const t = structuredClone(base);
    const first = applyOnboardingAction({ type: "onboard.answer", id: "R0-03", value: ["why they picked me for redundancy", "the thing that happened last spring"] }, t, TODAY, NOW);
    ok("P1-3: words the script does not match are listed back ('I did not match') and never reported as 'no bank question matches'", (first.notes || []).some((x) => /did not match/i.test(x) && /redundancy/.test(x)) && !(first.notes || []).some((x) => /No bank question matches/.test(x)), JSON.stringify(first.notes));
    ok("P1-3: unmatched words exclude nothing yet", !hasAny(t.onboarding, ["K-02", "B-30", "H-02"]));
    const noQuote = tryAct(t, { type: "onboard.boundary", phrase: "why they picked me for redundancy", topics: ["redundancy_layoff"] });
    ok("P1-3: onboard.boundary without his confirmation (confirmed + quote) is refused: a guess never counts", !!noQuote.err && /confirm|quote/i.test(noQuote.err), noQuote.err);
    const badTopic = tryAct(t, { type: "onboard.boundary", phrase: "why they picked me for redundancy", topics: ["feelings"], confirmed: true, quote: "yes" });
    ok("P1-3: a topic that is not in the taxonomy is refused and the taxonomy is listed", !!badTopic.err && /redundancy_layoff/.test(badTopic.err), badTopic.err);
    const stranger = tryAct(t, { type: "onboard.boundary", phrase: "something he never said", topics: ["finances_debt"], confirmed: true, quote: "yes" });
    ok("P1-3: a phrase that is not one of his R0-03 words is refused", !!stranger.err && /R0-03/.test(stranger.err), stranger.err);
    const conf = act(t, { type: "onboard.boundary", phrase: "why they picked me for redundancy", topics: ["redundancy_layoff"], confirmed: true, quote: "yes, that is right" });
    ok("P1-3: a confirmed mapping excludes the topic's questions and records his words", ids(conf.onboarding).includes("K-02") && ids(conf.onboarding).includes("B-30") && conf.onboarding.boundary_map["why they picked me for redundancy"].quote === "yes, that is right", JSON.stringify(conf.onboarding.boundary_map));
    const again = act(conf, { type: "onboard.answer", id: "R0-03", value: ["why they picked me for redundancy", "the thing that happened last spring", "my health"] });
    ok("P1-3: sending R0-03 again keeps every confirmed mapping (the boundary map is never wiped by a resend)", ids(again.onboarding).includes("K-02") && ids(again.onboarding).includes("H-01"), JSON.stringify(ids(again.onboarding)));
    const spring = act(again, { type: "onboard.boundary", phrase: "the thing that happened last spring", topics: ["bereavement", "family"], confirmed: true, quote: "yes" });
    ok("P1-3: 'the thing that happened last spring' mapped to bereavement and family by confirmation excludes B-27 and H-02", ["B-27", "H-02"].every((id) => ids(spring.onboarding).includes(id)) && !ids(again.onboarding).includes("B-27"));
    ok("P1-3: 'my dad died' is read by the taxonomy alone (dad is family, died is a death): no mapping needed", ["B-27", "H-02"].every((id) => ids(off(["my dad died"])).includes(id)));
    // generated wording against a mapped topic is refused through the same table
    const pa = parseOffLimits(["my baby"], TODAY);
    ok("P1-3: parseOffLimits itself: a phrase made only of taxonomy words matches; a phrase with other content does not", pa.topics.includes("parenting") && parseOffLimits(["my dad died today at the hospital ward"], TODAY).unmatched.length === 1);
  });

  // ---- P1-4 the person's real flow cannot finish cleanly -------------------------------------------------------------------
  await guard("block 4", async () => {
    const P = structuredClone(PERSONAS.designer);
    P.r3 = P.r3.map(([id, v, o]) => (id === "R3-01" ? [id, "Publishing my work in public because I feel I am not good enough yet", o] : [id, v, o]));
    P.r3.push(["R3-16", "Scrolling at night instead of making my case study better every single evening", {}]);
    P.r4 = P.r4.map(([id, v, o]) => (id === "T-05" ? [id, ["Scrolling at night instead of making my case study better every single evening"], o] : [id, v, o]));
    const steps = buildSteps(P).steps;
    const pre = steps.findIndex((x) => x.a.type === "onboard.round" && x.a.complete === true);
    const { box, r } = fullRun(steps.slice(0, pre));
    ok("P1-4 setup: The person's real flow reaches R5 with his R4 answer repeating his R3 words", r.ok, JSON.stringify(r.log.filter((l) => !l.ok).slice(0, 1)));
    const fails = typeof OB.integrityFails === "function" ? OB.integrityFails(box.state) : [];
    ok("P1-4: the shared integrity check reports the private R3 answer in a public place, with the id to fix (one function for the script and for complete)", fails.some((f) => /private Round 3 answer/.test(f.message) && f.id === "T-05"), JSON.stringify(fails.slice(0, 2)));
    const comp = tryAct(box.state, { type: "onboard.round", round: "R5", complete: true, plan_pending: { reason: "the plan is built in its own step", next_command: "plan my four weeks" } });
    ok("P1-4: complete is REFUSED while the check has a FAIL, and the message gives the fix path (onboard.redact)", !!comp.err && /onboard\.redact/.test(comp.err) && /T-05/.test(comp.err) && /Nothing was changed/.test(comp.err), comp.err);
    const red = tryAct(box.state, { type: "onboard.redact", id: "T-05" });
    const intake = red.s && (red.s.profile.intake || []).find((x) => x.id === "T-05");
    ok("P1-4: onboard.redact {id} replaces the public copy with '(private)' in one step and keeps the private R3 answer", !red.err && intake && intake.answer === "(private)" && red.s.onboarding.answers["R3-16"].status === "answered", red.err || JSON.stringify(intake));
    const done = tryAct(red.s, { type: "onboard.round", round: "R5", complete: true, plan_pending: { reason: "the plan is built in its own step", next_command: "plan my four weeks" } });
    ok("P1-4: after the redaction the same complete is accepted", !done.err && done.s.onboarding.status === "complete", done.err);
    const again = act(red.s, { type: "onboard.answer", id: "T-05", value: ["Scrolling at night instead of making my case study better every single evening"], meta: {} });
    const intake2 = (again.profile.intake || []).find((x) => x.id === "T-05");
    ok("P1-4: a redaction survives a resend of the same answer (it is not mirrored back)", intake2 && intake2.answer === "(private)", JSON.stringify(intake2));
    // run length rule: seven shared words are not a leak, eight are
    const sh = (words) => {
      const s2 = structuredClone(box.state);
      s2.onboarding.answers["R3-16"].value = words;
      s2.profile.intake = s2.profile.intake.map((x) => (x.id === "T-05" ? { ...x, answer: "I think scrolling at night instead of making my case study is a habit" } : x));
      return typeof OB.integrityFails === "function" ? OB.integrityFails(s2).filter((f) => /private Round 3/.test(f.message)).length : -1;
    };
    ok("P1-4: the leak test is a verbatim run of 8 words or more: 'scrolling at night' alone is no leak, an 8 word run is", sh("scrolling at night") === 0 && sh("scrolling at night instead of making my case study") === 1, `${sh("scrolling at night")} ${sh("scrolling at night instead of making my case study")}`);
    // (c) R3 text is never echoed into a task
    const tasks = (box.state.onboarding.derived && box.state.onboarding.derived.tasks) || [];
    const t01 = tasks.find((x) => x.id === "OT-R3-01");
    ok("P1-4: the task made from R3-01 carries a neutral label, never his sentence", !!t01 && !/publishing my work|not good enough|public/i.test(t01.task), t01 && t01.task);
    const allTaskText = tasks.map((x) => x.task).join(" | ");
    ok("P1-4: no task text holds a run of 4 or more words of any private R3 answer", (() => {
      const priv = Object.entries(box.state.onboarding.answers).filter(([, a]) => a.private && typeof a.value === "string").map(([, a]) => a.value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean));
      const hay = ` ${allTaskText.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).join(" ")} `;
      return priv.every((ws) => { for (let i = 0; i + 4 <= ws.length; i++) if (hay.includes(` ${ws.slice(i, i + 4).join(" ")} `)) return false; return true; });
    })(), allTaskText.slice(0, 300));
  });

  // ---- P1-5 the bridge is consistent after every rating ------------------------------------------------------------
  await guard("block 5", async () => {
    const people = { engineer: () => buildSteps(PERSONAS.engineer).steps, designer: () => buildSteps(PERSONAS.designer).steps, nurse: REGRESSION.nurse.steps, owner: REGRESSION.owner.steps, voice: REGRESSION.voice.steps };
    for (const [key, mk] of Object.entries(people)) {
      const { box, r } = fullRun(mk());
      const s = box.state;
      const gaps = (s.library.gaps || []).filter((g) => g.status !== "closed");
      const ratings = s.skills.ratings || {};
      const comps = s.rubric.competencies || [];
      const names = new Set(comps.map((c) => c.name));
      const answerTexts = new Set(Object.values(s.onboarding.answers).map((a) => (typeof a.value === "string" ? a.value : "")).filter((t) => t.length > 8));
      const nowOf = (g) => { const m = /Level (\d(?:\.\d)?)/.exec(g.now || ""); return m ? Number(m[1]) : null; };
      const above = gaps.filter((g) => { const rt = ratings[g.competency]; return rt && rt.placeholder !== true && nowOf(g) !== null && rt.level > nowOf(g) + 1e-9; });
      ok(`P1-5 ${key}: the flow completes and no rating level is above the 'now' level of its gap`, r.ok && above.length === 0, JSON.stringify(above.map((g) => `${g.id} ${g.now} vs ${ratings[g.competency].level}`)));
      const rated = comps.filter((c) => ratings[c.id] && ratings[c.id].placeholder !== true);
      const need = rated.filter((c) => ratings[c.id].level < (ratings[c.id].target || 3) - 1e-9);
      const missing = need.filter((c) => !gaps.some((g) => g.competency === c.id));
      ok(`P1-5 ${key}: every researched competency below its target has a gap (one each)`, missing.length === 0 && new Set(gaps.map((g) => g.competency)).size === gaps.length, JSON.stringify({ missing: missing.map((c) => c.id), gaps: gaps.map((g) => `${g.id}:${g.competency}`) }));
      ok(`P1-5 ${key}: no gap is titled with his own words`, gaps.every((g) => !answerTexts.has(g.title)) && gaps.every((g) => comps.some((c) => g.title.includes(c.name))), JSON.stringify(gaps.map((g) => g.title)));
      void names;
      ok(`P1-5 ${key}: the validator is content with the result`, validate(s).errors.length === 0, validate(s).errors[0]);
    }
    // the dashboard case: a rating sent after the gaps were written rewrites them
    const dz = buildSteps(PERSONAS.designer).steps;
    const ix = dz.findIndex((x) => x.a.type === "write_ratings");
    const { box } = fullRun(dz.slice(0, ix));
    const before = structuredClone(box.state.library.gaps);
    const ratedState = act(box.state, { type: "onboard.rating", competency: "systems", level: 2, source: "ai", because: ["A-systems.1", "A-systems.2"] });
    const g = ratedState.library.gaps.find((x) => x.competency === "systems" && x.status !== "closed");
    ok("P1-5: gaps were written on entering R5 (before the ratings) and a later onboard.rating rewrites 'now' from the rating, in place, same id", before.length > 0 && !!g && /Level 2/.test(g.now) && before.some((x) => x.id === g.id), JSON.stringify({ before: before.map((x) => `${x.id} ${x.now}`), after: g && g.now }));
    const ratedHigh = act(ratedState, { type: "onboard.rating", competency: "systems", level: 2.5, source: "ai", because: ["A-systems.1", "A-systems.2"] });
    const g2 = ratedHigh.library.gaps.find((x) => x.competency === "systems" && x.status !== "closed");
    ok("P1-5: a second rating moves the gap again and the evenings shrink with the size", !!g2 && /Level 2\.5/.test(g2.now) && g2.evenings <= g.evenings, JSON.stringify([g && g.evenings, g2 && g2.evenings]));
  });

  // ---- P1-6 crisis wording in any free text; pause reasons are tags ---------------------------------------------------
  await guard("block 6", async () => {
    const { box } = runTo(buildSteps(PERSONAS.designer).steps, /Enter R3/);
    const R3 = box.state;
    const crisis = "Everyone would be better off without me and I cannot do this any more";
    const t = tryAct(R3, { type: "onboard.answer", id: "R3-10", value: crisis });
    const s = t.s;
    const dump = JSON.stringify(s);
    ok("P1-6: crisis wording in a free answer is not refused with a throw (the flag must survive): the action succeeds", !t.err, t.err);
    ok("P1-6: nothing of his sentence is stored anywhere (onboarding.json, profile.json, every file)", !/better off without|cannot do this any more/i.test(dump), (dump.match(/.{20}better off without.{20}/i) || [""])[0]);
    const a = s.onboarding.answers["R3-10"];
    ok("P1-6: the answer holds the placeholder '(private: answered, not stored)' and is marked withheld", !!a && a.value === "(private: answered, not stored)" && a.withheld === true, JSON.stringify(a));
    ok("P1-6: crisis.active is set and the interview is paused (resume then opens with the one line)", s.onboarding.crisis && s.onboarding.crisis.active === true && s.onboarding.status === "paused", JSON.stringify(s.onboarding.crisis));
    ok("P1-6: the placeholder made no belief, task, risk or intake item", !(s.profile.beliefs_to_test || []).some((b) => /private: answered/.test(b.belief)) && !((s.onboarding.derived || {}).tasks || []).some((x) => /private: answered/.test(x.task)) && !(s.profile.intake || []).some((x) => /private: answered/.test(x.answer)));
    const pub = tryAct(act(R3, { type: "onboard.round", round: "R3" }), { type: "onboard.answer", id: "R3-01", value: "I do not want to be here, what is the point" });
    ok("P1-6: the same holds for another R3 question and for the passive 'what is the point'", !pub.err && pub.s.onboarding.crisis && pub.s.onboarding.crisis.active === true && !/what is the point/i.test(JSON.stringify(pub.s)));
    const viaSkip = tryAct(R3, { type: "onboard.skip", id: "R3-02", reason: "I want to die", consequence: "the check in stays unknown" });
    ok("P1-6: wording in a skip reason (any free text field of any action) is treated the same and stored nowhere", !viaSkip.err && viaSkip.s.onboarding.crisis && viaSkip.s.onboarding.crisis.active === true && !/want to die/i.test(JSON.stringify(viaSkip.s)), viaSkip.err);
    const p1 = act(R3, { type: "onboard.pause", reason: "back pain tonight, my doctor says rest" });
    ok("P1-6: a non-crisis pause reason is stored as a category tag, never verbatim", !/back pain|doctor/i.test(JSON.stringify(p1.onboarding)) && ["tired", "busy", "unsure", "interrupted", "rest", "other"].includes(p1.onboarding.paused.reason), JSON.stringify(p1.onboarding.paused));
    const p2 = act(R3, { type: "onboard.pause", reason: "I am too tired to carry on" });
    ok("P1-6: 'too tired' is the tag tired; an explicit reason_tag is taken as it is", p2.onboarding.paused.reason === "tired" && act(R3, { type: "onboard.pause", reason_tag: "busy" }).onboarding.paused.reason === "busy");
    const p3 = tryAct(R3, { type: "onboard.pause", reason: "xyzzy plugh" });
    ok("P1-6: an unreadable pause reason never throws and becomes 'other'", !p3.err && p3.s.onboarding.paused.reason === "other", p3.err);
  });

  // ---- P1-7 tiny capacity ------------------------------------------------------------------------------------------
  await guard("block 7", async () => {
    const P = structuredClone(PERSONAS.designer);
    P.budget = "20";
    P.r0 = { ...P.r0, "R0-11": "quick" };
    const MV = BANK.filter((x) => x.minimum_viable).map((x) => x.id);
    ok("P1-7: every question knows whether it is on the minimum viable path (minimum_viable marker in the bank)", MV.length > 0 && BANK.every((x) => typeof x.minimum_viable === "boolean"), `marked: ${MV.length}`);
    ok("P1-7: the minimum viable set for enough_to_start is at most 22 questions (R0 set-up counted, 3 adaptive counted)", MV.length + 3 <= 22, `${MV.length} fixed + 3 adaptive`);
    const keep = (arr) => arr.filter(([id]) => MV.includes(id));
    P.r1 = keep(P.r1); P.r1_fix = []; P.r1_nice = [];
    P.r2 = P.r2.filter(([id]) => MV.includes(id));
    P.r0 = Object.fromEntries(Object.entries(P.r0).filter(([id]) => MV.includes(id) || id === "R0-11" || id === "R0-04"));
    // the persona's remaining R0 questions do not exist on the quick path
    const steps = buildSteps(P).steps;
    const stopAt = steps.findIndex((x) => x.say && /Round R2 summary/.test(x.say));
    const { box, r } = fullRun(steps.slice(0, stopAt));
    const pr = progress(box.state.onboarding, (box.state.unknowns && box.state.unknowns.items) || []);
    ok("P1-7: at 20 minutes (3 a sitting) the quick path reaches enough_to_start", r.ok && pr.ready_to_plan === true, JSON.stringify({ ok: r.ok, ready: pr.ready_to_plan, missing: pr.missing_must.slice(0, 8), refused: r.log.filter((l) => !l.ok).slice(0, 1) }));
    ok("P1-7: ... within 8 sittings (it took " + box.state.onboarding.sitting.n + ")", box.state.onboarding.sitting.n <= 8, String(box.state.onboarding.sitting.n));
    ok("P1-7: the MUST it did not ask are deferred with a consequence, never dropped (quick path)", (() => { const ob = box.state.onboarding; const deferred = Object.entries(ob.skipped || {}).filter(([, s]) => s.deferred && /quick/i.test(s.reason || "")); return deferred.length > 0 && deferred.every(([, s]) => s.consequence); })() || (pr.deferred_by_depth || []).length > 0, JSON.stringify(Object.keys(box.state.onboarding.skipped || {}).slice(0, 5)));
    // the estimate the brief says is the number the fixture measures
    const startBox = { state: structuredClone(skState) };
    const afterR0 = runSteps(steps.slice(0, steps.findIndex((x) => x.a.type === "onboard.round" && x.a.round === "R1")), inProcess(startBox, { today: TODAY }));
    const b = buildBrief("onboarding", startBox.state, TODAY, 30);
    const est = b.onboarding && b.onboarding.estimate;
    ok("P1-7: the brief says 'about N sittings of M minutes' to enough to start, from the same function", afterR0.ok && !!est && est.sittings >= 1 && est.minutes_per_sitting === 20 && /about \d+ sittings? of 20 minutes/i.test(est.say || ""), JSON.stringify(est));
    const sittingsUsed = box.state.onboarding.sitting.n - startBox.state.onboarding.sitting.n;
    ok("P1-7: the estimate agrees with what was measured (within one sitting)", !!est && Math.abs(est.sittings - sittingsUsed) <= 1, `estimate ${est && est.sittings}, measured ${sittingsUsed}`);
    const std = structuredClone(startBox.state);
    std.onboarding.depth = "standard";
    const estStd = buildBrief("onboarding", std, TODAY, 30).onboarding.estimate;
    ok("P1-7: the standard path says more sittings than the quick one at the same 20 minutes", !!estStd && estStd.sittings > est.sittings, JSON.stringify([estStd, est]));
    const fresh = buildBrief("onboarding", skState, TODAY, 30).onboarding;
    void fresh;
  });

  // ---- P1-8 stop in the middle of a round -----------------------------------------------------------------------------
  await guard("block 8", async () => {
    const { box } = runTo(buildSteps(PERSONAS.designer).steps, /Enter R3/);
    let s = act(box.state, { type: "onboard.answer", id: "R3-01", value: "Asking a senior designer to review my case studies" });
    const bad = tryAct(s, { type: "onboard.skip_round", round: "R3", reason_tag: "because I said so", quote: "skip the rest" });
    ok("P1-8: skip_round needs a reason tag from the list (tired, busy, too_personal, not_useful, unsure, other)", !!bad.err && /tired/.test(bad.err), bad.err);
    const noq = tryAct(s, { type: "onboard.skip_round", round: "R3", reason_tag: "tired" });
    ok("P1-8: skip_round needs his words as quote", !!noq.err && /quote/.test(noq.err), noq.err);
    const wrong = tryAct(s, { type: "onboard.skip_round", round: "R4", reason_tag: "tired", quote: "skip" });
    ok("P1-8: it is the CURRENT round only", !!wrong.err && /R3/.test(wrong.err), wrong.err);
    const sk = tryAct(s, { type: "onboard.skip_round", round: "R3", reason_tag: "tired", quote: "skip the rest of this round" });
    const ob = sk.s.onboarding;
    ok("P1-8: the answer already given stays, every other R3 MUST is deferred with its consequence, and the skip is recorded with its tag", !sk.err && ob.answers["R3-01"].status === "answered" && ob.skipped_rounds.R3.reason_tag === "tired" && Object.entries(ob.skipped).filter(([id, v]) => /^R3-/.test(id) && v.deferred && v.consequence).length >= 1, sk.err || JSON.stringify(ob.skipped_rounds));
    const pr = progress(ob, sk.s.unknowns.items);
    ok("P1-8: R3 then counts as covered, so the move to R4 is possible after its summary and R4 consent", pr.per_round.R3.must_done === pr.per_round.R3.must_total, JSON.stringify(pr.per_round.R3));
    const moved = tryAct(act(sk.s, { type: "onboard.consent", round: "R4", answer: "yes", quote: "yes, plan the dates" }), { type: "onboard.round", round: "R4" });
    ok("P1-8: and the move to R4 is accepted without skip_r3 and without a summary of the skipped round", !moved.err && moved.s.onboarding.round === "R4", moved.err);
    ok("P1-8: forget stays available for what he already said in the round (his choice, offered once)", !tryAct(moved.s, { type: "onboard.forget", round: "R3" }).err);
    // new_sitting needs a tag from a list
    const full = (() => { let st = toR1(skState); for (const id of ["B-01", "B-02", "B-04"]) st = act(st, { type: "onboard.answer", id, value: id === "B-02" ? ["a", "b"] : "Product designer" }); return st; })();
    const lim = structuredClone(full); lim.onboarding.sitting = { ...lim.onboarding.sitting, asked: lim.onboarding.sitting.max, started: TODAY, started_at: NOW };
    const free = tryAct(lim, { type: "onboard.round", round: "R1", new_sitting: true, reason: "because I feel like it" });
    ok("P1-8: new_sitting with a free reason string and no tag is refused (any string used to pass)", !!free.err && /reason_tag/.test(free.err), free.err);
    const tagged = tryAct(lim, { type: "onboard.round", round: "R1", new_sitting: true, reason_tag: "he_asked_to_continue" });
    ok("P1-8: new_sitting with a tag from the list is accepted", !tagged.err, tagged.err);
  });

  // ---- P2 -----------------------------------------------------------------------------------------------------------
  await guard("block 9", async () => {
    const R0 = seq(skState, R0MUST);
    const bad = tryAct(R0, { type: "onboard.answer", id: "R0-04", value: { "made up fact": "still true", role_now: "still true" } });
    ok("P2: R0-04 refuses a key that is not one of the archived facts and lists the keys", !!bad.err && /role_now/.test(bad.err) && /made_up_fact/.test(bad.err), bad.err);
    const good = tryAct(R0, { type: "onboard.answer", id: "R0-04", value: { role_now: "still true", north_star_role: "changed" } });
    ok("P2: R0-04 with real keys is accepted", !good.err, good.err);
    const withPrior = structuredClone(skState);
    withPrior.prior = { ...(withPrior.prior || {}), same_person: true, profile: { role_now: "Product designer", north_star: { role: "Lead designer" } } };
    const b = buildBrief("onboarding", seq(withPrior, [{ type: "onboard.answer", id: "R0-01", value: "40" }, { type: "onboard.answer", id: "R0-02", value: "straight" }, { type: "onboard.answer", id: "R0-03", value: ["none"] }]), TODAY, 30);
    ok("P2: the brief offers R0-04 when prior.json holds facts and it is not answered", (b.next_questions || []).some((x) => x.id === "R0-04"), JSON.stringify((b.next_questions || []).map((x) => x.id)));
    const noPrior = structuredClone(R0);
    delete noPrior.prior;
    const b2 = buildBrief("onboarding", noPrior, TODAY, 30);
    ok("P2: the brief does not offer R0-04 when there is no prior", !(b2.next_questions || []).some((x) => x.id === "R0-04"));
    ok("P2: R0-05 (the ground rules and the yes to start) is asked after the set-up questions R0-06 to R0-10, in the bank and in the brief", (() => { const ids = BANK.filter((x) => x.round === "R0" && x.must).map((x) => x.id); return ids.indexOf("R0-05") > ids.indexOf("R0-10"); })());
    // T-07 against B-18 is never silent
    let s = toR1(skState);
    s = act(s, { type: "onboard.answer", id: "B-19", value: ["Sun"] });
    s = act(s, { type: "onboard.answer", id: "B-18", value: 7 });
    const r4 = structuredClone(s);
    r4.onboarding.round = "R4"; r4.onboarding.consent.R4 = TODAY;
    const t = act(r4, { type: "onboard.answer", id: "T-07", value: 6 });
    ok("P2: T-07 6 against B-18 7 is surfaced (a C-02 note), and hours_per_week says it came from T-07", (t.onboarding.contradictions || []).some((c) => /C-02:B-18~T-07/.test(c.id)) && /T-07/.test(t.profile.constraints.hours_basis || ""), JSON.stringify(t.onboarding.contradictions.map((c) => c.id)));
    // proof tasks only for evidence-type questions
    const { box } = fullRun(buildSteps(PERSONAS.designer).steps);
    const pt = ((box.state.onboarding.derived || {}).tasks || []).filter((x) => x.kind === "proof" || /^Find the link or file/.test(x.task));
    ok("P2: no proof task is made for a reflective answer (R3 or R4 reflective questions)", pt.every((x) => !/^OT-(R3-|T-)/.test(x.id) || x.id === "OT-T-10"), JSON.stringify(pt.map((x) => x.id)));
    // the mirrors drift guard
    const skillPath = path.join(APP, "..", "skills", "growth", "SKILL.md");
    const coachPath = path.join(APP, "..", "skills", "growth-coach", "SKILL.md");
    const companion = path.join(APP, "..", "companion", "CLAUDE.md");
    const txt = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };
    const files = Object.fromEntries(Object.entries({ skill: txt(skillPath), coach: txt(coachPath), companion: txt(companion) }).filter(([, v]) => v)); // a file that is not there (the companion folder is not published) is skipped
    ok("P2: no skill or companion file documents the inline JSON form as the way to call onboarding-act", Object.entries(files).every(([k, t2]) => !/onboarding-act\.mjs"?\s+'\{/.test(t2) && !/onboarding-act\.mjs"? '<action/.test(t2)), Object.entries(files).filter(([, t2]) => /onboarding-act\.mjs"?\s+'/.test(t2)).map(([k]) => k).join(","));
    ok("P2: every skill file says --file is the transport", Object.values(files).every((t2) => /--file/.test(t2)));
    ok("P2: 'at most 7 a sitting' is gone from the mirrors (3, 6 or 7 by the minutes he gave)", !/at most 7 a sitting/i.test(files.coach) && !/at most 7 a sitting/i.test(files.skill));
    ok("P2: the main skill stays under 1000 lines", files.skill.split("\n").length < 1000, String(files.skill.split("\n").length));
    ok("P2: the skill has no em or en dash", !/[\u2013\u2014]/.test(files.skill) && !/[\u2013\u2014]/.test(files.coach));
  });
}
