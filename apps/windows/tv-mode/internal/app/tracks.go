package app

import (
	"fmt"
	"log"
	"sort"
	"strings"

	"tvmode/internal/services"
)

// The phone's "Subtitles and audio" picker. Netflix's lists come from the helper
// extension (its player API); JioHotstar's and Prime's come from their own menu, which
// TV Mode opens, reads and closes again (services.JSTracks). The phone shows both
// lists; a tap sends the choice back and the lists come again with the new marks.

type track struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	On    bool   `json:"on"`
}

type trackLists struct {
	Audio []track `json:"audio"`
	Subs  []track `json:"subs"`
	Err   string  `json:"err,omitempty"`
	// SubsOn: Prime's subtitles on/off toggle (helper 2.5.2); nil when the helper does not say
	SubsOn *bool `json:"subsOn,omitempty"`
}

type trackPick struct {
	Kind string `json:"kind"` // audio or subs
	ID   string `json:"id"`
}

// tracksNote answers the phone's picker with a sentence instead of lists.
func (a *App) tracksNote(app, msg string) {
	a.hub.broadcastRemotes(map[string]any{"t": "tracks", "app": app, "audio": []track{}, "subs": []track{}, "msg": msg})
}

func (a *App) sendTracks(app string, l trackLists) {
	if l.Audio == nil {
		l.Audio = []track{}
	}
	if l.Subs == nil {
		l.Subs = []track{}
	}
	f := map[string]any{"t": "tracks", "app": app, "audio": l.Audio, "subs": l.Subs}
	if l.SubsOn != nil {
		f["subsOn"] = *l.SubsOn
	}
	a.hub.broadcastRemotes(f)
}

// epsKnown says whether an episode list can be built for what plays on app: a show key,
// or episode links the helper reported. Netflix always can (its own list). The phone
// hides its Episodes tab when this is false.
func (a *App) epsKnown(app string) bool {
	if app == "netflix" {
		return true
	}
	if a.ld == nil || app == "" || app == "launcher" {
		return false
	}
	a.ld.mu.Lock()
	op := a.ld.opened
	a.ld.mu.Unlock()
	if op != nil && op.it.Kind == "tv" && op.it.Service == app {
		return true
	}
	title := ""
	for _, e := range a.ld.hist.List() {
		if e.Service == app && !e.Opened {
			if title = e.Show; title == "" {
				title = e.Title
			}
			break
		}
	}
	if title == "" {
		return false
	}
	want := normTitle(title)
	pre := app + "|" + want + "|"
	a.ld.mu.Lock()
	defer a.ld.mu.Unlock()
	for _, it := range a.ld.byKey {
		if it.Kind == "tv" && normTitle(it.Title) == want {
			return true
		}
	}
	for k := range a.ld.links {
		if strings.HasPrefix(k, pre) {
			return true
		}
	}
	return false
}

// listTracks reads an Edge player's lists and sends them to the phone; false when the
// player's menu could not be read (the caller then opens the menu for the cursor).
func (a *App) listTracks(app string) bool {
	var l trackLists
	if err := a.Edge.Eval(services.JSTracks, &l); err != nil {
		log.Printf("tracks: %v", err)
		return false
	}
	if l.Err != "" || len(l.Audio)+len(l.Subs) == 0 {
		log.Printf("tracks: %s on %s", l.Err, app)
		return false
	}
	a.sendTracks(app, l)
	return true
}

// setTrack presses one choice on an Edge player and sends the lists back.
func (a *App) setTrack(t trackPick) {
	if t.Kind != "audio" && t.Kind != "subs" || t.ID == "" {
		return
	}
	s := a.svc()
	var l trackLists
	if err := a.Edge.Eval(services.JSSetTrack(t.Kind, t.ID), &l); err != nil || l.Err != "" {
		log.Printf("settrack: %v %s", err, l.Err)
		a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "That choice did not take. Try Subtitles again."})
		return
	}
	a.sendTracks(s.ID, l)
}

// --- the phone's episode list for what is playing ---

// showKey finds the series playing now: the title TV Mode opened, else the newest card
// of this app; it returns its launcher key ("tv123"), or "" when it is not a series.
func (a *App) showKey(app string) string {
	if a.ld == nil {
		return ""
	}
	a.ld.mu.Lock()
	op := a.ld.opened
	a.ld.mu.Unlock()
	// the newest card of this app, unless TV Mode opened a series here after it
	show, at := "", int64(0)
	for _, e := range a.ld.hist.List() {
		if e.Service == app && !e.Opened {
			show, at = e.Show, e.At
			if show == "" { // the helper often knows only the title (no season/episode yet)
				show = e.Title
			}
			break
		}
	}
	if op != nil && op.it.Kind == "tv" && op.it.Service == app && op.at.UnixMilli() >= at {
		return itemKey(op.it)
	}
	if show == "" {
		return ""
	}
	want := normTitle(show)
	a.ld.mu.Lock()
	for k, it := range a.ld.byKey {
		if it.Kind == "tv" && normTitle(it.Title) == want {
			a.ld.mu.Unlock()
			return k
		}
	}
	a.ld.mu.Unlock()
	if a.ld.tm == nil {
		return ""
	}
	it, err := a.ld.tm.SearchItem(show)
	if err != nil || it.Kind != "tv" {
		return ""
	}
	if it.Service == "" {
		it.Service = app
	}
	k := itemKey(it)
	a.ld.mu.Lock()
	a.ld.byKey[k] = it
	if a.ld.extra != nil { // a shelf refresh rebuilds byKey from extra: keep the key for a later tap
		a.ld.extra[k] = it
	}
	a.ld.mu.Unlock()
	return k
}

// linkEpURL is the address of episode (se, ep) of the newest card of svc (the playing app, as
// linkEpisodes picks it), from the link book. A newer card of another app does not count.
func (a *App) linkEpURL(svc string, se, ep int) string {
	if a.ld == nil || svc == "" || svc == "netflix" {
		return ""
	}
	for _, e := range a.ld.hist.List() {
		if e.Service == svc && !e.Opened {
			title := e.Show
			if title == "" {
				title = e.Title
			}
			return a.linkGet(linkKey(svc, title, se, ep))
		}
	}
	return ""
}

// linkEpisodes builds an episode list for the newest card of app out of the episode
// addresses the helper reported (the link book), for a show with no launcher key.
// n is the season (0: the first one listed).
func (a *App) linkEpisodes(app string, n int) (episodeList, bool) {
	if a.ld == nil {
		return episodeList{}, false
	}
	title := ""
	for _, e := range a.ld.hist.List() {
		if e.Service == app && !e.Opened {
			if title = e.Show; title == "" {
				title = e.Title
			}
			break
		}
	}
	if title == "" {
		return episodeList{}, false
	}
	pre := app + "|" + normTitle(title) + "|"
	bySe := map[int][]int{}
	a.ld.mu.Lock()
	for k := range a.ld.links {
		var se, ep int
		if strings.HasPrefix(k, pre) {
			if c, _ := fmt.Sscanf(k[len(pre):], "%d|%d", &se, &ep); c == 2 && se > 0 && ep > 0 {
				bySe[se] = append(bySe[se], ep)
			}
		}
	}
	a.ld.mu.Unlock()
	if len(bySe) == 0 {
		return episodeList{}, false
	}
	seasons := 0
	for s := range bySe {
		if s > seasons {
			seasons = s
		}
	}
	if n <= 0 || bySe[n] == nil {
		n = seasons
		for s := range bySe {
			if s < n {
				n = s
			}
		}
	}
	sort.Ints(bySe[n])
	l := episodeList{Title: title, Season: n, Seasons: seasons, Svc: app, Eps: []epOut{}}
	for _, ep := range bySe[n] {
		l.Eps = append(l.Eps, epOut{N: ep, Name: fmt.Sprintf("Episode %d", ep), Known: true})
	}
	return l, true
}

// sendEpisodes answers the phone's Episodes tab with season n (0: the current one).
func (a *App) sendEpisodes(n int) {
	a.mu.Lock()
	app := a.st.App
	a.mu.Unlock()
	if app == "" || app == "launcher" {
		a.hub.broadcastRemotes(map[string]any{"t": "eps", "none": true, "msg": "Nothing is playing. Open a series first."})
		return
	}
	k := a.showKey(app)
	log.Printf("eps: app %s, show key %q, season %d", app, k, n)
	if app != "netflix" {
		probeNote("eps", map[string]any{"svc": app, "key": k, "season": n})
	}
	if k == "" {
		if app != "netflix" {
			if l, ok := a.linkEpisodes(app, n); ok { // the helper listed this show's episodes on its page
				a.hub.broadcastRemotes(map[string]any{"t": "eps", "list": l})
				return
			}
			a.hub.broadcastRemotes(map[string]any{"t": "eps", "none": true, "msg": svcName(app) + " hasn't said which show this is yet. Play it a little longer, then try again."})
			return
		}
		a.hub.broadcastRemotes(map[string]any{"t": "eps", "none": true, "msg": "This doesn't look like a series. Episodes show once TV Mode knows the show you are watching."})
		return
	}
	l, code := a.episodesForSvc(k, n, app)
	log.Printf("eps: %d episodes of %q season %d (code %d)", len(l.Eps), l.Title, l.Season, code)
	if code != 200 {
		msg := "The episode list did not load. Try again in a moment."
		if code == 404 {
			msg = "This doesn't look like a series."
		}
		a.hub.broadcastRemotes(map[string]any{"t": "eps", "none": true, "msg": msg})
		return
	}
	a.hub.broadcastRemotes(map[string]any{"t": "eps", "list": l})
}

// speedJS sets the main video's playback rate (every Edge player here allows it).
func speedJS(r float64) string {
	return fmt.Sprintf(`(function(){var v=[].slice.call(document.querySelectorAll("video")).sort(function(a,b){var x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return y.width*y.height-x.width*x.height})[0];if(!v)return false;v.playbackRate=%v;return true})()`, r)
}

func validRate(r float64) bool { return r >= 0.5 && r <= 2 }
