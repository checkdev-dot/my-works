// Command exttest opens a harmless data: page in Chrome as an --app window on a
// monitor, drives it with SendInput, reads what the page saw back from the
// window title, and closes only that window. No ports, no sign-in, no profile access.
package main

import (
	"flag"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"tvmode/internal/extapp"
	"tvmode/internal/winsys"
)

const page = `<!doctype html><title>start</title><body style="background:#000;color:#999;font:40px sans-serif">exttest<script>
var l=[],mm=0;function u(){document.title=l.join(",")+" mm"+mm}
addEventListener("keydown",function(e){l.push("k:"+e.key);u()});
addEventListener("click",function(){l.push("click");u()});
addEventListener("wheel",function(e){l.push("wheel"+(e.deltaY>0?"+":"-"));u()});
addEventListener("mousemove",function(){mm++;if(mm%5==0)u()});
</script>`

func main() {
	disp := flag.Int("display", 1, "monitor index")
	flag.Parse()
	mons := winsys.Monitors()
	if *disp >= len(mons) {
		*disp = 0
	}
	m := mons[*disp]
	fmt.Printf("monitor %d: %d,%d %dx%d\n", *disp, m.X, m.Y, m.W, m.H)
	a := extapp.New()
	if err := a.Open("data:text/html,"+url.PathEscape(page), m); err != nil {
		fmt.Println("open:", err)
		os.Exit(1)
	}
	time.Sleep(1200 * time.Millisecond)
	steps := []struct {
		n string
		f func() error
	}{
		{"right", func() error { return a.Key("right") }},
		{"ok", func() error { return a.Key("ok") }},
		{"playpause", func() error { return a.Key("playpause") }},
		{"back", a.Back},
		{"type", func() error { return a.Type("ab") }},
		{"seek -10", func() error { return a.Seek(-10) }},
		{"recenter+click", func() error { a.Pointer().Recenter(); time.Sleep(100 * time.Millisecond); return a.Click(true) }},
		{"scroll", func() error { return a.Scroll(300) }},
	}
	for _, s := range steps {
		fmt.Printf("%-16s err=%v\n", s.n, s.f())
		time.Sleep(250 * time.Millisecond)
	}
	// laser sweep: absolute angles with rising sequence
	p := a.Pointer()
	p.Point(true)
	for i := 1; i <= 20; i++ {
		p.AimAbs(i, float64(i)*0.01, 0, 1500, false, false)
		time.Sleep(33 * time.Millisecond)
	}
	p.Point(false)
	time.Sleep(500 * time.Millisecond)
	t := a.Title()
	fmt.Println("page saw:", t)
	for _, want := range []string{"k:ArrowRight", "k:Enter", "k: ", "k:a", "k:b", "click", "wheel+"} {
		fmt.Printf("  %-14s %v\n", want, strings.Contains(t, want))
	}
	a.Close()
	time.Sleep(1500 * time.Millisecond)
	fmt.Println("window closed:", !a.Alive() && !winsys.IsWindow(0))
}
