package extapp

import (
	"testing"

	"tvmode/internal/winsys"
)

func TestKeyFor(t *testing.T) {
	for name, want := range map[string]struct {
		vk  uint16
		ext bool
	}{"up": {0x26, true}, "down": {0x28, true}, "left": {0x25, true}, "right": {0x27, true}, "ok": {0x0D, false}, "playpause": {0xB3, true}, "space": {0x20, false}, "backspace": {0x08, false}} {
		vk, ext, ok := KeyFor(name)
		if !ok || vk != want.vk || ext != want.ext {
			t.Errorf("%s: got %x %v %v", name, vk, ext, ok)
		}
	}
	if _, _, ok := KeyFor("bogus"); ok {
		t.Error("unknown key accepted")
	}
}

func TestSeekPresses(t *testing.T) {
	if n, c := SeekPresses(-10); n != "left" || c != 1 {
		t.Errorf("-10: %s %d", n, c)
	}
	if n, c := SeekPresses(30); n != "right" || c != 3 {
		t.Errorf("30: %s %d", n, c)
	}
}

func TestInputSizeAndCoords(t *testing.T) {
	if s := winsys.InputSize(); s != 40 {
		t.Fatalf("INPUT must be 40 bytes on amd64, got %d", s)
	}
	// TV monitor to the right of the primary: virtual screen starts at 0, 3840 wide
	if v := winsys.AbsCoord(1920, 0, 3840); v < 32760 || v > 32780 {
		t.Errorf("middle of 3840: %d", v)
	}
	if winsys.AbsCoord(0, 0, 3840) != 0 || winsys.AbsCoord(3839, 0, 3840) != 65535 {
		t.Error("ends")
	}
	// a monitor left of the primary: origin -1920
	if v := winsys.AbsCoord(-1920, -1920, 3840); v != 0 {
		t.Errorf("left edge: %d", v)
	}
}

func TestNewWindows(t *testing.T) {
	b := []winsys.Win{{HWND: 1, Title: "a"}, {HWND: 2, Title: "b"}}
	n := []winsys.Win{{HWND: 1, Title: "a"}, {HWND: 3, Title: "Netflix"}, {HWND: 4, Title: ""}}
	got := winsys.NewWindows(b, n)
	if len(got) != 1 || got[0].HWND != 3 {
		t.Fatalf("got %v", got)
	}
}

func TestPickNewPerService(t *testing.T) {
	nw := []winsys.Win{{HWND: 7, Title: "Some other window"}, {HWND: 8, Title: "Prime Video: The Boys"}}
	for _, u := range []string{"https://www.primevideo.com/detail/X", "https://www.amazon.in/gp/video/detail/X"} {
		if got := pickNew(nw, u, false, nil); len(got) != 1 || got[0].HWND != 8 {
			t.Errorf("%s: %v", u, got)
		}
	}
	if got := pickNew(nw, "https://www.hotstar.com/in", false, nil); len(got) != 0 {
		t.Errorf("hotstar must not take the Prime window: %v", got)
	}
	if got := pickNew([]winsys.Win{{HWND: 9, Title: "JioHotstar"}}, "https://www.hotstar.com/in/shows/x/1/e/2/watch", false, nil); len(got) != 1 {
		t.Errorf("hotstar: %v", got)
	}
}

func TestSweepAllowed(t *testing.T) {
	p := winsys.Monitor{X: 0, Y: 0, W: 1920, H: 1080, Primary: true}
	tv := winsys.Monitor{X: 1920, Y: 0, W: 1920, H: 1080}
	third := winsys.Monitor{X: 3840, Y: 0, W: 1920, H: 1080}
	if sweepAllowed([]winsys.Monitor{p}, p) {
		t.Fatal("1 monitor: never sweep")
	}
	if !sweepAllowed([]winsys.Monitor{p, tv}, tv) {
		t.Fatal("2 monitors, TV secondary: sweep")
	}
	if !sweepAllowed([]winsys.Monitor{p, tv, third}, third) {
		t.Fatal("3 monitors, TV secondary: sweep")
	}
	if sweepAllowed([]winsys.Monitor{p, tv}, p) {
		t.Fatal("TV is the primary: never sweep")
	}
}
