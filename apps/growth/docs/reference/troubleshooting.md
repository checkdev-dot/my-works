# Troubleshooting

Start with the check. From `app/`, run:

```
npm run check
```

It prints "Data OK" when your files are valid. An error names the file and the item. Warnings are worth fixing, but they do not stop the app.

## The app says "Claude is updating your data"

Claude or a script holds `app/data/.lock`. The app waits so your saves do not collide. It clears on its own when the work finishes.

If it stays for a long time:

1. Open `app/data/.lock`. It holds `by` and `started`.
2. If `started` is under 30 minutes old, another session is probably working. Wait, or ask that session to finish.
3. If it is old and nothing is running, say `fix my growth data` in Claude Code. If the lock was left by `onboarding-act`, its scripts clear a stale lock themselves when the owning process is gone or after 2 minutes.
4. Only as a last resort, delete `app/data/.lock` yourself.

A write that finds a lock answers `busy: true` and saves nothing. Send the same action again in a moment.

## The app will not load, or shows an error page

A data file will not parse. The error page offers "Restore the last good copy". You can also say `fix my growth data` in Claude Code. Claude runs the check, opens the named file, repairs the smallest thing and keeps every value you entered. Backups are in `app/data/.backups/<file>/`, the last 40 per file.

## Claude says "I can't find the Growth app"

The skill reads `~/.claude/skills/growth/config.json` for `growthRoot`. The folder moved, or the file is missing. Run `node install.mjs` again from `apps/growth` (add `--force` to replace the skill), or edit the path in `config.json`. Use forward slashes. Then restart Claude Code.

## Claude does not recognise a command

The skill is not installed, or Claude Code was not restarted. Check that `~/.claude/skills/growth/SKILL.md` exists, then restart Claude Code. See [Install](../getting-started/install.md).

## The CV honesty check will not pass

| Symptom | What to do |
|---|---|
| "The career file was not found" | Set `GROWTH_DOSSIER` to your career notes file before starting the app, or pass `--dossier <path>` to a script. The check fails closed without it. |
| "The deny-list was not found" or "is empty" | `app/cv/.denylist.json` is missing or has no terms. It is a JSON object with a `terms` list of phrases (and an optional `patterns` list). Add the confidential and not-yours terms from your career notes. |
| "N numbers have no quote behind them" | Add the number to a quote of that line's own source, save your fact as a note and cite it, or use a placeholder. |
| "not word for word" | Copy the quote again from the source. Check dashes, arrows and quote marks. |
| "still needs N facts" on promote | Say `fill in my CV`. There is no way around it. |
| "has no PDF yet" or "older than your last change" | Say `save my CV as a PDF` for that version, then promote. |

More refusals are listed in [Build an honest CV](../guides/build-an-honest-cv.md#when-a-line-is-refused).

## PDF export fails

The scripts use headless Microsoft Edge. If you see "Microsoft Edge was not found", set `GROWTH_EDGE` to a Chromium or Edge executable, or pass `--edge <path>`. In the app, use Print or save as PDF under **Your CV** on Hiring. On macOS and Linux you must set the path.

## The phone cannot open the app

1. Start the relay: `npm run lan`, in `app/`.
2. Use the pairing link the app shows, on the same Wi-Fi.
3. If it still fails, allow Node through Windows Firewall for private networks when Windows asks.

The app itself only listens on 127.0.0.1. Only the relay listens on the network, on port 4322.

## Port 4321 is in use

Another copy of the app is running. Stop it, or find what holds the port. The dev server always uses 4321, and the proxy only accepts requests with a host of `localhost:4321`, `127.0.0.1:4321` or `[::1]:4321`.

## Onboarding problems

| Symptom | What to do |
|---|---|
| "That is not the phrase. Nothing changed." | The erase phrase must be your whole message, typed exactly: `ERASE MY GROWTH DATA AND START OVER`. |
| The reset will not start because of a problem | The plan found a failing check or a fresh lock. Say `fix my growth data` first. It will not archive broken data over a good backup. |
| It will not move to the next round | A must-answer question has no answer, no unknown and no double skip. The message names the ids. |
| The check says a private Round 3 answer is in a public place | Claude does not change a true answer. It shows you both answers and asks whether to keep Round 3 private and Round 4 as it stands. |
| Rounds look wrong after a long break | Say `onboarding status`, then `resume growth start`. |
| I want to redo part of it | Say `redo round N`. Earlier answers stay as history. |

To undo a reset, Claude runs `onboarding-reset.mjs restore --from <backup folder>`. It verifies the manifest and puts files back byte for byte.

## G mini problems

| Symptom | What to do |
|---|---|
| "Wrong or missing guard" | Read `people/<id>/profile.json` again, say the name back to the person, then retry. The guard changes on open, rename, freeze and withdraw. |
| Claude asks "Which person?" | Your message named a different person, or no person was named recently. Answer with the id. |
| A person's file will not load | Run `node scripts/mini-act.mjs --person <id> --validate`. It needs no guard. Then write `{"type":"undo"}` to a JSON file and run `mini-act.mjs` with `--file`. Claude prints the exact commands. |
| The PDF says Draft | Facts are still needed. Fill them with `/g-mini <id> edit`, then rebuild. |
| The report refuses to build | It refuses when consent is missing, the honesty check fails, or private text would print. The message names what to fix. |
| An answer is refused because it reads like an instruction | Ask the person to say it another way, or store a short paraphrase. The original words are not stored. |

## Everything looks wrong after something changed

Say `undo`. Claude puts the files back as they were before its last change. If that is not enough, look in `app/data/.backups/` or `cv/drafts/_replaced/`. Nothing in Growth deletes those folders.

## Still stuck

Check the [FAQ](faq.md). Then run `npm run check` and `npm run trust` in `app/`, and read the lines they print. The [Scripts](scripts.md) page says what each tool does.
