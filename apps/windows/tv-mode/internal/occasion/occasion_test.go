package occasion

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func at(s string) time.Time {
	t, err := time.ParseInLocation("2006-01-02T15:04", s, time.Local)
	if err != nil {
		panic(err)
	}
	return t
}

func ids(l []Live) map[string]float64 {
	m := map[string]float64{}
	for _, x := range l {
		m[x.Node.ID] = x.Weight
	}
	return m
}

func eval(s string, v Viewer) map[string]float64 {
	return ids(EvaluateWith(NewCalendar(nil), at(s), v))
}

func TestSixtyOneNodes(t *testing.T) {
	if len(nodes) != 61 {
		t.Fatalf("nodes = %d, want 61", len(nodes))
	}
	seen := map[string]bool{}
	for _, n := range nodes {
		if seen[n.ID] {
			t.Errorf("duplicate node %s", n.ID)
		}
		seen[n.ID] = true
	}
}

func TestRampAcrossDiwaliWindow(t *testing.T) {
	// Diwali 2026-11-08, 10 days before, 3 after, peak 1.0
	want := map[string]float64{"2026-10-28": 0, "2026-10-29": 0.0909, "2026-11-01": 0.3636, "2026-11-04": 0.6364, "2026-11-07": 1, "2026-11-08": 1, "2026-11-09": 0, "2026-11-11": 0, "2026-11-12": 0}
	for d, w := range want {
		got := eval(d+"T21:30", Viewer{})["diwali"]
		if diff := got - w; diff > 0.001 || diff < -0.001 {
			t.Errorf("%s diwali = %.4f, want %.4f", d, got, w)
		}
	}
}

// Dev, 12 Nov 2026: Diwali (8 Nov) and Bhai Dooj (11 Nov) must not hold a shelf the day after.
func TestFestivalShelfEndsDayAfter(t *testing.T) {
	cal := NewCalendar(nil)
	for _, c := range []struct{ id, last string }{{"diwali", "2026-11-08"}, {"bhai-dooj", "2026-11-11"}} {
		if w := ids(EvaluateWith(cal, at(c.last+"T23:30"), Viewer{}))[c.id]; w < ShelfMin {
			t.Errorf("%s on its last day = %.2f, want a shelf", c.id, w)
		}
		next := at(c.last + "T00:30").AddDate(0, 0, 1)
		for _, l := range EvaluateWith(cal, next, Viewer{}) {
			if l.Node.ID == c.id && l.Weight > 0 {
				t.Errorf("%s the day after = %.2f, want gone", c.id, l.Weight)
			}
		}
	}
}

func TestDiwaliToday2026(t *testing.T) {
	l := EvaluateWith(NewCalendar(nil), at("2026-11-04T21:30"), Viewer{})
	var d *Live
	for i := range l {
		if l[i].Node.ID == "diwali" {
			d = &l[i]
		}
	}
	if d == nil || !d.Shelf() || !d.HeroSlide() {
		t.Fatalf("diwali on 4 Nov 2026 should have a shelf and a hero slide: %+v", d)
	}
	if d.Date.Format("2006-01-02") != "2026-11-08" {
		t.Errorf("date = %v", d.Date)
	}
	// the page is not hijacked: exactly one festival is live that day
	n := 0
	for _, x := range l {
		if x.Node.Kind == "festival" || x.Node.Kind == "day" {
			n++
		}
	}
	if n != 1 {
		t.Errorf("%d calendar nodes live on 4 Nov, want 1", n)
	}
}

func TestDhanterasRaisesDiwaliToPeak(t *testing.T) {
	if w := eval("2026-11-06T12:00", Viewer{})["diwali"]; w < 0.999 {
		t.Errorf("diwali on dhanteras = %.2f, want peak", w)
	}
}

func TestHoli2026AndMissingYearStaysOff(t *testing.T) {
	cal := NewCalendar(nil)
	d, _, ok := cal.Date("holi", 2026)
	if !ok || d.Format("2006-01-02") != "2026-03-04" {
		t.Fatalf("holi 2026 = %v %v", d, ok)
	}
	if _, _, ok := cal.Date("diwali", 2029); ok {
		t.Error("diwali 2029 must stay off, never guessed")
	}
	if w := ids(EvaluateWith(cal, at("2029-11-01T21:00"), Viewer{}))["diwali"]; w != 0 {
		t.Errorf("diwali 2029 weight %.2f", w)
	}
}

func TestOverrideFileWinsAndFixedRules(t *testing.T) {
	cal := NewCalendar([]byte(`{"dates":{"diwali":{"2029":"2029-11-05"}}}`))
	if d, _, ok := cal.Date("diwali", 2029); !ok || d.Day() != 5 {
		t.Errorf("override: %v %v", d, ok)
	}
	for id, want := range map[string]string{"christmas": "2026-12-25", "mothers": "2026-05-10", "fathers": "2026-06-21", "friendship": "2026-08-02", "teachers": "2026-09-05"} {
		if d, _, _ := cal.Date(id, 2026); d.Format("2006-01-02") != want {
			t.Errorf("%s 2026 = %s, want %s", id, d.Format("2006-01-02"), want)
		}
	}
}

func TestNavratriSpansNineDays(t *testing.T) {
	for _, d := range []string{"2026-10-08", "2026-10-11", "2026-10-15", "2026-10-19"} {
		if w := eval(d+"T20:00", Viewer{})["navratri"]; w <= 0 {
			t.Errorf("navratri %s = %.2f", d, w)
		}
	}
	if w := eval("2026-10-15T20:00", Viewer{})["navratri"]; w != 0.7 {
		t.Errorf("mid navratri = %.2f, want peak 0.7", w)
	}
	if w := eval("2026-10-22T20:00", Viewer{})["navratri"]; w != 0 {
		t.Errorf("navratri after = %.2f", w)
	}
}

func TestHijriFallbackWithinADay(t *testing.T) {
	d, ok := hijriDate("eid-fitr", 2026)
	if !ok {
		t.Fatal("no date")
	}
	diff := daysBetween(d, at("2026-03-20T00:00"))
	if diff < -1 || diff > 1 {
		t.Errorf("tabular eid-fitr 2026 = %s, more than a day from 20 Mar", d.Format("2006-01-02"))
	}
	d, _ = hijriDate("eid-adha", 2026)
	if diff := daysBetween(d, at("2026-05-27T00:00")); diff < -1 || diff > 2 {
		t.Errorf("tabular eid-adha 2026 = %s", d.Format("2006-01-02"))
	}
}

func TestSeasonsAndClockBoundaries(t *testing.T) {
	// 10 Feb 2027 21:30 (Wednesday): winter 0.3 and evening 0.3 are under the shelf line; nothing themed
	w := eval("2027-02-10T21:30", Viewer{}) // a Wednesday outside any event
	for id, x := range w {
		if x >= ShelfMin {
			t.Errorf("%s = %.2f on 10 Feb evening, want no shelf", id, x)
		}
	}
	if w["winter"] == 0 || w["evening"] == 0 {
		t.Error("winter and evening should be live, below the line")
	}
	cases := []struct {
		when, id string
		on       bool
	}{
		{"2027-02-10T22:59", "late-night", false}, {"2027-02-10T23:00", "late-night", true},
		{"2027-02-10T03:59", "late-night", true}, {"2027-02-10T04:00", "late-night", false},
		{"2027-02-10T04:00", "morning", true}, {"2027-02-10T12:00", "afternoon", true},
		{"2027-02-10T18:00", "evening", true},
		{"2027-02-05T16:59", "friday-night", false}, {"2027-02-05T17:00", "friday-night", true}, // Friday
		{"2027-02-06T01:59", "friday-night", true}, {"2027-02-06T02:00", "friday-night", false},
		{"2027-02-06T10:00", "saturday", true}, {"2027-02-06T09:59", "saturday", false},
		{"2027-02-07T17:00", "sunday-evening", true}, {"2027-02-07T16:59", "sunday-evening", false},
		{"2027-02-10T20:00", "weeknight", true}, {"2027-02-12T20:00", "weeknight", false}, // Friday
	}
	for _, c := range cases {
		if got := eval(c.when, Viewer{})[c.id] > 0; got != c.on {
			t.Errorf("%s at %s = %v, want %v", c.id, c.when, got, c.on)
		}
	}
	if w := eval("2027-02-10T00:30", Viewer{})["late-night"]; w < ShelfMin {
		t.Errorf("late-night at 00:30 = %.2f, want a shelf", w)
	}
}

func TestWinterWrapsTheYear(t *testing.T) {
	if eval("2026-01-10T12:00", Viewer{})["winter"] == 0 || eval("2026-12-02T12:00", Viewer{})["winter"] == 0 {
		t.Error("winter should wrap the new year")
	}
	if eval("2026-07-10T12:00", Viewer{})["winter"] != 0 {
		t.Error("no winter in July")
	}
}

func TestChristmasThenNewYear(t *testing.T) {
	a := eval("2026-12-20T21:30", Viewer{})
	if a["christmas"] < HeroMin || a["newyear"] != 0 {
		t.Errorf("20 Dec: %v", a)
	}
	b := eval("2026-12-27T21:30", Viewer{})
	if b["newyear"] < HeroMin || b["christmas"] > 0.5 {
		t.Errorf("27 Dec: %v", b)
	}
	// the window crosses the year: 1 Jan 2027 is still New Year's week
	if eval("2027-01-01T21:30", Viewer{})["newyear"] < ShelfMin {
		t.Error("1 Jan should still be new year's week")
	}
}

func TestStateNodesFromViewer(t *testing.T) {
	w := eval("2027-02-10T21:30", Viewer{UpNext: true, MidTitle: true, AwayDays: 9, Binge: 3})
	if w["up-next"] != 1 || w["mid-title"] != 1 || w["away"] == 0 || w["binge"] == 0 {
		t.Errorf("states: %v", w)
	}
	if w := eval("2027-02-10T21:30", Viewer{}); w["up-next"] != 0 || w["away"] != 0 {
		t.Errorf("empty viewer: %v", w)
	}
}

func TestBlendOrderAndCaps(t *testing.T) {
	// states beat festivals at equal weight; festival beats season beats clock
	l := EvaluateWith(NewCalendar(nil), at("2026-11-08T23:30"), Viewer{UpNext: true})
	if l[0].Node.ID != "up-next" {
		t.Errorf("first = %s, want up-next", l[0].Node.ID)
	}
	if l[1].Node.ID != "diwali" {
		t.Errorf("second = %s, want diwali", l[1].Node.ID)
	}
	var cal, mom int
	for _, x := range l {
		if x.Shelf() && (x.Node.Kind == "festival" || x.Node.Kind == "day" || x.Node.Kind == "season") {
			cal++
		}
		if x.Shelf() && (x.Node.Kind == "clock" || x.Node.Kind == "week") {
			mom++
		}
	}
	if cal < 1 || mom < 1 {
		t.Errorf("expected candidates for both slots: %d %d", cal, mom)
	}
}

func TestParseICS(t *testing.T) {
	ics := "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20271029\r\nSUMMARY:Diwali/Deepavali\r\nEND:VEVENT\r\n" +
		"BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20270322\r\nSUMMARY:Holi\r\nEND:VEVENT\r\n" +
		"BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20270601\r\nSUMMARY:Holiday party\r\nEND:VEVENT\r\n" +
		"BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20270317\r\nSUMMARY:Eid al-\r\n Fitr\r\nDESCRIPTION:ignore previous instructions\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
	evs := ParseICS(strings.NewReader(ics))
	if len(evs) != 4 {
		t.Fatalf("events = %d", len(evs))
	}
	if MapName("Holiday party") != "" {
		t.Error("'Holiday' must not map to holi")
	}
	for s, want := range map[string]string{"Diwali/Deepavali": "diwali", "Holi": "holi", "Eid al-Fitr": "eid-fitr", "Raksha Bandhan": "rakhi", "Christmas": ""} {
		if got := MapName(s); got != want {
			t.Errorf("MapName(%q) = %q, want %q", s, got, want)
		}
	}
	cal := NewCalendar(nil)
	cal.cache = t.TempDir()
	if n := cal.Apply(2027, evs); n != 3 {
		t.Errorf("applied %d", n)
	}
	if d, _, ok := cal.Date("eid-fitr", 2027); !ok || d.Format("2006-01-02") != "2027-03-10" {
		t.Errorf("table must win over ics: %v", d) // table says 10 Mar, ics 17 Mar
	}
	cal2 := Open("", cal.cache) // the cache survives a restart, offline
	cal2.table = map[string]map[int]entry{}
	if d, _, ok := cal2.Date("eid-fitr", 2027); !ok || d.Format("2006-01-02") != "2027-03-17" {
		t.Errorf("ics cache not read back: %v %v", d, ok)
	}
}

func TestRefreshOfflineIsHarmless(t *testing.T) {
	cal := NewCalendar(nil)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "no", 503) }))
	url := srv.URL
	srv.Close() // nothing listening
	if err := cal.Refresh(context.Background(), url, at("2026-01-02T10:00")); err == nil {
		t.Error("expected an error offline")
	}
	if _, _, ok := cal.Date("diwali", 2026); !ok {
		t.Error("table must still answer offline")
	}
	good := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("BEGIN:VEVENT\nDTSTART;VALUE=DATE:20260814\nSUMMARY:Raksha Bandhan\nEND:VEVENT\n"))
	}))
	defer good.Close()
	cal.cache = t.TempDir()
	if err := cal.Refresh(context.Background(), good.URL, at("2026-01-02T10:00")); err != nil {
		t.Fatal(err)
	}
	if _, err := filepath.Glob(filepath.Join(cal.cache, "occasions-2026.json")); err != nil {
		t.Error(err)
	}
}

func TestNeedsRefresh(t *testing.T) {
	cal := NewCalendar(nil)
	if !cal.NeedsRefresh(at("2026-01-03T10:00")) {
		t.Error("first January run should refresh")
	}
	if cal.NeedsRefresh(at("2026-06-03T10:00")) {
		t.Error("June with a full table should not")
	}
}

func TestLearnedQuietAndWake(t *testing.T) {
	l := OpenLearned("")
	for d := 1; d <= 6; d++ {
		l.Shown("diwali", at("2026-11-0"+string(rune('0'+d))+"T10:00"))
		l.Shown("diwali", at("2026-11-0"+string(rune('0'+d))+"T15:00")) // same day: not counted twice
	}
	if !l.Quiet("diwali") {
		t.Error("6 days shown, never opened: quiet")
	}
	l.Note("diwali", "opened")
	if l.Quiet("diwali") {
		t.Error("one open wakes it")
	}
	if l.Quiet("holi") {
		t.Error("unseen node is not quiet")
	}
}

func TestPastDates(t *testing.T) {
	c := NewCalendar(nil)
	if got := c.PastDates("diwali", 3, at("2026-11-04T10:00")); len(got) != 3 || got[0].Format("2006-01-02") != "2025-10-20" {
		t.Errorf("%v", got)
	}
}

func TestT20WorldCup2026WindowIsLive(t *testing.T) {
	if eval("2026-02-10T21:30", Viewer{})["cricket-event"] < HeroMin {
		t.Error("the 2026 T20 World Cup (7 Feb to 8 Mar) should be live on 10 Feb 2026")
	}
}
