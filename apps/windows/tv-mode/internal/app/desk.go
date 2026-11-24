package app

// Desk mode: the same memory as the TV, at the desk, with a mouse
// (HUB-DIRECTION.md section 5). The page is web/desk/, served at /desk/. Everything
// here is loopback only, plain JSON over REST (the page never opens /ws/screen, so
// it never counts as a TV screen), and every write needs the X-TVMode: desk header
// so a web page open in Dev's browser cannot trigger it with a cross-site request.
//
// "Open here" never touches the TV's Edge, Chrome window or scout. It works out the
// address from what TV Mode already knows (link book, history, a search URL) and
// hands it to Windows' default browser: no flags, no profile, nothing read back.

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os/exec"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"tvmode/internal/services"
	"tvmode/internal/tmdb"
)

// deskOpenURL opens u in the default browser; a variable so tests never open one.
var deskOpenURL = func(u string) error {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", u)
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }()
	return nil
}

// deskWaitTV is how long Play on TV waits for a TV that is starting.
var deskWaitTV = 90 * time.Second

// OpenDeskPage opens the desk in the default browser (a plain address open).
func OpenDeskPage() error { return deskOpenURL(LocalOrigin() + "/desk/") }

// OpenDeskWhenUp waits (up to a minute) for TV Mode to answer on its port, then
// opens the desk. For the -desk start, which launches the server itself.
func OpenDeskWhenUp() {
	for end := time.Now().Add(time.Minute); time.Now().Before(end); time.Sleep(300 * time.Millisecond) {
		if up, _ := Handoff(LocalOrigin(), false); up {
			if err := OpenDeskPage(); err != nil {
				log.Printf("desk: could not open the browser: %v", err)
			}
			return
		}
	}
	log.Printf("desk: TV Mode did not come up in a minute; the page was not opened")
}

// deskRoutes adds the desk page and its APIs to the one mux (all loopback only:
// none is a publicPath, so lanGate refuses other machines, and each handler checks again).
func (a *App) deskRoutes(mux *http.ServeMux) {
	mux.Handle("/desk/", deskGuardDir(http.StripPrefix("/desk/", a.dir("desk", false))))
	mux.HandleFunc("/api/rows", a.deskRows)
	mux.HandleFunc("/api/rated/all", a.deskRatedAll)
	mux.HandleFunc("/api/desk/state", a.deskState)
	mux.HandleFunc("/api/desk/mode", a.deskMode) // Desk | TV switch (standby.go)
	mux.HandleFunc("/api/desk/hist", a.deskHist)
	mux.HandleFunc("/api/desk/open", a.deskOpen)
	mux.HandleFunc("/api/desk/rate", a.deskRate)
	mux.HandleFunc("/api/desk/year", a.deskYear) // "Your year" (d5year.go)
	mux.HandleFunc("/api/desk/city", a.deskCity) // "Your city" for the weather nodes (d5weather.go)
	a.libDeskRoutes(mux)                         // /api/library and its writes (libdesk.go)
}

func deskLoopback(r *http.Request) bool {
	h, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return false
	}
	ip := net.ParseIP(h)
	return ip != nil && ip.IsLoopback()
}

func deskGuardDir(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !deskLoopback(r) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// deskGate: loopback, the right method and, for a POST, the X-TVMode: desk header.
func deskGate(w http.ResponseWriter, r *http.Request, method string) bool {
	if !deskLoopback(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return false
	}
	if r.Method != method {
		http.Error(w, method+" only", http.StatusMethodNotAllowed)
		return false
	}
	if method == http.MethodPost && r.Header.Get("X-TVMode") != "desk" {
		http.Error(w, "POST with X-TVMode: desk", http.StatusForbidden)
		return false
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	return true
}

var deskInitMu sync.Mutex

// deskData makes sure the launcher data exists. In standby the TV session has not
// run yet, so a.ld is nil until Start TV; the desk is the common standby case, so it
// builds the same data (initLauncherData is what runTV calls first) when needed.
func (a *App) deskData(w http.ResponseWriter) bool {
	deskInitMu.Lock()
	a.initLauncherData()
	ok := a.ld != nil
	deskInitMu.Unlock()
	if !ok {
		http.Error(w, `{"error":"not ready"}`, http.StatusServiceUnavailable)
	}
	return ok
}

func deskJSON(w http.ResponseWriter, v any) { _ = json.NewEncoder(w).Encode(v) }

func deskErr(w http.ResponseWriter, code int, msg string) {
	w.WriteHeader(code)
	deskJSON(w, map[string]any{"ok": false, "error": msg})
}

// GET /api/rows: the same frame the TV gets.
func (a *App) deskRows(w http.ResponseWriter, r *http.Request) {
	if !deskGate(w, r, http.MethodGet) || !a.deskData(w) {
		return
	}
	deskJSON(w, a.rowsFrame())
}

// GET /api/desk/state: is the TV up, and is there data.
func (a *App) deskState(w http.ResponseWriter, r *http.Request) {
	// the page polls this first, so it also makes sure the data exists before /api/search,
	// /api/title or /api/episodes (which read a.ld directly) can be asked
	if !deskGate(w, r, http.MethodGet) || !a.deskData(w) {
		return
	}
	tv := "off"
	switch a.tvState.Load() {
	case tvStarting:
		tv = "starting"
	case tvOn:
		tv = "on"
	case tvClosing:
		tv = "closing"
	}
	mode := "desk" // the switch: the TV session is up or coming up, or not
	if tv == "on" || tv == "starting" {
		mode = "tv"
	}
	phone := a.hub != nil && a.hub.remoteCount() > 0
	app := "" // what the TV shows now: "launcher" or a service id (only while the TV is on)
	if tv == "on" {
		a.mu.Lock()
		app = a.st.App
		a.mu.Unlock()
	}
	deskJSON(w, map[string]any{"tv": tv, "mode": mode, "app": app, "phone": phone, "standby": a.standbyMode(), "month": int(a.now().Month())}) // month: December shows the "Your year" entry
}

type deskHistItem struct {
	I       int     `json:"i"`
	Title   string  `json:"title"`
	Service string  `json:"service"`
	Img     string  `json:"img"`
	Season  int     `json:"season,omitempty"`
	Episode int     `json:"episode,omitempty"`
	EpTitle string  `json:"epTitle,omitempty"`
	Channel string  `json:"channel,omitempty"`
	Pct     float64 `json:"pct"`
	Left    int     `json:"left,omitempty"`
	At      int64   `json:"at"`
	When    string  `json:"when"`
	Line    string  `json:"line,omitempty"`
}

// GET /api/desk/hist: the history store (Continue), newest first, with the index the
// TV's own Continue row uses.
func (a *App) deskHist(w http.ResponseWriter, r *http.Request) {
	if !deskGate(w, r, http.MethodGet) || !a.deskData(w) {
		return
	}
	out := []deskHistItem{}
	for i, e := range a.ld.hist.List() {
		if e.Opened { // "last opened": no title, picture or progress
			continue
		}
		out = append(out, deskHistItem{I: i, Title: e.Title, Service: e.Service, Img: a.imgURL(e.Img), Season: e.Season, Episode: e.Episode, EpTitle: e.EpTitle, Channel: e.Channel, Pct: e.Pct(), Left: e.Left(), At: e.At, When: stoppedAt(e.At), Line: e.Line()})
	}
	deskJSON(w, map[string]any{"items": out})
}

type deskRatedItem struct {
	Key     string `json:"key"`
	Title   string `json:"title"`
	Service string `json:"service,omitempty"`
	Kind    string `json:"kind,omitempty"`
	V       int    `json:"v"`
	At      int64  `json:"at"`
	Img     string `json:"img,omitempty"`
}

// GET /api/rated/all: every Watched mark (read only), newest first.
func (a *App) deskRatedAll(w http.ResponseWriter, r *http.Request) {
	if !deskGate(w, r, http.MethodGet) || !a.deskData(w) {
		return
	}
	s := a.ld.rated
	s.mu.Lock()
	out := make([]deskRatedItem, 0, len(s.m))
	for k, v := range s.m {
		out = append(out, deskRatedItem{Key: k, Title: v.Title, Service: v.Service, Kind: v.Kind, V: v.V, At: v.At})
	}
	s.mu.Unlock()
	sort.Slice(out, func(i, j int) bool {
		if out[i].At != out[j].At {
			return out[i].At > out[j].At
		}
		return out[i].Key < out[j].Key
	})
	for i := range out {
		a.ld.mu.Lock()
		it, ok := a.ld.byKey[out[i].Key]
		a.ld.mu.Unlock()
		if ok {
			if c := a.card(it, "rated", ""); c.Img != "" {
				out[i].Img = c.Img
			}
		}
	}
	deskJSON(w, map[string]any{"items": out})
}

var deskKeyRe = regexp.MustCompile(`^(movie|tv)([1-9][0-9]{0,9})$`)

// deskReq is the body of POST /api/desk/open and /api/desk/rate. The page never
// sends an address: only which title (key) or Continue entry (i, with its title as
// a check that the list did not move), the app it chose, and the episode.
type deskReq struct {
	Where   string `json:"where"` // desk | tv
	K       string `json:"k"`     // cont | item
	Key     string `json:"key"`
	I       int    `json:"i"`
	Title   string `json:"title"`
	Svc     string `json:"svc"`
	Se      int    `json:"se"`
	Ep      int    `json:"ep"`
	V       int    `json:"v"`
	Service string `json:"service"`
	Kind    string `json:"kind"`
}

var errDeskStale = errors.New("the list changed; reload")

// deskHosts are the only sites the desk hands to the browser.
var deskHosts = []string{"netflix.com", "primevideo.com", "amazon.com", "amazon.in", "hotstar.com", "jiohotstar.com", "youtube.com", "youtu.be"}

// deskSafeURL: https, no credentials, a host of one of the four services; the
// fragment (Netflix's #tvgo note is for the TV's helper) is dropped.
func deskSafeURL(raw string) (string, bool) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil {
		return "", false
	}
	h := strings.ToLower(u.Hostname())
	for _, d := range deskHosts {
		if h == d || strings.HasSuffix(h, "."+d) {
			u.Fragment, u.RawFragment = "", ""
			return u.String(), true
		}
	}
	return "", false
}

// deskResolve is the address Open here goes to, using only what is already known:
// the exact episode in the link book, the page he watched it on, the title's page in
// the link book, else the service's search. It never calls netflixGo / primeGo /
// hotstarGo (they drive the TV or walk pages).
func (a *App) deskResolve(r deskReq) (u, svc string, err error) {
	switch r.K {
	case "cont":
		l := a.ld.hist.List()
		if r.I < 0 || r.I >= len(l) {
			return "", "", errDeskStale
		}
		e := l[r.I]
		if r.Title != "" && e.Title != r.Title {
			return "", "", errDeskStale
		}
		u, svc = e.URL, e.Service
		if e.Opened || u == "" {
			u = searchURL(e.Service, e.Title)
		} else if e.Service == "netflix" {
			u = withT(u, e.Pos)
		}
	case "item":
		a.ld.mu.Lock()
		it, ok := a.ld.byKey[r.Key]
		a.ld.mu.Unlock()
		if !ok {
			return "", "", errors.New("unknown title")
		}
		svc = a.pickOpenSvc(r.Svc, r.Key, it)
		if svc == "" {
			return "", "", errors.New("not on your apps")
		}
		if r.Se > 0 {
			u = a.linkGet(linkKey(svc, it.Title, r.Se, r.Ep))
		} else if e, ok := a.watched(svc, it.Title); ok {
			u = e.URL
			if svc == "netflix" {
				u = withT(u, e.Pos)
			}
		}
		if u == "" {
			u = a.linkGet(linkKey(svc, it.Title, 0, 0))
		}
		if u == "" {
			u = searchURL(svc, it.Title)
		}
	case "svc": // the service's own home page (the desk's "Open Netflix here")
		s := services.ByID(r.Svc)
		if s == nil || s.ID == "launcher" {
			return "", "", errors.New("bad request")
		}
		svc, u = s.ID, s.URL
		if s.FallbackURL != "" { // YouTube's URL is the TV interface; a desk browser wants the plain site
			u = s.FallbackURL
		}
	default:
		return "", "", errors.New("bad request")
	}
	if u == "" {
		return "", svc, errors.New("no page to open for this one")
	}
	safe, ok := deskSafeURL(u)
	if !ok {
		return "", svc, errors.New("not an address the desk opens")
	}
	return safe, svc, nil
}

func deskDecode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 4<<10)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		deskErr(w, http.StatusBadRequest, "bad json")
		return false
	}
	return true
}

// POST /api/desk/open {where:"desk"|"tv", k, key|i+title, svc, se, ep}.
func (a *App) deskOpen(w http.ResponseWriter, r *http.Request) {
	if !deskGate(w, r, http.MethodPost) || !a.deskData(w) {
		return
	}
	var q deskReq
	if !deskDecode(w, r, &q) {
		return
	}
	if q.K == "item" && !deskKeyRe.MatchString(q.Key) {
		deskErr(w, http.StatusBadRequest, "bad request")
		return
	}
	switch q.Where {
	case "desk":
		u, svc, err := a.deskResolve(q)
		if err != nil {
			code := http.StatusUnprocessableEntity
			if err == errDeskStale {
				code = http.StatusConflict
			}
			deskErr(w, code, err.Error())
			return
		}
		if err := deskOpenURL(u); err != nil {
			log.Printf("desk: open: %v", err)
			deskErr(w, http.StatusInternalServerError, "could not open the browser")
			return
		}
		log.Printf("desk: opened %s page in the default browser", svc)
		a.libDeskOpened(q, svc) // the library hears that he opened it at the desk
		deskJSON(w, map[string]any{"ok": true, "svc": svc})
	case "tv":
		a.deskPlayOnTV(w, q)
	default:
		deskErr(w, http.StatusBadRequest, "bad request")
	}
}

func (a *App) deskPlayOnTV(w http.ResponseWriter, q deskReq) {
	switch q.K {
	case "cont":
		l := a.ld.hist.List()
		if q.I < 0 || q.I >= len(l) || (q.Title != "" && l[q.I].Title != q.Title) {
			deskErr(w, http.StatusConflict, errDeskStale.Error())
			return
		}
	case "item":
		a.ld.mu.Lock()
		_, ok := a.ld.byKey[q.Key]
		a.ld.mu.Unlock()
		if !ok {
			deskErr(w, http.StatusUnprocessableEntity, "unknown title")
			return
		}
	case "svc":
		idx := -1
		for n, s := range services.Apps {
			if s.ID == q.Svc {
				idx = n
			}
		}
		if idx < 0 {
			deskErr(w, http.StatusBadRequest, "bad request")
			return
		}
		if !a.startThenPlay(func() { a.openApp(idx) }) {
			deskJSON(w, map[string]any{"ok": true})
			return
		}
		w.WriteHeader(http.StatusAccepted)
		deskJSON(w, map[string]any{"ok": true, "starting": true})
		return
	default:
		deskErr(w, http.StatusBadRequest, "bad request")
		return
	}
	if !a.startThenPlay(func() { a.openItem(q.K, q.Key, q.I, q.Svc, q.Se, q.Ep) }) {
		deskJSON(w, map[string]any{"ok": true})
		return
	}
	w.WriteHeader(http.StatusAccepted)
	deskJSON(w, map[string]any{"ok": true, "starting": true})
}

// startThenPlay runs play now when the TV is on; otherwise it brings the TV up through
// the same path as the phone's Start TV and the shortcut (requestStart) and runs play
// once the session is on. It says whether the TV had to be started.
func (a *App) startThenPlay(play func()) (starting bool) {
	if a.tvState.Load() == tvOn {
		go play()
		return false
	}
	log.Printf("desk: starting the TV to play")
	a.requestStart("desk")
	go func() {
		for end := time.Now().Add(deskWaitTV); time.Now().Before(end); time.Sleep(500 * time.Millisecond) {
			switch a.tvState.Load() {
			case tvOn:
				time.Sleep(2 * time.Second) // the launcher page loads first
				play()
				return
			case tvOff:
				a.requestStart("desk") // a close was under way when this was pressed
			}
		}
		log.Printf("desk: the TV did not come up; nothing was played")
	}()
	return true
}

// POST /api/desk/rate {key, v: 1|-1|0, title?, service?, kind?} marks a title watched
// (liked or not for me) or takes the mark off, through the same rate() the TV uses.
func (a *App) deskRate(w http.ResponseWriter, r *http.Request) {
	if !deskGate(w, r, http.MethodPost) || !a.deskData(w) {
		return
	}
	var q deskReq
	if !deskDecode(w, r, &q) {
		return
	}
	m := deskKeyRe.FindStringSubmatch(q.Key)
	if m == nil || q.V < -1 || q.V > 1 {
		deskErr(w, http.StatusBadRequest, "bad request")
		return
	}
	// rate() ignores a title it has no record of, and an old mark's title is often no
	// longer on any row: give it the little the mark itself knows
	a.ld.mu.Lock()
	_, known := a.ld.byKey[q.Key]
	a.ld.mu.Unlock()
	if !known {
		it := tmdb.Item{Kind: m[1], Title: q.Title, Service: q.Service}
		it.ID, _ = strconv.Atoi(m[2])
		if old, ok := a.ld.rated.get(q.Key); ok {
			it.Title, it.Service = old.Title, old.Service
		}
		if it.Title == "" {
			deskErr(w, http.StatusUnprocessableEntity, "unknown title")
			return
		}
		a.ld.mu.Lock()
		a.ld.byKey[q.Key], a.ld.extra[q.Key] = it, it
		a.ld.mu.Unlock()
	}
	a.rate(q.Key, q.V)
	cur, _ := a.ld.rated.get(q.Key)
	deskJSON(w, map[string]any{"ok": true, "v": cur.V, "key": q.Key, "msg": fmt.Sprintf("marked %d", cur.V)})
}
