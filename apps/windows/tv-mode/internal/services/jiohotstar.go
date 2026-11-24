package services

// JioHotstar web: best guess, needs Dev's check. Arrow keys and Enter for
// browse, Space for play/pause, Left/Right seek 10 s in the player. Back uses
// browser history (Alt+Left) because Esc only leaves fullscreen there.
var JioHotstar = &Service{
	ID: "jiohotstar", Name: "JioHotstar", External: true, // Chrome with the helper; set false to go back to Edge
	URL: "https://www.hotstar.com/in",
	Nav: map[string][]Key{
		"up": {Up}, "down": {Down}, "left": {Left}, "right": {Right},
		"ok": {Enter}, "back": {AltLeft},
	},
	PlayPause: []Key{Space},
	SeekKeys:  arrowSeek(10),
}
