package app

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"tvmode/internal/taste"
)

// Watched marks: Dev says he has seen a title and whether he liked it. It is the
// strongest thing the feed learns from (stronger than watching it through), and a
// marked title stops being suggested. Kept in rated.json next to taste.json.

const (
	rateLiked    = 1.5  // more than finishing it: he told us
	rateDisliked = -1.2 // more than leaving early
)

type rating struct {
	V       int    `json:"v"` // 1 liked, -1 did not like
	At      int64  `json:"at"`
	Title   string `json:"title"`
	Service string `json:"service,omitempty"`
	Kind    string `json:"kind,omitempty"`
}

type ratedStore struct {
	mu   sync.Mutex
	path string
	m    map[string]rating
}

func openRated(path string) *ratedStore {
	s := &ratedStore{path: path, m: map[string]rating{}}
	if path != "" {
		if b, err := os.ReadFile(path); err == nil {
			_ = json.Unmarshal(b, &s.m)
		}
	}
	return s
}

func (s *ratedStore) get(key string) (rating, bool) {
	if s == nil {
		return rating{}, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.m[key]
	return r, ok
}

func (s *ratedStore) set(key string, r rating, del bool) {
	s.mu.Lock()
	if del {
		delete(s.m, key)
	} else {
		s.m[key] = r
	}
	b, _ := json.MarshalIndent(s.m, "", " ")
	path := s.path
	s.mu.Unlock()
	if path == "" {
		return
	}
	_ = os.MkdirAll(filepath.Dir(path), 0o700)
	if tmp := path + ".tmp"; os.WriteFile(tmp, b, 0o600) == nil {
		_ = os.Rename(tmp, path)
	}
}

// isRated: the title is marked watched, so the rows and the banner leave it out.
func (a *App) isRated(key string) bool {
	if a.ld == nil {
		return false
	}
	_, ok := a.ld.rated.get(key)
	return ok
}

// rate marks a title watched: v 1 liked, -1 did not like, 0 takes the mark off.
// Changing a mark first takes the old one back out of the taste profile.
func (a *App) rate(key string, v int) {
	a.ld.mu.Lock()
	it, ok := a.ld.byKey[key]
	a.ld.mu.Unlock()
	if !ok {
		return
	}
	strength := func(v int) float64 {
		switch v {
		case 1:
			return rateLiked
		case -1:
			return rateDisliked
		}
		return 0
	}
	old, had := a.ld.rated.get(key)
	if had && old.V == v {
		return
	}
	if had {
		a.ld.taste.Learn(tasteOf(it, ""), -strength(old.V))
	}
	if v == 0 {
		a.ld.rated.set(key, rating{}, true)
	} else {
		a.ld.taste.Learn(tasteOf(it, ""), strength(v))
		a.ld.rated.set(key, rating{V: v, At: time.Now().Unix(), Title: it.Title, Service: it.Service, Kind: it.Kind}, false)
	}
	log.Printf("watched: %q marked %d", it.Title, v)
	a.pushRows()
}

var _ = taste.Played // the strengths above sit on the same scale as taste's

// ratedHandler answers /api/rated?key= with the title's mark: {"v":1|-1|0}.
func (a *App) ratedHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	v := 0
	if a.ld != nil {
		if rt, ok := a.ld.rated.get(r.URL.Query().Get("key")); ok {
			v = rt.V
		}
	}
	_ = json.NewEncoder(w).Encode(map[string]int{"v": v})
}
