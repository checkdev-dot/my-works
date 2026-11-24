package app

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	qrcode "github.com/skip2/go-qrcode"

	"tvmode/internal/relay"
)

// dir serves a folder under the web root, never cached (dev edits show at once).
func (a *App) dir(sub string, cors bool) http.Handler {
	fs := http.FileServer(http.Dir(filepath.Join(a.o.WebDir, filepath.FromSlash(sub))))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if cors {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		fs.ServeHTTP(w, r)
	})
}

func redirect(to string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, to, http.StatusFound)
	})
}

func (a *App) overlayHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	b, err := os.ReadFile(a.o.Overlay)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	_, _ = w.Write(b)
}

// publicPath says whether a path may be served to other machines on the LAN:
// the remote page, its fonts and vendor files, and the relay. Everything else
// (launcher, overlay, screen socket, pairing API) is loopback only.
func publicPath(p string) bool {
	return strings.HasPrefix(p, "/remote/") || strings.HasPrefix(p, "/fonts/") ||
		strings.HasPrefix(p, "/vendor/") || strings.HasPrefix(p, "/relay/")
}

// loopbackHostOK: the Host header (with or without port) names loopback itself.
func loopbackHostOK(host string) bool {
	hn := host
	if x, _, err := net.SplitHostPort(host); err == nil {
		hn = x
	}
	return hn == "127.0.0.1" || hn == "localhost" || hn == "::1" || hn == "[::1]"
}

func lanGate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h, _, _ := net.SplitHostPort(r.RemoteAddr)
		// loopback callers must also name loopback: a DNS-rebinding page reaches 127.0.0.1
		// under its own host name
		if ip := net.ParseIP(h); ip != nil && ip.IsLoopback() && !testing.Testing() { // httptest requests name example.com
			if !loopbackHostOK(r.Host) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
		}
		if ip := net.ParseIP(h); ip == nil || !ip.IsLoopback() {
			if !publicPath(r.URL.Path) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			log.Printf("lan %s %s", r.RemoteAddr, r.URL.Path)
		}
		next.ServeHTTP(w, r)
	})
}

// serve starts the one HTTP listener on :8770. The phone normally never talks
// to it: it loads the remote from the public origin and reaches the PC
// through the relay and WebRTC. With no public origin configured (dev) the
// same page and relay are served here over plain LAN HTTP.
func (a *App) serve(ctx context.Context) error {
	a.relay = relay.New()
	a.link = &link{a: a, sess: map[string]*session{}}
	mux := http.NewServeMux()
	// loopback only
	mux.HandleFunc("/ws/screen", a.wsScreen)
	mux.HandleFunc("/overlay.js", a.overlayHandler)
	mux.HandleFunc("/img/", a.imgHandler)
	mux.HandleFunc("/api/preview", a.previewHandler)
	mux.HandleFunc("/api/title", a.titleHandler)
	mux.HandleFunc("/api/rated", a.ratedHandler)
	mux.HandleFunc("/api/search", a.searchHandler)
	mux.HandleFunc("/api/episodes", a.episodesHandler)
	mux.HandleFunc("/api/ext/", a.extBridge)
	// Graceful stop: closes Edge (Browser.close, waits for it, so cookies are
	// flushed) and ends the program. Loopback only (lanGate); needs a custom
	// header, so a web page cannot trigger it with a plain cross-site POST.
	mux.HandleFunc("/api/quit", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.Header.Get("X-TVMode") != "quit" {
			http.Error(w, "POST with X-TVMode: quit", http.StatusMethodNotAllowed)
			return
		}
		log.Printf("quit requested")
		w.WriteHeader(http.StatusNoContent)
		go a.Exit()
	})
	mux.HandleFunc("/api/start", a.startHandler) // the desktop shortcut starts the TV in a running instance
	mux.HandleFunc("/api/pair", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		fmt.Fprintf(w, `{"url":%q,"ip":%q,"origin":%q}`, a.PairURL(), a.LanIP, a.RemoteOrigin())
	})
	mux.HandleFunc("/api/pair.png", func(w http.ResponseWriter, r *http.Request) {
		png, err := qrcode.Encode(a.PairURL(), qrcode.Medium, 512)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(png)
	})
	a.deskRoutes(mux)                                // /desk/ and its APIs (desk.go), loopback only
	mux.HandleFunc("/api/debug/stack", a.debugStack) // goroutine dump to stack.log (debugstack.go), loopback only
	mux.Handle("/launcher/", http.StripPrefix("/launcher/", a.dir("launcher", false)))
	mux.Handle("/", redirect("/launcher/"))
	// public (LAN too)
	mux.Handle("/fonts/", http.StripPrefix("/fonts/", a.dir("fonts", true)))
	mux.Handle("/vendor/", http.StripPrefix("/vendor/", a.dir("vendor", true)))
	mux.Handle("/remote/", http.StripPrefix("/remote/", a.dir("remote", false)))
	mux.HandleFunc("/relay/", a.relay.Handler)

	if err := a.listen(ctx, "0.0.0.0:"+Port(), lanGate(mux)); err != nil {
		return fmt.Errorf(":%s: %w", Port(), err)
	}
	log.Printf("remote: %s/remote/  pair: %s", a.RemoteOrigin(), a.PairURL())
	go a.runLink(ctx)
	go a.relayWatch(ctx) // rejoins when the TV side stops answering phones (relaywatch.go)
	return nil
}

func (a *App) listen(ctx context.Context, addr string, h http.Handler) error {
	ln, err := net.Listen("tcp4", addr)
	if err != nil {
		return err
	}
	srv := &http.Server{Handler: h, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Printf("serve %s: %v", addr, err)
		}
	}()
	go func() { <-ctx.Done(); _ = srv.Close() }()
	return nil
}

func (a *App) wsScreen(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	c.SetReadLimit(1 << 16)
	cl := wsClient(c, false)
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	a.hub.add(cl)
	defer a.hub.remove(cl)
	go cl.writer(ctx)
	if a.hub.remoteCount() == 0 {
		a.sendPair(cl)
	}
	cl.queue(a.snapshot())
	cl.queue(a.rowsFrame())
	for {
		_, b, err := c.Read(ctx)
		if err != nil {
			return
		}
		a.handleScreen(b)
	}
}

func (a *App) sendPair(cl *client) {
	cl.queue(map[string]string{"t": "pair", "url": a.PairURL()})
}
