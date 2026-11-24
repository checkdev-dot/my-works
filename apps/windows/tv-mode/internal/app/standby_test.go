package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func standbyApp() *App {
	return &App{o: Options{Standby: true}, hub: newHub(), startCh: make(chan struct{}, 1), st: State{T: "state", App: "launcher"}}
}

// A phone that authenticates (or reconnects) while the TV is down gets {t:"standby"}, not state.
func TestStandbyFrame(t *testing.T) {
	a := standbyApp()
	cl := newClient(true, nil)
	a.queueInitial(cl)
	if got := string(<-cl.send); got != `{"t":"standby"}` {
		t.Fatalf("first frame = %s, want standby", got)
	}
	a.broadcast() // state frames are held back in standby
	select {
	case b := <-cl.send:
		t.Fatalf("unexpected frame %s", b)
	default:
	}
	// once the TV is up the phone gets state
	a.tvState.Store(tvOn)
	cl2 := newClient(true, nil)
	a.queueInitial(cl2)
	if got := string(<-cl2.send); got[:17] != `{"t":"state","app` {
		t.Fatalf("after start: %s", got)
	}
}

// In standby only "start" does anything, and only once.
func TestStandbyGate(t *testing.T) {
	a := standbyApp()
	if !a.standbyGate("key", "") || len(a.startCh) != 0 {
		t.Fatal("key must be swallowed without starting")
	}
	if !a.standbyGate("start", "") || len(a.startCh) != 1 {
		t.Fatal("start must request a start")
	}
	a.standbyGate("start", "")
	if len(a.startCh) != 1 {
		t.Fatal("second start must be ignored")
	}
	a.tvState.Store(tvOn)
	if a.standbyGate("key", "") {
		t.Fatal("frames flow once the TV is on")
	}
}

// The shortcut's second tvmode.exe hands off to the running one over /api/start.
func TestSingleInstanceHandoff(t *testing.T) {
	a := standbyApp()
	mux := http.NewServeMux()
	mux.HandleFunc("/api/start", a.startHandler)
	mux.HandleFunc("/api/pair", func(w http.ResponseWriter, r *http.Request) {})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	// -standby second start: only detects the running instance, starts nothing
	if running, err := Handoff(srv.URL, false); !running || err != nil {
		t.Fatalf("detect: running=%v err=%v", running, err)
	}
	if len(a.startCh) != 0 {
		t.Fatal("-standby must not start the TV")
	}
	// plain start: the running standby instance is asked to start
	if running, err := Handoff(srv.URL, true); !running || err != nil {
		t.Fatalf("handoff: running=%v err=%v", running, err)
	}
	select {
	case <-a.startCh:
	case <-time.After(time.Second):
		t.Fatal("running instance did not get the start")
	}
	// already running full TV: no new start (it is brought to front instead)
	a.tvState.Store(tvOn)
	if running, err := Handoff(srv.URL, true); !running || err != nil {
		t.Fatalf("full: running=%v err=%v", running, err)
	}
	if len(a.startCh) != 0 {
		t.Fatal("full TV must not queue a start")
	}
	// a plain GET or a POST without the header is refused
	resp, _ := http.Post(srv.URL+"/api/start", "text/plain", nil)
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("no header: %d", resp.StatusCode)
	}
	resp.Body.Close()
	// nothing listening: not running, start normally
	srv.Close()
	if running, _ := Handoff(srv.URL, true); running {
		t.Fatal("closed server reported running")
	}
}

// In standby the shutdown hold works: "power arm" runs the same 10 s countdown (the phone is
// told with a standby frame that carries it), "power cancel" stops it. DryRun and a context
// that is cancelled at the end: this test must never shut a real PC down.
func TestStandbyPower(t *testing.T) {
	a := standbyApp()
	a.o.DryRun = true
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	a.ctx = ctx
	if !a.standbyGate("power", "arm") {
		t.Fatal("power must be handled in standby")
	}
	wait := func(want bool) {
		t.Helper()
		for i := 0; i < 100; i++ {
			_, on := a.standbyFrame()["countdown"]
			if on == want {
				return
			}
			time.Sleep(20 * time.Millisecond)
		}
		t.Fatalf("countdown running = %v, want %v", !want, want)
	}
	wait(true)
	if got := a.standbyFrame()["countdown"]; got != 10 && got != 9 {
		t.Fatalf("countdown = %v, want 10 (or 9)", got)
	}
	a.standbyGate("power", "cancel")
	wait(false)
}
