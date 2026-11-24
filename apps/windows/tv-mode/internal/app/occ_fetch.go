package app

import (
	"encoding/json"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"tvmode/internal/occasion"
	"tvmode/internal/tmdb"
)

// Candidates for the occasion shelves (HUB-DIRECTION 3.6). Four signals feed one
// pool per node: genre and language, curated seed titles, TMDB keywords, and the
// films that opened in this occasion's week in past years. Everything is cached,
// stage by stage, so a refresh spends only what is left of the 180-call budget
// and the pool fills over a few refreshes without starving the other rows.

const occCallCap = 179 // under 180 TMDB calls in one refreshRec, base rows included

type occPool struct {
	Items []tmdb.Item      `json:"items"`
	Stage map[string]int64 `json:"stage"` // stage -> unix time it last completed
}

type seedHit struct {
	Item tmdb.Item `json:"item"`
	Miss bool      `json:"miss,omitempty"`
	At   int64     `json:"at"`
}

type occCache struct {
	mu    sync.Mutex
	path  string
	Pools map[string]*occPool `json:"pools"`
	Seeds map[string]seedHit  `json:"seeds"`
}

func newOccCache(path string) *occCache {
	c := &occCache{path: path, Pools: map[string]*occPool{}, Seeds: map[string]seedHit{}}
	if path != "" {
		if b, err := os.ReadFile(path); err == nil {
			_ = json.Unmarshal(b, c)
		}
	}
	if c.Pools == nil {
		c.Pools = map[string]*occPool{}
	}
	if c.Seeds == nil {
		c.Seeds = map[string]seedHit{}
	}
	return c
}

func (c *occCache) save() {
	if c.path == "" {
		return
	}
	c.mu.Lock()
	b, err := json.Marshal(struct {
		Pools map[string]*occPool `json:"pools"`
		Seeds map[string]seedHit  `json:"seeds"`
	}{c.Pools, c.Seeds})
	c.mu.Unlock()
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(c.path), 0o700)
	if os.WriteFile(c.path+".tmp", b, 0o600) == nil {
		_ = os.Rename(c.path+".tmp", c.path)
	}
}

func (c *occCache) pool(id string) *occPool {
	p := c.Pools[id]
	if p == nil {
		p = &occPool{Stage: map[string]int64{}}
		c.Pools[id] = p
	}
	if p.Stage == nil {
		p.Stage = map[string]int64{}
	}
	return p
}

func (p *occPool) due(stage string, ttl time.Duration) bool {
	return time.Since(time.Unix(p.Stage[stage], 0)) >= ttl
}

// tvGenre maps the movie genre ids the nodes list to TMDB's tv ids (0: none).
var tvGenre = map[int]int{28: 10759, 12: 10759, 878: 10765, 14: 10765, 53: 9648, 80: 80, 18: 18, 35: 35, 10751: 10751, 16: 16, 99: 99, 9648: 9648, 10752: 10768, 37: 37}

func genreOr(ids []int, tv bool) string {
	var s []string
	seen := map[int]bool{}
	for _, g := range ids {
		if tv {
			g = tvGenre[g]
		}
		if g != 0 && !seen[g] {
			seen[g] = true
			s = append(s, strconv.Itoa(g))
		}
	}
	return strings.Join(s, "|")
}

func nodeKinds(n occasion.Node) []string {
	if len(n.Kinds) == 0 {
		return []string{"movie", "tv"}
	}
	return n.Kinds
}

type occBudget struct {
	left  int
	calls int
}

func (b *occBudget) spend() bool {
	if b.left <= 0 {
		return false
	}
	b.left--
	b.calls++
	return true
}

// occFetch fills the pools of the nodes whose window is open or opens within 14
// days (at most three per refresh) and returns every pool the page may show.
func (a *App) occFetch(c *tmdb.Client, used, reserve int) map[string][]tmdb.Item {
	o := a.ld.occ
	if o == nil || c == nil {
		return nil
	}
	now := a.now()
	b := &occBudget{left: occCallCap - used - reserve}
	ns := o.cal.Upcoming(now, 14)
	out := map[string][]tmdb.Item{}
	for i, n := range ns {
		if i < 3 {
			a.occFetchNode(c, n, now, b)
		}
		o.cache.mu.Lock()
		if p := o.cache.Pools[n.ID]; p != nil && len(p.Items) > 0 {
			out[n.ID] = append([]tmdb.Item(nil), p.Items...)
		}
		o.cache.mu.Unlock()
	}
	o.cache.save()
	if b.calls > 0 || used > 0 {
		// the reserve is what updateBecause may spend straight after (1 search, 1 recommendations, up to 20 details)
		log.Printf("occasion: refresh budget %d TMDB calls at most (%d for rows, %d for occasions, %d held for Because you watched, cap %d)", used+b.calls+reserve, used, b.calls, reserve, occCallCap+1)
	}
	return out
}

func (a *App) occFetchNode(c *tmdb.Client, n occasion.Node, now time.Time, b *occBudget) {
	o := a.ld.occ
	o.cache.mu.Lock()
	p := o.cache.pool(n.ID)
	o.cache.mu.Unlock()
	minVotes := "50"
	if n.MinVotes > 0 {
		minVotes = strconv.Itoa(n.MinVotes)
	}
	var got [][]tmdb.Item
	finish := func(stage string, ok bool) {
		o.cache.mu.Lock()
		if ok {
			p.Stage[stage] = time.Now().Unix()
		}
		p.Items = tmdb.Merge(40, "score", append(got, p.Items)...) // fresh answers first
		got = nil
		o.cache.mu.Unlock()
	}
	keep := func(l []tmdb.Item, err error) []tmdb.Item {
		if err != nil {
			return nil
		}
		var out []tmdb.Item
		for _, it := range l {
			if (it.Backdrop != "" || it.Poster != "") && it.Votes >= 10 {
				out = append(out, it)
			}
		}
		return out
	}

	// 1. genre and language: cheap and always something
	if (len(n.Genres) > 0 || len(n.Langs) > 0) && p.due("gl", 3*24*time.Hour) {
		ok := true
		for _, kind := range nodeKinds(n) {
			if kind == "tv" && len(nodeKinds(n)) > 1 {
				continue // the proxy asks for films; series come from keywords, seeds and a tv-only node
			}
			q := vals("vote_count.gte", minVotes)
			if g := genreOr(n.Genres, kind == "tv"); g != "" {
				q.Set("with_genres", g)
			} else if len(n.Genres) > 0 {
				continue
			}
			if len(n.Langs) > 0 {
				q.Set("with_original_language", n.Langs[0])
			}
			for _, pr := range providers {
				if !b.spend() {
					ok = false
					break
				}
				l, err := c.Discover(kind, pr.ids, "IN", pr.svc, 20, q)
				if err != nil {
					ok = false
				}
				got = append(got, keep(l, err))
			}
		}
		finish("gl", ok)
	}

	// 2. curated seed titles, kept only when they stream on one of his apps
	for _, t := range n.Titles {
		if it, hit, done := a.occSeed(c, t, b); hit {
			got = append(got, []tmdb.Item{it})
		} else if !done {
			break
		}
	}
	if len(got) > 0 {
		finish("seed", false)
	}

	// 3. TMDB keywords
	if len(n.Keywords) > 0 && p.due("kw", 3*24*time.Hour) {
		var ids []string
		ok := true
		for i, name := range n.Keywords {
			if i >= 3 {
				break
			}
			if !c.KeywordCached(name) && !b.spend() {
				ok = false
				break
			}
			if id, err := c.Keyword(name); err != nil {
				ok = false
			} else if id > 0 {
				ids = append(ids, strconv.Itoa(id))
			}
		}
		if ok && len(ids) > 0 {
			q := vals("with_keywords", strings.Join(ids, "|"), "vote_count.gte", "10")
			for _, kind := range nodeKinds(n) {
				for _, pr := range providers {
					if !b.spend() {
						ok = false
						break
					}
					l, err := c.Discover(kind, pr.ids, "IN", pr.svc, 20, q)
					if err != nil {
						ok = false
					}
					got = append(got, keep(l, err))
				}
			}
		}
		finish("kw", ok)
	}

	// 4. films that opened in this occasion's week in past years (cached a year)
	if w := n.Release; w != nil {
		anchor := w.Anchor
		if anchor == "" {
			anchor = n.ID
		}
		for _, d := range o.cal.PastDates(anchor, w.Years, now) {
			stage := "rel:" + strconv.Itoa(d.Year())
			if !p.due(stage, 365*24*time.Hour) {
				continue
			}
			q := url.Values{}
			q.Set("with_original_language", w.Lang)
			q.Set("primary_release_date.gte", d.AddDate(0, 0, -w.Before).Format("2006-01-02"))
			q.Set("primary_release_date.lte", d.AddDate(0, 0, w.After).Format("2006-01-02"))
			q.Set("sort_by", "vote_count.desc")
			q.Set("vote_count.gte", "20")
			ok := true
			for _, pr := range providers {
				if !b.spend() {
					ok = false
					break
				}
				l, err := c.Discover("movie", pr.ids, "IN", pr.svc, 10, q)
				if err != nil {
					ok = false
				}
				got = append(got, keep(l, err))
			}
			finish(stage, ok)
			if b.left <= 0 {
				break
			}
		}
	}
	o.cache.mu.Lock()
	n0 := len(p.Items)
	o.cache.mu.Unlock()
	log.Printf("occasion: pool %s has %d titles (budget left %d)", n.ID, n0, b.left)
}

// occSeed resolves one seed title on TMDB (one Find, and one Details when no row
// knows where it streams), cached 30 days (3 days when it was not found or not
// on his apps). done is false when the budget ran out before an answer.
func (a *App) occSeed(c *tmdb.Client, title string, b *occBudget) (it tmdb.Item, hit, done bool) {
	o := a.ld.occ
	o.cache.mu.Lock()
	s, ok := o.cache.Seeds[title]
	o.cache.mu.Unlock()
	age := time.Since(time.Unix(s.At, 0))
	if ok && ((!s.Miss && age < 30*24*time.Hour) || (s.Miss && age < 3*24*time.Hour)) {
		return s.Item, !s.Miss, true
	}
	store := func(it tmdb.Item, miss bool) {
		o.cache.mu.Lock()
		o.cache.Seeds[title] = seedHit{Item: it, Miss: miss, At: time.Now().Unix()}
		o.cache.mu.Unlock()
	}
	if !b.spend() {
		return tmdb.Item{}, false, false
	}
	l, err := c.Find(title)
	if err != nil {
		return tmdb.Item{}, false, true // a network blip: try again next refresh, not stored
	}
	want := normTitle(title)
	var found tmdb.Item
	for _, x := range l {
		if normTitle(x.Title) == want && (x.Backdrop != "" || x.Poster != "") && x.Votes >= 30 {
			found = x
			break
		}
	}
	if found.ID == 0 {
		store(tmdb.Item{}, true)
		return tmdb.Item{}, false, true
	}
	key := itemKey(found)
	var listed []string
	a.ld.mu.Lock()
	if known, have := a.ld.byKey[key]; have && known.Service != "" {
		listed = []string{known.Service}
	} else if d, have := a.ld.details[key]; have && d.Services != nil {
		listed = d.Services
	}
	a.ld.mu.Unlock()
	if listed == nil {
		if !b.spend() {
			return tmdb.Item{}, false, false
		}
		d, err := c.Details(found.Kind, found.ID)
		if err != nil {
			return tmdb.Item{}, false, true
		}
		a.ld.mu.Lock()
		a.ld.details[key] = d
		a.ld.mu.Unlock()
		listed = d.Services
	}
	order := a.svcOrder(key, found.Title, listed)
	if len(listed) == 0 || len(order) == 0 {
		store(tmdb.Item{}, true) // not on his apps: dropped silently
		return tmdb.Item{}, false, true
	}
	found.Service = order[0]
	store(found, false)
	return found, true, true
}

// becauseReserve is what updateBecause will spend right after this refresh: 1 search,
// 1 recommendations and up to 20 details when the newest real title is new to it.
// The occasion budget leaves that room, so one refresh stays under 180 calls in all.
func (a *App) becauseReserve() int {
	e, ok := becauseSource(a.ld.hist.List())
	a.ld.mu.Lock()
	same := e.Title == a.ld.becFor
	a.ld.mu.Unlock()
	if !ok || same {
		return 0
	}
	return 22
}
