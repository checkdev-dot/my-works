package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"tvmode/internal/history"
	"tvmode/internal/tmdb"
)

// epMark is how far Dev got in one episode, on whichever service he watched it.
type epMark struct {
	Svc string `json:"svc"`
	Pos int    `json:"pos"`
	Dur int    `json:"dur"`
	At  int64  `json:"at"`
}

func (m epMark) pct() float64 {
	if m.Dur <= 0 {
		return 0
	}
	return float64(m.Pos) / float64(m.Dur)
}

// epBook keeps every episode's progress (history keeps only the latest per show), so
// the episodes screen can mark each one and know which comes next. episodes.json.
type epBook struct {
	mu     sync.Mutex
	path   string
	m      map[string]epMark // normTitle(show)|season|episode
	loaded bool
	season map[string]seasonCache
}

type seasonCache struct {
	eps []tmdb.Episode
	at  time.Time
}

var eps = &epBook{m: map[string]epMark{}, season: map[string]seasonCache{}}

func epKey(show string, se, ep int) string { return fmt.Sprintf("%s|%d|%d", normTitle(show), se, ep) }

func (a *App) epLoad() {
	if eps.loaded {
		return
	}
	eps.loaded = true
	if a.testRows() {
		return
	}
	eps.path = filepath.Join(filepath.Dir(a.recCachePath()), "episodes.json")
	if b, err := os.ReadFile(eps.path); err == nil {
		_ = json.Unmarshal(b, &eps.m)
	}
}

// markEpisode records progress of a series episode from a history update.
func (a *App) markEpisode(e history.Entry) {
	if e.Show == "" || e.Season <= 0 || e.Episode <= 0 || e.Dur <= 0 {
		return
	}
	eps.mu.Lock()
	a.epLoad()
	k := epKey(e.Show, e.Season, e.Episode)
	old := eps.m[k]
	eps.m[k] = epMark{Svc: e.Service, Pos: e.Pos, Dur: e.Dur, At: time.Now().Unix()}
	var b []byte
	if eps.path != "" && (old.Pos/30 != e.Pos/30 || old.Svc != e.Service) { // write every 30 s of progress
		b, _ = json.Marshal(eps.m)
	}
	p := eps.path
	eps.mu.Unlock()
	if b != nil {
		if os.WriteFile(p+".tmp", b, 0o600) == nil {
			_ = os.Rename(p+".tmp", p)
		}
	}
}

// nextEpisode is where to carry on with a show: the episode watched last, or the one
// after it when that one is (nearly) finished. 0, 0 when he never watched it.
func (a *App) nextEpisode(show string, seasons int) (se, ep int, m epMark) {
	eps.mu.Lock()
	a.epLoad()
	prefix := normTitle(show) + "|"
	var best epMark
	for k, v := range eps.m {
		if len(k) > len(prefix) && k[:len(prefix)] == prefix && v.At > best.At {
			var s1, e1 int
			if _, err := fmt.Sscanf(k[len(prefix):], "%d|%d", &s1, &e1); err == nil {
				best, se, ep = v, s1, e1
			}
		}
	}
	eps.mu.Unlock()
	if se == 0 {
		return 0, 0, epMark{}
	}
	if best.pct() > 0.92 {
		return se, ep + 1, epMark{} // the season list says if it exists; else the next season
	}
	return se, ep, best
}

func (a *App) seasonEps(id, n int) ([]tmdb.Episode, error) {
	k := fmt.Sprintf("%d|%d", id, n)
	eps.mu.Lock()
	c, ok := eps.season[k]
	eps.mu.Unlock()
	if ok && time.Since(c.at) < 24*time.Hour {
		return c.eps, nil
	}
	if a.testRows() {
		var l []tmdb.Episode
		for i := 1; i <= 8; i++ {
			l = append(l, tmdb.Episode{N: i, Name: fmt.Sprintf("Episode %d", i), Overview: "A canned episode.", Runtime: 22, Air: "2024-01-0" + strconv.Itoa(i%9+1)})
		}
		return l, nil
	}
	if a.ld.tm == nil {
		return nil, fmt.Errorf("no tmdb")
	}
	l, err := a.ld.tm.Season(id, n)
	if err != nil {
		return nil, err
	}
	eps.mu.Lock()
	eps.season[k] = seasonCache{eps: l, at: time.Now()}
	eps.mu.Unlock()
	return l, nil
}

type epOut struct {
	N     int     `json:"n"`
	Name  string  `json:"name"`
	Over  string  `json:"over,omitempty"`
	Min   int     `json:"min,omitempty"`
	Img   string  `json:"img,omitempty"`
	Air   string  `json:"air,omitempty"`
	Pct   float64 `json:"pct,omitempty"`
	Seen  string  `json:"seen,omitempty"`  // the service he watched it on
	Known bool    `json:"known,omitempty"` // TV Mode knows its exact page: opens at once
}

// episodesHandler answers /api/episodes?key=tv123&n=2 (n 0: the season to carry on in)
// with the season's episodes, his progress on each, and the one to carry on with.
func (a *App) episodesHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	key := r.URL.Query().Get("key")
	n, _ := strconv.Atoi(r.URL.Query().Get("n"))
	out, code := a.episodesFor(key, n)
	switch code {
	case http.StatusNotFound:
		http.Error(w, `{"error":"not a series"}`, code)
		return
	case http.StatusBadGateway:
		http.Error(w, `{"error":"unavailable"}`, code)
		return
	}
	_ = json.NewEncoder(w).Encode(out)
}

// episodeList is one season of a series with his progress (the launcher's and the phone's).
type episodeList struct {
	Key     string  `json:"key"`
	Title   string  `json:"title"`
	Season  int     `json:"season"`
	Seasons int     `json:"seasons"`
	NextSe  int     `json:"nextSe"`
	NextEp  int     `json:"nextEp"`
	Svc     string  `json:"svc"`
	Exact   bool    `json:"exact"` // OK lands on the exact episode in svc
	Eps     []epOut `json:"eps"`
}

// episodesFor builds season n (0: the one to carry on in); the int is an HTTP status (200 ok).
func (a *App) episodesFor(key string, n int) (episodeList, int) { return a.episodesForSvc(key, n, "") }

// episodesForSvc is episodesFor with the service the show is playing on: a tap on an
// episode then opens it there (prefer), not on whichever app the panel ranks first.
func (a *App) episodesForSvc(key string, n int, prefer string) (episodeList, int) {
	a.ld.mu.Lock()
	it, ok := a.ld.byKey[key]
	d := a.ld.details[key]
	a.ld.mu.Unlock()
	// a library title no row carries today (The Middle, 2026-11-12): TMDB knows it.
	// Only his own library's titles, so a page looping over ids spends no TMDB calls.
	if !ok && strings.HasPrefix(key, "tv") && a.ld.tm != nil && a.ld.lib != nil && !a.testRows() {
		if _, mine := a.ld.lib.Lookup(key); mine {
			if id, err := strconv.Atoi(key[2:]); err == nil && id > 0 {
				if dd, err := a.ld.tm.Details("tv", id); err == nil && dd.Title != "" {
					it, ok, d = tmdb.Item{Kind: "tv", ID: id, Title: dd.Title}, true, dd
					a.ld.mu.Lock()
					a.ld.byKey[key], a.ld.extra[key] = it, it
					a.ld.details[key] = dd
					a.ld.mu.Unlock()
				}
			}
		}
	}
	if !ok || it.Kind != "tv" {
		return episodeList{}, http.StatusNotFound
	}
	if d.Seasons == 0 && a.ld.tm != nil && !a.testRows() {
		if dd, err := a.ld.tm.Details("tv", it.ID); err == nil {
			d = dd
		}
	}
	seasons := d.Seasons
	if seasons <= 0 {
		seasons = 1
	}
	nse, nep, _ := a.nextEpisode(it.Title, seasons)
	if n <= 0 {
		n = nse
		if n <= 0 {
			n = 1
		}
	}
	l, err := a.seasonEps(it.ID, n)
	if err != nil {
		return episodeList{}, http.StatusBadGateway
	}
	// past the last episode of a season: the next one starts the next season
	if nse > 0 && nse < seasons && n == nse && nep > len(l) {
		nse, nep = nse+1, 1
	}
	svc := it.Service // the panel's order (svcOrder), so the marks and the flag match it
	if d.Services != nil {
		svc = ""
		if o := a.svcOrder(key, it.Title, d.Services); len(o) > 0 {
			svc = o[0]
		}
	}
	if prefer == "jiohotstar" || prefer == "prime" || prefer == "netflix" {
		svc = prefer
	}
	out := episodeList{Key: key, Title: it.Title, Season: n, Seasons: seasons, NextSe: nse, NextEp: nep, Svc: svc, Exact: svc == "jiohotstar" || svc == "prime" || svc == "netflix", Eps: []epOut{}}
	eps.mu.Lock()
	marks := make(map[int]epMark, len(l))
	for _, e := range l {
		if m, ok := eps.m[epKey(it.Title, n, e.N)]; ok {
			marks[e.N] = m
		}
	}
	eps.mu.Unlock()
	for _, e := range l {
		o := epOut{N: e.N, Name: e.Name, Over: e.Overview, Min: e.Runtime, Air: e.Air, Img: a.tmdbImg(e.Still, "w500")}
		if m, ok := marks[e.N]; ok {
			o.Pct, o.Seen = m.pct(), m.Svc
		}
		o.Known = svc != "" && a.linkGet(linkKey(svc, it.Title, n, e.N)) != ""
		out.Eps = append(out.Eps, o)
	}
	return out, http.StatusOK
}

// epMarkOf is the saved progress of one episode.
func (a *App) epMarkOf(show string, se, ep int) epMark {
	eps.mu.Lock()
	defer eps.mu.Unlock()
	a.epLoad()
	return eps.m[epKey(show, se, ep)]
}
