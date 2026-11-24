package winsys

import "testing"

// Before the shared callbacks, the ~2000th lookup crashed the process.
func TestManyLookupsDoNotRunOutOfCallbacks(t *testing.T) {
	var mons, wins int
	for i := 0; i < 2500; i++ {
		mons = len(Monitors())
		wins = len(TopWindows(""))
		_ = displays()
	}
	if mons == 0 {
		t.Error("no monitors found")
	}
	t.Logf("monitors %d, windows %d", mons, wins)
}
