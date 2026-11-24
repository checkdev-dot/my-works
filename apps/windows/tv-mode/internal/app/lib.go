package app

// The library, app side (HUB-DIRECTION.md section 4): one record of what Dev watches,
// saves and drops, written from every hook that already sees it. internal/library is
// pure; this file works out WHICH title a report is about (the identity rule), keeps
// the TV's Saved row, hides what he marked from Continue, and is the one door every
// writer goes through: libNote. PROTOCOL.md "Library ingest" is the fixed contract
// that phase 4 (desk playback reports from the helper extension) builds against.

import (
	"log"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"tvmode/internal/history"
	"tvmode/internal/library"
	"tvmode/internal/services"
	"tvmode/internal/taste"
	"tvmode/internal/tmdb"
)

// LibEvent is one thing that happened to one title, from anywhere. Every writer
// (the TV poll, the Netflix helper, a share, the desk, the desk reporter) builds one
// of these and calls libNote. Only Type and a title (or Key, or a YouTube URL) are
// required; the rest is filled in from what is known.
type LibEvent struct {
	Type    string `json:"type"`    // play | progress | finish | save | drop | open   (progress when empty)
	Where   string `json:"where"`   // tv | desk | phone                                (tv when empty)
	Service string `json:"svc"`     // netflix | prime | jiohotstar | youtube
	Source  string `json:"source"`  // tv-poll | netflix-helper | helper | tv-open | desk-reporter | share | desk-open | desk-paste | desk-manual | watchlist
	Key     string `json:"key"`     // optional: the TMDB key ("tv1396", "movie27205") or "yt:<id>" when the caller already knows it
	Title   string `json:"title"`   // the page's title; for an episode the show's
	Show    string `json:"show"`    // series name, when it is an episode
	EpTitle string `json:"epTitle"` // episode name
	Season  int    `json:"season"`
	Episode int    `json:"episode"`
	Pos     int    `json:"pos"` // seconds
	Dur     int    `json:"dur"`
	URL     string `json:"url"` // the page address (YouTube: how the video id is found)
	Img     string `json:"img"` // a source image address (never /img/<hash>)
	At      int64  `json:"at"`  // ms; zero is now
	Manual  bool   `json:"manual"`
}

// libResolver remembers which titles were already looked up on TMDB, so a poll that
// reports every second cannot ask every second.
type libResolver struct {
	mu    sync.Mutex
	tried map[string]time.Time
}

func (r *libResolver) try(name string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.tried == nil {
		r.tried = map[string]time.Time{}
	}
	if t, ok := r.tried[name]; ok && time.Since(t) < 6*time.Hour {
		return false
	}
	r.tried[name] = time.Now()
	return true
}

func (a *App) libStore() *library.Store {
	if a == nil || a.ld == nil {
		return nil
	}
	return a.ld.lib
}

// libChanged tells the TV its rows may have changed (a Saved card, a hidden Continue card).
func (a *App) libChanged() {
	if a.hub != nil {
		go a.pushRows()
	}
}

func libFirst(s ...string) string {
	for _, x := range s {
		if strings.TrimSpace(x) != "" {
			return strings.TrimSpace(x)
		}
	}
	return ""
}

var reLibYT = regexp.MustCompile(`(?:[?&]v=|youtu\.be/|/shorts/|/embed/|/live/)([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)`)

func libYTID(u string) string {
	if m := reLibYT.FindStringSubmatch(u); m != nil {
		return m[1]
	}
	return ""
}

func isTmdbKey(k string) bool { return deskKeyRe.MatchString(k) }

// libReport works out the identity (no network): a TMDB key when the caller knows it,
// a YouTube id, the alias of a title already seen by name, else "name:<title>" until
// libResolve matches it on TMDB. Returns an empty ID when the event names nothing.
func (a *App) libReport(ev LibEvent) library.Report {
	st := a.libStore()
	r := library.Report{Type: ev.Type, Where: ev.Where, Service: ev.Service, Source: ev.Source, Season: ev.Season, Episode: ev.Episode,
		EpTitle: ev.EpTitle, Pos: ev.Pos, Dur: ev.Dur, Img: ev.Img, URL: ev.URL, At: ev.At, Manual: ev.Manual}
	if r.Type == "" {
		r.Type = library.EvProgress
	}
	name := normTitle(libFirst(ev.Show, ev.Title))
	switch {
	case ev.Service == "youtube" || strings.HasPrefix(ev.Key, "yt:"):
		id := strings.TrimPrefix(ev.Key, "yt:")
		if len(id) != 11 {
			id = libYTID(ev.URL)
		}
		if id == "" {
			return library.Report{}
		}
		r.ID, r.Kind = "yt:"+id, "yt"
		r.Title = libFirst(ev.Title, "YouTube video")
		r.URL = "https://www.youtube.com/watch?v=" + id
		if r.Img == "" {
			r.Img = "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg"
		}
		r.Service = "youtube"
	case isTmdbKey(ev.Key):
		m := deskKeyRe.FindStringSubmatch(ev.Key)
		r.ID, r.Kind = ev.Key, m[1]
		r.Title, r.Show = libFirst(ev.Show, ev.Title), ev.Show
		if name != "" {
			r.Aliases = []string{"name:" + name}
			// it was seen by name first: that item becomes this one
			if it, ok := st.Lookup("name:" + name); ok && strings.HasPrefix(it.ID, "name:") {
				st.Rekey(it.ID, ev.Key, library.Patch{Kind: m[1]})
			}
		}
	case name != "":
		alias := "name:" + name
		r.Aliases = []string{alias}
		r.ID = alias
		if it, ok := st.Lookup(alias); ok {
			r.ID = it.ID
		}
		r.Kind = "movie"
		if ev.Show != "" || ev.Season > 0 || ev.Episode > 0 {
			r.Kind = "tv"
		}
		r.Title, r.Show = libFirst(ev.Show, ev.Title), ev.Show
	default:
		return library.Report{}
	}
	return r
}

// libNote is the one door into the library. Cheap enough to call on every poll: the
// store coalesces progress and rewrites its file rarely. Never blocks on the network.
func (a *App) libNote(ev LibEvent) (library.Item, bool) {
	st := a.libStore()
	if st == nil {
		return library.Item{}, false
	}
	r := a.libReport(ev)
	if r.ID == "" {
		return library.Item{}, false
	}
	res := st.Apply(r)
	if strings.HasPrefix(res.Item.ID, "name:") && a.ld.tm != nil && a.ld.libr != nil {
		go a.libResolve(res.Item)
	}
	if res.Finished && res.Item.Kind == "tv" && isTmdbKey(res.Item.ID) {
		go a.libCheckLast(res.Item, res.Item.Season, res.Item.Episode)
	}
	if res.StateChanged {
		a.libChanged()
	}
	return res.Item, true
}

// libFromEntry is what a history entry (the poll loop, the Netflix helper) tells the library.
func libFromEntry(e history.Entry, where, source string) LibEvent {
	ev := LibEvent{Type: library.EvProgress, Where: where, Service: e.Service, Source: source, Title: e.Title, Show: e.Show,
		EpTitle: e.EpTitle, Season: e.Season, Episode: e.Episode, Pos: e.Pos, Dur: e.Dur, URL: e.URL, Img: e.Img, At: e.At}
	if e.Service == "youtube" {
		ev.Key = e.GroupKey() // "yt:<id>"
	}
	return ev
}

// libWatch is the hook for the poll loop and the helper reports: a history entry that
// was just seen playing. Outside the history throttle on purpose; the store throttles itself.
func (a *App) libWatch(e history.Entry, source string) {
	if a.libStore() == nil || e.Opened {
		return
	}
	if source == "tv-poll" && e.Service != "netflix" && e.Service != "youtube" && a.extActive() {
		source = "helper" // Prime and JioHotstar in the Chrome window: the helper's report came through the same poll path
	}
	a.libNote(libFromEntry(e, "tv", source))
}

// libOpened is the hook for "he opened this title" (TV openItem, the phone's Play on
// TV, the desk's Open here).
func (a *App) libOpened(it tmdb.Item, svc string, se, ep int, where, source string) {
	if a.libStore() == nil {
		return
	}
	ev := LibEvent{Type: library.EvOpen, Where: where, Service: svc, Source: source, Key: itemKey(it), Title: it.Title, Season: se, Episode: ep, Img: tmdbImgSrc(it)}
	if it.Kind == "tv" {
		ev.Show = it.Title
	}
	a.libNote(ev)
}

// libOpenedEntry: a Continue entry reopened from the TV or the desk.
func (a *App) libOpenedEntry(e history.Entry, where, source string) {
	if a.libStore() == nil || e.Opened {
		return
	}
	ev := libFromEntry(e, where, source)
	ev.Type, ev.Pos, ev.Dur = library.EvOpen, 0, 0
	a.libNote(ev)
}

// tmdbImgSrc is the SOURCE address of a title's picture, the thing the library keeps
// (the page only ever sees what imgURL makes of it).
func tmdbImgSrc(it tmdb.Item) string {
	if it.Backdrop != "" && imgPath.MatchString(it.Backdrop) {
		return "https://image.tmdb.org/t/p/w1280" + it.Backdrop
	}
	if it.Poster != "" && imgPath.MatchString(it.Poster) {
		return "https://image.tmdb.org/t/p/w500" + it.Poster
	}
	return ""
}

// libResolve matches a title known only by name to TMDB, once, and renames the library
// item to its key. Wrong matches are worse than none: only an exact title is taken.
func (a *App) libResolve(it library.Item) {
	if a.ld == nil || a.ld.tm == nil || a.ld.libr == nil || !strings.HasPrefix(it.ID, "name:") {
		return
	}
	name := strings.TrimPrefix(it.ID, "name:")
	if !a.ld.libr.try(name) {
		return
	}
	list, err := a.ld.tm.Find(it.Title)
	if err != nil {
		a.ld.libr.mu.Lock()
		delete(a.ld.libr.tried, name) // a network error is not an answer: retry next time
		a.ld.libr.mu.Unlock()
		return
	}
	var pick *tmdb.Item
	for i := range list {
		if normTitle(list[i].Title) != name {
			continue
		}
		if list[i].Kind == it.Kind { // the kind he is watching it as wins
			pick = &list[i]
			break
		}
		if pick == nil {
			pick = &list[i]
		}
	}
	if pick == nil {
		return
	}
	key := itemKey(*pick)
	var svcs []string
	for _, s := range []string{"netflix", "prime", "jiohotstar"} {
		if a.availGet(s, key) > 0 {
			svcs = append(svcs, s)
		}
	}
	if st := a.libStore(); st != nil && st.Rekey(it.ID, key, library.Patch{Kind: pick.Kind, Title: pick.Title, Img: tmdbImgSrc(*pick), Services: svcs}) {
		log.Printf("library: %q is %s", pick.Title, key)
	}
}

// libCheckLast says whether the episode that just finished was the last of the last
// season of a show that has ended; only then is the series finished.
func (a *App) libCheckLast(it library.Item, se, ep int) {
	m := deskKeyRe.FindStringSubmatch(it.ID)
	if m == nil || m[1] != "tv" || a.ld == nil || a.ld.tm == nil || se <= 0 {
		return
	}
	id, _ := strconv.Atoi(m[2])
	a.ld.mu.Lock()
	d, ok := a.ld.details[it.ID]
	a.ld.mu.Unlock()
	if !ok || d.Seasons == 0 {
		var err error
		if d, err = a.ld.tm.Details("tv", id); err != nil {
			return
		}
	}
	if d.InProd || d.Seasons == 0 || se < d.Seasons {
		return
	}
	eps, err := a.seasonEps(id, se)
	if err != nil || len(eps) == 0 || ep < eps[len(eps)-1].N {
		return
	}
	res := a.libStore().Apply(library.Report{Type: library.EvFinish, ID: it.ID, Season: se, Episode: ep, Pos: it.Pos, Dur: it.Dur, Last: true, Where: it.LastWhere, Service: it.LastSvc})
	if res.StateChanged {
		log.Printf("library: %q finished", it.Title)
		a.libChanged()
	}
}

// libMeta fills in a title or picture a report did not have (YouTube's title from oEmbed).
func (a *App) libMeta(key, title, img string) {
	if st := a.libStore(); st != nil {
		st.SetMeta(key, title, img)
	}
}

// libMetaName is libMeta for a title known by name (a TMDB backdrop fillMeta found).
func (a *App) libMetaName(name, img string) {
	if st := a.libStore(); st != nil && name != "" {
		if it, ok := st.Lookup("name:" + normTitle(name)); ok {
			st.SetMeta(it.ID, "", img)
		}
	}
}

// libHidden says whether Continue should leave this history entry out: Dev marked its
// title Finished or Dropped by hand and has not played it since (his mark is newer than
// the entry). With nothing marked this is false for every entry, so Continue is as before.
func (a *App) libHidden(e history.Entry) bool {
	st := a.libStore()
	if st == nil || e.Opened {
		return false
	}
	var keys []string
	if g := e.GroupKey(); strings.HasPrefix(g, "yt:") {
		keys = append(keys, g)
	}
	if n := normTitle(libFirst(e.Show, e.Title)); n != "" {
		keys = append(keys, "name:"+n)
	}
	it, ok := st.Lookup(keys...)
	return ok && (it.State == library.Finished || it.State == library.Dropped) && it.MarkAt > 0 && it.MarkAt >= e.At
}

// libPlayable says whether the TV can open an item: a TMDB title or a YouTube video.
func libPlayable(it library.Item) bool {
	return it.Kind != "other" && (isTmdbKey(it.ID) || strings.HasPrefix(it.ID, "yt:"))
}

// libSvcOf is the service a library item is shown under.
func libSvcOf(it library.Item) string {
	if strings.HasPrefix(it.ID, "yt:") {
		return "youtube"
	}
	if len(it.Services) > 0 {
		return it.Services[0]
	}
	return it.LastSvc
}

func libAgo(ms int64) string {
	t := time.UnixMilli(ms).In(time.Local)
	now := nowTime()
	d := now.Sub(t)
	switch {
	case d < 0 || (t.YearDay() == now.YearDay() && t.Year() == now.Year()):
		return "today"
	case d < 48*time.Hour:
		return "yesterday"
	case d < 14*24*time.Hour:
		return strconv.Itoa(int(d.Hours()/24)) + " days ago"
	}
	return "on " + t.Format("2 Jan")
}

// libSavedCards is the TV's Saved row: what he saved and has not started, newest first.
// Only items the TV can open (a TMDB title, a YouTube video); a plain link stays on the
// desk. Fewer than two and there is no row, like Continue watching.
func (a *App) libSavedCards() []cardItem {
	out := []cardItem{}
	st := a.libStore()
	if st == nil {
		return out
	}
	for _, it := range st.List(library.Saved) {
		if !libPlayable(it) {
			continue
		}
		why := "Saved " + libAgo(it.Added)
		if it.Source == "share" || it.LastWhere == "phone" {
			why = "From your phone, " + libAgo(it.Added)
		}
		out = append(out, cardItem{Title: it.Title, Service: libSvcOf(it), Kind: it.Kind, Img: a.imgURL(it.Img), Lib: it.ID, Why: why, Line: why})
		if len(out) >= 24 {
			break
		}
	}
	if len(out) < 2 {
		return []cardItem{}
	}
	return out
}

// libRegister makes a TMDB library item openable by the TV's own path (openItem, the
// desk's Open here): openItem only finds titles in byKey, and extra keeps them there.
func (a *App) libRegister(it library.Item) (tmdb.Item, bool) {
	m := deskKeyRe.FindStringSubmatch(it.ID)
	if m == nil || a.ld == nil {
		return tmdb.Item{}, false
	}
	a.ld.mu.Lock()
	defer a.ld.mu.Unlock()
	if ex, ok := a.ld.byKey[it.ID]; ok {
		return ex, true
	}
	ti := tmdb.Item{Kind: m[1], Title: libFirst(it.Show, it.Title), Service: libSvcOf(it)}
	ti.ID, _ = strconv.Atoi(m[2])
	a.ld.byKey[it.ID], a.ld.extra[it.ID] = ti, ti
	return ti, true
}

// libOpenTV plays a library item on the TV: a TMDB title exactly as the launcher does,
// a YouTube video by its address (the /tv form history stores). The TV must be on.
func (a *App) libOpenTV(id, svcHint string, se, ep int) {
	st := a.libStore()
	if st == nil {
		return
	}
	it, ok := st.Get(id)
	if !ok {
		return
	}
	switch {
	case isTmdbKey(it.ID):
		if _, ok := a.libRegister(it); ok {
			a.openItem("item", it.ID, 0, svcHint, se, ep) // records the open itself
		}
	case strings.HasPrefix(it.ID, "yt:"):
		for n, s := range services.Apps {
			if s.ID == "youtube" {
				a.libNote(LibEvent{Type: library.EvOpen, Where: "tv", Service: "youtube", Source: "tv-open", Key: it.ID, Title: it.Title})
				a.ld.goGen.Add(1)
				a.ld.resumeGen.Add(1)
				a.openAppAt(n, "https://www.youtube.com/tv#/watch?v="+strings.TrimPrefix(it.ID, "yt:"))
				return
			}
		}
	default:
		a.show("opening", map[string]any{"name": "Not something the TV can open"})
	}
}

// libMark is a state change Dev makes by hand (the desk's Finished, Drop, Saved, back to
// Watching). Dropping teaches the taste model Abandon once.
func (a *App) libMark(id, state string) (library.Item, bool) {
	st := a.libStore()
	if st == nil {
		return library.Item{}, false
	}
	cur, ok := st.Get(id)
	if !ok {
		return library.Item{}, false
	}
	r := library.Report{ID: cur.ID, Where: "desk", Source: "desk-manual", Manual: true}
	switch state {
	case library.Finished:
		r.Type = library.EvFinish
	case library.Dropped:
		r.Type = library.EvDrop
	case library.Saved:
		r.Type = library.EvSave
	case library.Watching:
		r.Type = library.EvPlay
	default:
		return cur, false
	}
	res := st.Apply(r)
	if state == library.Dropped && res.StateChanged && st.FirstAbandon(cur.ID) {
		a.libTeachAbandon(cur)
	}
	a.libChanged()
	out, _ := st.Get(id)
	return out, true
}

// libTeachAbandon teaches taste Abandon, once, when a title is dropped. A title the app
// has no record of is skipped rather than taught as empty features.
func (a *App) libTeachAbandon(it library.Item) {
	if a.ld == nil || a.ld.taste == nil || !isTmdbKey(it.ID) {
		return
	}
	a.ld.mu.Lock()
	ti, ok := a.ld.byKey[it.ID]
	a.ld.mu.Unlock()
	if !ok {
		return
	}
	a.ld.taste.Learn(tasteOf(ti, ""), taste.Abandon)
	log.Printf("taste: dropped %q", it.Title)
}

// libDeskReport takes a playback report from a tab in Dev's desk Chrome (the helper
// extension, phase 4): {"where":"desk","svc":..,"title":..,"season":..,"episode":..,
// "epTitle":..,"pos":..,"dur":..,"playing":..,"url":..,"ad":..,"w":{..}} POSTed to
// /api/ext/watch. It becomes a library event with where:"desk" and nothing else: no
// history, no episode book, no media state, no player commands. Anything that is not
// a real video playing on one of the four services' own hosts is dropped.
func (a *App) libDeskReport(svc string, in extWatch) {
	if a.libStore() == nil || in.Ad || in.Dur <= 120 || (in.Playing != nil && !*in.Playing) {
		return
	}
	page := history.Page{Href: in.URL, Title: in.Title, HasVideo: true, Playing: true, Pos: int(in.Pos), Dur: int(in.Dur)}
	if in.W != nil && in.W.Href != "" {
		w := *in.W
		page = history.Page{Href: w.Href, Title: w.Title, OGTitle: w.OGT, OGImage: w.OGI, PTitle: w.PT, PSub: w.PS, H1: w.H1, HasVideo: true, Playing: true, Pos: int(in.Pos), Dur: int(in.Dur), Loop: w.Loop}
	}
	var e history.Entry
	switch svc {
	case "youtube":
		u, err := url.Parse(page.Href)
		if err != nil || u.Scheme != "https" || !(u.Host == "www.youtube.com" || u.Host == "youtube.com" || u.Host == "m.youtube.com") {
			return
		}
		var ok bool
		if e, ok = history.FromPage("youtube", page); !ok {
			return
		}
	case "netflix":
		u, err := url.Parse(in.URL)
		if err != nil || !extHostOK("netflix", in.URL) {
			return
		}
		m := reNetflixWatch.FindStringSubmatch(u.Path)
		title := history.CleanTitle(in.Title)
		if m == nil || title == "" || strings.EqualFold(title, "netflix") {
			return
		}
		e = history.Entry{Service: "netflix", URL: "https://www.netflix.com/watch/" + m[1], Title: title, Pos: int(in.Pos), Dur: int(in.Dur)}
		if in.Episode > 0 {
			e.Show, e.Season, e.Episode, e.EpTitle = title, in.Season, in.Episode, strings.TrimSpace(in.EpTitle)
		}
	case "prime", "jiohotstar":
		if !extHostOK(svc, page.Href) {
			return
		}
		var ok bool
		if e, ok = history.FromPage(svc, page); !ok {
			return
		}
	default:
		return
	}
	a.libNote(libFromEntry(e, "desk", "desk-reporter"))
}
