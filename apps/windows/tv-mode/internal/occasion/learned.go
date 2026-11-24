package occasion

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Learned is the one piece of new learning: how often a node was shown and
// whether he ever touched it. A node shown on 6+ days with no open and no dwell
// goes quiet (no hero slide, its shelf after the plain rows). One open wakes it.
// The taste model learns the rest from the row id (occ-<node>).
type Learned struct {
	mu   sync.Mutex
	path string // empty: memory only (smoke tests never write Dev's files)
	m    map[string]*Stat
}

// Stat is what one node has earned.
type Stat struct {
	Shown  int     `json:"shown"`
	Opened int     `json:"opened"`
	Dwell  float64 `json:"dwell"`
	Day    string  `json:"day,omitempty"` // last day counted as shown
}

// OpenLearned reads occasions-learned.json (empty path: memory only).
func OpenLearned(path string) *Learned {
	l := &Learned{path: path, m: map[string]*Stat{}}
	if path != "" {
		if b, err := os.ReadFile(path); err == nil {
			_ = json.Unmarshal(b, &l.m)
		}
	}
	if l.m == nil {
		l.m = map[string]*Stat{}
	}
	return l
}

func (l *Learned) stat(id string) *Stat {
	s := l.m[id]
	if s == nil {
		s = &Stat{}
		l.m[id] = s
	}
	return s
}

// Shown counts a day on which the node had a shelf or slide (once per day).
func (l *Learned) Shown(id string, now time.Time) {
	l.mu.Lock()
	s := l.stat(id)
	d := now.Format("2006-01-02")
	changed := s.Day != d
	if changed {
		s.Shown++
		s.Day = d
	}
	l.mu.Unlock()
	if changed {
		l.save()
	}
}

// Note records "opened" or "dwell" on a node (row id occ-<node>).
func (l *Learned) Note(id, what string) {
	l.mu.Lock()
	s := l.stat(id)
	switch what {
	case "opened":
		s.Opened++
	case "dwell":
		s.Dwell++
	default:
		l.mu.Unlock()
		return
	}
	l.mu.Unlock()
	l.save()
}

// Quiet: shown 6+ days with zero opens and zero dwell.
func (l *Learned) Quiet(id string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	s := l.m[id]
	return s != nil && s.Shown >= 6 && s.Opened == 0 && s.Dwell == 0
}

func (l *Learned) save() {
	if l.path == "" {
		return
	}
	l.mu.Lock()
	b, err := json.Marshal(l.m)
	l.mu.Unlock()
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(l.path), 0o700)
	if os.WriteFile(l.path+".tmp", b, 0o600) == nil {
		_ = os.Rename(l.path+".tmp", l.path)
	}
}

// Days is how many days the node was counted as shown.
func (l *Learned) Days(id string) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	if s := l.m[id]; s != nil {
		return s.Shown
	}
	return 0
}
