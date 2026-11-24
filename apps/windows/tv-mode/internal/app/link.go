package app

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
	"github.com/pion/ice/v4"
	"github.com/pion/webrtc/v4"

	"tvmode/internal/certs"
)

// The PC keeps one outbound WebSocket to the relay (the public origin that
// also serves the remote page, or this binary's own /relay/ in dev). Each
// phone that joins the room becomes a session: it must answer a hello nonce
// with a proof of the token, then it may offer a WebRTC data channel. Frames
// go over the data channel when it is open (direct, usually LAN) and over the
// relay otherwise. See PROTOCOL.md.

// lanInterface keeps WebRTC on physical Wi-Fi/Ethernet adapters and skips
// switches the phone can never reach (Hyper-V/WSL, Bluetooth). vgate0 stays:
// the phone is on that network too and it was the only direct path seen.
func lanInterface(name string) bool {
	n := strings.ToLower(name)
	for _, bad := range []string{"vethernet", "bluetooth", "loopback", "wsl", "vmware", "virtualbox", "hyper-v"} {
		if strings.Contains(n, bad) {
			return false
		}
	}
	return true
}

type session struct {
	sid   string
	nonce string
	auth  atomic.Bool // set in the inbox, read in WebRTC callbacks and close()
	cl    *client
	l     *link

	seen seenRing
	work chan []byte
	// in carries relay frames to this session's own goroutine, so a frame that
	// stalls (2026-11-04: the phone went dead after a restart) holds up this phone
	// only, never the relay read loop and every other phone with it
	in   chan []byte
	quit chan struct{}
	once sync.Once

	born   time.Time    // when the relay announced this phone
	lastRx atomic.Int64 // unix nanos of the last frame from this phone (relay or channel)

	offer sync.Mutex // one offer at a time (offers run off the inbox goroutine)

	mu        sync.Mutex
	closed    bool // set by close(); checked before the session is admitted to the hub
	pc        *webrtc.PeerConnection
	dc        *webrtc.DataChannel
	dcOpen    atomic.Bool
	remoteSet bool                      // the phone offer is applied: candidates can be added
	pendIce   []webrtc.ICECandidateInit // candidates that came before that
}

type link struct {
	a    *App
	mu   sync.Mutex
	ws   *websocket.Conn
	sess map[string]*session

	nilLogged atomic.Bool // "no relay socket" is logged once per outage
}

var iceServers = []webrtc.ICEServer{{URLs: []string{"stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"}}}

func nonce() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// relayDial is the WebSocket URL the PC uses to join its room.
func (a *App) relayDial() string {
	// the same origin the QR names (RemoteOrigin): a PC that dialed a different relay
	// than its own QR left every scan at "PC off or asleep" (2026-11-11)
	origin := a.RemoteOrigin()
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		u = &url.URL{Scheme: "http", Host: "127.0.0.1:" + Port()}
	}
	if u.Scheme == "https" {
		u.Scheme = "wss"
	} else {
		u.Scheme = "ws"
	}
	u.Path = "/relay/" + certs.PCID(a.cfg.RelayKey)
	u.RawQuery = "role=pc&key=" + a.cfg.RelayKey
	return u.String()
}

// runLink keeps the relay connection up until ctx ends.
func (a *App) runLink(ctx context.Context) {
	l := a.link
	wait := time.Second
	go a.linkDownNote(ctx)
	for {
		t0 := time.Now()
		err := l.once(ctx)
		if ctx.Err() != nil {
			return
		}
		if time.Since(t0) > 30*time.Second { // a link that held: the next drop redials fast again
			wait = time.Second
		}
		msg := fmt.Sprint(err)
		var ce websocket.CloseError
		if errors.As(err, &ce) {
			msg = fmt.Sprintf("closed by the relay, code %d reason %q", int(ce.Code), ce.Reason)
		}
		if k := a.cfg.RelayKey; k != "" { // dial errors quote the URL, key included: never log it
			msg = strings.ReplaceAll(msg, k, "REDACTED")
		}
		log.Printf("relay: %s; retry in %s", msg, wait)
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
		if wait < 4*time.Second { // cap low: after an internet drop the phone waits on this redial
			wait *= 2
		}
	}
}

func (l *link) once(ctx context.Context) error {
	dctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	c, _, err := websocket.Dial(dctx, l.a.relayDial(), nil)
	cancel()
	if err != nil {
		return err
	}
	c.SetReadLimit(1 << 17) // the relay wraps 64 KB phone frames in its envelope
	l.mu.Lock()
	l.ws = c
	l.mu.Unlock()
	l.nilLogged.Store(false)
	log.Printf("relay: joined room %s", certs.PCID(l.a.cfg.RelayKey))

	cctx, stop := context.WithCancel(ctx)
	defer stop()
	defer func() {
		l.mu.Lock()
		l.ws = nil
		ss := l.sess
		l.sess = map[string]*session{}
		l.mu.Unlock()
		for _, s := range ss {
			log.Printf("relay: phone %s ended: PC link down", shortSid(s.sid))
			s.close()
		}
		_ = c.CloseNow()
	}()
	go func() { // keep the relay's idle timers quiet
		t := time.NewTicker(20 * time.Second)
		defer t.Stop()
		fails := 0
		for {
			select {
			case <-cctx.Done():
				return
			case <-t.C:
				pctx, pc := context.WithTimeout(cctx, 10*time.Second)
				err := c.Ping(pctx)
				pc()
				if err == nil {
					fails = 0
					continue
				}
				// one lost ping is a bad moment, two in a row is a dead socket
				if fails++; fails >= 2 {
					log.Printf("relay: %d keepalive pings failed (%v); closing the socket", fails, err)
					_ = c.CloseNow()
					return
				}
			}
		}
	}()
	go l.sweepIdle(cctx)
	for {
		_, b, err := c.Read(cctx)
		if err != nil {
			return err
		}
		var env struct {
			Sid string          `json:"sid"`
			Ev  string          `json:"ev"`
			D   json.RawMessage `json:"d"`
		}
		if json.Unmarshal(b, &env) != nil || env.Sid == "" {
			continue
		}
		switch env.Ev {
		case "open":
			log.Printf("relay: phone %s joined", env.Sid[:min(6, len(env.Sid))])
			l.open(env.Sid)
		case "close":
			log.Printf("relay: phone %s ended: relay close event", shortSid(env.Sid))
			l.drop(env.Sid)
		default:
			l.mu.Lock()
			s := l.sess[env.Sid]
			l.mu.Unlock()
			if s != nil && len(env.D) > 0 {
				select {
				case s.in <- append([]byte(nil), env.D...):
				default:
					log.Printf("relay: phone %s backed up, dropped a frame", shortSid(env.Sid))
				}
			}
		}
	}
}

// writeRelay sends one envelope to the relay.
// It reports an error only when there is no relay socket at all.
func (l *link) writeRelay(v any) error {
	b, _ := json.Marshal(v)
	l.mu.Lock()
	c := l.ws
	l.mu.Unlock()
	if c == nil {
		if l.nilLogged.CompareAndSwap(false, true) {
			log.Printf("relay: write dropped: no relay socket")
		}
		return errNoRelay
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := c.Write(ctx, websocket.MessageText, b); err != nil {
		log.Printf("relay: write: %v", err)
	}
	return nil
}

var errNoRelay = errors.New("no relay socket")

// idleDrop is how long a signed-in phone may stay silent. A phone with its screen off
// sends nothing, and a socket that really died gets a close from the relay anyway, so
// this only reaps ghosts; it must never drop a phone that is just lying on the bed.
const idleDrop = 2 * time.Hour

// maxSessions caps phones joined to the relay at once (signed in or not).
const maxSessions = 16

// sweepIdle closes authed sessions that sent nothing for idleDrop (a phone that went
// away without the relay saying so), and tells the relay so the phone redials.
func (l *link) sweepIdle(ctx context.Context) {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		l.mu.Lock()
		var idle []*session
		for _, s := range l.sess {
			if reapable(s, time.Now()) {
				idle = append(idle, s)
			}
		}
		l.mu.Unlock()
		for _, s := range idle {
			if s.auth.Load() {
				log.Printf("relay: phone %s ended: silent for over %v", shortSid(s.sid), idleDrop)
			} else {
				log.Printf("relay: phone %s ended: never signed in", shortSid(s.sid))
			}
			l.drop(s.sid)
			l.writeRelay(map[string]string{"sid": s.sid, "ev": "close"})
		}
	}
}

// reapable: a signed-in phone silent past idleDrop, or one that never signed in within 30 s.
func reapable(s *session, now time.Time) bool {
	if s.auth.Load() {
		return now.Sub(time.Unix(0, s.lastRx.Load())) > idleDrop
	}
	return now.Sub(s.born) > 30*time.Second
}

// idleFor is how long an authed session has been silent (0 for one not signed in yet).
func (s *session) idleFor() time.Duration {
	if !s.auth.Load() {
		return 0
	}
	return time.Since(time.Unix(0, s.lastRx.Load()))
}

// roomFor decides who makes way for a new join when the room is full: the oldest phone
// that never signed in (someone holding only the room id cannot lock real phones out).
// It returns full=true only when every slot is a signed-in phone.
func roomFor(sess map[string]*session, sid string) (evict string, full bool) {
	if _, replacing := sess[sid]; replacing || len(sess) < maxSessions {
		return "", false
	}
	var oldest *session
	for _, s := range sess {
		if !s.auth.Load() && (oldest == nil || s.born.Before(oldest.born)) {
			oldest = s
		}
	}
	if oldest == nil {
		return "", true
	}
	return oldest.sid, false
}

func (l *link) open(sid string) {
	l.mu.Lock()
	evict, full := roomFor(l.sess, sid)
	n := len(l.sess)
	l.mu.Unlock()
	if full {
		log.Printf("relay: phone %s refused: %d signed-in phones already joined", shortSid(sid), n)
		l.writeRelay(map[string]string{"sid": sid, "ev": "close"})
		return
	}
	if evict != "" {
		log.Printf("relay: phone %s ended: room full, made way for a new join", shortSid(evict))
		l.drop(evict)
		l.writeRelay(map[string]string{"sid": evict, "ev": "close"})
	}
	s := &session{sid: sid, born: time.Now(), nonce: nonce(), l: l, work: make(chan []byte, 256), in: make(chan []byte, 256), quit: make(chan struct{})}
	s.lastRx.Store(time.Now().UnixNano())
	s.cl = newClient(true, s.write)
	go s.inbox()
	l.mu.Lock()
	if old := l.sess[sid]; old != nil {
		log.Printf("relay: phone %s ended: replaced by a new join", shortSid(sid))
		go old.close()
	}
	l.sess[sid] = s
	l.mu.Unlock()
	l.writeRelay(struct {
		Sid string            `json:"sid"`
		D   map[string]string `json:"d"`
	}{sid, map[string]string{"t": "hello", "n": s.nonce}})
}

func (l *link) drop(sid string) {
	l.mu.Lock()
	s := l.sess[sid]
	delete(l.sess, sid)
	l.mu.Unlock()
	if s != nil {
		s.close()
	}
}

// write is the client's transport: data channel when open, else the relay.
func (s *session) write(_ context.Context, b []byte) error {
	if s.dcOpen.Load() {
		s.mu.Lock()
		dc := s.dc
		s.mu.Unlock()
		if dc != nil && dc.SendText(string(b)) == nil {
			return nil
		}
	}
	return s.l.writeRelay(struct {
		Sid string          `json:"sid"`
		D   json.RawMessage `json:"d"`
	}{s.sid, b})
}

// inbox handles this session's relay frames in order. A frame that takes over
// 8 s saves every goroutine's stack (once a run) so the stall can be read.
func (s *session) inbox() {
	for {
		select {
		case <-s.quit:
			return
		case raw := <-s.in:
			t := time.AfterFunc(8*time.Second, func() {
				if stuckDumped.CompareAndSwap(false, true) {
					log.Printf("relay: a frame from phone %s has taken 8 s; stacks in %s", shortSid(s.sid), dumpStacks("relay frame stuck"))
				}
			})
			s.onRelay(raw)
			t.Stop()
		}
	}
}

var stuckDumped atomic.Bool

// close ends the session on both transports and the hub.
func (s *session) close() {
	s.once.Do(func() { close(s.quit) })
	s.mu.Lock()
	s.closed = true // from here no auth frame can admit this session
	pc := s.pc
	s.pc, s.dc = nil, nil
	s.mu.Unlock()
	s.dcOpen.Store(false)
	if pc != nil {
		_ = pc.Close()
	}
	if s.auth.CompareAndSwap(true, false) {
		s.cl.stop()
		n := s.l.a.hub.remove(s.cl)
		s.l.a.phoneChanged(n)
	}
}

// onRelay handles one frame from the phone that came through the relay.
func (s *session) onRelay(raw []byte) {
	var m struct {
		T string `json:"t"`
		H string `json:"h"`
	}
	if json.Unmarshal(raw, &m) != nil {
		return
	}
	s.lastRx.Store(time.Now().UnixNano())
	if !s.auth.Load() {
		if m.T != "auth" {
			return
		}
		want := certs.AuthProof(s.l.a.cfg.Token, s.nonce)
		invited := false
		proofOK := subtle.ConstantTimeCompare([]byte(strings.ToLower(m.H)), []byte(want)) == 1
		if !proofOK {
			invited = invites.take(s.nonce, m.H) // a one-time invite (invite.go)
		}
		if !proofOK && !invited {
			log.Printf("relay: phone %s ended: proof does not match, not paired", shortSid(s.sid))
			s.l.writeRelay(struct {
				Sid string         `json:"sid"`
				D   map[string]any `json:"d"`
			}{s.sid, map[string]any{"t": "error", "msg": "This phone is not paired. Scan the QR on the TV."}})
			time.AfterFunc(300*time.Millisecond, func() {
				s.l.writeRelay(map[string]string{"sid": s.sid, "ev": "close"})
			})
			return
		}
		if !s.admit() {
			log.Printf("relay: phone %s closed while signing in; not admitted", shortSid(s.sid))
			return
		}
		log.Printf("relay: phone %s paired", shortSid(s.sid))
		a := s.l.a
		a.markPaired()
		if invited {
			a.hidePairOnTV(0) // the new phone is in: the Add a phone QR has done its job (a reconnect leaves it up)
		}
		go s.cl.writer(a.ctx)
		go s.worker()
		a.phoneChanged(a.hub.remoteCount())
		s.cl.queue(map[string]string{"t": "ok"})
		if invited {
			s.cl.queue(map[string]string{"t": "token", "k": a.cfg.Token}) // the invite buys the real token, once
		}
		a.queueInitial(s.cl)
		return
	}
	switch m.T {
	case "offer":
		go s.onOffer(raw) // building a PeerConnection must never delay pings behind it
	case "ice":
		s.onICE(raw)
	default:
		// The phone only uses the relay for control once it has written the
		// data channel off, so stop sending it state over a channel it ignores.
		s.dcOpen.Store(false)
		s.receive(raw, s.relayReply)
	}
}

// admit marks the session signed in and adds it to the hub, unless close() already ran.
// Both happen under s.mu, and close() sets closed under the same lock, so a session closed
// mid-auth can never leave a ghost client in the hub.
func (s *session) admit() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return false
	}
	s.auth.Store(true)
	s.l.a.hub.add(s.cl)
	return true
}

func (s *session) onOffer(raw []byte) {
	var m struct {
		SDP string `json:"sdp"`
	}
	if json.Unmarshal(raw, &m) != nil || m.SDP == "" {
		return
	}
	s.offer.Lock()
	defer s.offer.Unlock()
	s.mu.Lock()
	s.remoteSet = false // candidates wait until this offer is applied
	if old := s.pc; old != nil {
		s.pc, s.dc = nil, nil
		s.dcOpen.Store(false)
		go old.Close()
	}
	s.mu.Unlock()

	// pion drops a quiet connection as "disconnected" after 5 s by default, which
	// is about one Chrome consent-check interval: the channel died ~6 s after
	// connecting. Give it room, and keep checking every 2 s.
	se := webrtc.SettingEngine{}
	se.SetICETimeouts(20*time.Second, 40*time.Second, 2*time.Second)
	// Skip adapters the phone can't reach (Hyper-V/WSL switches, Bluetooth).
	se.SetInterfaceFilter(lanInterface)
	se.SetNetworkTypes([]webrtc.NetworkType{webrtc.NetworkTypeUDP4})
	// Chrome hides the phone's LAN address behind a .local mDNS name; resolve
	// it, or the only usable path is a peer-reflexive one over the VPN.
	se.SetICEMulticastDNSMode(ice.MulticastDNSModeQueryOnly)
	pc, err := webrtc.NewAPI(webrtc.WithSettingEngine(se)).NewPeerConnection(webrtc.Configuration{ICEServers: iceServers})
	if err != nil {
		log.Printf("webrtc: %v", err)
		return
	}
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		_ = pc.Close()
		return
	}
	s.pc = pc
	s.mu.Unlock()

	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c == nil {
			return
		}
		s.l.writeRelay(struct {
			Sid string         `json:"sid"`
			D   map[string]any `json:"d"`
		}{s.sid, map[string]any{"t": "ice", "c": c.ToJSON()}})
	})
	pc.OnConnectionStateChange(func(st webrtc.PeerConnectionState) {
		log.Printf("webrtc %s: %s", shortSid(s.sid), st)
		if st == webrtc.PeerConnectionStateConnected {
			if p, err := pc.SCTP().Transport().ICETransport().GetSelectedCandidatePair(); err == nil && p != nil {
				log.Printf("webrtc %s: pair %s %s:%d <-> %s %s:%d", shortSid(s.sid),
					p.Local.Typ, p.Local.Address, p.Local.Port, p.Remote.Typ, p.Remote.Address, p.Remote.Port)
			}
		}
		if st == webrtc.PeerConnectionStateFailed || st == webrtc.PeerConnectionStateClosed || st == webrtc.PeerConnectionStateDisconnected {
			s.dcOpen.Store(false)
		}
	})
	pc.OnDataChannel(func(dc *webrtc.DataChannel) {
		s.mu.Lock()
		s.dc = dc
		s.mu.Unlock()
		dc.OnOpen(func() {
			s.dcOpen.Store(true)
			log.Printf("webrtc %s: data channel open", shortSid(s.sid))
			s.l.a.queueInitial(s.cl)
		})
		dc.OnClose(func() { s.dcOpen.Store(false) })
		dc.OnMessage(func(msg webrtc.DataChannelMessage) {
			if msg.IsString && len(msg.Data) > 0 && msg.Data[0] == '{' && s.auth.Load() {
				s.lastRx.Store(time.Now().UnixNano())
				s.receive(msg.Data, func(b []byte) { _ = dc.SendText(string(b)) })
			}
		})
	})

	if err := pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: m.SDP}); err != nil {
		log.Printf("webrtc offer: %v", err)
		return
	}
	// the offer is in: add the candidates that arrived before it
	s.mu.Lock()
	s.remoteSet = true
	early := s.pendIce
	s.pendIce = nil
	s.mu.Unlock()
	for _, c := range early {
		_ = pc.AddICECandidate(c)
	}
	ans, err := pc.CreateAnswer(nil)
	if err == nil {
		err = pc.SetLocalDescription(ans)
	}
	if err != nil {
		log.Printf("webrtc answer: %v", err)
		return
	}
	s.l.writeRelay(struct {
		Sid string         `json:"sid"`
		D   map[string]any `json:"d"`
	}{s.sid, map[string]any{"t": "answer", "sdp": pc.LocalDescription().SDP}})
}

func (s *session) onICE(raw []byte) {
	var m struct {
		C webrtc.ICECandidateInit `json:"c"`
	}
	if json.Unmarshal(raw, &m) != nil || m.C.Candidate == "" {
		return
	}
	s.mu.Lock()
	pc := s.pc
	if pc == nil || !s.remoteSet { // the offer is still being applied: keep it for then
		if len(s.pendIce) < 64 {
			s.pendIce = append(s.pendIce, m.C)
		}
		s.mu.Unlock()
		return
	}
	s.mu.Unlock()
	_ = pc.AddICECandidate(m.C)
}

// relayReply answers on the relay path, straight to the socket (not through
// the client queue, which can drop frames and prefers the data channel).
func (s *session) relayReply(b []byte) {
	s.l.writeRelay(struct {
		Sid string          `json:"sid"`
		D   json.RawMessage `json:"d"`
	}{s.sid, b})
}

// receive is the first thing that sees a phone frame, on whichever path it
// came in. It answers pings and acks presses at once (before any slow work),
// drops repeats, and hands the rest to the ordered worker so one slow press
// (a page load, a CDP timeout) never stalls the frames behind it.
func (s *session) receive(raw []byte, reply func([]byte)) {
	var h struct {
		T    string  `json:"t"`
		ID   string  `json:"id"`
		TS   float64 `json:"ts"`
		RTT  float64 `json:"rtt"`
		Path string  `json:"path"`
	}
	if json.Unmarshal(raw, &h) != nil {
		return
	}
	if h.T == "ping" {
		reply([]byte(fmt.Sprintf(`{"t":"pong","ts":%.0f}`, h.TS)))
		if h.RTT > 0 {
			s.l.a.lat.add(h.Path, h.RTT)
		}
		return
	}
	if h.ID != "" {
		reply(ackFrame(h.ID))
		if s.seen.dup(h.ID) {
			return
		}
	}
	// pion reuses the buffer behind a data-channel message once the callback
	// returns, and the worker reads it later: queue a copy.
	raw = append([]byte(nil), raw...)
	select {
	case s.work <- raw:
	default: // backed up: drop motion, keep presses by evicting nothing (they are rare)
		if h.T != "aim" && h.T != "pad" {
			log.Printf("remote: queue full, dropped %s", h.T)
		}
	}
}

func (s *session) worker() {
	for {
		select {
		case <-s.cl.done:
			return
		case <-s.l.a.ctx.Done():
			return
		case raw := <-s.work:
			s.l.a.handleRemote(s.cl, raw)
		}
	}
}

// linkDownNote says on the TV when phones cannot reach this PC (no relay socket for
// 20 s): the phone only says "PC off or asleep", which sent Dev hunting on 2026-11-11
// when a TV Mode started without its saved settings never joined the relay.
func (a *App) linkDownNote(ctx context.Context) {
	down := time.Time{}
	told := false
	t := time.NewTicker(5 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		a.link.mu.Lock()
		up := a.link.ws != nil
		a.link.mu.Unlock()
		if up {
			if told {
				log.Printf("relay: phone link back")
				a.show("phone", map[string]any{"on": a.hub.remoteCount() > 0})
			}
			down, told = time.Time{}, false
			continue
		}
		if down.IsZero() {
			down = time.Now()
		}
		if !told && time.Since(down) > 20*time.Second {
			told = true
			why := "Restart TV Mode from the desktop shortcut"
			if a.cfg.Remote == "" {
				why = "TV Mode started without its saved settings. Restart it from the desktop shortcut"
			}
			log.Printf("relay: phone link down for 20 s: %s", why)
			a.show("link", map[string]any{"why": why})
		}
	}
}

// shortSid is the first 6 characters of a session id, for logs (a short id must not panic).
func shortSid(s string) string {
	if len(s) > 6 {
		return s[:6]
	}
	return s
}
