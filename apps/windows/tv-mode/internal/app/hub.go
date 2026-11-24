// Package app wires the servers, the browser, input and Windows services
// together and speaks the protocol in PROTOCOL.md.
package app

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// Media is the playback block in a state frame.
type Media struct {
	Playing bool    `json:"playing"`
	Pos     int     `json:"pos"`
	Dur     int     `json:"dur"`
	Ad      bool    `json:"ad,omitempty"`   // an ad shows on the player (Prime, JioHotstar): Playing is the ad's; Pos and Dur stay the show's
	Rate    float64 `json:"rate,omitempty"` // the video's playback rate, from the helper's report (0: not known)
}

// State is the frame broadcast to remotes and the launcher.
type State struct {
	T         string `json:"t"`
	App       string `json:"app"`
	Focus     int    `json:"focus"`
	Vol       int    `json:"vol"`
	Muted     bool   `json:"muted"`
	Media     *Media `json:"media"`
	SleepAt   *int64 `json:"sleepAt"`
	Countdown *int   `json:"countdown"`
	Phone     bool   `json:"phone"`
	Point     bool   `json:"point"`
	ScreenOn  bool   `json:"screenOn"`       // the TV monitor is on (false: off or darkened)
	Typing    bool   `json:"typing"`         // a text box has focus on the TV: the phone opens its keyboard
	Eps       bool   `json:"eps"`            // an episode list can be built for what plays (a show key, or episode links)
	PadMode   string `json:"padMode"`        // what the phone's touchpad does on this page: focus, cursor or player
	Menu      bool   `json:"menu,omitempty"` // a player menu is open on the TV for the cursor: the phone shows Close menu
}

// client is one connected page: the launcher over /ws/screen, or a phone
// session (relay or data channel). write is its transport.
type client struct {
	send   chan []byte
	remote bool
	write  func(ctx context.Context, b []byte) error
	done   chan struct{}
	once   sync.Once
}

func newClient(remote bool, write func(ctx context.Context, b []byte) error) *client {
	return &client{send: make(chan []byte, 64), remote: remote, write: write, done: make(chan struct{})}
}

// wsClient wraps a WebSocket as a client.
func wsClient(c *websocket.Conn, remote bool) *client {
	return newClient(remote, func(ctx context.Context, b []byte) error {
		return c.Write(ctx, websocket.MessageText, b)
	})
}

// stop ends the writer of a client whose context outlives it.
func (c *client) stop() { c.once.Do(func() { close(c.done) }) }

// hub fans frames out to every connected socket.
type hub struct {
	mu      sync.Mutex
	clients map[*client]struct{}
}

func newHub() *hub { return &hub{clients: map[*client]struct{}{}} }

func (h *hub) add(c *client) {
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
}

func (h *hub) remove(c *client) (remotes int) {
	h.mu.Lock()
	delete(h.clients, c)
	for x := range h.clients {
		if x.remote {
			remotes++
		}
	}
	h.mu.Unlock()
	return
}

func (h *hub) remoteCount() (n int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for x := range h.clients {
		if x.remote {
			n++
		}
	}
	return
}

func (h *hub) broadcast(v any) {
	b, _ := json.Marshal(v)
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		select {
		case c.send <- b:
		default: // slow client: drop this frame
		}
	}
}

// broadcastScreens sends to the launcher page(s) only, not to phones.
func (h *hub) broadcastScreens(v any) {
	b, _ := json.Marshal(v)
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		if c.remote {
			continue
		}
		select {
		case c.send <- b:
		default:
		}
	}
}

func (h *hub) broadcastRemotes(v any) {
	b, _ := json.Marshal(v)
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		if !c.remote {
			continue
		}
		select {
		case c.send <- b:
		default:
		}
	}
}

// writer drains the send queue into the socket.
func (c *client) writer(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-c.done:
			return
		case b := <-c.send:
			wctx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err := c.write(wctx, b)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

// queue sends one frame to this client only.
func (c *client) queue(v any) {
	b, _ := json.Marshal(v)
	select {
	case c.send <- b:
	default:
	}
}
