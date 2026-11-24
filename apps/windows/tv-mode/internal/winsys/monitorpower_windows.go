//go:build windows

package winsys

import (
	"errors"
	"fmt"
	"runtime"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

// Screen on/off for ONE monitor (the TV, by -display index; never the
// primary). First choice is DDC/CI power (VCP 0xD6) through dxva2.dll. If the
// monitor does not answer, a borderless topmost black window covers it instead.

var (
	dxva2 = syscall.NewLazyDLL("dxva2.dll")

	procGetNumPhys   = dxva2.NewProc("GetNumberOfPhysicalMonitorsFromHMONITOR")
	procGetPhys      = dxva2.NewProc("GetPhysicalMonitorsFromHMONITOR")
	procDestroyPhys  = dxva2.NewProc("DestroyPhysicalMonitors")
	procSetVCP       = dxva2.NewProc("SetVCPFeature")
	procSendMsgTO    = user32.NewProc("SendMessageTimeoutW")
	procMouseEvent   = user32.NewProc("mouse_event")
	procRegisterCls  = user32.NewProc("RegisterClassExW")
	procCreateWinEx  = user32.NewProc("CreateWindowExW")
	procDefWindowPrc = user32.NewProc("DefWindowProcW")
	procGetMessage   = user32.NewProc("GetMessageW")
	procDispatchMsg  = user32.NewProc("DispatchMessageW")
	procPostMessage  = user32.NewProc("PostMessageW")
	procPostQuit     = user32.NewProc("PostQuitMessage")
	procDestroyWin   = user32.NewProc("DestroyWindow")
	procGetStockObj  = gdi32.NewProc("GetStockObject")
)

var gdi32 = syscall.NewLazyDLL("gdi32.dll")

const (
	vcpPower       = 0xD6
	vcpPowerOn     = 0x01
	wmDestroy      = 0x0002
	wsPopup        = 0x80000000
	wsExTopmost    = 0x00000008
	wsExToolWindow = 0x00000080
	wsExNoActivate = 0x08000000
	swShowNoActiv  = 4
	blackBrush     = 4
	hwndTopmost    = ^uintptr(0) // (HWND)-1
	swpNoActivate  = 0x0010
)

type physicalMonitor struct {
	Handle uintptr
	Desc   [128]uint16
}

type dispItem struct {
	h uintptr
	m Monitor
}

// displays lists every display with its HMONITOR, in the same order as Monitors (primary first).
func displays() []dispItem {
	var hs []uintptr
	enumMonitors(func(hm uintptr) { hs = append(hs, hm) })
	var items []dispItem
	for _, hm := range hs {
		mi := monitorInfo{Size: uint32(unsafe.Sizeof(monitorInfo{}))}
		if ok, _, _ := procGetMonitorInfoW.Call(hm, uintptr(unsafe.Pointer(&mi))); ok == 0 {
			continue
		}
		m := Monitor{X: int(mi.Monitor.Left), Y: int(mi.Monitor.Top), W: int(mi.Monitor.Right - mi.Monitor.Left),
			H: int(mi.Monitor.Bottom - mi.Monitor.Top), Primary: mi.Flags&1 != 0}
		if m.Primary {
			items = append([]dispItem{{hm, m}}, items...)
		} else {
			items = append(items, dispItem{hm, m})
		}
	}
	return items
}

// others returns every display except the TV (index tv).
func others(tv int) ([]dispItem, error) {
	var out []dispItem
	ds := displays()
	if tv < 0 || tv >= len(ds) {
		return nil, errors.New("TV display not found")
	}
	for i, d := range ds {
		if i != tv {
			out = append(out, d)
		}
	}
	if len(out) == 0 {
		return nil, errors.New("no other monitor")
	}
	return out, nil
}

// ddcOpen returns the physical monitors behind display idx; call the returned
// close when done.
func ddcOpen(h uintptr) ([]physicalMonitor, func(), error) {
	var n uint32
	if r, _, e := procGetNumPhys.Call(h, uintptr(unsafe.Pointer(&n))); r == 0 || n == 0 {
		return nil, nil, fmt.Errorf("no physical monitor: %v", e)
	}
	pm := make([]physicalMonitor, n)
	if r, _, e := procGetPhys.Call(h, uintptr(n), uintptr(unsafe.Pointer(&pm[0]))); r == 0 {
		return nil, nil, fmt.Errorf("GetPhysicalMonitors: %v", e)
	}
	return pm, func() { procDestroyPhys.Call(uintptr(n), uintptr(unsafe.Pointer(&pm[0]))) }, nil
}

func ddcSet(pm physicalMonitor, v uint32) error {
	r, _, e := procSetVCP.Call(pm.Handle, vcpPower, uintptr(v))
	if r == 0 {
		return fmt.Errorf("set power %d: %v", v, e)
	}
	return nil
}

// ScreenOff blacks out every monitor EXCEPT the TV display tv (the desk monitors) with
// black windows; it errors if the TV display is absent. method is always "dark".
func ScreenOff(tv int) (method string, err error) {
	ms, err := others(tv)
	if err != nil {
		return "", err
	}
	// Black windows, not DDC power-off: Dev's desk monitor powered off over DDC
	// and then ignored every wake (D6=1, display-on broadcast, input) until its
	// own button was pressed (2026-11-04). A black window always comes back.
	for _, d := range ms {
		if e := darkOn(d.m); e != nil {
			return "", e
		}
	}
	return "dark", nil
}

// ScreenOn undoes ScreenOff: removes the black windows and sends D6=1 to the desk monitors.
// Many monitors in standby ignore D6=1 until they see the PC wake the display, so it also
// broadcasts the Windows display-on message, nudges the mouse one pixel and back, and
// sends D6=1 once more a second later (Dev's desk monitor stayed dark without this).
func ScreenOn(tv int) error {
	darkOff()
	err := ddcOnAll(tv)
	var r uintptr
	procSendMsgTO.Call(0xFFFF, 0x0112, 0xF170, ^uintptr(0), 2, 1000, uintptr(unsafe.Pointer(&r))) // HWND_BROADCAST, WM_SYSCOMMAND, SC_MONITORPOWER, -1 (on)
	procMouseEvent.Call(1, 1, 0, 0, 0)                                                            // MOUSEEVENTF_MOVE +1 px
	procMouseEvent.Call(1, ^uintptr(0), 0, 0, 0)                                                  // and back
	time.Sleep(time.Second)
	if e := ddcOnAll(tv); e == nil {
		err = nil
	}
	return err
}

func ddcOnAll(tv int) error {
	ms, err := others(tv)
	if err != nil {
		return nil // TV absent: nothing was darkened, nothing to wake
	}
	var last error
	for _, d := range ms {
		pms, done, e := ddcOpen(d.h)
		if e != nil {
			continue // only darkened, or not DDC-capable: nothing to wake
		}
		if e := ddcSet(pms[0], vcpPowerOn); e != nil {
			last = e
		}
		done()
	}
	return last
}

// --- black windows ---

var (
	darkMu   sync.Mutex
	darkWins []uintptr
	darkEnds []chan struct{}
)

type wndClassEx struct {
	Size       uint32
	Style      uint32
	WndProc    uintptr
	ClsExtra   int32
	WndExtra   int32
	Instance   uintptr
	Icon       uintptr
	Cursor     uintptr
	Background uintptr
	MenuName   *uint16
	ClassName  *uint16
	IconSm     uintptr
}

type winMsg struct {
	Hwnd    uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      [2]int32
}

var darkClassOnce sync.Once

func darkOn(m Monitor) error {
	darkMu.Lock()
	defer darkMu.Unlock()
	ready := make(chan uintptr, 1)
	end := make(chan struct{})
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		defer close(end)
		name, _ := syscall.UTF16PtrFromString("TVModeDark")
		darkClassOnce.Do(func() {
			wp := syscall.NewCallback(func(hwnd, msg, wp, lp uintptr) uintptr {
				if msg == wmClose {
					procDestroyWin.Call(hwnd)
					return 0
				}
				if msg == wmDestroy {
					procPostQuit.Call(0)
					return 0
				}
				r, _, _ := procDefWindowPrc.Call(hwnd, msg, wp, lp)
				return r
			})
			brush, _, _ := procGetStockObj.Call(blackBrush)
			wc := wndClassEx{WndProc: wp, Background: brush, ClassName: name}
			wc.Size = uint32(unsafe.Sizeof(wc))
			procRegisterCls.Call(uintptr(unsafe.Pointer(&wc)))
		})
		hwnd, _, _ := procCreateWinEx.Call(wsExTopmost|wsExToolWindow|wsExNoActivate, uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(name)),
			wsPopup, uintptr(int32(m.X)), uintptr(int32(m.Y)), uintptr(int32(m.W)), uintptr(int32(m.H)), 0, 0, 0, 0)
		ready <- hwnd
		if hwnd == 0 {
			return
		}
		procShowWindow.Call(hwnd, swShowNoActiv)
		procSetWindowPos.Call(hwnd, hwndTopmost, uintptr(int32(m.X)), uintptr(int32(m.Y)), uintptr(int32(m.W)), uintptr(int32(m.H)), swpNoActivate)
		var msg winMsg
		for {
			r, _, _ := procGetMessage.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
			if int32(r) <= 0 {
				return
			}
			procDispatchMsg.Call(uintptr(unsafe.Pointer(&msg)))
		}
	}()
	hwnd := <-ready
	if hwnd == 0 {
		return errors.New("could not create the black window")
	}
	darkWins = append(darkWins, hwnd)
	darkEnds = append(darkEnds, end)
	return nil
}

func darkOff() {
	darkMu.Lock()
	defer darkMu.Unlock()
	for _, w := range darkWins {
		procPostMessage.Call(w, wmClose, 0, 0)
	}
	for _, e := range darkEnds {
		<-e
	}
	darkWins, darkEnds = nil, nil
}
