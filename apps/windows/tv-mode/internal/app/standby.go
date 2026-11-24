package app

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"github.com/chromedp/cdproto/page"

	"tvmode/internal/extapp"
)

// Standby: the process runs from Windows startup with the relay link up but no
// Edge and no screen. The phone's Start TV button (or the desktop shortcut)
// brings the TV up in the same process; closing the screen returns here.
// See PROTOCOL.md (standby and start).

const (
	tvOff      int32 = iota // standby (or not yet started)
	tvStarting              // Edge is launching
	tvOn                    // TV session running
	tvClosing               // being torn down
)

// deskKeepAlive is set by the desk's "Desk" mode (POST /api/desk/mode): from then on a
// closed TV session returns to standby even when the program was started without
// -standby (the main "TV Mode" shortcut), so the desk keeps working and the phone sees
// Start TV. One App per process, so it is a package flag (app.go is not touched).
// "Turn off TV Mode" from the phone ({"t":"exit","a":"quit"}) still quits fully.
var deskKeepAlive atomic.Bool

// standbyMode is -standby, or the desk has asked to stay alive after a close.
func (a *App) standbyMode() bool { return a.o.Standby || deskKeepAlive.Load() }

// standbyNow says phones should see the Start TV screen: standby mode and the
// TV session is not fully up.
func (a *App) standbyNow() bool {
	return a.standbyMode() && a.tvState.Load() != tvOn
}

// deskCloseTV closes the TV session (back to standby); a variable so tests never
// reach Edge, the monitors or the extension.
var deskCloseTV = func(a *App) { a.closeScreen("desk mode") }

// POST /api/desk/mode {"mode":"tv"|"desk"}: the Desk | TV switch of the desk page.
//
//	tv:   start the TV session when it is off (the same path as the phone's Start TV),
//	      or bring it to the front when it is already on.
//	desk: close the TV session but keep TV Mode running, so the desk keeps working and
//	      the phone shows Start TV. The flag is set first, so runLoop never ends.
func (a *App) deskMode(w http.ResponseWriter, r *http.Request) {
	if !deskGate(w, r, http.MethodPost) {
		return
	}
	var q struct {
		Mode string `json:"mode"`
	}
	if !deskDecode(w, r, &q) {
		return
	}
	switch q.Mode {
	case "tv":
		if a.tvState.Load() == tvOn {
			log.Printf("desk: TV mode, already on, bringing Edge to front")
			go a.raiseEdge()
			deskJSON(w, map[string]any{"ok": true, "mode": "tv"})
			return
		}
		starting := a.startThenPlay(func() {})
		w.WriteHeader(http.StatusAccepted)
		deskJSON(w, map[string]any{"ok": true, "mode": "tv", "starting": starting})
	case "desk":
		if a.tvState.Load() == tvStarting {
			deskErr(w, http.StatusConflict, "the TV is still starting; try again in a moment")
			return
		}
		deskKeepAlive.Store(true) // before the close: runLoop must see standby, not an end
		if a.tvState.Load() == tvOn {
			log.Printf("desk: desk mode, closing the TV session")
			go deskCloseTV(a)
		}
		deskJSON(w, map[string]any{"ok": true, "mode": "desk"})
	default:
		deskErr(w, http.StatusBadRequest, "bad request")
	}
}

// queueInitial sends a freshly authenticated (or reconnected) phone its first
// frame: state, or standby while the TV is down.
func (a *App) queueInitial(cl *client) {
	if a.standbyNow() {
		cl.queue(a.standbyFrame())
		return
	}
	cl.queue(a.snapshot())
}

// standbyFrame is {"t":"standby"}, plus "countdown" while a shutdown countdown runs, so a
// phone that is sitting on the Start TV screen can show it and Cancel it.
func (a *App) standbyFrame() map[string]any {
	f := map[string]any{"t": "standby"}
	a.mu.Lock()
	if a.st.Countdown != nil {
		f["countdown"] = *a.st.Countdown
	}
	a.mu.Unlock()
	return f
}

// broadcastStandby is broadcast() while the TV is down: phones stay on their Start TV
// screen, and hear only about a running shutdown countdown (frames with and without it).
func (a *App) broadcastStandby() {
	f := a.standbyFrame()
	_, on := f["countdown"]
	if on || standbyCdShown.Swap(false) { // the frame after the last one tells phones it ended
		standbyCdShown.Store(on)
		a.hub.broadcastRemotes(f)
	}
}

// standbyCdShown: the last standby broadcast carried a countdown (one per process, like deskKeepAlive).
var standbyCdShown atomic.Bool

// standbyGate runs before any phone frame is acted on. While the TV is down in
// standby mode it handles "start" and the shutdown hold ("power" arm / cancel: the same
// 10 s countdown as with the TV up), and ignores everything else.
func (a *App) standbyGate(t, arg string) bool {
	if !a.standbyNow() {
		return false
	}
	switch t {
	case "start":
		a.requestStart("phone")
	case "power":
		switch arg {
		case "arm":
			a.armShutdown()
		case "cancel":
			a.cancelPower()
		}
	}
	return true
}

// requestStart asks the Run loop to bring the TV up. Ignored while one is
// already starting or running.
func (a *App) requestStart(from string) bool {
	if a.tvState.Load() != tvOff {
		return false
	}
	select {
	case a.startCh <- struct{}{}:
		log.Printf("start: requested by %s", from)
		return true
	default:
		return false
	}
}

// runLoop is Run after the servers are up: in standby mode wait for a start,
// run one TV session, and come back; otherwise run one session and return.
func (a *App) runLoop() error {
	first := a.o.StartNow
	for {
		if a.standbyMode() && !first {
			log.Printf("standby: waiting for Start TV")
			select {
			case <-a.ctx.Done():
				return nil
			case <-a.Done:
				return nil
			case <-a.startCh:
			}
		}
		first = false
		go a.refreshIfDue() // the PC may have slept since the rows were fetched
		err := a.runTV()
		a.endSession()
		if !a.standbyMode() {
			return err
		}
		if err != nil {
			log.Printf("start: %v", err)
			a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "TV Mode could not start"})
		}
		select {
		case <-a.ctx.Done():
			return nil
		case <-a.Done:
			return nil
		default:
		}
		select { // a Start pressed while closing is stale
		case <-a.startCh:
		default:
		}
		a.hub.broadcastRemotes(map[string]string{"t": "standby"})
	}
}

// endSession closes Edge gracefully (Browser.close, never a kill unless it
// hangs) and the Chrome window, and ends the TV session. Safe to call twice.
func (a *App) endSession() {
	a.sessMu.Lock()
	defer a.sessMu.Unlock()
	if a.tvState.Load() == tvOff {
		return
	}
	a.tvState.Store(tvClosing)
	a.setScreen(true) // never leave a monitor dark with no TV to wake it
	a.cancelPower()
	a.ext.Close()
	if !a.o.Test { // a Netflix window an earlier TV Mode left on the TV
		extapp.CloseChromeOn(a.tvMonitor(), false, false)
	}
	if a.Edge != nil {
		a.Edge.Close()
	}
	if a.sessCancel != nil {
		a.sessCancel()
	}
	if a.sessEnd != nil {
		close(a.sessEnd)
		a.sessEnd = nil
	}
	a.tvState.Store(tvOff)
}

// closeScreen leaves the TV session on purpose (or because Edge is gone) and
// goes back to standby; without -standby the program then ends.
func (a *App) closeScreen(why string) {
	log.Printf("exit: close screen (%s)", why)
	a.endSession()
}

// exitRequest handles an exit asked from the phone ("quit" = Turn off TV Mode)
// or from Esc on the PC (""): close the screen in standby mode, else quit.
func (a *App) exitRequest(arg string) {
	if a.standbyMode() && arg != "quit" {
		a.closeScreen("asked")
		return
	}
	a.Exit()
}

// startHandler is POST /api/start with X-TVMode: start (loopback only, like
// /api/quit). The desktop shortcut uses it to start the TV in a running
// instance; if the TV is already up it is brought to the front.
func (a *App) startHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost || r.Header.Get("X-TVMode") != "start" {
		http.Error(w, "POST with X-TVMode: start", http.StatusMethodNotAllowed)
		return
	}
	switch a.tvState.Load() {
	case tvOn:
		log.Printf("start: shortcut, already running, bringing Edge to front")
		go a.raiseEdge()
	default:
		a.requestStart("shortcut")
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) raiseEdge() {
	if a.extActive() && a.ext.Alive() { // an app is playing in Chrome: that is what the shortcut brings back
		a.ext.Raise()
		return
	}
	if a.Edge == nil {
		return
	}
	_ = a.Edge.DoWithin(3*time.Second, func(ctx context.Context) error { return page.BringToFront().Do(ctx) })
}

// Handoff is for a second tvmode.exe: if a TV Mode already answers on base
// (e.g. "http://127.0.0.1:8770") it returns running=true, after asking it to
// start the TV when start is set. The caller then exits instead of starting.
func Handoff(base string, start bool) (running bool, err error) {
	c := http.Client{
		Timeout:       3 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	if !start {
		resp, e := c.Get(base + "/api/pair")
		if e != nil {
			return false, nil
		}
		resp.Body.Close()
		return true, nil
	}
	req, _ := http.NewRequest(http.MethodPost, base+"/api/start", strings.NewReader(""))
	req.Header.Set("X-TVMode", "start")
	resp, e := c.Do(req)
	if e != nil {
		return false, nil // nothing listening: start normally
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		return true, fmt.Errorf("a TV Mode is running but did not accept Start (%s); run tvmode.exe -quit and try again", resp.Status)
	}
	return true, nil
}
