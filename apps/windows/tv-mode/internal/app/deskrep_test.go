package app

import (
	"strconv"
	"strings"
	"testing"
	"time"

	"tvmode/internal/history"
	"tvmode/internal/library"
)

// deskTestApp is the extension test app (two monitors: work, then the TV) with a library
// in memory. Nothing here reaches the network or Dev's AppData.
func deskTestApp(t *testing.T) *App {
	t.Helper()
	a := extTestApp(t)
	a.ld.lib = library.Open("")
	a.ld.libr = &libResolver{}
	return a
}

// deskAt makes deskClock a clock the test moves.
func deskAt(t *testing.T) *time.Time {
	t.Helper()
	now := time.Date(2026, 11, 4, 20, 0, 0, 0, time.Local)
	old := deskClock
	deskClock = func() time.Time { return now }
	t.Cleanup(func() { deskClock = old })
	return &now
}

const (
	scrDesk = `"scr":{"x":100,"y":50,"w":1400,"h":900,"dpr":1}`
	scrTV   = `"scr":{"x":2600,"y":0,"w":1920,"h":1080,"dpr":1}`
	nfDesk  = `"where":"desk","svc":"netflix","title":"Dark","season":1,"episode":2,"epTitle":"Lies","url":"https://www.netflix.com/watch/70000002","dur":3000,"playing":true,`
	ytDesk  = `"where":"desk","svc":"youtube","title":"A long talk","url":"https://www.youtube.com/watch?v=abcdefghijk","dur":3000,`
)

// A desk report reaches the library and nothing else: not history, not the live media, not
// the player queue, not the episode book. The TV window's own commands stay queued.
func TestDeskReportNeverReachesHistoryMediaOrQueue(t *testing.T) {
	deskAt(t)
	a := deskTestApp(t)
	a.nf.set(Media{Playing: true, Pos: 7, Dur: 3000}, time.Now()) // the TV's window is live
	a.nf.push(nfCmd{A: "skip"}, time.Now())
	for _, body := range []string{
		`{` + nfDesk + `"pos":100,` + scrDesk + `}`,
		`{` + ytDesk + `"pos":50,"playing":true,` + scrDesk + `}`,
		`{"where":"desk","svc":"prime","title":"The Boys","pos":300,"dur":3000,"playing":true,"url":"https://www.primevideo.com/detail/0ABC/",` +
			`"w":{"href":"https://www.primevideo.com/detail/0ABC/","title":"Prime Video: The Boys","pt":"The Boys","ps":"Season 2, Ep. 3 Barbary Coast","has":true,"playing":true,"pos":300,"dur":3000},` + scrDesk + `}`,
	} {
		code, out := post(a, "watch", body)
		if l, _ := out["cmds"].([]any); code != 200 || l == nil || len(l) != 0 {
			t.Fatalf("a desk report must answer an empty cmds list: %d %v", code, out)
		}
		if out["desk"] != true {
			t.Fatalf("a desk report from off the TV must answer desk:true: %v", out)
		}
	}
	for _, id := range []string{"yt:abcdefghijk", "name:dark", "name:" + normTitle("The Boys")} {
		it, ok := a.ld.lib.Lookup(id)
		if !ok || it.LastWhere != "desk" || it.Source != "desk-reporter" {
			t.Fatalf("library %s = %+v %v", id, it, ok)
		}
	}
	if n := len(a.ld.hist.List()); n != 0 {
		t.Fatalf("a desk report reached history: %d entries", n)
	}
	if m, ok := a.nf.get(time.Now()); !ok || m.Pos != 7 || m.Dur != 3000 {
		t.Fatalf("a desk report changed the live media: %+v %v", m, ok)
	}
	if a.linkGet(linkKey("netflix", "Dark", 1, 2)) != "" || a.epMarkOf("Dark", 1, 2).Pos != 0 {
		t.Fatal("a desk report reached the link book or the episode book")
	}
	if cmds := a.nf.take(time.Now()); len(cmds) != 1 || cmds[0].A != "skip" {
		t.Fatalf("a desk report touched the player queue: %v", cmds)
	}
	// the TV's window still works exactly as before
	a.nf.push(nfCmd{A: "skip"}, time.Now())
	_, out := post(a, "watch", `{"svc":"netflix","title":"Dark","season":1,"episode":2,"pos":5,"dur":3000,"playing":true,"url":"https://www.netflix.com/watch/9",`+scrTV+`}`)
	if l, _ := out["cmds"].([]any); len(l) != 1 || out["desk"] == true {
		t.Fatalf("the TV window lost its command or was sent to the desk: %v", out)
	}
}

// A TV-style report (no "where") from a window off the TV monitor is answered desk:true and
// is not used: no card, no live media, no commands. A TV window that is merely not the current
// app is NOT sent to the desk.
func TestDeskSwitchOnlyForAWindowOffTheTV(t *testing.T) {
	a := deskTestApp(t)
	a.nf.set(Media{Playing: true, Pos: 1, Dur: 3000}, time.Now()) // the TV's window is live
	a.nf.push(nfCmd{A: "skip"}, time.Now())
	_, out := post(a, "watch", `{"svc":"netflix","title":"Dark","season":1,"episode":1,"pos":5,"dur":3000,"playing":true,"url":"https://www.netflix.com/watch/9",`+scrDesk+`}`)
	if out["desk"] != true {
		t.Fatalf("a window off the TV was not told it is at the desk: %v", out)
	}
	if l, _ := out["cmds"].([]any); len(l) != 0 {
		t.Fatalf("commands went to a desk window: %v", out)
	}
	if m, _ := a.nf.get(time.Now()); m.Pos != 1 || a.ld.lib.Len() != 0 {
		t.Fatalf("a TV-style report from a desk window changed the media or the library: %+v", m)
	}
	if _, ok := cardOf(a, "netflix"); ok {
		t.Fatal("a TV-style report from a desk window was used")
	}
	if len(a.nf.take(time.Now())) != 1 {
		t.Fatal("the queue was drained by a desk window")
	}
	// the TV's window while another app is current (extOn): refused, but not "desk"
	a.mu.Lock()
	a.extOn, a.st.App = true, "prime"
	a.mu.Unlock()
	_, out = post(a, "watch", `{"svc":"netflix","title":"Dark","season":1,"episode":1,"pos":5,"dur":3000,"playing":true,"url":"https://www.netflix.com/watch/9",`+scrTV+`}`)
	if out["desk"] == true {
		t.Fatalf("a TV window on its way out was sent to the desk: %v", out)
	}
	// a window dragged onto the TV: its desk report is answered desk:false
	_, out = post(a, "watch", `{`+nfDesk+`"pos":100,`+scrTV+`}`)
	if out["desk"] != false {
		t.Fatalf("a desk report from a window on the TV must answer desk:false: %v", out)
	}
}

func TestDeskRateLimit(t *testing.T) {
	now := deskAt(t)
	a := deskTestApp(t)
	send := func(pos int, extra string) {
		post(a, "watch", `{`+ytDesk+`"pos":`+itoa(pos)+`,"playing":true,`+extra+scrDesk+`}`)
	}
	pos := func() int { it, _ := a.ld.lib.Get("yt:abcdefghijk"); return it.Pos }
	send(100, "")
	*now = now.Add(5 * time.Second)
	send(105, "")
	if pos() != 100 {
		t.Fatalf("a second report within 20 s was not dropped: pos %d", pos())
	}
	*now = now.Add(20 * time.Second)
	send(130, "")
	if pos() != 130 {
		t.Fatalf("a report after 25 s was dropped: pos %d", pos())
	}
	// many different videos in a minute: capped
	*now = now.Add(time.Hour)
	for i := 0; i < deskPerMinute+10; i++ {
		post(a, "watch", `{"where":"desk","svc":"youtube","title":"v","url":"https://www.youtube.com/watch?v=abcdefg`+pad4(i)+`","pos":10,"dur":3000,"playing":true,`+scrDesk+`}`)
	}
	if n := a.ld.lib.Len(); n > deskPerMinute+1 {
		t.Fatalf("the per-minute cap did not hold: %d items", n)
	}
}

func itoa(n int) string { return strconv.Itoa(n) }
func pad4(n int) string { s := strconv.Itoa(n); return strings.Repeat("0", 4-len(s)) + s }

// A pause or end report ("final", playing:false) records where it stopped, but only for a
// video seen playing a moment ago; a plain "not playing" report is still dropped.
func TestDeskFinalReport(t *testing.T) {
	now := deskAt(t)
	a := deskTestApp(t)
	pos := func() int { it, _ := a.ld.lib.Get("yt:abcdefghijk"); return it.Pos }
	post(a, "watch", `{`+ytDesk+`"pos":900,"playing":false,"final":true,`+scrDesk+`}`)
	if _, ok := a.ld.lib.Get("yt:abcdefghijk"); ok {
		t.Fatal("a final report for something never seen playing was recorded")
	}
	post(a, "watch", `{`+ytDesk+`"pos":100,"playing":true,`+scrDesk+`}`)
	*now = now.Add(8 * time.Second)
	post(a, "watch", `{`+ytDesk+`"pos":108,"playing":false,`+scrDesk+`}`)
	if pos() != 100 {
		t.Fatalf("a plain not-playing report was recorded: pos %d", pos())
	}
	post(a, "watch", `{`+ytDesk+`"pos":108,"playing":false,"final":true,`+scrDesk+`}`)
	if pos() != 108 {
		t.Fatalf("the final report was not recorded: pos %d", pos())
	}
	*now = now.Add(30 * time.Minute)
	post(a, "watch", `{`+ytDesk+`"pos":500,"playing":false,"final":true,`+scrDesk+`}`)
	if pos() != 108 {
		t.Fatalf("a stale final report was recorded: pos %d", pos())
	}
	// the end of a video finishes it
	*now = now.Add(time.Minute)
	post(a, "watch", `{`+ytDesk+`"pos":2900,"playing":true,`+scrDesk+`}`)
	*now = now.Add(10 * time.Second)
	post(a, "watch", `{`+ytDesk+`"pos":2999,"playing":false,"final":true,`+scrDesk+`}`)
	if it, _ := a.ld.lib.Get("yt:abcdefghijk"); it.State != library.Finished {
		t.Fatalf("a video that ended at the desk is not finished: %+v", it)
	}
}

// With the TV in standby (launcher data not built yet) the first desk report starts the data
// (off the request path); with the data built and the TV down, reports are recorded.
func TestDeskReportInStandbyAndTVOff(t *testing.T) {
	deskAt(t)
	a := extTestApp(t)
	a.o.Standby = true
	a.ld = nil
	built := make(chan struct{}, 1)
	old := deskInit
	deskInit = func(*App) { built <- struct{}{} } // never the real launcher data: it opens Dev's files
	t.Cleanup(func() { deskInit = old })
	code, out := post(a, "watch", `{`+ytDesk+`"pos":100,"playing":true,`+scrDesk+`}`)
	if code != 200 || out["desk"] != true {
		t.Fatalf("standby desk report = %d %v", code, out)
	}
	select {
	case <-built:
	case <-time.After(2 * time.Second):
		t.Fatal("a desk report in standby did not start the launcher data")
	}
	// data built, TV off
	a = deskTestApp(t)
	a.o.Standby = true
	a.tvState.Store(tvOff)
	post(a, "watch", `{`+ytDesk+`"pos":100,"playing":true,`+scrDesk+`}`)
	if it, ok := a.ld.lib.Get("yt:abcdefghijk"); !ok || it.LastWhere != "desk" {
		t.Fatalf("a desk report with the TV off was lost: %+v %v", it, ok)
	}
	if len(a.ld.hist.List()) != 0 || nfPlaying(a) {
		t.Fatal("a desk report in standby reached history or the media state")
	}
	// with the TV session down there is no TV window: even a report whose position is on the TV
	// monitor (a powered-off TV may fall back to the primary monitor) is a desk one
	_, out = post(a, "watch", `{"svc":"netflix","title":"Dark","season":1,"episode":1,"pos":5,"dur":3000,"playing":true,"url":"https://www.netflix.com/watch/9",`+scrTV+`}`)
	if out["desk"] != true || len(a.ld.hist.List()) != 0 || nfPlaying(a) {
		t.Fatalf("standby: a TV-style report must be told to go desk and be unused: %v", out)
	}
	a.tvState.Store(tvOn) // the TV session is up: the same report is the TV's again
	if _, out = post(a, "watch", `{"svc":"netflix","title":"Dark","season":1,"episode":1,"pos":5,"dur":3000,"playing":true,"url":"https://www.netflix.com/watch/9",`+scrTV+`}`); out["desk"] == true || !nfPlaying(a) {
		t.Fatalf("TV up: the TV window must be the TV's: %v", out)
	}
}

// Continue watching: a desk item shows as "at the desk, hh:mm", opens through its own index,
// and does not double a title the TV watched more recently.
func TestDeskContinueRow(t *testing.T) {
	deskAt(t)
	a := deskTestApp(t)
	post(a, "watch", `{`+ytDesk+`"pos":300,"playing":true,`+scrDesk+`}`)
	hl := a.ld.hist.List()
	cont := a.deskContMerge([]cardItem{}, hl)
	if len(cont) != 1 || cont[0].Title != "A long talk" || !strings.Contains(cont[0].Line, "at the desk, ") || cont[0].I != deskContBase {
		t.Fatalf("desk card = %+v", cont)
	}
	if !strings.HasPrefix(cont[0].Line, "at the desk, ") || len(cont[0].Line) != len("at the desk, 20:14") {
		t.Fatalf("the line should read like \"at the desk, 20:14\": %q", cont[0].Line)
	}
	if d := a.deskSt(); len(d.cont) != 1 || d.cont[0] != "yt:abcdefghijk" {
		t.Fatalf("index map = %v", d.cont)
	}
	// the TV watched the same title since: its own card stays, no desk card
	a.ld.hist.Note(history.Entry{Service: "youtube", Group: "yt:abcdefghijk", Title: "A long talk", URL: "https://www.youtube.com/watch?v=abcdefghijk", Pos: 600, Dur: 3000, At: time.Now().Add(time.Hour).UnixMilli()})
	hl = a.ld.hist.List()
	row := []cardItem{{Title: "A long talk", I: 0}}
	if got := a.deskContMerge(row, hl); len(got) != 1 || got[0].I != 0 {
		t.Fatalf("a newer TV entry should win: %+v", got)
	}
	// something marked Finished by hand leaves the row
	a.ld.lib.Apply(library.Report{ID: "yt:abcdefghijk", Type: library.EvFinish, Where: "desk", Manual: true})
	if got := a.deskContMerge([]cardItem{}, nil); len(got) != 0 {
		t.Fatalf("a finished item stayed in Continue: %+v", got)
	}
	// an index that maps to nothing opens nothing (no panic)
	a.deskContOpen(deskContBase + 5)
	a.deskContOpen(deskContBase - 1)
}
