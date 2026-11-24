package app

import (
	"math"
	"testing"
	"time"
)

const deg = math.Pi / 180

// rig feeds the ratchet 30 ms gyro frames, like the phone does.
type rig struct {
	r      ratchet
	t      time.Time
	y, p   float64
	counts map[string]int
}

func newRig() *rig {
	g := &rig{t: time.Now(), counts: map[string]int{}}
	g.r.step(0, 0, g.t, 0)
	return g
}

// move turns to (yaw, pitch) degrees over ms, then holds still for hold ms.
func (g *rig) move(yaw, pitch float64, ms, hold int) map[string]int {
	got := map[string]int{}
	n := max(1, ms/30)
	y0, p0 := g.y, g.p
	for i := 1; i <= n+hold/30; i++ {
		f := min(1, float64(i)/float64(n))
		g.y, g.p = y0+(yaw*deg-y0)*f, p0+(pitch*deg-p0)*f
		g.t = g.t.Add(30 * time.Millisecond)
		if d, k := g.r.step(g.y, g.p, g.t, 0); k > 0 {
			got[d] += k
		}
	}
	return got
}

func TestRatchetSlowTurnIsExact(t *testing.T) {
	g := newRig()
	if got := g.move(4, 0, 300, 0); len(got) != 0 {
		t.Fatalf("under a detent stepped %v", got)
	}
	if got := g.move(5.5, 0, 200, 100); got["right"] != 1 || len(got) != 1 {
		t.Fatalf("one detent right = %v", got)
	}
	for _, y := range []float64{4.6, 5.4, 4.8, 5.2} { // resting on the boundary
		if got := g.move(y, 0, 60, 0); len(got) != 0 {
			t.Fatalf("jitter at boundary stepped %v", got)
		}
	}
	if got := g.move(-0.2, 0, 400, 100); got["left"] != 1 || len(got) != 1 {
		t.Fatalf("turning back = %v", got)
	}
}

func TestRatchetFlickTravelsByForce(t *testing.T) {
	soft := newRig().move(12, 0, 90, 300) // ~130 deg/s
	hard := newRig().move(30, 0, 90, 300) // ~330 deg/s
	if soft["right"] < 2 || hard["right"] <= soft["right"] || len(soft) != 1 || len(hard) != 1 {
		t.Fatalf("soft %v hard %v", soft, hard)
	}
	t.Logf("soft flick %d cards, hard flick %d cards", soft["right"], hard["right"])
	// the wrist bounces back a few degrees after a flick: no step back
	g := newRig()
	g.move(30, 0, 90, 60)
	if got := g.move(24, 0, 90, 200); got["left"] != 0 {
		t.Fatalf("rebound stepped back %v", got)
	}
}

func TestRatchetSecondFlickGoesFurther(t *testing.T) {
	one := newRig().move(20, 0, 90, 300)["right"]
	g := newRig()
	g.move(20, 0, 90, 150)
	g.move(16, 0, 300, 0) // ease back slowly between flicks
	two := g.move(36, 0, 90, 300)["right"]
	t.Logf("first flick %d cards, second %d", one, two)
	if two <= one {
		t.Fatalf("second flick %d, first %d", two, one)
	}
}

func TestRatchetRowsAreOneAtATime(t *testing.T) {
	g := newRig()
	if got := g.move(0, -14, 200, 400); got["down"] != 1 || len(got) != 1 {
		t.Fatalf("a firm tilt down = %v", got)
	}
	if got := g.move(0, -12, 150, 300); len(got) != 0 { // the hand rising back a little
		t.Fatalf("rebound after a row = %v", got)
	}
	if got := g.move(3, -16, 300, 300); len(got) != 0 { // a small sideways drift mid-row
		t.Fatalf("drift = %v", got)
	}
}

func TestRatchetFreezeOnPress(t *testing.T) {
	g := newRig()
	g.r.freeze(g.t.Add(200 * time.Millisecond))
	if got := g.move(-8, -10, 90, 0); len(got) != 0 { // the jolt of pressing OK
		t.Fatalf("jolt stepped %v", got)
	}
}

// Over the relay, frames arrive in bunches: ten at once, then a gap. Speed is
// measured on the phone's own timestamps, so a slow turn stays a slow turn.
func TestRatchetBunchedFramesAreNotFlicks(t *testing.T) {
	var r ratchet
	now, ts := time.Now(), 1000.0
	r.step(0, 0, now, ts)
	cards := 0
	for i := 1; i <= 40; i++ { // 20 deg over 1.2 s, 30 ms apart on the phone
		ts += 30
		if i%10 == 0 {
			now = now.Add(300 * time.Millisecond) // the bunch arrives together
		}
		if d, n := r.step(float64(i)*0.5*deg, 0, now, ts); d == "right" {
			cards += n
		} else if n > 0 {
			t.Fatalf("stepped %q", d)
		}
	}
	if cards > 4 {
		t.Fatalf("a slow 20 deg turn moved %d cards (a bunch read as a flick)", cards)
	}
	if cards < 2 {
		t.Fatalf("a slow 20 deg turn moved only %d cards", cards)
	}
}
