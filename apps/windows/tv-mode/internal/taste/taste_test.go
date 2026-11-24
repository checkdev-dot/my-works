package taste

import (
	"testing"
	"time"
)

var (
	korCrime = Title{Kind: "tv", Service: "netflix", GIDs: []int{80, 18}, Lang: "ko", Year: "2023", Vote: 8.1, Votes: 900}
	korThril = Title{Kind: "movie", Service: "prime", GIDs: []int{53, 80}, Lang: "ko", Year: "2021", Vote: 7.6, Votes: 3000}
	comedy   = Title{Kind: "movie", Service: "prime", GIDs: []int{35}, Lang: "en", Year: "2019", Vote: 7.0, Votes: 5000}
)

func fresh() (*Profile, *time.Time) {
	t := time.Date(2026, 11, 4, 22, 0, 0, 0, time.UTC)
	p := Open("")
	p.now = func() time.Time { return t }
	return p, &t
}

func TestEmptyProfileIsNeutral(t *testing.T) {
	p, _ := fresh()
	for _, x := range []Title{korCrime, comedy} {
		if a := p.Affinity(x); a != 0 || Boost(a) != 1 {
			t.Fatalf("empty profile affinity %v", a)
		}
	}
}

func TestWatchingLiftsWhatIsLike(t *testing.T) {
	p, _ := fresh()
	for i := 0; i < 3; i++ {
		p.Learn(korCrime, Finished)
	}
	if !(p.Affinity(korThril) > 0.3 && p.Affinity(korThril) > p.Affinity(comedy)+0.3) {
		t.Fatalf("korean thriller %v, comedy %v", p.Affinity(korThril), p.Affinity(comedy))
	}
}

func TestOneAbandonIsBounded(t *testing.T) {
	p, _ := fresh()
	p.Learn(comedy, Abandon)
	if a := p.Affinity(comedy); a < -0.5 || a >= 0 {
		t.Fatalf("one abandon gave %v", a)
	}
}

func TestOldEventsFade(t *testing.T) {
	p, now := fresh()
	for i := 0; i < 3; i++ {
		p.Learn(korCrime, Finished)
	}
	before := p.Affinity(korThril)
	*now = now.Add(60 * 24 * time.Hour)
	if after := p.Affinity(korThril); after > before*0.25 {
		t.Fatalf("after 60 days %v (was %v)", after, before)
	}
}

func TestJitterIsStableByDayAndBounded(t *testing.T) {
	d1 := time.Date(2026, 11, 12, 20, 0, 0, 0, time.Local)
	d2 := d1.AddDate(0, 0, 1)
	moved := 0
	for _, k := range []string{"movie1", "movie2", "tv3", "tv4", "movie5", "tv6"} {
		a, b := Jitter(k, d1, 0.06), Jitter(k, d1.Add(3*time.Hour), 0.06)
		if a != b {
			t.Errorf("%s: same day gave %v and %v", k, a, b)
		}
		if a < 0.94 || a > 1.06 {
			t.Errorf("%s: %v outside the band", k, a)
		}
		if Jitter(k, d2, 0.06) != a {
			moved++
		}
	}
	if moved < 4 {
		t.Errorf("only %d of 6 titles moved overnight", moved)
	}
}

func TestLearnOnceTeachesOnce(t *testing.T) {
	p := Open("")
	if !p.LearnOnce("dune|fin", korCrime, Finished) || p.LearnOnce("dune|fin", korCrime, Finished) {
		t.Fatal("the same id must learn once")
	}
	if p.Events() != 1 {
		t.Fatalf("events = %d, want 1", p.Events())
	}
	if !p.LearnOnce("dune|play", korCrime, Played) || p.Events() != 2 {
		t.Fatal("a different outcome is a new lesson")
	}
}
