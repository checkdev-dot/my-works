package app

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"tvmode/internal/history"
	"tvmode/internal/occasion"
	"tvmode/internal/taste"
	"tvmode/internal/tmdb"
)

func occTestApp(t *testing.T, at string) *App {
	t.Helper()
	t.Setenv("TVMODE_TEST_ROWS", "1")
	t.Setenv("LOCALAPPDATA", t.TempDir()) // never Dev's real cache
	dir := t.TempDir()
	a := &App{o: Options{Test: true}, hub: newHub()}
	a.ld = &launcherData{hist: history.Open(filepath.Join(dir, "h.json")), byKey: map[string]tmdb.Item{}, extra: map[string]tmdb.Item{}, imgSrc: map[string]string{}, trail: map[string]string{}, details: map[string]tmdb.Details{}, links: map[string]string{}, taste: taste.Open(""), rated: openRated("")}
	a.ld.data = cannedData()
	a.ld.occ = &occState{keys: map[string]string{}, cal: occasion.Open("", ""), learned: occasion.OpenLearned(""), cache: newOccCache("")}
	a.indexKeys()
	setNow(t, at)
	return a
}

func setNow(t *testing.T, s string) {
	t.Helper()
	tm, err := time.ParseInLocation("2006-01-02T15:04", s, time.Local)
	if err != nil {
		t.Fatal(err)
	}
	nowHook = func() time.Time { return tm }
	t.Cleanup(func() { nowHook = nil })
}

func occShelves(f rowsFrame) (ids []string) {
	for _, s := range f.Shelves {
		if strings.HasPrefix(s.ID, "occ-") {
			ids = append(ids, s.ID)
		}
	}
	return
}

func shelfIndex(f rowsFrame, id string) int {
	for i, s := range f.Shelves {
		if s.ID == id {
			return i
		}
	}
	return -1
}

func TestDiwaliWeekPage(t *testing.T) {
	a := occTestApp(t, "2026-11-06T21:30")
	f := a.rowsFrame()
	i := shelfIndex(f, "occ-diwali")
	if i < 0 || i > 2 {
		t.Fatalf("occ-diwali at %d, want right after the first rows: %v", i, occShelves(f))
	}
	sh := f.Shelves[i]
	if len(sh.Items) < 8 || sh.Title != "Diwali week" || sh.Why != "Diwali week" || sh.Line != "Big, bright and for the whole house." {
		t.Errorf("shelf: %d items, title %q why %q line %q", len(sh.Items), sh.Title, sh.Why, sh.Line)
	}
	for _, c := range sh.Items {
		if c.Occ != "diwali" || c.Why != "Diwali week" || c.Line == "" || c.Img == "" {
			t.Fatalf("card %+v", c)
		}
	}
	if n := len(occShelves(f)); n > 2 {
		t.Errorf("%d themed shelves, at most 2", n)
	}
	var kick *heroFrame
	for _, h := range f.Hero["all"] {
		if h.Kick != "" {
			kick = h
			break
		}
	}
	if kick == nil || kick.Kick != "DIWALI WEEK" || kick.Occ != "diwali" || kick.Why != "Big, bright and for the whole house." || kick.K != "pick" {
		t.Fatalf("occasion slide: %+v", kick)
	}
	if f.Hero["all"][0] != kick {
		t.Errorf("with nothing to continue the occasion slide is first")
	}
	n := 0
	for _, h := range f.Hero["all"] {
		if h.Occ != "" {
			n++
		}
	}
	if n != 1 {
		t.Errorf("%d occasion slides, want 1", n)
	}
	// movie mode gets a film
	if h := f.Hero["movie"][0]; h.Kind != "movie" || h.Kick != "DIWALI WEEK" {
		t.Errorf("movie hero %+v", h)
	}
	// the titles on the Diwali shelf appear once on the page
	seen := map[string]int{}
	for _, s := range f.Shelves {
		for _, c := range s.Items {
			seen[c.Key]++
		}
	}
	for k, c := range seen {
		if c > 1 {
			t.Errorf("%s appears %d times", k, c)
		}
	}
}

func TestToday4Nov2026(t *testing.T) {
	a := occTestApp(t, "2026-11-04T21:30") // Wednesday evening, four days before Diwali
	f := a.rowsFrame()
	if shelfIndex(f, "occ-diwali") < 0 {
		t.Fatalf("no Diwali shelf on 4 Nov: %v", occShelves(f))
	}
	if h := f.Hero["all"][0]; h.Kick != "DIWALI WEEK" {
		t.Errorf("hero %+v", h)
	}
}

func TestQuietPageOutsideEvents(t *testing.T) {
	a := occTestApp(t, "2027-02-10T21:30")
	f := a.rowsFrame()
	if ids := occShelves(f); len(ids) != 0 {
		t.Errorf("themed shelves on a plain evening: %v", ids)
	}
	for _, h := range f.Hero["all"] {
		if h.Kick != "" || h.Occ != "" {
			t.Errorf("occasion slide on a plain evening: %+v", h)
		}
	}
}

func TestLateTonightShelf(t *testing.T) {
	a := occTestApp(t, "2027-02-10T00:30")
	f := a.rowsFrame()
	i, fy := shelfIndex(f, "occ-late-night"), shelfIndex(f, "fy")
	if i < 0 || fy < 0 || i <= fy {
		t.Fatalf("late-night at %d, for you at %d: %v", i, fy, occShelves(f))
	}
	for _, c := range f.Shelves[i].Items {
		if c.Kind != "tv" {
			t.Errorf("late tonight offers %s %q (no runtimes known: series only)", c.Kind, c.Title)
		}
	}
	if len(f.Shelves[i].Items) < 4 {
		t.Error("too few")
	}
}

func TestChristmasThenGone(t *testing.T) {
	a := occTestApp(t, "2026-12-20T21:30")
	if shelfIndex(a.rowsFrame(), "occ-christmas") < 0 {
		t.Error("no Christmas week shelf on 20 Dec")
	}
	setNow(t, "2026-12-28T21:30")
	if shelfIndex(a.rowsFrame(), "occ-christmas") >= 0 {
		t.Error("Christmas still there on 28 Dec")
	}
}

func TestLeanIsAtMostFifteenPercent(t *testing.T) {
	a := occTestApp(t, "2026-11-08T21:30") // peak
	it := a.ld.data.Occasions["diwali"][0]
	other := tmdb.Item{ID: 1, Kind: "movie", Title: "Other", Vote: 7, Votes: 1000, Service: "prime"}
	base := tmdb.Score(it) * taste.Boost(a.ld.taste.Affinity(tasteOf(it, ""))) * taste.Jitter(itemKey(it), a.now(), 0.06) // the daily shuffle is not part of the lean
	_ = a.rowsFrame() // sets the lean
	got := a.personal(it, "")
	if r := got / base; r < 1.1499 || r > 1.1501 {
		t.Errorf("lean at peak = %.4f, want 1.15", r)
	}
	if a.leanOf(other) != 1 {
		t.Error("a title outside the pool must not lean")
	}
	setNow(t, "2027-02-10T21:30")
	_ = a.rowsFrame()
	if a.leanOf(it) != 1 {
		t.Error("lean must end with the occasion")
	}
}

func TestIgnoredOccasionGoesQuiet(t *testing.T) {
	a := occTestApp(t, "2026-11-07T21:30")
	for d := 1; d <= 6; d++ {
		a.ld.occ.learned.Shown("diwali", time.Date(2026, 11, d, 20, 0, 0, 0, time.Local))
	}
	f := a.rowsFrame()
	i := shelfIndex(f, "occ-diwali")
	if i < len(f.Shelves)-1 || i < 5 {
		t.Errorf("a quiet shelf belongs after the plain rows: index %d of %d", i, len(f.Shelves))
	}
	for _, h := range f.Hero["all"] {
		if h.Occ != "" {
			t.Error("a quiet node must not take a hero slide")
		}
	}
	a.ld.occ.learned.Note("diwali", "opened") // one open wakes it
	f = a.rowsFrame()
	if shelfIndex(f, "occ-diwali") > 2 || f.Hero["all"][0].Occ != "diwali" {
		t.Error("an open should wake the node")
	}
	// opening a card from the shelf is that open
	a2 := occTestApp(t, "2026-11-07T21:30")
	a2.rowsFrame()
	key := a2.ld.data.Occasions["diwali"][0].ID
	_ = key
	var k string
	for _, c := range a2.rowsFrame().Shelves[shelfIndex(a2.rowsFrame(), "occ-diwali")].Items {
		k = c.Key
		break
	}
	a2.occNoteOpen(k)
	if st := a2.ld.occ.learned.Quiet("diwali"); st {
		t.Error("quiet after an open")
	}
}

func TestUpNextHeroBeatsFestival(t *testing.T) {
	a := occTestApp(t, "2026-11-06T21:30")
	eps.mu.Lock()
	old, oldLoaded := eps.m, eps.loaded
	eps.m, eps.loaded = map[string]epMark{"demoseries|1|3": {Svc: "prime", Pos: 1450, Dur: 1500, At: time.Now().Unix()}}, true
	eps.mu.Unlock()
	t.Cleanup(func() { eps.mu.Lock(); eps.m, eps.loaded = old, oldLoaded; eps.mu.Unlock() })
	var f rowsFrame
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		f = a.rowsFrame() // the first call starts the lookup, a later one has the answer
		if len(f.Hero["all"]) > 0 && f.Hero["all"][0].K == "next" {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	h := f.Hero["all"][0]
	if h.K != "next" || h.Kick != "UP NEXT" || h.Se != 1 || h.Ep != 4 || h.Service != "prime" || !strings.HasPrefix(h.Sub, "S1 E4") || h.Key == "" {
		t.Fatalf("up next: %+v", h)
	}
	if f.Hero["all"][1].Occ != "diwali" {
		t.Errorf("the festival slide is second: %+v", f.Hero["all"][1])
	}
	if len(f.Hero["movie"]) > 0 && f.Hero["movie"][0].K == "next" {
		t.Error("a series is not a movie-mode slide")
	}
	if f.Hero["tv"][0].K != "next" {
		t.Error("tv mode starts with up next")
	}
	// OK on it must be openable: the key is a known item
	if _, ok := a.ld.byKey[h.Key]; !ok {
		t.Error("up-next title is not openable")
	}
	// half-way through the next episode: no longer "up next"
	eps.mu.Lock()
	eps.m["demoseries|1|4"] = epMark{Svc: "prime", Pos: 300, Dur: 1500, At: time.Now().Unix() + 5}
	eps.mu.Unlock()
	for _, h := range a.rowsFrame().Hero["all"] {
		if h.K == "next" {
			t.Error("up next must go once the next episode is under way")
		}
	}
}

// the TMDB budget: one refresh never goes over 179 calls with the rows' calls counted.
func TestOccFetchStaysInBudget(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		switch {
		case strings.HasPrefix(r.URL.Path, "/discover/"):
			n := int(calls.Load())
			w.Write([]byte(`{"results":[{"id":` + strconv.Itoa(1000+n) + `,"title":"Hindi Family","backdrop_path":"/a.jpg","vote_count":300,"vote_average":7.5,"original_language":"hi"},{"id":88,"title":"Two","backdrop_path":"/b.jpg","vote_count":900,"vote_average":7}]}`))
		case r.URL.Path == "/search/keyword":
			w.Write([]byte(`{"results":[{"id":5,"name":"diwali"}]}`))
		case r.URL.Path == "/search/multi":
			w.Write([]byte(`{"results":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	c := tmdb.NewWithBase(srv.URL, "T")
	a := occTestApp(t, "2026-11-04T21:30")
	for _, u := range [][2]int{{140, 22}, {159, 0}, {159, 0}, {0, 22}, {0, 0}} {
		used, reserve := u[0], u[1]
		calls.Store(0)
		out := a.occFetch(c, used, reserve)
		if left := max(0, occCallCap-used-reserve); int(calls.Load()) > left {
			t.Fatalf("used %d reserve %d: %d occasion calls, budget %d", used, reserve, calls.Load(), left)
		}
		if used == 0 && reserve == 0 && len(out["diwali"]) == 0 {
			t.Error("a full budget should leave a Diwali pool")
		}
	}
	// everything cached: a settled refresh asks for nothing
	calls.Store(0)
	a.occFetch(c, 159, 22)
	if calls.Load() != 0 {
		t.Errorf("settled refresh made %d calls", calls.Load())
	}
}

func TestOnlyUsedDaysCountAsShown(t *testing.T) {
	a := occTestApp(t, "2026-11-07T21:30")
	for i := 0; i < 5; i++ { // rebuilds by the ticker or the desk, no launcher in use
		a.rowsFrame()
	}
	if n := a.ld.occ.learned.Days("diwali"); n != 0 {
		t.Fatalf("%d days counted with nobody at the launcher", n)
	}
	a.occTouch() // he moved on the page
	a.rowsFrame()
	a.rowsFrame()
	if n := a.ld.occ.learned.Days("diwali"); n != 1 {
		t.Errorf("shown days = %d, want 1 (once per day)", n)
	}
}

func TestContinueSameShowYieldsToUpNext(t *testing.T) {
	a := occTestApp(t, "2026-11-06T21:30")
	now := time.Now()
	a.ld.hist.Note(history.Entry{Service: "prime", URL: "https://www.primevideo.com/detail/x", Title: "Demo Series", Show: "Demo Series", Season: 1, Episode: 3, Group: "prime|demoseries", Pos: 1400, Dur: 1500, At: now.UnixMilli()})
	eps.mu.Lock()
	old, oldLoaded := eps.m, eps.loaded
	eps.m, eps.loaded = map[string]epMark{"demoseries|1|3": {Svc: "prime", Pos: 1400, Dur: 1500, At: now.Unix()}}, true
	eps.mu.Unlock()
	t.Cleanup(func() { eps.mu.Lock(); eps.m, eps.loaded = old, oldLoaded; eps.mu.Unlock() })
	var f rowsFrame
	for end := time.Now().Add(3 * time.Second); time.Now().Before(end); time.Sleep(20 * time.Millisecond) {
		f = a.rowsFrame()
		if f.Hero["all"][0].K == "next" {
			break
		}
	}
	if f.Hero["all"][0].K != "next" {
		t.Fatalf("first slide: %+v", f.Hero["all"][0])
	}
	for _, h := range f.Hero["all"] {
		if h.K == "cont" {
			t.Error("a Resume slide for the episode he just finished must not come before Up next")
		}
	}
}
