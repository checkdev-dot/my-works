// Package occasion answers one question, cheaply and offline: given this clock
// and this viewer, which occasions are live, how strongly, and what do they
// want? It never calls the network to answer (the dates come from an embedded
// table, a cache and fixed rules); the app fetches TMDB candidates itself.
package occasion

import (
	"math"
	"sort"
	"strings"
	"time"
)

// Thresholds from HUB-DIRECTION 3.2.
const (
	ShelfMin = 0.35
	HeroMin  = 0.6
	eps      = 1e-9
)

// Window asks TMDB for films released near this occasion in past years
// (the big Hindi films open in Diwali week and Eid week).
type Window struct {
	Anchor string // node id whose past dates are used ("" = the node itself)
	Lang   string // original language
	Years  int    // how many past years
	Before int    // days before the date
	After  int    // days after the date
}

// Signals say what to ask TMDB and how to match a title.
type Signals struct {
	Keywords []string // TMDB keyword names, resolved to ids once
	Genres   []int    // TMDB movie genre ids (the app maps the few tv ones)
	Langs    []string // original languages
	Release  *Window
	Titles   []string // curated seed titles, kept only if on his services
	Runtime  [2]int   // minutes, 0 = any (moment nodes)
	Kinds    []string // "movie", "tv"; empty = both
	MinVotes int
}

// Node is one occasion, as data.
type Node struct {
	ID     string
	Kind   string // festival | day | season | clock | week | weather | state
	Name   string // shelf title
	Kicker string // hero kicker, defaults to Name upper-cased
	Why    string // one line under the title
	Before int    // days before the date the window opens
	After  int    // days after the date it closes
	Span   int    // days the date itself lasts (0 or 1 = one day)
	Peak   float64
	Hero   bool
	Pool   string // share another node's candidates ("" = own)
	From   string // season: "MM-DD" first day
	To     string // season: "MM-DD" last day
	Signals
}

// PoolID is the node whose candidates this node uses.
func (n Node) PoolID() string {
	if n.Pool != "" {
		return n.Pool
	}
	return n.ID
}

// Dated reports whether the node hangs on a calendar date from the table.
func (n Node) Dated() bool { return n.Kind == "festival" || n.Kind == "day" }

// Viewer is a tiny struct the app fills from what it already knows.
type Viewer struct {
	MidTitle    bool   // newest history entry is 2-95 percent in
	UpNext      bool   // an episode is finished and the next one is known
	JustFinish  string // title he finished within 7 days
	NewEpisode  bool   // a show he follows aired in the last 7 days
	Binge       int    // episodes of one show in 48 h
	Stuck       bool   // launcher open 8+ min with nothing opened
	AwayDays    int    // days since the last history event
	WeatherCode int    // WMO code, -1 or 0 when unknown
	TempC       float64
	HasWeather  bool
}

// Live is a node that is on now.
type Live struct {
	Node   Node
	Weight float64   // 0..1 after the ramp
	Date   time.Time // the occasion's date this year (zero for clock/season/state)
}

// Shelf reports whether the weight is enough for a themed shelf.
func (l Live) Shelf() bool { return l.Weight >= ShelfMin-eps }

// HeroSlide reports whether the weight is enough for a hero slide.
func (l Live) HeroSlide() bool { return l.Node.Hero && l.Weight >= HeroMin-eps }

func dayStart(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}

func civil(t time.Time) int64 {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC).Unix() / 86400
}

func daysBetween(a, b time.Time) int { return int(civil(b) - civil(a)) } // whole calendar days from a to b

// Ramp is the weight of a dated node: it climbs across Before days to Peak on
// the date, holds for the date's days (Span), then falls across After days. The
// last day of the window still carries a little weight, so a closing window
// does not vanish a day early.
func Ramp(n Node, now, date time.Time) float64 {
	span := max(n.Span, 1)
	d := daysBetween(now, date) // > 0: the date is still ahead
	switch {
	case d > 0:
		if d > n.Before {
			return 0
		}
		return n.Peak * (1 - float64(d)/float64(n.Before+1))
	case -d < span:
		return n.Peak
	}
	k := -d - (span - 1) // days after the last day of the occasion
	if k > n.After {
		return 0
	}
	return n.Peak * (1 - float64(k)/float64(n.After+2))
}

var def = &holder{}

type holder struct{ c *Calendar }

// SetCalendar swaps the calendar Evaluate uses (the app sets it at start; tests set theirs).
func SetCalendar(c *Calendar) { def.c = c }

// Evaluate is pure: no I/O besides the calendar tables already in memory.
func Evaluate(now time.Time, v Viewer) []Live {
	cal := def.c
	if cal == nil {
		cal = NewCalendar(nil)
	}
	return EvaluateWith(cal, now, v)
}

// EvaluateWith evaluates against a given calendar.
func EvaluateWith(cal *Calendar, now time.Time, v Viewer) []Live {
	var out []Live
	v = weatherViewer(v)
	diwaliDhan := false
	if dh, _, ok := cal.Date("dhanteras", now.Year()); ok {
		diwaliDhan = !dayStart(now).Before(dayStart(dh))
	}
	for _, n := range nodes {
		var w float64
		var date time.Time
		switch n.Kind {
		case "festival", "day":
			for _, y := range yearsAround(now) {
				d, span, ok := cal.Date(n.ID, y)
				if !ok {
					continue
				}
				nn := n
				if span > 1 {
					nn.Span = span
				}
				if r := Ramp(nn, now, d); r > w {
					w, date = r, d
				}
			}
			if n.ID == "diwali" && diwaliDhan && w > 0 && w < n.Peak {
				// Dhanteras raises Diwali to its peak two days early
				if dd, _, ok := cal.Date("diwali", now.Year()); ok && daysBetween(now, dd) >= 0 {
					w = n.Peak
				}
			}
		case "season":
			if inRange(now, n.From, n.To) {
				w = n.Peak
			}
		case "clock", "week":
			if cond(n.ID, now) {
				w = n.Peak
			}
		case "weather":
			w = weatherWeight(n.ID, v)
		case "state":
			w = stateWeight(n.ID, v)
		}
		if w > eps {
			out = append(out, Live{Node: n, Weight: w, Date: date})
		}
	}
	rank := func(k string) int {
		switch k {
		case "state":
			return 0
		case "festival":
			return 1
		case "day":
			return 2
		case "season":
			return 3
		}
		return 4
	}
	sort.SliceStable(out, func(i, j int) bool {
		if math.Abs(out[i].Weight-out[j].Weight) > eps {
			return out[i].Weight > out[j].Weight
		}
		return rank(out[i].Node.Kind) < rank(out[j].Node.Kind)
	})
	return out
}

func inRange(now time.Time, from, to string) bool {
	md := now.Format("01-02")
	if from <= to {
		return md >= from && md <= to
	}
	return md >= from || md <= to // winter wraps the year
}

func cond(id string, t time.Time) bool {
	h, wd := t.Hour(), t.Weekday()
	switch id {
	case "late-night":
		return h >= 23 || h < 4
	case "evening":
		return h >= 18 && h < 23
	case "afternoon":
		return h >= 12 && h < 18
	case "morning":
		return h >= 4 && h < 12
	case "friday-night":
		return (wd == time.Friday && h >= 17) || (wd == time.Saturday && h < 2)
	case "saturday":
		return wd == time.Saturday && h >= 10 && h < 23
	case "sunday-evening":
		return wd == time.Sunday && h >= 17 && h < 23
	case "weeknight":
		return wd >= time.Monday && wd <= time.Thursday && h >= 20 && h < 23
	}
	return false
}

func weatherWeight(id string, v Viewer) float64 {
	if !v.HasWeather {
		return 0
	}
	switch id {
	case "rain-now":
		if v.WeatherCode >= 51 && v.WeatherCode <= 99 {
			return 0.5
		}
	case "heat":
		if v.TempC >= 35 {
			return 0.4
		}
	case "cold":
		if v.TempC <= 12 {
			return 0.4
		}
	}
	return 0
}

func stateWeight(id string, v Viewer) float64 {
	switch id {
	case "mid-title":
		if v.MidTitle {
			return 1
		}
	case "up-next":
		if v.UpNext {
			return 1
		}
	case "just-finished":
		if v.JustFinish != "" {
			return 0.8
		}
	case "new-episode":
		if v.NewEpisode {
			return 0.9
		}
	case "binge":
		if v.Binge >= 3 {
			return 0.7
		}
	case "stuck":
		if v.Stuck {
			return 0.6
		}
	case "away":
		if v.AwayDays >= 7 {
			return 0.4
		}
	}
	return 0
}

// Find returns a node by id.
func Find(id string) (Node, bool) {
	for _, n := range nodes {
		if n.ID == id {
			return n, true
		}
	}
	return Node{}, false
}

// All returns the nodes (a copy of the slice).
func All() []Node { return append([]Node(nil), nodes...) }

// KickerOf is the hero kicker word of a node.
func KickerOf(n Node) string {
	if n.Kicker != "" {
		return n.Kicker
	}
	return strings.ToUpper(n.Name)
}

// PastDates returns the dates of a node in earlier years (for release windows).
func (c *Calendar) PastDates(id string, years int, now time.Time) []time.Time {
	var out []time.Time
	for y := now.Year() - 1; y >= now.Year()-years; y-- {
		if d, _, ok := c.Date(id, y); ok {
			out = append(out, d)
		}
	}
	return out
}

// yearsAround: a window only crosses the new year in December and January.
func yearsAround(now time.Time) []int {
	y := now.Year()
	out := []int{y}
	if now.Month() == time.January {
		out = append(out, y-1)
	}
	if now.Month() == time.December {
		out = append(out, y+1)
	}
	return out
}

// Upcoming lists the candidate pools worth fetching: dated nodes whose window is
// open now or opens within `ahead` days (and that can reach a shelf at all),
// soonest first. A node that shares another's pool stands for its owner.
func (c *Calendar) Upcoming(now time.Time, ahead int) []Node {
	type hit struct {
		n     Node
		first int // first day (0 = today) the node has any weight
		w     float64
	}
	best := map[string]hit{}
	for _, n := range nodes {
		if n.Peak < ShelfMin-eps || (n.Kind != "festival" && n.Kind != "day" && n.Kind != "season") {
			continue
		}
		owner := n
		if n.Pool != "" {
			if o, ok := Find(n.Pool); ok {
				owner = o
			}
		}
		if len(owner.Titles)+len(owner.Keywords)+len(owner.Genres)+len(owner.Langs) == 0 && owner.Release == nil {
			continue
		}
		first, mw := -1, 0.0
		for d := 0; d <= ahead; d++ {
			t := now.AddDate(0, 0, d)
			var w float64
			if n.Kind == "season" {
				if inRange(t, n.From, n.To) {
					w = n.Peak
				}
			} else {
				for _, y := range yearsAround(t) {
					if date, span, ok := c.Date(n.ID, y); ok {
						nn := n
						if span > 1 {
							nn.Span = span
						}
						w = max(w, Ramp(nn, t, date))
					}
				}
			}
			if w > eps {
				if first < 0 {
					first = d
				}
				mw = max(mw, w)
			}
		}
		if first < 0 {
			continue
		}
		if h, ok := best[owner.ID]; !ok || first < h.first || (first == h.first && mw > h.w) {
			best[owner.ID] = hit{owner, first, mw}
		}
	}
	// a weather node that is on right now asks for its pool (monsoon, summer, winter) even
	// outside the season: the same three-pools-a-refresh cap and call budget apply
	for _, wn := range liveWeather(weatherViewer(Viewer{})) {
		owner, ok := Find(wn.PoolID())
		if !ok || len(owner.Titles)+len(owner.Keywords)+len(owner.Genres)+len(owner.Langs) == 0 && owner.Release == nil {
			continue
		}
		if _, have := best[owner.ID]; !have {
			best[owner.ID] = hit{owner, 0, wn.Peak}
		}
	}
	var hs []hit
	for _, h := range best {
		hs = append(hs, h)
	}
	sort.SliceStable(hs, func(i, j int) bool {
		if hs[i].first != hs[j].first {
			return hs[i].first < hs[j].first
		}
		if hs[i].w != hs[j].w {
			return hs[i].w > hs[j].w
		}
		return hs[i].n.ID < hs[j].n.ID
	})
	out := make([]Node, 0, len(hs))
	for _, h := range hs {
		out = append(out, h.n)
	}
	return out
}
