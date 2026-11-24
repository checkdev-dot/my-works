package relay

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

const testKey = "test-key-not-a-real-one"

func testRoom() string {
	h := sha256.Sum256([]byte(testKey))
	return hex.EncodeToString(h[:])[:32]
}

func dial(t *testing.T, ctx context.Context, srv *httptest.Server, query string) *websocket.Conn {
	t.Helper()
	u := "ws" + strings.TrimPrefix(srv.URL, "http") + "/relay/" + testRoom() + "?" + query
	c, _, err := websocket.Dial(ctx, u, nil)
	if err != nil {
		t.Fatalf("dial %s: %v", query, err)
	}
	t.Cleanup(func() { _ = c.CloseNow() })
	return c
}

func read(t *testing.T, ctx context.Context, c *websocket.Conn) map[string]any {
	t.Helper()
	rctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	_, b, err := c.Read(rctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("bad json %q: %v", b, err)
	}
	return m
}

func TestRelay(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(New().Handler))
	defer srv.Close()
	ctx := context.Background()

	// a PC with the wrong key is refused
	u := "ws" + strings.TrimPrefix(srv.URL, "http") + "/relay/" + testRoom() + "?role=pc&key=wrong"
	if _, resp, err := websocket.Dial(ctx, u, nil); err == nil || resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Fatalf("bad key: err=%v resp=%v, want 403", err, resp)
	}

	pc := dial(t, ctx, srv, "role=pc&key="+testKey)

	// two phones join; the PC hears an open for each
	p1 := dial(t, ctx, srv, "role=phone")
	if m := read(t, ctx, p1); m["t"] != "pc" {
		t.Fatalf("phone 1 first frame = %v, want pc", m)
	}
	open1 := read(t, ctx, pc)
	p2 := dial(t, ctx, srv, "role=phone")
	if m := read(t, ctx, p2); m["t"] != "pc" {
		t.Fatalf("phone 2 first frame = %v, want pc", m)
	}
	open2 := read(t, ctx, pc)
	sid1, _ := open1["sid"].(string)
	sid2, _ := open2["sid"].(string)
	if open1["ev"] != "open" || open2["ev"] != "open" || sid1 == "" || sid2 == "" || sid1 == sid2 {
		t.Fatalf("open events = %v, %v", open1, open2)
	}

	// a PC frame addressed to phone 1 reaches phone 1 only
	if err := pc.Write(ctx, websocket.MessageText, []byte(`{"sid":"`+sid1+`","d":{"t":"hi"}}`)); err != nil {
		t.Fatal(err)
	}
	if m := read(t, ctx, p1); m["t"] != "hi" {
		t.Fatalf("phone 1 got %v, want hi", m)
	}
	rctx, cancel := context.WithTimeout(ctx, 300*time.Millisecond)
	defer cancel()
	if _, b, err := p2.Read(rctx); err == nil {
		t.Fatalf("phone 2 received %q, want nothing", b)
	}

	// the PC socket closing sends nopc to the phones
	_ = pc.CloseNow()
	if m := read(t, ctx, p1); m["t"] != "nopc" {
		t.Fatalf("phone 1 after PC close = %v, want nopc", m)
	}
}
