package main

import (
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/sys/windows"
)

// ROOT CAUSE (found 2026-11-12): the 2026-11-04 symptom below was not a wrong login
// environment. A copy started from inside the Claude desktop app runs in its MSIX
// package, and Windows redirects its %APPDATA%\TVMode / %LOCALAPPDATA%\TVMode writes to
// %LOCALAPPDATA%\Packages\Claude_*\LocalCache\{Roaming,Local}\TVMode, a second copy of
// every setting. pkg_windows.go now hands such launches to the desktop shortcut and
// app.MigratePackageData merges the redirected data back. fixDirs stays as a harmless
// safety net for a genuinely wrong environment.
//
// After a restart (2026-11-04) the Startup-folder TV Mode came up with none of Dev's
// settings: a fresh pairing token, no remote address, no TMDB key, an empty home
// screen, and nothing written to his %APPDATA%\TVMode. Every part of TV Mode finds
// its folders through %APPDATA% / %LOCALAPPDATA%, so a wrong environment at login
// sends all of them elsewhere at once. fixDirs asks Windows for the signed-in user's
// own folders and points both variables there when the environment's copy has no
// settings but the user's does; at login (standby) it also waits for the profile.
// It leaves the smoke tests' throwaway folders alone (TVMODE_PORT, -test).
func fixDirs(standby, test bool) []string {
	var notes []string
	note := func(f string, v ...any) { notes = append(notes, fmt.Sprintf(f, v...)) }
	if test || os.Getenv("TVMODE_PORT") != "" {
		return notes
	}
	roam, err1 := windows.KnownFolderPath(windows.FOLDERID_RoamingAppData, 0)
	local, err2 := windows.KnownFolderPath(windows.FOLDERID_LocalAppData, 0)
	if err1 != nil || err2 != nil {
		note("dirs: known folders unavailable (%v %v)", err1, err2)
		return notes
	}
	has := func(base string) bool {
		_, err := os.Stat(filepath.Join(base, "TVMode", "config.json"))
		return err == nil
	}
	env := os.Getenv("APPDATA")
	if standby && !has(env) && !has(roam) { // the profile may still be loading at login
		for end := time.Now().Add(90 * time.Second); time.Now().Before(end) && !has(env) && !has(roam); {
			time.Sleep(3 * time.Second)
		}
		if !has(env) && !has(roam) {
			note("dirs: no settings after 90 s; starting fresh")
		}
	}
	if !strings.EqualFold(filepath.Clean(env), filepath.Clean(roam)) && !has(env) && has(roam) {
		note("dirs: APPDATA was %q (no settings there); using %q", env, roam)
		_ = os.Setenv("APPDATA", roam)
		_ = os.Setenv("LOCALAPPDATA", local)
	}
	return notes
}

// startFacts is one line about where this start found its settings (no secrets), for
// diagnosing a bad start: who, which folders, whether settings were there.
func startFacts() string {
	who := "?"
	if u, err := user.Current(); err == nil {
		who = u.Username
	}
	elev := windows.GetCurrentProcessToken().IsElevated()
	_, err := os.Stat(filepath.Join(os.Getenv("APPDATA"), "TVMode", "config.json"))
	return fmt.Sprintf("start: user %s elevated %v APPDATA %q LOCALAPPDATA %q settings found %v", who, elev, os.Getenv("APPDATA"), os.Getenv("LOCALAPPDATA"), err == nil)
}
