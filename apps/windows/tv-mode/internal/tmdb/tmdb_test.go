package tmdb

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDiscoverAndTrailer(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		switch r.URL.Path {
		case "/discover/movie":
			w.Write([]byte(`{"results":[{"id":1,"title":"A","release_date":"2025-03-01","backdrop_path":"/a.jpg","popularity":9},{"id":2,"title":"NoImg","popularity":99}]}`))
		case "/movie/1/videos":
			w.Write([]byte(`{"results":[{"key":"k1","site":"YouTube","type":"Trailer","official":false},{"key":"k2","site":"YouTube","type":"Trailer","official":true}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	c := NewWithBase(srv.URL, "SECRET")
	items, err := c.Discover("movie", "8", "IN", "netflix", 5, nil)
	if err != nil || len(items) != 1 || items[0].Title != "A" || items[0].Year != "2025" || items[0].Service != "netflix" {
		t.Fatalf("items %v err %v", items, err)
	}
	if gotAuth != "Bearer SECRET" {
		t.Fatal("token not sent as a Bearer header")
	}
	if k, _ := c.Trailer("movie", 1); k != "k2" {
		t.Fatalf("trailer %q, want the official one", k)
	}
	_, err = c.Discover("tv", "8", "IN", "netflix", 5, nil)
	if err == nil || err.Error() != "tmdb: status 404" {
		t.Fatalf("err %v", err)
	}
}

func TestMerge(t *testing.T) {
	a := []Item{{ID: 1, Kind: "movie", Pop: 5, Service: "netflix"}, {ID: 2, Kind: "movie", Pop: 9, Service: "netflix"}}
	b := []Item{{ID: 1, Kind: "movie", Pop: 5, Service: "prime"}, {ID: 3, Kind: "tv", Pop: 7, Service: "prime"}}
	m := Merge(3, "pop", a, b)
	if len(m) != 3 || m[0].ID != 2 || m[1].ID != 3 || m[2].ID != 1 || m[2].Service != "netflix" {
		t.Fatalf("%v", m)
	}
}

func TestKeywordCache(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/search/keyword" {
			http.NotFound(w, r)
			return
		}
		switch r.URL.Query().Get("query") {
		case "diwali":
			w.Write([]byte(`{"results":[{"id":9,"name":"diwali party"},{"id":4242,"name":"Diwali"}]}`))
		default:
			w.Write([]byte(`{"results":[]}`))
		}
	}))
	defer srv.Close()
	path := t.TempDir() + "/keywords.json"
	c := NewWithBase(srv.URL, "T")
	c.SetKeywordCache(path)
	if id, err := c.Keyword(" Diwali "); err != nil || id != 4242 {
		t.Fatalf("id %d err %v", id, err)
	}
	if id, _ := c.Keyword("diwali"); id != 4242 || calls != 1 {
		t.Fatalf("second ask must come from the cache: id %d calls %d", id, calls)
	}
	if id, err := c.Keyword("nosuchthing"); err != nil || id != 0 {
		t.Fatalf("missing: %d %v", id, err)
	}
	c2 := NewWithBase(srv.URL, "T") // a restart reads the file
	c2.SetKeywordCache(path)
	c2.Keyword("nosuchthing")
	c2.Keyword("diwali")
	if calls != 2 {
		t.Fatalf("a restart must not ask again: %d calls", calls)
	}
}

// Because-you-watched cards were scored with no genre or language at all.
func TestRecommendationsCarryGenreAndLanguage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"results":[{"id":7,"title":"K","backdrop_path":"/k.jpg","genre_ids":[80,18],"original_language":"ko"}]}`))
	}))
	defer srv.Close()
	l, err := NewWithBase(srv.URL, "T").Recommendations("movie", 1, 5)
	if err != nil || len(l) != 1 || l[0].Lang != "ko" || len(l[0].GIDs) != 2 {
		t.Fatalf("%+v %v", l, err)
	}
}
