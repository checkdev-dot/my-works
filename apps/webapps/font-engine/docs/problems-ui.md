# UI problems found in the running app

2026-11-03. App at http://localhost:4330, headless Chrome at 1440x900 and 1280x800 (one run at 1000x700). No code was changed. Screenshots are in `docs/cases/ui/`. Items marked TOP10 are the ones that most block a person's journey. Fixes are one line each.

Not repeated here: things already in `failure-cases.md` as open (spec features not yet built such as handles on the letter, Compare, Try, Not this, shortlist, pins, three doors) are only listed where the missing piece hurts a visible journey (U2, U30).

## Top ten (most journey-blocking)

U1, U2, U3, U5, U8, U11, U14, U16, U19, U27.

## List

**U1 TOP10. Four of the nine dials start below the fold and nothing says so.**
Did: opened the app at 1440x900 and 1280x800 with Plain. Went wrong: the rail scrolls (1140 px of content in 840 px, 740 px at 1280). Tall letters is cut in half by the sticky footer, Tails, Capitals and Thick-thin are invisible, there is no scroll cue. At 1280 only Openings is fully visible. Screenshot: `rest-1440.png`, `rest-1280.png`, `rail-scrolled.png`. Fix: tighten row height or add a "4 more" fade and cue, so every dial is reachable at a glance.

Status: fixed. The rail now holds six dials (Thick, Wide, Lean, Openings, Middle height, Thick-thin, per controls-v4 section 3), tiles are pinned above and the footer below, rows are tighter. At 1440x900 and 1280x800 nothing scrolls. A fade and an N more below cue appear if a screen is ever shorter. Tall letters, Tails and Capitals moved to the zoomed view, on the letters they change.

**U2 TOP10. Nine dials in the zoomed view, up to six of them dead for the letter you opened.**
Did: opened every letter of Hamburg and moved each dial min to max, comparing pixels. Went wrong: H has no effect from Middle height, Tall letters, Tails; m from Tall letters, Tails, Capitals; b from Tails, Capitals; u and r from Tall letters, Tails, Capitals; g from Tall letters, Capitals. The controls are shown as live (C10). Screenshot: `zoom-plain-L0.png`, `zoom-plain-L2.png`. Fix: hide or disable a dial with a one-line reason when it cannot change the open letter.

Status: fixed. Which dials change which letter was measured from the font outlines (scripts/make-glyph-data.mjs, lib/glyph-data.json) and matches the table in this item exactly. The zoomed panel lists only dials that move that letter, with one line naming the others. The rail hides a dial no letter of the word uses.

**U3 TOP10. The 24-character cap and character filter silently rewrite what the person typed.**
Did: typed "Route 66", "Hello, world!", "Pack my box with five dozen liquor jugs", Cyrillic and Chinese. Went wrong: the field became "Route ", "Hello world", "Pack my box with five do", and non-Latin vanished, with no message. Screenshot: `word-long40.png`, `word-num.png`, `word-nonlatin.png`. Fix: show "24 letters, Latin only" under the field and a counter, and say why a character was dropped.

Status: fixed. The field keeps every character all four fonts can draw (316, measured from their cmaps, so digits and punctuation now work), shows a 7/24 counter and a standing line, and names anything it leaves out ("Left out ... These fonts draw Latin script only.", "Kept the first 24 characters, left out 15.").

**U4. The page never says Latin only, and nothing appears under 1024 px.**
Did: loaded at 1000x700. Went wrong: no "Latin only" copy anywhere, no "Works best on a laptop or desktop" message; the layout just squeezes (word 231 px, label clipped). Screenshot: `narrow-1000.png`, `narrow-1000-results.png`. Fix: add both lines from the spec.

Status: fixed. "Latin script only, up to 24 characters." sits under the field, and under 1024 px the bar shows "Works best on a laptop or desktop." in place of the status line.

**U5 TOP10. Empty or space-only word gives a blank sheet with no explanation.**
Did: cleared the field, then typed three spaces. Went wrong: the sheet is empty, the button is greyed with no reason, the teach line still says "Double-click any letter", the Feet tile shows an "a" because nothing is marked. Screenshot: `word-empty.png`, `word-space.png`. Fix: show "Type a word to start" on the sheet and restore the default word on blur.

Status: fixed. An empty or space-only word shows "Type a word to start." on the sheet and under the field, Closest to this is disabled with a title, the teach line and specimen are gone, and leaving the field restores Hamburg.

**U6. Word size jumps wildly with length and the type is tiny for sentences.**
Did: typed "a" (320 px), "Straße" (207 px), a 24-letter sentence (54 px). Went wrong: a single letter is huge, a sentence is small, and the size changes as each character is typed. Screenshot: `word-one.png`, `word-sent.png`. Fix: smooth the size change and wrap sentences to two lines instead of shrinking.

Status: not fixed. Word size is still set once per word to fit the widest dial settings (controls-v4 section 6), so a single letter is large and a sentence is small. Wrapping sentences to two lines is a layout change I left alone.

**U7. A hovered letter's box cuts through the "carries the most character" label.**
Did: hovered b while the marker label was showing. Went wrong: the hover rectangle starts at y 385 and runs through the label text; the "double-click to open" chip appears under the descender. Screenshot: `hover-letter.png`. Fix: hide the marker label while any other letter is hovered.

Status: fixed. The marker label fades while any other letter is hovered.

**U8 TOP10. Focus stays on an invisible letter after opening a letter by keyboard, and zoom controls are far from the tab order.**
Did: Tab to a letter, Enter, then Escape and Tab. Went wrong: focus remains on the hidden word letter (opacity 0); Tab walks the hidden letters before reaching Zoom out; after Escape focus is on the letter but the view changed. Screenshot: `kbd-open.png`. Fix: move focus to Zoom out on open and back to the opened letter on close, and make the hidden word inert.

Status: fixed. The hidden word is inert while zoomed, focus moves to Zoom out on open and returns to the opened letter on close (Enter, Escape or the button). Checked in headless Chrome.

**U9. Tab order puts the Closest button before the tiles, dials and letters.**
Did: pressed Tab 30 times. Went wrong: order is word, Closest to this, tiles, nine dials, Reset, then letters. Undo is skipped when disabled with no hint. Fix: put the button last, after the letters.

Status: fixed. Closest to this is last in the DOM and sits top right by CSS. Tab order is word, tiles, dials, letters, Closest.

**U10. Keyboard users are only told about double-click.**
Did: read the teach line and tips. Went wrong: "Double-click" appears three times; Enter works but is never mentioned. Screenshot: `focus-letter.png`. Fix: say "Double-click or press Enter" and show it on focus.

Status: fixed. Teach line, hover tip and marker label now say "double-click or press Enter".

**U11 TOP10. Switching to a tile with a wider word overflows the sheet and clips both edges.**
Did: at 1280x800 with results open, Wide at max on Plain, then clicked Feet. Went wrong: Hamburg is cut off at left and right, and the label runs off. This is N24 again, size is computed for Plain only. Screenshot: `res-switch-mid.png`. Fix: compute width from all four tiles at the current Wide, or clamp the word to the sheet.

Status: fixed. Word size now measures all four tiles at their widest Wide, and a clamp (squeeze to 90 percent of the sheet) keeps the word inside the sheet whatever the dials do. Checked at 1280 with results open: Wide at max, then Feet, Squarish, Plain all leave 46 to 66 px each side.

**U12. Plain Wide at max with results open leaves 11 px margin at 1280.**
Did: 1280 wide, Wide max, Closest. Went wrong: word runs 291 to 869 inside a 280 to 880 sheet; the marker label nearly touches the rail edge. Screenshot: `res1280-wide.png`. Fix: reserve 8 percent side padding.

Status: fixed. Same clamp: at Wide max with results open the margins are 46 to 84 px at 1280, not 11 px.

**U13. The word jumps sideways when results open and close.**
Did: clicked Closest, then Hide. Went wrong: the sheet shrinks from 1160 to 760 px and the word slides 150 px left in one frame, back on Hide. Screenshot: `res-done.png`, `res-hidden.png`. Fix: animate the sheet width and the word position together.

Status: fixed. The results column grows in and out inside a slot (260 ms and 240 ms), so the sheet and the word glide instead of jumping. The slot wraps the column; Results.tsx and its CSS are unchanged.

**U14 TOP10. Zoom out ends with a 140 px horizontal jump.**
Did: opened g, thickened, clicked Zoom out, captured frames. Went wrong: during the animation the word is centred on the full 1440 px sheet, then the rail returns and the word jumps right to centre in 1160 px. The rail also appears all at once. Screenshot: `anim-out-250.png`, `anim-out-700.png`. Fix: keep the rail width reserved (visibility hidden) while zoomed.

Status: fixed. The zoomed dial panel now sits in the rail's place, so the sheet never changes width between word and zoom. Zoom out lands without a horizontal jump (word left edge 628 before and after; frames show no 140 px shift). The rail fades back in.

**U15. The zoom-in animation shows the whole word ghosted behind the large letter.**
Did: frame at 60 ms after double-click. Went wrong: faded "Hamburg" overlaps the scaling g, against "only the letter shows". Screenshot: `anim-open-60.png`. Fix: fade the word out in the first 100 ms before scaling.

Status: fixed. The word fades out in 90 ms, before the letter scales.

**U16 TOP10. Closest results are not marked stale, and Closest to this stays unlabeled once results are open.**
Did: ran Closest, moved Thick to 90 percent. Went wrong: the results column still shows the old fonts and old "Yours" with no "out of date" note; the only cue is a small cobalt square on a black button (low contrast, one colour mark, no word in the column). Button never reads "See all" while open. Screenshot: `res-stale.png`. Fix: grey the column with "Out of date, match again" at its top.
Status (results column): partly. Results.tsx now takes `stale` and shows an "Out of date" bar with a Match again button, greys and hatches the rows, and labels Yours "Yours when you matched". Editor.tsx must pass `stale={stale}` and `onMatchAgain={runMatch}` to `<Results>` (not done, Editor is the other agent's file) and change the top button label to "Match again" (it still reads "Match again · changed"). Verified on a test page that mounts Results with `stale` on.

**U17. Results keep every dial change silently when the tile is switched.**
Did: switched Plain to Feet with results open. Went wrong: "Yours: Roboto Flex at your settings" remains though the sheet is Feet. Screenshot: `res-switch-done.png`. Fix: label Yours with the tile and settings it came from.
Status (results column): fixed once `stale` is passed (see U16). Yours is labelled with the tile ("plain letters") and reads "Yours when you matched" when stale. A tile switch while open counts as stale because Editor's key includes the family.

**U18. "Same weight." is printed on rows that are visibly lighter or heavier than Yours.**
Did: first run on defaults. Went wrong: Gothic A1, Glory, Signika Negative 300 look lighter than Yours yet say "Same weight."; "Signika Negative 300" prints weight 300 in its own name. Almost every row starts "Same weight." so the differences are not informative (C21, C24). Screenshot: `res-done.png`. Fix: compare measured stem and drop "Same weight" when it holds for all rows.
Status: fixed in the UI. Stem thickness of every row is measured from real pixels (an H drawn on canvas, against x-height) and compared with Yours. A row is said to be "Heavier strokes" or "Lighter strokes" when it differs by more than 15 percent, and "Same weight" is never printed over that. Match phrases shared by 70 percent of rows move into one summary line, and the summary drops the weight claim when over a quarter of rows are measured lighter or heavier. The API's weight group still says "same weight" for rows that look lighter (heavy Roboto Serif, Thick 95: 7 of 12 rows). That is a matching problem for the matching list: weight distance is not stem-against-x-height. Signika Negative 300 keeps its weight in the name as a muted suffix, which is the style that matched.

**U19 TOP10. Match percentages look flat: ten rows all say "close" between 76 and 89 percent, with no way to act on a bad one.**
Did: ran Closest on default and on black. Went wrong: no Compare, no Not this, no way to set Yours beside a row; only a tiny Get it. A designer cannot judge the match. Screenshot: `res-done.png`, `res-bottom.png`. Fix: add Compare (overlay on Yours) and Not this per row.
Status: partly. Added per-row Compare (cobalt hairline outline of Yours laid on the row's sample on a shared baseline) and left a `.res-slot` after it for Keep. Rows are told apart by one difference sentence first, with the band word shown on a row only when bands differ and said once in a summary line ("All 12 read close, 84 to 89%"). Vetoed rows say which groups are far off from `vetoGroups`. Not done: Not this (needs re-query with a group re-weighted, so it needs a matching option), Compare's Blink and a second tick, Close and Not close. The API gives no signal that separates 84 from 89 beyond the number.

**U20. Loading state is an unlabelled hairline.**
Did: screenshot 460 ms after clicking Closest. Went wrong: each row shows a thin line where the sample goes, with the sentence and Get it below; it looks like a divider, not loading. Screenshot: `res-t1.png`. Fix: show "Loading preview" at row height.
Status: fixed. Each loading row shows a tinted block at row height reading "Loading preview".

**U21. Closest button flips to "Measuring" with no motion and no timing.**
Did: clicked and watched. Went wrong: label changes, but the column shows "Measuring your letters" text only under a header; no progress. Screenshot: `res-t0.png`. Fix: add a quiet progress line.
Status: fixed. While measuring or searching the column shows a cobalt progress line under the header, the status words, and four placeholder rows. Yours is hidden while the old one would be wrong.

**U22. Hide drops focus to the page body.**
Did: clicked Hide. Went wrong: focus on BODY, so keyboard users lose their place. Fix: return focus to the Closest button.

Status: fixed. Hide returns focus to Closest to this (checked). The Hide button itself is in Results.tsx and was not touched.
Status: fixed. Hide returns focus to the top Closest button (looked up as `.bar .btn`, so it depends on that class).

**U23. The results header repeats the button name and Hide is a small underlined word.**
Did: opened results. Went wrong: "Closest to this" heading beside a "Closest to this" button; Hide has a 32 px target and looks like a link. Fix: name the heading "Closest real fonts" and use the same button style as Close.
Status: fixed. Heading reads "Closest real fonts"; Hide is a bordered 36 px button, same family as Match again.

**U24. Reset with nothing changed enables Undo for a step that does nothing.**
Did: pressed Reset immediately, then Undo. Went wrong: Undo became active and Undo did nothing visible. Clicking a track at its current position does the same. Fix: only push history when state differs.

Status: fixed. Reset all is disabled at home. A click on a track at its current position, or a drag that does not change the value, no longer pushes an undo step.

**U25. Reset switches the tile, even while zoomed, with no warning.**
Did: Squarish, opened a, pressed Reset. Went wrong: the letter becomes Plain's a and the dial set changes from two rows to nine, mid edit. Reset always enabled. Screenshot: `reset-in-zoom.png`. Fix: reset only dials in zoom, and label the rail one "Reset all".

Status: fixed. In the zoomed view the button reads "Reset these" and resets only the dials shown. The rail one reads "Reset all" and is disabled at home.

**U26. Switching tile silently hides dials, while their values still apply when switching back.**
Did: Plain Lean 80 and Openings 90, then Squarish, then Plain. Went wrong: Squarish shows two rows, no note that Lean and Openings exist elsewhere or are held; the rail jumps from 9 rows to 2 with a big empty gap above the footer. Screenshot: `to-squarish-hidden-dials.png`, `plain-lean-open.png`. Fix: show greyed rows with "Plain only".

Status: fixed, with a different fix from the one suggested. controls-v4 says absent dials are never grey, so the rail shows one line ("Lean, Openings, Middle height, Thick-thin live on Plain. Your settings there are kept.") instead of greyed rows.

**U27 TOP10. Closest to this is available while zoomed and opens results beside the zoom panel with no way back to the tiles.**
Did: zoomed in, clicked Closest. Went wrong: results open to the right of the dial panel (300 + 400 px beside a 740 px sheet), the letter is squeezed, tiles are hidden; matching also uses the state, but the person cannot change tile while zoomed. Screenshot: `closest-in-zoom.png`. Fix: zoom out automatically before matching.

Status: fixed. Closest to this while zoomed zooms out first and starts the match when the word is back (v4 option, not disabling).
Status (results half): not fixed here. Results.tsx cannot decide when it opens. Editor.tsx's runMatch should call zoomOut first (or the top button should be disabled while zoomed with a reason). The column itself does not break at 400 px; long words are scaled to fit with one factor for Yours and all rows.

**U28. The word input is disabled in zoom and looks like a dead field.**
Did: opened a letter. Went wrong: the input greys with no explanation. Screenshot: `kbd-open.png`. Fix: hide it or add "Zoom out to change the word".

Status: fixed. While zoomed the line under the field reads "Zoom out to change the word."

**U29. Zoomed letter sits off-centre with a wide empty band before the panel.**
Did: opened every letter. Went wrong: the letter is centred at 32 percent of the sheet, leaving a 500 px blank gap before the dial panel; letters do not sit on a grid line in zoom (baseline at 598 between lines), so the grid reads as arbitrary. Screenshot: `zoom-plain-L6.png`. Fix: centre in the free area and snap the baseline to a grid line.

Status: fixed. The letter now centres in the sheet, its baseline stands on a major grid line (checked, offset 0), and Z is smaller so tall and deep extremes stay in view.

**U30. No direct editing on the letter (spec's rule-based handles).**
Did: tried to drag the letter's edges. Went wrong: nothing responds; zoom is the same slider list as the rail (C31, "no duplicate control sets"). This makes zoom feel pointless. Screenshot: `zoom-plain-L0.png`. Fix: build the handles, or say plainly why zooming helps.

Status: partly fixed. Square handles sit on the measured outline edge (from fontkit at the current axes) for Wide (right edge), Capitals, Tall letters, Middle height (top edge) and Tails (bottom edge) where the edge moves monotonically and travels at least 80 px; each gets a short leader and a verb label, drag follows the pointer through a 25-step table inverted by interpolation (a 30 px drag moves the square 30 px; 20 px up on a capital H moved it 20 px), out and right are more, ends stop dead with "That is as far as this letter goes", arrows work (Tails: Down is more). Handled dials are not also rows. Not built: Thick, Lean, Openings and Thick-thin handles (no single clean edge), the hairline ghost of the start, hover ghost at the far end, and the five-handle selection rules. Those stay as rows.

**U31. Zoom panel overflows by 14 px and Thick-thin end labels touch the bottom bar.**
Did: measured. Went wrong: panel scrollHeight 790 vs 776, last end labels at y 816 against a bar at 836, so a scrollbar appears on shorter screens. Screenshot: `zoom-plain-L0.png`. Fix: add bottom padding and reduce row spacing.

Status: fixed. The zoomed panel no longer overflows (scrollHeight equals clientHeight) at 1440x900 and 1280x800.

**U32. Footer rail text and Undo/Reset sit over a clipped Tall letters label, and a thumb peeks beneath the footer.**
Did: scrolled the rail after focusing Tails. Went wrong: a blue thumb square appears left of the footer text at the bottom edge. Screenshot: `focus-letter.png`. Fix: clip the rail content above the footer.

Status: fixed. Tiles and footer are outside the scrolling area, so nothing peeks under the footer.

**U33. Disabled Undo and disabled Closest fall below contrast.**
Did: computed colours. Went wrong: disabled Undo is 3.48:1, below the 4.5 target. Fix: use #5f6470 for disabled text.

Status: fixed. Disabled text is #5f6470 (about 5.4:1 on the rail grey).

**U34. Several labels are 13 px, under the spec's 14 px floor.**
Did: scanned font sizes. Went wrong: end words (hairline, black), Back, and the "Chosen" label are 13 px. Fix: set 14 px.

Status: fixed for everything outside the results column. Row end words, Back and the tile label are 14 px. In Results.css `.res-rank` is 13 px and `.res-pct small` 12 px, which belong to the results agent.

**U35. Cobalt is used as text ("Chosen").**
Did: read the tile. Went wrong: the spec says cobalt is marks only; "Chosen" overlaps the top right of the tile letter. Screenshot: `rest-1440.png`. Fix: show the chosen state with the underline and ink text.

Status: fixed. No cobalt text. The chosen tile shows the cobalt underline, a semibold ink name and a screen-reader "(chosen)".

**U36. The four tile letters look nearly identical.**
Did: compared tile a's at 48 px. Went wrong: Plain, Squarish and Rounded ends all show a similar "a", so the tile does not teach the difference; Plain at hairline is almost invisible in the tile. Screenshot: `tile-Plain-lo-1440.png`, `rest-1440.png`. Fix: show the family's most distinctive letter at 64 px.

Status: partly fixed. The tile letter's weight is clamped so Plain at hairline stays visible. The marked letter is still the same "a" for three tiles, as controls-v4 section 3 specifies, so they still look alike at small size.

**U37. Tile names are internal-sounding and "Feet" lacks explanation.**
Did: read the rail. Went wrong: "Plain", "Squarish", "Feet" with no hover text; Rounded ends wraps close to its edge. Fix: add a one-line description under each on hover and focus.

Status: fixed. Hover and focus on a tile show "Roboto Flex. Even and neutral." under the tiles, and the tile has a title.

**U38. "hairline" and "black" end labels lie on Nunito and Saira.**
Did: Rounded ends Thick at min. Went wrong: min is ExtraLight 200 and max is 1000, not hairline. Screenshot: `tile-Roundedends-lo-1440.png`. Fix: derive end words per family.

Status: fixed. End words are per family (Rounded ends: light to black).

**U39. Middle height, Tall letters, Tails, Capitals and Thick-thin barely move the word.**
Did: contact sheet of min and max for each dial on "Hamburg Jqy". Went wrong: the difference is a few pixels at word scale, so the dials look broken (C10, "effects hidden on the current letter"). Screenshot: `plain-dials-contact.png`. Fix: show the visible change in the readout or merge them into one "Proportions" dial.

Status: partly fixed. Tall letters, Tails and Capitals are no longer in the rail, and in zoom they appear as handles on the letter where the change is large. Middle height and Thick-thin still move the word a few pixels.

**U40. Hairline-and-narrow combination is unreadable and shrinks to a tiny word on a huge sheet.**
Did: all dials at min. Went wrong: the word is 130 px wide on 1160 px, letters are threads. Screenshot: `plain-all-min.png`, `plain-dials-contact.png`. Fix: set a floor on combined thinness with a "very thin" note.

Status: not fixed. The width clamp stops overflow, but a very thin and narrow word is still small on a large sheet, as the fixed word size (v4 section 6) implies. No thinness floor added.

**U41. All-max fills the sheet edge to edge.**
Did: all dials at max. Went wrong: word nearly touches both edges, the marker label crosses the grid. Screenshot: `plain-dials-contact.png`. Fix: reserve padding and clamp.

Status: fixed by the same clamp. The word never takes more than 90 percent of the sheet.

**U42. The sheet is mostly empty.**
Did: viewed rest state. Went wrong: the word takes 549 x 176 px of 1160 x 840; top 300 px and bottom 300 px are blank; the teach line is pinned at the bottom 400 px away from the word (C7). Screenshot: `rest-1440.png`. Fix: add the specimen strip or raise the word and teach line.

Status: partly fixed. A specimen strip (Headings and Small text, live with the dials) now sits below the word and the teach line is pulled up under it. The three doors are not built.

**U43. The teach line is far from the word and never goes away.**
Did: used the app. Went wrong: it stays after the person has opened letters. Screenshot: `rest-1440.png`. Fix: fade it after the first open.

Status: fixed. The teach line fades after the first letter is opened.

**U44. Marker label is cut off or collides at narrow sheets.**
Did: results open at 1000. Went wrong: "carries the most character · doub" is clipped at the sheet edge; the teach line is clipped on both sides. Screenshot: `narrow-1000-results.png`. Fix: flip the label side based on available room.

Status: fixed. The marker label picks the side with room and wraps to two lines if neither fits.

**U45. The word is not vertically centred when it wraps or has descenders; status line is truncated by ellipsis.**
Did: sentence at 1440. Went wrong: baseline fixed at 55 percent with huge blank above for sentences. Fix: centre sentences by line box.

Status: not fixed. The word is still a single line capped at 24 characters.

**U46. Status text is machine-like and mostly constant.**
Did: read the bar. Went wrong: "Whole word, rounded ends letters" is ungrammatical; it never says anything useful in word view. Screenshot: `tile-Roundedends-lo-1440.png`. Fix: say what changed: "Thicker and a little wider."

Status: fixed. The status line says what changed ("Plain, Roboto Flex. Thicker and a little wider."). Describe my letter and the strip generator are not built.

**U47. Click on a track pushes an undo step even for a plain click, and drags that start at the thumb jump.**
Did: pressed on the track away from the thumb. Went wrong: the thumb jumps to the pointer instead of dragging from where it is; each click is a step. Fix: grab the thumb with offset and ignore clicks that do not move.

Status: fixed. A press on the thumb drags from where it is. A click away from it still jumps, as v4 says, but only becomes an undo step if the value changes.

**U48. Double-click on a label to reset is a hidden gesture.**
Did: looked for it. Went wrong: only a title tooltip that appears after a delay; the Back link appears only after a change. Fix: keep Back always visible but quiet.

Status: fixed. Back is always shown, quiet and disabled when the dial is at home.

**U49. Undo has no feedback of what it undid.**
Did: Ctrl+Z, Undo. Went wrong: state changes silently and tile may switch. Keyboard test showed repeated Ctrl+Z at start does nothing. Fix: show "Undid Thick" for 2 seconds.

Status: fixed. Undo says what it undid ("Undid thick.", "Undid the switch to Squarish.") for about 2.4 seconds in the status line.

**U50. Keyboard Home and End jump to the extremes; a run is merged into one undo, including Home, End and arrows.**
Did: arrows, Shift, End, Home within 400 ms. Went wrong: one Ctrl+Z returned all of it. Fix: break the run on Home and End.

Status: fixed. Home and End are an undo step of their own.

**U51. Letters in words with spaces and double-click on a space do nothing, with no hint.**
Did: double-click on the gap in "ab cd". Went wrong: no feedback. Fix: show a not-allowed cursor.

Status: fixed. The cursor over a space is not-allowed.

**U52. No favicon or page heading, the tab says "Font engine".**
Did: read the head. Went wrong: tab title is the folder name; no h1 and no favicon. Fix: use the product name when decided and add an h1.

Status: partly fixed. Added a favicon (app/icon.svg) and a hidden h1 "Font engine". The tab title is still the working name.

**U53. Console shows an unused preload warning and a failed request on every load.**
Did: read console. Went wrong: the RobotoFlex.ttf preload is unused and a 404 appears in the console. Fix: remove the preload and find the missing URL.

Status: fixed. The unused RobotoFlex preload is gone and the console is clean at load. The 404 was the missing favicon.

**U54. Rail scrolling hides the tile selection.**
Did: scrolled the rail. Went wrong: the tiles and Character heading scroll away so the active family cannot be seen while setting lower dials. Screenshot: `rail-scrolled.png`. Fix: pin the tiles.

Status: fixed. Tiles stay pinned above the scrolling dials.

**U55. Fast repeated clicks on Closest and tile switches while searching run unguarded.**
Did: clicked Closest three times and switched tile during the search. Went wrong: the button is only disabled after the click; results complete for the earlier tile and Yours shows the old family without notice. Fix: ignore clicks while running and cancel a stale search.

Status: fixed. Clicks while a match runs are ignored, and if the letter changed during the search the stale results are dropped and the match re-runs for the current one.
Status (results half): not fixed here. The guard and the cancel of a stale search live in Editor.runMatch (ignore while running, drop results whose key differs from the current one). Results shows the stale bar if the finished result is for an older letter.

## Count

55 problems. Top ten: U1, U2, U3, U5, U8, U11, U14, U16, U19, U27.
