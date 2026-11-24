# TV Mode Helper (was "TV Mode Netflix Remote")

Version 2.0 also serves Prime Video and JioHotstar in Chrome: it reports what plays (twice a second, only on the player; during an ad it still answers commands but writes no history), takes the phone's commands back (seek, scrub, speed, play/pause, skip, subtitles and audio) and records episode addresses for the Episodes tab. Scripts: `core.js` (shared), `prime.js` (also the ported Prime Skip), `hotstar.js`, `tracks.js` (the subtitles menu reader); the folder name stays `netflix-dpad` so the extension only needs its reload arrow pressed. Mock-page test: serve this folder over http and open `test/helper-mock.html?svc=prime|hotstar|prime-links|hotstar-links`.

A tiny Chrome extension that gives Netflix a proper TV d-pad (Up/Down between rows, Left/Right along a row, paging the carousels, Enter, Back) when TV Mode shows Netflix in your own Chrome.

It runs only on `https://www.netflix.com/*`. It uses no cookies, no tracking and no remote code. It also takes TV Mode straight to a title or an exact episode: TV Mode opens the search with a `#tvgo=` note, and `go.js` finds the title, reads its episode ids from Netflix's own metadata request and starts the episode where Dev stopped. Its only outside network use is its background worker POSTing three small reports ("hello", what is playing, and the addresses it found) to TV Mode on this PC at `http://127.0.0.1:8770/api/ext/*`.

## The phone's player controls (1.2)

On the player it reports the time twice a second, so the phone shows it and the pad becomes the player pad by itself. The same report collects the phone's commands: scrub and seek go to Netflix's own player through `player.js` (it runs in the page, because Netflix stops with an error when the video's time is written directly), and Subtitles and Skip press Netflix's own buttons. A command that waits more than 2 seconds is dropped, never run late.

## Install (once, 4 steps)

1. In Chrome open `chrome://extensions`.
2. Switch on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder: `tv-mode\extensions\netflix-dpad`.
4. Close the Netflix window in TV Mode and open Netflix again (or reload it). TV Mode notices the extension within a minute and then sends real arrow keys.

Already installed an older version? Press the reload arrow on its card instead, and check the card says 1.2.0.

If you edit the files, press the reload arrow on the extension's card, then reload Netflix.

## Keys

- Arrows: move between titles; at a row's end the carousel pages by itself.
- Enter: open the focused title or press the focused button.
- Backspace / Back: close the open title panel; otherwise go back.
- On the player (`/watch`) arrows seek and Space pauses as usual; Back/Escape leaves.

## Tests

`node --test extensions/netflix-dpad/test/nav-core.test.js`
