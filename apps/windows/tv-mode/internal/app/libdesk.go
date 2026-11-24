package app

// The desk's side of the library (HUB-DIRECTION.md 5.3): GET /api/library and its writes.
// Same rules as every desk API (desk.go): loopback only, and a POST needs the
// X-TVMode: desk header. The page never sends an address except in "Paste a link"
// (which goes through the same resolver as the phone's share: libResolveLink).

import (
	"log"
	"net/http"
	"net/url"
	"strings"

	"tvmode/internal/history"
	"tvmode/internal/library"
)

func (a *App) libDeskRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/library", a.libDeskList)
	mux.HandleFunc("/api/library/state", a.libDeskState)
	mux.HandleFunc("/api/library/remove", a.libDeskRemove)
	mux.HandleFunc("/api/library/add", a.libDeskAdd)
	mux.HandleFunc("/api/library/open", a.libDeskOpen)
}

type libJSON struct {
	ID       string   `json:"id"`
	Kind     string   `json:"kind"`
	Title    string   `json:"title"`
	Show     string   `json:"show,omitempty"`
	Img      string   `json:"img"`
	Services []string `json:"services,omitempty"`
	Svc      string   `json:"svc,omitempty"`
	State    string   `json:"state"`
	Season   int      `json:"season,omitempty"`
	Episode  int      `json:"episode,omitempty"`
	EpTitle  string   `json:"epTitle,omitempty"`
	Pct      float64  `json:"pct,omitempty"`
	Left     int      `json:"left,omitempty"`
	Added    int64    `json:"added"`
	LastAt   int64    `json:"lastAt"`
	DoneAt   int64    `json:"doneAt,omitempty"`
	When     string   `json:"when"`
	Where    string   `json:"where"`
	Source   string   `json:"source,omitempty"`
	Host     string   `json:"host,omitempty"` // a plain link: where it points
	CanTV    bool     `json:"canTV"`
	CanHere  bool     `json:"canHere"`
}

func libWhere(w string) string {
	switch w {
	case "desk":
		return "Desk"
	case "phone":
		return "Phone"
	}
	return "TV"
}

func (a *App) libJSONOf(it library.Item) libJSON {
	j := libJSON{ID: it.ID, Kind: it.Kind, Title: it.Title, Show: it.Show, Img: a.imgURL(it.Img), Services: it.Services, Svc: libSvcOf(it), State: it.State,
		Season: it.Season, Episode: it.Episode, EpTitle: it.EpTitle, Pct: it.Pct, Added: it.Added, LastAt: it.LastAt, DoneAt: it.DoneAt,
		When: stoppedAt(it.LastAt), Where: libWhere(it.LastWhere), Source: it.Source, CanTV: libPlayable(it)}
	if it.Dur > it.Pos && it.Dur > 0 {
		j.Left = (it.Dur - it.Pos + 59) / 60
	}
	if j.Services == nil {
		j.Services = []string{}
	}
	j.CanHere = j.CanTV
	if it.Kind == "other" {
		if u, err := url.Parse(it.URL); err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Hostname() != "" && u.User == nil {
			j.CanHere, j.Host = true, strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
		}
	}
	return j
}

// GET /api/library?view=all|continue|watching|saved|finished|dropped.
func (a *App) libDeskList(w http.ResponseWriter, r *http.Request) {
	if !deskGate(w, r, http.MethodGet) || !a.deskData(w) {
		return
	}
	st := a.libStore()
	view := r.URL.Query().Get("view")
	switch view {
	case "", "all", "continue", library.Watching, library.Saved, library.Finished, library.Dropped:
	default:
		deskErr(w, http.StatusBadRequest, "bad view")
		return
	}
	out := []libJSON{}
	counts := map[string]int{"watching": 0, "saved": 0, "finished": 0, "dropped": 0}
	for _, it := range st.List("all") {
		counts[it.State]++
	}
	for _, it := range st.List(view) {
		out = append(out, a.libJSONOf(it))
	}
	deskJSON(w, map[string]any{"items": out, "counts": counts})
}

type libReq struct {
	ID    string `json:"id"`
	State string `json:"state"`
	URL   string `json:"url"`
	Title string `json:"title"`
	Text  string `json:"text"`
	Where string `json:"where"`
	Svc   string `json:"svc"`
	Se    int    `json:"se"`
	Ep    int    `json:"ep"`
}

func (a *App) libDeskPost(w http.ResponseWriter, r *http.Request) (libReq, bool) {
	var q libReq
	if !deskGate(w, r, http.MethodPost) || !a.deskData(w) || !deskDecode(w, r, &q) {
		return q, false
	}
	return q, true
}

// POST /api/library/state {id, state: finished|dropped|saved|watching}: Dev's own mark.
// Finished or Dropped hides the title from the TV's Continue on the next push; Dropped
// teaches the taste model Abandon, once.
func (a *App) libDeskState(w http.ResponseWriter, r *http.Request) {
	q, ok := a.libDeskPost(w, r)
	if !ok {
		return
	}
	switch q.State {
	case library.Finished, library.Dropped, library.Saved, library.Watching:
	default:
		deskErr(w, http.StatusBadRequest, "bad state")
		return
	}
	it, ok := a.libMark(q.ID, q.State)
	if !ok {
		deskErr(w, http.StatusUnprocessableEntity, "unknown title")
		return
	}
	deskJSON(w, map[string]any{"ok": true, "item": a.libJSONOf(it)})
}

// POST /api/library/remove {id}: takes the title and its events out of the library.
func (a *App) libDeskRemove(w http.ResponseWriter, r *http.Request) {
	q, ok := a.libDeskPost(w, r)
	if !ok {
		return
	}
	if !a.libStore().Remove(q.ID) {
		deskErr(w, http.StatusUnprocessableEntity, "unknown title")
		return
	}
	a.libChanged()
	deskJSON(w, map[string]any{"ok": true})
}

// POST /api/library/add {url, title?, text?}: "Paste a link" (the same resolver as the phone's share).
func (a *App) libDeskAdd(w http.ResponseWriter, r *http.Request) {
	q, ok := a.libDeskPost(w, r)
	if !ok {
		return
	}
	it, dup, err := a.libResolveLink(shareIn{URL: q.URL, Title: q.Title, Text: q.Text}, "desk", "desk-paste")
	if err != nil {
		deskErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	deskJSON(w, map[string]any{"ok": true, "dup": dup, "item": a.libJSONOf(it)})
}

// POST /api/library/open {id, where: desk|tv, svc?, se?, ep?}.
func (a *App) libDeskOpen(w http.ResponseWriter, r *http.Request) {
	q, ok := a.libDeskPost(w, r)
	if !ok {
		return
	}
	it, found := a.libStore().Get(q.ID)
	if !found {
		deskErr(w, http.StatusUnprocessableEntity, "unknown title")
		return
	}
	switch q.Where {
	case "tv":
		if !libPlayable(it) {
			deskErr(w, http.StatusUnprocessableEntity, "The TV cannot open this one. Use Open here.")
			return
		}
		if !a.startThenPlay(func() { a.libOpenTV(it.ID, q.Svc, q.Se, q.Ep) }) {
			deskJSON(w, map[string]any{"ok": true})
			return
		}
		w.WriteHeader(http.StatusAccepted)
		deskJSON(w, map[string]any{"ok": true, "starting": true})
	case "desk":
		u, svc, err := a.libDeskURL(it, q)
		if err != nil {
			deskErr(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if err := deskOpenURL(u); err != nil {
			log.Printf("desk: open: %v", err)
			deskErr(w, http.StatusInternalServerError, "could not open the browser")
			return
		}
		log.Printf("desk: opened a library item in the default browser")
		if isTmdbKey(it.ID) {
			ti, _ := a.libRegister(it)
			a.libOpened(ti, svc, q.Se, q.Ep, "desk", "desk-open")
		} else {
			a.libNote(LibEvent{Type: library.EvOpen, Where: "desk", Service: it.LastSvc, Source: "desk-open", Key: libKeyOf(it), Title: it.Title, URL: it.URL})
		}
		deskJSON(w, map[string]any{"ok": true, "svc": svc})
	default:
		deskErr(w, http.StatusBadRequest, "bad request")
	}
}

// libKeyOf is the key to hand libNote for an item that is not a plain title.
func libKeyOf(it library.Item) string {
	if isTmdbKey(it.ID) || strings.HasPrefix(it.ID, "yt:") {
		return it.ID
	}
	return ""
}

// libDeskURL is the address Open here goes to. A TMDB title uses the desk's own resolver
// (link book, page he watched it on, else the service's search); a YouTube video is its
// watch page; a plain link is itself, only if it is a plain http or https address.
func (a *App) libDeskURL(it library.Item, q libReq) (u, svc string, err error) {
	switch {
	case isTmdbKey(it.ID):
		if _, ok := a.libRegister(it); !ok {
			return "", "", errDeskStale
		}
		return a.deskResolve(deskReq{K: "item", Key: it.ID, Svc: q.Svc, Se: q.Se, Ep: q.Ep})
	case strings.HasPrefix(it.ID, "yt:"):
		safe, ok := deskSafeURL("https://www.youtube.com/watch?v=" + strings.TrimPrefix(it.ID, "yt:"))
		if !ok {
			return "", "", errDeskStale
		}
		return safe, "youtube", nil
	}
	p, perr := url.Parse(it.URL)
	if perr != nil || (p.Scheme != "http" && p.Scheme != "https") || p.Hostname() == "" || p.User != nil {
		return "", "", errNoPage
	}
	p.Fragment, p.RawFragment = "", ""
	return p.String(), it.LastSvc, nil
}

var errNoPage = &libErr{"no page to open for this one"}

type libErr struct{ s string }

func (e *libErr) Error() string { return e.s }

// libDeskOpened tells the library about a title opened with the desk's Open here
// (POST /api/desk/open where:"desk").
func (a *App) libDeskOpened(q deskReq, svc string) {
	if a.libStore() == nil {
		return
	}
	switch q.K {
	case "item":
		a.ld.mu.Lock()
		it, ok := a.ld.byKey[q.Key]
		a.ld.mu.Unlock()
		if ok {
			a.libOpened(it, svc, q.Se, q.Ep, "desk", "desk-open")
		}
	case "cont":
		if l := a.ld.hist.List(); q.I >= 0 && q.I < len(l) {
			var e history.Entry = l[q.I]
			a.libOpenedEntry(e, "desk", "desk-open")
		}
	}
}
