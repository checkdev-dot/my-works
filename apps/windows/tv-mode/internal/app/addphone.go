package app

import (
	"sync"
	"time"
)

// "Add a phone": a phone asks for the pairing QR on the TV so another phone can
// scan it. It stays on the launcher until a new phone pairs, Back or Home is
// pressed, the asking phone taps Done, or 10 minutes pass (the life of the invite link). Every phone that
// pairs gets full control. The QR carries a one-time invite (invite.go), never the token.
var pairTV struct {
	sync.Mutex
	on  bool
	gen int
}

// showPairOnTV answers the phone with {"t":"pairtv","ok":...}; it cannot show
// over a streaming app, which sits in its own window above the launcher.
func (a *App) showPairOnTV(c *client, raw []byte) {
	if !a.onLauncher() || a.extActive() {
		c.queue(map[string]any{"t": "pairtv", "ok": false})
		return
	}
	pairTV.Lock()
	pairTV.on = true
	pairTV.gen++
	gen := pairTV.gen
	pairTV.Unlock()
	a.hub.broadcastScreens(map[string]any{"t": "pair", "url": a.inviteURL(a.inviteFor(c, raw))})
	c.queue(map[string]any{"t": "pairtv", "ok": true})
	time.AfterFunc(10*time.Minute, func() { a.hidePairOnTV(gen) })
}

// hidePairOnTV takes the QR down if it is up; gen 0 means whichever is showing.
// It reports whether it did, so Back can stop there.
func (a *App) hidePairOnTV(gen int) bool {
	pairTV.Lock()
	on := pairTV.on && (gen == 0 || gen == pairTV.gen)
	if on {
		pairTV.on = false
	}
	pairTV.Unlock()
	if on {
		a.hub.broadcastScreens(map[string]any{"t": "pair", "url": nil})
	}
	return on
}
