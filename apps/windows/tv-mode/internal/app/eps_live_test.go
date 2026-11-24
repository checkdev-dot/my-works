package app

import (
	"os"
	"testing"

	"tvmode/internal/history"
	"tvmode/internal/tmdb"
)

// The phone's Episodes tab for what is playing, on real TMDB: a Netflix card the helper
// noted (Pantheon S1E2), no title opened from TV Mode's home. Read-only.
func TestEpisodesForPlayingLive(t *testing.T) {
	if os.Getenv("TVMODE_SCOUT_LIVE") == "" {
		t.Skip()
	}
	c, err := tmdb.Load()
	if err != nil {
		t.Skip("no TMDB key")
	}
	a := &App{}
	a.ld = &launcherData{hist: history.Open(t.TempDir() + "/h.json"), imgSrc: map[string]string{}, trail: map[string]string{}, details: map[string]tmdb.Details{}, byKey: map[string]tmdb.Item{}, extra: map[string]tmdb.Item{}, links: map[string]string{}}
	a.ld.tm = c
	a.ld.hist.Note(history.Entry{Service: "netflix", URL: "https://www.netflix.com/watch/81331581", Title: "Pantheon", Show: "Pantheon", Season: 1, Episode: 2, Group: "netflix|pantheon", Pos: 700, Dur: 2483})
	for _, show := range []string{"netflix"} {
		k := a.showKey(show)
		if k == "" {
			t.Fatalf("no show key for %s", show)
		}
		l, code := a.episodesFor(k, 0)
		t.Logf("%s: key %s code %d season %d/%d next S%dE%d eps %d", show, k, code, l.Season, l.Seasons, l.NextSe, l.NextEp, len(l.Eps))
		if code != 200 || len(l.Eps) == 0 || l.Title == "" {
			t.Fatalf("episodes: code %d, %d eps", code, len(l.Eps))
		}
		if l2, c2 := a.episodesFor(k, 2); c2 != 200 || l2.Season != 2 {
			t.Errorf("season 2: code %d season %d", c2, l2.Season)
		}
	}
	// a card the helper noted with only a title: still a series
	a.ld.hist.Note(history.Entry{Service: "prime", URL: "https://www.primevideo.com/detail/x", Title: "The Boys", Group: "prime|the boys", Pos: 100, Dur: 3600})
	k := a.showKey("prime")
	if k == "" {
		t.Fatal("title-only card: no show key")
	}
	a.indexKeys()
	if _, ok := a.ld.byKey[k]; !ok {
		t.Error("show key lost after a shelf refresh: a later tap would do nothing")
	}
	// nothing playing on that app: no key, the phone says so (no hang)
	if k := a.showKey("hotstar"); k != "" {
		t.Errorf("hotstar should have no show, got %s", k)
	}
}
