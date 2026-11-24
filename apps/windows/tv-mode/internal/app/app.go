package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"tvmode/internal/certs"
	"tvmode/internal/edge"
	"tvmode/internal/extapp"
	"tvmode/internal/input"
	"tvmode/internal/relay"
	"tvmode/internal/services"
	"tvmode/internal/winsys"
)

// Options for the app.
type Options struct {
	WebDir   string
	DryRun   bool
	Windowed bool
	Display  int
	Overlay  string // override overlay.js path (spike); default <web>/overlay/overlay.js
	Profile  string
	Test     bool   // smoke tests: a page URL containing tvmode-app=<id> counts as that service
	Bisect   string // comma list from TVMODE_BISECT: overlay, ext, autoplay, ua, poll (switch pieces off to find what a site dislikes)
	Standby  bool   // start with no Edge and no screen; the phone's Start TV button (or the shortcut) brings TV Mode up
	StartNow bool   // with Standby: bring the TV up at launch (the desktop shortcut), then behave as standby
}

// App is the whole PC side.
type App struct {
	o   Options
	cfg *certs.Config

	lastLauncherScroll time.Time // Scroll on the launcher moves one row at most every 250 ms
	rat                ratchet   // Point on the launcher steps focus instead of drawing a pointer
	leanX, leanY       float64   // last lean sent to the launcher
	glideGen           atomic.Int64
	lastInput          atomic.Int64 // unix ms of the last key, media or pointer frame from the phone
	menuUntil          atomic.Int64 // unix ms: a player menu (subtitles) is open, the pad is a cursor till then
	kickHref           string       // the watch page the play kick is for (poll loop only)
	kickAt             time.Time
	kickDone           bool

	relay *relay.Relay // in-process relay (dev and tests)
	link  *link        // the PC's connection to the relay

	Edge  *edge.Manager
	In    *input.Controller
	hub   *hub
	LanIP string

	deskOnce sync.Once // guards deskS (desk-report limiter state, deskrep.go)
	deskS    *deskState

	mu          sync.Mutex
	st          State
	sleepAt     time.Time
	sleepWarned bool
	cdCancel    context.CancelFunc // non-nil while the 10 s countdown runs
	lastOpen    string             // last service opened (a repeat press within 8 s is ignored)
	opening     string             // service id being opened, until its page shows
	skipPoll    bool               // bisect: do not read the video from the page
	openAt      time.Time
	ld          *launcherData
	nf          nfLive                  // live Netflix playback from the helper extension
	ext         *extapp.App             // Netflix: the Chrome window
	extOn       bool                    // the Chrome window is the current service
	extDeep     string                  // the Chrome window opened straight on a player: where Back goes (it has no page before)
	extSvc      string                  // the service the Chrome window holds (Netflix, Prime or JioHotstar)
	resume      extResume               // a resume waiting for the helper in Chrome (Prime, JioHotstar)
	monsFn      func() []winsys.Monitor // tests: the monitors
	modalURL    string                  // page where the last Back closed a dialog
	modalAt     time.Time

	ctx    context.Context
	cancel context.CancelFunc
	Done   chan struct{}

	// standby sessions (see standby.go)
	sessMu     sync.Mutex
	sessCancel context.CancelFunc
	sessEnd    chan struct{}
	tvState    atomic.Int32
	startCh    chan struct{}
	screenMu   sync.Mutex

	lat      latency
	exitOnce sync.Once
	exited   chan struct{}
}

// New builds an App (does not start anything).
func New(o Options) (*App, error) {
	cfg, err := certs.LoadConfig()
	if err != nil {
		return nil, err
	}
	if o.Overlay == "" {
		o.Overlay = o.WebDir + `\overlay\overlay.js`
	}
	if o.Profile == "" {
		o.Profile = edge.ProfileDir()
	}
	a := &App{o: o, cfg: cfg, hub: newHub(), Done: make(chan struct{}), exited: make(chan struct{}), ext: extapp.New(), startCh: make(chan struct{}, 1)}
	a.LanIP = certs.PrimaryIPv4().String()
	if gw := winsys.GatewayIPv4s(); len(gw) > 0 {
		a.LanIP = gw[0].String()
	}
	a.st = State{T: "state", App: "launcher", ScreenOn: true}
	return a, nil
}

// Token returns the pairing token.
func (a *App) Token() string { return a.cfg.Token }

// RemoteOrigin is where the phone loads the remote from: the public origin in
// config.json ("remote"), or this PC over LAN when none is set (dev only;
// plain HTTP, so no gyro and no home-screen install).
func (a *App) RemoteOrigin() string {
	if o := strings.TrimRight(a.cfg.Remote, "/"); o != "" {
		return o
	}
	if DefaultRemote != "" && !a.o.Test && os.Getenv("TVMODE_PORT") == "" { // settings lost (a bad start): a phone can still reach this
		return DefaultRemote
	}
	return fmt.Sprintf("http://%s:%s", a.LanIP, Port())
}

// DefaultRemote is your own deployed remote (relay/, see INSTALL.md), used when config.json has
// none: a LAN address over plain HTTP may be a VPN's or a virtual switch's.
const DefaultRemote = "" // e.g. "https://tvmode.<your-account>.workers.dev"

// PairURL is what the launcher's QR encodes: the remote page with the token.
func (a *App) PairURL() string {
	return a.RemoteOrigin() + "/remote/#t=" + a.cfg.Token + "&p=" + certs.PCID(a.cfg.RelayKey)
}

// Run starts servers, Edge and loops; it blocks until Exit or ctx ends.
func (a *App) Run(ctx context.Context) error {
	a.ctx, a.cancel = context.WithCancel(ctx)
	if err := a.serve(a.ctx); err != nil {
		return err
	}
	return a.runLoop()
}

// runTV is one TV session: Edge, input and loops. It blocks until the session
// ends (endSession, Exit or ctx) and returns an error only if it never came up.
func (a *App) runTV() error {
	a.sessMu.Lock()
	sctx, scancel := context.WithCancel(a.ctx)
	a.sessCancel = scancel
	a.sessEnd = make(chan struct{})
	end := a.sessEnd
	a.tvState.Store(tvStarting)
	a.sessMu.Unlock()
	defer scancel()

	stopAwake := winsys.KeepAwake()
	defer stopAwake()

	a.mu.Lock()
	a.st.App, a.st.Focus, a.st.Media, a.st.Point, a.st.Countdown, a.st.SleepAt = "launcher", 0, nil, false, nil, nil
	a.sleepAt, a.sleepWarned, a.extOn, a.opening, a.lastOpen = time.Time{}, false, false, "", ""
	a.mu.Unlock()
	if v, m, err := winsys.GetVolume(); err == nil {
		a.mu.Lock()
		a.st.Vol, a.st.Muted = v, m
		a.mu.Unlock()
	} else {
		log.Printf("volume: %v", err)
	}

	a.initLauncherData() // once; the desk may have built it in standby

	// window placement
	mons := winsys.Monitors()
	pos := [2]int{0, 0}
	w, h := 1600, 900
	if a.o.Display >= 0 && a.o.Display < len(mons) {
		m := mons[a.o.Display]
		pos = [2]int{m.X, m.Y}
		if a.o.Windowed {
			pos = [2]int{m.X + 60, m.Y + 60}
		}
	}
	skip := map[string]bool{}
	noMouse := false
	for _, k := range strings.Split(a.o.Bisect, ",") {
		if k = strings.TrimSpace(k); k != "" {
			skip[k] = true
			if k == "poll" {
				a.skipPoll = true
			}
			if k == "mouse" {
				noMouse = true
			}
			log.Printf("bisect: %s is OFF", k)
		}
	}
	a.sessMu.Lock()
	a.Edge = edge.New(edge.Options{
		Skip: skip,
		OnGone: func(why string) {
			log.Printf("edge: %s", why)
			a.closeScreen("edge gone")
		},
		OnNavError: func(u string, err error) {
			log.Printf("navigate %s: %v", u, err)
			a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "Could not reach " + hostOf(u)})
		},
		StartURL:    LocalOrigin() + "/launcher/",
		HomeURL:     LocalOrigin() + "/launcher/",
		AppOrigin:   LocalOrigin(),
		Port:        cdpPort(),
		ProfileDir:  a.o.Profile,
		Windowed:    a.o.Windowed,
		WindowW:     w,
		WindowH:     h,
		PosX:        pos[0],
		PosY:        pos[1],
		OverlayPath: a.o.Overlay,
		FontPath:    filepath.Join(a.o.WebDir, "fonts", "sofia-sans-condensed-latin-700-normal.woff2"),
		TVUserAgent: a.cfg.YouTubeUA,
	})
	a.sessMu.Unlock()
	for {
		err := a.Edge.Start(sctx)
		if err == nil {
			break
		}
		if !errors.Is(err, edge.ErrProfileBusy) {
			a.endSession()
			return err
		}
		// Another Edge window holds TV Mode's profile and will not close. Stay up
		// (the phone can still connect) and keep asking, rather than quitting silently.
		log.Printf("edge: %v", err)
		a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "Close the other Edge window on the PC"})
		select {
		case <-sctx.Done():
			return nil
		case <-a.Done:
			return nil
		case <-time.After(5 * time.Second):
		}
	}
	select { // closed while Edge was starting
	case <-sctx.Done():
		return nil
	default:
	}
	a.In = input.New(sctx, a.Edge, input.Config{
		AimGain: a.cfg.AimGain, PadGain: a.cfg.PadGain,
		InvertYaw: a.cfg.InvertYaw, InvertPit: a.cfg.InvertPit,
	})
	a.In.RefreshViewport()
	a.In.NoMouse = noMouse
	a.In.OnHover = func() { a.hub.broadcastRemotes(map[string]string{"t": "hover"}) }

	go a.lat.run(sctx.Done())
	go a.pollLoop(sctx)
	go a.sleepLoop(sctx)
	go a.tvGuardLoop(sctx)
	a.tvState.Store(tvOn)
	if !a.o.Test && !a.o.Windowed {
		// an Edge left running (or one Windows put elsewhere) may not be full screen on
		// the TV: put it there once the launcher has loaded. No keyboard focus taken.
		go func() { time.Sleep(3 * time.Second); a.placeTV() }()
	}
	if a.o.Standby {
		log.Printf("standby: TV is up")
	}
	a.broadcast()

	select {
	case <-sctx.Done():
	case <-a.Done:
	case <-end:
	}
	return nil
}

// Exit leaves TV mode: closes Edge and ends Run.
// It returns only once Edge has closed (cookies flushed), whoever asked first.
func (a *App) Exit() {
	a.exitOnce.Do(func() {
		log.Printf("exit: turn off")
		close(a.Done)
		a.endSession() // closes Edge (Browser.close) and the Chrome window
		a.ext.Close()
		scoutStop()
		if a.cancel != nil {
			a.cancel()
		}
		close(a.exited)
	})
	<-a.exited
}

// snapshot returns a copy of the state.
func (a *App) snapshot() State {
	s := a.snapshotLocked()
	s.Eps = a.epsKnown(s.App) // outside a.mu: it reads the library
	return s
}

func (a *App) snapshotLocked() State {
	a.mu.Lock()
	defer a.mu.Unlock()
	s := a.st
	if s.Media != nil {
		m := *s.Media
		s.Media = &m
	}
	if s.App == "netflix" || (a.extOn && a.extSvc == s.App) {
		if m, ok := a.nf.get(time.Now()); ok {
			s.Media = &m
		}
	}
	s.PadMode = padMode(s.App, s.Media, a.extDeep != "", a.ext.Spatial() || tvHelperLiveSince(a.openAt)) // a.mu is held: read openAt directly
	if time.Now().UnixMilli() < a.menuUntil.Load() {
		s.PadMode, s.Menu = "cursor", true
	}
	return s
}

// padMode is what the phone's touchpad does on the page on screen (TOUCHPAD-SHAPE.md):
// "player" while a video is up, "focus" (a swipe moves the highlight one card) where
// arrow keys work well, "cursor" (a pointer that snaps to targets) where they do not.
func padMode(app string, m *Media, netflixPlayer, netflixArrows bool) string {
	if m != nil && (m.Dur > 0 || m.Ad) { // a pre-roll has no length yet
		return "player"
	}
	switch app {
	case "netflix":
		if netflixPlayer {
			return "player"
		}
		if netflixArrows {
			return "focus"
		}
		return "cursor"
	case "jiohotstar", "prime":
		return "cursor"
	}
	return "focus"
}

func (a *App) broadcast() {
	if a.standbyNow() { // phones stay on their Start TV screen (a shutdown countdown still shows)
		a.broadcastStandby()
		return
	}
	a.hub.broadcast(a.snapshot())
}

// show calls window.__tv.show(kind, data) on the current page.
func (a *App) show(kind string, data any) {
	if a.Edge == nil {
		return
	}
	b, _ := json.Marshal(data)
	k, _ := json.Marshal(kind)
	go func() {
		_ = a.Edge.Eval(fmt.Sprintf("window.__tv&&window.__tv.show&&window.__tv.show(%s,%s)", k, b), nil)
	}()
}

func (a *App) svc() *services.Service {
	a.mu.Lock()
	id := a.st.App
	a.mu.Unlock()
	if s := services.ByID(id); s != nil {
		return s
	}
	return services.Default
}

// appFor is appFromURL plus the smoke-test hook.
func (a *App) appFor(u string) string {
	if a.o.Test {
		if i := strings.Index(u, "tvmode-app="); i >= 0 {
			id := u[i+len("tvmode-app="):]
			if j := strings.IndexAny(id, "&#"); j >= 0 {
				id = id[:j]
			}
			if services.ByID(id) != nil {
				return id
			}
		}
	}
	return appFromURL(u)
}

func appFromURL(u string) string {
	switch {
	case strings.HasPrefix(u, LocalOrigin()):
		return "launcher"
	case strings.Contains(u, "netflix.com"):
		return "netflix"
	case strings.Contains(u, "youtube.com"):
		return "youtube"
	case strings.Contains(u, "primevideo.com"), strings.Contains(u, "amazon."):
		return "prime"
	case strings.Contains(u, "hotstar.com"):
		return "jiohotstar"
	}
	return ""
}

// pollLoop keeps app + media in state and the viewport fresh.
func (a *App) pollLoop(ctx context.Context) {
	t := time.NewTicker(500 * time.Millisecond)
	defer t.Stop()
	n := 0
	var health extHealth
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		n++
		if a.extActive() {
			a.mu.Lock()
			reopening := a.opening != "" // an episode tap swaps the window: the old one going is not Dev closing it
			a.mu.Unlock()
			if !reopening && !a.ext.Alive() {
				// re-check under the lock: an open that started meanwhile (its goroutine
				// zeroes the window handle) must not be taken for a closed window
				a.mu.Lock()
				gone := a.opening == "" && a.extOn && !a.ext.Alive()
				svc := a.extSvc
				if svc == "" {
					svc = a.st.App
				}
				a.mu.Unlock()
				if gone {
					info := a.ext.GoneInfo()
					if a.ext.Adopt(a.tvMonitor()) { // Chrome recreated the window or it moved: take it over
						log.Printf("ext: the %s window vanished (%s) but another Chrome window on the TV names the site; adopted it", svc, info)
						a.broadcast()
						continue
					}
					log.Printf("ext: the %s window closed outside TV Mode (%s); back to the launcher", svc, info)
					a.closeExternal()
					a.mu.Lock()
					a.st.App, a.st.Media, a.opening, a.lastOpen, a.openAt = "launcher", nil, "", "", time.Time{}
					a.mu.Unlock()
					a.raiseTV()
					a.broadcast()
				}
				continue
			}
			if !reopening && a.tvState.Load() == tvOn && !a.standbyNow() {
				a.mu.Lock()
				svc, open := a.extSvc, a.openAt
				a.mu.Unlock()
				var helperAt time.Time
				if t := tvHelperAt.Load(); t != 0 && time.UnixMilli(t).After(open) {
					helperAt = time.UnixMilli(t)
				}
				helloAt := time.UnixMilli(extHelloAt.Load())
				hung := a.ext.Hung()
				switch health.step(time.Now(), a.ext.Window(), hung, helperAt, helloAt) {
				case healReload:
					log.Printf("ext: %s window needs a nudge (hung=%v, helper last spoke %s); pressing F5", svc, hung, helperAt.Format("15:04:05"))
					if err := a.ext.Reload(); err != nil {
						log.Printf("ext: F5 not sent: %v", err)
					}
				case healReopen:
					if u := a.ext.URL(); u != "" {
						for i, x := range services.Apps {
							if x.ID == svc {
								log.Printf("ext: %s window still dead 15 s after F5; opening %s again", svc, u)
								a.openExternal(i, x, u)
								break
							}
						}
					}
				}
			}
			continue
		}
		var snap struct {
			Href string     `json:"href"`
			M    *Media     `json:"m"`
			W    *watchPage `json:"w"`
			Tx   bool       `json:"tx"`
		}
		const jsTyping = `(function(){var a=document.activeElement;return !!a&&(a.isContentEditable||a.tagName==="TEXTAREA"||a.tagName==="INPUT"&&!/^(button|checkbox|radio|range|submit|reset|hidden|file|color|image)$/i.test(a.type||""))})()`
		expr := `({href:location.href,m:` + services.JSMediaState + `,w:` + services.JSWatch + `,tx:` + jsTyping + `})`
		if a.skipPoll {
			expr = `({href:location.href,m:null})`
		}
		if err := a.Edge.Eval(expr, &snap); err != nil {
			continue
		}
		href, med := snap.Href, snap.M
		changed := false
		a.mu.Lock()
		id := a.appFor(href)
		if a.opening != "" {
			if id == a.opening || time.Since(a.openAt) > 12*time.Second {
				a.opening = ""
			} else if id == "launcher" {
				id = "" // the old page is still up while the new one loads
			}
		}
		if id != "" && id != a.st.App {
			a.st.App = id
			changed = true
		}
		if a.st.App == "launcher" {
			med = nil
		}
		if snap.Tx != a.st.Typing {
			a.st.Typing = snap.Tx
			changed = true
		}
		if (med == nil) != (a.st.Media == nil) || (med != nil && a.st.Media != nil && *med != *a.st.Media) {
			a.st.Media = med
			changed = true
		}
		a.mu.Unlock()
		if med != nil && id != "" && id != "launcher" {
			a.noteWatching(id, snap.W)
		}
		a.kickPlay(id, href)
		if n%6 == 0 && a.In != nil {
			a.In.RefreshViewport()
		}
		if changed {
			a.broadcast()
		}
	}
}

// phoneChanged is called when remote socket count changes.
func (a *App) phoneChanged(count int) {
	on := count > 0
	a.mu.Lock()
	changed := a.st.Phone != on
	a.st.Phone = on
	a.mu.Unlock()
	if changed {
		a.show("phone", map[string]any{"on": on})
		a.broadcast()
		// The launcher shows the QR when no phone is connected, but only before the first
		// pairing: it carries the permanent token, and a paired phone that drops just
		// redials (a new phone joins through Add a phone's one-time link instead).
		a.mu.Lock()
		ever := a.cfg.EverPaired
		a.mu.Unlock()
		if on || ever {
			a.hub.broadcast(map[string]any{"t": "pair", "url": nil})
		} else {
			a.hub.broadcast(map[string]any{"t": "pair", "url": a.PairURL()})
		}
	}
}

// --- navigation ---

func (a *App) openApp(i int) { a.openAppAt(i, "") }

// openAppAt opens service i, at urlOverride when given (a Continue watching entry or a search).
func (a *App) openAppAt(i int, urlOverride string) {
	if i < 0 || i >= len(services.Apps) || a.Edge == nil {
		return
	}
	s := services.Apps[i]
	if a.useExternal(s) {
		a.openExternal(i, s, urlOverride)
		return
	}
	a.closeExternal()
	a.mu.Lock()
	if urlOverride == "" && a.lastOpen == s.ID && time.Since(a.openAt) < 8*time.Second {
		a.mu.Unlock() // already opening this one: a second press must not restart the load
		return
	}
	a.opening, a.lastOpen, a.openAt = s.ID, s.ID, time.Now()
	a.st.App, a.st.Focus, a.st.Media = s.ID, i, nil
	a.mu.Unlock()
	log.Printf("open %s", s.ID)
	// State goes out first, so the phone lights the button and the TV says so
	// before the (possibly slow) page has loaded; Navigate then returns
	// without waiting for the load.
	a.broadcast()
	a.show("opening", map[string]any{"name": s.Name})
	target := urlOverride
	if target == "" {
		target = a.urlFor(s)
	}
	if err := a.Edge.Navigate(target, s.TVUserAgent); err != nil {
		log.Printf("open %s: %v", s.ID, err)
		a.mu.Lock()
		a.opening = ""
		a.mu.Unlock()
		a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "Could not open " + s.Name})
		return
	}
	for _, d := range []time.Duration{2 * time.Second, 6 * time.Second} {
		time.AfterFunc(d, func() {
			if a.In != nil {
				a.In.RefreshViewport()
			}
		})
	}
}

// urlFor is the service URL; smoke tests may point a service at a local page.
func (a *App) urlFor(s *services.Service) string {
	if a.o.Test {
		if v := os.Getenv("TVMODE_TEST_URL_" + strings.ToUpper(s.ID)); v != "" {
			return v
		}
	}
	return s.URL
}

func hostOf(u string) string {
	u = strings.TrimPrefix(strings.TrimPrefix(u, "https://"), "http://")
	if i := strings.IndexAny(u, "/?#"); i >= 0 {
		u = u[:i]
	}
	return u
}

func (a *App) goHome() {
	if a.ld != nil {
		a.settleOpened()
	}
	a.closeExternal()
	if err := a.Edge.Home(); err != nil {
		log.Printf("home: %v", err)
		return
	}
	a.raiseTV()
	a.mu.Lock()
	a.st.App, a.st.Media, a.opening, a.lastOpen = "launcher", nil, "", ""
	a.mu.Unlock()
	a.broadcast()
}

// raiseTV shows the launcher window, even when it was minimised (Home, or Netflix
// closed): restores it, puts it back in full screen and brings it to the front.
func (a *App) raiseTV() {
	a.placeTV()
	// Keyboard focus only when Dev is not using the other screen (below)
	a.focusTV()
}

// tvWindow is the launcher's Edge window (its title starts "TV Mode"), 0 when not found.
func tvWindow() uintptr {
	for _, w := range winsys.TopWindows("Chrome_WidgetWin_1") {
		if strings.HasPrefix(w.Title, "TV Mode") {
			return w.HWND
		}
	}
	return 0
}

// placeTV makes sure the launcher window is full screen on the TV monitor: restored
// when minimised, and moved back when Windows put it on another screen. Positions
// are read and set by Windows in real pixels.
func (a *App) placeTV() {
	m := a.tvMonitor()
	h := tvWindow()
	offTV := false
	if h != 0 && m.W > 0 {
		if x, y, ok := winsys.WindowCenter(h); ok && (x < m.X || x >= m.X+m.W || y < m.Y || y >= m.Y+m.H) {
			offTV = true
			log.Printf("home: TV window was off the TV (centre %d,%d), moving it back", x, y)
		}
	}
	place := func() {
		if h := tvWindow(); h != 0 && m.W > 0 {
			winsys.PlaceWindow(h, m.X+40, m.Y+40, m.W-80, m.H-80)
		}
	}
	if restored, err := a.Edge.Raise(offTV, place); err != nil {
		log.Printf("home: raise: %v", err)
	} else if restored {
		log.Printf("home: TV window was minimised, restored")
	}
	// above the taskbar even while his keyboard is on the desk screen (winsys.SetTopmost)
	winsys.SetTopmost(tvWindow(), true)
}

// focusTV gives the launcher keyboard focus, unless Dev is using the other screen.
func (a *App) focusTV() {
	// Keyboard focus only when Dev is not using the other screen: if the window he is
	// typing in sits off the TV, the TV shows Home without taking his keyboard away.
	// (The launcher takes the phone's presses through Edge, so it needs no focus.)
	if fx, fy, ok := winsys.WindowCenter(winsys.Foreground()); ok {
		m := a.tvMonitor()
		if m.W > 0 && (fx < m.X || fx >= m.X+m.W || fy < m.Y || fy >= m.Y+m.H) {
			log.Printf("home: on the TV, keyboard left with the desktop")
			return
		}
	}
	go func() { // and in front: the title turns to "TV Mode" once the launcher has loaded
		for i := 0; i < 10; i++ {
			for _, w := range winsys.TopWindows("Chrome_WidgetWin_1") {
				if strings.HasPrefix(w.Title, "TV Mode") {
					winsys.ForceForeground(w.HWND)
					return
				}
			}
			time.Sleep(200 * time.Millisecond)
		}
	}()
}

// --- volume ---

func (a *App) volume(act string, set *int) {
	v, m, err := winsys.GetVolume()
	if err != nil {
		a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "Volume is not available"})
		return
	}
	switch {
	case set != nil:
		v = *set
		_ = winsys.SetVolume(v)
		m = false
	case act == "up":
		v += 2
		_ = winsys.SetVolume(v)
		m = false
	case act == "down":
		v -= 2
		_ = winsys.SetVolume(v)
	case act == "mute":
		m = !m
		_ = winsys.SetMute(m)
	}
	if v < 0 {
		v = 0
	}
	if v > 100 {
		v = 100
	}
	a.mu.Lock()
	a.st.Vol, a.st.Muted = v, m
	a.mu.Unlock()
	a.show("vol", map[string]any{"vol": v, "muted": m})
	a.broadcast()
}

// --- media ---

func (a *App) media(act string, secs float64) {
	s := a.svc()
	if s == services.Default {
		if act == "subs" { // the phone's sheet waits for an answer
			a.tracksNote("launcher", "Nothing is playing. Start a video, then tap Subtitles.")
		}
		return
	}
	handled := false
	switch act {
	case "skip":
		var r string
		_ = a.Edge.Eval(services.JSSkip, &r)
		if r != "ok" {
			a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "Nothing to skip right now."})
		}
	case "subsclose": // the phone's Close menu: the menu left open goes, and the pad stops being a cursor
		var r string
		_ = a.Edge.Eval(services.JSMenuClose, &r)
		a.menuUntil.Store(0)
		a.broadcast()
	case "subs":
		if s.ID != "youtube" && a.listTracks(s.ID) { // the picker on the phone; the menu on the TV opened and closed
			return
		}
		var r string
		if s.ID == "youtube" {
			_ = a.Edge.Eval(services.JSYTCaptions, &r)
			log.Printf("youtube: captions %s", r)
			switch r {
			case "on":
				a.tracksNote(s.ID, "Captions on.")
				return
			case "off":
				a.tracksNote(s.ID, "Captions off.")
				return
			case "nocaps":
				a.tracksNote(s.ID, "This video has no captions.")
				return
			default:
				a.tracksNote(s.ID, "Start the video first, then tap Subtitles.")
				return
			}
		} else {
			_ = a.Edge.Eval(services.JSSubtitles, &r)
		}
		if r != "ok" {
			a.tracksNote(s.ID, "No subtitles button on this screen. Start the video first.")
			return
		}
		if s.ID == "youtube" {
			a.tracksNote(s.ID, "Captions turned on or off on YouTube.")
		} else {
			a.tracksNote(s.ID, "The app's own menu is open on the TV. Use the pad to pick, then Close the menu.")
		}
		if s.ID != "youtube" { // a menu opened: the pad is a cursor while he picks
			a.menuUntil.Store(time.Now().Add(20 * time.Second).UnixMilli())
			a.broadcast()
			go func() { time.Sleep(20500 * time.Millisecond); a.broadcast() }()
		}
	case "fullscreen": // every player here takes F for full screen
		a.placeTV() // and the TV window itself goes back to full screen, above the taskbar
		if a.onLauncher() {
			return
		}
		_ = a.In.Keys([]services.Key{{Key: "f", Code: "KeyF", VK: 0x46, Text: "f"}})
	case "playpause":
		if s.ID == "youtube" { // ytlr resumes a <video> paused behind its back: ask its player
			_ = a.Edge.Eval(services.JSYTPlayPause, &handled)
		}
		if !handled {
			_ = a.Edge.Eval(services.JSPlayPause(), &handled)
		}
		if !handled {
			_ = a.In.Keys(s.PlayPause)
		}
	case "seek":
		switch {
		case s.SeekJS != nil:
			_ = a.Edge.Eval(s.SeekJS(secs), &handled)
		case !s.NoVideoSeek:
			_ = a.Edge.Eval(services.JSSeek(secs), &handled)
		}
		if !handled && s.SeekKeys != nil {
			_ = a.In.Keys(s.SeekKeys(secs))
		}
	}
	a.afterMedia(act == "seek")
}

func (a *App) scrub(frac float64) {
	s := a.svc()
	if s == services.Default {
		return
	}
	if frac < 0 {
		frac = 0
	}
	if frac > 1 {
		frac = 1
	}
	handled := false
	switch {
	case s.ScrubJS != nil:
		_ = a.Edge.Eval(s.ScrubJS(frac), &handled)
	case !s.NoVideoSeek:
		_ = a.Edge.Eval(services.JSScrub(frac), &handled)
	}
	if !handled {
		a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "Scrubbing does not work here. Use the seek buttons."})
		return
	}
	a.afterMedia(true)
}

// afterMedia refreshes the media block and shows the seek overlay.
func (a *App) afterMedia(showSeek bool) {
	go func() {
		time.Sleep(150 * time.Millisecond)
		var med *Media
		_ = a.Edge.Eval(services.JSMediaState, &med)
		a.mu.Lock()
		a.st.Media = med
		a.mu.Unlock()
		if showSeek && med != nil {
			a.show("seek", map[string]any{"pos": med.Pos, "dur": med.Dur})
		}
		a.broadcast()
	}()
}

// --- power ---

func (a *App) armShutdown() {
	a.mu.Lock()
	if a.cdCancel != nil {
		a.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(a.ctx)
	a.cdCancel = cancel
	a.mu.Unlock()
	go func() {
		for s := 10; s > 0; s-- {
			a.mu.Lock()
			v := s
			a.st.Countdown = &v
			a.mu.Unlock()
			a.show("countdown", map[string]any{"s": s})
			a.broadcast()
			select {
			case <-ctx.Done():
				a.mu.Lock()
				a.st.Countdown, a.cdCancel = nil, nil
				a.mu.Unlock()
				a.show("cancelled", map[string]any{"what": "shutdown"})
				a.broadcast()
				return
			case <-time.After(time.Second):
			}
		}
		a.mu.Lock()
		a.st.Countdown, a.cdCancel = nil, nil
		a.mu.Unlock()
		a.broadcast()
		if err := winsys.Shutdown(a.o.DryRun); err != nil {
			log.Printf("shutdown: %v", err)
		}
		if a.o.DryRun {
			a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "Dry run: the PC would shut down now"})
		}
	}()
}

func (a *App) cancelPower() {
	a.mu.Lock()
	c := a.cdCancel
	hadSleep := !a.sleepAt.IsZero()
	a.mu.Unlock()
	if c != nil {
		c()
		return
	}
	if hadSleep {
		a.setSleep(0)
	}
}

func (a *App) setSleep(min int) {
	a.mu.Lock()
	if min <= 0 {
		a.sleepAt, a.st.SleepAt, a.sleepWarned = time.Time{}, nil, false
		a.mu.Unlock()
		a.show("cancelled", map[string]any{"what": "sleep"})
		a.broadcast()
		return
	}
	a.sleepAt = time.Now().Add(time.Duration(min) * time.Minute)
	ms := a.sleepAt.UnixMilli()
	a.st.SleepAt = &ms
	a.sleepWarned = false
	a.mu.Unlock()
	a.show("sleep", map[string]any{"minLeft": min})
	a.broadcast()
}

func (a *App) sleepLoop(ctx context.Context) {
	t := time.NewTicker(time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		a.mu.Lock()
		if a.sleepAt.IsZero() {
			a.mu.Unlock()
			continue
		}
		left := time.Until(a.sleepAt)
		warn := left <= time.Minute && !a.sleepWarned
		if warn {
			a.sleepWarned = true
		}
		fire := left <= 0
		if fire {
			a.sleepAt, a.st.SleepAt = time.Time{}, nil
		}
		a.mu.Unlock()
		if warn {
			a.show("sleep", map[string]any{"minLeft": 1})
		}
		if fire {
			a.broadcast()
			a.armShutdown()
		}
	}
}

// --- message handlers ---

type msg struct {
	T   string          `json:"t"`
	K   string          `json:"k"`
	A   string          `json:"a"`
	S   json.RawMessage `json:"s"`
	To  float64         `json:"to"`
	Set *int            `json:"set"`
	Dx  float64         `json:"dx"`
	Dy  float64         `json:"dy"`
	B   string          `json:"b"`
	On  bool            `json:"on"`
	Yaw float64         `json:"yaw"`
	Pit float64         `json:"pitch"`
	Ts  float64         `json:"ts"`  // aim: the phone's sensor time, ms (speed is measured on it, not on arrival)
	Abs int             `json:"abs"` // 1: aim carries absolute angles since Point was pressed (laser pointer)
	Q   int             `json:"q"`   // aim sequence number within one Point press
	Min int             `json:"min"`
	I   int             `json:"i"`
	ID  string          `json:"id"`
	Key string          `json:"key"` // launcher item key
	Se  int             `json:"se"`  // openitem: season and episode to land on (0: the next one to watch)
	Ep  int             `json:"ep"`
	Why string          `json:"why"` // why Point was released: up, cancel, lost, hidden, blur
	V   float64         `json:"v"`   // fling velocity, px/s
	// point session stats and calibration
	Path string  `json:"path"`
	N    int     `json:"n"`
	Ms   float64 `json:"ms"`
	Span float64 `json:"span"`
}

// glide takes n focus steps, the first at once and the rest 55 ms apart, so a
// flick reads as one gliding motion; a newer step cancels a glide in flight.
func (a *App) glide(dir string, n int) {
	gen := a.glideGen.Add(1)
	a.arrow(dir)
	if n <= 1 {
		return
	}
	go func() {
		for i := 1; i < n; i++ {
			time.Sleep(55 * time.Millisecond)
			if a.glideGen.Load() != gen {
				return
			}
			a.arrow(dir)
		}
	}()
}

// sendLean tells the launcher how far to lean the focused card toward the next Point step.
func (a *App) sendLean(x, y float64) {
	if x == a.leanX && y == a.leanY {
		return
	}
	a.leanX, a.leanY = x, y
	a.hub.broadcastScreens(map[string]any{"t": "lean", "x": x, "y": y})
}

func (a *App) onLauncher() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.st.App == "launcher"
}

// snapFocus lights the tile nearest the (undrawn) pointer on the launcher.
func (a *App) snapFocus() {
	i := int(a.In.Frac() * float64(len(services.Apps)))
	i = max(0, min(len(services.Apps)-1, i))
	a.mu.Lock()
	changed := a.st.Focus != i
	a.st.Focus = i
	a.mu.Unlock()
	if changed {
		a.broadcast()
	}
}

// Calibration lamps sit at these fractions of the screen width.
const calibL, calibR = 0.1, 0.9

// calibrate runs the phone's two-lamp aim calibration. "start" and "step"
// light a lamp on the TV; "done" carries the raw yaw swept between the
// lamps (radians, + = turning right) and sets the gain from it.
func (a *App) calibrate(m msg) {
	switch m.A {
	case "start", "step":
		a.calibLamp(m.I)
	case "cancel":
		a.calibLamp(-1)
	case "done":
		a.calibLamp(-1)
		span := math.Abs(m.Span)
		if span < 2*math.Pi/180 { // under 2 degrees: a mis-tap, keep the old setting
			a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "Calibration missed. Try again, aiming at each lamp."})
			return
		}
		w, _ := a.Edge.Viewport()
		gain := (calibR - calibL) * float64(w) / span
		gain = max(900, min(6000, gain))
		a.mu.Lock()
		a.cfg.AimGain = gain
		a.cfg.InvertYaw = m.Span < 0
		cfg := *a.cfg
		a.mu.Unlock()
		a.In.SetAim(gain, cfg.InvertYaw)
		if err := certs.SaveConfig(&cfg); err != nil {
			log.Printf("calib save: %v", err)
		}
		log.Printf("calib: span %.1f deg, gain %.0f px/rad, invertYaw %v", span*180/math.Pi, gain, cfg.InvertYaw)
		a.hub.broadcastRemotes(map[string]any{"t": "calib", "ok": true})
	}
}

// calibLamp shows lamp i (0 = left, 1 = right) on the TV, or none for -1.
func (a *App) calibLamp(i int) {
	if a.Edge == nil {
		return
	}
	go func() { _ = a.Edge.Eval(fmt.Sprintf("window.__tv&&window.__tv.calib&&window.__tv.calib(%d)", i), nil) }()
}

func (a *App) handleRemote(c *client, raw []byte) {
	var m msg
	// "i" is a number for most frames but an invite code (a string) for pairtv and invite
	var ute *json.UnmarshalTypeError
	if err := json.Unmarshal(raw, &m); err != nil && !(errors.As(err, &ute) && ute.Field == "i") {
		log.Printf("remote: bad frame: %v", err)
		return
	}
	if m.T == "key" || m.T == "media" || m.T == "textkey" {
		a.lastInput.Store(time.Now().UnixMilli())
	}
	if a.ld != nil && ((m.T == "key" && (m.K == "back" || m.K == "home")) || m.T == "open") {
		a.ld.lastNav.Store(time.Now().UnixMilli()) // what ends a slow hotstarGo/primeGo walk (volume and arrows do not)
	}
	if m.T == "ping" {
		b, _ := json.Marshal(map[string]string{"t": "pong"})
		select {
		case c.send <- b:
		default:
		}
		return
	}
	// the library does not need the TV: a share is saved, and a saved item can be played, in standby too
	switch m.T {
	case "pairtv": // Add a phone: the QR on the TV, or take it down
		if m.A == "hide" {
			a.hidePairOnTV(0)
		} else {
			a.showPairOnTV(c, raw)
		}
		return
	case "invite": // a one-time link for another phone
		if m.A == "cancel" {
			a.cancelInvite(raw)
		} else {
			a.sendInvite(c)
		}
		return
	case "save":
		go a.libShare(c, raw)
		return
	case "mood": // phase 5: Light, Gripping, Comfort (d5mood.go); no TV needed
		go a.d5Mood(c, raw)
		return
	case "openitem":
		if m.K == "lib" && a.standbyNow() {
			go a.libPlayWhenUp(m.Key, m.A, m.Se, m.Ep)
			return
		}
	}
	if m.T == "key" && (m.K == "back" || m.K == "home") && a.hidePairOnTV(0) { // the Add a phone QR goes first
		return
	}
	if a.standbyGate(m.T, m.A) {
		return
	}
	if a.In == nil {
		return
	}
	a.In.SetHidden(a.onLauncher())
	// on the launcher, Play/Pause and Back belong to the page (open the service directly / close the panel)
	if a.onLauncher() {
		if m.T == "key" && m.K == "ok" {
			a.rat.freeze(time.Now().Add(200 * time.Millisecond)) // pressing OK jolts the phone
		}
		if m.T == "media" && m.A == "playpause" {
			a.hub.broadcastScreens(map[string]string{"t": "cmd", "a": "play"})
			return
		}
		if m.T == "key" && m.K == "back" {
			a.hub.broadcastScreens(map[string]string{"t": "cmd", "a": "back"})
			return
		}
		if m.T == "key" && m.K == "search" { // phone's Search button: {"t":"key","k":"search"} opens search on the TV
			a.hub.broadcastScreens(map[string]string{"t": "cmd", "a": "search"})
			return
		}
		// the launcher has no page scroll (rows are pinned to the focus): Scroll moves a row
		if m.T == "scroll" && m.Dy != 0 {
			if time.Since(a.lastLauncherScroll) >= 250*time.Millisecond {
				a.lastLauncherScroll = time.Now()
				a.In.EndPointer()
				if m.Dy > 0 {
					a.arrow("down")
				} else {
					a.arrow("up")
				}
			}
			return
		}
	}
	if m.T == "media" || m.T == "eps" || m.T == "openitem" { // what the player sheet asked for, to see where it goes
		_, live := a.nf.get(time.Now())
		log.Printf("phone: %s %s %s (app %s, netflix window %v, helper live %v)", m.T, m.A, string(m.S), a.snapshot().App, a.extActive(), live)
		// a Chrome window with no helper in it: nothing on the page can take the press;
		// say so instead of failing quietly (most often the helper needs a reload in Chrome)
		if !live && a.extActive() && (m.T == "eps" || m.A == "subs") {
			if sv := a.svc(); sv.ID != "netflix" && time.Since(a.extOpenedAt()) > 8*time.Second {
				a.tracksNote(sv.ID, sv.Name+" controls are limited: TV Mode Helper isn't running in Chrome on the PC.")
				return
			}
		}
	}
	if a.extActive() && a.handleExternal(m) {
		return
	}
	switch m.T {
	case "key":
		switch m.K {
		case "home":
			a.goHome()
		case "back":
			a.In.EndPointer()
			a.back()
		case "ok":
			a.pressOK()
		case "up", "down", "left", "right":
			a.In.EndPointer()
			a.arrow(m.K)
		}
	case "open":
		a.openApp(m.I)
	case "recenter":
		a.In.Recenter()
		if a.onLauncher() { // Point steps focus here: re-centre means "count from where the phone is now"
			a.rat.reset()
			a.sendLean(0, 0)
		}
	case "fling":
		a.In.Fling(m.V)
	case "media":
		var secs float64
		if m.A == "seek" {
			_ = json.Unmarshal(m.S, &secs)
		}
		if m.A == "speed" {
			var r float64
			if json.Unmarshal(m.S, &r) == nil && validRate(r) {
				var ok bool
				_ = a.Edge.Eval(speedJS(r), &ok)
			}
			return
		}
		if m.A == "track" {
			var t trackPick
			_ = json.Unmarshal(m.S, &t)
			a.setTrack(t)
			return
		}
		a.media(m.A, secs)
	case "scrub":
		a.scrub(m.To)
	case "vol":
		a.volume(m.A, m.Set)
	case "pad":
		a.In.Pad(m.Dx, m.Dy)
	case "tap":
		_ = a.In.Tap(m.B)
	case "scroll":
		_ = a.In.Scroll(m.Dy)
	case "point":
		a.rat.reset()
		if m.On && a.Edge != nil {
			w, _ := a.Edge.Viewport()
			a.mu.Lock()
			g := a.cfg.AimGain
			a.mu.Unlock()
			a.rat.size(g, w)
		}
		a.sendLean(0, 0)
		a.In.Point(m.On)
		a.mu.Lock()
		a.st.Point = m.On
		a.mu.Unlock()
		a.broadcast()
		if !m.On && m.Path != "" {
			log.Printf("point: %s, %d aim msgs, %.0f ms apart, released by %q", m.Path, m.N, m.Ms, m.Why)
		}
	case "aim":
		if m.Abs == 1 && a.onLauncher() {
			a.mu.Lock()
			iy, ip := a.cfg.InvertYaw, a.cfg.InvertPit
			a.mu.Unlock()
			yaw, pit := m.Yaw, m.Pit
			if iy {
				yaw = -yaw
			}
			if ip {
				pit = -pit
			}
			if dir, n := a.rat.step(yaw, pit, time.Now(), m.Ts); n > 0 {
				a.glide(dir, n)
				a.hub.broadcastRemotes(map[string]any{"t": "tick", "n": n})
			}
			a.sendLean(a.rat.lean(yaw, pit))
			return
		}
		if m.Abs == 1 {
			a.In.AimAbs(m.Q, m.Yaw, m.Pit)
		} else {
			a.In.Aim(m.Yaw, m.Pit) // an old cached remote still sends deltas
		}
		if a.onLauncher() {
			a.snapFocus()
		}
	case "calib":
		a.calibrate(m)
	case "text":
		var s string
		if json.Unmarshal(m.S, &s) == nil && s != "" {
			_ = a.In.Text(s)
		}
	case "textkey":
		switch m.K {
		case "backspace":
			_ = a.In.Keys([]services.Key{services.Backspace})
		case "enter":
			_ = a.In.Keys([]services.Key{services.Enter})
		}
	case "power":
		switch m.A {
		case "arm":
			a.armShutdown()
		case "cancel":
			a.cancelPower()
		}
	case "sleep":
		a.setSleep(m.Min)
	case "screen":
		go a.setScreen(m.On)
	case "exit":
		go a.exitRequest(m.A)
	case "eps": // the phone's Episodes tab: season I of what is playing (0: the current one)
		go a.sendEpisodes(m.I)
	case "openitem": // the phone's Episodes tab: play this one
		go a.openItem(m.K, m.Key, m.I, m.A, m.Se, m.Ep)
	}
}

func (a *App) handleScreen(raw []byte) {
	var m msg
	if err := json.Unmarshal(raw, &m); err != nil {
		return
	}
	switch m.T {
	case "focus":
		a.mu.Lock()
		a.st.Focus = m.I
		a.mu.Unlock()
		a.broadcast()
	case "open":
		a.openApp(m.I)
	case "openitem":
		a.openItem(m.K, m.Key, m.I, m.A, m.Se, m.Ep)
	case "more":
		go a.moreRow(m.Key, m.I)
	case "sig":
		go a.signal(m.Key, m.K, m.A)
	case "exit":
		log.Printf("exit: ignored Esc from the launcher page (quit is the phone's Turn off)")
	}
}

// markPaired remembers that a phone has connected, so the QR stops showing.
func (a *App) markPaired() {
	a.mu.Lock()
	first := !a.cfg.EverPaired
	a.cfg.EverPaired = true
	a.mu.Unlock()
	if first {
		_ = certs.SaveConfig(a.cfg)
		a.hub.broadcast(map[string]any{"t": "pair", "url": nil})
	}
}

// Port is the TV Mode HTTP port: 8770, or TVMODE_PORT (the smoke test uses
// spare ports so it can run beside a live TV Mode).
func Port() string {
	if p := os.Getenv("TVMODE_PORT"); p != "" {
		return p
	}
	return "8770"
}

// LocalOrigin is this PC's own address for TV Mode.
func LocalOrigin() string { return "http://127.0.0.1:" + Port() }

func cdpPort() int {
	if p, err := strconv.Atoi(os.Getenv("TVMODE_CDP")); err == nil && p > 0 {
		return p
	}
	return 0
}

// kickJS presses play on a watch page's main video that loaded and sits paused near
// the start (JioHotstar often waits for a click that a TV remote never makes).
const kickJS = `(function(){var v=[].slice.call(document.querySelectorAll("video")).filter(function(v){return v.duration>120&&isFinite(v.duration)}).sort(function(a,b){return b.duration-a.duration})[0];
if(!v||v.readyState<3)return "wait";if(!v.paused)return "playing";if(v.currentTime>30)return "later";var p=v.play();if(p&&p.catch)p.catch(function(){});return "kicked"})()`

// kickPlay starts a watch page that did not start by itself: once per page, in its
// first 20 seconds, and never after a press on the remote (a pause of his own stays).
func (a *App) kickPlay(id, href string) {
	if id != "jiohotstar" && id != "prime" {
		a.kickHref = ""
		return
	}
	if !strings.Contains(href, "/watch") && !strings.Contains(href, "autoplay=1") {
		a.kickHref = ""
		return
	}
	if href != a.kickHref {
		a.kickHref, a.kickAt, a.kickDone = href, time.Now(), false
	}
	a.mu.Lock()
	opening := a.opening != ""
	a.mu.Unlock()
	if opening || a.kickDone || time.Since(a.kickAt) > 20*time.Second || time.Since(a.kickAt) < 3*time.Second {
		return
	}
	if a.lastInput.Load() > a.kickAt.UnixMilli() {
		a.kickDone = true // he is driving: leave it to him
		return
	}
	var r string
	if a.Edge.Eval(kickJS, &r) != nil {
		return
	}
	switch r {
	case "kicked":
		a.kickDone = true
		log.Printf("play kick: %s", id)
	case "playing", "later":
		a.kickDone = true
	}
}
