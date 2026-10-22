// One set of rules for the person's data, used by the check script, the app and the Claude import.
// Errors mean the app may break or mislead the person; warnings are worth fixing.
import { resolveQuestion } from "./onboarding-bank.mjs";
import "./domain-bank.mjs"; // registers the DM-* questions with resolveQuestion
import DOMAIN_REF from "./domains.data.json" with { type: "json" };

export const FILES = ["profile", "rubric", "skills", "evidence", "proof", "reach", "bets", "week", "notnow", "queue", "learning", "tests", "library"];

/** Plan engine files. Each is optional: a missing file is valid, and the app never requires them. */
export const OPTIONAL_FILES = ["demands", "plan", "research", "sources", "runs", "reviews", "onboarding", "unknowns", "prior", "career"];

/** Picks added on or after this date MUST be scored (error). Older unscored picks only warn. Bump it when the library is rescored. */
export const SCORE_REQUIRED_FROM = "2026-10-14";

export function validate(d) {
  const errors = [];
  const warnings = [];
  const err = (f, m) => errors.push(`${f}: ${m}`);
  const warn = (f, m) => warnings.push(`${f}: ${m}`);
  for (const f of FILES) if (!d[f] || typeof d[f] !== "object") err(f, "is missing or not an object");
  if (d.profile && d.profile.pace !== undefined && !["lighter", "steady", "push"].includes(d.profile.pace)) err("profile", "pace must be lighter, steady or push");
  if (errors.length) return { errors, warnings };
  try {
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const SOURCES = ["self", "ai", "shipped", "expert", "market"];
    const comps = new Set(d.rubric.competencies.map((c) => c.id));
    const proofIds = new Set(d.proof.items.map((p) => p.id));
    const uniq = (f, ids, what) => { const seen = new Set(); for (const id of ids) { if (seen.has(id)) err(f, `duplicate ${what} id ${id}`); seen.add(id); } };

    // Copy rules for anything the person reads.
    const DASH = /[–—]/;
    const GAME = /\b(quests?|XP|gear|level[- ]?up|adventurer|loot|streak)\b/i;
    const FAILWORDS = /what'?s wrong|holding you back|filters? you out|\bfailed\b/i;
    // Tone: only text Claude wrote is checked, and only as a WARNING so the app is never blocked.
    function tone(f, where, text) {
      if (typeof text === "string" && FAILWORDS.test(text)) warn(f, `${where}: failure framing ("${text.match(FAILWORDS)[0]}"); say what to change, not what is wrong`);
    }
    function copy(f, where, text) {
      if (typeof text !== "string") return;
      if (DASH.test(text)) err(f, `${where}: has an en or em dash (use a hyphen or words): "${text.slice(0, 60)}"`);
      if (GAME.test(text)) warn(f, `${where}: game word in visible copy: "${text.match(GAME)[0]}"`);
    }

    // week
    const w = d.week;
    if (!ISO.test(w.week_of)) err("week", "week_of must be YYYY-MM-DD");
    else if (new Date(`${w.week_of}T00:00:00`).getDay() !== 1) err("week", "week_of must be a Monday");
    copy("week", "focus", w.focus); copy("week", "focus_short", w.focus_short);
    if (w.focus_short && w.focus_short.length > 45) warn("week", "focus_short is over 45 characters");
    uniq("week", w.tasks.map((t) => t.id), "task");
    for (const t of w.tasks) {
      const at = `task ${t.id}`;
      for (const k of ["task", "why", "adds", "artifact"]) { if (!t[k]) err("week", `${at} is missing ${k}`); copy("week", `${at}.${k}`, t[k]); }
      if (!["skill", "reach"].includes(t.track)) err("week", `${at} track must be skill or reach`);
      if (t.day && !DAYS.includes(t.day)) err("week", `${at} day must be Mon to Sat`);
      if (!(t.minutes > 0 && t.minutes <= 60)) err("week", `${at} minutes must be 1 to 60`);
      if (t.minutes > 30) warn("week", `${at} is ${t.minutes} min; aim for 30 or less`);
      if (![10, 20, 30].includes(t.points)) err("week", `${at} points must be 10, 20 or 30`);
    if (t.where !== undefined && !["phone", "desk"].includes(t.where)) err("week", `${at} where must be phone or desk`);
    if (t.where === undefined) warn("week", `${at} has no where (phone or desk), so the person can't tell if a spare few minutes are enough`);
      if (t.impact && t.points !== { high: 30, medium: 20, low: 10 }[t.impact]) err("week", `${at} points don't match impact ${t.impact}`);
      if (!Array.isArray(t.steps) || t.steps.length < 2 || t.steps.length > 4) warn("week", `${at} should have 2 to 4 steps`);
      (t.steps || []).forEach((s, i) => copy("week", `${at}.steps[${i}]`, s));
      if (t.stepsDone !== undefined) {
        const n = Array.isArray(t.steps) ? t.steps.length : 0;
        if (!Array.isArray(t.stepsDone) || t.stepsDone.some((x) => !Number.isInteger(x) || x < 0 || x >= n)) err("week", `${at} stepsDone must be whole step numbers on this task (0 to ${Math.max(0, n - 1)})`);
      }
      if (!t.example) warn("week", `${at} has no example hand-in`);
      if (t.example && !t.exampleWhy) warn("week", `${at} has an example but no exampleWhy`);
      copy("week", `${at}.example`, t.example); copy("week", `${at}.exampleWhy`, t.exampleWhy);
      if (t.track === "skill" && !comps.has(t.competency)) err("week", `${at} competency "${t.competency}" isn't in the rubric`);
      if (t.proof && !proofIds.has(t.proof)) err("week", `${at} proof "${t.proof}" doesn't exist`);
      if (!["todo", "done", "submitted", "later"].includes(t.status)) err("week", `${at} status is invalid`);
      if ((t.status === "done" || t.status === "submitted") && !ISO.test(t.closed || "")) err("week", `${at} is closed without a closed date`);
      if (t.feedback) {
        const fb = t.feedback;
        if (!ISO.test(fb.date || "")) err("week", `${at}.feedback.date must be YYYY-MM-DD`);
        if (!fb.verdict) err("week", `${at}.feedback.verdict is required`);
        if (!Array.isArray(fb.working) || !Array.isArray(fb.fix_first)) err("week", `${at}.feedback.working and fix_first must be arrays`);
        if (!fb.next) err("week", `${at}.feedback.next is required`);
        if ((fb.fix_first || []).length > 3) warn("week", `${at}.feedback.fix_first has more than 3 items; rank and cut`);
        [fb.verdict, fb.next, ...(fb.working || []), ...(fb.fix_first || [])].forEach((x) => { copy("week", `${at}.feedback`, x); tone("week", `${at}.feedback`, x); });
        // Feedback is about the work, never the person (evidence-base 5.4).
        const SELF = /\byou('re| are)( not| still)? (not )?(senior|junior|good|bad|ready|talented|enough)\b|\byour (ability|talent|level as a designer)\b/i;
        [fb.verdict, fb.next, ...(fb.fix_first || [])].forEach((x) => { if (typeof x === "string" && SELF.test(x)) warn("week", `${at}.feedback talks about the person, not the work: "${x.slice(0, 60)}"`); });
      }
    }
    for (const day of DAYS) {
      const tracks = w.tasks.filter((t) => t.day === day).map((t) => t.track);
      if (tracks.length && !(tracks.includes("skill") && tracks.includes("reach"))) warn("week", `${day} should have one skill and one getting-hired task`);
    }

    // profile intake: answers Claude asked for, so nothing is asked twice
    if (d.profile.intake !== undefined) {
      if (!Array.isArray(d.profile.intake)) err("profile", "intake must be an array");
      else {
        uniq("profile", d.profile.intake.map((a) => a.id), "intake");
        for (const a of d.profile.intake) {
          if (!a.id || !a.q) err("profile", `intake entry needs id and q`);
          if (!ISO.test(a.asked || "")) err("profile", `intake ${a.id} asked must be YYYY-MM-DD`);
          if (a.answer === undefined) err("profile", `intake ${a.id} needs answer (null while waiting for the person)`);
          if (a.answer !== null && a.answer !== undefined && !ISO.test(a.date || "")) err("profile", `intake ${a.id} is answered without a date`);
          if (a.options !== undefined && !Array.isArray(a.options)) err("profile", `intake ${a.id} options must be an array`);
          copy("profile", `intake ${a.id}`, a.q); copy("profile", `intake ${a.id}.why`, a.why);
          if (/\bhow (good|confident|skilled)\b|\brate yourself\b|1 to 10/i.test(a.q)) warn("profile", `intake ${a.id} asks for a feeling; ask for a count, a link or a yes/no`);
        }
      }
    }

    // skills
    for (const id of comps) {
      const r = d.skills.ratings[id];
      // While an onboarding is under way, ratings are rebuilt from evidence in Round 2, so none yet is valid.
      if (!r) { if (!(d.onboarding && d.onboarding.status && d.onboarding.status !== "complete")) err("skills", `no rating for ${id}`); continue; }
      if (!(r.level >= 1 && r.level <= 4 && Number.isInteger(r.level * 2))) err("skills", `${id} level must be 1 to 4 in half steps`);
      if (!SOURCES.includes(r.source)) err("skills", `${id} source is invalid`);
      const cap = { self: 0.3, ai: 0.5, shipped: 0.7, expert: 0.8, market: 0.9 }[r.source];
      if (r.confidence > cap + 1e-9) err("skills", `${id} confidence ${r.confidence} is above the ${r.source} cap of ${cap}`);
      if (d.rubric && d.rubric.unsourced === true && r.confidence > 0.3 + 1e-9) err("skills", `${id} confidence ${r.confidence} is above 0.3, the cap while the rubric is unsourced (described from his own answers, not researched)`);
      // The counted level of a rating (domain flow): optional, and never above the level he claimed (it can only be capped).
      if (r.level_counted !== undefined) {
        if (!(typeof r.level_counted === "number" && r.level_counted >= 0 && r.level_counted <= 4)) err("skills", `${id}.level_counted must be 0 to 4`);
        // Only onboarding keeps these three in step; a weekly review or a test that moves `level` leaves them behind. That is stale data, not
        // broken data: a warning, never an error that would lock every later write.
        else if (r.level_counted > r.level + 1e-9) warn("skills", `${id}.level_counted ${r.level_counted} is above the level ${r.level} (a rating moved after onboarding wrote it; the next onboarding action or target rebuilds it)`);
        if (r.level_claimed !== undefined && r.level_claimed !== r.level) warn("skills", `${id}.level_claimed ${r.level_claimed} differs from level ${r.level} (a rating moved after onboarding wrote it)`);
        if (r.capped === true && !(typeof r.cap_reason === "string" && r.cap_reason.trim())) warn("skills", `${id} is capped but has no cap_reason`);
      }
      copy("skills", `${id}.note`, r.note);
      if (/confidence|\b0\.\d\b/i.test(r.note || "")) warn("skills", `${id}.note shows an internal number; say "an estimate" or "confirmed" instead`);
      if (!Array.isArray(r.history) || !r.history.length) err("skills", `${id} has no history`);
      else {
        const last = r.history[r.history.length - 1];
        if (last.level !== r.level) err("skills", `${id} level ${r.level} doesn't match its last history entry (${last.level})`);
        for (let i = 1; i < r.history.length; i++) {
          const jump = Math.abs(r.history[i].level - r.history[i - 1].level);
          // The step from the marked placeholder ("not assessed") to the first real rating is not a move: it is the first
          // measurement. It is exempt only when the new entry cites the evidence it rests on (answer ids or evidence).
          const prevPlaceholder = r.history[i - 1].placeholder === true || (i === 1 && /^Placeholder written/i.test(String(r.history[i - 1].reason || "")));
          const cited = (Array.isArray(r.history[i].because) && r.history[i].because.length > 0) || (Array.isArray(r.history[i].evidence) && r.history[i].evidence.length > 0);
          const firstRating = prevPlaceholder && cited && r.history[i].placeholder !== true;
          if (jump > 0.5 && !firstRating && r.history[i].source !== "expert" && r.history[i].source !== "market") err("skills", `${id} moved ${jump} levels at once without an expert or market source`);
          if (!r.history[i].reason) err("skills", `${id} history entry ${i} has no reason`);
        }
      }
    }

    // evidence
    uniq("evidence", d.evidence.entries.map((e) => e.id), "evidence");
    for (const e of d.evidence.entries) {
      if (![...SOURCES, "note"].includes(e.type)) err("evidence", `${e.id} type is invalid`);
      if (e.competency && !comps.has(e.competency)) err("evidence", `${e.id} competency "${e.competency}" isn't in the rubric`);
      copy("evidence", `${e.id}.title`, e.title);
      if (e.type === "ai") { tone("evidence", `${e.id}.title`, e.title); tone("evidence", `${e.id}.detail`, e.detail); }
    }

    // queue
    uniq("queue", d.queue.items.map((q) => q.id), "queue");
    for (const q of d.queue.items) {
      if (!["research", "critique", "test", "plan", "answers", "ask", "picks", "goal"].includes(q.type)) err("queue", `${q.id} type is invalid`);
      if (q.status === "done" && !ISO.test(q.done || "")) err("queue", `${q.id} is done without a done date`);
      if (q.type === "critique" && q.status === "done" && q.task) {
        const t = w.tasks.find((x) => x.id === q.task);
        if (t && !t.feedback) err("queue", `${q.id} is done but task ${q.task} has no feedback for the person to read`);
      }
    }

    // Claude's replies: anything that came from the person gets an answer he can read in the app.
    for (const q of d.queue.items) {
      if (q.type === "ask" && !q.ask?.text) err("queue", `${q.id} is an ask without ask.text`);
      if (q.type === "ask" && q.ask?.kind !== undefined && !["question", "change"].includes(q.ask.kind)) err("queue", `${q.id} ask.kind is invalid`);
      if (q.status === "done" && ["ask", "answers", "plan", "picks", "goal"].includes(q.type)) {
        if (!q.reply) err("queue", `${q.id} (${q.type}) is done without a reply for the person`);
        else {
          copy("queue", `${q.id}.reply`, q.reply);
          tone("queue", `${q.id}.reply`, q.reply);
          if (q.reply.length > 900) warn("queue", `${q.id}.reply is long (${q.reply.length} chars); aim for under 150 words`);
        }
      }
    }
    if (d.profile.stage) {
      const st = d.profile.stage;
      if (!st.name || !st.why || !ISO.test(st.date || "")) err("profile", "stage needs name, why and date");
      copy("profile", "stage", st.why);
    }
    for (const a of d.profile.intake || []) if (a.takeaway) copy("profile", `intake ${a.id}.takeaway`, a.takeaway);

    // library picks: real, dated, with a reason, and honest about cost
    const KINDS = ["book", "article", "video", "visual", "podcast", "news"];
    // Once any pick has a score, an unscored new or kept pick from that week on must be scored too.
    const scoredWeeks = (d.library.picks || []).filter((p) => p.score && typeof p.score === "object" && ISO.test(p.week_of || "")).map((p) => p.week_of).sort();
    const SCORE_FROM = scoredWeeks[0] || null;
    // gaps: what the person doesn't know yet, tracked until closed
    const gapIds = new Set((d.library.gaps || []).map((g) => g.id));
    uniq("library", (d.library.gaps || []).map((g) => g.id), "gap");
    for (const g of d.library.gaps || []) {
      const at = `gap ${g.id}`;
      for (const k of ["title", "why", "source", "closes_when"]) if (!g[k]) err("library", `${at} needs ${k}`);
      if (!comps.has(g.competency)) err("library", `${at} competency isn't in the rubric`);
      if (!["open", "closing", "closed"].includes(g.status)) err("library", `${at} status is invalid`);
      if (!ISO.test(g.opened || "")) err("library", `${at} opened must be YYYY-MM-DD`);
      if (g.status === "closed" && !ISO.test(g.closed || "")) err("library", `${at} is closed without a closed date`);
      [g.title, g.why, g.closes_when, g.now].forEach((x) => copy("library", at, x));
      [g.why, g.closes_when, g.now].forEach((x) => { if (typeof x === "string" && /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/.test(x)) warn("library", `${at} names a weekday, which goes stale when a plan slips: "${x.slice(0, 50)}"`); });
      if (g.evenings !== undefined && !(Number.isInteger(g.evenings) && g.evenings >= 0 && g.evenings <= 60)) err("library", `${at} evenings must be a whole number from 0 to 60`);
      if (g.estimated !== undefined && !ISO.test(g.estimated)) err("library", `${at} estimated must be YYYY-MM-DD`);
      if (g.track !== undefined && !["skill", "reach"].includes(g.track)) err("library", `${at} track must be skill or reach`);
      if (g.status !== "closed" && g.evenings === undefined) warn("library", `${at} has no evenings estimate, so the app can't show when it closes`);
    }
    for (const e of d.evidence.entries) if (e.gap && !gapIds.has(e.gap)) err("evidence", `${e.id} points at gap ${e.gap}, which doesn't exist`);
    uniq("library", (d.library.picks || []).map((p) => p.id), "pick");
    for (const p of d.library.picks || []) {
      const at = `pick ${p.id}`;
      if (!KINDS.includes(p.kind)) err("library", `${at} kind is invalid`);
      if (p.status !== undefined && !["new", "kept", "skipped", "done"].includes(p.status)) err("library", `${at} status is invalid`);
      if (!/^https?:\/\//.test(p.url || "")) err("library", `${at} has no real URL`);
      if (!p.title || !p.by || !p.why) err("library", `${at} needs title, by and why`);
      if (!ISO.test(p.week_of || "")) err("library", `${at} week_of must be YYYY-MM-DD`);
      if (!["new", "kept", "skipped", "done"].includes(p.status)) err("library", `${at} status is invalid`);
      if (p.competency && !comps.has(p.competency)) err("library", `${at} competency isn't in the rubric`);
      if (p.kind === "book" && !p.try_first) warn("library", `${at} is a book with no free way to try it first`);
      if (p.kind === "video" && p.minutes > 30) warn("library", `${at} is a ${p.minutes} min video; phone picks should be short or say so in why`);
      if (p.kind === "article" && p.minutes > 20) warn("library", `${at} is a ${p.minutes} min read; split or pick shorter`);
      if (p.published && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(p.published)) err("library", `${at} published must be YYYY, YYYY-MM or YYYY-MM-DD`);
      [p.title, p.why, p.look_for, p.still_current, p.try_it].forEach((x) => copy("library", at, x));
      [p.why, p.look_for, p.try_it].forEach((x) => { if (typeof x === "string" && /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/.test(x)) warn("library", `${at} names a weekday, which goes stale when a plan slips: "${x.slice(0, 50)}"`); });
      if (p.gap && !gapIds.has(p.gap)) err("library", `${at} points at gap ${p.gap}, which doesn't exist`);
      if (p.week_of === w.week_of && !p.checked) warn("library", `${at} has no checked date; open it and confirm it's current`);
      if (p.checked && !ISO.test(p.checked)) err("library", `${at} checked must be YYYY-MM-DD`);
      const year = p.published ? Number(p.published.slice(0, 4)) : null;
      if (year && year < Number(w.week_of.slice(0, 4)) - 3 && !p.still_current) warn("library", `${at} is from ${year}; add still_current saying why it's still the standard`);
      if (p.kind === "news") {
        if (!p.published) err("library", `${at} is news without a published date`);
        else if ((new Date(`${w.week_of}T00:00:00`) - new Date(`${p.published.length === 4 ? p.published + "-01-01" : p.published.length === 7 ? p.published + "-01" : p.published}T00:00:00`)) / 864e5 > 90) err("library", `${at} is news older than 90 days; that's not news`);
        if (!p.try_it) warn("library", `${at} is news without try_it`);
      }
      // Scoring: the honest check Claude runs before a pick is shown.
      if (p.thumb !== undefined && !/^https:\/\/(img\.youtube\.com\/vi\/|covers\.openlibrary\.org\/b\/)/.test(String(p.thumb))) err("library", `${at} thumb must be a YouTube thumbnail or an Open Library cover`);
      const sc = p.score;
      if (sc === undefined || sc === null) {
        const shown = p.status === "new" || p.status === "kept";
        if (shown && SCORE_FROM && ISO.test(p.week_of || "") && p.week_of >= SCORE_FROM) err("library", `${at} is not scored; score it before it is shown`);
        else if (shown && (p.added || p.checked || p.week_of || "") >= SCORE_REQUIRED_FROM) err("library", `${at} was added on or after ${SCORE_REQUIRED_FROM} and is not scored; score it before it is shown`);
        else if (shown) warn("library", `${at} is not scored yet; say update my library`);
      } else if (typeof sc !== "object") err("library", `${at} score must be an object`);
      else {
        const dims = { fit: 0.25, gain: 0.25, time: 0.15, substance: 0.15, fresh: 0.1, best: 0.1 };
        let dimsOk = true;
        for (const k of Object.keys(dims)) if (!(Number.isInteger(sc[k]) && sc[k] >= 0 && sc[k] <= 10)) { err("library", `${at} score.${k} must be a whole number from 0 to 10`); dimsOk = false; }
        if (!Number.isInteger(sc.total) || sc.total < 0 || sc.total > 100) err("library", `${at} score.total must be a whole number from 0 to 100`);
        else if (dimsOk) {
          const want = Math.round(10 * Object.entries(dims).reduce((a, [k, wt]) => a + wt * sc[k], 0));
          if (Math.abs(sc.total - want) > 1) err("library", `${at} score.total is ${sc.total} but the six scores add up to ${want}`);
        }
        if (!["read_now", "worth_it", "skim"].includes(sc.verdict)) err("library", `${at} score.verdict must be read_now, worth_it or skim`);
        else if (Number.isInteger(sc.total)) {
          const v = sc.total >= 80 ? "read_now" : sc.total >= 65 ? "worth_it" : sc.total >= 50 ? "skim" : null;
          if (v !== null && v !== sc.verdict) err("library", `${at} score.verdict is ${sc.verdict} but a total of ${sc.total} is ${v}`);
        }
        if (!Array.isArray(sc.compared) || sc.compared.length < 2 || sc.compared.some((c) => typeof c !== "string" || !c.trim())) err("library", `${at} score.compared needs at least 2 titles it was compared with`);
        if (typeof sc.why !== "string" || !sc.why.trim()) err("library", `${at} score.why is required`);
        else if (sc.why.length > 160) err("library", `${at} score.why is over 160 characters`);
        if (sc.best < 7 && !(typeof sc.better === "string" && sc.better.trim())) err("library", `${at} score.better is required when best is under 7`);
        if (!ISO.test(sc.scored || "")) err("library", `${at} score.scored must be YYYY-MM-DD`);
        else if (sc.scored > new Date().toLocaleDateString("en-CA")) err("library", `${at} score.scored is in the future`);
        copy("library", `${at}.score.why`, sc.why); copy("library", `${at}.score.better`, sc.better);
        // A shown pick has to clear the bar.
        if ((p.status === "new" || p.status === "kept") && dimsOk && (sc.total < 65 || sc.fit < 4 || sc.substance < 4 || sc.fresh < 4 || sc.gain < 5 || sc.time < 3)) err("library", `${at} doesn't clear the bar (total 65; fit, substance and fresh at least 4; gain at least 5; time at least 3): this isn't a pick, it belongs in library.left_out`);
        [sc.why, sc.better].forEach((x) => { if (typeof x === "string" && FAILWORDS.test(x)) warn("library", `${at}.score has failure framing ("${x.match(FAILWORDS)[0]}"); say what to change, not what is wrong`); });
      }
    }
    // left out: what Claude looked at and didn't show, so the list can be trusted
    const lo = d.library.left_out;
    if (lo !== undefined) {
      if (!Array.isArray(lo)) err("library", "left_out must be an array");
      else {
        if (lo.length > 8) err("library", `left_out has ${lo.length} entries; keep it to 8 or fewer`);
        const pickTitles = new Set((d.library.picks || []).map((p) => String(p.title).trim().toLowerCase()));
        lo.forEach((x, i) => {
          const at = `left_out ${i + 1}`;
          if (!x || typeof x !== "object") { err("library", `${at} must be an object`); return; }
          if (typeof x.title !== "string" || !x.title.trim()) err("library", `${at} needs a title`);
          if (!KINDS.includes(x.kind)) err("library", `${at} kind is invalid`);
          if (typeof x.why_not !== "string" || !x.why_not.trim()) err("library", `${at} needs why_not`);
          if (!ISO.test(x.checked || "")) err("library", `${at} checked must be YYYY-MM-DD`);
          copy("library", `${at}.why_not`, x.why_not);
          if (typeof x.title === "string" && pickTitles.has(x.title.trim().toLowerCase())) warn("library", `${at} "${x.title}" is also a current pick`);
        });
      }
    }
    // profile modules: add-on tools and what they found
    const mods = d.profile.modules;
    if (mods !== undefined) {
      const CAPS = ["cv", "linkedin", "portfolio", "interview", "other"];
      const inst = Array.isArray(mods.installed) ? mods.installed : null;
      const res = Array.isArray(mods.results) ? mods.results : null;
      if (!inst || !res) err("profile", "modules needs installed and results arrays");
      else {
        uniq("profile", inst.map((m) => m.id), "module");
        const ids = new Set(inst.map((m) => m.id));
        const defaults = {};
        for (const m of inst) {
          const at = `module ${m.id}`;
          if (typeof m.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.id)) err("profile", `${at} id must be lowercase words joined by hyphens`);
          // The skill file decides what an add-on does (its abilities); a category is optional and only a legacy label.
          if (m.capability !== undefined && !CAPS.includes(m.capability)) err("profile", `${at} capability must be cv, linkedin, portfolio, interview or other`);
          const sk = m.skill;
          if (!sk || !["file", "installed"].includes(sk.kind)) err("profile", `${at} skill.kind must be file or installed`);
          else if (!(sk.kind === "file" ? sk.path : sk.name)) err("profile", `${at} skill needs a ${sk.kind === "file" ? "path" : "name"}`);
          if (typeof m.enabled !== "boolean") err("profile", `${at} enabled must be true or false`);
          if (m.default && m.enabled) defaults[m.capability] = (defaults[m.capability] || 0) + 1;
          if (m.can_publish === true) {
            warn("profile", `${at} can publish; it is never allowed to, the person approves each time or it stays read-only`);
            if (m.enabled !== false) err("profile", `${at} can publish and is enabled; disable it (enabled false) or keep it read-only`);
          }
          if (m.sha1 !== undefined && !(typeof m.sha1 === "string" && /^[0-9a-f]{40}$/i.test(m.sha1))) err("profile", `${at} sha1 must be a 40-character hex string`);
          if (m.flagged !== undefined && !(Array.isArray(m.flagged) && m.flagged.every((x) => typeof x === "string"))) err("profile", `${at} flagged must be a list of quoted lines`);
          if (sk && sk.kind === "file" && typeof sk.path === "string" && (sk.path.split(/[\\/]/).includes("..") || !sk.path.startsWith(`modules/${m.id}/`))) err("profile", `${at} skill.path must start with modules/${m.id}/ and contain no ..`);
        }
        for (const [c, n] of Object.entries(defaults)) if (n > 1) err("profile", `${n} enabled modules are the default for ${c}; only one can be`);
        // abilities and impact: what the file enables and what it changes (shape only; the ledger is checked by the check script)
        const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
        const nonEmpty = (x, max) => typeof x === "string" && x.trim().length > 0 && x.length <= max;
        for (const m of inst) {
          const at = `module ${m.id}`;
          if (m.abilities === undefined) warn("profile", `${at} has no abilities; ask Claude to list what this add-on enables`);
          else if (!Array.isArray(m.abilities) || m.abilities.length < 1) err("profile", `${at} abilities must be a list of at least 1`);
          else {
            const seenA = new Set();
            m.abilities.forEach((a, i) => {
              const ab = `${at} ability ${a && a.id ? a.id : i + 1}`;
              if (!a || typeof a !== "object") { err("profile", `${ab} must be an object`); return; }
              if (typeof a.id !== "string" || !KEBAB.test(a.id)) err("profile", `${ab} id must be lowercase words joined by hyphens`);
              else { if (seenA.has(a.id)) err("profile", `${at} has a duplicate ability id ${a.id}`); seenA.add(a.id); }
              if (typeof a.topic !== "string" || !KEBAB.test(a.topic)) err("profile", `${ab} topic must be lowercase words joined by hyphens`);
              if (!nonEmpty(a.label, 80)) err("profile", `${ab} label must be 1 to 80 characters`);
              if (!Array.isArray(a.say) || a.say.length < 1 || a.say.length > 3) err("profile", `${ab} say must be 1 to 3 phrases`);
              else if (a.say.some((x) => !nonEmpty(x, 60))) err("profile", `${ab} each say phrase must be 1 to 60 characters`);
              if (!nonEmpty(a.reads, 140)) err("profile", `${ab} reads must be 1 to 140 characters`);
              if (!["score", "notes"].includes(a.gives)) err("profile", `${ab} gives must be score or notes`);
              if (typeof a.enabled !== "boolean") err("profile", `${ab} enabled must be true or false`);
              if (a.posts === true) err("profile", `${ab} posts, sends or publishes; that is never an ability`);
              else if (a.posts !== undefined && a.posts !== false) err("profile", `${ab} posts must be false or left out`);
              for (const [k, x] of [["label", a.label], ["reads", a.reads], ...(Array.isArray(a.say) ? a.say.map((y) => ["say", y]) : [])]) if (typeof x === "string" && DASH.test(x)) warn("profile", `${ab}.${k} has an en or em dash (use a hyphen or words)`);
            });
          }
          if (m.impact !== undefined) {
            const im = m.impact;
            if (!im || typeof im !== "object") err("profile", `${at} impact must be an object`);
            else {
              for (const k of ["adds", "strengthens", "can_drop"]) {
                const list = im[k];
                if (!Array.isArray(list)) { err("profile", `${at} impact.${k} must be a list`); continue; }
                if (list.length > 3) err("profile", `${at} impact.${k} has ${list.length} lines; keep it to 3 or fewer`);
                list.forEach((l, i) => {
                  const lt = `${at} impact.${k}[${i}]`;
                  if (!l || typeof l !== "object") { err("profile", `${lt} must be an object`); return; }
                  if (!nonEmpty(l.text, 120)) err("profile", `${lt} text must be 1 to 120 characters`);
                  if (!nonEmpty(l.why, 120)) err("profile", `${lt} why must be 1 to 120 characters`);
                  if (l.target !== undefined && typeof l.target !== "string") err("profile", `${lt} target must be text`);
                  for (const f of ["text", "why"]) if (typeof l[f] === "string" && DASH.test(l[f])) warn("profile", `${lt}.${f} has an en or em dash (use a hyphen or words)`);
                });
              }
              if (!["file", "trial"].includes(im.based_on)) err("profile", `${at} impact.based_on must be file or trial`);
              if (!ISO.test(im.decided || "") || Number.isNaN(new Date(`${im.decided}T00:00:00`).getTime())) err("profile", `${at} impact.decided must be a valid YYYY-MM-DD date`);
            }
          }
          if (Array.isArray(m.flagged) && m.flagged.length > 0 && m.enabled === true) warn("profile", `${at} has flagged lines and is enabled; make sure the person has seen them and said yes`);
        }
        if (mods.primary !== undefined) {
          if (!mods.primary || typeof mods.primary !== "object" || Array.isArray(mods.primary)) err("profile", "modules.primary must be an object");
          else {
            const enabledIds = new Set(inst.filter((m) => m.enabled === true).map((m) => m.id));
            for (const [topic, who] of Object.entries(mods.primary)) {
              if (!KEBAB.test(topic)) err("profile", `primary topic "${topic}" must be lowercase words joined by hyphens`);
              if (who !== "built-in" && !enabledIds.has(who)) err("profile", `primary for ${topic} is "${who}", which must be built-in or an installed, enabled add-on`);
            }
          }
        }
        if (mods.retired !== undefined) {
          if (!Array.isArray(mods.retired) || mods.retired.some((x) => typeof x !== "string" || !KEBAB.test(x))) err("profile", "modules.retired must be a list of lowercase-hyphen ids");
        }
        uniq("profile", res.map((r) => r.id), "module result");
        const perModule = {};
        for (const r of res) {
          const at = `module result ${r.id}`;
          if (!ids.has(r.module)) err("profile", `${at} points at module ${r.module}, which isn't installed`);
          perModule[r.module] = (perModule[r.module] || 0) + 1;
          if (!ISO.test(r.date || "")) err("profile", `${at} date must be YYYY-MM-DD`);
          if (r.score !== null && !(Number.isInteger(r.score) && r.score >= 0 && r.score <= 100)) err("profile", `${at} score must be a whole number from 0 to 100, or null`);
          if (r.word !== undefined && (typeof r.word !== "string" || r.word.length > 24)) err("profile", `${at} word must be 24 characters or fewer`);
          if (typeof r.summary !== "string" || !r.summary.trim()) err("profile", `${at} needs a summary`);
          else if (r.summary.length > 400) err("profile", `${at} summary is over 400 characters`);
          if (!Array.isArray(r.strengths) || r.strengths.length > 3) err("profile", `${at} strengths must be a list of 3 or fewer`);
          if (!Array.isArray(r.fixes) || r.fixes.length > 5) err("profile", `${at} fixes must be a list of 5 or fewer`);
          else for (const f of r.fixes) if (!f || !f.what || !f.why) err("profile", `${at} each fix needs what and why`);
          if (!["current", "stale"].includes(r.status)) err("profile", `${at} status must be current or stale`);
          const texts = [r.summary, ...(Array.isArray(r.fixes) ? r.fixes.flatMap((f) => [f && f.what, f && f.why]) : [])];
          if (texts.some((t) => typeof t === "string" && DASH.test(t))) warn("profile", `${at} has an en or em dash (use a hyphen or words)`);
          if (texts.some((t) => typeof t === "string" && GAME.test(t))) warn("profile", `${at} has a game word in visible copy`);
          if ([...texts, r.word].some((t) => typeof t === "string" && FAILWORDS.test(t))) warn("profile", `${at} has failure framing (say what to change, not what is wrong)`);
        }
        for (const [m, n] of Object.entries(perModule)) if (n > 5) warn("profile", `module ${m} has ${n} results; keep the latest 5`);
      }
    }
    // Never recommend what the person parked in Not now, unless the pick says plainly how it fits anyway.
    const parked = (d.notnow.items || []).flatMap((n) => String(n.what).toLowerCase().split(/,| and /).map((x) => x.trim().replace(/^(a|an|the|more|new|advanced)\s+/, "")).filter((x) => x.length >= 2));
    for (const pk of (d.library.picks || []).filter((x) => x.week_of === w.week_of && (x.status === "new" || x.status === "kept"))) {
      const text = `${pk.title} ${pk.why} ${pk.try_it || ""} ${pk.look_for || ""}`.toLowerCase();
      const hit = parked.find((ph) => { const at = text.indexOf(ph); if (at < 0) return false; const before = text[at - 1]; const after = text[at + ph.length]; return !(before && /[a-z0-9]/.test(before)) && !(after && /[a-z0-9]/.test(after)); });
      if (hit && !/not now/i.test(pk.why)) err("library", `pick ${pk.id} touches "${hit}", which is in Not now. Drop it, or say in why how it fits despite that (mention Not now).`);
    }
    const thisWeek = (d.library.picks || []).filter((p) => p.week_of === w.week_of && p.kind !== "news");
    if ((d.library.picks || []).filter((p) => p.week_of === w.week_of && p.kind === "news").length > 3) warn("library", "more than 3 news items this week");
    if (thisWeek.length > 6) warn("library", `${thisWeek.length} picks this week; keep it to 6 or fewer`);
    if (thisWeek.filter((p) => p.kind === "book").length > 1) warn("library", "more than one book this week");

    // trinkets: small checked thoughts from designers; never invented
    const TRK = d.library.trinkets;
    if (TRK !== undefined && !Array.isArray(TRK)) err("library", "trinkets must be a list");
    else if (TRK) {
      const nowD = new Date(); const todayStr = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}-${String(nowD.getDate()).padStart(2, "0")}`;
      if (TRK.length > 12) err("library", `${TRK.length} trinkets; keep it to 12 or fewer`);
      uniq("library", TRK.map((t) => t.id), "trinket");
      const byWho = {};
      for (const t of TRK) {
        const at = `trinket ${t.id}`;
        if (!/^T-\d{3}$/.test(t.id || "")) err("library", `${at} id must look like T-001`);
        if (!ISO.test(t.week_of || "")) err("library", `${at} week_of must be YYYY-MM-DD`);
        if (!t.who || typeof t.who !== "string" || !t.who.trim()) err("library", `${at} needs who`);
        else { if (t.who.length > 60) err("library", `${at} who is over 60 characters`); byWho[t.who.trim()] = (byWho[t.who.trim()] || 0) + 1; }
        if (!t.line || typeof t.line !== "string" || !t.line.trim()) err("library", `${at} needs a line`);
        else {
          if (t.line.length > 200) err("library", `${at} line is over 200 characters`);
          if (t.quoted === true && t.line.trim().split(/\s+/).length > 25) err("library", `${at} is a quote of more than 25 words; shorten it or paraphrase it with quoted: false`);
        }
        if (typeof t.quoted !== "boolean") err("library", `${at} quoted must be true or false`);
        if (!t.source || !t.source.title || !String(t.source.title).trim()) err("library", `${at} needs a source title`);
        let urlOk = false;
        try { urlOk = new URL(t.source && t.source.url).protocol === "https:"; } catch { urlOk = false; }
        if (!urlOk) err("library", `${at} source url must be a real https URL`);
        {
          const src = t.source || {};
          const norm = (x) => Array.from(String(x ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLowerCase()).map((c) => (c.trim() === "" ? " " : c)).join("").split(" ").filter(Boolean).join(" ");
          if (typeof src.excerpt !== "string" || !src.excerpt.trim()) err("library", `${at} needs source.excerpt, the sentence on the page it rests on`);
          else {
            if (src.excerpt.length > 400) err("library", `${at} source.excerpt is over 400 characters`);
            if (t.quoted === true && typeof t.line === "string" && t.line.trim() && !norm(src.excerpt).includes(norm(t.line))) err("library", `${at} is quoted but its source.excerpt doesn't contain the line`);
          }
          if (src.found_at !== undefined && (typeof src.found_at !== "string" || src.found_at.length > 80)) err("library", `${at} source.found_at must be 80 characters or fewer`);
          try { const h = new URL(src.url).hostname.toLowerCase(); if (/(^|[.])example[.](com|org)$/.test(h) || h === "localhost" || /[.](invalid|test)$/.test(h)) warn("library", `${at} source url looks like a placeholder (${h})`); } catch { /* reported above */ }
        }
        if (!ISO.test(t.checked || "")) err("library", `${at} checked must be YYYY-MM-DD`);
        else if (t.checked > todayStr) err("library", `${at} checked is in the future`);
        else if ((t.status === "new" || t.status === "saved") && (new Date(`${todayStr}T00:00:00`) - new Date(`${t.checked}T00:00:00`)) / 864e5 > 120) warn("library", `${at} was checked over 120 days ago; recheck the source`);
        if (!["new", "saved", "hidden"].includes(t.status)) err("library", `${at} status is invalid`);
        if (t.try !== undefined && (typeof t.try !== "string" || t.try.length > 140)) err("library", `${at} try must be 140 characters or fewer`);
        if (t.competency && !comps.has(t.competency)) err("library", `${at} competency isn't in the rubric`);
        if (t.gap && !gapIds.has(t.gap)) err("library", `${at} points at gap ${t.gap}, which doesn't exist`);
        for (const [k, x] of [["line", t.line], ["try", t.try]]) {
          if (typeof x !== "string") continue;
          if (DASH.test(x)) warn("library", `${at}.${k} has an en or em dash (use a hyphen or words)`);
          if (FAILWORDS.test(x)) warn("library", `${at}.${k} has failure framing ("${x.match(FAILWORDS)[0]}")`);
        }
      }
      for (const [who, n] of Object.entries(byWho)) if (n > 2) warn("library", `${n} trinkets from ${who}; keep it to 2 or fewer`);
    }

    // person model: his own lines about how he learns and works; estimates labelled, never a verdict
    const PER = d.profile.person;
    if (PER !== undefined) {
      const AREAS = ["learns", "works", "energy", "worry", "wants", "limits", "voice"];
      const PSRC = { estimate: 0.5, observed: 0.7, you_said: 0.9 };
      const PSTAT = ["proposed", "confirmed", "rejected", "hidden"];
      const USES = ["feedback", "planning", "library", "cv", "outreach", "tone"];
      const DIAG = /depress|disorder|bipolar|adhd|autis|clinical|diagnos|therapy/i;
      const todayIso = new Date().toLocaleDateString("en-CA");
      const weekAgo = new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-CA");
      if (!PER || typeof PER !== "object" || !Array.isArray(PER.items)) err("profile", "person must have a list of items");
      else {
        if (PER.items.length > 40) err("profile", `person has ${PER.items.length} items; keep it to 40 or fewer`);
        uniq("profile", PER.items.map((x) => x.id), "person item");
        let recent = 0;
        for (const it of PER.items) {
          const at = `person item ${it.id}`;
          if (!/^W-\d{3}$/.test(it.id || "")) err("profile", `${at} id must look like W-001`);
          if (!AREAS.includes(it.area)) err("profile", `${at} area must be one of ${AREAS.join(", ")}`);
          if (typeof it.text !== "string" || !it.text.trim()) err("profile", `${at} needs text`);
          else if (it.text.length > 140) err("profile", `${at} text is ${it.text.length} characters; keep it to 140 or fewer`);
          for (const k of ["text", "why"]) {
            if (typeof it[k] !== "string") continue;
            if (DASH.test(it[k])) warn("profile", `${at}.${k} has an en or em dash (use a hyphen or words)`);
            if (DIAG.test(it[k])) err("profile", `${at}.${k} sounds like a diagnosis: say what he said or what shows in his work`);
          }
          if (it.why !== undefined && typeof it.why !== "string") err("profile", `${at} why must be text`);
          if (!Object.prototype.hasOwnProperty.call(PSRC, it.source)) err("profile", `${at} source must be estimate, observed or you_said`);
          if (!Array.isArray(it.evidence) || it.evidence.some((e) => typeof e !== "string")) err("profile", `${at} evidence must be a list of ids`);
          else if (it.evidence.length > 6) err("profile", `${at} has ${it.evidence.length} evidence ids; keep it to 6 or fewer`);
          if (typeof it.confidence !== "number" || !(it.confidence >= 0 && it.confidence <= 1)) err("profile", `${at} confidence must be a number from 0 to 1`);
          else if (PSRC[it.source] !== undefined && it.confidence > PSRC[it.source]) err("profile", `${at} confidence ${it.confidence} is over the ${PSRC[it.source]} cap for ${it.source}`);
          if (it.area === "worry" && it.source !== "you_said" && PSRC[it.source] !== undefined) err("profile", `${at} is a worry from ${it.source}: a worry is only stored if the person said it (source you_said)`);
          if (!PSTAT.includes(it.status)) err("profile", `${at} status must be proposed, confirmed, rejected or hidden`);
          if (typeof it.private !== "boolean") err("profile", `${at} private must be true or false`);
          else if (it.area === "worry" && !it.private) warn("profile", `${at} is a worry that isn't private`);
          if (!Array.isArray(it.use_for) || !it.use_for.length || it.use_for.some((u) => !USES.includes(u))) err("profile", `${at} use_for must be a non-empty list of ${USES.join(", ")}`);
          if (!ISO.test(it.noted || "") || Number.isNaN(Date.parse(it.noted))) err("profile", `${at} noted must be a date YYYY-MM-DD`);
          else {
            if (it.noted > todayIso) err("profile", `${at} noted is in the future`);
            if (it.status === "proposed" && it.noted >= weekAgo) recent++;
          }
          if (it.confirmed !== undefined) {
            if (!ISO.test(it.confirmed) || Number.isNaN(Date.parse(it.confirmed))) err("profile", `${at} confirmed must be a date YYYY-MM-DD`);
            if (it.status !== "confirmed") err("profile", `${at} has a confirmed date but isn't confirmed`);
          }
        }
        if (recent > 3) warn("profile", `${recent} proposed person items were noted in the last 7 days; at most 3 a week`);
      }
      if (PER && PER.card !== undefined) {
        if (typeof PER.card !== "string") err("profile", "person card must be text");
        else {
          const n = PER.card.trim().split(/\s+/).filter(Boolean).length;
          if (n > 150) err("profile", `person card is ${n} words; keep it to 150 or fewer`);
          if (DIAG.test(PER.card)) err("profile", "person card sounds like a diagnosis: say what he said or what shows in his work");
          if (DASH.test(PER.card)) warn("profile", "person card has an en or em dash");
        }
      }
      // words: the "About you" cloud. Single words, estimates labelled, a rejected word stays on the list so it never comes back.
      if (PER && PER.words !== undefined) {
        if (!Array.isArray(PER.words)) err("profile", "person words must be a list");
        else {
          if (PER.words.length > 60) err("profile", `person has ${PER.words.length} words; keep it to 60 or fewer`);
          uniq("profile", PER.words.map((x) => x.id), "person word");
          const seen = new Set();
          for (const w of PER.words) {
            const at = `person word ${w && w.id}`;
            if (!w || typeof w !== "object") { err("profile", "a person word isn't an object"); continue; }
            if (!/^W-w\d{2,3}$/.test(w.id || "")) err("profile", `${at} id must look like W-w01`);
            if (typeof w.word !== "string" || !w.word.trim()) err("profile", `${at} needs a word`);
            else {
              if (/\s/.test(w.word)) err("profile", `${at} must be one word, no spaces`);
              if (w.word.length > 24) err("profile", `${at} is ${w.word.length} characters; keep it to 24 or fewer`);
              if (DIAG.test(w.word)) err("profile", `${at} sounds like a diagnosis: use a word he said or that shows in his work`);
              if (DASH.test(w.word)) warn("profile", `${at} has an en or em dash (use a hyphen)`);
              const k = w.word.toLowerCase();
              if (seen.has(k)) err("profile", `person word "${w.word}" appears twice`);
              seen.add(k);
            }
            if (!Number.isInteger(w.weight) || w.weight < 1 || w.weight > 5) err("profile", `${at} weight must be a whole number from 1 to 5`);
            if (!AREAS.includes(w.area)) err("profile", `${at} area must be one of ${AREAS.join(", ")}`);
            if (!Object.prototype.hasOwnProperty.call(PSRC, w.source)) err("profile", `${at} source must be estimate, observed or you_said`);
            if (typeof w.confidence !== "number" || !(w.confidence >= 0 && w.confidence <= 1)) err("profile", `${at} confidence must be a number from 0 to 1`);
            else if (PSRC[w.source] !== undefined && w.confidence > PSRC[w.source]) err("profile", `${at} confidence ${w.confidence} is over the ${PSRC[w.source]} cap for ${w.source}`);
            if (w.area === "worry" && w.source !== "you_said" && PSRC[w.source] !== undefined) err("profile", `${at} is a worry from ${w.source}: a worry is only stored if the person said it (source you_said)`);
            if (!["proposed", "confirmed", "rejected"].includes(w.status)) err("profile", `${at} status must be proposed, confirmed or rejected`);
            if (w.private !== undefined && typeof w.private !== "boolean") err("profile", `${at} private must be true or false`);
            if (w.why !== undefined) {
              if (typeof w.why !== "string") err("profile", `${at} why must be text`);
              else {
                if (w.why.length > 140) err("profile", `${at} why is ${w.why.length} characters; keep it to 140 or fewer`);
                if (DIAG.test(w.why)) err("profile", `${at} why sounds like a diagnosis: say what he said or what shows in his work`);
                if (DASH.test(w.why)) warn("profile", `${at} why has an en or em dash`);
              }
            }
          }
        }
      }
      if (PER && PER.reviewed !== undefined && !ISO.test(PER.reviewed)) err("profile", "person reviewed must be a date YYYY-MM-DD");
    }

    // tests
    for (const t of d.tests.tests) {
      if (!comps.has(t.competency)) err("tests", `${t.id} competency isn't in the rubric`);
      if (!t.questions?.length) err("tests", `${t.id} has no questions`);
      (t.questions || []).forEach((q, i) => copy("tests", `${t.id}.q${i + 1}`, q.q));
      if (t.status === "scored") {
        if (typeof t.score !== "number") err("tests", `${t.id} is scored without a score`);
        if (!t.feedback) err("tests", `${t.id} is scored without feedback`);
        if (t.notes && t.notes.length !== t.questions.length) warn("tests", `${t.id} notes should match the number of questions`);
      }
    }

    // learning
    for (const b of d.learning.briefs) {
      if (!b.sources?.length) err("learning", `${b.id} has no sources`);
      for (const s of b.sources || []) if (!/^https?:\/\//.test(s.url)) err("learning", `${b.id} source "${s.title}" has no real URL`);
      [b.title, b.summary, ...(b.points || [])].forEach((x) => copy("learning", b.id, x));
    }

    // proof, not now, bets
    for (const p of d.proof.items) {
      if (!["missing", "draft", "done", "verified"].includes(p.status)) err("proof", `${p.id} status is invalid`);
      for (const k of ["cv", "interview"]) if (p[k] !== undefined && typeof p[k] !== "number") err("proof", `${p.id}.${k} must be a number`);
      if (!p.why) warn("proof", `${p.id} has no why; Getting hired can't explain it`);
      [p.name, p.why, p.unlocks].forEach((x) => copy("proof", p.id, x));
    }
    for (const n of d.notnow.items) { copy("notnow", n.what, n.what); copy("notnow", n.what, n.why); if (!n.revisit) warn("notnow", `"${n.what}" has no revisit`); }
    const taskIds = new Set(w.tasks.map((t) => t.id));
    for (const b of d.bets.bets) for (const id of b.tasks || []) if (!taskIds.has(id)) warn("bets", `${b.id} points at task ${id}, which isn't in this week`);

    // Provenance (all optional): because ids must exist, as_of must be a date, reviewed_by must be a known shape.
    const knownIds = new Set([
      ...comps,
      ...d.evidence.entries.map((x) => x.id),
      ...w.tasks.map((x) => x.id),
      ...(d.library.gaps || []).map((x) => x.id),
      ...(d.library.picks || []).map((x) => x.id),
      ...(d.library.trinkets || []).map((x) => x && x.id),
      ...d.proof.items.map((x) => x.id),
      ...d.bets.bets.map((x) => x.id),
      ...(d.profile.intake || []).map((x) => x.id),
      ...d.queue.items.map((x) => x.id),
      ...((d.tests && d.tests.tests) || []).map((x) => x.id),
      ...((d.learning && d.learning.briefs) || []).map((x) => x.id),
      ...(((d.profile.person || {}).items) || []).map((x) => x && x.id),
      ...(((d.profile.person || {}).words) || []).map((x) => x && x.id),
    ].filter(Boolean));
    const REVIEWER = /^(dev|claude|person:.+|market:.+)$/;
    function prov(f, at, o) {
      if (!o || typeof o !== "object") return;
      if (o.because !== undefined) {
        if (!Array.isArray(o.because) || o.because.some((x) => typeof x !== "string")) err(f, `${at}.because must be a list of ids`);
        else for (const id of o.because) if (!knownIds.has(id)) err(f, `${at}.because cites ${id}, which doesn't exist`);
      }
      if (o.as_of !== undefined && !ISO.test(o.as_of)) warn(f, `${at}.as_of should be YYYY-MM-DD`);
      if (o.reviewed_by !== undefined && !REVIEWER.test(String(o.reviewed_by))) warn(f, `${at}.reviewed_by should be dev, claude, person:<name> or market:<source>`);
    }
    for (const id of comps) prov("skills", `rating ${id}`, d.skills.ratings[id]);
    for (const t of w.tasks) prov("week", `task ${t.id}`, t);
    for (const g of d.library.gaps || []) prov("library", `gap ${g.id}`, g);
    for (const p of d.library.picks || []) prov("library", `pick ${p.id}`, p);
    for (const p of d.proof.items) prov("proof", p.id, p);
    for (const b of d.bets.bets) prov("bets", b.id, b);
    for (const x of (d.profile.person && d.profile.person.words) || []) prov("profile", `word ${x && x.id}`, x);
    for (const x of (d.profile.person && d.profile.person.items) || []) prov("profile", `person item ${x && x.id}`, x);
    for (const [f, k, o] of [["library", "forecast", d.library.forecast], ["profile", "ready_by", d.profile.ready_by]]) {
      if (o === undefined || o === null) continue;
      prov(f, k, o);
      if (o.status !== undefined && !["on_track", "late", "unknown"].includes(o.status)) err(f, `${k}.status must be on_track, late or unknown`);
      if (o.range !== undefined && !(o.range && ISO.test(o.range.earliest || "") && ISO.test(o.range.likely || "") && ISO.test(o.range.latest || ""))) warn(f, `${k}.range needs earliest, likely and latest as YYYY-MM-DD`);
    }

  } catch (e) {
    err("data", `a value has the wrong shape (${e instanceof Error ? e.message : String(e)})`);
  }
  // Plan engine files: all optional. Absent is valid. Errors only for dangling ids and malformed shapes.
  try { planRules(d, err, warn); } catch (e) { err("data", `a plan engine file has the wrong shape (${e instanceof Error ? e.message : String(e)})`); }
  // Onboarding files: all optional. Absent is valid.
  try { onboardingRules(d, err, warn); } catch (e) { err("data", `an onboarding file has the wrong shape (${e instanceof Error ? e.message : String(e)})`); }
  // Domain graph: all optional and additive. An old profile with no profile.domain validates unchanged.
  try { domainRules(d, err, warn); } catch (e) { err("data", `a domain graph field has the wrong shape (${e instanceof Error ? e.message : String(e)})`); }
  // Career (CV versions and case studies): optional. Absent is valid.
  try { careerRules(d, err); } catch (e) { err("career", `the file has the wrong shape (${e instanceof Error ? e.message : String(e)})`); }
  return { errors, warnings };
}

/**
 * Validates, but lets the app keep running when only plan engine files are at fault AND leaving them out makes the rest valid.
 * Otherwise it returns the first-pass errors untouched, so the message names the real culprit and not a file that only points at it.
 * Returns { errors, dropped, data } where data is the object to use (without the dropped files).
 */
export function validateTolerant(d) {
  const errors = validate(d).errors;
  const inOptional = (e) => OPTIONAL_FILES.some((f) => e.startsWith(`${f}:`));
  if (!errors.length || !errors.every(inOptional)) return { errors, dropped: [], data: d };
  const dropped = OPTIONAL_FILES.filter((f) => errors.some((e) => e.startsWith(`${f}:`)));
  const trial = { ...d };
  for (const f of dropped) delete trial[f];
  if (validate(trial).errors.length) return { errors, dropped: [], data: d };
  return { errors: [], dropped, data: trial };
}

const WORDS = (s) => (typeof s === "string" ? s.trim().split(/\s+/).filter(Boolean).length : 0);
const TIER_CAP = { 1: 0.9, 2: 0.75, 3: 0.55, 4: 0.35 };

/** Rules for demands, plan, research, sources, runs and reviews. Pure: no node built-ins, no clock beyond Date. */
function planRules(d, err, warn) {
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const has = (f) => d[f] !== undefined && d[f] !== null;
  const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
  const today = new Date().toLocaleDateString("en-CA");
  const days = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 864e5);
  const dashCopy = (f, where, text) => { if (typeof text === "string" && /[–—]/.test(text)) err(f, `${where}: has an en or em dash (use a hyphen or words): "${text.slice(0, 60)}"`); };
  const uniq = (f, ids, what) => { const seen = new Set(); for (const id of ids) { if (seen.has(id)) err(f, `duplicate ${what} id ${id}`); seen.add(id); } };
  const list = (f, key) => {
    if (!has(f)) return null;
    if (!isObj(d[f])) { err(f, "must be an object"); return null; }
    if (!Array.isArray(d[f][key])) { err(f, `${key} must be a list`); return null; }
    return d[f][key];
  };

  const demands = list("demands", "items");
  const research = list("research", "items");
  const topics = list("sources", "topics");
  const runs = list("runs", "runs");
  const reviews = list("reviews", "reviews");
  const demandIds = new Set((demands || []).map((x) => x && x.id));
  const researchById = Object.fromEntries((research || []).filter(isObj).map((x) => [x.id, x]));
  const gaps = (d.library && d.library.gaps) || [];
  const gapIds = new Set(gaps.map((g) => g.id));
  let planTasks = {};
  if (has("plan")) {
    if (!isObj(d.plan)) err("plan", "must be an object");
    else if (!isObj(d.plan.tasks)) err("plan", "tasks must be an object keyed by task id");
    else planTasks = d.plan.tasks;
  }
  const taskIds = new Set(Object.keys(planTasks));
  const runIds = new Set((runs || []).filter(isObj).map((r) => r.id));

  // demands
  if (demands) {
    uniq("demands", demands.map((x) => x && x.id), "demand");
    if (has("demands") && d.demands.source_hash !== undefined && typeof d.demands.source_hash !== "string") err("demands", "source_hash must be text");
    for (const x of demands) {
      if (!isObj(x) || typeof x.id !== "string" || !x.id) { err("demands", "an item has no id"); continue; }
      if (!["target", "constraint", "principle", "ladder", "reach", "recognition"].includes(x.kind)) err("demands", `${x.id} kind is invalid`);
      if (typeof x.text !== "string" || !x.text.trim()) err("demands", `${x.id} has no text`);
      if (typeof x.from !== "string" || !x.from.trim()) err("demands", `${x.id} has no from (where it was derived)`);
      if (x.hard !== undefined && typeof x.hard !== "boolean") err("demands", `${x.id}.hard must be true or false`);
      if (x.status !== undefined && !["wish_unsourced", "market_range"].includes(x.status)) err("demands", `${x.id}.status must be wish_unsourced or market_range`);
      if (x.status === "wish_unsourced" && x.hard) err("demands", `${x.id} is an unsourced wish and cannot be a hard demand`);
      if (x.id === "D-salary" && x.hard) err("demands", "D-salary is a wish or a market range and is never a hard demand");
      dashCopy("demands", x.id, x.text);
    }
  }

  // research
  if (research) {
    uniq("research", research.map((x) => x && x.id), "research");
    for (const r of research) {
      if (!isObj(r) || typeof r.id !== "string" || !r.id) { err("research", "an item has no id"); continue; }
      const at = r.id;
      if (!isObj(r.subject) || !["task", "gap", "demand", "level", "source_list"].includes(r.subject.type) || typeof r.subject.id !== "string") err("research", `${at}.subject needs a type and id`);
      else {
        const { type, id } = r.subject;
        if (type === "task" && !taskIds.has(id)) err("research", `${at} is about task ${id}, which isn't in the plan`);
        if (type === "gap" && !gapIds.has(id)) err("research", `${at} is about gap ${id}, which doesn't exist`);
        if (type === "demand" && !demandIds.has(id)) err("research", `${at} is about demand ${id}, which doesn't exist`);
      }
      if (typeof r.claim !== "string" || !r.claim.trim()) err("research", `${at} has no claim`);
      if (typeof r.source_url !== "string" || !/^https?:\/\/\S+$/.test(r.source_url)) err("research", `${at}.source_url must be an http or https address`);
      if (typeof r.source_name !== "string" || !r.source_name.trim()) err("research", `${at} has no source_name`);
      if (![1, 2, 3, 4].includes(r.tier)) err("research", `${at}.tier must be 1 to 4`);
      if (!ISO.test(r.retrieved || "")) err("research", `${at}.retrieved must be YYYY-MM-DD`);
      if (r.published !== null && r.published !== undefined && !ISO.test(r.published)) err("research", `${at}.published must be YYYY-MM-DD or null`);
      if (r.published === null || r.published === undefined) { if (r.tier !== undefined && r.tier < 3) warn("research", `${at} has no published date, so its tier is capped at 3`); }
      if (typeof r.confidence !== "number" || r.confidence < 0 || r.confidence > 1) err("research", `${at}.confidence must be 0 to 1`);
      else if (TIER_CAP[r.tier] !== undefined && r.confidence > TIER_CAP[r.tier]) warn("research", `${at}.confidence ${r.confidence} is above the cap ${TIER_CAP[r.tier]} for tier ${r.tier}`);
      if (!(Number.isInteger(r.fresh_days) && r.fresh_days > 0)) err("research", `${at}.fresh_days must be a whole number of days`);
      const vr = r.verified && r.verified.result;
      if (r.verified !== undefined) {
        if (!isObj(r.verified) || !["match", "paraphrase", "mismatch", "unreachable"].includes(vr)) err("research", `${at}.verified.result must be match, paraphrase, mismatch or unreachable`);
        else if (!ISO.test(r.verified.on || "")) err("research", `${at}.verified.on must be YYYY-MM-DD`);
      }
      if (r.excerpt === undefined || r.excerpt === null || r.excerpt === "") { if (vr !== "unreachable") warn("research", `${at} has no excerpt, so it can't be verified`); }
      else if (typeof r.excerpt !== "string") err("research", `${at}.excerpt must be text`);
      else if (WORDS(r.excerpt) > 25) err("research", `${at}.excerpt is ${WORDS(r.excerpt)} words; keep it to 25 or fewer`);
      if (r.conflicts_with !== undefined) {
        if (!Array.isArray(r.conflicts_with)) err("research", `${at}.conflicts_with must be a list`);
        else for (const c of r.conflicts_with) if (!researchById[c]) err("research", `${at}.conflicts_with cites ${c}, which doesn't exist`);
      }
      if (ISO.test(r.retrieved || "") && Number.isInteger(r.fresh_days) && days(r.retrieved, today) > r.fresh_days) warn("research", `${at} is stale: retrieved ${r.retrieved}, fresh for ${r.fresh_days} days`);
      dashCopy("research", `${at}.claim`, r.claim); dashCopy("research", `${at}.supports`, r.supports);
    }
  }

  // sources
  if (topics) {
    for (const t of topics) {
      if (!isObj(t) || typeof t.topic !== "string" || !t.topic.trim()) { err("sources", "a topic has no name"); continue; }
      if (!Array.isArray(t.ranked)) { err("sources", `${t.topic}.ranked must be a list`); continue; }
      if (!(Number.isInteger(t.refresh_days) && t.refresh_days > 0)) err("sources", `${t.topic}.refresh_days must be a whole number of days`);
      uniq("sources", t.ranked.map((x) => x && x.rank), `rank in ${t.topic}`);
      for (const s of t.ranked) {
        if (!isObj(s)) { err("sources", `${t.topic} has an entry that is not an object`); continue; }
        if (typeof s.url !== "string" || !/^https?:\/\/\S+$/.test(s.url)) err("sources", `${t.topic} rank ${s.rank}: url must be http or https`);
        if (![1, 2, 3, 4].includes(s.tier)) err("sources", `${t.topic} rank ${s.rank}: tier must be 1 to 4`);
        if (!ISO.test(s.last_checked || "")) err("sources", `${t.topic} rank ${s.rank}: last_checked must be YYYY-MM-DD`);
        if (typeof s.why_best !== "string" || !s.why_best.trim()) warn("sources", `${t.topic} rank ${s.rank} has no why_best`);
      }
    }
  }

  // runs
  if (runs) {
    uniq("runs", runs.map((r) => r && r.id), "run");
    for (const r of runs) {
      if (!isObj(r) || typeof r.id !== "string" || !r.id) { err("runs", "a run has no id"); continue; }
      if (!["complete", "partial", "aborted"].includes(r.status)) err("runs", `${r.id}.status must be complete, partial or aborted`);
      if (typeof r.command !== "string" || !r.command) err("runs", `${r.id} has no command`);
      if (!ISO.test(String(r.started || "").slice(0, 10))) err("runs", `${r.id}.started must start with YYYY-MM-DD`);
      for (const [k, c] of Object.entries(r.caps || {})) if (!isObj(c) || typeof c.used !== "number" || typeof c.max !== "number") err("runs", `${r.id}.caps.${k} needs used and max`); else if (c.used > c.max) warn("runs", `${r.id}.caps.${k} used ${c.used} of ${c.max}`);
      if (r.status === "partial" && !r.resume_token) warn("runs", `${r.id} is partial but has no resume_token`);
      for (const k of ["updated", "left"]) if (r[k] !== undefined && !Array.isArray(r[k])) err("runs", `${r.id}.${k} must be a list`);
      if (r.verification !== undefined && !(isObj(r.verification) && [r.verification.sampled, r.verification.total, r.verification.matched, r.verification.failed].every((n) => Number.isInteger(n) && n >= 0))) err("runs", `${r.id}.verification needs whole numbers sampled, total, matched, failed`);
    }
  }

  // reviews
  if (reviews) {
    uniq("reviews", reviews.map((r) => r && r.id), "review");
    for (const r of reviews) {
      if (!isObj(r) || typeof r.id !== "string" || !r.id) { err("reviews", "a review has no id"); continue; }
      if (!["week", "plan"].includes(r.scope)) err("reviews", `${r.id}.scope must be week or plan`);
      if (!ISO.test(r.date || "")) err("reviews", `${r.id}.date must be YYYY-MM-DD`);
      if (!Array.isArray(r.items)) { err("reviews", `${r.id}.items must be a list`); continue; }
      for (const it of r.items) {
        if (!isObj(it) || !["matched", "drifted", "unsourced", "outdated", "done"].includes(it.verdict)) err("reviews", `${r.id} has an item with an invalid verdict`);
        else for (const e of it.evidence_ids || []) if (!researchById[e] && !(d.evidence && (d.evidence.entries || []).some((x) => x.id === e))) err("reviews", `${r.id} item ${it.ref} cites ${e}, which doesn't exist`);
      }
      if (r.plan_id !== undefined && has("plan") && r.plan_id !== d.plan.generated_by) warn("reviews", `${r.id}.plan_id ${r.plan_id} isn't the current plan's run`);
    }
  }

  // gap additions (optional): every id must exist
  for (const g of gaps) {
    const at = `gap ${g.id}`;
    const rid = (id, what) => { if (id !== undefined && !researchById[id]) err("library", `${at}.${what} cites ${id}, which isn't in research.json`); };
    for (const id of g.research || []) rid(id, "research");
    for (const m of g.market_evidence || []) rid(m && m.research_id, "market_evidence");
    if (g.level_definition) rid(g.level_definition.from, "level_definition.from");
    if (g.best_source) rid(g.best_source.research_id, "best_source");
    for (const id of g.tasks || []) if (!taskIds.has(id)) err("library", `${at}.tasks cites ${id}, which isn't in the plan`);
    if (g.research_status !== undefined && !["verified", "partly", "unsourced"].includes(g.research_status)) err("library", `${at}.research_status must be verified, partly or unsourced`);
    if (g.rank !== undefined && !(Number.isInteger(g.rank) && g.rank > 0)) err("library", `${at}.rank must be a whole number from 1`);
  }

  // plan
  if (has("plan") && isObj(d.plan) && isObj(d.plan.tasks)) {
    const p = d.plan;
    if (![1, 2, 4].includes(p.horizon_weeks)) err("plan", "horizon_weeks must be 1, 2 or 4");
    if (!["draft", "active", "in_review", "closed"].includes(p.status)) err("plan", "status must be draft, active, in_review or closed");
    if (!ISO.test(p.starts || "") || !ISO.test(p.ends || "")) err("plan", "starts and ends must be YYYY-MM-DD");
    if (!Array.isArray(p.weeks)) err("plan", "weeks must be a list");
    else {
      if (p.status === "active" && [1, 2, 4].includes(p.horizon_weeks) && p.weeks.length !== p.horizon_weeks) warn("plan", `weeks has ${p.weeks.length} entries but horizon_weeks is ${p.horizon_weeks}`);
      uniq("plan", p.weeks.map((w) => w && w.n), "week number");
      for (const w of p.weeks) {
        if (!isObj(w) || !Number.isInteger(w.n) || w.n < 1) { err("plan", "a week has no number n"); continue; }
        if (!ISO.test(w.week_of || "") || new Date(`${w.week_of}T00:00:00Z`).getUTCDay() !== 1) err("plan", `week ${w.n}.week_of must be a Monday as YYYY-MM-DD`);
        if (!["upcoming", "current", "done", "slipped", "carried"].includes(w.status)) err("plan", `week ${w.n}.status is invalid`);
        if (!Array.isArray(w.tasks)) err("plan", `week ${w.n}.tasks must be a list`);
        else for (const id of w.tasks) if (!taskIds.has(id)) err("plan", `week ${w.n} lists task ${id}, which isn't in plan.tasks`);
        if (!isObj(w.load) || typeof w.load.planned_min !== "number" || typeof w.load.capacity_min !== "number") err("plan", `week ${w.n}.load needs planned_min and capacity_min`);
        dashCopy("plan", `week ${w.n}.goal`, w.goal);
      }
    }
    if (p.generated_by !== undefined && runs && !runIds.has(p.generated_by)) warn("plan", `generated_by ${p.generated_by} isn't in runs.json`);
    if (p.forecast !== undefined) {
      const f = p.forecast;
      if (!isObj(f) || !(f.ready_by === null || ISO.test(f.ready_by || ""))) err("plan", "forecast.ready_by must be YYYY-MM-DD or null");
      else if (f.ready_by === null && !f.reason) warn("plan", "forecast has no date and no reason");
      if (isObj(f) && f.reproduce && typeof f.reproduce.inputs_hash !== "string") err("plan", "forecast.reproduce.inputs_hash must be text");
    }
    const perDay = {};
    const slot = {};
    for (const [id, t] of Object.entries(p.tasks)) {
      const at = `task ${id}`;
      if (!isObj(t)) { err("plan", `${at} must be an object`); continue; }
      for (const k of ["task"]) if (typeof t[k] !== "string" || !t[k].trim()) err("plan", `${at} is missing ${k}`);
      if (!["skill", "reach"].includes(t.track)) err("plan", `${at} track must be skill or reach`);
      if (typeof t.minutes !== "number" || !(t.minutes > 0)) err("plan", `${at} minutes must be a number above 0`);
      else if (t.minutes < 15 || t.minutes > 60) warn("plan", `${at} is ${t.minutes} min; plan tasks are 15 to 60`);
      if (t.status !== undefined && !["todo", "done", "submitted", "later", "dropped", "carried"].includes(t.status)) err("plan", `${at} status is invalid`);
      if (t.gap !== undefined && !gapIds.has(t.gap)) err("plan", `${at}.gap ${t.gap} doesn't exist`);
      if (t.gap === undefined && t.demand_only !== true) warn("plan", `${at} has no gap and isn't marked demand_only`);
      if (t.demand_only === true && !t.demand_only_reason) warn("plan", `${at} is demand_only with no reason`);
      for (const m of t.meets || []) {
        if (!isObj(m) || typeof m.demand_id !== "string") { err("plan", `${at}.meets has an entry with no demand_id`); continue; }
        if (!demandIds.has(m.demand_id)) err("plan", `${at}.meets cites ${m.demand_id}, which isn't in demands.json`);
        if (WORDS(m.how) > 25) warn("plan", `${at}.meets ${m.demand_id}: how is over 25 words`);
        dashCopy("plan", `${at}.meets.how`, m.how);
      }
      if (!Array.isArray(t.meets) || !t.meets.length) warn("plan", `${at} meets no demand`);
      if (t.research !== undefined && !Array.isArray(t.research)) err("plan", `${at}.research must be a list of ids`);
      for (const rid of Array.isArray(t.research) ? t.research : []) if (!researchById[rid]) err("plan", `${at}.research cites ${rid}, which isn't in research.json`);
      if (t.research_status === undefined) warn("plan", `${at} has no research_status`);
      else if (!["verified", "partly", "unsourced"].includes(t.research_status)) err("plan", `${at}.research_status must be verified, partly or unsourced`);
      else if (t.research_status === "verified") {
        const rs = (t.research || []).map((x) => researchById[x]).filter(Boolean);
        const matched = rs.filter((x) => x.verified && x.verified.result === "match");
        if (matched.length < 2 || !matched.some((x) => x.tier <= 2)) warn("plan", `${at} is marked verified but has ${matched.length} matched claim(s) and ${matched.some((x) => x.tier <= 2) ? "a" : "no"} tier 1 or 2 source`);
      }
      dashCopy("plan", `${at}.task`, t.task); dashCopy("plan", `${at}.why`, t.why);
      const pl = t.placement;
      if (pl !== undefined) {
        if (!isObj(pl)) { err("plan", `${at}.placement must be an object`); continue; }
        if (!Number.isInteger(pl.week) || pl.week < 1) err("plan", `${at}.placement.week must be a whole number from 1`);
        if (!DAYS.includes(pl.day)) err("plan", `${at}.placement.day must be Mon to Sat`);
        if (!Number.isInteger(pl.order) || pl.order < 1) err("plan", `${at}.placement.order must be a whole number from 1`);
        const key = `${pl.week}|${pl.day}`;
        const sk = `${key}|${pl.order}`;
        if (slot[sk]) err("plan", `${at} and ${slot[sk]} share week ${pl.week} ${pl.day} order ${pl.order}`);
        slot[sk] = id;
        (perDay[key] ||= []).push({ id, minutes: typeof t.minutes === "number" ? t.minutes : 0 });
        if (!Array.isArray(pl.depends_on)) err("plan", `${at}.placement.depends_on must be a list`);
        else for (const dep of pl.depends_on) if (!taskIds.has(dep)) err("plan", `${at}.placement.depends_on cites ${dep}, which isn't in plan.tasks`);
        if (typeof pl.placed_because !== "string" || !pl.placed_because.trim()) warn("plan", `${at} has no placed_because`);
        dashCopy("plan", `${at}.placed_because`, pl.placed_because);
      } else if (p.status === "active") warn("plan", `${at} has no placement`);
    }
    for (const [key, rows] of Object.entries(perDay)) {
      const min = rows.reduce((a, r) => a + r.minutes, 0);
      if (min > 60) warn("plan", `week ${key.replace("|", " ")} holds ${min} min; the ceiling is 60`);
      if (rows.length > 2) warn("plan", `week ${key.replace("|", " ")} holds ${rows.length} tasks; the ceiling is 2`);
    }
    // dependency cycles
    const state = {};
    const visit = (id, trail) => {
      if (state[id] === 2) return;
      if (state[id] === 1) { err("plan", `dependency cycle: ${[...trail, id].join(" -> ")}`); return; }
      state[id] = 1;
      const deps = (planTasks[id] && planTasks[id].placement && Array.isArray(planTasks[id].placement.depends_on)) ? planTasks[id].placement.depends_on : [];
      for (const dep of deps) if (taskIds.has(dep)) visit(dep, [...trail, id]);
      state[id] = 2;
    };
    for (const id of taskIds) visit(id, []);
  }
}

/** Rules for onboarding.json, unknowns.json and prior.json. All optional: absent is valid. */
/**
 * Domain graph rules (handoff-docs/specs/domain-wiring-todo.md section 5). Nothing here requires a domain field: a profile with no
 * profile.domain, a rubric with no maps_to and a gap with no domain_competency all validate exactly as before.
 */
function domainRules(d, err, warn) {
  const LEVELS = ["J", "M", "S", "L", "H"];
  const dash = (where, t) => { if (typeof t === "string" && /[–—]/.test(t)) err("profile", `${where}: has an en or em dash (use a hyphen or words): "${t.slice(0, 60)}"`); };
  const dom = d.profile && d.profile.domain;
  // the business overlay (target setting business) adds six competencies and two blockers to the gap; they are not in the 26
  const OVER = DOMAIN_REF.business_overlay || { competencies: [], blockers: [] };
  const compIds = new Set([...DOMAIN_REF.competency_order, ...OVER.competencies.map((c) => c.id)]);
  const overlayKinds = new Set(OVER.blockers.map((b) => b.kind));
  const roleOf = (id) => DOMAIN_REF.roles.find((r) => r.id === id);
  if (dom !== undefined && dom !== null) {
    if (typeof dom !== "object" || Array.isArray(dom)) { err("profile", "profile.domain must be an object"); return; }
    if (dom.family_now !== undefined && !["D", "P", "M", "H", "O"].includes(dom.family_now)) err("profile", `profile.domain.family_now must be D, P, M, H or O, not "${dom.family_now}"`);
    if (dom.role_now !== undefined) {
      const r = roleOf(dom.role_now);
      if (!r) err("profile", `profile.domain.role_now "${dom.role_now}" is not a role in the domain reference`);
      else if (r.status === "planned") warn("profile", `profile.domain.role_now "${dom.role_now}" is a planned role: no vector, the gap cannot be computed`);
    }
    if (dom.level_now !== undefined) {
      if (!LEVELS.includes(dom.level_now)) err("profile", `profile.domain.level_now must be one of ${LEVELS.join(", ")}`);
      else { const r = roleOf(dom.role_now); if (r && r.ladder && r.ladder[dom.level_now] === null) err("profile", `profile.domain.level_now ${dom.level_now} is not a step on the ${r.name} ladder`); }
    }
    if (dom.target_setting !== undefined && !["employee", "business"].includes(dom.target_setting)) err("profile", "profile.domain.target_setting must be employee or business");
    if (dom.target_level !== undefined && !LEVELS.includes(dom.target_level)) err("profile", `profile.domain.target_level must be one of ${LEVELS.join(", ")}`);
    for (const k of ["target_words", "second_words"]) dash(`profile.domain.${k}`, dom[k]);
    if (dom.gap_preview !== undefined && (typeof dom.gap_preview !== "object" || dom.gap_preview === null || dom.gap_preview.label !== "model estimate")) err("profile", "profile.domain.gap_preview must be an object labelled model estimate");
    if (dom.same_industry !== undefined && typeof dom.same_industry !== "boolean") err("profile", "profile.domain.same_industry must be true or false");
    if (dom.targets !== undefined) {
      if (!Array.isArray(dom.targets)) err("profile", "profile.domain.targets must be a list");
      else {
        let primaries = 0;
        dom.targets.forEach((t, i) => {
          const at = `profile.domain.targets[${i}]`;
          if (!t || typeof t !== "object") { err("profile", `${at} must be an object`); return; }
          const r = roleOf(t.role);
          if (!r) err("profile", `${at}.role "${t.role}" is not a role in the domain reference`);
          else if (r.status === "planned") warn("profile", `${at}: planned role ${t.role}: no vector, the gap cannot be computed`);
          if (!LEVELS.includes(t.level)) err("profile", `${at}.level must be one of ${LEVELS.join(", ")}`);
          else if (r && r.ladder && r.ladder[t.level] === null) err("profile", `${at}.level ${t.level} is not a step on the ${r.name} ladder`);
          if (!["primary", "optional", "bridge"].includes(t.kind)) err("profile", `${at}.kind must be primary, optional or bridge`);
          if (t.kind === "primary") primaries += 1;
          if (typeof t.weight !== "number" || t.weight < 0 || t.weight > 1) err("profile", `${at}.weight must be a number from 0 to 1`);
          if (t.sequential !== undefined && typeof t.sequential !== "boolean") err("profile", `${at}.sequential must be true or false`);
        });
        if (primaries > 1) err("profile", "profile.domain.targets has more than one primary target");
      }
    }
    const ev = dom.evidence;
    if (ev !== undefined && ev !== null) {
      for (const k of ["case_studies", "placements", "people_managed"]) {
        if (ev[k] !== undefined && ev[k] !== null && !(Number.isInteger(ev[k]) && ev[k] >= 0)) err("profile", `profile.domain.evidence.${k} must be a whole number of 0 or more, or null`);
      }
      if (ev.measure_level !== undefined && ev.measure_level !== null && !["outputs", "out-takes", "outcomes", "impact", "not measured"].includes(ev.measure_level)) err("profile", "profile.domain.evidence.measure_level must be outputs, out-takes, outcomes, impact or not measured");
      for (const [k, v] of Object.entries(ev)) if (typeof v === "string") dash(`profile.domain.evidence.${k}`, v);
    }
    if (dom.blockers !== undefined) {
      if (!Array.isArray(dom.blockers)) err("profile", "profile.domain.blockers must be a list of proof kind ids");
      else for (const b of dom.blockers) if (!DOMAIN_REF.proof_kinds[b]) err("profile", `profile.domain.blockers "${b}" is not a proof kind`);
    }
    if (dom.calibration) {
      const cells = (dom.calibration && dom.calibration.cells) || {};
      for (const [k, v] of Object.entries(cells)) {
        if (!compIds.has(k)) err("profile", `profile.domain.calibration.cells "${k}" is not a competency id`);
        if (typeof v !== "number" || v < 0 || v > 4) err("profile", `profile.domain.calibration.cells.${k} must be 0 to 4`);
      }
      const known = new Set((((d.research || {}).items) || []).map((x) => x.id));
      for (const rid of dom.calibration.research_ids || []) if (!known.has(rid)) warn("profile", `profile.domain.calibration cites research ${rid}, which is not in research.json`);
    }
    for (const k of ["shared_first", "reviewer", "proof_project"]) dash(`profile.domain.${k}`, dom[k]);
    if (dom.role_mapped !== undefined && (typeof dom.role_mapped !== "object" || dom.role_mapped === null)) err("profile", "profile.domain.role_mapped must be an object");
  }
  for (const g of (d.library && d.library.gaps) || []) {
    if (g.domain_competency !== undefined && !compIds.has(g.domain_competency)) err("library", `gap ${g.id} domain_competency "${g.domain_competency}" is not a competency id of the domain reference`);
    if (g.transfer_w !== undefined && !(typeof g.transfer_w === "number" && g.transfer_w >= 0 && g.transfer_w <= 1)) err("library", `gap ${g.id} transfer_w must be a number from 0 to 1`);
    if (g.proof_blocker !== undefined && g.proof_blocker !== null && !DOMAIN_REF.proof_kinds[g.proof_blocker] && !overlayKinds.has(g.proof_blocker)) err("library", `gap ${g.id} proof_blocker "${g.proof_blocker}" is not a proof kind`);
  }
  const rb = d.rubric;
  if (rb && Array.isArray(rb.competencies)) {
    for (const c of rb.competencies) {
      if (c.maps_to === undefined) continue;
      if (!Array.isArray(c.maps_to)) { err("rubric", `competency ${c.id} maps_to must be a list`); continue; }
      for (const m of c.maps_to) {
        if (!m || !compIds.has(m.domain_id)) err("rubric", `competency ${c.id} maps_to "${m && m.domain_id}" is not a competency id of the domain reference`);
        if (!m || typeof m.factor !== "number" || m.factor < 0 || m.factor > 1) err("rubric", `competency ${c.id} maps_to factor must be 0 to 1`);
      }
    }
  }
}

function onboardingRules(d, err, warn) {
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
  const has = (f) => d[f] !== undefined && d[f] !== null;
  const ROUNDS = ["R0", "R1", "R2", "R3", "R4", "R5"];
  const dash = (f, where, t) => { if (typeof t === "string" && /[–—]/.test(t)) err(f, `${where}: has an en or em dash (use a hyphen or words): "${t.slice(0, 60)}"`); };
  const num01 = (x) => typeof x === "number" && x >= 0 && x <= 1;

  if (has("onboarding")) {
    const o = d.onboarding;
    if (!isObj(o)) err("onboarding", "must be an object");
    else {
      if (o.version !== 1) err("onboarding", "version must be 1");
      if (!["not_started", "in_progress", "paused", "complete"].includes(o.status)) err("onboarding", "status must be not_started, in_progress, paused or complete");
      if (!ROUNDS.includes(o.round)) err("onboarding", "round must be R0 to R5");
      if (!isObj(o.answers)) err("onboarding", "answers must be an object keyed by question id");
      if (!isObj(o.skipped)) err("onboarding", "skipped must be an object keyed by question id");
      if (o.started !== undefined && !ISO.test(String(o.started).slice(0, 10))) err("onboarding", "started must start with YYYY-MM-DD");
      if (o.consent !== undefined) {
        if (!isObj(o.consent)) err("onboarding", "consent must be an object");
        else for (const [r, v] of Object.entries(o.consent)) {
          if (!ROUNDS.includes(r)) err("onboarding", `consent has an unknown round ${r}`);
          else if (v !== null && !ISO.test(String(v))) err("onboarding", `consent.${r} must be YYYY-MM-DD or null`);
        }
      }
      if (o.tone !== undefined && !["straight", "straight_checkins", "slower"].includes(o.tone)) err("onboarding", "tone must be straight, straight_checkins or slower");
      if (o.off_limits !== undefined && !(Array.isArray(o.off_limits) && o.off_limits.every((x) => typeof x === "string"))) err("onboarding", "off_limits must be a list of text");
      if (o.last_asked !== undefined && o.last_asked !== null && !resolveQuestion(String(o.last_asked))) err("onboarding", `last_asked ${o.last_asked} is not a question id`);
      if (o.sitting !== undefined) {
        const s = o.sitting;
        if (!isObj(s) || !Number.isInteger(s.n) || s.n < 1 || typeof s.asked !== "number" || s.asked < 0 || typeof s.max !== "number" || s.max <= 0) err("onboarding", "sitting needs n, asked and max as numbers");
      }
      if (isObj(o.answers)) {
        for (const [id, a] of Object.entries(o.answers)) {
          const at = `answer ${id}`;
          if (!resolveQuestion(id)) { err("onboarding", `${at}: not a question id in the bank`); continue; }
          if (!isObj(a)) { err("onboarding", `${at} must be an object`); continue; }
          if (!ROUNDS.includes(a.round)) err("onboarding", `${at}.round must be R0 to R5`);
          if (!["answered", "unknown", "superseded", "off_limits"].includes(a.status)) err("onboarding", `${at}.status is invalid`);
          if (!num01(a.confidence)) err("onboarding", `${at}.confidence must be 0 to 1`);
          if (a.source !== "self") err("onboarding", `${at}.source must be self`);
          if (!Array.isArray(a.evidence) || a.evidence.some((x) => typeof x !== "string")) err("onboarding", `${at}.evidence must be a list of text`);
          else if (a.source === "self" && !a.evidence.length && num01(a.confidence) && a.confidence > 0.5 + 1e-9) err("onboarding", `${at}: a self report with no artifact cannot be above 0.5 confidence`);
          if (typeof a.confirmed !== "boolean") err("onboarding", `${at}.confirmed must be true or false`);
          if (!ISO.test(a.asked || "")) err("onboarding", `${at}.asked must be YYYY-MM-DD`);
          if (a.status === "answered" && !ISO.test(a.answered || "")) err("onboarding", `${at} is answered without a date`);
          if (/^R3-/.test(id) && a.private !== true) err("onboarding", `${at}: Round 3 answers must be private: true`);
          dash("onboarding", `${at}.echo`, a.echo);
        }
      }
      if (isObj(o.skipped)) {
        for (const [id, s] of Object.entries(o.skipped)) {
          if (!resolveQuestion(id)) { err("onboarding", `skipped ${id}: not a question id in the bank`); continue; }
          if (!isObj(s) || !ISO.test(s.when || "")) err("onboarding", `skipped ${id} needs when as YYYY-MM-DD`);
          else if (typeof s.consequence !== "string" || !s.consequence.trim()) err("onboarding", `skipped ${id} has no consequence (say what the skip leaves unknown)`);
          else dash("onboarding", `skipped ${id}.consequence`, s.consequence);
        }
      }
      // Ids are C-0N (legacy) or C-0N:A~B, unique per pair, so a decision always lands on the one contradiction it is about.
      const cseen = new Set();
      for (const c of o.contradictions || []) {
        if (!isObj(c) || !/^C-0[1-9](:[A-Za-z0-9._-]+(~[A-Za-z0-9._-]+)*)?$/.test(c.id || "")) { err("onboarding", "a contradiction needs an id C-01 to C-09, or C-0N:A~B naming the pair"); continue; }
        const ckey = `${c.id}|${Array.isArray(c.between) ? [...c.between].sort().join(",") : ""}`;
        if (cseen.has(ckey)) err("onboarding", `duplicate contradiction ${c.id}`);
        cseen.add(ckey);
        if (!Array.isArray(c.between) || !c.between.length) err("onboarding", `${c.id} needs between`);
        if (!["open", "resolved", "accepted_by_dev"].includes(c.status)) err("onboarding", `${c.id}.status is invalid`);
        if (c.severity !== undefined && !["note", "block"].includes(c.severity)) err("onboarding", `${c.id}.severity must be note or block`);
        if (c.fixable_only === true && c.status === "accepted_by_dev") err("onboarding", `${c.id} cannot be accepted: an answer has to change`);
        dash("onboarding", `${c.id}.detail`, c.detail);
      }
      for (const [r, s] of Object.entries(o.round_summaries || {})) {
        if (!ROUNDS.includes(r)) err("onboarding", `round_summaries has an unknown round ${r}`);
        else if (isObj(s)) { dash("onboarding", `round_summaries.${r}.text`, s.text); if (s.quote !== undefined && (typeof s.quote !== "string" || s.quote.length > 80)) err("onboarding", `round_summaries.${r}.quote must be his words, 80 characters or fewer`); }
      }
      for (const [r, q] of Object.entries(o.consent_quotes || {})) {
        if (!ROUNDS.includes(r)) err("onboarding", `consent_quotes has an unknown round ${r}`);
        else if (!isObj(q) || typeof q.quote !== "string" || !q.quote.trim() || q.quote.length > 80 || !["yes", "no"].includes(q.answer)) err("onboarding", `consent_quotes.${r} needs answer yes or no and his words (80 characters or fewer)`);
      }
      if (o.status === "complete") {
        // A calibration note (severity note) never blocks; anything else open at complete is an error.
        if ((o.contradictions || []).some((c) => c.status === "open" && c.severity !== "note")) err("onboarding", "complete, but a contradiction is still open");
        if (o.round !== "R5") warn("onboarding", "complete, but the round is not R5");
        if (!has("plan") && !(isObj(o.plan_pending) && o.plan_pending.next_command)) warn("onboarding", "complete, but there is no plan.json and no plan_pending with a next_command");
        const tgt = d.profile && d.profile.north_star && d.profile.north_star.salary_inr_per_month;
        const flr = d.profile && d.profile.constraints && d.profile.constraints.salary_floor_inr;
        if (typeof tgt === "number" && typeof flr === "number" && tgt > 0 && flr > 0 && tgt < flr) err("onboarding", "complete, but the salary target is below the stated floor");
        // P1-4: every money field carries its currency. The field names say INR for compatibility; the number is in the
        // person's own currency, so a missing currency would make the pages show an invented figure.
        const pf = (d.profile || {});
        const cur0 = pf.situation && typeof pf.situation.currency === "string" ? pf.situation.currency : "";
        const money = [
          ["north_star.salary_inr_per_month", pf.north_star && pf.north_star.salary_inr_per_month, pf.north_star && pf.north_star.salary_currency],
          ["constraints.salary_floor_inr", pf.constraints && pf.constraints.salary_floor_inr, pf.constraints && pf.constraints.salary_floor_currency],
          ["baseline.salary_now_inr", pf.baseline && pf.baseline.salary_now_inr, pf.baseline && pf.baseline.salary_now_currency],
          ["baseline.salary_range", pf.baseline && pf.baseline.salary_range, pf.baseline && pf.baseline.salary_range_currency],
          ["situation.fixed_costs_monthly", pf.situation && pf.situation.fixed_costs_monthly, pf.situation && pf.situation.fixed_costs_currency],
          ["situation.debt_total", pf.situation && pf.situation.debt_total, pf.situation && pf.situation.debt_currency],
        ];
        for (const [path, val, own] of money) {
          if (val === undefined || val === null || (Array.isArray(val) && !val.length)) continue;
          const code = (typeof own === "string" && own) || cur0;
          if (!/^[A-Za-z]{3}$/.test(code)) err("onboarding", `complete, but profile.${path} holds a money value and no currency (profile.situation.currency, R0-06): the pages would show it in the wrong currency`);
          else if (cur0 && typeof own === "string" && own && own.toUpperCase() !== cur0.toUpperCase()) warn("onboarding", `profile.${path} is in ${own} but profile.situation.currency is ${cur0}`);
        }
      }
    }
  }

  if (has("unknowns")) {
    const u = d.unknowns;
    if (!isObj(u) || !Array.isArray(u.items)) err("unknowns", "must be an object with a list called items");
    else {
      const seen = new Set();
      for (const it of u.items) {
        if (!isObj(it) || !/^U-\d{3,}$/.test(it.id || "")) { err("unknowns", "an item needs an id like U-001"); continue; }
        if (seen.has(it.id)) err("unknowns", `duplicate id ${it.id}`);
        seen.add(it.id);
        const at = it.id;
        if (!resolveQuestion(String(it.question))) err("unknowns", `${at}.question ${it.question} is not a question id`);
        if (!["task", "ask", "research", "observe"].includes(it.how)) err("unknowns", `${at}.how must be task, ask, research or observe`);
        if (!["dev", "claude"].includes(it.owner)) err("unknowns", `${at}.owner must be dev or claude`);
        if (!["open", "answered", "abandoned"].includes(it.status)) err("unknowns", `${at}.status must be open, answered or abandoned`);
        if (!ISO.test(it.due || "")) err("unknowns", `${at}.due must be YYYY-MM-DD`);
        if (typeof it.method !== "string" || !it.method.trim()) err("unknowns", `${at} has no method (how it gets answered)`);
        if (it.status === "abandoned" && !(typeof it.abandoned_reason === "string" && it.abandoned_reason.trim())) err("unknowns", `${at} is abandoned without a reason`);
        if (it.status === "answered" && !it.answered_in) err("unknowns", `${at} is answered without answered_in`);
        if (it.confidence_if_assumed !== undefined && !num01(it.confidence_if_assumed)) err("unknowns", `${at}.confidence_if_assumed must be 0 to 1`);
        for (const k of ["what", "method", "why_it_matters", "assumption"]) dash("unknowns", `${at}.${k}`, it[k]);
        if (it.draft_task) { dash("unknowns", `${at}.draft_task.task`, it.draft_task.task); if (!["learn", "practice", "proof"].includes(it.draft_task.plan_kind)) err("unknowns", `${at}.draft_task.plan_kind is invalid`); }
      }
    }
  }

  if (has("prior")) {
    const p = d.prior;
    if (!isObj(p)) err("prior", "must be an object");
    else {
      if (!ISO.test(String(p.archived || "").slice(0, 10))) err("prior", "archived must start with YYYY-MM-DD");
      if (typeof p.backup !== "string") err("prior", "backup must be text");
      if (typeof p.note !== "string") err("prior", "note must be text");
      if (!isObj(p.confirmed)) err("prior", "confirmed must be an object");
      else for (const [k, v] of Object.entries(p.confirmed)) if (!["still_true", "changed", "unsure"].includes(v)) err("prior", `confirmed.${k} must be still_true, changed or unsure`);
      for (const k of ["evidence", "gaps"]) if (p[k] !== undefined && !Array.isArray(p[k])) err("prior", `${k} must be a list`);
    }
  }
}

/**
 * Rules for career.json (CV versions and case studies). Optional: absent is valid. Pure. Every message starts with "career:" so
 * validateTolerant can leave only this file out. The honesty check (quotes, numbers, deny-list) is separate: lib/career-honesty.mjs.
 */
const CV_KINDS = ["summary", "experience", "skills", "education", "projects", "links", "other"];
const CV_SOURCE_KINDS = ["dossier", "onboarding", "evidence", "dev"];
const CASE_FORMATS = ["decision_log", "six_part", "star", "problem_solution_impact", "before_after_bridge"];
const CASE_STATUS = ["outline", "draft", "ready"];
const CV_FILE = /^cv\/(?:drafts\/[A-Za-z0-9_.-]+\.html|CV\.html)$/;
const CV_PDF = /^cv\/(?:drafts\/[A-Za-z0-9_.-]+\.pdf|CV\.pdf)$/;

function careerRules(d, err) {
  if (d.career === undefined || d.career === null) return;
  const f = (m) => err("career", m);
  const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
  const DASH = /[–—]/;
  const dash = (where, t) => { if (typeof t === "string" && DASH.test(t)) f(`${where}: has an en or em dash (use a hyphen or words): "${t.slice(0, 60)}"`); };
  const str = (where, t, { req = false } = {}) => { if (t === undefined && !req) return; if (typeof t !== "string") { f(`${where} must be text`); return; } if (req && !t.trim()) f(`${where} must not be empty`); dash(where, t); };
  const uniq = (what, ids) => { const seen = new Set(); for (const id of ids) { if (seen.has(id)) f(`duplicate ${what} id ${id}`); seen.add(id); } };
  const sources = (where, a) => {
    if (a === undefined) return;
    if (!Array.isArray(a)) { f(`${where}.sources must be a list`); return; }
    a.forEach((s, i) => {
      if (!isObj(s)) { f(`${where}.sources[${i}] must be an object`); return; }
      if (!CV_SOURCE_KINDS.includes(s.kind)) f(`${where}.sources[${i}].kind must be ${CV_SOURCE_KINDS.join(", ")}`);
      if (typeof s.ref !== "string") f(`${where}.sources[${i}].ref must be text`);
      if (typeof s.quote !== "string" || !s.quote.trim()) f(`${where}.sources[${i}].quote must be a non-empty excerpt`);
    });
  };
  const c = d.career;
  if (!isObj(c)) { f("must be an object"); return; }
  if (c.updated !== undefined && !/^\d{4}-\d{2}-\d{2}/.test(String(c.updated))) f("updated must start with YYYY-MM-DD");
  if (!isObj(c.cv)) { f("cv must be an object"); return; }
  if (!Array.isArray(c.cv.versions)) { f("cv.versions must be a list"); return; }
  if (!Array.isArray(c.cases)) { f("cases must be a list"); return; }
  const vids = c.cv.versions.map((v) => v && v.id);
  uniq("version", vids);
  if (c.cv.current !== null && !vids.includes(c.cv.current)) f(`cv.current ${JSON.stringify(c.cv.current)} is not a version id`);
  for (const v of c.cv.versions) {
    if (!isObj(v)) { f("a version must be an object"); continue; }
    const w = `version ${v.id}`;
    if (typeof v.id !== "string" || !/^v\d+$/.test(v.id)) f(`${w}: id must look like v1, v2`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v.made || ""))) f(`${w}: made must be YYYY-MM-DD`);
    str(`${w}: why`, v.why, { req: true });
    if (v.base !== null && v.base !== undefined && !vids.includes(v.base)) f(`${w}: base ${JSON.stringify(v.base)} is not a version id`);
    if (v.target !== null && v.target !== undefined) {
      if (!isObj(v.target)) f(`${w}: target must be null or an object`);
      else {
        str(`${w}: target.company`, v.target.company, { req: true });
        str(`${w}: target.role`, v.target.role, { req: true });
        if (v.target.post_excerpt !== undefined && typeof v.target.post_excerpt !== "string") f(`${w}: target.post_excerpt must be text`);
        else if (typeof v.target.post_excerpt === "string" && v.target.post_excerpt.length > 300) f(`${w}: target.post_excerpt is over 300 characters`);
      }
    }
    if (typeof v.promoted !== "boolean") f(`${w}: promoted must be true or false`);
    if (typeof v.file !== "string" || !CV_FILE.test(v.file)) f(`${w}: file must be cv/drafts/<name>.html`);
    if (v.pdf !== null && v.pdf !== undefined && (typeof v.pdf !== "string" || !CV_PDF.test(v.pdf))) f(`${w}: pdf must be null or cv/drafts/<name>.pdf`);
    if (!isObj(v.header)) f(`${w}: header must be an object`);
    else {
      for (const k of ["name", "title", "location", "email"]) str(`${w}: header.${k}`, v.header[k]);
      sources(`${w}: header`, v.header.sources);
      if (v.header.links !== undefined && !Array.isArray(v.header.links)) f(`${w}: header.links must be a list`);
      for (const l of v.header.links || []) {
        if (!isObj(l) || typeof l.url !== "string" || !/^https?:\/\//i.test(l.url)) f(`${w}: a header link needs a url starting with http:// or https://`);
        else str(`${w}: header link label`, l.label);
      }
    }
    if (!Array.isArray(v.sections)) { f(`${w}: sections must be a list`); continue; }
    uniq(`${w} section`, v.sections.map((s) => s && s.id));
    for (const sec of v.sections) {
      if (!isObj(sec)) { f(`${w}: a section must be an object`); continue; }
      const sw = `${w} section ${sec.id}`;
      if (typeof sec.id !== "string" || !sec.id) f(`${w}: a section needs an id`);
      if (!CV_KINDS.includes(sec.kind)) f(`${sw}: kind must be ${CV_KINDS.join(", ")}`);
      str(`${sw}: title`, sec.title, { req: true });
      if (!Array.isArray(sec.items)) { f(`${sw}: items must be a list`); continue; }
      uniq(`${sw} item`, sec.items.map((i) => i && i.id));
      for (const it of sec.items) {
        if (!isObj(it)) { f(`${sw}: an item must be an object`); continue; }
        const iw = `${sw} item ${it.id}`;
        if (typeof it.id !== "string" || !it.id) f(`${sw}: an item needs an id`);
        for (const k of ["heading", "sub", "dates"]) str(`${iw}: ${k}`, it[k]);
        if (it.compact !== undefined && typeof it.compact !== "boolean") f(`${iw}: compact must be true or false`);
        sources(iw, it.sources);
        if (!Array.isArray(it.bullets)) { f(`${iw}: bullets must be a list`); continue; }
        uniq(`${iw} bullet`, it.bullets.map((b) => b && b.id));
        for (const b of it.bullets) {
          if (!isObj(b)) { f(`${iw}: a bullet must be an object`); continue; }
          if (typeof b.id !== "string" || !b.id) f(`${iw}: a bullet needs an id`);
          str(`${iw} bullet ${b.id}: text`, b.text, { req: true });
          if (!Array.isArray(b.sources)) f(`${iw} bullet ${b.id}: sources must be a list`);
          else sources(`${iw} bullet ${b.id}`, b.sources);
        }
      }
    }
    const ch = v.checks;
    if (ch !== undefined && ch !== null) {
      if (!isObj(ch)) f(`${w}: checks must be an object`);
      else {
        const hn = ch.honesty;
        if (hn !== undefined && hn !== null) {
          if (!isObj(hn) || typeof hn.pass !== "boolean" || !Array.isArray(hn.unsourced_numbers) || !Array.isArray(hn.deny_hits) || !Number.isInteger(hn.placeholders)) f(`${w}: checks.honesty needs ran, pass, unsourced_numbers, deny_hits and placeholders`);
        }
        const a = ch.ats;
        if (a !== undefined && a !== null) {
          if (!isObj(a)) f(`${w}: checks.ats must be null or an object`);
          else {
            if (typeof a.job !== "string") f(`${w}: checks.ats.job must be text`);
            if (!Array.isArray(a.matched) || !Array.isArray(a.missing)) f(`${w}: checks.ats needs matched and missing lists`);
            if (!Number.isFinite(a.estimate) || a.estimate < 0 || a.estimate > 100) f(`${w}: checks.ats.estimate must be 0 to 100`);
            if (a.label !== "AI estimate") f(`${w}: checks.ats.label must be exactly "AI estimate" (it is never a measured score)`);
          }
        }
      }
    }
  }
  uniq("case", c.cases.map((x) => x && x.id));
  for (const k of c.cases) {
    if (!isObj(k)) { f("a case must be an object"); continue; }
    const w = `case ${k.id}`;
    if (typeof k.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(k.id)) f(`${w}: id must be lower case words joined by hyphens`);
    for (const x of ["one_line", "type", "owned", "team", "audience", "hook"]) str(`${w}: ${x}`, k[x]);
    str(`${w}: title`, k.title, { req: true });
    if (!CASE_FORMATS.includes(k.format)) f(`${w}: format must be ${CASE_FORMATS.join(", ")}`);
    if (!CASE_STATUS.includes(k.status)) f(`${w}: status must be ${CASE_STATUS.join(", ")}`);
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(k.updated || ""))) f(`${w}: updated must start with YYYY-MM-DD`);
    if (!Array.isArray(k.beats)) f(`${w}: beats must be a list`);
    else {
      k.beats.forEach((b, i) => {
        if (!isObj(b)) { f(`${w}: beat ${i + 1} must be an object`); return; }
        str(`${w}: beat ${i + 1} title`, b.title, { req: true });
        str(`${w}: beat ${i + 1} text`, b.text);
        sources(`${w} beat ${i + 1}`, b.sources || []);
        if (b.needs !== undefined && (!Array.isArray(b.needs) || b.needs.some((n) => typeof n !== "string"))) f(`${w}: beat ${i + 1} needs must be a list of text`);
        else for (const n of b.needs || []) dash(`${w}: beat ${i + 1} needs`, n);
      });
    }
    if (!Array.isArray(k.decisions)) f(`${w}: decisions must be a list`);
    else {
      k.decisions.forEach((x, i) => {
        if (!isObj(x)) { f(`${w}: decision ${i + 1} must be an object`); return; }
        for (const y of ["decision", "context", "tradeoffs", "outcome"]) str(`${w}: decision ${i + 1} ${y}`, x[y]);
        if (x.options !== undefined && (!Array.isArray(x.options) || x.options.some((n) => typeof n !== "string"))) f(`${w}: decision ${i + 1} options must be a list of text`);
        else for (const n of x.options || []) dash(`${w}: decision ${i + 1} option`, n);
        sources(`${w} decision ${i + 1}`, x.sources || []);
      });
    }
  }
}

/** Errors for a career object on its own (each starts with "career:"). Used by lib/career.mjs before it runs the honesty check. */
export function careerErrors(career) {
  const errors = [];
  try { careerRules({ career }, (f, m) => errors.push(`${f}: ${m}`)); } catch (e) { errors.push(`career: the shape is wrong (${e instanceof Error ? e.message : String(e)})`); }
  return errors;
}
