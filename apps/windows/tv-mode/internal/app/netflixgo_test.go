package app

import (
	"strings"
	"testing"

	"tvmode/internal/tmdb"
)

// The episode note must go along even before the extension has said hello (right
// after a restart), or the first Netflix episode of the night lands on the search.
func TestNetflixGoNote(t *testing.T) {
	t.Setenv("TVMODE_TEST_ROWS", "1")
	extHelloAt.Store(0)
	a := &App{o: Options{Test: true}, ld: &launcherData{links: map[string]string{}}}
	it := tmdb.Item{Title: "Gravity Falls", Kind: "tv"}
	u := a.netflixGo(it, 2, 3)
	if !strings.HasPrefix(u, "https://www.netflix.com/search?q=Gravity+Falls#tvgo=") || !strings.Contains(u, `%22se%22:2`) {
		t.Fatal(u)
	}
	a.noteNetflixLinks(extLink{Title: "Gravity Falls", Eps: [][]any{{2.0, 3.0, "https://www.netflix.com/watch/9103"}, {1.0, 1.0, "https://evil.example/x"}}})
	if u := a.netflixGo(it, 2, 3); u != "https://www.netflix.com/watch/9103" {
		t.Fatal("known episode should open at once:", u)
	}
	if a.linkGet(linkKey("netflix", "Gravity Falls", 1, 1)) != "" {
		t.Fatal("a non-Netflix address got into the link book")
	}
	if withT("https://www.netflix.com/watch/1", 400) != "https://www.netflix.com/watch/1?t=397" {
		t.Fatal(withT("https://www.netflix.com/watch/1", 400))
	}
}
