package extapp

import (
	"log"
	"strings"
	"testing"
	"time"

	"tvmode/internal/winsys"
)

// OnMonitor says whether the window's centre is on the monitor.
func OnMonitor(w winsys.Info, m winsys.Monitor) bool {
	cx, cy := (w.L+w.R)/2, (w.T+w.B)/2
	return cx >= m.X && cx < m.X+m.W && cy >= m.Y && cy < m.Y+m.H
}

// IsChrome says whether the window is a real Chrome window (never Edge).
func IsChrome(w winsys.Info) bool { return w.Class == chromeClass && w.Exe == "chrome.exe" }

// IsPlayerTitle says whether a title names one of the TV's streaming sites.
func IsPlayerTitle(t string) bool {
	t = strings.ToLower(t)
	for _, k := range []string{"netflix", "prime video", "hotstar", "youtube"} {
		if strings.Contains(t, k) {
			return true
		}
	}
	return false
}

// sweepAllowed: only sweep when there are 2+ monitors and mon is not the primary (ms[0]).
func sweepAllowed(ms []winsys.Monitor, mon winsys.Monitor) bool {
	return len(ms) >= 2 && !(ms[0].X == mon.X && ms[0].Y == mon.Y)
}

// CloseChromeOn asks the Chrome windows on the TV monitor to close (WM_CLOSE only) so two
// players never run at once: every titled one when all is set, else only those whose title
// names a streaming site. With wait it blocks up to 3 s for them to go.
func CloseChromeOn(mon winsys.Monitor, all, wait bool) {
	if testing.Testing() {
		return
	}
	// the TV off or unplugged: pickTV falls back to the main monitor, where Dev's own
	// Chrome windows are. Never sweep there.
	if !sweepAllowed(winsys.Monitors(), mon) {
		return
	}
	pick := func() (hs []uintptr) {
		for _, w := range winsys.AllWindows() {
			if IsChrome(w) && w.Title != "" && OnMonitor(w, mon) && (all || IsPlayerTitle(w.Title)) {
				hs = append(hs, w.HWND)
			}
		}
		return
	}
	hs := pick()
	for _, h := range hs {
		log.Printf("extapp: closing leftover Chrome window %x on the TV", h)
		winsys.CloseWindow(h)
	}
	if !wait {
		return
	}
	deadline := time.Now().Add(3 * time.Second)
	for len(hs) > 0 && time.Now().Before(deadline) {
		time.Sleep(200 * time.Millisecond)
		left := hs[:0]
		for _, h := range hs {
			if winsys.IsWindow(h) {
				left = append(left, h)
			}
		}
		hs = left
	}
	if len(hs) > 0 {
		log.Printf("extapp: %d Chrome window(s) still open after 3 s; going on", len(hs))
	}
}

// Fullscreen is the phone's Full button: it ENSURES full screen. With a title bar it puts the window
// back on the TV and presses F11; already full screen, it does nothing (it never toggles out).
func (a *App) Fullscreen() error {
	if err := a.front(); err != nil {
		return err
	}
	a.mu.Lock()
	h, mon := a.hwnd, a.mon
	a.mu.Unlock()
	if !a.ensureFullscreen(h, mon) {
		log.Printf("extapp: Full pressed, window %x is already full screen; nothing to do", h)
	}
	return nil
}

// Guard runs every ~2 s while this window is the TV's app: when its title bar has been
// back for two checks in a row (full screen was lost), it re-places the window on the TV
// and presses F11 once, at most every 10 s.
func (a *App) Guard() {
	a.mu.Lock()
	h, mon := a.hwnd, a.mon
	if h == 0 || !winsys.IsWindow(h) {
		a.capN = 0
		a.mu.Unlock()
		return
	}
	if !winsys.HasCaption(h) {
		a.capN = 0
		a.mu.Unlock()
		return
	}
	a.capN++
	now := time.Now()
	if a.capN < 2 || now.Sub(a.lastFix) < 10*time.Second || now.Before(a.holdUntil) {
		a.mu.Unlock()
		return
	}
	if deskBusy(mon) { // Dev is typing on the desk: no grab, try again next tick
		a.mu.Unlock()
		return
	}
	a.lastFix = now
	a.mu.Unlock()
	placeWindow(h, mon.X, mon.Y, mon.W, mon.H)
	if winsys.Foreground() == h || winsys.ForceForeground(h) {
		if winsys.Foreground() == h && pressF11IfCaption(h) { // re-checked right before the press
			log.Printf("extapp: window %x lost full screen; re-placed it on the TV and pressed F11", h)
			return
		}
		if !hasCaption(h) {
			return // full screen came back by itself while we placed it
		}
	}
	log.Printf("extapp: window %x lost full screen; re-placed it on the TV, could not bring it to the front for F11", h)
}

// Window is our window's handle (0 when closed), so guards leave it alone.
func (a *App) Window() uintptr {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.hwnd
}
