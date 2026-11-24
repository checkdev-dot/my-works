// Package taste learns what Dev likes from what he does, and ranks titles by it.
//
// It is a small online linear model: every title is described by about 90
// named features (genre, language, movie or series, service, era, rating
// band, how mainstream it is, which row it came from), and every signal
// (watched most of it, opened it, looked at it, gave up on it) nudges the
// weights of that title's features. A title's affinity is the mean weight of
// its features. With one viewer and a few dozen events a neural network would
// learn nothing; this learns from the first event:
//
//   - shrinkage: a feature seen n times counts n/(n+k), so one click cannot
//     take over the page;
//   - decay: every event halves in weight every three weeks (applied when
//     read), so taste follows what he likes now;
//   - an empty profile gives affinity 0 everywhere, which leaves every row in
//     its plain quality order.
//
// No network: scoring is a few map lookups per title.
package taste

import (
	"encoding/json"
	"hash/fnv"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"
)

// Title is what the model needs to know about one title.
type Title struct {
	Kind    string // movie | tv
	Service string
	GIDs    []int  // TMDB genre ids
	Lang    string // original language
	Year    string
	Vote    float64
	Votes   int
	Row     string // the launcher row it was shown in
}

// Signal strengths (knobs).
const (
	Finished = 1.0  // watched more than 70 percent
	Played   = 0.6  // opened it to watch
	Detail   = 0.3  // opened its details panel
	Dwell    = 0.1  // looked at it for more than two seconds
	Abandon  = -0.5 // opened it, left within minutes having watched under 10 percent

	halfLife = 21 * 24 * time.Hour
	shrinkK  = 3.0
	beta     = 1.6 // how hard affinity bends the quality order
)

// genre maps movie and TV genre ids to one shared name, so liking crime films
// also lifts crime series.
var genre = map[int][]string{
	28: {"action"}, 12: {"adventure"}, 16: {"animation"}, 35: {"comedy"}, 80: {"crime"}, 99: {"documentary"},
	18: {"drama"}, 10751: {"family"}, 14: {"fantasy"}, 36: {"history"}, 27: {"horror"}, 10402: {"music"},
	9648: {"mystery"}, 10749: {"romance"}, 878: {"scifi"}, 10770: {"tvmovie"}, 53: {"thriller"}, 10752: {"war"}, 37: {"western"},
	10759: {"action", "adventure"}, 10762: {"kids", "family"}, 10763: {"news"}, 10764: {"reality"},
	10765: {"scifi", "fantasy"}, 10766: {"soap", "drama"}, 10767: {"talk"}, 10768: {"war", "politics"},
}

// Features names a title's features.
func Features(t Title) []string {
	f := make([]string, 0, 12)
	for _, id := range t.GIDs {
		for _, g := range genre[id] {
			f = append(f, "g:"+g)
		}
	}
	if t.Lang != "" {
		f = append(f, "l:"+t.Lang)
	}
	if t.Kind != "" {
		f = append(f, "k:"+t.Kind)
	}
	if t.Service != "" {
		f = append(f, "s:"+t.Service)
	}
	if y, err := strconv.Atoi(t.Year); err == nil {
		switch {
		case y < 1980:
			f = append(f, "e:classic")
		case y < 2000:
			f = append(f, "e:80s90s")
		case y < 2010:
			f = append(f, "e:2000s")
		case y < 2018:
			f = append(f, "e:2010s")
		case y < 2023:
			f = append(f, "e:recent")
		default:
			f = append(f, "e:new")
		}
	}
	switch {
	case t.Votes < 50:
	case t.Vote >= 8:
		f = append(f, "r:8+")
	case t.Vote >= 7:
		f = append(f, "r:7")
	case t.Vote >= 6:
		f = append(f, "r:6")
	default:
		f = append(f, "r:low")
	}
	switch {
	case t.Votes >= 20000:
		f = append(f, "v:blockbuster")
	case t.Votes >= 2000:
		f = append(f, "v:popular")
	case t.Votes >= 200:
		f = append(f, "v:known")
	default:
		f = append(f, "v:niche")
	}
	if t.Row != "" {
		f = append(f, "row:"+t.Row)
	}
	return f
}

type weight struct {
	Sum float64 `json:"s"` // decayed sum of signal strengths
	N   float64 `json:"n"` // decayed count of signals
	At  int64   `json:"t"` // unix seconds both were last decayed to
}

func (w weight) at(now time.Time) weight {
	if w.At == 0 {
		return w
	}
	d := now.Sub(time.Unix(w.At, 0))
	if d <= 0 {
		return w
	}
	k := math.Pow(0.5, float64(d)/float64(halfLife))
	return weight{w.Sum * k, w.N * k, now.Unix()}
}

// value is the feature's weight: the mean signal, shrunk toward 0 while it is rare.
func (w weight) value() float64 {
	if w.N <= 0 {
		return 0
	}
	return w.Sum / w.N * (w.N / (w.N + shrinkK))
}

// Profile is the learned taste; safe for concurrent use.
type Profile struct {
	mu   sync.Mutex
	path string
	W    map[string]weight `json:"w"`
	N    int               `json:"events"`
	Done map[string]int64  `json:"done,omitempty"` // LearnOnce ids: one watch teaches once
	now  func() time.Time
}

// Open loads the profile at path (an empty one if there is none yet).
func Open(path string) *Profile {
	p := &Profile{path: path, W: map[string]weight{}, now: time.Now}
	if b, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(b, p)
		if p.W == nil {
			p.W = map[string]weight{}
		}
	}
	return p
}

// Learn records one signal for a title and saves the profile.
func (p *Profile) Learn(t Title, strength float64) {
	p.mu.Lock()
	now := p.now()
	for _, f := range Features(t) {
		w := p.W[f].at(now)
		w.Sum += strength
		w.N++
		w.At = now.Unix()
		p.W[f] = w
	}
	p.N++
	b, _ := json.Marshal(p)
	path := p.path
	p.mu.Unlock()
	if path != "" {
		_ = os.MkdirAll(filepath.Dir(path), 0o700)
		tmp := path + ".tmp"
		if os.WriteFile(tmp, b, 0o600) == nil {
			_ = os.Rename(tmp, path)
		}
	}
}

// Affinity is how much the title matches the taste: roughly -1..1, 0 when unknown.
func (p *Profile) Affinity(t Title) float64 {
	fs := Features(t)
	if len(fs) == 0 {
		return 0
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	now := p.now()
	var s float64
	for _, f := range fs {
		s += p.W[f].at(now).value()
	}
	return s / float64(len(fs)) * 3 // a strong match on a few features should matter
}

// Boost turns affinity into a multiplier for a quality score.
func Boost(aff float64) float64 { return math.Exp(beta * aff) }

// Weight is one feature's learned weight (0 when never seen), e.g. "g:war".
func (p *Profile) Weight(feature string) float64 {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.W[feature].at(p.now()).value()
}

// Events is how many signals the profile has learned.
func (p *Profile) Events() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.N
}

// Learned says whether there is enough to personalise with.
func (p *Profile) Learned() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.N >= 3
}

// Jitter is a stable per-title, per-day multiplier in [1-amp, 1+amp]: the same
// day always gives the same order, the next day shuffles titles whose quality
// scores sit within a few percent of each other (a seeded shuffle inside a band).
func Jitter(key string, day time.Time, amp float64) float64 {
	h := fnv.New32a()
	h.Write([]byte(key + day.Format("2006-01-02")))
	return 1 + amp*(float64(h.Sum32()%2001)/1000-1)
}

// LearnOnce is Learn, but a given id (e.g. a watched title and outcome) teaches
// only once, however many times it is offered. It reports whether it learned.
func (p *Profile) LearnOnce(id string, t Title, strength float64) bool {
	p.mu.Lock()
	if _, ok := p.Done[id]; ok {
		p.mu.Unlock()
		return false
	}
	if p.Done == nil {
		p.Done = map[string]int64{}
	}
	p.Done[id] = p.now().Unix()
	p.mu.Unlock()
	p.Learn(t, strength)
	return true
}
