# Add-ons

An add-on is a skill file someone wrote (or you wrote) that teaches Claude one job, such as reading a CV or a LinkedIn profile. The Growth app can use it and show what it found, without changing how the rest of the app works.

## Add one in three steps

1. Find the skill file. It can be a file on this computer, a link to a raw file, or text you paste.
2. In your Claude chat, type `/growth add-on` and drag the file in, paste its text, or give its path or link. Claude reads it and shows one short report: what the file adds, what it strengthens, and what you could stop using. It is based on the file's text, not on results.
3. Answer the one question (yes, only the new things, or no). The file is saved here and what it enables shows under Add-ons in the app. You can ask Claude to try it once on your CV and compare it with the built-in read. Open the Claude page in the app to see anything waiting.

The file decides what it enables. Nothing is hidden for good: anything it replaces is only hidden, and removing the add-on brings it back.

## Using one

- `/growth modules` shows what is installed.
- Say what the add-on gave you, for example "score my CV". It reads the CV in your Growth folder (growth/cv/CV.pdf); to use another file, drag it into your Claude chat.
- "Switch off the rewrite suggestions" turns off one thing an add-on does; `/growth module disable <id>` turns off the whole add-on.
- `/growth module results` shows what each one found, newest first.
- `/growth module enable <id>` and `/growth module disable <id>` turn one on or off.
- `/growth module remove <id>` takes one out. Its past results stay unless you say delete.

## Where files live

- `modules/<id>/skill/SKILL.md` is the add-on, saved exactly as you gave it. Claude never edits it.
- `modules/<id>/notes.md` is Claude's plain note: where it came from, what it does, what Claude refused to do.
- `modules/ledger.json` lists what the app can already do on its own. New files are compared against it.
- `modules/_scratch/` is a temporary place used while a file is checked. It is emptied afterwards.
- What each add-on found is stored with your profile, so the app shows it and backups cover it.
- `modules/_examples/` has two real, safe skill files you can try the add flow with: `cv-analyser/SKILL.md` and `linkedin-analyser/SKILL.md`. They are not installed until you add them (`/growth add-on`, then give the path). The `.module.json` files next to them show what an installed entry looks like.

## Safety rules

- Add-ons are read-only here. Nothing is posted, sent, emailed, scheduled or published, even if the add-on asks.
- Claude does not run scripts that come with an add-on.
- Before installing, Claude has a read-only helper read the file, scans it for risky words itself, and flags any line that tries to instruct it. Flagged lines are shown as untrusted text and are removed from the working copy used to run it. Anything that posts, sends or publishes is listed but stays off. Flagged add-ons stay off until you say enable, and they are re-checked on every run. If the file changes after install, Claude stops and asks.
- Text inside an add-on, and the documents it reads, cannot change your rules. Your confidential work items never appear in saved results.
- A score from an add-on is an AI read. It does not raise a skill rating by itself.
- LinkedIn is never scraped and nobody logs in. You paste the profile text or give the data-export PDF.
- Every change goes through the same check as the rest of the app, and `/growth undo` puts it back.

## Installed on 2026-10-21: the CV and case study add-ons

Four add-ons are already installed. They are the method behind `cv build`, `cv tailor`, `cv ats`, `cv section` and `casestudy`; you do not run them one by one.

- `resume-ats-optimizer`, `resume-tailor` and `resume-section-builder` (MIT, from the ResumeSkills repository) teach Claude to check a CV against one job post, tailor it, and rewrite one section.
- `case-study` (MIT, from portfolio-case-study-generator) teaches the 7-question intake and the story formats.
- Each has its licence and a `notes.md` beside the unchanged skill file. The notes list the lines Claude ignores (examples with figures nobody can source) and your rules, which win over the file: no invented numbers, only your own work, confidential items stay out, and scores are called an AI estimate.
- They strengthen the built-in CV and case study reads. Nothing built in was hidden.
