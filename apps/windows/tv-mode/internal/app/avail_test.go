package app

import (
	"reflect"
	"testing"

	"tvmode/internal/tmdb"
)

// TMDB lists The Office on Prime in India; once Prime's own page shows it is not
// there, it must neither show nor open as Prime, and a yes from an app comes first.
// Verdicts belong to one title: the UK Office is another show.
func TestSvcOrder(t *testing.T) {
	t.Setenv("TVMODE_TEST_ROWS", "1")
	avail.m, avail.loaded = map[string]availMark{}, false
	a := &App{o: Options{Test: true}, ld: &launcherData{details: map[string]tmdb.Details{}}}
	listed := []string{"prime", "jiohotstar", "netflix"}
	if got := a.svcOrder("tv2316", "The Office", listed); !reflect.DeepEqual(got, []string{"netflix", "jiohotstar", "prime"}) {
		t.Fatal("default order:", got)
	}
	a.availPut("prime", "tv2316", false, "only to rent")
	a.availPut("jiohotstar", "tv2316", true, "in its search")
	if got := a.svcOrder("tv2316", "The Office", listed); !reflect.DeepEqual(got, []string{"jiohotstar", "netflix"}) {
		t.Fatal("checked order:", got)
	}
	if got := a.svcOrder("tv2996", "The Office", listed); !reflect.DeepEqual(got, []string{"netflix", "jiohotstar", "prime"}) {
		t.Fatal("another show of the same name took the verdicts:", got)
	}
	a.ld.details["tv2316"] = tmdb.Details{Services: listed}
	if s := a.bestSvc("tv2316", "The Office", "prime"); s != "jiohotstar" {
		t.Fatal("best:", s)
	}
	a.availPut("netflix", "tv9", true, "in its search")
	if s := a.bestSvc("tv9", "Only Here", ""); s != "netflix" {
		t.Fatal("an app that showed it counts even when TMDB does not list it:", s)
	}
	a.availPut("jiohotstar", "tv2316", false, "gone")
	a.availPut("netflix", "tv2316", false, "gone")
	if s := a.bestSvc("tv2316", "The Office", "prime"); s != "" {
		t.Fatal("nowhere:", s)
	}
}
