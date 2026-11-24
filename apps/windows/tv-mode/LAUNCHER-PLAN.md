# Launcher redesign (plan)

Goal: a night-time launcher that feels like a TV home screen: real service logos, Continue watching, recommendations from TMDB, short previews, a big thin clock. Black ground, dim red (#b00710) only for focus outlines, no large bright areas (DESIGN.md rules apply).

## Data

- TMDB credentials: `%APPDATA%\TVMode\tmdb.json`, read only in Go (`internal/tmdb`), never logged, never sent to a page. The launcher page only receives finished rows: `{title, year, poster, backdrop, trailerKey, service}`. Posters and backdrops are fetched by Go and served from `127.0.0.1:8770/img/<hash>` (cached under `%LOCALAPPDATA%\TVMode\cache`, 7 days), so the page never sees the key and never hits TMDB.
- `internal/tmdb`: `Trending(region)`, `Providers(id)` (watch providers for IN: Netflix 8, Prime 119, JioHotstar 2336 / 122, YouTube none), `Detail(id)` for the trailer key. 24 h cache on disk, refresh in the background at start and at 03:00; offline = last cache, no error shown.
- `internal/history`: Continue watching. Poll loop already knows the URL, title (document.title) and media position/duration of the current service page; on a change of title or every 30 s while playing, store `{service, url, title, pos, dur, thumb, at}` in `%APPDATA%\TVMode\history.json` (max 12, newest first, dedup by URL, drop when pos/dur > 0.95). Thumb = the page's `og:image` read through CDP once per title. Netflix (external Chrome, see NETFLIX-PLAN.md) has no page access: store only service + "last opened".

## Launcher page (web/launcher)

- Top: big clock, Segoe UI Light 160px (2x current 80px), date under it in muted grey, status (phone, sleep) small at the right.
- Row 1: four service tiles with real logos (SVG, monochrome light grey on #141414; Netflix, Prime Video, JioHotstar, YouTube wordmarks/marks as inline SVG files in `web/launcher/logos/`, used only as the launch tiles for these services). Focus = #141414 tile with 3px #b00710 outline (existing `.mark.on`).
- Row 2: Continue watching (poster tiles 16:9, progress bar under each, 4 px, light grey fill). OK opens the stored URL in its service (`open` message gains `url`; Go validates host against the service list before navigating).
- Row 3: Trending on your services (TMDB, filtered by providers available in IN, deduped across services); OK opens the service's search page for the title (no deep links exist for sign-in-gated pages), or the title page URL when the service is YouTube.
- Previews: when a tile has focus for 1.2 s, the backdrop area behind the rows crossfades to a muted TMDB trailer (YouTube embed `youtube-nocookie.com`, muted, loop, 30 s, `playsinline`) at 35% brightness. Off when the PC is on battery or `previews:false` in config. Never autoplay with sound.
- Navigation: the existing d-pad/focus socket messages (`focus`, `open`) extended to a 2-D grid `{row, col}`; the phone d-pad up/down moves rows, left/right moves columns; Back does nothing on the launcher (unchanged).
- Everything reads at night: no tile brighter than #1f1f1f, text #e6e6e6 / #9a9a9a, posters dimmed with a 25% black overlay.

## Files

`internal/tmdb/tmdb.go` (+ test with a fake HTTP server), `internal/history/history.go` (+ test), `internal/app/launcher_data.go` (state `rows` frame on `/ws/screen`, `/img/` handler in `server.go`), `web/launcher/{index.html,launcher.css,launcher.js,logos/*.svg}`, PROTOCOL.md (new `rows` and `open` fields), DESIGN.md (tiles, rows, clock 160px).

## Checks

1. `go vet`, `go test` (tmdb parse/cache, history dedup/trim), `node --check`.
2. Smoke: launcher loads with a canned rows frame; d-pad moves across 3 rows; OK on a Continue tile opens the stored local test URL; no request to `api.themoviedb.org` from the page (network list), the key never appears in page text or the log (grep the log and page HTML for the key prefix).
3. Screenshot at 1920x1080, check no area brighter than #1f1f1f except text and the QR plate.
4. Dev: look at it on the TV at night; previews and clock size are the knobs.
