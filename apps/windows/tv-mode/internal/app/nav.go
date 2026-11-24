package app

import (
	"fmt"
	"log"
	"time"

	"tvmode/internal/services"
)

// The remote's d-pad, OK and Back, made to work on pages whose own keyboard
// handling does nothing (Netflix, Prime and JioHotstar browse pages leave
// focus on <body>). See PROTOCOL.md "OK, arrows and Back".

// okState is what OK needs to know to decide.
type okState struct {
	PointerActive bool // the drawn pointer is live: click where it is
	OnLauncher    bool
	YouTube       bool // youtube.com/tv: its own key handling works, keep native keys
	RingActive    bool // the spatial-nav ring is showing
	Player        bool // a main player is on the page (not a browse-page trailer)
}

// okRoute says what OK does. Pure, so it is unit-tested.
func okRoute(s okState) string {
	switch {
	case s.PointerActive:
		return "click"
	case s.OnLauncher, s.YouTube:
		return "enter"
	case s.RingActive:
		return "ring"
	case s.Player:
		return "playpause"
	}
	return "focus" // Enter if something has focus, else the ring
}

type focusInfo struct {
	K      string `json:"k"` // body | input | el
	Sig    string `json:"sig"`
	Ring   bool   `json:"ring"`
	Player bool   `json:"player"`
}

func (a *App) focus() (focusInfo, bool) {
	var f focusInfo
	if err := a.Edge.Eval(services.JSFocus, &f); err != nil {
		return f, false
	}
	return f, true
}

// pressOK is the OK button.
func (a *App) pressOK() {
	s := a.svc()
	st := okState{PointerActive: a.In.Active(), OnLauncher: a.onLauncher(), YouTube: s == services.YouTube}
	var f focusInfo
	haveF := false
	if !st.PointerActive && !st.OnLauncher && !st.YouTube {
		f, haveF = a.focus()
		st.RingActive, st.Player = f.Ring, f.Player
	}
	switch okRoute(st) {
	case "click":
		_ = a.In.Tap("left")
	case "enter":
		_ = a.In.Keys(s.Nav["ok"])
	case "ring":
		a.focusClick()
	case "playpause":
		a.media("playpause", 0)
	default:
		if haveF && f.K == "input" { // a text field: Enter submits it
			_ = a.In.Keys(s.Nav["ok"])
			return
		}
		a.focusClick() // click what has focus, or put focus on the thing nearest the middle first
	}
}

// focusClick clicks the focused element with a real mouse click at its centre
// (so the site sees a trusted gesture), or, when nothing is focused, puts focus
// on the element nearest the middle (a second OK clicks it).
func (a *App) focusClick() {
	var t *struct{ X, Y float64 }
	_ = a.Edge.Eval(`window.__tv&&window.__tv.navTarget?window.__tv.navTarget():null`, &t)
	if t != nil {
		if err := a.In.TapAt(t.X, t.Y); err != nil {
			_ = a.Edge.Eval(`window.__tv&&window.__tv.navOk&&window.__tv.navOk()`, nil)
		}
		_ = a.Edge.Eval(`window.__tv&&window.__tv.navClear&&window.__tv.navClear()`, nil)
		return
	}
	_ = a.Edge.Eval(`window.__tv&&window.__tv.nav&&window.__tv.nav("")`, nil)
}

// arrow is up/down/left/right. Where the page has a player or a text field,
// and on YouTube TV (built for a remote), the native key goes through. On
// every other page focus moves by geometry: the overlay finds the best next
// pressable element, focuses it for real and scrolls it into view. Only when it
// finds nothing does the native key go through. (Sending the native key first
// scrolled the page on every press.)
func (a *App) arrow(dir string) {
	s := a.svc()
	native := s.Nav[dir]
	if a.onLauncher() || s == services.YouTube {
		_ = a.In.Keys(native)
		return
	}
	f, ok := a.focus()
	if !ok || f.Player || (f.K == "input" && (dir == "left" || dir == "right")) {
		_ = a.In.Keys(native) // caret moves in a text field; a player seeks
		return
	}
	var acted bool // up and down leave a text field by geometry (a login form must not trap the d-pad)
	_ = a.Edge.Eval(fmt.Sprintf(`window.__tv&&window.__tv.nav?window.__tv.nav(%q):false`, dir), &acted)
	if !acted {
		_ = a.In.Keys(native)
	}
}

// back is the Back button: leave fullscreen, then go back to where the page
// came from. The window's own kiosk fullscreen is never touched, so TV Mode
// keeps its window state and the overlay stays up (it re-raises itself on
// fullscreenchange).
func (a *App) back() {
	if a.onLauncher() {
		return // nothing behind the launcher; Esc there would quit TV mode
	}
	s := a.svc()
	var wasFS bool
	_ = a.Edge.Eval(services.JSExitFullscreen, &wasFS)
	if wasFS {
		time.Sleep(220 * time.Millisecond)
	}
	if s == services.YouTube {
		var before string
		_ = a.Edge.Eval(`location.href`, &before)
		_ = a.In.Keys(s.Nav["back"])
		time.Sleep(450 * time.Millisecond)
		var after string
		_ = a.Edge.Eval(`location.href`, &after)
		if after == before && !wasFS {
			var how string
			_ = a.Edge.Eval(services.JSBackNav(s.ID), &how)
			log.Printf("back: youtube escape did nothing, history: %s", how)
		}
		a.afterMedia(false)
		return
	}
	// An open dialog (a title popup, a cookie sheet) closes first: history.back()
	// there would leave the service.
	var modal bool
	_ = a.Edge.Eval(`window.__tv&&window.__tv.modalOpen?window.__tv.modalOpen():false`, &modal)
	// A second Back soon after a dialog Back, on the same page, goes back out of the
	// page even when a dialog is still (or again) there (a sign-in wall that reopens).
	var here string
	_ = a.Edge.Eval(`location.href`, &here)
	a.mu.Lock()
	repeat := modal && here == a.modalURL && time.Since(a.modalAt) < 10*time.Second
	a.mu.Unlock()
	if modal && !repeat {
		a.mu.Lock()
		a.modalURL, a.modalAt = here, time.Now()
		a.mu.Unlock()
		_ = a.In.Keys([]services.Key{services.Escape})
		time.Sleep(300 * time.Millisecond)
		_ = a.Edge.Eval(`window.__tv.modalOpen()`, &modal)
		if modal {
			var how string
			_ = a.Edge.Eval(`window.__tv.modalClose()`, &how)
			log.Printf("back: dialog close button: %s", how)
			time.Sleep(250 * time.Millisecond)
			_ = a.Edge.Eval(`window.__tv.modalOpen()`, &modal)
		}
		if !modal {
			return
		}
		// a dialog that will not close (a sign-in wall): go back out of the page instead
	}
	var how string
	_ = a.Edge.Eval(services.JSBackNav(s.ID), &how)
	log.Printf("back: %s (fullscreen was %v)", how, wasFS)
	a.afterMedia(false)
}
