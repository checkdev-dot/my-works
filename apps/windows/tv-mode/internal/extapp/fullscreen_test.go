package extapp

import (
	"testing"

	"tvmode/internal/winsys"
)

// "Full" means ensure full screen: F11 only while the window has a title bar, never to toggle out.
func TestEnsureFullscreenPressesF11OnlyWithCaption(t *testing.T) {
	oldH, oldK, oldP := hasCaption, keyTap, placeWindow
	defer func() { hasCaption, keyTap, placeWindow = oldH, oldK, oldP }()
	presses, places := 0, 0
	keyTap = func(vk uint16, ext bool) error {
		if vk == vkF11 {
			presses++
		}
		return nil
	}
	placeWindow = func(h uintptr, x, y, w, hgt int) { places++ }
	caption := true
	hasCaption = func(uintptr) bool { return caption }
	a := New()
	mon := winsys.Monitor{W: 1920, H: 1080}

	if !a.ensureFullscreen(1, mon) || presses != 1 || places != 1 {
		t.Fatalf("with a title bar: presses=%d places=%d", presses, places)
	}
	caption = false
	if a.ensureFullscreen(1, mon) || presses != 1 || places != 1 {
		t.Fatalf("already full screen must press nothing: presses=%d places=%d", presses, places)
	}
	if pressF11IfCaption(1) || presses != 1 {
		t.Fatal("pressF11IfCaption toggled a full-screen window out")
	}
}

func TestPickNewLateTakesOnlyNewProcess(t *testing.T) {
	nw := []winsys.Win{{HWND: 5, Title: "Sign in", PID: 100}}
	known := map[uint32]bool{100: true}
	if got := pickNew(nw, "https://www.netflix.com/", true, known); len(got) != 0 {
		t.Fatalf("a window of an already-running Chrome without the site word must not be taken: %v", got)
	}
	if got := pickNew(nw, "https://www.netflix.com/", true, map[uint32]bool{}); len(got) != 1 {
		t.Fatalf("a window of a newly started process is taken late: %v", got)
	}
	if got := pickNew(nw, "https://www.netflix.com/", false, map[uint32]bool{}); len(got) != 0 {
		t.Fatalf("not before the late mark: %v", got)
	}
}

func TestBeginOpenGeneration(t *testing.T) {
	a := New()
	g1 := a.BeginOpen()
	g2 := a.BeginOpen()
	if a.IsLatest(g1) || !a.IsLatest(g2) {
		t.Fatal("only the newest open is latest")
	}
}
