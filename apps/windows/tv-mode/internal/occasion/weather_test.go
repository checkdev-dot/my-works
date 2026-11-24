package occasion

import (
	"testing"
	"time"
)

func liveIDs(l []Live) map[string]bool {
	m := map[string]bool{}
	for _, x := range l {
		m[x.Node.ID] = true
	}
	return m
}

func TestWeatherNodesNeedAReading(t *testing.T) {
	t.Cleanup(func() { SetWeather(nil) })
	now := time.Date(2026, 11, 4, 21, 30, 0, 0, time.Local)

	SetWeather(nil)
	for _, id := range []string{"rain-now", "heat", "cold"} {
		if liveIDs(Evaluate(now, Viewer{}))[id] {
			t.Fatalf("%s is live with no weather source", id)
		}
	}

	read := Reading{}
	SetWeather(func() Reading { return read })
	if liveIDs(Evaluate(now, Viewer{}))["rain-now"] {
		t.Error("an unknown reading (no city, or too old) must leave weather off")
	}

	cases := []struct {
		r    Reading
		want string
	}{
		{Reading{Code: 61, TempC: 24, OK: true}, "rain-now"},
		{Reading{Code: 3, TempC: 24, Precp: 0.4, OK: true}, "rain-now"},
		{Reading{Code: 0, TempC: 37, OK: true}, "heat"},
		{Reading{Code: 0, TempC: 9, OK: true}, "cold"},
		{Reading{Code: 0, TempC: 24, OK: true}, ""},
	}
	for _, c := range cases {
		read = c.r
		ids := liveIDs(Evaluate(now, Viewer{}))
		for _, id := range []string{"rain-now", "heat", "cold"} {
			if ids[id] != (id == c.want) {
				t.Errorf("reading %+v: %s live=%v, want %q", c.r, id, ids[id], c.want)
			}
		}
	}
}

func TestLiveWeatherAsksForItsPool(t *testing.T) {
	t.Cleanup(func() { SetWeather(nil) })
	cal := NewCalendar(nil)
	now := time.Date(2027, 2, 10, 21, 30, 0, 0, time.Local) // no monsoon, no festival

	has := func(id string) bool {
		for _, n := range cal.Upcoming(now, 14) {
			if n.ID == id {
				return true
			}
		}
		return false
	}
	SetWeather(func() Reading { return Reading{Code: 0, TempC: 24, OK: true} })
	if has("monsoon") {
		t.Fatal("monsoon pool asked for in February with calm weather")
	}
	SetWeather(func() Reading { return Reading{Code: 63, TempC: 24, OK: true} })
	if !has("monsoon") {
		t.Error("rain now should ask for the monsoon pool outside the season")
	}
	SetWeather(nil)
	if has("monsoon") {
		t.Error("no weather source: the pool is not asked for")
	}
}
