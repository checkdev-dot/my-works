package app

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"tvmode/internal/history"
	"tvmode/internal/taste"
	"tvmode/internal/tmdb"
)

func deskApp(t *testing.T) *App {
	t.Helper()
	// every cache path (link book, rows cache) comes from LOCALAPPDATA: never Dev's real one
	t.Setenv("LOCALAPPDATA", t.TempDir())
	dir := t.TempDir()
	a := &App{o: Options{Test: true, Standby: true, WebDir: dir}, hub: newHub(), startCh: make(chan struct{}, 1)}
	a.ld = &launcherData{hist: history.Open(filepath.Join(dir, "h.json")), byKey: map[string]tmdb.Item{}, extra: map[string]tmdb.Item{}, imgSrc: map[string]string{}, trail: map[string]string{}, details: map[string]tmdb.Details{}, links: map[string]string{}, taste: taste.Open(""), rated: openRated(filepath.Join(dir, "rated.json"))}
	return a
}

func deskMux(a *App) http.Handler {
	mux := http.NewServeMux()
	a.deskRoutes(mux)
	return lanGate(mux)
}

func deskDo(h http.Handler, method, path, body, remote string, hdr bool) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.RemoteAddr = remote
	if hdr {
		r.Header.Set("X-TVMode", "desk")
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

const (
	deskLoop = "127.0.0.1:50000"
	deskLAN  = "192.168.1.20:50000"
)

func TestDeskRefusesOffLoopback(t *testing.T) {
	a := deskApp(t)
	for _, p := range []string{"/desk/", "/api/rows", "/api/rated/all", "/api/desk/state", "/api/desk/hist"} {
		if w := deskDo(deskMux(a), "GET", p, "", deskLAN, false); w.Code != http.StatusForbidden {
			t.Errorf("%s from the LAN = %d, want 403", p, w.Code)
		}
	}
	for _, p := range []string{"/api/desk/open", "/api/desk/rate"} {
		if w := deskDo(deskMux(a), "POST", p, `{}`, deskLAN, true); w.Code != http.StatusForbidden {
			t.Errorf("%s from the LAN = %d, want 403", p, w.Code)
		}
	}
	// the handlers check again themselves, without lanGate in front
	mux := http.NewServeMux()
	a.deskRoutes(mux)
	if w := deskDo(mux, "GET", "/api/rows", "", deskLAN, false); w.Code != http.StatusForbidden {
		t.Errorf("handler alone from the LAN = %d, want 403", w.Code)
	}
}

func TestDeskPostNeedsHeader(t *testing.T) {
	a := deskApp(t)
	for _, p := range []string{"/api/desk/open", "/api/desk/rate"} {
		if w := deskDo(deskMux(a), "POST", p, `{}`, deskLoop, false); w.Code != http.StatusForbidden {
			t.Errorf("%s without X-TVMode = %d, want 403", p, w.Code)
		}
	}
	if w := deskDo(deskMux(a), "GET", "/api/desk/open", "", deskLoop, false); w.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET open = %d, want 405", w.Code)
	}
}

func TestDeskReadEndpoints(t *testing.T) {
	a := deskApp(t)
	a.ld.rated.set("movie1", rating{V: 1, At: 5, Title: "Arrival", Service: "prime", Kind: "movie"}, false)
	a.ld.rated.set("tv2", rating{V: -1, At: 9, Title: "Dark", Service: "netflix", Kind: "tv"}, false)
	w := deskDo(deskMux(a), "GET", "/api/rated/all", "", deskLoop, false)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"title":"Dark"`) || strings.Index(w.Body.String(), "Dark") > strings.Index(w.Body.String(), "Arrival") {
		t.Errorf("rated/all = %d %s (want both, newest first)", w.Code, w.Body.String())
	}
	if w := deskDo(deskMux(a), "GET", "/api/desk/state", "", deskLoop, false); w.Code != 200 || !strings.Contains(w.Body.String(), `"tv":"off"`) {
		t.Errorf("state = %d %s", w.Code, w.Body.String())
	}
	if w := deskDo(deskMux(a), "GET", "/api/desk/hist", "", deskLoop, false); w.Code != 200 || !strings.Contains(w.Body.String(), `"items":[]`) {
		t.Errorf("hist = %d %s", w.Code, w.Body.String())
	}
	if w := deskDo(deskMux(a), "GET", "/api/rows", "", deskLoop, false); w.Code != 200 || !strings.Contains(w.Body.String(), `"t":"rows"`) {
		t.Errorf("rows = %d %s", w.Code, w.Body.String())
	}
}

func TestDeskSafeURL(t *testing.T) {
	ok := map[string]string{
		"https://www.netflix.com/watch/81?t=120":               "https://www.netflix.com/watch/81?t=120",
		"https://www.netflix.com/search?q=x#tvgo=%7B%22a%22%7D": "https://www.netflix.com/search?q=x",
		"https://www.primevideo.com/detail/abc/?autoplay=1":    "https://www.primevideo.com/detail/abc/?autoplay=1",
		"https://www.hotstar.com/in/shows/x/1/watch":           "https://www.hotstar.com/in/shows/x/1/watch",
	}
	for in, want := range ok {
		if got, good := deskSafeURL(in); !good || got != want {
			t.Errorf("deskSafeURL(%q) = %q %v, want %q", in, got, good, want)
		}
	}
	for _, in := range []string{"http://www.netflix.com/", "https://evil.example/netflix.com", "https://netflix.com.evil.example/", "https://user:pw@www.netflix.com/", "javascript:alert(1)", "file:///c:/x", "", "-flag"} {
		if _, good := deskSafeURL(in); good {
			t.Errorf("deskSafeURL(%q) accepted", in)
		}
	}
}

func TestDeskResolve(t *testing.T) {
	a := deskApp(t)
	a.ld.byKey["tv5"] = tmdb.Item{ID: 5, Kind: "tv", Title: "Dark", Service: "netflix"}
	a.ld.byKey["movie6"] = tmdb.Item{ID: 6, Kind: "movie", Title: "Arrival", Service: "prime"}
	res := func(r deskReq) string {
		u, _, err := a.deskResolve(r)
		if err != nil {
			t.Fatalf("%+v: %v", r, err)
		}
		return u
	}
	// nothing known: the service's search, no #tvgo note
	if u := res(deskReq{K: "item", Key: "tv5", Svc: "netflix"}); u != "https://www.netflix.com/search?q=Dark" {
		t.Errorf("search = %q", u)
	}
	// the title's page, then the exact episode, from the link book
	a.linkPut(linkKey("netflix", "Dark", 0, 0), "https://www.netflix.com/title/80100172")
	if u := res(deskReq{K: "item", Key: "tv5", Svc: "netflix"}); u != "https://www.netflix.com/title/80100172" {
		t.Errorf("page = %q", u)
	}
	a.linkPut(linkKey("netflix", "Dark", 1, 3), "https://www.netflix.com/watch/70000003")
	if u := res(deskReq{K: "item", Key: "tv5", Svc: "netflix", Se: 1, Ep: 3}); u != "https://www.netflix.com/watch/70000003" {
		t.Errorf("episode = %q", u)
	}
	// an episode the book lacks falls back to the page
	if u := res(deskReq{K: "item", Key: "tv5", Svc: "netflix", Se: 2, Ep: 1}); u != "https://www.netflix.com/title/80100172" {
		t.Errorf("missing episode = %q", u)
	}
	// Prime has no link yet: its search
	if u := res(deskReq{K: "item", Key: "movie6", Svc: "prime"}); !strings.HasPrefix(u, "https://www.primevideo.com/search") {
		t.Errorf("prime = %q", u)
	}
	// history: the page he watched it on (Netflix gets its start-at)
	a.ld.hist.Note(history.Entry{Service: "netflix", URL: "https://www.netflix.com/watch/70000001", Title: "Dark", Show: "Dark", Season: 1, Episode: 1, Pos: 600, Dur: 3000, At: time.Now().UnixMilli(), Group: "netflix|dark"})
	if u := res(deskReq{K: "item", Key: "tv5", Svc: "netflix"}); u != "https://www.netflix.com/watch/70000001?t=597" {
		t.Errorf("history = %q", u)
	}
	if u := res(deskReq{K: "cont", I: 0, Title: "Dark"}); u != "https://www.netflix.com/watch/70000001?t=597" {
		t.Errorf("cont = %q", u)
	}
	// a moved list or an unknown title is refused
	if _, _, err := a.deskResolve(deskReq{K: "cont", I: 0, Title: "Other"}); err != errDeskStale {
		t.Errorf("stale cont: %v", err)
	}
	if _, _, err := a.deskResolve(deskReq{K: "item", Key: "movie99"}); err == nil {
		t.Error("unknown title accepted")
	}
}

func TestDeskOpenHereCallsBrowserOnly(t *testing.T) {
	a := deskApp(t)
	a.ld.byKey["movie6"] = tmdb.Item{ID: 6, Kind: "movie", Title: "Arrival", Service: "prime"}
	var opened []string
	old := deskOpenURL
	deskOpenURL = func(u string) error { opened = append(opened, u); return nil }
	defer func() { deskOpenURL = old }()
	w := deskDo(deskMux(a), "POST", "/api/desk/open", `{"where":"desk","k":"item","key":"movie6","svc":"prime"}`, deskLoop, true)
	if w.Code != 200 || len(opened) != 1 || !strings.HasPrefix(opened[0], "https://www.primevideo.com/search") {
		t.Fatalf("open here = %d %s opened %v", w.Code, w.Body.String(), opened)
	}
	// the page can never name an address
	w = deskDo(deskMux(a), "POST", "/api/desk/open", `{"where":"desk","k":"item","key":"movie6","url":"https://evil.example/"}`, deskLoop, true)
	if len(opened) != 2 || strings.Contains(opened[1], "evil") {
		t.Errorf("a posted address was used: %v", opened)
	}
	// a bad key never reaches the browser
	deskDo(deskMux(a), "POST", "/api/desk/open", `{"where":"desk","k":"item","key":"../x"}`, deskLoop, true)
	if len(opened) != 2 {
		t.Errorf("bad key opened %v", opened)
	}
	if w = deskDo(deskMux(a), "POST", "/api/desk/open", `{"where":"desk","k":"cont","i":3,"title":"x"}`, deskLoop, true); w.Code != http.StatusConflict {
		t.Errorf("stale cont = %d, want 409", w.Code)
	}
}

func TestDeskPlayOnTV(t *testing.T) {
	a := deskApp(t)
	a.ld.hist.Note(history.Entry{Service: "netflix", URL: "https://www.netflix.com/watch/1", Title: "Dark", Pos: 600, Dur: 3000, At: time.Now().UnixMilli()})
	body := `{"where":"tv","k":"cont","i":0,"title":"Dark"}`
	// TV on: plays at once (openAppAt returns quietly with no Edge)
	a.tvState.Store(tvOn)
	if w := deskDo(deskMux(a), "POST", "/api/desk/open", body, deskLoop, true); w.Code != 200 {
		t.Errorf("tv on = %d %s", w.Code, w.Body.String())
	}
	// standby: asks the Run loop to start the TV (the same startCh as the phone's Start TV), 202
	a.tvState.Store(tvOff)
	old := deskWaitTV
	deskWaitTV = 50 * time.Millisecond
	defer func() { deskWaitTV = old }()
	if w := deskDo(deskMux(a), "POST", "/api/desk/open", body, deskLoop, true); w.Code != http.StatusAccepted || len(a.startCh) != 1 {
		t.Errorf("standby = %d %s startCh %d", w.Code, w.Body.String(), len(a.startCh))
	}
	time.Sleep(150 * time.Millisecond)
	if w := deskDo(deskMux(a), "POST", "/api/desk/open", `{"where":"tv","k":"cont","i":0,"title":"Nope"}`, deskLoop, true); w.Code != http.StatusConflict {
		t.Errorf("stale = %d", w.Code)
	}
}

func TestDeskRateTitleMissingFromRows(t *testing.T) {
	a := deskApp(t)
	// an old mark whose title is on no row any more: change it, then remove it
	a.ld.rated.set("movie7", rating{V: 1, At: 1, Title: "Old Film", Service: "prime", Kind: "movie"}, false)
	w := deskDo(deskMux(a), "POST", "/api/desk/rate", `{"key":"movie7","v":-1}`, deskLoop, true)
	if r, _ := a.ld.rated.get("movie7"); w.Code != 200 || r.V != -1 || r.Title != "Old Film" {
		t.Fatalf("change = %d %s %+v", w.Code, w.Body.String(), r)
	}
	if w = deskDo(deskMux(a), "POST", "/api/desk/rate", `{"key":"movie7","v":0}`, deskLoop, true); w.Code != 200 || a.isRated("movie7") {
		t.Fatalf("remove = %d %s", w.Code, w.Body.String())
	}
	// a title from search or a row: Watched it, Liked it
	a.ld.byKey["tv8"] = tmdb.Item{ID: 8, Kind: "tv", Title: "Dark", Service: "netflix"}
	if w = deskDo(deskMux(a), "POST", "/api/desk/rate", `{"key":"tv8","v":1}`, deskLoop, true); w.Code != 200 || !a.isRated("tv8") {
		t.Fatalf("like = %d %s", w.Code, w.Body.String())
	}
	// not a title key, or a value out of range
	for _, b := range []string{`{"key":"x","v":1}`, `{"key":"movie9","v":5}`, `{"key":"movie9","v":1}`} {
		if w = deskDo(deskMux(a), "POST", "/api/desk/rate", b, deskLoop, true); w.Code == 200 {
			t.Errorf("%s accepted", b)
		}
	}
}
