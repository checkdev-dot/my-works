package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"tvmode/internal/certs"
	"tvmode/internal/history"
	"tvmode/internal/library"
)

func wjson(t *testing.T, p string, v any) {
	t.Helper()
	b, _ := json.Marshal(v)
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, b, 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestMigrateFrom(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("APPDATA", filepath.Join(tmp, "real"))
	srcR := filepath.Join(tmp, "pkg", "Roaming", "TVMode")
	srcL := filepath.Join(tmp, "pkg", "Local", "TVMode")
	dstR := certs.Dir()
	dstL := filepath.Join(tmp, "reallocal", "TVMode")

	// history: A only real, B both (source newer), C both (real newer), D only source
	wjson(t, filepath.Join(dstR, "history.json"), []history.Entry{
		{Service: "x", URL: "https://h/a", Title: "A", Dur: 10, At: 100},
		{Service: "x", URL: "https://h/b", Title: "B-real", Dur: 10, At: 100},
		{Service: "x", URL: "https://h/c", Title: "C-real", Dur: 10, At: 300},
	})
	wjson(t, filepath.Join(srcR, "history.json"), []history.Entry{
		{Service: "x", URL: "https://h/b?q=1", Title: "B-src", Dur: 10, At: 200},
		{Service: "x", URL: "https://h/c", Title: "C-src", Dur: 10, At: 200},
		{Service: "x", URL: "https://h/d", Title: "D", Dur: 10, At: 150},
	})
	// library: tv1 in both (source newer), movie2 only in the source; events are unioned
	rl := library.Open(filepath.Join(dstR, "library.json"))
	rl.Apply(library.Report{Type: library.EvPlay, ID: "tv1", Kind: "tv", Title: "One", Pos: 10, Dur: 100, Services: []string{"netflix"}, At: 1000})
	sl := library.Open(filepath.Join(srcR, "library.json"))
	sl.Apply(library.Report{Type: library.EvPlay, ID: "tv1", Kind: "tv", Title: "One", Pos: 50, Dur: 100, Services: []string{"prime"}, At: 2000})
	sl.Apply(library.Report{Type: library.EvSave, ID: "movie2", Kind: "movie", Title: "Two", At: 1500})
	// config: the real pairing stays; empty fields are filled
	wjson(t, filepath.Join(dstR, "config.json"), certs.Config{Token: "REALTOKEN", RelayKey: "REALKEY", AimGain: 2400, PadGain: 2.2})
	wjson(t, filepath.Join(srcR, "config.json"), certs.Config{Token: "PKGTOKEN", RelayKey: "PKGKEY", Remote: "https://r.example", AimGain: 1, EverPaired: true})
	wjson(t, filepath.Join(srcR, "tmdb.json"), map[string]string{"apiKey": "SECRET"})
	// cache files
	wjson(t, filepath.Join(srcL, "cache", "links.json"), map[string]string{"k1": "u1", "k2": "u2"})
	wjson(t, filepath.Join(dstL, "cache", "links.json"), map[string]string{"k1": "real"})
	wjson(t, filepath.Join(srcL, "cache", "rated.json"), map[string]rating{"a": {V: 1, At: 5}, "b": {V: -1, At: 1}})
	wjson(t, filepath.Join(dstL, "cache", "rated.json"), map[string]rating{"b": {V: 1, At: 9}})

	now := time.Date(2026, 11, 12, 10, 0, 0, 0, time.UTC)
	line, err := migrateFrom(srcR, srcL, dstR, dstL, now)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(line, "REAL") || strings.Contains(line, "PKG") || strings.Contains(line, "SECRET") {
		t.Fatalf("summary leaks a value: %s", line)
	}

	got := map[string]string{}
	for _, e := range history.Open(filepath.Join(dstR, "history.json")).List() {
		got[history.Key(e.URL)] = e.Title
	}
	want := map[string]string{"h/a": "A", "h/b": "B-src", "h/c": "C-real", "h/d": "D"}
	if len(got) != len(want) {
		t.Fatalf("history %v", got)
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("history %s = %q want %q", k, got[k], v)
		}
	}

	lib := library.Open(filepath.Join(dstR, "library.json"))
	if lib.Len() != 2 {
		t.Fatalf("library items %d", lib.Len())
	}
	it, _ := lib.Get("tv1")
	if it.Pos != 50 || len(it.Services) != 2 {
		t.Errorf("tv1 newest should win and services union: %+v", it)
	}
	if len(lib.Events(0)) < 3 {
		t.Errorf("events %d", len(lib.Events(0)))
	}

	b, _ := os.ReadFile(filepath.Join(dstR, "config.json"))
	var c certs.Config
	_ = json.Unmarshal(b, &c)
	if c.Token != "REALTOKEN" || c.RelayKey != "REALKEY" {
		t.Errorf("real pairing changed")
	}
	if c.Remote != "https://r.example" || !c.EverPaired || c.AimGain != 2400 {
		t.Errorf("config fill wrong: %+v", c)
	}
	if _, err := os.Stat(filepath.Join(dstR, "tmdb.json")); err != nil {
		t.Errorf("tmdb.json not copied")
	}

	var links map[string]string
	b, _ = os.ReadFile(filepath.Join(dstL, "cache", "links.json"))
	_ = json.Unmarshal(b, &links)
	if links["k1"] != "real" || links["k2"] != "u2" {
		t.Errorf("links %v", links)
	}
	r := openRated(filepath.Join(dstL, "cache", "rated.json"))
	if r.m["a"].V != 1 || r.m["b"].V != 1 {
		t.Errorf("rated %v", r.m)
	}

	// backups, rename, nothing deleted
	bk := filepath.Join(dstR, "backup-20261112-100000")
	for _, p := range []string{"real/config.json", "pkg/config.json", "pkg/history.json"} {
		if _, err := os.Stat(filepath.Join(bk, filepath.FromSlash(p))); err != nil {
			t.Errorf("backup missing %s", p)
		}
	}
	if _, err := os.Stat(srcR); err == nil {
		t.Errorf("source not renamed")
	}
	if _, err := os.Stat(srcR + ".merged-20261112"); err != nil {
		t.Errorf("renamed folder missing")
	}
	// second run: source gone, nothing happens
	if l, err := migrateFrom(srcR, srcL, dstR, dstL, now); l != "" || err != nil {
		t.Errorf("second run: %q %v", l, err)
	}
}

func TestMigrateNoRealConfigCopiesSource(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("APPDATA", filepath.Join(tmp, "real"))
	srcR := filepath.Join(tmp, "pkg", "Roaming", "TVMode")
	wjson(t, filepath.Join(srcR, "config.json"), certs.Config{Token: "T", RelayKey: "K"})
	if _, err := migrateFrom(srcR, filepath.Join(tmp, "nolocal"), certs.Dir(), filepath.Join(tmp, "l"), time.Now()); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(filepath.Join(certs.Dir(), "config.json"))
	if !strings.Contains(string(b), `"T"`) {
		t.Errorf("config not copied: %s", b)
	}
}

func TestFillEmptyNames(t *testing.T) {
	d := certs.Config{Token: "a", RelayKey: "b", YouTubeUA: "keep"}
	got := certs.FillEmpty(&d, certs.Config{Token: "x", RelayKey: "y", Remote: "r", YouTubeUA: "other", EverPaired: true})
	if d.Token != "a" || d.RelayKey != "b" || d.YouTubeUA != "keep" || d.Remote != "r" || !d.EverPaired {
		t.Errorf("%+v", d)
	}
	if strings.Join(got, ",") != "remote,everPaired" {
		t.Errorf("names %v", got)
	}
}
