package winsys

import (
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	dwmapi              = syscall.NewLazyDLL("dwmapi.dll")
	procDwmGetWindowAtt = dwmapi.NewProc("DwmGetWindowAttribute")
	procIsZoomed        = user32.NewProc("IsZoomed")
)

const (
	swpNoZ = 0x0004
)

// Info is one visible top-level window with what the TV guards need to judge it.
type Info struct {
	HWND                    uintptr
	Class, Title, Exe       string // Exe is the lower-case file name ("chrome.exe"), "" when unknown
	PID                     uint32
	L, T, R, B              int
	Minimized, Zoomed, Tool bool
	Cloaked                 bool
}

// exeName is the lower-case file name of a process image, "" when it cannot be read.
func exeName(pid uint32) string {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return ""
	}
	defer windows.CloseHandle(h)
	buf := make([]uint16, 520)
	n := uint32(len(buf))
	if windows.QueryFullProcessImageName(h, 0, &buf[0], &n) != nil {
		return ""
	}
	return strings.ToLower(filepath.Base(windows.UTF16ToString(buf[:n])))
}

// AllWindows lists every visible top-level window with its rectangle and state.
func AllWindows() []Info {
	exes := map[uint32]string{}
	var out []Info
	for _, w := range TopWindows("") {
		var r struct{ L, T, R, B int32 }
		if ret, _, _ := procGetWindowRect.Call(w.HWND, uintptr(unsafe.Pointer(&r))); ret == 0 {
			continue
		}
		exe, ok := exes[w.PID]
		if !ok {
			exe = exeName(w.PID)
			exes[w.PID] = exe
		}
		ico, _, _ := procIsIconic.Call(w.HWND)
		zm, _, _ := procIsZoomed.Call(w.HWND)
		ex, _, _ := procGetWindowLongW.Call(w.HWND, uintptr(gwlEx))
		var cloaked uint32
		procDwmGetWindowAtt.Call(w.HWND, 14, uintptr(unsafe.Pointer(&cloaked)), 4) // DWMWA_CLOAKED
		out = append(out, Info{
			HWND: w.HWND, Class: w.Class, Title: w.Title, Exe: exe, PID: w.PID,
			L: int(r.L), T: int(r.T), R: int(r.R), B: int(r.B),
			Minimized: ico != 0, Zoomed: zm != 0, Tool: uint32(ex)&wsExToolWindow != 0, Cloaked: cloaked != 0,
		})
	}
	return out
}

// MoveWindow puts h on the rectangle without raising or activating it (a maximized
// window is restored first, or Windows keeps it stretched over the old monitor).
func MoveWindow(h uintptr, x, y, w, hgt int) {
	if z, _, _ := procIsZoomed.Call(h); z != 0 {
		procShowWindow.Call(h, swRestore)
	}
	procSetWindowPos.Call(h, 0, uintptr(int32(x)), uintptr(int32(y)), uintptr(int32(w)), uintptr(int32(hgt)), swpNoZ|swpNoActiveF)
}

var gwlEx int32 = -20
