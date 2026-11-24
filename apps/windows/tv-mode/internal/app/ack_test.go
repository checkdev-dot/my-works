package app

import (
	"fmt"
	"testing"
)

func TestSeenRingDedupe(t *testing.T) {
	var r seenRing
	if r.dup("") || r.dup("") {
		t.Fatal("empty ids are never duplicates")
	}
	if r.dup("a1") {
		t.Fatal("first sight is not a duplicate")
	}
	if !r.dup("a1") {
		t.Fatal("second sight must be a duplicate (relay resend)")
	}
	for i := 0; i < seenKeep+5; i++ {
		r.dup(fmt.Sprintf("x%d", i))
	}
	if len(r.order) > seenKeep || len(r.set) > seenKeep {
		t.Fatalf("ring grew past %d: %d/%d", seenKeep, len(r.order), len(r.set))
	}
	if r.dup("a1") {
		t.Fatal("an id older than the ring is forgotten")
	}
	if !r.dup(fmt.Sprintf("x%d", seenKeep+4)) {
		t.Fatal("recent id must still be remembered")
	}
}

func TestAckFrame(t *testing.T) {
	if string(ackFrame("q-7")) != `{"id":"q-7","t":"ack"}` {
		t.Fatalf("got %s", ackFrame("q-7"))
	}
}

func TestOKRoute(t *testing.T) {
	cases := []struct {
		name string
		s    okState
		want string
	}{
		{"pointer wins", okState{PointerActive: true, Player: true, RingActive: true}, "click"},
		{"launcher", okState{OnLauncher: true}, "enter"},
		{"youtube keeps native keys", okState{YouTube: true, Player: true}, "enter"},
		{"ring is up", okState{RingActive: true, Player: true}, "ring"},
		{"player page", okState{Player: true}, "playpause"},
		{"browse page", okState{}, "focus"},
	}
	for _, c := range cases {
		if got := okRoute(c.s); got != c.want {
			t.Errorf("%s: got %s want %s", c.name, got, c.want)
		}
	}
}

func TestPct(t *testing.T) {
	xs := []float64{50, 10, 30, 20, 40}
	if pct(xs, 0.5) != 30 || pct(xs, 0.95) != 40 {
		t.Fatalf("p50 %v p95 %v", pct(xs, 0.5), pct(xs, 0.95))
	}
}

func TestHostOf(t *testing.T) {
	if hostOf("https://www.netflix.com/browse?x=1") != "www.netflix.com" {
		t.Fatal(hostOf("https://www.netflix.com/browse?x=1"))
	}
}
