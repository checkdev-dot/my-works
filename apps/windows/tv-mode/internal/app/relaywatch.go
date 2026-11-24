package app

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/coder/websocket"
)

// 2026-11-04: after a restart the phone went dead with TV Mode up and its relay
// socket open: the relay passed phones on, and nothing came back. Nothing in the
// log said so. relayWatch joins the room as a phone once a minute; when the PC
// side does not say hello within 10 s it saves every goroutine's stack to
// stack.log and drops the PC socket, so runLink dials a fresh one.
func (a *App) relayWatch(ctx context.Context) {
	if a.o.Test || a.cfg.RelayKey == "" {
		return
	}
	misses, errLogged := 0, false
	t := time.NewTicker(time.Minute)
	first := time.After(15 * time.Second)
	var again <-chan time.Time // after a first miss, look again soon instead of in a minute
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		case <-first:
		case <-again:
		}
		again = nil
		a.link.mu.Lock()
		up := a.link.ws != nil
		a.link.mu.Unlock()
		if !up {
			continue // runLink is already redialing
		}
		ok, err := a.relayHello(ctx)
		if ctx.Err() != nil {
			return
		}
		if err != nil { // could not reach the relay at all: not the PC side's fault
			if !errLogged {
				log.Printf("relay watch: %v", err)
				errLogged = true
			}
			continue
		}
		errLogged = false
		if ok {
			if misses > 0 {
				log.Printf("relay watch: answering again")
			}
			misses = 0
			continue
		}
		misses++
		if misses == 1 { // one slow answer is not proof: save the stacks, look again in 10 s
			log.Printf("relay watch: the TV side did not answer a phone (miss 1); stacks in %s, checking again", dumpStacks("relay watch: no hello"))
			again = time.After(10 * time.Second)
			continue
		}
		log.Printf("relay watch: the TV side did not answer a phone (miss %d in a row); rejoining", misses)
		a.link.mu.Lock()
		c := a.link.ws
		a.link.mu.Unlock()
		if c != nil {
			_ = c.CloseNow()
		}
	}
}

// relayHello joins the room as a phone and waits for the PC's hello.
func (a *App) relayHello(ctx context.Context) (bool, error) {
	u := a.relayDial()
	if i := strings.Index(u, "?"); i >= 0 {
		u = u[:i]
	}
	u += "?role=phone"
	dctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(dctx, u, nil)
	if err != nil {
		return false, err
	}
	defer c.CloseNow()
	sawPC := false
	for {
		_, b, err := c.Read(dctx)
		if err != nil {
			if !sawPC {
				return false, err // the relay itself said nothing: no verdict
			}
			return false, nil
		}
		var m struct {
			T string `json:"t"`
		}
		_ = json.Unmarshal(b, &m)
		switch m.T {
		case "pc":
			sawPC = true
		case "nopc":
			return false, context.Canceled // the relay has no PC: runLink's business
		case "hello":
			_ = c.Close(websocket.StatusNormalClosure, "")
			return true, nil
		}
	}
}

// dumpStacks writes every goroutine's stack to stack.log beside the log.
func dumpStacks(why string) string {
	buf := make([]byte, 8<<20)
	buf = buf[:runtime.Stack(buf, true)]
	p := filepath.Join(os.Getenv("APPDATA"), "TVMode", "stack.log")
	hdr := "== " + time.Now().Format("2006-01-02 15:04:05") + " " + why + "\n"
	_ = os.WriteFile(p, append([]byte(hdr), buf...), 0o600)
	return p
}
