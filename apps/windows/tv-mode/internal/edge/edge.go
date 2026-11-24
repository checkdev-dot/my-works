// Package edge launches Microsoft Edge, drives it over the DevTools protocol,
// injects the overlay into every page target, and relaunches Edge if it dies.
package edge

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/chromedp/cdproto/browser"
	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/cdproto/target"
	"github.com/chromedp/chromedp"
)

const (
	EdgePath = `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
	// DefaultTVUA is a Cobalt (YouTube TV runtime) user agent.
	DefaultTVUA = "Mozilla/5.0 (Linux armv7l) Cobalt/22.lts.4.307178-gold (unlike Gecko) v8/8.8.278.8-jit gles Starboard/13"
)

// Options configure the manager.
type Options struct {
	Port             int    // CDP port, 9333
	AppOrigin        string // http://127.0.0.1:8770 (default)
	StartURL         string // --app URL, http://127.0.0.1:8770/
	ProfileDir       string // --user-data-dir
	Windowed         bool
	WindowW          int
	WindowH          int
	PosX, PosY       int    // window position (display origin)
	OverlayPath      string // file read on every attach and injected
	FontPath         string // woff2 bytes handed to the overlay as window.__tvFont (base64)
	HomeURL          string
	TVUserAgent      string
	OnTargetsChanged func()
	// OnNavError is called when a navigation fails for a real reason (DNS,
	// refused, certificate), never for a slow load.
	OnNavError func(url string, err error)
	// OnGone is called (once, from the watchdog) when Edge is gone and must NOT
	// be relaunched: the user closed its window (clean exit), or it died again
	// within 10 s of the last launch. The app treats it as "Close TV screen".
	OnGone func(reason string)
	// Skip switches pieces off to bisect a site problem (see Bisect in app.Options):
	// "overlay", "ext" (extension flags), "autoplay", "ua", "fullscreen", "app".
	Skip map[string]bool
}

// Manager owns Edge and the set of page targets.
type Manager struct {
	o Options

	mu      sync.Mutex
	rootCtx context.Context
	cancel  context.CancelFunc
	cmd     *exec.Cmd
	targets map[string]*tgt // by target id
	order   []string        // creation order; last is current
	main    string          // the --app window's target
	stopped bool
	vw, vh  int
	done    chan struct{} // closed when the launched Edge process exits
	// launchedAt is when Edge was last launched (watchdog: a second death within 10 s is not retried)
	launchedAt time.Time

	uaSet bool // a user-agent override is active on the main target

	navMu     sync.Mutex
	navCancel context.CancelFunc // the in-flight navigation, replaced by a newer one
}

type tgt struct {
	id     string
	ctx    context.Context
	url    string // last URL seen in the target list
	injURL string // last URL we re-injected the overlay into
}

// New creates a manager.
func New(o Options) *Manager {
	if o.Port == 0 {
		o.Port = 9333
	}
	if o.TVUserAgent == "" {
		o.TVUserAgent = DefaultTVUA
	}
	return &Manager{o: o, targets: map[string]*tgt{}, vw: 1920, vh: 1080}
}

func (m *Manager) base() string { return fmt.Sprintf("http://127.0.0.1:%d", m.o.Port) }

func (m *Manager) args() []string {
	a := []string{
		fmt.Sprintf("--remote-debugging-port=%d", m.o.Port),
		"--user-data-dir=" + m.o.ProfileDir,
		"--no-first-run", "--no-default-browser-check", "--disable-sync", "--no-service-autorun",
		"--disable-features=Translate,msEdgeSidebarV2,msEdgeSidebar",
		"--disable-session-crashed-bubble", "--hide-crash-restore-bubble",
		fmt.Sprintf("--window-position=%d,%d", m.o.PosX, m.o.PosY),
	}
	if !m.o.Skip["ext"] {
		// Extensions stay off. (Edge 156 ignores --load-extension, so the Prime skipper
		// is injected through CDP instead: see primeSkipSource.)
		a = append(a, "--disable-extensions", "--disable-component-extensions-with-background-pages")
	}
	if !m.o.Skip["autoplay"] {
		a = append(a, "--autoplay-policy=no-user-gesture-required")
	}
	if m.o.Windowed {
		a = append(a, fmt.Sprintf("--window-size=%d,%d", m.o.WindowW, m.o.WindowH))
	} else if !m.o.Skip["fullscreen"] {
		a = append(a, "--start-fullscreen")
	}
	if m.o.Skip["app"] {
		return append(a, m.o.StartURL)
	}
	return append(a, "--app="+m.o.StartURL)
}

// primeSkipDir returns the absolute path of extensions\prime-skip next to the
// exe (or the working directory), or "" when it is not there.
func primeSkipDir() string {
	var bases []string
	if exe, err := os.Executable(); err == nil {
		bases = append(bases, filepath.Dir(exe))
	}
	if wd, err := os.Getwd(); err == nil {
		bases = append(bases, wd)
	}
	for _, b := range bases {
		d := filepath.Join(b, "extensions", "prime-skip")
		if _, err := os.Stat(filepath.Join(d, "manifest.json")); err == nil {
			return d
		}
	}
	return ""
}

// primeSkipSource wraps extensionsprime-skipcontent.js so it runs only on
// primevideo.com or amazon.* pages (the script itself also checks /gp/video on
// amazon), once the document element exists. "" when the file is not there.
func primeSkipSource() string {
	dir := primeSkipDir()
	if dir == "" {
		return ""
	}
	b, err := os.ReadFile(filepath.Join(dir, "content.js"))
	if err != nil {
		return ""
	}
	// Prime in Edge picks hardware PlayReady, which fails on this TV's display path
	// ("Video Unavailable"). Hiding PlayReady makes Prime use Widevine, as it does in Chrome.
	return `(function(){if(!/(^|\.)(primevideo\.com|amazon\.[a-z.]+)$/.test(location.hostname))return;
try{var rq=navigator.requestMediaKeySystemAccess&&navigator.requestMediaKeySystemAccess.bind(navigator);
if(rq)navigator.requestMediaKeySystemAccess=function(ks,c){if(/playready/i.test(String(ks)))return Promise.reject(new DOMException("Unsupported keySystem","NotSupportedError"));return rq(ks,c);};}catch(e){}
if(window.top!==window)return;
function go(){` + string(b) + `}
if(document.documentElement)go();else document.addEventListener("DOMContentLoaded",go,{once:true});})();`
}

func (m *Manager) launch() error {
	if err := os.MkdirAll(m.o.ProfileDir, 0o755); err != nil {
		return err
	}
	cmd := exec.Command(EdgePath, m.args()...)
	if err := cmd.Start(); err != nil {
		return err
	}
	done := make(chan struct{})
	m.mu.Lock()
	m.cmd = cmd
	m.done = done
	m.launchedAt = time.Now()
	m.mu.Unlock()
	go func() { _ = cmd.Wait(); close(done) }()
	return nil
}

type listEntry struct {
	ID    string `json:"id"`
	Type  string `json:"type"`
	URL   string `json:"url"`
	Title string `json:"title"`
}

func (m *Manager) list() ([]listEntry, error) {
	c := http.Client{Timeout: 1500 * time.Millisecond}
	r, err := c.Get(m.base() + "/json/list")
	if err != nil {
		return nil, err
	}
	defer r.Body.Close()
	b, _ := io.ReadAll(r.Body)
	var out []listEntry
	return out, json.Unmarshal(b, &out)
}

func (m *Manager) alive() bool {
	c := http.Client{Timeout: 1500 * time.Millisecond}
	r, err := c.Get(m.base() + "/json/version")
	if err != nil {
		return false
	}
	r.Body.Close()
	return true
}

// Start launches Edge (or reuses a running one on the port), attaches, and
// begins the poll and watchdog loops. ctx cancels everything.
func (m *Manager) Start(ctx context.Context) error {
	if !m.alive() {
		if err := m.freeProfile(); err != nil {
			return err
		}
		if err := m.launch(); err != nil {
			return err
		}
	}
	if err := m.connect(ctx); err != nil {
		return err
	}
	go m.pollLoop(ctx)
	go m.watchdog(ctx)
	return nil
}

func (m *Manager) connect(ctx context.Context) error {
	deadline := time.Now().Add(25 * time.Second)
	var first string
	for time.Now().Before(deadline) {
		if es, err := m.list(); err == nil {
			for _, e := range es {
				if wantTarget(e) && strings.HasPrefix(e.URL, m.appOrigin()) {
					first = e.ID
					break
				}
			}
		}
		if first != "" {
			break
		}
		time.Sleep(300 * time.Millisecond)
	}
	if first == "" {
		return errors.New("edge: no page target appeared on the debug port")
	}
	alloc, _ := chromedp.NewRemoteAllocator(ctx, m.base())
	root, cancel := chromedp.NewContext(alloc, chromedp.WithTargetID(target.ID(first)))
	if err := chromedp.Run(root); err != nil {
		cancel()
		return fmt.Errorf("edge: attach: %w", err)
	}
	m.mu.Lock()
	if m.cancel != nil {
		m.cancel()
	}
	m.rootCtx, m.cancel = root, cancel
	m.targets = map[string]*tgt{first: {id: first, ctx: root}}
	m.order = []string{first}
	m.main = first
	m.mu.Unlock()
	m.inject(root, first)
	log.Printf("edge: attached to %s", first)
	return nil
}

// overlaySource reads the overlay file fresh each time.
func (m *Manager) overlaySource() string {
	if m.o.Skip["overlay"] {
		return ""
	}
	if m.o.OverlayPath == "" {
		return ""
	}
	b, err := os.ReadFile(m.o.OverlayPath)
	if err != nil {
		return ""
	}
	pre := ""
	if m.o.FontPath != "" {
		if fb, ferr := os.ReadFile(m.o.FontPath); ferr == nil {
			pre = "window.__tvFont=\"" + base64.StdEncoding.EncodeToString(fb) + "\";\n"
		}
	}
	return pre + `(function(){
` + string(b) + `
})();`
}

// inject installs the overlay for future documents and runs it in the current one.
func (m *Manager) inject(ctx context.Context, id string) {
	src := m.overlaySource()
	if ps := primeSkipSource(); ps != "" && !m.o.Skip["ext"] {
		src += "\n" + ps
	}
	if src == "" {
		return
	}
	c, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	err := chromedp.Run(c, chromedp.ActionFunc(func(ctx context.Context) error {
		if _, err := page.AddScriptToEvaluateOnNewDocument(src).Do(ctx); err != nil {
			return err
		}
		_, _, err := runtime.Evaluate(src).Do(ctx)
		return err
	}))
	if err != nil {
		log.Printf("edge: inject %s: %v", id, err)
	}
}

// pollLoop notices new and closed page targets (popups, new tabs) every 300 ms.
func (m *Manager) pollLoop(ctx context.Context) {
	t := time.NewTicker(300 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		es, err := m.list()
		if err != nil {
			continue
		}
		seen := map[string]bool{}
		m.mu.Lock()
		root := m.rootCtx
		m.mu.Unlock()
		if root == nil {
			continue
		}
		changed := false
		for _, e := range es {
			if !wantTarget(e) {
				continue
			}
			seen[e.ID] = true
			m.mu.Lock()
			kt, known := m.targets[e.ID]
			if known {
				kt.url = e.URL
			}
			m.mu.Unlock()
			if known {
				continue
			}
			tctx, cancel := chromedp.NewContext(root, chromedp.WithTargetID(target.ID(e.ID)))
			_ = cancel // never cancel: cancelling would close the tab
			if err := chromedp.Run(tctx); err != nil {
				continue
			}
			m.mu.Lock()
			m.targets[e.ID] = &tgt{id: e.ID, ctx: tctx, url: e.URL}
			m.order = append(m.order, e.ID)
			m.mu.Unlock()
			m.inject(tctx, e.ID)
			log.Printf("edge: new target %s %s", e.ID, e.URL)
			changed = true
		}
		m.ensureOverlays()
		m.mu.Lock()
		for id := range m.targets {
			if !seen[id] {
				delete(m.targets, id)
				m.order = removeStr(m.order, id)
				changed = true
			}
		}
		cb := m.o.OnTargetsChanged
		m.mu.Unlock()
		if changed && cb != nil {
			cb()
		}
	}
}

func removeStr(s []string, v string) []string {
	out := s[:0]
	for _, x := range s {
		if x != v {
			out = append(out, x)
		}
	}
	return out
}

// watchdog relaunches Edge if the debug port stops answering.
func (m *Manager) watchdog(ctx context.Context) {
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	fails := 0
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		m.mu.Lock()
		stopped := m.stopped
		m.mu.Unlock()
		if stopped {
			return
		}
		if m.alive() {
			fails = 0
			continue
		}
		fails++
		if fails < 3 {
			continue
		}
		// Decide whether this is a crash (relaunch) or the user closing the window
		// (clean exit code 0: do not reopen the TV by itself).
		m.mu.Lock()
		cmd, done, at := m.cmd, m.done, m.launchedAt
		m.mu.Unlock()
		exited, code := false, -1
		if done != nil {
			select {
			case <-done:
				exited = true
				if cmd != nil && cmd.ProcessState != nil {
					code = cmd.ProcessState.ExitCode()
				}
			default:
			}
		}
		gone := ""
		switch {
		case exited && code == 0:
			gone = "edge window closed by the user"
		case time.Since(at) < 20*time.Second: // detection takes ~6 s, so this is a death within ~14 s of launch
			gone = "edge died again right after its last launch"
		}
		if gone != "" {
			log.Printf("watchdog: not relaunching: %s", gone)
			if m.o.OnGone != nil {
				go m.o.OnGone(gone)
			}
			return
		}
		log.Printf("watchdog: relaunch after crash (exit code %d)", code)
		if err := m.launch(); err != nil {
			log.Printf("edge: relaunch: %v", err)
			continue
		}
		if err := m.connect(ctx); err != nil {
			log.Printf("edge: reconnect: %v", err)
			continue
		}
		fails = 0
	}
}

// current returns the active target: the newest page, skipping blank pages
// (sites open stray about:blank popups; input and evals sent there are lost).
func (m *Manager) current() *tgt {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := len(m.order) - 1; i >= 0; i-- {
		if t, ok := m.targets[m.order[i]]; ok && t.url != "about:blank" && t.url != "" {
			return t
		}
	}
	if t, ok := m.targets[m.main]; ok {
		return t
	}
	for i := len(m.order) - 1; i >= 0; i-- {
		if t, ok := m.targets[m.order[i]]; ok {
			return t
		}
	}
	return nil
}

// Do runs fn against the current page target with a 5 s limit.
func (m *Manager) Do(fn func(ctx context.Context) error) error {
	return m.DoWithin(5*time.Second, fn)
}

// DoWithin is Do with a caller-chosen limit.
func (m *Manager) DoWithin(d time.Duration, fn func(ctx context.Context) error) error {
	t := m.current()
	if t == nil {
		return errors.New("edge: no page")
	}
	c, cancel := context.WithTimeout(t.ctx, d)
	defer cancel()
	return chromedp.Run(c, chromedp.ActionFunc(fn))
}

// DoOn runs fn against a specific target id (spike use).
func (m *Manager) DoOn(id string, fn func(ctx context.Context) error) error {
	m.mu.Lock()
	t := m.targets[id]
	m.mu.Unlock()
	if t == nil {
		return errors.New("edge: unknown target")
	}
	c, cancel := context.WithTimeout(t.ctx, 8*time.Second)
	defer cancel()
	return chromedp.Run(c, chromedp.ActionFunc(fn))
}

// TargetIDs returns page target ids in creation order.
func (m *Manager) TargetIDs() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]string(nil), m.order...)
}

// CurrentID returns the active target id.
func (m *Manager) CurrentID() string {
	if t := m.current(); t != nil {
		return t.id
	}
	return ""
}

// Eval evaluates an expression on the current target and decodes the JSON result into out (may be nil).
func (m *Manager) Eval(expr string, out any) error {
	return m.Do(func(ctx context.Context) error { return evalTo(ctx, expr, out) })
}

// EvalOn is Eval on a specific target.
func (m *Manager) EvalOn(id, expr string, out any) error {
	return m.DoOn(id, func(ctx context.Context) error { return evalTo(ctx, expr, out) })
}

func evalTo(ctx context.Context, expr string, out any) error {
	res, ex, err := runtime.Evaluate(expr).WithReturnByValue(true).WithAwaitPromise(true).Do(ctx)
	if err != nil {
		return err
	}
	if ex != nil {
		return fmt.Errorf("js: %s", ex.Error())
	}
	if out != nil && res != nil && len(res.Value) > 0 {
		return json.Unmarshal([]byte(res.Value), out)
	}
	return nil
}

// Viewport returns the last measured viewport (CSS px).
func (m *Manager) Viewport() (int, int) {
	var v struct{ W, H float64 }
	if err := m.Eval(`({W:innerWidth,H:innerHeight})`, &v); err == nil && v.W > 0 {
		m.mu.Lock()
		m.vw, m.vh = int(v.W), int(v.H)
		m.mu.Unlock()
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.vw, m.vh
}

// Navigate loads url on the main (or current) target. With tv set it applies
// the smart-TV user agent first; otherwise it clears any override.
//
// It never waits for the page to load: it starts the navigation on the main
// window in the background and returns at once, so a heavy site (Netflix,
// Prime) cannot hold up the remote. A newer call cancels the one in flight.
// A slow load is not an error; only a real failure (DNS, refused, bad
// certificate) is reported, through Options.OnNavError.
func (m *Manager) Navigate(url string, tv bool) error {
	m.closeExtras()
	m.mu.Lock()
	t := m.targets[m.main]
	m.mu.Unlock()
	if t == nil {
		return errors.New("edge: no page")
	}
	ua := ""
	if tv {
		ua = m.o.TVUserAgent
	}
	m.navMu.Lock()
	if m.navCancel != nil {
		m.navCancel()
	}
	c, cancel := context.WithTimeout(t.ctx, 60*time.Second)
	m.navCancel = cancel
	m.navMu.Unlock()
	go func() {
		defer cancel()
		err := chromedp.Run(c, chromedp.ActionFunc(func(ctx context.Context) error {
			m.leavePage(ctx)
			// Touch the user agent only when it must change: an override, even
			// an empty one, drops the browser's client-hint headers, which
			// streaming sites check. So a plain navigation never sets one.
			if !m.o.Skip["ua"] {
				m.mu.Lock()
				need := tv || m.uaSet
				m.uaSet = tv
				m.mu.Unlock()
				if need {
					if err := emulation.SetUserAgentOverride(ua).Do(ctx); err != nil {
						return err
					}
				}
			}
			_, _, errText, _, err := page.Navigate(url).Do(ctx)
			if err != nil {
				return err
			}
			if errText != "" {
				return errors.New(errText)
			}
			return nil
		}))
		if err != nil && c.Err() == nil && m.o.OnNavError != nil {
			m.o.OnNavError(url, err)
		}
	}()
	return nil
}

// leavePage gets the current document out of the way of a navigation: leave
// HTML fullscreen and drop any "are you sure you want to leave" handler, so
// the navigation never stops on a dialog and the window keeps its own
// (browser) fullscreen state.
func (m *Manager) leavePage(ctx context.Context) {
	c, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
	defer cancel()
	_ = evalTo(c, `(function(){try{window.onbeforeunload=null;if(document.fullscreenElement)document.exitFullscreen();}catch(e){}return true})()`, nil)
}

func (m *Manager) closeExtras() {
	m.mu.Lock()
	mainID := m.main
	var extra []*tgt
	for id, t := range m.targets {
		if id != mainID {
			extra = append(extra, t)
		}
	}
	m.mu.Unlock()
	for _, t := range extra {
		_ = m.DoOn(t.id, func(ctx context.Context) error { return page.Close().Do(ctx) })
	}
	m.mu.Lock()
	m.order = []string{mainID}
	for id := range m.targets {
		if id != mainID {
			delete(m.targets, id)
		}
	}
	m.mu.Unlock()
}

// Home closes extra tabs/popups and returns the main window to the launcher.
func (m *Manager) Home() error {
	m.closeExtras()
	m.mu.Lock()
	mainID := m.main
	m.mu.Unlock()
	m.navMu.Lock()
	if m.navCancel != nil {
		m.navCancel()
		m.navCancel = nil
	}
	m.navMu.Unlock()
	return m.DoOn(mainID, func(ctx context.Context) error {
		m.leavePage(ctx)
		m.mu.Lock()
		need := m.uaSet
		m.uaSet = false
		m.mu.Unlock()
		if need && !m.o.Skip["ua"] {
			_ = emulation.SetUserAgentOverride("").Do(ctx)
		}
		_, _, _, _, err := page.Navigate(m.o.HomeURL).Do(ctx)
		return err
	})
}

// Screenshot returns a PNG of the current target.
func (m *Manager) Screenshot() ([]byte, error) {
	var b []byte
	err := m.Do(func(ctx context.Context) error {
		var e error
		b, e = page.CaptureScreenshot().Do(ctx)
		return e
	})
	return b, err
}

// Close shuts Edge down and stops the watchdog.
func (m *Manager) Close() {
	m.mu.Lock()
	m.stopped = true
	root, cmd, done := m.rootCtx, m.cmd, m.done
	m.mu.Unlock()
	// Ask Edge to close itself (Browser.close) and wait for it to finish, so
	// cookies (Netflix rotates its session cookie) are flushed to disk. Only a
	// browser that has not exited after 12 s is force-killed.
	if root != nil {
		c, cancel := context.WithTimeout(root, 3*time.Second)
		_ = chromedp.Run(c, chromedp.ActionFunc(func(ctx context.Context) error { return browser.Close().Do(ctx) }))
		cancel()
	}
	deadline := time.Now().Add(12 * time.Second)
	for time.Now().Before(deadline) {
		if done != nil {
			select {
			case <-done:
				return
			case <-time.After(150 * time.Millisecond):
			}
			if m.alive() {
				continue
			}
			// debug port is gone; give the process a moment to finish writing
			select {
			case <-done:
				return
			case <-time.After(2 * time.Second):
				return
			}
		}
		if !m.alive() { // reused browser we did not start
			time.Sleep(time.Second)
			return
		}
		time.Sleep(150 * time.Millisecond)
	}
	log.Println("edge: did not close in 12 s, killing it")
	if cmd != nil && cmd.Process != nil {
		_ = exec.Command("taskkill", "/F", "/T", "/PID", fmt.Sprint(cmd.Process.Pid)).Run()
	}
}

// ProfileDir returns the default profile folder under %LOCALAPPDATA%\TVMode.
func ProfileDir() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		h, _ := os.UserHomeDir()
		base = filepath.Join(h, "AppData", "Local")
	}
	return filepath.Join(base, "TVMode", "edge-profile")
}

// wantTarget says whether a page target is one we drive. Edge opens welcome,
// sync and extension pages of its own; those are ignored.
func wantTarget(e listEntry) bool {
	if e.Type != "page" {
		return false
	}
	for _, p := range []string{"edge://", "chrome://", "chrome-extension://", "extension://", "devtools://", "chrome-untrusted://"} {
		if strings.HasPrefix(e.URL, p) {
			return false
		}
	}
	return true
}

// ensureOverlays re-injects the overlay into targets that lost the race: a
// popup starts loading before we attach, so addScriptToEvaluateOnNewDocument
// misses its first document. Once per distinct URL per target.
func (m *Manager) ensureOverlays() {
	src := m.overlaySource()
	if src == "" {
		return
	}
	m.mu.Lock()
	ts := make([]*tgt, 0, len(m.targets))
	for _, t := range m.targets {
		ts = append(ts, t)
	}
	m.mu.Unlock()
	for _, t := range ts {
		var st struct {
			Has  bool   `json:"has"`
			Href string `json:"href"`
		}
		c, cancel := context.WithTimeout(t.ctx, 2*time.Second)
		err := chromedp.Run(c, chromedp.ActionFunc(func(ctx context.Context) error {
			return evalTo(ctx, "({has:typeof window.__tv==='object',href:location.href})", &st)
		}))
		cancel()
		if err != nil || st.Has || st.Href == "" || st.Href == "about:blank" || st.Href == t.injURL {
			continue
		}
		t.injURL = st.Href
		m.inject(t.ctx, t.id)
	}
}

func (m *Manager) appOrigin() string {
	if m.o.AppOrigin != "" {
		return m.o.AppOrigin
	}
	return "http://127.0.0.1:8770"
}

// Raise brings the TV window back when it was minimised (Win+D, a click on the
// taskbar, another app's full screen): it restores it, puts it back in full screen
// and raises it. It says whether it had to restore the window.
func (m *Manager) Raise(offTV bool, place func()) (bool, error) {
	m.mu.Lock()
	mainID := m.main
	m.mu.Unlock()
	restored := false
	err := m.DoOn(mainID, func(ctx context.Context) error {
		id, b, err := browser.GetWindowForTarget().Do(ctx)
		if err != nil {
			return err
		}
		// Not full screen, or (offTV, measured by Windows in real pixels by the caller)
		// on the wrong screen: back to a normal window, which place() moves onto the
		// TV, then full screen there. Edge's own bounds are in scaled units that do
		// not match Windows' when the screens scale differently, so Edge never moves it.
		if b != nil && (b.WindowState != browser.WindowStateFullscreen || offTV) {
			restored = b.WindowState == browser.WindowStateMinimized
			if b.WindowState != browser.WindowStateNormal {
				if err := browser.SetWindowBounds(id, &browser.Bounds{WindowState: browser.WindowStateNormal}).Do(ctx); err != nil {
					return err
				}
			}
			if place != nil {
				time.Sleep(150 * time.Millisecond)
				place()
				time.Sleep(150 * time.Millisecond)
			}
			if err := browser.SetWindowBounds(id, &browser.Bounds{WindowState: browser.WindowStateFullscreen}).Do(ctx); err != nil {
				return err
			}
		}
		return page.BringToFront().Do(ctx)
	})
	return restored, err
}
