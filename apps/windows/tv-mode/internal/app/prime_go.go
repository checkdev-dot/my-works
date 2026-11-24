package app

import (
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"strconv"
	"strings"
	"time"

	"tvmode/internal/history"
	"tvmode/internal/tmdb"
)

// pvPickJS finds the Prime search result for a title: the one named exactly that,
// else the first whose name starts with it (so a spin-off listed first does not win).
// Prime has a page per season; any of them leads to the others.
const pvPickJS = `(function(t){function n(s){return (s||"").toLowerCase().replace(/[^a-z0-9\u0080-\uffff]/g,"")}var w=n(t),best="";
var pre="";[].slice.call(document.querySelectorAll("a[href*='/detail/']")).some(function(a){var l=n(a.getAttribute("aria-label")||a.innerText);
if(l===w||l===w+"season1"){best=a.href.split("?")[0];return true}if(!pre&&l&&l.indexOf(w)===0)pre=a.href.split("?")[0];return false});return best||pre})(%q)`

// pvEntJS reads a signed-in Prime title page: "out" when signed out (it says nothing),
// "play" when Prime plays it, "pay" when its buttons only rent or buy it. Unverified:
// no signed-in Prime page has been seen yet (the TV's Edge was signed out, 2026-11-04),
// so "pay" asks for Rent/Buy on the buttons themselves and no play control at all
// ("Subscribe" is everywhere on Prime, originals included).
const pvEntJS = `(function(){var t=document.body?document.body.innerText:"";if(document.querySelector("a[href*='auth-redirect']")||/Join Prime|Sign in to watch/i.test(t))return "out";
if(document.querySelector("a[href*='autoplay=1']:not([href*='autoplay=trailer']),[data-automation-id*='play-button'],[data-testid*='playbutton']"))return "play";
var b=[].slice.call(document.querySelectorAll("button,a[role=button],a[href*='offers']")).map(function(e){return e.innerText||e.getAttribute("aria-label")||""}).join(" | ");
return /\b(Rent|Buy)\b/.test(b)?"pay":""})()`

// pvSeasonJS answers the page of season S from a detail page's season picker ("" while
// it loads; "here" when this page is season S).
const pvSeasonJS = `(function(S){if(!document.querySelector("li[id^='av-ep-episode-']")&&!/Season/i.test(document.title))return "";
if(new RegExp("Season "+S+"\\b").test(document.title))return "here";
var a=[].slice.call(document.querySelectorAll("a[href*='season_select_s"+S+"']"))[0];return a?a.href.split("?")[0]:"none"})(%d)`

// pvEpJS finds episode E's play address on a season page, every episode's when it can
// (for the link book): its play link, else its own page by the episode's id (each row
// names it, "synopsis-amzn1.dv.gti.…"), else it presses the row's play button.
const pvEpJS = `(function(E){var all=[],hit="";[].slice.call(document.querySelectorAll("li[id^='av-ep-episode-']")).forEach(function(li){
var k=+li.id.replace("av-ep-episode-","")+1;var a=[].slice.call(li.querySelectorAll("a[href]")).filter(function(a){var h=a.getAttribute("href")||"";return h.indexOf("auth-redirect")<0&&/autoplay=1|\/watch|play/i.test(h)})[0];
var g=li.querySelector("[data-automation-id^='synopsis-amzn1.dv.gti.']");
var u=a?a.href:g?"https://www.primevideo.com/detail/"+g.getAttribute("data-automation-id").slice(9)+"/?autoplay=1":"";if(u)all.push([k,u]);if(k===E)hit=u||"press"});
if(hit==="press"){var li=document.getElementById("av-ep-episode-"+(E-1));var b=li&&li.querySelector("[data-automation-id*='play'],button[aria-label*='Play'],a[aria-label*='Play']");if(b){b.click();hit="pressed"}else hit=""}
return JSON.stringify({hit:hit,all:all})})(%d)`

// pvMovieJS finds a movie page's play address (not the trailer's).
const pvMovieJS = `(function(){var a=[].slice.call(document.querySelectorAll("a[href*='autoplay=1']")).filter(function(a){return !/autoplay=trailer/.test(a.getAttribute("href"))})[0];return a?a.href:""})()`

// primeGo opens a Prime Video title straight into the player, the way hotstarGo does
// for JioHotstar: link book, else search, the season's page, the episode's play link.
func (a *App) primeGo(n int, it tmdb.Item, se, ep int, gen int64) {
	t0 := time.Now().UnixMilli()
	name := it.Title
	if it.Kind == "tv" {
		if se == 0 {
			se, ep = 1, 1
		}
		name = fmt.Sprintf("%s  S%d E%d", it.Title, se, ep)
	}
	stale := func() bool { return a.walkStale(gen, t0) }
	opened := false
	defer func() { a.walkGaveUp(gen, opened) }()
	open := func(u string) {
		opened = true
		a.openAppAt(n, u)
		a.show("opening", map[string]any{"name": name})
	}
	tvStr := func(js string) string {
		var s string
		if a.Edge.Eval(js, &s) != nil {
			return ""
		}
		return s
	}
	var w walker
	evalStr := func(js string) string {
		var s string
		if w.eval(js, &s) != nil {
			return ""
		}
		return s
	}
	poll := func(d time.Duration, f func() bool) bool {
		for end := time.Now().Add(d); time.Now().Before(end); time.Sleep(500 * time.Millisecond) {
			if stale() {
				return false
			}
			if f() {
				return true
			}
		}
		return false
	}
	// Prime moves the episode address on to the season's page as the player opens, so
	// the hold goes on wherever the page ends up, not on the address it was sent to
	resume := func() {
		if m := a.epMarkOf(it.Title, se, ep); it.Kind == "tv" && m.Pos > 0 {
			if a.extFor("prime") { // Chrome: the helper's reports carry the seek (no page to read from here)
				a.resumeAt(history.Entry{Service: "prime", Pos: m.Pos, Dur: m.Dur, Show: it.Title, Season: se, Episode: ep})
				return
			}
			go func() {
				time.Sleep(2500 * time.Millisecond)
				if !stale() {
					a.resumeAt(history.Entry{Service: "prime", URL: tvStr("location.href"), Pos: m.Pos, Dur: m.Dur, Show: it.Title, Season: se, Episode: ep})
				}
			}()
		}
	}
	if it.Kind == "tv" {
		if u := a.linkGet(linkKey("prime", it.Title, se, ep)); u != "" {
			open(u)
			resume()
			return
		}
	}
	// the walk to the episode happens in the hidden scout; the TV keeps the cover up
	a.show("opening", map[string]any{"name": name})
	w = a.newWalker(open)
	defer w.done()
	page := a.linkGet(linkKey("prime", it.Title, 0, 0))
	if page == "" {
		w.nav("https://www.primevideo.com/search/ref=atv_nb_sr?phrase=" + url.QueryEscape(it.Title))
		time.Sleep(1500 * time.Millisecond)
		if !poll(15*time.Second, func() bool { page = evalStr(fmt.Sprintf(pvPickJS, it.Title)); return page != "" }) {
			log.Printf("prime: no search match for %q", it.Title)
			var miss string
			if !stale() && w.eval(fmt.Sprintf(searchMissJS, it.Title), &miss) == nil && miss == "miss" { // results like it came, none is it
				a.lacks("prime", it, se, ep, "not in its search")
			} else if !w.tv && !stale() {
				open("https://www.primevideo.com/search/ref=atv_nb_sr?phrase=" + url.QueryEscape(it.Title))
			}
			return
		}
		a.linkPut(linkKey("prime", it.Title, 0, 0), page)
	}
	w.nav(page)
	time.Sleep(1500 * time.Millisecond)
	// Prime's search lists what it rents and sells too: the signed-in page says which
	var ent string
	poll(8*time.Second, func() bool { ent = evalStr(pvEntJS); return ent != "" })
	switch ent {
	case "pay":
		a.lacks("prime", it, se, ep, "only to rent, buy or by channel")
		return
	case "play":
		a.availPut("prime", itemKey(it), true, "plays with Prime")
	}
	if it.Kind != "tv" {
		var u string
		if poll(12*time.Second, func() bool { u = evalStr(pvMovieJS); return u != "" }) {
			open(u)
			return
		}
		if stale() {
			return
		}
		// the signed-out scout often gets no play link for a film: the film's own page
		// with autoplay plays in the signed-in window (episodes already go this way)
		u = strings.TrimRight(strings.SplitN(page, "?", 2)[0], "/") + "/?autoplay=1"
		log.Printf("prime: no play link for %q on its page; opening the page with autoplay", it.Title)
		open(u)
		return
	}
	// the season's own page
	var sp string
	if !poll(15*time.Second, func() bool { sp = evalStr(fmt.Sprintf(pvSeasonJS, se)); return sp != "" }) {
		if !stale() {
			log.Printf("prime: no season %d page found for %q; opening its page", se, it.Title)
			open(page)
		}
		return
	}
	if sp == "none" {
		log.Printf("prime: %s has no season %d here", it.Title, se)
		return
	}
	if sp != "here" {
		a.linkPut(linkKey("prime", it.Title, se, 0)+"|page", sp)
		w.nav(sp)
		time.Sleep(1500 * time.Millisecond)
	}
	var hit string
	poll(15*time.Second, func() bool {
		var r struct {
			Hit string  `json:"hit"`
			All [][]any `json:"all"`
		}
		if err := json.Unmarshal([]byte(evalStr(fmt.Sprintf(pvEpJS, ep))), &r); err != nil {
			return false
		}
		for _, x := range r.All {
			if len(x) == 2 {
				k, _ := x[0].(float64)
				u, _ := x[1].(string)
				a.linkPut(linkKey("prime", it.Title, se, int(k)), u)
			}
		}
		hit = r.Hit
		return hit != ""
	})
	switch {
	case hit == "pressed" && !w.tv: // no address to send: the TV opens the season page and presses play there
		if a.extFor("prime") { // Chrome: the helper presses the episode's play button, told by the note in the address
			t := page
			if sp != "" && sp != "here" {
				t = sp
			}
			open(t + "#tvep=" + strconv.Itoa(ep))
			resume()
			return
		}
		if sp != "" && sp != "here" {
			open(sp)
		} else {
			open(page)
		}
		time.Sleep(2 * time.Second)
		var r2 string
		_ = a.Edge.Eval(fmt.Sprintf(pvEpJS, ep), &r2)
		resume()
	case hit == "pressed": // the player opens in place: hold its own address
		a.show("opening", map[string]any{"name": name})
		resume()
	case hit != "" && !strings.HasPrefix(hit, "press"):
		open(hit)
		resume()
	default:
		log.Printf("prime: %s not found on the season page", name)
		if !w.tv && !stale() {
			open(page)
		}
	}
}
