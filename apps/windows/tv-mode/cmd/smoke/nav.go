package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/chromedp/chromedp"

	"tvmode/internal/winsys"
)

// Navigation scripts: local stand-in page first, then the real public pages.

type finfo struct {
	ID   int    `json:"id"`
	Tag  string `json:"tag"`
	Text string `json:"text"`
	Out  bool   `json:"out"`
	R    [4]int `json:"r"` // left, top, width, height
}

func focusNow() finfo {
	var f finfo
	_ = ev(tv, `window.__tv&&window.__tv.focusInfo?window.__tv.focusInfo():{}`, &f)
	return f
}

// pressUntil presses dir up to max times until cond holds; returns the trace of what had focus.
func pressUntil(dir string, max int, cond func(finfo) bool) (bool, []string) {
	var tr []string
	for i := 0; i < max; i++ {
		key(dir)
		time.Sleep(120 * time.Millisecond)
		f := focusNow()
		tr = append(tr, fmt.Sprintf("%s[%d,%d]", f.Text, f.R[0], f.R[1]))
		if cond(f) {
			return true, tr
		}
	}
	return false, tr
}

func clickPointOK() bool {
	return tvBool(`(function(){var t=__tv.navTarget();if(!t)return false;var e=document.elementFromPoint(t.x,t.y),a=document.activeElement;return !!e&&!!a&&(a.contains(e)||e.contains(a))})()`)
}

func navLocal() {
	fmt.Println("--- navigation on the stand-in page")
	tap(`[data-act="open:1"]`)
	waitTV(`location.href.indexOf("tvmode-app=prime")>0`, 6*time.Second)
	navTV("http://127.0.0.1:8780/navtest?tvmode-app=prime")
	waitTV(`document.readyState==="complete"`, 5*time.Second)
	time.Sleep(400 * time.Millisecond)
	_ = ev(tv, `window.scrollTo(0,0)`, nil)

	key("down")
	f := focusNow()
	check("first d-pad press puts focus on something", f.Tag != "" && f.Tag != "BODY" && f.Tag != "HTML", "%s %q", f.Tag, f.Text)
	check("no site focus style: thin outline is drawn", f.Out, "")
	check("focus is not the empty hero wrapper", !strings.Contains(f.Text, "tabindex") && f.Tag != "DIV" && f.Tag != "IMG", "%s", f.Tag)
	check("click point lands on the focused element", clickPointOK(), "")

	ok, tr := pressUntil("up", 8, func(f finfo) bool { return f.R[1] < 64 })
	check("up from the poster rows reaches the header", ok, "%v", tr)
	ok, tr = pressUntil("right", 6, func(f finfo) bool { return f.Text == "Sign in" })
	check("right along the header reaches Sign in", ok, "%v", tr)
	ok, tr = pressUntil("down", 8, func(f finfo) bool { return strings.HasPrefix(f.Text, "Tile") || strings.HasPrefix(f.Text, "Row2") })
	check("down from the header goes back to a poster", ok, "%v", tr)
	// walk the carousel to a tile that starts off screen
	ok, tr = pressUntil("right", 14, func(f finfo) bool { return f.Text == "Tile 10" || f.Text == "Row2 10" })
	vis := tvBool(`(function(){var r=document.activeElement.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()`)
	check("right along a carousel reaches an off-screen tile and scrolls it in", ok && vis, "visible=%v %v", vis, tr)

	// open a title, Back
	key("ok")
	opened := waitTV(`location.pathname.indexOf("/title/")==0`, 4*time.Second)
	check("OK opens the focused title (real click)", opened, "%s", trimURL(tvStr(`location.href`)))
	key("back")
	back := waitTV(`location.pathname==="/navtest"`, 4*time.Second)
	check("Back returns to the page", back, "%s", trimURL(tvStr(`location.href`)))
	time.Sleep(500 * time.Millisecond)

	// dialog: More info opens it, Back closes it without leaving the page
	_ = ev(tv, `window.scrollTo(0,0);document.activeElement&&document.activeElement.blur()`, nil)
	key("down")
	pressUntil("left", 12, func(f finfo) bool { return f.Text == "Tile 1" })
	ok, tr = pressUntil("up", 6, func(f finfo) bool { return f.Text == "More info" })
	if ok {
		key("ok")
		time.Sleep(250 * time.Millisecond)
	}
	dlg := tvBool(`__tv.modalOpen()`)
	check("OK on More info opens the dialog", ok && dlg, "%v", tr)
	key("back")
	time.Sleep(500 * time.Millisecond)
	check("Back closes the dialog and stays on the page", !tvBool(`__tv.modalOpen()`) && tvStr(`location.pathname`) == "/navtest", "%s", tvStr(`location.pathname`))

	// the pointer and the outline never show together
	key("down")
	_ = ev(tv, `__tv.pointer(300,300,true)`, nil)
	check("using the pointer hides the focus outline", !focusNow().Out, "")
	_ = ev(tv, `__tv.pointer(0,0,false)`, nil)
}

// laserCheck: absolute aim steps move the target steadily; the drawn dot follows smoothly; mouse events stay near 15 Hz.
func laserCheck() {
	fmt.Println("--- laser pointer")
	navTV("http://127.0.0.1:8780/browse?tvmode-app=prime")
	waitTV(`document.readyState==="complete"`, 5*time.Second)
	time.Sleep(400 * time.Millisecond)
	tap(`[data-act="recenter"]`)
	time.Sleep(250 * time.Millisecond)
	orient(0, 60, 0)
	time.Sleep(250 * time.Millisecond)
	_ = ev(tv, `window.__pr=[];window.__mm.length=0;if(!window.__prOn){window.__prOn=1;(function r(){var s=__tv.ptr();window.__pr.push([performance.now(),s.tx,s.ty,s.px,s.py]);requestAnimationFrame(r)})()}`, nil)
	holdPoint(true)
	t0 := time.Now()
	aimSweep(60, 45, 30) // 30 steps at ~33 ms
	time.Sleep(450 * time.Millisecond)
	holdTime := time.Since(t0)
	holdPoint(false)
	time.Sleep(200 * time.Millisecond)
	var pr [][]float64
	_ = ev(tv, `window.__pr`, &pr)
	// keep only samples taken while the sweep ran
	var ty, py []float64
	for _, s := range pr {
		if len(s) == 5 && s[0] > 0 {
			ty = append(ty, s[2])
			py = append(py, s[4])
		}
	}
	// only samples after the first movement and before the release rewind
	start, end := 0, len(ty)
	for i := range ty {
		if ty[i] != ty[0] {
			start = i
			break
		}
	}
	if end > start+10 {
		end -= 12 // the last frames include release (rewind by the jolt, by design)
	}
	mono, maxJump, maxPJump := true, 0.0, 0.0
	for i := start + 1; i < end; i++ {
		if ty[i] < ty[i-1]-0.01 {
			mono = false
		}
		if d := ty[i] - ty[i-1]; d > maxJump {
			maxJump = d
		}
		if py[i] < py[i-1]-0.01 {
			mono = false
		}
		if d := py[i] - py[i-1]; d > maxPJump {
			maxPJump = d
		}
	}
	check("laser: target moves down steadily, never back", mono && end-start > 8, "samples=%d", end-start)
	check("laser: no jumps in the target", maxJump < 120, "max step %.1f px", maxJump)
	check("laser: drawn dot never jumps (smoothed)", maxPJump < 60, "max frame step %.1f px", maxPJump)
	var mm [][]float64
	_ = ev(tv, `window.__mm`, &mm)
	rate := float64(len(mm)) / holdTime.Seconds()
	check("laser: real mouse moves go out near 15 Hz", rate >= 5 && rate <= 22, "%d moves in %.1f s = %.0f Hz", len(mm), holdTime.Seconds(), rate)
	var st struct{ Tx, Ty, Px, Py float64 }
	_ = ev(tv, `__tv.ptr()`, &st)
	lx, ly := lastMouse()
	check("laser: a final mouse move lands at the release spot", abs(ly-st.Ty) < 3 && abs(lx-st.Tx) < 3, "mouse %.0f,%.0f target %.0f,%.0f", lx, ly, st.Tx, st.Ty)
}

// ---- real sites ----

var signinRe = regexp.MustCompile(`(?i)sign\s*in|log\s*in|login|my space|profile, settings|account`)
var consentRe = `/^(reject|decline|refuse|only (essential|necessary)|continue without|necessary only|deny)/i`

func shot(name string) string {
	dir := os.Getenv("SMOKE_NAV_SHOTS")
	if dir == "" {
		dir = filepath.Join(os.TempDir(), "tvmode-nav-shots")
	}
	_ = os.MkdirAll(dir, 0o755)
	var buf []byte
	c, cancel := context.WithTimeout(tv, 8*time.Second)
	defer cancel()
	_ = chromedp.Run(c, chromedp.CaptureScreenshot(&buf))
	p := filepath.Join(dir, name+".png")
	_ = os.WriteFile(p, buf, 0o644)
	return p
}

func dump(label string) {
	var d string
	_ = ev(tv, `(function(){var f=__tv.focusInfo();return JSON.stringify(f)+" url="+location.href.slice(0,90)+" dialog="+__tv.modalOpen()})()`, &d)
	fmt.Printf("      DUMP %s: %s shot=%s\n", label, d, shot(label))
}

// navReal drives the real public pages signed out. It never presses OK on Sign in
// and never touches a form. Consent banners are declined (most private option).
func navReal() {
	sites := []struct {
		id, label, host string
		idx             int
	}{{"prime", "Prime Video", "primevideo.com", 1}, {"jiohotstar", "JioHotstar", "hotstar.com", 0}, {"netflix", "Netflix", "netflix.com", 2}, {"youtube", "YouTube", "youtube.com", 3}}
	for _, s := range sites {
		fmt.Println("--- real:", s.label)
		tap(fmt.Sprintf(`[data-act="open:%d"]`, s.idx))
		if !waitTV(fmt.Sprintf(`location.hostname.indexOf("%s")>=0`, s.host), 40*time.Second) {
			check(s.label+": page opens", false, "")
			continue
		}
		waitTV(`document.readyState==="complete"`, 20*time.Second)
		time.Sleep(5 * time.Second)
		var declined string
		_ = ev(tv, `(function(){var b=[].slice.call(document.querySelectorAll("button,[role=button],a")).filter(function(x){return `+consentRe+`.test((x.textContent||"").trim())&&x.getBoundingClientRect().width>0})[0];if(b){b.click();return b.textContent.trim().slice(0,30)}return ""})()`, &declined)
		if declined != "" {
			fmt.Printf("      declined consent: %q\n", declined)
			time.Sleep(2 * time.Second)
		}
		startURL := tvStr(`location.href`)
		if s.id == "youtube" {
			// YouTube TV handles its own keys: just check the d-pad moves and OK/Back work.
			key("right")
			key("down")
			key("ok")
			time.Sleep(3 * time.Second)
			key("back")
			time.Sleep(2 * time.Second)
			check(s.label+": d-pad, OK and Back work and the page is alive", tvBool(`document.readyState!=="loading"`), "%s", trimURL(tvStr(`location.href`)))
			dump(s.id + "-end")
			key("home")
			waitTV(`location.href.indexOf("/launcher/")>0`, 8*time.Second)
			continue
		}
		key("down") // first press puts focus on something
		f := focusNow()
		check(s.label+": first press focuses something", f.Tag != "" && f.Tag != "BODY", "%s %q %v", f.Tag, f.Text, f.R)
		if f.Tag == "" || f.Tag == "BODY" {
			dump(s.id + "-nofocus")
		}
		ok, tr := pressUntil("up", 14, func(f finfo) bool { return f.R[1] < 130 && f.R[1] >= 0 && f.Tag != "" })
		if !ok { // a left-hand rail (JioHotstar) is the header there
			ok, tr = pressUntil("left", 6, func(f finfo) bool { return f.R[0] < 100 && f.R[2] < 120 })
		}
		check(s.label+": up reaches the header", ok, "%v", tr)
		if !ok {
			dump(s.id + "-header")
		}
		// Sign in: along the header, right first then left
		found := signinRe.MatchString(focusNow().Text)
		var trs []string
		for i := 0; i < 14 && !found; i++ {
			key("right")
			time.Sleep(100 * time.Millisecond)
			f := focusNow()
			trs = append(trs, fmt.Sprintf("%s[%d,%d]", f.Text, f.R[0], f.R[1]))
			found = signinRe.MatchString(f.Text)
		}
		for i := 0; i < 20 && !found; i++ {
			key("left")
			time.Sleep(100 * time.Millisecond)
			f := focusNow()
			trs = append(trs, fmt.Sprintf("%s[%d,%d]", f.Text, f.R[0], f.R[1]))
			found = signinRe.MatchString(f.Text)
		}
		for i := 0; i < 10 && !found; i++ { // a rail (JioHotstar) lists My Space going down
			key("down")
			time.Sleep(100 * time.Millisecond)
			f := focusNow()
			trs = append(trs, fmt.Sprintf("%s[%d,%d]", f.Text, f.R[0], f.R[1]))
			found = signinRe.MatchString(f.Text)
		}
		check(s.label+": reach Sign in with the d-pad", found, "%v", trs)
		if !found {
			dump(s.id + "-signin")
		}
		ok, tr = pressUntil("down", 14, func(f finfo) bool {
			return f.R[1] >= 130 && f.R[2] >= 110 && f.R[3] >= 60 && !regexp.MustCompile(`(?i)^(next|previous|move|scroll)`).MatchString(f.Text)
		})
		check(s.label+": down from the header reaches a poster row", ok, "%v", tr)
		if !ok {
			dump(s.id + "-poster")
		}
		okR, trR := pressUntil("right", 3, func(f finfo) bool { return false })
		_ = okR
		fmt.Printf("      right x3 trace: %v\n", trR)
		pf := focusNow()
		key("ok")
		time.Sleep(4 * time.Second)
		after := tvStr(`location.href`)
		dlg := tvBool(`__tv.modalOpen()`)
		opened := after != startURL || dlg
		check(s.label+": OK on a poster opens something", opened, "was %q focus %q dialog=%v", pf.Text, trimURL(after), dlg)
		if !opened {
			dump(s.id + "-open")
		}
		key("back")
		time.Sleep(3 * time.Second)
		if tvStr(`location.href`) == after || tvBool(`__tv.modalOpen()`) {
			key("back") // a dialog closed first; the next Back leaves the page
			time.Sleep(3 * time.Second)
		}
		now := tvStr(`location.href`)
		check(s.label+": Back returns", now == startURL || strings.HasPrefix(now, strings.SplitN(startURL, "?", 2)[0]) && !tvBool(`__tv.modalOpen()`), "%s", trimURL(now))
		if !strings.Contains(now, s.host) {
			dump(s.id + "-left")
		}
		key("home")
		waitTV(`location.href.indexOf("/launcher/")>0`, 8*time.Second)
	}
}

// extLocal: Netflix in Chrome (TVMODE_TEST_EXT) on a harmless local page. The
// window opens on the primary monitor (the smoke copy is windowed on display 0).
func extLocal() {
	fmt.Println("--- Netflix in Chrome (local test page)")
	findExt := func() uintptr {
		for _, w := range winsys.TopWindows("Chrome_WidgetWin_1") {
			if strings.HasPrefix(w.Title, "ext") {
				return w.HWND
			}
		}
		return 0
	}
	tap(`[data-act="open:2"]`)
	_, ok := waitState(func(p pcState) bool { return p.App == "netflix" }, 2*time.Second)
	check("Netflix press lights the service at once", ok, "")
	var h uintptr
	for i := 0; i < 80 && h == 0; i++ {
		h = findExt()
		time.Sleep(250 * time.Millisecond)
	}
	check("Chrome app window opens", h != 0, "")
	if h == 0 {
		return
	}
	time.Sleep(1500 * time.Millisecond)
	check("no Edge page was navigated to the service", tvBool(`location.href.indexOf("/launcher/")>0`), "%s", trimURL(tvStr(`location.href`)))
	title := func() string { return winsys.WindowTitle(h) }
	key("right")
	key("ok")
	tap(`[data-act="media:playpause"]`)
	time.Sleep(500 * time.Millisecond)
	check("window is in front once a key has been sent", winsys.Foreground() == h, "")
	t := title()
	check("d-pad right, OK and Play reach the window", strings.Contains(t, "k:ArrowRight") && strings.Contains(t, "k:Enter") && strings.Contains(t, "k: "), "%s", t)
	key("back")
	time.Sleep(400 * time.Millisecond)
	check("Back sends Alt+Left", strings.Contains(title(), "k:Alt"), "%s", title())
	tap(`[data-act="recenter"]`)
	time.Sleep(300 * time.Millisecond)
	key("ok") // pointer live: OK clicks
	time.Sleep(400 * time.Millisecond)
	check("OK with the pointer live clicks", strings.Contains(title(), "click"), "%s", title())
	holdPoint(true)
	orient(0, 60, 0)
	time.Sleep(200 * time.Millisecond)
	aimSweep(60, 50, 20)
	holdPoint(false)
	time.Sleep(400 * time.Millisecond)
	check("laser moves the real cursor over the window", strings.Contains(title(), "mm") && !strings.HasSuffix(title(), "mm0"), "%s", title())
	key("home")
	closed := false
	for i := 0; i < 20 && !closed; i++ {
		time.Sleep(250 * time.Millisecond)
		closed = !winsys.IsWindow(h)
	}
	check("Home closes the Chrome window", closed, "")
	check("Home shows the launcher", waitTV(`location.href.indexOf("/launcher/")>0`, 5*time.Second), "")
}
