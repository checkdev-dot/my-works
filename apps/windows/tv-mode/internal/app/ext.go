package app

import (
	"encoding/json"
	"errors"
	"log"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"tvmode/internal/extapp"
	"tvmode/internal/services"
	"tvmode/internal/winsys"
)

// Netflix runs in Chrome as an --app window on the TV monitor (see
// NETFLIX-PLAN.md). While it is the current service the remote's keys, pointer
// and text go to that window through SendInput instead of Edge over CDP.

// useExternal says whether s opens in Chrome. Smoke tests keep Netflix in Edge
// unless they set TVMODE_TEST_EXT.
func (a *App) useExternal(s *services.Service) bool {
	if !s.External {
		return false
	}
	if a.o.Test && os.Getenv("TVMODE_TEST_EXT") == "" {
		return false
	}
	return true
}

func (a *App) extActive() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.extOn
}

func (a *App) monitors() []winsys.Monitor {
	if a.monsFn != nil {
		return a.monsFn()
	}
	return winsys.Monitors()
}

func (a *App) tvMonitor() winsys.Monitor { return pickTV(a.monitors(), a.o.Display) }

// tvMissing: the Display option names a monitor that is not there (TV off or unplugged), so
// pickTV would fall back to the desk monitor. Display 0 is a deliberate choice, not missing.
func (a *App) tvMissing() bool {
	return a.o.Display < 0 || a.o.Display >= len(a.monitors())
}

// pickTV is the TV monitor among mons: the one the Display option names, else the first.
func pickTV(mons []winsys.Monitor, display int) winsys.Monitor {
	if display >= 0 && display < len(mons) {
		return mons[display]
	}
	if len(mons) > 0 {
		return mons[0]
	}
	return winsys.Monitor{W: 1920, H: 1080}
}

// openExternal opens service i in Chrome. It returns at once; the phone sees the
// service light up, and an error if Chrome could not be opened.
func (a *App) openExternal(i int, s *services.Service, urlOverride string) {
	if a.tvMissing() {
		log.Printf("open %s in Chrome: TV monitor %d not found, refusing", s.ID, a.o.Display)
		a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "TV monitor not found"})
		return
	}
	urlOverride = primePlayURL(s.ID, urlOverride) // a Prime title page opened to play must say so, or the helper never presses Resume
	a.mu.Lock()
	// a second press of the same app while its window is still being opened is one press; once the
	// open has finished (a.opening cleared) the window is judged on its own below, so a window
	// Dev closed by hand within 8 s is reopened by the next press instead of swallowed
	if urlOverride == "" && a.opening == s.ID && a.lastOpen == s.ID && time.Since(a.openAt) < 8*time.Second {
		a.mu.Unlock()
		log.Printf("open %s in Chrome: already opening, repeat press dropped", s.ID)
		return
	}
	if urlOverride == "" && a.extOn && a.extSvc == s.ID && a.ext.Alive() && !a.ext.Hung() { // already open: just bring it to the front (a hung window is closed and reopened instead)
		a.st.App, a.st.Focus = s.ID, i
		a.mu.Unlock()
		a.ext.Raise()
		a.broadcast()
		return
	}
	a.opening, a.lastOpen, a.openAt = s.ID, s.ID, time.Now()
	gen := a.ext.BeginOpen() // cancels an older open still waiting; only this generation may write state below
	a.extDeep = ""
	if s.ID == "netflix" && strings.Contains(urlOverride, "/watch/") {
		a.extDeep = "https://www.netflix.com/browse"
		if m := reNetflixWatch.FindStringSubmatch(strings.TrimPrefix(urlOverride, "https://www.netflix.com")); m != nil {
			if u := a.nfShowFor(m[1]); u != "" {
				a.extDeep = u
			}
		}
	}
	if s.ID != "netflix" && (strings.Contains(urlOverride, "/watch") || strings.Contains(urlOverride, "autoplay=1")) {
		a.extDeep = s.URL // opened on the player: Back has no page before it, so it goes to the service's home
	}
	a.st.App, a.st.Focus, a.st.Media = s.ID, i, nil
	a.mu.Unlock()
	log.Printf("open %s in Chrome", s.ID)
	if s.ID != "netflix" {
		probeNote("open", map[string]any{"svc": s.ID, "url": urlOverride})
	}
	a.nf.reset()
	a.resume.clear()
	a.broadcast()
	a.show("opening", map[string]any{"name": s.Name})
	go func() {
		target := urlOverride
		if target == "" {
			target = a.urlFor(s)
		}
		err := a.ext.Open(withHelperNote(s.ID, target), a.tvMonitor())
		if !a.finishOpen(gen, s, urlOverride, err) {
			return
		}
		if err != nil {
			log.Printf("open %s in Chrome: %v", s.ID, err)
			msg := "Could not open " + s.Name + " in Chrome"
			if errors.Is(err, extapp.ErrNoChrome) {
				msg = "Chrome is not installed on this PC"
			}
			a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": msg})
			if a.Edge != nil {
				a.raiseTV() // the launcher is what shows now
			}
		}
		a.broadcast()
	}()
}

// withHelperNote adds the note the helper acts on to an address TV Mode opens in Chrome, so a
// start does not end on a page of choices:
//   - a Netflix watch address gets #tvgo={id,t}: if Netflix puts "Who's watching?" first it
//     drops the address, and the helper (which keeps the note) plays the id after the pick;
//   - a Prime or JioHotstar SEARCH address (the fallback when no title page is known) gets
//     #tvpick=<title>: the helper clicks the exact match and starts it.
//
// Addresses that already carry a fragment, and every other address, are left alone.
func withHelperNote(svc, target string) string {
	if strings.Contains(target, "#") {
		return target
	}
	u, err := url.Parse(target)
	if err != nil {
		return target
	}
	switch svc {
	case "netflix":
		if m := reNetflixWatch.FindStringSubmatch(u.Path); m != nil {
			note := map[string]any{"id": m[1]}
			if t, _ := strconv.Atoi(u.Query().Get("t")); t > 0 {
				note["t"] = t
			}
			b, _ := json.Marshal(note)
			return target + "#tvgo=" + url.PathEscape(string(b))
		}
	case "prime", "jiohotstar":
		q := u.Query().Get("phrase")
		if svc == "jiohotstar" {
			q = u.Query().Get("search_query")
		}
		if q != "" && (strings.Contains(u.Path, "/search") || strings.Contains(u.Path, "/explore")) {
			return target + "#tvpick=" + url.QueryEscape(q)
		}
	}
	return target
}

// finishOpen records the result of an Open, but only for the newest open: an older open
// that finishes late (app A, then app B tapped at once) must not clear B's "opening" flag
// or mark B's service as running. It says whether this open's result was applied.
func (a *App) finishOpen(gen uint64, s *services.Service, urlOverride string, err error) bool {
	a.mu.Lock()
	if !a.ext.IsLatest(gen) {
		a.mu.Unlock()
		log.Printf("open %s in Chrome: superseded by a newer open (err=%v); leaving its state alone", s.ID, err)
		return false
	}
	if errors.Is(err, extapp.ErrCancelled) {
		a.mu.Unlock()
		log.Printf("open %s in Chrome: cancelled (Home pressed)", s.ID)
		return false // Home already moved on; touch no state
	}
	a.opening = ""
	if err == nil {
		a.extOn, a.extSvc = true, s.ID
		if a.ld != nil && urlOverride == "" {
			a.ld.hist.NoteOpened(s.ID, s.Name, s.URL)
		}
	} else { // reset like goHome(): nothing is opening, the 8 s repeat guard is off
		a.extOn = false
		a.st.App, a.st.Media, a.lastOpen, a.openAt = "launcher", nil, "", time.Time{}
	}
	a.mu.Unlock()
	if err == nil && !a.o.Test {
		go a.watchHelper(gen, s)
	}
	return true
}

// watchHelper says so on the phone when TV Mode Helper never speaks after an open: Chrome
// drops an unpacked extension silently (a failed reload, Developer mode off), and without
// it Netflix lands on search instead of playing and subtitles never come.
func (a *App) watchHelper(gen uint64, s *services.Service) {
	time.Sleep(25 * time.Second)
	a.mu.Lock()
	on := a.extOn && a.extSvc == s.ID && a.ext.IsLatest(gen)
	a.mu.Unlock()
	if !on || a.tvHelperLive() {
		return
	}
	log.Printf("ext: no hello from TV Mode Helper 25 s after opening %s", s.ID)
	a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": s.Name + " controls are limited: TV Mode Helper isn't running in Chrome on the PC."})
}

// tvHelperLiveSince says whether the helper of THIS TV window has spoken since it opened
// at open: a report that passed reportAllowed (TV monitor, current service), or, until
// the page has had time to report, the hello its load sends. Desk Chrome tabs keep the
// global ExtensionPresent() true, so it cannot tell.
func tvHelperLiveSince(open time.Time) bool {
	if t := tvHelperAt.Load(); t != 0 && time.UnixMilli(t).After(open) {
		return true
	}
	h := extHelloAt.Load()
	// Netflix browse pages send only hellos (watch reports start on the player), so a hello since
	// this window opened, and fresh (the helper repeats it), still counts: a 3-minute cap
	// turned the arrows off on browse pages
	return h != 0 && time.UnixMilli(h).After(open) && time.Since(time.UnixMilli(h)) < 10*time.Minute
}

func (a *App) tvHelperLive() bool { return tvHelperLiveSince(a.extOpenedAt()) }

// closeExternal closes the Chrome window (only ours) and returns control to Edge.
func (a *App) closeExternal() {
	a.mu.Lock()
	a.extOn = false
	a.mu.Unlock()
	a.ext.Close() // always: with no window it only cancels an Open still in flight (Home during opening)
}

func (a *App) extErr(err error) {
	if err != nil {
		log.Printf("ext: %v", err)
		a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": a.svc().Name + " window did not take that press"})
	}
}

// handleExternal routes a phone frame to the Chrome window. It returns false for
// frames the normal path still handles (volume, sleep, power, open, exit...).
func (a *App) handleExternal(m msg) bool {
	p := a.ext.Pointer()
	sv := a.svc()
	nfx := sv.ID == "netflix" // the Netflix helper has a d-pad; Prime and JioHotstar browse with the cursor
	switch m.T {
	case "key":
		switch m.K {
		case "up", "down", "left", "right":
			if p != nil {
				p.End()
			}
			_, live := a.nf.get(time.Now())
			if (nfx && a.tvHelperLive()) || (!nfx && live) {
				a.extErr(a.ext.Key(m.K)) // Netflix's d-pad handles real arrows; a player takes them as seek and volume
			} else {
				a.extErr(a.ext.Nav(m.K))
			}
		case "ok":
			if p != nil && p.Active() {
				a.extErr(a.ext.Click(true))
			} else {
				if p != nil {
					p.End() // OK on the focus: the cursor leaves the picture
				}
				a.extErr(a.ext.Key("ok"))
			}
		case "back":
			if p != nil {
				p.End()
			}
			a.mu.Lock()
			deep := a.extDeep
			a.extDeep = ""
			a.mu.Unlock()
			if deep != "" { // opened on the episode: Chrome has nothing to go back to, so open the show
				if s := sv; s != nil {
					for i, x := range services.Apps {
						if x == s {
							a.openExternal(i, s, deep)
						}
					}
				}
				return true
			}
			a.extErr(a.ext.BackWith(nfx && a.tvHelperLive()))
		case "home":
			a.goHome()
		default:
			return false
		}
	case "media":
		switch m.A {
		case "playpause", "play", "pause": // the media key works on Netflix; the helper is only for what keys cannot do
			if !nfx { // Prime and JioHotstar: the page's own <video>. A new phone says which (play / pause, idempotent); an old one says playpause
				now := time.Now()
				if m.A == "playpause" && a.nf.repeatToggle(now, 1500*time.Millisecond) {
					log.Printf("%s: a second playpause within 1.5 s dropped (it would undo the first)", sv.ID)
					return true
				}
				if a.nf.push(nfCmd{A: m.A}, now) {
					a.nf.notePlay(now) // a play the page refuses is answered once with a real key (watchOther)
					return true
				}
			}
			a.extErr(a.ext.Key("playpause"))
		case "fullscreen":
			go a.fullscreenExt(sv, nfx)
		case "skip": // the helper presses Skip; without it, Netflix puts focus on its Skip button, so OK does
			if !a.nf.push(nfCmd{A: "skip"}, time.Now()) {
				a.extErr(a.ext.Key("ok"))
			}
		case "subs":
			if !nfx {
				a.otherSubs(sv)
				return true
			}
			if a.nf.push(nfCmd{A: "tracks"}, time.Now()) { // the helper reads the lists; the phone shows the picker
				return true
			}
			if a.helperSeen() { // the helper is there but no episode is playing
				a.tracksNote("netflix", "Start the episode first. The list comes from Netflix's player once it plays.")
				return true
			} // TV Mode cannot press Netflix's buttons in Chrome: the pad becomes a cursor for it
			a.menuUntil.Store(time.Now().Add(30 * time.Second).UnixMilli())
			a.broadcast()
			go func() { time.Sleep(30500 * time.Millisecond); a.broadcast() }()
			a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "Move the cursor to the speech bubble at the bottom right of Netflix and tap."})
		case "track":
			var t trackPick
			_ = json.Unmarshal(m.S, &t)
			if !nfx {
				a.wakePlayer()
			}
			if !a.nf.push(nfCmd{A: "settrack", Kind: t.Kind, ID: t.ID}, time.Now()) {
				a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": sv.Name + "'s player is not answering. Start the episode first."})
			}
		case "speed":
			var r float64
			if json.Unmarshal(m.S, &r) == nil && validRate(r) && !a.nf.push(nfCmd{A: "speed", Ms: int64(r * 1000)}, time.Now()) {
				a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "Speed on " + sv.Name + " needs the TV Mode helper and a playing video."})
			}
		case "subsclose": // Netflix's own menu, opened when its player did not answer: the same button closes it
			if a.menuUntil.Load() > time.Now().UnixMilli() {
				if nfx {
					a.nf.push(nfCmd{A: "subs"}, time.Now())
				} else if !a.nf.push(nfCmd{A: "closemenu"}, time.Now()) { // Prime, JioHotstar: the helper presses Escape and the open menu's button
					a.extErr(a.ext.Key("escape"))
				}
			}
			a.menuUntil.Store(0)
			a.broadcast()
		case "seek":
			var secs float64
			_ = json.Unmarshal(m.S, &secs)
			if a.nf.adNow(time.Now()) { // an ad's clock is not the show's: no seeking until it ends
				return true
			}
			if !a.nf.push(nfCmd{A: "seekby", Ms: int64(secs * 1000)}, time.Now()) {
				a.extErr(a.ext.Seek(secs))
			}
		}
	case "scrub":
		if a.nf.adNow(time.Now()) {
			return true
		}
		if md, ok := a.nf.get(time.Now()); ok && md.Dur > 0 && a.nf.push(nfCmd{A: "seekto", Ms: int64(m.To * float64(md.Dur) * 1000)}, time.Now()) {
			return true
		}
		a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "Scrubbing " + sv.Name + " needs the TV Mode helper in Chrome. Use the seek buttons."})
	case "tap":
		a.extErr(a.ext.Click(m.B != "right"))
	case "scroll":
		a.extErr(a.ext.Scroll(m.Dy))
	case "fling":
	case "pad":
		if p != nil {
			p.Pad(m.Dx*a.cfg.PadGain, m.Dy*a.cfg.PadGain)
		}
	case "recenter":
		if p != nil {
			p.Recenter()
		}
	case "point":
		if p != nil {
			p.Point(m.On)
		}
		a.mu.Lock()
		a.st.Point = m.On
		a.mu.Unlock()
		a.broadcast()
	case "aim":
		if p != nil && m.Abs == 1 {
			a.mu.Lock()
			g, iy, ip := a.cfg.AimGain, a.cfg.InvertYaw, a.cfg.InvertPit
			a.mu.Unlock()
			p.AimAbs(m.Q, m.Yaw, m.Pit, g, iy, ip)
		}
	case "text":
		var s string
		if json.Unmarshal(m.S, &s) == nil && s != "" {
			a.extErr(a.ext.Type(s))
		}
	case "textkey":
		switch m.K {
		case "backspace":
			a.extErr(a.ext.Key("backspace"))
		case "enter":
			a.extErr(a.ext.Key("ok"))
		}
	default:
		return false
	}
	return true
}

// extOpenedAt is when the last app (Chrome or Edge) was opened.
func (a *App) extOpenedAt() time.Time {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.openAt
}

// --- window health (pollLoop) ---

type healAct int

const (
	healNone   healAct = iota
	healReload         // press F5 once
	healReopen         // F5 did not help: open the same address again
)

const (
	hungLimit   = 10 * time.Second // Windows calls the window "not responding" this long
	silentLimit = 30 * time.Second // the helper spoke from this window, then went quiet
	reloadWait  = 15 * time.Second // how long F5 gets before the window is reopened
)

// extHealth is pollLoop's memory of the Chrome window's health: one F5, then a reopen.
type extHealth struct {
	hwnd         uintptr
	hungSince    time.Time
	f5At         time.Time
	ignoreBefore time.Time // helper reports at or before this no longer count as "was live" (after a handled episode)
}

// step judges the window once per poll. helperAt is the last report from this window's
// helper (zero: never spoke), helloAt the last hello from any helper (a reloaded page says
// hello). A helper that went quiet only counts when it had been reporting; leaving the
// player for a browse page also goes quiet, which a reload there does no harm to, and the
// hello that follows the reload clears it so it is not reopened.
func (h *extHealth) step(now time.Time, hw uintptr, hung bool, helperAt, helloAt time.Time) healAct {
	if hw != h.hwnd {
		*h = extHealth{hwnd: hw}
	}
	if hung {
		if h.hungSince.IsZero() {
			h.hungSince = now
		}
	} else {
		h.hungSince = time.Time{}
	}
	if h.f5At.IsZero() {
		silent := !helperAt.IsZero() && helperAt.After(h.ignoreBefore) && now.Sub(helperAt) > silentLimit
		if (hung && now.Sub(h.hungSince) > hungLimit) || silent {
			h.f5At = now
			return healReload
		}
		return healNone
	}
	if now.Sub(h.f5At) < reloadWait {
		return healNone
	}
	healed := !hung && (helperAt.After(h.f5At) || helloAt.After(h.f5At))
	h.f5At, h.ignoreBefore = time.Time{}, helperAt
	if healed {
		return healNone
	}
	return healReopen
}

// lowCover is the video share of the window under which a Prime or JioHotstar player is not
// really full screen (the window may be, with the page's player still in its small frame).
const lowCover = 0.95

// fullscreenExt is the phone's Full button. The window itself first (F11 when it has a title bar);
// then, on Prime and JioHotstar, if the helper says the video covers little of the window, the
// helper presses the player's own full-screen control, and a real "f" key follows if that did
// not change the coverage. Every step is logged.
func (a *App) fullscreenExt(sv *services.Service, nfx bool) {
	a.extErr(a.ext.Fullscreen())
	if nfx {
		return
	}
	time.Sleep(time.Second) // the window takes a moment to resize, and the helper's next report to say so
	cov, ok := a.nf.coverage(time.Now())
	if !ok {
		log.Printf("%s: Full pressed, the helper has not said how much of the window the video covers; window only", sv.ID)
		probeNote("fullscreen", map[string]any{"svc": sv.ID, "cov": nil, "step": "window-only"})
		return
	}
	if cov >= lowCover {
		log.Printf("%s: Full pressed, the video already covers %.0f%% of the window", sv.ID, cov*100)
		return
	}
	log.Printf("%s: Full pressed, the video covers only %.0f%% of the window: asking the helper to press the player's full-screen control", sv.ID, cov*100)
	probeNote("fullscreen", map[string]any{"svc": sv.ID, "cov": cov, "step": "helper-button"})
	if !a.nf.push(nfCmd{A: "fullscreen"}, time.Now()) {
		log.Printf("%s: the helper is not live; sending the f key", sv.ID)
		a.extErr(a.ext.Key("f"))
		return
	}
	go func() {
		time.Sleep(2500 * time.Millisecond)
		c2, ok := a.nf.coverage(time.Now())
		if ok && c2 >= lowCover {
			log.Printf("%s: full screen worked through the player's own control (video now %.0f%%)", sv.ID, c2*100)
			probeNote("fullscreen", map[string]any{"svc": sv.ID, "cov": c2, "step": "helper-button-worked"})
			return
		}
		log.Printf("%s: the player's control did not take (video %.0f%%); sending the f key", sv.ID, c2*100)
		probeNote("fullscreen", map[string]any{"svc": sv.ID, "cov": c2, "step": "f-key"})
		a.extErr(a.ext.Key("f"))
	}()
}

// primePlayURL adds autoplay=1 to a Prime title address (/detail/...) that TV Mode opens to play, keeping
// its other parameters, so the helper presses the page's Play / Resume (helper 2.4; the Continue row
// held the address of the page the player ran on, which carries ref_=atv_plr_detail_play and no flag).
// A trailer address and every address that is not a Prime title page are left alone.
func primePlayURL(svc, target string) string {
	if svc != "prime" || target == "" {
		return target
	}
	u, err := url.Parse(target)
	if err != nil || !extHostOK("prime", target) || !rePrimeDetail.MatchString(u.Path) {
		return target
	}
	q := u.Query()
	if q.Get("autoplay") != "" {
		return target
	}
	q.Set("autoplay", "1")
	u.RawQuery = q.Encode()
	return u.String()
}
