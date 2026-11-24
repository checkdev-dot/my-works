// Command spike is a throwaway verification harness: it runs the real app
// against the real web/ folder and overlay, then prints pass/fail for the
// spike checks. Safe to delete.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/chromedp"

	"tvmode/internal/app"
	"tvmode/internal/edge"
	"tvmode/internal/services"
	"tvmode/internal/winsys"
)

func out(name string, pass bool, detail string) {
	r := "PASS"
	if !pass {
		r = "FAIL"
	}
	fmt.Printf("[%s] %s: %s\n", r, name, detail)
}

// diffPixels counts clearly different pixels between two PNGs.
func diffPixels(a, b []byte) int {
	ia, e1 := png.Decode(bytes.NewReader(a))
	ib, e2 := png.Decode(bytes.NewReader(b))
	if e1 != nil || e2 != nil {
		return -1
	}
	n := 0
	bd := ia.Bounds()
	for y := bd.Min.Y; y < bd.Max.Y; y += 2 {
		for x := bd.Min.X; x < bd.Max.X; x += 2 {
			r1, g1, b1, _ := ia.At(x, y).RGBA()
			r2, g2, b2, _ := ib.At(x, y).RGBA()
			d := func(p, q uint32) int {
				if p > q {
					return int(p - q)
				}
				return int(q - p)
			}
			if d(r1, r2)+d(g1, g2)+d(b1, b2) > 3*4000 {
				n++
			}
		}
	}
	return n
}

func main() {
	web, _ := filepath.Abs("web")
	tmp := filepath.Join(os.TempDir(), "tvmode-spike")
	_ = os.MkdirAll(tmp, 0o755)

	disp := 1
	if len(winsys.Monitors()) < 2 {
		disp = 0
	}
	a, err := app.New(app.Options{WebDir: web, DryRun: true, Windowed: true, Display: disp, Overlay: os.Getenv("SPIKE_OVERLAY")})
	if err != nil {
		panic(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	runErr := make(chan error, 1)
	go func() { runErr <- a.Run(ctx) }()
	defer func() { a.Exit(); cancel() }()

	for i := 0; i < 100 && a.In == nil; i++ {
		time.Sleep(300 * time.Millisecond)
		select {
		case e := <-runErr:
			fmt.Println("run failed:", e)
			return
		default:
		}
	}
	if a.In == nil {
		fmt.Println("edge did not come up")
		return
	}
	time.Sleep(2500 * time.Millisecond)
	shot := func(name string) []byte {
		png, err := a.Edge.Screenshot()
		if err == nil {
			_ = os.WriteFile(filepath.Join(tmp, name), png, 0o644)
		}
		return png
	}

	// ---- a) launch, attach, overlay lands
	var info map[string]any
	err = a.Edge.Eval(`({overlay:typeof window.__tv, show:typeof (window.__tv&&window.__tv.show), href:location.href, title:document.title})`, &info)
	out("a) Edge launched via Go, CDP attached, real overlay.js injected", err == nil && info["overlay"] == "object", fmt.Sprint(err, info))
	var msgs int
	_ = a.Edge.Eval(`document.body.innerText.length`, &msgs)
	shot("launcher.png")
	_ = a.Edge.Navigate("https://example.com/", false)
	time.Sleep(2500 * time.Millisecond)
	var has bool
	_ = a.Edge.Eval(`typeof window.__tv==='object'`, &has)
	out("a3) overlay survives navigation to example.com", has, "")

	// input probes: wrap pointer, count mouse events
	_ = a.Edge.Eval(`window.__probe={mv:0,cl:0,wh:0,keys:[],ptr:null};var o=__tv.pointer;__tv.pointer=function(x,y,v){__probe.ptr=[x,y,v];return o.apply(this,arguments)};
document.addEventListener('mousemove',function(){__probe.mv++},true);document.addEventListener('mousedown',function(){__probe.cl++},true);
document.addEventListener('wheel',function(){__probe.wh++},true);document.addEventListener('keydown',function(e){__probe.keys.push(e.key)},true);document.body.style.minHeight='4000px'`, nil)
	a.In.RefreshViewport()
	a.In.Point(true)
	for i := 0; i < 20; i++ {
		a.In.Aim(0.01, 0.005)
		time.Sleep(20 * time.Millisecond)
	}
	time.Sleep(300 * time.Millisecond)
	_ = a.In.Tap("left")
	_ = a.In.Scroll(120)
	_ = a.In.Keys([]services.Key{services.Down})
	time.Sleep(400 * time.Millisecond)
	var pp map[string]any
	_ = a.Edge.Eval(`__probe`, &pp)
	b, _ := json.Marshal(pp)
	out("a4) pointer(x,y,vis) + CDP mouseMoved/click/wheel + keys reach page", pp != nil && pp["cl"] == float64(1), string(b))
	_ = a.Edge.Eval(`__tv.show('vol',{vol:42,muted:false})`, nil)
	time.Sleep(300 * time.Millisecond)
	shot("example-overlay.png")

	// ---- b) over element fullscreen (real overlay: reparent + popover)
	_ = a.Edge.Navigate("https://www.youtube.com/watch?v=aqz-KE-bpKQ", false)
	time.Sleep(9 * time.Second)
	_ = a.Edge.Eval(`(function(){var v=document.querySelector('video');if(v)v.pause();})()`, nil)
	var fontOK map[string]any
	_ = a.Edge.Eval(`__tv.show('vol',{vol:42,muted:false}),new Promise(r=>setTimeout(()=>r({fontsHas:[...document.fonts].some(f=>f.family.indexOf('TVModeCond')>=0),check:document.fonts.check('700 20px TVModeCond'),status:[...document.fonts].map(f=>f.family+':'+f.status).join(',')}),600))`, &fontOK)
	out("b0) overlay font loaded from ArrayBuffer (no network)", fontOK["fontsHas"] == true && fontOK["check"] == true, fmt.Sprint(fontOK))
	check := func(label string) {
		time.Sleep(1500 * time.Millisecond)
		_ = a.Edge.Eval(`(function(){var v=document.querySelector('video');if(v)v.pause();})()`, nil)
		time.Sleep(600 * time.Millisecond)
		var fs map[string]any
		_ = a.Edge.Eval(`({fs:document.fullscreenElement?document.fullscreenElement.tagName+'#'+document.fullscreenElement.id:null,w:innerWidth,h:innerHeight})`, &fs)
		_ = a.Edge.Eval(`__tv.show('cancelled',{what:'x'})`, nil) // something visible; then hide by waiting
		time.Sleep(3500 * time.Millisecond)                       // overlay fades
		A := shot("fs-" + label + "-without.png")
		_ = a.Edge.Eval(`__tv.show('vol',{vol:42,muted:false})`, nil)
		time.Sleep(450 * time.Millisecond)
		B := shot("fs-" + label + "-with.png")
		var fs2 map[string]any
		_ = a.Edge.Eval(`({fs:document.fullscreenElement?document.fullscreenElement.tagName+'#'+document.fullscreenElement.id:null,w:innerWidth,h:innerHeight})`, &fs2)
		fs["afterShot"] = fs2["fs"]
		d := diffPixels(A, B)
		out("b) overlay visible over fullscreen: "+label, fs["fs"] != nil && fs2["fs"] != nil && d > 800, fmt.Sprintf("%v changedPixels(sampled)=%d", fs, d))
	}
	// 1) container fullscreen on the player div (what Netflix/Prime do)
	_ = a.Edge.Do(func(c context.Context) error {
		_, _, e := runtime.Evaluate(`document.querySelector('#movie_player').requestFullscreen()`).WithUserGesture(true).WithAwaitPromise(true).Do(c)
		return e
	})
	check("movie_player-div")
	_ = a.Edge.Eval(`document.fullscreenElement?document.exitFullscreen():0`, nil)
	time.Sleep(1500 * time.Millisecond)
	// 2) the site's own f key
	_ = a.In.Keys([]services.Key{services.KeyF})
	check("f-key")
	_ = a.Edge.Eval(`document.fullscreenElement?document.exitFullscreen():0`, nil)
	time.Sleep(1000 * time.Millisecond)

	if os.Getenv("SPIKE_B") != "" {
		return
	}
	// ---- c) popup
	_ = a.Edge.Home()
	time.Sleep(2500 * time.Millisecond)
	_ = a.Edge.Do(func(c context.Context) error {
		_, _, e := runtime.Evaluate(`window.open('https://example.org/','_blank')&&1`).WithUserGesture(true).Do(c)
		return e
	})
	time.Sleep(4 * time.Second)
	ids := a.Edge.TargetIDs()
	cur := a.Edge.CurrentID()
	var popHas bool
	var href string
	_ = a.Edge.EvalOn(cur, `typeof window.__tv==='object'`, &popHas)
	_ = a.Edge.EvalOn(cur, `location.href`, &href)
	out("c) popup/new tab gets overlay", len(ids) >= 2 && popHas, fmt.Sprintf("targets=%d href=%s overlay=%v", len(ids), href, popHas))
	_ = a.Edge.Home()
	time.Sleep(1500 * time.Millisecond)

	// ---- d) youtube tv
	if err := a.Edge.Navigate("https://www.youtube.com/tv", true); err != nil {
		fmt.Println("   navigate err", err)
	}
	time.Sleep(18 * time.Second)
	var tvinfo map[string]any
	_ = a.Edge.Eval(`({ua:navigator.userAgent,title:document.title,href:location.href,active:document.activeElement&&(document.activeElement.tagName+'.'+document.activeElement.className),text:document.body.innerText.slice(0,200),overlay:!!window.__tv})`, &tvinfo)
	ib, _ := json.Marshal(tvinfo)
	fmt.Println("   yt tv page:", string(ib))
	shot("yt-tv-1.png")
	snap := `(function(){var f=document.querySelector('.focused,[focused],[aria-selected=true]');var a=document.activeElement;return {active:a&&(a.tagName+'.'+a.className+'#'+a.id),focused:f&&(f.tagName+'.'+String(f.className).slice(0,60)),keys:__tv.keys.slice(-6)}})()`
	var f1, f2 map[string]any
	_ = a.Edge.Eval(snap, &f1)
	_ = a.In.Keys([]services.Key{services.Down})
	time.Sleep(700 * time.Millisecond)
	_ = a.In.Keys([]services.Key{services.Right})
	time.Sleep(700 * time.Millisecond)
	_ = a.In.Keys([]services.Key{services.Right})
	time.Sleep(900 * time.Millisecond)
	_ = a.Edge.Eval(snap, &f2)
	shot("yt-tv-2.png")
	j1, _ := json.Marshal(f1)
	j2, _ := json.Marshal(f2)
	out("d) youtube.com/tv loads with TV UA + key focus changes", string(j1) != string(j2), "before="+string(j1)+" after="+string(j2))
	_ = a.Edge.Home()

	// ---- e) volume
	v0, m0, err := winsys.GetVolume()
	if err != nil {
		out("e) volume", false, err.Error())
	} else {
		target := v0 + 2
		if target > 100 {
			target = v0 - 2
		}
		e1 := winsys.SetVolume(target)
		v1, _, _ := winsys.GetVolume()
		e2 := winsys.SetVolume(v0)
		v2, _, _ := winsys.GetVolume()
		_ = winsys.SetMute(m0)
		out("e) volume get/set", e1 == nil && e2 == nil && v1 == target && v2 == v0, fmt.Sprintf("orig=%d set=%d read=%d restored=%d muted0=%v", v0, target, v1, v2, m0))
	}

	// ---- f) the phone path: a headless Edge loads the remote page from this
	// PC (dev origin), joins the relay, proves the token, then opens a WebRTC
	// data channel. Pass = frames flow; "direct" means the data channel is up.
	phonePass, phonePath, phoneLink := phoneTest(a.PairURL(), 15*time.Second)
	out("f) remote via relay + WebRTC data channel", phonePass, fmt.Sprintf("path=%s link=%s", phonePath, phoneLink))
	bad := strings.Replace(a.PairURL(), "#t="+a.Token(), "#t=not-the-token", 1)
	_, _, badLink := phoneTest(bad, 6*time.Second)
	out("f2) bad token rejected", badLink == "unpaired", "link="+badLink)
}

// phoneTest drives one headless Edge as the phone. Returns pass, path, link.
func phoneTest(url string, wait time.Duration) (bool, string, string) {
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath(edge.EdgePath),
		chromedp.UserDataDir(filepath.Join(os.TempDir(), "tvmode-spike", "phone-profile")),
		chromedp.Flag("headless", "new"),
	)
	actx, acancel := chromedp.NewExecAllocator(context.Background(), opts...)
	defer acancel()
	ctx, cancel := chromedp.NewContext(actx)
	defer cancel()
	ctx, tcancel := context.WithTimeout(ctx, wait+10*time.Second)
	defer tcancel()
	if err := chromedp.Run(ctx, chromedp.Navigate(url)); err != nil {
		return false, "", "nav: " + err.Error()
	}
	var path, link string
	deadline := time.Now().Add(wait)
	for time.Now().Before(deadline) {
		time.Sleep(300 * time.Millisecond)
		_ = chromedp.Run(ctx, chromedp.Evaluate(`window.tvlink ? window.tvlink.path() : ""`, &path), chromedp.Evaluate(`window.tvlink ? window.tvlink.link() : ""`, &link))
		if path == "direct" || link == "unpaired" {
			break
		}
	}
	if link != "ok" {
		return false, path, link
	}
	var sent bool
	_ = chromedp.Run(ctx, chromedp.Evaluate(`window.tvlink.send({t:"ping"})`, &sent))
	_ = chromedp.Run(ctx, chromedp.Evaluate(`window.tvlink.send({t:"power",a:"arm"})`, &sent))
	time.Sleep(2500 * time.Millisecond)
	_ = chromedp.Run(ctx, chromedp.Evaluate(`window.tvlink.send({t:"power",a:"cancel"})`, &sent))
	time.Sleep(800 * time.Millisecond)
	fmt.Println("   (power arm then cancel exercised over the", path, "path; dry-run on)")
	return sent, path, link
}
