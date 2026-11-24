package app

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
	"tvmode/internal/occasion"
	"tvmode/internal/taste"

	"tvmode/internal/history"
	"tvmode/internal/library"
	"tvmode/internal/services"
	"tvmode/internal/tmdb"
)

// Launcher data: Continue watching (from the pages seen playing), a hero
// banner and many recommendation shelves (TMDB, India, the user's services).
// The launcher page only ever receives finished rows with /img/<hash>
// addresses; it never sees credentials, TMDB addresses or anything it could
// use to ask for an arbitrary URL.

type cardItem struct {
	Key     string  `json:"key,omitempty"`
	Title   string  `json:"title"`
	Service string  `json:"service"`
	Kind    string  `json:"kind"`
	Img     string  `json:"img"`
	Ord     float64 `json:"ord"` // higher first: vote score, or the date in New releases
	Why     string  `json:"why,omitempty"`
	Year    string  `json:"year,omitempty"`
	Vote    float64 `json:"vote,omitempty"`
	Votes   int     `json:"votes,omitempty"`
	Pct     float64 `json:"pct,omitempty"`
	I       int     `json:"i,omitempty"` // Continue watching: index into the history list
	Line    string  `json:"line,omitempty"`
	Over    string  `json:"over,omitempty"` // search results: a line of overview
	Occ     string  `json:"occ,omitempty"`  // themed shelf: the occasion node the card sits under (Line then holds its why line)
	Lib     string  `json:"lib,omitempty"`  // Saved row: the library id OK opens ({"t":"openitem","k":"lib","key":<lib>})
}

// heroFrame is the one static banner of a mode: what you were watching (cont), the next episode (next), or a pick.
type heroFrame struct {
	K       string   `json:"k"` // cont | next | pick
	Service string   `json:"service"`
	Title   string   `json:"title"`
	Sub     string   `json:"sub,omitempty"`
	Over    string   `json:"over,omitempty"`
	Img     string   `json:"img"`
	Key     string   `json:"key,omitempty"`
	Kind    string   `json:"kind,omitempty"`
	Year    string   `json:"year,omitempty"`
	Genres  []string `json:"genres,omitempty"`
	Vote    float64  `json:"vote,omitempty"`
	Votes   int      `json:"votes,omitempty"`
	Why     string   `json:"why,omitempty"`
	Pct     float64  `json:"pct,omitempty"`
	Left    int      `json:"left,omitempty"`
	Stopped string   `json:"stopped,omitempty"`
	I       int      `json:"i,omitempty"`
	Thumb   string   `json:"thumb,omitempty"`
	Kick    string   `json:"kick,omitempty"` // kicker word: "DIWALI WEEK", "UP NEXT" (else the page's own words)
	Occ     string   `json:"occ,omitempty"`  // occasion node id of an occasion slide
	Se      int      `json:"se,omitempty"`   // up next: the episode OK plays
	Ep      int      `json:"ep,omitempty"`
}

type shelfFrame struct {
	ID     string     `json:"id"`
	Title  string     `json:"title"`
	Titles []string   `json:"titles"` // all, movies, tv
	Why    string     `json:"why"`
	Items  []cardItem `json:"items"`
	Line   string     `json:"line,omitempty"` // themed shelf: the occasion's one line
}

type rowsFrame struct {
	T       string                  `json:"t"`
	Hero    map[string][]*heroFrame `json:"hero"` // all, movie, tv
	Cont    []cardItem              `json:"cont"`
	Saved   []cardItem              `json:"saved"` // the library's Saved row (empty with fewer than two)
	Shelves []shelfFrame            `json:"shelves"`
}

type shelf struct {
	ID    string      `json:"id"`
	Title string      `json:"title"`
	Items []tmdb.Item `json:"items"`
}

type recData struct {
	Shelves   []shelf                `json:"shelves"`
	Occasions map[string][]tmdb.Item `json:"occasions,omitempty"` // candidates per occasion pool, so a cold start still has the shelf
}

// openedTitle follows the last recommendation Dev opened: the history entries of
// its service in the next hours say whether he watched it.
type openedTitle struct {
	it      tmdb.Item
	at      time.Time
	maxPct  float64
	settled bool // Finished or Abandon already learned
}

// resumeHold keeps the saved place of a title while TV Mode seeks it there: the
// site starting from zero must not overwrite where he stopped.
type resumeHold struct {
	group string
	pos   int
	until time.Time
}

type launcherData struct {
	mu        sync.Mutex
	resumeGen atomic.Int64      // each open bumps it: an older resume stops
	resuming  resumeHold        // while a resume is under way, an early position is not his place
	links     map[string]string // link book: service|title[|S|E] -> the provider page (links.json)
	goGen     atomic.Int64      // each direct open bumps it: an older one stops
	lastNav   atomic.Int64      // unix ms of the last Back, Home or service open from a phone (volume, arrows and the like do not count)
	lastOK    atomic.Int64      // unix ms of the last refreshRec that replaced the rows
	lastTry   atomic.Int64      // unix ms of the last refreshRec started
	hist      *history.Store
	rated     *ratedStore // Watched marks (liked or not): out of the rows, into the taste
	tm        *tmdb.Client
	data      recData
	because   *shelf
	becFor    string
	byKey     map[string]tmdb.Item
	extra     map[string]tmdb.Item // titles endless rows fetched: indexKeys keeps them openable
	taste     *taste.Profile
	opened    *openedTitle      // the last recommendation opened, to learn how much of it was watched
	imgSrc    map[string]string // hash -> source URL, only ones Go registered
	trail     map[string]string // key -> youtube key
	details   map[string]tmdb.Details
	building  bool
	occ       *occState      // the occasion engine's state (nil in tests that do not need it)
	lib       *library.Store // what he watched, saved and dropped (nil in tests that do not need it; every hook checks)
	libr      *libResolver
}

func (a *App) testRows() bool { return a.o.Test && os.Getenv("TVMODE_TEST_ROWS") != "" }

var ldInitMu sync.Mutex

// initLauncherData builds the launcher data once. The TV start and the desk (in standby)
// can both ask at the same moment; two stores would each rewrite links, taste and rated.
func (a *App) initLauncherData() {
	ldInitMu.Lock()
	defer ldInitMu.Unlock()
	if a.ld != nil {
		return
	}
	a.buildLauncherData()
}

func (a *App) buildLauncherData() {
	ld := &launcherData{hist: history.Open(history.DefaultPath()), imgSrc: map[string]string{}, trail: map[string]string{}, details: map[string]tmdb.Details{}, byKey: map[string]tmdb.Item{}, extra: map[string]tmdb.Item{}}
	tp := filepath.Join(filepath.Dir(a.recCachePath()), "taste.json")
	rp := filepath.Join(filepath.Dir(a.recCachePath()), "rated.json")
	if a.testRows() {
		tp = "" // smoke: never learn into (or read) Dev's profile
		rp = ""
	}
	ld.taste = taste.Open(tp)
	ld.rated = openRated(rp)
	ld.links = map[string]string{}
	lp := library.DefaultPath() // a temp path under go test
	if a.testRows() {
		lp = "" // smoke: never read or write Dev's library
	}
	ld.lib, ld.libr = library.Open(lp), &libResolver{}
	if b, err := os.ReadFile(a.linksPath()); err == nil {
		_ = json.Unmarshal(b, &ld.links)
	}
	if b, err := os.ReadFile(filepath.Join(filepath.Dir(a.recCachePath()), "details.json")); err == nil {
		_ = json.Unmarshal(b, &ld.details)
	}
	tmOK := false
	if a.testRows() {
		ld.data = cannedData()
	} else {
		if b, err := os.ReadFile(a.recCachePath()); err == nil {
			_ = json.Unmarshal(b, &ld.data)
		}
		if c, err := tmdb.Load(); err == nil {
			ld.tm, tmOK = c, true
		} else {
			log.Printf("launcher: %v (recommendations off)", err)
		}
	}
	a.ld = ld   // published only now: taste, rated, links, details, data, tmdb and library are all set
	a.initOcc() // needs a.ld; reads nothing the loads above set
	a.indexKeys()
	if tmOK {
		go a.refreshLoop()
		go a.seedTaste()
		go func() { // cards an older build saved without the episode's number or name
			for _, e := range a.ld.hist.List() {
				if !e.Opened && !epComplete(e) {
					x := e
					a.fillEp(&x)
				}
			}
		}()
	}
}

func cannedData() recData {
	var d recData
	svc := []string{"netflix", "prime", "jiohotstar"}
	ids := []string{"new", "top", "indian", "hindi", "korean", "anime", "thriller", "crime", "action", "comedy", "romance", "horror", "scifi", "docs", "family", "mystery", "drama", "popular"}
	for r, id := range ids {
		s := shelf{ID: id, Title: "Canned " + id}
		n := 8
		if id == "popular" {
			n = 30
		}
		for i := 1; i <= n; i++ {
			kind := "movie"
			if i%2 == 0 {
				kind = "tv"
			}
			ni := r*100 + i
			s.Items = append(s.Items, tmdb.Item{ID: ni, Kind: kind, Title: fmt.Sprintf("Title %d.%d", r+1, i), Year: "2025", Service: svc[i%3], Backdrop: "/c" + strconv.Itoa(ni) + ".svg", Pop: float64(100 - i), Vote: 8 - float64(i)/10, Votes: 5000 - i, Date: fmt.Sprintf("2025-%02d-01", 12-i), Overview: "A canned overview for the hero banner, one line of it.", Genres: []string{"Drama", "Crime"}})
		}
		d.Shelves = append(d.Shelves, s)
	}
	// themed candidates for the smoke page: Hindi family films for Diwali, a few Christmas films
	d.Occasions = map[string][]tmdb.Item{}
	for _, pool := range []struct{ id, name, lang string }{{"diwali", "Diwali Film", "hi"}, {"christmas", "Christmas Film", "en"}} {
		for i := 1; i <= 14; i++ {
			kind := "movie"
			if i%5 == 0 {
				kind = "tv"
			}
			ni := 9000 + len(d.Occasions[pool.id]) + i
			if pool.id == "christmas" {
				ni += 100
			}
			d.Occasions[pool.id] = append(d.Occasions[pool.id], tmdb.Item{ID: ni, Kind: kind, Title: fmt.Sprintf("%s %d", pool.name, i), Year: "2024", Service: svc[i%3], Backdrop: "/c" + strconv.Itoa(ni) + ".svg", Pop: float64(50 - i), Vote: 7.6 - float64(i)/20, Votes: 3000 - i*10, Date: "2024-11-01", Overview: "A canned overview for the occasion slide, one line of it.", Genres: []string{"Family", "Comedy"}, GIDs: []int{10751, 35}, Lang: pool.lang})
		}
	}
	return d
}

// testCacheDir: under `go test` every cache file (rows, links, taste, avail, episodes, details,
// occasions, keywords) goes to a throwaway folder, never Dev's real %LOCALAPPDATA%TVModeche.
var (
	testCacheOnce sync.Once
	testCacheBase string
)

func (a *App) recCachePath() string {
	if testing.Testing() {
		testCacheOnce.Do(func() { testCacheBase, _ = os.MkdirTemp("", "tvmode-test-cache-") })
		return filepath.Join(testCacheBase, "rows.json")
	}
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		h, _ := os.UserHomeDir()
		base = filepath.Join(h, "AppData", "Local")
	}
	return filepath.Join(base, "TVMode", "cache", "rows.json")
}

const (
	recMaxAge    = 6 * time.Hour    // rows older than this are asked for again
	recRetry     = 1 * time.Hour    // after an attempt that kept the old rows, wait this long (TMDB budget)
	recTickEvery = 15 * time.Minute // Go timers stop while Windows sleeps, so check often instead of waiting 6 h
)

// refreshDue says whether the rows should be fetched again: the last success is older
// than maxAge (or there is none) and the last attempt is older than retry.
func refreshDue(lastOK, lastTry, now time.Time, maxAge, retry time.Duration) bool {
	if !lastTry.IsZero() && now.Sub(lastTry) < retry {
		return false
	}
	return lastOK.IsZero() || now.Sub(lastOK) >= maxAge
}

// refreshIfDue runs refreshRec when refreshDue says so (refreshRec itself skips when one
// is already running). Also called when the TV starts from standby, after the PC slept.
func (a *App) refreshIfDue() {
	if a.ld == nil || a.ld.tm == nil {
		return
	}
	ms := func(v int64) time.Time {
		if v == 0 {
			return time.Time{}
		}
		return time.UnixMilli(v)
	}
	if refreshDue(ms(a.ld.lastOK.Load()), ms(a.ld.lastTry.Load()), time.Now(), recMaxAge, recRetry) {
		a.refreshRec()
	}
}

func (a *App) refreshLoop() {
	a.refreshRec()
	t := time.NewTicker(recTickEvery)
	defer t.Stop()
	for {
		select {
		case <-a.ctx.Done():
			return
		case <-t.C:
			a.refreshIfDue()
		}
	}
}

type variant struct{ movie, tv url.Values } // nil = skip that kind

type spec struct {
	id     string
	by     string // pop | date | score
	vs     []variant
	hidden bool // fetched for the hero pick only
}

func vals(kv ...string) url.Values {
	v := url.Values{}
	for i := 0; i+1 < len(kv); i += 2 {
		v.Set(kv[i], kv[i+1])
	}
	return v
}

// specs is the ten rows of the launcher (Continue watching and Because you
// watched come from history); each row may merge several queries.
func specs() []spec {
	today := nowTime()
	from := today.AddDate(0, 0, -120).Format("2006-01-02")
	to := today.Format("2006-01-02")
	g := func(m, t string) variant {
		var v variant
		if m != "" {
			v.movie = vals("with_genres", m, "vote_count.gte", "20")
		}
		if t != "" {
			v.tv = vals("with_genres", t, "vote_count.gte", "20")
		}
		return v
	}
	both := func(kv ...string) variant {
		kv = append(kv, "vote_count.gte", "20")
		return variant{vals(kv...), vals(kv...)}
	}
	return []spec{
		{id: "popular", by: "score", hidden: true, vs: []variant{{vals("vote_count.gte", "300"), vals("vote_count.gte", "200")}}},
		{id: "new", by: "date", vs: []variant{{
			vals("primary_release_date.gte", from, "primary_release_date.lte", to, "sort_by", "primary_release_date.desc", "vote_count.gte", "5"),
			vals("first_air_date.gte", from, "first_air_date.lte", to, "sort_by", "first_air_date.desc", "vote_count.gte", "3")}}},
		{id: "top", by: "score", vs: []variant{{vals("sort_by", "vote_average.desc", "vote_count.gte", "1500"), vals("sort_by", "vote_average.desc", "vote_count.gte", "500")}}},
		{id: "indian", by: "score", vs: []variant{both("with_origin_country", "IN"), both("with_original_language", "hi")}},
		{id: "korean", by: "score", vs: []variant{both("with_original_language", "ko")}},
		{id: "anime", by: "score", vs: []variant{both("with_original_language", "ja", "with_genres", "16")}},
		{id: "crime", by: "score", vs: []variant{g("53", "9648"), g("80", "80"), g("9648", "9648")}},
		{id: "comedy", by: "score", vs: []variant{g("35", "35")}},
		{id: "scifi", by: "score", vs: []variant{g("878", "10765")}},
		// more rows below the first ten, so the page keeps going (Dev: "infinity recommendations")
		{id: "action", by: "score", vs: []variant{g("28", "10759")}},
		{id: "drama", by: "score", vs: []variant{g("18", "18")}},
		{id: "romance", by: "score", vs: []variant{g("10749", "")}},
		{id: "tamil", by: "score", vs: []variant{both("with_original_language", "ta")}},
		{id: "telugu", by: "score", vs: []variant{both("with_original_language", "te")}},
		{id: "malayalam", by: "score", vs: []variant{both("with_original_language", "ml")}},
		{id: "horror", by: "score", vs: []variant{g("27", "")}},
		{id: "family", by: "score", vs: []variant{g("10751", "10751")}},
		{id: "docs", by: "score", vs: []variant{g("99", "99")}},
		{id: "spanish", by: "score", vs: []variant{both("with_original_language", "es")}},
		{id: "british", by: "score", vs: []variant{both("with_origin_country", "GB")}},
		{id: "war", by: "score", vs: []variant{g("10752|36", "10768")}},
		{id: "animation", by: "score", vs: []variant{g("16", "16")}},
		{id: "reality", by: "pop", vs: []variant{g("", "10764")}},
	}
}

// rowOrder is the launcher's rows after Because you watched, top to bottom.
var rowOrder = []string{"new", "top", "indian", "korean", "anime", "crime", "comedy", "scifi",
	"action", "drama", "romance", "tamil", "telugu", "malayalam", "horror", "family", "docs", "spanish", "british", "war", "animation", "reality"}

// moreRow fetches page p of row id (the same queries as the row, one page further)
// and sends the titles not already on the launcher, so a row never ends.
func (a *App) moreRow(id string, p int) {
	c := a.ld.tm
	reply := func(items []cardItem) {
		a.hub.broadcastScreens(map[string]any{"t": "more", "id": id, "page": p, "items": items})
	}
	if c == nil || p < 2 || p > 20 {
		reply(nil)
		return
	}
	var sp *spec
	for _, s := range specs() {
		if s.id == id && !s.hidden {
			s := s
			sp = &s
			break
		}
	}
	if sp == nil {
		reply(nil)
		return
	}
	var mu sync.Mutex
	var wg sync.WaitGroup
	var mv, tv [][]tmdb.Item
	for _, v := range sp.vs {
		for _, pr := range providers {
			for kind, q := range map[string]url.Values{"movie": v.movie, "tv": v.tv} {
				if q == nil {
					continue
				}
				qq := url.Values{}
				for k, x := range q {
					qq[k] = x
				}
				qq.Set("page", strconv.Itoa(p))
				wg.Add(1)
				go func(kind, ids, svc string, q url.Values) {
					defer wg.Done()
					it, err := c.Discover(kind, ids, "IN", svc, 20, q)
					if err != nil || len(it) == 0 {
						return
					}
					mu.Lock()
					if kind == "tv" {
						tv = append(tv, it)
					} else {
						mv = append(mv, it)
					}
					mu.Unlock()
				}(kind, pr.ids, pr.svc, qq)
			}
		}
	}
	wg.Wait()
	why := rowWhy[id]
	var fresh []tmdb.Item
	a.ld.mu.Lock()
	for _, it := range append(tmdb.Merge(40, sp.by, mv...), tmdb.Merge(40, sp.by, tv...)...) {
		k := itemKey(it)
		if _, dup := a.ld.byKey[k]; dup || (id != "new" && it.Votes < 20) || (it.Backdrop == "" && it.Poster == "") {
			continue
		}
		a.ld.byKey[k] = it // OK on the card opens it like any other
		a.ld.extra[k] = it
		fresh = append(fresh, it)
	}
	a.ld.mu.Unlock()
	sort.SliceStable(fresh, func(i, j int) bool { return a.personal(fresh[i], id) > a.personal(fresh[j], id) })
	var out []cardItem
	for _, it := range fresh { // card() takes the lock itself (image registry)
		if c := a.card(it, id, why); c.Img != "" {
			out = append(out, c)
		}
	}
	n := len(out)
	log.Printf("launcher: row %s page %d: %d more", id, p, n)
	reply(out)
}

var providers = []struct{ svc, ids string }{{"netflix", "8"}, {"prime", "119"}, {"jiohotstar", "122|2336"}}

// refreshRec asks TMDB for every row: one query per row variant, kind and
// service, run a few at a time. Rows are ordered by a quality score.
func (a *App) refreshRec() {
	a.ld.mu.Lock()
	if a.ld.building {
		a.ld.mu.Unlock()
		return
	}
	a.ld.building = true
	a.ld.mu.Unlock()
	defer func() { a.ld.mu.Lock(); a.ld.building = false; a.ld.mu.Unlock() }()
	a.ld.lastTry.Store(time.Now().UnixMilli())

	c := a.ld.tm
	sp := specs()
	type job struct {
		si       int
		kind     string
		svc, ids string
		q        url.Values
	}
	var jobs []job
	for i, s := range sp {
		for _, v := range s.vs {
			for _, p := range providers {
				if v.movie != nil {
					jobs = append(jobs, job{i, "movie", p.svc, p.ids, v.movie})
				}
				if v.tv != nil {
					jobs = append(jobs, job{i, "tv", p.svc, p.ids, v.tv})
				}
			}
		}
	}
	res := make([][][]tmdb.Item, len(sp)) // row -> lists
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)
	var failed int
	for _, j := range jobs {
		wg.Add(1)
		sem <- struct{}{}
		go func(j job) {
			defer wg.Done()
			defer func() { <-sem }()
			it, err := c.Discover(j.kind, j.ids, "IN", j.svc, 20, j.q)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				failed++
				return
			}
			res[j.si] = append(res[j.si], it)
		}(j)
	}
	wg.Wait()
	if failed > 0 {
		log.Printf("launcher: %d of %d TMDB queries failed", failed, len(jobs))
	}
	var d recData
	for i, s := range sp {
		var mv, tv [][]tmdb.Item
		for _, l := range res[i] {
			if len(l) > 0 && l[0].Kind == "tv" {
				tv = append(tv, l)
			} else if len(l) > 0 {
				mv = append(mv, l)
			}
		}
		// every title needs a picture and, outside New releases, 20 votes
		ok := func(l []tmdb.Item) []tmdb.Item {
			var out []tmdb.Item
			for _, it := range l {
				if (it.Backdrop == "" && it.Poster == "") || (s.id != "new" && it.Votes < 20) {
					continue
				}
				out = append(out, it)
			}
			return out
		}
		items := append(ok(tmdb.Merge(24, s.by, mv...)), ok(tmdb.Merge(24, s.by, tv...))...)
		if len(items) > 0 {
			d.Shelves = append(d.Shelves, shelf{ID: s.id, Title: s.id, Items: items})
		} else if old, ok := a.oldShelf(s.id); ok && len(res[i]) == 0 {
			d.Shelves = append(d.Shelves, old) // every query of the row failed: keep yesterday's row, not a hole for six hours
		}
	}
	if len(d.Shelves) < 3 {
		return
	}
	d.Occasions = a.occFetch(c, len(jobs), a.becauseReserve()) // candidates for the occasions opening within 14 days, inside the call budget
	a.ld.mu.Lock()
	a.ld.data = d
	a.ld.mu.Unlock()
	a.indexKeys()
	if b, err := json.Marshal(d); err == nil {
		_ = os.MkdirAll(filepath.Dir(a.recCachePath()), 0o700)
		_ = os.WriteFile(a.recCachePath(), b, 0o600)
	}
	a.ld.lastOK.Store(time.Now().UnixMilli())
	a.updateBecause()
	a.pushRows()
}

// shownTitle is what a card may say: the placeholder "YouTube video" becomes the channel
// name, and with no channel there is nothing honest to show (the caller drops the item).
func shownTitle(title, channel string) string {
	t := strings.TrimSpace(title)
	if t == "" || strings.EqualFold(t, "YouTube video") {
		return strings.TrimSpace(channel)
	}
	return t
}

// noPlaceholders drops cards that only say "YouTube video"; the Saved row keeps fewer than 2 empty.
func noPlaceholders(l []cardItem) []cardItem {
	out := make([]cardItem, 0, len(l))
	for _, c := range l {
		if shownTitle(c.Title, "") != "" {
			out = append(out, c)
		}
	}
	if len(out) < 2 {
		return []cardItem{}
	}
	return out
}

// becauseSource is the newest history entry that can be a reason: a real title, not a
// "last opened" placeholder and not a YouTube video. Those used to wipe the row when
// they were the newest entry; now the search goes on to the next real title.
func becauseSource(l []history.Entry) (history.Entry, bool) {
	for _, e := range l {
		if e.Opened || e.Service == "youtube" || e.Title == "" || strings.EqualFold(e.Title, svcNames[e.Service]) {
			continue
		}
		return e, true
	}
	return history.Entry{}, false
}

// updateBecause builds "Because you watched X" from the newest real history title.
// becFor is set only once TMDB has answered, so a network blip is retried on the
// next call instead of freezing the row until he watches something else.
func (a *App) updateBecause() {
	l := a.ld.hist.List()
	a.learnHistory(l)
	a.ld.mu.Lock()
	c := a.ld.tm
	e0, ok := becauseSource(l)
	if c == nil || len(l) == 0 || (ok && e0.Title == a.ld.becFor) {
		a.ld.mu.Unlock()
		return
	}
	if !ok {
		a.ld.because, a.ld.becFor = nil, ""
		a.ld.mu.Unlock()
		a.indexKeys()
		return
	}
	title := e0.Title
	a.ld.mu.Unlock()
	kind, id, err := c.Search(title)
	if err != nil {
		return
	}
	items, err := c.Recommendations(kind, id, 20)
	if err != nil {
		return
	}
	// a recommendation is not where the watched title was: keep only those one of his
	// apps streams in India, coloured by that app
	kept := items[:0]
	for _, it := range items {
		d, err := c.Details(it.Kind, it.ID)
		if err != nil || len(d.Services) == 0 {
			continue
		}
		if o := a.svcOrder(itemKey(it), it.Title, d.Services); len(o) > 0 {
			it.Service = o[0]
			kept = append(kept, it)
		}
	}
	items = kept
	a.ld.mu.Lock()
	a.ld.becFor = title
	if len(items) == 0 { // nothing like it on his apps: no row, rather than a wrong one
		a.ld.because = nil
	} else {
		a.ld.because = &shelf{ID: "because", Title: "Because you watched " + title, Items: items}
	}
	a.ld.mu.Unlock()
	a.indexKeys()
}

// learnHistory teaches the taste what he watched through the Netflix, Prime and
// JioHotstar apps themselves: only launcher opens and a one-time seed taught it
// before, so a month of watching elsewhere left the picks where they were. A title
// teaches once per outcome (LearnOnce); only titles TV Mode already knows by name
// are used, so it costs no TMDB call.
func (a *App) learnHistory(l []history.Entry) {
	if a.testRows() {
		return
	}
	var known map[string]tmdb.Item
	for _, e := range l {
		if e.Opened || e.Service == "youtube" || e.At == 0 || time.Since(time.UnixMilli(e.At)) > 30*24*time.Hour || e.Pct() < 0.1 {
			continue
		}
		name := normTitle(libFirst(e.Show, e.Title))
		if name == "" {
			continue
		}
		if known == nil {
			known = map[string]tmdb.Item{}
			a.ld.mu.Lock()
			for _, it := range a.ld.byKey {
				known[normTitle(it.Title)] = it
			}
			a.ld.mu.Unlock()
		}
		it, ok := known[name]
		if !ok {
			continue
		}
		it.Service = e.Service
		s, id := taste.Played, name+"|play"
		if e.Pct() > 0.7 {
			s, id = taste.Finished, name+"|fin"
		}
		a.ld.taste.LearnOnce(id, tasteOf(it, ""), s)
	}
}

func itemKey(it tmdb.Item) string { return it.Kind + strconv.Itoa(it.ID) }

func (a *App) indexKeys() {
	a.ld.mu.Lock()
	defer a.ld.mu.Unlock()
	m := map[string]tmdb.Item{}
	for _, s := range a.ld.data.Shelves {
		for _, it := range s.Items {
			if _, ok := m[itemKey(it)]; !ok {
				m[itemKey(it)] = it
			}
		}
	}
	if a.ld.because != nil {
		for _, it := range a.ld.because.Items {
			if _, ok := m[itemKey(it)]; !ok {
				m[itemKey(it)] = it
			}
		}
	}
	for _, l := range a.ld.data.Occasions {
		for _, it := range l {
			if _, ok := m[itemKey(it)]; !ok {
				m[itemKey(it)] = it
			}
		}
	}
	for k, it := range a.ld.extra {
		if _, ok := m[k]; !ok {
			m[k] = it
		}
	}
	a.ld.byKey = m
}

var imgPath = regexp.MustCompile(`^/[A-Za-z0-9_.\-]+$`)

// imgURL registers a source image and returns the address the page may ask for.
func (a *App) imgURL(src string) string {
	if src == "" {
		return ""
	}
	sum := sha1.Sum([]byte(src))
	h := hex.EncodeToString(sum[:8])
	a.ld.mu.Lock()
	a.ld.imgSrc[h] = src
	a.ld.mu.Unlock()
	if hiResImg(src) != src {
		return "/img/" + h + "?v=hd" // a new address, so a browser holding the old 780 px copy (max-age a day) fetches again
	}
	return "/img/" + h
}

func (a *App) tmdbImg(path, size string) string {
	if path == "" || !imgPath.MatchString(path) {
		return ""
	}
	if a.testRows() {
		return a.imgURL("http://127.0.0.1:8780/poster" + path)
	}
	return a.imgURL("https://image.tmdb.org/t/p/" + size + path)
}

var svcNames = map[string]string{"netflix": "Netflix", "prime": "Prime Video", "jiohotstar": "JioHotstar", "youtube": "YouTube"}

var rowTitles = map[string][3]string{ // all, movies, tv
	"new":       {"New releases", "New movies", "New series"},
	"top":       {"Top rated", "Top rated films", "Top rated shows"},
	"indian":    {"Indian", "Indian films", "Indian series"},
	"korean":    {"Korean", "Korean films", "Korean series"},
	"anime":     {"Japanese anime", "Anime films", "Anime series"},
	"crime":     {"Crime and thrillers", "Crime and thriller films", "Crime and thriller series"},
	"comedy":    {"Comedy", "Comedy films", "Comedy series"},
	"scifi":     {"Sci-fi and fantasy", "Sci-fi and fantasy films", "Sci-fi and fantasy series"},
	"action":    {"Action and adventure", "Action films", "Action series"},
	"drama":     {"Drama", "Drama films", "Drama series"},
	"romance":   {"Romance", "Romance films", "Romance"},
	"tamil":     {"Tamil", "Tamil films", "Tamil series"},
	"telugu":    {"Telugu", "Telugu films", "Telugu series"},
	"malayalam": {"Malayalam", "Malayalam films", "Malayalam series"},
	"horror":    {"Horror", "Horror films", "Horror"},
	"family":    {"Family", "Family films", "Family series"},
	"docs":      {"Documentaries", "Documentary films", "Docuseries"},
	"spanish":   {"Spanish", "Spanish films", "Spanish series"},
	"british":   {"British", "British films", "British series"},
	"war":       {"War and history", "War and history films", "War and politics series"},
	"animation": {"Animation", "Animated films", "Animated series"},
	"reality":   {"Reality", "Reality", "Reality shows"},
}

var rowWhy = map[string]string{
	"new": "New release", "top": "Top rated", "indian": "Popular in India", "korean": "Popular Korean titles",
	"anime": "Japanese anime", "crime": "Crime and thrillers", "comedy": "Comedy", "scifi": "Sci-fi and fantasy",
	"action": "Action and adventure", "drama": "Drama", "romance": "Romance", "tamil": "Tamil", "telugu": "Telugu",
	"malayalam": "Malayalam", "horror": "Horror", "family": "Family", "docs": "Documentary", "spanish": "Spanish",
	"british": "British", "war": "War and history", "animation": "Animation", "reality": "Reality",
}

// order puts the best first: newest first in New releases, the vote score elsewhere.
func order(id string, it tmdb.Item) float64 {
	if id == "new" {
		n, _ := strconv.Atoi(strings.ReplaceAll(it.Date, "-", ""))
		return float64(n)
	}
	return tmdb.Score(it)
}

func (a *App) card(it tmdb.Item, shelfID, why string) cardItem {
	img := a.tmdbImg(it.Backdrop, "w1280")
	if img == "" {
		img = a.tmdbImg(it.Poster, "w500")
	}
	return cardItem{Key: itemKey(it), Title: it.Title, Service: it.Service, Kind: it.Kind, Img: img, Ord: order(shelfID, it), Why: why, Year: it.Year, Vote: it.Vote, Votes: it.Votes}
}

func stoppedAt(ms int64) string {
	t := time.UnixMilli(ms).In(time.Local)
	now := nowTime()
	hm := t.Format("15:04")
	switch {
	case t.YearDay() == now.YearDay() && t.Year() == now.Year():
		return "today at " + hm
	case now.Sub(t) < 36*time.Hour && t.Hour() >= 18:
		return "last night at " + hm
	case now.Sub(t) < 36*time.Hour:
		return "yesterday at " + hm
	}
	return "on " + t.Format("Mon 2 Jan") + " at " + hm
}

func isEpisode(e history.Entry) bool { return e.Show != "" || e.Season > 0 || e.Episode > 0 }

func (a *App) rowsFrame() rowsFrame {
	f := rowsFrame{T: "rows", Hero: map[string][]*heroFrame{}, Cont: []cardItem{}, Saved: noPlaceholders(a.libSavedCards()), Shelves: []shelfFrame{}}
	hl := a.ld.hist.List()
	held := watchedNames(hl, a.libStore())
	a.ld.mu.Lock()
	data := dropWatched(a.ld.data, held)
	bec := a.ld.because
	a.ld.mu.Unlock()
	by := map[string]shelf{}
	for _, s := range data.Shelves {
		by[s.ID] = s
	}

	// Continue watching: the newest title with 2-95 percent watched becomes the first hero slide
	// (when it fits the mode); the Continue watching row is the history, that one first.
	seen := map[string]bool{}
	contHero := -1
	for i, e := range hl {
		if !e.Opened && e.Pct() >= 0.02 && e.Pct() < 0.95 && !a.libHidden(e) && shownTitle(e.Title, e.Channel) != "" { // libHidden: he marked it Finished or Dropped and has not played it since
			contHero = i
			break
		}
	}
	// the occasion engine: which occasions are live now, the lean, the shelves and the slide they earn
	now := a.now()
	up := a.upNextHero(now)
	a.d5Init() // weather reader for the occasion engine (phase 5)
	plan := a.occPlan(now, hl, data, contHero >= 0, up != nil)
	// the row starts with the banner title, so both say the same; a "Last opened"
	// placeholder (Netflix in Chrome: no title, picture or progress) is not a card
	for i, e := range hl {
		if e.Opened || a.libHidden(e) {
			continue
		}
		t := shownTitle(e.Title, e.Channel)
		if t == "" {
			continue
		}
		f.Cont = append(f.Cont, cardItem{Title: t, Service: e.Service, Img: a.imgURL(e.Img), Pct: e.Pct(), I: i, Line: e.Line()})
	}
	f.Cont = a.deskContMerge(f.Cont, hl) // deskrep.go: what he last watched at the desk ("at the desk, 20:14")

	// rows: each title once (earliest row wins), at most 12 per kind in a row, rows under 4 dropped
	rows := []shelf{}
	if bec != nil {
		rows = append(rows, *bec)
	}
	// Occasion shelves are slots, not a multiplier: one calendar shelf right after Because you
	// watched (before For you, so it keeps its titles) and one moment shelf after For you.
	// A node he has ignored for days goes quiet: its shelf comes after the plain rows.
	occShelf := func(l *occasion.Live, items []tmdb.Item) shelf {
		return shelf{ID: "occ-" + l.Node.ID, Title: l.Node.Name, Items: items}
	}
	var calID, momID string
	var late []shelf
	if plan != nil && plan.cal != nil {
		calID = "occ-" + plan.cal.Node.ID
		if plan.quietID[plan.cal.Node.ID] {
			late = append(late, occShelf(plan.cal, plan.calIt))
		} else {
			rows = append(rows, occShelf(plan.cal, plan.calIt))
		}
	}
	// On this day (phase 5) comes right after the calendar shelf: the festival shelf keeps its
	// place and its titles, and the plain rows (For you takes high-scoring classics) cannot
	// take the shelf's titles first.
	otd := a.d5OnThisDay(now, data, a.libStore())
	if otd != nil {
		rows = append(rows, shelf{ID: "otd", Title: "On this day", Items: otd.items})
	}
	// For you, then New releases and Top rated, then the touches, then the plain rows
	fy := a.forYou(by)
	if len(fy) > 0 {
		rows = append(rows, fy[0])
	}
	if plan != nil && plan.mom != nil {
		momID = "occ-" + plan.mom.Node.ID
		if plan.quietID[plan.mom.Node.ID] {
			late = append(late, occShelf(plan.mom, plan.momIt))
		} else {
			rows = append(rows, occShelf(plan.mom, plan.momIt))
		}
	}
	for _, id := range rowOrder[:2] {
		if s, ok := by[id]; ok {
			rows = append(rows, s)
		}
	}
	if len(fy) > 1 {
		rows = append(rows, fy[1:]...)
	}
	for _, id := range rowOrder[2:] {
		if s, ok := by[id]; ok {
			rows = append(rows, s)
		}
	}
	rows = append(rows, late...)
	var affs []float64
	for _, s := range rows {
		why := rowWhy[s.ID]
		titles := rowTitles[s.ID]
		if s.ID == "because" {
			why = s.Title
			titles = [3]string{s.Title, s.Title, s.Title}
		}
		if strings.HasPrefix(s.ID, "fy") {
			why = "Picked for you"
			titles = [3]string{s.Title, s.Title + ": movies", s.Title + ": series"}
		}
		if s.ID == "otd" {
			why, titles = "On this day", [3]string{"On this day", "On this day", "On this day"}
		}
		occ, occLine := "", ""
		if strings.HasPrefix(s.ID, "occ-") {
			occ = strings.TrimPrefix(s.ID, "occ-")
			if nd, ok := occasion.Find(occ); ok {
				why, occLine = nd.Name, nd.Why // the stage kicker reads ON NETFLIX · DIWALI WEEK
				titles = [3]string{nd.Name, nd.Name, nd.Name}
			}
		}
		sf := shelfFrame{ID: s.ID, Title: titles[0], Titles: titles[:], Why: why}
		sf.Line = occLine
		n := map[string]int{}
		var rowAff float64
		items := a.rankShelf(s)
		if s.ID == momID || s.ID == "otd" { // a moment shelf (and On this day) is already in its own order
			items = s.Items
		}
		for _, it := range items {
			k := itemKey(it)
			// On this day: a title he finished a year ago is the point, even when he marked it
			_, fromLib := otd.libCard(k)
			if seen[k] || n[it.Kind] >= 12 || (a.isRated(k) && !fromLib) || (s.ID != "otd" && isHeld(held, it)) { // a title marked watched is not suggested again
				continue
			}
			c := a.card(it, s.ID, why)
			if s.ID == "otd" {
				c = otd.apply(it, c)
			}
			if c.Img == "" {
				continue
			}
			if occ != "" {
				c.Occ, c.Line = occ, occLine
			}
			seen[k] = true
			n[it.Kind]++
			if s.ID != "new" && s.ID != "occ-friday-night" { // New releases stay newest first; every other row is in ranked order
				c.Ord = float64(100000 - len(sf.Items))
			}
			if len(sf.Items) < 6 {
				rowAff += a.ld.taste.Affinity(tasteOf(it, s.ID))
			}
			sf.Items = append(sf.Items, c)
		}
		if len(sf.Items) >= 4 {
			f.Shelves = append(f.Shelves, sf)
			affs = append(affs, rowAff)
		}
	}
	// rows he likes rise (Because you watched stays first); an empty profile keeps the plain order
	if a.ld.taste.Learned() {
		idx := make([]int, len(f.Shelves))
		for i := range idx {
			idx[i] = i
		}
		sort.SliceStable(idx, func(i, j int) bool {
			pin := func(id string) int { // Because you watched, the calendar shelf, For you, the moment shelf stay on top; a quiet one stays last
				switch {
				case id == "because":
					return 6
				case id == calID && !plan.quietID[strings.TrimPrefix(id, "occ-")]:
					return 5
				case id == "otd":
					return 4
				case id == "fy":
					return 3
				case id == momID && !plan.quietID[strings.TrimPrefix(id, "occ-")]:
					return 2
				case strings.HasPrefix(id, "occ-"):
					return -1
				}
				return 0
			}
			if pi, pj := pin(f.Shelves[idx[i]].ID), pin(f.Shelves[idx[j]].ID); pi != pj {
				return pi > pj
			}
			return affs[idx[i]] > affs[idx[j]]+0.05 // a small lead is not enough to swap rows
		})
		out := make([]shelfFrame, len(idx))
		for i, k := range idx {
			out[i] = f.Shelves[k]
		}
		f.Shelves = out
	}
	// hero carousel per mode: Continue watching first, then at least 14 picks. The picks are
	// what the rows left over, best vote score first, mixed movies and series, no title twice.
	pool := map[string]tmdb.Item{}
	for _, s := range data.Shelves {
		for _, it := range s.Items {
			if k := itemKey(it); !seen[k] && !a.isRated(k) && (it.Backdrop != "" || it.Poster != "") && it.Overview != "" {
				pool[k] = it
			}
		}
	}
	ranked := make([]tmdb.Item, 0, len(pool))
	for _, it := range pool {
		ranked = append(ranked, it)
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		si, sj := a.personal(ranked[i], ""), a.personal(ranked[j], "")
		if si != sj {
			return si > sj
		}
		return itemKey(ranked[i]) < itemKey(ranked[j])
	})
	for _, mode := range []string{"all", "movie", "tv"} {
		var list []*heroFrame
		if contHero >= 0 && !(up != nil && hl[contHero].Show != "" && normTitle(hl[contHero].Show) == normTitle(up.it.Title)) { // the same show, nearly done: Up next takes the slot
			e := hl[contHero]
			if mode == "all" || (mode == "tv" && isEpisode(e)) || (mode == "movie" && !isEpisode(e) && e.Service != "youtube") {
				sub := ""
				if e.Season > 0 && e.Episode > 0 {
					sub = fmt.Sprintf("S%d E%d", e.Season, e.Episode)
					if e.EpTitle != "" {
						sub += "  ·  " + e.EpTitle
					}
				} else if e.EpTitle != "" {
					sub = e.EpTitle
				} else if e.Channel != "" {
					sub = e.Channel
				}
				list = append(list, &heroFrame{K: "cont", Service: e.Service, Title: shownTitle(e.Title, e.Channel), Sub: sub, Img: a.imgURL(e.Img), Thumb: a.imgURL(e.Img), Pct: e.Pct(), Left: e.Left(), Stopped: stoppedAt(e.At), I: contHero})
			}
		}
		// Up next beats every festival; the occasion slide comes after it (and after Continue)
		if up != nil && mode != "movie" {
			list = append(list, a.upNextFrame(up))
		}
		occKey := ""
		if plan != nil && plan.hero != nil {
			for _, it := range plan.heroIt {
				if mode == "all" || it.Kind == mode {
					occKey = itemKey(it)
					list = append(list, a.occHeroFrame(plan.hero, it))
					break
				}
			}
		}
		base := len(list)
		for _, minVotes := range []int{300, 50, 0} { // widen until there are 14 picks
			list = list[:base]
			for _, it := range ranked {
				if (mode != "all" && it.Kind != mode) || it.Votes < minVotes || itemKey(it) == occKey {
					continue
				}
				img := a.tmdbImg(it.Backdrop, "w1280")
				if img == "" {
					img = a.tmdbImg(it.Poster, "w780")
				}
				list = append(list, &heroFrame{K: "pick", Service: it.Service, Title: it.Title, Over: it.Overview, Img: img, Thumb: a.tmdbImg(it.Backdrop, "w300"), Key: itemKey(it), Kind: it.Kind, Year: it.Year, Genres: it.Genres, Vote: it.Vote, Votes: it.Votes, Why: "Highly rated on your services", Kick: a.moodKick(it)})
				if len(list) >= 17 {
					break
				}
			}
			if len(list)-base >= 14 {
				break
			}
		}
		f.Hero[mode] = list
	}
	a.occFinish(plan, f)
	return f
}

func (a *App) pushRows() { a.hub.broadcastScreens(a.rowsFrame()) }

type watchPage struct {
	Href    string `json:"href"`
	Title   string `json:"title"`
	OGT     string `json:"ogt"`
	OGI     string `json:"ogi"`
	PT      string `json:"pt"`
	PS      string `json:"ps"`
	H1      string `json:"h1"`
	Has     bool   `json:"has"`
	Playing bool   `json:"playing"`
	Pos     int    `json:"pos"`
	Dur     int    `json:"dur"`
	Loop    bool   `json:"loop"`
}

// noteWatching is called from the poll loop with what the current page shows.
// An item is recorded only while a real video is playing (see history.FromPage).
func (a *App) noteWatching(service string, w *watchPage) {
	if a.ld == nil || w == nil || service == "" || service == "launcher" {
		return
	}
	e, ok := history.FromPage(service, history.Page{Href: w.Href, Title: w.Title, OGTitle: w.OGT, OGImage: w.OGI, PTitle: w.PT, PSub: w.PS, H1: w.H1, HasVideo: w.Has, Playing: w.Playing, Pos: w.Pos, Dur: w.Dur, Loop: w.Loop})
	if !ok {
		return
	}
	a.ld.mu.Lock()
	h := a.ld.resuming
	a.ld.mu.Unlock()
	if (h.group == e.GroupKey() || h.group == history.Key(e.URL)) && time.Now().Before(h.until) && e.Pos < h.pos-60 {
		return
	}
	// the page did not say all of it: the link book, earlier entries and TMDB know the rest
	a.fillEp(&e)
	a.markEpisode(e)
	a.episodeLinkFromWatch(e)
	a.creditWatch(service, e.Pct())
	a.libWatch(e, "tv-poll") // the library records every report; the store coalesces
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

// fillMeta completes a card the page could not: a YouTube title and channel
// (oEmbed, no key), or a TMDB backdrop for a show or movie with no page image.
func (a *App) fillMeta(e history.Entry) {
	g := e.GroupKey()
	if e.Service == "youtube" && strings.HasPrefix(g, "yt:") {
		c := http.Client{Timeout: 8 * time.Second}
		resp, err := c.Get(history.OembedURL(strings.TrimPrefix(g, "yt:")))
		if err == nil {
			var o struct {
				Title  string `json:"title"`
				Author string `json:"author_name"`
			}
			if resp.StatusCode == 200 && json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(&o) == nil && o.Title != "" {
				a.ld.hist.SetTitle(g, o.Title, o.Author)
				a.libMeta(g, o.Title, "")
			}
			resp.Body.Close()
			a.pushRows()
		}
		return
	}
	if e.Img == "" && a.ld.tm != nil {
		name := e.Show
		if name == "" {
			name = e.Title
		}
		it, err := a.ld.tm.SearchItem(name)
		if err == nil && it.Backdrop != "" && imgPath.MatchString(it.Backdrop) {
			a.libMetaName(name, "https://image.tmdb.org/t/p/w1280"+it.Backdrop)
			if a.ld.hist.SetArt(g, "https://image.tmdb.org/t/p/w1280"+it.Backdrop) {
				a.pushRows()
			}
		}
	}
}

// hiResImg upgrades a TMDB w780 backdrop to w1280 so the desk hero is not stretched.
func hiResImg(src string) string {
	const from = "https://image.tmdb.org/t/p/w780/"
	if strings.HasPrefix(src, from) {
		return "https://image.tmdb.org/t/p/w1280/" + strings.TrimPrefix(src, from)
	}
	return src
}

// imgHandler serves registered images, cached on disk for a week.
func (a *App) imgHandler(w http.ResponseWriter, r *http.Request) {
	h := strings.TrimPrefix(r.URL.Path, "/img/")
	a.ld.mu.Lock()
	src, ok := a.ld.imgSrc[h]
	a.ld.mu.Unlock()
	if !ok || strings.ContainsAny(h, "/\\.") {
		http.NotFound(w, r)
		return
	}
	hi := hiResImg(src)
	name := "img-" + h
	if hi != src {
		name += "-hd"
	}
	cache := filepath.Join(filepath.Dir(a.recCachePath()), name)
	if st, err := os.Stat(cache); err != nil || time.Since(st.ModTime()) > 7*24*time.Hour {
		u, err := url.Parse(src)
		if err != nil || !(u.Scheme == "https" || (a.o.Test && u.Host == "127.0.0.1:8780")) {
			http.NotFound(w, r)
			return
		}
		c := http.Client{Timeout: 15 * time.Second}
		resp, err := c.Get(hi)
		if (err != nil || resp.StatusCode != 200) && hi != src {
			if resp != nil {
				resp.Body.Close()
			}
			resp, err = c.Get(src)
		}
		if err != nil || resp.StatusCode != 200 {
			if resp != nil {
				resp.Body.Close()
			}
			http.NotFound(w, r)
			return
		}
		b, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
		resp.Body.Close()
		if err != nil || len(b) == 0 {
			http.NotFound(w, r)
			return
		}
		_ = os.MkdirAll(filepath.Dir(cache), 0o700)
		if f, err := os.CreateTemp(filepath.Dir(cache), "img-*.tmp"); err == nil {
			_, werr := f.Write(b)
			cerr := f.Close()
			if werr != nil || cerr != nil || os.Rename(f.Name(), cache) != nil {
				_ = os.Remove(f.Name())
			}
		}
	}
	b, err := os.ReadFile(cache)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", http.DetectContentType(b))
	if strings.Contains(string(b[:min(len(b), 256)]), "<svg") {
		w.Header().Set("Content-Type", "image/svg+xml")
	}
	w.Header().Set("Cache-Control", "max-age=86400")
	_, _ = w.Write(b)
}

// previewHandler answers {"key":"<youtube id>"} for a recommendation key (loopback only).
func (a *App) previewHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	key := r.URL.Query().Get("key")
	a.ld.mu.Lock()
	it, ok := a.ld.byKey[key]
	k := a.ld.trail[key]
	c := a.ld.tm
	a.ld.mu.Unlock()
	if !ok || c == nil {
		_, _ = w.Write([]byte(`{"key":""}`))
		return
	}
	if k == "" {
		k, _ = c.Trailer(it.Kind, it.ID)
		a.ld.mu.Lock()
		a.ld.trail[key] = k
		a.ld.mu.Unlock()
	}
	b, _ := json.Marshal(map[string]string{"key": k})
	_, _ = w.Write(b)
}

// searchURL is where a recommended title is looked up on its service.
func searchURL(service, title string) string {
	q := url.QueryEscape(title)
	switch service {
	case "prime":
		return "https://www.primevideo.com/search/ref=atv_nb_sr?phrase=" + q
	case "netflix":
		return "https://www.netflix.com/search?q=" + q
	case "jiohotstar":
		return "https://www.hotstar.com/in/explore?search_query=" + q // /in/search?q= drops the words
	}
	return ""
}

// pickOpenSvc is the service an opened title goes to: the panel's pick (svcOrder; a row
// only knows the row it came from) unless it is known not to have the title.
func (a *App) pickOpenSvc(svcHint, key string, it tmdb.Item) string {
	svc := svcHint
	if svc == "" || a.availGet(svc, key) < 0 {
		svc = a.bestSvc(key, it.Title, it.Service)
	}
	return svc
}

// openItem opens a Continue watching entry (kind "cont", index i) or a
// recommendation (kind "item", key) chosen on the launcher.
func (a *App) openItem(kind, key string, i int, svcHint string, se, ep int) {
	if a.dupOpen(fmt.Sprintf("%s|%s|%d|%s|%d|%d", kind, key, i, svcHint, se, ep)) {
		return
	}
	idx := map[string]int{}
	for n, s := range services.Apps {
		idx[s.ID] = n
	}
	switch kind {
	case "cont":
		if i >= deskContBase { // a desk card (deskrep.go)
			a.deskContOpen(i)
			return
		}
		l := a.ld.hist.List()
		if i < 0 || i >= len(l) {
			log.Printf("open: continue-watching card %d is gone (%d cards); nothing opened", i, len(l))
			return
		}
		a.libOpenedEntry(l[i], "tv", "tv-open")
		if _, ok := idx[l[i].Service]; !ok {
			log.Printf("open: card %q is on %q, which is not one of the apps; nothing opened", l[i].Title, l[i].Service)
		}
		if n, ok := idx[l[i].Service]; ok {
			if l[i].Service == "netflix" {
				a.openAppAt(n, withT(l[i].URL, l[i].Pos))
				return
			}
			a.openAppAt(n, l[i].URL)
			go a.resumeAt(l[i])
		}
	case "lib": // a library item: the Saved row, the phone's Play on TV, the desk (key is its library id)
		a.libOpenTV(key, svcHint, se, ep)
	case "item":
		if key == "" && se > 0 && ep > 0 { // an episode built from the helper's links (no launcher key): open its address
			svc := svcHint
			if svc == "" {
				a.mu.Lock()
				svc = a.st.App
				a.mu.Unlock()
			}
			if u := a.linkEpURL(svc, se, ep); u != "" {
				if n, ok := idx[svc]; ok {
					a.openAppAt(n, u)
					return
				}
			}
		}
		a.ld.mu.Lock()
		it, ok := a.ld.byKey[key]
		a.ld.mu.Unlock()
		if !ok {
			log.Printf("open: no title for key %q (rows rebuilt?); nothing opened", key)
			return
		}
		svc := a.pickOpenSvc(svcHint, key, it)
		if svcHint == "prime" || svc == "prime" {
			probeNote("openitem", map[string]any{"hint": svcHint, "svc": svc, "title": it.Title, "se": se, "ep": ep, "link": a.linkGet(linkKey("prime", it.Title, se, ep)) != ""})
		}
		if svc == "" {
			a.show("opening", map[string]any{"name": "Not on your apps"})
			return
		}
		it.Service = svc
		a.libOpened(it, svc, se, ep, "tv", "tv-open")
		a.occTouch()
		a.occNoteOpen(key)
		a.settleOpened()
		a.ld.taste.Learn(tasteOf(it, ""), taste.Played)
		a.ld.mu.Lock()
		a.ld.opened = &openedTitle{it: it, at: time.Now()}
		a.ld.mu.Unlock()
		gen := a.ld.goGen.Add(1)
		if se == 0 {
			if e, ok := a.watched(svc, it.Title); ok && se == 0 { // seen it before: its own page, where he stopped
				if n, ok := idx[e.Service]; ok {
					if e.Service == "netflix" { // Chrome has no CDP: the address says where to start
						a.openAppAt(n, withT(e.URL, e.Pos))
					} else {
						a.openAppAt(n, e.URL)
						go a.resumeAt(e)
					}
				}
				return
			}
		}
		if svc == "jiohotstar" {
			if n, ok := idx[svc]; ok {
				go a.hotstarGo(n, it, se, ep, gen)
			}
			return
		}
		if svc == "prime" {
			if n, ok := idx[svc]; ok {
				go a.primeGo(n, it, se, ep, gen)
			}
			return
		}
		if svc == "netflix" { // its own Chrome: the address itself must say which episode
			if n, ok := idx[svc]; ok {
				name := it.Title
				if it.Kind == "tv" && se > 0 {
					name = fmt.Sprintf("%s  S%d E%d", it.Title, se, ep)
				}
				a.show("opening", map[string]any{"name": name})
				go func() { // may ask Netflix's public page first
					u := a.netflixGo(it, se, ep)
					if a.ld.goGen.Load() != gen { // a newer pick came while Netflix's page was asked: it wins
						log.Printf("open: %q on Netflix superseded by a newer pick; dropped", it.Title)
						return
					}
					a.openAppAt(n, u)
					a.noteNetflixOpen(it, se, ep, u)
				}()
			}
			return
		}
		if e, ok := a.watched(svc, it.Title); ok {
			if n, ok := idx[e.Service]; ok {
				a.openAppAt(n, e.URL)
				go a.resumeAt(e)
			}
			return
		}
		a.ld.resumeGen.Add(1)
		if n, ok := idx[svc]; ok {
			a.openAppAt(n, searchURL(svc, it.Title))
		}
	}
}

// detailsWriteMu serialises details.json writes.
var detailsWriteMu sync.Mutex

// titleHandler answers /api/title?id=&type=movie|tv with TMDB details, cached
// seven days in memory and on disk (loopback only; the page never sees credentials).
func (a *App) titleHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	id, _ := strconv.Atoi(r.URL.Query().Get("id"))
	kind := r.URL.Query().Get("type")
	if id <= 0 || (kind != "movie" && kind != "tv") {
		http.Error(w, `{"error":"bad request"}`, http.StatusBadRequest)
		return
	}
	key := kind + strconv.Itoa(id)
	a.ld.mu.Lock()
	d, ok := a.ld.details[key]
	c := a.ld.tm
	a.ld.mu.Unlock()
	if ok && d.Services != nil && time.Since(time.Unix(d.Fetched, 0)) < 7*24*time.Hour { // older entries lack where it streams
		a.encodeDetails(w, key, d)
		return
	}
	if a.testRows() {
		d = tmdb.Details{ID: id, Type: kind, Title: "Canned", Tagline: "A canned tagline", Overview: "Canned overview.", Rating: 7.8, Votes: 1234, Genres: []string{"Drama", "Crime"}, Runtime: 112, Cert: "UA", Cast: []string{"A One", "B Two", "C Three"}, Trailer: "", Fetched: time.Now().Unix()}
		a.encodeDetails(w, key, d)
		return
	}
	if c == nil {
		http.Error(w, `{"error":"no tmdb"}`, http.StatusServiceUnavailable)
		return
	}
	d, err := c.Details(kind, id)
	if err != nil {
		http.Error(w, `{"error":"unavailable"}`, http.StatusBadGateway)
		return
	}
	detailsWriteMu.Lock()
	defer detailsWriteMu.Unlock()
	a.ld.mu.Lock()
	a.ld.details[key] = d
	snap := make(map[string]tmdb.Details, len(a.ld.details))
	for k, v := range a.ld.details {
		if time.Since(time.Unix(v.Fetched, 0)) < 7*24*time.Hour {
			snap[k] = v
		}
	}
	a.ld.mu.Unlock()
	if b, err := json.Marshal(snap); err == nil {
		dir := filepath.Dir(a.recCachePath())
		_ = os.MkdirAll(dir, 0o700)
		p := filepath.Join(dir, "details.json")
		if os.WriteFile(p+".tmp", b, 0o600) == nil {
			_ = os.Rename(p+".tmp", p)
		}
	}
	a.encodeDetails(w, key, d)
}

// --- taste: what Dev does teaches the ranking (internal/taste) ---

func tasteOf(it tmdb.Item, row string) taste.Title {
	return taste.Title{Kind: it.Kind, Service: it.Service, GIDs: it.GIDs, Lang: it.Lang, Year: it.Year, Vote: it.Vote, Votes: it.Votes, Row: row}
}

// personal is a title's quality score bent by taste.
func (a *App) personal(it tmdb.Item, row string) float64 {
	// the day jitter (a seeded shuffle within a ~6 percent band) keeps near-equal titles from sitting in the same place every day
	return tmdb.Score(it) * taste.Boost(a.ld.taste.Affinity(tasteOf(it, row))) * a.leanOf(it) * a.moodLean(it) * taste.Jitter(itemKey(it), a.now(), 0.06)
}

// rankShelf orders a row by taste (New releases keeps its date order). Every
// fifth place goes to the best title outside his taste, so the page never
// narrows to one genre.
func (a *App) rankShelf(s shelf) []tmdb.Item {
	l := append([]tmdb.Item(nil), s.Items...)
	moody := a.d5MoodNow() != "" // a mood in force ranks a row even before his taste is learned
	if s.ID == "new" || (!a.ld.taste.Learned() && !moody) {
		return l
	}
	sort.SliceStable(l, func(i, j int) bool { return a.personal(l[i], s.ID) > a.personal(l[j], s.ID) })
	if !a.ld.taste.Learned() {
		return l
	}
	var mine, other []tmdb.Item
	for _, it := range l {
		if a.ld.taste.Affinity(tasteOf(it, s.ID)) > 0.05 {
			mine = append(mine, it)
		} else {
			other = append(other, it)
		}
	}
	sort.SliceStable(other, func(i, j int) bool {
		return tmdb.Score(other[i])*a.moodLean(other[i])*taste.Jitter(itemKey(other[i]), a.now(), 0.06) > tmdb.Score(other[j])*a.moodLean(other[j])*taste.Jitter(itemKey(other[j]), a.now(), 0.06)
	})
	out := make([]tmdb.Item, 0, len(l))
	for len(mine)+len(other) > 0 {
		if (len(out)%5 == 4 && len(other) > 0) || len(mine) == 0 {
			out, other = append(out, other[0]), other[1:]
		} else {
			out, mine = append(out, mine[0]), mine[1:]
		}
	}
	return out
}

// creditWatch is called with each history update of a service: progress on the
// title Dev opened from the launcher teaches how much he liked it.
func (a *App) creditWatch(service string, pct float64) {
	a.ld.mu.Lock()
	o := a.ld.opened
	if o == nil || o.settled || o.it.Service != service || time.Since(o.at) > 4*time.Hour {
		a.ld.mu.Unlock()
		return
	}
	o.maxPct = max(o.maxPct, pct)
	done := o.maxPct > 0.7
	if done {
		o.settled = true
	}
	it := o.it
	a.ld.mu.Unlock()
	if done {
		a.ld.taste.LearnOnce(normTitle(it.Title)+"|fin", tasteOf(it, ""), taste.Finished) // history teaches the same finish once
		log.Printf("taste: finished %q", it.Title)
	}
}

// settleOpened closes the previous open: started playing, gave up under 10
// percent within ten minutes = it was not for him.
func (a *App) settleOpened() {
	a.ld.mu.Lock()
	o := a.ld.opened
	a.ld.opened = nil
	a.ld.mu.Unlock()
	if o != nil && !o.settled && o.maxPct > 0 && o.maxPct < 0.1 && time.Since(o.at) < 10*time.Minute {
		a.ld.taste.Learn(tasteOf(o.it, ""), taste.Abandon)
		log.Printf("taste: gave up on %q", o.it.Title)
	}
}

// signal is a launcher frame {t:"sig", key, k: row, a: "dwell"|"detail"}.
func (a *App) signal(key, row, what string) {
	a.ld.mu.Lock()
	it, ok := a.ld.byKey[key]
	a.ld.mu.Unlock()
	if !ok {
		return
	}
	switch what {
	case "dwell":
		a.ld.taste.Learn(tasteOf(it, row), taste.Dwell)
	case "liked":
		go a.rate(key, 1)
		return
	case "disliked":
		go a.rate(key, -1)
		return
	case "unrated":
		go a.rate(key, 0)
		return
	case "detail":
		a.ld.taste.Learn(tasteOf(it, row), taste.Detail)
	}
	a.occTouch()
	a.occNote(row, what) // a themed shelf he opens from, or lingers on, wakes its occasion
}

// searchHandler answers /api/search?q= with movies and series from TMDB, best
// match first (loopback only). Results become openable cards; the details panel
// then says which of Dev's services streams each one.
func (a *App) searchHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	out := struct {
		Q     string     `json:"q"`
		Items []cardItem `json:"items"`
	}{Q: q, Items: []cardItem{}}
	if len([]rune(q)) < 2 {
		_ = json.NewEncoder(w).Encode(out)
		return
	}
	var found []tmdb.Item
	if a.testRows() {
		for i := 1; i <= 6; i++ {
			found = append(found, tmdb.Item{ID: 9000 + i, Kind: "movie", Title: fmt.Sprintf("%s %d", q, i), Year: "2024", Backdrop: fmt.Sprintf("/s%d.svg", i), Vote: 7.5, Votes: 900, Overview: "A canned search result."})
		}
	} else if c := a.ld.tm; c != nil {
		l, err := c.Find(q)
		if err != nil {
			http.Error(w, `{"error":"unavailable"}`, http.StatusBadGateway)
			return
		}
		// nothing for how he spelt it ("mudgaon" for Madgaon): try a few spellings that
		// sound the same, at most four more lookups, and stop at the first that finds any
		for i, v := range spellingsLike(q) {
			if len(l) > 0 || i >= 4 {
				break
			}
			if l2, err := c.Find(v); err == nil && len(l2) > 0 {
				log.Printf("search: %q found nothing; %q did", q, v)
				l = l2
			}
		}
		found = l
	}
	for _, it := range found {
		if len(out.Items) >= 15 {
			break
		}
		c := a.card(it, "search", "")
		if c.Img == "" {
			continue
		}
		c.Over = it.Overview
		k := itemKey(it)
		a.ld.mu.Lock()
		if old, ok := a.ld.byKey[k]; ok && old.Service != "" {
			c.Service = old.Service // already on a row: we know where it streams
		} else {
			a.ld.byKey[k], a.ld.extra[k] = it, it
		}
		a.ld.mu.Unlock()
		c.Service = a.bestSvc(k, it.Title, c.Service) // checked order, not the row it came from
		out.Items = append(out.Items, c)
	}
	_ = json.NewEncoder(w).Encode(out)
}

// seedTaste starts an empty profile from the watch history, so the home screen
// adapts to what Dev watched before the profile existed. Runs once.
func (a *App) seedTaste() {
	if a.testRows() || a.ld.taste.Events() > 0 {
		return
	}
	n := 0
	for _, e := range a.ld.hist.List() {
		if e.Opened || e.Service == "youtube" || e.Title == "" || n >= 30 {
			continue
		}
		name := e.Show
		if name == "" {
			name = e.Title
		}
		it, err := a.ld.tm.SearchItem(name)
		if err != nil {
			continue
		}
		it.Service = e.Service
		s, id := taste.Played, normTitle(name)+"|play"
		if e.Pct() > 0.7 {
			s, id = taste.Finished, normTitle(name)+"|fin"
		}
		a.ld.taste.LearnOnce(id, tasteOf(it, ""), s)
		n++
	}
	if n > 0 {
		log.Printf("taste: seeded from %d watched titles", n)
	}
}

// watched finds the history entry of a title on a service (the show for series), latest first.
func (a *App) watched(service, title string) (history.Entry, bool) {
	norm := normTitle
	want := norm(title)
	if want == "" {
		return history.Entry{}, false
	}
	for _, e := range a.ld.hist.List() {
		if e.Service != service || e.Opened || e.URL == "" {
			continue
		}
		if norm(e.Show) == want || norm(e.Title) == want {
			return e, true
		}
	}
	return history.Entry{}, false
}

// resumeJS finds the main video (an ad has another length) and seeks it to where he
// stopped when the site started it from the beginning.
const resumeJS = `(function(p,d){var v=[].slice.call(document.querySelectorAll("video")).filter(function(v){return v.duration>0&&isFinite(v.duration)}).sort(function(a,b){return b.duration-a.duration})[0];
if(!v)return "wait";if(d>0&&Math.abs(v.duration-d)>Math.max(90,d*0.06))return "ad";if(v.currentTime>=p-30)return "there";v.currentTime=Math.max(0,p-3);return "seek"})(%d,%d)`

// resumeAt makes an opened history entry play from where Dev left off: the services
// often start a title from the beginning. Netflix (Chrome, no page access) resumes itself.
func (a *App) resumeAt(e history.Entry) {
	gen := a.ld.resumeGen.Add(1)
	if a.extFor(e.Service) { // Chrome has no CDP: the helper's reports carry the seek
		a.resumeExt(e)
		return
	}
	if e.Opened || e.Pos < 60 || e.Dur > 0 && e.Pos > e.Dur-90 || a.Edge == nil {
		return
	}
	a.ld.mu.Lock()
	a.ld.resuming = resumeHold{group: history.Key(e.URL), pos: e.Pos, until: time.Now().Add(3 * time.Minute)}
	a.ld.mu.Unlock()
	defer func() {
		a.ld.mu.Lock()
		if a.ld.resuming.group == history.Key(e.URL) {
			a.ld.resuming = resumeHold{}
		}
		a.ld.mu.Unlock()
	}()
	seeks := 0
	for end := time.Now().Add(2 * time.Minute); time.Now().Before(end); time.Sleep(time.Second) {
		if a.ld.resumeGen.Load() != gen {
			return // opened something else
		}
		a.mu.Lock()
		app := a.st.App
		a.mu.Unlock()
		if app != e.Service {
			continue // still opening (or he left)
		}
		var r string
		if err := a.Edge.Eval(fmt.Sprintf(resumeJS, e.Pos, e.Dur), &r); err != nil {
			continue
		}
		switch r {
		case "there":
			if seeks > 0 {
				log.Printf("resume: %s at %d:%02d", e.Service, e.Pos/60, e.Pos%60)
			}
			return
		case "seek":
			if seeks++; seeks > 4 {
				log.Printf("resume: %s would not seek", e.Service)
				return
			}
			time.Sleep(time.Second)
		}
	}
}

// touch is a flavour a For you row can lean toward; feats are the taste features
// that say how much he likes it (the row with the strongest one comes first).
type touch struct {
	id, name string
	feats    []string
	match    func(tmdb.Item) bool
}

func hasGenre(it tmdb.Item, ids ...int) bool {
	for _, g := range it.GIDs {
		for _, w := range ids {
			if g == w {
				return true
			}
		}
	}
	return false
}

var indianLang = map[string]bool{"hi": true, "ta": true, "te": true, "ml": true, "kn": true, "bn": true, "mr": true, "pa": true, "gu": true}

func yearOf(it tmdb.Item) int { y, _ := strconv.Atoi(it.Year); return y }

// touches cover the ways a title can appeal: genre and mood, language and region,
// era, and the little-known. In this order until the profile has learned.
var touches = []touch{
	{"fysuspense", "suspense", []string{"g:thriller", "g:crime", "g:mystery"}, func(it tmdb.Item) bool { return hasGenre(it, 53, 80, 9648) }},
	{"fylaugh", "laughter", []string{"g:comedy"}, func(it tmdb.Item) bool { return hasGenre(it, 35) }},
	{"fyromance", "romance", []string{"g:romance"}, func(it tmdb.Item) bool { return hasGenre(it, 10749) }},
	{"fyaction", "action", []string{"g:action", "g:adventure"}, func(it tmdb.Item) bool { return hasGenre(it, 28, 12, 10759) }},
	{"fyscifi", "sci-fi and fantasy", []string{"g:scifi", "g:fantasy"}, func(it tmdb.Item) bool { return hasGenre(it, 878, 14, 10765) }},
	{"fyfear", "fear", []string{"g:horror"}, func(it tmdb.Item) bool { return hasGenre(it, 27) }},
	{"fydrama", "drama", []string{"g:drama"}, func(it tmdb.Item) bool { return hasGenre(it, 18) && !hasGenre(it, 35, 28, 27) }},
	{"fyanime", "anime", []string{"l:ja"}, func(it tmdb.Item) bool { return it.Lang == "ja" && hasGenre(it, 16) }},
	{"fyanimation", "animation", []string{"g:animation", "g:family"}, func(it tmdb.Item) bool { return it.Lang != "ja" && hasGenre(it, 16, 10751) }},
	{"fywar", "history and war", []string{"g:war", "g:history"}, func(it tmdb.Item) bool { return hasGenre(it, 10752, 10768, 36) }},
	{"fyreal", "real life", []string{"g:documentary", "g:reality"}, func(it tmdb.Item) bool { return hasGenre(it, 99, 10764) }},
	{"fyhome", "home", []string{"l:hi", "l:ta", "l:te", "l:ml"}, func(it tmdb.Item) bool { return indianLang[it.Lang] }},
	{"fykorea", "Korea", []string{"l:ko"}, func(it tmdb.Item) bool { return it.Lang == "ko" }},
	{"fyworld", "world cinema", []string{"l:es", "l:fr", "l:de", "l:it", "l:tr", "l:zh"}, func(it tmdb.Item) bool {
		return it.Lang != "" && it.Lang != "en" && it.Lang != "ja" && it.Lang != "ko" && !indianLang[it.Lang]
	}},
	{"fyclassic", "the classics", []string{"e:classic", "e:80s90s"}, func(it tmdb.Item) bool { y := yearOf(it); return y > 0 && y < 2000 }},
	{"fygems", "hidden gems", []string{"v:niche", "v:known"}, func(it tmdb.Item) bool { return it.Vote >= 7.2 && it.Votes >= 50 && it.Votes < 1500 }},
}

// forYou builds the For you row (every title TV Mode knows, ranked by taste) and
// up to 16 "For you, with a touch of ..." rows: the same ranking, leaning into one
// flavour, the flavours he likes most first once the profile has learned.
func (a *App) forYou(by map[string]shelf) []shelf {
	a.ld.mu.Lock()
	pool := make([]tmdb.Item, 0, 600)
	seen := map[string]bool{}
	add := func(it tmdb.Item) {
		if k := itemKey(it); !seen[k] && it.Service != "" {
			seen[k] = true
			pool = append(pool, it)
		}
	}
	for _, s := range by {
		for _, it := range s.Items {
			add(it)
		}
	}
	for _, it := range a.ld.extra {
		add(it)
	}
	a.ld.mu.Unlock()
	if len(pool) < 8 {
		return nil
	}
	score := map[string]float64{}
	for _, it := range pool {
		score[itemKey(it)] = a.personal(it, "fy")
	}
	sort.SliceStable(pool, func(i, j int) bool {
		si, sj := score[itemKey(pool[i])], score[itemKey(pool[j])]
		if si != sj {
			return si > sj
		}
		return itemKey(pool[i]) < itemKey(pool[j])
	})
	top := func(keep func(tmdb.Item) bool, n int) []tmdb.Item {
		var l []tmdb.Item
		for _, it := range pool {
			if keep(it) {
				if l = append(l, it); len(l) >= n {
					break
				}
			}
		}
		return l
	}
	out := []shelf{{ID: "fy", Title: "For you", Items: top(func(tmdb.Item) bool { return true }, 40)}}
	pick := append([]touch(nil), touches...)
	if a.ld.taste.Learned() {
		w := map[string]float64{}
		for _, t := range pick {
			w[t.id] = -1
			for _, f := range t.feats {
				w[t.id] = max(w[t.id], a.ld.taste.Weight(f))
			}
		}
		sort.SliceStable(pick, func(i, j int) bool { return w[pick[i].id] > w[pick[j].id]+0.02 })
	}
	for _, t := range pick {
		if l := top(t.match, 30); len(l) >= 6 {
			out = append(out, shelf{ID: t.id, Title: "For you, with a touch of " + t.name, Items: l})
		}
	}
	return out
}

// normTitle keeps letters and digits only, lower case: "Dipper vs. Manliness" = "dippervsmanliness".
func normTitle(t string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(t) {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r > 127 {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// --- link book: where each title and episode lives on a service, learned as TV Mode goes ---

func linkKey(service, title string, se, ep int) string {
	k := service + "|" + normTitle(title)
	if se > 0 && ep > 0 {
		k += fmt.Sprintf("|%d|%d", se, ep)
	}
	return k
}

func (a *App) linksPath() string {
	if a.testRows() {
		return ""
	}
	return filepath.Join(filepath.Dir(a.recCachePath()), "links.json")
}

func (a *App) linkGet(k string) string {
	a.ld.mu.Lock()
	defer a.ld.mu.Unlock()
	return a.ld.links[k]
}

// linkWriteMu serialises links.json writes (marshal + tmp write + rename) so two puts never race on the tmp file.
var linkWriteMu sync.Mutex

func (a *App) linkPut(k, u string) {
	if u == "" {
		return
	}
	linkWriteMu.Lock()
	defer linkWriteMu.Unlock()
	a.ld.mu.Lock()
	if a.ld.links[k] == u {
		a.ld.mu.Unlock()
		return
	}
	a.ld.links[k] = u
	b, _ := json.Marshal(a.ld.links)
	a.ld.mu.Unlock()
	if p := a.linksPath(); p != "" {
		tmp := p + ".tmp"
		if os.WriteFile(tmp, b, 0o600) == nil {
			_ = os.Rename(tmp, p)
		}
	}
}

// hsPickJS finds the search result for a title (its label starts with the name; shows
// or movies by kind) and answers its page address.
const hsPickJS = `(function(t,k){function n(s){return (s||"").toLowerCase().replace(/[^a-z0-9\u0080-\uffff]/g,"")}var w=n(t),best="";
[].slice.call(document.querySelectorAll("a[href]")).some(function(a){var h=a.getAttribute("href")||"";if(!/\/(shows|movies)\/[^\/]+\/\d+/.test(h)||/\/watch/.test(h))return false;
if(h.indexOf("/"+k+"/")<0)return false;if(n(a.getAttribute("aria-label")||a.innerText).indexOf(w)===0){best=a.href.split("?")[0];return true}return false});return best})(%q,%q)`

// hsEpJS lists the episodes a show page shows (and opens season S, or More, when the
// wanted one is not there yet).
const hsEpJS = `(function(S,E){var all=[],hit="";[].slice.call(document.querySelectorAll("a[href*='/watch']")).forEach(function(a){var l=(a.getAttribute("aria-label")||a.innerText||"").replace(/\s+/g," ");var m=/\bS(\d+) E(\d+)\b/.exec(l);
if(m){var u=a.href.split("?")[0];all.push([+m[1],+m[2],u]);if(+m[1]===S&&+m[2]===E)hit=u}});
if(!hit){var bs=[].slice.call(document.querySelectorAll("button"));var b=bs.filter(function(b){return (b.innerText||"").trim()==="Season "+S})[0];
if(b&&b.getAttribute("aria-selected")!=="true"&&!b.__tvc){b.__tvc=1;b.click()}else{var m2=bs.filter(function(b){return /^(View More|More Episodes)$/i.test((b.innerText||"").trim())})[0];if(m2&&(m2.__tvc||0)<6){m2.__tvc=(m2.__tvc||0)+1;m2.click()}}}
return JSON.stringify({hit:hit,all:all,href:location.href})})(%d,%d)`

// walkStale: a search walk (hotstarGo, primeGo) stops only when a newer open took over
// (goGen moved on) or Back, Home or a service open came after it began, not on volume,
// arrows or other presses.
func (a *App) walkStale(gen int64, t0 int64) bool {
	return a.ld.goGen.Load() != gen || a.ld.lastNav.Load() > t0
}

// walkGaveUp: a walk that ended without opening anything must not leave the "opening"
// state up (the TV's own walk sets it through openAppAt). A newer open owns it, so it
// is left alone then.
func (a *App) walkGaveUp(gen int64, opened bool) {
	if opened || a.ld.goGen.Load() != gen {
		return
	}
	a.mu.Lock()
	a.opening = ""
	a.mu.Unlock()
}

// hotstarGo opens a JioHotstar title straight into the player: from the link book
// when TV Mode has been there, else through Hotstar's search and the show page,
// learning every episode link it passes. A step that fails leaves the closest page
// (the show, or the search with the title typed), never a dead end.
func (a *App) hotstarGo(n int, it tmdb.Item, se, ep int, gen int64) {
	t0 := time.Now().UnixMilli()
	name := it.Title
	if it.Kind == "tv" {
		if se == 0 {
			se, ep = 1, 1
		}
		name = fmt.Sprintf("%s  S%d E%d", it.Title, se, ep)
	}
	stale := func() bool { return a.walkStale(gen, t0) }
	opened := false
	defer func() { a.walkGaveUp(gen, opened) }()
	open := func(u string) {
		opened = true
		a.openAppAt(n, u)
		a.show("opening", map[string]any{"name": name})
	}
	poll := func(d time.Duration, f func() bool) bool {
		for end := time.Now().Add(d); time.Now().Before(end); time.Sleep(500 * time.Millisecond) {
			if stale() {
				return false
			}
			if f() {
				return true
			}
		}
		return false
	}
	resume := func(u string) { // an episode he started: carry on where he stopped
		if m := a.epMarkOf(it.Title, se, ep); it.Kind == "tv" && m.Pos > 0 {
			go a.resumeAt(history.Entry{Service: "jiohotstar", URL: u, Pos: m.Pos, Dur: m.Dur, Show: it.Title, Season: se, Episode: ep})
		}
	}
	if it.Kind == "tv" {
		if u := a.linkGet(linkKey("jiohotstar", it.Title, se, ep)); u != "" {
			open(u)
			resume(u)
			return
		}
	}
	// the walk to the episode happens in the hidden scout; the TV keeps the cover up
	a.show("opening", map[string]any{"name": name})
	w := a.newWalker(open)
	defer w.done()
	page := a.linkGet(linkKey("jiohotstar", it.Title, 0, 0))
	if page == "" {
		w.nav("https://www.hotstar.com/in/explore?search_query=" + url.QueryEscape(it.Title))
		kind := "movies"
		if it.Kind == "tv" {
			kind = "shows"
		}
		time.Sleep(1500 * time.Millisecond)
		if !poll(15*time.Second, func() bool {
			var h string
			if w.eval(fmt.Sprintf(hsPickJS, it.Title, kind), &h) == nil && h != "" {
				page = h
				return true
			}
			return false
		}) {
			log.Printf("hotstar: no search match for %q", it.Title)
			var miss string
			if !stale() && w.eval(fmt.Sprintf(searchMissJS, it.Title), &miss) == nil && miss == "miss" { // results like it came, none is it
				a.lacks("jiohotstar", it, se, ep, "not in its search")
			} else if !w.tv && !stale() {
				open("https://www.hotstar.com/in/explore?search_query=" + url.QueryEscape(it.Title))
			}
			return
		}
		a.linkPut(linkKey("jiohotstar", it.Title, 0, 0), page)
		a.availPut("jiohotstar", itemKey(it), true, "in its search")
	}
	if it.Kind != "tv" {
		open(strings.TrimSuffix(page, "/") + "/watch")
		return
	}
	w.nav(page)
	time.Sleep(1500 * time.Millisecond)
	var hit string
	poll(20*time.Second, func() bool {
		var raw string
		if w.eval(fmt.Sprintf(hsEpJS, se, ep), &raw) != nil {
			return false
		}
		var r struct {
			Hit string   `json:"hit"`
			All [][3]any `json:"all"`
		}
		_ = json.Unmarshal([]byte(raw), &r)
		for _, x := range r.All {
			s1, _ := x[0].(float64)
			e1, _ := x[1].(float64)
			u, _ := x[2].(string)
			a.linkPut(linkKey("jiohotstar", it.Title, int(s1), int(e1)), u)
		}
		hit = r.Hit
		return hit != ""
	})
	if hit == "" {
		log.Printf("hotstar: %s not found on the show page", name)
		if !w.tv && !stale() {
			open(page) // the closest page, so he is not left on the cover
		}
		return
	}
	open(hit)
	resume(hit)
}

// linkEpisode finds season and episode of a watch address in the link book.
func (a *App) linkEpisode(service, u string) (int, int) {
	u = strings.SplitN(u, "?", 2)[0]
	a.ld.mu.Lock()
	defer a.ld.mu.Unlock()
	for k, v := range a.ld.links {
		if v != u || !strings.HasPrefix(k, service+"|") {
			continue
		}
		parts := strings.Split(k, "|")
		if len(parts) == 4 {
			se, _ := strconv.Atoi(parts[2])
			ep, _ := strconv.Atoi(parts[3])
			return se, ep
		}
	}
	return 0, 0
}

// watchedNames is every title he has played: in history (half-watched, dropped) or in
// the library as watching, finished or dropped. Plain history alone is not enough: a
// title at 95 percent is removed from history, so a finished film was recommended again.
// Keys are normTitle of the show or movie, and the TMDB key (tv123) when the library knows it.
// New picks leave these out. YouTube and "last opened" placeholders are not titles.
func watchedNames(hl []history.Entry, st *library.Store) map[string]bool {
	m := map[string]bool{}
	add := func(names ...string) {
		for _, n := range names {
			if k := normTitle(n); k != "" {
				m[k] = true
			}
		}
	}
	for _, e := range hl {
		if !e.Opened && e.Service != "youtube" {
			add(e.Show, e.Title)
		}
	}
	if st != nil {
		for _, it := range st.List("") {
			if it.State == library.Saved || it.Kind == "yt" || it.Kind == "other" {
				continue
			}
			if isTmdbKey(it.ID) {
				m[it.ID] = true
			}
			add(libFirst(it.Show, it.Title))
		}
	}
	return m
}

func isHeld(held map[string]bool, it tmdb.Item) bool {
	return held[itemKey(it)] || held[normTitle(it.Title)]
}

// dropWatched returns data without the titles in held; the input is not changed.
func dropWatched(d recData, held map[string]bool) recData {
	if len(held) == 0 {
		return d
	}
	cut := func(l []tmdb.Item) []tmdb.Item {
		out := make([]tmdb.Item, 0, len(l))
		for _, it := range l {
			if !isHeld(held, it) {
				out = append(out, it)
			}
		}
		return out
	}
	out := recData{Occasions: map[string][]tmdb.Item{}}
	for _, s := range d.Shelves {
		s.Items = cut(s.Items)
		out.Shelves = append(out.Shelves, s)
	}
	for k, l := range d.Occasions {
		out.Occasions[k] = cut(l)
	}
	return out
}

// oldShelf is the row of the last good refresh.
func (a *App) oldShelf(id string) (shelf, bool) {
	a.ld.mu.Lock()
	defer a.ld.mu.Unlock()
	for _, s := range a.ld.data.Shelves {
		if s.ID == id {
			return s, true
		}
	}
	return shelf{}, false
}
