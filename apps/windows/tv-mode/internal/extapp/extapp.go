// Package extapp runs a service that cannot live in TV Mode's Edge (Netflix
// refuses any Edge with a debug port) as a Chrome --app window on the TV
// monitor, and drives it with Windows SendInput. It never touches Chrome's
// profile, never passes a profile or debug flag, and closes only its own
// window (WM_CLOSE).
package extapp

import (
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"

	"golang.org/x/sys/windows/registry"

	"tvmode/internal/winsys"
)

const chromeClass = "Chrome_WidgetWin_1"

// ErrNoChrome means Chrome is not installed where Windows says it is.
var ErrNoChrome = errors.New("Chrome is not installed")

// FindChrome returns chrome.exe from the App Paths registry keys, then the
// usual install folders. It reads the path only.
func FindChrome() (string, error) {
	for _, root := range []registry.Key{registry.LOCAL_MACHINE, registry.CURRENT_USER} {
		k, err := registry.OpenKey(root, `SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe`, registry.QUERY_VALUE)
		if err != nil {
			continue
		}
		v, _, err := k.GetStringValue("")
		k.Close()
		if err == nil {
			if _, e := os.Stat(v); e == nil {
				return v, nil
			}
		}
	}
	for _, env := range []string{"ProgramFiles", "ProgramFiles(x86)", "LocalAppData"} {
		if base := os.Getenv(env); base != "" {
			p := filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe")
			if _, err := os.Stat(p); err == nil {
				return p, nil
			}
		}
	}
	return "", ErrNoChrome
}

// App is the Chrome window being driven.
type App struct {
	openMu  sync.Mutex // one Open at a time: two quick taps must not swap each other's windows
	mu      sync.Mutex
	cancels atomic.Uint64 // bumped by every external Close (not Open's own); an Open that sees it change was cancelled (Home pressed while opening)
	hwnd    uintptr
	mon     winsys.Monitor
	ptr     *Pointer
	// spatial is true when this launch started Chrome, so
	// --enable-spatial-navigation took effect and arrows move between tiles.
	// A Chrome that was already running ignores new flags: the d-pad then uses Tab.
	spatial bool
	// Guard state (guard.go): checks in a row with a title bar, last fix, pause after a manual F11.
	capN      int
	lastFix   time.Time
	holdUntil time.Time
	// what the log needs when the window goes (Alive keeps lastTitle fresh)
	url       string
	lastTitle string
	opened    time.Time
	gen       atomic.Uint64 // bumped by BeginOpen: only the newest open may write app state
}

// BeginOpen starts a new open: it cancels an Open still waiting for its window (without
// closing anything) and returns this open's generation. Only IsLatest(gen) may touch state.
func (a *App) BeginOpen() uint64 {
	a.cancels.Add(1)
	return a.gen.Add(1)
}

// IsLatest says whether gen is the newest open.
func (a *App) IsLatest(gen uint64) bool { return a.gen.Load() == gen }

// URL is the address the window was last opened on (a reopen goes there).
func (a *App) URL() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.url
}

// New returns an App with no window yet.
func New() *App { return &App{} }

// ErrCancelled: Close was called while Open was waiting for the window; the window is closed again.
var ErrCancelled = errors.New("open cancelled")

// Open starts a Chrome --app window for url on the monitor and waits for it.
func (a *App) Open(url string, mon winsys.Monitor) error {
	gen := a.cancels.Load() // on entry: a Close after this, even while queued on openMu, cancels this Open
	exe, err := chromePath()
	if err != nil {
		return err
	}
	a.openMu.Lock()
	defer a.openMu.Unlock()
	if a.cancels.Load() != gen {
		return ErrCancelled
	}
	old := a.closeWindow()
	CloseChromeOn(mon, true, true) // a window from before a restart, or one still closing: never two players
	if !a.waitOldGone(old, gen) {
		return ErrCancelled
	}
	before := winsys.TopWindows(chromeClass)
	beforePIDs := map[uint32]bool{}
	for _, w := range before {
		beforePIDs[w.PID] = true
	}
	spatial := !chromeRunning()
	args := []string{
		"--enable-spatial-navigation",
		"--app=" + url,
		fmt.Sprintf("--window-position=%d,%d", mon.X, mon.Y),
		fmt.Sprintf("--window-size=%d,%d", mon.W, mon.H),
		"--autoplay-policy=no-user-gesture-required",
	}
	cmd := exec.Command(exe, args...)
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }() // a running Chrome hands the launch over and exits at once
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(250 * time.Millisecond)
		nw := pickNew(winsys.NewWindows(before, winsys.TopWindows(chromeClass)), url, time.Until(deadline) < 15*time.Second, beforePIDs)
		if a.cancels.Load() != gen { // checked every pass: Home frees openMu at once
			if len(nw) > 0 {
				winsys.CloseWindow(nw[0].HWND)
			}
			return ErrCancelled
		}
		if len(nw) > 0 {
			a.mu.Lock()
			a.hwnd, a.mon, a.spatial = nw[0].HWND, mon, spatial
			a.capN, a.lastFix, a.holdUntil = 0, time.Time{}, time.Time{}
			a.url, a.lastTitle, a.opened = url, nw[0].Title, time.Now()
			a.ptr = newPointer(mon)
			a.mu.Unlock()
			time.Sleep(400 * time.Millisecond)
			winsys.PlaceWindow(nw[0].HWND, mon.X, mon.Y, mon.W, mon.H)
			// above the TV's launcher window (itself kept above the taskbar) and the taskbar
			winsys.SetTopmost(nw[0].HWND, true)
			winsys.ForceForeground(nw[0].HWND)
			// F11 on this window only: --start-fullscreen would put every Chrome window Dev
			// opens afterwards in full screen too, for as long as that Chrome runs.
			for i := 0; i < 2 && hasCaption(nw[0].HWND); i++ {
				time.Sleep(500 * time.Millisecond)
				if winsys.Foreground() == nw[0].HWND {
					pressF11IfCaption(nw[0].HWND)
				}
				time.Sleep(700 * time.Millisecond)
			}
			log.Printf("extapp: window %x on monitor %d,%d %dx%d fullscreen=%v spatial=%v", nw[0].HWND, mon.X, mon.Y, mon.W, mon.H, !winsys.HasCaption(nw[0].HWND), spatial)
			return nil
		}
	}
	return errors.New("Chrome window did not appear")
}

// pickNew keeps the new window that is this page: a window Dev opens at the same
// moment (or a Chrome popup) must never become the TV's Netflix window, or Home
// would close the wrong one and keys would land in it. Its title names the site
// ("Netflix"). After five seconds a window without the site word is taken only when
// its process was not running before the launch (a cold Chrome start): a Chrome that
// was already running owns every window, so there the title must match.
func pickNew(nw []winsys.Win, url string, late bool, knownPIDs map[uint32]bool) []winsys.Win {
	words := siteWords(url)
	for _, w := range nw {
		t := strings.ToLower(w.Title)
		for _, word := range words {
			if word != "" && strings.Contains(t, word) {
				return []winsys.Win{w}
			}
		}
	}
	if late {
		for _, w := range nw {
			if !knownPIDs[w.PID] {
				return []winsys.Win{w}
			}
		}
	}
	return nil
}

// siteWords are the words a window's title may carry for a site: its name in the address,
// and the name the page gives itself (Prime Video's title says "Prime Video", never
// "primevideo").
func siteWords(u string) []string {
	w := siteWord(u)
	switch w {
	case "primevideo", "amazon":
		return []string{w, "prime video"}
	}
	return []string{w}
}

// siteWord is the site's name in an address: "netflix" for https://www.netflix.com/...
func siteWord(u string) string {
	u = strings.TrimPrefix(strings.TrimPrefix(u, "https://"), "http://")
	h := strings.SplitN(u, "/", 2)[0]
	parts := strings.Split(h, ".")
	if len(parts) < 2 {
		return ""
	}
	return parts[len(parts)-2]
}

// Spatial says whether the arrow keys move between tiles in this window.
func (a *App) Spatial() bool {
	if a == nil {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.hwnd != 0 && a.spatial
}

// Alive says whether the window still exists.
func (a *App) Alive() bool {
	a.mu.Lock()
	h := a.hwnd
	a.mu.Unlock()
	if h == 0 || !winsys.IsWindow(h) {
		return false
	}
	if t := winsys.WindowTitle(h); t != "" { // remembered for the log when the window goes
		a.mu.Lock()
		if a.hwnd == h {
			a.lastTitle = t
		}
		a.mu.Unlock()
	}
	return true
}

// Hung says whether Windows calls the window "not responding".
func (a *App) Hung() bool {
	a.mu.Lock()
	h := a.hwnd
	a.mu.Unlock()
	return h != 0 && winsys.IsWindow(h) && isHung(h)
}

// GoneInfo says what is known about a window that vanished, for the log.
func (a *App) GoneInfo() string {
	a.mu.Lock()
	t, op := a.lastTitle, a.opened
	a.mu.Unlock()
	life := "unknown"
	if !op.IsZero() {
		life = time.Since(op).Round(time.Second).String()
	}
	return fmt.Sprintf("last title %q, open for %s, chrome still running=%v", t, life, chromeRunning())
}

// Reload presses F5 in the window, once Windows has put it in front. It never sends a key
// while another window has the keyboard, and never forces a hung window to the front.
func (a *App) Reload() error {
	a.mu.Lock()
	h, mon := a.hwnd, a.mon
	a.mu.Unlock()
	if h == 0 || !winsys.IsWindow(h) {
		return errors.New("no window")
	}
	if deskBusy(mon) {
		return errors.New("desk in use")
	}
	if winsys.Foreground() != h {
		if isHung(h) || !winsys.ForceForeground(h) {
			return errors.New("window is not in front")
		}
	}
	return winsys.KeyTap(vkF5, false)
}

// Title is the window's current title (tests read the page's reports from it).
func (a *App) Title() string {
	a.mu.Lock()
	h := a.hwnd
	a.mu.Unlock()
	return winsys.WindowTitle(h)
}

// chromePath finds Chrome; tests replace it.
var chromePath = FindChrome

// UseChromeForTest makes Open launch the program f names instead of Chrome; it returns the undo.
func UseChromeForTest(f func() (string, error)) func() {
	old := chromePath
	chromePath = f
	return func() { chromePath = old }
}

// Close closes only our window and cancels any Open that is waiting or queued.
func (a *App) Close() {
	a.cancels.Add(1)
	a.closeWindow()
}

// closeWindow closes our window without cancelling anything (Open's own use).
func (a *App) closeWindow() uintptr {
	a.mu.Lock()
	h, p := a.hwnd, a.ptr
	a.hwnd, a.ptr = 0, nil
	a.mu.Unlock()
	if p != nil {
		p.stop()
	}
	if h != 0 && winsys.IsWindow(h) {
		winsys.CloseWindow(h)
		go func() { // a page may hold the close up once (a dialog): ask again, never force
			time.Sleep(2 * time.Second)
			if winsys.IsWindow(h) {
				log.Printf("extapp: window %x still open after close; asking again", h)
				winsys.CloseWindow(h)
			}
		}()
	}
	return h
}

// waitOldGone gives a window that was asked to close up to 5 s to go, then asks once more
// (WM_CLOSE only: it is Dev's own Chrome, never killed). It says false when Close cancelled the open.
func (a *App) waitOldGone(old uintptr, gen uint64) bool {
	if old == 0 || testing.Testing() || !winsys.IsWindow(old) {
		return true
	}
	deadline := time.Now().Add(5 * time.Second)
	for winsys.IsWindow(old) && time.Now().Before(deadline) {
		time.Sleep(200 * time.Millisecond)
		if a.cancels.Load() != gen {
			return false
		}
	}
	if winsys.IsWindow(old) {
		log.Printf("extapp: old window %x (%q) still open 5 s after close; asking again (hung=%v)", old, winsys.WindowTitle(old), isHung(old))
		winsys.CloseWindow(old)
		time.Sleep(time.Second)
	}
	return true
}

// front makes sure our window has the keyboard before anything is sent; a key
// must never land in another program.
func (a *App) front() error {
	a.mu.Lock()
	h := a.hwnd
	a.mu.Unlock()
	if h == 0 || !winsys.IsWindow(h) {
		log.Printf("extapp: key dropped: no window")
		return errors.New("no window")
	}
	if winsys.Foreground() == h || winsys.ForceForeground(h) {
		return nil
	}
	log.Printf("extapp: key dropped: window is not in front")
	return errors.New("window is not in front")
}

// Key presses a named key in the window.
func (a *App) Key(name string) error {
	vk, ext, ok := KeyFor(name)
	if !ok {
		return fmt.Errorf("unknown key %q", name)
	}
	if err := a.front(); err != nil {
		return err
	}
	return winsys.KeyTap(vk, ext)
}

// Nav moves focus for a d-pad arrow: the arrow itself with spatial
// navigation, else Tab (down, right) or Shift+Tab (up, left).
func (a *App) Nav(dir string) error {
	a.mu.Lock()
	sp := a.spatial
	a.mu.Unlock()
	if sp {
		return a.Key(dir)
	}
	if err := a.front(); err != nil {
		return err
	}
	if dir == "up" || dir == "left" {
		return winsys.KeyCombo([]uint16{vkShift}, vkTab, false)
	}
	return winsys.KeyTap(vkTab, false)
}

// Back is the browser's Back: VK_BROWSER_BACK, which Chrome handles natively
// (also in --app windows). It never falls back to Alt+Left: in a player that Left can land
// without its Alt and rewind 10 seconds.
func (a *App) Back() error { return a.BackWith(false) }

// BackWith is Back. With the Netflix extension present the extension may only
// close a modal (the title stays the same), so a second Back would go too far:
// it sends VK_BROWSER_BACK alone.
func (a *App) BackWith(extension bool) error {
	if err := a.front(); err != nil {
		return err
	}
	a.mu.Lock()
	h := a.hwnd
	a.mu.Unlock()
	before := winsys.WindowTitle(h)
	if err := winsys.KeyTap(vkBrowserBack, true); err != nil {
		return err
	}
	if extension {
		return nil
	}
	for i := 0; i < 10; i++ {
		time.Sleep(50 * time.Millisecond)
		if winsys.WindowTitle(h) != before {
			return nil
		}
	}
	// no Alt+Left: in Netflix's player a Left that loses its Alt rewinds 10 seconds
	return nil
}

// Seek presses Left/Right for a seek in seconds.
func (a *App) Seek(sec float64) error {
	name, n := SeekPresses(sec)
	for i := 0; i < n; i++ {
		if err := a.Key(name); err != nil {
			return err
		}
		time.Sleep(40 * time.Millisecond)
	}
	return nil
}

// Type types text into the focused field.
func (a *App) Type(s string) error {
	if err := a.front(); err != nil {
		return err
	}
	return winsys.TypeText(s)
}

// Click clicks at the pointer (the real cursor).
func (a *App) Click(left bool) error {
	if err := a.front(); err != nil {
		return err
	}
	if p := a.Pointer(); p != nil {
		p.beforeClick()
	}
	return winsys.MouseClick(left)
}

// Scroll scrolls the page under the cursor; dy > 0 scrolls the page down.
func (a *App) Scroll(dy float64) error {
	if err := a.front(); err != nil {
		return err
	}
	return winsys.MouseWheel(int(-dy * 120 / 100))
}

// Pointer returns the laser pointer for this window (nil when closed).
func (a *App) Pointer() *Pointer {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.ptr
}

// chromeRunning says whether any chrome.exe process exists.
func chromeRunning() bool {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return true
	}
	defer windows.CloseHandle(snap)
	var e windows.ProcessEntry32
	e.Size = uint32(unsafe.Sizeof(e))
	for err = windows.Process32First(snap, &e); err == nil; err = windows.Process32Next(snap, &e) {
		if strings.EqualFold(windows.UTF16ToString(e.ExeFile[:]), "chrome.exe") {
			return true
		}
	}
	return false
}

// Raise brings the window to the front (Netflix pressed again while it is open).
func (a *App) Raise() { _ = a.front() }
