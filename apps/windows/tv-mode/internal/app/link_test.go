package app

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/coder/websocket"

	"tvmode/internal/certs"
	"tvmode/internal/edge"
)

// TestPhonePath starts the servers and the relay link (no Edge screen), then
// drives a headless Edge as the phone: load the remote from the dev origin,
// prove the token over the relay, bring up the WebRTC data channel, ping.
// Run with: go test ./internal/app -run TestPhonePath -v   (needs TV Mode stopped: port 8770)
func TestPhonePath(t *testing.T) {
	if os.Getenv("TVMODE_E2E") == "" {
		t.Skip("set TVMODE_E2E=1 (needs Edge and a free :8770)")
	}
	web, _ := filepath.Abs(filepath.Join("..", "..", "web"))
	a, err := New(Options{WebDir: web, DryRun: true})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	a.ctx, a.cancel = context.WithCancel(ctx)
	if err := a.serve(a.ctx); err != nil {
		t.Fatal(err)
	}
	// wait for the PC to join its room
	for i := 0; i < 50; i++ {
		a.link.mu.Lock()
		ok := a.link.ws != nil
		a.link.mu.Unlock()
		if ok {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}

	run := func(url string, wait time.Duration) (path, link string, pong bool) {
		opts := append(chromedp.DefaultExecAllocatorOptions[:],
			chromedp.ExecPath(edge.EdgePath),
			chromedp.UserDataDir(filepath.Join(os.TempDir(), "tvmode-test-phone")),
			chromedp.Flag("headless", "new"),
		)
		actx, acancel := chromedp.NewExecAllocator(ctx, opts...)
		defer acancel()
		cctx, ccancel := chromedp.NewContext(actx)
		defer ccancel()
		if err := chromedp.Run(cctx, chromedp.Navigate(url)); err != nil {
			t.Fatalf("navigate: %v", err)
		}
		deadline := time.Now().Add(wait)
		for time.Now().Before(deadline) {
			time.Sleep(250 * time.Millisecond)
			_ = chromedp.Run(cctx, chromedp.Evaluate(`window.tvlink ? window.tvlink.path() : ""`, &path),
				chromedp.Evaluate(`window.tvlink ? window.tvlink.link() : ""`, &link))
			if path == "direct" || link == "unpaired" {
				break
			}
		}
		if link != "ok" {
			return
		}
		var before, after float64
		if err := chromedp.Run(cctx, chromedp.Evaluate(`window.tvlink.last()`, &before)); err != nil {
			t.Logf("eval: %v", err)
		}
		var sent bool
		_ = chromedp.Run(cctx, chromedp.Evaluate(`window.tvlink.send({t:"ping"})`, &sent))
		time.Sleep(600 * time.Millisecond)
		_ = chromedp.Run(cctx, chromedp.Evaluate(`window.tvlink.last()`, &after))
		t.Logf("sent=%v before=%.0f after=%.0f", sent, before, after)
		pong = sent && after > before
		if n := a.hub.remoteCount(); n != 1 {
			t.Errorf("remoteCount=%d, want 1", n)
		}
		return
	}

	path, link, pong := run(a.PairURL(), 15*time.Second)
	t.Logf("good token: path=%s link=%s pong=%v", path, link, pong)
	if link != "ok" || !pong {
		t.Fatalf("phone did not reach the PC: path=%s link=%s pong=%v", path, link, pong)
	}
	if path != "direct" {
		t.Errorf("data channel did not open (path=%s); relay path works", path)
	}
	// relay-only: a Go phone that never offers WebRTC
	if rtt, err := relayPhone(ctx, a); err != nil {
		t.Errorf("relay-only path: %v", err)
	} else {
		t.Logf("relay-only path: ping rtt=%s", rtt)
	}

	bad := strings.Replace(a.PairURL(), "#t="+a.Token(), "#t=not-the-token", 1)
	_, link2, _ := run(bad, 6*time.Second)
	t.Logf("bad token: link=%s", link2)
	if link2 != "unpaired" {
		t.Errorf("bad token: link=%s, want unpaired", link2)
	}
	time.Sleep(500 * time.Millisecond)
	if n := a.hub.remoteCount(); n != 0 {
		t.Errorf("remoteCount after close=%d, want 0", n)
	}
}

// relayPhone speaks the relay protocol like the page does, without WebRTC:
// hello -> auth -> ok -> state, then times one ping.
func relayPhone(ctx context.Context, a *App) (time.Duration, error) {
	u := "ws://127.0.0.1:8770/relay/" + certs.PCID(a.cfg.RelayKey) + "?role=phone"
	c, _, err := websocket.Dial(ctx, u, nil)
	if err != nil {
		return 0, err
	}
	defer c.CloseNow()
	read := func() (map[string]any, error) {
		rctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		_, b, err := c.Read(rctx)
		if err != nil {
			return nil, err
		}
		var m map[string]any
		return m, json.Unmarshal(b, &m)
	}
	write := func(v any) error {
		b, _ := json.Marshal(v)
		return c.Write(ctx, websocket.MessageText, b)
	}
	var sawOK, sawState bool
	var t0 time.Time
	for i := 0; i < 10; i++ {
		m, err := read()
		if err != nil {
			return 0, err
		}
		switch m["t"] {
		case "nopc":
			return 0, fmt.Errorf("relay says no pc")
		case "hello":
			if err := write(map[string]string{"t": "auth", "h": certs.AuthProof(a.cfg.Token, m["n"].(string))}); err != nil {
				return 0, err
			}
		case "ok":
			sawOK = true
		case "error":
			return 0, fmt.Errorf("pc: %v", m["msg"])
		case "state":
			sawState = true
			t0 = time.Now()
			if err := write(map[string]string{"t": "ping"}); err != nil {
				return 0, err
			}
		case "pong":
			if !sawOK || !sawState {
				return 0, fmt.Errorf("pong before ok/state")
			}
			return time.Since(t0), nil
		}
	}
	return 0, fmt.Errorf("no pong (ok=%v state=%v)", sawOK, sawState)
}
