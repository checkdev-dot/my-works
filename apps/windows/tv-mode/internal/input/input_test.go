package input

import (
	"testing"
	"time"
)

func TestReleaseUndoesJolt(t *testing.T) {
	c := &Controller{cfg: Config{AimGain: 1000}, vw: 1920, vh: 1080, x: 960, y: 540}
	c.Point(true)
	c.move(100, 0) // the aim
	time.Sleep(150 * time.Millisecond)
	c.move(40, 30) // the thumb lifting off Point
	c.Point(false)
	if x, y := c.Pos(); x != 1060 || y != 540 {
		t.Fatalf("after release got %.0f,%.0f, want 1060,540", x, y)
	}
	if !c.Active() {
		t.Fatal("pointer should stay active right after release")
	}
	c.SetHidden(true)
	if c.Active() {
		t.Fatal("hidden pointer (launcher) must not take OK")
	}
}

func TestEndPointerStopsOKClicking(t *testing.T) {
	c := &Controller{cfg: Config{AimGain: 1000}, vw: 1920, vh: 1080, x: 960, y: 540}
	c.move(10, 10)
	if !c.Active() {
		t.Fatal("pointer should be active after a move")
	}
	c.EndPointer() // a d-pad key was pressed
	if c.Active() {
		t.Fatal("after a d-pad key OK must not click the stale pointer spot")
	}
	c.Point(true) // pointing again brings it back
	if !c.Active() {
		t.Fatal("Point should make the pointer active again")
	}
}

func TestAimAbsLaser(t *testing.T) {
	c := &Controller{cfg: Config{AimGain: 1000}, vw: 1920, vh: 1080, x: 500, y: 400}
	c.AimAbs(1, 0.1, 0) // Point not pressed: ignored
	if x, _ := c.Pos(); x != 500 {
		t.Fatalf("aim before Point moved the pointer to %v", x)
	}
	c.Point(true)
	last := 500.0
	for i := 1; i <= 20; i++ {
		c.AimAbs(i, float64(i)*0.01, 0)
		x, _ := c.Pos()
		if x <= last-0.001 || x-last > 11 {
			t.Fatalf("step %d: x %.1f after %.1f, want a steady +10 move", i, x, last)
		}
		last = x
	}
	if last != 700 {
		t.Fatalf("target should be start + gain x angle = 700, got %.1f", last)
	}
	c.AimAbs(5, 0.9, 0) // old sequence number: ignored
	c.AimAbs(20, 0.9, 0)
	if x, _ := c.Pos(); x != 700 {
		t.Fatalf("out-of-order frame moved the pointer to %v", x)
	}
	c.AimAbs(21, 0, 0.05) // pitch up = pointer up
	if x, y := c.Pos(); x != 500 || y != 350 {
		t.Fatalf("got %.0f,%.0f want 500,350", x, y)
	}
}

func TestRecenterContinuesFromCentre(t *testing.T) {
	c := &Controller{cfg: Config{AimGain: 1000}, vw: 1920, vh: 1080, x: 500, y: 400}
	c.Point(true)
	c.AimAbs(1, 0.2, 0)
	c.mu.Lock()
	c.x, c.y = 960, 540
	c.rebase()
	c.mu.Unlock()
	c.AimAbs(2, 0.21, 0) // the phone moved a little further: continue from the centre
	if x, _ := c.Pos(); x < 969 || x > 971 {
		t.Fatalf("after re-centre the next frame jumped to %.1f, want ~970", x)
	}
}
