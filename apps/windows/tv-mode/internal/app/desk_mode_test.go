package app

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// keepAliveReset makes a test leave the package flag as it found it.
func keepAliveReset(t *testing.T) {
	t.Helper()
	deskKeepAlive.Store(false)
	t.Cleanup(func() { deskKeepAlive.Store(false) })
}

func TestDeskModeGate(t *testing.T) {
	keepAliveReset(t)
	a := deskApp(t)
	if w := deskDo(deskMux(a), "POST", "/api/desk/mode", `{"mode":"tv"}`, deskLAN, true); w.Code != http.StatusForbidden {
		t.Errorf("mode from the LAN = %d, want 403", w.Code)
	}
	if w := deskDo(deskMux(a), "POST", "/api/desk/mode", `{"mode":"tv"}`, deskLoop, false); w.Code != http.StatusForbidden {
		t.Errorf("mode without the header = %d, want 403", w.Code)
	}
	if w := deskDo(deskMux(a), "GET", "/api/desk/mode", "", deskLoop, false); w.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET mode = %d, want 405", w.Code)
	}
	if w := deskDo(deskMux(a), "POST", "/api/desk/mode", `{"mode":"sideways"}`, deskLoop, true); w.Code != http.StatusBadRequest {
		t.Errorf("bad mode = %d, want 400", w.Code)
	}
}

func TestDeskModeTVStartsOrRaises(t *testing.T) {
	keepAliveReset(t)
	old := deskWaitTV
	deskWaitTV = 50 * time.Millisecond // the start goroutine must not linger
	defer func() { deskWaitTV = old }()
	a := deskApp(t)
	w := deskDo(deskMux(a), "POST", "/api/desk/mode", `{"mode":"tv"}`, deskLoop, true)
	if w.Code != http.StatusAccepted || !strings.Contains(w.Body.String(), `"starting":true`) || len(a.startCh) != 1 {
		t.Errorf("tv while off = %d %s startCh %d, want 202, starting, one start", w.Code, w.Body.String(), len(a.startCh))
	}
	time.Sleep(120 * time.Millisecond)
	// already on: no second start (Edge is nil in the test, raiseEdge returns at once)
	<-a.startCh
	a.tvState.Store(tvOn)
	w = deskDo(deskMux(a), "POST", "/api/desk/mode", `{"mode":"tv"}`, deskLoop, true)
	if w.Code != 200 || len(a.startCh) != 0 {
		t.Errorf("tv while on = %d startCh %d, want 200 and no start", w.Code, len(a.startCh))
	}
}

func TestDeskModeDeskKeepsAlive(t *testing.T) {
	keepAliveReset(t)
	a := deskApp(t)
	a.o.Standby = false // a start without -standby
	if a.standbyMode() || a.standbyNow() {
		t.Fatal("a plain start is not standby")
	}
	closed := make(chan struct{}, 1)
	oldClose := deskCloseTV
	deskCloseTV = func(*App) { closed <- struct{}{} } // never Edge, never the monitors
	defer func() { deskCloseTV = oldClose }()

	// off already: only the flag
	w := deskDo(deskMux(a), "POST", "/api/desk/mode", `{"mode":"desk"}`, deskLoop, true)
	if w.Code != 200 || !deskKeepAlive.Load() || !a.standbyMode() || !a.standbyNow() {
		t.Errorf("desk while off = %d keepAlive %v", w.Code, deskKeepAlive.Load())
	}
	select {
	case <-closed:
		t.Error("nothing to close while the TV is off")
	default:
	}
	// on: the session is closed, and Exit-to-standby (not quit) is what a phone's close does
	deskKeepAlive.Store(false)
	a.tvState.Store(tvOn)
	w = deskDo(deskMux(a), "POST", "/api/desk/mode", `{"mode":"desk"}`, deskLoop, true)
	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Error("the TV session was not closed")
	}
	if w.Code != 200 || !deskKeepAlive.Load() {
		t.Errorf("desk while on = %d keepAlive %v", w.Code, deskKeepAlive.Load())
	}
	// still starting: refused, nothing changes
	deskKeepAlive.Store(false)
	a.tvState.Store(tvStarting)
	if w = deskDo(deskMux(a), "POST", "/api/desk/mode", `{"mode":"desk"}`, deskLoop, true); w.Code != http.StatusConflict || deskKeepAlive.Load() {
		t.Errorf("desk while starting = %d keepAlive %v, want 409 and no flag", w.Code, deskKeepAlive.Load())
	}
}

func TestDeskStateModeAndPhone(t *testing.T) {
	keepAliveReset(t)
	a := deskApp(t)
	w := deskDo(deskMux(a), "GET", "/api/desk/state", "", deskLoop, false)
	if !strings.Contains(w.Body.String(), `"mode":"desk"`) || !strings.Contains(w.Body.String(), `"phone":false`) {
		t.Errorf("state = %s, want mode desk and no phone", w.Body.String())
	}
	a.hub.add(newClient(true, nil))
	a.tvState.Store(tvStarting)
	w = deskDo(deskMux(a), "GET", "/api/desk/state", "", deskLoop, false)
	if !strings.Contains(w.Body.String(), `"mode":"tv"`) || !strings.Contains(w.Body.String(), `"phone":true`) || !strings.Contains(w.Body.String(), `"tv":"starting"`) {
		t.Errorf("state = %s, want mode tv, phone, starting", w.Body.String())
	}
}

// Open here and Play on TV for a whole service (the desk's "Open Netflix here").
func TestDeskOpenService(t *testing.T) {
	keepAliveReset(t)
	a := deskApp(t)
	var got string
	old := deskOpenURL
	deskOpenURL = func(u string) error { got = u; return nil }
	defer func() { deskOpenURL = old }()
	for svc, host := range map[string]string{"netflix": "www.netflix.com/browse", "prime": "primevideo.com", "jiohotstar": "hotstar.com/in", "youtube": "https://www.youtube.com"} {
		got = ""
		w := deskDo(deskMux(a), "POST", "/api/desk/open", `{"where":"desk","k":"svc","svc":"`+svc+`"}`, deskLoop, true)
		if w.Code != 200 || !strings.Contains(got, host) || strings.HasSuffix(got, "/tv") {
			t.Errorf("open %s = %d %s opened %q, want a page with %q", svc, w.Code, w.Body.String(), got, host)
		}
	}
	got = ""
	var w *httptest.ResponseRecorder
	if w = deskDo(deskMux(a), "POST", "/api/desk/open", `{"where":"desk","k":"svc","svc":"evil"}`, deskLoop, true); w.Code == 200 || got != "" {
		t.Errorf("unknown service = %d opened %q, want a refusal", w.Code, got)
	}
	if w = deskDo(deskMux(a), "POST", "/api/desk/open", `{"where":"tv","k":"svc","svc":"nope"}`, deskLoop, true); w.Code != http.StatusBadRequest {
		t.Errorf("tv unknown service = %d, want 400", w.Code)
	}
}
