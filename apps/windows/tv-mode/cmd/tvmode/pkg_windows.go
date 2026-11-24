package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// 2026-11-12 finding: a process started from inside the Claude desktop app runs in
// its MSIX package (Claude_pzs8sxrjxfjjc), and Windows redirects that process's
// %APPDATA%\TVMode and %LOCALAPPDATA%\TVMode writes into
// %LOCALAPPDATA%\Packages\Claude_*\LocalCache\{Roaming,Local}\TVMode. A TV Mode started
// from Claude therefore had its own config (pairing, room), history and library, apart
// from the real copy the desktop shortcut and login start use. So a real launch inside
// a package hands over to the desktop shortcut (explorer.exe starts it outside the
// package) and exits; app.MigratePackageData folds the old redirected data back in.

const (
	appModelNoPackage = 15700 // APPMODEL_ERROR_NO_PACKAGE
	pkgRelaunchEnv    = "TVMODE_PKG_RELAUNCH"
	fixedShortcut     = "" // optional: a fixed path to the TV Mode desktop shortcut
)

// function vars so tests need no package
var (
	inPackage = func() bool {
		var n uint32
		r, _, _ := windows.NewLazySystemDLL("kernel32.dll").NewProc("GetCurrentPackageFullName").Call(uintptr(unsafe.Pointer(&n)), 0)
		return uint32(r) != appModelNoPackage // ERROR_INSUFFICIENT_BUFFER (122) or SUCCESS both mean packaged
	}
	desktopDir = func() string {
		d, _ := windows.KnownFolderPath(windows.FOLDERID_Desktop, 0)
		return d
	}
	startShortcut = func(lnk string) error { return exec.Command("explorer.exe", lnk).Start() }
)

// findShortcut is the desktop shortcut to hand over to, or "".
func findShortcut() string {
	var cands []string
	if fixedShortcut != "" {
		cands = append(cands, fixedShortcut)
	}
	if d := desktopDir(); d != "" {
		cands = append(cands, filepath.Join(d, "TV Mode.lnk"))
	}
	for _, c := range cands {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return ""
}

// packageGuard reports true when this process ran inside a package and the shortcut
// was started instead: the caller exits 0. Called before Handoff and before the log
// is opened (so nothing is written to the redirected folders).
func packageGuard(standby bool) bool {
	if os.Getenv(pkgRelaunchEnv) != "" || !inPackage() {
		return false
	}
	lnk := findShortcut()
	if lnk == "" {
		if !standby {
			guardNote("package guard: running inside a package but no TV Mode.lnk found; continuing (data will go to the redirected folders)")
		}
		return false
	}
	_ = os.Setenv(pkgRelaunchEnv, "1") // a child that is still packaged must not hand over again
	if err := startShortcut(lnk); err != nil {
		guardNote(fmt.Sprintf("package guard: could not start %s: %v; continuing", lnk, err))
		return false
	}
	return true
}

// guardNote goes to stderr and to start.log next to the exe (the log is not open yet).
func guardNote(s string) {
	fmt.Fprintln(os.Stderr, s)
	if exe, err := os.Executable(); err == nil {
		if f, err := os.OpenFile(filepath.Join(filepath.Dir(exe), "start.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600); err == nil {
			fmt.Fprintf(f, "%s pid %d %s\n", time.Now().Format("2006-01-02 15:04:05"), os.Getpid(), s)
			_ = f.Close()
		}
	}
}
