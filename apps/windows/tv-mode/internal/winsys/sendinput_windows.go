//go:build windows

package winsys

import (
	"errors"
	"strings"
	"syscall"
	"time"
	"unicode/utf16"
	"unsafe"
)

// SendInput based control of another program's window (Netflix in Chrome).
// Nothing here reads the other program's memory or profile.

var (
	procSendInput        = user32.NewProc("SendInput")
	procGetSystemMetrics = user32.NewProc("GetSystemMetrics")
	procMapVirtualKeyW   = user32.NewProc("MapVirtualKeyW")
	procEnumWindows      = user32.NewProc("EnumWindows")
	procIsWindowVisible  = user32.NewProc("IsWindowVisible")
	procIsWindow         = user32.NewProc("IsWindow")
	procGetClassNameW    = user32.NewProc("GetClassNameW")
	procGetWindowTextW   = user32.NewProc("GetWindowTextW")
	procGetWindowThread  = user32.NewProc("GetWindowThreadProcessId")
	procGetForeground    = user32.NewProc("GetForegroundWindow")
	procSetForeground    = user32.NewProc("SetForegroundWindow")
	procAttachThread     = user32.NewProc("AttachThreadInput")
	procSetWindowPos     = user32.NewProc("SetWindowPos")
	procPostMessageW     = user32.NewProc("PostMessageW")
	procGetCursorPos     = user32.NewProc("GetCursorPos")
	procShowWindow       = user32.NewProc("ShowWindow")
	procIsIconic         = user32.NewProc("IsIconic")
	procGetWindowLongW   = user32.NewProc("GetWindowLongW")
	procGetCurrentThread = kernel32.NewProc("GetCurrentThreadId")
)

const (
	inputMouse    = 0
	inputKeyboard = 1

	keyEventExtended = 0x0001
	keyEventKeyUp    = 0x0002
	keyEventUnicode  = 0x0004

	mouseMove       = 0x0001
	mouseLeftDown   = 0x0002
	mouseLeftUp     = 0x0004
	mouseRightDown  = 0x0008
	mouseRightUp    = 0x0010
	mouseWheel      = 0x0800
	mouseVirtualKey = 0x4000
	mouseAbsolute   = 0x8000

	smXVirtual  = 76
	smYVirtual  = 77
	smCXVirtual = 78
	smCYVirtual = 79

	wmClose      = 0x0010
	swpShow      = 0x0040
	swRestore    = 9
	vkMenu       = 0x12
	wheelDelta   = 120
	swpNoActiveF = 0x0010
	wsCaption    = 0x00C00000
)

var gwlStyle int32 = -16

// input mirrors the Win32 INPUT struct on 64-bit Windows: a 4-byte type, 4
// bytes of padding, then a 32-byte union (MOUSEINPUT is the largest member).
type input struct {
	Type uint32
	_    uint32
	U    [32]byte
}

type keybdInput struct {
	VK    uint16
	Scan  uint16
	Flags uint32
	Time  uint32
	Extra uintptr
}

type mouseInput struct {
	DX, DY int32
	Data   uint32
	Flags  uint32
	Time   uint32
	Extra  uintptr
}

func keyInput(vk, scan uint16, flags uint32) input {
	var in input
	in.Type = inputKeyboard
	*(*keybdInput)(unsafe.Pointer(&in.U[0])) = keybdInput{VK: vk, Scan: scan, Flags: flags}
	return in
}

func mouseIn(dx, dy int32, data, flags uint32) input {
	var in input
	in.Type = inputMouse
	*(*mouseInput)(unsafe.Pointer(&in.U[0])) = mouseInput{DX: dx, DY: dy, Data: data, Flags: flags}
	return in
}

func sendInputs(ins ...input) error {
	if len(ins) == 0 {
		return nil
	}
	n, _, err := procSendInput.Call(uintptr(len(ins)), uintptr(unsafe.Pointer(&ins[0])), unsafe.Sizeof(input{}))
	if int(n) != len(ins) {
		return errors.New("SendInput blocked or failed: " + err.Error())
	}
	return nil
}

// KeyTap presses and releases a virtual key (extended = arrows, Home, ...).
func KeyTap(vk uint16, extended bool) error {
	scan := uint16(mapVK(vk))
	f := uint32(0)
	if extended {
		f = keyEventExtended
	}
	return sendInputs(keyInput(vk, scan, f), keyInput(vk, scan, f|keyEventKeyUp))
}

// KeyCombo holds the first keys down, taps the last, then releases (Alt+Left).
func KeyCombo(mods []uint16, vk uint16, extended bool) error {
	var ins []input
	for _, m := range mods {
		ins = append(ins, keyInput(m, uint16(mapVK(m)), 0))
	}
	f := uint32(0)
	if extended {
		f = keyEventExtended
	}
	ins = append(ins, keyInput(vk, uint16(mapVK(vk)), f), keyInput(vk, uint16(mapVK(vk)), f|keyEventKeyUp))
	for i := len(mods) - 1; i >= 0; i-- {
		ins = append(ins, keyInput(mods[i], uint16(mapVK(mods[i])), keyEventKeyUp))
	}
	return sendInputs(ins...)
}

func mapVK(vk uint16) uint32 {
	r, _, _ := procMapVirtualKeyW.Call(uintptr(vk), 0)
	return uint32(r)
}

// TypeText types text as Unicode key events into the focused window.
func TypeText(s string) error {
	var ins []input
	for _, u := range utf16.Encode([]rune(s)) {
		ins = append(ins, keyInput(0, u, keyEventUnicode), keyInput(0, u, keyEventUnicode|keyEventKeyUp))
	}
	return sendInputs(ins...)
}

// AbsCoord maps a pixel on the virtual screen to SendInput's 0..65535 range.
func AbsCoord(v, origin, size int) int32 {
	if size <= 1 {
		return 0
	}
	f := float64(v-origin) * 65535 / float64(size-1)
	if f < 0 {
		f = 0
	}
	if f > 65535 {
		f = 65535
	}
	return int32(f + 0.5)
}

func virtualScreen() (x, y, w, h int) {
	g := func(i uintptr) int { r, _, _ := procGetSystemMetrics.Call(i); return int(int32(r)) }
	return g(smXVirtual), g(smYVirtual), g(smCXVirtual), g(smCYVirtual)
}

// MouseMoveAbs puts the cursor at a virtual-screen pixel.
func MouseMoveAbs(x, y int) error {
	vx, vy, vw, vh := virtualScreen()
	return sendInputs(mouseIn(AbsCoord(x, vx, vw), AbsCoord(y, vy, vh), 0, mouseMove|mouseAbsolute|mouseVirtualKey))
}

// MouseClick clicks the left (or right) button where the cursor is.
func MouseClick(left bool) error {
	if left {
		return sendInputs(mouseIn(0, 0, 0, mouseLeftDown), mouseIn(0, 0, 0, mouseLeftUp))
	}
	return sendInputs(mouseIn(0, 0, 0, mouseRightDown), mouseIn(0, 0, 0, mouseRightUp))
}

// MouseWheel scrolls by delta wheel units (120 = one notch; + = up).
func MouseWheel(delta int) error {
	return sendInputs(mouseIn(0, 0, uint32(int32(delta)), mouseWheel))
}

// CursorPos returns the cursor position in virtual-screen pixels.
func CursorPos() (int, int) {
	var p struct{ X, Y int32 }
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&p)))
	return int(p.X), int(p.Y)
}

// Win describes a top-level window.
type Win struct {
	HWND  uintptr
	Class string
	Title string
	PID   uint32
}

// TopWindows lists visible top-level windows of a class (empty = any).
func TopWindows(class string) []Win {
	var out []Win
	enumWindows(func(h uintptr) {
		if v, _, _ := procIsWindowVisible.Call(h); v == 0 {
			return
		}
		var cls [256]uint16
		procGetClassNameW.Call(h, uintptr(unsafe.Pointer(&cls[0])), 256)
		c := syscall.UTF16ToString(cls[:])
		if class != "" && !strings.EqualFold(c, class) {
			return
		}
		var t [512]uint16
		procGetWindowTextW.Call(h, uintptr(unsafe.Pointer(&t[0])), 512)
		var pid uint32
		procGetWindowThread.Call(h, uintptr(unsafe.Pointer(&pid)))
		out = append(out, Win{HWND: h, Class: c, Title: syscall.UTF16ToString(t[:]), PID: pid})
	})
	return out
}

// NewWindows returns the windows in now that are not in before (by handle).
func NewWindows(before, now []Win) []Win {
	seen := map[uintptr]bool{}
	for _, w := range before {
		seen[w.HWND] = true
	}
	var out []Win
	for _, w := range now {
		if !seen[w.HWND] && w.Title != "" {
			out = append(out, w)
		}
	}
	return out
}

// WindowTitle returns a window's current title.
func WindowTitle(h uintptr) string {
	var t [512]uint16
	procGetWindowTextW.Call(h, uintptr(unsafe.Pointer(&t[0])), 512)
	return syscall.UTF16ToString(t[:])
}

func IsWindow(h uintptr) bool { r, _, _ := procIsWindow.Call(h); return r != 0 }

func Foreground() uintptr { r, _, _ := procGetForeground.Call(); return r }

// ForceForeground brings h to the front. Windows refuses this from a
// background process unless it shares input state with the foreground thread,
// so attach to that thread for the call and tap Alt (which lifts the lock).
func ForceForeground(h uintptr) bool {
	if Foreground() == h {
		return true
	}
	if r, _, _ := procIsIconic.Call(h); r != 0 { // restoring a full-screen window would drop it out of full screen
		procShowWindow.Call(h, swRestore)
	}
	fg := Foreground()
	var fgThread, me uintptr
	if fg != 0 {
		fgThread, _, _ = procGetWindowThread.Call(fg, 0)
	}
	me, _, _ = procGetCurrentThread.Call()
	if fgThread != 0 && fgThread != me {
		procAttachThread.Call(me, fgThread, 1)
		defer procAttachThread.Call(me, fgThread, 0)
	}
	_ = sendInputs(keyInput(vkMenu, 0, 0), keyInput(vkMenu, 0, keyEventKeyUp))
	for i := 0; i < 3; i++ {
		procSetForeground.Call(h)
		time.Sleep(60 * time.Millisecond)
		if Foreground() == h {
			return true
		}
	}
	return Foreground() == h
}

// PlaceWindow puts h on the rectangle and raises it.
func PlaceWindow(h uintptr, x, y, w, hgt int) {
	procSetWindowPos.Call(h, 0, uintptr(int32(x)), uintptr(int32(y)), uintptr(int32(w)), uintptr(int32(hgt)), swpShow)
}

// HasCaption says whether h still has a title bar; Chrome strips it in full screen.
func HasCaption(h uintptr) bool {
	r, _, _ := procGetWindowLongW.Call(h, uintptr(gwlStyle))
	return uint32(r)&wsCaption == wsCaption
}

// CloseWindow asks a window to close (WM_CLOSE), never kills its process.
func CloseWindow(h uintptr) { procPostMessageW.Call(h, wmClose, 0, 0) }

// InputSize is exported for the size test.
func InputSize() uintptr { return unsafe.Sizeof(input{}) }

var procGetWindowRect = user32.NewProc("GetWindowRect")

// WindowCenter is the middle of h's rectangle on the desktop; ok is false when Windows
// cannot say.
func WindowCenter(h uintptr) (x, y int, ok bool) {
	var r struct{ L, T, R, B int32 }
	if h == 0 {
		return 0, 0, false
	}
	if ret, _, _ := procGetWindowRect.Call(h, uintptr(unsafe.Pointer(&r))); ret == 0 {
		return 0, 0, false
	}
	return int(r.L+r.R) / 2, int(r.T+r.B) / 2, true
}
