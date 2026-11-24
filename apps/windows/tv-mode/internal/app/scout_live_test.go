package app

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestScoutLive walks Hotstar and Prime in the hidden scout (needs the network;
// run with TVMODE_SCOUT_LIVE=1).
func TestScoutLive(t *testing.T) {
	if os.Getenv("TVMODE_SCOUT_LIVE") == "" {
		t.Skip("set TVMODE_SCOUT_LIVE=1")
	}
	a := &App{}
	scoutDirOverride = filepath.Join(t.TempDir(), "scout")
	t.Cleanup(func() {
		if scoutB.cancel != nil {
			scoutB.cancel()
			scoutB.ctx, scoutB.cancel = nil, nil
		}
		time.Sleep(2 * time.Second)
	})
	w := a.newWalker(func(string) { t.Fatal("fell back to the TV") })
	defer w.done()
	poll := func(d time.Duration, f func() bool) bool {
		for end := time.Now().Add(d); time.Now().Before(end); time.Sleep(500 * time.Millisecond) {
			if f() {
				return true
			}
		}
		return false
	}
	// Hotstar: Gravity Falls S2E4
	w.nav("https://www.hotstar.com/in/explore?search_query=" + url.QueryEscape("Gravity Falls"))
	var page string
	poll(20*time.Second, func() bool {
		return w.eval(fmt.Sprintf(hsPickJS, "Gravity Falls", "shows"), &page) == nil && page != ""
	})
	t.Logf("hotstar page %q", page)
	if page == "" {
		t.Fatal("no hotstar page")
	}
	w.nav(page)
	var hit string
	poll(25*time.Second, func() bool {
		var raw string
		if w.eval(fmt.Sprintf(hsEpJS, 2, 4), &raw) != nil {
			return false
		}
		var r struct{ Hit string }
		_ = json.Unmarshal([]byte(raw), &r)
		hit = r.Hit
		return hit != ""
	})
	t.Logf("hotstar S2E4 %q", hit)
	// Prime: The Boys S1E2
	w.nav("https://www.primevideo.com/search/ref=atv_nb_sr?phrase=" + url.QueryEscape("The Boys"))
	var pp string
	poll(20*time.Second, func() bool { return w.eval(fmt.Sprintf(pvPickJS, "The Boys"), &pp) == nil && pp != "" })
	t.Logf("prime page %q", pp)
	if pp == "" {
		return
	}
	w.nav(pp)
	var ent string
	poll(8*time.Second, func() bool { return w.eval(pvEntJS, &ent) == nil && ent != "" })
	var raw string
	poll(15*time.Second, func() bool {
		if w.eval(fmt.Sprintf(pvEpJS, 2), &raw) != nil {
			return false
		}
		var r struct{ Hit string }
		return json.Unmarshal([]byte(raw), &r) == nil && r.Hit != ""
	})
	if len(raw) > 300 {
		raw = raw[:300]
	}
	t.Logf("prime ent %q ep %s", ent, raw)
}
