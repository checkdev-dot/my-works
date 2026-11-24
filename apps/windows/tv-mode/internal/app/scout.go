package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/chromedp/cdproto/browser"
	"github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/chromedp"

	"tvmode/internal/edge"
)

// Dev never wants to see an app's own search or show pages (2026-11-04). The scout is
// a second Edge, headless and signed out, in its own throwaway profile: the resolvers
// walk search -> show -> episode there, and the TV goes straight from the "Opening"
// cover to the episode's player. JioHotstar's and Prime's search and show pages work
// signed out, and the watch address it finds plays in the TV's signed-in Edge. The
// scout closes itself after five idle minutes.
type scout struct {
	mu      sync.Mutex
	ctx     context.Context
	cancel  context.CancelFunc
	lastUse time.Time
	timer   *time.Timer
}

var scoutB = &scout{}

var scoutDirOverride string // tests

func (a *App) scoutDir() string {
	if scoutDirOverride != "" {
		return scoutDirOverride
	}
	return filepath.Join(filepath.Dir(a.recCachePath()), "..", "scout-profile")
}

// scoutTab hands back a fresh page of the scout Edge (starting it when needed) and
// a func that closes the page.
func (a *App) scoutTab() (context.Context, func(), error) {
	if a.o.Test {
		return nil, nil, errors.New("scout: off in tests")
	}
	s := scoutB
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ctx == nil || s.ctx.Err() != nil {
		dir := filepath.Clean(a.scoutDir())
		_ = os.MkdirAll(dir, 0o700)
		exe := edge.EdgePath
		if _, err := os.Stat(exe); err != nil {
			exe = `C:\Program Files\Microsoft\Edge\Application\msedge.exe`
		}
		opts := append(chromedp.DefaultExecAllocatorOptions[:],
			chromedp.ExecPath(exe), chromedp.UserDataDir(dir), chromedp.WindowSize(1920, 1080),
			chromedp.Flag("mute-audio", true), chromedp.Flag("autoplay-policy", "user-gesture-required"),
			chromedp.UserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0"))
		start := func() (context.Context, func(), error) {
			actx, acancel := chromedp.NewExecAllocator(context.Background(), opts...)
			bctx, bcancel := chromedp.NewContext(actx)
			if err := chromedp.Run(bctx); err != nil {
				bcancel()
				acancel()
				return nil, nil, err
			}
			return bctx, func() { bcancel(); acancel() }, nil
		}
		t0 := time.Now()
		bctx, bstop, err := start()
		if err != nil {
			// Edge 156, started from an elevated TV Mode, hands itself over to a
			// non-elevated copy: the process chromedp started exits without a word
			// ("chrome failed to start:") while the scout runs on. Find it by the address
			// it writes into its profile (scout_detached.go).
			if c, stop, e2 := connectScout(dir, t0, 6*time.Second); e2 == nil {
				bctx, bstop, err = c, stop, nil
				log.Printf("scout: reached after Edge handed over")
			} else {
				closeStaleScout(dir) // one left by an earlier run holds the profile
				if c, stop, e3 := startScoutDetached(exe, dir); e3 == nil {
					bctx, bstop, err = c, stop, nil
				} else {
					log.Printf("scout: detached start: %v (first: %v)", e3, err)
				}
			}
		}
		if err != nil {
			return nil, nil, fmt.Errorf("scout: %w", err)
		}
		bcancel := bstop
		acancel := func() {}
		s.ctx, s.cancel = bctx, func() { bcancel(); acancel() }
		log.Printf("scout: started")
	}
	s.lastUse = time.Now()
	if s.timer != nil {
		s.timer.Stop()
	}
	s.timer = time.AfterFunc(5*time.Minute, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if time.Since(s.lastUse) >= 5*time.Minute && s.cancel != nil {
			s.cancel()
			s.ctx, s.cancel = nil, nil
			log.Printf("scout: closed (idle)")
		}
	})
	tctx, tcancel := chromedp.NewContext(s.ctx)
	if err := chromedp.Run(tctx); err != nil {
		tcancel()
		return nil, nil, err
	}
	return tctx, func() { _ = chromedp.Cancel(tctx); tcancel() }, nil
}

// scoutStop closes the scout Edge (TV Mode is quitting).
func scoutStop() {
	s := scoutB
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
		s.ctx, s.cancel = nil, nil
	}
}

// walker is where a resolver walks: the scout when it runs, else the TV itself.
type walker struct {
	nav  func(u string)
	eval func(js string, out any) error
	done func()
	tv   bool
}

func (a *App) newWalker(tvOpen func(string)) walker {
	if ctx, closeTab, err := a.scoutTab(); err == nil {
		return walker{
			nav: func(u string) {
				c, cancel := context.WithTimeout(ctx, 20*time.Second)
				defer cancel()
				if err := chromedp.Run(c, chromedp.Navigate(u)); err != nil {
					log.Printf("scout: open: %v", err)
				}
			},
			eval: func(js string, out any) error {
				c, cancel := context.WithTimeout(ctx, 8*time.Second)
				defer cancel()
				return chromedp.Run(c, chromedp.ActionFunc(func(ctx context.Context) error {
					res, ex, err := runtime.Evaluate(js).WithReturnByValue(true).WithAwaitPromise(true).Do(ctx)
					if err != nil {
						return err
					}
					if ex != nil {
						return fmt.Errorf("js: %s", ex.Error())
					}
					if out != nil && res != nil && len(res.Value) > 0 {
						return json.Unmarshal([]byte(res.Value), out)
					}
					return nil
				}))
			},
			done: closeTab,
		}
	} else {
		log.Printf("scout: %v; walking on the TV", err)
	}
	return walker{nav: tvOpen, eval: a.Edge.Eval, done: func() {}, tv: true}
}

// closeStaleScout asks a scout Edge left running by an earlier TV Mode to close, over
// its own debugging port (Edge writes it into the profile's DevToolsActivePort). A
// scout that outlived its TV Mode holds the profile, so a new one cannot start. It is
// TV Mode's own headless browser, never the TV's Edge or Dev's Chrome, and it is
// closed the polite way (Browser.close), not killed. True when it went.
func closeStaleScout(dir string) bool {
	b, err := os.ReadFile(filepath.Join(dir, "DevToolsActivePort"))
	if err != nil {
		return false
	}
	lines := strings.Fields(string(b))
	if len(lines) < 2 || !strings.HasPrefix(lines[1], "/devtools/browser/") {
		return false
	}
	ws := "ws://127.0.0.1:" + lines[0] + lines[1]
	actx, acancel := chromedp.NewRemoteAllocator(context.Background(), ws)
	defer acancel()
	ctx, cancel := chromedp.NewContext(actx)
	defer cancel()
	c, ccancel := context.WithTimeout(ctx, 5*time.Second)
	defer ccancel()
	if err := chromedp.Run(c, browser.Close()); err != nil {
		log.Printf("scout: old scout did not answer: %v", err)
		return false
	}
	log.Printf("scout: closed a scout left by an earlier run")
	time.Sleep(2 * time.Second) // let it let go of the profile
	return true
}
