package app

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"tvmode/internal/history"
	"tvmode/internal/library"
)

// The desk reporter (HUB-DIRECTION phase 4). The TV Mode Helper in Dev's everyday Chrome,
// when its window is not on the TV monitor, sends passive reports with "where":"desk" to the
// same POST /api/ext/watch. Everything here keeps them away from the TV: a desk report goes
// to libDeskReport and nowhere else (not history, not a.nf media state, not the command
// queue, not the episode book), whether the TV is on, off or in standby.
//
// What this file adds on top of libDeskReport (lib.go, phase 2):
//   - a rate limit (one report per 20 s per video, 40 a minute in all);
//   - "final" reports: the helper's last word on a play (paused, ended, page left) carries
//     playing:false, which libDeskReport would drop. PROTOCOL.md says a desk report is dropped
//     when playing is false; a final report is the one exception, accepted only when the same
//     video had a playing report in the last 10 minutes, and recorded as a position update;
//   - the desk/TV decision the helper switches modes on (deskWindow, deskStays);
//   - in standby (no launcher data yet) the first report starts the data, off the request path;
//   - Continue watching: library items last played at the desk, merged into the TV's row.

const (
	deskPlayGap   = 20 * time.Second // the helper sends every 30 s; a quicker one is dropped
	deskFinalGap  = 2 * time.Second
	deskFinalSpan = 10 * time.Minute // a final report needs a playing one this recent
	deskPerMinute = 40
	deskContBase  = 1000 // Continue cards of desk items carry this index + k (history indexes are below 12)
	deskContMax   = 3
	deskContSpan  = 7 * 24 * time.Hour
)

// deskClock and deskInit are variables so tests control time and never build the real launcher data.
var (
	deskClock = time.Now
	deskInit  = func(a *App) { a.initLauncherData() }
)

type deskState struct {
	mu     sync.Mutex
	last   map[string]time.Time // video -> the last report let through
	played map[string]time.Time // video -> the last playing report let through
	recent []time.Time          // every report let through, for the per-minute cap
	cont   []string             // library ids behind the desk cards of the last Continue row (index k = card I - deskContBase)
}

func (a *App) deskSt() *deskState {
	a.deskOnce.Do(func() { a.deskS = &deskState{last: map[string]time.Time{}, played: map[string]time.Time{}} })
	return a.deskS
}

func deskSvcOK(svc string) bool {
	switch svc {
	case "netflix", "prime", "jiohotstar", "youtube":
		return true
	}
	return false
}

// deskWindow says whether a (normal, TV-style) report comes from a window positively off the
// TV monitor. Only the window position decides: a TV window that is merely not the current app
// is NOT a desk window (reportAllowed handles that case).
// With the TV session down (standby: the PC agent runs, Edge and the TV screen do not) there is no
// TV window at all, and a powered-off TV may not even be in Windows' monitor list: every window is a desk one.
func (a *App) deskWindow(s *extScreen) bool {
	return a.standbyNow() || (s != nil && !a.reportFromTV(s))
}

// deskStays is the answer to a desk report: true while the window still is not on the TV
// (or says nothing about where it is), false once it is: the helper then goes back to TV reports.
func (a *App) deskStays(s *extScreen) bool { return a.standbyNow() || s == nil || !a.reportFromTV(s) }

// allow says whether a report may go on, and remembers it when it does.
func (d *deskState) allow(key string, final bool, now time.Time) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	if final {
		if p, ok := d.played[key]; !ok || now.Sub(p) > deskFinalSpan {
			return false // a final report for something not seen playing
		}
		if l, ok := d.last[key]; ok && now.Sub(l) < deskFinalGap {
			return false
		}
	} else if l, ok := d.last[key]; ok && now.Sub(l) < deskPlayGap {
		return false
	}
	cut := now.Add(-time.Minute)
	n := 0
	for _, t := range d.recent {
		if t.After(cut) {
			d.recent[n] = t
			n++
		}
	}
	d.recent = d.recent[:n]
	if len(d.recent) >= deskPerMinute {
		return false
	}
	d.recent = append(d.recent, now)
	d.last[key] = now
	if !final {
		d.played[key] = now
	}
	if len(d.last) > 128 { // forget what is old
		for k, t := range d.last {
			if now.Sub(t) > time.Hour {
				delete(d.last, k)
				delete(d.played, k)
			}
		}
	}
	return true
}

func deskCap(s string, n int) string {
	s = strings.TrimSpace(s)
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

// deskReport handles one report with where:"desk". It never touches history, a.nf or the command queue.
func (a *App) deskReport(svc string, in extWatch, now time.Time) {
	if !deskSvcOK(svc) || in.Dur <= 0 || in.Dur > 48*3600 {
		return
	}
	in.Title, in.EpTitle = deskCap(in.Title, 200), deskCap(in.EpTitle, 200)
	in.URL = deskCap(strings.SplitN(in.URL, "#", 2)[0], 300)
	if in.Pos < 0 {
		in.Pos = 0
	}
	if in.Pos > in.Dur {
		in.Pos = in.Dur
	}
	if !in.Final && in.Playing != nil && !*in.Playing {
		return // contract: a desk report that is not playing is dropped (only a final report may say "stopped")
	}
	if a.ld == nil { // standby, nothing built yet: start the data off this request; this report is lost, the next one lands
		go deskInit(a)
		return
	}
	if !a.deskSt().allow(svc+"|"+in.URL, in.Final, deskClock()) {
		return
	}
	if in.Final {
		in.Playing = nil // a position update: the helper says the play stopped here, libDeskReport only takes "playing"
	}
	a.libDeskReport(svc, in)
}

// --- Continue watching: what he last watched at the desk ---

// deskWhen is "at the desk, 20:14" (with the day when it is not today).
func deskWhen(ms int64) string {
	t := time.UnixMilli(ms).In(time.Local)
	now := nowTime()
	switch {
	case t.YearDay() == now.YearDay() && t.Year() == now.Year():
		return "at the desk, " + t.Format("15:04")
	case now.Sub(t) < 36*time.Hour:
		return "at the desk, yesterday " + t.Format("15:04")
	}
	return "at the desk, " + t.Format("Mon 2 Jan 15:04")
}

// deskContMerge adds the desk's cards to the Continue row cont (built from the history hl, one
// card per entry, card.I = index into hl). A desk card is a library item whose last play was at
// the desk, still being watched (2 to 95 percent), that the TV can open. It sits among the
// history cards by time; a history card of the same title that is older is replaced by it, a
// newer one wins. Desk cards carry I = deskContBase + k, which the launcher sends back as
// {"t":"openitem","k":"cont","i":I}; openItem hands those to deskContOpen.
func (a *App) deskContMerge(cont []cardItem, hl []history.Entry) []cardItem {
	st := a.libStore()
	if st == nil {
		return cont
	}
	d := a.deskSt()
	now := nowTime()
	var ids []string
	for _, it := range st.List(library.Watching) {
		if len(ids) >= deskContMax {
			break
		}
		if it.LastWhere != "desk" || !libPlayable(it) || it.Dur <= 0 || it.Pct < 0.02 || it.Pct >= 0.95 || now.Sub(time.UnixMilli(it.LastAt)) > deskContSpan {
			continue
		}
		n := normTitle(libFirst(it.Show, it.Title))
		newer := false
		keep := cont[:0:0]
		for _, c := range cont {
			if c.I < len(hl) && c.I >= 0 && normTitle(libFirst(hl[c.I].Show, hl[c.I].Title)) == n {
				if hl[c.I].At >= it.LastAt {
					newer = true // the TV's own entry is newer: it stays, the desk card is not needed
					keep = append(keep, c)
				}
				continue // an older one: the desk card replaces it
			}
			keep = append(keep, c)
		}
		cont = keep
		if newer {
			continue
		}
		line := deskWhen(it.LastAt)
		if it.Season > 0 && it.Episode > 0 {
			line = fmt.Sprintf("S%d E%d  ·  %s", it.Season, it.Episode, line)
		}
		card := cardItem{Title: libFirst(it.Show, it.Title), Service: libSvcOf(it), Kind: it.Kind, Img: a.imgURL(it.Img), Pct: it.Pct, I: deskContBase + len(ids), Line: line}
		pos := len(cont)
		for i, c := range cont {
			if c.I >= 0 && c.I < len(hl) && hl[c.I].At < it.LastAt {
				pos = i
				break
			}
		}
		cont = append(cont, cardItem{})
		copy(cont[pos+1:], cont[pos:])
		cont[pos] = card
		ids = append(ids, it.ID)
	}
	d.mu.Lock()
	d.cont = ids
	d.mu.Unlock()
	return cont
}

// deskContOpen plays the desk card the launcher chose (i = deskContBase + k) on the TV.
func (a *App) deskContOpen(i int) {
	d := a.deskSt()
	d.mu.Lock()
	k := i - deskContBase
	id := ""
	if k >= 0 && k < len(d.cont) {
		id = d.cont[k]
	}
	d.mu.Unlock()
	st := a.libStore()
	if id == "" || st == nil {
		return
	}
	it, ok := st.Get(id)
	if !ok {
		return
	}
	hint := it.LastSvc
	if hint == "youtube" {
		hint = ""
	}
	a.libOpenTV(id, hint, it.Season, it.Episode)
}
