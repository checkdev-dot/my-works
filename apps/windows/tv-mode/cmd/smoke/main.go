// Command smoke drives a throwaway TV Mode (its own APPDATA, its own Edge
// profile, dry-run, windowed) with a headless Edge acting as the phone, and
// checks what every remote button does on the TV page.
//
//	go run ./cmd/smoke            local pages stand in for the services
//	go run ./cmd/smoke -real      opens the four real sites (needs network; no sign-in)
//
// It never prints the pairing token, never arms a shutdown, and restores the
// Windows volume it moves.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/chromedp/cdproto/browser"
	"github.com/chromedp/cdproto/deviceorientation"
	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/cdproto/target"
	"github.com/chromedp/chromedp"
	"github.com/coder/websocket"
)

const edgePath = `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`

// spare ports so the smoke runs beside a live TV Mode (8770 / 9333).
var (
	appPort = envOr("SMOKE_PORT", "18770")
	cdpPort = envOr("SMOKE_CDP", "19333")
)

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

type result struct {
	name   string
	ok     bool
	detail string
}

var (
	phoneErrs   []string
	phoneErrsMu sync.Mutex
	results     []result
	shots       = flag.String("shots", "", "folder for phone screenshots")
)

func check(name string, ok bool, format string, a ...any) {
	d := fmt.Sprintf(format, a...)
	results = append(results, result{name, ok, d})
	mark := "PASS"
	if !ok {
		mark = "FAIL"
	}
	fmt.Printf("%s  %-46s %s\n", mark, name, d)
}

// ---- PC state, read from the launcher socket (no token needed) ----

type pcState struct {
	App   string `json:"app"`
	Vol   int    `json:"vol"`
	Muted bool   `json:"muted"`
	Phone bool   `json:"phone"`
	Point bool   `json:"point"`
}

var (
	stMu sync.Mutex
	st   pcState
	wsc  *websocket.Conn
)

func watchState(ctx context.Context) error {
	c, _, err := websocket.Dial(ctx, "ws://127.0.0.1:"+appPort+"/ws/screen", nil)
	if err != nil {
		return err
	}
	wsc = c
	go func() {
		for {
			_, b, err := c.Read(ctx)
			if err != nil {
				return
			}
			var m struct {
				T string `json:"t"`
			}
			if json.Unmarshal(b, &m) == nil && m.T == "state" {
				var s pcState
				_ = json.Unmarshal(b, &s)
				stMu.Lock()
				st = s
				stMu.Unlock()
			}
		}
	}()
	return nil
}

func state() pcState { stMu.Lock(); defer stMu.Unlock(); return st }

func waitState(fn func(pcState) bool, d time.Duration) (time.Duration, bool) {
	t0 := time.Now()
	for time.Since(t0) < d {
		if fn(state()) {
			return time.Since(t0), true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return time.Since(t0), false
}

func screenSend(v any) {
	b, _ := json.Marshal(v)
	_ = wsc.Write(context.Background(), websocket.MessageText, b)
}

// ---- contexts ----

var (
	phone, tv context.Context
	pairURL   string
	tvID      target.ID
)

func ev(ctx context.Context, expr string, out any) error {
	return chromedp.Run(ctx, chromedp.Evaluate(expr, out, func(p *runtime.EvaluateParams) *runtime.EvaluateParams {
		return p.WithAwaitPromise(true)
	}))
}
func evGesture(ctx context.Context, expr string, out any) error {
	return chromedp.Run(ctx, chromedp.Evaluate(expr, out, func(p *runtime.EvaluateParams) *runtime.EvaluateParams {
		return p.WithUserGesture(true).WithAwaitPromise(true)
	}))
}

func tvStr(expr string) string {
	var s string
	if err := ev(tv, expr, &s); err != nil {
		return "ERR " + err.Error()
	}
	return s
}
func tvBool(expr string) bool {
	var b bool
	_ = ev(tv, "!!("+expr+")", &b)
	return b
}
func tvNum(expr string) float64 {
	var n float64
	_ = ev(tv, expr, &n)
	return n
}

// tap presses a phone button (pointer down, then up 60 ms later). A service
// button needs a second tap ("Open X?") while media is playing: tap confirms it.
func tap(sel string) {
	tapRaw(sel)
	if strings.Contains(sel, "open:") || strings.Contains(sel, "data-app") {
		var armed bool
		_ = ev(phone, `(function(){var a=document.getElementById("svcArm");return !!a && !a.hidden})()`, &armed)
		if armed {
			tapRaw("#svcArm")
		}
	}
}

func tapRaw(sel string) {
	var okTap bool
	if err := ev(phone, fmt.Sprintf(`(function(){var b=[].filter.call(document.querySelectorAll(%q),function(e){var q=e.getBoundingClientRect();return q.width>0&&q.height>0})[0]||document.querySelector(%q);if(!b)return false;var dw=b.closest&&b.closest("#drawer"),shut=dw&&dw.hidden;if(shut)dw.hidden=false;var r=b.getBoundingClientRect();var o={pointerId:1,button:0,bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2};
b.dispatchEvent(new PointerEvent("pointerdown",o));setTimeout(function(){b.dispatchEvent(new PointerEvent("pointerup",o));if(shut)setTimeout(function(){dw.hidden=true},200);},60);return true})()`, sel, sel), &okTap); err != nil || !okTap {
		fmt.Printf("      tap %s failed: ok=%v err=%v\n", sel, okTap, err)
	}
	if os.Getenv("SMOKE_DEBUG") != "" {
		var dbg string
		_ = ev(phone, `JSON.stringify([window.__vibAll,window.tvlink.pending(),window.tvlink.path(),document.getElementById("banner").textContent])`, &dbg)
		fmt.Println("      debug after tap", sel, dbg)
	}
	time.Sleep(160 * time.Millisecond)
}
func key(k string) { tap(fmt.Sprintf(`[data-act="key:%s"]`, k)) }

func orient(a, b, g float64) {
	_ = chromedp.Run(phone, deviceorientation.SetDeviceOrientationOverride(a, b, g))
}

func holdPoint(on bool) {
	typ := "pointerup"
	if on {
		typ = "pointerdown"
	}
	_ = ev(phone, fmt.Sprintf(`document.getElementById("point").dispatchEvent(new PointerEvent(%q,{pointerId:7,button:0,bubbles:true,cancelable:true}))`, typ), nil)
	time.Sleep(80 * time.Millisecond)
}

// aimDown tilts the phone so the pointer travels down (or up) the screen.
func aimSweep(from, to float64, steps int) {
	for i := 0; i <= steps; i++ {
		orient(0, from+(to-from)*float64(i)/float64(steps), 0)
		time.Sleep(30 * time.Millisecond)
	}
}

func navTV(url string) {
	_ = ev(tv, fmt.Sprintf(`location.href=%q`, url), nil)
	time.Sleep(900 * time.Millisecond)
}

func waitTV(cond string, d time.Duration) bool {
	t0 := time.Now()
	for time.Since(t0) < d {
		if tvBool(cond) {
			return true
		}
		time.Sleep(50 * time.Millisecond)
	}
	return false
}

func lastMouse() (float64, float64) {
	var p []float64
	_ = ev(tv, `(function(){var m=window.__mm||[];return m.length?m[m.length-1]:[-1,-1]})()`, &p)
	if len(p) < 2 {
		return -1, -1
	}
	return p[0], p[1]
}

func main() {
	real := flag.Bool("real", false, "open the real services (network needed, no sign-in)")
	navMode := flag.Bool("nav", false, "with -real: run the navigation scripts (Sign in, poster row, open a title, Back) on the real sites instead of the open/close checks")
	stopOld := flag.Bool("stop-old", false, "close a running (old) TV Mode Edge gracefully over CDP, wait for it to exit, then return")
	flag.Parse()
	if *stopOld {
		closeOldEdge()
		return
	}
	root, _ := os.Getwd()
	tmp, _ := os.MkdirTemp("", "tvmode-smoke-")
	fmt.Println("smoke root:", tmp)
	exe := filepath.Join(tmp, "tvmode.exe")
	if out, err := exec.Command("go", "build", "-o", exe, "./cmd/tvmode").CombinedOutput(); err != nil {
		fmt.Println("build failed:", string(out))
		os.Exit(2)
	}
	if !*real {
		startPages()
	}
	env := append(os.Environ(), "APPDATA="+filepath.Join(tmp, "Roaming"), "LOCALAPPDATA="+filepath.Join(tmp, "Local"), "TVMODE_PORT="+appPort, "TVMODE_CDP="+cdpPort)
	if !*real {
		env = append(env,
			"TVMODE_TEST_URL_JIOHOTSTAR=http://127.0.0.1:8780/browse?tvmode-app=jiohotstar",
			"TVMODE_TEST_URL_PRIME=http://127.0.0.1:8780/browse?tvmode-app=prime",
			"TVMODE_TEST_URL_NETFLIX=http://127.0.0.1:8780/slow?tvmode-app=netflix",
			"TVMODE_TEST_URL_YOUTUBE=http://127.0.0.1:8780/browse?tvmode-app=youtube")
	}
	if os.Getenv("SMOKE_ONLY") == "ext" {
		env = append(env, "TVMODE_TEST_EXT=1", "TVMODE_TEST_URL_NETFLIX=http://127.0.0.1:8780/extpage?tvmode-app=netflix")
	}
	if os.Getenv("SMOKE_ONLY") == "launcher" {
		env = append(env, "TVMODE_TEST_ROWS=1")
		hd := filepath.Join(tmp, "Roaming", "TVMode")
		_ = os.MkdirAll(hd, 0o700)
		_ = os.WriteFile(filepath.Join(hd, "history.json"), []byte(`[{"service":"prime","url":"http://127.0.0.1:8780/browse?tvmode-app=prime","title":"Canned Continue","pos":300,"dur":900,"img":"http://127.0.0.1:8780/poster/cont1.svg","at":1}]`), 0o600)
	}
	args := []string{"-web", filepath.Join(root, "web"), "-windowed", "-dry-run=true"}
	if !*real {
		args = append(args, "-test")
	}
	pc := exec.Command(exe, args...)
	pc.Env = env
	logf, _ := os.Create(filepath.Join(tmp, "stdout.log"))
	pc.Stdout, pc.Stderr = logf, logf
	if err := pc.Start(); err != nil {
		fmt.Println("start:", err)
		os.Exit(2)
	}
	exited := make(chan struct{})
	go func() { _ = pc.Wait(); close(exited) }()

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	defer cancel()

	// pairing URL (kept in memory, never printed)

	for i := 0; i < 120 && pairURL == ""; i++ {
		if r, err := http.Get("http://127.0.0.1:" + appPort + "/api/pair"); err == nil {
			var p struct{ URL string }
			b, _ := io.ReadAll(r.Body)
			r.Body.Close()
			_ = json.Unmarshal(b, &p)
			pairURL = p.URL
		}
		time.Sleep(250 * time.Millisecond)
	}
	if pairURL == "" {
		fmt.Println("PC did not come up")
		os.Exit(2)
	}
	if i := strings.Index(pairURL, "/remote/"); i > 0 {
		pairURL = "http://127.0.0.1:" + appPort + pairURL[i:]
	}
	if err := watchState(ctx); err != nil {
		fmt.Println("state socket:", err)
		os.Exit(2)
	}

	// TV page over CDP
	var list []struct{ ID, Type, URL string }
	for i := 0; i < 100 && tvID == ""; i++ {
		if r, err := http.Get("http://127.0.0.1:" + cdpPort + "/json/list"); err == nil {
			b, _ := io.ReadAll(r.Body)
			r.Body.Close()
			_ = json.Unmarshal(b, &list)
			for _, e := range list {
				if e.Type == "page" && strings.Contains(e.URL, "127.0.0.1:"+appPort) {
					tvID = target.ID(e.ID)
				}
			}
		}
		time.Sleep(300 * time.Millisecond)
	}
	if tvID == "" {
		fmt.Println("TV page not found")
		os.Exit(2)
	}
	alloc, acancel := chromedp.NewRemoteAllocator(ctx, "http://127.0.0.1:"+cdpPort)
	defer acancel()
	tv, _ = chromedp.NewContext(alloc, chromedp.WithTargetID(tvID))
	if err := chromedp.Run(tv); err != nil {
		fmt.Println("attach tv:", err)
		os.Exit(2)
	}

	// phone: headless Edge, 412x915
	pAlloc, pcancel := chromedp.NewExecAllocator(ctx, append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath(edgePath), chromedp.UserDataDir(filepath.Join(tmp, "phone")), chromedp.Flag("headless", "new"))...)
	defer pcancel()
	phone, _ = chromedp.NewContext(pAlloc)
	chromedp.ListenTarget(phone, func(e any) {
		if x, ok := e.(*runtime.EventExceptionThrown); ok {
			phoneErrsMu.Lock()
			phoneErrs = append(phoneErrs, x.ExceptionDetails.Error())
			phoneErrsMu.Unlock()
		}
	})
	_ = chromedp.Run(phone,
		emulation.SetDeviceMetricsOverride(412, 915, 2.625, true),
		chromedp.ActionFunc(func(c context.Context) error {
			_, err := page.AddScriptToEvaluateOnNewDocument(`window.__vib8=0;window.__vibAll=0;navigator.vibrate=function(p){window.__vibAll++;if(p===8)window.__vib8++;return true}`).Do(c)
			return err
		}),
		chromedp.Navigate(pairURL))
	linkOK := false
	for i := 0; i < 80 && !linkOK; i++ {
		var l string
		_ = ev(phone, `window.tvlink?window.tvlink.link():""`, &l)
		linkOK = l == "ok"
		time.Sleep(250 * time.Millisecond)
	}
	check("phone pairs and reaches the PC", linkOK, "link ok=%v", linkOK)
	if !linkOK {
		finish(pc, exe, env, exited, tmp, true)
		return
	}
	_, got := waitState(func(s pcState) bool { return s.Phone }, 3*time.Second)
	check("PC sees the phone", got, "")
	origVol := state().Vol

	if *shots != "" {
		var buf []byte
		_ = chromedp.Run(phone, chromedp.CaptureScreenshot(&buf))
		_ = os.MkdirAll(*shots, 0o755)
		_ = os.WriteFile(filepath.Join(*shots, "remote-412x915.png"), buf, 0o644)
	}
	var overflow bool
	_ = ev(phone, `document.documentElement.scrollHeight>innerHeight+1||document.getElementById("app").scrollHeight>document.getElementById("app").clientHeight+1`, &overflow)
	check("layout fits 412x915 without scrolling", !overflow, "")

	_ = chromedp.Run(tv, page.BringToFront()) // a covered window throttles rendering and input
	switch {
	case os.Getenv("SMOKE_ONLY") == "launcher":
		launcherLocal()
	case os.Getenv("SMOKE_ONLY") == "ext":
		extLocal()
	case os.Getenv("SMOKE_ONLY") == "nav":
		navLocal()
		laserCheck()
	case *real && *navMode:
		navReal()
	case *real:
		realPhase()
	default:
		localPhase()
		navLocal()
		laserCheck()
	}

	phoneErrsMu.Lock()
	check("phone page threw no JS errors", len(phoneErrs) == 0, "%v", phoneErrs)
	phoneErrsMu.Unlock()

	// put the Windows volume back
	_ = ev(phone, fmt.Sprintf(`window.tvlink.send({t:"vol",set:%d})`, origVol), nil)
	time.Sleep(300 * time.Millisecond)
	finish(pc, exe, env, exited, tmp, false)
}

// ack timing: how long a press takes to be acknowledged.
func ackMs(sendJS string) float64 {
	var ms float64
	_ = ev(phone, `new Promise(function(res){var t0=performance.now();`+sendJS+`;(function w(){if(window.tvlink.pending()===0||performance.now()-t0>3000)res(performance.now()-t0);else setTimeout(w,5)})()})`, &ms)
	return ms
}

func localPhase() {
	svcs := []struct{ id, label string }{{"jiohotstar", "JioHotstar"}, {"prime", "Prime Video"}, {"netflix", "Netflix"}, {"youtube", "YouTube"}}

	// --- switcher: phone buttons, instant feedback, slow Netflix does not block
	for i, s := range svcs {
		t0 := time.Now()
		tap(fmt.Sprintf(`[data-act="open:%d"]`, i))
		d, ok := waitState(func(p pcState) bool { return p.App == s.id }, 2*time.Second)
		_ = t0
		var lit bool
		_ = ev(phone, fmt.Sprintf(`document.querySelector('.svc [data-app="%s"]').getAttribute("aria-pressed")==="true"`, s.id), &lit)
		check("switcher "+s.label+": state changes at once", ok && d < 600*time.Millisecond, "%dms", d.Milliseconds())
		check("switcher "+s.label+": button lit amber", lit, "")
		if s.id == "netflix" {
			// the page takes 6 s: remote must keep working meanwhile
			a1 := ackMs(`window.tvlink.send({t:"key",k:"up"})`)
			a2 := ackMs(`window.tvlink.send({t:"vol",a:"mute"})`)
			a3 := ackMs(`window.tvlink.send({t:"vol",a:"mute"})`)
			check("netflix loading: presses still acked", a1 < 400 && a2 < 400 && a3 < 400, "acks %.0f/%.0f/%.0f ms", a1, a2, a3)
			t1 := time.Now()
			okURL := waitTV(`location.href.indexOf("tvmode-app=netflix")>0`, 12*time.Second)
			check("netflix (6 s page): URL arrives, no failure shown", okURL, "%dms", time.Since(t1).Milliseconds())
		} else {
			okURL := waitTV(fmt.Sprintf(`location.href.indexOf("tvmode-app=%s")>0`, s.id), 6*time.Second)
			check("switcher "+s.label+": TV page opens", okURL, "")
		}
		var hasTV bool
		_ = ev(tv, `typeof window.__tv==="object"`, &hasTV)
		check("overlay injected on "+s.label, hasTV, "")
		if os.Getenv("SMOKE_QUICK") != "" {
			return
		}
	}
	// repeat open of the same service is ignored (no reload)
	tap(`[data-act="open:3"]`)
	waitTV(`location.href.indexOf("tvmode-app=youtube")>0 && document.readyState==="complete"`, 6*time.Second)
	_ = ev(tv, `window.__marker=1`, nil)
	tap(`[data-act="open:3"]`)
	time.Sleep(600 * time.Millisecond)
	check("repeat open does not reload the page", tvBool(`window.__marker===1`), "")

	// --- launcher tiles: Home, then open from the launcher page's own socket
	for i, s := range svcs {
		key("home")
		okHome := waitTV(`location.href.indexOf("/launcher/")>0`, 5*time.Second)
		screenSend(map[string]any{"t": "open", "i": i})
		okURL := waitTV(fmt.Sprintf(`location.href.indexOf("tvmode-app=%s")>0`, s.id), 12*time.Second)
		check("launcher tile "+s.label, okHome && okURL, "home=%v open=%v", okHome, okURL)
	}

	// --- OK, arrows and clicks on a browse page (Prime)
	tap(`[data-act="open:1"]`)
	waitTV(`location.href.indexOf("tvmode-app=prime")>0 && document.readyState==="complete"`, 6*time.Second)
	time.Sleep(500 * time.Millisecond)
	_ = ev(tv, `window.__clicks.length=0`, nil)
	check("browse page: nothing has focus", tvBool(`document.activeElement===document.body`), "")
	key("ok")
	check("OK on a browse page shows the ring (no blind click)", tvBool(`__tv.navActive()`) && tvNum(`__clicks.length`) == 0, "")
	key("ok")
	var clicks []string
	_ = ev(tv, `__clicks`, &clicks)
	check("OK again clicks the ringed element", len(clicks) == 1 && clicks[0] == "center", "%v", clicks)
	key("right") // starts the ring
	var p0, p1 struct{ X, Y float64 }
	_ = ev(tv, `__tv.navTarget()||{X:-1,Y:-1}`, &p0)
	var b0 struct{ X, Y float64 }
	_ = ev(tv, `(function(){var t=__tv.navTarget();return t?{X:t.x,Y:t.y}:{X:-1,Y:-1}})()`, &b0)
	var q0 struct{ X, Y float64 }
	_ = ev(tv, `(function(){var t=__tv.navTarget();return t?{X:t.x,Y:t.y}:{X:-1,Y:-1}})()`, &q0)
	key("right")
	_ = ev(tv, `(function(){var t=__tv.navTarget();return t?{X:t.x,Y:t.y}:{X:-1,Y:-1}})()`, &p1)
	check("d-pad right moves focus right (centre tile to the right one)", q0.X > 900 && p1.X >= q0.X, "x %.0f -> %.0f", q0.X, p1.X)
	key("down")
	var p2 struct{ X, Y float64 }
	_ = ev(tv, `(function(){var t=__tv.navTarget();return t?{X:t.x,Y:t.y}:{X:-1,Y:-1}})()`, &p2)
	check("d-pad down moves the ring down", p2.Y > p1.Y, "y %.0f -> %.0f", p1.Y, p2.Y)
	key("left")
	var p3 struct{ X, Y float64 }
	_ = ev(tv, `(function(){var t=__tv.navTarget();return t?{X:t.x,Y:t.y}:{X:-1,Y:-1}})()`, &p3)
	check("d-pad left moves the ring left", p3.X < p2.X, "x %.0f -> %.0f", p2.X, p3.X)
	_ = ev(tv, `window.__clicks.length=0;__tv.navClear()`, nil)

	// --- Play / OK on a player page (Prime watch page)
	navTV("http://127.0.0.1:8780/watch/1?tvmode-app=prime")
	waitTV(`document.getElementById("v")&&!document.getElementById("v").paused`, 5*time.Second)
	check("watch page video is playing", tvBool(`!document.getElementById("v").paused`), "")
	key("ok")
	time.Sleep(200 * time.Millisecond)
	paused1 := tvBool(`document.getElementById("v").paused`)
	key("ok")
	time.Sleep(200 * time.Millisecond)
	playing2 := tvBool(`!document.getElementById("v").paused`)
	check("OK on a player page pauses, then plays", paused1 && playing2, "paused=%v playing=%v", paused1, playing2)
	tap(`[data-act="media:playpause"]`)
	time.Sleep(250 * time.Millisecond)
	check("Play button pauses the video", tvBool(`document.getElementById("v").paused`), "")
	tap(`[data-act="media:playpause"]`)
	time.Sleep(250 * time.Millisecond)
	check("Play button resumes the video", tvBool(`!document.getElementById("v").paused`), "")
	tap(`[data-act="media:seek:-10"]`)
	time.Sleep(300 * time.Millisecond)
	check("seek buttons answer", true, "sent")

	// --- Back and Home from fullscreen video
	for _, how := range []string{"back", "home"} {
		navTV("http://127.0.0.1:8780/browse?tvmode-app=prime")
		navTV("http://127.0.0.1:8780/watch/1?tvmode-app=prime")
		var winBefore string
		_ = chromedp.Run(tv, chromedp.ActionFunc(func(c context.Context) error {
			_, b, err := browser.GetWindowForTarget().WithTargetID(tvID).Do(c)
			if err == nil {
				winBefore = string(b.WindowState)
			}
			return err
		}))
		_ = evGesture(tv, `document.getElementById("v").requestFullscreen()`, nil)
		fs := waitTV(`!!document.fullscreenElement`, 3*time.Second)
		tap(`[data-act="vol:up"]`)
		time.Sleep(200 * time.Millisecond)
		raised := tvBool(`document.querySelector("tv-mode-root")&&document.querySelector("tv-mode-root").matches(":popover-open")`)
		check("overlay on top of fullscreen video ("+how+" test)", fs && raised, "fullscreen=%v popover-open=%v", fs, raised)
		key(how)
		time.Sleep(1200 * time.Millisecond)
		noFS := tvBool(`!document.fullscreenElement`)
		url := tvStr(`location.href`)
		var winAfter string
		_ = chromedp.Run(tv, chromedp.ActionFunc(func(c context.Context) error {
			_, b, err := browser.GetWindowForTarget().WithTargetID(tvID).Do(c)
			if err == nil {
				winAfter = string(b.WindowState)
			}
			return err
		}))
		if how == "back" {
			check("Back: leaves fullscreen and goes back a page", noFS && strings.Contains(url, "/browse"), "fullscreen off=%v url=%s", noFS, trimURL(url))
		} else {
			check("Home: leaves fullscreen and shows the launcher", noFS && strings.Contains(url, "/launcher/"), "fullscreen off=%v url=%s", noFS, trimURL(url))
		}
		check("window state unchanged after "+how, winBefore == winAfter, "%s -> %s", winBefore, winAfter)
		tap(`[data-act="vol:down"]`)
		time.Sleep(250 * time.Millisecond)
		check("overlay still shows after "+how, tvBool(`document.querySelector("tv-mode-root")&&document.querySelector("tv-mode-root").matches(":popover-open")`), "")
		if how == "back" {
			key("home")
			waitTV(`location.href.indexOf("/launcher/")>0`, 4*time.Second)
			tap(`[data-act="open:1"]`)
			waitTV(`location.href.indexOf("tvmode-app=prime")>0`, 6*time.Second)
		}
	}
	// Back on the launcher does nothing (it must not quit TV mode)
	key("back")
	time.Sleep(300 * time.Millisecond)
	check("Back on the launcher does nothing", tvBool(`location.href.indexOf("/launcher/")>0`), "")

	// --- YouTube: native keys; d-pad then OK
	tap(`[data-act="open:3"]`)
	waitTV(`location.href.indexOf("tvmode-app=youtube")>0 && document.readyState==="complete"`, 8*time.Second)
	time.Sleep(500 * time.Millisecond)
	_ = ev(tv, `window.__keys.length=0;window.__clicks.length=0`, nil)
	key("right")
	key("ok")
	var keys []string
	_ = ev(tv, `__keys`, &keys)
	check("YouTube d-pad then OK: native ArrowRight then Enter", len(keys) >= 2 && keys[0] == "ArrowRight" && keys[len(keys)-1] == "Enter", "%v", keys)
	check("YouTube: no spatial ring, no stray click", !tvBool(`__tv.navActive()`) && tvNum(`__clicks.length`) == 0, "")

	// --- pointer scenarios on Prime's browse page
	tap(`[data-act="open:1"]`)
	waitTV(`location.href.indexOf("tvmode-app=prime")>0 && document.readyState==="complete"`, 8*time.Second)
	time.Sleep(500 * time.Millisecond)
	tap(`[data-act="recenter"]`)
	time.Sleep(300 * time.Millisecond)
	mx, my := lastMouse()
	var vw, vh float64
	_ = ev(tv, `innerWidth`, &vw)
	_ = ev(tv, `innerHeight`, &vh)
	check("Re-centre moves the pointer to the screen middle", abs(mx-vw/2) < 3 && abs(my-vh/2) < 3, "pointer %.0f,%.0f of %.0fx%.0f", mx, my, vw, vh)
	vib8 := evNum(phone, `window.__vib8`)
	check("hover tick reaches the phone (vib 8)", vib8 >= 1, "ticks=%.0f", vib8)

	scen := func(name string, fn func(), wantClick bool) {
		_ = ev(tv, `window.__clicks.length=0;__tv.navClear()`, nil)
		tap(`[data-act="recenter"]`)
		time.Sleep(200 * time.Millisecond)
		fn()
		time.Sleep(250 * time.Millisecond)
		var c []string
		_ = ev(tv, `__clicks`, &c)
		got := len(c) > 0
		check(name, got == wantClick, "clicks=%v", c)
	}
	scen("point, then OK: clicks at the pointer", func() {
		holdPoint(true)
		orient(0, 60, 0)
		time.Sleep(300 * time.Millisecond)
		holdPoint(false)
		key("ok")
	}, true)
	// pointer sits on "center"; d-pad right twice moves the ring to "right"; OK must click the ring, not the pointer
	{
		_ = ev(tv, `window.__clicks.length=0;__tv.navClear()`, nil)
		tap(`[data-act="recenter"]`)
		time.Sleep(200 * time.Millisecond)
		holdPoint(true)
		time.Sleep(200 * time.Millisecond)
		holdPoint(false)
		key("right")
		key("right")
		key("ok")
		time.Sleep(250 * time.Millisecond)
		var c []string
		_ = ev(tv, `__clicks`, &c)
		check("point, d-pad, then OK: clicks the d-pad target, not the old pointer spot", len(c) == 1 && c[0] == "right", "clicks=%v", c)
	}
	scen("d-pad, point, then OK: clicks at the pointer", func() {
		key("right")
		holdPoint(true)
		time.Sleep(200 * time.Millisecond)
		holdPoint(false)
		key("ok")
	}, true)
	scen("OK with Point held: clicks without letting go", func() {
		holdPoint(true)
		time.Sleep(150 * time.Millisecond)
		key("ok")
		holdPoint(false)
	}, true)
	scen("tap on empty screen while holding Point clicks", func() {
		holdPoint(true)
		time.Sleep(150 * time.Millisecond)
		_ = ev(phone, `(function(){var o={pointerId:3,button:0,bubbles:true,cancelable:true,clientX:200,clientY:600};var t=document.querySelector(".main");t.dispatchEvent(new PointerEvent("pointerdown",o));setTimeout(function(){t.dispatchEvent(new PointerEvent("pointerup",o))},60)})()`, nil)
		time.Sleep(200 * time.Millisecond)
		holdPoint(false)
	}, true)

	// --- aim moves the pointer, edge scroll, scroll buttons, flick, double tap
	_ = ev(tv, `window.scrollTo(0,0);window.__mm.length=0`, nil)
	tap(`[data-act="recenter"]`)
	orient(0, 60, 0)
	time.Sleep(200 * time.Millisecond)
	holdPoint(true)
	aimSweep(60, 20, 30)
	time.Sleep(1500 * time.Millisecond)
	_, y1 := lastMouse()
	check("aiming down moves the pointer to the bottom band", y1 > vh*0.9, "y=%.0f of %.0f", y1, vh)
	sy := tvNum(`scrollY`)
	check("edge scroll stays off (Dev asked)", sy < 5, "scrollY=%.0f", sy)
	holdPoint(false)
	_ = ev(tv, `window.scrollTo(0,0)`, nil)
	tap(`[data-act="scroll:260"]`)
	time.Sleep(300 * time.Millisecond)
	check("scroll-down button scrolls the page", tvNum(`scrollY`) > 100, "scrollY=%.0f", tvNum(`scrollY`))
	_ = ev(tv, `window.scrollTo(0,0)`, nil)
	tap(`[data-act="recenter"]`)
	holdPoint(true)
	_ = ev(phone, `(function(){var b=document.getElementById("point");var y=500;function mv(){y-=22;b.dispatchEvent(new PointerEvent("pointermove",{pointerId:7,clientY:y,clientX:200,bubbles:true}))}mv();var i=0;var h=setInterval(function(){mv();if(++i>=5)clearInterval(h)},16)})()`, nil)
	time.Sleep(160 * time.Millisecond)
	holdPoint(false)
	s1 := tvNum(`scrollY`)
	time.Sleep(1200 * time.Millisecond)
	s2 := tvNum(`scrollY`)
	check("swipe-scroll on Point stays off (Dev asked)", s1 < 5 && s2 < 5, "scrollY %.0f -> %.0f", s1, s2)
	_ = ev(tv, `window.scrollTo(0,0)`, nil)
	orient(0, 60, 0)
	holdPoint(true)
	aimSweep(60, 45, 10)
	holdPoint(false)
	time.Sleep(100 * time.Millisecond)
	holdPoint(true)
	holdPoint(false)
	time.Sleep(60 * time.Millisecond)
	holdPoint(true)
	holdPoint(false)
	time.Sleep(300 * time.Millisecond)
	mx, my = lastMouse()
	check("double-tap Point re-centres", abs(mx-vw/2) < 3 && abs(my-vh/2) < 3, "pointer %.0f,%.0f", mx, my)

	// --- volume and the lamp rail
	_ = ev(phone, `window.tvlink.send({t:"vol",set:50})`, nil)
	time.Sleep(500 * time.Millisecond)
	_ = ev(phone, `new Promise(function(r){var n=0;var h=setInterval(function(){window.tvlink.send({t:"vol",a:"up"});if(++n>=30){clearInterval(h);r(1)}},110)})`, nil)
	time.Sleep(450 * time.Millisecond)
	var lamps struct{ Lit, N, Target int }
	_ = ev(tv, `__tv.lamps()`, &lamps)
	check("hold volume up 50 to 100: PC volume is 100", state().Vol == 100, "vol=%d", state().Vol)
	check("hold volume up 50 to 100: all 40 lamps lit", lamps.Lit == 40 && lamps.Target == 40, "lit=%d target=%d", lamps.Lit, lamps.Target)
	tap(`[data-act="vol:down"]`)
	time.Sleep(200 * time.Millisecond)
	check("volume down lowers it", state().Vol < 100, "vol=%d", state().Vol)
	m0 := state().Muted
	tap(`[data-act="vol:mute"]`)
	time.Sleep(200 * time.Millisecond)
	m1 := state().Muted
	tap(`[data-act="vol:mute"]`)
	time.Sleep(200 * time.Millisecond)
	check("mute toggles", m1 != m0 && state().Muted == m0, "")

	// --- acks and latency (data channel)
	latency("data channel")

	// --- the data channel dies silently (as on Dev's network): the press must still arrive, once
	tap(`[data-act="open:3"]`)
	waitTV(`location.href.indexOf("tvmode-app=youtube")>0 && document.readyState==="complete"`, 8*time.Second)
	time.Sleep(500 * time.Millisecond)
	waitPath("direct", 15*time.Second)
	_ = ev(tv, `window.__keys.length=0`, nil)
	_ = ev(phone, `window.tvlink.breakDc()`, nil)
	key("right")
	time.Sleep(1200 * time.Millisecond)
	var kk []string
	_ = ev(tv, `__keys`, &kk)
	var pth string
	_ = ev(phone, `window.tvlink.path()`, &pth)
	check("dead channel: press arrives exactly once via the relay", len(kk) == 1 && kk[0] == "ArrowRight" && evNum(phone, `window.tvlink.pending()`) == 0, "keys=%v path=%s", kk, pth)
	var bn string
	_ = ev(phone, `document.getElementById("banner").hidden?"":document.getElementById("banner").textContent`, &bn)
	check("dead channel: no 'didn't reach' note", !strings.Contains(bn, "reach"), "banner=%q", bn)

	// --- the PC acks over the channel but the phone never hears it: resend over the relay must not repeat the press
	waitPath("direct", 20*time.Second)
	_ = ev(phone, `window.tvlink.dropAcks=true;window.tvlink.send({t:"vol",set:50})`, nil)
	time.Sleep(700 * time.Millisecond)
	tap(`[data-act="vol:up"]`)
	time.Sleep(1500 * time.Millisecond)
	_ = ev(phone, `window.tvlink.dropAcks=false`, nil)
	check("lost ack: resend is deduped (volume exactly +2)", state().Vol == 52, "vol=%d", state().Vol)

	// --- relay only: no WebRTC at all
	_ = chromedp.Run(phone,
		chromedp.ActionFunc(func(c context.Context) error {
			_, err := page.AddScriptToEvaluateOnNewDocument(`window.RTCPeerConnection=undefined`).Do(c)
			return err
		}),
		chromedp.Navigate("about:blank"), chromedp.Navigate(pairURL))
	linkOK := false
	for i := 0; i < 80 && !linkOK; i++ {
		var l string
		_ = ev(phone, `window.tvlink?window.tvlink.link():""`, &l)
		linkOK = l == "ok"
		time.Sleep(250 * time.Millisecond)
	}
	time.Sleep(1500 * time.Millisecond)
	var rp string
	_ = ev(phone, `window.tvlink.path()`, &rp)
	check("relay only: phone reconnects", linkOK && rp == "relay", "path=%s", rp)
	tap(`[data-app="prime"]`)
	d, okRel := waitState(func(p pcState) bool { return p.App == "prime" }, 2*time.Second)
	check("relay only: switcher works", okRel, "%dms", d.Milliseconds())
	tap(`[data-act="open:3"]`)
	waitTV(`location.href.indexOf("tvmode-app=youtube")>0 && document.readyState==="complete"`, 8*time.Second)
	time.Sleep(500 * time.Millisecond)
	_ = ev(tv, `window.__keys.length=0`, nil)
	key("right")
	key("ok")
	_ = ev(tv, `__keys`, &kk)
	check("relay only: d-pad and OK arrive", len(kk) == 2 && kk[0] == "ArrowRight" && kk[1] == "Enter", "keys=%v", kk)
	_ = ev(phone, `window.tvlink.send({t:"vol",set:50})`, nil)
	time.Sleep(400 * time.Millisecond)
	tap(`[data-act="vol:up"]`)
	time.Sleep(400 * time.Millisecond)
	check("relay only: volume up", state().Vol == 52, "vol=%d", state().Vol)
	navTV("http://127.0.0.1:8780/browse?tvmode-app=youtube")
	navTV("http://127.0.0.1:8780/watch/1?tvmode-app=prime")
	_ = evGesture(tv, `document.getElementById("v").requestFullscreen()`, nil)
	waitTV(`!!document.fullscreenElement`, 3*time.Second)
	key("back")
	time.Sleep(1200 * time.Millisecond)
	check("relay only: Back leaves fullscreen and goes back", tvBool(`!document.fullscreenElement`) && strings.Contains(tvStr(`location.href`), "/browse"), "")
	key("home")
	check("relay only: Home", waitTV(`location.href.indexOf("/launcher/")>0`, 4*time.Second), "")
	latency("relay only")

	// --- evidence for the Netflix suspect: does an empty user-agent override drop client hints?
	navTV("http://127.0.0.1:8780/browse?tvmode-app=prime")
	before := tvNum(`navigator.userAgentData?navigator.userAgentData.brands.length:-1`)
	_ = chromedp.Run(tv, emulation.SetUserAgentOverride(""))
	_ = ev(tv, `location.reload()`, nil)
	time.Sleep(1200 * time.Millisecond)
	after := tvNum(`navigator.userAgentData?navigator.userAgentData.brands.length:-1`)
	hdr := tvStr(`fetch("/browse").then(function(r){return "ok"}).catch(function(){return "no"})`)
	fmt.Printf("      INFO client hints: brands before override=%.0f, after SetUserAgentOverride(\"\")=%.0f (fetch %s)\n", before, after, hdr)
	pend := evNum(phone, `window.tvlink.pending()`)
	check("every press was acked (none pending)", pend == 0, "pending=%.0f", pend)
	var note string
	_ = ev(phone, `document.getElementById("banner").hidden?"":document.getElementById("banner").textContent`, &note)
	check("no 'didn't reach the PC' note shown", !strings.Contains(note, "reach"), "banner=%q", note)
}

func latency(label string) {
	for i := 0; i < 25; i++ {
		_ = ev(phone, `window.tvlink.ping()`, nil)
		time.Sleep(120 * time.Millisecond)
	}
	var rt []float64
	_ = ev(phone, `window.tvlink.rtts()`, &rt)
	var path string
	_ = ev(phone, `window.tvlink.path()`, &path)
	sort.Float64s(rt)
	if len(rt) > 0 {
		check("latency measured ("+label+")", true, "path=%s n=%d p50=%.0f ms p95=%.0f ms", path, len(rt), rt[len(rt)/2], rt[int(float64(len(rt)-1)*0.95)])
	} else {
		check("latency measured ("+label+")", false, "no pongs")
	}
}

func waitPath(want string, d time.Duration) {
	t0 := time.Now()
	for time.Since(t0) < d {
		var p string
		_ = ev(phone, `window.tvlink.path()`, &p)
		if p == want {
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
}

func realPhase() {
	svcs := []struct{ id, host, label string }{{"youtube", "youtube.com", "YouTube"}, {"netflix", "netflix.com", "Netflix"}, {"prime", "primevideo.com", "Prime Video"}, {"jiohotstar", "hotstar.com", "JioHotstar"}}
	idx := map[string]int{"jiohotstar": 0, "prime": 1, "netflix": 2, "youtube": 3}
	for _, s := range svcs {
		tap(fmt.Sprintf(`[data-act="open:%d"]`, idx[s.id]))
		t0 := time.Now()
		d, ok := waitState(func(p pcState) bool { return p.App == s.id }, 2*time.Second)
		check("real "+s.label+": state changes at once", ok && d < 600*time.Millisecond, "%dms", d.Milliseconds())
		a1 := ackMs(`window.tvlink.send({t:"key",k:"up"})`)
		check("real "+s.label+": presses acked while loading", a1 < 400, "%.0f ms", a1)
		okURL := waitTV(fmt.Sprintf(`location.hostname.indexOf("%s")>=0`, s.host), 30*time.Second)
		check("real "+s.label+": page opens", okURL, "%dms to URL change", time.Since(t0).Milliseconds())
		time.Sleep(2 * time.Second)
		var hasTV bool
		_ = ev(tv, `typeof window.__tv==="object"`, &hasTV)
		check("real "+s.label+": overlay injected", hasTV, "")
		ua := tvStr(`navigator.userAgent+" | brands="+(navigator.userAgentData?navigator.userAgentData.brands.map(function(b){return b.brand}).join(","):"none")`)
		fmt.Printf("      %s UA: %s\n", s.label, ua)
		if s.id == "netflix" {
			check("netflix: user agent is not the TV one (after YouTube)", !strings.Contains(ua, "Cobalt"), "")
		}
		key("home")
		waitTV(`location.href.indexOf("/launcher/")>0`, 6*time.Second)
	}
	for i, s := range []string{"JioHotstar", "Prime Video", "Netflix", "YouTube"} {
		screenSend(map[string]any{"t": "open", "i": i})
		hosts := []string{"hotstar.com", "primevideo.com", "netflix.com", "youtube.com"}
		okURL := waitTV(fmt.Sprintf(`location.hostname.indexOf("%s")>=0`, hosts[i]), 30*time.Second)
		check("real launcher tile "+s, okURL, "")
		key("home")
		waitTV(`location.href.indexOf("/launcher/")>0`, 6*time.Second)
	}
}

// closeOldEdge closes the running TV Mode Edge with Browser.close and waits for
// the debug port to go away, so its cookies are flushed. (A copy of TV Mode
// older than -quit has no quit call; the caller then stops tvmode.exe at once,
// before its watchdog relaunches Edge.)
func closeOldEdge() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	alloc, ac := chromedp.NewRemoteAllocator(ctx, "http://127.0.0.1:9333")
	defer ac()
	c, cc := chromedp.NewContext(alloc)
	defer cc()
	if err := chromedp.Run(c, chromedp.ActionFunc(func(c context.Context) error { return browser.Close().Do(c) })); err != nil {
		fmt.Println("browser.close:", err)
	}
	for i := 0; i < 100; i++ {
		if _, err := http.Get("http://127.0.0.1:9333/json/version"); err != nil {
			fmt.Println("edge closed")
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	fmt.Println("edge still up after 10 s")
}

func evNum(ctx context.Context, expr string) float64 {
	var n float64
	_ = ev(ctx, expr, &n)
	return n
}
func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
func trimURL(u string) string {
	if i := strings.Index(u, "?"); i > 0 {
		u = u[:i]
	}
	return u
}

// finish asks TV Mode to quit the way Dev's copy is stopped (-quit: Edge
// closes itself and flushes), then reports.
func finish(pc *exec.Cmd, exe string, env []string, exited chan struct{}, tmp string, failedEarly bool) {
	q := exec.Command(exe, "-quit")
	q.Env = env
	out, _ := q.CombinedOutput()
	select {
	case <-exited:
		check("graceful quit (-quit)", true, "%s", strings.TrimSpace(string(out)))
	case <-time.After(30 * time.Second):
		check("graceful quit (-quit)", false, "did not exit; killing the throwaway copy")
		_ = pc.Process.Kill()
	}
	logb, _ := os.ReadFile(filepath.Join(tmp, "Roaming", "TVMode", "tvmode.log"))
	l := string(logb)
	check("log: relay joined", strings.Contains(l, "relay: joined room"), "")
	check("log: Edge was not force-killed", !strings.Contains(l, "killing it"), "")
	for _, ln := range strings.Split(l, "\n") {
		if strings.Contains(ln, "latency ") || strings.Contains(ln, "point:") || strings.Contains(ln, "webrtc") && strings.Contains(ln, "pair") {
			fmt.Println("      log:", strings.TrimSpace(ln[min(len(ln), 20):]))
		}
	}
	pass, fail := 0, 0
	for _, r := range results {
		if r.ok {
			pass++
		} else {
			fail++
		}
	}
	fmt.Printf("\n%d passed, %d failed\n", pass, fail)
	if fail > 0 {
		os.Exit(1)
	}
}
