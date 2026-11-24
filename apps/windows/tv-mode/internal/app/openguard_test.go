package app

import "testing"

func TestDupOpen(t *testing.T) {
	a := &App{}
	if a.dupOpen("item|tv1|0||0|0") {
		t.Fatal("the first press must go through")
	}
	if !a.dupOpen("item|tv1|0||0|0") {
		t.Fatal("the same request at once (launcher and phone) must be dropped")
	}
	if a.dupOpen("item|tv1|0|netflix|0|0") {
		t.Fatal("a different service pick is a real second request")
	}
}

func TestWithHelperNote(t *testing.T) {
	for _, c := range []struct{ svc, in, want string }{
		{"netflix", "https://www.netflix.com/watch/81234?t=597", "https://www.netflix.com/watch/81234?t=597#tvgo=%7B%22id%22:%2281234%22%2C%22t%22:597%7D"},
		{"netflix", "https://www.netflix.com/browse", "https://www.netflix.com/browse"},
		{"netflix", "https://www.netflix.com/search?q=x#tvgo=%7B%7D", "https://www.netflix.com/search?q=x#tvgo=%7B%7D"},
		{"prime", "https://www.primevideo.com/search/ref=atv_nb_sr?phrase=The+Boys", "https://www.primevideo.com/search/ref=atv_nb_sr?phrase=The+Boys#tvpick=The+Boys"},
		{"jiohotstar", "https://www.hotstar.com/in/explore?search_query=Dune", "https://www.hotstar.com/in/explore?search_query=Dune#tvpick=Dune"},
		{"prime", "https://www.primevideo.com/detail/abc/?autoplay=1", "https://www.primevideo.com/detail/abc/?autoplay=1"},
	} {
		if got := withHelperNote(c.svc, c.in); got != c.want {
			t.Errorf("%s %s:\n got %s\nwant %s", c.svc, c.in, got, c.want)
		}
	}
}
