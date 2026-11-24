# TV Mode Prime Skip

A small Manifest V3 extension for TV Mode's Edge. Runs only on Prime Video pages
(primevideo.com, and amazon.in / amazon.com under /gp/video).

What it does: clicks Prime's own skip-ad, skip-intro, skip-recap and next-episode
buttons when they appear; during unskippable ads it mutes, plays at 8x and jumps
to the end of short ads, then restores mute and speed.

Where the logic came from: the skip selectors, ad-indicator selectors and the
mute / 8x speed-up / restore idea were read from engine.js of the Chrome Web
Store extension "Ad Skipper for Prime Video" (id pgmodkjklhaccjaidgakcafnieoapeie,
v1.0.29). Code was rewritten from scratch, nothing copied.

Removed: the background worker (it opened a survey page and set data-sharing
flags to true), amazon.min.js and typ.min.js (sent data to metricmuse.xyz and
metricsmint.quest, read cookies), the options/popup/banner pages, the storage
and host permissions. This version has no permissions, no network calls, no
cookies, no storage and no remote code.
