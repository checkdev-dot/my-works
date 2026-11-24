package app

import (
	"strings"
	"sync"

	"tvmode/internal/history"
)

// Pages often say only part of what is playing: JioHotstar gives the episode's name but
// not its number, the Netflix helper sometimes gives neither (or just "Netflix" as the
// title). fillEp completes an entry from what TV Mode already knows about that address
// (an earlier, fuller entry, or the link book) and, failing that, from TMDB: the
// episode's name finds its number, the number finds its name. Each address is looked up
// on TMDB once per run; the answer is kept here and in the link book.

type epInfo struct {
	Title, Show, EpTitle string
	Season, Episode      int
}

var epMemo = struct {
	sync.Mutex
	m     map[string]epInfo // address -> what is known
	tried map[string]bool   // address -> TMDB asked already
}{m: map[string]epInfo{}, tried: map[string]bool{}}

func epURL(u string) string { return strings.SplitN(u, "?", 2)[0] }

// epComplete says whether the entry needs nothing more.
func epComplete(e history.Entry) bool {
	return e.Show == "" || (e.Season > 0 && e.Episode > 0 && e.EpTitle != "")
}

// fillEp completes e in place from what is known now; it starts a TMDB lookup (once
// per address) when something is still missing. It never blocks.
func (a *App) fillEp(e *history.Entry) {
	u := epURL(e.URL)
	// 1. an earlier entry for this same address that knew more
	if a.ld != nil && (e.Episode == 0 || e.Show == "" || e.EpTitle == "") {
		for _, x := range a.ld.hist.List() {
			if epURL(x.URL) != u || x.Service != e.Service {
				continue
			}
			mergeEp(e, epInfo{x.Title, x.Show, x.EpTitle, x.Season, x.Episode})
		}
	}
	// 2. the link book knows season and episode by address
	if e.Show != "" && (e.Season == 0 || e.Episode == 0) && a.ld != nil {
		if se, ep := a.linkEpisode(e.Service, u); se > 0 {
			e.Season, e.Episode = se, ep
		}
	}
	// 3. what TMDB told us earlier this run
	epMemo.Lock()
	if k, ok := epMemo.m[u]; ok {
		mergeEp(e, k)
	}
	need := !epComplete(*e) && !epMemo.tried[u]
	if need {
		epMemo.tried[u] = true
	}
	epMemo.Unlock()
	// a Netflix report without the episode was filed by its address: once the show is known it joins the show card
	if e.Show != "" && e.Service == "netflix" && (e.Group == "" || strings.Count(e.Group, "|") == 2) {
		e.Group = "netflix|" + strings.ToLower(e.Show)
	}
	if need && a.ld != nil && a.ld.tm != nil {
		go a.lookupEp(*e)
	}
}

// mergeEp fills what e is missing from k (the page's own words win).
func mergeEp(e *history.Entry, k epInfo) {
	if (e.Title == "" || strings.EqualFold(e.Title, "netflix")) && k.Title != "" {
		e.Title = k.Title
	}
	if e.Show == "" && k.Show != "" && (k.Season > 0 || k.EpTitle != "") {
		e.Show = k.Show
	}
	if e.Season == 0 && e.Episode == 0 && k.Season > 0 {
		e.Season, e.Episode = k.Season, k.Episode
	}
	if e.EpTitle == "" && k.EpTitle != "" && (e.Episode == 0 || e.Episode == k.Episode) {
		e.EpTitle = k.EpTitle
	}
}

// lookupEp asks TMDB for the missing half (number from name, or name from number).
func (a *App) lookupEp(e history.Entry) {
	kind, id, err := a.ld.tm.Search(e.Show)
	if err != nil || kind != "tv" || id == 0 {
		return
	}
	got := epInfo{Title: e.Title, Show: e.Show, EpTitle: e.EpTitle, Season: e.Season, Episode: e.Episode}
	want := normTitle(e.EpTitle)
	switch {
	case e.Season > 0 && e.Episode > 0: // the name from the number
		eps, err := a.ld.tm.Season(id, e.Season)
		if err != nil {
			return
		}
		for _, x := range eps {
			if x.N == e.Episode {
				got.EpTitle = x.Name
			}
		}
	case want != "": // the number from the name, season by season
		first, last := 1, 40
		if e.Season > 0 {
			first, last = e.Season, e.Season
		}
	seasons:
		for n := first; n <= last; n++ {
			eps, err := a.ld.tm.Season(id, n)
			if err != nil || len(eps) == 0 {
				break
			}
			for _, x := range eps {
				if normTitle(x.Name) == want {
					got.Season, got.Episode = n, x.N
					break seasons
				}
			}
		}
	}
	if got.Season == 0 && got.EpTitle == e.EpTitle {
		return
	}
	u := epURL(e.URL)
	epMemo.Lock()
	epMemo.m[u] = got
	epMemo.Unlock()
	if got.Season > 0 && got.Episode > 0 {
		a.linkPut(linkKey(e.Service, e.Show, got.Season, got.Episode), u)
	}
	if a.ld.hist.SetEp(u, got.Season, got.Episode, got.EpTitle) {
		a.pushRows()
	}
}
