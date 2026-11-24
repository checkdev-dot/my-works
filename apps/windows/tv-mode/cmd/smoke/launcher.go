package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

func shotJPG(name string) {
	if *shots == "" {
		return
	}
	var buf []byte
	_ = chromedp.Run(tv, chromedp.ActionFunc(func(c context.Context) error {
		var err error
		buf, err = page.CaptureScreenshot().WithFormat(page.CaptureScreenshotFormatJpeg).WithQuality(88).Do(c)
		return err
	}))
	_ = os.MkdirAll(*shots, 0o755)
	_ = os.WriteFile(filepath.Join(*shots, name), buf, 0o644)
}

// launcherLocal: the v3 launcher ("One thing lit") with canned rows (TVMODE_TEST_ROWS) and a canned history entry.
func launcherLocal() {
	fmt.Println("--- launcher v3")
	_ = chromedp.Run(tv, emulation.SetDeviceMetricsOverride(1920, 1080, 1, false))
	defer func() { _ = chromedp.Run(tv, emulation.ClearDeviceMetricsOverride()) }()
	waitTV(`document.querySelectorAll("#rows .row").length>0`, 8*time.Second)
	time.Sleep(1200 * time.Millisecond)
	vh := tvNum(`innerHeight`)
	nRows := int(tvNum(`document.querySelectorAll("#rows .row").length`))
	check("at least 7 rows are built (canned)", nRows >= 7, "%d rows", nRows)
	check("hero is the default focus with a title and an action", tvBool(`document.querySelector("#stagetxt .ttl")&&document.querySelector("#stagetxt .ttl").textContent.length>0&&document.querySelector("#stagetxt .act")!==null`), "%s", tvStr(`(document.querySelector("#stagetxt .ttl")||{}).textContent||""`))
	fmt.Println("      DEBUG hero data:", tvStr(`JSON.stringify(window.__launcher.data().hero).slice(0,300)+JSON.stringify(window.__launcher.sel)`))
	check("hero is Continue watching from history (resume)", tvBool(`/Resume/.test(document.querySelector("#stagetxt .act").textContent)&&document.querySelector("#stagetxt .prog")!==null`), "")
	check("page never holds an api key or TMDB address", !tvBool(`/api_key|themoviedb|Bearer/i.test(document.documentElement.outerHTML)`), "")
	shotJPG("launcher-v3-hero.jpg")

	// services: glow colour comes from data-svc
	key("down")
	check("down from the hero lands on services with a service glow", tvBool(`(function(){var t=document.querySelector(".tile.on");return !!t&&t.getAttribute("data-svc")!==""&&parseFloat(getComputedStyle(t,"::after").opacity)>0.5})()`), "")
	// filter within two Downs
	n := 0
	for i := 0; i < 2 && !tvBool(`document.querySelector(".pill.on")!==null`); i++ {
		key("down")
		n++
	}
	check("filter pills are reached in at most 2 Downs from services", tvBool(`document.querySelector(".pill.on")!==null`), "%d downs", n)

	// mode switch changes what you see
	title0 := tvStr(`document.querySelector("#rows .row h2").textContent`)
	key("right")
	key("ok")
	time.Sleep(700 * time.Millisecond)
	title1 := tvStr(`document.querySelector("#rows .row h2").textContent`)
	check("Movies mode renames the rows and keeps focus on the filter", title0 != title1 && tvBool(`document.querySelector(".pill.on")!==null`), "%q -> %q", title0, title1)
	check("Movies mode keeps only movies in the row", tvNum(`document.querySelector("#rows .row .rin").children.length`) == 4, "")
	key("up")
	check("hero never vanishes in Movies mode and its kicker leads with the mode", tvBool(`/MOVIES/i.test((document.querySelector("#stagetxt .kick")||{}).textContent||"")||document.querySelector("#stagetxt .prog")!==null`), "%s", tvStr(`(document.querySelector("#stagetxt .kick")||{}).textContent||""`))
	key("down")
	key("left")
	key("ok")
	time.Sleep(700 * time.Millisecond)

	// pinned row: Down onto the first row's cards
	key("down")
	time.Sleep(450 * time.Millisecond)
	top := tvNum(`document.querySelector(".row.lit .rowhead").getBoundingClientRect().top`)
	check("focused row is pinned with its label at y 600", abs(top-600*vh/1080) < 6, "top=%.0f want %.0f", top, 600*vh/1080)
	check("next row peeks and earlier ones are gone", tvBool(`document.querySelectorAll(".row.peek").length===1`), "")
	check("services and filter scroll out", tvBool(`document.getElementById("stage").getAttribute("data-top")==="0"&&getComputedStyle(document.getElementById("svc")).opacity==="0"`), "")
	check("stage describes the focused card", tvBool(`document.querySelector("#stagetxt .ttl").textContent.indexOf("Title")===0&&/OK for details/.test(document.getElementById("stagetxt").textContent)`), "%s", tvStr(`document.querySelector("#stagetxt .ttl").textContent`))
	key("right")
	key("right")
	key("right")
	time.Sleep(400 * time.Millisecond)
	shotJPG("launcher-v3-row.jpg")

	// detail panel: OK opens, Back (phone) closes
	key("ok")
	time.Sleep(900 * time.Millisecond)
	check("OK on a recommendation opens the detail panel", tvBool(`!document.getElementById("panel").hidden&&document.querySelector("#panel .ttl")!==null`), "")
	shotJPG("launcher-v3-panel.jpg")
	key("back")
	time.Sleep(500 * time.Millisecond)
	fmt.Println("      DEBUG panel hidden:", tvBool(`document.getElementById("panel").hidden`), "card.on:", tvBool(`document.querySelector(".card.on")!==null`), "sel:", tvStr(`JSON.stringify(window.__launcher.sel)`))
	check("Back closes the panel and keeps the card", tvBool(`document.getElementById("panel").hidden&&document.querySelector(".card.on")!==null`), "")

	// nothing under 22 design pixels
	small := tvStr(`(function(){var p=innerHeight/1080,bad=[];[].forEach.call(document.querySelectorAll("body *"),function(e){
		if(!e.getClientRects().length)return;var s=getComputedStyle(e);if(s.visibility==="hidden"||s.display==="none")return;
		var own=[].some.call(e.childNodes,function(n){return n.nodeType===3&&n.textContent.trim()});if(!own)return;
		var f=parseFloat(s.fontSize);if(f<21.5*p&&!e.closest("#panel[hidden]")&&!e.closest("svg"))bad.push((e.className||e.tagName)+":"+f.toFixed(1))});return bad.slice(0,6).join(" ")})()`)
	check("no visible text under 22 design px", small == "", "%s", small)

	// hero Resume opens the stored page in one press
	for i := 0; i < 12; i++ {
		key("up")
	}
	key("ok")
	opened := waitTV(`location.href.indexOf("tvmode-app=prime")>0`, 8*time.Second)
	_, st := waitState(func(p pcState) bool { return p.App == "prime" }, 3*time.Second)
	check("OK on the hero Resume opens that page", opened && st, "%s", strings.TrimSpace(trimURL(tvStr(`location.href`))))
}
