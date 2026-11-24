package app

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestNfLiveQueue(t *testing.T) {
	var l nfLive
	now := time.Now()
	if l.push(nfCmd{A: "playpause"}, now) {
		t.Fatal("queued with no helper report")
	}
	l.set(Media{Playing: true, Pos: 100, Dur: 2700}, now)
	if m, ok := l.get(now); !ok || m.Dur != 2700 {
		t.Fatal("live media missing")
	}
	if padMode("netflix", &Media{Dur: 2700}, false, false) != "player" {
		t.Fatal("helper media should make the pad a player")
	}
	l.push(nfCmd{A: "seekby", Ms: 10000}, now)
	l.push(nfCmd{A: "seekby", Ms: 10000}, now)
	l.push(nfCmd{A: "subs"}, now)
	got := l.take(now.Add(time.Second))
	if len(got) != 2 || got[0].A != "seekby" || got[0].Ms != 20000 || got[1].A != "subs" {
		t.Fatalf("queue: %+v", got)
	}
	l.push(nfCmd{A: "seekto", Ms: 5000}, now)
	if got := l.take(now.Add(3 * time.Second)); len(got) != 0 {
		t.Fatalf("stale command ran: %+v", got)
	}
	if _, ok := l.get(now.Add(4 * time.Second)); ok {
		t.Fatal("stale media still live")
	}
	if l.push(nfCmd{A: "skip"}, now.Add(4*time.Second)) {
		t.Fatal("queued after the helper went quiet")
	}
}

func TestMediaAdRateJSON(t *testing.T) {
	var l nfLive
	now := time.Now()
	l.setAs("prime", Media{Playing: true, Pos: 100, Dur: 2700, Rate: 1.5}, now)
	if !l.setAdMedia(false, now) {
		t.Fatal("ad start should change the frame")
	}
	m, _ := l.get(now)
	b, _ := json.Marshal(m)
	if !strings.Contains(string(b), `"ad":true`) || strings.Contains(string(b), "rate") || m.Playing || m.Dur != 2700 {
		t.Fatalf("ad frame: %s", b)
	}
	l.setAs("prime", Media{Playing: true, Pos: 101, Dur: 2700, Rate: 1.5}, now)
	m, _ = l.get(now)
	b, _ = json.Marshal(m)
	if strings.Contains(string(b), `"ad"`) || !strings.Contains(string(b), `"rate":1.5`) {
		t.Fatalf("show frame: %s", b)
	}
}

func TestTracksUnavailableScoped(t *testing.T) {
	if !tracksUnavailable("tracks: unavailable") || tracksUnavailable("settrack: unavailable") || tracksUnavailable("speed: unavailable") {
		t.Fatal("unavailable mapping must be for tracks errors only")
	}
}
