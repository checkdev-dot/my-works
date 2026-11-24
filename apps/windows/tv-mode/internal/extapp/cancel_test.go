package extapp

import (
	"errors"
	"os"
	"testing"
	"time"

	"tvmode/internal/winsys"
)

// self launches this test binary instead of Chrome: it rejects the flags and exits at once.
func self() (string, error) { return os.Args[0], nil }

func TestCloseCancelsOpenInFlight(t *testing.T) {
	defer UseChromeForTest(self)()
	a := New()
	done := make(chan error, 1)
	go func() { done <- a.Open("https://www.netflix.com/", winsys.Monitor{W: 800, H: 600}) }()
	time.Sleep(600 * time.Millisecond)
	a.Close()
	select {
	case err := <-done:
		if !errors.Is(err, ErrCancelled) {
			t.Fatalf("got %v, want ErrCancelled", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Open kept waiting after Close")
	}
}

func TestCloseCancelsQueuedOpen(t *testing.T) {
	defer UseChromeForTest(self)()
	a := New()
	a.openMu.Lock() // another Open holds the slot
	done := make(chan error, 1)
	go func() { done <- a.Open("https://www.netflix.com/", winsys.Monitor{W: 800, H: 600}) }()
	time.Sleep(200 * time.Millisecond)
	a.Close() // Home while queued
	a.openMu.Unlock()
	select {
	case err := <-done:
		if !errors.Is(err, ErrCancelled) {
			t.Fatalf("got %v, want ErrCancelled", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("queued Open was not cancelled")
	}
}
