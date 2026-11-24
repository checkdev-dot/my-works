package app

// Phase 5, "Your year": the recap on the desk rail, worked out from the library alone
// (items and events), plus the genres the app already has cached. It fetches nothing
// and invents nothing: a figure with too little behind it is left out ("Not enough
// yet"), and a record that starts in November says so ("Since 4 Nov").

import (
	"net/http"
	"sort"
	"strings"
	"time"

	"tvmode/internal/library"
)

type yearStat struct {
	Name string `json:"name"`
	N    int    `json:"n"`
	Of   int    `json:"of"`
}

type yearLong struct {
	Title    string  `json:"title"`
	Episodes int     `json:"episodes"`
	Hours    float64 `json:"hours"`
}

type yearMonth struct {
	M     int  `json:"m"`
	N     int  `json:"n"`
	Known bool `json:"known"` // false: the record had not started, or the month has not come
	Past  bool `json:"past"`  // true: before the record began (not the future)
}

type yearPick struct {
	Title string `json:"title"`
	Img   string `json:"img"`
	Svc   string `json:"svc"`
}

type yearRecap struct {
	Year       int         `json:"year"`
	Empty      bool        `json:"empty"` // nothing in the library yet
	SinceMs    int64       `json:"sinceMs"`
	Partial    bool        `json:"partial"` // the record began after the first week of the year
	Finished   int         `json:"finished"`
	Dropped    int         `json:"dropped"`
	Hours      float64     `json:"hours"`
	HoursKnown bool        `json:"hoursKnown"`
	TopGenre   *yearStat   `json:"topGenre"`
	DropGenre  *yearStat   `json:"dropGenre"`
	Longest    *yearLong   `json:"longest"`
	TopSvc     *yearStat   `json:"topSvc"`
	Months     []yearMonth `json:"months"`
	Picks      []yearPick  `json:"picks"`
}

// d5Year works the recap out. genres says what the app knows of a title's genres (nil
// for none); name turns a service id into a word; img turns a source address into one
// the page may ask for.
func d5Year(items []library.Item, events []library.Event, genres func(id string) []string, name func(string) string, img func(string) string, now time.Time) yearRecap {
	y0 := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
	y1 := y0.AddDate(1, 0, 0)
	in := func(ms int64) bool { return ms > 0 && !time.UnixMilli(ms).Before(y0) && time.UnixMilli(ms).Before(y1) }
	r := yearRecap{Year: now.Year(), Months: make([]yearMonth, 12), Picks: []yearPick{}}
	if len(items) == 0 {
		r.Empty = true
	}

	// when the record began: the earliest item or event of the year
	since := int64(0)
	note := func(ms int64) {
		if ms > 0 && (since == 0 || ms < since) {
			since = ms
		}
	}
	for _, it := range items {
		note(it.Added)
	}
	for _, e := range events {
		note(e.At)
	}
	if since > 0 && time.UnixMilli(since).Before(y0) {
		since = y0.UnixMilli()
	}
	r.SinceMs = since
	r.Partial = since > 0 && time.UnixMilli(since).After(y0.AddDate(0, 0, 7))
	for m := 1; m <= 12; m++ {
		start := time.Date(now.Year(), time.Month(m), 1, 0, 0, 0, 0, now.Location())
		end := start.AddDate(0, 1, 0)
		mo := yearMonth{M: m}
		switch {
		case since == 0 || !time.UnixMilli(since).Before(end):
			mo.Past = start.Before(now) // before the record began
		case start.After(now):
		default:
			mo.Known = true
		}
		r.Months[m-1] = mo
	}

	// titles finished and dropped this year
	byID := map[string]library.Item{}
	var fin, drop []library.Item
	gcount, dcount := map[string]int{}, map[string]int{}
	gknown, dknown := 0, 0
	svc := map[string]int{}
	for _, it := range items {
		byID[it.ID] = it
		switch {
		case it.State == library.Finished && in(it.DoneAt):
			fin = append(fin, it)
		case it.State == library.Dropped && (in(it.MarkAt) || (it.MarkAt == 0 && in(it.LastAt))):
			drop = append(drop, it)
		}
	}
	sort.SliceStable(fin, func(i, j int) bool { return fin[i].DoneAt > fin[j].DoneAt })
	count := func(l []library.Item, into map[string]int) (known int) {
		for _, it := range l {
			if genres == nil {
				break
			}
			if g := genres(it.ID); len(g) > 0 {
				known++
				for _, n := range g {
					into[n]++
				}
			}
		}
		return known
	}
	gknown, dknown = count(fin, gcount), count(drop, dcount)
	r.Finished, r.Dropped = len(fin), len(drop)
	top := func(m map[string]int, of int) *yearStat {
		best, n := "", 0
		for k, c := range m {
			if c > n || (c == n && k < best) {
				best, n = k, c
			}
		}
		if n < 2 { // one title is not a pattern
			return nil
		}
		return &yearStat{Name: best, N: n, Of: of}
	}
	r.TopGenre, r.DropGenre = top(gcount, gknown), top(dcount, dknown)
	for _, it := range fin {
		if s := libSvcOf(it); s != "" {
			svc[s]++
		}
		r.Months[time.UnixMilli(it.DoneAt).In(now.Location()).Month()-1].N++
	}
	bestS, bestN := "", 0
	for k, c := range svc {
		if c > bestN || (c == bestN && k < bestS) {
			bestS, bestN = k, c
		}
	}
	if bestN > 0 {
		r.TopSvc = &yearStat{Name: name(bestS), N: bestN, Of: len(fin)}
	}
	for _, it := range fin {
		if len(r.Picks) >= 14 {
			break
		}
		if i := img(it.Img); i != "" {
			r.Picks = append(r.Picks, yearPick{Title: libFirst(it.Show, it.Title), Img: i, Svc: libSvcOf(it)})
		}
	}

	// time watched: the furthest point reached in each episode or film, this year
	type ep struct{ id, key string }
	far := map[ep]int{}
	for _, e := range events {
		if !in(e.At) || e.Pos <= 0 {
			continue
		}
		p := e.Pos
		if e.Dur > 0 && p > e.Dur {
			p = e.Dur
		}
		k := ep{e.ID, itoa2(e.Se) + "|" + itoa2(e.Ep)}
		if p > far[k] {
			far[k] = p
		}
	}
	perShow := map[string]float64{}
	perEps := map[string]int{}
	total := 0.0
	for k, p := range far {
		total += float64(p)
		if it, ok := byID[k.id]; ok && it.Kind == "tv" {
			perShow[k.id] += float64(p)
			perEps[k.id]++
		}
	}
	if total >= 60 {
		r.Hours, r.HoursKnown = round1(total/3600), true
	}
	bestShow, bestSec := "", 0.0
	for id, s := range perShow {
		if s > bestSec || (s == bestSec && id < bestShow) {
			bestShow, bestSec = id, s
		}
	}
	if bestSec >= 20*60 && perEps[bestShow] >= 2 { // a longest show needs more than one episode
		it := byID[bestShow]
		r.Longest = &yearLong{Title: libFirst(it.Show, it.Title), Episodes: perEps[bestShow], Hours: round1(bestSec / 3600)}
	}
	return r
}

func itoa2(n int) string {
	if n == 0 {
		return "0"
	}
	var b [12]byte
	i := len(b)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

func round1(f float64) float64 { return float64(int(f*10+0.5)) / 10 }

// genresOf is what the app already knows of a title's genres (cached details, then the
// rows' own items), by TMDB key; nothing is fetched.
func (a *App) genresOf(id string) []string {
	if a.ld == nil || !isTmdbKey(id) {
		return nil
	}
	a.ld.mu.Lock()
	defer a.ld.mu.Unlock()
	if d, ok := a.ld.details[id]; ok && len(d.Genres) > 0 {
		return d.Genres
	}
	if it, ok := a.ld.byKey[id]; ok && len(it.Genres) > 0 {
		return it.Genres
	}
	return nil
}

// GET /api/desk/year: the recap of the year so far.
func (a *App) deskYear(w http.ResponseWriter, r *http.Request) {
	if !deskGate(w, r, http.MethodGet) || !a.deskData(w) {
		return
	}
	st := a.libStore()
	var items []library.Item
	var evs []library.Event
	if st != nil {
		items, evs = st.List("all"), st.Events(0)
	}
	rec := d5Year(items, evs, a.genresOf, func(s string) string { return strings.TrimSpace(svcNames[s]) }, a.imgURL, a.now())
	deskJSON(w, rec)
}
