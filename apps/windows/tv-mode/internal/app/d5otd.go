package app

// Phase 5, the "On this day" shelf on the TV: what Dev finished a year ago today, then
// classics that came out in this calendar week in earlier years. It spends no TMDB
// calls: the classics come from the rows and occasion pools already fetched (each
// title carries its release date). It shows only with 4 or more titles on his
// services, like every other shelf, and it sits after the themed shelves, so a
// festival shelf keeps its place and its titles.

import (
	"fmt"
	"sort"
	"time"

	"tvmode/internal/library"
	"tvmode/internal/tmdb"
)

const (
	otdWeek    = 3    // days either side of today, in earlier years
	otdVotes   = 1000 // a classic has been seen by a crowd
	otdMinAge  = 2    // years old at least
	otdMaxEach = 12
)

type d5Otd struct {
	items []tmdb.Item
	lib   map[string]cardItem // library entries: the card to show (a picture from the library)
	why   map[string]string
}

func sameWeek(d time.Time, now time.Time, span int) bool {
	// the date's month and day, put in this year (and the next and last, around New Year)
	for dy := -1; dy <= 1; dy++ {
		t := time.Date(now.Year()+dy, d.Month(), d.Day(), 12, 0, 0, 0, now.Location())
		diff := t.Sub(time.Date(now.Year(), now.Month(), now.Day(), 12, 0, 0, 0, now.Location())).Hours() / 24
		if diff >= -float64(span)-0.5 && diff <= float64(span)+0.5 {
			return true
		}
	}
	return false
}

// d5OnThisDay builds the shelf's titles, or nil when fewer than 4 can be shown.
func (a *App) d5OnThisDay(now time.Time, data recData, st *library.Store) *d5Otd {
	o := &d5Otd{lib: map[string]cardItem{}, why: map[string]string{}}
	seen := map[string]bool{}
	// 1. what he finished a year ago (the day before, the day, the day after)
	if st != nil {
		ago := time.Date(now.Year()-1, now.Month(), now.Day(), 12, 0, 0, 0, now.Location())
		var fin []library.Item
		for _, it := range st.List(library.Finished) {
			if it.DoneAt > 0 && isTmdbKey(it.ID) && it.Img != "" && libSvcOf(it) != "" && libSvcOf(it) != "youtube" {
				t := time.UnixMilli(it.DoneAt).In(now.Location())
				if d := t.Sub(ago).Hours() / 24; d >= -1.5 && d <= 1.5 {
					fin = append(fin, it)
				}
			}
		}
		sort.SliceStable(fin, func(i, j int) bool { return fin[i].DoneAt > fin[j].DoneAt })
		for _, it := range fin {
			ti, ok := a.libRegister(it)
			if !ok || seen[it.ID] {
				continue
			}
			ti.Service = libSvcOf(it)
			seen[it.ID] = true
			o.items = append(o.items, ti)
			o.lib[it.ID] = cardItem{Key: it.ID, Title: libFirst(it.Show, it.Title), Service: ti.Service, Kind: it.Kind, Img: a.imgURL(it.Img), Why: "You finished it a year ago", Line: "You finished it a year ago"}
		}
	}
	// 2. classics that came out this week in earlier years
	pool := map[string]tmdb.Item{}
	add := func(it tmdb.Item) {
		if it.Service == "" || (it.Backdrop == "" && it.Poster == "") || it.Votes < otdVotes {
			return
		}
		if y := yearOf(it); y == 0 || y > now.Year()-otdMinAge {
			return
		}
		if d, err := time.ParseInLocation("2006-01-02", it.Date, now.Location()); err != nil || !sameWeek(d, now, otdWeek) {
			return
		}
		if k := itemKey(it); !seen[k] && !a.isRated(k) {
			if _, have := pool[k]; !have {
				pool[k] = it
			}
		}
	}
	for _, s := range data.Shelves {
		for _, it := range s.Items {
			add(it)
		}
	}
	for _, l := range data.Occasions {
		for _, it := range l {
			add(it)
		}
	}
	var cl []tmdb.Item
	for _, it := range pool {
		cl = append(cl, it)
	}
	sort.SliceStable(cl, func(i, j int) bool {
		if cl[i].Votes != cl[j].Votes {
			return cl[i].Votes > cl[j].Votes
		}
		return itemKey(cl[i]) < itemKey(cl[j])
	})
	per := map[string]int{}
	for _, it := range cl {
		if per[it.Kind] >= otdMaxEach {
			continue
		}
		per[it.Kind]++
		k := itemKey(it)
		o.items = append(o.items, it)
		o.why[k] = fmt.Sprintf("Out this week in %d", yearOf(it))
	}
	if len(o.items) < 4 {
		return nil
	}
	return o
}

// libCard is the card of a title he finished a year ago (nil-safe: false when there is no shelf).
func (o *d5Otd) libCard(k string) (cardItem, bool) {
	if o == nil {
		return cardItem{}, false
	}
	c, ok := o.lib[k]
	return c, ok
}

// apply gives a card its own line (what stands under the title) and, for a title from
// the library, its picture.
func (o *d5Otd) apply(it tmdb.Item, c cardItem) cardItem {
	k := itemKey(it)
	if lc, ok := o.libCard(k); ok {
		return lc
	}
	if o != nil && o.why[k] != "" {
		c.Why = o.why[k]
	}
	return c
}
