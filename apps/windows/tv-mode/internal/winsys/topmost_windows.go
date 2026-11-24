package winsys

// SetTopmost keeps a window above the taskbar (or lets it go), without moving, sizing or
// activating it. 2026-11-13: the TV's full-screen window showed the Windows taskbar over its
// bottom edge whenever Dev's keyboard was on the desk screen, because Windows only hides the
// taskbar for a full-screen window that is in front.
func SetTopmost(h uintptr, on bool) {
	if h == 0 {
		return
	}
	const swpNoSize, swpNoMove = 0x0001, 0x0002
	after := ^uintptr(1) // HWND_NOTOPMOST (-2)
	if on {
		after = hwndTopmost
	}
	procSetWindowPos.Call(h, after, 0, 0, 0, 0, swpNoSize|swpNoMove|swpNoActivate)
}
