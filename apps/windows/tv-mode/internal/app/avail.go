package app

import (
	"encoding/json"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"tvmode/internal/tmdb"
)

// TMDB's "where to watch in India" lags the apps (The Office still listed on Prime
// in 2026-11 when Dev found it only on Netflix), so TV Mode keeps its own verdicts,
// taken from what each app's own pages showed while it was opening a title:
//   yes: the app found the title (or he watched it there)
//   no:  the app's search answered with things like it but not it, or its signed-in
//        page only rents or sells it
// A page that never loaded, or a signed-out page, says nothing. Verdicts are per
// title id ("The Office" is five different shows) and lapse as catalogs change:
// yes after 30 days, no after 14. avail.json.

type availMark struct {
	OK  bool   `json:"ok"`
	At  int64  `json:"at"`
	Why string `json:"why,omitempty"`
}

type availBook struct {
	mu     sync.Mutex
	path   string
	m      map[string]availMark // service|kind+id
	loaded bool
}

var avail = &availBook{m: map[string]availMark{}}

func (a *App) availLoad() {
	if avail.loaded {
		return
	}
	avail.loaded = true
	if a.testRows() || a.o.Test {
		return
	}
	avail.path = filepath.Join(filepath.Dir(a.recCachePath()), "avail.json")
	if b, err := os.ReadFile(avail.path); err == nil {
		_ = json.Unmarshal(b, &avail.m)
	}
}

// availGet is the live verdict for a title (its key, "tv2316"): 1 yes, -1 no, 0 not known.
func (a *App) availGet(svc, key string) int {
	avail.mu.Lock()
	defer avail.mu.Unlock()
	a.availLoad()
	m, ok := avail.m[svc+"|"+key]
	if !ok {
		return 0
	}
	age := time.Since(time.Unix(m.At, 0))
	switch {
	case m.OK && age < 30*24*time.Hour:
		return 1
	case !m.OK && age < 14*24*time.Hour:
		return -1
	}
	return 0
}

func (a *App) availPut(svc, key string, ok bool, why string) {
	if svc == "" || key == "" || key == "tv0" || key == "movie0" {
		return
	}
	avail.mu.Lock()
	a.availLoad()
	k := svc + "|" + key
	old, had := avail.m[k]
	avail.m[k] = availMark{OK: ok, At: time.Now().Unix(), Why: why}
	var b []byte
	if avail.path != "" && (!had || old.OK != ok || time.Since(time.Unix(old.At, 0)) > 24*time.Hour) {
		b, _ = json.Marshal(avail.m)
	}
	p := avail.path
	avail.mu.Unlock()
	if !had || old.OK != ok {
		log.Printf("avail: %s %s %s (%s)", svc, map[bool]string{true: "has", false: "lacks"}[ok], key, why)
	}
	if b != nil && os.WriteFile(p+".tmp", b, 0o600) == nil {
		_ = os.Rename(p+".tmp", p)
	}
}

// svcRank is the order when nothing else tells (his history is too short to rank by).
var svcRank = map[string]int{"netflix": 0, "jiohotstar": 1, "prime": 2}

// svcOrder is where a title streams for Dev, best first: an app he watched it on,
// one that showed it, then TMDB's list in svcRank order. Apps seen lacking it are
// dropped.
func (a *App) svcOrder(key, title string, listed []string) []string {
	type c struct {
		s     string
		score int
	}
	var l []c
	seen := map[string]bool{}
	add := func(s string, must bool) {
		if seen[s] || s == "" {
			return
		}
		v := a.availGet(s, key)
		w := false
		if a.ld != nil && a.ld.hist != nil {
			_, w = a.watched(s, title)
		}
		if v < 0 && !w || !must && v <= 0 && !w {
			return
		}
		seen[s] = true
		score := 0
		if w {
			score += 1000
		}
		if v > 0 {
			score += 500
		}
		l = append(l, c{s, score})
	}
	for _, s := range listed {
		add(s, true)
	}
	for s := range svcRank { // TMDB may not list it where he watched it or an app showed it
		add(s, false)
	}
	sort.SliceStable(l, func(i, j int) bool {
		if l[i].score != l[j].score {
			return l[i].score > l[j].score
		}
		return svcRank[l[i].s] < svcRank[l[j].s]
	})
	out := make([]string, 0, len(l))
	for _, x := range l {
		out = append(out, x.s)
	}
	return out
}

// bestSvc is the app a title shows and opens in ("" when none of his has it).
func (a *App) bestSvc(key, title, fallback string) string {
	a.ld.mu.Lock()
	d, ok := a.ld.details[key]
	a.ld.mu.Unlock()
	listed := []string{fallback}
	if ok && d.Services != nil {
		listed = d.Services
	}
	if o := a.svcOrder(key, title, listed); len(o) > 0 {
		return o[0]
	}
	if ok && d.Services != nil {
		return ""
	}
	if a.availGet(fallback, key) < 0 {
		return ""
	}
	return fallback
}

// lacks records that an app does not have a title and opens the next app that may,
// saying so on the cover. from is the app that turned out to lack it.
func (a *App) lacks(from string, it tmdb.Item, se, ep int, why string) {
	key := itemKey(it)
	a.availPut(from, key, false, why)
	next := a.bestSvc(key, it.Title, "")
	if next == "" || next == from {
		a.show("opening", map[string]any{"name": "Not on " + svcNames[from] + ", nor on your other apps"})
		return
	}
	log.Printf("avail: %s not on %s, trying %s", it.Title, from, next)
	a.show("opening", map[string]any{"name": "Not on " + svcNames[from] + ": opening in " + svcNames[next]})
	a.ld.mu.Lock()
	a.ld.byKey[key] = it
	a.ld.mu.Unlock()
	time.Sleep(1200 * time.Millisecond)
	a.openItem("item", key, 0, next, se, ep)
}

// encodeDetails answers /api/title with the apps in Dev's order (svcOrder), not
// TMDB's raw list; the cache keeps TMDB's.
func (a *App) encodeDetails(w io.Writer, key string, d tmdb.Details) {
	if d.Services != nil {
		d.Services = a.svcOrder(key, d.Title, d.Services)
	}
	_ = json.NewEncoder(w).Encode(d)
}

// searchMissJS reads a search page for a title: "hit" when a result is named it (or
// starts with it), "miss" only when results like it came back (a word in common)
// and none is it; "" while it loads or when the page shows nothing to go by
// (recommendation rows alone prove nothing).
const searchMissJS = `(function(t){function n(s){return (s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}
var w=n(t),words=w.split(" ").filter(function(x){return x.length>2&&["the","and","of"].indexOf(x)<0}),near=0,hit=false;
[].slice.call(document.querySelectorAll("a[href*='/detail/'],a[href*='/shows/'],a[href*='/movies/'],a[href*='/watch/'],a[href*='/title/']")).forEach(function(a){
var l=n(a.getAttribute("aria-label")||a.innerText);if(!l)return;if(l===w||l.indexOf(w+" ")===0)hit=true;
var lw=l.split(" ");if(words.some(function(x){return lw.indexOf(x)>=0}))near++});
return hit?"hit":near>=2?"miss":""})(%q)`
