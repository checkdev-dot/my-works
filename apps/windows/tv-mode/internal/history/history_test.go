package history

import (
	"path/filepath"
	"testing"
)

func TestNoteDedupTrimFinish(t *testing.T) {
	s := Open(filepath.Join(t.TempDir(), "h.json"))
	s.Max = 3
	for _, u := range []string{"https://x.com/a?x=1", "https://x.com/b", "https://x.com/c", "https://x.com/d"} {
		s.Note(Entry{Service: "prime", URL: u, Title: u, Pos: 10, Dur: 100})
	}
	l := s.List()
	if len(l) != 3 || l[0].URL != "https://x.com/d" {
		t.Fatalf("%v", l)
	}
	s.Note(Entry{Service: "prime", URL: "https://x.com/c?other=2", Title: "c", Pos: 50, Dur: 100})
	if l = s.List(); l[0].Title != "c" || len(l) != 3 {
		t.Fatalf("dedup by path: %v", l)
	}
	s.Note(Entry{Service: "prime", URL: "https://x.com/c", Pos: 99, Dur: 100})
	if l = s.List(); len(l) != 2 {
		t.Fatalf("finished title should drop: %v", l)
	}
	if Key("https://www.youtube.com/watch?v=abc&t=5") != "yt:abc" {
		t.Fatal("youtube key")
	}
	if CleanTitle("Watch Dune - Prime Video") != "Dune" {
		t.Fatal(CleanTitle("Watch Dune - Prime Video"))
	}
}

func TestYouTubeTimeParamIsNotChangedTitle(t *testing.T) {
	s := Open(filepath.Join(t.TempDir(), "h.json"))
	if !s.Note(Entry{Service: "youtube", URL: "https://www.youtube.com/watch?v=abc&t=5", Title: "v", Pos: 5, Dur: 100}) {
		t.Fatal("first note is a changed title")
	}
	if s.Note(Entry{Service: "youtube", URL: "https://www.youtube.com/watch?v=abc&t=20", Title: "v", Pos: 20, Dur: 100}) {
		t.Fatal("same video, only &t= differs: not a changed title")
	}
	if !s.Note(Entry{Service: "youtube", URL: "https://www.youtube.com/watch?v=xyz", Title: "w", Pos: 1, Dur: 100}) {
		t.Fatal("different video is a changed title")
	}
}
