package services

import "fmt"

// Netflix web UI notes (best knowledge, needs Dev's check once signed in):
//   - Browse screens respond to Tab / Shift+Tab focus moves and arrow keys in
//     rows. We send arrows for the d-pad and rely on Netflix's own handling.
//   - Player: Space play/pause, Left/Right seek 10 s, F fullscreen, Esc back
//     out of the player to browse.
//   - Setting video.currentTime directly breaks the player (error M7375), so
//     seek and scrub go through Netflix's own session API, with arrow keys as
//     the fallback if that API is missing.
var Netflix = &Service{
	ID: "netflix", Name: "Netflix", External: true,
	URL: "https://www.netflix.com/browse",
	Nav: map[string][]Key{
		"up": {Up}, "down": {Down}, "left": {Left}, "right": {Right},
		"ok": {Enter}, "back": {Escape},
	},
	PlayPause:   []Key{Space},
	SeekKeys:    arrowSeek(10),
	NoVideoSeek: true,
	SeekJS: func(sec float64) string {
		return fmt.Sprintf(`(function(){try{var p=netflix.appContext.state.playerApp.getAPI().videoPlayer;var id=p.getAllPlayerSessionIds()[0];var pl=p.getVideoPlayerBySessionId(id);pl.seek(Math.max(0,pl.getCurrentTime()+(%v)*1000));return true;}catch(e){return false;}})()`, sec)
	},
	ScrubJS: func(frac float64) string {
		return fmt.Sprintf(`(function(){try{var p=netflix.appContext.state.playerApp.getAPI().videoPlayer;var id=p.getAllPlayerSessionIds()[0];var pl=p.getVideoPlayerBySessionId(id);pl.seek(pl.getDuration()*(%v));return true;}catch(e){return false;}})()`, frac)
	},
}
