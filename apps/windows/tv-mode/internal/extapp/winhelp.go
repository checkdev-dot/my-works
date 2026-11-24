package extapp

import (
	"log"
	"strings"
	"testing"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"

	"tvmode/internal/winsys"
)

const vkF5 = 0x74

var (
	user32x              = windows.NewLazySystemDLL("user32.dll")
	procIsHungAppWindow  = user32x.NewProc("IsHungAppWindow")
	procGetWindowOwner   = user32x.NewProc("GetWindow")
	procGetLastInputInfo = user32x.NewProc("GetLastInputInfo")
	kernel32x            = windows.NewLazySystemDLL("kernel32.dll")
	procGetTickCount     = kernel32x.NewProc("GetTickCount")
)

// the window calls the guards and fullscreen use; tests replace them.
var (
	hasCaption  = winsys.HasCaption
	keyTap      = winsys.KeyTap
	placeWindow = winsys.PlaceWindow
)

// pressF11IfCaption presses F11 only while the window has a title bar (it is not full
// screen). It never toggles a full-screen window out. It says whether F11 was pressed.
func pressF11IfCaption(h uintptr) bool {
	if !hasCaption(h) {
		return false
	}
	_ = keyTap(vkF11, false)
	return true
}

// ensureFullscreen is the phone's Full button: put the window back on the TV and press F11
// when it has a title bar; with none it is already full screen and nothing is pressed.
func (a *App) ensureFullscreen(h uintptr, mon winsys.Monitor) bool {
	if !hasCaption(h) {
		return false
	}
	placeWindow(h, mon.X, mon.Y, mon.W, mon.H)
	a.mu.Lock()
	a.holdUntil = time.Time{}
	a.mu.Unlock()
	return pressF11IfCaption(h)
}

func isHung(h uintptr) bool {
	r, _, _ := procIsHungAppWindow.Call(h)
	return r != 0
}

// Owner is the window that owns h (a popup's opener), 0 for none.
func Owner(h uintptr) uintptr {
	r, _, _ := procGetWindowOwner.Call(h, 4) // GW_OWNER
	return r
}

// inputIdle is how long since the last keyboard or mouse input anywhere.
func inputIdle() time.Duration {
	var li struct{ Size, Time uint32 }
	li.Size = uint32(unsafe.Sizeof(li))
	if r, _, _ := procGetLastInputInfo.Call(uintptr(unsafe.Pointer(&li))); r == 0 {
		return time.Hour
	}
	now, _, _ := procGetTickCount.Call()
	return time.Duration(uint32(now)-li.Time) * time.Millisecond
}

// deskBusy: Dev is working on the desk: the window with the keyboard is off the TV monitor
// (the focusTV rule) and there was input in the last 5 s. The guard then leaves focus alone.
var deskBusy = func(mon winsys.Monitor) bool {
	x, y, ok := winsys.WindowCenter(winsys.Foreground())
	if !ok || mon.W <= 0 || (x >= mon.X && x < mon.X+mon.W && y >= mon.Y && y < mon.Y+mon.H) {
		return false
	}
	return inputIdle() < 5*time.Second
}

// Adopt looks for a Chrome window on the TV whose title names the current site (Chrome
// recreated our window, or it was dragged) and takes it over instead of giving up. It
// only looks when there is a separate TV monitor. A window with a title bar is left to
// the guard, which puts it in full screen when the desk is free.
func (a *App) Adopt(mon winsys.Monitor) bool {
	if testing.Testing() || !sweepAllowed(winsys.Monitors(), mon) {
		return false
	}
	a.mu.Lock()
	words := siteWords(a.url)
	a.mu.Unlock()
	for _, w := range winsys.AllWindows() {
		if !IsChrome(w) || w.Minimized || w.Tool || w.Cloaked || w.Title == "" || !OnMonitor(w, mon) || Owner(w.HWND) != 0 {
			continue
		}
		t := strings.ToLower(w.Title)
		for _, word := range words {
			if word == "" || !strings.Contains(t, word) {
				continue
			}
			winsys.MoveWindow(w.HWND, mon.X, mon.Y, mon.W, mon.H)
			a.mu.Lock()
			a.hwnd, a.mon, a.lastTitle, a.opened = w.HWND, mon, w.Title, time.Now()
			a.capN, a.lastFix, a.holdUntil = 1, time.Time{}, time.Time{}
			if a.ptr != nil {
				a.ptr.stop()
			}
			a.ptr = newPointer(mon)
			a.mu.Unlock()
			log.Printf("extapp: adopted window %x %q on the TV (title bar=%v)", w.HWND, w.Title, hasCaption(w.HWND))
			return true
		}
	}
	return false
}
