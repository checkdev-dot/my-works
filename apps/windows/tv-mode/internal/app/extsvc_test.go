package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"tvmode/internal/extapp"
	"tvmode/internal/history"
	"tvmode/internal/taste"
	"tvmode/internal/tmdb"
	"tvmode/internal/winsys"
)

var (
	testWork = winsys.Monitor{X: 0, Y: 0, W: 2560, H: 1440, Primary: true}
	testTV   = winsys.Monitor{X: 2560, Y: 0, W: 1920, H: 1080}
)

// extTestApp is an App with an empty history in a temp folder and two monitors (work,
// then the TV). Nothing here touches Dev's AppData.
func extTestApp(t *testing.T) *App {
	t.Setenv("TVMODE_TEST_ROWS", "1")
	eps.mu.Lock()
	eps.loaded, eps.path, eps.m = true, "", map[string]epMark{}
	eps.mu.Unlock()
	a := &App{o: Options{Test: true, Display: 1}, hub: newHub(), ext: extapp.New(), st: State{T: "state", App: "launcher"}}
	a.ld = &launcherData{hist: history.Open(t.TempDir() + "/h.json"), links: map[string]string{}, byKey: map[string]tmdb.Item{},
		extra: map[string]tmdb.Item{}, details: map[string]tmdb.Details{}, imgSrc: map[string]string{}, trail: map[string]string{}, taste: taste.Open("")}
	a.monsFn = func() []winsys.Monitor { return []winsys.Monitor{testWork, testTV} }
	extHelloAt.Store(0)
	return a
}

func post(a *App, path, body string) (int, map[string]any) {
	r := httptest.NewRequest("POST", "/api/ext/"+path, strings.NewReader(body))
	r.Header.Set("Origin", "chrome-extension://abc")
	w := httptest.NewRecorder()
	a.extBridge(w, r)
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func cardOf(a *App, service string) (history.Entry, bool) {
	for _, e := range a.ld.hist.List() {
		if e.Service == service && !e.Opened {
			return e, true
		}
	}
	return history.Entry{}, false
}

func nfPlaying(a *App) bool { _, ok := a.nf.get(time.Now()); return ok }

// A report with no svc (helper 1.3.0) behaves as before: Netflix, a Netflix card, live media.
func TestOldNetflixReportUnchanged(t *testing.T) {
	a := extTestApp(t)
	code, out := post(a, "watch", `{"title":"Black Mirror","season":3,"episode":5,"epTitle":"Men Against Fire","pos":600,"dur":3600,"playing":true,"url":"https://www.netflix.com/watch/80104628"}`)
	if code != http.StatusOK || out["cmds"] == nil {
		t.Fatalf("reply %d %v", code, out)
	}
	e, ok := cardOf(a, "netflix")
	if !ok || e.Show != "Black Mirror" || e.Season != 3 || e.Episode != 5 || e.Pos != 600 || e.Dur != 3600 {
		t.Fatalf("netflix card: %+v %v", e, ok)
	}
	if m, ok := a.nf.get(time.Now()); !ok || m.Dur != 3600 {
		t.Fatal("live media missing")
	}
	// a 2.0 Netflix report from the TV window is the same
	a = extTestApp(t)
	post(a, "watch", `{"svc":"netflix","title":"Dark","season":1,"episode":2,"pos":10,"dur":3000,"url":"https://www.netflix.com/watch/1","scr":{"x":2560,"y":0,"w":1920,"h":1080,"dpr":1}}`)
	if _, ok := cardOf(a, "netflix"); !ok {
		t.Fatal("2.0 netflix report from the TV lost")
	}
}

func TestPrimeReportMakesPrimeCard(t *testing.T) {
	a := extTestApp(t)
	body := `{"svc":"prime","title":"The Boys","pos":300,"dur":3000,"playing":true,"url":"https://www.primevideo.com/detail/0ABC/?autoplay=1",` +
		`"w":{"href":"https://www.primevideo.com/detail/0ABC/?autoplay=1","title":"Prime Video: The Boys","pt":"The Boys","ps":"Season 2, Ep. 3 Barbary Coast","has":true,"playing":true,"pos":300,"dur":3000},` +
		`"scr":{"x":2560,"y":0,"w":1920,"h":1080,"dpr":1}}`
	if code, _ := post(a, "watch", body); code != http.StatusOK {
		t.Fatal(code)
	}
	e, ok := cardOf(a, "prime")
	if !ok || e.Show != "The Boys" || e.Season != 2 || e.Episode != 3 || e.Pos != 300 || e.Dur != 3000 {
		t.Fatalf("prime card: %+v %v", e, ok)
	}
	if _, ok := cardOf(a, "netflix"); ok {
		t.Fatal("a Prime report made a Netflix card")
	}
	if got := a.linkGet(linkKey("prime", "The Boys", 2, 3)); got != "https://www.primevideo.com/detail/0ABC/?autoplay=1" {
		t.Fatalf("episode link not kept: %q", got)
	}
	if !nfPlaying(a) {
		t.Fatal("no live media")
	}
}

func TestHotstarReportMakesHotstarCard(t *testing.T) {
	a := extTestApp(t)
	u := "https://www.hotstar.com/in/shows/gravity-falls/1260021/dipper-vs-manliness/1260022/watch"
	body := `{"svc":"jiohotstar","title":"x","pos":120,"dur":1400,"playing":true,"url":"` + u + `",` +
		`"w":{"href":"` + u + `","title":"Watch Gravity Falls S1 Episode 2 on JioHotstar","has":true,"playing":true,"pos":120,"dur":1400}}`
	post(a, "watch", body)
	e, ok := cardOf(a, "jiohotstar")
	if !ok || e.Show != "Gravity Falls" || e.Season != 1 || e.Episode != 2 || e.Dur != 1400 {
		t.Fatalf("hotstar card: %+v %v", e, ok)
	}
	if a.linkGet(linkKey("jiohotstar", "Gravity Falls", 1, 2)) != u {
		t.Fatal("hotstar episode link not kept")
	}
}

// A window on another monitor must neither make cards, nor go live, nor take commands.
func TestReportFromOtherMonitorIgnored(t *testing.T) {
	a := extTestApp(t)
	a.nf.set(Media{Playing: true, Pos: 1, Dur: 3000}, time.Now()) // TV window live
	a.nf.push(nfCmd{A: "skip"}, time.Now())
	u := "https://www.hotstar.com/in/shows/x-show/1/ep-name/2/watch"
	body := `{"svc":"jiohotstar","pos":120,"dur":1400,"playing":true,"url":"` + u + `","w":{"href":"` + u + `","title":"Watch X Show S1 Episode 2","has":true},"scr":{"x":100,"y":50,"w":1400,"h":900,"dpr":1}}`
	_, out := post(a, "watch", body)
	if l, _ := out["cmds"].([]any); len(l) != 0 {
		t.Fatalf("commands went to the wrong window: %v", out)
	}
	if _, ok := cardOf(a, "jiohotstar"); ok {
		t.Fatal("a window off the TV monitor made a card")
	}
	if m, _ := a.nf.get(time.Now()); m.Dur != 3000 {
		t.Fatalf("a window off the TV monitor changed the live media: %+v", m)
	}
	// the same off-TV window for Netflix
	post(a, "watch", `{"svc":"netflix","title":"Dark","season":1,"episode":1,"pos":5,"dur":3000,"url":"https://www.netflix.com/watch/9","scr":{"x":100,"y":50,"w":1400,"h":900,"dpr":1}}`)
	if _, ok := cardOf(a, "netflix"); ok {
		t.Fatal("netflix window off the TV monitor made a card")
	}
	a.nf.take(time.Now())
	// the TV's own window still gets its command
	a.nf.push(nfCmd{A: "skip"}, time.Now())
	_, out = post(a, "watch", `{"svc":"netflix","title":"Dark","season":1,"episode":1,"pos":5,"dur":3000,"url":"https://www.netflix.com/watch/9","scr":{"x":2600,"y":0,"w":1920,"h":1080,"dpr":1}}`)
	if l, _ := out["cmds"].([]any); len(l) != 1 {
		t.Fatalf("the TV window got no command: %v", out)
	}
}

// Fail open: unclear positions are accepted; only a centre on another monitor is refused.
func TestOffTV(t *testing.T) {
	all := []winsys.Monitor{testWork, testTV}
	cases := []struct {
		name string
		s    *extScreen
		off  bool
	}{
		{"old helper", nil, false},
		{"tv, dpr 1", &extScreen{X: 2560, Y: 0, W: 1920, H: 1080, Dpr: 1}, false},
		{"tv in css px of a 1.5 screen", &extScreen{X: 1707, Y: 0, W: 1280, H: 720, Dpr: 1.5}, false},
		{"work monitor", &extScreen{X: 100, Y: 100, W: 1400, H: 900, Dpr: 1}, true},
		{"work monitor at 1.5", &extScreen{X: 100, Y: 100, W: 1000, H: 700, Dpr: 1.5}, true},
		{"on no monitor", &extScreen{X: 9000, Y: 9000, W: 800, H: 600, Dpr: 1}, false},
		{"empty size", &extScreen{X: 100, Y: 100}, false},
	}
	for _, c := range cases {
		if got := offTV(c.s, testTV, all); got != c.off {
			t.Errorf("%s: off=%v want %v", c.name, got, c.off)
		}
	}
}

// A resume waits for the helper's first live report, rides the reply (not the 2 s
// queue), ignores an ad of another length, and stops once the player is there.
func TestResumeThroughHelper(t *testing.T) {
	t.Setenv("TVMODE_TEST_EXT", "1")
	a := extTestApp(t)
	a.st.App = "prime"
	a.resumeAt(history.Entry{Service: "prime", URL: "https://www.primevideo.com/detail/0ABC/?autoplay=1", Show: "The Boys", Season: 2, Episode: 3, Pos: 300, Dur: 3000})
	if !a.resume.pending("prime") {
		t.Fatal("resume not kept for the helper")
	}
	rep := func(pos, dur int, ad bool) []any {
		b, _ := json.Marshal(map[string]any{"svc": "prime", "pos": pos, "dur": dur, "playing": true, "ad": ad, "url": "https://www.primevideo.com/detail/0ABC/?autoplay=1"})
		_, out := post(a, "watch", string(b))
		l, _ := out["cmds"].([]any)
		return l
	}
	if l := rep(5, 30, false); len(l) != 0 { // a 30 s ad
		t.Fatalf("seek during an ad: %v", l)
	}
	if l := rep(2, 3000, true); len(l) != 0 {
		t.Fatalf("seek while the ad indicator shows: %v", l)
	}
	l := rep(0, 3000, false)
	if len(l) != 1 || l[0].(map[string]any)["a"] != "seekto" || l[0].(map[string]any)["ms"].(float64) != 297000 {
		t.Fatalf("expected seekto 297000: %v", l)
	}
	if l := rep(298, 3000, false); len(l) != 0 || !a.resume.pending("prime") {
		t.Fatalf("resume must stay alive once there (Prime's bookmark may win it back): %v", l)
	}
}

// The resume ends only after the position held near the target for resumeStable; if the player's own
// bookmark wins it back (more than 60 s below) within 30 s, the seek is retried once, and only once.
func TestResumeSticky(t *testing.T) {
	var r extResume
	t0 := time.Now()
	at := func(sec int) time.Time { return t0.Add(time.Duration(sec) * time.Second) }
	r.arm("prime", 700, 3000, t0)
	if ms, ok := r.step("prime", 0, 3000, false, at(1)); !ok || ms != 697000 {
		t.Fatalf("first seek: %v %v", ms, ok)
	}
	if _, ok := r.step("prime", 699, 3000, false, at(4)); ok || !r.pending("prime") {
		t.Fatal("there once must not end the resume")
	}
	if _, ok := r.step("prime", 705, 3000, false, at(8)); ok || !r.pending("prime") {
		t.Fatal("still inside the stable window")
	}
	// Prime's own bookmark wins it back
	if ms, ok := r.step("prime", 474, 3000, false, at(9)); !ok || ms != 697000 {
		t.Fatalf("expected one more seek after the drop: %v %v", ms, ok)
	}
	if _, ok := r.step("prime", 699, 3000, false, at(12)); ok || !r.pending("prime") {
		t.Fatal("back there, window restarts")
	}
	if _, ok := r.step("prime", 474, 3000, false, at(14)); ok || r.pending("prime") {
		t.Fatal("a second drop must end the resume without another seek")
	}
	// holding for the whole window ends it
	r.arm("prime", 700, 3000, at(100))
	r.step("prime", 700, 3000, false, at(101))
	if _, ok := r.step("prime", 712, 3000, false, at(101).Add(resumeStable)); ok || r.pending("prime") {
		t.Fatal("held position should end the resume")
	}
}

// A play the page refused is answered once with a real key, within 8 s of the press.
func TestPlayFallbackOncePerPress(t *testing.T) {
	var l nfLive
	now := time.Now()
	if l.playFallbackDue(now) {
		t.Fatal("no press yet")
	}
	l.notePlay(now)
	if !l.playFallbackDue(now.Add(time.Second)) {
		t.Fatal("first failure after a press should fall back")
	}
	if l.playFallbackDue(now.Add(2 * time.Second)) {
		t.Fatal("only once per press")
	}
	l.notePlay(now.Add(20 * time.Second))
	if l.playFallbackDue(now.Add(30 * time.Second)) {
		t.Fatal("too late after the press")
	}
}

// The phone's Episodes tab: a Prime or Hotstar card names its show, so the tab lists
// it, and a tap goes to the service that is playing.
func TestEpisodesTabForPrimeAndHotstar(t *testing.T) {
	a := extTestApp(t)
	a.ld.byKey["tv76479"] = tmdb.Item{ID: 76479, Kind: "tv", Title: "The Boys", Service: "prime"}
	a.ld.byKey["tv1428"] = tmdb.Item{ID: 1428, Kind: "tv", Title: "Gravity Falls", Service: "jiohotstar"}
	a.ld.hist.Note(history.Entry{Service: "prime", URL: "https://www.primevideo.com/detail/0ABC/?autoplay=1", Title: "The Boys", Show: "The Boys", Season: 2, Episode: 3, Group: "prime|the boys", Pos: 300, Dur: 3000})
	a.ld.hist.Note(history.Entry{Service: "jiohotstar", URL: "https://www.hotstar.com/in/shows/gravity-falls/1/dipper/2/watch", Title: "Gravity Falls", Show: "Gravity Falls", Season: 1, Episode: 2, Group: "jiohotstar|dipper", Pos: 60, Dur: 1400})
	if k := a.showKey("prime"); k != "tv76479" {
		t.Fatalf("prime show key %q", k)
	}
	if k := a.showKey("jiohotstar"); k != "tv1428" {
		t.Fatalf("hotstar show key %q", k)
	}
	if k := a.showKey("netflix"); k != "" {
		t.Fatalf("netflix has no card: %q", k)
	}
	// openitem: the phone sends the playing service; it must be the one that opens
	it := a.ld.byKey["tv76479"]
	for _, svc := range []string{"prime", "jiohotstar", "netflix"} {
		if got := a.pickOpenSvc(svc, "tv76479", it); got != svc {
			t.Errorf("openitem with %s went to %q", svc, got)
		}
	}
}

func TestHelperLinks(t *testing.T) {
	a := extTestApp(t)
	post(a, "link", `{"svc":"jiohotstar","title":"Gravity Falls","url":"https://www.hotstar.com/in/shows/gravity-falls/1260021","eps":[[1,1,"https://www.hotstar.com/in/shows/gravity-falls/1260021/tourist-trapped/1260030/watch"],[1,2,"https://evil.example/x"]]}`)
	if a.linkGet(linkKey("jiohotstar", "Gravity Falls", 0, 0)) == "" || a.linkGet(linkKey("jiohotstar", "Gravity Falls", 1, 1)) == "" {
		t.Fatal("hotstar links not kept")
	}
	if a.linkGet(linkKey("jiohotstar", "Gravity Falls", 1, 2)) != "" {
		t.Fatal("a foreign address was kept")
	}
	post(a, "link", `{"svc":"prime","title":"The Boys","eps":[[2,3,"https://www.primevideo.com/detail/0EP3/?autoplay=1"]]}`)
	if a.linkGet(linkKey("prime", "The Boys", 2, 3)) != "https://www.primevideo.com/detail/0EP3/?autoplay=1" {
		t.Fatalf("prime link: %q", a.linkGet(linkKey("prime", "The Boys", 2, 3)))
	}
}

func TestExtHostOK(t *testing.T) {
	for _, c := range []struct {
		svc, u string
		ok     bool
	}{
		{"netflix", "https://www.netflix.com/watch/1", true},
		{"netflix", "https://www.hotstar.com/x", false},
		{"prime", "https://www.primevideo.com/detail/x", true},
		{"prime", "https://www.amazon.in/gp/video/detail/x", true},
		{"prime", "https://www.amazon.in/dp/B00", false},
		{"jiohotstar", "https://www.hotstar.com/in/shows/a/1/watch", true},
		{"jiohotstar", "http://www.hotstar.com/in", false},
	} {
		if extHostOK(c.svc, c.u) != c.ok {
			t.Errorf("%s %s: want %v", c.svc, c.u, c.ok)
		}
	}
}

// A Prime trailer on a title page (no player title) is live for commands but never a card.
func TestPrimeTrailerMakesNoCard(t *testing.T) {
	a := extTestApp(t)
	u := "https://www.primevideo.com/detail/0ABC/ref=x"
	post(a, "watch", `{"svc":"prime","title":"The Boys","pos":10,"dur":180,"playing":true,"url":"`+u+`","w":{"href":"`+u+`","title":"Prime Video: The Boys","pt":"","has":true,"playing":true,"pos":10,"dur":180}}`)
	if _, ok := cardOf(a, "prime"); ok {
		t.Fatal("a trailer made a card")
	}
	if !nfPlaying(a) {
		t.Fatal("not live")
	}
}

// round 3: an episode built from helper links has no launcher key; its tap opens the link.
func TestLinkEpURLForEmptyKey(t *testing.T) {
	a := extTestApp(t)
	a.ld.hist.Note(history.Entry{Service: "prime", URL: "https://www.primevideo.com/detail/0ABC/?autoplay=1", Title: "The Boys", Show: "The Boys", Season: 2, Episode: 3, Group: "prime|the boys", Pos: 300, Dur: 3000})
	post(a, "link", `{"svc":"prime","title":"The Boys","eps":[[2,3,"https://www.primevideo.com/detail/0EP3/?autoplay=1"]]}`)
	// a newer YouTube card from the desk Chrome must not win
	a.ld.hist.Note(history.Entry{Service: "youtube", Group: "yt:abcdefghijk", Title: "A long talk", URL: "https://www.youtube.com/watch?v=abcdefghijk", Pos: 600, Dur: 3000, At: time.Now().Add(time.Hour).UnixMilli()})
	if u := a.linkEpURL("prime", 2, 3); u != "https://www.primevideo.com/detail/0EP3/?autoplay=1" {
		t.Fatalf("link ep: %q", u)
	}
	if u := a.linkEpURL("prime", 2, 4); u != "" {
		t.Fatalf("unknown episode gave %q", u)
	}
}

// round 3: a pre-roll (no show report yet) still makes the helper live, with no length.
func TestPreRollMarksLive(t *testing.T) {
	var l nfLive
	now := time.Now()
	l.touch(now)
	if !l.setAdMedia(true, now) {
		t.Fatal("pre-roll should change the frame")
	}
	m, ok := l.get(now)
	if !ok || !m.Ad || m.Dur != 0 {
		t.Fatalf("pre-roll media: %+v live %v", m, ok)
	}
	l.setAd(true)
	if !l.adNow(now) {
		t.Fatal("ad not seen as on")
	}
}

// round 3: no scrubbing or seeking while an ad plays.
func TestSeekRefusedDuringAd(t *testing.T) {
	a := extTestApp(t)
	now := time.Now()
	a.nf.setAs("prime", Media{Playing: true, Pos: 100, Dur: 2700, Rate: 1}, now)
	a.handleExternal(msg{T: "media", A: "seek", S: json.RawMessage("10")})
	if cmds := a.nf.take(time.Now()); len(cmds) != 1 {
		t.Skipf("setup: a seek does not reach the helper in this test app (%d cmds)", len(cmds))
	}
	a.nf.setAd(true)
	a.nf.touch(now)
	if !a.nf.adNow(time.Now()) {
		t.Fatal("setup: ad not on")
	}
	a.handleExternal(msg{T: "media", A: "seek", S: json.RawMessage("10")})
	a.handleExternal(msg{T: "scrub", To: 0.5})
	if cmds := a.nf.take(time.Now()); len(cmds) != 0 {
		t.Fatalf("seek/scrub went out during an ad: %+v", cmds)
	}
}
