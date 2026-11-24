package app

import (
	"fmt"
	"log"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"tvmode/internal/history"
	"tvmode/internal/services"
	"tvmode/internal/winsys"
)

// Prime Video and JioHotstar in Chrome (helper 2.0). They use the same helper
// extension, the same report/command channel (a.nf) and the same phone frames as
// Netflix; this file holds what differs: which pages count as the service's, which
// window is the TV's, the resume that Edge did over CDP, and the page snapshot that
// feeds Continue watching through the same noteWatching Edge always used.

// extHosts are the sites each service's helper reports from.
var extHosts = map[string][]string{
	"netflix":    {"www.netflix.com"},
	"prime":      {"www.primevideo.com", "primevideo.com", "www.amazon.in", "www.amazon.com"},
	"jiohotstar": {"www.hotstar.com", "hotstar.com", "www.jiohotstar.com", "jiohotstar.com"},
}

// extSvcOK says whether id is a service the helper may speak for.
func extSvcOK(id string) bool { _, ok := extHosts[id]; return ok }

// extHostOK says whether address u is a page of service svc (an https address).
func extHostOK(svc, u string) bool {
	p, err := url.Parse(u)
	if err != nil || p.Scheme != "https" {
		return false
	}
	for _, h := range extHosts[svc] {
		if p.Host == h {
			if svc == "prime" && strings.HasPrefix(p.Host, "www.amazon.") && !strings.HasPrefix(p.Path, "/gp/video") {
				return false // amazon's shop is not Prime Video
			}
			return true
		}
	}
	return false
}

// extScreen is where the reporting window is, as the page sees it (CSS pixels from
// window.screenX/Y and outerWidth/Height) and the device pixel ratio. Absent in 1.3.0.
type extScreen struct {
	X   float64 `json:"x"`
	Y   float64 `json:"y"`
	W   float64 `json:"w"`
	H   float64 `json:"h"`
	Dpr float64 `json:"dpr"`
}

// centres are the two readings of where the window's centre is: the page's numbers
// as given (CSS pixels), and scaled by the device pixel ratio (Windows' monitor
// rectangles may be in device pixels).
func (s *extScreen) centres() [][2]float64 {
	cx, cy := s.X+s.W/2, s.Y+s.H/2
	out := [][2]float64{{cx, cy}}
	if s.Dpr > 0 && s.Dpr != 1 {
		out = append(out, [2]float64{cx * s.Dpr, cy * s.Dpr})
	}
	return out
}

func inMon(m winsys.Monitor, x, y float64) bool {
	return x >= float64(m.X) && x < float64(m.X+m.W) && y >= float64(m.Y) && y < float64(m.Y+m.H)
}

// offTV says whether a report positively comes from a window that is not on the TV
// monitor: under every reading its centre is on one of the other monitors, and under
// none on the TV's. Anything unclear (an old helper, a centre on no monitor, mixed
// DPI numbers that fit nowhere) is not a rejection: Netflix must keep working.
func offTV(s *extScreen, tv winsys.Monitor, all []winsys.Monitor) bool {
	if s == nil || s.W <= 0 || s.H <= 0 {
		return false
	}
	for _, c := range s.centres() {
		if inMon(tv, c[0], c[1]) {
			return false
		}
		other := false
		for _, m := range all {
			if m != tv && inMon(m, c[0], c[1]) {
				other = true
			}
		}
		if !other {
			return false
		}
	}
	return true
}

var offTVLogged atomic.Value // the last rejected position, so the log says it once

// reportFromTV says whether a helper report may come from the TV's window.
func (a *App) reportFromTV(s *extScreen) bool {
	if s == nil {
		return true
	}
	var all []winsys.Monitor
	if a.monsFn != nil {
		all = a.monsFn()
	} else {
		all = winsys.Monitors()
	}
	tv := pickTV(all, a.o.Display)
	if !offTV(s, tv, all) {
		return true
	}
	k := fmt.Sprintf("%.0f,%.0f %.0fx%.0f dpr %.2f", s.X, s.Y, s.W, s.H, s.Dpr)
	if v, _ := offTVLogged.Load().(string); v != k {
		offTVLogged.Store(k)
		log.Printf("helper: ignoring a report from a window at %s (not the TV monitor %d,%d %dx%d)", k, tv.X, tv.Y, tv.W, tv.H)
	}
	return false
}

// reportAllowed says whether a report for svc belongs to the Chrome window TV Mode
// is driving: from the TV monitor, and for the service that is current while a Chrome
// window is up (a window being closed behind a newer one must not speak).
func (a *App) reportAllowed(svc string, s *extScreen) bool {
	if !a.reportFromTV(s) {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	return !(a.extOn && a.st.App != svc)
}

// helperSeenLog says the helper's version and site once, so the log shows which
// helper runs on which site.
var helperSeenLog = struct {
	sync.Mutex
	m map[string]bool
}{m: map[string]bool{}}

type extHello struct {
	Svc  string `json:"svc"`
	Ver  string `json:"ver"`
	Host string `json:"host"`
}

func noteHello(h extHello) {
	if h.Svc == "" && h.Ver == "" {
		return
	}
	k := h.Svc + "|" + h.Ver + "|" + h.Host
	helperSeenLog.Lock()
	seen := helperSeenLog.m[k]
	helperSeenLog.m[k] = true
	helperSeenLog.Unlock()
	if !seen {
		log.Printf("helper %s v%s on %s", h.Svc, h.Ver, h.Host)
	}
}

// --- resume ---

// extResume is a resume waiting for the helper's first live report: Edge did it over
// CDP (resumeAt); Chrome has no CDP, so the next reports from that service carry the
// seek (for about 30 s after the player first shows).
type extResume struct {
	mu sync.Mutex
	rs resumeState
}

type resumeState struct {
	svc       string
	pos, dur  int
	armed     time.Time
	live      time.Time
	sent      time.Time
	tries     int
	maxWait   time.Duration // from arming (the page may take long to load)
	liveSpan  time.Duration // from the first live report
	retryGap  time.Duration
	maxTries  int
	adSlack   float64
	adMinSlop int
	there     time.Time // when reports first sat within 30 s of the target (zero: not there now)
	reseeked  bool      // the one retry after the player's own bookmark won back has been used
}

func (r *extResume) arm(svc string, pos, dur int, now time.Time) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.rs = resumeState{svc: svc, pos: pos, dur: dur, armed: now, maxWait: 90 * time.Second, liveSpan: 75 * time.Second,
		retryGap: 2 * time.Second, maxTries: 4, adSlack: 0.06, adMinSlop: 90}
}

func (r *extResume) clear() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.rs = resumeState{}
}

// pending says whether a resume for svc is waiting.
func (r *extResume) pending(svc string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.rs.svc == svc && r.rs.svc != ""
}

// step looks at one live report and says whether to seek now (to ms). A video of
// another length than the episode is an ad: wait it out.
func (r *extResume) step(svc string, pos, dur int, ad bool, now time.Time) (int64, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.rs.svc == "" || r.rs.svc != svc {
		return 0, false
	}
	if now.Sub(r.rs.armed) > r.rs.maxWait || (!r.rs.live.IsZero() && now.Sub(r.rs.live) > r.rs.liveSpan) {
		r.rs = resumeState{}
		return 0, false
	}
	if ad {
		return 0, false
	}
	if r.rs.dur > 0 && dur > 0 {
		slop := float64(r.rs.dur) * r.rs.adSlack
		if slop < float64(r.rs.adMinSlop) {
			slop = float64(r.rs.adMinSlop)
		}
		if d := float64(dur - r.rs.dur); d > slop || -d > slop {
			return 0, false
		}
	}
	if r.rs.live.IsZero() {
		r.rs.live = now
	}
	if pos >= r.rs.pos-30 { // there: but keep watching, Prime's own bookmark may still win it back (2026-11-13)
		if r.rs.there.IsZero() {
			r.rs.there = now
		}
		if now.Sub(r.rs.there) >= resumeStable {
			if r.rs.tries > 0 {
				log.Printf("resume: %s at %d:%02d", svc, r.rs.pos/60, r.rs.pos%60)
			}
			r.rs = resumeState{}
		}
		return 0, false
	}
	if !r.rs.there.IsZero() { // it was there and has dropped back
		wasThere := now.Sub(r.rs.there)
		r.rs.there = time.Time{}
		if r.rs.pos-pos > 60 && wasThere <= 30*time.Second {
			if r.rs.reseeked {
				log.Printf("resume: %s lost the position again; leaving it", svc)
				r.rs = resumeState{}
				return 0, false
			}
			log.Printf("resume: %s went back to %d:%02d after the seek; seeking once more", svc, pos/60, pos%60)
			r.rs.reseeked, r.rs.tries, r.rs.sent = true, 0, time.Time{}
		}
	}
	if !r.rs.sent.IsZero() && now.Sub(r.rs.sent) < r.rs.retryGap {
		return 0, false
	}
	if r.rs.tries >= r.rs.maxTries {
		log.Printf("resume: %s would not seek", svc)
		r.rs = resumeState{}
		return 0, false
	}
	r.rs.tries++
	r.rs.sent = now
	return int64(r.rs.pos-3) * 1000, true
}

// resumeStable is how long reports must stay near the target before a resume is over.
const resumeStable = 10 * time.Second

// extFor says whether service id opens in Chrome right now.
func (a *App) extFor(id string) bool {
	s := services.ByID(id)
	return s != nil && a.useExternal(s)
}

// resumeExt is resumeAt for a service in Chrome: it keeps the resume until the helper
// first reports live, then sends a seekto in the reply (never through the 2 s queue).
func (a *App) resumeExt(e history.Entry) {
	if e.Opened || e.Pos < 60 || e.Dur > 0 && e.Pos > e.Dur-90 {
		return
	}
	a.ld.mu.Lock()
	g := history.Key(e.URL)
	if e.URL == "" && e.Show != "" { // the page address is not known yet: the card is the show's
		g = e.Service + "|" + strings.ToLower(e.Show)
	}
	a.ld.resuming = resumeHold{group: g, pos: e.Pos, until: time.Now().Add(2 * time.Minute)}
	a.ld.mu.Unlock()
	a.resume.arm(e.Service, e.Pos, e.Dur, time.Now())
}

// --- the page snapshot ---

// watchOther handles one watch report from Prime or JioHotstar; the reply carries the
// commands queued for the helper.
func (a *App) watchOther(svc string, in extWatch, now time.Time) []nfCmd {
	if in.CmdErr != "" {
		a.playFallback(svc, in, now) // not behind errChanged: the same failure on a later press needs its own fallback
	}
	if in.CmdErr != "" && a.nf.errChanged(in.CmdErr) {
		log.Printf("%s helper: %s", svc, in.CmdErr)
		if a.hub != nil && tracksUnavailable(in.CmdErr) {
			// the player greys its subtitles button out for this title: nothing to press
			name := svc
			if s := services.ByID(svc); s != nil {
				name = s.Name
			}
			a.tracksNote(svc, name+" says subtitles are not available for this title right now.")
		} else if a.hub != nil && strings.HasPrefix(in.CmdErr, "tracks:") {
			a.otherTracksFailed(svc)
		} else if a.hub != nil && strings.HasPrefix(in.CmdErr, "settrack:") {
			a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "That choice did not take on " + svcName(svc) + ". Try Subtitles again."})
		} else if a.hub != nil && strings.HasPrefix(in.CmdErr, "speed:") {
			a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "Speed did not take on " + svcName(svc) + "."})
		}
	}
	if !extHostOK(svc, in.URL) {
		return []nfCmd{}
	}
	if a.nf.setAd(in.Ad) {
		if in.Ad {
			log.Printf("%s helper: ad started", svc)
		} else {
			log.Printf("%s helper: ad ended", svc)
		}
	}
	a.nf.setCov(in.Cov, now)
	if in.Ad { // an ad on the player: keep the helper live for commands, but it is not what he watches
		a.nf.touch(now)
		playing := in.Playing == nil || *in.Playing // the ad video's own flag
		if a.nf.setAdMedia(playing, now) && a.hub != nil {
			go a.broadcast()
		}
	} else if in.Dur > 0 {
		playing := in.Playing == nil || *in.Playing
		if a.nf.setAs(svc, Media{Playing: playing, Pos: int(in.Pos), Dur: int(in.Dur), Rate: in.Rate}, now) && a.hub != nil {
			go a.broadcast()
		}
		// Prime: a card only while the player names what plays; a trailer on a title page has no player title
		card := svc != "prime" || (in.W != nil && strings.TrimSpace(in.W.PT) != "")
		if a.ld != nil && in.W != nil && extHostOK(svc, in.W.Href) && card && !strings.Contains(in.W.Href, "autoplay=trailer") && a.nf.noteDue(now) {
			w := *in.W
			w.Pos, w.Dur, w.Playing, w.Has = int(in.Pos), int(in.Dur), playing, true
			a.noteWatching(svc, &w)
		}
		if ms, ok := a.resume.step(svc, int(in.Pos), int(in.Dur), false, now); ok {
			a.nf.push(nfCmd{A: "seekto", Ms: ms}, now)
		}
	}
	return a.nf.take(now)
}

// playFallback: the helper's v.play() was refused or put back (Chrome ignores --autoplay-policy when it was already
// running, so the page may want a real key). Once per press, only while the report says it is still paused, press the
// media key through the window and say so in the log.
func (a *App) playFallback(svc string, in extWatch, now time.Time) {
	if !strings.HasPrefix(in.CmdErr, "play:") || (in.Playing != nil && *in.Playing) {
		return
	}
	if !a.nf.playFallbackDue(now) {
		return
	}
	go func() {
		time.Sleep(700 * time.Millisecond) // the page may have started on its own: reports come every 500 ms, so look at the newest one after a beat
		if m, ok := a.nf.get(time.Now()); ok && m.Playing {
			log.Printf("%s: the page started by itself; no media key", svc)
			return
		}
		log.Printf("%s: the page would not start (%s); pressing the media key through the window", svc, in.CmdErr)
		probeNote("play-fallback", map[string]any{"svc": svc, "err": in.CmdErr})
		if err := a.ext.Key("playpause"); err != nil {
			log.Printf("ext: play fallback: %v", err)
		}
	}()
}

// tracksUnavailable says whether a helper error is the tracks command finding the
// player's subtitles button greyed out. Other commands' ": unavailable" mean nothing here.
func tracksUnavailable(e string) bool {
	return strings.HasPrefix(e, "tracks:") && strings.HasSuffix(e, ": unavailable")
}

// svcName is a service's display name (its id when unknown).
func svcName(id string) string {
	if s := services.ByID(id); s != nil {
		return s.Name
	}
	return id
}

// otherTracksFailed tells the phone the helper could not read the player's menu: the
// pad becomes a cursor so the menu can be used on the TV by hand.
func (a *App) otherTracksFailed(svc string) {
	name := svc
	if s := services.ByID(svc); s != nil {
		name = s.Name
	}
	a.menuUntil.Store(time.Now().Add(30 * time.Second).UnixMilli())
	go a.broadcast()
	go func() { time.Sleep(30500 * time.Millisecond); a.broadcast() }()
	a.tracksNote(svc, "TV Mode could not read "+name+"'s menu. Move the cursor to its subtitles button on the TV and tap.")
}

// --- link book ---

var (
	reHotstarShow = regexp.MustCompile(`^/(?:[a-z]{2}/)?(?:shows|movies|tv)/[^/]+/\d+(?:/[^/]+/\d+)?(?:/watch)?$`)
	rePrimeDetail = regexp.MustCompile(`^(?:/gp/video)?(?:/region/[a-z]+)?/detail/[A-Za-z0-9]+`)
)

// extLinkOK says whether u is an address worth keeping for svc.
func extLinkOK(svc, u string) bool {
	if !extHostOK(svc, u) {
		return false
	}
	p, _ := url.Parse(u)
	switch svc {
	case "jiohotstar":
		return reHotstarShow.MatchString(p.Path)
	case "prime":
		return rePrimeDetail.MatchString(p.Path)
	}
	return false
}

// noteOtherLinks keeps what the helper found on a Prime or JioHotstar page: the title's
// page, or every episode's address ([season, episode, url]).
func (a *App) noteOtherLinks(svc string, in extLink) {
	if a.ld == nil || in.Title == "" {
		return
	}
	if extLinkOK(svc, in.URL) && !strings.Contains(in.URL, "/watch") {
		a.linkPut(linkKey(svc, in.Title, 0, 0), strings.SplitN(in.URL, "?", 2)[0])
	}
	for _, x := range in.Eps {
		if len(x) != 3 {
			continue
		}
		se, _ := x[0].(float64)
		ep, _ := x[1].(float64)
		u, _ := x[2].(string)
		if se > 0 && ep > 0 && extLinkOK(svc, u) {
			k := linkKey(svc, in.Title, int(se), int(ep))
			if svc == "prime" && a.linkGet(k) != "" {
				continue // the scout's address already plays it; a page address would not
			}
			a.linkPut(k, strings.SplitN(u, "?", 2)[0]+primePlay(svc, u))
		}
	}
}

// primePlay keeps Prime's own play flag on an episode address.
func primePlay(svc, u string) string {
	if svc == "prime" && strings.Contains(u, "autoplay=1") {
		return "?autoplay=1"
	}
	return ""
}

// episodeLinkFromWatch records the address of the episode now playing in the link
// book (the way noteNetflix does) once the card knows its season and episode.
func (a *App) episodeLinkFromWatch(e history.Entry) {
	if e.Show == "" || e.Season <= 0 || e.Episode <= 0 {
		return
	}
	switch e.Service {
	case "jiohotstar":
		a.linkPut(linkKey(e.Service, e.Show, e.Season, e.Episode), e.URL)
	case "prime":
		// only an address that plays straight away; a season page would open to a list
		if strings.Contains(e.URL, "autoplay=1") && !strings.Contains(e.URL, "autoplay=trailer") && rePrimeDetail.MatchString(urlPath(e.URL)) {
			a.linkPut(linkKey(e.Service, e.Show, e.Season, e.Episode), e.URL)
		}
	}
}

func urlPath(u string) string {
	p, err := url.Parse(u)
	if err != nil {
		return ""
	}
	return p.Path
}

// otherSubs answers the phone's Subtitles button on Prime or JioHotstar in Chrome: the
// helper reads the player's menu (the menu opens, is read and closes again).
func (a *App) otherSubs(sv *services.Service) {
	if a.nf.adNow(time.Now()) { // the menu on an ad is not the show's: nothing to read, nothing to fail
		a.tracksNote(sv.ID, "Subtitles come back after the ad")
		return
	}
	a.wakePlayer()
	if a.nf.push(nfCmd{A: "tracks"}, time.Now()) {
		return
	}
	if a.helperSeen() { // the helper is there but no video is playing
		a.tracksNote(sv.ID, "Start the video first. The list comes from "+sv.Name+"'s player once it plays.")
		return
	}
	a.menuUntil.Store(time.Now().Add(30 * time.Second).UnixMilli())
	a.broadcast()
	go func() { time.Sleep(30500 * time.Millisecond); a.broadcast() }()
	a.hub.broadcastRemotes(map[string]string{"t": "error", "msg": "Move the cursor to the subtitles button on " + sv.Name + " and tap. (The TV Mode helper in Chrome is not running.)"})
}

// wakePlayer gives Prime and JioHotstar a real mouse move on the TV for 3 s, so their
// player draws its buttons (the subtitles one too) while the helper reads the menu:
// the 2026-11-13 probe found no player buttons at all without one.
func (a *App) wakePlayer() {
	if p := a.ext.Pointer(); p != nil {
		go p.Wake(3 * time.Second)
	}
}
