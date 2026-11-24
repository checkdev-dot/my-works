package history

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestParseEpisode(t *testing.T) {
	cases := []struct {
		in   string
		s, e int
		rest string
	}{
		{"Season 1, Ep. 3 The Reckoning", 1, 3, "The Reckoning"},
		{"Season 2, Episode 10", 2, 10, ""},
		{"S1 E3 Pilot", 1, 3, "Pilot"},
		{"S01E03: Pilot", 1, 3, "Pilot"},
		{"Episode 58: Revenge and Rewards", 0, 58, "Revenge and Rewards"},
		{"Just a movie title", 0, 0, "Just a movie title"},
	}
	for _, c := range cases {
		s, e, r := ParseEpisode(c.in)
		if s != c.s || e != c.e || r != c.rest {
			t.Errorf("%q: got %d %d %q want %d %d %q", c.in, s, e, r, c.s, c.e, c.rest)
		}
	}
}

func TestFromPageYouTube(t *testing.T) {
	p := Page{Href: "https://www.youtube.com/tv#/watch?v=dQw4w9WgXcQ&t=12s", Title: "Never Gonna Give You Up - YouTube", HasVideo: true, Playing: true, Pos: 95, Dur: 212}
	e, ok := FromPage("youtube", p)
	if !ok || e.Group != "yt:dQw4w9WgXcQ" || e.Title != "Never Gonna Give You Up" || !strings.HasSuffix(e.URL, "&t=95s") || strings.Count(e.URL, "t=") != 1 {
		t.Fatalf("%+v ok=%v", e, ok)
	}
	if !strings.Contains(e.Img, "i.ytimg.com/vi/dQw4w9WgXcQ/") {
		t.Fatal(e.Img)
	}
	// the TV home, a paused video and a short clip are never items
	if _, ok := FromPage("youtube", Page{Href: "https://www.youtube.com/tv", Title: "YouTube on TV", HasVideo: true, Playing: true, Pos: 5, Dur: 300}); ok {
		t.Fatal("TV home recorded")
	}
	p.Playing = false
	if _, ok := FromPage("youtube", p); ok {
		t.Fatal("paused recorded")
	}
	p.Playing, p.Dur = true, 100
	if _, ok := FromPage("youtube", p); ok {
		t.Fatal("under two minutes recorded")
	}
}

func TestFromPagePrime(t *testing.T) {
	p := Page{Href: "https://www.primevideo.com/detail/0ABC/ref=atv_x?autoplay=1&t=300", Title: "Prime Video: The Boys", PTitle: "The Boys", PSub: "Season 4, Ep. 3 Glorious Five Year Plan", OGImage: "https://m.media-amazon.com/x.jpg", HasVideo: true, Playing: true, Pos: 1200, Dur: 3600}
	e, ok := FromPage("prime", p)
	if !ok || e.Title != "The Boys" || e.Season != 4 || e.Episode != 3 || e.EpTitle != "Glorious Five Year Plan" || e.Group != "prime|the boys" {
		t.Fatalf("%+v", e)
	}
	if strings.Contains(e.URL, "t=300") || !strings.Contains(e.URL, "autoplay=1") {
		t.Fatal(e.URL)
	}
	if e.Line() != "S4 E3  ·  40 min left" {
		t.Fatal(e.Line())
	}
	// no player title on screen (controls hidden): fall back to the tab title; a movie has no group
	m, ok := FromPage("prime", Page{Href: "https://www.primevideo.com/detail/0XYZ", Title: "Prime Video: Dune Part Two", HasVideo: true, Playing: true, Pos: 10, Dur: 9000})
	if !ok || m.Title != "Dune Part Two" || m.Group != "" || m.Show != "" {
		t.Fatalf("%+v", m)
	}
}

func TestFromPageHotstar(t *testing.T) {
	p := Page{Href: "https://www.hotstar.com/in/shows/bigg-boss/14714/bbtel-day-58-revenge-rewards-and-emotions/1271702184/watch", HasVideo: true, Playing: true, Pos: 60, Dur: 5400}
	e, ok := FromPage("jiohotstar", p)
	if !ok || e.Title != "Bigg Boss" || e.Group != "jiohotstar|bigg-boss" || e.EpTitle != "Bbtel Day 58 Revenge Rewards And Emotions" {
		t.Fatalf("%+v", e)
	}
	mv, ok := FromPage("jiohotstar", Page{Href: "https://www.hotstar.com/in/movies/moana/1271/watch", HasVideo: true, Playing: true, Pos: 60, Dur: 6000})
	if !ok || mv.Title != "Moana" || mv.Group != "" {
		t.Fatalf("%+v", mv)
	}
}

func TestEpisodesGroupIntoOneCard(t *testing.T) {
	s := Open(filepath.Join(t.TempDir(), "h.json"))
	mk := func(ep, pos int) Entry {
		return Entry{Service: "prime", URL: "https://p/ep" + string(rune('0'+ep)), Title: "Show", Show: "Show", Season: 1, Episode: ep, Group: "prime|show", Pos: pos, Dur: 3000}
	}
	s.Note(mk(1, 100))
	s.Note(mk(2, 200))
	s.Note(mk(3, 300))
	l := s.List()
	if len(l) != 1 || l[0].Episode != 3 {
		t.Fatalf("%+v", l)
	}
	s.Note(mk(3, 2900)) // 97 percent: done, the card goes
	if len(s.List()) != 0 {
		t.Fatal("finished episode should drop the card")
	}
	s.NoteOpened("netflix", "Netflix", "https://www.netflix.com/browse")
	if l = s.List(); len(l) != 1 || !l[0].Opened || !strings.HasPrefix(l[0].Line(), "Last opened ") {
		t.Fatalf("%+v", l)
	}
}
