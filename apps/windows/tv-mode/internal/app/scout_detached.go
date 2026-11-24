package app

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/chromedp/cdproto/browser"
	"github.com/chromedp/chromedp"
)

// Edge 156, started from an elevated TV Mode, hands itself over to a non-elevated
// copy: the process chromedp started exits without a word ("chrome failed to start:")
// while the scout runs on. These find the scout by the address it writes into its
// profile (DevToolsActivePort) instead of by its output.

// connectScout waits up to wait for a DevToolsActivePort written after since, and
// connects to it. Stop closes the browser the polite way (Browser.close).
func connectScout(dir string, since time.Time, wait time.Duration) (context.Context, func(), error) {
	port := filepath.Join(dir, "DevToolsActivePort")
	var ws string
	for end := time.Now().Add(wait); ; time.Sleep(250 * time.Millisecond) {
		if st, err := os.Stat(port); err == nil && !st.ModTime().Before(since.Add(-2*time.Second)) {
			if b, err := os.ReadFile(port); err == nil {
				if f := strings.Fields(string(b)); len(f) >= 2 && strings.HasPrefix(f[1], "/devtools/browser/") {
					ws = "ws://127.0.0.1:" + f[0] + f[1]
					break
				}
			}
		}
		if time.Now().After(end) {
			return nil, nil, errors.New("no fresh DevToolsActivePort")
		}
	}
	actx, acancel := chromedp.NewRemoteAllocator(context.Background(), ws)
	bctx, bcancel := chromedp.NewContext(actx)
	done := make(chan error, 1)
	go func() { done <- chromedp.Run(bctx) }()
	select {
	case err := <-done:
		if err != nil {
			bcancel()
			acancel()
			return nil, nil, err
		}
	case <-time.After(10 * time.Second):
		bcancel()
		acancel()
		return nil, nil, errors.New("scout did not answer")
	}
	stop := func() {
		_ = chromedp.Run(bctx, browser.Close())
		bcancel()
		acancel()
	}
	return bctx, stop, nil
}

// startScoutDetached starts the scout Edge without watching its output, then connects.
func startScoutDetached(exe, dir string) (context.Context, func(), error) {
	_ = os.Remove(filepath.Join(dir, "DevToolsActivePort"))
	t0 := time.Now()
	cmd := exec.Command(exe,
		"--headless=new", "--user-data-dir="+dir, "--remote-debugging-port=0",
		"--no-first-run", "--no-default-browser-check", "--disable-background-networking",
		"--disable-sync", "--mute-audio", "--autoplay-policy=user-gesture-required",
		"--window-size=1920,1080",
		"--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0",
		"about:blank")
	if err := cmd.Start(); err != nil {
		return nil, nil, err
	}
	go func() { _ = cmd.Wait() }()
	return connectScout(dir, t0, 15*time.Second)
}
