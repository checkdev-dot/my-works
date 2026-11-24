package main

import (
	"os"
	"path/filepath"
	"testing"
)

func stubGuard(t *testing.T, packaged bool, desktop string) *[]string {
	t.Helper()
	oi, od, os_ := inPackage, desktopDir, startShortcut
	t.Cleanup(func() { inPackage, desktopDir, startShortcut = oi, od, os_ })
	t.Setenv(pkgRelaunchEnv, "")
	var started []string
	inPackage = func() bool { return packaged }
	desktopDir = func() string { return desktop }
	startShortcut = func(l string) error { started = append(started, l); return nil }
	return &started
}

func TestGuardNotPackaged(t *testing.T) {
	started := stubGuard(t, false, t.TempDir())
	if packageGuard(false) || len(*started) != 0 {
		t.Fatal("must not relaunch outside a package")
	}
}

func TestGuardRelaunchesViaDesktopShortcut(t *testing.T) {
	d := t.TempDir()
	lnk := filepath.Join(d, "TV Mode.lnk")
	_ = os.WriteFile(lnk, []byte("x"), 0o600)
	started := stubGuard(t, true, d)
	if _, err := os.Stat(fixedShortcut); err == nil {
		t.Skip("the real desktop shortcut exists here")
	}
	if !packageGuard(false) || len(*started) != 1 || (*started)[0] != lnk {
		t.Fatalf("started %v", *started)
	}
	if packageGuard(false) { // the env marker stops a second hand-over
		t.Fatal("handed over twice")
	}
}

func TestGuardNoShortcutContinues(t *testing.T) {
	started := stubGuard(t, true, t.TempDir())
	if _, err := os.Stat(fixedShortcut); err == nil {
		t.Skip("the real desktop shortcut exists here")
	}
	if packageGuard(true) || len(*started) != 0 {
		t.Fatal("standby with no shortcut must continue")
	}
}
