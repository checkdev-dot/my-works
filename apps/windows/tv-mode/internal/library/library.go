// Package library is the one record of what Dev watches, saved and dropped, from every
// place he does it (the TV, the desk, the phone). HUB-DIRECTION.md section 4.2.
//
// It is additive: history.json keeps feeding Continue watching exactly as before, and
// the library records on top of it, from the same hooks. The package is pure (no
// network, no TMDB, no taste): the app resolves identities and hands in Reports; the
// store decides the state and writes the events. File: %APPDATA%\TVMode\library.json.
package library

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// States.
const (
	Watching = "watching"
	Finished = "finished"
	Saved    = "saved"
	Dropped  = "dropped"
)

// Event types.
const (
	EvPlay     = "play"
	EvProgress = "progress"
	EvFinish   = "finish"
	EvSave     = "save"
	EvDrop     = "drop"
	EvOpen     = "open"
)

const (
	// FinishPct is where a title counts as finished (the same line nextEpisode uses).
	FinishPct = 0.92
	// MaxEvents is how many events are kept; the oldest roll off.
	MaxEvents = 5000

	progressEvery = 5 * time.Minute  // one progress event per item per five minutes
	playGap       = 30 * time.Minute // silence this long makes the next report a new "play"
	openEvery     = time.Minute
	saveEvery     = 15 * time.Second // the file is rewritten at most this often for progress alone
)

// Item is one title, show, video or link.
type Item struct {
	ID        string   `json:"id"`   // "tv1396" | "movie27205" | "yt:dQw4w9WgXcQ" | "url:host/path" | "name:<title>" (not matched to TMDB yet)
	Kind      string   `json:"kind"` // movie | tv | yt | other
	Title     string   `json:"title"`
	Show      string   `json:"show,omitempty"` // series name when Kind is tv
	Img       string   `json:"img,omitempty"`  // the SOURCE address (the app registers it through imgURL when it builds a frame)
	URL       string   `json:"url,omitempty"`  // yt and other: the link
	Services  []string `json:"services,omitempty"`
	State     string   `json:"state"`
	Season    int      `json:"season,omitempty"`
	Episode   int      `json:"episode,omitempty"`
	EpTitle   string   `json:"epTitle,omitempty"`
	Pos       int      `json:"pos,omitempty"`
	Dur       int      `json:"dur,omitempty"`
	Pct       float64  `json:"pct,omitempty"`
	Added     int64    `json:"added"`               // first seen, ms
	LastAt    int64    `json:"lastAt"`              // last touched, ms
	LastWhere string   `json:"lastWhere,omitempty"` // tv | desk | phone
	LastSvc   string   `json:"lastSvc,omitempty"`
	Source    string   `json:"source,omitempty"`    // tv-poll | netflix-helper | helper | tv-open | desk-reporter | share | desk-open | desk-paste | desk-manual | watchlist
	DoneAt    int64    `json:"doneAt,omitempty"`    // when it became finished
	MarkAt    int64    `json:"markAt,omitempty"`    // when Dev last set its state by hand
	Abandoned bool     `json:"abandoned,omitempty"` // taste has been taught Abandon for it (once)
	Aliases   []string `json:"aliases,omitempty"`   // other names that mean this item ("name:<title>")
}

// Event is one thing that happened. Events are only ever added, and capped.
type Event struct {
	At      int64  `json:"at"`
	ID      string `json:"id"`
	Type    string `json:"type"` // play | progress | finish | save | drop | open
	Where   string `json:"where,omitempty"`
	Service string `json:"service,omitempty"`
	Pos     int    `json:"pos,omitempty"`
	Dur     int    `json:"dur,omitempty"`
	Se      int    `json:"se,omitempty"`
	Ep      int    `json:"ep,omitempty"`
}

// Report is what the app tells the store. The app has already worked out the identity.
type Report struct {
	Type     string
	ID       string
	Aliases  []string
	Kind     string
	Title    string
	Show     string
	Img      string
	URL      string
	Services []string
	Season   int
	Episode  int
	EpTitle  string
	Pos, Dur int
	Where    string // tv | desk | phone
	Service  string
	Source   string
	At       int64 // ms; zero is now
	Last     bool  // this is the last episode of the last season (a series is finished only then)
	Manual   bool  // Dev set it by hand: a finish or drop is a mark, "play" puts it back to watching
}

// Result says what Apply did.
type Result struct {
	Item         Item
	Created      bool
	StateChanged bool
	Wrote        bool // an event was written
	Finished     bool // a finish event was written for this episode or title
}

// Store is the library.
type Store struct {
	mu      sync.Mutex
	path    string
	items   map[string]*Item
	alias   map[string]string // alias -> id
	events  []Event
	done    map[string]bool // "id|se|ep" finish already written
	lastSav time.Time
	lastEv  map[string]Event // newest event per item (for the throttles)
}

type file struct {
	V      int     `json:"v"`
	Items  []*Item `json:"items"`
	Events []Event `json:"events"`
}

// DefaultPath is %APPDATA%\TVMode\library.json. Under go test it is a temp path (the
// same guard as history.DefaultPath): tests never touch Dev's real library.
func DefaultPath() string {
	if testing.Testing() {
		return filepath.Join(os.TempDir(), "tvmode-test-library", "library.json")
	}
	d, _ := os.UserConfigDir()
	return filepath.Join(d, "TVMode", "library.json")
}

// Open loads (or starts) the store at path. An empty path keeps everything in memory.
func Open(path string) *Store {
	s := &Store{path: path, items: map[string]*Item{}, alias: map[string]string{}, done: map[string]bool{}, lastEv: map[string]Event{}}
	if path != "" {
		if b, err := os.ReadFile(path); err == nil {
			var f file
			if json.Unmarshal(b, &f) == nil {
				for _, it := range f.Items {
					if it != nil && it.ID != "" {
						s.items[it.ID] = it
					}
				}
				s.events = f.Events
			}
		}
	}
	s.reindex()
	return s
}

func (s *Store) reindex() {
	s.alias = map[string]string{}
	s.done = map[string]bool{}
	s.lastEv = map[string]Event{}
	for id, it := range s.items {
		for _, a := range it.Aliases {
			s.alias[a] = id
		}
	}
	for _, e := range s.events {
		s.lastEv[e.ID] = e
		if e.Type == EvFinish {
			s.done[doneKey(e.ID, e.Se, e.Ep)] = true
		}
	}
}

func doneKey(id string, se, ep int) string {
	return id + "|" + strconv.Itoa(se) + "|" + strconv.Itoa(ep)
}

// find returns the item for an id or any alias.
func (s *Store) find(id string, aliases []string) *Item {
	if id != "" {
		if it, ok := s.items[id]; ok {
			return it
		}
		if to, ok := s.alias[id]; ok {
			return s.items[to]
		}
	}
	for _, a := range aliases {
		if to, ok := s.alias[a]; ok {
			if it := s.items[to]; it != nil {
				return it
			}
		}
		if it, ok := s.items[a]; ok {
			return it
		}
	}
	return nil
}

// Lookup finds an item by id or alias.
func (s *Store) Lookup(keys ...string) (Item, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, k := range keys {
		if k == "" {
			continue
		}
		if it := s.find(k, nil); it != nil {
			return *it, true
		}
	}
	return Item{}, false
}

// Get returns one item by id.
func (s *Store) Get(id string) (Item, bool) { return s.Lookup(id) }

func addUnique(l []string, add ...string) []string {
	for _, a := range add {
		if a == "" {
			continue
		}
		dup := false
		for _, x := range l {
			if x == a {
				dup = true
				break
			}
		}
		if !dup {
			l = append(l, a)
		}
	}
	return l
}

// Apply records one report: it creates or updates the item, writes the event and moves
// the state. Safe to call on every poll: progress is coalesced and the file is rewritten
// at most every 15 seconds unless something that matters changed.
func (s *Store) Apply(r Report) Result {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r.ID == "" && len(r.Aliases) == 0 {
		return Result{}
	}
	now := r.At
	if now == 0 {
		now = time.Now().UnixMilli()
	}
	if r.Where == "" {
		r.Where = "tv"
	}
	it := s.find(r.ID, r.Aliases)
	var res Result
	if it == nil {
		id := r.ID
		if id == "" {
			id = r.Aliases[0]
		}
		kind := r.Kind
		if kind == "" {
			kind = "other"
		}
		it = &Item{ID: id, Kind: kind, Added: now, State: ""}
		s.items[id] = it
		res.Created = true
	}
	// what the report knows about the item
	if r.Kind != "" && (it.Kind == "" || res.Created) {
		it.Kind = r.Kind
	}
	if r.Title != "" && it.Title == "" { // later names come from Rekey and SetMeta, never from a poll
		it.Title = r.Title
	}
	if r.Show != "" {
		it.Show = r.Show
	}
	if r.Img != "" && (it.Img == "" || r.Source == "share" || r.Source == "desk-paste") {
		it.Img = r.Img
	}
	if r.URL != "" && (it.URL == "" || r.Source == "share" || r.Source == "desk-paste") {
		it.URL = r.URL
	}
	it.Services = addUnique(it.Services, r.Services...)
	it.Services = addUnique(it.Services, r.Service)
	for _, a := range r.Aliases {
		if a != it.ID && s.alias[a] == "" {
			it.Aliases = addUnique(it.Aliases, a)
			s.alias[a] = it.ID
		}
	}
	prev := it.State
	prevAt := it.LastAt
	it.LastAt, it.LastWhere = now, r.Where
	if r.Service != "" {
		it.LastSvc = r.Service
	}
	if r.Source != "" {
		it.Source = r.Source
	}

	ev := Event{At: now, ID: it.ID, Where: r.Where, Service: r.Service, Pos: r.Pos, Dur: r.Dur, Se: r.Season, Ep: r.Episode}
	write := false

	switch r.Type {
	case EvSave:
		switch {
		case it.State == "" || it.State == Dropped || (r.Manual && it.State != Saved):
			it.State = Saved
			it.MarkAt = now
		}
		if res.Created || prev != it.State {
			ev.Type, write = EvSave, true
		}
	case EvDrop:
		if it.State != Dropped {
			it.State = Dropped
			it.MarkAt = now
			ev.Type, write = EvDrop, true
		}
	case EvOpen:
		switch it.State {
		case "", Saved:
			it.State = Watching
		}
		if le, ok := s.lastEv[it.ID]; !ok || le.Type != EvOpen || le.Where != r.Where || time.Duration(now-le.At)*time.Millisecond >= openEvery {
			ev.Type, write = EvOpen, true
		}
	case EvPlay, EvProgress, EvFinish:
		if r.Season > 0 || r.Episode > 0 {
			it.Season, it.Episode = r.Season, r.Episode
		}
		if r.EpTitle != "" {
			it.EpTitle = r.EpTitle
		}
		manualFinish := r.Manual && r.Type == EvFinish
		if manualFinish {
			it.State, it.Pct, it.DoneAt, it.MarkAt = Finished, 1, now, now
			ev.Type, write = EvFinish, true
			s.done[doneKey(it.ID, it.Season, it.Episode)] = true
			res.Finished = true
			break
		}
		if r.Manual && r.Type == EvPlay { // "back to watching"
			it.State, it.MarkAt = Watching, now
			ev.Type, write = EvPlay, true
			break
		}
		if r.Dur > 0 {
			it.Pos, it.Dur = r.Pos, r.Dur
			it.Pct = float64(r.Pos) / float64(r.Dur)
			if it.Pct > 1 {
				it.Pct = 1
			}
		}
		over := it.Pct >= FinishPct && r.Dur > 0
		if over {
			dk := doneKey(it.ID, it.Season, it.Episode)
			if !s.done[dk] {
				s.done[dk] = true
				ev.Type, write, res.Finished = EvFinish, true, true
			}
			switch {
			case it.Kind != "tv":
				if it.State != Finished {
					it.State, it.DoneAt = Finished, now
				}
			case r.Last:
				if it.State != Finished {
					it.State, it.DoneAt = Finished, now
				}
			default: // an episode is done, the series goes on
				if it.State != Watching && it.State != Finished {
					it.State = Watching
				}
			}
		} else {
			// playing again (or still) below the line: he is watching it, whatever it was before
			it.State = Watching
			if !write {
				le, had := s.lastEv[it.ID]
				switch {
				case !had || res.Created || prev != Watching || time.Duration(now-prevAt)*time.Millisecond > playGap || le.Se != r.Season || le.Ep != r.Episode:
					ev.Type, write = EvPlay, true
				case time.Duration(now-le.At)*time.Millisecond >= progressEvery:
					ev.Type, write = EvProgress, true
				}
			}
		}
	}
	res.StateChanged = prev != it.State
	if write {
		s.events = append(s.events, ev)
		if len(s.events) > MaxEvents {
			s.events = append([]Event(nil), s.events[len(s.events)-MaxEvents:]...)
		}
		s.lastEv[it.ID] = ev
		res.Wrote = true
	}
	res.Item = *it
	if res.Created || res.StateChanged || res.Wrote || time.Since(s.lastSav) > saveEvery {
		s.save()
	}
	return res
}

// Patch is what a late TMDB match adds to an item.
type Patch struct {
	Kind     string
	Title    string
	Show     string
	Img      string
	Services []string
}

// Rekey renames an item to its TMDB key once the match is known. When newID already
// exists the two are merged (the more recently touched one wins the progress fields);
// the old id stays as an alias so a later report under it lands on the same item.
func (s *Store) Rekey(oldID, newID string, p Patch) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if oldID == newID || newID == "" {
		return false
	}
	old := s.items[oldID]
	if old == nil {
		if to, ok := s.alias[oldID]; ok {
			old = s.items[to]
		}
	}
	if old == nil {
		return false
	}
	oldID = old.ID
	delete(s.items, oldID)
	var dst *Item
	if ex, ok := s.items[newID]; ok {
		dst = ex
		// merge: keep the fresher item's progress and state
		if old.LastAt > dst.LastAt {
			dst.State, dst.Season, dst.Episode, dst.EpTitle, dst.Pos, dst.Dur, dst.Pct = old.State, old.Season, old.Episode, old.EpTitle, old.Pos, old.Dur, old.Pct
			dst.LastAt, dst.LastWhere, dst.LastSvc, dst.Source = old.LastAt, old.LastWhere, old.LastSvc, old.Source
			dst.DoneAt, dst.MarkAt = old.DoneAt, old.MarkAt
		}
		if old.Added > 0 && (dst.Added == 0 || old.Added < dst.Added) {
			dst.Added = old.Added
		}
		dst.Abandoned = dst.Abandoned || old.Abandoned
	} else {
		cp := *old
		cp.ID = newID
		dst = &cp
		s.items[newID] = dst
	}
	dst.Services = addUnique(dst.Services, old.Services...)
	dst.Aliases = addUnique(dst.Aliases, old.Aliases...)
	dst.Aliases = addUnique(dst.Aliases, oldID)
	for _, a := range dst.Aliases {
		s.alias[a] = newID
	}
	if p.Kind != "" {
		dst.Kind = p.Kind
	}
	if p.Title != "" {
		dst.Title = p.Title
	}
	if p.Show != "" {
		dst.Show = p.Show
	}
	if p.Img != "" && dst.Img == "" {
		dst.Img = p.Img
	}
	dst.Services = addUnique(dst.Services, p.Services...)
	for i := range s.events {
		if s.events[i].ID == oldID {
			s.events[i].ID = newID
		}
	}
	for k := range s.done {
		if strings.HasPrefix(k, oldID+"|") {
			s.done[newID+strings.TrimPrefix(k, oldID)] = true
			delete(s.done, k)
		}
	}
	delete(s.lastEv, oldID)
	for i := len(s.events) - 1; i >= 0; i-- {
		if s.events[i].ID == newID {
			s.lastEv[newID] = s.events[i]
			break
		}
	}
	s.save()
	return true
}

// SetMeta fills in a title or picture the first report did not have (a YouTube title
// from oEmbed, a TMDB backdrop). It never overwrites a picture that is there.
func (s *Store) SetMeta(key, title, img string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	it := s.find(key, nil)
	if it == nil {
		return false
	}
	ch := false
	if title != "" && it.Title != title {
		it.Title, ch = title, true
	}
	if img != "" && it.Img == "" {
		it.Img, ch = img, true
	}
	if ch {
		s.save()
	}
	return ch
}

// FirstAbandon says whether this is the first time item id is dropped for taste: it
// returns true once, then false for ever after.
func (s *Store) FirstAbandon(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	it := s.find(id, nil)
	if it == nil || it.Abandoned {
		return false
	}
	it.Abandoned = true
	s.save()
	return true
}

// Remove deletes an item and its events.
func (s *Store) Remove(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	it := s.find(id, nil)
	if it == nil {
		return false
	}
	id = it.ID
	for _, a := range it.Aliases {
		delete(s.alias, a)
	}
	delete(s.items, id)
	keep := s.events[:0:0]
	for _, e := range s.events {
		if e.ID != id {
			keep = append(keep, e)
		}
	}
	s.events = keep
	delete(s.lastEv, id)
	for k := range s.done {
		if strings.HasPrefix(k, id+"|") {
			delete(s.done, k)
		}
	}
	s.save()
	return true
}

// List returns items (a copy), newest touched first. state "" or "all" is every one;
// "continue" is the same as watching.
func (s *Store) List(state string) []Item {
	s.mu.Lock()
	defer s.mu.Unlock()
	if state == "continue" {
		state = Watching
	}
	out := make([]Item, 0, len(s.items))
	for _, it := range s.items {
		if state == "" || state == "all" || it.State == state {
			out = append(out, *it)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].LastAt != out[j].LastAt {
			return out[i].LastAt > out[j].LastAt
		}
		return out[i].ID < out[j].ID
	})
	return out
}

// Events returns a copy of the newest n events (all when n <= 0), oldest first.
func (s *Store) Events(n int) []Event {
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.events
	if n > 0 && len(e) > n {
		e = e[len(e)-n:]
	}
	return append([]Event(nil), e...)
}

// Len is how many items there are.
func (s *Store) Len() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.items)
}

func (s *Store) save() {
	s.lastSav = time.Now()
	if s.path == "" {
		return
	}
	f := file{V: 1, Events: s.events}
	for _, it := range s.items {
		f.Items = append(f.Items, it)
	}
	sort.Slice(f.Items, func(i, j int) bool { return f.Items[i].ID < f.Items[j].ID })
	b, err := json.Marshal(f)
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(s.path), 0o700)
	tmp := s.path + ".tmp"
	if os.WriteFile(tmp, b, 0o600) == nil {
		_ = os.Rename(tmp, s.path)
	}
}

// MergeFile folds the library at src into the one at dst (same .tmp-then-rename save).
// Items match by id or alias; the item touched later (LastAt) wins its progress fields,
// while Services and Aliases are unioned, Added is the earlier, Abandoned sticks. Events
// are unioned (exact duplicates dropped), oldest first, capped at MaxEvents. It returns
// how many items and events came from src.
func MergeFile(dst, src string) (items, events int, err error) {
	if _, err := os.Stat(src); err != nil {
		return 0, 0, err
	}
	d, s := Open(dst), Open(src)
	for _, it := range s.List("") {
		it := it
		t := d.find(it.ID, it.Aliases)
		if t == nil {
			d.items[it.ID] = &it
			items++
			continue
		}
		services := addUnique(append([]string(nil), t.Services...), it.Services...)
		aliases := addUnique(append([]string(nil), t.Aliases...), it.Aliases...)
		if it.ID != t.ID {
			aliases = addUnique(aliases, it.ID)
		}
		added := t.Added
		if it.Added > 0 && (added == 0 || it.Added < added) {
			added = it.Added
		}
		ab := t.Abandoned || it.Abandoned
		if it.LastAt > t.LastAt {
			id := t.ID
			*t = it
			t.ID = id
			items++
		} else {
			if t.Title == "" {
				t.Title = it.Title
			}
			if t.Img == "" {
				t.Img = it.Img
			}
			if t.URL == "" {
				t.URL = it.URL
			}
		}
		t.Services, t.Aliases, t.Added, t.Abandoned = services, aliases, added, ab
	}
	have := map[Event]bool{}
	for _, e := range d.events {
		have[e] = true
	}
	for _, e := range s.events {
		if !have[e] {
			have[e] = true
			d.events = append(d.events, e)
			events++
		}
	}
	if items == 0 && events == 0 {
		return 0, 0, nil
	}
	sort.SliceStable(d.events, func(i, j int) bool { return d.events[i].At < d.events[j].At })
	if len(d.events) > MaxEvents {
		d.events = append([]Event(nil), d.events[len(d.events)-MaxEvents:]...)
	}
	d.reindex()
	d.save()
	return items, events, nil
}
