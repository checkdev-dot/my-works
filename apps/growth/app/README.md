# Growth app

The Next.js 16 app behind Growth. The full story, install steps and privacy notes are in the [parent README](../README.md).

## Run it

```
npm install
npm run dev
```

Then open http://localhost:4321. The app reads your data from the `data/` folder next to this file. `data/`, `cv/` and `people/` are git-ignored; `install.mjs` (one folder up) creates them empty.

## Useful scripts

| Command | What it does |
|---|---|
| `npm run check` | Checks that everything in `data/` is valid. |
| `npm run verify` | Type-checks the app, then runs the data check. |
| `npm run onboarding:lint` | Checks the interview question bank. |
| `npm run cv:check` | Runs the honesty check on every CV version and case study. Needs `GROWTH_DOSSIER`. |

## Settings (environment variables)

| Variable | What it is for |
|---|---|
| `GROWTH_DOSSIER` | Path to your own career notes file (markdown). The honesty check reads it to confirm each CV fact has a source. Unset by default; with nothing set, the check says so and fails closed. |
| `GROWTH_BACKUP_DIR` | Where backups go. Set it to a folder outside any cloud-synced folder. |
| `GROWTH_COACH_SKILL` | Path to the growth-coach skill file, if you keep it somewhere other than `../skills/growth-coach/SKILL.md`. |
| `GROWTH_EDGE` | Path to a Chromium or Edge executable, for exporting the CV and G mini reports as PDF. |
| `NEXT_PUBLIC_GROWTH_FOLDER` | The folder name shown on the Commands page. Optional. |

## Left out of this copy

Tests and fixtures that embedded one person's real career notes were removed (`scripts/cv-test.mjs`, `scripts/cv-store-test.mjs`, `scripts/mini-test.mjs`). The remaining scripts use synthetic data.
