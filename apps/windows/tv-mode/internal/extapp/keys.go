package extapp

// Windows virtual-key codes for the remote's key names.
const (
	vkBack   = 0x08
	vkReturn = 0x0D
	vkEscape = 0x1B
	vkSpace  = 0x20
	vkF      = 0x46
	vkLeft   = 0x25
	vkUp     = 0x26
	vkRight  = 0x27
	vkDown   = 0x28
	vkMenu   = 0x12
	vkTab    = 0x09
	vkShift  = 0x10
	vkF11    = 0x7A

	vkMediaPlayPause = 0xB3

	vkBrowserBack = 0xA6
)

// KeyFor maps a remote key name to a virtual key. ext is true for the
// extended keys (arrows), which SendInput must flag.
func KeyFor(name string) (vk uint16, ext bool, ok bool) {
	switch name {
	case "up":
		return vkUp, true, true
	case "down":
		return vkDown, true, true
	case "left":
		return vkLeft, true, true
	case "right":
		return vkRight, true, true
	case "ok", "enter":
		return vkReturn, false, true
	case "escape":
		return vkEscape, false, true
	case "playpause": // the media key reaches Netflix's player whatever button has focus
		return vkMediaPlayPause, true, true
	case "space":
		return vkSpace, false, true
	case "f": // the web players' own full-screen key (Prime, Hotstar), for when their button cannot be found
		return vkF, false, true
	case "backspace":
		return vkBack, false, true
	case "fullscreen": // the Chrome window itself, when its borders came back
		return vkF11, false, true
	}
	return 0, false, false
}

// SeekPresses turns a seek in seconds into arrow presses (Netflix seeks 10 s a press).
func SeekPresses(sec float64) (name string, n int) {
	n = int(sec / 10)
	name = "right"
	if n < 0 {
		n, name = -n, "left"
	}
	if n == 0 {
		n = 1
	}
	return
}
