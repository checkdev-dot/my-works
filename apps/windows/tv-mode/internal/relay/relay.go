// Package relay is the reference implementation of the TV Mode relay: a room
// per PC, one PC socket and any number of phone sockets, frames forwarded
// between them. relay/worker.js is the same protocol on Cloudflare Workers;
// this one runs inside tvmode.exe so the phone can use the PC over LAN
// without any hosting (dev), and so the protocol can be tested here.
//
// GET /relay/<pcid>?role=pc&key=<pckey>   the PC. pcid must equal sha256(key)[:32].
// GET /relay/<pcid>?role=phone            a phone.
//
// To the PC:    {"sid":"..","ev":"open"|"close"} and {"sid":"..","d":<frame from that phone>}
// From the PC:  {"sid":"..","d":<frame>} to one phone, {"sid":"..","ev":"close"} to drop it.
// To a phone:   {"t":"pc"} / {"t":"nopc"} when the PC is or is not here, then raw frames from the PC.
// From a phone: any JSON object, forwarded as d.
package relay

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

const (
	maxFrame = 1 << 16
	writeTO  = 5 * time.Second
)

type sock struct {
	c    *websocket.Conn
	send chan []byte
}

func newSock(c *websocket.Conn) *sock { return &sock{c: c, send: make(chan []byte, 64)} }

func (s *sock) queue(b []byte) {
	select {
	case s.send <- b:
	default: // slow peer: drop this frame
	}
}

func (s *sock) writer(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case b := <-s.send:
			wctx, cancel := context.WithTimeout(ctx, writeTO)
			err := s.c.Write(wctx, websocket.MessageText, b)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

type room struct {
	mu     sync.Mutex
	pc     *sock
	phones map[string]*sock
}

// Relay holds the rooms.
type Relay struct {
	mu    sync.Mutex
	rooms map[string]*room
}

// New makes an empty relay.
func New() *Relay { return &Relay{rooms: map[string]*room{}} }

func (r *Relay) room(id string) *room {
	r.mu.Lock()
	defer r.mu.Unlock()
	rm := r.rooms[id]
	if rm == nil {
		rm = &room{phones: map[string]*sock{}}
		r.rooms[id] = rm
	}
	return rm
}

func sid() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Handler serves /relay/<pcid>.
func (r *Relay) Handler(w http.ResponseWriter, req *http.Request) {
	id := strings.TrimPrefix(req.URL.Path, "/relay/")
	if len(id) != 32 || strings.Contains(id, "/") {
		http.Error(w, "bad room", http.StatusBadRequest)
		return
	}
	q := req.URL.Query()
	switch q.Get("role") {
	case "pc":
		key := q.Get("key")
		h := sha256.Sum256([]byte(key))
		if hex.EncodeToString(h[:])[:32] != id {
			http.Error(w, "bad key", http.StatusForbidden)
			return
		}
		r.servePC(w, req, r.room(id))
	case "phone":
		r.servePhone(w, req, r.room(id))
	default:
		http.Error(w, "role?", http.StatusBadRequest)
	}
}

func accept(w http.ResponseWriter, req *http.Request) (*websocket.Conn, error) {
	c, err := websocket.Accept(w, req, &websocket.AcceptOptions{OriginPatterns: []string{"*"}})
	if err != nil {
		return nil, err
	}
	c.SetReadLimit(maxFrame)
	return c, nil
}

func (r *Relay) servePC(w http.ResponseWriter, req *http.Request, rm *room) {
	c, err := accept(w, req)
	if err != nil {
		return
	}
	s := newSock(c)
	ctx, cancel := context.WithCancel(req.Context())
	defer cancel()
	go s.writer(ctx)

	rm.mu.Lock()
	if old := rm.pc; old != nil {
		go old.c.Close(websocket.StatusPolicyViolation, "replaced")
	}
	rm.pc = s
	hello, _ := json.Marshal(map[string]string{"t": "pc"})
	for id, p := range rm.phones {
		p.queue(hello)
		ev, _ := json.Marshal(map[string]string{"sid": id, "ev": "open"})
		s.queue(ev)
	}
	rm.mu.Unlock()

	defer func() {
		rm.mu.Lock()
		if rm.pc == s {
			rm.pc = nil
			bye, _ := json.Marshal(map[string]string{"t": "nopc"})
			for _, p := range rm.phones {
				p.queue(bye)
			}
		}
		rm.mu.Unlock()
		_ = c.CloseNow()
	}()

	for {
		_, b, err := c.Read(ctx)
		if err != nil {
			return
		}
		var env struct {
			Sid string          `json:"sid"`
			Ev  string          `json:"ev"`
			D   json.RawMessage `json:"d"`
		}
		if json.Unmarshal(b, &env) != nil || env.Sid == "" {
			continue
		}
		rm.mu.Lock()
		p := rm.phones[env.Sid]
		rm.mu.Unlock()
		if p == nil {
			continue
		}
		if env.Ev == "close" {
			go p.c.Close(websocket.StatusPolicyViolation, "closed by pc")
			continue
		}
		if len(env.D) > 0 {
			p.queue(env.D)
		}
	}
}

func (r *Relay) servePhone(w http.ResponseWriter, req *http.Request, rm *room) {
	c, err := accept(w, req)
	if err != nil {
		return
	}
	s := newSock(c)
	id := sid()
	ctx, cancel := context.WithCancel(req.Context())
	defer cancel()
	go s.writer(ctx)

	rm.mu.Lock()
	rm.phones[id] = s
	pc := rm.pc
	rm.mu.Unlock()
	if pc != nil {
		b, _ := json.Marshal(map[string]string{"t": "pc"})
		s.queue(b)
		ev, _ := json.Marshal(map[string]string{"sid": id, "ev": "open"})
		pc.queue(ev)
	} else {
		b, _ := json.Marshal(map[string]string{"t": "nopc"})
		s.queue(b)
	}

	defer func() {
		rm.mu.Lock()
		delete(rm.phones, id)
		pc := rm.pc
		rm.mu.Unlock()
		if pc != nil {
			ev, _ := json.Marshal(map[string]string{"sid": id, "ev": "close"})
			pc.queue(ev)
		}
		_ = c.CloseNow()
	}()

	for {
		_, b, err := c.Read(ctx)
		if err != nil {
			return
		}
		if !json.Valid(b) || len(b) == 0 || b[0] != '{' {
			continue
		}
		rm.mu.Lock()
		pc := rm.pc
		rm.mu.Unlock()
		if pc == nil {
			continue
		}
		env, _ := json.Marshal(struct {
			Sid string          `json:"sid"`
			D   json.RawMessage `json:"d"`
		}{id, b})
		pc.queue(env)
	}
}
