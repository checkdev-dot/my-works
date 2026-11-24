// Package services holds the tiny per-service key maps and media scripts.
package services

import "fmt"

// Key is one keyboard key as CDP Input.dispatchKeyEvent wants it.
type Key struct {
	Key  string // DOM key, e.g. "ArrowUp"
	Code string // DOM code
	VK   int64  // windowsVirtualKeyCode
	Text string // text produced (Enter "\r", Space " ")
	Mods int64  // 1 alt, 2 ctrl, 4 meta, 8 shift
}

var (
	Up        = Key{"ArrowUp", "ArrowUp", 38, "", 0}
	Down      = Key{"ArrowDown", "ArrowDown", 40, "", 0}
	Left      = Key{"ArrowLeft", "ArrowLeft", 37, "", 0}
	Right     = Key{"ArrowRight", "ArrowRight", 39, "", 0}
	Enter     = Key{"Enter", "Enter", 13, "\r", 0}
	Escape    = Key{"Escape", "Escape", 27, "", 0}
	Backspace = Key{"Backspace", "Backspace", 8, "", 0}
	Space     = Key{" ", "Space", 32, " ", 0}
	Tab       = Key{"Tab", "Tab", 9, "", 0}
	ShiftTab  = Key{"Tab", "Tab", 9, "", 8}
	AltLeft   = Key{"ArrowLeft", "ArrowLeft", 37, "", 1} // browser Back
	KeyF      = Key{"f", "KeyF", 70, "f", 0}
	KeyK      = Key{"k", "KeyK", 75, "k", 0}
)

// Service describes one of the four services.
type Service struct {
	ID, Name, URL string
	FallbackURL   string
	TVUserAgent   bool // youtube only: apply the smart-TV UA before navigating
	// External: opens in Chrome as an --app window driven by SendInput (Netflix
	// refuses any Edge that has a debug port). See internal/extapp.
	External bool

	// Nav maps remote keys (up down left right ok back) to a key sequence.
	Nav map[string][]Key
	// PlayPause is the keyboard fallback for play/pause.
	PlayPause []Key
	// SeekKeys returns the keyboard fallback for a relative seek.
	SeekKeys func(sec float64) []Key
	// SeekJS / ScrubJS optionally replace the generic <video> scripts
	// (Netflix refuses direct currentTime writes).
	SeekJS  func(sec float64) string
	ScrubJS func(frac float64) string
	// NoVideoSeek is true when writing video.currentTime is known to break.
	NoVideoSeek bool
}

// Apps is the launcher order (index 0..3), matching PROTOCOL.md.
var Apps = []*Service{JioHotstar, Prime, Netflix, YouTube}

// ByID returns a service or nil.
func ByID(id string) *Service {
	for _, s := range Apps {
		if s.ID == id {
			return s
		}
	}
	return nil
}

// Default is used on the launcher page and for unknown pages.
var Default = &Service{
	ID:   "launcher",
	Name: "Launcher",
	Nav: map[string][]Key{
		"up": {Up}, "down": {Down}, "left": {Left}, "right": {Right},
		"ok": {Enter}, "back": {Escape},
	},
	PlayPause: []Key{Space},
}

func repeatKey(k Key, n int) []Key {
	out := make([]Key, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, k)
	}
	return out
}

// arrowSeek turns seconds into arrow presses given the service's step.
func arrowSeek(step float64) func(sec float64) []Key {
	return func(sec float64) []Key {
		n := int(sec / step)
		k := Right
		if n < 0 {
			n, k = -n, Left
		}
		if n == 0 {
			n = 1
		}
		return repeatKey(k, n)
	}
}

// --- page scripts (run through Runtime.evaluate in the page's main world) ---

// videoPick selects the main <video>: the largest on screen.
const videoPick = `(function(){var vs=[].slice.call(document.querySelectorAll('video'));var v=null,a=-1;
vs.forEach(function(x){var r=x.getBoundingClientRect();var s=r.width*r.height;if(s>a){a=s;v=x;}});return v;})()`

// JSSubtitles opens the player's subtitles and audio menu (or, on YouTube, turns captions
// on and off): it wakes the controls with a mouse move over the video, then presses the
// button whose label names subtitles, captions or audio. Evaluates to "ok" or "none".
const JSSubtitles = `(function(){var v=document.querySelector("video");if(v){var r=v.getBoundingClientRect();var o={bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height*0.8};v.dispatchEvent(new MouseEvent("mousemove",o));document.dispatchEvent(new MouseEvent("mousemove",o));}
var pick=null,best=0;[].slice.call(document.querySelectorAll("button,[role=button],[data-uia]")).forEach(function(b){var l=(b.getAttribute("aria-label")||b.getAttribute("title")||b.getAttribute("data-uia")||b.innerText||"").replace(/\s+/g," ").trim();if(!l||l.length>60)return;
var sc=/audio.{0,6}subtitle|subtitle.{0,6}audio|control-audio-subtitle/i.test(l)?3:/subtitle|caption/i.test(l)?2:/^audio|language/i.test(l)?1:0;if(sc>best){best=sc;pick=b}});
if(!pick)return "none";pick.click();return "ok"})()`

// JSYTCaptions turns YouTube's captions on or off through the player itself. YouTube TV
// (ytlr) has no toggleSubtitles and no captions button in the page: load the captions
// module, wait for its track list, and set a track (English first) or clear it.
// Evaluates (as a promise) to "on", "off", "nocaps" (the video has none) or "none".
const JSYTCaptions = `(async function(){var p=document.getElementById("movie_player")||document.querySelector(".html5-video-player");
if(!p||typeof p.getOption!=="function")return document.querySelector("video")?"nocaps":"none";
function cur(){try{var t=p.getOption("captions","track");return t&&t.languageCode?t:null}catch(e){return null}}
if(cur()){try{p.setOption("captions","track",{});if(p.unloadModule)p.unloadModule("captions")}catch(e){}return "off"}
try{p.loadModule("captions")}catch(e){}
var l=[];for(var i=0;i<12;i++){try{l=p.getOption("captions","tracklist",{includeAsr:true})||p.getOption("captions","tracklist")||[]}catch(e){l=[]}if(l.length)break;await new Promise(function(r){setTimeout(r,150)})}
if(!l.length)return "nocaps";
var pick=l.filter(function(t){return /^en/.test(t.languageCode||"")&&t.kind!=="asr"})[0]||l.filter(function(t){return /^en/.test(t.languageCode||"")})[0]||l[0];
try{p.setOption("captions","track",pick);return "on"}catch(e){return "nocaps"}})()`

// JSYTPlayPause plays or pauses through YouTube's player (ytlr resumes a <video>
// paused behind its back). Evaluates to true when a player answered.
const JSYTPlayPause = `(function(){var p=document.getElementById("movie_player")||document.querySelector(".html5-video-player");
if(!p||typeof p.getPlayerState!=="function")return false;if(p.getPlayerState()===1)p.pauseVideo();else p.playVideo();return true})()`

// JSYTSeek moves by sec seconds through YouTube's player.
func JSYTSeek(sec float64) string {
	return fmt.Sprintf(`(function(){var p=document.getElementById("movie_player")||document.querySelector(".html5-video-player");
if(!p||typeof p.seekTo!=="function")return false;var t=p.getCurrentTime()+(%g);if(t<0)t=0;p.seekTo(t,true);return true})()`, sec)
}

// JSSkip presses the player's own Skip intro, Skip recap or Next episode button.
const JSSkip = `(function(){var v=document.querySelector("video");if(v){var r=v.getBoundingClientRect();v.dispatchEvent(new MouseEvent("mousemove",{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height*0.8}));}
var pick=null,best=0;[].slice.call(document.querySelectorAll("button,[role=button],a,[data-uia]")).forEach(function(b){var q=b.getBoundingClientRect();if(!q.width||!q.height)return;var l=(b.getAttribute("aria-label")||b.innerText||b.getAttribute("data-uia")||"").replace(/\s+/g," ").trim();if(!l||l.length>40)return;
var sc=/skip.{0,3}(intro|recap|credits|ad)|player-skip/i.test(l)?3:/next.{0,3}episode|next-episode|watch next/i.test(l)?2:/^skip$/i.test(l)?1:0;if(sc>best){best=sc;pick=b}});
if(!pick)return "none";pick.click();return "ok"})()`

// JSPlayPause toggles play/pause; evaluates to true when a video was found.
func JSPlayPause() string {
	return `(function(){var v=` + videoPick + `;if(!v)return false;if(v.paused){var p=v.play();if(p&&p.catch)p.catch(function(){});}else v.pause();return true;})()`
}

// JSSeek seeks the main video by sec seconds; true when handled.
func JSSeek(sec float64) string {
	return fmt.Sprintf(`(function(){var v=`+videoPick+`;if(!v||!isFinite(v.duration))return false;v.currentTime=Math.max(0,Math.min(v.duration,v.currentTime+(%v)));return true;})()`, sec)
}

// JSScrub seeks to a fraction of the duration; true when handled.
func JSScrub(frac float64) string {
	return fmt.Sprintf(`(function(){var v=`+videoPick+`;if(!v||!isFinite(v.duration))return false;v.currentTime=v.duration*(%v);return true;})()`, frac)
}

// JSMediaState reads the main video, same shape as __tv.mediaState().
const JSMediaState = `(function(){var v=` + videoPick + `;
if(!v||!isFinite(v.duration)||v.duration<=0)return null;return {playing:!v.paused&&!v.ended,pos:Math.floor(v.currentTime),dur:Math.floor(v.duration)};})()`

// BackSel is each service's own "back" control in its player, best guesses
// (Dev to check once signed in). When none is on the page, history.back() is
// used. Kept here so the key maps stay small.
func backSel(id string) string {
	switch id {
	case "netflix":
		return `[data-uia="player-back-to-browse"],[data-uia="control-back"],button[aria-label="Back to Browse"]`
	case "prime":
		return `.atvwebplayersdk-back-button,button[aria-label="Back"],[class*="back-button"]`
	case "jiohotstar":
		return `button[aria-label="Back"],[data-testid="back-button"]`
	}
	return ""
}

// JSExitFullscreen leaves HTML fullscreen (the page's, not the browser
// window's own kiosk fullscreen); true when it was in it.
const JSExitFullscreen = `(function(){try{if(document.fullscreenElement){document.exitFullscreen();return true;}}catch(e){}return false;})()`

// JSBackNav goes back from a player or a browse page: the service's own back
// control if it has one on screen, else history.back(). Evaluates to "ctl",
// "hist" or "none".
func JSBackNav(id string) string {
	sel := fmt.Sprintf("%q", backSel(id))
	return `(function(sel){try{var b=sel&&document.querySelector(sel);if(b){b.click();return "ctl";}}catch(e){}
if(history.length>1){history.back();return "hist";}return "none";})(` + sel + `)`
}

// JSMainPlayer says whether this page is showing a main player (not a browse
// page with an autoplaying trailer): a video of real duration that is
// fullscreen, or on a watch-style URL, or covers most of the viewport and is
// long and not looping. Netflix and Prime browse pages play muted looping
// trailers; those must not take OK.
const JSMainPlayer = `(function(){var vs=[].slice.call(document.querySelectorAll('video'));var v=null,a=-1;
vs.forEach(function(x){var r=x.getBoundingClientRect();var s=r.width*r.height;if(s>a){a=s;v=x;}});
if(!v||!isFinite(v.duration)||v.duration<=0)return false;
if(document.fullscreenElement)return true;
if(/\/watch|\/play|\/player|\/video\/|#\/watch|\/live\//.test(location.pathname+location.hash))return true;
var cover=a/(innerWidth*innerHeight);
return cover>=0.7&&v.duration>=300&&!v.loop;})()`

// JSFocus tells where keyboard focus is: "body" (nothing), "input" (a text
// field, where arrows must stay native), or "el", plus a player flag.
const JSFocus = `(function(){var a=document.activeElement;
var k=(!a||a===document.body||a===document.documentElement)?"body":(/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)||a.isContentEditable)?"input":"el";
var sig="";try{if(k==="el"){sig=window.__tv&&window.__tv.activeId?String(window.__tv.activeId()):a.tagName;}}catch(e){}
return {k:k,sig:sig,ring:!!(window.__tv&&window.__tv.navActive&&window.__tv.navActive()),player:` + JSMainPlayer + `};})()`

// JSWatch reads what a service page shows about what is playing: the tab and
// og titles, the og image, Prime's player title and subtitle, and the main
// video (largest on screen) with its time. One evaluation per poll.
const JSWatch = `(function(){function q(s){var e=document.querySelector(s);return e?(e.textContent||'').trim():''}
function meta(p){var m=document.querySelector('meta[property="'+p+'"]');return m&&m.content?m.content:''}
var vs=[].slice.call(document.querySelectorAll('video'));var v=null,a=-1;
vs.forEach(function(x){var r=x.getBoundingClientRect();var s=r.width*r.height;if(s>a){a=s;v=x;}});
var ok=v&&isFinite(v.duration)&&v.duration>0;
return {href:location.href,title:document.title,ogt:meta('og:title'),ogi:meta('og:image'),
pt:q('.atvwebplayersdk-title-text'),ps:q('.atvwebplayersdk-subtitle-text'),h1:q('h1'),
has:!!ok,playing:!!ok&&!v.paused&&!v.ended,pos:ok?Math.floor(v.currentTime):0,dur:ok?Math.floor(v.duration):0,loop:!!(v&&v.loop)};})()`
