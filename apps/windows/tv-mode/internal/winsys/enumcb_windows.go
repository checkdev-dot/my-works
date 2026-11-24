package winsys

import (
	"sync"
	"syscall"
)

// Windows callbacks made with syscall.NewCallback are never freed and the process may
// only make about 2000 of them; making one per call crashed TV Mode after enough
// monitor or window lookups ("too many callback functions"). These two are made once
// and run whatever enumFn is set to, one enumeration at a time.
var (
	enumMu sync.Mutex
	enumFn func(h, lp uintptr) uintptr

	enumMonitorCB = syscall.NewCallback(func(h, hdc, r, lp uintptr) uintptr { return enumFn(h, lp) })
	enumWindowCB  = syscall.NewCallback(func(h, lp uintptr) uintptr { return enumFn(h, lp) })
)

// enumMonitors calls f for each display handle.
func enumMonitors(f func(h uintptr)) {
	enumMu.Lock()
	defer enumMu.Unlock()
	enumFn = func(h, _ uintptr) uintptr { f(h); return 1 }
	procEnumDisplayMonitors.Call(0, 0, enumMonitorCB, 0)
	enumFn = nil
}

// enumWindows calls f for each top-level window handle.
func enumWindows(f func(h uintptr)) {
	enumMu.Lock()
	defer enumMu.Unlock()
	enumFn = func(h, _ uintptr) uintptr { f(h); return 1 }
	procEnumWindows.Call(enumWindowCB, 0)
	enumFn = nil
}
