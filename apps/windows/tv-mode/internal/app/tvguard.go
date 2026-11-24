package app

import (
	"context"
	"log"
	"os"
	"testing"
	"time"

	"tvmode/internal/extapp"
	"tvmode/internal/winsys"
)

// While the TV session is on, the TV monitor shows only TV Mode: its Edge and our Chrome
// window. tvGuardLoop (every 2 s) keeps our Chrome window full screen and clears the TV of
// anything else. Desk mode and standby have no session, so the loop is not running then.

type strayKind int

const (
	strayClose strayKind = iota + 1 // a stray streaming player in Chrome: WM_CLOSE
	strayMove                       // any other window: back to the main monitor
)

type strayAct struct {
	W           winsys.Info
	Kind        strayKind
	X, Y, Wd, H int // strayMove: the new rectangle
}

// shell windows that belong to the desktop, never to a program Dev opened.
var shellClass = map[string]bool{
	"Progman": true, "WorkerW": true, "Shell_TrayWnd": true, "Shell_SecondaryTrayWnd": true,
	"NotifyIconOverflowWindow": true, "TopLevelWindowForOverflowXamlIsland": true,
	"XamlExplorerHostIslandWindow": true, "Windows.UI.Core.CoreWindow": true,
}

// strayActions decides what happens to each window on the TV monitor: ours, TV Mode's own,
// any Edge, minimized, tool, cloaked, untitled, zero-size and shell windows are kept; a
// Chrome window naming a streaming site is closed; the rest move to the primary monitor,
// size kept, clamped inside it (above its taskbar).
func strayActions(ws []winsys.Info, tv, primary winsys.Monitor, ours uintptr, ownPID uint32) []strayAct {
	var out []strayAct
	for _, w := range ws {
		if w.HWND == ours || w.PID == ownPID || w.Exe == "msedge.exe" || w.Minimized || w.Tool || w.Cloaked ||
			w.Title == "" || shellClass[w.Class] || w.R-w.L <= 0 || w.B-w.T <= 0 || !extapp.OnMonitor(w, tv) {
			continue
		}
		if extapp.IsChrome(w) && extapp.IsPlayerTitle(w.Title) {
			out = append(out, strayAct{W: w, Kind: strayClose})
			continue
		}
		bottom := primary.Y + primary.H - 48
		wd, h := w.R-w.L, w.B-w.T
		if wd > primary.W {
			wd = primary.W
		}
		if h > bottom-primary.Y {
			h = bottom - primary.Y
		}
		x, y := w.L-tv.X+primary.X, w.T-tv.Y+primary.Y // the same spot, relative to the main monitor
		x = max(primary.X, min(x, primary.X+primary.W-wd))
		y = max(primary.Y, min(y, bottom-h))
		out = append(out, strayAct{W: w, Kind: strayMove, X: x, Y: y, Wd: wd, H: h})
	}
	return out
}

func (a *App) tvGuardLoop(ctx context.Context) {
	if testing.Testing() || a.o.Test || a.o.Windowed {
		return
	}
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	seen := map[uintptr]bool{}
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		a.mu.Lock()
		busy := a.opening != "" // our new window is not ours yet: leave everything alone
		a.mu.Unlock()
		if busy || a.tvState.Load() != tvOn || a.standbyNow() {
			continue
		}
		if a.extActive() {
			if !a.ext.Alive() {
				continue // pollLoop is deciding (adopt a replacement window or go home): a "Netflix" window now is not a stray
			}
			a.ext.Guard()
		}
		mons := winsys.Monitors()
		tv := pickTV(mons, a.o.Display)
		if len(mons) < 2 || mons[0] == tv { // no separate TV monitor: nothing to keep clear
			continue
		}
		ours := a.ext.Window()
		var ws []winsys.Info
		for _, w := range winsys.AllWindows() {
			if ours != 0 && extapp.Owner(w.HWND) == ours {
				continue // a popup our window opened (a sign-in dialog): not a stray
			}
			ws = append(ws, w)
		}
		live := map[uintptr]bool{}
		for _, s := range strayActions(ws, tv, mons[0], ours, uint32(os.Getpid())) {
			h := s.W.HWND
			live[h] = true
			if !seen[h] {
				seen[h] = true
				if s.Kind == strayClose {
					log.Printf("tvguard: closing stray player %x %q on the TV", h, s.W.Title)
				} else {
					log.Printf("tvguard: moving %x %q (%s) off the TV to the main monitor", h, s.W.Title, s.W.Exe)
				}
			}
			if s.Kind == strayClose {
				winsys.CloseWindow(h)
			} else {
				winsys.MoveWindow(h, s.X, s.Y, s.Wd, s.H)
			}
		}
		for h := range seen {
			if !live[h] {
				delete(seen, h) // gone or off the TV: log it again if it comes back
			}
		}
	}
}
