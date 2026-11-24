package library

import (
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func ms(base time.Time, plus time.Duration) int64 { return base.Add(plus).UnixMilli() }

func TestDefaultPathIsTempUnderTest(t *testing.T) {
	p := DefaultPath()
	if !strings.Contains(p, "tvmode-test-library") {
		t.Fatalf("DefaultPath under go test = %q, want a temp path", p)
	}
}

func TestMovieFinishesAtTheLine(t *testing.T) {
	s := Open("")
	b := time.Now()
	r := Report{Type: EvProgress, ID: "movie1", Kind: "movie", Title: "Arrival", Service: "prime", Pos: 1000, Dur: 6000, At: ms(b, 0)}
	if res := s.Apply(r); !res.Created || res.Item.State != Watching || !res.Wrote {
		t.Fatalf("first report = %+v", res)
	}
	r.Pos, r.At = 5400, ms(b, 10*time.Minute) // 0.90: not yet
	if res := s.Apply(r); res.Item.State != Watching || res.Finished {
		t.Fatalf("0.90 = %+v", res)
	}
	r.Pos, r.At = 5520, ms(b, 11*time.Minute) // 0.92
	res := s.Apply(r)
	if res.Item.State != Finished || !res.Finished || res.Item.DoneAt == 0 {
		t.Fatalf("0.92 = %+v", res)
	}
	// the credits keep reporting: one finish event only, state stays
	r.Pos, r.At = 5900, ms(b, 12*time.Minute)
	if res := s.Apply(r); res.Finished || res.Item.State != Finished {
		t.Fatalf("after finish = %+v", res)
	}
	n := 0
	for _, e := range s.Events(0) {
		if e.Type == EvFinish {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("finish events = %d, want 1", n)
	}
}

func TestSeriesEpisodeFinishDoesNotFinishTheShow(t *testing.T) {
	s := Open("")
	b := time.Now()
	ep := func(se, e, pos int, at time.Duration, last bool) Result {
		return s.Apply(Report{Type: EvProgress, ID: "tv5", Kind: "tv", Title: "Dark", Show: "Dark", Season: se, Episode: e, Pos: pos, Dur: 3000, Service: "netflix", At: ms(b, at), Last: last})
	}
	if r := ep(1, 1, 100, 0, false); r.Item.State != Watching {
		t.Fatalf("start = %+v", r)
	}
	r := ep(1, 1, 2900, time.Hour, false)
	if !r.Finished || r.Item.State != Watching {
		t.Fatalf("episode done = %+v (the show must stay watching)", r)
	}
	if r := ep(1, 2, 100, 2*time.Hour, false); r.Item.State != Watching || r.Item.Episode != 2 {
		t.Fatalf("next episode = %+v", r)
	}
	r = ep(3, 8, 2900, 3*time.Hour, true)
	if r.Item.State != Finished {
		t.Fatalf("last episode of the last season = %+v, want finished", r)
	}
	// a second look at the same last episode (the async "is it the last?" answer) still finishes it
	s2 := Open("")
	s2.Apply(Report{Type: EvProgress, ID: "tv9", Kind: "tv", Title: "X", Season: 1, Episode: 3, Pos: 2900, Dur: 3000, At: ms(b, 0)})
	if it, _ := s2.Get("tv9"); it.State != Watching {
		t.Fatalf("before the answer: %s", it.State)
	}
	if res := s2.Apply(Report{Type: EvFinish, ID: "tv9", Season: 1, Episode: 3, Pos: 2900, Dur: 3000, Last: true, At: ms(b, time.Second)}); res.Item.State != Finished {
		t.Fatalf("after the answer = %+v", res)
	}
}

func TestPlayingAgainBringsBackFinishedAndDropped(t *testing.T) {
	s := Open("")
	b := time.Now()
	s.Apply(Report{Type: EvProgress, ID: "movie2", Kind: "movie", Title: "Heat", Pos: 100, Dur: 1000, At: ms(b, 0)})
	s.Apply(Report{Type: EvFinish, ID: "movie2", Manual: true, At: ms(b, time.Minute)})
	if it, _ := s.Get("movie2"); it.State != Finished || it.MarkAt == 0 {
		t.Fatalf("manual finish = %+v", it)
	}
	if res := s.Apply(Report{Type: EvProgress, ID: "movie2", Pos: 50, Dur: 1000, At: ms(b, time.Hour)}); res.Item.State != Watching || !res.StateChanged {
		t.Fatalf("rewatch = %+v", res)
	}
	s.Apply(Report{Type: EvDrop, ID: "movie2", Manual: true, At: ms(b, 2*time.Hour)})
	if it, _ := s.Get("movie2"); it.State != Dropped {
		t.Fatalf("drop = %s", it.State)
	}
	if res := s.Apply(Report{Type: EvProgress, ID: "movie2", Pos: 60, Dur: 1000, At: ms(b, 3*time.Hour)}); res.Item.State != Watching {
		t.Fatalf("resumed after drop = %+v", res)
	}
}

func TestSaveOpenAndDrop(t *testing.T) {
	s := Open("")
	b := time.Now()
	res := s.Apply(Report{Type: EvSave, ID: "yt:abcdefghijk", Kind: "yt", Title: "A talk", URL: "https://www.youtube.com/watch?v=abcdefghijk", Where: "phone", Source: "share", At: ms(b, 0)})
	if !res.Created || res.Item.State != Saved || res.Item.LastWhere != "phone" {
		t.Fatalf("save = %+v", res)
	}
	// the same share again: nothing new
	if res := s.Apply(Report{Type: EvSave, ID: "yt:abcdefghijk", Where: "phone", Source: "share", At: ms(b, time.Second)}); res.Created || res.StateChanged || res.Wrote {
		t.Fatalf("second share = %+v", res)
	}
	if n := len(s.Events(0)); n != 1 {
		t.Fatalf("events = %d, want 1", n)
	}
	// opened: saved becomes watching; open events within a minute coalesce
	if res := s.Apply(Report{Type: EvOpen, ID: "yt:abcdefghijk", Where: "desk", Source: "desk-open", At: ms(b, time.Minute)}); res.Item.State != Watching || !res.StateChanged {
		t.Fatalf("open = %+v", res)
	}
	s.Apply(Report{Type: EvOpen, ID: "yt:abcdefghijk", Where: "desk", At: ms(b, time.Minute+5*time.Second)})
	opens := 0
	for _, e := range s.Events(0) {
		if e.Type == EvOpen {
			opens++
		}
	}
	if opens != 1 {
		t.Fatalf("open events = %d, want 1", opens)
	}
	if !s.FirstAbandon("yt:abcdefghijk") || s.FirstAbandon("yt:abcdefghijk") {
		t.Fatal("FirstAbandon must be true once and then false")
	}
	if list := s.List(Watching); len(list) != 1 {
		t.Fatalf("List(watching) = %d", len(list))
	}
	if !s.Remove("yt:abcdefghijk") || s.Len() != 0 || len(s.Events(0)) != 0 {
		t.Fatalf("remove left %d items %d events", s.Len(), len(s.Events(0)))
	}
}

func TestProgressEventsAreCoalesced(t *testing.T) {
	s := Open("")
	b := time.Now()
	for i := 0; i < 400; i++ { // a report every 5 s for 33 minutes
		s.Apply(Report{Type: EvProgress, ID: "movie3", Kind: "movie", Title: "Long", Pos: 100 + i*5, Dur: 20000, At: ms(b, time.Duration(i)*5*time.Second)})
	}
	if n := len(s.Events(0)); n > 8 {
		t.Fatalf("%d events for 400 polls (want one play and a progress every five minutes)", n)
	}
}

func TestEventsCap(t *testing.T) {
	s := Open("")
	b := time.Now()
	for i := 0; i < MaxEvents+300; i++ {
		s.Apply(Report{Type: EvSave, ID: "url:x" + strconv.Itoa(i), Kind: "other", Title: "x", At: ms(b, time.Duration(i)*time.Second)})
	}
	if n := len(s.Events(0)); n != MaxEvents {
		t.Fatalf("events = %d, want %d", n, MaxEvents)
	}
	if e := s.Events(1); len(e) != 1 || e[0].ID != "url:x"+strconv.Itoa(MaxEvents+299) {
		t.Fatalf("newest event = %+v", e)
	}
}

func TestRekeyMovesAndMerges(t *testing.T) {
	s := Open("")
	b := time.Now()
	// a title seen by name only, then matched to TMDB
	s.Apply(Report{Type: EvProgress, ID: "name:gravityfalls", Aliases: []string{"name:gravityfalls"}, Kind: "tv", Title: "Gravity Falls", Season: 1, Episode: 2, Pos: 60, Dur: 1400, Service: "jiohotstar", At: ms(b, 0)})
	if !s.Rekey("name:gravityfalls", "tv40075", Patch{Kind: "tv", Title: "Gravity Falls", Img: "https://image.tmdb.org/t/p/w780/x.jpg", Services: []string{"jiohotstar"}}) {
		t.Fatal("rekey failed")
	}
	if _, ok := s.Get("name:gravityfalls"); !ok {
		t.Fatal("the old name must still find the item (alias)")
	}
	it, _ := s.Get("tv40075")
	if it.ID != "tv40075" || it.Img == "" || it.Season != 1 {
		t.Fatalf("after rekey = %+v", it)
	}
	if s.Len() != 1 {
		t.Fatalf("items = %d", s.Len())
	}
	for _, e := range s.Events(0) {
		if e.ID != "tv40075" {
			t.Fatalf("event left on %q", e.ID)
		}
	}
	// a report under the old name lands on the same item
	if res := s.Apply(Report{Type: EvProgress, ID: "name:gravityfalls", Aliases: []string{"name:gravityfalls"}, Season: 1, Episode: 3, Pos: 10, Dur: 1400, At: ms(b, time.Hour)}); res.Created || res.Item.ID != "tv40075" || res.Item.Episode != 3 {
		t.Fatalf("report under the alias = %+v", res)
	}
	// two items for one show: merged, the fresher progress wins, one item left
	s.Apply(Report{Type: EvProgress, ID: "name:othername", Aliases: []string{"name:othername"}, Kind: "tv", Title: "Other", Season: 4, Episode: 1, Pos: 5, Dur: 1000, At: ms(b, 2*time.Hour)})
	if !s.Rekey("name:othername", "tv40075", Patch{}) {
		t.Fatal("merge failed")
	}
	if s.Len() != 1 {
		t.Fatalf("items after merge = %d", s.Len())
	}
	it, _ = s.Get("tv40075")
	if it.Season != 4 || it.Title != "Gravity Falls" {
		t.Fatalf("merged = %+v", it)
	}
	if s.Rekey("nothing", "tv1", Patch{}) {
		t.Fatal("rekey of a missing item must say no")
	}
}

func TestPersistsAndReloads(t *testing.T) {
	p := filepath.Join(t.TempDir(), "sub", "library.json")
	s := Open(p)
	b := time.Now()
	s.Apply(Report{Type: EvSave, ID: "movie9", Kind: "movie", Title: "Saved film", Where: "phone", Source: "share", At: ms(b, 0)})
	s.Apply(Report{Type: EvProgress, ID: "tv1", Kind: "tv", Title: "Show", Season: 1, Episode: 1, Pos: 2900, Dur: 3000, At: ms(b, time.Second)})
	s2 := Open(p)
	if s2.Len() != 2 {
		t.Fatalf("reloaded %d items", s2.Len())
	}
	if it, ok := s2.Get("movie9"); !ok || it.State != Saved {
		t.Fatalf("reloaded saved = %+v", it)
	}
	// the finish already written for S1E1 must not be written again after a restart
	if res := s2.Apply(Report{Type: EvProgress, ID: "tv1", Pos: 2950, Dur: 3000, Season: 1, Episode: 1, At: ms(b, time.Minute)}); res.Finished {
		t.Fatal("finish written twice across a restart")
	}
}

func TestEmptyPathNeverWrites(t *testing.T) {
	s := Open("")
	s.Apply(Report{Type: EvSave, ID: "movie1", Kind: "movie", Title: "x"})
	if s.path != "" {
		t.Fatal("an empty path must stay empty")
	}
}
