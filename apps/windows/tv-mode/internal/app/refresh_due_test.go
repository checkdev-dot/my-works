package app

import (
	"testing"
	"time"
)

func TestRefreshDue(t *testing.T) {
	now := time.Date(2026, 11, 12, 12, 0, 0, 0, time.UTC)
	h := time.Hour
	cases := []struct {
		name    string
		ok, try time.Time
		want    bool
	}{
		{"never fetched", time.Time{}, time.Time{}, true},
		{"fresh", now.Add(-2 * h), now.Add(-2 * h), false},
		{"stale after sleep", now.Add(-7 * h), now.Add(-7 * h), true},
		{"stale but tried just now", now.Add(-7 * h), now.Add(-10 * time.Minute), false},
		{"stale, last try over an hour ago", now.Add(-7 * h), now.Add(-2 * h), true},
		{"never succeeded, tried just now", time.Time{}, now.Add(-time.Minute), false},
	}
	for _, c := range cases {
		if got := refreshDue(c.ok, c.try, now, 6*h, h); got != c.want {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
}
