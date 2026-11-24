// Command tvmode is the PC side of TV Mode.
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"runtime/debug"
	"strings"
	"time"

	"tvmode/internal/app"
)

// quietStderr writes to stderr when there is one; the windowsgui build has none,
// and a failing writer would stop io.MultiWriter before the file.
type quietStderr struct{}

func (quietStderr) Write(p []byte) (int, error) {
	_, _ = os.Stderr.Write(p)
	return len(p), nil
}

func main() {
	web := flag.String("web", "./web", "folder with launcher/, remote/, overlay/, pair/")
	dry := flag.Bool("dry-run", true, "log \"would shut down\" instead of shutting down (set -dry-run=false for real)")
	windowed := flag.Bool("windowed", false, "open Edge in a window instead of fullscreen")
	display := flag.Int("display", 0, "monitor index for the screen (0 = primary)")
	overlay := flag.String("overlay", "", "override path to overlay.js (default <web>/overlay/overlay.js)")
	profile := flag.String("profile", "", "Edge profile folder (default LOCALAPPDATA/TVMode/edge-profile)")
	bisect := flag.String("bisect", "", "switch pieces off to find what a site dislikes: overlay,ext,autoplay,ua,poll,mouse,fullscreen,app (comma list; also TVMODE_BISECT)")
	quit := flag.Bool("quit", false, "ask the running TV Mode to close itself (and Edge) cleanly, then exit")
	test := flag.Bool("test", false, "smoke tests only: a URL with tvmode-app=<id> counts as that service")
	standby := flag.Bool("standby", false, "start with no Edge and no screen; the phone's Start TV button (or running tvmode.exe again) brings TV Mode up")
	// every real launch keeps a standby (Standby: !test below): Close TV screen returns to it,
	// so the phone's Start TV always works; a plain launch also brings the TV up (StartNow)
	desk := flag.Bool("desk", false, "desk mode: open the desk page (http://127.0.0.1:8770/desk/) in the default browser; if TV Mode is not running, start it in standby first (the TV stays off)")
	flag.Parse()
	if *quit {
		os.Exit(quitRunning())
	}
	// Inside the Claude app's package the settings folders are redirected (see
	// pkg_windows.go): hand over to the desktop shortcut before anything else is touched.
	if !*test && os.Getenv("TVMODE_PORT") == "" && packageGuard(*standby || *desk) {
		os.Exit(0)
	}
	// -desk starts exactly like -standby (same settings folders, same config, no Edge)
	// and never asks a running copy to bring the TV up.
	stby := *standby || *desk
	if *desk {
		if running, _ := app.Handoff(app.LocalOrigin(), false); running {
			if err := app.OpenDeskPage(); err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			os.Exit(0)
		}
	}
	// One instance: if TV Mode already runs (standby or full), a plain start asks
	// it to bring the TV up (or to the front) and this process ends. Done before
	// the log file is opened, so the running instance's log is not truncated.
	if running, err := app.Handoff(app.LocalOrigin(), !stby); running {
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		os.Exit(0)
	}

	dirNotes := fixDirs(stby, *test)

	// Log to a file too: the shortcut build has no console. Try %AppData%\TVMode
	// first, then %TEMP%, so a failed open never leaves us blind.
	var logPaths []string
	if dir, err := os.UserConfigDir(); err == nil {
		_ = os.MkdirAll(filepath.Join(dir, "TVMode"), 0o700)
		logPaths = append(logPaths, filepath.Join(dir, "TVMode", "tvmode.log"))
	}
	logPaths = append(logPaths, filepath.Join(os.TempDir(), "tvmode.log"))
	var openErrs []error
	for _, p := range logPaths {
		_ = os.Rename(p, strings.TrimSuffix(p, ".log")+".prev.log") // keep the last run's log: a restart used to wipe the evidence
		f, err := os.OpenFile(p, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
		if err != nil {
			openErrs = append(openErrs, err)
			continue
		}
		log.SetOutput(io.MultiWriter(f, quietStderr{}))
		log.Printf("log: %s (pid %d) args %q", p, os.Getpid(), os.Args[1:])
		// A crash (panic) has no console here; keep its trace in crash.log, which a
		// restart does not wipe.
		if cf, err := os.OpenFile(filepath.Join(filepath.Dir(p), "crash.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600); err == nil {
			fmt.Fprintf(cf, "\n== start %s pid %d\n", time.Now().Format(time.DateTime), os.Getpid())
			_ = debug.SetCrashOutput(cf, debug.CrashOptions{})
		}
		for _, e := range openErrs {
			log.Printf("log: fallback because %v", e)
		}
		break
	}
	facts := startFacts()
	log.Print(facts)
	for _, n := range dirNotes {
		log.Print(n)
	}
	// fold in what a copy started from the Claude app (packaged, redirected folders) saved apart
	if !*test && os.Getenv("TVMODE_PORT") == "" && !inPackage() {
		app.MigratePackageData()
	}
	// the same lines next to tvmode.exe, a place that does not depend on the folders above
	if exe, err := os.Executable(); err == nil && !*test {
		if f, err := os.OpenFile(filepath.Join(filepath.Dir(exe), "start.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600); err == nil {
			if st, _ := f.Stat(); st != nil && st.Size() > 64<<10 {
				_ = f.Truncate(0)
			}
			fmt.Fprintf(f, "%s pid %d standby %v %s %s\n", time.Now().Format("2006-01-02 15:04:05"), os.Getpid(), stby, facts, strings.Join(dirNotes, "; "))
			_ = f.Close()
		}
	}

	abs, err := filepath.Abs(*web)
	if err != nil {
		log.Fatal(err)
	}
	a, err := app.New(app.Options{
		WebDir: abs, DryRun: *dry, Windowed: *windowed, Display: *display,
		Overlay: *overlay, Profile: *profile, Test: *test, Standby: !*test, StartNow: !stby, Bisect: strings.Trim(*bisect+","+os.Getenv("TVMODE_BISECT"), ","),
	})
	if err != nil {
		log.Fatal(err)
	}
	if *dry {
		log.Println("dry-run is ON: shutdown will only be logged")
	}
	if *desk {
		go app.OpenDeskWhenUp() // waits for the port, then a plain default-browser open
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	go func() { <-ctx.Done(); a.Exit() }()
	if err := a.Run(ctx); err != nil {
		a.Exit()
		log.Fatal(err)
	}
	a.Exit()
}
