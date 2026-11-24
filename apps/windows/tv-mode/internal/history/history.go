// Package history keeps "Continue watching": the last titles seen playing in
// each service page, in %APPDATA%\TVMode\history.json.
package history

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

// Entry is one title.
type Entry struct {
	Service string `json:"service"`
	URL     string `json:"url"`
	Title   string `json:"title"`
	Pos     int    `json:"pos"`
	Dur     int    `json:"dur"`
	Img     string `json:"img"`
	At      int64  `json:"at"`
	// what the page showed
	Show    string `json:"show,omitempty"` // series name (Title is the show or the movie)
	Season  int    `json:"season,omitempty"`
	Episode int    `json:"episode,omitempty"`
	EpTitle string `json:"epTitle,omitempty"`
	Channel string `json:"channel,omitempty"`
	Group   string `json:"group,omitempty"`  // episodes of one show share it; latest wins
	Opened  bool   `json:"opened,omitempty"` // only "last opened" (no page access, Netflix in Chrome)
}

// GroupKey identifies the card: the show for episodes, else the page.
func (e Entry) GroupKey() string {
	if e.Group != "" {
		return e.Group
	}
	return Key(e.URL)
}

// Left is the minutes remaining, rounded up.
func (e Entry) Left() int {
	if e.Dur <= 0 || e.Pos >= e.Dur {
		return 0
	}
	return (e.Dur - e.Pos + 59) / 60
}

// Line is the second line of the card: "S1 E3 · 24 min left".
func (e Entry) Line() string {
	var p []string
	if e.Opened {
		return "Last opened " + time.UnixMilli(e.At).Format("15:04")
	}
	if e.Season > 0 && e.Episode > 0 {
		p = append(p, fmt.Sprintf("S%d E%d", e.Season, e.Episode))
	} else if e.Episode > 0 {
		p = append(p, fmt.Sprintf("Ep %d", e.Episode))
	}
	if e.Channel != "" {
		p = append(p, e.Channel)
	}
	if e.Dur > 0 {
		p = append(p, fmt.Sprintf("%d min left", e.Left()))
	}
	return strings.Join(p, "  ·  ")
}

// Pct is how far through the title is, 0..1.
func (e Entry) Pct() float64 {
	if e.Dur <= 0 {
		return 0
	}
	return float64(e.Pos) / float64(e.Dur)
}

// Store is the list, newest first, at most Max.
type Store struct {
	mu      sync.Mutex
	path    string
	list    []Entry
	lastSav time.Time
	Max     int
}

// Open loads (or starts) the store at path.
func Open(path string) *Store {
	s := &Store{path: path, Max: 12}
	if b, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(b, &s.list)
	}
	// drop entries an older build recorded without a real title or group (the YouTube TV home)
	var keep []Entry
	for _, e := range s.list {
		if e.Service == "youtube" && !strings.HasPrefix(e.Group, "yt:") {
			continue
		}
		if e.Service == "netflix" && !e.Opened && strings.EqualFold(e.Title, "netflix") { // the helper before 1.2 sent the tab title
			continue
		}
		keep = append(keep, e)
	}
	s.list = keep
	// one card per address: a copy filed under the address (no show yet) goes when the show card has it
	keep = nil
	for _, e := range s.list {
		dup := false
		for _, x := range s.list {
			if e.Show == "" && x.Show != "" && x.Service == e.Service && Key(x.URL) == Key(e.URL) {
				dup = true
			}
		}
		if !dup {
			keep = append(keep, e)
		}
	}
	s.list = keep
	return s
}

// DefaultPath is %APPDATA%\TVMode\history.json.
func DefaultPath() string {
	if testing.Testing() { // tests never touch Dev's real history
		return filepath.Join(os.TempDir(), "tvmode-test-history", "history.json")
	}
	d, _ := os.UserConfigDir()
	return filepath.Join(d, "TVMode", "history.json")
}

// Key makes two URLs of the same title equal: YouTube by video id, others without query or fragment.
func Key(u string) string {
	p, err := url.Parse(u)
	if err != nil {
		return u
	}
	if strings.Contains(p.Host, "youtube.com") {
		if v := p.Query().Get("v"); v != "" {
			return "yt:" + v
		}
	}
	return p.Host + p.Path
}

// CleanTitle strips the service name the page appends to its title.
func CleanTitle(t string) string {
	t = strings.TrimSpace(t)
	for _, suf := range []string{" - Prime Video", " | Prime Video", " - Netflix", " | Netflix", " - YouTube", " | JioHotstar", " - JioHotstar", " - Disney+ Hotstar"} {
		t = strings.TrimSuffix(t, suf)
	}
	t = strings.TrimPrefix(t, "Watch ")
	t = strings.TrimPrefix(t, "Prime Video: ")
	return strings.TrimSpace(t)
}

// Note records progress. A title seen again moves to the front; one that is
// nearly finished is removed. Saved at most every 15 s unless the title changed.
// It reports whether the launcher should hear about a change.
func (s *Store) Note(e Entry) bool {
	if e.URL == "" || e.Dur <= 0 {
		return false
	}
	e.At = time.Now().UnixMilli()
	k := e.GroupKey()
	s.mu.Lock()
	defer s.mu.Unlock()
	changedTitle := len(s.list) == 0 || s.list[0].GroupKey() != k || Key(s.list[0].URL) != Key(e.URL)
	var rest []Entry
	for _, x := range s.list {
		// one card per show, and one per address: an entry filed under another name for this same page goes
		if x.GroupKey() != k && !(x.Service == e.Service && !x.Opened && Key(x.URL) == Key(e.URL)) {
			rest = append(rest, x)
		}
	}
	if e.Pct() >= 0.95 {
		s.list = rest
	} else {
		if e.Img == "" {
			for _, x := range s.list {
				if x.GroupKey() == k && x.Img != "" {
					e.Img = x.Img
				}
			}
		}
		s.list = append([]Entry{e}, rest...)
		if len(s.list) > s.Max {
			s.list = s.list[:s.Max]
		}
	}
	if changedTitle || time.Since(s.lastSav) > 15*time.Second {
		s.lastSav = time.Now()
		s.save()
		return true
	}
	return false
}

// NoteOpened records that a service was opened where no playback can be seen.
func (s *Store) NoteOpened(service, title, url string) {
	e := Entry{Service: service, URL: url, Title: title, Opened: true, Group: "opened:" + service, At: time.Now().UnixMilli()}
	s.mu.Lock()
	defer s.mu.Unlock()
	var rest []Entry
	for _, x := range s.list {
		if x.GroupKey() != e.Group {
			rest = append(rest, x)
		}
	}
	s.list = append([]Entry{e}, rest...)
	if len(s.list) > s.Max {
		s.list = s.list[:s.Max]
	}
	s.save()
}

// SetArt and SetTitle fill in what a service page did not give.
func (s *Store) SetArt(group, img string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.list {
		if s.list[i].GroupKey() == group && s.list[i].Img == "" {
			s.list[i].Img = img
			s.save()
			return true
		}
	}
	return false
}

func (s *Store) SetTitle(group, title, channel string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.list {
		if s.list[i].GroupKey() == group {
			s.list[i].Title, s.list[i].Channel = title, channel
			s.save()
			return true
		}
	}
	return false
}

// Has says whether a card for this group is already there.
func (s *Store) Has(group string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, x := range s.list {
		if x.GroupKey() == group {
			return true
		}
	}
	return false
}

// List returns a copy, newest first.
func (s *Store) List() []Entry {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Entry(nil), s.list...)
}

func (s *Store) save() {
	b, err := json.Marshal(s.list)
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(s.path), 0o700)
	tmp := s.path + ".tmp"
	if os.WriteFile(tmp, b, 0o600) == nil {
		_ = os.Rename(tmp, s.path)
	}
}

// SetEp fills in the season, episode and episode name of the entries for this address
// (without the query) where the page did not give them. It says whether anything changed.
func (s *Store) SetEp(url string, season, episode int, epTitle string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	ch := false
	for i := range s.list {
		x := &s.list[i]
		if strings.SplitN(x.URL, "?", 2)[0] != url {
			continue
		}
		if x.Season == 0 && x.Episode == 0 && season > 0 && episode > 0 {
			x.Season, x.Episode, ch = season, episode, true
		}
		if x.EpTitle == "" && epTitle != "" {
			x.EpTitle, ch = epTitle, true
		}
	}
	if ch {
		s.save()
	}
	return ch
}

// MergeFile folds the history at src into the one at dst (written back with the same
// .tmp-then-rename save). One entry per GroupKey; the newer At wins; newest first,
// capped at 12. It returns how many entries came from src (added or newer).
func MergeFile(dst, src string) (int, error) {
	if _, err := os.Stat(src); err != nil {
		return 0, err
	}
	d, s := Open(dst), Open(src)
	byKey := map[string]int{}
	for i, e := range d.list {
		byKey[e.GroupKey()] = i
	}
	n := 0
	for _, e := range s.list {
		k := e.GroupKey()
		if i, ok := byKey[k]; !ok {
			byKey[k] = len(d.list)
			d.list = append(d.list, e)
			n++
		} else if e.At > d.list[i].At {
			d.list[i] = e
			n++
		}
	}
	if n == 0 {
		return 0, nil
	}
	sort.SliceStable(d.list, func(i, j int) bool { return d.list[i].At > d.list[j].At })
	if len(d.list) > d.Max {
		d.list = d.list[:d.Max]
	}
	d.save()
	return n, nil
}
