package app

import (
	"os"
	"testing"

	"github.com/chromedp/chromedp"
)

// TVMODE_LIVE_SCOUT=1 go test ./internal/app -run TestScoutDetachedLive
func TestScoutDetachedLive(t *testing.T) {
	if os.Getenv("TVMODE_LIVE_SCOUT") == "" {
		t.Skip("live only")
	}
	ctx, stop, err := startScoutDetached(`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer stop()
	tctx, cancel := chromedp.NewContext(ctx)
	defer cancel()
	var title string
	if err := chromedp.Run(tctx, chromedp.Navigate("https://www.primevideo.com/search/ref=atv_nb_sr?phrase=28+Days+Later"), chromedp.Title(&title)); err != nil {
		t.Fatal(err)
	}
	t.Logf("title %q", title)
}
