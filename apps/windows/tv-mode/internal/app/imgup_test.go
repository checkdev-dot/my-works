package app

import "testing"

func TestHiResImg(t *testing.T) {
	cases := map[string]string{
		"https://image.tmdb.org/t/p/w780/abc.jpg":  "https://image.tmdb.org/t/p/w1280/abc.jpg",
		"https://image.tmdb.org/t/p/w1280/abc.jpg": "https://image.tmdb.org/t/p/w1280/abc.jpg",
		"https://image.tmdb.org/t/p/w500/abc.jpg":  "https://image.tmdb.org/t/p/w500/abc.jpg",
		"https://example.com/t/p/w780/abc.jpg":     "https://example.com/t/p/w780/abc.jpg",
	}
	for in, want := range cases {
		if got := hiResImg(in); got != want {
			t.Errorf("hiResImg(%q) = %q, want %q", in, got, want)
		}
	}
}
