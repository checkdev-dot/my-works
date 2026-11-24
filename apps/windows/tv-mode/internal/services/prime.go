package services

// Prime Video web: best guess, needs Dev's check. Arrow keys move through
// carousels; Enter opens; Space toggles play/pause; Left/Right seek 10 s in
// the player. Back in browse uses browser history (Alt+Left).
var Prime = &Service{
	ID: "prime", Name: "Prime Video", External: true, // Chrome (Edge fails Prime with a DRM error); set false to go back to Edge
	URL: "https://www.primevideo.com",
	Nav: map[string][]Key{
		"up": {Up}, "down": {Down}, "left": {Left}, "right": {Right},
		"ok": {Enter}, "back": {AltLeft},
	},
	PlayPause: []Key{Space},
	SeekKeys:  arrowSeek(10),
}
