package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

// The helper is loaded unpacked from extensions/netflix-dpad, so Chrome runs the copy it
// read when Dev last pressed Reload. From 2.2.0 the helper reloads itself when TV Mode
// answers its hello with {"reload":true}: once per old version per run, so a helper
// that comes back still old (Chrome did not pick the files up) is never told twice.
var helperReloadAsked = struct {
	sync.Mutex
	m map[string]bool
}{m: map[string]bool{}}

// helperDiskVersion is the version in the helper's manifest on disk ("" when unknown).
func (a *App) helperDiskVersion() string {
	if a.o.WebDir == "" {
		return ""
	}
	b, err := os.ReadFile(filepath.Join(filepath.Dir(a.o.WebDir), "extensions", "netflix-dpad", "manifest.json"))
	if err != nil {
		return ""
	}
	var m struct {
		Version string `json:"version"`
	}
	if json.Unmarshal(b, &m) != nil {
		return ""
	}
	return m.Version
}

// helperShouldReload says whether a helper of version ver should reload itself now.
func (a *App) helperShouldReload(ver string) bool {
	disk := a.helperDiskVersion()
	if ver == "" || disk == "" || !verLess(ver, disk) {
		return false
	}
	helperReloadAsked.Lock()
	defer helperReloadAsked.Unlock()
	if helperReloadAsked.m[ver] {
		return false
	}
	helperReloadAsked.m[ver] = true
	return true
}

// verLess compares dotted versions ("2.1.0" < "2.2.0").
func verLess(a, b string) bool {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var x, y int
		if i < len(pa) {
			x, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			y, _ = strconv.Atoi(pb[i])
		}
		if x != y {
			return x < y
		}
	}
	return false
}
