package app

import (
	"errors"
	"os"
	"testing"
	"time"

	"tvmode/internal/extapp"
	"tvmode/internal/winsys"
)

// Home while Chrome is still opening: closeExternal has no window to close but must cancel the Open.
func TestCloseExternalCancelsOpenInFlight(t *testing.T) {
	defer extapp.UseChromeForTest(func() (string, error) { return os.Args[0], nil })()
	a := extTestApp(t)
	done := make(chan error, 1)
	go func() { done <- a.ext.Open("https://www.netflix.com/", winsys.Monitor{W: 800, H: 600}) }()
	time.Sleep(600 * time.Millisecond)
	a.closeExternal()
	select {
	case err := <-done:
		if !errors.Is(err, extapp.ErrCancelled) {
			t.Fatalf("got %v, want ErrCancelled", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Open kept waiting after closeExternal")
	}
}

// No TV monitor: Chrome must not open on the desk monitor.
func TestOpenExternalRefusesWithoutTV(t *testing.T) {
	a := extTestApp(t)
	a.monsFn = func() []winsys.Monitor { return []winsys.Monitor{testWork} } // Display 1 is gone
	if !a.tvMissing() {
		t.Fatal("TV should be missing")
	}
	a.o.Display = 0 // a deliberate primary-monitor choice stays allowed
	if a.tvMissing() {
		t.Fatal("Display 0 is not missing")
	}
}
