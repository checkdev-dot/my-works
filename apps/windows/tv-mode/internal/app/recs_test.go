package app

import (
	"testing"

	"tvmode/internal/history"
	"tvmode/internal/library"
	"tvmode/internal/taste"
)

// A title he already played is not a new pick: not in a row, not in the banner. Cause: only
// titles marked watched were left out, and history drops a title at 95 percent, so a finished
// film (known only to the library) and a half-watched one (history) both came back.
func TestPlayedTitlesAreNotRecommended(t *testing.T) {
	a := occTestApp(t, "2026-11-12T21:30")
	a.ld.lib = library.Open("")
	fin := a.ld.data.Shelves[2].Items[0]  // "Title 3.1": finished, in the library only
	half := a.ld.data.Shelves[3].Items[0] // "Title 4.1": half-watched, in history
	a.ld.lib.Apply(library.Report{Type: library.EvFinish, ID: itemKey(fin), Kind: fin.Kind, Title: fin.Title, Manual: true})
	a.ld.hist.Note(history.Entry{Service: "netflix", URL: "https://www.netflix.com/watch/1", Title: half.Title, Pos: 3600, Dur: 7200})
	f := a.rowsFrame()
	for _, gone := range []string{fin.Title, half.Title} {
		for _, s := range f.Shelves {
			for _, c := range s.Items {
				if c.Title == gone {
					t.Errorf("%q still recommended in %s", gone, s.ID)
				}
			}
		}
		for mode, l := range f.Hero {
			for _, h := range l {
				if h.K == "pick" && h.Title == gone {
					t.Errorf("%q still a banner pick (%s)", gone, mode)
				}
			}
		}
	}
	if len(f.Shelves) < 5 {
		t.Errorf("only %d shelves left", len(f.Shelves))
	}
}

// A "last opened" placeholder or a YouTube video newest in history used to wipe
// Because you watched; the next real title is the reason instead.
func TestBecauseSkipsPlaceholders(t *testing.T) {
	l := []history.Entry{{Opened: true, Service: "netflix", Title: "Netflix"}, {Service: "youtube", Title: "a video"}, {Service: "prime", Title: "Dune"}, {Service: "netflix", Title: "Older"}}
	if e, ok := becauseSource(l); !ok || e.Title != "Dune" {
		t.Fatalf("got %+v %v", e, ok)
	}
	if _, ok := becauseSource(l[:2]); ok {
		t.Fatal("placeholders only: no reason")
	}
}

// The same title must not sit in the same place every day, and a day is stable.
func TestDailyShuffleMovesNearEqualTitles(t *testing.T) {
	a := occTestApp(t, "2026-11-12T10:00")
	for i := 0; i < 5; i++ {
		a.ld.taste.Learn(taste.Title{Kind: "tv", Service: "netflix", GIDs: []int{18}, Lang: "en", Year: "2025", Vote: 8, Votes: 5000}, taste.Finished)
	}
	order := func() string {
		s := ""
		for _, it := range a.rankShelf(a.ld.data.Shelves[9]) { // a score row: the canned items differ by ~1 percent
			s += itemKey(it) + " "
		}
		return s
	}
	day1, again := order(), order()
	setNow(t, "2026-11-13T10:00")
	if day1 != again {
		t.Error("the same day must give the same order")
	}
	if day1 == order() {
		t.Error("the next day gave the identical order")
	}
}
