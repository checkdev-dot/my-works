package app

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func probeTestPath(t *testing.T) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "prime-probe.jsonl")
	old := probePath
	probePath = func() string { return p }
	t.Cleanup(func() { probePath = old })
	return p
}

func TestProbeEndpointWritesLines(t *testing.T) {
	p := probeTestPath(t)
	a := &App{o: Options{Test: true}}
	h := lanGate(http.HandlerFunc(a.extBridge))
	do := func(remote, origin, body string) int {
		r := httptest.NewRequest("POST", "/api/ext/probe", strings.NewReader(body))
		r.RemoteAddr = remote
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Code
	}
	if c := do("192.168.1.20:50000", "chrome-extension://abc", `{"ev":"ad"}`); c != http.StatusForbidden {
		t.Fatalf("a probe from the LAN = %d, want 403", c)
	}
	if c := do("127.0.0.1:50000", "https://evil.example", `{"ev":"ad"}`); c != http.StatusForbidden {
		t.Fatalf("a probe from a web page = %d, want 403", c)
	}
	if _, err := os.Stat(p); err == nil {
		t.Fatal("a refused probe wrote the file")
	}
	if c := do("127.0.0.1:50000", "chrome-extension://abc", `{bad`); c != http.StatusBadRequest {
		t.Fatalf("bad json = %d, want 400", c)
	}
	for _, ev := range []string{"ad", "minute"} {
		if c := do("127.0.0.1:50000", "chrome-extension://abc", `{"ev":"`+ev+`","buttons":[{"l":"Subtitles"}]}`); c != http.StatusNoContent {
			t.Fatalf("probe %s = %d, want 204", ev, c)
		}
	}
	b, _ := os.ReadFile(p)
	lines := strings.Split(strings.TrimSpace(string(b)), "\n")
	if len(lines) != 2 || !strings.Contains(lines[0], `"ev":"ad"`) || !strings.Contains(lines[0], `"src":"helper"`) || !strings.Contains(lines[1], `"at":"`) {
		t.Fatalf("probe file: %q", b)
	}
}

func TestProbeFileStartsFreshWhenBig(t *testing.T) {
	p := probeTestPath(t)
	if err := os.WriteFile(p, []byte(strings.Repeat("x", probeMax)), 0o600); err != nil {
		t.Fatal(err)
	}
	probeNote("open", map[string]any{"svc": "prime", "url": "https://www.primevideo.com/detail/X"})
	b, _ := os.ReadFile(p)
	if len(b) > 1000 || !strings.Contains(string(b), `"ev":"open"`) {
		t.Fatalf("file not restarted: %d bytes", len(b))
	}
}

// a pair of playpause presses a second apart is one press; play and pause are never dropped
func TestPlayPauseRepeatDropped(t *testing.T) {
	var l nfLive
	now := time.Now()
	if l.repeatToggle(now, 1500*time.Millisecond) {
		t.Fatal("the first press is not a repeat")
	}
	if !l.repeatToggle(now.Add(time.Second), 1500*time.Millisecond) {
		t.Fatal("a second press 1 s later must be dropped")
	}
	if l.repeatToggle(now.Add(3*time.Second), 1500*time.Millisecond) {
		t.Fatal("a press 3 s later is a new press")
	}
}

func TestAdFlagAndSubtitlesNote(t *testing.T) {
	var l nfLive
	now := time.Now()
	l.set(Media{Playing: true, Pos: 5, Dur: 100}, now)
	if !l.setAd(true) || l.setAd(true) || !l.adNow(now) {
		t.Fatal("ad flag")
	}
	if !l.setAd(false) || l.adNow(now) {
		t.Fatal("ad end")
	}
}

func TestPrimePlayURL(t *testing.T) {
	in := "https://www.primevideo.com/detail/0KQI7X5NBHGYGBSQITKYQI018P?ref_=atv_plr_detail_play"
	got := primePlayURL("prime", in)
	if got != in+"&autoplay=1" && got != "https://www.primevideo.com/detail/0KQI7X5NBHGYGBSQITKYQI018P?autoplay=1&ref_=atv_plr_detail_play" {
		t.Fatalf("got %q", got)
	}
	for _, same := range []string{
		"https://www.primevideo.com/detail/X/?autoplay=1",
		"https://www.primevideo.com/detail/X/?autoplay=trailer",
		"https://www.primevideo.com/search?phrase=a",
		"https://www.primevideo.com/",
		"",
	} {
		if primePlayURL("prime", same) != same {
			t.Errorf("%q changed", same)
		}
	}
	if primePlayURL("jiohotstar", in) != in {
		t.Error("only Prime")
	}
}
