/**
 * Help moments: one line, shown once, at the point of need. Wording lives here and nowhere else.
 * Plain data on purpose (no imports) so the app, the fixture and any check can read it.
 * Tokens in copy ({n}, {kinds}, {since}, {say}) are filled by <HelpMoment vars={...}>.
 */
export type HelpKind = "note" | "recipe";

export interface HelpEntry {
  id: string;
  /** Where it appears, for whoever maintains this. */
  where: string;
  /** One or two short lines. Plain second person. */
  copy: string;
  kind: HelpKind;
  /** Points at Claude Code, which lives on a computer. On a phone the line says so instead. */
  needsComputer?: boolean;
  /** Only ever shown on a phone. */
  phoneOnly?: boolean;
}

export const PHONE_LINE = "Claude Code needs your computer. Open it there.";

export const HELP: HelpEntry[] = [
  { id: "handin", where: "A task waiting for Claude's review, after it was handed in", kind: "note", needsComputer: true,
    copy: "Saved as evidence. Say “answer it” in Claude Code to get it reviewed." },
  { id: "recipe-goal", where: "Goal sheet", kind: "recipe", copy: "How changing your goal works" },
  { id: "recipe-intake", where: "Questions Claude asked you, sheet", kind: "recipe", copy: "How your answers get used" },
  { id: "recipe-handin", where: "Hand it in sheet", kind: "recipe", copy: "How handing in works" },
  { id: "attach", where: "Add the link sheet, before attaching", kind: "note",
    copy: "You can attach a PDF, an image or a link. Files are saved on this computer. When Claude reads one, its text goes to Claude." },
  { id: "addon", where: "First time a skill file card is seen", kind: "note", needsComputer: true,
    copy: "Connected. You can now say: “{say}”. The result shows on this page." },
  { id: "pace", where: "Pace control and goal sheet: always visible at the control, not once-only", kind: "note",
    copy: "{label}: ready around {date}{delta}" },
  { id: "phone", where: "End of Tonight and the Commands page, on another device", kind: "note", phoneOnly: true, copy: PHONE_LINE },
  { id: "empty-library", where: "Library, nothing scored yet", kind: "note", needsComputer: true,
    copy: "Say “update my library” in Claude Code. Claude finds and scores picks for you." },
  { id: "empty-tools", where: "Hiring, What your tools say, nothing yet", kind: "note", needsComputer: true,
    copy: "Say “look at my CV” in Claude Code. The score shows here." },
  { id: "empty-cv", where: "Hiring, Your CV, no CV version yet", kind: "note", needsComputer: true,
    copy: "Say “build my CV” in Claude Code. Your CV shows here, with every fact's source." },
  { id: "empty-cases", where: "Hiring, Your case studies, none yet", kind: "note", needsComputer: true,
    copy: "Say “write my case studies” in Claude Code. They show here, one project at a time." },
];

export const HELP_BY_ID: Record<string, HelpEntry> = Object.fromEntries(HELP.map((h) => [h.id, h]));
export const HELP_PREFIX = "growth.help.";

/**
 * "?" help, asked for, never shown by itself. One entry per page (plus a few sheets).
 * Each answers: what is this for, what can I do here, where does Claude come in.
 * Plain data on purpose. The recipe keys match the Where / Give / Then / See lines used at the controls.
 */
export interface AboutEntry {
  title: string;
  /** At most four short lines. */
  lines: string[];
  recipe?: { where: string; give: string; then: string; see: string };
  /** "fit" shows the small picture of how the app and Claude Code work together. */
  diagram?: "fit";
  /** The Once / Each time columns, for the Commands page only. */
  once?: string[];
  each?: string[];
}

export const HELP_ABOUT: Record<string, AboutEntry> = {
  companion: {
    title: "How the app and Claude fit",
    lines: [
      "Claude Code is the only place you talk to Claude. This page lists every command you can type there.",
    ],
    diagram: "fit",
    once: ["Open Claude Code in your Growth folder. The Growth skill works from any folder.", "Add a skill file if you want Claude to gain a new ability."],
    each: ["Do your work here, and hand it in.", "Type a command in Claude Code, such as “answer it”.", "Come back here and the result shows on its page."],
  },
  today: {
    title: "About Tonight",
    lines: [
      "A skill task, a job-search task, then one line about how tonight went.",
      "The time chips shape the night to the time you have. Pick one and the first step gets smaller or bigger.",
      "Finishing a task adds it to your journal as evidence.",
      "Hand work in when you want Claude's review. While something is queued, the strip at the bottom says “answer it”.",
    ],
  },
  skill: {
    title: "About this page",
    lines: [
      "This is where you stand on each skill, and how sure the rating is.",
      "Open a skill to see the evidence behind it and what would move it.",
      "Ratings change from evidence you add, never from how you feel that day.",
      "When you have new evidence, say {say} in Claude Code. Swap research for the skill you mean.",
    ],
  },
  reach: {
    title: "About Hiring",
    lines: [
      "Three numbers, each out of 100. The line at 70 is lead-ready.",
      "Open a number to see what it is made of and what raises it.",
      "The date it says you'll be ready around is worked out from your pace and the evidence still to collect, so it moves when either does.",
      "Say {say} in Claude Code to have Claude read it.",
    ],
  },
  cv: {
    title: "About Your CV",
    lines: [
      "Each version of your CV is kept, with the reason it was made. The preview is the one you pick.",
      "Every fact has a source. Anything Claude could not source is marked as still needed, and listed here.",
      "A match number for a job is an AI estimate, not a measurement.",
      "Say “build my CV” in Claude Code to build or improve it, and “fill in my CV” to add the facts it still needs. Print or save as PDF here changes nothing.",
    ],
    recipe: { where: "In Claude Code.", give: "Say “build my CV”. For one job, say “tailor my CV for this job” and paste the post.", then: "Claude adds a new version and checks that every fact has a source. Your current CV file does not change until you say “use this CV”.", see: "Here, under Your CV." },
  },
  cases: {
    title: "About Your case studies",
    lines: [
      "One card per project, with its story format and what is still needed.",
      "Open a card to read the beats, or the decisions for a Decision Log.",
      "Only your own work is credited, and confidential work stays out.",
      "Say “write my case studies” in Claude Code to start or continue.",
    ],
    recipe: { where: "In Claude Code.", give: "The project name. Claude fills in what it knows and asks only for what is missing.", then: "Claude suggests a format and writes the outline and draft, one project at a time.", see: "Here, under Your case studies." },
  },
  journal: {
    title: "About your journal",
    lines: [
      "A place for wins, feedback and what you learned. All of it counts as evidence.",
      "Add a line any time. Tag a skill you're working on and it counts towards the right thing.",
      "To have Claude read your log back, say {say} in Claude Code.",
    ],
  },
  "person-cloud": {
    title: "About this list of words",
    lines: [
      "These are single words Claude uses to fit advice to you. They are its best guesses unless you said them.",
      "Tap a word to see where it came from. Press “That's me” to confirm it, or change it or remove it.",
      "A word you say isn't you stays gone. Claude won't add it again.",
      "Words are kept on this computer and are never put in your CV or sent to skill files.",
    ],
  },
  library: {
    title: "About your library",
    lines: [
      "Picks are scored on fit, gain, time, substance, freshness and how good they are. Picks that are not scored yet say so.",
      "Anything that doesn't earn its time is left out, with the reason.",
      "Say {say} in Claude Code to rebuild the picks.",
    ],
  },
};

/** The one statement about picks being scored. Page lead and help both say this. */
export function scoredStatement(scored: number, total: number): string {
  if (total > 0 && scored >= total) return "Every pick is scored for you.";
  if (scored > 0) return `${scored} of ${total} picks are scored. Picks that are not scored yet say so.`;
  return "Picks are not scored yet. Say “update my library” to score them.";
}

/** "How this works" in three lines. Leads every ? sheet, so the loop is the same on every page. */
export const HOW_LINES: [string, string][] = [
  ["You do", "your part here in this app"],
  ["Claude reads", "when you say “answer it” in Claude Code"],
  ["The reply shows", "here in the app, on the Commands page"],
];

/** The one thing to say next, per page, lives in PAGE_COMMAND (lib/commands.ts). The {say} token in the lines above is filled from it. */
