package app

import (
	"errors"
	"testing"
	"time"

	"tvmode/internal/extapp"
	"tvmode/internal/services"
)

// Open app A, then app B soon after: A's late result must not clear B's "opening" flag,
// mark B's service as running, or reset B's repeat guard.
func TestFinishOpenIgnoresSupersededOpen(t *testing.T) {
	a := &App{o: Options{Test: true}, ext: extapp.New(), st: State{T: "state", App: "launcher"}}
	sa, sb := services.Apps[0], services.Apps[1]
	for _, s := range services.Apps {
		if s.External {
			sa, sb = s, services.Apps[0]
			if sb == sa {
				sb = services.Apps[1]
			}
			break
		}
	}
	genA := a.ext.BeginOpen()
	genB := a.ext.BeginOpen() // B tapped before A finished
	a.mu.Lock()
	a.opening, a.lastOpen, a.openAt = sb.ID, sb.ID, time.Now()
	a.st.App = sb.ID
	a.mu.Unlock()

	if a.finishOpen(genA, sa, "", nil) {
		t.Fatal("a superseded open must not apply its result")
	}
	if a.finishOpen(genA, sa, "", errors.New("boom")) {
		t.Fatal("a superseded failure must not apply either")
	}
	a.mu.Lock()
	if a.opening != sb.ID || a.extOn || a.st.App != sb.ID || a.lastOpen != sb.ID {
		t.Fatalf("B's state was touched by A: opening=%q extOn=%v app=%q lastOpen=%q", a.opening, a.extOn, a.st.App, a.lastOpen)
	}
	a.mu.Unlock()

	if !a.finishOpen(genB, sb, "", nil) {
		t.Fatal("the newest open applies")
	}
	a.mu.Lock()
	if a.opening != "" || !a.extOn || a.extSvc != sb.ID {
		t.Fatalf("after B: opening=%q extOn=%v extSvc=%q", a.opening, a.extOn, a.extSvc)
	}
	a.mu.Unlock()
}

func TestFinishOpenFailureResetsLikeHome(t *testing.T) {
	a := &App{o: Options{Test: true}, ext: extapp.New(), st: State{T: "state", App: "netflix"}}
	s := services.Apps[0]
	g := a.ext.BeginOpen()
	a.mu.Lock()
	a.opening, a.lastOpen, a.openAt, a.extOn = s.ID, s.ID, time.Now(), true
	a.mu.Unlock()
	if !a.finishOpen(g, s, "", errors.New("boom")) {
		t.Fatal("latest failure applies")
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.opening != "" || a.lastOpen != "" || !a.openAt.IsZero() || a.extOn || a.st.App != "launcher" {
		t.Fatalf("not reset: opening=%q lastOpen=%q openAt=%v extOn=%v app=%q", a.opening, a.lastOpen, a.openAt, a.extOn, a.st.App)
	}
}

func TestExtHealthStepsF5ThenReopen(t *testing.T) {
	var h extHealth
	t0 := time.Now()
	if h.step(t0, 7, true, time.Time{}, time.Time{}) != healNone {
		t.Fatal("a hang just seen waits")
	}
	if h.step(t0.Add(11*time.Second), 7, true, time.Time{}, time.Time{}) != healReload {
		t.Fatal("hung > 10 s: F5")
	}
	if h.step(t0.Add(20*time.Second), 7, true, time.Time{}, time.Time{}) != healNone {
		t.Fatal("F5 gets 15 s")
	}
	if h.step(t0.Add(27*time.Second), 7, true, time.Time{}, time.Time{}) != healReopen {
		t.Fatal("still hung after F5: reopen")
	}
	// a helper that spoke and went quiet: F5; the hello after the reload clears it for good
	var g extHealth
	spoke := t0
	if g.step(t0.Add(31*time.Second), 9, false, spoke, time.Time{}) != healReload {
		t.Fatal("silent helper: F5")
	}
	if g.step(t0.Add(47*time.Second), 9, false, spoke, t0.Add(40*time.Second)) != healNone {
		t.Fatal("hello after F5: healed, no reopen")
	}
	if g.step(t0.Add(90*time.Second), 9, false, spoke, t0.Add(40*time.Second)) != healNone {
		t.Fatal("no F5 loop on a quiet browse page")
	}
}
