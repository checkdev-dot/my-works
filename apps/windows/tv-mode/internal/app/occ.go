package app

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"tvmode/internal/history"
	"tvmode/internal/occasion"
	"tvmode/internal/tmdb"
)

// The occasion engine's side of the launcher (HUB-DIRECTION section 3): which
// occasions are live, the themed shelves and the hero slide they earn, the
// "Up next" slide, and the clock that keeps the page current. The engine itself
// (internal/occasion) is pure; the candidates it asks for are fetched in
// refreshRec (occ_fetch.go).

// --- the one clock ---

var (
	fakeOnce   sync.Once
	fakeOffset time.Duration
	fakeOn     bool
	nowHook    func() time.Time // tests
)

// nowTime is the only place TVMODE_FAKE_NOW is read. The fake moment keeps
// ticking from the start, so a launcher left open still crosses the hour.
func nowTime() time.Time {
	if nowHook != nil {
		return nowHook()
	}
	fakeOnce.Do(func() {
		s := strings.TrimSpace(os.Getenv("TVMODE_FAKE_NOW"))
		if s == "" {
			return
		}
		for _, layout := range []string{"2006-01-02T15:04:05", "2006-01-02T15:04", "2006-01-02 15:04", "2006-01-02"} {
			if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
				fakeOffset, fakeOn = time.Until(t), true
				log.Printf("occasion: FAKE NOW %s", t.Format("2006-01-02 15:04"))
				return
			}
		}
		log.Printf("occasion: TVMODE_FAKE_NOW %q is not a date, using the real clock", s)
	})
	if fakeOn {
		return time.Now().Add(fakeOffset)
	}
	return time.Now()
}

func (a *App) now() time.Time { return nowTime() }

// --- state ---

type occState struct {
	cal     *occasion.Calendar
	learned *occasion.Learned
	cache   *occCache
	mu      sync.Mutex
	keys    map[string]string // item key -> occasion node of the last frame (learning)
	lean    atomic.Pointer[map[string]float64]
	un      upNextState
	logged  string
	icsDay  string
	active  string // the day a launcher was last used (a signal or an open): only such days count as "shown"
}

type upNextState struct {
	forKey    string
	ok        bool
	it        tmdb.Item
	se, ep    int
	name      string
	over      string
	svc       string
	resolving bool
	failedAt  time.Time
}

func (a *App) initOcc() {
	cacheDir := filepath.Dir(a.recCachePath())
	o := &occState{keys: map[string]string{}}
	if a.testRows() {
		o.cal = occasion.Open("", "") // smoke: no override file, no cache, no network
		o.learned = occasion.OpenLearned("")
		o.cache = newOccCache("")
	} else {
		over := ""
		if d, err := os.UserConfigDir(); err == nil {
			over = filepath.Join(d, "TVMode", "occasions.json")
		}
		o.cal = occasion.Open(over, cacheDir)
		o.learned = occasion.OpenLearned(filepath.Join(cacheDir, "occasions-learned.json"))
		o.cache = newOccCache(filepath.Join(cacheDir, "occ-cache.json"))
	}
	occasion.SetCalendar(o.cal)
	a.ld.occ = o
	go a.occTicker()
}

// occTicker re-sends the rows on the hour (and the first minute after
// midnight), so a launcher left open at 22:40 changes at 23:00 without a restart.
// It also asks the public calendar for missing dates, once a day at most.
func (a *App) occTicker() {
	for {
		now := a.now()
		next := now.Truncate(time.Hour).Add(time.Hour + 15*time.Second)
		if next.Hour() == 0 {
			next = next.Add(45 * time.Second) // 00:01
		}
		select {
		case <-a.ctx.Done():
			return
		case <-time.After(time.Until(next.Add(-now.Sub(time.Now())))):
		}
		a.pushRows()
		a.occRefreshDates()
	}
}

func (a *App) occRefreshDates() {
	o := a.ld.occ
	if o == nil || a.testRows() {
		return
	}
	now := a.now()
	day := now.Format("2006-01-02")
	o.mu.Lock()
	if o.icsDay == day || !o.cal.NeedsRefresh(now) {
		o.mu.Unlock()
		return
	}
	o.icsDay = day
	o.mu.Unlock()
	go func() {
		if err := o.cal.Refresh(context.Background(), occasion.IndiaICS, now); err != nil {
			log.Printf("occasion: dates refresh skipped: %v", err)
		}
	}()
}

// occNote teaches the engine what he does with a themed shelf: opening a card
// (the details panel) counts as an open, dwelling counts as dwell.
func (a *App) occNote(row, what string) {
	if a.ld.occ == nil || !strings.HasPrefix(row, "occ-") {
		return
	}
	switch what {
	case "detail":
		a.ld.occ.learned.Note(strings.TrimPrefix(row, "occ-"), "opened")
	case "dwell":
		a.ld.occ.learned.Note(strings.TrimPrefix(row, "occ-"), "dwell")
	}
}

// occNoteOpen: opening an item that sits on a themed shelf wakes that node.
func (a *App) occNoteOpen(key string) {
	o := a.ld.occ
	if o == nil {
		return
	}
	o.mu.Lock()
	id := o.keys[key]
	o.mu.Unlock()
	if id != "" {
		o.learned.Note(id, "opened")
	}
}

// leanOf is the small lean on the general rows: a title in a live calendar
// node's pool gets x (1 + 0.15 w), at most 15 percent.
func (a *App) leanOf(it tmdb.Item) float64 {
	if a.ld == nil || a.ld.occ == nil {
		return 1
	}
	if m := a.ld.occ.lean.Load(); m != nil {
		if w, ok := (*m)[itemKey(it)]; ok {
			return 1 + 0.15*w
		}
	}
	return 1
}

// --- the plan: what the engine wants on this page ---

type occPlan struct {
	live    []occasion.Live
	cal     *occasion.Live
	calIt   []tmdb.Item
	mom     *occasion.Live
	momIt   []tmdb.Item
	hero    *occasion.Live
	heroIt  []tmdb.Item // ranked, best first
	quietID map[string]bool
}

func (a *App) occViewer(now time.Time, hl []history.Entry, mid, up bool) occasion.Viewer {
	v := occasion.Viewer{MidTitle: mid, UpNext: up}
	if len(hl) > 0 && hl[0].At > 0 {
		v.AwayDays = int(now.Sub(time.UnixMilli(hl[0].At)).Hours() / 24)
		if v.AwayDays < 0 {
			v.AwayDays = 0
		}
	}
	return v
}

// occCards keeps pool items he can see: a picture, not marked watched.
func (a *App) occCards(items []tmdb.Item) []tmdb.Item {
	var out []tmdb.Item
	for _, it := range items {
		if (it.Backdrop == "" && it.Poster == "") || it.Service == "" || a.isRated(itemKey(it)) {
			continue
		}
		out = append(out, it)
	}
	return out
}

// runtimeOf is a title's runtime in minutes when its details are cached, else 0.
func (a *App) runtimeOf(it tmdb.Item) int {
	a.ld.mu.Lock()
	defer a.ld.mu.Unlock()
	return a.ld.details[itemKey(it)].Runtime
}

func (a *App) occPlan(now time.Time, hl []history.Entry, data recData, mid, up bool) *occPlan {
	o := a.ld.occ
	if o == nil {
		return nil
	}
	p := &occPlan{quietID: map[string]bool{}}
	p.live = occasion.EvaluateWith(o.cal, now, a.occViewer(now, hl, mid, up))
	lean := map[string]float64{}
	for _, l := range p.live {
		n := l.Node
		if (n.Kind == "festival" || n.Kind == "day") && l.Shelf() {
			for _, it := range data.Occasions[n.PoolID()] {
				if l.Weight > lean[itemKey(it)] {
					lean[itemKey(it)] = l.Weight
				}
			}
		}
	}
	o.lean.Store(&lean)
	for i := range p.live {
		l := p.live[i]
		n := l.Node
		if !l.Shelf() || n.Why == "" {
			continue
		}
		switch n.Kind {
		case "festival", "day", "season":
			if p.cal != nil {
				break
			}
			if cards := a.occCards(data.Occasions[n.PoolID()]); len(cards) >= 4 {
				p.cal, p.calIt = &p.live[i], cards
			}
		case "clock", "week", "weather":
			if p.mom != nil {
				break
			}
			var items []tmdb.Item
			if n.Pool != "" {
				items = a.occCards(data.Occasions[n.Pool])
			} else {
				items = a.momentItems(n, data)
			}
			if len(items) >= 4 {
				p.mom, p.momIt = &p.live[i], items
			}
		}
	}
	for _, l := range []*occasion.Live{p.cal, p.mom} {
		if l != nil && o.learned.Quiet(l.Node.ID) {
			p.quietID[l.Node.ID] = true
		}
	}
	for i := range p.live { // the occasion slide: the heaviest festival or day that may take one
		l := p.live[i]
		if (l.Node.Kind != "festival" && l.Node.Kind != "day") || !l.HeroSlide() || o.learned.Quiet(l.Node.ID) {
			continue
		}
		if cards := a.occCards(data.Occasions[l.Node.PoolID()]); len(cards) > 0 {
			sort.SliceStable(cards, func(x, y int) bool {
				return a.personal(cards[x], "occ-"+l.Node.ID) > a.personal(cards[y], "occ-"+l.Node.ID)
			})
			p.hero, p.heroIt = &p.live[i], cards
			break
		}
	}
	return p
}

// occLog writes the one line per build the spec asks for, only when it changes.
func (a *App) occLog(p *occPlan, shelves []shelfFrame) {
	o := a.ld.occ
	if p == nil || o == nil {
		return
	}
	var live, sh []string
	for _, l := range p.live {
		if l.Shelf() {
			live = append(live, fmt.Sprintf("%s=%.2f", l.Node.ID, l.Weight))
		}
	}
	for _, s := range shelves {
		if strings.HasPrefix(s.ID, "occ-") {
			sh = append(sh, fmt.Sprintf("%s(%d)", s.ID, len(s.Items)))
		}
	}
	hero := "none"
	if p.hero != nil {
		hero = p.hero.Node.ID
	}
	line := fmt.Sprintf("occasion: live %s; shelves %s; hero %s", strings.Join(live, " "), strings.Join(sh, " "), hero)
	o.mu.Lock()
	same := o.logged == line
	o.logged = line
	o.mu.Unlock()
	if !same {
		log.Print(line)
	}
}

// --- moment shelves: clock and week nodes re-rank what he already has ---

func (a *App) momentItems(n occasion.Node, data recData) []tmdb.Item {
	seen := map[string]bool{}
	var pool []tmdb.Item
	add := func(it tmdb.Item) {
		if k := itemKey(it); !seen[k] && it.Service != "" && (it.Backdrop != "" || it.Poster != "") && !a.isRated(k) {
			seen[k] = true
			pool = append(pool, it)
		}
	}
	for _, s := range data.Shelves {
		for _, it := range s.Items {
			add(it)
		}
	}
	a.ld.mu.Lock()
	for _, it := range a.ld.extra {
		add(it)
	}
	a.ld.mu.Unlock()
	var keep func(tmdb.Item) bool
	switch n.ID {
	case "late-night": // series and anything short; horror and three-hour films sink
		keep = func(it tmdb.Item) bool {
			if hasGenre(it, 27) {
				return false
			}
			if it.Kind == "tv" {
				return true
			}
			rt := a.runtimeOf(it)
			return rt > 0 && rt <= 100
		}
	case "afternoon":
		keep = func(it tmdb.Item) bool { return it.Kind == "movie" }
	case "morning":
		keep = func(it tmdb.Item) bool { return hasGenre(it, 35) && !hasGenre(it, 27) }
	case "friday-night": // the New releases row, newest first, films first
		pool = nil
		seen = map[string]bool{}
		for _, s := range data.Shelves {
			if s.ID == "new" {
				for _, it := range s.Items {
					add(it)
				}
			}
		}
		sort.SliceStable(pool, func(i, j int) bool {
			if (pool[i].Kind == "movie") != (pool[j].Kind == "movie") {
				return pool[i].Kind == "movie"
			}
			return pool[i].Date > pool[j].Date
		})
		return top(pool, 24)
	case "saturday":
		keep = func(it tmdb.Item) bool { return it.Kind == "movie" && it.Votes >= 1500 }
	case "sunday-evening":
		keep = func(it tmdb.Item) bool { return hasGenre(it, 35, 10751, 16) && !hasGenre(it, 27, 53, 80, 10752) }
	case "weeknight":
		keep = func(it tmdb.Item) bool { return it.Kind == "tv" }
	default:
		return nil
	}
	var out []tmdb.Item
	for _, it := range pool {
		if keep(it) {
			out = append(out, it)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		si, sj := a.personal(out[i], "occ-"+n.ID), a.personal(out[j], "occ-"+n.ID)
		if si != sj {
			return si > sj
		}
		return itemKey(out[i]) < itemKey(out[j])
	})
	return top(out, 24)
}

func top(l []tmdb.Item, n int) []tmdb.Item {
	if len(l) > n {
		return l[:n]
	}
	return l
}

// --- Up next (LAUNCHER-V3-SPEC hero case b) ---

// upNextCandidate: the show whose newest episode mark is finished (> 92 percent)
// within the last 14 days, newest first. The next episode is looked up on TMDB.
func (a *App) upNextCandidate(now time.Time) (show string, se, ep int, m epMark, ok bool) {
	type last struct {
		se, ep int
		m      epMark
	}
	eps.mu.Lock()
	a.epLoad()
	by := map[string]last{}
	for k, v := range eps.m {
		parts := strings.Split(k, "|")
		if len(parts) != 3 {
			continue
		}
		s, e1 := strconv.Atoi(parts[1])
		e, e2 := strconv.Atoi(parts[2])
		if e1 != nil || e2 != nil {
			continue
		}
		if l, seen := by[parts[0]]; !seen || v.At > l.m.At {
			by[parts[0]] = last{s, e, v}
		}
	}
	eps.mu.Unlock()
	var best last
	for sh, l := range by {
		if l.m.pct() > 0.92 && now.Sub(time.Unix(l.m.At, 0)) < 14*24*time.Hour && l.m.At >= best.m.At {
			best, show, ok = l, sh, true
		}
	}
	return show, best.se, best.ep, best.m, ok
}

// upNextHero returns the resolved next episode, or nil (and starts looking it up,
// off the page's path, when a finished episode has no answer yet).
func (a *App) upNextHero(now time.Time) *upNextState {
	o := a.ld.occ
	if o == nil {
		return nil
	}
	show, se, ep, m, ok := a.upNextCandidate(now)
	if !ok {
		return nil
	}
	k := fmt.Sprintf("%s|%d|%d", show, se, ep)
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.un.resolving {
		return nil
	}
	if o.un.forKey == k {
		if o.un.ok {
			u := o.un
			return &u
		}
		if time.Since(o.un.failedAt) < 30*time.Minute { // a failure is retried after half an hour
			return nil
		}
	}
	o.un.resolving = true
	go a.resolveUpNext(k, show, se, ep, m)
	return nil
}

func (a *App) resolveUpNext(k, show string, se, ep int, m epMark) {
	fail := func(why string) {
		o := a.ld.occ
		o.mu.Lock()
		o.un = upNextState{forKey: k, failedAt: time.Now()}
		o.mu.Unlock()
		log.Printf("occasion: no up-next for %s S%dE%d: %s", show, se, ep, why)
	}
	title := show
	for _, e := range a.ld.hist.List() {
		if e.Show != "" && normTitle(e.Show) == show {
			title = e.Show
			break
		}
	}
	var it tmdb.Item
	if a.testRows() {
		it = tmdb.Item{ID: 777, Kind: "tv", Title: title, Backdrop: "/c777.svg", Overview: "A canned overview of the show.", Vote: 8.1, Votes: 4000}
	} else {
		c := a.ld.tm
		if c == nil {
			fail("no tmdb")
			return
		}
		l, err := c.Find(title)
		if err != nil {
			fail("search failed")
			return
		}
		for _, x := range l {
			if x.Kind == "tv" && (x.Backdrop != "" || x.Poster != "") && normTitle(x.Title) == show {
				it = x
				break
			}
		}
		if it.ID == 0 {
			fail("show not found")
			return
		}
	}
	nse, nep := se, ep+1
	var name, over string
	found := false
	if list, err := a.seasonEps(it.ID, se); err == nil {
		for _, e := range list {
			if e.N == nep {
				name, over, found = e.Name, e.Overview, true
			}
		}
		if !found { // the season is over: the next season's first episode, if there is one
			if l2, err2 := a.seasonEps(it.ID, se+1); err2 == nil && len(l2) > 0 {
				nse, nep, name, over, found = se+1, l2[0].N, l2[0].Name, l2[0].Overview, true
			}
		}
	}
	if !found {
		fail("no next episode (finale?)")
		return
	}
	it.Service = m.Svc
	key := itemKey(it)
	a.ld.mu.Lock()
	if old, have := a.ld.byKey[key]; have {
		old.Service = m.Svc
		it = old
	}
	a.ld.byKey[key], a.ld.extra[key] = it, it
	a.ld.mu.Unlock()
	o := a.ld.occ
	o.mu.Lock()
	o.un = upNextState{forKey: k, ok: true, it: it, se: nse, ep: nep, name: name, over: over, svc: m.Svc}
	o.mu.Unlock()
	log.Printf("occasion: up next %s S%d E%d on %s", it.Title, nse, nep, m.Svc)
	a.pushRows()
}

// upNextFrame is the hero slide for the finished-episode case.
func (a *App) upNextFrame(u *upNextState) *heroFrame {
	sub := fmt.Sprintf("S%d E%d", u.se, u.ep)
	if u.name != "" {
		sub += "  ·  " + u.name
	}
	over := u.over
	if over == "" {
		over = u.it.Overview
	}
	img := a.tmdbImg(u.it.Backdrop, "w1280")
	if img == "" {
		img = a.tmdbImg(u.it.Poster, "w780")
	}
	return &heroFrame{K: "next", Kick: "UP NEXT", Service: u.svc, Title: u.it.Title, Sub: sub, Over: over, Img: img,
		Thumb: a.tmdbImg(u.it.Backdrop, "w300"), Key: itemKey(u.it), Kind: "tv", Year: u.it.Year, Genres: u.it.Genres,
		Vote: u.it.Vote, Votes: u.it.Votes, Why: "Carry on.", Se: u.se, Ep: u.ep}
}

// occHeroFrame is the occasion slide: the node's word, the title's own picture.
func (a *App) occHeroFrame(l *occasion.Live, it tmdb.Item) *heroFrame {
	img := a.tmdbImg(it.Backdrop, "w1280")
	if img == "" {
		img = a.tmdbImg(it.Poster, "w780")
	}
	return &heroFrame{K: "pick", Kick: occasion.KickerOf(l.Node), Occ: l.Node.ID, Service: it.Service, Title: it.Title, Over: it.Overview, Img: img,
		Thumb: a.tmdbImg(it.Backdrop, "w300"), Key: itemKey(it), Kind: it.Kind, Year: it.Year, Genres: it.Genres, Vote: it.Vote, Votes: it.Votes, Why: l.Node.Why}
}

// occFinish runs after a frame is built: it remembers which items sit on which
// themed shelf (so an open can wake its node), counts the day a node was on the
// page, and writes the one log line.
func (a *App) occFinish(p *occPlan, f rowsFrame) {
	o := a.ld.occ
	if p == nil || o == nil {
		return
	}
	keys := map[string]string{}
	now := a.now()
	o.mu.Lock()
	active := o.active == now.Format("2006-01-02") // a rebuild in standby, or for the desk, is not a day seen
	o.mu.Unlock()
	for _, s := range f.Shelves {
		if !strings.HasPrefix(s.ID, "occ-") {
			continue
		}
		id := strings.TrimPrefix(s.ID, "occ-")
		for _, c := range s.Items {
			keys[c.Key] = id
		}
		if active {
			o.learned.Shown(id, now)
		}
	}
	if p.hero != nil && active {
		o.learned.Shown(p.hero.Node.ID, now)
	}
	o.mu.Lock()
	o.keys = keys
	o.mu.Unlock()
	a.occLog(p, f.Shelves)
}

// occTouch marks today as a day a launcher was in use (he moved on it or opened
// something). Only such days count toward "shown 6+ times with no open".
func (a *App) occTouch() {
	if o := a.ld.occ; o != nil {
		o.mu.Lock()
		o.active = a.now().Format("2006-01-02")
		o.mu.Unlock()
	}
}
