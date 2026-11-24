package services

// YouTube TV (youtube.com/tv) is built for a TV remote: arrows move focus,
// Enter selects, Escape goes back, Left/Right seek in the player. It only
// loads with a smart-TV user agent, which the edge package applies
// (TVUserAgent) before navigating. If it fails to load, the caller can fall
// back to FallbackURL with normal YouTube shortcuts (k play/pause).
var YouTube = &Service{
	ID: "youtube", Name: "YouTube",
	URL:         "https://www.youtube.com/tv",
	FallbackURL: "https://www.youtube.com",
	TVUserAgent: true,
	Nav: map[string][]Key{
		"up": {Up}, "down": {Down}, "left": {Left}, "right": {Right},
		"ok": {Enter}, "back": {Escape},
	},
	PlayPause: []Key{KeyK},
	SeekJS:    JSYTSeek, // the player itself (ytlr); arrows are the fallback
	SeekKeys:  arrowSeek(5),
}
