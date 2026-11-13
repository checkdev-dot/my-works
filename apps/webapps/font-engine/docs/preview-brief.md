# Preview: shape brief

Status: confirmed by Dev 2026-11-03. Detail and template content are in `docs/preview-advice.md`.

## Job and audience
Designers, PR and marketing people who have shaped a letter and seen the results. Their question is no longer "which fonts are close" but "which of these works for my thing". Mode: Operate. The templates are tools for judging type, not decoration.

## Outcome and proof
The person keeps two or three fonts, sees them in real-looking work, and leaves with one preferred font, or a heading and body pair. Success means the decision happens in the preview, with no font list in sight. Templates must show what a typeface really does: small sizes, numerals, caps, long words, headline rhythm, body texture, buttons and labels.

## Direction
- **Keep, then preview.** Each result row gets `Keep`. Kept fonts go into a tray of three slots at the top of the right column. The cobalt square marks the preferred font. "Yours", the shaped font, is always a fourth slot, so preview works even before matching.
- **Compare first, Pair on one switch.** Compare is the default: one font fills every text role, and you flip between rivals. Pair uses slot order as the role: preferred for headings, the next for body, the third for accent. People never assign roles. One `Swap` exchanges headings and body.
- **UI or Graphics, one toggle on the right.** UI is type that is read and used on screen. Graphics is type looked at as an image.
- **Seven templates in all.** UI has 4: Dashboard, Phone app, Document (press release), Slide. Graphics has 3: Poster, Social (post, story, banner), Brand sheet (wordmark, business card, packaging label).
- **Flipping fonts is a hard cut in place.** Click a slot or press 1, 2 or 3. There is no crossfade, so the eye sees what moved. Hold Space to flash to the preferred font. Switching between UI and Graphics is a short crossfade.
- **The typed word is the brand everywhere.** All other content is fixed and real, with no lorem ipsum. One paste box replaces body text. White or Ink paper.

## Scope
The first build is Keep and the tray, the stage with Dashboard and Poster, Compare with the hard-cut flip, and proper font loading. After that, in order: Phone, Pair with Swap, Document, Social, Slide, Brand sheet, paste box, Ink. Out of scope: side-by-side view, role picking, exporting templates, editable template layouts.

## States
- Empty tray: Yours only.
- Fonts loading: hairline bars until the font is ready, never a fallback font.
- One-weight families: Pair still works, and the template notes the missing weight. No synthetic bold or italic.
- A fourth Keep replaces the oldest slot that is not preferred, with an Undo line.

## Must never happen
Fallback fonts showing, layout jumping on a font switch (use fixed boxes), colour behind type that misjudges it, animated font swaps, questions in Pair, templates that read as a specimen page.

## Open
- Placement decided: the preview replaces the sheet, and the right column keeps the toggle, tray, templates and results.
- The visual world of the templates. Each template needs its own believable look, while the app stays neutral. This needs a direction round before building.

## Direction contract (picked by Dev 2026-11-03)
Applications Spread (seed:e70468fd2229c031). The seven templates are pages 7.1 to 7.7 of the brand manual for the typed word. Each piece is shown flat and frontal at a stated scale, on white paper on the app's grey sheet, with grey captions.
- Chosen sketch: `.impeccable/mocks/decision/preview-pick.html`. The build matches its arrangement, palette, type and density.
- Per-template layout, content, sizes and reveals lines: `.impeccable/decision/preview-templates.md`. Its inner layouts hold. Replace its edge-line chrome with this direction's manual chrome: an 11px grey running head (`Applications · 7.1 Web application`) top left, the page number top right, a caption under the piece (`Shown at 82 %. Minimum text size 13 px.`) and the reveals line. The thumbnails are a numbered contents list.
- The Brand page carries the wordmark at 120, 48 and 18 px with an x-height clear-space box in grey hairlines and a "Minimum size 18 px" line.
- Palette: white `#ffffff`, ink `#14161a`, cobalt `#2447f5` (flat, beside type and never under it), grey sheet `#e8eaee`, secondary `#4a4f59`.
- Kept from the challengers: tabular figures measured per font and reported in the caption; real density in tables; one errata line for degradation (`One weight · light line dropped`, `Did not load`).
- Risk to watch: captions must stay small and grey, so the piece reads as real work, not a page about work.
