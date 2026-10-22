// The /growth command catalogue. Plain data, no imports, so it can't break the app.
// The list mirrors skills/growth/SKILL.md (installed to ~/.claude/skills/growth/SKILL.md): change both together.

export type GrowthCommand = {
  cmd: string;
  args?: string;
  group: "Every day" | "Feedback on your work" | "Changing your course" | "Hiring" | "Learning" | "Add-ons" | "Memory and upkeep" | "G mini (for people you help)";
  does: string;
  example: string;
  plain?: string[];
  changes: boolean;
  /** App pages this command can change. An empty list means it only answers in Claude Code and changes nothing. Leave out when not listed. */
  updates?: ("tonight" | "you" | "hiring" | "journal" | "library" | "commands")[];
  /** Plain words for "What it updates", when the page list would be wrong (G mini never touches the app). */
  updatesText?: string;
  /** A short limit on the change, said after the pages: "After your yes", "Only this task". */
  scope?: string;
  /** The "i" popover: when it happens, where to look after, and what to do next. Taken from SKILL.md. */
  /** How often to use it: regular = a rhythm, sometimes = when something changes, rare = almost never. */
  often?: { level: "regular" | "sometimes" | "rare"; text: string };
  when?: string;
  where?: string;
  /** What the person does next. "needed": Claude waits for it. "optional": Claude goes on without it. */
  after?: { t: "needed" | "optional"; s: string }[];
  /** What the "changes" badge says, when "Changes your plan" would be wrong. */
  tag?: string;
  context?: ("task" | "goal" | "pace" | "gaps" | "skill" | "cv" | "portfolio" | "application" | "interview" | "journal" | "library" | "recall" | "week" | "notnow" | "queue" | "modules")[];
};

export const COMMANDS: GrowthCommand[] = [
  // Every day
  { cmd: "status", group: "Every day", does: "Tells you where things stand, what's on tonight and anything Claude owes you.", example: "/growth", plain: ["where do I stand", "how am I doing"], updates: [], when: "Right away, while you watch in Claude Code.", where: "In Claude Code. Tonight in the app shows the same list.", after: [{"t":"optional","s":"Answer its one question, if you like. Skip it and nothing changes."}], often: { level: "regular", text: "Every evening, when you sit down." }, changes: false },
  { cmd: "tonight", args: "[hour|30|15]", group: "Every day", does: "Shapes tonight to the time you have, with the smallest useful step first.", example: "/growth tonight 30", plain: ["I only have 20 minutes", "what should I do tonight"], updates: [], when: "Right away, while you watch in Claude Code.", where: "In Claude Code.", after: [{"t":"optional","s":"Say “swap this one” or “save this for later” if the task is too big. Nothing moves unless you do."}], often: { level: "sometimes", text: "On a short night." }, changes: false, context: ["task"] },
  { cmd: "done", args: "<task or step>", group: "Every day", does: "Marks a task, or one step of it, as done and adds it to your log.", example: "/growth done S-03", plain: ["I finished the CV task"], changes: true, context: ["task"] },
  { cmd: "stuck", args: "<task>", group: "Every day", does: "Finds where you stopped, then gives the smallest next move.", example: "/growth stuck S-03", plain: ["I'm stuck", "I don't know where to start"], updates: [], when: "Right away, while you watch in Claude Code.", where: "In Claude Code.", after: [{"t":"optional","s":"Do the smallest next move it gives you. Nothing waits on it."}], often: { level: "sometimes", text: "Whenever a task stops you." }, changes: false, context: ["task"] },
  { cmd: "swap", group: "Every day", does: "Replaces tonight's task with one that fits your energy, time or place better.", example: "/growth swap", plain: ["swap this one", "I can't do this tonight"], changes: true, context: ["task"] },
  { cmd: "later", args: "<task>", group: "Every day", does: "Saves a task for later. It moves to next week first.", example: "/growth later S-04", plain: ["save this for later", "not tonight"], changes: true, context: ["task"] },
  { cmd: "journal", args: "<what happened>", group: "Every day", does: "Adds a line to your log, with a skill you're working on if it fits.", example: "/growth journal Ran my first test with one person", plain: ["note this down"], changes: true, tag: "Adds a line to your log", context: ["journal"] },
  { cmd: "journal add", args: "<what happened>", group: "Every day", does: "Adds one line to your log. The same as writing the line after journal.", example: "/growth journal add Showed my case study to a friend", plain: ["add this to my journal"], changes: true, tag: "Adds a line to your log", context: ["journal"] },
  { cmd: "journal read", args: "[week | gap <id> | <n days>]", group: "Learning", does: "Reads your log back as themes, wins and blockers that repeat. Changes nothing.", example: "/growth journal read week", plain: ["what have I been writing about","read my journal"], updates: [], when: "Right away, while you watch in Claude Code.", where: "In Claude Code, as themes, wins and blockers.", after: [], often: { level: "sometimes", text: "When you want to see your patterns." }, changes: false, context: ["journal","gaps"] },
  { cmd: "fraud", group: "Every day", does: "Answers a bad moment with your own evidence and one small thing for tonight.", example: "/growth fraud", plain: ["I feel like a fraud", "I feel stuck on this skill"], updates: [], when: "Right away, while you watch in Claude Code.", where: "In Claude Code.", after: [{"t":"optional","s":"Do the one small thing it suggests for tonight. Skip it and nothing changes."}], often: { level: "sometimes", text: "When a bad moment hits." }, changes: false },

  // Feedback on your work
  { cmd: "handin", args: "<task> [link or file]", group: "Feedback on your work", does: "Hands a task in with a link, file or note, and asks Claude to review it.", example: "/growth handin S-03 https://my-portfolio.example/case-1", plain: ["here's my work for the task"], changes: true, context: ["task"] },
  { cmd: "review", args: "<link, file or text>", group: "Feedback on your work", does: "Gives ranked feedback on a piece of work: what to change first, then why.", example: "/growth review https://my-portfolio.example/case-1", plain: ["what do you think of this"], changes: true, context: ["task", "portfolio", "cv"] },
  { cmd: "queue", group: "Feedback on your work", does: "Works through everything you have asked Claude for in the app.", example: "/growth queue", plain: ["answer it"], updates: ["tonight","you","hiring","journal","library","commands"], scope: "Only what you queued for Claude", when: "Right away. It works through everything queued while you watch.", where: "The Commands page, under From Claude. Feedback shows on the task.", after: [{"t":"optional","s":"Open the Commands page to read the replies. The work is already done."},{"t":"needed","s":"If it says an item needs you, attach what it asks for. That item stays open until you do."}], often: { level: "regular", text: "Whenever Claude owes you answers." }, changes: true, context: ["queue"] },
  { cmd: "answer", group: "Feedback on your work", does: "Answers everything queued for Claude in the app, then lists what was done.", example: "/growth answer", plain: ["answer it","answer everything","answer all"], updates: ["tonight","you","hiring","journal","library","commands"], scope: "Only what you queued for Claude", when: "Right away. It works through everything queued while you watch.", where: "The Commands page, under From Claude. Feedback shows on the task.", after: [{"t":"optional","s":"Open the Commands page to read the replies. The work is already done."},{"t":"needed","s":"If it says an item needs you, attach what it asks for. That item stays open until you do."}], often: { level: "regular", text: "Whenever Claude owes you answers." }, changes: true, context: ["queue"] },

  // Changing your course
  { cmd: "week", group: "Changing your course", does: "Reviews the week and plans the next one, with both tracks in it.", example: "/growth week", plain: ["plan my week", "Sunday review"], updates: ["tonight","you","hiring","journal","library"], when: "After your yes. It shows the shape of the week first.", where: "Tonight shows next week and the Library has new picks. The reply is under From Claude on Commands.", after: [{"t":"optional","s":"Say how the week went in one line. Skip it and Claude plans from your hand-ins and tonight lines."},{"t":"needed","s":"Say yes or no to the shape of the week it shows. Nothing is saved until you do."}], often: { level: "regular", text: "Once a week, on Sunday." }, changes: true, context: ["week"] },
  { cmd: "plan", args: "[lighter | change]", group: "Changing your course", does: "Plans your next four weeks, researched and placed, and shows what would change. Nothing is saved until you say yes. With a plan in place it shows it, or adjusts it.", example: "/growth plan", plain: ["plan my four weeks", "make this week lighter"], updates: ["tonight","hiring","library"], when: "After your yes. It shows what would change first.", where: "Tonight and Hiring, under Your four weeks.", after: [{"t":"needed","s":"Say yes or no to the change it shows. Nothing is saved until you say yes."}], often: { level: "sometimes", text: "Every 4 weeks, or when the plan feels off." }, changes: true, tag: "Changes your plan, after your yes", context: ["week", "pace"] },
  { cmd: "check", group: "Changing your course", does: "A five minute check on your four weeks: what got done, what slipped, how the dates moved, and up to three choices for you.", example: "/growth check", plain: ["weekly check", "how did my week go"], updates: ["tonight","hiring"], when: "After your yes. It takes at most 5 minutes.", where: "Hiring, under Your four weeks.", after: [{"t":"needed","s":"Answer the decisions it asks, 3 at most. Nothing is saved until you say yes."}], often: { level: "regular", text: "Once a week, on Sunday." }, changes: true, tag: "Updates your plan, after your yes", context: ["week"] },
  { cmd: "review 4w", group: "Changing your course", does: "Looks back over your four weeks: did the work move a skill, are the gaps still the right ones, and what to plan next. It suggests; you decide.", example: "/growth review 4w", plain: ["review my four weeks"], often: { level: "sometimes", text: "Every 4 weeks." }, changes: true, tag: "Suggests; changes your plan only after your yes", context: ["week", "gaps", "skill"] },
  { cmd: "why", args: "<task>", group: "Every day", does: "Explains one task: the sources behind it, why it sits on this night and which of your goals it serves. Changes nothing.", example: "/growth why S-03", plain: ["why this task", "why am I doing this"], changes: false, context: ["task"] },
  { cmd: "task", args: "add | change | move | drop <task>", group: "Changing your course", does: "Adds, edits, moves or drops one task, keeping two a night.", example: "/growth task move S-05 Fri", plain: ["move this to another night"], changes: true, context: ["task", "week"] },
  { cmd: "goal", group: "Changing your course", does: "Updates your goal and how it feels, then re-plans around it.", example: "/growth goal", plain: ["my goal feels too far", "I want to aim higher"], changes: true, context: ["goal"] },
  { cmd: "target", args: "[role] [level]", group: "Changing your course", does: "Changes the role and level you are aiming for among the five launch roles, or adds a second target, and shows how the gap changes. Asks before it saves.", example: "/growth target product marketer", plain: ["change my target", "I want to aim for a different role"], changes: true, context: ["goal", "gaps"] },
  { cmd: "pace", args: "lighter | steady | push", group: "Changing your course", does: "Sets how many evenings a week you want to work: 3, 5 or 6.", example: "/growth pace lighter", plain: ["I'm tired this week", "I want to push harder"], changes: true, context: ["pace"] },
  { cmd: "gaps", args: "[show | move | add | close | redate]", group: "Changing your course", does: "Shows what stands between you and your goal, and keeps the list honest.", example: "/growth gaps move G-02 up", plain: ["what am I missing"], changes: true, context: ["gaps"] },
  { cmd: "skills", group: "Changing your course", does: "Shows each skill, how sure the rating is, and what would move it.", example: "/growth skills", plain: ["how good am I at research"], changes: false, context: ["skill"] },
  { cmd: "rate", args: "<skill>", group: "Changing your course", does: "Re-rates one skill from evidence, never from feel.", example: "/growth rate research", plain: ["rate my research skill", "re-rate my research"], updates: ["you"], when: "Right away, while you watch in Claude Code.", where: "You, on that skill.", after: [], often: { level: "sometimes", text: "When a skill bar is full, around Sunday." }, changes: true, context: ["skill"] },
  { cmd: "person", args: "[show | seed | edit | clear]", group: "Changing your course", does: "Proposes a few things Claude has noticed about you, for you to confirm or reject. Nothing is kept as true until you say so.", example: "/growth person", plain: ["get to know me", "what do you know about me"], updates: ["you"], when: "After your yes. Nothing is kept as true until you say so.", where: "You, as words to confirm or reject.", after: [{"t":"needed","s":"Confirm or reject each one on You. Nothing is kept as true until you do."}], often: { level: "sometimes", text: "When you want Claude to know you better." }, changes: true, tag: "Adds notes about you, after your yes", context: ["skill"] },
  { cmd: "test", args: "<skill>", group: "Changing your course", does: "Gives you a short scenario test for a skill, then scores your answers.", example: "/growth test communication", plain: ["test me on research"], changes: true, context: ["skill"] },
  { cmd: "notnow", args: "[add | back] <what>", group: "Changing your course", does: "Parks something on purpose with a date to revisit, or brings it back.", example: "/growth notnow add motion design", plain: ["I'm not doing this right now"], changes: true, context: ["notnow"] },

  // Onboarding: the interview that rebuilds your starting point. It lives under /growth; the front door stays at six.
  { cmd: "start", args: "[--dry-run]", group: "Changing your course", does: "Starts your onboarding: rounds of direct questions, a few each night. Whatever you cannot answer becomes a task in the course. Nothing is erased until you type the exact phrase.", example: "/growth start", plain: ["growth start", "start over", "start again", "onboard me", "begin"], often: { level: "rare", text: "Only to start over." }, changes: true, tag: "Archives and blanks your data, only after your typed phrase", context: ["goal"] },
  { cmd: "resume", group: "Changing your course", does: "Carries on the onboarding from the last question you answered.", example: "/growth resume", plain: ["resume growth start", "carry on with the questions"], changes: true, tag: "Adds your answers", context: ["goal"] },
  { cmd: "pause", group: "Changing your course", does: "Stops the questions now and keeps everything you answered. Works in the middle of a question.", example: "/growth pause", plain: ["pause", "not now", "stop"], changes: true, tag: "Saves where you are", context: ["goal"] },
  { cmd: "onboarding status", group: "Changing your course", does: "Shows the round, what is answered, what is unknown and what does not add up. Changes nothing.", example: "/growth onboarding status", plain: ["how far is my onboarding", "onboarding status"], changes: false, context: ["goal"] },
  { cmd: "redo round", args: "<N>", group: "Changing your course", does: "Reopens one round. Your earlier answers are kept, and each question is asked again with what you said last time.", example: "/growth redo round 2", plain: ["redo round 2", "ask round 3 again"], changes: true, tag: "Replaces answers in that round, after your yes", context: ["goal"] },

  { cmd: "change", args: "[what]", group: "Changing your course", does: "Asks what you want, shows what would change, and only then changes it.", example: "/growth change", plain: ["make this week lighter", "my goal feels too far"], changes: true, context: ["week", "goal", "pace", "gaps", "task"] },

  // Getting hired
  { cmd: "cv", group: "Hiring", does: "Checks your CV against the 7-second test and says what to change first. To build or improve it, use cv build.", example: "/growth cv", plain: ["look at my CV", "my resume"], updates: ["hiring"], scope: "Only if your evidence supports it", when: "Right away, while you watch in Claude Code.", where: "In Claude Code. With a skill file connected, the score also shows on Hiring.", after: [{"t":"optional","s":"Say “build my CV” to improve it. Skip it and your CV stays as it is."}], often: { level: "sometimes", text: "After you change your CV." }, changes: false, context: ["cv"] },
  { cmd: "cv build", group: "Hiring", does: "Builds a new version of your CV from your interview answers, your career file and your evidence. Every fact has a source, and anything missing is marked as still needed.", example: "/growth cv build", plain: ["build my CV"], updates: ["hiring"], when: "Right away. It asks one question at a time if a fact is missing.", where: "Hiring, under Your CV, as a new version.", after: [{"t":"optional","s":"Answer its question if a fact is missing. Skip it and that fact stays marked as still needed."},{"t":"optional","s":"Say “fill in my CV” if facts are still needed, then open Hiring."}], often: { level: "rare", text: "Once, after the interview. Then only if your story changes." }, changes: true, tag: "Adds a CV version you can preview", context: ["cv"] },
  { cmd: "cv tailor", args: "<job post>", group: "Hiring", does: "Makes a new CV version fitted to one job post, and shows it as your current one. It reorders and rewords what is true. It adds no skill and no number.", example: "/growth cv tailor https://example.com/jobs/product-designer", plain: ["tailor my CV for this job"], updates: ["hiring"], when: "Right away, once you give it the job post.", where: "Hiring, under Your CV, as a new version naming the job.", after: [{"t":"needed","s":"Give it the job post, as text or a link. It cannot start without it."},{"t":"optional","s":"Open Hiring to see the new version."}], often: { level: "sometimes", text: "Once for each job you apply to." }, changes: true, tag: "Adds a CV version for that job", context: ["cv"] },
  { cmd: "cv ats", args: "<job post>", group: "Hiring", does: "Compares your CV with one job post: keywords found, keywords missing, and a match number labelled as an AI estimate.", example: "/growth cv ats https://example.com/jobs/product-designer", plain: ["check my CV against this job"], changes: true, tag: "Saves the result with that CV version", context: ["cv"] },
  { cmd: "cv section", args: "<name>", group: "Hiring", does: "Rewrites one part of your CV, such as the summary, skills, experience or projects, from facts that have a source.", example: "/growth cv section summary", plain: ["rewrite my summary"], changes: true, tag: "Adds a CV version with that part rewritten", context: ["cv"] },
  { cmd: "cv fill", group: "Hiring", does: "Asks you only for the facts your CV still needs, such as a result or a number, and fills them in with your words as the source. You can skip any of them.", example: "/growth cv fill", plain: ["fill in my CV"], updates: ["hiring","journal"], when: "Right away. Answer each question, or say skip.", where: "Hiring, under Your CV.", after: [{"t":"optional","s":"Answer each question, or say skip. Skipped facts stay marked as still needed."},{"t":"optional","s":"Say “save my CV as a PDF” once no fact is left."}], often: { level: "sometimes", text: "When facts are still needed." }, changes: true, tag: "Adds a CV version with those facts filled in", context: ["cv"] },
  { cmd: "cv export", args: "[version]", group: "Hiring", does: "Saves a CV version as a PDF in your Growth folder. It does not replace the CV you send out.", example: "/growth cv export", plain: ["save my CV as a PDF"], changes: true, tag: "Saves a PDF in your Growth folder", context: ["cv"] },
  { cmd: "cv promote", args: "[version]", group: "Hiring", does: "Makes one CV version the CV in your Growth folder. The old one is kept first. Only when you say so, and only when no fact is still needed.", example: "/growth cv promote", plain: ["use this CV"], changes: true, tag: "Replaces your CV file, after your yes", context: ["cv"] },
  { cmd: "portfolio", group: "Hiring", does: "Reviews your portfolio the way a recruiter sees it, in 30 seconds and in 3 minutes.", example: "/growth portfolio", plain: ["review my portfolio"], changes: false, context: ["portfolio"] },
  { cmd: "casestudy", args: "<name>", group: "Hiring", does: "Writes one case study with you. It fills the questions from what you already told Claude, asks only what is missing, one project at a time, and suggests a format.", example: "/growth casestudy Checkout redesign", plain: ["write my case studies", "work on a case study"], updates: ["hiring"], when: "Right away. It asks one numbered message for each project.", where: "Hiring, under Your case studies.", after: [{"t":"needed","s":"Answer its numbered questions. It waits for you before going on."},{"t":"optional","s":"Open Hiring to see the case study."}], often: { level: "sometimes", text: "One project at a time, when you are ready." }, changes: true, tag: "Saves the case study outline or draft", context: ["portfolio"] },
  { cmd: "apply", args: "<company, role>", group: "Hiring", does: "Logs an application, tracks its stage and gives CV tailoring notes.", example: "/growth apply Acme Pay, Product Designer", plain: ["I applied to Acme", "they moved me to a screen"], changes: true, context: ["application"] },
  { cmd: "interview", args: "<company>", group: "Hiring", does: "A mock interview, one question at a time, with feedback at the end.", example: "/growth interview Acme Pay", plain: ["I have an interview", "mock interview"], changes: true, context: ["interview"] },
  { cmd: "outreach", args: "<person or company>", group: "Hiring", does: "Drafts a short message for you to send. Claude never sends anything.", example: "/growth outreach Priya at Acme Pay", plain: ["write a message to someone", "how do I reach out"], changes: false, context: ["application"] },

  // Learning
  { cmd: "learn", args: "<topic>", group: "Learning", does: "A short brief on a topic, tied to a gap, with sources that were checked.", example: "/growth learn usability testing", plain: ["teach me this", "is this worth learning"], changes: true, context: ["gaps", "library"] },
  { cmd: "library", group: "Learning", does: "Shows this week's picks and how they tie to your gaps and tasks.", example: "/growth library", plain: ["what should I read"], changes: false, context: ["library"] },
  { cmd: "library update", group: "Learning", does: "Rebuilds your picks from your gaps and journal, scored, with what was left out and why.", example: "/growth library update", plain: ["update my library","refresh my picks"], updates: ["library"], when: "About 10 to 15 minutes. It works through it and reports once.", where: "The Library.", after: [{"t":"optional","s":"Open the Library to see the picks. They are already saved."}], often: { level: "regular", text: "Once a week, with the plan." }, changes: true, context: ["library"] },
  { cmd: "library score", args: "<title, link or text>", group: "Learning", does: "Tells you if something is worth your time, with a better option if there is one. Adds nothing.", example: "/growth library score https://example.com/article", plain: ["is this worth my time"], updates: [], when: "Right away, while you watch in Claude Code.", where: "In Claude Code. Nothing is added to your Library.", after: [{"t":"needed","s":"Give it the link or the pasted text of the thing. It cannot score it without that."},{"t":"optional","s":"Say “add it” to put it in your Library. Skip it and nothing is added."}], often: { level: "sometimes", text: "When you find something to read." }, changes: false, context: ["library"] },
  { cmd: "news", group: "Learning", does: "Up to three things that changed lately and matter to your work.", example: "/growth news", plain: ["anything new in design"], changes: false, context: ["library"] },
  { cmd: "recall", group: "Learning", does: "Brings back one of your own notes so it sticks, and asks if it is still true.", example: "/growth recall", plain: ["quiz me on my notes"], changes: true, context: ["recall"] },

  // Add-ons
  { cmd: "modules", group: "Add-ons", does: "Lists the skill files you have, what each is for and its last result.", example: "/growth modules", plain: ["what skill files do I have"], changes: false, context: ["modules"] },
  { cmd: "module add", args: "<file, link or pasted text>", group: "Add-ons", does: "Installs a skill file after telling you what it does and what it needs. Saved unchanged.", example: "/growth module add C:/Users/me/cv-analyser/SKILL.md", plain: ["add this skill"], changes: true, context: ["modules"] },
  { cmd: "module run", args: "<id> [input]", group: "Add-ons", does: "Runs one skill file on your input and saves what it found for the app.", example: "/growth module run cv-analyser", changes: true, context: ["modules"] },
  { cmd: "module enable", args: "<id>", group: "Add-ons", does: "Turns a skill file on so the app can use it.", example: "/growth module enable cv-analyser", changes: true, context: ["modules"] },
  { cmd: "module disable", args: "<id>", group: "Add-ons", does: "Turns a skill file off without removing it.", example: "/growth module disable cv-analyser", changes: true, context: ["modules"] },
  { cmd: "module remove", args: "<id>", group: "Add-ons", does: "Takes a skill file out. Its past results stay unless you say delete.", example: "/growth module remove cv-analyser", changes: true, context: ["modules"] },
  { cmd: "module default", args: "<id>", group: "Add-ons", does: "Picks which skill file is used when two do the same job.", example: "/growth module default cv-analyser", changes: true, context: ["modules"] },
  { cmd: "module results", args: "[id]", group: "Add-ons", does: "Shows what your skill files found, newest first, and which results are out of date.", example: "/growth module results", changes: false, context: ["modules"] },
  { cmd: "analyse cv", args: "[file]", group: "Add-ons", does: "Scores your CV with a CV add-on you chose, or says there is none and offers the built-in review. To build or tailor your CV, use cv build.", example: "/growth analyse cv", plain: ["analyse my CV","score my CV"], changes: true, context: ["cv","modules"] },
  { cmd: "analyse linkedin", args: "[pasted text or file]", group: "Add-ons", does: "Reads your LinkedIn profile from text you paste or the data export. It never visits LinkedIn.", example: "/growth analyse linkedin", plain: ["analyse LinkedIn"], changes: true, context: ["modules"] },
  { cmd: "analyse portfolio", group: "Add-ons", does: "Runs your portfolio skill file on your live site or pasted case studies.", example: "/growth analyse portfolio", changes: true, context: ["portfolio","modules"] },
  { cmd: "analyse interview", group: "Add-ons", does: "Runs your interview skill file on an answer you paste. It never records anyone.", example: "/growth analyse interview", changes: true, context: ["interview","modules"] },

  // Memory and upkeep
  { cmd: "add-on", group: "Add-ons", does: "Keeps a skill file unchanged, checks it, and adds it as a tool. Its scores show in the app.", example: "/growth skill file", plain: ["add this skill file"], changes: true, context: ["modules"] },
  { cmd: "journey", group: "Memory and upkeep", does: "Tells you the story so far from Claude's long-term memory of you.", example: "/growth journey", changes: false },
  { cmd: "remember", args: "<thing>", group: "Memory and upkeep", does: "Saves a short dated note to the journey for next time.", example: "/growth remember I want a calmer pace in November", plain: ["note this for next time"], changes: true },
  { cmd: "undo", group: "Memory and upkeep", does: "Puts back the files as they were before Claude's last change.", example: "/growth undo", plain: ["undo that", "put it back"], changes: true },
  { cmd: "fix", group: "Memory and upkeep", does: "Repairs data that won't load, keeping everything you entered.", example: "/growth fix", plain: ["the app is broken", "fix my growth data"], changes: true },
  { cmd: "pack", group: "Memory and upkeep", does: "Tells you where the Growth pack is, a single file with your plan and evidence you can take elsewhere. You rarely need it.", example: "/growth pack", plain: ["where is my pack"], changes: false },
  { cmd: "help", group: "Memory and upkeep", does: "Lists every command. Plain words work too.", example: "/growth help", changes: false },

  // G mini: a separate skill for other people. It never reads or writes your own Growth.
  { cmd: "g-mini new", group: "G mini (for people you help)", does: "Starts a new person. Asks their name and whether they agree, then runs the whole interview, the research and the PDF one after the other, with no stops in between.", example: "/g-mini new", plain: ["start a g mini"], changes: true, updates: [], updatesText: "Nothing in your app. Only that person's folder.", tag: "Only that person's folder", often: {"level":"sometimes","text":"Once for each person you help."}, when: "When you sit down with someone you are helping. The interview takes 45 to 60 minutes.", where: "In Claude Code. The PDF ends up at people/<id>/report/<date>/report.pdf in your Growth folder.", after: [{"t":"needed","s":"Give their name, as they want it on the report."},{"t":"needed","s":"Ask them if they agree to their answers being saved here, and give Claude their words."},{"t":"needed","s":"Answer the questions with them, one at a time. They can skip any."},{"t":"optional","s":"Paste their CV text and their LinkedIn text."},{"t":"optional","s":"Send them the PDF yourself. Claude sends nothing."}] },
  { cmd: "g-mini", args: "<id>", group: "G mini (for people you help)", does: "Opens one person, or carries on where you stopped. Every reply says whose file is open.", example: "/g-mini alex", plain: ["open <name>'s g mini"], changes: false, updates: [], updatesText: "Nothing in your app. Only that person's folder.", tag: "Reads only", often: {"level":"sometimes","text":"When you come back to someone, or after a break."}, when: "When you want to work on a person you already made, or the chat was interrupted.", where: "In Claude Code, in the first line of the reply: Working on: their name and id.", after: [{"t":"needed","s":"Give the id. A name Claude has not seen is never guessed into a file."},{"t":"optional","s":"Carry on with the next question it asks."}] },
  { cmd: "g-mini interview", args: "<id>", group: "G mini (for people you help)", does: "Redo the interview for that person. Their old answers are kept, and each one is asked again before it is replaced.", example: "/g-mini alex interview", plain: ["redo <name>'s g mini interview"], changes: true, updates: [], updatesText: "Nothing in your app. Only that person's folder.", tag: "Only that person's folder", often: {"level":"rare","text":"Only to redo answers. A new person is interviewed by g-mini new."}, when: "When answers have changed or you want to improve them.", where: "In Claude Code.", after: [{"t":"needed","s":"Say yes or no to each old answer: still true, or replace it."}] },
  { cmd: "g-mini research", args: "<id>", group: "G mini (for people you help)", does: "Redo the research for that person: public patterns only, India and remote roles, every source with its date. Never people's names or links.", example: "/g-mini alex research", plain: ["redo <name>'s g mini research"], changes: true, updates: [], updatesText: "Nothing in your app. Only that person's folder.", tag: "Only that person's folder", often: {"level":"rare","text":"To refresh the research. The first run is automatic."}, when: "When sources are old or a role was added.", where: "In Claude Code, saved in that person's folder.", after: [{"t":"optional","s":"Then say rebuild the PDF to put it into the report."}] },
  { cmd: "g-mini report", args: "<id>", group: "G mini (for people you help)", does: "Rebuild the PDF for that person. The old PDF is kept in its own dated folder.", example: "/g-mini alex report", plain: ["rebuild <name>'s g mini PDF"], changes: true, updates: [], updatesText: "Nothing in your app. Only that person's folder.", tag: "Only that person's folder", often: {"level":"rare","text":"After a change. The first PDF is built automatically."}, when: "After the research, an answer or a fact changed.", where: "In Claude Code, with the PDF path: people/<id>/report/<date>/report.pdf in your Growth folder.", after: [{"t":"optional","s":"Read it, then send it to them yourself."}] },
  { cmd: "g-mini edit", args: "<id>", group: "G mini (for people you help)", does: "Changes one fact in that person's file, then rebuilds the PDF in a new dated folder.", example: "/g-mini alex edit", plain: ["change a fact in <name>'s g mini"], changes: true, updates: [], updatesText: "Nothing in your app. Only that person's folder.", tag: "Only that person's folder", often: {"level":"rare","text":"When they spot something wrong."}, when: "When a fact in their report is wrong or missing.", where: "In Claude Code, then in the new PDF.", after: [{"t":"needed","s":"Say which fact and what it should say. Claude asks for the source."}] },
  { cmd: "g-mini mock", args: "<id>", group: "G mini (for people you help)", does: "Runs a live mock interview for that person. Only when you ask for it.", example: "/g-mini alex mock", plain: ["run a g mini mock for <name>"], changes: false, updates: [], updatesText: "Nothing in your app. Only that person's folder.", tag: "Reads only", often: {"level":"rare","text":"Only when asked."}, when: "When they want to practise out loud.", where: "In Claude Code.", after: [{"t":"optional","s":"Answer as they would. Claude gives feedback on the answers, not on them."}] },
  { cmd: "g-mini list", group: "G mini (for people you help)", does: "Lists everyone you have made a g mini for, and who agreed.", example: "/g-mini list", plain: ["list my g minis"], changes: false, updates: [], updatesText: "Nothing in your app. Only that person's folder.", tag: "Reads only", often: {"level":"sometimes","text":"When you forget an id."}, when: "When you need an id.", where: "In Claude Code.", after: [{"t":"optional","s":"Open one with g-mini and the id."}] },
];

/** What the UI shows and copies for a command example: the plain phrase, never a leading slash. "/growth" alone reads "where do I stand". */
export const plainExample = (example: string): string => {
  const t = example.trim();
  if (t === "/growth") return "where do I stand";
  return t.replace(/^\/growth\s+/, "growth ").replace(/^\//, "");
};

/**
 * One command per page. The chip at the top of the page, the bullets in its ? sheet and the three-line lead in that sheet
 * all read this map, so they cannot disagree. say = the exact phrase to type. claudeReads = what Claude looks at.
 * replyShowsOn = where the reply lands (not every reply lives on the Commands page).
 */
export type PageCommand = { say: string; claudeReads: string; replyShowsOn: string };
export const PAGE_COMMAND: Record<string, PageCommand> = {
  today: { say: "where do I stand", claudeReads: "your Growth folder, tonight's list and anything you handed in", replyShowsOn: "in Claude Code. A review of a hand-in shows on its task, under Tonight" },
  skill: { say: "rate my research skill", claudeReads: "the evidence behind that skill", replyShowsOn: "on that skill, under You" },
  reach: { say: "look at my CV", claudeReads: "the CV in your Growth folder", replyShowsOn: "in Claude Code first. With a skill file connected, the score also shows on Hiring" },
  journal: { say: "read my journal", claudeReads: "the lines in your journal", replyShowsOn: "in Claude Code, as themes, wins and blockers. Your journal stays as it is" },
  cv: { say: "build my CV", claudeReads: "your interview answers, your career file and your evidence", replyShowsOn: "on Hiring, under Your CV, as a new version" },
  cases: { say: "write my case studies", claudeReads: "your interview answers, your career file and your evidence", replyShowsOn: "on Hiring, under Your case studies" },
  library: { say: "update my library", claudeReads: "your gaps and your journal", replyShowsOn: "in the Library, about 10 to 15 minutes later" },
  companion: { say: "answer it", claudeReads: "everything queued for Claude", replyShowsOn: "on this page, under From Claude" },
  you: { say: "get to know me", claudeReads: "your skills, journal and goal", replyShowsOn: "on You, as words for you to confirm or reject" },
};

/** The three-line lead of a ? sheet, for one page. */
export function howLines(page: string): [string, string][] {
  const p = PAGE_COMMAND[page] ?? PAGE_COMMAND.companion;
  return [
    ["You do", "your part here in this app"],
    ["Claude reads", `${p.claudeReads}, when you say “${p.say}” in Claude Code`],
    ["The reply shows", p.replyShowsOn],
  ];
}

/** The only six things the person needs to know. Everything else works in plain words; COMMANDS above is the full reference. */
export type FrontDoor = {
  /** The exact thing to type, shown as a copyable chip. */
  chip: string;
  cmd: string; label: string; when: string; say: string[]; does: string;
  /** Where, what to give it, what happens, where the result shows up. Same four lines everywhere. */
  recipe?: { where: string; give: string; then: string; see: string };
};

export const FRONT_DOOR: FrontDoor[] = [
  { chip: "where do I stand", cmd: "/growth", label: "Where do I stand?", when: "you feel lost, or it's the start of an evening", say: ["where do I stand", "what's next"], does: "Tells you where things stand, what's on tonight and anything Claude owes you.",
    recipe: { where: "In Claude Code.", give: "Nothing. It reads your Growth folder.", then: "It tells you where things stand and what is on tonight.", see: "In Claude Code's reply. Tonight in the app shows the same list." } },
  { chip: "answer it", cmd: "/growth answer", label: "Answer it", when: "you asked something in the app or handed in work", say: ["answer it", "answer everything"], does: "Clears everything queued for Claude and shows you a small table of what it did.",
    recipe: { where: "In Claude Code.", give: "Nothing. Whatever you sent from the app is already queued for Claude.", then: "It answers each queued item and shows a small table.", see: "It updates when you come back to the app: the replies under From Claude on the Commands page, and feedback on the task." } },
  { chip: "update my library", cmd: "/growth library", label: "Update my library", when: "it's the start of the week, or you want something new", say: ["update my library", "is this worth my time?"], does: "Finds, scores and shows reads, videos and podcasts that fit you. It can also judge one thing you found.",
    recipe: { where: "In Claude Code.", give: "Nothing. To judge one thing, paste its link or text.", then: "It finds and scores new picks, or scores the one thing you gave it. Finding new picks takes about 10 to 15 minutes.", see: "New picks appear in the Library when you come back to the app. A single score stays in Claude Code." } },
  { chip: "change my plan", cmd: "/growth change", label: "Change the plan", when: "the week doesn't fit you, or your goal feels different", say: ["make this week lighter", "my goal feels too far", "plan my four weeks"], does: "Asks what you want, shows what would change, and only then changes it.",
    recipe: { where: "In Claude Code.", give: "One sentence on what you want changed. It asks one question if it needs more.", then: "It shows what would move and stops until you say yes.", see: "After your yes, it updates when you come back to the app." } },
  { chip: "look at my CV", cmd: "/growth review", label: "Look at my work", when: "you made something: a task, your CV, your LinkedIn, a case study", say: ["look at my CV", "analyse my LinkedIn", "review my four weeks"], does: "Reviews it, uses a skill file if you have one, and tells you what to change first.",
    recipe: { where: "In Claude Code.", give: "For your CV, nothing: it reads the one in your Growth folder, growth/cv/CV.pdf. For another file, drag it into Claude Code. For LinkedIn, paste your profile text or the PDF from LinkedIn's Save to PDF.", then: "It tells you what to change first.", see: "The answer in Claude Code. With a skill file connected, the score also shows under Hiring." } },
  { chip: "add a skill file", cmd: "/growth skill file", label: "Add a skill file", when: "someone shared a skill file you want the app to use", say: ["add this skill file"], does: "Keeps the file unchanged, checks it, and adds it as a tool. Its scores show in the app.",
    recipe: { where: "In Claude Code.", give: "The skill file: drag it into Claude Code, paste its text, or give its path or link.", then: "It checks the file, shows what it adds, strengthens and can drop, and asks before using it.", see: "In Claude Code first. After your yes, it shows under Add-ons in the app." } },
];

/**
 * Recipes for the CV and case study commands: where, what you give, what happens, where you look.
 * Plain data. The Hiring page reads these for the "Your CV" and "Your case studies" help.
 */
export type CommandRecipe = { where: string; give: string; then: string; see: string };

export const CV_RECIPES: Record<string, CommandRecipe> = {
  "cv build": { where: "In Claude Code.", give: "Just the words. If a fact is missing, Claude asks you one question at a time, and your answer is saved with your words.", then: "Claude builds a new CV version from your interview answers, your career file and your evidence. It checks that every fact has a source, and marks what is still needed.", see: "On Hiring, under Your CV. Facts still needed are listed there." },
  "cv tailor": { where: "In Claude Code.", give: "The job post: paste its text or its link. Add the company and the role if they are not in it.", then: "Claude makes a new CV version for that job and shows it as your current one. It reorders and rewords what is true. It adds no skill and no number.", see: "On Hiring, under Your CV, as a new version with the job named." },
  "cv ats": { where: "In Claude Code.", give: "The job post: paste its text or its link.", then: "Claude lists the keywords your CV has and the ones it lacks, and gives a match number. The number is an AI estimate, not a measurement.", see: "On Hiring, under Your CV, next to that version." },
  "cv section": { where: "In Claude Code.", give: "The part to rewrite: summary, skills, experience, education or projects.", then: "Claude rewrites that part from facts that have a source and saves it as a new version.", see: "On Hiring, under Your CV, in the preview." },
  "cv fill": { where: "In Claude Code.", give: "A short answer to each question Claude asks, or “skip”. It asks only for the facts your CV still needs.", then: "Claude saves each answer in your words as evidence, fills it into a new CV version and checks the source. Skipped facts stay marked as still needed.", see: "On Hiring, under Your CV. The facts still needed shrink." },
  "cv export": { where: "In Claude Code.", give: "Nothing, or the version you want.", then: "Claude saves a PDF of that version in your Growth folder, in cv/drafts. If facts are still needed, it says so and stamps the PDF as a draft.", see: "In Claude Code, with the file path. On Hiring you can also use Print or save as PDF." },
  "cv promote": { where: "In Claude Code.", give: "Say “use this CV” and name the version if there is more than one.", then: "Claude keeps a copy of your current CV in cv/drafts/_replaced first, then makes that version the CV in your Growth folder. It needs every fact filled in and a saved PDF. To take it back, ask Claude to undo the last promote.", see: "In Claude Code first. On Hiring, that version shows as the one in use." },
  casestudy: { where: "In Claude Code.", give: "The project name. Claude fills in what it already knows and asks only for what is missing, one project at a time.", then: "Claude suggests a story format, then writes the outline and draft. Every claim has a source. A missing number stays marked as still needed.", see: "On Hiring, under Your case studies." },
};

/** What a typed phrase does, in plain words, for the "i" button on a command chip. Looked up from the catalogue above, so it can never disagree with it. Rows are [label, text]. */
/** Phrases that mean something narrower than the command they match. Merged over the matched command. */
const PHRASE_INFO: Record<string, Partial<GrowthCommand>> = {
  "make this week lighter": {
    does: "Moves up to two planned days to later and shows how your ready date shifts. It asks first if you mean just this week or from now on.",
    updates: ["tonight", "hiring"],
    often: { level: "sometimes", text: "When the week feels too heavy." },
    when: "After your yes. It shows which days would move first.",
    where: "Tonight, in this week's list.",
    after: [{ t: "needed", s: "Say whether you mean just this week or from now on." }, { t: "needed", s: "Say yes or no to the days it would move. Nothing is saved until you do." }],
  },
};

export type InfoRow = { label: string; text?: string; badge?: "regular" | "sometimes" | "rare"; steps?: { t: "needed" | "optional"; s: string }[] };
export function commandInfo(phrase: string): { rows: InfoRow[] } | null {
  const norm = (x: string) => x.toLowerCase().replace(/[’']/g, "'").trim();
  const p = norm(phrase);
  let entry: GrowthCommand | undefined;
  if (p.startsWith("i'm stuck on")) entry = COMMANDS.find((c) => c.cmd === "stuck");
  else if (p.startsWith("write my case study on")) entry = COMMANDS.find((c) => c.cmd === "casestudy");
  else if (/^rate my .+ skill$/.test(p)) entry = COMMANDS.find((c) => c.cmd === "rate");
  else entry = COMMANDS.find((c) => (c.plain ?? []).some((x) => norm(x) === p));
  if (entry && PHRASE_INFO[p]) entry = { ...entry, ...PHRASE_INFO[p] };
  const door = FRONT_DOOR.find((f) => norm(f.chip) === p);
  const does = entry?.does ?? door?.does;
  if (!does) return null;
  const page = Object.values(PAGE_COMMAND).find((c) => norm(c.say) === p);
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const PAGE: Record<string, string> = { tonight: "Tonight", you: "You", hiring: "Hiring", journal: "Journal", library: "Library", commands: "Commands" };
  const upd = entry?.updatesText ? entry.updatesText : entry?.updates ? (entry.updates.length === 0 ? "Nothing. It only answers you." : `${entry.updates.map((u) => PAGE[u]).join(", ")}${entry.scope ? `. ${entry.scope}.` : "."}`) : entry && !entry.changes ? "Nothing. It only answers you." : undefined;
  const where = entry?.where ?? (page?.replyShowsOn ?? door?.recipe?.see);
  const rows: InfoRow[] = [{ label: "What it does", text: does }];
  if (entry?.often) rows.push({ label: "How often", text: entry.often.text, badge: entry.often.level });
  if (upd) rows.push({ label: "What it updates", text: upd });
  if (entry?.when) rows.push({ label: "When", text: entry.when });
  if (where) rows.push({ label: "Where to look", text: cap(where) });
  if (entry?.after) rows.push(entry.after.length ? { label: "After this", steps: entry.after } : { label: "After this", text: "Nothing else." });
  return { rows };
}
