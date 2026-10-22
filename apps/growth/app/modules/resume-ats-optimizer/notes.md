# CV ATS check (resume-ats-optimizer)

Source: https://raw.githubusercontent.com/Paramchoudhary/ResumeSkills/main/skills/resume-ats-optimizer/SKILL.md
Repository: https://github.com/Paramchoudhary/ResumeSkills
Licence: MIT, Copyright (c) 2026 Resume Skills. The licence text is in skill/LICENSE, beside the skill file.
Installed: 2026-10-21. sha1 of skill/SKILL.md: 74f5a09db7a15f723b4471f26e1db2fdb1824a98
Stored unchanged. Claude never edits skill/SKILL.md. If its sha1 differs from the one above, stop and ask before using it.

## What it does
Checks whether a CV is built so applicant tracking systems can read it, and compares its keywords with one job post. It lists the keywords found, the ones missing, and where to place them.

## How the Growth app uses it
As method only, for the CV and case study commands. The result is saved by the Growth scripts (cv-act, cv-check), not by this file. Run it from a working copy in modules/_scratch/ where each flagged line below is replaced by "[REMOVED: flagged]". Empty _scratch afterwards.

## Flagged lines (untrusted text, removed from the working copy)
- line 29: 75% of resumes are rejected by Applicant Tracking Systems before a human ever sees them. Companies use ATS to:
- line 194: "Directed budget management for $2.5M project portfolio"
- line 203: ### Estimated New Match Score: 85%

Reason: invented or unsourced figures, or a fixed score, in examples. The user's rule is that no number appears without a source and no score is shown as measured.

Keyword scan (the standard word list, noted and not blocking): 23: post; 69: email; 75: email; 271: email.
The file asks for no network, no login and no posting. It has no scripts.

## The user's overrides (they take precedence over the file)
1. Never invent numbers, quotes, outcomes, dates, titles or URLs. A missing number is written [NEEDS REAL NUMBER: what is missing]; any other missing fact [NEEDS: what].
2. Credit only the user's own work. Dossier sections 3.9 (work that is not theirs) and 3.10 (confidential items) apply. Confidential items never appear in a CV, case study, saved result or the app.
3. Every claim cites a source with a short verbatim quote (the dossier, an onboarding answer, evidence, or the user in chat).
4. Match scores and ATS scores are labelled "AI estimate", never presented as measured. Ignore any "estimated new score" the file asks for.
5. Never overwrite growth/cv/CV.pdf or .html except through "cv promote".
6. The file is method only. Nothing is posted, sent, emailed or published. No bundled script is run.
7. No em dashes or en dashes in text shown to the user. Plain second person.
If the file and these overrides disagree, these win.

## Enable decision
Installed enabled. Nothing was hidden: the built-in abilities stay.
