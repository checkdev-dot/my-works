package app

import (
	"path/filepath"
	"testing"

	"tvmode/internal/history"
	"tvmode/internal/taste"
	"tvmode/internal/tmdb"
)

func TestRateMarksLearnsAndPersists(t *testing.T) {
	dir := t.TempDir()
	a := &App{hub: newHub()}
	a.ld = &launcherData{hist: history.Open(filepath.Join(dir, "h.json")), byKey: map[string]tmdb.Item{}, extra: map[string]tmdb.Item{}, imgSrc: map[string]string{}, trail: map[string]string{}, details: map[string]tmdb.Details{}, links: map[string]string{}, taste: taste.Open(""), rated: openRated(filepath.Join(dir, "rated.json"))}
	it := tmdb.Item{ID: 1, Kind: "movie", Title: "Arrival", Service: "prime", Genres: []string{"Science Fiction"}}
	k := itemKey(it)
	a.ld.byKey[k] = it
	base := a.ld.taste.Affinity(tasteOf(it, ""))

	a.rate(k, 1)
	if !a.isRated(k) {
		t.Fatal("liked title is not marked")
	}
	liked := a.ld.taste.Affinity(tasteOf(it, ""))
	if liked <= base {
		t.Errorf("liking did not raise the taste: %v -> %v", base, liked)
	}
	a.rate(k, -1)
	if r, _ := a.ld.rated.get(k); r.V != -1 {
		t.Errorf("mark not changed to -1: %+v", r)
	}
	if a.ld.taste.Affinity(tasteOf(it, "")) >= liked {
		t.Error("changing to Not for me did not lower the taste")
	}
	// saved: a new store reads the mark back
	if r, ok := openRated(filepath.Join(dir, "rated.json")).get(k); !ok || r.V != -1 || r.Title != "Arrival" {
		t.Errorf("mark not saved: %+v %v", r, ok)
	}
	a.rate(k, 0)
	if a.isRated(k) {
		t.Error("Not watched did not take the mark off")
	}
}
