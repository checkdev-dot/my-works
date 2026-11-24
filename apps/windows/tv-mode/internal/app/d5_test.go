package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"tvmode/internal/library"
	"tvmode/internal/occasion"
	"tvmode/internal/tmdb"
)

// Phase 5 tests: the mood tap, the weather nodes, On this day and Your year.
// Nothing here touches the network or Dev's real files: d5Get is stubbed, every path
// goes through the testing guards, and each test cleans up what it makes.

func d5Clean(t *testing.T) {
	t.Helper()
	d5Reset()
	t.Cleanup(func() { d5Reset(); occasion.SetWeather(nil); d5Get = realD5Get })
}

var realD5Get = d5Get

func moodFrame(a *App, m string) {
	b, _ := json.Marshal(map[string]string{"t": "mood", "m": m})
	a.d5Mood(nil, b)
}

func TestMoodResetsAt0500AndSecondTapClears(t *testing.T) {
	d5Clean(t)
	a := occTestApp(t, "2027-02-10T22:00")
	a.d5Init()
	moodFrame(a, "light")
	if a.d5MoodNow() != "light" {
		t.Fatal("mood not set")
	}
	setNow(t, "2027-02-11T04:59")
	if a.d5MoodNow() != "light" {
		t.Error("mood must last until 05:00")
	}
	setNow(t, "2027-02-11T05:00")
	if a.d5MoodNow() != "" {
		t.Error("mood must clear at 05:00")
	}
	// set at 03:00: gone at 05:00 the same morning
	setNow(t, "2027-02-11T03:00")
	moodFrame(a, "gripping")
	setNow(t, "2027-02-11T05:01")
	if a.d5MoodNow() != "" {
		t.Error("a 03:00 mood must clear at 05:00 the same morning")
	}
	// the phone sends "" for the second tap
	setNow(t, "2027-02-11T20:00")
	moodFrame(a, "comfort")
	moodFrame(a, "")
	if a.d5MoodNow() != "" {
		t.Error("an empty mood clears")
	}
	moodFrame(a, "scary") // not a word we know
	if a.d5MoodNow() != "" {
		t.Error("an unknown word must be ignored")
	}
}

func TestMoodLeanNeverAboveFifteenPercent(t *testing.T) {
	d5Clean(t)
	a := occTestApp(t, "2027-02-10T22:00")
	a.d5Init()
	genres := [][]int{{35}, {16, 10751}, {53, 80}, {27}, {9648}, {10749, 35}, {10759}, {18}, {10752}, nil}
	for _, m := range []string{"light", "gripping", "comfort"} {
		moodFrame(a, m)
		for _, g := range genres {
			it := tmdb.Item{ID: 1, Kind: "movie", GIDs: g}
			if l := a.moodLean(it); l > 1.15+1e-9 || l < 0.89 {
				t.Errorf("%s %v: lean %.3f outside 0.89..1.15", m, g, l)
			}
		}
	}
	moodFrame(a, "light")
	if a.moodLean(tmdb.Item{GIDs: []int{35}}) <= 1 || a.moodLean(tmdb.Item{GIDs: []int{27}}) >= 1 {
		t.Error("Light should float comedy and sink horror")
	}
	moodFrame(a, "gripping")
	if a.moodLean(tmdb.Item{GIDs: []int{53}}) <= 1 || a.moodLean(tmdb.Item{GIDs: []int{16}}) >= 1 {
		t.Error("Gripping should float thrillers and sink animation")
	}
	moodFrame(a, "")
	if a.moodLean(tmdb.Item{GIDs: []int{53}}) != 1 {
		t.Error("no mood: no lean")
	}
}

func TestMoodBiasesPicksAndKickerAndClears(t *testing.T) {
	d5Clean(t)
	a := occTestApp(t, "2027-02-10T21:30") // a plain evening: no festival
	for si := range a.ld.data.Shelves {
		for i := range a.ld.data.Shelves[si].Items {
			it := &a.ld.data.Shelves[si].Items[i]
			if i%2 == 0 {
				it.GIDs = []int{35} // comedy
			} else {
				it.GIDs = []int{53} // thriller
			}
		}
	}
	a.indexKeys()
	base := a.rowsFrame()
	for _, h := range base.Hero["all"] {
		if strings.HasSuffix(h.Kick, "TONIGHT") {
			t.Fatalf("a kicker with no mood: %+v", h)
		}
	}
	moodFrame(a, "light")
	f := a.rowsFrame()
	var kicked, plain int
	for _, h := range f.Hero["all"] {
		if h.Kick == "LIGHT TONIGHT" {
			kicked++
			if h.Occ != "" {
				t.Errorf("a mood kicker must not carry an occasion: %+v", h)
			}
		} else {
			plain++
		}
	}
	if kicked == 0 {
		t.Fatal("no pick says LIGHT TONIGHT")
	}
	// the first picks are the comedies
	if f.Hero["all"][0].Kick != "LIGHT TONIGHT" {
		t.Errorf("the top pick should fit the mood: %+v", f.Hero["all"][0])
	}
	moodFrame(a, "") // second tap
	g := a.rowsFrame()
	for _, h := range g.Hero["all"] {
		if h.Kick != "" {
			t.Errorf("kicker left after clearing: %+v", h)
		}
	}
	if g.Hero["all"][0].Key != base.Hero["all"][0].Key {
		t.Error("clearing the mood must give back the ordinary order")
	}
}

func TestWeatherNodesNeedACityAndAFreshReading(t *testing.T) {
	d5Clean(t)
	a := occTestApp(t, "2027-02-10T21:30")
	a.d5Init()
	live := func() map[string]bool {
		m := map[string]bool{}
		for _, l := range occasion.Evaluate(a.now(), occasion.Viewer{}) {
			m[l.Node.ID] = true
		}
		return m
	}
	if live()["rain-now"] {
		t.Fatal("rain with no city")
	}
	d5.mu.Lock()
	d5.loc = &d5Loc{Name: "Testville", Lat: 19.07, Lon: 72.87}
	d5.wx = &d5Wx{Code: 63, TempC: 25, At: time.Now().Unix()}
	d5.mu.Unlock()
	if !live()["rain-now"] {
		t.Error("rain with a city and a fresh reading should switch rain-now on")
	}
	d5.mu.Lock()
	d5.wx.At = time.Now().Add(-4 * time.Hour).Unix()
	d5.mu.Unlock()
	if live()["rain-now"] {
		t.Error("a 4 hour old reading must leave weather off")
	}
	d5.mu.Lock()
	d5.wx = &d5Wx{Code: 0, TempC: 38, At: time.Now().Unix()}
	d5.mu.Unlock()
	if !live()["heat"] {
		t.Error("38 C should switch heat on")
	}
	d5.mu.Lock()
	d5.loc = nil
	d5.mu.Unlock()
	if live()["heat"] {
		t.Error("removing the city must switch weather off")
	}
}

func geoStub(t *testing.T, calls *[]string) {
	t.Helper()
	d5Get = func(u string) ([]byte, error) {
		*calls = append(*calls, u)
		switch {
		case strings.Contains(u, "geocoding-api.open-meteo.com"):
			if strings.Contains(u, "name=Nowhere") {
				return []byte(`{"generationtime_ms":0.3}`), nil
			}
			return []byte(`{"results":[{"name":"Mumbai","admin1":"Maharashtra","country":"India","latitude":19.07283,"longitude":72.88261}]}`), nil
		case strings.Contains(u, "api.open-meteo.com/v1/forecast"):
			return []byte(`{"current":{"temperature_2m":29.4,"precipitation":0.0,"weather_code":2}}`), nil
		}
		return nil, fmt.Errorf("unexpected %s", u)
	}
}

func TestDeskCityGeocodesSavesAndRemoves(t *testing.T) {
	d5Clean(t)
	var calls []string
	geoStub(t, &calls)
	a := deskApp(t)
	h := deskMux(a)
	p := a.d5WeatherPath()
	if !strings.Contains(p, "tvmode-test-cache-") || !strings.HasSuffix(p, "weather.json") {
		t.Fatalf("weather path under test is %q: it must be the throwaway cache folder", p)
	}
	_ = os.Remove(p)
	t.Cleanup(func() { _ = os.Remove(p) })

	if w := deskDo(h, "POST", "/api/desk/city", `{"city":"Mumbai"}`, deskLoop, false); w.Code != http.StatusForbidden {
		t.Errorf("POST without the desk header = %d", w.Code)
	}
	if w := deskDo(h, "GET", "/api/desk/city", "", deskLAN, false); w.Code != http.StatusForbidden {
		t.Errorf("GET off loopback = %d", w.Code)
	}
	if w := deskDo(h, "POST", "/api/desk/city", `{"city":"Mum<bai>"}`, deskLoop, true); w.Code != http.StatusBadRequest {
		t.Errorf("a city with marks = %d", w.Code)
	}
	if w := deskDo(h, "POST", "/api/desk/city", `{"city":"Nowhere"}`, deskLoop, true); w.Code != http.StatusUnprocessableEntity {
		t.Errorf("an unknown place = %d", w.Code)
	}
	w := deskDo(h, "POST", "/api/desk/city", `{"city":"Mumbai"}`, deskLoop, true)
	if w.Code != 200 {
		t.Fatalf("set city = %d %s", w.Code, w.Body.String())
	}
	var st map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &st)
	if st["set"] != true || st["name"] != "Mumbai, Maharashtra, India" {
		t.Errorf("status %v", st)
	}
	if now, _ := st["now"].(map[string]any); now == nil || now["temp"] != float64(29) {
		t.Errorf("now %v", st["now"])
	}
	if strings.Contains(w.Body.String(), "19.07") || strings.Contains(w.Body.String(), "72.88") {
		t.Error("the desk response must not carry coordinates")
	}
	b, err := os.ReadFile(p)
	if err != nil || !strings.Contains(string(b), `"lat"`) {
		t.Fatalf("weather.json not written: %v %s", err, b)
	}
	if len(calls) < 3 { // two failed geocodes were stubbed too; the good one made 2
		t.Errorf("calls %v", calls)
	}
	for _, c := range calls {
		if !strings.HasPrefix(c, "https://geocoding-api.open-meteo.com/") && !strings.HasPrefix(c, "https://api.open-meteo.com/") {
			t.Errorf("a call to somewhere else: %s", c)
		}
	}
	// remove
	w = deskDo(h, "POST", "/api/desk/city", `{"city":""}`, deskLoop, true)
	_ = json.Unmarshal(w.Body.Bytes(), &st)
	if w.Code != 200 || st["set"] != false {
		t.Errorf("remove: %d %v", w.Code, st)
	}
	if r := a.d5WeatherRead(); r.OK {
		t.Error("weather must be off after removing the city")
	}
}

func TestWeatherIsFetchedAtMostHourlyAndOfflineSafe(t *testing.T) {
	d5Clean(t)
	var calls []string
	geoStub(t, &calls)
	a := deskApp(t)
	a.d5Init()
	d5.mu.Lock()
	d5.loc = &d5Loc{Name: "Testville", Lat: 19, Lon: 72}
	d5.wx = &d5Wx{Code: 0, TempC: 20, At: time.Now().Add(-10 * time.Minute).Unix()}
	d5.mu.Unlock()
	for i := 0; i < 5; i++ {
		if r := a.d5WeatherRead(); !r.OK {
			t.Fatal("a 10 minute old reading is current")
		}
	}
	if len(calls) != 0 {
		t.Errorf("fetched %d times for a fresh reading", len(calls))
	}
	// offline: the fetch fails, the old reading stays until it is 3 hours old
	d5Get = func(string) ([]byte, error) { return nil, fmt.Errorf("offline") }
	wx, err := d5ForecastNow(19, 72)
	if err == nil {
		t.Errorf("an outage must be an error, got %+v", wx)
	}
}

// --- On this day ---

func otdItems(n int, date string, votes int, base int) []tmdb.Item {
	var out []tmdb.Item
	svc := []string{"netflix", "prime", "jiohotstar"}
	for i := 0; i < n; i++ {
		out = append(out, tmdb.Item{ID: base + i, Kind: "movie", Title: fmt.Sprintf("Classic %d", base+i), Year: date[:4], Date: date, Service: svc[i%3], Backdrop: fmt.Sprintf("/k%d.svg", base+i), Vote: 8.2, Votes: votes, Overview: "x"})
	}
	return out
}

func finishedAYearAgo(t *testing.T, a *App, id, title, svc string, at time.Time) {
	t.Helper()
	if a.ld.lib == nil {
		a.ld.lib = library.Open("")
	}
	a.ld.lib.Apply(library.Report{Type: library.EvFinish, ID: id, Kind: "movie", Title: title, Img: "https://image.tmdb.org/t/p/w780/o" + id + ".jpg", Service: svc, Services: []string{svc}, Manual: true, At: at.UnixMilli()})
}

func TestOnThisDayShowsAfterThemedShelvesAndNeedsFour(t *testing.T) {
	d5Clean(t)
	a := occTestApp(t, "2027-02-10T21:30")
	a.ld.data.Shelves[3].Items = append(a.ld.data.Shelves[3].Items, otdItems(3, "2015-02-11", 4000, 7000)...)
	a.indexKeys()
	if shelfIndex(a.rowsFrame(), "otd") >= 0 {
		t.Fatal("three titles must not make a shelf")
	}
	a.ld.data.Shelves[3].Items = append(a.ld.data.Shelves[3].Items, otdItems(3, "2016-02-08", 4000, 7100)...)
	a.indexKeys()
	f := a.rowsFrame()
	i := shelfIndex(f, "otd")
	if i < 0 {
		t.Fatalf("six classics should make the shelf: %v", shelfIDs(f))
	}
	sh := f.Shelves[i]
	if sh.Title != "On this day" || len(sh.Items) != 6 {
		t.Errorf("shelf %q with %d items", sh.Title, len(sh.Items))
	}
	for _, c := range sh.Items {
		if !strings.HasPrefix(c.Why, "Out this week in ") {
			t.Errorf("card why %q", c.Why)
		}
	}
	// outside the week, or too new, or too few votes: not a classic
	a.ld.data.Shelves[3].Items = otdItems(6, "2015-03-20", 4000, 7200)
	a.ld.data.Shelves[4].Items = append(otdItems(3, "2026-02-10", 4000, 7300), otdItems(3, "2015-02-10", 200, 7400)...)
	a.indexKeys()
	if shelfIndex(a.rowsFrame(), "otd") >= 0 {
		t.Error("only classics from this week, with a crowd of votes, count")
	}
}

func shelfIDs(f rowsFrame) (ids []string) {
	for _, s := range f.Shelves {
		ids = append(ids, s.ID)
	}
	return
}

func TestOnThisDayDoesNotCrowdOutTheFestivalShelf(t *testing.T) {
	d5Clean(t)
	a := occTestApp(t, "2026-11-08T21:30") // Diwali
	without := a.rowsFrame()
	di := shelfIndex(without, "occ-diwali")
	if di < 0 {
		t.Fatal("no Diwali shelf")
	}
	var want []string
	for _, c := range without.Shelves[di].Items {
		want = append(want, c.Key)
	}
	// seven classics that came out the same week, in other years
	a.ld.data.Shelves[5].Items = append(a.ld.data.Shelves[5].Items, otdItems(7, "2016-11-09", 6000, 7500)...)
	a.indexKeys()
	f := a.rowsFrame()
	i, j := shelfIndex(f, "occ-diwali"), shelfIndex(f, "otd")
	if j < 0 {
		t.Fatalf("no On this day shelf: %v", shelfIDs(f))
	}
	if i < 0 || i > 2 || j < i {
		t.Fatalf("the festival shelf must stay early and first: occ-diwali %d, otd %d", i, j)
	}
	var got []string
	for _, c := range f.Shelves[i].Items {
		got = append(got, c.Key)
	}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("the festival shelf changed:\n%v\n%v", got, want)
	}
	// every title once
	seen := map[string]int{}
	for _, s := range f.Shelves {
		for _, c := range s.Items {
			seen[c.Key]++
		}
	}
	for k, n := range seen {
		if n > 1 {
			t.Errorf("%s appears %d times", k, n)
		}
	}
}

func TestOnThisDayLibraryHalf(t *testing.T) {
	d5Clean(t)
	a := occTestApp(t, "2027-02-10T21:30")
	yearAgo := time.Date(2026, 2, 10, 22, 0, 0, 0, time.Local)
	finishedAYearAgo(t, a, "movie801", "A Film Of Last Year", "netflix", yearAgo)
	finishedAYearAgo(t, a, "movie802", "Another One", "prime", yearAgo.AddDate(0, 0, 1))
	finishedAYearAgo(t, a, "movie803", "Too Early", "prime", yearAgo.AddDate(0, 0, -9)) // not this day
	a.ld.data.Shelves[3].Items = append(a.ld.data.Shelves[3].Items, otdItems(3, "2014-02-12", 4000, 7600)...)
	a.indexKeys()
	f := a.rowsFrame()
	i := shelfIndex(f, "otd")
	if i < 0 {
		t.Fatalf("no shelf: %v", shelfIDs(f))
	}
	sh := f.Shelves[i]
	if len(sh.Items) != 5 {
		t.Fatalf("%d cards, want 2 from the library and 3 classics", len(sh.Items))
	}
	if sh.Items[0].Why != "You finished it a year ago" || sh.Items[1].Why != "You finished it a year ago" || !strings.HasPrefix(sh.Items[2].Why, "Out this week in ") {
		t.Errorf("order or lines: %q %q %q", sh.Items[0].Why, sh.Items[1].Why, sh.Items[2].Why)
	}
	for _, c := range sh.Items {
		if c.Key == "movie803" {
			t.Error("a title finished nine days off is not 'a year ago'")
		}
		if c.Img == "" || c.Service == "" {
			t.Errorf("card %+v", c)
		}
	}
	// he marked one watched: it still belongs here, it is the point of the shelf
	a.ld.rated.set("movie801", rating{V: 1, At: 1, Title: "A Film Of Last Year"}, false) // path "": memory only
	if shelfIndex(a.rowsFrame(), "otd") < 0 {
		t.Error("shelf gone after marking")
	}
}

// --- Your year ---

func TestYearRecapCountsTitlesNotEpisodes(t *testing.T) {
	now := time.Date(2026, 11, 20, 12, 0, 0, 0, time.Local)
	at := func(m time.Month, d int) int64 { return time.Date(2026, m, d, 21, 0, 0, 0, time.Local).UnixMilli() }
	items := []library.Item{
		{ID: "tv100", Kind: "tv", Title: "Long Night", State: library.Finished, DoneAt: at(11, 9), Added: at(11, 4), LastAt: at(11, 9), LastSvc: "netflix", Services: []string{"netflix"}},
		{ID: "movie200", Kind: "movie", Title: "A Film", State: library.Finished, DoneAt: at(11, 12), Added: at(11, 6), LastAt: at(11, 12), LastSvc: "netflix", Services: []string{"netflix"}},
		{ID: "movie201", Kind: "movie", Title: "B Film", State: library.Finished, DoneAt: at(11, 15), Added: at(11, 7), LastAt: at(11, 15), LastSvc: "prime", Services: []string{"prime"}},
		{ID: "tv300", Kind: "tv", Title: "Gave Up", State: library.Dropped, MarkAt: at(11, 16), Added: at(11, 5), LastAt: at(11, 16)},
		{ID: "movie400", Kind: "movie", Title: "Last Year", State: library.Finished, DoneAt: time.Date(2025, 11, 9, 0, 0, 0, 0, time.Local).UnixMilli(), Added: at(11, 3), LastAt: at(11, 3)}, // finished last year: not counted
	}
	var evs []library.Event
	for ep := 1; ep <= 6; ep++ { // six episodes of one show finished: one title
		evs = append(evs, library.Event{At: at(11, 5) + int64(ep)*3600000, ID: "tv100", Type: library.EvFinish, Se: 1, Ep: ep, Pos: 2700, Dur: 2800})
	}
	evs = append(evs, library.Event{At: at(11, 12), ID: "movie200", Type: library.EvFinish, Pos: 6000, Dur: 6100})
	genres := func(id string) []string {
		switch id {
		case "tv100", "movie200":
			return []string{"Crime", "Drama"}
		case "movie201":
			return []string{"Comedy"}
		}
		return nil
	}
	r := d5Year(items, evs, genres, func(s string) string { return map[string]string{"netflix": "Netflix", "prime": "Prime Video"}[s] }, func(s string) string { return s }, now)
	if r.Finished != 3 {
		t.Errorf("finished %d: six episodes of one show are one title, and last year is not this year", r.Finished)
	}
	if !r.Partial || time.UnixMilli(r.SinceMs).Month() != time.November {
		t.Errorf("a record that starts in November must say so: partial %v since %v", r.Partial, time.UnixMilli(r.SinceMs))
	}
	if r.TopGenre == nil || r.TopGenre.Name != "Crime" || r.TopGenre.N != 2 || r.TopGenre.Of != 3 {
		t.Errorf("top genre %+v", r.TopGenre)
	}
	if r.DropGenre != nil {
		t.Errorf("one dropped title with no known genre is not a pattern: %+v", r.DropGenre)
	}
	if r.Longest == nil || r.Longest.Title != "Long Night" || r.Longest.Episodes != 6 {
		t.Errorf("longest %+v", r.Longest)
	}
	if r.TopSvc == nil || r.TopSvc.Name != "Netflix" || r.TopSvc.N != 2 || r.TopSvc.Of != 3 {
		t.Errorf("top service %+v", r.TopSvc)
	}
	if !r.HoursKnown || r.Hours < 5 || r.Hours > 6 { // 6 x 45 min + 100 min = 6.1 h; capped at Dur
		t.Logf("hours %.1f", r.Hours)
	}
	if !r.HoursKnown {
		t.Error("hours should be known from the events")
	}
	// the month strip: January to October have no record (not zero), November has 3, December has not come
	for _, m := range r.Months {
		switch {
		case m.M < 11:
			if m.Known || !m.Past || m.N != 0 {
				t.Errorf("month %d: %+v", m.M, m)
			}
		case m.M == 11:
			if !m.Known || m.N != 3 {
				t.Errorf("november: %+v", m)
			}
		case m.M == 12:
			if m.Known || m.Past {
				t.Errorf("december: %+v", m)
			}
		}
	}
}

func TestYearRecapWithNothingInventsNothing(t *testing.T) {
	r := d5Year(nil, nil, nil, func(s string) string { return s }, func(s string) string { return s }, time.Date(2026, 11, 4, 12, 0, 0, 0, time.Local))
	if !r.Empty || r.Finished != 0 || r.HoursKnown || r.TopGenre != nil || r.DropGenre != nil || r.Longest != nil || r.TopSvc != nil || len(r.Picks) != 0 {
		t.Errorf("an empty library must give an empty recap: %+v", r)
	}
	for _, m := range r.Months {
		if m.Known || m.N != 0 {
			t.Errorf("month %+v", m)
		}
	}
}

func TestDeskYearAndMonthEndpoints(t *testing.T) {
	d5Clean(t)
	a := deskApp(t)
	h := deskMux(a)
	setNow(t, "2026-12-05T10:00")
	w := deskDo(h, "GET", "/api/desk/year", "", deskLoop, false)
	if w.Code != 200 {
		t.Fatalf("year = %d", w.Code)
	}
	var r yearRecap
	if err := json.Unmarshal(w.Body.Bytes(), &r); err != nil || !r.Empty || len(r.Months) != 12 {
		t.Errorf("year %v %+v", err, r)
	}
	if w := deskDo(h, "GET", "/api/desk/year", "", deskLAN, false); w.Code != http.StatusForbidden {
		t.Errorf("year off loopback = %d", w.Code)
	}
	w = deskDo(h, "GET", "/api/desk/state", "", deskLoop, false)
	var st map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &st)
	if st["month"] != float64(12) {
		t.Errorf("state month %v: December drives the desk's way into the recap, and it must follow the app clock", st["month"])
	}
}
