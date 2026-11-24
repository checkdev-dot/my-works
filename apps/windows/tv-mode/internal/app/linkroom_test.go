package app

import (
	"fmt"
	"testing"
	"time"
)

func fakeSess(sid string, authed bool, born time.Time) *session {
	s := &session{sid: sid, born: born}
	s.auth.Store(authed)
	s.lastRx.Store(born.UnixNano())
	return s
}

func TestReapable(t *testing.T) {
	now := time.Now()
	cases := []struct {
		name   string
		s      *session
		reaped bool
	}{
		{"new unsigned", fakeSess("a", false, now.Add(-10*time.Second)), false},
		{"old unsigned", fakeSess("b", false, now.Add(-31*time.Second)), true},
		{"signed in, quiet an hour", fakeSess("c", true, now.Add(-time.Hour)), false},
		{"signed in, quiet past idleDrop", fakeSess("d", true, now.Add(-idleDrop-time.Minute)), true},
	}
	for _, c := range cases {
		if got := reapable(c.s, now); got != c.reaped {
			t.Errorf("%s: reapable = %v, want %v", c.name, got, c.reaped)
		}
	}
}

func TestRoomFor(t *testing.T) {
	now := time.Now()
	sess := map[string]*session{}
	for i := 0; i < maxSessions; i++ {
		sid := fmt.Sprintf("p%02d", i)
		// odd ones never signed in; p01 is the oldest of them
		sess[sid] = fakeSess(sid, i%2 == 0, now.Add(-time.Duration(maxSessions-i)*time.Second))
	}
	if ev, full := roomFor(sess, "new"); full || ev != "p01" {
		t.Fatalf("full room with unsigned phones: evict %q full %v, want p01 false", ev, full)
	}
	if ev, full := roomFor(sess, "p05"); full || ev != "" {
		t.Fatalf("a re-join of a known sid must just replace: evict %q full %v", ev, full)
	}
	for _, s := range sess {
		s.auth.Store(true)
	}
	if _, full := roomFor(sess, "new"); !full {
		t.Fatal("all 16 signed in: the new join must be refused")
	}
	delete(sess, "p00")
	if ev, full := roomFor(sess, "new"); full || ev != "" {
		t.Fatalf("room not full: evict %q full %v", ev, full)
	}
}
