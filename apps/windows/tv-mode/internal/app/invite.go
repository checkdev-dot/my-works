package app

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"tvmode/internal/certs"
)

// A one-time invite: "Add a phone", "Show on TV" and "Share link" hand out
// <origin>/remote/#i=<code>&p=<pcid> instead of the permanent token. The code is
// 128 random bits, works for 10 minutes and for one phone. That phone proves it
// with sha256(code + ":" + nonce) at the hello, and the PC answers ok plus
// {"t":"token","k":<the real token>} (link.go).
const (
	inviteTTL = 10 * time.Minute
	inviteCap = 5
)

type invite struct {
	exp time.Time
	by  string // who asked (see inviteBy); "" means nobody, never reused
}

type inviteBook struct {
	mu  sync.Mutex
	exp map[string]invite
	now func() time.Time
}

var invites = &inviteBook{exp: map[string]invite{}, now: time.Now}

// inviteBy names the connection that asked, so asking again hands back its own live code.
func inviteBy(c *client) string { return fmt.Sprintf("%p", c) }

func (b *inviteBook) prune() {
	t := b.now()
	for c, e := range b.exp {
		if !t.Before(e.exp) {
			delete(b.exp, c)
		}
	}
}

// create returns by's newest live code if it has one, else makes a fresh one. The book
// keeps at most inviteCap live codes; when full, the oldest goes.
func (b *inviteBook) create(by string) string {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.prune()
	if by != "" {
		best, bt := "", time.Time{}
		for c, e := range b.exp {
			if e.by == by && (best == "" || e.exp.After(bt)) {
				best, bt = c, e.exp
			}
		}
		if best != "" {
			return best
		}
	}
	for len(b.exp) >= inviteCap {
		old, ot := "", time.Time{}
		for c, e := range b.exp {
			if old == "" || e.exp.Before(ot) {
				old, ot = c, e.exp
			}
		}
		delete(b.exp, old)
	}
	raw := make([]byte, 16)
	_, _ = rand.Read(raw)
	code := hex.EncodeToString(raw)
	b.exp[code] = invite{exp: b.now().Add(inviteTTL), by: by}
	return code
}

// live reports whether code is still unused and unexpired, without using it.
func (b *inviteBook) live(code string) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	e, ok := b.exp[code]
	return ok && b.now().Before(e.exp)
}

// revoke drops code (the phone closed Add a phone); an unknown code is ignored.
func (b *inviteBook) revoke(code string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.exp, code)
}

// take checks the phone's proof for the hello nonce against every live code. A match
// marks that code used (it is gone) and returns true.
func (b *inviteBook) take(nonce, proof string) bool {
	proof = strings.ToLower(proof)
	b.mu.Lock()
	defer b.mu.Unlock()
	b.prune()
	hit := ""
	for c := range b.exp {
		if subtle.ConstantTimeCompare([]byte(proof), []byte(certs.AuthProof(c, nonce))) == 1 {
			hit = c
		}
	}
	if hit == "" {
		return false
	}
	delete(b.exp, hit)
	return true
}

func (a *App) inviteURL(code string) string {
	return a.RemoteOrigin() + "/remote/#i=" + code + "&p=" + certs.PCID(a.cfg.RelayKey)
}

// cancelInvite revokes the code in {"t":"invite","a":"cancel","i":code}.
func (a *App) cancelInvite(raw []byte) {
	var m struct {
		I string `json:"i"`
	}
	if json.Unmarshal(raw, &m) == nil {
		invites.revoke(m.I)
	}
}

// sendInvite answers {"t":"invite"} with {"t":"invite","url":...}.
func (a *App) sendInvite(c *client) {
	c.queue(map[string]any{"t": "invite", "url": a.inviteURL(invites.create(inviteBy(c)))})
}

// inviteFor is the code a phone named in a pairtv frame if it is still live, else its own newest or a new one.
func (a *App) inviteFor(c *client, raw []byte) string {
	var m struct {
		I string `json:"i"`
	}
	if json.Unmarshal(raw, &m) == nil && invites.live(m.I) {
		return m.I
	}
	return invites.create(inviteBy(c))
}
