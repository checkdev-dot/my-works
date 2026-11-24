package app

import "testing"

// A session closed while its auth frame is still being processed must not be
// admitted: before the closed flag it left a ghost client in the hub.
func TestAdmitAfterCloseLeavesNoGhost(t *testing.T) {
	a := &App{hub: newHub()}
	l := &link{a: a, sess: map[string]*session{}}

	live := &session{sid: "live", l: l, quit: make(chan struct{})}
	live.cl = newClient(true, nil)
	if !live.admit() || !live.auth.Load() || a.hub.remoteCount() != 1 {
		t.Fatal("an open session should be admitted")
	}

	gone := &session{sid: "gone", l: l, quit: make(chan struct{})}
	gone.cl = newClient(true, nil)
	gone.close() // the relay said the phone left, before its auth frame was handled
	if gone.admit() {
		t.Fatal("a closed session was admitted")
	}
	if gone.auth.Load() || a.hub.remoteCount() != 1 {
		t.Fatalf("ghost client left in the hub (remotes=%d, auth=%v)", a.hub.remoteCount(), gone.auth.Load())
	}
}
