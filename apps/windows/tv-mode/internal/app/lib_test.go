package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"tvmode/internal/history"
	"tvmode/internal/library"
	"tvmode/internal/taste"
	"tvmode/internal/tmdb"
)

// libApp is the desk test app with a library in memory (no file) and nothing that can
// reach the network.
func libApp(t *testing.T) *App {
	t.Helper()
	a := deskApp(t)
	a.ld.lib = library.Open("")
	a.ld.libr = &libResolver{}
	return a
}

func TestLibNoteIdentity(t *testing.T) {
	a := libApp(t)
	// a Hotstar episode, known by name only
	it, ok := a.libNote(LibEvent{Type: "progress", Service: "jiohotstar", Title: "Gravity Falls", Show: "Gravity Falls", Season: 1, Episode: 2, Pos: 60, Dur: 1400})
	if !ok || it.ID != "name:gravityfalls" || it.Kind != "tv" || it.State != library.Watching {
		t.Fatalf("by name = %+v", it)
	}
	// the same show once its TMDB key is known: one item, renamed
	it, _ = a.libNote(LibEvent{Type: "progress", Service: "jiohotstar", Key: "tv40075", Title: "Gravity Falls", Show: "Gravity Falls", Season: 1, Episode: 3, Pos: 10, Dur: 1400})
	if it.ID != "tv40075" || a.ld.lib.Len() != 1 || it.Episode != 3 {
		t.Fatalf("with a key = %+v (items %d)", it, a.ld.lib.Len())
	}
	// and a later report that only has the name still lands on it
	it, _ = a.libNote(LibEvent{Type: "progress", Service: "jiohotstar", Title: "Gravity Falls", Show: "Gravity Falls", Season: 1, Episode: 4, Pos: 10, Dur: 1400})
	if it.ID != "tv40075" || a.ld.lib.Len() != 1 {
		t.Fatalf("by name after the key = %+v", it)
	}
	// YouTube by video id, from the TV's address form
	it, _ = a.libNote(LibEvent{Type: "progress", Service: "youtube", Key: "yt:dQw4w9WgXcQ", Title: "A song", URL: "https://www.youtube.com/tv#/watch?v=dQw4w9WgXcQ&t=5s", Pos: 5, Dur: 212})
	if it.ID != "yt:dQw4w9WgXcQ" || it.Kind != "yt" || !strings.HasPrefix(it.Img, "https://i.ytimg.com/") || it.URL != "https://www.youtube.com/watch?v=dQw4w9WgXcQ" {
		t.Fatalf("youtube = %+v", it)
	}
	// a movie that plays to the end is finished
	a.libNote(LibEvent{Type: "progress", Service: "prime", Title: "Arrival", Pos: 100, Dur: 6000})
	if it, _ = a.libNote(LibEvent{Type: "progress", Service: "prime", Title: "Arrival", Pos: 5800, Dur: 6000}); it.State != library.Finished {
		t.Fatalf("movie at 97%% = %+v", it)
	}
	// nothing to name: nothing written
	if _, ok := a.libNote(LibEvent{Type: "progress", Service: "prime", Pos: 5, Dur: 500}); ok {
		t.Fatal("an event with no title must be dropped")
	}
	// a library-less app (tests build launcherData by hand) is a no-op, not a panic
	b := deskApp(t)
	if _, ok := b.libNote(LibEvent{Title: "x"}); ok {
		t.Fatal("no library, no note")
	}
	b.libWatch(history.Entry{Service: "netflix", Title: "x", Dur: 500, Pos: 1}, "tv-poll")
}

func TestLibHiddenFromContinueUntilPlayedAgain(t *testing.T) {
	a := libApp(t)
	e := history.Entry{Service: "netflix", URL: "https://www.netflix.com/watch/70000001", Title: "Dark", Show: "Dark", Season: 1, Episode: 1, Pos: 600, Dur: 3000, Group: "netflix|dark", Img: "https://image.tmdb.org/t/p/w780/d.jpg"}
	a.ld.hist.Note(e)
	a.libWatch(a.ld.hist.List()[0], "tv-poll")
	before := a.rowsFrame()
	if len(before.Cont) != 1 || len(before.Saved) != 0 {
		t.Fatalf("nothing marked: cont %d saved %d (Continue must be as today)", len(before.Cont), len(before.Saved))
	}
	time.Sleep(5 * time.Millisecond)
	it, ok := a.libMark("name:dark", library.Finished)
	if !ok || it.State != library.Finished {
		t.Fatalf("mark finished = %+v %v", it, ok)
	}
	if f := a.rowsFrame(); len(f.Cont) != 0 {
		t.Fatalf("finished by hand but still in Continue: %d", len(f.Cont))
	}
	// he plays it again: the entry is newer than his mark, it comes back
	time.Sleep(5 * time.Millisecond)
	e.Pos = 700
	a.ld.hist.Note(e)
	a.libWatch(a.ld.hist.List()[0], "tv-poll")
	if f := a.rowsFrame(); len(f.Cont) != 1 {
		t.Fatalf("played again: cont %d, want 1", len(f.Cont))
	}
	// Dropped hides it too, with the original index kept
	time.Sleep(5 * time.Millisecond)
	a.libMark("name:dark", library.Dropped)
	if f := a.rowsFrame(); len(f.Cont) != 0 {
		t.Fatalf("dropped but still in Continue: %d", len(f.Cont))
	}
}

func TestLibSavedRow(t *testing.T) {
	a := libApp(t)
	st := a.ld.lib
	save := func(id, kind, title string) {
		st.Apply(library.Report{Type: "save", ID: id, Kind: kind, Title: title, Where: "phone", Source: "share", Img: "https://i.ytimg.com/vi/x/hqdefault.jpg"})
	}
	save("yt:aaaaaaaaaaa", "yt", "A talk")
	if f := a.rowsFrame(); len(f.Saved) != 0 {
		t.Fatalf("one saved item makes no row, got %d", len(f.Saved))
	}
	save("url:example.com/post", "other", "A page") // a plain link stays on the desk
	if f := a.rowsFrame(); len(f.Saved) != 0 {
		t.Fatalf("a plain link must not count: %d", len(f.Saved))
	}
	save("tv66732", "tv", "Stranger Things")
	f := a.rowsFrame()
	if len(f.Saved) != 2 {
		t.Fatalf("saved row = %d, want 2", len(f.Saved))
	}
	for _, c := range f.Saved {
		if c.Lib == "" || !strings.HasPrefix(c.Img, "/img/") || c.Key != "" {
			t.Fatalf("saved card = %+v (a lib id and a registered image, no key)", c)
		}
	}
	b, _ := json.Marshal(f)
	if !strings.Contains(string(b), `"saved":[`) {
		t.Fatal("the frame must carry saved")
	}
}

func fakeTMDB(t *testing.T) *tmdb.Client {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/search/multi" {
			http.NotFound(w, r)
			return
		}
		q := strings.ToLower(r.URL.Query().Get("query"))
		w.Header().Set("Content-Type", "application/json")
		if q == "stranger things" {
			_, _ = w.Write([]byte(`{"results":[{"id":1,"media_type":"movie","title":"Stranger Things Movie","backdrop_path":"/x.jpg"},{"id":66732,"media_type":"tv","name":"Stranger Things","backdrop_path":"/st.jpg","poster_path":"/stp.jpg","first_air_date":"2016-07-15","vote_average":8.6,"vote_count":9000}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"results":[]}`))
	}))
	t.Cleanup(srv.Close)
	return tmdb.NewWithBase(srv.URL, "T")
}

func TestShareResolver(t *testing.T) {
	a := libApp(t)
	a.ld.tm = fakeTMDB(t)
	oldE, oldF := shareOembed, shareFetchTitle
	t.Cleanup(func() { shareOembed, shareFetchTitle = oldE, oldF })
	shareOembed = func(id string) (string, string, error) { return "A talk about " + id[:3], "Someone", nil }
	fetched := ""
	shareFetchTitle = func(raw, svc string) (string, error) { fetched = raw; return "", http.ErrNotSupported }

	// YouTube: oEmbed title, the video's own thumbnail, the canonical address
	it, dup, err := a.libResolveLink(shareIn{URL: "https://youtu.be/dQw4w9WgXcQ?si=abc"}, "phone", "share")
	if err != nil || dup || it.ID != "yt:dQw4w9WgXcQ" || it.Title != "A talk about dQw" || it.State != library.Saved || it.LastWhere != "phone" || it.URL != "https://www.youtube.com/watch?v=dQw4w9WgXcQ" {
		t.Fatalf("youtube = %+v dup=%v err=%v", it, dup, err)
	}
	if _, dup, _ = a.libResolveLink(shareIn{URL: "https://youtu.be/dQw4w9WgXcQ?si=abc"}, "phone", "share"); !dup {
		t.Fatal("the same link again must be a dup")
	}
	// Android puts the link inside the text and leaves url empty
	it, _, err = a.libResolveLink(shareIn{Text: "Watch Stranger Things on Netflix\nhttps://www.netflix.com/title/80057281?s=i&trkid=1"}, "phone", "share")
	if err != nil || it.ID != "tv66732" || it.Kind != "tv" || !strings.Contains(it.Img, "/st.jpg") || it.State != library.Saved {
		t.Fatalf("netflix text share = %+v err=%v", it, err)
	}
	if fetched != "" {
		t.Fatalf("the title was in the share: no page should have been fetched, got %q", fetched)
	}
	if ti, ok := a.ld.byKey["tv66732"]; !ok || ti.Service != "netflix" {
		t.Fatalf("the saved title must be openable (byKey): %+v %v", ti, ok)
	}
	// a service page TMDB cannot match is kept as a link, with its service
	it, _, err = a.libResolveLink(shareIn{Title: "Some Obscure Thing", URL: "https://www.primevideo.com/detail/0ABC123"}, "phone", "share")
	if err != nil || it.Kind != "other" || it.Title != "Some Obscure Thing" || !strings.HasPrefix(it.ID, "url:") {
		t.Fatalf("unmatched = %+v err=%v", it, err)
	}
	// amazon: only /gp/video is Prime Video
	if it, _, _ = a.libResolveLink(shareIn{Title: "Some Obscure Thing", URL: "https://www.amazon.in/gp/video/detail/B0X"}, "phone", "share"); it.LastSvc != "prime" {
		t.Fatalf("amazon video = %+v", it)
	}
	// anything else is a plain link, and nothing fetches it
	fetched = ""
	for _, raw := range []string{"https://evil.example/netflix.com/watch/1", "https://netflix.com.evil.example/title/1", "https://www.amazon.in/dp/B0X", "http://example.com/a?b=c#frag"} {
		it, _, err := a.libResolveLink(shareIn{URL: raw, Title: "A page"}, "phone", "share")
		if err != nil || it.Kind != "other" || !strings.HasPrefix(it.ID, "url:") || it.State != library.Saved {
			t.Fatalf("%s = %+v err=%v", raw, it, err)
		}
		if strings.Contains(it.URL, "#") {
			t.Fatalf("fragment kept: %s", it.URL)
		}
	}
	if fetched != "" {
		t.Fatalf("a plain link was fetched: %s", fetched)
	}
	// no link at all, or a scheme that is not a web page
	for _, bad := range []shareIn{{}, {URL: "javascript:alert(1)"}, {URL: "file:///c:/windows/win.ini"}, {Text: "just words"}, {URL: "https://user:pw@www.netflix.com/title/1"}} {
		if _, _, err := a.libResolveLink(bad, "phone", "share"); err == nil {
			t.Fatalf("%+v was accepted", bad)
		}
	}
}

func TestShareFrameOverTheWire(t *testing.T) {
	a := libApp(t)
	oldE := shareOembed
	t.Cleanup(func() { shareOembed = oldE })
	shareOembed = func(id string) (string, string, error) { return "Wired", "", nil }
	c := newClient(true, nil)
	// the PC is in standby (the usual case): a share still lands
	if !a.standbyNow() {
		t.Fatal("test setup: the app should be in standby")
	}
	a.handleRemote(c, []byte(`{"t":"save","url":"https://www.youtube.com/watch?v=abcdefghijk","id":"x-1"}`))
	select {
	case b := <-c.send:
		var m struct {
			T        string `json:"t"`
			OK       bool   `json:"ok"`
			ID       string `json:"id"`
			Title    string `json:"title"`
			Playable bool   `json:"playable"`
		}
		if json.Unmarshal(b, &m) != nil || m.T != "saved" || !m.OK || m.ID != "yt:abcdefghijk" || m.Title != "Wired" || !m.Playable {
			t.Fatalf("reply = %s", b)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("no saved reply")
	}
	a.handleRemote(c, []byte(`{"t":"save","url":"javascript:alert(1)"}`))
	select {
	case b := <-c.send:
		if !strings.Contains(string(b), `"ok":false`) {
			t.Fatalf("reply = %s", b)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("no error reply")
	}
}

func TestLibDeskEndpoints(t *testing.T) {
	a := libApp(t)
	a.ld.lib.Apply(library.Report{Type: "save", ID: "tv5", Kind: "tv", Title: "Dark", Where: "phone", Source: "share", Services: []string{"netflix"}})
	a.ld.byKey["tv5"] = tmdb.Item{ID: 5, Kind: "tv", Title: "Dark", Service: "netflix", GIDs: []int{18, 9648}, Lang: "de", Year: "2017", Vote: 8.4, Votes: 5000}
	h := deskMux(a)
	// off the LAN: refused, every one of them
	for _, p := range []string{"/api/library", "/api/library?view=saved"} {
		if w := deskDo(h, "GET", p, "", deskLAN, false); w.Code != http.StatusForbidden {
			t.Errorf("GET %s from the LAN = %d, want 403", p, w.Code)
		}
	}
	for _, p := range []string{"/api/library/state", "/api/library/remove", "/api/library/add", "/api/library/open"} {
		if w := deskDo(h, "POST", p, `{}`, deskLAN, true); w.Code != http.StatusForbidden {
			t.Errorf("POST %s from the LAN = %d, want 403", p, w.Code)
		}
		if w := deskDo(h, "POST", p, `{}`, deskLoop, false); w.Code != http.StatusForbidden {
			t.Errorf("POST %s without X-TVMode = %d, want 403", p, w.Code)
		}
	}
	w := deskDo(h, "GET", "/api/library?view=saved", "", deskLoop, false)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"title":"Dark"`) || !strings.Contains(w.Body.String(), `"saved":1`) || !strings.Contains(w.Body.String(), `"where":"Phone"`) {
		t.Fatalf("list = %d %s", w.Code, w.Body.String())
	}
	if w := deskDo(h, "GET", "/api/library?view=nonsense", "", deskLoop, false); w.Code != http.StatusBadRequest {
		t.Errorf("bad view = %d", w.Code)
	}
	if w := deskDo(h, "POST", "/api/library/state", `{"id":"tv5","state":"nonsense"}`, deskLoop, true); w.Code != http.StatusBadRequest {
		t.Errorf("bad state = %d", w.Code)
	}
	if w := deskDo(h, "POST", "/api/library/state", `{"id":"nope","state":"finished"}`, deskLoop, true); w.Code != http.StatusUnprocessableEntity {
		t.Errorf("unknown id = %d", w.Code)
	}

	// Dropped: taught to taste as Abandon once, however many times it is dropped
	a.ld.taste = taste.Open("")
	n0 := a.ld.taste.Events()
	for i := 0; i < 3; i++ {
		if w := deskDo(h, "POST", "/api/library/state", `{"id":"tv5","state":"dropped"}`, deskLoop, true); w.Code != 200 {
			t.Fatalf("drop = %d %s", w.Code, w.Body.String())
		}
		if w := deskDo(h, "POST", "/api/library/state", `{"id":"tv5","state":"watching"}`, deskLoop, true); w.Code != 200 {
			t.Fatalf("watching = %d %s", w.Code, w.Body.String())
		}
	}
	if n := a.ld.taste.Events() - n0; n != 1 {
		t.Fatalf("taste learned %d times from three drops, want once", n)
	}
	w = deskDo(h, "POST", "/api/library/state", `{"id":"tv5","state":"finished"}`, deskLoop, true)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"state":"finished"`) {
		t.Fatalf("finished = %d %s", w.Code, w.Body.String())
	}
	w = deskDo(h, "GET", "/api/library", "", deskLoop, false)
	if !strings.Contains(w.Body.String(), `"finished":1`) {
		t.Fatalf("counts = %s", w.Body.String())
	}
	// Open here: the library hears it, nothing real opens
	var opened string
	oldOpen := deskOpenURL
	t.Cleanup(func() { deskOpenURL = oldOpen })
	deskOpenURL = func(u string) error { opened = u; return nil }
	if w := deskDo(h, "POST", "/api/library/open", `{"id":"tv5","where":"desk"}`, deskLoop, true); w.Code != 200 || !strings.HasPrefix(opened, "https://www.netflix.com/search") {
		t.Fatalf("open here = %d %s (opened %q)", w.Code, w.Body.String(), opened)
	}
	if it, _ := a.ld.lib.Get("tv5"); it.LastWhere != "desk" {
		t.Fatalf("the open at the desk was not recorded: %+v", it)
	}
	// a plain link opens only if it is a plain web address
	a.ld.lib.Apply(library.Report{Type: "save", ID: "url:example.com/p", Kind: "other", Title: "P", URL: "https://example.com/p?x=1"})
	opened = ""
	if w := deskDo(h, "POST", "/api/library/open", `{"id":"url:example.com/p","where":"desk"}`, deskLoop, true); w.Code != 200 || opened != "https://example.com/p?x=1" {
		t.Fatalf("link open = %d (opened %q)", w.Code, opened)
	}
	if w := deskDo(h, "POST", "/api/library/open", `{"id":"url:example.com/p","where":"tv"}`, deskLoop, true); w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a plain link on the TV = %d, want 422", w.Code)
	}
	// remove
	if w := deskDo(h, "POST", "/api/library/remove", `{"id":"tv5"}`, deskLoop, true); w.Code != 200 {
		t.Fatalf("remove = %d", w.Code)
	}
	if _, ok := a.ld.lib.Get("tv5"); ok {
		t.Fatal("still there after remove")
	}
}

func TestLibDeskReportNeverTouchesTheTV(t *testing.T) {
	a := libApp(t)
	post := func(body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/api/ext/watch", strings.NewReader(body))
		r.Header.Set("Origin", "chrome-extension://abcdef")
		r.RemoteAddr = deskLoop
		w := httptest.NewRecorder()
		a.extBridge(w, r)
		return w
	}
	// a YouTube video playing in the desk Chrome
	w := post(`{"where":"desk","svc":"youtube","title":"A long talk - YouTube","url":"https://www.youtube.com/watch?v=abcdefghijk","pos":300,"dur":3000,"playing":true}`)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"cmds":[]`) {
		t.Fatalf("desk report = %d %s", w.Code, w.Body.String())
	}
	it, ok := a.ld.lib.Get("yt:abcdefghijk")
	if !ok || it.LastWhere != "desk" || it.Source != "desk-reporter" || it.State != library.Watching || it.Title != "A long talk" {
		t.Fatalf("library after a desk report = %+v %v", it, ok)
	}
	// Netflix episode at the desk
	post(`{"where":"desk","svc":"netflix","title":"Dark","episode":2,"season":1,"epTitle":"Lies","url":"https://www.netflix.com/watch/70000002","pos":100,"dur":3000,"playing":true}`)
	if d, ok := a.ld.lib.Get("name:dark"); !ok || d.Season != 1 || d.Episode != 2 || d.LastWhere != "desk" {
		t.Fatalf("netflix at the desk = %+v %v", d, ok)
	}
	// history (the TV's Continue) and the player state are untouched
	if n := len(a.ld.hist.List()); n != 0 {
		t.Fatalf("desk reports must not enter history: %d entries", n)
	}
	// not a real video, an ad, a foreign host, an unknown service: all dropped
	before := a.ld.lib.Len()
	for _, body := range []string{
		`{"where":"desk","svc":"youtube","title":"x","url":"https://www.youtube.com/watch?v=abcdefghijk","pos":1,"dur":60,"playing":true}`,
		`{"where":"desk","svc":"youtube","title":"x","url":"https://evil.example/watch?v=zzzzzzzzzzz","pos":1,"dur":3000,"playing":true}`,
		`{"where":"desk","svc":"netflix","title":"Ad","url":"https://www.netflix.com/watch/1","pos":1,"dur":3000,"playing":true,"ad":true}`,
		`{"where":"desk","svc":"netflix","title":"Paused","url":"https://www.netflix.com/watch/1","pos":1,"dur":3000,"playing":false}`,
		`{"where":"desk","svc":"hulu","title":"x","url":"https://www.hulu.com/watch/1","pos":1,"dur":3000,"playing":true}`,
	} {
		post(body)
	}
	if a.ld.lib.Len() != before {
		t.Fatalf("a bad desk report was recorded: %d items, was %d", a.ld.lib.Len(), before)
	}
}
