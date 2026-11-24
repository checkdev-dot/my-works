//go:build windows

package winsys

import (
	"log"
	"os/exec"
	"runtime"
	"syscall"
	"unsafe"
)

var (
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	user32   = syscall.NewLazyDLL("user32.dll")

	procSetThreadExecutionState = kernel32.NewProc("SetThreadExecutionState")
	procEnumDisplayMonitors     = user32.NewProc("EnumDisplayMonitors")
	procGetMonitorInfoW         = user32.NewProc("GetMonitorInfoW")
)

const (
	esContinuous      = 0x80000000
	esDisplayRequired = 0x00000002
	esSystemRequired  = 0x00000001
)

// KeepAwake keeps the display and system on until the returned stop func is
// called. SetThreadExecutionState(ES_CONTINUOUS) is per-thread, so a locked
// OS thread owns it for the lifetime of the program.
func KeepAwake() (stop func()) {
	done := make(chan struct{})
	ready := make(chan struct{})
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		procSetThreadExecutionState.Call(uintptr(esContinuous | esDisplayRequired | esSystemRequired))
		close(ready)
		<-done
		procSetThreadExecutionState.Call(uintptr(esContinuous))
	}()
	<-ready
	return func() { close(done) }
}

// Shutdown powers the PC off. With dryRun it only logs.
func Shutdown(dryRun bool) error {
	if dryRun {
		log.Println("would shut down (dry-run)")
		return nil
	}
	log.Println("shutting down")
	return exec.Command("shutdown", "/s", "/t", "0").Run()
}

// Monitor is a display rectangle in virtual-screen pixels.
type Monitor struct {
	X, Y, W, H int
	Primary    bool
}

type rect struct{ Left, Top, Right, Bottom int32 }
type monitorInfo struct {
	Size    uint32
	Monitor rect
	Work    rect
	Flags   uint32
}

// Monitors lists displays, primary first.
func Monitors() []Monitor {
	var out []Monitor
	enumMonitors(func(h uintptr) {
		mi := monitorInfo{Size: uint32(unsafe.Sizeof(monitorInfo{}))}
		if ok, _, _ := procGetMonitorInfoW.Call(h, uintptr(unsafe.Pointer(&mi))); ok != 0 {
			m := Monitor{
				X: int(mi.Monitor.Left), Y: int(mi.Monitor.Top),
				W: int(mi.Monitor.Right - mi.Monitor.Left), H: int(mi.Monitor.Bottom - mi.Monitor.Top),
				Primary: mi.Flags&1 != 0,
			}
			if m.Primary {
				out = append([]Monitor{m}, out...)
			} else {
				out = append(out, m)
			}
		}
	})
	return out
}
