package app

import (
	"testing"

	"tvmode/internal/history"
)

func TestMergeEp(t *testing.T) {
	// the helper's bare report takes the episode from what TV Mode opened at that address
	e := history.Entry{Service: "netflix", URL: "https://www.netflix.com/watch/80104628", Title: "Netflix"}
	mergeEp(&e, epInfo{Title: "Black Mirror", Show: "Black Mirror", Season: 3, Episode: 5})
	if e.Title != "Black Mirror" || e.Show != "Black Mirror" || e.Season != 3 || e.Episode != 5 {
		t.Fatalf("merge: %+v", e)
	}
	// the page's own episode wins; a name for another episode is not copied
	e = history.Entry{Show: "X", Season: 1, Episode: 2}
	mergeEp(&e, epInfo{Show: "X", Season: 1, Episode: 3, EpTitle: "Other"})
	if e.Episode != 2 || e.EpTitle != "" {
		t.Fatalf("page lost: %+v", e)
	}
	if !epComplete(history.Entry{Title: "Movie"}) || epComplete(history.Entry{Show: "S", EpTitle: "n"}) {
		t.Fatal("complete")
	}
}

func TestHistoryOneCardPerAddress(t *testing.T) {
	s := history.Open(t.TempDir() + "/h.json")
	s.Note(history.Entry{Service: "netflix", URL: "https://www.netflix.com/watch/1", Title: "Black Mirror", Group: "netflix|black mirror|1", Pos: 10, Dur: 3000})
	s.Note(history.Entry{Service: "netflix", URL: "https://www.netflix.com/watch/1", Title: "Black Mirror", Show: "Black Mirror", Season: 3, Episode: 5, Group: "netflix|black mirror", Pos: 20, Dur: 3000})
	if l := s.List(); len(l) != 1 || l[0].Episode != 5 {
		t.Fatalf("list: %+v", l)
	}
	if !s.SetEp("https://www.netflix.com/watch/1", 3, 5, "Men Against Fire") || s.List()[0].EpTitle != "Men Against Fire" {
		t.Fatal("SetEp")
	}
}
