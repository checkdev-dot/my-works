package app

// Phase 5, the mood tap. The phone's drawer has three words: Light, Gripping, Comfort.
// One tap sets a mood, a second tap on the same word clears it, and it clears itself at
// 05:00. A mood is a lean on tonight's ranking, like the 15 percent occasion lean (it
// never goes above 15 percent), and the picks it floats say so in their kicker
// ("LIGHT TONIGHT"). It lives in memory only: nothing is written to disk.

import (
	"encoding/json"
	"log"
	"strings"
	"time"

	"tvmode/internal/tmdb"
)

// TMDB genre ids, movie and tv both (tv has its own ids for some kinds).
var moodSets = map[string]struct{ strong, mild, against []int }{
	// Light: a laugh, a song, a family afternoon; nothing grim
	"light": {strong: []int{35, 16, 10751}, mild: []int{10749, 10402, 10764}, against: []int{27, 53, 80, 10752, 10768, 9648}},
	// Gripping: thriller, crime, mystery; then action and the dark
	"gripping": {strong: []int{53, 80, 9648}, mild: []int{28, 10759, 27, 878, 10765}, against: []int{10751, 16, 10402}},
	// Comfort: kind and familiar: family, comedy, romance, plus what his taste already loves
	"comfort": {strong: []int{10751, 35, 10749}, mild: []int{16, 10766}, against: []int{27, 53, 80, 10752}},
}

var moodWord = map[string]string{"light": "LIGHT TONIGHT", "gripping": "GRIPPING TONIGHT", "comfort": "COMFORT TONIGHT"}

// next0500 is the first 05:00 after t.
func next0500(t time.Time) time.Time {
	d := time.Date(t.Year(), t.Month(), t.Day(), 5, 0, 0, 0, t.Location())
	if !d.After(t) {
		d = d.AddDate(0, 0, 1)
	}
	return d
}

// d5MoodAt is the mood in force at a moment ("" none): one that was set before the last 05:00 is gone.
func d5MoodAt(now time.Time) string {
	d5.mu.Lock()
	defer d5.mu.Unlock()
	if d5.mood == "" {
		return ""
	}
	if !now.Before(next0500(d5.moodAt)) {
		d5.mood = ""
		return ""
	}
	return d5.mood
}

func (a *App) d5MoodNow() string { return d5MoodAt(a.now()) }

// d5Mood answers the phone's {"t":"mood","m":"light|gripping|comfort|"}. The phone sends
// the word it wants in force, so a repeat of the same frame changes nothing; the phone
// itself turns a second tap into "".
func (a *App) d5Mood(c *client, raw []byte) {
	var in struct {
		M string `json:"m"`
	}
	if json.Unmarshal(raw, &in) != nil {
		return
	}
	m := strings.ToLower(strings.TrimSpace(in.M))
	if _, ok := moodSets[m]; !ok && m != "" {
		log.Printf("mood: ignored an unknown word")
		return
	}
	now := a.now()
	d5.mu.Lock()
	changed := d5.mood != m
	d5.mood, d5.moodAt = m, now
	d5.mu.Unlock()
	if m == "" {
		log.Printf("mood: cleared")
	} else if changed {
		log.Printf("mood: %s until 05:00", m)
	}
	if a.hub != nil {
		a.hub.broadcastRemotes(map[string]any{"t": "mood", "m": m}) // every phone shows the same word
	}
	if changed && a.hub != nil && a.ld != nil {
		a.pushRows()
	}
}

// moodScore is how well a title fits a mood: 1 is a strong fit, 0 neutral, below 0 against.
func (a *App) moodScore(m string, it tmdb.Item) float64 {
	set, ok := moodSets[m]
	if !ok {
		return 0
	}
	s := 0.0
	switch {
	case hasGenre(it, set.strong...):
		s = 1
	case hasGenre(it, set.mild...):
		s = 0.5
	}
	if hasGenre(it, set.against...) {
		s -= 0.7
	}
	if m == "comfort" && a.ld != nil && a.ld.taste != nil && a.ld.taste.Affinity(tasteOf(it, "")) > 0.05 {
		s += 0.35 // familiar ground: what he already loves
	}
	if s > 1 {
		s = 1
	}
	return s
}

// moodLean is the factor on a title's score: at most +15 percent for a fit, a little
// less for a clash (and exactly 1 with no mood).
func (a *App) moodLean(it tmdb.Item) float64 {
	m := a.d5MoodNow()
	if m == "" {
		return 1
	}
	return 1 + 0.15*a.moodScore(m, it)
}

// moodKick is the hero kicker of a plain pick that fits the mood in force ("" otherwise).
func (a *App) moodKick(it tmdb.Item) string {
	m := a.d5MoodNow()
	if m != "" && a.moodScore(m, it) > 0 {
		return moodWord[m]
	}
	return ""
}
