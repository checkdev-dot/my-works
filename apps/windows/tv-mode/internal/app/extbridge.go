package app

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"tvmode/internal/history"
	"tvmode/internal/tmdb"
)

// The "TV Mode Netflix Remote" Chrome extension (extensions/netflix-dpad) talks
// to these endpoints from its background worker. Loopback only: lanGate already
// refuses /api/ext/ from any other address because it is not a public path.

// extHelloAt is when the extension last spoke (unix ms). Any /api/ext/ call
// refreshes it, because Netflix is a single-page app and one page load can
// last for hours.
var extHelloAt atomic.Int64

// tvHelperAt is when the helper of the TV's own Chrome window last sent a report that passed
// reportAllowed (unix ms). Desk tabs never set it, so unlike extHelloAt it says this window's
// helper is there (tvHelperLiveSince).
var tvHelperAt atomic.Int64

// ExtensionPresent says whether the Netflix extension spoke in the last 10 minutes.
func ExtensionPresent() bool {
	t := extHelloAt.Load()
	return t != 0 && time.Since(time.UnixMilli(t)) < 10*time.Minute
}

// helperSeen says whether the extension ever spoke on this PC; a marker file
// remembers it across restarts (the episodes screen promises exact episodes then).
func (a *App) helperSeen() bool {
	if ExtensionPresent() {
		return true
	}
	_, err := os.Stat(a.helperMark())
	return err == nil
}

func (a *App) helperMark() string {
	return filepath.Join(filepath.Dir(a.recCachePath()), "netflix-helper-seen")
}

func (a *App) noteHelper() {
	if a.o.Test {
		return
	}
	if _, err := os.Stat(a.helperMark()); err != nil {
		_ = os.WriteFile(a.helperMark(), []byte(time.Now().Format(time.RFC3339)), 0o600)
	}
}

var reNetflixWatch = regexp.MustCompile(`^/watch/(\d+)`)

type extWatch struct {
	Title   string     `json:"title"`
	Episode int        `json:"episode"`
	Season  int        `json:"season"`
	EpTitle string     `json:"epTitle"`
	Pos     float64    `json:"pos"`
	Dur     float64    `json:"dur"`
	Playing *bool      `json:"playing"`
	URL     string     `json:"url"`
	CmdErr  string     `json:"cmdErr"` // the last player command that failed in the page (helper 1.2)
	Svc     string     `json:"svc"`    // netflix, prime or jiohotstar; absent in helper 1.3.0 (= netflix)
	Ad      bool       `json:"ad"`     // an ad shows on the player: not what he watches
	W       *watchPage `json:"w"`      // Prime, JioHotstar: the page snapshot services.JSWatch gives Edge
	Scr     *extScreen `json:"scr"`    // where the window is (absent in 1.3.0)
	Where   string     `json:"where"`  // "desk": a tab in Dev's desk Chrome (library only; see PROTOCOL.md "Library ingest"); absent = the TV's window
	Cov     float64    `json:"cov"`    // helper 2.4: the share of the window the main video covers (0..1)
	Rate    float64    `json:"rate"`   // helper 2.5.1: the main video's playbackRate (absent: 0)
	Final   bool       `json:"final"`  // desk only (helper 2.1): the last report of a play (paused, ended, page left); see deskrep.go
}

func (a *App) extBridge(w http.ResponseWriter, r *http.Request) {
	if o := r.Header.Get("Origin"); o != "" && !strings.HasPrefix(o, "chrome-extension://") {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	lim := int64(16 << 10)
	if r.URL.Path == "/api/ext/probe" {
		lim = 96 << 10 // a player snapshot (helper 2.4)
	}
	r.Body = http.MaxBytesReader(w, r.Body, lim)
	switch strings.TrimPrefix(r.URL.Path, "/api/ext/") {
	case "hello":
		a.noteHelper()
		extHelloAt.Store(time.Now().UnixMilli())
		var h extHello
		if json.NewDecoder(r.Body).Decode(&h) == nil {
			noteHello(h)
			if a.helperShouldReload(h.Ver) {
				log.Printf("helper %s v%s is older than v%s on disk: telling it to reload", h.Svc, h.Ver, a.helperDiskVersion())
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"reload":true}`))
				// the page already open keeps the old helper's scripts, cut off from the reloaded
				// extension (2026-11-13: Prime said "helper not running"): refresh it once
				go func() {
					time.Sleep(2 * time.Second)
					if err := a.ext.Reload(); err != nil {
						log.Printf("helper reload: could not refresh the page: %v", err)
						return
					}
					log.Printf("helper reload: refreshed the page so the new helper runs")
				}()
				return
			}
		}
	case "watch":
		extHelloAt.Store(time.Now().UnixMilli())
		var in extWatch
		if json.NewDecoder(r.Body).Decode(&in) != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		now := time.Now()
		svc := in.Svc
		if svc == "" {
			svc = "netflix" // helper 1.3.0 says nothing: it is Netflix
		}
		if in.Where == "desk" { // a tab in the desk Chrome (phase 4): the library only, never the TV's media state, history or commands
			a.deskReport(svc, in, now) // deskrep.go: rate limit, then libDeskReport and nothing else
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"cmds": []nfCmd{}, "desk": a.deskStays(in.Scr)})
			return
		}
		if extSvcOK(svc) && a.deskWindow(in.Scr) { // helper 2.1: a window positively off the TV monitor: tell it to switch to desk reports; its data is not used
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"cmds": []nfCmd{}, "desk": true})
			return
		}
		if !extSvcOK(svc) || !a.reportAllowed(svc, in.Scr) { // a tab on another monitor, or a window on its way out
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"cmds": []nfCmd{}})
			return
		}
		tvHelperAt.Store(now.UnixMilli()) // a report from the TV window itself (desk and off-TV ones returned above)
		if svc != "netflix" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"cmds": a.watchOther(svc, in, now)})
			return
		}
		if in.CmdErr != "" && a.nf.errChanged(in.CmdErr) {
			log.Printf("netflix helper: %s", in.CmdErr)
			if a.hub != nil && (strings.HasPrefix(in.CmdErr, "tracks:") || strings.HasPrefix(in.CmdErr, "settrack:") || strings.HasPrefix(in.CmdErr, "unknown tracks")) {
				// the player API did not answer: open Netflix's own menu for the pad instead
				a.nf.push(nfCmd{A: "subs"}, time.Now())
				a.menuUntil.Store(time.Now().Add(30 * time.Second).UnixMilli())
				go a.broadcast()
				go func() { time.Sleep(30500 * time.Millisecond); a.broadcast() }()
				a.tracksNote("netflix", "Netflix's own menu is open on the TV. Use the pad to pick, then Close the menu.")
			}
		}
		playing := in.Playing == nil || *in.Playing
		if in.Dur > 0 && a.nf.set(Media{Playing: playing, Pos: int(in.Pos), Dur: int(in.Dur)}, now) && a.hub != nil {
			go a.broadcast()
		}
		if a.nf.noteDue(now) {
			a.noteNetflix(in)
		}
		// the reply carries any player commands queued for the helper
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"cmds": a.nf.take(now)})
		return
	case "tracks": // Netflix's audio and subtitle lists, for the phone's picker
		extHelloAt.Store(time.Now().UnixMilli())
		var in struct {
			trackLists
			Svc string     `json:"svc"`
			Scr *extScreen `json:"scr"`
		}
		if json.NewDecoder(r.Body).Decode(&in) != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		svc := in.Svc
		if svc == "" {
			svc = "netflix"
		}
		if !extSvcOK(svc) || !a.reportAllowed(svc, in.Scr) {
			break
		}
		tvHelperAt.Store(time.Now().UnixMilli())
		log.Printf("%s helper: tracks %d audio, %d subtitles", svc, len(in.Audio), len(in.Subs))
		if a.hub != nil {
			a.sendTracks(svc, in.trackLists)
			if len(in.Audio)+len(in.Subs) > 0 && a.menuUntil.Swap(0) != 0 { // a read that works ends the "use the pad on the TV's menu" state an earlier failure began: it closed the phone's sheet on every state frame
				go a.broadcast()
			}
		}
	case "probe": // helper 2.4: a snapshot of the player's own markup, to learn the real selectors (probe.go)
		extHelloAt.Store(time.Now().UnixMilli())
		if err := a.probeFromHelper(r.Body); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
	case "link":
		extHelloAt.Store(time.Now().UnixMilli())
		var in extLink
		if json.NewDecoder(r.Body).Decode(&in) != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		svc := in.Svc
		if svc == "" {
			svc = "netflix"
		}
		if !extSvcOK(svc) || !a.reportAllowed(svc, in.Scr) {
			break
		}
		tvHelperAt.Store(time.Now().UnixMilli())
		if svc == "netflix" {
			a.noteNetflixLinks(in)
		} else {
			a.noteOtherLinks(svc, in)
		}
	default:
		http.NotFound(w, r)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// extLink is what the extension found while going to a title: the title's page,
// or every episode's watch address ([season, episode, url]).
type extLink struct {
	Title string     `json:"title"`
	URL   string     `json:"url"`
	Eps   [][]any    `json:"eps"`
	None  bool       `json:"none"` // Netflix's search loaded and had no such title
	Svc   string     `json:"svc"`
	Scr   *extScreen `json:"scr"`
}

var reNetflixLink = regexp.MustCompile(`^https://www\.netflix\.com/(?:title|watch)/\d+$`)

// noteNetflixLinks keeps the addresses in the link book, so the next open goes
// straight to the episode.
func (a *App) noteNetflixLinks(in extLink) {
	if a.ld == nil || in.Title == "" {
		return
	}
	// a verdict needs the exact title: the one TV Mode just opened by this name
	a.ld.mu.Lock()
	o := a.ld.opened
	a.ld.mu.Unlock()
	mine := o != nil && normTitle(o.it.Title) == normTitle(in.Title) && time.Since(o.at) < 3*time.Minute
	if in.None {
		if mine {
			go a.lacks("netflix", o.it, 0, 0, "not in its search")
		}
		return
	}
	if reNetflixLink.MatchString(in.URL) {
		a.linkPut(linkKey("netflix", in.Title, 0, 0), in.URL)
		if mine {
			a.availPut("netflix", itemKey(o.it), true, "in its search")
		}
	}
	for _, x := range in.Eps {
		if len(x) != 3 {
			continue
		}
		se, _ := x[0].(float64)
		ep, _ := x[1].(float64)
		u, _ := x[2].(string)
		if se > 0 && ep > 0 && reNetflixLink.MatchString(u) {
			a.linkPut(linkKey("netflix", in.Title, int(se), int(ep)), u)
		}
	}
}

// netflixGo is the address that opens a Netflix title in Chrome: the episode's own
// when TV Mode knows it, else the search with a note the extension acts on (it finds
// the title and the episode and starts it). Without the extension: the search.
func (a *App) netflixGo(it tmdb.Item, se, ep int) string {
	// Netflix's public page first, every time: it names every episode's id, and it
	// rewrites what the link book holds (an older build saved seasons in page order,
	// and Netflix lists some shows newest first)
	if !a.o.Test {
		if u := a.netflixDirect(it, se, ep); u != "" {
			if se > 0 {
				return withT(u, a.epMarkOf(it.Title, se, ep).Pos)
			}
			return u
		}
	}
	if it.Kind == "tv" && se > 0 {
		if u := a.linkGet(linkKey("netflix", it.Title, se, ep)); u != "" {
			return withT(u, a.epMarkOf(it.Title, se, ep).Pos)
		}
	}
	// the note always goes along: without the extension Netflix ignores it, and after a
	// restart TV Mode cannot know yet whether the extension is there
	note := map[string]any{"title": it.Title, "kind": it.Kind, "se": se, "ep": ep, "pos": 0}
	if se > 0 {
		note["pos"] = a.epMarkOf(it.Title, se, ep).Pos
	}
	if u := a.linkGet(linkKey("netflix", it.Title, 0, 0)); u != "" {
		if m := regexp.MustCompile(`/(\d+)$`).FindStringSubmatch(u); m != nil {
			note["id"] = m[1]
		}
	}
	b, _ := json.Marshal(note)
	return searchURL("netflix", it.Title) + "#tvgo=" + url.PathEscape(string(b))
}

// nfShowFor is the show page an episode id belongs to, from the link book.
func (a *App) nfShowFor(epID string) string {
	if a.ld == nil {
		return ""
	}
	w := "https://www.netflix.com/watch/" + epID
	a.ld.mu.Lock()
	defer a.ld.mu.Unlock()
	for k, v := range a.ld.links {
		if v != w || !strings.HasPrefix(k, "netflix|") {
			continue
		}
		parts := strings.Split(k, "|")
		if len(parts) >= 2 {
			if t := a.ld.links[parts[0]+"|"+parts[1]]; strings.Contains(t, "/title/") {
				return t
			}
		}
	}
	return ""
}

// withT adds Netflix's start-at (a little before where he stopped).
func withT(u string, pos int) string {
	if pos <= 60 || !strings.Contains(u, "/watch/") {
		return u
	}
	return u + "?t=" + strconv.Itoa(pos-3)
}

// noteNetflixOpen puts what TV Mode just played in Netflix into Continue watching.
// TV Mode cannot read Dev's Chrome, so without the helper extension this is all it
// knows: the show, the episode and where it started (the helper adds the progress).
func (a *App) noteNetflixOpen(it tmdb.Item, se, ep int, u string) {
	if a.ld == nil || !strings.Contains(u, "/watch/") {
		return
	}
	m := a.epMarkOf(it.Title, se, ep)
	pos, dur := m.Pos, m.Dur
	if dur <= 0 {
		dur = 45 * 60
		if it.Kind != "tv" {
			dur = 120 * 60
		}
	}
	if pos <= 0 {
		pos = 1
	}
	e := history.Entry{Service: "netflix", URL: strings.SplitN(u, "?", 2)[0], Title: it.Title, Pos: pos, Dur: dur}
	if it.Kind == "tv" && se > 0 {
		e.Show, e.Season, e.Episode = it.Title, se, ep
		e.Group = "netflix|" + strings.ToLower(it.Title)
	} else {
		e.Group = "netflix|" + strings.ToLower(it.Title) + "|" + strings.TrimPrefix(e.URL, "https://www.netflix.com/watch/")
	}
	a.fillEp(&e)                         // the episode name, from TMDB
	a.libOpenedEntry(e, "tv", "tv-open") // TV Mode opened it in Chrome; the helper's reports add the progress
	if a.ld.hist.Note(e) {
		go a.fillMeta(e)
		a.pushRows()
	}
}

// noteNetflix records what the extension saw playing into Continue watching.
func (a *App) noteNetflix(in extWatch) {
	if a.ld == nil || in.Dur <= 120 || (in.Playing != nil && !*in.Playing) {
		return
	}
	u, err := url.Parse(in.URL)
	if err != nil || (u.Host != "www.netflix.com") {
		return
	}
	m := reNetflixWatch.FindStringSubmatch(u.Path)
	title := history.CleanTitle(in.Title)
	if m == nil {
		return
	}
	e := history.Entry{Service: "netflix", URL: "https://www.netflix.com/watch/" + m[1], Title: title,
		Pos: int(in.Pos), Dur: int(in.Dur)}
	if in.Episode > 0 {
		e.Show, e.Season, e.Episode, e.EpTitle = title, in.Season, in.Episode, strings.TrimSpace(in.EpTitle)
		e.Group = "netflix|" + strings.ToLower(title)
	} else {
		e.Group = "netflix|" + strings.ToLower(title) + "|" + m[1]
	}
	// the page often does not say the episode (or calls it just "Netflix"): what TV Mode opened there knows
	a.fillEp(&e)
	if e.Title == "" || strings.EqualFold(e.Title, "netflix") {
		return
	}
	title = e.Title
	if e.Episode > 0 {
		a.markEpisode(e)
		if e.Season > 0 {
			a.linkPut(linkKey("netflix", title, e.Season, e.Episode), e.URL)
		}
	}
	a.libWatch(e, "netflix-helper") // TV-window reports only: reportAllowed already refused any other window
	isNew := !a.ld.hist.Has(e.GroupKey())
	if a.ld.hist.Note(e) {
		if isNew || e.Img == "" {
			go a.fillMeta(e)
		}
		if a.ld.tm != nil {
			go func() { a.updateBecause(); a.pushRows() }()
		}
		a.pushRows()
	}
}
