# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated by Dev (2026-10-31): Next.js on Vercel, with fonts analysed ahead of time so matching runs fast in the browser. Chosen because it is a public web tool and matches Dev's existing setup.

## Users

Designers who need the right typeface for a project and find it easier to shape what they want than to name it. They are looking for a font, not learning type design. Someone with no type-design training must be able to use the tool.

## Product Purpose

A font builder and chooser. The person shapes one letter until it looks right, and the product finds the real free fonts closest to it.

Success: a designer reaches a real font they want to use by shaping a letter, without browsing long font lists or knowing type terminology.

## Positioning

Font directories make you search by category and scroll. Here the search query is a letter you shaped yourself. An engine has measured the letters of every font in the library, so a shape you made by hand can be compared with real fonts directly.

## Operating Context

The core flow:

1. The person types a word or sentence. A preselected word is there from the start.
2. They double-click a letter and it zooms in.
3. They change that letter: edge, thinness, width, roundness and style.
4. They zoom out and every other letter has changed to match.
5. They press "Closest to this" and get the closest real fonts.

## Capabilities and Constraints

Confirmed:
- **Font engine.** Analyses every letter of every font: curves, thinness, style, spacing and similar attributes.
- **Master letter.** One letter drives the whole alphabet. The person, or the product's guidance, picks the letter that carries the most attributes.
- **Two ways to edit.** Toggles, including a swapper between styles and thinness, and direct pointer editing on the letter.
- **Rules keep edits valid.** Editing must be intuitive and must follow rules, so that anyone can use it and a letter cannot end up broken.
- **Closest to this.** The end result is the closest real font.
- **Library goal.** As close as possible to all the free fonts in the world, starting with all of Google Fonts, because matching is only as good as the library.
- **Closeness in plain words and a percentage.** Each result says what matches and what differs, and shows a match percentage (Dev, 2026-10-31). The percentage must be calibrated, because raw match distance did not track quality in the spike.

- **Rule-based handles.** Pointer editing uses a few handles on the zoomed letter, such as stem width, curve roundness and corner softness. Each handle changes a measurement. Letters are drawn from real variable fonts made by type designers, driven through their axes, so every setting stays clean. Dev chose this on 2026-10-31 after the hand-built letter generator failed. Controls promise only what real axes can do.
- **Any letter can be opened.** Every edit reaches the alphabet, and the product marks the letter that carries the most character.
- **The reveal.** While zoomed in, the person sees only the letter. The whole word changes on zoom out.

Undecided:
- Product name. `font-engine` is only the folder name.
- Which font sources make up the library, and in what order. Each font's licence must allow this use.
- Scripts beyond Latin.
- Which attributes are exposed, and which letter is marked as carrying the most character.
- Which sources beyond Google Fonts join the library. Dev wants 1001 Free Fonts and others too; each one's licence and terms must be checked first.
- Exporting a person's design as a font file. Not part of the end result Dev chose.

## Evidence on Hand

Matching spike, 2026-10-31 (`font-engine/spike/report.html`): 304 free font families analysed, all under open licences. In its first read, roughly half of the top-5 matches for crude shaped letters looked acceptable. That read was made by the agent that ran the test, not by a designer, and the letters came from a crude generator. Raw match distance did not track match quality. Matching several letters beat matching one.

No users and no production library yet. Do not invent font counts, accuracy figures or testimonials.

## Product Principles

1. **Shape, don't search.** The letter is the query. Filters and categories are not the main path.
2. **One letter, whole alphabet.** Every edit visibly reaches the other letters.
3. **Rules make it safe.** Anyone can push any control, and the result stays a working letter.
4. **The match has to be real.** Every result is a real font someone can get and use, and the product shows how close it is.
5. **Depth on demand.** Simple on first contact. The deeper design of the letter is there for anyone who zooms in.
